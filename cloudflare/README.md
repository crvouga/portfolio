# Cloudflare Containers Deployment

Deploys all containerized projects to [Cloudflare Containers](https://developers.cloudflare.com/containers/) via a single Worker that routes by hostname.

All configuration is generated from [`../projects.ts`](../projects.ts) -- do not edit `wrangler.toml` or `src/index.ts` by hand.

## Files

- `wrangler.toml` (generated) -- Worker + Container + Durable Object + route config
- `src/index.ts` (generated) -- Container classes and hostname router
- `package.json`, `tsconfig.json` -- Project setup

## Workflow

```bash
# Regenerate config from projects.ts
cd cloudflare
bun run generate

# One-time: provision Secrets Store secrets (fails if any env var is missing)
# Requires CLOUDFLARE_SECRETS_STORE_ID (default: chrisvouga)
set -a && source ../.env && set +a
bun run ../scripts/setup-cloudflare-secrets.ts

# Deploy
bun run deploy
```

## Secrets

All project secrets live in [Cloudflare Secrets Store](https://developers.cloudflare.com/secrets-store/) (not per-Worker `wrangler secret put`). Bindings are generated as `[[secrets_store_secrets]]` in `wrangler.toml`.

- Store ID: set `CLOUDFLARE_SECRETS_STORE_ID` when generating/deploying (default: `chrisvouga`)
- Secret names match bindings: `PICKFLIX__DATABASE_URL`, etc.
- Missing or empty secrets return **503** with a loud error message (no silent empty strings)
- Setup script **exits non-zero** if any required env var is missing

## DNS

Routes are configured with `custom_domain = true` which auto-creates DNS records for hostnames in `chrisvouga.dev` and `normalizer.app`. Both zones must be on Cloudflare nameservers.

## Image source

Containers pull from `ghcr.io/crvouga/<id>:latest`, built by `.github/workflows/deployment-pipeline.yml`.
