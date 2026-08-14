# OP-30-Zielarchitektur — Architektur- und Umsetzungssprint 2026-08-13

**Zweck:** kanonische Entscheidungs- und Belegdatei des Architektursprints für den
langfristig skalierbaren OP-30-Antrieb (5 → 25 → 100 → 200 → perspektivisch 500
Mandate **ohne erneuten Austausch des Fachkerns**). Production blieb während des
gesamten Sprints unangetastet; alle Production-Zugriffe waren rein lesend.

**Vorgeschichte in einem Satz:** Der zweite Fünferlauf-Versuch (Runbook
[`op30-aktivierung-5-mandate.md`](op30-aktivierung-5-mandate.md) §19) lief fehlerfrei,
fair und ohne Doppelarbeit — aber die Ankunft (~440–470 Aufträge/Tag bei n=5) übersteigt
den slotgebundenen Abfluss (~130–180/Tag) strukturell; der anschließende Kapazitätssprint
wurde **kontrolliert abgebrochen**, und seine geplante Zwischenlösung (Parallelität 6 +
sechs zusätzliche Drain-Slots) wurde **verworfen und hier nicht rekonstruiert**: mehr
Cron-Slots skalieren den Slot, nicht die Architektur (§4.1).

---

## 1 · Ausgangsstand (geprüft am 2026-08-13, rein lesend)

Alle 18 Vorprüfungen des Sprintauftrags §2 bestanden:

- Arbeitsbaum sauber; keine uncommitteten Reste des abgebrochenen Kapazitätssprints;
  die dort entstandenen ~160 Entwurfszeilen in `server.js` existieren nicht (nie
  committet, verworfen).
