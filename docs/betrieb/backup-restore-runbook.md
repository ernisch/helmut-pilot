# Backup & Restore — Runbook (Stand 2026-07-15, Audit Sprint 7)

**Ehrliche Ausgangslage:** Supabase läuft laut Doku auf dem Free-Plan — KEINE
automatischen Backups, KEIN Point-in-Time-Recovery. Der zentrale Blob
(`helmut_store.main`, ~1,2 MB) wird bei jedem Write komplett überschrieben
(Last-Write-Wins). Ein fehlerhafter Write oder ein DB-Vorfall ist heute ein
**irreversibler Totalverlust**. Deshalb: Freigabepunkt **F7 (Supabase Pro +
PITR, ~25 $/Monat)** ist die wichtigste einzelne Betriebsentscheidung.

## 1. Sofort verfügbar: manuelles Voll-Backup (read-only)

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-export.js
```

- Exportiert Blob-Store + alle 37 Tabellen als JSON nach `./backups/<Zeitstempel>/`
  (gitignored — NIE committen, enthält Art.-9-relevante Daten; nur auf
  verschlüsseltem Gerät aufbewahren).
- Empfohlener Rhythmus bis F7: **täglich vor dem 20:00-UTC-Crawl** sowie
  **immer unmittelbar vor**: Migrationen, Flag-Änderungen, Datenlöschungen,
  Deployments mit Schreibpfad-Änderungen.
- Erfolgskontrolle: Skript meldet Zeilenzahlen je Tabelle + manifest.json;
  Zahlen grob gegen den Admin-Datenstand prüfen (raw_documents, knowledge_objects).

## 2. Restore (manuell, NUR nach Freigabe — verändert Production-Daten!)

Es gibt bewusst KEIN automatisches Restore-Skript: Ein Restore ist immer eine
bewusste, freigegebene Einzelfall-Entscheidung (Gefahr: alte Daten überschreiben
neuere). Vorgehen:

1. **Stopp:** Keine weiteren Schreiboperationen (im Zweifel Vercel-Deployment
   pausieren bzw. Crons via Vercel-Dashboard deaktivieren — Freigabepunkt).
2. **Schaden eingrenzen:** Welche Tabellen/Zeilen sind betroffen? Backup-Manifest
   des letzten guten Stands wählen.
3. **Blob-Restore (häufigster Fall, kaputter `main`-Blob):** Im Supabase
   SQL-Editor die betroffene Zeile mit dem JSON aus
   `backups/<stamp>/helmut_store.json` per UPDATE ersetzen
   (`update helmut_store set data = $1 where id = 'main'`).
4. **Tabellen-Restore:** betroffene Zeilen per DELETE+INSERT aus der
   JSON-Datei wiederherstellen (bei FK-Ketten: Eltern zuerst — profiles vor
   briefings/decisions).
5. **Verifikation:** App öffnen (Lage/Radar/Briefing/Büro), Admin-Datenstand,
   Zeilenzahlen gegen Manifest.
6. **Dokumentation:** Vorfall, Ursache, wiederhergestellter Stand, Datenverlust-
   Fenster (relevant für DSGVO-Meldepflicht-Prüfung durch DSB).

## 3. Nach F7 (Supabase Pro + PITR)

- PITR aktivieren; vor jeder riskanten Aktion den Zeitstempel notieren
  (Preflight-Checklisten verlangen das bereits).
- `scripts/backup-export.js` bleibt als wöchentliche Offsite-Zweitsicherung.
- **Monatliche Restore-Übung** (30 Min): PITR-Restore in ein Branch-/
  Testprojekt, App dagegen booten, Stichproben — ein ungeübter Restore ist
  kein Restore.

## 3b. Restore-ÜBUNG (vorbereitet, jederzeit gefahrlos ausführbar)

Werkzeug: `scripts/restore-drill.js` (getestet durch `restore-drill-test.js`).
Es stellt ein Backup **ausschließlich in eine isolierte Zielumgebung** wieder
her und **verweigert hart** jeden Restore in die Backup-Quelle oder in
`SUPABASE_URL` (Production) — die Übung kann Production konstruktionsbedingt
nicht berühren.

**Ablauf der Übung (Soll-Dauer < 30 Min):**

1. Export: `node scripts/backup-export.js` (read-only, gegen Production erlaubt).
2. Wiederherstellung, wahlweise:
   - Strukturübung ohne Netz: `node scripts/restore-drill.js --backup backups/<stamp> --local /tmp/helmut-drill`
   - Echte DB-Übung (erst nach F7 bzw. mit kostenlosem separatem Testprojekt):
     `TARGET_SUPABASE_SERVICE_ROLE_KEY=<ziel-key> node scripts/restore-drill.js --backup backups/<stamp> --target-url https://<testprojekt>.supabase.co`
     (Ziel-Schema vorher mit `supabase/schema.sql` + Migrationen anlegen.)
3. Validierung: Skript prüft jede Tabelle gegen das Manifest (Zeilenzahlen)
   und schreibt `drill-protokoll.json` + `.md` mit Zeitmessung pro Tabelle.
4. Erfolgskriterien: Exit-Code 0, `erfolg: true`, 0 Fehler, Zeilenzahlen =
   Manifest, Gesamtdauer notiert (Referenz für die echte Wiederherstellungszeit).
5. Fehlerprotokoll: jeder Fehlschlag steht mit Tabelle + Ursache im Protokoll —
   ins Betriebs-Log übernehmen (nur Kennzahlen, keine Rohdaten).
6. Testdaten löschen: lokales Zielverzeichnis entfernen bzw. Testprojekt
   zurücksetzen/löschen. Die Rohdateien enthalten personenbezogene Daten —
   nie liegen lassen, nie committen.

**Wiederherstellungsreihenfolge** (im Skript verankert, FK-sicher): Blob-Store →
profiles/mandate_profiles → Quellenarchitektur (publishers → retrieval_paths →
source_packages → package_paths) → Stammdaten → raw_documents →
knowledge_objects → Verknüpfungen → decisions/briefings → Rest.
**Realistische Wiederherstellungszeit:** Blob-Only-Restore < 5 Min; Voll-Restore
(~40 Tabellen, aktuelle Datenmenge) 15–30 Min inkl. Validierung.
**Datenverlustfenster:** Zeit seit letztem Export (bis F7: bis zu 24 h beim
empfohlenen Tagesrhythmus; nach F7/PITR: Minuten).

## 4. Was NICHT gesichert wird (bewusst)

- Vercel-Env-Variablen: stehen nicht in der DB. Bis das Env-Inventar
  (Roadmap B6) gepflegt ist, gilt: Screenshot/Export der Vercel-Env-Seite bei
  jeder Änderung in den Passwort-Manager des Betreibers.
- Git-Repository: liegt auf GitHub (verteilte Kopien).
