<div align="center">

# PulseKeeper

**Website Health Monitoring & Uptime Tracking Platform**

Add your projects, watch their availability from a real backend monitor, and get uptime,
response-time trends, and incident history in one developer-focused dashboard.

[![CI](https://github.com/Webasif1/PulseKeeper/actions/workflows/ci.yml/badge.svg)](https://github.com/Webasif1/PulseKeeper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](.nvmrc)

</div>

> **Build status:** PulseKeeper is under active initial development. The backend is complete —
> auth, site management, SSRF protection, the monitoring engine, and analytics — and the React
> dashboard is next. See [docs/DEVLOG.md](docs/DEVLOG.md) for what has landed and
> [docs/CHANGELOG.md](docs/CHANGELOG.md) for released versions.
>
> To try it now: `npm run db:up && npm run seed && npm run dev`, then sign in as
> `demo@pulsekeeper.dev` / `pulsekeeper-demo` and explore the API described in
> [docs/API.md](docs/API.md).

---

## Overview

PulseKeeper monitors websites and APIs you own from a **Node.js backend**, not from the browser.
A scheduled job runs health checks on an interval you configure per site, records every result,
derives status from response time and HTTP outcome, opens an incident when a site fails
repeatedly, and resolves it when the site recovers.

It is aimed at developers running side projects on free-tier hosts (Render, Railway, Fly, and
similar) who want one place to answer *"is everything I deployed still up, and how fast is it?"*

### About "keep-alive"

Health checks are legitimate, low-frequency HTTP requests to endpoints you own. PulseKeeper's
primary purpose is **monitoring**; the keep-alive effect is a secondary consequence.

PulseKeeper makes **no claim** that periodic health checks will prevent a hosting provider from
sleeping or suspending a free-tier service. Providers change policies, rate-limit requests,
restrict artificial traffic, and apply different rules per plan. Configure intervals responsibly
and stay within your provider's acceptable-use policy.

---

## Features

**Monitoring**
- Backend health checks on a per-site interval (1m / 5m / 10m / 15m / 30m / 1h)
- Configurable request timeout, slow-response threshold, and failure threshold
- Response-time measurement and HTTP status capture
- Status model: `ONLINE` · `SLOW` · `OFFLINE` · `CHECKING` · `PAUSED` · `UNKNOWN`
- Manual **Check Now** with cooldown and server-side rate limiting
- Scheduled sweeps via `node-cron`, plus an authenticated `POST /api/monitor/run` endpoint for
  external cron services

**Sites**
- Full CRUD, pause/resume without deleting, tags, description, separate health-check URL
- Search by name / URL / tag, filter by status, sort by name, status, response time, uptime, last check

**Analytics**
- Uptime computed from health-check history over 24h / 7d / 30d / 90d — never from current status
- Average, minimum, and maximum response time; total and failed checks
- Response-time trend, uptime, health timeline, and HTTP status distribution charts (Recharts)
- Platform-wide analytics: most reliable, slowest, and most frequently failing sites

**Incidents**
- Incidents open only after N consecutive failures, not on every failed request
- Automatic resolution on recovery with recorded downtime duration
- Active / resolved / all filtering

**Notifications & logs**
- In-app notifications for offline, recovery, slow, incident opened, incident resolved
- Channel interface ready for email, Slack, Discord, Telegram, and webhooks
- Structured backend logging (pino) and a persisted monitor-run log viewable in the UI

**Security**
- JWT auth with bcrypt hashing and HTTP-only cookies
- Every query scoped to the authenticated user — no cross-user data access
- SSRF protection on every outbound check (see [docs/SECURITY-SSRF.md](docs/SECURITY-SSRF.md))
- Helmet, CORS allowlist, rate limiting, and schema validation on all input

**Interface**
- Light / dark / system themes, responsive from mobile to desktop
- Status conveyed by icon and text, not color alone
- Polished loading, empty, and error states throughout

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Router, Tailwind CSS, Recharts, Lucide, Axios |
| Backend | Node.js, Express, TypeScript, Mongoose, Zod, pino |
| Database | MongoDB (Docker locally, MongoDB Atlas in production) |
| Auth | JWT, bcrypt, HTTP-only cookies |
| Scheduling | node-cron, with external-cron fallback |
| Hosting | Vercel (client) · Render / Railway / VPS (server) · MongoDB Atlas (database) |

Deliberately **not** used: Next.js, Supabase, Firebase, PostgreSQL, Prisma. This is a MERN
application end to end.

---

## Architecture

```
        ┌──────────────────────┐
        │   React Dashboard    │   Vercel
        └──────────┬───────────┘
                   │  REST / JSON, cookie auth
                   ▼
        ┌──────────────────────┐
        │  Express REST API    │   Render / Railway / VPS (always-on)
        │       Node.js        │
        └─────┬──────────┬─────┘
              │          │
              ▼          ▼
     ┌────────────┐  ┌──────────────────┐
     │  MongoDB   │  │   Monitoring     │
     │   Atlas    │  │    Service       │
     └────────────┘  └────────┬─────────┘
                              │  SSRF-guarded HTTP
                              ▼
                     Monitored Websites
```

Each cron tick loads enabled sites, selects those whose interval has elapsed, runs guarded health
checks with bounded concurrency, stores results, updates site status, opens or resolves incidents,
emits notifications, and writes a run summary. One failing site never aborts the sweep.

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/MONITORING.md](docs/MONITORING.md).

---

## Folder structure

```
PulseKeeper/
├── client/                  React + Vite + TypeScript frontend
│   └── src/
│       ├── components/      layout, dashboard, sites, charts, incidents,
│       │                    notifications, settings, ui
│       ├── pages/  hooks/  services/  context/  types/  utils/  constants/  lib/
│       └── App.tsx          router shell only
├── server/                  Node + Express + TypeScript backend
│   └── src/
│       ├── config/          env validation, database connection
│       ├── controllers/     HTTP layer
│       ├── services/        monitoring, health check, incident, notification, analytics
│       ├── jobs/            monitoringJob, cleanupJob
│       ├── models/          Mongoose schemas
│       ├── middleware/  routes/  validators/  utils/  types/
│       ├── app.ts           express app (importable by tests)
│       └── server.ts        process entry: connect DB, start server, start jobs
├── docs/                    architecture, API, configuration, deployment, security, devlog
├── docker-compose.yml       local MongoDB
└── package.json             npm workspaces root
```

---

## Local setup

**Requirements:** Node.js 20+ and either Docker (recommended) or a MongoDB Atlas connection string.

```bash
git clone https://github.com/Webasif1/PulseKeeper.git
cd PulseKeeper
npm install

# 1. Start MongoDB locally
npm run db:up                      # docker compose up -d  → mongodb://localhost:27017

# 2. Configure the backend
cp server/.env.example server/.env # defaults already point at the Docker MongoDB
# generate a secret:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Configure the frontend
cp client/.env.example client/.env

# 4. (optional) load clearly-marked demo data
npm run seed

# 5. Run both apps
npm run dev                        # API on :5050, dashboard on :5173
```

Other scripts: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`,
`npm run db:down`.

### Using MongoDB Atlas instead of Docker

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user, and allow access from your IP (or your host's egress addresses).
3. Copy the connection string into `MONGODB_URI` in `server/.env`.

Full variable reference: [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

---

## Environment variables

Every variable is documented in `server/.env.example` and `client/.env.example`; nothing secret
is ever exposed to the frontend bundle.

**Server**

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` / `production` |
| `PORT` | API port (default `5050` — 5000 is reserved on Windows and macOS) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Signing secret for auth tokens — required, no default |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `CLIENT_URL` | Allowed CORS origin(s) |
| `MONITOR_CRON_SECRET` | Shared secret for `POST /api/monitor/run` |
| `MONITOR_ENABLED` | Enable the in-process cron scheduler |
| `LOG_LEVEL` | pino level (default `info`) |

**Client**

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL of the API (default `http://localhost:5050`) |

`MONGODB_URI`, `JWT_SECRET`, and `MONITOR_CRON_SECRET` must never be referenced by client code.

---

## Deployment

| Piece | Target |
| --- | --- |
| Frontend | Vercel — build `npm run build --workspace client`, output `client/dist` |
| Backend | Render / Railway / VPS — must be **always-on** for `node-cron` to be reliable |
| Database | MongoDB Atlas |

If your backend host sleeps, in-process cron will not fire on schedule. In that case disable it
(`MONITOR_ENABLED=false`) and drive monitoring from an external cron service:

```bash
curl -X POST https://your-api.example.com/api/monitor/run \
     -H "x-monitor-secret: $MONITOR_CRON_SECRET"
```

Step-by-step instructions: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Security

- **SSRF protection** — the backend fetches URLs supplied by users, so every URL is validated at
  creation *and* again at check time: HTTP/HTTPS only, DNS resolved, and requests refused when the
  target resolves to loopback, private, link-local, unique-local, or cloud-metadata addresses.
  Redirects are followed manually and revalidated at each hop.
- **Isolation** — every site, health check, incident, and notification query is scoped to the
  authenticated `userId`.
- **Transport & storage** — bcrypt password hashing, HTTP-only cookies, Helmet headers, CORS
  allowlist, and rate limits on auth and manual-check routes.
- **Secrets** — only `.env.example` files are committed; real `.env` files are gitignored.

Details in [docs/SECURITY-SSRF.md](docs/SECURITY-SSRF.md). To report a vulnerability, see
[SECURITY.md](SECURITY.md).

---

## Known limitations

- Checks run from wherever your backend runs — a single vantage point, not a global probe network.
- Free-tier or sleeping backend hosts make in-process cron unreliable; use external cron.
- Very short intervals across many sites increase load and may hit provider rate limits.
- Raw health-check history is pruned by the retention setting, so analytics beyond the retention
  window rely on aggregates.
- Keep-alive behavior depends entirely on your provider's policies and can change at any time.

## Roadmap

- Outbound notification channels (email, Slack, Discord, Telegram, webhooks)
- Status pages that can be shared publicly
- Multi-region checks
- SSL certificate and domain expiry monitoring
- Keyword and JSON-body assertions on responses
- Maintenance windows that suppress incidents

---

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the branch naming,
Conventional Commit format, and PR checklist, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for
community expectations.

## License

[MIT](LICENSE)
