# DIP, EUR-Lex und Bundespuls

Geprüft am06.11.2026 anhand des tatsächlichen Katalogs, gespeicherter Dokumente,
Anbieterdokumentation und öffentlicher Feedantworten. Auftrag: die drei vom
Betreiber genannten Angebote prüfen und fehlende Zugänge ergänzen.

| Angebot | Bestand vor der Ergänzung | Enger Zugang |
| --- | --- | --- |
| Bundestag DIP | `rp-dip`, healthy/always_on;287 gespeicherte Dokumente, jüngstes Publikationsdatum04.11., zuletzt gespeichert05.11.2026 | Vorhandene API unverändert; kein Duplikat |
| EUR-Lex | Kein Eintrag | [Amtsblatt L RSS](https://eur-lex.europa.eu/DE/display-feed.rss?rssId=222), amtliche EU-Rechtsakte im bestehenden EU-Fachpaket |
| Bundespuls | Kein Eintrag | [Vorgangs-RSS](https://bundespuls.de/feed/vorgang), privater DIP-Aggregator im bestehenden Bundesbasispaket |

Beide neuen Wege sind vorbereitet und inaktiv (`paused/manual`). Sie zählen
nicht als laufende Versorgung. Die Prüfung löst keinen regulären Quellenlauf,
Modellaufruf oder kostenpflichtigen Dienst aus. Für DIP liegt in der abgefragten
Quellentelemetrie kein separater aktueller Abrufbeleg vor; die vorhandenen
Dokumente belegen seine Nutzung.

## Inhalt, Datum und Nutzungsbedingungen

EUR-Lex antwortete ohne Anmeldung mitHTTP200 und100 RSS-Einträgen; Bundespuls
mitHTTP200 und50. Der bestehende Parser las je fünf Stichproben erfolgreich.
Je drei unveränderte RSS-Items sind als geprüfte Testfixtures hinterlegt.

EUR-Lex liefert über diesen Weg vorwiegend Titel und CELEX-Originaladressen.
Das Feeddatum ist weder Beschlussdatum noch Inkrafttreten. Laut
[amtlichem Rechtshinweis](https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=en)
sind Metadaten CC0; dieser Weg erlaubt keine automatische Volltextübernahme.
Andere Rechte an Dokumenten, redaktionellen Inhalten und Konsolidierungen bleiben
davon getrennt. [Feedbeschreibung](https://eur-lex.europa.eu/content/help/search/predefined-rss.html).

Bundespuls bereitet DIP-Daten auf und ist keine unabhängige zweite Bestätigung.
Sein RSS-`pubDate` entspricht im geprüften Vorgang341273 dem DIP-Feld
`aktualisiert`. Deshalb wird es vor Speicherung verworfen und nicht als
Veröffentlichungszeit ausgegeben; auch die Abrufzeit ersetzt keine Publikation.
Diese Regel gilt ausschließlich für die konkrete Quellen-ID mit exakter Feed-URL.
Bei leeren oder fehlerhaften Antworten wechseln beide neuen Wege nicht auf HTML.
HTML-Fehlerseiten und abgeschnittene RSS-Hüllen gelten als Abruffehler. Beide
Einstiegswege speichern nur Titelmetadaten, Links und belegte Datums-/Urheberfelder;
Feedbeschreibungen werden auch bei späteren Anbieteränderungen nicht übernommen.

Bundespuls beschreibt kostenlosen Automationszugang ohne Anmeldung und regelbasierte
Metadaten statt KI-Zusammenfassungen. Vor Aktivierung bleiben Quellenangabe
„Deutscher Bundestag/Bundesrat – DIP“, Dokumentnummern soweit vorhanden,
Änderungskennzeichnung, Anbieterrechte sowie Kontakt im User-Agent und Cachehinweise
zu berücksichtigen. Redaktionelle Inhalte sind von amtlichen Daten zu unterscheiden.
Belege: [Entwicklerzugang](https://bundespuls.de/entwickler),
[Methodik](https://bundespuls.de/methodik), [Rechte](https://bundespuls.de/impressum),
[DIP-Nutzungsbedingungen](https://dip.bundestag.de/documents/nutzungsbedingungen_dip.pdf).

## Umsetzung und Nachweise

Der Code ergänzt genau zwei Quellen nach der historischen Mengenbegrenzung.
Alle231 bisherigen Katalogeinträge und insbesondere144 aktive Quellen bleiben
bytegleich serialisiert. Herkunft, Rechteumfang und technische Prüfbelege stehen
im neuen Modul `seeds/parlamentsdaten-quellen.js`. Bundespuls bleibt Aggregator
mit unbekannter Vertrauensstufe; nur die genaue EUR-Lex-Domain wird amtlich erkannt.

Gezielte Offlineprüfung:15/15 neue Prüfgruppen einschließlich echter Abrufkette
mit ersetztem Transport,10/10 bestehende Datumsprüfungen,99/99 Architekturprüfungen
und22/22 Seed-Driftprüfungen. Die neue Suite ist im Quellenbereich registriert.
Der historische Seed wurde nur für Neuinstallation/Drift synchronisiert und
wird nicht auf Production angewendet.

Der vorhandene additive Planer wurde gegen einen frischen vollständigen
Bestandsabzug geprüft:25/25 Offline- und25/25 echte PostgreSQL-17-Prüfungen,
einschließlich Einspielen/Rücknahme der genau sechs neuen Zeilen und vollständiger
Wiederherstellung aller zehn Tabellen. Danach wurden die zwei Herausgeber, zwei
pausierten Wege und zwei Paketlinks in Production eingetragen. Die Nachkontrolle
vom13:44:31UTC bestätigt alle zehn Tabellen exakt als Ausgangsstand plus Receipt:
keine bestehenden Zeilen verändert oder entfernt, sämtliche Healthwerte und DIP
unverändert. Endstand55Pakete/254Wege/293Paketlinks/98Herausgeber.

[Maschinenlesbarer Nachweis](48-katalog-20261106.json) enthält die Zähler und
Prüfsummen. Originalreceipt und daran gebundene Rücknahme-SQL liegen unter
`/workspace/helmut-abdeckung-2026-11-06/dip-eurlex-bundespuls/production-20261106/`.
Der Rückweg entfernt nur die belegten neuen, unveränderten und noch nicht genutzten
Einträge; kein Rücknahmetest in Production. Der Code bleibt bis zum konkreten
Merge-GO für[PR1084](https://github.com/ernisch/helmut-pilot/pull/1084) auf dem
Arbeitsbranch. Die Freigabe fürPR1079 gilt dafür nicht. Neue Quellen wurden nicht
aktiviert; Budget, Cron und Profile bleiben unverändert.
