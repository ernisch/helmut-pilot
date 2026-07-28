# Embedding-Architektur — Befund, Datenvertrag und Zielmodell (Sprint 22A/22B)

**Stand:** 2026-07-28 · **Sprint 22A** (Analyse + additive Verträge) · **Sprint 22B**
(Qualitätsvergleich vorbereitet, §13 — kein Backfill, keine Production-Änderung) ·
Roadmap-Bezug: [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md)
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

> **Aktualisierung Sprint 22B:** reale Messwerte und belegte Preise stehen in
> §13.5 — die dortigen Zahlen ersetzen die Schätzwerte dieses Abschnitts.

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

---

## 13 · Sprint 22B — Qualitätsvergleich vorbereitet (2026-07-28)

Alle Arbeiten offline/additiv; **kein Production-Write, keine Migration
angewendet, kein KI-Aufruf, Matching unverändert.** Der kostenpflichtige
Testlauf wartet auf Betreiberfreigabe (§13.6).

### 13.1 Testmenge und Goldstandard

[`../scripts/fixtures/embedding-testset-22b.json`](../scripts/fixtures/embedding-testset-22b.json):
**56 Wissensobjekte** (read-only aus Production exportiert, ~14:30 UTC) über
alle 15 geforderten Fallgruppen, darunter die dokumentierten Problemumgebungen
B4-3 (Iran-/„Angriffe"-Vokabularcluster) und B4-4 (CSD-/Wegner-Cluster,
Befundakte §15–§19), 4 exakte Headline-Duplikatpaare, die
Mindestlohn-Mehrfachvorgangsfamilie, Aktualisierungsketten, Berlin (6),
Brandenburg (1 — einziges echtes Landes-Objekt im verstandenen Bestand,
dokumentierte Bestandsgrenze), Ebene `unknown` (2), korrigierte Geografien (8)
und 9 Negativkontrollen. **Goldstandard: 47 Paare** in 7 Klassen, je mit
Begründung, **vor** jeder Modellauswertung fixiert (nicht nachträglich
anpassbar). Neuer Bestandsbefund: **238 der 772** verstandenen Objekte haben
eine leere `headline` (236 bleiben über den Kerntext berechtigt) — kein
Rezeptfehler, aber der `titel:`-Teil des Eingangs fehlt dort.

### 13.2 Legacy-Basislinie (Merkmalsvektor gegen Goldstandard)

Werkzeug [`../scripts/embedding-quality-eval.js`](../scripts/embedding-quality-eval.js);
Reproduzierbarkeit erneut bewiesen (56/56 Production-Vektoren lokal exakt,
max. Abweichung 4,25e-8). Ergebnis:

- **Rangqualität:** Rang 1 in 20/38, Top-5 in 33/38 Positiv-Richtungen,
  mittlerer Rang 4,4 — wortnahe Duplikate findet der Merkmalsvektor gut.
