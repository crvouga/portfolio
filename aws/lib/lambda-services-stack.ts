import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import { type InfraTarget, getInfraTargets } from "../../projects.js";
import { apexDomain } from "./route53-stack.js";

export type LambdaServicesStackProps = cdk.StackProps & {
  readonly ecr: Readonly<Record<string, ecr.IRepository>>;
  readonly hostedZones: Readonly<Record<string, route53.IHostedZone>>;
  /**
   * Image tag deployed by CDK on initial create. Subsequent rollouts are done
   * out-of-band by GitHub Actions (`aws lambda update-function-code`), so this
   * is just the tag CDK uses to materialise the function on first apply.
   * @default "latest"
   */
  readonly initialImageTag?: string;
};

/**
 * One Lambda (container image) + Function URL + CloudFront distribution per
 * deployable project. CloudFront fronts the function URL with an ACM cert
 * validated against the project's Route53 hosted zone.
 *
 * Scale-to-zero: Lambda only runs while requests are in-flight. Cold starts
 * are paid by users on the first request after idle. Static-site nginx images
 * cold-start in <1s; heavier runtimes (Rust/Go) usually 1-3s.
 */
export class LambdaServicesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LambdaServicesStackProps) {
    super(scope, id, props);

    const initialImageTag = props.initialImageTag ?? "latest";
    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    if (region !== "us-east-1") {
      cdk.Annotations.of(this).addWarning(
        `LambdaServicesStack is in ${region}. ACM certs for CloudFront must be in us-east-1. ` +
          "Consider deploying this stack in us-east-1 or splitting cert creation into a separate us-east-1 stack.",
      );
    }

    for (const target of getInfraTargets()) {
      const repo = props.ecr[target.id];
      if (!repo) {
        throw new Error(`Missing ECR repo binding for ${target.id}`);
      }

      const apex = apexDomain(target.hostname);
      const zone = props.hostedZones[apex];
      if (!zone) {
        throw new Error(`Missing hosted zone for apex domain ${apex} (${target.id})`);
      }

      const safeId = safeCfnId(target.id);

      const logGroup = new logs.LogGroup(this, `LogGroup-${safeId}`, {
        logGroupName: `/aws/lambda/chrisvouga-${sanitizeFnName(target.id)}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      const fn = new lambda.DockerImageFunction(this, `Fn-${safeId}`, {
        functionName: `chrisvouga-${sanitizeFnName(target.id)}`,
        description: `${target.title} (${target.hostname}) — chrisvouga.dev`,
        code: lambda.DockerImageCode.fromEcr(repo, { tagOrDigest: initialImageTag }),
        memorySize: 1024,
        timeout: cdk.Duration.seconds(30),
        architecture: lambda.Architecture.X86_64,
        environment: buildEnvironment(target),
        logGroup,
      });

      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
          resources: [
            `arn:aws:ssm:${region}:${account}:parameter/chrisvouga/${target.id}/*`,
          ],
        }),
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["kms:Decrypt"],
          resources: [`arn:aws:kms:${region}:${account}:key/*`],
          conditions: { StringEquals: { "kms:ViaService": `ssm.${region}.amazonaws.com` } },
        }),
      );

      const fnUrl = fn.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.AWS_IAM,
        invokeMode: lambda.InvokeMode.BUFFERED,
      });

      const cert = new acm.Certificate(this, `Cert-${safeId}`, {
        domainName: target.hostname,
        validation: acm.CertificateValidation.fromDns(zone),
      });

      const distribution = new cloudfront.Distribution(this, `Dist-${safeId}`, {
        comment: `${target.id} — ${target.hostname}`,
        defaultBehavior: {
          origin: origins.FunctionUrlOrigin.withOriginAccessControl(fnUrl, {
            readTimeout: cdk.Duration.seconds(30),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          compress: true,
        },
        domainNames: [target.hostname],
        certificate: cert,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      });

      new route53.ARecord(this, `A-${safeId}`, {
        zone,
        recordName: target.hostname,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        comment: `${target.id} → CloudFront`,
      });
      new route53.AaaaRecord(this, `AAAA-${safeId}`, {
        zone,
        recordName: target.hostname,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        comment: `${target.id} → CloudFront (IPv6)`,
      });

      new cdk.CfnOutput(this, `FunctionName-${safeId}`, {
        value: fn.functionName,
        description: `Lambda function for ${target.id} (use for aws lambda update-function-code)`,
        exportName: `chrisvouga-fn-${safeId}`,
      });
      new cdk.CfnOutput(this, `FunctionUrl-${safeId}`, {
        value: fnUrl.url,
      });
      new cdk.CfnOutput(this, `DistributionDomain-${safeId}`, {
        value: distribution.distributionDomainName,
        description: `CloudFront domain for ${target.hostname}`,
      });
      new cdk.CfnOutput(this, `Hostname-${safeId}`, {
        value: target.hostname,
      });
    }
  }
}

/**
 * Build Lambda environment for a project.
 *
 * - `AWS_LWA_PORT` tells the AWS Lambda Web Adapter which port the wrapped
 *   HTTP server listens on (must match the project's Dockerfile EXPOSE).
 * - `AWS_LWA_READINESS_CHECK_PATH` is hit by the adapter until the server
 *   responds OK before forwarding traffic.
 * - Secrets are injected via CloudFormation `{{resolve:ssm:...}}` references
 *   (NOT `ssm-secure`, which is unsupported in Lambda env vars). Store them
 *   as SSM `String` parameters at `/chrisvouga/{project.id}/{NAME}`.
 */
function buildEnvironment(target: InfraTarget): Record<string, string> {
  const env: Record<string, string> = {
    PORT: String(target.port),
    AWS_LWA_PORT: String(target.port),
    AWS_LWA_READINESS_CHECK_PATH: "/",
    AWS_LWA_INVOKE_MODE: "buffered",
  };

  for (const name of target.secrets) {
    env[name] = `{{resolve:ssm:/chrisvouga/${target.id}/${name}}}`;
  }

  if (target.id === "pickflix") {
    env["NODE_ENV"] = "production";
  }
  if (target.id.startsWith("moviefinder-app-") && target.id !== "moviefinder-app-clojurescript") {
    env["STAGE"] = "production";
  }

  return env;
}

function safeCfnId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "");
}

function sanitizeFnName(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
}
