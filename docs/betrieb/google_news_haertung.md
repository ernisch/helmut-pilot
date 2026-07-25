# Google-News-Härtung — Design, Grenzwerte, Rollback

**Stand:** 2026-07-17 · **Status:** über PR #102 gemergt und deployt (Beweisläufe H1–H3:
`production_beweisprotokoll.md` §8). Die Statusangabe „NICHT deployt" unten war der Stand
vor dem Merge. Ursachenanalyse: `docs/betrieb/google_news_drosselung_analyse.md`.

> **NACHTRAG 2026-07-25 — Grenze dieses Sprints, nachgeschärft.**
> Der Abstands-Schutz (`fullCrawlMinSpacingMs`, §2) ist **pro Mandat** gefiltert, die von
> Google gedrosselte Ressource ist aber **pro Egress-IP** global. Mit inzwischen **sechs
> aktiven Mandaten** holte der sequenzielle Cron-Loop dieselben ~138 geteilten
> Google-Wege einmal **je Mandat**: Mandat 1 lief gesund (145/145), Mandat 2 lief
> vollständig in die Drosselung, und die 130 vom Breaker beendeten Wege wurden als 130
> **Einzelquellenfehler** gezählt → Dauermeldung „141/144 Fehler".
> Ursachenanalyse, Fix und Beweislaufplan:
> **`docs/betrieb/incident_2026-07-25_crawl_mandantenamplifikation.md`**.

## 1 · Prinzipien

1. **Provider-Trennung:** Google-News-Quellen (erkannt an `news.google.` in der
   Abruf-URL) laufen durch ein eigenes Gate; direkte RSS-/HTML-/amtliche
   Quellen laufen im bisherigen Pool und werden von Google-Problemen **nie**
   gebremst oder blockiert. Ein Google-Ausfall degradiert den Lauf, er lässt
   ihn nicht „vollständig fehlschlagen" — erfolgreiche Quellen werden normal
   weiterverarbeitet (war schon so, jetzt zusätzlich per Test belegt).
2. **Kleinste robuste Lösung:** keine neue Infrastruktur, kein neuer Speicher;
   ein reines Logik-Modul (`lib/helmut/google-news-hardening.js`) + minimale
   Integration in Crawler/Scheduler.
3. **Kill-Switch ohne Deploy:** `HELMUT_GOOGLE_HARDENING=off` stellt das
   Alt-Verhalten byte-identisch wieder her (Rollback per Env).
4. **Keine Endlosschleifen, keine unnötigen Kosten:** harte Retry-Obergrenze,
   Circuit Breaker beendet aussichtslose Läufe früh (statt 100+ × 7-s-Timeouts),
   Cooldown verhindert erneutes Hämmern direkt nach einer Drosselung. 0 KI-Calls.

## 2 · Bausteine

| Baustein | Verhalten | Env (Default) |
|---|---|---|
| Gate: Parallelität | max. gleichzeitige Google-Quellenabrufe; der Slot umfasst den GESAMTEN Quellenabruf inkl. URL-Auflösung (vorher bis ~80 parallele Google-Verbindungen, jetzt ≤ Gate-Wert) | `HELMUT_GOOGLE_CONCURRENCY` (5) |
| Gate: Mindestabstand | Mindestabstand zwischen Google-Quellenstarts | `HELMUT_GOOGLE_MIN_SPACING_MS` (200) |
| Retry | nur bei 429/5xx/Verbindungsabbruch; exponentieller Backoff mit Jitter; **Timeouts werden bewusst nicht wiederholt** (kosteten bereits das volle 7-s-Fenster; Nachholung = nächster Lauf). Zusätzlich hartes **Retry-Budget je Lauf** (Backoff-Schlafzeiten halten Gate-Slots — das Budget schützt das Serverless-Zeitlimit bei Teil-Drosselung unterhalb der Breaker-Schwelle) | `HELMUT_GOOGLE_RETRY_MAX` (2), `…_RETRY_BASE_MS` (1000), `…_RETRY_CAP_MS` (8000), `…_RETRY_BUDGET` (12/Lauf) |
| Retry-After | Header wird respektiert und gedeckelt | `HELMUT_GOOGLE_RETRY_AFTER_CAP_MS` (15000) |
| Circuit Breaker (pro Lauf) | Fehl-**Versuche** speisen den Breaker sofort (nicht erst das Quellen-Endergebnis — im Sturm öffnet er in Sekunden); ab ≥ N Beobachtungen mit ≥ Ratio Drossel-Fehlern (429/Timeout/5xx/Verbindung) enden alle weiteren Google-Abrufe sofort (`error_code=circuit-open`, 0 ms, kein Request). Öffnet sich der Breaker während eines Backoff-Schlafs, bricht die Retry-Kette ab | `HELMUT_GOOGLE_BREAKER_MIN_OBSERVATIONS` (10), `…_FAILURE_RATIO` (0.6) |
| Breaker-Gedächtnis (Prozess) | die Cron-Endpunkte durchlaufen alle Mandate sequenziell; nach einer Breaker-Öffnung starten Folge-Läufe im selben Prozess direkt fail-fast (Google drosselt pro Egress-IP, nicht pro Mandat) | `HELMUT_GOOGLE_BREAKER_MEMORY_MS` (600000; 0 = aus) |
| Cooldown nach Degradation | war der letzte Voll-Lauf (mandatsübergreifend — Google drosselt pro Egress-IP) stark degradiert/fehlgeschlagen und liegt < Fenster zurück: Google reduziert (nur Primär-Feed, keine URL-Auflösung, kein Archiv-Feed) | `HELMUT_GOOGLE_COOLDOWN_MS` (3 600 000 = 60 min) |
| Vollcrawl-Abstands-Schutz | Voll-Lauf **desselben Mandats** < Mindestabstand her → Google-Anteil komplett übersprungen (`status=skipped-cooldown`, zählt weder Erfolg noch Fehler); direkte Quellen laufen normal. Betreiber-Override: `force` — von `/api/crawl/run` und `/api/pipeline/run` gesetzt, wenn der Aufrufer den 10-min-Frischeschutz per Force/Admin-Bypass umgeht (bewusst identische Override-Semantik) | `HELMUT_FULL_CRAWL_MIN_SPACING_MS` (1 800 000 = 30 min) |
| Kein HTML-Fallback-Zweitrequest | für Google-Quellen unter dem Gate entfällt der HTML-Fallback nach Feed-Fehler (verdoppelte bisher den Traffic genau im Störfall). **Legitim leere Feeds bleiben dabei ok/'empty'** — ein ruhiger Nachrichtentag ist kein Fehler und füttert keinen Degradations-Alarm | — |
| Timeouts | unverändert klar: `CRAWLER_TIMEOUT_MS` (7000) je Request | bestehend |

