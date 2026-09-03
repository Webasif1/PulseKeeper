# Development Log

A running journal of how PulseKeeper is being built: what landed in each phase, the decisions
behind it, and anything deferred. Newest entries at the top.

For released versions see [CHANGELOG.md](CHANGELOG.md). For the original product specification
see [SPEC.md](SPEC.md).

---

## Phase 6 — Frontend foundation

**Date:** 2026-09-03 · **Branch:** `feat/client-foundation`

### What landed

- Vite 7 + React 19 + TypeScript + Tailwind 4 workspace, with ESLint, Vitest, and jsdom.
- A design system in `index.css`: brand and status palettes in OKLCH, semantic surface tokens, and
  a class-based dark theme.
- `services/api.ts` — one axios instance that unwraps the response envelope, normalises every
  failure into `ApiError`, and announces expired sessions.
- Contexts for auth, theme, and toasts, each behind a hook that throws if used outside its
  provider.
- UI primitives: Button, Input, Select, Textarea, Switch, Card, Badge, Modal, Dropdown, Tooltip,
  Skeleton, Spinner, EmptyState, ErrorState, Toaster, StatusBadge.
- `AppShell` with a desktop rail and a mobile slide-over, `Header`, `Sidebar`, `ThemeToggle`,
  `ProtectedRoute`, and the login and register pages.
- 33 client tests (295 across both workspaces).

### Decisions

- **The brand colour is indigo, deliberately not green.** Green, amber, and red mean something
  here — up, slow, down. A green primary button would look like a status, which is the one
  confusion a monitoring dashboard cannot afford.
- **The theme class is applied by an inline script in `index.html`,** before React mounts. Reading
  the stored preference in a `useEffect` renders the default palette for one frame and flashes the
  wrong colours on every load.
- **"System" is a live preference, not a one-time reading.** The provider listens for changes, so
  a machine switching to dark at sunset takes the dashboard with it.
- **No token is ever held in JavaScript.** The cookie is HTTP-only and the auth context stores only
  the user object, which is what stops an XSS bug from exfiltrating a session.
- **A 401 from `/auth/me`, `/auth/login`, or `/auth/register` does not signal an expired session.**
  There, 401 is the answer to the question asked. Treating it as expiry would fire a
  session-expired event on every visit by a signed-out user.
- **The API layer announces expiry through a window event** rather than calling into the auth
  context, which imports it — a direct call would be a cycle.
- **`ProtectedRoute` renders a spinner while the session check is in flight** instead of
  redirecting, which would bounce a signed-in user to the login page on every refresh.
- **Status is always icon + label + colour** (SPEC §32), with a test per status asserting the text
  is present. Roughly one man in twelve has a colour vision deficiency, and red/green is the common
  form — exactly the two colours this product leans on hardest.
- **Only `OFFLINE` pulses.** Animating every state would make the dashboard restless and rob the
  one urgent case of its urgency.
- **The modal, dropdown, and tooltip are hand-written.** What they need is small and specific —
  Escape to close, focus trapped and restored, `aria-describedby`, opening on focus as well as
  hover — and a component library would have been a large dependency for it.
- **`Select` is a native `<select>`.** A custom listbox would need keyboard, focus, and
  screen-reader work to match what the platform already does, and the native control is better on
  mobile.
- **No dev proxy.** The client calls the API on its own origin with credentials, so CORS and the
  cookie policy behave in development exactly as in production. A proxy would hide misconfiguration
  in both until deploy day.
- **Placeholder pages for later phases**, so every navigation link routes somewhere real from the
  first commit.

### Fixed during verification

- **Two copies of Vite.** The client pinned `^6.2.2` while `@tailwindcss/vite` and
  `@vitejs/plugin-react` both resolved Vite 7 from the workspace root, so the plugin array failed
  to typecheck against a different `Plugin` type. Aligned the client on Vite 7; one copy now.
- **`defineConfig` came from the wrong package.** Vite's own does not accept a `test` block; the
  one from `vitest/config` is the same function widened, which keeps a single config file.
- **Tests were leaking DOM into each other.** Testing Library registers its automatic cleanup only
  when Vitest globals are enabled, and they are not here, so a second `render` found buttons from
  the first. `cleanup()` now runs in the shared setup.

### Verified

