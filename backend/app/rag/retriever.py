"""
Hybrid retrieval: vector search (ChromaDB) + keyword search (BM25)
merged and reranked with Cohere. Graph context used to expand queries.
Includes Proximity Booster for exact standard codes (e.g. OISD-105).
Includes Filename Booster for company/incident name queries (e.g. Philadelphia, Husky).
"""

import re
from typing import Optional
import cohere

from app.core.config import settings
from app.ingestion.pipeline import get_collection, get_bm25
from app.graph.store import get_graph_store
from app.rag.query_expander import optimize_search_query


# ── Filename keyword map ──────────────────────────────────────────────────────
# Maps user query terms → filename fragments to boost
# Add any new doc names here as you ingest them
FILENAME_HINTS: dict[str, list[str]] = {
    "philadelphia":  ["philadelphia", "csb_philadelphia"],
    "husky":         ["husky", "csb_husky"],
    "buncefield":    ["buncefield"],
    "texas city":    ["texas_city", "csb_texas"],
    "piper alpha":   ["piper_alpha"],
    "metallurgical": ["metallurgical", "csb_metallurgical"],
    "blowout":       ["blowout", "csb_blowout"],
    "explosion":     ["explosion", "csb_explosion"],
    "distillation":  ["distillation", "csb_crude"],
    "h2s":           ["h2s", "hydrogen_sulphide"],
    "battery":       ["battery_rom", "csb_battery"],
    "furnace":       ["furnace", "csb_explosion_furnace"],
    "pipeline":      ["pipeline", "csb_pipeline"],
    "burst":         ["burst", "csb_burst"],
}


def _extract_filename_hints(query: str) -> list[str]:
    """Return filename fragments that match terms in the query."""
    q_lower = query.lower()
    hits = []
    for term, fragments in FILENAME_HINTS.items():
        if term in q_lower:
            hits.extend(fragments)
    return list(set(hits))


def vector_search(query, n_results=10, plant_id=None, doc_type=None):
    collection = get_collection()
    where = {}
    if plant_id:
        where["plant_id"] = plant_id
    if doc_type:
        where["doc_type"] = doc_type
    try:
        res = collection.query(
            query_texts=[query],
            n_results=min(n_results, collection.count() or 1),
            where=where if where else None,
        )
        chunks = []
        for i, doc in enumerate(res["documents"][0]):
            meta = res["metadatas"][0][i]
            dist = res["distances"][0][i]
            chunks.append({
                "text": doc,
                "score": 1 - dist,
                "source": "vector",
                **meta,
            })
        return chunks
    except Exception:
        return []


def bm25_search(query, n_results=10, compounds: list[str] = None):
    bm25, corpus, meta = get_bm25()
    if bm25 is None:
        return []

    tokens = re.findall(r'\w+', query.lower())
    scores = bm25.get_scores(tokens)
    top = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:n_results]

    results = []
    for i in top:
        if scores[i] > 0:
            chunk = {"text": corpus[i], "score": float(scores[i]), "source": "bm25", **meta[i]}
            results.append(chunk)

    if compounds:
        results = boost_proximity_matches(results, compounds)

    return results


def filename_boosted_search(query: str, plant_id: str = "plant_001",
                             n_results: int = 8) -> list[dict]:
    """
    Extra vector search pass using expanded terms derived from filename hints.
    Catches cases where chunk text doesn't mention the company name
    but the document is clearly relevant.
    """
    hints = _extract_filename_hints(query)
    if not hints:
        return []

    # Build an expanded query using the hint terms + failure keywords from query
    failure_keywords = re.findall(
        r'\b(fire|explosion|leak|failure|incident|rupture|release|accident|'
        r'injury|fatality|cause|root|investigation|report)\b',
        query.lower()
    )
    expanded = " ".join(hints) + " " + " ".join(failure_keywords) + " " + query
    expanded = expanded[:500]  # cap length

    return vector_search(expanded, n_results=n_results, plant_id=plant_id)


def boost_proximity_matches(chunks: list[dict], compounds: list[str],
                             max_gap: int = 15) -> list[dict]:
    """
    Boost chunks where compound terms like 'OISD-105' appear
    within max_gap words of each other.
    """
    if not compounds or not chunks:
        return chunks

    boosted_chunks = []
    for chunk in chunks:
        text = chunk["text"]
        base_score = chunk["score"]
        boost_multiplier = 1.0

        for compound in compounds:
            parts = [p.lower() for p in re.split(r'[\s\-./]+', compound) if len(p) > 1]

            if len(parts) < 2:
                if re.search(r'\b' + re.escape(compound) + r'\b', text, re.IGNORECASE):
                    boost_multiplier += 2.0
                continue

            if check_word_proximity(text, parts, max_gap):
                boost_multiplier += len(parts) * 1.5

        chunk["score"] = base_score * boost_multiplier
        boosted_chunks.append(chunk)

    boosted_chunks.sort(key=lambda x: x["score"], reverse=True)
    return boosted_chunks


