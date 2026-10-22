# Lesende Vorbereitung der letzten V12-Einheit

Der lokale Mock500 vom21.10.2026 endete nach499 ACK mit HTTP409 an Index499.
Slot12 und die damalige Freigabe bleiben verbraucht. Die vorhandenen
Ausführungsverträge sind an den vollständigen500er Lauf und dessen Authzustand
gebunden. Ein erneuter Aufruf der letzten Einheit wäre daher keine belastbare
Einzeldiagnose.

Diese Änderung bereitet ausschließlich die Identität `sourceIndex499` →
`diagnosticUnit0` vor. Der neue CLI-Verbraucher liest ein gepinntes V2-Dictionary-
Paket, seine Installationspins und die unveränderte öffentliche V12-Endquittung.
Er prüft den begrenzten Dictionarygraphen und die D/R-Zuordnung der ausgewählten
Einheit, ohne den vollständigen logischen Befehl zu entfalten. Das Ergebnis
enthält nur Herkunftspins, eine Auswahlbindung und vorgeschlagene neue
Diagnosenamensräume. Profil-, Quellen-, Request- und Freigabeinhalte werden nicht
ausgegeben.

## Aufruf

`node scripts/lokal.js -- node scripts/helmut-resource-meter/single-unit-diagnostic-inspect.js --help`

Die Inspektion benötigt `--inspect`, `--packet`, `--install-pins` und
`--install-sha256`. Pfade müssen normalisierte absolute Pfade sein; private
Eingaben müssen dem ausführenden Benutzer gehören und private Dateirechte haben.
Symlinks, Mehrfachverknüpfungen und erkannte Dateiveränderungen werden abgewiesen.
Ein optionaler `--diagnostic-nonce` legt nur die vorgeschlagene Kennung fest und
reserviert sie nicht. Der Vorbereitungstag stammt aus der tatsächlichen UTC-Zeit;
der historische Quelltag bleibt21.10.2026.

Exit0 bedeutet ausschließlich `PREPARATION_ONLY_EXECUTION_BLOCKED`.
`expandedSHA256Verified` und `fullCommandValidated` bleiben ausdrücklich false:
Der Hash der vollständigen Expansion und der vollständige fachliche Befehl
werden hier nicht erneut geprüft. Der Hash der tatsächlichen Paketbytes und des
Dictionarys bindet die ausgewählte Struktur.

`verifyPreparedDiagnostic(preparation, args)` prüft eine bereits erzeugte
Vorbereitung erneut: Aus den tatsächlich übergebenen Paket-/Installationsbytes,
Pins, Nonce und Zeit wird das kanonische Ergebnis neu berechnet und vollständig
strukturell verglichen. Geänderte Hashes, Freigabefelder, Namensräume oder Sperren
werden abgewiesen. Zurück kommt eine neue tiefgefrorene Vorbereitung. Die Methode
ersetzt keine vertrauenswürdige Beschaffung dieser Eingaben und erteilt keine
Ausführungsfreigabe; vollständige Expansion und Befehlsabnahme bleiben ungeprüft.

## Weiter offene Ausführungsvoraussetzungen

Laut neuer Quellprüfung vom22.10. sind das unveränderte authentische POSTRUN-Abbild
und alle vier angefragten Originalbindungen in der Quelle erhalten. Ein Zustand
unmittelbar vor Index499 ist nicht belegt. Die veränderte Diagnosekopie und der
Inputdump aus der Vorbereitung ersetzen das POSTRUN-Abbild nicht.
Der vollständige Runtimeumfang ist wegen Auth-/Sitzungszustand nicht als secretfrei
qualifiziert; die Bindungsliste und291von548Dateibindungen fehlen im Zieltransfer.
Die spätere Diagnose muss daher in der Quelle mit einer getrennten Arbeitskopie
und frisch gebundenem Zielcode vorbereitet werden. Die Quell-DB ist gestoppt.

Ein neuer nativer Namensraum, frischer Quellruntime-
und Ownernachweis, Kalenderverbraucher, Kostenfreigabe, exklusive Reservierung,
Send-Claim sowie Review-/Ergebnisverbraucher und unabhängige Abnahme müssen erst
als gesonderter Ausführungsvertrag umgesetzt und belegt werden. Alle diese
Sperren bleiben im Vorbereitungsergebnis offen. Die öffentliche Endquittung
ersetzt weder den Authzustand noch die physischen Datenbankoriginale.

Diese Änderung installiert keinen Befehl und keinen Namensraum, schreibt kein
Journal, führt keinen Motor und keine Provideraufrufe aus. Sie behebt oder
qualifiziert den bisherigen Unit60-Fehler noch nicht. Der nächste500er Test bleibt
gesperrt, bis die Fehler und Voraussetzungen tatsächlich geschlossen sind.

## Prüfung

Der gezielte synthetische Test verwendet eigene temporäre Dateien und die
öffentliche historische Endquittung: ursprünglich43/43 PASS im netzlosen Container.
Mit erneuter Verifikation einschließlich Manipulations-/Neubindungsfällen
80/80 lokal PASS; eigener GitHub-Lauf39751014111 auf d2d1f7ad vollständig grün,
einschließlich des Einzelunit-Schritts und der84Originaldateien.
Der Test läuft in CI vor dem unveränderten Gate für private Originale.
Auch die echte schreibgeschützte Originalinspektion endet mit Exit0 und dem
gesperrten Vorbereitungsstatus. Paket, Installationspins und Endquittung stimmen
vorher/nachher in Bytes, Hash, dev/ino, Modus, nlink, mtime und ctime überein;
atime gehört nicht zum gespeicherten Vergleich. Beide eigenen Container wurden
nach Zustandsprüfung entfernt; OOM=false. Diese echte Originalinspektion lief auf
Node24.19.0 und bleibt vom synthetischen GitHub-Nachweis getrennt. Die
Speicherschranken sind keine500er Reserveabnahme.
[Bereinigter Prüfbeleg](belege/local-unit-diagnostic-20261022/PREPARATION_READONLY_ACCEPTANCE.SAFE.json).
