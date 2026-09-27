# 500 Profil-Feldbelege (Bundestag/Berlin/Brandenburg) — 27.09.2026

**Status:** Technische Offline-Zusammenstellung der Feldbelege fuer exakt 500
Zielprofile. **Keine fachliche Freigabe, kein Importmanifest, keine Production-
Aktion und kein 500er Nachweis.** Alle 500 Datensaetze sind `aktiv: false` und
`importfreigegeben: false`.
Die 335 zuvor offenen Parteifelder sind ueber die von Sol gepruefte, versionierte
Ergaenzungsquittung an URL UND Quellhash gebunden: 261 Parteien sind belegt
(424 Parteibelege gesamt inkl. der 163 vorab belegten), 74 bleiben ausdruecklich
offen, 2 sind amtlich parteilos.
Belegte sonstige Gremien des Bundestages (Beirat, Unterausschuss, Kommission,
Kontrollgremium, Wahlausschuss, Rechnungspruefung) stehen nicht mehr in den
staendigen Ausschuessen, sondern als `weitereGremien` UND rollengetreu in
`funktionen`; vier Brandenburg-Mandate sind ueber eine versionierte lokale
Quittung als Landesliste belegt. 19 zuvor offene fachliche Achsen sind ueber die
gepruefte Ressortquittung mit ausdruecklichen amtlich abgeleiteten Ressortthemen
geschlossen (9 Bund / 4 Berlin / 6 Brandenburg); 6 weitere ueber die gepruefte
Aufgabenquittung mit personengebundenen amtlichen Aufgabenbereichen
(Beauftragtenaufgaben + explizite BMAS-Abteilungen) sowie zwei beratende Ausschussachsen. 27 Achsen bleiben offen;
470 Profile sind technisch importierbar.

## Artefakte

| Datei | Rolle |
|---|---|
| [`scripts/profil-feldbelege-500.py`](../../scripts/profil-feldbelege-500.py) | reproduzierbarer Offline-Assembler (Python-Standardbibliothek und vorhandener Node-Resolver) |
| [`docs/betrieb/500-profilfeldbelege-20260927.json`](500-profilfeldbelege-20260927.json) | erzeugte Feldbelege (500 Datensaetze) |
| [`docs/betrieb/parteifeldpruefung-335-20260927.json`](parteifeldpruefung-335-20260927.json) | versionierte, gepruefte Ergaenzungsquittung der 335 zuvor offenen Parteifelder |
| [`docs/betrieb/brandenburg-mandatsarten-20260927.json`](brandenburg-mandatsarten-20260927.json) | versionierte lokale Mandatsartenquittung (Landesliste) fuer vier Brandenburg-Profile; keine Importfreigabe |
| [`docs/betrieb/profilrollen-54-20260927.json`](profilrollen-54-20260927.json) | vom Orchestrator gepruefte Rollenquittung der 54 fachlich offenen Profile (48 Rollen belegt, 6 offen); keine Importfreigabe |
| [`docs/betrieb/ressortachsen-19-20260927.json`](ressortachsen-19-20260927.json) | vom Orchestrator gepruefte Ressortquittung: 19 zuvor offene Fachachsen aus amtlich belegtem aktuellem Ressort geschlossen; keine Importfreigabe |
| [`docs/betrieb/aufgabenachsen-6-20260927.json`](aufgabenachsen-6-20260927.json) | vom Orchestrator gepruefte Aufgabenquittung: 6 zuvor offene Fachachsen aus personengebundenen amtlichen Aufgabenbereichen geschlossen; keine Importfreigabe |
| [`scripts/profil-gremien-resolver.js`](../../scripts/profil-gremien-resolver.js) | Node-Helfer, der den vorhandenen Ausschuss-Resolver (`lib/helmut/profile-readiness.js`) fuer den Assembler befragt — keine zweite Sollmenge |
| [`scripts/profil-feldbelege-500-aufgaben.py`](../../scripts/profil-feldbelege-500-aufgaben.py) | getrenntes, fail-closed Pruefmodul der 6 Aufgabenachsen (haelt den Assembler schlank) |
| [`scripts/profil-feldbelege-500-test.js`](../../scripts/profil-feldbelege-500-test.js) | gezielter Offline-Test (kein Netz, keine DB, kein Modell) |
| [`scripts/profil-feldbelege-500-unit.py`](../../scripts/profil-feldbelege-500-unit.py) | gezielte Gegenproben (Quelldrift, Fraktion-keine-Partei, Gremienrollen, unbekannter Ausschuss, Mandatsartenquittung, offen-bleibt-offen) |

Aufruf: `python3 scripts/profil-feldbelege-500.py`
Test: `node scripts/lokal.js -- node scripts/profil-feldbelege-500-test.js`

## Eingang und Bindung

Eingang ist ausschliesslich die bereits vorab festgelegte kanonische
[`500-namensauswahl-20260927.json`](500-namensauswahl-20260927.json), die
oeffentlichen Abrufe `bundestagsprofile-330-abruf.json` (330) und
`landesprofile-170-abruf.json` (120 Berlin + 50 Brandenburg), deren
amtliche Detailseiten-HTML sowie die vorhandenen `*-extraktion.json`.
Die Detailseiten/Abrufe/Extraktionen liegen als lokale Arbeitsdateien unter
`/private/tmp/helmut-be-bb-start`; die Belegdatei bindet sie ueber URL und Quellhash.
Alte 200er-Daten und nicht ausgewaehlte Kandidaten werden nicht verwendet.

Belegte Bindung (vom Assembler erzwungen, nicht behauptet):

* 500 von 500 URLs und Quellhashes stimmen mit der gespeicherten Original-HTML
  ueberein (sha256 und Bytegroesse); Abruf und Extraktion tragen denselben Hash.
