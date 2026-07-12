# KO-Anreicherung — Analyse & Backfill-Freigabevorlage

**Stand:** 2026-07-12 · **Status:** Sichere Code-Anreicherung **umgesetzt** (read-time,
kein DB-Write); **Production-Backfill: GESTOPPT** — wartet auf Freigabe (unten).

*KO = politischer Vorgang. Anreicherung = Vorgänge erhalten saubere Themen/Parteien/
Ausschüsse, damit Helmut sie personalisieren kann.*

---

## 1. Befund (Prod `ddckuvvpcytqbyfmbvie`, read-only, 2026-07-12)

| Kennzahl | Wert |
|---|---|
| Knowledge Objects gesamt | **217** (162 complete) |
| `tags` leer | **217 (100 %)** |
| `policy_field` leer | **217 (100 %)** |
| `embedding` NULL | **217 (100 %)** |
| **belegte** Felder, aus denen sicher ableitbar: `ausschuesse` | 66 |
| … `mentioned_committees` | 58 |
| … `parteien` / `mentioned_parties` | 91 / 74 |
| … `mentioned_locations` | 86 |
| … `display_category` (meist Ministerium) | 97 |

**Warum tags/policy_field/embedding leer sind:** Die Understanding-Engine
(`understanding.js`) extrahiert diese Felder **überhaupt nicht** (kein Code-Vorkommen);
das Schema erlaubt sie nur via `additionalProperties`. Das `embedding` wird vom
In-Memory-Ranker ohnehin **on-the-fly** berechnet (kein KI) — die DB-Spalte ist nur
für den (heute inaktiven) pgvector-Pfad relevant.

## 2. Ohne KI sicher erzeugbar — **bereits umgesetzt (read-time, kein Backfill)**

Der Ausschuss **ist** das Politikfeld. Deshalb leitet der Matcher das Politikfeld jetzt
**zur Laufzeit** aus den strukturierten, belegten Ausschuss-Feldern ab, solange
`tags`/`policy_field` leer sind (`matching.js` `derivePolicyFields`). Das ist
deterministisch, belegt, **kein erfundenes Thema**, **kein DB-Write** — und wirkt
**sofort auf den gesamten Bestand**. Prozedur-/Kontrollgremien (Koalitionsausschuss,
Untersuchungsausschuss, Bundesrat …) liefern bewusst **kein** Politikfeld.

Ebenfalls schon aktiv (frühere Sprints, ohne Backfill): Label-Normalisierung
Ausschuss/Partei (P1-2), robuste Leerfeld-Behandlung, erweitertes Scan-Fenster (P1-6).

**Messung (Unit, `ko-anreicherung-test.js`):** Themen-Treffer eines Politikfeld-Profils
**vorher 0 → nachher ≥1**; jedes Profil trifft nur sein eigenes Feld (keine
Fehl-Zuordnung).

## 3. Nur mit KI sinnvoll (NICHT umgesetzt)

- **Feine Themen-Tags** jenseits des groben Politikfelds (z. B. „Mindestlohn",
  „Pflegereform", „Bürgergeld") — lassen sich nur aus dem Volltext extrahieren.
- Diese würden das Themen-Matching **feiner** machen (ein Profil mit focusTopic
  „Mindestlohn" träfe gezielt statt nur „Arbeit und Soziales").

## 4. Backfill — Freigabevorlage (GESTOPPT vor Ausführung)

*Backfill = bereits gespeicherte Vorgänge nachträglich neu verarbeiten.*

| Punkt | Einschätzung |
|---|---|
| **Betroffene Vorgänge** | 217 (bzw. 162 complete für die KI-Themen) |
| **Tabelle/Felder** | `public.knowledge_objects`: `tags`, `policy_field` (`embedding` optional, nur falls pgvector aktiviert wird) |
| **Ohne KI möglich** | `policy_field` deterministisch aus Ausschüssen in die DB schreiben (~124 Ausschuss-Vorkommen) — **fachlich aber nicht nötig**, da die read-time-Ableitung dasselbe leistet |
| **Mit KI nötig** | feine `tags` (Themen aus Volltext) für 162 complete-KOs |
| **Geschätzte KI-Kosten** | grob **~0,50–1,50 €** gesamt (162 KOs × 1 kompakter Extraktions-Call; bei ~1–2k Tokens/Call und Mini-Modell-Preisen). **Unter dem 10-€-Limit** — aber echte Prod-Writes + KI, daher Freigabepflicht |
| **Geschätzte Laufzeit** | ~5–15 min (gedrosselt, 1 Call/KO, Understanding-Lock) |
| **Erwartete Verbesserung** | feineres Themen-Matching; heute schon deutlich verbessert durch die read-time-Ableitung (grobes Politikfeld). Zusatznutzen v. a. für Profile mit **spezifischen** focusTopics |
| **Testplan** | Dry-Run (Plan ohne Writes) → 5er-Stichprobe verifizieren (Tags plausibel, belegt) → Vollauf → `ko-anreicherung-test` + Golden-Cases + `/api/release/public`-Vorher/Nachher |
| **Rollback** | idempotent: `UPDATE knowledge_objects SET tags='{}' , policy_field='{}'` (Felder wieder leeren) — die read-time-Ableitung greift dann wieder. Kein Datenverlust an bestehenden Feldern |

