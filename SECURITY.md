# Security Policy

## Supported versions

PulseKeeper is pre-1.0 and under active development. Only the latest `main` receives security
fixes.

| Version | Supported |
| --- | --- |
| `main` (0.x) | ✅ |
| older tags | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Report privately through
[GitHub Security Advisories](https://github.com/Webasif1/PulseKeeper/security/advisories/new).

Include as much as you can:

- The type of issue (SSRF bypass, authentication bypass, data leak, injection, and so on)
- Affected files, endpoints, or configuration
- Step-by-step reproduction, ideally with a request or payload
- Impact — what an attacker gains
- Any suggested fix

**Response targets**

| Stage | Target |
| --- | --- |
| Acknowledgement | within 72 hours |
| Initial assessment | within 7 days |
| Fix or mitigation plan | within 30 days for confirmed high-severity issues |

Please give us a reasonable window to ship a fix before public disclosure. Reporters are credited
in the advisory and changelog unless they ask otherwise.

## Areas of particular interest

PulseKeeper takes user-supplied URLs and fetches them from the server, so the following carry the
highest risk and are the most valuable to test:

1. **SSRF** — any bypass of the URL guard that lets the backend reach loopback, private,
   link-local, unique-local, or cloud-metadata addresses. This includes DNS rebinding, redirect
   chains, IPv4-mapped IPv6 addresses, unusual IP encodings, and userinfo tricks in URLs.
2. **Tenant isolation** — any request that returns or mutates another user's sites, health
   checks, incidents, notifications, or settings.
3. **Authentication** — token forgery, session fixation, cookie scope or flag weaknesses,
   privilege escalation.
4. **The monitor trigger** — reaching `POST /api/monitor/run` without a valid
   `MONITOR_CRON_SECRET`, or using it for amplification.
5. **Secret exposure** — any path where `MONGODB_URI`, `JWT_SECRET`, or `MONITOR_CRON_SECRET`
   reaches the client bundle, logs, or an API response.

## Out of scope

- Findings against a deployment you do not own or lack permission to test
- Denial of service through volumetric traffic
- Missing hardening headers with no demonstrated impact
- Vulnerabilities in third-party hosting providers rather than in PulseKeeper
- Automated scanner output with no proof of exploitability

## Deploying PulseKeeper safely

- Set a long random `JWT_SECRET` and `MONITOR_CRON_SECRET`; never reuse them across environments.
- Serve the API over HTTPS so authentication cookies keep their `Secure` flag.
- Restrict `CLIENT_URL` to the exact origins you serve the dashboard from.
- Restrict MongoDB Atlas network access to your backend's egress addresses.
- Keep dependencies current; review Dependabot alerts.
- Run the backend where its outbound network access to internal infrastructure is limited — the
  URL guard is defense in depth, not a substitute for network segmentation.
