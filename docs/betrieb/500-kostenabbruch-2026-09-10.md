# 500er Fenster am 10.09.2026: Kostenstopp und sicherer Abschluss

Sprintzustand: teilweise abgeschlossen. Das freigegebene Testfenster ist sicher geschlossen. Die vollstaendige fachliche Abnahme und die Veroeffentlichung der vorbereiteten Kontrollkorrektur stehen aus. Private Einzelbelege bleiben beim Betreiber.

## Belegter Ablauf

Production Basis fuer alle drei Schritte: `53f0c67aad2e81f4a557d8ceb116b87696c909e9`, READY `dpl_2GPmsjF4f9wnjVjHU62qKYDXKuGW`. Ausdrueckliches Betreiber Ja fuer vorhandene 495 Profile, begrenzte Facharbeit und unabhaengig abgesicherten Abschluss. Hoechstens 150 Minuten, Abschlussbeginn spaetestens Minute 120, 4 USD Modellkosten insgesamt je UTC Tag und 1000 manuell veranlasste Modellversuche.

| Schritt | Beleg | Ergebnis |
|---|---|---|
| Reaktivierung | [34447627928](https://github.com/ernisch/helmut-pilot/actions/runs/34447627928), 10:04:32 Tuerkei / 09:04:32 Berlin / 07:04:32 UTC | 495 bestaetigte Aktivierungen, exakt 500 aktiv, keine neuen Profile |
| Eine Pipeline Runde | [34448211489](https://github.com/ernisch/helmut-pilot/actions/runs/34448211489), Prozess `cron-pipeline-20260910070524-l0m1x` | 406 fertiggestellte Auftraege, heutige Briefingpakete von 258 auf 375 gestiegen, heutige Lage Texte unveraendert zwei |
| Sicherer Abschluss | [34448732540](https://github.com/ernisch/helmut-pilot/actions/runs/34448732540), 10:19:43 / 09:19:43 / 07:19:43 | 495 bestaetigt inaktiv, 504 Profile insgesamt, fuenf alte Dummys aktiv, null Fehler |

Die unabhaengige Datenbankaufnahme um 10:22:25 / 09:22:25 / 07:22:25 bestaetigt den Endbestand, 505 Identitaeten sowie null aktive Sperren, Leases und verwaiste laufende Jobs. Profilinhalte ohne Aktivierungsfeld und Aenderungszeit, Identitaeten und Konten stimmen mit den waehrend der Aktivierung erhobenen Fingerabdruecken ueberein. Zusaetzlich prueften die Ausfuehrer ihre eigenen vollstaendigen Vorhergrundlinien. Die unabhaengige Endautomation wurde danach deaktiviert und ihr inaktiver Zustand erneut gelesen. Keine fremde Arbeit wurde gestoppt, kein Lauf wiederholt.

## Kosten und verbleibender Blocker

Ein Understanding Aufruf um 10:07:55 / 09:07:55 / 07:07:55 endete nach 30082 ms mit `request-error`, unbekannten Token und unbekannten Kosten. Die 30 Sekunden und der bestehende Codepfad sprechen fuer einen Socket Timeout; das historische Protokoll belegt diese spezielle Ursache nicht eindeutig. Der vorhandene Geldriegel reagierte korrekt: `test-usd-ausgang-unklar`, offene Reserve erhalten, weitere Modellarbeit gesperrt.

| Kostenbefund des UTC Tages | USD |
|---|---:|
| Bekannte nominale Schaetzung | 0,109734 |
| Konservativ abgerechnet | 0,219472 |
| Offene Reserve fuer unbekannten Ausgang | 0,212000 |
| Insgesamt konservativ gebunden | 0,431472 |
| Unveraenderte Tagesgrenze | 4,000000 |

Dies ist keine Anbieterrechnung. Es existieren 40 Aufrufbelege und 40 Reservierungen; eine zusaetzliche Protokollzeile ist nachweislich kein Aufruf. Die manuell gestartete Pipeline veranlasste sechs weitere Anbieteraufrufe, fuenf erfolgreich und einen ungeklärt. Sie zaehlen fuer die Betreibergrenze von 1000 manuellen Versuchen, auch wenn der spezielle Textnachlaufzaehler null bleibt.

Ein HTTP 200, 406 fertiggestellte Auftraege und eine erfolgreiche Prozessquittung beweisen weder fehlerfreie Modellverarbeitung noch 406 vollstaendige Briefings. Der gesonderte Textnachlauf wurde nicht gestartet. Die bereits abgeschlossene App Erhebung fuer den 09.09. bleibt historisch: 500 gelesen, sieben Grundansichten mit Lage, 122 unvollstaendig, 371 fehlend, null vollstaendig abgenommen. Die unabhaengige SQL Aufnahme um 10:26:08 / 09:26:08 / 07:26:08 bestaetigt fuer den 10.09. 375 Pakete, zwei Lage Texte, null strukturell vollstaendige und null fachlich abgenommene Pakete; kein junger laufender Prozess. Daten verschiedener Tage werden nicht addiert oder nachtraeglich umetikettiert.

## Vorbereitete Korrektur

Branch `codex/500-kostenabbruch-nachweis-20260910`, ausgehend vom genannten main. Der 500er Ausfuehrer prueft jetzt vor und nach der Arbeit eingefrorene Kosten, unbekannte Betraege und Luecken zwischen Belegen und Aufrufzaehler. Ein solcher Befund liefert einen Fehler statt einer irrefuehrend gruenen Kontrolle. Bereits unabhaengig bestaetigte fertige Auftraege bleiben im Fehlerergebnis sichtbar, ohne eine Wiederholung auszulösen. Ein echter Socket Timeout bekommt im bestehenden sicheren Fehlerprotokoll den symbolischen Code `ETIMEDOUT`.

Die Korrektur veraendert keine Geldgrenze, keine Kostenbuchung und keine Reserven. Sie fuehrt keine automatische Wiederholung ein. Der sichere Abschluss bleibt ein unabhaengiger Ausfuehrungsweg und wird durch eingefrorene Kosten nicht blockiert. Risiko: Die Vorpruefung verweigert bei widerspruechlichen Belegen bewusst auch sonst harmlose vorbereitende Schritte; dann ist lesende Klaerung erforderlich.

Pruefung ausschliesslich ueber `scripts/lokal.js`: gezielt `github-direkt500-test.js` 23 PASS, `lage-kostenquittung-test.js` 20 PASS. Die neue Timeout Erwartung wurde nach einem ersten fehlgeschlagenen Test an den bestehenden Produktgrund `ai-provider-unavailable` angepasst; der sichere Fehlercode wird getrennt geprueft. Die kanonische Offline Sammlung endete nach 565 Sekunden mit 346/348 erfolgreichen Suiten. admin-nutzer-loeschen-test.js und passwort-setzen-login-fix-test.js scheiterten am fehlenden Chromium Headless Shell 1234. Die vorhandene Playwright Installation wurde nicht umgangen; der einmal angestossene Browserdownload scheiterte an Netzwerkzeitueberschreitungen. Keine zweite identische Sammlung gestartet. Die automatischen Pruefungen des zu diesem Branch gehoerenden PR sind vor Merge massgeblich; der PR wird nach diesem lokalen Pruefstand erstellt. Noch kein Merge oder Deployment.

Der erste Push wurde durch die automatische Freigabepruefung blockiert: Fuer die Uebertragung der vorbereiteten Aenderungen und Anlage des Remote Branches in `ernisch/helmut-pilot` verlangt sie eine ausdrueckliche Betreiberfreigabe. Die danach gelesene GitHub Branch API meldet 404, Branch not found. Kein Ersatzweg, kein zweiter Push, kein PR und keine neue CI wurden gestartet. Die lokale Arbeitskopie ist sauber; der Codecommit lautet `72917da7a65525b0b470c28f9f9973e99475db27`, gefolgt von diesem Dokumentationsnachtrag.

Naechster Schritt: Konkrete Zustimmung fuer Push auf `codex/500-kostenabbruch-nachweis-20260910`, PR nach `main` und automatische Pruefungen einholen. Danach den geprueften PR zur Mergeentscheidung vorlegen. Merge bedeutet Production Deployment und braucht nach CLAUDE.md Abschnitt 5 und 6 eine eigene konkrete Freigabe. Die Kostensperre bleibt auch nach diesem Merge bestehen. Ohne belastbaren Anbieterbeleg weder Reserve freigeben noch weitere Modellarbeit starten. Ein spaeteres Testfenster braucht nach Klaerung eine neue ausdrueckliche Freigabe. Rueckweg fuer den ungeprueften Branch: nicht mergen; ein spaeterer Production Revert waere gesondert freigabepflichtig.
