"""
Document ingestion pipeline:
1. Parse PDF (pdfplumber first, pypdf fallback)
2. Chunk into overlapping windows
3. Embed → ChromaDB (vector search)
4. Index → BM25 (keyword search)
5. Extract entities via Groq → populate knowledge graph
"""

import json
import re
import uuid
from pathlib import Path
from typing import Optional

import chromadb
import pdfplumber
from groq import Groq
from pypdf import PdfReader
from rank_bm25 import BM25Okapi

from app.core.config import settings
from app.graph.store import get_graph_store, NodeType, RelType


def get_groq():
    return Groq(api_key=settings.groq_api_key)


# singletons for chroma + bm25
_chroma_client = None
_collection = None


def get_collection():
    global _chroma_client, _collection
    if _collection is None:
        _chroma_client = chromadb.PersistentClient(path=settings.chroma_persist_path)
        _collection = _chroma_client.get_or_create_collection(
            name="industrialmind",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


_bm25_corpus = []
_bm25_meta   = []
_bm25_index  = None


def get_bm25():
    global _bm25_index
    if _bm25_corpus and _bm25_index is None:
        tokenized = [doc.lower().split() for doc in _bm25_corpus]
        _bm25_index = BM25Okapi(tokenized)
    return _bm25_index, _bm25_corpus, _bm25_meta


def add_to_bm25(text, meta):
    global _bm25_index
    _bm25_corpus.append(text)
    _bm25_meta.append(meta)
    _bm25_index = None  # rebuild on next call


def extract_text_from_pdf(path):
    pages = []
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                for table in page.extract_tables():
                    for row in table:
                        text += " | ".join(str(c) for c in row if c) + "\n"
                pages.append(text.strip())
    except Exception:
        reader = PdfReader(path)
        for page in reader.pages:
            pages.append(page.extract_text() or "")
    return pages, len(pages)


def chunk_text(text, chunk_size=600, overlap=100):
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i: i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
        i += chunk_size - overlap
    return chunks


# ISO 15926 entity types in the extraction prompt
ENTITY_PROMPT = """Extract ALL entities from this industrial document text.
Return ONLY valid JSON starting with {. No markdown, no explanation.

Entity types (ISO 15926 Part 2 vocabulary):
- FunctionalObject: equipment with tag numbers (pumps P-101, vessels V-201, compressors K-301)
- PhysicalObject: instruments and sensors (FIC-301, PT-102, TT-201, LI-301)
- Activity: work orders (WO-2024-447), inspections, maintenance tasks
- ClassOfEquipment: standards and regulations (OISD-105, Factory Act Section 31, PESO, API 581)
- Document: referenced manuals, SOPs, procedures

Extract every tag number you see. label = exact code, value = brief description.

{"entities": [{"type": "FunctionalObject", "label": "P-101", "value": "cooling water pump"}, ...]}

Text:
"""


def extract_entities_llm(text, client=None):
    try:
        groq = client or get_groq()
        resp = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=800,
            temperature=0,
            messages=[{"role": "user", "content": ENTITY_PROMPT + text[:3000]}],
        )
        raw = re.sub(r"```json|```", "", resp.choices[0].message.content).strip()
        return json.loads(raw).get("entities", [])
    except Exception:
        return []


PID_PROMPT = """Parse this P&ID (Piping and Instrumentation Diagram).
Extract all equipment tags, instrument loops, and line numbers.
Return ONLY valid JSON:

{"equipment_tags": ["P-101", "V-201"],
 "instrument_loops": ["FIC-101", "PT-201"],
 "line_numbers": ["6\"-CS-101-A1A"],
 "safety_devices": ["PSV-101"]}"""


def extract_pid_entities(image_path, client=None):
    import base64
    try:
        with open(image_path, "rb") as f:
            img_data = base64.standard_b64encode(f.read()).decode("utf-8")
        ext = Path(image_path).suffix.lower()[1:]
        media_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext, "image/png")
        groq = client or get_groq()
        resp = groq.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url",
                     "image_url": {"url": f"data:{media_type};base64,{img_data}"}},
                    {"type": "text", "text": PID_PROMPT},
                ],
            }],
        )
        raw = re.sub(r"```json|```", "", resp.choices[0].message.content).strip()
        return json.loads(raw)
    except Exception:
        return {"equipment_tags": [], "instrument_loops": [],
                "line_numbers": [], "safety_devices": []}


