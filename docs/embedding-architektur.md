# Embedding-Architektur — Befund, Datenvertrag und Zielmodell (Sprint 22A)

**Stand:** 2026-07-28 · **Sprint 22A** (Analyse + additive Verträge, kein Backfill,
keine Production-Änderung) · Roadmap-Bezug: [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md)
Punkt 22 („Embeddings vollständig speichern und prüfen").
**Achtung Nummernkollision:** Roadmap-**Punkt 22** (Embeddings) ist **nicht**
`OP-22` der Restliste (Scoring-Scharfschaltung) — die beiden sind unabhängig.

Dieses Dokument ist die **kanonische Wahrheit** zur Vektor-/Embedding-Architektur.

---

## 1 · Was das aktuelle „embedding" tatsächlich ist (bewiesen)

Die Spalte `knowledge_objects.embedding vector(256)` enthält **keinen semantischen
Vektor**, sondern einen **deterministischen Merkmalsvektor** (Feature-Vektor):

- **Erzeugung:** `lib/helmut/matching.js` → `computeFeatureVectorForKnowledgeObject`
  (Alt-Alias `embedKnowledgeObject`). Token-Hashing: gewichtete Tokens aus
  Partei/Ausschuss/Region/Thema/Inhalt werden per sha256 auf Index+Vorzeichen
  einer 256-dim Ebene abgebildet und L2-normalisiert. **0 KI, 0 Netz, 0 Kosten.**
- **Eingang des Feature-Vektors:** `parteien`+`mentioned_parties`,
  `ausschuesse`+`mentioned_committees`, `mentioned_locations` (als
  `region:`-Tokens — Geografie ist also heute Teil dieses Vektors),
  `tags`/`policy_field` (bei Leere read-time aus Ausschüssen abgeleitet) sowie
  Inhaltstokens aus `headline`, `was_ist_passiert`, `warum_wichtig`.
- **Schreibpfade:** (1) write-time in `lib/helmut/understanding.js` nach jeder
  Verstehens-Analyse; (2) Backfill `lib/helmut/ko-classification-backfill.js`
  (OP-08, 2026-07-16 ausgeführt). Profilvektoren: `runMatchingShadow` →
  `storage.saveProfileEmbedding` (Tabelle `profile_embeddings`, je Mandant,
  RLS-geschützt, mit `profile_hash` und `dim`).
- **Lesepfade:** (1) In-Memory-Ranking `matchProfileToKnowledgeObjects`
  (`decisions.js` → Briefing, `lage.js`); nutzt den gespeicherten Vektor,
  **berechnet ihn bei Fehlen deterministisch nach** — ein fehlender oder
  beschädigter Vektor kann das Briefing nicht brechen. (2) pgvector-RPC
  `match_knowledge_objects` (Kosinus + harte SQL-Filter Partei/Ausschuss/Region,
  schließt `pending` und `failed` aus) über `runMatchingShadow` im Scheduler,
  Flag `HELMUT_V3_MATCHING`.
- **Reproduzierbarkeit bewiesen (2026-07-28):** 3 zufällig gewählte
  Production-Vektoren wurden lokal aus den gespeicherten Objektfeldern exakt
  nachgerechnet — maximale Abweichung < 1e-8 (reine float4-Rundung), Kosinus 1,0.
- Benennung ist im Code seit Sprint 2 ehrlich kommentiert (Schema-Kommentar,
  Migration `20260714`, `matching.js`, `understanding.js`): die Spalte heißt
  aus Legacy-Gründen „embedding", Inhalt ist ein Feature-Vektor.

**Konsequenz:** Kosinus auf diesem Vektor misst **Merkmalsüberlappung**, nicht
Bedeutung. Zwei Vorgänge mit gleicher Bedeutung, aber anderen Wörtern, sind
nicht ähnlich. Ein semantisches Embedding wäre eine **neue, zusätzliche**
Fähigkeit — es darf die bestehende Spalte **nie** überschreiben (andere Semantik).

### Verbindliche Begriffe (nicht vermischen)

| Begriff | Bedeutung | Ort heute |
|---|---|---|
| Merkmalsvektor (`feature_vector`) | deterministischer 256-dim Token-Hash | `knowledge_objects.embedding`, dauerhaft |
| Semantisches Text-Embedding (`semantic_text`) | Modell-Vektor über kanonischen Text | **existiert nicht**; künftig Shadow-Tabelle |
| Profilvektor | Merkmalsvektor des Mandatsprofils, mandantenspezifisch | `profile_embeddings` (RLS), dauerhaft |
| Wissensobjektvektor | Merkmalsvektor des Vorgangs, mandantenlos | `knowledge_objects.embedding`, dauerhaft |
| temporär berechnete Vektoren | read-time-Fallback bei fehlendem Vektor | nur im Speicher (`matchProfileToKnowledgeObjects`) |

## 2 · Production-Bestand (read-only gemessen, 2026-07-28 ~13:00 UTC)

| Messgröße | Wert |
|---|---|
| Wissensobjekte gesamt | **1 501** |
| verstanden (`understanding_status='complete'`) | **772** — alle mit Vektor (772/772) |
| unverstanden (`pending` 720 · `failed` 9) | **729** — davon 1 mit Vektor¹ |
| falsche Dimension / Nullvektoren / ungültige Werte | **0 / 0 / 0** |
| verstanden ohne Fachgebiet (`tags` und `policy_field` leer) | **599** — alle mit Vektor |
| verstanden mit Ebene `unknown` | **78** — alle mit Vektor |
| verstanden mit belegter betroffener Geografie | 11 (Sprint-21-Zustand bestätigt) |
| verstanden mit Ortsnennungen (`mentioned_locations`) | 355 (fließen in den Merkmalsvektor ein) |
| Ebenenverteilung (verstanden) | bund 501 · unknown 78 · international 66 · land 61 · eu 37 · kommune 29 |
| Profile / Profilvektoren | 10 Profile, **7** mit Vektor (alle dim 256, alle mit `profile_hash`) |
| `matching_results` | 287 Zeilen, jüngste vom 2026-07-28 → **pgvector-Shadow-Matching läuft aktiv**² |
| Modell-/Rezeptversionen am Vektor | **nicht gespeichert** (einzige Metadaten: die Spalte selbst) |

¹ `ko-vg-tagesspiegel-20260519-f29ebd` — Rest des CSD-Vorfalls (Befundakte §15–§19), zurückgesetzter Vorgang mit erhaltenem Vektor. Kein Defekt der Vektorlogik.
² Befund E-1: [`betrieb/env-inventar.md`](betrieb/env-inventar.md) führt `HELMUT_V3_MATCHING` als „Default aus" ohne Prod-Vermerk; die frischen `profile_embeddings`/`matching_results` belegen, dass das Flag in Production gesetzt ist. Doku-Lücke, kein Code-Fehler.

Abweichungen zum Sprintauftrag („bekannter Ausgangsstand"): die ~594 fehlenden
Fachgebiete sind inzwischen **599**, die ~482 unverstandenen sind **729** — der
Bestand wächst im Tagesverlauf durch Crawls; das Understanding hinkt dem Crawl
strukturell hinterher (720 `pending`). Kein Widerspruch, nur Zeitversatz.

## 3 · Fachliche Bewertung der Objektklassen

Entscheidungsprinzip: **Mindestinhalt statt Einzelfeld.** Berechtigt ist ein
Objekt, wenn es verstanden ist und einen belastbaren Kerntext trägt
(`headline` + `was_ist_passiert` + `warum_wichtig`, ≥ 60 Zeichen). Kodiert in
`lib/helmut/embedding-contract.js::isEligibleForEmbedding`, testgesichert.

| Klasse | Berechtigt? | Begründung |
|---|---|---|
| verstanden + vollständig | **ja** | Kernfall |
| verstanden ohne Fachgebiet (599) | **ja — kein Blocker** | Fachgebiet ist nicht Teil des kanonischen Eingangs; der Kerntext existiert. Für den **Merkmalsvektor** schwächen sie nur die Themendimension (read-time-Ableitung aus Ausschüssen dämpft das) |
| verstanden mit Ebene `unknown` (78) | **ja — kein Blocker** | Ebene ist strukturierter Filter, nicht Vektorinhalt; sie begrenzt später das Matching, nicht das Embedding |
| Geografie korrigiert (Sprint 20/21) | **ja** | Geografie ist nicht Teil des kanonischen Eingangs → die Korrekturen erzwingen keine Neuerzeugung |
| unverstanden (`pending`, 720) | **nein** | kein verstandener Inhalt vorhanden; Embedding des Rohtexts wäre ein anderes Produkt |
| ausgeschlossen/terminal (`failed`/`failed-final`/aussortiert) | **nein** | bewusst terminal; „nie wieder"-Garantie aus OP-06/PR #105 gilt auch hier |
| fehlerhaft (Mindestinhalt fehlt) | **nein** | erst Understanding reparieren, dann einbetten — nie umgekehrt |
| zusammengeführt/abgelöst | **nein** | der Nachfolger trägt den Inhalt |
| veraltet | **ja, solange aktiv im Bestand** | Alter ist Ranking-, kein Embeddingkriterium |
| Mandatsprofile | **getrennt** | Profilvektoren bleiben mandantenspezifisch in `profile_embeddings`; ein semantisches Profil-Embedding ist NICHT Teil des kleinsten Zielmodells |

## 4 · Anwendungsfälle (real vorhandener Code, nicht Plan)

| Anwendungsfall | Existiert heute? | Reicht der Merkmalsvektor? | Semantik-Mehrwert? |
|---|---|---|---|
| Matching Vorgang↔Profil | ja (Briefing-Pfad + pgvector-Shadow) | **ja** — funktioniert, erklärbar (`matched_features`) | mittel: Wortwahl-unabhängige Treffer; erst per Shadow-Vergleich beweisen |
| Duplikaterkennung | teilweise (Vorgangsidentität ist regelbasiert, `vorgang-identity.js`) | nein — B4-3/B4-4 zeigten die Grenzen reiner Wort-/Anker-Regeln | **hoch**: gleicher Vorgang, andere Wörter — der stärkste Kandidat |
| Gedächtnis/Wiedererkennung von Vorgängen | teilweise (`topic_memory`, regelbasiert) | eingeschränkt | **hoch** (zusammen mit Duplikaterkennung) |
| Ähnlichkeitssuche KO↔KO | nein (RPC matcht nur Profil→KO) | möglich, aber wortgebunden | mittel |
| Themenclustering | nein | wortgebunden | niedrig–mittel; kein Production-Bedarf belegt |
| Briefing-Erstellung | ja | **ja** — braucht Ranking + Belege, keine Semantik | niedrig |
| Quellenklassifikation | ja (regelbasiert/deterministisch) | **ja** | keiner — strukturierte Daten sind sicherer und erklärbar |

**Leitplanke:** Ebene, Geografie, Mandant, Status und Quellenherkunft bleiben
**strukturierte Signale** (SQL-Filter). Embeddings übernehmen keine Aufgabe, die
strukturierte Daten sicherer lösen.

## 5 · Kleinstes tragfähiges Zielmodell

**Ein** kanonisches semantisches Embedding **pro Wissensobjekt** (mandantenlos),
zusätzlich zum bestehenden Merkmalsvektor. Keine Mehrfach-Embeddings ohne
belegten Produktnutzen. Kein semantisches Profil-Embedding im ersten Schritt.

**Kanonischer Eingangstext** (`buildCanonicalEmbeddingInput`, Rezept `ko-kanon-1`):
`titel` (headline) · `vorgang` (was_ist_passiert) · `bedeutung` (warum_wichtig) ·
`ereignis` (event_type) · `akteure` (decision_entities, sortiert/dedupliziert) ·
`beteiligte` (related_entities). Whitespace-normalisiert, deterministisch.

**Bewusst ausgeschlossen** (testgesichert, `EXCLUDED_INPUT_FIELDS`):
Nutzerpriorität, Matching-Ergebnisse, Briefing-Bewertungen, temporäre
Konfidenzen, Handlungsempfehlungen, Nutzer-/Mandatsnamen, kundenspezifische
Gewichtungen — **und** Fachgebiet, politische Ebene, Geografie. Letzte drei sind
strukturierte Filter; ihre spätere Korrektur (z. B. die 599/78-Nachpflege)
**erzwingt keine Neuerzeugung** — genau dafür sind sie draußen.

## 6 · Datenvertrag und Veraltet-Erkennung

Metadaten je Embedding (Shadow-Tabelle, Entwurf
[`../supabase/migrations/entwuerfe/20260728_embedding_shadow_entwurf.sql`](../supabase/migrations/entwuerfe/20260728_embedding_shadow_entwurf.sql)):
Vektor · `embedding_kind` · `model` · `provider` · `dim` · `recipe_version` ·
`input_hash` · `created_at`/`updated_at` · `status`
(`ausstehend`/`aktuell`/`fehlgeschlagen`) · `last_error` · `attempt_count` ·
`last_attempt_at`.

**Neu erzeugt wird nur wenn** (kodiert in `isEmbeddingCurrent`): Eingangstext
geändert (Input-Hash weicht ab) · Modellwechsel · Dimensionswechsel ·
Rezeptwechsel · Vektor fehlt · Vektor beschädigt (Dimension, NaN/∞,
Nicht-Zahlen, Nullvektor). Score-/Briefing-/Konfidenzänderungen können
konstruktiv keine Neuerzeugung auslösen (nicht im Eingang enthalten).

## 7 · Modell und Dimension (Bewertung, keine irreversible Entscheidung)

| Option | Bewertung |
|---|---|
| bestehender 256-dim Merkmalsvektor | bleibt unangetastet Production-Wahrheit; kostenlos, reproduzierbar, erklärbar; misst keine Bedeutung |
| semantisches API-Embedding | Kandidat für Shadow-Vergleich; **Qualitätsnachweis auf Deutsch nötig, bevor irgendetwas produktiv wird**; Modell-/Providerwahl ist Sprint-22B-Gegenstand mit Freigabe |
| lokales Modell | kein realer Vorteil im heutigen Betrieb: Vercel-Serverless ohne GPU, zusätzlicher Betriebs-/Wartungs-/Versionierungsaufwand, Ausfallrisiko; API-Kosten sind bei diesem Bestand (~0,2 M Tokens einmalig, s. §8) kein tragendes Argument |
| reduzierte Dimension | möglich (viele Provider erlauben Wahl); Entscheidung erst mit Modellwahl; Shadow-Tabelle fixiert die Dimension bewusst **nicht** im Spaltentyp |
| bestehende DB-Dimension `vector(256)` | gilt nur für den Merkmalsvektor; `EMBEDDING_DIM` ist env-änderbar (`HELMUT_MATCHING_DIM`) — eine Env-Abweichung von 256 würde write-time-Vektoren erzeugen, die nicht in die Spalte passen. Bekanntes, dokumentiertes Risiko; nicht ändern, nur wissen |
| Auswirkung auf `match_knowledge_objects` | keine — die RPC bleibt unverändert; ein semantischer Vergleich bekäme eine **eigene** RPC auf der Shadow-Tabelle |
| Modellwechsel später | über `model`+`recipe_version`+`input_hash` erkennbar; Neuerzeugung nur der Shadow-Tabelle, Production-Matching bleibt unberührt |

**Harte Regel:** Ein semantischer Vektor überschreibt **nie**
`knowledge_objects.embedding` — bewiesen unterschiedliche Bedeutung der Daten.

## 8 · Kostenmodell (parametrisiert, Basis: echter Bestand)

Gemessen: kanonischer Kerntext Ø **427** Zeichen (max 1 185), Entitäten Ø
**383** Zeichen → Eingang Ø ≈ **800 Zeichen ≈ 200–270 Tokens** (deutsch,
konservativ ~4 Zeichen/Token; Rechenwert T̄ = 250).

Externe Embedding-Preise liegen dieser Sitzung nicht belegt vor → **Formeln
statt erfundener Zahlen**, mit P = Preis pro 1 M Input-Tokens (USD):

| Größe | Formel | Wert bei heutigem Bestand |
|---|---|---|
| berechtigte Objekte | verstanden mit Mindestinhalt | **≈ 772** |
| Altbestand einmalig | 772 × T̄ = **~0,19 M Tokens** | Kosten ≈ **0,19 × P** |
| je 100 neue Objekte | 100 × T̄ = 25 k Tokens | ≈ **0,025 × P** |
| vollständige Neuerzeugung / Modellwechsel | identisch zum Altbestand | ≈ 0,19 × P (zzgl. Neubestand) |
| API-Anfragen (Paketgröße B) | ⌈772 / B⌉ Batches; Anbieter-Batching kann mehrere Texte je Anfrage bündeln | bei B=25: 31 Pakete |

Einordnung: selbst bei P im einstelligen USD-Bereich pro 1 M Tokens ist der
Altbestand ein **Sub-Dollar- bis Einzel-Dollar-Vorgang** — das Risiko liegt
nicht in den Kosten, sondern in Betriebssicherheit und Bedeutungsvermischung.
**Budgettrennung:** Embedding-Aufrufe laufen **nicht** über das
Understanding-Tagesbudget (100+30, fail-closed), sondern brauchen einen
eigenen Zähler mit eigenem Deckel (Entwurf §9); sie dürfen den
Understanding-Kopfraum nicht verbrauchen (Lehre aus Punkt-17-Defekt).

## 9 · Production-Sicherheitsmodell für einen späteren Backfill (Entwurf)

Nicht in 22A ausgeführt. Verbindlicher Rahmen für 22B:

1. **Eigene Sperre** (`pipeline_locks`-Familie, eigener Lock-Name) — blockiert
   nie Crawl oder Understanding und wird von ihnen nicht blockiert.
2. **Kleine Pakete** (`maxPerRun`, Default ≤ 50), deterministische Reihenfolge
   (`planEmbeddingWork`), Tokens- und Kostenlimit je Lauf, fail-closed.
3. **Idempotenz & Wiederaufnahme:** Zustand liegt ausschließlich in der
   Shadow-Tabelle (`status`/`input_hash`); Abbruch verliert nichts, Zweitlauf
   plant exakt den Rest — offline bewiesen (Tests 11/13).
4. **Keine Doppelberechnung:** aktueller Hash+Modell+Dimension ⇒ Skip.
5. **Konsistente Modellversion je Lauf**; gemischte Versionen werden erkannt
   und nachgezogen (Test 12).
6. **Dimension und Werte werden vor jedem Schreiben validiert**
   (`validateVector`); ungültige Antworten ⇒ `fehlgeschlagen` + `last_error`,
   **kein** Schreiben eines beschädigten Vektors.
7. **Teilfehler:** fehlgeschlagene Objekte halten das Paket nicht auf;
   `attempt_count`/`last_attempt_at` begrenzen Wiederholungen (Backoff, Deckel).
8. **Ein Embedding-Fehler löst NIE eine neue Understanding-Analyse aus.**
9. Fortschritt und Fehler sind sichtbar (Zählerstände je Lauf; Lesepfad im
   Admin erst nach Freigabe).

Verhalten im Fehlerfall: Timeout/Netz-/Providerfehler ⇒ Status
`fehlgeschlagen`, Wiederaufnahme im nächsten Lauf; Deployment während des
Laufs ⇒ unkritisch (Zustand in DB, Pakete klein, Lock läuft ab); falsche
Dimension/ungültige Zahlen/fehlende Antwort ⇒ verwerfen + Fehler speichern;
bereits aktuell ⇒ Skip; veraltet ⇒ Neuerzeugung.

## 10 · Berlin, Brandenburg, Mandantenneutralität

- Wissensobjektvektoren sind **mandantenlos** (heute wie im Zielmodell) —
  derselbe Vektor dient Bundestag, Berlin, Brandenburg und künftigen Ländern.
- Regionale Inhalte brauchen **keine eigenen Vektoren**: Geografie bleibt
  strukturierter Filter (`match_knowledge_objects`-Filter bzw. künftige
  strukturierte Spalten); die Sprint-20/21-Korrekturen liefern dafür die
  ehrliche Datengrundlage (nur noch belegte Geografien).
- Neue Bundesländer erfordern **keine Neuerzeugung des Altbestands** (der
  Eingang ist geografie- und mandantenfrei).
- Profil-Embeddings dürfen mandantenspezifisch sein (sind sie heute, RLS);
  Wissensobjekt-Embeddings bleiben mandantenneutral.
- **Kein Mandant ist hartkodiert**; testgesichert (Test 14c prüft das
  Vertragsmodul auf `cem-ince`, 14a/14b beweisen Hash-Unabhängigkeit von
  Nutzer-/Mandatsfeldern).

## 11 · Freigabepflichtige Punkte vor jeder Production-Umsetzung

1. Anwendung des Shadow-Migrationsentwurfs (Production-Migration).
2. Aktivierung eines externen Embedding-Modells/Providers (neuer KI-Pfad,
   neue Env-Secrets, eigenes Budget).
3. Jeder Backfill-Lauf gegen Production (Kosten + Prod-Write).
4. Jede Änderung am produktiven Matching (erst nach bewiesenem
   Shadow-Qualitätsvergleich; separate Entscheidung).

## 12 · Empfehlung

**Sprint 22B: ja, als nächster Schritt sinnvoll** — Umfang: Modell-/Provider-
Auswahl mit belegten Preisen, Freigabe + Anwendung der Shadow-Migration,
begrenzter Testlauf (z. B. 50 Objekte) mit Qualitätsvergleich Merkmalsvektor vs.
semantisch am Duplikat-/Wiedererkennungsfall (dem stärksten Nutzenkandidaten,
§4). **Kein** Umbau des produktiven Matchings in 22B. Vorher zu klären ist
keine kritische Blockade; die vier Freigaben aus §11 fallen in 22B selbst an.
