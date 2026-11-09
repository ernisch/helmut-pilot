# Pflegefall hib1231768: Befund und vorbereitete Korrektur

09.11.2026 UTC, Basis main954358fe nach PR1104. Ausschliesslich dieser Fall;
alle Datenbankabfragen in expliziten READ-ONLY-Transaktionen. Keine Modelle,
Originalabrufe, Verarbeitung, Aktivierungen, Produktivwrites, Merges oder Deployments.

## Belegte gespeicherte Zustaende

URL: https://www.bundestag.de/presse/hib/kurzmeldungen-1231768

- Rohdokument `rd-20c31197e0a0fff5d988445d58f1096c30b0620be5da4032a51f57bbfa8a36b3`,
  Publikation06.11.14:58UTC, Abruf07.11.04:00:49.207UTC, Anlage04:01:23.020764UTC.
  Summary ist die komplette vorhandene Feedbeschreibung: Gesundheit/Antwort,
  Nachbarn, Ehrenamtliche, familiaere Netzwerke und Sicherung der Versorgung.
  Kein Pflegeneuordnungsgesetz und keine konkreten gesetzlichen Massnahmen darin.
  `raw={}`; keine anderen Originalfelder in dieser Zeile.
- `document_findings`: genau eine gelesene Fundstelle, Bundestag, direkte
  Originaladresse, keine retrieval_path_id. Nichts hinzuinterpretiert.
- Legacy-main-Store, ausschliesslich die zwei passenden rawItems projiziert:
  Googlevariante liefert in content/excerpt nur Titel und Herausgeber;
  Bundestagsvariante liefert in beiden Feldern exakt die Feedbeschreibung.
  Beide summary-Felder sind null. Kein laengerer Originalinhalt in diesen Feldern.
- Gespeicherte lokale Feedprobe `/tmp/helmut-quellenbelege/hib.xml` aus dem
  vorigen Auftrag enthaelt denselben vollstaendigen Beschreibungstext.
  Ein einzelnes unveraendertes Item liegt hashgebunden als neue isolierte Fixture
  unter scripts/fixtures/pflege-quellenumfang-20261109. Es ist kein Artikel-HTML.
- Ein KO verknuepft genau dieses Rohdokument:
  `ko-vg-niedrigschwellige-20261106-431ce2`, Version1, understanding_status=complete.
  Angelegt07.11.04:02:51.558069UTC, updated_at04:02:51.331UTC, Modellnamegpt-5-mini-eu.
  display_summary endet: **Es wird keine konkrete Gesetzesinitiative oder Massnahme genannt.**
  Der native Text verwendet die deutsche Schreibweise Massnahme mit scharfem s.
  Dieser alte KO besteht nach PR1104 unveraendert fort; der Rollout regeneriert ihn nicht.
- Reservierung fuer vg-niedrigschwellige-20261106-431ce2 ist fertig, Fencing1,
  Ergebnisfencing1, lease_bis null, versuche1/ki_aufrufe1, zuletzt07.11.04:02:51.558069UTC.
  eingabe_hash450526fad2ac8b8bbe04cceb317280c321966b16;
  ergebnis_hash30941e847ce2b4b6be587dab070ffa09e926722e.

## Ursachen sauber getrennt

**Belegt:** Der untersuchte Lieferweg bot nur einen kurzen Feedtext; der
gespeicherte Text entspricht diesem gelieferten Auszug. Kein nachgewiesener
Parser- oder Speicherverlust eines damals gelieferten Volltextes. Die gespeicherte
Kurzfassung enthaelt eine unzulaessig pauschale Abwesenheitsbehauptung;
ein Auszug ist kein Beleg fuer die Vollstaendigkeit des Originalartikels.
Der aktuelle Assembler uebernimmt display_summary aus der Antwort und
erzeugt diesen Negativsatz nicht selbst. Keine Behauptung ueber eine nicht
gesicherte historische Assemblerfassung oder historische rohe Modellantwort.

