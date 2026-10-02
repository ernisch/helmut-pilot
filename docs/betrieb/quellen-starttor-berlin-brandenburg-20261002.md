# Berlin/Brandenburg: Quellen-Starttor (02.10.2026)

Der frische Root-Native-Read vom 02.10., **09:08:09.436103 UTC**, belegt nach der
Kostenkorrektur Berlin `active`, Brandenburg `prepared`, beide Zielpfade
`needs_review/manual`, die exakten amtlichen URLs/Parser, 16 Paketbindungen und
15 gebundene Pfade. Der bestehende reine Cutover-Klassifikator ordnet diesen
vollständigen Bestand als `vorher` ein (`struktur.ok=true`). Gemessen wurden
500 Mandate / 501 Identitäten / 0 aktiv; alle Mandate haben Ebene Bundestag.
Beide spezifischen Artikelstandmengen und die Standstichproben sind leer, also
je Land null gespeicherte Stände. Der Quellenread ist rein lesend
(`transactionReadOnly=on`), sein Root-Rohbeleg hat SHA-256
`a0161bf90f0b61a85e5ccba532604aa4574af8d2fead6583bb3b8af189c09305`.
Die amtlichen GETs vom 01.10. und die bestehenden grünen Parser-/Cutover-Prüfungen
sind weiterhin historische Belege; eine neue amtliche Lieferung ist nicht gemessen.

Die zum Lesefenster gehörende Production war `READY` auf `main`/`97a8435`.
Aktuelle wirksame Flagwerte und ein verwendbares Admin-Secret wurden nicht gelesen:
Vercel liefert für sensitive Werte nur Metadaten. Das gilt insbesondere für
Quellenoperator und Landesmodule. Der HTTP-Drei-Patch-Plan ist damit derzeit nicht
ausführbar. Ein konkreter Quellen-GO kann zurzeit weder Originalflagwerte noch
deren sicheren Rückweg binden. Quellen-/Aktivierungs-GO wurde nicht erteilt.

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

Der erste Native-Read ist ausgeführt und oben datiert. Die Admin-Laufzeitdiagnose
steht mangels bestehender Authentisierung weiter aus. Vor einer späteren
Schreibfreigabe braucht Root erneut einen aktuellen, vollständig gebundenen
Preimage-/Schutzbeleg; diese Vorbereitung führt keine entfernten Aufrufe aus:

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

## Benannte Native-Alternative, noch ohne Umsetzung

Eine separat freizugebende, auditierte Native-Migration könnte dieselben drei
Quellenzeilen mit vollständigem CAS in einer Transaktion korrigieren und alle
übrigen Quellendaten erhalten. Dafür wären der frische vollständige Quellenkatalog,
17s Transaktions-/20s Statement-/2s Lockfrist, geeignetes Auditformat und der genaue
Datenrückweg erst zu prüfen; diese Variante ist weder implementiert noch abgenommen.
Zusätzliche Auditwrites gehören ausdrücklich zum freizugebenden Umfang.

Der Vorteil wäre eine gemeinsam bestätigte Datenänderung ohne ein unbekanntes
Vercel-Flag zu überschreiben. Der Nachteil ist der neue geprüfte Schreibpfad statt
des vorhandenen HTTP-Operators. Dessen Flagcheck würde dabei nicht ausgeführt;
die Native-Aktion braucht deshalb eine eigene konkrete geschützte Freigabe und
Schutzprüfung. Sie ändert keine Laufzeitflags, aktiviert keine Mandate und belegt
keine wirksame Landesfreigabe oder Versorgung. Der unbekannte Laufzeitkontext
bleibt ein eigenes Tor vor dem späteren synthetischen Quellenlauf.