Zusätzlich behoben (Phase 2): **Dubletten-Schutz im Crawl-Plan** — eine
`source_id` läuft genau einmal (`mergeProfileAndPlanSources` dedupliziert jetzt
zusätzlich nach id, first-wins/Profilquelle zuerst; ebenso der
Fallback-Katalogpfad). Erwartete Quellenzahl: 145 → 144 (Analyse §4).

## 3 · Ehrliche Lauf-Zustände (Phase 4)

Jeder Crawl-Lauf wird klassifiziert (`lib/helmut/crawl-run-state.js`) und mit
`runState`, `providerBreakdown` (google/direct: checked/ok/failed/skipped/
429/timeout/circuit-open/sonstige/Retries), `errorCodes`, `skippedSources`,
`retriesTotal`, `cooldown` und `googleGate`-Zustand persistiert
(compactStore-Whitelist erweitert; nur Zähler + inhaltsfreie Codes).

**Empfohlene Schwellen (Env-überschreibbar, KEINE endgültige Produktentscheidung):**

| Zustand | Regel (Empfehlung) |
|---|---|
| gesund | Fehlerquote ≤ 10 % (`HELMUT_RUNSTATE_PARTIAL_RATIO`, deckt sich mit Watchdog-Default 0.1) |
| teilweise-degradiert | > 10 % und ≤ 50 % |
| stark-degradiert | > 50 % (`HELMUT_RUNSTATE_HEAVY_RATIO`; B1 lag bei 89 %) |
| fehlgeschlagen | 0 erfolgreiche bei > 0 versuchten, oder Absturz |
| cooldown-reduziert | Lauf lief bewusst reduziert (Skips zählen nicht in die Quote) |
| lock-uebersprungen | Pipeline-Lock hielt — kein Lauf |
| unbekannt | Zähler fehlen/unbrauchbar |

## 4 · Empfohlene Betriebswerte (Begründung)

- **Google-Parallelität 5 + 200 ms Abstand:** senkt die Spitzenlast von ~80 auf
  ≤ 5 gleichzeitige Google-Verbindungen; erwartete Crawl-Phase steigt von ~20 s
  auf grob 60–90 s (bei Ø 2,4 s/Quelle, 142 Google-Quellen) — deutlich unter
  dem 280/300-s-Deckel, aber im ersten Beweislauf zu verifizieren.
- **Retry max 2, Basis 1 s, Jitter:** holt kurze 429-Wellen zurück, ohne einen
  drosselnden Dienst zu bestürmen; im Sturm übernimmt der Breaker.
- **Breaker 10 Beobachtungen / 60 %:** öffnet im B1-Muster (nahe 100 %
  Fehlerquote) nach ~10 Abrufen (~15–30 s) und spart danach ~130 × bis zu 7 s
  Fehlversuche + deren Auflösungs-Traffic.
- **Mindestabstand Vollcrawls 30 min:** verhindert versehentliche
  Doppel-Trigger; die B1-Situation (Crawls ~2 h auseinander) wird bewusst NICHT
  hart verboten — dafür sorgen Gate/Breaker/Cooldown. Wer den Tagesrhythmus
  zusätzlich strecken will, kann den Wert auf 120 min heben
  (Betreiberentscheidung, hier nicht gesetzt).
