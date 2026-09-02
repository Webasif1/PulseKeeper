# Architecture

How PulseKeeper is put together and why. Companion documents: [MONITORING.md](MONITORING.md) for
the check lifecycle, [SECURITY-SSRF.md](SECURITY-SSRF.md) for outbound request safety,
[API.md](API.md) for endpoints, and [SPEC.md](SPEC.md) for the original requirements.

---

## 1. System overview

```
        ┌──────────────────────┐
        │   React Dashboard    │   Vercel (static build)
        └──────────┬───────────┘
                   │  HTTPS · JSON · HTTP-only cookie auth
                   ▼
        ┌──────────────────────┐
        │  Express REST API    │   Render / Railway / VPS — always-on
        │       Node.js        │
        └─────┬──────────┬─────┘
              │          │
              ▼          ▼
     ┌────────────┐  ┌──────────────────┐
     │  MongoDB   │  │   Monitoring     │  node-cron, in-process
     │   Atlas    │  │    Service       │
     └────────────┘  └────────┬─────────┘
                              │  SSRF-guarded HTTP
                              ▼
                     Monitored Websites
```

Three deployable pieces: a static frontend, a stateful always-on backend, and a managed database.
The frontend holds no secrets and never talks to MongoDB.

## 2. Why monitoring lives on the backend

Browser-driven checks were rejected outright. A tab can be closed, backgrounded, throttled by the
browser's timer policy, or disconnected, and browser requests are subject to CORS — so a failed
check could not be distinguished from a blocked one. Checks therefore run server-side, where
timing is reliable, CORS does not apply, timeouts are enforceable, and results persist regardless
of who is watching.

The consequence is that the backend must be always-on. Where it is not, monitoring is driven by an
external cron service calling an authenticated endpoint instead. See §7.

## 3. Backend layering

```
server/src/
├── config/        env validation (Zod, fail-fast), database connection
├── routes/        URL → middleware → controller wiring only
├── validators/    Zod schemas for body, query, and params
├── controllers/   HTTP concerns: read request, call service, shape response
├── services/      business logic — the substance of the application
├── models/        Mongoose schemas and indexes
├── jobs/          node-cron schedules
├── middleware/    auth, request logging, rate limits, error handling
├── utils/         logger, response envelope, AppError, URL guard
├── types/         shared TypeScript types
├── app.ts         builds the Express app — importable by tests
└── server.ts      process entry: connect DB, listen, start jobs, handle shutdown
```

The rule is one direction of dependency: `route → validator → controller → service → model`.
Controllers never touch Mongoose directly and services never touch `req`/`res`. This keeps the
monitoring engine callable from three places — cron, the HTTP trigger, and manual "Check Now" —
without duplication.

`app.ts` and `server.ts` are separate so tests can construct the app without opening a port or
starting cron jobs.

### Services

| Service | Responsibility |
| --- | --- |
| `healthCheckService` | Perform one guarded check: request, timeout, timing, error classification, status decision |
| `monitoringService` | Select due sites, run checks with bounded concurrency, persist results, write the run summary |
| `incidentService` | Consecutive-failure tracking, incident open and resolve, downtime duration |
| `notificationService` | Create in-app notifications; dispatch to pluggable outbound channels |
| `analyticsService` | Aggregation pipelines for uptime, response time, and status distribution |

## 4. Data model

Seven collections. Every document that belongs to a user carries `userId`, and every query that
reads or writes user data filters on it — this is the tenant-isolation boundary.

| Collection | Purpose | Key indexes |
| --- | --- | --- |
| `users` | Account and credentials | `email` unique |
| `sites` | Monitored targets and per-site thresholds | `{ userId, createdAt }`, `{ monitoringEnabled, lastCheckedAt }` |
| `healthchecks` | One document per check performed | `{ siteId, checkedAt: -1 }`, `{ checkedAt }` for retention |
| `incidents` | Outage windows | `{ siteId, startedAt: -1 }`, `{ userId, status }` |
| `notifications` | In-app notification feed | `{ userId, read, createdAt: -1 }` |
| `settings` | Per-user defaults and preferences | `userId` unique |
| `monitorruns` | One document per monitoring sweep | `{ startedAt: -1 }` |

