# Pilotmandanten-Cutover-Plan — Blob → SQL (Phase 3, Production-Teil)

**Stand:** 2026-07-12 · **Status:** Code+Migration lokal getestet, **NICHT auf Production
angewendet**. Dieses Dokument ist der laut Auftrag geforderte „exakte Plan" — kein Production-
Write wird ohne separate, ausdrückliche Freigabe ausgeführt.

---

## 1. Was bereits sicher gelandet ist (kein Freigabepunkt, siehe PR)

- `supabase/migrations/20260712_mandate_profile_fields.sql` — 10 neue, additive Spalten auf
  `mandate_profiles` (0 Zeilen, ungenutzt). Lokal getestet (Forward/Idempotenz/Rollback/
  CHECK-Constraints), **nicht auf Production angewendet**.
- `lib/helmut/storage.js` — `getProfile`/`saveProfile` können optional aus/in
  `profiles`+`mandate_profiles` (SQL) lesen/schreiben, gesteuert durch
  `HELMUT_PROFILE_DB_MODE` (Default AUS = **kein Verhaltensunterschied**). 44 neue Tests plus
  volle Regressionssuite grün.
- Bei `HELMUT_PROFILE_DB_MODE` AUS (heutiger Zustand) ändert sich für den Pilotmandanten **exakt nichts** —
  weder Code-Pfad noch Daten.

## 2. Was noch aussteht, um den Pilotmandanten wirklich aus dem Code zu lösen

Zwei getrennte, unabhängige Freigabepunkte:

### Schritt A — Migration auf Production anwenden
- **Was:** `supabase/migrations/20260712_mandate_profile_fields.sql` gegen
  `ddckuvvpcytqbyfmbvie` ausführen.
- **Betroffene Tabelle:** nur `public.mandate_profiles` (0 Zeilen heute).
- **Risiko:** minimal — additive Spalten auf einer leeren, im Code noch nicht gelesenen Tabelle.
  Kann nichts Laufendes brechen.
- **Rollback:** `20260712_mandate_profile_fields_rollback.sql` (Spalten wieder entfernen).

### Schritt B — Das Profil des Pilotmandanten einmalig in die SQL-Tabellen schreiben + Flag aktivieren
- **Was genau wird geschrieben:**
  - `public.profiles`: UPDATE der bestehenden Zeile `id='<pilot-mandats-id>'` — nur `name` (heute schon
    gesetzt) bleibt, kein neues Feld nötig dort.
  - `public.mandate_profiles`: **1 neue Zeile** `user_id='<pilot-mandats-id>'` mit dem vollständigen
    Inhalt des (damals hartkodierten) Pilot-Vollprofils, erzeugt über `storage.toMandateProfileRow(…)`
    (bereits Teil dieses PRs, in `scripts/profile-db-test.js` gegen das Pilot-Vollprofil verifiziert
    — alle 16 `focusTopics`, `committees`, `party`, `constituency` etc. verlustfrei).
  - **Kein bestehendes Datum wird verändert** (die Zeile existiert heute nicht — reines INSERT).
- **Wie geschrieben wird:** einmaliger, admin-gesicherter Endpoint (nach demselben Muster wie
  `/api/admin/ko-enrichment-backfill` — Dry-Run zuerst, dann `?execute=1`), der intern
  `storage.saveProfile(…)` mit dem Pilot-Vollprofil und `HELMUT_PROFILE_DB_MODE=1` aufruft. **Wird in diesem
  Sprint noch gebaut, aber nicht ausgeführt.**
- **Flag-Aktivierung:** `HELMUT_TENANT_JWT_MODE`-Runbook-Muster: `HELMUT_PROFILE_DB_MODE=1` in
  Vercel setzen (Betreiber-Handgrick, Agent kann keine Vercel-Env-Variablen schreiben) + Redeploy.
- **Reihenfolge wichtig:** Erst die Zeile des Pilotmandanten schreiben (Schritt B1), DANN das Flag aktivieren
  (Schritt B2) — nie umgekehrt, sonst würde `getProfile('<pilot-mandats-id>')` kurzzeitig nichts in der DB
  finden und auf den (weiterhin vorhandenen) Blob zurückfallen, was harmlos, aber unnötig wäre.

## 3. Vorher/Nachher-Vergleich (wird bei Ausführung von Schritt B live gemessen)

| Prüfpunkt | Erwartung |
|---|---|
| `party`/`committee`/`focusTopics` in Lage/Radar/Helmut | identisch zu heute (gleiche Werte, nur andere Quelle) |
| Anzahl sichtbarer Entscheidungen (`/api/release/public`) | unverändert (aktuell 16 sichtbare Entscheidungen laut `fix-plan.md`) |
| Matching-Scores (partei/ausschuss/wahlkreis/thema) | unverändert (gleiche Eingabefelder) |
| Radar-Personentreffer | unverändert |
| Büro-Entwürfe (Ton/Kanal) | unverändert (`communicationStyle`/`preferredChannels` identisch übertragen) |
| Runtime-Fehler (Vercel) | keine neuen `[v3Store] getProfileFromDb`-Fehler nach Aktivierung |

## 4. Backup & Rollback

- **Backup:** Der Blob (`helmut_store.data.profiles['<pilot-mandats-id>']`) bleibt unverändert bestehen
  und wird **weiter** bei jedem `saveProfile()`-Aufruf mitgeschrieben (siehe Code-Kommentar in
  `storage.js`: „Blob bleibt IMMER die erste, garantierte Schreiboperation"). Er ist damit selbst
  das Backup — kein separater Snapshot nötig.
- **Rollback (sofort, ohne Datenverlust):** `HELMUT_PROFILE_DB_MODE` in Vercel entfernen/auf `0`
  setzen + Redeploy → `getProfile()` liest wieder ausschließlich den Blob, exakt wie heute. Die
  neu geschriebene `mandate_profiles`-Zeile bleibt liegen (harmlos, kann später gelöscht werden),
  beeinflusst aber nichts, solange das Flag aus ist.

## 5. Risiko, Dauer, Kosten

- **Risiko:** niedrig — Schritt A ist additiv/leer, Schritt B ist ein reines INSERT (keine
  bestehende Zeile wird verändert) mit sofortigem, verlustfreiem Rollback-Pfad.
- **Dauer:** Schritt A < 1 Minute (DDL). Schritt B < 1 Minute (1 INSERT via Admin-Endpoint) +
  Redeploy-Zeit (~1-2 Minuten) für die Flag-Aktivierung.
- **Kosten:** keine (kein KI-Call, keine externen Aufrufe).

## 6. Voraussetzung für Freigabe

Dieser Plan wird **nicht** ausgeführt, solange keine ausdrückliche Freigabe für
„Production-Migration" (Schritt A) und separat „Production-Datenübernahme Pilotmandant" (Schritt B)
vorliegt (siehe Auftrag, Stopp-Bedingungen 1 und 9/10). Bis dahin bleibt der Pilotmandant vollständig auf dem
Blob-Pfad — unverändert, ohne jedes Risiko.
