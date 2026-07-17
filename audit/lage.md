# Lage-Audit — Helmut

**Sprint:** SaaS-Readiness-Audit · **Phase 5** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend. Keine Production-Writes, keine Migration, kein Merge, keine Fixes.
**Belegbasis:** `lib/helmut/lage.js`, `matching.js`, `sourceSafety.js`, `briefingContract.js`, `server.js`; SELECT-Abfragen gegen Prod `ddckuvvpcytqbyfmbvie`; Test `lage-test.js` 138/138.

> **Dateiname:** Der Auftrag Phase 5 hat keinen fest vorgegebenen Pfad; die Pflichtartefaktliste kennt keine `lage.md`. Ich lege `audit/lage.md` an (analog zu `radar.md`), da die Lage ein eigener Auditbereich ist; die Kern-Verlustpunkte fließen zusätzlich in `fix-plan.md` ein. **Abweichung erklärt.**

> **Kernbefund:** Die Lage-**Auswahl** ist heute solide (Legacy-Shim repariert; einziger harter Filter = Quellenpflicht). Die realen Verluste liegen (1) im **12s-Interaktiv-Timeout** am App-Start (kann bei kaltem Cache das **komplette** Kartenset nullen), (2) im **200-Load-Cap < Bestand** (13 verstandene KOs unerreichbar), (3) in **degeneriertem Ranking** bei leeren Profilen (alphabetische ID-Sortierung → Null-Personalisierung) und (4) im **nie gelaufenen Presentation-Backfill** (106/162 KOs schwächer dargestellt — kein harter Verlust).

---

## 1. Datenbasis (Prod, verifiziert)

- `knowledge_objects`: 217 (162 complete, 55 pending).
- Presentation-Felder auf den 162 complete (gemessen): `display_summary`/`why_relevant`/`recommendation`/`display_category` je **97**, `display_title` **56**, **alle 5 zusammen = 56**.
- Echte Quellen: **137** complete-KOs mit `best_source_url`; **25** ohne (→ quellenlos, fallen bei Quellenpflicht raus).
- `matching_results`: **0 Zeilen**. `profiles`: 3, alle Feature-Spalten NULL.

---

## 2. Der Lage-Trichter (pro Nutzer; für alle 3 Profile identisch, §5)

| Stufe | Beleg | rein → raus | Verlust | gewollt/technisch |
|---|---|---|---|---|
| **A. Load-Cap** `listKnowledgeObjects({limit:200})`, `order=updated_at.desc` | storage.js:742-746; lage.js:286 | 217 → 200 geladen | **13 complete + 4 pending** (Rang >200) nie ladbar | **technisch** — 13 verstandene KOs strukturell unerreichbar |
| **B. „understood"-Filter** `status≠pending & understanding_status=complete & (was_ist_passiert\|warum_wichtig)` | lage.js:287-290 | 200 → **149** complete | 51 pending fallen (gewollt) | **gewollt** |
| **C. Ranking + Cap** `MAX_VORGAENGE=12` | lage.js:41, 296-314 | 149 → **12** | 137 nicht gezeigt; Ranking degeneriert (§5) | Cap **gewollt**; Rankingsignal **technisch** defekt |
| **D. Source-Safety-Guard** | lage.js:401-404; sourceSafety.js:228-268 | 12 → 12 | 0 (nur 1 KO trägt kritischen Claim, nicht in Top-12) | gewollt, praktisch inaktiv |
| **E. `selectLageVorgaenge` — Quellenpflicht** `lageHasRealSource` | lage.js:355-357, 374-378 | 12 → **10** | **2** quellenlose KOs gedroppt | **gewollt** (keine Provenienz → keine Karte) |
| **F. modern-first (kein Legacy-Cutoff)** | lage.js:363-378 | 10 → 10 | **0** (Legacy nur nachgeordnet, nicht entfernt) | gewollt |
| **Ergebnis** | | | **10 Karten** | |

**Keine harte Presentation-Feld-Pflicht:** `koToVorgangCard` reicht fehlende Felder als `""` durch (lage.js:209-213); `isModernVorgang` (lage.js:364) verlangt nur `summary+why+reco` und beeinflusst **nur die Reihenfolge**, nicht die Aufnahme. `display_title` wird bewusst nicht verlangt. → **Kein Vorgang geht wegen fehlender Presentation-Felder verloren.** Einziger echter Ausschluss in `selectLageVorgaenge` ist die **Quellenpflicht**.

