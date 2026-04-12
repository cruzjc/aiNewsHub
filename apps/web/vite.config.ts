import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    proxy: {
      "/v1": "http://localhost:3001",
      "/health": "http://localhost:3001",
      "/mcp": "http://localhost:3002",
    },
  },
});
