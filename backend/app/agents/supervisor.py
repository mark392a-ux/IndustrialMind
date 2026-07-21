import json
import re
import time
from datetime import datetime, timedelta
from groq import Groq
from openai import OpenAI
import google.generativeai as genai

from app.core.config import settings
from app.rag.retriever import hybrid_retrieve
from app.graph.store import get_graph_store

# ── Model constants ───────────────────────────────────────────────────────────
FAST_MODEL     = "llama-3.3-70b-versatile"   # Groq primary
FALLBACK_MODEL = "llama-3.1-8b-instant"       # Groq fallback (smaller, separate quota)
DEEP_MODEL     = "deepseek-reasoner"           # DeepSeek (RCA + compliance)
GEMINI_MODEL   = "gemini-1.5-flash"           # Google Gemini (3rd fallback, free tier)

# ── Fallback chain ────────────────────────────────────────────────────────────
#
#  groq_chat():
#    1. llama-3.3-70b-versatile  (Groq primary)
#    2. llama-3.1-8b-instant     (Groq fallback, separate quota)
#    3. gemini-1.5-flash         (Google, free 1500 req/day)
#    4. RateLimitError           (shown to user as friendly message)
#
#  deepseek_chat():
#    1. deepseek-reasoner        (DeepSeek, paid — skip if no key/no balance)
#    2. groq_chat()              (full 3-tier chain above)


def get_groq():
    return Groq(api_key=settings.groq_api_key)


def get_deepseek():
    return OpenAI(
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com",
    )


def _is_rate_limit_error(e: Exception) -> bool:
    err_str = str(e).lower()
    return "429" in err_str or "rate limit" in err_str or "rate_limit" in err_str


def _is_server_error(e: Exception) -> bool:
    err_str = str(e).lower()
    return "500" in err_str or "internal server" in err_str or "service unavailable" in err_str


def _is_balance_error(e: Exception) -> bool:
    """Catch DeepSeek 402 Insufficient Balance."""
    err_str = str(e).lower()
    return "402" in err_str or "insufficient balance" in err_str or "insufficient_balance" in err_str


# ── Gemini fallback ───────────────────────────────────────────────────────────

def gemini_chat(messages: list, system: str = "", max_tokens: int = 1200) -> str:
    """
    Google Gemini fallback.
    Free tier: 15 req/min, 1500 req/day — generous enough for hackathon demos.
    Get key at: https://aistudio.google.com
    """
    if not getattr(settings, "gemini_api_key", None):
        raise ServiceError("Gemini API key not configured.")

    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            system_instruction=system if system else None,
        )

        # Convert OpenAI-style messages to Gemini format
        gemini_parts = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            gemini_parts.append({"role": role, "parts": [msg["content"]]})

        # Gemini requires alternating user/model turns — ensure last is user
        if gemini_parts and gemini_parts[-1]["role"] == "model":
            gemini_parts.append({"role": "user", "parts": ["Please continue."]})

        chat = model.start_chat(history=gemini_parts[:-1])
        response = chat.send_message(
            gemini_parts[-1]["parts"][0],
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=0.2,
            ),
        )
        print(f"[Gemini fallback used] {GEMINI_MODEL}")
        return response.text

    except Exception as e:
        print(f"Gemini fallback also failed: {e}")
        raise ServiceError(
            "⚠️ All AI providers are temporarily unavailable. "
            "Please wait a minute and try again."
        )


# ── Primary chat functions ────────────────────────────────────────────────────