- **Bewiesene Schwächen (erwartetes Muster):** gleiche Vorgänge mit anderer
  Formulierung fallen durch — GVK-Duplikat Kosinus **0,059** (Rang 42),
  CSD-Anschlag↔Folgeberichterstattung **0,269** (Rang 21), Serienende Iran
  **0,177** (Rang 24), Petition **0,228**. Gleichzeitig liegen
  Negativkontrollen **über** echten Duplikaten (Mieten-Berlin↔Pflegeheim-Berlin
  **0,429**; Merz-„Angriff"↔Militärangriff **0,362**) — Merkmalsüberlappung,
  nicht Bedeutung.
- **Kein tragfähiger Einzelschwellenwert:** 0,35 → Trefferquote 68 % bei
  Präzision 0,87; 0,45 → Präzision 1,0 bei Trefferquote **26 %**. Der
  Zielkonflikt (mehr Beziehungen ↔ mehr Fehlverknüpfungen ↔ Prüfaufwand) ist
  in der Schwellentabelle des Werkzeugs dokumentiert.

### 13.3 Modell, Provider, Dimension (Empfehlung)

**Empfehlung: `text-embedding-3-small` über Azure OpenAI, Dimension 256
(nativer `dimensions`-Parameter), Rezept `ko-kanon-1`, eine Shadow-Struktur.**

| Variante | Bewertung |
|---|---|
| **text-embedding-3-small (Azure OpenAI)** — empfohlen | multilingual (gutes Deutsch), 8 191 Token Eingang (reicht: max. Eingang 370 Tokens), Batch, native Dimensionswahl 256–1536; **Betrieb: bestehender Helmut-KI-Provider** (Understanding läuft über `AZURE_OPENAI_ENDPOINT`) → kein neuer Vertrag, kein neuer Secret-Ort, bestehende AVV-/Datenschutzlage; Listenpreis (OpenAI) **0,02 USD/1 M Tokens**, Batch 0,01 |
| text-embedding-3-large | 6,5× Preis (0,13 USD/1 M), besserer MTEB-Schnitt; für kurze deutsche Verwaltungs-/Politiktexte kein belegter Bedarf — erst erwägen, wenn `small` im Testlauf versagt |
| jina-embeddings-v3 (Jina AI, Berlin) | EU-Anbieter, stark multilingual, Matryoshka 32–1024, 8 192 Kontext — die echte Option, falls die Datenschutzentscheidung gegen US-Cloud-Verarbeitung fällt; aber neuer Vertrag, neuer Secret-Ort, neuer Betriebsweg; Preisstruktur (Token-Bundles ~0,045–0,05 USD/1 M) offiziell nicht je Modell ausgewiesen |
| lokales Modell | weiterhin abgelehnt (§7: Serverless ohne GPU, Betriebslast; Kosten sind kein Argument) |

Preise extern belegt (2026-07, mehrere unabhängige Quellen); der konkrete
**Azure**-Preis und die Existenz eines Embedding-Deployments im bestehenden
Azure-Ressourcenbereich sind **vor** dem Testlauf gegenzuprüfen →
Freigabepunkt. Dimension: **eine** Dimension (256) für den Shadow-Vergleich;
ein Mehr-Dimensionen-Vergleich ist erst gerechtfertigt, wenn 256 im Testlauf
qualitativ versagt (Vermeidung von Variantenkombinatorik). 256 hält die
Speicher-/Indexlast klein (772 Vektoren ≈ 0,8 MiB; 1536 ≈ 4,6 MiB).

### 13.4 Offline-Shadow-Pipeline und Werkzeuge (additiv, 0 Netz, 0 DB)

- [`../lib/helmut/embedding-shadow-pipeline.js`](../lib/helmut/embedding-shadow-pipeline.js):
  Berechtigung → kanonischer Eingang → Hash → Batches (Batchgröße, hartes
  Objekt- **und** Tokenlimit, fail-closed; `maxObjekte: 0` = nichts) →
  injizierter Provider → Vektorvalidierung (Dimension, NaN/∞, leer, Nullvektor)
  → lokale Ablage (`shadow-store/`, gitignored; Datenvertrag = Shadow-Tabelle)
  mit Status/Fehler/Versuchszähler/Zeiten; idempotent, wiederaufnehmbar,
  Versuchsdeckel 3, Abbruch nach 2 Fehlbatches in Folge; ohne injizierten
  Provider ist **nur** der Dry-Run möglich. Ein Fehlschlag hinterlässt nie
  einen nutzbaren Vektor und berührt nie das Wissensobjekt.
- [`../scripts/embedding-shadow-pipeline-test.js`](../scripts/embedding-shadow-pipeline-test.js):
  **31 Prüfungen** — alle 20 Pflichtprüfungen des Sprintauftrags + 8
  Fehlerszenarien (Timeout, unvollständige Antwort, Teilbatch, Hashwechsel,
  Doppelstart, Versuchsdeckel, persistente Wiederaufnahme, Fixture-Integrität).
- [`../scripts/embedding-testlauf.js`](../scripts/embedding-testlauf.js):
  Testlauf-CLI, Default Dry-Run; echter Lauf **nur** mit
  `--echt --freigabe erteilt` + Secrets aus `process.env` (Weg A: bestehendes
  Azure-Endpoint-Paar + `HELMUT_EMBEDDING_DEPLOYMENT`; Weg B:
  OpenAI-kompatible API). Harte Limits 80 Objekte / 60 000 Tokens.
- [`../scripts/embedding-quality-eval.js`](../scripts/embedding-quality-eval.js):
  identische Metriken für Legacy und Semantik (`--semantik <ablage>`).
- Migrationsentwurf geschärft: Primärschlüssel jetzt
  `(knowledge_object_id, embedding_kind, model, dim, recipe_version)` —
  „genau ein aktiver Vektor je Objekt+Modell+Dimension+Rezept", Modellwechsel
  ohne Datenverlust abbildbar; zusätzlich Status-Index. Rollback unverändert
  vollständig (`drop table`).

### 13.5 Kostenmodell (real gemessen, ersetzt die Schätzwerte aus §8)

Realer kanonischer Eingang über alle **772** berechtigten Objekte: Ø **144**
Tokens (Median 133, p90 206, max 370) — die 22A-Schätzung T̄=250 war
konservativ zu hoch. Bei 0,02 USD/1 M (small):

| Größe | Tokens | Kosten (small) |
|---|---|---|
| Testlauf (56 Objekte) | 8 621 | **≈ 0,0002 USD** |
| Altbestand einmalig (772) | 110 992 | **≈ 0,0022 USD** |
| je 100 neue Objekte | ~14 400 | ≈ 0,0003 USD |
| vollständige Neuerzeugung/Modellwechsel | wie Altbestand | ≈ 0,0022 USD (large: 0,0144) |

**Budgettrennung:** eigener Zähler, getrennt vom Understanding-Budget.
Vorschlag Sicherheitsdeckel (Freigabe ausstehend): **50 000 Tokens/Tag** und
**1 USD/Monat absolut**, fail-closed — großzügig gegen den realen Bedarf,
hart gegen Fehlprogrammierung. Bestehende Budgets unverändert.

### 13.6 Freigabepaket externer Testlauf (STOPP — wartet auf Betreiber)

1. Provider **Azure OpenAI** (bestehender Vertrag) · Modell
   **text-embedding-3-small** · Dimension **256** · Rezept `ko-kanon-1`.
2. **56 Objekte**, ~**8 621 Tokens**, Kosten **≈ 0,0002 USD** (unter 1 Cent).
3. Gesendet wird je Objekt **nur** der kanonische Eingang: Titel, Vorgang,
   Bedeutung, Ereignistyp, Akteurs-/Institutionsnamen — alles aus öffentlichen
   Quellen abgeleitete, mandantenlose Verstehens-Ergebnisse; **keine**
   Nutzer-/Mandats-/Matchingdaten. Datenschutz: identische Verarbeitungslage
   wie das bestehende Understanding (gleicher Azure-Tenant); bei Weg B
   (direkter OpenAI-/Fremdanbieter) wäre die AVV-Lage neu zu bewerten.
4. Rückfallstrategie: Fehlversuche bleiben lokal in `shadow-store/` markiert,
   Wiederaufnahme = gleicher Aufruf; kein Rollback nötig (keine DB berührt).
5. Ablauf nach Freigabe: `HELMUT_EMBEDDING_DEPLOYMENT` in der
   Cloud-Session-Umgebung setzen (Environment-Einstellungen, nie Chat/Commit),
   dann `node scripts/embedding-testlauf.js --echt --freigabe erteilt`,
   anschließend `node scripts/embedding-quality-eval.js --semantik
   shadow-store/embedding-testlauf-22b.json`.
6. **Es werden keine Production-Daten geschrieben** (Ablage lokal, gitignored).
7. Offene Gegenprüfungen vor Freigabe: Azure-Preis + vorhandenes/anzulegendes
   Embedding-Deployment (eine Azure-Konfigurationsänderung wäre selbst
   freigabepflichtig).

**Ergebnis der Gegenprüfung (2026-07-28, ~12:45 UTC, Betreiberfreigabe für den
Testlauf lag vor):** Der bestehende Azure-Ressourcenbereich
(`AZURE_OPENAI_ENDPOINT`) enthält per Data-Plane-Abfrage genau **ein**
Deployment: `gpt-5-mini` (Understanding). **Kein Embedding-Deployment
vorhanden → Testlauf gemäß Auflage gestoppt, bevor irgendein Modellaufruf
erfolgte** (0 Aufrufe, 0 Tokens, 0,00 USD). Es wurde kein Deployment angelegt
und keine Azure-Einstellung geändert. Nebenbefund behoben: das Testlauf-CLI
erwartete `AZURE_OPENAI_API_KEY`, die Repo-Konvention ist `AZURE_OPENAI_KEY`
(`lib/helmut/ai.js`) — korrigiert, mit Fallback. **Nächster Schritt für den
Testlauf (erneute Freigabe nötig):** im bestehenden Azure-Ressourcenbereich
ein Deployment für `text-embedding-3-small` anlegen (Betreiber, Azure-Portal),
dann `HELMUT_EMBEDDING_DEPLOYMENT=<name>` in den Cloud-Session-
Environment-Einstellungen setzen und
`node scripts/embedding-testlauf.js --echt --freigabe erteilt` ausführen.
Alternative ohne Azure-Änderung: Weg B (OpenAI-kompatible API) — braucht ein
neues Secret und damit ebenfalls eine Freigabe.

### 13.7 Produktbewertung und Berlin/Brandenburg (Stand vor dem Testlauf)

Die Legacy-Basislinie **bestätigt** die §4-Einschätzung: klarer erwartbarer
Semantik-Mehrwert nur bei **Duplikaterkennung** und **Vorgangs-Wiedererkennung**
(die Fehlklassen der Basislinie sind genau die B4-artigen Fälle); Briefing,
Mandatsmatching und Quellenklassifikation behalten den Merkmalsvektor bzw.
strukturierte Daten. Der endgültige Nachweis braucht den Testlauf. Empfohlene
Zielarchitektur bleibt die Mischlösung: Legacy-Matching unverändert, Semantik
nur additiv für Duplikat/Gedächtnis, strukturierte Felder als harte Filter.
Berlin/Brandenburg: der Eingang ist ebenen-, geografie- und mandantenfrei
(hash-stabil getestet, Prüfungen 19/20 + 17/17b) — dieselben Vektoren tragen
Bund, Berlin, Brandenburg und künftige Länder ohne Neuerzeugung; Geografie
bleibt strukturierter Filter; Profilvektoren bleiben getrennt und
mandantenspezifisch; kein Mandant ist hartkodiert (testgesichert).
