# Knowledge-Object-Klassifikation & Understanding (Sprint 2)

Erklärt, wie ein Vorgang (Knowledge Object) ab Sprint 2 politisch eingeordnet wird — verständlich
aus Gründerperspektive.

## Das Problem, das Sprint 2 löst

Bisher war bei **allen 231** Knowledge Objects die politische Ebene leer (`political_level` = 0/231)
und **kein** Embedding gespeichert (`embedding` = 0/231). Folge: Das System konnte **Bund nicht von
Land trennen** (Landesinhalte gingen im Bundesrauschen unter) und das Matching musste bei jeder
Anfrage neu rechnen (skaliert nicht). Zusätzlich griff die „Whitelist-Falle": selbst gesetzte Felder
wurden beim Speichern still verworfen, wenn sie nicht in drei synchronen Listen standen.

## Was ein Vorgang jetzt an Einordnung trägt

Der **eine** Understanding-Call (unverändert 1 KI-Aufruf pro Vorgang) erzeugt zusätzlich — und ein
**deterministischer Deriver** füllt jede Lücke:

| Feld | Bedeutung |
|---|---|
| `decision_level` | politische **Entscheidungsebene** (international/eu/bund/land/kommune). **Nie leer.** |
| `related_levels` | weitere berührte Ebenen (z. B. Bundesgesetz mit Länderwirkung) |
| `affected_geographies` | betroffene Geografien `[{name, level, geography_id}]` (aufgelöst gegen `geographies`) |
| `mentioned_geographies` | im Text erwähnte Orte, strukturiert + aufgelöst |
| `decision_entities` | **handelnde** Institutionen `[{name, type, entity_id}]` (Ausschuss, Ministerium, Parlament) |
| `related_entities` | **erwähnte** Akteure (Parteien, Personen, Organisationen) |
| `event_type` | Ereignistyp (Gesetzentwurf, Anhörung, Abstimmung, …) |
| `classification_confidence` | **dimensionierte** Konfidenz `{level, geography, entities, event_type}` — kein einzelner Score |

Region/Wahlkreis ist bewusst **keine** Ebene (Geografie). `political_level` (Alt-Spalte) wird mit
`decision_level` gespiegelt, damit Matching/Read ohne Umbau profitieren.

## KI + Deriver: warum das robust ist

- **Die KI liefert** `decision_level`/`event_type`, wo sie es sicher weiß (im Prompt erklärt).
- **Der Deriver** (`lib/helmut/quellenarchitektur/classification.js`, reine Logik, **keine KI**)
  leitet aus den bereits belegten Feldern ab: Bundestagsausschuss/-ministerium → `bund`;
  Landtag/Senat + Bundesland → `land`; EU-Institution → `eu`; sonst `bund` mit **niedriger**
  Konfidenz. So ist `decision_level` **nie leer**, auch wenn die KI schweigt oder das Token-Limit
  greift (die neuen Felder sind additiv/nicht-required → nie ein Grund für einen abgeschnittenen Call).
- **Namen → IDs:** Orte und Entitäten werden gegen die Sprint-1-Seeds auf kanonische IDs aufgelöst;
  unauflösbare bleiben mit `entity_id: null` erhalten (**kein erfundener Treffer**).

Zwei subtile Fallen sind behoben: „eu" matcht nicht mehr als Silbe in „D**eu**tschland"
(Wortgrenzen); „Menschenrechte" wird nicht mehr fälschlich auf den Rechtsausschuss aufgelöst.

## Embedding: einmal erzeugen, dauerhaft speichern

Der deterministische Merkmalsvektor (256-dim, **keine KI**) wird jetzt **write-time** im Assembler
erzeugt und persistiert — statt bei jeder Anfrage neu gerechnet. Beim **Lesen** wird der Vektor
bewusst weggelassen (Performance); dafür gibt es eine getrennte Schreib-Whitelist
(`V3_KO_WRITE_COLUMNS`). Das behebt `matching_results = 0` an der Wurzel und bereitet vorberechnetes,
günstiges Matching pro Profil vor.

## Alt-KOs: kostenneutraler Backfill

`scripts/ko-classification-backfill.js` füllt die 231 bestehenden KOs **ohne KI-Kosten** (rein
deterministisch aus vorhandenen Feldern): `decision_level`, Geografie, Entitäten, `event_type`,
`classification_confidence` und das Embedding.

- **Dry-Run per Default** — zeigt nur den Plan.
- Idempotent (nur `complete`-KOs **ohne** `decision_level`).
- `--execute` schreibt in Production (nur Klassifikationsspalten) → **freigabepflichtig**, aber
  **kostenneutral**.

## Migration & Sicherheit

- `supabase/migrations/20260714_ko_classification.sql` (+ Rollback): 8 additive Spalten auf
  `knowledge_objects` + Index auf `decision_level`. **Freigabepflichtig, nicht angewendet.** Bestehende
  Spalten (`political_level`, `embedding`) bleiben unangetastet.
- **RLS-Verschärfung (Sprint 2):** Die Sprint-1-Quellentabellen sind jetzt **service_role-only**
  (keine `authenticated`-Leserichtlinie) — normale Nutzer greifen nie direkt auf die DB zu (Details in
  `03-datenmodell-und-migration.md`).
