# Begrenzter Inhaltsnachweis-Versuch19.10.2026: kein Speicherfix

**Versuch abgeschlossen, Speicherziel verfehlt.** Die Graphoption bleibt
standardmäßigOFF und im vollständigen500er-Descriptor gesperrt. Keine weitere
Cache-/GC-/WAL-Parametervariante und kein neuer Gesamtlauf aus diesem Ergebnis.
Der [vorherige Transportversuch](local-graph-reuse-qualification-20261019.md)
bleibt als gesonderter, ebenfalls negativer Speicherbefund erhalten.

## Enger geänderter Pfad

Der bereits erlaubte einmalige Inhaltsnachweis wurde lokal auf die dekodierte
Normalform angewendet. Der ursprüngliche vollständige `decode`-Funktionskörper
ist bytegleich:7.855B, SHA256
`6a85be2717284f6be7bd715cad3e0717aae23eaecd3b3f705136395630ec60bb`.
Er prüft kalt/geändert weiterhin jeden tatsächlichen Payloadhash, die kanonische
Root, Erreichbarkeit, Typen, Tiefe und sämtliche Arbeits-/Bytegrenzen.

Erst danach erzeugt ein Wrapper eine nicht serialisierbare private Capability.
Die private WeakMap hält ausschließlich den bereits geprüften unveränderlichen
Text, Root/Namespace und eine getrennte Hashmenge. Wirebytes und tatsächlicher
UTF8-Roottext sind jeweils auf8MiB begrenzt. Ein kleiner DAG kann größer
expandieren; dann bleibt der vollständige Inhalt lesbar, erhält aber keinen
wiederverwendbaren Token.8MiB sind keine globale Heap- oder Inflightgrenze.

Warm muss der tatsächliche native Leser jedes Mal erneut alle gespeicherten
Payloads hashen, den vollständigen Graphen begrenzen und Root/Generation/
Originalhash/Knotenzahl/-digest/Nonce/frischeRevision/Historienbeweis bestätigen.
Danach erzeugen `JSON.parse` und ein neuer `Set` einen vollständig unabhängigen
Rückgabewert. Kein geteilter mutabler Alias, kein inzwischen ausgetauschter
globaler Decoderzustand, kein Token aus ACK oder bloßer Hashbehauptung.
Atomic speichert den Token erst nach ORDER-Prüfung und `attach`.

Alle Berechtigungs-, Profil-, Quellen-, Kosten-, Frist- und Notstoppprüfungen
sowie CAS und Buchhaltung bleiben unverändert frisch. SQL/Writer/Originale,
Offline90/Unit60/Auth30 und2.048.000.000B wurden nicht geändert. Die zitierten
Betreiberfreigaben zur einmaligen Inhaltsprüfung sind die Autorisierungsbasis;
die vorige W43-Abnahme allein gilt nicht für diesen geänderten Decoderpfad.

## Tatsächliche gezielte Sicherheitsnachweise

-10/10 reine Gruppen: bestehende Graphregressionen plus nicht fälschbare und
  nicht serialisierbare Token, Root/Namespace/Neustartgrenzen, Aliasfreiheit,
  Mutationen, ausgetauschter globaler Decoder und kleinerDAG/großerRoottext.
-Neue native24/24 Gruppen im Fall `graph-3cb05a807f`:6 Graph,8 Historie,10 neue
  Protokollgruppen mit tatsächlicher zurückgerollter Payloadmanipulation,
  konkurrierendem älterem Snapshot/Stale-CAS, echtem Neustart und beiden
  voneinander unabhängigen Größenlimits.13 damalige Sourcepins gebunden.
-Unabhängige Codex-Quelle-/Nativeabnahme positiv; Original-Decoderbytegleichheit,
  Eingänge, Ist-Payloadnachweis, Verlustfreiheit und Cleanup bestätigt.

Die native Sicherheitsfixture nutzt gebundene PGDATA und beansprucht keinen
gemeinsamen Dateicachespeichernachweis. Keine500Profile/Profilaktivierung,
kein GO-Verbrauch und kein Modellaufruf in diesen Fixtures.

## Genau ein neuer Vergleich gleicher finaler Quellen

