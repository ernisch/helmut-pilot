# Lokaler Pipeline-Lock: struktureller Umbau und Abnahme

Der bisherige Lock-Erwerb und die Freigabe rekonstruierten jeweils den gesamten
Auth-Zustand und bestätigten einen vollständigen CAS. Im authentischen späten
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

Offen bleiben der echte HTTP-Auth-Mutationspfad, Unit60, ein stabiles Plateau und
der vollständige Nachweis mit exakt 500 gleichzeitig aktiven Profilen und 1.500
Ergebnispositionen. Ein neuer vollständiger Lauf braucht ein neues konkretes GO,
alle 32 frischen Startbedingungen und ausreichende persistente Plattenkapazität.
