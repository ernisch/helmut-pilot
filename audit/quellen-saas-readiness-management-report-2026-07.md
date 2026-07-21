# Helmut — Nationale Quellenbibliothek & SaaS-Readiness-Audit

**Management Report** · Stand **2026-07-21** · Modus: **rein lesend** (keine Prod-Änderung, kein Deploy, keine Migration)
**Belegbasis:** `lib/helmut/sources.js`, `lib/helmut/scheduler.js`, `lib/helmut/matching.js`, `lib/helmut/provisioning.js`,
`lib/helmut/quellenarchitektur/*` (catalog/seeds/source-mode/quality-watchdog/profile-packages/source-telemetry),
`docs/quellenarchitektur/00-master-status.md`, `docs/datenmotor-restliste.md`, sowie die Vor-Audits in `audit/` (2026-07-12).
Zahlen unten sind **im Prozess nachgerechnet** (Katalog-Build ohne Netz), nicht geschätzt.

---

## 0 · Executive Summary (für Eilige)

Helmut ist heute ein **technisch sauberer, aber inhaltlich einseitiger Single-Mandat-Pilot**.
Der Rechenkern (Matching, Scoring, Radar, Dedup, Mandantentrennung) ist **partei-neutral und sauber gebaut**.
Die **Quellenbasis** ist es **nicht**: Sie ist auf **ein Politikfeld (Arbeit & Soziales)**, **eine Partei (Die Linke)** und
**eine Region (Niedersachsen)** zugeschnitten — exakt das Profil des Pilot-Abgeordneten.

> **Ein Satz:** Helmut kann heute einen Die-Linke-Sozialpolitiker aus Niedersachsen hervorragend versorgen —
> aber **keinen beliebigen** Bundestagsabgeordneten. Ein CDU-Verteidigungspolitiker, eine Grünen-Finanzpolitikerin
> oder ein AfD-Gesundheitspolitiker bekämen heute ein **dünnes, generisches, google-news-lastiges Briefing** ohne Fachtiefe
> und ohne eigene Parteistimme.

**Die vier strukturellen Kernbefunde:**

| # | Befund | Zahl |
|---|---|---|
| K1 | **Thematische Monokultur** — Fachtiefe nur für Arbeit & Soziales | **88 von 143** aktiven Quellen sind auf Sozialthemen gated |
| K2 | **Partei-Asymmetrie** — nur Die Linke hat Direktquellen + eigenes Paket | Die Linke **3** Quellen/eigenes Paket · Grüne/AfD/FDP/BSW je **1** Google-News-Suche |
| K3 | **Google-News-Monokultur** — fragiler batchexecute-Decoder als Rückgrat | **134 von 143** (94 %) Abrufe laufen über news.google.com |
| K4 | **Leere Fremdprofile** — reiche Profildaten leben nur im Code des Piloten | Fremdmandat = `neutralProfileDefaults` → auch das Theme-Gate feuert nicht |

---

## Phase 1 · Vollständige Inventur

### 1.1 Aktiver Bestand (kuratiert, Production-Modus `HELMUT_SOURCE_MODE=on` seit 2026-07-15)

| Kennzahl | Wert |
|---|---|
| Aktive Quellen (kuratiert) | **143** (Rohkatalog 560, `slice`/Kuratierung reduziert) |
| davon **Google-News-Suchen** | **134** (94 %) |
| davon **echte Direktfeeds** | **9** (7 RSS + 2 HTML) |
| davon **neutral** (jedes Mandat) | 53 |
| davon **A&S-theme-gated** | 88 |
| davon **regional** | 4 (nur Niedersachsen) |
| relationale Abrufwege gesamt (DB) | 163 · aktiv ~138 · **broken 6** · BE/BB gesperrt 18 · DIP separat |
| aktive Pakete | 5: bund-basis · arbeit-und-soziales · die-linke-bund · regional-niedersachsen · profil-`<pilot>` |

### 1.2 Die 9 Direktfeeds (das eigentliche Rückgrat) — Gesundheit aus statischem Audit-Snapshot (2026-07-13)

