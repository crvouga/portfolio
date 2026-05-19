import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { getDeployableProjects } from "../../projects.js";

export class EcrStack extends cdk.Stack {
  public readonly repositories: Readonly<Record<string, ecr.Repository>>;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repos: Record<string, ecr.Repository> = {};
    const seen = new Set<string>();

    for (const p of getDeployableProjects()) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);

      const repo = new ecr.Repository(this, `Ecr-${safeCfnId(p.id)}`, {
        repositoryName: p.id,
        imageScanOnPush: true,
        imageTagMutability: ecr.TagMutability.MUTABLE,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      repo.addLifecycleRule({
        description: "Keep last 5 images",
        maxImageCount: 5,
        rulePriority: 1,
      });
      repos[p.id] = repo;
    }

    this.repositories = repos;
  }
}

function safeCfnId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "");
}
