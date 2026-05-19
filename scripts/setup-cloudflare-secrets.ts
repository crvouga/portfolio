/**
 * Provision Secrets Store secrets for all projects that declare them.
 *
 * Secret names match Worker bindings: <PROJECT_ID>__<SECRET_NAME>
 * (see scripts/cloudflare-secret-names.ts).
 *
 * Requires:
 *   CLOUDFLARE_SECRETS_STORE_ID — Secrets Store ID (default: chrisvouga)
 *   Each secret's value in process.env under the plain name (e.g. DATABASE_URL)
 *
 * Run:
 *   set -a && source .env && set +a
 *   bun run scripts/setup-cloudflare-secrets.ts
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getDeployableProjects } from "../projects.js";
import {
  DEFAULT_SECRETS_STORE_ID,
  secretBindingName,
} from "./cloudflare-secret-names.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CF_DIR = join(__dirname, "..", "cloudflare");

const STORE_ID = process.env.CLOUDFLARE_SECRETS_STORE_ID ?? DEFAULT_SECRETS_STORE_ID;

if (!existsSync(join(CF_DIR, "wrangler.toml"))) {
  console.error(`Missing ${CF_DIR}/wrangler.toml. Run \`bun run generate-cloudflare\` first.`);
  process.exit(1);
}

const missingEnv: string[] = [];
const errors: string[] = [];
let total = 0;
let created = 0;

for (const project of getDeployableProjects()) {
  const secrets = project.secrets ?? [];
  if (secrets.length === 0) continue;

  console.log(`\n== ${project.id} (${secrets.length} secrets) ==`);

  for (const secret of secrets) {
    total++;
    const storeName = secretBindingName(project.id, secret);
    const value = process.env[secret];

    if (value == null || value === "") {
      console.error(`  MISSING env var ${secret} (Secrets Store name: ${storeName})`);
      missingEnv.push(`${project.id}: set ${secret} in your environment`);
      continue;
    }

    const result = spawnSync(
      "bunx",
      [
        "wrangler",
        "secrets-store",
        "secret",
        "create",
        STORE_ID,
        "--name",
        storeName,
        "--value",
        value,
        "--scopes",
        "workers",
        "--remote",
      ],
      { cwd: CF_DIR, encoding: "utf-8", stdio: "inherit" },
    );

    if (result.status !== 0) {
      const msg = `failed to create ${storeName} in store ${STORE_ID} (exit ${result.status ?? "unknown"})`;
      console.error(`  ERROR ${msg}`);
      errors.push(`${project.id}: ${msg}`);
      continue;
    }

    console.log(`  OK    ${storeName}`);
    created++;
  }
}

console.log(`\nStore: ${STORE_ID}`);
console.log(`Results: ${created}/${total} created, ${missingEnv.length} missing env, ${errors.length} errors`);

if (missingEnv.length > 0) {
  console.error("\nMissing environment variables (no secrets were skipped):");
  for (const m of missingEnv) console.error(`  ${m}`);
}

if (errors.length > 0) {
  console.error("\nWrangler errors:");
  for (const e of errors) console.error(`  ${e}`);
}

if (missingEnv.length > 0 || errors.length > 0) {
  process.exit(1);
}
