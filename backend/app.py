import os
from datetime import datetime, timezone
from bson import ObjectId
from dotenv import load_dotenv

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dbconnect import init_db, col
from auth import router as auth_router, get_current_user

from starlette.middleware.wsgi import WSGIMiddleware
from mcq_assignment_api import router as mcq_assignment_router
from mcq_diagram_api import create_mcq_diagram_app

load_dotenv()

app = FastAPI(title="Backend + Mongo + JWT (No Mongo Auth)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Flask app (MCQ+Diagram ML)
mcq_diagram_flask = create_mcq_diagram_app(models_dir="models")
app.mount("/ml", WSGIMiddleware(mcq_diagram_flask))

# Routers
app.include_router(mcq_assignment_router)
app.include_router(auth_router)

@app.on_event("startup")
def startup():
    init_db()

@app.get("/api/health")
def health():
    return {"ok": True, "time": datetime.now(timezone.utc).isoformat()}


class ItemIn(BaseModel):
    title: str

@app.post("/api/items")
def create_item(body: ItemIn, user=Depends(get_current_user)):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    items = col("items")
    doc = {
        "title": title,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    res = items.insert_one(doc)
    return {"id": str(res.inserted_id), "title": title}

@app.get("/api/items")
def list_items(user=Depends(get_current_user)):
    items = col("items")
    out = []
    for d in items.find({"user_id": user["id"]}).sort("created_at", -1).limit(100):
        out.append({
            "id": str(d["_id"]),
            "title": d.get("title", ""),
            "created_at": d.get("created_at"),
        })
    return {"items": out}

@app.delete("/api/items/{item_id}")
def delete_item(item_id: str, user=Depends(get_current_user)):
    items = col("items")
    res = items.delete_one({"_id": ObjectId(item_id), "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
