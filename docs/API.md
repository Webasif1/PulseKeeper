# API Reference

Base URL: `http://localhost:5050/api` in development.

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [MONITORING.md](MONITORING.md),
[SECURITY-SSRF.md](SECURITY-SSRF.md).

---

## Conventions

**Every response uses one envelope** (SPEC §44):

```jsonc
// success
{ "success": true, "message": "Site added", "data": { "site": { … } } }

// failure
{ "success": false, "message": "Request validation failed",
  "error": { "code": "VALIDATION_ERROR", "details": [ { "field": "url", "message": "…" } ] } }
```

**Authentication** is a JWT in an HTTP-only cookie (`pk_token`), set by register and login. Scripts
that cannot hold cookies may send `Authorization: Bearer <token>` instead — the token is returned
in the body of both endpoints.

**Tenant isolation**: every route below is scoped to the signed-in user. Reaching another
account's resource returns `404`, never `403` — a `403` would confirm the id exists.

**Paginated responses** carry `items` plus:

```jsonc
{ "pagination": { "page": 1, "limit": 50, "total": 128, "totalPages": 3, "hasMore": true } }
```

**Error codes**: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`RATE_LIMITED`, `URL_NOT_ALLOWED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`.

**Request tracing**: every response carries `x-request-id`; send your own to have it echoed.

---

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | none | Liveness. Stays `200` even if MongoDB is unreachable. |
| `GET` | `/health/ready` | none | Readiness. `503` when the database is down. |

The split is deliberate: a platform health check should not recycle the container over a transient
database blip, but a load balancer should route around an instance that cannot serve.

## Authentication

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | none | Create an account. Also creates the user's settings. |
| `POST` | `/auth/login` | none | Sign in. |
| `POST` | `/auth/logout` | none | Clear the auth cookie. |
| `GET` | `/auth/me` | required | The current user. |

```bash
curl -X POST http://localhost:5050/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Asif","email":"asif@example.com","password":"correct-horse-battery"}'
```

Passwords are 8–72 characters. The upper bound is bcrypt's: it ignores input beyond 72 bytes, so
accepting more would make part of a password meaningless.

Login returns the same `401` for a wrong password and an unknown account, so the endpoint cannot
be used to discover which addresses are registered.

Rate limits: 5 registrations/hour and 10 login attempts/15 min per address; successful logins are
not counted.

## Sites

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/sites` | List, with search, filters, sorting, pagination. |
| `POST` | `/sites` | Add a site. |
| `GET` | `/sites/:id` | One site. |
| `PATCH` | `/sites/:id` | Edit any field. Also pause/resume. |
| `DELETE` | `/sites/:id` | Delete, cascading to checks, incidents, notifications. |
| `POST` | `/sites/:id/check` | Check now. |
| `GET` | `/sites/:id/health` | Raw check history, paginated. |
| `GET` | `/sites/:id/analytics` | Charts and statistics. |

**List query**: `search` (name, URL, or tag — metacharacters are escaped and treated literally),
`status`, `tag`, `sort` (`name`, `status`, `responseTime`, `uptime`, `lastChecked`, `createdAt`),
`order`, `page`, `limit` (max 100).

**Create/update body**:

| Field | Notes |
| --- | --- |
| `name` | required, ≤80 chars |
| `url` | required, http/https, passes the SSRF guard |
| `healthEndpoint` | optional; the URL actually checked when set |
| `description` | ≤280 chars |
| `tags` | ≤10, lowercased and de-duplicated |
| `monitoringEnabled` | pausing sets status to `PAUSED` |
| `intervalMinutes` | one of 1, 5, 10, 15, 30, 60 |
| `timeoutSeconds` | 1–60 |
| `slowThresholdMs` | 100–60000 |
| `failureThreshold` | 1–10 |

Bodies are **strict**: an unknown field is a `400`, not a silent no-op. Omitted monitoring fields
inherit the user's settings defaults and then belong to the site, so changing a default later
never alters an existing site.

A site is returned in one shape from every endpoint — `id` (never `_id` or `__v`), `checkUrl`
resolved, and no `userId`.

Both `url` and `healthEndpoint` are validated against the SSRF guard on write **and** again at
check time. See [SECURITY-SSRF.md](SECURITY-SSRF.md).

```bash
# Blocked before anything is stored
curl -X POST .../api/sites -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"name":"Bad","url":"http://169.254.169.254/latest/meta-data/"}'
# 400 URL_NOT_ALLOWED
```

`POST /sites/:id/check` is limited to 10/minute — each call makes an outbound request. It works on
a paused site: pausing stops the schedule, not the button.

**`GET /sites/:id/health`** query: `page`, `limit` (max 200), `successOnly`, `failedOnly`.

**`GET /sites/:id/analytics`** query: `range` — `1h`, `24h`, `7d`, `30d`, `90d`. Returns:

```jsonc
{
  "range": "7d",
  "stats": { "totalChecks": 672, "failedChecks": 16, "uptimePercentage": 97.62,
             "avgResponseTime": 804, "minResponseTime": 412, "maxResponseTime": 2526,
             "downtimeSeconds": 7321 },
  "uptime": { "24h": 94.79, "7d": 97.62, "30d": 97.22, "90d": 97.22 },
  "responseTime": [ { "timestamp": "…", "avg": 780, "min": 412, "max": 1200, "count": 8 } ],
  "statusDistribution": [ { "statusCode": 200, "count": 656 } ],
  "timeline": [ { "checkedAt": "…", "success": true, "statusCode": 200, "responseTimeMs": 412 } ]
}
```

Response-time averages cover **successful checks only** — a timeout has no duration, and counting
it as zero would hide real slowness. Series are downsampled server-side (roughly 60–120 points per
range), so a 90-day chart does not ship 26,000 rows to the browser.

## Dashboard and analytics

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/dashboard/stats` | Status totals, average response time, uptime, active incidents. |
| `GET` | `/dashboard/analytics` | Account-wide analytics and rankings. `range` as above. |

