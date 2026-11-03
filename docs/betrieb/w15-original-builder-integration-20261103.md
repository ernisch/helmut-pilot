# W15: Originalbuilder und nachgelagerte Vollprüfung

Stand 03.11.2026. Entwicklung auf eigenem Branch
`codex/w15-original-builder-inner-check-20261103`, aus PR1031/ac9370df.
Kein Originallauf, keine Aktivierung, kein Merge/Deployment. End50041325430429
und Originalempfang41037459441 bleiben übernommen. Mock500 noch nicht bestanden.

## Nachgewiesene Fehler und begrenzte Korrekturen

Run41694827024 bleibt FAIL. Sein ursprünglicher privater Rohfehler ist nicht
überliefert; aus seiner Quittung allein folgt keine innere Assertion.
Der tatsächlich unveränderte archivierte Builder wurde jetzt hashgeprüft gelesen
und mit erfundenen Eingaben ausgeführt. Seine erste Zeitprüfung scheitert vor
jeder Eingabeposition, wenn die Konstruktion nach dem äußeren Fensterstart liegt:
`MATERIALS_CONTRACTS_CHECK_024`. Genau diese widersprüchliche Reihenfolge erzeugt
der bisherige Controller: Startwächter vor Empfang/Restore, Konstruktionszeit erst
in Materials. Die abgewiesene innere Prüfung ist damit reproduziert, ohne eine
historische Erfolgsquittung nachzubauen.

Der innere Auftrag beginnt jetzt am tatsächlichen frischen Vorflug. Sein Ende
bleibt exakt das Ende des äußeren Verarbeitungsfensters; auch die gemeinsame
Abschlussfrist wird nicht verlängert. Der echte Original-Zeitvalidator bleibt
unverändert. Nur eine genuine private Mock-Kalenderberechtigung erlaubt diesen
enthaltenen Auftrag; JSON/ENV, falsche Bindung, vorgezogener Beginn oder späteres
Ende genügen nicht. Alte Vertragszweige behalten ihr bisheriges Verhalten.

Der zusammengesetzte Test reproduzierte zwei weitere Anschlussfehler:

- Die Kostenprüfung übergibt zunächst einen Teilauftrag. Die neue Kalenderprüfung
  suchte darin bereits die Route. Sie erhält nun die tatsächlich geprüfte Route.
- Bei fester Operationsbindung fehlte diesem Teilauftrag seine Operationskennung.
  Der Generator reicht nun seine bereits geprüfte Kennung mit; eine falsche
  Operation bleibt gesperrt.

Der archivierte Builder validiert ausdrücklich nicht selbst den vollständigen
C-Auftrag. Materials führt diese echte Vollprüfung jetzt vor jeder Aktivierung
zusätzlich zu den 500 D-/Provider-/Review-Konstruktorbindungen aus.

Der vorhandene Fehlerkanal erkannte vorher nur äußere Materials-/Adapterframes.
Er erhält jetzt die erste innere Prüfstelle aus einer festen Liste der echten
VM-/Validatormodule (Zeilen 1–1024); generische Werfer werden übersprungen.
Schema, erste-Fehler-Erhaltung, private Rohmeldungen, Nachrichtenbegrenzung und
alle Sicherheitsbedingungen bleiben erhalten. Kein freier Fehlertext wird öffentlich.

## Tatsächliche Integration und Grenzen

Manueller Offline-Test `scripts/w15-github/test_mock500_original_builder_integration.js`
mit explizit bereitgestelltem, vorhandenen privaten ZIP; ausschließlich via
`node scripts/lokal.js -- node …`. Keine ZIP-/Originalinhalte im Repository.
Archiv269598Bytes/SHA256c979e187… vollständig geprüft, alle drei Originalmodule
gegen ihr vorhandenes Manifest geprüft. Keine Builder-Nachbildung oder neue
Originalqualifikation. Der private Codebestand ist für die Fortsetzung erhalten.

