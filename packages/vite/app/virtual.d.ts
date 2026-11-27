// The virtual modules of the @tycheg/reasonr-vite plugin.
declare module "virtual:reasonr/primitives" {
  /** The platform's own primitive implementations: primitive name → component. */
  const primitives: import("@tycheg/reasonr-runtime").Registry;
  export default primitives;
}

declare module "virtual:reasonr/ui-program" {
  /** The model's interface program (reasonr build --dump-ui) or null. */
  const program: import("./Primitives").UIProgram | null;
  export default program;
}
