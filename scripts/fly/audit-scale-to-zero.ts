/**
 * Audit every Fly app in `projects.ts` for scale-to-zero compliance.
 *
 * Intent (the contract we want every Fly app to satisfy):
 *   - At most ONE non-destroyed machine per app (we deploy with `--ha=false`).
 *   - Each [http_service] has  autostop ∈ {"suspend", "stop"}
 *                              autostart = true
 *                              min_machines_running = 0
 *   - No machine in state `started` for longer than a small grace window
 *     (a healthy idle app should be "suspended" or "stopped").
 *
 * The auditor reads live state with `fly machines list --json` (no dashboard,
 * no manual auditing). Exits non-zero if it finds drift so a CI step can fail
 * the deploy pipeline.
 *
 * Usage:
 *   bun run scripts/fly/audit-scale-to-zero.ts                 # report only
 *   bun run scripts/fly/audit-scale-to-zero.ts --id pickflix   # one app
 *   bun run scripts/fly/audit-scale-to-zero.ts --stop-running  # also `fly machines stop` any started machines
 *   bun run scripts/fly/audit-scale-to-zero.ts --prune-extras  # destroy duplicate machines (keep newest per app)
 *   bun run scripts/fly/audit-scale-to-zero.ts --json          # machine-readable
 */
import { ensureFlyAuth, flyctlSafe } from "../lib/flyctl.js";
import { buildDeployTargets, findTargetById, type DeployTarget } from "../lib/project-targets.js";

type FlyService = {
  readonly internal_port?: number;
  readonly protocol?: string;
  readonly autostop?: string | boolean;
  readonly autostart?: boolean;
  readonly min_machines_running?: number;
};

type FlyMachineConfig = {
  readonly auto_destroy?: boolean;
  readonly services?: readonly FlyService[];
};

type FlyMachine = {
  readonly id?: string;
  readonly name?: string;
  readonly state?: string;
  readonly region?: string;
  readonly updated_at?: string;
  readonly config?: FlyMachineConfig;
};

type Severity = "ok" | "warn" | "error";

type Finding = {
  readonly severity: Severity;
  readonly message: string;
};

type AppAudit = {
  readonly target: DeployTarget;
  readonly machines: readonly FlyMachine[];
  readonly findings: readonly Finding[];
  readonly worst: Severity;
  /** Active = state ∈ {started,stopped,suspended,starting,replacing}. */
  readonly activeMachines: readonly FlyMachine[];
  readonly runningMachineIds: readonly string[];
  readonly missing: boolean;
};

type Args = {
  readonly ids: readonly string[];
  readonly stopRunning: boolean;
  readonly pruneExtras: boolean;
  readonly json: boolean;
  readonly failOnWarn: boolean;
};

const ACCEPTED_AUTOSTOP = new Set(["suspend", "stop"]);

function parseArgs(argv: readonly string[]): Args {
  const ids: string[] = [];
  let stopRunning = false;
  let pruneExtras = false;
  let json = false;
  let failOnWarn = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--id":
        ids.push(argv[++i] ?? "");
        break;
      case "--stop-running":
        stopRunning = true;
        break;
      case "--prune-extras":
        pruneExtras = true;
        break;
      case "--json":
        json = true;
        break;
      case "--fail-on-warn":
        failOnWarn = true;
        break;
      case "--help":
      case "-h":
        console.log(
          [
            "Usage: bun run scripts/fly/audit-scale-to-zero.ts [options]",
            "",
            "Options:",
            "  --id <id>        Audit a single project (repeatable). Default: all targets.",
            "  --stop-running   Run `fly machines stop` on any machine in state=started.",
            "  --prune-extras   For apps with >1 active machine, destroy all but the most",
            "                   recently updated one (cleans up orphan HA pairs).",
            "  --fail-on-warn   Treat warnings (e.g. 'app missing') as errors.",
            "  --json           Emit a machine-readable JSON report instead of the table.",
          ].join("\n"),
        );
        process.exit(0);
      // eslint-disable-next-line no-fallthrough -- process.exit above
      default:
        if (arg && arg.startsWith("--")) {
          console.error(`Unknown argument: ${arg}`);
          process.exit(2);
        }
    }
  }

  return { ids: ids.filter(Boolean), stopRunning, pruneExtras, json, failOnWarn };
}

function targetsFromArgs(args: Args): readonly DeployTarget[] {
  if (args.ids.length === 0) return buildDeployTargets();
  const out: DeployTarget[] = [];
  for (const id of args.ids) {
    const t = findTargetById(id);
    if (!t) {
      console.error(`No infra target with id "${id}"`);
      process.exit(1);
    }
    out.push(t);
  }
  return out;
}

