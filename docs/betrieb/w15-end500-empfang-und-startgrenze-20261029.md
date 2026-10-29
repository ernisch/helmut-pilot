# W15: Empfang belegt, Actions-Daten-GO erteilt; Rücksicherung und Zugriff offen

Stand29.10.2026, PR975 bleibt Draft und auf PR974 gestapelt. Keine Production-
Änderung, kein Merge/Deployment, kein End500-/Mock500-Gesamtlauf. Der ausdrücklich
freigegebene einmalige Quelltransfer einschließlich Empfang ist abgeschlossen;
er wird nicht wiederholt. Der frühere Quellstartauftrag ist erledigte Historie.

**Aktuell nach jüngstem Betreiber-„Freigegeben“:** Die zusätzliche Daten- und
Empfängerschlüsselbereitstellung für GitHub Actions ist autorisiert; kein neues
Daten-GO anfragen. Vollständige End500-/Mock500-Läufe bleiben gesperrt. Beim
Wiederanlauf um05:46UTC ist der frühere private Empfang einschließlich Key und
Passphrase in der aktuellen Ausführungsumgebung nicht erreichbar. Der öffentliche
Worktree wurde aus dem gepushten6b24c890 wiederhergestellt, dessen Pflicht-CI
40793217236 grün ist. Die frühere vollständige Empfangsprüfung bleibt belegt;
sie ist keine Behauptung aktueller lokaler Datenverfügbarkeit. Drive-Metadaten
bestätigen den privaten Recovery-Wrapper(3.298Bytes) und die Quittung(17.136Bytes)
weiterhin. Vor Datennutzung den7E3998-Empfänger aus dem bestehenden Wrapper mit
DCFD605… rücksichern oder den bisherigen privaten Cloudbestand wieder erreichbar
machen. Kein erneuter Quelltransfer und kein Export des alten privaten
Recovery-Schlüssels. Letzte Secrets-API403 und fehlende Environment-Schutzregeln
bleiben zusätzliche technische Blocker; keine weiteren gleichartigen API-Versuche.
Der neue [Zugriffsstand nach GO](belege/w15-end500-transfer-20261029/START_ACCESS_AFTER_GO.SAFE.json)
hält diese Beobachtungen getrennt von historischen Prüfbelegen fest.

## Erfolgreicher Empfang

Die vollständige Drive-Quittung `1BbH3cBQJHbbxh5fsqs2CSnxwuVW5asWH` wurde gelesen
und gegen17.136Bytes/SHA256
`9f0a95928d6ca8dea0ae4d0aff522950f00bde7da815874fd736050fbca46cb7` geprüft.
Alle15 Teile wurden direkt aus dem bestehenden privaten Drive empfangen:
jeweils private Eigentümerberechtigung, Größe und SHA256 geprüft, anschließend
zusammengefügt und der Cipher von der privaten Platte vollständig rückgelesen.
Gesamt242.693.044Bytes/SHA256
`eeec60f6f97f35b143f9fca22fae653ea9c8695a23d712c9fc74c1979e410231`.
Kein Mac im Datenweg, kein erneuter Quellupload.

Der vorbereitete Empfänger
`7E3998A6C2CB948C69A2EE51F4267ABF26796EDC` und `receive.py` haben den vollständigen
authentifizierten GPG-Abschluss und alle zwölf Originaldateien bestätigt:
242.570.240Bytes, sämtliche Größen/SHA256 stimmen. Unabhängig wurden alle zwölf
Dateien erneut hashgeprüft sowie Eigentümer1000:1000, Dateien0600, Verzeichnisse
0700, keine Links und der vollständige erlaubte Baum bestätigt. Ein echter
`input_port.verify_received`-Verbrauchercheck bestätigt denselben Bestand und
seine Transfer-/Provenienzbindung; er startet keinen Controller.

