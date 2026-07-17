# Sprint 5 — Abschlussbericht (globale Wichtigkeit · persönliche Relevanz · Handlungsfähigkeit · 3 Leerzustände)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible, additive Arbeiten — **keine** Production-Migration,
keine Production-Datenänderung, keine RLS-Änderung, kein Deployment, keine Quellenaktivierung.

## 1. Architektur

Neues reines Logik-Modul `lib/helmut/scoring.js` (KEINE KI, kein Netz, kein Storage) mit drei
**getrennten** Bewertungsdimensionen — je eine pro Oberfläche — plus einem Leerzustands-Klassifikator:

- **`globalImportance(ko)`** — mandantenlose, profilUNabhängige, objektive Wichtigkeit aus
  Ebene/Ereignistyp/institutioneller Breite/Korroboration/Einsatz/Dringlichkeit. Bewusst **ohne**
  Recency-Anteil. → **Lage**.
- **`personalRelevance(ko, profile)`** — Nähe (belegbasierter Feldabgleich, Person am stärksten) **+**
  Dynamik (Neuheit/Recency/Widerhall). Nähe ist das Gate (ohne Nähe = 0). → **Radar**.
- **`actionability(ko, profile)`** — konkrete Schritte/Zeitfenster/Kanal/Hebel/Mandats-Zugriff. → **Helmut**.
- **`rankForLage` / `rankForRadar` / `rankForHelmut`** — Ranking je Tab nach seiner Dimension.
- **`assessFreshness` + `tabEmptyState`** — drei unterscheidbare Leerzustände mit hartem Diskriminator
  `kind`: **gap** (keine Daten), **stale** (zu alt → Ausfall-Verdacht), **quiet** (frisch, aber für den
  Tab nichts Passendes). Der `quiet`-Text ist pro Tab eigen (`ruhige-lage` / `kein-umfeldsignal` /
  `kein-handlungsbedarf`) — **Datenlücke wird nie mit ruhigem Tag verwechselt**.

**Verdrahtung additiv + flag-gesichert (Feature-Flag `HELMUT_SCORING_MODE`, Default `off`):** Bei
`off` verhalten sich Lage/Radar/Helmut **byte-identisch** wie vor Sprint 5 (kein `emptyState`-Feld,
kein neues Ranking). Bei `on` rankt Lage nach Wichtigkeit (statt persönlicher Filterblase, ersetzt den
reinen Recency-Fallback), Helmut nach Handlungsfähigkeit, und alle drei Tabs zeigen server- **und**
UI-seitig den unterscheidbaren Leerzustand. Eingehängt in `lage.js`, `briefingContract.js`,
`radarState.js`, `client.js` (drei Leerzustands-Renderer).

## 2. Umsetzung der Sprint-Vorgaben
| Vorgabe (Auftrag/Sprintplan) | Ergebnis |
|---|---|
| write-time globaler `importance`-Score, mandantenlos | ✅ `globalImportance` (read-time deterministisch; write-time-Persistenz optional/freigabepflichtig) |
| getrennt vom persönlichen Relevanz-Score | ✅ `personalRelevance` (Nähe+Dynamik), nachweislich entkoppelt |
| eigene `actionability`-Dimension | ✅ `actionability` |
| Lage nach Wichtigkeit, Radar nach Relevanz, Helmut nach Handlungsfähigkeit | ✅ `rankForLage/Radar/Helmut` + flag-gesicherte Verdrahtung |
| Recency-Fallback ersetzen | ✅ Lage-Fallback → Wichtigkeits-Ranking (Frische nur noch Tie-Break) |
| 3 Leerzustände server- **und** UI-seitig unterscheidbar (Frische-/Qualitätssignal pro Tab) | ✅ `tabEmptyState` (gap/stale/quiet) + `data-empty-kind`/Text im Client |

## 3. Tests — alle grün
- **`test:scoring` 73/73** — Dimensionen, Entkopplung, Ranking, Frische, drei Leerzustände, Flag.
- **`test:scoring-integration` 21/21** — Flag AUS = unverändert, Flag AN = neues Ranking + Leerzustände
  über die echten Read-Verträge (Lage/Radar/Helmut, inkl. `buildLageBriefing` end-to-end).
- **`test:scoring-ui` 10/10** — die drei Client-Renderer zeigen den Leerzustand unterscheidbar an;
  ohne `emptyState` unverändert.
