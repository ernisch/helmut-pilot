# Sprint 2 — Abschlussbericht (Knowledge-Object-Klassifikation)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible Arbeiten — **keine** Production-Änderung, kein
Deployment, keine Quellenaktivierung.

## 1. Was Sprint 2 umgesetzt hat

Die politische Einordnung jedes Vorgangs — die Voraussetzung dafür, dass Landesinhalte nicht im
Bundesrauschen untergehen und Matching günstig vorberechnet werden kann.

| Bereich | Umsetzung |
|---|---|
| **Klassifikationsfelder** | `decision_level`, `related_levels`, `affected_geographies`, `mentioned_geographies`, `decision_entities`, `related_entities`, `event_type`, dimensionierte `classification_confidence` — additiv im KO-Schema (nicht-required). |
| **KI + Deriver** | Der eine Understanding-Call liefert `decision_level`/`event_type`; ein reiner Deriver (`classification.js`, keine KI) füllt jede Lücke aus belegten Feldern → `decision_level` **nie leer** (behebt `political_level` 0/231). `political_level` wird gespiegelt (Rückwärtskompatibilität). |
| **Namen → IDs** | Orte/Entitäten werden gegen die Sprint-1-Seeds aufgelöst; unauflösbare bleiben mit `entity_id: null` (kein erfundener Treffer). |
| **Embedding write-time** | Deterministischer 256-dim-Vektor wird im Assembler erzeugt + persistiert (behebt `embedding` 0/231, `matching_results` 0). Getrennte Schreib-Whitelist; Lesen bleibt ohne Vektor (Perf). |
| **Whitelist-Falle** | Behoben: neue Felder in Lese-Whitelist, `embedding` in Write-Whitelist, `saveKnowledgeObjectEnrichment` um Klassifikationsfelder erweitert. |
| **Alt-KO-Backfill** | `ko-classification-backfill.js`: kostenneutral (keine KI), Dry-Run-Default, idempotent. |
| **RLS-Verschärfung** | Sprint-1-Quellentabellen jetzt **service_role-only** (keine `authenticated`-Leserichtlinie). |

## 2. Behobene Klassifikationsprobleme
- `political_level` bei allen 231 KOs leer → `decision_level` (+ gespiegeltes `political_level`) **nie leer**.
- `embedding`/`matching_results` = 0 → Embedding write-time persistiert.
- „Whitelist-Falle" (Feld gesetzt, aber still verworfen) → an allen drei Stellen synchron geführt.
- Latente Resolver-Bugs behoben: „eu" nicht mehr als Silbe in „Deutschland"; „Menschenrechte" nicht
  mehr fälschlich auf den Rechtsausschuss.

## 3. Kritische RLS-Prüfung (wie beauftragt)
**Frage:** Brauchen normale eingeloggte Nutzer direkten Lesezugriff auf die neuen globalen
Quellentabellen? **Antwort: Nein.** Der gesamte produktive DB-Zugriff läuft über `service_role`; der
`authenticated`/JWT-Pfad ist stillgelegt, und die Quellendefinitionen werden nur intern + im Admin
gebraucht. **Umgesetzt:** restriktivste sichere Variante — RLS aktiviert, **keine** permissive Policy
(service_role-only), konsistent mit `pipeline_locks`. **RLS in Production wurde nicht geändert** (nur
die vorbereitete Migrationsdatei verschärft).

## 4. Neue/geänderte Artefakte
| Datei | Art |
|---|---|
| `lib/helmut/quellenarchitektur/classification.js` | neu — Deriver + Resolver (reine Logik) |
| `lib/helmut/ko-classification-backfill.js` | neu — Backfill-Logik (deps-injizierbar) |
| `lib/helmut/understanding-schema.js` | geändert — neue Enums + additive Felder |
| `lib/helmut/understanding.js` | geändert — Assembler (Klassifikation + Embedding), Prompt |
| `lib/helmut/storage.js` | geändert — Whitelist-Falle, Write-Whitelist, Enrichment-Patch |
| `lib/helmut/quellenarchitektur/seeds/entities.js` | geändert — eindeutiger Menschenrechts-Key |
| `supabase/migrations/20260714_ko_classification.sql` (+ Rollback) | neu — additive KO-Spalten |
| `supabase/migrations/20260713_source_architecture.sql` | geändert — RLS service_role-only |
| `scripts/ko-classification-backfill.js`, `scripts/ko-classification-test.js` | neu |
| `docs/quellenarchitektur/04-…, sprint-2-abschlussbericht.md` | neu |

## 5. Testergebnis
- **Neu:** `test:ko-classification` **55 PASS / 0 FAIL**.
- **Kein Regressionsverlust** — vollständige Offline-Suite grün: p1 **322/322**, goldset ✓,
  understanding-eval **7/7**, matching-norm 20/20, helmut-fields 65/65, decisions 38/38,
  radar-state 102/102, ko-anreicherung 18/18, ko-backfill 24/24, lage 138/138,
  source-architecture (Sprint 1) **86/86**.
- Alle neuen Dateien `node --check` grün.

## 6. Sicherheit, Kosten, Performance
- **Sicherheit/Mandanten:** RLS der Quellentabellen verschärft (service_role-only); keine bestehende
  Policy in Prod geändert; KO-Klassifikation ist mandantenlos (global) — keine Tenant-Daten berührt.
- **Kosten:** keine — Klassifikation läuft im **bestehenden** Understanding-Call mit (0 Zusatz-KI);
  Backfill kostenneutral (deterministisch); Embedding ist ein Hash-Vektor (keine Embeddings-API).
- **Performance:** Embedding write-time statt read-time → bereitet vorberechnetes Matching vor; Lesen
  bleibt ohne Vektor (keine Payload-Aufblähung).

## 7. Offene Risiken / noch nicht ausgeführte Production-Schritte (freigabepflichtig)
1. **Migration `20260714_ko_classification.sql` anwenden** (additiv; Rollback vorhanden).
2. **KO-Klassifikations-Backfill `--execute`** für die 231 Alt-KOs (kostenneutral; schreibt nur
   Klassifikationsspalten). Empfehlung: nach Schritt 1, Dry-Run zuerst.
3. **Sprint-1-Migration + Seed anwenden** (aus Sprint 1, weiterhin offen) — Voraussetzung, damit die
   `geography_id`/`entity_id`-Referenzen der Klassifikation auf reale Zeilen zeigen.
4. Die Klassifikation greift für **neue** KOs automatisch, sobald die KO-Migration angewendet ist;
   ohne die neuen Spalten werden die Felder still verworfen (kein Fehler, aber keine Wirkung).

Restrisiko (bewusst): Der deterministische Ebenen-Deriver setzt bei fehlenden Signalen `bund` mit
**niedriger** Konfidenz. Für den aktuellen (bundeslastigen) Bestand ist das korrekt; echte
Landesinhalte (ab Sprint 9) werden über Landes-Institutionssignale + KI korrekt als `land` erkannt.
Die Konfidenz macht unsichere Fälle im Admin (Sprint 8) sichtbar.

## 8. Nächster Sprint
**Sprint 3** (globale Deduplizierung + Fundstellen + Google News als Suchweg) — setzt auf dem
Herausgeber-/Abrufweg-Fundament (Sprint 1) auf. Alternativ **Sprint 5** (Wichtigkeit vs. Relevanz vs.
Handlungsfähigkeit), das nun die in Sprint 2 gebaute Ebenen-/Geografie-Klassifikation nutzen kann.
