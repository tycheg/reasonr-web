// Running a screen description (RFC §22.4–22.10): binding the values of
// scopes, node data, command forms, parts, events and navigation, labels
// for UI tests. Primitive implementations get ready properties — there is
// no model in them.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { Api } from "./api";
import type { Arg, BusinessError, Manifest, Node, NodeState, Notification, Screen, TypeView, Value } from "./types";

/** An element of a part or of a primitive's children: a caption and a node. */
export interface Item {
  key: string;
  label?: string;
  node: ReactNode;
}

/** An element of a row part: a caption and the row rendering. */
export interface RowItem<Row> {
  key: string;
  label?: string;
  render(row: Row, index: number): ReactNode;
}

/** The attributes of an element label (data-rr). */
export type Attrs = Record<string, string>;

/** Labels for UI tests (RFC §22.10): an implementation puts them on elements. */
export interface RR {
  root: Attrs;
  submit: Attrs;
  /** The button that opens a dialog with a form (Edit, Confirm). */
  open: Attrs;
  /** The next page (Table, List). */
  more: Attrs;
  input(field: string): Attrs;
  result(value: Value): Attrs;
  item(row: Value): Attrs;
}

/** Primitive implementations by name. */
export type Registry = Record<string, ComponentType<any>>;

/** A screen message: an error or a notification. */
export interface Msg {
  kind: "error" | "notification";
  name: string;
  text: string;
}

/** The screen environment. */
export interface ScreenEnv {
  api: Api;
  manifest: Manifest;
  view: Screen;
  params: Record<string, Value>;
  states: Record<string, NodeState>;
  me?: string;
  registry: Registry;
  navigate(screen: string, params: Record<string, Value>): void;
  back(): void;
  reload(after?: string): void;
  say(m: Msg): void;
  href(screen: string, params: Record<string, Value>): string;
}

const EnvContext = createContext<ScreenEnv | null>(null);

/** The screen environment for pages outside an app: the reasonr-ui dev primitives page. */
export const ScreenContext = EnvContext;

/** The screen environment for implementations: the types and captions of values. */
export function useScreen(): ScreenEnv {
  const env = useContext(EnvContext);
  if (!env) throw new Error("useScreen outside a ReasonR screen");
  return env;
}

/** The caption of an enumeration value, or the value itself. */
export function useLabel(): (type: string | undefined, value: Value) => string {
  const env = useContext(EnvContext);
  return (type, value) => {
    const t: TypeView | undefined = type ? env?.view.types?.[baseType(type)] : undefined;
    if (typeof value === "string" && t?.labels?.[value]) return t.labels[value];
    return value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  };
}

function baseType(t: string) {
  return t.replace(/\?$/, "");
}

// ---------------------------------------------------------------------------
// Scopes

/** A command form or query filters: input values by path. */
export interface Form {
  place: string;
  values: Record<string, Value>;
  set(path: string[], v: Value): void;
  error(path: string[]): string | undefined;
}

interface Scope {
  value?: Value; // an object whose fields are lowercase strings
  data: Map<number, Value>;
  rows: Map<number, { value: Value; index: number }>;
  form?: Form;
  path: string[];
  event?: Record<string, Value>;
  provided?: Record<string, Value>;
  place?: string; // the place of the nearest bound node — for input labels
}

const rootScope = (): Scope => ({ data: new Map(), rows: new Map(), path: [] });

function get(v: Value, field: string | undefined): Value {
  if (!field || v === null || typeof v !== "object") return undefined;
  return (v as Record<string, Value>)[field];
}

function getPath(v: Value, path: string[]): Value {
  return path.reduce<Value>((acc, f) => get(acc, f), v);
}

function setPath(v: Record<string, Value>, path: string[], x: Value): Record<string, Value> {
  if (path.length === 0) return v;
  const [head, ...rest] = path;
  const inner = (v[head] && typeof v[head] === "object" ? v[head] : {}) as Record<string, Value>;
  return { ...v, [head]: rest.length ? setPath(inner, rest, x) : x };
}

