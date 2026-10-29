# W15: GitHub-Datenzugang bleibt gesperrt

## Neue Beobachtung nach manueller Betreiberänderung

Nach dem Speichern am29.10.2026 erneut ausschließlich live lesend geprüft:
`can_admins_bypass=false`, Custom-Branchpolicies aktiv, genau eine Policy mit
Typ`branch` und dem aktuellen PR975-Branch. Keine Tags und keine weiteren
Branchmuster. Der aktuelle Branchkopf passt zu`b78ff845`.
`protection_rules` enthält aber ausschließlich`branch_policy`; eine
`required_reviewers`-Regel und `prevent_self_review=true` fehlen weiterhin.
Der Datenzugangsblocker bleibt deshalb offen. Keine Secrets-Endpunkte oder
Konfigurationsänderungen durch den Agenten.
[Öffentlicher neuer Teilbefund](belege/w15-end500-transfer-20261029/GITHUB_PROTECTION_UPDATE.SAFE.json).

Noch nötiger Klickweg: GitHub → Repository → Settings → Environments →
`helmut-ci-originals` → Required reviewers → anderen berechtigten Nutzer oder
Team auswählen → Prevent self-review aktivieren → Save protection rules.
Der untenstehende frühere Befund bleibt historisch erhalten.

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
aus, eine nicht leere Required-Reviewers-Regel, `prevent_self_review=true`,
`protected_branches=false` und `custom_branch_policies=true`. Genau eine
vollständig gelesene Policy muss mit Typ`branch` exakt den obigen Branch nennen.
Weitere Branches, Tags, Muster oder unvollständige/fehlende Felder sperren.
Fehlt der Policytyp in einer älteren API-Antwort, bleibt erUNKNOWN; ein Name
beweist keinen Branchtyp. Der Helfer schreibt keine API-Rohantworten oder Fehler
in seinen Bericht. HTTP-Fehler und unbekannte Metadaten bleibenBLOCKED.

Ein erfolgreiches Ergebnis heißt ausschließlich
`PASS_GITHUB_PROTECTION_METADATA_ONLY_START_BLOCKED`. Auch dann bleiben
`readiness=BLOCKED`, `executionAuthority=false`, `secretAccessVerified=false`,
`privateHandoffAuthorized=false` sowie Laufgenehmigung und Workflowbindung
ungeprüft. Die drei GETs bilden keine atomare Sperre gegen spätere Konfigurations-
oder Branchänderungen. Ein lokaler Check kontrolliert keine Repository-/Org-Secrets,
keine externe private Datenquelle und keinen tatsächlich wartenden Actions-Job.
Der öffentliche `end500-plan` braucht weiter keine privaten Eingänge, Secrets
oder Environmentbindung; der Helfer wird dort nicht eingebunden.

## Konkrete manuelle Grenze vor einem GitHub-Datenkanal

Ein berechtigter Administrator müsste am vorhandenen Environment die erforderlichen
Reviewer aus tatsächlich verfügbaren Personen/Teams festlegen, Selbstfreigabe
verhindern, Adminbypass ausschalten und ausschließlich den obigen Branch als
typisierte Branchpolicy zulassen. Keine weiteren Branch-/Tagmuster beibehalten.
GitHub verlangt nur **eine** Zustimmung aus bis zu sechs benannten Reviewern,
kein Quorum. Benannte Reviewer brauchen mindestens Lesezugriff. Der Jobinitiator
darf bei aktiver Selbstfreigabesperre nicht selbst zustimmen. Gibt es keinen
anderen zulässigen Reviewer, bleibt das eine reale personelle Grenze; keinen
Reviewer erfinden und keine Sperre zur Umgehung abschalten.

Diese Adminänderungen wurden hier nicht ausgeführt. Danach den lesenden Helfer
am neu geprüften Commit ausführen. Vor einer echten Übergabe bleiben zusätzlich
der konkrete private Datenumfang, dessen geschützter Environment-Scope, der
tatsächlich gebundene Job/Lauf/Versuch und seine reale unabhängige Zustimmung zu
prüfen. Öffentliche Workflowinputs, Repositoryvariablen oder Logs sind kein
privater Kanal. Ein PASS dieser Metadatenprüfung ersetzt keine dieser Bindungen
und keine gesonderte End500-/Mock500-Startfreigabe.

API-Semantik: [Environments](https://docs.github.com/en/rest/deployments/environments),
[Deployment branch policies](https://docs.github.com/en/rest/deployments/branch-policies).

Gezielte neue Prüfung: sieben netzlose Testgruppen erfolgreich. Echter Aufruf
des Helfers am29.10.2026 um08:33:42UTC gegen Kopf
`51f0328746f5a47bd5f4116157446c0b85f04d2e`: Environmentidentität und
GitHub-BranchkopfPASS; Adminbypass, Reviewer, Selbstfreigabesperre und Custom-
BranchmodusFAIL; exakte Policy wegen404UNKNOWN. GesamtergebnisBLOCKED,
Exitcode1. Kein End500-, Secretzugangs- oder Kanalschutznachweis.
