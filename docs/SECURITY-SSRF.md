# SSRF Protection

PulseKeeper accepts URLs from users and fetches them from the server. That is the product's whole
purpose, and it is also the shape of a Server-Side Request Forgery vulnerability: without care, the
API becomes an open proxy into whatever network it runs on — a cloud metadata service holding
credentials, an internal admin panel, a database's HTTP interface.

This document describes what the guard blocks, how, and why it is layered the way it is.

Implementation: [`server/src/utils/urlGuard.ts`](../server/src/utils/urlGuard.ts).
Tests: [`server/src/__tests__/urlGuard.test.ts`](../server/src/__tests__/urlGuard.test.ts).

---

## The rule

**Every outbound HTTP request originating from user-supplied input must pass through the URL
guard.** There is no second path, no "internal" exception, and no flag that turns it off.

If you are adding a feature that fetches something a user named — a webhook, a favicon fetcher, a
status-page importer — it goes through `assertUrlAllowed`, and its socket uses
`createGuardedLookup`.

## What is blocked

### Schemes

Only `http:` and `https:`. Everything else is refused, including `file:`, `ftp:`, `gopher:`,
`data:`, `dict:`, and `javascript:`. `gopher:` and `dict:` matter more than they look: both can be
used to speak to non-HTTP services such as Redis or memcached.

### URL shapes

| Refused | Why |
| --- | --- |
| Embedded credentials (`https://user:pass@host`) | Parsers disagree about which host is addressed; `https://169.254.169.254@example.com` reads differently to different readers |
| URLs over 2048 characters | Bounded input |
| Missing hostname | Nothing to validate |

### Hostnames, before any DNS query

`localhost`, `metadata`, `metadata.google.internal`, `instance-data`, and any name ending in
`.localhost`, `.local`, `.internal`, `.intranet`, `.lan`, `.home.arpa`, `.corp`, or `.private`.
A trailing dot (`localhost.`) is stripped first, since it names the same host to a resolver.

Refusing by name avoids leaking the lookup to a DNS server at all, and gives a clearer error.

### Addresses

The address policy is an **allowlist, not a denylist**: an address is permitted only if
`ipaddr.js` classifies it as public `unicast`. Everything else is refused — loopback, private,
link-local, unique-local, carrier-grade NAT, multicast, broadcast, reserved, unspecified, 6to4,
and Teredo.

This direction matters. A denylist of ranges needs an update every time a new special-purpose
range is assigned; an allowlist of "ordinary public addresses" does not.

Covered by that rule, and tested explicitly:

| Range | Example |
| --- | --- |
| `127.0.0.0/8` | `127.0.0.1`, and the shorthand `127.1` |
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | private networks |
| `169.254.0.0/16` | link-local, including `169.254.169.254` |
| `100.64.0.0/10` | carrier-grade NAT |
| `0.0.0.0`, `255.255.255.255`, `224.0.0.0/4` | unspecified, broadcast, multicast |
| `::1`, `fe80::/10`, `fc00::/7` | IPv6 loopback, link-local, unique-local |

Cloud metadata endpoints are additionally denied by exact address — `169.254.169.254` (AWS, Azure,
GCP, DigitalOcean), `100.100.100.100` (Alibaba), `192.0.0.192` (Oracle), `fd00:ec2::254` (AWS
IPv6) — so the intent survives any future change to the range policy and the reason appears in the
logs.

### Encodings and disguises

Blocking `127.0.0.1` as a string is not enough, because the same address has many spellings. The
guard parses addresses rather than matching them as text, so these are all refused:

- `http://2130706433` — decimal form of `127.0.0.1`
- `http://0x7f000001` — hexadecimal form
- `http://127.1` — the shorthand form
- `http://[::ffff:127.0.0.1]` — IPv4-mapped IPv6. Mapped addresses are unwrapped to the IPv4
  address they carry and judged on that, so loopback cannot hide inside an IPv6 literal.

### Redirects

A URL that is public on the first hop can redirect to `169.254.169.254` on the second. Redirects
are therefore **followed manually and revalidated at every hop**, rather than handed to `fetch`,
which would follow them without asking. A relative `Location` is resolved against the URL that
produced it before being checked.

---

## Why three layers

| Layer | When | What it catches |
| --- | --- | --- |
| `assertUrlAllowed` on write | Site created or edited | Bad input, refused before it is stored |
| `assertUrlAllowed` at check time | Each monitoring run | A hostname whose DNS record changed after it was stored |
| `createGuardedLookup` at connect time | Inside the socket's DNS lookup | DNS rebinding |

The third layer is the one that is easy to omit and hard to do without.

Validating a hostname and then making a request leaves a gap: a DNS record with a one-second TTL
can answer the validation lookup with a public address and the socket's own lookup with
`127.0.0.1`. Nothing in the validating code is wrong; it simply asked a question whose answer
expired. Validating **inside the lookup the socket actually uses** removes the gap, because the
address checked is the address connected to.

Checking every returned address, rather than the first, matters for the same reason: a hostname
that answers with one public and one private address must be refused outright, or the guard's
outcome depends on resolver ordering that an attacker controls.

## Error messages

Blocked addresses are logged server-side but **never echoed back to the client**. A response
saying "10.0.4.17 is not allowed" turns the endpoint into an internal network mapper: an attacker
points hostnames at address ranges and reads the replies. The client is told only that the URL
resolves to a private or reserved address.

## Defense in depth

The guard is not a substitute for network controls. On a production deployment:

- Run the backend where its outbound access to internal infrastructure is restricted.
- Do not grant the monitoring process credentials it does not need.
- Prefer a hosting environment where the metadata service requires a session token (IMDSv2).

## Known limitations

- **A monitored site can still be a proxy.** PulseKeeper checks the address it connects to, not
  what the remote server does afterwards. A user monitoring their own open proxy can reach
  anything that proxy can.
- **IPv6 coverage depends on `ipaddr.js` range data.** It is current and well maintained, but a
  newly assigned special-purpose range is only covered once the library knows about it. The
  allowlist approach means unknown ranges classified as `unicast` would be permitted.
- **DNS answers are trusted as given.** The guard does not perform DNSSEC validation; a
  compromised resolver can return whatever it likes, which is why the connect-time check exists.

## Reporting a bypass

Please report privately — see [SECURITY.md](../SECURITY.md). SSRF bypasses are the highest-value
findings in this project.
