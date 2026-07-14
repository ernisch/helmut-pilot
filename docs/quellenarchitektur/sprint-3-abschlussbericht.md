# Sprint 3 — Abschlussbericht (Globale Dedup · Fundstellen · Google News als Suchweg)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible Arbeiten — **keine** Production-/RLS-Änderung, kein
Deployment, kein Backfill in Production, keine Quellenaktivierung.

## 1. Was Sprint 3 umgesetzt hat

| Auftragspunkt | Umsetzung |
|---|---|
| **Ein Artikel über mehrere Suchwege → EIN Raw Document** (§16, Abnahme 5) | `mergeIntoDocuments` führt zusammen; jede Fundstelle bleibt in `document_findings` erhalten. |
| **Alle Fundstellen nachvollziehbar** (Abnahme 6) | Je Fundstelle: `source_id`/`retrieval_path_id`, `original_url`, `link_type`, `found_at`. |
| **Globale Dedup mit mehreren Signalen vor der KI** (§17) | Canonical-URL → Inhaltsfingerabdruck → Herausgeberdomain+Titelähnlichkeit+Datumsfenster. |
| **Inhaltsfingerabdruck getrennt vom `content_hash`** | Neue Spalte `content_fingerprint` (bereinigter Titel+Kontext, tokensortiert). |
| **Google News = Suchweg, kein Herausgeber** (§16) | Identität trägt die echte Herausgeberdomain (nie `news.google.com`); GN-URL bleibt Fundstelle. `extractCanonicalFromHtml` liest `rel=canonical`/`og:url`. |
| **Verschiedene Vorgänge nicht fälschlich mergen** (§18) | Weiche Titel-Regel bewusst auf denselben Herausgeber + Datumsfenster begrenzt. |

## 2. Neue Artefakte
| Datei | Inhalt |
|---|---|
| `lib/helmut/quellenarchitektur/dedup-global.js` | reine Logik: Dedup, Fundstellen, Titelähnlichkeit, Fingerprint, Canonical-Extraktion |
| `supabase/migrations/20260715_dedup_findings.sql` (+ Rollback) | 4 additive `raw_documents`-Spalten + Tabelle `document_findings` (RLS service_role-only) |
| `scripts/dedup-findings-test.js` | 30 Tests (Unit/Integration/Edge/Migration) |
| `docs/quellenarchitektur/06-dedup-fundstellen.md` | Doku |

## 3. Verifizierter Nutzen (Prod, read-only)
Die bestehende `content_hash`-Dedup erkennt **0** Duplikate (alle 4805 verschieden). Das neue Modell
würde real **101 Dokumente** zusammenführen, davon **11 Gruppen** mit echten Cross-Suchweg-Fundstellen;
~57 Dokumente teilen dieselbe Canonical-URL. → messbarer Gewinn an Sauberkeit und vermeidbaren
KI-Kosten (weniger doppelte Vorgänge/KOs).

## 4. Testergebnis
- **Neu:** `test:dedup-findings` **30 PASS / 0 FAIL**.
- **Keine Regression** (Sprint 3 ist rein additiv, kein Bestandscode geändert): source-architecture
  86/86, ko-classification 67/67, matching-norm 20/20, p1 **322/322**, goldset ✓.

## 5. Sicherheit, Kosten, Performance
- **Sicherheit:** `document_findings` global/mandantenlos, RLS service_role-only (konsistent mit
  Sprint 2); keine bestehende Policy/Spalte geändert.
- **Kosten:** keine — reine Logik/Migration/Tests; Dedup läuft **vor** der teuren KI und **spart**
  perspektivisch KI-Kosten (weniger doppelte Understanding-Calls).
- **Performance:** Dedup ist O(n) über Canonical/Fingerprint-Maps + gebucketeter Titelvergleich je
  Herausgeberdomain/Tag; für Crawl-Batches unkritisch. Nicht im App-Start-Pfad.

## 6. Grenzen / offene Risiken
- **Nicht in den Live-Crawl verdrahtet** (wie Sprint 1/2 additive Kompatibilitätsschicht). Die
  Einbindung in den produktiven Ingest (inkl. `document_findings`-Schreibpfad und Canonical-Fetch)
  ändert Crawl-Verhalten → **freigabepflichtiger** Folgeschritt (Shadow-Betrieb, Sprint 6/7).
- Titelähnlichkeit konservativ (0.72); Flexionsvarianten fängt i. d. R. die Canonical-/
  Fingerprint-Stufe. Bewusst gegen Falsch-Merges getunt.

## 7. Freigabepflichtige Production-Schritte (gesammelt, nicht ausgeführt)
Migrationen anwenden (`20260713`, `20260714`, `20260715` + Seeds) · KO-Klassifikations-Backfill · den
neuen Dedup-/Fundstellen-Pfad in den Live-Crawl einbinden (Shadow zuerst) · (langfristig) echtes
Supabase-Auth. **Alles vorbereitet, nichts ausgeführt.**

## 8. Nächster Sprint
**Sprint 4** (Paketaktivierung + Profil→Paket-Ableitung + Bund Basis + Referenzzählung) — setzt auf
dem Sprint-1-Paketmodell auf; **oder** Sprint 5 (Wichtigkeit vs. Relevanz vs. Handlungsfähigkeit),
das die Sprint-2-Klassifikation nutzt.
