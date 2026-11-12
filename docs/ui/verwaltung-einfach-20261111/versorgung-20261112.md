# Quellen & Versorgung: Einordnung und Nachweise

## Bedienung

Die Übersicht zeigt einen kompakten Versorgungsstand direkt vor dem Kundenbestand.
„Stand prüfen“ öffnet Einstellungen → Quellen & Versorgung. Dort liegen der
vorhandene Quellenstart, der letzte Lauf, die Automatik und die Kundenbriefings.
Es bleiben drei Hauptbereiche. Seltene Werkzeuge stehen unter Details.

Der Quellenstart verwendet `createQuellenlauf` aus der Originalverwaltung:
`POST /api/admin/quellenlauf`, vorhandene Anmeldung/CSRF, Auftragsbindung,
Kontingente und Laufstatus. Die neue UI implementiert keinen zweiten Motor.
Ein offener Auftrag bleibt beim Reload über seine Kennung lesbar; es gibt
keinen automatischen Neustart. Auch eine bestätigte HTTP401/403-Ablehnung des
Startversuchs entfernt die Kennung des sicher abgewiesenen Auftrags.
Eine unklare Antwort erhält sie.

Ein Abschluss lädt den Kundenstand neu. Scheitert diese Folgeabfrage, bleibt
ein erklärter offener Stand mit „Stand neu laden“; weitere Starts bleiben bis
zur Lesekontrolle gesperrt. Ein erfolgreicher Quellenlauf erzeugt keinen
Briefing-Erfolgsstatus. Der nächste automatische Prüftermin wird ausschließlich
aus dem vom Server gelieferten Zeitplan berechnet; ein geplanter Prüftermin
garantiert keinen zugelassenen Arbeitslauf. Nicht unterstützte Zeitpläne
bleiben ausdrücklich unbestätigt. Alte laufende Quittungen ohne Abschluss
werden nach Ablauf der maximalen Laufzeit als „Abschluss offen“ angezeigt.

## Bestand bleibt erreichbar

| Bisherige Aufgabe | Platz im Kandidaten |
| --- | --- |
| Übersicht und Aufmerksamkeit | Übersicht; Kundenstatus mit direktem Kundenzugang |
| Kunde, Konto, Mandat und Einladung | Kunden; ein Formular, Kundenseite und Einladungsbefund |
| Tagesbriefing und Bereitstellung | Kundenseite; Briefings heute; Versorgungsübersicht |
| Quellen und manueller Quellenlauf | Einstellungen → Quellen & Versorgung |
| Ausgaben | Einstellungen → Kosten |
| Laufhistorie | Einstellungen → Letzte Abläufe |
| Gesamter Profilbestand und Filter | Einstellungen → Profilbestand; bestehende Profilverwaltung |
| Vollständiger Quellenbericht | Quellen & Versorgung → Quellenbestand und weitere Werkzeuge |
| Zuweisungen, Kontosonderfälle, Datenschutz, Diagnose | Einstellungen → Erweiterte Werkzeuge; bisherige Werkzeuge |

Originalverwaltung `/verwaltung/` und erweiterter Einstieg `/?admin-tools=1`
bleiben erhalten. Kein Bestandsbereich und keine Daten werden gelöscht.

Logo und Schriften stammen bytegleich aus den vorhandenen Helmut-Assets:
`assets/ui/logo/helmut-zeichen.svg`, Hanken Grotesk und Spectral. Die ruhige dunkle
Darstellung verwendet die Farben der App. Die Kandidatenassets werden mit
derselben Adminprüfung und passendem MIME-Typ ausgeliefert; der Offlineexport
bettet diese Dateien ein und benötigt keine fremden Fonts oder Netzaufrufe.

## Rein lesender Livebefund am 12.11.

Native Supabase-Leseabfragen am12.11.,08:52:35UTC: **ein aktives Profil**.
Für den Berliner Tag12.11. liegt ein Mandatsbriefing mit Erzeugung08:26:29.715UTC
vor. Seine gespeicherte Prüfung meldet `bestanden=false`,
`strukturellVollstaendig=false` und `quellenversorgung-unvollstaendig`.
Die Morgenlage08:26:31.371UTC meldet `erfolg`, mit einem weiterhin relevanten
Eintrag und keinem neuen Eintrag. Das ist kein vollständig bestätigtes Tagespaket.

Leseaufnahme08:54:11UTC: letzte Quellenquittung seit08:09:27.461UTC
`running`, kein Abschluss. Der vorherige Lauf03:00:12–03:04:29UTC endete
`failed`, Grund `planung-zeitbudget`,156 verarbeitet und6 fehlgeschlagen.
Heutige Aufträge:156 erledigt,7 fehlgeschlagen,1 läuft,164 warten.
Diese Momentaufnahme beweist keinen späteren Abschluss und keine echte
Kundensitzung. In diesem Auftrag wurde kein Productionlauf gestartet,
kein Profil verändert und keine Nachricht versendet.

Die inzwischen gemergten Briefingreparaturen auf main `41ba0690` wurden
konfliktfrei in den Entwurfsbranch übernommen. Der separate Lage-PR1160 und
seine offenen Betriebsarbeiten wurden nicht geändert. Es gibt keine neue
Freigabe zum Merge von PR1155 oder zur Auslösung eines echten Quellenlaufs.

## Prüfung und Grenzen

57 Gruppen im isolierten echten lokalen Backend einschließlich Browser:
Kundenanlage, Passwort-/Profilnachtrag, Assetzugriff, echter abgewiesener
Quellenstart bei ausgeschaltetem Arbeitsfenster sowie synthetische gültige
Laufantworten, Doppelklick, Status, Antwortverlust, Reload ohne weiteren POST,
fehlende Folgeabfrage und Sitzungsverlust bestanden. Der positive neue
UI-Lauf verwendet synthetische Antworten; keine echte Quellenarbeit.
Die unveränderte Serverroute und Originalverwaltung bestanden zusätzlich
17/17 Quellenstartgruppen mit lokaler Queue-/Storage-Injektion und Browser.
30/30 Gruppen für den netzlosen Offlineexport bestanden, darunter
Logo/Schrift, simulierter Quellenlauf und vier Breiten bis320Pixel.

Prüfkorrekturen: Der MIME-Test vergleicht den SVG-Typ als Zeichenfolge;
ein unmaskiertes Plus war ein Testfehler. Nach dem Mobilfall wählt die
Sitzungsprüfung einen sichtbaren Neuladenknopf. Die synthetische negative
Folgeabfrage wartet auf den tatsächlichen Eingang ihres POSTs, bevor der
passende gehaltene Auftrag abgeschlossen wird. Diese Vorläufe waren keine
bestandenen Nachweise; die endgültigen Prüfbelege stehen in den JSON-Dateien.

Nächste Liveabnahme bleibt das vollständige aktuelle Kundenbriefing samt
Appansicht und tatsächlichem Einladungs-Empfang. Die Verwaltung zeigt den
offenen Zustand; dieser UI-Auftrag repariert keinen Quellenmotor und setzt
keine Kontingente zurück. PR1155 bleibt Draft ohne Merge.