Baseline `read-path-3a39aa87e5`, Variante `read-path-1d3bb685f4`;16 volle gleiche
Quellen-/Eingangspins,21 gleiche native Funktionskörper, gleiche PG-Einstellungen.
Je42 Diagnoseoperationen mit32 zusätzlichen No-op-Writes,120 vollständigen200-
Antworten/36CAS,5.000 Historienzeilen/500Units/1.000Intents und künstlichen4MiB.
Der unveränderte Kernelmeter umfasst beide Male das eigene1GiB-Dateisystem,
Prozesse/DB/Storagehelper/Caches einschließlich des letzten Prozessendes.

| Messgröße | OFF | Inhaltsnachweis ON |
|---|---:|---:|
| Gemeinsamer vollständiger Speicherpeak |894.664.704B|1.041.596.416B|
| Separates Prozessmaximum Node-RSS |565.678.080B|804.769.792B|
| Gesamt-CPU |54,438106s|49,974596s|
| Gesamte eigene Lebensdauer |57,527811812s|55,947259975s|
| Summe42 gemessener Aufrufe |12,676933896s|13,340328601s|
| Langsamster gemessener Aufruf |528,163194ms|578,944753ms|
| Antwortbodybytes |505.304.460B|40.165.378B|
| Beobachtete kumulierte Tempbytes |458.960.409B|465.334.800B|
| Beobachtete WAL-Statistikdifferenz |1.117.524B|1.113.924B|

**Peak+146.931.712B/+16,423%; damit kein angenommener Speichervorteil.**
Antwortbytes−92,051%/CPU−8,199% ersetzen dieses Kriterium nicht. Summe und
langsamster gemessener Aufruf steigen; eine kürzere gesamte Lebensdauer ist
eine andere Messgrenze. Alle Daten/Root/Proof wurden vollständig wiederhergestellt,
alle eigenen Gruppen sind leer, Originale unverändert, keineOOMs.

Kein statistischer oder repräsentativer500er-Beleg, keine Unit60/Auth30-Abnahme.
Die Prozessmaxima sind keine additive Zerlegung des gemeinsamen Peaks. Höheres
Node-RSS/anonyme Speichersamples beweisen keine bestimmte Allokations-/GC-Ursache.
Die kumulierten Temp-/WAL-Zähler sind keine simultanen Peaks. Zwischen W43 undW44
werden keine ungepaarten Zahlen als gesicherte Einsparung ausgegeben.

## Genau eine nächste Architekturentscheidung

Der innere CAS-Renderer bleibt in beiden Fällen36-mal mit53.448 temporären
Schreibblöcken erhalten. `helmut_auth_state_cas_v1` baut aktuell in Zeile597 den
gesamten neuen logischen Zustand auf, um anschließend nur
`helmut_auth_state_assert_data_local_v1` zu prüfen. Letztere verlangt einen
Objektroot, das Fehlen von vier Steuerfeldern und zwei EU-Auftragsfelder.

**Vorschlag: vollständige frische Graphvalidierung von der Ausgabeaufbereitung
trennen und diese CAS-Eigenschaften durch begrenzte native Feldprojektion
belegen.** Nicht mehr das gesamte große JSON allein für diese Eigenschaften
konstruieren. Alle tatsächlichen Payloadhashes, Erreichbarkeit, Typ-/Tiefen- und
Text-/Native-Arbeitsgrenzen müssen weiterhin frisch vollständig geprüft werden.
Revision/State/Proof-Sperre, Trigger, atomare Ledgerbuchung, Rückweg und sämtliche
fachlichen Prüfungen bleiben bestehen. Exakte Gleichwertigkeit für gültige und
ungültige Graphen einschließlich Shared-DAGs, doppelter Schlüssel und Grenzfälle
ist vor Integration erforderlich.

Dies ist nur eine konkrete, noch unqualifizierte Architekturvorlage. Sie ist
kein implementierter Fix, keine Speicherzusage, kein neuer Prüfvertrag und kein
500er-GO. Den früher abgelehnten Vollrenderer erneut auszutauschen ist nicht
vorgeschlagen. Die genaue Beteiligung der CAS-Materialisierung am historischen
Volltestpeak ist weiterhin unbekannt; die wiederholte Arbeit ist konkret belegt.

## Platte und Freigabegrenze

