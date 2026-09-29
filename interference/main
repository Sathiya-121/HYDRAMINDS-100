# Optional real YOLO service. Deploy on Render / Railway / Hugging Face Spaces / Fly.io.
# Train a model with classes like: good, scratch, crack, wrong_color, deformation -> save as best.pt
import io
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from ultralytics import YOLO

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
model = YOLO("best.pt")  # or "yolov8n.pt" to test

@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    img = Image.open(io.BytesIO(await image.read())).convert("RGB")
    W, H = img.size
    out = []
    for b in model(img)[0].boxes:
        label = model.names[int(b.cls)]
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        out.append({
            "label": label,
            "status": "good" if label == "good" else "bad",
            "conf": round(float(b.conf), 2),
            "box": [x1 / W, y1 / H, (x2 - x1) / W, (y2 - y1) / H],
        })
    return {"detections": out}
