// The app shell: login, the manifest, the routes /ui/{App}/{Screen}?parameters,
// a screen with data, messages and notifications (RFC §22).
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Api, ApiError } from "./api";
import { renderRoot, ScreenView, type Msg, type Registry, type ScreenEnv } from "./render";
import { loadSession, oidcCallback, oidcLogin, saveSession, testSession, type Session } from "./session";
import type { Login, Manifest, Screen, ScreenData, Value } from "./types";

export interface AppProps {
  /** Primitive implementations: the module's own over the catalog. */
  primitives: Registry;
  /** The engine address; the same origin by default. */
  base?: string;
  /** The shell: the header, the menu, the content; a simple one by default. */
  shell?: ComponentType<ShellProps>;
}

export interface ShellProps {
  title: string;
  user: string;
  menu: ReactNode;
  messages: ReactNode;
  content: ReactNode;
  onLogout(): void;
}

interface Route {
  app: string;
  screen: string;
  params: Record<string, Value>;
  /** The unit of work position for the first data read (_after in the address). */
  after?: string;
}

function parseRoute(): Route {
  const parts = location.pathname.replace(/^\/ui\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const params: Record<string, Value> = {};
  let after: string | undefined;
  new URLSearchParams(location.search).forEach((v, k) => {
    if (k === "code" || k === "state") return;
    if (k === "_after") {
      after = v;
      return;
    }
    try {
      params[k] = JSON.parse(v);
    } catch {
      params[k] = v;
    }
  });
  return { app: parts[0] ?? "", screen: parts[1] ?? "", params, after };
}

function routeURL(r: Route): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(r.params)) {
    if (v !== undefined && v !== null) q.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const qs = q.toString();
  return `/ui/${encodeURIComponent(r.app)}/${encodeURIComponent(r.screen)}${qs ? "?" + qs : ""}`;
}