Die ausdrücklich freigegebenen zehn historischen Hüllen wurden zuvor mit
9.116.696.576B Nettozuwachs entfernt; Archiv/Originale/DB-Daten/Volumes/Images/
Belege erhalten. Alle danach entstandenen neun Diagnosehüllen und ihre Daten
bleiben unberührt. Der neue rein lesende exakte Plan weist8.203.694.080B exklusive
physische Layerblöcke aus: `st_blocks`, Inodededuplikation, vollständige
Hardlinkabdeckung, FIEMAP sowie Mount-/Init-/Imagelayer-Referenzen geprüft.

Das neue private Wiederherstellungsarchiv enthält37 reguläre Mitglieder mit36
vollständig rückgelesenen SHA-Pins, beide Logstreams und alle Metadaten; tatsächliche
Root-Schreibbytes0. Archiv44.904B, SHA256
`3cbb6cb093e3b5ea30f1be6c6760073e9c3a20f8647d09baaf4174ec0728f31d`.
Alle PGDATA, Volumes, Originale, Worktrees, Images und Prüfergebnisse bleiben
erhalten. Die physische Lesemessung benötigte einen transienten Helfer mit
read-only-Root/-Dockermount, ohne Netzwerk/Socket/SYS_ADMIN und ausschließlich
DAC_OVERRIDE für fremd besessene Imageverzeichnisse; keine DB-/Testausführung.

Zuletzt8.519.401.472B frei; nach nur diesen neun Hüllen theoretisch
16.723.095.552B≥16.589.934.592B. Erst nach Entfernung zählt der tatsächliche
Nettogewinn. Das frühere GO deckte diese neuen neun Hüllen nicht ab. Vor ihrer
Entfernung waren deshalb neue ausdrückliche Zustimmung und sämtliche Identitäts-,
Archiv-, Stillstands- und Abhängigkeitsprüfungen erneut erforderlich.

Plan: `wave44-canonical-content-reuse/EXACT_NINE_DIAGNOSTIC_HULLS_REMOVAL_PLAN.SAFE.json`,
SHA256 `87173ceee1b58bb5e3d45f895cce10889201aaa3fccf34f8ecfadee9c0ea3add`.
Das neue ausdrückliche GO für genau diese neun Hüllen liegt inzwischen vor.
Alle neun wurden nach vollständiger frischer Vorprüfung ausschließlich durch
`docker rm FULL_CID`, ohne force/volumes/prune entfernt. Tatsächlicher Gewinn
**8.205.987.840B**; frei8.519.327.744→**16.725.315.584B**. Die Startreserve von
16.589.934.592B ist aktuell erfüllt, Abstand135.380.992B. Seit Beginn der
Zehnerbereinigung sind einschließlich sämtlicher neuer Diagnoseartefakte netto
**8.581.115.904B** zusätzlich frei. Daten, Volumes, Images, Originale, Archive und
Berichte erhalten; ursprünglicher PG-Prozess mit gleichem PID weiter aktiv,
keine anderen Container verbleiben. Keine weitere Löschfreigabe daraus ableiten.

Kein500er-GO angefordert: angenommene Speicherkorrektur, frische Fall-/Tages-/
Zeit-/Codebindung und32 Startbedingungen fehlen noch. Jede Vorbereitung kann
Platte verbrauchen; die Reserve muss vor einem künftigen Start frisch gelten.
Production bleibt gesperrt.

## Private Ergebnisablage

Sechs notwendige SAFE-Berichte und das
[SHA256-Addendum](https://drive.google.com/file/d/1JyVVvN3ep3E2jyh53TK0zAcLfJcr5adz/view)
sind im bestehenden privaten Driveordner gesichert. Alle sieben Dateien wurden
vollständig rückgeladen und byte-/SHA256-identisch geprüft; ausschließlich
Owner-ACL, keine Rechteänderungen. Insgesamt79.901B, ManifestSHA256
`1e032f2ece92577f611c0584ae4fc2cbb06e9615fa924ff1d059af8ff6858505`.
Die vorigen W43-Belege bleiben unverändert erhalten. Private Archive, Originale,
Rootkonfigurationen, Rohlogs und GO-Dateien wurden nicht übertragen.

Die unabhängige Prüfung erfolgte durch eine vorhandene Codex-Prüfinstanz anhand
von Quellen und vorhandenen Messergebnissen. Sie startete keine eigenen Tests
oder Betriebsaktionen. Kein weiterer bezahlter DeepSeek-Aufruf, kein neuer
500er-Lauf und keine Productionaktion.
