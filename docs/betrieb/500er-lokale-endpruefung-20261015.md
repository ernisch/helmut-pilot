# Lokale Endprüfung der signierten Inhaltsbindung

Stand: 15.10.2026 UTC / 16.10.2026 Europe/Istanbul. Branch `codex/immutable-command-proof-20261015`, Ausgangscommit `a51fa44a4c91e5bdcdfdfdbb17b62f37a6df5ede`. Änderungen bleiben lokal und ungemergt.

**Teilweise abgeschlossen, durch tatsächliche Briefingeingaben blockiert.** Der ausdrücklich freigegebene lokale Architekturversuch wurde integriert und genau einmal vollständig gestartet. Offline90, echte Installation samt Original-U-Pfad, kalte Laufzeitvorbereitung, beobachtete Auth30-Mutationen und der Speicher des beobachteten Anwendungspfads bestehen. Die erste Unit stoppt korrekt wegen fehlender fachlicher Vollständigkeit; Unit60, weitere Requests und der vollständige500er-Start sind nicht nachgewiesen. Keine weitere CPU-/SHA-Optimierung, kein unveränderter Wiederholungsversuch.

## Nachfolgender Tagesanlass-Sprint

Die vollständige Quellenprüfung über alle500und zwei gezielte native Read-only-Aggregate ist abgeschlossen: kein Verlust von Quellen-/Datumfeldern, vorhandene Daten zu alt; auch im aktuellen Productionbestand kein aktueller Quellen-/Fristkandidat. Keine neuen Eingaben, kein neuer Auftrag oder Endlauf. Einzelzahlen, unabhängige DeepSeek-Prüfungen und verbleibende Freigabegrenze: [Tagesanlass-Ursachenbeleg](500er-tagesanlass-ursache-20261015.md). Die untenstehenden Laufzeiten bleiben Messungen des vorherigen lokalen Versuchs.

## Maßgeblicher lokaler Vertrag

Die zusätzliche ausdrückliche Betreiberfreigabe erlaubt eine getrennte einmalige vollständige Offlineprüfung höchstens90000ms und einen kryptografisch gebundenen, über Requests wiederverwendbaren Inhaltsnachweis. Die90s umfassen den vollständigen Aufruf einschließlich Datenbank, T/C, Einfrieren, erneuter nativer Prüfung und Persistenz. Laufzeitvorbereitung höchstens60000ms, jede Authmutation höchstens30000ms und Unit60 einschließlich aller16Kontrollen bis bestätigtem finalem CAS/ACK bleiben unverändert. Speicher maximal2048MB. Gesamtdauer einschließlich Offlinephase separat berichten.

Keine Productionaktionen, Migration, Aktivierung, Budgetänderung, kein Merge, Deployment oder bezahlter Productiontest sind damit freigegeben. Die bestehende native SQL-Proposal wurde in diesem Versuch nicht geändert oder neu installiert; die frühere Abnahme in isolierten Fixtures wird übernommen.

## Implementierter echter Datenbankpfad

Ein expliziter Offline-/Rootprozess liest und hasht den tatsächlich gespeicherten JSONB-Text, führt im geschlossenen quellgebundenen Worker vollständiges ursprüngliches T und C aus, friert den Graphen ein und liest die native unveränderliche Bindung erneut. Erst danach signiert er einen geschlossenen Ed25519-Beleg. Dieser bindet Operation, Originalcommandhash, tatsächliche Zeilenbytes/SHA/Datenbank/tableOID/xmin/ctid, Datenbankziel, native Quellen, Verifikatorquellen, exakte Nodeversion, Veröffentlichungspolicy, Ausstellung und festes Ende. Ablauf spätestens Planende und höchstens9h; Zugriffe verlängern ihn nicht.

Ein neuer Runtimeprozess hat nur den unabhängig konfigurierten öffentlichen Schlüssel. Er prüft Signatur und Bindungen, liest tatsächliche gespeicherte Bytes, führt vollständiges T und den ursprünglichen kanonischen Commandhash aus, friert ein und prüft nativ erneut. Ein C-Durchlauf erfolgt dabei nicht. Ein fehlender/ungültiger Beleg bewirkt keinen automatischen Offline-Neuaufbau.