- PR #246 gemergt; `main` enthält `e83eb19`; Production-Deployments READY
  (`dpl_5Ktikubeezvj…` = Rücknahme-Redeploy 16:27 UTC; danach `dpl_7KMZaUfVSBmbLFDStS9TkHkEcyrE`
  = reiner Doku-Merge #246, READY 21:46 UTC, Commit `e83eb19`).
- `HELMUT_SCALABLE_PIPELINE` wirkungsbasiert aus (crawl 20:00 UTC lief vollständig über
  den Altpfad; `helmut_jobs` seit 16:07:11 UTC byte-unverändert — die Rücknahme war
  16:27 UTC, seitdem hat kein Prozess einen Auftrag angefasst).
- Warteschlange inert: **524 wartend · 235 erledigt · 0 laufend · 0 endgültig
  fehlgeschlagen · 0 Leases · 0 Reservierungen** (`llm_reservations` leer).
- Kein anderer freigabepflichtiger Production-Versuch aktiv.

## 2 · Evidenzklassen dieser Datei

| Klasse | Bedeutung | Kennzeichnung |
|---|---|---|
| **P** | in Production gemessen (zweiter Fünferlauf, Runbook §19; eigene Leseprüfungen 2026-08-13) | „P" |
| **L** | lokal getestet (echte PostgreSQL 16.13, echte Migrationen, echte SQL-Funktionen) | „L" |
| **S** | simuliert (Latenzen/Anbieter als Attrappen, Zeitraffung) | „S" |
| **R** | rechnerisch prognostiziert (Modell aus P-Messwerten) | „R" |
| **A** | Annahme (nicht gemessen; benannt, nie stillschweigend) | „A" |

Verbindliche P-Basiswerte: effektive Bedienzeit ~11 s/Auftrag, Median ~7 s; ~2.000
verfügbare gegen ~7.800 benötigte Worker-Sekunden/Tag bei n=5; Slotleistungen 65/30/31/54;
124 von 139 wartenden Verstehensaufträgen mit `verstehen-uebersprungen: understanding-locked`;
Dedupe produktiv (`neu=169 < geplant=193`); KI-Verbrauch 62–77 Aufrufe/Tag bei Deckel 100+30.
Die frühere lokale Aussage „4.093 Aufträge/s" beruhte auf Attrappen ohne reale Netz-,
Datenbank- und KI-Latenzen und ist **nicht** auf Production übertragbar (P, §19-Befund).

## 3 · Architekturvergleich (7 Varianten × 20 Kriterien)

Bewertet wurden die sieben Varianten des Auftrags. Anbieter-Fakten stammen ausschließlich
aus aktueller offizieller Dokumentation (Abruf 2026-08-13; Vercel-Doku-Suche,
Supabase-Doku, npm-README `@vercel/queue@0.4.0`); nichts wurde geraten.

**Anbieter-Faktenlage (Abruf 2026-08-13):**

- **Vercel Queues:** Public Beta seit 2026-02-27 (Trigger-Typ wörtlich `queue/v2beta`,
  Konfigfeld `experimentalTriggers`). At-least-once; „approximate ordering";
  Aufbewahrung Default 24 h, max. **7 Tage**; Dedupe per `idempotencyKey` über die
  Message-TTL. **Regionaler Ausfall: Nachrichten können temporär in eine NACHBARREGION
  verlagert werden — strikte Datenresidenz wird ausdrücklich nicht garantiert.** Preis
  $0,60 je 1 Mio. Operationen (4-KiB-Chunks; idempotencyKey/Max-Concurrency zählen 2×);
  Verfügbarkeit im Hobby-Plan nicht hart belegt. ⇒ Nutzung = kostenpflichtige
  **Gründerentscheidung**, in diesem Sprint nicht getroffen.
- **Vercel Workflow:** GA seit 2026-04-16, läuft auf Queues; koppelt Orchestrierungs-
  zustand an Vercel-Persistenz (eigene Preisachsen Events/Data Written/Retained).
- **Vercel Functions/Cron:** maxDuration Default 300 s (Hobby max. 300 s; Pro 800 s GA);
  100 Cron-Jobs/Projekt auf allen Plänen; Hobby-Cron nur 1×/Tag je Job und nur
  stundengenau.
- **Supabase Queues (pgmq):** GA (kein Beta-Label), läuft **in der bestehenden
  Projekt-DB** (eu-west-1), keine Zusatzkosten; `read_with_poll`-Longpoll; exactly-once
  nur innerhalb des Visibility-Timeouts (effektiv at-least-once). Grenze: Free-Plan-Compute
  (Nano: 0,5 GB RAM, empfohlene 500 MB DB, 60 direkte/200 Pooler-Verbindungen,
  7-Tage-Pausierung inaktiver Projekte).
- **GitHub Actions Cron:** min. 5 Minuten, offiziell dokumentierte Verzögerungen und
  mögliche **Drops** bei Hochlast — als alleiniger Wecker ungeeignet, als redundanter
  Zweitwecker brauchbar (der bestehende Watchdog belegt die Verzögerungen: oft 2–3 h).

**Bewertung (Kompaktform; ✓ gut · ○ tragbar/mit Auflagen · ✗ ungeeignet):**

| Kriterium | 1 Mehr Slots | 2 Eigener Dienst | 3 pgmq | 4 Vercel Queues + Supabase | 5 Vercel Workflow | 6 Externer Worker | 7 Outbox + austauschb. Transport |
|---|---|---|---|---|---|---|---|
| 5 Mandate | ○ | ✓ | ○ | ✓ | ○ | ✓ | ✓ |
| 25 Mandate | ○ | ✓ | ○ | ✓ | ○ | ✓ | ✓ |
| 100 Mandate | ✗ | ✓ | ○ | ✓ | ○ | ✓ | ✓ |
| 200 Mandate | ✗ | ✓ | ○ | ✓ | ○ | ✓ | ✓ |
| 500 Mandate | ✗ | ✓ | ○ | ✓ | ○ | ✓ | ✓ |
| Betriebsaufwand 1 Gründer | ✓ | ✗ | ✓ | ○ | ○ | ✗ | ✓ |
| Ausfallsicherheit | ○ | ○ | ✓ | ○ | ○ | ○ | ✓ |
| Datenschutz | ✓ | ✓ | ✓ | ○ (nur IDs) | ○ | ✓ | ✓ |
| Datenresidenz (EU) | ✓ | ✓ | ✓ | **✗ im Failover** | ✗ | ✓ | ✓ |
| Anbieterbindung | ✓ | ✓ | ○ | ✗ | ✗ | ✓ | ✓ |
| Kostenkontrolle | ✓ | ✗ | ✓ | ○ | ○ | ✗ | ✓ |
| Wiederholungen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Idempotenz | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rücknahmefähigkeit | ✓ | ✗ | ○ | ○ | ✗ | ○ | ✓ |
| Beobachtbarkeit | ○ | ○ | ○ | ○ | ✓ | ○ | ✓ |
| Deployment-Wechsel | ○ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kompatibilität Fachkern | ✓ | ✓ | ○ | ✓ | ✗ | ✓ | ✓ |
| Kein späterer Grundumbau | ✗ | ○ | ○ | ○ | ✗ | ○ | ✓ |
| Reifegrad des Dienstes | ✓ | ○ | ✓ | **✗ Beta** | ○ | ○ | ✓ |
| Globale Grenzen über Instanzen | ✗ | ○ | ○ | ○ | ○ | ○ | ✓ |

**Begründungen der Ausschlüsse:**

1. **Mehr Cron-Slots + Parallelität** skaliert linear den Slot, nicht die Architektur:
   bei 500 Mandaten (~4.500–4.900 Aufträge/Tag, §6) wären rechnerisch >30 Slots/Tag
   nötig, jeder blind zwischen den Slots, Weck-Latenz = Slottakt. Genau die verworfene
   Zwischenlösung des abgebrochenen Sprints — ausdrücklich nicht rekonstruiert.
2. **Eigener dauerhafter Worker-Dienst** löst die Rechenform ideal, ist aber für einen
   einzelnen Gründer eine neue Betriebs-, Patch- und Kostenfläche. Dank Variante 7 wird
   er später OHNE Fachkern-Änderung möglich (ein Verbraucher mehr) — heute nicht nötig.
3. **Supabase Queues/pgmq** wäre eine ZWEITE Warteschlange neben `helmut_jobs`:
   `helmut_jobs` IST bereits das dauerhafte, atomare Auftragsbuch (Claim, Lease,
   Idempotenz, Abhängigkeiten, Fairness). pgmq brächte nur Transportsemantik — löst aber
   das eigentliche Problem (WER weckt die Rechenleistung?) auf Vercel-Serverless nicht
   (pull-basiert). Als späterer Weckkanal bleibt es eine dokumentierte Option des
   austauschbaren Transports.
4. **Vercel Queues als primärer Transport JETZT:** Public Beta (`queue/v2beta`,
   `experimentalTriggers`), keine strikte EU-Residenz im Failover, kostenpflichtige
   Aktivierung (Entscheidungsgrenze!), Hobby-Verfügbarkeit unbelegt. Für ein Produkt,
   dessen Verkaufsblocker Rechts- und Sicherheitsreife sind (OP-01…OP-04), ist ein
   Beta-Transport ohne Residenzzusage die falsche erste Wahl. Der **Adapter existiert**
   (§9) — der Wechsel ist eine spätere Konfigurations-/Gründerentscheidung, kein Umbau.
5. **Vercel Workflow** machte den Workflow-Zustand zur zweiten Wahrheit über den
   Auftragsfortschritt — exakt was Regel „Kein Transportdienst wird zur Wahrheit"
   verbietet; Architektur zudem in Bewegung (4.1 „event-sourced" als Beta).
6. **Worker auf dem vorhandenen externen Server** ist als **Stufenoption ab ~100
   Mandaten** vorgesehen (§15): dieselbe Verbraucher-Route, nur ein zusätzlicher
   Aufrufer — heute unnötige Betriebsfläche.

## 4 · Entscheidung: das gewählte Zielbild

**Variante 7 — Supabase-Outbox + austauschbarer Transport**, exakt das bevorzugte
hybride Zielbild des Auftrags, mit einer belegten Abweichung: der **erste produktive
Transport ist der Selbstweck** (HTTP-Wecksignal an die eigene Verbraucher-Route),
nicht Vercel Queues (Begründung §3 Punkt 4 — nachweislich bessere Wahl nach Beta-Status,
Datenresidenz und Kostenpflicht; der Vercel-Queues-Adapter ist gebaut und dokumentiert).

Die zwölf Zusagen des Zielbilds, alle umgesetzt und getestet (L):

1. Supabase bleibt die verbindliche Daten- und Auftragswahrheit.
2. `helmut_jobs` bleibt das verbindliche Auftragsbuch (unverändert).
3. Die transaktionale Outbox (`helmut_job_outbox`, Migration `20260813090000_jobqueue_outbox`)
   speichert Versandabsichten **atomar gemeinsam** mit neuen Aufträgen
   (`helmut_enqueue_job_mit_outbox` = ein Funktionskörper = eine Transaktion).
4. Der Transport überträgt **ausschließlich** `{ jobId (zufällige uuid), schemaVersion }` —
   strukturell erzwungen: die Outbox **hat keine Inhaltsspalte**, und
   `pruefeTransportPayload` weist jedes andere Objekt hart ab (Laufzeit + Test).
5. Der Transport weckt Verbraucher ereignisgesteuert (`/api/cron/worker-weck`).
6. Der Verbraucher beansprucht Aufträge **atomar in Supabase** (`helmut_claim_jobs`).
7. Mehrfache Zustellung ist ungefährlich (der Claim ist die einzige Vergabewahrheit).
8. Der Abgleich (`helmut_outbox_abgleich`) veröffentlicht vergessene Versandabsichten
   erneut — Sicherheitsnetz, nicht der primäre Antrieb.
9. Der bestehende Cron-Worker bleibt vollständig erhalten (Rückfallweg, §12).
10. Kein Transportdienst wird zur Wahrheit über einen Auftragszustand.
11. Bei Transportausfall bleibt jeder Auftrag vollständig in Supabase (L: getestet).
12. Ein Transportwechsel ändert **keinen Fachhandler** (Quelltext-testgesichert:
    `jobdispatch-vertrag-test.js` §11).

**Betriebsmodi (genau EIN primärer Antrieb, `job-dispatch.waehleAntrieb`):**

| Antrieb | Konfiguration | Bedeutung |
|---|---|---|
| `bestand` | `HELMUT_SCALABLE_PIPELINE` aus | Alter Direktpfad (heutige Production) |
| `cron-queue` | Pipeline an, `HELMUT_JOB_DISPATCH_MODE` off/shadow | Cron-Slots sind der Antrieb (Versuch-3-Zustand; shadow beweist die Outbox nebenher) |
| `ereignis` | Pipeline an, Dispatch `queue` | Wecksignale sind der Antrieb; Crons bleiben Planer + Abgleich + Rückfall-Drain |

Widersprüchliche Konfiguration stoppt geschlossen: unbekannte Modi wirken als `off` und
werden benannt; die Verbraucher-Route antwortet außerhalb des Ereignis-Antriebs mit 409;
der Ereignis-Antrieb **verlangt** aktive Klassengrenzen (sonst keine Verarbeitung).
Alles Default-AUS; ungültige Werte fallen geschlossen auf `off` (fail closed, getestet).

## 5 · Arbeit vor dem Skalieren reduzieren (Auftrag §7)

**Was bereits kanonisch geteilt ist (P/L, belegt):**

1. **Geteilte Quellen laufen global genau einmal je Fenster.** Der OP-30-Compiler
   (`source-demand.js`) dedupliziert über die **normalisierte Abrufdefinition**
   (`source_fetch|geteilt|<url-hash>|<fenster>` — ohne Mandats-ID). Regierungs-,
   Fraktions-, Partei-, Ministeriums-, Ausschuss- und Themensuchen merkmalsgleicher
   Mandate kollabieren zu EINEM Auftrag (P: 354 von 365 wartenden Abrufen sind global;
   174 distinkte Quellen). Der Altpfad dedupliziert dagegen nur prozesslokal
   (`sharedFetchLedger`) — einer der Gründe, warum er nicht skaliert.
2. **Personensuchen höchstens 1×/24 h, Archivsuchen höchstens 1×/7 Tage** (Fenster im
   Idempotenzschlüssel; P: Fensterverteilung der 524 bestätigt genau das).
3. **Ein Rohdokument wird global genau einmal gespeichert** (`raw_documents` ohne
   Mandantenspalte; `content_fingerprint`-Dedupe → 1 Dokument + n Fundstellen).
4. **Ein Dokument wird global genau einmal verstanden** (`knowledge_objects`
   mandantenlos; Bestandskurzschluss ohne KI-Aufruf; Verstehens-Idempotenzschlüssel
   bewusst ohne Fenster).
5. **Je Mandat bleibt nur:** Personensuche (1 Quelle, 2 Feeds), KI-freie Projektion und
   Briefing-Materialisierung (je 2 Fenster/Tag), 1 Lage-Narrativ/Tag (einziger
   mandatsbezogener KI-Aufruf).

**Restliche Vervielfachung (ehrlich):** leere Projektions-/Briefingaufträge entstehen je
Mandat und Fenster auch ohne neue Daten (je 2/Tag; KI-frei, Sekundenarbeit). Eine
fensterübergreifende Vereinigung wäre möglich, veränderte aber den Frischevertrag
(OP-31) — **bewusst nicht angefasst**; bei 500 Mandaten sind das ~2.000 leichte
Aufträge/Tag (~2,5 h Worker-Sekunden gesamt), kein Engpass. Keine Entdoppelung dieses
Sprints verändert politische Sichtbarkeit, Quellenbelege oder Mandatsrelevanz — es gab
daher **keinen** zu stoppenden Teilschritt.

**Mengengerüst (R, verankert an P; Ankunftsmodell bewusst konservativ ÜBER der
Production-Messung — 599 modelliert vs. 440–470 gemessen bei n=5):**

| Mandate | Aufträge/Tag | davon global | je Mandat | Entdoppelung Planung | KI-Bedarf/Tag (R) | externe Abrufe/Tag |
|---|---|---|---|---|---|---|
| 5 | ~600 | ~570 (95 %) | ~6 | 50 % (Doppelplanung), produktiv `neu=169<193` | ~75 gemessen (P) · Modell ~160 | ~430 |
| 25 | ~780 | ~625 (80 %) | ~6 | dito | ~230 | ~450 |
| 100 | ~1.400 | ~790 (56 %) | ~6 | dito | ~470 | ~535 |
| 200 | ~2.100 | ~940 (45 %) | ~6 | dito | ~700 | ~650 |
| 500 | ~4.600 | ~1.550 (34 %) | ~6 | dito | ~1.230 | ~990 |

Ableitung: geteilte Abrufe konstant 420/Tag (140 kanonische Wege × 3 Fenster); Person
`n×8/7`; Verstehen inhaltsgetrieben und sättigend (Anker P: ~150 Bündel/Tag bei n=5;
Modellreihe `skalierungsmodell.js`); Projektion/Briefing `2n`; Narrativ `n`. **Arbeit je
einzigartigem Merkmal** (Fraktion/Ausschuss/Thema) steckt vollständig in den 420
geteilten Wegen; **zwingend je Mandat** bleiben nur Personensuche, Projektion, Briefing,
Narrativ; **vollständig global** sind Abruf geteilter Quellen, Speicherung und Verstehen.

## 6 · Das globale Understanding-Schloss (Auftrag §8)

Antworten auf die zehn Fragen, aus dem Quelltext belegt:

1. **Warum global gesperrt:** `runUnderstandingShadow`/`runPendingUnderstandingShadow`
   nehmen `acquireGlobalUnderstandingLock()` — EIN fixer Lockname `global-understanding`
   (storage.js), TTL 10 min; in Production aktiv (Flag `HELMUT_UNDERSTANDING_LOCK` +
   atomares Backend `HELMUT_ATOMIC_LOCK`/`pipeline_locks`). P-Befund: 124 von 139
   wartenden Verstehensaufträgen wurden deshalb zurückgestellt.
2. **Verhindertes Risiko:** Doppel-KI-Kosten. Die Idempotenzprüfung je Vorgang ist
   Read-then-Act (`resolveVorgang` liest → KI-Aufruf → Save): zwei überlappende Läufe
   sähen beide „kein KO" und bezahlten beide; der zweite Save überschriebe den ersten.
   Sekundär: Read-Modify-Write-Races auf dem Update-Vormerkungs-Store (Auth-Store,
   Voll-Upsert).
3. **Muss der Schutz global sein? Nein.** Das Schutzgut ist „ein KI-Aufruf je NEUEM
   Vorgang" — eine Eigenschaft des Vorgangs, nicht des Systems.
4. **Engere Fassung:** je **Vorgang** (Cluster). Batch-/Kostenreservierungs-Ebene ist
   bereits DB-atomar (`llm_reservations` je Bündel; `helmut_reserve_llm_call` je Aufruf).
5. **Zwei Worker, verschiedene Dokumente:** sicher — mit der Vorgangswache exklusiv je
   Vorgang, parallel über Vorgänge (L: `understanding-konkurrenz-test.js` §5,
   `verteilte-grenzen-datenbank-test.js` §7).
6. **Doppelte KI-Aufrufe verhindert:** Vorgangswache (atomare DB-Belegung
   `verstehen-vorgang:<id>`, max 1, vor dem Modellaufruf; Freigabe erst NACH der
   Persistenz) + Bestandskurzschluss + result_key-idempotente Budgetreservierung.
7. **Globaler Tagesdeckel atomar:** bereits datenbankgestützt — `helmut_reserve_llm_call`
   (INSERT..ON CONFLICT..WHERE, Migration 20260717) am einzigen Modell-Callsite plus
   `helmut_reserve_llm_result` (Row-Lock auf der globalen Tageszeile serialisiert alle
   Reservierer UND den Choke-Point, R4-Regel „ein Buch, ein Schreiber"). Instanzzahl
   ändert daran nichts.
8. **Bereits Verstandenes erkennen:** Bestandskurzschluss über verknüpfte Dokumente
   (`duplicate` ohne Modellaufruf) — der zweite Verarbeiter desselben Vorgangs zahlt
   nichts (L: §6 der Konkurrenz-Suite).
9. **Absturz nach KI-Aufruf vor Persistenz:** Dokumente bleiben unverknüpft
   (Nachholkandidaten), die Budget-Reservierung bleibt konservativ verbraucht (kein
   Zurückdrehen — die Kosten sind entstanden); der Wiederholungslauf zahlt über den
   result_key nicht doppelt; der Wache-Slot heilt per TTL. Der zweite tatsächliche
   Modellaufruf des Wiederholungslaufs bleibt möglich und wird vom Tagesdeckel begrenzt —
   die bewusste konservative Linie des Bestands (dokumentiert seit 20260808).
10. **Wiederaufnahme ohne Doppelergebnis:** Verknüpfungsinvariante + `duplicate`-Kurzschluss
    + idempotenter Tagescache der Briefings (unverändert).

**Die kleinste sichere Ablösung (umgesetzt):** die **Vorgangswache** —
`storage.vorgangsWache()` (Flag `HELMUT_VERSTEHEN_KONKURRENZ`, Default AUS, fail closed;
nicht prüfbare Wache erlaubt NICHTS) als `deps.clusterWache` in `understanding.defaultDeps`.
Sie wirkt in BEIDEN Pfaden (Cron-Nachhollauf UND Warteschlange). Im Warteschlangenpfad
ersetzt sie mit gesetztem Flag das globale Schloss für diesen Lauf; die verteilte Klasse
`verstehen` (Default max 1 = heutige Serialisierung, ehrlich verteilt) steuert die
Parallelität. **Restliche Migration vor Parallelität > 1:** der Update-Vormerkungs-Store
(Auth-Store, Voll-Upsert) braucht bedingtes Schreiben (CLAUDE.md §4.10) — dokumentiert,
nicht Teil dieses Sprints; bis dahin bleibt `HELMUT_KLASSE_VERSTEHEN_MAX=1` verbindlich.

## 7 · Transaktionale Outbox (Auftrag §9)

Migration [`20260813090000_jobqueue_outbox.sql`](../../supabase/migrations/20260813090000_jobqueue_outbox.sql)
(+ vollständiges Rollback). Kernpunkte:

- Genau EINE Versandabsicht je Auftrag (`unique(job_id)`, FK `on delete cascade` — die
  Neutralisierung räumt Absichten mit); Auftrag+Absicht entstehen in EINER Transaktion;
  ein erzwungener Fehler lässt **keinen halben Zustand** (L: §3 der Outbox-Suite).
- Zustandsmodell `offen → versendet → bestaetigt | aufgegeben | verzichtet`; Versuche,
  letzter bereinigter Fehler und nächster zulässiger Versuch sind Spalten; Backoff
  deterministisch `least(30 min, 30 s · 2^attempts)`.
- Ein Versandfehler berührt **nie** den fachlichen Auftrag; `aufgegeben` gibt nur den
  VERSAND auf, nie den Auftrag (Cron-Drain + Abgleich tragen weiter).
- Terminale Aufträge erzeugen keine Absicht (`versandabsicht='keine'`) bzw. werden vom
  Abgleich auf `verzichtet` geschlossen — keine wirksame neue Verarbeitung.
- **Keine Payload-Spalte existiert** — die Datenschutzgrenze ist strukturell
  (Spaltensatz testgesichert).
- Versandreife ist an die **Fälligkeit des Auftrags** gekoppelt (kein Weckruf für
  Arbeit, die niemand beanspruchen darf).
- RLS an+erzwungen, keine Policy, `anon`/`authenticated` entzogen, alle Funktionen
  SECURITY INVOKER mit festem `search_path` (L: §2).
- **Aufbewahrung/Bereinigung:** Absichten hängen per FK an ihren Aufträgen; die
  bestehende, von keinem Cron aufgerufene `helmut_prune_jobs` (erledigte > N Tage)
  räumt sie kaskadiert mit. In diesem Sprint wird **keine** Bereinigung aktiviert.

Nachweise: `jobqueue-outbox-datenbank-test.js` **37 PASS** an PostgreSQL 16.13 ·
Mutationsprobe `outbox-mutationsprobe.js` **6/6 Mutationen erkannt** (skip locked ·
unique · Terminal-Prüfung · Backoff · Statusbindung · Fälligkeitsfilter).

## 8 · Austauschbarer Transport (Auftrag §10) und Verbraucher (§11)

> **Sicherheitskorrektur 2026-08-14 (§17):** Weckziel-Vertrauensanker (CRON_SECRET nie an
> ungeprüfte Ziele), Türklingel-Bündelung (ein Weckruf je Versandkontext),
> Timeout=unbestätigt, vollständige Signalprüfung der Verbraucher-Route (400/409) und
> Slot-Freigabe vor der Folgeklingel. §17 ist die maßgebliche Beschreibung des
> Transportverhaltens, wo es von diesem Abschnitt abweicht.

Modul [`lib/helmut/job-dispatch.js`](../../lib/helmut/job-dispatch.js):
`HELMUT_JOB_DISPATCH_MODE = off | shadow | queue` (jeder andere Wert = `off`).
`off` erzeugt nichts; `shadow` beweist Auftrag+Outbox+Versandplanung ohne dass irgendetwas
den Prozess verlässt; `queue` versendet über `HELMUT_JOB_TRANSPORT`:

- **`selbstweck` (erster produktiver Transport):** POST auf `HELMUT_WORKER_WAKE_URL`
  (die eigene Route `/api/cron/worker-weck`), autorisiert mit dem bestehenden
  `CRON_SECRET` (Bearer, `authorizeCron`). Kein neuer Dienst, kein neuer Anbieter,
  keine neuen Kosten, keine Daten verlassen die bestehende Vercel↔Supabase-Strecke.
  Verlorene Signale repariert der Abgleich.
- **`vercel-queues` (gebaut, NICHT aktiviert):** Adapter nach offizieller SDK-Signatur
  `send(topic, payload, { idempotencyKey })`; ohne installiertes SDK fail closed mit dem
  Grund „Aktivierung = kostenpflichtige Gründerentscheidung". Beta-Fakten in §3.
- Unbekannte Transportnamen: fail closed, kein stiller Rückfall.

**Verbraucher `/api/cron/worker-weck`** erfüllt die 15 Eigenschaften des Auftrags §11:
Nur-ID-Payload (Riegel an jedem Signal) · atomare erneute Beanspruchung in Supabase ·
mehrfache Zustellung wirkungslos · keine Bestätigung vor belegtem Datenbankabschluss
(`helmut_finish_job` ist der einzige Abschluss) · kontrollierte Wiederholung (Outbox-
Backoff) · terminale Behandlung (aufgegeben, sichtbar) · sichtbare Zustellzählung
(`attempts`, Kennzahlen) · Lauftelemetrie (`[cron/worker-weck]`-Logzeile + JSON-Bilanz) ·
Rücknahme auf `off` ohne Datenverlust (L) · kein Vertrauen auf Reihenfolge, Exactly-once
oder unbegrenzte Aufbewahrung (die Outbox ist die Versandwahrheit) · keine politischen
Inhalte in Headern/Logs/Fehlern · Schema-Versions-Schutz (neuere Version wird NIE
verarbeitet; der Abgleich stellt nach dem Deployment-Wechsel erneut zu) · keine
Verarbeitung durch zwei primäre Modi (409 außerhalb `ereignis`; Drain-Lease Klasse
`worker-drain`, Default max 1). Die Weck-Kette trägt sich über die Folgeaufträge selbst
und stirbt ohne Fortschritt aus (bestätigte Absichten werden erst nach Mindestalter
wieder geöffnet).

## 9 · Verteilte Anbietergrenzen (Auftrag §12)

Migration [`20260813090100_verteilte_grenzen.sql`](../../supabase/migrations/20260813090100_verteilte_grenzen.sql):
Semaphor mit ablaufenden Slots, atomar über Row-Lock auf der Klassen-Ankerzeile (dasselbe
R4-Muster wie die Budget-Reservierung). Flag `HELMUT_KLASSEN_GRENZEN` (Default AUS);
fail closed in beide Richtungen (nicht prüfbare Grenze = nicht arbeiten).

| Arbeitsklasse | heutige Grenze | Zielzustand | Geltung |
|---|---|---|---|
| Quellenabruf | prozesslokal (Worker 1–8) | Klasse `quellenabruf` max 5 (DB) — im vertikalen Pfad umgesetzt | global |
| Google-Auflösung | prozesslokal (Gate 5 parallel, 200 ms Abstand) | vom `quellenabruf`-Slot mit abgedeckt (jede Personensuche läuft im Slot); feinere eigene Klasse dokumentierte Option | je Anbieter, global |
| Dokumentverständnis | globales Schloss (alles seriell) | Klasse `verstehen` max 1 (heutige Semantik, verteilt) + Vorgangswache für >1 | global |
| OpenAI/Azure-Aufrufe | **bereits DB-atomar**: `helmut_reserve_llm_call` + `llm_reservations` (Tagesdeckel 100+Reserve 30, fail closed) | unverändert — instanzsicher | global + je Mandat (`scopeMax`) |
| Projektion / Briefing | KI-frei, DB-gebunden | keine eigene Klasse nötig (Engpass ist die DB, s. u.) | — |
| Push-Versand | idempotenter Tagescache je Mandat (OP-31) | unverändert (1 Push je Mandat/Tag strukturell) | je Mandat |
| Blob-Speicherung | gebündelte Writes (F-RT-Fix) | unverändert; Transport transportiert ohnehin keine Inhalte | global |
| Datenbankverbindungen | psql/REST je Prozess | Verbraucherzahl × Stapel gedeckelt über `worker-drain`-Klasse (max 1–4) — bleibt weit unter Supabase-Free-Grenzen (60 direkt/200 Pooler) | global |
| Zukünftiger Mandantendeckel | `HELMUT_TENANT_LLM_CAP` gebaut (OP-03, aus) | hängt am bestehenden Budget-Gate — unberührt | je Mandat |

Fairness zwischen Mandaten liefert weiterhin der Tagesplan (`llm-budget-fair`, Rotation);
ein einzelnes Mandat kann andere nicht verdrängen (Bedienreihenfolge `due_at` +
Mandatsanteil `scopeMax`). Ausfall der Begrenzungslogik stoppt geschlossen (fail closed,
getestet). Nachweise: `verteilte-grenzen-datenbank-test.js` **20 PASS** (echte
Nebenläufigkeit: 8 gleichzeitige Beleger, max 3 → genau 3; TTL-Selbstheilung;
Vorgangswachen-Muster).

## 10 · Abhängigkeiten und Aufwecken (Auftrag §13)

Unverändert gültig: Abruf → Verstehen → Projektion → Briefing über Phasenfenster +
echte SQL-Zählung (`helmut_jobs_offen`, Fensterliste seit O3); endgültige Fehler zählen
nicht als offen (kein ewiges Warten); Wartefrist-Obergrenzen (O4) bleiben. Neu: ein
abgeschlossener Auftrag erzeugt seine Folgeaufträge **atomar mit Versandabsicht** —
die Weckkette folgt der Abhängigkeitskette. Kein Vertrauen auf Queue-Reihenfolge
(der Claim ordnet nach Priorität/Fälligkeit); fehlende Wecksignale repariert der
Abgleich (Sicherheitsnetz, nicht Antrieb); kein zweites Ergebnis und kein zweiter Push
bei mehrfacher Zustellung (Claim-Atomarität + OP-31-Tagescache; L: Lastnachweis).

## 11 · Bestehender Worker als Rückfallweg (Auftrag §14)

Nichts wurde entfernt. Der Rückweg ist per Konfiguration und **ohne Datenmigration**:
`HELMUT_JOB_DISPATCH_MODE` löschen/`off` ⇒ Antrieb `cron-queue`; zusätzlich
`HELMUT_SCALABLE_PIPELINE` off ⇒ `bestand`. Offene Aufträge bleiben unangetastet in
`helmut_jobs`; offene Versandabsichten bleiben folgenlos liegen (kein Verbraucher).
Der Rollback der neuen Migrationen entfernt ausschließlich Outbox/Klassen — `helmut_jobs`
bleibt byte-unberührt (L: §12 der Outbox-Suite).

## 12 · Lokaler Architektur- und Lastnachweis (Auftrag §16)

`scripts/skalierung-lastnachweis-test.js` — echte PostgreSQL 16.13, echte Migrationen,
Latenzen aus P-Messwerten (11 s Mittel, Median 7 s; Personensuche ~30 s; Verstehen ~20 s;
Narrativ-Median 5 s), Zeitraffung 1:400 (einstellbar), alle Störszenarien je Stufe
(doppelte Planung, Timeouts, drei Absturzklassen, Lease-Ablauf, mehrfache Zustellung,
Transportausfall, fehlendes Wecksignal + Abgleich, Deployment-Wechsel, abhängige
Aufträge, ungleiche Mandate, Klassengrenze, KI-Deckel, Cron-Rückfall, Payload-Riegel).

**Er ist ausdrücklich ein LOKALER Architektur- und Lastnachweis — kein Production-Beweis
für 25, 100, 200 oder 500 Mandate.**

Ergebnisse (S/R; Details im Suitenlauf, PR-Beschreibung trägt die Zahlen):

| Mandate | Aufträge (inkl. Folge) | erledigt | verloren | doppelte Arbeit | Bedarf ws/Tag | Reserve (R)* |
|---|---|---|---|---|---|---|
| 5 | 622 | 622 | 0 | 0 | 8.105 | ×21,3 |
| 25 | 788 | 788 | 0 | 0 | 9.995 | ×17,3 |
| 100 | 1.396 | 1.396 | 0 | 0 | 16.780 | ×10,3 |
| 200 | 2.177 | 2.177 | 0 | 0 | 25.250 | ×6,8 |
| 500 | 4.301 | 4.301 | 0 | 0 | 46.250 | **×3,7** |

\* Reserve = rechnerisches Angebot (8 Verbraucher, konservativ 25 % des Tages aktiv =
172.800 ws/Tag) ÷ Bedarf. Das 500er-Modell trägt die erwartete Last mit **mehr als
doppelter** rechnerischer Reserve — als Modell, nicht als Beweis.

**Ehrliche Grenzen des 500er-Modells:**

1. **KI-Bedarf ~1.200+ Aufrufe/Tag ≫ Production-Tagesdeckel 100 (+30).** Die Anhebung
   ist eine gesonderte Gründerentscheidung (Kosten ~4–6 USD/Tag bei 200er-Modellwerten);
   sie ist **kein** Architekturproblem und wird in diesem Sprint nicht vorgenommen.
   Für 5 Mandate reicht der heutige Deckel nachweislich (P: 62–77/Tag).
2. Google-Drosselung ist simuliert; die reale Rate bei ~570 Personensuchen/Tag ist
   unbewiesen (OP-15 — dort bereits als Blocker ab ~10 Mandaten beziffert; hier nicht
   nebenbei repariert).
3. 490+ echte Profile existieren nicht (A); Latenzen sind aus n=5 extrapoliert.
4. Supabase-Free-Plan (Nano-Compute, 500 MB, 60/200 Verbindungen) ist nicht Teil des
   Modells; ab ~100 Mandaten ist Supabase Pro eine eigene Betreiberentscheidung
   (deckt sich mit OP-01).

## 13 · Die 524 inerten Aufträge (Auftrag §17; rein lesend erhoben)

- **Je Typ:** 365 `source_fetch` (354 global geteilt, 10 `person-archiv`, 1
  `person-aktuell`) · 139 `document_understanding` (alle global) · 10
  `mandate_projection` · 10 `briefing_materialization` (je 5 Mandate × 2 Fenster).
- **Je Mandat:** 493 global (kein Mandat); 31 mandatsgebunden, 6–7 je Mandat — keine
  Schieflage.
- **Alter/Wartezeit:** Median 15,6 h, Maximum 26,4 h (im ausgeschalteten Zustand
  bedeutungslos); 29 mit Fälligkeit in der Zukunft (Zurückstellungen).
- **Versuche/Fehler:** fast alles unberührt (Ø 0,03 Versuche); 124× dokumentiertes
  `verstehen-uebersprungen: understanding-locked`, 11× Slotende-Zurückstellung, 3
  Einzel-Timeouts, 1 Storage-Timeout — keine unbekannte Fehlerklasse.
- **Vorbedingungen:** die 20 Projektions-/Briefingaufträge warten korrekt auf ihre
  Fenster; die Verstehensaufträge referenzieren 1.556 distinkte Rohdokumente, davon
  1.551 vorhanden und **0 bereits geclustert/verstanden** — echte offene KI-Arbeit,
  kein wiederverwendbarer Anteil auf Vorgangsebene (P, direkt gemessen; die frühere
  „300–450 KI-Aufrufe"-Schätzung bleibt damit Größenordnung, nicht Beweis).
- **Idempotenzschlüssel:** vertragskonform (`source_fetch|geteilt|<hash>|<fenster>`,
  `document_understanding|<bündelhash>` ohne Fenster, `<typ>|<mandat>|<fenster>`).
- **Wiederverwendbarkeit unter der Zielarchitektur:** die Schlüssel sind unverändert
  gültig; ein Abgleich würde ihnen Versandabsichten geben. ABER: die Fetch-Fenster sind
  abgelaufen (neue Fenster = neue Aufträge beim nächsten Planen), und die
  Verstehensschlüssel ohne Fenster würden nach einer Neutralisierung beim nächsten
  Abruf inhaltsgleich neu entstehen — **kein Datenverlust durch Neutralisierung**.
- **Risiko doppelter Ergebnisse:** keins — Verstehen ist über Bestandskurzschluss und
  Budget-Idempotenz geschützt; Briefings über den Tagescache.
- **Eignung des Neutralisierungsverfahrens:** das bewiesene Muster (Runbook
  §17.8/§17.10: Export mit Prüfsumme → geschützte Löschung → 31-PASS-belegter Rückweg)
  passt unverändert; die Outbox-Migration ändert daran nichts (FK-Kaskade räumt künftige
  Absichten mit). **Empfohlener Betreiberablauf vor Versuch 3:** Export + Neutralisierung
  der 524 nach §17.8; keine Reaktivierung (die Arbeit entsteht fensterfrisch neu).
  In diesem Sprint wurde **kein** Auftrag verändert, exportiert, gelöscht oder
  reaktiviert.

## 14 · Stufenplan (ersetzt „mehr Slots", je Stufe eigene Betreiberfreigabe)

| Stufe | Mandate | Konfiguration (zusätzlich zur vorigen) | Voraussetzung / Nachweis |
|---|---|---|---|
| 0 (heute) | 5 | alles aus (`bestand`) | — |
| 1 | 5 | Migrationen `20260813` beide anwenden · `HELMUT_SCALABLE_PIPELINE=on` · `HELMUT_JOB_DISPATCH_MODE=shadow` | Versuch 3 nach Runbook §6/K0 (vorher: 524 neutralisieren, §8.3/§8.4 queue-tauglich); Outbox-Beweis im Schattenmodus |
| 2 | 5 | `HELMUT_KLASSEN_GRENZEN=on` · `HELMUT_JOB_DISPATCH_MODE=queue` (+`HELMUT_WORKER_WAKE_URL`) | Abfluss ≥ Ankunft über 7 Tage; 0 Verlust/Doppelarbeit; Wartezeit < 24 h dauerhaft |
| 3 | 25 | `HELMUT_LLM_FAIRNESS=on` · `HELMUT_KLASSE_WORKER_DRAIN_MAX=2` | OP-25 vollständig NEU bestanden (Pflicht nach jeder OP-30-Aktivierung); 20 echte Profile |
| 4 | 100 | `HELMUT_VERSTEHEN_KONKURRENZ=on` + `HELMUT_KLASSE_VERSTEHEN_MAX=2` (erst nach CAS-Migration des Vormerkungs-Stores, §6) · KI-Deckel-Entscheidung (~500/Tag) · Supabase Pro (OP-01) | OP-15 strukturell gelöst (Direkt-RSS) — dort beziffert als Blocker ab ~10 Mandaten |
| 5 | 200 | `HELMUT_NARRATIV_QUEUE=on` · Drain 4 | 190 echte Profile; R4-Gegenprobe in Production |
| 6 | 500 | externer Worker ODER Vercel-Queues-Adapter (Gründerentscheidung; reine Konfiguration) · KI-Deckel ~1.500/Tag | erneuter Lastnachweis mit echten Zahlen je Stufe davor |

Jeder Rückweg: Konfiguration zurück, kein Datenverlust, keine Datenmigration (§11).

## 15 · Migrationsplan der restlichen Auftragstypen

Der vertikale Pfad (Abruf → atomare Outbox → Wecksignal → atomarer Claim →
Klassengrenze → Fachhandler → Persistenz → Abschluss → Folgeauftrag mit neuer Absicht)
ist für `source_fetch` → `document_understanding` vollständig verdrahtet und
nachgewiesen. Weil die Enqueue-Weiche (`standardEnqueue`) an EINER Stelle sitzt, laufen
`mandate_projection`, `briefing_materialization` und `tenant_narrative` bereits heute
über dieselbe Outbox — **es bleibt keine Typ-Migration offen**; offen bleiben nur die
dokumentierten Betriebsschritte (§14) und die CAS-Härtung des Vormerkungs-Stores (§6)
vor Verstehens-Parallelität > 1.

## 16 · Genauer nächster Betreiberablauf

1. Diesen PR reviewen; Merge-Empfehlung siehe PR (Merge ändert Production nicht —
   alles Default-AUS, Migrationen werden nie automatisch angewendet).
2. Entscheidung Versuch 3 (Runbook §19.6): vorher 524 neutralisieren (§17.8) und
   §8.3/§8.4 queue-tauglich fassen.
3. Bei Freigabe Stufe 1: beide `20260813`-Migrationen anwenden (Verifikationsblöcke in
   den Dateien), dann Flags nach §14 Stufe 1.
4. `HELMUT_WORKER_WAKE_URL` (Production-URL + `/api/cron/worker-weck`) erst für Stufe 2.
5. Getrennt und ausdrücklich NICHT Teil dieses Sprints: KI-Deckel-Anhebung, Vercel
   Queues/Supabase Pro (Kosten), OP-15.

---

## 17 · Sicherheitskorrektur 2026-08-14 (gezielter Korrektursprint, PR #247)

Vier vom Gründer beauftragte Punkte; alle Befunde wurden **bestätigt**, korrigiert und mit
Regressionstests belegt. Production blieb erneut vollständig unangetastet.

### 17.1 Eingehendes Wecksignal wird vollständig geprüft (Befund bestätigt)

**Ursache:** Die Route `POST /api/cron/worker-weck` las nur locker `body.schemaVersion`
(`!= null`) — ein Signal **ohne** `schemaVersion`, mit Zusatzfeldern oder mit beliebiger
Nicht-UUID als `jobId` passierte die Eingangsprüfung.
**Korrektur:** Direkt nach der Autorisierung erzwingt die Route jetzt **denselben zentralen
Payload-Vertrag wie der Versand** (`jobDispatch.pruefeTransportPayload`): exakt
`{ jobId: <uuid>, schemaVersion: <int> }`; fehlende Felder, Zusatzfelder, ungültige UUIDs
und falsche Typen → **400, geschlossen**. Nicht unterstützte Schemaversionen sowie
falscher Antrieb / fehlende Klassengrenzen → **409** (definitiver Fehlversuch beim Sender;
die Absicht bleibt offen). Nur „Drain belegt" bleibt bewusst 2xx (Klingel zugestellt, ein
aktiver Verbraucher arbeitet; Rest fängt der Abgleich).
**Beleg (L):** `scripts/worker-weck-route-test.js` — 21 PASS am echten server.js-Handler,
inkl. Reihenfolgebeweis (Payload-Prüfung vor Antriebsprüfung) und Vertragsgleichheit
Sender ↔ Empfänger.

### 17.2 CRON_SECRET kann nicht mehr an fremde Ziele gesendet werden (Befund bestätigt)

**Ursache:** Der Selbstweck sendete `Bearer CRON_SECRET` an **jede** in
`HELMUT_WORKER_WAKE_URL` konfigurierte Adresse — beliebiger Host (auch `http://`),
beliebiger Pfad, Query, Fragment, Zugangsdaten in der URL.
**Korrektur:** `pruefeWeckZiel` verriegelt das Ziel **vor** jedem Versand: nur HTTPS, exakt
`/api/cron/worker-weck` (nach URL-Normalisierung — Traversal fällt durch), kein Userinfo,
kein Query, kein Fragment, kein expliziter Port, und der Host muss einem **von der
Plattform gesetzten** Deployment-Host entsprechen (`VERCEL_PROJECT_PRODUCTION_URL` /
`VERCEL_URL` / `VERCEL_BRANCH_URL` — reservierte Systemvariablen, kein freier
Operator-Text; ein bloßes `*.vercel.app`-Suffix genügt ausdrücklich NICHT, denn dort
deployt jeder Vercel-Kunde). Versendet wird immer die kanonisch neu gebaute URL. Ohne
Vertrauensanker (z. B. lokal) ist der Transport geschlossen nicht verfügbar — das Secret
verlässt den Prozess in keinem Abweichungsfall.
**Beleg (L):** 16 adversariale Weckziele in `scripts/jobdispatch-vertrag-test.js` §5.6
(fremder Host, `angreifer.vercel.app`, Zugangsdaten, Traversal, Query, Fragment, Port,
IP, Präfix-Fälschung, …) — jeweils mit hartem Beweis **0 Netzaufrufe**.

### 17.3 Aufrufverstärkung beseitigt: Türklingel-Bündelung + Timeout-Semantik (Befund bestätigt)

**Ursachen (zwei):**
1. **Verschachtelte Aufrufkette:** ein Wecksignal je Absicht (bis 20 pro Kontext), und der
   Weck-Handler wartete auf seine Folge-POSTs, deren Empfänger je bis 60 s drainen und
   selbst weiterversenden — bei Rückstand stapelten sich Dutzende gleichzeitig offene
   Funktionsaufrufe (mit den 524: Kettentiefe > 50).
2. **Timeout-Fehlklassifikation:** Sender-Timeout 5 s < Empfänger-Antwortzeit (Drain bis
   60 s vor der Antwort) → fast jeder Versand galt als gescheitert → bis zu 10 Wieder-
   holungen je Absicht (Backoff bis `aufgegeben`) trotz erfolgreicher Drains — Verstärkung
   UND stille Verzögerung zugleich.
**Korrektur (drei Bausteine):**
1. **Bündelung** (`transport.buendelt`): GENAU EIN Weckruf je Versandkontext für alle
   gerade fälligen Absichten — der Verbraucher beansprucht Arbeit ohnehin nur atomar in
   der Datenbank, nie aus dem Payload. 2xx bestätigt alle gebündelten Absichten; eine
   echte Fehlerantwort verbucht alle als Fehlversuch.
2. **Timeout = unbestätigt:** ein Abbruch nach dem Absenden verbucht NICHTS (die Vergabe
   trägt Versuchszähler + Backoff bereits; erledigte Aufträge räumt der Terminal-/
   Abgleichpfad). Das ist exakt der bereits getestete Dispatcher-Crash-Pfad (§7 der
   Outbox-Suite) — kein Auftrag und keine Outbox-Wahrheit gehen verloren.
3. **Slot-Freigabe vor der Folgeklingel:** der Weck-Handler gibt den `worker-drain`-Slot
   frei, BEVOR er Abgleich + höchstens einen Folge-Weckruf sendet, und wartet auf die
   Folgeklingel höchstens `HELMUT_WAKE_TIMEOUT_MS` (Default jetzt 3 s) — nie auf den
   Drain des Nächsten. Ein abgewiesener Handler (400/409/belegt) versendet nichts.
**Beweisrechnung (R, aus P-Messwerten):** gleichzeitig offene Weckvorgänge ≤ 1 notwendiger
Drain (DB-Klasse `worker-drain` max 1) + Antwortfenster ≤ 3 s der jeweils vorigen
Invocation — keine Verschachtelung, kurzzeitige Überlappung ≤ 2. Tagesvolumen im
500er-Modell: 46.250 ws ÷ 60-s-Bursts ≈ **~770 Weck-Drains/Tag** + ≈ 215 gebündelte
Klingeln (4.301 Absichten ÷ Bündel 20) + 11 Cron-Klingeln ≈ ~1.000 Funktionsaufrufe/Tag —
dieselben Worker-Sekunden, die der Cron-Pfad ohnehin bräuchte, nur ereignisgesteuert
verteilt; bei n=5 ≈ 135 Bursts/Tag. Wiederholungen sind je Absicht durch `max_attempts=10`
und 30-min-Backoff-Deckel begrenzt; ohne Fortschritt stirbt die Kette (keine fälligen
Absichten → keine Klingel).
**Beleg (L):** `jobdispatch-vertrag-test.js` §5.5/§7.6–7.9 (5 Absichten → genau 1
Netzaufruf; Timeout verbucht nichts; leere Outbox klingelt nie).

### 17.4 Migrationsorganisation korrigiert — mit CLI-Nachweis (Befund bestätigt, gravierend)

**Ursache:** Die beiden neuen Migrationen teilten sich den 8-stelligen Tagesstempel
`20260813`, und die Rollback-Skripte lagen CLI-lesbar daneben (Altkonvention des Repos).
**Empirischer Nachweis (L, Supabase CLI 2.114.0, frische lokale PostgreSQL 16.13):**
- **Altkonvention:** `supabase db push --dry-run` listete **alle vier** Dateien als
  anzuwendende Migrationen — beide Rollbacks eingeschlossen. Der echte Lauf wendete die
  Outbox-Vorwärtsmigration an, führte **danach ihr Rollback als Vorwärtsmigration aus**
  (Objekte wieder gelöscht) und brach dann an der Versionskollision ab
  (`duplicate key … Key (version)=(20260813) already exists`). Endzustand: **keine
  Objekte, aber Buchführung behauptet „20260813 angewendet"** — stiller Verlust plus
  falsches Grün plus blockierte Folge-Migrationen.
- **Neukonvention:** `rollback_*`-Dateien werden ausdrücklich übersprungen
  (`Skipping migration … (file name must match pattern "<timestamp>_name.sql")`), genau
  die zwei Vorwärtsmigrationen laufen, alle Objekte existieren, Buchführung trägt
  `20260813090000, 20260813090100`.
**Korrektur:** Vorwärts jetzt `20260813090000_jobqueue_outbox.sql` und
`20260813090100_verteilte_grenzen.sql` (eindeutige 14-stellige Stempel); Rollbacks
`rollback_<vorwärtsname>.sql` im selben Verzeichnis (CLI-unausführbar, Betreiber findet
sie direkt daneben). Alle Verweise (Suiten, Doku) umgestellt; die SQL-Anweisungen sind byte-identisch (geändert wurden ausschließlich fünf Kopfkommentar-Zeilen mit Dateiverweisen).
`scripts/migrations-organisation-test.js` (10 PASS) erzwingt die Neukonvention dauerhaft
und friert den Altbestand ein. CLAUDE.md §4 Regel 8 entsprechend geschärft.
**Ehrlich benannte Altlast (nicht repariert):** die 48 Bestandsdateien (8-stellige
Stempel, `_rollback`-Suffix CLI-lesbar, Selbtag-Kollisionen z. B. 3× `20260712`) wären
bei einem CLI-Lauf genauso gefährdet. Sie sind **angewendete Historie** und werden nicht
umbenannt; die Betreiberpraxis (manuelle Anwendung im SQL-Editor, Runbook) berührt die
Gefahr nicht. Eine spätere Reorganisation des Altbestands ist eine eigene, hier bewusst
nicht nebenbei erledigte Entscheidung.

### 17.6 Zusätzlicher Befund aus dem CI-Rot: Verbraucher-Route war durch Zugriffs-Gates unerreichbar

Der erste CI-Lauf der Sicherheitskorrektur färbte NUR die neue Routen-Suite rot
(alle 21 Fälle, jede Antwort ein 409 ohne `grund`) — und deckte damit einen echten
Konstruktionsfehler auf: `/api/ops/worker-weck` lag HINTER drei vorgelagerten
Zugriffs-Gates des Servers, die eine Maschine-zu-Maschine-Route nicht passieren kann:

1. **Account-Modus** (Production): jeder `/api/`-Aufruf ohne Nutzersitzung → 401
   (nur `/api/cron/` ist ausgenommen) — der Selbstweck-Sender hat nie eine Sitzung.
2. **Legacy-Modus**: bei ≠ 1 aktivem Mandat → Mandatsauswahl-409 für alle
   `/api/`-Pfade außer Cron (exakt der CI-Befund; lokal unsichtbar, weil der
   Browser-Smoke zuvor genau EIN Testmandat in den lokalen Store geschrieben hatte).
3. **CSRF-Pflicht** für POST auf `/api/` (Cron ausgenommen).

**Korrektur:** die Route heißt jetzt **`/api/cron/worker-weck`** — der etablierte,
selbst-autorisierende Namensraum (authorizeCron, eigene DB-Mandatsauflösung, keine
Sitzung, keine CSRF-Pflicht). Damit passiert sie alle drei Gates korrekt, **ohne eines
davon aufzuweichen**; kein Eintrag in `vercel.json` (kein Zeitplan — nur der Selbstweck
ruft sie). `WECK_PFAD` im Transport, Weckziel-Riegel, Tests und Doku sind umgestellt;
die Routen-Suite läuft bewusst gegen einen frischen Store (CI-Parität).

### 17.5 Zusätzlicher Befund: Vertragstest-Harness zählte async-Fälle blind als PASS

`jobdispatch-vertrag-test.js` awaitete async-Testkörper nicht — deren Assertions
verpufften als späte Promise-Rejection am `process.exit`; ein Fehlschlag konnte unsichtbar
bleiben. Korrigiert (`await check(...)` an allen 39 Aufrufstellen); nach der Korrektur
fielen genau die drei Altfälle, die den neuen Weckziel-Riegel verletzten (http-URLs) —
alle übrigen bestanden legitim. Die Boolean-Harnesse der übrigen neuen Suiten waren nicht
betroffen. Außerdem kannte Prüfung 14 des adversarialen Gesamttests nur die alte
`_rollback.sql`-Konvention — angepasst auf „jede Vorwärtsmigration hat ein
Rollback-Gegenstück (alte oder neue Benennung)"; der erste Korrektur-Komplettlauf der
Offline-Suite zeigte 246/252 mit genau diesem einen sprintbedingten Rot, nach der
Anpassung 247/252 (die 5 verbleibenden = dokumentiertes lokales Basisrot, im CI grün);
Browser-Smoke erneut 32/32.

---

## 18 · Haertungssprint 2026-08-14 — Gegenpruefung der sechs Befunde

Alle sechs vom Gründer benannten Befunde wurden am Code **bestätigt** (keiner widerlegt).

| # | Befund | Ort | Wirkung (nachvollzogen) | Zustand |
|---|---|---|---|---|
| 1 | Belegter Drain antwortet 2xx, der gebündelte Sender bestätigt trotzdem alle Absichten | `server.js` Drain-Zweig + `job-dispatch.versendeAbsichten` | Kein Verbraucher hatte übernommen; die Absichten galten als zugestellt und wurden erst vom Abgleich nach ≥10 min wieder geöffnet — ohne unabhängigen Aufruf wartete die Verarbeitung bis zum nächsten Cronlauf | **behoben** (§18.1) |
| 2 | Kein echter verwalteter Queue-Verbraucher | `job-dispatch.vercelQueuesTransport` | Es existierte nur ein SENDEadapter: keine Abhängigkeit, keine Infrastruktur, kein Verbraucher, keine Quarantäne, keine Parallelitätskontrolle, kein Ende-zu-Ende-Test | **behoben** (§19) |
| 3 | Der 500er-Lastnachweis umgeht den echten Motor | `scripts/skalierung-lastnachweis-test.js` | Der Test fährt Aufträge über direkte `psql`-Aufrufe, startet simulierte Verbraucher ohne Transport und lässt am Ende den Cron-Rückfallweg räumen. Er ist ein **Durchsatzmodell**, kein Nachweis des Ereignismotors | **eingeordnet + ersetzt** (§20) |
| 4 | Anbietergrenzen begrenzen nur Gleichzeitigkeit | `20260813090100_verteilte_grenzen.sql` | `helmut_klasse_belege` kennt keine Rate/Minute, kein Tagesbudget, keinen frühesten Folgezeitpunkt, keine Schutzschaltung und kein erneuerbares Lease | **behoben** (§21) |
| 5 | Verstehensparallelität > 1 ist unsicher | `understanding.js` `merkeUpdateOffen` | Der Update-Vormerkungs-Store liest die gesamte Karte, ändert sie und schreibt sie zurück (Read-Modify-Write auf gemeinsamem Zustand) — genau das, was CLAUDE.md §4 Regel 10 verbietet | **bleibt gesperrt** (§22) |
| 6 | Bestätigte Outbox-Einträge erreichen keinen Endzustand | `helmut_outbox_abgleich` | Der Terminalzweig deckte `offen/versendet/aufgegeben` ab, **nicht** `bestaetigt`. Eine bestätigte Absicht eines fertigen Auftrags blieb dauerhaft liegen (bei 500 Mandaten ~4.300 Zeilen/Tag, unbegrenzt wachsend) | **behoben** (§18.2) |

### 18.1 Befund 1 — kein 2xx ohne Übernahme

Der Drain-Zweig antwortet jetzt **429** (`uebernommen: false`). Der Selbstweck übersetzt 429 in
`unbestaetigt`, und der Dispatcher **legt** die gebündelten Absichten über
`helmut_outbox_zuruecklegen` **zurück**: Status zurück auf `offen`, der bei der Vergabe
gezogene Versuch wird zurückgegeben (Muster von `helmut_defer_job` — „Warten ist kein
Fehler"), neue Fälligkeit in 60 Sekunden. Damit ist ein 2xx nur noch dann eine Bestätigung,
wenn ein Verbraucher die Verantwortung tatsächlich übernommen hat. Beleg: Mutationsprobe M6,
Vertragstest §7.6–7.9.

### 18.2 Befund 6 — Endzustand und Aufbewahrungsvertrag

`helmut_outbox_abgleich` schließt jetzt auch `bestaetigt`, sobald der Auftrag terminal ist.
Zusätzlich existiert `helmut_outbox_aufraeumen(alter_tage, limit, trockenlauf)`: löscht
ausschließlich **terminale** Zeilen (`verzichtet`/`aufgegeben`), deren Auftrag ebenfalls
terminal ist, gedeckelt, Default Trockenlauf — **ohne automatischen Aufrufer**. Es findet in
diesem Sprint **keine** Production-Bereinigung statt.

---

## 19 · Der verwaltete Production-Transport: Amazon SQS + Lambda (eu-central-1)

### 19.1 Entscheidung

Der Selbstweck ist **nicht** der Production-Antrieb für 500 Mandate. Er bleibt als
ausdrücklich begrenzter Entwicklungs- und Notfallweg bestehen: in einer
Vercel-Production-Umgebung wählt ihn nur, wer `HELMUT_SELBSTWECK_ERLAUBT=on` setzt; sonst
stoppt der Dispatcher geschlossen, statt unbemerkt auf den schwächeren Weg zu fallen. Der
**Standardtransport ist `sqs`**.

Gründe (die vier Eigenschaften, die der Selbstweck nicht hat und die sonst selbst gebaut und
selbst bewiesen werden müssten): Sichtbarkeitszeit, Zustellzähler, native Quarantäne,
kontrollierte Parallelität — dazu eine europäische Region (Frankfurt) und ein ausgereifter
Dienst statt eines Public-Beta-Transports. **Kein technischer Grund gegen SQS/Lambda
gefunden**; die Prüfung galt Regionsverfügbarkeit (eu-central-1 seit 2016), Nachrichtengröße
(Payload 2 Felder ≪ 256 KiB), Zustellsemantik (at-least-once, durch die atomare Beanspruchung
strukturell ungefährlich) und der Frage, ob Vercel als Sender ausreicht (ja — nur
`sqs:SendMessage`).

### 19.2 Was implementiert wurde (nichts davon ist ausgerollt)

1. **Abhängigkeit** `@aws-sdk/client-sqs`, Version **fest auf 3.1110.0 gepinnt**. Zuvor
   geprüft: 3.712.0 zieht 80 Pakete mit 19 Schwachstellen (davon 1 kritisch); 3.1110.0 zieht
   **26 Pakete mit 0 Schwachstellen** (`npm audit`). Geladen wird das SDK **lazy** und **fail
   closed** — fehlt es, meldet sich der Transport ehrlich als nicht verfügbar.
2. **Transportadapter** hinter der bestehenden Grenze (`job-dispatch.sqsTransport`), mit
   hartem **Ziel-Riegel**: nur HTTPS, nur `sqs.eu-central-1.amazonaws.com`, kein Userinfo,
   kein Query, kein Fragment — und **nur eu-central-1** (Datenresidenz ist keine
   Konfigurationsfrage, die still danebengehen darf).
3. **Infrastrukturdefinition** `infra/aws/helmut-auftrags-queue.yaml` (CloudFormation):
   Queue + Dead-Letter-Queue, eigener KMS-Schlüssel mit Rotation (SSE), Sichtbarkeitszeit
   360 s > Lambda-Timeout 180 s > Auftragsbudget 120 s, `maxReceiveCount: 5`, reservierte
   Lambda-Parallelität **und** `ScalingConfig.MaximumConcurrency`, minimale IAM-Rechte
   (Sender darf **nur** senden; der Verbraucher darf **nicht** senden — Folgeaufträge
   entstehen ausschließlich in der Outbox), Secrets nur als SSM-**Parameternamen**.
4. **Lambda-Verbraucher** `lib/helmut/lambda-verbraucher.js` mit **partieller Fehlerantwort**
   (`ReportBatchItemFailures`): nur die nicht erledigten Nachrichten werden gemeldet.
5. **Geteilter Verbraucherkern** `lib/helmut/queue-verbraucher.js`: vollständige
   Signalprüfung → **atomare Beanspruchung genau der signalisierten `jobId`**
   (`helmut_claim_job_by_id`, neu) → **derselbe Fachhandler wie Cron und Warteschlange**.
6. **Kein zweiter Fachpfad:** die Auftragsausführung wurde aus `arbeite` in die exportierte
   Funktion `scalable-pipeline.fuehreAuftragAus` gehoben; `arbeite` **und** der Verbraucher
   rufen sie auf. Wiederholung, Zurückstellung, Abschluss und Backoff sind byte-gleich
   derselbe Code (Vertragstest §7.1–7.3).

### 19.3 Was die Transportgrenze passiert

Ausschließlich `{ jobId: <zufällige uuid>, schemaVersion: <int> }` — geprüft durch denselben
Riegel wie bei jedem anderen Transport, beim Versand **und** beim Empfang. Keine
Mandatsnummern, keine Namen, keine Quellen, keine Dokumente, keine Prompts, keine Ergebnisse.
Die zufällige Auftragsnummer ist zugleich der Idempotenzschlüssel **im eigenen Auftragsbuch**
(nicht in der Queue). Auch die Lambda-Protokolle tragen nur Auftrags-IDs, Ausgänge und
Dauern (Vertragstest §7.4).

### 19.4 Region, Aufbewahrung, Kosten

Datenresidenz **eu-central-1 (Frankfurt)**, im Code hart. Nachrichtenaufbewahrung 4 Tage
(Hauptqueue) bzw. 14 Tage (Quarantäne). **Kostenklassen** (keine erfundenen Beträge): SQS
rechnet je Anfrage, Lambda je Aufruf und GB-Sekunde, KMS je Schlüssel und Anfrage,
CloudWatch je aufbewahrtem Protokoll. Das Modell nennt die **Mengen** (§20: ~123 bis ~859
Lambda-Aufrufe/Tag über die Stufen 5→500); die Preise pro Einheit stehen bewusst nicht hier,
weil sie zum Zeitpunkt der Freigabe am AWS-Preisblatt zu prüfen sind.

### 19.5 Was gefahrlos wiederholbar ist

Ein Absturz **zwischen Datenbankabschluss und Queue-Bestätigung** führt zur erneuten
Zustellung; die trifft dann auf einen terminalen Auftrag und bleibt folgenlos (kein zweiter
Fachaufruf, kein zweiter Modellaufruf). Ein Fehler **vor** dem Abschluss führt zu einer
sicheren Wiederholung über den Versuchszähler des Auftrags. Beides ist im
Ende-zu-Ende-Integrationstest §6 bzw. §5 belegt.

### 19.6 Ausdrückliche Grenze dieses Sprints

Es wurde **keine AWS-Ressource angelegt**: keine Queue, keine Lambda-Funktion, keine
IAM-Rolle, kein KMS-Schlüssel, kein Konto berührt. Die Aktivierung ist eine
kostenpflichtige Gründerentscheidung.

---

## 20 · Ende-zu-Ende-Nachweis und die Einordnung des alten Lastnachweises

**Neu:** `scripts/queue-ende-zu-ende-test.js` — echte lokale PostgreSQL mit den echten
Migrationen, echte atomare Outbox-Erzeugung, **echter** SQS-Adapter, **echter** Lambda-Handler,
**echter** Verbraucher, **echter** Fachkern. Ersetzt ist ausschließlich die
AWS-Netzwerkgrenze durch einen vertragstreuen lokalen Ersatz (Sichtbarkeitszeit,
Zustellzähler, Dead-Letter-Queue, partielle Fehlerantwort). **37 PASS / 0 FAIL**, darunter:
vollständiger Abfluss **ohne einen einzigen Cron-Workerlauf**, keine doppelte Arbeit bei
Mehrfachzustellung, Quarantäne nach genau `maxReceiveCount`, kein Auftragsverlust bei
Transportausfall.

Dieser Test hat einen **echten Fehler** gefunden, den die Vertragstests nicht sehen konnten:
`helmut_claim_job_by_id` schrieb zunächst auf eine Spalte `started_at`, die es in
`helmut_jobs` nicht gibt (die Buchführung heißt `first_claimed_at`). Ohne den Ende-zu-Ende-Lauf
wäre die Funktion erst in Production gescheitert.

**Einordnung des bisherigen Lastnachweises** (`skalierung-lastnachweis-test.js`): er bleibt
als **Durchsatzmodell** bestehen und ist als solches gültig — aber er ist **kein** Nachweis
des Ereignismotors, weil er `server.js`, den Transport, den Verbraucher und die echten
Handler umgeht und am Ende den Cron-Rückfallweg räumen lässt. Beide Tests haben getrennte
Zwecke; wo es um den Motor geht, gilt der Ende-zu-Ende-Test.

---

## 21 · Verteilte Anbietersteuerung (Auftrag Phase 4)

Migration `20260814090100_anbieter_steuerung.sql` (+ Rollback). Der Schlüssel wird von der
Anwendung gebildet und unterscheidet damit **Anbieter · Modell/Endpunkt · Auftragsklasse ·
Mandat**; die Fensterarten sind **Minute** und **Tag**.

- `helmut_anbieter_reserviere` — atomare Reservierung gegen beide Fenster, mit Rückgabe des
  **frühesten zulässigen nächsten Zeitpunkts**. Eine abgelehnte Reservierung zählt in
  **keinem** Fenster (keine halben Buchungen — testgesichert in beide Richtungen).
- **Vertagung statt Fehler:** `anbieter-steuerung.mitAnbietergrenze` liefert die den
  Fachhandlern bereits bekannte Form `{ zurueckgestellt: true, grund, langeWarten }`. Es gibt
  **keine Warteschleife innerhalb einer Function** — gewartet wird, indem der **Auftrag**
  vertagt wird und die Function endet.
- **Exponentielle Wiederholung mit Jitter**, deterministisch aus (Kennung, Versuch): zwei
  Instanzen desselben Auftrags rechnen gleich, zwei verschiedene Aufträge laufen auseinander
  (kein Gleichschritt nach einer Anbieterstörung). Kein `Math.random`.
- **Schutzschaltung** `helmut_anbieter_melde`: Sperre ab N aufeinanderfolgenden Fehlern,
  danach ein Erholungsversuch (halb offen), der nach M Erfolgen vollständig schließt; ein
  Fehler **im** Erholungsversuch sperrt sofort wieder.
- **Erneuerbares Lease** `helmut_klasse_erneuere` (Befund 4g): ein gültiger, haltereigener
  Slot kann verlängert werden; ein **abgelaufener** Slot wird nie wiederbelebt — der Halter
  erfährt den Verlust und kann abbrechen, statt außerhalb der Grenze weiterzuarbeiten.
- **Tagesbudget der KI bleibt unverändert** bei `helmut_reserve_llm_call` (eine Engstelle,
  kein Doppelzählen): die Standardwerte für KI-Anbieter setzen `tag: 0` (= nicht prüfen).

**Keine erfundenen Anbieterwerte.** Die Standardwerte sind bewusst klein und konservativ
(Google 30/min, OpenAI/Azure 20/min, Quellenabruf 60/min) und **nicht** aus
Anbieterdokumentation abgeleitet. Vor einer Aktivierung müssen anhand der echten
Vertragsbedingungen entschieden werden: Anfragen/Minute je Anbieter, ggf. Tokens/Minute,
Tagesbudget je Anbieter, Schwelle und Sperrdauer der Schutzschaltung. Flag
`HELMUT_ANBIETER_STEUERUNG`, Default AUS, fail closed (eine nicht prüfbare Grenze lässt
**nicht** durch, sondern vertagt).

---

## 22 · Verstehenskapazität: Parallelität bleibt 1 (Befund 5)

Die Voraussetzung für Parallelität > 1 ist **nicht** sicher klein umsetzbar und wird
deshalb **nicht** umgesetzt. Grund, am Code belegt: `understanding.js` `merkeUpdateOffen`
liest die gesamte Vormerkungskarte, ändert einen Eintrag und schreibt die **ganze Karte**
zurück. Bei zwei gleichzeitigen Verstehensläufen überschreibt der langsamere Schreiber die
Vormerkung des schnelleren — ein verlorener Eintrag bedeutet einen Vorgang, der nie wieder
aufgenommen wird. Das ist exakt der Fall, den CLAUDE.md §4 Regel 10 verbietet (bedingtes
Schreiben statt Lesen→Ändern→Schreiben).

Eine sichere Ablösung verlangt einen **Compare-and-Set-Store je Vorgang** (eine Zeile je
Vorgang statt einer Karte, mit atomarem Zähler) — das ist eine eigene Migration mit eigenen
Nebenläufigkeitstests und gehört nicht als Beifang in diesen Sprint.

**Folge für das Kapazitätsmodell:** `verstehen` bleibt auf Parallelität **1**, und eine
allgemeine Parallelität von 8 darf **nicht** als Verstehenskapazität gerechnet werden.
Genau das erzwingt `scripts/kapazitaetsmodell-test.js` §B2.

---

## 23 · Kapazitätsmodell je Auftragsklasse (Auftrag Phase 6)

Grundlage: Production-Messwerte (P) des zweiten Fünferlaufs. Angebot = Klassenparallelität ×
86.400 s × 50 % (konservative Annahme A; mit SQS/Lambda gibt es keine Slotgrenze mehr).

| Mandate | Aufträge/Tag | Klasse | Bedarf s/Tag | Angebot s/Tag | Reserve | Engpass |
|---|---|---|---|---|---|---|
| 5 | 612 | quellenabruf · verstehen · projektion · briefing | 4.800 · 3.220 · 30 · 75 | 216.000 · 43.200 · 172.800 · 172.800 | ×45,0 · **×13,4** · ×5.760 · ×2.304 | verstehen |
| 25 | 778 | " | 5.520 · 4.080 · 150 · 375 | " | ×39,1 · **×10,6** · … | verstehen |
| 100 | 1.386 | " | 8.040 · 7.040 · 600 · 1.500 | " | ×26,9 · **×6,1** · … | verstehen |
| 200 | 2.167 | " | 11.520 · 10.360 · 1.200 · 3.000 | " | ×18,8 · **×4,2** · … | verstehen |
| 500 | 4.291 | " | 21.750 · 16.000 · 3.000 · 7.500 | " | ×9,9 · **×2,7** · ×57,6 · ×23,0 | verstehen |

**Der Engpass ist auf jeder Stufe `verstehen`** — die einzige Klasse mit Parallelität 1. Die
schwächste notwendige Klasse hält auf allen fünf Stufen den geforderten Faktor 2 (bei 500:
×2,7). Eine gemittelte Gesamtreserve wird bewusst **nicht** ausgewiesen.

**Queue-Mengen:** 612 → 4.291 Nachrichten/Tag (5 → 500 Mandate), d. h. ~123 → ~859
Lambda-Aufrufe/Tag bei Stapelgröße 5. Die Nachrichtenzahl wächst **unterlinear** (Faktor 7,0
bei 100-facher Mandatszahl) — die geteilten Quellen tragen.

**KI-Tagesbedarf, getrennt vom technischen Durchsatz.** Ein Verstehensauftrag ist **nicht**
ein Modellaufruf: ein bereits verstandener Vorgang wird ohne KI kurzgeschlossen,
Aktualisierungen kosten zusätzlich. Statt einer erfundenen Punktzahl steht eine **Spanne**
zwischen dem in Production gemessenen Verhältnis (untere Grenze) und einem Aufruf je Auftrag
zuzüglich Aktualisierungen (obere Grenze):

| Mandate | Verstehensaufträge | KI-Aufrufe/Tag (Spanne) | Deckel 100+30 |
|---|---|---|---|
| 5 | 161 | 69–209 | trägt nur im günstigen Fall — beobachten (P: gemessen 62–77) |
| 25 | 204 | 88–265 | reicht nicht |
| 100 | 352 | 151–458 | reicht nicht |
| 200 | 518 | 223–673 | reicht nicht |
| 500 | 800 | **344–1.040** | reicht nicht — gesonderte Gründerentscheidung |

Die gemessene Untergrenze ist selbst **konservativ zu niedrig**, weil das globale
Verstehens-Schloss im zweiten Fünferlauf 124 von 139 Aufträgen vertagt hat. Der
Production-Deckel bleibt in diesem Sprint **unverändert**.

**Externe Blocker unverändert ehrlich:** OP-15 (Google-Drosselung) ist nicht mit echten
Messungen gelöst und bleibt ab ~10 Mandaten Blocker; die Anbietersteuerung bremst dort
konservativ, ersetzt aber keine Messung.

---

## 24 · Korrekturlauf 2026-08-14/3 — fünf bestätigte Lücken geschlossen

Der Härtungssprint (§19–§23) lieferte Transport, Verbraucher und Anbietersteuerung, aber der
Weg war an fünf Stellen **nicht betriebsfähig**. Alle fünf wurden am Code bestätigt, keine
widerlegt. Dazu kamen **drei weitere Befunde**, die erst bei der Umsetzung sichtbar wurden
(24.6–24.8). Nichts davon ist ausgerollt; Production ist unverändert.

### 24.1 Lücke 1 — es gab keinen Antrieb, nur einen Transport

**Befund.** `job-dispatch.versendeAbsichten` existierte, aber niemand rief ihn im Betrieb
regelmäßig auf außer den Vercel-Cron-Slots. Der Ende-zu-Ende-Test pumpte den Versand in einer
eigenen Schleife (`await versende()`) — er bewies den **Transport**, nicht den **Antrieb**.

**Korrektur — drei Wege, ein Modul (`lib/helmut/outbox-relay.js`):**

| Weg | Auslöser | Trägt |
|---|---|---|
| **Unmittelbar** | Verbraucher nach belegtem Abschluss → `lambda:InvokeFunction` (`InvocationType: Event`) | die Folgeaufträge einer Kette |
| **Zeitgeber** | EventBridge Scheduler `rate(1 minute)`, **DISABLED** ausgeliefert | später fällige Arbeit, Wiederholungen, Reparatur eines verlorenen Anstoßes |
| **Sicherheitsnetz** | `helmut_outbox_abgleich`, **im Zeitgeberlauf** (nicht mehr nur im Cron) | verwaiste und fehlende Absichten |

Deckelung: Klassen-Lease `outbox-relay` (60 s), Stapel 50, Schleifenobergrenze 5, reservierte
Lambda-Parallelität 2. **Keine Rekursion, keine Warteschleife, kein Selbstaufruf** — je
Verbraucherlauf höchstens **ein** Relayanstoß, nicht einer je Nachricht.

Der Relay trägt **ausschließlich Signale**: kein Handler, kein Modell, kein Quellenabruf —
per Quelltextprüfung festgeschrieben (`outbox-relay-test.js` §1).

**Kostenklasse Zeitgeber (wenn der Betreiber ihn einschaltet):** 1.440 Aufrufe/Tag ≈ 43.800/Monat,
je ~200 ms bei 256 MB. Das liegt innerhalb des dauerhaft kostenlosen Lambda-Kontingents
(1 Mio. Aufrufe + 400.000 GB-s pro Monat); EventBridge Scheduler kostet ~0,04 $ für 43.800
Aufrufe. **Kostenklasse: unter 1 $/Monat.** Er ist **nicht aktiviert** — das Einschalten ist
eine Betreiberentscheidung.

### 24.2 Lücke 2 — die Lambda-Funktion war nicht bereitstellbar

**Befund.** Die Vorlage trug einen Code-Platzhalter, der beim Ausrollen absichtlich scheiterte.

**Korrektur.** `scripts/lambda-paket-bauen.js` baut ein **reproduzierbares** Paket
(feste Zeitstempel, feste Reihenfolge → zwei Läufe ergeben bytegleiche Archive), die Vorlage
lädt es über `S3Bucket`/`S3Key`. Der ZIP-Schreiber und -Leser benutzen ausschließlich `zlib` —
**keine neue Abhängigkeit**.

| Kennzahl | Wert |
|---|---|
| Dateien | 1.515 |
| Roh | 6,68 MiB |
| Archiv | 2,17 MiB (Lambda-Grenze 50 MiB) |
| Abhängigkeitsbaum | 27 Pakete, **namentlich festgeschrieben** |

Verboten und geprüft: `.env`, `.git`, `*-test.js`, `*.md`, `scripts/`, `docs/`,
`supabase/`, Fixtures, `.pem`, `.key`. Zusätzlich ein **inhaltlicher** Blick: keine Datei
enthält etwas, das wie ein JWT oder ein `sk-`-Token aussieht.

Der Test lädt beide Handler **aus dem entpackten Archiv** und führt sie aus — damit ist
bewiesen, dass alle `require`-Ketten im ausgelieferten Artefakt auflösbar sind.

### 24.3 Lücke 3 — in AWS hätte es keine Supabase-Verbindung gegeben

**Befund.** Die Funktion bekommt aus der Vorlage nur **Parameternamen**. Ohne Startweg fällt
`storage.js` still auf den **lokalen** Speicher zurück: der Verbraucher hätte Aufträge
„erledigt", die niemand je sieht.

**Korrektur — `lib/helmut/lambda-konfiguration.js`:**
1. `GetParameter` mit `WithDecryption: true` (SecureString),
2. Werte **nur** im Prozessspeicher — kein Protokoll, keine Datei, keine Rückgabe,
3. Fehlertexte werden **verworfen** und auf fünf feste Ursachen abgebildet (ein AWS-Fehlertext
   trägt Parameternamen und ARN),
4. Prozesscache für warme Aufrufe; **ein Fehlschlag wird nicht zwischengespeichert**,
5. **Fail closed**: ohne belegte Verbindung wird nicht gearbeitet, die Nachricht wird erneut
   zugestellt. Ein stiller Lokalbetrieb ist strukturell ausgeschlossen.

Fünf gleichzeitige Aufrufe erzeugen **genau zwei** SSM-Zugriffe (ein Ladevorgang je Container).

### 24.4 Lücke 4 — die Anbietersteuerung hing an keinem echten Aufruf

**Befund.** Das Modul war vollständig und getestet, aber **kein** externer Aufruf lief
hindurch. Es war ein Modul, kein Schutz.

**Korrektur.** Eine Umschließung (`anbieterUmschlossen`), **einmal** implementiert, um alle
Netzstellen gelegt:

| Netzstelle | Anbieter |
|---|---|
| `fetchUrlRoh` | RSS, Webseiten, Google News, Google Suche (`fetchText`/`fetchHtmlPage` rufen nur `fetchUrl`) |
| `fetchPardokTextRoh` | amtlicher PARDOK-Export |
| `postFormRoh` | Google-News-Auflösung (`batchexecute`) |
| `ai.requestOpenAI` | jeder Modellaufruf (OpenAI **und** Azure) |

Ablauf je Aufruf: atomar reservieren → bei erschöpfter Grenze **vertagen** statt scheitern
(`fuehreAuftragAus` übersetzt das in eine Zurückstellung bis zum frühesten Zeitpunkt, **keine
Warteschleife in der Function**) → Klassen-Lease halten und erneuern → bei Lease-Verlust
**echter** Abbruch der laufenden Anfrage → Erfolg oder **echten** Anbieterfehler melden →
Lease **immer** freigeben.

Anbieterfehler sind Timeout, 429 und 5xx. **Ein fachlich leeres Ergebnis ist kein
Anbieterfehler** — sonst sperrt eine ruhige Quelle den Anbieter.
**Kein Doppelzählen:** das Tagesbudget bleibt allein bei `reserveLlmBudgetOrThrow`; die
Anbietergrenze setzt für KI **keine** eigene Tagesgrenze.
Ohne `HELMUT_ANBIETER_STEUERUNG=on` ist die gesamte Umschließung inert — Production unverändert.

### 24.5 Lücke 5 — falsche KMS-Rechte (der Versand hätte nicht funktioniert)

**Befund.** Der Produzent trug `kms:GenerateDataKey` + `kms:Encrypt`. Ein Produzent einer mit
kundeneigenem KMS-Schlüssel verschlüsselten SQS-Queue braucht `kms:GenerateDataKey` **und**
`kms:Decrypt`.

**Korrektur.** Sender und Relay: `GenerateDataKey` + `Decrypt` **auf dem Queue-Schlüssel**;
`kms:Encrypt` entfernt. Verbraucher: `Decrypt`.

> **Ehrliche Grenze:** `docs.aws.amazon.com` und `aws.amazon.com` sind aus dieser Umgebung
> durch die Netzrichtlinie gesperrt (EGRESS_BLOCKED). Die Korrektur stützt sich auf die
> Vorgabe des Betreibers und auf Modellwissen — **nicht** auf eine in dieser Sitzung
> abgerufene AWS-Quelle. Vor dem Ausrollen einmal gegen die offizielle Dokumentation prüfen.

### 24.6 Zusatzbefund A — der Verbraucher konnte SSM-Parameter nicht entschlüsseln

Bei der Gesamtdurchsicht der AWS-Definition (Auftrag Lücke 5): die Verbraucherrolle durfte
`ssm:GetParameter`, aber **nicht** `kms:Decrypt` auf `alias/aws/ssm`. `WithDecryption: true`
wäre mit AccessDenied gescheitert — die Funktion hätte in AWS **nie** eine Supabase-Verbindung
bekommen (sie hätte korrekt geschlossen gestoppt, aber niemals gearbeitet). Behoben.

### 24.7 Zusatzbefund B — der Regionsriegel hielt nichts

Der Riegel hing an einem `AWS::NoValue` in einem **Metadata**-Feld. Ein fehlendes Metadata-Feld
lässt einen Stack nicht scheitern — der Riegel war Dokumentation, kein Schutz. Er hängt jetzt
an der **Pflicht**-Eigenschaft `KeyPolicy` des KMS-Schlüssels; beide Queues hängen über
`KmsMasterKeyId` von diesem Schlüssel ab, in einer falschen Region entsteht also **keine**
Queue. **Nachweis offen:** das Verhalten ist CloudFormation-Standard, aber in dieser Umgebung
nicht gegen AWS geprüft — vor dem ersten Ausrollen einmal in einer falschen Region trocken
anlegen.

### 24.8 Zusatzbefund C — Wiederholungen wurden vom Relay nicht getragen

**Vom Ende-zu-Ende-Test aufgedeckt, nicht von den Vertragstests.** Ein wiederholter oder
zurückgestellter Auftrag kehrt nach `wartend` zurück, seine Versandabsicht ist zu diesem
Zeitpunkt aber schon `bestaetigt`. Im Ereignis-Antrieb weckte ihn danach nur der Abgleich —
und der wartet bewusst ein Mindestalter (Standard 10 Minuten) ab. **Ein 30-Sekunden-Backoff
wurde faktisch zu 10 Minuten.** Der Auftrag ging nie verloren, aber der Relay trug nur
Erstzustellungen.

**Korrektur:** `helmut_outbox_erneut_vorlegen(job_id)` legt die Absicht **genau zur neuen
Fälligkeit** des Auftrags erneut vor (nur für `wartend`, nie für terminale Aufträge, nie nach
hinten verschiebend). Der Verbraucher ruft sie nach jeder Zurückstellung und Wiederholung.
Schlägt der Aufruf fehl, bleibt exakt das bisherige Verhalten — der schlechteste Fall ist der
alte Zustand, nie ein Verlust. Ein sofortiger Relayanstoß erfolgt **nur**, wenn die Absicht
jetzt fällig ist (kein Leeraufruf).

### 24.9 Was die Nachweise tragen — und was nicht

**Getragen (lokal, echte PostgreSQL 16.13, echte Migrationen, gebautes Paket):**
Outbox-Atomarität · echter Relay-Einstiegspunkt · echter SQS-Adapter · Lambda-Verbraucher aus
dem entpackten Archiv · derselbe Fachkern wie Cron und Warteschlange · Folgeauftrag ohne
Testpumpe · später fällige Arbeit · Mehrfachzustellung · Absturz vor/nach Abschluss und
zwischen Outbox und Versand · SQS-Ausfall · Quarantäne nach genau `maxReceiveCount` ·
automatische Reparatur eines verlorenen Anstoßes · vollständiger Abfluss **ohne Vercel-Cron
und ohne manuelle Testpumpe**.

**Nicht getragen:** alles, was echtes AWS braucht — Queue, Lambda, KMS, SSM, EventBridge,
IAM-Auswertung, Region, Kosten. Ersetzt sind ausschließlich **zwei Außengrenzen**: das
AWS-Netz und der SSM-Dienst. **Das ist kein Production-Beweis.**
