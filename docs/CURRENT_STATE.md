# CURRENT STATE — Helmut

**Letzte Aktualisierung:** 2026-07-26 (Reparatursprint Vorgangsbildung B4 · Berliner Beweislauf und
Rollback) · **`main`-HEAD:** `746eaf9` (Merge #143)

> **Berlin wurde am 2026-07-26 erstmals aktiviert — und noch am selben Abend zurückgerollt.**
> Aktivierung bis Stufe 1 um 21:01–21:03 UTC, Rollback (Ebene 0b **und** Ebene 2) um 22:47–22:49 UTC,
> nachdem Abbruchkriterium 16 eingetreten war. **Berlin ist heute wieder vollständig inaktiv:**
> 0 berechtigte Berliner Mandate, 0 aktive Berliner Wege. Der Auslöser war sehr wahrscheinlich
> **nicht** Berlin, sondern ein manueller `/api/pipeline/run` auf dem frisch deployten #143-Stand.
> Vollständige Beweiskette: [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §21/§22.

> **Diese Datei ist der aktuelle Stand.** Bei Widerspruch zu älteren Statusdokumenten
> gilt diese Datei. Sie enthält **keine Chronik** — Details je offenem Punkt stehen in
> [`datenmotor-restliste.md`](datenmotor-restliste.md) (OP-Nummern, verbindlich),
> der Systemstatus in [`quellenarchitektur/00-master-status.md`](quellenarchitektur/00-master-status.md),
> die Sicherheitswahrheit in [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md).
>
> **Pflege:** nach jedem größeren Sprint aktualisieren — nur die tatsächlich
> veränderten Zeilen. Regeln dafür: [`../CLAUDE.md`](../CLAUDE.md) §8/§9.

---

## 1 · Aktive Phase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Produktseitig gilt Feature-Stopp zugunsten
von Betriebs-, Rechts- und Sicherheitsreife.

## 2 · Erfolgreich abgeschlossen (Abnahme erfüllt, Production-belegt)

| Punkt | Beleg |
|---|---|
| Quellen-Cutover: relationale DB ist aktive Quellenwahrheit (`HELMUT_SOURCE_MODE=on`) | `helmut-flags.json`, Freigabe 2026-07-15 |
| App-seitige Mandantentrennung inkl. Cross-Tenant-Write-Guard | PR #96, `quellenarchitektur/05-sicherheitsmodell-rls.md` |
| Mandantenneutralisierung: kein Pilot-/Default-/Fallback-Mandant im Code | PR #97 |
| Atomare fail-closed Locks (Crawl + Understanding), Quellen-Telemetrie | PR #95, `betrieb/production_beweisprotokoll.md` |
| LLM-Tagesbudget 100 + Reserve 30, fail-closed | live (FA-5/FA-6/FA-12) |
| Ehrlicher Health-Report, Radar-Störungswahrheit, echte Laufzeitmessung | PR #95, Beweisprotokoll |
| PILOT_SECRET rotiert (alter Klartext-Code wertlos) | FA-1, 2026-07-15, `HTTP 200` verifiziert |
| KO-Klassifikations-Backfill inkl. Idempotenz-Nachweis (OP-08) | Runs 29511858469 / 29621926765, SQL-Gegenprobe 0 Lücken |
| Blockierendes CI-Gate (Offline-Suite + Chromium-Smoke) existiert | `.github/workflows/ci.yml` |
| Profil-Storage relational entkoppelt (Exklusivmodus) | PR #113 |
| Doku-Konsolidierung: `main` als einzige Architekturwahrheit | PR #114 (Recovery Sprint R2) |
| Quellenarchitektur-Remediation: Seed-Reproduzierbarkeit (P0-1) inkl. Drift-CI-Gate, Neutralisierung der Pflicht-Landespakete (P0-2), 6 Bundesweg-Reparaturen im Katalog (P1-5) | PR #118, gemergt 2026-07-25 (`61767a9`), CI grün, Deployment `READY` |
| Kontext-Einstiegsschicht (`CLAUDE.md`, `START_HERE`, `CURRENT_STATE`, `ARCHITECTURE`) | PR #119, gemergt 2026-07-25 |
| **Anker-Recovery-Pfad (F-3) technisch stillgelegt** — Workflow entfernt, Execute-Skript ohne DB-/KI-/Write-Pfad, `RECOVERY_ALLOWLIST` leer, namensunabhängiger CI-Riegel | PR #105, gemergt 2026-07-25 (`43e9e35`); auf `main` verifiziert: Workflow weg, Allowlist `[]`, 0 `require` im Execute-Skript |
| `failed-final` wird im Pending-Filter und in `understandOneCluster` terminal behandelt („nie wieder") | PR #105 |
| Freigabevorlage Quellen-Seed-Einspielung (Soll-Zahlen, Idempotenznachweis, Go-/Stop-Kriterien) | PR #123, gemergt 2026-07-25 (`bed7f53`), CI grün |
| **Production-Inventur aller Quellenpakete** (7 Pakete in der DB, 8 im Code-Seed seit #118; 163 Abrufwege; Ertrag/letzte Lieferung/Fehler je Paket) | `quellenarchitektur/30-paket-inventur-production.md`; PR #124, gemergt 2026-07-25 (`118e90c`), CI grün, Deployment `READY` |
| **Automatische Profil→Paket-Zuweisung belegt** — Bund/Berlin/Brandenburg gegen den echten Production-Katalog, ohne Codeänderung; keine Mandanten-Hardcodes, Bestandsmandanten unverändert | `scripts/paketzuweisung-nachweis-test.js` 147/147, Inventur §6; PR #124, gemergt 2026-07-25 (`118e90c`) |
| **Fachliche Vollständigkeit aller Quellenpakete belegt** (Phase-1-Punkt 13) — alle **8** Pakete abgeschlossen: **7 vollständig + 1 vollständig mit belegten Ausnahmen**, 0 teilweise, 0 blockiert. Ausführbares Kriterium je Paket (Pflichtklassen · Pflicht-Herausgeberklassen · Vollzähligkeit · begründete Überschneidungen · geprüfte Nicht-Anwendbarkeit); **keine** Vollzähligkeitsregel ist mehr katalogrelativ: Ausschüsse **24/24** und Fraktionen **5/5** gegen amtliche Sollmengen. **Ausschussstruktur zusätzlich Bezeichnung für Bezeichnung gegen die amtliche Bundestagsgrundlage abgeglichen** (Anzahl, Namen, Schreibweise, Ausschussnummer, Sonderfälle, Umbenennungen): 22 von 24 stimmten, **2 amtliche Bezeichnungen korrigiert** (Nr. 4 → „Innenausschuss", Nr. 15 → „Verkehrsausschuss") | `quellenarchitektur/31-paketvollstaendigkeit.md` §2a–§2c; `bundestag-ausschuesse-test.js` 54/54, `parlamentszusammensetzung-test.js` 65/65, `paketvollstaendigkeit-test.js` 99/99, Offline-Suite 150/150, Browser-Smoke 32/32; Branch `claude/helmut-phase1-punkt13-9iwu69` |

| **Punkt 14A: Berliner Aktivierung technisch abgesichert** — V-1 (Staffelung strukturell erzwungen: 9 Einzeldateien, je eine Transaktion, fail-closed `raise exception`-Riegel, Telemetriebeleg vor Stufe 2, Rollback je Stufe, Dry Run je Schritt) und V-2 (Landesmodule brauchen Freigabe **und** ein berechtigtes Landtagsmandat) | PR #138, gemergt 2026-07-26 19:14 UTC (`2f58d4c`), CI grün, Deployment `READY`. **Keine** Production-Mutation; auf `main` read-only nachgemessen: 0 Landesmodul-Wege aktiv, alle 18 Landeswege `needs_review`+`manual` |

| **Punkt 14B: Berliner Abnahmeprofil ist ausführbar statt beschrieben** — Schritt 5 der Aktivierungsreihenfolge war der einzige der 9 Production-Schritte ohne Datei, ohne Vor-/Nachbedingung, ohne Dry Run und ohne Rollback-Datei. Jetzt: **4 generierte SQL-Dateien** (anlegen + Rollback Stufe 0/1/2), fail-closed, idempotent, drift-gebunden; read-only **Dry Run gegen Production**; neuer Backup-Umfang `--scope=profil` für die beiden Tabellen, die der Schritt mutiert | `berlin-abnahmeprofil-pgverify.sh` **36/36 gegen echtes PostgreSQL 16**, `berlin-abnahmeprofil-test.js` **78/78**, `backup-export-test.js` 38 → **48/48**, Offline-Suite **157/157**, Browser-Smoke 32/32, Dry Run gegen Production Exit 0. **Keine** Production-Mutation. Branch `claude/helmut-production-berlin-prep-l0lfbg`, Details `betrieb/berlin-aktivierung.md` §20 |

## 3 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt | → OP |
|---|---|---|
| Google-News-Härtung (Gate/Retry/Breaker/Cooldown, Default AN) | Production-Beweislauf unter echter Drosselung | OP-15 |
| Monitoring-Zweitkanal + Meta-Heartbeat (Sender gehärtet) | `HELMUT_MONITORING_WEBHOOK_URL` unset → No-Op, kein `webhook.sent`-Beleg | OP-07 |
| `source_id`-Dubletten-Fix | Live-Nachweis „Telemetriezeilen = distinct `source_id`" | OP-19 |
| Zweitmandanten-Provisionierung + Per-Mandant-Kostendeckel | Migration `20260721` nicht angewandt, `HELMUT_TENANT_LLM_CAP` AUS, DB-seitige Durchsetzung unentschieden | OP-03 |
| Retention/Löschung | nur Trockenlauf; braucht verbindliche Fristen aus OP-02 | OP-12 |
| **Kostenmessung je Lauf und je Tag** (Phase-1-Punkt 17) — Auswertung ist belastbar und ehrlich: Beispiellauf **0,026805 USD**, Betriebstag im Mittel **0,1370 USD**, global/direkt **79 %/21 %** gemessen, unbekannte Kosten nie als 0,00; PR #136 | die **Datengrundlage** ist unvollständig: ~16 % Logverlust (K-1) · Preisbasis unbelegt (K-2) · Nicht-LLM-Provider ungemessen und ungedeckelt (K-6) · Gesamtbetrag nur **Untergrenze** · pro Mandant nur die 21 % direkt zurechenbaren Kosten (Rest bleibt global) · Ringpuffer 5 000 (K-7) | Punkt 17 · OP-03 |
| Understanding-Gate, Cheap-Triage, Scoring, Berlin/Brandenburg | in `shadow`/`off`, Scharfschaltung ist Freigabe | OP-18, OP-21, OP-22 |
| Pre-Seed-Sicherung + gezielter Seed-Restore (kein `drop table cascade`) — gebaut, adversarial reviewt, isoliert getestet (43/43 lokal, 41/41 in CI; `backup-export-test` 38/38; Suite 147/147). **Am 2026-07-26, 16:47 UTC erstmals real gegen Production gelaufen:** 8/8 Tabellen, 0 Fehler, `vollstaendig: true`, `pruefsummeGesamt` `49a5b92d…`, an `mainCommit 93006e8` gebunden | der **Restore** ist weiterhin nie gegen Production gelaufen; deckt nur 8 Tabellen ab und ersetzt OP-01 nicht | OP-01 |
| **Berlin-Aktivierungsreife (Phase-1-Punkt 14)** — Gate je Land freigebbar, `manual` ist eine echte Sperre, Aktivierungs-SQL + 3 Rollback-Stufen generiert und getestet, Runbook vollständig. **Zweiter Durchgang 2026-07-26:** Neutralität von `berlin-basis` ist jetzt eine **ausführbare Prüfung** (Code neutral, Production-Bestand **nicht** — Befund A-3 reproduziert), Wege **neu verifiziert** (Aktivierungsset 6 → **4**, zwei Wege veraltet), Lastmodell gegen gemessene Production-Zahlen korrigiert, Profilplan getestet, Aktivierung gestaffelt, Rollback gehärtet. **Dritter Durchgang (Production-Sprint) 2026-07-26:** Ausgangszustand vollständig gemessen, **Sicherung real erstellt**, Dry Run gegen den Ist-Zustand bestätigt (3/3/1/2 Zeilen, 0 Bund, 0 Brandenburg). **Vierter Durchgang (Zwischensprint 14A) 2026-07-26:** die beiden Vorprüfungsbefunde sind **behoben** — **V-1** (Staffelung war nur ein Kommentar: Block A/B1/Stufe 1/Stufe 2 in einer Datei, Block B in einer Transaktion) → **9 Dateien, je eine Transaktion**, mit `raise exception`-Riegeln, Reihenfolge in beide Richtungen erzwungen, **Telemetriebeleg** für Stufe 2 (je Weg ≥2 `ok`-Läufe), Dry Run **je Schritt**, Rollback **je Stufe**; **V-2** (Landesquellenauflösung wirkte global) → Landesmodule brauchen **Freigabe UND ein berechtigtes Landtagsmandat**, und ihre Wege erscheinen nur in der Versorgung berechtigter Mandate (`planQuellenFuerProfil`). Read-only gemessen: **kein** Production-Effekt heute (0 Landesmodul-Wege aktiv, Plan unverändert 140 Wege, alle 8 Profile mit unveränderter Versorgung). **Fünfter Durchgang (zweiter Production-Anlauf) 2026-07-26, 19:15–19:30 UTC:** PR #138 ist gemergt (`2f58d4c`, CI grün, Deployment `READY`), Startprüfung **11 von 14** erfüllt, Ausgangszustand neu gemessen, alle **8** Dry-Run-Schritte grün, Suiten grün (156/156 · Berlin 126/71/109 · Mandatsgate 71 · Punkt 16 160/160 · Punkt 17 128/128). **Erneut nichts mutiert** (`berlin-aktivierung.md` §19). **Sechster Durchgang (Vorbereitungssprint 14B) 2026-07-26, 20:15–21:10 UTC:** der zweite Blocker ist **beseitigt** — das Abnahmeprofil ist keine Entwicklungsaufgabe mehr, sondern **4 geprüfte SQL-Dateien** (anlegen + 3 Rückwege), gegen ein echtes PostgreSQL 16 bewiesen (36/36) und read-only gegen Production trockengefahren (Schritt 1 **jetzt ausführbar**: 4/4 Vorbedingungen, Treffer 1+1 Zeilen, 5/5 Nachbedingungen, Kontrollfragen 0). Zusätzlich: **zwei frische Sicherungen** (`pre-seed` 8/8 und der neue Umfang `pre-profil` 2/2, beide `vollstaendig: true`) und der Nachweis, dass **zwei** DB-seitige Not-Aus-Schalter (Profil deaktivieren · Wege auf `manual`) **jeder für sich** jeden Berliner Abruf stoppen — auch bei gesetztem Flag. **Erneut nichts mutiert** (§20). **Siebter Durchgang (dritter Production-Anlauf) 2026-07-26, 20:49–21:30 UTC — erstmals AUSGEFÜHRT:** der Betreiber hat `HELMUT_LANDESMODULE=berlin` gesetzt und Production neu deployt (Redeploy `dpl_7443DBt1…`, 20:58:57 UTC, `action: "redeploy"` auf **demselben** Commit `b83d33f` — starkes Indiz für eine Env-Änderung, **kein** Wertbeleg; der Flag-Wert bleibt aus einer Sitzung unlesbar). Startprüfung erstmals **14 von 14**. Zwei frische Sicherungen (`pre-seed` `49a5b92d…` 8/8, `pre-profil` `0c514ace…` 2/2, beide **byte-identisch** zu 14B → DB nachweislich unverändert), beide Dry Runs Exit 0, Ausführungskanal vorab per Riegeltest geprüft (`raise exception` bricht ab, 0 Zeilen). Dann **vier Mutationen, je eine Transaktion**: Block A 21:01:08 (`berlin-basis` **10 → 7** Wege, `die-linke-berlin` **0 → 3**, Summe 165 unverändert → **Befund A-3 in der DB geschlossen**) · Abnahmeprofil 21:01:52 (Profile 8 → **9**, aktive Mandate 6 → **7**, Landtagsprofile 0 → **1**, kein Klarname, Partei `Fraktionslos`) · B1 21:02:11 (`prepared` → **`active`**) · **Stufe 1** 21:02:48 (`rp-be-regionale_leitmedien` + `rp-rbb24-politik` → `healthy`/`auto`; beides **RSS-Direktfeeds**, keine Suchmaschine). Gegen den echten Resolver mit den mutierten Daten gerechnet: Plan **140 → 142**, genau die 2 Stufe-1-Wege, **0** Brandenburg; **alle 8 Bestandsmandate unverändert bei 140 Quellen** — auch die fünf Bundestagsmandate mit `bundesland=Berlin` erhalten **0** Berliner Wege (V-2 an echten Daten belegt). Neu: `scripts/berlin-beweislauf-auswertung.js` macht §10/§11 ausführbar (Referenzmessung **9 grün · 0 verletzt · 7 unbekannt**) und meldet Kriterium 16 ehrlich als `nicht_aus_db_messbar`. Suite **158/158** vor dem Eingriff (§21) | der **Betriebsbeweis selbst**: **0** Berliner Telemetriezeilen und **0** Berliner Rohdokumente — der nächste Crawl läuft erst **04:00 UTC**. **Stufe 2 ist nicht aktiviert** und an diesem Kalendertag nicht erreichbar: der SQL-Riegel verlangt **je Stufe-1-Weg ≥2 `ok`-Läufe**, `/api/cron/crawl` läuft nur 04:00 und 20:00 UTC. Offen bleiben damit alle laufabhängigen Nachweise (Doppelverarbeitung, Fehler, Rate-Limits, Kosten, Knowledge Objects, Vorgänge, Lage, Briefing). **Rollback Ebene 0 (Flag) bleibt aus einer Sitzung nicht verfügbar** — schneller Rückweg ist Ebene 0b/2 (datenbankseitig, je allein hinreichend). Nebenbefund: die pgverify-Beweise liefen gegen PostgreSQL **16.13**, Production ist **17.6**. Restrisiken: §18.4 und der Lastbefund §20.5 (Abbruchkriterium 16) | Punkt 14 |
| **Automatische Quellenstörungs-Erkennung (Phase-1-Punkt 16)** — `source_crawl_telemetry` hat einen Lesepfad (Befund **A-6** behoben); 14 Zustandsklassen, 4 Handlungsstufen, rhythmus-bewusste Leer-/Veraltet-Schwellen, Erholungsregel, Paket-/Mandatswirkung, Meldungs-Deduplizierung; Admin-Bereich „Quellen & Watchdog” erweitert | der **Production-Beleg für 7 der 14 Klassen** (u. a. `parserfehler`, `veraltet`, `nie_erfolgreich`) — diese Fehler sind in Production real nie aufgetreten und dürfen nicht künstlich erzeugt werden; ausschließlich testbelegt | Punkt 16 |
| OP-06 Terminales Aussortieren des Alt-Rückstands (34 Fälle, Default AUS) | Ausführung ist freigabepflichtig — **und** eine offene Fachfrage: 16 der 34 Allowlist-Einträge sind mit „außerhalb Mandat" begründet, also relativ zum Pilotmandat, geschrieben wird aber in das mandantenneutrale `knowledge_objects` (kein `tenant_id`). Ein künftiger Zweitmandant mit regionalem/EU-Schwerpunkt bekäme diese Vorgänge dauerhaft nie verstanden | OP-06 |
| **Diagnosesprint CSD-2026 (Betriebsbefund B4)** — belastbar bewiesen, warum der tödliche Anschlag auf den Berliner CSD (25./26.07.) in keiner Lage/keinem Briefing erschien: Quellen und Crawl arbeiteten fehlerfrei (21 Rohdokumente, 0 Fehler/Rate-Limits/Parserprobleme), der Verlust liegt in der **Vorgangsbildung** — `deriveVorgangId()` reduzierte einen Cluster auf ein einzelnes Wort; kollidierte dieses Wort mit einem älteren, fachfremden Knowledge Object, verwarf `understandOneCluster` den Cluster lautlos (`skipped-exists`). Ergebnis: **0 Knowledge Objects** zum Anschlag trotz vollständiger Quellenabdeckung. Vollständige Beweiskette in [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §1–§8 | **erledigt durch den Reparatursprint** (nächste Zeile) — die Diagnose selbst ist abgeschlossen; Branch `claude/csd-2026-event-diagnosis-lr4sr4`, PR #141 gemergt (`8085745`) |

| **Reparatursprint Vorgangsbildung (Betriebsbefund B4)** — der stille Verlustpfad ist geschlossen. **Leitentscheidung:** `vorgang_id` trug zwei unvereinbare Aufgaben zugleich (fachliche Identität *und* technischer Eindeutigkeitsschlüssel) — jetzt getrennt: die Kennung `vg-<themenwurzel>-<ereignistag>-<prüfsumme>` ist ein **Vorschlag**, die Zugehörigkeit entscheidet ein **Belegvergleich** gegen echte Kandidaten (neu `lib/helmut/vorgang-identity.js`, `resolveVorgang()` in `understanding.js`). Ankerschwelle 8 → 5 Zeichen plus Abkürzungen („CSD", „AfD") und Jahreszahlen; der Teilstring-Abgleich (`a.includes(b)`, dieselbe Konstruktion wie F-3) ist durch ein **Beweisgewicht** ersetzt; Clusterbildung ist **reihenfolgeunabhängig** und gegen Digest-Cluster abgesichert. **`skipped-exists` ist ersatzlos entfallen** — jeder Ausgang ist klassifiziert (`saved`/`updated`/`merged`/`duplicate`/`skipped-*`). **Verknüpfungsinvariante:** jeder Ausgang mit gefundenem Vorgang schreibt `ko_document_links`, dadurch ist der Endzustand jedes Rohdokuments **ohne neue Tabelle und ohne Migration** ableitbar (neu `lib/helmut/vorgangs-lebenszyklus.js`, 6 Zustände, genau einer unzulässig). Nachholpfad repariert (zurückgestellte Cluster werden vorgemerkt **und** verknüpft; der Nachhollauf bildet Cluster aus den Verknüpfungen statt aus einer Neuclusterung — vorher: 3 Läufe, 0 verarbeitet) plus Werkzeug `scripts/vorgangsbildung-nachholen.js` (Vorschau ist Standard, Ausführung braucht `HELMUT_NACHHOLEN_BESTAETIGT=ja`, harte Mengengrenze). Telemetrie je Lauf **und je Tag**; Großereignisse werden **flagunabhängig** vorgezogen; Watchdog im Health-Report-Cron (48-h-Fenster, mandantenneutral, einmal je Lauf). **Nebenbefund behoben:** `listRawDocuments`/`listRecentRawDocuments` wurden von PostgREST still auf 1 000 Zeilen gekappt — Aufrufe mit `limit=2000` sahen die Hälfte nicht. **Read-only verifiziert (7 Tage, 1 970 Rohdokumente):** Altverfahren 254 Kollisionen = **47,3 % der Rohdokumente** → *die 47-%-Angabe ist bestätigt*; neues Verfahren **0 Kollisionen**, 252 Cluster schreiben einen Bestand fort. Gesamtbild schlechter als gedacht: **76,3 % der Rohdokumente haben heute keinen nachvollziehbaren Endzustand** (ältestes 161 h alt). Tests: Offline-Suite **160/160** (3 neue Suiten: Identität 52, Lebenszyklus 55, CSD-Regression 38 Assertions), Browser-Smoke **32/32**. **Keine** Production-Mutation, **keine** Migration, **kein** Flag verändert | der **Production-Nachweis** — er verlangt Merge + Deployment und ist damit freigabepflichtig. Vollständiger Nachweisplan und Freigabeanfrage: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §12/§13. **Kostenbefund, der eine Entscheidung braucht:** die Obergrenze der KI-Aufrufe steigt von **115 auf 159 je Tag bei Tagesbudget 100** — der Engpass bestand vorher, wird jetzt aber sichtbar (`skipped-budget` statt stillem Verlust). Damit wird **OP-14** (Relevanzsortierung) dringlich. **Getrennt** freizugeben: das Nachholen des Altbestands (1 504 Dokumente). Branch `claude/helmut-vorgangsbildung-fehler-coolvq` |

## 4 · Blockiert

| Punkt | Ursache | Nächster Schritt |
|---|---|---|
| **OP-01** Supabase Pro + PITR | Kostenentscheidung des Betreibers (~25 $/Monat); Free-Plan = **keine Backups** | Betreiber schaltet Pro + PITR frei, dann Restore-Übung nach `betrieb/backup-restore-runbook.md` |
| **Quellen-Seed-Einspielung** (macht P0-2 und die 6 Bundesweg-Reparaturen in der DB wirksam) | **Go-Kriterium 2 ist seit 2026-07-26, 16:47 UTC erfüllt** — die Pre-Seed-Sicherung ist gelaufen (`vollstaendig: true`, 8/8 Tabellen, `mainCommit 93006e8`). Offen ist nur noch Go-Kriterium **8**: die Einspielung ist nicht freigegeben. Kriterium **11** ist **entschieden**: gestaffelte Reaktivierung (§6d). **Erledigt 2026-07-26:** derselbe Aufruf lief in der Cloud-Sitzung durch (Exit 0), weil `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` diesmal über die Claude-Code-Environment-Einstellungen gesetzt waren und der Supabase-Egress offen ist. Der Versuch vom 2026-07-25 war nur an fehlenden Zugangsdaten gescheitert, nicht am Werkzeug | Betreiber gibt die Einspielung frei; danach Runbook `betrieb/quellen-seed-einspielung.md` §6c Schritt 6 ff. Die Sicherung liegt vor und ist gültig, solange `retrieval_paths`/`package_paths`/`source_packages` unverändert bleiben |
| **OP-02** Recht (Pilotvertrag, AVV, DSFA, Art.-9-Grundlage, Fristen) | externe Prüfung durch Anwalt/DSB steht aus | Entwürfe aus `recht/` prüfen lassen und zeichnen; blockiert OP-12 |
| **OP-03** Zweitmandanten-Freigabepaket | Grundsatzentscheidung „DB-seitige Durchsetzung vs. dokumentierte App-Guard-Akzeptanz" fehlt (`mandantentrennung-architektur.md` bewertet die Wege) | Betreiber entscheidet einen Weg; danach Migration + Env + Probelauf |
| **OP-04** Demo-Mandate entfernen — **Umfang korrigiert 2026-07-25:** Production führt **8 Profile, davon 6 aktiv** (nicht 1 Pilot + 2 Demo-Mandate); fünf davon tragen Klarnamen realer Abgeordneter | Production-Datenänderung, freigabepflichtig; berührt zusätzlich OP-02 (personenbezogene Daten) | je Profil entscheiden, dann über Provisionierungswerkzeug deaktivieren (`quellenarchitektur/30-paket-inventur-production.md` §5, A-1) |
| **OP-09/OP-10** Production-Beweise Lock-Deny und Fehlerpfad | brauchen ein echtes Störereignis; künstliche Injektion und Doppelstart sind verboten | beim nächsten echten Vorfall dokumentieren |

## 5 · Fehlgeschlagene oder abgebrochene Ansätze — **nicht wiederholen**

> Diese Einträge existieren, damit kein neuer Thread dieselbe Sackgasse erneut baut.

### F-1 · Tenant-JWT-Selbstsignierung → RLS scharfschalten — **gescheitert, dauerhaft stillgelegt**
- **Versucht:** Mandantentrennung DB-seitig über selbstsignierte Tenant-JWTs und die
  23 RLS-Policies durchsetzen.
- **Warum gescheitert:** Supabase stellte auf asymmetrische JWT-Signing-Keys um; der
  Selbstsignatur-Pfad ist tot (PGRST301-Logs 12./13.07.). Stillgelegt am 2026-07-13
  (Commit `f952b69`, PR #68); `tenantJwtModeEnabled()` gibt hart `false`.
- **Folge:** RLS ist **inert**, Trennung ist App-seitig. Ein Nachfolgekonzept ist Teil
  von **OP-03**. `HELMUT_TENANT_JWT_MODE` zu setzen ist wirkungslos.

### F-2 · Generation B „Quellenplattform" — **abgebrochen, nicht mergen**
- **Versucht:** paralleler Nachbau der Quellenarchitektur auf eigenen Branches.
- **Warum abgebrochen:** dupliziert, was auf `main` bereits live läuft; aus Sicht des
  Servers additiver toter Code. Merge würde die laufende Architektur gefährden.
- **Verbindlich:** [`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)
  (vollständige Branch-Liste).

### F-3 · Anker-basierter Understanding-Recovery-Pfad — **in Production fehlgeschlagen**
- **Versucht:** 6 eingefrorene Alt-Fälle über einen anker-basierten Recovery-Pfad
  rekonstruieren (OP-05).
- **Was passierte:** der Lauf `rec-29569461715` erzeugte in Production einen
  **Multi-Themen-Digest** statt sauber getrennter Vorgänge; er wurde zurückgerollt.
- **Ursache (verifiziert):** `matchDocuments`/`anchorsMatch` in
  `lib/helmut/understanding-recovery.js` vergleicht über **Teilstring-Anker**
  (`a.includes(b) || b.includes(a)`) ab 8 Zeichen. Bei Multi-Doc-Fällen zieht das
  fremde Themen in dasselbe Cluster. Der Fehler liegt im Matcher, nicht in der
  Orchestrierung — er ist also **reproduzierbar**, solange Matcher und Allowlist stehen.
- **Blast-Radius:** Der Workflow lief nur manuell (`workflow_dispatch`, kein
  `schedule`/`push`), griff aber mit dem **Service-Role-Key** auf die Production-DB zu
  (umgeht RLS) und schrieb bis zu 6 neue complete-KOs. `knowledge_objects` trägt
  **kein** `tenant_id` — ein falsches KO ist für **alle** Mandanten sichtbar, inklusive
  Pilot-Briefing.
- **Stand auf `main`: stillgelegt** (PR #105, gemergt 2026-07-25, `43e9e35`). Auf
  `main` verifiziert: `.github/workflows/understanding-recovery.yml` existiert nicht
  mehr, `RECOVERY_ALLOWLIST` ist `[]`, das Execute-Skript enthält 0 `require`.
- **Die drei unabhängig wirksamen Sperren:** Workflow-Datei
  entfernt · `scripts/understanding-recovery-execute.js` auf einen Hinweis reduziert
  (kein `require` von `storage`/`ai`/`understanding`, wirkungslos auch mit Flag +
  korrektem Token) · `RECOVERY_ALLOWLIST` geleert. Zusätzlich ein
  **namensunabhängiger Regressionsriegel**: die Offline-Suite schlägt fehl, sobald
  *irgendein* Workflow — auch unter anderem Dateinamen — das Execute-Skript aufruft
  oder `HELMUT_RECOVERY_EXECUTE`/`-CONFIRM` setzt. Da CI die Offline-Suite fährt,
  blockiert das eine spätere Wiederbelebung.
- **Nicht wiederbeleben:** Der Branch `claude/helmut-datenmotor-impl-2-kd1jl9` trägt
  unter demselben Pfad eine **lauffähige** Fassung. Bei einem späteren Merge gilt für
  alle vier Recovery-Dateien die stillgelegte Fassung aus #105; eine
  Einzeldokument-Recovery gehört unter einen **eigenen** Dateinamen.
- **Konsequenz:** Diesen Workflow **nicht** ausführen. Der tragfähige Ersatzweg ist
  die **Einzeldokument-Recovery** je exakter `raw_document_id` (1 von 6 Fällen so
  bereits erfolgreich recovert, `singledoc-29583280106`); 1 Fall ist live als Duplikat
  verifiziert (→ OP-06).
- **Nicht betroffen:** `lib/helmut/ko-recovery.js` (P1-4, Default AUS) sowie
  `POST /api/admin/recovery/reset-failed` und `GET /api/debug/reset-failed-kos` nutzen
  den **normalen** Understanding-Pfad, nicht den Anker-Matcher.

### F-4 · Befund „Quellenbasis zu dünn" (altes Schema P2-5) — **Fehlbefund**
- Die Warnung entstand aus nie erfüllbaren Schwellen (495/450/405) gegen einen
  gesunden Crawl (~145 Quellen) und einer Zählung über den toten `store.sources`-Blob.
  Schwellen und Zählung sind korrigiert. **Es fehlen keine Quellen für den Piloten** —
  diese Analyse nicht erneut aufsetzen.

### F-5 · Feste Referenzzahl „145 Quellen" — **verworfen**
- Die Quellenzahl ist mandats-/profilabhängig (Demo-Mandat: 139). Die gültige
  Invariante ist `Telemetriezeilen = distinct source_id`, nicht eine feste Zahl (B3).

## 6 · Offene Punkte (Übersicht)

Vollständig und verbindlich in [`datenmotor-restliste.md`](datenmotor-restliste.md) §6.

- **P0 (Verkaufsblocker):** OP-01 Backups · OP-02 Recht · OP-03 Zweitmandanten-Paket · OP-04 Demo-Mandate
- **P1 (Betriebsreife):** OP-05 … OP-12
- **P2 (Produktqualität):** OP-13 … OP-20
- **P3 (später):** OP-21 Berlin/Brandenburg · OP-22 Scoring · OP-23 Hygiene

## 7 · Aktuelle Blocker (zusammengefasst)

1. **Kein Backup in Production.** Supabase Free-Plan, zentraler Blob ist
   Last-Write-Wins → ein fehlerhafter Write kann den Betriebszustand unwiederbringlich
   zerstören. Höchstes Einzelrisiko (OP-01). Für den **Seed-Sonderfall** existiert seit
   2026-07-25 ein geprüftes Werkzeugpaar (Pre-Seed-Export + gezielter Restore, §12) —
   das ersetzt OP-01 **nicht** und deckt nur die 8 Quellentabellen ab.
2. **Keine rechtliche Grundlage für Verkauf.** Kein geprüfter Pilotvertrag/AVV/DSFA,
   `knowledge_objects` enthalten Art.-9-Daten (OP-02).
3. **Sicherheits-Grundsatzentscheidung offen.** Ohne Entscheidung zu OP-03 darf kein
   zahlender Zweitmandant aufgeschaltet werden.
4. **Branch Protection unbestätigt.** Das CI-Gate blockiert erst mit aktivierter
   Branch Protection; Aktivierungsstand ist nicht verifiziert (OP-11,
   `betrieb/branch-protection.md`).

## 8 · Offene Pull Requests (Stand 2026-07-26)

| PR | Inhalt | Einschätzung |
|---|---|---|
| **#142** | **Phase-1-Punkt 14 (3. Production-Anlauf): Berlin aktiviert und zurückgerollt** — Ausführungsprotokoll, Abbruch, Rollback, Ist-Zustand, neues Auswertungswerkzeug | **mergefähig und vorrangig.** Ohne ihn behaupten Runbook-Kopfzeile und `CURRENT_STATE` einen Production-Zustand, den es nicht mehr gibt. Reine Doku-/Werkzeug-Arbeit (`git revert` genügt), keine Architekturänderung. Enthält den Merge von `746eaf9` (#143) als Basisaktualisierung. Branch `claude/berlin-production-activation-sc838w` |
| ~~#143~~ | Reparatur der Vorgangsbildung (Betriebsbefund B4) | **gemergt** 2026-07-26, ~22:05 UTC (`746eaf9`), Deployment `dpl_8ot9fCnko…` `READY`. **Wichtig für Punkt 14:** der erste Lauf auf diesem Stand (`/api/pipeline/run`, manuell, 22:09:52 UTC) endete mit **HTTP 504** nach 300 s — 336 Cluster gegenüber 91 im Lauf davor. Siehe `berlin-aktivierung.md` §22 |
| ~~#140~~ | Phase-1-Punkt 14B: Berliner Abnahmeprofil ausführbar vorbereiten | **gemergt** 2026-07-26, 20:47:03 UTC (`b83d33f`) |
| #132 | Phase-1-Punkt 15: Brandenburg Activation Readiness (aktiviert nichts) | **nicht in der jetzigen Form mergen.** Basiert auf `ca80b2f` (**vor** #138) und führt ein **konkurrierendes** Gate `HELMUT_LANDESMODUL_FREIGABE` ein; `main` kennt seit 14A ausschließlich `HELMUT_LANDESMODULE`. Vor einem Merge: Gate-Name vereinheitlichen und Branch auf den Stand nach #138 heben (`berlin-aktivierung.md` §19.6). Heute wirkungslos, weil nicht gemergt |
| #117 | WBSB-Pilotpaket + Workflow-Härtung vereinigt | **Draft, ausdrücklich nicht mergen** (öffnet nur die CI-Prüfung) |
| #115 | Bestandsabgleich `bund-basis` + Pflichtquellen-Verifikationstest | **Draft, ausdrücklich nicht mergen** (nur um den Workflow auf einem Runner mit Egress laufen zu lassen) |
| #112 | Geführter Erstlogin-/Onboarding-Flow (14 Screens) | manuelle Abnahme im Preview ausstehend |
| #111 | Sichtbarkeits-Toggle auf `/passwort-setzen` | technisch mergefähig, wartet auf Freigabe |
| #88, #70, #8 | ältere Stände (teils auf verwaisten Basis-Branches) | **veraltet** — vor Verwendung auf Aktualität prüfen oder schließen |

## 9 · Aktuelle Production-Situation

- **Deployment:** Vercel, Region `fra1`, Projekt `helmut-pilot`; Deploy erfolgt
  automatisch beim Merge nach `main`. Rollback: `betrieb/deploy-rollback.md`.
- **Datenbank:** Supabase **Free-Plan** — keine Backups, kein PITR (OP-01).
- **Flags:** `HELMUT_SOURCE_MODE=on` · `HELMUT_UNDERSTANDING_GATE=shadow` ·
  `HELMUT_PARDOK_DISPATCH=shadow` · Scoring `off` · **`HELMUT_LANDESMODULE=berlin` — seit
  2026-07-26, ~20:58 UTC vom Betreiber gesetzt (Redeploy belegt, Wert aus einer Cloud-Sitzung
  nicht lesbar)** · **Brandenburg weiterhin inaktiv** (`brandenburg-basis` `prepared`, alle 8
  `rp-bb-*` `needs_review`+`manual`).
- **Crons:** 9 Vercel-Cron-Einträge (Crawl 04:00/20:00, Understanding 05:30/21:30,
  Morgenbriefing 05:00, Lage-Briefing 05:45, Health-Report 06:00, Lage-Check 10:00,
  Pipeline 16:00 UTC) — siehe `vercel.json`.
- **Quellen (read-only gemessen 2026-07-25):** 7 Pakete in der DB (die zwei Landes-Partei-Pakete
  aus #118 existieren bisher nur im Code-Seed) · 163 Abrufwege · 145 modell-aktiv ·
  138 real gecrawlt (6 defekte Wege ohne Abruf, DIP eigener Pfad) · 19 Berlin-/Brandenburg-Wege
  hart gesperrt · 8 Mandatsprofile, davon 6 aktiv, alle Bundestagsebene.
  Details: `quellenarchitektur/30-paket-inventur-production.md`.
- **Nachtrag, read-only nachgemessen am 2026-07-26 (Punkt-14-Sprint):** die Datenbank hat sich
  seit dem 25.07. verändert — die Seed-Einspielung ist **teilweise erfolgt**. Gemessen:
  **9 Pakete** (`die-linke-berlin` und `die-linke-brandenburg` am 2026-07-26 11:07:48 UTC
  angelegt, beide `prepared`, beide mit **0 Abrufwegen**) · 144 Abrufwege um 11:07:48 aktualisiert,
  **0 neu angelegt** · `rp-bundestag` und `rp-linksfraktion` sind nicht mehr `broken`
  (= **Stufe 1** der beschlossenen gestaffelten Reaktivierung), die 4 Google-Wege blieben in einem
  zweiten Eingriff um 11:13:10 bewusst `broken` (= Stufe 2 offen) · `package_paths` unverändert
  **165**. **Folge:** der Landesmodul-Seed `20260717` ist **nicht** eingespielt — die
  P0-2-Umhängung (Befund **A-3**) ist in der Datenbank weiterhin **offen**: `berlin-basis`
  (`is_base`) trägt nach wie vor `rp-be-partei_pilot`, `rp-be-fraktion_pilot` und
  `rp-be-person_pilot`. Ebenfalls nicht eingespielt: die Punkt-13-Ergänzungen
  (24. Ausschuss `rp-committee-wahlpruefung` fehlt, 7 Niedersachsen-Wege fehlen) und die
  reparierten URLs (die on-conflict-Klausel aktualisiert `url` nicht — `rp-bundestag` ist
  reaktiviert, zeigt aber weiter auf die alte Adresse `bundestag.de/rss`).
  **Dieser Sprint hat nichts davon verändert** (nur `select`-Abfragen); wer den Eingriff
  ausgeführt hat, ist von hier aus nicht feststellbar. Die Zeilen in §4 zur
  Quellen-Seed-Einspielung sind damit **überholt** und gehören beim nächsten Seed-Sprint
  nachgezogen.
- **Betriebszahlen, read-only gemessen am 2026-07-26 (Punkt-14-Sprint, zweiter Durchgang):**
  **277 Rohdokumente/Tag** (1937 in 7 Tagen, 97 liefernde Quellen; je Quelle **Median 1,14/Tag**,
  Mittel 2,85, Max 41) · nur **13 %** der Rohdokumente werden mit einem Knowledge Object verknüpft ·
  **~40 Knowledge Objects/Tag** (32–50 über 11 volle Tage) · **LLM-Aufrufe Mittel 64/100**, am
  2026-07-20 **100/100** (Tagesbudget einmal voll ausgeschöpft) · Pending-Rückstand **50**
  (43 `pending` + 7 `failed`), **wächst nicht** — alle 43 stammen vom 02./03.07. ·
  **5 Crawl-Vollrunden/Tag** (04:00, ~07:5x, 10:00, 16:00, 20:00 UTC), Wiederholungsläufe holen
  nicht erneut ab (`skipped-shared`, 134–135 von 145 Wegen) · Originalverweis in **99,5 %**
  aufgelöst, **0** Rohdokumente tragen noch eine `news.google.com`-URL.
  **Damit sind zwei ältere Angaben überholt:** die „Verarbeitungskapazität ~15–20 Understandings/Tag"
  (real ~40) und die Annahme „2 Crawl-Läufe/Tag" aus `vercel.json` (real 5).
- **Nachmessung 2026-07-26, 16:45–16:52 UTC (Production-Sprint, read-only):** Bestand stabil.
  Letzter Vollcrawl `crawl-20260726160130-7bznw` (16:01:32 UTC): **145 von 147** Wegen `ok`, 2 `empty`,
  **0 error**, 0 `circuit-open`, 940 neue Rohdokumente, Laufzeit **33 s** · Invariante **B3 erfüllt**
  (147 Telemetriezeilen = 147 distinct `source_id`) · Fehlerrate 24 h **1,1 %** (28 von 2534), 56
  `circuit-open`, 16 Retries · `pipeline_locks` 3 Zeilen, **alle abgelaufen** (nichts hängt) ·
  Pending unverändert **50** · LLM heute **34**/100 (8-Tage-Mittel ≈ 63, Spitze 100 am 20.07.) ·
  Rohdokumente **1978**/7 Tage ≈ 283/Tag · Knowledge Objects **274**/7 Tage ≈ 39/Tag ·
  Originalverweis **99,5 %**. **Berlin weiterhin bei null:** 0 Rohdokumente, **0 Telemetriezeilen
  jemals**, alle 10 BE-Wege `needs_review`+`manual`, `berlin-basis` `prepared`, 0 Landtagsprofile.
- **Zugangsgrenze einer Cloud-Sitzung (präzisiert 2026-07-26, 19:15–19:30 UTC):** Supabase ist
  erreichbar (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` gesetzt, Egress HTTP 200) — Messung, Backup
  und SQL sind möglich. **Nicht** verfügbar ist die Vercel-Env: `VERCEL_TOKEN` ist nicht gesetzt,
  der Vercel-MCP-Server ist zwar **authentifiziert** (Team `nohut`, `prj_xbZ6…`), stellt aber **kein**
  Env-Werkzeug bereit, und `api.vercel.com`/`vercel.com` sind proxy-gesperrt (`CONNECT` → **403**) —
  ein bereitgestelltes `VERCEL_TOKEN` allein würde deshalb **nicht** genügen, der Egress müsste
  zusätzlich geöffnet werden.
  **Zwei ältere Angaben sind damit überholt:** (a) die Production-App ist **erreichbar** — über
  `web_fetch_vercel_url` (Vercel-MCP) antwortet sie mit **HTTP 401** statt des Proxy-`403`; sie ist
  also nicht unerreichbar, sondern unauthentifiziert (`PILOT_SECRET`/`CRON_SECRET` nicht gesetzt),
  und der Aufruf ist `GET`-only ohne eigene Header, kann also weder einen Crawl auslösen noch einen
  geschützten Endpunkt lesen. (b) Vercel-**Runtime-Logs** sind über MCP lesbar — ein
  Beobachtungskanal existiert, er zeigt aber HTTP-Ebene, **nicht** Umgebungsvariablen.
  **Folge unverändert:** `HELMUT_LANDESMODULE` ist weder lesbar noch setzbar noch rücksetzbar; damit
  ist Rollback Ebene 0 nicht verfügbar. Das blockiert jede Landesmodul-Aktivierung (Berlin wie
  Brandenburg) unabhängig vom Datenbankstand.
- **Nachmessung 2026-07-26, 19:21–19:24 UTC (zweiter Berlin-Production-Anlauf, read-only):** Bestand
  gegenüber 16:45–16:52 UTC **unverändert**. 9 Pakete · 163 Abrufwege · 165 Paketzuordnungen ·
  **8 Profile, 6 aktiv, politische Ebene ausnahmslos `bundestag`** → **0 Landtagsprofile** ·
  alle 18 Landesmodul-Wege (9 BE + `rp-rbb24-politik` + 8 BB) `needs_review`+`manual`,
  `last_success_at` **null** · Berliner Rohdokumente und Telemetriezeilen **jemals 0** ·
  Pending unverändert **50** (43 + 7) · LLM heute **34**/100 (Vortage 53/65/53/55) ·
  Fehlerrate 24 h **1,1 %** (28 von 2 534), 56 `circuit-open` · `pipeline_locks` 3 Zeilen,
  **alle abgelaufen** · letzte DB-Änderung 2026-07-26 **11:13:10 UTC** — also **vor** der Sicherung
  von 16:47, deren Grundlage damit weiterhin gültig ist (die Exportdatei selbst lag im Container
  jener Sitzung und existiert nicht mehr; vor jeder Mutation neu exportieren).
- **Nachmessung 2026-07-26, 20:15–21:10 UTC (Vorbereitungssprint 14B, read-only + zwei Sicherungen):**
  Profilbestand unverändert — **8 Profile, 6 aktiv, 0 Landtagsprofile**, das Abnahmeprofil existiert
  **nicht**. Quellenbestand unverändert (9 Pakete · 163 Abrufwege · 165 Zuordnungen ·
  `berlin-basis` trägt weiterhin die 3 Partei-/Fraktions-/Personenwege, Befund **A-3** offen).
  Zwei Sicherungen real erstellt (gegen `mainCommit 4bc58dc`): `pre-seed` **8/8**,
  `pruefsummeGesamt` `49a5b92d…` — **byte-identisch** mit der Sicherung vom 16:47 UTC, die
  Backup-Grundlage ist damit **gegengerechnet** statt aus Zeitstempeln erschlossen; und
  `pre-profil` **2/2** (`profiles` 8, `mandate_profiles` 8), `pruefsummeGesamt` `0c514ace…`.
  Beide Artefakte liegen im Container dieser Sitzung — vor jeder Mutation neu exportieren.
- **Nachmessung 2026-07-26 (Reparatursprint Vorgangsbildung, read-only):** erstmals wurde der
  **Endzustand jedes Rohdokuments** gemessen statt nur die Verknüpfungsquote. 7 Tage, **1 970
  Rohdokumente**, 97 liefernde Quellen: **13,9 % verstanden · 9,7 % offen in der Karenzzeit ·
  76,3 % ohne nachvollziehbaren Endzustand** (1 504 Dokumente, ältestes 161 h alt). 0 als Duplikat
  zusammengeführt, 0 bewusst ausgeschlossen, 0 vorgemerkt — diese Kategorien existierten schlicht
  nicht. Verarbeitungsdauer Rohdokument → Vorgang: **Median 2 min, Mittel 428 min, Max 112 h**
  (274 Fälle). Der Vergleich beider Verfahren an denselben Daten: Altverfahren 1 062 Cluster mit
  **254 Kollisionen = 932 Rohdokumente (47,3 %)** — die 47-%-Angabe aus PR #141 ist damit
  **bestätigt**; neues Verfahren 1 365 Cluster, **0 Kollisionen**, 252 Cluster (511 Rohdokumente)
  schreiben einen bestehenden Vorgang fort. **Damit ist eine ältere Angabe präzisiert:** die in
  §9 geführte „Verknüpfungsquote 13 %" war korrekt, beschrieb aber nur die Erfolgsseite — die
  Gegenseite (76,3 % ohne Endzustand) war nie gemessen worden. Werkzeuge:
  `scripts/vorgangsbildung-nachholen.js`, `scripts/vorgangsbildung-vergleich.js` (beide read-only,
  Vorschau ist Standard). **Nichts mutiert.**
- **NEU und bisher undokumentiert — die Crawl-Cron läuft ins Funktionslimit (gemessen 2026-07-26
  über die Vercel-Runtime-Logs):** in 7 Tagen **3** Antworten mit **HTTP 504**, **alle drei** auf
  `/api/cron/crawl`. Der Lauf um 20:00 UTC endete mit
  `Vercel Runtime Timeout Error: Task timed out after 300 seconds` (ein Mandat mit
  `eager-understanding 92371ms`, dazu 7 Zeitüberschreitungen auf Google-News-Profilquellen eines
  weiteren Mandats). Die Telemetrie desselben Laufs ist sauber (147 Zeilen = 147 distinct
  `source_id`, 145 `ok`, 0 `error`) — **eine reine Telemetriebetrachtung hätte diesen Befund nicht
  gezeigt.** Folge für Punkt 14: das Abnahmeprofil wäre ein **7.** aktives Mandat an
  Sortierposition **3 von 7** in einer **sequenziellen** Cron-Schleife mit hartem Zeitbudget und
  erzeugt selbst **6 zusätzliche Google-News-Abrufe je Lauf** (5 Mandats- + 1 Personenquelle,
  gemessen) — unabhängig vom Flag. Gehört zu OP-15/B1; neues Abbruchkriterium 16 in
  `betrieb/berlin-aktivierung.md` §11.
- **Ist-Zustand nach der Berliner Aktivierung (gemessen 2026-07-26, 21:03 UTC):** **163**
  Abrufwege · **165** Paketzuordnungen · **9** Pakete — alle drei **unverändert**.
  `berlin-basis` jetzt **`active`** mit **7** (statt 10) Wegen, `bund-basis` unverändert
  `active`/54, `brandenburg-basis` unverändert `prepared`/9 mit **8/8** gesperrten Wegen.
  **2** Berliner Wege scharf (`rp-be-regionale_leitmedien`, `rp-rbb24-politik` — beide `rss`),
  **2/2** Stufe-2-Wege weiterhin `needs_review`+`manual`. Profile **9**, aktive Mandate **7**,
  Landtagsprofile **1** (Abnahme-Testmandat, kein Klarname), Bundestagsprofile unverändert **8**.
  Berliner Telemetriezeilen und Rohdokumente **weiterhin 0** — der erste Berliner Crawl steht
  aus. Referenzwerte für die Abbruchkriterien: letzter Vollcrawl `crawl-20260726200015-z3qaf`
  (147 Zeilen = 147 distinct `source_id`, 145 `ok`, 2 `empty`, **0 error**, 937 neue Dokumente),
  Fehlerrate 24 h **0,9 %** (21 von 2 392), 56 `circuit-open`, Rückstand **50**, LLM heute
  **49**/100, `pipeline_locks` 2 Zeilen **beide abgelaufen**, `504` auf `/api/cron/crawl`
  in 24 h: **1** (7 Tage: 3).
- **Zustand:** 0 neue `systemErrors` im dokumentierten Beweiszeitraum; Betriebsbefunde
  B1 (Google-News-Klumpenrisiko, 146 von 163 Wegen über Google) und B2
  (Understanding-Rückstand) bleiben offen. Neu belegt: jeder Cron-Lauf erscheint doppelt —
  ein vollständiger Lauf und ~3 min später eine Wiederholung mit `circuit-open` auf fast
  allen Wegen (3 988 Telemetriezeilen gesamt) → gehört zu OP-15.
- **Kosten (read-only gemessen 2026-07-26):** bekannte LLM-Kosten **0,1370 USD/Betriebstag**
  im Mittel (7 volle Tage, Spanne 0,118–0,150; 30-Tage-Hochrechnung ≈ 4,11 USD) · einziger
  bepreister Provider ist `gpt-5-mini` · **79 % global / 21 % direkt mandantenzurechenbar** ·
  die Zahl ist eine **Untergrenze** (~16 % der Protokolleinträge gehen unter Parallelität
  verloren) und beruht auf einer **unbelegten** Preisbasis · Supabase, Vercel, Crawl-Volumen,
  Push und DIP sind ungemessen **und ungedeckelt**. Vollständig:
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md).
- **Nicht angewandte Migration:** `20260721` (DB-Härtung) — gehört zu OP-03.

## 10 · Letzte wichtige Entscheidungen

| Datum | Entscheidung |
|---|---|
| 2026-07-26 | **Jeder Production-Schritt bekommt eine Datei — auch der, der nur „zwei Zeilen" ist** (14B). Schritt 5 der Berliner Reihenfolge stand als Prosa zwischen acht fail-closed SQL-Schritten und wäre im Beweislauf von Hand ausgeführt worden: ohne Vorbedingung, ohne Idempotenz, ohne eigenen Rückweg. Ein Schritt ohne Riegel ist kein kleiner Schritt, sondern der ungesicherte |
| 2026-07-26 | **Ein Rückweg zählt nur, wenn er aus der Sitzung heraus ausführbar ist** (14B). Rollback Ebene 0 (Flag) bleibt es nicht. Belegt ist stattdessen, dass **zwei** datenbankseitige Not-Aus-Schalter — Abnahmeprofil deaktivieren (Ebene 0b) und Wege auf `manual` (Ebene 2) — **jeder für sich** jeden Berliner Abruf stoppen, auch bei gesetztem Flag. Das ersetzt Ebene 0 **nicht**: wer das Flag setzt, muss es zurücknehmen können — es macht die Lage aber steuerbar statt unsteuerbar |
| 2026-07-26 | **Ein Sicherungsumfang wird an den Eingriff geschnitten, nicht an die Bequemlichkeit** (14B). `--scope=seed` deckte die beiden Profiltabellen nicht ab, `--scope=voll` hätte Rohdokumente, Briefings und Interaktionen mitgezogen. Neuer Umfang `--scope=profil` sichert genau `profiles` + `mandate_profiles`. Ein leerer Teil-Export gilt weiterhin **nicht** als Sicherung (Exit 1) |
| 2026-07-26 | **Der Rückweg eines Profilschritts ist die Rollback-Datei, nicht der Restore** (14B). `profiles` trägt `ON DELETE CASCADE` auf **14** Tabellen — ein `delete` erzeugt keine Fremdschlüssel-Waisen (die frühere Runbook-Formulierung war falsch), sondern **löscht erzeugte Daten mit**. Deshalb: deaktivieren vor markieren vor löschen, und Stufe 2 bricht ab, sobald eine abhängige Zeile existiert |
| 2026-07-26 | **Die Abnahme-Id wird NICHT ans Ende der Mandatssortierung gelegt** (14B). Das hätte die Bestandsmandate im Zeitbudget nach vorn geholt, aber das Testmandat selbst zum wahrscheinlichsten Abschnittskandidaten gemacht — ein Beweislauf, der „0 Berliner Dokumente" meldet, weil sein Mandat nie verarbeitet wurde, ist die schlechtere Fehlerart. Beide Fälle sind sichtbar (systemError), keiner ist still; die Wahl gehört dem Betreiber (`berlin-aktivierung.md` §20.5) |
| 2026-07-26 | **Der Berliner Beweislauf braucht zwei Voraussetzungen, nicht eine** — der zweite Production-Anlauf hat belegt, dass der Flag-Zugang allein nicht genügt. Seit 14A/V-2 aktiviert `HELMUT_LANDESMODULE=berlin` **ohne** ein berechtigtes Berliner Landtagsprofil **0** Wege; Production führt 0 Landtagsprofile. Ein Anlauf, der nur das Flag beschafft, endet in einem No-Op statt in einem Beweis (`berlin-aktivierung.md` §19.5) |
| 2026-07-26 | **Ein `VERCEL_TOKEN` allein macht die Vercel-Env aus einer Cloud-Sitzung nicht erreichbar** — `api.vercel.com` und `vercel.com` sind proxy-gesperrt (`CONNECT` → 403). Die Übergabe an den Betreiber verlangt deshalb entweder das Setzen des Flags durch ihn selbst **oder** Token **und** geöffneten Egress. Die frühere Formulierung „einer Agenten-Sitzung `VERCEL_TOKEN` bereitstellen" war unvollständig (§19.4) |
| 2026-07-26 | **Ein Backup, auf das nicht mehr zugegriffen werden kann, gilt nicht als Backup** — die Sicherung vom 16:47 UTC ist inhaltlich weiterhin gültig (die drei gebundenen Tabellen sind seit 11:13 UTC unverändert), ihre Exportdatei lag aber im Container jener Sitzung. Vor jeder künftigen Mutation wird neu exportiert, statt sich auf ein Manifest aus einer beendeten Sitzung zu berufen |
| 2026-07-26 | **Eine gestaffelte Production-Änderung wird durch getrennte Dateien und ausführbare Riegel erzwungen, nicht durch Kommentare** (14A/V-1). Jede Stufe hat eine eigene Transaktion, eigene Vor-/Nachbedingungen als `raise exception`, einen eigenen Dry Run und einen eigenen Rollback. Die frühere Sammeldatei bleibt als **fail-closed Stop-Datei** erhalten, damit eine ältere Anleitung nichts mehr aktiviert |
| 2026-07-26 | **Die Reihenfolge einer Staffelung wird am Betriebsbeleg geprüft, nicht am Zustand** (14A/V-1). Stufe 2 verlangt je Stufe-1-Weg mindestens **2** Läufe mit `status='ok'` in `source_crawl_telemetry`. Zwei Dateien direkt hintereinander auszuführen wäre formal „Stufe 1 zuerst“ und trotzdem genau der Lastfall, den die Staffelung verhindern soll |
| 2026-07-26 | **Ein Landesmodul braucht Freigabe UND ein berechtigtes Landtagsmandat** (14A/V-2). Das Flag allein genügte bisher; über den zweiländrigen `rp-rbb24-politik` konnte ein **Brandenburger** Mandat bei reiner Berlin-Freigabe einen Landesweg starten. Gezählt wird über `resolveProfilePackages()` — ein **Bundestags**mandat mit `bundesland='Berlin'` berechtigt Berlin nicht (4 der 6 aktiven Production-Profile sind genau das) |
| 2026-07-26 | **Der geteilte Rohkorpus wird dokumentiert, nicht als Isolation ausgegeben** (14A/V-2). `raw_documents` und `knowledge_objects` tragen kein `tenant_id`; mandatsscharf ist die Relevanzauswahl stromabwärts, nicht der Abruf. Mandatsbezogen auf Abrufebene sind **nur** Landesmodul-Wege. Ein Berliner Testprofil beweist deshalb die Paketauflösung und das Gate — **nicht** eine getrennte Verarbeitung (`berlin-aktivierung.md` §18.3) |
| 2026-07-26 | **Die allgemeine Paketberechtigung je Profil wird in 14A NICHT geändert** — read-only gemessen würde sie 5 von 6 aktiven Profilen betreffen (−6 bis −88 von 140 Abrufwegen, u. a. 82 Wege aus `arbeit-und-soziales`). Das ist eine Produktentscheidung über die Versorgung bestehender Mandate und stellt **keine** Isolation her (gemeinsamer Korpus). Gehört zu OP-03 |
| 2026-07-26 | **Eine Landesmodul-Aktivierung wird nicht begonnen, solange das Freigabeflag nicht auch zurückgenommen werden kann.** Der Production-Sprint hätte Block A, Testprofil und Stufe 1 rein datenbankseitig ausführen können — er hat es nicht getan. Ohne Vercel-Zugang ist Rollback **Stufe 0** (Flag leeren, ohne DB-Schreibzugriff) nicht verfügbar, und Riegel 1 ist nicht einmal auslesbar. Drei von vier Riegeln zu entfernen, während der vierte weder messbar noch steuerbar ist, ist kein zulässiger Zwischenzustand |
| 2026-07-26 | **Die Pre-Seed-Sicherung ist erstmals real gelaufen** (8/8 Tabellen, `vollstaendig: true`). Damit ist belegt, dass produktionsrelevante Skripte in einer Cloud-Sitzung lauffähig sind, sobald die Secrets über die Environment-Einstellungen bereitstehen (`CLAUDE.md` §4.9) — der Fehlschlag vom 2026-07-25 lag an fehlenden Zugangsdaten, nicht am Werkzeug |
| 2026-07-26 | **Unbekannte Kosten werden nie zu 0,00 addiert** — `0,00` ist ausschließlich zulässig, wenn nachweislich **kein** Provideraufruf stattfand. Der Kostenkern trennt dauerhaft `gemessen` / `kosten-unbekannt` / `kein-provideraufruf`; die Altsummen (`getLlmUsageToday`, `getLlmCostSince`) bleiben unverändert bestehen, sind aber ausdrücklich **nicht** die ehrliche Wahrheit |
| 2026-07-26 | **Preise werden deklariert, nicht korrigiert** — die Preistabelle bleibt unverändert (eine Preisrecherche oder ein aus dem Gedächtnis gesetzter Preis wäre schlechter als ein deklarierter Schätzwert). Stattdessen trägt jede Kostenangabe ihre Herkunft; belegt wird sie vom Betreiber über `HELMUT_LLM_PRICE_SOURCE`. Solange sie unbelegt ist, gilt ein Betrag als **berechnet**, nicht als Providerkosten |
| 2026-07-26 | **Globale Kosten werden nicht auf Mandanten verteilt** — gemessen sind 79 % geteilte Arbeit; jede Verteilungsformel ohne gemessene Bezugsgröße wäre eine erfundene Wahrheit. Ausgewiesen wird nur die Bemessungsgrundlage (direkt zurechenbar · global · noch nicht zurechenbar) |
| 2026-07-26 | **Vorbereitete Pflichtquellen statt globaler Kuratierungsschwelle** — `regional-niedersachsen` bekommt seine benannte Basis über 7 gezielt gebundene Wege im Zustand `paused`/`manual` + `active: false`. Das Anheben der Kuratierungsschwelle (rund 20 zusätzliche Google-Abrufe je Crawl) ist damit **nicht** nötig; die Aktivierung bleibt eine eigene Freigabeentscheidung |
| 2026-07-26 | **„Fachlich nicht anwendbar" ist nur mit überprüfbarer Voraussetzung zulässig** — stabile Kennung, politische Begründung, Wahlperiode, amtlicher Beleg und eine Prüfung gegen `seeds/parlamentszusammensetzung.js`. Eine unbestätigte Ausnahme lässt die Klasse als offene Lücke stehen; Freitext genügt nicht mehr |
| 2026-07-26 | **Auch die Fraktionssollmenge wird extern verankert** — die Alt-Zählung „8 von 8" war fachlich falsch (FDP und BSW nicht im 21. Bundestag, SSW ohne Fraktionsstatus). Richtig sind 5 Fraktionen. Die drei Quellen bleiben erhalten, werden aber als `parteien_ohne_fraktionsstatus` geführt |
| 2026-07-26 | **Die amtliche Bezeichnung wird je Ausschuss belegt, nicht aus der Anzahl geschlossen** — die Sollmenge hatte mit 24 die richtige Anzahl und trotzdem für 2 Ausschüsse die falsche Bezeichnung („Ausschuss für Inneres und Heimat" ist die der 20. WP, „Ausschuss für Verkehr" war nie amtlich). Die Sollmenge trägt jetzt zusätzlich die **amtliche Ausschussnummer**; kein aktueller Ausschuss darf mit einer Webarchiv-Seite einer älteren Wahlperiode belegt werden |
| 2026-07-26 | **Die Ausschuss-Sollmenge wird extern verankert, nicht aus dem Katalog abgeleitet** — eine katalogrelative Vollzähligkeitsprüfung ist per Konstruktion erfüllbar und hat den Fehlbestand 23 statt 24 verdeckt. Kanonische Quelle: `seeds/bundestag-ausschuesse.js` (Drucksache 21/150) |
| 2026-07-26 | **Katalog-Ids der Ausschusswege bleiben eingefroren**, auch wo der Slug nicht mehr zum amtlichen Namen passt. Eine Id-Änderung würde beim Seed-Einspielen eine neue `retrieval_paths`-Zeile anlegen und die alte als weiter gecrawlte Waise im Pflichtpaket zurücklassen. Die fachliche Bindung läuft über `ausschussKey` |
| 2026-07-26 | **Ein ständiger Bundestagsausschuss gehört immer auch in `bund-basis`** — die Zusage „alle Ausschuesse" des neutralen Pflichtpakets ist eine Vollzähligkeitsregel und wird jetzt gezählt, nicht behauptet. Zuvor fehlte genau der Ausschuss des Pilotmandats im Pflichtpaket |
| 2026-07-26 | **`regional-niedersachsen` bleibt „teilweise vollständig"** — die fehlenden benannten Regionalherausgeber werden **nicht** durch Anheben der Kuratierungsschwelle nachgezogen (≈ 20 zusätzliche Google-Abrufe je Crawl, verstärkt Befund B1). Kosten-/Laufzeitentscheidung des Betreibers; die Lücke ist testgesichert statt kaschiert |
| 2026-07-26 | **Fachlich unmögliche Pflichtklassen werden ausgewiesen, nicht entfernt** — `die-linke-brandenburg` behält alle 3 Pflichtklassen; die 2 nicht besetzbaren tragen eine Begründung und halten das Paket bei „teilweise vollständig". Kriterien werden nicht abgeschwächt, um Grün zu erzeugen |
| 2026-07-25 | **Neue dauerhafte Regel (`CLAUDE.md` §4.9):** produktionsrelevante Skripte mit Secrets müssen sowohl lokal als auch in einer Claude-Code-Cloud-Sitzung lauffähig sein. Secrets erreichen eine Cloud-Sitzung ausschließlich über die Claude-Code-Environment-Einstellungen, niemals über Chat oder Commits. Geprüft: kein Skript im Repo parst `.env.local` selbst per `dotenv` — alle lesen ausschließlich `process.env` und sind damit bereits kanalunabhängig; `docs/betrieb/env-inventar.md` §8 führt die Cloud-Environment-Variable als vierten Kanal neben Vercel, lokaler Shell/`.env.local` und GitHub Secrets |
| 2026-07-25 | **Die 6 reparierten Bundeswege werden gestaffelt reaktiviert** — erst die 2 Direktfeeds, nach einem vollen Crawl-Zyklus die 4 Google-Wege (`betrieb/quellen-seed-einspielung.md` §6d). Umsetzung als gezieltes `update` nach dem Seed, **nicht** durch Bearbeiten der Seed-Datei: der Bund-Seed ist per Drift-Gate byte-genau an seinen Generator gebunden |
| 2026-07-25 | Der Parallelbranch `claude/helmut-seed-review-6nocps` wird **nicht als Ganzes gemergt** — seine Doku-Fassung ist von vor den Korrekturen abgezweigt und würde die gemessenen Ist-Zahlen, die Delta-Prüflogik und die Staffelung zurückdrehen. Seine drei Code-Änderungen sind einzeln triagiert (Runbook §6d.2) |
| 2026-07-25 | `rp-ausschuss-arbeit-soziales` wird **erst vor Stufe 2 entschieden**, anhand echter Telemetrie. Das zweite Argument des Parallelbranches trifft zu: der reparierte `rp-bundestag` holt `pressemitteilungen.rss` **und** `presse/hib/rss` direkt — der Google-Weg `site:bundestag.de` ist damit ein Aggregator-Umweg auf eine bereits direkt abgerufene Domain. Umsetzung per `update`, nicht per Katalog-Override |
| 2026-07-25 | Die Erweiterung der `on-conflict`-Klausel um `url`/`query`/`parser`/`max_items` (R-2) **läuft nicht mit der Erstanwendung** — sie betrifft 144 Abrufwege statt 6 und ist von keiner geprüften Soll-Zahl abgedeckt. Eigener Schritt, eigene Vorschau, eigene Freigabe |
| 2026-07-25 | PR #125 (Sicherung + gezielter Restore) gemergt (`0d6d867`); CI auf `main` grün, Vercel-Production `READY` |
| 2026-07-25 | **Prüfungen im Seed-Runbook arbeiten mit gemessenen Deltas und benannten Zeilen**, nicht mit absoluten Zahlen aus einer Doku — absolute Zahlen driften bei jeder Provisionierung und hätten eine korrekte Datenbank fälschlich gestoppt |
| 2026-07-25 | Der Seed-Rückweg ist ein **gezielter, zeilenscharfer Restore** — `drop table … cascade` ist als Rollback **verworfen** (würde wegen `ON DELETE CASCADE` fremde Daten mitreißen und ist für Rückbau unbrauchbar) |
| 2026-07-25 | Ein Backup mit Fehlern gilt **nicht** als Backup: `backup-export.js` prüft die Zeilenzahl serverseitig gegen und markiert das Manifest `vollstaendig: false` + Exit 1 |
| 2026-07-25 | PR #124 (Paket-Inventur + Zuweisungsnachweis) auf Betreiberfreigabe gemergt (`118e90c`); CI auf `main` grün, Vercel-Production `READY` |
| 2026-07-25 | Anker-Recovery-Pfad **stillgelegt und auf `main` durchgesetzt** (PR #105, `43e9e35`); Wiederbelebung wird durch einen namensunabhängigen CI-Riegel blockiert |
| 2026-07-25 | Kontext-Einstiegsschicht ist verbindlich; `CLAUDE.md` → `START_HERE` → `CURRENT_STATE` ist die Pflichtlektüre jedes Threads (PR #119) |
| 2026-07-25 | Der anker-basierte Recovery-Pfad wird **nicht repariert, sondern stillgelegt**; echte Recovery läuft ausschließlich über den Einzeldokument-Pfad je exakter `raw_document_id` (PR #105) |
| 2026-07-22 | `main` ist die einzige Architekturwahrheit; Generation B wird nicht integriert (PR #114) |
| 2026-07-22 | Kanonische Doku-Hierarchie festgelegt: Sicherheit → `05-…`, Status → `00-master-status`, offene Punkte → `datenmotor-restliste` |
| 2026-07-17 | Einheitliches Nummernschema: OP-xx für offene Punkte; FA-x/FT2-x/A-Px nur noch historisch |
| 2026-07-15 | Quellen-Cutover ausgeführt (`HELMUT_SOURCE_MODE=on`) |
| 2026-07-15 | PILOT_SECRET rotiert |
| 2026-07-13 | Tenant-JWT-Pfad dauerhaft stillgelegt; Trennung bleibt App-seitig |

## 11 · Nächster sinnvoller Sprint

**Empfehlung: OP-01 (Supabase Pro + PITR) als Betreiber-Freigabe einholen und
ausführen** — er ist unabhängig von allem anderen, beseitigt das größte
Einzelrisiko und ist Voraussetzung dafür, dass die Migration aus OP-03 gefahrlos
eingespielt werden kann.

**Für Punkt 14 gilt nach dem Vorbereitungssprint 14B: es fehlt genau EINE Voraussetzung, und sie
ist keine Entwicklungsaufgabe.** Von den beiden Blockern des zweiten Anlaufs ist der zweite
beseitigt.

1. **Flag-Zugang — offen, Betreiberhandlung.** `HELMUT_LANDESMODULE` ist aus einer Cloud-Sitzung
   weder lesbar noch setzbar noch rücksetzbar; am 2026-07-26 auf **sechs** Kanälen neu gemessen
   (Vercel-REST · Vercel-MCP · Datei-Flag · App · GitHub Actions · Runtime-Logs),
   [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §20.3. **Kleinste Aktion:** in
   der Vercel-Oberfläche Projekt `helmut-pilot` → Settings → Environment Variables → Production
   `HELMUT_LANDESMODULE` = `berlin` setzen und redeployen; Rücknahme = Wert auf `off` oder Variable
   löschen + Redeploy (ein unbekannter Wert wirkt fail-closed). Alternativ `VERCEL_TOKEN` **und**
   geöffneter Egress zu `api.vercel.com` — eines allein genügt nicht.
2. **Abnahmeprofil — erledigt (14B).** Schritt 5 ist keine Prosa mehr, sondern vier generierte,
   fail-closed, idempotente SQL-Dateien mit drei Rückwegen, gegen ein echtes PostgreSQL 16
   bewiesen (36/36) und read-only gegen Production trockengefahren (Schritt 1 **jetzt ausführbar**,
   Kontrollfragen 0). Ebenfalls geschlossen: der passende Sicherungsumfang (`--scope=profil`) und
   der Nachweis, dass **zwei** DB-seitige Not-Aus-Schalter jeder für sich jeden Berliner Abruf
   stoppen. Details: §20.

Punkt 15 (Brandenburg) bleibt aus demselben Grund (1) blockiert; zusätzlich ist vor einem Merge von
PR #132 der konkurrierende Gate-Name zu vereinheitlichen (§19.6).

**Ansonsten entscheidungsreif und wartend (seit 2026-07-26): die Berlin-Aktivierung.** Punkt 14 ist bis
unmittelbar vor die erste Production-Änderung vorbereitet; jeder Eingriff ist zeilengenau benannt
und seit 14A in **fünf Ebenen** rückrollbar — davon zwei je Aktivierungsstufe getrennt. **Bedingung V2 (Neuverifikation) ist erledigt** — sie lief am
2026-07-26 auf einem Actions-Runner mit offenem Egress (Runs `30208901908` + `30208997672`,
zweimal identisch) und hat das Aktivierungsset von 6 auf **4** Wege reduziert: `rp-be-landesparlament`
(jüngstes Item **156 Tage** alt) und `rp-be-landesfraktionen` (**41 Tage**) antworten zwar mit
HTTP 200, liefern aber nichts Aktuelles. **Offen bleibt V1**: die Neutralisierung von `berlin-basis`
ist in der Datenbank weiterhin nicht vollzogen (Befund A-3, am 2026-07-26 um 16:45 UTC erneut
gemessen). Der Dry Run des Production-Sprints hat belegt, dass Block A exakt 3 + 3 Zeilen berührt
und **keinen** Bundes- oder Brandenburg-Datensatz.
Runbook: [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md), Ausführungsprotokoll §16.

Der **konkret vorbereitete** nächste Schritt ist die **Quellen-Seed-Einspielung** (Seeds
`20260713` + `20260717`); sie macht die P0-2-Neutralisierung und die 6 Bundesweg-Reparaturen in
der Datenbank wirksam. Sie ist jetzt **vollständig entscheidungsreif**: Soll-Zahlen,
Idempotenznachweis, Rückweg, Kontrollkarten je Abrufweg und ein 17-Schritte-Runbook stehen in
[`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md).

Sie bleibt **blockiert**, aber nur noch an zwei Betreiberhandlungen:
1. `node scripts/backup-export.js --scope=seed` gegen Production ausführen (read-only, braucht
   `SUPABASE_SERVICE_ROLE_KEY`) und im Manifest `vollstaendig: true` bestätigen.
2. Die **absichtliche Reaktivierung der 6 Bundeswege** ausdrücklich mitfreigeben (§12).

Der gezielte Restore für den Fehlerfall ist gebaut und isoliert getestet — er ersetzt OP-01
**nicht**, deckt aber genau den Seed-Sonderfall ab.

Die Paket-Inventur belegt den Handlungsbedarf mit Production-Zahlen: die Landes-Basispakete tragen
in der Datenbank weiterhin Partei-, Fraktions- und Personenquellen (A-3), und 2 der 5
`always_on`-Kernwege stehen weiterhin auf `broken` (A-4). Ohne die Seed-Einspielung können die
Phase-1-Punkte 6, 7, 14 und 15 nicht grün werden
([`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) §7).

Parallel möglich, ohne Freigabe:
1. **OP-11 Branch Protection** verifizieren (2 Minuten, reversibel,
   `betrieb/branch-protection.md`).
2. **Review offener PRs** (#112, #111).
3. **Phase-1-Checkliste** fortführen: [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md)
   ist die operative Wahrheit; nächster nicht-freigabepflichtiger Block sind die Punkte 19–23
   (Ebenen-/Geografie-/Embedding-Vollständigkeit, Matching-Nachvollziehbarkeit).

**Vor einer OP-06-Ausführung ist eine Fachentscheidung nötig:** die mandatsrelative
Begründung von 16 der 34 Allowlist-Einträge (§3) muss bewertet werden — terminale
Markierung in einer mandantenneutralen Tabelle wirkt für alle künftigen Mandanten.

## 12 · Letzter Sprintausgang

| Sprint | Datum | Zustand |
|---|---|---|
| **Phase-1-Punkt 14B: Production-Vorbereitung Berlin** | 2026-07-26 | **Teilweise abgeschlossen — der zweite von zwei Blockern ist beseitigt, keine Production-Mutation.** Startprüfung **5 von 6** (nicht erfüllt: Production-Zugänge nur teilweise — Supabase ja, Vercel-Env nein). **Erreicht:** Schritt 5 der Aktivierungsreihenfolge (Abnahmeprofil) war der **einzige** der 9 Production-Schritte ohne Datei, Vorbedingung, Dry Run und Rollback — er ist jetzt **4 generierte SQL-Dateien** (anlegen + Rollback Stufe 0/1/2), fail-closed, idempotent, drift-gebunden, **36/36 gegen ein echtes PostgreSQL 16** bewiesen (u. a.: fremder Datensatz unter derselben Id bricht ab; zweites Landtagsmandat blockiert; Stufe 2 schützt erzeugte Daten gegen `ON DELETE CASCADE`; Endzustand zeilengenau der Ausgangszustand). Read-only **Dry Run gegen Production**: Schritt 1 **jetzt ausführbar** (4/4 Vor-, 5/5 Nachbedingungen, Treffer 1+1 Zeilen, Kontrollfragen 0). Neuer Backup-Umfang **`--scope=profil`** schließt die Lücke, dass `--scope=seed` die beiden Profiltabellen nicht abdeckt; **zwei frische Sicherungen** real erstellt (`pre-seed` 8/8 `49a5b92d…` — **byte-identisch** zur Sicherung von 16:47 UTC, und `pre-profil` 2/2 `0c514ace…`, beide `vollstaendig: true`). Belegt: **zwei** DB-seitige Not-Aus-Schalter (Profil deaktivieren · Wege auf `manual`) stoppen **jeder für sich** jeden Berliner Abruf, auch bei gesetztem Flag. **Neuer Betriebsbefund:** `/api/cron/crawl` läuft ins 300-s-Funktionslimit (3 × HTTP 504 in 7 Tagen) — das Abnahmeprofil wäre ein 7. Mandant an Sortierposition 3 und erzeugt 6 zusätzliche Google-Abrufe je Lauf; neues Abbruchkriterium 16. **Nicht erreicht:** `HELMUT_LANDESMODULE` bleibt auf allen 6 geprüften Kanälen weder lesbar noch setzbar noch rücksetzbar — **kein Workaround gebaut**, kleinste Betreiberaktion benannt (§20.3). **Nicht getan:** kein `insert`/`update`/`delete`, kein Flag, kein Profil, kein Crawl, keine Aktivierung, Brandenburg unberührt, Punkt 16/17 unberührt. Offline-Suite **157/157**, Browser-Smoke **32/32**, `berlin-abnahmeprofil-test` **78/78**, `backup-export-test` **48/48** (von 38), pgverify **36/36**. Branch `claude/helmut-production-berlin-prep-l0lfbg`, Commit `a476f21`, **PR #140** (nicht gemergt). Kanonisch: `betrieb/berlin-aktivierung.md` §20 |
| **Punkt 14 (2. Production-Anlauf): Berlin Stufe 1 in Production aktivieren und beweisen** | 2026-07-26 | **Blockiert — erneut keine Production-Mutation.** **11 von 14** Startbedingungen erfüllt. Nicht erfüllt: **(8)** `HELMUT_LANDESMODULE` ist weder lesbar noch setzbar noch rücksetzbar → **Rollback Ebene 0 nicht verfügbar**, Abbruchkriterium **14** greift vor jeder Mutation; **(7)** Production-Zugänge nur teilweise; **(10)** die Backup-*Grundlage* ist gültig (die drei gebundenen Tabellen sind seit 11:13 UTC unverändert), das Backup-*Artefakt* aus der Vorsitzung existiert nicht mehr. **Neuer, zweiter Blocker:** Production führt **0 Landtagsprofile** (8 Profile, alle `bundestag`) — seit 14A/V-2 aktiviert das Flag ohne berechtigtes Landtagsmandat **0** Berliner Wege; der Beweislauf wäre auch mit Flag ein No-Op. **Zwei Zugangsangaben korrigiert:** die Production-App ist **erreichbar** (über `web_fetch_vercel_url` **HTTP 401** statt Proxy-403, also unauthentifiziert statt unerreichbar; `GET`-only ohne Header → kein Crawl auslösbar), und ein `VERCEL_TOKEN` allein würde **nicht** genügen, weil `api.vercel.com` proxy-gesperrt ist. **Erreicht:** Ausgangszustand vollständig neu gemessen · alle **8** Dry-Run-Schritte grün, Kontrollfragen durchweg **0** (Brandenburg, Bund, Partei-/Fraktions-/Personenwege, fremde Pakete) · Brandenburg und Bund nachweislich unberührt · PR #132 als konkurrierender Gate-Name erkannt. **Nicht getan:** kein `insert`/`update`/`delete`, kein Flag, kein Profil, kein Backup, kein Crawl, keine Stufe 1, keine Stufe 2, kein Rollback (keiner nötig). Beobachtete erfolgreiche Berliner Production-Läufe: **0**. Offline-Suite **156/156**; Berlin 126/71/109, Mandatsgate 71, Punkt 16 **160/160**, Punkt 17 **128/128**, Seed-Drift grün. Kanonisch: `betrieb/berlin-aktivierung.md` §19 |
| **Phase-1-Punkt 16: Quellenfehler vollständig automatisch erkennen** | 2026-07-26 | **Teilweise abgeschlossen — Erkennung vollständig gebaut und getestet, Production lesend belegt, 7 Klassen nur testbelegt.** Befund **A-6 behoben**: `source_crawl_telemetry` (13 081 echte Laufzeilen) hatte **keinen Lesepfad**, während `retrieval_paths.last_success_at`/`last_error`/`error_streak` zu **0 von 163** befüllt sind — die Admin-Ansicht las genau die leeren Spalten und meldete **falsches Grün**. Neue zentrale, reine Klassifikation mit **14 Zustandsklassen** und **4 Handlungsstufen**, abgeleitet aus der echten Laufhistorie statt zweitgespeichert (**keine Migration, kein Production-Write**). Fünf belegte Fehlalarmbremsen: übersprungene Läufe und zentrale Drosselung sind **keine** Quellenfehler (1 736 bzw. **4 044** der 13 081 Zeilen), Leer/Veraltet brauchen **zusätzlich** eine überschrittene Lieferpause, ein Einzelausreißer wird nie hochgestuft, zu wenig Daten heißt `unbekannt`. **Production-Gegenprobe (read-only)** über 205 Quellen: 150 ohne Handlungsbedarf, 48 beobachten, 6 zeitnah, **1 akut**; **141 von 154** je gestörten Quellen hatten sich selbst erholt — ein naiver Alarm hätte 154 Meldungen erzeugt, 141 davon bereits erledigt. Deduplizierung gegen echte Daten belegt (**0** neue Meldungen bei unverändertem Zustand). `source-failure` **160/160** (neu), `admin-source-ui` **40/40** (von 20 erweitert), **Offline-Suite 153/153**, Browser-Smoke 32/32. **Keine Production-Mutation, kein Cron, kein Flag, keine Migration.** Berlin/Brandenburg unverändert (beide Pakete bleiben `unbestimmt`, keine Störung behauptet). Punkt 17 unberührt. Details unten. |
| **Punkt 14 (Production-Sprint): Berlin Stufe 1 aktivieren** | 2026-07-26 | **Blockiert — keine Production-Mutation.** 11 von 12 Startbedingungen erfüllt; Bedingung **10** (notwendige Production-Zugänge) **nicht**: `HELMUT_LANDESMODULE` ist aus einer Cloud-Sitzung weder lesbar noch setzbar (`VERCEL_TOKEN` nicht gesetzt, Vercel-MCP ohne Env-Werkzeug), die Production-App ist nicht erreichbar (`CONNECT` → 403). Damit wäre **Rollback Stufe 0 nicht verfügbar** gewesen → Abbruchkriterium 20 greift vor jeder Mutation. **Erreicht:** vollständiger Ausgangszustand gemessen · **Sicherung erstmals real erstellt** (8/8 Tabellen, `vollstaendig: true` — schließt Go-Kriterium 2 der Seed-Einspielung) · Dry Run gegen den Ist-Zustand bestätigt (**3/3/1/2** Zeilen, **0** Bund, **0** Brandenburg) · Übergabe §16.6. **Nicht getan:** kein `insert`/`update`/`delete`, kein Flag, kein Profil, kein Crawl, keine Stufe 2. Brandenburg unverändert. Details unten. |
| **Phase-1-Punkt 17: Echte Kostenmessung im Betrieb bestätigen** | 2026-07-26 | **Teilweise abgeschlossen** (Status nach unabhängigem adversarialem Review von PR #136 **von „erfolgreich abgeschlossen" herabgestuft**). **Was erfüllt ist:** Kosten sind **pro Lauf** und **pro Tag** mit read-only Production-Messung belegt (Beispiellauf `crawl-20260726160130-7bznw`: 147 Abrufwege, 940 neue Dokumente, 8 LLM-Aufrufe, **0,026805 USD**; Betriebstag im Mittel **0,1370 USD** über 7 volle Tage), zwei unabhängige Wege liefern identische Zahlen, unbekannte Kosten erscheinen nie als 0,00, und die Trennung global/direkt/nicht-zurechenbar ist gemessen (**79 % / 21 % / 0 %**). **Warum nicht erfolgreich abgeschlossen:** das Abnahmekriterium verlangt einen **vollständigen Production-Kostennachweis**; geliefert ist eine **Untergrenze auf unbelegter Preisbasis**. Die sechs Einschränkungen bestehen unverändert fort: ~16 % Logverlust (K-1) · Preise sind intern deklarierte Schätzwerte (K-2) · Nicht-LLM-Providerkosten ungemessen (K-6) · Gesamtbetrag nur Untergrenze · pro Mandant nur direkt zurechenbare Teilkosten (79 % bleiben global) · Ringpuffer 5 000 (K-7). Der Review fand zusätzlich **4 Code-Defekte im PR selbst**, alle behoben (siehe unten). `kostenmessung-test` **128/128**, `admin-overview` 104/104, Offline-Suite **153/153**, Browser-Smoke 32/32. **Keine Production-Mutation** — ausschließlich `select`. Details unten. |
| **Punkt 14 (2. Durchgang): Berlin fachlich neutralisieren, aktuell verifizieren, freigabereif machen** | 2026-07-26 | **Teilweise abgeschlossen — Aktivierungsreife für ein reduziertes Set, Production unverändert.** Neutralität ist jetzt eine **ausführbare Prüfung** über Code **und** gemessenen Datenbankbestand: Code neutral, Production **nicht** (Befund A-3 reproduziert), nach Block A neutral. Neuverifikation auf einem Runner mit offenem Egress hat **zwei Wege als veraltet entlarvt** (156 bzw. 41 Tage) — Aktivierungsset **6 → 4**. Pflichtklassen ehrlich neu gezählt: **4 eigenständig, 1 mitabgedeckt, 7 ohne Weg** (vorher „8 von 12 liefern"). Lastmodell gegen gemessene Production-Zahlen korrigiert (beide Terme der Alt-Rechnung waren falsch). Profilplan getestet, zwei Befunde (P-1, P-2). Aktivierung gestaffelt, Rollback gehärtet. **Empfehlung: Go mit Bedingungen** für das reduzierte Set; harter Blocker bleibt V1. Offline-Suite **152/152**, Browser-Smoke 32/32, `berlin-neutralitaet` 109/109 (neu), `berlin-aktivierung` 123/123. **Keine Production-Mutation.** Brandenburg unverändert und inaktiv. Details unten. |
| **Phase-1-Punkt 14: Berlin als laufende Versorgung aktivieren** | 2026-07-26 | **Teilweise abgeschlossen — Aktivierungsreife erreicht, Production unverändert.** Berlin ist bis unmittelbar vor die erste Production-Änderung vorbereitet: Aktivierungsplan, SQL, 3 Rollback-Stufen, Runbook und 123 ausführbare Prüfungen liegen vor. **Keine** Aktivierung, kein Flag, kein SQL ausgeführt, keine Zeile verändert. Zwei echte Sperrlücken behoben (globales statt landesscharfes Gate; `activation_mode='manual'` war wirkungslos). **Empfehlung: Go mit Bedingungen** — der harte Blocker ist die in der Datenbank offene Neutralisierung von `berlin-basis` (A-3). Offline-Suite 151/151, Browser-Smoke 32/32. Brandenburg unverändert und inaktiv. Details unten. |
| Punkt 13 — Abschlusskorrektur: Niedersachsen, nicht-anwendbar, Fraktionen | 2026-07-26 | **Erfolgreich abgeschlossen** — alle 8 Pakete abgeschlossen (7 vollständig + 1 mit belegten Ausnahmen, 0 teilweise, 0 blockiert). `regional-niedersachsen` hat eine benannte Basis aus 7 Wegen (5 Bestandsquellen + 2 amtliche), **vorbereitet und inaktiv, 0 zusätzliche Abrufe**. „Nicht anwendbar" ist gegen die amtliche Parlamentszusammensetzung überprüfbar. Fraktionssollmenge extern verankert — die Alt-Angabe „8 von 8" war fachlich falsch, richtig sind **5**. Offline-Suite 150/150. Keine Production-Änderung. Details unten. |
| Punkt 13 — Nachtrag: Ausschuss-Sollmenge extern verankern (23 → 24) | 2026-07-26 | **Erfolgreich abgeschlossen** — der 21. Bundestag hat 24 ständige Ausschüsse (Drucksache 21/150); der Katalog führte 23 und neun Bezeichnungen der 20. Wahlperiode. Fehlend war der Ausschuss für Wahlprüfung, Immunität und Geschäftsordnung. Kanonische Quelle korrigiert (nicht der Testwert), Sollmenge extern verankert, 36 neue Prüfungen mit 6 Negativkontrollen; zusätzlich eine Lücke im Seed-Rückweg behoben. Offline-Suite 149/149. Keine Production-Änderung. Details unten. |
| Phase-1-Punkt 13: Vollständigkeit jedes Quellenpakets prüfen | 2026-07-26 | **Erfolgreich abgeschlossen** — Abnahmekriterium erfüllt und belegt: alle 8 Pakete haben ein ausführbares fachliches Kriterium, 6 sind vollständig, 2 belegt teilweise vollständig (kein falsches Grün), 3 Lücken behoben. `paketvollstaendigkeit-test` 89/89, Offline-Suite 148/148, Seeds byte-identisch reproduzierbar. Keine Production-Änderung, Berlin/Brandenburg unverändert vorbereitet und inaktiv. Details unten. |
| Go-Kriterium 2 kontrolliert versuchen: Pre-Seed-Backup-Export | 2026-07-25 | **Blockiert** — `node scripts/backup-export.js --scope=seed` exakt wie angefordert ausgeführt; Abbruch vor jedem Netzwerkzugriff (Exit 2), da diese Agenten-Sitzung keine `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` und keine `.env.local` besitzt. **Kein** Production-Zugriff erfolgt. Betreiberentscheidung: Export läuft auf der Betreibermaschine mit echter `.env.local`, Manifest wird zurückgemeldet. Details unten. |
| Review + Merge von PR #125, danach Production-Ablauf bis vor den ersten Zugriff vorbereiten | 2026-07-25 | **Teilweise abgeschlossen** — PR #125 adversarial reviewt (3 Reviewer, 20 belegte Befunde, alle behoben) und als `0d6d867` gemergt (CI auf `main` grün, Vercel-Production `READY`). Der Production-Ablauf ist vollständig vorbereitet; **kein Production-Zugriff erfolgt, keine Seeds ausgeführt**. Wartet auf die Betreiberfreigabe für den Pre-Seed-Export. Details unten. |
| Merge #123 + Sicherung, gezielter Restore und Entscheidungsreife für die Seed-Einspielung | 2026-07-25 | **Teilweise abgeschlossen** — #123 gemergt (`bed7f53`); Backup- und Restore-Werkzeug gebaut und isoliert getestet (33/33 lokal, 31/31 in CI, Suite 145/145). Die Seed-Ausführung bleibt **blockiert**: die Sicherung ist noch nicht gelaufen und die Reaktivierung der 6 Bundeswege ist nicht freigegeben. Details unten. |
| Phase-1-Block: Quellenpakete inventarisieren + automatische Paketzuweisung beweisen | 2026-07-25 | **Erfolgreich abgeschlossen** — beide Abnahmekriterien erfüllt und belegt; 145/145 Offline-Suiten grün; als PR #124 gemergt (`118e90c`), CI auf `main` grün, Vercel-Production `READY`. Details unten. |
| Merge PR #118 + Vorbereitung des Quellen-Seed-Sprints | 2026-07-25 | **Teilweise abgeschlossen** — #118 gemergt (`61767a9`), CI grün, Deployment `READY`. Die Seed-Einspielung ist vollständig entscheidungsreif vorbereitet, aber **blockiert** (fehlende Sicherung). Details unten. |
| Merge #122 + adversarialer Review von PR #118 (Quellenarchitektur-Remediation) | 2026-07-25 | **Erfolgreich abgeschlossen** — #122 gemergt (`54fe370`); #118 reviewt, 3 belegte Defekte behoben. |
| Merge von PR #105 — Anker-Recovery-Pfad in Production stillgelegt | 2026-07-25 | **Erfolgreich abgeschlossen** — gemergt als `43e9e35`; Stilllegung auf `main` verifiziert. |
| Recovery-Pfad-Review + Zusammenführung von PR #105 auf die kanonische Kontextstruktur | 2026-07-25 | **Erfolgreich abgeschlossen** |
| Kontextstruktur für Claude Code (`CLAUDE.md` + Einstiegsschicht) | 2026-07-25 | **Erfolgreich abgeschlossen** — reine Dokumentation, gemergt als PR #119 (`c6a3d40`). |

**Sprint „Phase-1-Punkt 16: Quellenfehler vollständig automatisch erkennen" — Nachweis**

- **Auftrag:** leere, blockierte, langsame und fehlerhafte Quellen zuverlässig erkennen, speichern,
  verständlich klassifizieren und melden — ohne Production-Mutation. **Ergebnis: Erkennung gebaut,
  getestet und in Production lesend gegengeprüft; 7 von 14 Klassen sind mangels realer Vorfälle nur
  testbelegt.**
- **Startprüfung bestanden:** Arbeitsbaum sauber, lokaler Stand == `origin/main` == `93006e8`,
  Pflichtlektüre in der vorgeschriebenen Reihenfolge gelesen.
- **Der eigentliche Befund (A-6), read-only nachgemessen am 2026-07-26:** `source_crawl_telemetry`
  trägt **13 081 echte Laufzeilen** (2026-07-16 bis 2026-07-26, 105 Läufe, 182 verschiedene Quellen) —
  im Code gab es dafür aber **keinen einzigen Lesepfad**. Gleichzeitig sind
  `retrieval_paths.last_success_at`, `last_error` und `error_streak` zu **0 von 163** befüllt. Die
  Admin-Ansicht „Problematische Abrufwege" las genau diese drei leeren Spalten. Ergebnis war
  **falsches Grün** über einer Datenbank mit 215 belegten Timeouts, 47 Rate-Limit-Treffern und
  4 044 Drosselungsabbrüchen.
- **Architekturentscheidung: `source_crawl_telemetry` ist die führende Wahrheit.** Der Zustand wird
  daraus **abgeleitet**, nicht zweitgespeichert. Ein Rückschreiben nach `retrieval_paths` wäre ein
  Production-Write je Crawl **und** eine redundante Doppelspeicherung. **Folge: keine Migration,
  kein Schemawechsel, kein Production-Write** — und damit keine Berührungsfläche mit Punkt 14 oder 17.
- **14 Zustandsklassen, 4 Handlungsstufen.** Klassen: `ok` · `leer` · `veraltet` · `blockiert` ·
  `gedrosselt` · `langsam` · `parserfehler` · `abruffehler` · `instabil` · `erholt` ·
  `nie_erfolgreich` · `inaktiv` · `manuell` · `unbekannt`. Stufen: `keine` · `beobachten` ·
  `zeitnah_pruefen` · `akut`. Jeder Befund trägt Kurzbezeichnung, Klartext-Erklärung, Problembeginn,
  letzten Erfolg, letzte Lieferung, Wiederholungszahl, Ursache, Erholungsstatus und Auswirkung.
- **Fünf Fehlalarmbremsen — jede an Production-Zahlen begründet:**
  1. **Übersprungene Läufe sind keine Versuche** (`skipped-shared`: **1 736** der 13 081 Zeilen) —
     sie erreichten die Quelle nie, begründen keine Fehlerserie und unterbrechen keine.
  2. **Zentrale Drosselung ist kein Quellendefekt** (`circuit-open`: **4 044** Zeilen, der mit
     Abstand häufigste „Fehler") — eigene Klasse `gedrosselt`, Stufe `beobachten`, gehört zu OP-15.
     Ohne diese Trennung wäre der Bericht dauerhaft rot.
  3. **Nie allein aus „0 Dokumente".** Leer und veraltet verlangen **zusätzlich** eine überschrittene
     Lieferpause. Bei 5 Crawl-Vollrunden je Tag erzeugt eine wöchentliche Quelle zwangsläufig
     dutzende Leerläufe — eine reine Zählschwelle hätte genau die seltenen Quellen als kaputt gemeldet.
  4. **Ein Einzelausreißer ist keine Störung** — nie über `beobachten`, auch bei einer Pflichtquelle,
     und er zählt für das Paket weiterhin als tragend.
  5. **Zu wenig Daten heißt `unbekannt`** (unter 3 echten Versuchen), unklare Ursache heißt
     `abruffehler` statt erfundener Präzision.
- **Erwarteter Rhythmus, ehrlich gelöst:** `expected_frequency` ist in Production bei **allen 163**
  Wegen `NULL`. Die Erwartung kommt deshalb aus dem **beobachteten** Median-Lieferabstand × 3
  (begrenzt auf 3…60 Tage, ab 4 Lieferungen), sonst aus einem Standardwert. Deterministisch und
  testbar — kein Anomalie-Lernverfahren.
- **Erholungsregel (§13 des Auftrags):** Erholung wird erst anerkannt, wenn nach dem letzten Fehler
  wieder **echter Inhalt** geliefert wurde. Eine rein technische 200-Antwort ohne Inhalt genügt
  **nicht** und fällt weiter zu `leer`/`veraltet` durch. Bei ≥ 2 getrennten Ausfällen bleibt die
  Quelle `instabil` — Erholung überschreibt Instabilität nicht.
- **Production-Gegenprobe (read-only, ausschließlich `select`), 2026-07-26.** Eingang: 13 081
  Telemetriezeilen · 163 Abrufwege · 9 Pakete · 165 Zuordnungen. Klassifiziert wurden **205 Quellen**
  (163 Katalogwege + 42 Laufzeit-Personenquellen aus Profilen):

  | Klasse | n | | Stufe | n |
  |---|---:|---|---|---:|
  | `erholt` | 110 | | `keine` | 150 |
  | `unbekannt` | 23 | | `beobachten` | 48 |
  | `ok` | 22 | | `zeitnah_pruefen` | 6 |
  | `manuell` | 18 | | `akut` | **1** |
  | `gedrosselt` | 13 | | | |
  | `instabil` | 12 | | | |
  | `langsam` | 6 | | | |
  | `leer` | 1 | | | |

  **Der wichtigste einzelne Beleg:** von 154 je gestörten Quellen hatten sich **141 selbst erholt**.
  Ein System, das jeden Fehler meldet, hätte 154 Alarme erzeugt — 141 davon zum Meldezeitpunkt
  bereits erledigt. Genau deshalb ist die Erholungsregel keine Kosmetik.
  Weiter belegt: `manuell` **18** deckt sich exakt mit den 18 `activation_mode='manual'`-Wegen ·
  `unbekannt` **23** sind exakt die 23 Katalogwege ohne jede Telemetrie (nie abgerufen, ehrlich
  „keine Aussage" statt „defekt") · der eine `akut`-Fall ist ein Personenpaket mit genau **einem**
  Abrufweg, 21 getrennten Ausfällen und ohne Alternative · **Deduplizierung belegt: 0 neue Meldungen**,
  wenn derselbe Bericht zweimal gegen dieselben Production-Daten läuft.
- **Ein echter Klassifikationsfehler, den erst die Production-Gegenprobe zeigte:** `langsam` entsteht
  sowohl aus reiner Laufzeit (Quelle liefert weiter) als auch aus einer **Timeout-Serie** (Quelle
  liefert nichts). Beide landeten zunächst auf `beobachten` — 6 Laufzeitquellen mit bis zu 13
  aufeinanderfolgenden Timeouts wären damit untergegangen. Behoben: die Stufe hängt jetzt an der
  Ursache, nicht am Klassennamen; die 6 Fälle stehen korrekt auf `zeitnah_pruefen`. Als
  Regressionstest fixiert.
- **Politische Versorgung statt technischem Alarm.** Paketlage: `versorgt` · `teilweise_geschwaecht` ·
  `ohne_funktionierenden_weg` · `leer` · `unbestimmt`. Liefert ein anderer Weg desselben Pakets, wird
  **kein** Versorgungsausfall behauptet und die Stufe heruntergesetzt. Mandatswirkung nur mit
  übergebenen Profilen über den bestehenden Resolver; ohne sie meldet der Bericht ausdrücklich
  `bestimmbar: false` **mit Begründung** plus Strukturhinweis bei Pflicht-Basispaketen — nie geraten.
- **Tests:** `source-failure` **160/160** (neu; deckt alle 26 geforderten Fälle ab, davon 9 reine
  Fehlalarm-Gegenproben) · `admin-source-ui` **40/40** (von 20 erweitert, inkl. ehrlichem
  Leerzustand ohne Telemetrie) · **Offline-Suite 153/153** · **Browser-Smoke 32/32**.
- **Nicht getan (bewusst):** keine Production-Mutation — ausschließlich `select`-Abfragen · keine
  Migration · kein Flag gesetzt · keine Cron-Änderung · keine Quelle/kein Paket verändert · kein
  Rückschreiben nach `retrieval_paths` · **keine externe Benachrichtigungsplattform** (nur der
  bestehende Admin-Bereich) · keine künstlichen Fehler erzeugt · Berlin/Brandenburg unverändert.
- **Verbleibende Grenzen, ehrlich:** `parserfehler`, `nie_erfolgreich`, `veraltet`, `blockiert` als
  laufende Serie, HTTP-4xx-Serie, Rückfall nach Erholung und die Mandatswirkung mit Profilen sind in
  Production **nie aufgetreten** und daher **ausschließlich testbelegt** — ein echter Beleg entsteht
  erst beim nächsten realen Vorfall (künstliche Fehler sind verboten) · die doppelten Cron-Läufe
  (A-7/OP-15) verzerren die Rohzählung weiterhin, `gedrosselt` fängt das nur ab · `retrieval_paths`
  bleibt unbefüllt, die konfigurierte und die beobachtete Sicht stehen als solche beschriftet
  nebeneinander.
- **Betriebsdokumentation:** [`betrieb/quellenstoerungen.md`](betrieb/quellenstoerungen.md)
  (Zustandsklassen, Schwellen, Handlungsstufen, Erholungslogik, Fehlalarmvermeidung,
  Production-Nachweis, Grenzen, sichere spätere Aktivierung).
**Sprint „Punkt 14 (Production-Sprint): Berlin Stufe 1 aktivieren" — Nachweis**

- **Auftrag:** die vorbereitete erste Berliner Aktivierungsstufe in Production ausführen und den
  ersten realen Crawl belegen. **Ergebnis: blockiert vor der ersten Mutation.**
- **Startprüfung: 11 von 12 erfüllt.** #134 gemergt (`merged: true`, 16:38:41 UTC), `e2be0a4` und
  `5cfce6c` Vorfahren von `main`, alle **6** Checks `success` (beide Pflicht-Checks grün), lokal ==
  `origin/main` == `93006e8`, Arbeitsbaum sauber, 0 Commits nach #134, V2-Verifikation **0 Tage** alt.
  Gemessen und bestätigt: Brandenburg `prepared` + 9/9 Wege `manual` + 0 BB-Profile · keine laufende
  Berliner Aktivierung (10/10 BE-Wege `manual`, **0 Berliner Telemetriezeilen jemals**) · keine
  parallele Änderung (letzte Konfigänderung 11:13:10 UTC, seither unverändert).
- **Die fehlende Bedingung (10):** Supabase ist erreichbar (Egress HTTP 200) — Messung, Backup und
  SQL wären möglich. **Nicht** erreichbar: Vercel-Env (`VERCEL_TOKEN` nicht gesetzt; der
  Vercel-MCP-Server stellt **kein** Werkzeug für Environment-Variablen bereit) und die Production-App
  (`CONNECT` → **403**, `CRON_SECRET` nicht gesetzt). `HELMUT_LANDESMODULE` ist damit weder **lesbar**
  noch **setzbar**, und ein Crawl nicht auslösbar.
- **Warum das die Mutation ausschließt** (und nicht nur den Crawl): der schnellste Rückweg —
  Rollback **Stufe 0**, Flag leeren **ohne** DB-Schreibzugriff — setzt genau diesen Zugang voraus.
  Wer das Flag nicht setzen kann, kann es auch nicht leeren. Abbruchkriterium **20** („Rollback ist
  nicht unmittelbar ausführbar") wäre ab der ersten Mutation dauerhaft erfüllt gewesen. Zusätzlich
  ist Riegel 1 nicht messbar, und nach Block A + Profil + Stufe 1 stünde nur noch eine einzelne,
  von hier aus unsichtbare Env-Variable zwischen dem sicheren Zustand und einem unbeobachteten
  Berliner Crawl. Die bindende Reihenfolge „Flag **vor** Stufe 2" wäre verletzt.
- **Trotzdem erreicht — die Sicherung.** `node scripts/backup-export.js --scope=seed` lief zum
  **ersten Mal real gegen Production** (Exit 0): **8/8 Tabellen**, `fehler: []`,
  **`vollstaendig: true`**, `pruefsummeGesamt` `49a5b92d…cc0ee`, gebunden an `mainCommit 93006e8`;
  163 `retrieval_paths`, 165 `package_paths`, 9 `source_packages`. Verzeichnis `backups/…` ist
  gitignored — Production-Daten kommen nicht ins Repo. **Damit ist Go-Kriterium 2 der
  Quellen-Seed-Einspielung erfüllt**, das seit 2026-07-25 offen war. Der Fehlschlag von damals lag
  an fehlenden Zugangsdaten, nicht am Werkzeug.
- **Dry Run gegen den gemessenen Ist-Zustand** (nicht gegen die Doku): A1 **3** · A2 **3** ·
  B1 **1** · B2.1 **2** Zeilen — exakt der Plan. Kontrollfragen alle **0**: kein Bundesweg, kein
  Brandenburg-Weg, keine `pkg-brandenburg-basis`-Zeile betroffen. `die-linke-berlin` trägt heute
  **0** Wege, daher legt A1 genau 3 Zeilen an und Rollback Stufe 2 bleibt zeilengenau umkehrbar.
- **Ausgangszustand (16:45–16:52 UTC), vollständig in §9 und im Runbook §16.2.** Kernwerte:
  Bundesversorgung gesund (letzter Vollcrawl 145/147 `ok`, 0 Fehler, 33 s) · Invariante B3 erfüllt
  (147 = 147) · Locks 3 Zeilen, **alle abgelaufen** · Pending unverändert **50** · LLM heute 34/100 ·
  Rohdokumente ≈ 283/Tag · KO ≈ 39/Tag · Originalverweis 99,5 % · Berlin bei **null**.
- **Unabhängige Vorprüfung (8 Prüfer, je Thema ein Gegenprüfer) — vier belegte Befunde**, alle
  selbst am Code nachgeprüft, in `betrieb/berlin-aktivierung.md` §17:
  **V-1 (kritisch)** die Staffelung ist im SQL **nicht erzwungen** — B1, B2.1 und B2.2 stehen in
  **einer** Transaktion; wer Block B am Stück ausführt, schaltet auch die zwei Google-Wege scharf,
  auf deren Verzögerung die gesamte Lastbegründung beruht ·
  **V-2** das Abnahmeprofil ist **kein mandantenbezogener Schalter**: `loadRelationalSharedSources`
  baut **einen globalen** Plan ohne Profilparameter, der in die Quellenliste **jedes** Profils
  gemischt wird — der Beweislauf fände im geteilten Korpus statt, nicht in einer isolierten Testspur ·
  **V-3** Rollback **Stufe 0 wirkt nur**, wenn die Freigabe über die **Vercel-Env** kam: ein leerer
  Env-Wert gilt als nicht gesetzt und fällt auf `helmut-flags.json` zurück ·
  **V-4** „öffnet ausschließlich Berlin" ist zu stark — der zweiländrige `rp-rbb24-politik` läuft mit
  (bekannte, in §13 akzeptierte Nebenwirkung, **keine** Brandenburg-Aktivierung).
  **Bestätigt** wurden: fail-closed Default, kein Sammel-Schlüsselwort, Gate als Regel 1 vor allen
  anderen Prüfungen, `manual` als echte Sperre, vollständige Rollback-Abdeckung ohne jeden
  `rp-bb-*`/`brandenburg-*`-Bezug, `Fraktionslos` ohne Parteibindung.
- **Nebenbefund, entscheidungsrelevant:** der offene **PR #132** (Brandenburg) führt einen
  konkurrierenden Gate-Namen `HELMUT_LANDESMODUL_FREIGABE` ein, während `main` seit #133/#134
  `HELMUT_LANDESMODULE` verwendet. `main` ist maßgeblich und #132 ist nicht gemergt — vor einem Merge
  von #132 muss entschieden werden, welcher Name gilt, sonst entstehen zwei Landesmodul-Gates.
- **Nicht getan (bewusst):** kein `insert`/`update`/`delete` · kein Flag gesetzt · kein Profil
  angelegt · kein SQL-Block ausgeführt · kein Crawl ausgelöst · **keine Stufe 2** · keine Migration ·
  keine Seed-Einspielung · keine Cron-/Lock-/Scheduler-/Secret-Änderung · Brandenburg, Bund,
  Niedersachsen und alle Bestandsmandanten unverändert · kein Rollback nötig (nichts zu rollen).
**Sprint „Phase-1-Punkt 17: Echte Kostenmessung im Betrieb bestätigen" — Nachweis**

- **Auftrag:** belegen, was ein Lauf und was ein Betriebstag kostet, welche Prozesse und
  Anbieter die Kosten treiben, und welche Kosten später einem Mandanten zugerechnet werden
  können — ohne Production-Mutation. **Ergebnis: teilweise erfüllt.** Kanonische Stelle:
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md).
- **Statusbewertung (adversarialer Review, 2026-07-26).** Der Sprint war zunächst als
  *erfolgreich abgeschlossen* geführt. Das war **zu großzügig**: das Abnahmekriterium
  verlangt einen vollständigen Production-Kostennachweis, und Schätzwerte sind kein
  solcher. Belegt sind Kosten je Lauf und je Tag als **Untergrenze** auf **unbelegter**
  Preisbasis; die Kosten je Mandant decken nur die 21 % direkt zurechenbaren Aufrufe ab.
  Korrekter Zustand: **teilweise abgeschlossen**. Die Messung selbst ist belastbar und
  ehrlich — unvollständig ist die *Datengrundlage*, nicht die Auswertung.
- **Vier Code-Defekte, die der Review im PR selbst fand — alle behoben und mutationsgeprüft:**
  1. **R-1 (hoch):** Der dedizierte **Understanding-Cron** (`/api/cron/understanding`,
     ein Hauptkostenpfad) reichte die Laufkennung **nicht** an den Kostenlog durch,
     obwohl sie im Scope lag und für `recordProcessRun` benutzt wurde. Die zentrale
     Zusage des PR („Laufkennung erreicht den Kostenlog") galt damit nur für 2 der
     Aufrufstellen. Behoben; ein **Quelltext-Riegel** verhindert den Rückfall.
  2. **R-2 (mittel):** Der neu protokollierte Diagnoseaufruf `pipeline-probe` zählte als
     *billable* und verbrauchte dadurch **Budget-Kopfraum, den er nie reservierte** —
     eine ungewollte Verhaltensänderung gegenüber `main`, die im Extremfall echte
     Fachaufrufe verdrängt hätte. Zusätzlich verfälschte er den Reservierungsabgleich,
     also genau den Messbefund K-1. Jetzt aus dem Gate **und** aus dem Abgleich
     ausgenommen; seine **Kosten** bleiben vollständig in der Kostenwahrheit.
  3. **R-3 (mittel):** Derselbe Diagnosepfad wurde als `nicht-zurechenbar` geführt und
     täuschte damit eine **Mandanten-Messlücke vor, die es nicht gibt**. Diagnose ist
     geteilte Infrastruktur → `global`.
  4. **R-4 (niedrig, latent):** `getRunCostReport` konnte denselben Aufruf **zwei
     Läufen** zurechnen, wenn sich Laufzeitfenster überlappen (heute durch den globalen
     Understanding-Lock 0 Fälle bei 51 Läufen, konstruktiv aber möglich). Zusätzlich
     galt ein Eintrag **ohne Id** dauerhaft als unzugeordnet. Beides behoben; die
     exakte Zuordnung per Laufkennung wird dabei nie von einem Zeitfenster verdrängt.
- **Branch/Commit/PR:** `claude/helmut-cost-measurement-4ietbr` · **PR #136**, auf
  `4aa15de` rebased (Basis enthält Punkt 16 und den Berliner Production-Sprint)
  (offen, wartet auf Review und Betreiberfreigabe — nicht selbst gemergt).
  Geänderte Dateien: `lib/helmut/cost-model.js` (neu) · `lib/helmut/storage.js` ·
  `lib/helmut/understanding.js` · `lib/helmut/scheduler.js` · `server.js` · `client.js` ·
  `scripts/kostenmessung-nachweis.js` (neu) · `scripts/kostenmessung-test.js` (neu) ·
  `scripts/admin-overview-test.js` · `docs/betrieb/kostenmessung.md` (neu) ·
  `docs/betrieb/env-inventar.md` · `docs/roadmap/phase_1_checkliste.md` · diese Datei.
- **Startprüfung (bei Sprintbeginn):** Arbeitsbaum sauber, Stand == `origin/main` ==
  `93006e8` (Merge #134). **Punkt 16 war zu diesem Zeitpunkt nicht gemergt** (Checkliste
  ⏳, Befund A-6 offen, kein Branch, kein PR, kein Commit). Der Betreiber hat das Git-Gate
  nach Vorlage dieses Befunds ausdrücklich freigegeben, weil damit **keine**
  Punkt-16-Telemetriearbeit existierte, die überschrieben werden konnte.
  `source_crawl_telemetry` und die Pfad-Statusmaschine wurden deshalb **bewusst nicht
  angefasst**; der Berlin-Sprint blieb unverändert.
- **Nachtrag 2026-07-26: Punkt 16 ist inzwischen gemergt** (PR #137, `4aa15de`), ebenso
  der Berliner Production-Sprint (PR #135). Der Punkt-17-Branch wurde auf diesen Stand
  **rebased**; die Zusage von oben hat gehalten und ist nachgeprüft:
  `lib/helmut/quellenarchitektur/`, `scripts/source-failure-test.js`,
  `docs/betrieb/quellenstoerungen.md`, `scripts/admin-source-ui-test.js`, `supabase/`,
  `vercel.json` und `helmut-flags.json` haben gegenüber `main` **0 Zeilen Diff**.
  Punkt 16 wurde an **einer** Stelle textlich berührt — der gemeinsamen
  `require("./lib/helmut/storage")`-Importzeile in `server.js`, an die beide Sprints
  angehängt haben. Aufgelöst als **Vereinigung** (79 Namen, keine Doublette):
  `listSourceCrawlTelemetry` aus Punkt 16 **und** `getRunCostReport`,
  `llmPriceProvenance`, `recordLlmUsage` aus Punkt 17. `source-failure-test` 160/160
  nach dem Rebase unverändert grün.
- **Zentraler Befund — die Kostenquelle war nicht die, die die Doku annahm.** Die
  relationale Tabelle `llm_usage` hat in Production **0 Zeilen**; die tatsächliche
  Kosten-/Auditquelle ist der `llmUsage`-Ring im Auth-Store-Blob (2 493 Einträge). Der
  Alt-Beleg in der Phase-1-Checkliste („Tages-/Laufkosten über `llm_usage`") war damit
  sachlich falsch.
- **Kosten je Lauf waren nicht messbar, nur rekonstruierbar.** `runId` war in **0 von
  1 290** Einträgen gesetzt — obwohl `source_crawl_telemetry.run_id` und
  `processRuns.runId` dieselbe Kennung seit jeher tragen. Der Sprint reicht die Kennung
  jetzt vom Scheduler bis in den Kostenlog durch; der Altbestand bleibt über das
  Zeitfenster rekonstruierbar und wird **als rekonstruiert gekennzeichnet** (0 mehrdeutige
  Zuordnungen bei 337 von 611 eindeutig zuordenbaren Alteinträgen).
- **Der ehrliche Kern:** `lib/helmut/cost-model.js` (rein, ohne I/O) trennt
  `gemessen` / `kosten-unbekannt` / `kein-provideraufruf` und
  `global` / `direkt` / `nicht-zurechenbar`. Die Altsummen rechneten einen als
  `"unknown"` protokollierten Betrag still als **0,00** — genau das ist jetzt
  ausgeschlossen. `0,00` erscheint nur noch, wo nachweislich **kein** Provideraufruf
  stattfand (1 277 von 2 493 Einträgen — abgewiesene und übersprungene Aufrufe).
- **Kostenwahrheit statt Scheingenauigkeit.** Die Preistabelle ist im Code selbst als
  „Schaetzwerte" deklariert, ohne Quelle und ohne Stand. **Kein Preis wurde geändert oder
  erfunden** (Preisrecherche war ausgeschlossen); stattdessen trägt jede Kostenangabe ihre
  Herkunft mit (`llmPriceProvenance()`), und der Betreiber belegt die Basis über
  `HELMUT_LLM_PRICE_SOURCE`/`HELMUT_LLM_PRICE_ASOF`.
- **Gemessene Kostenobergrenze, ehrlich abgegrenzt.** Der Deckel ist atomar und
  fail-closed und hat real gegriffen (2026-07-20: Zähler 100/100, **34** Abweisungen
  `daily-llm-budget-reached` + **4** über die Understanding-Reserve, alle ohne Kosten).
  Er **zählt aber Aufrufe, kein Geld**; Reservierungen werden bewusst nie freigegeben
  (misst also Reservierungen, keine bestätigten Kosten); der Per-Mandant-Deckel ist AUS
  (OP-03); und **alle Nicht-LLM-Kosten liegen außerhalb** — Supabase, Vercel,
  Crawl-Volumen, Push und DIP sind ungemessen und ungedeckelt (offene Kostenexposition).
- **Sicherheitsbefund behoben:** `/api/debug/pipeline-probe` sendete einen echten,
  token-verbrauchenden Azure-Aufruf **ohne** Reservierung **und ohne** Kostenlog — die
  einzige Stelle mit vollständig unsichtbaren Kosten. Der Aufruf wird jetzt als
  `callType: "pipeline-probe"` protokolliert; die Reservierung bleibt bewusst aus (eine
  Diagnose muss gerade bei erschöpftem Budget laufen — dieselbe Begründung wie beim
  `budgetExempt`-Pfad des KO-Backfills). Die Route ist secret-gated und auf 20 Aufrufe
  je 15 min limitiert; der volle Antwort-Body wird weiterhin **nicht** persistiert.
- **Betriebsnachweis, zweifach gedeckt.** Dieselben Zahlen entstehen unabhängig über
  read-only SQL gegen Production **und** über `scripts/kostenmessung-nachweis.js`
  (0,075587 / 0,125336 / 0,149161 USD für den 26./25./24.07.). Das Skript läuft live
  (Secrets nur aus `process.env`, Abbruch mit Exit 2 **vor** jedem Netzzugriff) oder
  offline gegen einen Auszug. Der verwendete Produktionsauszug wurde pseudonymisiert und
  **nicht** ins Repository übernommen.
- **Tests:** `kostenmessung-test` **128/128** (neu; 24 Prüfgruppen, u. a. kein falsches
  0,00 · Doppelzählung · Retry als echter Zusatzverbrauch · parallele Einträge ·
  Reservierungsabgleich in beide Richtungen · fehlende Preise · Währung · abgebrochene
  Läufe · Preisherkunft · Diagnose ohne Budgetwirkung · überlappende Laufzeitfenster ·
  Quelltext-Riegel für die Laufkennung) · `admin-overview` **104/104** (vorher 86) ·
  **Offline-Suite 153/153** (vorher 152/152) · **Browser-Smoke 32/32**.
  Die drei Review-Korrekturen sind **mutationsgeprüft**: jede der drei gezielten
  Rückmutationen (Doppelzähl-Sperre entfernt · Diagnose wieder budgetwirksam ·
  Laufkennung im Cron entfernt) wurde von der Suite erkannt.
  Zwei eigene Defekte fanden die Tests bereits vor dem ersten Commit
  (`Number(null) === 0` ließ einen fehlenden Zähler als „deckungsgleich" erscheinen;
  ein `= {}`-Default griff bei `null` nicht) — beide behoben.
- **Nicht getan (bewusst):** keine Production-Mutation · keine Migration · kein Flag ·
  kein Cron · kein Secret · keine Quelle, kein Paket, kein Abrufweg · **kein zweites
  Abrechnungssystem** (die vorhandene Telemetrie wurde erweitert, keine neue Tabelle) ·
  **keine Verteilung globaler Kosten** auf Mandanten · **keine Preisrecherche** und keine
  aus dem Gedächtnis gesetzten Preise · Punkt-16-Gebiet unberührt.
- **Verbleibende Grenzen, ehrlich:** die bekannten Kosten sind wegen K-1 eine
  **Untergrenze** · die Euro-Größe ist wegen K-2 eine berechnete, keine belegte ·
  zwischengespeicherte und Reasoning-Tokens werden nicht gelesen (K-3) · Azure und OpenAI
  sind im Log nicht unterscheidbar (K-5) · **Kosten je Mandant bleiben bis OP-03 offen**.

**Sprint „Punkt 14 (2. Durchgang): Berlin fachlich neutralisieren, aktuell verifizieren" — Nachweis**

- **Auftrag:** die offenen Bedingungen des letzten Go-/No-Go-Berichts belastbar erfüllen oder
  objektiv als nicht erfüllbar dokumentieren — **ohne** Production-Aktivierung. **Ergebnis: erfüllt
  für V2, V3, Last und Neutralitätsnachweis; V1 bleibt objektiv offen** (Production-Mutation).
- **Startprüfung bestanden:** PR #133 gemergt (`merged: true`, 15:35 UTC), lokaler Stand ==
  `origin/main` == `299470a`, Arbeitsbaum sauber, `2c77114` Vorfahre von `main`, beide
  Pflichtchecks von #133 grün.
- **Phase 1 — Neutralität ist jetzt ausführbar, nicht behauptet.** `seeds/berlin-neutralitaet.js`
  prüft einen beliebigen Bestand; **derselbe** Prüfer läuft über das Code-Abbild und über den
  gemessenen Datenbankbestand. Ergebnis: Code **neutral** (0 Verstöße, 10 Zuordnungen eingestuft) ·
  Production-Ist **nicht neutral**, 3 benannte Verstöße (`rp-be-partei_pilot`,
  `rp-be-fraktion_pilot`, `rp-be-person_pilot` am `is_base`-Paket) · **nach Block A neutral** — die
  Umhängung genügt und nichts sonst. Erkennung über **zwei unabhängige Merkmale** (Herausgebertyp
  *und* Pflichtklasse), damit eine falsch gepflegte Spalte die Prüfung nicht umgeht. Alle zehn Wege
  sind einer der acht Kategorien zugeordnet; **keiner** blieb `unklar`.
- **Phase 2 — die entscheidende Entdeckung: zwei Wege sind veraltet.** Die Neuverifikation lief auf
  einem Actions-Runner mit offenem Egress (die Agenten-Sitzung selbst hat keinen, `CONNECT` → 403).
  Dafür wurde `sprint9b-verify.yml` um eine Eingrenzung `S9B_ONLY` erweitert, damit die Prüfung eng
  begrenzt laufen kann statt über alle 24 Wege. **Run 30208901908** (10/10, Kontroll-Abruf 200/200)
  und **Run 30208997672** (Gegenprobe, identisch):

  | Weg | HTTP | jüngstes Item | Folge |
  |---|:--:|:--:|---|
  | `rp-be-landesregierung` · `rp-be-regionale_leitmedien` · `rp-rbb24-politik` | 200 | **0 Tage** | aktivieren |
  | `rp-be-staatskanzlei` | 200 | **14 Tage** | aktivieren, unter Beobachtung |
  | `rp-be-landesfraktionen` | 200 | **41 Tage** | **gesperrt** |
  | `rp-be-landesparlament` (kritisch) | 200 | **156 Tage** | **gesperrt** |

  `rp-be-landesparlament` antwortet sauber und parst 20 Items — Telemetrie hätte ihn dauerhaft als
  `ok` gemeldet. Neues **Frischegate** (≤ 7 frisch · ≤ 30 Beobachtung · darüber veraltet) entscheidet
  das jetzt ausführbar. **Aktivierungsset 6 → 4.**
- **Pflichtklassen ehrlich neu gezählt.** Die alte Zählung kannte nur „liefert/liefert nicht" und
  zählte auch Klassen mit, die bloß als Nebenprodukt einer fremden Suchanfrage mitlaufen. Neu drei
  Zustände: **4 eigenständig** (landesregierung, staatskanzlei, regionale_leitmedien,
  oer_landesberichterstattung) · **1 mitabgedeckt** (ministerien) · **7 ohne liefernden Weg**.
  **Berlin startet damit ohne jede amtliche parlamentarische Quelle** — die größte fachliche Lücke,
  benannt statt kaschiert. Zum Vergleich: das alte 6er-Set war real 6 eigenständig + 2 mitabgedeckt,
  die Zusage „8 von 12 liefern" verdeckte also zwei nur formal erfüllte Klassen.
- **Phase 3 — Profilweg, zwei Befunde, kein Profil angelegt.**
  **P-1:** die V3-Zählabfrage des Runbooks belegt keine Aktivierungsberechtigung. Sie zählt Zeilen;
  aktivierungsberechtigt ist ein Profil erst nach `validateProfile`, und die liest die **gemappte**
  Form. Eine rohe `mandate_profiles`-Zeile wird mitgezählt, ist aber `nicht_bereit` und trägt **0**
  zur Referenzzählung bei — `berlin-basis` bliebe **still inaktiv**, obwohl die Prüfung 1 meldet.
  Geschärfte Abfrage ergänzt. **P-2:** ein Berliner Profil braucht **zwei** Zeilen (`profiles` +
  `mandate_profiles`); ohne die erste ist `impact.kannRadar` false. Das Abnahmeprofil ist als
  **Testmandat** benannt und trägt `Fraktionslos` — keine reale Person, keine Parteibindung.
  Rückweg beginnt mit Deaktivieren, nicht Löschen.
- **Phase 4 — Lastmodell korrigiert, beide Terme der Alt-Rechnung waren falsch.** Gemessen statt
  angenommen: Verarbeitung **~40 KO/Tag** (nicht 15–20) · Eingang heute **277 Rohdokumente/Tag**,
  davon nur **13 %** mit KO verknüpft (Rohdokumente sind keine Understandings) · echte Obergrenze
  ist das **LLM-Tagesbudget**: Mittel 64/100, am 20.07. **100/100** · **5** Crawl-Vollrunden/Tag
  statt der angenommenen 2 (Abruflast um Faktor 2,5 unterschätzt) · Pending-Rückstand wächst nicht.
  Berlin steuert realistisch **4,6–11,4 Dokumente/Tag** bei (**1,6–4,1 %** des Eingangs), also
  **+1 bis +2,6 LLM-Aufrufe/Tag**. Im Mittel reicht das Budget; **am gemessenen Spitzentag nicht** —
  beides steht so im Modell. Gewählte Gegenmaßnahme ist die **einfachste sichere**: gestaffelte
  Aktivierung (erst 2 Direktfeeds mit 0 Google-Requests, nach einem vollen Crawl-Zyklus die 2
  Google-Wege). **Keine** `max_items`-Änderung — der gemessene Median von 1,14 Dokumenten je Quelle
  und Tag zeigt, dass `max_items` außerhalb des Erstlaufs nicht bindet. Keine neue Queue-Architektur.
- **Rollback gehärtet (adversarialer Befund).** Stufe 1 und 2 setzten bisher nur das *aktuelle*
  Aktivierungsset zurück. Nach der Reduktion 6 → 4 hätte ein Rollback genau die zwei Wege aktiv
  gelassen, die eine ältere Planfassung scharfgeschaltet hätte — und sich trotzdem als vollständig
  gemeldet. Beide Stufen setzen jetzt **alle 7** Wege des Basispakets zurück.
- **Tests:** `berlin-neutralitaet` **109/109** (neu; gegen **5 gezielte Mutationen** geprüft — jede
  wurde erkannt, 2–10 Fehlschläge je Mutation) · `berlin-aktivierung` **123/123** ·
  `seed-drift` grün (auch die gestaffelten SQL-Blöcke sind byte-genau an den Generator gebunden) ·
  **Offline-Suite 152/152** · **Browser-Smoke 32/32**.
- **Nicht getan (bewusst):** keine Production-Mutation — ausschließlich `select`-Abfragen · kein
  Flag gesetzt · kein SQL ausgeführt · kein Profil angelegt · keine Migration · keine
  Seed-Einspielung · keine Cron-/Lock-/Telemetrie-/Secret-Änderung · Brandenburg, Niedersachsen und
  alle Bundesquellen unverändert · kein PARDOK-Cutover · **keine Quelle erfunden** (die zwei
  veralteten Wege wurden gesperrt, nicht durch geratene Ersatzadressen ersetzt).
- **Verbleibende Grenzen, ehrlich:** Berlin startet ohne amtliche parlamentarische Quelle · die
  Personenquelle `rp-be-person_pilot` steht nach Block A im Parteipaket, widerspricht aber weiterhin
  dem Prinzip „Personenquellen entstehen zur Laufzeit aus dem Profil" (nicht geändert, weil das die
  in Punkt 13 belegte Vollständigkeit von `die-linke-berlin` aufbrechen würde) · das Monitoring ist
  definiert, aber nie gegen einen echten Berliner Lauf erprobt · die Verifikation ist eine
  Momentaufnahme und gehört unmittelbar vor die Aktivierung wiederholt.
- **Empfehlung: Go mit Bedingungen** für das reduzierte Set — Block A zuerst, Sicherung nach V6,
  nur Stufe 1 im ersten Schritt, Neuverifikation bei mehr als 14 Tagen Abstand, und die bewusste
  Annahme der fehlenden parlamentarischen Quelle. **Kein Go** für die zwei veralteten Wege,
  `rp-be-plenum`, `die-linke-berlin` und jede Brandenburg-Änderung.

**Sprint „Phase-1-Punkt 14: Berlin als laufende Versorgung aktivieren" — Nachweis**

- **Auftrag:** Berlin bis zur sicheren Production-Aktivierungsreife bringen; die Aktivierung selbst
  war ausdrücklich verboten. **Ergebnis: Aktivierungsreife erreicht, Production unverändert.**
- **Zwei echte Sperrlücken gefunden und behoben** (beide hätten bei der Aktivierung zugeschlagen):
  1. **`activation_mode='manual'` war keine Sperre.** `model.isPathActive` prüft nur
     `dev_only`/`paused`/`archived`; ein manueller Weg in einem aktiven Paket galt als aktiv. Das
     fiel nie auf, weil das Landesmodul-Gate vorher greift. Beim Öffnen des Gates wären **alle 10**
     vorbereiteten Berliner Wege auf einmal gelaufen — inklusive der Partei-/Personenquellen und
     des ~48-MB-PARDOK-Downloads. Neue Plan-Regel 4b im **ausführenden** Plan
     (`buildRelationalCrawlPlan`), nicht in `model.isPathActive`. Wirkung auf den Bund: **keine** —
     0 Bundeswege tragen `manual` (gemessen: 18 manuelle Wege, alle BE/BB).
  2. **Das Gate war global.** Berlin und Brandenburg konnten nur gemeinsam geöffnet werden. Jetzt
     je Land: `HELMUT_LANDESMODULE` (Default **leer**, fail-closed, **kein** Sammel-Schlüsselwort;
     `alle`/`*` sind wirkungslos). Auf der Datei-Allowlist, damit eine Freigabe ein reviewbarer,
     sofort rollbarer Diff ist. In `helmut-flags.json` **nicht** gesetzt.
- **Geplante Aktivierung: 6 liefernde Wege** (4 Google-News-Suchwege + 2 Direktfeeds), Ziel je Weg
  `healthy`/`auto`. Pflichtklassen ehrlich: **8 von 12 liefern, 4 nicht** — `plenum`,
  `drucksachen`, `schriftliche_anfragen` und `gesetzgebung` hängen alle an `rp-be-plenum`, dessen
  PARDOK-Dispatch die harte Invariante `items: []` in **jedem** Modus hält (Live-Modus bewusst nicht
  implementiert). Der Weg wird deshalb **nicht** aktiviert; er würde je Crawl ~48 MB laden und
  0 Dokumente liefern. `die-linke-berlin` bleibt `prepared` (2 seiner 3 Wege sind bot-gesperrt, 429).
- **Harter Blocker (V1):** `berlin-basis` ist das `is_base`-Pflichtpaket **jedes** Berliner
  Landtagsmandats und trägt in der Datenbank weiterhin `rp-be-partei_pilot`,
  `rp-be-fraktion_pilot`, `rp-be-person_pilot` (Befund **A-3**, am 2026-07-26 nachgemessen). Eine
  Aktivierung ohne Neutralisierung gäbe einem Mandat **jeder** Partei die Quellen **einer** Partei
  und die Nachrichtensuche zu **einer namentlich benannten realen Person** (`CLAUDE.md` §4.2).
  Der Landesmodul-Seed würde das beheben, würde dabei aber auch eine Brandenburg-Zeile umhängen —
  deshalb ist die Umhängung hier **Berlin-genau** als eigenes SQL formuliert (Block A).
- **Last, aus dem Crawler abgeleitet statt geschätzt:** +6 Wege je Lauf · **6–198 Abrufe je Lauf** ·
  **12–396 je Tag** (2 Crawl-Crons) · bis **196** davon gegen `news.google.com` · bis **96** neue
  Rohdokumente je Lauf, **192** je Tag · **0 LLM-Aufrufe durch den Crawl**. Annahmen: `max_items`=16,
  je Google-Item 0–3 Auflösungs-Requests. **Keine Behauptung „kostenlos":** die Google-Requests
  verschärfen Befund B1 und OP-15, und bis zu 192 Rohdokumente/Tag treffen auf ein
  Understanding-Tagesbudget von ~15–20 — der Rückstand B2 wächst.
- **Rollback in drei Stufen, getestet:** Stufe 0 = Flag leeren (Sekunden, **kein** DB-Schreibzugriff,
  der Regelweg) · Stufe 1 = SQL, dreht die Aktivierung zurück und **lässt die Neutralisierung
  bestehen** · Stufe 2 = zusätzlich Block A zurück, zeilengenau auf den gemessenen Ist-Zustand.
  Keine Stufe löscht Dokumente, Knowledge Objects oder Telemetrie — die Auditspur bleibt.
- **Tests:** `berlin-aktivierung` **123/123** (neu) · `seed-drift` grün (Aktivierungs-SQL ist
  byte-genau an seinen Generator gebunden) · `source-mode` 51/51 · `profile-packages` 69/69 ·
  `paketzuweisung-nachweis` 147/147 · `env-inventar` grün · **Offline-Suite 151/151** ·
  **Browser-Smoke 32/32**. Der Rollback-Test führt das committete SQL wirklich aus; sein
  Mini-SQL-Ausführer bricht bei jeder unbekannten Statementform hart ab.
- **Adversarialer Review (24 Punkte), drei nennenswerte Befunde:** die 4 Berliner Google-Wege
  werden vom Google-Gate erkannt (Drossel/Retry/Breaker greifen), die 2 Direktfeeds nicht
  (Provider-Trennung bleibt) · `retrieval_paths.parser` ist **Metadatum**: `toCrawlerSource`
  entscheidet allein über `method` — eine Parser-Korrektur ändert das Abrufverhalten nicht ·
  hinter dem Crawl gibt es **keinen** zweiten Berlin-Filter, die Kette bricht nicht still ab
  (alle „Berlin"-Treffer in Lage/Radar/Briefing/Push sind `Europe/Berlin`).
- **Nicht getan (bewusst):** keine Production-Mutation · kein Flag gesetzt · kein SQL ausgeführt ·
  kein Profil angelegt · keine Migration · keine Seed-Einspielung · keine Cron-/Lock-/Telemetrie-/
  Secret-Änderung · Brandenburg, Niedersachsen und alle Bundesquellen unverändert · kein
  PARDOK-Cutover · keine Quelle erfunden.
- **Verbleibende Grenzen, ehrlich:** die Live-Verifikation der 6 Wege stammt vom **2026-07-14** —
  aus dieser Sitzung ist kein Egress möglich (`CONNECT` → `403`, auch für `tagesspiegel.de` und
  `rbb24.de`), deshalb ist die Neuverifikation als Bedingung **V2** geführt · 4 der 6 Wege sind
  Google-News-Suchwege, keine amtlichen Direktfeeds · ein Berliner Testmandat existiert nicht, der
  Kettennachweis ist bisher rein lokal · `rp-rbb24-politik` hängt in **beiden** Landespaketen und
  bringt auch Brandenburg-Inhalte in den Rohstrom (benannt, im Plan als `mehrlaendrig` ausgewiesen,
  im Monitoring getrennt gemessen — es wird dadurch **kein** Brandenburg-Paket, -Weg oder -Profil
  aktiv).
- **Nächster Schritt:** Betreiberentscheidung über den Go/No-Go-Bericht. Bei „Go mit Bedingungen"
  folgt ein **eigener** Sprint für die Aktivierung und den Beweislauf (empfohlene
  Beobachtungsdauer: **3 Tage = 6 Crawl-Läufe**; ein Weg gilt als tragfähig ab 4 von 6 `ok`).
  Runbook: [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md).

**Sprint „Punkt 13 — Abschlusskorrektur: Niedersachsen, nicht-anwendbar, Fraktionen" — Nachweis**

- **Auslöser:** drei offene Punkte des vorigen Abschlusses. Punkt 13 war damit **nicht** vollständig
  abgeschlossen: `regional-niedersachsen` hatte keine benannten Herausgeber, die beiden nicht
  erfüllbaren Pflichtklassen von `die-linke-brandenburg` waren nur als Freitext begründet, und die
  Fraktionsvollzähligkeit war weiterhin katalogrelativ — derselbe Fehlermodus wie bei den
  Ausschüssen.
- **Ergebnis: alle 8 Pakete liegen in einer abgeschlossenen Kategorie** — **7 vollständig** +
  **1 vollständig mit belegten Ausnahmen**, **0 teilweise**, **0 blockiert**.

  | Paket | Ergebnis |
  |---|---|
  | `bund-basis` | vollständig (7/7 Klassen · 24/24 Ausschüsse · **5/5 Fraktionen**) |
  | `arbeit-und-soziales` | vollständig (10/10) |
  | `die-linke-bund` | vollständig (1/1) |
  | `regional-niedersachsen` | **vollständig (6/6)** — benannte Basis vorbereitet und inaktiv |
  | `berlin-basis` · `brandenburg-basis` | vollständig (je 12/12) |
  | `die-linke-berlin` | vollständig (3/3) |
  | `die-linke-brandenburg` | **vollständig mit belegten Ausnahmen** (1/3 besetzt, 2 geprüft nicht anwendbar) |

- **Teil A — `regional-niedersachsen` fachlich repariert, ohne Crawl-Kosten.** Ursache des Befunds:
  die Regionalmedien der Region **lagen im Katalog**, wurden aber von `keepCuratedSource` entfernt
  (`media` erst ab `priority >= 64`, regionale Medien tragen 52–60). Die Sollmenge unterscheidet
  jetzt sechs Klassen; erfüllt durch **7 benannte Wege**, davon **5 Bestandsquellen** (HAZ, NDR,
  Braunschweiger Zeitung, Salzgitter Zeitung, regionalHeute — identische URL und Query, nur
  angereichert) und **2 neu angelegte** für die im Katalog fehlende amtliche Landesebene
  (`landtag-niedersachsen.de`, `niedersachsen.de`, beide `site:`-gebunden; ein Direktfeed-Pfad ist
  von hier aus nicht verifizierbar und wäre geraten). Beleglage jetzt **2 amtlich · 5
  journalistisch · 4 Aggregator** statt 0 · 0 · 4.
  **Nicht aktiviert — drei unabhängige, getestete Riegel:** der Crawler ruft nur Quellen mit
  `active` ab · die Profilauswahl des Fallback-Pfads schließt `active === false` aus · der
  relationale Plan schließt `status='paused'` aus (Regel 4). Gemessen: Fallback **0 von 7**,
  relationaler Plan **0 von 7** (Grund `nicht-reaktiviert (status=paused)`). Der `purpose` trennt
  jetzt Region von Fachthema.
- **Teil B — „nicht anwendbar" ist überprüfbar statt Freitext.** Jede Ausnahme trägt stabile
  Kennung, politische Begründung, Wahlperiode, Geltungsbereich, amtlichen Beleg **und** eine
  `voraussetzung`, die gegen die kanonische Parlamentszusammensetzung geprüft wird. Amtliche
  Grundlage: Landtag Brandenburg, 8. Wahlperiode — 4 Fraktionen (SPD 32, AfD 30, BSW 14, CDU 12);
  alle weiteren Landeslisten blieben unberücksichtigt, darunter Die Linke (Landeswahlleiterin,
  Endergebnis LTW 22.09.2024 + Landtagshandbuch 8. WP). Neue vierte Ergebniskategorie
  `vollstaendig_mit_belegten_ausnahmen`; eine **unbestätigte** Ausnahme erzeugt
  `nicht-anwendbar-unbegruendet` und lässt die Klasse als offene Lücke stehen, eine Ausnahme für
  eine besetzte Klasse `nicht-anwendbar-ohne-not`. Kehrt die Partei in den Landtag zurück, wird die
  Ausnahme unbegründet und die Prüfung verlangt eine bewusste Aktualisierung.
- **Teil C — Fraktionssollmenge extern verankert, und die Alt-Angabe war falsch.** Gemessen wurde
  „8 von 8 Fraktionen". Fachlich richtig sind **5**: FDP (4,3 %) und BSW (4,97 %) sind im
  21. Bundestag **nicht vertreten**, der SSW hat mit **einem** Mandat keinen Fraktionsstatus
  (Minderheitenpartei, von der Fünf-Prozent-Hürde befreit). Amtliche Grundlage: Sitzverteilung des
  21. Deutschen Bundestages (630 Sitze) — CDU 164 + CSU 44 = 208 · AfD 152 · SPD 120 ·
  Bündnis 90/Die Grünen 85 · Die Linke 64 · SSW 1. **Keine Quelle entfernt:** die drei Quellen
  bleiben im Katalog und im Pflicht-Basispaket, tragen aber jetzt die Klasse
  `parteien_ohne_fraktionsstatus` (zusätzlich, nicht Pflicht). Alle 8 `fraction-`Wege behalten
  Status und Aktivierungsmodus — **0 zusätzliche und 0 entfallene Abrufe**.
- **Weitere gefundene Fehler (in diesem Sprint behoben):**
  1. **Eigene Fehlannahme korrigiert:** ich hatte die Inaktivität zunächst auf einen `active`-Filter
     in `scheduler.js` gestützt, der dort tatsächlich `selectLageCheckSources` betrifft.
     `sourceAllowedForProfile` prüfte `active` **nicht**. Die eigentliche Garantie lag beim
     Crawler-Filter (`sources.filter((source) => source.active)`), es wäre also kein Abruf
     entstanden — die Wege hätten aber in der Profilauswahl gestanden. Riegel ergänzt und alle drei
     strukturell getestet.
  2. **Der gezielte Seed-Restore deckte neue Herausgeber nicht ab.** Seed 1 legt jetzt 7 neue
     `publishers`-Zeilen an; ohne Erweiterung wären sie nach einem Restore als Waisen
     stehengeblieben (gefangen von der Byte-Gleichheitsprüfung, Gruppe 8). Sie werden jetzt
     *guarded* entfernt — nur wenn kein Abrufweg sie mehr referenziert. Die Invariante des Tests
     wurde dabei **präzisiert, nicht aufgeweicht**: `geographies`/`political_entities` werden gar
     nicht angefasst, jedes `publishers`-Delete muss die `not exists`-Absicherung tragen.
  3. **Der Mini-SQL-Executor** des Restore-Tests führt die neue Guard-Form wirklich aus, statt sie
     zu überspringen; das Backup-Fixture sichert `publishers` mit (wie der echte Export).
- **Neue ausführbare Zusicherungen:** `scripts/parlamentszusammensetzung-test.js` — **65/65** in
  7 Gruppen mit **15 Negativkontrollen**: fehlende Fraktion · zusätzliche nicht vertretene Partei ·
  Mandat ohne Fraktionsstatus als Fraktion · **Tausch bei Zahlengleichstand (5 bleibt 5)** ·
  Umbenennung · **falscher politischer Typ** · Eintrag ohne stabile Kennung · doppelte Kennung ·
  unbekanntes Parlament · Ausnahme für eine Partei **mit** Fraktion · falsche Wahlperiode · bloßer
  Freitext · fehlender Beleg · unbekannte Prüfart · missbräuchliche Ausnahme rettet kein Paket.
  Dazu die drei Inaktivitäts-Riegel und die Wahlperioden-Konsistenz beider Sollmengen.
  In `paketvollstaendigkeit-test.js` neu: rein aggregatorbasiertes Regionalpaket wird abgelehnt ·
  fehlender Wahlkreis-Herausgeber wird erkannt · fehlende amtliche Ebene wird erkannt · die
  7 benannten Wege sind vorbereitet · Niedersachsen ist nicht aktiviert (mit Wirksamkeitsnachweis).
- **Tests (echte Zahlen):** `parlamentszusammensetzung` **65/65** · `paketvollstaendigkeit`
  **99/99** · `bundestag-ausschuesse` **36/36** · `source-architecture` **99/99** ·
  `profile-packages` **69/69** · `seed-restore` **46/46** · `seed-drift` grün ·
  `admin-source-report` **56/56** · `sprint6-pilot-migration` **46/46** ·
  `landesmodule-kandidaten` **77/77** · `paketzuweisung-nachweis` **147/147** ·
  `tenant-neutrality` **39/39** · **Offline-Suite 150/150 grün**. Generatorlauf zweimal
  wiederholt: beide Seeds byte-identisch; der Landesmodul-Seed ist gegen `main` unverändert.
- **Production-Sicherheitsnachweis:** keine Production-Änderung, keine Migration, keine
  Seed-Einspielung, keine Aktivierung, keine Änderung an Cron, Locks, Telemetrie, Flags oder
  Secrets. Die 5 `always_on`-Kernwege sind unverändert. Berlin/Brandenburg: alle 4 Landespakete
  `prepared`, alle 18 Landeswege `needs_review` + `manual`, **0 aktiv**, im Plan mit
  `landesmodul-gesperrt` ausgeschlossen. Niedersachsen: 7 Wege `paused` + `manual`, **0 aktiv**.
- **Wirkung einer späteren freigegebenen Seed-Einspielung, getrennt betrachtet:** Metadaten
  (`required_classes`, `purpose`, 28 korrigierte Namen — `name` wird von der `on-conflict`-Klausel
  gar nicht aktualisiert) = **0 Laufzeitwirkung** · **+9** Paketzuordnungen = 0 · **+8** Abrufwege,
  davon 7 dauerhaft `paused` = **+1 Abruf je Crawl** (der 24. ständige Ausschuss; 145 → 146 Wege,
  +0,7 %) · **+7** Herausgeber = 0. Der Restore dreht alles zurück, Wege und Herausgeber jeweils
  guarded. Runbook §4/§10a–§10c nachgezogen.
- **Verbleibende Grenzen (unverändert ehrlich benannt):** der Volltext der Drucksache 21/150 wurde
  nicht gelesen (`bundestag.de`/`dserver.bundestag.de` aus dieser Sitzung nicht abrufbar, `403` auf
  `CONNECT`) — die 24 Ausschussbezeichnungen stammen aus amtlichen Ausschuss-Tagesordnungen der
  21. WP, jeder Eintrag nennt seine Fundstelle · ob die laufende Wahlperiode **heute noch** die 21.
  bzw. 8. ist, kann offline nicht geprüft werden; ein Wechsel macht die Prüfungen rot statt still
  falsch · die Aktivierung der benannten Niedersachsen-Basis (+7 Abrufe je Crawl) und das
  Nachziehen der amtlichen Namen in die Datenbank bleiben freigabepflichtig.
- **Nicht getan (bewusst):** kein Production-Zugriff · kein Seed eingespielt · keine Migration ·
  keine Quelle erfunden (die 2 neuen Wege nutzen verifizierte amtliche Domains über den bereits
  verwendeten Suchweg) · keine Quelle entfernt · keine Kuratierungsschwelle global angehoben ·
  keine Aktivierung von Niedersachsen, Berlin oder Brandenburg · keine Cron-/Lock-/Telemetrie-/
  Flag-/Secret-Änderung · keine Anforderung entfernt, um einen grünen Test zu erzeugen.

**Sprint „Punkt 13 — Nachtrag: Ausschuss-Sollmenge extern verankern" — Nachweis**

- **Auslöser:** externe Prüfung des Betreibers. Der 21. Deutsche Bundestag hat **24** ständige
  Ausschüsse (Einsetzungsbeschluss vom 15.05.2025 auf Grundlage der **Drucksache 21/150** vom
  13.05.2025). Der erste Punkt-13-Abschluss arbeitete mit **23** und war damit nur
  **katalogrelativ** bewiesen — das genügt dem Abnahmekriterium nicht. Punkt 13 wurde
  zwischenzeitlich auf „teilweise abgeschlossen" zurückgesetzt und ist erst mit dieser Korrektur
  wieder grün.
- **Der fehlende Ausschuss:** **Ausschuss für Wahlprüfung, Immunität und Geschäftsordnung**
  (§ 128 GO-BT, 14 Mitglieder). Er war im Katalog **überhaupt nicht vorhanden** — kein Abrufweg,
  keine Zuordnung, keine Erwähnung.
- **Ursache der Abweichung 23 statt 24** (kein Zählfehler, sondern zwei fehlende Verankerungen):
  1. `bundestagCommitteeSources` war eine **handgepflegte Politikfeld-Auswahl**, nie ein Abgleich
     gegen den Einsetzungsbeschluss. Ein Ausschuss ohne Sachpolitikfeld — parlamentarische
     Selbstorganisation — fiel durch das Raster.
  2. Die Vollzähligkeitsregel leitete ihre Sollmenge **aus demselben Katalog** ab und war damit
     per Konstruktion erfüllbar: 23 von 23, ohne zu wissen, dass 24 richtig ist.
- **Zusätzlich gefunden: neun Bezeichnungen/Zuschnitte aus der 20. Wahlperiode.** Darunter zwei
  echte Zuschnittwechsel: Bildung liegt in der 21. WP beim **Ausschuss für Bildung, Familie,
  Senioren, Frauen und Jugend**, Forschung bildet den eigenen **Ausschuss für Forschung,
  Technologie, Raumfahrt und Technikfolgenabschätzung**. Ebenfalls korrigiert: Landwirtschaft,
  Ernährung und Heimat · Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit · Recht und
  Verbraucherschutz · Digitales und Staatsmodernisierung · Wohnen, Stadtentwicklung, Bauwesen und
  Kommunen · Sport und Ehrenamt · die Angelegenheiten der Europäischen Union · sowie die fünf
  Kurzformen (Verteidigungs-, Finanz-, Haushalts-, Auswärtiger, Petitionsausschuss).
- **Korrektur an der kanonischen Quelle, nicht am Testwert:**
  - **Neu:** `lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse.js` — Wahlperiode,
    Einsetzungsbeschluss und die 24 Ausschüsse mit stabiler Kennung, amtlicher Bezeichnung und je
    eigenem amtlichen Fundstellenhinweis. Wird **nicht** aus dem Katalog abgeleitet.
  - **Katalog:** alle 24 Ausschussquellen holen ihren Namen aus der Sollmenge und tragen eine
    `ausschussKey`-Kennung; der fehlende 24. Ausschuss ist als `rp-committee-wahlpruefung`
    ergänzt — derselbe Google-News-Suchweg wie die anderen 22, Suchbegriffe strikt aus der
    amtlichen Bezeichnung. **Keine erfundene Quelle, keine erfundene URL.**
  - **Katalog-Ids eingefroren**, auch wo der Slug nicht mehr passt (`committee-bildung` trägt
    jetzt den Forschungsausschuss). Eine Id-Änderung hätte beim Seed-Einspielen eine neue
    `retrieval_paths`-Zeile angelegt und die alte als weiter gecrawlte Waise im Pflichtpaket
    zurückgelassen.
  - **Erkennung umgestellt** auf `ausschussKey` statt Namensmuster `^Ausschuss ` — fünf der 24
    amtlichen Bezeichnungen beginnen nicht mit „Ausschuss " und wären ab jetzt übersehen worden.
  - **Vollzähligkeitsregel** prüft gegen die externe Sollmenge (24) und nennt die Wahlperiode.
- **Zweiter behobener Defekt (durch die Korrektur aufgedeckt):** Seed 1 legt jetzt erstmals einen
  **neuen Abrufweg** an. Der gezielte Restore (`scripts/seed-restore-sql.js`) deckte diesen Fall
  nicht ab und hätte die Zeile stehen gelassen — gefangen von der Byte-Gleichheitsprüfung des
  Restore-Tests, nicht von einer Annahme. Er entfernt sie jetzt *guarded* (nur wenn keine
  `package_paths`-Zeile sie mehr referenziert, wegen `on delete cascade`), mit eigener
  Vorprüfung und eigener Nachprüfung. Der Mini-SQL-Executor des Tests führt die neue
  Guard-Form wirklich aus, statt sie zu überspringen.
- **Neue extern verankerte Zusicherung:** `scripts/bundestag-ausschuesse-test.js` — **36/36**.
  Sichert ab: Wahlperiode = 21 · Sollmenge = exakt 24 · Kennungen und amtliche Bezeichnungen
  festgeschrieben, jede mit Fundstelle · Katalog == Sollmenge · **sechs Negativkontrollen**:
  fehlender Ausschuss, zusätzlicher veralteter Ausschuss der 20. WP, **Tausch bei
  Zahlengleichstand (24 bleibt 24)**, Umbenennung, Zusammenlegung, Quelle ohne Kennung — jede
  einzeln rot. Zahlengleichheit allein rettet nirgends.
- **Tests (echte Zahlen):** `bundestag-ausschuesse` **36/36** · `paketvollstaendigkeit`
  **91/91** · `source-architecture` **98/98** · `profile-packages` **69/69** · `seed-restore`
  **43/43** · `seed-drift` grün · `admin-source-report` **56/56** · `sprint6-pilot-migration`
  **46/46** · `landesmodule-kandidaten` **77/77** · `paketzuweisung-nachweis` **147/147** ·
  `tenant-neutrality` **39/39** · **Offline-Suite 149/149 grün**. Generatorlauf zweimal
  wiederholt: beide Seeds byte-identisch; der Landesmodul-Seed ist gegen `main` unverändert.
- **Ergebnis der Vollständigkeitsprüfung unverändert:** 6 vollständig · 2 belegt teilweise ·
  0 blockiert. `bund-basis` deckt jetzt **24/24** ständige Ausschüsse ab (vorher 23/23 gegen eine
  zu kleine Sollmenge).
- **Production-Sicherheitsnachweis:** keine Production-Änderung, keine Migration, keine
  Seed-Einspielung, keine Berlin-/Brandenburg-Aktivierung, keine Änderung an Cron, Locks,
  Telemetrie, Flags oder Secrets. Die 5 `always_on`-Kernwege sind unverändert; der neue Weg ist
  `needs_review` + `auto`, **nicht** `always_on`, **nicht** `is_critical`. Der Live-Crawlpfad baut
  im Modus `on` weiterhin aus DB-Zeilen und importiert weder `packageKeysForSource` noch
  `buildFullModel` (Strukturriegel im Test).
- **Ehrlich benannte Laufzeitwirkung nach der freigabepflichtigen Seed-Einspielung:** **ein**
  zusätzlicher Google-News-Abruf je Crawl (145 → 146 Wege für ein voll versorgtes Profil,
  +0,7 %); die Google-Konzentration (Befund B1) steigt um einen Weg. Soll-Zahlen im Seed jetzt
  **145** Abrufwege und **147** Zuordnungen; gegen die gemessene Production **+1** Abrufweg und
  **+2** Zuordnungen. `betrieb/quellen-seed-einspielung.md` §4/§10b ist nachgezogen.
- **Ehrliche Grenze:** Der **Volltext der Drucksache 21/150 wurde nicht gelesen** —
  `bundestag.de` und `dserver.bundestag.de` sind aus der Agentensitzung nicht abrufbar (die
  Netzrichtlinie antwortet `403` auf `CONNECT`, zusätzlich Bot-`403` auf den HTML-Seiten; dieselbe
  Sperre wie bei `rp-bundestag`). Die 24 Bezeichnungen stammen aus amtlichen
  Bundestagsdokumenten der 21. Wahlperiode, überwiegend aus **Ausschuss-Tagesordnungen**
  (`bundestag.de/resource/blob/…`), die jede Bezeichnung wörtlich im Kopf tragen; jeder Eintrag
  der Sollmenge nennt seine Fundstelle. Ein direkter Abgleich gegen 21/150 bleibt empfohlen.
  **Überholt:** die damals noch katalogrelative Fraktionsvollzähligkeit ist im Abschlusssprint
  oben extern verankert — und die Angabe „8/8" war fachlich falsch (richtig: 5).
- **Nicht getan (bewusst):** kein Production-Zugriff · kein Seed eingespielt · keine Migration ·
  keine Quelle außer dem belegten 24. Ausschuss hinzugefügt · keine Katalog-Id geändert · keine
  Kuratierungsschwelle angehoben · keine Berlin-/Brandenburg-Aktivierung · keine Cron-/Flag-/
  Secret-Änderung · keine Abschwächung eines Kriteriums, um Grün zu erzeugen.

**Sprint „Phase-1-Punkt 13: Vollständigkeit jedes Quellenpakets" — Nachweis**

- **Auftrag / Abnahmekriterium:** „Jedes Quellenpaket ist fachlich vollständig und nicht nur
  technisch angelegt." Kanonischer Nachweis:
  [`quellenarchitektur/31-paketvollstaendigkeit.md`](quellenarchitektur/31-paketvollstaendigkeit.md).
- **Was geprüft wurde:** alle **8** Pakete des Code-Seeds — `bund-basis`, `arbeit-und-soziales`,
  `die-linke-bund`, `regional-niedersachsen`, `berlin-basis`, `brandenburg-basis`,
  `die-linke-berlin`, `die-linke-brandenburg`. Personenbezogene Pakete `profil-<mandats-id>`
  existieren bewusst nur als DB-Zeilen; die Regel dafür (nie `is_base`, nie im Code-Seed) ist
  jetzt getestet. Je Paket erhoben: Zweck, politische Zuständigkeit, Ebene, Region, erwartete
  Themen, Herausgeberklassen, vorhandene Wege, Paketzuordnungen, Aktivierungsstatus,
  Einschränkungen, Tests, Recherchegrundlage.
- **Verwendete fachliche Kriterien (jetzt ausführbar, nicht nur Fließtext):** Pflichtklassen je
  Paket · Pflicht-**Herausgeber**klassen (`evidence_role`) · Vollzähligkeit („alle Ausschüsse",
  „alle Fraktionen", „alle genannten Regionen") · mindestens **ein** benannter Herausgeber je
  Paket (nicht nur Aggregatoren) · leere Platzhalter · begründete vs. unbegründete
  Mehrfachzuordnungen · fachlich **unmögliche** Pflichtklassen getrennt von offenen Lücken ·
  vorbereitet ≠ aktiv · Determinismus. Die Klasse eines Abrufwegs wird deterministisch aus
  committeten Katalogmerkmalen abgeleitet (neues Modul
  `lib/helmut/quellenarchitektur/paket-vollstaendigkeit.js`), nicht aus einer gepflegten Liste.
- **Zwischenergebnis dieses ersten Sprints — inzwischen überholt:** 6 vollständig · 2 teilweise ·
  0 blockiert, mit `bund-basis` als „7/7 Klassen, 23/23 Ausschüsse, 8/8 Fraktionen".
  **Beide Zählwerte waren falsch** (richtig: 24 Ausschüsse, 5 Fraktionen) — sie stammten aus einer
  katalogrelativen Prüfung. Der **aktuelle** Stand steht in der Tabelle in §2 und im kanonischen
  Nachweis `quellenarchitektur/31-paketvollstaendigkeit.md`: **7 vollständig + 1 vollständig mit
  belegten Ausnahmen**, Ausschüsse **24/24**, Fraktionen **5/5**.
- **Gefundene Lücken (6, davon 3 behoben):**
  1. **V-3 (behoben):** Das neutrale Pflicht-Basispaket enthielt nur **22 der 23** ständigen
     Bundestagsausschüsse — es fehlte genau der Ausschuss für Arbeit und Soziales, der
     ausschließlich im **Themenpaket** lag. Jedes andere Mandat hätte 22 von 23 bekommen, und die
     Lücke wäre der Profilform des Pilotmandats gefolgt, obwohl `bund-basis` „alle Ausschuesse"
     zusagt. Behoben über die Paketableitung: **+1** `package_paths`-Zeile, **0** neue Abrufwege,
     **0** Änderung an Aktivierungsmodi.
  2. **V-4 (behoben):** `packageKeysForSource` ordnete **jede** regionale Quelle dem
     Niedersachsen-Paket zu. Unter der Production-Kuratierung unsichtbar, mit
     `HELMUT_SOURCE_CURATION=off` wären es **30** fremde Regionalquellen gewesen. Die Zuordnung
     läuft jetzt über die Regionsbegriffe der Paketdefinition; der generierte Seed ist unter
     Production-Kuratierung dadurch **unverändert**.
  3. **V-5 (behoben):** Die Regionsbegriffe lagen doppelt (Profil-Resolver + implizit im
     Paketinhalt) und konnten auseinanderlaufen — jetzt eine Quelle der Wahrheit in der
     Paketdefinition.
  4. **V-1 (erkannt, bewusst nicht behoben):** `regional-niedersachsen` hat **0 benannte
     regionale Herausgeber** — alle 4 Wege sind Google-News-Themensuchen (Herausgeber =
     Aggregator, 0 journalistische und 0 amtliche Beleglage) und zusätzlich thematisch auf
     Arbeit/Soziales gebunden, obwohl das Paket nach **Region** zugewiesen wird. Die
     Regionalmedien der Region (Braunschweiger Zeitung, Salzgitter Zeitung, regionalHeute, HAZ,
     Neue Presse, NDR) **liegen im Katalog**, werden aber von `keepCuratedSource` entfernt
     (`type: "media"` erst ab `priority >= 64`, regionale Medien tragen 52–60). Das Anheben
     dieser Schwelle wären rund **20 zusätzliche Google-News-Abrufe je Crawl** — eine Kosten-/
     Laufzeitentscheidung und damit freigabepflichtig, zumal die Google-Konzentration (B1) der
     wichtigste offene Architekturpunkt ist. Paket blieb zunächst **teilweise vollständig** —
     **überholt:** im Abschlusssprint über 2 benannte amtliche + 5 wiederverwendete Bestandsquellen
     geschlossen, ohne Schwellenanhebung und ohne Aktivierung (§2b.1 des Nachweises).
  5. **V-2 (erkannt, als fachlich unmöglich ausgewiesen):** `die-linke-brandenburg` kann 2 seiner
     3 Pflichtklassen nicht besetzen — Die Linke hat in der 8. Wahlperiode keine
     Landtagsfraktion in Brandenburg und keinen MdL. Die Pflichtklassen werden **nicht** entfernt
     (das wäre eine Abschwächung des Kriteriums); ein Ersatz aus fremder Partei ist ausgeschlossen.
     **Überholt:** die Nicht-Anwendbarkeit ist jetzt nicht mehr Fließtext, sondern eine überprüfbare
     Ausnahme mit stabiler Kennung, Wahlperiode, amtlichem Beleg und Voraussetzungsprüfung gegen
     `seeds/parlamentszusammensetzung.js` (§2b.2) — Ergebniskategorie
     `vollstaendig_mit_belegten_ausnahmen`.
  6. **V-6 (erkannt, Umsetzung als OP-23):** Die Pflichtklassenanzeige im Admin zeigt weiterhin
     `present: 0`. Ursache ist **nicht** fehlendes Klassen-Tagging, sondern dass
     `buildSourceAdminReport` auf `buildFullModel()` arbeitet, das die Berlin-/Brandenburg-Wege
     nicht kennt. Die Anzeige **untertreibt** also, erzeugt kein falsches Grün.
- **Korrigierte Altangabe:** Die Inventur führte Berlin mit **10 von 15** und Brandenburg mit
  **9 von 15** Pflichtklassen. Das war eine Unterzählung der Id-Namensableitung (deduplizierte
  Rohquellen tragen nur die *erste* Klasse in ihrer Id) — die Inventur hatte das selbst als
  „Hilfsableitung, keine Systemwahrheit" markiert. Gemessen an `covers` sind es **12/12** bzw.
  **12/12**. Die Checklistenpunkte 6/7 bleiben trotzdem ⏳ — allein wegen der Neutralitätslücke
  **A-3** in der Production-**Datenbank**, die nur die freigabepflichtige Seed-Einspielung schließt.
- **Ausführbare Absicherung:** neue Suite `scripts/paketvollstaendigkeit-test.js` — **89
  Prüfungen** in 14 Gruppen, mit **6 Negativkontrollen** (fehlender Ausschuss, undeklarierte
  Doppelzuordnung, Paket ohne Anforderung, umbenanntes Paket, Themenbündel als Ausschuss, und ein
  Wirksamkeitsnachweis, dass die BE/BB-Nichtaktivierungsprobe überhaupt Zähne hat). Zusätzlich ein
  **Strukturriegel**: schlägt an, sobald der Live-Crawlpfad `packageKeysForSource` oder
  `buildFullModel` importiert.
- **Tests dieses ersten Sprints (echte Zahlen, seither gewachsen):** `paketvollstaendigkeit-test`
  **89/89** · `source-architecture-test` **98/98** · `profile-packages-test` **69/69** ·
  `seed-restore-test` **43/43** · `seed-drift-test` grün · **Offline-Suite 148/148 grün** (37 s).
  Kein Browser-Smoke nötig (keine UI-Änderung). Generatorlauf wiederholt: beide Seeds
  byte-identisch; der Landesmodul-Seed ist gegen `main` **unverändert**. Aktuelle Zahlen nach den
  drei Folgesprints: siehe Tabelle §2 (Zeile Punkt 13).
- **Production-Sicherheitsnachweis (verifiziert, nicht behauptet):** Im Modus
  `HELMUT_SOURCE_MODE=on` baut der Scheduler seinen Plan aus den **DB-Zeilen**
  (`listSourceArchitectureRows` → `buildRelationalCrawlPlan`); der Fallback filtert `v1Sources`
  direkt über `neutral`/`themeTerms`/`regional`. **Beide Pfade importieren
  `packageKeysForSource`/`buildFullModel` nicht** — die Änderung wirkt erst mit der
  freigabepflichtigen Seed-Einspielung. Unverändert: 5 `always_on`-Wege, 144 Katalogwege, 139
  `auto`, 0 `dev_only`, Wegestatus, Cron, Flags, Secrets.
- **Wirkung auf die vorbereitete Seed-Einspielung (dokumentiert, nicht ausgeführt):** Seed
  `20260713` setzt zusätzlich `required_classes` für die vier Bundespakete (reine Metadaten, kein
  Einfluss auf Crawl/Aktivierung/Matching) und fügt **eine** Paketzuordnung ein
  (`pkg-bund-basis` ↔ `rp-ausschuss-arbeit-soziales`). Soll-Zahl im Seed damit **146** statt 145;
  gegen die gemessene Production **+1** statt bisher **0**. `betrieb/quellen-seed-einspielung.md`
  §4 ist entsprechend nachgezogen (Einfügungen Seed 1: 3, Aktualisierungen: 12).
- **Berlin/Brandenburg nicht aktiviert — geprüft:** alle 4 Landespakete `prepared`, alle 18
  Landeswege `needs_review` + `manual`, `aktiveAbrufwege = 0`, kein Landesweg in einem aktiven
  Paket, ein Berliner Landtagsprofil aktiviert **0** Landeswege (bei nicht-leerer
  Bundesaktivierung), `berlin-basis` bleibt ehrlich `requested_unsupplied`.
- **Verbleibende Grenze (ehrlich) — inzwischen überholt:** Die Vollzähligkeit war zu diesem
  Zeitpunkt **katalogrelativ**; bewiesen war nur, dass jeder ständige Ausschuss, den der Katalog
  kennt, im Pflichtpaket liegt. Genau dort lag der Fehler: der Katalog kannte 23, richtig sind
  **24**. Behoben im Nachtragssprint oben.
- **Nicht getan (bewusst):** kein Production-Zugriff, weder lesend noch schreibend · kein Seed
  eingespielt · keine Migration · keine Quelle aktiviert oder deaktiviert · keine neue Quelle
  erfunden oder hinzugefügt · keine Berlin-/Brandenburg-Aktivierung · keine Cron-/Flag-/
  Secret-Änderung · keine Änderung am Datenmodell oder an der Gesamtarchitektur · keine
  Abschwächung eines Pflichtklassenkriteriums, um ein Paket grün zu bekommen.

**Sprint „Go-Kriterium 2 kontrolliert versuchen" — Nachweis**

- **Auftrag:** ausschließlich `node scripts/backup-export.js --scope=seed` gegen Production
  ausführen, danach Manifest vollständig prüfen, dann zwingend vor Seed 1 stoppen.
- **Ausgeführt:** genau dieser eine Befehl, ohne Abweichung. Ergebnis: sofortiger Abbruch mit
  Exit-Code 2, Meldung „SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein
  (.env.local)". Das Skript prüft die Zugangsdaten **vor** jedem `fetch`-Aufruf — es wurde
  **keine einzige Anfrage** gegen Production gestellt, kein Verzeichnis unter `./backups/`
  angelegt, kein Manifest erzeugt.
- **Ursache verifiziert:** diese Agenten-Sitzung führt weder `SUPABASE_URL` noch
  `SUPABASE_SERVICE_ROLE_KEY` als Umgebungsvariable, und es existiert keine `.env.local` im
  Projektverzeichnis (nur `.env.example`). Das ist keine neue Erkenntnis — bereits im vorigen
  Sprint dokumentiert (s. u., „Die Production-Secrets sind in dieser Umgebung nicht gesetzt").
- **Keine Ersatzmaßnahme ergriffen:** kein Rückgriff auf den Supabase-MCP-Connector oder einen
  anderen Zugangsweg, da der Auftrag ausdrücklich genau dieses Skript vorschrieb.
- **Betreiberentscheidung:** der Export läuft auf der Betreibermaschine mit echter `.env.local`;
  das Manifest (`art`, `vollstaendig`, Zeilenzahlen je Tabelle, `pruefsummeGesamt`, `mainCommit`)
  wird zurückgemeldet und gegen die erwarteten Werte (163 Abrufwege, 7 Pakete, 165 Zuordnungen,
  siehe Inventur) geprüft, bevor Runbook-Schritt 6 fortgeführt wird.
- **Nicht getan (bewusst):** kein Production-Zugriff, weder lesend noch schreibend · keine
  Migration · kein Seed · kein Restore · keine Cron-/Flag-/Secret-Änderung · keine
  Quellenaktivierung · keine Datenänderung.

**Sprint „Review + Merge PR #125, Production-Ablauf vorbereiten" — Nachweis**

- **Review von PR #125:** drei spezialisierte Reviewer gegen den tatsächlichen Code, **20 belegte
  Befunde**, jeder einzeln nachgerechnet und behoben. Die vier schwersten:
  1. **Ein leerer Export galt als vollständiges Backup.** Auf allen 8 Quellentabellen ist RLS
     aktiv, aber es existiert **keine Policy** — ein anon-Key oder ein falsches Projekt liefert
     deshalb `HTTP 200` mit `[]` statt eines Fehlers. Das Ergebnis war ein grünes Manifest über
     leeren Dateien, und genau dieses Manifest ist das Go-/Stop-Gate des Runbooks. Der
     wahrscheinlichste Bedienfehler hätte das Sicherheitsnetz passiert.
  2. **Der Restore-`delete` war nicht eingegrenzt** und hätte eine nach dem Backup entstandene
     Mandantenzeile still gelöscht. Die Nachprüfung konnte das **strukturell nicht** bemerken:
     nach `delete … not in` + `insert` ist der Inhalt per Konstruktion die Backup-Menge, die
     Zählprüfung war damit **immer** erfüllt.
  3. **Ein zu spät gezogenes Backup wurde nicht erkannt** — der Restore wäre ein No-Op gewesen
     und hätte Erfolg gemeldet.
  4. **Die Soll-Zahlen des Runbooks widersprachen der gemessenen Production.** Die Vorlage
     rechnete mit 6 Paketen / 162 Wegen / 163 Zuordnungen, die Inventur aus #124 misst **7 / 163 /
     165**. Runbook-Schritt 6 hätte eine **korrekte** Datenbank gestoppt.
- **Konsequenz aus Befund 4:** Alle Prüfungen im Runbook arbeiten jetzt mit **gemessenen Deltas
  und benannten Zeilen** statt mit absoluten Zahlen aus einer Doku — absolute Zahlen driften bei
  jeder Provisionierung. Jede Differenz ist zugeordnet: zwei DB-only-Zeilen aus der
  Provisionierung, eine bereits vorhandene Zuordnung. **Seed 1 fügt in Production 0 statt 1
  Zuordnung ein.**
- **Weitere behobene Sachfehler:** Runbook-Schritt 13 prüfte auf `status='healthy'`, den kein
  Landesmodul-Weg je hat (wirkungslose Sicherheitsprüfung) · Schritt 16 konnte die
  Stopentscheidung aus Schritt 15 stillschweigend rückgängig machen · die Gate-Beschreibung
  behauptete, Paketschlüssel spielten keine Rolle, obwohl sie für `rp-rbb24-politik` die einzige
  Barriere sind · „2× `html` → `rss`" war in Anzahl und Richtung falsch (4×, alle nach
  `googlenews_search`) · die Kostenrechnung unterschlug die nicht deduplizierten Direktfeeds
  (≈16 statt 4 Abrufe) · `--scope seed` mit Leerzeichen fiel still auf den Voll-Export zurück.
- **Testlage.** `backup-export.js` hatte vorher **keinen einzigen Test**; der neue
  `scripts/backup-export-test.js` fährt es als echten Kindprozess gegen einen lokalen
  PostgREST-Nachbau und belegt **am HTTP-Verkehr**, dass ausschließlich `GET` rausgeht.
  Im `seed-restore-test.js` wurden die `do $$`-Prüfblöcke bisher nur **gezählt**, nie ausgeführt —
  sie werden jetzt ausgewertet.

  | Lauf | Ergebnis |
  |---|---|
  | `seed-restore-test.js` (lokal) | **43 PASS, 0 FAIL** |
  | `seed-restore-test.js` (`--depth 1`-Klon wie CI) | **41 PASS, 0 FAIL** |
  | `backup-export-test.js` | **38 PASS, 0 FAIL** |
  | `run-offline-tests.js` | **147/147 grün** |

  Mutationsprobe: Nimmt man die Eingrenzung des Restore-`delete` zurück, fängt Test 16 das
  reproduzierbar als FAIL.
- **Production-Ablauf vorbereitet, nicht ausgeführt.** Offline prüfbar und geprüft: `main`-Stand,
  Seeds unverändert seit #118, Drift-Gate grün, Cron-Fenster, Ablageort und Dateinamen des
  Backups, erwartete Manifest-Werte, Soll-Zahlen vor/nach Seed 1 und Seed 2, Stop-Kriterien,
  Restore-Entscheidungspunkte, Überwachung der 6 Wege. **Nicht** geprüft, weil es Production-Lesezugriff
  erfordert: laufende Locks, Health, offene Vorfälle — die stehen als Runbook-Schritte 2 und 3.
- **Die Production-Secrets sind in dieser Umgebung nicht gesetzt.** Der Export kann hier also
  ohnehin nicht laufen; er gehört auf die Betreibermaschine mit `.env.local`.
- **Merge:** PR #125 als Merge-Commit `0d6d867`. Vorab verifiziert: `mergeable_state: clean`,
  beide Pflichtchecks grün auf `6baaa0b`, keine offenen Reviews, Basis = aktueller `main`.
  Nach dem Merge auf `main` gegengeprüft: CI-Lauf #134 `success`, Vercel-Production-Deployment
  `dpl_4NFEyoJgQnbjTP4G8u1pJrjDrxuB` **READY** mit `githubCommitSha=0d6d867`; die drei
  Kernkorrekturen (Leer-Backup-Plausibilisierung, Vor-Seed-Prüfung, eingegrenzter `delete`)
  liegen auf `main`, das Runbook trägt weiterhin `Status: BLOCKIERT`.
- **Paralleler Arbeitsstand, ungemergt:** Branch `claude/helmut-seed-review-6nocps` enthält eine
  read-only Fachprüfung jeder einzelnen Seed-Änderung gegen Production. Sie **bestätigt die hier
  korrigierten Ist-Zahlen unabhängig** (7 Pakete / 163 Abrufwege / 165 Zuordnungen) und empfiehlt
  zusätzlich, `rp-ausschuss-arbeit-soziales` **nicht** mitzuaktivieren (einziger Google-Weg ohne
  belegten Eigenertrag). **Bewertet, triagiert und dokumentiert** — Einzelheiten in §6d.1/§6d.2
  des Runbooks.
- **Nicht getan (bewusst):** kein Production-Zugriff, weder lesend noch schreibend · kein Backup
  ausgeführt · keine Seeds eingespielt · kein Restore gefahren · keine Secrets gelesen, gesetzt
  oder rotiert · keine Cron-Änderung · keine Quelle aktiviert oder deaktiviert · keine Änderung
  an der Paketfachlogik oder an `required_classes` · kein weiterer PR gemergt.

**Sprint „Merge #123 + Sicherung und Restore für die Seed-Einspielung" — Nachweis**

- **PR #123 gemergt** als Merge-Commit `bed7f53` (Doku-only). Vorher geprüft: `mergeable: clean`,
  CI-Pflichtchecks grün, keine offenen Reviews, kein Code-Pfad berührt. Auf `main` gegengeprüft:
  `betrieb/quellen-seed-einspielung.md` trägt weiterhin `Status: BLOCKIERT`.
- **Backup-Umfang.** `scripts/backup-export.js` bekommt einen `--scope=seed`-Modus: genau die
  **8 Tabellen**, die die beiden Seeds berühren oder per Fremdschlüssel daran hängen
  (`geographies`, `political_entities`, `publishers`, `retrieval_paths`, `source_packages`,
  `package_paths`, `path_expected_levels`, `path_expected_geographies`), in FK-sicherer
  Restore-Reihenfolge. Neu **für beide Modi**: serverseitige Zeilenzahl-Gegenprobe per
  `Prefer: count=exact`, SHA-256 je Tabelle plus Gesamtprüfsumme, der gesicherte `main`-Commit
  im Manifest, und ein `vollstaendig`-Flag mit Exit-Code 1 — ein still gekapptes Teil-Backup
  kann damit nicht mehr wie ein vollständiges aussehen. Das Skript bleibt **ausschließlich
  lesend** (nur `GET`).
- **Restore-Status: gebaut und getestet, nicht ausgeführt.** `scripts/seed-restore-sql.js` ist ein
  reiner **SQL-Generator** — kein DB-Client, kein Netzwerk, kein Schreibpfad. Er erzeugt aus einem
  Pre-Seed-Backup ein zeilenscharfes Rückbau-Skript: eine Transaktion mit Vorprüfung
  (`raise exception` bei Abweichung), gezielten `update`s auf die 6 Abrufwege, `delete … not in`
  plus Wiedereinfügen der gesicherten Paketzuordnungen, bedingtem Entfernen der 2 neuen Pakete
  und einer Nachprüfung. **Kein `drop table … cascade`** — das war der bisherige Rollback und ist
  wegen `ON DELETE CASCADE` auf `retrieval_paths.publisher_id` und beiden `package_paths`-FKs für
  gezielten Rückbau unbrauchbar. Ehrliche Grenze: `updated_at` ist wegen des `set_updated_at`-
  Triggers **nicht** wiederherstellbar.
- **Testergebnisse (echte Zahlen).** `scripts/seed-restore-test.js`: **33 PASS, 0 FAIL** lokal,
  **31 PASS, 0 FAIL** in CI (zwei Herkunftsprüfungen der Fixture brauchen die volle Git-Historie
  und melden im flachen CI-Klon ausdrücklich „nicht prüfbar" statt still durchzulaufen) — 14
  Gruppen, darunter Byte-Gleichheit der zurückgeschriebenen Spalten, Idempotenz des Restores,
  Schutz der Eltern-Zeilen, Abbruch bei verändertem Ausgangszustand und „kein Restdiff nach
  vollständigem Zyklus". Kanonische Offline-Suite: **145/145 Suiten grün**. Der Test
  arbeitet auf **synthetischen Fixtures** aus den committeten Seeds — **keine
  Production-Daten**. Eine formprüfende Mutation im Generator erzeugt reproduzierbar **2 FAIL**
  (Erkennung belegt); zwei formverändernde Mutationen brachten den Mini-Executor stattdessen zum
  Abbruch — als Grenze in `betrieb/quellen-seed-einspielung.md` §5b offen dokumentiert.
- **Die 6 betroffenen Retrieval Paths** (heute `broken`, Seed 1 setzt sie auf `needs_review` und
  macht sie damit **absichtlich wieder ausführbar**):

  | # | Pfad-ID | Betreiber | Abruf | Aktivierung |
  |---|---|---|---|---|
  | 1 | `rp-bundestag` | bundestag.de | Direktfeed (RSS) | `always_on` — **läuft sofort** |
  | 2 | `rp-bundesregierung` | bundesregierung.de | Google News | `always_on` — **läuft sofort** |
  | 3 | `rp-die-linke` | die-linke.de | Google News | `auto` — nur bei aktivem Paket |
  | 4 | `rp-linksfraktion` | dielinkebt.de | Direktfeed (RSS) | `auto` |
  | 5 | `rp-ausschuss-arbeit-soziales` | bundestag.de | Google News | `auto` |
  | 6 | `rp-dgb` | dgb.de | Google News | `auto` |

  Kontrollkarten je Weg (URL, Parser, Item-Deckel, Ausfallmuster, Dedup-Verhalten):
  `betrieb/quellen-seed-einspielung.md` §6b.
- **Entscheidung: weiterhin Option B — Ausführung blockiert.** Werkzeug und Rückweg stehen
  bereit und sind getestet; es fehlen genau zwei Betreiberhandlungen (§4, §11): die Sicherung
  muss **tatsächlich gelaufen** sein (`vollstaendig: true`), und die Reaktivierung der 6
  Bundeswege muss ausdrücklich mitfreigegeben werden.
- **Fehlende Betreiberfreigaben:** (1) Production-Lesezugriff für den Pre-Seed-Export ausführen ·
  (2) Reaktivierung der 6 Bundeswege · (3) Seed-Ausführung selbst · (4) OP-01 (Supabase Pro/PITR)
  als dauerhafte Lösung.
- **Nicht getan (bewusst):** kein Production-Backup ausgeführt, kein Seed eingespielt, kein
  Restore gefahren, kein Production-Schreibzugriff, keine Secrets, keine Cron-Änderung, kein
  Flag, kein weiterer PR gemergt.
**Sprint „Quellenpakete inventarisieren + Paketzuweisung beweisen" — Nachweis**

- **Auftrag:** die beiden nächsten zusammenhängenden Phase-1-Punkte schließen — Punkt 18
  (Production-Inventur aller Quellenpakete) und Punkt 12 (automatische Paketzuweisung
  beweisen).
- **Was erledigt wurde:** vollständige, rein lesende Production-Inventur aller Pakete
  (Wege, Aktivierung, Ertrag, letzte Lieferung, Fehler, Pflichtklassen, zugeordnete
  Profile) in `quellenarchitektur/30-paket-inventur-production.md`; Nachweis der
  automatischen Paketzuweisung für Bundestag/Berlin/Brandenburg **gegen den echten
  Production-Katalog** und zusätzlich als Offline-Suite
  `scripts/paketzuweisung-nachweis-test.js`; neue operative Checkliste
  `docs/roadmap/phase_1_checkliste.md` (11 ✅ / 7 ⏳ / 12 ☐).
- **Ergebnis der Zuweisungsprüfung:** Bund→`bund-basis`, Berlin→`berlin-basis`,
  Brandenburg→`brandenburg-basis`; Fachpakete entstehen aus Profildaten; keine fremden
  Regionalpakete; kein Mandant im Code hartkodiert (Sachzuordnung ist unter beliebiger
  Profil-ID identisch); drei zusätzliche Profile ändern an den Bestandsmandanten nichts
  (145 → 145 aktive Abrufwege); Berlin/Brandenburg bleiben ehrlich `requested_unsupplied`.
- **Modell ↔ Realität abgeglichen:** 145 modell-aktive Wege gegen 145 real gecrawlte
  Quellen vollständig aufgelöst (138 Katalogwege + 7 profilgenerierte Personensuchen;
  6 defekte Wege und DIP laufen bewusst nicht mit); 0 Berlin-/Brandenburg-Wege im Lauf.
- **Gefundene Abweichungen (A-1…A-8):** in der Inventur §7 dokumentiert. Doku-Fehler in
  `quellenarchitektur/07-…` korrigiert (Landespakete sind nicht leer; der Resolver ist
  seit dem Cutover live verdrahtet). **A-1** hat OP-04 in der Restliste verschärft.
  **A-3** (Landes-Basispakete nicht mandantenneutral) und **A-4** (2 von 5
  `always_on`-Kernwegen defekt) sind seit dem Merge von #118 **auf `main` behoben**, in der
  **Production-Datenbank aber weiterhin wirksam** — dafür fehlt das freigabepflichtige
  Einspielen der Seeds (§11).
- **Was bewusst nicht erledigt wurde:** keine Production-Datenänderung, kein Seed-Einspielen,
  keine Migration, keine Aktivierung von Berlin/Brandenburg, kein Deaktivieren bestehender
  Quellen, keine Flag-/Cron-/Secret-Änderung, kein Anlegen echter Profile. Keine Änderung an
  `profile-packages.js` oder `seeds/packages.js` — die Zuweisungslogik war fehlerfrei.
- **Tests:** Offline-Suite **145/145 grün** (`node scripts/run-offline-tests.js`, 38 s); neue
  Suite `paketzuweisung-nachweis-test` **147/147** nach dem Rebase auf `61767a9` (die zwei
  neuen Landes-Parteipakete aus #118 sind mit abgedeckt), dreimal wiederholt byte-identisch.
  Kein Browser-Smoke nötig (keine UI-Änderung).
- **Merge:** PR #124 auf ausdrückliche Betreiberfreigabe gemergt (`118e90c`, 2026-07-25).
  Vorab verifiziert: `mergeable_state: clean`, beide Pflicht-Checks grün (Offline-Suite,
  Chromium-Smoke), Vercel-Preview `Ready`, keine offenen Reviews/Change-Requests, kein
  Rebase nötig (Basis = aktueller `main`-Stand). Nach dem Merge gegengeprüft: CI auf dem
  Merge-Commit grün, Vercel-Production-Deployment `dpl_47sPA8z5T11rWjYT4J6R83XdxPd8`
  `READY` mit `githubCommitSha=118e90c`.
- **Nächster Schritt:** Freigabe für das Einspielen der beiden Seeds — vorbereitet und
  bewertet in [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md),
  derzeit blockiert durch die fehlende Sicherung (§11).

**Sprint „Merge PR #118 + Seed-Vorbereitung" — Nachweis**

- **PR #118 gemergt** als Merge-Commit `61767a9`. Vorab alle zwölf Bedingungen verifiziert
  (`clean`, CI 5/5, 0 fehlende `main`-Commits, keine Reviews, Trockenlauf konfliktfrei, alle vier
  Korrekturen im Branch, keine festen Personen-IDs). CI auf `main` **grün**, Vercel-Production
  `READY`. Auf `main` gegengeprüft: Aufräum-DELETE vorhanden, Editionspinning gesetzt, 0
  `broken`-Annotationen in `catalog.js`.
- **Der Merge hat die Datenbank nicht verändert** — verifiziert: kein Workflow, kein Cron und kein
  Server-Pfad spielt Seeds ein; die Dateien werden ausschließlich von Test-/Preflight-Skripten
  gelesen.
- **Seed-Sprint vorbereitet, nicht ausgeführt.** Vollständige Vorlage inklusive Soll-Zahlen,
  Reihenfolge, Idempotenznachweis, Rollback-Bewertung, Go-/Stop-Kriterien und Betreiberentscheidung:
  [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md).
- **Vorschau (lokal simuliert, kein Production-Zugriff):** Seed 1 → +2 Pakete, +1 Paketzuordnung,
  6 Abrufwege aktualisiert; Seed 2 → 4 alte Paketzuordnungen entfernt, 4 neue eingefügt.
  Betroffen: **0** Publisher · **6** Retrieval Paths · **4** Source Packages · **4** entfernte und
  **5** neu eingefügte Paketzuordnungen. Zweiter Lauf beider Seeds: **0 Änderungen** (idempotent).
- **Wichtigster operativer Punkt:** die 6 reparierten Bundeswege stehen in Production auf
  `broken` und laufen deshalb heute **nicht**. Seed 1 setzt sie auf `needs_review` und macht sie
  damit **absichtlich wieder ausführbar** — am Crawl-Plan verifiziert: +2 garantiert und sofort
  (die beiden `always_on`-Wege), bis zu +4 weitere abhängig vom Live-Profilbestand. Das muss
  ausdrücklich mitfreigegeben werden. Keine Amplifikation (Shared-Path-Dedup aus #120), keine
  zusätzlichen KI-Kosten.
- **Berlin/Brandenburg bleiben gesperrt** — verifiziert: alle 18 BE/BB-Wege `landesmodul-gesperrt`,
  0 im aktiven Plan; das Gate greift über Pfad-IDs, nicht über Paketschlüssel.
- **Backup/Rollback:** **kein Backup, kein PITR** (Supabase Free-Plan, Folge von OP-01). Feiner
  Rollback existiert nur für Seed 2; der Bund-Rollback ist ein `drop table … cascade` und für
  gezielten Rückbau unbrauchbar. Ein Rollback stellt die alten Zuordnungen **nicht** wieder her.
- **Entscheidung: Option B — Ausführung blockiert.** Es fehlt genau eine belastbare Sicherung.
  Kleinster Weg ohne Kostenentscheidung: `node scripts/backup-export.js` vor dem Lauf. Dauerhaft:
  OP-01 freigeben. **Die Kostenentscheidung liegt beim Betreiber.**

**Sprint „Merge #122 + Review PR #118" — Nachweis**

- **PR #122 gemergt** (`54fe370`, Merge-Commit). Vorab verifiziert: `clean`, CI 3/3 grün, keine
  neuen `main`-Commits, keine Reviews, Trockenlauf konfliktfrei, Diff = nur die angekündigte
  Doku-Korrektur. Danach auf `main` gegengeprüft: Banner und Tabelle nennen beide `d6d9063`/#113
  als Re-Anker, der Altwert `035898b`/#114 kommt im Dokument nicht mehr vor.
- **PR #118 adversarial reviewt** (5 spezialisierte Prüfer, jeder Befund gegen den echten Code
  verifiziert). **Weiterhin nötig:** P0-1 ist auf `main` nachweislich offen — die committeten
  Seeds reproduzieren dort nicht aus dem Code (empirisch: realer Diff). Nicht überholt.
- **Verifizierte Risiken — entwarnt:**
  - *Kein* BE/BB-Aktivierungsleck: das harte Gate greift über die Pfad-IDs (`rp-be-`/`rp-bb-`),
    nicht über Paketschlüssel. Ausführung von `buildRelationalCrawlPlan` mit einem Berlin-/
    Linke-Landtagsprofil: alle 18 BE/BB-Wege `landesmodul-gesperrt`, `plan.aktiv = []`.
    Zweite Barriere: beide neuen Pakete sind `prepared` → nie `active`.
  - *Keine* neue Crawl-Amplifikation: die 4 neuen Google-News-Wege sind mandantenunabhängig und
    werden von der Shared-Path-Dedup aus PR #120 abgedeckt (Mandant 2+ → `skipped-shared`).
  - *Kein* Konflikt mit #105/#120/#121/#122; Merge konfliktfrei; Provenienz (`site:`-Filter hält
    die Herausgeber-Domain) intakt; keine festen Personen-IDs; Paketzuweisung datengetrieben.
  - `sources.js` ist trotz `SOURCE_MODE=on` produktionswirksam (`toCrawlerSource` gibt das
    Legacy-Objekt zurück). Die 6 reparierten Wege tragen in der DB aber weiterhin `status='broken'`
    und bleiben damit ausgeschlossen — die Reparatur wird erst mit dem **freigabepflichtigen**
    Seed-Einspielen wirksam. Der Merge allein ändert das Crawl-Verhalten nicht.
- **Behobene Defekte (in #118 nachgebessert):** (1) P0-2 war in der **Datenbank** wirkungslos —
  der Seed verschob die Partei-/Personenwege per `insert … on conflict do nothing` ohne Delete,
  die alten Zuordnungen am Pflicht-Basispaket wären geblieben (Seed 20260717 ist laut
  `quellenarchitektur/18-production-freigabeanfrage.md` in Production angewendet); (2) die einzige
  Google-News-URL ohne Editions-/Sprachpinning; (3) zwei Testlücken, beide per Mutationstest
  belegt (Sortierung nach Schwere nirgends mehr abgedeckt; zwei nie fehlschlagende Zusicherungen).
- **Tests:** Offline-Suite **144/144 grün** · source-architecture 97/0 · admin-source-report 56/0 ·
  profile-packages 69/0 · landesmodule-kandidaten 77/0 · quality-watchdog 66/0 ·
  tenant-neutrality 39/0 · seed-drift grün (adversarial: Manipulation auf Code- **und** Seed-Seite
  wird gefangen) · Generatoren byte-identisch · Mutationsproben rot wie erwartet.
- **Offene Entscheidungen (bewusst nicht geändert):** `required_classes` von
  `die-linke-brandenburg` (3 Pflichtklassen, nur `partei_pilot` belegt) ist eine **fachliche**
  Paketfrage; Rollback lässt zwei leere `prepared`-Pakete stehen (kosmetisch); die
  **Google-News-Konzentration** steigt von 134 auf 138 von 143 Wegen — bei offenem Circuit Breaker
  liefern nur noch 5 statt 9 Direktfeeds. Das ist kein Defekt dieses PRs, aber der wichtigste
  verbleibende Architekturpunkt (SPOF, im Audit als eigener P1 geführt).
- **Merge-Empfehlung:** **ja** (Option B abgeschlossen). Merge und Deployment bleiben beim Betreiber.

**Sprint „Recovery-Pfad: Review, Stilllegung, Merge" — Nachweis**

- **Was versucht wurde:** prüfen, ob der Understanding-Recovery-Pfad auf `main`
  tatsächlich noch scharf ist, das Production-Risiko bewerten, PR #105 vollständig
  gegen `main` reviewen und ihn mergefähig machen.
- **Was erledigt wurde:** Der Verdacht wurde **bestätigt** (F-3). Die Stilllegung in
  PR #105 wurde gegen den Code geprüft und ist **technisch wirksam**, nicht nur
  dokumentarisch — belegt durch einen Subprozess-Aufruf mit Flag *und* korrektem
  Token, der `{executed:false, stillgelegt:true}` liefert. Ein verifizierter Defekt
  wurde behoben: die Regression prüfte nur **einen festen Dateinamen** und hätte eine
  umbenannte Action nicht gefangen — ersetzt durch einen namensunabhängigen Riegel
  über alle Workflows (Negativkontrolle: eine umbenannt wiederhergestellte Kopie
  lässt den Test korrekt fehlschlagen). Die frühere PR-Empfehlung, beim späteren
  `impl-2`-Merge dessen Fassung zu übernehmen, war gefährlich und wurde
  zurückgezogen. PR #105 wurde auf `main` `c6a3d40` gezogen; seine eigene, vor #119
  angelegte `CURRENT_STATE.md` ist in **diese** kanonische Datei überführt. Danach
  gemergt (siehe unten).
- **Merge:** PR #105 auf ausdrückliche Betreiberfreigabe als Merge-Commit gemergt
  (`43e9e35`, 2026-07-25). Vorab verifiziert: `mergeable_state: clean`, CI 3/3 grün,
  keine neuen `main`-Commits, keine Reviews/Change-Requests, Trockenlauf konfliktfrei.
  Nach dem Merge auf `main` gegengeprüft: Workflow entfernt, `RECOVERY_ALLOWLIST` `[]`,
  0 `require` im Execute-Skript.
- **Was nicht erledigt wurde:** keine Ausführung von OP-06 und keine Recovery — beides
  freigabepflichtig. Die mandatsrelative OP-06-Allowlist wurde bewusst **nicht**
  fachlich neu bewertet (§3). Keine Migration, keine Flag-Aktivierung, keine
  Production-Datenänderung.
- **Tests:** Offline-Suite **141/141 grün** · `understanding-recovery` 57/57 (davon 2
  neu) · `pending-terminal` 63/63 · `tenant-neutrality` 39/39 · `tenant-guard` 37/37 ·
  `ko-recovery` 12/12 · YAML-Validierung aller Workflows · 55 Doku-Verweise (0 tot) ·
  Negativkontrolle umbenannter Workflow.
- **Offener Folgepunkt:** die OP-06-Fachfrage (§3) — nicht blockierend, da OP-06
  Default AUS ist und ein eigenes Token braucht.
