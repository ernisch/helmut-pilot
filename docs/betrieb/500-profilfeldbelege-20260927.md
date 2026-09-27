# 500 Profil-Feldbelege (Bundestag/Berlin/Brandenburg) — 27.09.2026

**Status:** Technische Offline-Zusammenstellung der Feldbelege fuer exakt 500
Zielprofile. **Keine fachliche Freigabe, kein Importmanifest, keine Production-
Aktion und kein 500er Nachweis.** Alle 500 Datensaetze sind `aktiv: false` und
`importfreigegeben: false`.
Die 335 zuvor offenen Parteifelder sind ueber die von Sol gepruefte, versionierte
Ergaenzungsquittung an URL UND Quellhash gebunden: 261 Parteien sind belegt
(424 Parteibelege gesamt inkl. der 163 vorab belegten), 74 bleiben ausdruecklich
offen, 2 sind amtlich parteilos.

## Artefakte

| Datei | Rolle |
|---|---|
| [`scripts/profil-feldbelege-500.py`](../../scripts/profil-feldbelege-500.py) | reproduzierbarer Offline-Assembler (nur Python-Standardbibliothek) |
| [`docs/betrieb/500-profilfeldbelege-20260927.json`](500-profilfeldbelege-20260927.json) | erzeugte Feldbelege (500 Datensaetze) |
| [`docs/betrieb/parteifeldpruefung-335-20260927.json`](parteifeldpruefung-335-20260927.json) | versionierte, gepruefte Ergaenzungsquittung der 335 zuvor offenen Parteifelder |
| [`scripts/profil-feldbelege-500-test.js`](../../scripts/profil-feldbelege-500-test.js) | gezielter Offline-Test (kein Netz, keine DB, kein Modell) |
| [`scripts/profil-feldbelege-500-unit.py`](../../scripts/profil-feldbelege-500-unit.py) | gezielte Gegenproben (Quelldrift, Fraktion-keine-Partei, offen-bleibt-offen) |

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
| Bundestag | 330 | 259 | 71 | 37 | 0 |
| Landtag Berlin | 120 | 119 | 1 | 5 | 3 |
| Landtag Brandenburg | 50 | 46 (+2 parteilos) | 2 | 8 | 4 |
| **Gesamt** | **500** | **424 (+2 parteilos)** | **74** | **50** | **7** |

Mathematik der Parteibilanz: 424 belegt + 2 parteilos + 74 offen = 500. Die
Parteiaenderung laesst die uebrigen Achsen unveraendert: fachliche Achse offen 50,
Mandatsart offen 7, technischer Importvertrag 444 akzeptiert / 56 offen.

Die fachliche Achse gilt nur dann als offen, wenn WEDER eine ordentliche NOCH eine
stellvertretende belegte Ausschusszuordnung vorliegt. 22 Bundestagsprofile tragen
ausschliesslich amtlich belegte stellvertretende Mitgliedschaften; sie zaehlen
damit zur fachlichen Achse (72 -> 50 offen). Die Mitgliedschaftsart bleibt dabei
getrennt: eine Stellvertretung wird nicht zu einer ordentlichen Mitgliedschaft und
erfindet keine Themen.

Weitere offene Felder: `wahlbezirk` 1 (Berlin: Wahlkreisnummer ohne Bezirksnamen),
`regionbezug` 28 (Brandenburg: nur grober regionaler Bezug),
`weitereGremien` 23 (Brandenburg: Gremien, die nicht als ordentliche
Ausschussmitgliedschaft zugeordnet sind).

Offene Mandatsart (7): Berlin — Johannes Martin, Claudia Engelmann, Benedikt Lux;
Brandenburg — Melanie Matzies, Reinhard Simon, André von Ossowski, Oliver Skopec.

## Importpruefung (echter Importvertrag)

Geprueft mit `pruefeImport`/`pruefeProfil` aus `lib/helmut/profil-import.js`,
rein lokal, **ohne DB- oder Netzwerkzugriff**:

```
Profile: 500 · gültig: 444 · ungültig: 56
Nach Parlament: bundestag=330 · landtag-berlin=120 · landtag-brandenburg=50
Alle Datensaetze sind inaktiv: ja
Globale Fehler: 0 · Warnungen: 0
Fehlercodes: schwerpunkt-fehlt 50 · region-fehlt 7 (ein Datensatz mit beiden)
gültig je Parlament: Bundestag 293/330 · Berlin 112/120 · Brandenburg 39/50
ERGEBNIS: NICHT importierbar (nur wegen der offen ausgewiesenen Felder)
```

Das technische Ergebnis ist **keine** fachliche Freigabe. 444 Profile sind ohne
offene Achse/Mandatsart technisch importierbar; 56 bleiben es bewusst nicht,
bis die offenen Felder fachlich belegt sind.

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
Ergebnis des gezielten Tests:

```
PASS: 500 Feldbelege, 330/120/50, Hashbindung, AfD-Sperre, offene Felder,
echter Importvertrag (444 technisch importierbar, 56 offen), Reproduzierbarkeit: byte-identisch neu erzeugt
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
2. **50 Profile ohne belegte fachliche Achse** (37 Bundestag, 5 Berlin,
   8 Brandenburg) — weder ordentlicher noch stellvertretender Ausschuss belegt;
   nicht durch Themen erfinden schliessen. 22 Bundestagsprofile sind ueber
   ausschliesslich stellvertretende Mitgliedschaften abgedeckt (Mitgliedschaftsart
   getrennt, keine Befoerderung zu ordentlich).
3. **7 Profile ohne belegte Mandatsart** und **1 Berliner Wahlkreis ohne Bezirksnamen**.
4. **28 Brandenburger Listenmandate** mit nur grobem regionalem Bezug.
5. **23 Brandenburger Gremien** sind belegt, aber nicht als ordentliche
   Ausschussmitgliedschaft zugeordnet.

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
reproduziert;444 technisch akzeptiert/56 offen sind keine fachliche Freigabe.

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
