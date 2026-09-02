## Summary

<!-- What does this PR change, and why? -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] Tooling / CI / dependencies

## How this was verified

<!-- Commands run, manual steps taken, and what you observed. -->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Manually exercised the affected flow

## Screenshots

<!-- Required for UI changes. Include both light and dark themes. -->

## Checklist

- [ ] Commits follow Conventional Commits
- [ ] No secrets, tokens, or connection strings added to the repo
- [ ] Database queries touching user data are scoped by `userId`
- [ ] Any new outbound HTTP request goes through the URL guard (SSRF protection)
- [ ] New UI has loading, empty, and error states, and works at 375px / 768px / 1440px
- [ ] Status is conveyed by text and icon, not by color alone
- [ ] Documentation in `docs/` and `.env.example` updated if behavior or configuration changed
