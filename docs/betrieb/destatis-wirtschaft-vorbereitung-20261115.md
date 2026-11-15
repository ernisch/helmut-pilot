# Destatis: zwei fachlich belegte Datenbindungen vorbereiten

Stand15.11.2026,08:56UTC. Keine Liveinstallation, Aktivierung oder zusätzlichen
Quellen-/Modellläufe. Der vorbereitete Code bleibt ausdrücklich inaktiv.

## Belegter kleinster Umfang

Die Daten-/Forschungsrolle eines vorbereiteten Wirtschaftspakets ist nicht
zugeordnet. Der amtliche Anbieter nennt auf seiner RSS-Übersicht ausdrücklich
tägliche Pressemitteilungen und verlinkt diesen direkten Feed:
https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml
Anbieterübersicht:https://www.destatis.de/DE/Service/RSS/_inhalt.html

Eine gespeicherte Originalantwort (HTTP200, SHA256
`e0f35adf8cc2132277aee2162ef3fe69d73a342947bd99108f30fa20ca464e7a`)
wird vom vorhandenen RSS-Leser offline vollständig erkannt:10/10Titel,Original-URL,
Publikationsdatum und Beschreibungen. Jüngste Veröffentlichung13Nov08:00+01:00;
Abruf-/Prüfzeit15Nov ist kein neuer Publikationszeitpunkt. Konkrete Texte betreffen
Betriebsgründungen, Insolvenzen, Großhandels- und Energiepreise.

Reine begrenzte Live-Projektion bestätigt: Herausgeber`publisher-destatis.de`
ist bereits`statistical_office/data_source`; der genaue Direktfeed fehlt,
das Zielpaket ist`prepared`. Keine vollständige Katalog- oder Profilausleitung.

## Vorbereiteter Code

Genau ein neuer Weg`rp-fach-destatis-aktuell-rss`mit`rss/rss-regex`, vorhandenem
Destatis-Herausgeber, Rolle`data_source`, Klasse`amtliche_daten`, genau einer
Wirtschafts- und einer Digitalbindung. Der alte Soziales-Suchweg bleibt identisch.
Die zweite Angebotsbindung hat einen echten Digitalstatistikbeleg; sie ist keine
Behauptung eines aktuell im RSS gelieferten Digitalartikels.

## Begründung der zweiten Angebotsbindung

Amtliche IT-Übersicht:
https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Einkommen-Konsum-Lebensbedingungen/IT-Nutzung/_inhalt.html
Dort verlinkte tatsächliche Pressemitteilung:
https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/03/PD26_N014_63.html
Original HTTP200,SHA256`708f8f6d7d413a0ad6f65c135dbd93e95ef62f05a5028aed01290dc13ab42edc`.
Sie belegt originäre Digitalstatistik:2025nutzten59%der16–74-Jährigen soziale
Medien,2021waren es47%. Publikation2März2026, kein frischer Tagesanlass.

Die offizielle RSS-Seite bietet täglich aktuelle Pressemitteilungen allgemein
an. Zusammen mit der echten IT-Statistik trägt das die vorbereitete fachliche
Angebotszuordnung. Ein Digitalartikel innerhalb der aktuellen14Tage ist keine
native Voraussetzung für Katalogrollen. Die aktuelle10-Item-Stichprobe enthält
aber keinen Digitalartikel; vollständige RSS-Auslieferung aller Mitteilungen,
tägliche Digitalpublikationen und tatsächliche Digitalversorgung sind unbelegt.
Die vorhandene Rohitemauswahl prüft Profilbezug und Handlungstrigger;
`fachgebietKeys` ist kein harter paketbezogener Themenfilter. Der historische
HTML-Einzelartikel wird nicht als neuer regelmäßiger Abrufweg eingetragen.

Defaults bleiben`paused/manual`, `active:false`, `preparedOnly:true`,
Rechteprüfung und bisherige Freigabeflags erhalten. Kein Weg wird durch einen
neuen Profilbedarf automatisch aktiv. Die vorhandene Fach-/Parteiquellensuite
prüft Herausgeberdedup in beiden Quellenreihenfolgen, korrekte Rollenbindung,
unveränderten Altweg und tatsächliche Inaktivität. Syntax/JSON/Diffprüfung grün;
Pflicht-CI am finalen Kopf steht noch aus.

## Tatsächlicher Nutzungsnachweis

Original-Impressum:https://www.destatis.de/DE/Service/Impressum/_inhalt.html
SHA256`d925cb0e7e3a0dc2ef8105b00f19d51e00c7922f2b8dc73b14d4ed1cc448c97f`.
Die allgemeinen Copyrightbedingungen gestatten Vervielfältigung und Verbreitung,
auch auszugsweise, mit Quellennachweis; ergänzende Einzelangaben und Bildrechte
bleiben gesondert. Dies ist ein positiver tatsächlicher Nutzungsbeleg. Er wird
weder zu einer Lizenz für fremde Bilder noch zu einer pauschalen Freigabe anderer
Quellen erweitert. Die vorhandene gesonderte GENESIS-Lizenz wird dem Pressefeed
nicht zugeschrieben. Eine spätere konkrete Betriebsentscheidung muss genau den
verwendeten Textumfang und diese Quelle betreffen; hier wird nichts aktiviert.

## Vorläufige Liveänderungsvorlage, noch nicht ausgeführt

Bei bestätigtem passenden Nutzungsumfang: vorhandenen Herausgeber wiederverwenden,
genau einen fehlenden Abrufweg und dessen zwei Paketlinks ergänzen. Bestehende
Schutzflags, Paketstatus und Altpfade zunächst erhalten; Aktivierung ist ein eigener
konkreter Schritt. Keine Seed-Neuinstallation, kein globaler Katalogabgleich,
keine Profiländerung, keine Migration, kein Cron-/Budgeteingriff.

Vor einer tatsächlichen Änderung müssen Zeilen weiterhin fehlen und Herausgeber/
Paket zum geprüften Vorwert passen. Nachher exakt diese Zeilen und verbliebene
Erfolgsprüfsummen lesen; Rückweg entfernt nur die selbst neu angelegten,
unveränderten Zuordnungen. Keine Fremdänderung oder erfolgreiche Verarbeitung löschen.
Installation allein wäre kein Nachweis laufender Versorgung.
