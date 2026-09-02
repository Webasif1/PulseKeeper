# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Day-to-day build notes and the reasoning behind each phase live in [DEVLOG.md](DEVLOG.md).

## [Unreleased]

### Added

- Backend foundation: Express 5 + TypeScript API with Zod-validated environment configuration,
  MongoDB connection handling, pino structured logging, the shared success/error response
  envelope, typed application errors, request tracing via `x-request-id`, rate limiting, Helmet,
  a CORS origin allowlist, graceful shutdown, and `GET /api/health` plus `/api/health/ready`.
- Repository scaffold: npm workspaces root, Docker-based local MongoDB, `.gitignore`,
  `.editorconfig`, `.nvmrc`.
- Project documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVLOG.md`, this changelog,
  and the original product specification preserved at `docs/SPEC.md`.
- Open-source files: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- GitHub automation: CI workflow (typecheck, lint, test, build), Dependabot, issue forms, and a
  pull request template.

[Unreleased]: https://github.com/Webasif1/PulseKeeper/commits/main