| Quelle | Typ | Methode | Zustand (Snapshot) | Kritisch | Ersatz heute |
|---|---|---|---|---|---|
| bmas | Ministerium | RSS | **healthy** | ja | — |
| tagesschau-politik | Medien | RSS | **healthy** | ja | — |
| deutschlandfunk-politik | Medien | RSS | **healthy** | ja | — |
| DIP (Bundestag) | Parlament | API | **healthy** | ja | — |
| bundestag | Parlament | RSS | **broken** | ja | general-hib, plenum, DIP |
| bundesregierung | Regierung | RSS | **broken** | ja | general-bundesregierung-vorhaben (GN) |
| die-linke | Partei | RSS | **broken** | ja | fraction-linke (GN) |
| linksfraktion | Fraktion | RSS | **broken** | ja | fraction-linke (GN) |
| ausschuss-arbeit-soziales | Ausschuss | HTML | **broken** | nein | 25+ committee-Radare (GN) |
| dgb | Verband | HTML | **broken** | nein | verdi/ig-metall (GN) |

→ **Real gesund sind nur 3 Direktfeeds + DIP.** Alles andere hängt an Google News.

### 1.3 Publisher / Entitäten / Pakete (Struktur vs. Belegung)

| Ebene | Struktur vorhanden | Real mit Abrufwegen belegt |
|---|---|---|
| Parteien (Entitäten) | **9** (CDU,CSU,SPD,Grüne,FDP,AfD,Linke,BSW,SSW) | nur **Die Linke** direkt |
| Fraktionen (Entitäten) | **8** | alle als **je 1 Google-News-Suche** |
| Ausschüsse (Entitäten) | **23** | alle als **je 1 Google-News-Suche** (neutral) |
| Ministerien (Entitäten) | **6** von ~15 | bmas direkt, Rest GN/fehlend |
| Bundestag/Bundesrat/Regierung | ja | Bundestag/Regierung broken, DIP aktiv |
| Verbände/Gewerkschaften | 11 | alle GN, A&S-gated |
| Behörden/Statistik | 5 (alle sozialpolitisch) | GN, A&S-gated |
| **Landesquellen** | Niedersachsen aktiv; BE/BB `prepared` | **nur Niedersachsen**; 14 weitere Länder: keine |
| Presseportale/RSS/HTML/APIs | s. 1.1 | 9 direkt, DIP-API, Rest GN |

**Verzeichnis (Herausgeber-Kanon):** `seeds/publishers.js` — sauber, aber sozialpolitisch geprägt (DGB, VdK, SoVD, Caritas…).
**Entitätsschicht** (`seeds/entities.js`) ist bereits **breit** (alle Parteien/Fraktionen/Ausschüsse) — die **Abrufwege dahinter fehlen** außerhalb A&S.

---

## Phase 2 · Gesundheitsprüfung — „wirklich defekt" vs. „nur falsch markiert"

**Zentraler Systembefund:** Es gibt **zwei entkoppelte Welten**, die nie zusammenlaufen:

1. **Statischer Snapshot** (`KNOWN_PATH_HEALTH`, `catalog.js`): manuelles CSV-Audit vom **2026-07-13**, in die Seed-Zeilen
   `retrieval_paths.status` eingefroren. Wird nur **gelesen** (Admin-Panel, Watchdog) — **nie neu getestet, nie zurückgeschrieben**.
2. **Runtime-Telemetrie** (`source_crawl_telemetry`, Sprint 7): pro Abruf echte Messwerte (Status, Fehlercode, Dauer, Retries) —
   **in den Crawler verdrahtet**, in Prod aktiv (145 Zeilen/Crawl), **aber ohne Lesepfad** und schreibt **nicht** auf die
   Health-Spalten zurück.

**Konsequenz:** Die Spalten `status / error_streak / last_success_at / last_error` sind **inerte Seed-Daten**.
Kein Job re-testet Feeds. Das UI warnt das selbst: *„Fehlerserie 0 und ohne letzten Erfolg/Fehler sind so konfiguriert,
nicht beobachtet ausgefallen."* → **„Zuletzt benutzt / erfolgreich / fehlgeschlagen" pro Quelle existiert als Spalte, ist aber leer.**