export function App({ primitives, base = "", shell }: AppProps) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [login, setLogin] = useState<Login | null>(null);
  const [route, setRoute] = useState<Route>(parseRoute);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [problem, setProblem] = useState<string>("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const api = useMemo(() => new Api(base, session), [base, session]);

  useEffect(() => {
    new Api(base, null).login().then(setLogin, (e) => setProblem(String(e)));
  }, [base]);
  useEffect(() => {
    if (login?.oidc && !session) {
      oidcCallback(login.oidc).then((s) => s && (saveSession(s), setSession(s)), (e) => setProblem(String(e)));
    }
  }, [login, session]);
  useEffect(() => {
    const pop = () => setRoute(parseRoute());
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!session || !route.app) return;
    setManifest(null);
    api.manifest(route.app).then(setManifest, (e) =>
      setProblem(e instanceof ApiError && e.status === 403 ? `You have no access to the app ${route.app}` : String(e)),
    );
  }, [api, session, route.app]);
  const say = useCallback((m: Msg) => setMsgs((old) => [...old.slice(-4), m]), []);
  useEffect(() => api.subscribe((n) => say({ kind: "notification", name: n.name, text: n.name })), [api, say]);

  const navigate = useCallback((screen: string, params: Record<string, Value>) => {
    const r = { app: route.app, screen, params };
    history.pushState(null, "", routeURL(r));
    setRoute(r);
  }, [route.app]);
  const logout = () => {
    saveSession(null);
    setSession(null);
    setManifest(null);
  };

  if (!route.app) return <p>Set the app in the address: /ui/&lt;App&gt;</p>;
  if (problem) return <p data-rr="problem">{problem}</p>;
  if (!session) {
    if (!login) return <p>…</p>;
    if (login.test) return <TestLogin onLogin={(s) => (saveSession(s), setSession(s))} />;
    if (login.oidc) return <button onClick={() => void oidcLogin(login.oidc!)}>Sign in</button>;
    return <p>Sign-in is not configured: ingress.ui.auth.oidc</p>;
  }
  if (!manifest) return <p>…</p>;
  const screen = route.screen || Object.keys(manifest.screens)[0] || "";
  const messages = (
    <div data-rr="messages">
      {msgs.map((m, i) => (
        <div key={i} data-rr={`${m.kind}:${m.name}`} className={`rr-${m.kind}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
  const env0: ScreenEnv = {
    api, manifest, params: {}, states: manifest.states ?? {}, me: session.me, registry: primitives,
    view: { version: 1, app: manifest.app, screen: "", lang: manifest.lang, platform: "web", title: manifest.title, nodes: [], types: manifest.types, messages: manifest.messages },
    navigate, back: () => history.back(), reload: () => {}, say,
    href: (s, p) => routeURL({ app: route.app, screen: s, params: p }),
  };
  const Shell = shell ?? DefaultShell;
  return (
    <Shell
      title={manifest.title}
      user={session.label}
      menu={renderRoot(env0)}
      messages={messages}
      onLogout={logout}
      content={screen && <ScreenPage key={screen + JSON.stringify(route.params)} env0={env0} name={screen} params={route.params} after={route.after} />}
    />
  );
}

/** A screen: the description by hash from the manifest and the data in one request. */
function ScreenPage({ env0, name, params, after: first }: { env0: ScreenEnv; name: string; params: Record<string, Value>; after?: string }) {
  const [view, setView] = useState<Screen | null>(null);
  const [data, setData] = useState<ScreenData | null>(null);
  const [problem, setProblem] = useState("");
  const after = useRef<string | undefined>(first);
  const { api, manifest } = env0;
  const load = useCallback(() => {
    api.data(manifest.app, name, params, after.current).then(setData, (e) => setProblem(String(e)));
  }, [api, manifest.app, name, params]);
  useEffect(() => {
    const hash = manifest.screens[name];
    if (!hash) {
      setProblem(`The app has no screen ${name}`);
      return;
    }
    api.screen(manifest.app, name, hash).then(setView, (e) => setProblem(String(e)));
    load();
  }, [api, manifest, name, load]);
  if (problem) return <p data-rr="problem">{problem}</p>;
  if (!view || !data) return <p>…</p>;
  const env: ScreenEnv = {
    ...env0, view, params, states: data.nodes,
    reload: (pos) => {
      after.current = pos;
      load();
    },
  };
  return (
    <section>
      <h1>{view.title}</h1>
      <ScreenView env={env} />
    </section>
  );
}

function DefaultShell({ title, user, menu, messages, content, onLogout }: ShellProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh", fontFamily: "system-ui" }}>
      <nav style={{ borderRight: "1px solid #ddd", padding: 16 }}>
        <strong>{title}</strong>
        <div>{menu}</div>
      </nav>
      <main style={{ padding: 16 }}>
        <header style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <span data-rr="user">{user}</span>
          <button onClick={onLogout}>Sign out</button>
        </header>
        {messages}
        {content}
      </main>
    </div>
  );
}

/** The engine's test mode login (§5.5): an actor with an identifier, or roles. */
function TestLogin({ onLogin }: { onLogin(s: Session): void }) {
  const [actor, setActor] = useState("");
  const [id, setID] = useState<string>(() => crypto.randomUUID());
  const [roles, setRoles] = useState("");
  const [tenant, setTenant] = useState("");
  return (
    <form
      data-rr="login"
      style={{ display: "grid", gap: 8, maxWidth: 360, margin: "10vh auto", fontFamily: "system-ui" }}
      onSubmit={(e) => {
        e.preventDefault();
        onLogin(testSession({ actor: actor || undefined, id, roles: roles.split(/[\s,]+/).filter(Boolean), tenant: tenant || undefined }));
      }}
    >
      <strong>Sign in as (test mode)</strong>
      <input data-rr="login:actor" placeholder="Actor: Customer" value={actor} onChange={(e) => setActor(e.target.value)} />
      <input data-rr="login:id" placeholder="Identifier" value={id} onChange={(e) => setID(e.target.value)} />
      <input data-rr="login:roles" placeholder="Roles: admin, support" value={roles} onChange={(e) => setRoles(e.target.value)} />
      <input data-rr="login:tenant" placeholder="Tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} />
      <button data-rr="login:submit" type="submit">Sign in</button>
    </form>
  );
}
