# Lokaler Pipeline-Lock: struktureller Umbau und Abnahme

Der bisherige Lock-Erwerb und die Freigabe rekonstruierten jeweils den gesamten
Auth-Zustand und bestätigten einen Auth-CAS. Im authentischen späten
Arbeitsklon verursachen sechs solche Lock-Zyklen zwölf zusätzliche vollständige
Reads und zwölf CAS. Der explizite lokale Modus `invocation-lease-v1` verwendet
stattdessen zwölf kleine PostgreSQL-Aufrufe; die bestehenden Funktionskörper aus
20260719 bleiben identisch. Ein privater Handle gehört genau einem Aufruf.
Unbekannte Bestätigungen, Zielwechsel oder verlorener Besitz verhindern Erfolg.
Es gibt keinen automatischen Retry oder Backend-Fallback. Default ist AUS.

Die isolierte native Sicherheitsprüfung umfasst echte Konkurrenz, Ablauf und
Übernahme sowie die verweigerte Freigabe durch einen alten Besitzer. Merkle-Root,
6.000 historische Verbrauchseinträge und vier historische Blob-Locks bleiben
gleich. Alle Kinder enden mit vollständigem Log-EOF; die eigene Messgruppe ist leer.

Im kontrollierten warmen OLD/NEW/NEW/OLD-Komponentenvergleich sinkt der mittlere
gemeinsame Peak von 611.895.296 auf 536.227.840 Bytes, also um 75.667.456 Bytes
(12,366 %). Beide Vergleichspaare zeigen eine Verringerung. Die mittlere CPU-Zeit
sinkt von 25,089 auf 13,456 Sekunden, der Zyklusmedian von 1.659 auf 22 ms.
Die Messung umfasst Einrichtung und Prozessabschluss. Die physische Arbeitskopie
wird fortgeschrieben; die Arme haben keinen identischen kalten Cache. Sechs Zyklen
belegen kein Langzeitplateau und keinen 500er-Puffer. Die Ersparnis darf nicht mit
anderen Komponentenvergleichen addiert werden.

Der vorgesehene vollständige lokale Pfad bindet die echten unabhängigen Source-
und Native-Belege, aktuelle Quellpins, drei Kindumgebungen sowie den begrenzten
Sender-Kontrollleser. Installation und Katalogprüfung sind an eine frische lokale
Fixture gebunden. Dieser Pfad wurde statisch und mit echten Descriptor-Belegen
geprüft; ein vollständiger Motorlauf mit dem neuen Modus hat nicht stattgefunden.
Der verbrauchte V12-Slot bleibt verbraucht. Es gibt keine Production-Freigabe.

Die breite Offlineprüfung ergab tatsächlich 178/180 Suiten in 676 Sekunden.
Die beiden Metadatenfehler (Statusdateigröße und Env-Inventar) wurden korrigiert
und mit 4 beziehungsweise 38 Assertions gezielt geprüft. Der Lauf wird nicht
nachträglich als durchgehend grün bezeichnet. Zusätzlich bestanden 15 Client-
Testgruppen, 28 Binding-Gruppen und zwei Python-Tests mit 26 Vorlagenprüfungen.

Belege: [native Sicherheitsabnahme](belege/local-lock-lease-20261021/ROOT_LOCAL_LOCK_LEASE_ACCEPTANCE.SAFE.json),
[warmer Vergleich](belege/local-lock-lease-20261021/WARM_COMPONENT_COMPARISON.SAFE.json),
[unabhängige Binding-Quellprüfung](belege/local-lock-lease-20261021/INDEPENDENT_BINDING_SOURCE_REVIEW.SAFE.json)
und [tatsächlicher Offline-Stand](belege/local-lock-lease-20261021/OFFLINE_QUALIFICATION.SAFE.json).