| Klassifikation | Quellen | Bewertung |
|---|---|---|
| **funktioniert (verifiziert)** | bmas, tagesschau, deutschlandfunk, DIP | echte gesunde Direktfeeds |
| **wirklich defekt (Bot/403)** | die-linke, linksfraktion, dgb, ausschuss-a-s (HTML/RSS bot-gesperrt) | Reparatur wäre teils nur GN-Umweg |
| **defekt, aber echter Direktfeed verfügbar** | **bundestag** (`…/pressemitteilungen.rss`), **linksfraktion** (`…/feed.rss`) | **verifiziert (Sprint 9B), aber nicht angewandt** — Beleg-Qualitäts-Gap |
| **nie live getestet** | **134 Google-News-Suchen** | Status pauschal `needs_review`; nur Aggregat-Provider-Breakdown pro Lauf |
| **falsch markiert / nicht unterscheidbar** | ganzer GN-Block | System **kann** „echt tot" nicht von „gerade gedrosselt" trennen |
| **deaktiviert (bewusst)** | 18 BE/BB-Wege | hart gesperrt, korrekt |

**Betriebsbefund B1 (real gemessen):** Ein 20:00-Crawl degradierte auf **129/145** — **alle 129 Ausfälle Google News**,
3/3 Direktquellen ok. Härtung (Circuit-Breaker/Cooldown) ist gebaut + offline getestet, **aber nicht production-bewiesen**;
das **strukturelle Klumpenrisiko** (146/163 Wege Google) bleibt.

**Fehlerklassen, die das System kennt** (`classifyCrawlError`): timeout, circuit-open, empty-feed, http-429/4xx/5xx, dns, connection, tls, response-too-large, parse — die Taxonomie ist da, die **Auswertung fehlt** (kein Read-Pfad).

---

## Phase 3 · Partei-Audit

**Frage je Partei: Kann heute automatisch ein hochwertiges Briefing entstehen?**

| Partei | Quellen (kuratiert) | Direkt | Eigenes Paket | Fachtiefe | Hochwertiges Briefing heute? |
|---|---|---|---|---|---|
| **Die Linke** | 3 (2 Direkt-RSS* + fraction-linke) | ✅ 2 (*broken) | ✅ die-linke-bund | ✅ (nur A&S) | **Ja** — für A&S-Sozialpolitik |
| **SPD** | 2 (1 neutral GN + 1 A&S-GN) | ❌ | ❌ | teils (A&S) | Bedingt |
| **CDU/CSU** | 2 (1 neutral GN + 1 A&S-GN) | ❌ | ❌ | teils (A&S) | Bedingt |
| **Grüne** | **1** (nur fraction-GN) | ❌ | ❌ | ❌ | **Nein** |
| **AfD** | **1** (nur fraction-GN) | ❌ | ❌ | ❌ | **Nein** |
| **FDP** | **1** (nur fraction-GN) | ❌ | ❌ | ❌ | **Nein** |
| **BSW** | **1** (nur fraction-GN) | ❌ | ❌ | ❌ | **Nein** |
| **CSU (eigenständig)** | in CDU/CSU gefaltet | ❌ | ❌ | ❌ | **Nein** (keine eigene Stimme) |

*Die 2 Linke-Direktfeeds sind im Snapshot `broken`; real getragen wird Die Linke aktuell über `fraction-linke` (GN).

**Antworten auf die Pflichtfragen:**
- **Welche Quellen fehlen?** Für **jede Partei außer Die Linke**: eigene Partei-/Fraktions-**Direktfeeds** (Pressemitteilungen-RSS)
  und ein eigenes **Partei-Paket**. CSU braucht eine **eigenständige** Stimme (nicht nur CDU/CSU).
- **Welche Quellen sind redundant?** Innerhalb A&S überlappen `radar-*`, `signal-*`, `process-*`, `deepTopic-*` stark
  (bis zu 25 Google-News-Varianten auf denselben Ausschuss).
- **Welche Quellen dominieren zu stark?** Google News (94 %) und das Sozialthema (88/143).
- **Welche Partei ist benachteiligt?** **Alle außer Die Linke.** Am stärksten benachteiligt: **BSW** (neu, keine Direktquelle,
  nur eine GN-Suche) und **CSU** (keine eigene Stimme). Grüne/FDP/AfD nur minimal besser.
- **Welche haben zu wenig Gewicht?** Die Regierungsparteien der jeweils aktuellen Koalition (Regierungshandeln) sind nur über
  broken `bundesregierung` + GN abgedeckt.

