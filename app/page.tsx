"use client";
import { useEffect, useState } from "react";

type Result = any;
type Status = "Pending" | "Shipped" | "Delivered" | "Cancelled";
type Order = {
  id: string; order_no: string; product: string; batch_id: string; qty: number; unit_price: number;
  from_place: string; ordered_by: string; ship_to_company: string; ship_to_person: string; ship_to_address: string;
  order_date: string; delivery_date: string; expiry_date: string; status: Status; created: string; deducted?: boolean;
};
type Item = { id: string; name: string; category: "Raw material" | "Finished good"; unit: string; qty: number; reorder: number; location: string };
type Move = { id: string; date: string; item_id: string; item_name: string; delta: number; reason: string; batch_id: string };
type Run = {
  id: string; run_no: string; product: string; batch_id: string; planned: number; produced: number;
  raw_id: string; raw_used: number; start_date: string; end_date: string; expiry_date: string; notes: string;
  status: "Planned" | "In progress" | "Completed"; posted: boolean; created: string;
};
type Tab = "inspect" | "inventory" | "production" | "orders" | "sales" | "trace";

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
const money = (n: number) => "\u20B9" + (n || 0).toLocaleString("en-IN");
const same = (a: string, b: string) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

function useLS<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s) setV(JSON.parse(s)); } catch {}
    setOk(true);
  }, []);
  useEffect(() => {
    if (ok) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
  }, [v, ok]);
  return [v, setV] as const;
}

const adjust = (inv: Item[], id: string, delta: number): Item[] => inv.map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i));
const mkMove = (item: Item, delta: number, reason: string, batch: string): Move => ({
  id: uid(), date: new Date().toISOString(), item_id: item.id, item_name: item.name, delta, reason, batch_id: batch || "",
});

const emptyOrder = {
  order_no: "", product: "", batch_id: "", qty: 1, unit_price: 0,
  from_place: "", ordered_by: "", ship_to_company: "", ship_to_person: "", ship_to_address: "",
  order_date: today(), delivery_date: "", expiry_date: "", status: "Pending" as Status,
};
const emptyItem = { name: "", category: "Raw material" as Item["category"], unit: "kg", qty: 0, reorder: 0, location: "" };
const emptyRun = {
  run_no: "", product: "", batch_id: "", planned: 0, produced: 0, raw_id: "", raw_used: 0,
  start_date: today(), expiry_date: "", notes: "",
};

