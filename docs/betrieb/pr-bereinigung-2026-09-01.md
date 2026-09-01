# Bereinigung der offenen Pull Requests vom 01.09.2026

## Anlass und Grenze

Zum Prüfzeitpunkt waren die PRs #275, #276, #277 und #282 gegen `main`
`51d7bfdd` offen. Prüfung und Vorbereitung erfolgten getrennt vom natürlichen
Production-Lauf. Erst nach ausdrücklicher Betreiberfreigabe wurden die alten PRs
geschlossen und der geprüfte Ersatzstand gemergt. Modellaufruf, Lasttest, Cron-,
Env-, Secret-, Budget-, Migrations- oder Production-Datenzugriff gehörten nicht
zu dieser Bereinigung.

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

Mit Betreiberfreigabe wurde der Ersatzstand als PR #292 mit unverändertem Kopf
`65701fd59818d40edc01df86d05ee7ceec10979e` gemergt. Der Merge-Commit ist
`9d6d18e54cf507e64143d031ba865cbfc9c34cd3`. Die alten PRs #275–#277 und #282
wurden geschlossen, nicht gemergt; ihre Branches bleiben erhalten.

## Abschlussnachweis

* Pflichtlauf `33485020305`: beide Jobs grün; darin Syntax, Offline-Suiten,
  Browser-/Mobile-Smoke sowie echter PostgreSQL-/PostgREST-Nachweis §1–§11.
* Git-Baum des geprüften Ersatzstands: `5e1f4351cb488638ca8c5d45f4a14ddad850e20c`.
* GitHub-Vercel-Status des exakten Merge-Commits: `success`.
* Nach dem fachlichen Merge: keine offenen Pull Requests.
* Keine Migration, Production-Daten-, Mandats-, Cron-, Env-, Secret-, Flag- oder
  Budgetänderung; keine Aktivierung und kein kostenverursachender Lauf.

## Beweisgrenze

Die Bereinigung ändert keines der drei 500er-Urteile:

* Warteschlangen-Aufnahmefähigkeit: synthetisch erbracht, nicht wiederholt.
* Rechnerisch-architektonische Tragfähigkeit: vorbereitet, finale
  Dimensionierung offen.
* Operativer Mehrtagesbetrieb mit 500 realen Mandaten: nicht bewiesen.