* 500 eindeutige Kennungen, URLs und Quellhashes; keine doppelten Vollnamen.
* `Schmidt, Jan Wenzel` (`schmidt_jan-1047146`, AfD-Parteieintritt belegt) ist
  **nicht** in der Zielauswahl; das Ersatzprofil `Preisendanz, Dr. David` ist
  enthalten. Die gesamte Auswahl wurde ohne personenbezogene Pflichtplaetze neu berechnet.
  Dadurch ersetzt Omid Nouripour zusaetzlich Ruppert Stuewe;330/120/50 bleiben.
  Je Gruppe ein Platz, danach groesste Reste ueber verbleibende Kandidaten,
  Gleichstand und Auswahl nach amtlicher Kennung. Keine Nachrichtenauswertung.

## Normalisierung (Regeln des Assemblers)

* `mandatsId` stabil aus Parlament + amtlicherKennung, nach dem ID-Muster von
  [`lib/helmut/profil-import.js`](../../lib/helmut/profil-import.js).
* Profilname exakt die amtliche h1.
* Bundestag: Bundesland aus der amtlichen Mandatsachse. `DIREKT` nur bei
  `Wahlkreismandat`; eine `Wahlkreiskandidatur` wird **nie** Direktmandat und
  bleibt als belegte Angabe erhalten. Landesliste = `listenmandat` + `regionHinweis`.
* Gremienrollen ordentlich/stellvertretend getrennt; beratende Rollen sind keine
  ordentliche Mitgliedschaft. Vorhandene Funktionen werden als belegte Strings gefuehrt.
* Belegte **sonstige Gremien** stehen nicht in den staendigen Ausschussfeldern: sie
  werden als `weitereGremien` UND rollengetreu in `funktionen` gefuehrt. Herausgeloest
  wird nur, was eine explizite Liste mit amtlicher JSON-LD-URL belegt
  (`ProfilePage.mainEntity.memberOf` mit Original-Rolle und Original-URL). Ob ein Name
  ein staendiger Ausschuss ist, entscheidet ausschliesslich der vorhandene Produktcode
  `lib/helmut/profile-readiness.resolveBundestagsausschuss` — ueber einen Node-Helfer,
  nicht ueber eine zweite Liste im Assembler. Unbekannte echte Ausschuesse bleiben
  gesperrt.
* Vier bislang offene Brandenburg-Mandatsarten sind ueber
  [`brandenburg-mandatsarten-20260927.json`](brandenburg-mandatsarten-20260927.json)
  als **Landesliste** belegt (amtliche Uebersicht, URL + Hash + Abrufzeit). Uebernommen
  werden NUR Mandatsart und Region Brandenburg — die irrefuehrende Listenbeschriftung
  (WfB-Gruppe/fraktionslos) und der Listenplatz 0 werden **nicht** uebernommen.
* Partei: Berlin aus der amtlichen h1; Brandenburg aus
  [`brandenburg-parteipruefung-20260927.json`](brandenburg-parteipruefung-20260927.json)
  nur bei **gleicher URL UND identischem Quellhash**; Bundestag **nicht** aus
  `PoliticalParty`/Fraktion abgeleitet. Bislang offene Parteifelder werden
  ausschliesslich aus der geprueften Ergaenzungsquittung ergaenzt (siehe unten);
  `status: offen` bleibt offen, und das Belegzitat muss woertlich in der
  amtlichen HTML stehen (Bundestag ausserhalb des Fraktionskopfs).
* Jeder Datensatz traegt `kanonischeKennung`, Quelle (URL/Abrufzeit/Hash), die
  vorhandenen oeffentlichen Mandatsfelder (`mandatsnachweis`), `feldbelege`,
  `offenePunkte` und `offeneFelder`.
* Keine privaten Angaben, keine Biografien, keine erfundenen Positionen, Themen
  oder Rollen. Leere fachliche Achsen und ungeklaerte Parteien bleiben sichtbar offen.

Ergaenzung mit Nachweis: 12 Landtagsmandate, die die vorhandene Extraktion nicht
erfasst hatte, stammen aus einer **woertlich belegten** Angabe im amtlichen
Profilkopf (6 Berlin aus `dl.b-delegate-facts`, u. a. „nachgerueckt ueber
Landesliste“; 6 Brandenburg aus „gewaehlt als Direktkandidat(in) im Wahlkreis NN
(…)“). Die Rohangabe steht je Datensatz in `mandatsartBelegt` und in den
`feldbelege`. Ohne ausdrueckliche Angabe bleibt die Mandatsart offen.

Andre von Ossowski ist im amtlichen Profilkopf ausdruecklich als **parteilos**
bezeichnet. Dieser vorhandene, hashgebundene Beleg schliesst einen der vier
bislang offenen Brandenburger Parteifaelle; die fruehere Flash-Teilpruefung
bleibt als historischer Lauf unveraendert. Keine Ableitung aus Fraktionslosigkeit.

## Bilanz 500 (aus dem Beleg-JSON)

| Parlament | Datensaetze | Partei belegt | Partei offen | fachliche Achse offen | Mandatsart offen |
|---|---:|---:|---:|---:|---:|
| Bundestag | 330 | 259 | 71 | 24 | 0 |
| Landtag Berlin | 120 | 119 | 1 | 1 | 3 |
| Landtag Brandenburg | 50 | 46 (+2 parteilos) | 2 | 2 | 0 |
| **Gesamt** | **500** | **424 (+2 parteilos)** | **74** | **27** | **3** |

