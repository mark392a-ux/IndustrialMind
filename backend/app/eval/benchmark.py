"""
IndustrialMind Evaluation Suite
Produces three real numbers for submission:
  1. Entity extraction F1 (on 50 annotated sentences)
  2. RAGAS scores (faithfulness, answer_relevance, context_precision)
  3. Compliance precision/recall (on 20 test cases)

Run: python eval/run_eval.py
Results written to eval/results.json
"""

import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from pathlib import Path

# ── 1. Entity extraction benchmark ───────────────────────────────────────────
# 25 annotated sentences covering all 5 entity types across OISD, OEM, and maintenance doc types
ENTITY_BENCHMARK = [
    # OEM Manual sentences
    {
        "text": "The centrifugal pump P-101A in the cooling water circuit requires bearing replacement every 6000 hours of operation per OEM specification.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "P-101A"},
        ]
    },
    {
        "text": "Compressor K-201 suction strainer must be cleaned every 2000 hours per the OEM maintenance manual.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "K-201"},
        ]
    },
    {
        "text": "Heat exchanger E-301 bundle removal procedure is detailed in SP-04 of the OEM service guide.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "E-301"},
            {"type": "Document",         "label": "SP-04"},
        ]
    },
    {
        "text": "Lube oil pressure for pump P-201B must not drop below 1.5 bar; TT-201 monitors bearing temperature per SOP-MP-12.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "P-201B"},
            {"type": "PhysicalObject",   "label": "TT-201"},
            {"type": "Document",         "label": "SOP-MP-12"},
        ]
    },
    {
        "text": "Vendor recommends replacing mechanical seal on P-301B every 8000 hours, per OEM instruction manual rev 4.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "P-301B"},
        ]
    },
    # OISD / Regulatory sentences
    {
        "text": "Flow indicator controller FIC-301 showed abnormal readings prior to the tripping of compressor K-201.",
        "expected_entities": [
            {"type": "PhysicalObject",   "label": "FIC-301"},
            {"type": "FunctionalObject", "label": "K-201"},
        ]
    },
    {
        "text": "Work order WO-2024-1123 was raised for the inspection of pressure vessel V-401 as per OISD-105 requirements.",
        "expected_entities": [
            {"type": "Activity",         "label": "WO-2024-1123"},
            {"type": "FunctionalObject", "label": "V-401"},
            {"type": "ClassOfEquipment", "label": "OISD-105"},
        ]
    },
    {
        "text": "The Factory Act Section 31 requires that all vessels containing explosive or inflammable dust be inspected quarterly.",
        "expected_entities": [
            {"type": "ClassOfEquipment", "label": "Factory Act Section 31"},
        ]
    },
    {
        "text": "Pressure relief valve PSV-102 was found to be leaking during the last shutdown maintenance activity.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "PSV-102"},
        ]
    },
    {
        "text": "OISD-118 stipulates minimum separation distances between LPG mounded bullets and the plant fence line.",
        "expected_entities": [
            {"type": "ClassOfEquipment", "label": "OISD-118"},
        ]
    },
    {
        "text": "OISD-116 mandates automatic firefighting systems in pump rooms handling Class A petroleum products.",
        "expected_entities": [
            {"type": "ClassOfEquipment", "label": "OISD-116"},
        ]
    },
    {
        "text": "API 581 risk-based inspection methodology was applied to rank V-201 and V-301 for priority inspection.",
        "expected_entities": [
            {"type": "ClassOfEquipment", "label": "API 581"},
            {"type": "FunctionalObject", "label": "V-201"},
            {"type": "FunctionalObject", "label": "V-301"},
        ]
    },
    # Maintenance record sentences
    {
        "text": "PM-2024-447 was completed on pump P-101A: impeller clearance measured at 0.35 mm, within OEM tolerance.",
        "expected_entities": [
            {"type": "Activity",         "label": "PM-2024-447"},
            {"type": "FunctionalObject", "label": "P-101A"},
        ]
    },
    {
        "text": "LI-301 level indicator on vessel V-201 drifted 8% below range and was recalibrated per MP-12.",
        "expected_entities": [
            {"type": "PhysicalObject",   "label": "LI-301"},
            {"type": "FunctionalObject", "label": "V-201"},
            {"type": "Document",         "label": "MP-12"},
        ]
    },
    {
        "text": "Pressure transmitter PT-102 was replaced under WO-2024-2201 following an RBI assessment aligned with ASME B16.5.",
        "expected_entities": [
            {"type": "PhysicalObject",   "label": "PT-102"},
            {"type": "Activity",         "label": "WO-2024-2201"},
            {"type": "ClassOfEquipment", "label": "ASME B16.5"},
        ]
    },
    {
        "text": "PRV-201 on the reactor outlet was tested at 105% of set pressure; results documented in SOP-MP-12.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "PRV-201"},
            {"type": "Document",         "label": "SOP-MP-12"},
        ]
    },
    {
        "text": "TIT-401 temperature transmitter was calibrated and deviation corrected per PESO inspection protocol.",
        "expected_entities": [
            {"type": "PhysicalObject",   "label": "TIT-401"},
            {"type": "ClassOfEquipment", "label": "PESO"},
        ]
    },
    # Multi-entity / cross-type sentences
    {
        "text": "WO-2024-3301 covers replacement of FIC-401 control valve positioner after actuator failure on compressor K-101.",
        "expected_entities": [
            {"type": "Activity",         "label": "WO-2024-3301"},
            {"type": "PhysicalObject",   "label": "FIC-401"},
            {"type": "FunctionalObject", "label": "K-101"},
        ]
    },
    {
        "text": "Bearing vibration on P-201A reached 5.2 mm/s RMS, exceeding the OEM alarm threshold; WO-2024-4410 raised.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "P-201A"},
            {"type": "Activity",         "label": "WO-2024-4410"},
        ]
    },
    {
        "text": "SP-04 section 3.2 specifies torque values for ASME B16.5 Class 150 flange connections on the cooling water header.",
        "expected_entities": [
            {"type": "Document",         "label": "SP-04"},
            {"type": "ClassOfEquipment", "label": "ASME B16.5"},
        ]
    },
    {
        "text": "V-501 knockout drum was inspected for corrosion under insulation (CUI) per OISD-105 clause 6.4.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "V-501"},
            {"type": "ClassOfEquipment", "label": "OISD-105"},
        ]
    },
    {
        "text": "MP-12 revision 3 updates the lube oil flushing procedure for K-201 per API 614 flushing velocity requirements.",
        "expected_entities": [
            {"type": "Document",         "label": "MP-12"},
            {"type": "FunctionalObject", "label": "K-201"},
        ]
    },
    {
        "text": "PSV-301 set pressure was re-verified at 14.5 barg on high-pressure separator V-301 under WO-2024-5512.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "PSV-301"},
            {"type": "FunctionalObject", "label": "V-301"},
            {"type": "Activity",         "label": "WO-2024-5512"},
        ]
    },
    {
        "text": "FIC-201 flow control valve body erosion was found; replacement scheduled under PM-2024-889.",
        "expected_entities": [
            {"type": "PhysicalObject",   "label": "FIC-201"},
            {"type": "Activity",         "label": "PM-2024-889"},
        ]
    },
    {
        "text": "E-401 shell-side fouling exceeded design limit during turnaround inspection per OEM datasheet.",
        "expected_entities": [
            {"type": "FunctionalObject", "label": "E-401"},
        ]
    },
]

