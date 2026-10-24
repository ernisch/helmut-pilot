# Lokaler V10-Ressourcenversuch und gezielte Senderkorrektur20.10.2026

Der freigegebene vollständige lokale Mock500-VersuchV10 ist beendet und
fehlgeschlagen. Der Motor wurde tatsächlich geändert und getestet. Eine weitere
gezielte Senderkorrektur ist inzwischen implementiert und als Komponente geprüft;
der gewünschte500MB-Puffer ist weiterhin nicht nachgewiesen.

## Tatsächlicher vollständiger Versuch

Fall `3cd34019b9d7`, Operation `synthetik500-resources20-3cd34019b9d7`,
Commandhash `2df3879fdf15cdd988e75f313f3500b724eb8f737ec2b25f4ca92da02b407955`.
Workloadcode `7d6d6679179968597738a16d2d56994b21bfd9b2`;
getesteter Kopf `392e76cd4fb6e4e35437808f215be7e9f9ff4ccf` enthält zusätzlich
nur die Änderung des Entwicklungsrouters für lesende Reviews.
Controller01:57:27.972872–04:39:55.306849UTC.

| Kriterium | Tatsächlicher Befund |
|---|---|
| Native FinalACKs |499/500, exakt Indices0–498|
| Letzte Unit499 |HTTP409; Ursache `synthetik500-dispatch-EU-unit-deadline`|
| Letztes natives Scope |62616,900ms nach nativem Beginn, kein FinalACK|
| Erfolgreiche Units |Maximum50980,947ms, Grenze60000ms|
| Sicherheitskontrollen |8000 beobachtet,7984 bei499 erfolgreich abgeschlossenen Units|
| Authmutationen |4000 einmal bestätigt, Maximum1367,315ms bei30000ms-Grenze|
| Offlinephase |7619,724ms bei90000ms-Grenze|
| Canonical1500-Positions-Endabfrage |Nicht erreicht; keine erfundene Fehler-/Leer-/Duplikatbilanz|
| Gemeinsamer Kernelpeak bis letztem eigenen Exit |2262437888B|
| Harte2048000000B-Grenze |Um214437888B überschritten|
|500000000B-Puffer, Peak≤1548000000B |Um714437888B verfehlt; `reserveBytes=null`|
| Eigene Anwendung/DB/Broker/Storageholder |Exit1/0/0/0; Gruppen leer; OOM0|
| Originalvergleich |8Dateipins,KO6,RAW7,Links7 gleich; Quellschreibzugriffe0|
| Fachliche Modellaufrufe |1000 Mockphasen;0 bezahlte HELMUT-Provider-/0Productionaufrufe|

GegenüberV9 sank der gemeinsame Peak lediglich um37634048B. Die vorherige
Laderkomponente sparte484466688B bei exakt gleichen500 Eingabewerten; diese
Bausteinersparnis ist kein Gesamtgewinn in gleicher Höhe. Native Scope-Endzeit,
HTTP-Wallzeit und erfolgreicher FinalACK sind verschiedene Größen.

Die unabhängige ausführende Endprüfung hat alle500 Antworten/Scopes/Checkpoints,
4000 Authmutationen,1000 Providerphasen,8440 DBsamples und82483 Runtime-HTTP-
Quittungen geprüft.58/58 Konsistenzprüfungen bestätigen diesen Fehlbefund.
Das separate echte ProHigh-Lesereview bestätigt ihn anhand der ihm übergebenen
Primärbelege und Projektionen. Es hat den vollständigen AUTH4000-Vektor,
27MB-Runtime und139MB-Samples nicht erneut gelesen. Keine positive500er-/
Production-Endabnahme und keine neue Laufberechtigung daraus.

Private Primärbelege:

- `/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-3cd34019b9d7/CONTROLLER_COMPLETE.SAFE.json`
- `/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-3cd34019b9d7/application/COMPLETE_RESOURCE_RESULT.SAFE.json`
- `/workspace/helmut-ram-fix-20261020/full500-independent-end-audit/SUMMARY.SAFE.json`
- `/workspace/helmut-ram-fix-20261020/full500-independent-end-audit/CHECKS.SAFE.json`
- `/workspace/helmut-ram-fix-20261020/full500-pro-high-end-review/ACTUAL_RESULT.SAFE.json`

## Gezielte Korrektur nach dem Versuch

