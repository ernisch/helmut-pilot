# Briefingredaktion mit Sol im Pilot

Stand 21.11.2026. Im isolierten Azure Vergleich formulierte GPT 6.2 Sol
bei 3 Fällen die präziseste Vorbereitung fürs Mandat. Terra und Mini
erkannten ebenfalls den belegten Handlungsanlass und den Quellenwiderspruch.
Die Stichprobe belegt keine Fehlerquote im laufenden Betrieb.

Der lesende Abgleich des gespeicherten Pilotbriefings vom 21.11. um 09:20
Istanbul (07:20 Berlin) ergab 0 belegte Tagesprioritäten, einen offenen
Quellenstand und ein unvollständiges Paket. Für dieses Paket darf kein
redaktioneller Auftrag mit Sol entstehen.

## Geprüfte Vorschau

`lib/helmut/briefing-sol-vorschau.js` bindet den Auftrag an die gespeicherte
Morgenquittung, das Mandat, die gewählten Tagesprioritäten und ihre
Originalstellen. Der vorhandene Faktenplan verlangt freigegebene Fakten.
Der Entwurf darf weder die Reihenfolge noch die Auswahl ändern. Vor der
Vorschau muss ein separates Urteil alle Einordnungen des exakten Entwurfs
bestätigen. Das bestehende Vorschauformat bleibt vom Tagespaketspeicher
ausgeschlossen.

Die Datei liest ein privates JSON Paket über die Standardeingabe. Es
enthält die quittierte Zeile `paket`, die zugehörige Quittung `lauf`,
`basis` und `faktenPlan` des bestehenden Prosavertrags sowie bei amtlichen
Terminbelegen die erneut gelesenen `terminQuellen` nach Vorgang. Quellen und
Profil stammen aus dem autorisierten Lesepfad. Die Modi `entwurf`,
`pruefung` und `vorschau` erzeugen der Reihe nach die Anfrage für
`helmut-briefing-test-sol62`, den Prüfauftrag für den ergänzten `entwurf`
und die Vorschau nach Ergänzung des `urteil`. Alle 3 Modi arbeiten offline.
Die Anfrage ist auf mittleren Denkaufwand, 1.600 Ausgabetokens und striktes
JSON begrenzt. Der Code sendet die Anfrage nicht selbst.

## Offene Abnahme

Der laufende Kostenvertrag bindet Azure explizit an GPT 5 Mini. Ein echter
Sol Lauf für das Pilotmandat benötigt einen positiven Originalbeleg, eine
bestätigte Anbieterroute und eine konkrete Freigabe für Profil, Kosten und
Umgebung. Für den regulären Betrieb muss der Sol Aufruf vorab in denselben
Tagesdeckel und den bestehenden Kostennachweis eingebunden werden. Eine
einmalige fachliche Vorschau ersetzt diese Anbindung nicht.
