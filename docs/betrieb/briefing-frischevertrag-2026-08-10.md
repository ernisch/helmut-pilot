# Frischevertrag des Morgenbriefings (Sprint 2026-08-10)

**Kanonische Belegdatei** für den verbindlichen Frischevertrag. `docs/CURRENT_STATE.md`
führt davon nur die entscheidungsrelevanten Zeilen. Zustand des Sprints (Stand 2026-08-11):
**abgeschlossen** — gebaut, getestet, adversarial gegengeprüft, gemergt und
**Production-Nachweis bestanden** (§11).

**Branch:** `claude/briefing-freshness-guarantee-r36h8m` · **PR #238:** gemergt
`2026-08-10T21:02:57Z`, Merge-Commit `6030cbb71a39448b598106531970c4b5c681df6f`
**Punkt:** OP-31 ([`../datenmotor-restliste.md`](../datenmotor-restliste.md))

---

## 1 · Anlass

Vor der stufenweisen OP-30-Aktivierung (5 → 25 → …) muss feststehen, dass jedes
Mandat **an jedem Berliner Kalendertag** ein neu erzeugtes Morgenbriefing bekommt —
und dass Helmut es **ehrlich sagt**, wenn das nicht passiert ist. Mit 25 Mandaten in
einem gedeckelten Zeitfenster ist ein übersprungenes Mandat kein Randfall mehr,
sondern der Regelfall der Überlast (OP-25 (c), OP-30).

## 2 · Bisherige Ursache (gemessen am Code auf `main`, Stand `ec2e208`)

Der Kern ist **kein einzelner Fehler**, sondern eine **fehlende Aussage**:

1. **Es gab keinen Beleg, dass heute ein Briefing entstanden ist.**
   `/api/cron/morning-briefing` baute pro Mandat ein Briefing und schickte einen Push,
   hinterließ aber **keine mandatsscharfe Tagesspur**. Die Lauftelemetrie
   (`process_runs`, `briefing-morning`) ist **prozessweit**, nicht pro Mandat. Ein
   Mandat, das wegen Zeitdeckelung übersprungen wurde, war von einem versorgten Mandat
   **nicht unterscheidbar** — genau das „falsche Grün“, das `CLAUDE.md` §4.4 verbietet.

2. **Die Frischeaussage entstand an drei Stellen unabhängig.**
   `server.decorateBriefingFreshness` (18-Stunden-/Kalendertagsregel),
   `briefingContract.buildCurrentHelmutState` (Tages-Guard über `dateKeyInTimezone`)
   und `lage.berlinDayKey` (Cache-Schlüssel, mit UTC-Rückfall bei Zonenfehler).
   Drei Implementierungen derselben Aussage sind drei Gelegenheiten, auseinanderzulaufen.

3. **Der reine Kalendertag war für ein Morgenbriefing zu grob.**
   Eine Meldung vom **späten Vorabend** (z. B. 22:40) ist im 06:00-Briefing die
   wichtigste Neuigkeit — der Kalendertags-Guard stufte den Stand deswegen aber auf
   `stale` herab und der Kopf zeigte „Letzter Stand“. Umgekehrt gab es **keine
   Trennung** zwischen „neu seit dem letzten Briefing“ und „läuft seit Wochen“:
   alle Vorgänge standen unterschiedslos als „weitere relevante Vorgänge“ nebeneinander.

4. **Die Oberfläche rechnete Zeiten in der Zeitzone des Geräts.**
   `client.hstandWhen` formatierte ohne `timeZone` — auf einem Gerät außerhalb
   Europe/Berlin konnte derselbe Stand einen anderen Tag anzeigen als der Server.

5. **Ein Wiederholungslauf war nicht als solcher erkennbar.**
   Der GitHub-Watchdog feuert planmäßig ein zweites Mal (`briefing-watchdog.yml`,
   05:30 UTC, oft 2–3 h verzögert). Ohne Tagesspur baute er dasselbe Briefing erneut
   und löste einen **zweiten Push** aus.

**Was ausdrücklich NICHT die Ursache war:** ein „gestriges Briefing“, das aus einer
Ablage ausgeliefert wird. Der V3-Lesepfad leitet das Briefing bei **jedem** Aufruf
deterministisch aus den verstandenen Vorgängen ab (0 KI). Der Rückfall auf den Vortag
war also nie ein *gespeichertes* altes Briefing, sondern **alte Daten mit frischem
Etikett**. Genau darauf zielt der Vertrag.

## 3 · Der umgesetzte Vertrag

Neue kanonische Quelle: [`../../lib/helmut/briefing-frische.js`](../../lib/helmut/briefing-frische.js)
(reine Logik, kein Netz, keine KI, keine Persistenz) und ihr Beleg
[`../../lib/helmut/briefing-lauf.js`](../../lib/helmut/briefing-lauf.js).

