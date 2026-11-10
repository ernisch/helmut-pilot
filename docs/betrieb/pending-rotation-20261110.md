# Pendingrotation: Produktionsfehler vom10.11.2026

## Umfang und Beleg

Livebasis/main `c37d85f8501b67af8b892cfd863ba5d0053c67f1`, PR1115,
Production `dpl_6ANXMeFr785PG4WQ94nMUGJbgHZ5` READY. Alle acht regulären
Quellenfenster03:00–04:45UTC scheiterten mit `pending-bestand-nicht-lesbar`,
jeweils0verarbeitet. Heute0neueRohdokumente, kein Tagesmanifest.

Nativ bestätigter verarbeitbarer Pendingbestand12254; Tagesrotation10.11.2026:
`(floor(UTCmillisekunden/86400000) % ceil(12254/5))*5 = 5795`.
Der Pendingplaner zählt/rotiert den gesamten passenden Bestand, sein Leser
benutzt jedoch `listKnowledgeObjects` mit Veröffentlichungsoffset≤5000.
Das wirft `publication-candidate-offset`, wird als Speicherfehler zurückgegeben
und beendet die Planung vor allgemeinem Enqueue. Kein Beleg fachlicher Irrelevanz.

## Gezielte Reparatur und Prüfweg

Eigener Pendinglesevertrag statt optionalem Bypass am Publikationsleser:
festesstatuspending, identische NULL-sichere Verarbeitbarkeitsfilter wie Zählung,
stabile Ordnung, begrenzte Portion, geprüfter ganzzahliger Offset ohne5000erKappung.
Der Publikationsleser und seine5000erGrenze bleiben unverändert.
Lesefehler bleiben Fehler, kein leeres Erfolgsergebnis. Keine Migration,
Anbieter-, Profil-, Modell-, Budget- oder Productionkonfigurationsänderung nötig.

Regression mit Tageszahl12254 undOffset5795 über tatsächlichen Storageadapter,
keine12254Testobjekte/Lastprüfung. Folge bis Quellenplanung sowie fortbestehende
Briefingsperre bei unbekannter/offener Versorgung prüfen. Erst nach bestätigtem
Fortschritt darf der vorhandene Partial-CAS ein vollständigeres Paket speichern;
kein pauschales Entsperren von Briefings oder Überschreiben historischer Komplettpakete.
Gezielte lokale Nachweise:7/7Pending-Rotationsgruppen über tatsächlichen Storageadapter/
Loopback-HTTP,71/71Rückstand,63/63Terminalschutz,7/7Briefingversorgung und10/10Versorgungsstand.
Fünf synthetische Datenzeilen plus Countmetadata statt12254Testobjekten; keine Modelle,
Originale oder Productionwrites. Unabhängiger Review, endgültiger Commit und reguläre
Pflicht-CI werden mit tatsächlichem Ausgang im PR gebunden.

## Frischer Kosten-/Arbeitsstand und Nachholung heute

Lesestand10.11.2026,08:25UTC: bestehender Geldvertragshash
`8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348`,
1USD/UTC-Tag,30USDinsgesamt;1.185307USDgebunden,56Bucheinträge, nicht zurückgesetzt.
Zwei reguläre Lageaufrufe heute:0.012665USDabgerechnet; im heutigen Gelddeckel
rechnerisch0.987335USD übrig, insgesamt28.814693USD bis zum unveränderten Deckel.
Vor einer späteren Ausführung neu lesen: zwischenzeitliche Reservierungen oder
unbekannte Ausgänge dürfen diesen Spielraum reduzieren. Keine Kapazitätsgarantie.

Global heute bereits8/8Fenster und2400/2400reservierteFunktionssekunden verbraucht,
alle acht Slots belegt.0zusätzlicheOriginalversuche beobachtet; der bestehende
16erOriginaldeckel bietet allein keinen Workerzeitspielraum.0aktiveQueueaufträge,
kein Tagesmanifest. Früher Fehler gibt konservativ reservierte Zeit nicht frei.

