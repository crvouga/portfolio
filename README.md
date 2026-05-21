# chrisvouga.dev

Source for [chrisvouga.dev](https://www.chrisvouga.dev) and the public side projects deployed under it.

## Architecture

```
GitHub repo ──▶ GitHub Actions
                  │           │
                  │           ▼
                  │     ghcr.io/<owner>/chrisvouga-<id>:<sha>
                  │           │
                  ▼           ▼
        Cloudflare DNS ◀── Fly app (chrisvouga-<id>)
              │              scale-to-zero
              ▼
            users
```

- **Compute**: one Fly.io app per deploy target, name `chrisvouga-<id>`. Scale-to-zero by default
  (`auto_stop_machines = "stop"`, `min_machines_running = 0`).
- **Images**: built once per deploy target and pushed to `ghcr.io/<owner>/chrisvouga-<id>`
  (the same image is consumed verbatim by Fly).
- **DNS**: a single Cloudflare zone (`chrisvouga.dev`) with one CNAME per target
  (`<sub>.chrisvouga.dev → chrisvouga-<id>.fly.dev`). Cloudflare is **DNS-only** —
  no proxying — so Fly issues and renews the TLS certificate directly.
- **State**: [`projects.ts`](projects.ts) is the only source of truth. Every script,
  matrix, and workflow reads it.

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Static site generator for the portfolio (built into `dist/`). |
| `projects.ts` | Single source of truth for every project (display + deployable infra). |
| `fly/` | Generic `fly.toml` template rendered per app at deploy time. |
| `scripts/lib/` | Typed wrappers around `flyctl` and the Cloudflare REST API. |
| `scripts/fly/` | Orchestrators: `bootstrap-apps`, `sync-secrets`, `deploy-app`, `teardown-apps`. |
| `scripts/cloudflare/` | Orchestrators: `setup-zone`, `sync-dns`. |
| `scripts/decommission-cloudflare-workers.ts` | One-time legacy Cloudflare Workers cleanup. |
| `.github/workflows/` | `bootstrap`, `build-and-publish-images`, `deploy-pipeline`, `decommission-cloudflare-workers`. |

## Common scripts

```bash
bun run clone-projects                            # clone every sibling project repo
bun run typecheck                                 # tsc across the repo
bun run health-check-urls                         # GET every public URL

bun run cf:setup-zone                             # ensure Cloudflare zone(s) exist + print NS
bun run cf:sync-dns                               # plan DNS reconciliation
bun run cf:sync-dns -- --apply                    # apply DNS reconciliation

bun run fly:bootstrap                             # idempotent: create missing Fly apps + IPs
bun run fly:sync-secrets                          # plan secrets push
bun run fly:deploy -- --id pickflix --sha <sha>   # deploy a single app
bun run fly:teardown                              # plan orphan Fly app cleanup

bun run decommission-cloudflare-workers           # dry-run legacy Workers teardown
```

## GitHub Actions

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `bootstrap.yml` | manual | Ensure Cloudflare zones exist + print nameservers, then create Fly apps. |
| `build-and-publish-images.yml` | push to `main`, manual | Build a Docker image per target and push to ghcr.io. |
| `deploy-pipeline.yml` | push to `main`, manual, dispatched by build workflow | DNS sync → secrets sync → fly deploy (matrix) → health check. |
| `decommission-cloudflare-workers.yml` | manual | Tear down legacy Cloudflare Worker / Containers / Secrets Store. |

## Required GitHub secrets

| Secret | Purpose |
| --- | --- |
| `FLY_API_TOKEN` | `flyctl auth token`. |
| `CLOUDFLARE_API_TOKEN` | API token with `Zone:Edit` + `DNS:Edit` for the zone. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account that owns the zone. |
| `CLOUDFLARE_SECRETS_STORE_ID` | Only needed for the legacy Workers decommission script. |
| `TMDB_API_READ_ACCESS_TOKEN` | Pickflix-only secret piped into Fly. |
| `TWILIO_ACCOUNT_SID` | Notifier secret piped into Fly. |
| `TWILIO_AUTH_TOKEN` | Notifier secret piped into Fly. |
| `TWILIO_SERVICE_SID` | Notifier secret piped into Fly. |

`GITHUB_TOKEN` is provided automatically and is used to push images to ghcr.io.

## One-time cutover (registrar → Cloudflare → Fly)

1. **Set GitHub secrets** above on the repo (Settings → Secrets and variables → Actions).
2. **Run `Bootstrap (Fly + Cloudflare)`** with `mode = zones`. The job prints the
   nameservers Cloudflare assigned to `chrisvouga.dev`.
3. **Update the registrar** to point `chrisvouga.dev` at those nameservers and wait
   for delegation to propagate (`dig NS chrisvouga.dev` → Cloudflare values).
4. **Run `Bootstrap (Fly + Cloudflare)` again** with `mode = apps` to create one
   Fly app per deploy target and allocate dedicated IPv4/IPv6 addresses.
5. **Run `Build And Publish Images`** (or push a change that touches `Dockerfile` /
   `projects.ts`) to populate `ghcr.io`. The workflow auto-dispatches
   `deploy-pipeline.yml` on success.
6. **Watch `Deploy Pipeline`**: Cloudflare CNAMEs are reconciled, secrets are
   pushed to Fly, every app is deployed, and the health-check job confirms each
   public URL returns 200.
7. **Decommission the legacy Cloudflare Workers infra** by running the
   `Decommission Cloudflare Workers` workflow, first as a dry-run, then with
   `apply = true`. It only touches the legacy Worker, container apps, custom-
   domain routes, and Secrets Store — never DNS.

## Adding a new deploy target

1. Add the project to [`projects.ts`](projects.ts) with `deployment.t === "public"` and
   the required `githubRepo`, `hostname`, `port`, and `secrets` fields.
2. Re-run `Bootstrap (Fly + Cloudflare)` with `mode = apps` so the new Fly app exists.
3. Push to `main` (or run the build workflow manually). The deploy pipeline will
   add the CNAME, push secrets, deploy the image, and wait for the Fly cert.

That's it — every other piece of automation is generated from `projects.ts`.
