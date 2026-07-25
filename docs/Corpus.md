# Evaluation Corpus

IndustrialMind is evaluated on 37 real industrial documents (159 chunks) across five categories. This manifest lists every document used, its origin, and whether it's bundled directly in this repository or excluded for licensing reasons.

**32 of 37 documents are bundled in [`docs/Sample_Corpus/`](docs/Sample_Corpus/).** The 4 excluded documents are commercial OEM manufacturer manuals — cited here by title for transparency, but not redistributed. See [Redistribution Notes](#redistribution-notes) below.

---

## Procedures & Standards (9 documents)

| Document | Pages | Chunks | Source | In repo? |
|---|---|---|---|---|
| Factories_Act_1948_India.pdf | 60 | 111 | Government of India — public law | ✅ |
| PESO_Petroleum_Rules_2002.pdf | 101 | 156 | Petroleum & Explosives Safety Org. — public regulation | ✅ |
| OISD_STD_105_Inspection_of_Pressure_Vessels.pdf | 44 | 67 | OISD (Oil Industry Safety Directorate) | ✅* |
| OISD_STD_106_Storage_and_Handling.pdf | 38 | 51 | OISD | ✅* |
| OISD_STD_113_Fire_Protection.pdf | 47 | 58 | OISD | ✅* |
| OISD_STD_116_Electrical_Safety.pdf | 82 | 101 | OISD | ✅* |
| OISD_STD_117_Work_Permit_System.pdf | 64 | 77 | OISD | ✅* |
| OISD_STD_118_Layout_Oil_Gas.pdf | 31 | 43 | OISD | ✅* |
| OISD_STD_129_Safety_Management.pdf | 59 | 70 | OISD | ✅* |

## Equipment Manuals (5 documents)

| Document | Pages | Chunks | Source | In repo? |
|---|---|---|---|---|
| Atlas_Copco_Compressed_Air_Manual.pdf | 148 | 164 | Atlas Copco (OEM) | ❌ — see note |
| Ingersoll_Rand_Compressor_Manual.pdf | 70 | 84 | Ingersoll Rand (OEM) | ❌ — see note |
| Semi_Hermetic_Reciprocating_Manual.pdf | 144 | 167 | OEM manual | ❌ — see note |
| Process_Pump_GKP_Installation.pdf | 70 | 70 | OEM manual | ❌ — see note |
| Operational_Preventive_Maintenance.pdf | 2 | 4 | Generic maintenance reference | ✅ |

## Inspection & Incident Reports (12 documents)

| Document | Pages | Chunks | Source | In repo? |
|---|---|---|---|---|
| CSB_Philadelphia_Energy_Solutions.pdf | 107 | 133 | US Chemical Safety Board — public domain | ✅ |
| CSB_Husky_Superior_FCC_Explosion.pdf | 196 | 259 | US Chemical Safety Board — public domain | ✅ |
| CSB_Metallurgical_Evaluation.pdf | 48 | 53 | US Chemical Safety Board — public domain | ✅ |
| OISD_CS_Battery_Rom.pdf | 4 | 4 | OISD case study | ✅* |
| OISD_CS_Blowout.pdf | 4 | 4 | OISD case study | ✅* |
| OISD_CS_Crude_Distillation.pdf | 3 | 4 | OISD case study | ✅* |
| OISD_CS_Explosion_Furnace.pdf | 3 | 4 | OISD case study | ✅* |
| OISD_CS_H2S_Exposure.pdf | 3 | 5 | OISD case study | ✅* |
| OISD_CS_Pipeline_Leakage.pdf | 3 | 3 | OISD case study | ✅* |
| OISD_SA_Burst_Incident.pdf | 3 | 3 | OISD safety alert | ✅* |
| OISD_SA_Electric_Cable.pdf | 2 | 2 | OISD safety alert | ✅* |
| OISD_SA_Pipeline_Fire_Jetty.pdf | 2 | 2 | OISD safety alert | ✅* |
| OISD_SA_Rollover_Pipe.pdf | 3 | 3 | OISD safety alert | ✅* |
| OISD_SA_Truck_Driver.pdf | 2 | 2 | OISD safety alert | ✅* |

## Work Permits & Forms (8 documents)

| Document | Pages | Chunks | Source | In repo? |
|---|---|---|---|---|
| Permit-to-Work-forms.pdf | 14 | 23 | Generic template | ✅ |
| scaffold_work_permit.pdf | 11 | 27 | Generic template | ✅ |
| Chemical-Permit-Form.pdf | 2 | 2 | Generic template | ✅ |
| Cold-Work-Permit-Form.pdf | 2 | 2 | Generic template | ✅ |
| Confined-Space-Work-Permit.pdf | 2 | 2 | Generic template | ✅ |
| Electrical-Work-Permit.pdf | 2 | 2 | Generic template | ✅ |
| HotWorkPermit.pdf | 1 | 1 | Generic template | ✅ |
| maintenance_work.pdf | 2 | 4 | Generic template | ✅ |

## Engineering Drawings (1 document)

| Document | Pages | Chunks | Source | In repo? |
|---|---|---|---|---|
| piping_instrumentation_diagram.pdf | 42 | 42 | Sample P&ID | ✅ |

---

## Redistribution Notes

**OEM manuals (marked ❌):** Atlas Copco, Ingersoll Rand, and other equipment manufacturer manuals are commercial product documentation. They're used for evaluation (entity extraction, RAG retrieval testing) but are not redistributed in this repository out of respect for manufacturer copyright. To reproduce evaluation results involving these documents, obtain the equivalent manuals directly from the manufacturer or an authorized distributor and place them in `backend/data/uploads/` locally.

**OISD documents (marked ✅*):** OISD (Oil Industry Safety Directorate, under India's Ministry of Petroleum & Natural Gas) publishes these standards, case studies, and safety alerts for industry-wide safety awareness. They are included here on that basis. If you are reusing this corpus outside the context of this evaluation, verify current redistribution terms on [OISD's official site](https://oisd.gov.in) before further distribution.

**Government and public-domain documents:** The Factories Act 1948, PESO Petroleum Rules, and US CSB investigation reports are government publications with no redistribution restriction.

---

## Using the bundled corpus

To reproduce the evaluation results in [`EVALUATION.md`](EVALUATION.md):

1. Upload each file in [`sample_corpus/`](sample_corpus/) via the **Documents** panel, matching the **Document Type** shown in the category tables above (Procedure/Standard, Manual, Inspection, Work Order).
2. For the 4 excluded OEM manuals, substitute equivalent manuals you have rights to, or accept a small reduction in corpus size (33 vs. 37 documents) — this has a minor effect on Knowledge Graph density but does not change the evaluation methodology.
3. Run `python backend/app/eval/run_eval.py` once ingestion completes.
