# Mock500: heutige Eingaben vor dem nächsten Gesamtlauf prüfen

## Belegte Ursache und offene Eingabefrage

Run41554774560 bleibt Materials-FAIL. Die unabhängig angenommene Kapsellesung
41594105907 beweist `PROVIDER_CURRENT_CONTEXT_EMPTY`: der echte Providerkonstruktor
erhielt nach `B.pruefe`/`L.prepareDContext` einen leeren aktuellen Quellenkontext.
Es gibt noch keine originalgebundene Bilanz, welcher Filter ihn leert.

Der Kommentar in `synthetik-500-w15-signed-chain-test.js`, Zeilen242–246,
bezeichnet die v1-Originale aus `NORMALIZED500_CURRENT_POLICY` mit Tag16.10.
Der dortige historische Request dient ausdrücklich nur als Protokollfixture;
`currentSenderQualified=false`, keine behauptete heutige Gleichwertigkeit.
Materials verwendet dagegen die separat gepinnten `QUALIFIED_ROWS` und den
500PASS-Bericht vom28.10. Ein Qualifikations-/Briefingdatum ist kein
Publikationsdatum. Der Kommentar allein beweist die Ursache für diesen Satz nicht.

Die vorhandene BT-Quellenfixture in `w15-current-mock-data.js` bindet tatsächlich
eine Publikation vom16.10.; am03.11. liegt dieser Tag außerhalb14Tagen. Die
Berliner Ersatzquelle vom23.10. liegt dagegen noch im Fenster. Welche der500
Originalzeilen betroffen sind, ist ohne ihren gebundenen Kontext nicht belegt.

Die vorhandene historische B2-Verarbeitung ist kein allgemeiner Datumsfallback:
`blocker2-d-historical-binding.js` verlangt Basisv2, festen Merkle-Bestand,
Original-/Owner-/Policy-/Hashbindungen und denselben Aufnahmetag11.10. für
Eingabe, Aufnahme und aktuellen Berliner Tag. Sie lässt weder die v1-Zeilen
noch den03.11. einfach zu. `acceptedSnapshot=true` erzeugt keine Capability.
Eine eigene historische Zulassung dieses Datensatzes wäre eine ausdrückliche
Vertragsentscheidung. Sie wird hier nicht aktiviert.

Unabhängiger enger Quellen-/Vertragsreview:
`02d94bc29a4b4c617473d72e5ceef10f4c3cb87c3e6a89d56df9977b20ea7672`.
Quellenalterung ist damit ein konkreter Kandidat, für den tatsächlichen Lauf
aber weder abschließend bewiesen noch widerlegt. Keine Schutzgrenze ändern.

## Kleinster notwendiger Anschluss

Neuer begrenzter Mode `mock500-input-context-preflight` im vorhandenen manuellen
CI-Workflow. Derselbe geprüfte Empfänger liest das bestehende17,78MB-GPG/gzip/
USTAR-Archiv mit elf Originalen,217,56MB Nutzlast und unveränderten Manifest-/
Größen-/Hash-/Empfängerbindungen. Keine neuen Quellen, Schlüssel oder Secrets.

Nur der tatsächliche Node24.19-Konstruktorpfad wird benötigt. Kein Dockerimage,
NPM-Download, PostgreSQL, PostgREST, End500-Restore,15zusätzliche Cipherteile,
Controller, Profilaktivierung, Verarbeitungseinheit oder Modellaufruf.
Dies folgt dem in PR968 dokumentierten GitHub-/Offline-Weg. End50041325430429,
Originalempfang41037459441 und historische500/500-Qualifikation bleiben erhalten.

Die bisherigen Empfangsmodi, Starttore und vollständigen Mockanforderungen bleiben
erhalten. Der neue Zweig verlangt eine eigene frische Freigabe auf den exakten
Commit, neue Nonce, Attempt1, maximal einen Empfang, aktuellen UTC-/Berliner Tag
und das gültige03.–07.11.-Fenster. Er darf kein altes Empfangs-/Materials-/FullGO
übernehmen. Der gemeinsame Funktionsketten-Slot verhindert konkurrierendes
Starten im selben Ref; laufende Jobs werden nicht automatisch abgebrochen.

## Alle500 Eingaben und tatsächliche Quellenprüfung

Alle elf Dateien werden vom vorhandenen Archivdecoder authentifiziert. Für den
Vorflug liest Node ausschließlich den gebundenen500PASS-Bericht,500Zeilen,
500Mockfixtures und die unveränderte Publikationspolicy mit festem Hash.
Besitzer müssen eindeutig und zwischen den Listen exakt gleich sein. Der echte
Kalenderbinder verändert nur die bereits erlaubten Kalender-/Hashfelder.
Originalquellen, Daten, qualifizierte Antworten und Prüftexte bleiben unverändert.

Für jeden geplanten Index wird derselbe echte `calendarFixture`-Pfad mit B/L/AI/Q
verwendet, ohne Providerinstallation oder Versand. Jede Position erhält eine
feste Klasse: gültig, fehlend, leer, fachlich/unbrauchbar oder technisch fehlerhaft.
Ein Eingabefehler beendet die rein lesende Untersuchung der übrigen Positionen
nicht; es findet keine500er-Verarbeitung statt. Ein tatsächlicher Schutzfehler
stoppt dagegen sofort. Eine global ungültige Fixture-/Plan- oder Zeitbindung
liefert `inspected=0` mit technisch blockierten Positionen. Fehlt bei gültigem
500er-Plan eine Originalzeile, werden dagegen alle500Positionen geprüft und
die betroffene Position als fehlend gezählt; `bindingAccepted=false` verhindert PASS.

