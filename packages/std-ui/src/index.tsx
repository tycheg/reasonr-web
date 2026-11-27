// @tycheg/reasonr-std-ui is the standard primitive catalog (RFC §22.8) on Ant
// Design. The runtime does not depend on the library: another library is
// plugged in by replacing implementations one by one.
import {
  Button as AButton, Card as ACard, Checkbox as ACheckbox, Descriptions, Flex, Form as AForm, Input, InputNumber,
  Layout, List as AList, Menu as AMenu, Modal, Select as ASelect, Space, Table as ATable, Tag as ATag, Typography,
} from "antd";
import { useState, type ReactNode } from "react";
import { useLabel, useScreen, type Item, type Page, type Registry, type RowItem, type RR, type ShellProps } from "@tycheg/reasonr-runtime";

type Any = Record<string, any>;

const items = (list?: Item[]) => (list ?? []).map((it) => <span key={it.key}>{it.node}</span>);

// ---------------------------------------------------------------------------
// Navigation and layout

function Menu({ children }: { children?: Item[] }) {
  return <AMenu mode="inline" selectable={false} items={(children ?? []).map((it) => ({ key: it.key, label: it.node }))} />;
}

function Tabs({ children }: { children?: Item[] }) {
  return <Space>{items(children)}</Space>;
}

function Link({ href, go, caption, rr }: { href: string; go(): void; caption?: string; rr: RR }) {
  return (
    <AButton type="link" href={href} {...rr.root} onClick={(e) => { e.preventDefault(); go(); }}>
      {caption}
    </AButton>
  );
}

function Toolbar({ children }: { children?: Item[] }) {
  return <Space wrap style={{ marginBottom: 12 }}>{items(children)}</Space>;
}

function Row({ children }: { children?: Item[] }) {
  return <Flex gap={12} wrap>{items(children)}</Flex>;
}

function Stack({ children }: { children?: Item[] }) {
  return <Flex vertical gap={12}>{items(children)}</Flex>;
}

function Section({ caption, children }: { caption?: string; children?: Item[] }) {
  return <ACard size="small" title={caption}>{items(children)}</ACard>;
}

// ---------------------------------------------------------------------------
// Data

function Filters({ filters }: { filters?: Item[] }) {
  if (!filters?.length) return null;
  return (
    <Space wrap style={{ marginBottom: 12 }}>
      {filters.map((f) => (
        <Space key={f.key}>
          <Typography.Text type="secondary">{f.label}</Typography.Text>
          {f.node}
        </Space>
      ))}
    </Space>
  );
}

function rowsOf(data: unknown): Any[] {
  const rows = (Array.isArray(data) ? data : ((data as Page<Any> | undefined)?.items ?? [])) as Any[];
  return rows.map((r, i) => ({ ...r, $key: i }));
}

function Actions({ list, row, i }: { list?: RowItem<Any>[]; row: Any; i: number }) {
  if (!list?.length) return null;
  return (
    <Space onClick={(e) => e.stopPropagation()}>
      {list.map((a) => <span key={a.key}>{a.render(row, i)}</span>)}
    </Space>
  );
}

