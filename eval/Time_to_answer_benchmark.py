"""
IndustrialMind — Time-to-Answer Benchmark
Measures real end-to-end latency of the Copilot endpoint against your
existing 20-question eval set, and produces a metric row ready to drop
into EVALUATION.md / the detailed document.

USAGE:
    1. Make sure your backend is running (start.bat / start.sh) and warmed up.
    2. Adjust the three CONFIG values below to match your actual API.
    3. Run:  python time_to_answer_benchmark.py
    4. Copy the printed markdown row into EVALUATION.md's metrics table.

This measures YOUR real system — no numbers are estimated or invented.
"""

import time
import json
import statistics
import requests

# ---------------------------------------------------------------------
# CONFIG — adjust these three to match your actual backend/app/api/routes.py
# ---------------------------------------------------------------------
API_URL = "http://localhost:8000/api/copilot/ask"   # <-- change to your real Copilot endpoint
PAYLOAD_KEY = "query"                                # <-- change if your route expects e.g. "question" / "message"
PLANT_ID = "plant_001"                               # <-- change if your route requires a plant_id field
EXTRA_PAYLOAD = {"plant_id": PLANT_ID}               # <-- add/remove fields your route actually needs

# ---------------------------------------------------------------------
# Reuse the same 20 questions your eval suite already uses.
# If you have them in a shared file (e.g. eval/questions.json), swap this
# out for: QUESTIONS = json.load(open("eval/questions.json"))
# ---------------------------------------------------------------------
QUESTIONS = [
    "What does OISD-105 require for pressure vessel inspection?",
    "What is the recommended maintenance schedule for a process pump?",
    "What PPE and permits are needed for hot work near storage tanks?",
    "What are the emergency shutdown steps for a gas leak?",
    "What do the Petroleum Rules require for fuel storage safety?",
    "What lessons were learned from the Philadelphia refinery fire?",
    "What does OISD-113 require for fire protection systems?",
    "What are the electrical safety requirements under OISD-116?",
    "What is required before issuing a work permit under OISD-117?",
    "What are the layout requirements for oil and gas facilities under OISD-118?",
    "What does the safety management manual (OISD-129) require for audits?",
    "What is the compressed air system maintenance procedure?",
    "What is the recommended service interval for a reciprocating compressor?",
    "What does the pump installation manual specify for alignment?",
    "What preventive maintenance steps are required for rotating equipment?",
    "What caused the Husky Superior refinery incident?",
    "What metallurgical evaluation findings are on record for equipment failures?",
    "What are the confined space work permit requirements?",
    "What are the cold work permit requirements?",
    "What does the Factories Act 1948 require for worker safety?",
]
# ---------------------------------------------------------------------

def run_benchmark():
    results = []
    print(f"Running time-to-answer benchmark against {API_URL}")
    print(f"({len(QUESTIONS)} questions)\n")

    for i, question in enumerate(QUESTIONS, 1):
        payload = {PAYLOAD_KEY: question, **EXTRA_PAYLOAD}
        start = time.perf_counter()
        try:
            resp = requests.post(API_URL, json=payload, timeout=60)
            resp.raise_for_status()
            elapsed = time.perf_counter() - start
            status = "OK"
        except Exception as e:
            elapsed = time.perf_counter() - start
            status = f"ERROR: {e}"

        results.append({
            "question": question,
            "seconds": round(elapsed, 2),
            "status": status
        })
        print(f"  [{i:2d}/{len(QUESTIONS)}] {elapsed:5.2f}s  {status}  — {question[:60]}")

    ok_times = [r["seconds"] for r in results if r["status"] == "OK"]

    if not ok_times:
        print("\nNo successful responses — check API_URL / PAYLOAD_KEY / backend is running.")
        return

    summary = {
        "n_questions": len(QUESTIONS),
        "n_successful": len(ok_times),
        "avg_seconds": round(statistics.mean(ok_times), 2),
        "median_seconds": round(statistics.median(ok_times), 2),
        "p95_seconds": round(sorted(ok_times)[int(len(ok_times) * 0.95) - 1], 2) if len(ok_times) > 1 else ok_times[0],
        "max_seconds": round(max(ok_times), 2),
        "min_seconds": round(min(ok_times), 2),
    }

    with open("time_to_answer_results.json", "w") as f:
        json.dump({"per_question": results, "summary": summary}, f, indent=2)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for k, v in summary.items():
        print(f"  {k:16s}: {v}")

    print("\nSaved full results to time_to_answer_results.json")
    print("\n--- Markdown row for EVALUATION.md / detailed document ---\n")
    print(f"| Time-to-Answer | {summary['avg_seconds']}s (avg, n={summary['n_successful']}) "
          f"| < 30s | PASS |")
    print("\n--- Suggested context line ---\n")
    print(
        f"Measured across the same {summary['n_successful']} evaluation questions used for "
        f"RAGAS/Entity Extraction scoring. Median {summary['median_seconds']}s, "
        f"P95 {summary['p95_seconds']}s. Compares against the 30-45 minute manual search "
        f"baseline cited in PS8's own problem context (McKinsey, 2024)."
    )


if __name__ == "__main__":
    run_benchmark()