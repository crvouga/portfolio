/**
 * Deploy a single Fly app from a pre-built ghcr.io image.
 *
 * Steps:
 *   1) Render `fly/fly.toml.template` for the target into a temp file.
 *   2) `fly deploy --image <uri> --config <generated.toml> --app <flyApp>`.
 *   3) `fly certs add <hostname>` (no-op if already attached).
 *   4) Poll `fly certs show` until the cert is `Ready` (or the timeout fires).
 *
 * Usage:
 *   bun run scripts/fly/deploy-app.ts --id pickflix --sha <git-sha>
 *   bun run scripts/fly/deploy-app.ts --id pickflix --image ghcr.io/...:custom-tag
 *   bun run scripts/fly/deploy-app.ts --id pickflix --sha <sha> --skip-cert
 *   bun run scripts/fly/deploy-app.ts --id pickflix --sha <sha> --dry-run
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ensureFlyAuth, flyctl, flyctlSafe } from "../lib/flyctl.js";
import { findTargetById, type DeployTarget } from "../lib/project-targets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const FLY_TEMPLATE_PATH = join(REPO_ROOT, "fly", "fly.toml.template");

type Args = {
  readonly id: string;
  readonly sha?: string;
  readonly image?: string;
  readonly imageRepo: string;
  readonly region: string;
  readonly skipCert: boolean;
  readonly certTimeoutMs: number;
  readonly dryRun: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  let id = "";
  let sha: string | undefined;
  let image: string | undefined;
  let imageRepo = process.env["IMAGE_REPO"]?.trim() || "ghcr.io/crvouga/chrisvouga";
  let region = process.env["FLY_REGION"]?.trim() || "iad";
  let skipCert = false;
  let certTimeoutMs = 5 * 60_000;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--id":
        id = argv[++i] ?? "";
        break;
      case "--sha":
        sha = argv[++i];
        break;
      case "--image":
        image = argv[++i];
        break;
      case "--image-repo":
        imageRepo = argv[++i] ?? imageRepo;
        break;
      case "--region":
        region = argv[++i] ?? region;
        break;
      case "--skip-cert":
        skipCert = true;
        break;
      case "--cert-timeout-ms":
        certTimeoutMs = Number(argv[++i] ?? certTimeoutMs);
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: bun run scripts/fly/deploy-app.ts --id <id> [--sha <sha> | --image <uri>] " +
            "[--image-repo <repo>] [--region <iad>] [--skip-cert] [--dry-run]",
        );
        process.exit(0);
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(2);
    }
  }

  if (!id) {
    console.error("--id <project-id> is required");
    process.exit(2);
  }
  const base = { id, imageRepo, region, skipCert, certTimeoutMs, dryRun };
  return {
    ...base,
    ...(sha !== undefined ? { sha } : {}),
    ...(image !== undefined ? { image } : {}),
  };
}

function imageUriFor(target: DeployTarget, args: Args): string {
  if (args.image) return args.image;
  const tag = args.sha ?? "latest";
  return `${args.imageRepo}-${target.id}:${tag}`;
}

function renderFlyToml(target: DeployTarget, image: string, region: string): string {
  const template = readFileSync(FLY_TEMPLATE_PATH, "utf-8");
  return template
    .replaceAll("${APP}", target.flyApp)
    .replaceAll("${IMAGE}", image)
    .replaceAll("${PORT}", String(target.port))
    .replaceAll("${REGION}", region);
}

function deploy(target: DeployTarget, image: string, configPath: string, dryRun: boolean): void {
  const args = ["deploy", "--config", configPath, "--image", image, "--yes"];
  if (dryRun) {
    console.log(`  [dry-run] flyctl ${args.join(" ")} --app ${target.flyApp}`);
    return;
  }
  flyctl(args, { app: target.flyApp, capture: false });
}

type CertStatus = {
  readonly clientStatus?: string;
  readonly ClientStatus?: string;
  readonly hostname?: string;
};

function ensureCert(target: DeployTarget, dryRun: boolean): void {
  const add = flyctlSafe(["certs", "add", target.hostname], { app: target.flyApp });
  if (add.exitCode !== 0) {
    const combined = `${add.stdout}\n${add.stderr}`.toLowerCase();
    if (!combined.includes("already") && !combined.includes("exists")) {
      console.warn(`  flyctl certs add output: ${add.stdout}\n${add.stderr}`);
    }
  }
  if (dryRun) return;
}

async function waitForCert(target: DeployTarget, timeoutMs: number): Promise<"ready" | "pending"> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "unknown";
  while (Date.now() < deadline) {
    const r = flyctlSafe(["certs", "show", target.hostname, "--json"], { app: target.flyApp });
    if (r.exitCode === 0) {
      try {
        const parsed = JSON.parse(r.stdout) as CertStatus;
        const status = (parsed.clientStatus ?? parsed.ClientStatus ?? "").toLowerCase();
        lastStatus = status;
        if (status === "ready") return "ready";
      } catch {
        /* ignore parse errors */
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
  }
  return lastStatus === "ready" ? "ready" : "pending";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  ensureFlyAuth();
  const target = findTargetById(args.id);
  if (!target) {
    console.error(`No infra target with id "${args.id}"`);
    process.exit(1);
  }

  const image = imageUriFor(target, args);
  const tomlContents = renderFlyToml(target, image, args.region);
  const tmpDir = mkdtempSync(join(tmpdir(), `fly-${target.id}-`));
  const configPath = join(tmpDir, "fly.toml");
  writeFileSync(configPath, tomlContents);

  console.log(
    `Deploy ${target.id} (${args.dryRun ? "DRY-RUN" : "APPLY"}) → app=${target.flyApp} image=${image} hostname=${target.hostname}`,
  );

  deploy(target, image, configPath, args.dryRun);

  if (args.skipCert) {
    console.log("  Skipping cert step (--skip-cert).");
    return;
  }
  ensureCert(target, args.dryRun);
  if (args.dryRun) return;
  const certStatus = await waitForCert(target, args.certTimeoutMs);
  if (certStatus !== "ready") {
    console.warn(
      `  Cert for ${target.hostname} is "${certStatus}" — Cloudflare CNAME may still be propagating.`,
    );
  } else {
    console.log(`  Cert ready for ${target.hostname}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