`healthchecks` is the only collection that grows without bound, so it drives two design choices:
the `{ siteId, checkedAt: -1 }` compound index serves every analytics query, and a retention job
prunes documents older than the configured window.

**Denormalization.** `sites` caches `currentStatus`, `currentResponseTime`, `lastCheckedAt`,
`consecutiveFailures`, and `uptimePercentage`. Recomputing these from history on every dashboard
load would mean an aggregation per site per poll. The cached fields are written by the monitoring
engine, which is the single writer; historical truth still lives in `healthchecks`, and uptime
shown on detail pages is always computed from history, never from the cached status.

## 5. Frontend structure

```
client/src/
├── components/
│   ├── ui/            primitives: Button, Card, Badge, Modal, Toast, Skeleton, EmptyState…
│   ├── layout/        AppShell, Sidebar, Header
│   └── dashboard/ sites/ charts/ incidents/ notifications/ settings/
├── pages/             one component per route
├── hooks/             useSites, usePolling, useRelativeTime…
├── services/          axios instance and per-resource API modules
├── context/           auth, theme, toast
├── types/ utils/ constants/ lib/
└── App.tsx            router shell only
```

Components render; hooks hold state and effects; services own HTTP. Nothing outside `services/`
calls axios, so auth handling, the response envelope, and error mapping exist in exactly one place.

State is deliberately plain: React context for the few genuinely global concerns (auth, theme,
toasts) and local state elsewhere. No global store is introduced for data that a single page owns.

## 6. Request and refresh flow

A dashboard load resolves to a small number of aggregate endpoints rather than one request per
site. While a dashboard is open it polls on an interval, and polling pauses when the tab is hidden
— the server is already the source of truth, so a background tab has nothing to gain from
continued requests. Timestamps render as relative values computed client-side, so "32 seconds ago"
stays honest between polls.

Every response uses one envelope:

```jsonc
{ "success": true,  "message": "...", "data": {} }
{ "success": false, "message": "...", "error": { "code": "...", "details": "..." } }
```

The axios interceptor unwraps `data` on success and converts failures into typed errors, so
components never inspect the envelope themselves.

## 7. Scheduling

`node-cron` ticks once a minute. Each tick asks which sites are due — `lastCheckedAt +
intervalMinutes <= now` — rather than registering one cron expression per site, so per-site
intervals are honored with a single schedule and sites can be added, edited, or paused without
touching the scheduler.

Checks within a sweep run with bounded concurrency, and each site's work is individually wrapped
in try/catch: one failure produces one failed check, never an aborted sweep.

The same entry point is exposed as `POST /api/monitor/run`, authenticated with a shared secret,
for deployments where the backend sleeps and in-process cron cannot be trusted. In-process cron is
switched off with `MONITOR_ENABLED=false` in that configuration.

A second daily job enforces health-check retention.

## 8. Security boundaries

1. **Authentication** — JWT in an HTTP-only cookie, bcrypt-hashed passwords, `requireAuth`
   middleware attaching the user to the request.
2. **Tenant isolation** — `userId` in the filter of every user-data query.
3. **Outbound requests** — every URL passes the guard at write time and again at check time, with
   redirects revalidated per hop. Detail in [SECURITY-SSRF.md](SECURITY-SSRF.md).
4. **Input** — Zod schemas validate everything before it reaches a controller.
5. **Transport and abuse** — Helmet, a CORS origin allowlist, and rate limits on authentication
   and manual checks.
6. **Secrets** — server-only environment variables; the client bundle receives nothing but the API
   base URL.

## 9. Observability

Structured pino logs carry a request id through the request lifecycle; monitoring sweeps log a
summary line per run and a warning per failed site. Each sweep is also persisted as a `monitorruns`
document, giving the UI a monitoring log that survives restarts and log rotation.

## 10. Trade-offs

| Choice | Trade-off accepted |
| --- | --- |
| Single-region checks | Simpler and cheaper; cannot distinguish a regional outage from a global one |
| Cached status on `sites` | Fast dashboards; requires the monitoring engine to be the single writer |
| Raw check history plus retention | Precise recent analytics; long-range history needs aggregates |
| Polling instead of WebSockets | No connection state to manage; updates are interval-bounded |
| In-process cron | No extra infrastructure; requires an always-on host or external cron |
| MongoDB | Flexible schema and strong aggregation for time-series-shaped data; no relational joins |
