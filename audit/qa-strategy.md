# QA & Teststrategie — Helmut

**Sprint:** SaaS-Readiness-Audit · **Phase 9** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend. Keine Fixes.

> **Kernbefund:** Die vorhandene Test-Suite ist **breit und grün** (22 Offline-Suites, ~1382 Assertions), prüft aber überwiegend **Struktur, Schema und Einzel-Logik mit Fixtures**. Es fehlt die vom Auftrag geforderte Kernprüfung: **kein Test weist end-to-end nach, dass ein konfiguriertes Profil mit vorhandenen relevanten Vorgängen tatsächlich nicht-leere, korrekt gerankte Inhalte bis zum Nutzer erhält.** Genau die in Block 2/3 gefundenen technischen Leerzustände (0 „Sofort reagieren", 12s-Timeout-Verlust, 200-Cap, Watchdog-Fehlalarm) würden von den heutigen Tests **nicht** erkannt.

---

## 1. Test-Inventar (ausgeführt, offline, alle grün)

| Suite | Assertions | Deckt ab |
|---|---|---|
| p1-security-check | 322 | C6-C9 injizierte-Deps-Happy-Paths, Security-Greps, DSGVO, Fake-Fallback-Verbote |
| current-helmut-state | 79 | CurrentHelmutState-Adapter, fresh-aware Read |
| helmut-fields / helmut-ui | 65 / 50 | Helmut-Tab Felder + UI |
| briefing-language | 28 | Stabschef-Sprache |
| contract-snapshot / contract-adapter | 17 / 31 | Briefing-Contract-Form (V2/V3) |
| slot-aware-read | 49 | Slot-/Tagesfrische-Read-Pfad |
| lage | 138 | Lage-Auswahl, limit/dry-run, Legacy-Fallback |
| decisions | 38 | Decision-Engine (score/decision/priority), Shadow-Runner |
| radar / radar-state / radar-ui | 38 / 102 / 18 | Radar-Kette, historische Erwähnungen, Relation-Evidenz, Leerzustand |
| goldset | 7 Fälle | Understanding-Schema-Validität, DSGVO |
| saas-foundation | 70 | Quellen-Theme-Gating (Wortgrenze), Profil-Quellenzuordnung |
| admin-overview | 104 | Admin-Kontrollzentrum |
| qa-release-stabilization | 15 | Release-Stabilisierung |
| presale-hardening | 6 | Lage-2-Karten, display_title nicht erforderlich |
| splash-boot | 29 | Splash-Watchdog-Boot |
| pwa-icon | 70 | PWA-Icons |
| watchdog-eval | 14 | **nur** GitHub-Action-Eval-Logik (Live-Antwort) |
| staff-backfill | 92 | Stabschef-Backfill |
| **Σ** | **~1382** | |

**Nicht offline lauffähig (benötigen Deployment/KI-Keys):** `smoke` (= `npm test`, Release-Gate gegen Live-Deployment), `understanding-eval`, `understanding-smoke`.
**Kein Lint/Build/TypeCheck:** dependency-freies Vanilla-Node-Projekt; äquivalente Gate = `node --check` (62/62 grün).

---

## 2. Abdeckungslücken (gegen die Auftragsanforderungen)

| Geforderter Testtyp | Status heute | Lücke |
|---|---|---|
| **Unit: Matching** | **fehlt** | `matching.js` (slug-Normalisierung, Merkmalsvektoren, Kosinus, `matched_features`) hat **keinen** direkten Unit-Test. Der in `profile-coverage.md` belegte Ausschuss-/Partei-Label-Mismatch wäre durch einen Normalisierungs-Unit-Test sofort sichtbar. |
| **Unit: Ranking** | teilweise | `decisions-test` prüft Scoring-Struktur, aber **nicht** die Schwellen-Realität (dass der Korpus max ~47 erreicht → 0 „Sofort reagieren"). |
| **Integration: Datenmotor-Jobkette** | **fehlt** | Kein Test fährt crawl→understanding→matching→decision→briefing als Kette. `goldset` validiert nur Schema. |
| **Contract: Briefing-Format** | vorhanden | contract-snapshot/adapter. **Aber:** keine **Vorgang-Karten-Render-Contract** (Lage-Karten-Felder) — Feld-Rename bräche Karten still (V3-Plan-Risiko #2). |
| **Regression: Lage & Radar** | teilweise | Logik mit Fixtures geprüft, aber **nicht** „belegte relevante Inhalte gelangen zum Nutzer". Der 200-Cap-Radar-Verlust (System A) ist **ungetestet**. |
| **Testprofile mit erwartbaren Ergebnissen** | **fehlt** | **Zentrale Lücke.** Kein Test seedet repräsentative Profile (Partei/Ebene/Region/Ausschuss) und assertet die erwartete Trichter-Ausgabe. |
| **Watchdog-Zustands-Tests** | **fehlt** | `watchdog-eval` prüft **nur** die GitHub-Action. Die `buildHealthReport`-Fehlalarm-Logik (toter `pipelineDebugReports`-Marker) + `generatedAt=now`-false-green sind **ungetestet**. |
| **Cache-Trennungs-Tests** | **fehlt** | Keine Prüfung, dass Lage-/Office-Cache pro Profil isoliert ist. |
| **Mandantentrennungs-/RLS-Tests** | **fehlt** | Kein Test für den optionalen-`userId`-IDOR (Default null → alle Tenants). Kein RLS-Policy-Test. |
| **Performance-Budgets / App-Start-Messungen** | **fehlt** | Keine Payload-/Zeit-Budgets, keine App-Start-Assertion. |
| **Fehlerpfad-Tests** | teilweise | radar/decisions testen „error → skipped". |
| **Teilbetrieb-Tests** | **fehlt** | Kein Test für „Crawl läuft, Understanding steht" (VERALTET-Zustand). |
| **Recovery-Tests** | **fehlt** | Kein Test für Erholung nach Ausfall (Watchdog-Hysterese). |

---

## 3. Empfohlene Teststrategie (für den späteren Umsetzungssprint — nicht umgesetzt)

**Prinzip (Master-Plan-Regel):** Kein Test darf nur prüfen, dass *irgendeine* Karte existiert. Jeder Test muss prüfen, dass **belegte, relevante Inhalte korrekt bis zum Nutzer gelangen** — bzw. dass ein Leerzustand **fachlich korrekt** ist (nicht technisch verursacht).

1. **Matching-Unit-Suite (`matching.js`):** Slug-Normalisierung (Ausschuss-/Partei-Varianten „Ausschuss für Arbeit und Soziales" ↔ „Arbeit und Soziales", „Linke" ↔ „die-linke"), Merkmalsvektor-Determinismus, `matched_features`-Korrektheit. **Golden-Cases** mit erwarteten Treffern. → würde die in Block 2 gefundenen Label-Mismatches als Regression fixieren.
2. **Testprofil-Fixtures mit erwarteter Trichter-Ausgabe:** 6-8 repräsentative Profile (Matrix aus `profile-coverage.md` §5), je mit einem synthetischen, aber **belegten** KO-Set und **erwarteten** Zählungen je Stufe (verfügbar→matching→ranking→lage/radar/helmut). Läuft **offline** mit injizierten Deps (wie p1/lage). → deckt „vorhandene Infos gehen verloren" auf.
3. **Datenmotor-Integrationstest (Jobkette):** crawl(fixture)→understanding(mock-AI)→matching→decision→buildV3Briefing, Assertion auf nicht-leere, korrekt gerankte Ausgabe + Idempotenz.
4. **Vorgang-Karten-Contract:** friert die Karten-Felder (`displayTitle/displaySummary/whyRelevant/recommendation/displayCategory/sources`) ein → Feld-Rename failt sichtbar.
5. **Watchdog-Zustands-Suite:** `buildHealthReport` gegen (a) frischer Crawl + toter pipelineDebug-Marker → **darf NICHT** „Pipeline aus" melden; (b) frischer Crawl + `available=false`/0 items → **muss** „veraltet" melden; INGEST/OUTPUT-Achsen (siehe `watchdog.md` §4); Recovery-Hysterese.
6. **Mandantentrennungs-/RLS-Suite:** Aufruf der V3-Reads **ohne** `userId` → **muss** leer/Fehler liefern (nicht alle Tenants); nach RLS-Einführung: anon/authenticated-PostgREST-Zugriff → deny; Cross-Tenant-Read → 0 Zeilen.
7. **Cache-Trennungs-Test:** Lage-/Office-Cache-Keys pro Profil isoliert; kein Bleed.
8. **Performance-Budget-Test:** App-Start-Payload-Größe < Budget; App-Shell-Sichtbarkeit unabhängig von Inhaltsdaten (nach Progressive-Rendering-Fix); Lage-LLM nicht im Start-Kritikpfad.
9. **Teilbetrieb-/Recovery-Tests:** „Crawl läuft, Understanding steht" → VERALTET; Erholung → GESUND erst nach 2 Zyklen.

**Aufnahme in `npm test`:** goldset + understanding-eval + lage + decisions + radar + neue Matching-/Testprofil-/Watchdog-Suiten als Kern-Gate (der V3-Plan §6 empfiehlt genau diese Umstellung).

---

## 4. Grenzen

- Die Abdeckungsbewertung basiert auf den Dateinamen/Ausgaben der Suiten + Stichproben, nicht auf zeilenweiser Lektüre jeder Assertion. **VERMUTUNG:** einzelne Suiten könnten Teilaspekte abdecken, die hier als „fehlt" markiert sind; die **strukturelle** Lücke (kein End-to-End-Profilversorgungs-Test) ist jedoch belegt (keine entsprechende Suite existiert).
- `smoke`/`understanding-*` konnten offline nicht ausgeführt werden (Live-Deployment/KI-Keys) — ihre Grün-Aussage stammt aus der Repo-Historie, nicht aus diesem Lauf.
