// Screen descriptions and manifests (compiler/internal/uiview, format version 1) and
// screen data (adapters/http/appapi): the runtime's contract with the engine (RFC §22).

/** A value in canonical JSON (RFC §31.3). */
export type Value = unknown;

export interface Param {
  name: string;
  type: string;
}

/** The source of an argument value (RFC §22.4). */
export type From =
  | "expr" | "param" | "me" | "new" | "data" | "row" | "form" | "event" | "provided" | "primitive" | "input";

export interface Expr {
  func?: string;
  args?: Arg[];
  value?: Value;
}

export interface Arg {
  name: string;
  type: string;
  from: From;
  node?: number;
  field?: string;
  expr?: Expr;
  input?: boolean;
  default?: boolean;
  value?: Value;
}

export interface Bind {
  type: string;
  method: string;
  command?: boolean;
  result?: string;
  target?: Arg;
  args?: Arg[];
}

export interface Transition {
  screen: string;
  args?: Arg[];
}

export interface PrimValue {
  name: string;
  value?: Expr;
  query?: Bind;
  field?: string;
  screen?: string;
}

export type NodeKind = "primitive" | "part" | "screen" | "field" | "on";

export interface Node {
  id: number;
  kind: NodeKind;
  primitive?: string;
  part?: string;
  field?: string;
  fieldType?: string;
  input?: boolean;
  key?: string;
  text?: string;
  label?: string;
  auto?: boolean;
  rows?: boolean;
  types?: Record<string, string>;
  params?: PrimValue[];
  bind?: Bind;
  to?: Transition;
  event?: string;
  back?: boolean;
  if?: Expr;
  place?: string;
  children?: Node[];
}

export interface TypeView {
  values?: string[];
  labels?: Record<string, string>;
  fields?: { name: string; type: string; label: string }[];
}

export interface Message {
  text: string;
}

export interface Screen {
  version: number;
  app: string;
  screen: string;
  lang: string;
  platform: string;
  title: string;
  params?: Param[];
  nodes: Node[];
  types?: Record<string, TypeView>;
  messages?: Record<string, Message>;
}

export interface Place {
  name: string;
  screen?: string;
  node: number;
  type: string;
  method: string;
  command?: boolean;
}

export interface Manifest {
  version: number;
  app: string;
  lang: string;
  title: string;
  platforms: string[];
  me?: string;
  nodes?: Node[];
  screens: Record<string, string>;
  places?: Place[];
  types?: Record<string, TypeView>;
  messages?: Record<string, Message>;
  test?: boolean;
  /** The feature flags switched on for the user (RFC §23.4). */
  features?: string[];
  /** The visibility of the app's layout nodes for the user: access and if conditions. */
  states?: Record<string, NodeState>;
}

/** The state of a node in the screen data. */
export interface NodeState {
  data?: Value;
  errors?: BusinessError[];
  hidden?: boolean;
  pending?: boolean;
  rows?: Record<string, boolean[]>;
}

export interface ScreenData {
  position?: string;
  nodes: Record<string, NodeState>;
}

export interface BusinessError {
  name: string;
  type?: string;
  args?: Record<string, Value>;
}

export interface Notification {
  name: string;
  type: string;
  args?: Record<string, Value>;
}

/** The response to a command: as in the model API. */
export interface CommandResult {
  status: "accepted" | "rejected";
  position?: string;
  notifications?: Notification[];
  errors?: BusinessError[];
}

export interface Login {
  test?: boolean;
  oidc?: { issuer: string; clientId: string; scopes?: string[] };
}

/** A page of a query result. */
export interface Page<T> {
  items: T[];
  next: string | null;
}
