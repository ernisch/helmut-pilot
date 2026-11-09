# Pflegefall hib1231768: Befund, Korrektur und Abschluss

09.11.2026 UTC, Ausgangsbefund auf main954358fe nach PR1104. Die folgenden
Vorbereitungsabschnitte sind historisch; der spaeter ausdruecklich freigegebene
Merge, Rollout und einzelne Bestandswrite sind im Abschluss unten belegt.
Keine Modelle, Originalabrufe, manuelle Verarbeitung oder Aktivierungen.

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

## Freigegebene Bereitstellung: notwendige historische Testbindung

Der spaetere Betreiberauftrag erlaubt PR, Merge/Rollout und exakt die
vorbereitete Einzelkorrektur. CI42558354952 auf2f9eaacc bleibt FAILURE:
Standard189/189 bestanden, Bereich346/348, Z22 danach nicht ausgefuehrt.
Die zwei alten Prosa-Einzelversuche binden synthetische Prompts an feste
historische Hashs, bauten diese aber aus dem heutigen Generator. Die zwei
neuen Regeln veraendern erwartungsgemaess die Bytes: PROSA_PROMPT sperrt korrekt.

Nur ihre Offline-Tests verwenden nun die alten synthetischen Prompts als
hashgebundene Fixture. Sie wurden mit dem Generator vor dieser Aenderung
(main954358fe) rekonstruiert und gegen saemtliche unveraenderten bestehenden
PROMPTS-Hashes geprueft; identische Cluster werden ebenfalls verlangt.
Der echte alte Aufrufer und seine Hash-/Schema-/Kosten-/Ausfuehrungssperren
bleiben unveraendert. Neue Gegenprobe: der heutige Generator muss am echten
Aufrufer weiterhin mit PROSA_PROMPT scheitern. Kein Umschreiben der alten Hashs.
Gezielt13/13 und14/14 Schutzgruppen bestanden, ausschliesslich Attrappen.
Das sind historische synthetische Prosa-Testprompts, keine nachgewiesene
historische Modelleingabe des Pflegefalls. Neuer Endcommit braucht eigene CI.

## Tatsaechlicher Abschluss am09.11.2026 UTC

**Der begrenzte Pflegeauftrag ist abgeschlossen.** Die allgemeine Quellenluecke
ist damit nicht geschlossen. Der Betreiber hat PR, Merge, regulaeren Rollout
und exakt die vorbereitete einzelne Satzentfernung ausdruecklich freigegeben.

- [PR1110](https://github.com/ernisch/helmut-pilot/pull/1110) mit geprueftem
  Endkopf `d4296a5dc3c85138c9e59167ede70997fc8fa2d0` auf frischem main954358fe
  konfliktfrei gemergt: `7d005279eb5cad89ac37c61f13c81a42290e0c28`.
  Runtime-Diff gegen den urspruenglichen lokalen Fix bbed30e6 ist leer.
  Zusaetzlich nur notwendige historische Offline-Testbindung und die Sperre
  fuer unbestellte Preview-Deployments des eigenen Branches.
- Native Endcommit-CI [42561818313](https://github.com/ernisch/helmut-pilot/actions/runs/42561818313):
  beide Pflichtchecks SUCCESS, Standard189/189, Bereich348/348,
  Z22 gegen isoliertes PostgreSQL/PostgREST48/48. Browserlauf und gesonderter
  Mock100-Lauf nach unveraendertem Pruefplan SKIP, keine Browserabnahme behauptet.
  Quellenvertrag12/12, historische Prosa-Schutzgruppen13/13 und14/14 gezielt
  lokal bestanden. Der erste CI-Fehllauf oben bleibt als solcher erhalten.
- Vercel Production `dpl_3y8Am7iXcYnzbReKxmSiHGrREqTP` READY, Git-SHA exakt7d005279,
  regulaere drei main-Aliase zugewiesen, aliasError null. Rein lesendes
  `/api/release/public`: ok/ready/storage true; Homepage liefert
  client.js und styles.css mit Version7d005279. 71 Env-Eintraege einschliesslich
  Metadaten/verschleierter Werte exakt gegen frischen Vorherstand gleich;
  keine Nachladeaktivierung, Budget- oder Profilaenderung.
- Die Einzelvorlage wurde einmal atomar im Zeitfenster04:27:36–04:27:43UTC
  angewendet: ausschliesslich `knowledge_objects.display_summary` der gebundenen
  KO-Zeile. Exakter Vorwert, komplette Zeilenpruefsumme, URL, Version/Zeitstempel
  und freie fertige Reservierung wurden unter Zeilensperren geprueft. Eine Zeile,
  ein Feld; native Vorher/Nachher-JSONs ohne dieses Feld identisch.
  Version1, updated_at, Fencing und Reservierung blieben unveraendert.
  Keine Gesetzes-/Massnahmendetails hinzugefuegt. Kein anderer Datensatz geschrieben.
- Vertrauliche Sicherung und bedingtes Rueckweg-SQL ausserhalb Git im
  geschuetzten Arbeitsbereich `helmut-pflegeabschluss-20261109` (Verzeichnis0700,
  Dateien0600). SHA256 Vorher:
  `0ca00e25229c8f7f8ca71271329353296c66c8082a958bf21e0ef48fe3d55aed`;
  Nachher: `72256ced4b186c6653cf169953a88c49259562a17cb609eb143e287c8341bd2f`;
  Rueckweg: `43049800ae99962efd134e840a93684ecf3cabc8245157663444eab3b1b415d2`.
  Rueckweg nicht ausgefuehrt; er verlangt weiterhin exakt den eigenen Nachwert
  und unveraenderten Zielzustand. Code-Rueckweg: vorheriges READY954358fe
  (`dpl_6JBuyondmCVcs5TKs58jLLQKZACu`) nach dann gueltiger Betriebsfreigabe.
- Nach Rollout separat READ ONLY nachgelesen: korrigierter KO-MD5
  `484f4b5da7bad475e7cad30a8945e868`, Reservierungs-MD5 unveraendert
  `e413991eba2928e1bb93866996a26aff`. Null alte Saetze in gespeicherten Briefings
  und den drei relevanten Legacy-Anzeigefeldern. Vier zuvor gebundene Briefings
  enthielten die Negation bereits vor dem Eingriff nicht; keine Cachemutation.
  Bestehende reine Lage-/Detailkarten- und Radar-Projektionen mit tatsaechlich
  nachgelesenem KO und Rohdokument uebernehmen die korrigierte Kurzfassung.
  Keine authentifizierte Live-Browserabnahme behauptet; generierende Endpunkte
  wurden nicht aufgerufen.

Offen bleiben der fehlende gebundene Originalabsatz zu Gesetz/Massnahmen,
der nicht gesicherte historische Prompt und die Modellbefolgung der neuen
Anweisung. Offline-Pruefungen beweisen Regeln/Eingabebindung, keine echte
Modellantwort. Die Bestandskorrektur entfernt nur die falsche Negation.
Naechster fachlicher Schritt waere die gesonderte Pruefung eines gebundenen
Originalabsatzes; in diesem Auftrag kein weiterer Originalabruf.

Der anschliessende reine Dokumentationsabschluss aktualisiert nur diesen Bericht,
CURRENT_STATE und den Ausfuehrungsstatus der Einzelvorlage. Sein eigener Merge-
und Deploymentstatus wird gemaess CLAUDE.md aus Git/Vercel-Historie belegt,
ohne rekursiven Dokumentations-PR.
