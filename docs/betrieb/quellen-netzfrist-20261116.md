# Quellenabrufe: absolute Netzfrist und sichere Fortsetzung

Stand16.11.2026: gezielte Codekorrektur in Entwicklung, noch kein neuer
Production-Wirksamkeitsnachweis. Ausgangspunkt ist Mainaf1d8497 mit Runtime
dc9bd6ea. Der echte Morgenabschluss bleibt partial; die bisherigen Erfolge,
Quellenbelege, Archive, negativen Prüfungen und unbekannten Ausgänge bleiben erhalten.

## Belegtes Problem und begrenzte Aussage

Der reguläre03:30Quellenlauf endete failed/warteschlange-nicht-verfuegbar.
Ein Quellenauftrag erhielt5646msund endete mit auftrag-zeitlimit. Die genaue
Teiloperation und die alleinige Ursache dieses Fehlabschlusses sind nicht
vollständig protokolliert; alle126eng zugeordneten Claim-HTTPs waren200.
Es wird kein Supabase-Ausfall oder pauschaler Parserfehler behauptet.

Die Codeprüfung und neue gezielte lokale Regression belegen unabhängig davon
eine konkrete Lücke: Der Quellenauftrag kennt sein absolutes Ende, gibt dieses
aber nicht vollständig an seine Netzstufen weiter. Promise.race beendet nur
das Warten; bereits gestartete Abrufe können weiterlaufen. Ein vorab abgebrochenes
Signal konnte sogar noch die native HTTP-Erzeugung erreichen. Das wurde im
neuen isolierten Test zuerst rot reproduziert und anschließend korrigiert.
Der native Queue-Gegenfall reproduzierte außerdem den unbelegten Start bei
5646msRestzeit; jetzt wird vor Netz und Klassenreservierung ehrlich vertagt.

## Kleinste Korrektur im bestehenden Kern

- Im Quellenauftrag endet die Netzphase vor der harten Auftragsfrist. Zwei
  bestehende Supabase-Timeouts plus1sbleiben als Auslauf für Anbieterquittung
  und Klassenfreigabe. Das ist keine pauschale Zusage über Speicherlaufzeiten.
- Vor Klassenreservierung und nach ihr wird die unveränderte absolute Frist
  geprüft. Synchrone Gate-/Parserarbeit darf sie nicht durch verzögerte
  Timerzustellung umgehen. Keine zu kurze Netzarbeit und kein neuer Retry danach.
- Ein optionales Abbruchsignal, absolute Frist und Uhr laufen durch RSS/HTML,
  URL-Auflösung, Google-POST, Personenbilder, PARDOK und gebundene Spezialfetcher.
  Eigene und Provider-/Originalsignale werden kombiniert. Ohne Frist bleibt
  der bisherige Aufrufvertrag erhalten.
- Native HTTP-Anfragen und Antwortströme werden abgebrochen. Parallel arbeitende
  Resolver werden vollständig abgewartet. Fehlerantworten und Weiterleitungen
  dürfen keine unbemerkten offenen Antwortkörper oder Kindabrufe zurücklassen.
- Der EUR-Lex-Originalpfad erhält dieselbe verkürzte Netzfrist. Unbekannte
  Originalreservierungen, alte Negativbelege und Modell-/Schreibausgänge werden
  nicht zurückgesetzt oder durch weitere Versuche ersetzt.
- Erst wenn die Crawl-Promise tatsächlich beendet ist, darf die bekannte
  Zeitvertagung ohne Fehlversuchsverbrauch erfolgen. Ein noch laufender Handler
  oder unklarer Speicherausgang hält den bestehenden UNKNOWN-Riegel weiter zu.
  Die mehrstufige Persistenz wird nicht durch einen Timer als erledigt erklärt.

Gesamtbudget,90sAbrufanteil, Leases, Quellenrechte, Provider-/Originalquoten,
Modellbudgets und Frische-/Neutralitäts-/Belegprüfungen bleiben unverändert.
Keine Migration, neue Dienste, Flags, Aktivierungen, Cron-/Env-/Profiländerung.

## Gezielte Prüfung

Neue Handlergruppen prüfen zu kurzen Rest, langsame Klassenreservierung,
beendeten Netzabbruch, normalen Abschluss, Aufruf ohne Frist, synchrone
Fristüberschreitung, verkürzte EUR-Lex-Frist/Originalabbruch, unverdeckten
Speicherfehler und native attempt-erhaltende Queuevertagung.
Neue Crawlergruppen prüfen tatsächlichen GET-/POST-/PARDOK-Abbruch vor und
nach Antwortbeginn, Signalzusammenführung, Redirect-Kinder, parallele Resolver,
abgebrochene Retrypausen, Bildabrufe und absolute Frist nach Parserarbeit.
Ausführung ausschließlich über scripts/lokal.js mit lokalen Adaptern.
Keine externen HTTP-/Modell-/Production-Testaufrufe, keine historischen Mengenläufe.
Erstfehler und einzelne Harnesskorrekturen bleiben dokumentiert; bereits grüne
neue Gruppen wurden lokal nicht grundlos wiederholt.

