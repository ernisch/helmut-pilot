# Sprint 2 — Korrekturbericht (verbindliche Nachschärfung)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible Arbeiten — **keine** Production-/RLS-Änderung, kein
Deployment, kein Backfill in Production, keine Quellenaktivierung.

Vier verbindliche Punkte vor Sprint 3 — alle sauber gelöst und getestet.

## P1 — Unsichere Ebene → `unknown` statt `bund`
- `deriveDecisionLevel` gibt bei **fehlendem** Ebenensignal jetzt `unknown` (Konfidenz `unknown`)
  zurück statt automatisch `bund`. Ein unsicherer (möglicher Landes-)Vorgang wird **nicht** mehr als
  Bundespolitik einsortiert.
- **Sichere Fälle unverändert:** Bundestagsausschuss/-ministerium → `bund`; Landtag/Senat+Bundesland →
  `land`; EU-Institution → `eu`.
- **Ehrlich statt blind:** Ein KO, das nur ein Bundesland erwähnt (keine Institution), wird `unknown`,
  erfasst aber `related_levels:["land"]` + `affected_geographies:[Bundesland]` — der Landesbezug geht
  nicht verloren.
- **Auswirkungen geprüft:** Schema (`unknown` ist gültiger Enum-Wert, kein Change nötig), Understanding
  (Assembler spiegelt `political_level=unknown`), **Matching** (nutzt `decision_level` heute noch
  nicht als Filter → keine schädliche Wirkung; `unknown` ist neutral, wird nicht als Bund gematcht),
  Backfill (setzt `unknown` deterministisch), Tests (angepasst + neue Assertions).

## P2 — Feature-Vektor ehrlich benennen (kein semantisches Embedding)
- Der 256-dim-Vektor ist ein **technischer Feature-/Merkmalsvektor** (Token-Hash aus Partei/Ausschuss/
  Region/Thema/Inhalt). Kosinus misst **Merkmalsüberlappung**, **nicht** Bedeutungsähnlichkeit — er
  ersetzt **kein** semantisches Matching und wird nicht als solches ausgegeben.
- **Umgesetzt:** ehrlich benannte Aliase `computeFeatureVectorForKnowledgeObject`/`…ForProfile` in
  `matching.js` (neuer Code nutzt sie); klarstellende Kommentare in `matching.js`, `understanding.js`,
  `storage.js`, `ko-classification-backfill.js`; **DB-Spalten-Kommentar** auf `knowledge_objects.embedding`
  („Technischer Feature-/Merkmalsvektor … KEIN semantisches Embedding"); Doku (`04-…`) korrigiert.
- **Keine kostenpflichtige Embedding-API** eingeführt. Echtes semantisches Matching ist als
  **freigabepflichtiger** Folgeschritt dokumentiert. Die DB-Spalte behält aus Legacy-Gründen den Namen
  `embedding` (nicht umbenannt = keine invasive, freigabepflichtige Schemaänderung), ihr Inhalt ist
  aber überall klar als Feature-Vektor gekennzeichnet.

## P3 — Sicherheitsmodell geklärt (Browser → DB)
Eine echte Anfrage wurde am Code verfolgt und eindeutig dokumentiert in
**`docs/quellenarchitektur/05-sicherheitsmodell-rls.md`**. Kurzfassung:

| Frage | Antwort (verifiziert am Code) |
|---|---|
| DB-Zugang | ausschließlich **`service_role`** (`storage.supabaseRequest`) |
| Greift RLS? | **Nein** — `service_role` hat `BYPASSRLS`; Policies sind inert |
| Wo Mandantentrennung? | **app-seitig**: `assertTenant`/`assertTenantRows` + `user_id=eq.<tenant>`-Filter je Query |
| Umgeht service_role RLS? | **Ja** |
| Prod-Sicherheitsmodell | **service_role + verpflichtendes App-Tenant-Scoping**; JWT-Pfad hart `false` |

**Widerspruch aufgelöst:** Der frühere „JWT/RLS scharf"-Stand wurde am 2026-07-13 (Commit `f952b69`)
stillgelegt (Supabase-Umstellung auf asymmetrische Signing-Keys → PGRST301; App kann kein akzeptiertes
Token mehr selbst signieren). `docs/multitenancy-abschlussbericht.md` trägt jetzt einen
Korrektur-Hinweis. **RLS/Production wurde nicht geändert.** Restrisiko dokumentiert: ein *vergessener*
App-Guard wäre ein IDOR, da die DB nicht abfängt → neue mandantenbezogene Reads immer über die Guards.

## P4 — `geography_id`/`entity_id` ausdrücklich als `string|null`
- Der Schema-Validator unterstützt jetzt ein `nullable: true`-Flag (statt die Felder aus der
  Validierung herauszunehmen).
- `geography_id`/`entity_id` sind **ausdrücklich** als `{ type: "string", maxLength: 80, nullable: true }`
  deklariert. Damit ist der Vertrag präzise: **String oder null** — nicht „egal".
- Verifiziert: `null`-Referenz valide; String-Referenz valide; **Zahl** bleibt invalide; `null` in
  Pflicht-Prosafeld bleibt invalide.

## Testergebnis (alle relevanten Tests erneut)
- `test:ko-classification` **67 PASS / 0 FAIL** (12 neue Nachschärfungs-Assertions).
- **Keine Regression:** source-architecture **86/86**, goldset ✓, understanding-eval **7/7**,
  matching-norm 20/20, p1 **322/322**, helmut-fields 65/65, decisions 38/38, lage 138/138,
  ko-anreicherung 18/18, ko-backfill 24/24.

## Offene Risiken / freigabepflichtige Production-Schritte (unverändert)
Migration `20260714_ko_classification.sql` anwenden · KO-Backfill `--execute` · Sprint-1-Migration+Seed ·
(langfristig) echtes Supabase-Auth für DB-erzwungene Trennung. **Alles vorbereitet, nichts ausgeführt.**

Alle vier Punkte sauber gelöst → ich fahre selbstständig mit **Sprint 3** fort (globale
Deduplizierung, Fundstellenmodell, Google News als Suchweg).
