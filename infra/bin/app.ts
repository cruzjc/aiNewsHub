#!/usr/bin/env node
import "source-map-support/register.js";
import { App } from "aws-cdk-lib";

import { AiNewsHubStack } from "../lib/news-hub-stack.js";

const app = new App();

new AiNewsHubStack(app, "AiNewsHubStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-west-2",
  },
});
