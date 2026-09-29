"use client";
import { useEffect, useState } from "react";

const TABS = ["Inspect", "Production", "Inventory", "Traceability"];
const LINES = ["LINE-01", "LINE-02", "LINE-03"];

export default function Home() {
  const [tab, setTab] = useState("Inspect");
  const [batch, setBatch] = useState("BATCH-2026-00125");
  const [line, setLine] = useState("LINE-01");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem("erp_records") || "[]")); } catch {}
  }, []);

  const save = (h: any[]) => {
    setHistory(h);
    try { localStorage.setItem("erp_records", JSON.stringify(h)); } catch {}
  };

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
      if (!r.ok) throw new Error("API error " + r.status);
      const data = await r.json();
      const k = history.length + 1;
      const items = data.detections.map((d: any, i: number) => ({
        id: `${data.batch_id}-I${k}-P${String(i + 1).padStart(3, "0")}`,
        label: d.label, status: d.status, conf: d.conf,
      }));
      const rec = { ...data, line, operator: "EMP-104", items, inspection_no: k };
      setResult(rec);
      save([rec, ...history].slice(0, 100));
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  const status = (h: any) => (h.yield_pct >= 95 ? "Released" : "Hold for review");
  const totals = history.reduce(
    (a, h) => ({ t: a.t + h.total_products, g: a.g + h.good_products, b: a.b + h.bad_products }),
    { t: 0, g: 0, b: 0 }
  );
  const released = history.filter((h) => status(h) === "Released").reduce((s, h) => s + h.good_products, 0);
  const held = totals.g - released;

  const allItems = history.flatMap((h) => h.items.map((i: any) => ({ ...i, rec: h })));
  const key = q.trim().toLowerCase();
  const itemHit = key ? allItems.find((i) => i.id.toLowerCase() === key) : null;
  const batchHits = key && !itemHit ? history.filter((h) => h.batch_id.toLowerCase() === key) : [];

  const Timeline = ({ h, item }: { h: any; item?: any }) => {
    const bad = item ? item.status === "bad" : h.bad_products > 0;
    const steps = [
      ["Produced", `${h.batch_id} on ${h.line}, operator ${h.operator}`],
      ["AI inspected", `${new Date(h.created).toLocaleString()} · confidence ${item ? item.conf : h.confidence}`],
      ["QC result", item ? (item.status === "good" ? "PASSED" : `REJECTED · ${item.label}`) : `${h.good_products} good / ${h.bad_products} rejected`],
      ["Disposition", item ? (item.status === "good" ? "Accepted to stock" : "Quarantined / scrap") : status(h)],
      ["Inventory", item ? (item.status === "good" && status(h) === "Released" ? "In finished stock" : "Not available for shipment") : `${h.good_products} units moved to stock`],
    ];
    return (
      <div style={{ borderLeft: "2px solid var(--line)", paddingLeft: 14, marginTop: 10 }}>
        {steps.map(([t, d], i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <b className={i === 2 ? (bad ? "bad" : "good") : ""}>{t}</b>
            <div className="mute">{d}</div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <header>
        <h1>Cloud ERP · AI Quality &amp; Traceability</h1>
        <button style={{ width: "auto", marginTop: 0, background: "var(--bad)" }}
          onClick={() => { if (confirm("Clear all records?")) save([]); }}>Reset data</button>
      </header>
      <main>
        <div className="stats" style={{ marginBottom: 0 }}>
          <div className="stat"><b>{history.length}</b><span>Batches inspected</span></div>
          <div className="stat"><b>{totals.t}</b><span>Products checked</span></div>
          <div className="stat"><b className="good">{totals.g}</b><span>Good</span></div>
          <div className="stat"><b className="bad">{totals.b}</b><span>Rejected</span></div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ width: "auto", marginTop: 0, background: tab === t ? "var(--acc)" : "var(--card)", color: tab === t ? "#fff" : "var(--ink)", border: "1px solid var(--line)" }}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Inspect" && (
          <div className="grid">
            <section className="card">
              <h2>Upload product image</h2>
              <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Batch ID" />
              <select value={line} onChange={(e) => setLine(e.target.value)}
                style={{ marginTop: 10, width: "100%", padding: 9, borderRadius: 8, background: "var(--card)", color: "var(--ink)", border: "1px solid var(--line)" }}>
                {LINES.map((l) => <option key={l}>{l}</option>)}
              </select>
              <input type="file" accept="image/*" style={{ marginTop: 10 }} onChange={(e) => pick(e.target.files?.[0] || null)} />
              <button disabled={!file || busy} onClick={inspect}>{busy ? "Inspecting…" : "Run AI inspection"}</button>
              {err && <p className="bad">{err}</p>}
              {result && <p className="mute">Saved to Production, Inventory and Traceability.
                <br />
                <a href="#" onClick={(e) => { e.preventDefault(); setQ(result.batch_id); setTab("Traceability"); }}>View trace →</a></p>}
            </section>
            <section className="card">
              <h2>Result</h2>
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
                <p className="mute" style={{ marginTop: 10 }}>
                  {result.good_products} good · {result.bad_products} rejected · yield {result.yield_pct}% · mode <span className="tag">{result.mode}</span>
                </p>
              )}
            </section>
          </div>
        )}

        {tab === "Production" && (
          <section className="card">
            <h2>Production batches &amp; QC records</h2>
            {history.length === 0 ? <p className="mute">No batches yet. Run an inspection first.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Batch</th><th>Line</th><th>Time</th><th>Produced</th><th>Accepted</th><th>Rejected</th><th>Yield</th><th>Defects</th><th>Status</th></tr></thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td><a href="#" onClick={(e) => { e.preventDefault(); setQ(h.batch_id); setTab("Traceability"); }}>{h.batch_id}</a></td>
                        <td>{h.line}</td><td>{new Date(h.created).toLocaleString()}</td>
                        <td>{h.total_products}</td><td className="good">{h.good_products}</td><td className="bad">{h.bad_products}</td>
                        <td>{h.yield_pct}%</td>
                        <td>{Object.entries(h.defects).map(([k, v]) => `${k}×${v}`).join(", ") || "-"}</td>
                        <td><span className="tag">{status(h)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "Inventory" && (
          <>
            <div className="stats" style={{ marginBottom: 0 }}>
              <div className="stat"><b className="good">{released}</b><span>Finished stock (released)</span></div>
              <div className="stat"><b>{held}</b><span>On hold (yield &lt; 95%)</span></div>
              <div className="stat"><b className="bad">{totals.b}</b><span>Quarantined / scrap</span></div>
              <div className="stat"><b>{totals.t ? ((totals.b / totals.t) * 100).toFixed(1) : 0}%</b><span>Rejection rate</span></div>
            </div>
            <section className="card">
              <h2>Stock by batch</h2>
              {history.length === 0 ? <p className="mute">No stock yet.</p> : (
                <table>
                  <thead><tr><th>Batch</th><th>In stock</th><th>Quarantined</th><th>Availability</th></tr></thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i}><td>{h.batch_id}</td>
                        <td className="good">{status(h) === "Released" ? h.good_products : 0}</td>
                        <td className="bad">{h.bad_products + (status(h) === "Released" ? 0 : h.good_products)}</td>
                        <td><span className="tag">{status(h) === "Released" ? "Ready to ship" : "Blocked"}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}

        {tab === "Traceability" && (
          <section className="card">
            <h2>Trace a batch or product</h2>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Enter batch ID or product ID, e.g. BATCH-2026-00125-I1-P001" />
            <p className="mute">Recent: {history.slice(0, 4).map((h) => (
              <a key={h.batch_id + h.inspection_no} href="#" style={{ marginRight: 10 }}
                onClick={(e) => { e.preventDefault(); setQ(h.batch_id); }}>{h.batch_id}</a>
            ))}</p>

            {itemHit && (
              <div>
                <h2>Product passport: {itemHit.id}</h2>
                <p className="mute">Batch {itemHit.rec.batch_id} · {itemHit.rec.line} · <span className="tag">{itemHit.status === "good" ? "PASSED" : "REJECTED"}</span></p>
                <Timeline h={itemHit.rec} item={itemHit} />
              </div>
            )}

            {batchHits.map((h, i) => (
              <div key={i}>
                <h2>Batch {h.batch_id} · inspection #{h.inspection_no}</h2>
                <Timeline h={h} />
                <p className="mute">Product IDs (click to trace):</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {h.items.map((it: any) => (
                    <a key={it.id} href="#" className="tag" onClick={(e) => { e.preventDefault(); setQ(it.id); }}
                      style={{ color: it.status === "good" ? "var(--good)" : "var(--bad)" }}>{it.id}</a>
                  ))}
                </div>
              </div>
            ))}

            {key && !itemHit && batchHits.length === 0 && <p className="bad">No record found for “{q}”.</p>}
          </section>
        )}
      </main>
    </>
  );
}