Die Pflicht-CI bleibt am exakten Kopf gebunden: schmaler Quellenfristplan mit
vollständigem Baum-/Basis-/Evidence-/Runtime-/Testblobvergleich, Schnellkern und
betroffenen bestehenden Netz-/Queue-/Originalverträgen. Beide Pflichtjobs bleiben;
unveränderte UI führt keinen zusätzlichen Browserlauf aus. Fremde Runtime-,
Auth-, Datenbank- oder Policy-Diffs werden geschlossen abgewiesen.
Unabhängige Runtime-/Test- und CI-Reviews sind Voraussetzung für den Merge.

## Nachbesserung des roten Pflichtchecks

CI43818662436 scheiterte bei crawler-hardening: das alte10s-Positivfixture
liegt jetzt bereits unter der21s-Netzabschlussreserve. Der Test verwendet
die native60s-Standardlease und prueft unveraendert echten zweiten503-/
Persistenzabruf statt skipped-shared. Anbieter-/Telemetrie-Gegenfaelle wurden
auf dieselben Phasen ausgerichtet: zu kurzer Start bleibt ohneI/O, nach
Facharbeit zu kurzer Telemetrierest bleibt ohne neuenRPC; spaete Persistenz/
Enqueue-/Fehlerantwort startet weiterhin keine neue Phase.

Dabei separat rot belegt:39sNetzfrist im nativen60s-Handler kollidierte mit
der39s-Vor-Quota-Wache des EUR-Lex-Readers. KleinsterFix: dort nur das noch
noetige29s-Original-/Abschlussbudget verlangen; die identische NACH-Quota-Wache
und die32s-Reservierungs-/Rueckgabereserve bleiben. Bei langsamer10sQuota
keinGET, sondern exakte Rueckgabe der eigenen Reservierung. Volle echte
Handler→Reader-Kette mit fortschreitender Uhr und10sRPC-Limit jetzt gruen,
ohne Lease-/Quote-/Deadlineerhoehung oder UNKNOWN-Freigabe.

Gezielt gruen:33Crawler,14EUR-Integration,71Anbieter,8Queue-Telemetrie,
9Mandatsphase und58Google-Haertung. PARDOK12 funktionale Gruppen ausschliesslich
mit `--gezielt`:40/12synthetischeDatensaetze, gleicher harter Byte-/Record-
Abbruch, Redirect und echter Dispatchnachweis an offenem Ein-Record-Stream.
Der historische5000/300Datensatzmodus wird nicht ausgefuehrt; Pflicht-CI
bindet den Mengenfilter ausdruecklich. Kein externer HTTP-/Modelltest.

Vor Integration zusaetzlich rot reproduziert: die neue durchgereichte Uhr ist
eine Funktion, der alte CELLAR-Fallback erwartete ein Date-/Zeitwertargument.
Nur an dieser bestehenden Schnittstelle wird die Uhr ausgewertet und als
Date gebunden. Vier neue gezielte Funktionsuhr-/Date-/Legacy-/Abbruchgruppen
gruen; das echte03–16Nov-Abfragefenster und Publikation13Nov bleiben erhalten.
Der11Runtime-/Testblobs bindende Evidence-Stand ist
`b12f6d459e310d34d17f091919453fe2249459c1`; ErstfehlerCI43818662436 bleibt
erhalten, bereits gruene Zwischen-CI43823257157 gilt nur fuer ihren alten Kopf.
Die heutige EUR-Lex-RSS-Fruehrueckgabe mit16Titelmetadaten ist als gesonderte
belegte Restursache erfasst; deren Originalpfadkorrektur folgt getrennt.

## Verbleibende Grenzen

Diese Korrektur beweist keine vollständige heutige Quellenversorgung oder
priorisierte Kundenausgabe. Die reguläre Kontrolle16Novhat60Vorgänge und zwei
Lageabsätze mit passender Quittung gezeigt, aber weiterhin Quellenlücke und
keine bestätigte Tagespriorität. Destatis/iRights besitzen je2statt3nötiger
Messungen; BMG ist aus dem vorhandenen Archiv wiedergewonnen, Nachanalyse offen.
Ungeklärte Medienrechte und sicher abgelehnte Metadaten werden nicht freigegeben.
Ein realer Folgeeffekt darf nur aus ohnehin autorisierten Produktläufen belegt
werden; alte Einmalrechte und unbekannte Abrufe werden nicht wiederholt.

Nächster Schritt: exakt geprüften Kopf nach grüner Pflicht-CI regulär integrieren
und den Rollout sowie erhaltene technische Produktbelege lesend kontrollieren.