Der zusätzliche Senderbeobachter las bisher über `readState` erneut den ganzen
rekonstruierten Authzustand samt History, obwohl er nur Journal, Admission und
Tagesbuch benötigt. Die unabhängige Quellenprüfung erkannte den vorhandenen
geprüften Kontrollleser als passenden Zugang. Die neue lokale Option
`senderClaimRead: "verified-control-claim-v1"` verwendet dafür die vorhandene
öffentliche Funktion `storage.readSynthetik500ControlStore()` im selben Prozess.
Es wird kein neuer nativer RPC-Adapter und kein eigener Kontrollcache eingeführt.

Die Option bleibt standardmäßig aus und verlangt ausdrücklich
bounded/control/Merkle/history. Der Descriptor bindet den vollständigen neuen
Helper an die gemeinsame Quell-/Mountclosure. Import und Schnittstellenaufbau
öffnen keine DB; die tatsächliche Lesung verlangt weiterhin den lokalen Modus.
Anfangs-/Endlesung, native Kataloge, neun akzeptierte Core-/SQL-Hashes, CAS,
Writer und Decoder bleiben unverändert. Die ursprünglichen Claim-, Reservierungs-
und tatsächlichen Requesthash-Prüfungen bleiben im Provider.

Der Provider wartet innerhalb derselben bestehenden Messspanne auf die neue
Lesung. Originaler Fehler wird einmal weitergegeben; Abbruch vor/nach Lesung
oder Timer erzeugt keine verspätete Antwort, keinen Retry und kein offenes
Pending.19,9s-Verzögerung beginnt weiterhin am ursprünglichen Senderbeginn;
Lesedauer zählt mit.20s-Provider-/60s-Unitfrist und alle RAMgrenzen bleiben gleich.

Gezielte tatsächliche Prüfungen:

- 1000 ausdrücklich synthetische D/R-Auswahlen mit vollständiger Gleichheit zur
alten Auswahl;8 Gruppen für negative/falsche Bindungen, Frische und Fehleridentität.
- 14 synthetische Transportgruppen für beide Grenzprofile, Claimwidersprüche,
Zeitvertex und Abbruch; deterministische Testuhr ist kein echter Zeitnachweis.
- 22 Integrationsgruppen einschließlich26 originaler Vorlagen, exaktem Replay,
Quellpins, Default-AUS, verbotenen Kombinationen und Kalenderkomposition.

Native Gegenprüfung: tatsächlichenV10-Endstand ausschließlich in deklarierter
Diagnoseableitung verwendet;1714 Dateien/370119236B einzeln gegen unabhängige
Originalreads verglichen. Die genaue alte `readState`-Query wurde aus der
erhaltenen echten Laufquelle gewonnen und über dieselbe native Projektion gelesen.
Jede Phase enthält kalte Initialisierung der tatsächlichen öffentlichen
Kontrolltransportfunktion. Alle14 öffentlichen Tabellen vor/nach beiden Phasen
gleich, alle zurückgegebenen D/R-Felder gleich, anonymer Zugriff401.

Vier warme alte Lesungen:1005,587/763,636/755,342/870,425ms.
Neue Lesungen:309,362/293,988/308,064/317,602ms.
Der kleine Vergleich belegt diesen eingefrorenen Endstand und diese vier Lesungen.
Er belegt keine geänderten Wurzeln je Unit oder vollständige500er-/60s-/RAMreserve.

Wegen der8GiB-Hostreserve wurde dieselbe eigene, bereits sauber beendete
Diagnosehülle für die zweite Phase erneut gestartet. Alte und neue Phase haben
gemeinsame kumulative Kernelzähler ohne Reset; nach den ersten beiden Phasen Peak933924864B, nach der folgenden Original-Funktionsprüfung1061187584B bis letztem Exit.
**Kein getrennter Kandidatenpeak und keine RAMersparnis aus diesem Vergleich.**
Die Original-Loopabbilder wurden nicht gemountet, gestartet, ersetzt oder verändert.
Das Feld `all13TableDigestsAndAllClaimFieldsEqual` im privaten zweiten Launcher
ist historisch falsch benannt: die zugehörigen tatsächlichen Digestobjekte
enthalten14 Tabellen; alle14 wurden verglichen.

Das echte ProHigh-Quellenreview findet keinen Quellenblocker. Seine konkrete
Beleglücke wurde anschließend geschlossen: eine dritte reine Lesephase führt
jetzt den unveränderten `readSenderClaim`-Funktionskörper aus der gepinnten alten
Laufquelle aus, mit der tatsächlichen alten nativen Query. Alle Claimfelder und
alle14 Tabellendigests stimmen auch dabei überein. Kein geänderter Produktcode
für diese Zusatzprüfung. UTC-Tageswahl bleibt vor der Lesung wie im alten SQL;
keine Abnahme über Mitternacht hinweg, keine veränderten Kalender-/Fristsperren.
Das Review ist eine Quellenprüfung, keine Ausführung der nachfolgenden Belege.

