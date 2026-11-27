// The built-in bundle (RFC §22): the runtime and the standard catalog on
// Ant Design. reasonrd serves it at /ui/ without ingress.ui.dir.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@tycheg/reasonr-runtime";
import { primitives, Shell } from "@tycheg/reasonr-std-ui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App primitives={primitives} shell={Shell} />
  </StrictMode>,
);