**Heutige Nachholvorlage unter unveränderten verbindlichen Grenzen: nicht ausführbar.**
Verfügbare Fenster0, verfügbare reservierbare Sekunden0. Daher0außerplanmäßige Aufrufe,
0Modelle,0Originalabrufe; keine Zählerkorrektur, keine Mehrfachnutzung alter Slots,
keine Zeitverschiebung zur Umgehung des UTC-Tagesvertrags und kein Ersatzkanal.
Ein zusätzlicher heutiger Workeraufruf benötigte eine neue Arbeitslimit-Ausnahme
außerhalb dieses Pakets; sie wird weder unterstellt noch als Geldbudgetfreigabe getarnt.

Kleinste ausführbare Fortsetzung innerhalb der Grenzen: Reparatur regulär ausrollen,
erstes vorhandenes Fenster11.11.03:00UTC; Tageszähler erneuern sich nur regulär durch
UTC-Tageswechsel. Bis04:45höchstens8Fenster/2400Sekunden/16Originalversuche global,
weiterhin1USD/Tag und30USDgesamt. Die vorhandenen05:00/05:15Briefingtermine verwenden,
keine zusätzlichen Wiederholungsjobs. Kein Versprechen vollständiger Tagesversorgung.
Plattformkosten außerhalb des Modellvertrags bleiben unbekannt; keine neuen Dienste.

## Freigabe, Nachkontrolle und Rückweg

Ausstehend: konkreten neuen PR/Commit nach grünen Pflichtchecks für Merge nach main
und automatischen regulären Productionrollout im bestehenden helmut-pilot freigeben.
Keine zusätzliche Konfiguration/Migration/Aktivierung. Keine heutige Nachholung
wird mit dieser Rolloutvorlage ausgeführt. Vor Rollout Head/main/Checks, Konflikte,
aktive Prozesse/Leases, Profil-/Budgetbindung und Vorwerte erneut lesen.

Nach READY Alias/Version lesen. Beim nächsten regulären Fenster Offset und bestätigte
Pendinglesung, erzeugtesManifest/Enqueuefortschritt, Sourcejobs und verbleibende Reste
getrennt belegen. Nachfolgend tatsächlichen Quelleninhalt bis gespeichertem Lage-/
Briefingvertrag und zulässiger Anzeige prüfen. Solange Versorgung offen/unbekannt ist,
muss die Sperre ehrlich bleiben; Patch/READY allein beweisen kein Kundenbriefing.

Rückweg bei belegter Regression: vorherige Runtimec37d85f8/Deployment
`dpl_6ANXMeFr785PG4WQ94nMUGJbgHZ5` wiederherstellen beziehungsweise gezielt revertieren.
Dieser Stand enthält den bekannten Pendingfehler; er ist ein Runtime-Rückweg, kein
Versorgungsnachweis. Keine Queue/Belege/Artikel/Profile/Buchstände oder Zähler löschen.

## Wiederaufnahme im bestehenden Sprint

Arbeitszweigcodex/pending-rotation-20261110, eigenerWorktreehelmut-pending-reparatur
auf frischem mainc37d85f8; alte lokale Rolloutdokumentation bleibt erhalten.
Storage-/Regression getrennt implementiert, unabhängiger Abschlussreview vorgesehen.
Vor jedem Push vollständige Workflowtrigger prüfen; Branchpreview explizit gesperrt.
Bis zu neuem konkretem GO nur Code/isolierteTests/PR, keine Productionwrites,
Originale, kostenpflichtigenModelle, manuellenLäufe, Merges oder Deployments.
Endkopf und tatsächlicher vollständiger CI-Ausgang werden im PR gebunden; Fehler
werden konkret behoben, nicht durch geänderte Schutzbedingungen übergangen.
