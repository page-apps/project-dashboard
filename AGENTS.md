# GitHub Dashboard app guide

This app follows App Framework's explicit `pat-authorized` multi-repository dashboard pattern. `framework/` is the pinned source submodule for shared capabilities.

- Use `@repo-apps/credentials` for session or approved shared PAT access.
- Use `@repo-apps/authorized-github` for the allowlisted dashboard API routes. Never import Octokit, call GitHub endpoints directly, or read credential storage in feature code.
- The token's repository grants are the only repository boundary. Do not add arbitrary owner/repository configuration.
- Do not persist a PAT in app preferences. Shared PAT access is opt-in on first use; app registration enables reuse on later visits.
- Keep the immutable framework security disclosure visible in the connection UI.
- Explain that the PAT-authorized scope may include multiple repositories and that only the dashboard API allowlist is available to app features.
- Never put credentials in source, logs, URLs, environment files, fixtures, or Pages output.
- Preserve the `repositoryScope: "pat-authorized"` declaration in `repo-app.config.ts` and the app entry in the Page Apps registry.

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` from this repository when asked to verify changes.
