# Quellenstörungen — automatische Erkennung (Phase 1, Punkt 16)

**Stand:** 2026-07-26 · **Kanonische Stelle** für Zustandsklassen, Schwellenwerte,
Handlungsstufen und Erholungslogik der Quellenüberwachung.

Code: [`lib/helmut/quellenarchitektur/source-failure.js`](../../lib/helmut/quellenarchitektur/source-failure.js) ·
Tests: `scripts/source-failure-test.js` (160 Prüfungen), `scripts/admin-source-ui-test.js` (40)

---

## 1 · Warum es diesen Pfad gibt

Helmut ist ein politischer Stabschef, kein Telemetriewerkzeug. Die einzige Frage,
die dieser Pfad beantwortet, lautet: **Fällt die politische Informationsversorgung
eines Mandats oder eines Themenbereichs unbemerkt aus?**

Der Ausgangsbefund war **A-6**: die Tabelle `source_crawl_telemetry` trug am
2026-07-26 **13 081 echte Laufzeilen** (seit 2026-07-16), hatte im Code aber
**keinen Lesepfad**. Gleichzeitig waren `retrieval_paths.last_success_at`,
`last_error` und `error_streak` zu **0 von 163** befüllt. Die Admin-Ansicht las
also genau die drei Spalten, die leer sind, und meldete „keine problematischen
Abrufwege" — **falsches Grün** über einer Datenbank voller belegter Timeouts,
429er und Leerläufe.

## 2 · Führende Quelle (Architekturentscheidung)

**`source_crawl_telemetry` ist die führende Wahrheit.** Der Zustand je Quelle wird
daraus **abgeleitet**, nicht ein zweites Mal gespeichert.

| Alternative | Warum verworfen |
|---|---|
| Rückschreiben in `retrieval_paths.last_success_at`/`error_streak` | wäre ein Production-Write je Crawl (freigabepflichtig) **und** eine redundante Zweitspeicherung derselben Information |
| Eigene Störungstabelle + Migration | Historie steckt bereits vollständig in der Telemetrie; eine zweite Tabelle wäre ein zweites Health-System |

**Folge:** keine Migration, kein Schemawechsel, kein Production-Write. Die
Erkennung ist eine reine Leseableitung (eine Abfrage je Report).

**Grenze, ehrlich:** die Erkennung reicht nur so weit zurück wie die Telemetrie
(empfohlene Aufbewahrung 90 Tage) und nur so weit, wie der Schreibpfad aktiv ist
(`HELMUT_SOURCE_TELEMETRY`). Ist er aus oder das Fenster leer, meldet der Bericht
`verfuegbar: false` und **behauptet ausdrücklich keine Störung** — statt Grün zu
zeigen.

## 3 · Zustandsklassen

Jede Quelle hat zu jedem Zeitpunkt **genau eine** Klasse. Die Reihenfolge ist die
Prüfreihenfolge (Priorität).

| # | Klasse | Bedeutung | Störung? |
|---|---|---|---|
| 1 | `inaktiv` | pausiert/archiviert/`dev_only` — bewusster Betriebszustand | nein |
| 2 | `manuell` | `activation_mode='manual'`, läuft planmäßig nicht automatisch | nein |
| 3 | `unbekannt` | keine oder zu wenige Laufdaten für eine seriöse Aussage | nein |
| 4 | `gedrosselt` | zentraler Circuit Breaker hat abgebrochen — **kein Quellendefekt** | ja (beobachten) |
| 5 | `nie_erfolgreich` | im Fenster nie erfolgreich — hat **nie geliefert**, ist nicht „ausgefallen" | ja |
| 6 | `blockiert` | Anbieter begrenzt/sperrt (HTTP 429 / 4xx) | ja |
| 7 | `langsam` | Timeout-Serie **oder** wiederholt deutlich zu lange Laufzeit | ja |
| 8 | `parserfehler` | HTTP erfolgreich, Inhalt nicht mehr lesbar | ja |
| 9 | `abruffehler` | sonstiger/unklarer Fehler — bewusst unspezifisch | ja |
| 10 | `instabil` | wiederkehrende Ausfälle mit zwischenzeitlicher Erholung | ja (beobachten) |
| 11 | `erholt` | war gestört, liefert wieder | nein |
| 12 | `leer` | technisch einwandfrei, aber wiederholt ohne Inhalt | ja (beobachten) |
| 13 | `veraltet` | letzte Lieferung älter als der erwartete Rhythmus | ja (beobachten) |
| 14 | `ok` | liefert planmäßig | nein |

