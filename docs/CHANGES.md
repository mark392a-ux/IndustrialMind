# Engineering Decisions

**IndustrialMind · ET AI Hackathon 2.0 (PS 8)**

This log records deliberate deviations from the original build plan, with the rationale for each. It is not a changelog of bugs fixed — it is a record of design trade-offs.

---

| Area | Decision | Rationale |
|---|---|---|
| **Primary LLM** | Replaced Claude Sonnet with DeepSeek R1 (reasoning) + Groq `llama-3.3-70b` (general) | Reduces per-query cost with no measurable drop in RAGAS faithfulness (0.989) or answer relevancy (0.889) |
| **Fallback strategy** | Added a 3-tier cascade (DeepSeek R1 → Groq 70B → Groq 8B → Gemini Flash) not in the original plan | Original plan had no fallback; a single-provider outage would have taken down every agent. The cascade absorbs rate limits and provider errors transparently |
| **Frontend** | Replaced Streamlit with Next.js + React | Streamlit's layout constraints limited custom UI components (structured report renderers, interactive checklists); React gives full control at a small setup cost |
| **Orchestration** | Replaced LangChain with a custom supervisor (`supervisor.py`) | Direct control over routing, retries, and fallback logic; avoids debugging through a framework's abstraction layers under hackathon time pressure |
| **Knowledge Graph ontology** | Replaced a custom NetworkX schema with ISO 15926 Part 2 | An industry-standard ontology is defensible to domain judges and generalizes to other plants without a bespoke schema per deployment |
| **Entity extraction** | Simplified from spaCy + LLM to Groq LLM only | One fewer dependency to maintain; extraction F1 (0.912) still clears target without spaCy in the loop |
| **P&ID parsing** | Replaced Claude Vision with Groq Vision | Equivalent output quality at lower cost per image |
| **Query expansion** | Added a query expansion engine (`query_expander.py`) — not in the original plan | Retrieval was failing on historical-incident queries (e.g. "Philadelphia") that don't share vocabulary with the source document text; an incident-expansion map closes that gap |
| **Report rendering** | Added structured UI renderers for all 4 agent outputs — not in the original plan | Raw markdown output from LLM agents was hard to scan under time pressure; dedicated components (5-Why chain, gap cards, checklists) make output audit-ready |
| **RAGAS evaluation scope** | Expanded from 5 to 20 Q&A pairs across 4 document types | A 5-pair eval is not a credible benchmark; 20 pairs across OISD, OEM, maintenance, and cross-functional documents gives judges a defensible sample size |
| **Containerization** | Deferred Docker/docker-compose in favor of `start.bat` / `start.sh` | Docker was not required for local judging; scripts get a working demo running faster. Docker remains the documented path for production (see `docs/ARCHITECTURE.md`) |
| **Risk Score Dashboard** | Dropped from scope | Lower judging weight than the four core agents; time reallocated to compliance detection and RCA quality instead |

---

For the full current architecture and the production migration path, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). For evaluation results referenced above, see [EVALUATION.md](./EVALUATION.md).