`/dashboard/analytics` adds `mostReliable`, `slowest`, and `mostFailing` — five sites each.

Uptime everywhere is computed from check history, never from current status (SPEC §14).

## Incidents

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/incidents` | `status` (`ACTIVE`, `RESOLVED`, `ALL`), `siteId`, `page`, `limit`. |
| `GET` | `/incidents/:id` | One incident. |

Active incidents sort before resolved ones: an ongoing outage matters more than history. An open
incident reports a running `durationSeconds` computed by the API, so the UI cannot disagree with
it about how long an outage has lasted.

## Notifications

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/notifications` | `unreadOnly`, `page`, `limit`. |
| `PATCH` | `/notifications/:id/read` | Mark one read. |
| `PATCH` | `/notifications/read-all` | Mark all read. |

The list response includes `unreadCount` alongside `items`, and that count is **unfiltered** — the
header badge shows total unread regardless of the panel's current filter, so the client never
needs a second request.

## Notification channels

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/channels` | List channels, plus `emailAvailable` |
| `POST` | `/channels` | Add one |
| `PATCH` | `/channels/:id` | Rename, change destination, enable or disable |
| `DELETE` | `/channels/:id` | Remove one |
| `POST` | `/channels/:id/test` | Send a test message |

Types: `SLACK`, `DISCORD`, `WEBHOOK`, `EMAIL`. Ten channels per account.

```bash
curl -X POST .../api/channels -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"type":"SLACK","name":"Team Slack","target":"https://hooks.slack.com/services/T0/B0/xxx"}'
```

**The destination is never returned.** A webhook URL is a bearer credential —
anyone holding it can post to that channel — so responses carry only a
`targetPreview` such as `hooks.slack.com/…wxyz`, enough to tell two channels apart
and useless to anyone who intercepts it. On edit, omitting `target` keeps the
stored one.

Every webhook URL passes the **SSRF guard** at creation, whenever it changes, and
again at send time — the same guard health checks use. A target resolving to
loopback, a private range, or a cloud metadata endpoint is refused, and `https` is
required because the URL is a secret in transit. See
[SECURITY-SSRF.md](SECURITY-SSRF.md).

`EMAIL` is rejected unless the server has SMTP configured; `emailAvailable` on the
list response says whether to offer it.

`POST /channels/:id/test` reports failures rather than swallowing them — the point
of the button is to find out. Rate limited to 10/minute alongside manual checks.

### Generic webhook payload

Stable and documented, because whatever receives it was written by whoever
configured the channel. Fields may be added; renaming or removing one is breaking.

```jsonc
{
  "event": "SITE_DOWN",
  "title": "Movie Spark is down",
  "message": "Server returned HTTP 503",
  "site": { "name": "Movie Spark", "url": "https://moviespark.example.com" },
  "occurredAt": "2026-09-04T15:41:04.200Z",
  "source": "pulsekeeper"
}
```

Delivery never blocks or fails a monitoring sweep: each channel is attempted
independently, failures are recorded against the channel, and a channel is
disabled automatically after 10 consecutive failures rather than retried forever.

## Settings

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/settings` | Current settings, created on demand if missing. |
| `PATCH` | `/settings` | Update any subset. |

Fields: `defaultIntervalMinutes`, `defaultTimeoutSeconds`, `defaultSlowThresholdMs`,
`defaultFailureThreshold`, `dataRetentionDays` (7, 30, 90, 180), `notifications`
(`onDown`, `onUp`, `onSlow`), `theme` (`light`, `dark`, `system`).

A partial `notifications` object is **merged**, not replaced — sending `{ "onSlow": true }` leaves
`onDown` and `onUp` alone.

## Monitoring

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/monitor/run` | `x-monitor-secret` | Run a sweep. For external cron. |
| `GET` | `/monitor/runs` | session | The monitoring log. |

```bash
curl -X POST https://your-api.example.com/api/monitor/run \
     -H "x-monitor-secret: $MONITOR_CRON_SECRET"
```

```jsonc
{ "runId": "…", "checked": 12, "online": 10, "slow": 1, "offline": 1,
  "errors": 0, "incidentsOpened": 1, "incidentsResolved": 0, "durationMs": 842 }
```

The secret is compared in constant time, and a user session is **not** accepted in its place — the
caller is a cron service, not a browser. If `MONITOR_CRON_SECRET` is unset the route refuses every
request rather than standing open; the environment schema makes it mandatory in production.

`GET /monitor/runs` requires a signed-in user but is not user-scoped, because a sweep is not: these
rows hold aggregate counters only — never site names, URLs, or ids.

## Rate limits

| Scope | Limit |
| --- | --- |
| All `/api` | 600 / 15 min |
| `/auth/login` | 10 / 15 min (successes not counted) |
| `/auth/register` | 5 / hour |
| `/sites/:id/check` | 10 / min |

Exceeding one returns `429` with `RATE_LIMITED` in the same envelope as any other error.
