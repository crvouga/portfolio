/**
 * Decommission Cloudflare resources managed by this repository.
 *
 * Tears down (in this order):
 *   1) Worker script (`chrisvouga-containers`) — also removes container apps + DO bindings.
 *   2) Worker custom-domain routes belonging to that worker.
 *   3) Secrets Store secrets bound by this repo (PORTFOLIO_* by default).
 *   4) (Optional) the Secrets Store itself when `--delete-store` is set.
 *
 * Defaults to `--dry-run` so accidental invocation is non-destructive. Pass `--apply`
 * (or `--no-dry-run`) to actually delete resources.
 *
 * Environment:
 *   CLOUDFLARE_API_TOKEN     (required)
 *   CLOUDFLARE_ACCOUNT_ID    (required)
 *   CLOUDFLARE_SECRETS_STORE_ID (required for secret cleanup; optional otherwise)
 *
 * Usage:
 *   bun run scripts/decommission-cloudflare-workers.ts                # dry-run
 *   bun run scripts/decommission-cloudflare-workers.ts --apply        # actually delete
 *   bun run scripts/decommission-cloudflare-workers.ts --apply \
 *     --delete-store                                                  # also delete Secrets Store
 *   bun run scripts/decommission-cloudflare-workers.ts --apply \
 *     --skip-routes --skip-worker                                     # selective teardown
 */
import { getDeployableProjects } from "../projects.js";

// ---------------------------------------------------------------------------
// Cloudflare resource naming (inlined from the legacy generator helpers, since
// those modules are removed once Cloudflare is decommissioned).
// ---------------------------------------------------------------------------

const RESOURCE_PREFIX = "PORTFOLIO";
const WORKER_NAME = "chrisvouga-containers";

function secretBindingName(projectId: string, secret: string): string {
  const slug = projectId.toUpperCase().replace(/[-.]/g, "_");
  return `${RESOURCE_PREFIX}_${slug}__${secret}`;
}

// ---------------------------------------------------------------------------
// CLI / config
// ---------------------------------------------------------------------------

type Mode = "dry-run" | "apply";

type Options = {
  readonly mode: Mode;
  readonly skipWorker: boolean;
  readonly skipContainers: boolean;
  readonly skipRoutes: boolean;
  readonly skipSecrets: boolean;
  readonly deleteStore: boolean;
};

function parseArgs(argv: readonly string[]): Options {
  let mode: Mode = "dry-run";
  let skipWorker = false;
  let skipContainers = false;
  let skipRoutes = false;
  let skipSecrets = false;
  let deleteStore = false;

  for (const arg of argv) {
    switch (arg) {
      case "--apply":
      case "--no-dry-run":
        mode = "apply";
        break;
      case "--dry-run":
        mode = "dry-run";
        break;
      case "--skip-worker":
        skipWorker = true;
        break;
      case "--skip-containers":
        skipContainers = true;
        break;
      case "--skip-routes":
        skipRoutes = true;
        break;
      case "--skip-secrets":
        skipSecrets = true;
        break;
      case "--delete-store":
        deleteStore = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(2);
    }
  }

  return { mode, skipWorker, skipContainers, skipRoutes, skipSecrets, deleteStore };
}

function printHelp(): void {
  console.log(
    [
      "Decommission Cloudflare resources for chrisvouga.dev.",
      "",
      "Flags:",
      "  --dry-run            (default) print what would happen, do not delete",
      "  --apply              actually delete resources",
      "  --skip-worker        do not delete the Worker script",
      "  --skip-containers    do not enumerate/log container applications",
      "  --skip-routes        do not delete Worker custom-domain routes",
      "  --skip-secrets       do not delete Secrets Store secrets",
      "  --delete-store       additionally delete the Secrets Store itself",
      "",
      "Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_SECRETS_STORE_ID.",
    ].join("\n"),
  );
}

const OPTIONS = parseArgs(process.argv.slice(2));

const API_TOKEN = process.env["CLOUDFLARE_API_TOKEN"]?.trim();
const ACCOUNT_ID = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
const SECRETS_STORE_ID = process.env["CLOUDFLARE_SECRETS_STORE_ID"]?.trim();

if (!API_TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN is required.");
  process.exit(1);
}
if (!ACCOUNT_ID) {
  console.error("CLOUDFLARE_ACCOUNT_ID is required.");
  process.exit(1);
}

const API_BASE = "https://api.cloudflare.com/client/v4";

// ---------------------------------------------------------------------------
// Cloudflare API client
// ---------------------------------------------------------------------------

