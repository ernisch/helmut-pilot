# Production-Beweisprotokoll — Helmut Datenmotor (Thread 2)

**Zweck.** Fortlaufender, ausschließlich aus echten Production-Messwerten gespeister
Nachweis, dass die am 2026-07-16 freigeschalteten Funktionen im laufenden Betrieb
tatsächlich wirken — und ehrliche Trennung zwischen *bewiesen* und *offen*.

**Verbindliche Regeln dieses Protokolls**
- Nur **gemessene** Werte aus der Production-DB (`ddckuvvpcytqbyfmbvie`), aus Vercel
  und aus GitHub. **Keine Schätzungen, keine Annahmen.**
- Während der Beweisläufe **keine** Änderung an Crawling, Locks, Telemetrie oder
  Zeitplänen. Keine künstliche Fehler-Injektion, kein bewusster Doppelstart.
- Keine Behauptung von Betriebsreife und keine DSGVO-Konformitätsbehauptung — dieses
  Dokument sammelt Belege, es spricht kein Reife-Urteil.

---

## 0 · Rahmen & Ausgangszustand

| Feld | Wert (gemessen) |
|---|---|
| Vercel-Projekt | `helmut-pilot` (`prj_xbZ6…`, Team `nohut`), Region `fra1` |
| Aktives Production-Deployment | `dpl_AvdgqwSeht2kBJDszEGmVgBC6Rwq` (redeploy von `dpl_7DP…`), READY |
| Flags live seit | **2026-07-16 18:06:42 UTC** (erst ab hier greifen die Env-Flags im laufenden Code) |
| Freigeschaltete Flags | `HELMUT_ATOMIC_LOCK`, `HELMUT_UNDERSTANDING_LOCK`, `HELMUT_SOURCE_TELEMETRY` = on |
| Migrationen live | `20260718` (`source_crawl_telemetry`), `20260719` (`pipeline_locks` + `helmut_acquire/release_pipeline_lock`) |
| Cron-Plan (UTC) | crawl `0 4`, `0 20`; pipeline `0 16`; understanding `30 5`, `30 21`; morning-briefing `0 5`; lage-briefing `45 5`; health-report `0 6`; lage-check `0 10` |

**Baseline unmittelbar vor dem ersten flag-aktiven Lauf (2026-07-16 ~18:11 UTC):**
`pipeline_locks` = 0 Zeilen · `source_crawl_telemetry` = 0 Zeilen · `systemErrors` = 59 ·
`processRuns` = 1 · `crawlRuns` = 20 · `knowledge_objects` = 323 (complete 271) ·
`raw_documents` = 5948.

**Kontroll-Lauf (Flag AUS) als A/B-Vergleich:** Der 16:00-UTC-Pipeline-Crawl
`crawl-20260716160030-z34lk` lief auf demselben (F1-)Code, aber **vor** dem
18:06-Redeploy, also mit Flags AUS. Ergebnis: vollständiger crawlRun mit
`durationMs=196645`, 145/145 Quellen — **aber 0 Zeilen in `source_crawl_telemetry`**.
Das belegt: die P0-1-Laufzeitmessung ist flag-unabhängig, die Telemetrie hängt
echt am Flag.

---

## 1 · Dokumentierte Läufe

### Lauf 1 — Crawl (manuell über Vercel „Run" ausgelöst)

