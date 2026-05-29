/**
 * Validate that every Doppler-sourced secret declared in `projects.ts` is
 * present in the environment. In CI this script runs INSIDE `doppler run`, so
 * Doppler has already injected each secret as an env var of the same name:
 *
 *   doppler run -- bun run scripts/check-doppler-secrets.ts
 *
 * Adding a brand-new Doppler-sourced secret therefore only requires:
 *   1. Add the secret in Doppler (one-time, in the config the CI token targets).
 *   2. Reference it from `projects.ts` as `fromDoppler("MY_SECRET")`.
 * No workflow YAML edit, no per-secret env block.
 *
 * Exit codes:
 *   0  — every required secret is present.
 *   1  — at least one required secret is missing or empty.
 */
import { allDopplerSecretNames } from "../projects.js";

function main(): void {
  const required = allDopplerSecretNames();
  if (required.length === 0) {
    console.log("No Doppler-sourced secrets declared in projects.ts.");
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
      `Missing Doppler secrets referenced by projects.ts:\n  - ${missing.join(
        "\n  - ",
      )}\nAdd them in Doppler (in the config this CI token targets), run the ` +
        `command under \`doppler run --\`, or remove them from projects.ts.`,
    );
    process.exit(1);
  }

  console.log(`OK: ${present.length}/${required.length} Doppler-sourced secrets present.`);
}

main();
