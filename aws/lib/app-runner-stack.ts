import * as cdk from "aws-cdk-lib";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { getDeployableProjects } from "../../projects.js";

export type AppRunnerStackProps = cdk.StackProps & {
  readonly ecr: Readonly<Record<string, ecr.Repository>>;
};

/**
 * All secrets (including what used to be plain env vars) are pulled from SSM Parameter Store
 * at path /chrisvouga/{project.id}/{SECRET_NAME}.
 */
export class AppRunnerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppRunnerStackProps) {
    super(scope, id, props);

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    const accessRole = new iam.Role(this, "AppRunnerEcrAccess", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSAppRunnerServicePolicyForECRAccess"),
      ],
    });

    const instanceRole = new iam.Role(this, "AppRunnerInstance", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
      description: "SSM + KMS access for chrisvouga.dev App Runner services",
    });
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
        resources: [`arn:aws:ssm:${region}:${account}:parameter/chrisvouga/*`],
      }),
    );
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["kms:Decrypt"],
        resources: [`arn:aws:kms:${region}:${account}:key/*`],
        conditions: { StringEquals: { "kms:ViaService": `ssm.${region}.amazonaws.com` } },
      }),
    );

    const autoScaling = new apprunner.CfnAutoScalingConfiguration(this, "SharedAutoScaling", {
      autoScalingConfigurationName: "chrisvouga-projects",
      maxConcurrency: 100,
      maxSize: 2,
      minSize: 1,
    });

    for (const project of getDeployableProjects()) {
      const repository = props.ecr[project.id];
      if (!repository) {
        throw new Error(`Missing ECR repo for ${project.id}`);
      }

      const safeId = safeCfnId(project.id);
      const imageIdentifier = `${repository.repositoryUri}:latest`;

      const runtimeEnvironmentSecrets = (project.secrets ?? []).map((name) => ({
        name,
        value: ssmArn(account, region, `/chrisvouga/${project.id}/${name}`),
      }));

      const service = new apprunner.CfnService(this, `Service-${safeId}`, {
        serviceName: `chrisvouga-${sanitizeServiceName(project.id)}`,
        sourceConfiguration: {
          authenticationConfiguration: { accessRoleArn: accessRole.roleArn },
          autoDeploymentsEnabled: true,
          imageRepository: {
            imageConfiguration: {
              port: String(project.port),
              runtimeEnvironmentSecrets:
                runtimeEnvironmentSecrets.length > 0 ? runtimeEnvironmentSecrets : undefined,
            },
            imageIdentifier,
            imageRepositoryType: "ECR",
          },
        },
        instanceConfiguration: {
          cpu: "1024",
          memory: "2048",
          instanceRoleArn: instanceRole.roleArn,
        },
        autoScalingConfigurationArn: autoScaling.attrAutoScalingConfigurationArn,
        healthCheckConfiguration: {
          protocol: "HTTP",
          path: "/",
          interval: 10,
          timeout: 5,
          healthyThreshold: 1,
          unhealthyThreshold: 5,
        },
      });

      const associateDomain = new cr.AwsCustomResource(this, `AssociateDomain-${safeId}`, {
        onCreate: {
          service: "AppRunner",
          action: "associateCustomDomain",
          parameters: {
            ServiceArn: service.attrServiceArn,
            DomainName: project.hostname,
            EnableWWWSubdomain: false,
          },
          physicalResourceId: cr.PhysicalResourceId.of(`domain-${project.hostname}`),
        },
        onUpdate: {
          service: "AppRunner",
          action: "associateCustomDomain",
          parameters: {
            ServiceArn: service.attrServiceArn,
            DomainName: project.hostname,
            EnableWWWSubdomain: false,
          },
          physicalResourceId: cr.PhysicalResourceId.of(`domain-${project.hostname}`),
        },
        onDelete: {
          service: "AppRunner",
          action: "disassociateCustomDomain",
          parameters: {
            ServiceArn: service.attrServiceArn,
            DomainName: project.hostname,
          },
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
        installLatestAwsSdk: true,
      });
      associateDomain.node.addDependency(service);

      new cdk.CfnOutput(this, `ServiceUrl-${safeId}`, {
        value: service.attrServiceUrl,
        description: `${project.id} default App Runner URL`,
      });

      new cdk.CfnOutput(this, `DomainDnsTarget-${safeId}`, {
        value: associateDomain.getResponseField("DNSTarget"),
        description: `CNAME target for ${project.hostname}`,
      });
    }
  }
}

function safeCfnId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "");
}

function sanitizeServiceName(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
}

function ssmArn(account: string, region: string, path: string): string {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `arn:aws:ssm:${region}:${account}:parameter/${p}`;
}
