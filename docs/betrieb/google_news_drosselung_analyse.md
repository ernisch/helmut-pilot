# Google-News-Drosselung — Ursachenanalyse (Betriebsbefund B1)

**Stand:** 2026-07-17 · **Methode:** rein lesende Prüfung (Production-DB
`ddckuvvpcytqbyfmbvie` nur SELECT; Code auf `origin/main` `7346653`). Keine
Production-Änderung während der Analyse. Grundlage:
`docs/betrieb/production_beweisprotokoll.md` (Läufe 1/2/4).

---

## 1 · Gemessene Faktenlage (bewiesen)

### 1.1 Die vier Crawls des Störungstages

| Lauf (UTC) | runId | ok/geprüft | Fehlercodes |
|---|---|---|---|
| 16.07. 16:00 (Pipeline-Cron, Flags aus) | `crawl-…160030-z34lk` | 145/145 | — (keine Telemetrie, Flag aus) |
| 16.07. 18:24 (**manuell**, Vercel „Run") | `crawl-…182458-il02g` | 145/145 | 145× ok |
| 16.07. 20:01 (Cron) | `crawl-…200114-v268f` | **16/145** | **47× `http-429`, 81× `timeout`, 1× `http-4xx`** |
| 17.07. 04:01 (Cron) | `crawl-…040100-mb1k6` | 145/145 | 145× ok |

### 1.2 Provider-Aufschlüsselung des degradierten Laufs (neu, aus der Telemetrie)

Kreuzung der 145 Telemetrie-Zeilen von `v268f` mit den Abrufwegen
(`retrieval_paths`) ergibt eine **vollständige Provider-Trennung des Schadens**:

| Provider | ok | 429 | timeout | 4xx | Summe |
|---|---:|---:|---:|---:|---:|
| Google-News (relationaler Plan, 136 Wege) | 13 | 45 | 77 | 1 | 136 |
| Google-News (profil-dynamische Suchen, 6) | 0 | 2 | 4 | 0 | 6 |
| **Direkte Quellen (RSS/HTML)** | **3** | **0** | **0** | **0** | **3** |

**Bewiesen:** Alle 129 Ausfälle waren Google-News-Abrufe. Die 3 direkten Quellen
liefen fehlerfrei. **Kein anderer Anbieter war betroffen.** Von den 145
gecrawlten Quellen des Laufs waren **142 Google-News-basiert** (Klumpenrisiko:
im Gesamtkatalog sind 146 von 163 Abrufwegen `googlenews_search`).

### 1.3 Anfragevolumen und Parallelität zum Störungszeitpunkt (Code, Alt-Stand)

- **Parallelität:** ein gemeinsamer Pool `CRAWLER_CONCURRENCY=20` für ALLE
  Quellen; innerhalb jeder Quelle zusätzlich 4 parallele Google-URL-Auflösungen
  → bis zu **~80 gleichzeitige Verbindungen zu news.google.com**, ohne
  Mindestabstand.
- **Volumen je gesundem Crawl:** ~142 Google-RSS-Abrufe in einem ~20-s-Fenster
  (gemessen: Fetch-Fenster Lauf 1/4 ≈ 20 s) **plus** ~1 770
  URL-Auflösungsversuche (`googleUrlResolution.attempted`, Lauf 4: 1 766/1 770),
  von denen ein Teil zusätzliche Requests gegen news.google.com auslöst
  (Seiten-Fetch + bis zu 2 `batchexecute`-POSTs je ungelöster URL). Die
  Personensuche lud zudem 2 Feeds (aktuell + `when:3m`-Archiv).
- **Fehlerbehandlung (alt):** kein Retry, kein Backoff, keine 429-Sonderbehandlung,
  `Retry-After` wurde nicht gelesen; nach einem Feed-Fehler feuerte der Crawler
  sogar einen **zweiten** Request (HTML-Fallback) gegen dieselbe gedrosselte
  Google-URL. Timeout je Request: 7 s (Inaktivität, `CRAWLER_TIMEOUT_MS`).
- **Timeout-Signatur des degradierten Laufs:** Median 7 294 ms, Ø 6 803 ms —
  die Abrufe liefen in das 7-s-Timeout (Google „slow-walled" die Verbindungen);
  429 = explizite Drosselung.

### 1.4 Zeitabstand und manueller Trigger

Drei Vollcrawls in ~4 h (16:00 → 18:24 → 20:01) statt der geplanten ~2/Tag.
Der 18:24-Lauf war ein manueller Vercel-„Run". Die vorhandene Drossel
`HELMUT_MANUAL_RUN_MIN_INTERVAL_MS` (10 min) gilt nur für die
Refresh-Endpunkte, **nicht** für `/api/cron/crawl|pipeline` — der manuelle
Cron-Trigger war ungeschützt.

### 1.5 Einfluss der `cem-ince-news`-Dublette

Gemessen: in den Läufen il02g/v268f/mb1k6 je **145 Zeilen, aber nur 144
distinct `source_id`** — `cem-ince-news` lief doppelt (Labels „Cem Ince
News-Suche" und „cem-ince News-Suche"). Ursache (live nachvollzogen, nicht nur
aus Alt-Doku): der relationale Pfad `rp-cem-ince-news` sucht `q="Cem Ince"`,
die profil-dynamische `personNewsSource` baute bei **leerem `fullName`**
`q="cem-ince"` — unterschiedliche URLs, daher griff die reine URL-Dedup im
Merge nicht; beide tragen dieselbe `source_id`. Effekt auf B1: +1 Google-Abruf
pro Crawl (~0,7 % des Volumens) — **messbar, aber nicht ursächlich**.
Zusätzlich verfälschte die Dublette alle per `source_id` geschlüsselten
Zuordnungen (Telemetrie-distinct, ok-Zuordnung je Kategorie).

### 1.6 Der Alarmpfad war strukturell blind

`buildHealthReport` bewertete ausschließlich `getLatestCrawlRun()`. Um 06:00
war der jüngste Lauf der gesunde 04:00-Lauf → Report grün, B1 unalarmiert
(gemessen: 0 neue `systemErrors`, Report „grün"). Bewiesen und in diesem
Sprint behoben (rollierende Betrachtung, `docs/betrieb/health_report_rollierend.md`).

---

## 2 · Ursachen-Einordnung

### Bewiesen
1. Die Störung betraf **ausschließlich Google-News-Abrufe** (129/129); direkte
   Quellen liefen fehlerfrei → externe Drosselung durch Google, kein interner
   Timeout-/Infrastrukturfehler (die 81 „timeout" sind Googles Slow-Walling im
   7-s-Fenster, flankiert von 47 expliziten 429).
2. Am Störungstag liefen **3 Vollcrawls in ~4 h** (einer manuell), jeder mit
   ~142 Google-Feeds + ~1 770 Auflösungsversuchen bei bis zu ~80 parallelen
   Google-Verbindungen ohne Abstand, Retry-Disziplin oder 429-Behandlung.
3. Nach ~8 h Google-Pause war der 04:00-Lauf **vollständig erholt** (145/145,
   volle URL-Auflösung 1766/1770, Laufzeiten wie gesunde Baseline).
4. Die Dublette existierte (145/144) und ist auf die id-Kollision
   personNewsSource ↔ `rp-cem-ince-news` zurückzuführen.

### Wahrscheinlich (plausibel, nicht formal beweisbar)
- **Volumeninduzierte, temporäre IP-Drosselung durch Google News**: das
  verdreifachte Tagesvolumen in kurzer Folge (plus die aggressive Parallelität)
  hat Googles Rate-Limiting ausgelöst; die Erholung nach Pause und das
  429/Slow-Wall-Muster stützen das. Googles Quoten sind nicht einsehbar —
  welcher Teilfaktor (Gesamtvolumen, Parallelität, Auflösungs-POSTs) die
  Schwelle riss, ist **nicht** einzeln belegbar.

### Nicht belegte Annahmen (ausdrücklich)
- Dass ein einzelner Faktor (nur der manuelle Lauf, nur die Parallelität, nur
  die Auflösung) allein ausgereicht hätte.
- Dass die Dublette einen relevanten Beitrag leistete (+0,7 % Volumen — nahezu
  sicher irrelevant, aber unabhängig davon korrekturbedürftig).
- Konkrete Google-Quotenwerte oder Drosseldauern (extern, nicht einsehbar).

---

## 3 · Nebenbefunde aus der Analyse (ehrlich, außerhalb des Sprint-Auftrags)

**B3 (neu, beobachtet):** Nach dem Merge der Mandantenneutralisierung (#97,
17.07. ~05:26 UTC) zeigt der nächste Lauf `crawl-20260717073217-sge68` (manuell,
07:32 UTC) nur **139 Quellen** und lief für ein Mandat `angela-merkel`
(Testmandat, am 17.07. angelegt): die **6 profil-dynamischen Suchen des
Piloten fehlen** (Regierungsvorhaben/Fraktion/Ministerien/Ausschuss/Region/
Themen-Medien), die Personensuche des Piloten lief nur noch über den
relationalen Pfad. Interpretation (nicht abschließend geprüft): die Cron-
Mandantenauflösung bzw. die Profil-Vollständigkeit (`fullName` etc. leer im
Laufzeitprofil) verändert die erwartete Quellenzahl je Mandat. **Kein Eingriff
in diesem Sprint** — als offener Prüfpunkt an den Betreiber gemeldet, weil er
die Referenzzahl „145" betrifft (siehe §4).

**Leeres `fullName` zur Cron-Laufzeit** (Ursache der Dubletten-URL-Abweichung
und des Labels „cem-ince News-Suche"): das im Cron geladene Profil trägt keinen
Vollnamen. Die Personensuche fällt dann auf den Mandats-Slug zurück. Prüf-
empfehlung: Profil-Datensatz vervollständigen (Datenpflege, kein Code).

---

## 4 · Erwartete Quellenzahl (Referenz für Beweisläufe)

- **Alt (bis 16.07.):** 145 Zeilen je Vollcrawl = 144 logische Quellen + 1
  Dublette.
- **Nach dem Dubletten-Fix dieses Sprints:** eine `source_id` läuft genau
  einmal → bei identischem Katalog **144**. Die Zahl kann zusätzlich je Mandat
  variieren (profil-dynamische Quellen erscheinen nur bei hinreichend
  gefülltem Profil — siehe B3: aktuell 139 beim Testmandat). Für künftige
  Beweisläufe gilt daher: **distinct `source_id` = Zeilenzahl** ist die harte
  Invariante, nicht eine fixe „145".

---

## 5 · Abgeleitete Härtung

Die minimale Härtung (Provider-Trennung, Google-Gate, Retry/Backoff mit
Retry-After, Circuit Breaker, Cooldown, Vollcrawl-Abstands-Schutz, Wegfall des
HTML-Fallback-Zweitrequests) ist umgesetzt und getestet — Design, Grenzwerte
und Rollback: `docs/betrieb/google_news_haertung.md`.

_Rein lesende Analyse; alle Zahlen aus Production-DB/Telemetrie bzw. Code von
`origin/main`. Keine Schätzwerte außer als solche gekennzeichnet._