/** An argument value from the scopes (RFC §22.4); undefined — there is none. */
function resolve(env: ScreenEnv, a: Arg, s: Scope): Value {
  switch (a.from) {
    case "param":
      return env.params[a.field ?? a.name];
    case "me":
      return env.me;
    case "new":
      return newID();
    case "data":
      return get(s.data.get(a.node ?? 0), a.field);
    case "row":
      return get(s.rows.get(a.node ?? 0)?.value, a.field);
    case "form":
      return s.form?.values[a.field ?? a.name];
    case "event":
      return s.event?.[a.field ?? a.name];
    case "provided":
      return s.provided?.[a.field ?? a.name];
    case "expr":
      return a.expr?.value;
    case "input":
      return a.value;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Labels

function attrs(rr: string, value?: Value): Attrs {
  const a: Attrs = { "data-rr": rr };
  if (value !== undefined) a["data-rr-value"] = JSON.stringify(value);
  return a;
}

/** The row identifier for the item label: the first identifier field. */
function rowID(row: Value, view: Screen, place: string): string {
  if (row && typeof row === "object") {
    for (const [k, v] of Object.entries(row as Record<string, Value>)) {
      if (k.endsWith("Id") || k === "id") return String(v);
    }
  }
  void view;
  void place;
  return "";
}

function makeRR(env: ScreenEnv, n: Node, s: Scope): RR {
  const place = n.place ?? s.place ?? "";
  return {
    root: place && n.place ? attrs("place:" + place) : {},
    submit: attrs("submit:" + place),
    open: attrs("open:" + place),
    more: attrs("more:" + place),
    input: (field) => attrs("input:" + place + "." + [...s.path, field].join(".")),
    result: (value) => attrs("result:" + place, value),
    item: (row) => attrs("item:" + place + ":" + rowID(row, env.view, place)),
  };
}

// ---------------------------------------------------------------------------
// Layout rows

/** A node is visible: not hidden by the server or by a condition in its row. */
function visible(env: ScreenEnv, n: Node, s: Scope): boolean {
  if (env.states[String(n.id)]?.hidden) return false;
  for (const [node, r] of s.rows) {
    const vis = env.states[String(node)]?.rows?.[String(n.id)];
    if (vis && vis[r.index] === false) return false;
  }
  return true;
}

export function renderNodes(env: ScreenEnv, nodes: Node[] | undefined, s: Scope): ReactNode[] {
  return (nodes ?? []).filter((n) => n.kind !== "on" && n.kind !== "part").map((n) => renderNode(env, n, s));
}

export function renderNode(env: ScreenEnv, n: Node, s: Scope): ReactNode {
  if (!visible(env, n, s)) return null;
  switch (n.kind) {
    case "screen":
      return <EmbeddedScreen key={n.id} env={env} n={n} s={s} />;
    case "field":
      return n.input ? <InputNode key={n.id} env={env} n={n} s={s} /> : <FieldNode key={n.id} env={env} n={n} s={s} />;
    case "primitive":
      if (n.bind && !n.bind.command) return <QueryNode key={n.id} env={env} n={n} s={s} />;
      if (n.bind?.command) return <CommandNode key={n.id} env={env} n={n} s={s} />;
      return <Primitive key={n.id} env={env} n={n} s={s} extra={{}} />;
  }
  return null;
}

/** A primitive implementation: the module's own, the catalog's or the automatic UI. */
function impl(env: ScreenEnv, name?: string): ComponentType<any> {
  return (name && env.registry[name]) || Auto;
}

/** The properties of a primitive's parts, children, parameters and events. */
function structure(env: ScreenEnv, n: Node, s: Scope): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const kids: Node[] = [];
  for (const c of n.children ?? []) {
    if (c.kind === "part") props[lowerCamel(c.part ?? "")] = items(env, c, c.children, s, c.rows ? n.id : 0);
    else if (c.kind !== "on") kids.push(c);
  }
  props.children = items(env, n, kids, s, n.rows ? n.id : 0);
  for (const pv of n.params ?? []) {
    if (pv.value) props[pv.name] = pv.value.value;
    else if (pv.field) props[pv.name] = (row: Value) => get(row, pv.field);
    else if (pv.screen) props[pv.name] = () => env.navigate(pv.screen!, {});
    else if (pv.query) {
      props[pv.name] = async (...values: Value[]) => {
        const q = pv.query!;
        const provided: Record<string, Value> = {};
        (q.args ?? []).forEach((a, i) => {
          if (a.from === "provided") provided[a.field ?? a.name] = values[i];
        });
        const first = values[0];
        const args: Record<string, Value> = {};
        for (const a of q.args ?? []) {
          const v = a.from === "provided" ? (provided[a.field ?? a.name] ?? first) : resolve(env, a, { ...s, provided });
          if (v !== undefined) args[a.name] = v;
        }
        const r = await env.api.query(env.manifest.app, env.view.screen, n.id, args, { param: pv.name });
        return r.data;
      };
    }
  }
  for (const c of n.children ?? []) {
    if (c.kind === "on" && c.event) {
      props["on" + upperFirst(c.event)] = (...data: Value[]) => fire(env, c, s, eventData(data));
    }
  }
  return props;
}

function eventData(data: Value[]): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const d of data) if (d && typeof d === "object") Object.assign(out, d as object);
  return out;
}

