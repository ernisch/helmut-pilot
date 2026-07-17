# Landtag Readiness Report — Megasprint Landtagsfähigkeit Berlin & Brandenburg

**Stand:** 2026-07-17 · **Branch:** `claude/helmut-landtag-architecture-tqu3qt` (Basis `dab04a9` = main)
**Grundlage:** Datenmotor-Audit §12 (2026-07-16) + Umsetzungsplan P2 · Phase-1-Verifikation: `docs/landtag/00-sprint-verifikation.md`

**Sprint-Verbote eingehalten:** kein Merge, kein Deployment, keine Migration, keine Production-Writes (nur SELECT), keine Änderung an laufenden Crawlern/Cron-Jobs/Locks/Telemetrie/`helmut-flags.json`, keine Aktivierung von Berlin oder Brandenburg, laufender Bundestag-Beobachtungssprint unberührt.

---

## 1. Landtag-Readiness-Ampel

| Baustein | Ampel | Begründung |
|---|---|---|
| Kernarchitektur ohne Bundestag-Annahmen | 🟢 | Parlaments-Registry (`parlamente.js`) trägt Persona/Funktion/Regierungsbegriffe/Primärquelle/Ebenen-Defaults je Parlament; Bundestag byte-identisch (testerzwungen) |
| Landesmodul-Gate parametrisiert (P2-1) | 🟢 | `HELMUT_LANDESMODULE` je Bundesland; Default LEER = Vollausschluss wie bisher; fail-closed |
| PARDOK: Parser BE + BB, Dispatcher, Tests (P2-2) | 🟢 | Live-Modus gebaut, doppelt gegated (Flag `live` UND Landesfreigabe), Default aus; Shadow abgeschlossen (`02-pardok-integration.md`) |
| Ebenen-Default entkoppelt (P2-3) | 🟢 | Kein auto-`Bund` mehr für erkannte Landtagsprofile (scheduler + server); unbekannte Ebene → Bund (unverändert) |
| Landes-Relevanz/Scoring konfigurierbar (P2-5/P2-7) | 🟢/🟡 | Gewichte/Kataloge je Parlament; `LEVEL_IMPORTANCE` konfigurierbar, aber Scoring-Scharfschaltung bleibt Gründerentscheidung E5 (🟡) |
| DIP nur Bundestag, PARDOK als Landes-Primärquelle (P2-6) | 🟢 | `usesDip`-Gate im Crawl; DIP-api-Weg bleibt in jeder Konstellation vom Quellen-Crawl ausgeschlossen |
| Landtagsprofil-Modell (12 Feldgruppen) | 🟢 | Ohne Migration (profil_extras verlustfrei); Export/Löschung decken alles ab |
| Berlin-Vollmodell (Daten) | 🟢 | 18 Ausschüsse, Senat (11), Fraktionen, Behörden, 78 Wahlkreise, Medien, Relevanzregeln — prepared |
| Brandenburg-Vollmodell (Daten) | 🟢/🟡 | 14 Ausschüsse, 10 Ressorts (Woidke V), Fraktionen+Gruppe, 44 Wahlkreise — 3 Wahlkreisnamen + 1 Behörde prüfpflichtig (🟡) |
| BE/BB-Datenaktivierung (P2-4) | 🟡 | BEWUSST nicht ausgeführt (Sprint-Verbot): Paket-Flips, Vollmodell-Seed, Quellen-Review stehen aus (Checkliste unten) |
| KO-Backfill (E2, „Landtag-Ebenen-Trennung unmöglich ohne") | 🟡 | Werkzeug existiert (workflow_dispatch), Prod-Ausführung ist Gründer-Freigabe |
| Client-UI-Texte (MdB/Bundesregierung-Fallbacks, BT-Wahlkreisliste) | 🟠 | Anzeige-Schicht trägt weiter Bundestag-Texte (kein Pipeline-Blocker; Liste unter Risiken R5) |
| Blob-Skalierung (Audit R1, 1,24-MB-Store) | 🟠 | Unverändert (außerhalb Sprint-Scope); vor Mehr-Mandanten-Skalierung lösen (E3) |

**Gesamturteil:** 🟢 **Technisch landtagsfähig.** Berlin/Brandenburg sind vollständig vorbereitet und bleiben deaktiviert. Die Aktivierung erfordert **keinen Kernumbau mehr** — nur Konfiguration (1 Flag), Datenflips (Pakete/Status), Seeds und Profile. Weitere Bundesländer = 1 Registry-Eintrag + Landespaket + Seeds.

## 2. Liste aller Änderungen (6 Commits, 35 Dateien, +2.173/−105)

**Neue Module (Kern):**
- `lib/helmut/parlamente.js` — Parlaments-Registry (Bundestag byte-identisch, AGH Berlin, Landtag BB, generischer Landtag)
- `lib/helmut/quellenarchitektur/landesmodule.js` — Landesmodul-Registry + Freigabe-Flag `HELMUT_LANDESMODULE` (fail-closed)
- `lib/helmut/landtag-profil.js` — erweitertes Landtagsprofil-Modell (12 Feldgruppen, profil_extras)
- `lib/helmut/quellenarchitektur/seeds/landtag-berlin.js` / `landtag-brandenburg.js` — Vollmodelle (Daten)

**Geänderte Kernmodule (Bundestag-Verhalten unverändert, testerzwungen):**
- `source-mode.js` (Gate parametrisiert, injizierbar), `flags.js` (Allowlist +HELMUT_LANDESMODULE)
- `scheduler.js` (DIP-Gate `usesDip`; `neutralDefaultsFor`; Gewichte/Terme je Parlament)
- `server.js` (`ebenenBewussteBasis`, Save-Fallback ohne auto-Bund, Admin-Schnellstart +parliamentType, Office-Profilkontext)
- `ai.js` (Lage-/Kommunikations-/Bewertungs-Personas aus Registry; KO-Tags-Persona injizierbar)
- `office.js` + `templates/office/rede.j2` (Redeart je Parlament, Default Bundestagsrede)
- `pardok-dispatch.js` (Live-Modus, Doppel-Gate, `pardokDocToRawItem`), `crawler.js` (Konfidenz-Taxonomie, Kommentare)
- `classification.js` (amtliche Quell-Ebene `land` autoritativ), `scoring.js` (`levelImportanceFor`, opts)
- `lage.js`/`radarState.js` (Landes-Typ-Labels/Offiziell-Kategorien), `seeds/publishers.js` (BE/BB-Domains, inert)
- `seeds/entities.js` (Landes-Entitäten additiv, kollisionsfrei), `profile-packages.js` (Landespakete aus Registry)
- **Bewusst unverändert:** `matching.js` (geteilter Feature-Vektor-Raum — dokumentierte Ranking-Regressionsgefahr), `helmut-flags.json`, `vercel.json`, alle Locks/Telemetrie-Pfade

**Seeds/Fixtures/Werkzeuge:** PREPARED-Seed `20260722_landtag_vollmodell_be_bb_seed.sql` (+Rollback, NICHT angewendet), Generator `generate-landtag-vollmodell-seed.js`, anonyme Testprofile BE/BB
**Tests (5 neue Suiten, Suite 120→124):** `parlamente-test`, `landtag-profil-test`, `landtag-vollmodell-test`, `landtag-aktivierung-test` + `pardok-dispatch-test` Block 9; bewusste Test-Sperren-Updates dokumentiert (1c)
**Doku:** `docs/landtag/00–05`, Env-Inventar

**Testnachweis:** Offline-Suite **124/124 grün**, Browser-Smoke **32/32 grün**. Bewiesen: Bundestag unverändert · Landtagsprofile funktionieren · Berlin↔Brandenburg beidseitig isoliert (Plan-, Paket-, Parser-Ebene) · DIP nie automatisch für Landtag · keine Quelle aktiviert (Default-Pläne identisch; prepared aktiviert nie; Flag fail-closed).

## 3. Offene Risiken

| # | Risiko | Schwere | Behandlung |
|---|---|---|---|
| R1 | **3 BB-Wahlkreisnamen (28/34/42) + Landeswahlleitung BB teilverifiziert** (amtliche Seiten aus Arbeitsumgebung nicht direkt abrufbar) | mittel | Im Seed-Kopf als Prüfpflicht markiert; Checkliste D2 |
| R2 | **Politische Dynamik BB:** Ressortzuschnitte/Fraktionen ändern sich (Woidke V erst 03/2026; A7/A8 umbenannt; BSW-Dynamik) — Modelle sind Momentaufnahme 07/2026 | mittel | Vor Aktivierung Daten-Review (D2); keine Sitzzahlen im Modell |
| R3 | **PARDOK-Seed-URLs wahlperioden-fixiert** (Berlin WP19, BB WP8) — bei Legislaturwechsel (Berlin wählt Herbst 2026!) laufen sie leer | mittel | Checkliste D4; Berlin-Piloten erst nach AGH-Wahl 2026 datenseitig nachziehen |
| R4 | **Pfad-Status `needs_review`+`manual` sperrt technisch NICHT** (Phase-1-Abweichung zum Audit) — nach Gate-Freigabe + Paket-Flip liefe auch ein ungeprüfter Weg | mittel | Checkliste erzwingt Quellen-Review VOR Paket-Flip (D3); wirksame Sperren: Gate + Paketstatus |
| R5 | **Client-UI-Texte Bundestag-lastig** (client.js: „MdB"-Fallback 3358/8931, „·Bundestag" 4667, „Vorhaben der Bundesregierung" 6450, BT-Wahlkreisliste 336-360, Fallback-Fragetexte) + `sources.js`-Legacy-Fallback rein Bund | niedrig-mittel | Kein Pipeline-Blocker; als UI-Arbeitspaket vor Pilot-Onboarding einplanen (D7) |
| R6 | **Cem-thematische Fallback-Texte** (ai.js 959-974: „gute Arbeit/soziale Sicherheit"-Bias in Kanal-Fallbacks) — parlamentsneutral gemacht ist nur der Regierungs-Adressat | niedrig | Themenneutralisierung als Folgearbeit |
| R7 | **Scoring/LEVEL_IMPORTANCE nicht scharf** — Lage bleibt recency-getrieben, Bund-lastig auch für Landtagsprofile, bis E5 entschieden ist | mittel | Gründerentscheidung E5; `levelImportanceFor` liegt bereit |
| R8 | **KO-Backfill (247 Alt-KOs ohne Ebene) nicht ausgeführt** — Ebenen-Trennung im Bestand unvollständig | mittel | Gründer-Freigabe E2; Werkzeug vorhanden |
| R9 | **Blob-Skalierung (Audit R1)** unverändert; BE/BB-Live-Betrieb erhöht Datenvolumen | mittel | E3 vor Skalierung; PARDOK-Live schreibt über den relationalen Dedup-Pfad |
| R10 | **Kein Land-Scheduler:** Crons global (`vercel.json`, Sprint-Verbot) — eigene Abrufzeiten je Land erfordern eine (kleine) Cron-Erweiterung bei Aktivierung | niedrig | Optional bei Aktivierung; Grundbetrieb geht über bestehende Crons |

## 4. Aktivierungscheckliste (je Bundesland; alles Gründer-Freigaben, NICHTS davon in diesem Sprint ausgeführt)

**A. Voraussetzungen (einmalig)**
- [ ] A1 KO-Klassifikations-Backfill auf Prod ausführen (E2; workflow_dispatch, 0 KI)
- [ ] A2 Diesen Branch reviewen + mergen + deployen (CI grün: 124 Offline + Browser-Smoke)

**B. Datenprüfung (je Land, read-only)**
- [ ] B1 Vollmodell-Daten amtlich endprüfen — Pflicht für alle `verifiziert=false`-Einträge (BB-WK 28/34/42, Landeswahlleitung BB); Ressort-/Ausschusszuschnitte gegen Stand prüfen
- [ ] B2 Frischen PARDOK-Lauf über `.github/workflows/pardok-parser.yml` ziehen (Live-XML, WP-URLs korrekt?)

**C. Daten einspielen (freigabepflichtige Prod-Writes)**
- [ ] C1 Vollmodell-Seed anwenden: `supabase/seeds/20260722_landtag_vollmodell_be_bb_seed.sql` (idempotent; Rollback bereit)
- [ ] C2 Quellen-Review der 18 Kandidaten-Wege; je Weg Status `needs_review→healthy` + `manual→auto` NUR nach Prüfung (R4!)
- [ ] C3 Landespaket-Flip: `source_packages` `prepared→active` (`berlin-basis` bzw. `brandenburg-basis`)
- [ ] C4 Mandatsprofil(e) anlegen (politische_ebene `landtag` + Bundesland; Vorlage: Fixtures) — erst jetzt referenziert ein Profil das Paket

**D. Konfiguration scharf schalten (reviewbarer Git-Diff bzw. Vercel-Env)**
- [ ] D1 `HELMUT_LANDESMODULE=berlin` (bzw. `berlin,brandenburg`) — öffnet das Gate NUR für dieses Land
- [ ] D2 Für amtliche Dokumente: `HELMUT_PARDOK_DISPATCH=live` (Doppel-Gate; ohne D1 wirkungslos)
- [ ] D3 Optional: `HELMUT_SCORING_MODE` + `levelImportanceFor` (E5), Land-Cron-Fenster (R10)
- [ ] D4 Bei Legislaturwechsel: PARDOK-Export-URLs im Seed nachziehen (R3)
- [ ] D5 DSFA-Vorprüfung um PARDOK-Absatz ergänzen (`04-datenschutz.md`)
- [ ] D6 24-h-Shadow-Beobachtung nach Flip (Admin-Quellenreport; Rollback = Flag leeren)
- [ ] D7 UI-Arbeitspaket Client-Texte (R5) vor Nutzer-Onboarding

## 5. Pilotempfehlungen

**Berlin — Empfehlung: ⚠️ Pilot NACH der AGH-Wahl (Herbst 2026) starten, Vorbereitung JETZT abschließen.**
Technisch ist Berlin sofort aktivierbar (Datenqualität 🟢: alle 18 Ausschüsse, Senat, 78 Wahlkreise amtlich belegt; PARDOK-Berlin-Parser bewiesen). ABER: Die Abgeordnetenhauswahl im Herbst 2026 macht WP19-Daten (Ausschüsse, Fraktionen, PARDOK-WP19-Export, Wahlkreiszuschnitt alt) binnen Monaten obsolet. Empfehlung: Checkliste A+B+C1 jetzt, C2–D nach der Wahl mit WP20-Daten — sonst doppelter Datenpflege-Aufwand mitten im Pilot. Falls ein Vorwahl-Pilot politisch gewollt ist: nur mit klarem Nachzieh-Plan für den WP-Wechsel.

**Brandenburg — Empfehlung: ✅ Erstkandidat für den Landtagspiloten.**
Stabile Legislatur bis 2029, PARDOK/parldok-Parser bewiesen, Ressortzuschnitt (Woidke V) aktuell modelliert. Restarbeit klein: 3 Wahlkreisnamen + Landeswahlleitung amtlich bestätigen (B1), Quellen-Review der 7 BB-Wege (C2). Zweistufiger Einstieg wie im Audit (E4b) empfohlen: erst Google-News/RSS-Landeswege (ohne PARDOK-Live), nach 1–2 ruhigen Wochen `HELMUT_PARDOK_DISPATCH=live` dazu. Beobachtungspunkt: anhaltende Fraktionsdynamik (BSW/„Wir für Brandenburg") — betrifft aber nur Daten, keinen Code.

---

*Ende des Sprints. Kein Merge, kein Deployment, keine Migration, keine Production-Änderung, keine Aktivierung — Übergabe an den Gründer zur Freigabeentscheidung.*
