# Runbook — SQL-Schreibpfad `mandate_profiles` aktivieren

Aktiviert die Persistenz der Mandatsprofile in `public.mandate_profiles` (SQL)
zusätzlich zum JSON-Blob. Teil der Erstkonfiguration/Onboarding: erst ab hier
landen die im Onboarding erhobenen Profile auch relational.

**Grundprinzip (schon im Code, fail-safe):** `storage.saveProfile` schreibt
**immer** den Blob und **zusätzlich** SQL, sobald der DB-Modus an ist.
`storage.getProfile` liest dann **SQL zuerst**, Blob als Fallback. Ein SQL-Fehler
wirft nie und rollt den Blob-Schreibvorgang nie zurück (`saveProfileToDb` /
`getProfileFromDb` fangen jeden Fehler und liefern `null`/`{skipped}`). Der
Umschalter ist also risikoarm und jederzeit reversibel (Flag zurück auf aus →
wieder reiner Blob-Betrieb, ohne Datenverlust).

## Voraussetzungen
- Supabase-Projekt erreichbar; `SUPABASE_URL` + Service-Role-Key gesetzt.
- `HELMUT_V3_STORE=1` (V3-Store aktiv — sonst ist `profileDbModeEnabled()`
  technisch false, egal was `HELMUT_PROFILE_DB_MODE` sagt).

## Schritt 1 — Migration einspielen
Die Zielspalten existieren als additive, idempotente Migrationen (kein Risiko für
Bestandsdaten; `mandate_profiles` ist heute leer):
- `supabase/migrations/20260712_mandate_profile_fields.sql` (u. a.
  `onboarding_status`, `datenschutz_bestaetigt_at`, `aktiv`, `namensvarianten` …)
- `supabase/migrations/20260712_mandate_profile_completeness.sql` (Vollständigkeits-Spalten)

Einspielen über den üblichen Migrationsweg (Supabase CLI / SQL-Editor). Rollback
liegt je Migration als `*_rollback.sql` daneben.

Prüfen, dass die Spalten da sind:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='mandate_profiles'
order by column_name;
```

## Schritt 2 — Backfill (Blob → SQL)
Zuerst **Dry-Run** (schreibt nichts, zeigt nur den Plan):
```bash
node scripts/profile-blob-to-sql-backfill.js --dry-run
```
Dann der **Live-Lauf** — er setzt den DB-Modus voraus, also mit gesetzten
Env-Variablen ausführen (Idempotent: Upsert `on conflict user_id`, Mehrfachlauf
unschädlich):
```bash
HELMUT_V3_STORE=1 HELMUT_PROFILE_DB_MODE=1 \
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
node scripts/profile-blob-to-sql-backfill.js
```
Der Lauf liest jedes geschriebene Profil zur Kontrolle aus SQL zurück
(`getProfileFromDb`) und meldet `written / verified / skipped / errors`. Ohne
DB-Modus verweigert er den Live-Lauf bewusst (kein Schein-Backfill nur im Blob).

## Schritt 3 — Flag scharf schalten
`HELMUT_PROFILE_DB_MODE=1` in der Laufzeitumgebung (z. B. Vercel-Env) setzen und
deployen. Ab jetzt schreibt `saveProfile` Blob **und** SQL; `getProfile` liest SQL
zuerst.

## Verifikation nach Aktivierung
- Ein Profil über das Onboarding/Profilbearbeitung speichern und prüfen:
```sql
select user_id, partei, politische_ebene, onboarding_status, datenschutz_bestaetigt_at, aktiv
from public.mandate_profiles order by user_id;
```
- `onboarding_status` steht nach Abschluss auf `abgeschlossen`,
  `datenschutz_bestaetigt_at` ist gesetzt, `aktiv = true`.
- Offline-Regression bleibt grün: `npm run test:offline` (u. a.
  `profile-db-test`, `profile-blob-to-sql-backfill-test`).

## Rollback
`HELMUT_PROFILE_DB_MODE` entfernen/`0` → sofort reiner Blob-Betrieb (der Blob wurde
durchgehend mitgeschrieben, es geht nichts verloren). Bei Bedarf zusätzlich die
Migration über die `*_rollback.sql` zurücknehmen.

> Hinweis: Migration und Flag-Umschaltung finden in eurer Supabase-/Deploy-Umgebung
> statt. Dieses Repo liefert die Artefakte (Migration, Backfill, dieses Runbook);
> der eigentliche Prod-Vollzug ist ein bewusster Betriebsschritt.
