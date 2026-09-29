import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFECTS = ["scratch", "crack", "wrong_color", "deformation"];

// Demo mode: simulated detections so the app works without a trained model.
function mock(batch_id: string) {
  const total = 6 + Math.floor(Math.random() * 6);
  const detections = Array.from({ length: total }, (_, i) => {
    const bad = Math.random() < 0.25;
    const col = i % 4, row = Math.floor(i / 4);
    return {
      label: bad ? DEFECTS[Math.floor(Math.random() * DEFECTS.length)] : "good",
      status: bad ? "bad" : "good",
      conf: +(0.85 + Math.random() * 0.14).toFixed(2),
      box: [0.04 + col * 0.24, 0.06 + row * 0.3, 0.2, 0.26], // x,y,w,h normalized
    };
  });
  return { detections, batch_id };
}

export async function POST(req: Request) {
  const form = await req.formData();
  const batch_id = String(form.get("batch_id") || "BATCH-DEMO");
  let detections: any[];
  let mode = "demo";

  if (process.env.INFERENCE_URL) {
    const r = await fetch(`${process.env.INFERENCE_URL}/predict`, { method: "POST", body: form });
    if (!r.ok) return NextResponse.json({ error: "Inference service failed" }, { status: 502 });
    detections = (await r.json()).detections;
    mode = "yolo";
  } else {
    detections = mock(batch_id).detections;
  }

  const bad = detections.filter((d) => d.status === "bad");
  const defects: Record<string, number> = {};
  bad.forEach((d) => (defects[d.label] = (defects[d.label] || 0) + 1));
  const confidence = detections.length
    ? +(detections.reduce((s, d) => s + d.conf, 0) / detections.length).toFixed(2) : 0;

  return NextResponse.json({
    batch_id, mode, created: new Date().toISOString(),
    total_products: detections.length,
    good_products: detections.length - bad.length,
    bad_products: bad.length,
    yield_pct: detections.length ? +(((detections.length - bad.length) / detections.length) * 100).toFixed(1) : 0,
    defects, confidence, detections,
  });
}
