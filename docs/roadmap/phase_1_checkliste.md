# Phase 1 — Checkliste (operative Wahrheit)

**Letzte Prüfung:** 2026-07-27 (nur Punkt 19 aktualisiert) · **`main`:** `5475e9c` (Merge #153) ·
**Prüfer:** Sprint 19 „Politische Ebene dauerhaft speichern"; davor 2026-07-26, `9f1def5`
(Merge #130), Sprint „Vollständigkeit jedes Quellenpakets prüfen" (Punkt 13)

> **Diese Datei ist die operative Wahrheit im Repository.** Die Excel-Datei
> `Helmut_Phase_1_Checkliste.xlsx` bleibt die Management-Ansicht; bei Widerspruch gilt
> diese Datei. Nummerierung und Abnahmekriterien sind identisch mit der Excel — Punkt 25
> ist im Repository mandantenneutral formuliert (`START_HERE.md` §5.4).
>
> **Ein Punkt ist nur grün, wenn sein Abnahmekriterium vollständig und nachvollziehbar
> erfüllt ist.** Code oder Datenbankzeilen allein genügen nicht.

## Legende

| Symbol | Bedeutung |
|---|---|
| ✅ | **Erledigt** — Abnahmekriterium vollständig und belegt erfüllt |
| ⏳ | **Teilweise** — Technik vorhanden, Produktionsnachweis oder Fachtiefe fehlt |
| ☐ | **Offen** — nicht begonnen oder nicht belegt |

**Stand:** 12 ✅ · 6 ⏳ · 12 ☐ (von 30)

---

## Übersicht

| Nr | Bereich | Aufgabe | Status | Abnahmekriterium | Beleg / warum nicht grün |
|---|---|---|---|---|---|
| 1 | Architektur | Neue Quellenarchitektur produktiv vorhanden | ✅ | Publishers, Abrufwege, Pakete, Geografien und politische Entitäten sind produktiv vorhanden | Production: 64 Herausgeber · 163 Abrufwege · 7 Pakete · 50 Geografien · 73 Entitäten ([Inventur §2](../quellenarchitektur/30-paket-inventur-production.md)). Code-Seed nach den Punkt-13-Korrekturen: **58** Herausgeber · **152** Abrufwege · **154** Zuordnungen |
| 2 | Architektur | Zentralen Quellenkatalog aufgebaut | ✅ | Quellen werden zentral verwaltet und nicht nur fest im Code gepflegt | `HELMUT_SOURCE_MODE=on`; relationaler Plan ist die aktive Quellenwahrheit (`scheduler.getSourcesForProfile`), Alt-Katalog nur Fallback |
| 3 | Quellenpakete | Quellenpakete technisch eingefügt | ✅ | Alle vorgesehenen Pakete liegen im aktuellen Hauptstand | **8** Pakete im Code-Seed auf `main` (seit #118 inkl. `die-linke-berlin`/`die-linke-brandenburg`), **7** in Production (+ personenbezogenes Paket, kein Code-Seed). Die zwei neuen sind noch keine Datenbankzeilen — dafür fehlt das freigabepflichtige Seed-Einspielen. **Hinweis:** das Wohnen/Bauen-Paket existiert nur auf dem ungemergten Branch PR #117 und zählt nicht als vorhanden |
| 4 | Quellenpakete | Quellenpakete mit Abrufwegen verbunden | ✅ | Jedes Paket besitzt die vorgesehenen Paketzuordnungen | 165 `package_paths`; jedes der 7 Pakete trägt ≥1 Abrufweg; 0 verwaiste Zuordnungen, 0 Abrufwege ohne Paket ([Inventur §2](../quellenarchitektur/30-paket-inventur-production.md)) |
| 5 | Quellenpakete | Bund Basis Paket vorhanden | ✅ | Bundesweite Pflichtversorgung ist als Paket angelegt | `bund-basis` `active`, `is_base`, 54 Abrufwege, 51 liefern, letzte Lieferung 2026-07-25 |
| 6 | Quellenpakete | Berlin Basis Paket vorhanden | ⏳ | Berliner Pflichtversorgung ist als Paket angelegt | **Klassenabdeckung korrigiert (Punkt-13-Sprint): 12 von 12 neutralen Pflichtklassen besetzt** — die frühere Lücke (10/15) war ein Artefakt der Id-Namensableitung, gemessen an `covers` deckt Berlin alle 12 Klassen mit 7 Wegen ab ([Vollständigkeitsnachweis §3.1](../quellenarchitektur/31-paketvollstaendigkeit.md)). Bleibt ⏳, weil das Paket in **Production** weiterhin **nicht mandantenneutral** ist (A-3): auf `main` seit #118 behoben, in der Datenbank erst nach dem freigabepflichtigen Seed-Einspielen |
| 7 | Quellenpakete | Brandenburg Basis Paket vorhanden | ⏳ | Brandenburger Pflichtversorgung ist als Paket angelegt | **Klassenabdeckung korrigiert: 12 von 12 neutralen Pflichtklassen besetzt** (8 Wege, parldok-XML deckt 4 Klassen). Bleibt ⏳ wegen derselben Neutralitätslücke A-3 in der Datenbank. Das optionale `die-linke-brandenburg` besetzt 1 von 3 Klassen — die beiden anderen existieren in der 8. Wahlperiode **fachlich nicht** (keine Landtagsfraktion, kein MdL der Partei) und sind als solche ausgewiesen, nicht als offene Arbeit |
| 8 | Profil | Technische Profilzuordnung zu Paketen vorhanden | ✅ | Profile können Pakete nach Ebene, Region und Themen erhalten | `resolveProfilePackages` ist über `buildRelationalCrawlPlan` in den Live-Crawl verdrahtet; 147/147 Tests, inkl. der Landes-Parteipakete aus #118 ([Inventur §6](../quellenarchitektur/30-paket-inventur-production.md)) |
| 9 | Betrieb | KI Tagesdeckel gelöst | ✅ | Das frühere zu niedrige Tageslimit blockiert den Betrieb nicht mehr | Deckel 100 + Reserve 30, fail-closed, atomar (`CURRENT_STATE.md` §2). In diesem Sprint nicht erneut geprüft |
| 10 | Qualität | Grundlage für Quellenüberwachung vorhanden | ✅ | Zustand, Ertrag und Fehler können grundsätzlich überwacht werden | `source_crawl_telemetry` 10 402 Zeilen / 85 Läufe, Ertrag und Fehlercodes je Abrufweg messbar |
| 11 | Datenmotor | Gesamte Verarbeitungskette technisch gebaut | ✅ | Quelle bis Briefing ist technisch vorhanden | Crawl → `raw_documents` (8 472) → `document_findings` (4 857) → Understanding → Briefing läuft täglich |
| 12 | Profil | Automatische Paketzuweisung in Production beweisen | ✅ | Ein neues Profil erhält ohne Codeänderung automatisch alle richtigen Pakete | **Dieser Sprint.** Drei Testprofile (Bund/Berlin/Brandenburg) durch den produktiven Resolver gegen den echten Production-Katalog, rein lesend; 6 Bestandsprofile korrekt zugeordnet; 147/147 Offline-Tests ([Inventur §6](../quellenarchitektur/30-paket-inventur-production.md)). **Grenze:** die Zuweisung steuert die **globale Aktivierung** (was überhaupt gecrawlt wird), nicht die Auslieferung je Mandat — die inhaltliche Trennung ist Punkt 28 |
| 13 | Quellenpakete | Vollständigkeit jedes Pakets prüfen | ✅ | Jedes Paket ist fachlich vollständig und nicht nur technisch angelegt | **Dieser Sprint.** Alle 8 Pakete haben jetzt ein ausführbares fachliches Kriterium (Pflichtklassen + Pflicht-Herausgeberklassen + Vollzähligkeit + begründete Überschneidungen). Ergebnis: **6 vollständig, 2 teilweise vollständig, 0 blockiert**; die beiden Teilweise-Fälle sind belegt und dauerhaft abgesichert (`regional-niedersachsen`: 0 benannte Herausgeber; `die-linke-brandenburg`: 2 Klassen fachlich unmöglich). 3 Lücken behoben, 3 benannt. Ergebnis: **7 vollständig + 1 vollständig mit belegten Ausnahmen = 8 abgeschlossen**, 0 teilweise, 0 blockiert. Drei Korrekturrunden: Grundkriterium · **Ausschuss-Sollmenge** extern verankert (24 statt 23, §2a) · **Abschlusskorrektur** (§2b): `regional-niedersachsen` mit benannter, vorbereiteter Basis; „nicht anwendbar" gegen die amtliche Parlamentszusammensetzung überprüfbar; **Fraktionssollmenge** extern verankert (5 statt fälschlich 8). Keine Vollzähligkeitsregel ist mehr katalogrelativ. `bundestag-ausschuesse` 36/36 · `parlamentszusammensetzung` 65/65 · `paketvollstaendigkeit` 99/99 · Offline-Suite 150/150 ([Nachweis](../quellenarchitektur/31-paketvollstaendigkeit.md)) |
| 14 | Landtag | Berlin als laufende Versorgung aktivieren und prüfen | ⏳ | Berliner Quellen liefern regelmäßig echte und verwertbare Dokumente | **Aktivierungsreife hergestellt (2026-07-26), Production unverändert.** 10 Wege angelegt, weiterhin **0 Abrufe, 0 Dokumente**. Der Aktivierungsschritt ist zeilengenau beschrieben, generiert und in drei Stufen rückrollbar; das Landesmodul-Gate ist jetzt **je Land** freigebbar (`HELMUT_LANDESMODULE`, Default leer) und `activation_mode='manual'` ist eine echte Sperre geworden. Geplant sind **6 liefernde Wege** (8 von 12 Pflichtklassen; die 4 PARDOK-Klassen liefern strukturell nichts). **Harter Blocker V1:** `berlin-basis` trägt in Production weiterhin Partei-/Fraktions-/Personenquellen (A-3). Aktivierung bleibt **freigabepflichtig** → [`betrieb/berlin-aktivierung.md`](../betrieb/berlin-aktivierung.md) |
| 15 | Landtag | Brandenburg als laufende Versorgung aktivieren und prüfen | ⏳ | Brandenburger Quellen liefern regelmäßig echte und verwertbare Dokumente | 9 Wege angelegt, **0 Abrufe, 0 Dokumente**; wie Punkt 14 |
| 16 | Qualität | Quellenfehler vollständig automatisch erkennen | ⏳ | Leere, blockierte, langsame und fehlerhafte Quellen werden zuverlässig gemeldet | **A-6 behoben:** `source_crawl_telemetry` (13 081 Zeilen) hat einen Lesepfad; zentrale Klassifikation mit 14 Zustandsklassen + 4 Handlungsstufen, aus der echten Laufhistorie **abgeleitet** statt zweitgespeichert (keine Migration). Production read-only gegengeprüft (205 Quellen, 1 akut, 6 zeitnah, 48 beobachten; Dedup 0 Doppelmeldungen). **Offen:** 7 der 14 Klassen sind mangels realer Vorfälle nur testbelegt; `retrieval_paths.last_success_at`/`error_streak` bleiben bewusst leer. Doku: `betrieb/quellenstoerungen.md` |
| 17 | Kosten | Echte Kostenmessung im Betrieb bestätigen | ⏳ | Kosten sind pro Lauf, Tag und später pro Mandant nachvollziehbar | **Nicht grün, weil Schätzwerte kein vollständiger Production-Kostennachweis sind** (Statusbewertung im adversarialen Review von PR #136). Belegt ist eine **Untergrenze** auf **unbelegter** Preisbasis; pro Mandant sind nur die **21 %** direkt zurechenbaren Kosten abgedeckt. Grün wird der Punkt erst, wenn K-1 (~16 % Logverlust) und K-2 (Preisbeleg) geschlossen sind. **Dieser Sprint**, mit read-only Production-Messung belegt ([`betrieb/kostenmessung.md`](../betrieb/kostenmessung.md)). **Pro Lauf:** `crawl-20260726160130-7bznw` = 147 Abrufwege, 940 neue Dokumente, 8 LLM-Aufrufe, 35 080/9 017 Tokens, **0,026805 USD**. **Pro Tag:** Mittel **0,1370 USD** (7 volle Tage, Spanne 0,118–0,150). **Pro Mandant vorbereitet, nicht behauptet:** gemessen sind **79 % global** / **21 % direkt zurechenbar**; eine Verteilung der globalen Kosten wird bewusst **nicht** vorgenommen. Die Angabe im Alt-Beleg war falsch: die Tabelle `llm_usage` hat **0 Zeilen**, Kostenquelle ist der `llmUsage`-Blob. 8 Messlücken benannt (K-1…K-8), darunter **~16 % verlorene Protokolleinträge** → bekannte Kosten sind eine **Untergrenze**. `kostenmessung-test` **128/128**, `admin-overview` 104/104, Offline-Suite 153/153. Der Review fand 4 Code-Defekte im PR selbst (Laufkennung fehlte im Understanding-Cron · Diagnoseaufruf verbrauchte Budget-Kopfraum · Diagnose als Mandanten-Messlücke geführt · Doppelzählung bei überlappenden Laufzeitfenstern) — alle behoben und mutationsgeprüft |
| 18 | Inventur | Production Inventur aller Pakete erstellen | ✅ | Pro Paket sind Wege, Aktivierung, Ertrag, letzte Lieferung und Fehler dokumentiert | **Dieser Sprint:** [`30-paket-inventur-production.md`](../quellenarchitektur/30-paket-inventur-production.md), 16 Merkmale je Paket, reproduzierbare SQL-Abfragen |
| 19 | Daten | Politische Ebene vollständig speichern | ⏳ | Alle relevanten Wissensobjekte sind korrekt als Bund, Berlin, Brandenburg, Europa oder Kommune klassifiziert | **Sprint 19 (2026-07-27): Speicherung dauerhaft, Vollständigkeit noch nicht erreicht.** Die Ebene wird nach der ersten erfolgreichen Ermittlung **wiederverwendet** statt bei jeder Aktualisierung neu berechnet, kann **nie** auf `unknown` zurückfallen und ändert sich höchstens einmal (`ebenen-gedaechtnis.js`, ARCHITECTURE §7b). Keine Migration, keine KI. **Read-only in Production gemessen (2026-07-27):** 1 193 Wissensobjekte, davon **719 verstanden**; **642 mit ermittelter Ebene** (bund 451 · international 66 · land 60 · eu 37 · kommune 28), **78 `unknown`**, 473 noch nicht verstanden (`pending`/`failed`, ohne Analyse). **Grün wird der Punkt erst**, wenn die 78 unbestimmten verstandenen Vorgänge eine belegte Ebene tragen — dafür fehlt eine fachliche Entscheidung (Nachklassifikation ist Punkt 21). Die Abdeckungskennzahl meldet seither die **ermittelte** Ebene (53,8 %) statt der bloß gefüllten Spalte (60,3 %) — vorher strukturell falsches Grün |
| 20 | Daten | Geografische Zuordnung vollständig speichern | ☐ | Alle relevanten Inhalte besitzen die richtige Region | nicht Gegenstand dieses Sprints |
| 21 | Daten | Alten Datenbestand nachklassifizieren | ☐ | Bestehende Datensätze sind mit Ebene, Geografie, Fachgebiet und Entitäten ergänzt | nicht Gegenstand dieses Sprints |
| 22 | Daten | Embeddings vollständig speichern und prüfen | ☐ | Relevante Wissensobjekte besitzen dauerhafte Embeddings | nicht Gegenstand dieses Sprints |
| 23 | Matching | Matching-Ergebnisse dauerhaft nachvollziehbar machen | ☐ | Es ist nachvollziehbar, warum ein Vorgang zu einem Profil passt | nicht Gegenstand dieses Sprints |
| 24 | Landtag | Landtags-Parser für Berlin und Brandenburg prüfen | ☐ | Drucksachen, Anfragen, Sitzungen und Vorgänge werden korrekt getrennt | PARDOK-Dispatch steht auf `shadow`; die 2 `structured_download`-Wege (`be-plenum`, `bb-plenum`) laufen nie |
| 25 | Tests | Ende-zu-Ende-Test für den Pilotmandanten durchführen | ☐ | Der Pilotmandant erhält passende Bundespolitik bis ins fertige Briefing | nicht Gegenstand dieses Sprints (Excel-Wortlaut nennt den Klarnamen; im Repository mandantenneutral) |
| 26 | Tests | Ende-zu-Ende-Test für Berliner Profil durchführen | ☐ | Das Berliner Profil erhält überwiegend passende Berliner Landespolitik | blockiert durch Punkt 14 — es existiert kein Landtagsprofil und keine Berliner Lieferung |
| 27 | Tests | Ende-zu-Ende-Test für Brandenburger Profil durchführen | ☐ | Das Brandenburger Profil erhält überwiegend passende Brandenburger Landespolitik | blockiert durch Punkt 15 |
| 28 | Tests | Inhaltliche Trennung Bund, Berlin und Brandenburg beweisen | ☐ | Die drei Profile erhalten nachweisbar unterschiedliche und passende Inhalte | blockiert durch Punkte 14/15. Zusätzlich offen: im Modus `on` crawlen alle Mandate **eine** gemeinsame Vereinigungsmenge; die Trennung entsteht erst im Matching und ist nicht belegt |
| 29 | Betrieb | Fehlerpfade und Wiederholungen prüfen | ☐ | Timeouts, Limits, fehlerhafte Inhalte und Wiederholungen funktionieren kontrolliert | offen; Befund A-7 (Doppelläufe mit `circuit-open`) gehört hierher und zu OP-15 |
| 30 | Abnahme | Phase 1 offiziell abnehmen | ☐ | Der gesamte Datenmotor arbeitet automatisch, stabil und ohne manuelle Eingriffe | erst nach 1–29 |

---

## Abweichungen zur Excel-Datei

| Nr | Excel | Repository | Begründung |
|---|---|---|---|
| 6 | ✅ Erledigt | ⏳ Teilweise | Klassenabdeckung ist erfüllt (12/12), aber `berlin-basis` enthält **in Production** weiterhin Partei-/Fraktions-/Personenquellen in einem verpflichtenden Basispaket (A-3). „Pflichtversorgung angelegt" ist damit in der Datenbank nicht erfüllt |
| 7 | ✅ Erledigt | ⏳ Teilweise | wie 6: 12/12 Klassen, aber dieselbe Neutralitätslücke in der Datenbank |
| 12 | ⏳ Teilweise | ✅ Erledigt | gegen den echten Production-Katalog belegt, inkl. 147 automatisierter Prüfungen |
| 13 | ⏳ Teilweise | ✅ Erledigt | fachliches Kriterium je Paket ist jetzt ausführbar und grün; die zwei nicht vollständigen Pakete sind belegt, begründet und testgesichert |
| 18 | ☐ Offen | ✅ Erledigt | Inventur in diesem Sprint erstellt |
| 25 | Klarname | „Pilotmandant" | Mandantenneutralität (`START_HERE.md` §5.4) — inhaltlich identisch |

## Offene Punkte, die aus dieser Prüfung entstanden sind

Vollständig beschrieben in [`../quellenarchitektur/30-paket-inventur-production.md`](../quellenarchitektur/30-paket-inventur-production.md) §7.

- **A-1** Production führt 8 Profile (6 aktiv), nicht 1 Pilot + 2 Demo-Mandate → verschärft **OP-04**.
- **A-3** Die Landes-Basispakete sind **in Production** nicht mandantenneutral → auf `main` seit #118 behoben, in der Datenbank erst nach dem freigabepflichtigen Seed-Einspielen (Punkte 6/7/14/15).
- **A-4** 2 der 5 `always_on`-Kernwege sind in der Datenbank weiterhin defekt → Ersatz-URLs sind auf `main`, wirksam erst mit dem Seed.
- **A-5** Das personenbezogene Katalogpaket des Piloten liefert dauerhaft nichts.
- **A-6** *behoben (Punkt 16, 2026-07-26):* Die Pfad-Statusmaschine schreibt weiterhin nicht zurück — der Zustand je Quelle wird stattdessen aus `source_crawl_telemetry` **abgeleitet** (führende Quelle). Ein Rückschreiben wäre ein Production-Write je Crawl und eine redundante Zweitspeicherung; es bleibt bewusst unterlassen. `retrieval_paths.last_success_at`/`last_error`/`error_streak` sind damit weiter leer, die Admin-Ansicht unterscheidet jetzt aber ausdrücklich **konfigurierten** von **beobachtetem** Status.

Aus der Kostenmessung (Punkt 17, vollständig in [`../betrieb/kostenmessung.md`](../betrieb/kostenmessung.md) §4):

- **K-1** Der Kostenlog verliert unter Parallelität Einträge (Reservierungszähler an allen 12 gemessenen Tagen höher, Σ 740 vs. 620 ≈ **16 %**). Bekannte Kosten sind eine **Untergrenze**. Größter offener Hebel; die leere Tabelle `llm_usage` wäre der Zielspeicher.
- **K-2** Die Preisbasis ist ein **unbelegter Schätzwert** im Code. Schließbar ohne Codeänderung über `HELMUT_LLM_PRICE_SOURCE`.
- **K-6** Supabase, Vercel, Crawl-Volumen, Push und DIP sind **vollständig ungemessen und ungedeckelt** — offene Kostenexposition.
- **A-7** Doppelte Cron-Läufe mit `circuit-open` verzerren jede Telemetrie-Auswertung → **OP-15**.

Aus der Vollständigkeitsprüfung (Punkt 13, vollständig in
[`../quellenarchitektur/31-paketvollstaendigkeit.md`](../quellenarchitektur/31-paketvollstaendigkeit.md) §5):

- **V-1** *behoben (→ V-10):* `regional-niedersachsen` hatte **0 benannte regionale Herausgeber** (nur Google-News-Themensuchen) und war thematisch gebunden, obwohl es nach Region zugewiesen wird. Die vorgeschlagene Schwellenanhebung (≈ 20 zusätzliche Abrufe je Crawl) ist **entfallen**.
- **V-2** *behoben (→ V-11):* `die-linke-brandenburg` kann 2 von 3 Pflichtklassen fachlich nicht besetzen (8. Wahlperiode ohne Landtagsfraktion/MdL). Zunächst nur als Fließtext ausgewiesen, jetzt als überprüfbare Ausnahme modelliert.
- **V-3** *behoben:* das neutrale Pflicht-Basispaket enthielt nur 22 der 23 ständigen Ausschüsse; genau der Ausschuss des Pilotmandats fehlte.
- **V-4** *behoben:* jede regionale Quelle landete im Niedersachsen-Paket (mit `HELMUT_SOURCE_CURATION=off` 30 fremde Regionen).
- **V-6** Die Pflichtklassenanzeige im Admin zeigt weiterhin `present: 0`, weil sie auf `buildFullModel()` arbeitet → **OP-23**.
- **V-7** *behoben:* der Katalog führte **23 statt 24** ständige Bundestagsausschüsse und neun Bezeichnungen der 20. Wahlperiode. Ursache: die Ausschussliste war eine handgepflegte Politikfeld-Auswahl, und die Vollzähligkeitsregel leitete ihre Sollmenge aus demselben Katalog ab. Jetzt extern verankert in `seeds/bundestag-ausschuesse.js` (Drucksache 21/150).
- **V-8** *behoben:* der gezielte Seed-Restore deckte neu angelegte Abrufwege und Herausgeber nicht ab und hätte sie stehen gelassen. Beide werden jetzt *guarded* zurückgedreht.
- **V-9** *behoben:* die **Fraktionsvollzähligkeit** war ebenfalls katalogrelativ und fachlich falsch — gemessen wurde „8 von 8", richtig sind **5**: FDP (4,3 %) und BSW (4,97 %) sind im 21. Bundestag nicht vertreten, der SSW hat mit einem Mandat keinen Fraktionsstatus. Neue Sollmenge `seeds/parlamentszusammensetzung.js` (amtliche Sitzverteilung, 630 Sitze). Keine Quelle entfernt, keine Crawl-Änderung.
- **V-10** *behoben:* `regional-niedersachsen` hat eine **benannte** Basis (Landtag Niedersachsen, Landesregierung, HAZ, NDR, Braunschweiger Zeitung, Salzgitter Zeitung, regionalHeute) — **vorbereitet und inaktiv**, 0 zusätzliche Abrufe. 5 der 7 Wege sind Bestandsquellen.
- **V-11** *behoben:* „fachlich nicht anwendbar" war bloßer Freitext. Jede Ausnahme trägt jetzt stabile Kennung, politische Begründung, Wahlperiode, amtlichen Beleg und eine gegen die kanonische Parlamentszusammensetzung geprüfte Voraussetzung.
- **V-12** *behoben:* die Ausschuss-Sollmenge hatte mit **24** die richtige Anzahl und trotzdem **2 falsche amtliche Bezeichnungen** sowie eine falsche Reihenfolge der Positionen 20–24. Nr. 4 hieß „Ausschuss für Inneres und Heimat" (Bezeichnung der **20.** WP; amtlich 21. WP: **„Innenausschuss"**), Nr. 15 „Ausschuss für Verkehr" (**nie** amtlich; amtlich: **„Verkehrsausschuss"**). Belegt über die kanonischen Ausschussseiten der 21. WP und die amtlichen Beschlussseiten. Die Sollmenge trägt jetzt zusätzlich die **amtliche Ausschussnummer** (geprüft, nicht behauptet); kein aktueller Ausschuss darf mit einer Webarchiv-Seite einer älteren Wahlperiode belegt werden. **Lehre:** die richtige Anzahl beweist nicht die richtige Struktur.
- **Offen extern (einzige Restprüfung der Ausschussstruktur):** die Sollmenge einmal direkt gegen den **Volltext** der Drucksache 21/150 abgleichen — `bundestag.de`/`dserver.bundestag.de` sind aus der Agentensitzung nicht erreichbar (`403`). Anzahl, alle 24 Bezeichnungen, Schreibweise und Ausschussnummerierung sind gegen die amtlichen Beschlussseiten, die kanonischen Ausschussseiten und die Ausschuss-Tagesordnungen der 21. WP abgeglichen (`31-paketvollstaendigkeit.md` §2c).
- **Offen, außerhalb von Punkt 13:** `seeds/entities.js` führt die Ausschüsse ein zweites Mal als 23 `political_entities` mit teils Bezeichnungen der 20. WP. Betrifft die Radar-/Matching-Schicht, nicht das Paketmodell → eigener Sprint.
- **Offen freigabepflichtig:** Aktivierung der benannten Niedersachsen-Basis (dann +7 Abrufe je Crawl) und Nachziehen der amtlichen Namen in die Datenbank (`on-conflict` aktualisiert `name` nicht).

## Nächster sinnvoller Schritt

**Freigabe für das Einspielen der beiden Seeds** (`20260713` Bund, `20260717` Landesmodul).
Seit den Punkt-13-Sprints trägt Seed `20260713` zusätzlich die `required_classes` der vier
Bundespakete, **+9** Paketzuordnungen, **+8** Abrufwege und **+7** Herausgeber. Soll-Zahlen im Seed
damit **152** Abrufwege, **154** Zuordnungen, **58** Herausgeber. **Laufzeitwirkung: genau +1 Abruf
je Crawl** (der 24. ständige Ausschuss) — die 7 benannten Niedersachsen-Wege sind `paused` und
werden nicht abgerufen ([Nachweis §7](../quellenarchitektur/31-paketvollstaendigkeit.md)).
PR #118 ist gemergt (`61767a9`) und hat A-3 und A-4 **im Code** behoben — in der
Production-Datenbank sind beide Befunde aber weiterhin wirksam, weil Seeds nicht automatisch
eingespielt werden. Ohne diesen Schritt wäre jede Berlin-/Brandenburg-Aktivierung eine
Aktivierung nicht-neutraler Pflichtpakete, und die Punkte 6, 7, 14 und 15 können nicht grün
werden. **Production-Datenänderung, freigabepflichtig** — in diesem Sprint bewusst nicht getan.
