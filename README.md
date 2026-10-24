# Wiki Rabbit

Wiki Rabbit is a spatial explorer for following connections between Wikipedia articles.

## Run locally

Requires Node.js 22 or newer and pnpm 10.34.7.

```sh
pnpm install
pnpm dev
```

Use `pnpm check`, `pnpm test`, and `pnpm build` to check the app, run unit tests, and create the production site in `dist/`.

## GitHub Pages deployment

The workflow in `.github/workflows/pages.yml` runs on pull requests and pushes to `main`. It installs the locked dependencies, runs the Svelte/TypeScript check and unit tests, and builds the site. Pull requests stop after the build. Successful pushes to `main` publish `dist/` to GitHub Pages; a manual run is also available from the Actions tab.

### One-time repository setup

1. Push this project to the GitHub repository with `main` as its default branch.
2. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
3. Open **Settings → Actions → General** and ensure the workflow has permission to deploy Pages. The workflow grants `pages: write` and `id-token: write` only to its deployment job.
4. Push to `main` or run **CI and deploy to GitHub Pages** from the Actions tab.
5. When the run completes, open **Settings → Pages** or the workflow's `github-pages` environment URL for the site.

The Vite base path is derived from `GITHUB_REPOSITORY`, so a project repository publishes under `/<repository>/`. A user or organization site repository named `<owner>.github.io` publishes from `/`. Local development continues to use `/`.
