# Vorschlag: separates End500-Kapazitäts-GO, nicht erteilt

Neue getrennte Einmalfreigabe — vorbereitet, nicht erteilt

Pflicht-CI 41211894017 auf exakt 56ae2a68f2b3e3de6ae5fff878c3e9e7f50e0549 ist vollständig bestanden und unabhängig abgenommen. Code, öffentliche Quellen, Restore-Funktionskompatibilität und Startunterlagen sind ebenfalls unabhängig geprüft. Diese Vorlage erzeugt weder einen Versuch noch Nonce oder Links.

Das GO auf 123bbd06 ist durch Run 41208876552 verbraucht: Gesamt FAIL nach bestätigten 500 Auth-CAS, 6.000 Usagezeilen, 3.501 Postimages, final null aktiven Profilen, Exporten und Prozessstopp. Die primitive Originalursache und der damalige Gateway-Dateimodus bleiben UNKNOWN.

Der nachgewiesene Codefehler ist konkret: Die tatsächliche Gateway-Shellzeile erzeugt bei geerbter umask 022 eine Datei mit 0644; der unveränderte Collector verlangt 0600. Explizite umask 077 behebt dies. Die verbundene synthetische Vorbereitung, Materialisierung, Shellzeile und vollständige Collection bestehen. Die vorher verlorene erste Backupfehlerphase bleibt über den vorhandenen Fehlerkanal erhalten. Die native CI beobachtet ergänzend Docker-exec umask 0022 im bereits vorhandenen synthetischen postgres:17-Service. Sie betrifft den CI-Service, nicht rückwirkend das gepinnte 17.6-Originalruntimeimage. Diese Belege sind keine nachträglich gemessenen Originaldateimodi.

Der frühere Runner ist beendet und hat kein fertiges Sicherungsartefakt erzeugt. Eine echte nächste Sicherung kann deshalb nicht einfach dort fortgesetzt werden; sie benötigt eine neue, ausdrücklich freigegebene gemeinsame Integration.

> GO für genau einen vollständigen isolierten End500-Kapazitätsdiagnoselauf auf Commit `56ae2a68f2b3e3de6ae5fff878c3e9e7f50e0549` gemäß Draft PR #1002 im Environment `helmut-ci-originals`, nach vollständig bestandener Pflicht-CI `41211894017` und unabhängiger Abnahme dieses exakten Kopfes.
>
> Erlaubt ist ausschließlich der sichere Fast Forward von `codex/w15-github-end500-preparation-20261028` von `123bbd06850f0687ada26265d6e0e1b7d1fad787` auf diesen Commit. Kein Force Push, Merge oder Ändern der Schutzregeln.
>
> Öffentliche technische Codequalifikation ausschließlich mit SHA256 `a629aa0a48b81add4e9c94b6c0c2b459f560b25e8d036ad87d948f8fae21fd83`: geprüfte öffentliche Repositorypfade, Größen, Codehashes und feste technische Werte. Keine privaten Inhalte, Geheimnisse oder Klartextdownloadlinks. Bestehende private Restore-Funktionsbelege aus Run 41132913871 unverändert per unabhängig geprüfter Kompatibilität übernehmen; kein zusätzlicher separater Originalrestore.
>
> Umfang: vorhandene 15 Cipherteile und zwölf Originaldateien mit allen ursprünglichen Größen-, Hash-, Empfänger- und Integritätsbindungen prüfen; isoliert exakt 500 Profile und null aktive Profile wiederherstellen. 500 Auth-CAS, 6.000 Usagezeilen und 3.501 vollständige native Postimages vollständig prüfen. Exporte, finale null aktive Profile und sicheren Service-, Datenbank- und Watchstillstand bestätigen. Anschließend vollständige konsistente verschlüsselte Sicherung, vollständige authentifizierte entfernte Rücklesung, zweite frische isolierte Rücksicherung und vollständigen Vergleich von Tabellen, Daten, Rollen, Sequenzen und Integrität verlangen.
>
> Grenzen: maximal 3.600 Sekunden gemeinsam; durchgehend hart 4.999.999.488 Bytes RAM und mindestens 2.147.483.648 Bytes tatsächlich verfügbare Hostreserve. Swap, OOM und Maxereignisse null. Kein Peakreset oder Cacheeingriff. Bestehender vollständiger Plattenplan mit mindestens 512 MiB freier Reserve. Höchstens 0,05 USD zusätzliche Speicherung und ein verschlüsseltes GitHub-Artefakt für einen Tag. Keine Modellaufrufe oder Profilaktivierung.
>
> Sämtliche aktuellen Berechtigungen, Branch-, Commit- und Quellenbindungen, Pflicht-CI, Reviews und Ressourcen vor der Linkerzeugung prüfen. Genau eine frische private Linkrunde erst nach READY. Unmittelbar vor genau einem Start tatsächliche Restgültigkeit strikt über 90 Sekunden und gesamte Parametergröße höchstens 65.535 Zeichen nachweisen.
>
> Bei FAIL, UNKNOWN oder Sicherheitsverletzung sofort stoppen. Erste erhaltene Fehlerphase und vorhandene Messwerte sichern und unabhängig auswerten. Kein Retry oder Linkrefresh. Nur eigene Prozesse kontrolliert beenden und tatsächlichen Stillstand bestätigen. Keine automatische Löschung oder Branchrücksetzung; Originale, Drive-Dateien und Secrets erhalten.
>
> Diagnoseerfolg ändert weder den regulären End500- noch den getrennten Mock500-RAM-Vertrag und ist kein 500er Production-Nachweis. Kein Mock500, Merge, Deployment oder Production-Eingriff. Keine automatische Folgestufe.

Diese Vorlage enthält keine eigene Ausführungsautorität. Nach einem gegebenen GO müssen die Startbedingungen unmittelbar vor einer tatsächlichen Ausführung frisch bestätigt werden.
