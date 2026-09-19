# Neue Antwort und gespeicherte politische Ebene konsistent halten

Stand 18.09.2026. Status: teilweise abgeschlossen. Folgebranch
`codex/ebenen-antwortkonsistenz-20260918` auf PR438
`04836543a696efe9ab908c0dfea04fbee8331207`. Kein Production Nachweis.

## Anlass und Beleggrenze

PR438 untersuchte den erhaltenen 500er Befund Bundeskoalition als
Landeskoalitionsbildung und schaerfte den allgemeinen Auftrag nach. Sein
[Beleg](ebenen-ereignis-vertrag-2026-09-18.md) trennt den historischen Fehler von
einer zusaetzlichen neutralen Gegenprobe: Eine neue Bundesantwort erhaelt bei
gleichrangigem KI Bestand `land` weiterhin die alte Landesebene. Die damalige
Probe belegte nur die Assemblierung, keine Speicherung.

Diese Folgekorrektur prueft ausschliesslich diesen technischen Widerspruch.
Der neue isolierte Lauf durch `understandOneCluster`, den echten Updatepfad
und dessen injizierten Speicheranschluss belegt ihn auch vor der Reparatur:
Ergebnis `updated`, gespeicherter Text ueber die Bundesregierung,
gespeicherte `decision_level=land`. Die feste Antwort und ihr gelieferter
synthetischer Auszug nennen dieselbe Bundeshandlung; die alte Ebene ist `land`
mit Herkunft `ki`. Kein echter Modellaufruf und keine Datenbank verwendet.

Der exakte historische Modellrequest und die rohe Modellantwort des Originalfalls
fehlen weiterhin. Kein historischer Korrekturversuch ueber diesen Updatepfad ist
belegt. Die neutrale Regression ist kein solcher Replay. Keine neuen Quellen,
privaten Rohbelege oder Profile wurden ins Repository kopiert; Q006 bleibt
abgeschlossen und wurde nicht erneut untersucht.

## Ursache und vor der Aenderung festgelegtes Ergebnis

`classifyKnowledgeObject` gibt eine neue ausdrueckliche Ebenenangabe an
`entscheideEbene` weiter. Das Ebenengedaechtnis erhaelt bei gleicher Herkunft
den Bestand. Diese gewollte Regel verhindert wechselnde Zuordnungen; sie ist
unveraendert zu erhalten. Die bisherige anschliessende Formpruefung prueft
jedoch nur das bereits zusammengesetzte Objekt und erkennt nicht, dass darin
die Ebene der neuen Antwort ersetzt wurde. Die neue Prosa blieb erhalten.

Vor der Korrektur festgelegt: Eine ausdrueckliche neue gueltige `decision_level`
muss mit dem Ergebnis der Klassifikation uebereinstimmen. Sonst wird die gesamte
neue Antwort vor der Inhaltsspeicherung verworfen. Keine automatische Entscheidung,
ob alte oder neue Ebene wahr ist; insbesondere kein Vorrang der neuesten Antwort.
Gleiche Ebenen, fehlende neue Ebene und der bestehende hoehere Herkunftsrang
muessen weiter funktionieren. Quellenbindung und Formpruefung bleiben erhalten.

## Begrenzte allgemeine Korrektur

Die gemeinsame `validateUnderstandingResult` in `lib/helmut/understanding.js`
vereinigt die vorhandene Schema und Akteurslistenpruefung mit genau einem
Vergleich: Steht in der rohen Antwort eine der fuenf gueltigen politischen Ebenen,
muss sie der assemblierten `decision_level` entsprechen. Abweichung liefert
`decision_level-antwortkonflikt` und fuehrt ueber den bestehenden Invalidpfad
zu `skipped-invalid`. Die Werte stammen aus derselben kanonischen Ebenenliste
wie die Klassifikation. Keine eigene Liste von Artikeln, Titeln oder Quellen.

Erstverstehen einschliesslich Pending, Update und Auswerter verwenden dieselbe
Pruefung. Ein Update ersetzt bei diesem Fehler keinen Inhalt und keine Version
des bestehenden Wissensobjekts; es bleibt als gescheiterte Aktualisierung
vorgemerkt. Ein Pending Vorgang nutzt die bisherige Fehlermarkierung. Verknuepfte
Dokumente und Betriebsmetadaten folgen weiterhin den vorhandenen Regeln. Mit CAS
bleibt der Ausgang sichtbar `unbekannt`, ohne Freigabe fuer einen unmittelbaren
erneuten Aufruf. Die bestehende begrenzte Wiederaufnahme ohne CAS bleibt erhalten.

