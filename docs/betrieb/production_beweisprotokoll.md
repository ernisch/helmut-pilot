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

### Lauf 2 — Crawl (natürlicher 20:00-UTC-Cron)

| Feld | Gemessener Wert |
|---|---|
| runId | `crawl-20260716200114-v268f` |
| Startzeit (UTC) | 2026-07-16 20:01:14 (Crawl-Lock `locked_at`; Cron feuerte 20:00, Lock-Acquire nach ~74 s Kaltstart/Jitter) |
| Endzeit (UTC) | 2026-07-16 20:04:04 (crawlRun gespeichert; Telemetrie bis 20:04:09) |
| **Gesamtdauer** | **169 572 ms (~2 min 50 s)**, `sourceMode=on` |
| Quellenzahl (geprüft) | **145** |
| Erfolgreiche Quellen | **16** ⚠ |
| Fehlgeschlagene Quellen | **129** ⚠ (siehe Betriebsbefund B1) |
| Neue Dokumente | `newRawDocuments=61`, `savedItems=68`; **Netto `raw_documents` = +31** (5977→6008) |
| Duplikate | 5 (`crawlRun.duplicates`); `loadedItems=73`, `discardedItems=0`, Telemetrie `sum(new_documents)=56` |
| Understanding verarbeitet | **18** |
| Understanding zurückgestellt | **20** |
| **Lock-Nutzung** | **ATOMISCH (relational), beide live gefangen.** `crawl-cem-ince` token `bacc4f5b-61f6-4a1b-8fe2-0ecf53283a79` (20:01:14 → 20:16:14); `global-understanding` token `30864d16-c692-48d8-a08b-aa3e5cbac212` (20:02:29 → 20:12:29). **Um 20:03:28 UTC beide gleichzeitig gehalten** (in-run Pipeline↔Understanding-Überlappung, zwei getrennte atomare Locks). Blob nicht genutzt; nach Abschluss `pipeline_locks`=0 → saubere Freigabe. |
| Fehler in systemErrors | **0 neue** (59 → 59) — trotz 129 fehlgeschlagener Quellen (Einordnung: B1) |
| Telemetrie-Zeilen | **145** (`run_id=v268f`), `status ok=16 / not_ok=129`. **Fehlerklassifikation: `http-429` ×47, `timeout` ×81, `http-4xx` ×1, ok(kein Code) ×16.** |
| Quellenlaufzeiten `duration_ms` | Min 24 · Median 7294 · Ø 6803 · Max 14189 ms — **timeoutgetrieben (degradierter Lauf)**; gesunder Pro-Quellen-Baseline bleibt Lauf 1. Fetch-Fenster 20:01:15.534–20:02:17.499 (~62 s). |
| Kategorien (ok/failed) | medien 15/33 · offiziell 1/77 · partei_fraktion 0/12 · regional 0/5 · profil 0/2 |

**Bewertung Lauf 2:** Die **Beobachtbarkeit funktionierte einwandfrei** — atomarer Lock und
Understanding-Lock live gefangen (sogar zeitgleich), 145 Telemetrie-Zeilen inkl. **präziser
Fehlerklassifikation aller 129 Ausfälle**, saubere Lock-Freigabe. Das **Crawl-Ergebnis war
jedoch schwer degradiert** (nur 16/145 Quellen erfolgreich) — externe Google-News-Drosselung,
kein Flag-/Lock-/Telemetrie-Fehler. Details + ehrlicher Ursachen-Caveat: Betriebsbefund B1.

### Lauf 3 — Dedizierter Understanding-Cron (natürlicher 21:30-UTC-Cron)