/** Navigation on an event: a screen with parameters from the event data and the scopes. */
function fire(env: ScreenEnv, on: Node, s: Scope, event: Record<string, Value>) {
  if (on.back || !on.to) {
    env.back();
    return;
  }
  const es: Scope = { ...s, event };
  const params: Record<string, Value> = {};
  for (const a of on.to.args ?? []) params[a.name] = resolve(env, a, es);
  env.navigate(on.to.screen, params);
}

function items(env: ScreenEnv, owner: Node, nodes: Node[] | undefined, s: Scope, rowNode: number): Item[] | RowItem<Value>[] {
  void owner;
  const list = (nodes ?? []).filter((c) => c.kind !== "on" && c.kind !== "part");
  if (rowNode) {
    return list.map((c) => ({
      key: String(c.id),
      label: c.label,
      render: (row: Value, index: number) => {
        const rs: Scope = { ...s, value: row, rows: new Map(s.rows).set(rowNode, { value: row, index }) };
        return renderNode(env, c, rs);
      },
    }));
  }
  return list.filter((c) => visible(env, c, s)).map((c) => ({ key: String(c.id), label: c.label, node: renderNode(env, c, s) }));
}

function Primitive({ env, n, s, extra }: { env: ScreenEnv; n: Node; s: Scope; extra: Record<string, unknown> }) {
  const Impl = impl(env, n.primitive);
  const props: Record<string, unknown> = { ...structure(env, n, s), caption: n.label, rr: makeRR(env, n, s), node: n, ...extra };
  if (n.to) {
    const params: Record<string, Value> = {};
    for (const a of n.to.args ?? []) params[a.name] = resolve(env, a, s);
    props.href = env.href(n.to.screen, params);
    props.go = () => env.navigate(n.to!.screen, params);
  }
  return <Impl {...props} />;
}

// ---------------------------------------------------------------------------
// Fields

function FieldNode({ env, n, s }: { env: ScreenEnv; n: Node; s: Scope }) {
  const value = get(s.value, n.field);
  const Impl = impl(env, n.primitive);
  const inner: Scope = { ...s, value };
  return <Impl {...structure(env, n, inner)} value={value} type={n.fieldType} caption={n.label} rr={makeRR(env, n, s)} node={n} />;
}

function InputNode({ env, n, s }: { env: ScreenEnv; n: Node; s: Scope }) {
  const path = [...s.path, n.field ?? ""];
  const form = s.form;
  const value = form ? getPath(form.values, path) : undefined;
  const Impl = impl(env, n.primitive);
  const inner: Scope = { ...s, path, value };
  const rr = makeRR(env, n, s);
  const label = rr.input(n.field ?? "")["data-rr"];
  useEffect(() => testHook(label, (v) => form?.set(path, v)), [label, form]);
  return (
    <Impl
      {...structure(env, n, inner)}
      value={value}
      onChange={(v: Value) => form?.set(path, v)}
      error={form?.error(path)}
      type={n.fieldType}
      caption={n.label}
      rr={{ ...rr, root: rr.input(n.field ?? "") }}
      node={n}
    />
  );
}

/**
 * A new identifier (new). The UI test runner puts the step's identifiers
 * (orderId: o1) into the queue window.__reasonr.ids, so that a place with
 * new matches the step argument (RFC §27.3, item 1).
 */
function newID(): string {
  const w = window as unknown as { __reasonr?: { ids?: string[] } };
  return w.__reasonr?.ids?.shift() ?? crypto.randomUUID();
}

/**
 * An input by label for the UI test runner (--driver web): a value in
 * canonical JSON is written into the form as if the user had entered it.
 * Widgets can be complex (a select with search), while the runner needs to
 * check the place, the form and the submit.
 */
function testHook(label: string, set: (v: Value) => void): () => void {
  const w = window as unknown as { __reasonr?: { inputs: Record<string, (v: Value) => void> } };
  w.__reasonr ??= { inputs: {} };
  w.__reasonr.inputs[label] = set;
  return () => {
    if (w.__reasonr?.inputs[label] === set) delete w.__reasonr.inputs[label];
  };
}

// ---------------------------------------------------------------------------
// Queries

