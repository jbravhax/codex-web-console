import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webHost = process.env.VITE_HOST || "127.0.0.1";
const webPort = Number(process.env.VITE_PORT || 5173);
const apiHost = process.env.VITE_API_HOST || "127.0.0.1";
const apiPort = Number(process.env.VITE_API_PORT || 8787);

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@xterm")) {
            return "xterm-vendor";
          }

          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  },
  server: {
    host: webHost,
    port: webPort,
    proxy: {
      "/api": `http://${apiHost}:${apiPort}`,
      "/health": `http://${apiHost}:${apiPort}`,
      "/ws": {
        target: `ws://${apiHost}:${apiPort}`,
        ws: true
      }
    }
  }
});
