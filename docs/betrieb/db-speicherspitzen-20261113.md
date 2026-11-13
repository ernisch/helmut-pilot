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

## Korrektur

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
| `auth-store-projection-test.js` | 14/14 |

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

## Grenzen und Rueckweg

Die Grenze gilt nur innerhalb dieses Storage-Moduls pro Serverprozess, nicht
instanzuebergreifend und nicht fuer andere direkte Datenbankclients. Grosse
JSON-Dokumente bleiben bestehen. Wartende Anfragen koennen nun ihre bisherige
Frist vor dem Start erreichen; das wird als Fehler gemeldet. Ein Transport,
der Abort dauerhaft ignoriert, haelt seinen Platz bis Abschluss/Prozessende.
Keine Behauptung, dass diese Aenderung allein alle OOM-Spitzen verhindert.

Vorschau-Deployment fuer den eigenen Arbeitsbranch ist in `vercel.json`
abgeschaltet. Rueckweg: den isolierten Aenderungscommit zuruecknehmen und nach
erneuter Freigabe regulaer ausrollen. Kein Daten-/SQL-Rollback erforderlich;
die unabhaengige SQL-Optimierung aus PR1179 bleibt unberuehrt.

Naechster Schritt: diesen isolierten Softwarevorschlag zur Aktivierung pruefen.
Weitere Betriebsbelege: [Briefingreparatur](briefing-versorgung-reparatur-20261112.md).