function listMachines(app: string): { ok: true; machines: readonly FlyMachine[] } | { ok: false; reason: "missing" | "error"; detail: string } {
  const r = flyctlSafe(["machines", "list", "--json"], { app });
  if (r.exitCode === 0) {
    const trimmed = r.stdout.trim();
    if (trimmed === "") return { ok: true, machines: [] };
    try {
      const parsed = JSON.parse(trimmed) as readonly FlyMachine[];
      return { ok: true, machines: parsed };
    } catch (err) {
      return {
        ok: false,
        reason: "error",
        detail: `JSON parse: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  const combined = `${r.stdout}\n${r.stderr}`.toLowerCase();
  if (combined.includes("could not find app") || combined.includes("not found")) {
    return { ok: false, reason: "missing", detail: r.stderr.trim() };
  }
  return { ok: false, reason: "error", detail: r.stderr.trim() || r.stdout.trim() };
}

const TERMINAL_STATES = new Set(["destroyed", "destroying"]);

function isActive(state: string | undefined): boolean {
  if (!state) return false;
  return !TERMINAL_STATES.has(state.toLowerCase());
}

function auditMachine(target: DeployTarget, machine: FlyMachine): readonly Finding[] {
  const findings: Finding[] = [];
  const id = machine.id ?? "<no-id>";
  const services = machine.config?.services ?? [];
  // Only validate services that share our internal_port — Fly machines also
  // describe internal "tcp" services (e.g. ssh) we don't want to enforce on.
  const httpServices = services.filter((s) => s.internal_port === target.port);
  if (httpServices.length === 0 && services.length > 0) {
    findings.push({
      severity: "warn",
      message: `machine ${id}: no service on internal_port=${target.port} (services: ${services.map((s) => s.internal_port).join(",")}).`,
    });
  }

  for (const svc of httpServices) {
    const autostopValue = typeof svc.autostop === "string" ? svc.autostop : svc.autostop === true ? "stop" : "off";
    if (!ACCEPTED_AUTOSTOP.has(autostopValue.toLowerCase())) {
      findings.push({
        severity: "error",
        message: `machine ${id}: autostop="${autostopValue}" (want one of suspend|stop).`,
      });
    }
    if (svc.autostart !== true) {
      findings.push({
        severity: "error",
        message: `machine ${id}: autostart=${svc.autostart ?? "false"} (want true so it wakes on traffic).`,
      });
    }
    const minRun = svc.min_machines_running ?? 0;
    if (minRun !== 0) {
      findings.push({
        severity: "error",
        message: `machine ${id}: min_machines_running=${minRun} (want 0).`,
      });
    }
  }

  return findings;
}

function auditApp(target: DeployTarget): AppAudit {
  const list = listMachines(target.flyApp);
  if (!list.ok) {
    if (list.reason === "missing") {
      return {
        target,
        machines: [],
        findings: [{ severity: "warn", message: `app ${target.flyApp} does not exist on Fly (run \`bun fly:bootstrap --id ${target.id}\`).` }],
        worst: "warn",
        activeMachines: [],
        runningMachineIds: [],
        missing: true,
      };
    }
    return {
      target,
      machines: [],
      findings: [{ severity: "error", message: `failed to list machines: ${list.detail}` }],
      worst: "error",
      activeMachines: [],
      runningMachineIds: [],
      missing: false,
    };
  }

  const machines = list.machines;
  const active = machines.filter((m) => isActive(m.state));
  const running = active.filter((m) => (m.state ?? "").toLowerCase() === "started");

  const findings: Finding[] = [];

  if (active.length > 1) {
    findings.push({
      severity: "error",
      message: `${active.length} active machines (want ≤ 1; deploy uses --ha=false). Active IDs: ${active.map((m) => m.id).join(", ")}.`,
    });
  }

  for (const machine of active) {
    findings.push(...auditMachine(target, machine));
  }

  const worst: Severity = findings.some((f) => f.severity === "error")
    ? "error"
    : findings.some((f) => f.severity === "warn")
    ? "warn"
    : "ok";

  return {
    target,
    machines,
    findings,
    worst,
    activeMachines: active,
    runningMachineIds: running.map((m) => m.id ?? "").filter(Boolean),
    missing: false,
  };
}