`langsam` trägt zwei Ursachen und wird **unterschiedlich behandelt**:
`ursache='laufzeit'` (liefert weiter, nur träge → beobachten) vs.
`ursache='timeout'` (liefert gar nichts → zeitnah/akut). Diese Unterscheidung
entstand aus der Production-Gegenprobe, siehe §8.

## 4 · Handlungsstufen

Bewusst nur vier:

| Stufe | Bedeutung |
|---|---|
| `keine` | Kein Handeln erforderlich |
| `beobachten` | Auffällig, aber die Versorgung trägt |
| `zeitnah_pruefen` | Echte Störung ohne akute Versorgungslücke |
| `akut` | Versorgung ungedeckt oder Pflichtquelle betroffen |

**Hochstufen** nur mit Grund: Paket ohne funktionierenden Abrufweg → `akut`;
Pflichtquelle (`is_critical`) mit echter Störung → `akut`.
**Herunterstufen**, wenn eine Alternative desselben Pakets die Versorgung trägt —
die Störung bleibt sichtbar, ist aber kein Versorgungsausfall.
Ein **einzelner** Fehlversuch ist nie mehr als `beobachten`, auch bei einer
Pflichtquelle.

## 5 · Schwellenwerte

Zentral in `STANDARD_SCHWELLEN`, kalibriert an den am 2026-07-26 gemessenen
Production-Zahlen (13 081 Zeilen / 10 Tage / 105 Läufe ≈ 10,5 Läufe je Tag;
Laufzeit p50 552 ms, p95 2 331 ms, p99 7 338 ms, max 28 276 ms).

| Schlüssel | Default | Wirkung | Env-Override |
|---|---|---|---|
| `fensterTage` | 14 | Bewertungsfenster | `HELMUT_STOERUNG_FENSTER_TAGE` |
| `minLaeufe` | 3 | darunter ehrlich `unbekannt` | — |
| `fehlerAbLaeufen` | 2 | Fehlversuche in Folge bis „akute Störung" | `HELMUT_STOERUNG_FEHLER_AB` |
| `leerAbLaeufen` | 3 | Leerläufe in Folge bis `leer` | `HELMUT_STOERUNG_LEER_AB` |
| `instabilAbEpisoden` | 2 | getrennte Ausfälle bis `instabil` | `HELMUT_STOERUNG_INSTABIL_AB` |
| `veraltetTage` | 14 | Standard-Lieferpause, wenn kein Rhythmus bekannt | `HELMUT_STOERUNG_VERALTET_TAGE` |
| `langsamMs` | 8 000 | absoluter Laufzeit-Grenzwert (über p99) | `HELMUT_STOERUNG_LANGSAM_MS` |
| `langsamFaktor` / `langsamRelMinMs` | 3 / 3 000 | Verschlechterung gegen den **eigenen** Median, mit Bodenschwelle | — |
| `gedrosseltAbLaeufen` / `gedrosseltAnteil` | 3 / 0,5 | ab wann Drosselung den Zustand bestimmt | — |

**Erwarteter Rhythmus.** In Production ist `expected_frequency` bei **allen 163**
Abrufwegen `NULL`. Die Erwartung wird deshalb in dieser Reihenfolge bestimmt:

1. hinterlegter Rhythmus (`daily` → 3 Tage, `weekly` → 14, `monthly` → 45 …),
2. sonst **beobachteter** Median-Lieferabstand × 3, begrenzt auf 3…60 Tage
   (ab 4 Lieferungen im Fenster),
3. sonst der Standardwert von 14 Tagen.

Deterministisch, erklärbar, testbar — kein Anomalie-Lernverfahren.

## 6 · Erholungsregel

Eine Quelle gilt als **erholt**, wenn:

1. aktuell keine Fehlerserie läuft **und**
2. es im Fenster mindestens eine Fehlerepisode gab **und**
3. nach dem letzten Fehler mindestens ein technisch erfolgreicher Lauf liegt **und**
4. nach dem letzten Fehler mindestens **eine echte Lieferung mit Inhalt** erfolgte.

Punkt 4 ist der Kern: eine rein technische 200-Antwort ohne verwertbaren Inhalt
ist **keine** vollständige Erholung. Solche Fälle fallen weiter zu `leer` bzw.
`veraltet` durch.