**Kein Themen-Cooldown** im Lage-Pfad (weder in lage.js noch am `/api/app/start`-Pfad) — anders als im alten V2-Audit. Kein Verlustpunkt.

---

## 3. Verlustpunkte — gewollt vs. technisch

**Gewollt (fachlich korrekt):** pending raus (B), Quellenpflicht (E, betrifft 25 KOs global), Top-12-Cap (C), Source-Safety (D).

**Technisch/unbeabsichtigt:**
1. **Load-Cap 200 < 217** (A): 13 complete-KOs für die Lage nie erreichbar. Wächst mit dem Bestand.
2. **`matching_results` leer** (C): der „gespeicherte, personalisierte" Rankingpfad (lage.js:296-301) läuft ins Leere und wird bei **jedem** Nutzer übersprungen. Personalisierung hängt komplett am Offline-Fallback.
3. **Degeneriertes Offline-Ranking bei leeren Profilen** (§5): faktisch alphabetische ID-Sortierung statt Relevanz/Aktualität.
4. **12s-Timeout** kann das **komplette** Kartenset nullen (§4).

---

## 4. Timeout-Analyse (verifiziert)

**Der reale Verlustpunkt ist nicht 280s, sondern 12s.** `/api/app/start` umschließt `buildLageBriefing` mit `withTimeout(…, 12000, "lage-briefing")` (server.js:295). Das Promise liefert **Karten UND Narrativ gemeinsam**. Bei kaltem Cache erzeugt `buildLageBriefing` das KI-Narrativ **inline** (lage.js:468). Dauert das >12s → Reject → `catch` (server.js:296, nur `console.error`) → `briefing.lageBriefing` bleibt **undefined** → **alle 10 Karten verschwinden beim App-Start**, obwohl sie deterministisch vorlagen.

- Die **280s-Budgets** (server.js:618 cron-pipeline, 655 cron-lage-check) betreffen **Crawl/Ingestion**, nicht den Anzeigepfad. Der Cron-Vorwärmlauf `buildLageBriefing` (server.js:675) und `/api/lage/briefing` (server.js:413) haben **keinen** Per-Call-Timeout → verlieren **keine** Vorgänge.
- **Mitigation existiert:** Der lage-briefing-Prewarm-Cron (05:45 UTC) füllt den Tagescache; greift aber nur, wenn er **vor** der ersten Nutzeröffnung lief und der KO-Set-Hash unverändert ist.
- **Klasse:** technisch falscher Leerzustand (Timeout/Teiljob-Fehler).

---

## 5. Dünne-Lage-Profile & Profilgewichtung (verifiziert)

**Alle 3 Profile sind vollständig leer** (alle Feature-Spalten NULL). Folge in `matching.js`:
- `profileWeightedTokens` leer → `embedProfile` → **Nullvektor**.
- `cosineSimilarity(0, kEmb)=0` für **jedes** KO; `matched_features=[]`; die Filterbedingung `similarity<0 && !matched` greift bei similarity=0 nie (matching.js:216/231) → **alle** KOs mit Score 0 aufgenommen.
- Sort-Tiebreak = `id.localeCompare` (matching.js:239-243) → **alphabetische ID-Sortierung**, Slice 12.

→ **Ergebnis identisch für alle 3 Nutzer** (die 12 alphabetisch kleinsten complete-IDs; davon 2 quellenlos → 10 angezeigt). **Kein Profil ist dünn nach Kartenzahl** (je 10). Der Schaden ist **Null-Personalisierung**.

**Profilgewichtung kommt in der Lage NICHT an**, aus zwei Gründen:
1. `matching_results` leer → gespeicherter Pfad tot.
2. `matchingFn` wird in lage.js **ohne `filters`** aufgerufen (nur `{limit:12}`, lage.js:305) → harte Partei/Ausschuss/Region-Filter laufen nie; und bei leeren Profilen ist auch das Embedding-Ranking inert.

