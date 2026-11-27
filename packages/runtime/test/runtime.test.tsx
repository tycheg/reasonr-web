// The web runtime conformance suite (RFC §22): the runtime runs the taxi
// screen descriptions (fixtures/: copies of the compiler/internal/uiview golden files) —
// labels, data, visibility, forms, sending a command, overriding an
// implementation. The same set of descriptions is the contract for a mobile runtime.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type Item } from "@tycheg/reasonr-runtime";
import { primitives, Shell } from "@tycheg/reasonr-std-ui";
import manifest from "./fixtures/admin.manifest.json";
import orderView from "./fixtures/admin.order.json";
import ordersView from "./fixtures/admin.orders.json";

const o1 = "00000000-0000-0000-0000-0000000000a1";
const details = { orderId: o1, status: "searching", orderRoute: { from: { lat: 55.75, lon: 37.62 }, to: { lat: 55.8, lon: 37.6 }, distanceKm: 10 },
  requestedClass: "economy", price: { amount: "400", currency: "rub" }, placedAt: "2026-01-01T00:00:00Z", driverName: null };

type Call = { method: string; url: string; body?: unknown; auth?: string };
let calls: Call[] = [];
let data: Record<string, unknown> = {};

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  calls = [];
  data = {
    "Ordering.AdminOrder": { nodes: { "1": { data: details }, "28": { hidden: true } } },
    "Ordering.AdminOrders": { nodes: { "3": { data: { items: [{ orderId: o1, status: "searching", price: details.price, placedAt: details.placedAt }], next: null }, rows: { "11": [true] } } } },
  };
  sessionStorage.setItem("reasonr.session", JSON.stringify({ authorization: "Test actor=Staff:s1, role=admin", me: "s1", label: "Staff" }));
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://test");
    const call: Call = { method: init?.method ?? "GET", url: url.pathname + url.search, auth: new Headers(init?.headers).get("Authorization") ?? undefined };
    if (init?.body) call.body = JSON.parse(String(init.body));
    calls.push(call);
    const p = url.pathname;
    if (p === "/app/_login") return respond({ test: true });
    if (p === "/app/Admin") return respond(manifest);
    if (p.startsWith("/app/Admin/screens/Ordering.AdminOrder.")) return respond(orderView);
    if (p.startsWith("/app/Admin/screens/Ordering.AdminOrders.")) return respond(ordersView);
    if (call.method === "POST") return respond({ status: "accepted", position: "7", notifications: [] });
    const name = p.split("/")[3];
    if (data[name]) return respond(data[name]);
    return respond({ error: "none" }, 404);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function open(path: string, registry = primitives) {
  history.pushState(null, "", path);
  return render(<App primitives={registry} shell={Shell} />);
}

const rr = (label: string) => document.querySelector(`[data-rr="${label}"]`);

describe("web runtime", () => {
  it("opens a screen with data, labels and visibility", async () => {
    open(`/ui/Admin/Ordering.AdminOrder?orderId=${o1}`);
    await waitFor(() => expect(rr("screen:Admin.Ordering.AdminOrder")).not.toBeNull());
    const result = rr("result:Admin.AdminOrder:Order.Details");
    expect(JSON.parse(result!.getAttribute("data-rr-value")!).status).toBe("searching");
    expect(rr("place:Admin.AdminOrder:Order.Edit")).not.toBeNull();
    // A node the server hid (Confirm, if) is not drawn.
    expect(rr("place:Admin.AdminOrder:Order.Cancel")).toBeNull();
    expect(screen.getByText("Looking for a driver")).toBeTruthy();
    const dataCall = calls.find((c) => c.url.startsWith("/app/Admin/Ordering.AdminOrder?"));
    expect(dataCall?.url).toContain(`orderId=${o1}`);
    expect(dataCall?.auth).toBe("Test actor=Staff:s1, role=admin");
  });

  it("sends a place command: the target and inputs with initial values from the data", async () => {
    open(`/ui/Admin/Ordering.AdminOrder?orderId=${o1}`);
    await waitFor(() => expect(rr("open:Admin.AdminOrder:Order.Edit")).not.toBeNull());
    fireEvent.click(rr("open:Admin.AdminOrder:Order.Edit")!);
    await waitFor(() => expect(rr("submit:Admin.AdminOrder:Order.Edit")).not.toBeNull());
    const w = window as unknown as { __reasonr: { inputs: Record<string, (v: unknown) => void> } };
    await waitFor(() => expect(w.__reasonr.inputs["input:Admin.AdminOrder:Order.Edit.requestedClass"]).toBeTypeOf("function"));
    act(() => w.__reasonr.inputs["input:Admin.AdminOrder:Order.Edit.requestedClass"]("comfort"));
    fireEvent.click(rr("submit:Admin.AdminOrder:Order.Edit")!);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/app/Admin/Ordering.AdminOrder/18");
    expect(post.body).toEqual({ target: o1, args: { orderRoute: details.orderRoute, requestedClass: "comfort" } });
    // After the command the screen data is reread with after.
    await waitFor(() => expect(calls.some((c) => c.url.includes("after=7"))).toBe(true));
  });

  it("table rows: item labels and navigation by open", async () => {
    open("/ui/Admin/Ordering.AdminOrders");
    await waitFor(() => expect(rr(`item:Admin.AdminOrders:Order.List:${o1}`)).not.toBeNull());
    expect(rr("open:Admin.AdminOrders:Order.Cancel")).not.toBeNull();
    fireEvent.click(rr(`item:Admin.AdminOrders:Order.List:${o1}`)!);
    await waitFor(() => expect(location.pathname).toBe("/ui/Admin/Ordering.AdminOrder"));
    expect(location.search).toContain(o1);
  });

  it("a query filter: the node is queried again with the new value", async () => {
    open("/ui/Admin/Ordering.AdminOrders");
    const w = window as unknown as { __reasonr: { inputs: Record<string, (v: unknown) => void> } };
    const label = "input:Admin.AdminOrders:Order.List.wanted";
    await waitFor(() => expect(w.__reasonr.inputs[label]).toBeTypeOf("function"));
    // Without act: like the runner in a browser, rendering comes after microtasks.
    w.__reasonr.inputs[label]("assigned");
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("/app/Admin/Ordering.AdminOrders/3?"))).toBe(true));
    const q = calls.find((c) => c.url.startsWith("/app/Admin/Ordering.AdminOrders/3?"))!;
    expect(JSON.parse(new URLSearchParams(q.url.split("?")[1]).get("args")!)).toEqual({ wanted: "assigned", pageReq: { size: 20, cursor: null } });
  });

  it("an own primitive implementation overrides the catalog one", async () => {
    function MyTable(p: { data: { items: unknown[] }; columns: { key: string }[]; rr: { root: Record<string, string> } }) {
      return <div {...p.rr.root} data-my-table={p.data.items.length}>{p.columns.length}</div>;
    }
    open("/ui/Admin/Ordering.AdminOrders", { ...primitives, Table: MyTable as never });
    await waitFor(() => expect(document.querySelector("[data-my-table]")).not.toBeNull());
    expect(document.querySelector("[data-my-table]")!.getAttribute("data-my-table")).toBe("1");
  });

  it("a primitive without an implementation draws the automatic UI", async () => {
    const { Card: _card, ...rest } = primitives;
    void _card;
    open(`/ui/Admin/Ordering.AdminOrder?orderId=${o1}`, rest);
    await waitFor(() => expect(rr("place:Admin.AdminOrder:Order.Details")).not.toBeNull());
    const items: Item[] = [];
    void items;
  });
});
