# DIP, EUR-Lex und Bundespuls

Geprüft am06.11.2026 anhand des tatsächlichen Katalogs, gespeicherter Dokumente,
Anbieterdokumentation und öffentlicher Feedantworten. Auftrag: die drei vom
Betreiber genannten Angebote prüfen und fehlende Zugänge ergänzen.

| Angebot | Bestand vor der Ergänzung | Enger Zugang |
| --- | --- | --- |
| Bundestag DIP | `rp-dip`, healthy/always_on;287 gespeicherte Dokumente, jüngstes Publikationsdatum04.11., zuletzt gespeichert05.11.2026 | Vorhandene API unverändert; kein Duplikat |
| EUR-Lex | Kein Eintrag | [Amtsblatt L RSS](https://eur-lex.europa.eu/DE/display-feed.rss?rssId=222), amtliche EU-Rechtsakte im bestehenden EU-Fachpaket |
| Bundespuls | Kein Eintrag | [Vorgangs-RSS](https://bundespuls.de/feed/vorgang), privater DIP-Aggregator im bestehenden Bundesbasispaket |

Bei der ursprünglichen Ergänzung waren beide neuen Wege inaktiv (`paused/manual`).
Seit06.11.,21:22Istanbul sind sie aktiviert; der produktive Abschluss steht unten.
Die Prüfung löst keinen regulären Quellenlauf,
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
Metadaten statt KI-Zusammenfassungen. Die erneute Prüfung erlaubt den engen kommerziellen
Titel-/Linkumfang unter den DIP-Bedingungen. Erforderlich sind Quellenangabe
„Deutscher Bundestag/Bundesrat – DIP“, Änderungskennzeichnung und ein Link zu den
kostenlosen DIP-Originaldaten; Dokumentart und Nummer zusätzlich bei Werkzitaten.
Bot-Kontakt und Cacheintervall5–30Minuten sind Anbieterempfehlungen. Der Bot verweist
auf Helmuts geprüftes öffentliches Impressum. Der bestehende gemeinsame Tagesabruf
bleibt erhalten; kein neuer Cache. EUR-Lex liefert ausdrücklich `no-store`.
Redaktionelle Inhalte sind von amtlichen Daten zu unterscheiden.
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

## Vorbereitung der vollständigen Aktivierung

Der anschließende Betreiberauftrag autorisierte die Aktivierung beider Quellen.
Bis zum später erteilten konkreten Merge-GO für PR1084 blieb der Plan unappliziert.
Die folgenden Vorbereitungsbelege werden unverändert erhalten; die tatsächliche
Ausführung und Nachkontrolle stehen im Abschlussabschnitt.

| Weg | Geplante Aktivierung | Grund |
| --- | --- | --- |
| EUR-Lex | `needs_review / always_on` | EU-Rechtsakte global abrufen, ohne das gesamte vorbereitete EU-Paket zu aktivieren |
| Bundespuls | `needs_review / auto` | Abruf über die bereits aktive Bundesbasis |

Die echten Feedabrufe mit `HelmutBot/1.0 (+https://helmut-pilot.vercel.app/impressum)`
lieferten beideHTTP200. Je fünf Einträge wurden mit Produktionsparser, Normalisierung
und Speicherprojektion geprüft:EUR-Lex5mit Datum, Bundespuls0mit Publikationsdatum,
beide5mit Herkunft und0Volltext. Der Herkunftsbeleg bleibt über beide Dedupwege,
PostgREST-Projektionen und kompakte Antworten bis zur Quellenanzeige erhalten.
Auch manuelle Artikelkontext-Reparaturen respektieren den engen Metadatenumfang.
Undatierte Bundespuls-Belege zeigen „Veröffentlichungsdatum unbekannt“; Abrufzeiten
werden nur ausdrücklich als Abruf ausgewiesen. Gezielte Tests:23Backendgruppen,
8UI-Gruppen, Original-Chromium bei390px sowie18Quellenlesegruppen nach Integration
von main2a5e0774 bestanden. Die Pflicht-CI wird auf dem finalen PR-Kopf abgenommen.

Geladene Bundespuls-Belege erhöhen keinen unabhängigen Belegbonus in den angepassten
Bewertungen und Radarsignalen. Die physische gespeicherte Dokumentzahl bleibt erhalten;
eine nur lesende Bewertungsprojektion wird nie persistiert. Grenze: Vorauswahlen vor
dem vollständigen Quellenread kennen diese Zuordnung noch nicht. Insbesondere die
optionale Lage-Vorsortierung bleibt davon betroffen. Production meldete16:02:21UTC
`scoring=off` und `relevanzordnung=false`; diese Schalter werden nicht geändert.
Dies ist keine universelle Neuordnung aller historischen Korroborationszählungen.

`scripts/datenquellen-aktivierungsplan.js` erzeugt nur SQL für die zwei vorhandenen
Zeilen. Status und Modus werden nach vollständigem Ausgangsvergleich atomar geändert;
es werden keine Gesundheitswerte, Pakete oder Profile geschrieben. Der bestehende
Zeitstempeltrigger bleibt wirksam.8Offline- und23echte PostgreSQL-Prüfungen bestanden,
einschließlich der vollständigen Livekopie, Gegenproben und Rücknahme. Die reale
Quellenauswahl steigt von141auf143, ausschließlich um diese zwei Wege.

Final geprüfter Plan: `aktivierung/plan-reviewed/` unter dem Arbeitsartefakt
`/workspace/helmut-abdeckung-2026-11-06/dip-eurlex-bundespuls/`.
Planhash:`4bae074baf34e34fcd9b2ab2048743825480ec08bbce376a3c2fa4e0b301817d`.
Apply-SHA256:`3581039a226453cc8a2836e839e0693c5ea03263446642bc9a2226bb5f243d51`.
Die älteren Unterordner `plan/` und `plan-final/` sind überholt. Vor Apply sind
frischer Katalog/Schema, SourceMode und Deployment zu prüfen. Danach alle zehn
Tabellen vergleichen und den tatsächlichen Ausführungsbeleg sichern. Der daran
gebundene Rückweg pausiert nur diese zwei Quellen und erhält inzwischen entstandene
echte Abruf-/Gesundheitswerte. Noch kein Apply oder Rücknahmetest in Production.

## Produktiver Abschluss am06.11.2026

Nach ausdrücklichem GO wurde PR1084 auf `14c558b2142127750a17bc40f53cd71020e3c147`
gemergt. Der geprüfte PR-Kopf `a5b168c8` bestand189/189Standard- und341/341Bereichssuiten
sowie die echte Desktop-/Mobilprüfung. PARDOK, Shadow und Abrufwegeprüfung bestanden ebenfalls.
Vercel `dpl_GSjihZu7UMcYWn1SUVefZgBJm9AL` ist READY auf Production und der Hauptdomain.
Der rein lesende Laufzeitaufruf bestätigt denselben Mergecommit, Quellenmodus an,
Supabase und exklusiven relationalen Profilzugriff. Der öffentliche Bereitschaftstest
ist grün. Scoring-/Relevanzschalter bleiben wie vor der Veröffentlichung.

Der frische vollständige Katalog und das Pfadschema waren unverändert gegenüber der
geprüften Ausgangslage; Apply und Rückweg waren bytegleich mit den geprüften Hashes.
Ausführung um21:22:43Istanbul (18:22:43UTC): genau EUR-Lex auf `needs_review/always_on`
und Bundespuls auf `needs_review/auto`. Die anschließende vollständige Nachkontrolle
aller zehn Tabellen bestätigt ausschließlich diese zwei Status-/Modusänderungen
einschließlich des vorhandenen Zeitstempeltriggers. Alle Gesundheitswerte,
anderen Katalogzeilen und sämtliche Profilzeilen sind unverändert.

Der Produktionsplan, mit frischen aktiven Profileingaben rein lokal ausgewertet,
wählt143statt141Abrufwege: genau die beiden neuen Wege zusätzlich, kein Weg entfernt.
DIP bleibt im eigenen API-Pfad. Beide neuen Wege warten auf den ersten regulären
Quellenlauf; `needs_review` behauptet keinen bereits erfolgreichen Abruf. Nächster
planmäßiger Lauf07.11.,07:00Istanbul. Keine manuelle Modellgenerierung und kein
Rücknahmetest in Production. Die früheren Vorbereitungs-Aussagen „noch kein Apply“
beschreiben ausschließlich ihren damaligen Belegstand.

[Maschinenlesbarer Abschluss](48-aktivierung-20261106.json).
Originale `before.json`, `apply-receipt.json`, `after.json`, `postflight.json`,
`selection-postflight.json` und der an das tatsächliche Receipt gebundene
`rollback-bound.sql` liegen unter
`/workspace/helmut-abdeckung-2026-11-06/dip-eurlex-bundespuls/aktivierung/production-20261106/`.
Der Rückweg pausiert nur diese zwei Quellen und erhält echte spätere Abrufwerte.
Die operative Aktivierung ist abgeschlossen; dieser reine Dokumentationsnachtrag
benötigt gemäß Betreiberregel sein eigenes konkretes Merge-GO.
