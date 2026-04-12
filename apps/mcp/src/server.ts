import { createHttpMcpApp } from "./transport.js";

const port = Number(process.env.MCP_PORT ?? 3002);
const app = createHttpMcpApp();

app.listen(port, () => {
  console.log(`ai-news-hub mcp listening on http://localhost:${port}/mcp`);
});
