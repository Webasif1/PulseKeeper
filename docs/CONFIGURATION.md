# Configuration

Every setting PulseKeeper reads, what it does, and what happens if it is wrong.

The backend validates its environment against a Zod schema **at import time**, so a
misconfigured deployment fails immediately at boot with a message naming the offending
variables — rather than at the first request that happens to need one.

---

## Backend (`server/.env`)

Copy `server/.env.example` and fill it in. Never commit the result.

### Required

| Variable | Rules | Notes |
| --- | --- | --- |
| `MONGODB_URI` | must start `mongodb://` or `mongodb+srv://` | Local Docker or MongoDB Atlas |
| `JWT_SECRET` | at least 32 characters | Signs auth tokens. Rotating it signs everyone out. |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Required in production only

| Variable | Rules |
| --- | --- |
| `MONITOR_CRON_SECRET` | at least 16 characters |

The schema rejects a production boot without it, and separately rejects a `JWT_SECRET` still
holding the example value. Both are deliberate: the failure belongs at deploy time, not at 3am.

### Optional

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `production`, or `test` |
| `PORT` | `5050` | Not 5000: Windows reserves it in the Hyper-V excluded range and macOS gives it to the AirPlay receiver |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime; the auth cookie expiry is read back off the signed token so the two cannot disagree |
| `CLIENT_URL` | `http://localhost:5173` | Comma-separated CORS allowlist. Exact origins, no trailing slash |
| `MONITOR_ENABLED` | `true` | Run the in-process scheduler |
| `MONITOR_CRON` | `* * * * *` | Sweep schedule |
| `CLEANUP_CRON` | `15 3 * * *` | Retention schedule |
| `MONITOR_CONCURRENCY` | `5` | Sites checked simultaneously (1–50) |
| `MONITOR_MAX_REDIRECTS` | `3` | Redirect hops per check (0–10) |
| `LOG_LEVEL` | `info` | pino level |
| `TRUST_PROXY` | `0` | Hop count, or `false` |

### Two that are easy to get wrong

**`CLIENT_URL`** is an allowlist, not a hint. Authentication is cookie-based, so the API refuses
any origin not listed rather than reflecting it back — reflecting would let any site drive the API
as your signed-in user. A missing entry shows up as CORS errors in the browser console and nowhere
else.

**`TRUST_PROXY`** must be set when the API sits behind Render, Railway, Fly, or nginx. Those
terminate TLS and forward the client address in `X-Forwarded-For`; without this the app sees the
proxy's address for every request and rate limiting becomes meaningless. Setting it when *not*
behind a proxy is worse — clients can then spoof their address — which is why it defaults to off
and is configuration rather than a guess.

---

## Frontend (`client/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:5050` | Base URL of the API |

Only `VITE_`-prefixed variables reach the browser, and **everything that does is public**: Vite
inlines them into the bundle at build time. Never put a secret in this file. It is also why the
API URL is a Docker *build argument* rather than a runtime variable — the value is baked in when
the bundle is built.

---

## Per-user settings

These live in MongoDB, not in the environment, and are edited at `/settings`.

| Setting | Default | Range |
| --- | --- | --- |
| Default check interval | 5 min | 1, 5, 10, 15, 30, 60 |
| Default timeout | 10 s | 1–60 |
| Default slow threshold | 3000 ms | 100–60000 |
| Default failure threshold | 3 | 1–10 |
| Data retention | 30 days | 7, 30, 90, 180 |
| Notifications | down and recovery on, slow off | — |
| Theme | system | light, dark, system |

The monitoring values seed **new** sites only. Each site then owns its own copy, so changing a
default never silently alters how an existing site is monitored.

---

## Per-site settings

Set when a site is added and editable at any time: name, URL, health check URL, description, tags,
monitoring enabled, interval, timeout, slow threshold, and failure threshold.

The **health check URL** is worth setting. When present it is what the monitor actually requests,
and a lightweight `/api/health` endpoint is far cheaper to poll every few minutes than a full page.
The add/edit form shows which URL will be used, live, because this is the part of the form people
misread.

---

## Secrets checklist before deploying

- [ ] `JWT_SECRET` is 32+ random characters and unique to this environment
- [ ] `MONITOR_CRON_SECRET` is set and unique
- [ ] `MONGODB_URI` points at a database this environment owns
- [ ] `CLIENT_URL` lists the exact dashboard origin, with no trailing slash
- [ ] `TRUST_PROXY` matches the actual deployment topology
- [ ] No `.env` file is committed — only `.env.example`
- [ ] MongoDB Atlas network access is restricted to the backend's egress addresses
