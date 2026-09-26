# GitHub Dashboard

A GitHub Pages PWA for reviewing repositories, pull requests, and workflow health across repositories authorized by the connected PAT.

## Framework pattern

This app uses the App Framework's explicit `pat-authorized` multi-repository dashboard scope. The `framework/` submodule pins the shared credentials, runtime, UI, and allowlisted GitHub API packages. App features never read stored credentials or call GitHub directly. GitHub grants determine which repositories are visible; topic edits and PR merges require the matching repository permissions.

The Page Apps index can hold an optional same-origin shared PAT. On first use, choose **Use shared PAT from Page Apps** to approve it for this app. Later visits reuse that approval after verifying the GitHub account and repository-list access. A PAT entered directly in Settings is kept in session storage only. Neither path places a token in app preferences, source, URLs, build variables, logs, or Pages artifacts.

## Run locally

Requirements: Node.js 24 and pnpm 11.20.0.

```sh
git clone --recurse-submodules git@github.com:page-apps/project-dashboard.git
cd project-dashboard
pnpm install --frozen-lockfile
pnpm dev
```

To build and preview the Pages app:

```sh
pnpm build
pnpm preview
```

## PAT permissions

Use a fine-grained, expiring PAT and select only the repositories this dashboard should access.

- Metadata: read (included automatically)
- Pull requests: read and write for merge actions
- Actions: read for workflow status
- Administration: write to edit repository topics

Organization repositories may require organization approval. The token must be granted access to each repository you want the dashboard to list.

## Security

This is a personal-use static app. Same-origin apps, browser extensions, XSS, or compromised dependencies can access browser-held data. Prefer the Page Apps shared PAT manager and a fine-grained token restricted to the smallest useful repository set. Disconnecting this app leaves the hub's shared PAT in place; removing the shared PAT in the hub revokes reuse for all apps.