Mathematik der Parteibilanz: 424 belegt + 2 parteilos + 74 offen = 500. Die
Parteiaenderung laesst die uebrigen Achsen unveraendert. Die Gremien-Trennung und
die Brandenburger Mandatsartenquittung verschieben zwei Achsen ehrlich:
fachliche Achse offen 50 -> 54 (vier Bundestagsprofile verlieren eine
Scheinausschussachse), Mandatsart offen 7 -> 3 (vier Brandenburg-Mandate belegt).
Die gepruefte Ressortquittung schliesst 19 dieser 54 Achsen ueber ein amtlich
abgeleitetes Ressortthema und die gepruefte Aufgabenquittung 6 weitere ueber einen
personengebundenen amtlichen Aufgabenbereich. Zwei beratende Ausschussachsen schliessen
weitere Themenluecken: fachliche Achse offen 54 -> 27.
Technischer Importvertrag: 470 akzeptiert / 30 offen.

Die fachliche Achse gilt nur dann als offen, wenn WEDER eine ordentliche NOCH eine
stellvertretende belegte Ausschusszuordnung vorliegt. 22 Bundestagsprofile tragen
ausschliesslich amtlich belegte stellvertretende Mitgliedschaften; sie zaehlen
damit zur fachlichen Achse (72 -> 50 offen vor der Gremien-Trennung). Die
Mitgliedschaftsart bleibt dabei getrennt: eine Stellvertretung wird nicht zu einer
ordentlichen Mitgliedschaft und erfindet keine Themen.

Weitere offene Felder: `wahlbezirk` 1 (Berlin: Wahlkreisnummer ohne Bezirksnamen),
`regionbezug` 28 (Brandenburg: nur grober regionaler Bezug),
`weitereGremien` 137 (23 Brandenburg + 114 Bundestag: belegte Gremien, die nicht als
staendige Ausschussmitgliedschaft gefuehrt werden — die Gremien selbst sind belegt,
nicht offen; der Punkt benennt nur, dass keine Ausschussachse daraus wird).

Offene Mandatsart (3): Berlin — Johannes Martin, Claudia Engelmann, Benedikt Lux.
Die vier Brandenburger Mandate Melanie Matzies (40624), Reinhard Simon (40627),
André von Ossowski (40630) und Oliver Skopec (40629) sind jetzt als Landesliste
belegt (siehe unten).

## Gremien-Trennung (staendige Ausschuesse vs. sonstige Gremien)

Die vorhandene Extraktion hatte Mitgliedschaften in sonstigen Bundestagsgremien in
die staendigen Ausschussfelder gelegt. Der vorhandene Resolver
`resolveBundestagsausschuss` weist diese Namen korrekt ab (`nicht in der Sollmenge`).
Der Assembler loest sie deshalb heraus:

* **114 Bundestagsprofile** mit **141 Mitgliedschaften** in genau **15** sonstigen
  Gremien: Parlamentarischer Beirat fuer nachhaltige Entwicklung und Zukunftsfragen,
  Wahlausschuss, Enquete-Kommission „Corona“, Gremium gemaess Artikel 13 Absatz 6 GG,
  Parlamentarisches Kontrollgremium (PKGr), Unterausschuss Internationale Ordnung /
  Krisenpraevention / Ruestungs- und Proliferationskontrolle / Europarecht /
  Auswaertige Kultur- und Bildungspolitik / zu Fragen der Europaeischen Union,
  Rechnungspruefungsausschuss, Bundesfinanzierungsgremium, Vertrauensgremium,
  Kinderkommission.
* Jede Herausloesung ist amtlich belegt: derselbe Name MIT derselben amtlichen URL und
  genau der passenden Rolle (`Ordentliches Mitglied` bzw. `Stellvertretendes Mitglied`)
  im JSON-LD der Original-HTML. Stimmt Name, URL oder Rolle nicht, bricht der Lauf
  fail closed ab.
* Die Mitgliedschaft bleibt vollstaendig erhalten: Name in `weitereGremien`, Rolle
  rollengetreu in `funktionen` (`<Rolle>: <Gremium>`), Beleg je Datensatz in
  `weitereGremienBeleg`. Keine Rollenaenderung, kein Themenersatz, kein Wegwerfen.
* **Vier Profile** (Hasselmann, Bilger, Hoffmann, Miersch) hatten als einzige
  “Achse” den Wahlausschuss. Sie verlieren eine Scheinausschussachse und stehen
  deshalb wieder sichtbar offen (`fachlicheAchse` 50 -> 54).
* **Unbekannte echte Ausschuesse bleiben gesperrt:** Namen ausserhalb der expliziten
  Liste werden nicht umgedeutet; der Resolver meldet sie weiter als ungueltig.

## Brandenburger Mandatsartenquittung (vier Landeslisten)

[`brandenburg-mandatsarten-20260927.json`](brandenburg-mandatsarten-20260927.json)
bindet die amtliche Abgeordnetenuebersicht des Landtags Brandenburg
(`.../abgeordnete_im_ueberblick/25777`) an Abrufzeit, Bytezahl und sha256
`5c151150…7988d`. Der Assembler prueft je Kennung den **identischen Profillink** und
das woertliche Wort `Landesliste` in der Tabellenzeile der Original-HTML; weicht
Link, Zeile oder Hash ab, bricht der Lauf fail closed ab.

Uebernommen werden ausschliesslich Mandatsart `Landesliste` und die Region
Brandenburg (`regionHinweis: "Brandenburg — Landesliste"`). Die Listenbeschriftung
der Uebersicht (WfB-Gruppe/fraktionslos) und der Listenplatz 0 werden **nicht**
uebernommen — keine Partei-, Wahllisten- oder Listenplatz-Ableitung. Die Quittung
ist lokal und **keine Importfreigabe**; alle vier Datensaetze bleiben
`aktiv: false` / `importfreigegeben: false`.

