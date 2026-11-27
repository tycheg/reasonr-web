// The reasonr-ui dev primitives page (/ui/_primitives; RFC §33): leaf display
// primitives (binds field) and input primitives (binds input) — the
// platform's own implementations and the catalog's — on values of the model
// types. Display shows an empty and a filled field, all values for
// enumerations; input is controlled, with its value next to it. Composite
// primitives (with children, parts and search) are seen on the app screens.
import { useState, type ComponentType } from "react";
import { Auto, ScreenContext, type Registry, type RR, type ScreenEnv, type TypeView } from "@tycheg/reasonr-runtime";

/** A primitive declaration in the interface program (reasonr build --dump-ui). */
export interface UIPrimitive {
  name: string;
  std?: boolean;
  vars?: { name: string; constraint?: string }[];
  binds?: string;
  bindType?: string;
  children?: unknown;
  parts?: unknown[];
  params?: { kind: string }[];
}

/** A model type in the interface program: an enumeration or a value object. */
export interface UIType {
  name: string;
  values?: string[];
  fields?: { name: string; type: string }[];
}

/** The interface program — what the page needs. */
export interface UIProgram {
  primitives: UIPrimitive[];
  types?: UIType[];
  texts?: Record<string, Record<string, string>>;
}

/** An example: the value type and the values to show (one, the initial, for an input). */
export interface Sample {
  type: string;
  values: unknown[];
}

/** A primitive on the page: without children, parts and search — display or input. */
export function leaf(p: UIPrimitive): boolean {
  return (p.binds === "field" || p.binds === "input") && !p.children && !p.parts?.length && !p.params?.some((x) => x.kind === "search");
}

const scalar: Record<string, unknown[]> = {
  string: ["Sample text"],
  int: [42],
  bigint: ["12345678901234567890"],
  decimal: ["1234.50"],
  float: [3.14],
  bool: [true, false],
  date: ["2026-01-01"],
  time: ["12:30:00"],
  timestamp: ["2026-01-01T12:30:00Z"],
  duration: ["15m"],
  uuid: ["00000000-0000-0000-0000-0000000000a1"],
};

/** Sample values of the primitive p by the model types. */
export function samples(p: UIPrimitive, prog: UIProgram): Sample[] {
  const types = prog.types ?? [];
  const enums = types.filter((t) => t.values?.length);
  const ids = [...new Set(types.flatMap((t) => (t.fields ?? []).map((f) => f.type.replace(/\?$/, "")).filter((t) => t.endsWith(".Id"))))].sort();
  const vars = new Map((p.vars ?? []).map((v) => [v.name, v.constraint ?? ""]));
  const of = (t: string): Sample[] => {
    t = t.trim().replace(/\?$/, "");
    const coll = /^(list|set)<(.+)>$/.exec(t);
    if (coll) return of(coll[2]).map((s) => ({ type: `${coll[1]}<${s.type}>`, values: [s.values.slice(0, 2)] }));
    if (vars.has(t)) {
      switch (vars.get(t)) {
        case "enum":
          return enums.map((e) => ({ type: e.name, values: e.values! }));
        case "id":
          return (ids.length ? ids : ["Id"]).map((id) => ({ type: id, values: scalar.uuid }));
        case "value":
          return []; // composite primitives show value objects
      }
      return [{ type: "string", values: scalar.string }, { type: "int", values: scalar.int }];
    }
    const e = enums.find((x) => x.name === t);
    if (e) return [{ type: e.name, values: e.values! }];
    return scalar[t] ? [{ type: t, values: scalar[t] }] : [];
  };
  return (p.bindType ?? "").split("|").flatMap(of);
}

/** Types for captions: enumeration values and captions from the texts. */
function typeViews(prog: UIProgram): Record<string, TypeView> {
  const texts = Object.values(prog.texts ?? {})[0] ?? {};
  const out: Record<string, TypeView> = {};
  for (const t of prog.types ?? []) {
    if (!t.values) continue;
    const labels: Record<string, string> = {};
    for (const v of t.values) if (texts[`${t.name}.${v}`]) labels[v] = texts[`${t.name}.${v}`];
    out[t.name] = { values: t.values, labels };
  }
  return out;
}

const rr = (label: string): RR => ({
  root: { "data-rr": label }, submit: {}, open: {}, more: {},
  input: () => ({}), result: () => ({}), item: () => ({}),
});

function Input({ Impl, p, s }: { Impl: ComponentType<any>; p: UIPrimitive; s: Sample }) {
  const [value, setValue] = useState<unknown>(undefined);
  return (
    <div data-rr={`sample:${p.name}:${s.type}`}>
      <Impl value={value} onChange={setValue} type={s.type} caption={s.type} rr={rr(`input:${p.name}:${s.type}`)}
        node={{ id: 0, kind: "field", key: p.name, primitive: p.name, fieldType: s.type, input: true }} />
      <code data-rr={`value:${p.name}:${s.type}`}> {value === undefined ? "—" : JSON.stringify(value)}</code>
    </div>
  );
}

function Show({ Impl, p, s }: { Impl: ComponentType<any>; p: UIPrimitive; s: Sample }) {
  return (
    <div data-rr={`sample:${p.name}:${s.type}`}>
      {[null, ...s.values].map((v, i) => (
        <span key={i} style={{ marginRight: 12 }}>
          <Impl value={v} type={s.type} caption={s.type} rr={rr(`show:${p.name}:${s.type}:${i}`)}
            node={{ id: 0, kind: "field", key: p.name, primitive: p.name, fieldType: s.type }} />
          {i === 0 && <small> (empty)</small>}
        </span>
      ))}
    </div>
  );
}

/** The primitives page: registry is the build's registry, own are the platform's own implementations. */
export function Primitives({ program, registry, own }: { program: UIProgram | null; registry: Registry; own: Registry }) {
  if (!program) {
    return <p>No interface program: run reasonr-ui dev --model &lt;model module&gt;.</p>;
  }
  const env = { view: { types: typeViews(program) }, registry, manifest: {}, params: {}, states: {} } as unknown as ScreenEnv;
  const list = program.primitives.filter(leaf).sort((a, b) => Number(!own[a.name]) - Number(!own[b.name]) || a.name.localeCompare(b.name));
  return (
    <ScreenContext.Provider value={env}>
      <main style={{ fontFamily: "sans-serif", padding: 24 }}>
        <h1>Primitives</h1>
        {list.map((p) => {
          const Impl = registry[p.name] ?? Auto;
          const origin = own[p.name] ? "own implementation" : registry[p.name] ? "standard catalog" : "no implementation — the automatic UI";
          const ss = samples(p, program);
          return (
            <section key={p.name} data-rr={`primitive:${p.name}`} style={{ marginBottom: 24 }}>
              <h2>{p.name} <small>{p.binds === "input" ? "input" : "display"} · {p.bindType} · {origin}</small></h2>
              {ss.length === 0 && <p>The model has no values of this type.</p>}
              {ss.map((s) => (
                <div key={s.type}>
                  <h3>{s.type}</h3>
                  {p.binds === "input" ? <Input Impl={Impl} p={p} s={s} /> : <Show Impl={Impl} p={p} s={s} />}
                </div>
              ))}
            </section>
          );
        })}
      </main>
    </ScreenContext.Provider>
  );
}
