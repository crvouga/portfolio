/**
 * Seed Cloudflare Secrets Store from environment variables (GitHub repo secrets in CI).
 *
 * GitHub is the source of truth. Project-specific secrets use binding names
 * (e.g. PICKFLIX__DATABASE_URL). Shared provider secrets (Twilio, TMDB, YouTube,
 * SendGrid) use one GitHub secret each and are copied into every project's binding.
 *
 * Requires:
 *   CLOUDFLARE_SECRETS_STORE_ID — Secrets Store ID (GitHub: secrets.CLOUDFLARE_SECRETS_STORE_ID)
 *   CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID — for upsert via API (CI)
 *   GitHub secret names from getGithubRepoSecretNames() (see cloudflare-secret-names.ts)
 *
 * Run locally (optional):
 *   set -a && source .env && set +a
 *   bun run scripts/setup-cloudflare-secrets.ts
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
const API_TOKEN = process.env["CLOUDFLARE_API_TOKEN"];
const ACCOUNT_ID = process.env["CLOUDFLARE_ACCOUNT_ID"];

if (!existsSync(join(CF_DIR, "wrangler.toml"))) {
  console.error(`Missing ${CF_DIR}/wrangler.toml. Run \`bun run generate-cloudflare\` first.`);
  process.exit(1);
}

type StoreSecretMeta = { id: string; name: string };

async function cfApi<T>(
  path: string,
  init?: RequestInit,
): Promise<{ success: boolean; result: T; errors?: { message: string }[] }> {
  const resp = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  return resp.json() as Promise<{ success: boolean; result: T; errors?: { message: string }[] }>;
}

async function listStoreSecrets(): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  let page = 1;
  for (;;) {
    const data = await cfApi<StoreSecretMeta[]>(
      `/accounts/${ACCOUNT_ID}/secrets_store/stores/${STORE_ID}/secrets?per_page=100&page=${page}`,
    );
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message ?? "failed to list Secrets Store secrets");
    }
    for (const s of data.result) {
      byName.set(s.name, s.id);
    }
    if (data.result.length < 100) break;
    page++;
  }
  return byName;
}

async function upsertSecretViaApi(name: string, value: string, existingId?: string): Promise<void> {
  if (existingId) {
    const data = await cfApi<StoreSecretMeta>(
      `/accounts/${ACCOUNT_ID}/secrets_store/stores/${STORE_ID}/secrets/${existingId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ value, scopes: ["workers"] }),
      },
    );
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message ?? `failed to update ${name}`);
    }
    return;
  }

  const data = await cfApi<StoreSecretMeta[]>(
    `/accounts/${ACCOUNT_ID}/secrets_store/stores/${STORE_ID}/secrets`,
    {
      method: "POST",
      body: JSON.stringify([{ name, value, scopes: ["workers"], comment: "" }]),
    },
  );
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message ?? `failed to create ${name}`);
  }
}

function upsertSecretViaWrangler(name: string, value: string): void {
  const result = spawnSync(
    "bunx",
    [
      "wrangler",
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
    ],
    { cwd: CF_DIR, encoding: "utf-8", stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`wrangler create failed for ${name} (exit ${result.status ?? "unknown"})`);
  }
}

const missingEnv: string[] = [];
const errors: string[] = [];
let total = 0;
let upserted = 0;

const useApi = Boolean(API_TOKEN && ACCOUNT_ID);
let existingByName = new Map<string, string>();

if (useApi) {
  try {
    existingByName = await listStoreSecrets();
    console.log(`Secrets Store "${STORE_ID}": ${existingByName.size} existing secret(s) in account`);
  } catch (err) {
    console.error(`Failed to list Secrets Store: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
} else {
  console.warn(
    "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID not set — using wrangler create only (no upsert).",
  );
}

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
    if (useApi) {
      await upsertSecretViaApi(binding, value, existingByName.get(binding));
      const label =
        source === "hardcoded"
          ? " (hardcoded)"
          : githubSecret === binding
            ? ""
            : ` (from ${githubSecret})`;
      console.log(`  OK    ${binding}${label}${existingByName.has(binding) ? " (updated)" : " (created)"}`);
    } else {
      upsertSecretViaWrangler(binding, value);
      console.log(`  OK    ${binding}${source === "hardcoded" ? " (hardcoded)" : ""}`);
    }
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