Bei **wiederkehrenden** Ausfällen (≥ 2 getrennte Episoden) bleibt die Quelle
`instabil` — Erholung überschreibt die Instabilität nicht.

## 7 · Fehlalarmvermeidung

Die fünf Regeln, ohne die dieser Bericht dauerhaft rot wäre:

1. **Übersprungene Läufe sind keine Versuche.** `skipped-shared`/`skipped-cooldown`
   (in Production 1 736 von 13 081 Zeilen) haben die Quelle nie erreicht. Sie
   begründen keine Fehlerserie und unterbrechen auch keine.
2. **Zentrale Drosselung ist kein Quellendefekt.** `circuit-open` ist mit **4 044
   Zeilen** der häufigste „Fehler" in Production. Es ist **ein** Aggregator-Ereignis,
   nicht *N* Quellenfehler — eigene Klasse `gedrosselt`, Stufe `beobachten`,
   gehört fachlich zu **OP-15**.
3. **Ein Fehler ist nie allein „0 Dokumente".** Leer und veraltet brauchen
   **zusätzlich** eine überschrittene Lieferpause. Eine wöchentlich aktualisierte
   Quelle erzeugt bei 5 Crawl-Vollrunden je Tag zwangsläufig dutzende Leerläufe —
   eine reine Zählschwelle hätte genau die seltenen Quellen dauerhaft als kaputt
   gemeldet.
4. **Ein einzelner Ausreißer ist keine Störung.** Ein einzelner Fehlversuch nach
   gesunder Historie wird benannt, aber nie über `beobachten` gestuft, und zählt
   für das Paket weiterhin als tragend.
5. **Zu wenig Daten heißt `unbekannt`, nicht „kaputt".** Unter 3 echten Versuchen
   und bei unklarer Ursache wird bewusst nichts behauptet (`abruffehler` statt
   erfundener Präzision).

## 8 · Politische Versorgung: Paket- und Mandatswirkung

Nutzt **ausschließlich** bestehende Beziehungen (`package_paths`,
`source_packages`, Profil-Resolver). Keine neue Abhängigkeitsarchitektur.

**Paketlage** je Paket: `versorgt` · `teilweise_geschwaecht` ·
`ohne_funktionierenden_weg` · `leer` · `unbestimmt` (nur inaktive/unbekannte Wege
— dann wird **keine** Störung behauptet).

**Wirkung** je Quelle: `kein_paket` · `einzelne_quelle_gestoert_alternativen_vorhanden`
· `paket_teilweise_geschwaecht` · `paket_ohne_funktionierenden_weg` ·
`nicht_bestimmbar`.

**Mandatswirkung** nur, wenn Mandatsprofile übergeben werden; dann über den
bestehenden `resolveProfilePackages`. Ohne Profile meldet der Bericht ausdrücklich
`bestimmbar: false` **mit Begründung** und — falls ein Pflicht-Basispaket betroffen
ist — den Strukturhinweis „potenziell jedes Mandat der betroffenen Ebene".
Es wird nie geraten.

## 9 · Meldung und Deduplizierung

Jeder Befund trägt eine **Signatur** aus Klasse, Ursache, Stufe und betroffenen
Paketen (reihenfolgeunabhängig). Bleibt sie gleich, ist das Problem unverändert
und wird **nicht erneut gemeldet**. `diffAlarme(vorher, jetzt)` liefert nur echte
Zustandsänderungen: `neu` · `verschaerft` · `entschaerft` · `ursache_geaendert` ·
`ausgeweitet` · `erholt` · `erneut`.

Die Meldung erscheint im bestehenden Admin-Bereich **„Quellen & Watchdog"** — es
wurde bewusst **keine** externe Benachrichtigungsplattform gebaut. Der
Diff-Mechanismus ist so gebaut, dass ein späterer Kanal (Webhook/Mail) ihn ohne
Umbau nutzen kann; das ist ausdrücklich **nicht** Teil dieses Sprints.

## 10 · Production-Nachweis (read-only, 2026-07-26)

Ausschließlich `select`-Abfragen. Keine Mutation, kein Cron, kein Flag.

**Eingang:** 13 081 Telemetriezeilen · 163 Abrufwege · 9 Pakete · 165 Zuordnungen.

**Real vorkommende Fehlerklassen:** `circuit-open` 4 044 · `timeout` 215 ·
`http-429` 47 · `http-5xx` 36 · `http-4xx` 1. **Nicht** vorkommend: `parse`,
`dns`, `connection`, `tls`.