---

## Phase 4 · Abgeordneten-Audit — „Morgen meldet sich irgendein MdB an"

**Kann Helmut sofort arbeiten? → Technisch ja (Provisionierung läuft), inhaltlich nein.**

**Provisionierung** (`provisioning.js`) verlangt hart: `id`, `email`, `name`, `password`, **Partei ODER Fraktion**,
`parliamentType` (Bundestag/Landtag), **Region** (Wahlkreis/Land/…), **mind. 1 Ausschuss ODER Fokusthema**.
Fehlt eins → **Abbruch** (`spec-invalid`), nichts wird angelegt. Paket-Zuweisung: immer `bund-basis`; optional
`die-linke-bund` (nur Linke), `arbeit-und-soziales` (nur bei A&S-Thema), `regional-niedersachsen` (nur Niedersachsen).

**Was fehlt / welche Risiken entstehen:**

| Problem | Ursache (Code) | Wirkung für Fremd-MdB |
|---|---|---|
| **Leeres Fachprofil** | reiches Profil lebt nur im Code des Piloten; DB-Profile alle NULL; Fremdmandat = `neutralProfileDefaults` | ohne Topics/Ausschuss **feuert das Theme-Gate nicht** → nur ~53 neutrale Quellen |
| **Kein Fachpaket außer A&S** | `resolveProfilePackages` kennt nur `arbeit-und-soziales` | Verteidigungs-/Finanz-/Gesundheits-MdB bekommt **kein Fachpaket** |
| **Landtag außer BE/BB unmöglich** | `LANDESPAKET_BY_BUNDESLAND` nur Berlin/Brandenburg | jedes andere Land → `requiredMissing`, unterversorgt |
| **KO-Anreicherung nicht gelaufen** | Knowledge Objects ohne tags/policy_field/embedding | Matching-Score deckelt empirisch bei ~47 → **0 „Sofort reagieren"-Karten** |
| **Region-Matching brüchig** | Region nur `slug`, keine Synonyme | „Wahlkreis 50 – Salzgitter" ≠ „Salzgitter" |
| **Ausschuss-Kollision** | `normalizeCommittee` Substring-Fallback | z. B. Menschenrechte→Recht im Ranking-Pfad |
| **Namensgleichheit** | Matcher nutzt **nicht** den Namen (nur Partei/Ausschuss/Region) | zwei MdB gleicher Partei+Ausschuss+Region **ununterscheidbar** |
| **Personenquelle dünn** | `personNewsSource` nutzt **nur den Namen** (kein Wahlkreis/Partei) | Allerweltsnamen → verrauschte Treffer |

**Kann automatisch ein vollständiges Mandatsprofil entstehen? → Nein.** Nur Stammdaten; das inhaltlich reiche Profil
(Themen-Gewichte, Ausschuss-Feinbild) müsste **manuell** gepflegt werden — es gibt keinen Self-Service-Weg.

**Kann automatisch ein Briefing entstehen? → Ja technisch, aber leer/generisch.** Ohne Fachpaket + KO-Anreicherung matcht
das gute Rechenwerk ins Leere: das Ergebnis ist ein neutrales Bundespolitik-Grundrauschen, kein hochwertiges Fachbriefing.

---

## Phase 5 · Gewichtung / Kategorisierung der Quellen

| Kategorie | Quellen | Begründung |
|---|---|---|
| **Pflicht** | DIP-API, bundestag (Direktfeed reparieren), bundesregierung, tagesschau, deutschlandfunk | amtliche Primärbelege + neutrale Leitmedien; ohne sie kein belastbares Briefing |
| **Sehr wichtig** | je Partei ein **Fraktions-Direktfeed** (fehlt außer Linke), alle 23 Ausschuss-Wege, bmas + je Fachressort ein Ministeriumsfeed | Kern jeder Personalisierung nach Partei & Ausschuss |
| **Wichtig** | Leitmedien-Block (Spiegel/ZEIT/SZ/FAZ/Welt/Handelsblatt), Bundesrat, Bundesverfassungsgericht (fehlt), regionale Feeds des jeweiligen Wahlkreises | Kontext, Einordnung, Wahlkreisbezug |
| **Optional** | Fach-/Verbandsquellen je Politikfeld, Think-Tanks, Statistik | Tiefe, aber ersetzbar/aggregierbar |
| **Entfernbar / konsolidieren** | redundante A&S-GN-Cluster (`radar-*`/`signal-*`/`process-*`/`deepTopic-*` — bis 25 Varianten je Thema), Overton/Jacobin-Nischen | erhöhen nur das Google-News-Klumpenrisiko ohne echte Lücke zu schließen |

