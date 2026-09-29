# Cloud ERP · AI Inspection (hackathon)

## Run locally
    npm install && npm run dev      # http://localhost:3000  (demo mode, no model needed)

## Deploy frontend + API on Vercel
1. Push this folder to GitHub.
2. vercel.com → New Project → import repo → Deploy (no config needed).

## Connect real YOLO (optional)
1. Train your model with Ultralytics (classes: good, scratch, crack, ...) -> best.pt
2. Put best.pt in /inference, deploy that folder (uvicorn main:app --host 0.0.0.0 --port $PORT).
3. In Vercel → Settings → Environment Variables: INFERENCE_URL = https://your-service-url → Redeploy.
