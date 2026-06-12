# portfolio

Source for [chrisvouga.dev](https://www.chrisvouga.dev) — portfolio content, static site generator, and the portfolio container image.

## Architecture

```
projects.ts (content) ──▶ src/ SSG ──▶ dist/ ──▶ Dockerfile ──▶ ghcr.io/crvouga/chrisvouga-portfolio
                                                                                    │
                                                                                    ▼
                                                                        chrisvouga.dev deploy pipeline
```

Side projects are hosted separately: each project repo publishes its own image, and
[chrisvouga.dev](https://github.com/crvouga/chrisvouga.dev) orchestrates the single-node
Docker stack from `services.yaml`.

- **Content**: [`projects.ts`](projects.ts) is the source of truth for project listings (titles, descriptions, images, public URLs, topics).
- **Hosting**: runtime deploy config for side projects lives in `chrisvouga.dev/services.yaml`.
- **This repo's image**: `publish-image.yml` builds the portfolio static site from the root `Dockerfile`.

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Static site generator (built into `dist/`). |
| `projects.ts` | Content registry for every project on the portfolio. |
| `scripts/health-check-urls.ts` | Validates public URLs linked from portfolio content. |
| `Dockerfile`, `nginx.conf` | Portfolio site container. |
| `.github/workflows/` | CI (typecheck, link health-check) and image publish. |

## Common scripts

```bash
bun run typecheck          # tsc across the repo
bun run build              # generate dist/
bun run health-check-urls  # GET every public URL in content
bun run preview            # build and run portfolio container locally
```

## GitHub Actions

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `deploy-pipeline.yml` | push to `main`, manual | Typecheck + health-check public URLs. |
| `publish-image.yml` | push to `main` | Build/push `ghcr.io/crvouga/chrisvouga-portfolio` and notify chrisvouga.dev deploy. |

## Add a project to the portfolio

1. Append a `Project` entry to [`projects.ts`](projects.ts) with display fields and `deployment.url` (when public).
2. Push to `main`. CI typechecks and validates linked URLs.

## Add or change hosting for a side project

Edit [chrisvouga.dev/services.yaml](https://github.com/crvouga/chrisvouga.dev/blob/main/services.yaml) and the project repo's Dockerfile / `publish-image.yml`. Portfolio only needs the public `deployment.url` (and content fields) to match.

## Local development

```bash
bun install
bun run dev    # watch build + serve dist/
bun run build  # one-shot build
```
