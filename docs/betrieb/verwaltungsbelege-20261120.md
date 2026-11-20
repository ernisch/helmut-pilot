# Prüfbelege der HELMUT Kundenverwaltung

**Stand 20.11.2026.** Geprüfter Livezustand der Verwaltung auf `37686a44` mit [PR #1295](https://github.com/ernisch/helmut-pilot/pull/1295). Die Belege gelten für den jeweils angegebenen Prüfstand und Umfang. Der [Produktvertrag](../produktvertrag-20261115.md) führt die Anforderungen an den ersten zahlenden Kunden.

## Produktiv beobachtet

| Bereich | Beleg | Offener Umfang |
| --- | --- | --- |
| Anmeldung und Übersicht | Die bereits angemeldete Betreibersitzung zeigte am 20.11. Übersicht, Kundenliste und Kundendetail. Partei, Fraktion, Wahlkreis, Schwerpunkte, aktiver Zugang und Mandatsstatus waren beim Pilotmandat sichtbar. Frühere Produktionsbelege bestätigen HTTP 401 ohne Sitzung. [Verwaltungsrollout](../ui/verwaltung-marke-kundenstatus-20261113/README.md) | Bei der Begehung wurde die vorhandene Betreibersitzung genutzt. |
| Einladung und erster Kundenzugang | Beim eigenen bestehenden Demokonto nahm der Mailserver die Einladung am 12.11. um 17:57:10 UTC an. Das Betriebsprotokoll ordnet die Nutzung desselben Einladungslinks um 18:28:09 UTC, die erste Sitzung ab 18:28:11 UTC und das Setzen des Passworts demselben Konto zu. Abgleich am 20.11. rein lesend. [Versandbeleg](https://github.com/ernisch/helmut-pilot/pull/1169) | Separater Posteingangsnachweis und Rücksetzung in Production sind offen. |
| Nutzer löschen | Der Link im Kundendetail öffnete am 20.11. die vorhandene Bestätigung für genau das gewählte Konto. „Abbrechen“ schloss die Bestätigung. Das Kundenmenü „Weitere Werkzeuge“ zeigte Profilansicht und „Stand neu laden“. In den Einstellungen waren Profilbestand sowie Konten, Datenschutz und Diagnose erreichbar. [Umsetzung](https://github.com/ernisch/helmut-pilot/pull/1295) · [Livebeleg](https://github.com/ernisch/helmut-pilot/pull/1296) | Die Liveprüfung endete bei „Abbrechen“. Der Rücklink reagierte in einer Probe nicht, der direkte Aufruf der Verwaltung funktionierte. |
| Kostenanzeige | Am 20.11. um 12:07 UTC stimmten Verwaltung und Betriebsbuch überein. 102 Tagesbuchungen über 0,790428 USD und 0 offene Buchungen. In der späteren Begehung zeigte die Verwaltung 0,863352 USD verbucht und 0,212000 USD reserviert. [Abgleich](https://github.com/ernisch/helmut-pilot/pull/1292) | Der spätere Wert ist eine Bildschirmbeobachtung, der frühere Wert ein Abgleich mit dem Betriebsbuch. |
| Quellen, Betrieb und Briefingstatus | Quellenübersicht, Zeitplan und letzte Abläufe waren angemeldet erreichbar. Der Quellenlauf wurde als laufend angezeigt, 0 von 3 Briefings waren bereit. Das aktive Pilotbriefing wurde als unvollständig angezeigt. | Fachliche Abnahme eines vollständigen Briefings im ersten aktiven Kundenmandat offen. |

## Automatische Prüfungen mit fiktiven Daten

| Suite oder Beleg | Ergebnis und Umfang |
| --- | --- |
| [Einfache Verwaltung](../../scripts/admin-einfach-test.js) | 23/23 Gruppen am 20.11. Kundenanlage, Mandatszuordnung, Pflichtfelder, explizite Aktivierung, Sperren und Freigeben, Fehlerfälle bei Teilabbrüchen und Quellenstatus. |
| [Einladungsablauf](../../scripts/invite-flow-test.js) und [Mailtransport](../../scripts/invite-smtp-transport-test.js) | 39/39 und 66/66 am 20.11. Einladung über lokalen Testmailserver, Einmaligkeit und Ablauf des Links, Passwortvergabe mit Sitzung, erneute Anmeldung, Rücksetzung und Ablehnung des alten Passworts. Der Testmailserver lief lokal. |
| [Mandantentrennung](../../scripts/mandantentrennung-test.js) | 20/20 am 20.11. Berechtigte Leser erhalten nur Daten des eigenen Mandats. Die Verwaltung bleibt auf Administratoren beschränkt, was zusätzlich die Verwaltungsprüfungen abdecken. Die umfassende Datenschutzabnahme steht aus. |
| [Quellenanzeige](../../scripts/admin-source-ui-test.js) und [Betriebsmetadaten](../../scripts/admin-betriebsmetadaten-test.js) | 67/67 und 12/12 am 20.11. Statusanzeige, Zeitplan und Quellenmetadaten. |
| [Löschschutz](../../scripts/admin-nutzer-loeschen-test.js) | 59/59 im lokalen Offline und HTTP Lauf für #1295. Der Direktlink bindet die Bestätigung an die gewählte interne Konto ID. Adminschutz, unbekannte ID und Löschung eines fiktiven Kontos samt Sitzungen, Zugangslinks und Zuweisungen geprüft. In 4 zusätzlichen DOM Varianten war der Link im normalen Kundendetail vorhanden und für Administratorkonten sowie in beiden Vorschauvarianten ausgeblendet. |
| [Desktop und Smartphone](../ui/verwaltung-marke-kundenstatus-20261113/README.md) | 65/65 isolierte Prüfgruppen mit HTTP und Chromium sowie 35/35 Vorschauprüfungen bei 320, 360, 390 und 1440 Pixeln aus #1177. Neuere Pflichtprüfungen für #1295 waren einschließlich Desktop und Smartphone grün. [GitHub Lauf](https://github.com/ernisch/helmut-pilot/actions/runs/44744896967) |
| [Kostenanzeige](https://github.com/ernisch/helmut-pilot/pull/1291) | 26 Kostenstatistikprüfungen, 16 Budgetgruppen vor der Einmalfreigabe, 18 Gruppen zum geschützten Speicherabruf, 74 Routenprüfungen und 4 Darstellungsfälle. Die 23 Verwaltungsgruppen stehen oben bereits in der Übersicht. |

Der separate lokale Browsertest für das Passwortformular und der lokale Chromium Teil der Löschsuite konnten am 20.11. wegen der fehlenden passenden Browserumgebung nicht starten. Sie zählen nicht als neue bestandene Browserprüfungen. Die vorhandenen GitHub Browserbelege und die angemeldete Liveprüfung sind oben mit ihrem jeweiligen Umfang verlinkt.

## Einmaliges Betriebsbudget am 20.11. UTC

[PR #1293](https://github.com/ernisch/helmut-pilot/pull/1293) dokumentiert 17 bestandene Betriebskostenprüfgruppen und 26 Prüfungen zur Tagesstatistik. Der isolierte Vertragslauf prüfte 2 USD für den freigegebenen UTC Tag, 1 USD nach Tageswechsel, die Sendesperre über die Tagesgrenze sowie die Sperren in der Vorschau und bei fehlendem Betriebsbuch. Der Gesamtdeckel betrug 30 USD. Die reguläre Verarbeitung nach dem Rollout verbuchte zusätzliche 4 Analysen für 0,029503 USD und stand um 12:50 UTC bei 0,819931 USD und 0 offenen Buchungen. [Livebeleg](https://github.com/ernisch/helmut-pilot/pull/1294)

## Wiederverwendung und nächste Abnahme

Bei unverändertem Prüfgegenstand diese Belege als Ausgangspunkt verwenden. Bei Änderungen, konkreten Befunden oder vorgeschriebenen Prüfungen nur die betroffenen Abläufe gezielt erneut prüfen. Die vorhandenen Pflichtprüfungen gelten nach dem [Prüfvertrag im Repository](../../AGENTS.md#tests).

Für die Verkaufsabnahme als Nächstes das nächste regulär erzeugte Briefing des aktiven Pilotmandats anhand der bestehenden Ergebnisbelege fachlich abnehmen. Die vollständige Produktivabnahme eines neu angelegten zahlenden Kunden und die abschließende Datenschutzprüfung bleiben offen.
