# Später Kontrollzustand überschreitet den privaten Cache

Tatsächlicher V7-Fall `control-81c274b505a2ee40e25ab03e`: PASS als gezielte
Baseline-Diagnose. Ein originaler `U.read` und zwei originale `U.readControl`
auf einer eigenen persistenten Kopie des authentischen späten V11-Zustands.
Keine Mutationen, Provideraufrufe, Profilaktivierungen oder vollständigen500.

Die unverändert erzeugte Vierfeld-Kontrollsicht ist **4856607B** groß und
überschreitet die private2097152B-Grenze. Damit wird kein Kontrollcache gehalten:
Stringify-Aufrufe1/2/2, beide `knownGraph:null`, jeweils vollständige1848 Knoten.
HTTP-Bodybytes10431730/6662644/6662644; alle drei frischen Nonces und Bindungen
vom originalen U akzeptiert. Genau drei tatsächliche Undici-Sends und vollständig
passiv erfasste Antworten, keine Framing-/Protokollfehler. Der Beobachter hat
keinen Authtext behalten und keine zusätzliche Authserialisierung vorgenommen.
[Tatsächliche Rohbeobachtungen](control-cache-v7-actual-20261020.SAFE.json) und
[unabhängige SOL-Prüfung](control-cache-v7-actual-sol-review-20261020.SAFE.json).

Die eigene gemeinsame Lebenszeit erreicht980570112B; Setup, Quellprüfung,
persistente Kopie, JIT, PG/PostgREST/Node und Abschluss enthalten. Alle nativen
Speicherereignisse0, natürliche GC, kein Peakreset oder Cacheleeren. Node24.19.0,
384MiB Oldspace/16MiB Semispace, ein Isolat/keine Worker, tatsächlicher Exit0.
PG0, vollständiger Katalog/Auth unverändert, Quellmanifeste827a9872… identisch,
LogsEOF und alle eigenen Prozesse durch den letzten Exit geschlossen.
[Nativer Abschluss](control-cache-v7-native-result-20261020.SAFE.json).
**Dies ist kein OLD/NEW-RAMvergleich und kein Plateau- oder500MB-Nachweis.**

Vorher separat qualifiziert: V7-Lifecycle-Fall `control-691308195082cdee46ff279b`,
0Auth/keinNode. PostgREST12.2.3 übersetzt laut exakt gepinntem Upstream SIGTERM
über UserInterrupt in RTS-SIGINT. Nur die Originalbinary870a77f4… samt exakter
Konfiguration/Version/Policy und vollständigem Live-PID-/Signal-/Reap-/EOF-/
Persistenzabschluss erhält diese zusätzliche Klassifikation; Rohcode bleibt−2.
Eine tatsächliche interne Syscall-/Cleanup-Funktionsaufzeichnung wird nicht behauptet.
V6-Fall `control-45a29158f86a93d8e76f090d` und alter `candidate-abba-02` bleiben FAIL.
Der frühere historische signierte Exitcode bleibt unbekannt.
[Unabhängige Quellenprüfung](control-cache-v7-source-sol-review-20261020.SAFE.json),
[17 gezielte Guardtests](control-cache-v7-guard-tests-20261020.SAFE.json) und
[tatsächliche Lifecycle-Prüfung](control-cache-v7-lifecycle-sol-review-20261020.SAFE.json).
Der Host akzeptiert nur drei exakt fallgebundene Belege; kein globaler `/bench`-Alias.
Die eingefrorene PREPARED-Datei a09c91e4… behält ihren historischen Vorbereitungsstatus;
die tatsächliche Qualifikation liegt getrennt in diesen Belegen.

Nächster gezielter Umbau: eine private kompakte Darstellung innerhalb der
unveränderten2MiB-Grenze, mit den bestehenden logischen Authgrenzen und frischen
nativen Prüfungen. Kandidat67b5c4ef liegt im getrennten Worktree, gezielte
Unittests bestanden; noch keine native Wirkung oder Übernahme in den Rootmotor
beansprucht. Ein symmetrischer Vergleich mit derselben Ausgangsbank und mehreren
echten Zustandsänderungen wird vorbereitet. Keine neue Voll500-Freigabe.
