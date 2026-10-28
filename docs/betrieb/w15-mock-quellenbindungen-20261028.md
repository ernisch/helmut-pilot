# W15 Quellen aktualisiert; neue Vorprüfung gestoppt (28.10.)

**Abgebrochen nach erstem FAIL:** Genau eine kostenfreie datenreine Prüfung,
06:03:36.135–06:03:38.805UTC (09:03:36–38Istanbul). **50 PASS,1 FAIL,
449 nicht versucht.** Das Ziel500/500 ist nicht erreicht. Kein neuer Vollauf,
Container, DB-Schreibzugriff, Aktivierung, Unit, Mockantwort oder Modellaufruf.
Die bedingte Freigabe für einen neuen Mock500-Gesamtversuch ist ungenutzt.

## Neue belegte Originalquellen und lokale Bindungen

Im vorhandenen Bestand fehlten geeignete Quellen. Nur zwei neue amtliche
Originalartikel und der kleine amtliche Berliner Zeitnachweis wurden abgerufen;
alle verbleiben geschützt in der Cloud, ohne Mac-Download oder Originalersatz.

- Berlin: [Steuerschätzung vom23.10.](https://www.berlin.de/sen/finanzen/presse/pressemitteilungen/pressemitteilung.1730442.php),
  amtlicher Index23.10.,12:52Berlin/10:52UTC, Minutenpräzision. HTML50643B,
  SHA256 `717c311350b734ae503946cb238d531f7d0c66a77e4bc2b037635fb8f1b24e3d`.
  Vollständiger zusammenhängender Auszug1139Zeichen: erwartete31,3/32,4Mrd.Euro
  Steuereinnahmen2026/27 und ausdrücklich zugeschriebene Wirtschaftsunsicherheit.
- Variante6: [Bundestagsmeldung vom16.10.](https://www.bundestag.de/presse/hib/kurzmeldungen-1225362),
  nur Publikationstag belegt, keine erfundene Veröffentlichungsuhrzeit. HTML256798B,
  SHA256 `c6938aebddb2e5c2203b6c5892802010ae78cc46e6d1cf76554995136f2c12ca`.
  Vollständige benachbarte Absätze1177Zeichen: Grünen-Forderung nach sozialem
  Wohnungsbau/Bestandsnutzung und zugeschriebene Genehmigungshürden.
  Keine alten PDF-Zahlen oder Statistikbehauptungen übernommen.

Beide Quellen liegen am tatsächlichen28.10. vollständig im unveränderten
14-Tage-Fenster.16 Quellen-/Auszugs-/Zeitbelege positiv und durch Root zusätzlich
an den Original-HTMLs gegengelesen. Quellen-/Mock-/Inputhelpers sind ausschließlich
optionale lokale Testdaten:120 neue BE-Bindungen und42 Wohnungsbau-Bindungen,
neu und offen manuell kuratiert; keine Modellreview- oder native U-Quittung.
Die anderen338 ausgewählten Briefings bleiben inhaltlich bei ihren historischen
Quellen, nur Kalenderbindung neu. Das gemeinsame ausgewählte Inventar wird
getrennt offengelegt:7→6Dokumente,6KOs/6Cluster; alte Originale bleiben erhalten.

Für die neuen Briefingdaten verwendet der unveränderte B-Konstruktor ein
explizites lokales Test-Lesefenster ab16.10.; keine Behauptung heutiger Nachrichten
oder eines nativen Morgenreceipts. Die echte Lage-Quellenfrist, Systemuhr,
Signaturen, Kosten-, Auth-, Einmaligkeits- und Productionregeln bleiben unverändert.
BT-Mitternacht ist ausschließlich dokumentierte Speicherung des belegten Tags;
die lokale Anzeige nennt ehrlich nur diesen Tag, keine Publisher-Uhrzeit.

## Erster tatsächlicher Fehler und engster Folgeschritt

**Index50, `test-kohorte-synthetik-be-001`, Variante4:**
`publication-eligibility-candidate-unchecked` während der Bindungskonstruktion.
Die vorigen50 Brandenburgprofile bestanden die echten unveränderten B/A/F-/L-
und AI/Q-/D/R-Konstruktoren. Für die übrigen449 gab es nach dem ersten Fehler
keine weitere Konstruktorprüfung; insbesondere Variante6 ist noch nicht dynamisch
abgenommen. Keine qualifizierten Daten-/Mockpakete wurden geschrieben.

Der neue Testhelper übergibt seinen neuen Wissenseintrag direkt an
`toBriefingContractV3`. Dessen echte Radarprojektion verlangt unter der erhaltenen
Veröffentlichungspolicy den prozesslokalen Kandidatennachweis. Dieser entsteht
nur durch den bestehenden `publication-eligibility.filterCandidates`-Pfad mit
vollständiger Quellenidentitätslesung. Der Aufruf fehlt im neuen lokalen Helper.
Ein kopierter Policyhash oder ein manuelles A/F-Urteil ersetzt diesen Nachweis
nicht. Der Guard hat korrekt gesperrt; dies ist kein inhaltliches Quellenurteil.

Der vorherige statische Review hatte diese Konstruktorvorbedingung übersehen.
Zwei unabhängige Nachlesereviews bestätigen den tatsächlichen FAIL;44 Kontrollen
im Qualifikationsreview. Die Fehleraufzeichnung enthält an dieser frühen Phase
noch alte RBB-Vorgängermetadaten. Die tatsächlich neu versuchte Quelle/KO sind
im unabhängigen Bericht und Native-Ableitungsbeleg eindeutig separat benannt.
Alle11 Originaldateien mit96530256Bytes byte-/hashgleich; auch die ursprüngliche
isolierte Datenbank ist gegen den erhaltenen Vorherbeleg unverändert.

Nach FAIL keine Reparatur oder Wiederholung. Kürzester nächster Schritt ist die
fehlende reguläre Kandidatenprüfung mit vollständigen Quellenidentitäten vor
dem B-Konstruktor einzubinden und erneut gezielt zu prüfen. **Wegen der ausdrücklichen
Stop-Regel ist dafür ein neues GO erforderlich.** Keine Policy leeren,
keine Freigabe fälschen und keine Sicherheitskontrolle überspringen.
V8-Coverage wurde im notwendigen Lauf erfasst; keine weitere Testsuite/CI gestartet.
App/Server/Workflows sind seit der grünen Basis `da63309c`/CI40534410137 unverändert;
diese neue datenreine Qualifikation ist ausdrücklich FAIL, kein neues CI-Grün.

- [Zusammenfassung, Quellenpins, Bilanz und nächste Änderung](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_SUMMARY.SAFE.json).
- [Alle51 tatsächlichen Einzelprotokolle](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_QUALIFICATION.SAFE.json).
- [Unabhängiger Qualifikationsreview](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_REVIEW.SAFE.json).
- [Originalerhaltung und konkrete Veröffentlichungsbindung](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_ORIGINALS.SAFE.json).
- [Quelleninhalt und Datumspräzision](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_SOURCE_REVIEW.SAFE.json).
- [Ursprüngliche isolierte Datenbank unverändert](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_SOURCE_DB.SAFE.json).
- [V8-Abdeckung dieser begrenzten Vorprüfung](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_COVERAGE.SAFE.json).

PR969/971/972 bleiben ungemergt. Kein500er-PASS, keine neuen gespeicherten Ausgaben;
Ergebniskategorien eines neuen Gesamtlaufs nicht anwendbar. Historische Fehler und
die früher1500fehlenden Ausgaben bleiben im folgenden Befund und im separaten
Vollaufdossier unverändert erhalten. Kein Productionnachweis.

---

# Historischer Befund vor Quellenaktualisierung:338PASS/162FAIL

Die einmalige vollstaendige Vorpruefung lief am28.10.,05:30:21.782UTC
(08:30:21Istanbul) mit den echten bestehenden Konstruktoren und unveraenderten
Quellenpruefungen.500/500 Profile wurden einzeln erfasst: **338 gueltige D-/R-
Bindungen,162 abgewiesen**. Das geforderte500/500-PASS ist nicht erreicht.
Kein neuer Vollauf, Container, Datenbankschreibzugriff, Profilaktivierung,
Unit, Mockantwort oder echter Modellaufruf. Keine Wiederholung.

## Belegter Befund je Variante

| Variante | Profile | D/R gueltig | Fehler |
|---|---:|---:|---:|
|0/Oel-Gas|82|82|0|
|1/Tabak|82|82|0|
|2/Elektromobilitaet|83|83|0|
|3/Elektromobilitaet|41|41|0|
|4/Berlin|120|0|120|
|5/Brandenburg|50|50|0|
|6/Zwangsversteigerungen-PDF|42|0|42|
|Gesamt|500|338|162|

**Berlin, Indices50–169:** Alle120 Profile binden allein den RBB-Beitrag vom
13.10.,11:02:48UTC. Er liegt am tatsächlichen Lauftag ausserhalb des
unveraenderten14-Tage-Fensters. Der echte D-Kontext ist leer; der unveraenderte
Provider wirft `w15-unit0-provider-empty-context`. D und R sind mit diesem
gebundenen Input nicht konstruierbar. Betroffener Quellenbezug:
`q-52da9d6e37f47514600f`, Dokument `rd-691117a4712de0582634fca3081d3ee6c2d6a65c3c4360086dd5caffbd44800d`.

**Variante6,42 Profile:** Erster heute tatsaechlich protokollierter Index170.
Der reale Kontext erlaubt `q-e61c51251bc1d8866dd3` (hib15.10.), der Mock zitiert
`q-89cfb5d28f8ae51b8021` (PDF08.10.). Der echte Guard weist alle42 mit
`ai-text-source-reference` ab. Die hib-Kurzmeldung belegt nicht die bisherigen
PDF-Zahlen2000–3000 und die detaillierten Statistikgrenzen. Ein reiner Austausch
der Quellen-ID waere unbelegt. Die alte Behauptung wurde weder umetikettiert
noch als gueltiger neuer Mock ausgegeben. Ein inhaltlich ausreichend belegter
Ersatz fuer die verlangten zwei eigenstaendigen Absaetze liegt nicht vor.

Der neue Indexbefund stammt ausschliesslich aus dieser freigegebenen
Vorpruefung. Er rekonstruiert nicht nachtraeglich den unprotokollierten ersten
Fehlerindex des vorigen Gesamtversuchs.

## Originale und echte Pruefungen erhalten

Die neue Diagnostik verwendet ausschliesslich `rebindOrdinaryRow`: nur die
fuenf vorhandenen Kalender-/Hashpfade aendern sich im abgeleiteten Speicherobjekt.
Quelltexte, Publikationsdaten, Profile und Native-Inventar bleiben unveraendert.
Quellen- und Codepins sowie Native-Vorher-/Nachherhashes unabhaengig bestaetigt.
Die vorher verwendete `w15-synthetic-window`-Quellenverjuengung wurde nicht
aufgerufen. Unter diesem GO ist jener alte Ableitungspfad kein zulaessiger
Weg, um den fehlenden Berlin-Kontext zu erzeugen.

Je Profil laufen echte B/A/F-Bindung, L-D-Kontext und der unveraenderte
`w15-unit0-provider.prepare` mit AI-/Q-Pruefung und D-/R-Payloadkonstruktoren,
soweit der Input sie zulaesst. Bei abgewiesenem D-/Quellenkontext wird kein
R-PASS erfunden. Die vollstaendige Fehlerliste nennt pro Fall Index, Owner,
Variante, Dokument-ID/Originaldatum, Mock-qID, reale Kontext-qIDs und Fehlergrund.
Zusaetzliche Referenzvergleiche sind Diagnosemetadaten, keine Ersatzvalidatoren.

Zwei unabhaengige reine Berichts-/Quelldatenreviews bestaetigen die Bilanz und
Originalerhaltung;39 Kontrollen im inhaltlichen Review positiv. Keine neuen
Konstruktoren, Units oder Vorpruefungswiederholungen durch die Reviewer.
V8-Coverage beim noetigen einmaligen Lauf mit erfasst; keine neue Voll-CI oder
Runtime-/500er-Leistungsabnahme. App-, Quellen- und Sicherheitslogik unveraendert.

## Daten-/Bindungsgrenze und naechster notwendiger Schritt

Eine reine Mocktext-/ID-Korrektur behebt den fehlenden aktuellen Quellenkontext
der120 Berlinprofile nicht. Benoetigt werden eine tatsaechlich zulaessige
Quellengrundlage und ein ehrlich neu gebundener gepruefter Briefingkontext;
fuer42 weitere Profile ausserdem vollstaendig belegbare Mockinhalte. Die
bestehenden gebundenen Eingaben liefern diesen500er-PASS nicht.

Nach der fehlgeschlagenen Gesamtqualifikation gestoppt: keine Mockreparatur
als erfolgreich behauptet, keine Verjuengung/Umdeklarierung, keine Lockerung
von Quelle/Signatur/Kosten/Einmaligkeit/Auth, kein neuer Vollauf gestartet.
Die bedingte Freigabe fuer den neuen Gesamtversuch bleibt **ungenutzt**;
ein Start setzt weiterhin500/500PASS mit unabhaengigem Review voraus.
Neue gespeicherte Ausgaben fehlen, weil kein neuer Lauf erfolgte: deren
Ergebniskategorien sind hier nicht anwendbar. Der alte Vollauf-FAIL und seine
1500fehlenden Sollpositionen bleiben eigene historische Belege.

- [Alle500 Einzelergebnisse und162 Fehler](belege/w15-processing-20261027/MOCK_BINDINGS_20261028_ALL500.SAFE.json).
- [Zusammenfassung](belege/w15-processing-20261027/MOCK_BINDINGS_20261028_SUMMARY.SAFE.json).
- [Unabhaengiger inhaltlicher Review](belege/w15-processing-20261027/MOCK_BINDINGS_20261028_REVIEW.SAFE.json).
- [Unabhaengige Originalerhaltung](belege/w15-processing-20261027/MOCK_BINDINGS_20261028_SOURCE_PRESERVATION.SAFE.json).

PR969/971/972 bleiben ungemergt. Kein lokaler Mock500-PASS und kein
Productionnachweis; keine Production-, Modell-, Hetzner- oder bezahlten Ressourcenaktionen.
