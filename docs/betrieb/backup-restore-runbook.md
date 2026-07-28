# Backup & Restore — Runbook (Stand 2026-07-28, OP-01-Sprint)

**Ehrliche Ausgangslage:** Supabase läuft auf dem **Free-Plan** (am 2026-07-28
über die Management-API gegengeprüft: Organisation `plan: free`) — KEINE
automatischen Backups, KEIN Point-in-Time-Recovery. Der zentrale Blob
(`helmut_store.main`) wird bei jedem Write komplett überschrieben
(Last-Write-Wins). Deshalb bleibt Freigabepunkt **OP-01 (Supabase Pro + PITR,
~25 $/Monat)** die wichtigste einzelne Betriebsentscheidung.

**Was sich am 2026-07-28 geändert hat:** Der Rückweg ist jetzt **praktisch
bewiesen**. Eine vollständige Production-Sicherung (40/40 Tabellen, 74 844
Datensätze) wurde in eine isolierte lokale PostgreSQL wiederhergestellt und
feld- und mengenmäßig verifiziert — 18/18 Prüfungen, inklusive funktionaler
Mandantentrennung (RLS-Probe), Policies/Trigger/Funktionen gegen die
Production-Strukturreferenz und pgvector-Matching. Beleg:
[`restore-uebung-2026-07-28.md`](restore-uebung-2026-07-28.md). Werkzeuge:
Abschnitt 3c.

## 0. Datenklassen, RPO und RTO (verbindlich für den Pilotbetrieb)

| Datenklasse | Tabellen (Auszug) | Kritikalität | Wiederbeschaffbar? | Sicherungstyp |
|---|---|---|---|---|
| Unersetzbare Geschäftsdaten | `profiles`, `mandate_profiles`, `helmut_store` (inkl. App-Auth-Blobs), `briefings`, `decisions`, `office_outputs`, `interactions`, `user_notes` | höchste | nein | Voll-Export täglich |
| Abgeleitete Wissensobjekte | `knowledge_objects`, `ko_document_links`, `ko_relations`, `matching_*`, `profile_embeddings` | hoch (LLM-Kosten der Neuerzeugung, Historie unwiederbringlich) | teilweise, teuer | Voll-Export täglich |
| Quellenarchitektur | `publishers`, `retrieval_paths`, `source_packages`, `package_paths`, `path_expected_*`, `geographies`, `political_entities`, `electoral_districts`, `sources` | hoch | aus Seeds + Drift-Doku rekonstruierbar, fehleranfällig | Voll-Export täglich |
| Rohdokumente | `raw_documents`, `document_findings` | mittel | teilweise (Google-News-Links verfallen) | Voll-Export täglich |
| Betrieb/Budget | `llm_budget_counters`, `llm_usage`, `pipeline_locks`, `process_runs` | mittel (Kostenwahrheit) | nein | Voll-Export täglich |
| Telemetrie | `gate_shadow_events`, `source_crawl_telemetry` | niedrig | verzichtbar | im Voll-Export enthalten |
| Supabase Auth / Storage | — | — | **ungenutzt** (0 Nutzer in `auth.users`, 0 Buckets/Objekte, geprüft 2026-07-28); App-Auth liegt im Blob-Store und ist damit Teil des Exports | entfällt |
| Außerhalb der DB | Vercel-Env-Variablen, Git-Repo | hoch | Env-Inventar + Passwort-Manager bzw. GitHub | Abschnitt 4 |

- **RPO (maximaler Datenverlust) heute: bis zu 24 h** — Zeit seit dem letzten
  täglichen Export. Für den Einzelpiloten akzeptiert; für zahlende Mandanten
  ist PITR (RPO im Minutenbereich) die empfohlene Lösung → OP-01-Entscheidung.
- **RTO (Wiederanlaufzeit): gemessen.** Voll-Export 50 s; Restore + kompletter
  Beweis in isolierter PostgreSQL 20 s (Schema 2 s · Import 6 s · Prüfung 12 s).
  Realistisch für einen echten Vorfall inkl. Entscheidungsweg, Neuaufbau eines
  Supabase-Projekts und App-Umstellung: **unter 2 Stunden**; Blob-only-Restore
  < 10 Min. Mit PITR: Minuten bis wenige Stunden je nach Vorfall.
- Bewusst KEINE Enterprise-Anforderungen (kein Offsite-Automat, kein
  Zweit-Cloud-Konto): für die ersten zehn Mandanten trägt der tägliche
  geprüfte Export + geübter Rückweg; ab Pro-Plan übernimmt PITR den RPO-Teil.

