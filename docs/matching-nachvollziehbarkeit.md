# Matching-Nachvollziehbarkeit (Roadmap-Punkt 23)

**Kanonische Quelle** für den Ist-Zustand des produktiven Matchings, die
Architekturentscheidung für Sprint 23B und die geplante Nutzererklärung (23C).

**Stand:** 2026-07-29 · **Teil A** = Sprint 23A (Bestandsaufnahme) · **Teil B** =
Sprint 23B-1 (umgesetzte Auditpersistenz, Migration **angewendet**, Rollout-Grenze
`HELMUT_MATCHING_AUDIT` **AN in Production**, Erstlauf und Idempotenz **bewiesen**)
**Basis:** Teil A `main` = `51a533d` (Merge PR #166), Production read-only vermessen
am 2026-07-28, ca. 17:00–17:30 UTC · Teil B `main` = `5c254c4` (Merge PR #170)

> **Aufbau:** §1–§13 sind der belegte **Ist-Zustand** aus Sprint 23A und bleiben
> unverändert. §14–§24 (Teil B) beschreiben die in Sprint 23B-1 gebaute Lösung,
> die Production-Reihenfolge und den Rückweg. **§25 ist der Production-Beweislauf**
> (Aktivierung, erster Auditlauf, Idempotenznachweis) und schließt Sprint 23B-1 ab.
> Wo Teil B von der Empfehlung aus §10 abweicht, ist das dort ausdrücklich benannt
> und begründet.

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

**Stand:** 2026-07-28 · Sprint 23B-1 (Umsetzung, nachgeschärft, **PR gemergt, Migration in Production
angewendet**) · Basis `main` = `b1d450c` (Merge PR #169)
**Zustand:** implementiert, offline und gegen eine echte PostgreSQL bewiesen. **Migration am
2026-07-28, 20:20:57 UTC in Production angewendet und vollständig verifiziert** (§21.6). Rollout-Grenze
`HELMUT_MATCHING_AUDIT` existiert weiterhin nicht in Vercel — **die Auditpersistenz ist noch nicht
aktiv**. Sprint bleibt teilweise abgeschlossen bis zur getrennten Flag-Freigabe.

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

### 21.6 Ausgeführt — Production-Nachweis (2026-07-28)

**Schritt 1 (Merge) und Schritt 3 (Migration) aus §21.2 sind ausgeführt. Schritt 5 (Flag) ist
es ausdrücklich nicht.**

**PR #169 gemergt** — Merge-Commit `b1d450c`, `main`-HEAD seither auf diesem Stand.

**Migration angewendet:** `supabase/migrations/20260728_matching_audit.sql`, ausschließlich
diese eine Datei, am **2026-07-28, 20:20:57 UTC**. Erst nach bestätigtem Ruhefenster: ein erster
Anlauf um 20:09 UTC wurde verworfen, weil die Sperren `crawl-cem-ince` (bis 20:19:29 UTC) und
`global-understanding` (bis 20:16:08 UTC) aus dem laufenden 20:00-UTC-Cron noch aktiv waren.
Erneute Prüfung um 20:19:30 UTC: 0 aktive Pipeline-Sperren, 0 laufende Fremdprozesse, 0 Sperren
auf `matching_results`.

**Vorher/Nachher — byte-genau:**

| Größe | Vorher | Nachher |
|---|---|---|
| Zeilen `matching_results` | 287 | **287** — unverändert |
| Fingerabdruck | `be4670c61235c908559853a6f6fc6c8c` | **`be4670c61235c908559853a6f6fc6c8c`** — identisch |
| Spalten `matching_results` | 9 | **23** (+14 additiv, kein Backfill) |
| `matching_runs` | existiert nicht | existiert, **0 Zeilen** |

**Verifikation §21.3, alle 18 Prüfungen wie erwartet:**

| # | Prüfung | Ist |
|---|---|---|
| a | `matching_runs` existiert | 1 |
| b | 14 neue Spalten auf `matching_results` | 14 |
| c | Spalten `matching_results` gesamt | 23 |
| d | RLS auf `matching_runs` aktiv | `true` |
| e | genau eine passende SELECT-Policy für `authenticated` | `matching_runs_tenant_read [SELECT] authenticated` |
| f | `anon` besitzt Zugriff | **keinen** |
| g | `authenticated` besitzt Zugriff | **ausschließlich `SELECT`** |
| h | `service_role` besitzt die benötigten Rechte | ja — volle Rechte über die Supabase-Default-Privilegien, empirisch bestätigt |
| i | `helmut_publish_matching_run` ausführbar durch | **ausschließlich `postgres` und `service_role`** |
| j | SECURITY-Modus der drei neuen Funktionen | **alle `SECURITY INVOKER`** |
| k | Indizes | `matching_runs`: 4 (PK, `fingerprint_uidx`, `offen_idx`, `user_idx`) · `matching_results`: 5 (+2 neue) |
| l | Trigger | `matching_results`: `helmut_ensure_profile_trg` (Bestand) + `matching_results_run_complete` (neu) · `matching_runs`: `matching_runs_immutable` |
| m | die 287 bestehenden Zeilen | unverändert |
| n | alle bestehenden Ergebnisse `aktuell=true` | 287 von 287 |
| o | alle bestehenden Ergebnisse `run_id=NULL` | 287 von 287 |
| p | Referenzfingerabdruck | weiterhin exakt `be4670c61235c908559853a6f6fc6c8c` |
| q | Ergebniszeilen mit `run_id` auf unvollständigem Lauf | **0** |
| r | Zeilen in `matching_runs` | **0** |

**Production-Fehler:** keine. Die Postgres-Logs im Migrationsfenster (20:19–20:23 UTC) zeigen
4 Einträge, alle `LOG` — kein `ERROR`/`WARNING`/`FATAL`. Der Security-Advisor meldet nach der
Migration dieselben 19 Bestandsbefunde wie vorher (18× RLS-ohne-Policy auf Alttabellen, 1×
`vector`-Extension im `public`-Schema) — `matching_runs` erzeugt **keinen** neuen Befund.

**Unverändert gegengemessen:** `knowledge_object_embeddings` 772 · `briefings` 71 ·
`profile_embeddings` 7 (gegenüber der Vorprüfung planmäßig gewachsen durch den regulären Betrieb:
`decisions` und `knowledge_objects`, nicht durch die Migration).

**Rollback:** nicht ausgeführt, **nicht notwendig** — alle Verifikationen bestanden.

**Flag-Zustand danach:** `HELMUT_MATCHING_AUDIT` existiert **weiterhin nicht** in Vercel (vom
Betreiber bestätigt) und wurde in diesem Schritt **nicht** gesetzt. Die Auditpersistenz ist damit
**weiterhin nicht aktiv** — `matching_runs` bleibt bei 0 Zeilen, bis die getrennte Flag-Freigabe
(Schritt 5 aus §21.2) erteilt und ein kontrollierter Production-Beweislauf gefahren wird.

**Sprintstatus bleibt teilweise abgeschlossen.** Roadmap-Punkt 23 bleibt offen/in Arbeit — die
Abnahme verlangt zusätzlich die Flag-Aktivierung und den Idempotenz-Beweis in Production.
Briefing-Historisierung bleibt Sprint 23B-2, die sichtbare Erklärung bleibt Sprint 23C, Befund
M-7 (200er-Ladefenster, §15.2) bleibt unverändert außerhalb dieses Sprints.

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

---

## 25 · Production-Beweislauf: Aktivierung, Erstlauf, Idempotenz

Dieser Abschnitt schließt Sprint 23B-1 ab. §21.6 belegt die **Migration**, §25 belegt
die **Inbetriebnahme**. Alles hier Beschriebene ist an Production gemessen, nicht
geschätzt. Die Reihenfolge folgt den drei getrennt erteilten Freigaben.

### 25.1 Gate 3 — die Aktivierung

**Wert.** `matchingAuditEnabled()` (`storage.js:2355`) liest **direkt** `process.env`:

```js
function matchingAuditEnabled() {
  return isFlagOn(process.env.HELMUT_MATCHING_AUDIT) && v3StoreReady();
}
function isFlagOn(value) {                                    // storage.js:785
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}
```

Aktivierend sind also `1`, `true`, `on`, `yes` (Groß-/Kleinschreibung egal, Rand-
leerzeichen werden entfernt). Gesetzt wurde die Hausschreibweise **`on`**.
`helmut-flags.json` ist **nicht** beteiligt: `HELMUT_MATCHING_AUDIT` steht nicht in
`FILE_FLAG_ALLOWLIST` (`flags.js:31`), und `flags.js` schreibt nie nach `process.env`.
Die Vercel-Variable ist der einzige Hebel.

**Ausführung.** Am **2026-07-28, ~20:55 UTC** in Vercel **ausschließlich für die
Umgebung Production** gesetzt; Preview und Development bleiben aus. Wirksam wurde sie
mit dem Redeploy `dpl_ChLoTuKztU1B835PfckELKp8doMZ` (Commit `5c254c4`, Redeploy von
`dpl_7kag3HkqK61KTRAu2y9jBUFhxBo1`), `READY` **20:56:48 UTC**, ohne Build-Fehler. Eine
Vercel-Env-Änderung wirkt **erst nach einem Redeploy** — das ist zugleich der Rückweg.

**Prüfungen unmittelbar nach dem Redeploy — alle sieben grün:** Deployment `READY` ·
Basis `5c254c4` (enthält PR #169 und #170) · keine Build-Fehler · keine neuen
Runtime-Fehler · `matching_runs` **0 Zeilen** · `matching_results` **287 Zeilen** ·
**0** Zeilen auf einem unvollständigen Lauf. Zusätzlich: Fingerabdruck
`be4670c61235c908559853a6f6fc6c8c` unverändert, `knowledge_object_embeddings` 772,
0 Sperren, 0 laufende Prozesse.

**Eine ehrliche Grenze:** Vercel-Umgebungsvariablen sind aus einer Cloud-Sitzung nicht
lesbar. Dass das Flag gesetzt und wirksam ist, ist **nicht** an der Variablen belegt,
sondern an ihrer **Wirkung** — der ersten Zeile in `matching_runs`. Bis zum ersten Lauf
war die Aktivierung unbewiesen, und genau so wurde sie auch berichtet.

### 25.2 Der erste Production-Auditlauf

Ausgelöst vom **regulären** `/api/cron/crawl` um 04:01:08 UTC — **kein manueller Lauf**.

| Größe | Wert |
|---|---|
| Lauf-ID | `mrun-annika-klose-20260729040507-32c822e0` |
| Mandant | `annika-klose` |
| Zeitraum | 2026-07-29, **04:05:07 → 04:05:08 UTC** (**1 041 ms**) |
| Auslöser / Herkunft | `crawl` · `pipeline_run_id = crawl-20260729040110-0zay2` |
| Status | **`vollstaendig`**, `beendet_am` gesetzt, `fehler = NULL` |
| Versionsachsen | `legacy-shadow-1` / `legacy_relevance_v1` / `feature-hash-256-v1` |
| Zähler | `kandidaten` = `berechnet` = `veroeffentlicht` = **20**, `abgeloest` = **19** |
| Schwellenwerte | `{"filter": {}, "schwelle": null, "match_count": 20}` |
| `ergebnis` | 20 Einträge |

**Wirkung auf die Projektion.** `matching_results` **287 → 290**. Für `annika-klose`:
36 → 39 Zeilen = **17 wiederverwendet** (in place aktualisiert) + **3 neu** +
**19 abgelöst**. Abgelöst heißt `aktuell = false` mit gesetztem `abgeloest_am` —
**gelöscht wurde nichts**. Die 251 Zeilen der übrigen sechs Mandanten sind
**vollständig unberührt**: 0 mit `updated_at`, 0 mit `berechnet_am`, 0 mit
`aktuell = false`.

**Invarianten nach dem Lauf — alle acht wie zugesichert:**

| Invariante | Ist |
|---|---|
| Läufe gesamt / vollständig / `laufend` / `fehlgeschlagen` | 1 / 1 / **0** / **0** |
| Vollständige Läufe ohne `beendet_am` | **0** |
| Ergebniszeilen mit `run_id` auf nicht vollständigem Lauf | **0** |
| Abgelöste Zeilen ohne `abgeloest_am` | **0** |
| Aktive Matching-Sperren nach Prozessende | **0** |
| Aktuelle Zeilen, die auf den Lauf zeigen | **20/20** |
| Lauf-`ergebnis` deckungsgleich mit der Projektion (`result_id`+`rank`+`similarity`) | **20/20** |
| Gesamtzahl `matching_results` gesunken | **nein** (287 → 290) |

**Legacy-Stabilität.** Ränge lückenlos **1–20** · alle Kennungen weiter im Altschema
`mr-annika-klose-*` · `similarity` und `matched_features` bei 20/20 gesetzt ·
`created_at` der 17 wiederverwendeten Zeilen liegt weiterhin **vor** dem Lauf (friert
ein wie im Altverhalten, §5) · Fingerabdruck der 270 unberührten Zeilen:
**`7837ae7f3dbceba9f5e6e30e8586adb9`** (neuer Referenzwert). `begruendung` ist bei
**3 von 20** Zeilen gefüllt, `signale` bei **20 von 20** — genau die Belegpflicht aus
§18: ohne Beleg kein Satz.

### 25.3 Der Idempotenznachweis

**2026-07-29, 08:07:20 UTC.** Ein regulärer zweiter Lauf für denselben Mandanten
(`/api/cron/pipeline`, Crawl 08:03:23 UTC, eager-understanding 08:05:38–08:07:19) traf
auf einen **identischen Eingabefingerabdruck**:

```
d396c545431210e1cef4ebb8e12c4d7ad4ec75a8103e289ce38fb13b62bcc8ac
```

| Erwartung | Ist |
|---|---|
| Keine neue Zeile in `matching_runs` | ✅ weiterhin **1** Zeile |
| Derselbe vollständige Lauf wird wiederverwendet | ✅ `mrun-annika-klose-20260729040507-32c822e0` |
| `wiederholungen` erhöht sich um exakt 1 | ✅ **0 → 1** |
| `letzter_lauf_at` wird aktualisiert | ✅ **08:07:20 UTC** |
| Keine neue Ergebniszeile, keine Löschung | ✅ 290 → **290**, annika 39 → **39** |
| `run_id`, Rang, `similarity`, `matched_features`, `aktuell` unverändert | ✅ |
| `updated_at` unverändert | ✅ bleibt **04:05:08** |
| 0 Ergebniszeilen auf unvollständigem Lauf | ✅ |
| 0 zusätzliche KI-Aufrufe, Token, Kosten | ✅ |

Damit ist die in §15 versprochene Idempotenz **in Production** belegt: ein identischer
Lauf kostet **ein UPDATE statt 20 Ergebniszeilen**.

**Der aussagekräftigste Teil des Nachweises:** zwischen beiden Läufen entstanden
**179 neue Wissensobjekte** (1 523 → 1 702). Der Fingerabdruck blieb trotzdem gleich,
weil keines davon die Kandidatenmenge dieses Mandanten veränderte. Der Fingerabdruck
reagiert also auf **fachliche Änderung**, nicht auf Bestandswachstum — genau die
Eigenschaft, die §15.3 fordert. Ein Fingerabdruck, der bei jedem neuen Objekt kippt,
hätte die Idempotenz nutzlos gemacht.

**Warum kein manueller Zweitlauf.** Der Nachweis wurde an einem **regulären** Lauf
beobachtet, nicht erzwungen. Grund ist Befund **M-9** (§25.5): es gibt keinen
produktiv verwendeten Einstieg, um Matching für genau einen Mandanten isoliert
auszuführen. Jeder manuelle Versuch hätte neuen Code gebraucht — und wäre damit kein
Nachweis am Produktivpfad gewesen.

### 25.4 Fehler und Kosten

**Fehler: keine.** Postgres-Logs seit der Aktivierung: 38 Einträge im Fenster, davon
**1 `ERROR`** — `column "purpose" does not exist`, eine fehlerhafte Prüfabfrage aus der
Beweissitzung selbst, kein Anwendungsfehler. **Kein** Fehler zu `matching_runs`,
`matching_results` oder `helmut_publish_matching_run`. Vercel-Runtime-Fehler: **0** in
24 Stunden. *Grenze: die Log-Schnittstelle liefert maximal 100 Einträge; das Fenster
seit der Aktivierung ist damit vollständig abgedeckt, ältere Zeiträume nicht.*

**Kosten: 0,00 USD.** `llm_usage` weist im Fenster 04:00–04:05 **0 Aufrufe, 0 Token,
0 USD** aus — identisch zum Vergleichsfenster des Vortags **vor** der Aktivierung, und
0 Aufrufe im Auditfenster selbst. Strukturell erwartbar: `matching-audit.js`,
`matching-contract.js` und `matching-begruendung.js` rufen kein Modell auf (§18, §19).
`knowledge_object_embeddings` unverändert bei **772** — die semantischen Embeddings
sind am produktiven Matching weiterhin **nicht** beteiligt.

### 25.5 Zwei neue Befunde

Beide stammen aus dem Beweislauf, gehören **nicht** zum Sprintumfang und verändern
nichts am fachlichen Matching.

**M-8 · Der Crawl deckelt die Auditabdeckung.** Der Crawl-Cron endet reproduzierbar in
seinem Zeitlimit:

```
29.07. 04:00 UTC  [cron/crawl]    280002ms tenants=undefined bounded=true
28.07. 20:00 UTC  [cron/crawl]    280001ms tenants=undefined bounded=true
28.07. 04:00 UTC  [cron/crawl]    280001ms tenants=undefined bounded=true
```

Die beiden 28.07.-Läufe liegen **vor** der Flag-Aktivierung — das Zeitlimit ist also
**kein Effekt der Auditpersistenz**, sondern Bestandsverhalten. Folge: ein Lauf
erreicht nur einen Teil der Mandanten, und die Auditabdeckung hängt daran. Im
Erstlauf wurde `annika-klose` vollständig verarbeitet; `cem-ince` wurde als nächster
begonnen, erreichte die Matching-Stufe aber nicht mehr — belegt über
`profile_embeddings`, weil `saveProfileEmbedding` der **erste** Schritt von
`runMatchingCore` ist (`matching.js:445`) und dort für `cem-ince` weiterhin der
28.07. steht. Genau so soll es aussehen: ein Mandant, der die Stufe nicht erreicht,
hinterlässt **keine** Laufzeile, **keinen** halben Zustand und **keinen** Fehler.
Aufgenommen als **OP-25**.

**M-9 · Matching ist nicht einzeln auslösbar.** `runMatchingShadow` hat genau zwei
produktive Aufrufer: `scheduler.js:412` (in `runSourceCrawl`) und `scheduler.js:588`
(in `runLageCheck`, das ab `scheduler.js:629` **selbst crawlt**). Es gibt **keine**
HTTP-Route in `server.js`, **kein** npm-Skript und **keinen** Workflow, der nur
Matching ausführt; die einzigen weiteren Aufrufer sind zwei Testskripte mit
hartkodierten Kunstmandanten und gestubbter Datenbank. Matching ist damit betrieblich
nur als Anhängsel eines Vollcrawls auslösbar — ein einzelner Mandant lässt sich weder
gezielt neu matchen noch gezielt nachziehen. Zusammen mit M-8 heißt das: wer heute
hinter der Abdeckung zurückfällt, hat keinen Weg nach vorn außer dem nächsten
Vollcrawl. Aufgenommen als **OP-26**.

### 25.6 Was nicht verändert wurde

Kein Code, kein Commit am Produktivpfad, keine Migration, keine Cron-Konfiguration,
keine Scores, Ränge, Kandidaten oder `matched_features`, kein manueller Lauf, keine
Datenkorrektur, kein Rollback. `knowledge_object_embeddings` unverändert. Der Rückweg
bleibt unverändert verfügbar: `HELMUT_MATCHING_AUDIT` auf `off` plus Redeploy führt in
Sekunden zum Legacy-Pfad zurück (§21.5); die strukturelle Rücknahme über
`20260728_matching_audit_rollback.sql` bleibt freigabepflichtig und war **nicht** nötig.

### 25.7 Sprintzustand

**Sprint 23B-1 ist erfolgreich abgeschlossen.** Alle sechs Bedingungen sind erfüllt:
erster Production-Auditlauf bewiesen (§25.2) · atomare Veröffentlichung bewiesen
(§16, §23.1, §25.2) · Idempotenz bewiesen (§25.3) · keine Legacy-Regression (§25.2) ·
keine zusätzlichen KI-Kosten (§25.4) · Dokumentation vollständig.

**Roadmap-Punkt 23 bleibt offen.** Die Herleitung ist jetzt gespeichert, aber für den
Mandatsträger noch **unsichtbar**. Erst **Sprint 23C** (sichtbare Nutzererklärung, §11)
erfüllt den Punkt; **Sprint 23B-2** (Briefing-Historisierung) bleibt ebenfalls offen.
Der Befund zum 200er-Ladefenster (**M-7**, §15.2) bleibt unverändert außerhalb.

---

# Teil C — Sprint 23C: die sichtbare Relevanzerklärung

**Stand:** 2026-07-29 · **Sprintzustand: teilweise abgeschlossen** — implementiert,
offline und im Browser bewiesen, **PR #171 offen und noch nicht gemergt**.

**Verhältnis zum Hotfix (§26).** Der Aktualitätsfilter auf `matching_results` wurde in
diesem Sprint **gefunden**, aber **nicht** hier ausgeliefert: mit der Aktivierung von
`HELMUT_MATCHING_AUDIT` wurde er vom latenten zum **aktiven** Pilotblocker und ging
deshalb als eigener, kleiner Hotfix (**PR #172**, gemergt) voraus. Sprint 23C ändert den
Lesepfad **nicht mehr** und baut nur noch auf ihm auf.

## 26 · Der tatsächliche Nutzerlesepfad (Read-only-Audit)

Vollständig nachgezeichnet, ohne Production zu berühren:

| Frage | Befund |
|---|---|
| Wo wird `matching_results` geschrieben? | `storage.saveMatchingResults` (Legacy) und `storage.publishMatchingRun` → RPC `helmut_publish_matching_run` (Auditpfad). Aufrufer: `matching.js:runMatchingCore` |
| Wo wird gelesen? | **Genau eine** produktive Funktion: `storage.listMatchingResults` |
| Welche API liefert an den Client? | Kein eigener Endpoint. Einziger Konsument ist `lage.js:loadRankedVorgaenge` (`lage.js:325`), Auslieferung im Lage-Payload von `/api/app/start` |
| Welche UI zeigt gematchte Vorgänge? | Lage-Karussell (`renderVorgangCard`) und die Vorgangs-Detailansicht als Bottom Sheet (`vsheetContentHtml`) |
| Welche Felder erreichten den Browser? | **Keine.** `lage.js` nutzte aus der Ergebniszeile ausschließlich `knowledge_object_id` als Auswahlschlüssel und verwarf jedes andere Feld |
| Wurden `signale`/`begruendung` übertragen? | **Nein** — sie wurden gelesen (`select=*`), aber nie weitergereicht |
| Tenant-/Rollenfilter? | `assertTenant` + zwingender `user_id=eq.<mandant>`-Filter; kein Rollenfilter (die Lage ist keine rollenabhängige Sicht) |
| Mobil und Desktop? | Dieselbe Oberfläche, ein Code-Pfad; mobil greifen kürzere Zeichenbudgets und Line-Clamps auf der Karte |
| Ähnliche Erklärungskomponenten? | Ja: „Warum wichtig?" — das ist aber `knowledge_objects.why_relevant`, eine **allgemeinpolitische, mandantenunabhängige** Einordnung aus dem Verstehensschritt, **nicht** die persönliche Relevanz |
| Tests auf diesem Pfad? | `lage-cacheonly-test.js`, `tenant-guard-test.js`, `radar-scan-limit-test.js`, `scoring-integration-test.js` — alle mit `listMatchingResults` als Attrappe; **kein** Test deckte `aktuell` ab (das holt `matching-aktualitaet-test.js` aus PR #172 nach) |

**Radar liest `matching_results` nicht** (bestätigt Sprint 23A). Der Entwurf in §11
(„Vorgangskarte in Lage **und Radar**") war insoweit unzutreffend — über Radar war die
Erklärung nie erreichbar.

**Zum Pilotblocker:** gefunden in diesem Sprint, ausgeliefert als **PR #172**. Die
frühere Einschätzung dieses Sprints, der Befund sei „latent, kein Nutzer betroffen",
galt nur für den Stand vor der Flag-Aktivierung. Mit `HELMUT_MATCHING_AUDIT=on` und
19 abgelösten Zeilen aus dem ersten Production-Lauf war er **aktiv**. Die vollständige
Analyse steht im Hotfix-Eintrag in `CURRENT_STATE.md`; Sprint 23C setzt ihn voraus.

## 27 · Produkt- und UX-Vertrag

**Die Frage, die beantwortet wird:** „Warum ist dieser Vorgang für **mich** relevant?" —
nicht „wie hat das System gerechnet?".

**Zwei Ebenen, nicht mehr.**

1. **Hauptsatz**, immer sichtbar: ein deterministischer Satz mit höchstens zwei
   politischen Gründen (`Betrifft deinen Ausschuss Arbeit und Soziales und deinen
   Schwerpunkt Rente.`).
2. **Belege**, zugeklappt: zwei bis vier kurze Zeilen in Du-Form
   (`Dein Ausschuss: Arbeit und Soziales`), nativ per `<details>` — ohne zusätzliches
   JavaScript, mit einem Daumen bedienbar, für Screenreader korrekt.

**Wo sie erscheint: in der Vorgangs-Detailansicht, nicht auf der Karte.**
Abweichung vom Entwurf in §11, begründet:

- Die Lage-Karte trägt bereits drei Zeilen (Kurzfassung / Warum wichtig? / Empfehlung)
  mit **gemessenen** Zeichenbudgets und CSS-Line-Clamps. Eine vierte Zeile hätte
  entweder eine bestehende verdrängt oder auf kurzen Viewports abgeschnitten gerendert.
- Die zweistufige Form (Satz + aufklappbare Belege) ist auf einer geclampten
  Karussellkarte nicht darstellbar.
- Die Karte ist der Einstieg: ein Tippen öffnet die Detailansicht. Der Weg zur
  Erklärung ist genau eine Geste lang.
- **Radar entfällt** — es liest die Ergebnisse nicht (§26).

Das ist die kleinste Lösung mit dem größten Nutzwert: **ein** Anzeigeort, **keine** neue
Karte, **kein** neuer Navigationspunkt, **keine** neue Designabstraktion.

**Platzierung im Sheet:** unmittelbar **vor** „Warum wichtig?". Die persönliche Relevanz
(„was hat das mit meinem Mandat zu tun?") interessiert eine Abgeordnete vor der
allgemeinpolitischen Einordnung. Beide Abschnitte bleiben sichtbar getrennt und sind an
der Überschrift unterscheidbar: **„Warum für dich relevant?"** (persönlich,
deterministisch, aus dem Matching) gegenüber **„Warum wichtig?"** (allgemein, aus dem
Verstehensschritt).

**Was nie sichtbar wird** — strukturell, per Weißliste statt Verbotsliste: Hashes,
Fingerabdrücke, Lauf- und Datenbankkennungen, Engine-/Rezept-/Vektorversionen,
Rohvektoren, `similarity`, `rank`, `legacy_vektor`, interne Pipeline-Begriffe. Gelesen
werden ausschließlich die vier Signalarten `ausschuss`, `thema`, `wahlkreis`, `partei`;
alles andere kann nicht in die Ausgabe geraten, weil es nie gelesen wird. Der Nutzer
sieht **keine einzige Ziffer**.

### 27.1 · Fallbacks

| Fall | Verhalten |
|---|---|
| 1 · `begruendung` **und** `signale` vorhanden | Gespeicherter Satz 1:1, Belege aus `signale` |
| 2 · nur `signale` | Satz deterministisch aus denselben Signalen abgeleitet (`matching-begruendung.js`, identische Bausteine) |
| 3 · nur `begruendung`, kein Beleg | **Kein Abschnitt.** Ein Satz ohne Beleg verstößt gegen die Belegpflicht |
| 4 · Legacy-Zeile, `run_id = NULL` | Belege und Satz aus den seit jeher gespeicherten `matched_features` — kein Backfill, keine Migration |
| 5 · keine belastbare Erklärung | **Kein Abschnitt, ersatzlos.** Kein Platzhaltertext |
| 6 · `aktuell = false` | Zwei Riegel: der Lesepfad liefert die Zeile nicht mehr (Hotfix aus PR #172), und das Modul verweigert die Erklärung zusätzlich |
| 7 · unvollständig/ungültig (kaputtes JSON, Zahlen, Arrays, überlange Werte) | `null` statt Fehler; Werte werden bereinigt und hart begrenzt (Belege 80 Zeichen, Satz 240) |

**Zu Fall 5, ausdrücklich:** Der Sprintauftrag schlug den Satz „Helmut hat einen Bezug zu
deinem Profil erkannt. Die konkreten Belege werden für dieses ältere Ergebnis noch nicht
angezeigt." als möglichen ehrlichen Fallback vor — mit dem Vorbehalt, ihn nur bei Passung
zu übernehmen. **Er wurde nicht übernommen.** Begründung: Bei einer Legacy-Zeile ohne
`matched_features` ist gerade **nicht** belegt, dass ein Bezug erkannt wurde — die Zeile
trägt keinen einzigen Merkmalstreffer. Der Satz behauptete also genau das, was die Daten
nicht hergeben, und wäre damit eine erfundene Relevanzbegründung. Das schließen
`START_HERE.md` §5.2 und die bereits in `matching-begruendung.js` festgeschriebene
Belegpflicht aus. Der ehrliche Fallback ist **Schweigen**: kein Abschnitt, keine
Behauptung. Das betrifft **76,8 %** der aktuellen Zeilen — an Production gemessen, nicht
aus Sprint 23A übernommen (§33). Die Erklärung erscheint also bei einer Minderheit der
Vorgänge. Das ist der ehrliche Zustand und ein messbares Qualitätsziel, kein Anlass für
einen Ersatztext.

## 28 · Umsetzung

**Neues Modul `lib/helmut/matching-erklaerung.js`** — die einzige Stelle, die aus einer
gespeicherten Ergebniszeile eine für Menschen bestimmte Erklärung macht. Rein lesend:
kein KI-Aufruf, keine Datenbankabfrage, kein Netz, kein Zufall, keine Zeitabhängigkeit.
Rückgabe ist ausschließlich `{ satz, belege:[{art,text}] }` oder `null`.

**Es wird nichts neu berechnet.** Der Satz kommt aus der persistierten Spalte
`begruendung`; nur wenn diese fehlt (Fälle 2 und 4), wird er **serverseitig** aus
denselben persistierten Signalen abgeleitet — mit dem bereits vorhandenen
deterministischen Modul aus Sprint 23B-1, nicht mit einer zweiten Logik. Auf dem Client
wird **keine** fachliche Erklärung berechnet; `client.js` zeigt nur an und escaped.

**Bewusst nicht enthalten:** keine Änderung am Lesepfad (die liegt im Hotfix PR #172),
keine neue Tabelle, keine Migration, kein neues Feature-Flag, keine neue Matchinglogik,
keine Änderung an Scores, Rängen, Filtern oder `matched_features`, keine Nutzung von
`knowledge_object_embeddings`, kein neuer Endpoint, kein neuer Navigationspunkt, keine
Änderung an `HELMUT_MATCHING_AUDIT`.

## 29 · Testnachweis

**Neue Suite `scripts/matching-erklaerung-test.js` — 64/64.** Vier Schichten:
Erklärungsmodul (A1–A24), Vorbedingung im Lesepfad (B1–B5), Serverpfad (C1–C13),
Oberfläche mit den echten Renderern aus `client.js` im `vm`-Kontext (D1–D16),
Nichtregression (E1–E6).

Die fünf B-Prüfungen ändern den Lesepfad nicht — sie sichern den Hotfix aus PR #172 als
**Vorbedingung** der Erklärung ab: fiele der Aktualitätsfilter, zeigte die Erklärung
Gründe zu einem Vorgang, der gar nicht mehr aktuell ist. Der Fix selbst ist durch
`scripts/matching-aktualitaet-test.js` (29/29) abgedeckt.

| Gefordert | Abgedeckt durch |
|---|---|
| aktuelles Ergebnis mit vollständiger Begründung | A1, A2, C2 |
| aktuelles Ergebnis nur mit Signalen | A3, A4 |
| Legacy-Ergebnis `run_id = NULL` | A6, C9 |
| `aktuell=false` erscheint nicht im Nutzerpfad | A9, B1, C1 |
| Tenant A sieht keine Erklärung von Tenant B | B2, B5, C12, C13 |
| technische Auditfelder nicht sichtbar | A20, A21, A22, C6, D10 |
| ungültige/überlange Signale sicher behandelt | A10–A19, D7, D8, D9 |
| keine Erklärung wird erfunden | A5, A7, A8, A23, A24, C3, D5 |
| mobile Darstellung | D13–D16 + Browser-Smoke + Sichtprüfung bei 390×844 |
| Nutzerpfad ohne Auditdaten funktioniert weiter | C8, C10, C11, D12 |
| Scores und Reihenfolgen unverändert | B3, C4, E5 |
| keine zusätzlichen LLM-Aufrufe | E1, E2, E4 |

**Gesamtlauf nach dem Rebase auf `main` (`a53e37b`):** siehe `CURRENT_STATE.md`
(Sprinttabelle) — Offline-Suite, Browser-/Mobile-Smoke und CI-Gate mit den dort
genannten Zahlen. Zusätzliche Sichtprüfung im echten Chromium bei 390×844 gegen die
echte `styles.css`: kein horizontaler Überlauf, Hauptsatz ohne Interaktion lesbar,
Belege zugeklappt (`checkVisibility()` = `false`), Trefferfläche des Aufklappers 32 px
hoch, aufgeklappt vier Belege ohne Textüberlauf.

## 30 · Was Sprint 23C nach dem Rebase noch enthält

Nach der Auslieferung des Hotfixes (PR #172) und dem Abschluss von Sprint 23B-1
(PR #173) besteht PR #171 **ausschließlich** aus der sichtbaren Erklärung:

- **neu** `lib/helmut/matching-erklaerung.js` — Erklärung aus gespeicherten Feldern
- **neu** `scripts/matching-erklaerung-test.js` — 64 Prüfungen
- **geändert** `lib/helmut/lage.js` — Erklärung mitführen, `relevanz` an der Karte
- **geändert** `client.js` — `vsheetRelevanzHtml` + Einbindung im Sheet
- **geändert** `styles.css` — `.vsheet-relevanz`, `.vsheet-belege`
- **geändert** Dokumentation

**Nicht mehr enthalten:** die Änderung an `lib/helmut/storage.js`. Sie war in der ersten
Fassung dieses PR enthalten und ist inzwischen inhaltsgleich über PR #172 in `main` —
beim Rebase wurde die Doppelung entfernt, `storage.js` ist jetzt byte-identisch mit
`main`.

## 31 · Merge-Bedingung

Die ursprüngliche Sperre („nicht mergen, bis Sprint 23B-1 abgeschlossen ist") ist mit
PR #173 **erfüllt**: Flag aktiv, erster Production-Auditlauf und Idempotenz bewiesen,
Sprint 23B-1 steht auf „erfolgreich abgeschlossen". Auch der Hotfix (PR #172) ist in
`main`. Damit bestehen **keine fachlichen Vorbedingungen mehr**; der Merge ist nur noch
eine Freigabeentscheidung des Betreibers (Merge = Production-Deployment).

## 32 · Geänderte und neue Dateien (Sprint 23C)

**Neu:** `lib/helmut/matching-erklaerung.js` · `scripts/matching-erklaerung-test.js`

**Geändert:** `lib/helmut/lage.js` · `client.js` · `styles.css` · dieses Dokument ·
`docs/CURRENT_STATE.md` · `docs/roadmap/phase_1_checkliste.md`

**Nicht angefasst:** `lib/helmut/storage.js` (nach dem Rebase identisch mit `main`) ·
Migrationen · `matching.js` · `matching-audit.js` · `matching-contract.js` ·
`matching-begruendung.js` · `scheduler.js` · Cron · Flags · Env · `ARCHITECTURE.md`
(die Architektur hat sich nicht geändert) · `CLAUDE.md` (keine neue dauerhafte
Projektregel).

## 33 · Gemessene Abdeckung der Erklärung (2026-07-29, rein lesend)

Erhoben **ausschließlich lesend** (`GET /rest/v1/...`, kein Schreibzugriff, kein RPC,
keine Änderung an Matching, Scores, Rängen oder Production-Daten) auf allen Zeilen mit
`aktuell = true`. Die Erklärung wurde mit der echten Funktion
`matching-erklaerung.erklaerungAusErgebnis` nachgestellt.

**Bestand:** **271** aktuelle Zeilen — **251** Altzeilen (`run_id IS NULL`) und
**20** Auditzeilen aus dem ersten Production-Auditlauf.

| Beleg | alle (271) | Altzeilen (251) | Auditzeilen (20) |
|---|---|---|---|
| verwertbare `begruendung` | 3 (1,1 %) | 0 (0,0 %) | 3 (15,0 %) |
| verwertbare `signale` | 3 (1,1 %) | 0 (0,0 %) | 3 (15,0 %) |
| verwertbare `matched_features` | 63 (23,2 %) | 60 (23,9 %) | 3 (15,0 %) |
| **kein** Beleg | 208 (76,8 %) | 191 (76,1 %) | 17 (85,0 %) |
| **UI zeigt eine Erklärung** | **63 (23,2 %)** | 60 (23,9 %) | 3 (15,0 %) |

### 33.1 · Der scheinbare Widerspruch „`signale` bei 20/20"

Beides stimmt, es sind zwei verschiedene Aussagen:

- **Strukturell** trägt jede der 20 Auditzeilen ein `signale`-Objekt — die Spalte ist
  nie leer.
- **Verwertbar** ist es nur bei **3** Zeilen. Die vorkommenden Schlüssel über alle 271
  Zeilen sind: `legacy_vektor` **20×**, `partei` **3×**, `ausschuss` **2×**. Bei **17**
  der 20 Auditzeilen enthält `signale` **ausschließlich** `legacy_vektor` — den rohen
  Ähnlichkeitswert, der bewusst **nie** angezeigt wird (keine Zahl, kein Score).

`signale` entsteht in `matching-begruendung.buildSignals(matchedFeatures, similarity)`
**aus** `matched_features`. Es kann deshalb nie mehr Belege enthalten als diese —
`legacy_vektor` ist der einzige Zusatz, und der ist nicht anzeigbar. Sind die
`matched_features` leer, ist `signale` bis auf die Zahl ebenfalls leer.

**Korrektur zur früheren Angabe:** die 78,4 % stammten aus Sprint 23A (225 von 287
Zeilen) und wurden hier fälschlich als heutiger Stand geführt. Gemessen sind es
**76,8 %** (208 von 271).

### 33.2 · Wird der `matched_features`-Fallback erreicht?

**Ja, vollständig.** **60** Zeilen haben kein verwertbares `signale`, aber
`matched_features` — **60 von 60 (100 %)** werden über den Fallback erklärt. Die
gespeicherte Rohform ist exakt die erwartete: `[{"type":"partei","value":"CDU/CSU"}]`.
Über alle 271 Zeilen gibt es genau zwei Ausprägungen: **leeres Array (208)** und
`Array<type+value>` **(63)** — keine unbekannte dritte Form, an der der Fallback
stillschweigend scheitern könnte.

### 33.3 · Ursache der 208 leeren Zeilen — Befund M-7, belegt

Die 208 leeren Zeilen wurden read-only nachgerechnet: die **gespeicherten** Wissensobjekte
(141, alle auffindbar) und die **gespeicherten** Mandatsprofile (7, alle ladbar) wurden
durch dieselbe reine Funktion `matchProfileToKnowledgeObjects` geschickt.

| Ergebnis | Zeilen |
|---|---|
| hätten Merkmale — **Verlust durch M-7** | **128** |
| echt ohne Überschneidung — korrekt leer | **80** |
| nicht bewertbar | 0 |

Beispiele verlorener Merkmale:
`[{"type":"ausschuss","value":"Arbeit und Soziales"}]` ·
`[{"type":"partei","value":"Die Linke"},{"type":"ausschuss","value":"Arbeit und Soziales"},{"type":"thema","value":"Gesundheit"}]`

**Mechanismus** (`matching.js:461`): Die pgvector-Suche läuft über **alle** Wissensobjekte
(1 507), die Merkmalsauflösung danach aber nur über ein Fenster von **200**:

```js
const kos = await deps.listKnowledgeObjects({ limit: 200 });
const byId = new Map(...);
const ko = byId.get(hit.id) || {};        // Treffer ausserhalb des Fensters -> {}
matched_features: matchedFeatures(pf, knowledgeObjectFeatures(ko))   // -> []
```

Liegt ein Treffer außerhalb des Fensters, wird gegen ein **leeres** Objekt gematcht und
`matched_features` bleibt leer — obwohl echte Überschneidungen bestehen. Der Verlust
entsteht im **Schreibpfad**, nicht in der Anzeige.

### 33.4 · Kann ein rein darstellender Fix die Abdeckung verbessern?

**Nein.** Drei Wege wurden geprüft:

1. **Mehr aus `signale` holen** — unmöglich. `signale` ist aus `matched_features`
   abgeleitet und enthält darüber hinaus nur `legacy_vektor` (nicht anzeigbar). Potenzial: **0 Zeilen**.
2. **Fallback reparieren** — nicht nötig, er greift bereits zu 100 % (§33.2).
3. **Merkmale zur Anzeigezeit neu berechnen** (Profil + KO liegen in `lage.js` vor) —
   technisch möglich, **fachlich abzulehnen**. Die Neuberechnung nutzt das **heutige**
   Profil, während die Ergebniszeile gegen den Profilstand **zum Laufzeitpunkt** entstand
   (Befund **M-3**). Der angezeigte Grund wäre dann nicht mehr nachweislich der Grund, aus
   dem der Vorgang gerankt wurde — eine unbelegte Begründung. Außerdem verdeckte es M-7,
   statt es zu beheben: die Auditzeile bliebe leer, die Oberfläche sähe vollständig aus
   (falsches Grün). Beides widerspricht `START_HERE.md` §5.2/§5.3.

**Fazit:** Die Grenze liegt in den **Daten**, nicht in der Darstellung. Ohne Behebung von
**M-7** — einer Änderung am Matching-Schreibpfad, in diesem Sprint ausdrücklich
ausgeschlossen — ist **23,2 %** die ehrliche Obergrenze. Mit behobenem M-7 wären
**(63 + 128) / 271 = 191/271 = 70,5 %** erreichbar, ohne eine Zeile Anzeigecode zu ändern.

### 33.5 · Folge für Roadmap-Punkt 23

Sprint 23C erfüllt seinen eigenen Zweck — die Erklärung ist korrekt, ehrlich und für
jeden belegten Vorgang sichtbar. Das Abnahmekriterium von **Punkt 23** („Es ist
nachvollziehbar, warum ein Vorgang zu einem Profil passt") ist bei **23,2 %** sichtbarer
Abdeckung jedoch **nicht** erfüllt. Punkt 23 bleibt offen; der nächste Schritt ist
**M-7**, danach ein **Sprint 23C-2** ohne Anzeigeänderung (die Abdeckung steigt allein
durch bessere Daten).

---

# TEIL D — Sprint 23C-2A: Erklärungsabdeckung im Schreibpfad reparieren (Befund M-7)

> **Stand 2026-07-29.** Umsetzung offline vollständig bewiesen, Production ausschließlich
> **lesend** geprüft. Kein Production-Write, keine Migration, kein Flag, kein Cron, kein
> Deployment, kein Merge. Branch `claude/matching-explanation-coverage-cnzjgy`.

## 34 · Der Fehler in einfachen Worten

Helmut sucht die passenden Vorgänge über den **gesamten** Wissensbestand — am 29.07.2026
sind das **1 702** Wissensobjekte. Direkt danach wollte er zu jedem gefundenen Vorgang
sagen, *warum* er passt. Dafür holte er sich aber nicht die gefundenen Vorgänge, sondern
schlicht **die 200 zuletzt geänderten** Objekte und suchte die Treffer darin.

Wer nicht in diesen 200 lag, wurde gegen ein **leeres Objekt** verglichen. Das Ergebnis
war zwangsläufig „keine Gemeinsamkeit" — obwohl in Wahrheit Ausschuss, Partei, Wahlkreis
und Schwerpunkt übereinstimmten. Der Vorgang blieb im Ergebnis, mit richtigem Rang und
richtiger Ähnlichkeit, aber **ohne jede Begründung**.

Der Verlust entstand also **nicht** in der Anzeige, sondern beim Schreiben. Die
Oberfläche aus Sprint 23C (PR #171) hat immer korrekt gearbeitet: sie zeigt nur, was
belegt ist — und es war nichts belegt.

**Gemessen (Production, 2026-07-29, rein lesend):** 271 aktuelle Ergebniszeilen, davon
63 mit sichtbarem Beleg. Von den 208 unbelegten Zeilen hätten **128** einen echten
Beleg getragen, wenn das richtige Wissensobjekt geladen worden wäre.

## 35 · Die gewählte Lösung

Eine Zeile Ursache, eine Zeile Behebung:

```js
// vorher (lib/helmut/matching.js)
const kos = await deps.listKnowledgeObjects({ limit: 200 });

// nachher
const trefferIds = [...new Set((search.results || []).map((h) => String(h.id)).filter(Boolean))];
const kos = await deps.listKnowledgeObjectsByIds(trefferIds);
```

Dahinter steht ein neuer, gebündelter Lesezugriff `storage.listKnowledgeObjectsByIds(ids)`:

- **eine** PostgREST-Anfrage je 100 Kennungen (`id=in.("…","…")`), bei der produktiven
  Trefferzahl von 20 also genau **eine** Anfrage — **kein N+1**;
- **dieselbe Leseprojektion** wie der bisherige Lesepfad (`V3_KO_READ_SELECT`), damit ein
  Treffer, der schon vorher im Fenster lag, **exakt dieselben** Merkmale bekommt;
- **deterministisch**: Kennungen werden dedupliziert und byte-stabil sortiert, zwei Läufe
  mit derselben Trefferliste erzeugen dieselbe Anfrage;
- **mandantenneutral**: `knowledge_objects` trägt kein `user_id` (ein Vorgang wird global
  genau einmal verstanden) — die Mandantengrenze liegt eine Ebene höher und bleibt
  unverändert: die Kennungen stammen ausschließlich aus der Trefferliste **dieses**
  Mandanten;
- **fail closed und laut**: ein echter Lesefehler wird geworfen (`StorageReadError`)
  statt still als „nichts gefunden" zu erscheinen. Genau diese Verwechslung von
  *nicht geladen* mit *nichts gefunden* **ist** M-7. Ein wirklich verschwundenes
  Wissensobjekt fehlt dagegen einfach — dann bleibt der Beleg leer und es wird nichts
  erfunden.

### 35.1 Warum **nicht** einfach das Limit erhöhen

`listKnowledgeObjects({limit:N})` liefert die N **zuletzt geänderten** Objekte. Die
Trefferliste des Matchings folgt aber der **Ähnlichkeit**. Beide Ordnungen haben
nichts miteinander zu tun — ein größeres N ist deshalb nur die Wette, dass sie sich
zufällig überlappen:

| | 200er-Fenster | größeres Fenster (z. B. 2 000) | Laden nach Kennung |
|---|---|---|---|
| korrekt bei 1 702 Objekten | nein | zufällig ja | **ja, konstruktionsbedingt** |
| korrekt bei 20 000 Objekten | nein | nein | **ja** |
| gelesene Zeilen je Lauf | 200 | 2 000 | **20** |
| PostgREST-Kappung bei 1 000 Zeilen | — | **still** (Nebenbefund W-1) | nicht anwendbar |
| Fehlerbild beim Überschreiten | still leer | still leer | existiert nicht |

Ein höheres Limit hätte den Fehler **verdeckt statt behoben**, wäre teurer geworden
(zehnfache Lesemenge je Lauf) und wäre bei der bekannten stillen 1 000-Zeilen-Kappung
von PostgREST erneut in dasselbe Fehlerbild gelaufen. Das Laden nach Kennung ist
zugleich das **billigste** Verfahren: 20 statt 200 Zeilen je Lauf.

### 35.2 Was ausdrücklich **nicht** angefasst wurde

Kandidatenauswahl · Ähnlichkeiten · Ränge · Reihenfolge · Ergebniskennungen · Filter ·
`matching_runs` · die Veröffentlichungstransaktion · der Lesepfad · die Oberfläche ·
`knowledge_object_embeddings` · semantisches Matching · Briefing-Logik · Cron · Budgets ·
Flags · Schema · Migrationen. Die Änderung liegt **hinter** der Trefferbestimmung und
**vor** der Ergebnisprojektion; sie liest, sie wählt nicht aus und sie bewertet nicht neu.

## 36 · Versionsentscheidung: **keine** Anhebung — und warum das die richtige ist

Die Ausgangsfrage lautete: muss `rezept_version` (oder eine andere Versionsachse)
steigen, damit der bestehende Idempotenzriegel eine neue Generation zulässt?

**Antwort: nein.** Der Fingerabdruck erledigt das bereits — und zwar **genauer**, als
eine Versionsanhebung es könnte.

`computeCandidateSetHash` trägt je Kandidat `id | Ähnlichkeit | ko_eingabe_hash`
(§15.2). Für einen Treffer außerhalb des alten Fensters war `ko_eingabe_hash` **null**
(im Hash als `-`), weil es kein Objekt zu hashen gab. Nach der Behebung steht dort ein
echter Hash. Daraus folgt zwingend:

| Fall | `ko_eingabe_hash` vorher → nachher | Fingerabdruck | Folge |
|---|---|---|---|
| Treffer lag **außerhalb** des Fensters | `null` → echter Hash | **ändert sich** | neue Generation zulässig — genau hier nötig |
| Treffer lag **innerhalb** des Fensters | Hash → derselbe Hash | **identisch** | bleibt idempotent, kein unnötiger Generationswechsel |

Eine Versionsanhebung hätte dagegen **jeden** Lauf **jedes** Mandanten neu erzeugt,
auch die, an denen sich nachweislich nichts ändert. Und sie hätte etwas Falsches
behauptet: das Rezept `legacy_relevance_v1` rechnet nach der Behebung **exakt wie
vorher** — es bekommt nur endlich seinen tatsächlichen Eingang zu sehen. Dasselbe gilt
für `legacy-shadow-1` (Engine) und `feature-hash-256-v1` (Vektor). Eine Versionsnummer
zu erhöhen, ohne dass sich das Verfahren geändert hat, wäre eine falsche Aussage im
Auditprotokoll — dieselbe Kategorie Fehler, die §16.1 schon einmal korrigieren musste.

Beides ist getestet: der betroffene Lauf bekommt einen neuen Fingerabdruck (G4), der
nicht betroffene behält seinen (G5), und nach der einmaligen Korrektur ist wieder alles
idempotent (G6–G8). Zusätzlich sichern G1–G3 die drei Versionswerte gegen eine
versehentliche Anhebung ab.

## 37 · Testnachweis

**Neue Suite `scripts/matching-erklaerungsabdeckung-test.js` — 60/60.** Sie ist rein
offline (0 KI, 0 externes Netz, 0 Production-Zugriff); Abschnitt C2 spricht bewusst ein
**lokales HTTP-Doppel auf 127.0.0.1** an, weil sich die tatsächlich gebaute
PostgREST-Anfrage sonst nur behaupten, aber nicht beweisen ließe.

| Abschnitt | Was bewiesen wird |
|---|---|
| **A (5)** | Treffer außerhalb des alten Fensters trägt jetzt seine 4 echten Merkmale; Treffer *innerhalb* bleibt unverändert; ein Treffer **ohne** echte Überschneidung bleibt leer |
| **B (8)** | Kandidatenzahl, Reihenfolge, Ähnlichkeiten, Ränge, Ergebniskennungen, **jedes** nicht-erklärende Feld und der Rückgabewert sind zwischen altem und neuem Verhalten **byte-identisch** |
| **C (5)** | genau **ein** Ladeaufruf für alle Treffer, mit allen Kennungen, Dubletten einmal; kein N+1; leere Trefferliste erzeugt nichts |
| **C2 (11)** | gegen ein echtes PostgREST-Doppel: 1 Anfrage für 3 Kennungen · `id=in.("…")` exakt · `limit` = Anzahl der Kennungen · fehlendes Objekt fehlt einfach · gleiche Projektion · **150 Kennungen → 2 Anfragen** (Stapel zu 100) · byte-identische Anfrage bei gleicher Menge · leere Menge = 0 Anfragen · **HTTP 500 wirft `StorageReadError`** · nicht bereiter Store wirft ebenfalls |
| **D (8)** | verschwundenes Wissensobjekt: `matched_features` leer, `begruendung` `null`, `signale` ohne fachlichen Beleg, `ko_eingabe_hash` `null` — der Treffer verschwindet deswegen **nicht**; der zuvor unbelegte Treffer trägt jetzt eine belegte Begründung ohne jede Ziffer |
| **E (5)** | jede Zeile trägt den eigenen Mandanten, Kennungen bleiben mandantengebunden, der Stapel-Lesezugriff fragt nur Kennungen der **eigenen** Trefferliste, `assertTenantRows` lehnt fremde Zeilen weiterhin ab |
| **F (3)** | kein KI-Modul im Schreibpfad, kein LLM-Pfad im neuen Lesezugriff, im gesamten Lauf kein KI-Modul geladen — **0,00 USD** |
| **G (9)** | Rezept-/Engine-/Vektorversion unverändert; neuer Fingerabdruck **nur** beim betroffenen Lauf; unveränderter beim nicht betroffenen; danach wieder idempotent (0 Ergebniszeilen, `wiederholungen` 0 → 1, gleiche Lauf-ID); weiterhin genau **eine** Sperre je Mandant |
| **H (4)** | die Oberfläche aus PR #171 zeigt die neu gewonnenen Belege **ohne eine Zeile UI-Änderung**; vorher kein Abschnitt, jetzt Satz + 2–4 Belege, ohne Ziffer; unbelegter Treffer bleibt ohne Abschnitt |
| **I (2)** | interne Mutationsprobe: alle 4 Kernaussagen scheitern gegen das alte Verhalten, die Kandidaten/Ränge bleiben dabei gleich |

**Externe Mutationsprobe (der eigentliche Gegenbeweis).** Der Schreibpfad wurde
testweise auf die alte Zeile `listKnowledgeObjects({ limit: 200 })` zurückgesetzt und
die neue Suite erneut gefahren: **11 Fehlschläge, Exit-Code 1** (A1, A2, C1, C2, C4,
D6, D7, E3, G4, H2, H3). Der gesamte Abschnitt **B blieb dabei grün** — genau richtig:
er misst die *Unveränderlichkeit* von Scores und Rängen und darf deshalb nicht
zwischen altem und neuem Verhalten unterscheiden. Anschließend wurde die Mutation
entfernt und die Gesamtsuite erneut grün gefahren.

**Gesamtstand:** Offline-Suite **180/180** (Ausgangsmessung auf unverändertem Stand:
**179/179**) · Browser-/Mobile-Smoke **32/32** · neue Suite **60/60** · Mutationsprobe
**11 Fehlschläge**. Alle Läufe ohne gesetzte Supabase-/Azure-Variablen, damit die
Cloud-Sitzung dieselbe Ausgangslage hat wie das CI-Gate.

## 38 · Die verbleibenden unbelegten Treffer — rein lesende Analyse

Erhoben mit `scripts/matching-erklaerungsluecke-analyse.js` (**schreibt nichts**, nur
`listMatchingResults` / `listKnowledgeObjectsSeitenweise` / `getProfile`; kein Matching
gestartet, keine KI, keine Datenänderung). Die Merkmale wurden mit denselben reinen
Funktionen nachgerechnet, die auch der Schreibpfad verwendet.

**Bestand:** 271 aktuelle Zeilen über 7 Mandanten.

| | Zeilen |
|---|---|
| mit sichtbarem Beleg (heute) | 63 (23,2 %) |
| ohne Beleg | 208 (76,8 %) |
| … davon gewinnen durch die Behebung | **128** |
| … davon bleiben ehrlich leer | **80** |
| Wissensobjekt nicht mehr auffindbar | 0 |
| **erwartete Abdeckung nach Neuberechnung** | **191/271 = 70,5 %** |

### 38.1 Warum die 80 leer bleiben

| Ursache | Zeilen |
|---|---|
| **Profil ohne Partei, ohne Ausschuss, ohne Schwerpunkt** — Beleg konstruktionsbedingt unmöglich | **20** |
| Wissensobjekt trägt selbst gar keine Merkmale | 7 |
| beide Seiten besetzt, aber wirklich keine Überschneidung | 73 |

Die 20 gehören **vollständig zu einem einzigen Mandanten**, dessen Mandatsprofil außer
einem Platzhalter (`Noch offen` als Region) nichts enthält. Dort ist nicht die Datenlage
der begrenzende Faktor, sondern die **Profilpflege**. Für dieses Mandat kann Helmut
heute grundsätzlich keine belegte Relevanz zeigen — egal wie gut das Matching wird.

### 38.2 Werden sie allein vom Legacy-Vektor getragen? **Nein — schlimmer.**

| | Zeilen |
|---|---|
| gespeicherte Ähnlichkeit **≤ 0** | **40** |
| Ähnlichkeit > 0 (nur Wortüberschneidung möglich) | 40 |
| Spanne der Ähnlichkeit (min / median / max) | **−0,0735 / 0,0000 / 0,2741** |
| Rangspanne dieser Zeilen | **1–20** |

**Die Hälfte dieser Treffer wird von gar nichts getragen.** 40 der 80 haben eine
Ähnlichkeit von **null oder negativ** — sie stehen nur deshalb im Ergebnis, weil die RPC
`match_knowledge_objects` die Top-N **unbedingt** liefert (kein Schwellenwert, §4.4).
Sie sind reine Auffüllung auf die geforderten 20 Kandidaten.

Die anderen 40 haben eine positive Ähnlichkeit. Da nachweislich **kein** Label
(Partei/Ausschuss/Region/Thema) übereinstimmt, kann diese Ähnlichkeit nur aus
`inhalt:`-Worttoken stammen — also aus **Wortüberschneidung im Freitext**, nicht aus
Bedeutung (§19). Das ist genau die Grenze des Merkmalsvektors und einem Mandatsträger
gegenüber nicht belegbar.

Und: diese Zeilen liegen **nicht** nur am Ende der Liste. Ihre Ränge reichen von **1 bis
20** — eine unbelegte Zeile kann heute an erster Stelle stehen.

### 38.3 Gibt es andere belastbare, heute ungespeicherte Signale? **Praktisch nein.**

| geprüftes Signal | Treffer im leeren Rest |
|---|---|
| namentliche Erwähnung des Mandats (`mentioned_mps`/`mentioned_people`) | **0** |
| betroffene Geografie trifft die Profilregion (`affected_geographies`) | **0** |
| erwähnte Geografie trifft die Profilregion (`mentioned_geographies`) | **0** |
| Wissensobjekt nennt ein Ministerium (`ministerien`) | 49 |

Die 49 Ministeriumsnennungen sind **kein** verwertbares Signal: das Mandatsprofil kennt
keine Ministeriumsdimension, es gäbe also nichts, womit man sie überschneiden könnte.
Sie zu zeigen wäre eine Behauptung („betrifft das BMAS"), keine Begründung
(„betrifft **dich**, weil …"). Es gibt in diesem Rest also **keine billige zweite
Ernte** — die Grenze ist echt.

### 38.4 Wirkung eines Erklärbarkeits-Gates auf die sichtbare Lage

Entscheidend ist nicht der Gesamtbestand, sondern das **sichtbare Fenster**: `lage.js`
zeigt `HELMUT_LAGE_MAX_VORGAENGE` = **12** Vorgänge je Mandant, und bei ausgeschaltetem
`HELMUT_SCORING_MODE` (dokumentierter Default) **wählt** `matching_results` diese
Vorgänge aus (`lage.js:336–347`) — es sortiert sie nicht nur.

*Ehrliche Grenze dieser Aussage:* der tatsächliche Wert von `HELMUT_SCORING_MODE` in
Vercel ist aus einer Cloud-Sitzung **nicht lesbar**; zugrunde gelegt ist der
dokumentierte Default „off" (`env-inventar.md` §123). Stünde er auf `on`, würde die Lage
über `scoring.rankForLage` gebildet und `matching_results` wäre am **Auswahlpfad gar
nicht beteiligt** — ein Erklärbarkeits-Gate hätte dann von vornherein keine Wirkung auf
die Lage, und die Empfehlung in §39.1 gälte erst recht.

Die Mandanten sind hier als A–G geführt (`START_HERE.md` §3: Mandatsidentitäten werden in
der Doku bewusst nicht geführt). Die Zuordnung erzeugt jederzeit reproduzierbar
`node scripts/matching-erklaerungsluecke-analyse.js`.

| Mandant | Fenster | erklärt **heute** | erklärt **nach der Behebung** | fiele bei einem Gate weg |
|---|---|---|---|---|
| A | 12 | 4 | **11** | 1 |
| B | 12 | 3 | **12** | 0 |
| C *(Platzhalterprofil)* | 12 | 0 | **0** | **12** |
| D | 12 | 12 | **12** | 0 |
| E | 12 | 7 | **12** | 0 |
| F | 12 | 11 | **12** | 0 |
| G | 12 | 9 | **12** | 0 |
| **Summe** | **84** | **46 (54,8 %)** | **71 (84,5 %)** | **13** |

Über den ganzen Bestand je Mandant (nicht nur das Fenster): 55,8 % · 100 % · 0 % ·
93,3 % · 73,9 % · 100 % · 74,5 % erklärte Zeilen nach der Behebung.

**Lesart:** Für **jeden** Mandanten mit gepflegtem Profil bringt allein die Behebung von
M-7 das sichtbare Fenster auf **11 bis 12 von 12** erklärten Vorgängen. Ein Gate würde
dort **einen einzigen** Vorgang zusätzlich entfernen. Beim Mandanten mit dem
Platzhalterprofil würde es die Lage **vollständig leeren**.

### 38.5 Zwei neue Befunde

- **M-8 — die RPC kennt keinen Schwellenwert, das Ergebnis enthält Auffüllung.**
  `match_knowledge_objects` liefert die Top-N unbedingt. Gemessen: **40** aktuelle
  Ergebniszeilen mit Ähnlichkeit ≤ 0 (minimal −0,0735), verteilt über die Ränge 1–20.
  Das ist **kein** Erklärbarkeitsproblem, sondern ein Problem der Kandidatenqualität:
  Helmut zeigt Vorgänge, für die es keinen Anlass gibt. Ein Schwellenwert ist eine
  Produktentscheidung (er verändert Kandidatenmenge und Ränge) und gehört deshalb
  **nicht** in diesen Sprint.
- **M-9 — ein Mandatsprofil ohne Partei, Ausschuss und Schwerpunkt kann nie eine
  belegte Relevanz erzeugen.** Betrifft aktuell einen Mandanten mit 20 von 20 unbelegten
  Zeilen. Wirksamster Hebel dort ist die Profilpflege (bzw. die Klärung, ob es sich um
  ein Demo-Mandat handelt → **OP-04**), nicht das Matching.

## 39 · Produktempfehlung und Rollout

### 39.1 Empfehlung zum Erklärbarkeits-Gate: **kein Gate — sichtbar lassen, ohne Erklärung**

Das ist zugleich der heutige Zustand (PR #171 blendet den Abschnitt ohne Beleg
vollständig aus, ohne Ersatztext). Begründung:

1. **Der Nutzen wäre fast null.** Nach der Behebung sind im sichtbaren Fenster 11–12 von
   12 Vorgängen erklärt. Ein Gate entfernte bei gepflegten Profilen **einen** Vorgang.
2. **Der Schaden wäre groß.** Beim Mandanten mit unvollständigem Profil bliebe die Lage
   **leer**. „Vorgang ohne Begründung" ist unbefriedigend; „gar keine Lage" ist
   unbrauchbar — und Helmuts Aufgabe ist die Morgenlage, nicht der Beweis.
3. **Ein Gate behandelte das falsche Problem.** Die verbleibenden Zeilen sind nicht
   *falsch*, sie sind *unbelegt*. Dass 40 von ihnen eine Ähnlichkeit ≤ 0 tragen, ist
   Befund **M-8** — eine Sache des fehlenden Schwellenwerts, nicht der Erklärung. Ein
   Gate würde diesen Befund **verstecken** statt beheben (falsches Grün).
4. **Ehrlichkeit ist bereits umgesetzt.** Kein Ersatztext, keine erfundene Begründung —
   der Abschnitt entfällt schlicht. Das entspricht `START_HERE.md` §5.2/§5.3.

**Stattdessen, in dieser Reihenfolge:**

| Schritt | Wirkung | Charakter |
|---|---|---|
| 1. Diesen Sprint ausrollen (M-7) | 23,2 % → **70,5 %** Bestand, 54,8 % → **84,5 %** sichtbares Fenster | Fehlerbehebung, keine Produktentscheidung |
| 2. Profilpflege / OP-04 klären (M-9) | +20 Zeilen möglich, betrifft genau ein Mandat | Betrieb, keine Codeänderung |
| 3. Schwellenwert für `match_knowledge_objects` (M-8) | entfernt Auffüllung mit Ähnlichkeit ≤ 0 | **verändert Kandidaten und Ränge → eigener Sprint, freigabepflichtig** |
| 4. Semantisches Matching (22C2) | hebt die *echte* Trefferqualität, nicht nur die Erklärung | freigabepflichtig |

Über ein Gate wäre — wenn überhaupt — erst **nach** Schritt 3 und 4 zu entscheiden, wenn
die Kandidatenmenge selbst belastbar ist. Ein technischer Hinweis für später: ein Gate
müsste in die **Abfrage** (`listMatchingResults`), nicht in die Anzeige — sonst
schrumpfte das 12er-Fenster, statt sich mit erklärten Vorgängen aufzufüllen.

### 39.2 Production-Rolloutplan mit Rückweg

**Voraussetzungen (geprüft):** PR #171 ist in `main` (`387b1a5`), das zugehörige
Production-Deployment `dpl_4tyHsdwjCYEHwGMz6zAAcsAvMmUC` ist **READY**;
`HELMUT_MATCHING_AUDIT` ist in Production aktiv; Migration `20260728_matching_audit` ist
angewendet. **Diese Änderung braucht keine Migration, kein neues Flag und keine
Env-Variable.**

| Schritt | Wer | Wirkung | Prüfung |
|---|---|---|---|
| 1. Merge des PR (= Deployment) | Betreiber | **sofort keine** — die Behebung wirkt erst beim nächsten Matchinglauf | Deployment `READY` |
| 2. nächster regulärer Crawl-Cron | automatisch | betroffene Mandanten: neuer Fingerabdruck → **eine** neue Generation, alte Zeilen `aktuell=false` (**nichts gelöscht**); nicht betroffene: idempotent, 0 Schreibvorgänge | `matching_runs`: neue Zeilen `vollstaendig`; 0 Zeilen auf unvollständigem Lauf |
| 3. Abnahme (rein lesend) | Betreiber/Claude | Erklärungsabdeckung neu messen | `node scripts/matching-erklaerungsluecke-analyse.js` |

**Erwartung für Schritt 3:** die Abdeckung steigt für jeden Mandanten, der seit dem
Deployment gelaufen ist. Wegen Befund **B5** (Crawl-Zeitlimit) und **B6** (kein
Einzelmandanten-Einstieg) erreicht **nicht jeder Lauf jeden Mandanten** — die Abdeckung
steigt deshalb über mehrere Tage, nicht auf einen Schlag. Das ist zu erwarten und **kein
Fehler**; ein gezieltes Nachziehen ist ohne OP-26 nicht möglich.

**Mengengerüst:** je betroffenem Mandanten entstehen einmalig bis zu 20 zusätzliche
Zeilen (die alte Generation bleibt als `aktuell=false` erhalten) — bei 7 Mandanten also
höchstens ~140 Zeilen. Zusätzliche KI-Kosten: **0,00 USD**. Die Lesemenge je Lauf
**sinkt** von 200 auf 20 Zeilen.

**Rückweg:** Revert des Merge-Commits. Danach schreibt der nächste Lauf wieder das alte
Verhalten. Es geht **nichts verloren**: kein Schema, kein Flag, keine Migration ist
beteiligt, und die abgelösten Zeilen bleiben mit `aktuell=false` erhalten. Ein
Wiederherstellen einer älteren Generation wäre ein reiner `UPDATE` auf `aktuell` und
bliebe eine getrennte, freigabepflichtige Production-Datenänderung.

**Ausdrücklich nicht Teil des Rollouts:** kein manueller Matchinglauf, keine
Neuberechnung bestehender Zeilen, keine Migration, keine Flagänderung, keine
Cron-Änderung, keine Production-Datenänderung.

## 40 · Geänderte und neue Dateien (Sprint 23C-2A)

| Datei | Art | Inhalt |
|---|---|---|
| `lib/helmut/storage.js` | geändert | neuer Lesezugriff `listKnowledgeObjectsByIds` (+ Export) |
| `lib/helmut/matching.js` | geändert | Trefferobjekte gebündelt nach Kennung laden statt Fensterlauf; neue Abhängigkeit in `defaultDeps` |
| `scripts/matching-erklaerungsabdeckung-test.js` | **neu** | 60 Prüfungen (Fehler, Unveränderlichkeit, Bündelung, Fail-closed, Mandant, Kosten, Fingerabdruck, Oberfläche, Mutation) |
| `scripts/matching-erklaerungsluecke-analyse.js` | **neu** | rein lesende Analyse der Erklärungsabdeckung (schreibt nichts) |
| `scripts/matching-audit-test.js` | geändert | Testdoppel auf den gebündelten Lesezugriff umgestellt |
| `scripts/p1-security-check.js` | geändert | dito |
| `docs/CURRENT_STATE.md`, `docs/roadmap/phase_1_checkliste.md`, `docs/datenmotor-restliste.md`, diese Datei | geändert | Statusfortschreibung |

Nicht geändert: `client.js`, `styles.css`, `server.js`, `lib/helmut/lage.js`,
`lib/helmut/matching-erklaerung.js`, `lib/helmut/matching-audit.js`,
`lib/helmut/matching-contract.js`, `lib/helmut/matching-begruendung.js`,
`supabase/migrations/*`, `helmut-flags.json`, Cron-Konfiguration.
