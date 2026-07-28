# Matching-Nachvollziehbarkeit (Roadmap-Punkt 23)

**Kanonische Quelle** für den Ist-Zustand des produktiven Matchings, die
Architekturentscheidung für Sprint 23B und die geplante Nutzererklärung (23C).

**Stand:** 2026-07-28 · **Teil A** = Sprint 23A (Bestandsaufnahme) · **Teil B** =
Sprint 23B-1 (umgesetzte Auditpersistenz, Migration **nicht** angewendet,
Rollout-Grenze **AUS**)
**Basis:** Teil A `main` = `51a533d` (Merge PR #166), Production read-only vermessen
am 2026-07-28, ca. 17:00–17:30 UTC · Teil B `main` = `53893fa` (Merge PR #168)

> **Aufbau:** §1–§13 sind der belegte **Ist-Zustand** aus Sprint 23A und bleiben
> unverändert. §14–§24 (Teil B) beschreiben die in Sprint 23B-1 gebaute Lösung,
> die Production-Reihenfolge und den Rückweg. Wo Teil B von der Empfehlung aus
> §10 abweicht, ist das dort ausdrücklich benannt und begründet.

> **Abgrenzung:** Roadmap-**Punkt 23** (dieses Dokument) ≠ **OP-23** aus
> [`datenmotor-restliste.md`](datenmotor-restliste.md). Ebenso: Roadmap-Punkt 22
> (semantische Embeddings) ≠ OP-22 (Scoring scharfschalten).

---

## 1 · Die Kurzfassung

**Was heute gespeichert wird.** Pro Mandant und Vorgang genau **eine** Zeile in
`matching_results`: Ähnlichkeitswert, ein Rang, eine Liste getroffener Merkmale und
ein Filterobjekt. Mehr nicht — keine Laufkennung, kein Profilstand, kein
Vorgangsstand, keine Rezeptversion, kein Berechnungszeitpunkt.

**Was verloren geht.** Bei jedem Lauf wird dieselbe Zeile **überschrieben**. Der
vorherige Wert ist danach weg. Es gibt kein `updated_at`; `created_at` bleibt auf
dem Zeitpunkt stehen, an dem das Paar Mandant×Vorgang **zum ersten Mal** in die
Trefferliste kam. Man kann einer Zeile also nicht ansehen, wann sie zuletzt
berechnet wurde — und auch nicht, ob sie überhaupt noch aktuell ist.

**Warum alte Ergebnisse nicht reproduzierbar sind.** Um ein Ergebnis von vor zwei
Wochen nachzurechnen, bräuchte man den damaligen Profilstand, den damaligen
Vorgangsstand, die damalige Kandidatenmenge und die damaligen Schwellenwerte.
**Nichts davon wird gespeichert.** Ein Profilhash existiert zwar
(`profile_embeddings.profile_hash`), aber genau einer pro Mandant — und er wird bei
jedem Lauf mitüberschrieben. Damit ist auch nicht feststellbar, *ob* sich seither
etwas geändert hat.

**Die reale Gefahr.** Drei Stufen, alle heute belegt:

1. **Kein Supportfall ist beantwortbar.** Fragt ein Abgeordneter „warum stand das am
   22. Juli in meinem Briefing?", gibt es keine Antwort. Das Briefing speichert nur
   einen Hash der Vorgangsmenge (Einwegfunktion), keine Vorgangskennungen und keinen
   Verweis auf ein Matching-Ergebnis.
2. **Ein alter Briefing-Text kann sich rückwirkend ändern.** Läuft am selben Tag ein
   neues Matching und ändert sich dadurch die Vorgangsmenge, wird das Tagesbriefing
   **neu erzeugt und überschrieben** (gleiche Zeilenkennung `bf-<mandant>-lage-<tag>`).
   Der ursprüngliche Text ist dann unwiederbringlich weg.
3. **Der Bestand vermischt Generationen.** Weil nie gelöscht wird, stehen in
   `matching_results` Ergebnisse aus zwei Wochen nebeneinander — mit Rängen aus
   verschiedenen Läufen. Gemessen: **64 Zeilen tragen Rang 20**, obwohl je Lauf
   genau *eine* Zeile Rang 20 bekommt. Der Rang ist als Ordnung damit wertlos, und
   der Lesepfad benutzt ihn folgerichtig **gar nicht** — er sortiert nach
   `created_at`, also nach „wann zum ersten Mal gesehen".

**Empfehlung für 23B.** **Variante B**, in der geschärften Form „B+":
eine neue, schmale Lauftabelle `matching_runs` (mit der kompakten Ergebnisliste des
Laufs), **additive** Spalten auf `matching_results`, das Auswahlprotokoll additiv im
bereits vorhandenen `briefings.payload` (jsonb → **keine** Migration nötig) und eine
schmale Archivtabelle, damit ein überschriebenes Briefing nicht verloren geht.
Keine vollständigen Snapshots, keine Vektoren je Ergebnis, keine KI. Details: §10.

---

## 2 · Startprüfung (Git, offene Pull Requests)

| Prüfung | Ergebnis |
|---|---|
| `main` aktuell | ✅ `51a533d` = Merge PR #166 |
| PR #166 in `main` enthalten | ✅ belegt über `git log origin/main --grep="#166"` |
| Arbeitsbranch | `claude/sprint-23a-matching-audit-m182kn`, deckungsgleich mit `origin/main` (0 Dateien Diff bei Sprintbeginn) |
| Offene Pull Requests | 10 (#167, #159, #148, #132, #117, #115, #112, #111, #88, #70) |

**Überschneidungen mit Punkt 23 — nur konkrete Konflikte, nichts verändert:**

| PR | Berührt | Konflikt für Sprint 23? |
|---|---|---|
| **#112** Onboarding-Erstlogin | `mandate_profiles`, `accounts.js`, Profil-Blob→SQL-Backfill, `HELMUT_PROFILE_DB_MODE` | **Ja, fachlich relevant.** Sprint 23B verankert Ergebnisse an einem Profilhash. #112 verändert, *wie* Profile entstehen und geschrieben werden. Reihenfolge klären: entweder #112 vor 23B mergen oder den Profilhash so definieren, dass er von der Herkunft (Blob vs. SQL) unabhängig ist — Letzteres ist ohnehin die richtige Wahl (§10.3). |
| **#167**, **#159**, **#148** | ausschließlich `docs/` (u. a. `CURRENT_STATE.md`) | **Nur Textkonflikt.** Alle drei ändern `CURRENT_STATE.md`; dieser Sprint tut das ebenfalls. Beim Merge entsteht ein gewöhnlicher Markdown-Konflikt, keine fachliche Kollision. |
| **#132** Brandenburg-Readiness | `source-mode.js`, Seeds, Landesmodul-Gate | Kein Matching-Konflikt. Relevant nur, weil ein späteres Landesprofil neue Mandanten in das Matching bringt — das Zielmodell ist bewusst mandanten- und ebenenneutral (§10.6). |
| **#88** Monitoring-Härtung (Draft) | `scheduler.js` (`durationMs`), Radar | Gestapelt auf einem fremden Branch, seit 2026-07-15 unverändert. Berührt `scheduler.js` in der Nähe des Matching-Aufrufs, aber nicht den Aufruf selbst. Geringes Konfliktrisiko, veraltet. |
| #117, #115, #111, #70 | Quellenpakete, Doku, Passwortseite | Kein Bezug zu Punkt 23. |

Keiner dieser Pull Requests wurde geöffnet, geändert, kommentiert oder gemergt.

---

## 3 · Der produktive Datenfluss

**Einstiegspunkt:** `lib/helmut/matching.js` → `runMatchingShadow()`.
**Aufgerufen wird er an genau zwei Stellen**, beide in `lib/helmut/scheduler.js`:

| Stelle | Kontext | Sperre |
|---|---|---|
| `scheduler.js:409` | innerhalb `runSourceCrawl()` — Crons `/api/cron/crawl` (04:00, 20:00 UTC) und `/api/cron/pipeline` (16:00 UTC) | ja: `crawl-<mandant>`, 15 min TTL |
| `scheduler.js:577` | innerhalb `foldLageItemsIntoV3()` ← `runLageCheck()` — Cron `/api/cron/lage-check` (10:00 UTC) | **nein** |

Damit laufen je Mandant **vier** Matching-Läufe pro Tag. Die Uhrzeitverteilung der
Production-Zeilen bestätigt das exakt (Spitzen um 04, 10, 16, 20 UTC, §5).

### 3.1 Kette vom Mandanten bis zur Ausgabe

```
Mandant (profiles.id) ─ ist zugleich die Profilkennung
  └─ Mandatsprofil  (mandate_profiles, PK = user_id; oder JSON-Blob, je nach Flag)
       └─ profileFeatures()  → Partei/Fraktion · Ausschüsse · Regionen · Themen
            └─ embedProfile() → 256-dim Merkmalsvektor (Token-Hash, KEINE KI)
                 └─ saveProfileEmbedding()      → profile_embeddings (1 Zeile/Mandant, überschrieben)
                      └─ RPC match_knowledge_objects(vektor, 20, null, null, null)
                           │   Kosinus über knowledge_objects.embedding
                           │   schließt aus: status='pending', understanding_status='failed'
                           │   harte Filter: in Production IMMER null (§4.3)
                           └─ Top-20 Treffer
                                └─ matchedFeatures(Profil, Vorgang) → erklärende Labels
                                     └─ saveMatchingResults() → matching_results (Upsert auf id)
                                          └─ lage.js:325 listMatchingResults(limit 12)
                                               └─ Reihenfolge = created_at DESC (NICHT rank)
                                                    └─ Lage-Karten + KI-Narrativ → briefings.payload
                                                         └─ Anzeige beim Nutzer
```

### 3.2 Wer die Ergebnisse tatsächlich liest

**Genau ein Konsument:** `lib/helmut/lage.js:325`.

Zwei Einschränkungen, die man kennen muss:

- **Der Lesepfad ist an ein Flag gekoppelt.** `lage.js:316` kehrt vorher zurück,
  wenn `HELMUT_SCORING_MODE=on` gesetzt ist; dann rankt `scoring.rankForLage()` nach
  globaler Wichtigkeit und `matching_results` wird **nicht** gelesen. In Production
  ist das Flag **nicht gesetzt** (`quellenarchitektur/00-master-status.md` Zeile 248;
  Scharfschalten ist OP-22). **Heute wird also gelesen** — aber der einzige Leser
  hängt an einer noch offenen Freigabeentscheidung.
- **Radar liest die Ergebnisse nicht.** `scoring.rankForRadar()` kann eine
  Ähnlichkeit über `opts.matchById` verstärken, wird aber im gesamten Produktcode
  **nirgends aufgerufen** (geprüft in `lib/`, `server.js`). Die Radar-Ansicht ist
  vom Matching unabhängig.

### 3.3 Was das Matching *nicht* ist

`decisions` (976 Zeilen) ist ein **eigener** Pfad (`lib/helmut/decisions.js`,
`runDecisionShadow`) mit eigenem Score, eigener Entscheidung und — anders als
`matching_results` — einem echten `updated_at`. Punkt 23 betrifft `decisions` nicht;
die Tabelle wird in 23B **nicht** angefasst.

---

## 4 · Schema, Constraints, Schreibpfad

### 4.1 Echtes Production-Schema von `matching_results`

Gegen Production abgefragt (`information_schema`), **identisch** zu
`supabase/schema.sql:541` — kein Schema-Drift:

| # | Spalte | Typ | NULL erlaubt | Default |
|---|---|---|---|---|
| 1 | `id` | text | **nein** (PK) | — |
| 2 | `user_id` | text | ja | — |
| 3 | `knowledge_object_id` | text | ja | — |
| 4 | `vorgang_id` | text | ja | — |
| 5 | `similarity` | numeric | ja | — |
| 6 | `rank` | integer | ja | — |
| 7 | `matched_features` | jsonb | **nein** | `'[]'` |
| 8 | `filters` | jsonb | **nein** | `'{}'` |
| 9 | `created_at` | timestamptz | **nein** | `now()` |

**Constraints:** `matching_results_pkey` PRIMARY KEY (`id`) ·
FK `user_id → profiles(id) ON DELETE CASCADE` ·
FK `knowledge_object_id → knowledge_objects(id) ON DELETE CASCADE`.

**Indizes:** `matching_results_pkey` (unique, `id`) ·
`matching_results_user_idx` (`user_id, created_at`) ·
`matching_results_ko_idx` (`knowledge_object_id`).

**Es gibt keinen eindeutigen Index auf (`user_id`, `knowledge_object_id`).** Dass
je Paar nur eine Zeile existiert, ist eine **Konvention im Code** (die Kennung lautet
`mr-<mandant>-<vorgang>`), keine Zusicherung der Datenbank. In Production hält die
Konvention: 287 von 287 Zeilen folgen ihr, 0 Duplikate.

### 4.2 Zugriff, RLS und Rollen

- RLS ist **aktiv** (`relrowsecurity = true`), **nicht** erzwungen
  (`relforcerowsecurity = false`).
- **Eine** Policy: `tenant_isolation`, PERMISSIVE, Rolle `{authenticated}`, `ALL`,
  `USING`/`WITH CHECK` = `user_id = helmut_current_tenant()`.
- Für `anon` existiert **keine** Policy → RLS verweigert dieser Rolle jede Zeile.
- **`service_role` umgeht RLS vollständig.** Der gesamte Backend-Zugriff läuft über
  `service_role`; die Policy ist für den Produktivbetrieb damit **inert**. Die
  Mandantentrennung ist **app-seitig** (`assertTenant`, `assertTenantRows` und ein
  verpflichtender `user_id=eq.<mandant>`-Filter). Das ist die verbindliche
  Architektur, nicht ein Mangel — siehe
  [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md).
- **Tabellenrechte (gemessen):** `anon`, `authenticated`, `postgres` und
  `service_role` besitzen jeweils `SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
  REFERENCES, TRIGGER` — der Supabase-Standardsatz. Zum Vergleich: die 2026-07-28
  neu angelegte `knowledge_object_embeddings` trägt Rechte **nur** für `postgres`
  und `service_role`. Befund **M-6**, §8.

### 4.3 Wie geschrieben wird

`storage.saveMatchingResults()` (`storage.js:2479`) → `v3Upsert()` →
`POST /rest/v1/matching_results?on_conflict=id` mit
`Prefer: resolution=merge-duplicates`.

| Frage | Antwort |
|---|---|
| a) einfügen, aktualisieren oder ersetzen? | **Upsert** — einfügen, sonst in place aktualisieren |
| b) gibt es einen Upsert? | ja, ein einziger Bulk-Aufruf über bis zu 20 Zeilen |
| c) Konfliktschlüssel? | `id`, gebildet als `mr-<mandant>-<vorgang>` (`matching.js:434`) |
| d) werden alte Ergebnisse überschrieben? | **ja**, vollständig. `similarity`, `rank`, `matched_features`, `filters` werden ersetzt; der Vorwert ist weg |
| e) werden nicht mehr relevante Ergebnisse gelöscht? | **nein.** Kein DELETE, keine Retention. Fällt ein Vorgang aus den Top-20, bleibt die Zeile mit ihren alten Werten für immer stehen |
| f) mehrere Generationen desselben Ergebnisses? | Je Paar: nein (eine Zeile). Über den Bestand hinweg: **ja** — die Tabelle enthält gleichzeitig Zeilen aus verschiedenen Läufen (§5.2) |
| g) erzeugt ein identischer Zweitlauf neue Zeilen? | **nein.** Deterministische Kennung → dieselben 20 Zeilen. **Aber er schreibt trotzdem**: 20 UPDATEs ohne inhaltliche Änderung, und man sieht ihm das nicht an (kein `updated_at`) |
| h) parallele Läufe? | **möglich.** Der Lage-Pfad hält **keine** Sperre. Ein gleichzeitiger Crawl- und Lage-Lauf für denselben Mandanten schreibt konkurrierend; je Zeile gewinnt der letzte Schreiber, über die 20 Zeilen hinweg gibt es **keine Atomizität** → gemischte Ränge aus zwei Läufen sind technisch möglich |
| i) teilweise fehlgeschlagener Lauf? | Der Ergebnis-Schreibvorgang ist ein einzelner Aufruf → entweder 20 Zeilen oder 0. **Aber** `saveProfileEmbedding` läuft **davor** (`matching.js:412`): bricht der Lauf danach ab, ist der neue Profilvektor gespeichert und die Ergebnisse sind veraltet — ohne jede Spur |
| j) Lauf-ID oder Laufstatus? | **nein.** Der Scheduler führt zwar eine `runId`, reicht sie aber **nicht** an `runMatchingShadow` weiter und speichert sie nirgends |
| k) Sperre je Profil? | nur mittelbar über `crawl-<mandant>` im Crawl-Pfad; der Lage-Pfad ist **ungesperrt**. Eine eigene Matching-Sperre existiert nicht |