| Vertragspunkt | Umsetzung |
|---|---|
| 1 · Tägliches Briefing je Mandat | Der Morgen-Cron schreibt pro Mandat eine **Lauf-Quittung** für den Berliner Tag; die Route meldet zusätzlich die **Abdeckung** (`frischevertrag.belegt/mandate`) und protokolliert jedes Mandat ohne verifizierten Beleg als Fehler |
| 2 · Kein Vortagsbriefing als heutiges | „Aktuell“ setzt einen **Erfolgsbeleg mit heutigem Berliner Tag** voraus. Ohne ihn: `status = "Briefing noch nicht aktuell"`, `freshness.isStale = true`, Kopfzustand auf `stale` herabgestuft, Kopfzeile „Letzter Stand · <echtes Datum>“ |
| 3 · Neues seit dem letzten Briefing | **Briefingfenster**: Anfang = letzter erfolgreicher Lauf (aus der Quittung), sonst 16:00 des Berliner Vorabends. Meldungen im Fenster sind `neu` — **inklusive spätem Vorabend**, mit unverändertem echtem Zeitstempel und echtem Datumslabel („Gestern, 22:40“) |
| 4 · Ältere Vorgänge getrennt | Klassen `neu` · `weiterhin_relevant` (< 14 Tage) · `hintergrund` · `undatiert`; die Oberfläche rendert **getrennte Abschnitte** mit eigenen Überschriften. Ohne belegtes Datum wird nie zu „neu“ hochgestuft |
| 5 · Ehrliche Ansage | Gründe `lauf-fehlt` · `lauf-fehlgeschlagen` · `lauf-veraltet` · `lauf-unbekannte-version` · `daten-veraltet` · `datenstand-unbekannt` · `zeitzone-unbestimmt` → alle ergeben denselben Nutzertext **„Briefing noch nicht aktuell“** plus Klartextgrund; der Maschinencode steht in `freshness.vertrag.grund` |
| 6 · Europe/Berlin verbindlich | `berlinTagKey`, `berlinOffsetMinuten`, `berlinZeitpunkt`, `berlinTagStart` über die IANA-Zone; Wanduhrzeit → Zeitpunkt iterativ (DST-sicher). `lage.berlinDayKey` und `client.hstandWhen` nutzen jetzt dieselbe Zone |
| 7 · Cache, API, DB, Oberfläche | Ein Objekt (`freshness.vertrag`) trägt die Aussage durch alle Schichten; JSON-Antworten sind `no-store`; der Narrativ-Cache (`bf-<mandat>-lage-<tag>`) und der Beleg (`bf-<mandat>-morgenlage-<tag>`) nutzen **denselben** Tagesbegriff; der Client hat keinen eigenen Frischebegriff mehr |
| 8 · Sonderfälle | siehe §4 |
| 9 · Keine Dubletten, keine unnötigen KI-Aufrufe | Inhaltssignatur (SHA-256 über Vorgangs-IDs + Zeitstempel + Status): gleicher Inhalt am selben Tag ⇒ **kein zweiter Push, kein weiterer Schreibvorgang**; das Tagesnarrativ bleibt im vorhandenen Tagescache, es entsteht kein zusätzlicher Modellaufruf |
| 10 · Tests | `scripts/briefing-frische-test.js` (69) · `scripts/briefing-frische-e2e-test.js` (68) |

### Ablage — bewusst ohne Migration

Der Beleg liegt in der **bestehenden** V3-Tabelle `briefings`
(`storage.saveRenderedBriefingV3` / `getRenderedBriefingV3`, mandantengefiltert):

- Erfolg: `bf-<mandat>-morgenlage-<YYYY-MM-DD>`
- Fehlversuch: `bf-<mandat>-morgenlage-fehler-<YYYY-MM-DD>`

**Keine neue Tabelle, keine Migration, kein neuer Speicherweg.** Die Quittung trägt
nur Kennzahlen, Zeitpunkte, Signatur und Grund — **keine Briefingtexte, keine
Quellen-URLs, keine personenbezogenen Inhalte** (testgesichert).

### Schreibregel (CLAUDE.md §4.10)

- **Erfolg und Fehler liegen in getrennten Zeilen.** Ein späterer fehlgeschlagener
  Lauf kann einen belegten Erfolg desselben Tages nicht überschreiben.
- **Jeder Schreibvorgang ist ein atomarer Upsert eines vollständigen Objekts**, das
  nur aus dem eigenen Lauf entsteht — nie aus einer Verschmelzung mit gelesenem
  Fremdzustand.
- **Verlorene Updates wirken nur in die sichere Richtung:** konkurrieren zwei
  Erfolgsläufe desselben Tages, bleibt der Erfolgsbeleg bestehen; höchstens der
  Fensteranfang ist älter als nötig (mehr „neu“ statt fälschlich „nichts Neues“).
