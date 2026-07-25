from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager


from app.core.database import init_db
from app.api.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    from app.ingestion.pipeline import get_collection
    try:
        collection = get_collection()
        collection.upsert(ids=["__warmup__"], documents=["warmup"])
        collection.delete(ids=["__warmup__"])
    except Exception as e:
        print(f"Embedding warmup failed (non-fatal): {e}")
    yield


app = FastAPI(
    title="IndustrialMind API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://industrial-mind-6wtm.vercel.app",  # your actual Vercel URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"app": "IndustrialMind", "version": "1.0.0", "status": "running"}
