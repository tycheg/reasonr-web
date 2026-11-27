import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tycheg/reasonr-runtime": fileURLToPath(new URL("./packages/runtime/src/index.ts", import.meta.url)),
      "@tycheg/reasonr-std-ui": fileURLToPath(new URL("./packages/std-ui/src/index.tsx", import.meta.url)),
    },
  },
  test: { environment: "jsdom", include: ["packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx"], setupFiles: ["packages/runtime/test/setup.ts"] },
});
