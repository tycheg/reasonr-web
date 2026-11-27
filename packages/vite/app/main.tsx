// The web runtime of a platform UI build (reasonr-ui dev and build): the
// primitive registry is the standard catalog with the platform's own
// implementations over it. The automatic UI draws a primitive without an
// implementation. In reasonr-ui dev /ui/_primitives is the primitives page on
// values of the model types.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@tycheg/reasonr-runtime";
import { primitives as std, Shell } from "@tycheg/reasonr-std-ui";
import own from "virtual:reasonr/primitives";

const registry = { ...std, ...own };
const root = createRoot(document.getElementById("root")!);
if (import.meta.env.DEV && location.pathname.startsWith("/ui/_primitives")) {
  void Promise.all([import("./Primitives"), import("virtual:reasonr/ui-program")]).then(([{ Primitives }, program]) =>
    root.render(<Primitives program={program.default} registry={registry} own={own} />),
  );
} else {
  root.render(
    <StrictMode>
      <App primitives={registry} shell={Shell} />
    </StrictMode>,
  );
}
