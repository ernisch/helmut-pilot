# Physische V8-Messung des integrierten Authpfads

Stand21.10.2026 UTC, Branch `codex/controlled-cleanup-and-late-probe-20261020`,
Entwurfs-PR927 auf926/925/924. **Gezielter Acht-Runden-Fall funktional PASS;
Ursachenzuordnung INCONCLUSIVE, kein Plateau- oder500er Nachweis.**

Der Motor enthält bereits den begrenzten PG-Renderer, die kalte Hashprojektion
und den kompakten Kontrollcache aus6d528425. Der faire frühere
OLD–NEW–NEW–OLD-Vergleich belegt154.886.144B/13,23% weniger gemeinsamen
Komponenten-RAM. Dieser Sprint ergänzt ausschließlich die fehlenden physischen
V8-Zähler. Kein weiterer Produktumbau ist aus diesen Beobachtungen begründet.
[Alter/neuer Ablauf](combined-auth-memory-comparison-20261020.md),
[vorheriger30-Runden-Verlauf](auth-stability-30-rounds-20261021.md).

## Durchführung und Schutz

Vor dem Start wurden genau8 Runden/67RPC, alle8 Endpunkte und ausschließlich
Runde4→8 als primäres Vergleichspaar festgelegt. Keine nachträgliche Ersatzpaarwahl,
automatische Verlängerung, Wiederholung des30er Laufs, erzwungene GC,
Cachebereinigung, Heapdump oder veränderte Speichergrenze.

Starter `scripts/helmut-resource-meter/auth-physical8-native-launcher`,
PREPARED-SHA256 `2b8b40fdb62a5b69b98325e3538fd45dea84b3b5a95bde3b186cfd7256b52875`;
isolierter Hostadapter `auth-physical8.py`, SHA256
`2405fa41c552712b2cec8c13fb74892fcd3d91e2738df7fe1fceede1c192b35e`.
24 Produkt-/SQL-/Abschlusskörper gegenüber dem geprüften Vorgänger bytegleich.
Nur über `scripts/lokal.js` und gepinnten Python3.12 mit `-I -S -B` starten;
Optimierungsflags sowie fehlende Isolationsflags werden abgewiesen.

Frischer Null-Auth-Fall `physical8-2b6988878a75c902ebe90966` PASS:
654.807.040B gemeinsamer Lebenszeitpeak/19,563649018s.
Seine unabhängige tatsächliche Abnahme wurde vor der separaten neuen
Root-Adoption des Workloads gebunden. Fall `physical8-239eaf771f67490b11e020a3`
PASS: **1.038.131.200B gemeinsamer Lebenszeitpeak/48,892634344s**,
50,909544s gemeinsame CPU und301.572.096B Geräteschreibmenge.
CPUzeit und kumulierte Schreibmenge werden nicht als RAM addiert.

Beide Fälle verwenden eigene persistente Kopien derselben authentischen späten
Quelle827a9872:1709 Dateien/369.399.611B. Die gemeinsame native Messung umfasst
Prüfung/Kopie/JIT-Restaurierung/Installation bis zum letzten eigenen Prozess.
Node384MiB+16MiB, native Max1.547.997.184B/high1.399.996.416B/swap0 unverändert.
Kein Peakreset; high/max/oom/oom_kill/oom_group_kill0, beide Gruppen am Ende leer.
Node/PG/äußere Starter Exit0 und EOF; originaler PostgREST−2 erfüllt die bereits
gesondert qualifizierte enge Identitäts-/SIGTERM-/EOF-Policy. Alte FAILs bleiben FAIL.

10 volle Reads/9 bestätigte CAS/48 frische Kontrollen,8 Mutationen+Restore,
16 Marker-/ACK-/SQL-Grenzen. Alle6000 historischen Positionen und Originalhashes,
Kontrollfelder,606B Referenzen sowie Katalog/ABI/ACL bleiben erhalten; nur die
bestätigte finale Revision darf wechseln. Kein unbekannter Schreibausgang/Retry.
Maximaler beobachteter Authvorgang1.389,313454ms einschließlich Dekodierung und
Hashbeobachter; innere Nodephase25,687597309s. Kein Gesamtmotor-Zeitnachweis.

## Alle vorab festgelegten Rundenenden

