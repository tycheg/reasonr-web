import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import reasonr from "../packages/vite/src/index.js";

// The build goes to web/bundle/src/dist: the bundle Go package embeds it (go:embed).
export default defineConfig({
  base: "/ui/",
  plugins: [react(), reasonr({ dir: "none" })],
  resolve: {
    alias: {
      "@tycheg/reasonr-runtime": fileURLToPath(new URL("../packages/runtime/src/index.ts", import.meta.url)),
      "@tycheg/reasonr-std-ui": fileURLToPath(new URL("../packages/std-ui/src/index.tsx", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../bundle/src/dist", import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
