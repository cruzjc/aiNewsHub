import { randomUUID } from "node:crypto";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";

import { createNewsMcpServer } from "./tools.js";

const transports: Record<string, StreamableHTTPServerTransport> = {};

const withTransport = async (request: Request, response: Response) => {
  const sessionId = request.headers["mcp-session-id"];

  try {
    let transport: StreamableHTTPServerTransport | undefined;

    if (typeof sessionId === "string" && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(request.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (generatedSessionId) => {
          transports[generatedSessionId] = transport!;
        },
      });
      transport.onclose = () => {
        const currentSessionId = transport?.sessionId;
        if (currentSessionId) {
          delete transports[currentSessionId];
        }
      };

      const server = createNewsMcpServer();
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
      return;
    }

    if (!transport) {
      response.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error("error handling MCP request", error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
};

export const createHttpMcpApp = () => {
  const app = createMcpExpressApp({ host: "0.0.0.0" });

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "ai-news-hub-mcp",
    });
  });

  app.post("/mcp", withTransport);
  app.get("/mcp", async (request, response) => {
    const sessionId = request.headers["mcp-session-id"];
    if (typeof sessionId !== "string" || !transports[sessionId]) {
      response.status(400).send("Invalid or missing session ID");
      return;
    }

    await transports[sessionId].handleRequest(request, response);
  });
  app.delete("/mcp", async (request, response) => {
    const sessionId = request.headers["mcp-session-id"];
    if (typeof sessionId !== "string" || !transports[sessionId]) {
      response.status(400).send("Invalid or missing session ID");
      return;
    }

    await transports[sessionId].handleRequest(request, response);
  });

  return app;
};