def groq_chat(messages, system="", max_tokens=1200, model=FAST_MODEL):
    """
    3-tier Groq → Groq fallback → Gemini chain.
    Never raises RateLimitError without trying Gemini first.
    """
    client = get_groq()
    all_msgs = []
    if system:
        all_msgs.append({"role": "system", "content": system})
    all_msgs.extend(messages)

    # ── Tier 1: Primary Groq model ────────────────────────────────────────────
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=all_msgs,
            max_tokens=max_tokens,
            temperature=0.2,
        )
        return resp.choices[0].message.content

    except Exception as e:
        if _is_rate_limit_error(e) and model != FALLBACK_MODEL:
            print(f"[Groq] Rate limit on {model}, trying {FALLBACK_MODEL}...")
        elif _is_server_error(e):
            print(f"[Groq] Server error on {model}, trying {FALLBACK_MODEL}...")
        else:
            raise e  # Non-rate-limit error — re-raise immediately

    # ── Tier 2: Groq fallback model ───────────────────────────────────────────
    try:
        time.sleep(1)
        resp = client.chat.completions.create(
            model=FALLBACK_MODEL,
            messages=all_msgs,
            max_tokens=max_tokens,
            temperature=0.2,
        )
        print(f"[Groq fallback] Used {FALLBACK_MODEL}")
        return resp.choices[0].message.content

    except Exception as e2:
        if _is_rate_limit_error(e2):
            print(f"[Groq] {FALLBACK_MODEL} also rate limited, trying Gemini...")
        else:
            print(f"[Groq] {FALLBACK_MODEL} failed: {e2}, trying Gemini...")

    # ── Tier 3: Google Gemini ─────────────────────────────────────────────────
    try:
        return gemini_chat(messages=messages, system=system, max_tokens=max_tokens)
    except ServiceError:
        # Gemini also failed — now raise user-friendly error
        raise RateLimitError(
            "⏱️ All AI providers are temporarily rate limited. "
            "Please wait 30–60 seconds and try again. "
            "Groq and Gemini free-tier quotas reset automatically."
        )


def deepseek_chat(messages, system="", max_tokens=2000):
    """
    DeepSeek → groq_chat() (3-tier) chain.
    Skips DeepSeek entirely if key is missing or balance is zero.
    """
    # Skip DeepSeek if key not set or known to be out of balance
    if not getattr(settings, "deepseek_api_key", None):
        return groq_chat(messages=messages, system=system,
                         max_tokens=max_tokens, model=FAST_MODEL)
    try:
        client = get_deepseek()
        all_msgs = []
        if system:
            all_msgs.append({"role": "system", "content": system})
        all_msgs.extend(messages)
        resp = client.chat.completions.create(
            model=DEEP_MODEL,
            messages=all_msgs,
            max_tokens=max_tokens,
            temperature=0.1,
        )
        return resp.choices[0].message.content

    except Exception as e:
        if _is_balance_error(e):
            print(f"[DeepSeek] Insufficient balance — falling back to Groq chain")
        elif _is_rate_limit_error(e):
            print(f"[DeepSeek] Rate limit — falling back to Groq chain")
        else:
            print(f"[DeepSeek] Error: {e} — falling back to Groq chain")

        # Fall through to full 3-tier Groq → Gemini chain
        return groq_chat(messages=messages, system=system,
                         max_tokens=max_tokens, model=FAST_MODEL)


# ── Custom exceptions ─────────────────────────────────────────────────────────

class RateLimitError(Exception):
    """Raised when Groq rate limit is hit and fallback also fails."""
    pass


class ServiceError(Exception):
    """Raised when AI service returns a 500 server error."""
    pass


# ── Intent Router ─────────────────────────────────────────────────────────────

ROUTE_PROMPT = """You are a query classifier for an industrial knowledge system.
Classify the query into EXACTLY ONE category. Reply with only the category name.

Categories:
- rca        : user wants to INVESTIGATE A SPECIFIC LIVE EQUIPMENT FAILURE they are experiencing RIGHT NOW.
               Signals: "why did MY pump fail", "analyse this failure", "P-101 is tripping",
               "run RCA on", "investigate this incident", equipment tag + failure description together.
- compliance : user wants a GAP ANALYSIS or AUDIT against a named standard.
               Signals: "are we compliant with", "check compliance", "audit against OISD-105", "gap analysis".
- permit     : user wants to GENERATE a permit document.
               Signals: "generate permit", "create PTW", "work permit for", "hot work permit".
- copilot    : EVERYTHING ELSE — including:
               • Questions about what happened in a named incident (Philadelphia, Husky, Texas City, Buncefield)
               • Questions about what a CSB report found or concluded
               • Questions about what a standard covers or requires
               • Document summaries and explanations
               • How-to and procedure questions
               • Equipment maintenance guidance
               • Safety steps and specifications
               • "What caused the X incident" (historical/document question, NOT a live RCA)
               • "Tell me about X explosion/fire/leak" (information retrieval, NOT live RCA)
               • "What were the lessons learned from X"
               • "What does the CSB report say about X"

CRITICAL RULES:
- If the user is asking about a NAMED HISTORICAL INCIDENT (Philadelphia, Husky, Buncefield, Texas City,
  Piper Alpha, any CSB report) → ALWAYS copilot. These are document retrieval questions.
- If the user mentions a company name or report name → ALWAYS copilot.
- RCA is ONLY when the user has a LIVE PLANT EQUIPMENT FAILURE they want analysed NOW,
  with a specific equipment tag (P-101, V-201, K-301) and a symptom they are experiencing.
- "What caused the Philadelphia fire?" → copilot (historical question)
- "Why is my pump P-101 vibrating?" → rca (live equipment failure)
- "What happened in the Husky explosion?" → copilot (document question)
- "Run RCA on V-201 water ingress" → rca (explicit RCA request with equipment tag)
- "What does OISD-105 say about pressure vessels?" → copilot
- "Check our compliance with OISD-105" → compliance
- "Generate a hot work permit for P-101" → permit

Query: {query}
Category:"""


