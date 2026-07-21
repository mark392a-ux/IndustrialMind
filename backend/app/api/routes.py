import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.models.db_models import Document, ChatSession, ChatMessage
from app.ingestion.pipeline import ingest_document
from app.agents.supervisor import (
    run_agent, run_rca, run_compliance, generate_work_permit,
    RateLimitError, ServiceError,
)
from app.graph.store import get_graph_store
from app.utils.pdf_generator import generate_rca_pdf, generate_permit_pdf, generate_compliance_pdf

router = APIRouter()


# ── Request models ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    plant_id: str = "plant_001"
    force_agent: Optional[str] = None


class RCARequest(BaseModel):
    equipment_id: str
    symptom: str
    plant_id: str = "plant_001"


class ComplianceRequest(BaseModel):
    standard: str
    plant_id: str = "plant_001"


class PermitRequest(BaseModel):
    equipment_id: str
    work_type: str
    location: str
    plant_id: str = "plant_001"


# ── Helper: safe answer extraction ────────────────────────────────────────────

def _safe_answer(response: dict) -> str:
    """Extract answer from response — works for both normal and error responses."""
    return response.get("answer") or response.get("error") or "No response generated."


def _is_error_response(response: dict) -> bool:
    """Check if response is an error (rate limit, validation, blocked audit etc.)."""
    return "error" in response or "error_type" in response or response.get("blocked", False)


def _error_status_code(response: dict) -> int:
    """Map error type to appropriate HTTP status code."""
    error_type = response.get("error_type", "")
    if error_type == "rate_limit":
        return 429
    if error_type == "service_error":
        return 503
    if response.get("blocked"):
        return 200  # Blocked compliance audit — still a valid response, not an error
    return 400


# ── Documents ─────────────────────────────────────────────────────────────────

@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form(default="manual"),
    plant_id: str = Form(default="plant_001"),
    db: AsyncSession = Depends(get_db),
):
    doc_id = str(uuid.uuid4())
    ext = Path(file.filename or "").suffix.lower()
    save_dir = Path(settings.upload_path)
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / f"{doc_id}{ext}"

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    doc = Document(
        id=doc_id, filename=file.filename, doc_type=doc_type,
        plant_id=plant_id, source_path=str(save_path), status="processing",
    )
    db.add(doc)
    await db.commit()

    try:
        result = await ingest_document(
            file_path=str(save_path),
            doc_id=doc_id,
            filename=file.filename,
            doc_type=doc_type,
            plant_id=plant_id,
        )
        doc.status      = result["status"]
        doc.page_count  = result["page_count"]
        doc.chunk_count = result["chunk_count"]
    except Exception as e:
        doc.status = "failed"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    await db.commit()
    return result


@router.get("/documents")
async def list_documents(plant_id: str = "plant_001", db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Document).where(Document.plant_id == plant_id))
    docs = res.scalars().all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "doc_type": d.doc_type,
            "page_count": d.page_count,
            "chunk_count": d.chunk_count,
            "status": d.status,
            "created_at": str(d.created_at),
        }
        for d in docs
    ]


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    from app.ingestion.pipeline import delete_vectors_for_document

    res = await db.execute(select(Document).where(Document.id == doc_id))
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # ── 1. Delete from Knowledge Graph ──
    graph = get_graph_store()
    nodes_removed = graph.delete_nodes_for_document(doc_id)
    orphans_removed = graph.remove_orphan_nodes(doc.plant_id)

    # ── 2. Delete from ChromaDB (Vector Search) ──
    delete_vectors_for_document(doc_id)

    # ── 3. Delete the document record ──
    await db.delete(doc)
    await db.commit()

    return {
        "deleted": doc_id,
        "filename": doc.filename,
        "graph_nodes_removed": nodes_removed,
        "orphans_cleaned": orphans_removed,
        "vectors_deleted": True,
    }


