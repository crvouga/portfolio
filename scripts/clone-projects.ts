/**
 * Clone (or pull) all sibling project repos into the projects/ directory.
 * Run: bun run scripts/clone-projects.ts
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getUniqueCloneRepos } from "../projects.js";

const root = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
const projectsDir = join(root, "projects");

if (!existsSync(projectsDir)) {
  execSync(`mkdir -p ${projectsDir}`);
}

const repos = getUniqueCloneRepos();
const errors: string[] = [];

for (const { repo, dir } of repos) {
  const target = join(projectsDir, dir);
  try {
    if (existsSync(join(target, ".git"))) {
      console.log(`pull  projects/${dir}`);
      execSync("git pull --ff-only", { cwd: target, stdio: "inherit" });
    } else {
      const url = `https://github.com/${repo}.git`;
      console.log(`clone ${repo} -> projects/${dir}`);
      execSync(`git clone ${url} ${target}`, { stdio: "inherit" });
    }
  } catch (err) {
    errors.push(`${dir}: ${err}`);
  }
}

if (errors.length > 0) {
  console.error("\nErrors:");
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
