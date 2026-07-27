# Paket-Inventur Production — wiederholbare Erhebung aller Quellenpakete

**Kanonische Stelle für Phase-1-Punkt 18.** Seit dem 2026-07-27 ist die Inventur ein
**ausführbares Werkzeug**, keine gepflegte Tabelle mehr.

| | |
|---|---|
| **Werkzeug** | `node scripts/paket-inventur.js` (rein lesend) · `--json` für die vollständige Fassung |
| **Reine Logik** | [`lib/helmut/quellenarchitektur/paket-inventur.js`](../../lib/helmut/quellenarchitektur/paket-inventur.js) |
| **Testsuite** | `scripts/paket-inventur-test.js` (162 Assertions) · `scripts/admin-source-ui-test.js` (E/F-Block) |
| **Im Betrieb sichtbar** | Admin → **Quellen & Watchdog** → Karte „Paket-Inventur" |
| **Letzte Production-Erhebung** | 2026-07-27, 07:30 UTC (§5) |

> **Warum das Werkzeug den handgepflegten Vorgänger ersetzt.** Die Erhebung vom
> 2026-07-25 (§9, als Beleg erhalten) war inhaltlich richtig und trotzdem strukturell
> untauglich: sie veraltet still. Genau das ist der Fehlermodus, den eine Inventur
> aufdecken soll — die politische Versorgung eines Mandats fällt unbemerkt aus. Eine
> Momentaufnahme kann das per Konstruktion nicht leisten. Punkt 18 verlangt deshalb
> ausdrücklich eine automatisiert reproduzierbare Ausgabe.

> **Es wird nichts verändert.** Das Werkzeug führt ausschließlich `select`-Abfragen aus:
> keine Migration, keine Aktivierung, keine Production-Datenänderung, keine Flag-,
> Cron- oder Secret-Änderung.

---

## 1 · Was je Paket beantwortet wird

Neun Pflichtangaben, jede aus echten Betriebsdaten:

| # | Angabe | Feld |
|---|---|---|
| 1 | Kennung und verständlicher Name | `key`, `name` |
| 2 | Ebene, Region, politische Zuordnung | `ebene`, `region`, `istBasispaket`, `pflichtklassen` |
| 3 | Zugeordnete Abrufwege | `abrufwege.liste` (je Weg beide Achsen, §3) |
| 4 | **Tatsächlicher** Aktivierungszustand | `aktivierung` (`paketAktivierung`, `refCount`, `mandate`, `ausfuehrbar`, `begruendung`) |
| 5 | Ertrag aus dem echten Betrieb | `ertrag.letzterLauf` **und** `ertrag.betriebszeitraum` |
| 6 | Letzte erfolgreiche Lieferung | `letzteLieferung` (mit `grundlage`) |
| 7 | Aktuelle Fehler / Einschränkungen | `fehler` (Punkt-16-Klassen + strukturelle Sperren) |
| 8 | Erhebungszeitpunkt | `erhobenAm` (im Kopf **und** an jeder Paketzeile) |
| 9 | Genau ein Zustand | `zustand` + `zustandGrund` (§3) |

**„Aktiviert" heißt nicht „Datensatz vorhanden".** Ein Paket gilt nur dann als
ausführbar, wenn mindestens ein zugeordneter Abrufweg im **aktuellen Crawl-Plan** steht.
Ein `active`-Paket, das kein Mandat anfordert, ist `inaktiv`; ein angefordertes Paket
ohne Versorgung erscheint als `requested_unsupplied`.

## 2 · Quelle der Wahrheit — vier vorhandene Bausteine, keine zweite Buchführung

Die Inventur speichert **nichts**. Sie leitet ab:

