"""FastAPI server exposing the PaperMind agent and document store."""

from __future__ import annotations

import logging
import os
from typing import List, Literal, Optional

import json

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import config, documents, graph, vectorstore


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jarvis")


app = FastAPI(title="PaperMind", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def alias_jarvis_api(request, call_next):
    """Accept ``/jarvis-api/*`` as an alias for ``/api/*``.

    The frontend uses ``/jarvis-api`` as the API prefix during development
    (proxied by Vite). In production, uvicorn serves both prefixes natively.
    """
    path = request.scope.get("path", "")
    if path.startswith("/jarvis-api"):
        new_path = "/api" + path[len("/jarvis-api") :]
        request.scope["path"] = new_path
        if "raw_path" in request.scope and request.scope["raw_path"]:
            request.scope["raw_path"] = new_path.encode("utf-8")
    return await call_next(request)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: List[ChatTurn] = Field(default_factory=list)


class ChatSource(BaseModel):
    kind: Literal["document", "web"]
    name: str
    url: Optional[str] = None
    score: Optional[float] = None


class ChatResponse(BaseModel):
    answer: str
    route: Literal["rag", "web", "direct"]
    sources: List[ChatSource] = Field(default_factory=list)


class DocumentInfo(BaseModel):
    id: str
    name: str
    extension: str
    size_bytes: int
    chunk_count: int
    uploaded_at: float


class DocumentListResponse(BaseModel):
    documents: List[DocumentInfo]
    total_chunks: int


class HealthResponse(BaseModel):
    status: str
    provider: str
    model: str
    indexed_chunks: int
    indexed_documents: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    if config.LLM_PROVIDER == "groq":
        model = config.GROQ_MODEL
    else:
        model = config.OLLAMA_MODEL
    return HealthResponse(
        status="ok",
        provider=config.LLM_PROVIDER,
        model=model,
        indexed_chunks=vectorstore.collection_size(),
        indexed_documents=len(documents.list_documents()),
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    try:
        result = graph.run_agent(
            req.message,
            [{"role": t.role, "content": t.content} for t in req.history],
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:  # pragma: no cover - safety net
        logger.exception("chat failed")
        raise HTTPException(status_code=500, detail=f"Agent error: {exc}")

    return ChatResponse(
        answer=result.get("final_response", "(no response)"),
        route=result.get("route", "direct"),
        sources=[ChatSource(**s) for s in result.get("sources", [])],
    )


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    history = [{"role": t.role, "content": t.content} for t in req.history]

    async def event_iter():
        try:
            async for event in graph.stream_agent(req.message, history):
                yield f"data: {json.dumps(event)}\n\n"
        except RuntimeError as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        except Exception as exc:  # pragma: no cover - safety net
            logger.exception("chat stream failed")
            yield f"data: {json.dumps({'type': 'error', 'message': f'Agent error: {exc}'})}\n\n"

    return StreamingResponse(
        event_iter(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/documents", response_model=DocumentListResponse)
def list_docs() -> DocumentListResponse:
    docs = documents.list_documents()
    return DocumentListResponse(
        documents=[DocumentInfo(**d.__dict__) for d in docs],
        total_chunks=vectorstore.collection_size(),
    )


@app.post("/api/documents", response_model=DocumentInfo)
async def upload_doc(file: UploadFile = File(...)) -> DocumentInfo:
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        record = documents.ingest_file(
            original_name=file.filename or "untitled",
            file_bytes=contents,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover - safety net
        logger.exception("ingest failed")
        raise HTTPException(status_code=500, detail=f"Ingest error: {exc}")

    return DocumentInfo(**record.__dict__)


@app.delete("/api/documents/{document_id}")
def delete_doc(document_id: str) -> dict:
    ok = documents.delete_document(document_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Optional: serve the built React app from the same process in production.
# ---------------------------------------------------------------------------

_static_dir = os.environ.get("STATIC_DIR")
if _static_dir and os.path.isdir(_static_dir):
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    _static_root = os.path.abspath(_static_dir)
    _index_path = os.path.join(_static_root, "index.html")
    _assets_dir = os.path.join(_static_root, "assets")
    if os.path.isdir(_assets_dir):
        app.mount(
            "/assets",
            StaticFiles(directory=_assets_dir),
            name="assets",
        )

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        # API routes are registered above and take precedence.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = os.path.normpath(os.path.join(_static_root, full_path))
        if (
            full_path
            and candidate.startswith(_static_root)
            and os.path.isfile(candidate)
        ):
            return FileResponse(candidate)
        return FileResponse(_index_path)