`typecheck`, `lint`, `build` clean; 295 tests passing (262 server, 33 client). Production build is
264 kB of JavaScript, 86 kB gzipped, with React and Recharts split into their own chunks. Both
servers run together: the client serves on 5173, a CORS preflight from that origin returns 204, and
signing in as the demo account returns `Access-Control-Allow-Origin: http://localhost:5173`,
`Access-Control-Allow-Credentials: true`, and an `HttpOnly; SameSite=Lax` cookie.

### Note on environment

Port 5050 was still held by a dev server left running from an earlier phase, so the API logged
`Port is already in use` on startup. Killed the stale process rather than moving the port.

---

## Phase 5 — Analytics and the remaining endpoints

**Date:** 2026-09-03 · **Branch:** `feat/analytics-api`

### What landed

- `analytics.service.ts` — uptime across four windows, response-time series, status distribution,
  downtime, per-site statistics, dashboard totals, and account-wide rankings.
- Read services for incidents and notifications, kept apart from the write side, plus settings.
- Endpoints: `/dashboard/stats`, `/dashboard/analytics`, `/sites/:id/analytics`,
  `/sites/:id/health`, `/incidents`, `/incidents/:id`, `/notifications` (+ read, read-all),
  `/settings`, `/monitor/runs`.
- `scripts/seed.ts` — five demo sites with a month of history (SPEC §39).
- `docs/API.md` — the full API reference.
- 40 new tests (262 total).

### Decisions

- **Aggregate in MongoDB, not in Node.** These queries span tens of thousands of checks; reducing
  them in the process would scale with history rather than with the answer.
- **All four uptime windows come from one `$facet`.** Four separate queries would each re-scan the
  index; the widest window bounds a single pass and each facet narrows from there.
- **Series are downsampled server-side** to roughly 60–120 points per range, via `$dateTrunc` with
  a per-range bin size. A 90-day chart would otherwise ship ~26,000 rows for the browser to throw
  away.
- **Response-time averages exclude failed checks.** A timeout has no duration; counting it as zero
  would drag the average down and hide real slowness. Verified by a test.
- **Empty statistics return `null`, not `0`.** `0` reads as "instant", which is a different and
  wrong claim.
- **Downtime is computed from incidents, not from failed-check counts.** Checks are samples;
  multiplying them by an interval would estimate what an incident already records exactly. Spans
  are clipped to the window so an outage that began earlier cannot report more downtime than the
  window contains.
- **Rankings are one grouped pass, sorted three ways in Node.** The result is one row per site, so
  sorting it in the process is cheaper than three more aggregations.
- **The notification list returns an unfiltered `unreadCount`.** The badge shows total unread
  regardless of the panel's filter, so the client never needs a second request.
- **A partial `notifications` settings object is merged via dotted paths**, not replaced — sending
  `{onSlow: true}` must not silently switch off `onDown` and `onUp`.
- **Site ownership is confirmed before any aggregation runs**, so an unauthorised id cannot be used
  to measure query timings.

### Fixed during verification

- **The demo seed produced zero incidents.** Failures were drawn independently at a realistic rate,
  which makes three consecutive failures — the incident threshold — essentially impossible. The
  demo's incidents page would have been empty, which is precisely what it exists to show. Outages
  are now modelled as clustered spans of 3–10 consecutive failed checks, as real outages behave;
  the seed produces 14 incidents across five sites.
- **The live cron was overwriting the demo data.** Within a minute of seeding, four of five demo
  sites showed `OFFLINE` with a null response time. The cause was not the seed: demo hostnames sit
  under `example.com`, which RFC 2606 reserves and which therefore cannot resolve, so every sweep
  failed them with a DNS error and replaced the seeded history. `findDueSites` now excludes
  `isDemo` sites — they are illustrations, not real targets — with a test to hold it.
- **The demo's final state was left to chance**, which meant every site tended to end green and the
  dashboard demonstrated nothing. Each site now declares the state it should be left in; the tail
  of its generated history is rewritten to match. The result is 2 online, 1 slow, 1 offline, 1
  paused, with one active incident and unread notifications.

### Verified

`typecheck`, `lint`, `build` clean; 262 tests passing. Live against the seeded demo account:
dashboard returned `{sites: 5, online: 2, slow: 1, offline: 1, paused: 1}` with 1 active incident;
account analytics over 30 days reduced 14,404 checks to 121 chart points and ranked Portfolio most
reliable (99.83%), API Server slowest (1,700ms), and Movie Spark most failing (78); site analytics
for Movie Spark returned 97.62% uptime over 7 days against 94.79% over 24 hours — different
windows genuinely producing different answers. Demo statuses were still intact after the cron had
been running for several minutes.

