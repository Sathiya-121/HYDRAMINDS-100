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
  const [tab, setTab] = useState("Batches");
  const [batches, setBatches] = useState<any[]>([]);
  const [ships, setShips] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const blank = { id: "", product: "", source: "", good: "", bad: "", incidents: "", mfg: "", temp: "", expiry: "" };
  const [bf, setBf] = useState<any>(blank);
  const [sb, setSb] = useState("");
  const [rows, setRows] = useState<any[]>([{ company: "", address: "", qty: "" }]);
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem("erp_v2") || "{}");
      setBatches(d.b || []); setShips(d.s || []);
    } catch {}
  }, []);

  const persist = (b: any[], s: any[]) => {
    setBatches(b); setShips(s);
    try { localStorage.setItem("erp_v2", JSON.stringify({ b, s })); } catch {}
  };
  const shippedOf = (id: string) => ships.filter((s) => s.batchId === id).reduce((a, s) => a + s.qty, 0);
  const availOf = (b: any) => b.good - shippedOf(b.id);
  const up = (k: string, v: string) => setBf({ ...bf, [k]: v });
  const go = (code: string) => { setQ(code); setTab("Track"); setMsg(""); };

  const addBatch = () => {
    const id = clean(bf.id) || `B${day()}${String(batches.length + 1).padStart(3, "0")}`;
    if (!bf.product.trim()) return setMsg("Enter the product name.");
    if (batches.some((b) => b.id === id)) return setMsg("That batch barcode already exists.");
    const b = {
      id, product: bf.product.trim(), source: bf.source.trim(), good: +bf.good || 0, bad: +bf.bad || 0,
      incidents: bf.incidents.trim(), mfg: bf.mfg, temp: bf.temp, expiry: bf.expiry, created: new Date().toISOString(),
    };
    persist([b, ...batches], ships);
    setBf(blank);
    setMsg(`Batch saved. Its barcode is ${id}. Open the Track tab to view or print it.`);
  };

  const createShips = () => {
    const b = batches.find((x) => x.id === sb);
    if (!b) return setMsg("Select a batch first.");
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

  const advance = (id: string, status: string) => {
    persist(batches, ships.map((s) => s.id === id
      ? { ...s, status, history: [...s.history, { status, time: new Date().toISOString(), note }] } : s));
    setNote("");
  };

  const key = clean(q);
  const fb = batches.find((b) => b.id === key);
  const fs = !fb ? ships.find((s) => s.id === key) : null;
  const parent = fs ? batches.find((b) => b.id === fs.batchId) : null;
  const tGood = batches.reduce((a, b) => a + b.good, 0);
  const tBad = batches.reduce((a, b) => a + b.bad, 0);

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
      `}</style>
      <header>
        <h1>Cloud ERP · Batch &amp; Shipment Barcodes</h1>
        <button className="sm" style={{ background: "var(--bad)" }}
          onClick={() => { if (confirm("Clear all data?")) persist([], []); }}>Reset data</button>
      </header>
      <main>
        <div className="stats" style={{ marginBottom: 0 }}>
          <div className="stat"><b>{batches.length}</b><span>Batch barcodes</span></div>
          <div className="stat"><b className="good">{tGood}</b><span>Good products</span></div>
          <div className="stat"><b className="bad">{tBad}</b><span>Bad products</span></div>
          <div className="stat"><b>{ships.length}</b><span>Shipment barcodes</span></div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Batches", "Shipping", "Track"].map((t) => (
            <button key={t} onClick={() => { setTab(t); setMsg(""); }}
              style={{ width: "auto", marginTop: 0, background: tab === t ? "var(--acc)" : "var(--card)", color: tab === t ? "#fff" : "var(--ink)", border: "1px solid var(--line)" }}>
              {t}
            </button>
          ))}
        </div>
        {msg && <div className="card" style={{ borderColor: "var(--acc)" }}>{msg}</div>}

        {tab === "Batches" && (
          <>
            <section className="card">
              <h2>Enter a new batch (one barcode per batch)</h2>
              <div className="f">
                <div><label>Product name</label><input value={bf.product} onChange={(e) => up("product", e.target.value)} placeholder="e.g. Tomato ketchup" /></div>
                <div><label>Comes from (supplier / farm / plant)</label><input value={bf.source} onChange={(e) => up("source", e.target.value)} /></div>
                <div><label>Good products</label><input type="number" min="0" value={bf.good} onChange={(e) => up("good", e.target.value)} /></div>
                <div><label>Bad products</label><input type="number" min="0" value={bf.bad} onChange={(e) => up("bad", e.target.value)} /></div>
                <div><label>Manufacturing date</label><input type="date" value={bf.mfg} onChange={(e) => up("mfg", e.target.value)} /></div>
                <div><label>Expiry date</label><input type="date" value={bf.expiry} onChange={(e) => up("expiry", e.target.value)} /></div>
                <div><label>Room temperature (°C)</label><input type="number" value={bf.temp} onChange={(e) => up("temp", e.target.value)} /></div>
                <div><label>Batch number (optional, auto if empty)</label><input value={bf.id} onChange={(e) => up("id", e.target.value)} placeholder="B260930001" /></div>
              </div>
              <label className="lbl">Incidents (spills, delays, equipment faults, complaints...)</label>
              <textarea rows={2} value={bf.incidents} onChange={(e) => up("incidents", e.target.value)} />
              <button onClick={addBatch}>Save batch &amp; generate barcode</button>
            </section>
            <section className="card">
              <h2>All batches</h2>
              {batches.length === 0 ? <p className="mute">No batches yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Barcode</th><th>Product</th><th>Source</th><th>Good</th><th>Bad</th><th>Total</th><th>Available</th><th>Mfg</th><th>Temp</th><th>Expiry</th><th></th></tr></thead>
                    <tbody>
                      {batches.map((b) => (
                        <tr key={b.id}>
                          <td>{b.id}</td><td>{b.product}</td><td>{b.source || "-"}</td>
                          <td className="good">{b.good}</td><td className="bad">{b.bad}</td><td>{b.good + b.bad}</td><td>{availOf(b)}</td>
                          <td>{b.mfg || "-"}</td><td>{b.temp ? b.temp + "°C" : "-"}</td>
                          <td>{b.expiry || "-"} <span className="tag">{expiry(b.expiry)}</span></td>
                          <td><button className="sm" onClick={() => go(b.id)}>View barcode</button></td>
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
                {batches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.product} · {availOf(b)} available</option>)}
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

        {tab === "Track" && (
          <section className="card">
            <h2>Scan or type a batch / shipment barcode</h2>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. B260930001 or S260930001 (a USB barcode scanner types it for you)" />
            <p className="mute">Recent: {[...batches.slice(0, 3).map((b) => b.id), ...ships.slice(0, 3).map((s) => s.id)].map((c) => (
              <a key={c} href="#" style={{ marginRight: 10 }} onClick={(e) => { e.preventDefault(); setQ(c); }}>{c}</a>
            ))}</p>

            {fb && (
              <div>
                <h2>Batch {fb.id}</h2>
                <Barcode value={fb.id} />
                <div><button className="sm" style={{ marginTop: 8 }} onClick={() => printLabel(fb.id, [fb.product, "Batch " + fb.id, "Mfg " + fb.mfg, "Expiry " + fb.expiry])}>Print label</button></div>
                <div className="kv">
                  <Field k="Product" v={fb.product} /><Field k="Comes from" v={fb.source} />
                  <Field k="Good products" v={fb.good} /><Field k="Bad products" v={fb.bad} />
                  <Field k="Total in batch" v={fb.good + fb.bad} /><Field k="Available to ship" v={availOf(fb)} />
                  <Field k="Manufacturing date" v={fb.mfg} /><Field k="Expiry date" v={fb.expiry ? `${fb.expiry} (${expiry(fb.expiry)})` : ""} />
                  <Field k="Room temperature" v={fb.temp ? fb.temp + " °C" : ""} /><Field k="Incidents" v={fb.incidents} />
                </div>
                <h2>Shipments from this batch</h2>
                {ships.filter((s) => s.batchId === fb.id).length === 0 ? <p className="mute">Not shipped yet.</p> : (
                  <table>
                    <thead><tr><th>Shipment barcode</th><th>Company</th><th>Destination</th><th>Qty</th><th>Status</th></tr></thead>
                    <tbody>
                      {ships.filter((s) => s.batchId === fb.id).map((s) => (
                        <tr key={s.id}><td><a href="#" onClick={(e) => { e.preventDefault(); setQ(s.id); }}>{s.id}</a></td><td>{s.company}</td><td>{s.address || "-"}</td><td>{s.qty}</td><td><span className="tag">{s.status}</span></td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {fs && (
              <div>
                <h2>Shipment {fs.id}</h2>
                <Barcode value={fs.id} />
                <div><button className="sm" style={{ marginTop: 8 }} onClick={() => printLabel(fs.id, ["To: " + fs.company, fs.address, "Qty " + fs.qty, "Batch " + fs.batchId])}>Print label</button></div>
                <div className="kv">
                  <Field k="Company" v={fs.company} /><Field k="Destination" v={fs.address} />
                  <Field k="Quantity" v={fs.qty} /><Field k="Status" v={fs.status} />
                  <Field k="Product" v={parent?.product} />
                  <Field k="Expiry date" v={parent?.expiry} />
                </div>
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

            {key && !fb && !fs && <p className="bad">No batch or shipment found for “{q}”.</p>}
          </section>
        )}
      </main>
    </>
  );
}