| Feld | Gemessener Wert |
|---|---|
| runId | `crawl-20260716182458-il02g` |
| Startzeit (UTC) | 2026-07-16 18:24:58 (Crawl-Lock `locked_at`; runId trägt 182458) |
| Endzeit (UTC) | 2026-07-16 18:28:02 (crawlRun gespeichert 18:28:01.858; Telemetrie-Insert 18:28:02.986) |
| **Gesamtdauer** | **183 106 ms (~3 min 03 s)** — echte Wall-Clock (P0-1), `sourceMode=on` |
| Quellenzahl (geprüft) | **145** |
| Erfolgreiche Quellen | **145** |
| Fehlgeschlagene Quellen | **0** |
| Neue Dokumente | crawlRun `newRawDocuments=792` (Persist-Operationen), `savedItems=869`; **Netto-Zuwachs `raw_documents` = +29** (5948→5977). Differenz = Upsert-Semantik: dieselben tagesaktuellen Artikel werden je Lauf re-persistiert, echte Neuzeilen sind wenige. |
| Duplikate | 143 (`crawlRun.duplicates`; Telemetrie `sum(duplicate_documents)=143`); zusätzlich `discardedItems=752`, `loadedItems=1764`, `newCandidateItems=1012` |
| Understanding verarbeitet | **66** |
| Understanding zurückgestellt | **19** |
| **Lock-Nutzung** | **ATOMISCH (relational), live gefangen.** `crawl-cem-ince` token `372ef316-e30c-4c6c-918e-c1d4a89e6a67` (18:24:58 → exp 18:39:58, 15-min-TTL); `global-understanding` token `99b2d564-7100-448e-b65f-57cedf469658` (18:26:21 → exp 18:36:21, 10-min-TTL). Beide in `pipeline_locks` (nicht im Blob `main-auth.pipelineLocks`) → nicht der fail-open-Blob-Pfad. Nach Abschluss: `pipeline_locks` = 0 → token-gebundene Freigabe sauber. |
| Fehler in systemErrors | **0 neue** (59 → 59); `crawlRun.errors=[]`; je Quelle `error_code`-Zeilen = 0 |
| Telemetrie-Zeilen | **145** (`run_id=crawl-20260716182458-il02g`), 145× `status=ok`, 0 Fehlercodes; distinct `source_id` = 144 (Katalog-Dublette, siehe §4.1) |
| Quellenlaufzeiten `duration_ms` | **Min 191 · Median 2375 · Ø 2433 · p95 4624 · Max 7048 ms** (145 Quellen). Quellen-Fetch-Fenster 18:24:59.727 – 18:25:20.129 (~20,4 s wall, nebenläufig) |
| Kategorien | offiziell 78 · medien 48 · partei_fraktion 12 · regional 5 · profil 2 = 145; alle `ok` |
| Exec-Ort | `fra1` |

**Bewertung Lauf 1:** ATOMIC_LOCK, UNDERSTANDING_LOCK und SOURCE_TELEMETRY sind an
harten Spuren belegt (relationale Lock-Zeilen mit Token; 145 Telemetrie-Zeilen gegen
0 im Kontroll-Lauf). Sauberer 145-Quellen-Lauf, 0 Fehler, saubere Lock-Freigabe,
keine Doppelverarbeitung (ein Lock-Halter, ein crawlRun, eine Telemetrie-Run-Gruppe,
`processRuns` +1).

<!-- LAUF-PLATZHALTER: Lauf 2 (Crawl 20:00 UTC), Lauf 3 (Understanding-Cron 21:30 UTC),
     Lauf 4 (Crawl 04:00 UTC), Morgenzyklus (05:00–06:00 UTC), Überschneidungsfenster. -->

---

## 2 · Aggregierte Quellenlaufzeiten (über alle dokumentierten Crawls)

_Wird gefüllt, sobald ≥2 weitere Crawls vorliegen (Ziel: Ø/Median/Min/Max über mehrere Läufe)._

| Crawl (runId) | Quellen | Ø ms | Median ms | Min ms | Max ms |
|---|---|---|---|---|---|
| `crawl-20260716182458-il02g` | 145 | 2433 | 2375 | 191 | 7048 |

---

## 3 · Lock-Nachweis (Zusammenfassung)

- **Atomischer Pipeline-Lock (`HELMUT_ATOMIC_LOCK`):** in Lauf 1 live in `pipeline_locks`
  gefangen (`crawl-cem-ince`, mit `token`), Blob-Pfad nicht genutzt, saubere Freigabe. **Bewiesen.**
- **Understanding-Lock (`HELMUT_UNDERSTANDING_LOCK`):** in Lauf 1 live gefangen
  (`global-understanding`, mit `token`). **Bewiesen.**
- **Deny-/Überlappungspfad** (zwei gleichzeitige Läufe → einer abgewiesen): in Lauf 1
  **nicht** ausgeübt (kein konkurrierender Zweitlauf). **Offen** — natürlicher Kandidat
  ist das 05:30-Fenster; kein bewusster Doppelstart (verboten).

---

## 4 · Parallele sichere Arbeiten (kein Eingriff in laufende Beweisläufe)