| Baustein | Beantwortet | Herkunft |
|---|---|---|
| `source_packages` · `package_paths` · `retrieval_paths` · `geographies` | Bestand und Einordnung | relationale Quellentabellen |
| `source-mode.buildRelationalCrawlPlan` | **läuft der Weg wirklich?** (Landesmodul-Gate, `manual`-Sperre, `broken`, DIP-Sonderpfad, URL-Dedup) | Punkt 14 / Cutover |
| `profile-packages.computeGlobalActivation` | **wer braucht das Paket?** (Referenzzählung über die echten Profile) | Sprint 4 |
| `source-failure.bewerteQuellenstoerungen` | **was tut der Weg tatsächlich?** (14 Klassen, 4 Handlungsstufen) | **Punkt 16, unverändert** |
| `source_crawl_telemetry` | Ertrag, Lieferzeitpunkte, Fehlerbilder | Punkt 16 · Lesepfad seit A-6 |

Kostenzahlen aus Punkt 17 sind **optional verknüpfbar** (`kostenJeQuelle`) und nicht
Gegenstand dieses Punktes. Ohne Kostendaten behauptet die Inventur nie „0,00 USD".

## 3 · Die zwei Achsen und die fünf Zustände

Ein Abrufweg trägt **zwei getrennte** Zustände. Sie zu verschmelzen war der Grund,
warum ein bewusst abgeschalteter Weg bisher wie ein Datenloch aussah:

- **Planzustand** (strukturell): `eingeplant` · `defekt` · `ausgeschlossen` (mit Grund)
- **Laufzustand** (beobachtet): die Punkt-16-Klasse aus der echten Laufhistorie

Ein `broken`-Weg wird nie abgerufen, erzeugt also **nie** Telemetrie und ist für Punkt 16
folgerichtig `unbekannt`. Erst die Planachse macht daraus „bewusst abgeschaltet, liefert
nichts".

**Paketzustand — geprüfte Reihenfolge.** `gesund` verlangt **positive** Belege; alles
andere fällt in eine ehrliche Klasse, nie nach unten:

| Zustand | Bedingung |
|---|---|
| **ausgefallen** | aktiviert, aber ohne Abrufweg · oder alle Wege nicht ausführbar · oder kein eingeplanter Weg trägt |
| **eingeschränkt** | trägt, aber: gestörte Wege · defekte Wege · Wege ohne Laufdaten · akuter/zeitnaher Handlungsbedarf · 0 Lieferungen oder 0 neue Dokumente |
| **unbekannt** | eingeplant, aber ohne verwertbare Telemetrie (auch: alle Wege unter der Punkt-16-Mindestlaufzahl) |
| **inaktiv** | kein Weg eingeplant, und **alle** Ausschlüsse sind bewusst (Landesmodul-Sperre, `manual`, `dev_only`, pausiert, kein aktives Paket, doppelte URL, DIP-API) |
| **gesund** | alle eingeplanten Wege tragen störungsfrei, kein defekter Weg, echter Ertrag im Betriebszeitraum |

Ein angefordertes, aber unversorgtes Paket bleibt bewusst `inaktiv` (es ist nicht kaputt,
es ist nicht in Betrieb) — die Lücke verschwindet trotzdem nicht: sie steht als
`flags.angefordertUnversorgt` und im Zustandsgrund.

**Kennzeichen, die nie in einer Sammelzahl untergehen:** `ohneAbrufwege` ·
`ohneEingeplanteWege` · `ohneTelemetrie` · `ohneLieferungImFenster` ·
`ohneLieferungJemals` · `ertragNullImFenster` · `defekteWege` · `angefordertUnversorgt`.

**Zwei Messfenster** (der Auftrag verlangt beide): der **letzte vollständige Lauf** und
der **Betriebszeitraum** (Standard 14 Tage). „Vollständig" ist datenabgeleitet — ein Lauf
muss mindestens die Hälfte der eingeplanten Wege wirklich **versucht** haben (Schwelle
wird mitgeliefert). Das entschärft Befund **A-7**: der Wiederholungslauf, der ~3 Minuten
später fast nur `circuit-open` schreibt, wird nicht mehr für „den letzten Lauf" gehalten.

