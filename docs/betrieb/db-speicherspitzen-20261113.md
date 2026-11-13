# Datenbank-Speicherspitzen, 13.11.2026

Status: Softwarekorrektur lokal geprueft, **nicht live**. Kein neuer Quellenlauf,
keine Migration, kein Merge, kein Deployment, keine bezahlten Modellaufrufe.

## Ursache und Umfang

Der vom Betreiber bereitgestellte Supabase-Supportbefund bestaetigt fuer die vier
Neustarts vom 12.11. einen hostweiten Speichermangel mit `panic_on_oom`.
Mehrere Postgres-Sitzungen verbrauchten zusammen zu viel RAM und Swap.
Gleichzeitige vollstaendige `helmut_store`-Lesezugriffe sind als Lastmuster belegt;
eine eindeutige Zuordnung der einzelnen Prozesse zu SQL-Abfragen fehlt.
Ein einzelner Abruf ist damit nicht als alleinige Ursache bewiesen.

Der Quellenworker arbeitet im begrenzten Arbeitsfenster bereits einzeln.
Im Storage-Transport gab es trotzdem keine gemeinsame Parallelitaetsgrenze;
gleichzeitige kalte `readStore`-Aufrufe luden denselben Blob mehrfach.
Die bisherigen festen Retry-Abstaende beguenstigten gemeinsame Wiederanlaeufe.

Die anschliessende Pruefung der aktiven Verwaltungs-, Worker-, Cron-, Storage-
und SQL-Pfade fand einen wesentlich groesseren Wiederholungsfaktor:
`buildAdminCostsPerUser` las fuer JEDES Profil dieselbe Monats-Nutzungshistorie
erneut. Auch inaktive Profile wurden durchlaufen. Beim bekannten Bestand sind
502 Monatsabfragen plus zwei Teilstatistikleser je Kostenabruf moeglich.
Das ist aus dem Code abgeleitet, kein ausgefuehrter 502er Lauf.
Die aktuelle Verwaltung startete ausserdem sechs (Original) bzw. fuenf
(einfach) unterschiedliche API-Aufrufe gleichzeitig. Die Prozessbremse allein
begrenzt solche Aufrufe ueber mehrere Vercel-Instanzen nicht.

Die heutigen regulaeren Cronzeiten sind bereits getrennt; das Quellenfenster
haelt `worker-drain` und arbeitet mit einem Worker/einem Auftrag pro Stapel.
Eine pauschale weitere Worker-Absenkung ist deshalb nicht die Hauptkorrektur.

## Korrektur

- Admin-Kosten verwenden genau einen anfrageweiten, unverkuerzten
  `llmUsage`-Lesestand. Monatswerte nutzen weiterhin `getLlmCostSince` mit
  unveraenderten Filtern, OR-Zuordnung von Nutzer/Profil und Rundung. Tages- und
  Periodenstatistiken verwenden nur das benoetigte Feld und teilen innerhalb
  einer Uebersicht denselben Lesestand. Kein Cache fuer Sitzungen/Authentisierung.
- Der bestehende Verwaltungsleser begrenzt unterschiedliche API-Leseaufrufe
  auf zwei offene Antworten je Reader. Auch die bisher separate Quellenhistorie
  der einfachen Verwaltung verwendet ihn. Deduplizierung, Zugriffsschutz,
  Deadline, `clear` und `dispose` bleiben erhalten; kein neuer Schreibweg.
- Laufende `readStore`-Abrufe werden pro Speicherschluessel und lokaler
  Schreibversion zusammengefasst. Jeder Leser erhaelt eine eigene tiefe Kopie
  samt unveraenderlicher CAS-Lesemarke. `fresh:true` bleibt ein eigener Abruf;
  Cache=0 verwendet nach Abschluss keinen zwischengespeicherten Lesestand.
- Der gemeinsame Supabase-Transport in `storage.js` startet hoechstens zwei
  HTTP-Anfragen je Prozess gleichzeitig, FIFO bis einschliesslich Antwortinhalt.
  Wartezeit verbraucht die bestehende Deadline. Abgelaufene Wartende werden
  entfernt; ein bereits laufender Fetch gibt seinen Platz erst beim wirklichen
  Abschluss frei, auch wenn sein Aufrufer schon einen Timeout erhalten hat.
- Exponentielle Retries erhalten Zufallsstreuung: bei den Standardwerten
  250–499 ms, dann 500–999 ms. Versuchszahl und Replay-Sperre bleiben erhalten.

Headers, Mandantenfilter, Berechtigungen, CAS-Bedingungen, Dateninhalte und
Kostenregeln werden nicht veraendert. Keine kuerzere Datenaufbewahrung.

## Tatsaechliche lokale Nachweise

Alle Laeufe ueber `node scripts/lokal.js -- node scripts/<Datei>`;
synthetische Antworten bzw. ein lokaler HTTP-Server, kein Production-Zugriff.

| Vorhandene Pruefung | Ergebnis |
| --- | --- |
| `store-read-integrity-test.js` | 27 PASS, 0 FAIL |
| `supabase-request-limit-test.js` | 31 PASS, 0 FAIL |
| `blob-retry-test.js` | 20/20 |
| `supabase-response-timeout-test.js` | 10 PASS, 0 FAIL |
| `auth-store-projection-test.js` | 18/18 |
| `verwaltung-isoliert-test.js --contracts-only` | 19/19 |
| `admin-neue-routen-test.js` | 74/74 |