Nur für leere Kontexte vergleicht der Vorflug dieselben geprüften ranked/source-
Objekte einmal beim tatsächlichen heutigen Ausführungszeitpunkt und einmal mit
dem unveränderten ursprünglichen Qualifikationszeitpunkt. Stellt allein dieser
Zeitparameter einen nichtleeren Kontext wieder her, wird `timeOnlyExclusion=true`
gemeldet. Andernfalls bleibt die Ursache UNKNOWN. Der Vergleich qualifiziert
keinen historischen Kontext als heutigen Input; kein Systemdatum wird manipuliert.

Öffentlich sind nur feste Kategorien, begrenzte Zähler und Indizes0–499, keine
Ownerkennungen, Texte, Quellenadressen, Fehlerrohwerte oder privaten Pfade.
Ein PASS verlangt500tatsächlich geprüfte gültige nichtleere Kontexte sowie
gültige D/R-Konstruktor-/Antwortbindungen. Der bestehende FullMock muss dieselben
Originale im eigenen Runner empfangen und vor Aktivierung erneut auf den dort
frischen tatsächlichen Zeitbezug prüfen; ein späterer Tag wird nicht vorab genehmigt.

## Begrenzung, Stopp und Rückweg

Empfang plus Vorprüfung maximal600s, äußerer Job15min. Bestehender vollständiger
Empfangsplattenplan mit mindestens1GiB Reserve bleibt erhalten. Keine Uploads,
Caches oder zusätzliche externe Artefaktspeicherung; bestehender Kostendeckel
höchstens0,05USD, keine bezahlten Modelle oder neuen Ressourcen.

Vor Datenzugriff wird die vorhandene dynamische Hostkapazitätsprüfung verwendet;
dieselben Wächteraufrufe prüfen mindestens2147483648Byte Hostreserve,
unveränderte übergeordnete Grenzen, beobachteten Swap und neue Max-/OOM-Ereignisse.
Dieser kleine reine Eingabevorflug aktiviert keinen neuen gemeinsamen cgroup-
Hartgrenzwert und ist ausdrücklich keine neue Lebenszeit-RAM-Abnahme:
`dynamicHardLimitActivated=false`. Die vorhandenen dynamischen harten Grenzen
des vollständigen Mock500 bleiben unverändert. Keine Cachemanipulation, kein
Peakreset, keine RAM-Optimierung oder Anbieterbehauptung.

Der Node-Kindprozess erhält keine Zugangsdaten, nur die private Eingabedeskription
über stdin und den vorhandenen lokalen Netzschutz. Die eigene Prozessgruppe und
der eigene GPG-Agent werden beendet und nachgeprüft. Unbekannter Stopp bleibt
UNKNOWN. Keine Originale löschen, Secrets/Drive/Belege verändern oder Branches
automatisch zurücksetzen. Kein Retry, keine zweite Linkrunde, kein anderer Ref.

## Gezielte Entwicklungsnachweise

500er-Prüfkern mit vollständig erfundenen lokalen Eingaben: PASS für500gültige
Kontexte und getrennte Fehlergegenprobe mit496gültig/1fehlend/1leer/1unbrauchbar/
1technisch, einschließlich letzter Position. Keine Originalqualifikation daraus.
Separate Freigabe-/Tageswechsel-/Sicherheitsprojektion und eigener Gruppenstopp
synthetisch geprüft. Bestehende sieben Archiv-/Transportprüfungen und actual-
Workflow-Routing einschließlich alter Modi bestehen. Pflicht-CI und unabhängigen
Review am endgültigen Kopf im Draft-PR belegen; keine erfolgreiche500er-Ausführung
behaupten. Der versuchte DeepSeek-Helfer lieferte wegen Antwortlimit keine Änderungen;
Sol integrierte den Prüfkern, ohne weiteren Modellversuch.

## Nächste tatsächliche Freigabegrenze

Nach grüner Pflicht-CI und unabhängigem Review: genau ein originalgebundener
Eingabevorflug auf dem dann exakt benannten Kopf in `helmut-ci-originals`.
Erlaubter sicherer FF vom unveränderten Ausführungsbranch e1 auf diesen Kopf;
sämtliche Vorbereitungen vor genau einer frischen privaten Linkrunde zum
bereits vorhandenen Archiv abschließen. Linkrestzeit unmittelbar vor dem
einzigen POST>90s, sämtliche Parameter<=65535Zeichen. Neue Nonce und neue
explizite Input-Prüffreigabe, keine stillschweigende Verwendung alter GOs.

Dieses GO ist noch nicht erteilt. Noch sind die500Originalkontexte UNKNOWN.
Bei Altersnachweis nur den tatsächlich betroffenen Quellen-/Vertragsumfang
zur Entscheidung vorlegen; keine pauschale Neuqualifikation. Bei anderem
belegtem Übergabefehler nur diesen korrigieren und gezielt prüfen. Erst nach
500/500gültigen Eingaben und unabhängiger Prüfung ein konkretes FullMock-GO
vorlegen. Dessen500gleichzeitigaktiveProfile/500Units/1000Mockphasen/1500Ergebnisse/
8000Kontrollen/17000Audits sowie Sicherung/Rücklesung/Rücksicherung/Integrität/
finale0 und Prozessstillstand bleiben vollständig Pflicht. Production bleibt gesperrt.
