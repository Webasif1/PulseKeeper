# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Day-to-day build notes and the reasoning behind each phase live in [DEVLOG.md](DEVLOG.md).

## [Unreleased]

### Added

- Monitoring engine: scheduled sweeps via node-cron with per-site intervals, bounded concurrency,
  request timeouts, response-time measurement, and error classification; incidents that open only
  after a site's configured number of consecutive failures and resolve on recovery with a recorded
  duration; in-app notifications behind a channel interface ready for email, Slack, Discord,
  Telegram, and webhooks; a persisted monitoring run log; and a daily retention job honouring each
  user's window. Documented in `docs/MONITORING.md`.
- `POST /api/monitor/run` for external cron services, authenticated by a constant-time
  shared-secret comparison, and `POST /api/sites/:id/check` for manual checks.
- SSRF protection on every user-supplied URL: an http/https allowlist, internal hostname rules,
  address classification that permits only public unicast addresses, unwrapping of IPv4-mapped
  IPv6 and numeric address encodings, per-hop redirect revalidation, and a connect-time DNS hook
  that closes DNS rebinding. Documented in `docs/SECURITY-SSRF.md`.
- Site management: create, read, update, and delete, all scoped to the authenticated user, with
  search by name, URL, or tag, status and tag filters, sorting, pagination, pause/resume, and a
  cascade that removes a deleted site's health checks, incidents, and notifications.
- Data model: `User`, `Site`, `HealthCheck`, `Incident`, `Notification`, `Settings`, and
  `MonitorRun` schemas with the indexes the dashboard, scheduler, and analytics queries depend on,
  including a partial unique index that permits only one active incident per site.
- Authentication: registration, login, logout, and current-user endpoints; bcrypt hashing in a
  model hook; JWT with pinned algorithm, issuer, and audience, delivered as an HTTP-only cookie
  with a bearer-token fallback for non-browser clients; `requireAuth` middleware; Zod request
  validation.
- Backend foundation: Express 5 + TypeScript API with Zod-validated environment configuration,
  MongoDB connection handling, pino structured logging, the shared success/error response
  envelope, typed application errors, request tracing via `x-request-id`, rate limiting, Helmet,
  a CORS origin allowlist, graceful shutdown, and `GET /api/health` plus `/api/health/ready`.
- Repository scaffold: npm workspaces root, Docker-based local MongoDB, `.gitignore`,
  `.editorconfig`, `.nvmrc`.
- Project documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVLOG.md`, this changelog,
  and the original product specification preserved at `docs/SPEC.md`.
- Open-source files: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- GitHub automation: CI workflow (typecheck, lint, test, build), Dependabot, issue forms, and a
  pull request template.

[Unreleased]: https://github.com/Webasif1/PulseKeeper/commits/main
