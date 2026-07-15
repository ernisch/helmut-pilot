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

- Exportiert alle **38 Tabellen** (Blob-Store `helmut_store` + 37 relationale
  Tabellen, inkl. des LLM-Tageszählers `llm_budget_counters`) als JSON nach
  `./backups/<Zeitstempel>/` (gitignored — NIE committen, enthält
  Art.-9-relevante Daten; nur auf verschlüsseltem Gerät aufbewahren,
  Retention/Verschlüsselung siehe Abschnitt 1b).
- Jede Tabelle wird deterministisch nach Primärschlüssel sortiert exportiert
  (`?order=<pk>` je Seite): Exporte sind dadurch vergleichbar (Diff zweier
  Stände möglich) und die limit/offset-Paginierung ist gegen Verschiebungen
  der Seitenreihenfolge stabil.
- **Ehrliche Grenze — KEIN echter DB-Snapshot:** Der Export liest die Tabellen
  sequenziell über REST, ohne transaktionale Snapshot-Semantik. Laufen während
  des Exports Schreibvorgänge, können (a) innerhalb einer Tabelle Zeilen
  zwischen den Seiten hinzukommen/verschwinden und (b) Querbezüge zwischen
  Tabellen inkonsistent sein (z. B. `ko_document_links` auf ein erst nach dem
  Tabellen-Export angelegtes `knowledge_object`). **Deshalb: Export nur zu
  nutzungsarmer Zeit** — empfohlen täglich VOR dem 20:00-UTC-Crawl — und nie
  parallel zu Migrationen/Backfills. Eine echte Snapshot-Garantie liefert erst
  F7 (PITR); bis dahin ist das ein bewusst akzeptiertes, über den Zeitpunkt
  gesteuertes Restrisiko.
- Empfohlener Rhythmus bis F7: **täglich vor dem 20:00-UTC-Crawl** sowie
  **immer unmittelbar vor**: Migrationen, Flag-Änderungen, Datenlöschungen,
  Deployments mit Schreibpfad-Änderungen.
- Erfolgskontrolle: Skript meldet Zeilenzahlen je Tabelle + manifest.json;
  Zahlen grob gegen den Admin-Datenstand prüfen (raw_documents, knowledge_objects).

## 1b. Aufbewahrung, Löschung, Verschlüsselung (VERBINDLICH)

**Retention (verbindlich, übernommen aus dem TOMs-/Löschkonzept-Entwurf):
3 Monatsstände, rollierend.**

- Aufbewahrt werden maximal die Backups der letzten 3 Monate; alles Ältere
  wird gelöscht. Tages-Backups eines abgeschlossenen Monats dürfen auf EINEN
  Monatsstand (letzter erfolgreicher Export des Monats) eingedampft werden.
- **Löschtermin je Backup: Erstellungsdatum + 3 Monate.** Der Termin wird beim
  Anlegen im Betriebs-Log dokumentiert, Beispielzeile:
  `backups/2026-07-15T05-30-00-000Z — Löschtermin 2026-10-15`.
- Monatlicher Löschlauf (fester Termin, z. B. Monatserster zusammen mit der
  Restore-Übung): abgelaufene Backup-Verzeichnisse UND deren verschlüsselte
  Offsite-Kopien löschen; die Löschung mit Datum im Betriebs-Log bestätigen
  (Löschverifikation — bei Art.-9-Daten nicht optional).

**Verschlüsselung VOR jeder Offsite-Kopie (empfohlen: `age`, Alternative
`gpg`):** Backups verlassen das verschlüsselte Betreiber-Gerät ausschließlich
verschlüsselt. Konkrete Kommandos (Platzhalter, keine echten Schlüssel):

```
# Einmalig: Schlüsselpaar erzeugen. Private Key (Inhalt von backup-key.txt)
# in den Passwort-Manager, NICHT neben die Backups, NICHT ins Repo.
age-keygen -o backup-key.txt

# Backup packen + verschlüsseln (Empfänger = eigener age-Public-Key):
tar -C backups -cz <stamp> | age -r age1<oeffentlicher-schluessel> -o <stamp>.tar.gz.age

# Alternative mit gpg (symmetrisch; Passphrase aus dem Passwort-Manager):
tar -C backups -cz <stamp> | gpg --symmetric --cipher-algo AES256 -o <stamp>.tar.gz.gpg

# Entschlüsselungs-Probe (mindestens 1x je Schlüssel durchführen — eine
# nie entschlüsselte Offsite-Kopie ist keine Sicherung):
age -d -i backup-key.txt <stamp>.tar.gz.age | tar -xz -C /tmp/restore-probe
```