**Löschpfade:** Nur die DSGVO-Löschung (`V3_PRIVACY_CHILD_TABLES`,
`storage.js:4662`, je Mandant) und die FK-Kaskaden. **Keine** Retention-Regel — die
Tabelle wächst unbegrenzt.

### 4.4 Welche Signale heute existieren

| Signal | Zustand |
|---|---|
| Gesamtscore | `similarity` — **dauerhaft gespeichert** (Kosinus über Merkmalsvektoren, gerundet auf 4 Stellen), aber beim nächsten Lauf **überschrieben** |
| fachlicher Score | **existiert nicht** als eigener Wert. Fachgebiet fließt nur als Token (Gewicht 2) in den Gesamtvektor ein — nicht separat auswertbar |
| geografischer Score | **existiert nicht.** Region ist ein Token (Gewicht 2); Quelle ist ausschließlich `ko.mentioned_locations`. `affected_geographies` und `political_level` gehen in das Legacy-Matching **überhaupt nicht** ein |
| institutioneller Score | **existiert nicht** — keine Institutionsdimension im Rezept |
| Ausschussbezug | als Token (Gewicht 3) **und** als `matched_features`-Eintrag `{type:"ausschuss"}` — gespeichert, wenn getroffen |
| Partei/Rolle | Partei/Fraktion als Token (Gewicht 3) + `matched_features` `{type:"partei"}`. Eine **Rolle** kennt das Rezept nicht |
| Legacy-Vektorähnlichkeit | = `similarity`, siehe oben |
| angewandte Filter | `filters` jsonb — **in Production immer `{}`** (287/287). `runMatchingShadow` wird ausschließlich als `{profile}` aufgerufen, `input.filters` ist nie gesetzt |
| Ausschlussgründe | **existieren nicht.** Verworfene Kandidaten hinterlassen keine Spur |
| `matched_features` | gespeichert, aber dünn: **225 von 287 Zeilen (78,4 %) sind leer** (§5.3) |
| Ranking | `rank` gespeichert — **aber nicht gelesen** (`listMatchingResults` sortiert nach `created_at DESC`) und über Generationen hinweg mehrdeutig |
| Schwellenwerte | **nicht gespeichert.** Im Produktionspfad greift kein Schwellenwert: die RPC liefert die Top-20 unabhängig vom Wert — negative Ähnlichkeiten inklusive (gemessen: min. **−0,0735**) |
| verständliche Begründung | **existiert nicht.** Nur die Labelliste, kein Satz |

Einordnung nach den geforderten Kategorien:

- **intern berechnet, nie gespeichert:** Profilmerkmale, Vorgangsmerkmale, die
  Kandidatenmenge der RPC, alle nicht gewählten Treffer, die Wirkung jedes einzelnen
  Tokens.
- **nur temporär:** der Profilvektor je Lauf (wird sofort in `profile_embeddings`
  überschrieben), die `runId` des Schedulers.
- **dauerhaft gespeichert:** `similarity`, `rank`, `matched_features`, `filters`,
  `vorgang_id`, `created_at`.
- **später überschrieben:** alle vier erstgenannten — bei **jedem** Lauf.
- **vollständig verloren:** jede frühere Fassung eines Ergebnisses, jeder frühere
  Profilstand, jede frühere Kandidatenmenge, jede frühere Rangfolge.

### 4.5 Versionierbarkeit — Befund

| Frage | Antwort |
|---|---|
| a) Ergebnis ↔ konkreter Profilstand? | **nein** |
| b) Profilversion/Revision/stabiler Hash? | Ein Hash **existiert** (`profile_hash`, `matching.js:310`, gespeichert in `profile_embeddings`), aber **genau einer je Mandant** und bei jedem Lauf überschrieben. Er ist **nicht** am Ergebnis gespeichert |
| c) Ergebnis ↔ konkreter Vorgangsstand? | **nein** |
| d) Vorgangsversion/Revision/Hash? | `knowledge_objects.ko_version` **existiert** (Integer, wird bei Neuverstehen erhöht — `understanding.js:910`). In Production: 1 505 Objekte auf Version 1, **2** auf Version 2. Am Ergebnis wird sie **nicht** mitgeführt. Einen Inhaltshash gibt es für das Legacy-Matching nicht |
| e) Matching-Rezeptversion? | **nein.** Der Name `legacy_relevance_v1` existiert bisher nur in der Doku, nicht in den Daten |
| f) Version des Merkmalsvektors? | **nein.** Die Dimension (256) steht in `profile_embeddings.dim`, die Gewichte (`WEIGHTS`) stehen nur im Code |
| g) verwendete Schwellenwerte? | **nein** (es gibt im Produktionspfad auch keine) |
| h) Modellname? | **nein** — im Legacy-Matching ist auch keiner beteiligt (0 KI-Aufrufe) |
| i) später `legacy_relevance_v1` von einem neuen Rezept unterscheidbar? | **nein.** Ohne Rezeptspalte wären alte und neue Ergebnisse in derselben Tabelle nicht trennbar — **das ist der stärkste Einzelgrund für 23B** |
| j) altes Ergebnis technisch reproduzierbar? | **nein.** Man könnte einen Wert *neu* berechnen, aber weder beweisen, dass die Eingaben dieselben waren, noch die damalige Rangfolge rekonstruieren |

---

## 5 · Production-Zahlen (ausschließlich lesend erhoben)

Erhebung am 2026-07-28 über `mcp__Supabase__execute_sql`, Projekt
`ddckuvvpcytqbyfmbvie`. **Alle Abfragen sind reine `SELECT`-Anweisungen** — kein
`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`, kein DDL, keine Migration (§13).

### 5.1 Mengen

| Größe | Wert |
|---|---|
| Mandanten (`profiles`) | **10** |
| Mandatsprofile (`mandate_profiles`) | **9** (davon 6 `aktiv=true`) |
| Wissensobjekte gesamt | **1 507** |
| davon verstanden (`status<>'pending'` und `understanding_status='complete'`) | **776** |
| `matching_results` | **287** |
| `profile_embeddings` | **7** |
| `briefings` | **71** |
| `decisions` | **976** |
| `knowledge_object_embeddings` (semantisch, Shadow) | **772** |
| Tabellengröße `matching_results` inkl. Indizes | 192 kB = **685 Byte/Zeile** |
| Datenbank gesamt | 64 MB |

### 5.2 Verteilung je Mandant

| Mandant | Zeilen | versch. Vorgänge | Rang min–max | ohne Score | Ähnlichkeit min–max | leere `matched_features` | leere `filters` | ältestes | jüngstes |
|---|---|---|---|---|---|---|---|---|---|
| `cem-ince` | 77 | 77 | 1–20 | 0 | −0,0735 … 0,3525 | 63 | 77 | 15.07. 04:03 | 28.07. 08:16 |
| `ottilie-paola-klein-2` | 47 | 47 | 1–20 | 0 | 0,0000 … 0,3969 | 38 | 47 | 20.07. 20:04 | 26.07. 07:58 |
| `max-mustermann` | 46 | 46 | 1–20 | 0 | 0,0000 … 0,3542 | 38 | 46 | 19.07. 20:05 | 26.07. 04:03 |
| `annika-klose` | 36 | 36 | 1–20 | 0 | 0,1787 … 0,4085 | 34 | 36 | 20.07. 20:03 | 28.07. 08:02 |
| `helmut-kleebank` | 31 | 31 | 1–20 | 0 | 0,2126 … 0,3682 | 18 | 31 | 20.07. 20:04 | 26.07. 04:03 |
| `ruppert-st-we` | 30 | 30 | 1–20 | 0 | 0,2228 … 0,3064 | 14 | 30 | 21.07. 10:05 | 26.07. 04:04 |
| `angela-merkel` | 20 | 20 | 1–20 | 0 | 0,0000 … 0,0000 | 20 | 20 | 17.07. 07:35 | 17.07. 07:35 |

**Je Vorgang:** 181 der 1 507 Wissensobjekte tragen mindestens ein Ergebnis;
Durchschnitt 1,59, Maximum **5** Ergebnisse je Vorgang (= 5 Mandanten).

**Qualitätsprüfungen — alle sauber:**
doppelte Kombinationen Mandant×Vorgang **0** · Zeilen ohne Mandant **0** · ohne
Vorgang **0** · ohne `vorgang_id` **0** · verwaiste Vorgangsbezüge **0** · verwaiste
Profilbezüge **0** · Ergebnisse ohne Mandatsprofil **0** · Kennungen abweichend von
`mr-<mandant>-<vorgang>` **0** · Ergebnisse auf nicht verstandenen Vorgängen **0**.

**Nicht sauber — die Rangkollision:** **64** Kombinationen (Mandant, Rang) kommen
mehrfach vor. Verteilung: Rang 1–18 je 9–15 Zeilen, Rang 19: 36 Zeilen, Rang 20:
**64 Zeilen**. Je Lauf vergibt der Code jeden Rang genau einmal — die Häufung ist der
direkte Abdruck des Überschreibungsverhaltens.

### 5.3 Erklärbarkeit heute

| `matched_features` | Zeilen | Anteil |
|---|---|---|
| 0 Einträge | **225** | **78,4 %** |
| 1 Eintrag | 48 | 16,7 % |
| 2 Einträge | 11 | 3,8 % |
| 3 Einträge | 3 | 1,0 % |

Aufschlüsselung der 79 Einzeltreffer: `partei` **55** (6 Mandanten) ·
`ausschuss` **12** (4) · `thema` **8** (2) · `wahlkreis` **4** (3).

**Konsequenz für 23C:** Eine belegte, politisch aussagekräftige Begründung
(Ausschuss oder Fachthema) ist heute für **20 von 287 Zeilen** möglich. Das ist die
ehrliche Ausgangslage — kein Grund, die Funktion zu verschieben, aber ein Grund,
sie **ohne Erfindungszwang** zu bauen (§11).

### 5.4 Alter, Überschreibung, fehlende Historie

- Ältestes Ergebnis **2026-07-15 04:03:36 UTC**, jüngstes
  **2026-07-28 08:16:00 UTC** — Spanne 13 Tage.
- Verteilung der `created_at`-Stunden (UTC): 04 → 29 · 07 → 34 · 08 → 5 · 09 → 7 ·
  **10 → 96** · 14 → 2 · 16 → 21 · 18 → 1 · **20 → 92**. Die Spitzen decken sich mit
  den Cron-Zeiten (04, 10, 16, 20 UTC) und bestätigen vier Läufe je Mandant und Tag.
- **Direkter Beweis, dass `created_at` nicht fortgeschrieben wird:**
  `profile_embeddings.updated_at` von `annika-klose` steht auf
  **2026-07-28 16:04:32 UTC**. Dieses Feld wird von `saveProfileEmbedding` bei jedem
  Lauf **explizit** gesetzt (`storage.js:2430`) — es hat also um 16:04 ein
  Matching-Lauf stattgefunden. In `matching_results` ist die jüngste `created_at`
  desselben Mandanten **08:02 UTC**. Der 16:04-Lauf hat 20 Zeilen geschrieben und
  **keine einzige neue** erzeugt: er hat bestehende Zeilen in place überschrieben,
  ohne irgendeine sichtbare Spur zu hinterlassen.
- **`ko_seit_ergebnis_geaendert` = 0** — kein Wissensobjekt trägt ein `updated_at`
  nach dem `created_at` seines Ergebnisses. Diese Zahl ist mit Vorsicht zu lesen:
  Befund **N-1** (Sprint 21) belegt, dass die Nachklassifikation `updated_at`
  **nicht** fortschreibt. Die Kennzahl beweist also *nicht*, dass sich keine
  Vorgänge geändert haben.

### 5.5 Nebenbefunde im Bestand (nicht korrigiert)

- **`angela-merkel`**: 20 Zeilen, alle mit Ähnlichkeit exakt 0,0000, alle ohne
  Merkmale, alle mit identischem Zeitstempel vom 17.07., Mandat `aktiv=false`. Ein
  Demo-/Testmandat mit leerem Profilvektor. Gehört fachlich zu **OP-04**
  (Demo-Mandate entfernen), nicht zu Punkt 23.
- **`mdb-a`**: existiert als Mandant in Production und trägt **1** `decisions`-Zeile
  — dieselbe Kennung, die die Offline-Testsuite als Fixture verwendet
  (`tenant-guard-test.js`). Ebenfalls OP-04-Material, hier nur dokumentiert.
- **`helmut-abnahme-berlin`** und **`james-brown`**: Profile ohne Matching-Ergebnisse
  (james-brown hat 5 Briefings aus einer früheren Phase).

---

## 6 · Mandatsprofile

