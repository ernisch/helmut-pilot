# W15 Mock-/Quellenbindungen:500 geprueft,338PASS/162FAIL

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