Alle10Commandabrufe und6Admissionkontrollen bleiben. Sie lesen native Bindung und die gesonderte signierte Root-Freigabe frisch. Berechtigungen, GO, Profile, Quellen, Finanzen, Zeiten, Notstopp, Journal, Claims und CAS/ACK behalten ihre ursprünglichen Prüfungen. Wiederverwendet wird ausschließlich unveränderlicher Inhalt. Die Rootfreigabe wird erst nach echten ursprünglichen Root-FS-/Gate-/Original-TestGO-Prüfungen signiert; ein Inhaltsbeleg allein ist keine Ausführungsfreigabe.

Private Proofs sind einmalig sowie an tatsächliche Command-/Packetidentität, Requestsession und Freigabegeneration gebunden. Der gezielt gefundene Fehler „Proof vor erster Freigabe noch nach Packetwechsel konsumierbar“ ist korrigiert und im Negativtest abgewiesen. Unbekannte/fremde Commandobjekte erhalten keinen Inhaltsnachweis; der echte ursprüngliche U-Vorgänger behält seinen vollständigen ursprünglichen Datenbank-/T-/C-Pfad.

## Tatsächlich gemessene Endsequenz

Echte lokale PostgreSQL-/PostgREST-Zugriffe, originaler HTTP-Einstieg/Adapter/Installation, Node24.19.0, CPU-Affinität0, kein Profiler und kein Speicherpolling. Nur externe Freigaben und die kostenpflichtige Anbietertransportgrenze sind fiktive lokale Testgrenzen. Beide Anbieterantworten waren auf19900ms verzögert; die originale20000ms-Frist blieb unverändert.

| Messung | Tatsächlicher Wert | Bewertung |
|---|---:|---|
| Vollständige Offlineprüfung einschließlich Persistenz |55.650,014ms|PASS ≤90000ms|
| Darin vollständiges ursprüngliches C / T |47.857,847 /6.011,542ms|genau je1Durchlauf|
| Installation einschließlich kalter Wiederherstellung, Root-FS und Auth-ACK |13.141,825ms|PASS; Original-U positiv|
| Kalte Runtimevorbereitung im neuen Prozess |12.688,042ms|PASS ≤60000ms; vollständiges T+Originalhash, C0|
| Höchste beobachtete Authmutation einschließlich Queue/Lesen/Callback/CAS/ACK |499,811ms|PASS ≤30000ms; Installation|
| Höchste der8Runtime-Authmutationen |430,645ms|PASS ≤30000ms|
| Erste Unit |kein finaler ACK|NICHT bestanden; keine gültige Unit60-Erfolgszeit|
| HTTP des abgebrochenen Startrequests |72.668,849ms|enthält getrennte Vorbereitung; keine Unit60-Zeit|
| Alle16Kontrollen nach J.enter |10Loads+6Admissions|erreicht; Abschluss fehlt|
| Zweiter/wiederverwendender HTTP-Request |nicht gestartet|nicht gemessen|
| Vollständige beobachtete Sequenz inklusive Offlinephase und Negativfall |157.722,700ms|Abbruch nach erster Unit|
| Höchster Node-RSS einschließlich Workerthreads |993.636.352Bytes|<2.048.000.000Bytes im beobachteten Pfad|

Der RSS ist der Kernelhöchststand des jeweiligen vollständigen Nodeprozesses samt Workerthreads. Die Anwendungsphasen laufen nacheinander. Externe PostgreSQL-/Gatewayprozesse gehören nicht zum Functionbudget; der separate Messrunnerpeak wurde im abgebrochenen Sequenzbericht nicht erfasst und wird nicht geschätzt. Ein erfolgreicher vollständiger Unit-Speicherpfad und ein500er-Lastbeleg fehlen.

Eine erneute vollständige C-Prüfung wurde im echten Runtimepfad tatsächlich vermieden (C0). Ein erfolgreicher über mehrere HTTP-Requests fortgesetzter Unitpfad wurde nicht gemessen. Die Zahlen sind keine gleichzeitige Vorher-/Nachher-Messung und kein Nachweis einer garantierten Productiongeschwindigkeit oder9h-Gesamtdauer.