function QueryNode({ env, n, s }: { env: ScreenEnv; n: Node; s: Scope }) {
  const st = env.states[String(n.id)];
  const [data, setData] = useState<Value>(st?.data);
  const [rows, setRows] = useState(st?.rows);
  const [errors, setErrors] = useState(st?.errors);
  const [loading, setLoading] = useState(false);
  const filters = useForm(n, s, true);
  const page = n.bind?.result?.startsWith("page<");
  useEffect(() => {
    setData(st?.data);
    setRows(st?.rows);
    setErrors(st?.errors);
  }, [st]);
  const args = (cursor: string | null, values = filters.values): Record<string, Value> => {
    const out: Record<string, Value> = {};
    for (const a of n.bind?.args ?? []) {
      let v: Value;
      if (a.from === "primitive") {
        const size = (n.params ?? []).find((p) => p.name === "size")?.value?.value ?? 20;
        v = { size, cursor };
      } else if (a.input) v = values[a.name] ?? a.value;
      else v = resolve(env, a, s);
      if (v !== undefined) out[a.name] = v;
    }
    return out;
  };
  const refetch = async (cursor: string | null, append: boolean, values?: Record<string, Value>) => {
    setLoading(true);
    try {
      const r = await env.api.query(env.manifest.app, env.view.screen, n.id, args(cursor, values));
      if (append && page && data && r.data) {
        const prev = data as { items: Value[] };
        const next = r.data as { items: Value[]; next: string | null };
        setData({ items: [...prev.items, ...next.items], next: next.next });
        setRows((old) => mergeRows(old, r.rows));
      } else {
        setData(r.data);
        setRows(r.rows);
      }
      setErrors(r.errors as BusinessError[] | undefined);
    } finally {
      setLoading(false);
    }
  };
  // New filter values come as an argument: the form state updates only at
  // the next render.
  filters.onChange = (values) => void refetch(null, false, values);
  const inner: Scope = { ...s, data: new Map(s.data).set(n.id, data), value: page ? undefined : data, place: n.place, form: filters, path: [] };
  const local: ScreenEnv = { ...env, states: { ...env.states, [String(n.id)]: { ...st, rows } } };
  const next = page ? (data as { next?: string | null } | undefined)?.next : null;
  const rr = makeRR(env, n, s);
  if (st?.pending && data === undefined) {
    // A required input without a value: the filters show, there is no data.
  }
  return (
    <EnvContext.Provider value={local}>
      <div {...rr.result(data)}>
        <Primitive
          env={local}
          n={n}
          s={inner}
          extra={{ data, loading, hasMore: !!next, loadMore: () => next && void refetch(next, true), errors }}
        />
      </div>
    </EnvContext.Provider>
  );
}

function mergeRows(a?: Record<string, boolean[]>, b?: Record<string, boolean[]>) {
  const out: Record<string, boolean[]> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = [...(out[k] ?? []), ...v];
  return out;
}

// ---------------------------------------------------------------------------
// Commands

interface FormState extends Form {
  onChange?: (values: Record<string, Value>) => void;
  errors: Record<string, string>;
  setErrors(e: Record<string, string>): void;
  reset(): void;
}

/** The input form of a node: the initial values come from the scopes (RFC §22.4, item 3). */
function useForm(n: Node, s: Scope, filters: boolean): FormState {
  const env = useContext(EnvContext);
  const initial = () => {
    const v: Record<string, Value> = {};
    const all = [...(n.bind?.args ?? []), ...(n.bind?.target ? [n.bind.target] : [])];
    for (const a of all) {
      if (!a.input) continue;
      const x = a.from === "input" ? a.value : env ? resolve(env, a, s) : undefined;
      if (x !== undefined) v[a.name] = x;
    }
    return v;
  };
  const [values, setValues] = useState<Record<string, Value>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ref = useRef<FormState>(null as unknown as FormState);
  const form: FormState = {
    place: n.place ?? "",
    values,
    errors,
    setErrors,
    set(path, v) {
      setValues((old) => {
        const next = setPath(old, path, v);
        if (filters) queueMicrotask(() => ref.current.onChange?.(next));
        return next;
      });
    },
    error: (path) => errors[path.join(".")],
    reset: () => {
      setValues(initial());
      setErrors({});
    },
    onChange: ref.current?.onChange,
  };
  ref.current = form;
  return form;
}

function message(env: ScreenEnv, e: BusinessError | Notification): string {
  const key = (e.type ? e.type + "." : "") + e.name;
  const t = env.view.messages?.[key]?.text ?? env.manifest.messages?.[key]?.text ?? e.name;
  return t.replace(/\{(\w+)\}/g, (_, p: string) => {
    const v = e.args?.[p];
    return v === undefined ? `{${p}}` : String(v);
  });
}