- Klartext-Archive (ohne `.age`/`.gpg`) NIE hochladen oder kopieren; nach dem
  Verschlüsseln das unverschlüsselte Archiv löschen.
- Schlüsselverlust = Backup-Verlust: Private Key bzw. Passphrase gehören in
  den Passwort-Manager des Betreibers.

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
   JSON-Datei wiederherstellen. Bei FK-Ketten Eltern zuerst — verbindlich ist
   die Reihenfolge `RESTORE_ORDER` in `scripts/restore-drill.js`
   (FK-sicher aus dem Schema abgeleitet, testgesichert).
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

Werkzeug: `scripts/restore-drill.js` (getestet durch `restore-drill-test.js`,
inkl. struktureller FK-Reihenfolge-Prüfung). Es stellt ein Backup
**ausschließlich in eine isolierte Zielumgebung** wieder her und **verweigert
hart** (ohne Bypass-Flag): Restore in die Backup-Quelle, Restore in
`SUPABASE_URL` (Production) — beides case-insensitiv und unabhängig von
http/https, trailing Slash oder Pfadanhängen —, Wiederverwendung des
Production-Service-Keys als Ziel-Key sowie Backups ohne `quelle`-Angabe im
Manifest (Herkunft unklar = verweigert). Die Übung kann Production
konstruktionsbedingt nicht berühren; **Production wird ausschließlich lesend
angefasst** (Schritt 1, Export).

**Testprojekt-Bootstrap (je Übung, ~10 Min, Free-Tier genügt):**

1. Neues Supabase-Projekt anlegen (Free-Tier) — ein eigenes Projekt NUR für
   die Übung, niemals das Production-Projekt; starkes DB-Passwort in den
   Passwort-Manager.
2. Schema im SQL-Editor des TESTprojekts einspielen, in dieser Reihenfolge:
   1. `supabase/schema.sql`
   2. Migrationen chronologisch (KEINE `*_rollback.sql`-Dateien):
      `20260711_presale_hardening.sql` →
      `20260712_mandate_profile_fields.sql` →
      `20260712_mandate_profile_completeness.sql` →
      `20260712_tenant_rls_policies.sql` →
      `20260713_source_architecture.sql` →
      `20260714_ko_classification.sql` →
      `20260715_dedup_findings.sql` →
      `20260716_gate_shadow_telemetry.sql` →
      `20260716_llm_usage_source_attribution.sql` →
      `20260717_llm_budget_reservation.sql`
3. **Seeds NICHT einspielen** (`supabase/seeds/` weglassen): Der Drill bringt
   alle Daten aus dem Backup mit; vorab eingespielte Seeds verfälschen die
   Vollständigkeitsmessung (Zeilenzahlen vs. Manifest).
4. Service-Role-Key des TESTprojekts (Projekt → Settings → API) als
   `TARGET_SUPABASE_SERVICE_ROLE_KEY` bereitlegen. Der Production-Key wird
   dafür NIE verwendet — das Skript verweigert identische Keys.

**Ablauf der Übung (Soll-Dauer < 30 Min, tatsächliche Dauer protokollieren):**

1. Export: `node scripts/backup-export.js` (read-only, gegen Production erlaubt).
2. Wiederherstellung, wahlweise:
   - Strukturübung ohne Netz: `node scripts/restore-drill.js --backup backups/<stamp> --local /tmp/helmut-drill`
   - Echte DB-Übung (separates Free-Tier-Testprojekt, Bootstrap siehe oben):
     `TARGET_SUPABASE_SERVICE_ROLE_KEY=<ziel-key> node scripts/restore-drill.js --backup backups/<stamp> --target-url https://<testprojekt>.supabase.co`
3. Validierung: Skript prüft jede Tabelle gegen das Manifest (Zeilenzahlen)
   und schreibt `drill-protokoll.json` + `.md` mit Zeitmessung pro Tabelle.
