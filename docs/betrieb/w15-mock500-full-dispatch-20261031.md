# Mock3: vorbereiteter gemeinsamer Einmalsender

Stand31.10.2026. Nur Entwicklung und gezielte synthetische Prüfung; kein echtes
Mock-GO, Download, GPG-Lauf, Empfang oder500er-Versuch durch diese Vorbereitung.
End500-Kopf und bestehende Empfänger bleiben unverändert.

`scripts/w15-github/mock500_full_dispatch.py` schließt die externe Anschlusslücke:
der End500-Sender unterstützt Endmodi, der alte Mock-Sender ausschließlich den
Empfang der elf Dateien. Der neue Sender verwendet dieselben GitHub-, Git-,
Link-, GPG- und Payloadhelfer für `mock500-full-phased-gated` und den bestehenden
Index `helmut-w15-mock500-private-url-index/1`.

Vor READY müssen Launcher und Empfänger exakt qualifiziert, unabhängig geprüft,
in beiden Pflichtchecks grün und an den unveränderten Environmentbranch gebunden
sein. Die tatsächliche positive unabhängige End500-v2-Abnahme wird im eingefrorenen
End-PR und dessen echtem erfolgreichen GitHub-Lauf geprüft. Der Ziel-PR muss die
passende Baselinebridge und einen unabhängigen Review mit technischem Code- und
Inputbinding-Hash enthalten. Keine zukünftige Lauf-ID wird dafür erfunden.
Das vollständige statische Schema, alle vorhandenen Originalpins und der
Quellvergleich werden vor READY durch den bestehenden reinen Empfänger-Validator
geprüft. Dafür dient ein ausdrücklich fiktiver Index ausschließlich im Speicher;
kein Download, GPG, Dispatch oder erneuter Quellenlauf entsteht daraus.

Der Sender verändert keinen Branch. Der zugelassene Entwicklungsbranch muss
vorher nach separater passender Freigabe exakt auf dem Empfängerkopf stehen.
Nach `READY_FOR_FRESH_PRIVATE_MOCK500_LINKS` erhält der geschützte Standardinput
genau eine JSON-Zeile mit `original` als geordneter Liste der15 frischen privaten
Links und `archive` als frischem Link zum vorhandenen elf-Dateien-Cipherarchiv.
Keine Links in Befehlsargumenten, Logs oder öffentlichen Genehmigungsdateien.
Die bestehende authentifizierte Drive-Anbindung erzeugt diese Links erst nach
READY; der Sender enthält keinen Drive-Download oder Linkrefresh.

Der gemeinsame Index bindet `original`, den ausdrücklich versionierten
GPG/gzip/USTAR-`assets`-Deskriptor und die unabhängig geprüfte kanonische
`inputBinding`-Fassung. Archivpins und Empfänger werden aus bestehenden Modulen
übernommen. Derselbe feste öffentliche Empfängerschlüssel verschlüsselt nur den
Index. Nur Ciphertext geht als `w15_cipher_index` gemeinsam mit `w15_mode`,
`expected_commit` und `w15_request` an den bestehenden Workflow.

Unmittelbar vor dem einzigen POST müssen alle16 tatsächlichen Linkabläufe noch
mehr als90Sekunden entfernt liegen und die vollständigen tatsächlichen Parameter
einschließlich serialisierter Übergabe höchstens65535Zeichen umfassen. Die
ursprüngliche Ownergenehmigung und das bestehende12600-Sekunden-UTC-/Berlin-
Tagesfenster werden vor READY und vor POST erneut geprüft: Start am31.10. nur
vor19:30UTC, kein Start am01.11. durch diesen unveränderten Vertrag. Die
Workerprüfung bleibt zusätzlich maßgeblich. Kein Retry, Refresh oder Rücksetzen.

Erstfehler und getrennte Bereinigungsfehler erscheinen ausschließlich als feste
Phasen. Ein akzeptierter POST ist weder Originalannahme noch Mock500-Abnahme.
Der Lauf empfängt beide bestehenden Pakete im selben Job; Klartextdaten hängen
damit nicht von einem früheren temporären Runner ab. Bestehende RAM-, Kosten-,
Ergebnis-, Sicherheits-, Nullaktiv- und unabhängige Sicherungsabnahmen bleiben
unverändert; der historische69-Unit-Verarbeitungsfehler bleibt offen.

Gezielte Prüfung: `node scripts/lokal.js -- python3 -I -B
scripts/w15-github/test_mock500_full_dispatch.py`. Elf synthetische Testgruppen
prüfen Reihenfolge, positive End-/Bridgebindungen, negative Freigaben und
Starttore, gemeinsame reale Ablaufgrenze, echte Gesamtparametergröße, einen
unklaren POST ohne Retry, Einmalsperre, privaten Input und sichere Erstfehler-
Quittierung. Keine vorhandenen erfolgreichen Empfängerprüfungen wiederholt.

Stand: lokal vorbereitet. Integration, Pflicht-CI und unabhängiger Review auf
dem tatsächlichen gemeinsamen Endstand sowie ein gesondertes Mock-GO bleiben
erforderlich; positive End500-Abnahme und vollständige Mock-Startqualifikation
werden durch diesen Sender nicht vorweggenommen.