## Readiness-Bilanz (echter Produktcode, nicht geschaetzt)

Geprueft mit `zuHelmutProfil` (`lib/helmut/profil-import.js`) und
`bewerteBundestagsprofil` (`lib/helmut/profile-readiness.js`) fuer alle 330
Bundestagsprofile:

| Zustand | vor der Gremien-Trennung | danach (mit Ressort-, Aufgaben- und beratender Quittung) |
|---|---:|---:|
| bereit | 179 | **306** |
| nicht bereit | 151 | **24** |
| davon ungueltiger Ausschuss | 141 Eintraege (114 Profile) | **0** |
| davon offene fachliche Achse | 37 | 24 |
| davon Partei/Fraktions-Widerspruch | 1 | 0 (Prueffehler behoben) |

Die 110 zusaetzlich bereiten Profile entstehen allein dadurch, dass falsche
Ausschussangaben verschwinden; vier Profile werden dafuer ehrlich wieder offen.
Die gepruefte Ressortquittung schliesst zusaetzlich neun, die gepruefte
Aufgabenquittung sechs und die beratende Quittung zwei Bundestagsachsen, daher 289 -> 306 bereit. Kein Resolver,
keine Schwelle und kein Produktcode wurde geaendert.

## Importpruefung (echter Importvertrag)

Geprueft mit `pruefeImport`/`pruefeProfil` aus `lib/helmut/profil-import.js`,
rein lokal, **ohne DB- oder Netzwerkzugriff**:

```
Profile: 500 · gültig: 470 · ungültig: 30
Nach Parlament: bundestag=330 · landtag-berlin=120 · landtag-brandenburg=50
Alle Datensaetze sind inaktiv: ja
Globale Fehler: 0 · Warnungen: 0
Fehlercodes: schwerpunkt-fehlt 27 · region-fehlt 3
gültig je Parlament: Bundestag 306/330 · Berlin 116/120 · Brandenburg 48/50
ERGEBNIS: NICHT importierbar (nur wegen der offen ausgewiesenen Felder)
```

Das technische Ergebnis ist **keine** fachliche Freigabe. Nach der Gremien-Trennung
und der Mandatsarten-/Ressort-/Aufgaben-/beratenden Quittung sind 470 Profile ohne offene
Achse/Mandatsart technisch importierbar; 30 bleiben es bewusst nicht, bis die offenen
Felder fachlich belegt sind. Die 27 geschlossenen Achsen schliessen die fachliche Freigabe NICHT:
alle 500 bleiben `importfreigegeben: false` (74 Parteifelder und alle fachlich
offenen Achsen bestehen weiter).

## Reproduzierbarkeit

Der Test erzeugt die Belegdatei mit fixiertem `erstelltAm` erneut und vergleicht
byteweise: **byte-identisch**. Zusaetzliche synthetische Gegenproben gegen die
Parteifeldquittung: belegte Partei bleibt bei Fraktionslosigkeit erhalten; eine
abweichende Berliner h1/Extraktions-Partei wird gesperrt; Fraktionsangabe wird
**nicht** zur Partei; ohne Quittung bleibt ein offenes Bundestags-Parteifeld
fail-closed; Quelldrift (sha256/URL), Fremdkennung, doppelte Kennung,
unerwarteter Status und eine Belegt-ohne-Wert-Quittung werden gesperrt;
`status: offen` bleibt offen; ein nicht woertlich belegtes Zitat wird gesperrt.
Fuer Omid Nouripour wird zusaetzlich geprueft, dass das kurze Zitat
„Bündnis 90/Die Grünen“ im ausdruecklichen Abschnitt „Mitgliedschaften und
Ehrenämter“ steht und nicht aus dem Fraktionskopf stammt.

Gezielte Gegenproben der Gremien-Trennung und der Mandatsartenquittung: eine
ordentliche UND eine stellvertretende Mitgliedschaft in einem sonstigen Gremium
bleiben rollengetreu in `funktionen` und stehen **nicht** in den Ausschussfeldern;
ein unbekannter Ausschuss bleibt unveraendert in den Ausschussfeldern und damit
gesperrt; eine abweichende amtliche JSON-LD-URL, ein falscher Brandenburger
Profillink, eine Fremdkennung, ein abweichender Hash und ein fehlendes Wort
`Landesliste` sperren den Lauf fail closed; eine leere fachliche Achse bleibt offen.
Gezielte Gegenproben der Ressortquittung: fehlende Quittung, falsche Bilanz,
Duplikat, Fremdkennung, Kennung ausserhalb der 54er Rollenquittung, Quelldrift
(Hash/URL/Datei), Rollenquellen-Drift, Region/Parlament-Konflikt, ein nicht
woertliches bzw. fremdes Person/Zitat, ein Ressort ausserhalb des Zitats, ein
abweichendes Themenmuster und eine Kanzler-/Vorsitzrolle sperren den Lauf fail
closed. Fuer alle 19 Profile wird geprueft, dass der echte Pfad
`zuHelmutProfil -> toMandateProfileRow -> fromMandateProfileRow` die Ressortthemen und den separaten Ableitungshinweis in `funktionen` verlustfrei erhaelt und `aktiv: false` bleibt.
Ergebnis des gezielten Tests:

