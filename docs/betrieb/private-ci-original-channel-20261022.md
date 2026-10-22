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
vollen Lauf verwendet er die Environment `helmut-ci-originals`. Ein Leser mit
dem kurzlebigen, rein lesenden `GITHUB_TOKEN` prüft Lauf/Versuch, Workflow,
PR-Ref, aktuellen PR-Head und ausgecheckten Merge-Commit. Ein öffentlicher Preflight bindet dessen echte
zwei Git-Eltern an Event-Basis/Head, statt den eventuell veralteten Mergezeiger
des Webhooks zu verwenden. Der aktuelle PR-API-Stand wird zusätzlich geprüft.
Fremde Forks und abweichende PR-Stände werden abgewiesen. Ein fehlgeschlagener öffentlicher
Prüfplan lässt den bestehenden Pflichtjob fehlschlagen, nicht überspringen.
Der Job verwendet `!cancelled()`: fehlgeschlagene Pläne werden weiterhin rot,
überholte Läufe können jedoch ihren Parallelitätsslot durch Abbruch freigeben.

Ohne zusätzliche Konfiguration gilt im neuen Code `owner-automatic-v1`.
Dieser Modus erlaubt die automatische Bereitstellung nur, wenn die
GitHub-API sowohl den ursprünglichen als auch den aktuellen Auslöser als
`ernisch` mit dieser ID bestätigt. Beide Repository-IDs und -Namen müssen zum
fest gebundenen Repository gehören. Bei PRs müssen zusätzlich Autor,
Quell-/Zielrepository, aktueller Kopf und Merge-Checkout übereinstimmen;
Main-Pushes und manuelle Workflowstarts bleiben auf `main` begrenzt.
Unbekannte Regeln, andere Auslöser und unvollständige Metadaten sperren den
Zugriff. Die Automatik erzeugt einen eigenen Zugangsbeleg und behauptet keine
persönliche Reviewfreigabe. Ein Beleg ist nicht zwischen den Regeln austauschbar.
Optional wählt die Environment-Variable `HELMUT_CI_ORIGINALS_ACCESS_POLICY`
den bisherigen Modus `manual`: Dann ist eine echte persönliche Freigabe von
`ernisch`/ID273344519 für genau diesen Lauf erforderlich.

Die Automatik vertraut damit dem Code und den Workflows, die der Eigentümer
selbst in diesem Repository auslöst. Sie ist keine Freigabe privater Originale
für fremden PR-Code. Der Betreiber hat am22.10.2026 den automatischen Ablauf
für seine eigenen Änderungen verlangt. Wirksam wird er nach der bewussten
Umstellung der Environment; die Codeänderung allein entfernt keinen Reviewer.

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

## Einmalige Umstellung auf automatische CI

Die verfügbaren Cloudwerkzeuge können keine GitHub-Environment oder Secrets
einrichten; ein steuerbarer Browser ist in diesem Task nicht verfügbar.
Es ist kein neuer GitHub-PAT erforderlich.

Erst nach Veröffentlichung und öffentlicher Prüfung des neuen CI-Codes umstellen:

1. [GitHub → Settings → Environments](https://github.com/ernisch/helmut-pilot/settings/environments)
   öffnen und **`helmut-ci-originals`** auswählen.
2. Unter **Deployment protection rules → Required reviewers** die Pflicht zur
   persönlichen Freigabe entfernen und die Schutzregeln speichern. Andere
   Branch-/Zugriffsregeln beibehalten.
3. **`HELMUT_CI_ORIGINALS_KEY`** unter **Environment secrets** beibehalten.
   Ein bereits korrekt eingerichteter Schlüssel muss weder neu erzeugt noch
   erneut eingegeben werden. Er bleibt ausschließlich in dieser Environment.
   Eine neue Variable wird für die Automatik nicht benötigt.

Ein frischer Lauf mit dem neuen Code muss anschließend seinen echten automatischen
Zugang und die vollständige CI bestehen. Alte Workflows besitzen diese neue
Regel noch nicht; sie werden durch eine GitHub-Einstellungsänderung nicht umgebaut.
Bereits wartende Läufe gegebenenfalls durch einen neuen Lauf mit aktuellem Code
ersetzen. GitHubs Bezeichnung „Deployment“ meint hier ausschließlich den
CI-Schlüsselzugriff und keine Veröffentlichung von Helmut.

Für den bisherigen manuellen Modus die Variable auf `manual` setzen und
`ernisch` wieder als Required reviewer eintragen. Dann gilt weiterhin die
persönliche Freigabe je Lauf über „Review deployments“. Der kurzlebige
`GITHUB_TOKEN` wird in beiden Modi nur lesend verwendet; es werden keine
Reviews automatisch im Namen des Benutzers eingetragen.

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
exakt mit dem geprüften Stand überein. Im manuellen Modus brauchen neue Integrationsläufe ihre eigene
Freigabe. [Bereinigter Echtbeleg](belege/private-ci-channel-20261022/GITHUB_ACCEPTANCE_39745628626.SAFE.json).
Auch die Integrationsläufe39750868037/c303790b und39751014111/d2d1f7ad sind
vollständig grün: je84Originale,180Standard- und335Bereichssuiten sowie alle
angeforderten isolierten DB-Nachweise. Browser/Mobile lief auf929 erfolgreich;
auf931 wurde es für die Fachänderung bewusst übersprungen. PR931 ist als57a64670
im Entwicklungszweig übernommen; sein Quellbaum ist gleich zum geprüften d2d1f7ad.
[Integrationsbeleg](belege/private-ci-channel-20261022/GITHUB_INTEGRATION.SAFE.json).
Die zusätzliche Views-Hashwiederverwendung hat26gezielte lokale Checks und eine
gesonderte Pro-High-Leseprüfung bestanden. Alle frischen Guards bleiben erhalten;
der gemeinsame neue Kopf benötigt seinen eigenen Zugangsbeleg und die vollständige Prüfung.
Kein500er Lauf, keine Unit60-Qualifikation und keine Production-Aktion daraus.