function Table(p: Any) {
  const rows = rowsOf(p.data);
  const columns: Any[] = ((p.columns ?? []) as RowItem<Any>[]).map((c) => ({
    key: c.key, title: c.label, render: (_: unknown, row: Any, i: number) => c.render(row, i),
  }));
  if (p.rowActions?.length) {
    columns.push({ key: "$actions", title: "", render: (_: unknown, row: Any, i: number) => <Actions list={p.rowActions} row={row} i={i} /> });
  }
  return (
    <div {...p.rr.root}>
      <Filters filters={p.filters} />
      <ATable
        size="small"
        rowKey="$key"
        loading={p.loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        onRow={(row) => ({ ...p.rr.item(row), onClick: () => p.onOpen?.(row), style: p.onOpen ? { cursor: "pointer" } : undefined })}
      />
      {p.hasMore && <AButton style={{ marginTop: 8 }} {...p.rr.more} onClick={p.loadMore}>More</AButton>}
    </div>
  );
}

function List(p: Any) {
  const rows = rowsOf(p.data);
  return (
    <div {...p.rr.root}>
      <Filters filters={p.filters} />
      <AList
        loading={p.loading}
        dataSource={rows}
        renderItem={(row: Any, i: number) => (
          <AList.Item {...p.rr.item(row)} onClick={() => p.onOpen?.(row)} style={p.onOpen ? { cursor: "pointer" } : undefined}
            actions={p.rowActions?.length ? [<Actions key="a" list={p.rowActions} row={row} i={i} />] : undefined}>
            <Space wrap>{((p.children ?? []) as RowItem<Any>[]).map((c) => <span key={c.key}>{c.render(row, i)}</span>)}</Space>
          </AList.Item>
        )}
      />
      {p.hasMore && <AButton style={{ marginTop: 8 }} {...p.rr.more} onClick={p.loadMore}>More</AButton>}
    </div>
  );
}

function Card(p: Any) {
  const fields = (p.children ?? []) as Item[];
  return (
    <ACard {...p.rr.root} size="small" title={p.caption} loading={p.loading} style={{ marginBottom: 12 }}
      actions={p.actions?.length ? [<Space key="a" wrap>{items(p.actions)}</Space>] : undefined}>
      {p.errors?.length ? <Typography.Text type="danger">{p.errors.map((e: Any) => e.name).join(", ")}</Typography.Text> : (
        <Descriptions size="small" column={1} items={fields.map((f) => ({ key: f.key, label: f.label, children: f.node }))} />
      )}
    </ACard>
  );
}

// ---------------------------------------------------------------------------
// Displaying fields

function Text({ value, type, rr }: Any) {
  const label = useLabel();
  return <span {...rr.root}>{label(type, value)}</span>;
}

function Tag({ value, type, rr }: Any) {
  const label = useLabel();
  if (value === null || value === undefined) return null;
  return <ATag {...rr.root}>{label(type, value)}</ATag>;
}

function DateTime({ value, rr }: Any) {
  return <span {...rr.root}>{value ? new Date(String(value)).toLocaleString() : ""}</span>;
}

function Fields({ children, rr }: Any) {
  return (
    <span {...rr.root}>
      <Descriptions size="small" column={1} items={((children ?? []) as Item[]).map((f) => ({ key: f.key, label: f.label, children: f.node }))} />
    </span>
  );
}

function Items({ value, type, rr }: Any) {
  const label = useLabel();
  const elem = String(type ?? "").replace(/^(list|set)<(.*)>\??$/, "$2");
  return <Space {...rr.root} wrap>{((value ?? []) as unknown[]).map((v, i) => <ATag key={i}>{label(elem, v)}</ATag>)}</Space>;
}

// ---------------------------------------------------------------------------
// Commands

function Fieldset({ children }: { children?: Item[] }) {
  return (
    <AForm layout="vertical" component="div">
      {(children ?? []).map((f) => <AForm.Item key={f.key} label={f.label}>{f.node}</AForm.Item>)}
    </AForm>
  );
}

function Errors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <Typography.Paragraph type="danger">{errors.join("; ")}</Typography.Paragraph>;
}

function Form(p: Any) {
  return (
    <div {...p.rr.root} style={{ maxWidth: 560 }}>
      <Fieldset>{p.children}</Fieldset>
      <Errors errors={p.errors} />
      <AButton type="primary" loading={p.busy} {...p.rr.submit} onClick={() => void p.submit()}>{p.caption || "Submit"}</AButton>
    </div>
  );
}

/** A button with a form in a dialog: Edit and Confirm. */
function Dialog(p: Any & { danger?: boolean }) {
  const [open, setOpen] = useState(false);
  const fields = (p.children ?? []) as Item[];
  return (
    <span {...p.rr.root}>
      <AButton danger={p.danger} {...p.rr.open} onClick={() => setOpen(true)}>{p.caption}</AButton>
      <Modal open={open} title={p.caption} onCancel={() => setOpen(false)} destroyOnHidden
        footer={<AButton type="primary" danger={p.danger} loading={p.busy} {...p.rr.submit}
          onClick={async () => { if (await p.submit()) setOpen(false); }}>{p.danger ? "Confirm" : "Save"}</AButton>}>
        {fields.length > 0 && <Fieldset>{fields}</Fieldset>}
        <Errors errors={p.errors} />
      </Modal>
    </span>
  );
}

function Edit(p: Any) {
  return <Dialog {...p} />;
}

function Confirm(p: Any) {
  return <Dialog {...p} danger />;
}