```
PASS: 500 Feldbelege, 330/120/50, Hashbindung, AfD-Sperre, offene Felder,
echter Importvertrag (470 technisch importierbar, 30 offen), Gremien-Trennung
(141 Mitgliedschaften in 15 sonstigen Gremien rollengetreu erhalten, 4
Scheinausschussachsen offen), Mandatsartenquittung (4 Brandenburg-Landeslisten),
Rollenquittung (48 Amtsrollen, 6 offen), Ressortquittung (19 Fachachsen: 9 Bund/4
Berlin/6 Brandenburg; Themen und Herkunftshinweis verlustfrei), Aufgabenquittung
(6 personengebundene Aufgabenachsen: Beauftragtenaufgaben + BMAS-Abteilungen, 14
Themenbegriffe und Herkunftshinweise verlustfrei, Mast disjunkt zu Griese),
beratende Quittung (2 Profile, 4 Themen, 27 Achsen offen), Bundestags-Readiness (306/330 bereit), Reproduzierbarkeit:
byte-identisch neu erzeugt
```

## Ausfuehrung und Grenzen

Flash High hat den lokalen Assembler und die Feldbilanz erstellt; anschliessend
hat Sol die Auswahl neutral neu berechnet, die Abbildung geprueft und die
Parteierhaltung bei Fraktionslosigkeit korrigiert. Flash-Lauf erfolgreich,
0,087628USD, keine offenen Reservierungen. Zwei amtliche Ersatzseiten frisch
abgerufen. Keine Production-Datenaenderung, Aktivierung oder500er Test.
Production-Nurlesebeleg13:51:49UTC:500/0,
Profilhash `198f25ff81cf5ee4ad2645c1881a8191`.

## Parteifeld-Ergaenzung (gepruefte Quittung)

`docs/betrieb/parteifeldpruefung-335-20260927.json` ist die von Sol gepruefte,
versionierte Ergaenzungsquittung zu den 335 zuvor offenen Parteifeldern
(330 Bundestag + 2 Berlin + 3 Brandenburg). Massgeblich sind die obersten
geprueften Statusfelder; das Feld `vorschlag` bleibt als Audit unveraendert und
wird **nicht** ausgewertet.

Der Assembler bindet jede Kennung an die amtliche Quell-URL UND den Quellhash der
Detailseite. Nur `status: belegt` oder `status: parteilos` wird uebernommen;
`status: offen` bleibt offen. Fehlende Kennung, doppelte Kennung, Kennung
ausserhalb der 500 Zielprofile, abweichende URL/Hash (Quelldrift), unerwarteter
Status und Konflikt (Feld war bereits belegt/parteilos) brechen den Lauf
fail-closed ab. Ein Belegt-Eintrag muss sein Belegzitat woertlich in der amtlichen
HTML tragen; fuer den Bundestag wird der Fraktionskopf (Absatz
`m-biography__introInfo`) ausgeschlossen, damit das Zitat aus der Biografie stammt
und nicht aus der Fraktion. Es werden keine zusaetzlichen Personen- oder privaten
Daten kopiert; die Quittung enthaelt nur oeffentliche, amtlich belegte Aussagen.

Ergebnis: 261 belegt, 74 offen; mit den 163 vorab belegten Parteien 424 belegt,
2 parteilos, 74 offen. Der Importvertrag meldet fuer zwei uebernommene Parteien
(SSW im Bundestag, BSW in Berlin) die Warnung `fraktionslos-widerspruch`
(Partei ohne Fraktionsstatus) — keine Fehler, kein Aktivieren.
Die Integration und die gezielten Tests liefen ausschliesslich lokal/offline:
kein bezahlter Modellaufruf, keine Production-Aktion, keine DB-Aenderung.

## Offene Probleme / naechster Schritt

1. **Parteifelder sind geprueft.** Alle 335 zuvor offenen Parteifelder sind ueber
   die versionierte Ergaenzungsquittung an URL UND Quellhash gebunden; 424 sind
   belegt, 2 parteilos, 74 bleiben offen. Bundestagspartei wird weiterhin **nicht**
   aus `PoliticalParty`/Fraktion abgeleitet.
2. **27 Profile ohne belegte fachliche Achse** (24 Bundestag, 1 Berlin,
   2 Brandenburg) — weder ordentlicher noch stellvertretender Ausschuss noch
   belegtes Thema; nicht durch Themen erfinden schliessen. 19 der urspruenglich 54
   Achsen sind ueber die gepruefte Ressortquittung mit ausdruecklichen amtlich
   abgeleiteten Ressortthemen belegt (siehe unten). Die vier Bundestagsfaelle, die nur eine
   Scheinausschussachse (Wahlausschuss) hatten, sind teils ueber das Ressort
   geschlossen (Bilger), teils offen. 22 Bundestagsprofile sind ueber
   ausschliesslich stellvertretende Mitgliedschaften abgedeckt (Mitgliedschaftsart
   getrennt, keine Befoerderung zu ordentlich).
3. **3 Berliner Profile ohne belegte Mandatsart** und **1 Berliner Wahlkreis ohne
   Bezirksnamen**. Die vier Brandenburger Mandate sind als Landesliste belegt.
4. **28 Brandenburger Listenmandate** mit nur grobem regionalem Bezug.
5. **137 Datensaetze mit belegten sonstigen Gremien** (23 Brandenburg + 114
   Bundestag): belegt, aber bewusst **nicht** als staendige Ausschussmitgliedschaft
   gefuehrt; die Gremien und Rollen stehen in `weitereGremien` / `funktionen`.

Naechster Schritt bleibt die fachliche Einzelbelegung dieser offenen Felder in
einem eigenen Sprint. Aktivierung und 500er Test bleiben gesperrt und brauchen
weiterhin ein eigenes Betreiber-GO.

## Freigabe

Keine Freigabe erforderlich (rein lokal/offline). Aktivierung und 500er Test sind
ausdruecklich **nicht** Teil dieser Aufgabe.

## Gezielte Integrationskorrektur: Stellvertretungen