---

## Phase 4 — Monitoring engine

**Date:** 2026-09-03 · **Branch:** `feat/monitoring-engine`

### What landed

- `healthCheck.service.ts` — a single guarded check: timeout, timing, error classification, manual
  redirect following, status decision.
- `incident.service.ts` — consecutive-failure thresholds, incident open and resolve, duration.
- `notification.service.ts` — in-app notifications behind a `NotificationChannel` interface, with
  user preferences honoured.
- `monitoring.service.ts` — due-site selection, bounded concurrency, per-site containment, cached
  status updates, rolling uptime, and the run summary.
- `jobs/` — `monitoringJob` (node-cron sweep) and `cleanupJob` (per-user retention), started from
  `server.ts` and stopped on shutdown.
- `POST /api/monitor/run` behind a constant-time shared-secret check, and
  `POST /api/sites/:id/check` for "Check Now".
- `docs/MONITORING.md`.
- 69 new tests (223 total).

### Decisions

- **`node:http` rather than `fetch`.** Two things `fetch` cannot do: accept a custom `lookup` (the
  hook the SSRF guard needs to validate the address the socket actually connects to) and let
  redirects be intercepted per hop. Both are requirements, not preferences.
- **Timing stops at response headers, and the body is discarded unread.** Downloading it would
  measure the monitoring server's bandwidth instead of the site's responsiveness, and would score
  a large page worse than a slow one. Redirect hops are summed, since reporting only the final hop
  would hide the true cost of reaching the site.
- **`BLOCKED_URL` added to the error types in SPEC §9.** When a hostname's DNS record changes to
  point somewhere private, the check is neither a connection error nor an HTTP error; recording it
  as either would mislead whoever reads the timeline.
- **A response exactly at the slow threshold is `ONLINE`.** "Slow" means over the line, not on it.
- **One cron schedule, not one per site.** The sweep asks which sites are due using a
  field-relative comparison, so every interval is served by a single schedule and no site change
  touches the scheduler. Due sites are ordered oldest-first so a backlog drains fairly.
- **Overlapping sweeps are skipped**, not queued: a sweep slower than the tick would otherwise
  double the outbound requests.
- **Recovery is immediate — one success resolves an incident.** Requiring several would inflate
  reported downtime, and the timeline already shows a flapping site for what it is.
- **A duplicate-key error when opening an incident is an expected outcome, not a failure.** The
  partial unique index is what prevents a manual check racing the cron sweep from opening two
  incidents for one outage; the loser reuses the winner's incident.
- **A notification channel's failure is logged, never propagated.** A broken integration must not
  fail a monitoring sweep.
- **`runWithConcurrency` instead of `p-limit`.** Twelve lines, it is all the sweep needs, and an
  open-source project is better served by one fewer package in its tree.
- **The monitor trigger uses `timingSafeEqual`**, with the length check separated so a mismatch
  cannot be distinguished by timing. If no secret is configured the route refuses everything
  rather than standing open.
- **"Check Now" works on a paused site.** Pausing stops the schedule, not the button; an explicit
  request is a deliberate act.
- **The health-check tests mock the guard; one test deliberately does not.** Mocking lets the
  suite run against a loopback server. The final test reaches past the mock to the real guard and
  asserts loopback is refused, so a regression that removed the check could not pass unnoticed.
  There is no bypass flag in production code.

### Fixed during verification

- **Idle cron ticks were writing an empty row every minute.** Visible immediately in the live run
  log: four `checked: 0` records among six. That is roughly 1,400 empty rows a day, which would
  bury the runs that actually did something and make the monitoring log page useless. Sweeps that
  find nothing due are no longer persisted — unless a person triggered them, since whoever pressed
  the button is entitled to see that it ran.

### Verified

`typecheck`, `lint`, `build` clean; 223 tests passing. End-to-end against the real network with
cron running:

- `https://example.com` checked `ONLINE` in 48ms; a deliberately broken path returned `OFFLINE`
  with `HTTP 404`.
- The external trigger returned `{"checked":2,"online":1,"offline":1,"errors":0}` with the correct
  secret and `401` with a wrong one.
- At the second consecutive failure (threshold 2) an incident opened with reason
  `Server returned HTTP 404`; repointing the site at a working URL and rechecking resolved it with
  `durationSeconds: 122`.
