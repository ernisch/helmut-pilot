# 500 Profil-Feldbelege (Bundestag/Berlin/Brandenburg) — 27.09.2026

**Status:** Technische Offline-Zusammenstellung der Feldbelege fuer exakt 500
Zielprofile. **Keine fachliche Freigabe, kein Importmanifest, keine Production-
Aktion und kein 500er Nachweis.** Alle 500 Datensaetze sind `aktiv: false` und
`importfreigegeben: false`.

## Artefakte

| Datei | Rolle |
|---|---|
| [`scripts/profil-feldbelege-500.py`](../../scripts/profil-feldbelege-500.py) | reproduzierbarer Offline-Assembler (nur Python-Standardbibliothek) |
| [`docs/betrieb/500-profilfeldbelege-20260927.json`](500-profilfeldbelege-20260927.json) | erzeugte Feldbelege (500 Datensaetze) |
| [`scripts/profil-feldbelege-500-test.js`](../../scripts/profil-feldbelege-500-test.js) | gezielter Offline-Test (kein Netz, keine DB, kein Modell) |

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
  `PoliticalParty`/Fraktion abgeleitet.
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

## Bilanz 500 (aus dem Beleg-JSON)

| Parlament | Datensaetze | Partei belegt | Partei offen | fachliche Achse offen | Mandatsart offen |
|---|---:|---:|---:|---:|---:|
| Bundestag | 330 | 0 | 330 | 59 | 0 |
| Landtag Berlin | 120 | 118 | 2 | 5 | 3 |
| Landtag Brandenburg | 50 | 45 (+1 parteilos) | 4 | 8 | 4 |
| **Gesamt** | **500** | **163** | **336** | **72** | **7** |

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
Profile: 500 · gültig: 422 · ungültig: 78
Nach Parlament: bundestag=330 · landtag-berlin=120 · landtag-brandenburg=50
Alle Datensaetze sind inaktiv: ja
Globale Fehler: 0 · Warnungen: 0
Fehlercodes: schwerpunkt-fehlt 72 · region-fehlt 7 (ein Datensatz mit beiden)
gültig je Parlament: Bundestag 271/330 · Berlin 112/120 · Brandenburg 39/50
ERGEBNIS: NICHT importierbar (nur wegen der offen ausgewiesenen Felder)
```

Das technische Ergebnis ist **keine** fachliche Freigabe. 422 Profile sind ohne
offene Achse/Mandatsart technisch importierbar; 78 bleiben es bewusst nicht,
bis die offenen Felder fachlich belegt sind.

## Reproduzierbarkeit

Der Test erzeugt die Belegdatei mit fixiertem `erstelltAm` erneut und vergleicht
byteweise: **byte-identisch**. Zusaetzliche synthetische Gegenprobe: belegte Partei bleibt bei Fraktionslosigkeit
erhalten; Widerspruch zwischen Berliner h1 und extrahierter Partei wird gesperrt.
Ergebnis des gezielten Tests:

```
PASS: 500 Feldbelege, 330/120/50, Hashbindung, AfD-Sperre, offene Felder,
echter Importvertrag (422 technisch importierbar, 78 offen), Reproduzierbarkeit: byte-identisch neu erzeugt
```

## Ausfuehrung und Grenzen

Flash High hat den lokalen Assembler und die Feldbilanz erstellt; anschliessend
hat Sol die Auswahl neutral neu berechnet, die Abbildung geprueft und die
Parteierhaltung bei Fraktionslosigkeit korrigiert. Flash-Lauf erfolgreich,
0,087628USD, keine offenen Reservierungen. Zwei amtliche Ersatzseiten frisch
abgerufen. Keine Production-Datenaenderung, Aktivierung oder500er Test.
Production-Nurlesebeleg13:51:49UTC:500/0,
Profilhash `198f25ff81cf5ee4ad2645c1881a8191`.

## Offene Probleme / naechster Schritt

1. **Bundestags-Partei ist fuer alle330 noch ungeprueft** — die ausgewerteten
   Strukturfelder bezeichnen Fraktionen. Parteibelege in den amtlichen Biografien
   sind als naechster Schritt getrennt zu pruefen;
   keine Ableitung aus der Fraktion.
2. **72 Profile ohne belegte fachliche Achse** (59 Bundestag, 5 Berlin,
   8 Brandenburg) — Ausschuss/Thema fehlt; nicht durch Themen erfinden schliessen.
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
