#!/usr/bin/env node
// reasonr-ui is the UI tool of the base ReasonR engine for building a
// platform UI (RFC §33). The build directory is the current one: it holds
// package.json and the primitive implementations (primitives/).
//
//   reasonr-ui dev [--engine url] [--model module] [--port N]
//       Vite: the apps on their own primitives with hot reload, the API is
//       proxied to the engine (http://localhost:8080 by default, reasonrd dev);
//       /ui/_primitives is the primitives page on values of the model types.
//   reasonr-ui test [--watch]    implementation tests (Vitest, jsdom)
//   reasonr-ui build             a build into dist/ with the manifest reasonr-ui.json
//   reasonr-ui types --model module   the implementation interfaces: primitives/reasonr-ui.ts
//   reasonr-ui typecheck         checking the implementations against the interfaces (tsc)
//
// From PATH: npm install -g @tycheg/reasonr-vite (or make install here).
//
// The model module is --model or $REASONR_MODEL, the compiler is reasonr from
// PATH or $REASONR.
//
// Outside a UI build (reasonr-ui from PATH, make install) the command finds
// one — a package.json with the @tycheg/reasonr-vite dependency in the
// current directory, above or below (pilot → ui/web) — installs its packages
// if they are missing, and runs there: the script npm run <command> (it has
// --model) or its reasonr-ui.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

await delegate();

/** Runs a command; SIGINT and SIGTERM are passed to it. The result is the exit code. */
function run(cmd, args, cwd) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" });
    const forward = (sig) => child.kill(sig);
    process.on("SIGINT", forward).on("SIGTERM", forward);
    child.on("error", () => done(2));
    child.on("exit", (code, sig) => done(code ?? (sig ? 1 : 2)));
  });
}

/** A UI build: a package.json with the @tycheg/reasonr-vite dependency. */
function isUI(dir) {
  try {
    const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return Boolean(p.dependencies?.["@tycheg/reasonr-vite"] ?? p.devDependencies?.["@tycheg/reasonr-vite"]);
  } catch {
    return false;
  }
}

/** The UI builds in the directory dir and below (down to depth), without node_modules. */
function below(dir, depth) {
  if (isUI(dir)) return [dir];
  if (depth === 0) return [];
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith(".")) out = out.concat(below(join(dir, e.name), depth - 1));
  }
  return out;
}

/**
 * The real directory of the @tycheg/reasonr-vite package the UI build ui
 * resolves (its node_modules or a workspace's hoisted one); undefined — not
 * installed.
 */
function installed(ui) {
  try {
    const pkg = createRequire(join(ui, "package.json")).resolve("@tycheg/reasonr-vite/package.json");
    return existsSync(join(dirname(pkg), "bin", "reasonr-ui.mjs")) ? realpathSync(dirname(pkg)) : undefined;
  } catch {
    return undefined;
  }
}

/** Hands the run over to the UI build if this command is not its own. */
async function delegate() {
  const self = realpathSync(dirname(dirname(fileURLToPath(import.meta.url))));
  let ui;
  for (let d = process.cwd(); ; d = dirname(d)) {
    if (isUI(d)) {
      ui = d;
      break;
    }
    if (dirname(d) === d) break;
  }
  if (!ui) {
    const found = below(process.cwd(), 5);
    if (found.length === 0) {
      console.error("reasonr-ui: no platform UI build (a package.json with the @tycheg/reasonr-vite dependency) in this directory, above or below");
      process.exit(2);
    }
    if (found.length > 1) {
      console.error("reasonr-ui: there are several UI builds — run in the right one:\n" + found.map((f) => "  " + relative(process.cwd(), f)).join("\n"));
      process.exit(2);
    }
    ui = found[0];
  }
  let local = installed(ui);
  if (local === self) return; // this command is the UI build's
  if (!local) {
    console.error(`reasonr-ui: installing the UI build packages (npm install in ${relative(process.cwd(), ui) || "."})`);
    if ((await run("npm", ["install", "--no-audit", "--no-fund"], ui)) !== 0) process.exit(2);
    local = installed(ui);
    if (!local) fail(`no @tycheg/reasonr-vite in ${ui} after npm install`);
  }
  if (local === self) return;
  const [cmd, ...rest] = process.argv.slice(2);
  const scripts = JSON.parse(readFileSync(join(ui, "package.json"), "utf8")).scripts ?? {};
  const code = cmd && /^reasonr-ui\s/.test(scripts[cmd] ?? "")
    ? await run("npm", ["run", "--silent", cmd, ...(rest.length ? ["--", ...rest] : [])], ui)
    : await run(process.execPath, [join(local, "bin", "reasonr-ui.mjs"), ...process.argv.slice(2)], ui);
  process.exit(code);
}