type CloudflareErrorEntry = { readonly code: number; readonly message: string };
type CloudflareResponse<T> = {
  readonly success: boolean;
  readonly errors: readonly CloudflareErrorEntry[];
  readonly messages: readonly CloudflareErrorEntry[];
  readonly result: T;
  readonly result_info?: {
    readonly page: number;
    readonly per_page: number;
    readonly total_count: number;
    readonly count: number;
  };
};

async function cf<T>(
  method: "GET" | "DELETE" | "POST" | "PUT",
  path: string,
  init?: { readonly body?: unknown },
): Promise<CloudflareResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_TOKEN}`,
    Accept: "application/json",
  };
  const requestInit: RequestInit = { method, headers };
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(init.body);
  }

  const res = await fetch(`${API_BASE}${path}`, requestInit);
  const text = await res.text();
  let parsed: CloudflareResponse<T>;
  try {
    parsed = JSON.parse(text) as CloudflareResponse<T>;
  } catch {
    throw new Error(`HTTP ${res.status} ${res.statusText} (${method} ${path}): ${text}`);
  }
  return parsed;
}

function ok<T>(resp: CloudflareResponse<T>, label: string): T {
  if (!resp.success) {
    const messages = resp.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
    throw new Error(`${label} failed: ${messages || "unknown error"}`);
  }
  return resp.result;
}

// ---------------------------------------------------------------------------
// Resource ownership predicates (safety checks)
// ---------------------------------------------------------------------------

const KNOWN_HOSTNAMES: ReadonlySet<string> = new Set<string>([
  "www.chrisvouga.dev",
  ...getDeployableProjects().map((p) => p.hostname),
]);

const KNOWN_SECRET_NAMES: ReadonlySet<string> = new Set<string>(
  getDeployableProjects().flatMap((p) =>
    (p.secrets ?? []).map((secret) => secretBindingName(p.id, secret)),
  ),
);

function isRepoManagedSecretName(name: string): boolean {
  return name.startsWith(`${RESOURCE_PREFIX}_`) || KNOWN_SECRET_NAMES.has(name);
}

function isRepoManagedRouteHostname(hostname: string): boolean {
  return KNOWN_HOSTNAMES.has(hostname.toLowerCase());
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

type ActionStatus = "deleted" | "would-delete" | "skipped" | "error";

type ActionRecord = {
  readonly resource: string;
  readonly identifier: string;
  readonly status: ActionStatus;
  readonly detail?: string;
};

const ACTIONS: ActionRecord[] = [];

function record(action: ActionRecord): void {
  ACTIONS.push(action);
  const tag =
    action.status === "deleted"
      ? "DELETE"
      : action.status === "would-delete"
        ? "DRY-RUN"
        : action.status === "skipped"
          ? "SKIP"
          : "ERROR";
  const detail = action.detail ? ` (${action.detail})` : "";
  console.log(`  [${tag}] ${action.resource} ${action.identifier}${detail}`);
}

// ---------------------------------------------------------------------------
// Phase 1: Worker (also implicitly tears down container apps + DO bindings)
// ---------------------------------------------------------------------------

type WorkerScript = { readonly id: string; readonly modified_on?: string };

async function workerExists(scriptName: string): Promise<boolean> {
  const resp = await cf<readonly WorkerScript[]>(
    "GET",
    `/accounts/${ACCOUNT_ID}/workers/scripts`,
  );
  if (!resp.success) {
    throw new Error(
      `list worker scripts failed: ${resp.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return resp.result.some((script) => script.id === scriptName);
}

