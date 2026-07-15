# Deploy-Rollback — Runbook (Stand 2026-07-15)

Kurzes Runbook für den Fall „das aktuelle Production-Deployment ist kaputt und
muss sofort weg". Für den Git-Aufräumweg (Revert-PR) siehe
`docs/betrieb/branch-protection.md`, Abschnitt „Rollback nach fehlerhaftem Merge".

## 1. Vercel Instant Rollback (Klickweg, Minuten)

1. vercel.com → Projekt `helmut-pilot` → Tab **Deployments**.
2. Das letzte GRÜNE Production-Deployment identifizieren (Spalte Environment =
   Production, Status Ready, Commit/Zeitpunkt prüfen).
3. Menü (⋯) dieses Deployments → **Instant Rollback** (je nach UI-Stand auch
   „Promote to Production"). Bestätigen.
4. Die Production-Domain zeigt sofort wieder auf das alte Deployment — kein
   Build, kein Git-Eingriff.

Wichtig: `main` bleibt danach auf dem fehlerhaften Stand. Der nächste Push auf
`main` deployt den Fehler erneut — deshalb zeitnah den Revert-PR nachziehen.

## 2. Warum die Asset-Versionen dabei konsistent bleiben

Jedes Git-Integration-Deployment bekommt sein eigenes, eingebackenes
`VERCEL_GIT_COMMIT_SHA`; daraus leitet `server.js` die `ASSET_VERSION` ab, mit
der die Shell `client.js?v=…` und `styles.css?v=…` referenziert. Ein Instant
Rollback stellt das ALTE Deployment inklusive seiner alten Version wieder her:

- Browser, die die alten `?v=`-URLs noch immutable gecacht haben, bekommen
  byteidentische Assets zum alten Server-Code — keine Mixed-Version-Zustände.
- Browser ohne Cache laden die alten Assets frisch unter der alten URL.

Einzige bekannte Ausnahme: Einträge, die im kurzen Race-Fenster eines
Deploy-Wechsels gecacht wurden, können einmalig gemischt sein — heilt sich mit
dem nächsten Laden selbst.

## 3. Verifikation nach dem Rollback

HTML-Quelltext der Startseite prüfen — die `?v=`-Version muss zum
wiederhergestellten Deployment (dessen Commit-SHA, erste 8 Zeichen) passen:

```
curl -s https://helmut-pilot.vercel.app/ | grep -o 'client.js?v=[^"]*'
curl -s https://helmut-pilot.vercel.app/ | grep -o 'styles.css?v=[^"]*'
```

Danach ein kurzer Funktions-Smoke (Login, Helmut-Tab lädt).

## 4. Sonderfall CLI-Deploy

Auf dem CLI-Weg setzt Vercel `VERCEL_GIT_COMMIT_SHA` NICHT. Die Versionierung
kommt dann aus `HELMUT_ASSET_VERSION`, die `scripts/vercel-deploy.sh` pro Lauf
frisch aus Git-SHA + Zeitstempel erzeugt und per `-e` mitgibt.

**WARNUNG:** Ein direktes `vercel --prod` am Skript vorbei setzt weder
`VERCEL_GIT_COMMIT_SHA` noch `HELMUT_ASSET_VERSION` — `server.js` fällt auf die
eingebaute Konstante zurück, die Asset-URLs bleiben über Deploys konstant, und
Bestandsbrowser behalten wegen des 1-Jahres-immutable-Cachings alte
`client.js`/`styles.css` zu neuem Server-Code (genau die Stale-Asset-Falle, die
die Versionierung fixt). **CLI-Deploys IMMER über `scripts/vercel-deploy.sh`.**
Gleiches Risiko bei einem Dashboard-„Redeploy" eines CLI-Deployments, falls die
per `-e` mitgegebene Runtime-Env dort nicht übernommen wird — nach jedem
Redeploy die `?v=`-Verifikation aus Abschnitt 3 durchführen.

## 5. Bekannte, akzeptierte Ausnahme: unversionierte /assets-Referenzen

`assets/favicon.ico`, `assets/helmut_logo.svg` und die Inter-Font-Dateien
werden OHNE `?v=` referenziert, liegen aber unter der 1-Jahr-immutable-Route
`/assets/(.*)`. Das ist bewusst akzeptiert, solange diese Dateien byte-stabil
bleiben. Konsequenz für Rollbacks: keine — die Dateien sind über die
betroffenen Deployments identisch. Erst wenn eine dieser Dateien inhaltlich
geändert wird, muss sie umbenannt oder mit `?v=` versioniert werden (inklusive
der `url()`-Referenzen in `styles.css`), sonst sehen Bestandsbrowser bis zu ein
Jahr die alte Fassung.