const usage = "Usage: reasonr-ui dev|test|build|types|typecheck [--model module] [--engine url] [--port N] [--primitives dir] [--watch]";

const [cmd, ...args] = process.argv.slice(2);
let flags;
try {
  ({ values: flags } = parseArgs({
    args,
    options: {
      model: { type: "string" },
      engine: { type: "string" },
      port: { type: "string" },
      primitives: { type: "string", default: "primitives" },
      watch: { type: "boolean", default: false },
    },
  }));
} catch (e) {
  fail(`${e.message}\n${usage}`);
}
const ui = process.cwd();
const primitives = resolve(ui, flags.primitives);
const model = flags.model ?? process.env.REASONR_MODEL;
const opts = { ui, primitives, model: model && resolve(model), engine: flags.engine, reasonr: process.env.REASONR };

function fail(msg) {
  console.error(`reasonr-ui: ${msg}`);
  process.exit(2);
}

switch (cmd) {
  case "dev": {
    const { createServer } = await import("vite");
    const { viteConfig } = await import("../src/config.js");
    const cfg = viteConfig(opts);
    if (flags.port) cfg.server.port = Number(flags.port);
    const server = await createServer(cfg);
    await server.listen();
    server.printUrls();
    const url = server.resolvedUrls?.local[0] ?? "http://localhost:5173/ui/";
    console.log(`  ➜  Primitives: ${url}_primitives${model ? "" : " (set --model to show the model types)"}`);
    console.log(`  ➜  API: ${opts.engine ?? "http://localhost:8080"} (reasonrd dev)`);
    break;
  }
  case "build": {
    const { build } = await import("vite");
    const { viteConfig } = await import("../src/config.js");
    await build({ ...viteConfig(opts), mode: "production" });
    break;
  }
  case "test": {
    const { startVitest } = await import("vitest/node");
    const { vitestConfig } = await import("../src/config.js");
    const vitest = await startVitest("test", [], { watch: flags.watch, config: false, root: ui }, vitestConfig(opts));
    if (!flags.watch) {
      await vitest?.close();
      process.exit(process.exitCode ?? (vitest ? 0 : 1));
    }
    break;
  }
  case "types": {
    if (!model) fail("types: set --model <model module> or REASONR_MODEL");
    let out;
    try {
      out = execFileSync(process.env.REASONR ?? "reasonr", ["build", "--ui-types", model], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    } catch (e) {
      fail(`reasonr build --ui-types: ${e.message}`);
    }
    writeFileSync(resolve(primitives, "reasonr-ui.ts"), out);
    break;
  }
  case "typecheck": {
    // The package exports no bin/ (TypeScript 7): the path is its bin field.
    const ts = createRequire(import.meta.url).resolve("typescript/package.json");
    const bin = JSON.parse(readFileSync(ts, "utf8")).bin;
    const tsc = join(dirname(ts), typeof bin === "string" ? bin : bin.tsc);
    const r = spawnSync(process.execPath, [tsc, "-p", resolve(ui, "tsconfig.json"), "--noEmit"], { stdio: "inherit" });
    process.exit(r.status ?? 2);
    break;
  }
  default:
    fail(usage);
}