**Nicht belegt:** Exakter historischer Prompt oder ein damals vom Modell
uebergangener Volltext. Die geprueften Tabellen haben keine Promptablage;
llm_usage speichert Tokenzahlen, keine Prompttexte, und lieferte fuer die
Vorgangs-/KO-Zuordnung und das enge Zeitfenster keinen Treffer. Die Reservierung
bestaetigt einen vergangenen Aufruf, ihr Hash ist kein Textnachweis:
verstehen-vertrag.eingabeHash verwendet Vorgang, Modus, KO-Version und sortierte
Dokumentkennungen. Mit der einen Kennung laesst sich derselbe Hash berechnen,
auch bei anderem summary-Text. Keine Rekonstruktion als historischen Prompt ausgeben.

Kein gebundener Artikelbeleg fuer dieses Dokument im geprueften
main-artikelkontext-Bestand gefunden. Kein Artikelvolltext in den geprueften
lokalen Originalproben. Der Betreiber benennt Pflegeneuordnungsgesetz und
konkrete Massnahmen im Original; dieser Hinweis wird nicht durch einen neuen
Originalabruf bestaetigt oder auf den Stand vom07.11. zurueckdatiert.

## Kleinste allgemeine Codevorbereitung

Zwei Regeln im bestehenden Quellenvertrag: Auszug liefert keinen Nachweis fuer
fehlende Gesetze/Vorhaben/Massnahmen im gesamten Artikel; explizite
Verneinungen behalten ihren belegten Bezug. Tatsaechlich genannte Vorhaben
bleiben erhalten, ohne Ankuendigung in Beschluss umzudeuten. Die Regeln erreichen
Understanding, Lagegeneration und Quellenreview ueber die bestehenden Verbraucher.
Keine Artikel-ID, kein Pflege-/Mandatssonderfall, kein neuer Fetch-/Speicherweg.

Gezielt scripts/lokal.js scripts/quellen-zeitvertrag-test.js:12/12 Gruppen
bestanden, darunter die echte alte Feedprobe, beide Arten synthetischer
Gegenbeispiele und unveraenderte Quellenfelder. Keine Modellattrappe als
Beleg fuer Modellbefolgung ausgeben: bewiesen sind Vertrag und Eingabebindung,
nicht die Antwort eines echten Modells. Erfolgreiche Inhalts-/Aufrufernachweise
von PR1104 werden nicht pauschal wiederholt. Keine neuen Endcommit-CI-Checks;
die Vorbereitung ist lokal und ungemergt.

Dieser Promptfix liefert keine fehlenden Originalabschnitte und berichtigt
keine abgeschlossenen KOs. Ein unveraenderter Feed bleibt ein Auszug, auch unter
dem neuen Speicherlimit. Keine automatische Neuverarbeitung oder Hash-/Fencing-
Ruecksetzung vorbereiten.

## Vorbereitete engste Bestandsberichtigung, nicht ausgefuehrt

Der JSON-Auftrag daneben bindet eine einzige KO-Kurzfassung an den gelesenen
Vorwert. Kandidat behaelt allein den bereits vorhandenen ersten Faktensatz und
entfernt den unbelegten Negativsatz. Keine erfundenen Gesetzesdetails, kein Modell.
Alle anderen KO-Felder, Rohtexte, Quellenkanten, Profile und Reservierungen
bleiben ausserhalb des Auftrags. Vor einer spaeteren Ausfuehrung den vorhandenen
Redaktionsweg und dessen Versions-/Cacheinvalidierung fuer genau eine KO-Zeile
qualifizieren; keine direkte ungesicherte SQL-Ueberschreibung vorschlagen.
Aktuellen Vorwert, Version, Zeitstempel und freie fertige Reservierung nochmals
lesend bestaetigen, bei Abweichung abbrechen. Danach Vorher/Nachher und etwaige
abgeleitete Anzeige-Caches kontrollieren, ohne Verarbeitung zu starten.
Rueckweg nur bei weiterhin genau eigenem Nachwert auf den gesicherten Vorwert.

Diese Neutralisierung behebt die falsche Negation, ist aber noch keine
vollstaendige Darstellung von Gesetz und Massnahmen. Dafuer ist zuerst ein
zugeordnet belegter Originalabsatz erforderlich. Kein weiterer Abruf ist zur
hier vorbereiteten Neutralisierung noetig.
