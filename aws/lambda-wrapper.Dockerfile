# syntax=docker/dockerfile:1
#
# Wraps an existing application container image with the AWS Lambda Web
# Adapter so it can run as a Lambda container function.
#
# Usage:
#   docker buildx build \
#     --build-arg BASE_IMAGE=<base-tag> \
#     --file aws/lambda-wrapper.Dockerfile \
#     --tag <ecr-repo>:<tag> \
#     --push .
#
# Notes:
# - The base image keeps its original ENTRYPOINT/CMD; the adapter starts as a
#   Lambda exec wrapper, brings the Runtime API up, then forks the wrapped HTTP
#   server.
# - `AWS_LWA_PORT` (set per-target by `LambdaServicesStack`) tells the adapter
#   which port the wrapped server listens on. We default to 8080 for safety;
#   CDK overrides this with the project's actual port.

ARG ADAPTER_IMAGE=public.ecr.aws/awsguru/aws-lambda-web-adapter:0.9.1
ARG BASE_IMAGE

FROM ${ADAPTER_IMAGE} AS adapter

FROM ${BASE_IMAGE}
COPY --from=adapter /lambda-adapter /opt/extensions/lambda-adapter
ENV AWS_LAMBDA_EXEC_WRAPPER=/opt/extensions/lambda-adapter \
    AWS_LWA_PORT=8080 \
    AWS_LWA_INVOKE_MODE=buffered \
    AWS_LWA_READINESS_CHECK_PATH=/