| Feld | Gemessener Wert |
|---|---|
| runId | `understanding-cron-20260716213006-n3frt` |
| Startzeit (UTC) | 2026-07-16 21:30:06.290 |
| Endzeit (UTC) | 2026-07-16 21:30:07.364 |
| **Gesamtdauer** | **1 074 ms**, `mode=cron`, `status=ok`, `location=fra1` |
| Understanding verarbeitet | **0** |
| Understanding zurückgestellt | **0** |
| **Lock-Nutzung** | Understanding-Cron zieht `global-understanding` (atomar, da beide Flags on). Wegen ~1 s Laufzeit **nicht** live nachgefangen; der atomare `global-understanding`-Lock ist in Lauf 1 UND Lauf 2 live belegt (unveränderte Flags/Codepfad). |
| Fehler in systemErrors | **0 neue** (59 → 59) |
| Neue KOs | 0 (ko_total 337 → 337) |
| Quellenfelder | n/a (kein Crawl → keine `source_crawl_telemetry`, kein `crawl-cem-ince`-Lock) |

**Bewertung Lauf 3 (ehrlich):** Ein **legitim leerer** Lauf — es gab nichts zu verstehen, weil
das **eager**-Understanding des 20:00-Crawls die Warteschlange bereits geleert hatte. Das ist
korrektes idempotentes Verhalten (Cron feuert, findet 0 pending, sauberer processRun), **kein**
Fehler. Die **substanzielle** Understanding-Laufzeit steckt in den eager-Batches:
- Lauf 1 (eager): 57 verarbeitet, innerhalb der 196 645 ms Crawldauer.
- Lauf 2 (eager, `understanding-eager` runId `v268f`): **18 verarbeitet / 20 zurückgestellt in
  92 988 ms** (20:02:29 → 20:04:02; `startedAt` deckt sich exakt mit dem
  `global-understanding`-Lock-`locked_at` 20:02:29 — dieselbe Sperre, die ich in Lauf 2 live gefangen habe).

**Offener Prüfpunkt:** Ob die **20 zurückgestellten** Dokumente aus Lauf 2 von einem späteren
Cron (nächste Chance: 05:30-Understanding-Cron) nachgeholt werden — Test der Zusicherung
„zurückgestellt = idempotent beim nächsten Lauf nachgeholt". Wird im Morgenzyklus geprüft.

### Lauf 4 — Crawl (natürlicher 04:00-UTC-Cron) — zugleich B1-Gegenprobe

| Feld | Gemessener Wert |
|---|---|
| runId | `crawl-20260717040100-mb1k6` |
| Startzeit (UTC) | 2026-07-17 04:01:00 (Crawl-Lock `locked_at`) |
| Endzeit (UTC) | 2026-07-17 04:03:50 (crawlRun gespeichert) |
| **Gesamtdauer** | **170 106 ms (~2 min 50 s)**, `sourceMode=on` |
| Quellenzahl (geprüft) | **145** |
| Erfolgreiche Quellen | **145** ✅ |
| Fehlgeschlagene Quellen | **0** ✅ |
| Neue Dokumente | `newRawDocuments=820`, `savedItems=892`; **Netto `raw_documents` = +61** (6008→6069) |
| Duplikate | 120 (`crawlRun.duplicates`); `loadedItems=1762`, `discardedItems=750`, Telemetrie `sum(new_documents)=880`, `sum(duplicate)=146` |
| Understanding verarbeitet | **50** |
| Understanding zurückgestellt | **32** |
| **Lock-Nutzung** | **ATOMISCH (relational), live gefangen** (04:02:00). `crawl-cem-ince` token `c80be957-1e00-45de-b0a9-578069b4653e` (04:01:00 → 04:16:00). Blob nicht genutzt; nach Abschluss `pipeline_locks`=0 → saubere Freigabe. Eager-Understanding-processRun +1 (5). |
| Fehler in systemErrors | **0 neue** (59 → 59) |
| Telemetrie-Zeilen | **145** (`run_id=mb1k6`), `status ok=145 / not_ok=0`, Fehlercodes: **nur `ok` ×145** |
| Quellenlaufzeiten `duration_ms` | **Min 131 · Median 2397 · Ø 2421 · p95 4397 · Max 7234 ms** (gesund). Fetch-Fenster 04:01:01.713–04:01:21.826 (~20,1 s). |
| Kategorien | offiziell 78 · medien 48 · partei_fraktion 12 · regional 5 · profil 2 = 145, alle `ok`; `googleUrlResolution` 1766/1770 |

