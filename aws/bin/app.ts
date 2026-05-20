#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { EcrStack } from "../lib/ecr-stack.js";
import { GithubOidcStack } from "../lib/github-oidc-stack.js";
import { LambdaServicesStack } from "../lib/lambda-services-stack.js";
import { Route53Stack } from "../lib/route53-stack.js";

const app = new cdk.App();

const account = app.node.tryGetContext("account") ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext("region") ?? process.env.CDK_DEFAULT_REGION;

if (!account || !region) {
  throw new Error(
    "Set context.account / context.region in cdk.json, or export CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION.",
  );
}

if (region !== "us-east-1") {
  // CloudFront ACM certs must live in us-east-1. Keeping the entire app there
  // avoids cross-region cert plumbing. Override at your own risk.
  console.warn(
    `[warn] CDK_DEFAULT_REGION is ${region}; LambdaServicesStack expects us-east-1 for ACM/CloudFront integration.`,
  );
}

const env: cdk.Environment = { account, region };
const githubOrg = (app.node.tryGetContext("githubOrg") as string | undefined) ?? "crvouga";
const githubRepo =
  (app.node.tryGetContext("githubRepo") as string | undefined) ?? "chrisvouga.dev";
const initialImageTag =
  (app.node.tryGetContext("initialImageTag") as string | undefined) ??
  process.env.INITIAL_IMAGE_TAG ??
  "latest";

new GithubOidcStack(app, "GithubOidcStack", { env, githubOrg, githubRepo });

const ecrStack = new EcrStack(app, "EcrStack", { env });

const route53Stack = new Route53Stack(app, "Route53Stack", { env });

const lambdaStack = new LambdaServicesStack(app, "LambdaServicesStack", {
  env,
  ecr: ecrStack.repositories,
  hostedZones: route53Stack.hostedZones,
  initialImageTag,
});
lambdaStack.addDependency(ecrStack);
lambdaStack.addDependency(route53Stack);