Private Korrekturbelege:

- `/workspace/helmut-ram-fix-20261020/sender-targeted-checks/`
- `/workspace/helmut-ram-fix-20261020/post-v10-sender-native-20261020-v2/baseline/NODE_RESULT.SAFE.json`
- `/workspace/helmut-ram-fix-20261020/post-v10-sender-native-20261020-v2/baseline/CANDIDATE_PHASE/NODE_RESULT.SAFE.json`
- `/workspace/helmut-ram-fix-20261020/post-v10-sender-native-20261020-v2/baseline/CANDIDATE_PHASE/ACTUAL_RESULT.SAFE.json`
- `/workspace/helmut-ram-fix-20261020/sender-integration-pro-high-source-review/`
- `/workspace/helmut-ram-fix-20261020/post-v10-sender-native-20261020-v2/baseline/EXACT_LEGACY_BODY_PHASE/ACTUAL_RESULT.SAFE.json`
- `/workspace/helmut-ram-fix-20261020/ROOT_SENDER_INTEGRATION_ADOPTION.SAFE.json`

Der breite Pro-High-Schreibauftrag und danach der engere Flash-High-Auftrag
endeten jeweils am Antwortlimit, ohne übernommene Änderungen. Root hat die lokale
Integration und die notwendigen Prüfungen fertiggestellt. Keine automatischen
API-Wiederholungen; Entwicklungsgebühren bleiben unbekannt und werden nicht0 genannt.

## Plattenreserve und verbleibende Grenze

V10-Gastkapazität4294967296B und WAL-Obergrenze452984832B sind Obergrenzen;
aktuell448139264B Allokation des alten Images ist kein Peak. Standarddiscard
des Formatters dünnte die frühere `fallocate`-Reservierung aus. Nun verlangt
der Formatierungspfad `nodiscard` und kontrolliert echte vollständige Allokation,
Identität und Größe vor/nach Formatierung. Die bestehende Holder-Abbruchsicherung
bleibt bestehen.5 Allokationsfälle/2 Abbruchfälle bestanden. Eine echte16MiB-
Formatkomponente im bisherigen gepinnten Werkzeug behielt16781312B Allokation.
Kein Docker-/Loop-/vollständiger Reservenachweis aus dieser Kleinkomponente.
Das unabhängige FlashHigh-Quellenreview findet keinen Blocker; seine Grenzen
bleiben bestehen: aggregierte Blockallokation statt Extentnachweis, keine
zusätzliche Path-Swap-/frühe Readiness-Fehlerprüfung, kein kontinuierlicher
4GiB-Vollnachweis. Diese bestehenden Grenzfälle werden nicht als geprüft berichtet.

Nach den Komponenten waren rund8725356544B frei;8GiB-Boden8589934592B bleibt
erhalten. Für eine weitere vollständig reservierte4GiB-Datei plus Boden wären
12884901888B nötig: bereits ohne neue Container fehlen rund4159545344B.
Neue Docker-VFS-Hüllen benötigen zusätzlich Platz; ursprüngliche Abschätzung
nur eines Image-RootFS unterschätzte die tatsächliche neue Belegung. Der zweite
Hüllenstart wurde deshalb vermieden. Keine Originale, Altcontainer, Volumes,
Rohbilder oder bisherigen Belege gelöscht; keine alten Loops neu gebunden.

Vor einem weiteren Vollversuch muss der tatsächliche Plattenmangel unter
Belegerhalt gelöst sein. Zusätzliche kostenpflichtige Infrastruktur ist daraus
nicht freigegeben. Vollständiger RAM-/500MB-/Unit60-/1500-Nachweis bleibt offen.
V10-Claim und Setup sind verbraucht, werden nicht zurückgesetzt und bleiben
erhalten. Ein weiterer vollständiger Versuch benötigt ein neues separates GO
und danach alle aktuellen Bindungen/Startgruppen; kein Wiederverwenden alter Zitate.

Commit `c8624f7c` und alle Zieländerungen bleiben erhalten. Kein Push, Merge,
Deployment oder Productionzugriff aus diesem Arbeitspaket.
Betreiberkosten unverändert:82,036000USD/UTC-Tag,88,845364USD kumulativ,
0,081400USD für zukünftige EU-Tickets,81,400000USD Sicherheitsmaximum für
500D+500R/U0. Entwicklungskosten getrennt und unbekannt; keine geschätzte0.
