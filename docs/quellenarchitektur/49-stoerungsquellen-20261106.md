# Drei alte Störungsmarkierungen repariert

Am06.11.2026 fragte der Betreiber nach den PDF-Statusangaben und der Reparatur
gemeldeter Störungen. Im aktuellen Katalog waren genau drei Zugänge `broken`:
Ausschuss Arbeit und Soziales, DGB und Die Linke. Die89pausierten Einträge aus
der heutigen Katalogerweiterung sind ein anderer Fall: vorbereitete Zugänge,
deren Betriebsprüfung und Freischaltung noch offen sind.

## Ursache und tatsächliche Korrektur

Die drei Zeilen waren zuletzt am26.07.2026 verändert worden. Ihre Methode war
bereits `googlenews_search`, aber URL, Suchabfrage und Parser standen noch auf
alten Werten; zweimal war außerdem das Limit noch1statt16. `broken` schloss sie
vor jedem Abruf aus. Kein gespeicherter Fehlertext oder erfolgreicher Abruf
erklärte diese alte Markierung. Der bereits produktive Code enthielt die
passenden Ersatzfeeds; ein neuer Runtime-Release war deshalb nicht erforderlich.

| Zugang | Alter Datenbankeintrag | Bereits vorhandener Ersatz |
| --- | --- | --- |
| Ausschuss Arbeit und Soziales | HTML-Seite, HTML-Parser, Limit1 | Google-News-RSS für `site:bundestag.de "Ausschuss für Arbeit und Soziales"` |
| DGB | Homepage, HTML-Parser, Limit1 | Google-News-RSS für `site:dgb.de` |
| Die Linke | Alter RSS-Endpunkt mitHTTP404 | Google-News-RSS für `site:die-linke.de` |

Die öffentliche Prüfung lieferte für die drei ErsatzfeedsHTTP200 und64/89/64
mit dem vorhandenen Parser lesbare Einträge. Jüngste Publikationen lagen am
06./06./05.11.2026. Herausgeberdomains passten zu den drei Quellen; Artikellinks
bleiben Google-Weiterleitungen. Das belegt Transport und Parser außerhalb von
Production, keinen bereits durchgelaufenen Produktionsjob. Zusätzlich gefundene
direkte RSS-Alternativen wurden nicht ungeprüft in den laufenden Code eingebaut.

Die eng begrenzte Reparatur wurde um22:28:12Istanbul (19:28:12UTC) ausgeführt.
Geschrieben wurden ausschließlich `url`, `query`, `parser`, `max_items`, `status`
der drei bestehenden Zeilen, plus der vorhandene Zeitstempeltrigger. Alle drei
stehen nun auf `needs_review/auto`, Parser `googlenews-batchexecute`, Limit16.
Methode, Priorität, Pakete, Gesundheitswerte und Profile bleiben unverändert.

## Prüfung und Grenzen

25Prüfungen mit einer netzisolierten PostgreSQL-17-Kopie aller zehn Tabellen
bestanden: exakte Änderung/Rücknahme, atomarer Abbruch bei veränderter oder
fehlender Ausgangszeile, Schema-/Trigger-/Regel-/Paketabweichungen und Erhalt
späterer echter Gesundheitswerte bei Rücknahme. Der Testcontainer wurde entfernt.

Die vollständige Produktionsnachkontrolle um22:28:34Istanbul bestätigt alle
zehn Tabellen exakt als Ausgangsstand plus tatsächlichem Ausführungsbeleg.
Genau drei Zeilen geändert, alle anderen Katalog- und Profilwerte unverändert.
Die tatsächliche Quellenauswahl steigt143→146, ausschließlich um diese drei
Zugänge; kein bisher ausgewählter Weg entfällt. DIP bleibt separat.

Aktueller Bestand:146im Abrufplan,1separater DIP-Zugang,89pausiert und18aus
anderen Gründen nicht ausgewählt. Damit sind0Zugänge als defekt markiert.
Das bedeutet ausdrücklich nicht, dass alle Quellen erfolgreich abgerufen wurden.
Für die drei reparierten sowie EUR-Lex/Bundespuls steht der erste reguläre
Abruf noch aus; nächster Plantermin07.11.,07:00Istanbul. Kein manueller Cronlauf,
keine Modellgenerierung und keine Änderung an Budgets oder Aktivierungsregeln.

[Maschinenlesbarer Beleg einschließlich echter Vorher-/Nachher-Zeilen](49-stoerungsquellen-20261106.json).
Originaldateien und an das tatsächliche Receipt gebundene Rücknahme liegen unter
`/workspace/helmut-stoerungsquellen-2026-11-06/repair-plan/`.
Der Rückweg stellt nur die fünf ursprünglichen Felder dieser drei Zeilen wieder
her, erhält inzwischen entstandene echte Gesundheitswerte und bricht bei
abweichender Konfiguration ab. Er wurde nicht in Production ausgeführt.

Die Konfigurationsreparatur ist produktiv abgeschlossen. Der reine
Dokumentationsnachtrag wird im bereits offenenPR1089 geführt; sein Merge
erfordert gemäß Betreiberregel ein konkretes GO für genau diesen PR.
