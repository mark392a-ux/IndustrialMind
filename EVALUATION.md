# IndustrialMind (PS 8)

**ET AI Hackathon 2.0 — Phase 2**
**Problem Statement 8**: AI for Industrial Knowledge Intelligence
**Last Updated**: 22 July 2026

## Overview

IndustrialMind was evaluated using **20 ground-truth Q&A pairs** derived from real industrial documents (OISD standards, OEM manuals, CSB reports, Factory Act excerpts). The evaluation covers all major judging focus areas: entity extraction, retrieval quality, compliance accuracy, and knowledge graph linkage.

**Corpus Details**:
- **37 documents** ingested
- Document types: OISD standards, maintenance manuals, incident reports, permit templates, P&IDs
- Eval model: `llama-3.1-8b-instant` (separate quota from the primary 70B inference model, to avoid contaminating the eval with the model being evaluated)

---

## Evaluation Results

### 1. Entity Extraction Accuracy

Method: Regex + Groq LLM validation on equipment tags, standards, and parameters (zero-token regex pass).

```text
F1 Score     : 0.912  (Target: > 0.75)  ✅
Precision    : 0.873
Recall       : 0.967
```

### 2. RAGAS-Style Scores (20 Q&A pairs)

Eval model: `llama-3.1-8b-instant`

| Metric | Score | Target | Status |
|---|---|---|---|
| Faithfulness | 0.989 | > 0.75 | ✅ |
| Answer Relevancy | 0.889 | > 0.75 | ✅ |
| Context Precision | 0.980 | > 0.70 | ✅ |

**Per-question breakdown** (F = Faithfulness, R = Relevancy, P = Context Precision):

| # | Question | F | R | P |
|---|---|---|---|---|
| 1 | What does OISD-105 require for pressure vessel inspection... | 1.00 | 0.89 | 1.00 |
| 2 | What is the maximum allowable working pressure for a Cl... | 1.00 | 0.89 | 1.00 |
| 3 | What PPE is required for hot work in a petroleum installation... | 1.00 | 0.89 | 1.00 |
| 4 | What are the OISD-118 requirements for fire hydrant spa... | 1.00 | 0.89 | 1.00 |
| 5 | What does OISD-105 specify for safety relief valve test... | 1.00 | 0.89 | 1.00 |
| 6 | What is the recommended bearing replacement interval fo... | 1.00 | 0.89 | 1.00 |
| 7 | What oil viscosity grade is specified for the pump gear... | 1.00 | 0.89 | 0.80 |
| 8 | What are the alignment tolerances for pump coupling ins... | 1.00 | 0.89 | 1.00 |
| 9 | What does the service guide specify for mechanical seal... | 1.00 | 0.89 | 1.00 |
| 10 | What are the startup checks before operating the centri... | 1.00 | 0.89 | 1.00 |
| 11 | What are the emergency shutdown steps for a gas leak? | 0.89 | 0.89 | 1.00 |
| 12 | What are the isolation steps before maintenance on pres... | 1.00 | 0.89 | 1.00 |
| 13 | What gas detection thresholds trigger evacuation in the... | 1.00 | 0.89 | 1.00 |
| 14 | What PPE is mandatory for confined space entry? | 0.89 | 0.89 | 1.00 |
| 15 | What are the permit-to-work requirements for hot work n... | 1.00 | 0.89 | 1.00 |
| 16 | Which equipment tags are linked to OISD-105 inspection... | 1.00 | 0.89 | 1.00 |
| 17 | What standards apply to rotating equipment maintenance... | 1.00 | 0.89 | 1.00 |
| 18 | What activities are associated with pressure vessel ins... | 1.00 | 0.89 | 0.80 |
| 19 | Which documents reference API 571 degradation mechanism... | 1.00 | 0.89 | 1.00 |
| 20 | What are the corrective actions for centrifugal pump vi... | 1.00 | 0.89 | 1.00 |

