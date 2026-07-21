"""
Query Pre-processor for Industrial Search.
Normalizes standard names, fixes spacing, and expands abbreviations
so ChromaDB and BM25 find the right documents.
"""

import re
from groq import Groq
from app.core.config import settings


def get_groq():
    return Groq(api_key=settings.groq_api_key)


# ── 1. Hardcoded Regex Rules (Instant, Free) ──────────────────────────────────

STANDARD_PATTERNS = {
    r"\boisd\s*\.?\s*(\d{1,4})\b":             r"OISD-\1",
    r"\bapi\s*\.?\s*(\d{1,4})\b":              r"API \1",
    r"\basme\s*\.?\s*(\d{1,4})\b":             r"ASME \1",
    r"\bfactory act\s*sec\.?\s*(\w[\w\d]*)\b": r"Factory Act Section \1",
    r"\bpeso\b":   "PESO Petroleum and Explosives Safety Organisation",
    r"\bptw\b":    "Permit to Work PTW",
    r"\bhazop\b":  "HAZOP Hazard and Operability Study",
    r"\blo?to\b":  "LOTO Lockout Tagout",
    r"\brca\b":    "Root Cause Analysis RCA failure investigation",
    r"\bapm\b":    "Asset Performance Management APM",
    r"\bcms\b":    "Condition Monitoring System",
}

# ── 2. CSB / Incident report keyword map ──────────────────────────────────────
# When a user mentions a company or incident name, expand with
# the failure mechanism terms that actually appear in the chunk text.
# This bridges the gap between "Philadelphia" (user term) and
# "naphtha hydrofluoric alkylation fire vapor cloud" (chunk text).

INCIDENT_EXPANSIONS: dict[str, str] = {
    "philadelphia": (
        "Philadelphia Energy Solutions refinery fire naphtha "
        "hydrofluoric acid alkylation unit vapor cloud explosion CSB"
    ),
    "husky":        (
        "Husky Superior refinery explosion asphalt processing unit "
        "flash fire fatality CSB investigation"
    ),
    "texas city":   (
        "Texas City refinery explosion BP raffinate splitter "
        "bleve fatality CSB investigation"
    ),
    "buncefield":   (
        "Buncefield oil storage depot explosion vapor cloud "
        "petrol tank overfill fire UK"
    ),
    "piper alpha":  (
        "Piper Alpha offshore platform explosion gas condensate "
        "fire fatality Cullen inquiry"
    ),
    "deepwater horizon": (
        "Deepwater Horizon Macondo blowout explosion "
        "well control oil spill Gulf of Mexico CSB"
    ),
    "metallurgical": (
        "metallurgical evaluation depropanizer line rupture "
        "stress corrosion cracking CSB"
    ),
    "burst incident": (
        "burst incident pressure vessel rupture overpressure "
        "safety relief valve failure"
    ),
    "blowout":      (
        "blowout well control loss primary barrier failure "
        "gas kick oil spill offshore"
    ),
    "crude distillation": (
        "crude distillation unit tower fire overpressure "
        "heat exchanger tube rupture hydrocarbon release"
    ),
    "battery rom":  (
        "battery ROM facility fire chemical storage "
        "flammable liquid ignition CSB"
    ),
    "explosion furnace": (
        "fired heater furnace explosion tube failure "
        "fuel gas accumulation ignition"
    ),
    "h2s exposure": (
        "hydrogen sulphide H2S exposure toxic gas asphyxiation "
        "confined space sour service PPE"
    ),
    "pipeline leakage": (
        "pipeline leak corrosion erosion joint failure "
        "hydrocarbon release detection"
    ),
}


def apply_regex_normalization(query: str) -> str:
    """Apply instant regex fixes to standardize industrial terms."""
    normalized = query
    for pattern, replacement in STANDARD_PATTERNS.items():
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)
    return normalized


def apply_incident_expansion(query: str) -> str:
    """
    If query mentions a known incident or company name,
    expand with the failure-mechanism terms that appear in chunk text.
    This is the key fix for CSB/incident document retrieval.
    """
    q_lower = query.lower()
    expansions = []
    for keyword, expansion in INCIDENT_EXPANSIONS.items():
        if keyword in q_lower:
            expansions.append(expansion)

    if expansions:
        return query + " " + " ".join(expansions)
    return query


