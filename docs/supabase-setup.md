# Supabase Setup fuer Helmut

## 1. Tabelle anlegen

In Supabase:

1. Links auf **SQL Editor** gehen.
2. **New query** oeffnen.
3. Inhalt aus `supabase/schema.sql` einfuegen.
4. **Run** klicken.

Die Tabelle heisst danach:

`public.helmut_store`

Sie speichert den aktuellen Helmut V1 Store persistent als JSONB.

## 2. Environment Variables setzen

In Supabase:

1. **Settings**
2. **API**
3. Kopiere:
   - Project URL
   - service_role key

In Vercel beim Helmut Projekt unter **Settings -> Environment Variables** eintragen:

```txt
HELMUT_STORAGE_BACKEND=supabase
SUPABASE_URL=<deine Supabase Project URL>
SUPABASE_SERVICE_ROLE_KEY=<dein service_role key>
```

Wichtig:

Der `SUPABASE_SERVICE_ROLE_KEY` gehoert nur in Vercel Environment Variables und lokal in `.env.local`.
Er darf nicht im Browser, in GitHub oder im Chat landen.

## 3. Lokal testen

In `.env.local` dieselben Werte setzen:

```txt
HELMUT_STORAGE_BACKEND=supabase
SUPABASE_URL=<deine Supabase Project URL>
SUPABASE_SERVICE_ROLE_KEY=<dein service_role key>
```

Danach lokal mit dem bestehenden Server starten:

```bash
node server.js
```

Dann einmal ausloesen:

```txt
/api/pipeline/run
```

Wenn alles passt, werden Crawl-Ergebnisse, Briefings, Aufgaben, Profil und Signale in Supabase gespeichert.
