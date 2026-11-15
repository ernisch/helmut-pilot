# Tägliche Versorgung: geprüfter Abschlussstand15.11.2026

Stand15.11.2026,09:31UTC. Teilweise abgeschlossen, kein Gesamt-PASS.

Die Leserreparaturen aus PR1203/1204/1206 sind regulär ausgerollt. Zuletzt
bestätigte Runtime:236ced65 nach zusätzlicher AttributionsreparaturPR1209,
Productiondeployment`dpl_CrAiLtd6uSeC6vzfGb1KkPCedXJB`READY, öffentliche Shell
HTTP200 mit exakt dieser Version. Gleiche Originalbytes belegen die Leser;
keine zusätzlichen bezahlten Modellläufe, Backfills oder Jobresets.

Der reguläre Morgen15Nov05:15 blieb partial:67Einträge,2neue geprüfte Absätze,
Quellenstand offen und kein belegter Tagesanlass. Fehlende Priorität allein
ist kein neuer Codefehler; die unvollständige Versorgung bleibt sichtbar.
Selektive Nachkontrolle vor und nach PR1209 bis09:31UTC:
alle fünf geprüften Erfolgsjobs weiter erledigt, alle Payloadprüfsummen identisch.
Keine Production-Daten, Quoten, Reserven, Hosts oder Zeitpläne verändert.

## Attributionsreparatur live