// Expiry vs delivery intimation
function checkExpiry(o: Order, minDays: number): { level: "bad" | "warn" | "ok"; msg: string } {
  if (o.status === "Cancelled") return { level: "ok", msg: "Cancelled" };
  if (!o.expiry_date || !o.delivery_date) return { level: "warn", msg: "Expiry or delivery date missing" };
  const gap = daysBetween(o.delivery_date, o.expiry_date);
  if (gap <= 0) return { level: "bad", msg: gap === 0 ? "Expires ON the delivery date" : "Expires " + (-gap) + " day(s) BEFORE delivery" };
  if (o.status !== "Delivered" && daysBetween(today(), o.expiry_date) < 0) return { level: "bad", msg: "Already expired" };
  if (gap < minDays) return { level: "warn", msg: "Only " + gap + " day(s) shelf life after delivery" };
  return { level: "ok", msg: gap + " day(s) shelf life after delivery" };
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("inspect");

  // ---- inspection ----
  const [batch, setBatch] = useState("BATCH-2026-00125");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useLS<Result[]>("qc_history", []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ---- ERP data (saved in the browser) ----
  const [orders, setOrders] = useLS<Order[]>("erp_orders", []);
  const [inventory, setInventory] = useLS<Item[]>("erp_inventory", []);
  const [moves, setMoves] = useLS<Move[]>("erp_moves", []);
  const [runs, setRuns] = useLS<Run[]>("erp_runs", []);
  const [minDays, setMinDays] = useLS<number>("erp_min_days", 30);

  // ---- forms ----
  const [form, setForm] = useState({ ...emptyOrder });
  const [formErr, setFormErr] = useState("");
  const [itemForm, setItemForm] = useState({ ...emptyItem });
  const [itemErr, setItemErr] = useState("");
  const [adj, setAdj] = useState({ item_id: "", delta: 0, reason: "" });
  const [runForm, setRunForm] = useState({ ...emptyRun });
  const [runErr, setRunErr] = useState("");
  const [q, setQ] = useState("");

  function pick(f: File | null) {
    setFile(f); setResult(null);
    setPreview(f ? URL.createObjectURL(f) : "");
  }

  async function inspect() {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("image", file); fd.append("batch_id", batch);
      const r = await fetch("/api/inspect", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json()).error || "Request failed");
      const data = await r.json();
      setResult(data);
      setHistory([data, ...history].slice(0, 50));
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  const totals = history.reduce((a, h) => ({ t: a.t + h.total_products, b: a.b + h.bad_products }), { t: 0, b: 0 });
  const rate = totals.t ? ((totals.b / totals.t) * 100).toFixed(1) : "0";
  const goodFor = (id: string) => history.filter((h) => h.batch_id === id).reduce((s, h) => s + (h.good_products || 0), 0);
  const orderedFor = (id: string) => orders.filter((o) => o.batch_id === id && o.status !== "Cancelled").reduce((s, o) => s + o.qty, 0);

  // ================= INVENTORY =================
  function addItem() {
    setItemErr("");
    if (!itemForm.name.trim()) return setItemErr("Item name is required.");
    if (inventory.some((i) => same(i.name, itemForm.name) && i.category === itemForm.category)) return setItemErr("This item already exists.");
    const it: Item = { ...itemForm, id: uid(), name: itemForm.name.trim(), qty: Number(itemForm.qty) || 0, reorder: Number(itemForm.reorder) || 0 };
    setInventory([it, ...inventory]);
    if (it.qty > 0) setMoves([mkMove(it, it.qty, "Opening stock", ""), ...moves]);
    setItemForm({ ...emptyItem, category: itemForm.category, unit: itemForm.unit });
  }

  function applyAdjust() {
    const d = Number(adj.delta);
    const item = inventory.find((i) => i.id === adj.item_id);
    if (!item || !d) return;
    setInventory(adjust(inventory, item.id, d));
    setMoves([mkMove(item, d, adj.reason || (d > 0 ? "Stock in" : "Stock out"), ""), ...moves]);
    setAdj({ item_id: adj.item_id, delta: 0, reason: "" });
  }

  const removeItem = (id: string) => setInventory(inventory.filter((i) => i.id !== id));
  const lowStock = inventory.filter((i) => i.reorder > 0 && i.qty <= i.reorder);
  const finishedStock = (name: string) => {
    const it = inventory.find((i) => i.category === "Finished good" && same(i.name, name));
    return it ? it.qty : null;
  };

  // ================= PRODUCTION =================
  function addRun() {
    setRunErr("");
    if (!runForm.product.trim() || !runForm.batch_id.trim()) return setRunErr("Product and Batch ID are required.");
    const r: Run = {
      ...runForm, id: uid(),
      run_no: runForm.run_no || "PRD-" + String(runs.length + 1).padStart(4, "0"),
      planned: Number(runForm.planned) || 0, produced: Number(runForm.produced) || 0, raw_used: Number(runForm.raw_used) || 0,
      end_date: "", status: "Planned", posted: false, created: new Date().toISOString(),
    };
    setRuns([r, ...runs]);
    setRunForm({ ...emptyRun });
  }

  function setRunField(id: string, patch: Partial<Run>) {
    setRuns(runs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Completing a run uses raw material and adds finished goods to inventory
  function completeRun(r: Run) {
    if (r.posted) return;
    let inv = inventory;
    let mv = moves;
    const produced = Number(r.produced) || 0;
    if (r.raw_id && r.raw_used > 0) {
      const raw = inv.find((i) => i.id === r.raw_id);
      if (raw) {
        inv = adjust(inv, raw.id, -r.raw_used);
        mv = [mkMove(raw, -r.raw_used, "Used in " + r.run_no, r.batch_id), ...mv];
      }
    }
    if (produced > 0) {
      let fg = inv.find((i) => i.category === "Finished good" && same(i.name, r.product));
      if (!fg) {
        fg = { id: uid(), name: r.product.trim(), category: "Finished good", unit: "pcs", qty: 0, reorder: 0, location: "" };
        inv = [fg, ...inv];
      }
      inv = adjust(inv, fg.id, produced);
      mv = [mkMove(fg, produced, "Produced " + r.run_no, r.batch_id), ...mv];
    }
    setInventory(inv);
    setMoves(mv);
    setRunField(r.id, { status: "Completed", posted: true, end_date: r.end_date || today() });
  }

  const removeRun = (id: string) => setRuns(runs.filter((r) => r.id !== id));
  const runForBatch = (b: string) => runs.find((r) => same(r.batch_id, b));

  // ================= ORDERS =================
  function setF(k: string, v: any) { setForm((f) => ({ ...f, [k]: v })); }

  // Shipping an order deducts finished-goods stock; cancelling puts it back
  function changeStatus(o: Order, status: Status): Order {
    let inv = inventory;
    let mv = moves;
    let deducted = !!o.deducted;
    const item = inv.find((i) => i.category === "Finished good" && same(i.name, o.product));
    if (item) {
      if ((status === "Shipped" || status === "Delivered") && !deducted) {
        inv = adjust(inv, item.id, -o.qty);
        mv = [mkMove(item, -o.qty, "Shipped " + o.order_no, o.batch_id), ...mv];
        deducted = true;
      } else if ((status === "Cancelled" || status === "Pending") && deducted) {
        inv = adjust(inv, item.id, o.qty);
        mv = [mkMove(item, o.qty, "Returned to stock " + o.order_no, o.batch_id), ...mv];
        deducted = false;
      }
    }
    setInventory(inv);
    setMoves(mv);
    return { ...o, status, deducted };
  }

  function addOrder() {
    setFormErr("");
    if (!form.product || !form.ship_to_company || !form.ordered_by || !form.from_place)
      return setFormErr("Product, From, Ordered by and Ship-to company are required.");
    if (!form.delivery_date || !form.expiry_date)
      return setFormErr("Please enter the delivery date and the expiry date.");
    const base: Order = {
      ...form, qty: Number(form.qty) || 0, unit_price: Number(form.unit_price) || 0,
      id: uid(), order_no: form.order_no || "ORD-" + String(orders.length + 1).padStart(4, "0"),
      created: new Date().toISOString(), deducted: false,
    };
    const o = changeStatus(base, form.status);
    setOrders([o, ...orders]);
    setForm({ ...emptyOrder, batch_id: form.batch_id, from_place: form.from_place, ordered_by: form.ordered_by });
  }

  const setStatus = (o: Order, status: Status) => setOrders(orders.map((x) => (x.id === o.id ? changeStatus(o, status) : x)));
  const removeOrder = (id: string) => setOrders(orders.filter((o) => o.id !== id));

  const alerts = orders
    .filter((o) => o.status !== "Delivered" && o.status !== "Cancelled")
    .map((o) => ({ o, c: checkExpiry(o, minDays) }))
    .filter((x) => x.c.level !== "ok");

  // ================= SALES =================
  const sold = orders.filter((o) => o.status === "Shipped" || o.status === "Delivered");
  const revenue = sold.reduce((s, o) => s + o.qty * o.unit_price, 0);
  const units = sold.reduce((s, o) => s + o.qty, 0);
  const groupBy = (key: "ship_to_company" | "product") => {
    const m: Record<string, { orders: number; qty: number; rev: number }> = {};
    sold.forEach((o) => {
      const k = o[key] || "-";
      m[k] = m[k] || { orders: 0, qty: 0, rev: 0 };
      m[k].orders += 1; m[k].qty += o.qty; m[k].rev += o.qty * o.unit_price;
    });
    return Object.entries(m).sort((a, b) => b[1].rev - a[1].rev);
  };

  // ================= TRACEABILITY =================
  const allBatches = Array.from(new Set([
    ...runs.map((r) => r.batch_id), ...history.map((h) => h.batch_id), ...orders.map((o) => o.batch_id), ...moves.map((m) => m.batch_id),
  ].filter(Boolean)));
  const ql = q.trim().toLowerCase();
  const has = (s: string) => (s || "").toLowerCase().includes(ql);
  const matched = ql
    ? allBatches.filter((b) =>
        has(b) ||
        orders.some((o) => o.batch_id === b && (has(o.order_no) || has(o.ship_to_company) || has(o.product) || has(o.ship_to_person))) ||
        runs.some((r) => r.batch_id === b && (has(r.run_no) || has(r.product))))
    : [];

  function traceCard(b: string) {
    const br = runs.filter((r) => r.batch_id === b);
    const qc = history.filter((h) => h.batch_id === b);
    const bm = moves.filter((m) => m.batch_id === b);
    const bo = orders.filter((o) => o.batch_id === b);
    const qt = qc.reduce((s, h) => s + h.total_products, 0);
    const qg = qc.reduce((s, h) => s + h.good_products, 0);
    const qb = qc.reduce((s, h) => s + h.bad_products, 0);
    const customers = Array.from(new Set(bo.filter((o) => o.status !== "Cancelled").map((o) => o.ship_to_company)));
    return (
      <section className="card" key={b}>
        <h2>Batch {b}</h2>

        <p className="step"><b>1. Production</b></p>
        {br.length === 0 ? <p className="mute">No production run recorded for this batch.</p> : br.map((r) => (
          <p key={r.id} className="mute">
            {r.run_no} - {r.product} - planned {r.planned}, produced {r.produced} - started {r.start_date}
            {r.end_date ? " - finished " + r.end_date : ""} - {r.status}
            {r.expiry_date ? " - batch expiry " + r.expiry_date : ""}
            {r.raw_id ? " - raw material: " + ((inventory.find((i) => i.id === r.raw_id) || ({} as Item)).name || "removed item") + " x" + r.raw_used : ""}
          </p>
        ))}

        <p className="step"><b>2. Quality inspection (AI)</b></p>
        {qc.length === 0 ? <p className="mute">No AI inspection for this batch.</p> : (
          <p className="mute">
            {qc.length} inspection(s): {qt} checked, <span className="good">{qg} good</span>, <span className="bad">{qb} rejected</span>
            {qt ? " (yield " + ((qg / qt) * 100).toFixed(1) + "%)" : ""}
          </p>
        )}

        <p className="step"><b>3. Stock movements</b></p>
        {bm.length === 0 ? <p className="mute">No stock movement linked to this batch.</p> : bm.map((m) => (
          <p key={m.id} className="mute">
            {new Date(m.date).toLocaleString()} - {m.item_name}: <span className={m.delta > 0 ? "good" : "bad"}>{m.delta > 0 ? "+" : ""}{m.delta}</span> - {m.reason}
          </p>
        ))}

        <p className="step"><b>4. Shipped to customers</b></p>
        {bo.length === 0 ? <p className="mute">No orders for this batch yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Order</th><th>From</th><th>Ordered by</th><th>Shipped to</th><th>Qty</th><th>Delivery</th><th>Expiry</th><th>Status</th></tr></thead>
              <tbody>
                {bo.map((o) => {
                  const c = checkExpiry(o, minDays);
                  return (
                    <tr key={o.id}>
                      <td>{o.order_no}</td><td>{o.from_place}</td><td>{o.ordered_by}</td>
                      <td>{o.ship_to_company}<br /><span className="mute">{o.ship_to_person} {o.ship_to_address ? "- " + o.ship_to_address : ""}</span></td>
                      <td>{o.qty}</td><td>{o.delivery_date}</td>
                      <td>{o.expiry_date} <span className={"tag " + c.level}>{c.level === "ok" ? "OK" : c.level === "warn" ? "Warning" : "Critical"}</span></td>
                      <td>{o.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {customers.length > 0 && (
          <p className="recall"><b>Recall list:</b> if this batch has a problem, contact {customers.join(", ")}.</p>
        )}
      </section>
    );
  }

  const avail = form.batch_id ? goodFor(form.batch_id) - orderedFor(form.batch_id) : 0;
  const stockNow = form.product ? finishedStock(form.product) : null;
  const batchRun = form.batch_id ? runForBatch(form.batch_id) : undefined;
  const tabBtn = (t: Tab, label: string, badge?: number) => (
    <button className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
      {label}{badge ? <span className="dot">{badge}</span> : null}
    </button>
  );

  return (
    <>
      <header><h1>Cloud ERP · AI Quality Inspection</h1><span className="mute">Inventory · Production · QC · Orders · Sales · Traceability</span></header>
      <main>
        <nav className="tabs">
          {tabBtn("inspect", "AI Inspection")}
          {tabBtn("inventory", "Inventory", lowStock.length)}
          {tabBtn("production", "Production")}
          {tabBtn("orders", "Orders & Shipping", alerts.length)}
          {tabBtn("sales", "Sales")}
          {tabBtn("trace", "Traceability")}
        </nav>

        {alerts.length > 0 && (tab === "orders" || tab === "sales") && (
          <section className="card alertbox">
            <h2>Expiry / delivery alerts ({alerts.length})</h2>
            {alerts.map(({ o, c }) => (
              <p key={o.id} className={c.level === "bad" ? "bad" : "warn"} style={{ margin: "4px 0" }}>
                <b>{o.order_no}</b> · {o.product} → {o.ship_to_company}: {c.msg} (delivery {o.delivery_date}, expiry {o.expiry_date})
              </p>
            ))}
          </section>
        )}

        {/* ============ AI INSPECTION ============ */}
        {tab === "inspect" && (
          <>
            <div className="grid">
              <section className="card">
                <h2>1. Upload product image</h2>
                <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Batch ID" />
                <input type="file" accept="image/*" style={{ marginTop: 10 }} onChange={(e) => pick(e.target.files?.[0] || null)} />
                <button disabled={!file || busy} onClick={inspect}>{busy ? "Inspecting…" : "Run AI inspection"}</button>
                {err && <p className="bad">{err}</p>}
              </section>

              <section className="card">
                <h2>2. Result</h2>
                {!preview && <p className="mute">Upload an image to begin.</p>}
                {preview && (
                  <div className="img">
                    <img src={preview} alt="upload" />
                    {result?.detections.map((d: any, i: number) => (
                      <div key={i} className={"box " + d.status}
                        style={{ left: (d.box[0] * 100) + "%", top: (d.box[1] * 100) + "%", width: (d.box[2] * 100) + "%", height: (d.box[3] * 100) + "%" }}>
                        <span>{d.label} {d.conf}</span>
                      </div>
                    ))}
                  </div>
                )}
                {result && (
                  <>
                    <div className="stats" style={{ marginTop: 12 }}>
                      <div className="stat"><b>{result.total_products}</b><span>Total</span></div>
                      <div className="stat"><b className="good">{result.good_products}</b><span>Good</span></div>
                      <div className="stat"><b className="bad">{result.bad_products}</b><span>Rejected</span></div>
                      <div className="stat"><b>{result.yield_pct}%</b><span>Yield</span></div>
                    </div>
                    <p className="mute">
                      Defects: {Object.keys(result.defects).length ? Object.entries(result.defects).map(([k, v]) => k + " ×" + v).join(", ") : "none"}
                      {" · "}confidence {result.confidence} · mode <span className="tag">{result.mode}</span>
                    </p>
                  </>
                )}
              </section>
            </div>

            <section className="card">
              <h2>QC inspection records — overall rejection {rate}%</h2>
              {history.length === 0 ? <p className="mute">No inspections yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Batch</th><th>Time</th><th>Total</th><th>Good</th><th>Bad</th><th>Yield</th><th>Status</th></tr></thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={i}>
                          <td>{h.batch_id}</td><td>{new Date(h.created).toLocaleString()}</td>
                          <td>{h.total_products}</td><td className="good">{h.good_products}</td><td className="bad">{h.bad_products}</td>
                          <td>{h.yield_pct}%</td>
                          <td><span className="tag">{h.yield_pct >= 95 ? "Released" : "Hold for review"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* ============ INVENTORY ============ */}
        {tab === "inventory" && (
          <>
            {lowStock.length > 0 && (
              <section className="card alertbox">
                <h2>Low stock ({lowStock.length})</h2>
                {lowStock.map((i) => (
                  <p key={i.id} className="warn" style={{ margin: "4px 0" }}><b>{i.name}</b>: {i.qty} {i.unit} left (reorder level {i.reorder})</p>
                ))}
              </section>
            )}
            <div className="grid">
              <section className="card">
                <h2>Add inventory item</h2>
                <div className="form two">
                  <label>Item name<input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} /></label>
                  <label>Category
                    <select value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value as Item["category"] })}>
                      <option>Raw material</option><option>Finished good</option>
                    </select>
                  </label>
                  <label>Unit<input value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} placeholder="kg, pcs, L" /></label>
                  <label>Opening quantity<input type="number" min={0} value={itemForm.qty} onChange={(e) => setItemForm({ ...itemForm, qty: e.target.value as any })} /></label>
                  <label>Reorder level<input type="number" min={0} value={itemForm.reorder} onChange={(e) => setItemForm({ ...itemForm, reorder: e.target.value as any })} /></label>
                  <label>Location<input value={itemForm.location} onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })} placeholder="Warehouse / rack" /></label>
                </div>
                {itemErr && <p className="bad">{itemErr}</p>}
                <button onClick={addItem}>Add item</button>
              </section>

              <section className="card">
                <h2>Stock in / out</h2>
                <div className="form two">
                  <label>Item
                    <select value={adj.item_id} onChange={(e) => setAdj({ ...adj, item_id: e.target.value })}>
                      <option value="">Select item</option>
                      {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.qty} {i.unit})</option>)}
                    </select>
                  </label>
                  <label>Change (+ in, - out)<input type="number" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value as any })} /></label>
                  <label>Reason<input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="Purchase, damage, count fix…" /></label>
                </div>
                <button disabled={!adj.item_id || !Number(adj.delta)} onClick={applyAdjust}>Update stock</button>
                <p className="mute">Production completion adds finished goods, and shipping an order removes them, automatically.</p>
              </section>
            </div>

            <section className="card">
              <h2>Stock on hand ({inventory.length})</h2>
              {inventory.length === 0 ? <p className="mute">No items yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Reorder at</th><th>Location</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {inventory.map((i) => {
                        const low = i.reorder > 0 && i.qty <= i.reorder;
                        return (
                          <tr key={i.id}>
                            <td>{i.name}</td><td>{i.category}</td><td>{i.qty} {i.unit}</td><td>{i.reorder || "-"}</td><td>{i.location || "-"}</td>
                            <td><span className={"tag " + (i.qty < 0 ? "bad" : low ? "warn" : "ok")}>{i.qty < 0 ? "Negative" : low ? "Low" : "OK"}</span></td>
                            <td><button className="ghost" onClick={() => removeItem(i.id)}>Delete</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h2>Stock movement log</h2>
              {moves.length === 0 ? <p className="mute">No movements yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Time</th><th>Item</th><th>Change</th><th>Reason</th><th>Batch</th></tr></thead>
                    <tbody>
                      {moves.slice(0, 40).map((m) => (
                        <tr key={m.id}>
                          <td>{new Date(m.date).toLocaleString()}</td><td>{m.item_name}</td>
                          <td className={m.delta > 0 ? "good" : "bad"}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
                          <td>{m.reason}</td><td>{m.batch_id || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* ============ PRODUCTION ============ */}
        {tab === "production" && (
          <>
            <section className="card">
              <h2>New production run</h2>
              <div className="form">
                <label>Run no. (auto if empty)<input value={runForm.run_no} onChange={(e) => setRunForm({ ...runForm, run_no: e.target.value })} /></label>
                <label>Product<input value={runForm.product} onChange={(e) => setRunForm({ ...runForm, product: e.target.value })} /></label>
                <label>Batch ID<input value={runForm.batch_id} onChange={(e) => setRunForm({ ...runForm, batch_id: e.target.value })} placeholder="BATCH-2026-00125" /></label>
                <label>Planned quantity<input type="number" min={0} value={runForm.planned} onChange={(e) => setRunForm({ ...runForm, planned: e.target.value as any })} /></label>
                <label>Produced quantity<input type="number" min={0} value={runForm.produced} onChange={(e) => setRunForm({ ...runForm, produced: e.target.value as any })} /></label>
                <label>Start date<input type="date" value={runForm.start_date} onChange={(e) => setRunForm({ ...runForm, start_date: e.target.value })} /></label>
                <label>Raw material used
                  <select value={runForm.raw_id} onChange={(e) => setRunForm({ ...runForm, raw_id: e.target.value })}>
                    <option value="">None</option>
                    {inventory.filter((i) => i.category === "Raw material").map((i) => <option key={i.id} value={i.id}>{i.name} ({i.qty} {i.unit})</option>)}
                  </select>
                </label>
                <label>Raw material quantity<input type="number" min={0} value={runForm.raw_used} onChange={(e) => setRunForm({ ...runForm, raw_used: e.target.value as any })} /></label>
                <label>Batch expiry date (manual)<input type="date" value={runForm.expiry_date} onChange={(e) => setRunForm({ ...runForm, expiry_date: e.target.value })} /></label>
                <label>Notes<input value={runForm.notes} onChange={(e) => setRunForm({ ...runForm, notes: e.target.value })} /></label>
              </div>
              {runForm.batch_id && goodFor(runForm.batch_id) > 0 && (
                <p className="mute">
                  AI inspection found {goodFor(runForm.batch_id)} good units for this batch.{" "}
                  <button className="link" onClick={() => setRunForm({ ...runForm, produced: goodFor(runForm.batch_id) as any })}>Use as produced quantity</button>
                </p>
              )}
              {runErr && <p className="bad">{runErr}</p>}
              <button onClick={addRun}>Save production run</button>
            </section>

            <section className="card">
              <h2>Production runs ({runs.length})</h2>
              {runs.length === 0 ? <p className="mute">No runs yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Run</th><th>Product / Batch</th><th>Planned</th><th>Produced</th><th>QC good</th><th>Raw material</th><th>Dates</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {runs.map((r) => {
                        const raw = inventory.find((i) => i.id === r.raw_id);
                        return (
                          <tr key={r.id}>
                            <td>{r.run_no}</td>
                            <td>{r.product}<br /><span className="mute">{r.batch_id}</span></td>
                            <td>{r.planned}</td>
                            <td>
                              {r.posted ? r.produced : (
                                <input type="number" min={0} value={r.produced} style={{ width: 80, padding: "4px 6px" }}
                                  onChange={(e) => setRunField(r.id, { produced: Number(e.target.value) || 0 })} />
                              )}
                            </td>
                            <td>{goodFor(r.batch_id) || "-"}</td>
                            <td>{raw ? raw.name + " ×" + r.raw_used : "-"}</td>
                            <td>{r.start_date}{r.end_date ? " → " + r.end_date : ""}<br /><span className="mute">{r.expiry_date ? "expiry " + r.expiry_date : ""}</span></td>
                            <td>
                              {r.posted ? <span className="tag ok">Completed</span> : (
                                <select value={r.status} onChange={(e) => setRunField(r.id, { status: e.target.value as Run["status"] })}>
                                  <option>Planned</option><option>In progress</option>
                                </select>
                              )}
                            </td>
                            <td>
                              {!r.posted && <button className="small" onClick={() => completeRun(r)}>Complete & add to stock</button>}{" "}
                              <button className="ghost" onClick={() => removeRun(r.id)}>Delete</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* ============ ORDERS ============ */}
        {tab === "orders" && (
          <>
            <section className="card">
              <h2>New order</h2>
              <div className="form">
                <label>Order no. (auto if empty)<input value={form.order_no} onChange={(e) => setF("order_no", e.target.value)} /></label>
                <label>Product<input value={form.product} onChange={(e) => setF("product", e.target.value)} /></label>
                <label>Batch ID (from QC / production)<input value={form.batch_id} onChange={(e) => setF("batch_id", e.target.value)} /></label>
                <label>Quantity<input type="number" min={1} value={form.qty} onChange={(e) => setF("qty", e.target.value)} /></label>
                <label>Unit price (₹)<input type="number" min={0} value={form.unit_price} onChange={(e) => setF("unit_price", e.target.value)} /></label>
                <label>From (where it ships from)<input value={form.from_place} onChange={(e) => setF("from_place", e.target.value)} placeholder="Factory / warehouse / city" /></label>
                <label>Ordered by (who)<input value={form.ordered_by} onChange={(e) => setF("ordered_by", e.target.value)} /></label>
                <label>Ship to — company<input value={form.ship_to_company} onChange={(e) => setF("ship_to_company", e.target.value)} /></label>
                <label>Ship to — contact person<input value={form.ship_to_person} onChange={(e) => setF("ship_to_person", e.target.value)} /></label>
                <label>Ship to — address<input value={form.ship_to_address} onChange={(e) => setF("ship_to_address", e.target.value)} /></label>
                <label>Order date<input type="date" value={form.order_date} onChange={(e) => setF("order_date", e.target.value)} /></label>
                <label>Delivery date<input type="date" value={form.delivery_date} onChange={(e) => setF("delivery_date", e.target.value)} /></label>
                <label>Expiry date (manual)<input type="date" value={form.expiry_date} onChange={(e) => setF("expiry_date", e.target.value)} /></label>
                <label>Status
                  <select value={form.status} onChange={(e) => setF("status", e.target.value)}>
                    <option>Pending</option><option>Shipped</option><option>Delivered</option><option>Cancelled</option>
                  </select>
                </label>
              </div>

              {stockNow !== null && (
                <p className={Number(form.qty) > stockNow ? "bad" : "mute"}>
                  Inventory: {stockNow} in stock for {form.product}.{Number(form.qty) > stockNow ? " Order quantity is more than the stock available." : ""}
                </p>
              )}
              {form.batch_id && goodFor(form.batch_id) > 0 && (
                <p className={Number(form.qty) > avail ? "bad" : "mute"}>
                  Batch {form.batch_id}: {goodFor(form.batch_id)} good units passed AI inspection, {avail} still unallocated.
                  {Number(form.qty) > avail ? " Order quantity is more than the good units available." : ""}
                </p>
              )}
              {batchRun && batchRun.expiry_date && !form.expiry_date && (
                <p className="mute">
                  Production recorded expiry {batchRun.expiry_date} for this batch.{" "}
                  <button className="link" onClick={() => setF("expiry_date", batchRun.expiry_date)}>Use it</button>
                </p>
              )}
              {form.delivery_date && form.expiry_date && (() => {
                const c = checkExpiry({ ...(form as any), id: "", created: "", qty: 0, unit_price: 0 }, minDays);
                return c.level !== "ok" ? <p className={c.level === "bad" ? "bad" : "warn"}>⚠️ {c.msg}</p> : <p className="good">✓ {c.msg}</p>;
              })()}
              {formErr && <p className="bad">{formErr}</p>}
              <button onClick={addOrder}>Save order</button>

              <p className="mute" style={{ marginTop: 14 }}>
                Warn when shelf life after delivery is less than{" "}
                <input type="number" min={0} value={minDays} onChange={(e) => setMinDays(Number(e.target.value) || 0)} style={{ width: 70, display: "inline-block", padding: "4px 8px" }} /> days
              </p>
            </section>

            <section className="card">
              <h2>Orders ({orders.length})</h2>
              {orders.length === 0 ? <p className="mute">No orders yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Order</th><th>Product / Batch</th><th>Qty</th><th>From</th><th>Ordered by</th><th>Shipped to</th><th>Delivery</th><th>Expiry</th><th>Alert</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {orders.map((o) => {
                        const c = checkExpiry(o, minDays);
                        return (
                          <tr key={o.id}>
                            <td>{o.order_no}<br /><span className="mute">{o.order_date}</span></td>
                            <td>{o.product}<br /><span className="mute">{o.batch_id}</span></td>
                            <td>{o.qty}</td>
                            <td>{o.from_place}</td>
                            <td>{o.ordered_by}</td>
                            <td>{o.ship_to_company}<br /><span className="mute">{o.ship_to_person} {o.ship_to_address ? "· " + o.ship_to_address : ""}</span></td>
                            <td>{o.delivery_date}</td>
                            <td>{o.expiry_date}</td>
                            <td><span className={"tag " + c.level}>{c.level === "ok" ? "OK" : c.level === "warn" ? "Warning" : "Critical"}</span><br /><span className="mute">{c.msg}</span></td>
                            <td>
                              <select value={o.status} onChange={(e) => setStatus(o, e.target.value as Status)}>
                                <option>Pending</option><option>Shipped</option><option>Delivered</option><option>Cancelled</option>
                              </select>
                            </td>
                            <td><button className="ghost" onClick={() => removeOrder(o.id)}>Delete</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* ============ SALES ============ */}
        {tab === "sales" && (
          <>
            <section className="card">
              <h2>Sales summary (Shipped + Delivered orders)</h2>
              <div className="stats">
                <div className="stat"><b>{sold.length}</b><span>Orders</span></div>
                <div className="stat"><b>{units}</b><span>Units sold</span></div>
                <div className="stat"><b className="good">{money(revenue)}</b><span>Revenue</span></div>
                <div className="stat"><b>{orders.filter((o) => o.status === "Pending").length}</b><span>Pending</span></div>
              </div>
            </section>
            <div className="grid">
              <section className="card">
                <h2>By company</h2>
                {sold.length === 0 ? <p className="mute">No sales yet.</p> : (
                  <table>
                    <thead><tr><th>Company</th><th>Orders</th><th>Units</th><th>Revenue</th></tr></thead>
                    <tbody>{groupBy("ship_to_company").map(([k, v]) => (<tr key={k}><td>{k}</td><td>{v.orders}</td><td>{v.qty}</td><td>{money(v.rev)}</td></tr>))}</tbody>
                  </table>
                )}
              </section>
              <section className="card">
                <h2>By product</h2>
                {sold.length === 0 ? <p className="mute">No sales yet.</p> : (
                  <table>
                    <thead><tr><th>Product</th><th>Orders</th><th>Units</th><th>Revenue</th></tr></thead>
                    <tbody>{groupBy("product").map(([k, v]) => (<tr key={k}><td>{k}</td><td>{v.orders}</td><td>{v.qty}</td><td>{money(v.rev)}</td></tr>))}</tbody>
                  </table>
                )}
              </section>
            </div>
          </>
        )}

        {/* ============ TRACEABILITY ============ */}
        {tab === "trace" && (
          <>
            <section className="card">
              <h2>Trace a batch</h2>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by batch ID, order no., company, product or run no." />
              <p className="mute" style={{ marginTop: 10 }}>
                Follows a batch from production → AI quality check → stock → customer, and lists who to contact if there is a recall.
              </p>
              {allBatches.length > 0 && (
                <div className="chips">
                  {allBatches.map((b) => <button key={b} className="chip" onClick={() => setQ(b)}>{b}</button>)}
                </div>
              )}
            </section>
            {ql && matched.length === 0 && <p className="mute">No batch matches "{q}".</p>}
            {!ql && allBatches.length === 0 && <p className="mute">No batches yet. Run an AI inspection, a production run or an order first.</p>}
            {matched.map((b) => traceCard(b))}
          </>
        )}
      </main>
    </>
  );
}