### 4.1 · Katalog-Dublette `cem-ince-news` — geprüft, Bereinigung vorbereitet (NICHT angewendet)

**Befund (gemessen):** In Lauf 1 trägt die Telemetrie 145 Zeilen, aber nur 144 distinct
`source_id`. Ursache: `source_id=cem-ince-news` erscheint zweimal, unter zwei Labels
(„Cem Ince News-Suche" und „cem-ince News-Suche", beide Kategorie `profil`).

**Ursache im Code (rein lesend ermittelt):**
- `lib/helmut/sources.js:134` — statischer Katalogeintrag `id:"cem-ince-news"`, `name:"Cem Ince News-Suche"`.
- `lib/helmut/scheduler.js:763` `personNewsSource()` — baut dynamisch `id:` `` `${profile.id}-news` `` = `cem-ince-news`, `name:` `` `${fullName||profile.id} News-Suche` `` → bei fehlendem `fullName` „cem-ince News-Suche".

Beide Wege liefern **dieselbe `source_id`** → dieselbe Google-News-Suche wird pro Crawl
zweimal abgerufen.

**Sicherheitsnachweis (keine Quelle geht verloren):** Es handelt sich um **eine**
logische Quelle (`source_id=cem-ince-news`), doppelt eingereiht. Eine De-Duplizierung
der zusammengesetzten Quellenliste **nach `source_id`** entfernt nur die Doppel-Einreihung;
`cem-ince-news` bleibt genau einmal enthalten. Kein `source_id` verschwindet.

**Warum jetzt NICHT angewendet:** Die Korrektur ist eine **Code-Änderung** (→ Deploy,
ohne Freigabe verboten) und würde die Quellenzahl während der Beweisläufe von 145 auf 144
verschieben (verfälscht den laufenden Nachweis). Daher: **vorbereitet, nicht angewendet.**
Empfohlener Eingriffsort nach dem Sprint (mit Freigabe): De-Dup nach `source_id` bei der
Quellenlisten-Zusammenstellung, ODER den statischen `cem-ince-news`-Katalogeintrag
weglassen, wenn `personNewsSource` dieselbe `id` erzeugt.

### 4.2 · Zweiter Alarmkanal — technische Vorbereitung (nicht aktiviert) ✔ dokumentiert
Vollständige technische Vorbereitung in **`docs/betrieb/zweitkanal-alarm-vorbereitung.md`**:
verifizierter Code-Pfad (`sendMonitoringWebhook` → `buildAlarmPayload`, 8-s-Timeout,
fail-safe, Allowlist+Redaction), exaktes Payload-Schema, gefahrloser Prüfweg
(`GET /api/cron/health-report?dryRun=1`, kein Versand) und die Aktivierungsschritte.
Aktivierung = F5 (Env-Wert setzen) — **verboten ohne Freigabe** und ohne geprüfte
Webhook-URL. Hier nichts aktiviert, Code unverändert.

### 4.3 · Berlin/Brandenburg — strukturelle Vorbereitung (nicht aktiviert)
_Status: in Arbeit (dokumentarisch, rein strukturell)._ Keine Aktivierung.

### 4.4 · Datenschutz / Aufbewahrung / Löschung — dokumentarische Weiterarbeit
_Status: in Arbeit._ Keine echte Löschung, kein `HELMUT_RETENTION_EXECUTE`.

---

## 5 · Zwischenurteil

_Wird am Ende des Sprints gefüllt (nach ≥3 Crawls, vollständigem Morgenzyklus und
geprüftem Überschneidungsfenster)._

---

## 6 · Offen / nächste Freigaben

- **Offen (Beweis):** Deny-/Überlappungsnachweis; dedizierter Understanding-Cron;
  ≥2 weitere Crawls; vollständiger Morgenzyklus; Fehlerfall→`systemErrors` (nur ohne
  künstliche Injektion beobachtbar); Zweitkanal-Alarmtest (braucht F5-Webhook-URL).
- **Nächste Freigaben (Kandidaten):** F5 (Webhook-URL liefern → Zweitkanal);
  danach — nach ≥1 sauberem Beweistag — F6/F7; F8 später.

---

_Letzte Aktualisierung: 2026-07-16 (nach Lauf 1). Fortschreibung erfolgt fortlaufend._
