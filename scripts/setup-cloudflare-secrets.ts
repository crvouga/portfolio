/**
 * Seed Cloudflare Secrets Store from environment variables (GitHub repo secrets in CI).
 *
 * Uses wrangler (same auth as deploy) — not the REST API directly.
 *
 * Requires:
 *   CLOUDFLARE_SECRETS_STORE_ID — Secrets Store ID (GitHub: secrets.CLOUDFLARE_SECRETS_STORE_ID)
 *   CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getSecretSeedPlan, getSecretsStoreId } from "./cloudflare-secret-names.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CF_DIR = join(__dirname, "..", "cloudflare");

let STORE_ID: string;
try {
  STORE_ID = getSecretsStoreId();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const API_TOKEN = process.env["CLOUDFLARE_API_TOKEN"]?.trim();
const ACCOUNT_ID = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim();

if (!existsSync(join(CF_DIR, "wrangler.toml"))) {
  console.error(`Missing ${CF_DIR}/wrangler.toml. Run \`bun run generate-cloudflare\` first.`);
  process.exit(1);
}

if (!API_TOKEN || !ACCOUNT_ID) {
  console.error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.");
  process.exit(1);
}

function wranglerEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CLOUDFLARE_API_TOKEN: API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  };
}

type WranglerResult = { status: number | null; stdout: string; stderr: string };

function runWrangler(args: string[]): WranglerResult {
  const r = spawnSync("bunx", ["wrangler", ...args], {
    cwd: CF_DIR,
    encoding: "utf-8",
    env: wranglerEnv(),
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function verifyAuth(): void {
  const r = runWrangler(["whoami"]);
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    console.error(
      "\nCloudflare authentication failed. Create a token at https://dash.cloudflare.com/profile/api-tokens with:\n" +
        "  - Account > Secrets Store > Edit\n" +
        "  - Account > Workers Scripts > Edit\n",
    );
    process.exit(1);
  }
  console.log(r.stdout.trim());
}

/** Parse wrangler list output for secret name → id. */
function parseSecretListOutput(text: string): Map<string, string> {
  const byName = new Map<string, string>();

  for (const line of text.split("\n")) {
    const idMatch = line.match(/\b([a-f0-9]{32})\b/);
    const nameMatch = line.match(/\b(PORTFOLIO_[A-Z0-9_]+)\b/);
    if (idMatch && nameMatch) {
      byName.set(nameMatch[1]!, idMatch[1]!);
    }
  }

  const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*"result"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      const items = Array.isArray(parsed)
        ? parsed
        : ((parsed as { result?: { name: string; id: string }[] }).result ?? []);
      for (const s of items) {
        if (s && typeof s === "object" && "name" in s && "id" in s) {
          const row = s as { name: string; id: string };
          byName.set(row.name, row.id);
        }
      }
    } catch {
      /* ignore non-JSON */
    }
  }

  return byName;
}

function listSecretsByName(): Map<string, string> {
  const byName = new Map<string, string>();
  let page = 1;

  for (;;) {
    const r = runWrangler([
      "secrets-store",
      "secret",
      "list",
      STORE_ID,
      "--remote",
      "--per-page",
      "100",
      `--page=${String(page)}`,
    ]);
    if (r.status !== 0) {
      throw new Error(
        `wrangler secrets-store secret list failed (exit ${r.status ?? "?"}):\n${r.stderr || r.stdout}\n` +
          "Ensure the API token has Account > Secrets Store > Edit.",
      );
    }

    const chunk = parseSecretListOutput(`${r.stdout}\n${r.stderr}`);
    for (const [name, id] of chunk) {
      byName.set(name, id);
    }
    if (chunk.size < 100) break;
    page++;
  }

  return byName;
}

function upsertSecret(name: string, value: string, existingByName: Map<string, string>): void {
  const existingId = existingByName.get(name);

  if (existingId) {
    const r = runWrangler([
      "secrets-store",
      "secret",
      "update",
      STORE_ID,
      "--secret-id",
      existingId,
      "--value",
      value,
      "--scopes",
      "workers",
      "--remote",
    ]);
    if (r.status !== 0) {
      throw new Error(r.stderr || r.stdout || `update failed for ${name}`);
    }
    return;
  }

  const create = runWrangler([
    "secrets-store",
    "secret",
    "create",
    STORE_ID,
    "--name",
    name,
    "--value",
    value,
    "--scopes",
    "workers",
    "--remote",
  ]);

  if (create.status === 0) {
    return;
  }

  const combined = `${create.stdout}\n${create.stderr}`.toLowerCase();
  if (combined.includes("already") || combined.includes("exist") || combined.includes("duplicate")) {
    const id = listSecretsByName().get(name);
    if (!id) {
      throw new Error(`secret ${name} already exists but could not resolve secret id`);
    }
    existingByName.set(name, id);
    upsertSecret(name, value, existingByName);
    return;
  }

  throw new Error(create.stderr || create.stdout || `create failed for ${name}`);
}

verifyAuth();

let existingByName: Map<string, string>;
try {
  existingByName = listSecretsByName();
  console.log(`Secrets Store "${STORE_ID}": ${existingByName.size} existing secret(s)`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const missingEnv: string[] = [];
const errors: string[] = [];
let total = 0;
let upserted = 0;

for (const entry of getSecretSeedPlan()) {
  const { projectId, binding, source, githubSecret, hardcodedValue } = entry;
  total++;

  const value =
    source === "hardcoded"
      ? hardcodedValue
      : githubSecret != null
        ? process.env[githubSecret]
        : undefined;

  if (value == null || value === "") {
    console.error(`  MISSING ${githubSecret ?? binding} → ${binding}`);
    missingEnv.push(`${projectId}: set repo secret ${githubSecret ?? binding}`);
    continue;
  }

  try {
    const hadId = existingByName.has(binding);
    upsertSecret(binding, value, existingByName);
    const label =
      source === "hardcoded"
        ? " (hardcoded)"
        : githubSecret === binding
          ? ""
          : ` (from ${githubSecret})`;
    console.log(`  OK    ${binding}${label}${hadId ? " (updated)" : " (created)"}`);
    upserted++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ERROR ${binding}: ${msg}`);
    errors.push(`${projectId}: ${msg}`);
  }
}

console.log(`\nStore: ${STORE_ID}`);
console.log(
  `Results: ${upserted}/${total} upserted, ${missingEnv.length} missing, ${errors.length} errors`,
);

if (missingEnv.length > 0) {
  console.error("\nMissing GitHub repo secrets (source of truth):");
  for (const m of missingEnv) console.error(`  ${m}`);
}

if (errors.length > 0) {
  console.error("\nErrors:");
  for (const e of errors) console.error(`  ${e}`);
}

if (missingEnv.length > 0 || errors.length > 0) {
  process.exit(1);
}
