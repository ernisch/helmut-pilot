# Manuelle Quellenprüfung in der Entwicklung

## Start

In GitHub unter **Actions → HELMUT manuelle Quellenprüfung → Run workflow** den Entwicklungsbranch und genau einen Adapter auswählen. GitHub verlangt Schreibberechtigung für den manuellen Start. Der Job nimmt den exakten Commit des gewählten Branches. Nach einer Korrektur nach Möglichkeit erneut **Run workflow** wählen, damit GitHub den neuen Commit nimmt. **Re-run jobs** verwendet weiterhin den alten Commit.

```bash
gh workflow run manuelle-quellenpruefung.yml --ref <branch> -f quelle=bundestag-kalender -f mandat=bundestag
node scripts/lokal.js -- node scripts/quellen-entwicklungspruefung.js bundestag-kalender bundestag
```

| Auswahl | Prüft |
| --- | --- |
| `bundestag-kalender` | Eine synthetische ICS-Datei durch den regulären Aufnahmeadapter. Prüft Abrufreihenfolge, simulierte Originalreservierung, Bytehash und unverändertes Publikationsfeld. |
| `bundestag-pdf` | Echte PDF-Textextraktion aus einer synthetischen Datei, Größen- und Formatgrenzen sowie Abbruch. |
| `destatis-rss` | Bestehende Tests für Publikation, zulässige Auszüge, Fassungsbindung und Herkunft. |
| `dip-quellfelder` | Bestehende Tests für amtliche Dokument- und Verfahrensmetadaten und ihre Bindung. |

Bei `bundestag-kalender` kann `mandat=bundestag` zusätzlich die Lage-Projektion eines fiktiven Bundestagsmandats prüfen. `mandat=landtag` prüft mit genau einem fiktiven Landtagsmandat, dass derselbe Bundesbeleg nicht als dessen Termin ausgegeben wird. `ohne` ist der Standard. Eine reale Mandatskennung, eine URL oder ein Datei-Upload sind keine Workflow-Eingaben. Der Kalenderstand bleibt im Speicher des Prüfprozesses.

Jede Ausführung erhält Run-ID, Versuchszähler und Commit. Das Protokoll zeigt Auswahl und Abschlussstatus. Ein Adapter hat höchstens 45 Sekunden. Das gesamte GitHub-Jobfenster beträgt fünf Minuten. GitHub lässt für diese Prüfung einen aktiven Lauf zu. Bei konkurrierenden Starts kann eine weitere Wartestart-Anforderung ersetzt werden. Nach Abschluss lässt sich dieselbe Probe erneut starten. Es gibt keinen automatischen Wiederholungsversuch.

## Warum der manuelle Weg getrennt ist

Am 19.11.2026 sind acht einzelne UTC-Slots von 03:00 bis 04:45 und 2.400 reservierte Sekunden belegt. Der reguläre Scheduler bucht nach Vorprüfung und exklusiver Worker-Lease pro Slot einen Start und 300 Sekunden über den gemeinsamen atomaren Zähler. Diese 2.400 Sekunden sind gebuchte Kapazität. Die Quittungen belegen niedrigere tatsächliche Laufzeiten. Dieselbe Slotkennung verhindert doppelte Zustellung. Nach Buchung bleiben Teilverbrauch und unklarer Ausgang erhalten. [Reguläre Quittungen](https://github.com/ernisch/helmut-pilot/issues/1266#issuecomment-7001012053)

Die 16 Originalreservierungen sind das gemeinsame tägliche Abrufkontingent für echte Originaldateien. Der Worker reserviert vor einem Originalabruf. Mehrteilige Quellen können mehrere Reservierungen benötigen, und spätere Abruf- oder Parserfehler geben verbrauchte Reservierungen nicht pauschal frei. Für den 19.11. sind 16 Reservierungen, drei letzte Vertagungen an der Tagesquote und ein PDF-Lesefehler belegt. Der Summenzähler enthält keine Aufteilung aller 16 Buchungen je Quelle. [Originalgrenze und Erstbeleg](https://github.com/ernisch/helmut-pilot/issues/1266#issuecomment-7001012053)

Lease, atomare Reservierung, Rechteprüfung, Host- und Anbietergrenzen sowie die Kostenwachen schützen echte Verarbeitung. Die Tagesfenster beschränken den Produktionsdurchsatz. Parser, Herkunft, Quotenverhalten als Simulation und Ausgabe lassen sich mit festen Prüfdaten direkt prüfen. Der manuelle Job läuft nach der Abhängigkeitsinstallation mit bereinigter Umgebung in einem Netzwerkraum, der ausschließlich lokales Loopback für simulierte HTTP-Antworten zulässt. Er braucht damit null Produktionsreservierungen, null Originalabrufe und null Modellaufrufe. Der reguläre Cron und seine Geldgrenzen gelten unverändert. Es gibt keinen zusätzlichen Produktionsschreibpfad oder Entwicklungs-Geldtopf.

Schwankende Serverantworten, echte Rechte, aktuelle Originale und bezahlte Verarbeitung erfordern weiterhin den regulären oder einen separat konkret freigegebenen Weg. Ein erfolgreicher Fixture-Lauf ersetzt keinen echten Quellen- oder Mandatsnachweis.

## Betriebsnachweis

Am 19.11.2026 liefen zwei manuelle Kalenderprüfungen auf `24a626ff` im Abstand von 40 Sekunden mit demselben Standhash. Beide verarbeiteten genau eine ICS-Fixture mit einem synthetischen Mandat. Die DIP-Probe im isolierten Loopback bestand 16/16 Gruppen. Der Datenbankvergleich vor und nach den Prüfungen bestätigt dieselben 8 Fenster, 2.400 reservierten Sekunden und 16 Originalreservierungen. Der öffentliche Vercel-Alias war auf dem regulären Deployment bereit. [Erster Kalenderlauf](https://github.com/ernisch/helmut-pilot/actions/runs/44484165129) · [Wiederholung](https://github.com/ernisch/helmut-pilot/actions/runs/44484257343) · [DIP-Prüfung](https://github.com/ernisch/helmut-pilot/actions/runs/44484353378) · [Produktionsbeleg](https://github.com/ernisch/helmut-pilot/issues/1266#issuecomment-7003374675)
