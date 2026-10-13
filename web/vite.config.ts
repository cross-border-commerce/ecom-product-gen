import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root,
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3456",
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
});