Der echte Pfad Import → Storage → Vollstaendigkeit/Readiness → Paketzuordnung
und Scheduler beruecksichtigt belegte Stellvertretungen als eigene fachliche
Achse. Ordentliche Mitgliedschaften haben beim Quellenfallback Vorrang; Rollen
bleiben getrennt. Der gezielte Integrationstest besteht35/35, einschliesslich
leerer/alter Ausschuesse und Rollenkonflikt. Der500er Beleg wurde byte-identisch
reproduziert;443 technisch akzeptiert/57 offen sind keine fachliche Freigabe.

PR657 wurde als `eaa67c7be21f60f7f7dd52a8baea8a64e843904d` gemergt;
Vercel `dpl_DtDq9zqDgMBTfsfCfMjb8QLtqKC4` READY. Rein lesende Nachkontrolle
am27.09.14:27:21UTC:500 Profile/0 aktiv, Hash
`198f25ff81cf5ee4ad2645c1881a8191`; keine error/fatal-Logs im geprueften
Fenster14:26:45–14:27:22UTC. Die Stellvertretungs-Codekorrektur folgt separat.

Die Sol-Pruefung hat sieben zu weitgehende Flash-Vorschlaege offengelassen
(Engagement, historische Parteiaemter oder fachliche Kommission allein reichen
nicht). Acht Belegzitate wurden praezisiert. Bundestagszitate werden technisch
im Biografieblock geprueft; Nouripours Parteieintrag ausschliesslich unter
Mitgliedschaften und Ehrenaemter. Quelle/Hash/Kennung bleiben gebunden.
Auch der Status parteilos benoetigt ein woertliches ausdrueckliches Quellenzitat.

## Gezielte Korrektur: Gremien-Trennung und Brandenburger Mandatsarten

Diese Korrektur ist rein lokal/offline und betrifft nur den Assembler, das Dossier
und die gezielten Tests. **Produktcode, Resolver und Schwellen bleiben unveraendert:**
ueber die Sollmenge der staendigen Ausschuesse entscheidet weiterhin ausschliesslich
`lib/helmut/profile-readiness.resolveBundestagsausschuss`, hier befragt ueber den
Node-Helfer `scripts/profil-gremien-resolver.js`.

Geaendert wurde nur die Abbildung:

1. **15 belegte sonstige Gremien** mit **141 Mitgliedschaften** in **114**
   Bundestagsprofilen stehen nicht mehr in `ausschuesse`/`stellvertretendeAusschuesse`.
   Sie bleiben vollstaendig erhalten: Name in `weitereGremien`, Original-Rolle in
   `funktionen`, amtliche URL + Rolle je Datensatz in `weitereGremienBeleg`.
   Herausgeloest wird nur, was die explizite Liste UND das amtliche JSON-LD
   (Name + URL + passende Rolle) belegen; unbekannte echte Ausschuesse bleiben
   gesperrt. **Vier Profile** (Hasselmann, Bilger, Hoffmann, Miersch) verlieren
   dadurch eine Scheinausschussachse und bleiben sichtbar offen.
2. **Vier Brandenburg-Mandate** (40624 Matzies, 40627 Simon, 40630 von Ossowski,
   40629 Skopec) sind ueber die versionierte lokale Quittung
   [`brandenburg-mandatsarten-20260927.json`](brandenburg-mandatsarten-20260927.json)
   als **Landesliste** belegt (identischer Profillink + Wort `Landesliste` in der
   amtlichen Uebersicht, an URL/Hash/Abrufzeit gebunden). Uebernommen werden nur
   Mandatsart und Region Brandenburg — nicht WfB-Gruppe/fraktionslos und nicht
   Listenplatz 0. Die Quittung ist **keine Importfreigabe**.
3. **Bilanz:** Parteistatus unveraendert 424 belegt / 2 parteilos / 74 offen; alle
   500 bleiben `aktiv: false` / `importfreigegeben: false`. Fachliche Achse offen
   50 -> 54, Mandatsart offen 7 -> 3; echter Importvertrag 444 -> 443 akzeptiert.
   Bundestags-Readiness (echter Produktcode): 179 -> 289 bereit, 151 -> 41 nicht
   bereit, kein ungueltiger Ausschuss mehr.

Kein Netz, keine DB, keine Production-Aktion, kein Modellaufruf, kein Commit und
kein Import. Aktivierung und 500er Test bleiben gesperrt.

## Folgepruefung vom 27.09.2026

Der echte Bundestags-Readinesslauf meldet bei Stefan Seidler (SSW, fraktionslos)
einen Partei-/Fraktionswiderspruch. Das ist ein zu korrigierender Prueffehler:
Fraktionslosigkeit schliesst eine Parteimitgliedschaft nicht aus. Seine fehlende
fachliche Achse bleibt davon unabhaengig offen; keine Umdeklaration der Partei.

**Lokal korrigiert (27.09.2026).** Der Prueffehler ist im Produktcode behoben:
`lib/helmut/profile-readiness.js` wertet ausdrueckliche Fraktionslosigkeit nicht
mehr als Partei-/Fraktionswiderspruch (allgemeine Regel, keine SSW-Sonderregel;
exakte Fraktionsangabe „Fraktionslos", kein Teilstring-Treffer und keine
Umgehung durch ein daneben gesetztes `fraktionslos`-Flag). Seidlers fehlende fachliche Achse bleibt offen, die
Bilanz 289/330 bleibt daher unveraendert. Keine Partei umgedeutet, kein Rohdossier
und kein Parteibeleg geaendert.

