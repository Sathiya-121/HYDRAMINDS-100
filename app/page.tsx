"use client";
import { useEffect, useState } from "react";

// Code 39 barcode (1 = wide bar). Scannable by phone apps and USB scanners.
const P: Record<string, string> = {
  "0":"000110100","1":"100100001","2":"001100001","3":"101100000","4":"000110001","5":"100110000","6":"001110000","7":"000100101","8":"100100100","9":"001100100",
  A:"100001001",B:"001001001",C:"101001000",D:"000011001",E:"100011000",F:"001011000",G:"000001101",H:"100001100",I:"001001100",J:"000011100",
  K:"100000011",L:"001000011",M:"101000010",N:"000010011",O:"100010010",P:"001010010",Q:"000000111",R:"100000110",S:"001000110",T:"000010110",
  U:"110000001",V:"011000001",W:"111000000",X:"010010001",Y:"110010000",Z:"011010000","-":"010000101","*":"010010100",
};

function Barcode({ value }: { value: string }) {
  const txt = "*" + value + "*";
  let x = 10;
  const bars: any[] = [];
  for (const ch of txt) {
    const p = P[ch];
    if (!p) continue;
    for (let i = 0; i < 9; i++) {
      const w = p[i] === "1" ? 3 : 1;
      if (i % 2 === 0) bars.push(<rect key={x} x={x} y={5} width={w} height={60} fill="#000" />);
      x += w;
    }
    x += 1;
  }
  return (
    <svg id={"bc-" + value} viewBox={`0 0 ${x + 10} 85`} style={{ background: "#fff", borderRadius: 6, maxWidth: 320, width: "100%" }}>
      {bars}
      <text x={(x + 10) / 2} y={80} textAnchor="middle" fontSize="11" fontFamily="monospace">{value}</text>
    </svg>
  );
}

function printLabel(id: string, lines: string[]) {
  const el = document.getElementById("bc-" + id);
  const w = window.open("", "_blank");
  if (!w || !el) return;
  w.document.write(`<body style="font-family:sans-serif">${el.outerHTML}<pre>${lines.join("\n")}</pre></body>`);
  w.document.close();
  w.print();
}

function printReport(title: string, head: string[], rows: any[][]) {
  const w = window.open("", "_blank");
  if (!w) return;
  const td = (c: any) => `<td style="border:1px solid #999;padding:4px">${c}</td>`;
  w.document.write(`<body style="font-family:sans-serif"><h2>${title}</h2><table style="border-collapse:collapse"><tr>${head.map((h) => `<th style="border:1px solid #999;padding:4px">${h}</th>`).join("")}</tr>${rows.map((x) => "<tr>" + x.map(td).join("") + "</tr>").join("")}</table></body>`);
  w.document.close();
  w.print();
}

const Field = ({ k, v }: { k: string; v: any }) => (
  <div><div className="mute">{k}</div><b>{v === "" || v == null ? "-" : v}</b></div>
);

const STATUSES = ["Packed", "Dispatched", "In transit", "Delivered"];
const day = () => new Date().toISOString().slice(2, 10).replace(/-/g, "");
const clean = (s: string) => s.trim().toUpperCase().replace(/[^0-9A-Z-]/g, "");
const expiry = (d: string) => {
  if (!d) return "-";
  const n = Math.ceil((new Date(d).getTime() - Date.now()) / 864e5);
  return n < 0 ? "EXPIRED" : n <= 7 ? `Expires in ${n} day(s)` : "Valid";
};