All 20 pairs showed strong source citation behavior, with the only faithfulness dips (0.89) on the two emergency-response questions (#11, #14) and the only context-precision dips (0.80) on two OEM-manual questions (#7, #18) — both still well above target.

### 3. Compliance Gap Detection

```text
Precision : 1.000  (Target: > 0.80)  ✅
Recall    : 1.000  (Target: > 0.75)  ✅
F1        : 1.000

TP: 9 | FP: 0 | TN: 6 | FN: 0
```

Tested Standards: OISD-105, 106, 113, 116, 117, 118, 129 + Factory Act + PESO.

### 4. Knowledge Graph Linkage Coverage

```text
Coverage : 100.0%  (Target: > 80%)  ✅
Linked   : 72 / 72 docs
```

---

## Full Run Output

```text
IndustrialMind Evaluation Suite
====================================================
GROQ_API_KEY: SET ✅
Eval model:   llama-3.1-8b-instant  (separate quota from 70b)

1/4  Entity Extraction F1  (regex — zero tokens)...
   F1: 0.912 ✅  (target > 0.75)
   Precision: 0.873   Recall: 0.967

2/4  RAGAS-style Scores  (llama-3.1-8b-instant)...
  Scoring 20 ground truth Q&A pairs (model: llama-3.1-8b-instant)...
  [1/20]  F:1.00 R:0.89 P:1.00
  [2/20]  F:1.00 R:0.89 P:1.00
  [3/20]  F:1.00 R:0.89 P:1.00
  [4/20]  F:1.00 R:0.89 P:1.00
  [5/20]  F:1.00 R:0.89 P:1.00
  [6/20]  F:1.00 R:0.89 P:1.00
  [7/20]  F:1.00 R:0.89 P:0.80
  [8/20]  F:1.00 R:0.89 P:1.00
  [9/20]  F:1.00 R:0.89 P:1.00
  [10/20] F:1.00 R:0.89 P:1.00
  [11/20] F:0.89 R:0.89 P:1.00
  [12/20] F:1.00 R:0.89 P:1.00
  [13/20] F:1.00 R:0.89 P:1.00
  [14/20] F:0.89 R:0.89 P:1.00
  [15/20] F:1.00 R:0.89 P:1.00
  [16/20] F:1.00 R:0.89 P:1.00
  [17/20] F:1.00 R:0.89 P:1.00
  [18/20] F:1.00 R:0.89 P:0.80
  [19/20] F:1.00 R:0.89 P:1.00
  [20/20] F:1.00 R:0.89 P:1.00
   Faithfulness:      0.989  ✅  (target > 0.75)
   Answer Relevancy:  0.889  ✅  (target > 0.75)
   Context Precision: 0.980  ✅  (target > 0.70)

3/4  Compliance Precision/Recall  (llama-3.1-8b-instant + retry)...
   Precision: 1.000  ✅  (target > 0.80)
   Recall:    1.000  ✅  (target > 0.75)
   F1:        1.000
   TP:9  FP:0  TN:6  FN:0

4/4  Knowledge Graph Linkage Coverage...
   Coverage: 100.0%  ✅  (target > 80%)
   Linked: 72 / 72 docs
====================================================
Results saved → eval/results.json
```

---

## Methodology

- **Ground Truth**: Manually created 20 high-quality Q&A pairs with clear expected answers and source references.
- **Automation**: `backend/eval/run_eval.py` script (fully reproducible).
- **LLM Usage**: Dedicated eval model (`llama-3.1-8b-instant`) to avoid contamination with primary inference models.
- **Metrics**:
  - RAGAS framework for faithfulness, relevancy, and context precision.
  - Custom scripts for entity extraction and compliance precision/recall.
  - Graph traversal coverage measured via NetworkX.

---

## README Metrics Table

```markdown
| Metric                    | Score  | Target | Status |
|---------------------------|--------|--------|--------|
| Entity Extraction F1      | 0.912  | >0.75  | ✅ |
| RAGAS Faithfulness        | 0.989  | >0.75  | ✅ |
| RAGAS Answer Relevancy    | 0.889  | >0.75  | ✅ |
| RAGAS Context Precision   | 0.980  | >0.70  | ✅ |
| Compliance Precision      | 1.000  | >0.80  | ✅ |
| Compliance Recall         | 1.000  | >0.75  | ✅ |
| KG Linkage Coverage       | 100.0% | >80%   | ✅ |
```

---

## Key Strengths Demonstrated

- Near-perfect compliance detection
- Excellent faithfulness (minimal hallucination)
- Strong knowledge graph integration for contextual answers
- Robust fallback chain ensures reliability under production-like conditions

---

## Reproducibility

```bash
cd backend
python ../eval/run_eval.py
```

Results are saved to `eval/results.json`.
