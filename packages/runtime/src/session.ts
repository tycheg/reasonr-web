// Sign-in (RFC §22): in the engine's test mode — "sign in as" an actor or a
// role, in production — OIDC, the authorization code and PKCE.
import type { Login } from "./types";

export interface Session {
  /** The value of the Authorization header. */
  authorization: string;
  /** The actor identifier — the value of me; roles have none. */
  me?: string;
  /** Who signed in — for display. */
  label: string;
}

const key = "reasonr.session";

export function loadSession(): Session | null {
  try {
    const s = sessionStorage.getItem(key);
    return s ? (JSON.parse(s) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(key, JSON.stringify(s));
    else sessionStorage.removeItem(key);
  } catch {
    /* storage is unavailable — the session lives until a reload */
  }
}

/** The test mode sign-in: an actor with an identifier, roles, the data tenant. */
export function testSession(opts: { actor?: string; id?: string; roles?: string[]; tenant?: string }): Session {
  const parts: string[] = [];
  if (opts.actor && opts.id) parts.push(`actor=${opts.actor}:${opts.id}`);
  for (const r of opts.roles ?? []) parts.push(`role=${r}`);
  let auth = "Test " + parts.join(", ");
  if (opts.tenant) auth += ` tenant=${opts.tenant}`;
  const label = [opts.actor && opts.id ? `${opts.actor} ${opts.id.slice(0, 8)}` : "", ...(opts.roles ?? [])]
    .filter(Boolean)
    .join(", ");
  return { authorization: auth, me: opts.actor ? opts.id : undefined, label };
}

// ---------------------------------------------------------------------------
// OIDC: the authorization code and PKCE.

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
}

async function discover(issuer: string): Promise<Discovery> {
  const resp = await fetch(issuer.replace(/\/$/, "") + "/.well-known/openid-configuration");
  if (!resp.ok) throw new Error(`OIDC: discovery ${resp.status}`);
  return (await resp.json()) as Discovery;
}

function randomString(n: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b % 66]).join("");
}

async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let bin = "";
  new Uint8Array(digest).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Go to the IdP sign-in page. */
export async function oidcLogin(cfg: NonNullable<Login["oidc"]>) {
  const d = await discover(cfg.issuer);
  const verifier = randomString(64);
  const state = randomString(24);
  sessionStorage.setItem("reasonr.oidc", JSON.stringify({ verifier, state, back: location.pathname + location.search }));
  const q = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: redirectURI(),
    scope: (cfg.scopes ?? ["openid"]).join(" "),
    code_challenge: await challenge(verifier),
    code_challenge_method: "S256",
    state,
  });
  location.assign(`${d.authorization_endpoint}?${q}`);
}

function redirectURI() {
  return location.origin + "/ui/";
}

/** The return from the IdP: exchanging the code for a token. null — not a return from the IdP. */
export async function oidcCallback(cfg: NonNullable<Login["oidc"]>): Promise<Session | null> {
  const q = new URLSearchParams(location.search);
  const code = q.get("code");
  const saved = sessionStorage.getItem("reasonr.oidc");
  if (!code || !saved) return null;
  const { verifier, state, back } = JSON.parse(saved) as { verifier: string; state: string; back: string };
  sessionStorage.removeItem("reasonr.oidc");
  if (q.get("state") !== state) throw new Error("OIDC: state does not match");
  const d = await discover(cfg.issuer);
  const resp = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectURI(),
      client_id: cfg.clientId,
      code_verifier: verifier,
    }),
  });
  if (!resp.ok) throw new Error(`OIDC: token ${resp.status}`);
  const tok = (await resp.json()) as { access_token: string; id_token?: string };
  const claims = jwtClaims(tok.access_token);
  history.replaceState(null, "", back || "/ui/");
  return { authorization: "Bearer " + tok.access_token, me: claims.sub as string | undefined, label: String(claims.name ?? claims.sub ?? "") };
}

function jwtClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part)) as Record<string, unknown>;
  } catch {
    return {};
  }
}
