# Profilversorgung & Matching — Helmut

**Sprint:** SaaS-Readiness-Audit · **Phase 3** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend. Keine Production-Writes, keine Migration, kein Merge, keine Fixes.

> **Kernbefund:** Helmut ist heute **de facto ein Single-Tenant-Pilot** (`<pilot-mandats-id>`) — und selbst dieser wird **technisch dünn** versorgt. Der Rechenkern (`matching.js`/`decisions.js`) ist sauber profilgetrieben und **frei von Single-Tenant-Bias**. Der Versorgungsverlust entsteht **nicht** in der Engine, sondern (a) an **leeren Profildaten**, (b) an **nicht angereicherten Knowledge Objects** (keine `tags`/`policy_field`/`embedding`) und (c) an **fehlender Label-Normalisierung** (Ausschuss/Partei). Ergebnis: **0 „Sofort reagieren"-Karten** im gesamten Prod-Bestand.

---

## 1. Methodik

- **Code-Verifikation:** `lib/helmut/matching.js`, `decisions.js`, `config.js`, `accounts.js`, `scheduler.js`, `lage.js`, `storage.js` gelesen und die Scoring-/Feature-Logik zeilenweise geprüft.
- **DB-Verifikation (read-only):** SELECT-Abfragen gegen Prod-Supabase `ddckuvvpcytqbyfmbvie` (`profiles`, `knowledge_objects`, `decisions`, `matching_results`, `profile_embeddings`). Alle Zahlen unten sind gemessen, nicht geschätzt.
- **Tests:** `decisions-test.js` 38/38, `lage-test.js` 138/138, `goldset-test.js` 7/7, `radar-*` grün (Belege §8).
- **Datenstand:** 2026-07-12, `knowledge_objects=217` (162 complete, 55 pending), `decisions=52`, `profiles=3`.
- **Grenze der Analyse:** Es existiert in Prod nur **ein** substanziell konfiguriertes Profil. Aussagen zu anderen Parteien/Ebenen/Regionen sind daher **strukturell aus Code + Korpus abgeleitet**, nicht an echten befüllten Fremdprofilen gemessen (siehe §7, offene Unsicherheiten).

---

## 2. Die produktive Matching-Kette (verifiziert)

Drei Artefakte, **ein** produktiver Pfad:

| Pfad | Ort | Status |
|---|---|---|
| **In-Memory-Ranker** `matchProfileToKnowledgeObjects` | matching.js:214 | **PRODUKTIV** — genutzt von `decideForUser` (decisions.js:132) und `buildLageBriefing` (lage.js:305) |
| 256-dim deterministische Merkmalsvektoren (`embed`) | matching.js:86/160/164 | intern im Ranker (on-the-fly, `toVector(ko.embedding) \|\| embedKnowledgeObject(ko)`) |
| pgvector-RPC `match_knowledge_objects` via `runMatchingShadow` | matching.js:260, storage.js:806 | **TOT** — Flag `HELMUT_V3_MATCHING` aus **und** kein KO hat ein Embedding |

**Scoring (decisions.js:37-84, verifiziert):**
`FEATURE_WEIGHTS = {ausschuss:34, partei:22, wahlkreis:20, thema:12}` + `Similarity·24` + Boni (Urgency 8, Evidence 4, Confidence 4). Schwelle: **≥60 „Sofort reagieren", ≥40 „Beobachten", sonst „Ignorieren"** (decisions.js:84).

**Wichtige Präzisierung:** Der theoretische Höchstwert ist ~100 (nicht 47). Der ~47-Deckel ist **empirisch** — er entsteht, weil der Korpus pro Vorgang fast nur `partei` (22) liefert und Similarity mangels KO-Embedding-Merkmalen niedrig bleibt. **Das ist ein Datenproblem, kein Formelproblem.**

**Bias-Prüfung:** Kein hartkodierter Pilot-Name, kein „arbeit soziales"-Sonderscore, kein committee-92 im Rechenkern (decisions.js/matching.js). Der Bias sitzt eine Ebene höher: das Code-Vollprofil des Pilotmandanten (config.js:7, 130 Zeilen) ist in `server.js`/`scheduler.js` ~30× als Default-`politicianId` verdrahtet; nur `<pilot-mandats-id>` erhält im Nicht-Auth-Modus dieses reiche Profil (scheduler.js:1294), jedes andere Mandat bekommt `neutralProfileDefaults` (leere committees/topics/regions, scheduler.js:1311).

