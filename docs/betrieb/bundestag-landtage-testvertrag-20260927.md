# Verbindlicher Testvertrag: Bundestag und Landtage

Betreiberklarstellung vom27.09.2026. Dies ist ein Produkt- und Abnahmevertrag,
keine Behauptung bereits umgesetzter oder getesteter Landtagsversorgung.

## Ziel und Vorrang

Helmut muss Bundestagsabgeordnete UND Landtagsabgeordnete individuell versorgen.
Das schliesst die Landesparlamente der Stadtstaaten ein. Beide Ebenen gehoeren
in den gemeinsamen Nachweis mit exakt500 gleichzeitig aktiven Profilen.
Die fruehere Empfehlung, den ersten Gesamtnachweis auf Bundestagsprofile zu
beschraenken, ist durch die ausdrueckliche Betreiberklarstellung ueberholt.
Fehlende Unterstuetzung eines Landes wird als Luecke ausgewiesen; ein Nachweis
fuer einzelne Laender darf nicht als Abnahme aller16 Landesparlamente gelten.

Nachfolgende Betreiberpriorisierung desselben Tages: zuerst Berlin und Brandenburg,
danach die restlichen Laender. Fuer die erste gemischte500er Etappe gelten deshalb
Bundestag/Berlin/Brandenburg als konkreter Umfang. Die vorherige Chat-Zusage,
schon diesen ersten Lauf mit allen16 Landesparlamenten zu besetzen, ist ueberholt.
Alle fachlichen Kriterien gelten in der ersten Etappe vollstaendig; sie ersetzt
keine spaetere Abnahme weiterer Laender. [Startplan](berlin-brandenburg-startplan-20260927.md).

## Verbindlicher AfD-Ausschluss

Betreiberpraezisierung27.09.: keine AfD-zugehoerigen Kunden oder Testzielprofile,
auf Bundes- wie Landesebene. Die Auswahl umfasst alle anderen Parteien.
Partei UND Fraktion belegen; fraktionslose AfD-Mitglieder sind ebenfalls
ausgeschlossen. Nachrichten ueber die AfD bleiben fuer andere Mandate erlaubt.
Die Zielverteilung ist jetzt330 Bundestag/120 Berlin/50 Brandenburg.

## Realistischer Profilbestand

- Exakt500 Zielprofile insgesamt, alle als eindeutig gekennzeichnete Testabbilder
  realer Abgeordneter, ohne diese als echte Kunden auszugeben. Keine gesonderte
  Bestandsgruppe und keine Sonderbehandlung frueher manuell angelegter Profile.
- Vor Nachrichtenauswahl und Lauf eine feste Auswahlmatrix beschliessen:
  Bundestag/Landtag, konkrete Landesparlamente, Parteien UND Fraktionen,
  Wahlkreis/Listeneinzug, Rollen und unterschiedliche Themen. Die genaue
  Verteilung ist noch festzulegen; keine bereits vorhandene Mischung behaupten.
- Oeffentliche Mandatsdaten aus offiziellen Parlamentsverzeichnissen mit URL,
  Abrufzeit, Wahlperiode und Feldbelegen recherchieren. Individuelle Themen oder
  Funktionen nur belegt uebernehmen; aus Ausschussrollen abgeleitete Sachgebiete
  als Ableitung kennzeichnen. Unbekannte Felder bleiben sichtbar unbekannt.
- Partei und Fraktion getrennt fuehren; Landes- und Bundesfraktion nicht
  gleichsetzen. Ausschuesse immer an Parlament, Bundesland und Wahlperiode
  binden. Gleichnamige Landes-/Bundesgremien sind nicht dieselbe Zustaendigkeit.
- Oeffentliche berufliche Angaben genuegen. Keine privaten Kontaktdaten oder
  sensiblen persoenlichen Eigenschaften recherchieren/ableiten. Bestehende
  Testkennungen und Kommunikationssperren erhalten; keine externen Nachrichten.
