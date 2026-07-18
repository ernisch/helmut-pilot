# Datenmotor-Sprint: Pending-Rückstau · Understanding · KO-Anreicherung

**Stand:** 2026-07-18 · **Scope:** OP-05, OP-06, OP-08, OP-13, OP-14 (+ Betriebsbefund B2)
der Restliste (`docs/datenmotor-restliste.md`). **Arbeitsregeln eingehalten:** keine
Änderung an Google News/Abrufwegen/Drosselung, an OP-03/OP-04, am App-/Admin-Design;
keine BE/BB-Aktivierung, keine Retention, keine Migration, kein Deployment, keine
Production-Datenänderung, keine Recovery-Ausführung. Alle Production-Zugriffe dieses
Sprints waren **read-only** (SQL-SELECTs, Action-Logs) plus **ein** read-only
Workflow-Dispatch (Backfill-Dry-Run ohne Token — technisch schreibunfähig).

---

## 1 · Abgrenzung zu OP-03/OP-04 (geprüft)

- `knowledge_objects` und `raw_documents` tragen **keine** tenant-/user-Spalten
  (live geprüft): der KO-Korpus ist mandantenneutral. **OP-04** (Demo-Mandate
  entfernen) berührt die Datenbasis dieses Sprints nicht.
- **OP-03** (Migration `20260721` = nur Funktions-`search_path`/Grants; `HELMUT_TENANT_LLM_CAP`;
  JWT-Konzept) überschneidet sich weder mit den hier geänderten Dateien noch mit den
  betroffenen Tabellen-Daten.
- **Ergebnis: dieser Sprint ist sicher parallel zu OP-03/OP-04 bearbeitbar.** Einzige
  geteilte Dateien sind Doku-Anhänge (`env-inventar.md`: 1 neue Zeile, append-only).
- **Wichtiger Nebenbefund:** Der ungemergte Branch `claude/helmut-datenmotor-impl-2-kd1jl9`
  (Recovery-/Beweis-Thread, abgeschlossen 2026-07-17) enthält neuere OP-05-Belege und den
  Einzel-Dokument-Recovery-Pfad (siehe §4). Dieser Sprint ändert **nichts** an dessen
  Dateien (`understanding-recovery.js/.yml`, Beweisprotokoll) — kein Konflikt.

## 2 · Pending-Rückstau: vollständige Live-Analyse (read-only, 2026-07-17)

Live-Stand `knowledge_objects` (SQL): **322 complete · 49 pending · 4 failed** (= 53 offene).
Abweichungen zur Restliste (Stand 50+2):

| Änderung | Beleg |
|---|---|
| `vg-sozialwohnungen` ist **complete** (recovert) | `understanding_model = "gpt-5-mini \| recovery:singledoc-29583280106"`, `status='neu'`, 1 Dokumentlink |
| **2 neue `failed`** vom 17.07. | `vg-45975d00f663a2ec163778de` (07:36 UTC), `vg-unterhaltsvorschuss` (07:41 UTC), beide `gpt-5-mini`, kein complete-Duplikat (SQL-geprüft) — frische technische Fehlschläge, KEIN Alt-Rückstand → OP-13-Kandidaten |
| Exakte IDs enthalten Umlaute | z. B. `vg-arbeitsverträge`, `vg-bürokratie`, `vg-mobilitätsknoten` — Allowlists verwenden die exakte DB-Form |

**Klassifikation aller 53 offenen Fälle (terminale Behandlungspfade festgelegt):**

