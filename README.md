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
  (`auto_stop_machines = "suspend"`, `auto_start_machines = true`, `min_machines_running = 0`,
  deploys use `--ha=false` so each app runs at most one machine). The
  `scale-to-zero-audit` job in `deploy-pipeline.yml` runs `fly:audit-scale`
  after every deploy and fails the pipeline if any app drifts (e.g. a manual
  dashboard change adds a second machine or sets a non-zero minimum).
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
bun run fly:audit-scale                           # verify every Fly app actually scales to zero
bun run fly:stop-running                          # `fly machines stop` any machine still in state=started

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

The deploy pipeline passes `toJSON(secrets)` into
[`scripts/check-github-secrets.ts`](scripts/check-github-secrets.ts), which
both validates that every `{ source: { t: "github" } }` secret named in
`projects.ts` is present AND re-exports them into `$GITHUB_ENV` for the
secrets-sync step. Adding a new GitHub-sourced secret is therefore:

1. Add the secret under repo Settings → Secrets and variables → Actions.
2. Reference it in `projects.ts` via `fromGithub("MY_SECRET")`.
3. Push. No workflow YAML edit, no per-secret env block.

| Secret | Purpose |
| --- | --- |
| `FLY_API_TOKEN` | `flyctl auth token`. Used by every Fly orchestrator. |
| `CLOUDFLARE_API_TOKEN` | API token with `Zone:Edit` + `DNS:Edit` for the zone. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account that owns the zone. |
| `CLOUDFLARE_SECRETS_STORE_ID` | Only for the legacy Workers decommission script. |
| Anything referenced by `fromGithub(...)` in `projects.ts` | Project-specific secrets — auto-validated and forwarded to Fly. |

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

## Add a deployable project

1. Append a `Project` entry to [`projects.ts`](projects.ts) with
   `deployment.t === "public"` and a `deploy: DeploySpec` block (see
   [Deploy spec fields](#deploy-spec-fields) below).
2. If the project references any `fromGithub("X")` secrets that don't exist
   yet, add them under repo Settings → Secrets and variables → Actions.
3. Push to `main`. `Build And Publish Images` builds the container; the deploy
   pipeline then runs end-to-end:
   - `fly-bootstrap` creates the Fly app + dedicated IPv4/IPv6 (idempotent).
   - `cloudflare-dns-sync` adds the `<sub>.chrisvouga.dev` CNAME.
   - `fly-secrets-sync` validates the GitHub secrets bag and stages every
     declared `SecretSpec`.
   - `fly-deploy` pulls the freshly-built image from ghcr.io and deploys.
   - `health-check` confirms the public URL returns 200.

No manual `fly apps create`, no YAML edits — the registry drives everything.

## Remove a deployable project

1. Delete the entry from `projects.ts` (or set `deploy` to `undefined` to keep
   the portfolio listing as history while removing the infra).
2. Push to `main`. The deploy pipeline notices the orphan Fly app and the
   `fly-teardown` job destroys it (`flyctl apps destroy --yes` removes the
   app, machines, IPs, secrets, and cert in one shot). `cloudflare-dns-sync`
   prunes the dangling CNAME on the same run.

### Teardown safety cap

`fly-teardown` is capped at **`max_teardowns_per_run = 1`** by default so a
typo in `projects.ts` can't wipe out the whole org. To remove >1 project in
a single run:

- Run the workflow via `workflow_dispatch` with `force_teardown: true`, OR
- Set `max_teardowns_per_run` to the explicit count, OR
- Land the removals as a series of single-project PRs.

If the cap is hit, the job exits non-zero with the orphan list in the run log.

## Deploy spec fields

```ts
deploy: {
  githubRepo: "owner/repo",          // required — used by clone + image build
  hostname: "<sub>.chrisvouga.dev",  // required — Cloudflare CNAME source
  port: 8080,                        // required — internal_port in fly.toml
  build: {                           // optional overrides; sensible defaults
    checkoutDir: "<dir-name>",       //   default: repo basename
    context: "<sub-dir>",            //   default: "."
    dockerfile: "<path>/Dockerfile", //   default: "<context>/Dockerfile"
  },
  secrets: [                         // optional — staged via `fly secrets set`
    fromGithub("API_KEY"),                                // process.env[name]
    literal("PORT", "8080"),                              // inline value
    computed("BASE_URL", (c) => `https://${c.hostname}`), // derived per app
    generated("SIGNING_KEY", randomHex32),                // set ONCE, preserved
  ],
},
resume: { include: false }          // optional — drop from the resume PDF
resume: { priority: 100 }           // optional — pin to the top of the resume
```

That's it — every other piece of automation is generated from `projects.ts`.