Bytes, ohne Addition getrennter Prozesswerte oder Spitzen. Native und Node/V8
werden nacheinander beobachtet; selbst die V8-/Prozesszähler sind keine atomare
gemeinsame Momentaufnahme.

| Runde | Gemeinsam Current | Anonym | File | Node RSS | V8 physisch | V8 used |
|---|---:|---:|---:|---:|---:|---:|
|1|946.130.944|313.069.568|604.831.744|238.059.520|104.419.328|58.804.384|
|2|955.977.728|322.740.224|604.880.896|244.744.192|105.467.904|59.404.128|
|3|951.992.320|318.418.944|604.979.200|241.082.368|109.924.352|59.530.208|
|4|953.757.696|320.061.440|605.028.352|242.655.232|121.499.648|88.620.992|
|5|951.091.200|317.427.712|605.077.504|240.091.136|105.467.904|59.789.840|
|6|966.160.384|331.808.768|605.175.808|255.680.512|104.681.472|59.701.816|
|7|967.057.408|332.976.128|605.224.960|256.819.200|105.205.760|59.753.816|
|8|970.063.872|335.745.024|605.290.496|259.727.360|111.116.288|81.286.504|

Das feste Paar4→8 zeigt gleichzeitig Current+16.306.176B,
anonym+15.683.584B,File+262.144B,NodeRSS+17.072.128B,
V8physisch−10.383.360B und V8used−7.334.488B.
V8malloced bleibt286.792B; tracked external steigt5.373.089→15.151.835B.
Die Zähler verhalten sich unterschiedlich. RSS minus V8physisch ist keine exakte
native Speichergröße, malloced erfasst nicht jede native Allokation.

671 natürliche GC-Ereignisse wurden beobachtet:539 minor/66 major/66 incremental.
Alle gelieferten Ereignisse und der terminale takeRecords-Abgleich werden an
allen16 Messklammern zeitlich zugeordnet. Der Ring hält höchstens16 Ereignisse,
je Klammer höchstens4 Überlappungsdetails. Neue Metadaten36.248B innerhalb64KiB.
Die letzten beobachteten Ereignisse vor Runde4/8 erfüllen den festgelegten
Major-GC-Phasenvergleich nicht: Die letzten beobachteten Ereignisse sind beide
minor, operationalStageCompatible=false, beide stage=null.
**Ursachenzuordnung bleibt INCONCLUSIVE.** Nicht gelieferte Ereignisse und exakt
gleiche lebende Objektphasen bleiben unbekannt. Andere Paare dürfen diesen
vorab festgelegten Befund nicht ersetzen.

Die Beobachtung begründet weder ein bestimmtes natives Leck noch eine V8-
Parameteränderung, Cacheverlagerung oder weiteren Snapshot-/Parts-Umbau.
Sie beweist auch kein Plateau; acht Runden sind kein später Dauerzustand und
kein neuer fairer ALT/NEU-Vergleich. Der Einzel-Snapshot-Kandidat bleibtOFF,
sein früherer gemeinsamer Vergleich hatte keine Ersparnis gezeigt.

Der getrennt geprüfte JIT-Restaurierer streamt bereits128KiB. Seine178.290.688B
tmpfs-Seiten gehören zur migrierten Komponentendiagnose; der vollständige
V11/Motorpfad verwendet das originale PG-Image ohne diesen JIT-tmpfs-Mount.
Diese Bytes dürfen nicht als neue Motorersparnis abgezogen werden.

## Prüfung und Fortsetzung

208 gezielte Python-Auswahl-/Vertrags-/Zähler-/Capture-/V8-Guards und17 natürliche
GC-/Zeitzuordnungsfälle PASS;5 Python-ASTs/1 geänderte Node-Syntaxdatei PASS.
Hosthilfe Exit0, fehlendes I/S/B und optimiertes Python jeweils abgewiesen.
Die179 bereits bestandenen Produktsuiten und95 nativen Vergleiche auf unverändertem
Produktcode wurden nicht wiederholt. Quellenprüfung und tatsächliche unabhängige
Abnahme sind getrennte Belege.

Der neue Starter besitzt keinen Voll500-Modus. Alle früheren GOs sind verbraucht.
Für einen späteren vollständigen500er Lauf gelten weiterhin32 frische Bedingungen,
Fall-/Zeitbindung, tatsächliche Plattenadmission und ein neues konkretes GO.
Maximal1.548.000.000B gemeinsamer Bedarf mit500.000.000B Reserve über den gesamten
Motor ist **weiterhin unbewiesen**. Keine Hochrechnung von Komponentenpeaks;
ein weiterer Volltest zur bloßen Hypothesenprüfung ist nicht empfohlen.

