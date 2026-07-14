# Schritt C (VORBEREITET) — PARDOK-Dispatch für amtliche Open-Data-XML (BE/BB)

Status: **vorbereitet, nicht aktiviert.** Kein Deployment, kein Cron, keine Quellen­aktivierung,
kein Flag gesetzt. Dieser Schritt liefert ausschließlich Code + Tests + Rollback und den Nachweis,
dass die sichtbaren Nutzerpfade (Lage / Radar / Helmut / Büro) unverändert bleiben.

## Was wurde angebunden

Die amtlichen Landesparlaments-Open-Data-XML (Berlin `be-plenum`, Brandenburg `bb-plenum`) werden
im Crawl über den Quell-Typ `crawlMethod: "structured_download"` an den bereits bewiesenen
PARDOK-Parser (`lib/helmut/quellenarchitektur/pardok-parser.js`) angebunden.

- **Neue Datei** `lib/helmut/quellenarchitektur/pardok-dispatch.js` — die einzige Anbindung des
  Parsers an den Crawl. Kapselt Feature-Guard, Land-Auflösung, Shadow-Ablage.
- **Ein einziger Zweig** in `lib/helmut/crawler.js` → `crawlSource()`:
  `if (source.crawlMethod === "structured_download") return (await pardokDispatch(...)).items;`
  `crawlSource` erhielt einen optionalen zweiten Parameter `deps` (injizierbarer Fetcher, nur für
  Tests; Produktions­aufrufer bleiben einarmig → rückwärtskompatibel).

## Feature-Guard `HELMUT_PARDOK_DISPATCH` (default AUS)

| Wert | Verhalten |
|------|-----------|
| _unset_ / `off` / alles außer `shadow` (auch `on`, `1`, `true`) | **INERT**: kein Fetch, kein Parse, **0 Items**. `crawlSource` verhält sich wie bisher. |
| `shadow` | **SHADOW-ONLY**: Fetch + Parse + Dedup → isolierte Datei unter `shadow-store/`; liefert **trotzdem 0 Items** in die sichtbare Pipeline. |

Der Live-Modus (Items → Pipeline) ist **bewusst nicht implementiert**. Das wäre der Cutover
(Schritt D/E) und erfordert eine eigene Gründer-Freigabe. `on`/`live` fällt hier auf `off` zurück.

## Harte Isolations-Invariante

`pardokDispatch()` gibt in **jedem** Modus `items: []` zurück. Berlin/Brandenburg-Inhalte sind damit
**strukturell** (nicht nur per Konvention) aus dem sichtbaren Nutzerpfad ausgeschlossen. Der
Shadow-Ertrag landet ausschließlich in einer eigenen Datei (`shadow-store/`, gitignored) — nie in
`raw_documents` / `knowledge_objects` / `briefings` / `decisions`. Kein LLM-Aufruf, Kosten $0.

## Nachweis: sichtbare Nutzerpfade unverändert

`scripts/pardok-dispatch-smoke-test.js` (alle grün):

- **A — strukturell:** statischer, rekursiver require-Graph der sichtbaren Lese-/Render-Backends
  (`lage.js`, `radar.js`, `radarState.js`, `matching.js`, `understanding.js`, `office.js`,
  `decisions.js`) — **kein** Pfad erreicht `pardok-dispatch`/`pardok-parser`. Gegenprobe: der
  `crawler.js`-Graph erreicht ihn sehr wohl (Scanner ist wirksam).
- **B — Verhalten:** Aggregation wie in `crawlAllSources` (flatMap der `crawlSource`-Items) über eine
  Quellenliste mit aktiver BE- **und** BB-`structured_download`-Quelle bei Guard `shadow` →
  **0 rawItems**, kein Item trägt einen BE/BB-Marker. Guard `off` liefert identisch 0.
- **C — Verdrahtung:** `crawler.js` ruft `pardokDispatch` genau **einmal** auf, gebunden an
  `crawlMethod === "structured_download"`.

## Tests

- `scripts/pardok-dispatch-test.js` — 26 Fälle (Guard-Matrix, Land-Auflösung, off=inert/kein Fetch,
  shadow=0 Pipeline-Items + Shadow-Report, Robustheit bei fehlendem Fetcher/Fetch-Fehler/HTML-
  Fehlerseite, crawlSource-Anbindung, isolierte Datei-Ablage). Alle grün.
- `scripts/pardok-dispatch-smoke-test.js` — 13 Fälle (siehe oben). Alle grün.
- Regression: gesamte Quellenarchitektur-Offline-Suite (inkl. `shadow-ingest`, adversarialer
  16-Punkte-Gesamttest, `pardok-parser`) weiterhin grün — die `crawler.js`-Änderung bricht nichts.

## Rollback

Rein codeseitig, keine DB-/Schema-Berührung → Rollback ist trivial und ohne Datenrisiko:

1. **Sofort-Neutralisierung (kein Deploy nötig):** `HELMUT_PARDOK_DISPATCH` ist default AUS. Solange
   nicht gesetzt, ist der Dispatch inert. Zusätzlich existiert **keine aktive** Quelle mit
   `crawlMethod: "structured_download"` → der Zweig wird ohnehin nie betreten.
2. **Vollständige Code-Rücknahme:** Commit revert (entfernt `pardok-dispatch.js`, den einen
   `crawlSource`-Zweig, den Require und die `.gitignore`-Zeile). `crawlSource` ist danach byte-
   identisch zum Vorzustand. Kein Backfill, keine Migration rückabzuwickeln.

## Nächste Freigabe (separater Schritt, hier NICHT ausgeführt)

Für begrenzten **Shadow-Betrieb**: Quelle `be-plenum` (oder `bb-plenum`) auf
`crawlMethod: "structured_download"` + `active` setzen **und** `HELMUT_PARDOK_DISPATCH=shadow` — dann
schreibt der Crawl BE/BB-Dokumente in die isolierte Shadow-Ablage, **ohne** jede Wirkung auf
Lage/Radar/Helmut/Büro. Der eigentliche Cutover (Items → Pipeline → sichtbar) ist ein weiterer,
davon getrennter Freigabeschritt und in diesem Code bewusst noch nicht vorhanden.
