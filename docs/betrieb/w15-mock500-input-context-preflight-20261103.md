# Mock500: heutige Eingabekontexte und notwendige Vertragsentscheidung

## Tatsächlicher Eingabevorflug am 03.11.2026

[Run41620895888](https://github.com/ernisch/helmut-pilot/actions/runs/41620895888),
Job125866042098, Attempt1, exakt
`82d9b14fbf8095565eb775ca424f6eb852305b94`: **FAIL der heutigen Eingabezulassung**.
Die API-Jobdauer beträgt25s. Der vollständige
Mock500 wurde nicht gestartet. Die neue Nonce und der unveränderte Codekopf
stimmen in Freigabe, Übergabe, GitHub-Lauf und tatsächlicher Abschlussquittung überein.

Alle500 geplanten Eingaben wurden unter derselben Regel geprüft;
`bindingAccepted=true`, `inspected=500`, `all500Valid=false`.

| Kontextklasse | Tatsächliche Anzahl |
| --- | ---: |
| Gültig und nichtleer | 120 |
| Leer | 380 |
| Fehlend | 0 |
| Fachlich unbrauchbar | 0 |
| Technisch fehlerhaft | 0 |

Für **alle380** Leerfälle ist `timeOnlyExclusion=true`: Dieselben gebundenen
ranked/source-Objekte ergeben beim tatsächlichen heutigen Zeitpunkt keinen,
beim unveränderten ursprünglichen Qualifikationszeitpunkt jedoch einen nichtleeren
Kontext. Nur dieser Zeitparameter wurde in der reinen Vergleichsrechnung variiert.
Damit ist die zeitliche Quellenfilterung als Ursache für diese380 aktuellen
Leerzustände belegt. Weitere vollständige Mockphasen wurden nicht durchlaufen.
Ein historisch nichtleerer Kontext wird dadurch
nicht als heute zulässig oder als vollständiger Providererfolg ausgegeben.

Alle elf vorhandenen Originale mit217.563.454Bytes sind vollständig nach Größe
und SHA256 angenommen; GPG-Integrität, Manifest, gzip/USTAR und erneute private
Dateirücklesung: PASS. GPG-Prozess, eigener GPG-Agent und Node-Prozessgruppe:
PASS beendet.0Datenbankaktionen, Profilaktivierungen, Verarbeitungseinheiten,
Modellaufrufe und Artefaktuploads. Andere14JobsSKIPPED; anschließend0aktive
manuelle Läufe und0Artefakte. Originale, Drive, Secrets und historische Belege
bleiben erhalten. Keine automatische Branchrücksetzung.

Genau eine frische Drive-Linkrunde und ein POST. Tatsächliche Restgültigkeit
direkt vor dem POST253,465884s, gesamte serialisierte Parameter2785Zeichen.
Der Ausführungsbranch wurde sicher von e1 auf exakt82d9b14f vorgespult und bleibt
dort. Das einmalige Eingabe-GO ist verbraucht; kein Retry oder Linkrefresh.
Eine lokale Antwortauswertung wurde innerhalb derselben gespeicherten
Drive-Antwort korrigiert; es gab keinen zweiten Fetch oder zweiten Link.

Der vorhandene Reserve-/Swap-/Max-/OOM-Wächter wurde erfolgreich durchlaufen.
Dieser reine Vorflug aktiviert weiterhin keinen neuen gemeinsamen cgroup-
Hartgrenzwert (`dynamicHardLimitActivated=false`). Numerische RAM-, CPU- und
Verbindungspeaks sind hier UNKNOWN; dies ist keine Lebenszeit-RAM-,
Anbieter- oder vollständige Mock500-Abnahme.

End500-Funktion41325430429 und Empfang41037459441 bleiben übernommen; frühere
FAIL-Ergebnisse und die historische500/500-Qualifikation werden nicht umgewertet.
Die vorherige Kapsellesung41594105907 hatte bereits
`PROVIDER_CURRENT_CONTEXT_EMPTY` bewiesen, aber noch nicht den leeren Filter
originalgebunden für alle500 erklärt. Diese konkrete Lücke ist jetzt geschlossen.

## Warum der historische Bestandsweg nicht automatisch zulässig ist

Der Kommentar in `synthetik-500-w15-signed-chain-test.js`, Zeilen242–246,
bezeichnet die v1-Originale aus `NORMALIZED500_CURRENT_POLICY` mit Tag16.10.
Der dortige historische Request dient ausdrücklich nur als Protokollfixture;
`currentSenderQualified=false`, keine behauptete heutige Gleichwertigkeit.
Materials verwendet dagegen die separat gepinnten `QUALIFIED_ROWS` und den
500PASS-Bericht vom28.10. Ein Qualifikations-/Briefingdatum ist kein
Publikationsdatum. Der Kommentar allein beweist die Ursache für diesen Satz nicht.

Die vorhandene BT-Quellenfixture in `w15-current-mock-data.js` bindet tatsächlich
eine Publikation vom16.10.; am03.11. liegt dieser Tag außerhalb14Tagen. Die
Berliner Ersatzquelle vom23.10. liegt dagegen noch im Fenster. Der neue Vorflug weist die tatsächliche Zahl380 an den gebundenen Originalen
nach; private Ownerkennungen und Quelleninhalte werden nicht veröffentlicht.

Die vorhandene historische B2-Verarbeitung ist kein allgemeiner Datumsfallback:
`blocker2-d-historical-binding.js` verlangt Basisv2, festen Merkle-Bestand,
Original-/Owner-/Policy-/Hashbindungen und denselben Aufnahmetag11.10. für
Eingabe, Aufnahme und aktuellen Berliner Tag. Sie lässt weder die v1-Zeilen
noch den03.11. einfach zu. `acceptedSnapshot=true` erzeugt keine Capability.
Eine eigene historische Zulassung dieses Datensatzes wäre eine ausdrückliche
Vertragsentscheidung. Sie wird hier nicht aktiviert.

Unabhängiger enger Quellen-/Vertragsreview:
`02d94bc29a4b4c617473d72e5ceef10f4c3cb87c3e6a89d56df9977b20ea7672`.
Dieser Review hatte die Ursache vor dem Originalvorflug noch offen gelassen.
Der jetzige380er-Zeitvergleich belegt die heutige Ausschlussursache, erweitert
aber die historische B2-Zulassung nicht. Keine Schutzgrenze wurde geändert.

## Kleinster notwendiger Anschluss

Der begrenzte Mode `mock500-input-context-preflight` im vorhandenen manuellen
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
Unbrauchbar bezeichnet die tatsächlich abgelehnte Q-Kontext-/Reviewprüfung;
Modell-/Hash-/Kalenderbindungen und unerwartete Programmfehler sind technisch.
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

## Kleinste notwendige Vertragsentscheidung

**Entwurf `helmut-w15-mock-historical-qualified-source-replay/1`: noch nicht
freigegeben, implementiert oder aktiviert.** Die aktuelle14-Tage-Regel arbeitet
wie vorgesehen. Es ist kein Reparaturgrund, sie stillschweigend zu lockern.
Die alte Oct11-B2-Capability passt nicht zu diesem qualifizierten Bestand.

Für den verlangten isolierten Funktionsnachweis ist der kürzeste bestehende
Datenweg ein ausdrücklich historischer Quellenfixture-Vertrag:

1. Ausschließlich denselben bereits authentifizierten qualifizierten500er-Satz
   aus dem vorhandenen gehashten Archiv zulassen. Originalgrößen, Hashes,
   Quellen-/Publikationsdaten und der ursprüngliche Qualifikationsbericht bleiben
   unverändert. Keine neuen Quellen, Ersatzdaten, Schlüssel oder Neuqualifikation.
2. Für **alle500 gleich** den im Originalbericht gebundenen Qualifikationszeitpunkt
   nur als Quellen-Kontextzeit verwenden. Keine selektive Ausnahme für die380
   fehlgeschlagenen Positionen. Historischer Quellenbezug bleibt ausdrücklich
   gekennzeichnet; er ist kein aktueller November-Quellennachweis.
3. Reale Ausführungszeit, aktueller UTC-/Berliner Tag, Kalender-/Namespacebindung,
   Nonce, Commit, Freigabeablauf und Fristen bleiben tatsächlich aktuell. Kein
   manipuliertes Systemdatum, keine Rückdatierung von Originalen oder Laufrechten.
4. Dies ausschließlich in einem eng gebundenen Mock-Vertragszweig der vorhandenen
   Material-/Fixturebindung vorbereiten. Kein allgemeiner historischer Fallback,
   keine Änderung des Produktionsquellenfilters und keine pauschale B2-Öffnung.
5. Vor Aktivierung im späteren tatsächlichen Mockjob alle500 vollständigen
   Eingabe-/Provider-/Reviewbindungen unter diesem Vertrag prüfen. Der jetzige
   reine Zeitvergleich ersetzt diese Prüfung nicht. Bestehende Sicherheits- und
   Abnahmebedingungen bleiben unverändert:500gleichzeitigaktiveProfile,
   500Units,1000Mockphasen,1500einzelngeprüfteErgebnisse,8000Sicherheitskontrollen,
   17000Audits, Sicherung/Rücklesung/zweiteWiederherstellung/Integritätsvergleich,
   finale0 und bestätigter Prozessstillstand. Keine neue Originaldiagnose nur für
   Informationen, die diese notwendige Vorstufe im selben Mockjob liefern kann.
6. Pflicht-CI und unabhängige Bindungs-/Vertragsabnahme auf dem dann exakten Kopf.
   Erst danach ein neues konkretes Einmal-GO für den vollständigen Mock500.
   Dynamischer Hostschutz, Reserven, Zeitfenster, Kosten, Kommunikationsriegel,
   Quellenintegrität und Production-Sperren bleiben erhalten.

Eine ausdrückliche Betreiberentscheidung für diesen historischen Funktionsvertrag
fehlt. Ohne sie bleibt der aktuelle Mock500 blockiert. Falls stattdessen aktuelle
Novemberquellen zwingend sind, benötigen die tatsächlich betroffenen380
Kontexte neue freigegebene Fixtures und deren betroffene Bindungsprüfung;
keine pauschale Wiederbeschaffung oder automatische Neuqualifikation.

Ein späterer Funktions-PASS nach einem genehmigten historischen Vertrag wäre
weiterhin keine heutige Quellen-, Vercel-/Supabase- oder Production500-Abnahme.
Der jetzt ausgeführte Vorflug hat keinen vollständigen Mock500 freigegeben.
