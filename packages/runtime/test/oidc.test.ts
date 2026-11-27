// OIDC sign-in (RFC §22): the authorization code and PKCE — discovery,
// going to the IdP with code_challenge S256, exchanging the code for a
// token with code_verifier, me is the token's sub.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oidcCallback, oidcLogin } from "../src/session";

const cfg = { issuer: "https://idp.test/", clientId: "taxi-web", scopes: ["openid", "profile"] };
const discovery = { authorization_endpoint: "https://idp.test/authorize", token_endpoint: "https://idp.test/token" };

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];

function b64url(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function s256(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return b64url(String.fromCharCode(...new Uint8Array(d)));
}

const token = `${b64url('{"alg":"none"}')}.${b64url('{"sub":"u1","name":"Anna"}')}.sig`;

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? String(init.body) : undefined });
    if (url === "https://idp.test/.well-known/openid-configuration") return Promise.resolve(new Response(JSON.stringify(discovery)));
    if (url === discovery.token_endpoint) return Promise.resolve(new Response(JSON.stringify({ access_token: token })));
    return Promise.resolve(new Response("", { status: 404 }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
});

describe("OIDC sign-in", () => {
  it("going to the IdP: the authorization code, PKCE S256, state", async () => {
    history.replaceState(null, "", "/ui/Admin/AdminOrders");
    let target = "";
    vi.stubGlobal("location", { ...window.location, origin: location.origin, pathname: "/ui/Admin/AdminOrders", search: "", assign: (u: string) => (target = u) });
    await oidcLogin(cfg);
    const u = new URL(target);
    expect(u.origin + u.pathname).toBe(discovery.authorization_endpoint);
    const saved = JSON.parse(sessionStorage.getItem("reasonr.oidc")!) as { verifier: string; state: string; back: string };
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: "code",
      client_id: "taxi-web",
      redirect_uri: location.origin + "/ui/",
      scope: "openid profile",
      code_challenge: await s256(saved.verifier),
      code_challenge_method: "S256",
      state: saved.state,
    });
    expect(saved.verifier.length).toBe(64);
    expect(saved.back).toBe("/ui/Admin/AdminOrders");
  });

  it("the return from the IdP: exchanging the code with code_verifier, me is the token's sub", async () => {
    sessionStorage.setItem("reasonr.oidc", JSON.stringify({ verifier: "v".repeat(64), state: "st1", back: "/ui/Admin/AdminOrders" }));
    history.replaceState(null, "", "/ui/?code=c1&state=st1");
    const s = await oidcCallback(cfg);
    expect(s).toEqual({ authorization: "Bearer " + token, me: "u1", label: "Anna" });
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe(discovery.token_endpoint);
    expect(Object.fromEntries(new URLSearchParams(post.body))).toEqual({
      grant_type: "authorization_code",
      code: "c1",
      redirect_uri: location.origin + "/ui/",
      client_id: "taxi-web",
      code_verifier: "v".repeat(64),
    });
    expect(location.pathname).toBe("/ui/Admin/AdminOrders");
    expect(sessionStorage.getItem("reasonr.oidc")).toBeNull();
  });

  it("a foreign state is an error, no code is not a return", async () => {
    sessionStorage.setItem("reasonr.oidc", JSON.stringify({ verifier: "v", state: "st1", back: "/ui/" }));
    history.replaceState(null, "", "/ui/?code=c1&state=evil");
    await expect(oidcCallback(cfg)).rejects.toThrow("state");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    history.replaceState(null, "", "/ui/");
    expect(await oidcCallback(cfg)).toBeNull();
  });
});