---

## 3. Profil-Konfiguration (verifiziert)

**Reiche Profildaten leben nur im Code** (Code-Vollprofil des Pilotmandanten, config.js:7-139). Die DB-Tabelle `profiles` (3 Zeilen) hat **alle inhaltlichen Felder NULL**:

| id | party | committee | focustopics | embedding |
|---|---|---|---|---|
| `<pilot-mandats-id>` | NULL | NULL | NULL | NULL |
| `<demo-mandant-b>` | NULL | NULL | NULL | NULL |
| `<demo-mandant-c>` | NULL | NULL | NULL | NULL |

- **Zwei getrennte Profilspeicher:** Produktiv liest `storage.getProfile` aus `readStore().profiles[id]` (JSON-Blob), **nicht** aus der SQL-`profiles`-Tabelle (storage.js:1902). Die SQL-Tabelle + `embedding`-Spalte (RPC-Ziel) sind praktisch **ungenutzt**.
- `<demo-mandant-b>`/`<demo-mandant-c>` sind **leere Platzhalter** (0 decisions, 0 embedding).
- `profile_embeddings`: **1 Zeile** (nur `<pilot-mandats-id>`, dim=256).

---

## 4. Versorgungskette pro Profil (gemessen)

### 4.1 `<pilot-mandats-id>` (das einzige reale Profil)