- **Mindestabstand-Empfehlung Google-Volumen:** langfristig bleibt die im Audit
  benannte strukturelle Minderung (Direkt-RSS statt Google-News-Suchen für
  geeignete Wege) die wirksamste Senkung des Klumpenrisikos (146/163 Wege sind
  Google) — nicht Teil dieses Sprints.

## 5 · Verhalten im Störfall (Soll, nach Deploy)

1. Google drosselt → erste ~10 Google-Abrufe scheitern (429/Timeout, 429 mit
   begrenztem Retry) → Breaker öffnet → restliche Google-Quellen enden sofort
   klassifiziert (`circuit-open`) → direkte Quellen + DIP laufen normal →
   Lauf endet als `stark-degradiert` mit vollständigem Provider-Breakdown.
2. Nächster Lauf < 60 min: Google reduziert (Primär-Feed, keine Auflösung) —
   sanfter Wiederanlauf. Läufe danach: normal.
3. Health-Report: Störung bleibt im 24-h-Fenster sichtbar
   (`health_report_rollierend.md`), auch wenn der jüngste Lauf wieder gesund ist.

## 6 · Rollback

1. **Ohne Deploy:** `HELMUT_GOOGLE_HARDENING=off` in Vercel setzen + Redeploy
   der Env (stellt Alt-Crawlverhalten her; Lauf-Klassifikation/rollierender
   Report bleiben aktiv, sind aber rein beobachtend).
2. **Voll:** Revert des Merge-Commits; keine Migration beteiligt (keine
   DB-Änderung in diesem Sprint), keine Cron-Änderung, keine Env-Pflicht
   (alle neuen Variablen optional mit Defaults).

## 7 · Testbelege (offline, `node scripts/run-offline-tests.js` grün, 127/127 Suiten)

- `scripts/google-news-hardening-test.js` (58 Assertions): Gate-Parallelität,
  Mindestabstand, Backoff/Jitter, Retry-After (Sekunden/HTTP-Datum/Deckel),
  maximale Retry-Zahl + Lauf-Retry-Budget, Versuchs-Granularität der
  Breaker-Fütterung, Abbruch der Retry-Kette bei Breaker-Öffnung im Schlaf,
  429/5xx vs. Timeout/404, Breaker (öffnen/geschlossen bleiben/Timeout zählt/
  startOpen-Gedächtnis), Cooldown (nach Degradation, Abstands-Schutz,
  force-Override, Mandanten-Bewusstsein), Lauf-Klassifikation (alle 7 Zustände),
  Provider-Breakdown, inhaltsfreie Fehlercodes.
- `scripts/crawler-hardening-test.js` (19 Assertions, lokaler Mock-Server):
  amtliche Quellen erfolgreich trotz Google-Totalausfall, 429-Retry am echten
  Crawlpfad, Breaker-fail-fast inkl. Stopp der Requests, Parallelitätsgrenze am
  Server gemessen, Cooldown-Skip, Timeout ohne Retry, legitim leerer Feed bleibt
  ok/'empty', Kill-Switch-Altpfad, kein HTML-Fallback-Zweitrequest.
- `scripts/source-dedupe-test.js` (13 Assertions): Dubletten-Schutz
  (identische ids, ähnliche Namen, keine verlorene Quelle, Präferenzregel:
  Slug-Query verliert gegen kuratierte Namens-Query).

## 8 · Adversariale Review (durchgeführt, Ergebnisse eingearbeitet)

Fünf unabhängige Review-Perspektiven (Zeile-für-Zeile, entferntes Verhalten,
Cross-File-Tracing, Wiederverwendung/Vereinfachung, Effizienz/Altitude) fanden
9 substanzielle Punkte — **alle behoben**, u. a.: leere Feeds fälschlich als
Fehler (Fehlalarm-Risiko), Breaker-Fütterung zu träge (Quell- statt
Versuchs-Granularität), unbegrenzte Backoff-Zeit bei Teil-Drosselung
(→ Retry-Budget), Skip-Läufe rissen die Absolutschwellen des alten Watchdogs
(→ skip-bewusste Report-Basis), `duplicate-event` als „kein Kanal" fehlgedeutet,
Event-ID-Kollision bei Report-Crashes, `force` nicht verdrahtet,
Multi-Tenant-Lücken (Lauffenster 5→20, Breaker-Gedächtnis), Verlust der
besseren Namens-Query bei der Dubletten-Auflösung (→ Präferenzregel).
Bekannte, dokumentierte Grenzen: die URL-Auflösung wird durch das Gate nur auf
≤ Parallelität × 4 begrenzt, nicht einzeln getaktet; Admin-/Release-Check-
Ansichten sind nicht skip-bewusst (heilen mit dem nächsten Cron); ein direkt
nach einem Alt-Lauf (ohne Mandats-Kennung) startender erster Post-Deploy-Crawl
kann einmalig konservativ in den Abstands-Schutz laufen.

_Keine Behauptung von Betriebsreife: die Werte in §4 sind Empfehlungen und
werden erst durch echte Production-Beweisläufe bestätigt (Freigabe-Gate)._