## 4b. Ausführung — sicherer Admin-Endpoint (gebaut, wartet auf Betreiber-Klick)

Der Agent hat **keinen OpenAI-Zugang** und kann keine authentifizierten App-KI-Routen
auslösen (kein Key/Secret in seiner Umgebung). Daher wurde die Ausführung als
**admin-gesicherter Endpoint** gebaut, den der Betreiber auslöst:

**`GET /api/admin/ko-enrichment-backfill`** (nur Admin-Session):
- **Ohne Parameter = Dry-Run:** plant nur (Anzahl Kandidaten + Kostenschätzung),
  **ruft keine KI, schreibt nichts**.
- **`?execute=1` = echter Lauf:** schreibt `tags` (KI, Evidence-geguarded) + `policy_field`
  (deterministisch) nur für complete-KOs **ohne** bestehende tags.
- **Harter Deckel:** `?maxCents=` wird **auf 500 (5 €) geclamped** — nie höher.
  Fail-closed: bei Budget-Fehler sofort Stopp.
- **Evidence-Guard:** nur Tags, die im Vorgangstext belegt sind (keine Halluzination).
- **Idempotent:** erneuter Lauf überspringt bereits angereicherte KOs.

Zusätzliche Parameter:
- **`?bypassBudget=1`** — umgeht **nur** das tageweite App-Budget für diesen einen
  bewussten Lauf (der harte 5-€-Deckel bleibt die echte Grenze). Reiner Query-Param
  pro Request → **keine persistente Einstellung, nichts zurückzusetzen**.
- Die Antwort enthält **`aiProvider`** (`azure` / `openai` / `none`) — so ist sichtbar,
  ob wirklich Azure genutzt wird (nur der Name, **kein Secret**).

**Empfohlener Ablauf für den Betreiber:**
1. `GET /api/admin/ko-enrichment-backfill` (Dry-Run) → `aiProvider` (muss `azure` sein),
   Kandidatenzahl + Kostenschätzung prüfen.
2. Wenn plausibel: `GET /api/admin/ko-enrichment-backfill?execute=1&bypassBudget=1`
   → Lauf; Antwort enthält `aiProvider/processed/aiCalls/failed/spentEur/samples/stop`.
3. Ergebnis prüfen (`samples` = geschriebene Tags stichprobenartig plausibel/belegt?).
4. Danach `/api/release/public` (Personalisierung) + Runtime-Logs prüfen.

**Rollback:** `UPDATE public.knowledge_objects SET tags='{}', policy_field='{}'` (idempotent;
die read-time-Ableitung greift dann wieder). Kein anderes Feld wird je berührt.

**Tests:** `scripts/ko-enrichment-backfill-test.js` **22/22** (Dry-Run, 5-€-Deckel,
fail-closed, Evidence-Guard, Idempotenz, nur-2-Felder, KI-Fehler→kein-Write).

## 5. Fazit / benötigte Freigabe

Die **dringendste Lücke** (tote Themen-Dimension) ist **ohne Backfill geschlossen** —
das grobe Politikfeld wirkt sofort auf dem ganzen Bestand. Ein Backfill bringt nur die
**feineren KI-Themen** und ist **optional**. Er ist erst auszuführen nach expliziter
Freigabe (Prod-Writes + KI), bleibt aber unter 10 € und ist idempotent rückrollbar.

**Nicht ausgeführt** (Stop-Bedingungen eingehalten): kein Prod-Write, keine KI-Calls,
keine Cron-Änderung, keine neuen Secrets.