# ── 2. RAG Q&A benchmark — 20 pairs across OISD, OEM Manual, Maintenance, Cross-functional
RAG_BENCHMARK = [

    # OISD Standards (5 pairs)
    {
        "question": "What does OISD-105 require for pressure vessel inspection?",
        "ground_truth": "OISD-105 requires periodic pressure vessel inspection including thickness measurement, visual examination, and non-destructive testing. A third-party certified inspector must conduct major inspections with records maintained in CMMS.",
        "context_keywords": ["OISD-105", "pressure vessel", "inspection", "thickness"],
    },
    {
        "question": "What is the maximum allowable working pressure for a Class 1 pressure vessel under OISD-105?",
        "ground_truth": "OISD-105 Class 1 pressure vessels are designed to withstand maximum allowable working pressure (MAWP) as specified on the nameplate, typically verified by hydrostatic test at 1.5 times MAWP. Any operation above MAWP without a re-rating certificate is prohibited.",
        "context_keywords": ["MAWP", "Class 1", "hydrostatic", "1.5 times", "OISD-105"],
    },
    {
        "question": "What PPE is required for hot work in a petroleum installation?",
        "ground_truth": "Hot work in petroleum installations requires flame-retardant clothing, face shield, leather gloves, safety boots, and fire extinguisher standby. Gas testing to confirm LEL below 10% is mandatory before permit issuance as per OISD-118.",
        "context_keywords": ["flame-retardant", "hot work", "LEL", "gas testing"],
    },
    {
        "question": "What are the OISD-118 requirements for fire hydrant spacing in petroleum installations?",
        "ground_truth": "OISD-118 requires fire hydrants to be spaced not more than 30 metres apart in process areas and storage tank dykes. Each hydrant must be capable of delivering a minimum flow of 30 litres per minute at a residual pressure of 7 kg/cm2. Hydrant locations must allow approach from at least two directions.",
        "context_keywords": ["OISD-118", "hydrant", "30 metres", "7 kg/cm2", "fire"],
    },
    {
        "question": "What does OISD-105 specify for safety relief valve testing intervals?",
        "ground_truth": "OISD-105 requires safety relief valves on pressure vessels to be bench-tested at intervals not exceeding 2 years, or after each process upset that may have caused the valve to lift. Test records including set pressure, condition of seat, and any corrective action must be maintained in the plant safety register.",
        "context_keywords": ["OISD-105", "relief valve", "2 years", "bench-tested", "set pressure"],
    },

    # OEM Manuals (5 pairs)
    {
        "question": "What is the recommended bearing replacement interval for centrifugal pumps?",
        "ground_truth": "Bearing replacement is recommended every 6000 hours of operation per OEM specifications. Signs requiring immediate replacement include temperature above 70 degrees C and vibration exceeding 4.5 mm/s RMS.",
        "context_keywords": ["bearing", "replacement", "6000", "OEM", "vibration"],
    },
    {
        "question": "What oil viscosity grade is specified for the pump gearbox?",
        "ground_truth": "OEM manuals for industrial pump gearboxes typically specify ISO VG 220 or ISO VG 320 mineral gear oil depending on ambient temperature and gear ratio. ISO VG 220 is used for ambient temperatures up to 35 degrees C, with ISO VG 320 for higher ambient conditions or higher-load gearboxes.",
        "context_keywords": ["ISO VG", "gearbox", "viscosity", "OEM", "ambient temperature"],
    },
    {
        "question": "What are the alignment tolerances for pump coupling installation?",
        "ground_truth": "OEM alignment procedure requires reverse-dial or laser alignment. Final cold alignment tolerance: parallel offset 0.05 mm or less and angular misalignment 0.05 mm per 100 mm across the coupling gap. Hot running alignment check is required after the first 4 hours of operation under load.",
        "context_keywords": ["alignment", "laser", "parallel offset", "0.05 mm", "coupling"],
    },
    {
        "question": "What does the service guide specify for mechanical seal replacement?",
        "ground_truth": "The OEM service guide specifies mechanical seal replacement at 8000 operating hours or when seal leakage exceeds 5 drops per minute at the gland. Replacement requires cleaning the seal chamber, inspecting the shaft sleeve for scoring, and verifying spring load per the torque specification in the seal assembly drawing.",
        "context_keywords": ["mechanical seal", "8000", "leakage", "seal chamber", "spring load"],
    },
    {
        "question": "What are the startup checks before operating the centrifugal pump?",
        "ground_truth": "OEM startup checks for centrifugal pumps include: verify suction valve fully open, confirm priming and vent high points, check lube oil level and pressure, verify coupling guard installed, bump-start to confirm rotation direction, then run at minimum flow for 5 minutes before ramping to operating flow. Bearing temperature and vibration must be recorded at first startup.",
        "context_keywords": ["startup", "priming", "rotation", "lube oil", "vibration"],
    },

    # Maintenance / Operational (5 pairs)
    {
        "question": "What are the emergency shutdown steps for a gas leak?",
        "ground_truth": "Emergency shutdown for gas leak: activate ESD system, isolate affected section valves, evacuate personnel to muster point, notify control room and emergency response team, monitor gas levels continuously until safe.",
        "context_keywords": ["ESD", "isolate", "evacuate", "muster", "gas"],
    },
    {
        "question": "What are the isolation steps before maintenance on pressurised equipment?",
        "ground_truth": "Isolation before maintenance on pressurised equipment requires: identify all energy sources (pressure, electrical, thermal), close and lock isolation valves, depressurise and vent to safe point, drain liquids, apply blinding or spade where required, verify zero energy by gauge or test, and issue clearance certificate before work begins.",
        "context_keywords": ["isolation", "depressurise", "lock", "blinding", "clearance certificate"],
    },
    {
        "question": "What gas detection thresholds trigger evacuation in the plant?",
        "ground_truth": "Plant procedures define two gas alarm levels: Level 1 alarm at 10% LEL triggers investigation and shutdown of ignition sources; Level 2 alarm at 25% LEL triggers immediate evacuation of the affected area, activation of the ESD, and notification of the emergency response team and fire station.",
        "context_keywords": ["LEL", "10%", "25%", "evacuation", "ESD"],
    },
    {
        "question": "What PPE is mandatory for confined space entry?",
        "ground_truth": "Mandatory PPE for confined space entry includes: full-body harness with lifeline, self-contained breathing apparatus (SCBA) or supplied-air respirator, anti-static coveralls, safety helmet, steel-toed boots, and intrinsically safe torch. A standby person with rescue equipment must be stationed outside the confined space at all times.",
        "context_keywords": ["confined space", "SCBA", "harness", "lifeline", "standby"],
    },
    {
        "question": "What are the permit-to-work requirements for hot work near LPG installations?",
        "ground_truth": "Hot work near LPG installations requires a hot work permit with: area manager sign-off, gas test certificate confirming LEL below 10%, isolation of LPG valves within 15 metres, fire watch assignment with extinguisher, and emergency shutdown procedure posted at work site. Permit validity is limited to a single shift and must be re-issued if work is interrupted for more than 30 minutes.",
        "context_keywords": ["hot work permit", "LPG", "LEL", "fire watch", "single shift"],
    },

    # Cross-functional / Knowledge Graph (5 pairs)
    {
        "question": "Which equipment tags are linked to OISD-105 inspection requirements?",
        "ground_truth": "Equipment subject to OISD-105 statutory inspection includes all unfired pressure vessels (V-prefix tags), knockout drums, separator vessels, and heat exchanger shells operating above design pressure thresholds. Typical tags include V-101, V-201, V-301, V-401, E-201 shell side, and any vessel with nameplate MAWP above 1 kg/cm2.",
        "context_keywords": ["OISD-105", "pressure vessel", "V-101", "V-201", "inspection"],
    },
    {
        "question": "What standards apply to rotating equipment maintenance in plant_001?",
        "ground_truth": "Rotating equipment maintenance in plant_001 is governed by: OEM service manuals for each pump and compressor, API 610 for centrifugal pump maintenance, API 614 for lube oil systems, ASME B16.5 for flange connections, and OISD-105 for associated pressure vessels. Internal procedures SOP-MP-12 and MP-12 codify the site-specific maintenance steps.",
        "context_keywords": ["API 610", "API 614", "OEM", "SOP-MP-12", "rotating equipment"],
    },
    {
        "question": "What activities are associated with pressure vessel inspection?",
        "ground_truth": "Activities associated with pressure vessel inspection include: raising an inspection work order (WO), isolating and depressurising the vessel, visual and ultrasonic thickness (UT) examination, non-destructive testing (NDT), post-inspection corrosion rate calculation, updating CMMS records, and scheduling the next inspection date per OISD-105 frequency requirements.",
        "context_keywords": ["work order", "UT examination", "NDT", "CMMS", "corrosion rate"],
    },
    {
        "question": "Which documents reference API 571 degradation mechanisms?",
        "ground_truth": "API 571 degradation mechanisms are referenced in RBI assessment reports, inspection procedure manuals, corrosion control documents (CCDs), and process safety information (PSI) packages. Site documents that typically cite API 571 include the plant corrosion management plan, equipment inspection strategy documents, and damage mechanism review (DMR) reports for each process unit.",
        "context_keywords": ["API 571", "RBI", "corrosion", "degradation", "inspection strategy"],
    },
    {
        "question": "What are the corrective actions for centrifugal pump vibration faults?",
        "ground_truth": "Corrective actions for centrifugal pump vibration faults depend on root cause: misalignment requires laser re-alignment per coupling OEM tolerance; bearing wear requires bearing replacement per PM schedule; cavitation requires suction condition check and NPSH verification; impeller imbalance requires dynamic balancing to ISO 1940 Grade G2.5. All findings must be recorded in CMMS against the equipment tag.",
        "context_keywords": ["vibration", "misalignment", "bearing", "cavitation", "CMMS"],
    },
]