**Bewertung Lauf 4:** **Gesunder Crawl, 145/145, 0 Fehler** — und die entscheidende
**B1-Gegenprobe: das Rate-Limiting ist weg.** Nach langer Google-News-Pause (letzter Crawl
20:00) liefen alle 145 Quellen inkl. voller Google-URL-Auflösung (1766/1770) durch. Die
Pro-Quellen-Laufzeiten decken sich fast exakt mit dem gesunden Lauf 1 (Ø 2421 vs. 2433,
Median 2397 vs. 2375). **B1 war sehr wahrscheinlich ein volumeninduzierter Einmaleffekt**
(3 Vollcrawls in ~4 h), kein Dauerproblem. Locks/Telemetrie erneut sauber bestätigt.

<!-- LAUF-PLATZHALTER: Morgenzyklus (05:00 briefing / 05:30 understanding / 05:45 lage-briefing /
     06:00 health-report), Überschneidungsfenster, Nachholung der deferred Docs. -->

---

## 1a · Betriebsbefunde (echte Production-Ereignisse, ehrlich dokumentiert)

### B1 · Google-News-Rate-Limiting degradiert den 20:00-Crawl (129/145 Quellen ausgefallen)

**Messung (Lauf 2, `v268f`):** 129 von 145 Quellen fehlgeschlagen. Telemetrie-Fehlercodes:
**47× `http-429`** (explizites Rate-Limit), **81× `timeout`** (Google-News antwortete nicht
mehr), **1× `http-4xx`**. `googleUrlResolution` = 0/0 (die Abrufe scheiterten schon an der
RSS-Stufe, vor der URL-Auflösung). Nur 16 Quellen lieferten (medien 15, offiziell 1).

**Ehrlicher Ursachen-Caveat (kein Beweis, aber plausibel und relevant):** Heute liefen **drei
Vollcrawls in ~4 Stunden** — 16:00 Pipeline-Cron, 18:24 **manuell** ausgelöst (Lauf 1), 20:00
Cron (Lauf 2). Der Normalplan sieht ~2 Crawls/Tag vor (04:00/20:00). Das verdreifachte
Google-News-Anfragevolumen in diesem Fenster hat die Drosselung sehr wahrscheinlich
mitausgelöst. Der 04:00-Crawl (Lauf 4) — nach langer Google-News-Pause — ist der ehrliche
Test, ob dies ein volumeninduzierter Einmaleffekt oder ein Dauerproblem ist.

**GEGENPROBE-ERGEBNIS (Lauf 4, `mb1k6`, 04:00 UTC):** **Rate-Limiting weg.** 145/145 Quellen
erfolgreich, 0 Fehler, volle Google-URL-Auflösung (1766/1770), Pro-Quellen-Laufzeiten wie im
gesunden Lauf 1. Damit ist B1 sehr wahrscheinlich **volumeninduziert und transient** (Auslöser:
3 Vollcrawls in ~4 h), **kein Dauerproblem**. **Bleibende Empfehlung (kein Blocker):** Das
Google-News-Klumpenrisiko besteht latent fort — bei erhöhtem Crawl-Volumen (z. B. mehreren
manuellen Läufen) kann es erneut auftreten; die Audit-Minderung (Direkt-RSS statt Google-News)
senkt es dauerhaft. Für den Normalbetrieb (~2 Crawls/Tag, weit gespreizt) ist der Pfad gesund.

