import { getDeployableProjects } from "../../projects.js";

export type DeployTarget = {
  readonly id: string;
  readonly host: string;
};

export function getDeployTargets(): readonly DeployTarget[] {
  return [
    { id: "portfolio", host: "www.chrisvouga.dev" },
    ...getDeployableProjects().map((p) => ({ id: p.id, host: p.hostname })),
  ];
}
