import type { Plugin } from "vite";

export interface Options {
  /** The implementation directory: absolute or relative to the project root; ui/web by default. */
  dir?: string;
  /** The build includes the standard catalog (the manifest); true by default. */
  std?: boolean;
  /** The model module for virtual:reasonr/ui-program; none — the program is null. */
  model?: string;
  /** The compiler command; reasonr from PATH by default. */
  reasonr?: string;
}

/**
 * The build manifest reasonr-ui.json: which primitives the build implements.
 * By it reasonrd check warns about the primitives of web apps without an
 * implementation (C0016). std — the build includes the standard catalog.
 */
export interface BuildManifest {
  std: boolean;
  primitives: string[];
}

/** The implementation names of the directory dir (without .tsx), in alphabetical order. */
export function implementations(dir: string): string[];
/** The interface program of the model model: reasonr build --dump-ui. */
export function uiProgram(model: string, reasonr?: string): unknown;
export default function reasonr(opts?: Options): Plugin;
