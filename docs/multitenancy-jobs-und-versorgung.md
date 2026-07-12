# Job-Mandantentrennung & Versorgungsmatrix (Phase 6-8)

**Stand:** 2026-07-12 · **Branch:** `claude/helmut-multi-tenant-is7j32`
**Tests:** `scripts/profile-supply-matrix-test.js` (20/20)

---

## Phase 6/7: Profilversorgungsmatrix (getestet, in-memory gegen echte Engine)

13 repräsentative Testprofile laufen durch die **echte** In-Memory-Matching-Engine
(`matching.matchProfileToKnowledgeObjects`) gegen einen repräsentativen KO-Korpus.
Kein Netz, keine KI, keine Production-Daten — reproduzierbar per `npm run test:supply-matrix`.

| # | Testprofil | Partei | Ebene | Ausschuss | erwarteter Top-Treffer | Zustand |
|---|---|---|---|---|---|---|
| T1 | CDU Bundestag Großstadt | CDU | Bundestag | Finanzen | ko-finanz | Vollständig |
| T2 | SPD Bundestag ländlich | SPD | Bundestag | Gesundheit | ko-gesundheit | Vollständig |
| T3 | Grüne | Grüne | Bundestag | Umwelt | ko-umwelt | Vollständig |
| T4 | Linke Arbeit & Soziales | Die Linke | Bundestag | Arbeit und Soziales | ko-arbeit | Vollständig |
| T5 | FDP Wirtschaft/Digitales | FDP | Bundestag | Wirtschaft | ko-wirtschaft | Vollständig |
| T6 | AfD Innenpolitik | AfD | Bundestag | Innenausschuss | ko-innen | Vollständig |
| T7 | fraktionslos | Fraktionslos | Bundestag | Gesundheit | ko-gesundheit | Vollständig |
| T8 | Landtag NRW | SPD | Landtag | Bildung | ko-nrw | Vollständig |
| T9 | Landtag Bayern | CSU | Landtag | Landwirtschaft | ko-bayern | Vollständig |
| T10 | neu ohne Historie | FDP | Bundestag | Wirtschaft | ko-wirtschaft | Vollständig |
| T11 | unvollständig (kein Ausschuss/Region) | SPD | Bundestag | — | (nur Partei) | Teilweise |
| T12 | leer | — | — | — | (nichts) | Nicht bereit |
| T13 | deaktiviert | CDU | Bundestag | Finanzen | (übersprungen) | Deaktiviert |

**Bewiesene Kernaussagen (alle grün):**
1. **Jedes vollständige Profil trifft sein Fachfeld** (T1-T10 treffen ihr erwartetes KO mit Identitätsmerkmalen).
2. **Unterschiedliche Profile → unterschiedliche Ergebnisse:** T1-T6 erhalten **sechs verschiedene** Top-Treffer (Kernkriterium „Kunde A ≠ Kunde B").
3. **Keine Cross-Contamination:** ein CDU-Profil bekommt am Linke-Arbeit-KO keinen Partei-Treffer und umgekehrt.
4. **Kein erfundener Treffer:** ein unvollständiges Profil feuert nur die Dimension, die es wirklich hat (Partei), nie Ausschuss/Region; ein leeres Profil bekommt gar nichts.
5. **Validierungszustände korrekt** (vollständig/teilweise/nicht_bereit/deaktiviert).

**Grenze:** die Matrix misst die *Engine* (Matching/Personalisierung), nicht die
Production-*Quellenlage*. Reale Versorgung hängt zusätzlich am Quellenbestand
(Landtags-Quellen fehlen z. B. noch — `audit/source-coverage.md`). Die Engine
personalisiert korrekt; ob genügend passende Vorgänge existieren, ist eine separate
Quellen-Frage.

---

## Phase 8: Verarbeitung pro Mandant — Job-Analyse

### Welche Jobs sind global (mandantenlos) vs. pro Profil?

| Job | Ebene | Mandantenbezug |
|---|---|---|
| **crawl / pipeline** (`runSourceCrawl`) | global | Sammelt öffentliche `raw_documents` — **mandantenlos**, korrekt (ein Lauf für alle) |
| **understanding** (eager + cron) | global | Erzeugt `knowledge_objects` (öffentliche Vorgänge) — **mandantenlos**, 1 KI-Call pro Vorgang für alle |
| **matching / decisions** | pro Profil | Rechnet pro `userId` (In-Memory-Ranker) — **mandantengetrennt** |
| **morning-briefing** (`buildV3Briefing`) | pro Profil, aber **heute nur 1** | Cron nutzt eine einzelne `politicianId` (Default cem-ince) |
| **lage-briefing** (Cron-Prewarm) | **pro Profil (Loop)** | Iteriert `listProfiles()`, per-Profil try/catch, eigener Cache je `bf-<user>-<slot>-<tag>` |
| **lage-check** | pro Profil, aber **heute nur 1** | Cron nutzt eine einzelne `politicianId` |
| **health-report** | global (Betreiber) | Operator-Diagnose, kein Kundeninhalt |

### Welche Jobs zeigen heute noch fest auf Cem?

- `runSourceCrawl`, `runLageCheck`, `buildV3Briefing` (morning-briefing), `buildHealthReport`
  haben **Default `politicianId = cemInceProfile.id`** (scheduler.js:155/288, server.js).
  Für crawl/understanding ist das **egal** (mandantenlos — der Default steuert nur,
  welches Profil den Lauf „besitzt", die Daten sind geteilt).
  Für morning-briefing/lage-check bedeutet es: **diese Crons versorgen heute nur EIN
  Profil** (cem-ince). Für echten Mehrmandantenbetrieb müssten sie — wie lage-briefing
  bereits — über `listProfiles()` loopen. **Das ist eine bewusste offene Aufgabe**, weil
  ein Loop die Cron-Laufzeit/-Kosten erhöht (mehr Profile = mehr Arbeit pro Lauf) und in
  die Nähe einer Cron-/Kosten-Entscheidung rückt → Freigabepunkt, hier NICHT umgesetzt.

### Welche Jobs dürfen bei einem Fehler nur einen Kunden betreffen?

- `lage-briefing` erfüllt das bereits: **per-Profil try/catch** — ein Profil-Fehler
  stoppt die anderen nicht.

### Sichere Code-Änderung in diesem Sprint (umgesetzt)

- **Deaktivierte Profile nehmen an der Verarbeitung nicht teil:** die `lage-briefing`-
  Schleife überspringt jetzt Profile mit Validierungszustand „deaktiviert"
  (`validateProfile(profile).disabled`) — sie erzeugen kein Briefing mehr und tauchen
  als `profil-deaktiviert` im Ergebnis auf. Fehlerhafte/leere Profile liefern ohnehin
  natürlich einen Leerzustand; nur die bewusst deaktivierten werden aktiv übersprungen.
  Reine App-Logik, keine Cron-/Schedule-Änderung. Rollback = revert.

### Bewusst NICHT angefasst (Freigabepunkte)

- **morning-briefing/lage-check auf Multi-Profil-Loop umstellen** — erhöht
  Cron-Laufzeit/-Kosten, rückt an eine Cron-/Kosten-Entscheidung → Freigabe nötig.
- **Cron-Schedules** (`vercel.json`) — Stop-Bedingung.
- **KI-Budget-Enforcement pro Mandant** — eigener Schritt (Phase 10), s. u.