- **Gegenlesen:** `schreibeQuittung` liest den Beleg zurück und meldet
  `verifiziert: false` samt Fehler; die Route protokolliert das ausdrücklich.
  Ein Erfolg, den die Ablage nicht trägt, wird nicht als Erfolg gemeldet.

### Der Lesepfad erzeugt bewusst KEINEN Beleg

`ladeFrischeKontext` ist **rein lesend**. Ein fehlender Morgenlauf wird gemeldet,
nicht nachträglich behauptet — sonst könnte sich das System seine eigene Frische
ausstellen. Testgesichert (`5d`).

## 4 · Sonderfälle (Vertragspunkt 8)

| Fall | Verhalten | Beleg |
|---|---|---|
| Lauf über Mitternacht | Der Beleg gehört zu dem Berliner Tag, an dem er geschrieben wird; ein Beleg von 23:58 zählt am Folgetag **nicht** | Unit `H)` |
| Verspäteter Lauf (Watchdog, 2–3 h später) | gilt als heutiger Lauf, `ausloeser: nachlauf` | Unit `H)` |
| Zweiter Lauf am selben Tag, gleicher Inhalt | Wiederholung: kein zweites Briefing, kein zweiter Push, kein Schreibvorgang; Fenster bleibt das des ersten Laufs | Unit `I)`, `C)` |
| Zweiter Lauf, neuer Inhalt | regulärer Lauf; Beleg wird aktualisiert, Fenster bleibt stabil | Unit `I)` |
| Teilweise fehlgeschlagene Quellen | **bleibt aktuell**, wird aber benannt („6 von 40 Quellen nicht erreichbar“) | Unit `H)`, E2E `2j` |
| Keine neuen Meldungen | **aktuell + Ruhelage**: „Heute liegt keine neue Meldung vor“; alte Vorgänge werden **nicht** zu „neu“ hochgestuft | Unit `H)`, E2E `4l/4m` |
| Ausfall über mehrere Tage | Fenster fällt nach 3 Tagen auf den Vorabend-Standard zurück (kein Riesenfenster, in dem alles „neu“ wäre) | Unit `C)` |
| Sommerzeit-Umstellung | 29.03. und 25.10.2026 in beiden Richtungen geprüft; die nicht existierende Ortszeit 02:30 ergibt einen echten Zeitpunkt statt eines Absturzes | Unit `F)` |
| V3-Store nicht lesbar | Lauf gilt als **fehlgeschlagen** (`ok:false, bounded`), Vertrag meldet „noch nicht aktuell“ | E2E `2d/3h` |

## 5 · Testergebnisse (echte Zahlen, lokal)

| Lauf | Ergebnis |
|---|---|
| `node scripts/briefing-frische-test.js` | **69 bestanden, 0 fehlgeschlagen** |
| `node scripts/briefing-frische-e2e-test.js` | **68 bestanden, 0 fehlgeschlagen** |
| `node scripts/briefing-frische-audit-test.js` (neu, §10) | **34 bestanden, 0 fehlgeschlagen** |
| `node scripts/run-offline-tests.js` (kanonisch, offline erzwungen) | **238/242 Suiten grün in 530 s** (nach dem Audit und `npm ci`; davor 236/241 bzw. 237/242 ohne installierte Abhängigkeiten) |
| `node scripts/browser-smoke-test.js` | **32 PASS, 0 FAIL** |

**Die 5 roten Suiten sind Basisrot**, nachgemessen im selben Sprint gegen einen
sauberen Arbeitsbaum auf `origin/main` (`ec2e208`) — dort **identisch rot**:
`kalender-ics` (fehlendes Modul `ical.js` — **nach `npm ci` grün**),
`privacy-vollstaendigkeit`, `profile-db`, `provision-tenant`, `tenant-neutrality`
(die letzten vier dokumentiert in
[`op30-testbefunde-2026-08-08.md`](op30-testbefunde-2026-08-08.md); sie scheitern am
lokalen Netzriegel bzw. am Zustand des lokalen Datenverzeichnisses — die CI derselben
Commit-Stände ist auf allen drei Pflichtprüfungen grün).

**Drei Bestandswächter mussten nachgezogen werden** — ehrlich, nicht abgeschwächt:

| Suite | Warum | Änderung |
|---|---|---|
| `berlin-aktivierung-test.js` (11j) | Der Wächter sucht einen Filter auf das **Land** Berlin und erlaubte Zeitzonen-Helfer bereits als Ausnahme (`berlinDay`, `berlinDate`, …) | Ausnahmeliste um `berlinTag`/`berlinZeit`/`berlinOffset` ergänzt; Prüfzweck unverändert |
| `punkt29-fixpfade-test.js` (A11) | Quelltextvertrag prüfte die Bedingung **wörtlich** | Bedingung darf jetzt zusätzlich `speicherfehler` enthalten; die Forderung (Timeouts ⇒ `ok:false/bounded`) bleibt |
| `env-inventar-test.js` | Fünf neue Variablen waren nicht dokumentiert | in [`env-inventar.md`](env-inventar.md) §6 aufgenommen |

