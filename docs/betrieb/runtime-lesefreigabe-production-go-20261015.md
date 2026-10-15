# Begrenztes Production-GO: zwei private Runtime-Lesewege

Vorbereitet am 15.10.2026; **noch keine Merge-/Rollout-Freigabe**.
Gegenstand ist ausschließlich PR [#911](https://github.com/ernisch/helmut-pilot/pull/911).
Der konkrete geprüfte PR-Kopf und seine Pflichtchecks werden vor dem GO in der
PR-Beschreibung und im Abschlussbericht angegeben.

## Änderung und Bindung

Die vorhandene Vorbereitung ergänzt eine neue feste EU-Lese-Authority in
`provider-runtime-attestation.js`. Sie wird auch vom vorhandenen
`synthetik-500-financing-witness.js` verwendet. Beide nötigen GET-Modi auf
`https://helmut-pilot.vercel.app/api/cron/testnachweis-status` sind:

- `?modus=provider-konfiguration`
- `?modus=synthetik500-finanzbindung`

Die neue Freigabe endet auf ausdrücklichen Betreiberwunsch nach einem Monat,
am **15.11.2026 um 18:00 UTC / 21:00 Europe/Istanbul**.
Die feste Nonce lautet `71a85d95-c883-458c-a945-e332d6a81e68`.
Der dazugehörige vorhandene private Bearer bleibt außerhalb von Git und Ausgaben.
Historische Authorities werden nicht wieder geöffnet. Nur der exakt gebundene
EU-Servicevertrag wählt die neue Freigabe; andere Verträge behalten ihre Sperren.
Das Anfragefenster bleibt exakt 20 Minuten, innerhalb der absoluten Freigabe.
Bei späteren Abrufen kann es frisch gesetzt werden, ohne Codeänderung oder
erneute Verlängerung. Die längere Lesefreigabe verlängert weder den bestehenden
Finanzauftrag (bis 25.10.) noch einen Lauf oder eine Testfreigabe.
Keine Secretänderung oder neue globale Autorisierung ist Teil dieses PRs.

Am 15.10.2026 zu Beginn dieser Prüfung über die Vercel-Control-API gelesen:

| Bindung | Aktueller Production-Stand vor dem Rollout |
|---|---|
| Projekt | `prj_xbZ6QzTkr7YoxQI71lW59FT03IR3` / `helmut-pilot` |
| Alias | `helmut-pilot.vercel.app` |
| Unveränderlicher Host | `helmut-pilot-f1itf2vt1-nohut.vercel.app` |
| Deployment | `dpl_Byjq8BXBjsZrcVtyrWxkxwDfL5Ab` |
| Commit / main | `f7a77f56c4e4671eddc34fd8bf98036fa9b52969` |
| Umgebung / Zustand | `production` / `READY` |

Das nächste Deployment erhält einen neuen Host und eine neue ID. Die obige
Identität ist der Vergleichs- und Rückwegstand, **kein Zielheader für den neuen
Rollout**. Ein GET der Vercel-Control-API muss nach dem Rollout den Alias erneut
auflösen und Projekt, READY/production, Commit, Deployment-ID und Host bestätigen.
Der Commit muss dem freigegebenen Merge-Commit mit dem geprüften PR-Inhalt entsprechen.
Bei Abweichung oder zwischenzeitlich geändertem main wird vor Wirkung neu geprüft.

Die Cloud meldet `HELMUT_RUNTIME_READ_BEARER` und
`VERCEL_AUTOMATION_BYPASS_SECRET` als ready und für den Alias gebunden. Lokal
steht ein Proxy-Platzhalter; daraus darf kein neuer Bearer-Hash erzeugt werden.
Die Übereinstimmung des tatsächlich eingesetzten Secrets mit dem vorhandenen
Verifier ist erst durch den echten privaten GET nach dem Rollout belegt.

## Gezielte Prüfung

`node scripts/provider-runtime-auth-rebind-test.js` prüft zusätzlich zum
vorhandenen Legacy-Nachweis beide echten EU-Handler mit der tatsächlich gewählten
neuen Authority. Ausschließlich deren Hash wird in einer isolierten VM durch
einen synthetischen ersetzt; `operationAuthority` und `verifyOperationBearer`
werden nicht überschrieben. Ein synthetisches vollständiges Finanzbuch und echte
reine Budget-/Hashfunktionen belegen den Finanz-Leseweg ohne mutierende Methode.

Beide Wege akzeptieren die gebundene Anfrage. Je zehn negative Fälle schließen
vor Konfigurations-/Finanzlesern: POST, falscher Bearer, alte Nonce, Preview,
falscher Commit, anderer unveränderlicher Deploymenthost, abweichendes Fenster,
Zeit vor Beginn, exakt am Fensterende und absoluter Ablauf bei sonst gültigem
Fenster. Der synthetische Zustand bleibt unverändert; keine echten Secrets,
Netz-, Modell- oder Production-Aufrufe. Bestehende Provider- und Finanztests
bleiben zusätzlich erforderlich. Die neue Prüfung läuft über die bereits
verpflichtende Rebind-Suite im Standard-CI; kein neues CI-Gate nötig.
Ein weiterer positiver Konfigurationsabruf mit frischem Fenster am letzten
Freigabetag belegt die Wiederverwendung ohne Codeänderung. Er verlängert keine
Lauf-/Finanzverträge.

## Konkreter Freigabetext

> GO ausschließlich für den geprüften, im Abschlussbericht genannten Kopf von
> PR #911: nach grünen Pflichtchecks und frischer unveränderter Production-/main-
> Vorprüfung mergen und den daraus entstandenen Merge-Commit regulär auf das
> Vercel-Projekt helmut-pilot in Production ausrollen. Danach genau die beiden
> privaten GET-Lesewege mit bestehenden Secrets und frischer Deployment-/Nonce-/
> Zeitbindung verifizieren. Keine Migration, Secret-/Environmentänderung,
> Profilaktivierung, Commandinstallation, Journalmutation oder bezahlter
> Modell-/500er-Test ist dadurch freigegeben. Beginn nur mit mindestens
> 20 Minuten Restzeit bis 18:00 UTC am 15.11.2026.

Dieser Text ist eine Vorlage; die Ausführung benötigt das ausdrückliche GO des
Betreibers. Bei Ablauf keine automatische Verlängerung oder Wiederholung.

## Nachkontrolle und Rückweg

Nach READY den aktuellen Alias einmal über die Control-API auflösen. Beide
Anfragen gehen ausschließlich an `https://helmut-pilot.vercel.app`, ohne
Redirect-Follow, ohne Query-Secrets und ohne Body. Header:

- `Authorization: Bearer` mit dem vorhandenen `HELMUT_RUNTIME_READ_BEARER`
- `x-vercel-protection-bypass` mit `VERCEL_AUTOMATION_BYPASS_SECRET`
- `x-helmut-root-nonce` mit der oben gebundenen Nonce
- `x-helmut-root-admitted-at` mit frischem UTC-Beginn, Millisekunden und `Z`
- `x-helmut-root-deadline-at` exakt 20 Minuten später, spätestens 15.11.2026 18:00 UTC
- `x-helmut-production-commit` mit dem neuen bestätigten Production-Commit
- `x-helmut-deployment-host` mit dem neuen unveränderlichen Host aus der Control-API

Zuerst Providerkonfiguration lesen: HTTP 200, `ok`, `reinLesend`, `production`,
Commit, Host, Deployment-ID, Nonce und Fenster müssen zur frischen Control-
Identität passen. Danach mit derselben Bindung Finanzstatus lesen und HTTP 200,
`ok`, `reinLesend`, Commit, Host, Nonce und Fenster prüfen. Nur Status und geprüfte
Bindungen melden; keine Secretwerte oder vollständigen Antwortkörper ausgeben.
Bei einem Fehler stoppen, ohne Retry oder Reparatur von Finanzbüchern/Secrets.
Bei HTTP 409 aus dem Finanzhandler ist die Finanzprüfung weiter offen; das darf
nicht als erfolgreicher Lesezugriff oder als Testbereitschaft gemeldet werden.

Ein späterer Rückrollout erfordert eine entsprechende Freigabe. Der vorherige
READY-Stand ist oben konkret bezeichnet. Der PR migriert und verändert keine
Production-Daten; sein Rückweg entfernt allein die neue Code-Freigabe. Bei
zwischenzeitlicher Production-Drift zuerst stoppen und lesend klären.

Diese Lesefreigabe beseitigt ausschließlich den Zugangsblocker. Sie ist kein
Nachweis für die technische oder fachliche Bereitschaft des gesamten 500er-Tests.
