// The client of the app API (adapters/http/appapi; RFC §22).
import type { CommandResult, Login, Manifest, Notification, Screen, ScreenData, Value } from "./types";
import type { Session } from "./session";

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`HTTP ${status}: ${body}`);
  }
}

export class Api {
  constructor(public base: string, public session: Session | null, public lang?: string) {}

  private async get<T>(path: string, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (auth && this.session) headers["Authorization"] = this.session.authorization;
    if (this.lang) headers["Accept-Language"] = this.lang;
    const resp = await fetch(this.base + path, { headers });
    const text = await resp.text();
    if (!resp.ok) throw new ApiError(resp.status, text);
    return JSON.parse(text) as T;
  }

  login(): Promise<Login> {
    return this.get<Login>("/app/_login", false);
  }

  manifest(app: string): Promise<Manifest> {
    return this.get<Manifest>(`/app/${enc(app)}`);
  }

  screen(app: string, name: string, hash: string): Promise<Screen> {
    return this.get<Screen>(`/app/${enc(app)}/screens/${enc(name)}.${hash}.json`);
  }

  data(app: string, screen: string, params: Record<string, Value>, after?: string): Promise<ScreenData> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    if (after) q.set("after", after);
    return this.get<ScreenData>(`/app/${enc(app)}/${enc(screen)}?${q}`);
  }

  /** A place's query or a primitive's query parameter (param). */
  query(app: string, screen: string, node: number, args: Record<string, Value>, opts: { param?: string; after?: string } = {}) {
    const q = new URLSearchParams({ args: JSON.stringify(args) });
    if (opts.param) q.set("param", opts.param);
    if (opts.after) q.set("after", opts.after);
    return this.get<{ data?: Value; errors?: unknown[]; rows?: Record<string, boolean[]> }>(
      `/app/${enc(app)}/${enc(screen)}/${node}?${q}`,
    );
  }

  async command(app: string, screen: string, node: number, target: Value, args: Record<string, Value>): Promise<CommandResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.session) headers["Authorization"] = this.session.authorization;
    const resp = await fetch(`${this.base}/app/${enc(app)}/${enc(screen)}/${node}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ target, args }),
    });
    const text = await resp.text();
    try {
      return JSON.parse(text) as CommandResult;
    } catch {
      throw new ApiError(resp.status, text);
    }
  }

  /** An actor's notifications over WebSocket: the credentials are in the subprotocol. */
  subscribe(on: (n: Notification) => void): () => void {
    if (!this.session?.me) return () => {};
    const url = new URL(this.base + "/api/ws", location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ["reasonr", wsCredentials(this.session.authorization)]);
    } catch {
      return () => {};
    }
    ws.onmessage = (e) => {
      try {
        on(JSON.parse(String(e.data)) as Notification);
      } catch {
        /* the frame is not JSON — skip it */
      }
    };
    return () => ws.close();
  }
}

function enc(s: string) {
  return encodeURIComponent(s);
}

/** The subprotocol with the credentials. */
export function wsCredentials(authorization: string): string {
  if (authorization.startsWith("Bearer ")) return "bearer." + authorization.slice(7);
  if (authorization.startsWith("Test ")) return "test." + base64url(authorization.slice(5));
  return "reasonr";
}

function base64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