@router.delete("/documents/clear/all")
async def clear_all_documents(plant_id: str = "plant_001", db: AsyncSession = Depends(get_db)):
    from app.ingestion.pipeline import clear_vectors_for_plant, clear_bm25_memory

    res = await db.execute(select(Document).where(Document.plant_id == plant_id))
    docs = res.scalars().all()
    doc_count = len(docs)

    # ── 1. Purge Knowledge Graph ──
    graph = get_graph_store()
    nodes_removed = graph.delete_nodes_by_plant(plant_id)

    # ── 2. Purge ChromaDB (Vector Search) ──
    clear_vectors_for_plant(plant_id)

    # ── 3. Purge in-memory BM25 (Keyword Search) ──
    clear_bm25_memory()

    # ── 4. Delete DB records ──
    for doc in docs:
        await db.delete(doc)
    await db.commit()

    return {
        "status": "fully_cleared",
        "documents_deleted": doc_count,
        "graph_nodes_removed": nodes_removed,
        "vectors_cleared": True,
        "bm25_cleared": True,
    }
# ── Chat ──────────────────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    session_id = req.session_id or str(uuid.uuid4())

    # Get or create session
    session = await db.get(ChatSession, session_id)
    if not session:
        session = ChatSession(id=session_id, plant_id=req.plant_id)
        db.add(session)
        await db.commit()

    # Load chat history
    res = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    history = [{"role": m.role, "content": m.content} for m in res.scalars().all()]

    # Run agent
    response = run_agent(
        query=req.query,
        plant_id=req.plant_id,
        history=history,
        force_agent=req.force_agent,
    )

    answer = _safe_answer(response)
    agent  = response.get("agent", "copilot")
    sources = response.get("sources", [])

    # Save to DB — always save, even error responses (for audit trail)
    db.add(ChatMessage(
        session_id=session_id,
        role="user",
        content=req.query,
        agent_type=agent,
    ))
    db.add(ChatMessage(
        session_id=session_id,
        role="assistant",
        content=answer,
        sources=json.dumps(sources),
        agent_type=agent,
    ))
    await db.commit()

    # Return error response with correct HTTP status if needed
    if _is_error_response(response) and not response.get("blocked"):
        return JSONResponse(
            status_code=_error_status_code(response),
            content={
                "session_id": session_id,
                "answer":     answer,
                "sources":    sources,
                "agent":      agent,
                "error_type": response.get("error_type", "unknown"),
            }
        )

    return {
        "session_id": session_id,
        "answer":     answer,
        "sources":    sources,
        "agent":      agent,
        # Pass blocked flag so frontend can render differently
        "blocked":    response.get("blocked", False),
    }


# ── RCA ───────────────────────────────────────────────────────────────────────

