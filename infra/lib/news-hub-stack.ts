import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Duration, Fn, RemovalPolicy, Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { Runtime, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { DefinitionBody, StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import type { Construct } from "constructs";

export class AiNewsHubStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const stackDirectory = dirname(fileURLToPath(import.meta.url));
    const webDistPath = resolve(stackDirectory, "../../apps/web/dist");
    const sourceRegistryPath = resolve(stackDirectory, "../../config/source-registry.json");
    const sourceRegistryJson = readFileSync(sourceRegistryPath, "utf-8");

    const siteBucket = new Bucket(this, "SiteBucket", {
      autoDeleteObjects: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: undefined,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const contentTable = new Table(this, "ContentTable", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    contentTable.addGlobalSecondaryIndex({
      indexName: "gsi1",
      partitionKey: { name: "gsi1pk", type: AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: AttributeType.STRING },
    });

    contentTable.addGlobalSecondaryIndex({
      indexName: "gsi2",
      partitionKey: { name: "gsi2pk", type: AttributeType.STRING },
      sortKey: { name: "gsi2sk", type: AttributeType.STRING },
    });

    const openAiSecret = new Secret(this, "OpenAiSecret", {
      secretName: "ai-news-hub/openai-api-key",
    });

    const enrichmentQueue = new Queue(this, "EnrichmentQueue", {
      visibilityTimeout: Duration.seconds(120),
    });

    const apiLambda = new NodejsFunction(this, "ApiLambda", {
      runtime: Runtime.NODEJS_22_X,
      entry: "../apps/api/src/lambda.ts",
      handler: "handler",
      bundling: {
        target: "node22",
      },
      environment: {
        CONTENT_TABLE_NAME: contentTable.tableName,
      },
    });

    const mcpLambda = new NodejsFunction(this, "McpLambda", {
      runtime: Runtime.NODEJS_22_X,
      entry: "../apps/mcp/src/http.ts",
      handler: "handler",
      bundling: {
        target: "node22",
      },
      environment: {
        CONTENT_TABLE_NAME: contentTable.tableName,
      },
    });

    const hourlyIngestLambda = new NodejsFunction(this, "HourlyIngestLambda", {
      runtime: Runtime.NODEJS_22_X,
      entry: "../apps/workers/src/handlers.ts",
      handler: "hourlyIngestHandler",
      timeout: Duration.minutes(2),
      memorySize: 512,
      bundling: {
        target: "node22",
      },
      environment: {
        ENRICHMENT_QUEUE_URL: enrichmentQueue.queueUrl,
        OPENAI_SECRET_ARN: openAiSecret.secretArn,
        SOURCE_REGISTRY_JSON: sourceRegistryJson,
        MAX_CANDIDATES_PER_SOURCE: "8",
        MAX_CANDIDATES_PER_RUN: "24",
        ENRICHMENT_CONCURRENCY: "4",
      },
    });

    const enrichBatchLambda = new NodejsFunction(this, "EnrichBatchLambda", {
      runtime: Runtime.NODEJS_22_X,
      entry: "../apps/workers/src/handlers.ts",
      handler: "enrichBatchHandler",
      bundling: {
        target: "node22",
      },
      environment: {
        CONTENT_TABLE_NAME: contentTable.tableName,
        OPENAI_SECRET_ARN: openAiSecret.secretArn,
      },
    });

    enrichBatchLambda.addEventSource(
      new SqsEventSource(enrichmentQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
        maxBatchingWindow: Duration.seconds(30),
      }),
    );

    contentTable.grantReadWriteData(enrichBatchLambda);
    contentTable.grantReadData(apiLambda);
    contentTable.grantReadData(mcpLambda);
    contentTable.grantReadWriteData(hourlyIngestLambda);
    enrichmentQueue.grantSendMessages(hourlyIngestLambda);
    openAiSecret.grantRead(hourlyIngestLambda);
    openAiSecret.grantRead(enrichBatchLambda);

    const ingestStateMachine = new StateMachine(this, "IngestStateMachine", {
      definitionBody: DefinitionBody.fromChainable(
        new LambdaInvoke(this, "InvokeHourlyIngest", {
          lambdaFunction: hourlyIngestLambda,
          outputPath: "$.Payload",
        }),
      ),
      timeout: Duration.minutes(15),
    });

    const api = new HttpApi(this, "PublicHttpApi");
    api.addRoutes({
      path: "/{proxy+}",
      integration: new HttpLambdaIntegration("ApiIntegration", apiLambda),
    });
    api.addRoutes({
      path: "/",
      integration: new HttpLambdaIntegration("RootApiIntegration", apiLambda),
    });
    api.addRoutes({
      path: "/mcp",
      integration: new HttpLambdaIntegration("McpIntegration", mcpLambda),
    });

    const apiOrigin = new HttpOrigin(Fn.select(2, Fn.split("/", api.apiEndpoint)));

    const distribution = new Distribution(this, "SiteDistribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
    });

    const passthroughBehavior = {
      origin: apiOrigin,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    };

    distribution.addBehavior("/v1/*", apiOrigin, {
      ...passthroughBehavior,
      allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    });
    distribution.addBehavior("/health", apiOrigin, {
      ...passthroughBehavior,
      allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    });
    distribution.addBehavior("/mcp*", apiOrigin, {
      ...passthroughBehavior,
      allowedMethods: AllowedMethods.ALLOW_ALL,
    });

    new BucketDeployment(this, "SiteDeployment", {
      sources: [Source.asset(webDistPath)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
      prune: true,
    });

    new Rule(this, "HourlyIngestRule", {
      schedule: Schedule.cron({
        minute: "15",
      }),
      targets: [new SfnStateMachine(ingestStateMachine)],
    });

    new CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new CfnOutput(this, "DistributionDomainName", { value: distribution.distributionDomainName });
    new CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "HttpApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "ContentTableName", { value: contentTable.tableName });
  }
}
