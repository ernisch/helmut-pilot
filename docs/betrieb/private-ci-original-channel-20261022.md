# Geschützter Originalkanal für die Pflicht-CI

Der GitHub-Runner besaß anfangs nur den Checkout; deshalb scheiterte dort
`connect-local500.py` mit `regular pinned file required`. Der geschützte Kanal
stellt jetzt alle84 Originaldateien bereit. Drei vollständige grüne GitHub-Läufe
belegen die Lösung einschließlich der beiden Integrationsstände unten.

## Vorbereitet

Nur das verschlüsselte CI-Minimum liegt unter
`.github/ci-originals/CI84_ORIGINALS.tar.gz.gpg` in Git. Keine Klartextoriginale
und kein Schlüssel werden eingecheckt. Das Paket umfasst84 reguläre Dateien,
83.496.520B, gebunden an das unveränderte Originalmanifest
`b2e3584818b16fed2f4bfd845f9379732d9f9eb045c83f59ad94034d9e6c46ef`.
Cipher30.165.381B/SHA256
`0e2c02bee106af05d1d7a272e364dd2f2865d67756c512f1304177480996f8a4`.
AES256/MDC; erfolgreicher echter Roundtrip84/84, manipulierte Kopie abgewiesen.
Alle84 Quelloriginale vor/nach einschließlich gebundener Metadaten unverändert;
atime ist vom Vergleich ausgenommen. Physische Datenbankkopien gehören nicht zu
diesem CI-Minimum und werden dadurch nicht als übertragen behauptet.

Der Workflow ermittelt zuerst ohne private Zugänge seinen Prüfbedarf. Für den
vollen Lauf verwendet er die Environment `helmut-ci-originals`. Nach deren
Freigabe prüft ein Leser mit dem kurzlebigen, rein lesenden `GITHUB_TOKEN`:
Lauf/Versuch, Workflow, Reviewer`ernisch`/ID273344519, PR-Ref, aktueller PR-Head
und ausgecheckter Merge-Commit. Ein öffentlicher Preflight bindet dessen echte
zwei Git-Eltern an Event-Basis/Head, statt den eventuell veralteten Mergezeiger
des Webhooks zu verwenden. Der aktuelle PR-API-Stand wird zusätzlich geprüft.
Fremde Forks, abweichende PR-Stände und fehlende
GitHub-Reviewhistorie werden abgewiesen. Ein fehlgeschlagener öffentlicher
Prüfplan lässt den bestehenden Pflichtjob fehlschlagen, nicht überspringen.
Der Job verwendet `!cancelled()`: fehlgeschlagene Pläne werden weiterhin rot,
überholte Läufe können jedoch ihren Parallelitätsslot durch Abbruch freigeben.

Erst danach erhält ein einzelner Bereitstellungsschritt den CI-Paketschlüssel.
Er prüft Cipher- und Archivhash, extrahiert ausschließlich die84 erlaubten
regulären Dateien und ruft den vorhandenen strikten Provisioner auf. Ziele
müssen frei sein; private Rechte, `O_NOFOLLOW`, `O_EXCL`, Originalhashes und
der bestehende freie Plattenboden gelten weiter. Der Schlüssel wird keinem
Git-/GPG-Kindprozess als Umgebungsvariable und keiner Testsuite mitgegeben.

Die21 folgenden Schritte nutzen eine feste Wrapper-Shell. Bei vollem Lauf
bleiben ihre Ausgaben in privaten Runnerdateien; öffentlich erscheinen nur Exitcode, Größe und Loghash. Jeder
ursprüngliche Befehl und seine Zeitgrenze bleiben erhalten. Nach Testende werden
die Logs separat verschlüsselt und ausschließlich als `.gpg`-Artefakt mit7Tagen
Aufbewahrung gesichert. Keine Klartextlogs/-originale oder Schlüsselartefakte.
Gezielte öffentliche Läufe behalten ihre normale Ausgabe.

## Einmalige Einrichtung durch den Repository-Eigentümer

Die verfügbaren Cloudwerkzeuge können keine GitHub-Environment oder Secrets
einrichten; ein steuerbarer Browser ist in diesem Task nicht verfügbar.
Es ist kein neuer GitHub-PAT erforderlich.