@router.post("/rca")
async def rca_analysis(req: RCARequest):
    # Validate symptom length before hitting the agent
    if len(req.symptom.strip()) < 20:
        return JSONResponse(
            status_code=400,
            content={
                "error": (
                    "Failure description is too vague. Please provide more detail — "
                    "e.g. 'V-201 showing water ingress at bottom flange, discovered on "
                    f"{__import__('datetime').datetime.now().strftime('%d %b %Y')}'. "
                    "Include: what happened, when discovered, and observed symptoms."
                ),
                "error_type": "validation",
                "agent": "rca",
            }
        )

    try:
        result = run_rca(
            equipment_id=req.equipment_id,
            symptom=req.symptom,
            plant_id=req.plant_id,
        )
        # run_rca may return its own error dict for vague input
        if _is_error_response(result):
            return JSONResponse(
                status_code=400,
                content=result,
            )
        return result

    except RateLimitError as e:
        return JSONResponse(status_code=429, content={
            "error": str(e), "error_type": "rate_limit", "agent": "rca",
        })
    except ServiceError as e:
        return JSONResponse(status_code=503, content={
            "error": str(e), "error_type": "service_error", "agent": "rca",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Compliance ────────────────────────────────────────────────────────────────

@router.post("/compliance")
async def compliance_check(req: ComplianceRequest):
    try:
        result = run_compliance(standard=req.standard, plant_id=req.plant_id)

        # Blocked audit — return 200 with blocked flag (not an error, just informational)
        if result.get("blocked"):
            return result

        return result

    except RateLimitError as e:
        return JSONResponse(status_code=429, content={
            "error": str(e), "error_type": "rate_limit", "agent": "compliance",
        })
    except ServiceError as e:
        return JSONResponse(status_code=503, content={
            "error": str(e), "error_type": "service_error", "agent": "compliance",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Work Permit ───────────────────────────────────────────────────────────────

@router.post("/permit")
async def work_permit(req: PermitRequest):
    try:
        return generate_work_permit(
            equipment_id=req.equipment_id,
            work_type=req.work_type,
            location=req.location,
            plant_id=req.plant_id,
        )
    except RateLimitError as e:
        return JSONResponse(status_code=429, content={
            "error": str(e), "error_type": "rate_limit", "agent": "permit",
        })
    except ServiceError as e:
        return JSONResponse(status_code=503, content={
            "error": str(e), "error_type": "service_error", "agent": "permit",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── PDF exports ───────────────────────────────────────────────────────────────

@router.post("/rca/pdf")
async def rca_pdf(req: RCARequest):
    try:
        result = run_rca(
            equipment_id=req.equipment_id,
            symptom=req.symptom,
            plant_id=req.plant_id,
        )
        if _is_error_response(result):
            raise HTTPException(status_code=400, detail=result.get("error", "RCA failed"))

        pdf_bytes = generate_rca_pdf(
            equipment_id=req.equipment_id,
            symptom=req.symptom,
            rca_content=result["answer"],
            sources=result.get("sources", []),
            plant_id=req.plant_id,
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=RCA_{req.equipment_id}.pdf"},
        )
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/permit/pdf")
async def permit_pdf(req: PermitRequest):
    try:
        result = generate_work_permit(
            equipment_id=req.equipment_id,
            work_type=req.work_type,
            location=req.location,
            plant_id=req.plant_id,
        )
        pdf_bytes = generate_permit_pdf(
            equipment_id=req.equipment_id,
            work_type=req.work_type,
            location=req.location,
            permit_content=result["permit_content"],
            sources=result.get("sources", []),
            plant_id=req.plant_id,
            # Pass real dates from supervisor to PDF generator
            ptw_number=result.get("ptw_number", ""),
            date_issued=result.get("date_issued", ""),
            valid_until=result.get("valid_until", ""),
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=PTW_{req.equipment_id}.pdf"},
        )
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compliance/pdf")
async def compliance_pdf(req: ComplianceRequest):
    try:
        result = run_compliance(standard=req.standard, plant_id=req.plant_id)

        # Don't generate PDF for blocked audits
        if result.get("blocked"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot generate PDF — {req.standard} not found in knowledge base. Upload the standard first.",
            )

        pdf_bytes = generate_compliance_pdf(
            standard=req.standard,
            content=result["answer"],
            sources=result.get("sources", []),
            plant_id=req.plant_id,
        )
        safe = req.standard.replace(" ", "_")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=Compliance_{safe}.pdf"},
        )
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Knowledge Graph ───────────────────────────────────────────────────────────

@router.get("/graph/stats")
async def graph_stats():
    return get_graph_store().get_stats()


@router.get("/graph/search")
async def graph_search(query: str, plant_id: str = "plant_001"):
    return {"nodes": get_graph_store().search_nodes(query, plant_id=plant_id)}


@router.get("/graph/neighbors/{node_id}")
async def graph_neighbors(node_id: str, depth: int = 1):
    nid = node_id.replace("__", ":")
    return {"neighbors": get_graph_store().get_neighbors(nid, depth=depth)}


@router.get("/graph/full")
async def graph_full(plant_id: str = "plant_001"):
    graph = get_graph_store()
    G = graph.G
    TYPE_COLOR = {
        "FunctionalObject":  "#378ADD",
        "PhysicalObject":    "#1D9E75",
        "Activity":          "#BA7517",
        "ClassOfEquipment":  "#7F77DD",
        "Document":          "#D85A30",
    }
    nodes = []
    for nid, data in G.nodes(data=True):
        if data.get("plant_id", plant_id) != plant_id:
            continue
        nt = data.get("node_type", "unknown")
        nodes.append({
            "id": nid,
            "data": {"label": data.get("label", nid)},
            "style": {
                "background": TYPE_COLOR.get(nt, "#888"),
                "color": "#fff",
                "border": "none",
                "borderRadius": "6px",
                "padding": "6px 10px",
                "fontSize": "11px",
            },
        })
    edges = [
        {
            "id": f"{s}__{t}",
            "source": s,
            "target": t,
            "label": ed.get("relation", ""),
            "style": {"stroke": "#888", "strokeWidth": 1},
        }
        for s, t, ed in G.edges(data=True)
    ]
    return {"nodes": nodes, "edges": edges}


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    stats = get_graph_store().get_stats()
    return {
        "status":      "ok",
        "graph_nodes": stats["total_nodes"],
        "graph_edges": stats["total_edges"],
    }