async function deleteWorker(scriptName: string): Promise<void> {
  console.log(`\nWorker: ${scriptName}`);
  const present = await workerExists(scriptName);
  if (!present) {
    record({ resource: "worker", identifier: scriptName, status: "skipped", detail: "not found" });
    return;
  }
  if (OPTIONS.mode === "dry-run") {
    record({ resource: "worker", identifier: scriptName, status: "would-delete" });
    return;
  }
  try {
    const resp = await cf(
      "DELETE",
      `/accounts/${ACCOUNT_ID}/workers/scripts/${encodeURIComponent(scriptName)}?force=true`,
    );
    ok(resp, "delete worker");
    record({ resource: "worker", identifier: scriptName, status: "deleted" });
  } catch (err) {
    record({
      resource: "worker",
      identifier: scriptName,
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Container applications (Cloudflare Containers)
//
// Container "applications" are managed via the Workers Containers API. When the
// Worker script is deleted, container apps tied to its DO bindings are removed
// by Cloudflare. We still enumerate and report them for visibility.
// ---------------------------------------------------------------------------

type ContainerApplication = {
  readonly id: string;
  readonly name: string;
  readonly created_at?: string;
};

async function listContainerApplications(): Promise<readonly ContainerApplication[]> {
  const resp = await cf<readonly ContainerApplication[]>(
    "GET",
    `/accounts/${ACCOUNT_ID}/containers/applications`,
  );
  if (!resp.success) {
    const message = resp.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
    if (
      resp.errors.some(
        (e) => e.code === 7003 || e.message.toLowerCase().includes("could not route"),
      )
    ) {
      console.log(`  [INFO] container applications API unavailable for this account: ${message}`);
      return [];
    }
    throw new Error(`list container applications failed: ${message}`);
  }
  return resp.result ?? [];
}

async function reportContainerApplications(): Promise<void> {
  console.log("\nContainer applications:");
  let apps: readonly ContainerApplication[];
  try {
    apps = await listContainerApplications();
  } catch (err) {
    record({
      resource: "container-app",
      identifier: "list",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (apps.length === 0) {
    record({ resource: "container-app", identifier: "(none)", status: "skipped", detail: "no apps" });
    return;
  }
  for (const app of apps) {
    if (OPTIONS.mode === "dry-run") {
      record({
        resource: "container-app",
        identifier: app.name,
        status: "would-delete",
        detail: app.id,
      });
      continue;
    }
    try {
      const resp = await cf(
        "DELETE",
        `/accounts/${ACCOUNT_ID}/containers/applications/${encodeURIComponent(app.id)}`,
      );
      ok(resp, `delete container app ${app.name}`);
      record({
        resource: "container-app",
        identifier: app.name,
        status: "deleted",
        detail: app.id,
      });
    } catch (err) {
      record({
        resource: "container-app",
        identifier: app.name,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Worker custom-domain routes
// ---------------------------------------------------------------------------

type WorkerDomain = {
  readonly id: string;
  readonly hostname: string;
  readonly service: string;
  readonly zone_id?: string;
  readonly zone_name?: string;
};

async function listWorkerDomains(): Promise<readonly WorkerDomain[]> {
  const resp = await cf<readonly WorkerDomain[]>(
    "GET",
    `/accounts/${ACCOUNT_ID}/workers/domains?per_page=200`,
  );
  return ok(resp, "list worker domains");
}

async function deleteWorkerDomains(scriptName: string): Promise<void> {
  console.log("\nWorker custom-domain routes:");
  let domains: readonly WorkerDomain[];
  try {
    domains = await listWorkerDomains();
  } catch (err) {
    record({
      resource: "worker-domain",
      identifier: "list",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const owned = domains.filter(
    (d) => d.service === scriptName || isRepoManagedRouteHostname(d.hostname),
  );

  if (owned.length === 0) {
    record({
      resource: "worker-domain",
      identifier: "(none)",
      status: "skipped",
      detail: `no domains tied to ${scriptName}`,
    });
    return;
  }

  for (const domain of owned) {
    if (domain.service !== scriptName && !isRepoManagedRouteHostname(domain.hostname)) {
      record({
        resource: "worker-domain",
        identifier: domain.hostname,
        status: "skipped",
        detail: `unrecognised service ${domain.service}`,
      });
      continue;
    }

    if (OPTIONS.mode === "dry-run") {
      record({
        resource: "worker-domain",
        identifier: domain.hostname,
        status: "would-delete",
        detail: `service=${domain.service}`,
      });
      continue;
    }

    try {
      const resp = await cf(
        "DELETE",
        `/accounts/${ACCOUNT_ID}/workers/domains/${encodeURIComponent(domain.id)}`,
      );
      ok(resp, `delete worker domain ${domain.hostname}`);
      record({
        resource: "worker-domain",
        identifier: domain.hostname,
        status: "deleted",
      });
    } catch (err) {
      record({
        resource: "worker-domain",
        identifier: domain.hostname,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 4: Secrets Store secrets (and optionally the store itself)
// ---------------------------------------------------------------------------

type SecretEntry = { readonly id: string; readonly name: string };

async function listSecrets(storeId: string): Promise<readonly SecretEntry[]> {
  const out: SecretEntry[] = [];
  let page = 1;
  for (;;) {
    const resp = await cf<readonly SecretEntry[]>(
      "GET",
      `/accounts/${ACCOUNT_ID}/secrets_store/stores/${encodeURIComponent(storeId)}/secrets?per_page=100&page=${page}`,
    );
    if (!resp.success) {
      const message = resp.errors.map((e) => e.message).join("; ").toLowerCase();
      if (message.includes("no secrets")) return out;
      throw new Error(
        `list secrets failed: ${resp.errors.map((e) => `[${e.code}] ${e.message}`).join("; ")}`,
      );
    }
    const chunk = resp.result ?? [];
    out.push(...chunk);
    const info = resp.result_info;
    if (!info || chunk.length < info.per_page) break;
    if (info.page * info.per_page >= info.total_count) break;
    page += 1;
  }
  return out;
}

async function deleteSecret(storeId: string, secretId: string): Promise<void> {
  const resp = await cf(
    "DELETE",
    `/accounts/${ACCOUNT_ID}/secrets_store/stores/${encodeURIComponent(storeId)}/secrets/${encodeURIComponent(secretId)}`,
  );
  ok(resp, "delete secret");
}

async function deleteStore(storeId: string): Promise<void> {
  const resp = await cf(
    "DELETE",
    `/accounts/${ACCOUNT_ID}/secrets_store/stores/${encodeURIComponent(storeId)}`,
  );
  ok(resp, "delete secrets store");
}

async function teardownSecrets(): Promise<void> {
  console.log("\nSecrets Store secrets:");

  if (!SECRETS_STORE_ID) {
    record({
      resource: "secret",
      identifier: "(store)",
      status: "skipped",
      detail: "CLOUDFLARE_SECRETS_STORE_ID not set",
    });
    return;
  }

  let secrets: readonly SecretEntry[];
  try {
    secrets = await listSecrets(SECRETS_STORE_ID);
  } catch (err) {
    record({
      resource: "secret",
      identifier: "list",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (secrets.length === 0) {
    record({
      resource: "secret",
      identifier: "(none)",
      status: "skipped",
      detail: "store empty",
    });
  }

  for (const secret of secrets) {
    if (!isRepoManagedSecretName(secret.name)) {
      record({
        resource: "secret",
        identifier: secret.name,
        status: "skipped",
        detail: `outside ${RESOURCE_PREFIX}_ namespace`,
      });
      continue;
    }
    if (OPTIONS.mode === "dry-run") {
      record({ resource: "secret", identifier: secret.name, status: "would-delete" });
      continue;
    }
    try {
      await deleteSecret(SECRETS_STORE_ID, secret.id);
      record({ resource: "secret", identifier: secret.name, status: "deleted" });
    } catch (err) {
      record({
        resource: "secret",
        identifier: secret.name,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!OPTIONS.deleteStore) return;

  console.log("\nSecrets Store:");
  if (OPTIONS.mode === "dry-run") {
    record({
      resource: "secret-store",
      identifier: SECRETS_STORE_ID,
      status: "would-delete",
    });
    return;
  }

  try {
    await deleteStore(SECRETS_STORE_ID);
    record({ resource: "secret-store", identifier: SECRETS_STORE_ID, status: "deleted" });
  } catch (err) {
    record({
      resource: "secret-store",
      identifier: SECRETS_STORE_ID,
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(
    `Cloudflare decommission (${OPTIONS.mode.toUpperCase()}) — account ${ACCOUNT_ID}`,
  );
  console.log(`  worker:     ${OPTIONS.skipWorker ? "skip" : WORKER_NAME}`);
  console.log(`  containers: ${OPTIONS.skipContainers ? "skip" : "report+delete"}`);
  console.log(`  routes:     ${OPTIONS.skipRoutes ? "skip" : "delete owned"}`);
  console.log(
    `  secrets:    ${OPTIONS.skipSecrets ? "skip" : `prefix=${RESOURCE_PREFIX}_`}${
      OPTIONS.deleteStore ? " (+store)" : ""
    }`,
  );

  if (!OPTIONS.skipWorker) await deleteWorker(WORKER_NAME);
  if (!OPTIONS.skipContainers) await reportContainerApplications();
  if (!OPTIONS.skipRoutes) await deleteWorkerDomains(WORKER_NAME);
  if (!OPTIONS.skipSecrets) await teardownSecrets();

  const summary = ACTIONS.reduce<Record<ActionStatus, number>>(
    (acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    { deleted: 0, "would-delete": 0, skipped: 0, error: 0 },
  );

  console.log("\nSummary:");
  console.log(`  deleted:      ${summary.deleted}`);
  console.log(`  would-delete: ${summary["would-delete"]}`);
  console.log(`  skipped:      ${summary.skipped}`);
  console.log(`  errors:       ${summary.error}`);

  if (OPTIONS.mode === "dry-run") {
    console.log("\nDry-run only. Re-run with --apply to actually delete resources.");
  }

  if (summary.error > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
