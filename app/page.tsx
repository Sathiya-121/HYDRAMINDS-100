"use client";
import { useEffect, useState } from "react";

type Result = any;

export default function Home() {
  const [batch, setBatch] = useState("BATCH-2026-00125");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem("qc_history") || "[]")); } catch {}
  }, []);

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

  return (
    <>
      <header><h1>Cloud ERP · AI Quality Inspection</h1><span className="mute">Inventory · Production · QC · Traceability</span></header>
      <main>
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
                  <div key={i} className={`box ${d.status}`}
                    style={{ left: `${d.box[0] * 100}%`, top: `${d.box[1] * 100}%`, width: `${d.box[2] * 100}%`, height: `${d.box[3] * 100}%` }}>
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
                  Defects: {Object.keys(result.defects).length ? Object.entries(result.defects).map(([k, v]) => `${k} ×${v}`).join(", ") : "none"}
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
      </main>
    </>
  );
}
