# Development Log

A running journal of how PulseKeeper is being built: what landed in each phase, the decisions
behind it, and anything deferred. Newest entries at the top.

For released versions see [CHANGELOG.md](CHANGELOG.md). For the original product specification
see [SPEC.md](SPEC.md).

---

## Phase 2 — Data model and authentication

**Date:** 2026-09-02 · **Branch:** `feat/auth`

### What landed

- Seven Mongoose models with their indexes: `User`, `Site`, `HealthCheck`, `Incident`,
  `Notification`, `Settings`, and `MonitorRun`.
- Shared domain vocabulary in `types/domain.ts` (site statuses, check error types, check sources,
  incident statuses, notification types, themes) and monitoring defaults and bounds in
  `constants/monitoring.ts`, so no threshold is written as a literal anywhere else.
- JWT signing and verification with pinned algorithm, issuer, and audience; cookie helpers;
  `requireAuth` accepting an HTTP-only cookie or a bearer token; a `validate` middleware driven by
  Zod schemas.
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`, with the auth and registration rate limiters applied.
- 42 new tests (52 total): the full auth flow, model defaults and constraints, and JWT hardening.

### Decisions

- **Password hashing is a model hook, not service code.** Any future path that writes a
  password — a reset flow, an admin tool, a seed script — is hashed by construction. Forgetting is
  not possible.
- **`password` is `select: false`.** A forgotten projection cannot leak a hash into a response.
  Login is the one place that opts back in with `.select('+password')`.
- **Login never distinguishes a wrong password from an unknown account.** Both return
  `Invalid email or password`, so the endpoint cannot enumerate registered addresses. Registration
  is necessarily direct about a duplicate email, since the account cannot be created either way.
- **The password ceiling is 72 characters** because bcrypt silently ignores input beyond 72 bytes.
  Accepting more would make part of a user's password meaningless.
- **`requireAuth` re-reads the user on every request** rather than trusting the token body, so a
  deleted account stops working immediately instead of at token expiry. There is a test for it.
- **JWT verification pins `algorithms: ['HS256']` plus issuer and audience.** That defeats the
  `alg: none` downgrade and cross-service token reuse; both are covered by tests.
- **`validate` writes to `req.validated`, not `req.body`/`req.query`.** Express 5 exposes
  `req.query` as a getter and assigning to it throws. The side effect is useful: a route that
  forgets validation cannot accidentally read coerced input.
- **One active incident per site is a database constraint**, not service logic — a partial unique
  index on `{ siteId }` filtered to `status: ACTIVE`. A manual check racing the cron sweep cannot
  open duplicates for the same outage.
- **`bcryptjs` rather than `bcrypt`.** The native package needs prebuilt binaries that do not
  exist for every Node and platform combination, and falls back to compiling with node-gyp. For an
  open-source project where `npm install` must simply work, a pure-JS implementation of the same
  algorithm is the better trade; the cost is roughly 100ms per hash at cost factor 12.
- **`Site` caches current status while `HealthCheck` keeps history.** The dashboard would
  otherwise run an aggregation per site on every poll. Uptime shown on detail pages is still
  computed from history.
- **`HealthCheck` denormalises `userId`** so user-scoped analytics never need a join to `sites`.
- **`MonitorRun` holds no `userId`.** It records aggregate counters only — never site names, URLs,
  or ids — so exposing it to any signed-in user reveals nothing about anyone else's sites. This is
  instance telemetry, closer to a server log than to user data.

### Decided against

- **`mongodb-memory-server` for tests.** Tests run against a real MongoDB instead: Docker locally,
  a service container in CI. Partial unique indexes, text indexes, and aggregation pipelines are
  exactly what this application depends on, and an approximation would let real bugs through. It
  also avoids a large binary download on every fresh environment. `npm test` therefore needs
  `npm run db:up` first, which CONTRIBUTING already tells contributors to run.

### Fixed during verification

- **`errors` is a reserved Mongoose path.** `MonitorRun.errors` triggered a reserved-key warning
  and would have shadowed the document's validation-error container. The field is stored as
  `errorCount`; the API serialises it back to `errors` to match SPEC §40.

### Verified

`typecheck`, `lint`, `build` clean; 52 tests passing against MongoDB 7. Live smoke test: register
returned 201 with an `HttpOnly; SameSite=Lax` cookie, `/me` resolved the user from that cookie and
401'd without it, a wrong password and an unknown account returned byte-identical responses, a
duplicate registration returned 409, and an invalid payload returned three field-level messages.

---

## Phase 1 — Backend foundation

**Date:** 2026-09-02 · **Branch:** `feat/server-foundation`

### What landed

- Express 5 + TypeScript workspace on ESM (`NodeNext`), with `tsx` for development, a separate
  `tsconfig.build.json` that excludes tests from the build, ESLint 9 flat config, and Vitest.
- `config/env.ts` — Zod-validated environment parsed once at import. Invalid configuration prints
  the offending variables and exits non-zero instead of failing later at an arbitrary request.
- `config/db.ts` — MongoDB connection with a 10s server-selection timeout, pooling, connection
  event logging, and helpers reporting the connection state.
- `utils/logger.ts` — pino, pretty in development and JSON elsewhere, with redaction covering
  cookies, authorization headers, passwords, tokens, and the three secrets.
- `utils/apiResponse.ts` — the SPEC §44 envelope plus pagination helpers.
  `utils/AppError.ts` — typed error codes and constructors. `utils/asyncHandler.ts`.
- Middleware: request logging with a traced `x-request-id`, a terminal error handler,
  a 404 handler, and four rate limiters (global, auth, register, manual check).
- `app.ts` / `server.ts` split, `GET /api/health` (liveness) and `/api/health/ready` (readiness),
  and graceful shutdown on SIGINT/SIGTERM with a 10s force-exit guard.
- Ten integration tests covering the envelope, tracing, CORS, helmet headers, and readiness.

### Decisions

- **The environment schema is the boot gate.** A production deployment cannot start with a
  missing `MONITOR_CRON_SECRET` or a `JWT_SECRET` still holding the example value, because
  `superRefine` rejects both. Misconfiguration surfaces at deploy time, not at 3am.
- **CORS uses an explicit allowlist, never a reflected origin.** Authentication is cookie-based,
  so reflecting the request origin would let any site drive the API as the signed-in user.
  Requests with no `Origin` (curl, external cron) are allowed — they carry no ambient cookie
  authority.
- **Liveness and readiness are separate endpoints.** Liveness stays 200 while MongoDB is
  unreachable so a platform health check does not recycle the container over a transient blip;
  readiness returns 503 so load balancers route around an instance that genuinely cannot serve.
- **Errors are normalised in one place.** Zod, Mongoose validation and cast errors, duplicate-key
  violations, and malformed JSON all become the same envelope. Unexpected errors are logged in
  full but reported generically, so stack traces and driver messages never reach a client.
- **`console.log` is a lint error.** Everything goes through the pino logger, which keeps
  redaction in a single place. `config/env.ts` is the sole exception, since it reports failures
  before the logger exists.
- **Rate limiters are skipped under `NODE_ENV=test`** so the suite can fire many requests without
  tripping limits it is not testing.

### Fixed during verification

- **Default port moved from 5000 to 5050.** Starting the server produced
  `EACCES ... listen 0.0.0.0:5000`; `netsh int ipv4 show excludedportrange` confirmed Windows
  reserves port 5000 in its Hyper-V excluded range. macOS binds the same port to the AirPlay
  receiver. Keeping 5000 would have made "clone and run" fail for a large share of contributors
  on both platforms.
- `mongoose.connection.readyState` can be `99` ("uninitialized"), which does not fit a
  four-element tuple; the state lookup is a `Record<number, string>` instead.

### Verified

`typecheck`, `lint`, `test` (10 passing), and `build` all clean. Live smoke test against the
Docker MongoDB: database connected, `/api/health` and `/api/health/ready` returned the success
envelope, an unknown route returned `NOT_FOUND`, a request from a non-allowlisted origin was
refused with 403, and responses carried `x-request-id`, `nosniff`, and `RateLimit` headers with
no `x-powered-by`.

### Deferred

- Authentication middleware and models arrive in Phase 2; the `JWT_*` variables are defined now
  so the configuration surface is documented in one pass.
- `docs/API.md` and `docs/CONFIGURATION.md` are written once there are endpoints beyond health.

---

## Phase 0 — Repository scaffold

**Date:** 2026-09-02 · **Branch:** `chore/repo-scaffold`

### What landed

- Moved the original `Readme.md` — which was the product specification, not a readme — to
  `docs/SPEC.md`, preserved verbatim as the reference for intended behavior.
- Wrote a real `README.md`: overview, features, stack, architecture diagram, folder structure,
  local setup, environment variables, deployment, security, known limitations, roadmap.
- Open-source scaffolding: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor
  Covenant 2.1), `SECURITY.md` with private vulnerability reporting.
- GitHub configuration: issue forms for bugs and features, issue-template config routing security
  reports away from public issues, pull request template, Dependabot, and a CI workflow running
  typecheck, lint, test, and build on every push and PR.
- Tooling: npm workspaces root (`server`, `client`), `docker-compose.yml` with `mongo:7`,
  `.gitignore`, `.editorconfig`, `.nvmrc`.
- Documentation skeleton: this devlog, `CHANGELOG.md`, and `ARCHITECTURE.md`.

### Decisions

- **Product name is PulseKeeper**, matching the repository. The specification called the product
  "Site Health Monitor"; that stays as the descriptive tagline.
- **npm workspaces, not two detached projects.** One `npm install`, one lockfile, one CI job, and
  a single `npm run dev` that starts both sides — significantly less friction for contributors.
- **Docker MongoDB for development, Atlas for production.** Contributors get a working database
  without creating an account; `MONGODB_URI` swaps to Atlas with no code change.
- **Docs live in `docs/`, not in the README.** The README stays scannable and links out to
  architecture, API, configuration, deployment, and SSRF detail.
- **Positioning follows SPEC §4.** The product is a monitoring platform; keep-alive is secondary
  and carries an explicit caveat that it cannot guarantee a provider will not sleep a service.
  This is stated in the README rather than buried.
- **CI is strict from the first commit.** Typecheck, lint, test, and build are all required, so
  the project cannot accumulate type or build debt.

### Deferred

- `server/` and `client/` exist only as minimal workspace manifests with no scripts yet. This was
  deliberate: `npm run <script> --workspaces` fails with `No workspaces found!` when the
  directories are absent, which would have made CI red on the very first commit. With the stubs in
  place, `--if-present` turns every root script into a clean no-op until the real workspaces land
  in Phases 1 and 6.
- `docs/API.md`, `CONFIGURATION.md`, `DEPLOYMENT.md`, `SECURITY-SSRF.md`, and `MONITORING.md` are
  written as their subjects are implemented, so they document real code rather than intentions.

### Notes

- `gh` is not installed on the development machine, so pull requests are opened from the GitHub
  compare URL printed after each branch push rather than from the CLI.
