# W15: gemeinsamer Runner, getrennte Restore- und End500-Freigaben

Stand29.10.2026UTC, DraftPR975, bestehender Entwicklungszweig. Dieser Stand
bereitet ausführbaren Code vor. **Kein neuer Originalempfang, Originalrestore,
End500, Mock500, Merge, Deployment oder Production-Eingriff ist freigegeben.**
Die späteren Stufen benötigen jeweils ein konkretes GO und getrennte Abnahme.

## Übernommene Belege

Der erfolgreiche Originalempfang40876458074 auf596c5b1f bleibt erhalten:
15Cipherteile,12Dateien,242570240Originalbytes; keine neue Originalbeschaffung
oder Verschlüsselung. Empfängerprüfung40855525798, Parentprobe40847487765 und
Kanalprüfung40848206475 werden nicht wiederholt. Die Pflicht-CI40885509897
auf9fafe009 ist vollständig erfolgreich; sie ersetzt keine CI auf diesem
neuen Codekopf. Die vorherigen38neuen Restore-Anschlussfälle und6betroffenen
Regressionen bleiben historische gezielte Belege.

## Tatsächlich verbundener Code

Der bestehende manuelle Workflow hat jetzt drei strikt getrennte Modi:

| Modus | Wirkung nach gültiger Bindung |
| --- | --- |
| `end500-restore-synthetic` | Neuer Runneranschluss mit öffentlichen Codepins, privaten fiktiven Bytes und echter gemeinsamer Messung; keine Empfängersecrets, Downloads von Originalen, Datenbank oder500er-Ausführung. |
| `end500-restore-gated` | Genau ein neuer Empfang der bestehenden Cipherteile im selben Job, zwölf Originalpins, Cache/Materialisierung, isolierter Restore bis exakt500Profile/0aktiv, konsistente vollständige Sicherung, verschlüsselter Offhost-Rücktransport und neue isolierte Rücksicherungsdatenbank. Kein Seed, Auth-CAS, Units oder Provider. |
| `end500-full-gated` | Nach separater positiver Restoreabnahme und neuem konkretem GO: derselbe frische Empfang/Restore und der vollständige bestehende End500-Controller.500Auth-CAS,6000Usage,3501vollständige native Postimages, vollständige Ergebnisprüfung,0aktiv/0Units/0Provider; anschließend vollständige Sicherung und Rücksicherung. |

Die Standard- und PR-Pflichtchecks bleiben bestehen. Kein Modus setzt sich
automatisch mit der nächsten Stufe fort. Standard/Plan/fehlendes/abgelaufenes
GO führen nicht zu Originalzugriff. Ein Workflowstart ist keine Abnahme.

`runner_start.py` erzeugt eine neue begrenzte Slice, kopiert rohe Gitblobs und
eigene flache Gitobjekte ohne Filter, Hardlinks oder Alternates, prüft die
vorhandenen Binärpins und wechselt nur den neuen Worker aufUID/GID1000 samt
Docker-Supplementgruppe. Der ursprüngliche Checkout und seine Rechte bleiben
erhalten. Der feste Worker ist `restore_workflow.run_worker`; keine frei
wählbaren Kommandos oder Zielpfade. Erst der äußere leere Parentreadback nach
allen Kindprozessen schließt die Lebenszeitmessung. Kein Peakreset.

Node24.19.0, PostgREST12.2.3 und das bestehende PostgreSQL17.6-Image werden
unverändert gepinnt wiederverwendet. Die tatsächlich gebaute lokale Image-ID
wird an den Lauf gebunden; keine historische lokale Image-ID wird gepullt.
PostgreSQL läuft ohne Netzwerk, unter derselben Slice und ohne Restartpolicy.
Stopps binden den tatsächlichen Container an ID/Image/Labels/Parent; anschließend
werdenPID0,Exit0 und kein OOM verlangt. Keine automatische Containerlöschung.

Der statische unabhängige Quellreview bindet den gesamten aktuellen
Ausführungsabschluss einschließlich lokaler Action und aller historischen
Abweichungen. Ein separat benanntes Runtimebeobachtungsobjekt bindet erst die
tatsächlichen Runnerdaten daran. Es behauptet keinen vorab beobachteten
zukünftigen Run. Der alte streng kontextgebundene Reviewweg bleibt bestehen.

Der öffentliche Reviewtext wird verlustfrei zlib/Base64-kodiert; begrenzte
Dekompression, EOF/keinTail und externer SHA256 werden geprüft. Der gesamte
wirkliche Dispatch mit Review, GO und **GPG-verschlüsseltem** Downloadindex
muss≤65535Zeichen bleiben. Kein Klartextindex oder externer öffentlicher
Ersatzspeicher. Bestehender Empfänger7E3998A6C2CB948C69A2EE51F4267ABF26796EDC.
Die zwei vorhandenen Secrets in`helmut-ci-originals` bleiben unverändert.
Ein lokales JavaScript-Action-Entry übergibt sie und bestehende Actions-
Runtimecredentials ausschließlich über private stdin/IPC; keine Shellinputs,
Geheimnisse in Argumenten, öffentlichen Outputs oder Caches. Der blockierte
Environment-Secret-Schreibendpunkt wird nicht benötigt oder erneut aufgerufen.

