/**
 * Validate that every GitHub-sourced secret declared in `projects.ts` is
 * present in the workflow's `secrets` context, then re-export each one into
 * `$GITHUB_ENV` so subsequent steps (e.g. fly-secrets-sync) see them as
 * regular env vars.
 *
 * Wiring (in deploy-pipeline.yml):
 *
 *   env:
 *     ALL_GITHUB_SECRETS: ${{ toJSON(secrets) }}
 *   steps:
 *     - run: bun run scripts/check-github-secrets.ts
 *
 * This means adding a brand-new GitHub-sourced secret only requires:
 *   1. Add the GitHub repo secret (one-time).
 *   2. Reference it from `projects.ts` as `{ source: { t: "github" } }`.
 * No workflow YAML edit, no per-secret env block.
 *
 * GitHub still masks secret values in step output even after we write them
 * to $GITHUB_ENV, so this is safe for log redaction.
 *
 * Exit codes:
 *   0  — every required secret is present (and re-exported on CI).
 *   1  — at least one required secret is missing or empty.
 *   2  — bad input (malformed JSON, missing env, etc.).
 */
import { appendFileSync } from "node:fs";
import { allGithubSecretNames } from "../projects.js";

type SecretsBag = Readonly<Record<string, string>>;

function readSecretsBag(): SecretsBag {
  const raw = process.env["ALL_GITHUB_SECRETS"];
  if (!raw || !raw.trim()) {
    console.error(
      "ALL_GITHUB_SECRETS env var is empty. " +
        "The workflow must set `env: ALL_GITHUB_SECRETS: ${{ toJSON(secrets) }}` " +
        "for this job.",
    );
    process.exit(2);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }
    const bag: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") bag[k] = v;
    }
    return bag;
  } catch (err) {
    console.error(
      `ALL_GITHUB_SECRETS is not valid JSON: ${err instanceof Error ? err.message : err}`,
    );
    process.exit(2);
  }
}

/**
 * Append `KEY<<EOF\n<value>\nEOF` to the GitHub Actions env file. Heredoc
 * form is multiline-safe and matches the documented pattern.
 */
function exportToGithubEnv(name: string, value: string): void {
  const target = process.env["GITHUB_ENV"];
  if (!target) return; // running locally — nothing to do
  const eof = `EOF_${randomTag()}`;
  appendFileSync(target, `${name}<<${eof}\n${value}\n${eof}\n`);
}

function randomTag(): string {
  return Math.random().toString(36).slice(2, 12);
}

function main(): void {
  const required = allGithubSecretNames();
  if (required.length === 0) {
    console.log("No GitHub-sourced secrets declared in projects.ts.");
    return;
  }
  const bag = readSecretsBag();

  const missing: string[] = [];
  const exported: string[] = [];
  for (const name of required) {
    const value = (bag[name] ?? "").trim();
    if (!value) {
      missing.push(name);
      continue;
    }
    exportToGithubEnv(name, bag[name]!);
    exported.push(name);
  }

  if (missing.length > 0) {
    console.error(
      `Missing GitHub repo secrets referenced by projects.ts:\n  - ${missing.join(
        "\n  - ",
      )}\nAdd them under repo Settings → Secrets and variables → Actions, or remove them from projects.ts.`,
    );
    process.exit(1);
  }

  console.log(
    `OK: ${exported.length}/${required.length} GitHub-sourced secrets present and re-exported.`,
  );
}

main();
