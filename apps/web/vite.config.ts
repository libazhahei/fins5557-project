import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

const wasmPlugins = [wasm(), topLevelAwait()];

export default defineConfig({
  plugins: [react(), tailwindcss(), ...wasmPlugins],
  worker: {
    format: "es",
    plugins: () => [...wasmPlugins],
  },
  optimizeDeps: {
    exclude: ["wickra-wasm"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
