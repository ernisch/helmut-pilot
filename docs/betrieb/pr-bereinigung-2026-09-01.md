# Bereinigung der offenen Pull Requests vom 01.09.2026

## Anlass und Grenze

Geprüft wurden die offenen PRs #275, #276, #277 und #282 gegen `main`
`51d7bfdd`. Die Prüfung und Vorbereitung erfolgten getrennt vom natürlichen
Production-Lauf. Kein Merge, Deployment, Modellaufruf, Lasttest, Cron-, Env-,
Secret-, Budget-, Migrations- oder Production-Datenzugriff gehörte zu dieser
Bereinigung.

## Befund und Entscheidung

| PR | Befund gegen aktuellen `main` | Entscheidung |
|---|---|---|
| #275, Kopf `0c1ddc1` | weiterhin nötiger Fix: `Promise.race` beendete die schreibende Planung nicht; Konflikte in Status und Vercel-Sperre | Produktfix und Regressionstest auf aktuellen `main` übertragen; alten Stapel-PR schließen |
| #276, Kopf `372a618` | weiterhin nötige Messfixes: gedeckelte Queuegründe waren keine Gesamtverteilung; Blobspiegel-Überlauf blieb unsichtbar; Konflikte in Status und Vercel-Sperre | beide Fixes und Tests übertragen; alten Stapel-PR schließen |
| #277, Kopf `a705c18` | rund 14.000 geänderte Zeilen aus alter Zielarchitektur; vermischt Messläufer, Provider, Crawler, Backup, Restore und Retention; widerspricht dem später gewählten Minimal-Cron-Weg | nicht mergen; nur die weiterhin zitierten historischen Z3b-Pläne übernehmen; PR schließen, Branch als Auditbeleg behalten |
| #282, Kopf `c55d2f8` | CI-§11, Grüntage-Werkzeug und zwei Datenbanktestfixes bleiben sinnvoll; damaliger Status und Übergangsplan sind historisch; Konflikt in `CURRENT_STATE.md` | aktuelle Werkzeuge und datierten Beleg übertragen; alten PR schließen |

Kein Quellbranch wird gelöscht. Die geschlossenen PRs und ihre Köpfe bleiben
damit als Audit- und Rückvergleichsbelege verfügbar.

## Ersatzstand

Branch `codex/pr-cleanup-consolidation-20260901`, direkt auf aktuellem `main`:

1. Planungszeitgrenze ohne unbeobachteten Hintergrundschreiber.
2. Ehrliche Stichprobengrenze der Queuegründe und sichtbarer
   Blobspiegel-Überlauf.
3. PostgREST-§11 im bestehenden Pflicht-CI-Job, Grüntage-Werkzeug und
   Datenbanktestfixes.
4. Historische Z3b- und Zehn-Mandate-Belege mit aktuellem Übernahmehinweis.
5. Branchgenaue Vercel-Deploymentsperre; die 13 Cron-Einträge bleiben
   unverändert.

Der Ersatzstand wird nicht automatisch gemergt. Ein späterer Merge bleibt eine
ausdrückliche Betreiberentscheidung und löst ein Production-Deployment aus.

## Beweisgrenze

Die Bereinigung ändert keines der drei 500er-Urteile:

* Warteschlangen-Aufnahmefähigkeit: synthetisch erbracht, nicht wiederholt.
* Rechnerisch-architektonische Tragfähigkeit: vorbereitet, finale
  Dimensionierung offen.
* Operativer Mehrtagesbetrieb mit 500 realen Mandaten: nicht bewiesen.

