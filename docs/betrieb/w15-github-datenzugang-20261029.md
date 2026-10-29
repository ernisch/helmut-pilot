# W15: GitHub-Datenzugang bleibt gesperrt

## Aktueller Soloauftrag

Der Betreiber entwickelt allein und verschiebt menschliche Required Reviewers
und Prevent self-review ausdrücklich auf später, falls nötig. Diese beiden
Kontrollen sind deshalb kein pauschales Starttor. Der lokale Helfer führt sie
getrennt unter `reviewerControls` mit `status=INFO_ONLY` und
`requiredForMetadataAcceptance=false`; sie verändern seine technische
Metadatenbewertung nicht. Die unabhängige technische Abnahme bleibt möglich,
ohne eine zweite menschliche GitHub-Reviewerrolle zu verlangen.

Die folgende datierte Nachbeobachtung und die früheren Prüfergebnisse bleiben
historisch erhalten. Hierfür wurde keine weitere API-Prüfung ausgeführt.

## Neue Beobachtung nach manueller Betreiberänderung

Nach dem Speichern am29.10.2026 erneut ausschließlich live lesend geprüft:
`can_admins_bypass=false`, Custom-Branchpolicies aktiv, genau eine Policy mit
Typ`branch` und dem aktuellen PR975-Branch. Keine Tags und keine weiteren
Branchmuster. Der aktuelle Branchkopf passt zu`b78ff845`.
`protection_rules` enthält aber ausschließlich`branch_policy`; eine
`required_reviewers`-Regel und `prevent_self_review=true` fehlten weiterhin.
Diese damals beanstandeten Governancefelder blockieren den aktuellen Soloauftrag
nicht. Der tatsächliche private Kanal bleibt weiterhin ungeprüft. Keine Secrets-Endpunkte oder
Konfigurationsänderungen durch den Agenten.
[Öffentlicher neuer Teilbefund](belege/w15-end500-transfer-20261029/GITHUB_PROTECTION_UPDATE.SAFE.json).

Der frühere Vorschlag, einen weiteren Nutzer oder ein Team als Required Reviewer
einzutragen, ist durch den Soloauftrag überholt. Der untenstehende frühere
Befund bleibt historisch erhalten.

Rein lesender Livebefund vom29.10.2026 für `ernisch/helmut-pilot`, bestehendes
Environment `helmut-ci-originals`, ID`25001443837`: `can_admins_bypass=true`,
`protection_rules=[]`, `deployment_branch_policy=null`. Der GET der
Deployment-Branchpolicies lieferte404. GitHub dokumentiert404 auch bei deaktivierten
Custom-Policies; daraus folgt kein Anlass für erneute Secrets-API-Aufrufe.
Keine Regeln geändert, keine privaten Daten übergeben, keine Secrets-Endpunkte
abgerufen. Der frühere Secrets403 bleibt unaufgelöst.

## Lesende Prüfung

```sh
python3 -B scripts/w15-github/github_data_access.py \
  --check-protection-metadata-only \
  --expected-branch codex/w15-github-end500-preparation-20261028 \
  --expected-commit GEPRUEFTER_40_STELLIGER_LOWERHEX_COMMIT
```

Der Helfer liest ausschließlich live per `gh api --hostname github.com
--method GET` drei feste Endpunkte: Environment, vollständige erste Seite der
Branchpolicies und `git/ref/heads/codex/w15-github-end500-preparation-20261028`.
Er akzeptiert keine fremden Repositories, Environmentnamen, Metadaten-Dateien,
Tokens, privaten Eingaben oder Freigabeparameter. Der CLI-Hostname`github.com`
bindet den API-Zielhost`api.github.com`; ein CLI-Hostname`api.github.com` würde
fälschlich`api.api.github.com` ansprechen. Der erwartete Commit muss
extern geprüft sein; der Helfer vergleicht ihn mit dem aktuellen GitHub-Branchkopf.
Normale Laufzeitvariablen und passende Namen ersetzen diese API-Prüfung nicht.

