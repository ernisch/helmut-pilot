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
- **Schutz bestehender Mandanten (DATENGETRIEBEN, keine Namensliste im Code)**:
  Das Werkzeug darf nur Profile ändern/deaktivieren/löschen, die es selbst
  angelegt hat (`provisionedBy`-Marker `helmut-provisioning`). Hart gesperrt
  sind: Profile OHNE diesen Marker (z. B. die bestehenden Production-Mandanten
  — Pilot wie Demo), IDs, zu denen nur ein Auth-Konto existiert, sowie alle IDs
  aus der optionalen Env `HELMUT_PROTECTED_TENANT_IDS` (Komma-Liste). Der
  Marker-Schutz greift auch ohne gesetzte Env.

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

### Vorflug-Riegel auf dem Speicherpfad (seit 2026-09-04)
Ein Lauf, der **wirklich** gegen Production schreibt — Production-Backend **und**
`--allow-production` **und** ein schreibender Modus (`--spec`/`--spec-inline`,
`--deactivate`, `--teardown`, `--paket --ausfuehren`) — prüft **vor dem ersten
Schreibvorgang** den Speicherpfad und bricht sonst mit **Exitcode 2** ab, ohne
etwas zu schreiben. Grund: `storage.saveProfile` schreibt den geteilten Blob
`helmut_store.main` **unbedingt**, die relationale Zeile aber nur bei wirksamem
`HELMUT_PROFILE_DB_MODE`; ohne ihn wäre das Ergebnis **still blob-only** — genau
der Befund vom 04.09. (Sicherheitsrahmen §37/§38).

**Vor einem Production-Lauf müssen deshalb in der Prozessumgebung stehen:**
`HELMUT_PROFILE_DB_MODE` · `HELMUT_V3_STORE=1` · `HELMUT_STORAGE_BACKEND=supabase` ·
`SUPABASE_URL` · Service-Role-Schlüssel · `HELMUT_CRAWL_RUN_RETENTION` **mit dem für
diesen konkreten Vorgang ausdrücklich geprüften und freigegebenen Wert** (kein
Vorgabewert, keine aus der Doku übernommene Zahl; er muss ≥ 20 sein, dem größten
Lesefenster). Die Zeilenkennungen müssen auf der Vorgabe `main`/`main-auth` stehen;
ein ausdrücklich auf die Vorgabe gesetzter Wert gilt als unverändert.

Jede dieser Variablen ist für einen Production-Lauf **freigabepflichtig**, auch wenn
sie nur im Prozess gesetzt wird (`CLAUDE.md` §4.9). Das Werkzeug gibt sein
tatsächliches Schreibziel vor dem Lauf aus. Es gibt **keine Übergehungsoption**.

**Nicht betroffen:** `--validate` (reine Prüfung), der Stapel-**Trockenlauf**
(`--paket` ohne `--ausfuehren`) und jeder rein lokale Lauf ohne Supabase.

**Benötigte Freigabe für einen echten zweiten Mandanten:**
1. Production-Write eines neuen Profils + Auth-Nutzers (`--allow-production`).
2. Optional: `HELMUT_TENANT_LLM_LIMITS` um `{"<id>": <limit>}` ergänzen (Env-Änderung,
   Freigabepunkt) für den per-Mandant-Kostendeckel.
3. Cron-Versorgung: mandantenbezogene Crons laden ihre Mandate ausschließlich
   aus der Datenbank und verarbeiten **alle aktiven Mandate isoliert** — kein
   Flag, kein bevorzugtes/konfiguriertes Mandat. Ein neu provisioniertes,
   aktives Mandat wird ohne weitere Konfiguration automatisch mitversorgt
   (siehe `docs/multitenancy-pilot-neutralisierung.md`).