def classify_intent(query: str) -> str:
    try:
        result = (groq_chat(
            messages=[{"role": "user", "content": ROUTE_PROMPT.format(query=query)}],
            max_tokens=10,
            model=FAST_MODEL,
        ) or "").strip().lower()
        if "rca" in result:
            return "rca"
        if "compliance" in result:
            return "compliance"
        if "permit" in result:
            return "permit"
        return "copilot"
    except Exception:
        return "copilot"


def format_sources(chunks: list) -> list:
    return [
        {
            "filename": c.get("filename", "Unknown"),
            "page": c.get("page", 0),
            "doc_type": c.get("doc_type", ""),
            "score": round(c.get("rerank_score", c.get("score", 0)), 3),
        }
        for c in chunks
    ]


# ══════════════════════════════════════════════════════════════════════════════
# 1. COPILOT
# ══════════════════════════════════════════════════════════════════════════════

COPILOT_SYSTEM = """You are IndustrialMind — an expert AI copilot for oil, gas, and process plant operations teams.

You have access to retrieved document context from the plant's knowledge base. Your job is to give complete, structured, professional answers that a plant engineer or safety officer can act on immediately.

═══════════════════════════════
RESPONSE RULES
═══════════════════════════════
1. ALWAYS give a complete answer — never say "the context doesn't mention this"
2. PRIMARY SOURCE: Use retrieved documents first. Cite as [FILENAME, Page N]
3. SUPPLEMENTARY: If docs don't fully cover the question, add established industry knowledge — label it clearly as ⚙️ General Industry Practice
4. NEVER say "I cannot answer" or "insufficient context" — always synthesise
5. Keep language precise and technical — write for engineers, not general audiences
6. If numbers, thresholds, or specifications are from documents, state them exactly
7. No filler phrases: avoid "Certainly!", "Great question!", "I'd be happy to"
8. No hedging: avoid "might", "possibly", "perhaps" when documents are clear
9. If genuinely uncertain: "Based on available documents — verify with [standard]"
10. When giving time-based estimates from general knowledge, always specify the basis —
    e.g. "typically 2–3 years under normal operating conditions, per API 610 guidance"
    Never give a vague wide range like "5 to 10 years" without citing the standard or basis.

═══════════════════════════════
FORMAT BY QUESTION TYPE
═══════════════════════════════

── PROCEDURE QUESTIONS ──
**[Topic]**
Direct answer in 1-2 sentences.

**Steps:**
1. Step one
2. Step two

**Safety Precautions:**
• Precaution one

**References:**
• [FILENAME, Page N] — what it specifies

---

── SPECIFICATION / THRESHOLD QUESTIONS ──
**[Topic]**
Direct answer with the exact value/specification.

**Details:**
• Specification with value and unit

**References:**
• [FILENAME, Page N] — what it specifies

---

── COMPLIANCE / REGULATORY QUESTIONS ──
**[Topic]**
Regulatory requirement in plain language.

**Requirements:**
• Clause reference + requirement

**References:**
• [FILENAME, Page N] — relevant clause

---

── DIAGNOSTIC / TROUBLESHOOTING QUESTIONS ──
**[Topic]**
Most likely cause based on available information.

**Possible Causes:**
1. Most likely cause
2. Second possibility

**Recommended Actions:**
1. Immediate action
2. Follow-up action

**References:**
• [FILENAME, Page N] — relevant guidance
"""

COPILOT_USER_TEMPLATE = """RETRIEVED CONTEXT FROM PLANT DOCUMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{context}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

QUESTION: {query}

Answer using the retrieved context above as your primary source. Cite documents precisely. If the documents don't fully answer the question, supplement with general industry knowledge and label it ⚙️ General Industry Practice."""