function summariseStates(machines: readonly FlyMachine[]): string {
  const counts: Record<string, number> = {};
  for (const m of machines) {
    const s = (m.state ?? "unknown").toLowerCase();
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const order = ["started", "stopped", "suspended", "starting", "replacing", "destroyed", "destroying"];
  const parts: string[] = [];
  for (const k of order) if (counts[k]) parts.push(`${k}=${counts[k]}`);
  for (const k of Object.keys(counts)) if (!order.includes(k)) parts.push(`${k}=${counts[k]}`);
  return parts.length === 0 ? "—" : parts.join(", ");
}

function severityIcon(s: Severity): string {
  return s === "ok" ? "✓" : s === "warn" ? "!" : "✗";
}

function severityLabel(s: Severity): string {
  return s === "ok" ? "compliant" : s === "warn" ? "warn     " : "DRIFT    ";
}

function stopRunningMachines(audits: readonly AppAudit[]): { stopped: number; failed: number } {
  let stopped = 0;
  let failed = 0;
  for (const audit of audits) {
    for (const id of audit.runningMachineIds) {
      console.log(`  → fly machines stop ${id} --app ${audit.target.flyApp}`);
      const r = flyctlSafe(["machines", "stop", id], { app: audit.target.flyApp });
      if (r.exitCode === 0) stopped += 1;
      else {
        failed += 1;
        console.warn(`    failed: ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
      }
    }
  }
  return { stopped, failed };
}

function printTable(audits: readonly AppAudit[]): void {
  const idWidth = Math.max(20, ...audits.map((a) => a.target.id.length));
  for (const audit of audits) {
    const { target, worst, machines, activeMachines } = audit;
    const states = summariseStates(machines);
    const header = `${severityIcon(worst)} ${severityLabel(worst)} ${target.id.padEnd(idWidth)} active=${activeMachines.length} (${states})`;
    console.log(header);
    for (const f of audit.findings) {
      console.log(`    [${f.severity}] ${f.message}`);
    }
  }
}

/**
 * For each app with >1 active machine, keep the most-recently-updated one and
 * destroy the rest. Newest = canonical because that's what the most recent
 * `fly deploy --strategy immediate` would have produced.
 */
function pruneExtraMachines(audits: readonly AppAudit[]): { destroyed: number; failed: number } {
  let destroyed = 0;
  let failed = 0;
  for (const audit of audits) {
    if (audit.activeMachines.length <= 1) continue;
    const sorted = [...audit.activeMachines].sort(
      (a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? ""),
    );
    const [keep, ...extras] = sorted;
    console.log(
      `  ${audit.target.flyApp}: keep ${keep?.id} (updated ${keep?.updated_at ?? "?"}), destroy ${extras.length}.`,
    );
    for (const m of extras) {
      const id = m.id;
      if (!id) continue;
      console.log(`    → fly machines destroy ${id} --app ${audit.target.flyApp} --force`);
      const r = flyctlSafe(["machines", "destroy", id, "--force"], { app: audit.target.flyApp });
      if (r.exitCode === 0) destroyed += 1;
      else {
        failed += 1;
        console.warn(`      failed: ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
      }
    }
  }
  return { destroyed, failed };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  ensureFlyAuth();
  const targets = targetsFromArgs(args);

  const audits: AppAudit[] = [];
  for (const target of targets) {
    audits.push(auditApp(target));
  }

  const ok = audits.filter((a) => a.worst === "ok").length;
  const warn = audits.filter((a) => a.worst === "warn").length;
  const errors = audits.filter((a) => a.worst === "error").length;

  if (args.json) {
    const report = {
      summary: { ok, warn, errors, total: audits.length },
      apps: audits.map((a) => ({
        id: a.target.id,
        flyApp: a.target.flyApp,
        worst: a.worst,
        activeMachineCount: a.activeMachines.length,
        runningMachineIds: a.runningMachineIds,
        missing: a.missing,
        findings: a.findings,
        machineStates: a.machines.map((m) => ({ id: m.id, state: m.state })),
      })),
    };
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Auditing ${audits.length} Fly apps for scale-to-zero compliance…\n`);
    printTable(audits);
    console.log(
      `\nSummary: ✓ ${ok} compliant, ! ${warn} warn, ✗ ${errors} drift (total ${audits.length}).`,
    );
  }

  if (args.stopRunning) {
    const totalRunning = audits.reduce((n, a) => n + a.runningMachineIds.length, 0);
    if (totalRunning === 0) {
      console.log("\n--stop-running: no machines in state=started; nothing to do.");
    } else {
      console.log(`\n--stop-running: stopping ${totalRunning} machine(s)…`);
      const { stopped, failed } = stopRunningMachines(audits);
      console.log(`  Stopped: ${stopped}, failed: ${failed}.`);
    }
  }

  if (args.pruneExtras) {
    const drifted = audits.filter((a) => a.activeMachines.length > 1);
    if (drifted.length === 0) {
      console.log("\n--prune-extras: every app already has ≤ 1 active machine.");
    } else {
      const totalExtras = drifted.reduce((n, a) => n + (a.activeMachines.length - 1), 0);
      console.log(
        `\n--prune-extras: ${drifted.length} app(s) have extras, destroying ${totalExtras} machine(s)…`,
      );
      const { destroyed, failed } = pruneExtraMachines(drifted);
      console.log(`  Destroyed: ${destroyed}, failed: ${failed}.`);
    }
  }

  const fail = errors > 0 || (args.failOnWarn && warn > 0);
  if (fail) {
    if (!args.json) {
      console.error(
        "\nDrift detected. To re-apply the scale-to-zero template:" +
          "\n  bun run fly:deploy --id <project-id>" +
          "\n…or for all of them, re-run the GitHub deploy-pipeline workflow.",
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
