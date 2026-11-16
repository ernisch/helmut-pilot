# Briefing: bestaetigten Morgenlauf bei spaeterem Teilpaket erhalten

## Bestaetigte Ursache

Der heutige Morgenlauf war erfolgreich. Danach ersetzte ein neuerer Teilstand
das gespeicherte Tagespaket. Die Morgenquittung passt weiterhin exakt zur
gespeicherten Vorgaengerversion, aber nicht zum neueren Briefinginhalt.
Der Leser behandelt diese Abweichung wie einen fehlenden Morgenlauf und
verbirgt damit auch vorhandene, gueltige vorlaeufige Inhalte.

Primaerbeleg: erfolgreicher Lauf05:15:43UTC, Vorgaengerpaket05:15:42UTC,
Folgepaket08:06:04UTC; zwei gepruefte Lageabsaetze erhalten. Die Signatur des
tatsaechlichen Vorgaengerbriefings stimmt exakt mit der echten Morgenquittung
ueberein. Der lesende Vergleich hat keine Inhalte oder Profile exportiert.
Die beiden Quellen nach Beginn des Morgenfensters waren als Ignorieren
eingestuft; daraus folgen keine kuenstlichen Tagesprioritaeten.

## Kleinster dauerhafter Reparaturumfang

Die vorhandene, begrenzte Vorgaengerkette gegen die echte Morgenquittung
pruefen. Mandant, Profil, Tag, Paketidentitaet, Zeitfolge und Inhaltshashes
bleiben verbindlich. Nur aktuell gueltige und quellengebundene Absatzreferenzen
als vorlaeufigen Briefingstand anzeigen. Der aktuelle Gesamtabschluss bleibt
offen und die aktuelle Quittung ungebunden; kein Aktuell- oder Ruhe-PASS.

Keine neuen Modell-/Quellenlaeufe, Datenwrites, Quittungsumschreibungen,
Cron-/Budget-/Schemaaenderungen oder kuenstlichen Tagesanlaesse.

## Umsetzung und Nachweis

Der Leser prueft maximal32 tages- und profilgebundene Vorgaenger mit streng
absteigender Paketzeit und eigenem gueltigem Inhaltsnachweis. Nur der exakte
Ausgabebeleg der echten Erfolgquittung belegt den Morgenlauf. Vorgaengertexte
werden nicht uebernommen; die sichtbaren Absaetze stammen ausschliesslich aus
dem aktuell validierten Paket. Fremde/veraenderte Vorwerte, falscher Tag,
fehlende/manipulierte Quittungen, neue Quellensperren und ungueltige Ketten
bleiben gesperrt. Keine unbegrenzte Historienlesung.

Ein explizit offener Marker erhaelt den gueltigen Teilstand durch die
Frischedekoration bis zur Anzeige. Alle oeffentlichen Hinweise benennen den
tatsaechlich noch fehlenden aktuellen Gesamtabschluss. Aktuelle Quittung bleibt
ungebunden, Frische bleibtfalse, Tagesprioritaet und Handlungsempfehlung offen.
Die Paketzeit wird als heutiger vorbereiteter Teilstand gezeigt; Originale
behalten ihre echten Veroeffentlichungsdaten.

Gezielte vorhandene Offline-Suiten: Teilbriefing10/10, Auslieferung19/19,
Frische-E2E68/68, Frische-Audit40/40 und Fenstercheckpoint7/7 bestanden.
Gespeicherte Zeilen, Inhaltshashes, Quellen-/Profilbindung und Abschlussquittung
bleiben unveraendert. Der bestehende Browsermodus `--briefing-teilstand` prueft
den Folgepaketfall auf Desktop und Mobil in Pflicht-CI; kein lokaler
Chromium-PASS behauptet. Unabhaengige Reviews, beide Pflichtchecks am exakten
Kopf und regulaerer Rollout werden in PR1240 abschliessend belegt.
Rueckweg: PR revertieren, kein Datenrollback. Keine volle Produktabnahme aus
diesem Teilstand ableiten; Quellenversorgung bleibt offen.