| Gruppe | n | Fälle | Behandlungspfad |
|---|---:|---|---|
| Einzel-Doc-Recovery (OP-05-Rest) | 4 | `vg-arbeitsverträge`, `vg-medikamenten`, `vg-steuerstrafrecht`, `vg-umstellungen` | manuelle Einzel-Dokument-Recovery je exakter `raw_document_id` (§4), danach `complete` |
| Rauschen | 27 | Liste in `pending_terminal_aussortierung.md` §2 | terminal `failed-final` (OP-06-Action, freigabepflichtig) |
| Belegte Duplikate | 7 | `vg-einkommensteuer`, `vg-kinderfreibetrag`, `vg-bundesagentur`, `vg-riesenfehler`, `vg-gesetzentwurf` (failed), `vg-forschung`, `vg-psychotherapie` | terminal `failed-final` (OP-06-Action) — jede Duplikat-Behauptung einzeln per SQL live bestätigt |
| Manuell/redaktionell | 2 | `vg-krankschreibung` (36 Docs mehrdeutig), `vg-privatsieren` (Kampagne) | Betreiber-Entscheid: Einzel-Doc-Recovery mit manueller Dokumentwahl ODER zweite Aussortier-Tranche |
| Ermessensfälle Kategorie 2 | 10 | `vg-wissenschafts`, `vg-versicherten`, `vg-0fab030265ec2c2d9d1dcaf2`, `vg-fachkräftepotenzial`, `vg-mietregulierung`, `vg-justizminister`, `vg-justizvertreter`, `vg-bahnprojekte`, `vg-einreise`, `vg-direktbeschluss` | Betreiber-Sichtung; Vorschlag: zweite Aussortier-Tranche (alle >14 Tage alt, außerhalb Kernmandat). Zusatzbefund: das Thema von `vg-wissenschafts` ist bereits von einem complete-KO abgedeckt (SQL: 1 Treffer „Wissenschaftsfreiheit") |
| Frische failed (17.07.) | 2 | `vg-45975d00f663a2ec163778de`, `vg-unterhaltsvorschuss` | OP-13 (bounded Retry) — netto-neu, Cluster im aktuellen Fenster, Retry aussichtsreich |
| bereits erledigt | 1 | `vg-sozialwohnungen` | — (recovert, siehe §4) |

Summe: 4+27+7+2+10+2 = 52 offene + 1 erledigt = 53. ✓

## 3 · Gefundene und geschlossene Code-Lücke: „nie wieder"-Garantie für `failed-final`

**Befund (neu, in diesem Sprint):** Der Terminal-Zustand `failed-final` wurde an zwei
Stellen NICHT ausgeschlossen:

1. `storage.js` `listPendingKnowledgeObjects` filterte nur `failed` — ein terminal
   aussortierter Fall (`status='pending'`, `understanding_status='failed-final'`) wäre
   bei **jedem** Pending-Cron-Lauf erneut geladen und geprüft worden (genau die ewige
   Neuprüfung, die OP-06 beenden soll).
2. `understanding.js` `understandOneCluster` prüfte nur `=== "failed"` — ein terminaler
   Fall hätte bei später wieder passendem Cluster sogar **erneut einen KI-Call** bekommen
   und wäre überschrieben worden (Widerspruch zur zugesicherten Terminal-Garantie von
   P1-4/OP-13 und OP-06).

**Fix (dieser PR, verhaltensneutral heute):** zentrales Prädikat
`isTerminalUnderstandingStatus` (`lib/helmut/pending-terminal.js`), verdrahtet in beiden
Stellen (`skipped-terminal` ohne Budget-/KI-Berührung). Heute existiert noch keine
`failed-final`-Zeile in Production → 0 Verhaltensänderung bis zur ersten terminalen
Markierung; danach ist die Garantie durchgesetzt. Tests decken beide Stellen ab.

## 4 · OP-05 (6 Altfälle): tatsächlicher Stand — Restliste an diesem Punkt überholt

Der Recovery-/Beweis-Thread (Branch `claude/helmut-datenmotor-impl-2-kd1jl9`, ungemergt)
hat den OP-05-Stand nach Redaktionsschluss der Restliste weitergedreht; live verifiziert:

- **Ausgeführt und bewiesen:** `vg-sozialwohnungen` per **Einzel-Dokument-Recovery**
  `singledoc-29583280106` (1 KI-Call, 1 KO, 1 Link, Rollback-Kennung). Ein früherer
  **anker-basierter** Lauf `rec-29569461715` erzeugte einen verunreinigten 3-Themen-Digest
  und wurde **sauber zurückgerollt**.
- **Konsequenz (dokumentiert auf dem Branch, hier bestätigt):** Der anker-basierte
  6er-Recovery-Pfad (auf `main` weiterhin als `understanding-recovery.yml` dispatchbar!)
  ist für Multi-Doc-Fälle **ungeeignet** — Teilstring-Anker ziehen fremde Themen an. Beleg
  aus diesem Sprint: die 3 „Medikamenten"-Titeltreffer im Seed-Fenster sind **drei
  verschiedene Ereignisse** (FDP-Drohnen-Lieferung, GKV-Zuzahlung, Ebola-Studie).
  **Empfehlung: die alte 6er-Action nicht mehr benutzen**; Ersatz ist der Einzel-Doc-Pfad
  des impl-2-Branches (dessen Merge außerhalb dieses Sprint-Scopes liegt).
- **Rest: 4 Fälle, Recovery vorbereitet.** Exakte Seed-Dokumente read-only identifiziert
  (Seed-Fenster 02./03.07., je genau 1 kohärentes Dokument):

| `vorgang_id` | Seed-`raw_document_id` | Quelle |
|---|---|---|
| `vg-umstellungen` | `rd-fa2dbb36445d8ba085afc083c156a6dd2682de461d999c729f9190d62211d1dc` | AD HOC NEWS (TRBA 500) |
| `vg-steuerstrafrecht` | `rd-72d2835b726b832c0f44be8576c34f12d686c4bee34b6f5d5713914aaaca4206` | Anwalt.de (Selbstanzeige-Reform) |
| `vg-arbeitsverträge` | `rd-dfae1fb19c224c41bbca2d04d8dec553038a804092e611263009498a020eb94d` | ZEIT Online |
| `vg-medikamenten` | `rd-6284ae1a92904a410ec14e28d965a5e579176b172dc0e9070052cce57d0a485f` | inFranken.de (GKV-Zuzahlung — die beiden anderen Titeltreffer gehören zu fremden Themen und dürfen NICHT mit rein) |

- **`vg-psychotherapie`** (früher 6er-Kandidat) ist ein **echtes Duplikat**
  (`vg-psychotherapeuten` complete seit 05.07., SQL-verifiziert) → in die OP-06-Allowlist
  verschoben statt Recovery.
- **Nächster Schritt (freigabepflichtig, außerhalb dieses PRs):** die 4 Fälle per
  Einzel-Doc-Pfad recovern — je exakte `raw_document_id` (oben), je 1 KI-Call, additiv,
  Rollback-Kennung. Setzt den Merge des impl-2-Branches (oder eine äquivalente Erweiterung
  seiner 1-Fall-Allowlist) voraus.

## 5 · OP-08 (KO-Klassifikations-Backfill): AUSGEFÜHRT UND VOLLSTÄNDIG BELEGT

| Nachweis | Beleg |
|---|---|
| Echter Lauf | GitHub-Action `ko-classification-backfill.yml`, Run **29511858469**, 2026-07-16 15:36 UTC, Token korrekt, Schritt B: **`candidates: 195, processed: 195, failed: 0`**, levelHist `{bund:118, eu:2, unknown:68, land:7}` |
| Idempotenz-Zweitlauf = 0 Änderungen | Run **29621926765**, 2026-07-17 23:56 UTC (read-only Dry-Run-Dispatch dieses Sprints): **`totalKos: 375, candidates: 0`**, Schritt B durch das 0-Kandidaten-Gate technisch unerreichbar |
| DB-Gegenprobe (SQL, 2026-07-17) | **0** von 322 complete-KOs ohne `decision_level`/`political_level`/`embedding`/`event_type` |

**→ OP-08 ist eindeutig belegt abgeschlossen** (in der Restliste nachgezogen). Damit ist
auch die OP-14-Abhängigkeit „sinnvoll nach OP-08" erfüllt und die OP-22-Vorbedingung
(vollständige KO-Merkmale) gegeben.

## 6 · KO-Anreicherung: Tags, Politikfelder, weitere Klassifikationen (verifiziert)

- **Ebenen/Feature-Vektor/event_type/Geografien/Entitäten:** write-time seit Sprint 2
  (`understanding.js` → `classifyKnowledgeObject`) + Backfill für den Altbestand (§5) —
  **vollständig** (0 Lücken, SQL-belegt).
- **`tags`:** 173 von 322 complete-KOs befüllt (149 leer — Altbestand vor Aktivierung der
  Tag-Extraktion). Der KI-gestützte Anreicherungs-Backfill
  (`/api/admin/ko-enrichment-backfill`, harter 5-€-Deckel, Evidence-Guard, idempotent;
  `docs/ko-anreicherung-analyse.md`) ist gebaut + getestet, **nicht ausgeführt** —
  optional, eigene Freigabe (Prod-Write + KI ≤ ~5 €).
- **`policy_field`:** 62 von 322 in der DB befüllt; für die übrigen greift die
  **read-time-Ableitung** aus Ausschüssen (`matching.js` `derivePolicyFields`) — die
  Themen-Dimension ist damit funktional geschlossen; ein DB-Backfill bleibt fachlich
  unnötig (dokumentiert in der Anreicherungs-Analyse).

## 7 · OP-13 (failed-KO-Recovery) — analysiert, NICHT aktiviert

- Code live (`ko-recovery.js`, Cron-verdrahtet `server.js:1083`), Flag AUS. Bounded
  (Default 2 Retries → `failed-final`), fail-safe, No-Op ohne Flag.
- Kandidatenlage jetzt: 4 `failed`. Davon 1 Duplikat-Risiko (`vg-gesetzentwurf` — würde
  bei Retry doppeln → **vorher OP-06 ausführen**), 1 Alt-Fall (`vg-bürokratie`, ≈15.07.,
  wenige Docs, Retry aussichtsreich), 2 frische netto-neue vom 17.07. (Retry aussichtsreich,
  Cluster im Fenster).
- Der Terminal-Schutz-Fix (§3) schließt die Lücke, dass `failed-final`-Fälle nach
  OP-13-Terminalisierung wieder im Pending-Pfad auftauchen.
- **Empfohlene Reihenfolge:** OP-06 ausführen → `HELMUT_FAILED_KO_RECOVERY=1` freigeben
  (eigene Env-Freigabe + Redeploy, Restliste OP-13).

## 8 · OP-14 (Understanding-Priorisierung) — analysiert, NICHT aktiviert

- Reine KI-freie Umsortierung (`understanding-priority.js`), wirkt nur im Eager-Pfad
  (`understanding.js:733`), Flag `HELMUT_UNDERSTANDING_PRIORITY` Default AUS, byte-identisches
  Verhalten ohne Flag. 2 Testsuiten vorhanden und grün.
- Auf den Alt-Rückstand wirkungslos (dokumentlose Waisen), auf den Pending-Cron-Pfad ohne
  Wirkung — Aktivierung ist eine reine Reihenfolge-Verbesserung an Budgetdeckel-Tagen.
- Abhängigkeit „nach OP-08" ist seit §5 erfüllt. **Aktivierung bleibt freigabepflichtig**
  (Env + Redeploy + Beleg an einem Budgetdeckel-Tag); nichts davon in diesem PR.

## 9 · Umgesetzte Änderungen (dieser PR — Code/Tests/Workflow/Doku, kein Prod-Eingriff)

1. `lib/helmut/pending-terminal.js` — OP-06-Modul: 34er-Allowlist, doppelte Sperre,
   Plan/Ausführung mit Laufzeit-Re-Checks, Rollback-Kennung, Redaction (neu).
2. `lib/helmut/storage.js` — `listPendingKnowledgeObjects` schließt `failed-final` aus;
   neue konditionale Write-Primitive `markPendingUnderstandingTerminal` (nur vom doppelt
   gesperrten Skript genutzt).
3. `lib/helmut/understanding.js` — `understandOneCluster`: `skipped-terminal`-Guard.
4. `scripts/pending-terminal-aussortieren.js` + `.github/workflows/pending-terminal-aussortieren.yml`
   — Default read-only Plan/Snapshot; echter Lauf nur mit Flag + Token (neu).
5. `scripts/pending-terminal-test.js` — 63 Assertions (neu, läuft in der Offline-Suite/CI).
6. Doku: diese Datei, `pending_terminal_aussortierung.md` (Freigabevorlage),
   `env-inventar.md` (+1 Zeile), `datenmotor-restliste.md` (nur belegte Abschlüsse/Stände
   nachgezogen; Hinweis: Datei stammt aus PR #101 — Konfliktauflösung im PR-Text).

## 10 · Offene Production-Beweise / Freigaben nach diesem Sprint

| # | Aktion | Freigabe |
|---|---|---|
| 1 | OP-06: Aussortier-Action mit `AUSSORTIEREN_34_BESTAETIGT` (nach Merge dieses PRs) | JA — Freigabesatz in `pending_terminal_aussortierung.md` §6 |
| 2 | OP-05-Rest: Einzel-Doc-Recovery der 4 Fälle (je exakte `raw_document_id`, §4) | JA — setzt impl-2-Branch-Merge bzw. Allowlist-Erweiterung voraus |
| 3 | OP-06-Nachweis: SQL-Gegenprobe + Idempotenz-Zweitlauf dokumentieren | folgt aus 1 |
| 4 | OP-13: `HELMUT_FAILED_KO_RECOVERY=1` (empfohlen nach 1) | JA (Env + Redeploy) |
| 5 | OP-14: `HELMUT_UNDERSTANDING_PRIORITY=1` + Budgetdeckel-Tag-Beleg | JA (Env + Redeploy) |
| 6 | Optional: KI-Tags-Backfill (≤ ~5 €, Admin-Endpoint) für 149 Alt-KOs | JA (Prod-Write + KI) |
| 7 | Betreiber-Entscheid: 10 Ermessensfälle + 2 manuelle Fälle (zweite Tranche oder Recovery) | JA (Klassifikationsentscheid) |
| — | Keine Retention vor Abschluss von 1+2 (sonst permanenter Verlust der 4 Recovery-Fälle) | Sperrvermerk bleibt |

_Alle Zahlen dieses Berichts: read-only SQL gegen Production (2026-07-17/18), GitHub-Action-
Logs (Run-IDs genannt) und Code-Stand `main` `e178480`. Keine Production-Daten verändert._
