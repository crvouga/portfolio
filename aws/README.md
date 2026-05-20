# AWS infrastructure — chrisvouga.dev

True scale-to-zero deployment for the portfolio meta-site and every public project listed in [`../projects.ts`](../projects.ts).

## Architecture

```
GitHub Actions ──build──▶ ECR ──image──▶ Lambda (container) ──Function URL──▶ CloudFront ──ACM──▶ Route53 ──▶ public hostname
```

Stacks (all CDK, deployed in `us-east-1` so the ACM certs work with CloudFront):

| Stack | Purpose |
| --- | --- |
| `GithubOidcStack` | OIDC provider + role assumed by every GitHub Actions deploy job. |
| `EcrStack` | One ECR repository per deploy target (`portfolio` + every public project). |
| `Route53Stack` | Hosted zone(s) for each apex domain (`chrisvouga.dev`, ...). Outputs nameservers for the registrar cutover. |
| `LambdaServicesStack` | One container Lambda + Function URL + CloudFront distribution + ACM cert + A/AAAA records per target. |

## Scale-to-zero details

- Each app runs as a Lambda container image.
- The image bundles the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) so the original HTTP server (nginx, express, axum, etc.) keeps listening on its native port (`AWS_LWA_PORT` is wired from `project.port`).
- Lambda is billed per invocation; idle apps cost nothing.
- CloudFront in front of the Function URL gives a stable hostname/cert and the standard CDN edge cache (which is set to `CACHING_DISABLED` by default — origin chooses caching via `Cache-Control`).

## Secrets

Every entry in `project.secrets` is injected as a Lambda environment variable resolved at deploy time from SSM Parameter Store at:

```
/chrisvouga/{project.id}/{SECRET_NAME}
```

> Lambda environment variables only support `{{resolve:ssm:...}}` (plain `String`),
> not `ssm-secure`. Store secrets as `String`. IAM still gates access. The Lambda
> execution role is also granted `ssm:GetParameter*` on `/chrisvouga/{project.id}/*`
> if you'd prefer to fetch from inside the app at startup.

Create / update parameters via:

```bash
aws ssm put-parameter \
  --name /chrisvouga/pickflix/TMDB_API_READ_ACCESS_TOKEN \
  --type String \
  --value "your-token" \
  --overwrite
```

## Initial cutover runbook

1. **Bootstrap CDK** in the target AWS account once (`us-east-1`):

   ```bash
   cd aws
   npm ci
   export CDK_DEFAULT_ACCOUNT=123456789012
   export CDK_DEFAULT_REGION=us-east-1
   npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
   ```

2. **Deploy `GithubOidcStack` and `EcrStack`** so CI can push images:

   ```bash
   npx cdk deploy GithubOidcStack EcrStack
   ```

3. **Push first images** via the `Build And Publish Images` workflow in GitHub Actions (it builds with the Lambda Web Adapter overlay and pushes to ECR with `latest` + `<sha>` tags).
4. **Deploy `Route53Stack`** to provision hosted zones:

   ```bash
   npx cdk deploy Route53Stack
   bun run scripts/print-route53-nameservers.ts
   ```

5. **Update domain registrar NS records** to the values printed above.
   Wait for delegation propagation (~15 min - 48 h depending on TTLs).
6. **Deploy `LambdaServicesStack`** — ACM certs validate against the now-authoritative Route53 zones, CloudFront distributions come up, A/AAAA records flip the public hostnames to AWS:

   ```bash
   npx cdk deploy LambdaServicesStack
   bun run scripts/health-check-urls.ts
   ```

7. **Decommission Cloudflare** once health checks pass:

   ```bash
   bun run scripts/decommission-cloudflare.ts            # dry-run
   bun run scripts/decommission-cloudflare.ts --apply
   ```

## CI

GitHub Actions automates the same flow:

- `build-and-publish-images.yml` — build + push images to ECR.
- `deployment-pipeline.yml` — deploy CDK stacks then run health checks.
- `route53-cutover.yml` — manual workflow that prints nameservers for the registrar update.
- `decommission-cloudflare.yml` — manual workflow that runs the Cloudflare teardown script (dry-run by default).
