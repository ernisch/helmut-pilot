# Berlin/Brandenburg: Quellen-Starttor (02.10.2026)

Der vorhandene Quellen-Cutover ist vorbereitet. Der letzte datierte Quellenread vom
01.10., 10:24–10:28 UTC, belegt Berlin `active`, Brandenburg `prepared`, beide
Zielpfade `needs_review/manual`, 16 Paketbindungen und 15 gebundene Pfade. Je Land
waren null spezifische Artikelstände gespeichert. Das ist ein historischer
Production-Befund; ein frischer Quellenread nach den Kostenkorrekturen steht aus.
Die vier erfolgreichen amtlichen GETs vom 01.10., 11:10–11:13 UTC, und die
bestehenden grünen Parser-/Cutover-Prüfungen ersetzen diesen Speicherbeleg nicht.

## Das verbleibende Tor

`source-mode.js` verlangt für jedes Land zugleich eine ausdrückliche Freigabe
über `HELMUT_LANDESMODULE` und mindestens ein aktivierungsberechtigtes Landesmandat.
Das berechnet der vorhandene Code mit `validateProfile` und `resolveProfilePackages`.
Ein Bundestagsprofil mit Wohn-/Wahlkreisland Berlin zählt dafür nicht. Ein inaktives,
gelöschtes, ausgeschlossenes oder unbrauchbares Profil zählt ebenfalls nicht.
Null aktive Mandate ergeben deshalb keine wirksamen Landesmodule. Dieser Schutz
bleibt bestehen; weder Paketstatus noch `healthy/auto` ersetzen ihn.

Der technische Auftrag umfasst ausschließlich 330 synthetische Bundestags-,
120 synthetische Berliner und 50 synthetische Brandenburger Mandate. Es werden
keine realen Landesprofile als Startvoraussetzung übernommen. Der ältere Operator
`berlin-brandenburg-nachweis` mit zwei festen realen IDs ist ein historischer
Realpfad und wird für diesen Auftrag nicht benutzt.

Synthetische Profile können die geteilten amtlichen Katalogquellen nutzen, sobald
die getrennten Aktivierungs- und Landesgates erfüllt sind. Die Sperre
`scheduler.profilQuellenErlaubt` betrifft ihre zusätzlichen Personen-/Mandatssuchen;
sie wird dafür nicht gelockert. `HELMUT_TESTKOHORTE_QUELLEN=aktiv` ist keine
Voraussetzung für die beiden geteilten amtlichen Landesquellen.

## Nächster frischer Lesebeleg

Der führende Root führt nach der Kostenmigration die vorbereiteten Reads einmal
aus; die Vorbereitung selbst führt keine entfernten Aufrufe aus:

1. Ein Native-Read in einer begrenzten Read-only-Transaktion: genau die beiden
   Paketidentitäten/-status, die zwei vollständigen Zielpfade, alle Bindungen der
   Zielpakete einschließlich Fremdbindungen der zwei Zielpfade und die 15 festen
   Pfadstatus. Der vorhandene Cutover-Klassifikator muss diesen Bestand vollständig
   als `vorher` einordnen; unbekannte oder gemischte Zustände stoppen das Vorhaben.
2. Derselbe Read zählt aktive/gelöschte Profile nach Ebene und Land sowie die
   spezifischen JSON-Artikelstände, deren Publikationstage und Abrufzeiten.
   Höchstens zehn minimierte Standmetadaten je Land werden ausgegeben. Mengen
   allein belegen weder gültige Standhashes noch aktuelle sichtbare Versorgung.
3. Vorhandene Admin-GETs liefern Deploymentidentität, Quellenmodus, freigegebene
   Länder, berechtigte Landesmandate, wirksame Länder und tatsächlich eingeplante
   Wege. Nicht verfügbare/leere Diagnosewerte bleiben unbekannt. Insbesondere
   sind DB-Status `active` und wirksame technische Einplanung getrennte Größen.