export default function Home() {
  const [tab, setTab] = useState("AI Inspection");
  const [batches, setBatches] = useState<any[]>([]);
  const [ships, setShips] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const blank = { id: "", product: "", source: "", unit: "kg", good: "", bad: "", incidents: "", mfg: "", temp: "", expiry: "" };
  const [bf, setBf] = useState<any>(blank);
  const [sb, setSb] = useState("");
  const [rows, setRows] = useState<any[]>([{ company: "", address: "", qty: "" }]);
  const [note, setNote] = useState("");
  const blankSale = { customer: "", address: "", batchId: "", qty: "", price: "" };
  const [sf, setSf] = useState<any>(blankSale);
  const [insFile, setInsFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [insErr, setInsErr] = useState("");
  const [inv, setInv] = useState<any>({ batchId: "", source: "", good: "", bad: "", recDate: "" });
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [prodDone, setProdDone] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showN, setShowN] = useState(true);
  const [prod, setProd] = useState<any>({ batchId: "", line: "LINE-01", date: "", expiry: "", incidents: "" });

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem("erp_v2") || "{}");
      setBatches(d.b || []); setShips(d.s || []); setSales(d.v || []);
      setAlerts(JSON.parse(localStorage.getItem("erp_alerts") || "[]"));
    } catch {}
  }, []);

  const persist = (b: any[], s: any[], v: any[] = sales) => {
    setBatches(b); setShips(s); setSales(v);
    try { localStorage.setItem("erp_v2", JSON.stringify({ b, s, v })); } catch {}
  };
  const shippedOf = (id: string) => ships.filter((s) => s.batchId === id).reduce((a, s) => a + s.qty, 0);
  const availOf = (b: any) => b.good - shippedOf(b.id);
  const up = (k: string, v: string) => setBf({ ...bf, [k]: v });
  const go = (code: string) => { setQ(code); setTab("Traceability"); setMsg(""); };

  const saveAlerts = (next: any[]) => {
    setAlerts(next);
    try { localStorage.setItem("erp_alerts", JSON.stringify(next)); } catch {}
  };
  const addAlert = (text: string) => saveAlerts([{ id: Date.now(), text, time: new Date().toISOString() }, ...alerts].slice(0, 30));

  const addBatch = () => {
    setJustAdded(null);
    if (result && result.yield_pct < 25) return setMsg("The AI yield is below 25%, so this batch cannot be created. Discard the result and inspect again.");
    const id = clean(bf.id) || `B${day()}${String(batches.length + 1).padStart(3, "0")}`;
    if (!bf.product.trim()) return setMsg("Enter the raw material name.");
    if (batches.some((b) => b.id === id)) return setMsg("That batch barcode already exists.");
    const b = {
      id, product: bf.product.trim(), source: "", unit: bf.unit.trim() || "units", good: result ? result.good_products : 0, bad: result ? result.bad_products : 0,
      inspection: result ? { time: new Date().toISOString(), total: result.total_products, yield: result.yield_pct, defects: result.defects, confidence: result.confidence, mode: result.mode } : undefined,
      incidents: bf.incidents.trim(), mfg: bf.mfg, expiry: "", created: new Date().toISOString(),
    };
    persist([b, ...batches], ships);
    setBf(blank);
    setJustAdded(id);
    setMsg(`Barcode ${id} generated for ${b.product}.${result ? ` AI counts attached: ${result.good_products} good, ${result.bad_products} bad.` : ""}`);
    setResult(null); pickFile(null);
  };

  const createShips = () => {
    const b = batches.find((x) => x.id === sb);
    if (!b) return setMsg("Select a batch first.");
    if (b.expiry && new Date(b.expiry) < new Date()) return setMsg("This batch has expired and cannot be shipped.");
    const valid = rows.filter((r) => r.company.trim() && +r.qty > 0);
    if (!valid.length) return setMsg("Add at least one company with a quantity.");
    const total = valid.reduce((a, r) => a + +r.qty, 0);
    if (total > availOf(b)) return setMsg(`Only ${availOf(b)} good products are available in this batch.`);
    const t = new Date().toISOString();
    const made = valid.map((r, i) => ({
      id: `S${day()}${String(ships.length + i + 1).padStart(3, "0")}`, batchId: b.id,
      company: r.company.trim(), address: r.address.trim(), qty: +r.qty, status: "Packed",
      history: [{ status: "Packed", time: t, note: "Shipment created" }],
    }));
    persist(batches, [...made, ...ships]);
    setRows([{ company: "", address: "", qty: "" }]);
    setMsg(`Created ${made.length} shipment barcode(s): ${made.map((m) => m.id).join(", ")}`);
  };

  const pickFile = (f: File | null) => {
    setInsFile(f); setResult(null); setInsErr("");
    setPreview(f ? URL.createObjectURL(f) : "");
  };
  const runInspection = async () => {
    if (!insFile) return;
    setBusy(true); setInsErr("");
    try {
      const fd = new FormData();
      fd.append("image", insFile); fd.append("batch_id", "PENDING");
      const r = await fetch("/api/inspect", { method: "POST", body: fd });
      if (!r.ok) throw new Error("API error " + r.status);
      const data = await r.json();
      setResult(data);
      if (data.yield_pct < 25) addAlert(`AI inspection yield ${data.yield_pct}% is below 25% (${data.good_products} good, ${data.bad_products} bad). Batch cannot proceed.`);
    } catch (e: any) { setInsErr(e.message); }
    setBusy(false);
  };
  const pickInv = (id: string) => {
    const b = batches.find((x) => x.id === id);
    setInv({ batchId: id, source: b?.source || "", good: b ? String(b.good) : "", bad: b ? String(b.bad) : "", recDate: b?.mfg || "" });
  };
  const saveInv = () => {
    const b = batches.find((x) => x.id === inv.batchId);
    if (!b) return setMsg("Select a batch first.");
    const good = +inv.good || 0;
    if (good < shippedOf(b.id)) return setMsg(`Good quantity can't be lower than the ${shippedOf(b.id)} already shipped.`);
    persist(batches.map((x) => x.id === b.id ? { ...x, source: inv.source.trim(), good, bad: +inv.bad || 0, mfg: inv.recDate } : x), ships);
    setMsg(`Inventory saved for batch ${b.id}. Now enter the production details.`);
    pickProd(b.id); setTab("Production");
  };

  const pickProd = (id: string) => {
    setProdDone(null);
    const b = batches.find((x) => x.id === id);
    setProd({ batchId: id, line: b?.prod?.line || "LINE-01", date: b?.prod?.date || "", expiry: b?.expiry || "", incidents: b?.prod?.incidents || "" });
  };
  const saveProd = () => {
    setProdDone(null);
    const b = batches.find((x) => x.id === prod.batchId);
    if (!b) return setMsg("Select a batch first.");
    if (prod.date && prod.expiry && prod.expiry < prod.date) return setMsg("Expiry date must be after the manufacturing date.");
    const pid = b.prod?.id || `PRD${day()}${String(batches.filter((x) => x.prod?.id).length + 1).padStart(3, "0")}`;
    persist(batches.map((x) => x.id === b.id ? { ...x, expiry: prod.expiry, prod: { id: pid, line: prod.line, date: prod.date, incidents: prod.incidents.trim(), time: new Date().toISOString() } } : x), ships);
    setProdDone(pid);
    setMsg(`Production barcode ${pid} generated for batch ${b.id}.`);
  };

  const createSale = () => {
    const b = batches.find((x) => x.id === sf.batchId);
    const qty = +sf.qty, price = +sf.price || 0;
    if (!sf.customer.trim()) return setMsg("Enter the customer name.");
    if (!b) return setMsg("Select a batch to sell from.");
    if (b.expiry && new Date(b.expiry) < new Date()) return setMsg("This batch has expired and cannot be sold.");
    if (!(qty > 0)) return setMsg("Enter a quantity.");
    if (qty > availOf(b)) return setMsg(`Only ${availOf(b)} ${b.unit || ""} available in this batch.`);
    const t = new Date().toISOString();
    const saleId = `INV${day()}${String(sales.length + 1).padStart(3, "0")}`;
    const shipId = `S${day()}${String(ships.length + 1).padStart(3, "0")}`;
    const ship = { id: shipId, batchId: b.id, company: sf.customer.trim(), address: sf.address.trim(), qty, status: "Packed", saleId,
      history: [{ status: "Packed", time: t, note: "Created from invoice " + saleId }] };
    const sale = { id: saleId, customer: sf.customer.trim(), address: sf.address.trim(), batchId: b.id, qty, price, total: qty * price, shipId, created: t };
    persist(batches, [ship, ...ships], [sale, ...sales]);
    setSf(blankSale);
    setMsg(`Invoice ${saleId} created with shipment barcode ${shipId}. Stock reduced.`);
  };

  const advance = (id: string, status: string) => {
    persist(batches, ships.map((s) => s.id === id
      ? { ...s, status, history: [...s.history, { status, time: new Date().toISOString(), note }] } : s));
    setNote("");
  };

  const codes = [
    ...batches.map((b) => ({ code: b.id, kind: "Batch", label: `${b.product} ${b.source || ""}` })),
    ...batches.filter((b) => b.prod?.id).map((b) => ({ code: b.prod.id, kind: "Production", label: `${b.product} ${b.prod.line}` })),
    ...ships.map((x) => ({ code: x.id, kind: "Shipment", label: x.company })),
    ...sales.map((v) => ({ code: v.id, kind: "Invoice", label: v.customer })),
  ];
  const ql = q.trim().toLowerCase();
  const qc = ql.replace(/[*\s]/g, "");
  const matches = qc ? codes.filter((c) => c.code.toLowerCase().includes(qc) || c.label.toLowerCase().includes(ql)) : [];
  const key = codes.some((c) => c.code === clean(q)) ? clean(q) : matches.length === 1 ? matches[0].code : clean(q);
  const fb = batches.find((b) => b.id === key);
  const fp = !fb ? batches.find((b) => b.prod?.id === key) : null;
  const fv = !fb ? sales.find((v) => v.id === key) : null;
  const fs = !fb ? ships.find((s) => s.id === key || (fv && s.id === fv.shipId)) : null;
  const sale = fs && fs.saleId ? sales.find((v) => v.id === fs.saleId) : null;
  const parent = fs ? batches.find((b) => b.id === fs.batchId) : null;
  const tGood = batches.reduce((a, b) => a + b.good, 0);
  const tBad = batches.reduce((a, b) => a + b.bad, 0);
  const expNotes = batches.filter((b) => b.expiry && expiry(b.expiry) !== "Valid");
  const nCount = alerts.length + expNotes.length;
  const revenue = sales.reduce((a, v) => a + v.total, 0);
  const byCust: Record<string, any> = {};
  sales.forEach((v) => { const c = byCust[v.customer] || (byCust[v.customer] = { qty: 0, total: 0, n: 0 }); c.qty += v.qty; c.total += v.total; c.n++; });

  return (
    <>
      <style>{`
        select,textarea{font:inherit;padding:9px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);width:100%}
        .f{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
        .f label,.lbl{font-size:12px;color:var(--mute);display:block;margin-bottom:3px}
        .sm{width:auto;margin:0;padding:4px 10px;font-size:12px}
        .kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:12px 0}
        .r3{display:grid;grid-template-columns:1.2fr 1.6fr .6fr;gap:8px;margin-bottom:8px}
        @media(max-width:700px){.f,.r3{grid-template-columns:1fr}}
        .img{position:relative;display:inline-block;max-width:100%}.img img{max-width:100%;display:block;border-radius:8px}
        .box{position:absolute;border:2px solid;font-size:10px;color:#fff}.box span{position:absolute;top:-16px;left:-2px;padding:0 4px}
        .box.good{border-color:var(--good)}.box.good span{background:var(--good)}.box.bad{border-color:var(--bad)}.box.bad span{background:var(--bad)}
      `}</style>
      <header>
        <h1>Cloud ERP · Batch &amp; Shipment Barcodes</h1>
        <button className="sm" style={{ background: "var(--bad)" }}
          onClick={() => { if (confirm("Clear all data?")) { persist([], [], []); setAlerts([]); try { localStorage.removeItem("erp_alerts"); } catch {} } }}>Reset data</button>
      </header>
      <main>
        <div className="stats" style={{ marginBottom: 0 }}>
          <div className="stat"><b>{batches.length}</b><span>Batch barcodes</span></div>
          <div className="stat"><b className="good">{tGood}</b><span>Good quantity</span></div>
          <div className="stat"><b className="bad">{tBad}</b><span>Bad quantity</span></div>
          <div className="stat"><b>{ships.length}</b><span>Shipment barcodes</span></div>
        </div>

        <input value={q} style={{ fontSize: 16, padding: 12 }}
          onChange={(e) => { setQ(e.target.value); if (e.target.value.trim()) { setTab("Traceability"); setMsg(""); } }}
          placeholder="Search or scan any barcode: batch, shipment or invoice (name search also works)" />

        {nCount > 0 && (
          <div className="card" style={{ borderColor: "var(--bad)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b>🔔 Notifications ({nCount})</b>
              <button className="sm" onClick={() => setShowN(!showN)}>{showN ? "Hide" : "Show"}</button>
            </div>
            {showN && (
              <div style={{ marginTop: 8 }}>
                {alerts.map((a) => (
                  <div key={a.id} className="bad" style={{ marginBottom: 6 }}>
                    ⚠ {a.text} <span className="mute">{new Date(a.time).toLocaleString()}</span>{" "}
                    <button className="sm" onClick={() => saveAlerts(alerts.filter((x) => x.id !== a.id))}>Dismiss</button>
                  </div>
                ))}
                {expNotes.map((b) => (
                  <div key={b.id} style={{ marginBottom: 6 }}>
                    ⏰ Batch <a href="#" onClick={(e) => { e.preventDefault(); go(b.id); }}>{b.id}</a> · {b.product}: <b>{expiry(b.expiry)}</b> (expiry {b.expiry})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["AI Inspection", "Batches", "Inventory", "Production", "Shipping", "Sales", "Traceability"].map((t) => (
            <button key={t} onClick={() => { setTab(t); setMsg(""); }}
              style={{ width: "auto", marginTop: 0, background: tab === t ? "var(--acc)" : "var(--card)", color: tab === t ? "#fff" : "var(--ink)", border: "1px solid var(--line)" }}>
              {t}
            </button>
          ))}
        </div>
        {msg && tab !== "Batches" && !(tab === "Production" && prodDone) && <div className="card" style={{ borderColor: "var(--acc)" }}>{msg}</div>}

        {tab === "Batches" && (
          <>
            <section className="card">
              <h2>Receive a raw material batch (one barcode per batch)</h2>
              <div className="f">
                <div><label>Raw material name</label><input value={bf.product} onChange={(e) => up("product", e.target.value)} placeholder="e.g. Tomatoes" /></div>
                <div><label>Unit (kg, litre, pcs...)</label><input value={bf.unit} onChange={(e) => up("unit", e.target.value)} /></div>
                <div><label>Receiving date</label><input type="date" value={bf.mfg} onChange={(e) => up("mfg", e.target.value)} /></div>
                <div><label>Batch number (optional, auto if empty)</label><input value={bf.id} onChange={(e) => up("id", e.target.value)} placeholder="B260930001" /></div>
              </div>
              <label className="lbl">Receiving incidents (damage, delays, complaints...)</label>
              <textarea rows={2} value={bf.incidents} onChange={(e) => up("incidents", e.target.value)} />
              <button onClick={addBatch}>Generate barcode</button>
              {msg && (
                <div style={{ marginTop: 12 }}>
                  <p className={justAdded ? "" : "bad"}>{msg}</p>
                  {justAdded && (
                    <>
                      <Barcode value={justAdded} />
                      <button onClick={() => { pickInv(justAdded); setTab("Inventory"); setMsg(""); }}>Proceed to Inventory</button>
                    </>
                  )}
                </div>
              )}
              {result && !msg && <p className={result.yield_pct < 25 ? "bad" : "mute"}>AI inspection ready: {result.good_products} good, {result.bad_products} bad (yield {result.yield_pct}%). These counts will be attached to the new batch.</p>}
            </section>
            <section className="card">
              <h2>Received batches</h2>
              {batches.length === 0 ? <p className="mute">No batches yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Barcode</th><th>Raw material</th><th>Receiving date</th><th>Incidents</th><th>Inspection</th><th></th></tr></thead>
                    <tbody>
                      {batches.map((b) => (
                        <tr key={b.id}>
                          <td>{b.id}</td><td>{b.product}</td><td>{b.mfg || "-"}</td><td>{b.incidents || "-"}</td><td><span className="tag">{b.inspection ? "Inspected" : "Pending"}</span></td><td><button className="sm" onClick={() => go(b.id)}>View barcode</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "AI Inspection" && (
          <div className="grid">
            <section className="card">
              <h2>1. Upload an image of the received batch</h2>
              <input type="file" accept="image/*" style={{ marginTop: 10 }} onChange={(e) => pickFile(e.target.files?.[0] || null)} />
              <button disabled={!insFile || busy} onClick={runInspection}>{busy ? "Inspecting…" : "Run AI inspection"}</button>
              {insErr && <p className="bad">{insErr}</p>}
            </section>
            <section className="card">
              <h2>2. Result</h2>
              {!preview && <p className="mute">Upload an image to begin.</p>}
              {preview && (
                <div className="img">
                  <img src={preview} alt="upload" />
                  {result?.detections.map((d: any, i: number) => (
                    <div key={i} className={`box ${d.status}`}
                      style={{ left: `${d.box[0] * 100}%`, top: `${d.box[1] * 100}%`, width: `${d.box[2] * 100}%`, height: `${d.box[3] * 100}%` }}>
                      <span>{d.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {result && (
                <>
                  <div className="stats" style={{ marginTop: 12 }}>
                    <div className="stat"><b>{result.total_products}</b><span>Total</span></div>
                    <div className="stat"><b className="good">{result.good_products}</b><span>Good</span></div>
                    <div className="stat"><b className="bad">{result.bad_products}</b><span>Bad</span></div>
                    <div className="stat"><b>{result.yield_pct}%</b><span>Yield</span></div>
                  </div>
                  <p className="mute">Defects: {Object.keys(result.defects).length ? Object.entries(result.defects).map(([k, v]) => `${k} ×${v}`).join(", ") : "none"} · confidence {result.confidence} · mode <span className="tag">{result.mode}</span></p>
                  {result.yield_pct > 50 && (
                    <>
                      <p className="good"><b>Pass:</b> yield {result.yield_pct}% is above 50%. This batch can proceed.</p>
                      <button onClick={() => { setTab("Batches"); setMsg(""); }}>Proceed to Batches</button>
                    </>
                  )}
                  {result.yield_pct >= 25 && result.yield_pct <= 50 && (
                    <>
                      <p style={{ color: "#d97706" }}><b>Caution:</b> yield {result.yield_pct}% is between 25% and 50%. Review is needed before it proceeds.</p>
                      <button onClick={() => { if (confirm("Yield is only " + result.yield_pct + "%. Proceed anyway?")) { setTab("Batches"); setMsg(""); } }}>Proceed anyway</button>
                    </>
                  )}
                  {result.yield_pct < 25 && (
                    <>
                      <p className="bad"><b>Alert:</b> yield {result.yield_pct}% is below 25%. QC has been notified (see Notifications). This batch cannot proceed.</p>
                      <button onClick={() => pickFile(null)}>Discard result &amp; re-upload</button>
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {tab === "Inventory" && (
          <>
            <section className="card">
              <h2>Update inventory for a batch</h2>
              <label className="lbl">Batch</label>
              <select value={inv.batchId} onChange={(e) => pickInv(e.target.value)}>
                <option value="">Select batch</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.product}</option>)}
              </select>
              <div className="f" style={{ marginTop: 10 }}>
                <div><label>Comes from (supplier / farm / origin)</label><input value={inv.source} onChange={(e) => setInv({ ...inv, source: e.target.value })} /></div>
                <div><label>Material receiving date</label><input type="date" value={inv.recDate} onChange={(e) => setInv({ ...inv, recDate: e.target.value })} /></div>
                <div><label>Good quantity</label><input type="number" min="0" value={inv.good} onChange={(e) => setInv({ ...inv, good: e.target.value })} /></div>
                <div><label>Bad quantity</label><input type="number" min="0" value={inv.bad} onChange={(e) => setInv({ ...inv, bad: e.target.value })} /></div>
              </div>
              <button onClick={saveInv}>Submit</button>
              <p className="mute">Submit saves this inventory record and takes you to Production.</p>
            </section>
            <section className="card">
              <h2>Inventory</h2>
              {batches.length === 0 ? <p className="mute">No batches yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Barcode</th><th>Raw material</th><th>Comes from</th><th>Good</th><th>Bad</th><th>Total</th><th>Available</th><th>Material receiving date</th><th></th></tr></thead>
                    <tbody>
                      {batches.map((b) => (
                        <tr key={b.id}>
                          <td>{b.id}</td><td>{b.product}</td><td>{b.source || "-"}</td>
                          <td className="good">{b.good} {b.unit}</td><td className="bad">{b.bad} {b.unit}</td><td>{b.good + b.bad} {b.unit}</td><td>{availOf(b)} {b.unit}</td>
                          <td>{b.mfg || "-"}</td>
                          <td><button className="sm" onClick={() => pickInv(b.id)}>Edit</button> <button className="sm" onClick={() => go(b.id)}>Barcode</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "Production" && (
          <>
            <section className="card">
              <h2>Production details for a batch</h2>
              <label className="lbl">Batch</label>
              <select value={prod.batchId} onChange={(e) => pickProd(e.target.value)}>
                <option value="">Select batch</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.product}</option>)}
              </select>
              <div className="f" style={{ marginTop: 10 }}>
                <div><label>Production line</label>
                  <select value={prod.line} onChange={(e) => setProd({ ...prod, line: e.target.value })}>
                    {["LINE-01", "LINE-02", "LINE-03"].map((l) => <option key={l}>{l}</option>)}
                  </select></div>
                <div><label>Manufacturing date</label><input type="date" value={prod.date} onChange={(e) => setProd({ ...prod, date: e.target.value })} /></div>
                <div><label>Expiry date</label><input type="date" value={prod.expiry} onChange={(e) => setProd({ ...prod, expiry: e.target.value })} /></div>
              </div>
              <label className="lbl">Incidents during production (breakdowns, contamination, delays...)</label>
              <textarea rows={3} value={prod.incidents} onChange={(e) => setProd({ ...prod, incidents: e.target.value })} />
              <button onClick={saveProd}>Submit</button>
              {prodDone && msg && (
                <div style={{ marginTop: 12 }}>
                  <p>{msg}</p>
                  <Barcode value={prodDone} />
                  <button onClick={() => { setTab("Shipping"); setMsg(""); }}>Proceed to Shipping</button>
                </div>
              )}
            </section>
            <section className="card">
              <h2>Production records</h2>
              {batches.length === 0 ? <p className="mute">No batches yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Batch barcode</th><th>Production barcode</th><th>Raw material</th><th>Line</th><th>Manufacturing date</th><th>Expiry</th><th>Incidents</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {batches.map((b) => (
                        <tr key={b.id}>
                          <td>{b.id}</td><td>{b.prod?.id ? <a href="#" onClick={(e) => { e.preventDefault(); go(b.prod.id); }}>{b.prod.id}</a> : "-"}</td><td>{b.product}</td><td>{b.prod?.line || "-"}</td><td>{b.prod?.date || "-"}</td><td>{b.expiry || "-"} {b.expiry && <span className="tag">{expiry(b.expiry)}</span>}</td><td>{b.prod?.incidents || "-"}</td>
                          <td><span className="tag">{b.prod ? "Produced" : "Pending"}</span></td>
                          <td><button className="sm" onClick={() => pickProd(b.id)}>Edit</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "Shipping" && (
          <>
            <section className="card">
              <h2>Ship a batch to one or more companies</h2>
              <label className="lbl">Batch</label>
              <select value={sb} onChange={(e) => setSb(e.target.value)}>
                <option value="">Select batch</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.product} · {availOf(b)} {b.unit} available</option>)}
              </select>
              <p className="lbl" style={{ marginTop: 12 }}>Destination companies (each gets its own shipment barcode)</p>
              {rows.map((r, i) => (
                <div className="r3" key={i}>
                  <input placeholder="Company name" value={r.company} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, company: e.target.value } : x))} />
                  <input placeholder="Address / city" value={r.address} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, address: e.target.value } : x))} />
                  <input type="number" min="1" placeholder="Qty" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="sm" style={{ background: "var(--card)", color: "var(--ink)", border: "1px solid var(--line)" }}
                  onClick={() => setRows([...rows, { company: "", address: "", qty: "" }])}>+ Add company</button>
                {rows.length > 1 && <button className="sm" style={{ background: "var(--card)", color: "var(--ink)", border: "1px solid var(--line)" }}
                  onClick={() => setRows(rows.slice(0, -1))}>Remove last</button>}
              </div>
              <button onClick={createShips}>Create shipments &amp; barcodes</button>
            </section>
            <section className="card">
              <h2>All shipments</h2>
              {ships.length === 0 ? <p className="mute">No shipments yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Shipment barcode</th><th>Batch</th><th>Company</th><th>Destination</th><th>Qty</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {ships.map((s) => (
                        <tr key={s.id}>
                          <td>{s.id}</td><td>{s.batchId}</td><td>{s.company}</td><td>{s.address || "-"}</td><td>{s.qty}</td>
                          <td><span className="tag">{s.status}</span></td>
                          <td><button className="sm" onClick={() => go(s.id)}>Track</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "Sales" && (
          <>
            <div className="stats" style={{ marginBottom: 0 }}>
              <div className="stat"><b>{revenue.toFixed(2)}</b><span>Total revenue</span></div>
              <div className="stat"><b>{sales.length}</b><span>Invoices</span></div>
              <div className="stat"><b>{sales.reduce((a, v) => a + v.qty, 0)}</b><span>Quantity sold</span></div>
              <div className="stat"><b>{Object.keys(byCust).length}</b><span>Customers</span></div>
            </div>
            <section className="card">
              <h2>New sale (creates an invoice and a shipment barcode)</h2>
              <div className="f">
                <div><label>Customer / company</label><input value={sf.customer} onChange={(e) => setSf({ ...sf, customer: e.target.value })} /></div>
                <div><label>Delivery address</label><input value={sf.address} onChange={(e) => setSf({ ...sf, address: e.target.value })} /></div>
                <div><label>Batch to sell from</label>
                  <select value={sf.batchId} onChange={(e) => setSf({ ...sf, batchId: e.target.value })}>
                    <option value="">Select batch</option>
                    {batches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.product} · {availOf(b)} {b.unit} available</option>)}
                  </select></div>
                <div><label>Quantity</label><input type="number" min="1" value={sf.qty} onChange={(e) => setSf({ ...sf, qty: e.target.value })} /></div>
                <div><label>Price per unit</label><input type="number" min="0" value={sf.price} onChange={(e) => setSf({ ...sf, price: e.target.value })} /></div>
              </div>
              <button onClick={createSale}>Create invoice &amp; shipment</button>
            </section>
            <section className="card">
              <h2>Invoices</h2>
              {sales.length === 0 ? <p className="mute">No sales yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Raw material</th><th>Qty</th><th>Price</th><th>Total</th><th>Shipment</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {sales.map((v) => (
                        <tr key={v.id}>
                          <td>{v.id}</td><td>{new Date(v.created).toLocaleDateString()}</td><td>{v.customer}</td>
                          <td>{batches.find((b) => b.id === v.batchId)?.product || v.batchId}</td>
                          <td>{v.qty}</td><td>{v.price}</td><td>{v.total.toFixed(2)}</td><td>{v.shipId}</td>
                          <td><span className="tag">{ships.find((x) => x.id === v.shipId)?.status}</span></td>
                          <td><button className="sm" onClick={() => go(v.id)}>Trace</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {sales.length > 0 && (
              <section className="card">
                <h2>Sales by customer</h2>
                <table>
                  <thead><tr><th>Customer</th><th>Invoices</th><th>Quantity</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {Object.entries(byCust).map(([name, c]: any) => (
                      <tr key={name}><td>{name}</td><td>{c.n}</td><td>{c.qty}</td><td>{c.total.toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}

        {tab === "Traceability" && (
          <section className="card">
            <h2>Trace by batch, shipment or invoice barcode</h2>
            
            <p className="mute">Recent: {[...batches.slice(0, 3).map((b) => b.id), ...ships.slice(0, 3).map((s) => s.id), ...sales.slice(0, 2).map((v) => v.id)].map((c) => (
              <a key={c} href="#" style={{ marginRight: 10 }} onClick={(e) => { e.preventDefault(); setQ(c); }}>{c}</a>
            ))}</p>

            {fb && (
              <div>
                <h2>Batch {fb.id}</h2>
                <p><span className="tag">BATCH</span> {fb.product} · {availOf(fb)} {fb.unit} in stock · expiry: {expiry(fb.expiry)}</p>
                <Barcode value={fb.id} />
                <div><button className="sm" style={{ marginTop: 8 }} onClick={() => printLabel(fb.id, [fb.product, "Batch " + fb.id, "Received " + fb.mfg, "Expiry " + fb.expiry])}>Print label</button></div>
                <div className="kv">
                  <Field k="Raw material" v={fb.product} /><Field k="Comes from" v={fb.source} />
                  <Field k="Good quantity" v={`${fb.good} ${fb.unit || ""}`} /><Field k="Bad quantity" v={`${fb.bad} ${fb.unit || ""}`} />
                  <Field k="Total in batch" v={`${fb.good + fb.bad} ${fb.unit || ""}`} /><Field k="Available to ship" v={`${availOf(fb)} ${fb.unit || ""}`} /><Field k="Shipped to customers" v={`${shippedOf(fb.id)} ${fb.unit || ""}`} /><Field k="Customers reached" v={new Set(ships.filter((x) => x.batchId === fb.id).map((x) => x.company)).size} /><Field k="AI inspection" v={fb.inspection ? `${fb.inspection.total} items checked, yield ${fb.inspection.yield ?? "-"}%, confidence ${fb.inspection.confidence}` : "Not done"} />
                  <Field k="Receiving date" v={fb.mfg} /><Field k="Expiry date" v={fb.expiry ? `${fb.expiry} (${expiry(fb.expiry)})` : ""} />
                  <Field k="Receiving incidents" v={fb.incidents} /><Field k="Production barcode" v={fb.prod?.id} /><Field k="Production line" v={fb.prod?.line} /><Field k="Manufacturing date" v={fb.prod?.date} /><Field k="Production incidents" v={fb.prod?.incidents} />
                </div>
                <h2>Forward trace: who received this batch</h2>
                <button className="sm" style={{ marginBottom: 8 }} onClick={() => printReport("Recall report: " + fb.id + " " + fb.product, ["Company", "Destination", "Qty", "Invoice", "Shipment", "Status"], ships.filter((x) => x.batchId === fb.id).map((x) => [x.company, x.address || "-", x.qty, x.saleId || "-", x.id, x.status]))}>Print recall report</button>
                {ships.filter((s) => s.batchId === fb.id).length === 0 ? <p className="mute">Not shipped yet.</p> : (
                  <table>
                    <thead><tr><th>Shipment barcode</th><th>Company</th><th>Destination</th><th>Qty</th><th>Invoice</th><th>Status</th></tr></thead>
                    <tbody>
                      {ships.filter((s) => s.batchId === fb.id).map((s) => (
                        <tr key={s.id}><td><a href="#" onClick={(e) => { e.preventDefault(); setQ(s.id); }}>{s.id}</a></td><td>{s.company}</td><td>{s.address || "-"}</td><td>{s.qty}</td><td>{s.saleId || "-"}</td><td><span className="tag">{s.status}</span></td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {fs && (
              <div>
                <h2>{fv ? "Invoice " + fv.id + " → " : ""}Shipment {fs.id}</h2>
                <p><span className="tag">SHIPMENT</span> to {fs.company} · quantity {fs.qty} · status: {fs.status}</p>
                <Barcode value={fs.id} />
                <div><button className="sm" style={{ marginTop: 8 }} onClick={() => printLabel(fs.id, ["To: " + fs.company, fs.address, "Qty " + fs.qty, "Batch " + fs.batchId])}>Print label</button></div>
                <div className="kv">
                  <Field k="Company" v={fs.company} /><Field k="Destination" v={fs.address} />
                  <Field k="Quantity" v={fs.qty} /><Field k="Status" v={fs.status} />
                  <Field k="Raw material" v={parent?.product} />
                  <Field k="Comes from" v={parent?.source} /><Field k="Receiving date" v={parent?.mfg} />
                  <Field k="Expiry date" v={parent?.expiry} /><Field k="Production line" v={parent?.prod?.line} />
                  <Field k="Receiving incidents" v={parent?.incidents} /><Field k="Production incidents" v={parent?.prod?.incidents} /><Field k="Invoice" v={fs.saleId} />
                  <Field k="Sale value" v={sale ? sale.total.toFixed(2) : ""} />
                </div>
                <p><b>{parent?.source || "Source"}</b> → batch {fs.batchId} → shipment {fs.id} → <b>{fs.company}</b></p>
                <p className="mute">Source batch: <a href="#" onClick={(e) => { e.preventDefault(); setQ(fs.batchId); }}>{fs.batchId}</a></p>
                <h2>Update tracking</h2>
                <input placeholder="Note / location (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {STATUSES.map((st) => (
                    <button key={st} className="sm" disabled={fs.status === st} onClick={() => advance(fs.id, st)}>{st}</button>
                  ))}
                </div>
                <div style={{ borderLeft: "2px solid var(--line)", paddingLeft: 14, marginTop: 14 }}>
                  {[...fs.history].reverse().map((h: any, i: number) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <b>{h.status}</b>
                      <div className="mute">{new Date(h.time).toLocaleString()}{h.note ? " · " + h.note : ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fp && (
              <div>
                <h2>Production {fp.prod.id}</h2>
                <p><span className="tag">PRODUCTION</span> {fp.product} · line {fp.prod.line} · {fp.prod.date || "no date"}</p>
                <Barcode value={fp.prod.id} />
                <div><button className="sm" style={{ marginTop: 8 }} onClick={() => printLabel(fp.prod.id, ["Production " + fp.prod.id, fp.product, "Batch " + fp.id, "Line " + fp.prod.line, "Mfg " + fp.prod.date])}>Print label</button></div>
                <div className="kv">
                  <Field k="Production line" v={fp.prod.line} /><Field k="Manufacturing date" v={fp.prod.date} />
                  <Field k="Production incidents" v={fp.prod.incidents} /><Field k="Raw material" v={fp.product} />
                  <Field k="Comes from" v={fp.source} /><Field k="Receiving date" v={fp.mfg} />
                  <Field k="Expiry date" v={fp.expiry ? `${fp.expiry} (${expiry(fp.expiry)})` : ""} />
                  <Field k="Good / bad" v={`${fp.good} / ${fp.bad} ${fp.unit || ""}`} />
                </div>
                <p className="mute">Source batch: <a href="#" onClick={(e) => { e.preventDefault(); setQ(fp.id); }}>{fp.id}</a></p>
              </div>
            )}

            {!fb && !fs && !fp && matches.length > 1 && (
              <div style={{ marginTop: 10 }}>
                <p className="mute">{matches.length} matches. Pick one:</p>
                {matches.slice(0, 8).map((c) => (
                  <div key={c.code} style={{ marginBottom: 6 }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setQ(c.code); }}>{c.code}</a>{" "}
                    <span className="tag">{c.kind}</span> <span className="mute">{c.label}</span>
                  </div>
                ))}
              </div>
            )}
            {q.trim() && !fb && !fs && !fp && matches.length === 0 && <p className="bad">No batch, production, shipment or invoice found for “{q}”.</p>}
          </section>
        )}
      </main>
    </>
  );
}

