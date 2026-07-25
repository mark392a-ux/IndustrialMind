# Getting Started with IndustrialMind

This guide gets IndustrialMind running locally in under 10 minutes. For system design, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). For evaluation methodology and results, see [`EVALUATION.md`](EVALUATION.md).

---

## Prerequisites

| Requirement | Version | Check |
|---|---|---|
| Python | 3.11+ | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | any recent | `git --version` |

You'll also need free API keys from the providers IndustrialMind uses for inference and reranking (see [API Keys](#api-keys) below).

---

## 1. Clone the repository

```bash
git clone https://github.com/mark392a-ux/IndustrialMind.git
cd IndustrialMind
```

## 2. Backend setup

```bash
cd backend
python -m venv venv

# Activate the virtual environment
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
```

### Configure environment variables

Copy the example file and fill in your own keys:

```bash
cp .env.example .env         # macOS / Linux
copy .env.example .env       # Windows
```

Open `.env` and set the values it lists — check `.env.example` for the exact variable names your build expects, since these depend on which providers are wired up in `app/core/config.py`. At minimum you'll need keys for the LLM providers in the fallback chain (Groq and Gemini) and, if used, Cohere for reranking. **Never commit your real `.env` file** — it's already covered by `.gitignore`.

### API Keys

| Provider | Used for | Get a key |
|---|---|---|
| Groq | Primary + fallback inference (Llama 3.3 70B / 8B) | [console.groq.com](https://console.groq.com) |
| Google Gemini | Final fallback tier + Vision (P&ID parsing) | [aistudio.google.com](https://aistudio.google.com) |
| Cohere | Rerank v3 in the hybrid retrieval layer | [dashboard.cohere.com](https://dashboard.cohere.com) |
| DeepSeek | R1 reasoning tier (if configured separately from Groq) | [platform.deepseek.com](https://platform.deepseek.com) |

All of these have free tiers sufficient for local evaluation and demoing.

## 3. Frontend setup

```bash
cd ../frontend
npm install
```

No additional environment configuration is needed on the frontend — it talks to the backend at `http://localhost:8000` by default (check `frontend/src/api/client.ts` if you've changed the backend port).

## 4. Run everything

From the repository root, use the provided start script:

```bash
start.bat      # Windows
./start.sh     # macOS / Linux
```

This starts the backend (FastAPI, default port 8000) and frontend (Vite dev server, default port 3000) together.

**Running manually instead**, in two terminals:
```bash
# Terminal 1 — backend
cd backend
venv\Scripts\activate  (or source venv/bin/activate)
uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

Open **http://localhost:3000** once both are running.

## 5. Verify it's working

- The sidebar should show **"Backend Connected"** in green.
- The dashboard should show document/node/relationship counts once the corpus is indexed (see below).
- Try a quick-action card (e.g. "OISD Inspection") — you should get a cited answer within a few seconds.

## 6. Load the document corpus

IndustrialMind ships evaluated against a 37-document corpus of real industrial standards, manuals, and incident reports (see [`EVALUATION.md`](EVALUATION.md) for the full list and methodology). To populate your local instance:

1. Go to **Documents** in the sidebar.
2. Use **Upload PDF**, selecting the correct **Document Type** for each file (Procedure/Standard, Manual, Inspection, Work Order).
3. Wait for each document to show a green "Indexed" checkmark before uploading the next — ingestion runs the full pipeline (parsing → chunking → embedding → knowledge graph linking) per document.

Documents used for evaluation are not bundled in this repo (see `backend/data/uploads/` in `.gitignore`) since several are OEM manuals and standards that may carry redistribution restrictions. Substitute your own industrial documents, or contact the maintainer for the evaluation set used in judging.

## 7. Run the evaluation suite (optional)

To reproduce the metrics reported in `EVALUATION.md`:

```bash
cd backend
python app/eval/run_eval.py
```

This scores the system against the 20 ground-truth Q&A pairs and writes results to `eval/results.json`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Backend Connected" stays red/offline | Backend not running, or wrong port | Confirm `uvicorn` is running on port 8000 with no errors in the terminal |
| Upload fails immediately | Missing or invalid API key | Double-check `.env` values against `.env.example` |
| Slow first response | Cold start (esp. if backend is deployed on a free-tier host) | Send one throwaway query to warm it up before demoing |
| `ModuleNotFoundError` on backend start | Virtual environment not activated, or `pip install` didn't complete | Re-activate venv, re-run `pip install -r requirements.txt` |
| Frontend shows blank page | `npm install` didn't complete, or backend URL mismatch | Re-run `npm install`; check `frontend/src/api/client.ts` |

---

## Project Structure

```
IndustrialMind/
├── backend/
│   ├── app/
│   │   ├── agents/       # Supervisor + agent routing
│   │   ├── api/          # FastAPI routes
│   │   ├── core/         # Config, database
│   │   ├── eval/         # Benchmark + evaluation runner
│   │   ├── graph/        # Knowledge graph (ISO 15926)
│   │   ├── ingestion/    # Document parsing pipeline
│   │   ├── models/       # DB models
│   │   ├── rag/          # Hybrid retrieval + query expansion
│   │   └── utils/        # PDF generation, helpers
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/pages/   # Copilot, RCA, Compliance, Work Permit, Graph
│       └── api/client.ts
├── eval/                 # Ground-truth Q&A set, results
├── docs/                 # Architecture documentation
├── start.bat / start.sh  # One-command local startup
└── README.md
```

---

## Questions

Open an issue on this repository, or see [`README.md`](README.md) for project overview and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for system design details.
