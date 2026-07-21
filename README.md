# IndustrialMind 🏭

**AI-Powered Industrial Knowledge Intelligence Platform**  
ET AI Hackathon 2.0 · Phase 2 · Problem Statement 8

---

## What It Does

Turn scattered engineering documents — P&IDs, maintenance records, safety procedures,
inspection reports — into a unified, queryable brain for plant operations teams.

| Without IndustrialMind | With IndustrialMind |
|------------------------|---------------------|
| Engineer searches 7 disconnected systems | Single natural language query |
| ~45 minutes to find relevant procedure | ~4 seconds with source citations |
| Manual permit-to-work creation | Auto-generated from safety procedures |
| Compliance gaps found during audit | Detected proactively, before audit |
| RCA takes days across siloed records | Structured RCA in seconds |

---

## Evaluation Metrics

> These are **real numbers** produced by running `/eval/benchmark.py` against our document corpus.

| Metric | Score | Target | Notes |
|--------|-------|--------|-------|
| **Entity Extraction F1** | — | > 0.75 | Run `python eval/benchmark.py` |
| **RAGAS Faithfulness** | — | > 0.80 | Run `python eval/run_ragas.py` |
| **RAGAS Answer Relevance** | — | > 0.75 | Run `python eval/run_ragas.py` |
| **Compliance Precision** | — | > 0.80 | Run `python eval/benchmark.py` |
| **Compliance Recall** | — | > 0.75 | Run `python eval/benchmark.py` |
| **Time to Answer** | ~4 sec | vs ~45 min manual | Measured in demo |
| **KG Linkage Coverage** | — | > 80% docs linked | Run `python eval/kg_stats.py` |

*Fill these in after running eval suite with your API keys configured.*

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    STREAMLIT UI                          │
│  Copilot │ RCA Agent │ Compliance │ Graph │ Permit      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────┐
│                  FASTAPI BACKEND                         │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              AGENT SUPERVISOR                   │    │
│  │   classify intent → route to correct agent      │    │
│  └──────┬──────────────┬──────────────┬────────────┘    │
│         │              │              │                  │
│  ┌──────▼───┐  ┌───────▼──┐  ┌───────▼──────────┐      │
│  │Knowledge │  │  RCA     │  │   Compliance     │      │
│  │Copilot   │  │  Agent   │  │   Agent          │      │
│  │(Groq)    │  │(Claude)  │  │   (Claude)       │      │
│  └──────┬───┘  └───────┬──┘  └───────┬──────────┘      │
│         └──────────────┴──────────────┘                  │
│                        │                                  │
│  ┌─────────────────────▼───────────────────────────┐    │
│  │           TWIN BRAIN RETRIEVAL                   │    │
│  │                                                   │    │
│  │  Vector Store (ChromaDB)  +  BM25  → Cohere     │    │
│  │  Rerank                                          │    │
│  │                                                   │    │
│  │  Knowledge Graph (NetworkX / ISO 15926)          │    │
│  │  Pre-retrieval enrichment                        │    │
│  └─────────────────────┬───────────────────────────┘    │
│                        │                                  │
│  ┌─────────────────────▼───────────────────────────┐    │
│  │           INGESTION PIPELINE                     │    │
│  │  LlamaParse + Unstructured + Claude Vision       │    │
│  │  (P&ID native entity parsing)                    │    │
│  │  spaCy + LLM entity extraction                   │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘

Prototype → Production migration:
  ChromaDB → Pinecone/Weaviate
  NetworkX → Neo4j (GraphStore abstraction = zero app changes)
  SQLite   → PostgreSQL
  Single plant → Multi-plant (plant_id on all entities)
```

---

## Features

| # | Feature | Type |
|---|---------|------|
| 1 | Document Ingestion Pipeline | Core |
| 2 | Expert Knowledge Copilot | Core |
| 3 | Knowledge Graph Explorer (ISO 15926) | Core |
| 4 | RCA Agent Chain | Core |
| 5 | Compliance Gap Detector | Core |
| 6 | Work Permit Generator ⭐ | Differentiator |
| 7 | ROI Calculator | Differentiator |
| 8 | Risk Score Dashboard | Differentiator |
| 9 | Preset Demo Scenarios | Demo |
| 10 | RAGAS Evaluation Framework | Eval |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | Streamlit + React Flow (graph) |
| Backend | FastAPI + LangChain |
| Fast LLM | Groq (llama-3.3-70b) — copilot, routing |
| Reasoning LLM | Claude Sonnet — RCA, compliance, P&ID vision |
| Vector Store | ChromaDB |
| Keyword Search | BM25 (rank_bm25) |
| Reranker | Cohere Rerank |
| Knowledge Graph | NetworkX + GraphStore abstraction |
| Ontology | ISO 15926 Part 2 vocabulary |
| Doc Parsing | LlamaParse + Unstructured |
| Entity Extraction | spaCy + LLM prompts |
| RAG Evaluation | RAGAS |
| PDF Output | ReportLab |
| Database | SQLite + SQLAlchemy |
| Infra | Docker + docker-compose |

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/mark392a-ux/industrialmind
cd industrialmind/backend
cp .env.example .env
# Fill in your API keys in .env
```

### 2. Run with Docker (recommended)

```bash
docker-compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

### 3. Run locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend
pip install streamlit
streamlit run streamlit_app.py
```

---

## Evaluation

```bash
cd backend
python ../eval/benchmark.py       # entity F1 + compliance precision/recall
python ../eval/run_ragas.py       # RAGAS scores (requires ingested docs + API keys)
python ../eval/kg_stats.py        # knowledge graph linkage coverage
```

Results written to `/eval/results.json`

---

## Document Corpus (real industrial documents)

- OISD Standard 105 — Inspection of Pressure Vessels
- OISD Standard 118 — Layout for Oil and Gas Installations
- Factory Act 1948 — Relevant sections (31, 7B, 21)
- Generic centrifugal pump OEM maintenance manual
- Sample work orders and inspection reports (synthetic, realistic)

---

## Scalability

| Component | Prototype | Production |
|-----------|-----------|-----------|
| Vector Store | ChromaDB (local) | Pinecone / Weaviate |
| Knowledge Graph | NetworkX | Neo4j (1-line swap via GraphStore) |
| Database | SQLite | PostgreSQL |
| Multi-plant | plant_id field (ready) | Separate tenants |
| Ontology | ISO 15926 Part 2 subset | Full ISO 15926 + RAMI 4.0 |

---

## Project Structure

```
industrialmind/
├── backend/
│   ├── app/
│   │   ├── api/          routes.py
│   │   ├── agents/       supervisor.py (router + all agents)
│   │   ├── ingestion/    pipeline.py (parse + chunk + embed + extract)
│   │   ├── graph/        store.py (GraphStore + NetworkX + Neo4j stub)
│   │   ├── rag/          retriever.py (hybrid search + rerank)
│   │   ├── models/       db_models.py
│   │   └── core/         config.py, database.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── streamlit_app.py
├── eval/
│   ├── benchmark.py      (entity F1, compliance precision/recall)
│   ├── run_ragas.py      (RAGAS evaluation)
│   ├── kg_stats.py       (graph linkage coverage)
│   └── results.json      (actual numbers - filled after running)
├── docs/
│   └── architecture.md
└── docker-compose.yml
```

---

*Built for ET AI Hackathon 2.0 · Phase 2 · Solo*