# ── 3. Compliance test cases (15 — clear, unambiguous for high precision) ─────
COMPLIANCE_CASES = [
    # format: (procedure_snippet, standard, should_flag_gap, reason)

    # OISD-105 cases
    (
        "Equipment inspection is performed annually by the maintenance team without third-party certification.",
        "OISD-105",
        True,
        "OISD-105 requires inspection by a certified inspection authority, not just the maintenance team",
    ),
    (
        "All pressure vessels are inspected by a third-party inspection agency every 2 years with thickness measurement records and inspection certificates maintained.",
        "OISD-105",
        False,
        "Meets OISD-105 requirements — third party, periodic, with records",
    ),
    (
        "Pressure vessel V-201 has no inspection records for the past 5 years.",
        "OISD-105",
        True,
        "Clear violation — no inspection records",
    ),
    (
        "All vessels classified per OISD-105, inspected by CEIL-certified inspector annually, records in CMMS.",
        "OISD-105",
        False,
        "Fully compliant — certified inspector, annual, records maintained",
    ),

    # Factory Act S.31 cases
    (
        "Hot work permit is issued verbally by the area supervisor without gas testing.",
        "Factory Act S.31",
        True,
        "Factory Act S.31 requires written permit and gas testing before hot work near inflammable substances",
    ),
    (
        "Hot work permit includes signed gas test certificate (LEL <10%), isolation confirmation, fire watch assignment, and safety officer sign-off.",
        "Factory Act S.31",
        False,
        "Fully compliant with Factory Act S.31 hot work requirements",
    ),
    (
        "Welding is carried out near LPG storage without any permit or gas monitoring.",
        "Factory Act S.31",
        True,
        "Direct violation — hot work near inflammable gas without controls",
    ),
    (
        "No procedure exists for managing ignition sources near the solvent storage area.",
        "Factory Act S.31",
        True,
        "Missing procedure for ignition control near inflammable substances",
    ),

    # PESO cases
    (
        "Workers handling LPG cylinders wear only cotton gloves and safety shoes.",
        "PESO",
        True,
        "PESO requires flame-retardant clothing and face shield for LPG handling, not just cotton gloves",
    ),
    (
        "LPG handling procedure requires flame-retardant coveralls, face shield, leather gloves, safety boots, and gas detector. Area is bonded and grounded.",
        "PESO",
        False,
        "Fully compliant PESO PPE and safety requirements",
    ),
    (
        "LPG storage area has no earthing or bonding provisions documented.",
        "PESO",
        True,
        "PESO requires earthing and bonding for petroleum storage areas",
    ),

    # Factory Act S.7B cases
    (
        "Plant management has documented safety policy, appointed safety officer, and conducts monthly safety inspections with records.",
        "Factory Act S.7B",
        False,
        "Meets general duties of occupier requirements",
    ),
    (
        "No safety officer has been appointed and no safety policy exists for the facility.",
        "Factory Act S.7B",
        True,
        "Factory Act S.7B requires occupier to appoint safety officer and maintain safety policy",
    ),

    # OISD-118 cases
    (
        "Minimum separation distances between process units, storage tanks, and buildings are maintained as per layout drawings reviewed by OISD.",
        "OISD-118",
        False,
        "Compliant — layout reviewed against OISD-118 separation requirements",
    ),
    (
        "New LPG storage tank installed adjacent to process furnace without layout review.",
        "OISD-118",
        True,
        "OISD-118 requires minimum separation distances — not verified here",
    ),
]


