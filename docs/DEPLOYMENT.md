# Deployment

PulseKeeper deploys as three pieces: a static frontend, an always-on backend, and a managed
database.

```
Vercel (static)  ──►  Render / Railway / VPS  ──►  MongoDB Atlas
   dashboard              API + monitor              data
```

Related: [CONFIGURATION.md](CONFIGURATION.md) for every variable,
[MONITORING.md](MONITORING.md) for how scheduling behaves, [SECURITY-SSRF.md](SECURITY-SSRF.md)
for outbound request safety.

---

## The one decision that matters

**The backend must be always-on, or in-process cron cannot be trusted.**

`node-cron` fires on a timer inside the process. If the host suspends the process when traffic
stops — which free tiers on Render, Fly, and similar do — that timer stops with it, and monitoring
silently stops happening. The dashboard keeps loading; nothing checks anything.

Two supported answers:

| Situation | Configuration |
| --- | --- |
| Always-on host (paid instance, VPS, container) | `MONITOR_ENABLED=true`, nothing else to do |
| Host that sleeps | `MONITOR_ENABLED=false`, drive `POST /api/monitor/run` from an external cron |

For the second, any scheduler that can send an HTTP request works — cron-job.org, GitHub Actions,
an existing server's crontab:

```bash
curl -fsS -X POST https://your-api.example.com/api/monitor/run \
     -H "x-monitor-secret: $MONITOR_CRON_SECRET"
```

The response is the sweep summary, so a scheduler that logs output records what happened:

```json
{ "checked": 12, "online": 10, "slow": 1, "offline": 1, "errors": 0 }
```

Do **not** run both: a sleeping host that also has `MONITOR_ENABLED=true` will occasionally run
two sweeps at once when it happens to be awake.

---

## 1. Database — MongoDB Atlas

1. Create a free M0 cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Database Access** → add a user with `readWrite` on the `pulsekeeper` database. Give it its
   own password; do not reuse an existing one.
3. **Network Access** → add your backend's egress addresses. `0.0.0.0/0` works and is what most
   platform guides suggest, but it means the only thing protecting your data is the password.
   Prefer the platform's documented egress ranges where they exist.
4. Copy the connection string and append the database name:

```
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/pulsekeeper?retryWrites=true&w=majority
```

Indexes are created automatically in development. In production `autoIndex` is off — building
indexes on a live collection can be slow — so build them once after the first deploy:

```bash
MONGODB_URI="mongodb+srv://..." npm run seed --workspace server -- --clean
```

That connects, registers every model, and exits. (It removes demo data, of which a fresh
production database has none.)

---

## 2. Backend — Render

The repository includes [`render.yaml`](../render.yaml), so a Blueprint deploy picks up the build
and start commands, the health check path, and the generated secrets.

Manual setup, if you prefer:

| Field | Value |
| --- | --- |
| Root directory | *(repository root — the workspace must resolve)* |
| Build command | `npm ci && npm run build --workspace server` |
| Start command | `npm run start --workspace server` |
| Health check path | `/api/health` |

Then set in the dashboard:

```
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<48 random bytes, hex>
MONITOR_CRON_SECRET=<24 random bytes, hex>
CLIENT_URL=https://your-dashboard.vercel.app
TRUST_PROXY=1
MONITOR_ENABLED=true
```

`CLIENT_URL` must be the exact dashboard origin with no trailing slash, and `TRUST_PROXY=1`
because Render terminates TLS in front of the app — without it, rate limiting sees the proxy's
address for every request.

The health check path is `/api/health`, not `/api/health/ready`, on purpose: liveness stays `200`
while MongoDB is briefly unreachable, so a transient database blip does not cause Render to recycle
a container that is otherwise fine.

**Railway, Fly, or a VPS** work the same way — the only requirements are Node 20+, the environment
above, and a process that is not suspended.

---

## 3. Frontend — Vercel

Import the repository and set:

| Field | Value |
| --- | --- |
| Root directory | `client` |
| Framework preset | Vite *(detected)* |
| Build command | `npm run build` |
| Output directory | `dist` |

One environment variable:

```
VITE_API_URL=https://your-api.onrender.com
```

Vite inlines this at build time, so **changing it requires a redeploy**, not just a restart.

[`client/vercel.json`](../client/vercel.json) supplies the SPA rewrite and cache headers. The
rewrite is not optional: without it a refresh on `/sites/:id` returns a CDN 404 before React ever
loads.

### Finish the loop

After the frontend is live, set `CLIENT_URL` on the backend to its origin and redeploy the
backend. Until then every dashboard request fails CORS — which looks like a broken API but is the
allowlist doing its job.

---

## Docker

Both images build from the repository root, because the npm workspace has to resolve:

```bash
# API
docker build -f server/Dockerfile -t pulsekeeper-api .
docker run -p 5050:5050 --env-file server/.env pulsekeeper-api

# Dashboard
docker build -f client/Dockerfile \
  --build-arg VITE_API_URL=https://api.example.com \
  -t pulsekeeper-web .
docker run -p 8080:80 pulsekeeper-web
```

The API image runs as the unprivileged `node` user and its healthcheck uses
`/api/health/ready`, so a container that cannot reach its database reports unhealthy rather than
merely running.

---

## Verifying a deployment

```bash
# 1. The API is alive and can reach MongoDB
curl -s https://your-api.example.com/api/health/ready
# {"success":true,"data":{"status":"ready","database":"connected"}}

# 2. The dashboard origin is allowed
curl -s -o /dev/null -w '%{http_code}\n' \
     -X OPTIONS https://your-api.example.com/api/auth/login \
     -H "Origin: https://your-dashboard.vercel.app" \
     -H "Access-Control-Request-Method: POST"
# 204

# 3. The monitor trigger rejects a wrong secret
curl -s -o /dev/null -w '%{http_code}\n' \
     -X POST https://your-api.example.com/api/monitor/run \
     -H "x-monitor-secret: wrong"
# 401

# 4. And accepts the right one
curl -s -X POST https://your-api.example.com/api/monitor/run \
     -H "x-monitor-secret: $MONITOR_CRON_SECRET"
# {"success":true,"data":{"checked":0,...}}
```

Then register an account, add a site, and press **Check Now**. If the check succeeds, every layer
is working: the browser reached the API, the API reached MongoDB, and the monitor made an outbound
request that passed the SSRF guard.

---

## Operating notes

**Logs.** The backend writes newline-delimited JSON in production. Every request carries an
`x-request-id`, echoed in the response, so a user's report can be traced to its log lines.

**Monitoring the monitor.** `/logs` in the dashboard lists every sweep and its counters. Idle
ticks are not recorded, so gaps between rows are periods when nothing was due — not missed sweeps.
Point your own uptime check at `/api/health`.

**Backups.** Atlas backs up automatically on paid tiers. On M0 use `mongodump` on a schedule if
the history matters to you.

**Scaling.** Run one backend instance. Two would each run their own cron and check every site
twice; the partial unique index prevents duplicate incidents, but the outbound traffic doubles.
Scale the check concurrency with `MONITOR_CONCURRENCY` instead.

---

## Known limitations

- Checks run from wherever the backend runs — one vantage point, not a global probe network.
- A single instance is a single point of failure; if it is down, nothing is being monitored and
  nothing will tell you.
- Retention prunes raw checks, so analytics beyond the retention window rely on what remains.
- Keep-alive behaviour depends entirely on your provider's policies and can change at any time.