[SAFE-Ergebnis](belege/w15-builder-integration-20261103/RESULT.SAFE.json):
500 erfundene vollständige Eingaben → tatsächlicher Original-D-Konstruktor →
tatsächlicher Originalbuilder → vollständiger C-Validator, auch mit fester
Operations-/Commandbindung: **PASS**. 500 erzeugte Requests/Einheiten im Auftrag,
1000 D/R-Intents und1500 Sollpositionen. Keine ausgeführten Verarbeitungseinheiten,
keine gespeicherten Mock-Ergebnisse,0Aktivierungen/Modell-/Netzaufrufe.

Erwartungen kommen aus dem echten Paket-, Kosten-, Executor- und C-Vertrag.
Die letzte Eingabeposition mit falschem Eigentümer wird abgewiesen; ebenso
falsche Berechtigung/Operation und ein verschobenes äußeres Ende. Der alte
Fensterfehler ist mit demselben unveränderten Originalbuilder vorher reproduziert.
Diese synthetische Vorbereitung qualifiziert keine privaten Originaleingaben.
Deren vorhandene Qualifikation wird übernommen; alle tatsächlichen500Bindungen
müssen im nächsten genehmigten Job vor Aktivierung bestehen.

Ein zusätzlicher kleiner Worker-Anschlussversuch wurde korrekt als
`unqualified-decode` abgewiesen: Die kleine Fixture nutzt den v1-Transport,
während dieser Worker den großen v2-Dictionarypfad verlangt. Keine Grenze wurde
geändert oder die Fixture künstlich aufgebläht. Der positive Nachweis betrifft
Builder und echte C-Prüfung; er behauptet keinen positiven Dictionary-Workerlauf.
Bestehende unveränderte Worker-Nachweise und der gepinnte Modulgraph bleiben Pflicht.

Gezielte Prüfungen: Kalender-/Teillauf-/Operationsbindung,37 Kalenderfälle,
7 Fehlerkanalgruppen,4 reale Pipe-/Cleanup-Gruppen,27 innere Kennungen durch
Python-Pipe und öffentliche Aktion sowie6 EU-/Production-Regressionsgruppen PASS.
Pflicht-CI und unabhängiger Review werden am tatsächlichen PR-Kopf ausgewiesen.
Der manuelle Originalbuildertest lief lokal; CI erhält keine privaten Archivbytes.

## Genau nächster geschützter Schritt

Nach grüner Pflicht-CI und unabhängiger Abnahme: genau ein vollständiger Mock500
auf dem unveränderlichen finalen PR-Codekopf, mit neuem ausdrücklich gebundenem GO.
Keine zusätzliche geschützte Diagnose erforderlich. Vor Empfang alle aktuellen
Berechtigungen/Bindings/End500-Kompatibilität/Prozessruhe prüfen; frische Links erst
nach READY, Restgültigkeit>90s, Gesamtparameter≤65535Zeichen, kein Retry/Refresh.

GO-Umfang: bestehender Ausführungsbranch nur sicherer Fast Forward, Environment
`helmut-ci-originals`, eine Linkrunde/ein Job.500gleichzeitig aktive synthetische
Profile/500Units/1000Mockphasen/1500einzeln geprüfte Ergebnisse/8000Kontrollen/
17000Auditprüfungen; fünf Ergebnisfehlerklassen getrennt. Vollständige verschlüsselte
Sicherung, authentifizierte Rücklesung, zweite Rücksicherung/Integritätsvergleich,
finale0aktive Profile und tatsächlicher Prozessstillstand.

Maximal180Minuten Verarbeitung/210Minuten insgesamt, vollständig im selben UTC-
und Berliner Tag und genehmigten Novemberfenster. Auth<30s/Unit<60s/Provider<20s.
Dynamisches Hostlimit frisch auf der echten Maschine, Reserve2147483648Bytes,
Swap/OOM/max0, freie Platte≥536870912Bytes,≤0,05USD Speicherung, höchstens ein
verschlüsseltes Artefakt für einen Tag,0echte Modellaufrufe. Keine Grenzänderung.
BeiFAIL/UNKNOWN sofort stoppen, erste feste Fehlerphase erhalten, nur eigene
Prozesse kontrolliert beenden und acht Cleanupfelder/DB-Nullaktivität getrennt
prüfen. Kein zweiter Versuch, Linkrefresh, Branchreset oder Löschen von Originalen.
Production500 bleibt gesperrt; Anbieter-Eignung bleibtUNKNOWN.
