// The @tycheg/reasonr-vite plugin: primitive implementations are the
// <Primitive>.tsx files of the implementation directory; tests next to them
// are not in the build and the manifest.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import reasonr, { type BuildManifest } from "../src/index";

type Hooks = {
  configResolved(cfg: { root: string }): void;
  generateBundle(this: { emitFile(f: { source: string }): void }): void;
  load(id: string): string | undefined;
};

function project() {
  const root = mkdtempSync(join(tmpdir(), "reasonr-vite-"));
  mkdirSync(join(root, "primitives"));
  for (const f of ["Tag.tsx", "Tag.test.tsx", "RouteMap.tsx", "helpers.tsx", "Tag.css"]) writeFileSync(join(root, "primitives", f), "");
  return root;
}

describe("@tycheg/reasonr-vite", () => {
  it("the build manifest: implementations without tests and stray files", () => {
    const root = project();
    const p = reasonr({ dir: "primitives" }) as unknown as Hooks;
    p.configResolved({ root });
    let source = "";
    p.generateBundle.call({ emitFile: (f) => (source = f.source) });
    expect((JSON.parse(source) as BuildManifest).primitives).toEqual(["RouteMap", "Tag"]);
  });

  it("the virtual module imports implementations by absolute paths, without tests", () => {
    const root = project();
    const p = reasonr({ dir: join(root, "primitives") }) as unknown as Hooks;
    const code = p.load("\0virtual:reasonr/primitives")!;
    expect(code).toContain(JSON.stringify(join(root, "primitives", "Tag.tsx")));
    expect(code).toContain(`"RouteMap": p0, "Tag": p1`);
    expect(code).not.toContain("test");
  });

  it("the interface program without a model is null", () => {
    const p = reasonr({}) as unknown as Hooks;
    expect(p.load("\0virtual:reasonr/ui-program")).toBe("export default null;\n");
  });
});