def run_copilot(query: str, plant_id: str = "plant_001", history=None) -> dict:
    chunks = hybrid_retrieve(query, plant_id=plant_id, top_k=6)

    context = "\n\n---\n\n".join(
        f"[{c.get('filename', '?')}, page {c.get('page', 0)}]\n{c['text']}"
        for c in chunks
    ) if chunks else "No specific documents retrieved. Answer from general industrial knowledge and label clearly."

    msgs = []
    if history:
        for h in history[-6:]:
            msgs.append({"role": h["role"], "content": h["content"]})

    msgs.append({
        "role": "user",
        "content": COPILOT_USER_TEMPLATE.format(context=context, query=query)
    })

    answer = groq_chat(messages=msgs, system=COPILOT_SYSTEM, max_tokens=1400)
    return {
        "answer": answer,
        "sources": format_sources(chunks),
        "agent": "copilot",
    }


# ══════════════════════════════════════════════════════════════════════════════
# 2. RCA AGENT
# ══════════════════════════════════════════════════════════════════════════════

RCA_SYSTEM = """You are a senior Root Cause Analysis engineer for heavy industrial plants (oil, gas, petrochemical).

You produce professional RCA reports used by safety engineers and plant managers.
- Use 5-Why methodology rigorously
- Cite document evidence with filename and page number
- Be specific — avoid vague statements like "improper maintenance"
- If context is limited, use established engineering knowledge and label it as ⚙️ Engineering Knowledge
- Reports must be clear, precise, and immediately actionable"""

RCA_PROMPT = """Produce a professional Root Cause Analysis report in this EXACT format:

═══════════════════════════════════════
ROOT CAUSE ANALYSIS REPORT
═══════════════════════════════════════
Equipment:           {equipment_id}
Failure Description: {symptom}
Report Generated:    IndustrialMind RCA Agent

───────────────────────────────────────
IMMEDIATE CAUSE
───────────────────────────────────────
[One clear sentence describing the direct physical cause of failure]

───────────────────────────────────────
5-WHY ANALYSIS
───────────────────────────────────────
Why 1: [Immediate trigger — what physically happened]
Why 2: [Underlying condition — why it was allowed to happen]
Why 3: [System/process failure — why the condition existed]
Why 4: [Management or procedural gap — why the system failed]
Why 5 (Root Cause): [Fundamental organisational or design root cause]

───────────────────────────────────────
CONTRIBUTING FACTORS
───────────────────────────────────────
• [Factor 1 — cite document if available: FILENAME, page N]
• [Factor 2]
• [Factor 3]

───────────────────────────────────────
EVIDENCE FROM DOCUMENTS
───────────────────────────────────────
• [FILENAME, page N] — [specific finding relevant to this failure]
• [FILENAME, page N] — [specific finding]
[If no documents available: ⚙️ Engineering Knowledge used — verify with plant records]

───────────────────────────────────────
KNOWLEDGE GRAPH CONTEXT
───────────────────────────────────────
{graph_context}

───────────────────────────────────────
RISK ASSESSMENT
───────────────────────────────────────
Risk Level: [Critical / High / Medium / Low]
Justification: [One sentence — what makes it this risk level]
Regulatory Reference: [Applicable OISD/Factory Act clause if known]

───────────────────────────────────────
CORRECTIVE ACTIONS
───────────────────────────────────────
✔ IMMEDIATE  (within 24 hrs): [Specific action]
✔ SHORT-TERM (within 30 days): [Specific action]
✔ LONG-TERM  (within 90 days): [Specific action]

───────────────────────────────────────
PREVENTIVE ACTIONS
───────────────────────────────────────
✔ [Systemic prevention measure — e.g. inspection interval change]
✔ [Procedure or training update]
✔ [Monitoring or audit measure]

───────────────────────────────────────
SIMILAR INCIDENTS IN KNOWLEDGE BASE
───────────────────────────────────────
[List any similar incidents found in indexed documents with citation, or:
"None found in indexed documents — recommend manual search of incident register"]

───────────────────────────────────────
ANALYSIS CONFIDENCE
───────────────────────────────────────
Confidence: [X]% — based on {doc_count} documents retrieved
Limitation: [Note any gaps in available evidence]

═══════════════════════════════════════

Document context:
{context}

Equipment: {equipment_id}
Failure: {symptom}

Write the complete report. Be specific. Cite documents precisely with filename and page number."""