## Sicherung und tatsächliche Integrität

Restore-only hat eine eigene wahrheitsgemäße Closure aus den fünf echten
Restoreschritten. Die vorhandene vollständige End500-Backupclosure wird nicht
gelockert, ersetzt oder durch synthetische PASS-Dateien nachgebildet.
Die vollständige Auswahl enthält alle zwölf Eingaben, neun Provenienzbelege,
vorbereitete Runtime, Diagnose-/Abschlussdateien, konsistenten finalen Customdump
und Rollen. PhysischePGDATA werden ausdrücklich durch den logischen Dump ersetzt.
Auswahl und Quellen werden nach der vollständigen Kopie nochmals gehasht.

Vorher-/Nachhersnapshots binden alle persistenten Benutzertabellen einschließlich
Spaltendefinitionen und duplikaterhaltenden, sortierten SHA256-Zeilendigesten,
Sequenzstände und Rollen; Fremdtabellen werden abgewiesen. Die neue frische
Rücksicherungsdatenbank muss dieselben Tabellen-/Sequenzinventare und semantisch
dieselben Rollen liefern. Die ursprünglichen Rollenbytes bleiben unverändert;
allein die vorhandene Bootstraprolle`postgres` wird im abgeleiteten Restore-
Skript nicht nochmals angelegt.500/0 allein genügt nicht als Integritätsbeleg.

Vorhandenes GPG-seal verschlüsselt ohne neues Schlüsselsystem. Nur die fertige
Cipherdatei wird mit den unveränderlich gepinnten offiziellen GitHub-Actions-
Bundles hochgeladen, Retention1Tag, ohne Overwrite. Ein frischer entfernter
Download muss Bytezahl/SHA256 bestätigen; danach erfolgen authentifizierte
GPG-/Tar-/Manifestprüfung aller Mitglieder und die echte zweite isolierte
Wiederherstellung. Keine Klartextartefakte/Logs/Cacheuploads. Auch nach diesen
Beobachtungen bleibt die unabhängige Gesamt-Abnahme ausdrücklich separat.

## Ressourcen, Zeit, Kosten und Abbruch

RAM unverändert: gemeinsames hartes Limit2560000000Bytes, Lebenszeitpeak
höchstens2048000000Bytes, mindestens512000000Bytes/20Prozent Reserve,Swap0.
Empfang, Staging, Restore, Arbeit, Sicherung, SDK-Kinder, Rücklesung,
Rücksicherung und Abschluss gehören zur selben Messung.

Der vollständige konservative Plattenplan aus`restore_resources.py` verlangt
12465332072Bytes zuzüglich tatsächlich gemessenem Checkout und143299024Bytes
gepinnter Binärdateien. Enthalten sind alle behaltenen Teile/Konkatenation/
Klartexte, Cache/Materialisierung/SQLkopien,PGDATA/WAL/Temp,Diagnosen, vollständige
Auswahlkopie/Cipher/ZIP/Rückdownload, authentifizierte Extraktion und die frische
Rücksicherung samt erneutem Dump. Freier Plattenrest und Wachstum werden frisch
und während aller Phasen geprüft. Keine Löschung zum Erreichen des Plans.

| Grenze | Restore | End500 |
| --- | --- | --- |
| Gemeinsame Parentlebenszeit inkl. Setup/Kinder | höchstens1800s | höchstens3600s |
| GitHub-Job inkl. Werkzeugbereitstellung | höchstens75min | höchstens75min |
| Neuer Originalempfang | genau ein Versuch | genau ein Versuch im frischen Job |
| Cipherobergrenze aus vollständigen Auswahlgrenzen |1326437376Bytes |1326437376Bytes |
| Maximale zusätzliche Speicherung je Stufe |0,05USD |0,05USD |
| Modellaufrufe/Kosten |0/0USD |0/0USD |

Öffentlicher Standard-Linuxrunner:0USD Runnergebühr. Speichergrenze konservativ
mit veröffentlichten0,25USD/GB/Monat,28-Tage-Monat,1Tag+Stundenrundung berechnet;
kein kostenloses Kontingent angenommen. Bytezahl und Preis werden vor Upload
geprüft; größerer Bedarf wird nicht automatisch freigegeben. Keine neuen
Schlüssel, Server, Dienste oder Abonnements. Grundlage:
https://docs.github.com/en/billing/concepts/product-billing/github-actions .