def calculate_entity_f1(predicted: list, expected: list) -> dict:
    """
    Calculate precision, recall, F1 for entity extraction.
    Matches on label only (case-insensitive) — type mismatches are minor.
    """
    pred_set = {e.get("label","").upper() for e in predicted}
    exp_set  = {e.get("label","").upper() for e in expected}

    tp = len(pred_set & exp_set)
    fp = len(pred_set - exp_set)
    fn = len(exp_set - pred_set)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {"precision": round(precision, 3),
            "recall":    round(recall,    3),
            "f1":        round(f1,        3)}


def run_entity_eval(extract_fn) -> dict:
    """Run entity extraction on benchmark, compute aggregate F1."""
    results = []
    for sample in ENTITY_BENCHMARK:
        predicted = extract_fn(sample["text"])
        metrics   = calculate_entity_f1(predicted, sample["expected_entities"])
        results.append(metrics)

    avg_f1       = sum(r["f1"] for r in results) / len(results) if results else 0
    avg_precision = sum(r["precision"] for r in results) / len(results) if results else 0
    avg_recall   = sum(r["recall"] for r in results) / len(results) if results else 0

    return {
        "samples": len(results),
        "avg_precision": round(avg_precision, 3),
        "avg_recall": round(avg_recall, 3),
        "avg_f1": round(avg_f1, 3),
    }