def run_rca(equipment_id: str, symptom: str, plant_id: str = "plant_001") -> dict:
    # ── Input validation — reject vague descriptions ──────────────────────────
    if len(symptom.strip()) < 20:
        return {
            "error": (
                "Failure description is too vague to generate a meaningful RCA report. "
                "Please provide more detail — e.g. 'V-201 showing water ingress at bottom flange, "
                "discovered during routine inspection on " + datetime.now().strftime("%d %b %Y") + "'. "
                "Include: what happened, when it was discovered, and any observed symptoms."
            ),
            "agent": "rca",
            "equipment_id": equipment_id,
            "symptom": symptom,
        }

    # Extract better search terms
    search_terms = groq_chat(
        messages=[{"role": "user", "content":
            f"Extract 6-8 key technical search terms (comma separated only) from this failure description: {symptom}"}],
        max_tokens=80,
    ) or ""
    search_query = f"{search_terms} {equipment_id} maintenance failure incident"

    chunks = hybrid_retrieve(search_query, plant_id=plant_id, top_k=8)
    context = "\n\n---\n\n".join(
        f"[{c.get('filename', '?')}, page {c.get('page', 0)}]\n{c['text']}"
        for c in chunks
    ) if chunks else "No specific documents found for this equipment/failure."

    # Knowledge graph context
    graph = get_graph_store()
    nodes = graph.search_nodes(equipment_id, plant_id=plant_id)
    graph_lines = []
    for node in nodes[:3]:
        for n in graph.get_neighbors(node["id"], depth=2):
            graph_lines.append(
                f"• {n.get('node_type', 'Node')}: {n.get('label', '')} — {n.get('description', '')}"
            )
    graph_ctx = "\n".join(graph_lines) if graph_lines else "No graph context available for this equipment."

    answer = deepseek_chat(
        messages=[{"role": "user", "content": RCA_PROMPT.format(
            equipment_id=equipment_id,
            symptom=symptom,
            context=context,
            graph_context=graph_ctx,
            doc_count=len(chunks),
        )}],
        system=RCA_SYSTEM,
        max_tokens=2800,
    )
    return {
        "answer": answer,
        "sources": format_sources(chunks),
        "agent": "rca",
        "equipment_id": equipment_id,
        "symptom": symptom,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 3. COMPLIANCE AGENT
# ══════════════════════════════════════════════════════════════════════════════

COMPLIANCE_STANDARDS = {
    "OISD-105":         "Inspection of pressure vessels",
    "OISD-118":         "Layout for oil and gas installations",
    "OISD-116":         "Fire protection facilities for petroleum refineries",
    "OISD-117":         "Fire protection facilities for petroleum depots",
    "Factory Act S.7B": "General duties of occupier",
    "Factory Act S.21": "Fencing of machinery",
    "Factory Act S.31": "Explosive or inflammable dust/gas",
    "PESO":             "Petroleum and Explosives Safety Organisation requirements",
    "API 510":          "Pressure vessel inspection code",
    "API 570":          "Piping inspection code",
}

COMPLIANCE_SYSTEM = """You are a senior industrial safety compliance auditor with expertise in OISD, Factory Act, PESO, and API standards.

You produce formal compliance gap analysis reports for plant safety teams.
- Only flag a gap if you have CLEAR evidence of a deficiency in the documents
- Do NOT flag something just because it is not mentioned in retrieved context
- If documents adequately cover a requirement, mark it compliant
- Be precise about which clause applies to each gap — NEVER write "(Assumed)" next to a clause
- If you do not have the specific clause number from context, write:
  "Clause: Refer to [STANDARD] Section [X] — verify with full standard text"
- Severity: Critical = safety risk, Major = regulatory violation, Minor = documentation gap
- If retrieved documents are limited, note this and recommend a full manual audit
- NEVER produce a gap score if the standard itself is not present in the retrieved context"""

COMPLIANCE_PROMPT = """Produce a formal compliance gap analysis report in this EXACT format:

═══════════════════════════════════════
COMPLIANCE GAP ANALYSIS REPORT
Standard:  {standard} — {std_desc}
Plant:     {plant_id}
Audited by: IndustrialMind Compliance Engine
═══════════════════════════════════════

───────────────────────────────────────
EXECUTIVE SUMMARY
───────────────────────────────────────
Overall Score: [X]/10
Status: [Compliant / Partially Compliant / Non-Compliant]
[2 sentences summarising the audit findings]

───────────────────────────────────────
COMPLIANT ITEMS ✅
───────────────────────────────────────
• [Requirement clause] — Found in [FILENAME, page N]: [what it says]
• [Requirement clause] — Found in [FILENAME, page N]: [what it says]
[List all confirmed compliant items]

───────────────────────────────────────
COMPLIANCE GAPS ⚠️
───────────────────────────────────────
GAP 1 — Severity: [Critical / Major / Minor]
Clause:   [{standard} Clause X.X]
Finding:  [Specific deficiency — what is missing or inadequate]
Evidence: [What the document says or explicitly doesn't address]
Impact:   [Safety or regulatory consequence]

GAP 2 — Severity: [Critical / Major / Minor]
Clause:   [{standard} Clause X.X]
Finding:  [Specific deficiency]
Evidence: [Document evidence]
Impact:   [Consequence]

[Continue for all gaps — if none found, state "No gaps identified in available documents"]

───────────────────────────────────────
CRITICAL NON-CONFORMANCES 🔴
───────────────────────────────────────
[List only Critical severity items here, or "None identified"]

───────────────────────────────────────
RECOMMENDED CORRECTIVE ACTIONS
───────────────────────────────────────
1. [Specific action for Gap 1] — Timeline: [Immediate / 30 days / 90 days]
2. [Specific action for Gap 2] — Timeline: [...]
[One actionable recommendation per gap]

───────────────────────────────────────
DOCUMENTS REVIEWED
───────────────────────────────────────
[List all filenames from context that were checked]
Total documents reviewed: [N]

───────────────────────────────────────
AUDIT LIMITATIONS
───────────────────────────────────────
[Note any gaps in document coverage that may affect completeness of this audit]

═══════════════════════════════════════

IMPORTANT RULES:
- Only cite documents that appear in the retrieved context below
- Never fabricate document content or clause numbers
- If context is thin, score conservatively and note the limitation

Document context from knowledge base:
{context}

Write the complete compliance report now."""


def run_compliance(standard: str, plant_id: str = "plant_001") -> dict:
    std_desc = COMPLIANCE_STANDARDS.get(standard, "industrial safety standard")
    query = f"{standard} {std_desc} safety procedure inspection requirement clause"

    # top_k=10 for compliance — needs more context to find clause coverage
    chunks = hybrid_retrieve(query, plant_id=plant_id, top_k=10)

    # ── Insufficient documents check ──────────────────────────────────────────
    # Extract the numeric part of the standard for flexible filename matching
    # Handles: OISD-118 matching OISD-STD-118.pdf, API-510 matching API_510.pdf etc.
    std_numbers = re.findall(r'\d+', standard)  # e.g. ["118"] from "OISD-118"
    std_prefix = re.sub(r'[^a-zA-Z]', '', standard).lower()  # e.g. "oisd" from "OISD-118"

    def filename_matches_standard(filename: str) -> bool:
        fn = filename.lower()
        # Must contain the prefix (oisd, api, facto etc.) AND all numeric parts
        has_prefix = std_prefix in fn
        has_numbers = all(num in fn for num in std_numbers)
        return has_prefix and has_numbers

    standard_in_corpus = any(
        filename_matches_standard(c.get("filename", ""))
        for c in chunks
    )

    if not chunks or not standard_in_corpus:
        return {
            "answer": (
                f"⚠️ AUDIT BLOCKED — INSUFFICIENT DOCUMENTS\n\n"
                f"The standard '{standard}' ({std_desc}) is not present in the knowledge base. "
                f"A compliance audit cannot be completed without the source standard document.\n\n"
                f"To run this audit:\n"
                f"1. Upload the {standard} PDF to IndustrialMind via the Documents tab\n"
                f"2. Wait for indexing to complete\n"
                f"3. Re-run the compliance audit\n\n"
                f"Documents currently retrieved ({len(chunks)}) do not include {standard}. "
                f"Running an audit without the standard text would produce unreliable results."
            ),
            "sources": format_sources(chunks),
            "agent": "compliance",
            "standard": standard,
            "blocked": True,
        }

    context = "\n\n---\n\n".join(
        f"[{c.get('filename', '?')}, page {c.get('page', 0)}]\n{c['text']}"
        for c in chunks
    )

    answer = deepseek_chat(
        messages=[{"role": "user", "content": COMPLIANCE_PROMPT.format(
            standard=standard,
            std_desc=std_desc,
            plant_id=plant_id,
            context=context,
        )}],
        system=COMPLIANCE_SYSTEM,
        max_tokens=2500,
    )
    return {
        "answer": answer,
        "sources": format_sources(chunks),
        "agent": "compliance",
        "standard": standard,
        "blocked": False,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 4. WORK PERMIT AGENT
# ══════════════════════════════════════════════════════════════════════════════

PERMIT_SYSTEM = """You are a certified Permit-to-Work (PTW) coordinator for oil, gas, and process plants.

You generate formal PTW documents that comply with OISD-105, Factory Act, and site safety standards.
- Be specific about hazards — generic lists are not acceptable
- PPE must match the specific work type and equipment
- Isolation steps must be equipment-specific, not generic
- Emergency procedures must be site-relevant
- All cited procedures must come from the retrieved document context"""

PERMIT_PROMPT = """Generate a formal Permit-to-Work document in this EXACT format:

═══════════════════════════════════════
PERMIT TO WORK
═══════════════════════════════════════
PTW Number:    {ptw_number}
Date Issued:   {date_issued}
Valid Until:   {valid_until}
Plant:         {plant_id}
Permit Type:   {work_type}

───────────────────────────────────────
WORK DESCRIPTION
───────────────────────────────────────
Equipment Tag: {equipment_id}
Work Type:     {work_type}
Location:      {location}
Issue Date:    {date_issued}
Valid Until:   {valid_until}
Description:   [Detailed description of the specific work to be performed]
Estimated Duration: [Realistic estimate based on work type]

───────────────────────────────────────
HAZARD IDENTIFICATION
───────────────────────────────────────
[List specific hazards for THIS work type and equipment — cite procedures where available]
• [Hazard 1] — Source: [FILENAME, page N if available]
• [Hazard 2]
• [Hazard 3]
• [Hazard 4]

───────────────────────────────────────
ISOLATION REQUIREMENTS (LOTO)
───────────────────────────────────────
[Specific isolation steps for {equipment_id}]
✔ Step 1: [De-energise — specify energy type: electrical/pressure/thermal]
✔ Step 2: [Lockout at [specific isolation point]]
✔ Step 3: [Tagout with permit number {ptw_number}]
✔ Step 4: [Bleed/vent residual pressure/energy]
✔ Step 5: [Verify zero energy state]

───────────────────────────────────────
PPE REQUIREMENTS
───────────────────────────────────────
[Select PPE specific to {work_type}]
• [PPE item 1 with specification — e.g. "Safety helmet — EN397 rated"]
• [PPE item 2]
• [PPE item 3]
• [PPE item 4]
• [Additional PPE specific to this work type]

───────────────────────────────────────
PRECAUTIONS & SAFETY MEASURES
───────────────────────────────────────
[Numbered, specific to {work_type} — cite documents where relevant]
1. [Precaution — cite: FILENAME, page N if available]
2. [Precaution]
3. [Precaution]
4. [Precaution]
5. [Precaution]

───────────────────────────────────────
GAS TESTING REQUIREMENTS
───────────────────────────────────────
☐ Initial gas test required: [Yes / No]
☐ Continuous monitoring required: [Yes / No]
☐ LEL threshold for work stop: [X]% LEL
☐ H2S threshold: [X] ppm
☐ O2 acceptable range: [X]% — [X]%

───────────────────────────────────────
EMERGENCY PROCEDURES
───────────────────────────────────────
In case of emergency:
1. [Immediate action — stop work / evacuate]
2. [Alert — who to call, how]
3. [Assembly point: [specify]]
4. [Emergency contact: [plant emergency number]]
5. [First aid / fire response specific to this work type]

───────────────────────────────────────
PRE-WORK SIGN-OFF CHECKLIST
───────────────────────────────────────
☐  1. Area inspected — safe to commence work
☐  2. Isolation confirmed and LOTO applied
☐  3. Gas test performed — LEL: ___% | H2S: ___ ppm | O2: ___%
☐  4. PPE inspected, worn, and compliant
☐  5. Fire extinguisher on standby (type: ___)
☐  6. Emergency contacts confirmed and available
☐  7. Work party toolbox talk completed
☐  8. Communication device tested and available
☐  9. First aid kit inspected and available
☐ 10. All permit conditions read and accepted

───────────────────────────────────────
AUTHORISATIONS
───────────────────────────────────────
Issuing Authority:  ________________________  Sign: _______  Date/Time: _________
Safety Officer:     ________________________  Sign: _______  Date/Time: _________
Area Engineer:      ________________________  Sign: _______  Date/Time: _________
Performing Team Lead: ______________________  Sign: _______  Date/Time: _________

───────────────────────────────────────
PERMIT CLOSURE
───────────────────────────────────────
Work completed:    ☐ Yes  ☐ No (reason: _______________)
Area restored:     ☐ Yes  ☐ No
Isolation removed: ☐ Yes  ☐ No
Closed by: _______________________  Sign: _______  Date/Time: _________

═══════════════════════════════════════
References: {context_refs}
Generated by IndustrialMind PTW Agent
═══════════════════════════════════════

Safety procedures from knowledge base:
{context}

Generate the complete PTW. Be specific to {equipment_id} and {work_type}. Cite procedures from context where relevant."""


def generate_work_permit(
    equipment_id: str,
    work_type: str,
    location: str,
    plant_id: str = "plant_001"
) -> dict:
    # ── Dynamic date generation — fixes date mismatch bug ────────────────────
    now = datetime.now()
    date_issued = now.strftime("%d %b %Y %H:%M")
    valid_until = (now + timedelta(hours=12)).strftime("%d %b %Y %H:%M")
    ptw_number = f"PTW-{equipment_id.upper()}-{now.strftime('%Y%m%d')}-{now.strftime('%H%M')}"

    query = f"{equipment_id} {work_type} safety isolation permit procedure hazard PPE lockout"
    chunks = hybrid_retrieve(query, plant_id=plant_id, top_k=7)
    context = "\n\n---\n\n".join(
        f"[{c.get('filename', '?')}, page {c.get('page', 0)}]\n{c['text']}"
        for c in chunks
    ) if chunks else "No specific procedures found — permit generated from general industry practice."

    context_refs = " | ".join(
        f"{c.get('filename', '?')} p.{c.get('page', 0)}"
        for c in chunks[:5]
    ) if chunks else "⚙️ General industry practice (OISD-105, Factory Act)"

    content = groq_chat(
        messages=[{"role": "user", "content": PERMIT_PROMPT.format(
            equipment_id=equipment_id,
            work_type=work_type,
            location=location,
            plant_id=plant_id,
            context=context,
            context_refs=context_refs,
            ptw_number=ptw_number,
            date_issued=date_issued,
            valid_until=valid_until,
        )}],
        system=PERMIT_SYSTEM,
        max_tokens=2500,
    )
    return {
        "permit_content": content,
        "sources": format_sources(chunks),
        "agent": "permit",
        "equipment_id": equipment_id,
        "work_type": work_type,
        "location": location,
        "ptw_number": ptw_number,
        "date_issued": date_issued,
        "valid_until": valid_until,
    }


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ROUTER
# ══════════════════════════════════════════════════════════════════════════════

def _extract_equipment_id(query: str) -> str:
    """Extract equipment tag from query (e.g. P-101, V-201, HE-301)."""
    match = re.search(r'\b([A-Z]{1,3}-?\d{2,4})\b', query.upper())
    return match.group(1) if match else "UNKNOWN"


def _extract_standard(query: str) -> str:
    """Extract standard name from query."""
    for std in COMPLIANCE_STANDARDS:
        if std.lower() in query.lower():
            return std
    return "OISD-105"  # default


def run_agent(
    query: str,
    plant_id: str = "plant_001",
    history=None,
    force_agent: str = None
) -> dict:
    agent = force_agent or classify_intent(query)

    try:
        if agent == "rca":
            equipment_id = _extract_equipment_id(query)
            return run_rca(
                equipment_id=equipment_id,
                symptom=query,
                plant_id=plant_id
            )

        elif agent == "compliance":
            standard = _extract_standard(query)
            return run_compliance(standard=standard, plant_id=plant_id)

        elif agent == "permit":
            equipment_id = _extract_equipment_id(query)
            work_type = "General Maintenance"
            for wt in ["hot work", "cold work", "confined space", "electrical", "mechanical", "radiography"]:
                if wt in query.lower():
                    work_type = wt.title()
                    break
            location = "Plant Area"
            return generate_work_permit(
                equipment_id=equipment_id,
                work_type=work_type,
                location=location,
                plant_id=plant_id
            )

        else:
            return run_copilot(query=query, plant_id=plant_id, history=history)

    except RateLimitError as e:
        return {
            "error": str(e),
            "error_type": "rate_limit",
            "agent": agent,
            "answer": str(e),
        }
    except ServiceError as e:
        return {
            "error": str(e),
            "error_type": "service_error",
            "agent": agent,
            "answer": str(e),
        }
    except Exception as e:
        print(f"Unexpected error in run_agent: {e}")
        return {
            "error": "An unexpected error occurred. Please try again.",
            "error_type": "unknown",
            "agent": agent,
            "answer": "⚠️ Something went wrong processing your request. Please try again in a moment.",
        }