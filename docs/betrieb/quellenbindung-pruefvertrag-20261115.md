# Begrenzter Prüfvertrag für die inaktive Quellenergänzung

Stand15.11.2026. Die Betreibergrenze gegen Massentests bleibt bestehen.
Dieser Vertrag betrifft genau PR1207 und dessen normalen Merge, nicht beliebige
SQL-, CI- oder Quellenänderungen. Beide Pflichtjobs bleiben erforderlich.

## Exakter Umfang

Basis`ec79faa0540fb611c9cea117b02cfbad983cae6a`, lokal geprüfter Quellenbaum
`9eed81afa05afc8f41fe6433f1c6bdbf70acb096`. Vier Dateien sind zusätzlich auf
ihre bereits geprüften Gitblobs gebunden (UI-PR1208 und dessen Nachweis sind
unverändert aus dem aktuellen Main übernommen): Quellenabbildung, verifizierte Feed-
beobachtungen, vorhandener Fach-/Parteiquellentest und generierter Bundseed.
Der SQL-Diff ergänzt genau einen Herausgeber, zwei`paused/manual`-Wege und drei
Paketlinks. Kein anderer SQL-/Schema-/Migrations-/Auth-/UI-/Budgetcode ändert sich.
Der Vollseed wird nicht auf Production angewendet. Keine Quelle wird aktiviert.

Vor der CI sind Fach-/Parteiquellensuite und Seeddrift am integrierten Baum lokal
grün. Der zusätzliche Prüfplanvertrag hat39erfolgreiche Gruppen:15bestehende
Planprüfungen und24neue Bindungs-/Gegenfälle. Alle lokalen Prüfungen liefen über
`scripts/lokal.js`, ohne Profile, Produktionsdaten, Quellen- oder Modellaufrufe.

## Pflicht-CI

Nur dieser vollständig verglichene Baum erhält den begrenzten Plan. In der CI
laufen die vorhandene Schnellkernmenge und der vorhandene Quellenbereich samt
Seeddrift sowie die neuen Prüfplangegenfälle. Der gewöhnliche Plan für jede
andere Änderung bleibt unverändert. Ein unerwarteter Blob, eine fremde Datei,
eine Migration, andere Basis, Branch, Quelle, Herkunft oder Checkoutkennung
stoppt; es gibt keinen Rückfall auf pauschale Mengenläufe.

Für den Main-Push muss GitHub zusätzlich den tatsächlich gemergten PR mit
passender Mergekennung, beiden Eltern und identischem PR-/Mergetree bestätigen.
Auch dort gelten derselbe Quellenbereich und Schnellkern. Kein Branchname oder
Commit-Titel allein ersetzt den Baumvergleich. Die feste Basis zusammen mit
der Evidence-Abstammung leitet auch einen falschen Main-Mergetitel zum Guard;
dieser stoppt dann, statt ungewollt die breite Standardmenge zu starten.
Der unabhängige Reviewbefund hierzu wurde mit einem echten Shell-Selektorgegenfall
korrigiert; bestehende Pflichtjobs und übrige Prüfauswahl bleiben erhalten. Die UI ist unverändert; der
Browserpflichtjob bestätigt den bewussten Skip, nicht einen neuen Browserlauf.

Die planbezogenen CI-Dateien selbst werden durch Gegenfälle und Syntax geprüft;
die Änderung behauptet keine erneute globale Datenbank-/500er-Abnahme. Bereits
erfolgreiche unveränderte Nachweise bleiben erhalten. Ein CI-PASS wäre weiterhin
keine Production-Installation, Quellenaktivierung oder echte Versorgungsabnahme.

## Wirkung und Rückweg

Vor dem Merge müssen beide Checks am tatsächlichen Endkopf grün sein, der
aktuelle Main zur festen Basis passen und der gesamte Diff geprüft sein. Für
den exakt gebundenen normalen Merge lautet der Titel:
`feat(quellen): inaktive Fachquellen gezielt geprueft integrieren (#1207)`.
Bei einem abweichenden Main wird die Bindung neu geprüft, nicht übergangen.
Der begrenzte Plan gilt für keinen anderen PR. Ein Revert nur dieser CI-
Auswahländerung stellt den bisherigen konservativen Plan wieder her; bereits
gespeicherte Belege, Budgets, Reservierungen und Verarbeitungserfolge bleiben.
