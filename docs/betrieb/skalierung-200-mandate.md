# Skalierung auf 200 Mandate — Stand und Kapazität

**Stand:** 2026-08-08 · OP-30, Korrektur- und Abnahmesprint
**Rechengrundlage:** [`scripts/skalierungsmodell.js`](../../scripts/skalierungsmodell.js) — die **einzige** Quelle für diese Zahlen
**Simulation:** [`scripts/skalierung-simulation-test.js`](../../scripts/skalierung-simulation-test.js) — 64 PASS / 0 FAIL / 3 OFFEN

**Kennzeichnung:** `lokal bewiesen` · `lokal simuliert` · `berechnet` · `offen` · `erst in Production beweisbar`

---

## 1 · Die Kernaussage

**200 Mandate sind lokal innerhalb eines simulierten Tages nachgewiesen.** Die letzte
Pflichtarbeit endet um **21:38:00** — mit 2 h 22 min Reserve bis 24:00:00. (`lokal simuliert`)

Das gilt **mit ausreichender Kapazität**. Mit dem heutigen Deckel gilt es **nicht** (§3).

## 2 · Warum es vorher „25 Stunden" waren

Die frühere Messung nannte 25 Stunden. Die Ursache war **nicht** Kapazität, **nicht** Budget,
**nicht** Worker-Parallelität und **nicht** Wiederholungen. Es waren zwei Dinge:

**(a) Die eigentliche Ursache — ein Fälligkeitsfenster ohne Platz für die Arbeit.**
`briefing_materialization` wurde im Fenster **75–98 %** des Tages geplant. Der letzte
Briefingauftrag wurde damit erst bei **23:28** fällig und musste danach noch seine
Vorbedingungen prüfen und laufen. Gemessen: Fälligkeit des letzten Briefings **23,47 h**.
Ein Fenster muss Platz für das lassen, was darin passieren soll — die Obergrenze ist deshalb
jetzt **90 %** (letzte Fälligkeit 21:36, gut zwei Stunden Luft).
Die **Reihenfolge** bleibt unverändert: Briefing beginnt weiterhin genau dort, wo die
Projektion endet (75 %). (`lib/helmut/source-demand.js`)

**(b) Ein Abtastfehler der Simulation.** Sie ließ den Worker **einmal je simulierter Stunde**
laufen, während `VORBEDINGUNG_WARTE_MS` **2 Minuten** beträgt — sie tastete den Betrieb also
mit einem Dreißigstel der zulässigen Rate ab. Zusätzlich rundete `stunde + 1` auf volle
Stunden auf: aus „fertig um 23:58" wurde „24 Stunden", aus „fertig um 24:02" wurde „25".

Der Takt ist jetzt ein Parameter und steht auf der Granularität, die das System selbst
vorgibt. **Das ist keine künstliche Beschleunigung:** keine Arbeit übersprungen, kein Deckel
erhöht, kein Tag verlängert, keine Wartezeit verkürzt — nur die künstliche *Verlangsamung*
der Messung entfernt. Der Fertigstellungszeitpunkt wird jetzt **exakt** ausgewiesen.

## 3 · Der Deckel

Drei Zahlen, die nicht verwechselt werden dürfen (`lokal bewiesen` aus dem Code):

| Zahl | Bedeutung |
|---|---|
| **50** | `storage.js` `LLM_LIMIT_FALLBACK` — greift fail-closed, wenn `HELMUT_MAX_LLM_CALLS_PER_DAY` fehlt oder unbrauchbar ist |
| **100** | Runbook-**Empfehlung** in einem Codekommentar — **nicht** wirksam |
| **?** | Der in Production gesetzte Wert ist **offline nicht lesbar** (`offen`) |

**Mit Deckel 100 reicht es nicht, und die Simulation zeigt das ehrlich:** von 200 Mandaten
werden 100 bedient, der Rest bleibt sichtbar liegen. Das ist kein Fehler der Verteilung,
sondern eine **rechnerische Unmöglichkeit** — der realistische Tagesbedarf liegt bei
**1 645** Aufrufen. Diese Lücke wird nicht durch Scheduler-Änderungen verdeckt.

### Bedarf und Empfehlung für 200 Mandate (`berechnet`)

| Größe | Wert |
|---|---|
| KI-Aufrufe/Tag, realistisch | **1 645** (global 1 435 · mandatsbezogen 210) |
| davon global (einmal für alle) | **87,2 %** |
| KI-Aufrufe/Tag, Stress | 12 476 |
| Erstbefüllung, einmalig | 19 197 |
| **Mindestdeckel** (realistisch) | **1 645** |
| **Empfehlung mit 30 % Reserve** | **16 300** (Stresswert + 30 %, auf volle Hunderter) |
| Warnschwellen | gelb 11 410 · rot 14 670 |