## 6 · Neue Umgebungsvariablen (alle optional, Defaults greifen)

| Variable | Default | Wirkung |
|---|---|---|
| `HELMUT_BRIEFING_FRISCHE` | **an** | Not-Aus. `off`/`0`/`false`/`aus`/`nein` schaltet den Vertrag ab (Rücknahme ohne Code-Redeploy). **Kein Aktivierungsschalter** |
| `HELMUT_BRIEFING_MAX_DATENALTER_H` | 24 | ab wann die Daten als „nicht ausreichend aktuell“ gelten |
| `HELMUT_BRIEFING_VORABEND_H` | 8 | wie weit das Fenster ohne Vorlauf zurückreicht (16:00 Vorabend) |
| `HELMUT_BRIEFING_RELEVANZ_TAGE` | 14 | Grenze „weiterhin relevant“ / „Hintergrund“ |
| `HELMUT_BRIEFING_MAX_RUECKBLICK_TAGE` | 3 | wie alt der letzte Erfolg höchstens sein darf, um das Fenster zu setzen |

**Warum Default AN und nicht wie üblich AUS:** der Vertrag fügt keine Funktion hinzu,
er **entfernt eine unwahre Aussage**. Ein Feature-Flag mit Default AUS hieße: die
Unwahrheit bleibt bis zur Freigabe bestehen. Die Rücknahme bleibt trotzdem
jederzeit möglich (eine Variable, kein Code) — sie ist als Betreiberentscheidung
mit Ehrlichkeitsverlust dokumentiert.

## 7 · Wirkung eines Merges auf Production

Ein Merge ist ein Deployment. Danach gilt sofort:

1. **Bis zum ersten Morgen-Cron auf dem neuen Stand zeigt die App
   „Briefing noch nicht aktuell“.** Das ist **keine Störung, sondern der Vertrag**:
   für den laufenden Tag existiert noch kein Beleg, weil ihn erst der neue Code
   schreibt. Der Zustand endet automatisch mit dem nächsten `morning-briefing`-Lauf
   (05:00 UTC). Wer das vermeiden will, merged **nach** dem Morgenfenster und lässt
   den ersten Beleg über den planmäßigen Lauf entstehen.
2. **Ein Mandat, das der Morgenlauf nicht erreicht, wird sichtbar** — bisher blieb es
   unsichtbar. Bei einem einzelnen ausgefallenen Lauf sieht der Abgeordnete die
   ehrliche Ansage statt eines frisch etikettierten Vortagsstands.
3. **Zusätzliche Leselast:** pro Briefing-Abruf ein bis vier kleine, indizierte
   Zeilenlesezugriffe auf `briefings` (Beleg heute, ggf. Fehlversuch, bis zu zwei
   Vortage). Keine neuen Schreibvorgänge außerhalb des Morgen-Crons.
4. **Ein Lauf mit nicht lesbarem V3-Store zählt jetzt als Fehler** (vorher als
   Erfolg mit leerem Ergebnis). Das ist für die Fairness-Buchführung die richtige
   Aussage, verschiebt aber Zähler in `cron-fairness`.
5. **Keine Migration, kein Flag-Wechsel, keine Cron-Änderung, kein KI-Pfad.**
   OP-30-Flags bleiben aus; an der Warteschlange ändert sich nichts.

## 8 · Grenzen und offene Risiken

1. **Kein Production-Nachweis.** Alles ist offline belegt. Ob die Quittung in
   Production tatsächlich geschrieben und gegengelesen werden kann, ist erst nach
   einem Deployment und einem echten Morgenlauf belegbar (→ OP-31 (b)).
2. **Der Vertrag beweist die Existenz eines Laufs, nicht dessen Qualität.** Ein
   erfolgreicher Lauf mit dünner Quellenlage ist „aktuell“ — die Quellen-Wahrheit
   bleibt bei OP-15/OP-25/Punkt 16.
3. **Die Abdeckungsmeldung ist ein Logeintrag, kein Alarm.** Ein dauerhaft
   übersprungenes Mandat fällt nur auf, wenn jemand die Cron-Antwort ansieht. Der
   Alarmweg gehört zu OP-07 und ist **nicht** Teil dieses Sprints.
4. **Konkurrierende Erfolgsläufe** können den Fensteranfang auf einen älteren Wert
   zurücksetzen (siehe §3). Wirkung: höchstens zu viele „neu“-Meldungen. Eine echte
   Compare-and-Set-Lösung bräuchte eine Bedingung auf dem `payload` und wurde
   bewusst nicht gebaut, weil der Fehler nicht in Richtung falsches Grün wirkt.