Insgesamt 199 gezaehlte Pruefungen; die unveraenderten vier Storage-/Timeout-
Nachweise aus der ersten Korrektur werden weiterverwendet. Die Servertests
verwenden das vorhandene `node_modules` ueber
`NODE_PATH=/workspace/helmut-pilot/node_modules`, keine neue Installation.

Der Monatskostenfehler wurde vor der Korrektur mit drei synthetischen Profilen
reproduziert: fuenf Historienabfragen. Nachher genau eine bei identischen
Monatswerten, einschliesslich inaktiver Profile, unterschiedlicher Nutzer-/
Profilkennungen, Skip-/Diagnoseeintraegen und Rundungsresten. Fehler liefern
keinen erfundenen erfolgreichen Nullkostenbericht. Die neue Verwaltungsbremse
senkt im lokalen Gegenbeispiel sechs gleichzeitige API-Antworten auf zwei.

Die Gegenprobe vor der Korrektur zeigte sechs statt eines Blob-Abrufs und sechs
statt zweier gleichzeitiger HTTP-Anfragen. Nachher: ein Abruf fuer sechs Leser,
maximal zwei offene Antworten. Das sind lokale Zaehler, keine gemessene
RAM-Ersparnis und kein Production-Stabilitaetsnachweis.

Abgedeckt sind getrennte Kopien/Schluessel, Cache=0, frisches Lesen, geteilte
Fehler/Retry-Ketten, Schreibversionen, CAS-Konflikte, keine Wiederholung unklarer
Writes, FIFO, abgelaufene Wartende, ignoriertes Abort sowie echte Header-/Body-
Timeouts. Der lokale HTTP-Test scheiterte zuerst an Sandbox-`listen EPERM`;
derselbe Test bestand mit erlaubtem Loopback-Zugriff. Erstfehler bleibt benannt.
Syntaxpruefung und `git diff --check` bestanden.

Keine vollstaendige CI, Mock100/Mock500 oder Lastpruefung ausgefuehrt.
Kein bestandener GitHub-CI-Lauf behauptet; vor einem Merge gelten weiter die
Pflichtchecks und die gesonderte Betreiberfreigabe.

## Rein lesende Betriebsbeobachtung

Eine auf zwei Sekunden begrenzte Readonly-Katalogabfrage am 13.11., 13:47 UTC
ergab rund 638 MB Datenbankgroesse. Die gespeicherten JSON-Werte von `main`
belegen 1.354.698 Bytes, von `main-auth` 907.242 Bytes (`pg_column_size`).
Das sind gespeicherte Groessen, weder unkomprimierte HTTP-Antworten noch RAM.
Die groessten beiden `backup_*`-Tabellen belegen zusammen rund 232 MiB;
ihre Statistik ist kein Beweis, dass sie tatsaechlich leer oder entbehrlich sind.
Keine Daten wurden dafuer vollstaendig geladen, geloescht oder umgeschrieben.

Eine zweite begrenzte Readonly-Statistikabfrage zeigt fuer die haeufigste
`helmut_store`-JSON-Abfrageform 296 Aufrufe und zusammen rund 31,8 Sekunden
Ausfuehrungszeit seit dem Statistikbestand. Diese kumulativen Werte sind kein
RAM-Messwert und lassen keinen einzelnen OOM-Verursacher ableiten.
Alte `helmut_job_metrics`-Zaehler enthalten weiterhin die historische schwere
Fassung; kein Reset und kein neuer Lauf dieser Fassung. PR1179 bleibt separat.

## Grenzen und Rueckweg

Die Grenzen gelten je Storage-Modul/Serverprozess bzw. Verwaltungsreader, nicht
global ueber alle Nutzer/Instanzen und andere Datenbankclients. Grosse
JSON-Dokumente bleiben bestehen. Wartende Anfragen koennen nun ihre bisherige
Frist vor dem Start erreichen; das wird als Fehler gemeldet. Ein Transport,
der Abort dauerhaft ignoriert, haelt seinen Platz bis Abschluss/Prozessende.
Keine Behauptung, dass diese Aenderung allein alle OOM-Spitzen verhindert.

Weitere Auditbefunde, in diesem Schritt unveraendert: Quellenstatus-Polling kann
sich bei langsamen Antworten ueberlappen; erweiterte Recovery-Werkzeuge laden
grosse Bestaende; vorhandene Artikelarchivstaende werden zweimal voll gelesen.
Diese Befunde sind keine nachgewiesenen einzelnen Neustartursachen. Manuelle
Quellenstarts koennen trotz regulaer getrennter Cronzeiten mit anderen Phasen
ueberlappen. Keine unbegrenzte Kapazitaets- oder Wachstumszusage fuer Micro.

Vorschau-Deployment fuer den eigenen Arbeitsbranch ist in `vercel.json`
abgeschaltet. Rueckweg: die isolierten Korrekturcommits zuruecknehmen und nach
erneuter Freigabe regulaer ausrollen. Kein Daten-/SQL-Rollback erforderlich;
die unabhaengige SQL-Optimierung aus PR1179 bleibt unberuehrt.

Naechster Schritt: diesen isolierten Softwarevorschlag zur Aktivierung pruefen.
Weitere Betriebsbelege: [Briefingreparatur](briefing-versorgung-reparatur-20261112.md).
