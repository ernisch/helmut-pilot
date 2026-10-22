# Lokaler500er-Lauf: letzte Unit gesperrt, gezielte Runtimekorrektur

Stand16.10.2026UTC. Kein Production-Nachweis, keine Production-Aktion und keine neue Aktivierung.

Der vollständige lokale Mocklauf mit echten PostgreSQL-/CAS-Zugriffen endete von selbst mit499 finalen Abschlüssen.500 Einheiten wurden begonnen. Die letzte überschritt Unit60 und bleibt im unbekannten Zustand mit Stop-Anforderung; sie darf nicht wiederholt werden. Alte DB, gespeicherte Originale, Aktivierungsquittung, Auftrag und Laufdateien bleiben erhalten.

| Messung des abgeschlossenen Laufs | Tatsächlicher Wert | Bewertung |
| --- | ---: | --- |
| Einmalige Offline-Inhaltsprüfung |7,665869786s|unter90s|
| Originalinstallation, zwei Original-U-Prüfungen |3,004094535s|bestanden|
| Maximale Vorbereitung |2,234235694s|unter60s|
| Erfolgreiche finale Abschlüsse |499/500|Gesamtabnahme gesperrt|
| Größter erfolgreicher Unitlauf |53,854385920s|unter60s|
| Letzte Unit bis terminales Scope-Ende, ohne Final-ACK |61,080186441s|Unit60 nicht bestanden|
| Authmutationen |4000 erfolgreich|maximal1,178606879s, unter30s|
| Frische Sicherheitskontrollen |8000=500×16|alle16 auch bei letzter Einheit beobachtet|
| D/R-Mockaufrufe |1000 bilanziert|keine echten Modellaufrufe|
| Gesamtsequenz einschließlich Vorprüfung/Installation |9324,300936412s|2h35m24,301s|
| Summe separat beobachteter Prozesshöchststände |1044959232Bytes|unter2048000000Bytes, Grenzen unten|

Unitzeit ist J.enter bis zum finalen CAS-ACK; für die fehlgeschlagene letzte Unit existiert kein solches ACK. Dort wird ausdrücklich nur das gemessene Intervall bis zum terminalen Scope-Ende angegeben. HTTP-Zeit der letzten Einheit:62,205792523s. Zeit-/Sicherheitsgrenzen unverändert. Kein CPU-Profiler.

## Konkrete Korrektur

Die letzten zehn Runtime-Leseprüfungen verbrauchten6,931491181s; davon2,862149742s vor dem eigentlichen nativen Abruf. Der reine Aufbau des unveränderlichen500-Profilvertrags wiederholte sich je Zugriff. Nur diese Ableitung liegt jetzt im privaten, bereits vollständig geprüften Inhaltsdatensatz. Jeder Zugriff prüft erneut den lebenden Kontext sowie die exakte Identität des gespeicherten Commands. Ablauf, Quellen-/Schlüssel-/Zieldrift, ungültige Tokens und geänderte native Bindungen sperren Wiederverwendung. Neustarts stellen einen neuen gebundenen Datensatz her. Es gibt keinen globalen oder vom Caller befüllbaren Cache.

Der tatsächliche GET und die ursprüngliche Validierung jeder frischen Antwort bleiben unverändert. Aktuelle Berechtigungen, Profile, Quellen, Kosten, Fristen und Notstopp werden nicht gespeichert oder übersprungen. Die Änderung betrifft ausschließlich zwei Parentmodule; Worker,67-Quellen-Manifest und CPU-Algorithmen sind unverändert. Neue Quellbytes erfordern neue Inhalts-/Ausführungsbindung.

Unabhängige DeepSeek-Pro-High-Entwurfsprüfung positiv; tatsächliche Deltaabnahme noch offen.80 lokale Regressionsfälle bestanden. Nach Ergänzung eines weiteren Sicherheitsfalls bestanden die acht betroffenen Gruppen erneut:81 verschiedene Fälle insgesamt, kein behaupteter einzelner81er-Lauf. Diese Tests verwenden explizite RPC-/Worker-Fixtures und temporäre echte Ed25519-Schlüssel; sie beweisen keine DB-Gesamtperformance.