5. **Der Datenstand ist eine globale Größe** (`getLatestCompleteKnowledgeObjectAt`),
   nicht mandatsscharf. Ein Mandat mit frischem Motor, aber ohne eigene Treffer,
   erscheint deshalb als „aktuell in Ruhelage“ — das ist beabsichtigt, aber es
   erkennt **keinen mandatsspezifischen** Datenstillstand.
6. **Die Klassengrenzen (8 h / 14 Tage / 3 Tage / 24 h) sind gesetzt, nicht gemessen.**
   Sie sind über Umgebungsvariablen änderbar; eine empirische Justierung braucht
   Production-Daten.

## 9 · Nächster Schritt (Stand vor dem Merge — Historie)

1. Review und **Merge-Entscheidung** durch den Betreiber (Merge = Deployment).
2. Nach dem Merge: den **ersten Morgenlauf** ansehen —
   `frischevertrag.belegt` muss `mandate` erreichen; jede Zeile
   `FRISCHEBELEG NICHT PERSISTIERT` ist ein echter Befund.
3. Erst danach die OP-30-Stufe 2 (25 Mandate) freigeben; die Abdeckungszahl des
   Morgenlaufs ist ab dann die Messgröße dafür, ob 25 Mandate wirklich täglich
   versorgt werden.

Diese drei Schritte sind erledigt — Nachweis §11.

## 11 · OP-31 (b): Production-Nachweis des ersten Morgenlaufs (2026-08-11, BESTANDEN)

Rein lesende Prüfung nach dem regulären Morgenlauf vom 2026-08-11 05:00 UTC. Keine
Production-Datenänderung, kein manueller Lauf, keine Migration, keine Env-/Flag-Änderung.

**Merge- und Deployment-Kette**

- PR #238 gemergt `2026-08-10T21:02:57Z`, Merge-Commit `6030cbb71a39448b598106531970c4b5c681df6f`
  (`merged: true`, gegen GitHub geprüft).
- `main` HEAD ist dieser Commit; kein weiterer Commit seither.
- Production-Deployment `dpl_Es8TeJjw6CvamH5RC33af6o2sWHt`, `target: production`,
  `state: READY`, erstellt `2026-08-10T21:03:04Z`, Vercel-Metadatum
  `githubCommitSha=6030cbb71a39448b598106531970c4b5c681df6f` — Production basiert
  nachvollziehbar auf dem Merge-Commit.

**Der Morgenlauf**

- Vercel-Runtime-Log, automatischer Cron (Schedule `0 5 * * *`, kein `workflow_dispatch`,
  kein manueller Aufruf): `05:00:26 GET /api/cron/morning-briefing 200`,
  `lauf=cron-morning-briefing-20260811050027-ifo1h`.
- `[cron/morning-briefing/fairness] geplant=ottilie-paola-klein-2,cem-ince,annika-klose,
  helmut-kleebank,ruppert-st-we begonnen=<dieselben fünf> erfolgreich=5 fehlgeschlagen=0
  kapazitaet=5 obergrenzeLaeufe=1 laufzustand=abgeschlossen zustand=ok`.
- `[cron/morning-briefing] 14522ms tenants=5 reason=ok frischebelege=5/5`.
- Zeitfenster deployment→jetzt (`2026-08-10T21:03Z`–`2026-08-11T07:55Z`) auf
  `/api/cron/morning-briefing` durchsucht: **genau ein** Aufruf. Kein zweiter Push, kein
  Watchdog-Ersatzlauf auf dieser Route.
- `briefing-watchdog.yml` (GitHub Actions, `event: schedule`, kein manueller Trigger)
  lief 06:12:44 UTC erfolgreich, ruft aber `/api/cron/pipeline-status`/`/api/cron/pipeline`
  — eine andere Route als der Morgen-Cron; keine Überschneidung mit `morning-briefing`.
- Keine Zeile `FRISCHEBELEG NICHT PERSISTIERT`, keine Zeile `FRISCHEVERTRAG nicht erfuellt`
  im gesamten Fenster (log-durchsucht). Keine `error`/`warning`-Log-Zeilen, keine
  `get_runtime_errors`-Treffer seit dem Deployment.

**Belegzeilen (relational gegengeprüft, GET-only gegen `SUPABASE_URL`)**

| Mandat | id | user_id | payload.tenantId | berlinTag | status | ausloeser |
|---|---|---|---|---|---|---|
| annika-klose | `bf-annika-klose-morgenlage-2026-08-11` | annika-klose | annika-klose | 2026-08-11 | erfolg | morgenlauf |
| cem-ince | `bf-cem-ince-morgenlage-2026-08-11` | cem-ince | cem-ince | 2026-08-11 | erfolg | morgenlauf |
| helmut-kleebank | `bf-helmut-kleebank-morgenlage-2026-08-11` | helmut-kleebank | helmut-kleebank | 2026-08-11 | erfolg | morgenlauf |
| ottilie-paola-klein-2 | `bf-ottilie-paola-klein-2-morgenlage-2026-08-11` | ottilie-paola-klein-2 | ottilie-paola-klein-2 | 2026-08-11 | erfolg | morgenlauf |
| ruppert-st-we | `bf-ruppert-st-we-morgenlage-2026-08-11` | ruppert-st-we | ruppert-st-we | 2026-08-11 | erfolg | morgenlauf |

