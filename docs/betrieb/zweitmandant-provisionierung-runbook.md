# Runbook — Zweitmandanten-Provisionierung (Sprint 1)

**Werkzeug:** `lib/helmut/provisioning.js` + CLI `scripts/provision-tenant.js`
(`npm run provision:tenant`). **Test:** `npm run test:provision-tenant` (30 Checks).
Admin-Prozess, **kein** Self-Service, **kein** Referentenzugang.

## Was der Prozess anlegt/zuordnet (idempotent)
1. **Auth-Nutzer** (Rolle `abgeordneter`, gebunden an die `politicianId` = Profil-id).
2. **Mandatsprofil** (`store.profiles[id]` + `mandateProfiles[id]`).
3. **Partei/Fraktion**, **politische Ebene** (Bundestag/Landtag), **Geografie**
   (Bundesland/Wahlkreis), **Ausschüsse/Themen** — als Profilfelder.
4. **Quellenpakete** — deterministisch aus dem Profil abgeleitet
   (`resolveProfilePackages`): immer `bund-basis`, plus Fachpakete
   (z. B. `arbeit-und-soziales`, `die-linke-bund`) automatisch.
5. **Budgetkonfiguration** — EUR-Deckel (`aiBudgetDailyCents`/`…Monthly`) im Profil.
6. **Grundeinstellungen** + **Matching-/Briefing-Bereitschaft** (validiert, im
   Ergebnisprotokoll ausgewiesen).

## Garantien
- **Wiederholbar ohne Dubletten** (Nutzer per E-Mail, Profil per id ge-upsertet).
- **Pflichtfelder validiert VOR jedem Write** (`validateSpec` → `validateProfile`).
- **Sauberer Abbruch**: scheitert der Profil-Write nach dem Auth-Write, wird ein in
  diesem Lauf neu angelegter Nutzer wieder entfernt → **kein halber Account**.
- **Verständliches Ergebnisprotokoll** (`formatProtocol`).
- **Deaktivierung** (`--deactivate`) sperrt Login + nimmt das Profil aus Jobs/Cron —
  strikt auf die id gescoped, **berührt keine Fremddaten**, reversibel.
- **Schutz echter Mandanten**: `cem-ince`, `james-brown`, `angela-merkel` sind hart
  gesperrt (kein Anlegen/Deaktivieren/Löschen über dieses Werkzeug).

## Spec (Pflichtfelder)
```json
{
  "id": "kleinbuchstaben-slug", "email": "…", "name": "…", "password": "≥8 Zeichen",
  "party": "…",                 // oder "faction"
  "parliamentType": "Bundestag",// oder "Landtag" (dann "state" Pflicht)
  "state": "…", "constituency": "…",
  "committees": ["…"],          // oder "focusTopics": ["…"]
  "aiBudgetDailyCents": 500,    // optional
  "tenantDailyCallLimit": 30    // optional (per-Mandant-KI-Callcap)
}
```

## Nutzung (lokal, sicher)
```
npm run provision:tenant -- --validate --spec spec.json     # nur prüfen
npm run provision:tenant -- --spec spec.json                # anlegen/aktualisieren
npm run provision:tenant -- --deactivate <id>               # deaktivieren (reversibel)
npm run provision:tenant -- --teardown  <id>                # vollständig entfernen
```

## Production-Schutz
Das CLI **verweigert** jeden Lauf, sobald ein Supabase-Backend konfiguriert ist
(`HELMUT_STORAGE_BACKEND=supabase` oder `SUPABASE_URL` gesetzt), außer mit
`--allow-production`. Production-Provisionierung ist **freigabepflichtig**:

**Benötigte Freigabe für einen echten zweiten Mandanten:**
1. Production-Write eines neuen Profils + Auth-Nutzers (`--allow-production`).
2. Optional: `HELMUT_TENANT_LLM_LIMITS` um `{"<id>": <limit>}` ergänzen (Env-Änderung,
   Freigabepunkt) für den per-Mandant-Kostendeckel.
3. Cron-Versorgung: siehe QA-Befund „Crons bedienen per Default nur cem-ince" —
   für echte Multi-Tenant-Versorgung (Matching/Decisions) ist ein separater
   Cron-Umbau nötig (eigener Freigabepunkt, in diesem Sprint NICHT umgesetzt).
