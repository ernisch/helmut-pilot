# Erste Marktetappe: Bundestag, Berlin und Brandenburg

Betreiberauftrag vom27.09.2026: Berlin und Brandenburg zuerst anbieten, die
anderen14 Laender danach. Bundestagsmandate bleiben Teil des Produkts und des
gemischten500er Nachweises. Dies ist keine deutschlandweite Landtagsabnahme.

## AfD-Ausschluss

Der Betreiber hat am27.09.2026 ausdruecklich festgelegt: Helmut beliefert keine
AfD-zugehoerigen Bundestags- oder Landtagsabgeordneten. Keine AfD-Kundenprofile
und keine AfD-Profile in der500er Zielkohorte. Die urspruengliche Auswahl mit110
AfD-Fraktionsprofilen ist verworfen und ersetzt. Andere Parteien und Fraktionslose
bleiben zulaessig; aktuelle Partei UND Fraktion einzeln belegen. Fraktionslos
bedeutet nicht automatisch parteilos. AfD-Nachrichten bleiben als Informationen
fuer andere Mandate zulaessig. Die Zulassung wird zentral durch
`lib/helmut/profil-zulassung.js` in Import, Provisionierung, Speicherung,
Aktivierung und Verarbeitung geprueft. Isolierte synthetische Sperrtests sind
keine Kundenprofile. Der fruehere reale AfD-Seed wurde entfernt.

Brandenburg hat nach Ausschluss der30 AfD-Fraktionsmitglieder hoechstens58
verbleibende Mandate; deshalb50 Brandenburger Zielprofile und330 Bundestagsprofile.
Die genauere Parteibelegung bleibt Teil der Einzelpruefung vor Import.

## Vorab festgelegte Auswahl

Planungsentscheidung vor der Nachrichtenauswertung fuer diese Kohorte:

| Parlament | Zielprofile |
|---|---:|
| Bundestag |330|
| Abgeordnetenhaus Berlin |120|
| Landtag Brandenburg |50|
| Gesamt |500|

Alle500 sind gleich behandelte Testprofile; keine gesonderte Bestandsgruppe.
Brauchbare bestehende Datensaetze koennen weiterverwendet, unpassende innerhalb
der500er Gesamtmenge kontrolliert ersetzt werden. Die groessere Berliner
Landesgruppe beruecksichtigt das groessere Parlament;170 Landesprofile machen
die erste Marktetappe zu einem wesentlichen Bestandteil der Abnahme. Dies ist
eine Testverteilung, keine Aussage ueber Kunden oder den Productionbestand.
Testkennungen werden erst nach Abgleich mit dem gesamten500er Bestand
gebunden; keine zusaetzlichen Profile oberhalb500 und keine doppelten Personen.

Auswahl innerhalb jedes Parlaments: aktuelles amtliches Verzeichnis einfrieren,
Parteien, Fraktionen, Gruppen und Fraktionslose getrennt erfassen. Jede zulaessige
Fraktion/Gruppe sowie Fraktionslose erhalten mindestens einen Platz; restliche
Plaetze proportional zur verbleibenden Mandatszahl nach groessten Resten.
Alle ausgewaehlten Mandate zaehlen in ihren Gruppen gleich. Bei Gleichstand
entscheidet die amtliche Profilkennung. Innerhalb der Gruppen nach amtlicher
Kennung auswaehlen und vorab belegte Rollen-/Ausschussvielfalt durch dokumentierte
Tausche innerhalb derselben Gruppe ergaenzen. Vertretene Parteien ebenfalls
vollstaendig abdecken, etwa CDU und CSU innerhalb der Bundestagsfraktion.
Direkt-/Listenmandate und unterschiedliche Wahlkreise beruecksichtigen.
Keine Auswahl nach Nachrichtentreffern oder spaeterem Ergebnis.

Ein [erster Namensentwurf mit500 Eintraegen](500-namensauswahl-20260927.json)
liegt jetzt vor:330 Bundestag/120 Berlin/50 Brandenburg. Grundlage:630 aktuell gefuehrte Bundestagsmitglieder nach
Ausschluss von neun als ausgeschieden/verstorben markierten Eintraegen sowie
159 Berliner und88 Brandenburger Verzeichniseintraege. Alle zulaessigen
Fraktionen/Gruppen und Fraktionslose sind vertreten; AfD ist ausgeschlossen. Die Einzelprofil-Feldbelege
und die zusaetzliche Parteien-/Rollenabdeckung sind noch offen; dies ist kein
importierbarer Profilbestand. Die drei Rechercheproben unten wurden unabhaengig
von dieser Namensauswahl fuer die Importpruefung verwendet.
Vor Import aktuelle Mandatsinhaberschaft/Wahlperiode erneut pruefen; ein alter
Export oder ein Wahlergebnis allein belegt kein aktuell ausgeuebtes Mandat.

## Erste reale Profilprobe

[Importmanifest](berlin-brandenburg-profilprobe-20260927.json) und
[maschinenlesbarer Beleg](berlin-brandenburg-startbeleg-20260927.json).
Amtliche Seiten am27.09.2026 ab12:17UTC abgerufen; Abrufzeit und SHA256 je Seite
im Beleg. Es werden nur oeffentliche berufliche Angaben uebernommen, keine
Privatadressen, Geburtstage, Familienangaben oder privaten Kontaktdaten.