Abfrage `id=like.bf-*-morgenlage*-2026-08-11` lieferte **genau diese fünf Zeilen** — keine
Fehlerzeile (`morgenlage-fehler`), keine fremde Mandats- oder Tageszeile wurde mitgezählt.
`user_id`, `payload.tenantId` und `berlinTag` stimmen je Zeile eindeutig überein (F1-Prüfung
des Reviews bestätigt sich in Production).

**Aktive Mandate**

`profiles`+`mandate_profiles` relational gelesen: 10 Profilzeilen, davon 5 aktiv
(`aktiv≠false`, `geloescht_at` leer) — exakt `annika-klose, cem-ince, helmut-kleebank,
ottilie-paola-klein-2, ruppert-st-we`. Deaktiviert: `angela-merkel`, `james-brown`,
`max-mustermann`, `helmut-abnahme-berlin` (unverändert, §3 CURRENT_STATE.md). Eine zehnte
Zeile `mdb-a` trägt **keine** `mandate_profiles`-Zeile — nach derselben Lebenszyklusregel wie
die Laufzeit (`tenant-context.relationalesProfilLebenszyklus`) unvollständig und **nicht**
aktiv; sie beeinflusst die Fünferzahl nicht, ist aber als Beobachtung festgehalten.

**OP-30 unverändert deaktiviert**