**Leitprinzip:** **Weniger Google-News-Redundanz, mehr Direktfeeds pro Partei/Ausschuss/Ressort.**

---

## Phase 6 · Lückenanalyse — was komplett fehlt

| Kategorie | Fehlt konkret |
|---|---|
| **Parteien (Direktquellen)** | CDU, CSU (eigenständig), SPD, Grüne, FDP, AfD, BSW, SSW — **Pressemitteilungs-RSS + Partei-Paket** |
| **Fraktionen** | Direktfeeds statt Google-News für alle 8 Fraktionen |
| **Ministerien** | ~9 von 15 fehlen: **BMWK, BMDV, BMBF, BMUV, BMEL, BMVg, BMWSB, BMZ, BMJ, BMBWK, Auswärtiges Amt (Feed)** |
| **Behörden/Bundesinstitutionen** | **BND/BSI, Bundesnetzagentur, BaFin, Bundeskartellamt, Umweltbundesamt, RKI, KBV, Bundesbank, Bundeswahlleiter** |
| **Gerichte** | **Bundesverfassungsgericht, BGH, BVerwG, BSG, BFH, EuGH** (Entscheidungen/Pressemitteilungen) |
| **Parlament** | **Bundestag-Plenarprotokolle/Drucksachen-Feeds** breiter (heute nur DIP+hib), **Bundesrat**-Verfahren direkt |
| **Landesquellen** | 14 Bundesländer ohne aktives Modul (nur Niedersachsen; BE/BB nur vorbereitet) — Landtage, Staatskanzleien, Landesministerien, Landesfraktionen, Regionalmedien |
| **Presse** | überregionale Direktfeeds (heute alle via GN-Suche), **dpa/AFP/Reuters**, **Politico/Table.Media** als Direktbezug |
| **Think Tanks** | SWP, DIW, ifo, IW Köln, Stiftung Wissenschaft und Politik, Konrad-Adenauer-/Friedrich-Ebert-/Heinrich-Böll-/Friedrich-Naumann-Stiftung |
| **Verbände** | über A&S hinaus: BDI/BDA (breit), Bauernverband, VDA, Digitalverband Bitkom, Ärzteverbände, Mieterbund |
| **Öffentliche Daten / APIs** | **abgeordnetenwatch.de-API** (Mandats-/Abstimmungsdaten — löst Phase-4-Profilproblem!), **Bundestag-Open-Data (XML/DIP-Vorgänge breiter)**, **EUR-Lex/EU-Parlament**, **Destatis-GENESIS-API**, Bundesanzeiger |
| **Offizielle RSS-Feeds** | die meisten Ministerien/Behörden bieten echte RSS an — heute ungenutzt zugunsten GN-Suchen |

**Größter Hebel:** eine **abgeordnetenwatch-Integration** (Stammdaten, Ausschussmitgliedschaften, Wahlkreise, Abstimmungen)
würde das Fremdprofil-Problem aus Phase 4 an der Wurzel lösen — Profile entstünden automatisch statt manuell.

---

## Phase 7 · Benchmark vs. professionelle Political-Intelligence-Plattformen (nur Datenbasis)

Vergleichsklasse: Politico Pro, Dods/Fiscal Note, Polteo, Pry, Regierungs-Monitoring-Dienste.