4. **App-Boot-Stichprobe (Erfolgskriterium, nur bei der echten DB-Übung):**
   App lokal GEGEN DAS TESTPROJEKT booten —
   `SUPABASE_URL=https://<testprojekt>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<ziel-key> node server.js`
   (Production-`.env.local` dabei NICHT laden bzw. beide Variablen explizit
   überschreiben — sonst schützt der URL-Guard des Drills zwar weiterhin, aber
   die Stichprobe misst das Falsche). Stichproben: Boot ohne Fehler,
   Lage/Radar/Briefing zeigen die wiederhergestellten Inhalte, Admin-Datenstand
   plausibel gegen das Manifest. **KEIN Production-Write in der gesamten Übung.**
5. Erfolgskriterien: Exit-Code 0, `erfolg: true`, 0 Fehler, Zeilenzahlen =
   Manifest, App-Boot-Stichprobe bestanden, Gesamtdauer notiert (Referenz für
   die echte Wiederherstellungszeit).
6. Fehlerprotokoll: jeder Fehlschlag steht mit Tabelle + Ursache im Protokoll —
   ins Betriebs-Log übernehmen (nur Kennzahlen, keine Rohdaten). Vorlage:

   ```
   ### Restore-Übung <Datum>
   - Backup-Stand: backups/<stamp> (Quelle: <projekt-ref>)
   - Ziel: <testprojekt-ref> (Free-Tier, nur für diese Übung angelegt)
   - Dauer: gesamt <min> (Soll < 30) | Export <s> | Restore <s> | App-Boot <s>
   - Ergebnis: ERFOLG / <n> FEHLER
   - Fehler (je Zeile: Tabelle — Ursache — Behebung): —
   - App-Boot-Stichprobe: Boot ok? Lage ok? Radar ok? Briefing ok? Admin-Datenstand ok?
   - Testdaten gelöscht am <Datum/Uhrzeit>, verifiziert (Projekt gelöscht + lokale Dateien entfernt)
   ```
7. **Sichere Löschung der Testdaten (Pflicht-Abschluss):** lokales
   Zielverzeichnis entfernen (`rm -rf /tmp/helmut-drill`), das Testprojekt
   vollständig löschen (Supabase: Project Settings → General → Delete project)
   oder zurücksetzen, den Ziel-Service-Key verwerfen; Löschung im Betriebs-Log
   bestätigen. Die Rohdateien enthalten personenbezogene Daten — nie liegen
   lassen, nie committen.

**Wiederherstellungsreihenfolge** (verbindlich in `RESTORE_ORDER` in
`scripts/restore-drill.js` verankert, aus den FK-Definitionen in
`supabase/schema.sql` + Migrationen abgeleitet und durch
`restore-drill-test.js` strukturell abgesichert): Blob-Store →
profiles/mandate_profiles → geographies → electoral_districts/
political_entities → publishers → retrieval_paths → source_packages →
package_paths → path_expected_* → sources → raw_documents/knowledge_objects →
Verknüpfungen (ko_document_links/ko_relations/document_findings) →
gate_shadow_events → Pro-Nutzer-Eltern (political_items →
personalized_recommendations, decisions) → deren Kinder (briefings, matching_*,
profile_embeddings, topic_memory, interactions/office_outputs, daily_tasks/
communication_drafts/user_notes/priority_changes) → llm_usage/pipeline_locks/
llm_budget_counters. `geographies` (selbstreferenzielles `parent_id`) wird vor
dem Insert zusätzlich Eltern-zuerst sortiert. `llm_budget_counters` wird mit
wiederhergestellt, damit der atomare LLM-Tageszähler nach einem Restore nicht
bei 0 beginnt (sonst am Restore-Tag bis zu 2x Tagesbudget).
**Realistische Wiederherstellungszeit:** Blob-Only-Restore < 5 Min; Voll-Restore
(38 Tabellen, aktuelle Datenmenge) 15–30 Min inkl. Validierung.
**Datenverlustfenster:** Zeit seit letztem Export (bis F7: bis zu 24 h beim
empfohlenen Tagesrhythmus; nach F7/PITR: Minuten).

## 4. Was NICHT gesichert wird (bewusst)

- Vercel-Env-Variablen: stehen nicht in der DB. Rekonstruktionsgrundlage ist
  das gepflegte Env-Inventar `docs/betrieb/env-inventar.md` (Variablen, Zweck,
  Pflicht/optional — bewusst OHNE Ist-Werte). Die Werte selbst: bei jeder
  Änderung Screenshot/Export der Vercel-Env-Seite in den Passwort-Manager des
  Betreibers.
- Git-Repository: liegt auf GitHub (verteilte Kopien).