Zum früheren erfolgreichen Prüfzeitpunkt verwendete private Empfangswurzel:
`/workspace/shared/helmut-w15-end500-receiver-20261029/private/received-26d5a4135ca7415ca41262fc45b561c8`.
Cipher und vollständige Quittung lagen daneben unter `private/incoming-cipher`;
diese Pfade sind im aktuellen Wiederanlauf nicht verfügbar.
Privater Schlüssel und Passphrase bleiben außerhalb Git. Öffentlich gespeichert
wird ausschließlich die geschlossene
[Empfangsprojektion](belege/w15-end500-transfer-20261029/RECEIVED_SOURCE.SAFE.json),
keine Originalquittung mit privaten Bestandsverweisen und keine Nutzdaten.

Der Transferkontext mit Run-ID20261029010443 ist kein GitHub-Actions-Lauf.
Plan-SHA84b73049… und versiegeltes Eingangsmanifest-SHAaf3bd654… sind verschiedene
Bindungen. Der erfolgreiche Empfang verwendete den damals gepinnten Code auf
8be75787; spätere Guard-Erweiterungen von `seal.py` ändern diesen historischen
Beleg nicht. Alte Transfer-Codepins werden nicht als Pins des neuen Codes ausgegeben.

## Fertig vorbereitete Anschlüsse

`runtime_inputs.py` verbindet ausschließlich explizit geprüfte Empfangspfade mit
dem vorhandenen Controller und Auditor. Die unveränderten Originalhashes,
historischen Herkunftspfade, fünf vollständigen Fixtures, Seed, Command,
Dump/Rollen und neun öffentlichen Provenienzberichte bleiben gebunden. Geänderte
öffentliche Quellen verlangen einen frischen unabhängigen Review: vollständige
aktuelle Quellenliste, sämtliche Alt-/Neu-Deltas, Commit-Blob-Vergleich und
konkreter Laufkontext. Ein alter grüner Review oder bloß passender HEAD reicht nicht.

`runtime_backup.py` und `runtime_owned_backup.py` ergänzen den bestehenden
Abschluss: vier ausdrücklich registrierte Exportaktionen, tatsächliche
Child-Exit-Quittungen und der vorhandene innere Stop vor äußerem Abbruch.
Finaler vollständiger Custom-Dump mit Datenbankanlage, Rollen und native
Vorher-/Nachher-Belege werden erst nach Writer-Abschluss, Nullstand und Voll-Audit
angefordert, noch unter laufendem ursprünglichem Wächter. Der komplette private
Arbeits-/Vorbereitungsbaum, zwölf Eingänge, Provenienz und logischer Export werden
inventarisiert, kopiert, erneut geprüft und mit dem vorhandenen Public-Key
versiegelt. Laufendes PGDATA ersetzt keinen konsistenten logischen Dump.

Kopien, Vorab-/Nachher-Hashes und GPG-Streaming prüfen denselben gemeinsamen
Parent weiter. Teilarchive bleiben privat erhalten; keine automatische Wiederholung,
kein Löschen. Frühe und abschließende Berichte setzen im neuen Pfad
`end500ActualMemoryAccepted=false`, `fullLifetimeClosureAccepted=false` und
`acceptedAsCompleteBackup=false`. Der exklusive Abschlussbeleg außerhalb des
eingefrorenen Archivs erhält Fehler und letzte Kernelbeobachtung. Ein lokales
Cipher allein ist kein vollständiger Restore-/Remote-/500er-Nachweis.

## Unveränderter RAM-Vertrag und tatsächlicher Restanschluss

2.560.000.000Bytes gemeinsame Parent-Zuteilung, tatsächlicher gemeinsamer
Lebenszeitpeak höchstens2.048.000.000Bytes, mindestens512.000.000Bytes physische
Reserve, Swap0.1,8/1,9GB allein stoppen nicht. Auth30/Unit60/Provider20 und
vollständige Integrität bleiben erhalten; Mock500 ist eine separate Stufe.

