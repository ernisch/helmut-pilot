# Materials: vorhandene Fehlerkapsel gelesen, leerer Kontext nachgewiesen

## Tatsächliche Kapsellesung

[Run41594105907](https://github.com/ernisch/helmut-pilot/actions/runs/41594105907),
Job125777318578, Attempt1, exakt
`e1aaa56d0fb6a837ab7ac85f4388c084cc26e460`, Environment `helmut-ci-originals`:
**PASS_EXISTING_CAPSULE_READ_ONLY**, tatsächliche Jobdauer10s.
Nonce `771bd8cc-3398-402d-ac6e-f730619131c1` ist in der tatsächlichen Quittung
bestätigt. Ein genehmigter sicherer Fast Forward3a→e1, ein POST mit760Byte,
eine Kapsellesung. Andere13Jobs SKIPPED. GO und Nonce sind verbraucht.

Gelesen wurde ausschließlich das vorhandene Artefakt13193926779 aus
[Run41554774560](https://github.com/ernisch/helmut-pilot/actions/runs/41554774560),
Quellcommit `3a052b3edace0413e7d9c4cbda8d1735ab4bfe64`.
Cipher10699Byte, SHA256
`ff439a2096781df92bab102d722acb42544ab8a09c63dfd51a45cede3810f298`.
Cipherpin, GPG-Integrität, Quellkontext und eigener GPG-Agentstopp: **PASS**.
Die zwei vorhandenen Empfängersecrets bleiben unverändert.

Keine Drive-Linkrunde, keine Originalarchive, DB-Aktionen, Profilaktivierungen,
Verarbeitungseinheiten, Modellaufrufe oder Uploads. Frische externe Nachkontrolle:
0aktive manuelle Läufe,0neue Artefakte, Ausführungsbranch exakt e1.
Das ursprüngliche Artefakt läuft unverändert am04.11.2026 um00:45:42UTC ab;
seine bereits bytegeprüfte verschlüsselte private Kopie bleibt erhalten.

Unabhängige tatsächliche Leseabnahme: **PASS**, privater Bericht-SHA256
`5d8c7ead2f9aba445150957dd6bb42be28362402382ba97aef389efb5b569df3`.
Code, Pflicht-CI41560013763 und unabhängiger exakter Kopf-Review aus
[PR1025](https://github.com/ernisch/helmut-pilot/pull/1025) bleiben übernommen.
Rawlogs, tatsächliche Quittung, Einmaljournal und Abnahme bleiben privat im
vorhandenen08er-Belegbereich, getrennt als Kapsellesung41594105907 erhalten.

## Erste innere Prüfstelle jetzt belegt

Die Quittung erhält den äußeren Erstfehler
`MATERIALS_BINDING_CHECK_132 / assertion / calendar` und verfeinert ihn zu
**`PROVIDER_CURRENT_CONTEXT_EMPTY`**. Die feste geprüfte Projektion identifiziert
`scripts/fixtures/w15-unit0-provider.js`, Zeile24: `koLite.length > 0` scheitert.

Damit sind der Aufruf von `B.pruefe` und die Rückgabe von `L.prepareDContext`
bereits erreicht. Der resultierende aktuelle Quellenkontext ist leer.
Template-/Reviewprüfung und die vier anschließenden Kopien sind nicht erreicht.
Private Fehlertexte, Werte, Originalinhalte und Pfade wurden nicht veröffentlicht.

**Warum** der Kontext leer wird, ist aus dieser Kapsel weiterhin **UNKNOWN**.
Der vorhandene Code kann Quellen unter anderem wegen Themenmischung,
Quarantäne, URL-/Titel-/Datumsprüfung, Publikationsfenster, Standtag,
Inhaltslänge oder Kontextbudget ausschließen. Die Quittung enthält weder die
betroffenen Originalquellen noch eine Bilanz dieser Filter.
Die konkrete innere Prüfstelle ist damit bekannt; ein bestimmter Daten- oder
Programmierfehler ist noch nicht bewiesen.

Unabhängige reine Codeprüfung bestätigt diese Grenze; privater Bericht-SHA256
`2113f5b7902e649cee2147f75dc34e654239dd5047bfa3f090d425ea935a530e`.

## Kleine synthetische Gegenprobe

Eine im Speicher ausgeführte Variante der vorhandenen
`test_mock500_calendar_fixture.js`, über `scripts/lokal.js`, verwendet ausschließlich
erfundene Quellen und Profile, den echten Binder und die echten Providerkonstruktoren:

- Quelle28.10., historische Konstruktion28.10., fiktiver Ausführungstag03.11.:
  **PASS**, bestehende Requestbindung wird korrekt erneuert.
- Quelle16.10., dieselbe historische Konstruktion28.10., Ausführungstag03.11.:
  historischer Aufbau **PASS**, aktuelle Vorbereitung weist genau
  `w15-unit0-provider-empty-context` zurück. Umgebung und fiktive Originalobjekte
  bleiben unverändert.

Das unterscheidet gültigen und abgelaufenen fiktiven Zeitbezug. Es beweist nicht,
dass Quellenalter den tatsächlichen Originalfall verursacht hat. Systemdatum,
Originalquellen und deren Datierungen wurden nicht verändert. Keine Datenbank,
GPG-Schlüssel, Modelle, Originalübertragung oder500er-Ausführung in dieser Probe.

## Verbleibende tatsächliche Grenze

Kein funktionaler Materials-Fix ist auf dieser Beleglage gerechtfertigt.
Insbesondere keine Datumsumschreibung, Fristverlängerung, Filterabschaltung,
Ersatzqualifikation oder Speicheroptimierung durchführen.

Der kleinste noch benötigte Beleg ist die originalgebundene Filterbilanz des
betroffenen aktuellen Quellenkontexts: vorhandene Quellen vor der Auswahl,
nach Themen-/Sicherheitsprüfung und nach den bestehenden Quellen-/Zeit-/
Budgetfiltern, ausschließlich feste Kategorien und begrenzte Zähler.
Erst dadurch lässt sich zwischen einem tatsächlichen Übergabefehler und korrekt
zurückgewiesenen, heute nicht verwendbaren Eingaben unterscheiden.
Vorhandene Qualifikation und elf Originale bleiben erhalten; keine neue
Gesamtinventur, keine pauschale Neuqualifikation und kein neuer500er-Versuch
zur bloßen Fehlersuche.

Eine dafür notwendige erneute geschützte Datenprüfung ist von diesem verbrauchten
Kapsel-GO nicht umfasst. Vor ihrer Ausführung muss eine konkret geprüfte,
eng begrenzte Freigabe vorliegen. Ein vollständiges Mock500-GO ist derzeit
fachlich nicht startbereit; der Reader-PASS ersetzt keinen Materials-PASS.

Keine neue RAM-Messung in der Kapsellesung. Der frühere Materials-Peak2,58GB
bei13,41GB Hartlimit gehört ausschließlich zum früheren Diagnosejob.
Getrennte Komponentenbeiträge und Anbieter-Eignung bleiben UNKNOWN.
End50041325430429 und Originalempfang41037459441 sind unverändert übernommen;
historische FAILs und RAM-Verträge bleiben erhalten. Keine Merges, Deployments
oder Production-Aktionen.