Abbruch beiFAIL/UNKNOWN, ungültigem/abgelaufenem GO, anderer Branch/Commit/
Nonce/Versuch, abgelaufenen tatsächlichen Downloadlinks, Pin-/Empfängerdrift,
falschen500/0, fremdem Kind/Container, Ressourcen-/Zeit-/Kostenüberschreitung,
fehlender nativer Exit-/Stopquittung, unvollständigem Audit/Backup oder
Rücksicherungsabweichung. Kein automatischer Original-/Restore-/Workflowretry.
Transientes Chunkhandling des offiziellen ArtifactSDK wiederholt keinen Test.
Erstfehler bleibt erhalten; nur eindeutig eigene Prozesse werden beendet.

Rückweg: neuen Empfangspfad nicht weiter verwenden. Eigene isolierte Container
stoppen und nachprüfen; keine automatische Löschung. Bestehende Secrets,
Drive-Cipherteile, Originale und historische Belege bleiben erhalten. Die
ephemere Runnerablage ist keine dauerhafte Aufbewahrung; nur vollständig
verschlüsselte Offhostbytes dürfen als Rücksicherungsgrundlage gelten.

## Freigabevorlagen und echte Stufengrenzen

Erst nach unabhängiger Codeprüfung, gezielter neuer synthetischer
Runnerqualifikation und grüner Pflicht-CI auf dem tatsächlichen Codekopf:

> GO Restore: Genau einmal auf dem ausdrücklich benannten geprüften PR975-
> Commit im Environment helmut-ci-originals die vorhandenen15Cipherteile
> empfangen,12Originalpins prüfen und isoliert bis exakt500Profile/0aktiv
> wiederherstellen; vollständige verschlüsselte Sicherung, entfernte Rücklesung
> und zweite isolierte Rücksicherung einschließen.1800s gemeinsamer Parent,
> unveränderter RAM-Vertrag, höchstens0,05USD zusätzliche Speicherung,
> keine Modellaufrufe, kein End500/Mock500 oder Production. BeiFAIL/UNKNOWN
> stoppen, kein Retry. GO wird beim Start an neuen Nonce und≤2h-Gültigkeit gebunden.

Erwartet:12/242570240Bytes,5Restoreschritte,500/0, vollständige native
Sicherung/Rückdownload/Manifestprüfung, gleiche Tabellen/Sequenzen/Rollen nach
frischem zweiten Restore, alle eigenen Kinder beendet, unverletzte Originale
und lückenlose gemeinsame RAM-/Platten-/Zeitquittung. Danach unabhängige
Restoreabnahme mitRun-ID,Commit und Receipt-SHA256; Workflowgrün allein genügt nicht.

Erst **nach** dieser positiven separaten Abnahme ist folgende Vorlage startfähig:

> GO End500: Auf demselben geprüften Codekopf nach gebundener positiver
> Restoreabnahme genau einen frischen gemeinsamen GitHub-Lauf mit erneutem
> begründet notwendigem Empfang der vorhandenen Cipherteile, isoliertem Restore
> und vollständigem bestehendem End500-Controller ausführen.500Auth-CAS,
>6000Usage,3501native Postimages, vollständige Endprüfung und0aktiv/0Units/
>0Provider; vollständige Sicherung und zweite isolierte Rücksicherung.
>3600s gemeinsamer Parent, unveränderter RAM-Vertrag, höchstens0,05USD neue
> Speicherung. BeiFAIL/UNKNOWN stoppen; kein Retry/Mock500/Production.

Zwischen zwei getrennt abzunehmenden Jobs können die kurzlebigen Klartexte
nicht vorausgesetzt werden. Deshalb ist der begründete neue Empfang Teil des
jeweiligen zukünftigen GO; kein neuer Hauptthreadexport oder neue Original-
Beschaffung. Es gibt keine verdeckte Fortsetzung eines beendeten Runners.

## Mock500 und Production bleiben eigenständige Stufen

Rein lesend übernommen: `MOCK_BINDINGS_20261028_SUMMARY.SAFE.json` bestätigt
338/500 gültige D/R-Eingaben und162Fehler:120Berlinprofile ohne zulässigen
aktuellen Quellenkontext sowie42nicht vollständig belegte Mockinhalte. Keine
erneute500er-Qualifikation, keine Quellenverjüngung oder Umdeklarierung.
Diese Datenblocker werden durch einen End500-PASS nicht behoben. Nötig sind
wahrheitsgemäß zulässige Quellen/Kontexte und belegte Mockinhalte mit500/500-
Qualifikation und unabhängiger Abnahme; neue Originalbeschaffung bleibt gesperrt.

Danach braucht Mock500 sein eigenes GO:500gleichzeitig aktive synthetische
Profile,500Units,1000Providerphasen,1500vollständig bilanzierte Ergebnisse,
8000echte Kontrollen, bestehende Unit60/Auth30/Provider20- und RAM-Verträge,
Ende und Rückführung auf0. Production braucht anschließend frische tatsächliche
Production-/Deployment-/Quellen-/Kosten-/Wächterbindungen, eigene Freigabe und
separaten bezahlten Funktionsnachweis. Keiner dieser Belege wird aus dem hier
vorbereiteten End500-Code abgeleitet.
