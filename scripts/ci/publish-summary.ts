import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { env, requiredEnv, shortSha } from "./github-actions.js";
import { getDeployTargets } from "./targets.js";

type ZoneResponse = {
  success: boolean;
  result: { name_servers?: string[] }[];
  errors?: { message?: string }[];
};

function sh(command: string, args: readonly string[]): { ok: boolean; out: string } {
  const r = spawnSync(command, [...args], { stdio: "pipe", encoding: "utf-8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

async function fetchCloudflareNameservers(zone: string): Promise<readonly string[]> {
  const token = env("CLOUDFLARE_API_TOKEN");
  if (!token) return ["_CLOUDFLARE_API_TOKEN not set — add repo secret to show nameservers here_"];
  const accountId = env("CLOUDFLARE_ACCOUNT_ID");
  const url = new URL("https://api.cloudflare.com/client/v4/zones");
  url.searchParams.set("name", zone);
  if (accountId) url.searchParams.set("account.id", accountId);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const data = (await response.json()) as ZoneResponse;
    if (!data.success) {
      return [`_${data.errors?.[0]?.message ?? "zone lookup failed"}_`];
    }
    const first = data.result[0];
    if (!first) {
      return [`_Zone \`${zone}\` not found — add it in [Cloudflare DNS](https://dash.cloudflare.com/) first_`];
    }
    const servers = first.name_servers ?? [];
    return servers.length > 0 ? servers.map((ns) => `- \`${ns}\``) : ["_No nameservers returned_"];
  } catch {
    return ["_API request failed_"];
  }
}

function getFailedJobsMarkdown(repo: string, runId: string): string {
  const query =
    '[.jobs[] | select(.conclusion == "failure") | {name, html_url, steps: [.steps[] | select(.conclusion == "failure") | .name]}] | .[] | "- **\\(.name)** — [view logs](\\(.html_url))" + (if (.steps | length) > 0 then "\\n  - Failed steps: " + ([.steps[] | "`\\(.)`"] | join(", ")) else "" end)';
  const res = sh("gh", ["api", `repos/${repo}/actions/runs/${runId}/jobs`, "--paginate", "--jq", query]);
  return res.ok && res.out ? res.out : "- _Could not fetch failed jobs from GitHub API_";
}

function getFailedLogs(repo: string, runId: string): string {
  const res = sh("gh", ["run", "view", runId, "--repo", repo, "--log-failed"]);
  if (!res.ok || !res.out) {
    return "_Could not download failed-step logs (run may still be finalizing)._";
  }
  let out = res.out;
  const lines = out.split("\n");
  if (lines.length > 400) out = lines.slice(-400).join("\n");
  if (out.length > 24000) out = `${out.slice(0, 24000)}\n\n... [logs truncated — open workflow run for full output]\n`;
  return out;
}

function markdownSummaryTable(typecheck: string, build: string, deploy: string): string {
  return [
    "| Job | Result |",
    "|-----|--------|",
    `| typecheck | \`${typecheck}\` |`,
    `| build-and-push | \`${build}\` |`,
    `| deploy-cloudflare | \`${deploy}\` |`,
  ].join("\n");
}

function stripLinks(md: string): string {
  return md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").replace(/\*\*/g, "");
}

async function main(): Promise<void> {
  requiredEnv("OWNER");
  const repo = requiredEnv("REPO");
  const sha = requiredEnv("SHA");
  const ref = requiredEnv("REF");
  const event = requiredEnv("EVENT");
  const runId = requiredEnv("RUN_ID");
  const runUrl = requiredEnv("RUN_URL");
  const typecheck = requiredEnv("TYPECHECK_RESULT");
  const build = requiredEnv("BUILD_RESULT");
  const deploy = requiredEnv("DEPLOY_RESULT");
  const summaryPath = requiredEnv("GITHUB_STEP_SUMMARY");

  const isMainPush = event === "push" && ref === "refs/heads/main";
  const pipelineFailed = [typecheck, build, deploy].some((r) => r === "failure" || r === "cancelled");

  const short = shortSha(sha);
  const lines: string[] = [];

  if (pipelineFailed) {
    lines.push("# Deployment pipeline failed", "", "## Pipeline status", "", markdownSummaryTable(typecheck, build, deploy), "");
    lines.push(`**Workflow run:** [${runId}](${runUrl}) · commit \`${short}\` · \`${event}\` on \`${ref.replace("refs/heads/", "")}\``, "");

    const failedJobsMd = getFailedJobsMarkdown(repo, runId);
    const failedJobCount = failedJobsMd.split("\n").filter((line) => line.startsWith("- **")).length;
    const failedLogs = getFailedLogs(repo, runId);

    lines.push("<details>");
    lines.push(`<summary><strong>Failed jobs</strong> (${failedJobCount}) — click to expand</summary>`, "", failedJobsMd, "", "</details>", "");
    lines.push("<details>");
    lines.push("<summary><strong>Failed step logs</strong> (truncated) — click to expand, use code-block copy button</summary>", "");
    lines.push("```text", failedLogs, "```", "", "</details>", "");

    const prompt = [
      "Fix this GitHub Actions deployment pipeline failure.",
      "",
      "## Context",
      `- Repository: ${repo}`,
      "- Workflow: Deployment Pipeline (.github/workflows/deployment-pipeline.yml)",
      `- Run: ${runUrl}`,
      `- Event: ${event}`,
      `- Ref: ${ref}`,
      `- Commit: ${sha}`,
      "",
      "## Job results",
      `- typecheck: ${typecheck}`,
      `- build-and-push: ${build}`,
      `- deploy-cloudflare: ${deploy}`,
      "",
      "## Failed jobs",
      stripLinks(failedJobsMd),
      "",
      "## Failed step logs (truncated)",
      failedLogs,
      "",
      "## Your task",
      "1. Identify the root cause from the logs above.",
      "2. Propose a minimal fix (file paths and exact edits).",
      "3. Note if the failure is in an external repo checked out in the matrix (see workflow matrix.checkout_repo).",
      "4. Call out missing secrets or infra (GitHub repo secrets are source of truth — binding names like PICKFLIX__DATABASE_URL; CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GHCR permissions) if relevant.",
    ].join("\n");

    lines.push("<details open>");
    lines.push("<summary><strong>Copy-paste LLM prompt</strong> — expand, hover the code block, click the copy icon (top-right)</summary>", "");
    lines.push("_Paste the entire block below into Cursor, ChatGPT, or Claude._", "");
    lines.push("```text", prompt, "```", "", "</details>", "", "---", "");
  }

  if (isMainPush && build !== "skipped") {
    lines.push("## Container Images", "", "| Image | Tags | Pull | URL |", "|-------|------|------|-----|");
    for (const target of getDeployTargets()) {
      const image = `ghcr.io/${repo}:${target.id}-latest`;
      lines.push(`| \`${target.id}\` | \`${target.id}-latest\` \`${target.id}-${short}\` | \`docker pull ${image}\` | https://${target.host} |`);
    }
    lines.push("");

    const chrisvougaHosts = getDeployTargets().map((t) => t.host).filter((h) => h.endsWith(".chrisvouga.dev"));
    lines.push("## Squarespace → Cloudflare nameservers", "");
    lines.push("Custom domains use `custom_domain = true` in Wrangler, which creates DNS records **inside Cloudflare**. Squarespace must delegate each apex domain to Cloudflare nameservers (not individual A/CNAME rows in Squarespace).", "");
    lines.push(`### 1. \`chrisvouga.dev\` (${chrisvougaHosts.length} subdomains + \`www\`)`, "", "**Cloudflare nameservers for this zone:**");
    lines.push(...(await fetchCloudflareNameservers("chrisvouga.dev")), "");
    lines.push("**Squarespace:** [Domains](https://account.squarespace.com/domains) → `chrisvouga.dev` → **DNS** → **Nameservers** → **Use custom nameservers** → paste every nameserver above (usually 2).", "");
    lines.push("**Hostnames auto-managed in Cloudflare after delegation:**");
    for (const host of chrisvougaHosts) lines.push(`- \`${host}\``);
    lines.push("", "> Optional: add a Cloudflare redirect rule `chrisvouga.dev` → `https://www.chrisvouga.dev` if you want the bare apex to work.", "");

    lines.push("### 2. `normalizer.app` (apex only)", "", "**Cloudflare nameservers for this zone:**");
    lines.push(...(await fetchCloudflareNameservers("normalizer.app")), "");
    lines.push("**Squarespace:** [Domains](https://account.squarespace.com/domains) → `normalizer.app` → **DNS** → **Nameservers** → **Use custom nameservers** → paste every nameserver above.", "");
    lines.push("**Hostname auto-managed in Cloudflare after delegation:**", "- `normalizer.app`", "");
    lines.push("### Checklist", "");
    lines.push(`1. Both zones exist in [Cloudflare](https://dash.cloudflare.com/) under account \`${env("CLOUDFLARE_ACCOUNT_ID") || "<set CLOUDFLARE_ACCOUNT_ID secret>"}\`.`);
    lines.push("2. Squarespace nameservers match the values listed above (propagation can take up to 48h).");
    lines.push("3. Do **not** keep Squarespace DNS records for these hostnames — Cloudflare owns DNS once nameservers are switched.");
    lines.push("4. Re-run this workflow summary after any zone transfer to refresh nameserver values.");
  } else if (!pipelineFailed) {
    lines.push("## Pipeline succeeded", "", markdownSummaryTable(typecheck, build, deploy));
  }

  if (isMainPush || pipelineFailed) {
    lines.push("", `**Typecheck:** \`${typecheck}\` · **Build:** \`${build}\` · **Deploy:** \`${deploy}\``);
  }

  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
  if (pipelineFailed) process.exit(1);
}

await main();