Die Empfehlung ist bewusst am **Stresswert** ausgerichtet, nicht am Realwert: ein Deckel, der
nur den Normalfall trägt, ist an dem Tag zu klein, an dem es darauf ankommt.

### Die Aufteilung des Deckels — ein neuer Befund

`llm-budget-fair.js` hält `GLOBAL_ANTEIL_STANDARD = 0.5` als **Reserve** für das globale
Verstehen zurück; mandatsbezogene Arbeit darf diesen Topf nie anfassen. Als Schutz richtig —
die Zahl passt aber nicht zum gemessenen Bedarf:

| Mandate | Bedarfsanteil global | Deckel bei 50/50 | Deckel bei passender Aufteilung | Aufschlag |
|---|---|---|---|---|
| 5 | 98,5 % | 770 | 391 | 1,97× |
| **200** | **87,2 %** | **2 870** | **1 645** | **1,74×** |
| 1 000 | 79,8 % | 8 312 | 5 206 | 1,60× |

Bei starrer 50/50-Aufteilung muss der Deckel also **1,6–2,0× größer** sein als der Bedarf —
sonst hungert das Verstehen, während der Mandatstopf halb ungenutzt bleibt. Der zum Bedarf
passende Wert für 200 Mandate wäre `HELMUT_LLM_GLOBAL_ANTEIL = 0.87`.
**Nichts davon wurde gesetzt** — die Fairness ist ohnehin nur bei `HELMUT_LLM_FAIRNESS=on`
wirksam, und dieses Flag ist aus.

## 4 · Kosten für 200 Mandate (`berechnet`, Preisbasis **unbelegt**)

| Größe | Wert |
|---|---|
| Tokens/Tag | 5 320 000 ein · 1 379 000 aus |
| Kosten/Tag | 4,09 USD |
| Kosten/Monat | 122,64 USD |
| **Kosten je Mandat/Monat** | **0,61 USD** |
| Warteschlange/Tag · Bestand | 2 711 · 37 954 Zeilen |
| Speicherzuwachs/Tag | 16,7 MB |

**Die Preisbasis ist ein unbelegter Schätzwert im Code.** Die Beträge sind **berechnet**, nicht
vom Anbieter gemeldet — als Größenordnung belastbar, **nicht** als Rechnungsbetrag. Die Formel
und ihre Eingabeparameter stehen in `scripts/skalierungsmodell.js`; `HELMUT_LLM_PRICE_JSON`
überschreibt die Preisbasis, sobald belegte Preise vorliegen.

## 5 · Was die Simulation abdeckt (`lokal simuliert`)

Vierzehn Fälle, alle grün: Deckel 100 · ausreichende Kapazität · 30 % Reserve · Normalbetrieb ·
**Erstbefüllung** · HTTP 429 · Teilausfall · **Vollausfall** · Workerabsturz und Wiederaufnahme ·
doppelte Scheduler-Auslösung · mehrere konkurrierende Worker (2/4/8) · langsame Verarbeitung ·
Tageswechsel · **interaktive Nutzung neben der Pflichtarbeit**.

Die Abnahmekriterien halten in allen Fällen: alle 200 Mandate berücksichtigt · Pflichtarbeit
im Tag beendet · kein Mandat verhungert · Pflicht vor Kür · kein Verlust · keine doppelte
Arbeit · **keine doppelte Kostenbuchung** · kein fremder Inhalt · jeder Vorgang mit Quelle ·
Ausfälle sichtbar statt „ruhiger Tag" · Reservierung und Buchung atomar.

## 6 · Was NICHT bewiesen ist

- **Reale Google-Laufzeit unter echter Drosselung** (`erst in Production beweisbar`) — der
  Abruf ist eine Attrappe; die Drosselung wird als Fehlerquote nachgebildet, nicht als Wartezeit.
- **Reale KI-Laufzeit und reale Modellkosten** (`erst in Production beweisbar`).
- **Verhalten unter echter Production-Last** (`erst in Production beweisbar`) — die Uhr ist
  virtuell.
- **Der wirksame Production-Deckel** (`offen`).
- **200 echte Mandatsprofile** (`offen`) — es gibt **10**; siehe
  [`op30-abnahme-2026-08-08.md`](op30-abnahme-2026-08-08.md) §6.

## 7 · Verwandte Dokumente

- [`op30-abnahme-2026-08-08.md`](op30-abnahme-2026-08-08.md) — Beleg des vorangegangenen Abnahmesprints
- [`workerbetrieb.md`](workerbetrieb.md) — Worker, Bereinigung, Vercel-Entscheidung
- [`lokaler-production-schutz.md`](lokaler-production-schutz.md) — Schutz vor versehentlichem Production-Zugriff
- [`env-inventar.md`](env-inventar.md) — alle Variablen und ihre Herkunft