## 1. Sofort verfügbar: manuelles Voll-Backup (read-only)

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-export.js
```

- Exportiert alle **40 Tabellen** (Blob-Store `helmut_store` + 39 relationale
  Tabellen, inkl. `llm_budget_counters`, `source_crawl_telemetry` und
  `process_runs` — die letzten beiden fehlten bis zum OP-01-Sprint 2026-07-28:
  ein „Voll“-Backup deckte nur 38 von 40 Tabellen ab; bei jeder neuen
  Migration mit `create table` MUSS `TABLES` in `backup-export.js` und
  `RESTORE_ORDER` in `restore-drill.js` nachgezogen werden, der Test
  `restore-verify-local-test.js` prüft die Deckung) als JSON nach
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
  FA-7 (PITR); bis dahin ist das ein bewusst akzeptiertes, über den Zeitpunkt
  gesteuertes Restrisiko.
- Empfohlener Rhythmus bis FA-7: **täglich vor dem 20:00-UTC-Crawl** sowie
  **immer unmittelbar vor**: Migrationen, Flag-Änderungen, Datenlöschungen,
  Deployments mit Schreibpfad-Änderungen.
- Erfolgskontrolle: Skript meldet Zeilenzahlen je Tabelle + manifest.json;
  Zahlen grob gegen den Admin-Datenstand prüfen (raw_documents, knowledge_objects).

## 1a. Teil-Umfänge (`--scope`) — kleiner, gezielter, datenminimierend

Ein Voll-Export zieht Rohdokumente, Briefings, Interaktionen und Notizen auf die
Platte. Vor einem eng umrissenen Eingriff ist das unnötig viel personenbezogene
Datenmenge. Deshalb gibt es zwei Teil-Umfänge, jeweils genau auf die Tabellen
zugeschnitten, die der jeweilige Eingriff berührt:

| Aufruf | Tabellen | Manifestart | Wofür |
|---|---|---|---|
| `node scripts/backup-export.js --scope=seed` | **8** Quellentabellen (`geographies` … `path_expected_geographies`) | `pre-seed` | vor der Quellen-Seed-Einspielung (`quellen-seed-einspielung.md`) |
| `node scripts/backup-export.js --scope=profil` | **2** Profiltabellen (`profiles`, `mandate_profiles`) | `pre-profil` | vor dem Anlegen eines Mandatsprofils — insbesondere Schritt 5 der Berliner Aktivierungsreihenfolge (`berlin-aktivierung.md` §9) |
| `node scripts/backup-export.js` (Standard) | alle **40** | `voll` | alles Übrige |

- **Warum `--scope=profil` seit 2026-07-26 (Punkt 14B) existiert:** `--scope=seed`
  deckt **keine** der beiden Profiltabellen ab. Für den einzigen mutierenden
  Schritt der Berliner Reihenfolge, der Profile anfasst, gab es damit vorher
  keine passende Sicherung — und `--scope=voll` hätte die Datenminimierung
  aufgehoben, wegen der es die Teil-Umfänge überhaupt gibt.
- **Reihenfolge im Manifest ist FK-sicher** (`restoreReihenfolge`): Eltern vor
  Kindern — `profiles` vor `mandate_profiles`
  (`mandate_profiles.user_id → profiles.id ON DELETE CASCADE`).
- **Ein leerer Teil-Export gilt nicht als Sicherung:** ist eine der Tabellen des
  Umfangs auf 0 Zeilen, endet der Lauf mit `vollstaendig: false` und Exit 1.
- **Auch der kleine Export ist personenbezogen:** `profiles` trägt Klarnamen
  realer Mandatsträger. Aufbewahrung, Verschlüsselung und Löschung nach 1b.
- **Ein Teil-Export ersetzt kein Voll-Backup und nicht OP-01.** Er deckt
  ausdrücklich nur seine eigenen Tabellen ab; die Meldung am Ende des Laufs sagt
  das explizit mit.
- **Rückweg zuerst, Restore zweitens:** für die Berliner Profilschritte ist der
  vorgesehene Rückweg **nicht** ein Restore aus diesem Export, sondern die drei
  zeilenscharfen, fail-closed Rollback-Dateien
  (`20260726_berlin_abnahmeprofil_rollback_stufe0…2.sql`, gegen ein echtes
  PostgreSQL bewiesen). Der Export ist die Beweisgrundlage für den
  Vorher-/Nachher-Vergleich (Zeilenzahlen + Prüfsummen je Tabelle).

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

## 3. Nach OP-01 (Supabase Pro + PITR; früher FA-7)

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
   2. Migrationen chronologisch (KEINE `*_rollback.sql`-Dateien; **ohne**
      `20260720_crawl_runs_relational.sql` — in Production nicht angewandt):
      `20260711_presale_hardening.sql` →
      `20260712_mandate_profile_fields.sql` →
      `20260712_mandate_profile_completeness.sql` →
      `20260712_tenant_rls_policies.sql` →
      `20260713_source_architecture.sql` →
      `20260714_ko_classification.sql` →
      `20260715_dedup_findings.sql` →
      `20260716_gate_shadow_telemetry.sql` →
      `20260716_llm_usage_source_attribution.sql` →
      `20260717_llm_budget_reservation.sql` →
      `20260718_source_crawl_telemetry.sql` →
      `20260719_pipeline_lock_atomic.sql` →
      `20260721_security_advisor_hardening.sql` →
      `20260727_process_runs_relational.sql`
   3. Drift-Korrekturen aus `scripts/produktions-strukturreferenz.json`
      (`schemaDrift`): Production weicht in Einzelspalten vom Repo-Schema ab
      (belegt 2026-07-28) — ohne die Korrekturen bricht der Import
      (`knowledge_objects.action_items` NOT-NULL-Drift) oder verliert still
      die Alt-Spalten von `profiles` und `topic_memory.vorgang_id`.
      `restore-verify-local.js` wendet sie automatisch an.
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
(40 Tabellen, aktuelle Datenmenge) 15–30 Min inkl. Validierung ins Testprojekt;
in die lokale PostgreSQL gemessen: 20 s (Abschnitt 3c).
**Datenverlustfenster:** Zeit seit letztem Export (bis FA-7: bis zu 24 h beim
empfohlenen Tagesrhythmus; nach FA-7/PITR: Minuten).

## 3c. Restore-BEWEIS in lokaler PostgreSQL (der am 2026-07-28 geübte Weg)

Werkzeug: `scripts/restore-verify-local.js` (getestet durch
`restore-verify-local-test.js`, inkl. Negativ-/Mutationsproben der
Schutzregeln). Es braucht **kein zweites Cloud-Projekt**: Ziel ist eine
lokale PostgreSQL 16+ mit `pgvector` (Debian/Ubuntu:
`apt-get install postgresql-16-pgvector`). Es baut das Production-Schema
selbst auf (schema.sql + Migrationen + belegte Drift-Korrekturen aus
`scripts/produktions-strukturreferenz.json`) und beweist danach die
Wiederherstellung — ein Exit 0 des Imports genügt ausdrücklich NICHT.

**Harte Schutzregeln (Skript verweigert mit Exit 2):** Ziel muss lokal sein
(Unix-Socket/localhost/127.0.0.1/::1) · jeder Host/DB-Name mit „supabase“
wird verweigert (Production kann nie Ziel sein, auch kein Testprojekt) ·
Ziel == `SUPABASE_URL`-Host wird verweigert · ohne `--ziel-bestaetigt` keine
Ausführung · Teil-Backups (`art != voll`), unvollständige Backups
(`vollstaendig != true`) und Backups ohne `quelle` werden verweigert ·
jede Tabellendatei muss die Manifest-Prüfsumme treffen (manipulierte oder
fehlende Datei = Abbruch VOR jedem DB-Schritt) · die Ziel-DB legt das Skript
selbst an — existiert sie, bricht es ab (kein Lauf überschreibt einen alten).

**Ablauf (gemessen am 2026-07-28: 20 s gesamt):**

```
# 1. Lokale PostgreSQL starten (Beispiel Debian-Cluster) und ein NUR LOKAL
#    gueltiges Passwort setzen (nie ein Production-Secret verwenden):
pg_ctlcluster 16 main start
su postgres -c "psql -c \"alter user postgres password '<lokales-drill-passwort>'\""

