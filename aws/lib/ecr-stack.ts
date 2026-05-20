import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { getInfraTargets } from "../../projects.js";

/** One ECR repository per deployable target (portfolio + every public project). */
export class EcrStack extends cdk.Stack {
  public readonly repositories: Readonly<Record<string, ecr.Repository>>;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repos: Record<string, ecr.Repository> = {};
    const seen = new Set<string>();

    for (const target of getInfraTargets()) {
      if (seen.has(target.id)) continue;
      seen.add(target.id);

      const repo = new ecr.Repository(this, `Ecr-${safeCfnId(target.id)}`, {
        repositoryName: target.id,
        imageScanOnPush: true,
        imageTagMutability: ecr.TagMutability.MUTABLE,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      repo.addLifecycleRule({
        description: "Keep last 5 images",
        maxImageCount: 5,
        rulePriority: 1,
      });
      repos[target.id] = repo;
    }

    this.repositories = repos;
  }
}

function safeCfnId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "");
}
