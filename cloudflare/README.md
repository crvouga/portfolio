# Cloudflare Containers Deployment

Deploys all containerized projects to [Cloudflare Containers](https://developers.cloudflare.com/containers/) via a single Worker that routes by hostname.

All configuration is generated from [`../projects.ts`](../projects.ts) -- do not edit `wrangler.toml` or `src/index.ts` by hand.

## Files

- `wrangler.toml` (generated) -- Worker + Container + Durable Object + route config
- `src/index.ts` (generated) -- Container classes and hostname router
- `package.json`, `tsconfig.json` -- Project setup

## Workflow

```bash
bun run generate-cloudflare
cd cloudflare && bun run deploy
```

## Secrets

**GitHub repo secrets are the source of truth.** CI seeds Cloudflare Secrets Store before each deploy.

| GitHub secret | Used by |
|---------------|---------|
| `CLOUDFLARE_API_TOKEN` | Deploy + seed (workflow only) |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy + seed (workflow only) |
| `TMDB_API_READ_ACCESS_TOKEN` | pickflix, all moviefinder apps |
| `TWILIO_ACCOUNT_SID` | moviefinder apps |
| `TWILIO_AUTH_TOKEN` | moviefinder apps |
| `TWILIO_SERVICE_SID` | moviefinder apps |

Each value is copied into per-project Secrets Store bindings (e.g. `MOVIEFINDER_APP_GO__TWILIO_AUTH_TOKEN`). `PORT`, `STAGE`, and pickflix `NODE_ENV` are set as plain container env vars, not GitHub secrets.

Secrets Store ID defaults to `chrisvouga` (override locally with `CLOUDFLARE_SECRETS_STORE_ID`).

## DNS

Routes use `custom_domain = true`. Zones `chrisvouga.dev` and `normalizer.app` must use Cloudflare nameservers.

## Images

`ghcr.io/crvouga/chrisvouga.dev:<id>-latest` from `.github/workflows/deployment-pipeline.yml`.