Der gesicherte nächste Schritt ist eine gezielte Quellen-/Allokationszuordnung
des verbleibenden Node-anonymen Anteils unter Beachtung der fehlenden vergleichbaren
GC-Phasen. Diese Messung wird dafür nicht automatisch verlängert oder wiederholt.
Ein konkreter zusätzlicher Motorumbau braucht einen belegten Mechanismus und einen
fairen gemeinsamen ALT/NEU-Nachweis. Production, Router und Kosten bleiben unverändert.


## Belegerhalt und Platte

Nach beiden unabhängigen tatsächlichen PASS-Abnahmen wurden ausschließlich die
zwei vorab als nach PASS entbehrlich klassifizierten neuen PGDATA-Kopien entfernt:
3422 reguläre Dateien,739.663.872B inventarisierte Blöcke einschließlich Verzeichnissen.
Jedes Ziel hatte eine frische Quell-/Nutzungsprüfung, einen eigenen Checknonce,
eine getrennte Root-Adoption mit300s Gültigkeit und eine exklusive einmalige
Claimdatei. Kein alter Check/GO wurde wiederverwendet. Alle219 Belege/6 gestoppten
Hüllen und exakten Bindungen bleiben erhalten; beide nativen Gruppen leer.

Root-Endkontrolle c21cd1e9: alle219 Beleg-SHAs unverändert, fünf geschützte
Containeridentitäten/PIDs/Mountquellen sowie kanonische Rootmetadaten gleich.
Quelle827a und ihre17 dauerhaft abhängigen Deltaarchive bleiben geschützt.
Die erste zusätzliche rein lesende Root-Endkontrolle verwarf eine anders sortierte
Docker-Mountliste. Der neue erhaltene v2-Schreiber vergleicht alle vollständigen
Mountdictionaries kanonisch wie der bereits geprüfte Retirer; PASS, keine weitere
Ressourcenmutation. Alter Quellstand/Exit1 bleiben dokumentiert.

Plattenmomentaufnahme danach15.160.893.440B verfügbar,18.886.280B unter der
unveränderten Volladmission15.179.779.720B, vor weiteren Dokument-/Git-/CI-Belegen.
Keine Reservierung oder positive Volladmission behauptet. Weitere qualifizierte
Rückgewinnung0B. Die beiden privaten Vorbereitungskopien belegen zusammen nur
1.404.928B und enthalten noch gebundene Metadaten; alte Hüllen haben keine neu
belegte nutzbare Blockfreigabe. Keine pauschale Bereinigung, Beleglöschung oder
kostenpflichtige Ersatzkapazität. Neue Komponentenfälle klassifizieren ihre nach
PASS entbehrlichen Kopien bereits vor Start; Entfernung bleibt getrennt geprüft.

Der vollständige Nachweis bleibt außerdem durch den unveränderten, noch auf
DeepSeek gebundenen alten Vollstartvertrag gegenüber der aktuellen SOL-only-Vorgabe
und die fehlenden privaten CI-Originalvorlagen begrenzt. Keine Routeränderung,
keine Ersatzoriginale und kein bezahlter Modellaufruf aus diesem Sprint ableiten.
[Unabhängige tatsächliche Messabnahme](auth-physical8-qualification-20261021.SAFE.json).


[Root-Endbeleg](auth-physical8-retirement-20261021.SAFE.json) und
[unabhängige tatsächliche Endabnahme](auth-physical8-retirement-sol-review-20261021.SAFE.json)
PASS55b1eed9 bestätigen219 unveränderte Belege,6 Hüllen/2 leere Gruppen und
5 geschützte Containeridentitäten sowie17 Archivpräsenzen/gesicherte Längen.
Keine erneute Archiv-/Originalpayloadprüfung behauptet. Neueste unabhängige
Momentaufnahme vor Bericht:15.160.635.392B frei,19.144.328B unter Volladmission.
Die739.385.344B regulären Dateiblöcke sind eine Teilmenge der oben genannten
739.663.872B einschließlich Verzeichnissen und dürfen nicht zusätzlich addiert werden.