- Notifications recorded `SITE_DOWN` then `SITE_UP` — "Recovered after 2 minutes".
- The in-process cron ran unattended on its own schedule throughout.

---

## Phase 3 — Site CRUD and SSRF protection

**Date:** 2026-09-03 · **Branch:** `feat/sites-crud-ssrf`

### What landed

- `utils/urlGuard.ts` — the SSRF guard, and the most security-critical file in the project.
  Protocol allowlist, hostname rules, address classification, redirect revalidation, and a
  connect-time DNS hook.
- Sites CRUD scoped to the authenticated user: list with search, status filter, tag filter,
  sorting, and pagination; create; read; update; delete with cascade.
- `docs/SECURITY-SSRF.md` documenting what is blocked, how, and the limitations.
- 103 new tests (154 total), 60 of them against the guard alone.

### Decisions

- **The address policy is an allowlist, not a denylist.** An address is permitted only if
  `ipaddr.js` classifies it as public `unicast`; loopback, private, link-local, unique-local,
  carrier-grade NAT, multicast, broadcast, reserved, 6to4, and Teredo are all refused by falling
  outside that one category. A denylist of ranges needs updating whenever a new special-purpose
  range is assigned — this does not.
- **Addresses are parsed, never string-matched.** `127.0.0.1` is also `2130706433`, `0x7f000001`,
  `127.1`, and `::ffff:127.0.0.1`. Parsing catches every spelling; string comparison catches one.
  IPv4-mapped IPv6 addresses are unwrapped before judgement.
- **The guard runs three times, at three different moments.** On write, at check time, and inside
  the socket's own DNS lookup via `createGuardedLookup`. Only the third closes DNS rebinding:
  validating before a request leaves a window in which a one-second-TTL record can answer the
  validating lookup publicly and the socket's lookup with loopback. Checking the address the
  connection actually uses removes the window.
- **Every resolved address is checked, not just the first.** Otherwise a hostname answering with
  one public and one private address would pass or fail depending on resolver ordering, which the
  attacker controls.
- **Blocked addresses are logged but never returned to the client.** Echoing "10.0.4.17 is not
  allowed" turns the endpoint into an internal network mapper. The client is told only that the
  URL resolves to a private or reserved address.
- **Redirects are followed manually.** `fetch` follows them without asking, which would let a
  public first hop redirect to `169.254.169.254`. A relative `Location` is resolved against the
  URL that produced it, then revalidated.
- **Cross-tenant access returns 404, not 403.** A 403 would confirm the id exists; 404 is what a
  genuinely missing site returns, so the two are indistinguishable.
- **Site schemas are `.strict()`.** An attempt to pass `userId` in the body is rejected outright
  rather than silently dropped, which is both safer and a clearer error.
- **Search escapes regex metacharacters.** Without it, a search for `.*` would match every site;
  there is a test asserting it matches none.
- **URL validation is split.** The synchronous half runs in the Zod schema so the client gets a
  field-level message on `url`; the DNS half runs in the service, because Zod refinements are
  synchronous.
- **Only changed URLs are revalidated on update**, so renaming a site does not fail because a
  resolver was briefly unhappy.
- **Deleting a site cascades** to its health checks, incidents, and notifications. Orphans would
  otherwise skew every aggregate that counts them.

### Fixed during verification

- **The same resource had two shapes.** Live output showed `POST /api/sites` returning `id`,
  `_id`, `__v`, `userId`, and the `checkUrl` virtual, while `GET /api/sites` — which uses
  `.lean()`, dropping virtuals — returned `_id` and no `checkUrl`. A frontend would have had to
  handle both. All read paths now go through one `toPublicSite` serialiser: `id` only, `checkUrl`
  always present, `_id`/`__v`/`userId` never. Three tests assert create, get, and list return
  identical key sets.
- **`mongodb-memory-server` was still in `package.json`.** The install that added it was
  cancelled mid-flight in Phase 2 after the decision to test against real MongoDB, but npm had
  already written the manifest and it was committed. Removed.

### Verified

`typecheck`, `lint`, `build` clean; 154 tests passing. Live smoke against the running API with
real DNS: `https://example.com` stored successfully, while `http://localhost:8080`,
`http://169.254.169.254/latest/meta-data/`, `http://2130706433`, and `file:///etc/passwd` were
each refused with a field-level message and nothing written to the database.

### Note on environment

Docker Desktop was not running at the start of this phase, so the test helper's "start it with
`npm run db:up`" message appeared exactly as intended before the container was brought up.

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