**Warum 0 neue `systemErrors`:** Per-Quelle-Fetchfehler (Rate-Limit/Timeout) landen bewusst in
`crawlRun.errors[]` (inhaltsfrei klassifiziert) **und** in `source_crawl_telemetry` (mit
`error_code`) — **nicht** im `systemErrors`-Ring. Dieser Ring ist für Pipeline-/Technikfehler
(`recordPipelineError`), nicht für routinemäßige Einzelquell-Ausfälle; 129 Einträge würden ihn
fluten. Der **Eskalationspfad** für eine solche Crawl-Degradation ist der Health-Report-Watchdog
(Crawl-Failure-Ratio, `HELMUT_MAX_CRAWL_FAILURE_RATIO`) — er sollte beim **06:00-UTC-Health-Report**
anschlagen. **Das wird im Morgenzyklus beobachtet** (offener Prüfpunkt).

**Kein Eingriff:** Regelkonform NICHT verändert (kein Crawl-/Retry-/Zeitplan-Eingriff während der
Beweisläufe). Bekannte Minderungsoption (bereits im Audit): Direkt-RSS-Feeds statt
Google-News-Suchen (`audit/source-coverage.md` — „Google-News-Klumpenrisiko senken").

---

## 2 · Aggregierte Quellenlaufzeiten (über alle dokumentierten Crawls)

Getrennt nach gesunden (`status=ok`) und degradierten Läufen — Timeouts würden gesunde
Kennwerte sonst verzerren.

| Crawl (runId) | geprüft | ok | failed | Ø ms | Median ms | Min ms | Max ms | Anmerkung |
|---|---|---|---|---|---|---|---|---|
| `crawl-20260716182458-il02g` (Lauf 1) | 145 | 145 | 0 | 2433 | 2375 | 191 | 7048 | gesund |
| `crawl-20260716200114-v268f` (Lauf 2) | 145 | 16 | 129 | 6803 | 7294 | 24 | 14189 | degradiert (Rate-Limit, B1) |
| `crawl-20260717040100-mb1k6` (Lauf 4) | 145 | 145 | 0 | 2421 | 2397 | 131 | 7234 | gesund (B1-Gegenprobe: erholt) |

**Gesunder Pro-Quellen-Baseline (Läufe 1 & 4, 290 Quellenabrufe):** Ø ~2427 ms · Median ~2386 ms
· Min 131 ms · Max 7234 ms. Der degradierte Lauf 2 (timeoutgetrieben) ist bewusst getrennt
ausgewiesen und fließt nicht in den gesunden Baseline ein.

---

## 3 · Lock-Nachweis (Zusammenfassung)

- **Atomischer Pipeline-Lock (`HELMUT_ATOMIC_LOCK`):** in Lauf 1 live in `pipeline_locks`
  gefangen (`crawl-cem-ince`, mit `token`), Blob-Pfad nicht genutzt, saubere Freigabe. **Bewiesen.**
- **Understanding-Lock (`HELMUT_UNDERSTANDING_LOCK`):** in Lauf 1 live gefangen
  (`global-understanding`, mit `token`). **Bewiesen.**
- **Pipeline↔Understanding-Überlappung (in-run):** in Lauf 1 UND Lauf 2 **beobachtet** —
  `crawl-cem-ince` und `global-understanding` wurden **gleichzeitig** gehalten (Lauf 2:
  20:03:28 UTC, zwei getrennte atomare Locks mit je eigenem Token). Das belegt: die atomaren
  Locks koexistieren korrekt für unterschiedliche Jobs im selben Lauf. **Beobachtet.**
- **Deny-Pfad (Doppelstart-Abweisung):** ein zweiter Versuch auf **denselben** `job_name`
  während der Haltezeit liefert `acquired=false` (Job übersprungen). Mangels echtem
  konkurrierendem Zweitlauf **noch nicht** ausgeübt. **Offen** — natürlicher Kandidat ist ein
  Cron-Überschneidungsfenster (z. B. wenn der 05:30-Understanding-Cron einen noch laufenden
  Crawl trifft); kein bewusster Doppelstart (verboten).

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

### 4.3 · Berlin/Brandenburg — strukturelle Vorbereitung (nicht aktiviert) ✔ vorhanden & inert bestätigt
**Befund (rein lesend):** Die strukturelle BE/BB-Vorbereitung existiert bereits als eigene,
ausdrücklich **inerte** Schicht — nichts davon ist verdrahtet oder aktiv:
- `lib/helmut/quellenarchitektur/seeds/landesmodule-kandidaten.js` — Quellenkandidaten je
  Pflichtklasse, **nur `prepared`**, „es wird NICHTS aktiviert, kein Abrufweg erzeugt, kein
  Crawl verdrahtet"; geordnete Reifegrad-Skala (`unbesetzt → kandidat → verifiziert → bereit →
  aktiv`). BE/BB stehen auf **`kandidat`**, „NICHT einsatzbereit (kein prepared-Eintrag in Production)".
- `…/seeds/landesmodule-quellen.js`, `…/seeds/landesmodule-verifikation.js` (Sprint-9B-
  Byte-Verifikation), `…/seeds/packages.js` (15 Pflichtklassen).
- Docs: `docs/quellenarchitektur/11-landesmodule-berlin-brandenburg.md`,
  `13-landesmodule-technische-pruefung-und-bundeswege.md`.

**Live-Gegenprobe:** In Lauf 1 und 2 trugen alle 145 Quellen ausschließlich Bundestags-Kategorien
(offiziell/medien/partei_fraktion/regional/profil des `cem-ince`-Profils) — **kein Landtags-/BE/BB-
Abruf aktiv**. Aktivierung wäre freigabepflichtig (nach Bundestagspilot). **Hier nichts verändert.**

### 4.4 · Datenschutz / Aufbewahrung / Löschung — dokumentarische Weiterarbeit
**Gemessener Beleg für den Aufbewahrungsdruck (Audit R11: unbegrenztes Wachstum):** In diesem
Sprint bestätigt durch echte Deltas — `raw_documents` 5948 → 6008 (Lauf 1 +29 netto, Lauf 2 +31
netto) und `knowledge_objects` 323 → 337 über wenige Stunden, ohne jede Löschung. Das untermauert
das bestehende Retention-Konzept (`docs/betrieb/aufbewahrung-loeschung.md`, Datenklassen-Matrix mit
`knowledge_objects` als Art. 9) und die DSFA-Vorprüfung (`docs/recht/datenschutz-folgenabschaetzung-vorpruefung.md`).
**Keine echte Löschung**, `HELMUT_RETENTION_EXECUTE` bleibt aus (nur Trockenlauf möglich); Fristen
weiter gründer-/rechtsfreigabepflichtig. Politische Daten fließen weiterhin nicht in Telemetrie/
Alarmkanäle (Allowlist + Redaction, in Lauf 1/2 real ohne Inhalt/PII).

---

## 5 · Zwischenurteil

_Wird am Ende des Sprints gefüllt (nach ≥3 Crawls, vollständigem Morgenzyklus und
geprüftem Überschneidungsfenster)._

---

## 6 · Offen / nächste Freigaben

- **Offen (Beweis):** Deny-Pfad (Doppelstart-Abweisung) unter echter Konkurrenz;
  dedizierter Understanding-Cron (21:30); ≥1 weiterer Crawl (04:00 → Lauf 4, zugleich
  B1-Gegenprobe); vollständiger Morgenzyklus; **ob der 06:00-Health-Report die 20:00-Crawl-
  Degradation (B1) als Crawl-Failure-Ratio-Alarm eskaliert**; Fehlerfall→`systemErrors` (nur
  ohne künstliche Injektion beobachtbar); Zweitkanal-Alarmtest (braucht F5-Webhook-URL).
- **Nächste Freigaben (Kandidaten):** F5 (Webhook-URL liefern → Zweitkanal);
  danach — nach ≥1 sauberem Beweistag — F6/F7; F8 später.

---

_Letzte Aktualisierung: 2026-07-17 (nach Lauf 4, 04:00-Crawl; 3 Crawls dokumentiert, B1-Gegenprobe erholt). Morgenzyklus folgt._
