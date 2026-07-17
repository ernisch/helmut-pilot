# Rollback des Recovery-Laufs `rec-29569461715`

**Ziel:** Den fehlerhaften Recovery-Lauf `rec-29569461715` vollständig und exakt zurückrollen und den
Zustand vor dem Lauf nachweislich wiederherstellen. **Einziger erlaubter Production-Write.**

Pre-Rollback-Snapshot: `docs/betrieb/recovery_rollback_snapshot_rec_29569461715.md`.

## 1 · Ausgangszustand (vor Rollback)
`ko-vg-sozialwohnungen`: `understanding_status=complete`, `status=neu`, `source_document_count=3`,
`understanding_model="gpt-5-mini | recovery:rec-29569461715"`, `headline=""`, 38 Analysefelder gesetzt,
`embedding` gesetzt, **3** `ko_document_links`.
Ziel (pristiner Pending-Stub, verifiziert am Vergleichs-Stub `vg-medikamenten`):
`pending`/`pending`, `source_document_count=0`, `understanding_model="gpt-5-mini"`,
`headline="Weniger Sozialwohnungen: Auch 2025 fielen 20 000 weg - nd-aktuell.de"`,
NOT-NULL-Arrays `{}`, NOT-NULL-JSONB `[]`, `classification_confidence={}`, restliche Analysefelder
`null`, 0 Links.

## 2 · Ausgeführte Rollback-Schritte (eine Transaktion)
Zuordnung **ausschließlich** über eindeutige IDs + Recovery-Kennung — **keine** pauschalen Updates
nach Thema/Titel/Datum.

```sql
begin;
-- (1) Nur die durch DIESEN KO erzeugten Links entfernen (exakt per knowledge_object_id)
delete from ko_document_links where knowledge_object_id = 'ko-vg-sozialwohnungen';
-- (2) KO exakt auf den Pending-Stub zurücksetzen, NUR wenn es noch die Kennung dieses Laufs trägt
update knowledge_objects set
  status='pending', understanding_status='pending', source_document_count=0,
  understanding_model='gpt-5-mini', ko_version=1,
  headline='Weniger Sozialwohnungen: Auch 2025 fielen 20 000 weg - nd-aktuell.de',
  parteien='{}'::text[], ausschuesse='{}'::text[], ministerien='{}'::text[], risiken='{}'::text[],
  chancen='{}'::text[], policy_field='{}'::text[], related_levels='{}'::text[], tags='{}'::text[],
  mentioned_people='{}'::text[], mentioned_mps='{}'::text[], mentioned_parties='{}'::text[],
  mentioned_committees='{}'::text[], mentioned_ministries='{}'::text[],
  mentioned_locations='{}'::text[], mentioned_organizations='{}'::text[],
  affected_geographies='[]'::jsonb, mentioned_geographies='[]'::jsonb,
  decision_entities='[]'::jsonb, related_entities='[]'::jsonb, classification_confidence='{}'::jsonb,
  was_ist_passiert=null, warum_wichtig=null, wer_ist_betroffen=null, zeitdruck=null,
  handlungsempfehlung=null, confidence_score=null, political_level=null, instrument=null, stage=null,
  deadline=null, best_source_url=null, best_link_type=null, source_trust=null,
  understanding_tokens=null, embedding=null, display_title=null, display_summary=null,
  why_relevant=null, recommendation=null, display_category=null, risk_of_no_action=null,
  opportunity_summary=null, risk_level=null, opportunity_level=null,
  recommended_communication_struct=null, action_items_struct=null, recommended_communication=null,
  action_items=null, decision_level=null, event_type=null
where vorgang_id='vg-sozialwohnungen'
  and understanding_model like '%recovery:rec-29569461715%';
commit;
```
Hinweis: NOT-NULL-Spalten wurden nicht `null`, sondern auf ihren Stub-Default (`{}` / `[]`) gesetzt
(am pristinen Stub verifiziert), damit der Zustand EXAKT dem Vorzustand entspricht.

## 3 · Veränderte Zeilen
- `ko_document_links`: **3 gelöscht** (die 3 Seed-/Zusatz-Links dieses KO).
- `knowledge_objects`: **1 aktualisiert** (`ko-vg-sozialwohnungen`, marker-gefiltert → genau 1 Treffer).
- **Summe: 4 Zeilen**, exakt die im Snapshot dokumentierten. Kein anderer Datensatz.

## 4 · Verifikation (rein lesend, nach Rollback)
| Prüfung | Ergebnis |
|---|---|
| Zeilen mit Kennung `recovery:rec-29569461715` | **0** |
| `ko_document_links` für `ko-vg-sozialwohnungen` | **0** |
| `understanding_status` / `status` | `pending` / `pending` |
| `source_document_count` | `0` |
| `understanding_model` | `gpt-5-mini` |
| `headline` | Seed-Headline wiederhergestellt (Länge 68) |
| Analysefelder | leer/Stub-Default (`was_ist_passiert` etc. `null`) |
| `updated_at` | unverändert `2026-07-02 16:36:12` (kein Auto-Update-Trigger) |
| Andere 5 Kandidaten | unverändert `pending` |
| Seed-Rohdokument `rd-e229f7…` | existiert weiterhin |
| Fremde Zeilen verändert | keine (nur `raw_documents`/`complete`-Bestand wächst durch laufende Crons, NICHT durch den Rollback) |

## 5 · Idempotenz-Test (zweiter Rollback als read-only Trockenlauf)
Prädikate des Rollbacks erneut ausgewertet (ohne Schreiben):
- Links, die ein zweites `DELETE` treffen würde: **0**
- KOs, die ein zweites `UPDATE` (marker-gefiltert) treffen würde: **0**

→ Ein zweiter Rollback ergäbe **0 Änderungen**. Der Rollback ist idempotent und abgeschlossen.

**Ergebnis:** Der Recovery-Lauf `rec-29569461715` ist **vollständig und exakt** zurückgerollt; der
Vorzustand (pristiner Pending-Stub) ist nachweislich wiederhergestellt. Keine systemseitigen Fehler.