# ── 3. Extract Exact Compound Terms (For Proximity Matching) ──────────────────

def extract_compounds(query: str) -> list[str]:
    """
    Extracts codes/compound terms that MUST appear together.
    e.g., "OISD-105" -> ["OISD-105"]
    e.g., "Factory Act Section 7B" -> ["Factory Act Section 7B"]
    e.g., "pump P-101" -> ["P-101"]
    """
    compounds = []

    # Match patterns like OISD-105, API 610, P-101, Section 7B
    code_pattern = r'\b([A-Za-z]{2,}[\s\-./]*\d[\d\w\-./]*)\b'
    for match in re.finditer(code_pattern, query):
        term = match.group(1).strip()
        if len(term) > 2:
            compounds.append(term)

    # Match explicit quoted phrases
    quoted = re.findall(r'"([^"]+)"', query)
    compounds.extend(quoted)

    return list(dict.fromkeys(compounds))


# ── 4. LLM-Based Expansion ────────────────────────────────────────────────────

EXPANSION_PROMPT = """You are an industrial document search query optimizer for oil & gas plants.
The user wants to search a corpus of documents including:
- OISD safety standards (OISD-105, OISD-118, etc.)
- CSB investigation reports (Philadelphia, Husky, Texas City, etc.)
- OEM equipment manuals (pumps, compressors, heat exchangers)
- Factory Act and PESO regulations
- Maintenance work orders and inspection records

Rewrite the user's query to maximize document retrieval. Rules:
1. Fix standard numbering (e.g. "OISD 105" → "OISD-105", "API 610" → "API 610")
2. Expand abbreviations (PTW → Permit to Work, HAZOP → Hazard and Operability Study)
3. For STANDARD queries: add related OISD codes (e.g. "pressure vessel" → add "OISD-105")
4. For INCIDENT/CSB queries: add the FAILURE MECHANISM terms (e.g. "Philadelphia refinery" → add "naphtha fire vapor cloud explosion alkylation")
5. For EQUIPMENT queries: add the failure modes (e.g. "pump failure" → add "bearing seal cavitation vibration")
6. Keep the original intent. Return ONLY the optimized query, nothing else. Max 120 words.

Original Query: {query}
Optimized Query:"""


def llm_expand_query(query: str) -> str:
    """Use fast LLM to expand query with industrial synonyms."""
    try:
        client = get_groq()
        resp = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            max_tokens=120,
            temperature=0.0,
            messages=[{"role": "user", "content": EXPANSION_PROMPT.format(query=query)}],
        )
        expanded = resp.choices[0].message.content.strip()
        # Sanity check — if LLM returns garbage, fall back
        if len(expanded) < 5 or len(expanded) > 600:
            return apply_regex_normalization(query)
        return expanded
    except Exception:
        return apply_regex_normalization(query)


# ── 5. Main entry point ───────────────────────────────────────────────────────

def optimize_search_query(query: str, use_llm: bool = True) -> tuple[str, list[str]]:
    """
    Main entry point. Returns:
    - The optimized query string
    - A list of compound terms for exact proximity matching

    Pipeline:
      Raw query
        → regex normalization      (fixes OISD 105 → OISD-105 etc.)
        → incident expansion       (adds failure mechanism terms for CSB/company queries)
        → LLM expansion            (adds synonyms, related standards, equipment failure modes)
        → compound extraction      (for proximity boosting in BM25)
    """
    # Step 1 — regex normalization (free, instant)
    step1 = apply_regex_normalization(query)

    # Step 2 — incident/company name expansion (free, instant)
    # MUST run before LLM so the LLM also sees the expanded context
    step2 = apply_incident_expansion(step1)

    # Step 3 — LLM expansion (fast, uses llama-3.1-8b-instant)
    if use_llm:
        final_query = llm_expand_query(step2)
    else:
        final_query = step2

    # Step 4 — extract compound terms for proximity boosting
    compounds = extract_compounds(final_query)

    return final_query, compounds