- **Keine Regression:** lage 138, radar 38, radar-state 102, decisions 38, briefing-contract 31,
  helmut-state 79, helmut-fields 65, helmut-ui 50, radar-ui 18, slot-aware 49, p1 322, drei-profile 93,
  source-architecture 88, ko-classification 67, dedup-findings 30, profile-packages 57,
  profile-validation 36, supply-matrix 20, saas 70, tenant 37, contract 17.

### Nachgezogene Verify-Korrekturen (adversarialer Verify-Workflow)
Der adversariale Verify-Workflow (5 Lenses + Widerlegungs-Panel) fand 9 bestätigte Befunde — alle
behoben und getestet: **3 echte Code-Probleme** und **6 Test-Härtungen**.
1. **(hoch) Helmut-Leerzustand meldete frische Daten fälschlich als `gap`.** Im Read-Pfad `keine-treffer`
   setzt der Server `kosById={}`, die breite verstandene Menge kommt als `knowledgeObjects` — die ging
   nur an Radar, nicht an Helmut. Jetzt bekommt `buildCurrentHelmutState` `knowledgeObjects` und leitet
   die Frische daraus ab → korrekt `quiet` (kein-handlungsbedarf) statt `gap`. Konsistent mit Radar.
2. **(niedrig) Ähnlichkeit konnte das belegbasierte Nähe-Gate allein öffnen.** `proximityScore` ist jetzt
   **rein belegbasiert**; die matching.js-Ähnlichkeit verstärkt erst **nach** bestandenem Gate den Score.
3. **(niedrig) Lage-Quarantäne-Leerzustand berechnete Frische aus Roh-KOs.** Jetzt werden die bereits
   geladenen echten Quellen (`published_at`) angehängt, statt auf den unzuverlässigen `updated_at`-
   Fallback zu fallen → `stale` wird nicht mehr fälschlich `quiet`.
4. **(Tests)** tautologische „profilunabhängig"-Assertions durch echte Zwei-Profile-Nachweise ersetzt;
   Lage-Leerzustand jetzt **end-to-end** über `buildLageBriefing` getestet (gap/stale/quiet); Ranking-
   Entkopplung über die geteilte Schnittmenge statt Längendifferenz; Edge-Case „kein Zeitstempel → stale";
   Ganzwort-Fehltreffer echt geprüft (Personenname des Piloten als Präfix eines längeren Wortes, Muster `Muster` in `Musterung`); Map-`kosById` + leeres Profil ergänzt.

## 4. Sicherheit, Kosten, Performance
- **Sicherheit/Mandanten:** `globalImportance` ist strikt mandantenlos; `personalRelevance`/
  `actionability` lesen nur das übergebene Profil. Kein DB-/RLS-Zugriff, keine PII.
- **Kosten:** keine — reine, deterministische Logik, 0 KI, 0 Netz. Kein neuer KI-Call.
- **Performance:** O(n) je Vorgang, keine Netz-/DB-Aufrufe; nicht im App-Start-Kritikpfad.
  Bei `off` **kein** zusätzlicher Aufwand (früher Flag-Return).

## 5. Offene Risiken / Grenzen
- **Nicht scharf geschaltet.** `HELMUT_SCORING_MODE=off` ist Default; das Scharfschalten (`shadow` →
  `on`) ist ein **Deployment-Schritt** und damit freigabepflichtig.
- **Dynamik = Momentaufnahme,** kein echter Zeit-Trend (Neuheit/Häufung/Recency), konsistent mit dem
  bestehenden Radar-Prinzip „echte Zählungen, kein Trend-Rat".
- **Feature-Vektor bleibt** ein technischer Merkmalsvektor (kein semantisches Embedding) — die
  Nähe-Berechnung ist belegbasiert, kein Bedeutungs-Matching (Embedding-API wäre freigabepflichtig).

## 6. Noch nicht ausgeführte Production-Schritte (gesammelt, nichts ausgeführt)
`HELMUT_SCORING_MODE` scharf (erst `shadow`, dann `on`) · optionales write-time-Persistieren des
`importance`-Scores (Spalte + Backfill) · Migrationen `20260713`/`20260714`/`20260715` + Seeds ·
Crawl-Umstellung global-once (Referenzzählung) · Landespakete aktivieren. **Alles vorbereitet,
nichts ausgeführt.**

## 7. Nächster Sprint
**Sprint 6** (Migration bestehender Quellen · Shadow-Betrieb · Alt-gegen-Neu-Vergleich, Pilot-Schutz) —
**oder** Sprint 8 (Admin-Oberfläche), die `profileSupplyStatus`/`computeGlobalActivation` (S4) und die
neuen Scores/Leerzustände (S5) sichtbar macht.
