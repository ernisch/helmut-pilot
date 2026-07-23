# Bestandsabgleich `arbeit-und-soziales` — Sprint 1 (reine Bestandsaufnahme)

**Stand:** 2026-07-23 · **Branch:** `claude/helmut-arbeit-soziales-sprint1-gegxn7` · **Vergleichsbasis:** `main` (Merge #114, `035898b`)
**Auftragsquelle:** hochgeladenes Paket `Helmut_arbeit_und_soziales_Master_Uebergabe.zip`, ausschliesslich `00_MASTER/*` + Block-Detaildateien
**Umfang:** ausschliesslich Sprint 1 — Lesevergleich Pflichtpfade vs. Repository-Bestand. Kein Sprint 2, keine Live-Abrufe, keine Code-/Seed-/Aktivierungsaenderung.

---

## 1. Auftrag und Geltungsbereich

Verglichen wurde der **fachliche Pflichtkern** aus dem Uebergabepaket (`00_MASTER/01_konsolidierte_fachentscheidung.md`, `00_MASTER/02_architektur_master.json`, `00_MASTER/05_finaler_pflichtkern.csv`: 20 nummerierte Pflichtpfade + 1 offener Auswahlentscheid Betroffenenperspektive) gegen den **Ist-Bestand auf `main`** des bestehenden Source Package `arbeit-und-soziales` (`pkg-arbeit-und-soziales`, `geo-bund`, laut Auftrag 84 Package Paths / 84 Retrieval Paths).

Zusaetzlich wurden die 10 technischen/optionalen Kandidaten aus `00_MASTER/06_technische_und_optionale_kandidaten.csv` ausschliesslich auf Repository-Existenz geprueft (keine fachliche Bewertung, keine Empfehlung zur Aufnahme).

Bindend beachtet: `00_MASTER/04_no_go_regeln.md` (u. a. keine neue Architektur, kein neues Paket, keine Live-Abrufe, keine Aktivierung, kein Production Write, kein Deployment, keine Aenderung an `bund-basis`) sowie `00_MASTER/07_bewusste_ausschluesse.csv` als Referenz fuer bewusst nicht gewollte Quellen.

## 2. Methodik und Quellenbasis

Reiner Code-/Dokumentenabgleich auf `main`, keine Netzwerkzugriffe, keine Datenbankabfragen (die produktive Quellenwahrheit liegt seit dem Cutover `HELMUT_SOURCE_MODE=on` in Supabase — das war fuer diesen Abgleich weder erreichbar noch angefordert; geprueft wurde der Code-Katalog, aus dem die relationale Seed-Wahrheit erzeugt wird).

Herangezogene Repository-Quellen:

- `lib/helmut/sources.js` — vollstaendiger Katalog `v1Sources` (Publisher-URLs, RSS/HTML/Google-News-Definitionen, Themen-Tags)
- `lib/helmut/quellenarchitektur/catalog.js`, `model.js`, `seeds/packages.js`, `seeds/publishers.js`, `seeds/bundeswege-reparaturen.js` — Abbildung auf Herausgeber/Abrufweg/Paket, Status-Enums, bekannte Gesundheitswerte, dokumentierte Reparaturwege
- `supabase/seeds/20260713_source_architecture_seed.sql` — Bestaetigung der Paketzuordnung (84 `package_paths`-Zeilen fuer `pkg-arbeit-und-soziales`)
- `docs/quellenarchitektur/00-master-status.md`, `00-ist-architektur-und-abweichungen.md`, `28-quellenabdeckung-p2-5-readiness-diagnose.md` — bereits dokumentierter Ist-Zustand, Gesundheitswerte, Sprint-9B-Reparaturbefunde
- Repository-weite Volltextsuche (Grep) fuer jede im Pflichtkern genannte Institution/Domain

Vollstaendige Ergebnisliste je Pfad: [`bestandsmatrix.csv`](./bestandsmatrix.csv) (32 Datenzeilen: 20 Pflichtpfade + 2 Zeilen offener Auswahlentscheid + 10 technische Kandidaten, 15 Spalten gemaess der angeforderten 10 Pruefkriterien).

## 3. Executive Summary

| Kennzahl | Wert |
|---|---|
| Pflichtpfade gesamt | 20 |
| **vollstaendig vorhanden** | **1** (5 %) |
| **teilweise vorhanden** | **8** (40 %) |
| **fehlt vollstaendig** | **11** (55 %) |
| Offener Auswahlentscheid (Betroffenenperspektive) | beide Kandidaten (VdK, SoVD) technisch bereits vorhanden, fachliche Auswahl offen |
| Technische Kandidaten (10) bereits im Repo vorhanden | 5 (BMAS Forschungsberichte, VdK, SoVD, Eurofound, Fachmedien-Gruppe) |
| Technische Kandidaten nicht vorhanden | 4 (BA Pressetermine separat, Destatis Kalender, DGUV Presse, Eurostat) |
| Technische Kandidaten nicht anwendbar | 1 (zusaetzliches Forschungsinstitut — kein konkreter Name benannt) |
| Bestehende Package Paths `pkg-arbeit-und-soziales` (Code-Seed) | 84 (bestaetigt in `supabase/seeds/20260713_source_architecture_seed.sql`) |
| Davon fuer die 20 Pflichtpfade tatsaechlich einschlaegig | 11 der 84 (rechnerisch ermittelt via `buildFullModel()`, s. u.; Rest sind Themenradare/Parteien/Regional-Buendel/Medien ohne direkten Institutionsbezug) |

*Ermittlung der 11:* lokaler, netzwerkfreier Aufruf von `require("./lib/helmut/quellenarchitektur").buildFullModel()` (reine Funktion, kein Storage-Write) gegen die 84 `package_paths` von `pkg-arbeit-und-soziales`, gefiltert auf Herausgeber-Domain/Name mit Bezug zu einer der 20 Pflichtpfad-Institutionen: `bmas`, `bundle-ausschuss-bmas-vorhaben`, `dgb`, `institution-bmas-forschungsberichte`, `institution-bundesagentur-statistik`, `news-arbeitsagentur`, `news-bda`, `news-destatis-soziales`, `news-deutsche-rentenversicherung`, `news-iab`, `radar-bmas-vorhaben`. VdK/SoVD (offener Auswahlentscheid, nicht einer der 20) sind hier bewusst nicht mitgezaehlt.

**Kernaussage:** Das bestehende Paket ist **breit, aber falsch fokussiert** fuer die neue fachliche Definition. Es deckt fast ausschliesslich generische Themen- und Google-News-Suchen ab, waehrend 5 im Pflichtkern benannte Institutionen (Mindestlohnkommission, DGUV, BAG, BSG, BAGFW) **im gesamten Repository mit 0 Codetreffern vollstaendig fehlen** — und umgekehrt Quellen aktiv sind, die die neue Fachentscheidung ausdruecklich ausschliesst (siehe Abschnitt 7).

## 4. Befunde je Pflichtpfad

Status-Kuerzel: **VOLLSTAENDIG** = vollstaendig vorhanden · **TEILWEISE** = teilweise vorhanden · **FEHLT** = fehlt vollstaendig. Volle Begruendung je Kriterium in `bestandsmatrix.csv`.

### Block 1 — Staat und Arbeitsmarktverwaltung

| Nr | Publisher/Rolle | Status | Kernbefund |
|---|---|---|---|
| 1 | BMAS — Aktueller Fachsignalstrom | **VOLLSTAENDIG** | `rp-bmas`, Direkt-RSS, Gesundheit `healthy`, `is_critical=true`. Einziger vollstaendig passender Pflichtpfad im gesamten Bestand. |
| 2 | BMAS — Gesetze und Gesetzesvorhaben | **TEILWEISE** | Kein Direktweg zur amtlichen Gesetze-Seite. Nur 3 sich gegenseitig ueberschneidende Google-News-Radare (`radar-bmas-vorhaben`, `process-gesetzentwurf-arbeit-soziales`, `process-eckpunkte-arbeit-soziales`), alle dem Aggregator "Google News" zugeordnet, nicht BMAS direkt. |
| 3 | BA — Presse und Monatsarbeitsmarkt | **TEILWEISE** | Nur `news-arbeitsagentur` (Google News `site:arbeitsagentur.de`), kein Pressefeed. |
| 4 | BA — Statistik und API | **TEILWEISE** | Nur `institution-bundesagentur-statistik` (Google News), keine echte API-Anbindung. Einzige "api"-Implementierung im Code ist DIP (Bundestag), nicht BA. |
| 5 | Mindestlohnkommission | **FEHLT** | 0 Codetreffer fuer die Domain `mindestlohn-kommission.de`. Nur zwei generische, nicht site-gebundene Themensuchen (`signal-mindestlohnkommission`, `radar-mindestlohn`), beide dem Aggregator zugeordnet — keine institutionelle Bindung. |

### Block 2 — Forschung und Statistik

| Nr | Publisher/Rolle | Status | Kernbefund |
|---|---|---|---|
| 6 | IAB — Publikationen | **TEILWEISE** | `news-iab` (Google News `site:iab.de`) existiert, deckt aber Publikationen, Arbeitsmarktbarometer, Stellenerhebung und Zuwanderungsmonitor **undifferenziert in einer einzigen Quelle** ab. |
| 7 | IAB — Arbeitsmarktbarometer | **FEHLT** | Keine eigene Rolle, nur im generischen `news-iab`-Bucket enthalten. |
| 8 | IAB — Stellenerhebung | **FEHLT** | Keine eigene Rolle, nur im generischen `news-iab`-Bucket enthalten. |
| 9 | IAB — Zuwanderungsmonitor | **FEHLT** | Keine eigene Rolle, nur im generischen `news-iab`-Bucket enthalten. |
| 10 | Destatis — kuratiertes GENESIS-Datenset | **FEHLT** | 0 Codetreffer fuer "genesis" im gesamten Repository. Nur generische Pressesuche `news-destatis-soziales` vorhanden, kein Statistik-API-Zugriff. |

**Auffaelligkeit Block 2:** Die 5 Pflichtpfade zerfallen faktisch in nur **2 tatsaechlich existierende, aber grob geschnittene Themenquellen** (`news-iab`, `news-destatis-soziales`) — die vom Auftrag verlangte Differenzierung in 4 getrennte IAB-Rollen existiert im Bestand nicht.

### Block 3 — Sozialversicherung

| Nr | Publisher/Rolle | Status | Kernbefund |
|---|---|---|---|
| 11 | DRV — Statistik und Berichte | **TEILWEISE** | Nur `news-deutsche-rentenversicherung` (Google News), keine dedizierte Statistik-Quelle. |
| 12 | DRV — Fachpolitische Presse und Aenderungen | **TEILWEISE** | Identischer Weg wie Nr. 11 — keine Trennung zwischen den zwei Pflichtrollen. |
| 13 | DGUV — Zahlen und Publikationen | **FEHLT** | 0 Codetreffer fuer "dguv" im gesamten Repository — vollstaendige Luecke, auch kein indirekter Google-News-Ersatzweg. |

### Block 4 — Rechtsprechung

| Nr | Publisher/Rolle | Status | Kernbefund |
|---|---|---|---|
| 14 | BAG — Entscheidungen | **FEHLT** | 0 Codetreffer fuer "bundesarbeitsgericht"/BAG. |
| 15 | BAG — Presse und Sitzungssignale | **FEHLT** | 0 Codetreffer fuer "bundesarbeitsgericht"/BAG. |
| 16 | BSG — Entscheidungen | **FEHLT** | 0 Codetreffer fuer "bundessozialgericht"/BSG. |
| 17 | BSG — Presse, Termine, Terminberichte | **FEHLT** | 0 Codetreffer fuer "bundessozialgericht"/BSG. |

**Auffaelligkeit Block 4:** Der komplette Rechtsprechungsblock (4 von 20 Pflichtpfaden) ist im Repository **zu 100 % unvertreten** — weder Publisher noch Retrieval Path noch indirekter Google-News-Ersatzweg. Das ist der groesste einzelne Bestandsblock, der fehlt.

### Block 5 — Interessenbalance

| Nr | Publisher/Rolle | Status | Kernbefund |
|---|---|---|---|
| 18 | DGB — Presse und Positionen | **TEILWEISE** | `rp-dgb` existiert, Gesundheit ist jedoch **`broken`** (0 Dokumente, bestaetigt in `KNOWN_PATH_HEALTH` sowie zwei bestehenden Diagnosedokumenten). Fuer die Reparatur liegt bereits ein am 2026-07-14 real verifizierter Google-News-Ersatzweg vor (`lib/helmut/quellenarchitektur/seeds/bundeswege-reparaturen.js`, Sprint 9B, HTTP 200 verifiziert) — **nicht angewendet**. |
| 19 | BDA — News und Positionen | **TEILWEISE** | Nur `news-bda` (Google News), kein Direktfeed zur Newsroom-Seite. |
| 20 | BAGFW — Presse und Stellungnahmen | **FEHLT** | 0 Codetreffer fuer "bagfw". Einzelmitglieder Caritas, Diakonie, Der Paritaetische sind einzeln bereits aktiv (siehe Abschnitt 7 — Regelkonflikt). |

## 5. Offener Auswahlentscheid: Betroffenenperspektive (VdK vs. SoVD)

Kein nummerierter Pflichtpfad, aber Teil des Pflichtkerns laut `01_konsolidierte_fachentscheidung.md` (Punkt 21) und `00_MASTER/08_offener_auswahlentscheid.csv`. Beide Kandidaten sind **technisch bereits vorhanden und aktiv**:

| Kandidat | Publisher | Retrieval Path | Status |
|---|---|---|---|
| Sozialverband VdK Deutschland | `publisher-vdk.de` | `news-sozialverband-vdk` (Google News `site:vdk.de`, Prio 74) | aktiv, `needs_review` |
| Sozialverband Deutschland (SoVD) | `publisher-sovd.de` | `news-sozialverband-deutschland` (Google News `site:sovd.de`, Prio 70) | aktiv, `needs_review` |

**Regelkonflikt:** Die Fachentscheidung verlangt "genau eine" Betroffenenquelle; im Ist-Bestand laufen **beide gleichzeitig** im Paket `arbeit-und-soziales`. Beide sind technisch einsatzbereit — die Auswahl ist eine fachliche, keine technische Entscheidung (Masterauftrag Phase 5, hier nicht durchgefuehrt).

## 6. Technische Kandidaten — reine Existenzpruefung

Ausschliesslich geprueft, ob die Kandidaten bereits im Repository existieren (keine Aufnahme-, Aktivierungs- oder Qualitaetsbewertung):

| Nr | Kandidat | Existiert im Repo? | Fundstelle |
|---|---|---|---|
| 1 | BMAS Forschungsberichte und Open Data | **ja** | `institution-bmas-forschungsberichte` |
| 2 | BA Pressetermine separat | nein | — |
| 3 | Destatis Presse und Veroeffentlichungskalender | nein | — |
| 4 | DGUV Presse | nein | — |
| 5 | VdK | **ja** | `news-sozialverband-vdk` |
| 6 | SoVD | **ja** | `news-sozialverband-deutschland` |
| 7 | Eurostat | nein | — |
| 8 | Eurofound | **ja** | `institution-eurofound-deutschland` (ohne site-gebundenen Herausgeber, Aggregator-attributiert) |
| 9 | Ein zusaetzliches Forschungsinstitut (bedingt) | nicht anwendbar | kein konkreter Name im Uebergabepaket benannt |
| 10 | Spezialisierte Fachmedien | **ja, umfangreich** | 15 einzelne Fachmedien-Wege bereits vorhanden |

## 7. Systemische Befunde (uebergreifend, nicht pfadgebunden)

Diese Beobachtungen ergeben sich aus dem Abgleich, sind aber keinem einzelnen Pflichtpfad zugeordnet. Sie sind reine Feststellungen — keine Aenderung wurde vorgenommen.

1. **Dublettenrisiko durch Themen-Ueberlappung (Block 1/2/5).** Rund um BMAS/Ausschuss-Arbeit-und-Soziales existieren im Bestand parallel: 10 `radar-*`-Themenradare, 8 `process-*`-Verfahrenswege und 24 `bundle-ausschuss-arbeit-soziales-*`-Kombinationswege (aus 24 Themen × Kontext "Ausschuss Arbeit und Soziales", kuratiert aus `topicBundleSources`). Viele dieser Wege fragen inhaltlich sehr Aehnliches ab (z. B. Buergergeld, Mindestlohn, Rente, Pflege gleichzeitig als eigener Radar UND als Themen-Bundle). Das entspricht keiner Verletzung fuer sich genommen, ist aber ein konkretes Risiko fuer die im Auftrag geforderte "keine doppelte Ereigniserzeugung aus Presse und Volltext" (No-Go-Regel 13) und sollte bei einer spaeteren Konsolidierung technisch geprueft werden.
2. **Undifferenzierte Buendelung statt Rollentrennung.** Zwei Institutionen aus dem neuen Pflichtkern werden im Bestand durch **je eine einzige** Quelle abgedeckt, obwohl die Fachentscheidung getrennte Rollen verlangt: IAB (4 Rollen → 1 Quelle `news-iab`) und DRV (2 Rollen → 1 Quelle `news-deutsche-rentenversicherung`). Das ist der direkte Gegensatz zu den "Kritischen Korrekturen am Research Report" in `CLAUDE_CODE_START_HIER.md` ("IAB Arbeitsmarktbarometer, Stellenerhebung und Zuwanderungsmonitor besitzen getrennte Rollen").
3. **Ist-Bestand widerspricht bereits an mehreren Stellen den neuen No-Go-Regeln:**
   - Einzelgewerkschaften `news-verdi`, `news-ig-metall` sind aktiv, obwohl No-Go-Regel 8 ("keine pauschale Aufnahme einzelner Gewerkschaften — DGB deckt Dachperspektive ab") das fuer den neuen Pflichtkern ausschliesst.
   - Einzel-Arbeitgeberverbaende `news-bdi` (BDI), `news-zdh` (ZDH) sind aktiv, obwohl No-Go-Regel 9 dies ausschliesst (BDA deckt die Dachperspektive ab).
   - Einzel-Wohlfahrtsverbaende `news-caritas`, `news-diakonie`, `news-paritaet` sind aktiv, obwohl `07_bewusste_ausschluesse.csv` explizit "Mehrere Wohlfahrtsverbaende — nicht pauschal, BAGFW deckt Trägerperspektive ab" festhaelt (siehe auch Block 5, Nr. 20).
   - Sowohl VdK als auch SoVD laufen parallel, obwohl "genau eine" Betroffenenquelle verlangt ist (Abschnitt 5).
   - `institution-wsi` und `institution-boeckler` sind beide separat aktiv, obwohl `07_bewusste_ausschluesse.csv` "DIW, WSI, IW und ifo parallel — hohe Redundanz" nennt (auch wenn WSI selbst kein explizit benanntes Institut in dieser Liste ist, ist die Redundanz zwischen den beiden strukturell dieselbe: Boeckler-Stiftung traegt das WSI).
   - 8 parteigebundene "Arbeit und Soziales"-Suchwege (`politicalActorSources`: SPD-/CDU-CSU-/Gruene-/FDP-/AfD-Fraktion + SPD/CDU/Gruene-Partei) sind aktuell dem Fachpaket `arbeit-und-soziales` zugeordnet (via `themeTerms`), obwohl No-Go-Regel 7 ("keine partei- oder pilotbezogenen Wege im neutralen Fachpaket") und die Paketgrenze in `01_konsolidierte_fachentscheidung.md` ("Allgemeine Bundespolitik bleibt in `bund-basis`") das fuer ein neutrales Fachthemenpaket ausschliessen.

   Diese Punkte sind **keine Bugs**, sondern der bisherige, vor der neuen Fachentscheidung gewachsene Ist-Zustand. Sie werden hier nur dokumentiert, da danach gefragt war ("Abweichung zwischen bestehendem Paket und neuer fachlicher Definition") — es wurde nichts davon veraendert oder entfernt.
4. **DGB-Reparatur liegt bereits fertig dokumentiert vor.** Sprint 9B (`bundeswege-reparaturen.js`, 2026-07-14) hat fuer `rp-dgb` (und 5 weitere defekte Bund-Wege) bereits einen echten, auf einem GitHub-Runner verifizierten Ersatzweg getestet (`HTTP 200`, "geeignet"). Nichts davon wurde angewendet (`angewendet: 0`). Das ist der mit Abstand risikoaermste Reparaturkandidat im gesamten Pflichtkern, weil die technische Pruefung bereits vorliegt und lediglich eine Freigabeentscheidung sowie eine koordinierte Code-/DB-Aenderung fehlt (nicht Teil von Sprint 1).

## 8. Abschlussbericht

**1. Wie viele Pflichtpfade sind vollstaendig vorhanden?**
**1 von 20** (Nr. 1 — BMAS Aktueller Fachsignalstrom).

**2. Wie viele sind teilweise vorhanden?**
**8 von 20** (Nr. 2, 3, 4, 6, 11, 12, 18, 19).

**3. Wie viele fehlen vollstaendig?**
**11 von 20** (Nr. 5, 7, 8, 9, 10, 13, 14, 15, 16, 17, 20).

**4. Welche drei Pfade sollten zuerst technisch validiert werden?**
1. **DGB — Presse und Positionen (Nr. 18):** Die Reparatur ist bereits real getestet und verifiziert (Sprint 9B), nur eine Re-Verifikation vor Aktivierung fehlt. Hoechste Erfolgswahrscheinlichkeit bei geringstem Restaufwand.
2. **Betroffenenperspektive VdK vs. SoVD (offener Auswahlentscheid):** Beide Kandidaten laufen bereits technisch; es fehlt ausschliesslich der im Masterauftrag (Phase 5) vorgesehene Vergleichstest, um die offene Fachentscheidung zu schliessen.
3. **BMAS — Gesetze und Gesetzesvorhaben (Nr. 2):** Wichtigster Publisher des gesamten Pflichtkerns (kanonische Rolle 1: "BMAS fuer fachliche Regelsetzung"), aber ohne jede Direktquelle zur amtlichen Gesetze-Seite — nur indirekte, aggregator-attributierte Google-News-Radare. Schliessung dieser Luecke haette den groessten fachlichen Hebel.

 *(Ehrenwerte Erwaehnung, nicht Teil der Top 3: BA-Statistik-API (Nr. 4) waere technisch die aufwendigste Validierung — echte API-Anbindung statt Google-News-Proxy — und sollte erst nach den drei oben genannten angegangen werden.)*

**5. Gibt es eine Abweichung zwischen dem bestehenden Paket und der neuen fachlichen Definition?**
**Ja, in beide Richtungen — deutlich:**
- **Fehlend:** 5 im neuen Pflichtkern zentrale Institutionen (Mindestlohnkommission, DGUV, BAG, BSG, BAGFW) sind mit **0 Codetreffern** vollstaendig unvertreten; der komplette Rechtsprechungsblock (4 Pfade) fehlt.
- **Undifferenziert:** IAB (4 Rollen) und DRV (2 Rollen) werden im Bestand durch je nur eine generische Quelle abgedeckt statt getrennter Rollen.
- **Ueberschuessig / regelwidrig:** Der Ist-Bestand enthaelt aktuell mehrere Quellenklassen, die die neue Fachentscheidung ausdruecklich ausschliesst (Einzelgewerkschaften, Einzel-Arbeitgeberverbaende, Einzel-Wohlfahrtsverbaende, doppelte Betroffenenquelle VdK+SoVD, doppelte Forschungsinstitute WSI+Boeckler, 8 parteigebundene Fachwege im neutralen Themenpaket) — siehe Abschnitt 7.
- Insgesamt bildet der bestehende Bestand primaer die **alte, google-news-lastige Katalogstruktur** ab (94 % der 144 kuratierten Alt-Quellen sind Google-News-Suchen, vgl. `docs/quellenarchitektur/00-ist-architektur-und-abweichungen.md`), waehrend die neue Fachentscheidung einen **schmalen, institutionell scharf geschnittenen 20-21-Rollen-Kern** verlangt (Zielkorridor 18-22 Retrieval Paths). Zwischen "84 vorhandene Package Paths" und "20 gezielt definierte Pflichtrollen" besteht eine strukturelle Luecke, kein Zahlenwiderspruch.

**6. Welche Dateien wurden veraendert?**
Ausschliesslich die zwei angeforderten neuen Dateien wurden angelegt — **keine bestehende Datei wurde veraendert, gelöscht oder verschoben**:
- `docs/quellen/arbeit-und-soziales/bestandsabgleich.md` (dieses Dokument, neu)
- `docs/quellen/arbeit-und-soziales/bestandsmatrix.csv` (neu)

## 9. Nicht durchgefuehrt (Sprint-1-Grenzen eingehalten)

Wie beauftragt **nicht** ausgefuehrt: keine Live-Abrufe, keine geoeffneten Webseiten, keine implementierten Quellen, keine geschriebenen Parser, keine angelegten Retrieval Paths, keine Seed-Aenderungen, keine Aktivierung, keine Migration, kein Deployment, keine geloeschten oder veraenderten Bestandsquellen. Masterauftrags-Phasen 2-8 (Zuordnung/Gate-Entscheidungen, reale Abrufe, Dedup-Umsetzung, VdK/SoVD-Echtvergleich, Google-News-Ablösung, Implementierung) sind **nicht** Teil dieses Dokuments und folgen — falls gewuenscht — erst in einem separaten, hier nicht begonnenen Sprint 2.

**Sprint 1 ist damit abgeschlossen. Diese Sitzung stoppt hier.**
