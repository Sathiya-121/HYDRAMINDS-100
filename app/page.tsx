"use client";
import { useEffect, useState } from "react";

type Result = any;
type Order = {
  id: string;
  order_no: string;
  product: string;
  batch_id: string;
  qty: number;
  unit_price: number;
  from_place: string;      // where the goods are shipped FROM
  ordered_by: string;      // who placed the order
  ship_to_company: string; // which company it is shipped to
  ship_to_person: string;  // whom (contact person)
  ship_to_address: string;
  order_date: string;
  delivery_date: string;
  expiry_date: string;     // entered manually
  status: "Pending" | "Shipped" | "Delivered" | "Cancelled";
  created: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
const money = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");

const emptyForm = {
  order_no: "", product: "", batch_id: "BATCH-2026-00125", qty: 1, unit_price: 0,
  from_place: "", ordered_by: "", ship_to_company: "", ship_to_person: "", ship_to_address: "",
  order_date: today(), delivery_date: "", expiry_date: "", status: "Pending" as Order["status"],
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
  const [tab, setTab] = useState<"inspect" | "orders" | "sales">("inspect");

  // ---- inspection ----
  const [batch, setBatch] = useState("BATCH-2026-00125");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ---- orders ----
  const [orders, setOrders] = useState<Order[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [minDays, setMinDays] = useState(30);
  const [loaded, setLoaded] = useState(false);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem("qc_history") || "[]")); } catch {}
    try { setOrders(JSON.parse(localStorage.getItem("erp_orders") || "[]")); } catch {}
    try { setMinDays(Number(localStorage.getItem("erp_min_days") || 30)); } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("erp_orders", JSON.stringify(orders)); } catch {}
  }, [orders, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("erp_min_days", String(minDays)); } catch {}
  }, [minDays, loaded]);

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
      const next = [data, ...history].slice(0, 50);
      setHistory(next);
      try { localStorage.setItem("qc_history", JSON.stringify(next)); } catch {}
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  const totals = history.reduce((a, h) => ({ t: a.t + h.total_products, b: a.b + h.bad_products }), { t: 0, b: 0 });
  const rate = totals.t ? ((totals.b / totals.t) * 100).toFixed(1) : "0";

  // Good units available for a batch (from AI inspections) minus units already ordered
  const goodFor = (id: string) => history.filter((h) => h.batch_id === id).reduce((s, h) => s + (h.good_products || 0), 0);
  const orderedFor = (id: string) => orders.filter((o) => o.batch_id === id && o.status !== "Cancelled").reduce((s, o) => s + o.qty, 0);

  function setF(k: string, v: any) { setForm((f) => ({ ...f, [k]: v })); }

  function addOrder() {
    setFormErr("");
    if (!form.product || !form.ship_to_company || !form.ordered_by || !form.from_place)
      return setFormErr("Product, From, Ordered by and Ship-to company are required.");
    if (!form.delivery_date || !form.expiry_date)
      return setFormErr("Please enter the delivery date and the expiry date.");
    const o: Order = {
      ...form,
      qty: Number(form.qty) || 0,
      unit_price: Number(form.unit_price) || 0,
      id: crypto.randomUUID(),
      order_no: form.order_no || "ORD-" + String(orders.length + 1).padStart(4, "0"),
      created: new Date().toISOString(),
    };
    setOrders([o, ...orders]);
    setForm({ ...emptyForm, batch_id: form.batch_id, from_place: form.from_place, ordered_by: form.ordered_by });
  }

  const setStatus = (id: string, status: Order["status"]) => setOrders(orders.map((o) => (o.id === id ? { ...o, status } : o)));
  const remove = (id: string) => setOrders(orders.filter((o) => o.id !== id));

  const alerts = orders
    .filter((o) => o.status !== "Delivered" && o.status !== "Cancelled")
    .map((o) => ({ o, c: checkExpiry(o, minDays) }))
    .filter((x) => x.c.level !== "ok");

  // ---- sales ----
  const sold = orders.filter((o) => o.status === "Shipped" || o.status === "Delivered");
  const revenue = sold.reduce((s, o) => s + o.qty * o.unit_price, 0);
  const units = sold.reduce((s, o) => s + o.qty, 0);
  const groupBy = (key: "ship_to_company" | "product") => {
    const m: Record<string, { orders: number; qty: number; rev: number }> = {};
    sold.forEach((o) => {
      const k = o[key] || "—";
      m[k] = m[k] || { orders: 0, qty: 0, rev: 0 };
      m[k].orders += 1; m[k].qty += o.qty; m[k].rev += o.qty * o.unit_price;
    });
    return Object.entries(m).sort((a, b) => b[1].rev - a[1].rev);
  };

  const avail = goodFor(form.batch_id) - orderedFor(form.batch_id);

  return (
    <>
      <header><h1>Cloud ERP · AI Quality Inspection</h1><span className="mute">Inventory · Production · QC · Orders · Sales · Traceability</span></header>
      <main>
        <nav className="tabs">
          <button className={tab === "inspect" ? "on" : ""} onClick={() => setTab("inspect")}>AI Inspection</button>
          <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>Orders & Shipping{alerts.length > 0 && <span className="dot">{alerts.length}</span>}</button>
          <button className={tab === "sales" ? "on" : ""} onClick={() => setTab("sales")}>Sales</button>
        </nav>

        {alerts.length > 0 && tab !== "inspect" && (
          <section className="card alertbox">
            <h2>⚠️ Expiry / delivery alerts ({alerts.length})</h2>
            {alerts.map(({ o, c }) => (
              <p key={o.id} className={c.level === "bad" ? "bad" : "warn"} style={{ margin: "4px 0" }}>
                <b>{o.order_no}</b> · {o.product} → {o.ship_to_company}: {c.msg} (delivery {o.delivery_date}, expiry {o.expiry_date})
              </p>
            ))}
          </section>
        )}

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

        {tab === "orders" && (
          <>
            <section className="card">
              <h2>New order</h2>
              <div className="form">
                <label>Order no. (auto if empty)<input value={form.order_no} onChange={(e) => setF("order_no", e.target.value)} /></label>
                <label>Product<input value={form.product} onChange={(e) => setF("product", e.target.value)} /></label>
                <label>Batch ID (from QC)<input value={form.batch_id} onChange={(e) => setF("batch_id", e.target.value)} /></label>
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

              {form.batch_id && goodFor(form.batch_id) > 0 && (
                <p className={Number(form.qty) > avail ? "bad" : "mute"}>
                  Batch {form.batch_id}: {goodFor(form.batch_id)} good units passed AI inspection, {avail} still unallocated.
                  {Number(form.qty) > avail ? " Order quantity is more than the good units available." : ""}
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
                            <td>{o.ship_to_company}<br /><span className="mute">{o.ship_to_person} {o.ship_to_address && "· " + o.ship_to_address}</span></td>
                            <td>{o.delivery_date}</td>
                            <td>{o.expiry_date}</td>
                            <td><span className={"tag " + c.level}>{c.level === "ok" ? "OK" : c.level === "warn" ? "Warning" : "Critical"}</span><br /><span className="mute">{c.msg}</span></td>
                            <td>
                              <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value as Order["status"])}>
                                <option>Pending</option><option>Shipped</option><option>Delivered</option><option>Cancelled</option>
                              </select>
                            </td>
                            <td><button className="ghost" onClick={() => remove(o.id)}>Delete</button></td>
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
      </main>
    </>
  );
}
