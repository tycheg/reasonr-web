// @tycheg/reasonr-vite holds a platform's own primitive implementations
// (RFC §22, §33). The files <Primitive>.tsx of the implementation directory
// export the primitive implementation by default; the plugin gathers them
// into the virtual module virtual:reasonr/primitives — primitive name →
// component. The implementations override the standard catalog (the
// registry: own → catalog → the automatic UI). tsc checks them against the
// interfaces (reasonr build --ui-types).
//
// virtual:reasonr/ui-program is the model's interface program (reasonr build
// --dump-ui) for the reasonr-ui dev primitives page; null without a model.
//
// The plugin is JavaScript: the reasonr-ui command loads it under Node
// without a build; the types are in index.d.ts.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const primitivesId = "virtual:reasonr/primitives";
const programId = "virtual:reasonr/ui-program";

// An implementation file is <Primitive>.tsx: the primitive name with a
// capital letter. Tests next to it (<Primitive>.test.tsx) are not in the build.
const file = /^[A-Z][A-Za-z0-9]*\.tsx$/;

/** The implementation names of the directory dir (without .tsx), in alphabetical order. */
export function implementations(dir) {
  try {
    return readdirSync(dir).filter((f) => file.test(f)).map((f) => f.slice(0, -4)).sort();
  } catch {
    return []; // no own implementations
  }
}

/** The interface program of the model model: reasonr build --dump-ui. */
export function uiProgram(model, reasonr = "reasonr") {
  return JSON.parse(execFileSync(reasonr, ["build", "--dump-ui", model], { encoding: "utf8", maxBuffer: 64 << 20 }));
}

export default function reasonr(opts = {}) {
  let root = process.cwd();
  const dir = () => {
    const d = (opts.dir ?? "ui/web").replace(/\/$/, "");
    return isAbsolute(d) ? d : resolve(root, d);
  };
  return {
    name: "reasonr-primitives",
    configResolved(cfg) {
      root = cfg.root;
    },
    configureServer(server) {
      // A new or deleted implementation, a changed model — a reload.
      server.watcher.add([dir(), ...(opts.model ? [resolve(opts.model)] : [])]);
      const reload = (path, id) => {
        const m = server.moduleGraph.getModuleById("\0" + id);
        if (m) server.moduleGraph.invalidateModule(m);
        server.ws.send({ type: "full-reload", path });
      };
      server.watcher.on("add", (p) => p.startsWith(dir()) && reload(p, primitivesId));
      server.watcher.on("unlink", (p) => p.startsWith(dir()) && reload(p, primitivesId));
      if (opts.model) server.watcher.on("change", (p) => p.endsWith(".rr") && reload(p, programId));
    },
    generateBundle() {
      const m = { std: opts.std ?? true, primitives: implementations(dir()) };
      this.emitFile({ type: "asset", fileName: "reasonr-ui.json", source: JSON.stringify(m, null, 2) + "\n" });
    },
    resolveId(source) {
      return source === primitivesId || source === programId ? "\0" + source : undefined;
    },
    load(source) {
      if (source === "\0" + primitivesId) {
        const names = implementations(dir());
        const imports = names.map((n, i) => `import p${i} from ${JSON.stringify(join(dir(), n + ".tsx"))};`);
        return `${imports.join("\n")}\nexport default { ${names.map((n, i) => `${JSON.stringify(n)}: p${i}`).join(", ")} };\n`;
      }
      if (source === "\0" + programId) {
        if (!opts.model) return "export default null;\n";
        try {
          return `export default ${JSON.stringify(uiProgram(opts.model, opts.reasonr))};\n`;
        } catch (e) {
          this.warn(`reasonr build --dump-ui ${opts.model}: ${e.message}`);
          return "export default null;\n";
        }
      }
      return undefined;
    },
  };
}
