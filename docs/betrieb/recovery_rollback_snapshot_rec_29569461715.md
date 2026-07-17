# Pre-Rollback-Snapshot — Recovery-Lauf `rec-29569461715`

**Zweck:** Vollständiger technischer Snapshot des durch den fehlerhaften Recovery-Lauf
`rec-29569461715` erzeugten Zustands — als Beweisgrundlage VOR dem Rollback.

**Transparenzhinweis:** Der Rollback wurde im unmittelbar vorangegangenen Arbeitsschritt bereits
als kontrollierte Transaktion ausgeführt und committet (marker-gefiltert). Dieser Snapshot ist aus
den **während der Operation erfassten Ist-Werten** rekonstruiert (mehrere read-only Abfragen der
betroffenen Zeile + der pristinen Vergleichs-Stub `vg-medikamenten`). Keine Volltexte, keine
unnötigen personenbezogenen Daten — nur Schema-/Status-/ID-Ebene.

## 1 · Recovery-Kennung
`recovery:rec-29569461715` — GitHub-Action-Run **29569461715**, Job **87849581636**, Feature-Branch,
`conclusion: success`, ausgeführt **2026-07-17 09:18:17–09:18:41 UTC**.

## 2 · Wissensobjekt-ID
`ko-vg-sozialwohnungen`

## 3 · vorgang_id
`vg-sozialwohnungen`

## 4 · Statusfelder (durch den Lauf gesetzt / verändert)
| Feld | VOR dem Recovery (Pending-Stub) | NACH dem Recovery (fehlerhafter Zustand) |
|---|---|---|
| `understanding_status` | `pending` | `complete` |
| `status` | `pending` | `neu` |
| `source_document_count` | `0` | `3` |
| `understanding_model` | `gpt-5-mini` | `gpt-5-mini \| recovery:rec-29569461715` |
| `headline` | `Weniger Sozialwohnungen: Auch 2025 fielen 20 000 weg - nd-aktuell.de` | `""` (leer überschrieben) |
| `ko_version` | `1` | `1` (unverändert) |
| `created_at` / `updated_at` | `2026-07-02 16:36:12` | unverändert `2026-07-02 16:36:12` |

## 5 · Durch den Recovery-Lauf gesetzte Analysefelder (Non-Null gegenüber Pending-Stub)
`was_ist_passiert`, `warum_wichtig`, `wer_ist_betroffen`, `zeitdruck`, `handlungsempfehlung`,
`confidence_score`, `political_level`, `source_trust`, `best_source_url`, `best_link_type`,
`display_title`, `display_summary`, `display_category`, `why_relevant`, `recommendation`,
`recommended_communication`, `recommended_communication_struct`, `risk_of_no_action`, `risk_level`,
`opportunity_summary`, `opportunity_level`, `decision_level`, `event_type`, `action_items`,
`action_items_struct`, `parteien`, `ministerien`, `risiken`, `chancen`, `mentioned_parties`,
`mentioned_locations`, `affected_geographies`, `mentioned_geographies`, `decision_entities`,
`related_entities`, `related_levels`, `embedding` (Vektor gesetzt); `classification_confidence`
von `{}` → `{"level":"high","entities":"medium","geography":"medium","event_type":"medium"}`.

Inhalt (nur Themen-Ebene, kein Volltext): 3-Themen-Wohnungspolitik-Digest — (a) Berlin
Verstaatlichungsverbot, (b) Rückgang Sozialwohnungen, (c) Nebenkosten älterer Wohnungen.

## 6 · Erzeugte `ko_document_links` (3 Zeilen)
| # | raw_document_id | Quelle | Datum | Titel (Kurzlabel) |
|---|---|---|---|---|
| 1 | `rd-16751f467ede96b4e76b9f494f36321446696a6fa41b080061a172b86da4c944` | Berliner Morgenpost | 2026-07-02 | „…Berlin Verstaatlichung privater Wohnungen verbieten" |
| 2 | `rd-7963a7527b2c158e8b5531e5507769640b8fa921116db717422e5272f1b4b45f` | Deutschlandfunk Politik | 2026-07-02 | „…Nebenkosten in älteren Wohnungen steigen…" |
| 3 | `rd-e229f73873e0640fdcf34e65d382b0e10ffb78974fe7eb328048468c94edb48f` | nd-aktuell.de | 2026-07-03 | „Weniger Sozialwohnungen: Auch 2025 fielen 20 000 weg" **(Seed)** |

## 7 · Verwendete `raw_document_ids`
Die 3 oben genannten. Ursache der ungewollten 2 Zusatzdokumente: der Anker `sozialwohnungen` matcht
per Teilstring auch das generische Token `wohnungen` → Docs 1 und 2 wurden mit eingezogen. Der
korrekte Seed ist ausschließlich Dokument **3** (`rd-e229f7…`).

## 8 · Verwendetes KI-Modell
`gpt-5-mini` (Azure OpenAI Deployment), 1 Aufruf; Rollback-Kennung im Feld `understanding_model`.

## 9 · Zeitpunkte
- Recovery-Lauf: 2026-07-17 09:18:17–09:18:41 UTC.
- KO `created_at`/`updated_at`: 2026-07-02 16:36:12 (durch den Recovery-Write NICHT verändert).

## 10 · Anzahl betroffener Zeilen
**4** — 1 `knowledge_objects`-Zeile (`ko-vg-sozialwohnungen`) + 3 `ko_document_links`. Kein anderer
Datensatz (keine `raw_documents`, keine anderen KOs, keine Quellen/Briefings/Entscheidungen).