Prompt, Quellenwahl, Klassifikation, Ebenengedaechtnis, Schema, Scoring und
Fristenschutz sind unveraendert. Kein zusaetzlicher Modellaufruf. Eine korrigierte
Bundesantwort darf einen regelbasierten Landeswert weiterhin durch den schon
bestehenden Herkunftsrang ersetzen; diese Regel wurde nicht erweitert.

## Gezielte Nachweise

`scripts/understanding-ebenen-konsistenz-test.js`:8/8 Gruppen erfolgreich.

1. Der konkrete neutrale Konflikt wird vor jeder Inhaltsspeicherung abgewiesen.
2. Alle20 gerichteten Unterschiede der fuenf Ebenen sind in Pending und Update
   gesperrt, jeweils ohne Mutation von Eingabe, Antwort oder Bestandsobjekt.
3. Erstermittlung und Bestaetigung aller fuenf Ebenen bleiben speicherbar,
   einschliesslich unveraenderter Prosa und korrekter Versionsfortschreibung.
4. KI kann einen Deriver Wert weiterhin ersetzen, auch bei alter fehlender Herkunft.
5. Fehlende oder unbekannte neue Ebene stuft den bekannten Bestand nicht herab;
   ein neues unbekanntes Objekt bleibt unbekannt.
6. Alte `political_level` Spalte und als JSON gespeicherte Herkunft umgehen die
   Pruefung nicht.
7. Auch ohne CAS wird kein widerspruechlicher Inhalt gespeichert.
8. Eine passende Ebene umgeht weder Pflichtfelder noch Akteurslistenbindung;
   ein neutraler positiver Auswerterfall bleibt gueltig.

Der erste Testentwurf erreichte wegen eines fehlenden Bestandsdokuments nur den
bestehenden `merged` Pfad. Nach Ergaenzung eines neutralen Vorberichts belegte
die Regression am unveraenderten PR438 Motor die falsche Speicherung und
scheiterte erwartungsgemaess. Nach der Anwendungsaenderung bestehen alle8 Gruppen.
Keine vorhandene Abnahme oder Schutzregel geaendert.

Der lokale Pflichtlauf gemaess CLAUDE.md Paragraph6 bestand am finalen
Anwendungscode:413/413 Suiten in837 Sekunden, Exit0. Danach nur diesen
Ergebnisabsatz ergaenzt. Alle Tests liefen ueber `scripts/lokal.js`, mit den
vorhandenen Abhaengigkeiten und Chromium, ohne Neuinstallation. Die CI am
veroeffentlichten Head wird im Draft PR abschliessend dokumentiert, ohne
weiteren Dokumentationscommit fuer die CI.

## Grenzen, Betrieb und naechster Schritt

Dies ist eine strukturelle Konsistenzpruefung, keine semantische Quellenpruefung.
Eine Antwort mit falscher, aber intern gleicher Ebene kann weiterhin bestehen.
Freitext ohne ausdrueckliche gueltige Ebenenangabe wird nicht semantisch gegen
den Bestand geprueft. `unknown`, fehlende oder ungueltige Rohwerte folgen wie
bisher der Ableitung. Eine neue gueltige Antwort kann bei falschem KI Bestand
konservativ abgewiesen werden. Der alte Fehler wird dadurch nicht geheilt.
Eine allgemeine fachliche Neubewertung alter KI Ebenen bleibt ungeloest.

Vorflug18.09.: main unveraendert `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`,
PR433 bis PR438 offen, Draft und ungemergt. PR438 CI35353054035 erfolgreich,
412/412 und alle Pflichtstufen; abgeschlossene Pruefungen nicht einzeln wiederholt.
Keine relevante laufende oder wartende Action, nur die beiden queued Altlaeufe
vom06.08. Kein weiterer lokaler Schreiber sichtbar; globaler Work Sitzungsstatus
nicht abfragbar. Fremde55 Vorarbeiten unangetastet.

Automatisches Deployment des eigenen Branches in `vercel.json` gesperrt.
Artikelkontext bleibt AUS. Kein Merge, Deployment, Migration, Production Write,
Profilwechsel, Cron, Environment oder Azure Aenderung, bezahlter Aufruf oder500er
Test. Keine neue Production Zustandsaufnahme. Rueckweg vor Merge: ausschliesslich
diesen ungemergten Folgebranch verwerfen.

Danach einen anderen erhaltenen Inhaltsbefund aus der offenen Fachabnahme
gezielt pruefen, etwa Wahlvorbericht als Ergebnis. Erst Eingabe, Ausgabe und
Motorpfad belegen; keine erneute Promptregel als bewiesene Fachreparatur ausgeben.
Die reale Modellbefolgung, fachliche Behebung des Originalfehlers und der neue
vollstaendige500er Production Nachweis bleiben offen und nicht freigegeben.
