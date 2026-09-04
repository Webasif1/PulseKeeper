# Monitoring

How PulseKeeper decides what to check, when to check it, what a result means, and when an outage
becomes an incident.

Related: [ARCHITECTURE.md](ARCHITECTURE.md) for the system shape, [SECURITY-SSRF.md](SECURITY-SSRF.md)
for outbound request safety, [SPEC.md](SPEC.md) sections 3, 8, 9, 16, 21, 23, and 40.

---

## Why checks run on the server

A browser tab can be closed, backgrounded, throttled by the browser's timer policy, or
disconnected. Browser requests are also subject to CORS, so a blocked request and a genuinely
failing site would be indistinguishable.

Checks therefore run in the Node backend, where timing is reliable, CORS does not apply, timeouts
are enforceable, and results persist regardless of whether anyone is watching.

## The schedule

One cron schedule ticks every minute and asks *which sites are due*, rather than registering a
cron entry per site:

```
lastCheckedAt is null  OR  lastCheckedAt + intervalMinutes <= now
```

Because the comparison is relative to each site's own `intervalMinutes`, a single schedule serves
every interval from 1 minute to 1 hour, and adding, editing, or pausing a site requires no
scheduler changes. Due sites are ordered oldest-first so a backlog drains fairly instead of
starving the same sites every tick.

Overlapping sweeps are prevented: if a sweep is still running when the next tick fires, that tick
is skipped rather than doubling the outbound requests.

Within a sweep, checks run with bounded concurrency (`MONITOR_CONCURRENCY`, default 5), so a large
account cannot open hundreds of sockets at once.

## One check

Each check is a `GET` built on `node:http`/`node:https` rather than `fetch`, for two reasons that
both matter:

- the agent accepts a custom `lookup`, which is how the SSRF guard validates the address the
  socket is actually about to connect to;
- redirects must be followed manually so every hop can be revalidated, and `fetch` follows them
  without asking.

**Timing stops when response headers arrive, and the body is discarded unread.** A health check
asks "did this respond, and how fast". Downloading the body would measure the monitoring server's
bandwidth rather than the site's responsiveness, and would score a large page worse than a slow
one. Across redirects, the times for all hops are summed — reporting only the final hop would hide
the true cost of reaching the site.

## Status

| Status | Meaning |
| --- | --- |
| `ONLINE` | Final status below 400, response at or under the slow threshold |
| `SLOW` | Final status below 400, response **over** the slow threshold |
| `OFFLINE` | Timeout, DNS failure, connection failure, blocked URL, or status 400+ |
| `PAUSED` | Monitoring disabled for this site |
| `UNKNOWN` | No check has run yet |
| `CHECKING` | A check is in progress |

A response exactly at the threshold is `ONLINE`: "slow" means over the line, not on it.

## Error types

| Type | Cause |
| --- | --- |
| `TIMEOUT` | No response within the site's timeout |
| `DNS_ERROR` | `ENOTFOUND`, `EAI_AGAIN` |
| `CONNECTION_ERROR` | Refused, reset, unreachable, TLS failure |
| `HTTP_ERROR` | Status 400–499, or too many redirects |
| `SERVER_ERROR` | Status 500+ |
| `BLOCKED_URL` | The SSRF guard refused the URL at check time |
| `UNKNOWN` | Anything else |

`BLOCKED_URL` is an addition to SPEC section 9. When a hostname's DNS record changes to point at a
private address, the check is neither a connection error nor an HTTP error, and recording it as
either would mislead whoever reads the timeline. It gets its own type so the UI can say what
actually happened.

## Incidents

An incident opens only after `failureThreshold` **consecutive** failures (default 3). A single
failed request is noise — a dropped packet, a brief restart, a deploy — and opening an incident
for each would make the incident list useless.

```
fail ─▶ fail ─▶ fail ─▶ INCIDENT OPENS ─▶ … ─▶ success ─▶ INCIDENT RESOLVES
 1       2       3                                        duration recorded
```

While an incident is open, further failures increment its `failedChecks` rather than opening
another. **Recovery is immediate**: one success closes the incident. Requiring several successes
would inflate reported downtime, and the health timeline already shows a flapping site for what
it is.

