# Büro: Quellenstand, sichtbare Erstellung und Formatprüfung

Stand: 11.11.2026. Basis `d6914b62`. Lokal umgesetzt/geprüft; Pflicht-CI und Rollout offen.
Vorige Liveänderungen: [Themenübersicht](../buero-themenuebersicht-20261111/README.md), [Quellentextübergabe](../buero-quellentext-20261111/README.md).

## Warum die Quelle aus September stammt

`officeSourceDateLabel` zeigt das gespeicherte Publikationsdatum der Quelle, nicht den Erstellzeitpunkt des Entwurfs. Der V3-Bestand führt die beiden Vorgänge Solidarprinzip/Berlin-Sondierung weiter als beobachtete Themen. Der [belegte Gegencheck vom09.11.](../../betrieb/briefing-tagesorientierung-20261109.md) nennt sie ausdrücklich Altvorgänge ohne belegten heutigen Verfahrensauftrag. `officeDecisions` prüft Identität, Einordnung, Quellenlink und Textbasis, aber keine Altersgrenze. Der neue vollständige Büro-Pool macht vorhandene Arbeitsanlässe erreichbar; er belegt keine neue Nachricht und keine heutige Frist.

Keine neue Behauptung über inzwischen nicht gelesene Production-Daten: Der Screenshot belegt die angezeigte Septemberquelle; hier werden Codeweg und bereits vorhandene Diagnosebelege ausgewertet. Kein neuer Quellenlauf, keine Datenkorrektur oder unbeauftragte Entwurfsserie.

Jetzt steht der jüngste belegte Quellenstand bereits in Formatwahl und Entwurfsdetail, einschließlich Jahr; Einzelquellen zeigen ebenfalls das Jahr. Fehlendes Datum bleibt offen. Keine Umdeutung von Publikation/Abruf zu Ereignis oder Erstellungsdatum. Alte Themen werden nicht still entfernt. Die Modellanweisung trennt `draftingDate` von `originalSources.publishedAt`: Historische Quellen belegen keinen heutigen Verfahrensstand; Fragen dürfen keine unbelegten Geschäftsordnungen oder Fristen voraussetzen.

## Ladeanzeige

[Mobile Ansicht](office-generating.png): echtes unbestimmtes `progress`-Element nur während der laufenden Anfrage, kein Prozentwert und keine erfundene Restzeit. Status ist für assistive Technik als beschäftigt markiert. Reduzierte Bewegung wird respektiert. Erfolg/Fehler beendet die Anzeige. Der vorhandene 60s-Vertrag und genau ein bewusster Auftrag bleiben erhalten.

[Quellenstand vor Erstellung](office-old-source.png).

## Was kostenlos geprüft wird

Der reine Validator läuft nach dem vorhandenen Modellaufruf; er fordert kein zweites Modell an. Die Grenzen entsprechen dem jeweiligen Prompt:

| Format | Messbare Vorgaben |
| --- | --- |
| Presse |90–130Wörter,2Absätze,keine Hashtags |
| LinkedIn |650–900Zeichen,2Absätze |
| X |maximal240 konservativ gewichtete Einheiten,ein Absatz,keine vorangestellte Threadnummer |
| Instagram |450–700Zeichen,maximal3Hashtags |
| Ausschussfragen |2–3nummerierte Fragen,je ein Fragezeichen am Ende,je höchstens35Wörter,keine Einleitung |
| Bürgerdialog |80–120Wörter,keine Hashtags |
| Büroauftrag |genau5Stichpunkte,je höchstens25Wörter |

Der X-Zähler behandelt breite Zeichen/Emoji und URLs vorsichtig; er ist ausdrücklich kein vollständiger offizieller X-Parser und kann zulässige Grenzfälle überzählen. URL-Fragmente gelten nicht als Hashtags; ein Bruch mitten im Satz ist keine Threadmarkierung. Der im Screenshot erkennbare Begriff „Ausschussgeschäftsordnung“ wird als unbelegte Verfahrensvoraussetzung zurückgewiesen, falls die Originalauszüge ihn nicht tragen. Diese enge Zusatzprüfung ist kein allgemeiner Faktenprüfer.

Bei einem Formfehler liefert der Server einen unterscheidbaren Fehler, keinen fertigen Text und keinen Ersatztext. Die App bietet höchstens einen ausdrücklich neu beauftragten Versuch; keine automatische Wiederholung. Der erste Modellaufruf kann wie jeder normale beauftragte Generierungsversuch Kosten verursachen, auch wenn sein Ergebnis abgewiesen wird. Die Formprüfung selbst ist lokal und verursacht keine Modellkosten.

Erfolgreiche neue Entwürfe behalten ihr Prüfergebnis im bestehenden Cache. „Länge und Aufbau geprüft“ bedeutet keine sachliche, politische oder parlamentarisch formgerechte Freigabe. Bereits vorhandene Entwürfe bleiben ohne unbeauftragte Neugenerierung erhalten; alte Einträge ohne Prüfbeleg erhalten keine nachträgliche Prüfbehauptung. Der fotografierte vollständige Kundentext wurde hier nicht aus einem privaten Cache ausgelesen; der sichtbare Ausschnitt ist fachlich auffällig, aber keine Vollabnahme.

## Tatsächliche Abnahme

[Maschinenlesbarer Beleg](verification.json):35Formgruppen über alle7Kanäle;92Büro-Ehrlichkeitsprüfungen einschließlich14Bundestags-/Landtags-Kanalkombinationen und negativer Ausgabeprüfung;13Antwortzeitgruppen mit virtueller Uhr;16Kostenbudgetgruppen;310Prüfungen in netzlosem Chromium auf Desktop und zwei Mobilgrößen. Erfasst echten Ladezustand mit gehaltener Antwort, Erhalt der Formprüfung, Septemberdatum samt Jahr vor Auftrag, manuellen Retry, Cache-/Mandats-/Quellenbindung und keine unbeauftragten Aufrufe.

Die bestehende Kostenprobe verwendete einen einzelnen Beispielsatz als erfolgreichen Büroauftrag. Ihr Mock liefert jetzt fünf gültige Stichpunkte; Reservierungs-, Abrechnungs- und Aufrufzahlassertionen bleiben unverändert und bestehen16/16offline.

Der erste Browsertest zeigte eine übernommene Freigabefunktion aus einer früher gehaltenen Mock-Antwort. Gehaltene Testantworten werden nun vor jeder Probe separat initialisiert; danach vollständige Abnahme erfolgreich. Keine Änderung am produktiven Anfrage-/Retry-Verhalten dadurch.

```sh
node scripts/lokal.js -- node scripts/briefing-office-formatpruefung-test.js
node scripts/lokal.js -- node scripts/buero-ehrlichkeit-test.js
node scripts/lokal.js -- node scripts/office-antwortzeit-ui-test.js
node scripts/lokal.js -- python3 scripts/ui-preview-isolated.py --only ui-office-binding-browser-test.js
```

Der neue Formtest ist über den vorhandenen Briefing-Bereich in der CI-Auswahl enthalten, ohne Schutzregeln zu ändern. Keine kostenpflichtige Prüfung gegen echte Modelle, keine Aussage über eine empirische Erfolgsquote aller real generierten Texte. Inhaltliche Quellenprüfung und politische Entscheidung bleiben erforderlich. Rückweg: gezielter Revert dieser UI-/Prüfänderung und regulärer Git-Rollout; keine Datenrücknahme und kein Cache-Reset.
