// The reasonr-ui dev primitives page: leaf display and input primitives on
// values of the model types; enumerations show every value with captions.
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { primitives as std } from "@tycheg/reasonr-std-ui";
import { Primitives, leaf, samples, type UIProgram } from "../app/Primitives";

const program: UIProgram = {
  primitives: [
    { name: "Tag", std: true, vars: [{ name: "E", constraint: "enum" }], binds: "field", bindType: "E" },
    { name: "Text", std: true, vars: [{ name: "T" }], binds: "field", bindType: "T" },
    { name: "TextInput", std: true, binds: "input", bindType: "string" },
    { name: "Select", std: true, vars: [{ name: "E", constraint: "enum" }], binds: "input", bindType: "E" },
    { name: "AccountNumber", vars: [{ name: "K", constraint: "id" }], binds: "input", bindType: "K" },
    { name: "Table", std: true, binds: "query", parts: [{}] },
    { name: "EntityPicker", std: true, binds: "input", bindType: "K | set<K>", params: [{ kind: "search" }] },
  ],
  types: [
    { name: "OrderStatus", values: ["searching", "paid"] },
    { name: "Row", fields: [{ name: "accountId", type: "Account.Id" }] },
  ],
  texts: { en: { "OrderStatus.searching": "Looking for a car", "OrderStatus.paid": "Paid" } },
};

describe("primitives page", () => {
  it("leaf primitives and their samples", () => {
    expect(program.primitives.filter(leaf).map((p) => p.name)).toEqual(["Tag", "Text", "TextInput", "Select", "AccountNumber"]);
    expect(samples(program.primitives[0], program)).toEqual([{ type: "OrderStatus", values: ["searching", "paid"] }]);
    expect(samples(program.primitives[4], program)).toEqual([{ type: "Account.Id", values: ["00000000-0000-0000-0000-0000000000a1"] }]);
  });

  it("an enumeration shows every value with captions; an input is controlled", () => {
    const own = { AccountNumber: ({ onChange, rr }: any) => <input {...rr.root} onChange={(e) => onChange(e.target.value)} /> };
    const { container } = render(<Primitives program={program} registry={{ ...std, ...own }} own={own} />);
    const tag = container.querySelector('[data-rr="sample:Tag:OrderStatus"]')!;
    expect(tag.textContent).toContain("Looking for a car");
    expect(tag.textContent).toContain("Paid");
    expect(container.querySelector('[data-rr="primitive:AccountNumber"]')!.textContent).toContain("own implementation");
    expect(container.querySelector('[data-rr="primitive:Table"]')).toBeNull();
    fireEvent.change(container.querySelector('[data-rr="input:AccountNumber:Account.Id"]')!, { target: { value: "a2" } });
    expect(container.querySelector('[data-rr="value:AccountNumber:Account.Id"]')!.textContent).toBe(' "a2"');
  });

  it("without a model — a hint", () => {
    const { container } = render(<Primitives program={null} registry={std} own={{}} />);
    expect(container.textContent).toContain("--model");
  });
});