**Veraltete Datengrundlage ist ein eigener Befund.** Fällt der Crawl als Ganzes aus, ist
keine *einzelne* Quelle „veraltet" — es kommt schlicht nichts mehr herein, und jede
Paketzeile beschreibt dann gestern. Die Schwelle ist rhythmus-abgeleitet (beobachteter
Abstand der Vollläufe × 2, Boden 3 h, Deckel 24 h, Standard 12 h ohne genug Läufe), keine
feste Stundenzahl: derselbe Rückstand ist bei fünf Vollrunden je Tag ein Befund und bei
einem zweimal-täglichen Rhythmus keiner.

## 4 · Ausführen

```bash
node scripts/paket-inventur.js                    # Klartextbericht
node scripts/paket-inventur.js --json             # vollständig, maschinenlesbar
node scripts/paket-inventur.js --paket=bund-basis # ein Paket inkl. Wegeliste
node scripts/paket-inventur.js --wege             # Wegeliste für jedes Paket
node scripts/paket-inventur.js --stand=<ISO>      # Bewertungszeitpunkt fixieren (reproduzierbar)
node scripts/paket-inventur.js --fenster=30       # anderer Betriebszeitraum
```

Secrets ausschließlich aus `process.env` (CLAUDE.md §4.9). Ohne `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` endet der Lauf mit **Exit 2** — nie mit einem grünen Ergebnis
ohne Datenbank.

Dieselben Zahlen liefert der Admin-Endpunkt `sources` als `paketInventur` (verdichtet,
ohne Wegelisten) und rendert sie in **Quellen & Watchdog**.

**Zugangsgrenze, die benannt bleiben muss:** `HELMUT_LANDESMODULE` liegt in Production in
der Vercel-Env und ist aus einer Sitzung **nicht lesbar**. Solange **kein** Land ein
aktivierungsberechtigtes Landtagsmandat hat, ist das folgenlos — dann steht „Landesmodule
inaktiv" unabhängig vom Flag aus der Datenbank fest, und die Inventur sagt das
ausdrücklich. Erst mit einem berechtigten Landtagsmandat wird der unbekannte Flag-Wert zu
einer echten Unsicherheit; dann meldet die Inventur `landesmodule.unsicher = true`.

## 5 · Production-Erhebung 2026-07-27, 07:30 UTC