| Dimension | Helmut | Enterprise-Standard |
|---|---|---|
| **Wo besser** | tiefe, redundante **A&S-Abdeckung**; amtliche **DIP-Anbindung**; sauberes Dedup + Evidenz-Belegkette; Mandanten-neutraler Rechenkern | selten so tief in einem Nischenfeld |
| **Wo schlechter** | **Politikfeld-Breite** (nur A&S vs. alle Ressorts); **Partei-Symmetrie**; **Direktquellen** (94 % GN vs. lizenzierte Direktfeeds/Newswire); **Landesebene**; **Gerichts-/EU-Daten**; **Abstimmungs-/Mandatsdaten** | Vollabdeckung aller Ausschüsse/Ressorts, alle Fraktionen direkt, Landtage, EU, Gerichte |
| **Fehlt ggü. Enterprise** | Newswire (dpa/AFP), Volltext-Lizenzen, Gesetzgebungs-Tracking über alle Vorgänge, Abstimmungsdaten, Lobbyregister, EU-Ebene | Standard dort |
| **Was Helmut wirklich braucht** | Partei-Direktfeeds, Ressort-Breite (min. 1 Direktfeed je Ausschuss/Ministerium), abgeordnetenwatch-API, Landesmodule, Gerichts-Feeds | — |
| **Was Helmut NICHT braucht** | teure Volltext-Newswire-Lizenzen, globale Abdeckung, Social-Media-Firehose, Echtzeit-Sentiment | Enterprise-Ballast |

**Fazit Benchmark:** Helmut ist in **einem Feld tiefer als nötig** und in **Breite/Symmetrie deutlich unter** Enterprise —
die richtige Antwort ist **nicht mehr Masse**, sondern **gezielte Direktquellen-Breite** über Parteien und Ressorts.

---

## Phase 8 · Priorisierte Roadmap

### P0 — unbedingt vor SaaS-Start (Verkaufsblocker)

| ID | Maßnahme | Warum |
|---|---|---|
| P0-1 | **Partei-Direktfeeds + Partei-Pakete für alle 8 Fraktionen** (CDU,CSU,SPD,Grüne,FDP,AfD,BSW,Linke) | ohne eigene Parteistimme kein hochwertiges Briefing außer Die Linke (K2) |
| P0-2 | **Politikfeld-Breite**: je Ausschuss/Ministerium **mind. 1 Direkt- oder kuratierte Fachquelle** entkoppelt von A&S-Gate | K1: heute nur A&S Fachtiefe |
| P0-3 | **Fremdprofil-Versorgung**: reiche Profile in die DB + **abgeordnetenwatch-API** für Auto-Profil (Ausschüsse/Wahlkreis) | K4: sonst leeres Briefing (Phase 4) |
| P0-4 | **KO-Anreicherung/Backfill** ausführen (OP-08) + Klassifikation | ohne tags/policy_field 0 „Sofort reagieren"-Karten |
| P0-5 | **2 verifizierte Direktfeeds reparieren** (`rp-bundestag`, `rp-linksfraktion`, Muster für andere Parteien) | Primär-Beleg-Qualität; Muster für P0-1 |
| P0-6 | **Google-News-Klumpen mindern** (OP-15): Kernwege auf Direkt-RSS, GN-Redundanz konsolidieren | K3/B1: 94 % Single-Point-of-Failure |
| P0-7 | **Backups (Supabase Pro + PITR, OP-01)**, **DB-Mandantentrennung scharf (OP-03)**, **Demo-Mandate löschen (OP-04)** | Betrieb/DSGVO/Verkauf |

### P1 — kurz danach (Betriebsreife)

- **Source-Health scharfschalten**: `source_crawl_telemetry`-**Read-Pfad** + Rückschreiben auf `retrieval_paths.status`;
  automatisches Re-Testen der „broken"-Feeds (Phase 2: heute frozen Snapshot).
- **Region-/Ausschuss-Normalisierung** härten (Wahlkreis-Synonyme, Ausschuss-Kollisionen).
- **Monitoring-Zweitkanal aktivieren** (OP-07) · **Cron-Reihenfolge** (OP-16) · **Understanding-Gate on** (OP-18).
- **Ministerien-Direktfeeds** vervollständigen (BMWK/BMDV/BMBF/BMUV/BMEL/BMVg/BMWSB/BMZ/BMJ + AA).

### P2 — später (Produktqualität)

- **Landesmodule** über Niedersachsen/BE/BB hinaus (OP-21) — schrittweise 16 Länder.
- **Gerichts- und EU-Ebene** (BVerfG/BGH/BSG/EuGH, EUR-Lex).
- **Think-Tank- und Verbands-Breite** je Politikfeld.
- **Scoring scharfschalten** (OP-22), Personenquelle um Wahlkreis/Partei anreichern.

