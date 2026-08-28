# Aufbewahrung & Löschung — Datenklassen-Matrix & Retention-Konzept

> **Status: TECHNISCHE EMPFEHLUNG, NICHT AKTIV.** Kein automatisches Löschen läuft.
> Die konkreten Fristen sind eine **Gründer- und Rechtsfreigabe** (Frist = juristische
> Entscheidung, hier nur die technische Grundlage). Bezug: Audit R11 (raw_documents
> und knowledge_objects wachsen heute unbegrenzt).

| | |
|---|---|
| **Bezug** | Audit R11 / P3-1 · DSGVO Art. 5 (1) e (Speicherbegrenzung), Art. 17 (Löschung) |
| **Werkzeug** | `scripts/retention-dryrun.js` (Trockenlauf-Default), `lib/helmut/retention.js` (reiner Planer) |
| **Tests** | `scripts/retention-test.js` (Trockenlauf, Idempotenz, referenzielle Integrität) |
| **Freigabe** | Fristen + künftiger atomarer Executor = Gründer + Rechtsfreigabe; das Flag allein schaltet keine Löschung frei |

## 1. Datenklassen-Matrix

| Datenklasse | Tabelle/Feld | Art. 9 DSGVO? | Empf. Aufbewahrung | Löschmechanik |
|---|---|---|---|---|
| Quellen-Inhalt (minimiert) | `raw_documents` (title/summary ≤240, kein Volltext) | nein (kann Personen in Schlagzeilen nennen) | **180 Tage** | Purge, wenn NICHT an behaltenes KO gebunden |
| Politische Analyse | `knowledge_objects` (Ebene/Partei/Bewertung) | **JA — besonders schutzbedürftig** | **365 Tage** | Purge + Kaskade (Links/Findings/Relations) |
| Provenienz | `ko_document_links`, `document_findings` | nein (Ableitung) | folgt Parent | Kaskade mit Parent (ON DELETE CASCADE) |
| Quellen-Telemetrie | `source_crawl_telemetry` | nein (technisch) | **90 Tage** | Purge nach Alter |
| Gate-Telemetrie | `gate_shadow_events` | nein (technisch) | **90 Tage** | Purge nach Alter |
| Crawl-Läufe | `crawl_runs` (Stufe 2) / Blob `crawlRuns` | nein (technisch) | **180 Tage** | Ring-gedeckelt / Purge |
| Fehler-Metadaten | Auth-Blob `systemErrors` | nein (nur Metadaten) | **90 Tage** | Ring-gedeckelt (≤500) |
| Prozess-Laufzeit | Auth-Blob `processRuns` / `process_runs` (W-2, Migration `20260727`, freigabepflichtig) | nein (technisch) | **90 Tage** | Ring-gedeckelt (≤300) / Purge nach Alter |
| Kosten/Audit | Auth-Blob `llmUsage` | nein | **365 Tage** | Ring-gedeckelt (≤5000) |
| Nutzer-Ausgabe | `briefings` (payload) | **JA (politisches Profil)** | **90 Tage** | nutzergebunden löschbar (`deleteProfileDataV3`) |

Die Matrix ist maschinenlesbar in `lib/helmut/retention.js` (`DATA_CLASSES`) und wird
vom Planer + Test benutzt.

## 2. Begründete technische Empfehlung

- **raw_documents 180 Tage:** minimierte Quelldaten; ihr Nutzen sinkt nach ~6 Monaten
  stark (Aktualität), die Analyse (KOs) bleibt separat erhalten. Kürzer als KOs, damit
  der größte Wachstumstreiber zuerst begrenzt wird.
- **knowledge_objects 365 Tage:** die politische Analyse ist Art. 9 — konservativ, aber
  ein Jahr erlaubt Legislatur-Kontext (Vorgänge ziehen sich). **Frist = Rechtsfreigabe.**
- **Technische Telemetrie 90 Tage:** Betriebsdiagnose braucht kein Langzeitarchiv; 90
  Tage decken Quartals-Analysen ab.
- **Provenienz folgt Parent:** niemals eigenständig löschen — sonst verwaist die
  Nachvollziehbarkeit „warum stand das im Briefing".

## 3. Sicherer Trockenlauf (Archivierung & Löschung)

`node scripts/retention-dryrun.js` → plant die Löschung und meldet die betroffenen
Datensätze, **schreibt nichts**. Auch `--execute` zusammen mit
`HELMUT_RETENTION_EXECUTE=on` und `v3StoreReady` bleibt konstruktiv gesperrt und
erzeugt keinen DELETE. Grund: Der vollständig paginierte REST-Abzug ist kein
transaktionaler Snapshot; Seiten können sich verschieben und zwischen Plan und
Mutation kann eine neue Referenz entstehen. Eine echte Ausführung braucht einen
DB-seitig atomaren, sperrenden Vertrag oder einen belegten Schreibstopp mit
atomarer Referenzprüfung unmittelbar beim Löschen.

**Referenzielle Integrität (kritisch):** `ko_document_links` referenziert
`raw_documents` mit `ON DELETE CASCADE`. Der Planer löscht deshalb ein raw_document
**nur**, wenn es überaltert ist UND an **kein behaltenes** knowledge_object gebunden
ist — sonst würde die Provenienz eines behaltenen KOs still verwaisen. Das Werkzeug
bricht ab, wenn die Integritätsprüfung fehlschlägt.

## 4. Bericht über betroffene Datensätze

Der Trockenlauf liefert `report`: `{ rawDocumentsTotal, knowledgeObjectsTotal,
rawToDelete, koToDelete, rawBlockedByKeepReference }` + `integrityOk`. So ist vor
jeder Freigabe sichtbar, wie viele Zeilen betroffen wären und wie viele aus
Integritätsgründen bewusst geschont werden.

## 5. Tests

`scripts/retention-test.js` belegt offline (synthetische Daten):
- **Trockenlauf** ändert nichts, meldet betroffene Datensätze.
- **Referenzielle Integrität**: ein an ein behaltenes KO gebundenes raw_document wird
  NIE gelöscht (als blockiert gemeldet).
- **Idempotenz**: nach simulierter Löschung liefert ein zweiter Lauf 0.
- **Datenklassen-Matrix**: politische Analyse als Art. 9 markiert.

## 6. Offene Freigaben (Gründer + Recht)

1. Konkrete Aufbewahrungsfristen je Datenklasse bestätigen (juristische Entscheidung).
2. Atomaren DB-Executor oder belegten Schreibstopp mit atomarer Referenzprüfung
   bauen und prüfen; erst danach über eine echte Ausführungsfreigabe entscheiden.
3. Verhältnis zum bestehenden Löschkonzept `docs/recht/toms-loeschkonzept-vvt-entwurf.md`
   klären (dieses Dokument liefert die technische Mechanik, jenes den VVT/das TOM-Konzept).