**Ergebnis der Klassifikation über 205 Quellen** (163 Katalogwege + 42
Laufzeitquellen aus Profilen):

| Klasse | Anzahl | | Stufe | Anzahl |
|---|---:|---|---|---:|
| `erholt` | 110 | | `keine` | 150 |
| `unbekannt` | 23 | | `beobachten` | 48 |
| `ok` | 22 | | `zeitnah_pruefen` | 6 |
| `manuell` | 18 | | `akut` | 1 |
| `gedrosselt` | 13 | | | |
| `instabil` | 12 | | | |
| `langsam` | 6 | | | |
| `leer` | 1 | | | |

Belege im Einzelnen:

- **Erholung ist der Normalfall, nicht die Ausnahme:** 154 Quellen hatten
  mindestens einen Fehler, **141 haben sich selbst erholt**. Ein System, das jeden
  Fehler alarmiert, hätte 154 Alarme erzeugt — davon wären 141 zum Zeitpunkt der
  Meldung bereits erledigt gewesen. Genau das ist der Grund für die Erholungsregel.
- **`manuell` 18** deckt sich exakt mit den 18 `activation_mode='manual'`-Wegen
  in der Datenbank.
- **`unbekannt` 23** sind die 23 Katalogwege ohne jede Telemetrie — sie wurden nie
  abgerufen und werden ehrlich als „keine Aussage" geführt, nicht als defekt.
- **`berlin-basis` (10 Wege) und `brandenburg-basis` (9 Wege)** landen auf
  `unbestimmt`, weil alle Wege gesperrt sind. Es wird **keine** Störung behauptet —
  Punkt 14 bleibt unberührt.
- **Der eine `akut`-Fall** ist ein Personenpaket mit genau einem Abrufweg,
  21 getrennten Ausfällen und ohne Alternative → `paket_ohne_funktionierenden_weg`.
- **Deduplizierung belegt:** derselbe Bericht zweimal gegen dieselben
  Production-Daten ergibt **0 neue Meldungen**.

**Nur durch Tests belegt (in Production nicht aufgetreten):** `parserfehler`,
`nie_erfolgreich`, `veraltet`, `blockiert` als laufende Serie, HTTP-4xx-Serie,
Rückfall nach Erholung, Mandatswirkung mit übergebenen Profilen.
Diese Fälle sind in `scripts/source-failure-test.js` vollständig abgedeckt; ein
echter Production-Beleg entsteht erst beim nächsten realen Vorfall.

## 11 · Bekannte Grenzen

1. **Kein Production-Beleg für alle Klassen** — siehe §10. Künstliche Fehler in
   Production zu erzeugen ist ausdrücklich verboten.
2. **Doppelte Cron-Läufe verzerren die Zählung** (Befund A-7/OP-15): jeder Lauf
   erscheint doppelt, die Wiederholung mit `circuit-open` auf fast allen Wegen.
   Die `gedrosselt`-Klasse fängt das ab, beseitigt die Ursache aber nicht.
3. **`expected_frequency` ist überall NULL.** Der Rhythmus wird beobachtet
   abgeleitet. Wird das Feld künftig gepflegt, gewinnt es automatisch.
4. **Mandatswirkung nur mit Profilen.** Ohne sie bleibt die Aussage ehrlich offen.
5. **Kein Rückschreiben in `retrieval_paths`.** `last_success_at`/`error_streak`
   bleiben leer; die Admin-Sicht „Problematische Abrufwege" zeigt weiterhin den
   **konfigurierten** Status. Beide Sichten stehen nebeneinander und sind als
   „konfiguriert" bzw. „beobachtet" beschriftet.
6. **Keine externe Benachrichtigung.** Bewusst nicht gebaut.

## 12 · Sichere spätere Aktivierung

Dieser Pfad ist **rein lesend** und braucht keine Freigabe. Was später separat
freigegeben werden müsste:

1. **Externer Meldekanal** (Webhook/Mail) auf Basis von `diffAlarme` — braucht
   `HELMUT_MONITORING_WEBHOOK_URL` (OP-07) und eine Zustandsablage für den
   Vorher-Stand.
2. **Rückschreiben nach `retrieval_paths`**, falls der konfigurierte Status je aus
   dem beobachteten Verhalten gepflegt werden soll — das wäre ein
   Production-Write je Crawl und ausdrücklich freigabepflichtig.
3. **Schwellen-Nachjustierung** über die sechs Env-Variablen aus §5 — reversibel,
   ohne Deployment.
