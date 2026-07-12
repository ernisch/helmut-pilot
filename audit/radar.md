# Radar-Audit — Helmut

**Sprint:** SaaS-Readiness-Audit · **Phase 4** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend. Keine Production-Writes, keine Migration, kein Merge, keine Fixes.
**Belegbasis:** `lib/helmut/radar.js`, `radarState.js`, `dedup.js`, `briefingContract.js`, `sourceSafety.js`, `server.js`; SELECT-Abfragen gegen Prod `ddckuvvpcytqbyfmbvie`; Tests `radar`/`radar-state`/`radar-ui`.

> **Dateiname-Entscheidung:** Der Auftrag nennt `audit/radar.md`; es existiert kein abweichender Bestandspfad → `audit/radar.md` verwendet.

> **Kernbefund:** Es gibt **zwei parallele Radar-Engines** mit **unterschiedlicher Scan-Tiefe und unterschiedlicher Evidenz-Pflicht**. Das im App-Briefing sichtbare Radar (System A) scannt nur **200** KOs; das Archiv (System B) **500**. DB-verifiziert verliert System A dadurch **6 personenbezogene Vorgänge** (2 mit Beleg-URL), die das Archiv erfasst. Zusätzlich hängt die Recency-Sortierung an `updated_at` (= Reprocessing-Zeit), wodurch **reprozessierte Altvorgänge hochgespült** werden können. Die URL-/Evidenz-Pflicht ist **inkonsistent** (nur „Über dich" erzwingt sie).

---

## 1. Zwei Radar-Systeme (verifiziert)

| | **System A — `radarState.js`** (`currentRadarState`) | **System B — `radar.js`** (`buildRadarForUser`) |
|---|---|---|
| Sichtbar in | App-Radar im Briefing (`toBriefingContractV3` → briefingContract.js:896; Client liest `briefing.currentRadarState`) | `/api/radar/archive` (server.js:429 → `getRadarArchive`) |
| Scan-Tiefe | **200** (`server.js:1330` `listKnowledgeObjects({limit:200})`) | **500** (`radar.js:242` `scanLimit=500`) |
| URL-Pflicht | **JA** (mentions: `radarState.js:392` `if(!url) continue`) | **NEIN** (`radar.js:148` `url ? "direct" : "missing"`) |
| Umfeld/Relation | aus `decisions.matched_features` | keine Relation, nur Person/Partei-Erwähnung |
| KI | 0 (deterministisch) | 0 (deterministisch) |

Beide server-seitig, 0-KI. **Der Radar-Test (`radar-test.js:149`) prüft „lädt ≥200" nur für System B** — System A ist gegen den 200-Cut **ungetestet**.

---

## 2. Radar-Kette — wie ein Signal erscheint

**System A** (`radarState.buildCurrentRadarState`) liefert vier Listen:

- **„Über dich" (mentions, `buildMentions`):** zwingend, alle Bedingungen:
  1. Profil hat **vollen Namen** (Vor+Nachname, `hasFullName`); Einzelname reicht nie.
  2. KO `understanding_status='complete'` und `status!=='pending'`.
  3. **Direkte Erwähnung** (`detectPersonMention`): (a) *structured* = voller Name in `mentioned_people`/`mentioned_mps` → `confidence high`; (b) *prose-fullname* = voller Name als Wortfolge in Faktenfeldern (`display_title/headline/display_summary/was_ist_passiert`) → `confidence medium`. Bewusst **nicht** in `why_relevant/warum_wichtig` (Profil-Notizen, kein Beleg).
  4. **Source-Safety-Guard** ≠ `quarantine`.
  5. **Beleg-URL zwingend** (`radarState.js:392`) + `evidence`-Text (`:405`).
  - Ranking: `publishedAt desc`, Cap `MENTION_CAP=30`.
- **„Dein Umfeld" (`buildEnvironment`):** nur aus `decisions.matched_features`, streng belegt (§5). Cap 12/Segment. **Keine** URL-Pflicht.
- **„Neue Dynamiken" (`buildDynamics`):** Frische-Gate 7 Tage auf **jüngstes Quellendatum** (nicht `updated_at`), min. 2-3 Quellen. Cap 8.
- **„Alle Artikel" (`buildArticles`):** aus `decisions`, Cap 48. **Keine** URL-Pflicht.

**System B** (`radar.js:buildRadarSignals`): Signal nur bei Person- oder Partei-Erwähnung (`mentionReason`). Klassifikation `classifyRadarSignal`: Risk > Demand > Chance > Warning(<48h) > Mention.

**Historische Erwähnungen überleben den Decisions-Leerzustand — verifiziert:** Wenn keine `decisions` matchen, ruft `buildV3Briefing` `emptyKeepMentions(...)` und reicht die verstandenen KOs weiter (server.js:1341-1347). `buildMentions` arbeitet **unabhängig von decisions** → Eigenerwähnungen bleiben sichtbar. Umfeld/Dynamiken/Artikel fallen weg (sie hängen an decisions). **Aber:** begrenzt durch das 200-Fenster **davor** (§3).

---

## 3. Das „200-Zeilen-Fenster" — realer Verlust im App-Radar (DB-verifiziert)

System A wird aus `listKnowledgeObjects({limit:200})` gespeist (server.js:1330), Store sortiert `order=updated_at.desc` (storage.js:746), harter Cut bei 200.

**Gemessen (Prod, `row_number() OVER (ORDER BY updated_at DESC)`):**

| Kennzahl | Wert |
|---|---|
| KOs gesamt | 217 |
| jenseits Rang 200 | **17** |
| davon verstanden (complete) | **13** |
| davon mit Personennennung | **6** |
| davon Person **+ Beleg-URL** | **2** |
| jenseits Rang 500 | **0** |

**Konsequenz:** Das App-Radar (System A, Scan 200) **sieht 6 personenbezogene Vorgänge nie**, obwohl `buildMentions` sie inhaltlich als „Über dich" erkennen würde. Das Archiv (System B, Scan 500) erfasst sie. → **„Über dich" im Briefing und im Archiv divergieren.**

**Verschärfend — Begrenzung VOR der fachlichen Filterung:** Der 200-Cut passiert beim **Laden** (`updated_at.desc`), also **bevor** `buildMentions`/`detectPersonMention` filtert. Der Cut ist damit nicht „älteste zuerst weg", sondern **„zuletzt reprozessierte gewinnen"** — ein alter, jüngst neu verarbeiteter Vorgang verdrängt einen echt neueren aus dem Fenster. Zusätzlich cappt System A Mentions bei 30 rein nach Recency (`MENTION_CAP`) — eine ältere relevante Erwähnung kann auch unterhalb dieses Anzeige-Cuts verschwinden.

---

## 4. Namensnormalisierung (verifiziert)

- **`nameKey`** (radar.js:39, dupliziert radarState.js:106): NFKD-Zerlegung, Diakritika entfernt, türkisches `ı/İ→i`, lowercase, Nicht-alphanumerisch→Space. Deckt **Umlaute** und „Cem İnce/Ince/İnce" → `cem ince`.
- **Ganzwort-Match** (`wholeWordInText`) verhindert Teilwort-Fehltreffer („ince" in „Provinces" → kein Treffer, Test `radar-state-test.js:119`).
- **Bindestriche/Leerzeichen:** über die Nicht-alphanumerisch→Space-Regel abgedeckt (Doppelname mit Bindestrich wird zu Space-getrennten Tokens).
- **Parteien** über `slug`, nicht `nameKey`.

**Lücken (Befund):**
1. **Keine Amts-/Titel-/Abkürzungs-Normalisierung.** „MdB", „Dr.", „Staatssekretär" werden nicht abgetrennt/synonymisiert. „Dr. Cem İnce, MdB" trifft nur, weil Vor- UND Nachname im Eintrag vorkommen — der Titel wird ignoriert, nicht normalisiert. Reine **Amtsnennung ohne Namen** („der Ausschussvorsitzende") → **kein** Treffer.
2. **Kein Alias-/Spitznamen-Register** (grep: 0 Treffer außer Kommentaren).
3. **Doppelte `nameKey`-Implementierungen** (radar.js/radarState.js) → Drift-Risiko.

Ausreichend für exakte Namen inkl. Umlaute/türkischer Diakritika; **nicht** für Titel/Ämter/Aliasse/Abkürzungen.

---

## 5. Relation-Evidenz, Beleg-URL & tote Feldzugriffe

- **`ko_relations`-Tabelle wird vom Radar NICHT gelesen** (grep: nur Schema+Docs, null im Anwendungscode). Relation wird **read-time aus KO-Feldern + decisions** abgeleitet. → `ko_relations=0` ist für den Radar irrelevant, aber die Tabelle ist **totes Schema**.
- **„Partei nur mit Akteurs-/Quellenbeleg" (commit 8f41f0e) — verifiziert:** `partyRelationBeleg`/`radarPartyActorEvidence` (radarState.js:153-171): Partei im Umfeld nur, wenn **(a)** eigene Partei strukturiert in `ko.parteien` (nicht nur `mentioned_parties`) **UND (b)** Akteursbeleg (Quelle `source_type` party/faction ODER Partei als Ganzwort im Titel). Test `radar-state-test.js:450-457` deckt genau das ab.
- **Drei Achsen sauber getrennt — bestätigt:** *Direkte Erwähnung* (Person, nur Faktenfelder) · *Relation* (Umfeld, strukturell verankert, Wahlkreis nur konkreter Ort, **kein** Bundesland) · *thematische Nähe* (explizit **kein** Umfeld-Segment; `thema`-count 0 im Test `:525`).
- **Evidenz/URL-Pflicht INKONSISTENT (Befund):**
  - „Über dich" (mentions): URL **zwingend** + evidence-Text zwingend.
  - „Umfeld"/„Alle Artikel": **keine** URL-Pflicht (`baseItemFields` erlaubt leere `sourceUrl`) → ein Umfeld-Item kann **ohne belegte Quelle** erscheinen.
  - System B (Archiv): **keine** URL-Pflicht (`radar.js:148`, `url:""`, `linkType:"missing"`).
- **Bug — Guard-Input defekt (DB-verifiziert):** `radar.js:175` baut den Guard-Doc mit `source_type: ko.best_source_type` — **diese Spalte existiert nicht** (`has_best_source_type=0`). Wert ist immer `undefined` → Source-Safety-Guard in System B arbeitet **ohne Quellentyp**. (System A zieht `source_type` korrekt aus `raw_documents` via `pickPrimarySource`.)
- **Toter Feldzugriff (DB-verifiziert):** `radarState.js:190` liest `ko.regions` — **Spalte existiert nicht** (`has_regions_col=0`). Wahlkreisbeleg stützt sich faktisch allein auf `mentioned_locations` (existiert, 86 KOs). Kein Funktionsverlust, aber toter Code / falsche Annahme.

---

## 6. DB-Belege (Prod `ddckuvvpcytqbyfmbvie`, nur SELECT)

Schema: `mentioned_people/mentioned_mps/mentioned_parties/parteien/mentioned_locations` = ARRAY; `best_source_url/best_link_type` = text. **Nicht vorhanden:** `regions`, `best_source_type`.

| Kennzahl (217 KO) | Wert |
|---|---|
| understood / pending | 162 / 55 |
| mit Personennennung (people ∪ mps) | **54** |
| mit `best_source_url` | **137 (63 %)** |
| Person **innerhalb** Rang ≤200 (mit URL) | 40 gesamt / 2 person+url **jenseits** 200 |
| understood-mit-Person jenseits Rang 200 | **6** |
| jenseits Rang 500 | **0** |

**Zeitverteilung:** Alle 217 KOs tragen `updated_at` im Fenster 2026-07-02 … 07-12 (10 Tage) → **`updated_at` ist Reprocessing-/Bulk-Zeit, kein Publikationsdatum.** Echte Aktualität liegt in `raw_documents.published_at`; nur `buildDynamics` nutzt das korrekt.

**Können alte irrelevante Quellen hochgespült werden? — JA, zwei Wege:**
1. **Recency über `updated_at`:** mentions/articles sortieren nach `publishedAt`, das bei fehlendem Quellendatum auf `updated_at`/`created_at` zurückfällt (radar.js:150-151, `koPublishedAt`). Ein **reprozessierter Altvorgang** bekommt so ein frisches Datum und rankt fälschlich oben. Nur `buildDynamics` ist immun.
2. **200-Fenster über `updated_at.desc`:** wer zuletzt reprozessiert wurde, ist drin — nicht wer real neu ist.

---

## 7. Konkrete Beispielfälle (aus Code + Daten abgeleitet)

- **Wann bleibt eine alte Quelle sichtbar?** Ein alter Vorgang mit Personennennung + Beleg-URL bleibt in „Über dich" sichtbar, solange sein KO im 200-`updated_at`-Fenster liegt und der Guard nicht quarantäniert — **unabhängig vom echten Publikationsdatum** (kein Frische-Gate auf mentions). Beispiel: die 40 person+url-KOs innerhalb Rang ≤200.
- **Wann fällt sie aus dem aktiven Radar?** Sobald sie durch neuere Reprocessing-Bumps aus dem 200-Fenster gedrängt wird (nicht: durch Alter). Belegt: die **6 person-KOs jenseits Rang 200** sind im App-Radar unsichtbar.
- **Wann landet sie im Archiv?** System B scannt 500 → die 6 verlorenen KOs sind dort erfasst. Das Archiv ist faktisch „das größere Fenster", kein separater Archiv-Zustand.
- **Kann eine alte irrelevante Quelle erneut hochgespült werden?** JA — durch `updated_at`-Bump beim Reprocessing ohne neues Quellendatum (§6).
- **Kann das 200-Fenster relevante historische Treffer abschneiden?** JA, DB-verifiziert (6 Person-KOs).
- **Vor oder nach fachlicher Filterung begrenzt?** **Vor** (200-Cut beim Laden, bevor `detectPersonMention` filtert).
- **Direkte Erwähnung vs. thematische Relation unterschiedlich gewichtet?** JA — direkte Erwähnung ist eigene Liste mit URL-/Evidenz-Pflicht; thematische Nähe ist **explizit kein** Umfeld-Segment; Relation (Partei/Ausschuss/Wahlkreis) nur mit strukturellem Beleg.
- **Sind Relation Evidence & Beleg-URL zwingend?** **Nur teilweise** — für „Über dich" ja, für „Umfeld"/„Artikel"/Archiv **nein**.
- **Kann ein Treffer ohne belastbare Evidenz sichtbar werden?** JA, in „Umfeld"/„Artikel"/Archiv (keine URL-Pflicht).
- **Dedup zwischen aktuell/historisch?** Über `documentId`/`url`/`vorgang_id`-Key (`seen`-Set, radarState.js:393-395) innerhalb einer Liste; **keine** übergreifende Dedup zwischen System A und System B.
- **Modern vs. Legacy unterschiedlich?** Ja — System A vs. System B liefern **unterschiedliche Treffermengen** (Scan 200 vs. 500, URL-Pflicht ja/nein).
- **Profil mit wenigen Erwähnungen technisch leer trotz Evidenz?** JA — wenn die (wenigen) belegten Erwähnungen jenseits des 200-`updated_at`-Fensters liegen, bleibt „Über dich" leer, obwohl das Archiv sie hätte.

---

## 8. Belastbare Sichtbarkeitsregeln (Vorschlag — NICHT umgesetzt)

**Aktiver aktueller Treffer:** `understanding_status='complete'`, direkte Namensnennung (strukturiert oder Wortfolge in Faktenfeldern), **Beleg-URL zwingend**, Guard≠quarantine, **jüngstes Quellendatum (`raw_documents.published_at`) ≤ 30 Tage**.

**Aktiver historischer Treffer:** wie oben, aber Quellendatum > 30 Tage — sichtbar bleiben **nur**, wenn belegte fortlaufende Relevanz besteht (Dynamik-Signal: broadening/officialAttention/rising, ≥2-3 Quellen). Sonst → Archiv.

**Archivierter Treffer:** jeder belegte Treffer außerhalb des Frischefensters ohne aktive Dynamik. **Archiv-Scan muss den gesamten KO-Bestand abdecken** (Scan ≥ Gesamtzahl bzw. personen-gefilterte Query statt `updated_at`-Top-N), damit keine person+url-KOs verloren gehen.

**Erneut hochgestufter historischer Treffer:** nur bei **belegter neuer Aktivität** — neues `raw_document` mit `published_at` im Frischefenster ODER Dynamik-Signal. Ein reines Reprocessing (`updated_at`-Bump ohne neues Quellendatum) darf **nicht** hochstufen.

**Irrelevanter Alt-Treffer:** außerhalb Frischefenster, keine Dynamik, kein neuer Beleg → **bleibt im Archiv**, nie aktiv.

**Unbelegte Relation:** Partei/Ausschuss/Wahlkreis nur mit strukturellem Beleg **und** Akteurs-/Quellenbeleg (Status quo 8f41f0e beibehalten); Wahlkreis nur konkreter Ort, kein Bundesland. **URL-Pflicht auf Umfeld/Artikel/Archiv ausweiten** (heute nur mentions). Kein Item ohne belegte Quelle.

**Konsolidierung:** `nameKey` in **einer** geteilten Funktion; Recency **durchgängig** auf Quellendatum (`published_at`) statt `updated_at`; App-Radar-Mention-Scan auf Archiv-Tiefe (≥500) oder gezielte „KO mit Personennennung des Profils"-Query; Guard-Input-Bug (`ko.best_source_type`) und toten `ko.regions`-Zugriff beheben.

---

## 9. Kernrisiken (priorisiert) & offene Unsicherheiten

| # | Risiko | Prio (Vorschlag) | Beleg |
|---|---|---|---|
| 1 | App-Radar-Scan 200 vs. Archiv 500 → 6 person-KOs im Briefing-Radar unsichtbar; ungetestet | **P1** (Profil verliert vorhandene Evidenz) | DB rn>200; server.js:1330 vs. radar.js:242 |
| 2 | `updated_at` als Recency-Achse spült reprozessierte Altvorgänge hoch (außer Dynamiken) | **P1/P2** | radar.js:150; alle 217 `updated_at` in 10-Tage-Fenster |
| 3 | Uneinheitliche URL-/Evidenz-Pflicht (mentions ja, Umfeld/Artikel/Archiv nein) → Treffer ohne Beleg möglich | **P1** (Evidenz-Prinzip) | radarState.js:363; radar.js:148 |
| 4 | Defekte Feldzugriffe `ko.best_source_type` (Guard-Input B) & `ko.regions` (Wahlkreisbeleg) | **P2** | Spalten existieren nicht (DB) |
| 5 | `ko_relations`-Tabelle ungenutzt (totes Schema) | **P3** | grep; `ko_relations=0` |

**Offene Unsicherheiten (VERMUTUNG):** Ob in der Praxis tatsächlich Reprocessing-Bumps ohne neues Quellendatum auftreten (Voraussetzung für „Hochspülen"), ist codeseitig plausibel, aber nicht an einem konkreten Prod-Vorfall gemessen. Die genaue Häufigkeit müsste über eine `updated_at` vs. `raw_documents.published_at`-Verlaufsanalyse belegt werden (Prüfpunkt QA/Block 3).

**Tests (Block 4, grün):** `radar-test.js` 38/38 · `radar-state-test.js` 102/102 · `radar-ui-test.js` 18/18. Datenstand 2026-07-12. Abfragen ausschließlich SELECT.