At most one incident per site can be active at a time, enforced by a partial unique index in
MongoDB rather than by service logic alone — a manual check racing the cron sweep would otherwise
open duplicates for the same outage. When that race happens, the loser reuses the incident the
winner created.

## TLS certificate expiry

Every https check already completes a TLS handshake, so the certificate is
sitting on the socket. PulseKeeper reads it there rather than opening a second
connection for data it already has.

Recorded per site: expiry date, issuer, and days remaining.

Warnings fire at **30, 14, 7, and 1 days remaining**, and at most once per band.
Crossing 30 warns once; the next warning waits for 14. A daily reminder for a
month is how people learn to ignore alerts. Renewing the certificate clears the
record, so the next genuine approach is announced again.

An already-expired certificate is reported as its own event, because visitors
see a browser security warning — a worse outcome than a slow response.

Across a redirect chain, the certificate from the **first** https hop is kept.
That is the URL the user configured and is responsible for renewing; a redirect
to a CDN would otherwise report someone else's certificate as theirs.

Reading the certificate never fails a check. A missing or unparseable one is
ignored — the site responded, which is what the check was asked to determine.

Users can switch these warnings off independently of outage alerts, since an
expiring certificate is a different concern from a site being down.

## Notifications

An opening incident emits `SITE_DOWN`; a resolving one emits `SITE_UP`. Each is delivered to every
registered channel, filtered by the user's notification preferences.

Only the in-app channel exists today. Email, Slack, Discord, Telegram, and webhooks each become a
module implementing `NotificationChannel` and registering itself — no change to the calling code.
A channel's failure is logged, never propagated: a broken integration must not fail a monitoring
sweep.

## Failure containment

SPEC section 43 requires that one site failing never stops the others. Two layers enforce it:

1. An unreachable site is a **result**, not an error — `runHealthCheck` returns a failed outcome
   rather than throwing.
2. `checkSite` wraps everything in try/catch anyway. Reaching that catch means a bug or a database
   problem, not a down site; it is logged, counted in the run's `errors`, and the sweep continues.
   `lastCheckedAt` still advances, so a permanently broken site cannot monopolise every future
   sweep.

## The monitoring log

Each sweep that checks at least one site writes a `MonitorRun` record:

```json
{ "checked": 12, "online": 10, "slow": 1, "offline": 1, "errors": 0 }
```

Idle cron ticks are **not** recorded. The scheduler fires every minute and most ticks find nothing
due; persisting them would add roughly 1,400 empty rows a day and bury the runs that did something.
A manual or external trigger is always recorded, because whoever pressed the button is entitled to
see that it ran.

These records hold aggregate counters only — never site names, URLs, or ids — so they are instance
telemetry rather than user data.

## Running without in-process cron

`node-cron` needs an always-on host. If your backend sleeps, in-process scheduling is not
trustworthy: set `MONITOR_ENABLED=false` and drive the sweep externally.

```bash
curl -X POST https://your-api.example.com/api/monitor/run \
     -H "x-monitor-secret: $MONITOR_CRON_SECRET"
```

The endpoint is authenticated by a shared secret rather than a user session, because the caller is
a cron service and not a browser. The secret is compared in constant time, and the environment
schema makes it mandatory when `NODE_ENV=production`. If no secret is configured the route refuses
every request rather than standing open.

## Retention

A daily job deletes health checks older than each user's configured window (7, 30, 90, or 180
days), grouping users by window so it issues a handful of queries rather than one per user.
Monitor-run records are pruned after a fixed 30 days.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONITOR_ENABLED` | `true` | Run the in-process scheduler |
| `MONITOR_CRON` | `* * * * *` | Sweep schedule |
| `CLEANUP_CRON` | `15 3 * * *` | Retention schedule |
| `MONITOR_CONCURRENCY` | `5` | Sites checked at once |
| `MONITOR_MAX_REDIRECTS` | `3` | Redirect hops per check |
| `MONITOR_CRON_SECRET` | — | Shared secret for the external trigger |

Per-site settings — interval, timeout, slow threshold, failure threshold — are stored on each site
and seeded from the user's defaults at creation time. Changing a default later never silently
alters how existing sites are monitored.