| Stufe | Menge | Beleg |
|---|---|---|
| 1. technisch verfügbare KOs | **217** | `count(*)` |
| 1a. verstanden/matchbar (`understanding_status=complete`, nicht pending) | **162** | decisions.js:130, lage.js:287 |
| 2. erreichen Matching (Load-Cap 200) | **200** geladen, davon 149 complete im Fenster | storage.js:742 `order=updated_at.desc limit 200` |
| 3. bestehen Matching (≥1 matched_feature ODER sim≥0) | **~alle** (bei similarity=0 nimmt der Ranker alles auf); harte Identitätstreffer aber selten | matching.js:216/231 |
| 4. erreichen Ranking (Scoring) | **52 decisions gespeichert** | DB |
| 5. bestehen Ranking (≥40) | **1** („Beobachten", score 47); **0** „Sofort reagieren"; **51** „Ignorieren" | DB (min 9 / max 47 / avg 18,3) |
| 6. im finalen Briefing/Lage | **10 Karten** (Lage-Fallback „neueste verstandene" greift, weil Ranking fast nichts liefert) | lage.js:312 |
| 7. über API/Cache ausgeliefert | 10, sofern Lage-Cache warm ist; **12s-Timeout** kann bei kaltem Cache alles nullen | server.js:295 (Detail: `lage.md`/`app-start-performance.md`) |

**matched_features über alle 52 decisions (gemessen):** `partei=8, ausschuss=1, wahlkreis=1, thema=0`. → Insgesamt feuern nur **10** Identitätstreffer; die Themen-Dimension **nie**.

**Ursachenkette (belegt):**
1. **Themen-Dimension tot:** KO-`topics` speist sich aus `tags`+`policy_field` (matching.js:128) — **`tags` bei allen 217 KOs leer, `embedding` bei allen 217 NULL** (gemessen). Der thema-Treffer (12 P.) feuert nie; der Kosinus verliert alle Themen-Tokens. Die 16 focusTopics des Pilotprofils matchen ins Leere.
2. **Ausschuss-Dimension quasi tot (Label-Mismatch):** Profil `committee="Arbeit und Soziales"` → slug `arbeit-und-soziales`. KO-Ausschüsse heißen „Ausschuss für Arbeit und Soziales"/„Sozialausschuss" → **kein Slug-Overlap**. Nur **1** KO erzielt den ausschuss-Treffer.
3. **Region-Dimension quasi tot:** Nur **1** KO trifft Wahlkreis/Region.
4. **Partei-Normalisierung:** „Die Linke"/„DIE LINKE" matchen (→die-linke), aber „Linke" (ohne Artikel) fällt raus.
5. **Score-Deckelung durch dünnen Korpus:** Für ≥60 braucht es i. d. R. ≥2 feuernde Dimensionen. Da zuverlässig nur `partei` (22) feuert, bleibt der reale Score-Deckel ≈47 → **0 „Sofort reagieren"**.

### 4.2 `<demo-mandant-b>` / `<demo-mandant-c>` (leere Platzhalter)

Profil leer → `profileFeatures` leer → Nullvektor → `cosineSimilarity=0` für jedes KO → 0 matched_features. Der Ranker nimmt bei similarity=0 **alle** KOs mit Score 0 auf; Tiebreak = `id.localeCompare` (matching.js:239-243) → **alphabetische ID-Sortierung**, Slice 12. **Ergebnis identisch für alle 3 Profile** (dieselben ~10 Karten, weder nach Relevanz noch Aktualität). **Null Personalisierung.**

---

## 5. Repräsentative Testprofilmatrix (Konzept)

**Bestehende Mechanismen (verifiziert):** `HELMUT_LAGE_DEMO=1` → `demoLageBriefing` (statische 2 Karten Tariftreue/Pflege, reine Design-Vorschau, **nicht** datengetrieben); Test-ids `test-mdb`/`p1-test-mdb`; reguläre Anlage über `accounts.createUser` + `storage.saveProfile`; `neutralProfileDefaults`.

**Empfehlung (KEINE Prod-Fake-User):** Testprofile in **separater, nicht-produktiver Umgebung** (lokaler Store oder Test-Supabase-Branch) über `saveProfile` mit vollständigen Profil-Objekten (Form wie das Code-Vollprofil des Pilotmandanten) seeden; Prod (`ddckuvvpcytqbyfmbvie`) unberührt. **Voraussetzung für Aussagekraft:** die KO-Anreicherung (tags/policy_field/Ausschuss-Normalisierung) muss zuerst adressiert werden, sonst matchen auch Testprofile ins Leere.

| # | Testprofil | Partei | Reg/Opp | Ebene | Region | Ausschuss/Fach | Erwähnungen | Historie | deckt ab |
|---|---|---|---|---|---|---|---|---|---|
| T1 | Regierungs-MdB Gesundheit | SPD | Regierung | Bundestag | Großstadt (Berlin) | Gesundheit | viele | ja | Best-Case, dichtes Feld |
| T2 | Oppositions-MdB Finanzen | CDU/CSU | Opposition | Bundestag | Großstadt | Finanzen | viele | ja | Opp. + starke Partei |
| T3 | Pilot-Klon Arbeit/Soziales | Partei des Pilotmandanten | Opposition | Bundestag | ländlich (Wahlkreis des Pilotmandanten) | Arbeit & Soziales | mittel | ja | Pilot-Klon, Label-Mismatch |
| T4 | Landtags-MdL | Grüne | Regierung | **Landtag** | Bundesland | Umwelt | wenige | ja | Landtag-Pfad, `state`-Feld |
| T5 | Neu-MdB ohne Historie | FDP | Opposition | Bundestag | Großstadt | Wirtschaft/Energie | keine | **nein** | Cold-Start (0 decisions) |
| T6 | Regional/lokal fokussiert | SPD | — | Bundestag | ländlich (Osterode) | — | fast keine | ja | Region-Only-Matching |
| T7 | Leeres/unvollständiges Profil | — | — | — | — | — | — | nein | `profileCompleteness`=empty |
| T8 | AfD-MdB Verteidigung | AfD | Opposition | Bundestag | — | Verteidigung | wenige | ja | dünnes Ausschuss-/Parteifeld |

Diese Matrix erfüllt die geforderte Abdeckung: mehrere Parteien, Regierung/Opposition, Bundestag/Landtag, Großstadt/ländlich, verschiedene Ausschüsse/Fachthemen, viele/wenige Erwähnungen, neu ohne Historie, bundes-/regional.

---

## 6. Profilversorgungsmatrix — Verlustpunkte mit Ursachenklasse

Ursachenklassen laut Auftrag: **(A)** wirklich keine Infos · **(B)** Quellenabdeckung fehlt · **(C)** Profil unvollständig/falsch · **(D)** Namensnormalisierung scheitert · **(E)** Matching verliert · **(F)** Ranking entfernt · **(G)** Zeitfenster entfernt · **(H)** Presentation/Source-Safety entfernt · **(I)** Briefing-Erstellung verliert · **(J)** Cache/API liefert nicht · **(K)** Legacy/Modern-Divergenz · **(L)** Timeout/Teiljob.

| Symptom (belegt) | Klasse | Wirkung | Beleg |
|---|---|---|---|
| KO-`tags` & `embedding` bei allen 217 leer/NULL → Themen-Match & pgvector unmöglich | **E** (+B upstream) | thema-Treffer feuert nie; Similarity niedrig; `matching_results=0` | gemessen; matching.js:128, storage.js:806 |
| Ausschuss-Labels nicht normalisiert (`Ausschuss für Arbeit und Soziales` ≠ `Arbeit und Soziales`) | **D** | ausschuss-Treffer (34 P.) feuert nur 1× | matching.js:32/183 |
| Parteivarianten (`Linke` ≠ `die-linke`) | **D** | 3 Linke-KOs verloren | matching.js:32 |
| Score braucht ≥2 Dimensionen für ≥60, Korpus liefert nur Partei → real max 47 | **F** (Folge von D/E) | **0 „Sofort reagieren"** je erzeugt | decisions.js:39; DB max 47 |
| Lage-Fallback auf „neueste verstandene", wenn Ranking leer | **I** | Personalisierung verschwindet, generische Karten | lage.js:312 |
| `matching_results` nie befüllt → Lage nutzt nie Stufe-1-Matches | **J/E** | persistente Matching-Schicht wirkungslos | DB `matching_results=0`; lage.js:296 |
| Reiche Profildaten nur in `config.js`, DB-`profiles` leer | **C** | nur `<pilot-mandats-id>` (Code) versorgt | config.js:7; DB |
| Alle Mandate außer `<pilot-mandats-id>` erhalten `neutralProfileDefaults` (leere Merkmale) | **C** | jedes echte Mandat startet ohne Fachmerkmale | scheduler.js:1294/1311 |
| Load-Cap 200 < 217 KOs | **G** (strukturell) | 13 complete-KOs für Lage unerreichbar | storage.js:746; gemessen rn>200=17/13 complete |
| 106/162 complete-KOs ohne vollständige Presentation-Felder (Backfill nie gelaufen) | **H/K** | schwächere Darstellung + Nachordnung (kein harter Verlust) | gemessen; presentation-backfill.js Default Dry-Run |
| 12s-Timeout am App-Start bei kaltem Lage-Cache | **L** | komplettes Kartenset kann verschwinden | server.js:295 |

---

## 7. Fachlich korrekt vs. technisch falsch vs. dünn-aber-korrekt

**Technisch falsche Leerzustände (Informationen vorhanden, gehen verloren):**
1. **Themen-/Ausschuss-/Region-Match liefert fast nichts, obwohl der Korpus die Vorgänge enthält** — Ursache: fehlende KO-Anreicherung (D/E), nicht fehlende Information. → **die 0 „Sofort reagieren" sind ein technisch falscher Leerzustand.**
2. **Alle 3 Profile sehen dieselben ~10 alphabetisch sortierten Karten** — Personalisierung technisch inert (leere Profile + toter matching_results-Pfad).
3. **13 complete-KOs jenseits des 200-Load-Caps** sind für die Lage strukturell unerreichbar.

**Fachlich korrekte Leerzustände:**
- `<demo-mandant-b>`/`<demo-mandant-c>` haben **kein** konfiguriertes Mandat → dass sie nichts Personalisiertes bekommen, ist korrekt (Profil ist leer, Klasse C, kein Datenverlust).
- pending-KOs (55) erscheinen nicht — korrekt (noch nicht verstanden).
- Quellenlose KOs werden aus der Lage entfernt — korrekt (Provenienzpflicht).

**Dünn, aber korrekt:** der Pilotmandant erhält **10 belegte Karten** — nicht leer, aber ohne echte Priorisierung. Die Kartenzahl ist ausreichend; der Mangel ist **Relevanz-/Personalisierungsqualität**, nicht Menge.

**Risiko für neue Profile ohne Historie (T5-Typ):** Cold-Start liefert **0 decisions** → reiner Lage-Fallback (neueste verstandene, unpersonalisiert). Solange KO-Anreicherung + Label-Normalisierung fehlen, ist ein neues Profil **von Tag 1 an technisch unterversorgt**, selbst wenn passende Vorgänge existieren.

---

## 8. Unterversorgte Parteien/Regionen/Ausschüsse/Themen

- **Alle außer Die Linke / Arbeit & Soziales** sind matching-seitig unterversorgt, weil (a) KO-Themen-Tags fehlen und (b) die Fachquellen-Tiefe am `SOCIAL_THEME_TERMS`-Gate hängt (siehe `source-coverage.md`).
- **Landtage/Landesregierungen:** keine Crawl-Quelle → Landtags-Profile (T4) technisch nicht versorgbar.
- **Regionen/Wahlkreise:** nur 21 local-Docs, Region-Match feuert 1× → regional geprägte Profile (T6) unterversorgt.

---

## 9. Tests, Belege, Grenzen

**Ausgeführte Tests (offline, grün):** `decisions-test.js` 38/38 · `lage-test.js` 138/138 · `goldset-test.js` 7/7 · `radar-test.js` 38/38 · `radar-state-test.js` 102/102 · `radar-ui-test.js` 18/18.
**Abfragegrundlage:** Prod-Supabase `ddckuvvpcytqbyfmbvie`, nur SELECT. Verwendete Profile: `<pilot-mandats-id>` (real), `<demo-mandant-b>`/`<demo-mandant-c>` (leer). Datenstand 2026-07-12.

**Bekannte Grenzen / offene Unsicherheiten:**
- **VERMUTUNG:** `HELMUT_V3_MATCHING`/`HELMUT_UNDERSTANDING_LOCK` sind in Prod AUS (konsistent mit `matching_results=0`), nicht via ENV verifizierbar (read-only).
- **VERMUTUNG:** Ob ein *vollständig befülltes* Fremdprofil bei angereichertem Korpus tatsächlich ≥60-Karten erzeugt, ist mangels befüllter Fremdprofile in Prod nicht direkt gemessen — die Analyse ist aus Formel + Korpus abgeleitet. Ein isolierter Testlauf (Phase QA) sollte das bestätigen.
- Der genaue Grund, warum `tags`/`policy_field` durch die Understanding-Engine **nicht** befüllt werden, wurde codeseitig nicht abschließend lokalisiert (understanding-schema definiert die Felder; ob die Prompt-Extraktion sie liefert oder der Save sie droppt, ist in Block 2 offen geblieben) → **Prüfpunkt für Block 3/Fix-Plan.**

---

## 10. Priorisierte Ursachen (Profilversorgung)

1. **P1 — KO-Anreicherung fehlt** (`tags`/`policy_field`/`embedding` leer) → Themen-/Ausschuss-/Similarity-Matching tot. **Größter Hebel.** — **ROOT CAUSE LOKALISIERT + TEILWEISE BEHOBEN OHNE BACKFILL** (2026-07-12): `understanding.js` extrahiert `tags`/`policy_field` **überhaupt nicht**. **Sichere Teillösung live:** der Matcher leitet das Politikfeld jetzt **read-time deterministisch aus den belegten Ausschuss-Feldern** ab (`matching.js` `derivePolicyFields`), solange tags/policy_field leer sind — kein KI, kein DB-Write, wirkt sofort auf den ganzen Bestand (Themen-Treffer vorher 0 → nachher ≥1, `ko-anreicherung-test.js` 18/18). **Offen (Backfill/KI, gestoppt):** feine Themen-Tags aus Volltext — Freigabevorlage in `docs/ko-anreicherung-analyse.md` (Umfang 162 KOs, ~0,50–1,50 €, idempotent rückrollbar).
2. **P1 — Label-Normalisierung** (Ausschuss/Partei-Varianten) → harte Identitätstreffer gehen verloren. — ✅ **BEHOBEN** (2026-07-12): `normalizeCommittee`/`normalizeParty` in `matching.js` (beidseitig Profil+KO, vor slug). „Ausschuss für Arbeit und Soziales" == „Arbeit und Soziales" == „Sozialausschuss"; „Linke" == „Die Linke"; „Bündnis 90/Die Grünen" == „Grüne". **Wirkt sofort auf den Bestand** (keine Anreicherung/Backfill nötig) und schaltet die 34-P.-Ausschuss- + 22-P.-Partei-Dimension frei. Tests: `scripts/matching-normalization-test.js` 20/20 (inkl. Mehr-Profil-Ranking, Personalisierung, keine Fehl-Zuordnung).
3. **P1 — Presentation-Backfill nie gelaufen** (106/162 KOs) → Darstellungsverlust.
4. **P2 — Profildaten nur im Code für 1 Person** → DB-`profiles` befüllen, `neutralProfileDefaults`-Problem lösen, damit Mehr-Mandanten-Versorgung überhaupt möglich wird.
5. **P2 — 200-Load-Cap < Bestand** → wächst mit dem Korpus.
6. **P2 — `matching_results` toter Pfad / 12s-Timeout** (Detail in `lage.md`).
