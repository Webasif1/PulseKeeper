# Contributing to PulseKeeper

Thanks for taking the time to contribute. This document covers how to get the project running,
how the repository is organized, and what a good pull request looks like.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Getting started

```bash
git clone https://github.com/Webasif1/PulseKeeper.git
cd PulseKeeper
npm install
npm run db:up                       # local MongoDB via Docker
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run dev                         # API :5050, client :5173
```

If you cannot run Docker, point `MONGODB_URI` at a MongoDB Atlas cluster instead.

## Repository layout

This is an npm workspaces monorepo with two workspaces:

- `server/` — Express + TypeScript API, monitoring engine, cron jobs
- `client/` — React + Vite + TypeScript dashboard

Cross-cutting documentation lives in `docs/`. The original product specification is preserved
verbatim at [docs/SPEC.md](docs/SPEC.md) and is the reference for intended behavior.

## Ways to contribute

- **Bugs** — open an issue with reproduction steps, expected vs actual behavior, and versions.
- **Features** — open an issue describing the problem before writing code, so the approach can be
  agreed on first.
- **Docs** — corrections and clarifications are as welcome as code.
- **Good first issues** — issues labelled `good first issue` are scoped for newcomers.

---

## Development workflow

### Branches

Branch from `main`, one branch per logical change:

| Prefix | Use |
| --- | --- |
| `feat/` | new functionality |
| `fix/` | bug fix |
| `docs/` | documentation only |
| `refactor/` | behavior-preserving restructuring |
| `test/` | tests only |
| `chore/` | tooling, CI, dependencies |

Example: `feat/slack-notification-channel`.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short imperative summary>

<optional body explaining what and why>
```

```
feat(monitoring): resolve incidents on first successful recheck
fix(ssrf): reject IPv4-mapped IPv6 addresses
docs(deployment): document external cron setup for Render
```

Keep commits focused — several small commits beat one large one.

### Before opening a pull request

```bash
npm run typecheck    # tsc --noEmit in both workspaces
npm run lint
npm test
npm run build        # both workspaces must build clean
```

All four must pass; CI runs the same commands.

### Pull requests

- Target `main`, fill in the PR template, and link the issue it closes.
- Include screenshots or a short clip for any UI change, in both light and dark themes.
- Say how you verified the change — reviewers should not have to guess.
- Keep PRs reviewable. If a change is large, split it.

---

## Code standards

**General**
- TypeScript everywhere; no `any` without a comment explaining why it is unavoidable.
- No secrets, tokens, or connection strings in code, tests, or fixtures.
- Never place an entire feature in one file — follow the existing folder structure.

**Backend**
- Layering is `route → validator → controller → service → model`. Controllers handle HTTP;
  services hold business logic; models hold schema and indexes only.
- Validate every request body, query, and param with a Zod schema in `validators/`.
- Every query touching user data must be scoped by the authenticated `userId`.
- All responses use the shared envelope:
  ```jsonc
  { "success": true,  "message": "...", "data": {} }
  { "success": false, "message": "...", "error": { "code": "...", "details": "..." } }
  ```
- **Any code path that makes an outbound HTTP request must go through the URL guard.** This is
  the project's most important security invariant — see [docs/SECURITY-SSRF.md](docs/SECURITY-SSRF.md).
- One site failing must never abort a monitoring sweep; wrap per-site work in try/catch.
- Log with the shared pino logger, never `console.log`. Never log secrets, tokens, or passwords.

**Frontend**
- Function components and hooks; shared logic goes in `hooks/`, API calls in `services/`.
- Reuse the primitives in `components/ui/` rather than restyling one-off elements.
- Every async view needs loading, empty, and error states.
- Status must be conveyed by text and icon, never by color alone.
- Theme with Tailwind tokens so light, dark, and system modes all work.
- Check new UI at 375px, 768px, and 1440px widths.

**Accessibility**
- Semantic HTML, labelled form controls, visible focus states, keyboard-operable interactions,
  ARIA only where semantics fall short, and sufficient contrast in both themes.

**Tests**
- Vitest in both workspaces. Tests are required for the URL guard, analytics calculations, and
  incident state transitions; encouraged elsewhere.
- Tests must not make real network calls to third parties.

---

## Reporting security issues

Do **not** open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

## License

Contributions are licensed under the [MIT License](LICENSE).