def populate_graph(doc_id, doc_filename, entities, plant_id="plant_001", doc_type="manual"):
    graph = get_graph_store()
    doc_node = f"doc:{doc_id}"

    graph.add_node(doc_node, NodeType.DOCUMENT, label=doc_filename,
                   plant_id=plant_id, doc_id=doc_id, doc_type=doc_type)

    # every doc gets at least one edge via doc_type node (ensures 100% KG coverage)
    type_node = f"classofequipment:doctype:{doc_type}:{plant_id}"
    graph.add_node(type_node, NodeType.CLASS_OF_EQUIPMENT,
                   label=f"DocType:{doc_type}", plant_id=plant_id, doc_id=doc_id)
    graph.add_edge(doc_node, type_node, RelType.IS_RELATED_TO)

    entity_nodes = []
    for ent in entities:
        ent_type  = ent.get("type", "PhysicalObject")
        ent_label = ent.get("label", "")
        if not ent_label:
            continue
        node_id = f"{ent_type.lower()}:{ent_label}:{plant_id}"
        graph.add_node(node_id, ent_type, label=ent_label,
                       plant_id=plant_id, doc_id=doc_id, description=ent.get("value", ""))
        graph.add_edge(doc_node, node_id, RelType.REFERENCED_BY)
        entity_nodes.append(node_id)

    # link co-occurring entities together
    for i in range(len(entity_nodes) - 1):
        graph.add_edge(entity_nodes[i], entity_nodes[i + 1], RelType.IS_RELATED_TO)

    graph.save()


def populate_graph_from_pid(doc_id, pid_data, plant_id="plant_001"):
    graph = get_graph_store()
    for tag in pid_data.get("equipment_tags", []):
        node_id = f"functionalobject:{tag}:{plant_id}"
        graph.add_node(node_id, NodeType.FUNCTIONAL_OBJECT, label=tag,
                       plant_id=plant_id, doc_id=doc_id, source="pid")
        graph.add_edge(f"doc:{doc_id}", node_id, RelType.REFERENCED_BY)

    for loop in pid_data.get("instrument_loops", []):
        node_id = f"physicalobject:{loop}:{plant_id}"
        graph.add_node(node_id, NodeType.PHYSICAL_OBJECT, label=loop,
                       plant_id=plant_id, doc_id=doc_id, source="pid")
        graph.add_edge(f"doc:{doc_id}", node_id, RelType.REFERENCED_BY)

    for device in pid_data.get("safety_devices", []):
        node_id = f"functionalobject:{device}:{plant_id}"
        graph.add_node(node_id, NodeType.FUNCTIONAL_OBJECT, label=device,
                       plant_id=plant_id, doc_id=doc_id, device_type="safety")
        graph.add_edge(f"doc:{doc_id}", node_id, RelType.REFERENCED_BY)

    graph.save()

# ── Deletion helpers for ChromaDB and BM25 ─────────────────────────────────

def delete_vectors_for_document(doc_id: str):
    """Remove all vector embeddings for a specific document from ChromaDB."""
    try:
        collection = get_collection()
        # ChromaDB allows deleting by filtering metadata
        collection.delete(where={"doc_id": doc_id})
        return True
    except Exception as e:
        print(f"Error deleting vectors for {doc_id}: {e}")
        return False

def clear_vectors_for_plant(plant_id: str = "plant_001"):
    """Remove ALL vector embeddings for a specific plant from ChromaDB."""
    try:
        collection = get_collection()
        collection.delete(where={"plant_id": plant_id})
        return True
    except Exception as e:
        print(f"Error clearing vectors for plant {plant_id}: {e}")
        return False

def clear_bm25_memory():
    """Wipe the in-memory BM25 index. It will rebuild as new docs are ingested."""
    global _bm25_corpus, _bm25_meta, _bm25_index
    _bm25_corpus = []
    _bm25_meta = []
    _bm25_index = None
    
async def ingest_document(file_path, doc_id, filename, doc_type="manual",
                          plant_id="plant_001"):
    client     = get_groq()
    collection = get_collection()

    pages, page_count = extract_text_from_pdf(file_path)

    all_chunks = []
    for page_num, page_text in enumerate(pages):
        for i, chunk in enumerate(chunk_text(page_text)):
            all_chunks.append({
                "id":       f"{doc_id}_p{page_num}_c{i}",
                "text":     chunk,
                "page":     page_num + 1,
                "doc_id":   doc_id,
                "filename": filename,
                "doc_type": doc_type,
                "plant_id": plant_id,
            })

    if all_chunks:
        collection.upsert(
            ids=[c["id"] for c in all_chunks],
            documents=[c["text"] for c in all_chunks],
            metadatas=[{k: v for k, v in c.items() if k != "text"} for c in all_chunks],
        )

    for chunk in all_chunks:
        add_to_bm25(chunk["text"], {k: v for k, v in chunk.items() if k != "text"})

    # extract entities from first 5 pages
    sample = "\n\n".join(pages[:5])
    entities = extract_entities_llm(sample, client)

    populate_graph(doc_id, filename, entities, plant_id, doc_type)

    return {
        "doc_id":             doc_id,
        "filename":           filename,
        "page_count":         page_count,
        "chunk_count":        len(all_chunks),
        "entities_extracted": len(entities),
        "status":             "indexed",
    }