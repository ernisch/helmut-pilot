# Recovery-Vorschau (rein lesend) — `vg-sozialwohnungen`, Einzel-Dokument-Pfad

**Zweck:** Neue, saubere Einzel-Dokument-Recovery für **genau** `vg-sozialwohnungen` vorbereiten —
ausschließlich über die konkrete, verifizierte `raw_document_id` des Seed-Dokuments. **Keine**
Anker-/Teilstring-/Titel-/Quelldomain-/Themen-Suche, **kein** automatisches Clustering.

**Status:** rein lesend vorbereitet. **Kein KI-Aufruf, kein Production-Write, nicht ausgeführt.**
Umsetzung nur nach ausdrücklicher neuer Freigabe.

## 1 · Konkrete `raw_document_id`
`rd-e229f73873e0640fdcf34e65d382b0e10ffb78974fe7eb328048468c94edb48f`
- Titel (Kurzlabel): „Weniger Sozialwohnungen: Auch 2025 fielen 20 000 weg"
- Quelle: **nd-aktuell.de**, Datum **2026-07-03**
- Erwartete Zuordnung: `vg-sozialwohnungen`

Diese ID ist im Code **hart verdrahtet** (`SINGLE_DOC_ALLOWLIST = { "vg-sozialwohnungen": "rd-e229f7…" }`).

## 2 · Read-only-Prüfungen (alle gegen Production, ohne Schreiben)
| # | Prüfung | Ergebnis |
|---|---|---|
| 1 | Rohdokument existiert noch | **ja** (nd-aktuell.de, 2026-07-03) |
| 2 | gehört eindeutig zu `vg-sozialwohnungen` | **ja** — `deriveVorgangId([doc]) = vg-sozialwohnungen` (genau 1 Cluster; Anker `sozialwohnungen`) |
| 3 | kein bestehendes complete-KO zum selben Vorgang | **erfüllt** — `ko-vg-sozialwohnungen` ist `pending` |
| 4 | kein semantisch gleiches complete-KO unter anderer `vorgang_id` | **erfüllt** — kein complete-KO nennt „sozialwohnung" (Headline + `was_ist_passiert` gescannt) |
| 5 | Dokument nicht bereits erfolgreich verarbeitet | **erfüllt** — `ko_document_links` für diese `raw_document_id`: **keine** |
| 6 | Zuordnung nicht mehrdeutig | **erfüllt** — genau 1 Dokument, genau 1 Cluster, genau 1 abgeleitete ID |
| 7 | neuer Lauf erzeugt genau 1 Wissensobjekt | **ja** — 1 Cluster → 1 KO (`vorgang_id` erzwungen) |
| 8 | neuer Lauf schreibt nur zugehörige Links | **ja** — genau 1 Link (dieses eine Dokument) |
| 9 | Lauf idempotent | **ja** — Re-Check unmittelbar vor KI/Write: bereits complete → skip |
| 10 | Lauf vollständig rückrollbar | **ja** — eindeutige Kennung `recovery:singledoc-<runid>` im Feld `understanding_model` |

## 3 · Duplikatprüfung (Zusammenfassung)
Kein complete-KO deckt den Vorgang ab (weder für `vg-sozialwohnungen` noch semantisch unter anderer
`vorgang_id`); das Seed-Dokument ist mit **keinem** KO verknüpft. → **netto-neu, kein Duplikat.**

## 4 · Erwarteter KI-Aufruf
**Genau 1** (`understanding.understandOneCluster` auf dem Ein-Dokument-Cluster). Budget-geprüft
(`canSpend`). Vorteil ggü. dem anker­basierten Lauf: nur der Seed → **kein** 3-Themen-Digest.

## 5 · Erwartete Writes
**Genau 1** Wissensobjekt (`ko-vg-sozialwohnungen`, `pending`→`complete`) + **genau 1**
`ko_document_link` (Seed-Dokument). Keine weiteren Zeilen.

## 6 · Sicherheitsgarantien des Code-Pfads (`lib/helmut/single-doc-recovery.js`, default AUS)
1. Harte Allowlist: **genau 1** Vorgang → **genau 1** `raw_document_id`.
2. Exakte `raw_document_id`-Prüfung; Abbruch bei falscher ID.
3. Abbruch bei **≠ 1** Rohdokument (0 oder >1).
4. Vor jedem Write erneute Prüfung auf bestehendes complete-KO.
5. Vor dem KI-Aufruf erneute Idempotenz-Prüfung (noch `pending`?).
6. Maximal **1** KI-Aufruf, maximal **1** KO, nur die zugehörigen Links.
7. Eigene Lauf-Kennung (`HELMUT_SINGLEDOC_RECOVERY_RUNID` → `recovery:singledoc-<runid>`).
8. Default deaktiviert (`HELMUT_SINGLEDOC_RECOVERY_EXECUTE`) **plus** exaktes Token
   (`RECOVER_SOZIALWOHNUNGEN_SINGLEDOC`); fail-closed bei jedem Widerspruch.
9. Datenschutz: Ausgabe nur ids/Slugs/Zahlen (`redactPlan`) — keine Titel/Volltexte/PII.
10. Keine pauschale Suche (nur `getRawDocumentById`, kein `listRawDocuments`/Anker/Teilstring).

Tests: `scripts/single-doc-recovery-test.js` (26 Assertions, 15 Szenarien), Offline-Suite 124/124 grün.

## 7 · Rollback-Plan der neuen Recovery (falls nach Ausführung nötig)
Analog zum bereits durchgeführten Rollback — eindeutig über die neue Kennung:
```sql
delete from ko_document_links where knowledge_object_id = 'ko-vg-sozialwohnungen';
update knowledge_objects set
  status='pending', understanding_status='pending', source_document_count=0,
  understanding_model='gpt-5-mini', ko_version=1,
  headline='Weniger Sozialwohnungen: Auch 2025 fielen 20 000 weg - nd-aktuell.de',
  /* NOT-NULL-Arrays -> '{}', NOT-NULL-JSONB -> '[]', classification_confidence -> '{}',
     restliche Analysefelder -> null (siehe recovery_rollback_rec_29569461715.md) */
where vorgang_id='vg-sozialwohnungen'
  and understanding_model like '%recovery:singledoc-<runid>%';
```

## 8 · Benötigte Production-Freigabe
Für die tatsächliche Ausführung: **ausdrückliche Freigabe** für `HELMUT_SINGLEDOC_RECOVERY_EXECUTE=1`
+ Token `RECOVER_SOZIALWOHNUNGEN_SINGLEDOC` (1 KI-Call, 1 Write + 1 Link). Bis dahin bleibt der Pfad
default AUS und unverdrahtet-sicher.
