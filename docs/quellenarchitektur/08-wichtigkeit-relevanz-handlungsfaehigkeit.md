# Globale Wichtigkeit · persönliche Relevanz · Handlungsfähigkeit + drei Leerzustände (Sprint 5)

**Auftragsphase 3 (Produktlogik) · Abhängig von:** Sprint 2 (Ebenen/Geografie/Entitäten für die
Wichtigkeit). Erklärt, warum Lage, Radar und Helmut ab jetzt **je eine eigene Dimension** ranken und
wie ein Datenausfall nie mehr mit einem ruhigen Tag verwechselt wird.

## Das Problem (vor Sprint 5)

Lage, Radar **und** Helmut rankten faktisch nach **derselben** persönlichen Relevanz
(`matching.js`-Ähnlichkeit bzw. `decisions`-Score). Zwei Folgen:
1. **Die Lage wurde zur persönlichen Filterblase** — ein bundesweit wichtiger Vorgang ohne direkten
   Profilbezug rutschte nach unten, obwohl „Worüber muss ich heute Bescheid wissen?" objektiv ist.
2. **„Datenlücke" war von „ruhiger Tag" nicht unterscheidbar** — ein leerer Tab konnte einen echten
   Quellenausfall ODER einen wirklich ruhigen Tag bedeuten. Für einen politischen Stabschef ist das
   ein gefährlicher Unterschied.

## Die drei getrennten Dimensionen (`lib/helmut/scoring.js`)

Reine, deterministische Logik (keine KI, kein Netz, kein Storage). Alle Signale liegen bereits im
Knowledge Object (Understanding + Sprint-2-Klassifikation) vor.

### 1. Globale Wichtigkeit (`globalImportance`) → **Lage**
**Mandantenlos, profilunabhängig, objektiv.** Misst, wie folgenreich ein Vorgang *an sich* ist —
unabhängig davon, wen er betrifft. Gewichtete Faktoren (Summe 100):

| Faktor | Gewicht | Quelle im KO |
|---|---|---|
| Ebenen-Reichweite | 26 | `decision_level` (+ `related_levels`-Breite) |
| Ereignisgewicht | 20 | `event_type` (Gesetzentwurf/Kabinett/Abstimmung > Bericht/Sonstiges) |
| institutionelle Breite | 14 | `decision_entities`/`ministerien`/`parteien`/`ausschuesse` |
| Quellenkorroboration | 16 | `source_document_count` (log-skaliert) |
| Einsatz | 14 | `risk_level`/`opportunity_level` (bzw. Risiken/Chancen) |
| Dringlichkeit | 10 | `zeitdruck`/`deadline` |

**Bewusst ohne Recency-Anteil:** Wichtigkeit ist keine Aktualität. Frische ist ein separates Signal
(s. u.) und dient in der Lage nur als **Tie-Break** innerhalb gleicher Wichtigkeit — das ersetzt den
alten reinen Recency-Fallback.

### 2. Persönliche Relevanz (`personalRelevance`) → **Radar**
**Profilabhängig = Nähe + Dynamik.**
- **Nähe** (`proximityScore`, 0..1): belegbasierter Feldabgleich Person/Ausschuss/Partei/Wahlkreis/
  Thema (gewichtet, Person am stärksten). Person-Erwähnung ganzwortgenau (kein Teilstring-Fehltreffer).
- **Dynamik** (`dynamicsScore`, 0..1): Neuheit (`status`), Recency (jüngster **echter** Quellen-
  zeitpunkt, nicht `updated_at`) und Widerhall (Quellenhäufung).
- **Nähe ist das Gate:** ohne Nähe ist relevance = 0, egal wie dynamisch — sonst würde das Radar zur
  globalen Trendliste. Formel: `relevance = 0.65·Nähe + 0.35·Dynamik` (nur bei Nähe ≥ Schwelle).

### 3. Handlungsfähigkeit (`actionability`) → **Helmut**
Wie **konkret** kann der/die Abgeordnete handeln? Gewichtete Faktoren (Summe 100):

| Faktor | Gewicht | Quelle im KO |
|---|---|---|
| konkrete Schritte | 32 | `action_items_struct` (aktiver `actionType` + `dueHint`) |
| Zeitfenster | 20 | `zeitdruck`/`deadline` |
| verfügbarer Kanal | 20 | `recommended_communication_struct` (+ Passung zu `preferredChannels`) |
| Hebel | 16 | `risk_of_no_action`/`opportunity_summary` + Stufen |
| Mandats-Zugriff | 12 | eigener Ausschuss > Partei > Wahlkreis |