# 2. Drill (Backup-Verzeichnis aus backup-export.js):
PGPASSWORD='<lokales-drill-passwort>' node scripts/restore-verify-local.js \
  --backup backups/<stamp> --ziel-bestaetigt \
  --pg-host 127.0.0.1 --pg-port 5432 --pg-user postgres

# 3. Nach der Uebung PFLICHT (Drill-DB enthaelt personenbezogene Daten):
psql -h 127.0.0.1 -U postgres -c 'drop database <helmut_drill_...>'
```

**Die 18 Prüfungen** (alle müssen OK sein; Protokoll:
`<backup>/restore-verify-<lauf>/protokoll.json` + `.md`, nur Kennzahlen und
Objektnamen, nie Feldwerte): Backup-Integrität je Datei · Schema-Aufbau ·
leeres Ziel · RESTORE_ORDER-Deckung · Zeilenzahlen == Manifest · keine
Zusatzdaten (Gesamtsumme) · PK-Mengen byte-identisch je Tabelle · feldgenaue
Stichproben (9 je kritischer Tabelle, normalisiert) · Nicht-NULL-Zähler je
`knowledge_objects`-Spalte (deckt die Sprint-19–21-Felder) ·
Nachklassifikations-Marker vollständig · Tabellen-/Policy-/Trigger-/
Funktions-Mengen == `produktions-strukturreferenz.json` · RLS überall aktiv ·
**Mandantentrennung funktional** (Rolle `authenticated` + JWT-Claim über
`auth.jwt()`-Shim: je Mandant nur eigene Zeilen, ohne Claim 0 Zeilen) ·
`match_knowledge_objects` mit echtem Profil-Embedding · `set_updated_at`-
Trigger (in Rollback-Transaktion).

**Strukturreferenz aktuell halten:** nach jeder angewandten Migration die
Erhebung wiederholen (read-only, SQL-Editor oder MCP) und
`scripts/produktions-strukturreferenz.json` nachziehen:

```sql
-- Tabellen + RLS:   select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
-- Policies:         select tablename||':'||policyname from pg_policies where schemaname='public';
-- Trigger:          select c.relname||':'||t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace;
-- Funktionen:       select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e');
-- Spalten/NOT NULL: select c.relname||'.'||a.attname||':'||a.attnotnull from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped;
```

**Bekannte, bewusst akzeptierte Abweichungen der Übungsumgebung:**
PostgreSQL 16 + pgvector 0.6 lokal vs. 17.6 + 0.8 in Production (Logik-
identisch für Schema und Datentypen dieses Projekts) · PostgREST/„echter“
App-Boot ist gegen eine rohe PostgreSQL nicht möglich — der lesende
Anwendungstest läuft als SQL-Probe (RLS-Proben + `match_knowledge_objects`);
der App-Boot-Test bleibt Bestandteil der Testprojekt-Übung nach 3b.

## 3d. Automatisierung (bewertet 2026-07-28, bewusst minimal)

- **Automatisiert (bereits gebaut):** Vollständigkeitsprüfung im Export
  (serverseitiger Count-Abgleich, Prüfsummen, `vollstaendig`-Riegel),
  komplette Restore-Verifikation (18 Prüfungen), Schutzregeln mit
  Negativtests in der Offline-Suite.
- **Bewusst manuell (bis OP-01-Entscheidung):** der tägliche Export selbst.
  Ein Cron bräuchte einen dauerhaft laufenden Runner mit Production-Secret
  außerhalb Vercels (neue kritische Infrastruktur + neuer Secret-Ort) — das
  widerspricht „einfach, sicher, ohne neue kritische Infrastruktur“. Der
  empfohlene Betreiber-Rhythmus bleibt: täglich vor dem 20:00-UTC-Crawl
  (5 Min Aufwand), zusätzlich vor jeder Migration/Flag-Änderung.
- **Monatliche Restore-Übung** (Monatserster, mit dem Löschlauf aus 1b):
  Abschnitt 3c ausführen, Kennzahlen ins Betriebs-Log. Ein ungeübter
  Restore ist kein Restore.
- **Nach Pro/PITR:** native Backups + PITR übernehmen RPO; der Export bleibt
  wöchentliche Offsite-Zweitsicherung (Abschnitt 3), die Übung bleibt
  monatlich.
- Production-Crons wurden NICHT verändert (freigabepflichtig).

## 4. Was NICHT gesichert wird (bewusst)

- Vercel-Env-Variablen: stehen nicht in der DB. Rekonstruktionsgrundlage ist
  das gepflegte Env-Inventar `docs/betrieb/env-inventar.md` (Variablen, Zweck,
  Pflicht/optional — bewusst OHNE Ist-Werte). Die Werte selbst: bei jeder
  Änderung Screenshot/Export der Vercel-Env-Seite in den Passwort-Manager des
  Betreibers.
- Git-Repository: liegt auf GitHub (verteilte Kopien).