## Tatsächliche native Komponentenmessung

Gleiche zehn Leseprüfungen:7,423514528s bisher,4,746010104s mit Korrektur; gemessene Differenz2,677504424s. Aufbau zehnmal→einmal.16 Kandidatenprüfungen mit10Ladungen+6Zulassungen und16 frischen nativen Bindungen bestanden. Frische manipulierte Antwort abgewiesen.27 echte Runtime-GETs einschließlich Vergleich und Negativfall; DB-Zustand davor/danach identisch,0 DB-Schreibvorgänge.

Die Messung verwendet echte gespeicherte Commandbytes, vollständige Offline-Inhaltsprüfung8,149447823s und einen nur im Speicher gehaltenen signierten Inhaltsnachweis. Sie läuft ausschließlich im Installationsscope, ohne Ausführungsautorität, ursprüngliche Installation, Auftragsanspruch oder Provider-/Profilaktion. Realer Takt, kein Profiler. Prozessspitze513413120Bytes plus separat gemessene Hilfsprozessschranke134631424Bytes. **Kein vollständiger neuer Unit60-/Auth30-/500er-Nachweis; aus2,6775s Komponentenverbesserung wird kein Vollpass hochgerechnet.**

## Messharness und Speichergrenzen

Im fehlgeschlagenen alten Lauf dauerte ein auf19900ms gesetzter Mock tatsächlich19899,433373ms. Das gilt nicht als erfüllte Mindestverzögerung. Separater, noch nicht im alten Harness angewendeter Vorschlag prüft die monotone Restzeit erneut und wartet nötigenfalls weiter. Vier Fälle bestanden; reale Probe19911,614501ms. Mindest19900ms und hartes Providerlimit20000ms bleiben erhalten. Kein Modell-, DB- oder Unitnachweis aus dieser Timerprobe.

Die Speicherangabe des Gesamtversuchs summiert separat beobachtete Höchststände: App inklusive Worker/HTTP609505280Bytes, Sequenzrunner123600896Bytes, tatsächlich ausgeführte Python-/Docker-Clienthilfen302415872Bytes, passiver Sampler9437184Bytes. Keine simultane Aggregatmessung; eine letzte Abtastlücke beim Prozessende ist möglich. DB, Gateway und Container-PSQL sind separat abgegrenzte Infrastruktur. Erfolg anderer Kriterien wird daraus nicht abgeleitet.

## Nächste Freigabegrenze

Die bereits genau einmal freigegebene lokale Aktivierung ist verbraucht und ihre Quittung an die alte Operation gebunden. Kein Retry/Umstempeln. Neuer konkreter Vorschlag benötigt eine neue isolierte lokale Kopie, genau eine echte0→500-Aktivierung und genau einen frisch gebundenen Mockendnachweis. Vor einer solchen neuen Freigabe Korrektur, Deltaabnahme, Pflicht-CI und Aktionsvorschlag vollständig reviewbar abschließen. Keine Änderung des90/60/30-/2048MB-Vertrags.

Production bleibt getrennt gesperrt: native Installation/Trigger und Ownerrolle, genaue Runtime-/Workerbytes/Public-Key-Verteilung, aktuelle native Eingaben und vollständige laufgebundene Infrastrukturfinanzierung sind noch zu belegen. Keine erneute Zugangs-/Archivuntersuchung. Profilaktivierung, Merge, Deployment, Migration und bezahlter Productiontest benötigen die jeweils konkrete spätere Freigabe.

Primärbelege sind lokal erhalten; Hashes und Grenzen im [Belegmanifest](500er-unit60-runtimekorrektur-20261016.json). Der frühere [Modulgraphbericht](500er-lokaler-modulgraph-20261016.md) bleibt als datierter Teilnachweis erhalten.