Ein begrenzter echter HTTP-Auth-Zyklus bestätigt fünf Reads und zwei CAS mit
vollständiger logischer Wiederherstellung. Sein Gesamtstatus bleibt FAIL wegen
des nicht qualifizierten PostgREST-Abschlussstatus −2 nach SIGTERM; alle Prozesse
sind beendet und alle Logs vollständig. [HTTP-Beleg](belege/local-lock-lease-20261021/HTTP_AUTH_MUTATION_RESULT.SAFE.json).

Zum Stand dieses ersten HTTP-Auth-Zyklus blieben der HTTP-Lockvergleich, Unit60,
ein stabiles Plateau und
der vollständige Nachweis mit exakt 500 gleichzeitig aktiven Profilen und 1.500
Ergebnispositionen. Ein neuer vollständiger Lauf braucht ein neues konkretes GO,
alle 32 frischen Startbedingungen und ausreichende persistente Plattenkapazität.

Der folgende echte HTTP-Vergleich bestätigt den Effekt auch über den unveränderten
Gateway-Handler und PostgREST: OLD/NEW/NEW/OLD, je sechs vollständige Sperrzyklen,
identischer aktueller Storage-Code, nur lokaler Modus AUS/AN. Alle vier Arme PASS.
Mittlerer gemeinsamer Peak718.508.032→640.927.744B, Ersparnis77.580.288B/10,797%;
beide Paare positiv (80.384.000/74.776.576B). CPU22,569→13,842s, gesamte Dauer mit
Abschluss23,887→16,106s, Mittel der Arm-Zyklusmediane1384→9,32ms. OLD benötigt
15 verifizierte Fullreads/12 CAS, NEW3 Fullreads/12 Lease-RPCs/0 CAS pro Arm.
Root, History6000, vier historische Locks und nativer Datenhash ohne Revision bleiben
gleich. Die WAL-Insertfenster vor Shutdown sinken im Mittel169288→6556B, die
Graphrelation wächst im Mittel40960→0B. Die Quelle bleibt in allen298 Pins gleich.

PostgREST liefert roh weiterhin−2. Eine vor jedem neuen Start ausgegebene einmalige
Policy bindet die tatsächliche frische304B-Konfiguration, Binary, Originalvorlage,
Nonce und acht gepinnte Upstreamdateien. Deren Signalpfad erklärt
SIGTERM→UserInterrupt→SIGINT. Beim Close werden die Bytes erneut geprüft; Timeout,
Kill, fehlendes EOF, Drift und Replay bleiben FAIL. 28 gezielte Fakechild-Tests PASS.
Dies ist eine quellenbasierte Qualifikation, kein reproduzierbarer Binary-Build
und kein Prozess-Signaltrace. Originalhelfer und ursprüngliches I-FAIL bleiben gleich.

Der Vergleich enthält Instrumentierungsaufwand, dessen Häufigkeit mit der RPC-Zahl
variiert. Er nutzt einen warmen geteilten Cache und eine fortgeschriebene physische
COPY. Getrennte Peaks und Ersparnisse anderer Komponenten dürfen nicht addiert
werden. Ein voller Motorlauf, Unit60, Langzeitplateau und500MB-Reserve bleiben offen.
[HTTP-Vergleich](belege/local-lock-lease-20261021/HTTP_LOCK_COMPONENT_COMPARISON.SAFE.json),
[unabhängige Quellenabnahme](belege/local-lock-lease-20261021/HTTP_COMPARISON_INDEPENDENT_SOURCE_REVIEW.SAFE.json),
[frische Original-/Kapazitätsprüfung](belege/local-lock-lease-20261021/POST_HTTP_ORIGINALS_AND_CAPACITY.SAFE.json).

Die [unabhängige tatsächliche Abnahme](belege/local-lock-lease-20261021/HTTP_COMPARISON_INDEPENDENT_ACTUAL_REVIEW.SAFE.json) bestätigt alle vier Arme,298 Quellenpins und48 Ergebnisbelegpins. Die [separate Abschlussqualifikation](belege/local-lock-lease-20261021/HTTP_CLOSE_POLICY_QUALIFICATION.SAFE.json) bewahrt die Rohstatus und den ursprünglichen Fehlversuch.
