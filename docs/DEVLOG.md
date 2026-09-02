# Development Log

A running journal of how PulseKeeper is being built: what landed in each phase, the decisions
behind it, and anything deferred. Newest entries at the top.

For released versions see [CHANGELOG.md](CHANGELOG.md). For the original product specification
see [SPEC.md](SPEC.md).

---

## Phase 0 — Repository scaffold

**Date:** 2026-09-02 · **Branch:** `chore/repo-scaffold`

### What landed

- Moved the original `Readme.md` — which was the product specification, not a readme — to
  `docs/SPEC.md`, preserved verbatim as the reference for intended behavior.
- Wrote a real `README.md`: overview, features, stack, architecture diagram, folder structure,
  local setup, environment variables, deployment, security, known limitations, roadmap.
- Open-source scaffolding: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor
  Covenant 2.1), `SECURITY.md` with private vulnerability reporting.
- GitHub configuration: issue forms for bugs and features, issue-template config routing security
  reports away from public issues, pull request template, Dependabot, and a CI workflow running
  typecheck, lint, test, and build on every push and PR.
- Tooling: npm workspaces root (`server`, `client`), `docker-compose.yml` with `mongo:7`,
  `.gitignore`, `.editorconfig`, `.nvmrc`.
- Documentation skeleton: this devlog, `CHANGELOG.md`, and `ARCHITECTURE.md`.

### Decisions

- **Product name is PulseKeeper**, matching the repository. The specification called the product
  "Site Health Monitor"; that stays as the descriptive tagline.
- **npm workspaces, not two detached projects.** One `npm install`, one lockfile, one CI job, and
  a single `npm run dev` that starts both sides — significantly less friction for contributors.
- **Docker MongoDB for development, Atlas for production.** Contributors get a working database
  without creating an account; `MONGODB_URI` swaps to Atlas with no code change.
- **Docs live in `docs/`, not in the README.** The README stays scannable and links out to
  architecture, API, configuration, deployment, and SSRF detail.
- **Positioning follows SPEC §4.** The product is a monitoring platform; keep-alive is secondary
  and carries an explicit caveat that it cannot guarantee a provider will not sleep a service.
  This is stated in the README rather than buried.
- **CI is strict from the first commit.** Typecheck, lint, test, and build are all required, so
  the project cannot accumulate type or build debt.

### Deferred

- `server/` and `client/` exist only as minimal workspace manifests with no scripts yet. This was
  deliberate: `npm run <script> --workspaces` fails with `No workspaces found!` when the
  directories are absent, which would have made CI red on the very first commit. With the stubs in
  place, `--if-present` turns every root script into a clean no-op until the real workspaces land
  in Phases 1 and 6.
- `docs/API.md`, `CONFIGURATION.md`, `DEPLOYMENT.md`, `SECURITY-SSRF.md`, and `MONITORING.md` are
  written as their subjects are implemented, so they document real code rather than intentions.

### Notes

- `gh` is not installed on the development machine, so pull requests are opened from the GitHub
  compare URL printed after each branch push rather than from the CLI.