Der alte Containerpeak umfasste den hostseitigen Python-Orchestrator/Auditor und
späteren Backupabschluss nicht. Er wird nicht nachträglich zum Gesamtpeak erklärt.
`common_resources.py` verlangt jetzt den echten unveränderten Kernel-Parent mit
Python und Container unter demselben Lebenszeitpeak; unbekannte Werte, Swap,
Limit-/OOM-Ereignisse oder Überschreitung stoppen. Neue Guardprüfungen mit
erfundenen cgroup-Dateien beweisen keine tatsächliche Runner-Einrichtung.

Ein frischer Standardrunner muss diesen Parent und UID/GID1000 tatsächlich
herstellen und beobachten. Auch privater Hostschritt, öffentliche Quellenkopie,
Seed-Mount und Docker-Socket-Gruppe müssen dazu passen; keine Lockerung von0600/
0700. Dieser Bootstrap und ein startbarer neuer Workflow/CLI sind noch nicht
integriert. Der ursprüngliche Legacy-`--run` ist keine freigegebene GitHub-Startanleitung.
Image-ID, tatsächliches `df`, vollständige Restore-/WAL-/Log-/Cipherreserve und
Setupdauer bleiben zu messen. Die frühere43s-Komponenten-CI ist keine End500-Prognose.
Standardrunner-Kostenannahme und getrennte Artefaktquoten stehen im
[bisherigen Runnerplan](w15-github-end500-vorbereitung-20261028.md#ressourcen-dauer-und-kosten).
Keine neuen Ressourcen oder RAM-Optimierungen wurden eingeführt.

Vercel Standard/2048MB pro Funktion ist der bereits rein lesend bestätigte
Production-Befund. Der gemeinsame GitHub-Test einschließlich lokaler Datenbank,
eine einzelne Vercel-Funktion und die externe Supabase-Datenbank sind verschiedene
Messräume. Kein Beleg für einen Funktionsbedarf über2GB oder für eine notwendige
Performance-Umstellung. Historische Messungen/Ergebnisse bleiben unverändert.

## Konkrete neue Zugriffs- und Freigabegrenze

Mit der konfigurierten Identität `HELMUT_GITHUB_CI_ADMIN_TOKEN` wurde tatsächlich
rein lesend geprüft: Environment `helmut-ci-originals` HTTP200, keine
`protection_rules`, keine `deployment_branch_policy`, `can_admins_bypass=true`.
Secrets-Metadaten liefern HTTP403 `Resource not accessible by integration`.
Eine als ready konfigurierte Identität beweist nicht die erforderliche API-Berechtigung.
Keine weiteren gleichartigen Versuche und keine Secret-/Environment-Schreibzugriffe.

Kleinster vorgeschlagener Datenweg nach gesondertem GO: die vorhandenen15
Cipherteile im bisherigen Drive belassen; nur eng befristete lesende HTTPS-
Downloadfähigkeiten dafür und den passwortgeschützten Export des neuen
Empfängerschlüssels samt Passphrase in einem Environment-gebundenen Secretpaket
unter48KiB an genau den geprüften GitHub-Commit/Workflow/Run, Versuch1 und eine
Frist binden. Keine Drive-OAuth-Zugangsdaten, kein alter Recovery-Schlüssel und
keine Production-Zugangsdaten. Konkrete URLs/Schlüssel/Passphrase gehören weder
in Git noch Workflow-Eingaben, öffentliche Logs oder Artefakte. Einzelne
verschachtelte Geheimwerte müssen vor Nutzung maskiert sein; private
Prozessausgaben werden unmittelbar in private Dateien geschrieben.

**Vor Veröffentlichung dieses Secretpakets erforderlich:** tatsächlicher Zugriff
auf die Environment-Secret-API und rückgesicherter Empfänger. Die konkrete
Freigabe für die zusätzliche GitHub-Daten-/Schlüsselbereitstellung ist inzwischen erteilt. Das bestehende Environment muss vorher
auf den überprüften Branch beschränkt, mit unabhängiger Freigabe geschützt und
ohne Admin-Bypass rückgelesen sein. Aktuell sind weder diese Schutzbindung noch
Secrets-Zugriff gegeben. Es wurde kein Paket erstellt oder veröffentlicht.
Ein Software-Zeitlimit widerruft keinen bereits kopierten privaten Schlüssel;
native Secret-Ablaufzeit ist nicht belegt. Der Secret-Lebenszyklus einschließlich
ausdrücklich erlaubter Entfernung temporärer Zugangsmittel ist deshalb vorher
festzulegen; das bestehende Datenlöschverbot wird nicht stillschweigend erweitert.

Nach GO: im unveränderten gemeinsamen Ressourcenraum Cipherteile erneut prüfen,
authentifiziert entschlüsseln und alle zwölf Originalpins prüfen; dann erst den
neuen Laufkontext anbinden. Ein vollständiger Backup-Restore braucht einen
getrennten neuen privaten Zielbaum und eine neue isolierte Datenbank mit Rollen,
Dump-Restore, vollständiger Integritätsprüfung und Nullstand; kein Überschreiben
oder Entfernen der empfangenen Originale. Tatsächlich unabhängiger Restore,
vollständige finale Datenbank-/Dateibindung und authentifiziertes Remote-Rücklesen
des Abschlussarchivs sind noch offen. Der aktuelle Empfängerschlüssel ist lokal
wiederherstellbar; sein neuer Offhost-Recovery-Wrapper wurde nicht extern entschlüsselt.

Rückweg: Actions weiterhin gesperrt lassen; bestehende Originale, Drive-Cipher,
lokalen Empfang und historischen Nachweise unverändert erhalten. Keine Daten-
oder Production-Rücksicherung wird automatisch angewendet. Ein späteres FAIL/
UNKNOWN erhält den Erstfehler und private Teilprodukte, kein Retry/Resume.

## Prüfung und Startentscheidung

51 gezielte neue Entwicklungsprüfungen bestanden:16 Eingangs-/Quellenadapter,
13 Export-/Sammlungsfälle,7 Parent-Guardfälle,6 Owned-Prozessfälle,7 Seal-Fälle
und2 Abschlussberichtsregressionen. Darunter echte lokale Node-SIGTERM-/Child-
Exit- und GPG-Abbruchproben ausschließlich mit erfundenen Daten; keine reale
Datenbank oder End500-Ausführung. Die27 von nachgebesserten Hash-/Readbackpfaden
betroffenen Fälle wurden gezielt erneut geprüft; übrige erfolgreiche Fälle übernommen.
Zusätzlich bestehen die neun vorhandenen RAM-/Legacy-Grenzfälle am neuen
Watch-Anschluss; nur dessen fiktive Testinstanz erhielt das neue Parent-Feld.
Unabhängige statische Sicherheitsabnahme bestätigt den geprüften Umfang, keine
vollständige Runner-/Restore-Abnahme. Einzelheiten und Dateipins im
[Integrationsbeleg](belege/w15-end500-transfer-20261029/RECEPTION_INTEGRATION.SAFE.json).

Pflicht-CI40793217236 auf6b24c890 ist grün. Der aktuelle öffentliche Quellenabschluss
wurde nach Commit tatsächlich gegen431 Git-Blobs/42 historische Pintripel geprüft;
sechs Deltas verlangen einen frischen laufgebundenen Review. Die spätere reine
Statusfortschreibung braucht ihre eigene Kopf-CI; ältere Erfolge gelten nicht automatisch weiter.

**Startentscheidung: gesperrt, noch nicht vollständig ausführbar vorbereitet.**
Der einmalige Transfer und frühere Empfang sind vollständig belegt. Aktuell fehlen
Empfängerrücksicherung, geschützter GitHub-Zugang trotz erteiltem Daten-GO,
tatsächlicher gemeinsamer Runneranschluss,
vollständige Restore-/Remote-Bindung sowie frischer unabhängiger Laufreview.
Erst nach deren Abschluss ist eine konkrete Freigabe für genau einen vollständigen
End500 sinnvoll. Empfangs-GO und grüne Entwicklungsprüfungen ersetzen sie nicht.
