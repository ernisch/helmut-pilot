# Tageslimit-Analyse + Cheap-Triage-Abgrenzung (read-only)

Stand: read-only aus Production gemessen. **Keine** Production-Änderung, kein Flag, kein Deckel,
kein Cron verändert.

## Teil 6 — Cheap-Triage: klare Abgrenzung (NICHT aktiv)

- Die günstige KI-Prüfung der Grenzfälle (`zurueckstellen` → gpt-4o-mini) ist **bisher nur
  simuliert** und **nicht produktionsbereit**. Sie ist in diesem Stand **nicht implementiert und
  nicht aktiviert**.
- `HELMUT_UNDERSTANDING_GATE=on` (echter Vorfilter) bleibt **gesperrt** — der Reader erkennt `on`,
  aber die Integration schaltet nicht scharf (nur Protokoll + Hinweis „freigabepflichtig").
- Eine Änderung des Tageslimits (`HELMUT_MAX_LLM_CALLS_PER_DAY`) bleibt **gesperrt** (eigene
  spätere Freigabe).
- In diesem Schritt wird davon **nichts** aktiviert oder implementiert.

## Teil 7 — Tageslimit: Realdaten + Empfehlung

### Exakter Wert
`HELMUT_MAX_LLM_CALLS_PER_DAY` ist über die verfügbare Vercel-MCP-Schnittstelle **nicht direkt
lesbar** (kein Env-Variable-Getter vorhanden). Der Wert wurde **nicht** verändert. Das reale
Verhalten belegt eindeutig einen aktiven, endlichen Deckel (siehe unten). Code-Default ohne gesetzte
Variable wäre `Infinity` (`storage.js:llmDailyCallLimit`) — da real gedeckelt wird, ist die Variable
in Production **gesetzt** (Wert per Dashboard gegenzuprüfen).

### Reale Durchlaufzahlen (14 Tage, echter Kostenlog `helmut_store['main-auth']`)
- Ausgeführte Understanding-Calls: **201** über 13 Tage → **Ø 15,5/Tag**.
- Durch Deckel blockiert (`skipped-understanding-budget`): **1088** → ~78/Tag.
- Ø Kosten/Understanding-Call: **$0,001999** (2214 Input- / 723 Output-Token, gpt-5-mini).
- Nicht-Understanding-Billable-Calls: **~27/Tag** (communicationDraft, koTagsBackfill,
  v2ScoreAndPrioritize, helmutAssessment, lageBriefing). Der globale Deckel zählt ALLE Billable-
  Calls, nicht nur Understanding → Understanding-Slots konkurrieren mit diesen.

### Monatskosten-Hochrechnung (nur Understanding, real $0,002/Call)
| Understanding/Tag | Calls/Monat | Kosten/Monat |
|---|---|---|
| 50 | 1.500 | **~$3,0** |
| 100 | 3.000 | **~$6,0** |
| 150 | 4.500 | **~$9,0** |

Selbst 150/Tag kosten ~$9/Monat (Understanding). Der Deckel ist also **weit** unter dem, was die
realen Kosten rechtfertigen.

### Werden amtliche/relevante Vorgänge verdrängt?
**Ja.** Die Auswahl erfolgt nach **Ankunftsreihenfolge** im Crawl-Loop (`runUnderstandingShadow`
seriell, Budget-Gate `canSpendLlm`), nicht nach Relevanz. Nachweis in Phase D: unter knappem
Budget verdrängt die Ankunftsreihenfolge **6/6 amtliche** Vorgänge, die relevanzbasierte
Priorisierung **0/6**. Ein spät im Loop auftauchender amtlicher/relevanter Vorgang wird von einem
früheren Grenzfall verdrängt.

### Empfehlung (Übergangsphase — eigene spätere Freigabe)
- **Zielwert:** ~**100 Understanding-Calls/Tag**. Da die reale Nachfrage im Schnitt **~82/Tag**
  beträgt (574/Woche), deckt 100/Tag den Durchschnitt vollständig und die meisten Tage komplett →
  die Ankunftszeit-Verdrängung entfällt für typische Tage.
- **Konkret:** weil der Deckel ALLE Billable-Calls zählt, für ~100 Understanding/Tag den globalen
  Wert auf **~150** setzen (100 Understanding + ~50 Headroom für Backfill/Draft/Briefing) —
  **oder** Understanding ein eigenes Budget geben.
- **Erwartete Kosten:** ~**$6/Monat** Understanding (+ ~$2 übrige Calls) = **~$8/Monat** gesamt.
- **Langfristig:** den starren Call-Deckel durch **relevanzbasierte Priorisierung**
  (`understanding-priority.js`) **plus echtes tägliches Kostenlimit** (z. B. $X/Tag) ersetzen, sodass
  das Budget nach Wichtigkeit statt nach Ankunftszeit vergeben wird.

**In diesem Schritt wird der Deckel NICHT geändert.** Die Deckeländerung bleibt eine eigene,
ausdrücklich freizugebende Stufe.