| Frage | Antwort |
|---|---|
| a) Wie werden Profile identifiziert? | Über `profiles.id` (text). `mandate_profiles.user_id` ist zugleich **Primärschlüssel und Fremdschlüssel** auf `profiles.id`. **Mandantenkennung und Profilkennung sind dieselbe Zeichenkette** — eine eigene Profil-ID existiert nicht |
| b) Mehrere Profile je Mandant? | **Nein**, technisch ausgeschlossen (PK auf `user_id`). Der Code kennt kein zweites Profil je Mandant |
| c) Mehrere Rollen/Ausschüsse/Ebenen je Profil? | **Ausschüsse ja** (`ausschuesse` und `stellvertretende_ausschuesse` sind Arrays). **Rolle nein** (`rolle` ist ein einzelnes Textfeld, ebenso `regierungsrolle`). **Politische Ebene nein** (`politische_ebene`, ein Textfeld) |
| d) Werden Profile aktualisiert oder versioniert? | **Nur aktualisiert.** `mandate_profiles` hat `created_at`/`updated_at`, aber keine Version, keine Revision, keine Historie. Der Profilhash aus `matching.js:310` ist die einzige Änderungserkennung — und er wird überschrieben |
| e) Was passiert mit alten Ergebnissen nach einer Profiländerung? | **Nichts.** Sie bleiben unverändert stehen und sind ab diesem Moment **stillschweigend falsch zugeordnet** — berechnet gegen ein Profil, das es so nicht mehr gibt. Erst wenn derselbe Vorgang erneut in die Top-20 gerät, wird die Zeile korrigiert; alle anderen bleiben veraltet. **Das ist der schwerwiegendste inhaltliche Befund dieses Sprints** (Befund **M-3**) |
| f) Feste Annahmen zu `cem-ince`? | **Keine in aktiver Logik.** Ein einziger Codetreffer außerhalb von Tests/Fixtures: ein *Kommentar* in `quellenarchitektur/source-mode.js:482`. `matching.js` und `storage.js` enthalten keinen Mandantennamen. Der Mandant existiert als **Daten** (77 Ergebnisse), nicht als Sonderpfad. Das Zielmodell führt keine neue Bindung ein |
| g) Tragfähig für Bundestag, Berlin, Brandenburg und weitere Länder? | **Ja, mit einer Einschränkung.** Das Matching ist ebenen- und länderneutral: es kennt nur Partei/Ausschuss/Region/Thema und keine Ebenenlogik. Genau das ist zugleich die Grenze — `political_level` beeinflusst das Ergebnis **gar nicht**, ein Landesprofil und ein Bundesprofil werden identisch behandelt. Das ebenenbewusste Ranking liegt in `scoring.js` und ist ausgeschaltet (OP-22). Für Punkt 23 ist das **kein Blocker**: 23B speichert nur, was berechnet wurde |

---

## 7 · Wissensobjekte

| Frage | Antwort |
|---|---|
| a) Welche Felder beeinflussen das Matching tatsächlich? | Exakt die aus `knowledgeObjectFeatures()` (`matching.js:248`): `parteien`, `mentioned_parties` (Gewicht 3) · `ausschuesse`, `mentioned_committees` (3) · `mentioned_locations` (2) · `tags`, `policy_field` (2; ersatzweise `derivePolicyFields()` aus den Ausschüssen) · Freitext aus `headline`, `was_ist_passiert`, `warum_wichtig` (1). **Nicht beteiligt:** `political_level`, `affected_geographies`, `mentioned_geographies`, `decision_level`, `source_trust`, alle `display_*`-Felder |
| b) Welche dieser Felder können sich später ändern? | **Alle.** Nachklassifikation (Sprint 21), Anreicherung, erneutes Verstehen und Vorgangs-Zusammenführungen schreiben genau in diese Felder |
| c) Werden Wissensobjekte aktualisiert oder historisiert? | **Aktualisiert.** `ko_version` zählt neues Verstehen mit (Production: 1 505 × v1, 2 × v2), es gibt aber keine Historientabelle und keinen Inhaltshash für das Legacy-Rezept |
| d) Was passiert mit Ergebnissen nach einer Vorgangsänderung? | **Nichts** — dasselbe Bild wie bei Profiländerungen (Befund M-3). Zusätzlich: der **gespeicherte Vektor** in `knowledge_objects.embedding` wird beim Neuschreiben ersetzt, damit ist auch die Berechnungsgrundlage weg |
| e) Kann dasselbe Ereignis durch mehrere Wissensobjekte dargestellt werden? | **Ja** — belegt durch die Befunde B4-3/B4-4 zur Vorgangsbildung und durch Sprint 22B (die Duplikatpaare des Goldstandards). Für das Matching heißt das: derselbe Sachverhalt kann mehrfach in der Top-20 stehen |
| f) Wie wirken Aktualisierungsketten? | Jede Änderung an einem der Felder aus (a) verändert den Vektor und damit potenziell Rang und Ähnlichkeit — **ohne** dass das an der Ergebniszeile sichtbar würde. Genau diese Kette ist heute nicht nachvollziehbar und der Kern von Punkt 23 |

---

## 8 · Mandantentrennung und RLS — Befund

| Frage | Antwort |
|---|---|
| a) Welche Mandantenkennung steht in `matching_results`? | `user_id` (text), FK auf `profiles.id` |
| b) Reicht `user_id` fachlich? | **Heute ja**, weil je Mandant genau ein Profil existiert. **Als dauerhafte Zusicherung nein**: sobald ein Mandant zwei Profile hat (Rollenwechsel, Doppelmandat, Testprofil), ist die Zuordnung mehrdeutig. Das Zielmodell trennt deshalb `user_id` (Mandant) und `profil_hash` (Profilstand) sauber, ohne heute eine zweite Kennung einzuführen |
| c) Eindeutige Profil-ID? | **Nein** — Profilkennung = Mandantenkennung (§6a) |
| d) Sind normale DB-Rollen durch RLS getrennt? | **Ja.** `authenticated` sieht über `tenant_isolation` nur `user_id = helmut_current_tenant()`; `anon` hat keine Policy und sieht nichts |
| e) Umgeht `service_role` die RLS-Regeln? | **Ja, vollständig.** Der gesamte produktive Zugriff läuft darüber. **Die Behauptung, `matching_results` sei durch RLS geschützt, wäre falsch.** Wirksam ist ausschließlich die App-seitige Durchsetzung |
| f) Sind alle Backend-Reads/Writes mandantengefiltert? | **Ja, für diese Tabelle geprüft.** `listMatchingResults` erzwingt `assertTenant` **und** einen expliziten `user_id=eq.`-Filter (`storage.js:2504–2514`); `saveMatchingResults` erzwingt `assertTenantRows` (`storage.js:2480`) und lehnt gemischte Mandanten mit `CROSS_TENANT_WRITE` ab |
| g) Pfade ohne sicheren Mandantenfilter? | **Keiner für `matching_results` gefunden.** Es gibt genau zwei Zugriffsfunktionen, beide gegateted. Die RPC `match_knowledge_objects` liest ausschließlich mandantenlose `knowledge_objects` |
| h) Kann ein Ergebnis versehentlich einem falschen Mandanten zugeordnet werden? | **Über den regulären Pfad nein** — die Kennung `mr-<mandant>-<vorgang>` enthält den Mandanten, ein Fremdschreiben kollidiert nicht, sondern erzeugt eine eigene Zeile, und `assertTenantRows` blockiert gemischte Stapel. **Restrisiko:** ein falsch übergebenes `input.profile` in `runMatchingShadow` würde einen fremden Vektor unter der richtigen Kennung speichern. Dagegen gibt es heute keinen Test (→ §12, T-4) |
| i) Welche adversarialen Tests existieren bereits? | `tenant-guard-test.js` (fehlender Mandant · Cross-Tenant-Read · Schreib-Guard, u. a. für `listMatchingResults`/`saveMatchingResults`) · `cross-tenant-security-test.js` (gemischte Stapel → `CROSS_TENANT_WRITE`) · `p1-security-check.js` (Flag-aus-Verhalten, kein Netzwerk) · `rls-policy-simulation-test.js` · `tenant-jwt-test.js` · `privacy-authz-test.js` · `privacy-vollstaendigkeit-test.js` · `tenant-neutrality-test.js` |
| j) Welche Tests sind für 23B zwingend? | §12 |

**Befund M-6 (Hygiene, nicht akut).** `anon` und `authenticated` besitzen auf
`matching_results` — wie auf allen älteren V3-Tabellen — den vollen
Supabase-Standardrechtesatz inklusive **`TRUNCATE`**. `TRUNCATE` unterliegt in
PostgreSQL **nicht** der Row-Level-Security. Praktisch ausnutzbar wäre das nur über
eine **direkte Datenbankverbindung** als diese Rolle; PostgREST bietet kein
`TRUNCATE` an, und der anonyme API-Schlüssel ist ein JWT, kein Datenbankpasswort.
Es besteht also **keine** über das API erreichbare Lücke. Trotzdem ist der Zustand
inkonsistent zur 2026-07-28 gehärteten `knowledge_object_embeddings` (Rechte nur für
`postgres`/`service_role`). Empfehlung: die Revokes in 23B **additiv** mitnehmen —
sie ändern kein Anwendungsverhalten, weil kein Produktpfad als `anon`/`authenticated`
auf diese Tabellen schreibt. **Freigabepflichtig**, da Rechteänderung in Production.

---

## 9 · Abgrenzung zu den semantischen Embeddings

| Frage | Antwort |
|---|---|
| a) Einfluss auf `matching_results`? | **Nein, null.** Belegt: `knowledge_object_embeddings` wird im gesamten Repository nur von `lib/helmut/embedding-backfill.js`, `scripts/embedding-backfill.js` und deren Test gelesen/geschrieben. Weder `matching.js` noch `storage.js`, `lage.js`, `scoring.js`, `decisions.js` oder `server.js` berühren die Tabelle |
| b) Semantische Ähnlichkeit irgendwo als Matching-Signal gespeichert? | **Nein.** `matching_results.similarity` ist ausschließlich der Kosinus über die **Merkmalsvektoren** aus `matching.js` |
| c) Gefahr, Duplikaterkennung und Mandatsrelevanz zu vermischen? | **Ja, und sie ist real.** Beides sind Kosinuswerte auf 256 Dimensionen — sie sehen identisch aus und messen Gegensätzliches: semantische Nähe beantwortet „ist das derselbe Vorgang?", Merkmalsüberlappung beantwortet „betrifft das dieses Mandat?". Zwei Artikel über dieselbe Rentenreform sind semantisch fast identisch, aber für ein Verkehrsprofil beide irrelevant |
| d) Welche Grenze muss 23B einhalten? | **Vier harte Regeln:** (1) 23B liest `knowledge_object_embeddings` **nicht**. (2) Die Signalspalten des Zielmodells enthalten **keinen** semantischen Wert. (3) Die Rezeptversion heißt `legacy_relevance_v1` und macht damit von Anfang an unterscheidbar, was später ein semantisches Rezept wäre. (4) Der Vorgangs-Eingabehash des Legacy-Rezepts (§10.3) ist **eigenständig** und nicht der `input_hash` des Embedding-Datenvertrags `ko-kanon-1` — die beiden Rezepte haben unterschiedliche Eingaben und dürfen sich nicht aneinander koppeln |
| e) Muss `knowledge_object_embeddings` für Punkt 23 verändert werden? | **Nein.** Weder Schema noch Daten noch Rechte |

**Bestätigte Grundannahme:** Semantische Embeddings bleiben in Sprint 23 vollständig
vom produktiven Legacy-Matching getrennt. Ihre Produktnutzung ist ein eigener,
freigabepflichtiger Sprint (22C2).

---

## 10 · Architekturentscheidung für Sprint 23B

### 10.1 Variantenvergleich

| Kriterium | A — nur `matching_results` erweitern | **B+ — `matching_runs` + additive Spalten (empfohlen)** | C — neue Historientabelle je Ergebnis | D — nur Ereignisprotokoll |
|---|---|---|---|---|
| Einfachheit | am höchsten | hoch (1 neue schmale Tabelle) | mittel | am höchsten |
| Datenmenge | unverändert | +1 Zeile je **verändertem** Lauf | +20 Zeilen je Lauf → 20× | minimal |
| Idempotenz | nicht lösbar (kein Vergleichswert) | **gelöst** über Eingabefingerabdruck | gelöst, aber teuer | nicht lösbar |
| Historisierung | **nicht möglich** — der PK erzwingt eine Zeile je Paar | Lauf-Historie ✅, Ergebnis-Historie über die Laufzeile ✅ | vollständig | nur Ereignisse, keine Werte |
| Wiederaufnahme nach Abbruch | nein | ✅ über `status` der Laufzeile | ✅ | nein |
| parallele Läufe | ungelöst | ✅ Laufzeile + Sperre je Mandant | ✅ | nein |
| Mandantentrennung | wie heute | wie heute + `user_id` NOT NULL | wie heute | wie heute |
| Briefing-Nachvollziehbarkeit | **nein** | ✅ über Auswahlprotokoll im Payload | ✅ | teilweise |
| Modellwechsel | **nicht unterscheidbar** | ✅ `rezept_version`/`vektor_version` | ✅ | nein |
| Migrationsrisiko | sehr gering | gering (rein additiv, 287 Zeilen) | mittel (neue große Tabelle) | sehr gering |
| Wartbarkeit | täuscht Nachvollziehbarkeit vor | gut | Wachstum braucht früh Retention | unzureichend |

**Verworfen:**
- **A**, weil der Primärschlüssel `mr-<mandant>-<vorgang>` **genau eine** Zeile je
  Paar erzwingt. Mehr Spalten machen die aktuelle Zeile reicher, aber es gäbe
  weiterhin keinen einzigen früheren Wert. Das verfehlt das Sprintziel „dauerhaft
  nachvollziehbar" und wäre zugleich gefährlich: eine Tabelle mit Feldern wie
  `profil_hash`, die aussieht, als sei sie auditierbar, ohne es zu sein.
- **C**, weil sie 20 Zeilen je Lauf schreibt, um Informationen zu speichern, die zu
  über 90 % identisch sind. Hochgerechnet auf 100 Profile wären das ≈ 2,2 Mio.
  Zeilen im Jahr. Dieselbe Aussage trägt **eine** Laufzeile mit kompakter
  Ergebnisliste — bei ~1/20 der Zeilen und ~1/20 der Indexlast.
- **D**, weil ein Ereignisprotokoll festhält, *dass* gerechnet wurde, aber nicht,
  *was* herauskam. Ein Supportfall bleibt unbeantwortbar.

### 10.2 Die Entscheidung