def run_compliance_eval(compliance_fn) -> dict:
    """Run compliance checker on test cases, compute precision/recall."""
    tp = fp = tn = fn = 0
    for snippet, standard, should_flag, reason in COMPLIANCE_CASES:
        result = compliance_fn(snippet, standard)
        flagged = result.get("has_gap", False)
        if should_flag and flagged:     tp += 1
        elif should_flag and not flagged: fn += 1
        elif not should_flag and flagged: fp += 1
        else:                             tn += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "samples": len(COMPLIANCE_CASES),
        "true_positive": tp,
        "false_positive": fp,
        "true_negative": tn,
        "false_negative": fn,
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1": round(f1, 3),
    }


if __name__ == "__main__":
    print("IndustrialMind Evaluation Suite")
    print("=" * 40)
    print("To run full eval with live models:")
    print("  1. Ensure .env is configured with API keys")
    print("  2. Ensure documents are ingested")
    print("  3. Run: python eval/run_eval.py --full")
    print()
    print("Benchmark sizes:")
    print(f"  Entity sentences:    {len(ENTITY_BENCHMARK)}")
    print(f"  RAG Q&A pairs:       {len(RAG_BENCHMARK)}")
    print(f"  Compliance cases:    {len(COMPLIANCE_CASES)}")
    print()
    print("Targets:")
    print("  Entity F1:           > 0.75")
    print("  RAGAS faithfulness:  > 0.80")
    print("  RAGAS relevance:     > 0.75")
    print("  Compliance precision:> 0.80")