function Button(p: Any) {
  return (
    <span {...p.rr.root}>
      <AButton loading={p.busy} {...p.rr.submit} onClick={() => void p.submit()}>{p.caption}</AButton>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Input

function TextInput({ value, onChange, error, rr }: Any) {
  return <Input {...rr.root} status={error ? "error" : undefined} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

function NumberInput({ value, onChange, type, rr }: Any) {
  const asString = /^(decimal|bigint)\??$/.test(String(type));
  return (
    <InputNumber {...rr.root} stringMode={asString} value={value as number | string | undefined}
      onChange={(v) => onChange(v === null ? undefined : asString ? String(v) : Number(v))} />
  );
}

function Checkbox({ value, onChange, rr }: Any) {
  return <ACheckbox {...rr.root} checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
}

function useOptions(type: unknown) {
  const env = useScreen();
  const name = String(type ?? "").replace(/^set<(.*)>$/, "$1").replace(/\?$/, "");
  const t = env.view.types?.[name];
  return (t?.values ?? []).map((v) => ({ value: v, label: t?.labels?.[v] ?? v }));
}

function Select({ value, onChange, type, rr }: Any) {
  return <ASelect {...rr.root} style={{ minWidth: 200 }} value={value} options={useOptions(type)} onChange={onChange} allowClear />;
}

function MultiSelect({ value, onChange, type, rr }: Any) {
  return <ASelect {...rr.root} mode="multiple" style={{ minWidth: 240 }} value={value ?? []} options={useOptions(type)} onChange={onChange} />;
}

function NativeInput(kind: string, toValue: (s: string) => unknown, fromValue: (v: unknown) => string) {
  return function N({ value, onChange, rr }: Any) {
    return <Input {...rr.root} type={kind} value={value ? fromValue(value) : ""} onChange={(e) => onChange(e.target.value ? toValue(e.target.value) : undefined)} />;
  };
}

const DateInput = NativeInput("date", (s) => s, (v) => String(v));
const TimeInput = NativeInput("time", (s) => (s.length === 5 ? s + ":00" : s), (v) => String(v).slice(0, 8));
const DateTimeInput = NativeInput("datetime-local", (s) => new Date(s).toISOString().replace(/\.\d{3}Z$/, "Z"),
  (v) => new Date(String(v)).toISOString().slice(0, 16));

function DurationInput({ value, onChange, rr }: Any) {
  return <Input {...rr.root} placeholder="90s, 15m, 2h" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

function EntityPicker(p: Any) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const multiple = Array.isArray(p.value) || /^set</.test(String(p.type));
  return (
    <ASelect
      {...p.rr.root}
      showSearch
      filterOption={false}
      mode={multiple ? "multiple" : undefined}
      style={{ minWidth: 240 }}
      value={p.value}
      options={options}
      notFoundContent={null}
      onSearch={async (text: string) => {
        const rows = ((await p.search(text)) ?? []) as Any[];
        setOptions(rows.map((r) => ({ value: String(p.key(r)), label: String(p.label(r)) })));
      }}
      onChange={p.onChange}
    />
  );
}

function Group({ children, rr }: Any) {
  return (
    <fieldset {...rr.root} style={{ border: "1px solid #eee", padding: 8 }}>
      <Fieldset>{children}</Fieldset>
    </fieldset>
  );
}

function ListInput({ value, onChange, type, rr }: Any) {
  if (/^(list|set)<string>/.test(String(type))) {
    return <ASelect {...rr.root} mode="tags" style={{ minWidth: 240 }} value={value ?? []} onChange={onChange} />;
  }
  return (
    <Input.TextArea {...rr.root} value={value === undefined ? "" : JSON.stringify(value)}
      onChange={(e) => { try { onChange(JSON.parse(e.target.value)); } catch { /* the input is not finished */ } }} />
  );
}

// ---------------------------------------------------------------------------
// The app shell

export function Shell({ title, user, menu, messages, content, onLogout }: ShellProps) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider theme="light" width={220} style={{ borderRight: "1px solid #f0f0f0" }}>
        <Typography.Title level={5} style={{ padding: "16px 24px 0" }}>{title}</Typography.Title>
        {menu}
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: "#fff", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
          <span data-rr="user">{user}</span>
          <AButton onClick={onLogout}>Sign out</AButton>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          {messages}
          {content as ReactNode}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

/** The standard catalog implementations by the primitive names of std/ui.rr. */
export const primitives: Registry = {
  Menu, Tabs, Link, Toolbar, Row, Stack, Section,
  Table, List, Card,
  Text, Tag, DateTime, Fields, Items,
  Form, Edit, Confirm, Button,
  TextInput, NumberInput, Checkbox, Select, MultiSelect, DateInput, TimeInput, DateTimeInput, DurationInput,
  EntityPicker, Group, ListInput,
};