→ Partei/Ausschuss/Region/Themen sind **implementiert, aber im aktuellen Pilotdatenstand wirkungslos**. Sie greifen erst, wenn Profile befüllt **und** `matching_results` bestückt (oder das Offline-Embedding auf echte Features trifft) sind. **Detailkette in `profile-coverage.md`.**

---

## 6. Legacy vs. Modern & Backfill (verifiziert)

- **Shim schneidet Legacy NICHT ab.** `selectLageVorgaenge` mischt modern-first + übrige belegte Vorgänge (lage.js:374-378). Der alte Entweder-oder-Zustand („nur zwei Karten") ist **behoben**. Legacy-KOs mit Quelle bleiben sichtbar.
- **`isModernVorgang`** verlangt nur `displaySummary+whyRelevant+recommendation` (lage.js:364). Von 162 complete sind **97 modern**, **65 „legacy"** (≥1 Kernfeld fehlt).
- **Backfill vorhanden** (`lib/helmut/presentation-backfill.js`), aber: Kandidaten = complete-KOs mit ≥1 fehlenden Presentation-Feld = 162−56 = **106 un-backfilled**. Default **DRY-RUN** (backfill:129), manueller Befehl, kein Cron. In Prod offensichtlich **nicht gelaufen** (nur 56 KOs mit allen 5 Feldern). → 106 KOs warten auf Anzeige-Titel/Kategorie, bleiben aber sichtbar (**kein Verlust, nur schwächere Darstellung + Nachordnung**).
- **Klasse:** Presentation-Degradierung (H/K), kein harter Verlust.

---

## 7. Fachlich korrekt vs. technisch falsch (Zusammenfassung)

| Leerzustand/Verlust | Bewertung |
|---|---|
| pending-KOs (55) nicht in Lage | **fachlich korrekt** |
| quellenlose KOs (25) aus Lage entfernt | **fachlich korrekt** (Provenienzpflicht) |
| Source-Safety-Quarantäne | **fachlich korrekt** |
| 10 statt mehr Karten (Cap 12) | **dünn, aber korrekt** (Menge ausreichend) |
| alle 3 Profile sehen dieselben 10 alphabetischen Karten | **technisch falsch** (Null-Personalisierung) |
| 13 complete-KOs jenseits 200-Cap | **technisch falsch** (vorhandene Vorgänge unerreichbar) |
| 12s-Timeout nullt Kartenset bei kaltem Cache | **technisch falsch** (Timeout-Verlust) |
| 106 KOs ohne volle Presentation-Felder | **Präsentationsschwäche**, kein Verlust |

---

## 8. Priorisierte Ursachen (Lage)

1. **P1 — 12s-Timeout** am App-Start kann das komplette Kartenset verwerfen (Karten+Narrativ im selben Promise). → Narrativ-Generierung aus dem Start-Kritikpfad nehmen (nur Cache liefern). Detail auch in `app-start-performance.md`.
2. **P1 — Null-Personalisierung**: leere Profile + toter `matching_results`-Pfad → Ranking degeneriert. Hängt an KO-Anreicherung + Profildaten (`profile-coverage.md`).
3. **P2 — 200-Load-Cap < Bestand** → 13 KOs unerreichbar; skaliert mit Korpus.
4. **P2 — Presentation-Backfill nie gelaufen** (106 KOs) → schwächere Darstellung.

---

## 9. Tests, Belege, Grenzen

**Ausgeführt (offline, grün):** `lage-test.js` 138/138 (inkl. limit/dry-run/Legacy-Fallback-Sektionen).
**Abfragegrundlage:** Prod-Supabase `ddckuvvpcytqbyfmbvie`, nur SELECT. Verwendete Profile: `<pilot-mandats-id>` (real), `<demo-mandant-b>`/`<demo-mandant-c>` (leer). Datenstand 2026-07-12.
**Grenzen / VERMUTUNG:** Ob ein *befülltes* Profil bei angereichertem Korpus tatsächlich >2 Karten Personalisierung erzeugt, ist mangels befüllter Profile nicht direkt gemessen, sondern aus Formel+Korpus abgeleitet. Ob das 12s-Timeout in Prod real zuschlägt, hängt von KI-Latenz + Cache-Wärme ab und wurde nicht live provoziert (kein Prod-Schreibtest).