Die drei Dimensionen sind **entkoppelt**: ein global wichtiger Vorgang kann persönlich irrelevant
sein; ein persönlich naher Vorgang kann kaum handelbar sein. Genau das ist der Sinn der Trennung
(im Test bewiesen).

## Ranking je Tab

- `rankForLage(kos)` → globale Wichtigkeit ↓, Frische als Tie-Break. **Profilunabhängig.**
- `rankForRadar(kos, profile)` → persönliche Relevanz ↓ (nur Vorgänge mit Nähe > 0).
- `rankForHelmut(kos, profile)` → Handlungsfähigkeit ↓, globale Wichtigkeit als Tie-Break.

## Die drei klar unterscheidbaren Leerzustände (`tabEmptyState`)

Jeder Tab liefert bei Leere einen **harten Diskriminator** `kind`, damit ein Ausfall nie als ruhiger
Tag missgedeutet wird:

| `kind` | Bedeutung | Beispieltext |
|---|---|---|
| `gap` | gar keine Daten | „Datenlücke — Datenausfall/Backlog, kein ruhiger Tag, bitte Quellenlauf prüfen." |
| `stale` | Daten vorhanden, aber zu alt (> Frische-Schwelle) | „Quellen veraltet (X h) — mögliche Datenlücke, nicht als ruhiger Tag werten." |
| `quiet` | Daten **frisch**, aber für DIESEN Tab nichts Passendes | tab-eigener Text (s. u.) |

Der `quiet`-Fall ist **pro Tab** unterschiedlich:
- **Lage** `ruhige-lage`: „Heute nichts von überregionaler Bedeutung. Die Quellen sind aktuell."
- **Radar** `kein-umfeldsignal`: „Aktuelle Vorgänge, aber keiner berührt dein Mandat."
- **Helmut** `kein-handlungsbedarf`: „Frische Datenlage, aber kein konkreter Handlungsansatz."

`assessFreshness(kos)` liefert das zugrunde liegende Frische-/Qualitätssignal (`newestAgeHours`,
`isFresh`, `isStale`) — server- **und** UI-seitig sichtbar (im Client als `data-empty-kind` +
ehrliche Überschrift/Erklärung je Tab).

## Verdrahtung — additiv, flag-gesichert, Default AUS

Damit **nichts** am Live-Verhalten kippt, hängt das Scoring an einem Feature-Flag
`HELMUT_SCORING_MODE` (`off` | `shadow` | `on`), **Default `off`**:

- **`off`** (heute): Lage/Radar/Helmut verhalten sich **byte-identisch** wie vor Sprint 5. Kein
  `emptyState`-Feld, kein neues Ranking. Alle Alt-Tests unverändert grün.
- **`on`**: Lage rankt nach Wichtigkeit (statt persönlicher Filterblase, ersetzt Recency-Fallback);
  Helmut priorisiert Handlungsfähigkeit; alle drei liefern den unterscheidbaren Leerzustand; der
  Client zeigt ihn an.

Eingehängt in: `lage.js` (`loadRankedVorgaenge` + `unavailable`), `briefingContract.js`
(`buildCurrentHelmutState` + `emptyCurrentHelmutState`), `radarState.js` (`emptyRadarState`),
`client.js` (die drei Leerzustands-Renderer). Radar bewertet Nähe+Dynamik belegbasiert bereits selbst;
neu ist dort der unterscheidbare Leerzustand.

## Tests (offline, deterministisch)

- `test:scoring` (73) — die drei Dimensionen, ihre Entkopplung, Ranking, Frische, Leerzustände, Flag,
  Gate-Sicherheit (Ähnlichkeit öffnet das Nähe-Gate nicht), Edge-Cases (kein Zeitstempel).
- `test:scoring-integration` (21) — Flag AUS = unverändert / Flag AN = neues Ranking + Leerzustände
  über die echten Read-Verträge, inkl. `buildLageBriefing` end-to-end und Map-`kosById`.
- `test:scoring-ui` (10) — die drei Client-Renderer zeigen den Leerzustand unterscheidbar an.

## Freigabepflichtig (vorbereitet, NICHT ausgeführt)

`HELMUT_SCORING_MODE=on` scharf schalten **ist ein Deployment-Schritt** und damit freigabepflichtig.
Empfohlen: zuerst `shadow` (mitrechnen, beobachten), dann `on`. Kein Write-Time-`importance`-Backfill
nötig — die Scores werden read-time deterministisch berechnet; ein späteres write-time-Persistieren
(Spalte `importance`) ist optional und ebenfalls freigabepflichtig.
