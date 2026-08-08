# V3-Skalierungsprüfung — Ursachenbericht (2026-08-08)

**Auftrag:** verbindlich klären, ob der „Helmut V3 Motor" für 1000 Mandate konzipiert und
umgesetzt wurde, ob er heute im aktiven Productionpfad vollständig verwendet wird und ob der
bisherige Skalierungsnachweis für 200 Mandate den richtigen Pfad geprüft hat.

**Art des Sprints:** reine Ursachenprüfung + lokale Dokumentation. **Keine** Codeänderung,
**kein** Commit/Push/PR, **kein** Production-Zugriff, **kein** KI-Aufruf, **kein** Netzaufruf.
Das laufende OP-25-Nachweisfenster (Ende 2026-08-08 22:19:06 Berliner Zeit) wurde nicht berührt.

**Prüfstand:** Arbeitsverzeichnis `/home/user/helmut-pilot`, Branch
`claude/helmut-v3-scaling-audit-qxz1kj`, HEAD `a07954d` (Merge PR #232), Arbeitsbaum sauber.
Ein separater isolierter Skalierungsworktree **existiert nicht** (`git worktree list` zeigt
genau einen Eintrag, das Hauptverzeichnis). Der Klon ist **shallow** (ältester Commit
2026-07-28) — Git-Archäologie zur V3-Entstehung (2026-07-06) war deshalb **nicht möglich**;
alle Aussagen zur Entwurfsabsicht stützen sich auf Dokumente, alle Aussagen zum heutigen
Verhalten auf den Code.

---

## 0 · Zusammenfassung für den Gründer (einfach)

1. **Wir haben zwei verschiedene Dinge „V3" genannt.** „V3" ist der **Datenmotor** (ein
   Datenmodell, ein Codepfad, `raw_documents → knowledge_objects → matching → decisions`).
   Der Satz „trägt 100/500/1000 Mandate" stand **nie** über dem Datenmotor, sondern über dem
   **Datenmodell der Quellenarchitektur** — und dort ausdrücklich als *konzeptionell*, mit der
   Teilnote **Skalierung 6 von 10**.
2. **Das Herzstück von V3 hält, was es verspricht.** Ein Dokument wird **einmal** verstanden,
   nicht einmal je Mandat. Profilzuordnung und Entscheidungen laufen **ohne** KI. Das ist im
   Code belegt und im aktiven Pfad wirksam.
3. **Skalieren tut trotzdem nichts davon** — weil neben V3 zwei Dinge je Mandat wachsen, die
   der V3-Entwurf nie abgedeckt hat: (a) **7 eigene Google-Suchen je Bundestagsmandat**
   (8 bei Landtag) und (b) **KI-Texte je Mandat** (Lagenarrativ, Bürotexte).
4. **Die Zahl „10 bis 15 Mandate" ist belegt** — nicht als Absturz, sondern als
   **Kapazitätsgrenze je schwerem Lauf**. Ab etwa 14–15 Bundestagsmandaten passt allein der
   Quellenabruf nicht mehr in sein Zeitbudget; ab etwa 17 Mandaten kann ein Lauf gar nicht
   mehr alle Mandate versorgen, egal wie schnell er ist.
5. **Der „Skalierungsbericht für 200 Mandate" liegt nicht im Repository.** Weder
   `scripts/skalierung_nachweis_200.js` noch ein Bericht mit den Zahlen 1784/1625 noch ein
   Punkt „OP-30" existieren in `main` oder auf diesem Branch. Seine Herleitung konnte deshalb
   **nicht** geprüft werden. Was geprüft werden konnte: seine **Größenordnungen sind mit dem
   heutigen Code vereinbar** (siehe §4).
6. **Es muss kein neuer Motor gebaut werden.** Die teuerste Einzelmaßnahme ist, die
   mandatseigenen Suchen zu **teilen** statt zu vervielfachen — das Muster dafür (Pakete +
   Referenzzählung, „hundert Profile → ein Crawl") ist **bereits gebaut und aktiv**, es ist
   nur für genau diese sieben Wege nicht angewandt.

---

## 1 · Phase A — Verbindliches Zielbild von V3

### A.1 Für welche Mandatszahlen V3 entworfen wurde

**Belegte Antwort: für gar keine.** `docs/V3_MIGRATION_PLAN.md` (2026-07-06) definiert V3
ausschließlich als **Architekturvereinheitlichung**:

> „V3 als **einzige** produktive Architektur. Genau ein Datenmotor, ein Datenmodell, ein
> produktiver Codepfad. V1/V2 vollständig entfernt."
> — `docs/V3_MIGRATION_PLAN.md`, Kopf

Das Dokument enthält über 488 Zeilen **keine** Mandatszahl, **kein** Kapazitätsziel, **kein**
Durchsatz- oder Zeitbudgetkriterium. Sein Abnahmemaßstab ist „V2 ist entfernt und die Tests
sind grün", nicht „n Mandate laufen".

### A.2 Waren 1000 Mandate ein bewiesenes Abnahmekriterium?

**Nein. Es war ein Nebensatz über ein anderes Subsystem.** Die einzige Fundstelle im gesamten
Repository:

> „Das ist das Rückgrat, auf dem 100/500/1000 Mandate **konzeptionell** tragen."
> — `docs/quellenarchitektur/29-gesamtaudit-quellenarchitektur.md:52`

Der Satz beschreibt das **relationale Quellen-Datenmodell** (Herausgeber ↔ Abrufweg ↔ Paket,
m:n mit globaler Ein-Mal-Crawl-Referenzzählung), nicht den Datenmotor. Dasselbe Dokument
vergibt in derselben Tabelle die Teilnote **„Skalierung 6"** von 10 mit der Begründung
„Google-News-SPOF + Klumpenrisiko". Einordnung nach der geforderten Skala: **Zielbild /
Architekturannahme** — nie lokal bewiesen, nie in Production beobachtet, nie unter großer
Mandatszahl belegt.

### A.3–A.6 Was V3 im Code tatsächlich leistet

| Frage | Antwort | Beleg (Datei · Funktion · Zeile) |
|---|---|---|
| Werden Quellen global einmal abgerufen? | **Ja — für geteilte Wege.** Die Vereinigungsmenge dedupliziert über `source.id`; zusätzlich verhindert ein prozessweites Gedächtnis, dass eine identische Google-URL zweimal geholt wird. | `lib/helmut/cron-globalphase.js:130` `planGlobaleQuellen` · `lib/helmut/google-news-hardening.js:179` `sharedFetchLedger` · `lib/helmut/crawler.js:121` `sharedLedger.seenRecently → status "skipped-shared"` |
| Werden Dokumente global einmal verstanden? | **Ja.** Das Verstehen läuft mandantenneutral (`politicianId: null`) über den globalen Deckel. | `lib/helmut/understanding.js:560` `canSpend: () => storage.canSpendLlm(null) // GLOBAL: null, niemals pro Nutzer` |
| Einmal je Dokument statt einmal je Mandat? | **Ja — je Vorgang, nicht je Mandat.** Existiert der Vorgang bereits, wird kein KI-Aufruf ausgelöst, das Dokument wird nur verknüpft. | `lib/helmut/understanding.js:765–859` (`existing` → `skipped-terminal` / `skipped-failed` / Update-Pfad) |
| Profilmatching und Entscheidungen ohne KI? | **Ja, deterministisch.** Weder `matching.js` noch `decisions.js` importieren `./ai`; die Mandatsphase besteht ausschließlich aus beiden plus Telemetrie. | `lib/helmut/matching.js` (kein `ai`-Import) · `lib/helmut/decisions.js` (kein `ai`-Import) · `lib/helmut/scheduler.js:2837` `runMandatsProjektion` · bestätigt in `docs/betrieb/llm-pfad-karte.md` Zeilen 14/15: „0 LLM-Calls" |

**Damit ist die zentrale V3-Zusage im Code eingelöst.** Die Skalierungsgrenze liegt
nachweislich **nicht** hier.

### A.7 Was ursprünglich auf den Pilotmandanten fest verdrahtet war

Belegt aus den Dokumenten (Code-Archäologie wegen des shallow Klons nicht möglich):

- Ein **Pilotmandanten-Default-Profilobjekt** in `runtime.js` als Single-Tenant-Default
  (`V3_MIGRATION_PLAN.md`, Cutover-Schritt 4).
- Der **hartkodierte Quellenkatalog** enthielt eine Personenquelle des Piloten
  (`lib/helmut/sources.js:138`, heute Kommentar über den Rückbau;
  `lib/helmut/quellenarchitektur/source-mode.js:482` beschreibt die abgelöste
  „Katalog-Dublette").
- Ein **personenbezogenes Paket** `profil-<pilot-mandats-id>`, an die konkrete Profil-ID
  gebunden (`docs/quellenarchitektur/07-paketaktivierung-profil-resolver.md`).
- Die **Landes-Basispakete** trugen pilot-spezifische Partei-/Personenquellen — Befund
  **P0-2** des Quellenaudits, seit 2026-07-24 behoben
  (`docs/quellenarchitektur/29-gesamtaudit-quellenarchitektur.md` §19).

### A.8 Welche Mehrmandantenumbauten tatsächlich umgesetzt wurden

| Umbau | Belegt umgesetzt | Beleg |
|---|---|---|
| Personenquelle entsteht zur Laufzeit aus dem Profil, nie aus dem Katalog | ja | `lib/helmut/scheduler.js:977` `personNewsSource` |
| Mandatsquellen entstehen aus Profilmerkmalen, kein Raten, kein Default | ja | `lib/helmut/scheduler.js:1011` `mandateNewsSources` (jede Quelle nur bei belegtem Merkmal) |
| Geteilter Katalog profilbasiert gefiltert (SaaS-Entkopplung) | ja | `lib/helmut/scheduler.js:855–878` `sourceAllowedForProfile` |
| Profil → Paket-Resolver mit Referenzzählung („100 Profile → 1 Crawl") | ja, live verdrahtet | `docs/quellenarchitektur/07-paketaktivierung-profil-resolver.md` (Nachtrag 2026-07-25) · `buildRelationalCrawlPlan` |
| Landesmodul-Riegel je Profil (ein Berliner Mandat legt keine Berliner Wege in Bundesläufe) | ja | `lib/helmut/scheduler.js:816` `planQuellenFuerProfil`, V-2-Kommentar |
| Faire Rotation über Mandate mit Zeitdeckelung | ja | `lib/helmut/cron-fairness.js` · `runCronForTenants` (`server.js:6244`) |
| Globale Erfassung einmal + Mandatsprojektion (K1/K2.1) | ja, gebaut; K2.1 seit 2026-08-06 aktiv | `lib/helmut/scheduler.js:2087` `runGlobaleErfassung` · `:2837` `runMandatsProjektion` · `lib/helmut/vorgangskontext.js:97` `kontextpfadEnabled` |
| Mandantendeckel für KI-Kosten (`HELMUT_TENANT_LLM_CAP`) | **gebaut, nicht aktiviert** | `lib/helmut/storage.js:1428` `canSpendLlmForTenant`; Flag aus (OP-03) |

### A.9 V3-Bestandteile: aktiv · nur implementiert · deaktiviert · umgangen

| Bestandteil | Zustand | Beleg |
|---|---|---|
| Store / relationale V3-Tabellen (`HELMUT_V3_STORE`) | **aktiv** | `v3StoreReady()`; Lage/Briefing liefern echte Daten |
| Understanding (eager + Cron-pending) | **aktiv**, global | `docs/betrieb/llm-pfad-karte.md` Zeilen 1–2 |
| Matching / Decisions | **aktiv**, 0 KI | ebd. Zeilen 14/15 |
| Lage-Read-Pfad, Briefing-Contract V3, Radar-Engine | **aktiv** | `V3_MIGRATION_PLAN.md` Cutover-Tabelle |
| Globaler Abrufpfad K2.1 (`HELMUT_CRON_GLOBALABRUF`) | **aktiv seit 2026-08-06** | `CURRENT_STATE.md` §5 |
| Globalphase K1 (`HELMUT_CRON_GLOBALPHASE`) | **implementiert, dauerhaft nicht aktivierungsfähig** (K2 belegt Vorgangsverschmelzung) | `lib/helmut/vorgangskontext.js:6–20` |
| Altpfad `runSourceCrawl` je Mandat | **implementiert und weiterhin erreichbar** — läuft, sobald `HELMUT_CRON_GLOBALABRUF` aus ist | `server.js:6398` `cronSchwererPfad`, Zweig `pfad === "alt"` |
| Büro-Engine V3 (`HELMUT_V3_OFFICE`) | Feature-Toggle | `lib/helmut/office.js` |
| M8-Relevanzriegel, Scoring, Retention, Mandantendeckel | **deaktiviert** | `CURRENT_STATE.md` §5 |
| Understanding-Gate / PARDOK-Dispatch | **shadow** | ebd. |

---

## 2 · Phase B — Der heutige Productionpfad, vollständig nachgezeichnet

### B.0 Der Weg eines schweren Cronlaufs

```
Vercel-Cron  /api/cron/crawl (04:00, 20:00 UTC)  |  /api/cron/pipeline (16:00 UTC)
  server.js:812 / :898   authorizeCron  →  withTimeout(…, 280 000 ms)
  server.js:6398         cronSchwererPfad(cronName, { deadlineMs: 270 000 })
        │  waehleCronPfad()  (cron-globalphase.js:87)
        ├─ "alt"          → runCronForTenants(… runSourceCrawl(t) …)      [je Mandat ALLES]
        └─ "kontext"      → runCronMitGlobalerPhase(…)                     [HEUTE AKTIV]
              server.js:6416
              1. resolveCronTenants()                      → aktive Mandate (heute 5)
              2. Fairnessreihenfolge (cron-fairness.planTenantOrder)
              3. budgetAufteilung(restMs, n, 8 000 ms/Mandat, max 240 000 ms)
              4. runGlobaleErfassung(…)            scheduler.js:2087
                   a) je Profil getSourcesForProfile()            scheduler.js:837
                   b) planGlobaleQuellen()  = Vereinigung über id  cron-globalphase.js:130
                   c) crawlAllSources() in Stufen à 20            crawler.js:35
                   d) DIP (global, Filter je Profil)
                   e) saveRawItems → persistRawDocuments (Bulk)
                   f) Bündelungskontexte (K2.1)                   vorgangskontext.planKontexte
                   g) Lazy-Understanding (0 KI)                   scheduler.js:2308
                   h) Eager-Understanding (KI, global gedeckelt)  scheduler.js:2371
                   i) Vormerk-Abschlussphase (K4)                 scheduler.js:2450
                   j) Telemetrie + VERSIEGELN
              5. runCronForTenants(… runMandatsProjektion(t, datenstand) …)
                   scheduler.js:2837 →  matching (0 KI) + decisions (0 KI) + Telemetrie
```

Die **Briefingausgabe** ist davon entkoppelt: `/api/cron/morning-briefing` (05:00 UTC) baut je
Mandat `buildV3Briefing` — **0 KI**, reine Lese-Transformation (`server.js:845`). Das
**Lagenarrativ** entsteht getrennt im Cron `/api/cron/lage-briefing` (05:45 UTC,
`server.js:1139`) und ist der einzige KI-Aufruf je Mandat im Regelbetrieb.

### B.1–B.2 Was geteilt läuft und was je Mandat entsteht

**Geteilt (einmal je Lauf):** alle Wege des relationalen Plans — heute **140** von 181 Wegen im
gemessenen Production-Lauf (`docs/betrieb/vorgangskontext.md` §7.6: `gesamt=181 gemeinsam=140
mandatseigen=41`). Sie entstehen aus Paketen mit Referenzzählung; ein Weg, den zehn Profile
brauchen, läuft trotzdem einmal.

**Je Mandat (offline aus dem Produktionscode gemessen, `scheduler.mandateNewsSources` +
`personNewsSource`):**

| Ebene | Quellen je Mandat | Feed-URLs je Mandat |
|---|---:|---:|
| Bundestag | **7** | 8 |
| Landtag | **8** | 9 |

### B.3 Wo `mandateNewsSources` aufgerufen wird

An **genau zwei** Stellen, beide in derselben Funktion `getSourcesForProfile`:

- `lib/helmut/scheduler.js:848` — Quellenmodus `on` (heutiger Productionpfad)
- `lib/helmut/scheduler.js:876` — Fallback auf den Altkatalog

Beide bilden `[personNewsSource(profile), ...mandateNewsSources(profile)]`. `getSourcesForProfile`
wiederum wird im aktiven Pfad **je Profil** aufgerufen (`scheduler.js:2148`, Schleife über
`profileInReihenfolge`) und im Altpfad **je Mandatslauf** (`scheduler.js:243`).

### B.4 Warum 7 bzw. 8 Wege entstehen

`mandateNewsSources` (`scheduler.js:1011–1106`) baut bis zu sieben Suchen, jede nur bei
belegtem Profilmerkmal:

| # | Quelle | Bedingung | id-Suffix |
|---|---|---|---|
| 1 | Regierungs-/Ministeriumsvorhaben zu den Profilthemen | Themen vorhanden | `-news-regierung-vorhaben` |
| 2 | Fraktion-/Partei-Lage | Partei oder Fraktion | `-news-fraktion-partei` |
| 3 | Ministeriums-Radar | Ministerien | `-news-ministerien` |
| 4 | Ausschuss-Themenradar | Ausschuss | `-news-ausschuss-themen` |
| 5 | Themen-Medienlage | Themen | `-news-themen-medien` |
| 6 | Landtag/Landesebene | **nur** `parliamentType === "Landtag"` **und** Bundesland | `-news-landtag` |
| 7 | Regionale Lage | Wahlkreis/Land/Regionalinteressen | `-news-region` |

Dazu `personNewsSource` (`scheduler.js:977`) — **eine** Quelle mit **zwei** Feed-URLs
(Primärfeed + Archivfeed `when:3m`). Bundestag: 6 + 1 = **7 Quellen / 8 Feed-URLs**.
Landtag: 7 + 1 = **8 Quellen / 9 Feed-URLs**. Genau das beschreibt der Auftrag korrekt.

### B.5–B.6 Sind diese Wege Bestandteil von V3?

**Nein — sie liegen außerhalb des V3-Entwurfs und außerhalb des Quellen-Paketmodells.** Beleg,
ausdrücklich und im Code kommentiert:

> „`scheduler.personNewsSource` erzeugt je Mandat zur Laufzeit eine Personensuche. Sie steht
> bewusst **NIE** im geteilten Katalog (CLAUDE.md §4.2) und gehört damit **zu keinem Paket**."
> — `lib/helmut/quellenarchitektur/paket-inventur.js:605–609`, Abschnitt „3.8 Laufzeitquellen"

`V3_MIGRATION_PLAN.md` erwähnt weder `personNewsSource` noch `mandateNewsSources`. Sie sind
eine **spätere, produktgetriebene Ergänzung** des Schedulers — funktional richtig (das ist der
mandatsindividuelle Teil der Versorgung), kapazitätsseitig aber der Teil, der linear mit der
Mandatszahl wächst und den weder V3 noch die Paketarchitektur je modelliert hat.

### B.7 Werden gleiche Fraktionen, Regionen, Ausschüsse und Themen mehrfach gesucht?

**Fachlich ja, technisch nur bei identischer URL.** Die Suchanfragen enthalten die
**profileigenen Top-5-Themen** (`topProfileTopics`, `scheduler.js:1128`), also erzeugen zwei
Abgeordnete derselben Fraktion mit unterschiedlichen Themen **verschiedene** URLs. Zwei
Mandate mit identischer Partei *und* identischen Top-Themen erzeugen dieselbe URL — die wird
dann tatsächlich nur einmal geholt:

- `planGlobaleQuellen` legt strukturgleiche Wege **bewusst nicht** zusammen (das wäre eine
  stille Änderung der Telemetrie-Schlüsselung), zählt sie aber als `doppelteAbrufwege`
  (`cron-globalphase.js:168–184`).
- Der tatsächliche Doppelabruf wird vom prozessweiten `sharedFetchLedger` verhindert
  (`crawler.js:121`, Status `skipped-shared`).

Im gemessenen Production-Lauf: `doppelteWege=3` bei 6 Mandaten — die Entdopplung greift, aber
sie greift eben nur bei **exakt gleicher Query**. Bei 200 politisch heterogenen Mandaten ist
der Anteil struktureller Dubletten klein; die 1400 eigenen Wege bleiben im Wesentlichen 1400.

### B.8 Sollten Quellenpakete diese Abrufe bereits gemeinsam nutzbar machen?

**Ja — für fünf der sieben Wege ist das genau der Zweck des bestehenden Paketmodells.**
Fraktion/Partei, Ausschuss, Ministerien, Fachthema und Region sind **Merkmalsklassen**, keine
Personenmerkmale; das Paketmodell kennt bereits Partei-, Fachthemen- und Regionalpakete
(`07-paketaktivierung-profil-resolver.md`) mit der Zusage „hundert Profile mit demselben Paket
→ trotzdem ein Crawl". Dass diese fünf Wege stattdessen je Mandat als freie Google-Query
gebaut werden, ist eine **Umgehung des eigenen Modells** — nicht ein fehlendes Modell.

### B.9 Sind persönliche Namenssuchen je Mandat und je schwerem Lauf nötig?

**Je Mandat: ja** (sie sind per Definition personenbezogen und der Kern des Radars).
**Je schwerem Lauf: nein, belegbar nicht.** Sie sind mit Abstand die teuerste Quellenklasse:

> „**eine** Suchquelle mit 12 Einträgen = 37 Anfragen; **eine** Personenquelle (2 Feeds × 12
> Einträge) = **98 Anfragen**" — `docs/betrieb/vorgangskontext.md` §7.6, offline gemessen mit
> `scripts/quellen-mehrfachabruf-test.js`

Grund: `personNewsSource` hat zwei Feeds **und** löst als einzige Quellenart zusätzlich
`enrichPersonArticleImages` in einer vollständig sequenziellen Schleife aus, mit
`HELMUT_PERSON_NEWS_MAX_ITEMS = 30` statt 12/24. Drei schwere Läufe am Tag bedeuten also
dreimal ~98 Anfragen je Mandat.

### B.10 Getrennte Warteschlangen für Crawl und Pipeline?

**Ja — getrennte Rotationsbuchführung, aber derselbe Code und derselbe Prozess.** Beide Routen
rufen dieselbe Funktion `cronSchwererPfad` mit identischen Budgets auf (`server.js:829` und
`:903`, je `deadlineMs: 270000`). Getrennt ist der **Fairnesszustand**: er wird unter
`state.crons[cronName]` geführt (`cron-fairness.js:324` `entryOf`), sodass `crawl` und
`pipeline` je eine eigene Rotationsreihenfolge und eigene Rückstandszählung haben. Es gibt
**keine** dauerhafte Auftragswarteschlange und **keinen** Worker — die Warteschlange ist der
Cron-Slot selbst.

### B.11 Welche Flags entscheiden, welcher Pfad läuft?

`cronGlobalphase.waehleCronPfad()` (`cron-globalphase.js:87–94`), fail closed, Default `alt`:

| Konstellation | Pfad | Bedeutung |
|---|---|---|
| keines gesetzt | `alt` | je Mandat vollständiger `runSourceCrawl` |
| `HELMUT_CRON_GLOBALABRUF` | `kontext` | **heute aktiv** — globale Erfassung + Mandatsprojektion |
| `HELMUT_CRON_GLOBALPHASE` | `globalphase` | K1, durch K2 als nicht aktivierungsfähig belegt |
| **beide** gesetzt | `alt` + Fehlerlog | Widerspruch schaltet nie still scharf (`server.js:6400`) |

### B.12 Gibt es einen vollständigen V3-Pfad, der heute nicht aktiviert ist?

**Nein.** Der vollständigste gebaute Pfad (K2.1) **ist** aktiv. Was inaktiv ist, sind
Ergänzungen, die die Kapazität **nicht** erhöhen würden: M8-Relevanzriegel, Scoring,
`HELMUT_TENANT_LLM_CAP` (begrenzt zusätzlich, entlastet nicht), `HELMUT_UNDERSTANDING_GATE`
(shadow — würde KI-Aufrufe **senken**, ist aber OP-18 und nicht freigegeben). **Es liegt kein
skalierender V3-Pfad ungenutzt herum.**

### B.13 Laufen alte Pfade parallel weiter?

**Nicht parallel, aber als jederzeit erreichbarer Rückfall.** Der Altpfad `runSourceCrawl`
ist vollständig vorhanden und läuft, sobald `HELMUT_CRON_GLOBALABRUF` nicht gesetzt ist. Nach
dem ausgewerteten Nachweisfenster ist dessen Fortbestand ausdrücklich eine offene
Betreiberentscheidung (`CURRENT_STATE.md` §5). Fällt das Flag weg, kehrt Helmut in den
**schlechter skalierenden** Zustand zurück — im Altpfad crawlt jedes Mandat den kompletten Plan
(entlastet nur durch `sharedFetchLedger`) und ruft je Mandat Lazy- und Eager-Understanding auf.

### B.14 Wo genau der globale KI-Deckel verbraucht wird

Ein einziger Zähler, global: `HELMUT_MAX_LLM_CALLS_PER_DAY` (heute **100**), gelesen in
`storage.js:1116` `llmDailyCallLimit`, geprüft in `storage.js:1208` `canSpendLlm`. Davon sind
**30** für das Verstehen reserviert (`HELMUT_LLM_RESERVE_UNDERSTANDING`, `storage.js:1589`
`llmUnderstandingReserve`) — für alles andere bleiben **70 Aufrufe pro Tag, systemweit über
alle Mandate**.

Verbraucher (kanonisch `docs/betrieb/llm-pfad-karte.md`):

| Verbraucher | Skalierung | Beleg |
|---|---|---|
| Understanding (eager, Cron-pending, Lage-Check, Recovery, Debug) | **global**, 1 je neuem Vorgang | Pfadkarte 1–5 · `understanding.js:560` |
| **Lagenarrativ** | **je Mandant** × Berliner Tag × KO-Set-Änderung | Pfadkarte 6 · `lage.js:571` `ai.generateLageBriefing` |
| **Kommunikationsentwürfe (Büro)** | **je Mandant**, interaktiv, Client stößt bis zu 6 je App-Öffnung an | Pfadkarte 7 · `server.js:799` |
| **Büro-Engine V3** | je Nutzer × Vorgang × Kanal, max 10/Nutzer/Tag | Pfadkarte 9 |
| Matching, Entscheidungen, Morgenbriefing | **0 KI** | Pfadkarte 14/15 |

### B.15 Warum ein Bericht 1784 KI-Aufrufe/Tag bei 200 Mandaten annehmen kann

Die Frage enthält eine falsche Prämisse und eine richtige Beobachtung.

**Falsch ist die Prämisse „V3 wurde ohne KI-Aufruf je Nutzer entworfen".** Das gilt für den
**Datenmotor** (Verstehen, Matching, Entscheidungen) — und dort stimmt es bis heute. Es galt
**nie** für die **Darstellungs- und Kommunikationsschicht**: das Lagenarrativ ist ausdrücklich
als „PRO-MANDANT-Call" gebaut und so kommentiert:

> „Mehrmandantenfähigkeit Phase 10: das Lage-Narrativ ist ein **PRO-MANDANT-Call** (anders als
> das mandantenlose Understanding)." — `lib/helmut/lage.js:539–544`

**Richtig ist die Größenordnung.** Rechnet man mit dem heutigen Code für 200 Mandate:

| Posten | Rechnung | Aufrufe/Tag |
|---|---|---:|
| Lagenarrativ | 200 Mandate × 1–4 KO-Set-Änderungen (crawl 04:00/20:00, pipeline 16:00, lage-check 10:00) | 200–800 |
| Kommunikationsentwürfe | 200 × bis 6 je App-Öffnung (Client-Autobatch) | 0–1200 |
| Büro-Engine V3 (falls aktiviert) | 200 × bis 10/Tag | 0–2000 |
| Understanding | **global**, unabhängig von der Mandatszahl | 30 (Reserve) |

Eine Zahl wie **1784** liegt damit exakt im plausiblen Band (z. B. 200 × 1 Lagenarrativ +
200 × 6 Bürotexte + ~380 Understanding/Office = 1780). **Sie widerspricht dem V3-Design
nicht** — sie misst eine Schicht, die V3 nie global machen wollte. Ob der Bericht sie so
hergeleitet hat, ist **nicht prüfbar**: der Bericht existiert im Repository nicht (§4).

**Der entscheidende Punkt ist nicht die 1784, sondern die 100.** Der globale Tagesdeckel liegt
bei 100 Aufrufen. Schon **ein** Lagenarrativ je Mandat und Tag sprengt ihn bei 101 Mandaten;
mit der Understanding-Reserve von 30 ist bei **70 Mandaten** Schluss — fail closed, also
ehrlicher Leerzustand statt erfundener Lage (`lage.js:556` `skipped-lage-narrativ`), aber eben
ohne Produkt.

---

## 3 · Phase B — Komponententabelle

| Komponente | Ursprüngliche V3-Aufgabe | Aktuelles Verhalten | Gemeinsam / je Mandat | Aktiv | Beleg |
|---|---|---|---|---|---|
| Relationaler Quellenplan (Pakete + Referenzzählung) | nicht Teil von V3 (Quellenarchitektur) | 140 geteilte Wege, einmal je Lauf | **gemeinsam** | aktiv | `buildRelationalCrawlPlan` · `vorgangskontext.md` §7.6 |
| `personNewsSource` | nicht im V3-Entwurf | 1 Quelle, 2 Feeds, bis 30 Items, ~98 Anfragen | **je Mandat** | aktiv | `scheduler.js:977` |
| `mandateNewsSources` | nicht im V3-Entwurf | 6 (Bund) / 7 (Land) Google-Suchen | **je Mandat** | aktiv | `scheduler.js:1011` |
| `planGlobaleQuellen` | K2.1-Ergänzung | Vereinigung über `source.id`, zählt Dubletten | gemeinsam | aktiv | `cron-globalphase.js:130` |
| `sharedFetchLedger` | Incident-Fix 2026-07-25 | identische URL max. 1× / 15 min / Prozess | gemeinsam | aktiv | `google-news-hardening.js:179` |
| Google-Gate (Parallelität 5, Abstand 200 ms) | Härtung 2026-07 | begrenzt den Abrufdurchsatz hart | gemeinsam | aktiv | `google-news-hardening.js:70–71` |
| `crawlAllSources` in Stufen à 20 | K1 | Restzeitprüfung nur **zwischen** Stufen | gemeinsam | aktiv | `scheduler.js:2194` |
| `persistRawDocuments` (Bulk) | V3 Store | 834 → 10 Round-Trips (K-Fix) | gemeinsam | aktiv | `vorgangskontext.md` §7.6 |
| Lazy-Understanding | V3 C7c | 0 KI, Vormerkung | gemeinsam | aktiv | `scheduler.js:2308` |
| Eager-Understanding | V3 C7/C8 | **1 KI je neuem Vorgang**, global gedeckelt | **gemeinsam** | aktiv | `understanding.js:560` |
| `runMandatsProjektion` | K1/K2.1 | matching + decisions + Telemetrie, **0 KI** | je Mandat | aktiv | `scheduler.js:2837` |
| `buildV3Briefing` (Morgencron) | V3 Contract-Adapter | 0 KI, deterministisch | je Mandat | aktiv | `server.js:845` · Pfadkarte 15 |
| **Lagenarrativ** | V3 Lage-Read-Pfad | **1 KI je Mandant × Tag × KO-Set** | **je Mandat** | aktiv | `lage.js:571` |
| Kommunikationsentwürfe / Büro V3 | V2-Ablösung | KI je Anfrage, Client-Autobatch bis 6 | **je Mandat** | aktiv / Toggle | Pfadkarte 7/9 |
| Fairness-Rotation | OP-25 | verteilt Mandate über Läufe statt alle je Lauf | je Mandat | aktiv | `cron-fairness.js` |
| Altpfad `runSourceCrawl` | V3-Bestand | voller Crawl **je Mandat** | je Mandat | erreichbar (Flag aus) | `scheduler.js:221` |
| K1-Globalphase | OP-25 K1 | globale Bündelung | gemeinsam | **nicht aktivierungsfähig** | `vorgangskontext.js:6–20` |
| `HELMUT_TENANT_LLM_CAP` | Mehrmandantenschutz | Deckel je Mandant | je Mandat | **aus** (OP-03) | `storage.js:1428` |
| `HELMUT_UNDERSTANDING_GATE` | Kostensenkung | würde KI-Aufrufe reduzieren | gemeinsam | **shadow** (OP-18) | `CURRENT_STATE.md` §5 |

---

## 4 · Phase C — Prüfung des Skalierungswerkzeugs

### C.0 Befund vorweg: das geprüfte Werkzeug existiert nicht

Gesucht wurde nach `scripts/skalierung_nachweis_200.js`, nach jedem Dateinamen mit
`skalier`/`scaling`, nach den Zahlen **1784** und **1625** und nach **OP-30** — über alle
verfolgten Dateien, den Arbeitsbaum (inkl. unverfolgter Dateien) und alle lokalen Refs:

| Gesucht | Fundstellen |
|---|---|
| `scripts/skalierung_nachweis_200.js` | **0** |
| Datei mit `skalier`/`scaling` im Namen | 1 — `scripts/health-report-basislauf-skalierung-test.js` (Gesundheitsbericht, **nicht** Mandatsskalierung) |
| „1784" | **0** |
| „1625" | **0** |
| „OP-30" / „OP 30" | **0** |
| „1000 Mandate" | **1** — `29-gesamtaudit-quellenarchitektur.md:52` (§A.2) |
| „1. September" / „2026-09" in Status/Roadmap/Restliste | **0** |

`git status --porcelain --untracked-files=all` ist leer. **Der Skalierungsbericht für 200
Mandate, sein Werkzeug, der Punkt OP-30 und das Datum 1. September 2026 sind im Repository
nicht vorhanden.** Sie stammen aus einer Sitzung, deren Ergebnis nie committet wurde — derselbe
Muster-Fehler, der schon beim OP-25-Fenster auftrat („Doku nur lokal, kein Commit",
`CURRENT_STATE.md` §14).

**Konsequenz für die Fragen C.1–C.12:** Aussagen über *jenes* Werkzeug sind
**nicht prüfbar**. Geprüft wurde stattdessen (a) das tatsächlich vorhandene
Kapazitätswerkzeug und (b) die Sachaussagen des Berichts am heutigen Code.

### C.1–C.9 Das tatsächlich vorhandene Werkzeug: `scripts/globalabruf-kapazitaet-test.js`

| Frage | Antwort |
|---|---|
| Welchen Productionpfad ruft es auf? | Den **echten** globalen Abrufpfad: `cron-globalphase.js`, `cron-fairness.js`, `storage.js`-Schreibpfad, `scheduler.js` — offline, mit ersetzter HTTP-Schicht |
| Prüft es den vollständigen V3-Motor? | **Nein.** Es prüft **Kapazität und Schreibpfad** der globalen Phase plus die Fairnessschleife. Understanding, Matching, Decisions, Briefing sind **nicht** Gegenstand |
| Alter, Misch- oder Schedulerpfad? | Der **heutige** Pfad — aber nur dessen Erfassungs- und Persistenzteil |
| Real ausgeführte V3-Komponenten | Vereinigungsmenge, Bulk-Schreibpfad (`persistRawDocumentsDeduped`), Budgetaufteilung, Fairnessschleife, Datenstandsvertrag |
| Nur modellierte Komponenten | Netzabruf (aus **gemessenen** Stufenspannen des Production-Laufs verrechnet, **nicht** aus Gate-Parametern nachgebildet — ausdrücklich als Grenze dokumentiert, Kopfkommentar), Zeit selbst (simuliert), KI (gar nicht) |
| Sind Hochrechnungen aus echtem Code abgeleitet? | **Für n = 6.** Das Werkzeug ist auf die Production-Größenordnung 181 Quellen / 2 179 Dokumente / **6 Mandate** festgelegt. Es enthält **keine** Hochrechnung auf 200 oder 1000 |
| Entsprachen die Konfigurationen dem Production-Zustand? | Ja für die gemessene Größenordnung; Google-Härtung ist im Test bewusst **aus** (`HELMUT_GOOGLE_HARDENING = "off"`) — d. h. die reale Drosselung ist **nicht** modelliert |
| Wurden deaktivierte Möglichkeiten ignoriert? | Ja, bewusst und dokumentiert |

**Zusatzbefund (blinder Fleck).** Der Kopfkommentar benennt selbst: „diese Suite bemerkt
**KEINE** Regression, die die Nebenläufigkeit des Abrufs verändert
(`HELMUT_GOOGLE_CONCURRENCY`, `HELMUT_GOOGLE_MIN_SPACING_MS`, `CRAWLER_TIMEOUT_MS`,
`HELMUT_GLOBALPHASE_ABRUF_STUFE`)". **Genau diese Parameter sind die Skalierungsgrenze.** Es
gibt im Repository **kein** Werkzeug, das die Kapazität über die Mandatszahl variiert.

### C.10 Ist die Grenze „ungefähr 10 bis 15 Mandate" belegt?

**Ja — die Größenordnung ist am heutigen Code und an einer gemessenen Production-Latenz
belegbar, aber sie bedeutet nicht „Absturz", sondern „ein Lauf schafft nicht mehr alle".**

Zwei unabhängige, im Code verankerte Schranken:

**Schranke 1 — Budgetaufteilung.** `budgetAufteilung` (`cron-globalphase.js:239`) reserviert je
Mandat `DEFAULT_PROJEKTION_MS = 8 000 ms` (`:57`), gibt der globalen Phase aber **nie weniger
als die Hälfte** der Restzeit (`MIN_GLOBAL_ANTEIL = 0.5`, `:60`). Die Fairnessschleife beginnt
ein Mandat außerdem nur mit **15 s** Vorlaufreserve (`cron-fairness.js:94`
`DEFAULT_TENANT_RESERVE_MS`). Bei `deadlineMs = 270 000` folgt daraus eine harte Obergrenze von
**135 000 ms Projektionszeit**, also **maximal ~16–17 Mandate pro schwerem Lauf** — unabhängig
davon, wie schnell ein Mandat ist und unabhängig von der Gesamtzahl.

**Schranke 2 — Quellenabruf.** Der gemessene Production-Lauf brauchte für **181 Quellen
112,11 s** durch das Google-Gate (`vorgangskontext.md` §7.6) = **0,619 s je Quelle** amortisiert
(Parallelität 5, Mindestabstand 200 ms). Da die mandatseigenen Wege **ausnahmslos** Google-News
sind — und die Personenquelle die teuerste Klasse überhaupt ist — ist das eine **optimistische**
Rate für sie.

Hochrechnung (offline mit `cron-globalphase.budgetAufteilung` aus dem echten Modul gerechnet,
140 geteilte Wege, 7 eigene Wege je Bundestagsmandat):

| Mandate | Budget globale Phase | Quellen gesamt | Abruf @0,619 s | passt der Abruf? | Mandate/Lauf |
|---:|---:|---:|---:|:--:|---:|
| 5 | 230 s | 175 | 108 s | ✅ | 5 |
| 6 | 222 s | 182 | 113 s | ✅ (Production bestätigt: 112,11 s) | 6 |
| 10 | 190 s | 210 | 130 s | ✅ | 10 |
| **15** | **150 s** | **245** | **152 s** | ❌ **knapp gerissen** | 15 |
| 20 | 135 s | 280 | 173 s | ❌ | 16 |
| 50 | 135 s | 490 | 303 s | ❌ | 16 |
| 100 | 135 s | 840 | 520 s | ❌ | 16 |
| 200 | 135 s | 1 540 | **953 s** | ❌ (7-fach über Budget) | 16 |
| 1000 | 135 s | 7 140 | **4 420 s** | ❌ (33-fach) | 16 |

**Der Kipppunkt liegt bei n ≈ 14–15 Bundestagsmandaten** — dort reißt der Quellenabruf sein
Budget, und ab n ≈ 17 kann ein Lauf ohnehin nicht mehr alle Mandate versorgen. Die Behauptung
„Helmut scheitert bereits bei ungefähr 10 bis 15 Mandaten" ist damit **im Kern belegt**, mit
drei Präzisierungen:

1. Es ist **kein Absturz**. Bei erschöpftem Abrufbudget wird ehrlich gezählt („Abrufbudget
   erschoepft — n von m Wegen NICHT abgerufen", `scheduler.js:2201`), der Datenstand wird
   `teilweise` versiegelt und bleibt projizierbar (`datenstandVerwendbar`,
   `cron-globalphase.js:316`). Die Mandate bekommen **veraltete und unvollständige** Lage —
   kein falsches Grün, aber auch kein Produkt.
2. Die Zahl gilt **je schwerem Lauf**, nicht je Tag. Mit drei schweren Läufen täglich und
   Rotation sind theoretisch ~45–50 Mandats-*Bedienungen* pro Tag möglich — jedes einzelne
   Mandat aber nur jeden n-ten Lauf, und die Quellenlücke bleibt.
3. Für **Landtagsmandate** (8 statt 7 Wege) liegt der Kipppunkt entsprechend niedriger.

### C.11–C.12 Welche Aussagen des Berichts gültig bleiben, welche zu korrigieren sind

Da der Bericht nicht vorliegt, wird hier über seine **im Auftrag zitierten Aussagen** geurteilt:

| Aussage | Urteil | Begründung |
|---|---|---|
| „~1625 Google-Wege bei 200 Mandaten" | **plausibel, Herleitung nicht prüfbar** | Aus dem Code: 140 geteilt + 200 × 7 = **1 540** Quellen bzw. **1 740** Feed-URLs (200 × 8 + 140). 1 625 liegt dazwischen und ist mit leicht anderen Annahmen (z. B. anteilig Landtag, andere geteilte Wegzahl) erreichbar. **Als Größenordnung: bestätigt.** |
| „~1784 KI-Aufrufe/Tag bei 200 Mandaten" | **plausibel, Herleitung nicht prüfbar; Begründung im Auftrag falsch** | Die Zahl entsteht **nicht** aus Understanding (das ist global), sondern aus Lagenarrativ + Bürotexten je Mandat (§B.15). Der Schluss „widerspricht dem V3-Design" ist **zurückzuziehen** |
| „Grenze bei ~10–15 Mandaten" | **bestätigt, mit Präzisierung** | §C.10 — es ist eine Kapazitätsgrenze je Lauf mit ehrlicher Degradation, kein Ausfall |
| „V3 skaliert auf 1000 Mandate" (frühere Behauptung) | **zurückzuziehen** | §A.2 — nie über V3 gesagt, nie bewiesen, Teilnote Skalierung 6/10 |
| Implizit: „der Skalierungstest hat V3 geprüft" | **zurückzuziehen** | Das vorhandene Werkzeug prüft Kapazität und Schreibpfad bei n = 6, nicht V3 und nicht Skalierung |

---

## 5 · Phase D — Entscheidung zwischen den Erklärungen

**Zutreffend sind die Kategorien 2 und 3; Kategorie 1 trifft nicht zu; Kategorie 4 trifft nur
eingeschränkt zu.** Es liegt also der Fall „mehrere Punkte gleichzeitig" (5) vor.

| Kategorie | Urteil | Codebeleg |
|---|---|---|
| **1 · V3 richtig entworfen, aber nicht aktiviert/angeschlossen** | **trifft NICHT zu** | Der vollständigste gebaute Pfad (K2.1) ist seit 2026-08-06 aktiv (`vorgangskontext.js:97`, `CURRENT_STATE.md` §5). Kein skalierender Pfad liegt ungenutzt |
| **2 · V3 skaliert die gemeinsamen Quellen, mandatseigene Ergänzungen verhindern die Skalierung** | **trifft ZU — Hauptursache** | 140 geteilte Wege konstant vs. 7/8 eigene Wege **je Mandat** (`scheduler.js:848/876/977/1011`); ausdrücklich außerhalb des Paketmodells (`paket-inventur.js:605`); Kipppunkt n ≈ 15 (§C.10) |
| **3 · Der Skalierungstest hat den falschen/unvollständigen Pfad bewertet** | **trifft ZU** | Das einzige vorhandene Werkzeug ist auf n = 6 festgelegt, hat die Google-Härtung **aus** und benennt selbst, dass es Abruf-Nebenläufigkeit nicht prüft (`globalabruf-kapazitaet-test.js`, Kopf). Der behauptete 200er-Bericht existiert nicht (§C.0) |
| **4 · V3 selbst ist strukturell nicht ausreichend** | **trifft nur für die Darstellungsschicht zu** | Datenmotorkern skaliert nachweislich (globales Verstehen, 0-KI-Matching). **Aber:** das Lagenarrativ ist per Entwurf ein Pro-Mandant-KI-Aufruf (`lage.js:539–544`) gegen einen **globalen** Tagesdeckel von 100 (`storage.js:1116`) — diese Kombination ist strukturell nicht mehrmandantenfähig |

---

## 6 · Phase E — Fähigkeitsbewertung

Urteilsskala: *In Production bewiesen · Lokal bewiesen · Rechnerisch plausibel · Nicht bewiesen ·
Widerlegt · Nicht prüfbar.*

### E.1 Heutiger aktiver Productionpfad (K2.1, Flags wie am 2026-08-08)

| Mandate | Urteil | Begründung |
|---:|---|---|
| 5 | **In Production bewiesen** | 3/3 Läufe 06./07.08. je 6/6 Projektionen, `CURRENT_STATE.md` §3/§9 |
| 20 | **Widerlegt** | Abruf 173 s > Budget 135 s; max. 16 Mandate/Lauf (§C.10) |
| 50 | **Widerlegt** | Abruf 303 s bei 135 s Budget |
| 100 | **Widerlegt** | Abruf 520 s; KI-Deckel 100/Tag bereits bei ~70 Mandaten erschöpft |
| 200 | **Widerlegt** | Abruf 953 s = 7-fach über Budget |
| 1000 | **Widerlegt** | Abruf 4 420 s = 33-fach über Budget |

Zwischenwert: **6 Mandate in Production bewiesen; 10 rechnerisch plausibel; 15 nicht bewiesen
(Kipppunkt); ab 20 widerlegt.**

### E.2 Vollständig vorhandener V3-Code bei korrekter Aktivierung

Es gibt keinen inaktiven Pfad, der die Kapazität erhöht (§B.12). Der einzige aktivierbare
Hebel, `HELMUT_UNDERSTANDING_GATE` (OP-18), senkt **KI-Aufrufe**, nicht die Abrufzeit.

| Mandate | Urteil |
|---:|---|
| 5 | **In Production bewiesen** |
| 20 | **Widerlegt** — identische Abrufschranke |
| 50 / 100 / 200 / 1000 | **Widerlegt** |

### E.3 V3 nach den kleinsten notwendigen Korrekturen (§7 Maßnahmen M1–M4)

| Mandate | Urteil | Begründung |
|---:|---|---|
| 5 | **Rechnerisch plausibel** (heute schon bewiesen) | |
| 20 | **Rechnerisch plausibel** | Teilen der fünf Merkmalssuchen senkt eigene Wege von 7 auf 2 → 20 × 2 + ~160 = 200 Quellen ≈ 124 s < 135 s |
| 50 | **Rechnerisch plausibel** | 50 × 2 + 160 = 260 Quellen ≈ 161 s — braucht zusätzlich M2 (Personensuche nur 1×/Tag) |
| 100 | **Nicht bewiesen** | 100 × 2 + 160 = 360 Quellen ≈ 223 s; überschreitet 135 s auch mit M2 → braucht M5 (Warteschlange) |
| 200 | **Nicht bewiesen** | dito, zusätzlich KI-Deckel |
| 1000 | **Widerlegt** (mit kleinen Korrekturen) | 7 140 → ~2 160 Quellen; unabhängig davon reißt die 16-Mandate-Schranke je Lauf um Faktor 60 |

### E.4 Noch nicht implementiertes Zielbild (dauerhafte Warteschlange + Worker + Mandantendeckel)

| Mandate | Urteil |
|---:|---|
| 5 / 20 / 50 | **Rechnerisch plausibel** |
| 100 / 200 | **Rechnerisch plausibel** (Abruf entkoppelt vom 300-s-Cronfenster; KI je Mandant gedeckelt) |
| 1000 | **Nicht bewiesen** — kein Entwurf, keine Messung, keine Kostenrechnung vorhanden |

**Für keine Mandatszahl über 6 existiert heute ein lokaler oder Production-Beweis.**

---

## 7 · Phase F — Kleinste belastbare Lösung

### F.1 Erreichen 200 Mandate mit vorhandenen V3-Komponenten?

**Nein — aber der größte Teil des Weges ist vorhandene, nur nicht angewandte Technik.** Die
Paket-/Referenzzählungsmechanik löst genau das Problem („hundert Profile mit demselben Paket →
ein Crawl"); sie ist auf die sieben mandatseigenen Wege nur nicht angewandt.

### F.2 Was nur verbunden, aktiviert oder anders geplant werden muss

| # | Maßnahme | Was existiert bereits | Was fehlt |
|---|---|---|---|
| **M1** | Die fünf **merkmalsbasierten** Suchen (Regierungsvorhaben, Fraktion/Partei, Ministerien, Ausschuss, Themenmedien) aus `mandateNewsSources` in **geteilte Merkmalspakete** überführen — ein Weg je *Merkmalskombination*, nicht je Mandat | Paketmodell, Resolver, Referenzzählung, globale Aktivierung, Landesmodul-Gate | Kanonisierung der Themenmenge (heute profileigene Top-5) + Mapping Merkmal → Paketweg |
| **M2** | **Personensuche entkoppeln:** nur im ersten schweren Lauf des Tages, nicht in jedem; Archivfeed (`when:3m`) auf einen Wochenlauf legen | `personNewsSource` mit `rssUrls`-Liste, Cooldown-Mechanik, `sharedFetchLedger` | Zeitplansteuerung je Quellenklasse |
| **M3** | **`HELMUT_TENANT_LLM_CAP` aktivieren** und den globalen Deckel anheben, damit ein Mandant nicht den Deckel aller verbraucht | `canSpendLlmForTenant` (`storage.js:1428`), Profil-EUR-Deckel | Freigabe (OP-03) + Deckelwerte |
| **M4** | **`HELMUT_UNDERSTANDING_GATE` aus `shadow` auf `on`** — senkt KI-Aufrufe je Vorgang | vollständig gebaut | Freigabe (OP-18) |

### F.3 Welche echten neuen Komponenten fehlen

1. **Eine dauerhafte Auftragswarteschlange** mit Worker, die den Quellenabruf vom
   300-s-Cronfenster löst. Existiert **nicht** — heute ist die Warteschlange der Cron-Slot,
   die Rotationsbuchführung (`cron-fairness.js`) ist ein *Ersatz*, kein Ersatzsystem.
2. **Kanonische Merkmalspakete** (Themen-, Ausschuss-, Ministeriumspakete) als Datenbestand.
3. **Ein Kapazitätswerkzeug, das über n variiert** — heute prüft nichts das Verhalten jenseits
   n = 6 (§C.1).

### F.4 Müssen persönliche Google-Suchen reduziert werden?

**Ja — sie sind der teuerste Einzelposten je Mandat** (~98 Anfragen je Personenquelle,
`vorgangskontext.md` §7.6). Empfehlung: **seltener** (M2), nicht *ersetzt* — sie sind der
Produktkern des Radars. Geteilt werden können sie definitionsgemäß nicht.

### F.5 Reicht eine dauerhafte Auftragswarteschlange?

**Nein, allein nicht.** Sie hebt Schranke 1 (Zeitfenster) auf, nicht Schranke 2 (Google
drosselt pro Egress-IP; Parallelität 5, Mindestabstand 200 ms). 1 540 Quellen bleiben ~16
Minuten reine Google-Zeit **pro Runde**, egal in welchem Prozess. Ohne M1 verschiebt eine
Warteschlange das Problem nur.

### F.6 / F.7 Zentrale Sammlung + anschließendes Profilmatching — ist das schon V3?

**Ja, und es wird nicht umgangen, sondern nur unvollständig gefüttert.** Genau dieses Muster
ist `runGlobaleErfassung` + `runMandatsProjektion` (`scheduler.js:2087` / `:2837`) und es ist
**aktiv**. Der Fehler liegt eine Ebene davor: die **Eingangsmenge** der zentralen Sammlung
wächst linear mit der Mandatszahl, weil `getSourcesForProfile` je Profil sieben eigene Wege
beisteuert. Die zentrale Sammlung sammelt korrekt — sie bekommt nur zu viel zu sammeln.

### F.8 Größter Kapazitätsgewinn bei geringstem Risiko

**M1 (Merkmalssuchen teilen).** Wirkung: eigene Wege je Bundestagsmandat von **7 auf 2**
(Person + Region) — der Kipppunkt verschiebt sich von n ≈ 15 auf n ≈ 45–50. Risiko: gering und
umkehrbar, weil rein additiv im Quellenplan; kein Eingriff in Verstehen, Matching,
Entscheidungen oder Ablage. **Zwingende Nebenbedingung:** `assertTenant` + `user_id`-Filter und
das Landesmodul-Gate bleiben unangetastet; ein geteilter Weg darf niemals mandatsspezifische
Inhalte in fremde Sichtbarkeit heben — der K2.1-Kontextvertrag
(`vorgangskontext.pruefeAlleKontextgrenzen`) prüft genau das und muss grün bleiben.

### F.9–F.13 Was wann erforderlich ist

| Stufe | Erforderlich |
|---|---|
| **Vor dem Pilotmandanten** | **Nichts aus diesem Befund.** 5–6 Mandate sind Production-bewiesen. Offen bleiben die bekannten Blocker OP-01/02/03/04 und der ausstehende OP-25-Nachweis |
| **Vor einem kontrollierten zweiten Kunden** (bis ~10 Mandate gesamt) | Weiterhin nichts aus diesem Befund — aber **verbindliche Obergrenze dokumentieren** und **M3** (Mandantendeckel) aktivieren, damit ein Kunde den KI-Deckel des anderen nicht verbraucht. Plus OP-03 |
| **Vor mehreren zahlenden Kunden** (~10–20 Mandate) | **M1 + M2 zwingend.** Ohne sie reißt der Abruf sein Budget zwischen n = 14 und n = 15 |
| **Für die Freigabe von 200 Mandaten** | M1 + M2 + M3 + M4 **und** F.3-1 (Warteschlange/Worker) **und** F.3-3 (Kapazitätswerkzeug über n) **und** ein neuer Production-Nachweis. Zusätzlich zu klären: Google-News-SPOF (OP-15/Befund B1) — 97,2 % aller Wege laufen über einen Auflöser |
| **Erst für 1000 Mandate** | Mehrere Egress-Wege/Provider (der SPOF ist bei ~7 000 Wegen unhaltbar), Abkehr von Google News als Hauptträger, mandantenweise Kostenrechnung, eigenes Kapazitätsmodell. **Kein Entwurf vorhanden** |

**Es muss kein neuer Motor gebaut werden.** Der Datenmotor V3 ist für den Zweck richtig gebaut
und im aktiven Pfad wirksam.

---

## 8 · Phase G — OP-25 und Roadmap

### G.1 Welche Änderungen den laufenden OP-25-Vertrag berühren

| Maßnahme | Berührt OP-25? | Warum |
|---|---|---|
| M1 (Merkmalssuchen teilen) | **ja, stark** | Ändert `quellenVereinigung.gesamt/gemeinsam/mandatseigen` und die K2.1-**Sichtbarkeitsmengen** — damit Kontextzahl, Partitionsvertrag und Kapazitätsbilanz |
| M2 (Personensuche seltener) | **ja** | Ändert die Quellenmenge zwischen Läufen; die Vertragsprüfung „gleiche Mandatsmenge, gleicher Commit" bleibt gültig, die Kapazitätszahlen nicht |
| M3 (Mandantendeckel) | **ja** | Kostenvertrag §7.7 wertet Nutzungseinträge aus; ein neuer Gate-Pfad erzeugt neue `skipped-*`-Einträge |
| M4 (Understanding-Gate) | **ja** | Verändert `verstanden`/`zurueckgestellt` und damit E3 |
| Reine Dokumentation (dieser Bericht) | **nein** | Kein Code, kein Deployment, kein Flag |

### G.2 Nach welchen Änderungen OP-25 vollständig zu wiederholen ist

**Nach jeder der Maßnahmen M1–M4.** Der Nachweis ist **deploymentgebunden**: die Startbaseline
wird binnen 15 Minuten nach READY mit vollem `--erwarteter-commit` erhoben
(`vorgangskontext.md` §7.7.5). Jede dieser Änderungen erzeugt ein neues Deployment und
verändert genau die Größen, die der Vertrag prüft. Ein laufendes Fenster **darf** keine davon
enthalten.

**Reihenfolge-Empfehlung, damit OP-25 nicht wiederholt neu aufgesetzt werden muss:**
zuerst das aktuelle Fenster auswerten und PR #232 entscheiden → dann M3/M4 (Flags, keine
Codeänderung) → **dann** ein OP-25-Fenster → **dann** M1/M2 als eigener Codesprint mit
anschließend erneutem OP-25-Fenster.

### G.3 Muss OP-30 als eigener Phase-1-Blocker geführt werden?

**Ja.** Begründung:

- OP-25 beschreibt das **Symptom** („je Lauf wird nur ein Teil der Mandanten erreicht") und ist
  auf Fairness/Zeitdeckelung ausgerichtet.
- Die hier belegte **Ursache** — lineare Vervielfachung der Abrufwege je Mandat außerhalb des
  Paketmodells — ist ein eigener Punkt mit eigener Lösung (M1/M2), eigener Freigabe und
  eigenem Nachweis. Sie wäre unter OP-25 nicht auffindbar.
- OP-28 ist reserviert (PR #216), OP-29 vergeben; **OP-30 ist frei**.

Der Punkt ist in `docs/datenmotor-restliste.md` als **OP-30** angelegt, Prioritätsklasse **P1**
(Betriebsreife; **kein** P0-Verkaufsblocker für den Einzelpiloten, aber Blocker für mehrere
Kunden). **Achtung Namenskollision:** „Punkt 30" in `docs/roadmap/phase_1_checkliste.md` ist die
Phase-1-Abnahme und hat mit OP-30 nichts zu tun — die Roadmap wird deshalb **nicht** um eine
Zeile 31 ergänzt.

### G.4 Welche Roadmapaussagen zu korrigieren sind

| Aussage | Korrektur |
|---|---|
| „V3 ist für 1000 Mandate konzipiert" | **Ersatzlos streichen.** Nie über V3 gesagt (§A.2) |
| „Die Quellenarchitektur trägt 100/500/1000 Mandate" | Nur mit dem Zusatz „**konzeptionell, Teilnote Skalierung 6/10, nie gemessen**" zitieren |
| „Mehrmandantenbetrieb ist gebaut und getestet" (`START_HERE.md` §3) | Fachlich richtig, **kapazitätsseitig ergänzungsbedürftig**: gebaut und getestet für die heutige Größenordnung (5–6), nicht für zweistellige Mandatszahlen |
| „Skalierungsnachweis für 200 Mandate liegt vor" | **Zurückziehen** — im Repository nicht vorhanden (§C.0) |

### G.5–G.7 Termine

Vorbemerkung: **weder ein Pilotdatum „1. September 2026" noch ein Zweitkundendatum sind im
Repository dokumentiert** (§C.0). Die folgenden Urteile beziehen sich auf den Sachstand.

| Frage | Urteil | Begründung |
|---|---|---|
| Pilot (1 Mandant) zum 01.09.2026 realistisch? | **Ja, unverändert** — von diesem Befund **nicht** berührt | 5–6 Mandate sind Production-bewiesen; die Blocker sind OP-01…OP-04 und der OP-25-Nachweis, nicht die Kapazität |
| Zweiter kontrollierter Kunde zum 01.09.2026 realistisch? | **Ja, technisch** — sofern die Gesamtzahl **unter 10 Mandaten** bleibt und M3 aktiviert ist. **Blocker bleibt OP-03** (Freigabepaket), nicht die Skalierung | |
| Ehrlicher Zeitraum für mehrere Kunden / 200 Mandate | **200 Mandate: nicht vor Q4 2026 / Q1 2027.** M1+M2 sind ein Codesprint mit anschließend vollständig zu wiederholendem OP-25-Fenster (≥ 24 h je Anlauf, bisher zwei Anläufe nötig gewesen); die Warteschlange (F.3-1) ist ein eigenes Infrastrukturprojekt ohne Entwurf; der Google-News-SPOF (OP-15/B1) ist bei 1 540 Wegen ein eigenständiges Risiko. **Mehrere Kunden bis ~20 Mandate: realistisch 4–8 Wochen nach Freigabe von M1/M2**, sofern OP-03 entschieden ist |

---

## 9 · Grenzen dieser Prüfung (ausdrücklich)

1. **Der behauptete 200er-Skalierungsbericht konnte nicht geprüft werden** — er liegt nicht im
   Repository (§C.0). Alle Urteile über ihn sind Urteile über die im Auftrag **zitierten
   Aussagen**, nicht über sein Vorgehen.
2. **Kein Production-Zugriff, kein Netz, kein KI-Aufruf** (Auflage des laufenden
   OP-25-Fensters). Alle Production-Zahlen stammen aus bestehenden Belegdokumenten.
3. **Die Rate 0,619 s/Quelle** ist aus **einem** gemessenen Lauf abgeleitet
   (`vorgangskontext.md` §7.6, 181 Quellen / 112,11 s). Sie ist für mandatseigene Wege eher
   **optimistisch** (100 % Google, Personenquelle mit ~98 Anfragen). Die Hochrechnungen in
   §C.10/§E sind damit **rechnerisch plausibel**, nicht gemessen.
4. **Shallow Klon** (ab 2026-07-28): Aussagen zur historischen Entwurfsabsicht von V3
   (2026-07-06) stützen sich ausschließlich auf Dokumente.
5. Die Wirkungsabschätzung von M1 (§E.3) unterstellt, dass sich die fünf Merkmalssuchen
   sinnvoll kanonisieren lassen. Das ist eine **Produktannahme**, kein Codebefund, und muss vor
   der Umsetzung fachlich entschieden werden.

---

## 10 · Sprintzustand (CLAUDE.md §8)

**Erfolgreich abgeschlossen** — als Ursachenprüfung. Die Prüffragen sind beantwortet, jede
tragende Aussage ist mit Datei, Funktion und Zeile belegt, die widersprüchlichen Behauptungen
sind entschieden.

- **Nicht enthalten (bewusst):** jede funktionale Codeänderung, jeder Commit, Push, PR, jedes
  Deployment, jede Flag-/Env-/Cron-Änderung, jeder Production-Zugriff, jeder KI-Aufruf.
- **Tests.** Die Analyse selbst war rein lesend; die einzige Ausführung war eine offline
  Hochrechnung in einem Verzeichnis **außerhalb** des Repositorys, die `mandateNewsSources`,
  `personNewsSource` und `budgetAufteilung` aus dem echten Produktionscode aufruft — ohne Netz,
  ohne Ablage, ohne KI. Für die Dokumentationsänderung:
  - `node scripts/current-state-groesse-test.js` → **4/4 grün** (27 948 von 30 000 Zeichen,
    331 von 350 Zeilen).
  - `node scripts/run-offline-tests.js` → **193/208 Suiten grün**, **identisch zum Baselinelauf
    auf demselben HEAD ohne diese Änderung** (dieselben 15 Suiten fehlgeschlagen, dieselbe
    Suitenzahl). Die 15 Fehlschläge sind ein **Umgebungsartefakt dieser Sitzung**, kein Befund:
    der Netz-Guard blockiert Nicht-Localhost-Verbindungen und die betroffenen Suiten
    (Mandanten-/Sicherheits-/Provisionierungspfade) brauchen Ablage bzw. Egress. **Kein
    künstliches Grün:** die Änderung ist baseline-identisch, sie repariert nichts und
    verschlechtert nichts.
- **Branch:** `claude/helmut-v3-scaling-audit-qxz1kj`, kein Commit erstellt. Kein PR.
- **Nächste Entscheidung (Gründer):** (a) Reihenfolge nach §G.2 bestätigen, (b) M1/M2 als
  eigenen Codesprint beauftragen oder zurückstellen, (c) verbindliche Mandatsobergrenze bis zur
  Umsetzung festlegen (Empfehlung: **10**).
