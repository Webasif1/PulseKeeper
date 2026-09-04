# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Day-to-day build notes and the reasoning behind each phase live in [DEVLOG.md](DEVLOG.md).

## [Unreleased]

### Added

- TLS certificate expiry monitoring: expiry date, issuer, and days remaining are read from the
  handshake each https check already performs, shown on the site detail page, and warned about at
  30, 14, 7, and 1 days remaining — once per threshold, with the record cleared on renewal. An
  already-expired certificate is reported separately. Controlled by its own notification
  preference.
- Outbound notification delivery: Slack, Discord, generic webhook, and email channels,
  configurable per account from Settings with a test-send button. Every webhook URL passes the
  same SSRF guard as a health check, at creation, on change, and again at send time. Destinations
  are stored as secrets and never returned by the API. A channel is disabled automatically after
  repeated delivery failures rather than retried indefinitely. Email requires SMTP to be
  configured on the server and is hidden when it is not.

## [0.1.0] — 2026-09-04

First release. A complete, deployable monitoring platform: backend, dashboard, and docs.

### Added

- Deployment configuration: `vercel.json` with the SPA rewrite and cache headers, a `render.yaml`
  blueprint, Dockerfiles for the API and the dashboard, and an nginx config. Documented in
  `docs/DEPLOYMENT.md`, with every setting catalogued in `docs/CONFIGURATION.md`.
- Notifications, settings, and monitoring log pages: a notification feed with all/unread filtering
  and mark-as-read, a working unread badge in the header, a settings page covering monitoring
  defaults, notification preferences, appearance, data retention and account details, and a log of
  every monitoring sweep with its counters.
- Site detail, analytics, and incident pages: a per-site view with uptime windows, a response-time
  trend, a hoverable and keyboard-reachable health timeline, HTTP status distribution and a time
  range filter; an account-wide analytics page with totals and site rankings; and an incidents page
  filterable by active, resolved, or all.
- Dashboard and site management: a dashboard with status totals, average response time, uptime,
  a response-time chart and the sites needing attention first; a websites page with search, status
  filtering, sorting and pagination; an add/edit form showing which URL will actually be checked;
  a delete confirmation that names everything it removes; and Check Now with a cooldown. Data
  refreshes on an interval that pauses while the tab is hidden.
- Frontend foundation: React + Vite + TypeScript + Tailwind workspace, a design system with
  light/dark/system themes applied before first paint, an axios layer that unwraps the API envelope
  and normalises errors, auth/theme/toast contexts, a responsive app shell with a mobile slide-over
  navigation, sign-in and registration pages, and the shared UI primitives — buttons, inputs,
  selects, switches, cards, badges, modals, dropdowns, tooltips, skeletons, toasts, and status
  indicators that pair colour with an icon and a label.
- Analytics: uptime over 24h/7d/30d/90d computed from check history, response-time series
  downsampled server-side, HTTP status distribution, downtime derived from incidents, per-site
  statistics, dashboard totals, and account-wide rankings of the most reliable, slowest, and most
  frequently failing sites.
- Endpoints for dashboard stats, account and per-site analytics, paginated check history,
  incidents, notifications (including mark-read and mark-all-read), settings, and the monitoring
  run log. Documented in `docs/API.md`.
- `npm run seed`: five demo sites with a month of realistic history, clustered outages, incidents,
  and notifications, all flagged `isDemo` and excluded from live monitoring.
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

### Fixed

- Light-theme status and accent colours failed WCAG AA contrast as text — online at 2.50:1 and
  slow at 2.19:1 against 4.5:1 required. Every token now passes AA in both themes, including status
  text on its badge tint and white text on button fills.
- The header notification badge always showed zero: it was fed by a prop no page supplied. It now
  reads the unread count from a provider that polls it.

### Changed

- Uptime for a window containing no checks is now reported as `null` rather than `0`, so it renders
  as "no data" while a genuine total outage still renders as 0.00%.
- Sorting sites by status now orders by severity — offline, slow, unknown, checking, online,
  paused — rather than alphabetically, which had placed slow sites below paused ones.

[Unreleased]: https://github.com/Webasif1/PulseKeeper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Webasif1/PulseKeeper/releases/tag/v0.1.0
