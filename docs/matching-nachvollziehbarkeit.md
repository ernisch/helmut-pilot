# Matching-Nachvollziehbarkeit (Roadmap-Punkt 23)

**Kanonische Quelle** für den Ist-Zustand des produktiven Matchings, die
Architekturentscheidung für Sprint 23B und die geplante Nutzererklärung (23C).

**Stand:** 2026-07-28 · Sprint 23A (Bestandsaufnahme, **keine** Verhaltensänderung)
**Basis:** `main` = `51a533d` (Merge PR #166) · Production read-only vermessen am
2026-07-28, ca. 17:00–17:30 UTC

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