| Frage | Entscheidung |
|---|---|
| a) Welche Tabellen werden ergänzt/erweitert? | **neu:** `matching_runs`, `briefing_versionen`. **additiv erweitert:** `matching_results` (nur neue Spalten + ein eindeutiger Index). **ohne Migration erweitert:** `briefings.payload` (jsonb) |
| b) Welche Tabellen bleiben unverändert? | `knowledge_objects`, `knowledge_object_embeddings`, `profile_embeddings`, `profiles`, `mandate_profiles`, `decisions`, `sources`, `raw_documents` — **alle** |
| c) Welche eindeutigen Constraints? | `matching_results`: **UNIQUE (`user_id`, `knowledge_object_id`)** — macht die bisherige Codekonvention zur Zusicherung der Datenbank (Production hat 0 Duplikate, der Index ist gefahrlos anlegbar). `matching_runs`: PK auf `id`, zusätzlich Index (`user_id`, `started_at DESC`) und (`user_id`, `eingabe_fingerabdruck`) |
| d) Wie wird ein identischer Zweitlauf idempotent? | Vor dem Schreiben bildet der Lauf einen **Eingabefingerabdruck** aus Profilhash + Rezeptversion + Vektorversion + Schwellenwerten + der sortierten Menge der Vorgangs-Eingabehashes seiner Treffer. Stimmt er mit dem der letzten **vollständigen** Laufzeile desselben Mandanten überein, wird **keine** neue Laufzeile erzeugt und **keine** Ergebniszeile geschrieben; die bestehende Laufzeile bekommt nur `letzter_lauf_at` und `wiederholungen += 1`. **Ein identischer Zweitlauf kostet damit genau ein UPDATE statt heute 20** |
| e) Wie bleiben alte Ergebnisse erhalten? | Über die Laufzeile: `matching_runs.ergebnis` hält die vollständige Rangliste des Laufs kompakt (`[{ko_id, vorgang_id, rank, similarity}]`, ≤ 20 Einträge). Laufzeilen werden **nie** überschrieben und **nie** gelöscht (nur DSGVO-Löschung je Mandant) |
| f) Wie wird ein aktuelles Ergebnis markiert? | `matching_results.aktuell` (boolean, Default `true`) + `abgeloest_am`. Am Ende eines Laufs werden die Zeilen des Mandanten, die **nicht** in der aktuellen Trefferliste stehen, auf `aktuell = false` gesetzt. Damit hört der Bestand auf, Generationen stillschweigend zu vermischen — **ohne** eine einzige Zeile zu löschen |
| g) Teilweise ausgeführter Lauf? | Die Laufzeile wird **vor** dem Schreiben mit `status='laufend'` angelegt und danach auf `vollstaendig` gesetzt. Bricht der Lauf ab, bleibt sie auf `laufend` stehen und ist als unvollständig erkennbar; ihr Fingerabdruck zählt bei (d) **nicht** als „identisch" |
| h) Parallele Läufe? | Eine eigene Sperre `matching-<mandant>` (bestehender `pipeline_locks`-Mechanismus, kurze TTL), die **auch der Lage-Pfad** nimmt — er ist heute ungesperrt (§4.3h). Zweitlauf bei gehaltener Sperre: sauberer Abbruch mit `status='uebersprungen'`, kein Schreibvorgang |
| i) Profilwechsel? | Ändert sich `profil_hash`, ändert sich der Fingerabdruck → neuer Lauf, neue Werte, alte Laufzeile bleibt mit dem alten Hash erhalten. **Damit ist Befund M-3 auditierbar**: man sieht, welche Ergebnisse gegen welchen Profilstand entstanden sind |
| j) Vorgangswechsel? | Ändert sich `ko_eingabe_hash` eines Treffers, ändert sich der Fingerabdruck → gleiche Behandlung wie (i) |
| k) Späterer Rezeptwechsel? | `rezept_version` und `vektor_version` stehen an **jeder** Laufzeile und an jeder Ergebniszeile. Ein neues Rezept schreibt einen neuen Wert; alte und neue Ergebnisse sind dauerhaft trennbar und getrennt auswertbar. Ein Rezeptwechsel bleibt eine eigene Freigabeentscheidung |
| l) Wie werden alte Briefings geschützt? | **Zwei additive Schritte.** (1) `briefings.payload` erhält `auswahl` (die tatsächlich gezeigten Vorgänge mit Rang, Ähnlichkeit, Begründung) und `matchingRunId` — jsonb, **keine Migration**. (2) Bevor `saveRenderedBriefingV3` eine bestehende Tageszeile überschreibt, wird die alte Fassung nach `briefing_versionen` (append-only) kopiert. Die Erzeugungslogik, der Cache-Schlüssel und das Leseverhalten bleiben **unverändert** |
| m) Wie entsteht die Nutzererklärung deterministisch? | Eine reine Funktion `begruendungAusSignalen(matched_features, signale)` in einem neuen `lib/helmut/matching-begruendung.js`: feste Prioritätsreihenfolge, feste Satzschablonen, höchstens zwei Gründe, bei fehlender Belegbasis **leerer String** statt Erfindung. Gleiche Eingabe → gleicher Satz, testbar ohne Netzwerk (§11) |
| n) Warum sind keine zusätzlichen KI-Aufrufe nötig? | Das Legacy-Matching ist bereits vollständig deterministisch (0 KI-Aufrufe). Alles, was 23B speichert, fällt im Lauf ohnehin an oder ist ein Hash über vorhandene Felder. Die Begründung wird aus `matched_features` erzeugt, die die Engine bereits berechnet. **Zusätzliche KI-Kosten: 0,00 USD** |

### 10.3 Was genau gespeichert wird

**`matching_runs`** (neu, append-only, eine Zeile je *verändertem* Lauf und Mandant):

| Feld | Zweck |
|---|---|
| `id` | Lauf-ID |
| `user_id` | Mandant (NOT NULL, FK → `profiles`, ON DELETE CASCADE) |
| `pipeline_run_id` | die bestehende Scheduler-`runId` → verbindet mit `process_runs`/Telemetrie |
| `ausloeser` | `crawl` \| `lage-check` \| `pipeline` \| `manuell` |
| `gestartet_am`, `beendet_am` | Zeitpunkt der Berechnung |
| `status` | `laufend` \| `vollstaendig` \| `uebersprungen` \| `fehlgeschlagen` |
| `rezept_version` | `legacy_relevance_v1` |
| `vektor_version` | z. B. `feature-hash-256-v1` (Dimension + Gewichtssatz) |
| `profil_hash` | Profilstand dieses Laufs |
| `schwellenwerte` | jsonb: `match_count`, Schwelle, Filter — heute `{match_count:20, schwelle:null, filter:{}}` |
| `eingabe_fingerabdruck` | Idempotenzschlüssel (d) |
| `kandidaten`, `geschrieben`, `abgeloest` | Zähler |
| `ergebnis` | jsonb, kompakte Rangliste `[{ko_id, vorgang_id, rank, similarity}]` — **die eigentliche Historie** |
| `wiederholungen`, `letzter_lauf_at` | zählt identische Wiederholungen ohne neue Zeile |
| `fehler` | Fehlertext bei `fehlgeschlagen` |

**`matching_results`** (bestehend, nur additiv): `run_id` · `erst_run_id` ·
`profil_hash` · `ko_eingabe_hash` · `ko_version` · `rezept_version` ·
`vektor_version` · `berechnet_am` · `aktuell` · `abgeloest_am` · `signale` (jsonb) ·
`ausschlussgruende` (jsonb) · `begruendung` (text) · `eingabe_fingerabdruck`.
Bestehende Spalten und die Kennungslogik bleiben **unverändert**.
Zusätzlich empfohlen (Constraint-Verschärfung, freigabepflichtig):
`user_id` und `knowledge_object_id` auf **NOT NULL** (Production hat 0 NULL-Werte).

**Zu `signale`:** ehrlich nur, was heute existiert —
`{legacy_vektor: <similarity>, ausschuss: [...], partei: [...], region: [...], thema: [...]}`.
Fachlicher, geografischer und institutioneller Teilscore werden **nicht** erfunden;
sie fehlen im Rezept (§4.4) und bekommen erst dann ein Feld, wenn sie berechnet
werden. **Kein falsches Grün.**

**Bewertung der abgefragten Kandidatenfelder:**

| Feld | Aufnahme | Begründung |
|---|---|---|
| Wissensobjekt-ID, Mandatsprofil-ID, Mandant, Nutzer-ID | ✅ vorhanden | `knowledge_object_id` + `user_id`; Mandant = Profil = Nutzer (§6a) |
| Matching-Lauf-ID | ✅ neu | `run_id` |
| Gesamtscore | ✅ vorhanden | `similarity` |
| fachlicher / geografischer / institutioneller Score | ❌ **nicht aufnehmen** | existiert nicht — leere Spalten wären eine Falschaussage |
| Ausschussbezug, Partei-/Rollenbezug | ✅ | in `signale` + `matched_features` (Rolle existiert nicht) |
| Legacy-Vektorähnlichkeit | ✅ | identisch mit dem Gesamtscore, wird **nicht** doppelt gespeichert |
| angewandte Filter | ✅ | an der **Laufzeile** (`schwellenwerte`), nicht 20× je Ergebnis |
| Ausschlussgründe | ✅ Spalte, heute leer | die RPC liefert keine Verworfenen; das Feld füllt sich, sobald App-seitig gefiltert wird |
| Profilversion/-hash, Vorgangsversion/-hash | ✅ neu | `profil_hash`, `ko_eingabe_hash`, `ko_version` |
| Rezeptversion, Vektorversion | ✅ neu | Kernstück gegen spätere Vermischung |
| Zeitpunkt der Berechnung | ✅ neu | `berechnet_am` — behebt das eingefrorene `created_at` |
| verwendete Schwellenwerte | ✅ | an der Laufzeile |
| deterministische Begründung | ✅ neu | `begruendung` |
| ausgewählte Rohsignale/Belegfelder | ✅ | `signale`, kompakt |
| Status aktuell/abgelöst | ✅ neu | `aktuell`, `abgeloest_am` |
| Eingabefingerabdruck | ✅ neu | Idempotenz |

### 10.4 Snapshots: die kleinste tragfähige Lösung

Bewertet wurden die fünf geforderten Varianten:

| Variante | Bewertung |
|---|---|
| (a) vollständiger Profilsnapshot je Ergebnis | **verworfen** — 20× je Lauf dieselbe Kopie, und ein Profil enthält personenbezogene Daten; ein Snapshot je Ergebnis vervielfacht die DSGVO-Löschfläche |
| (b) vollständiger Vorgangssnapshot je Ergebnis | **verworfen** — enthielte Artikeltexte, um ein Vielfaches größer als das Ergebnis selbst |
| (c) kompakter Snapshot je Lauf | **teilweise übernommen** — genau das ist `matching_runs.ergebnis` (Rangliste, keine Inhalte) |
| (d) Hashes + vorhandene historische Datensätze | untauglich allein — es **gibt** keine historischen Datensätze für Profile und Vorgänge |
| **(e) Hashes + ausgewählte relevante Signale** | ✅ **Empfehlung** |

**Empfohlen: (e) plus (c).** Hashes beweisen, *ob* sich etwas geändert hat; die
kompakten Signale und die Laufrangliste zeigen, *was* herauskam. Was ein Hash nicht
leistet — den alten Inhalt rekonstruieren — leistet auch kein Snapshot dieser Größe;
dafür wären echte Profil- und Vorgangshistorien nötig, und die gehören nicht in
Punkt 23.

**Ausdrücklich ausgeschlossen** (Sprintvorgabe, hier bestätigt): vollständige
Artikeltexte in Matching-Ergebnissen · vollständige Vektoren je Ergebnis ·
vollständige Profilkopien je Ergebnis · jeder Zwischenberechnungsschritt · alle
verworfenen Kandidaten · KI-Denkprozesse · lange KI-Erklärungen.

### 10.5 Kostenabschätzung — **alle Werte sind Schätzungen**

Grundlage: gemessene **685 Byte/Zeile inkl. Indizes** in `matching_results`,
4 Läufe je Mandant und Tag, 7 Mandanten mit Ergebnissen, 287 Bestandszeilen.

| Größe | Schätzung |
|---|---|
| a) einmalige zusätzliche Zeilen | **0** — die Migration legt nur Spalten und Tabellen an, keine Daten. Die 287 Bestandszeilen bleiben und tragen NULL in den neuen Feldern (ehrlich: „vor 23B berechnet") |
| b) zusätzliche Zeilen je vollständigem Lauf | **1** Laufzeile (+ bis zu 20 UPDATEs auf bestehenden Ergebniszeilen, wie heute) |
| c) zusätzliche Zeilen bei identischem Lauf | **0** Zeilen, **1** UPDATE (heute: 20 UPDATEs) — die Schreiblast **sinkt** |
| d) Speicher je Ergebniszeile | heute ~685 B → mit den neuen Feldern **~1,0–1,2 kB** (3 Hashes à 32 Zeichen, zwei kurze Texte, ein kleines jsonb) |
| e) Speicher je Laufzeile | **~1,5–2,0 kB** (Kopf ~0,4 kB + Rangliste 20 × ~55 B) |
| f) bei 10 Profilen | ~3 veränderte Läufe/Tag/Profil → ~30 Laufzeilen/Tag ≈ **11 000/Jahr ≈ 20 MB/Jahr**; Ergebnistabelle wächst wie heute (~30 neue Zeilen/Tag ≈ 11 MB/Jahr) |
| g) bei 100 Profilen | ~300 Laufzeilen/Tag ≈ **110 000/Jahr ≈ 200 MB/Jahr**. **Ab dieser Größenordnung braucht `matching_runs` eine Retention-Regel** (Vorschlag: 90 Tage vollständig, danach nur noch Kopf ohne `ergebnis`) — das ist eine eigene, freigabepflichtige Entscheidung, nicht Teil von 23B |
| h) erwartete Schreibvorgänge | unverändert bis **geringer** als heute, siehe (c) |
| i) Auswirkung auf Supabase | Datenbank heute 64 MB (Free-Tier-Grenze 500 MB). Bei 7–10 Profilen ≈ **+30 MB/Jahr** — unkritisch. Bei 100 Profilen ist die Retention aus (g) nötig |
| j) Auswirkung auf reguläre Crawls | **keine.** Zwei zusätzliche Schreibvorgänge je Lauf (Laufzeile anlegen/abschließen), im Millisekundenbereich, hinter der bestehenden Zeitbudgetlogik |
| k) Auswirkung auf Understanding | **keine** — anderer Pfad, nicht berührt |
| l) Auswirkung auf die Briefing-Erstellung | ein zusätzliches jsonb-Feld im Payload (~1–2 kB) und beim Überschreiben eine Archivzeile. Bei 71 Briefings heute: **< 1 MB/Jahr** |
| m) zusätzliche KI-Kosten | **0,00 USD** — kein einziger neuer Modellaufruf (§10.2n) |

### 10.6 Mandantenneutralität

Das Zielmodell führt **keine** Bindung an einen konkreten Mandanten ein: keine
Kennung im Schema, kein Default, kein Fallback, kein Sonderpfad. Alle Felder sind
ebenen- und länderneutral und funktionieren für Bundestag, Berlin, Brandenburg und
weitere Länder identisch. Ein Test sichert das ab (§12, T-6).

---

## 11 · Geplante Nutzererklärung (Sprint 23C) — Entwurf, nicht umgesetzt

**Form.** Ein bis zwei kurze Sätze, Du-Form, keine Zahlen, keine Fachbegriffe,
höchstens **zwei** politische Gründe.

```
Warum relevant?
Betrifft deinen Ausschuss Arbeit und Soziales und deinen Schwerpunkt Rente.
```

**Prioritätsreihenfolge der Gründe** (die ersten zwei vorhandenen gewinnen):

