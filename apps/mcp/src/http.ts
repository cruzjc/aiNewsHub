import serverless from "serverless-http";

import { createHttpMcpApp } from "./transport.js";

const app = createHttpMcpApp();

export const handler = serverless(app);
