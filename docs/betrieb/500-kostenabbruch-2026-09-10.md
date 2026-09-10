# 500er Fenster am 10.09.2026: Kostenstopp und sicherer Abschluss

Sprintzustand: teilweise abgeschlossen. Das freigegebene Testfenster ist sicher geschlossen. Die Kostenkorrektur ist mit Freigabe veroeffentlicht und rein lesend Production bestaetigt. Die vollstaendige fachliche 500er Abnahme steht weiterhin aus. Private Einzelbelege bleiben beim Betreiber.

## Historischer, sicher geschlossener Ablauf

Production Basis fuer alle drei Schritte: `53f0c67aad2e81f4a557d8ceb116b87696c909e9`, READY `dpl_2GPmsjF4f9wnjVjHU62qKYDXKuGW`. Ausdrueckliches Betreiber Ja fuer vorhandene 495 Profile, begrenzte Facharbeit und unabhaengig abgesicherten Abschluss. Hoechstens 150 Minuten, Abschlussbeginn spaetestens Minute 120, 4 USD Modellkosten insgesamt je UTC Tag und 1000 manuell veranlasste Modellversuche.

| Schritt | Beleg | Ergebnis |
|---|---|---|
| Reaktivierung | [34447627928](https://github.com/ernisch/helmut-pilot/actions/runs/34447627928), 10:04:32 Tuerkei / 09:04:32 Berlin / 07:04:32 UTC | 495 bestaetigte Aktivierungen, exakt 500 aktiv, keine neuen Profile |
| Eine Pipeline Runde | [34448211489](https://github.com/ernisch/helmut-pilot/actions/runs/34448211489), Prozess `cron-pipeline-20260910070524-l0m1x` | 406 fertiggestellte Auftraege, heutige Briefingpakete von 258 auf 375 gestiegen, heutige Lage Texte unveraendert zwei |
| Sicherer Abschluss | [34448732540](https://github.com/ernisch/helmut-pilot/actions/runs/34448732540), 10:19:43 / 09:19:43 / 07:19:43 | 495 bestaetigt inaktiv, 504 Profile insgesamt, fuenf alte Dummys aktiv, null Fehler |

Die unabhaengige Datenbankaufnahme um 10:22:25 / 09:22:25 / 07:22:25 bestaetigt den Endbestand, 505 Identitaeten sowie null aktive Sperren, Leases und verwaiste laufende Jobs. Profilinhalte ohne Aktivierungsfeld und Aenderungszeit, Identitaeten und Konten stimmen mit den waehrend der Aktivierung erhobenen Fingerabdruecken ueberein. Zusaetzlich prueften die Ausfuehrer ihre eigenen vollstaendigen Vorhergrundlinien. Die unabhaengige Endautomation wurde danach deaktiviert und ihr inaktiver Zustand erneut gelesen. Keine fremde Arbeit wurde gestoppt, kein Lauf wiederholt.

## Historischer Kostenstopp und erhaltene Reserve

Ein Understanding Aufruf um 10:07:55 / 09:07:55 / 07:07:55 endete nach 30082 ms mit `request-error`, unbekannten Token und unbekannten Kosten. Die 30 Sekunden und der bestehende Codepfad sprechen fuer einen Socket Timeout; das historische Protokoll belegt diese spezielle Ursache nicht eindeutig. Der vorhandene Geldriegel reagierte korrekt: `test-usd-ausgang-unklar`, offene Reserve erhalten, weitere Modellarbeit gesperrt.

| Kostenbefund des UTC Tages | USD |
|---|---:|
| Bekannte nominale Schaetzung | 0,109734 |
| Konservativ abgerechnet | 0,219472 |
| Offene Reserve fuer unbekannten Ausgang | 0,212000 |
| Insgesamt konservativ gebunden | 0,431472 |
| Unveraenderte Tagesgrenze | 4,000000 |

Dies ist keine Anbieterrechnung. Es existieren 40 Aufrufbelege und 40 Reservierungen; eine zusaetzliche Protokollzeile ist nachweislich kein Aufruf. Die manuell gestartete Pipeline veranlasste sechs weitere Anbieteraufrufe, fuenf erfolgreich und einen ungeklärt. Sie zaehlten fuer die damalige Betreibergrenze von 1000 manuellen Versuchen, auch wenn der spezielle Textnachlaufzaehler null bleibt.

Ein HTTP 200, 406 fertiggestellte Auftraege und eine erfolgreiche Prozessquittung beweisen weder fehlerfreie Modellverarbeitung noch 406 vollstaendige Briefings. Der gesonderte Textnachlauf wurde nicht gestartet. Die bereits abgeschlossene App Erhebung fuer den 09.09. bleibt historisch: 500 gelesen, sieben Grundansichten mit Lage, 122 unvollstaendig, 371 fehlend, null vollstaendig abgenommen. Die unabhaengige SQL Aufnahme um 10:26:08 / 09:26:08 / 07:26:08 bestaetigt fuer den 10.09. 375 Pakete, zwei Lage Texte, null strukturell vollstaendige und null fachlich abgenommene Pakete; kein junger laufender Prozess. Daten verschiedener Tage werden nicht addiert oder nachtraeglich umetikettiert.

## Betreiberanweisung und Kostenregel 2

Am 10.09. hat der Betreiber die Uebertragung, den PR und dessen automatische Pruefungen ausdruecklich freigegeben, den Abbau kuenstlicher Testhuerden verlangt und danach auch die sichere Loesung der unbekannten Abrechnung beauftragt. Der erste freigegebene Git Push scheiterte am fehlenden lokalen GitHub Login. Der vorhandene GitHub Zugang uebertrug anschliessend den identischen Dateibaum `8a5ee240b23684ed0c751caa77d198e67973e2a2` als Commit `6f5e1c299d4f30feedb1df4ff383f8db5e074fc0` auf `codex/500-kostenabbruch-nachweis-20260910`. Die fruehere fehlende Pushfreigabe ist damit erledigt.

Die neue Kostenregel ist `policyVersion=2`, der vorhandene Kostenbuchschluessel und alle Betraege bleiben erhalten. Ein verlorener Aufruf bekommt den Zustand `ungeklaert` und behaelt seine volle vor HTTP bestaetigte Geldreserve. Der fehlgeschlagene Aufruf bleibt ein Fehler. Neue, andere Arbeit darf nur `abgerechnet + reserviert + ungeklaert + neue volle Reserve <= 4 USD` verwenden. Eine alte v1 Sperre wegen unbekanntem Ausgang wird beim naechsten bestaetigten Reservierungsvorgang mit ihrer Begruendung archiviert und ihre offenen Tickets ohne Erstattung uebernommen. Das ist keine Anbieterabrechnung und keine nachtraegliche Nullbuchung.

Der sichere Kontrollleser verlangt einen konsistenten Kostenbuchstand, Deckung unbekannter Belege durch offene Reserven und ausreichend viele Tickets fuer die Aufrufbelege. Fehlende Gelddeckung, fremde Sperrgruende, unlesbarer Speicher oder ein belegter Verbrauch oberhalb der reservierten Modellgrenzen sperren weiterhin. Verlorene Ergebnisse werden weder automatisch neu gesendet noch als erfolgreiche Facharbeit behandelt. Die bestehenden abgeschlossenen Auftraege bleiben in der Kontrollquittung sichtbar; `unbekannteVollstaendigReserviert` weist die offene Abrechnung ausdruecklich aus.

Entfernt sind die zusaetzliche Grenze von 1000 manuellen Versuchen, die Frist von sechs Stunden und die Wartezeit bis nach dem Morgenlauf. Alte Zaehler und Fristen bleiben als historische Felder erhalten. Kurze technische Laufzeiten der Hostingplattform, Schutz vor gleichzeitiger Arbeit, Mandantentrennung, Datenintegritaet und der Ausschluss externer Zustellungen bleiben verbindlich. Die verwendeten Anbietergrenzen und Tokenobergrenzen werden nicht erhoeht.

Die vorhandene Rechnung reserviert weiterhin 400.000 Eingabe und maximal 3000 Ausgabetokens mit 0,50 / 4,00 USD je Million, hoechstens 0,212 USD je Aufruf. Die [Microsoft Modellgrenzen](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure) bestaetigen am 10.09. 400.000 Kontext und 272.000 Eingabe fuer Mini. Laut [Microsoft Reasoning Dokumentation](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning) begrenzt max_output_tokens auch Reasoning Tokens. Die neu gelesene dynamische Azure Preisseite gab keine numerischen Preise zurueck; keine neue Anbieterrechnung oder tagesaktuelle Tarifverifikation behaupten. Die bereits eingefuehrte konservative Preisbasis bleibt unveraendert.

## Pruefungen und konkrete Wirkung

Die heutigen Production Daten wurden erneut ausschliesslich gelesen: 11:33:49 Tuerkei / 10:33:49 Berlin / 08:33:49 UTC, fuenf Profile aktiv, null aktive Sperren oder Leases, Kosten weiterhin 0,219472 USD plus 0,212 USD offene Reserve. Die neue Regel wurde auf einer Kopie genau dieses Kostenbuchs mit 40 Aufrufbelegen geprueft: vorher 0,431472 USD gebunden, nach einem ausschliesslich lokal simulierten neuen Ticket 0,643472 USD; die alte Reserve bleibt exakt 212000 Mikro USD. Keine Production Kostenbuchung und kein Anbieteraufruf durch diese Pruefung.

Gezielt besteht das Kostenmodul mit 10/10 Gruppen: parallele Reservierungen, alte Sperre, unbekannte Antworten, kein nachtraeglicher Gratisbeleg, mehr als 1000 Versuche, abgelaufene historische Frist, konsistenter Geldstand und echter KI Einstieg mit lokalem Transport. Ein erster Test erwartete 2500 statt der tatsaechlich angeforderten 3000 Ausgabetokens; die Erwartung wurde auf die richtige volle Reserve korrigiert. Der angepasste PostgreSQL Test prueft zusaetzlich fuenf getrennte Prozesse und Neustarts: offene Reserve erhalten, genau ein neues Ticket nach einer belegten anderen Abrechnung, weiterhin unter 4 USD.

Der erste Stand vor dieser neuen Regel bestand lokal 346/348 Suiten; zwei vorhandene Browserpruefungen scheiterten am fehlenden Chromium. Kein zweiter Browserdownload. Die gezielten neuen Pruefungen sind erfolgreich: Controller 24 PASS, Textnachlauf 15/15 Gruppen, Laufzeitleser 53 PASS. Der einmalige kanonische Lauf der neuen Regel ist mit Exit 1 beendet; sein lokales Protokoll ist technisch unvollstaendig und belegt den fehlenden Chromium, jedoch keine verlaessliche Gesamtzahl. Deshalb keine Erfolgszahl aus dem aelteren Lauf uebertragen und keinen lokalen Wiederholungslauf starten. Die unabhaengige CI prueft den fertigen PR Stand vollstaendig. Merge und Production Veroeffentlichung sind inzwischen mit ausdruecklichem „go“ erledigt; der folgende Abschluss ist der aktuelle Beleg. Der Testbestand bleibt geschlossen. Ein spaeterer Revert braucht eigene Freigabe: alter Code versteht `ungeklaert` nicht und verweigert dann vorsorglich weitere Modellarbeit. Keine Rueckmigration oder Loeschung von Kosten.


## Production Abschluss von PR #356

Am 10.09. erteilte der Betreiber mit „go“ die konkrete Freigabe fuer PR #356 und dessen automatische Production Veroeffentlichung. Frischer Vorflug um 12:22:44 Tuerkei / 11:22:44 Berlin / 09:22:44 UTC: exakter gepruefter Kopf `d7801b2d32a6d4b7b4d3857a4ff8e12528e3ecbe`, unveraenderter Hauptbranch, CI erfolgreich, keine konkurrierenden Actions oder aktiven Sperren/Leases. Der Merge `ae80abdea534b1059a4e368367cd58474ee7f5b8` besitzt exakt denselben Dateibaum `948f3e4a96fc803bfebfc345c0e3544cadd66af8` wie PR und CI Kandidat.

[PR CI 34458328813](https://github.com/ernisch/helmut-pilot/actions/runs/34458328813): 348/348 Suiten in 664 Sekunden, Browser 50 PASS, PostgreSQL Kontoschutz und Geldnachweis 15 PASS, Z22 48 PASS, jeweils null Fehler. Fuenf getrennte Prozesse erhielten 18 von 40 Reservierungen, zusammen 3,816 USD; unbekannter Ausgang und fuenf Neustarts erhielten die volle Reserve. Erst eine belegte andere Abrechnung erlaubte exakt ein weiteres Ticket.

Vercel bestaetigte Hauptalias `helmut-pilot.vercel.app`, Deployment `dpl_9MaFAfLQuLHSjGPzr2NtTQ14DpZP`, READY auf dem exakten Merge. Der einmalige ausschliesslich lesende Lauf [34460548811](https://github.com/ernisch/helmut-pilot/actions/runs/34460548811), Job `102817092885`, bestaetigte um 12:25:36 / 11:25:36 / 09:25:36 UTC HTTP 200, exakten Commit, aktive Kostenregel 2, 4 USD, maxManualCalls=null, maxWindowMs=null und unbekanntBleibtReserviert=true. Die gesonderte 500er App Erhebung war ausdruecklich nicht angewaehlt. Keine Modellaufrufe oder Profilwrites durch diesen Leser.

Unabhaengige SQL Nachkontrolle um 12:26:25 / 11:26:25 / 09:26:25 UTC: 504 Profile, fuenf aktiv, 505 Identitaeten, null aktive Sperren oder Leases, 40 Geldtickets und 40 globale Aufrufe. Unveraendert 219472 Mikro USD abgerechnet und 212000 Mikro USD reserviert. Die alte Buchmarkierung test-usd-ausgang-unklar ist noch gespeichert: Sie wird erst bei der naechsten bestaetigten Reservierung archiviert und mit voller Reserve uebernommen. Eine neue Modellarbeit oder tatsaechliche Buchuebernahme wird hier nicht behauptet. Fehlerlogabfrage dieses Deployments von 09:23:24 bis 09:26:03 UTC fand keine error/fatal Eintraege; das ist kein Langzeitnachweis.

Die automatisch durch den Merge ausgeloeste main CI `34460338983` wird weiter beobachtet; kein manueller Wiederholungslauf. Naechster fachlicher Schritt: erneuter aktueller Kosten und Konkurrenzabgleich, danach Fortsetzung des 500er Nachweises im passend freigegebenen Fenster. Die vorhandene Anbieterrechnung bleibt unbekannt, die volle Geldreserve ist die wirksame Kostenkontrolle. Diese Abschlusskorrektur aendert ausschliesslich Projektdokumentation und loest gemaess CLAUDE.md Abschnitt 9 keinen rekursiven Dokumentations PR aus.