1. **Ausschuss** — der stärkste mandatsspezifische Bezug
2. **Fachthema / Schwerpunkt**
3. **Wahlkreis / Region**
4. **Partei oder Fraktion**

Partei steht bewusst zuletzt: sie stellt **55 von 79** heutigen Merkmalstreffern und
würde die Erklärung sonst dominieren, ohne etwas Konkretes zu sagen
(„Betrifft deine Partei" hilft niemandem bei einer Entscheidung).

**Feste Regeln.**
- Erzeugt aus `matched_features` und `signale` durch eine **reine Funktion**, ohne
  KI, ohne Netzwerk, ohne Zufall. Gleiche Eingabe → gleicher Satz.
- **Keine Merkmale → kein Satz.** Es wird nichts erfunden und kein Ersatzgrund
  konstruiert (Belegpflicht, `START_HERE.md` §5.2). Heute beträfe das **78,4 %** der
  Zeilen — die Erklärung erscheint anfangs also bei einer Minderheit der Vorgänge.
  Das ist der ehrliche Zustand und zugleich ein messbares Qualitätsziel für spätere
  Sprints (mehr Ausschuss- und Fachgebietsabdeckung → mehr erklärbare Vorgänge).
- Keine Prozentwerte, keine Scores, kein Rang, kein Wort wie „Ähnlichkeit",
  „Vektor", „Matching" oder „Score" in der sichtbaren Oberfläche.

**Wo sie erscheinen soll.** Empfehlung: **im Vorgang, nicht im Briefing-Narrativ.**

- **Vorgangskarte (Lage und Radar): ja.** Dort trifft der Nutzer die Entscheidung,
  dort ist die Frage „warum sehe ich das?" akut. Die Karten der Briefing-Ansicht
  sind dieselben Karten — die Erklärung erscheint dort automatisch mit.
- **Briefing-Narrativ: nein.** Der Fließtext ist KI-erzeugt; ein eingeschobener
  deterministischer Satz würde stilistisch brechen und könnte der KI-Formulierung
  sogar widersprechen. Zusätzlich hielte es Sprint 23C klein und ließe die
  Briefing-Erzeugung unangetastet.

---

## 12 · Abnahmekriterien für Sprint 23B

1. Migration `supabase/migrations/<datum>_matching_audit.sql` **rein additiv**, mit
   vollständigem Rollback im selben Verzeichnis; keine bestehende Spalte geändert,
   keine Tabelle ersetzt oder gelöscht.
2. Der eindeutige Index `(user_id, knowledge_object_id)` ist angelegt und
   Production-verträglich (0 Duplikate vorab gemessen und im Runbook belegt).
3. Jeder Lauf erzeugt genau eine `matching_runs`-Zeile mit `status='vollstaendig'`
   — **oder** dokumentiert nachweislich, warum keine erzeugt wurde.
4. **Idempotenz bewiesen:** ein identischer Zweitlauf erzeugt **0** neue Zeilen,
   **0** geänderte Ergebniswerte und genau **1** UPDATE der Laufzeile (belegt mit
   Vorher/Nachher-Zahlen aus Production, analog Sprint 22C1).
5. **Abbruch bewiesen:** ein mittendrin abgebrochener Lauf hinterlässt
   `status='laufend'` und wird beim nächsten Lauf nicht als „identisch" gewertet.
6. **Parallelität bewiesen:** ein zweiter gleichzeitiger Lauf für denselben
   Mandanten wird durch die Sperre `matching-<mandant>` abgewiesen (`uebersprungen`),
   ohne zu schreiben — **auch aus dem Lage-Pfad heraus**.
7. **T-1** Idempotenz-, Abbruch- und Parallellauftests offline in
   `scripts/matching-audit-test.js`.
8. **T-2** Test: Profiländerung → neuer Fingerabdruck → neue Laufzeile; die alte
   Laufzeile bleibt byte-identisch erhalten.
9. **T-3** Test: Vorgangsänderung → neuer `ko_eingabe_hash` → dasselbe Verhalten.
10. **T-4** Adversarialer Test: `runMatchingShadow` mit einem Profil, dessen Kennung
    nicht zur übergebenen `userId` passt → **harte Ablehnung**, kein Schreibvorgang
    (schließt das in §8h benannte Restrisiko).
11. **T-5** Adversarialer Test: gemischte Mandanten in einem
    `matching_runs`-Schreibstapel → `CROSS_TENANT_WRITE` (analog
    `cross-tenant-security-test.js`).
12. **T-6** Test Mandantenneutralität: kein Mandantenname in Migration, Modul oder
    Begründungslogik; das Modell verhält sich für ein Bundes- und ein Landesprofil
    identisch.
13. **T-7** Test Semantiktrennung: `knowledge_object_embeddings` wird von keinem der
    neuen Module gelesen; `rezept_version` ist gesetzt und ≠ einem semantischen
    Rezeptnamen.
14. **Legacy-Matching unverändert:** `similarity`, `rank` und die Auswahl sind für
    dieselben Eingaben byte-identisch zu heute (Gegenbeweis auf unverändertem `main`).
15. Alte Briefings bleiben erhalten: ein Überschreibungsfall erzeugt nachweislich
    eine `briefing_versionen`-Zeile.
16. Offline-Suite grün (Referenz: **176/176** in sauberer Umgebung), neue Suite
    vollständig grün, Zahlen dokumentiert.
17. Kein Production-Schreibvorgang ohne ausdrückliche Freigabe; Migration und
    Backfill je einzeln freigabepflichtig.
18. `CURRENT_STATE.md` und dieses Dokument fortgeschrieben.

**Empfohlene Reihenfolge:**

1. **23B-1 — Struktur (freigabepflichtig für die Migration).** Migration +
   Rollback, `lib/helmut/matching-contract.js` (Eingabehashes, Fingerabdruck),
   Erweiterung von `runMatchingShadow` um Laufzeile, Sperre, Idempotenz und
   `aktuell`-Markierung; Tests T-1…T-7. Production-Wirkung erst nach Freigabe.
2. **23B-2 — Briefing-Anbindung.** `auswahl` + `matchingRunId` im Payload,
   `briefing_versionen`. Braucht **keine** Migration für den Payload-Teil.
3. **23C — Sichtbare Erklärung.** `matching-begruendung.js` +
   Vorgangskarte. Erst danach, weil die Begründung aus den in 23B gespeicherten
   Signalen entsteht.

**Reihenfolgebegründung:** 23C vor 23B wäre möglich (die Begründung ließe sich schon
heute aus `matched_features` erzeugen), aber sie wäre nicht haltbar: Der angezeigte
Satz würde beim nächsten Lauf stillschweigend verschwinden oder sich ändern, ohne
dass jemand nachvollziehen könnte, warum. Erst 23B macht die Erklärung dauerhaft.

---

## 13 · Nachweis: nur lesende Production-Zugriffe

Alle Production-Abfragen dieses Sprints waren reine `SELECT`-Anweisungen über
`mcp__Supabase__execute_sql` gegen Projekt `ddckuvvpcytqbyfmbvie`:

| # | Gegenstand | Art |
|---|---|---|
| 1 | Spalten von `matching_results` (`information_schema.columns`) | SELECT |
| 2 | Constraints (`pg_constraint`) | SELECT |
| 3 | RLS-Status (`pg_class`) + Policy-Zahl je Tabelle | SELECT |
| 4 | Tabellenrechte (`information_schema.role_table_grants`) | SELECT |
| 5 | Indizes (`pg_indexes`) | SELECT |
| 6 | Policy-Definitionen (`pg_policies`) | SELECT |
| 7 | Zeilenzahlen über 8 Tabellen | SELECT |
| 8 | Verteilung je Mandant | SELECT |
| 9 | Duplikate, Waisen, Kennungsformat, Rangkollisionen | SELECT |
| 10 | `created_at`-Histogramm `cem-ince` | SELECT |
| 11 | Rangverteilung | SELECT |
| 12 | Abdeckung Vorgänge, Alter, KO-Änderungen | SELECT |
| 13 | Payload-Schlüssel der Briefings (`jsonb_object_keys`) | SELECT |
| 14 | Spalten von `decisions`, `mandate_profiles`, `knowledge_object_embeddings` | SELECT |
| 15 | `profile_embeddings` (Hash/Zeitstempel, **ohne** Vektoren) | SELECT |
| 16 | Ergebnisse/Decisions/Briefings je Profil | SELECT |
| 17 | Merkmalsabdeckung der verstandenen Vorgänge | SELECT |
| 18 | `matched_features`-Verteilung + Typen | SELECT |
| 19 | `ko_version`-Verteilung | SELECT |
| 20 | Stundenhistogramm | SELECT |
| 21 | Tabellengrößen (`pg_total_relation_size`) | SELECT |

**0** schreibende Anweisungen · **0** Migrationen · **0** DDL · **0** KI-Aufrufe ·
**0** Änderungen an Flags, Cron, Secrets oder Vercel-Variablen.

---

# Teil B — Sprint 23B-1: die umgesetzte Auditpersistenz

**Stand:** 2026-07-28 · Sprint 23B-1 (Umsetzung, **nachgeschärft**) · Basis `main` = `53893fa` (Merge PR #168)
**Zustand:** implementiert, offline und gegen eine echte PostgreSQL bewiesen,
**Migration NICHT angewendet**, Rollout-Grenze **AUS**.

> **Nachschärfung 2026-07-28 (Betreibereinwand, §16.1):** Die erste Fassung
> veröffentlichte in drei aufeinanderfolgenden Schreibvorgängen. Das war
> **nicht atomar** — ein Abbruch dazwischen ersetzte die operative Projektion,
> ohne den Lauf abzuschließen, und hinterließ Ergebniszeilen, die auf einen
> unvollständigen Lauf zeigten. Der letzte vollständige Stand war damit
> verloren, nicht erhalten. Die Veröffentlichung ist jetzt **eine echte
> Datenbanktransaktion**; ein datenbankseitiger Riegel schließt zusätzlich aus,
> dass eine Ergebniszeile je auf einen unvollständigen Lauf verweist.

Teil A (§1–§13) bleibt unverändert der belegte Ist-Zustand aus Sprint 23A. Teil B
beschreibt, was daraus gebaut wurde.

## 14 · Was gebaut wurde

### 14.1 Die zwei Rollen

| | `matching_results` | `matching_runs` |
|---|---|---|
| Frage | **„Was gilt jetzt?"** | **„Wie kam es dazu?"** |
| Rolle | operative Projektion — der einzige Lesepfad des Produkts (`lage.js:325`) | Auditprotokoll — von keinem Produktpfad gelesen |
| Lebensdauer | eine Zeile je (Mandant, Wissensobjekt), wird fortgeschrieben | eine Zeile je **verändertem** Lauf, append-only |
| Änderbarkeit | wie bisher | nach `status='vollstaendig'` **fachlich unveränderlich** (DB-Trigger) |
| Gelöscht wird | nie (nur DSGVO) | nie (nur DSGVO) |

Der entscheidende Punkt: **die Projektion bleibt kompatibel.** Alle bestehenden
Spalten, die Kennungslogik `mr-<mandant>-<vorgang>` und der Schreibpfad sind
unverändert. Ein Leser, der die Auditspalten nicht kennt, merkt von diesem Sprint
nichts.

### 14.2 Laufzustände — drei statt fünf, begründet

Die Sprintvorgabe nannte fünf Kandidaten (`running`, `completed`, `partial`,
`failed`, `cancelled`) und verlangte ausdrücklich, unnötige Zustände zu vermeiden.
Umgesetzt sind **drei**:

| Zustand | Bedeutung | Warum er gebraucht wird |
|---|---|---|
| `laufend` | gestartet, Ausgang unbekannt | Ein Absturz hinterlässt genau diesen Zustand. Er gilt **nie** als aktuell und **nie** als idempotenter Treffer |
| `vollstaendig` | abgeschlossen, unveränderlich | der einzige Zustand, gegen den Idempotenz prüft |
| `fehlgeschlagen` | mit dokumentiertem Fehler beendet | trennt „abgestürzt" von „bekannt gescheitert" und trägt den Fehlertext |

**`partial` entfällt**, weil die Ergebnisprojektion in **einem** Bulk-Upsert
geschrieben wird — ein echter Teilzustand der Projektion existiert nicht. Ein Lauf,
der nach dem Schreiben abbricht, bleibt auf `laufend` bzw. wird `fehlgeschlagen`;
beides bedeutet bereits „nicht aktuell". Ein zusätzlicher Wert hätte dieselbe
Wirkung gehabt und nur die Auswertung verkompliziert.

**`cancelled` entfällt**, weil ein übersprungener Lauf (Sperre gehalten oder
identischer Eingang) **gar keine Zeile erzeugt**: es wurde nichts berechnet, was zu
protokollieren wäre. Das hält die Tabelle frei von Leerlaufzeilen — bei vier Läufen
je Mandant und Tag wären das sonst überwiegend Leerzeilen.

Ein `vollstaendig`-Lauf ist per Trigger `helmut_matching_run_immutable` eingefroren.
Fortschreibbar bleiben ausschließlich `wiederholungen`, `letzter_lauf_at`,
`wiederaufnahme_am` und `fehler` — genau die technischen Metadaten für Wiederholung,
Wiederaufnahme und nachträgliche Fehlerdokumentation.

### 14.3 Was `matching_results` bekommt — und was bewusst nicht

**Ergänzt (14 Spalten, alle additiv, alle NULL-fähig, kein Backfill):**
`run_id` · `profil_hash` · `ko_eingabe_hash` · `ko_version` · `engine_version` ·
`rezept_version` · `vektor_version` · `eingabe_fingerabdruck` · `berechnet_am` ·
`aktuell` · `abgeloest_am` · `signale` · `begruendung` · `updated_at`.

**Bewusst NICHT ergänzt** — jede Ablehnung mit Grund:

| Gefordert zu bewerten | Entscheidung | Grund |
|---|---|---|
| fachlicher / geografischer / institutioneller Teilscore | **nein** | existiert im Rezept `legacy_relevance_v1` nicht (§4.4). Eine Spalte, die immer NULL ist, behauptet eine Berechnung, die nie stattfindet — falsches Grün |
| `ausschlussgruende` | **nein** (Abweichung von §10.3) | die RPC `match_knowledge_objects` liefert die Top-N unbedingt; app-seitig wird **kein** Kandidat verworfen. Die Spalte wäre dauerhaft leer. Sie kommt, wenn tatsächlich gefiltert wird |
| `mandate_profile_id` an der Ergebniszeile | **nein** | heute identisch mit `user_id`; die Profilkennung steht an der **Laufzeile**. Keine redundante Identitätskopie |
| `tenant_id` | **nein** | `user_id` **ist** die kanonische Mandantenkennung |
| `updated_at`-**Trigger** | **nein** | ein Trigger hätte das Verhalten der bestehenden Tabelle verändert. `updated_at` setzt ausschließlich der Auditpfad explizit; ohne Auditpersistenz bleibt es NULL — ehrlich statt heimlich |
| NOT-NULL auf `user_id`/`knowledge_object_id` | **vertagt** | Production hat 0 NULL-Werte (§5.2), aber eine Verschärfung an einer laufend beschriebenen Tabelle braucht einen eigenen Production-Beweis. Stattdessen greift der neue eindeutige Index; die Verschärfung ist als späterer Schritt notiert (§15.5) |

`eingabe_fingerabdruck` **bleibt** an der Ergebniszeile, obwohl er für alle 20 Zeilen
eines Laufs gleich ist: `run_id` trägt `ON DELETE SET NULL`, damit eine DSGVO-Löschung
der Historie die Projektion nicht mitreißt. Der Fingerabdruck überlebt das und
identifiziert die Generation weiterhin. Das ist der klare Zweck, der die Redundanz
rechtfertigt.

### 14.4 Die kompakte Rangliste

`matching_runs.ergebnis` speichert je Treffer genau neun Felder:
`ko_id` · `vorgang_id` · `result_id` · `rank` · `similarity` · `signale` ·
`ko_eingabe_hash` · `ko_version` · `begruendung`.

**Nicht gespeichert:** Artikeltexte, Vektoren, Profilkopien, Zwischenrechenschritte,
verworfene Kandidaten (es gibt keine), KI-Erklärungen.

`result_id` wird bewusst mitgeführt, obwohl es aus `mr-<user_id>-<ko_id>` ableitbar
wäre: Sprint 23A hat belegt, dass diese Eindeutigkeit bis heute nur eine
**Codekonvention** ist. Ein Audit, das von einer Konvention abhängt, ist kein Audit.

**Deterministische Speicherreihenfolge:** `rank` aufsteigend, bei gleichem oder
fehlendem Rang `similarity` absteigend, dann `ko_id` byte-stabil aufsteigend.
Bewusst **kein** `localeCompare` — dessen Ergebnis hängt von der Locale der
Laufzeitumgebung ab und könnte denselben Eingang in zwei Umgebungen unterschiedlich
sortieren.

**Diese Regel verändert das Produkt-Ranking nicht.** Der ausgelieferte Rang steht
unverändert in `matching_results.rank` und entsteht weiterhin ausschließlich im
Matching. Die Tie-Break-Regel legt nur fest, in welcher Reihenfolge bereits vergebene
Ränge **gespeichert** werden, damit zwei Läufe mit identischem Ergebnis ein
byte-identisches `jsonb` erzeugen.

## 15 · Der Eingabefingerabdruck

Definiert in `lib/helmut/matching-contract.js`. Er beantwortet genau eine Frage:
*Ist das fachlich derselbe Eingang wie beim letzten vollständigen Lauf?*

### 15.1 Kanonische Serialisierung

```
sha256( canonicalJson({
  schema:          "matching-audit-1",
  tenant:          <Mandant>,
  profil:          <Mandatsprofil>,
  profil_hash:     <Profilstand>,
  engine:          <Engine-Version>,
  rezept:          <Rezeptversion>,
  vektor:          <Vektorversion>,
  schwellenwerte:  { match_count, schwelle, filter },
  kandidaten_hash: sha256( rezept + "\n" + sortiert( "<ko_id>|<sim4>|<ko_eingabe_hash>" ) )
}) )
```

`canonicalJson` sortiert Objektschlüssel byte-stabil aufsteigend, normalisiert
`NaN`/`Infinity` zu `null` und lässt `undefined` weg. Ähnlichkeiten gehen als
`toFixed(4)` ein — dieselbe Rundung wie im produktiven Pfad, ohne Float-Formatdrift.

### 15.2 Warum die Kandidatenmenge **zwei** Merkmale je Treffer trägt

- **Ähnlichkeit:** erkennt jede Änderung am Wissensobjekt, die das Ergebnis
  beeinflusst — auch dann, wenn das Objekt nicht im geladenen Fenster lag.
- **Eingabehash:** `sha256(Rezeptversion + sortierte, deduplizierte Merkmalstoken)`.
  Gehasht wird **genau der Eingang des Rezepts**. Eine Umsortierung, eine Dublette
  oder ein Feld, das gar nicht ins Rezept eingeht, erzeugt deshalb **keinen** neuen
  Hash; eine fachlich wirksame Änderung zwingend einen.

**Befund M-7 (neu, ehrlich benannt):** `runMatchingShadow` lädt für die
`matched_features` nur ein Fenster von 200 Wissensobjekten
(`listKnowledgeObjects({limit: 200})`). Liegt ein Treffer nicht darin, ist das
Objekt leer — das ist die wahrscheinlichste Erklärung für die 78,4 % leeren
`matched_features` aus §5.3. Für die Auditpersistenz heißt das: `ko_eingabe_hash`
bleibt in diesem Fall `null`, und die Änderungserkennung trägt allein die
Ähnlichkeit. Das ist ehrlicher als ein Hash über ein leeres Objekt. **M-7 wird in
diesem Sprint nicht behoben** — eine Änderung am Ladefenster würde `matched_features`
verändern und damit das fachliche Ergebnis (ausdrücklich ausgeschlossen).

### 15.3 Was der Fingerabdruck **nicht** enthält

Lauf-ID · Zeitstempel · Auslöser · Pipeline-Laufkennung · Zähler ·
Eingabereihenfolge. Testgesichert (T13f).

### 15.4 Idempotenz

Vor jedem Schreibvorgang wird der letzte **vollständige** Lauf desselben Mandanten
mit demselben Fingerabdruck gesucht.

| Fall | Wirkung |
|---|---|
| Treffer | **0** neue Laufzeilen · **0** Schreibvorgänge auf `matching_results` · `berechnet_am`/`updated_at` unverändert · genau **1** UPDATE (`wiederholungen += 1`, `letzter_lauf_at`) |
| kein Treffer | neue Laufzeile, neue Generation |
| Treffer ist `laufend` oder `fehlgeschlagen` | **kein** Treffer — ein abgebrochener Lauf darf keinen unvollständigen Stand zementieren |

Das ist zugleich **datenbankseitig erzwungen**: der Teilindex
`matching_runs_fingerprint_uidx (user_id, eingabe_fingerabdruck) where status =
'vollstaendig'` macht eine zweite vollständige Generation zum selben Eingang
unmöglich. Bewusst als Teilindex — sonst blockierte ein einziger abgestürzter Lauf
jede Wiederholung.

**Wirkung auf die Schreiblast:** heute schreibt ein identischer Zweitlauf **20
UPDATEs** ohne inhaltliche Änderung (§4.3g). Mit aktivierter Auditpersistenz sind es
**0**. Die Schreiblast sinkt.

### 15.5 Historisierung

- Ein geänderter Profilstand, ein geänderter relevanter Wissensobjektstand, eine neue
  Rezept-, Engine- oder Vektorversion erzeugen jeweils einen neuen Fingerabdruck →
  eine neue, nachvollziehbare Generation.
- Alte `vollstaendig`-Läufe bleiben **byte-identisch** erhalten (Trigger).
- Aus der Trefferliste gefallene Ergebniszeilen werden **nicht gelöscht**, sondern
  auf `aktuell = false` + `abgeloest_am` gesetzt. Damit hört der Bestand auf,
  Generationen stillschweigend zu vermischen (§1, Punkt 3) — ohne eine einzige Zeile
  zu verlieren.
- **Befund M-3 wird damit auditierbar:** man sieht, welche Ergebnisse gegen welchen
  Profilstand entstanden sind.

## 16 · Atomizität, Parallelität, Abbruch

### 16.1 Korrigierter Befund: eine Reihenfolge ist nicht atomar

> **Diese Fassung korrigiert einen Fehler der ersten Umsetzung.** Ursprünglich
> bestand die Veröffentlichung aus drei aufeinanderfolgenden, unabhängigen
> Schreibvorgängen (Projektion → Ablösung → Laufabschluss). Die Begründung
> lautete: weil der Abschluss zuletzt kommt, könne es nie einen vollständigen
> Lauf ohne Projektion geben. **Das war richtig, aber es war die falsche
> Invariante.**
>
> `matching_results` wird per Upsert **in place** überschrieben. Sobald der
> Ergebnis-Upsert gelandet ist, sind die vorherigen Werte weg — unabhängig
> davon, was danach mit der Laufzeile passiert. Ein Abbruch zwischen Schritt 2
> und Schritt 4 hinterließ also einen Zustand, in dem
>
> - die operative Projektion bereits ersetzt war,
> - der zugehörige Lauf aber `laufend` oder `fehlgeschlagen` blieb,
> - und damit Ergebniszeilen auf einen unvollständigen Lauf zeigten.
>
> Der letzte vollständige Stand war in diesem Fall **verloren**, nicht erhalten.
> Genau das ist unzulässig: `matching_results` ist die aktuelle operative
> Produktprojektion und darf ausschließlich auf einen vollständig
> veröffentlichten Lauf verweisen. Eine bloße Reihenfolge unabhängiger
> Schreibvorgänge gilt nicht als atomar.

### 16.2 Die Korrektur: eine echte Transaktion

Die Veröffentlichung ist jetzt **ein einziger Aufruf** und damit **eine
Transaktion**: `public.helmut_publish_matching_run(p_run_id, p_user_id,
p_results, p_abgeloest_am)`.

```
1. Laufzeile anlegen      status = 'laufend'   ← veröffentlicht NICHTS
2. Zeilen bauen           rein, ohne Datenbank
3. VERÖFFENTLICHEN        EIN Aufruf = EINE Transaktion:
                            a) Advisory-Lock je Mandant
                            b) Lauf unter Zeilensperre lesen und prüfen
                               (muss 'laufend' sein und dem Mandanten gehören)
                            c) jede Ergebniszeile auf Mandant und Lauf prüfen
                            d) Lauf auf 'vollstaendig' setzen
                            e) Projektion schreiben
                            f) abgelöste Zeilen markieren
```

**Entweder alles oder nichts.** Bricht irgendetwas ab — Netzwerk, Prozess,
Constraint, Bug —, rollt die Datenbank die gesamte Transaktion zurück: der Lauf
bleibt `laufend`, die Projektion bleibt **byte-identisch** die vorherige.

Schritt (d) steht bewusst **vor** (e). Innerhalb einer Transaktion ist die
Reihenfolge ohnehin gleichgültig, aber so findet der Riegel aus §16.2.1 bei
jeder einzelnen Ergebniszeile bereits einen vollständigen Lauf vor.

#### 16.2.1 Der Riegel — datenbankseitig, nicht nur laut Code

Trigger `matching_results_run_complete` (`before insert or update of run_id`):
trägt eine Ergebniszeile ein `run_id`, muss der referenzierte Lauf
`vollstaendig` sein. Sonst wird der Schreibvorgang abgelehnt.

Damit ist die Anforderung **strukturell** erfüllt und nicht nur durch
Anwendungslogik zugesichert. Der Legacy-Pfad (ohne Auditpersistenz) schreibt
kein `run_id`; dort endet der Riegel sofort und ändert nichts am Verhalten.

#### 16.2.2 Warum eine Datenbankfunktion — und warum sie unbedenklich ist

Die Sprintvorgabe erlaubte eine Datenbankfunktion nur, wenn sie für die
Atomizität **wirklich** nötig ist. Sie ist es (§16.1). Die Auflagen sind
eingehalten:

| Auflage | Umsetzung |
|---|---|
| keine unnötige `SECURITY DEFINER`-Funktion | **`SECURITY INVOKER`** (Default). Die Funktion zieht nur eine Transaktionsgrenze und verleiht **keine** Rechte |
| Tenant und Profil innerhalb der Funktion validieren | `p_user_id` ist Pflicht; der Lauf wird über `(id, user_id)` gelesen; **jede** Ergebniszeile wird auf `user_id` und `run_id` geprüft |
| fremde Tenant-Daten ablehnen | fremder Mandant → Lauf „nicht gefunden"; gemischter Stapel → harter Abbruch, bevor irgendetwas geschrieben ist |
| nur die notwendigen Tabellen verändern | ausschließlich `matching_runs` und `matching_results` |
| Suchpfad sicher setzen | `set search_path = public, pg_temp` |
| Berechtigungen minimal | `revoke all from public, anon, authenticated`; `grant execute` nur an `service_role` |
| `service_role`-Bypass ehrlich dokumentieren | steht als Kommentar in der Funktion: `service_role` umgeht RLS; durchsetzend sind die Prüfungen **in** der Funktion **und** die App-Guards davor |

**Zusätzliche Zustandsprüfung:** nur ein Lauf im Zustand `laufend` ist
veröffentlichbar. Ein bereits vollständiger Lauf kann nicht erneut
veröffentlicht werden, ein fehlgeschlagener nicht wiederbelebt.

**Parallelität in der Datenbank:** `pg_advisory_xact_lock` je Mandant
serialisiert gleichzeitige Veröffentlichungen desselben Mandanten — unabhängig
von der App-Sperre und ohne eine fremde Tabelle zu sperren. Er wird bei Commit
**und** bei Rollback automatisch frei.

#### 16.2.3 Die geltenden Invarianten

| Invariante | Wie sie erzwungen wird |
|---|---|
| Keine `matching_results`-Zeile verweist auf einen `laufend`/`fehlgeschlagen`-Lauf | Trigger `matching_results_run_complete` |
| Ein Abbruch lässt den vorherigen vollständigen Stand **byte-identisch** | Transaktions-Rollback |
| Laufstatus, Projektion und Ablösung werden gemeinsam sichtbar | eine Transaktion |
| Ein vollständiger Lauf kann nicht erneut veröffentlicht werden | Zustandsprüfung unter `for update` |
| Ein abgeschlossener Lauf wird nie mehr fachlich verändert | Trigger `matching_runs_immutable` |

**Was ausdrücklich KEINE Invariante ist:** „jeder vollständige Lauf hat
Ergebniszeilen, die auf ihn zeigen". Ein älterer vollständiger Lauf verliert
seine Zeilen, sobald ein neuerer Lauf dieselben Paare überschreibt — das ist
der normale Generationswechsel. Seine Historie bleibt in
`matching_runs.ergebnis` vollständig erhalten. (Die frühere Fassung dieses
Dokuments führte die Umkehrung als Prüfabfrage — das war falsch und ist in
§21.4 korrigiert.)

### 16.3 Sperre

Eine Sperre `matching-<mandant>` über die **bestehende** `pipeline_locks`-Infrastruktur
(kein zweites Sperrsystem), TTL 5 Minuten.

- Sie schließt die in Sprint 23A belegte Lücke, dass der **Lage-Pfad** — anders als
  der Crawl-Pfad — ungesperrt matcht (§4.3h).
- Unterschiedliche Profile tragen unterschiedliche Sperrnamen und laufen weiterhin
  parallel.
- Ein abgelaufener Lock blockiert nichts dauerhaft (TTL).
- Ein Lock-Verlust kann **keinen** unvollständigen Lauf als aktuell veröffentlichen:
  `vollstaendig` wird zuletzt geschrieben, und der Teilindex verhindert eine zweite
  vollständige Generation zum selben Eingang.
- Der Sperrname enthält ausschließlich die übergebene Mandantenkennung — **keine
  feste Bindung an einen konkreten Mandanten** (testgesichert, T6c).

**Wichtig:** Die Sperre wird **nur im Auditpfad** genommen. Ohne die Rollout-Grenze
bleibt das heutige Parallelverhalten unverändert — das Schließen der Lücke in
Production ist damit an dieselbe Freigabeentscheidung gebunden wie die
Auditpersistenz selbst. Die Stärke der Sperre hängt an `HELMUT_ATOMIC_LOCK`
(atomar = fail-closed, Blob-Fallback = fail-open).

### 16.4 Wiederaufnahme

Ein auf `laufend` stehengebliebener Lauf wird **nicht** automatisch fortgesetzt. Er
wird beim nächsten regulären Lauf schlicht überholt, weil er nie als idempotenter
Treffer zählt. Neu rechnen kostet 0 KI und 0 USD; einen Teilzustand zu raten wäre
das größere Risiko. `markResumed()` setzt lediglich `wiederaufnahme_am`, damit
sichtbar bleibt, dass jemand den Lauf angefasst hat.

### 16.5 Fehlerpolitik — Datenintegrität vor falschem Grün

| Zeitpunkt | Verhalten |
|---|---|
| Fehler beim Anlegen der Laufzeile | Der Lauf wird **abgebrochen**. Es ist nichts geschehen — die Laufzeile veröffentlicht nichts |
| Fehler beim Bauen der Zeilen | dito; die Laufzeile wird `fehlgeschlagen` markiert, veröffentlicht wurde nichts |
| Fehler **in** der Veröffentlichung — an JEDER Stelle | Die Datenbank rollt die **gesamte** Transaktion zurück. Die vorherige vollständige Generation bleibt **byte-identisch** die aktuelle. Die Laufzeile wird `fehlgeschlagen` markiert |
| Auch das Markieren scheitert | Die Zeile bleibt `laufend` — ebenfalls „nicht veröffentlicht", also sicher |

Es gibt **keinen** Zeitpunkt mehr, an dem die Projektion ersetzt ist, der Lauf
aber nicht vollständig — genau das war der Fehler der ersten Fassung (§16.1).
Der Fehler geht in allen Fällen an den bestehenden `recordPipelineError`-Pfad
des Schedulers.

Ein Auditfehler verändert **nie** einen Ähnlichkeitswert, einen Rang, ein
`matched_feature` oder die Kandidatenauswahl.

## 17 · Mandantentrennung, RLS, Berechtigungen

### 17.1 Identitätsmodell

Sprint 23A hat belegt: **Mandantenkennung und Profilkennung sind dieselbe
Zeichenkette** (`mandate_profiles.PK = user_id = profiles.id`). Eine eigene Profil-ID
existiert nicht.

Die kleinste additive Lösung, umgesetzt:

- `user_id` bleibt die **kanonische** Kennung und trägt den FK auf `profiles`
  (`ON DELETE CASCADE`).
- `matching_runs.mandate_profile_id` existiert als **eigene Spalte** mit heute
  demselben Wert — damit eine spätere Trennung die Historie nicht migrieren muss.
  Bewusst **ohne** FK auf `mandate_profiles`: ein Auditfehler darf einen regulären
  Matching-Lauf nicht gefährden.
- Die Zugehörigkeitsprüfung sitzt in einem **ersetzbaren Haken**
  (`profileBelongsToTenant`), nicht als feste Gleichheitsannahme im Schreibpfad.
  Sobald Profile eigene Kennungen bekommen, wird dort ein Resolver eingehängt — die
  Auditstruktur selbst bleibt unverändert.
- An `matching_results` wird **keine** zweite Identität eingeführt.

### 17.2 RLS

| Rolle | Zugriff auf `matching_runs` |
|---|---|
| `anon` | **kein Grant, keine Policy** → nichts |
| `authenticated` | **nur `SELECT`**, Policy `matching_runs_tenant_read` gegen `helmut_current_tenant()` → ausschließlich eigene Läufe. Kein INSERT/UPDATE/DELETE, **kein TRUNCATE** |
| `service_role` | **umgeht RLS vollständig** (BYPASSRLS) |

Das ist **strenger** als `matching_results` (dort hat `authenticated` `ALL`) und
vermeidet den TRUNCATE-Befund **M-6** auf der neuen Tabelle von vornherein.

**Ausdrücklich:** Die Behauptung, `matching_runs` sei durch RLS geschützt, wäre
falsch. Der gesamte produktive Zugriff läuft über `service_role`. Durchsetzend sind
allein die App-Guards — `assertTenant`/`assertTenantRows` **plus** ein
verpflichtender `user_id=eq.<mandant>`-Filter in **jeder** der drei neuen
Zugriffsfunktionen. Zusätzlich lehnt die Audit-Schnittstelle eine fremde
Profilkennung mit `CROSS_TENANT_WRITE` ab, bevor irgendetwas geschrieben wird.

### 17.3 Befund M-6 (TRUNCATE-Grant) — bewusst **nicht** in dieser Migration

Sprint 23A hat belegt, dass `anon` und `authenticated` auf `matching_results` — wie
auf allen älteren V3-Tabellen — `TRUNCATE` besitzen, und zugleich, dass **keine über
das API erreichbare Lücke** besteht (PostgREST bietet kein `TRUNCATE`, der anonyme
Schlüssel ist ein JWT und kein Datenbankpasswort).

Die Revokes sind hier **nicht** enthalten. Begründung:

1. Es ist eine **Rechteänderung in Production**, also eine eigene
   Freigabeentscheidung — sie gehört nicht in eine Migration, die sonst rein additiv
   ist.
2. `listMatchingResults` läuft über `tenantRequest`, das im Tenant-JWT-Modus als
   `authenticated` liest. Ein zu breiter Revoke träfe damit einen **aktiven**
   Lesepfad. Ein Revoke ausschließlich auf `TRUNCATE` wäre sicher — aber er
   verwischt den Rollback dieser Migration.
3. Die neue Tabelle erbt den Befund nicht.

**Empfehlung: eigener kleiner Security-Sprint** über alle älteren V3-Tabellen
gemeinsam, mit eigenem Rollback. Fertige, ungeprüfte Anweisung zum Kopieren:

```sql
-- NICHT AUSFÜHREN ohne eigene Freigabe und eigenen Rollback-Plan.
revoke truncate on table public.matching_results from anon, authenticated;
```

## 18 · Deterministische Kurzbegründung

`lib/helmut/matching-begruendung.js` — reine Funktion, **0 KI, 0 Netz, 0 Zufall**.

**Priorität** (die ersten zwei vorhandenen gewinnen):
`ausschuss` → `thema` → `wahlkreis` → `partei`.

Partei steht zuletzt, weil sie 55 von 79 heutigen Merkmalstreffern stellt (§5.3) und
die Begründung sonst dominieren würde, ohne etwas Entscheidungsrelevantes zu sagen.
Ist Partei der **einzige** Beleg, wird sie genannt.

**Beispiel:** `Betrifft deinen Ausschuss Arbeit und Soziales und deinen Schwerpunkt Rente.`

**Feste Regeln:** höchstens zwei Gründe · keine Zahlen, keine Scores, kein Rang,
keine Wörter wie „Ähnlichkeit"/„Vektor"/„Matching"/„Score" · identische Signale
erzeugen exakt denselben Satz.

**Ohne Beleg: `null`, kein Satz.** Nicht „ehrliche neutrale Formulierung" — die
bestehende Produktlogik (Belegpflicht, `START_HERE.md` §5.2) verlangt einen ehrlichen
Leerzustand statt einer Ersatzformulierung, und ein Platzhaltersatz an jeder zweiten
Karte wäre Lärm ohne Aussage. Heute beträfe das **78,4 %** der Zeilen (§5.3) — das ist
der ehrliche Ausgangszustand und ein messbares Qualitätsziel für spätere Sprints.

Die Begründung wird in diesem Sprint **gespeichert, aber nicht angezeigt**. Die
sichtbare Ausspielung an der Vorgangskarte ist Sprint 23C.

## 19 · Semantik-Abgrenzung — bewiesen

| Regel | Nachweis |
|---|---|
| `knowledge_object_embeddings` wird von keinem neuen Modul gelesen | T12a/T12a2 (statisch, kommentarbereinigt) |
| Die Migration fasst die Tabelle nicht an | T12b (statisch, ohne Zeichenketten) |
| `rezept_version` ≠ Embedding-Datenvertrag | T12c: `legacy_relevance_v1` ≠ `ko-kanon-1` |
| Der 256-dim Merkmalsvektor heißt ehrlich Legacy-Vektorversion | T12d: `feature-hash-256-v1` |
| Engine-, Rezept- und Vektorversion sind drei getrennte Werte | T12e |
| Semantische Ähnlichkeit ist kein gespeichertes Relevanzsignal | T12f |
| Die Eingabehashes beider Rezepte sind eigenständig | T12g |

**Sprint 22C2 bleibt ein eigener, freigabepflichtiger Sprint.** `HELMUT_SCORING_MODE`
ist in diesem Sprint nicht angefasst (T18h).

## 20 · Kosten und Datenmenge — gemessen, nicht geschätzt

Gemessen an production-nahen Kennungslängen (Muster aus §5) mit 20 verschiedenen
Einträgen und der real gemessenen Belegquote von 21,6 % (§5.3):

| Größe | Wert |
|---|---|
| Ranglisteneintrag mit Beleg (Signale + Begründung) | **471 B** |
| Ranglisteneintrag ohne Beleg | **345 B** |
| Rangliste (20 Einträge), roh | **7 148 B** |
| Rangliste, pglz-nahe Kompression | **1 617 B** (Faktor 4,4) |
| Laufkopf ohne Rangliste | **922 B** |
| **Laufzeile gesamt** | **8 070 B roh / ~2 539 B komprimiert** |
| Zusatz je `matching_results`-Zeile | **713 B** (heute 685 B → künftig ~1,4 kB) |

| Szenario | Laufzeilen | Speicher/Jahr |
|---|---|---|
| **10 Profile** (~3 veränderte Läufe/Tag/Profil) | 30/Tag ≈ 10 950/Jahr | **88 MB roh / ~28 MB komprimiert** |
| **100 Profile** | 300/Tag ≈ 109 500/Jahr | **884 MB roh / ~278 MB komprimiert** |

**Korrektur zu Sprint 23A §10.5:** dort waren ~1,5–2,0 kB je Laufzeile geschätzt.
Real sind es ~2,5 kB komprimiert bzw. 8,1 kB roh, weil die umgesetzte Rangliste mehr
Auditfelder trägt als die Skizze (`result_id`, `ko_eingabe_hash`, `signale`,
`begruendung`). Die Größenordnung bei 10 Profilen (28 statt 20 MB/Jahr) bleibt
unkritisch; bei 100 Profilen bestätigt sich die Retention-Empfehlung deutlicher als
gedacht.

| Frage | Antwort |
|---|---|
| Schreibvorgänge bei **verändertem** Lauf | 1 INSERT + 1 Bulk-Upsert (wie heute) + 1 PATCH (Ablösung) + 1 PATCH (Abschluss) |
| Schreibvorgänge bei **identischem** Lauf | **1 UPDATE**, sonst nichts. Heute: 20 UPDATEs — die Last **sinkt** |
| Indexkosten | 2 neue Indizes auf `matching_runs` (klein), 1 Teilindex, 2 auf `matching_results` (287 Zeilen) |
| Auswirkung auf Supabase | DB heute 64 MB, Free-Tier-Grenze 500 MB → bei 7–10 Profilen unkritisch |
| Volltexte / Vektoren je Ergebnis | **keine** |
| **Zusätzliche KI-Kosten** | **0,00 USD** — kein einziger neuer Modellaufruf |
| Retention | **noch nicht** eingeführt. Nötig ab ~100 Profilen; dann eigener freigabepflichtiger Schritt (Vorschlag: 90 Tage vollständig, danach Kopf ohne `ergebnis`) |

## 21 · Production: Reihenfolge, Verifikation, Rollback

> **STOPPPUNKT.** Bis hierher ist **nichts** in Production geschehen: keine
> Migration angewendet, kein Datensatz geschrieben, kein Flag gesetzt, keine
> Vercel-Variable, kein Cron. Alles Folgende passiert **erst nach ausdrücklicher
> Freigabe** und Schritt für Schritt.

### 21.1 Vorabprüfung (rein lesend, muss VOR der Migration laufen)

```sql
-- (1) MUSS 0 Zeilen liefern — sonst schlägt der eindeutige Index fehl (fail-closed).
select user_id, knowledge_object_id, count(*)
  from public.matching_results group by 1,2 having count(*) > 1;

-- (2) Bestandsgrößen für den Vorher/Nachher-Vergleich.
select count(*) as ergebnisse,
       count(*) filter (where user_id is null)            as ohne_mandant,
       count(*) filter (where knowledge_object_id is null) as ohne_vorgang,
       max(created_at)                                     as juengste
  from public.matching_results;

-- (3) Die neuen Objekte dürfen noch nicht existieren.
select count(*) from information_schema.tables
 where table_schema='public' and table_name='matching_runs';   -- erwartet 0
```

### 21.2 Reihenfolge

| # | Schritt | Freigabe | Rückweg |
|---|---|---|---|
| 1 | **PR #169** prüfen und mergen (Merge = Deployment) | Betreiber | `git revert` / Instant Rollback |
| 2 | Vorabprüfung §21.1 ausführen | — (nur lesend) | — |
| 3 | Migration `20260728_matching_audit.sql` anwenden | **eigene Freigabe** | `20260728_matching_audit_rollback.sql` |
| 4 | Verifikation §21.3 ausführen | — (nur lesend) | — |
| 5 | `HELMUT_MATCHING_AUDIT` setzen (Vercel-Env) | **eigene Freigabe** | Variable entziehen |
| 6 | Einen reellen Lauf beobachten, dann Idempotenz-Zweitlauf gegenmessen | — | Variable entziehen |

**Schritt 5 vor Schritt 3 ist verboten** — ohne die Migration schlagen die
Audit-Schreibvorgänge fehl und brechen den Lauf ab (Fehlerpolitik §16.5).

### 21.3 Verifikation nach der Migration (rein lesend)

```sql
-- Struktur: erwartet 1 / 14 / 23
select count(*) from information_schema.tables
 where table_schema='public' and table_name='matching_runs';
select count(*) from information_schema.columns
 where table_schema='public' and table_name='matching_results'
   and column_name in ('run_id','profil_hash','ko_eingabe_hash','ko_version',
     'engine_version','rezept_version','vektor_version','eingabe_fingerabdruck',
     'berechnet_am','aktuell','abgeloest_am','signale','begruendung','updated_at');
select count(*) from information_schema.columns
 where table_schema='public' and table_name='matching_results';

-- Zugriffsschutz: RLS an, genau 1 Policy, Grants nur SELECT für authenticated
select relrowsecurity from pg_class where relname='matching_runs';
select policyname, cmd, roles from pg_policies where tablename='matching_runs';
select grantee, privilege_type from information_schema.role_table_grants
 where table_name='matching_runs' order by 1,2;

-- Indizes und Trigger: erwartet 4 Indizes (inkl. PK) und 1 Trigger
select indexname from pg_indexes where tablename='matching_runs' order by 1;
select tgname from pg_trigger where tgrelid='public.matching_runs'::regclass and not tgisinternal;

-- Bestand unverändert: dieselben Zahlen wie in §21.1 (2), aktuell überall true
select count(*) as ergebnisse, count(*) filter (where aktuell) as aktuell,
       count(*) filter (where run_id is not null) as mit_lauf   -- erwartet 0
  from public.matching_results;
```

### 21.4 Nach der Aktivierung gegenmessen

```sql
-- Ein Lauf muss genau eine vollständige Zeile erzeugt haben.
select id, user_id, status, kandidaten, berechnet, veroeffentlicht, abgeloest,
       wiederholungen, jsonb_array_length(ergebnis) as rangliste
  from public.matching_runs order by gestartet_am desc limit 5;

-- Idempotenz: nach einem zweiten Lauf mit identischem Eingang MUSS
-- wiederholungen steigen, ohne dass eine neue Zeile entsteht.
select count(*) as laeufe, sum(wiederholungen) as wiederholungen
  from public.matching_runs where user_id = '<mandant>';

-- HARTE INVARIANTE (erwartet 0 Zeilen): keine Ergebniszeile darf auf einen
-- laufenden oder fehlgeschlagenen Lauf verweisen.
select m.id, m.run_id, r.status
  from public.matching_results m
  join public.matching_runs r on r.id = m.run_id
 where r.status <> 'vollstaendig';

-- NICHT als Fehler werten: ein aelterer vollstaendiger Lauf ohne verbleibende
-- Ergebniszeilen. Das ist der normale Generationswechsel — seine Historie steht
-- in matching_runs.ergebnis. (Die frueher hier stehende Umkehrung war falsch.)
```

### 21.5 Rollback

| Situation | Rückweg | Datenverlust |
|---|---|---|
| Nach dem Merge, vor der Migration | `git revert` oder Instant Rollback | keiner |
| Nach der Migration, vor der Aktivierung | Struktur kann **stehen bleiben** (niemand liest oder schreibt sie), oder `20260728_matching_audit_rollback.sql` | keiner |
| Nach der Aktivierung, Problem im Betrieb | **Zuerst `HELMUT_MATCHING_AUDIT` entziehen.** Das allein ist ein vollständiger funktionaler Rückweg: der Lauf verhält sich sofort wieder wie vorher | keiner |
| Struktur muss weg | Flag entziehen, **dann** Rollback-SQL | `matching_runs` und die Werte der 14 additiven Spalten gehen verloren. **Die operative Projektion bleibt vollständig unberührt** |

Sicherung vor einem Struktur-Rollback:
`\copy (select * from public.matching_runs) to 'matching_runs.csv' csv header`

## 22 · Was dieser Sprint bewusst NICHT enthält

| Nicht enthalten | Wohin es gehört |
|---|---|
| Briefing-Historisierung (`auswahl`/`matchingRunId` im Payload, `briefing_versionen`) | **Sprint 23B-2** |
| Sichtbare Nutzererklärung an der Vorgangskarte | **Sprint 23C** |
| Produktnutzung semantischer Embeddings | **Sprint 22C2** (eigene Freigabe) |
| Scharfschalten von `HELMUT_SCORING_MODE` | **OP-22** |
| Behebung von **M-7** (200er-Ladefenster → leere `matched_features`) | eigener Sprint — verändert das fachliche Ergebnis |
| Revoke der `TRUNCATE`-Rechte (**M-6**) | eigener Security-Sprint (§17.3) |
| NOT-NULL-Verschärfung auf `matching_results` | nach einem Production-Beweis (§14.3) |
| Retention für `matching_runs` | ab ~100 Profilen (§20) |
| Automatische Duplikaterkennung | ausdrücklich ausgeschlossen |

## 23 · Testnachweis

| Suite | Ergebnis |
|---|---|
| `scripts/matching-audit-test.js` (**neu**, T1–T18 + **A1–A8 Atomizität**) | **178/178** |
| Offline-Suite `run-offline-tests.js` | **177/177** in 58 s |
| Gegenbeweis auf unverändertem `origin/main` (`53893fa`, eigener Worktree) | **176/176** |
| Legacy-Gegenbeweis Branch ↔ `main` (Merkmalsvektoren, Kosinuswerte, Ranking, `matched_features`, geschriebene Zeilen, Rückgabewert über 60 Wissensobjekte, 4 Grenzwerte, 4 Filterkombinationen) | **253 identisch, 0 abweichend** |
| Browser-Smoke | lokal **nicht nötig** (keine UI-Änderung); im CI-Gate dennoch grün |
| CI-Gate (PR #169) | **beide Pflicht-Checks grün** — `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`, Lauf `30392456786` auf dem Korrekturstand `69d8eda` |
| **Migration in isolierter PostgreSQL angewendet** (§23.1) | leere Struktur ✅ · Wiederholung ✅ · Bestand mit 246 Zeilen **byte-identisch** ✅ · 11 Constraint-/Trigger-Prüfungen ✅ · 9 RLS-Rollenprüfungen ✅ · Duplikat → fail-closed ohne Halbzustand ✅ · Rollback vollständig ✅ |
| CI-Gate (PR #169) | **beide Pflicht-Checks grün** — `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`; zuletzt Lauf `30389914420` auf dem Codestand `3ff2f18`, davor Lauf `30389260233` |

Zwei sprintbedingte Testpflege-Änderungen, beide dokumentiert:

- `scripts/geografie-gedaechtnis-test.js` D7: die geografiefreie Migration
  `20260728_matching_audit*` wird — wie zuvor die Embedding-Shadow-Migration —
  **namentlich** vom Datumsriegel ausgenommen.
- `docs/betrieb/env-inventar.md`: `HELMUT_MATCHING_AUDIT` ergänzt (der
  Inventar-Test erzwingt die Dokumentation jeder produktiven Variablen).

### 23.1 Migration in einer isolierten Testdatenbank ausgeführt

Nicht nur statisch geprüft, sondern **wirklich angewendet** — lokale PostgreSQL
16.13, drei Wegwerf-Datenbanken, kein Production-Kontakt (Production ist PG 17.6;
die Migration nutzt keine versionsabhängigen Konstrukte).

**Leere Struktur:**

| Prüfung | Ergebnis |
|---|---|
| Migration läuft durch | ✅ |
| Publish-Funktion und Riegel angelegt | ✅ (`helmut_publish_matching_run`, `matching_results_run_complete`) |
| **Zweiter Lauf derselben Migration** läuft ebenfalls durch | ✅ (alle Objekte `if not exists`) |
| Struktur | `matching_runs` **1** · neue Spalten **14** · Gesamtspalten `matching_results` **23** (9 + 14) |
| RLS | aktiv, **genau eine** Policy: `matching_runs_tenant_read`, `SELECT`, `{authenticated}` |
| Grants | `authenticated: SELECT` — sonst nichts. `anon` **gar nicht** vorhanden |
| Indizes | `matching_runs`: PK, `_user_idx`, `_fingerprint_uidx`, `_offen_idx` · `matching_results`: + `_tenant_ko_uidx`, `_run_idx` |
| Trigger | `matching_runs_immutable` |
| `SECURITY DEFINER`-Funktionen | **0** — alle drei neuen Funktionen sind `SECURITY INVOKER` |

**Verhalten gegen echte Constraints** (11 Prüfungen, alle wie entworfen):

| # | Prüfung | Ergebnis |
|---|---|---|
| B1 | `laufend` → `vollstaendig` | erlaubt |
| B2 | `ergebnis` eines abgeschlossenen Laufs ändern | **abgelehnt** (Trigger) |
| B3 | Status weg von `vollstaendig` | **abgelehnt** (Trigger) |
| B4 | `wiederholungen`/`letzter_lauf_at`/`wiederaufnahme_am`/`fehler` fortschreiben | erlaubt |
| B5 | zweiter **vollständiger** Lauf mit gleichem Fingerabdruck | **abgelehnt** (`matching_runs_fingerprint_uidx`) |
| B6 | **laufender** Lauf mit gleichem Fingerabdruck | erlaubt — ein Absturz blockiert keine Wiederholung |
| B7 | Status `partial` einfügen | **abgelehnt** (Check-Constraint) |
| B8 | `vollstaendig` ohne `beendet_am` | **abgelehnt** (`matching_runs_abschluss_ck`) |
| B9 | zweite Zeile für dasselbe (Mandant, Wissensobjekt) | **abgelehnt** (`matching_results_tenant_ko_uidx`) |
| B10 | Ablösung | Zeile bleibt vollständig erhalten, nur `aktuell=false` + `abgeloest_am` |
| B11 | DSGVO: Mandant löschen | Laufhistorie kaskadiert mit |

**Mandantentrennung mit echten Rollen** (`set local role`, Claim über
`helmut_current_tenant()`):

| # | Prüfung | Ergebnis |
|---|---|---|
| R1 | `authenticated`, Claim Mandant A | sieht **nur** den eigenen Lauf |
| R2 | `authenticated`, Claim Mandant B (Kreuzprobe) | sieht **nur** den eigenen Lauf |
| R3 | `authenticated` **ohne** Claim | sieht **nichts** |
| R4 | `authenticated` schreibt einen eigenen Lauf | **permission denied** |
| R5 | `authenticated` schreibt einen **fremden** Lauf | **permission denied** |
| R6 | `authenticated` `TRUNCATE` | **permission denied** |
| R7 | `authenticated` `UPDATE`/`DELETE` | **permission denied** |
| R8 | `anon` liest | **permission denied** |
| R9 | Eigner (BYPASSRLS-Analogie zu `service_role`) | sieht **alles** — genau das, was §17.2 ehrlich benennt |

**Bestehende Struktur mit Daten** (246 Ergebniszeilen über 7 Mandanten):

| Prüfung | Ergebnis |
|---|---|
| Fingerabdruck über `id`+`similarity`+`rank`+`matched_features`+`created_at` **vor** der Migration | `246 \| 6feaa1b1…` |
| … **nach** der Migration | `246 \| 6feaa1b1…` — **byte-identisch** |
| Alle 14 neuen Spalten leer | **246 von 246** (ehrlich: „vor der Auditpersistenz berechnet") |
| `aktuell` | **246 von 246** auf `true` (Default) |

**Fail-closed bei einem Duplikat:** eine Testdatenbank mit einem echten
`(user_id, knowledge_object_id)`-Duplikat lässt die Migration mit
`could not create unique index` scheitern — und weil alles in **einer**
Transaktion liegt, bleibt danach **`matching_runs` = 0 Tabellen, `run_id` = 0
Spalten**. Es entsteht kein Halbzustand. Genau deshalb steht die Vorabprüfung
in §21.1.

**Atomizität gegen die echte Datenbank** (eigene Testdatenbank, alle Abbrüche
real erzwungen — nicht simuliert):

| # | Prüfung | Ergebnis |
|---|---|---|
| P1 | erfolgreiche Veröffentlichung | Lauf `vollstaendig`, 2 Zeilen, `veroeffentlicht=2` — konsistent in einem Aufruf |
| P2 | Ergebniszeile auf einen **laufenden** Lauf schreiben | **abgelehnt**: „zeigt auf einen Lauf im Zustand laufend" |
| P3 | **Abbruch MITTEN in der Veröffentlichung** (FK-Verletzung bei der zweiten Zeile) | Projektion **vorher wie nachher identisch** (`ko-1` weiterhin `0.4200`, `run_id` weiterhin der alte Lauf); der neue Lauf blieb `laufend` — **nicht** `vollstaendig` |
| P4 | fremder Mandant · fremde Zeile im Stapel · fremde Laufkennung · bereits vollständiger Lauf | **alle vier abgelehnt**, Bestand unverändert |
| P5 | Ablösung | alte Zeile **bleibt erhalten** mit `aktuell=false` + `abgeloest_am`, neue Zeile aktuell |
| P6 | **zwei gleichzeitige Veröffentlichungen** desselben Mandanten (zwei Prozesse) | vom Advisory-Lock serialisiert, beide sauber `vollstaendig`, kein Widerspruch |
| P7 | **Invariante** über den Endzustand | **0 Verletzungen** — keine Ergebniszeile verweist auf einen unvollständigen Lauf |
| P8 | Legacy-Pfad (ohne `run_id`) | unverändert schreibbar, `run_id` NULL, Riegel greift nicht |

**Mutationstest der Suite** (Gegenprobe, dass die neuen Tests wirklich greifen):
wird im In-Memory-Doppel der Datenbank das Transaktions-Rollback der Projektion
entfernt — also exakt das alte, nicht-atomare Design nachgebaut —, schlagen
**10** Prüfungen fehl, darunter „KEINE Ergebniszeile verweist auf einen
laufenden oder fehlgeschlagenen Lauf" mit dem konkreten Gegenbeispiel. Mit der
Korrektur sind es **0**. Die A-Gruppe ist damit nachweislich wirksam und nicht
bloß grün.

**Rollback:** auf der Bestands-DB ausgeführt → `matching_runs` weg, Spalten
**23 → 9**, alle **drei** neuen Funktionen weg, beide neuen Trigger weg, nur die
drei ursprünglichen `matching_results`-Indizes übrig, Datenfingerabdruck
**unverändert `246 | 6feaa1b1…`**. Danach ließ sich die Migration **erneut**
anwenden, ohne dass sich der Datenbestand veränderte. In der Atomizitäts-Datenbank
zusätzlich gegengemessen: nach dem Rollback **0 Tabellen / 9 Spalten / 0 Funktionen
/ 0 Trigger**, und die Legacy-Zeile (ohne `run_id`) überlebt unverändert.

## 24 · Geänderte und neue Dateien

**Neu:** `supabase/migrations/20260728_matching_audit.sql` ·
`supabase/migrations/20260728_matching_audit_rollback.sql` ·
`lib/helmut/matching-contract.js` · `lib/helmut/matching-audit.js` ·
`lib/helmut/matching-begruendung.js` · `scripts/matching-audit-test.js`

**Geändert:** `lib/helmut/matching.js` (Auditpfad hinter der Rollout-Grenze) ·
`lib/helmut/storage.js` (Flag, drei Zugriffsfunktionen, additive Spalten im
Ergebnis-Upsert, DSGVO-Liste) · `lib/helmut/scheduler.js` (nur Herkunftsangaben
durchgereicht) · `scripts/geografie-gedaechtnis-test.js` (D7-Ausnahme) ·
`docs/betrieb/env-inventar.md` · dieses Dokument · `docs/CURRENT_STATE.md` ·
`docs/ARCHITECTURE.md` · `docs/roadmap/phase_1_checkliste.md`