Der frisch abgerufene amtliche [MdB-Stammdatensatz](https://www.bundestag.de/resource/blob/472878/MdB-Stammdaten.zip)
hat Stand 29.04.2026 (Abruf 27.09.2026, SHA256
`29ae4ba1f5d8b50915a164ce929453b615bb88874ee78e4240f6288268bde460`).
Ein gezielter Flash-High-Leselauf fand fuer 70 der 71 offenen Bundestags-Parteifelder
einen datierten Parteibeleg mit passendem Namen, XML-ID und offenem WP21-Mandat.
Diese April-Angaben werden nicht als September-Bestaetigung importiert. Knodels
XML-Wert `Plos` bleibt ohne eindeutige Begriffsdefinition offen. Die 74 offenen
aktuellen Parteifelder werden hierdurch nicht reduziert. Lokale Gegenpruefung:
`/private/tmp/helmut-xml-parteipruefung-ergebnis.json`.

## Rollenquittung der 54 fachlich offenen Profile

[`profilrollen-54-20260927.json`](profilrollen-54-20260927.json) ist die vom
Orchestrator gepruefte, versionierte Rollenquittung fuer die 54 Profile ohne
belegte fachliche Achse (48 Regierungs-/Amtsrollen belegt, 6 offen). Der
Assembler bindet jede Kennung an die amtliche Quell-URL UND den Quellhash der
Detailseite und uebernimmt ausschliesslich die dort freigegebenen
`wortlaut`-Strings — **dedupliziert an bestehende `profil.funktionen`
angehaengt; bestehende Gremienrollen bleiben erhalten.**

Fail closed geprueft: unbekannter Status, offener Eintrag mit Rolle, belegter
Eintrag ohne Rolle, fehlende/doppelte Kennung, Fremdkennung ausserhalb der 500
Zielprofile, Quelldrift (URL/Hash), fehlender Abschnitt, ein `wortlaut`, der
nicht durch das `zitat` gedeckt ist, und ein Zitat, das nicht woertlich im
personengebundenen amtlichen Abschnitt steht. Der Bundestag belegt `Funktion`
nur im `m-biography__function`-Block und `Biografie` nur im eigenen
Biografiebereich; Navigation, Intro-/Fraktionskopf und JSON-LD gelten NICHT als
Beleg. Berliner/Brandenburger Rollen sind auf den jeweiligen
personengebundenen Abschnitt begrenzt.

**Kein `regierungsrolle`-Schema, keine Themen, Schwerpunkte, Positionen oder
Ausschussmitgliedschaften aus der Rolle abgeleitet.** Die Rolle selbst ist eine
Amtsrolle, keine fachliche Achse: die 54 Fachachsen waren damit weiter offen. Die
spaeter ergaenzten, separat geprueften Ressort- (19) und Aufgabenquittungen (6) sowie beratenden Quittungen (2)
schliessen 27 davon ueber ein amtlich abgeleitetes Thema (siehe unten), daher
bleiben jetzt **27 Fachachsen offen** und der technische Importvertrag steht bei
**470 akzeptiert / 30 offen**.
Alle 500 bleiben `aktiv: false` / `importfreigegeben: false`. Je Datensatz steht der Rollenbeleg in
`profilrollenQuittung` (Datei, URL, sha256, Status, Zitat und Abschnitt).
Assembler und Belegdatei wurden deterministisch neu erzeugt (byte-identisch).

Die Integration und die gezielten Tests liefen ausschliesslich lokal/offline:
kein Netz, keine DB und keine Production-Modellaufrufe in den Tests. Lokale
Umsetzung durch DeepSeek Flash High, eigene Pruefung und zwei Schutzkorrekturen
durch den Orchestrator: auch offene Quittungen an URL/Hash binden; Bundestags-
Zitate exakt auf den geschlossenen Personenblock begrenzen. Keine Aktivierung
und keine Importfreigabe.

Zusaetzliche amtliche Quellen fuer Amthor, Hasselmann und Miersch sind separat
gesichert und geprueft: `/private/tmp/helmut-rollen-zusatz3-geprueft.json`.
Sie klaeren die aktuellen Rollen, sind aber noch nicht in die eingefrorene
48er-Quittung oder den Assembler integriert. Keine Themenfreigabe daraus.
Der naechste Schritt kann diese drei Nachweise nutzen, ohne die54er Recherche
zu wiederholen.

## Ressortquittung der 19 geschlossenen Fachachsen

Die gepruefte [Quittung](ressortachsen-19-20260927.json) bindet 19 Profile
(9 Bund/4 Berlin/6 Brandenburg) an aktuelle amtliche Kabinetts-/Senatslisten,
Quell-URL, Hash, Abrufzeit und ein zusammenhaengendes Personen-/Ressortzitat.
Das Ressort muss zugleich zur bereits belegten Amtsrolle derselben Person
passen. Ein Mehrpersonen-Zitat kann so kein fremdes Ressort uebertragen.
Kanzler, Ministerpraesident oder Fraktionsvorsitz allein erzeugen keine Themen.

Die 19 Profile erhalten insgesamt 39 ausdrueckliche Ressortbegriffe in `themen`.
Nur benannte Aufzaehlungen werden getrennt; `wirtschaftliche Zusammenarbeit und
Entwicklung` und `Land- und Ernaehrungswirtschaft` bleiben zusammen. Der Hinweis
`Ressortzustaendigkeit <Region> (amtlich abgeleitet): <Ressort>; keine persoenliche
politische Position` steht zusaetzlich im Funktionskontext. Die bisher belegten
Amtsrollen bleiben wortgetreu erhalten. Themen und Ableitungskennzeichnung
ueberstehen den echten Import-/Speicherweg; die Funktionsangabe erreicht auch
den bestehenden oeffentlichen Profilkontext des Modells.

Diese Trennung ist erforderlich: Der lange Herkunftshinweis als Themenwortlaut
verhinderte in allen 19 Gegenproben den exakten Themenabgleich. Jetzt greifen
alle 39 isolierten Themengegenproben nach dem Speicher-Round-Trip; ein unbelegtes
Fremdthema greift nicht. Kein Produktfilter oder Schwellenwert wurde geaendert.
Quittungs-Gegenproben weisen fremde Personen, fremde Ressorts, fehlende Hinweise,
Quelldrift und unpassende Rollen ab. Das Dossier ist byte-identisch reproduzierbar.

## Aufgabenquittung der 6 geschlossenen Fachachsen

Die gepruefte [Aufgabenquittung](aufgabenachsen-6-20260927.json) bindet 6 Profile
(alle Bundestag) an amtlich belegte, personengebundene Aufgabenbereiche. Die
fail-closed-Validierung liegt bewusst im getrennten Modul
`scripts/profil-feldbelege-500-aufgaben.py`; der Assembler wendet nur den
geprueften Index an:

* **Brand, Connemann, Pawlik:** Name UND ausdrueckliche Beauftragtenaufgabe im
  zusammenhaengenden Zitat. Themen nur innerhalb dieser Aufgabe, NICHT aus der
  allgemeinen Ministeriumszugehoerigkeit (Connemann: Digitales ist keine
  Beauftragtenaufgabe). Pawlik wird nur die enge Konjunktions-Normalisierung
  zugestanden (Quelle `zugleich`, Aufgabenbindung `sowie`), das Originalzitat
  bleibt unveraendert wortgetreu.
* **Kaiser:** bereits belegte Amtsrolle der 54er Rollenquittung plus amtliche
  Aufgaben-Seite derselben Amtsinhaberin mit ausdruecklichem Aufgabenabsatz
  (`Aufgaben der Ostbeauftragten`); nur `gleichwertige Lebensverhältnisse`, keine
  Themen aus blosser Bildunterschrift oder Navigation.
* **Griese (IV/V), Mast (II/III):** Person -> explizit genannte Abteilungsnummern
  -> deren Aufgabenabschnitt. Die roemischen Nummern sind exakt; eine Nummer ist
  nur zulaessig, wenn die Personenzeile sie ausdruecklich nennt, daher erhaelt
  Mast nie ein Griese-Thema. Getrennte echte Zitate bleiben getrennt.

Je Profil stehen der Hinweis
`Aufgabenbindung Bund (amtlich abgeleitet): <Aufgabenbindung>; keine persoenliche
politische Position` getrennt im Funktionskontext und die amtliche Zusatzquelle
(URL + sha256 + Abrufzeit + Datei + Bytezahl) in `profil.offizielleQuellen`; der
Belegblock steht in `aufgabenachsenQuittung`. Die 6 Profile erhalten insgesamt 14
ausdrueckliche Aufgabenbegriffe. Der echte Pfad `zuHelmutProfil ->
toMandateProfileRow -> fromMandateProfileRow` erhaelt Themen UND
Herkunftshinweis und bleibt `aktiv: false`; alle 14 isolierten Themengegenproben
greifen, ein unbelegtes Fremdthema greift nicht. Gegenproben weisen Quelldrift
(Hash/URL/Host/Datei), Rollenquellen-Drift, nicht woertliche Zitate, fehlende
Personen, Ministeriumszugehoerigkeit allein, fremde Themen, Themen aus
Navigation/Bildunterschrift, Abteilungsnummern ausserhalb der Personenzeile,
vollstaendig vertauschte Mast-Griese-Aufgabenpakete, falsche kanonische Personen,
falsche Bytezahlen, fremde Aufgabenabschnitte, zusammengesetzte Scheinzitate und fehlende Herkunftshinweise
fail closed ab. Kein Produktfilter oder Schwellenwert wurde geaendert.

Die 54 urspruenglich offenen Achsen bleiben vollstaendig bilanziert: 19 Ressort- und
6 Aufgaben- und 2 beratende Achsen geschlossen, 27 offen. Technischer Importvertrag:470 akzeptiert/30
offen; Bundestags-Readiness 306/330. Parteien, Mandatsarten, Auswahl und Gremien
bleiben unveraendert. Alle500 bleiben inaktiv und ohne fachliche Importfreigabe;
74 Parteifelder und3 Berliner Mandatsarten sind weiterhin offen. Die drei separat
belegten Zusatzrollen sind noch nicht integriert. Keine Production-Datenaenderung
und kein500er Test.

## Beratende Ausschussachsen: zwei Profile

Die [gepruefte Quittung](beratende-achsen-2-20260927.json) ergaenzt bei Knodel
Landwirtschaft/Ernaehrung/Heimat und bei Seidler Haushalt. Die bestehenden
beratenden Funktionen bleiben erhalten; keine ordentliche oder stellvertretende
Mitgliedschaft wird erzeugt. Die 54er Amtsrollenquittung bleibt48 belegt/6 offen.

Der getrennte Pruefer bindet die amtlichen Abrufmetadaten und Originalhashes,
eindeutige H1, die Person in genau einem ProfilePage-Block und die genaue
JSON-LD-Rolle. Die Quellen enthalten keine mainEntity.url: Name und lokale
Personenkennung #mdb werden mit der gebundenen Abrufadresse geprueft; eine
vorhandene abweichende URL, fremde Kennung, zukuenftiger Rollenbeginn oder
endDate sperrt. Die Neuerzeugung benoetigt keine implizite Zusatzdatei in /tmp.

Vier kurze Themen und getrennte Ableitungshinweise ueberstehen den echten
Import-/Speicher-Roundtrip samt positivem Themenabgleich und negativen
Fremdthemen. Nur diese zwei Datensaetze aendern sich,498 bleiben vollstaendig
unveraendert. Knodels aktuelles Parteifeld bleibt offen; keine fachliche
Importfreigabe, Production-Aenderung, Aktivierung oder500er Ausfuehrung.