### P3 — Luxus

- Newswire-Direktbezug (dpa/AFP), Lobbyregister, Abstimmungs-Analytik, Sentiment, EU-Parlament-Feintracking,
  Bundesanzeiger/Bundesbank/BaFin-Spezialdaten.

---

## FINALE FRAGE

> **„Ist Helmut heute bereit, jeden Bundestagsabgeordneten unabhängig von Partei und Ausschüssen mit hochwertigen Briefings zu versorgen?"**

## ❌ **Nein.**

Helmut versorgt **einen Quellen-Steckbrief** hervorragend: **Die Linke · Arbeit & Soziales · Niedersachsen**.
Für **jeden anderen** Abgeordneten fehlen (a) die **Partei-Direktquellen**, (b) die **Fachtiefe außerhalb A&S**,
(c) die **automatische Profilversorgung** und (d) eine **belastbare, live-getestete Quellenbasis** statt eines 94-%-Google-News-Fundaments.
Der **Rechenkern ist bereit** — die **Quellenbibliothek ist es nicht**.

---

### Checkliste bis zur vollständigen SaaS-Readiness

**A — Quellenbreite (der eigentliche Sprint-Kern)**
- [ ] Partei-Direktfeeds + Partei-Pakete für alle 8 Fraktionen (P0-1)
- [ ] CSU als eigenständige Stimme (nicht nur CDU/CSU)
- [ ] Je Ausschuss (23) + je Ministerium (15) mindestens eine vom A&S-Gate entkoppelte Fachquelle (P0-2)
- [ ] Bundesverfassungsgericht/BGH/BSG + Bundesrat-Verfahren als Direktbezug
- [ ] Google-News-Anteil von 94 % auf Direktfeed-Basis senken; redundante A&S-GN-Cluster konsolidieren (P0-6)
- [ ] 6 „broken" Direktfeeds reparieren (priorisiert bundestag + linksfraktion) (P0-5)

**B — Profil & Matching (damit Breite ankommt)**
- [ ] abgeordnetenwatch-API für Auto-Mandatsprofil (Ausschüsse/Wahlkreis/Abstimmungen) (P0-3)
- [ ] Reiche Profile aus dem Code in die DB verlagern; `neutralProfileDefaults` durch echte Versorgung ersetzen
- [ ] KO-Anreicherung/Backfill ausführen (P0-4)
- [ ] Region-/Ausschuss-Normalisierung härten (Wahlkreis-Synonyme, Kollisionen)
- [ ] Fachpaket-Resolver über `arbeit-und-soziales` hinaus (je Politikfeld ein Paket)

**C — Quellen-Gesundheit sichtbar & selbstheilend**
- [ ] `source_crawl_telemetry`-Lesepfad + Rückschreiben auf `retrieval_paths.status`
- [ ] Automatisches Re-Testen/Statuspflege der Feeds (statt frozen 2026-07-13-Snapshot)
- [ ] Monitoring-Zweitkanal + Alarm aktivieren (OP-07)

**D — Betrieb / Recht / Sicherheit (parallel)**
- [ ] Supabase Pro + PITR (OP-01) · DB-seitige Mandantentrennung scharf (OP-03) · Demo-Mandate entfernen (OP-04)
- [ ] Per-Mandant-Kostendeckel aktiv (OP-03) · Rechtsrahmen (AVV/DSFA, OP-02)
- [ ] Self-Service-Onboarding/Provisioning-UI

**Realistischer nächster Meilenstein:** **nicht** offener SaaS-Verkauf, sondern ein **zweiter, kontrollierter Pilot einer
anderen Partei/eines anderen Ausschusses** — genau dieser Schritt deckt die Breiten-Lücken A+B auf, bevor sie einen zahlenden Kunden treffen.

---

*Erstellt 2026-07-21, rein lesend gegen Code (`main`-Stand) + bestehende Audit-/Statusdokumente. Keine Produktivumgebung,
keine Datenbank, keine Migration, kein Deploy verändert. Zahlen aus In-Prozess-Katalog-Build ohne Netz. Baut auf den
Vor-Audits `audit/source-coverage.md`, `audit/profile-coverage.md`, `audit/saas-readiness.md` (2026-07-12) und
`docs/datenmotor-restliste.md` auf.*