- Keine Profile nach gefundenen Nachrichten zurechtschneiden, keine erfundenen
  Testparteien/-themen als Ersatz fuer die fachliche Personalisierungsabnahme.

## Abnahme vorab definieren

Fuer jedes Profil erwartete Quellen-/Zustaendigkeitsbeziehungen sowie positive
und negative Faelle festlegen. Vergleichsfaelle umfassen dieselbe Partei in
verschiedenen Parlamenten, unterschiedliche Parteien bei gleichem Thema und
verschiedene Ausschuss-/Wahlkreisrollen. Gemeinsame relevante Nachrichten sind
zulaessig; kuenstlich unterschiedliche Texte sind kein Qualitaetsziel.

Im echten Lauf werden500 Mandatsbriefings,500 Morgenbriefings und500 Lage-
Ergebnisse vollstaendig bilanziert. Die fachliche Pruefung umfasst Mandatsbezug,
richtige Ebene/Landeszustaendigkeit, Quellenbindung, persoenliche Radarbindung,
Trennung von Briefing/Lage/Radar und Ausschluss fremder Profilinformationen.
Vollstaendigkeit und fachliche Brauchbarkeit getrennt ausweisen. Stichproben
ersetzen keine Vollpruefung. Zusaetzliche Teilbilanzen je Ebene, vertretenem
Landesparlament und Partei/Fraktion muessen Versorgungsluecken sichtbar machen.

Eine fehlende Tagesprioritaet kann fachlich korrekt sein, ist aber kein
automatisch bestandener Versorgungstest. Erwartete ruhige Faelle vorab
definieren; leere Ergebnisse in der1500er Bilanz weiterhin getrennt ausweisen.
Keine Schwellensenkung, erfundenen Pflichten oder Umdatierungen fuer ein Gruen.

## Belegte Ausgangsluecken und naechster Schritt

Repositorystand00311d70 vor dieser Dokumentationsaenderung:

- `lib/helmut/test-kohorte-500.js` erzeugt Testparteien A–F und Testthemen;
  `scripts/test-kohorte-500-test.js` verlangt sie sogar ausdruecklich.
  Der [Themenplan](500-themenplan-20260927.md) aenderte nur lokale Themenkopien,
  nicht Parteien oder Productionprofile. Das genuegt diesem neuen Vertrag nicht.
- `lib/helmut/profil-import.js` fuehrt amtliche Importherkuenfte fuer Bundestag,
  Berlin und Brandenburg. Das ist kein Importnachweis fuer alle Landesparlamente.
- `lib/helmut/profile-readiness.js::bewerteBundestagsprofil` erklaert sich fuer
  Landtag ausdruecklich unzustaendig; eine Bundestags-Reifepruefung kann deshalb
  keinen Landtagsnachweis ersetzen.
- Die [4/500-Gegenprobe](versorgung-500-20260927.md) belegt die Auswahl auf dem
  bisherigen Bestand, keine realistische ebenenuebergreifende Abnahme.

Naechster Sprint: Vorab-Auswahlmatrix und Feldbelegschema fuer alle500 Zielprofile
festlegen; vorhandene Landespfade und offizielle Profilquellen rein lesend dagegen
pruefen. Daraus die kleinsten notwendigen Code-/Importkorrekturen ableiten.
Kein pauschaler Umbau und kein blinder500er Import. Recherche allein ist weder
Aktivierung noch ein erfolgreicher Productiontest.

## Unveraenderte Grenzen

7USD kumulative Auftragskosten,6USD je UTC-Tag einschliesslich offener Bindungen;
vor bezahlten Laeufen Kosten frisch pruefen. Nur ein schreibender Ausfuehrer,
bestehende Quellen-, Profil- und Testschutzregeln erhalten. Notwendige Vorarbeiten
fallen unter die bestehende Dauerfreigabe. Unmittelbar vor Aktivierung und dem
eigentlichen500er Test bleibt das separate Betreiber-GO erforderlich.