1. [GitHub → Settings → Environments](https://github.com/ernisch/helmut-pilot/settings/environments)
   öffnen und die Environment **`helmut-ci-originals`** erstellen.
2. Unter **Deployment protection rules → Required reviewers** den Benutzer
   **`ernisch`** eintragen und speichern. Die manuelle Freigabe muss eingerichtet
   sein; eine automatische oder administrative Umgehung liefert dem Leser keinen
   zulässigen Reviewbeleg.
3. Unter **Environment secrets → Add environment secret** den Namen
   **`HELMUT_CI_ORIGINALS_KEY`** anlegen. Als Wert ausschließlich den Inhalt der
   privaten, separat bereitgestellten CI-Schlüsseldatei direkt in GitHub einfügen.
   Das ist ein neu erzeugter Paketschlüssel, kein GitHub-Token und nicht der
   Schlüssel des vollständigen Originaltransfers. Nicht im Chat, in Git oder als
   unverschlüsseltes Workflowartefakt ablegen.
   Der Name darf ausschließlich in dieser geschützten Environment liegen.
   Falls zusätzlich ein gleichnamiges **Repository secret** existiert, nur diesen
   zusätzlichen Eintrag entfernen; den Environment-Eintrag behalten.
4. Den aktuellen PR-/CI-Lauf prüfen. Die Environment verweist auf den exakten
   Checkout-Commit. Unter **Review deployments** nur diesen geprüften Stand für
   **`helmut-ci-originals`** freigeben. Ein neuer PR-Commit braucht eine neue
   Freigabe. Falls ein Lauf schon ohne Einrichtung beendet wurde: erst nach der
   Einrichtung erneut starten und den neuen Lauf prüfen/freigeben.

Die öffentliche Environment `helmut-ci-public` braucht keinen Schlüssel und
keinen privaten Zugang. Sie dient nur dem unveränderten Jobnamen für Läufe ohne
Originalbedarf. Die Environment-Freigabe ist keine Freigabe eines500er Tests.

## Abnahmegrenzen

Lokal28 Schutztests einschließlich Fehler-/Archiv-/Logfällen und echtem
Log-GPG-Roundtrip PASS. Workflow-YAML, Python- und eingebettete Shellsyntax PASS.
Der echte [GitHub-Lauf39745628626](https://github.com/ernisch/helmut-pilot/actions/runs/39745628626)
auf3424469c ist vollständig grün: Freigabe/Lauf/PR/Checkoutprüfung,84Originale,
180Standardsuiten,335Bereichssuiten, alle angeforderten isolierten Datenbankchecks
und Browser/Mobile PASS. Die Diagnosen wurden ausschließlich verschlüsselt gesichert.
PR930 ist als eb4bfd61 im Entwicklungszweig übernommen; dessen Quellbaum stimmt
exakt mit dem geprüften Stand überein. Neue Integrationsläufe brauchen ihre eigene
Freigabe. [Bereinigter Echtbeleg](belege/private-ci-channel-20261022/GITHUB_ACCEPTANCE_39745628626.SAFE.json).
Auch die Integrationsläufe39750868037/c303790b und39751014111/d2d1f7ad sind
vollständig grün: je84Originale,180Standard- und335Bereichssuiten sowie alle
angeforderten isolierten DB-Nachweise. Browser/Mobile lief auf929 erfolgreich;
auf931 wurde es für die Fachänderung bewusst übersprungen. PR931 ist als57a64670
im Entwicklungszweig übernommen; sein Quellbaum ist gleich zum geprüften d2d1f7ad.
[Integrationsbeleg](belege/private-ci-channel-20261022/GITHUB_INTEGRATION.SAFE.json).
Die zusätzliche Views-Hashwiederverwendung hat26gezielte lokale Checks und eine
gesonderte Pro-High-Leseprüfung bestanden. Alle frischen Guards bleiben erhalten;
der gemeinsame neue Kopf benötigt seine eigene CI-Freigabe und vollständige Prüfung.
Kein500er Lauf, keine Unit60-Qualifikation und keine Production-Aktion daraus.