4. Optional meldet genau eine unveränderte `quellen-vorschau` den Operatorzustand.
   Ist das Operatorflag aus, wird es für die Vorschau nicht eingeschaltet.

Die privaten SQL-/Anfragedateien werden vor dem Root-Aufruf mit ihren Byte-SHA-256
festgehalten. HTTP-/SQL-Ausgänge und Auswertungen erhalten eigene Dateien mit
Zeitpunkt und Hash. Ein Timeout, Fehler oder unvollständiger Beleg ergibt einen
Stop, keine automatische Wiederholung und keinen angenommenen Erfolg.

## Konkreter Quellen-Cutover

Der vorhandene Operator `/api/ops/quellen-cutover-be-bb` hat genau drei
Vorwärtsschritte:

| Zeile | Vorher | Nachher |
| --- | --- | --- |
| `pkg-brandenburg-basis.status` | `prepared` | `active` |
| `rp-be-landesregierung` | `needs_review/manual` | `healthy/auto` |
| `rp-bb-landesparlament` | `needs_review/manual` | `healthy/auto` |

`pkg-berlin-basis` bleibt `active` und wird nie geschrieben. Die übrigen 13
gebundenen Pfade bleiben `needs_review/manual`. Identitäten, Publisher, Methode,
URL, Parser, Query und sämtliche Paketbindungen bleiben unverändert. Der
bestehende Operator verlangt sein eigenes Flag, genau die Länder
`berlin,brandenburg` und die feste Bestätigung
`BERLIN-ACTIVE-BRANDENBURG-QUELLEN-CUTOVER-V1-20261001`. Diese Zeichenfolge ist eine
technische Eingabe und keine Betreiberfreigabe.

Root legt auf Basis der frischen Belege den konkreten Quellen-Produktionsumfang
und die dazu gültige Freigabe fest. Dieses Dokument führt weder den Cutover noch
Flagänderungen aus. Die Kosten-/Datenfreigabe wird nicht als Quellenaktion oder
Aktivierungsfreigabe umgedeutet. Aktivierung und eigentlicher 500er Test bleiben
nach dem aktuellen synthetischen Auftrag separat freizugeben.

Jeder bestätigte Patch wird vollständig rückgelesen. Ein unbekannter
PATCH-Ausgang stoppt weitere Writes einschließlich Kompensation. Ein sicher
bestätigter vollständiger Zielzustand kann mit der getrennt bestätigten
`quellen-rueckbau` zurückgeführt werden: erst beide Pfade in umgekehrter
Reihenfolge, dann Brandenburg `prepared`; Berlin bleibt erhalten. Mehrere
REST-Aufrufe sind keine atomare Datenbanktransaktion.

## Tatsächlicher Versorgungsnachweis

Nach einem freigegebenen Cutover ist lediglich die Quellenkonfiguration umgestellt.
Erst nach gesondert freigegebener Aktivierung der synthetischen Kohorte kann ein
begrenzter Quellenlauf die bestehenden Gates erfüllen. Vor seinem Start werden
Scope, Kostenriegel, Kommunikationssperre und Modellverhalten separat gebunden;
dieser Plan startet weder Cron noch einen Crawl oder einen Modellaufruf.

Die spätere Abnahme braucht in beiden Ländern neue, gültige spezifische
Artikelstände aus den amtlichen Ketten, unveränderte Originalpublikationstage,
getrennte Abrufzeiten und sichtbare Lage-Quellenzeilen. Berliner Stände sind
tagesgenau ohne Publikationsuhrzeit; Brandenburg enthält ausschließlich die aus
dem RSS gebundene Publikations-UTC. Alte BB-Artikel werden durch einen neuen
Abruf nicht zu Nachrichten von heute. Geteilte rbb24-Wege bleiben mehrländrig
gekennzeichnet. Eine Konfigurationsquittung oder positive Rohdokumentzahl erfüllt
diese fachliche Abnahme allein nicht.
