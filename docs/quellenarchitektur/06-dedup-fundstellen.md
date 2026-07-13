# Globale Deduplizierung, Fundstellenmodell & Google News als Suchweg (Sprint 3)

Erklärt, wie derselbe Artikel über viele Suchwege zu **einem** Vorgang wird — verständlich aus
Gründerperspektive.

## Das Problem

Heute läuft die Deduplizierung nur **innerhalb eines Crawl-Laufs** und nur über einen Hash aus
`Titel|URL|Datum` (`crawler.deduplicateRawItems`). Zwei Nebenwirkungen:
1. **Duplikate überleben:** In Produktion sind **alle 4805** `content_hash` verschieden — die
   bestehende Dedup erkennt faktisch **0** Duplikate, obwohl ~101 Dokumente dieselbe Story sind
   (verifiziert per read-only-SQL). Ursache: schon ein anderer Tracking-Parameter oder ein leicht
   umgestellter Titel erzeugt einen neuen Hash.
2. **Fundstellen gehen verloren:** Wird eine Story über mehrere Suchwege gefunden, überlebt nur die
   erste Zeile — die Information „über welche Suchwege wurde das gefunden?" wird verworfen.

## Die Lösung (Sprint 3)

### Ein Artikel, ein Dokument, viele Fundstellen
`mergeIntoDocuments` führt zusammengehörige Fund-Items zu **einem** Dokument zusammen und behält
**jede** Fundstelle (`document_findings`): welcher Suchweg (`source_id`/`retrieval_path_id`), welche
konkrete Fund-URL (z. B. der Google-News-Proxy-Link), wann gefunden. So gilt Abnahmekriterium 5/6:
ein Artikel über zehn Suchwege = **ein** Raw Document, aber alle Fundstellen bleiben nachvollziehbar.

### Deduplizierung mit mehreren Signalen (vor der teuren KI)
Zwei Fund-Items sind dieselbe Story, wenn (streng → weich):
1. **gleiche Canonical-URL** (Tracking-bereinigt) — sicher dieselbe;
2. **gleicher Inhaltsfingerabdruck** — sehr wahrscheinlich dieselbe (auch über verschiedene
   Herausgeber, z. B. Agenturmeldung);
3. **gleiche Herausgeberdomain + Titelähnlichkeit ≥ Schwelle + Datum im Fenster** — der weiche Fall,
   bewusst **auf denselben Herausgeber begrenzt**, damit **verschiedene Landesvorgänge** nicht nur
   wegen ähnlicher Begriffe zusammenfallen (Auftrag §18).

Der **Inhaltsfingerabdruck** (`content_fingerprint`) ist **getrennt** vom fehlbenannten
`content_hash` (der ein URL/Titel-Hash ist) — endlich ein echter Fingerabdruck des bereinigten
Inhalts.

### Google News ist ein Suchweg, kein Herausgeber
Die Identität eines Dokuments trägt die **echte Herausgeberdomain** (aus der aufgelösten
Original-URL, z. B. `tagesschau.de`) — **nie** `news.google.com`. Die Google-News-Fund-URL bleibt nur
als **Fundstelle** erhalten. `extractCanonicalFromHtml` liest zusätzlich die vom Ziel deklarierte
Canonical (`<link rel=canonical>`/`og:url`), damit die Dedup-Identität die herausgebereigene ist.

## Datenmodell (Migration `20260715_dedup_findings.sql`, additiv)

| Objekt | Zweck |
|---|---|
| `raw_documents.content_fingerprint` | echter Inhaltsfingerabdruck (getrennt von `content_hash`) |
| `raw_documents.publisher_id` | weicher Verweis auf den aufgelösten Herausgeber |
| `raw_documents.canonical_target_url` | vom Ziel deklarierte Canonical (`rel=canonical`/`og:url`) |
| `raw_documents.finding_count` | Anzahl Fundstellen (denormalisiert, für Admin) |
| `document_findings` (neu) | eine Zeile je Fundstelle: `raw_document_id × source_id × original_url`, `retrieval_path_id`, `link_type`, `found_at` |

**Sicherheit:** `document_findings` ist global geteilt, RLS aktiviert, **service_role-only** (keine
`authenticated`-Policy) — konsistent mit Sprint 2. **Freigabepflichtig, nicht angewendet.**

## Status & Grenzen (ehrlich)

- **Nicht in den Live-Crawl verdrahtet.** Wie Sprint 1/2 ist dies eine additive, offline getestete
  Kompatibilitätsschicht (`lib/helmut/quellenarchitektur/dedup-global.js`); die Einbindung in den
  produktiven Ingest ändert Crawl-Verhalten und ist ein **freigabepflichtiger** Folgeschritt
  (Shadow-Betrieb, Sprint 6/7).
- **Titelähnlichkeit** nutzt Token-Jaccard (konservative Schwelle 0.72). Flexionsvarianten
  („beschließt"/„beschlossen") erreichen sie evtl. nicht — solche Fälle fängt aber i. d. R. die
  Canonical- oder Fingerprint-Stufe. Bewusst konservativ, um Falsch-Merges zu vermeiden.
- **`content_fingerprint`** basiert auf Titel + gekürztem Kontext (DSGVO: kein Volltext gespeichert)
  — er erkennt gleiche Meldungen zuverlässig, ist aber kein semantisches Ähnlichkeitsmaß.

## Verifizierter Nutzen (Prod, read-only)
101 Dokumente würden real zusammengeführt (die bestehende `content_hash`-Dedup erkennt 0 davon);
11 Gruppen sind echte Cross-Suchweg-Fundstellen; ~57 Fälle teilen dieselbe Canonical-URL.