Erforderlich sind exakt die vorhandene Environment-ID, Adminbypass ausdrücklich
aus, `protected_branches=false` und `custom_branch_policies=true`. Genau eine
vollständig gelesene Policy muss mit Typ`branch` exakt den obigen Branch nennen.
Weitere Branches, Tags, Muster oder unvollständige/fehlende Felder sperren.
Fehlt der Policytyp in einer älteren API-Antwort, bleibt erUNKNOWN; ein Name
beweist keinen Branchtyp. Der Helfer schreibt keine API-Rohantworten oder Fehler
in seinen Bericht. HTTP-Fehler und unbekannte verpflichtende Metadaten bleibenBLOCKED.
Unbekannte optionale Reviewerfelder bleiben als InformationUNKNOWN und geben
keine zusätzliche Freigabe. Fehlende Reviewer heißenNOT_CONFIGURED, eine
beobachtete Selbstfreigabesperre heißtENABLED oderDISABLED.

Ein erfolgreiches Ergebnis heißt ausschließlich
`PASS_GITHUB_PROTECTION_METADATA_ONLY_START_BLOCKED`. Auch dann bleiben
`readiness=BLOCKED`, `executionAuthority=false`, `secretAccessVerified=false`,
`privateHandoffAuthorized=false` sowie Laufgenehmigung und Workflowbindung
ungeprüft. Die drei GETs bilden keine atomare Sperre gegen spätere Konfigurations-
oder Branchänderungen. Ein lokaler Check kontrolliert keine Repository-/Org-Secrets,
keine externe private Datenquelle und keinen tatsächlich wartenden Actions-Job.
Der öffentliche `end500-plan` braucht weiter keine privaten Eingänge, Secrets
oder Environmentbindung; der Helfer wird dort nicht eingebunden.

## Noch fehlender Nachweis vor einer echten privaten Übergabe

Der kleinste vorgesehene Weg verwendet das vorhandene GitHub-Environment für
eng begrenzte bestehende Empfänger-Zugangsdaten. Umfangreiche Originale bleiben
verschlüsselte Dateien. Ein tatsächlicher privater Job muss das Environment
referenzieren und vor privater Nutzung manuell an geprüften Commit, Branch,
Workflow, Lauf und Versuch1 gebunden sein. Der benötigte Secret-/Datenumfang und
die tatsächliche technische Integration sind unabhängig abzunehmen. Der
vorhandene öffentliche Plan-/Parentpfad bleibt secretfrei.

GitHub Environment-Secrets sind verschlüsselt gespeichert und werden in direkten
Logausgaben maskiert. Das schützt keine daraus erzeugten Klartextdateien,
transformierten Ausgaben oder öffentlichen Artefakte. Private lokale Eingänge
brauchen weiterhin ihre Besitzer-/Modus-/Hashbindung; Workflowinputs,
Repositoryvariablen und Logs sind kein privater Kanal. Eine öffentliche Canary
kann höchstens ihren tatsächlichen Job-/Environment-Scope nachweisen, keine
Existenz oder Lesbarkeit echter Secrets. Hier werden keine echten Zugangsdaten
angefordert. Cloudlokale Secret-Dateibereitstellung bleibt unbewiesen.

Der Helfer ändert keine Environmentregeln und liest keine Secrets-Endpunkte.
Ein Metadaten-PASS ersetzt weder diese tatsächlichen privaten Bindungen noch
eine gesonderte End500-/Mock500-Startfreigabe. Falls menschliche Reviewer später
aktiviert werden, verlangt GitHub eine Zustimmung aus bis zu sechs benannten
Reviewern; bei aktiver Selbstfreigabesperre darf der Jobinitiator nicht zustimmen.
Diese optionale Governance ist hier getrennt vom technischen Schutzbericht.

API-Semantik: [Environments](https://docs.github.com/en/rest/deployments/environments),
[Deployment branch policies](https://docs.github.com/en/rest/deployments/branch-policies).

Gezielte neue Prüfung: sieben netzlose Testgruppen erfolgreich. Echter Aufruf
des Helfers am29.10.2026 um08:33:42UTC gegen Kopf
`51f0328746f5a47bd5f4116157446c0b85f04d2e`: Environmentidentität und
GitHub-BranchkopfPASS; Adminbypass, Reviewer, Selbstfreigabesperre und Custom-
BranchmodusFAIL; exakte Policy wegen404UNKNOWN. GesamtergebnisBLOCKED,
Exitcode1. Kein End500-, Secretzugangs- oder Kanalschutznachweis.

Nach der Soloanpassung ausschließlich vier neue/geänderte netzlose Prüfgruppen
bestanden: informative Reviewerwerte, unveränderte Sperre aller fünf technischen
Pflichtfelder und weiterhin keine private Übergabe-/Startfreigabe bei einem
Metadaten-PASS. Keine historische Testvollwiederholung und kein neuer API-Aufruf.