[PR1209](https://github.com/ernisch/helmut-pilot/pull/1209) schließt die belegte
Ausgabelücke für Autor, Original/OERinfo, CC-BY4-Lizenzlink und Bearbeitungshinweis
im vorhandenen Quellenhinweiskanal. Nur ein individuell belegter Textlizenzabsatz
mit gebundener Quelle, Artikeladresse, Titel, Datum und Auszug wird übernommen.
Ein unabhängiger Review fand zunächst eine fehlende Bindung der RSS-Beschreibung
an den lizenztragenden Volltext. Der Folgefix übernimmt nur dessen ganzen,
exakt überlappenden Satzpräfix; fremde Folgesätze/Footer fallen weg. Reviewbefund
abschließend geschlossen, übriger geprüfter Umfang ohne Befund.

Gespeichertes Original-RSS offline:20Items,19echteArtikelziele;3individuell
lizenzierte Textauszüge einschließlich11Nov bleiben erhalten,16Artikel nur mit
Titel/Linkmetadaten. Nichtartikel„Suche“ verworfen, keine Bilder/Volltextnachladung.
Bestehende Quellen-/Renderergruppen29/29 und11/11 bestanden; nach dem Quellenfix
nur den tatsächlich geänderten Quellentest erneut geprüft.
[Pflicht-CI43699045427](https://github.com/ernisch/helmut-pilot/actions/runs/43699045427)
am exakten Kopf`79ce8984d0048e19513b66864ddb52a2fe33da6a`:14/14Schnellkern,
235/235betroffene Fachsuiten, tatsächlich ausgeführter Desktop-/Mobil-Chromium-
Smoke und beide Prosaansichten grün. Kanonischer Plan`targeted`, keine Standard-,
Datenbank- oder pauschale500er-Läufe. Merge`236ced6534ce9537eee9f6942e7b892a3dab2c08`.
Das installiert/aktiviert keine Quelle und beweist keinen echten Kundendurchlauf.

## Weitere konkrete Befunde

- NDR-Auftrag`d31ae2dd-21e2-44ed-99ce-ef8cc63107bb`wartet weiter.
  Original HTTP200,SHA256`3b3a89cb703957fde970a0ae1cc9b4e09f9df5fc805d908ffbb7ac5d92003df4`.
  Native Offline-Lesung negativ:`artikeltext-abweichend`. Zusätzlich Original-
  Publikation19:43:17.482UTC gegenüber gespeichertem Auftrag18:00:43UTC am14Nov.
  Kein bewiesener einfacher Leserfehler; keine nachträgliche Metadatenkorrektur.
  Ein weiterer historischer NDR-Auftrag vomFebruar2025bleibt geparkt.
- Ad-hoc-Leser korrigiert; Host weiterhin nicht freigegeben. Der echte
  Zusatzdisclaimer nennt teilweise automatisierte KI-Erstellung und Prüfung,
  aber keine positive Weiterverwendungslizenz. Kein pauschales Host-GO abgeleitet.
- PR1207bereitet Destatis/iRights mit zwei Wegen und drei fachlich begründeten
  Bindungen inaktiv vor. Die generierte SQL-Ergänzung enthält genau sechs neue
  Zeilen. Fachtest, Seeddrift und unabhängige Diffprüfung lokal bestanden.
  CI-Erstlauf43695758471scheiterte am damals fehlenden generierten Seed;
  Fehler lokal behoben. Folgelauf43696614891wegen pauschaler500er-Prüfungen
  gestoppt. Betreiber bestätigte ausdrücklich:keine Massentests,PR bleibt
  vorerst ungemergt. Keine Schutzprüfung abgeschaltet oder als grün umgewertet.

## Höchstens drei verbleibende Verkaufsblocker

| Beschlüsse | Status und echter Beleg | Exakt fehlendes Verhalten / kleinster Umfang |
|---|---|---|
|1–17,24–26: Versorgung und fachliche Qualität|Teilweise: [aktueller Betriebsbeleg](../CURRENT_STATE.md), reguläres Morgenpaket partial, vier strukturelle Abdeckungsbefunde; Quellenwege im Betrieb fehlen oder bleiben vorbereitet.|Geeignete Quellen samt Nutzungsumfang zulässig integrieren/aktivieren; danach nächsten regulären Lauf und tatsächliche Ausgaben gezielt abnehmen. Keine Massentests, kein künstlicher Tagesanlass.|
|10,17–23,27 sowie Zugangsvertrag: echter Kundendurchlauf|Technisch teilweise belegt, vollständige reale Abnahme nicht geprüft. [ProduktvertragE](../produktvertrag-20261115.md#e-abnahmekriterien-für-den-ersten-zahlenden-kunden) verlangt echte Sitzung und Konto→Einladung→Posteingang→Passwort→Login/Reset. Der [Profilnachweis](../ui/profil-kompakt-20261111/README.md) schließt die authentifizierte Kundenabnahme ausdrücklich aus.|Einen autorisierten realen Kundendurchlauf anhand vorhandener Kriterien dokumentieren; technische Prüfungen wiederverwenden. Keine ungefragte Einladung oder kostenpflichtige Büroerstellung.|
|Rechtsrahmen undE9: rechtlich tragfähiger Verkauf|Offen: [Rechtsunterlagen](../recht/anwaltsfragen-und-pilotvereinbarung-entwurf.md) ausdrücklich Entwürfe; keine aktuelle Freigabe für Rechtsgrundlage politischer Daten, DSFA, Verträge/AVV und Aufbewahrung belegt.|Vorhandene Unterlagen für den tatsächlichen Verarbeitungsumfang fachlich/rechtlich entscheiden. Keine erfundene Freigabe oder neue Infrastruktur.|

Belege:Produktvertrag`docs/produktvertrag-20261115.md`, vorhandene Profil-/Büro-
und Verwaltungsnachweise, Rechtsentwürfe unter`docs/recht/`, CURRENT_STATE sowie
gezielte Original-/Laufbelege. Mock100bleibt in seinem abgeschlossenen Umfang
erfüllt; es beweist keinen späteren Kunden- oder Verkaufsabschluss.

## Genau ein nächster Schritt

Einmalige automatische lesende Kontrolle des ohnehin regulären Morgenabschlusses
am16Nov05:25UTC ist bestätigt eingerichtet. Sie startet keine Verarbeitung und
plant sich nicht erneut. Die alten fünf Nachtkontrollen sind beendet. QuellenPR1207
bleibt unabhängig davon wie ausdrücklich entschieden Draft/ungemergt.
Parallel offener UI-PR1208 wird hier weder übernommen noch als erledigt ausgegeben.
