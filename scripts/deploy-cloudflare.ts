/**
 * Deploy wrapper around Wrangler with clearer Forbidden diagnostics.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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

    if (result.output.includes("[ERROR] Forbidden") || result.output.includes("code: 10000")) {
      printForbiddenHelp(accountId);
    }
    process.exit(result.status ?? 1);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
