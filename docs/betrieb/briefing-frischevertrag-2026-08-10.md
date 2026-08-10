# Frischevertrag des Morgenbriefings (Sprint 2026-08-10)

**Kanonische Belegdatei** für den verbindlichen Frischevertrag. `docs/CURRENT_STATE.md`
führt davon nur die entscheidungsrelevanten Zeilen. Zustand des Sprints:
**teilweise abgeschlossen** — lokal vollständig gebaut, getestet und reviewbar;
Merge, Deployment und Production-Nachweis stehen aus.

**Branch:** `claude/briefing-freshness-guarantee-r36h8m` · **PR:** gegen `main`, nicht gemergt
**Neuer offener Punkt:** OP-31 ([`../datenmotor-restliste.md`](../datenmotor-restliste.md))

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
| `node scripts/run-offline-tests.js` (kanonisch, offline erzwungen) | **236/241 Suiten grün in 483 s** |
| `node scripts/browser-smoke-test.js` | **32 PASS, 0 FAIL** |

**Die 5 roten Suiten sind Basisrot**, nachgemessen im selben Sprint gegen einen
sauberen Arbeitsbaum auf `origin/main` (`ec2e208`) — dort **identisch rot**:
`kalender-ics` (fehlendes Modul `ical.js`), `privacy-vollstaendigkeit`, `profile-db`,
`provision-tenant`, `tenant-neutrality` (die letzten vier dokumentiert in
[`op30-testbefunde-2026-08-08.md`](op30-testbefunde-2026-08-08.md)).

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

## 9 · Nächster Schritt

1. Review und **Merge-Entscheidung** durch den Betreiber (Merge = Deployment).
2. Nach dem Merge: den **ersten Morgenlauf** ansehen —
   `frischevertrag.belegt` muss `mandate` erreichen; jede Zeile
   `FRISCHEBELEG NICHT PERSISTIERT` ist ein echter Befund.
3. Erst danach die OP-30-Stufe 2 (25 Mandate) freigeben; die Abdeckungszahl des
   Morgenlaufs ist ab dann die Messgröße dafür, ob 25 Mandate wirklich täglich
   versorgt werden.
