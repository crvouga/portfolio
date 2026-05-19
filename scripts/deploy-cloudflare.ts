/**
 * Deploy wrapper around Wrangler with clearer Forbidden diagnostics.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CF_DIR = join(ROOT, "cloudflare");

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function runWranglerDeploy(): { status: number | null; output: string } {
  const result = spawnSync("bunx", ["wrangler", "deploy"], {
    cwd: CF_DIR,
    stdio: "pipe",
    encoding: "utf-8",
    env: process.env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  return { status: result.status, output };
}

function printForbiddenHelp(accountId: string): void {
  console.error("\nDeploy failed with Cloudflare API 'Forbidden'.");
  console.error("Most likely causes:");
  console.error("1) API token is for a different account than CLOUDFLARE_ACCOUNT_ID.");
  console.error("2) Token is missing one or more permissions required by wrangler deploy.");
  console.error("3) Token is missing zone-level access needed for custom_domain routes.");
  console.error("\nRecommended token permissions:");
  console.error("- Account > Workers Scripts > Edit");
  console.error("- Account > Workers Routes > Edit");
  console.error("- Account > Account Settings > Read");
  console.error("- Zone > DNS > Edit (for zones used by custom domains)");
  console.error("- Zone > Zone > Read (for zones used by custom domains)");
  console.error(`\nConfigured CLOUDFLARE_ACCOUNT_ID: ${accountId}`);
  console.error(
    "Verify token/account at https://dash.cloudflare.com/profile/api-tokens and make sure it targets this account.",
  );
}

function printImageRegistryNotConfiguredHelp(): void {
  console.error("\nDeploy failed: IMAGE_REGISTRY_NOT_CONFIGURED");
  console.error(
    "Cloudflare Containers cannot pull one or more images because the registry credentials are not configured.",
  );
  console.error("\nYour images are hosted on Docker Hub, so configure docker.io for this Cloudflare account:");
  console.error("- Run once (with an account-scoped token): `bunx wrangler containers registries configure docker.io`");
  console.error("- Use Docker Hub username + password/token with pull access");
  console.error("- Verify repository exists and is accessible: `docker.io/<username>/chrisvouga-dev`");
}

function inferLikelyZone(hostname: string): string {
  if (hostname.startsWith("www.")) return hostname.slice(4);
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  }
  return hostname;
}

function writeSummary(lines: readonly string[]): void {
  const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
  if (!summaryPath) return;
  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

function printZoneNotFoundHelp(hostname: string, accountId: string): void {
  const likelyZone = inferLikelyZone(hostname);
  console.error(`\nDeploy failed: Cloudflare zone for \`${hostname}\` was not found.`);
  console.error(`Likely required zone: \`${likelyZone}\``);
  console.error("\nNameserver TODO:");
  console.error(`1) Add/import zone \`${likelyZone}\` in Cloudflare under account \`${accountId}\`.`);
  console.error(`2) In Cloudflare, copy the assigned nameservers for \`${likelyZone}\`.`);
  console.error("3) In your registrar/Squarespace, set custom nameservers to Cloudflare's values.");
  console.error("4) Wait for DNS delegation propagation (can take up to 48h).");
  console.error("5) Re-run Deployment Pipeline.");

  writeSummary([
    "## Deploy blocked: zone not found",
    "",
    `Wrangler could not find Cloudflare zone for \`${hostname}\`.`,
    `Likely required zone: \`${likelyZone}\`.`,
    "",
    "### Nameserver TODO",
    `1. Add/import zone \`${likelyZone}\` in Cloudflare under account \`${accountId}\`.`,
    `2. Copy the assigned nameservers from Cloudflare for \`${likelyZone}\`.`,
    "3. In registrar/Squarespace, set **custom nameservers** to those Cloudflare nameservers.",
    "4. Wait for delegation propagation (up to 48h).",
    "5. Re-run this workflow.",
  ]);
}

function main(): void {
  if (!existsSync(join(CF_DIR, "wrangler.toml"))) {
    console.error(`Missing ${CF_DIR}/wrangler.toml. Run 'bun run generate-cloudflare' first.`);
    process.exit(1);
  }

  try {
    requiredEnv("CLOUDFLARE_API_TOKEN");
    const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
    const result = runWranglerDeploy();
    if (result.status === 0) return;

    if (result.output.includes("IMAGE_REGISTRY_NOT_CONFIGURED")) {
      printImageRegistryNotConfiguredHelp();
    } else {
      const zoneMatch = result.output.match(/Could not find zone for `([^`]+)`/);
      if (zoneMatch) {
        printZoneNotFoundHelp(zoneMatch[1]!, accountId);
      }
      if (result.output.includes("[ERROR] Forbidden") || result.output.includes("code: 10000")) {
        printForbiddenHelp(accountId);
      }
    }
    process.exit(result.status ?? 1);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