function CommandNode({ env, n, s }: { env: ScreenEnv; n: Node; s: Scope }) {
  const form = useForm(n, s, false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const submit = async (): Promise<boolean> => {
    const b = n.bind!;
    const value = (a: Arg) => (a.input ? (form.values[a.name] ?? (a.from === "input" ? a.value : resolve(env, a, s))) : resolve(env, a, s));
    const target = b.target ? value(b.target) : undefined;
    const args: Record<string, Value> = {};
    for (const a of b.args ?? []) {
      const v = value(a);
      if (v !== undefined) args[a.name] = v;
    }
    setBusy(true);
    try {
      const r = await env.api.command(env.manifest.app, env.view.screen, n.id, target, args);
      if (r.status !== "accepted") {
        const fieldErrs: Record<string, string> = {};
        for (const e of r.errors ?? []) {
          env.say({ kind: "error", name: e.name, text: message(env, e) });
          if (e.name === "invalidArgument" && typeof e.args?.path === "string") fieldErrs[e.args.path] = String(e.args.rule ?? "");
        }
        form.setErrors(fieldErrs);
        setErrors((r.errors ?? []).map((e) => message(env, e)));
        return false;
      }
      for (const nt of r.notifications ?? []) env.say({ kind: "notification", name: nt.name, text: message(env, nt) });
      setErrors([]);
      env.reload(r.position);
      const done = (n.children ?? []).find((c) => c.kind === "on" && c.event === "done");
      if (done) {
        const data: Record<string, Value> = { ...args };
        if (b.target) data[b.target.name] = target;
        fire(env, done, s, data);
      }
      form.reset();
      return true;
    } finally {
      setBusy(false);
    }
  };
  const inner: Scope = { ...s, form, path: [], place: n.place, value: form.values };
  return <Primitive env={env} n={n} s={inner} extra={{ submit, busy, errors }} />;
}

// ---------------------------------------------------------------------------
// A nested screen

function EmbeddedScreen({ env, n, s }: { env: ScreenEnv; n: Node; s: Scope }) {
  const params = useMemo(() => {
    const p: Record<string, Value> = {};
    for (const a of n.to?.args ?? []) p[a.name] = resolve(env, a, s);
    return p;
  }, [env, n, s]);
  // A navigation item: a link with a caption.
  return (
    <a href={env.href(n.to?.screen ?? "", params)} {...attrs("link:" + (n.to?.screen ?? ""))}
      onClick={(e) => { e.preventDefault(); env.navigate(n.to?.screen ?? "", params); }}>
      {n.label}
    </a>
  );
}

// ---------------------------------------------------------------------------
// The automatic UI: a primitive without an implementation (RFC §22.1)

export function Auto(props: Record<string, any>) {
  const n = props.node as Node | undefined;
  const label = useLabel();
  const rr = props.rr as RR | undefined;
  if (n?.kind === "field" && n.input) {
    return (
      <label {...(rr?.root ?? {})}>
        {props.caption} <input value={props.value === undefined || props.value === null ? "" : String(props.value)} onChange={(e) => props.onChange?.(e.target.value)} />
      </label>
    );
  }
  if (n?.kind === "field") return <span {...(rr?.root ?? {})}>{label(n.fieldType, props.value)}</span>;
  if (props.submit) {
    return (
      <div {...(rr?.root ?? {})}>
        {(props.children as Item[] | undefined)?.map((it) => <div key={it.key}>{it.node}</div>)}
        <button {...(rr?.submit ?? {})} disabled={props.busy} onClick={() => void props.submit()}>{props.caption}</button>
      </div>
    );
  }
  if (props.href) return <a href={props.href} {...(rr?.root ?? {})} onClick={(e) => { e.preventDefault(); props.go(); }}>{props.caption}</a>;
  return (
    <div {...(rr?.root ?? {})}>
      {props.data !== undefined && <pre>{JSON.stringify(props.data, null, 2)}</pre>}
      {Object.entries(props)
        .filter(([, v]) => Array.isArray(v) && v.length > 0 && (v[0] as Item).node !== undefined)
        .map(([k, v]) => <div key={k}>{(v as Item[]).map((it) => <div key={it.key}>{it.node}</div>)}</div>)}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ScreenView({ env }: { env: ScreenEnv }) {
  const s = rootScope();
  return (
    <EnvContext.Provider value={env}>
      <div {...attrs("screen:" + env.manifest.app + "." + env.view.screen)}>{renderNodes(env, env.view.nodes, s)}</div>
    </EnvContext.Provider>
  );
}

/** The app root: the menu and the other manifest nodes. */
export function renderRoot(env: ScreenEnv): ReactNode {
  return <EnvContext.Provider value={env}>{renderNodes(env, env.manifest.nodes, rootScope())}</EnvContext.Provider>;
}

function lowerCamel(s: string) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function upperFirst(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
