import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createNewsMcpServer } from "./tools.js";

const server = createNewsMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
