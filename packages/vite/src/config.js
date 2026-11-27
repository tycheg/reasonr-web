// The Vite and Vitest configuration of the reasonr-ui command: each platform
// UI build has only its own implementation directory (RFC §33). The page and
// the runtime entry point are in app/ of this package.
import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import react from "@vitejs/plugin-react";
import reasonr from "./index.js";

/** The directory of the page and the runtime entry point (index.html, main.tsx). */
export const app = fileURLToPath(new URL("../app", import.meta.url));

/**
 * The Vite configuration: ui is the platform UI build directory (the result
 * goes to ui/dist), primitives is the implementation directory, model is the
 * model module for the primitives page, engine is the engine address dev proxies the
 * API.
 */
export function viteConfig({ ui, primitives, model, engine = "http://localhost:8080", reasonr: compiler }) {
  return {
    configFile: false,
    root: app,
    base: "/ui/",
    plugins: [react(), reasonr({ dir: primitives, model, reasonr: compiler })],
    server: {
      fs: { allow: [app, ui, primitives] },
      proxy: {
        "/app": engine,
        "/api": { target: engine, ws: true },
        "/_test": engine,
        "/.well-known": engine,
      },
    },
    build: { outDir: `${ui}/dist`, emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  };
}

/** The Vitest configuration: the implementation tests primitives/**\/*.test.tsx in jsdom. */
export function vitestConfig({ ui, primitives }) {
  return {
    configFile: false,
    root: ui,
    plugins: [react(), reasonr({ dir: primitives })],
    test: {
      environment: "jsdom",
      include: [`${relative(ui, primitives) || "."}/**/*.test.tsx`],
      setupFiles: [`${app}/setup.ts`],
    },
  };
}
