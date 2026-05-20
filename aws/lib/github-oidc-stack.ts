import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export type GithubOidcStackProps = cdk.StackProps & {
  readonly githubOrg: string;
  readonly githubRepo: string;
};

/**
 * GitHub OIDC provider + a single role that GitHub Actions assumes for the
 * full deploy pipeline:
 *   - ECR push (build-and-publish-images workflow)
 *   - CDK deploy of all stacks (deployment-pipeline workflow)
 *   - `aws lambda update-function-code` rollouts after image push
 */
export class GithubOidcStack extends cdk.Stack {
  public readonly githubActionsRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, "GithubActionsOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    this.githubActionsRole = new iam.Role(this, "GitHubActionsRole", {
      roleName: "GitHubActionsRole",
      description: "GitHub Actions OIDC — chrisvouga.dev deploy pipelines (ECR + CDK + Lambda)",
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${props.githubOrg}/${props.githubRepo}:*`,
        },
      }),
    });

    this.githubActionsRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryPowerUser"),
    );

    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AssumeCdkBootstrapRoles",
        actions: ["sts:AssumeRole"],
        resources: [
          `arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-*`,
        ],
      }),
    );

    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "LambdaImageRollout",
        actions: [
          "lambda:UpdateFunctionCode",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:UpdateFunctionConfiguration",
          "lambda:PublishVersion",
          "lambda:UpdateAlias",
          "lambda:GetAlias",
        ],
        resources: [
          `arn:aws:lambda:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:function:chrisvouga-*`,
        ],
      }),
    );

    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ListStacksForCdk",
        actions: ["cloudformation:DescribeStacks", "cloudformation:ListStacks"],
        resources: ["*"],
      }),
    );

    new cdk.CfnOutput(this, "GithubActionsRoleArn", {
      value: this.githubActionsRole.roleArn,
    });
  }
}
