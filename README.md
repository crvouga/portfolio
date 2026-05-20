# chrisvouga.dev

Source for [chrisvouga.dev](https://www.chrisvouga.dev) and the public side projects deployed under it.

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Static site generator for the portfolio (built into `dist/`). |
| `projects.ts` | Single source of truth for every project (display + deployable infra). |
| `aws/` | CDK app — ECR, Route53, Lambda + CloudFront, GitHub OIDC. |
| `scripts/` | One-off operational scripts (clone, health-check, decommission, matrix). |
| `.github/workflows/` | Deployment, image build, Route53 cutover, Cloudflare decommission. |

## Deployment

The site and every public project run as Lambda container functions behind CloudFront, with Route53 as the DNS authority. See [`aws/README.md`](aws/README.md) for the full architecture and runbook.

```
projects.ts ──▶ generate-aws-deploy-matrix ──▶ Build And Publish Images (workflow)
                                                  │
                                                  ▼
                                            ECR :latest, :<sha>
                                                  │
                            cdk deploy LambdaServicesStack ──▶ Lambda + Function URL + CloudFront
                                                  ▲
                                                  │
                                          Route53Stack hosted zones
```

## Common scripts

```bash
bun run clone-projects                  # clone every sibling project repo
bun run cdk:synth                       # synth CDK stacks
bun run cdk:deploy                      # deploy all CDK stacks
bun run print-route53-nameservers       # read Route53Stack outputs
bun run health-check-urls               # ping every public URL
bun run decommission-cloudflare         # dry-run Cloudflare teardown
bun run decommission-cloudflare --apply # actually delete Cloudflare resources
```

## Cutover from Cloudflare

1. Ensure `vars.AWS_ACCOUNT_ID` / `vars.AWS_REGION` are set on the GitHub repo.
2. Run **GithubOidcStack + EcrStack** locally (one-off bootstrap):
   `cd aws && npx cdk deploy GithubOidcStack EcrStack`.
3. Trigger the **Build And Publish Images** workflow to push initial images to ECR.
4. Trigger the **Route53 Cutover** workflow; copy the printed nameservers into the domain registrar.
5. Wait for delegation propagation, then trigger the **Deployment Pipeline** workflow.
6. Once health checks pass, trigger the **Decommission Cloudflare** workflow (dry-run first, then `apply: true`).
