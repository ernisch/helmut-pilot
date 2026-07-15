# Branch Protection für `main` — exakte Einrichtung (Freigabepunkt F11)

Das CI-Gate (`.github/workflows/ci.yml`) läuft bei jedem PR und jedem Push auf
`main`, **blockiert aber erst mit Branch Protection**. Diese Anleitung ist die
vollständige Klick-Referenz; die Aktivierung selbst ist eine externe
GitHub-Einstellung (2 Minuten, jederzeit reversibel).

## Exakte Check-Namen (müssen zeichengenau ausgewählt werden)

| Check | Quelle | Prüft |
| --- | --- | --- |
| `Syntax + Offline-Suiten` | ci.yml Job `offline-suite` | `node --check` aller JS-Dateien + komplette Offline-Suite (`run-offline-tests.js`, sammelt automatisch alle `scripts/*-test.js` ein) |
| `Browser-/Mobile-Smoke (Chromium)` | ci.yml Job `browser-smoke` | Echter Chromium-Smoke Desktop + mobiler Viewport gegen In-Process-Server (Playwright 1.56.1 gepinnt) |

Der Check „Vercel Preview Comments" gehört Vercel, ist **nicht** Teil des Gates
und darf NICHT als Pflicht-Check gesetzt werden (er wäre bei deaktivierten
Preview-Kommentaren dauerhaft ausstehend).

## Einrichtung

GitHub → Repo `ernisch/helmut-pilot` → **Settings → Branches → Add branch
protection rule**:

1. Branch name pattern: `main`
2. ☑ **Require a pull request before merging** (direkte Pushes auf `main` sind
   damit verboten; Merge nur über PR). „Required approvals": 0 ist beim
   Ein-Personen-Betrieb ehrlich — das Gate sind die Status-Checks; bei
   Teamwachstum auf 1 erhöhen.
3. ☑ **Require status checks to pass before merging**
   - ☑ „Require branches to be up to date before merging"
   - Checks auswählen: `Syntax + Offline-Suiten` und
     `Browser-/Mobile-Smoke (Chromium)` (erscheinen in der Suchliste erst,
     nachdem sie mindestens einmal gelaufen sind — sind sie bereits, z. B. auf
     PR 82/83).
4. ☑ **Do not allow bypassing the above settings** („Include administrators").
   Begründung: Der einzige Admin ist zugleich der einzige Entwickler — genau
   dann schützt die Regel vor dem eigenen Versehen. Der Not-Bypass bleibt
   trotzdem möglich (siehe Hotfix-Weg), er ist nur ein bewusster Extra-Schritt.

## Dringende Hotfixes

Auch ein Hotfix geht durch den normalen Weg (Branch → PR → Checks grün →
Merge) — die komplette Suite läuft in ~2 Minuten, das ist kein echter
Zeitverlust. Wenn GitHub Actions selbst ausgefallen ist (der einzige legitime
Bypass-Fall): Settings → Branches → Regel temporär bearbeiten („Include
administrators" abwählen) → Merge → Einstellung SOFORT wiederherstellen →
Vorfall im Betriebs-Log notieren.

## Rückweg

Settings → Branches → Regel bearbeiten/löschen. Keine Auswirkung auf bestehende
Branches oder Deployments; Vercel deployt unverändert bei Push auf `main`.

## Wechselwirkung mit gestapelten PRs (aktuelle Situation)

PR 83 hat PR 82s Branch als Base, ein Folge-PR wiederum PR 83s Branch. Branch
Protection gilt nur für `main` — die Stapel-PRs mergen nacheinander: Merge
PR 82 → GitHub rebased PR 83 automatisch auf `main` → Checks laufen erneut →
Merge PR 83 → dito für den Folge-PR. Nie „Merge" auf einem Stapel-PR drücken,
solange sein Base-Branch nicht gemergt ist (sonst landet der Merge im
Base-Branch statt in `main`).