def check_word_proximity(text: str, parts: list[str], max_gap: int) -> bool:
    """Check if all parts appear within max_gap words of each other."""
    text_lower = text.lower()
    words = re.findall(r'\b\w+\b', text_lower)

    part_indices = {}
    for part in parts:
        indices = [i for i, w in enumerate(words) if part in w]
        if not indices:
            return False
        part_indices[part] = indices

    first_occurrences = [indices[0] for indices in part_indices.values()]
    return max(first_occurrences) - min(first_occurrences) <= max_gap


def graph_enrich_query(query, plant_id="plant_001"):
    """Expand query using entity neighbors from the knowledge graph."""
    graph = get_graph_store()
    extras = []
    tokens = re.findall(r'[A-Za-z0-9]+', query)

    for token in tokens:
        if len(token) < 3:
            continue
        for node in graph.search_nodes(token, plant_id=plant_id)[:2]:
            for nb in graph.get_neighbors(node["id"], depth=1)[:3]:
                label = nb.get("label", "")
                if label and label.lower() not in query.lower():
                    extras.append(label)

    if extras:
        return query + " " + " ".join(set(extras))
    return query


def cohere_rerank(query: str, chunks: list[dict], top_n: int = 5,
                  rerank_query: str = None) -> list[dict]:
    """
    Rerank chunks against query using Cohere.
    rerank_query: optional richer query for reranking
                  (use enriched query, not just raw user input)
    """
    if not chunks:
        return []

    effective_query = rerank_query or query

    def normalize_fallback(chunks_to_norm):
        if not chunks_to_norm:
            return []
        max_score = max(c.get("score", 0) for c in chunks_to_norm) or 1
        result = []
        for c in chunks_to_norm[:top_n]:
            nc = dict(c)
            nc["rerank_score"] = round(c.get("score", 0) / max_score, 2)
            result.append(nc)
        return result

    if not settings.cohere_api_key:
        return normalize_fallback(chunks)

    try:
        co = cohere.Client(settings.cohere_api_key)
        resp = co.rerank(
            query=effective_query,          # ← use enriched query
            documents=[c["text"] for c in chunks],
            top_n=top_n,
            model="rerank-english-v3.0",
        )
        reranked = []
        for r in resp.results:
            chunk = dict(chunks[r.index])
            chunk["rerank_score"] = r.relevance_score
            reranked.append(chunk)
        return reranked
    except Exception as e:
        print(f"Cohere rerank failed, using normalized fallback: {e}")
        return normalize_fallback(chunks)


def hybrid_retrieve(query: str, plant_id: str = "plant_001", doc_type=None,
                    top_k: int = 5, use_graph: bool = True) -> list[dict]:

    # STEP 1: Normalize and extract compound terms
    optimized_query, compounds = optimize_search_query(query, use_llm=True)

    # STEP 2: Expand with knowledge graph entities
    enriched = graph_enrich_query(optimized_query, plant_id) if use_graph else optimized_query

    # STEP 3: Vector search on enriched query — larger candidate pool
    vec = vector_search(enriched, n_results=15, plant_id=plant_id, doc_type=doc_type)

    # STEP 4: BM25 with proximity boosting
    kw = bm25_search(optimized_query, n_results=15, compounds=compounds)

    # STEP 4.5: Normalize BM25 scores to 0–1 range (fixes score scaling bug)
    if kw:
        max_bm25 = max((c["score"] for c in kw), default=1) or 1
        for c in kw:
            c["score"] = c["score"] / max_bm25

    # STEP 4.6: Filename-boosted search for company/incident name queries
    # This catches CSB reports, OEM manuals, and named incident docs
    filename_chunks = filename_boosted_search(query, plant_id=plant_id, n_results=8)

    # STEP 5: Merge and deduplicate (vector + BM25 + filename boost)
    seen, merged = set(), []
    for chunk in vec + kw + filename_chunks:
        cid = chunk.get("id", chunk.get("text", "")[:60])
        if cid not in seen:
            seen.add(cid)
            merged.append(chunk)

    # STEP 6: Rerank — pass enriched query so Cohere understands context better
    return cohere_rerank(query, merged, top_n=top_k, rerank_query=enriched)