Rein lesend gegen die Production-Datenbank, Code-Stand `main` `719df29` (Merge #144).
Reproduziert mit `--stand=2026-07-27T07:30:00Z`; zwei unabhängige Läufe lieferten
**byte-identisches** JSON (289 526 Bytes).

**Datengrundlage:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen · 50 Geografien ·
**0** verwaiste Zuordnungen · **0** Abrufwege ohne Paket · 9 Profile gelesen, davon
**6 aktivierungsberechtigt** · 13 228 Telemetriezeilen / 14 Tage · 106 Läufe, davon
**53 vollständig** (Schwelle 70 versuchte Quellen).

> ⚠ **Veraltete Datengrundlage.** Jüngste Telemetriezeile 2026-07-26 20:03:55 UTC —
> **11,4 Stunden alt** bei einer Erwartung von höchstens 8 h (beobachteter Abstand der
> Vollläufe 4 h × 2). Der 04:00-Cron hat keine Zeile geschrieben. Das ist der laufende
> Crawl-Zeitlimit-Vorfall ([`../betrieb/incident_2026-07-27_crawl_zeitlimit.md`](../betrieb/incident_2026-07-27_crawl_zeitlimit.md)),
> hier zum ersten Mal **automatisch** als Befund erkannt und nicht als „alles ruhig".

**Letzter vollständiger Lauf** `crawl-20260726200015-z3qaf` (2026-07-26 20:03 UTC):
147 Quellen versucht · 145 mit Inhalt · 2 leer · **0 Fehler** · 0 gedrosselt ·
1 762 Dokumente gefunden, **937 neu**. Zusammensetzung nachgemessen: **140 Katalogwege +
7 Laufzeit-Personensuchen genau eines Mandats** (§6, B-3).

**Zustände: 1 gesund · 3 eingeschränkt · 1 ausgefallen · 4 inaktiv · 0 unbekannt.**
**Abrufwege: 140 eingeplant · 4 defekt · 19 ausgeschlossen** (18 Landesmodul-Wege +
1 DIP-API-Pfad; die Paketsummen zählen den zweiländrigen `rp-rbb24-politik` erwartungsgemäß
zweimal). **Ertrag 14 Tage: 86 485 gefunden · 47 344 neu** über 182 Quellen.

| Zustand | Paket | Ebene · Region | Wege (ges/eingepl/def/aus) | Aktivierung | neu (14 T) | letzte Lieferung |
|---|---|---|---|---|---|---|
| **ausgefallen** | `profil-<mandats-id>` | bund · — | 1 / 1 / 0 / 0 | `active`, 1 Mandat | 1 | 2026-07-17 10:01 |
| **eingeschränkt** | `arbeit-und-soziales` | bund · Bund | 84 / 82 / 2 / 0 | `active`, 5 Mandate | 18 229 | 2026-07-26 20:03 |
| **eingeschränkt** | `bund-basis` | bund · Bund · **Basis** | 54 / 52 / 1 / 1 | `active`, 6 Mandate | 24 986 | 2026-07-26 20:03 |
| **eingeschränkt** | `die-linke-bund` | bund · Bund | 3 / 2 / 1 / 0 | `active`, 1 Mandat | 761 | 2026-07-26 20:03 |
| **inaktiv** | `berlin-basis` | land · Berlin · **Basis** | 7 / 0 / 0 / 7 | `inactive`, 0 Mandate | 0 | **nie** |
| **inaktiv** | `brandenburg-basis` | land · Brandenburg · **Basis** | 9 / 0 / 0 / 9 | `inactive`, 0 Mandate | 0 | **nie** |
| **inaktiv** | `die-linke-berlin` | land · Berlin | 3 / 0 / 0 / 3 | `inactive`, 0 Mandate | 0 | **nie** |
| **inaktiv** | `die-linke-brandenburg` | land · Brandenburg | **0** / 0 / 0 / 0 | `inactive`, 0 Mandate | 0 | **nie** |
| **gesund** | `regional-niedersachsen` | land · Niedersachsen | 4 / 4 / 0 / 0 | `active`, 1 Mandat | 54 | 2026-07-26 20:03 |

Die vier **defekten** Wege: `bundesregierung` (`always_on`, `bund-basis`),
`ausschuss-arbeit-soziales` und `dgb` (`arbeit-und-soziales`), `die-linke`
(`die-linke-bund`).

## 6 · Befunde dieser Erhebung

Alle Befunde sind **Beobachtungen**, keine in diesem Sprint verursachten Änderungen. Es
wurde nichts korrigiert — jede Korrektur wäre eine Production-Datenänderung und damit
freigabepflichtig.

| # | Befund | Wirkung | Behandlung |
|---|---|---|---|
| **B-1** | **`berlin-basis` steht weiterhin auf `status='active'`** (`updated_at` 2026-07-26 21:02:11 = Block B1 der Punkt-14-Aktivierung). Die am selben Abend ausgeführten Rollback-Ebenen **0b** und **2** setzen den Paketstatus laut Runbook ausdrücklich **nicht** zurück. | Heute **folgenlos**: 0 berechtigte Berliner Mandate → `refCount 0` → alle 7 Wege landesmodul-gesperrt, alle wieder `needs_review`+`manual`. Aber: von den zwei dokumentierten Sicherungsschichten für Berlin ist eine verbraucht — entstünde ein Berliner Landtagsmandat, wäre das Paket **sofort** `active` statt `requested_unsupplied`. | dokumentiert; Rückstellung auf `prepared` wäre eine Production-Datenänderung → **freigabepflichtig**, nicht ausgeführt. `CURRENT_STATE` §9 nachgezogen |
| **B-2** | **`profil-<mandats-id>` ist das einzige ausgefallene Paket.** Sein einziger Abrufweg trägt dieselbe `source_id` wie die zur Laufzeit erzeugte Personensuche (`<mandats-id>-news`) — Katalogweg und Laufzeitquelle sind in der Telemetrie **nicht unterscheidbar**. Klasse `instabil`: 21 getrennte Ausfälle, 22 von 76 Läufen fehlgeschlagen, letzte Lieferung 2026-07-17. | Der Ertrag der Katalogzeile ist nicht von dem der Laufzeitquelle trennbar; die Zeile ist redundant zum Laufzeitmechanismus. Verschärft **A-5** (dort noch „liefert in 5 von 5 Läufen `empty`") | dokumentiert; berührt **OP-19** (`source_id`-Eindeutigkeit). Entfernen der Katalogzeile wäre eine Production-Datenänderung → freigabepflichtig |
| **B-3** | **Die mandatsindividuelle Versorgung fällt für die Mehrheit der Mandate aus.** 42 Laufzeit-Personensuchen existieren, **29 haben im Betriebszeitraum nie geliefert**. Je Mandat gemessen (anonymisiert): **M2** 7 Quellen, 6 `ok` (einzige funktionierende) · **M3** 6 Quellen, alle `langsam`, letzte Lieferung **2026-07-20** · **M4–M7** je 7 Quellen, **keine einzige Lieferung**, überwiegend `gedrosselt` (`circuit-open`) bzw. `unbekannt` · **M1** 1 Quelle, `unbekannt`. Der letzte Volllauf enthielt **7 von 42** Laufzeitquellen — alle von **einem** Mandat. | Von 6 aktivierungsberechtigten Mandaten erhält **eines** seine personenbezogene Beobachtung. Radar, Briefing und Lage stützen sich für die anderen ausschließlich auf die geteilten Bundespakete. Das ist genau der „unbemerkte Ausfall", den Punkt 18 sichtbar machen soll — bisher tauchte er in **keiner** Kennzahl auf | **neu**; dominante Ursache `circuit-open` = zentrale Drosselung, kein Quellendefekt → gehört zu **OP-15** (Google-News-Klumpenrisiko). Ursachenanalyse ist ein eigener Sprint |
| **B-4** | **11 von 82 eingeplanten Wegen in `arbeit-und-soziales` sind `instabil`** — ausnahmslos `bundle-ausschuss-*`, also Google-News-Bündelsuchen. | Das Paket bleibt versorgt (71 Wege tragen), die Störung ist aber systematisch und nicht quellenspezifisch | → **OP-15** |
| **B-5** | **`die-linke-brandenburg` hat 0 Abrufwege**, `die-linke-berlin` hat 3. | Der Landesmodul-Seed ist weiterhin nur **teilweise** eingespielt (bekannt aus `CURRENT_STATE` §9); die Inventur weist es jetzt automatisch aus (`flags.ohneAbrufwege`) | bekannt; Einspielung ist freigabepflichtig |
| **B-6** | **Der Crawl steht seit 2026-07-26 20:03:55 UTC** (§5). | Jede Paketzeile beschreibt den Stand des letzten Laufs, nicht „jetzt" | laufender Vorfall, Reparatur liegt auf `main` (#144), Production-Nachweis offen |
| **B-7** | **Befund A-4 hat sich verkleinert:** von den `always_on`-Kernwegen ist nur noch **einer** defekt (`bundesregierung`); `bundestag` und `linksfraktion` liefern wieder. | Die Stufe-1-Reaktivierung vom 2026-07-26 11:07 UTC wirkt nachweislich | Bestätigung, keine Maßnahme |

## 7 · Abnahme gegen die zehn geforderten Prüfungen

| # | Prüfung | Nachweis |
|---|---|---|
| 1 | Jedes Paket erscheint genau einmal | `paket-inventur-test.js` Gruppe 1 · Production: 9 Zeilen für 9 `source_packages` |
| 2 | Alle zugeordneten Abrufwege erfasst | Gruppe 2 (inkl. mehrfach zugeordneter Weg und verwaister Zuordnung) · Production: 165 Zuordnungen, 0 verwaist, 0 Weg ohne Paket |
| 3 | Aktiv/inaktiv korrekt unterschieden | Gruppe 3 — u. a. „liefernder Weg eines unreferenzierten Pakets gilt **nicht** als eingeplant" |
| 4 | Fehlende Lieferungen sichtbar | Gruppe 4 · Production: 4 Pakete „nie geliefert", 29 Laufzeitquellen ohne Lieferung |
| 5 | Fehler verständlich klassifiziert | Gruppe 5 — Klassen und Handlungsstufen stammen **unverändert** aus Punkt 16 |
| 6 | Unbekanntes bleibt unbekannt | Gruppe 6 — ohne Telemetrie, bei zu dünner Datenlage und bei 0 Ertrag wird **nie** `gesund` gemeldet |
| 7 | Ausgabe reproduzierbar | Gruppe 7 · **gegen Production**: zwei Läufe mit `--stand=…` byte-identisch (289 526 Bytes) |
| 8 | Zahlen = tatsächliche Datenquelle | Gruppe 8 · **gegen Production per SQL gegengeprüft**: 9 / 163 / 165, und 140 + 4 + 19 = 163 |
| 9 | Bestehende Tests bleiben grün | Offline-Suite **163/163**, Browser-Smoke **32/32**, CI-Gate auf PR #146 grün (`Syntax + Offline-Suiten`, `Browser-/Mobile-Smoke (Chromium)`) |
| 10 | Abnahmekriterium gegen echte Production-Daten | §5/§6 — vollständig aus dem Production-Lauf erzeugt |

## 8 · Was diese Inventur **nicht** belegt

- Keine Aussage über die **inhaltliche** Qualität gelieferter Dokumente.
- Kein Ende-zu-Ende-Nachweis bis ins Briefing (Punkte 25–28).
- Keine **Ursachen**analyse der Befunde B-2 bis B-4 — die Inventur misst, sie diagnostiziert nicht.
- Keine Aussage zur fachlichen Vollständigkeit der Pakete; kanonisch dafür:
  [`31-paketvollstaendigkeit.md`](31-paketvollstaendigkeit.md).
- Kein Nachweis, dass ein Landtagsprofil **versorgt** würde (Punkte 14/15).
- Kostenzahlen sind nur verknüpfbar, nicht erhoben (Punkt 17).

---

## 9 · Anhang: Handerhebung 2026-07-25 (historisch, als Beleg erhalten)

> **Nicht als aktueller Stand zitieren.** Diese Momentaufnahme entstand vor dem Werkzeug,
> gegen Code-Stand `main` `61767a9` (Merge #118). Mehrere Zahlen sind seither überholt
> (7 → 9 Pakete; `berlin-basis` 10 → 7 Wege; `bundestag`/`linksfraktion` reaktiviert).
> Der aktuelle Stand steht in §5. Erhalten bleibt sie, weil die Befunde **A-1 … A-8**
> weiterhin referenziert werden.

**Bestand am 2026-07-25:** 7 Pakete in der Datenbank (8 im Code-Seed) · 163 Abrufwege ·
165 Paket-Zuordnungen · 64 Herausgeber · 73 politische Entitäten · 50 Geografien.

**Ertrag über die 5 letzten vollständigen Läufe (20.–25.07.2026):** `bund-basis` 51/54
Wege mit Telemetrie (3 800 gefunden / 2 356 neu) · `arbeit-und-soziales` 82/84
(4 052 / 1 604) · `die-linke-bund` 1/3 (80 / 60) · `regional-niedersachsen` 4/4
(160 / 8) · `profil-<pilot-mandats-id>` 1/1, **0 mal `ok`**, nie geliefert ·
`berlin-basis` 0/10 · `brandenburg-basis` 0/9.

**Modell ↔ echter Lauf:** der Resolver hielt 145 Wege für aktiv, der letzte Volllauf
(`crawl-20260725073113-yx61b`) rief 145 Quellen ab — gleiche Zahl, andere Menge:
138 Katalogwege liefen, 7 modell-aktive nicht (6 `broken` + `dip`), 7 profilgenerierte
Personensuchen liefen zusätzlich, **0** Berlin-/Brandenburg-Wege.

**Zugeordnete Profile:** 8 Mandatsprofile, davon 6 aktiv, alle Bundestagsebene; kein
Landtagsprofil. Technisch aktive Pakete daraus: `bund-basis`, `arbeit-und-soziales`,
`die-linke-bund`, `regional-niedersachsen`, `profil-<pilot-mandats-id>` — 5 von 7.

### 9a · Befunde A-1 … A-8 (weiterhin gültige Referenzen)

| # | Befund | Stand heute |
|---|---|---|
| **A-1** | Production führt **8 Profile (6 aktiv)**, nicht „1 Pilot + 2 Demo-Mandate"; fünf tragen Klarnamen realer Abgeordneter | inzwischen **9 Profile, 6 aktiv** (§5). Weiterhin **OP-04**, freigabepflichtig |
| **A-2** | `07-…` behauptete, die Landes-Basispakete hätten 0 Quellen — Production führte 10 bzw. 9 | korrigiert; heute 7 bzw. 9 (§5) |
| **A-3** | Landes-Basispakete enthielten Partei-/Fraktions-/Personenquellen → Verstoß gegen Mandantenneutralität | **in der Datenbank geschlossen** am 2026-07-26 21:01 (Block A): `berlin-basis` 10 → 7, `die-linke-berlin` 0 → 3. Brandenburg unverändert offen |
| **A-4** | 2 der 5 `always_on`-Kernwege defekt | **verkleinert auf 1** (§6, B-7) |
| **A-5** | `profil-<pilot-mandats-id>` liefert nichts, obwohl dasselbe Mandat 6 Personensuchen fährt | **präzisiert und verschärft** (§6, B-2): gemeinsame `source_id` |
| **A-6** | `retrieval_paths.last_success_at` / `last_error` / `error_streak` zu 0 von 163 befüllt | **unverändert offen.** Deshalb ist `source_crawl_telemetry` die führende Wahrheit — für Punkt 16 **und** für diese Inventur |
| **A-7** | Jeder Cron-Lauf erscheint doppelt; der Wiederholungslauf schreibt fast nur `circuit-open` | **strukturell entschärft** (§3): das Werkzeug wählt den letzten *vollständigen* Lauf datenabgeleitet |
| **A-8** | `07-…` behauptete, der Resolver sei nicht live verdrahtet | korrigiert; er läuft seit dem Cutover live |

### 9b · Nachweis der automatischen Profil→Paket-Zuweisung (2026-07-25, weiterhin gültig)

Drei künstliche Testprofile wurden durch den produktiven Resolver gegen den echten,
read-only gelesenen Production-Katalog geführt — **ohne** Profil anzulegen, **ohne**
Schreibzugriff. Ergebnis: jedes Profil erhält sein korrektes Basispaket; Fachpakete
entstehen aus Profildaten statt aus einer Namensliste; keine fremden Regionalpakete;
kein Mandant ist hartkodiert; Bestandsmandanten bleiben unberührt (145 → 145); Berlin und
Brandenburg werden korrekt angefordert, bleiben aber `requested_unsupplied`.

Automatisierter Beleg: `scripts/paketzuweisung-nachweis-test.js` — **147/147 grün**.

### 9c · SQL der Handerhebung (weiterhin als Gegenprobe brauchbar)

```sql
SELECT key, status, is_base, political_level, geography_id FROM source_packages ORDER BY key;

SELECT p.key, count(pp.retrieval_path_id) AS wege,
       count(*) FILTER (WHERE rp.status='broken')          AS defekt,
       count(*) FILTER (WHERE rp.activation_mode='manual') AS vorbereitet
FROM source_packages p
LEFT JOIN package_paths pp ON pp.package_id = p.id
LEFT JOIN retrieval_paths rp ON rp.id = pp.retrieval_path_id
GROUP BY p.key ORDER BY p.key;
```