`GET /rest/v1/helmut_jobs` und `GET /rest/v1/llm_reservations` liefern `404 PGRST205`
(„Could not find the table") — beide Migrationen sind in Production **nicht** eingespielt.
Runtime-Log 06:10/06:22 UTC: `[cron/lage-briefing-nachlauf] uebersprungen — OP-30-Flags aus,
keine Verarbeitung`.

**Runtime-Logs seit Deployment (2026-08-10T21:03Z–2026-08-11T07:55Z, vollständig gesichtet)**

11 Aufrufe, alle `200`, keine `error`/`warning`-Log-Zeile, keine `get_runtime_errors`-Treffer:
`/` · `/api/release/public` · `crawl` (04:00, `status=teilweise budgetErschoepft=true
verstanden=8` — vorbestehender Verstehensrückstand, OP-14, **nicht** durch PR #238 verursacht:
dieselbe Kennzahlklasse stand bereits vor dem Sprint offen) · `morning-briefing` (05:00,
s. o.) · `understanding` (05:31, 21:30) · `lage-briefing` (05:45) · `lage-briefing-nachlauf`
(06:10, 06:22, beide übersprungen) · `pipeline-status` (06:12, Watchdog-Vorprüfung) ·
`health-report` (06:00). Keine neue Fehlerklasse, keine Regression durch PR #238 erkennbar.

**Nicht live nachgesehen:** der gerenderte Kopfstatus in der Oberfläche wurde in dieser
Sitzung nicht per authentifizierter Session abgerufen (kein Zugangsgeheimnis verfügbar).
Da für alle fünf Mandate ein gültiger, mandats- und tagesscharfer Erfolgsbeleg vorliegt und
der Kopfstatus laut testgesichertem Code (F1–F6 des Reviews, `briefing-frische-audit-test.js`
34/34) „Aktuell" **nur** bei genau einem solchen Beleg zeigt, ist die Anzeige mit hoher
Sicherheit korrekt — aber nicht per Live-Aufruf verifiziert. Der Umkehrfall („Briefing noch
nicht aktuell" bei fehlendem Beleg) trat heute bei keinem der fünf Mandate ein und konnte
daher nicht live beobachtet werden; künstliche Fehlerzustände sind laut `CLAUDE.md` §7.7.5-
Methodik/29B-Praxis nicht Gegenstand eines Production-Nachweises.

**Urteil:** Alle 16 verbindlichen Abnahmekriterien des OP-31-Production-Nachweises sind
anhand von Vercel-Runtime-Logs, GitHub-API und relational gelesenen Production-Daten erfüllt.
**OP-31 gilt als abgeschlossen.**

---

## 10 · Unabhängiger adversarialer Review (2026-08-10, nach dem PR)

Eigene, vom Bericht oben unabhängige Gegenprobe an Diff, Datenwegen und Tests.
Sie hat **sechs echte Befunde** ergeben; alle sind auf demselben Branch behoben und
durch die neue Suite `scripts/briefing-frische-audit-test.js` (34 Prüfungen)
gegengesichert. Jeder Befund war **vor** der Korrektur reproduzierbar rot.

| Nr. | Befund | Schwere | Korrektur |
|---|---|---|---|
| **F1** | **Der Tagesbeleg war nicht mandatsscharf.** `storage.getRenderedBriefingV3` wählt allein über `id=eq.bf-<mandat>-<slot>-<tag>` — **ohne `user_id`-Filter** (der Tenant-JWT-Modus ist dauerhaft stillgelegt, F-1). Eine Zeile, die einem anderen Mandat oder einem anderen Berliner Tag gehört, wurde als eigener heutiger Beleg akzeptiert. Für einen Cache genügt das, für einen **Sicherheitsbeleg** nicht (CLAUDE.md §4.1) | **hoch** (Kern der Zusage „mandatsscharf"); Auslösung setzt eine Kennungskollision oder Datenverfälschung voraus | `briefing-lauf.ausZeile` prüft jede gelesene Zeile gegen den **angefragten** Mandanten (`row.user_id` **und** `payload.tenantId`) und den **angefragten** Berliner Tag. Abweichung ⇒ kein Beleg (ehrlich „noch nicht aktuell") + lautes Protokoll |
| **F2** | **Ein wochenalter Vorgang wurde zu „Neu seit dem letzten Briefing" hochgestuft** und trug dort das Datum **„Heute"**. Ursache: die Frischeklasse folgte `item.lastUpdated`, und das ist ein Maximum über `ko.updated_at` — Helmuts **eigener Schreibzeitpunkt**. Jeder Backfill (`presentation-backfill`, `staff-backfill`) und jede Reklassifizierung hebt ihn auf „heute" | **hoch** (genau die alte Lage im Gewand der heutigen; verletzt „echtes Datum behalten") | Neuer, additiver **belegter Meldungszeitpunkt** `meldungAt` = jüngstes `published_at` der Quelldokumente, hilfsweise `ko.created_at` — **nie** `updated_at`. Klasse und Datumslabel folgen ihm; `lastUpdated`, Rangfolge und Auswahl bleiben unverändert. Eine echte neue Entwicklung an einem alten Vorgang (neues Dokument von heute) bleibt zu Recht „neu" |
| **F3** | **Ein Vorgang von gestern stand unter der Überschrift „Morgenbriefing".** Das Briefingfenster ersetzt den Kalendertags-Guard; damit blieb der Kopf zu Recht `fresh`, verlor aber die bestehende Regel „bei nicht-heutigem Stand kein Slot-Name" | **mittel** (optisch die heutige Lage) | `currentHelmutState.datenstandVonHeute`/`datenstandTag` (Anzeige-Angabe, stuft nichts um); der Kopf zeigt dann „Letzter Stand · <echtes Datum>". Gegenprobe: ein heutiger Vorgang trägt weiterhin den Slot-Namen |
| **F5** | **Bei gezogenem Not-Aus** (`HELMUT_BRIEFING_FRISCHE=off`) meldete der Morgen-Cron bei **jedem** Lauf „FRISCHEVERTRAG unvollständig" für **alle** Mandate | niedrig (Dauerfehlalarm, verdeckt echte Befunde) | Ohne Vertrag entsteht kein Beleg und keine Abdeckungsbehauptung; die Antwort weist `frischevertrag.vertrag: "not-aus"` aus |
| **F6** | **Die Abdeckungszahl zählte auch eine FEHLER-Quittung als „belegt".** Ein vollständig gescheiterter Morgenlauf meldete `frischebelege=1/1` — **falsches Grün an genau der Stelle, die es verhindern soll** (vom neuen Integrationstest über die echte Cron-Route aufgedeckt) | **hoch** (Betreibersicht) | Als belegt zählt nur ein **verifizierter Erfolg** oder eine Wiederholung. Zusätzlich eine eigene Meldung `FRISCHEVERTRAG nicht erfuellt: nur X von Y …`, getrennt von der Persistenzmeldung |
| **F4** | **Das Wiederholungsfenster war so breit wie die Bauzeit.** Der Beleg wurde **vor** dem bis zu 60 s dauernden Bau gelesen; ein überlappender Lauf (Watchdog trifft regulären Cron) sah dort ebenfalls „kein Beleg" und pushte ein zweites Mal | mittel | Zweite Lesung **unmittelbar vor** Push und Schreibvorgang. Das verkleinert das Fenster von der Bauzeit auf die Dauer eines Lesezugriffs. Es **beseitigt** das Rennen nicht (siehe Restrisiko unten) |

### Was der Review **bestätigt** hat (keine Änderung nötig)

- **Kein Rückfall auf den Vortag.** Ohne heutigen Erfolgsbeleg gibt es in Kopf,
  Karte, Zustand und kompakter Antwort ausschließlich „Briefing noch nicht aktuell";
  alle acht Fehlerklassen (fehlender Lauf, fehlgeschlagener Lauf, veralteter Lauf,
  unbekannte Vertragsversion, veraltete Daten, unbekannter Datenstand, unbestimmbare
  Zeitzone, nicht lesbarer Beleg) führen dorthin. Der Vertrag kann **nur herabstufen**.
- **Der Lesepfad schreibt keine Quittung** — quelltextgesichert; ein fehlender
  Morgenlauf wird gemeldet, nicht nachträglich behauptet.
- **Fehler nach belegtem Erfolg** überschreibt den Erfolg nicht (getrennte Zeilen).
- **Speicherfehlerkette:** `v3-store-disabled`/`store-error` ⇒ Fehlerquittung, kein
  Erfolg. Über die **echte** Cron-Route nachgewiesen (INT3/INT4).
- **Zeitzone:** Tageswechsel, Sommer-/Winterversatz und beide Umstellungstage
  stimmen; Client, Server, Narrativ-Cache und Beleg nutzen denselben Tagesbegriff.
  Nicht existierende Ortszeit (29.03. 02:30) liefert **deterministisch** den Zeitpunkt
  **vor** der Lücke, doppelte Ortszeit (25.10. 02:30) deterministisch das **erste**
  Vorkommen — beides folgenlos, weil nur Mitternacht abgefragt wird. Der Kommentar im
  Modul, der etwas anderes behauptete, ist berichtigt.
- **Datensparsamkeit:** die Quittung trägt Kennzahlen und Zeitpunkte, keine Texte,
  keine URLs, keine Inhalte.

### Verbleibende Risiken nach dem Review

1. **Gleichzeitige Läufe bleiben theoretisch möglich.** Der Morgen-Cron nimmt keine
   eigene Mandatssperre; die Absicherung ist der Versuchsvermerk der Fairnessschicht
   (`HELMUT_CRON_FAIRNESS`, Default an). Bei **abgeschalteter** Fairness und exakt
   überlappenden Läufen sind ein doppelter Push und ein doppelter Schreibvorgang
   weiterhin möglich. Wirkung: doppelte Benachrichtigung, **kein** falsches Grün.
2. **Der Datenstand bleibt global** (§8.5) — ein mandatsspezifischer Datenstillstand
   wird nicht erkannt.
3. **Zusätzliche Last** (gemessen an den Aufrufpfaden, nicht an Production):
   Morgenlauf **6** kleine Zeilenzugriffe je Mandat beim ersten Lauf des Tages
   (1 Beleg + 2 Rückblick + 1 Zweitlesung + 1 Schreibvorgang + 1 Gegenlesen),
   **1** bei einem erkannten Wiederholungslauf; Lesepfad **1–4** je Briefing-Abruf.
   Alle laufen als Primärschlüsselzugriff auf `briefings(id)` — kein fehlender Index,
   keine Abfrage je Element, **kein zusätzlicher KI-Aufruf** (quelltextgesichert).
   Hochrechnung Morgenfenster: 5 Mandate ≈ 30 · 25 ≈ 150 · 200 ≈ 1 200 · 1 000 ≈ 6 000
   Zeilenzugriffe. Bei Parallelität 8 und ~45 ms je Zugriff sind das ~7 s bei 200
   Mandaten (≈ 2,5 % des 270-s-Slotbudgets) und ~34 s bei 1 000 — bei 1 000 Mandaten
   ist ohnehin schon der Motor überlastet (OP-30).
4. **Wachstum von `briefings`:** bis zu zwei Quittungszeilen je Mandat und Tag
   (≈ 146 000 Zeilen/Jahr bei 200 Mandaten). Die Tabelle ist im Aufbewahrungsvertrag
   als `nutzer-ausgabe`, 90 Tage geführt — die Löschung ist aber **nicht scharf**
   (OP-12). Bis dahin wächst die Tabelle unbegrenzt.
5. **Die 5 roten Offline-Suiten sind Umgebungsartefakte dieser Sitzung**, nicht des
   Repositorys: `kalender-ics` scheiterte nur an nicht installierten Abhängigkeiten
   (nach `npm ci` grün, verbleibende Rote danach **4**); `privacy-vollstaendigkeit`, `profile-db`, `provision-tenant`
   und `tenant-neutrality` scheitern am lokalen Netzriegel bzw. am Zustand des
   lokalen Datenverzeichnisses. Unabhängig gegengeprüft: auf `origin/main` (`ec2e208`)
   **identisch rot, mit identischer Fehlermeldung**; die CI derselben Commit-Stände
   ist auf allen drei Prüfungen grün.

**Urteil des Reviews:** Nach den sechs Korrekturen erfüllt der Vertrag die Zusage —
ohne mandats- und tagesscharfen Erfolgsbeleg gibt es kein „Aktuell", und kein
Datenstand vom Vortag erscheint als heutige Lage.