| Person | Feldbelege auf der amtlichen Profilseite |
|---|---|
|[Frank Balzer](https://www.parlament-berlin.de/Abgeordnete/frank-balzer?groupStrategy=nachnamen)|Kopf/Fakten: CDU, Direktmandat, Reinickendorf/Wahlkreis6. Abschnitt „Mitgliedschaft in Ausschuessen“: drei im Manifest aufgefuehrte Gremien. Berlin, Bezug zum19. Parlament in dieser Recherche.|
|[Uwe Adler](https://www.landtag.brandenburg.de/de/adler_uwe/24171)|Kopf: SPD-Fraktion und Direktwahlkreis19. Politischer Werdegang: SPD-Mitgliedschaft. Abschnitt zur Gremienmitgliedschaft: drei Fachausschuesse. Die Kontrollkommission wird nicht als Fachausschuss uebernommen. Brandenburg,8. Wahlperiode.|
|[Kristy Augustin](https://www.landtag.brandenburg.de/de/augustin_kristy/13480)|Kopf: CDU-Fraktion, Landesliste/Platz2. Politischer Werdegang: CDU sowie politische Funktionen in Maerkisch-Oderland/Letschin als Regionsbeleg. Gremienabschnitt: drei aufgefuehrte Ausschuesse. Kein erfundener Direktwahlkreis. Brandenburg,8. Wahlperiode.|

Der echte Importvalidator akzeptiert3/3, ausschliesslich inaktiv. Die echte
Paketableitung erkennt alle drei als Landtagsprofile: Berlin erhaelt
`bund-basis` + `berlin-basis`, Brandenburg `bund-basis` + `brandenburg-basis`.
Keine Verwechslung der beiden Landesbasispakete. Das belegt nur Importform und
Zuordnung, weder Quellenversorgung noch individuell brauchbare Ausgaben.
Keine persoenlichen Positionen oder Themen aus Parteizugehoerigkeit abgeleitet.
Weitere Funktionen und stellvertretende Rollen sind in diesen drei Rechercheproben
noch nicht vollstaendig aufgenommen.

Die anschliessende Pruefung des echten Speicher-Roundtrips deckte einen Fehler
auf: `zuHelmutProfil` setzte nur `politische_ebene`, der Datenbankschreiber liest
aber `parliamentType`/`politicalLevel`. So entstand fuer ein korrektes Berliner
Importprofil eine Zeile mit `politische_ebene: null`. Die Abbildung setzt jetzt
auch das kanonische `parliamentType`. Ebenso werden stellvertretende Ausschuesse,
Berichterstatterthemen, Funktionen, Regierungsrolle, regionale Themen und
Namensvarianten an die vorhandenen Speicherfelder weitergereicht; Listenmandat
und Regionshinweis bleiben erhalten. Keine neue Spalte, Migration oder Aktivierung.
Auch der ausdrueckliche Status fraktionslos bleibt getrennt von einer etwaigen
Parteimitgliedschaft erhalten; der bisherige Storage-Fallback darf daraus keine
Fraktion erfinden. Fraktionslosigkeit wird nicht als Partei gespeichert.
Gezielter Test `node scripts/profil-import-test.js`:76/76 erfolgreich, darunter
die drei realen Proben plus Bundestag durch den echten Serializer und Leser;
richtige Ebene, Landespakete und Inaktivitaet bleiben erhalten. Zusatzrollen mit
explizit synthetischen Testwerten geprueft, keine erfundenen Rollen realer Personen.
Diese lokalen Tests sind kein Productionimport und kein Versorgungsnachweis.

## Frischer technischer Befund

Production-Nurlesebeleg27.09.12:15UTC, Runtimebasis
`dc0540ae594f761f56c52c1dac46fb0d4e8bf753`:

-500 Profile,0 aktiv, alle500 derzeit Ebene Bundestag. Die neue Mischung ist
  **noch nicht** in Production hergestellt.
- Berlin-Basispaket aktiv/7 Abrufwegverknuepfungen; Brandenburg vorbereitet/9.
  Die18 unterschiedlichen zugehoerigen Abrufwege stehen alle auf
  `needs_review`, Aktivierungsmodus `manual`, ohne gespeicherten letzten Erfolg.
  Ein aktiver Paketstatus allein ist kein Versorgungsbeleg.
- Landesparteipakete Die Linke: Berlin vorbereitet/3 Verknuepfungen,
  Brandenburg vorbereitet/0. Vor Import die echte Paketzuordnung auf Neutralitaet
  und versehentliche Partei-/Personenquellen in Basispaketen pruefen.
- `pardok-dispatch.js` liefert auch nach erfolgreichem Parserlauf nur
  `items: []`; `on`/`live` werden vom Flagleser nicht als Livepfad akzeptiert.
  Diese Isolation muss fuer einen spaeteren sichtbaren Landespfad kontrolliert
  weiterentwickelt werden. Kein blosses Einschalten und keine Schutzumgehung.

Begrenzte frische XML-Probe mit vorhandenem Parser, ohne Modellaufruf oder
Productionwrite:

| Quelle | Gelesene Records | Geparste Dokumente | Mit Titel | Datumsbereich der Probe | Sichtbare Pipeline-Items |
|---|---:|---:|---:|---|---:|
|Berlin WP19|27|36|13|17.08.2021–01.12.2022|0|
|Brandenburg WP8|30|46|15|17.10.2024–18.03.2026|0|

Berlin: vorhandener begrenzter Streamabruf mit30 Zaehleinheiten/4MiB,32483 Bytes
empfangen; der Parser erkennt27 Records. Brandenburg: amtlicher Voll-XML-Abruf
13.329.337 Bytes, danach bewusst nur30 Records geparst. Ein vorangegangener
Berliner Download mit32MiB-Grenze scheiterte an dieser lokalen Grenze; der
begrenzte Streamabruf funktioniert. Keine TLS-Pruefung abgeschaltet.
Beide Parser erkennen alle in dieser Probe vorhandenen Titel-Tags; fehlende
Dokumenttitel werden nicht erfunden. Die Probe am Exportanfang beweist keine
Aktualitaet. Fuer Tagesversorgung sind Auswahl aktueller Dokumente, leere
Metadaten und die sichtbare Weitergabe noch nachzuweisen.

## Naechste Umsetzung und Abnahme

1. Die amtlichen Verzeichnisse und die500er Namensauswahl nach obiger
   Matrix festhalten. Jedes Feld erhaelt Profilkennung, Parlament/Wahlperiode,
   Quell-URL, Abrufzeit, Quellhash und Abschnitt/Feldbeleg; Ableitungen separat.
2. Landesversorgung begrenzt anbinden: frische amtliche Dokumente zuverlaessig
   auswaehlen, korrekt an Berlin/Brandenburg binden und durch die bestehenden
   Qualitaetspruefungen fuehren. Nachweis vom Abruf bis zur sichtbaren Ausgabe;
   Bibliotheks-/Shadow-Erfolg allein reicht nicht. Keine alten Dokumente umdatieren.
3. Vor Productionimport alle500 Zielprofile gleichermassen auf
   Identitaet, Ebene, Fraktion/Partei, regionale und fachliche Zuständigkeit
   abgleichen. Hashgebundener Importplan, Rueckweg und rein lesende Nachkontrolle;
   keine Aktivierung. Bestehende Kommunikationssperren und Profilschutz erhalten.
4. Vor dem500er Start fuer jedes Profil Positiv-/Negativerwartungen festlegen:
   gleiche Partei in anderem Parlament; anderes Land bei gleichem Thema;
   andere Partei im gleichen Ausschuss; Direkt-/Listenmandat und persoenliche
   Erwaehnung. Alle1500 Ergebnispositionen samt Teilgruppen vollstaendig pruefen.

Kostenstand12:15:56UTC:6,551281USD gebunden,0,448719USD bis7USD frei;
Tagesverbrauch0,184859USD, keine offenen Modellreservierungen. Automatische
Aufrufe koennen den Stand veraendern, deshalb vor jedem bezahlten Lauf frisch
pruefen. Diese Recherche/Pruefung startet keinen kostenpflichtigen Modelllauf.
6USD je UTC-Tag bleiben bestehen. Vorbereitung autonom; unmittelbar vor
Aktivierung und eigentlichem500er Test weiterhin separates Betreiber-GO.

## Pruefung der Ausschlussregel

`profil-zulassung-test.js`:69/69 Sperr- und Gegenproben erfolgreich; als
Pflichtsuite registriert. `profil-import-test.js`:76/76,
`profile-validation-test.js`:36/36, `profil-bereitschaft-test.js`:96/96,
`profile-supply-matrix-test.js`:20/20. Der positive Innenthemenfall nutzt
jetzt ein zulaessiges BSW-Profil bei weiterhin unveraenderter AfD-Nachricht.
Production12:41:43UTC rein lesend:500 Profile/0 aktiv/0 AfD nach hinterlegter
Partei oder Fraktion, Profilbestand seit12:31UTC hashgleich. Keine Profile
geloescht, umbenannt, importiert oder aktiviert. Das belegt den gespeicherten
Stand; die tatsaechliche Parteizugehoerigkeit der neuen Kandidaten bleibt
vor Import einzeln zu verifizieren.

## Nachkontrolle PR654

27.09.2026: Pflicht-CI36319927210 erfolgreich, Merge `bfb49dcd16112a92f854575db017ce826e0ef62c`;
Vercel `dpl_Av6iTkrRPXnAgg9VwSnFs9FCnEid` READY fuer genau diesen Commit.
Rein lesend12:53:00UTC:500 Profile,0 aktiv,0 AfD laut hinterlegter Partei/Fraktion;
Profilhash `198f25ff81cf5ee4ad2645c1881a8191` unveraendert. Keine Fehler-/Fatal-Logs
im geprueften Fenster12:52:23–12:53:01UTC. Das belegt die Ausrollung und den
unveraenderten Bestand, keinen500er Funktionsnachweis.