## Konkreter Abbruchgrund und Datenprovenienz

Beide echten lokalen Kosten-/Sendetickets wurden ordnungsgemäß beansprucht und abgerechnet; Lage.available=true. Die gespeicherte Mandatsbriefingzeile ist jedoch strukturell unvollständig: `briefing-ohne-tagesanlass`. Daher erstellt der unveränderte Pfad keine Morgenquittung. Die vorgeschriebene Drei-Positionen-Bedingung schlägt vor dem finalen Unit-ACK fehl. Die Ablehnung erfolgte vor der60s-Deadline; sie beweist weder einen erfolgreichen Unitabschluss noch eine Deadlineüberschreitung.

Die enge Prüfung des bereits übernommenen500er-Eingabebestands zeigt: `currentHelmutState.tagesAnlass` fehlt in500/500 Briefings bereits dort. Der erste vollständige B2-Input und das Briefing stimmen exakt mit der lokalen Commandfassung überein; das tatsächlich gespeicherte Briefing stimmt ebenfalls mit dem Original überein. Der erste Zustand ist ein echter ursprünglicher Leerzustand (`primaryItem=null`,42ignorierte Items, „Kein belegter Hauptvorgang verfügbar.“). Keine lokale Datums-/CPU-/Bindungsänderung hat den fehlenden Anlass erzeugt.

Der zugrunde liegende übernommene Command ist ausdrücklich ein historischer, quellenvalidierter Layoutbeleg (`HISTORICAL_UNADMITTED_LAYOUT_ONLY`), kein Beleg vollständiger1500Ausgaben oder eines erfolgreichen Starttors. Die vorhandenen abgegrenzten Belege enthalten keine vollständigen500Ergebnisbriefings. Dies trifft keine Aussage über ungesehene Archivdateien; der geschlossene Archivnachweis wurde nicht erneut untersucht.

Commandhash `ee752e9689abccdc1da0b7b31dc58f012d0ac15829827607227e9275a1cb78c6` bleibt unverändert. Die beanspruchte lokale Operation steht `unknown`, Index0, ohne bestätigtes Unitoutput. Kein Next und kein Retry. Vorhandene Profile wurden nicht aktiviert oder aktualisiert. Original-U-Zeile und U-Journal blieben bei Installation erhalten. Die getrennte ursprüngliche Datenbank wurde nicht verändert.

## Sicherheitsbelege und Grenzen

70eindeutige gezielte Fälle sind über exakt belegte Delta-Komposition bestanden; dies war ausdrücklich kein erneuter70er-Gesamtlauf. Nach dem minimalen letzten Fix wurden die zwei betroffenen Fälle erneut geprüft. Abgedeckt sind Signatur-/Feldmanipulation, fremde Schlüssel/Ziele/Quellen/Policy/Zeilen, Ablauf, Neustart, Sessions/Parallelkonflikte, unveränderliche Graphen, gefälschte/alte/einmalige Proofs, tatsächliche Root-FS-Gates und16frische Kontrollen. Diese Tests verwenden gemockte Backend-/Voll-C-Grenzen und werden nicht als native Performance ausgegeben.

Der tatsächliche öffentliche Runtimeprozess mit gültigem Inhaltsbeleg, aber ohne Rootfreigabe, lieferte nach kalter Wiederherstellung HTTP409 in13.193,209ms vor Dispatch, Authmutation und Anbieterwirkung; Command/U/Auth blieben unverändert. Positive Installation las den tatsächlichen Original-U und bestand beide ursprünglichen U→DR-Ablaufprüfungen.

16Adaptergruppen und8Direktvertragsgruppen bestanden. Die ursprüngliche T/C/F-, native SQL- und Paketierungsabnahme wird dort übernommen, wo unverändert. Keine erneute breite Untersuchung.

