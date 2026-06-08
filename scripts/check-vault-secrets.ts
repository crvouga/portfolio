/**
 * Validate that every vault-sourced secret declared in `projects.ts` is
 * present in the environment. In CI this script runs after `vault-action` has
 * exported secrets; locally it runs inside `vault run`, which injects each
 * secret as an env var of the same name:
 *
 *   vault run -- bun run scripts/check-vault-secrets.ts
 *
 * Adding a brand-new vault-sourced secret therefore only requires:
 *   1. Add the field in the store (in the config CI targets).
 *   2. Reference it from `projects.ts` as `fromVault("MY_SECRET")`.
 *   3. Append the key to `.github/actions/vault-secrets/action.yml`.
 *
 * Exit codes:
 *   0  — every required secret is present.
 *   1  — at least one required secret is missing or empty.
 */
import { allVaultSecretNames } from "../projects.js";

function main(): void {
  const required = allVaultSecretNames();
  if (required.length === 0) {
    console.log("No vault-sourced secrets declared in projects.ts.");
    return;
  }

  const missing: string[] = [];
  const present: string[] = [];
  for (const name of required) {
    const value = (process.env[name] ?? "").trim();
    if (!value) {
      missing.push(name);
      continue;
    }
    present.push(name);
  }

  if (missing.length > 0) {
    console.error(
      `Missing vault secrets referenced by projects.ts:\n  - ${missing.join(
        "\n  - ",
      )}\nAdd them in the store (in the config CI targets), run the command ` +
        `under \`vault run --\`, or remove them from projects.ts.`,
    );
    process.exit(1);
  }

  console.log(`OK: ${present.length}/${required.length} vault-sourced secrets present.`);
}

main();