DeepSeek V4 Pro High prüfte den neuen Lebenszyklusentwurf bedingt. Seine größere neue Codeprüfung endete am Antwortlimit und ist keine Codeabnahme. DeepSeek Flash High prüfte separat die tatsächliche Signaturfeldmatrix ohne konkreten Feldwiderspruch. Unabhängige Sol-Abnahme prüfte tatsächliche private Backend-/ALS-/Root-FS-/Callsiteintegration sowie die Fehlerkorrektur; der abschließende native Teilabgleich bestätigt ausdrücklich den fehlenden Unitabschluss. Diese Teilprüfungen ersetzen keine500er-Endabnahme.

Bei verspätetem/unklarem Persistenz-ACK könnte eine signierte reine Inhaltszeile verbleiben, obwohl die vollständige90s-Phase fehlgeschlagen zählt. Es gibt daraus kein Ausführungs-GO, keinen automatischen Retry/Resume und keine Startbereitschaft. Im tatsächlichen erfolgreichen Offlineaufruf trat dieser Fall nicht auf; die Publikationsunsicherheit ist keine behauptete gelöste Recoveryfunktion.

## Kleinster sinnvoller weiterer Schritt

Vollständige, tatsächlich quellenbelegte Briefingeingaben mit echtem zulässigem Tagesanlass für alle500herleiten oder übernehmen, die geänderten Eingaben frisch fachlich prüfen und kryptografisch neu binden. Originale und alte Urteile erhalten; keine Platzhalter, keine erfundenen Anlässe, keine Änderung des Vollständigkeitsprüfers und kein Umetikettieren historischer Ereignisse als heutige. Danach genau ein neuer, unbeanspruchter lokaler Command mit neuem Inhaltsbeleg und gezielter vollständiger Unit60/Auth30-Endprüfung. Der beanspruchte fehlgeschlagene Auftrag ist kein Wiederanlaufkandidat.

Zusätzlich vor Production offen: tatsächliche native unveränderliche Speicherung/RPC und Rollenprüfung, kontrollierte Public-Key-Verteilung ohne privaten Runtimekey, exakte unterstützte Node-Patchversion/Paketbindung und Productionperformance, vollständiger Infrastrukturkostenvertrag, frische Lauf-/Zeitfenster-/Notstopp-/Kostenbindung und finales separates GO. Die lokale Fixture verwendete den unveränderten fail-closedDefault50Modellcalls/Tag;2lokale Calls beweisen keine1000Calls-Konfiguration. Kein Limit wurde geändert. Bereits gelieferte Ownerkostenwerte bleiben übernommen, vCPU unbekannt, SupabaseSpendCap mit seinen Ausnahmen; keine Daten erneut angefordert.

Ein sicherer Productionstartzeitpunkt ist noch nicht belegt. Der lokale Prüfvertrags-GO ist keine Productionfreigabe.

## Primärbelege

- `/workspace/helmut-parallel-20261015/wave9/FINAL_LOCAL_ASSESSMENT.SAFE.json`
- Im Unterordner `native-fixture`: `OFFLINE_RESULT.SAFE.json`, `NO_AUTHORITY_RESULT.SAFE.json`, `INSTALL_RESULT.SAFE.json`, `RUNTIME_FAILURE.SAFE.json`, `SEQUENCE_FAILURE.SAFE.json`, `ORIGINAL_B2_PROVENANCE_READONLY.SAFE.json`.
- Unabhängige Integration: `wave9/signed-tests/REVIEW.SAFE.json`, `COMPOSED70.SAFE.json`, `AUTHORITY_GENERATION_FIXED_DELTA.SAFE.json`.
- DeepSeek: `wave9/pro-proof-design/FULL_RESULT.json`, `wave9/flash-field-matrix/FULL_RESULT.json`; gescheiterte Codeprüfung `wave9/pro-proof-code/FAILURE.json`.
- Frühere gescheiterte60s-Vorbereitung vor Zusatz-GO: `wave8/native-fixture/END_RESULT.SAFE.json`,60.095ms Ablehnung, kein Auth/Unit/Provider; nicht wiederholt und nicht als neuer90s-Fehlschlag ausgegeben.

Alle Pfade unter `/workspace/helmut-parallel-20261015`, sofern nicht absolut angegeben. Private Rohdaten, Keys und Token verbleiben außerhalbGit und werden nicht übertragen.
