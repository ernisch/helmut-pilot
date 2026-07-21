# Sprint 2 · Universelle Quellenbibliothek — IST-Analyse & technische Schulden

> Read-only-Analyse der bestehenden Quellenarchitektur (Stand `main` 2026-07-21).
> Keine Produktivänderung. Grundlage für die neue `lib/helmut/quellenbibliothek/`.

## 1. Was heute existiert (und funktioniert)

Die vorhandene `lib/helmut/quellenarchitektur/` (Sprint-1..10-Migration) ist reif und
in weiten Teilen sauber. Sie trennt korrekt:

- **`publishers`** — Herausgeber, dedupliziert über `canonical_domain` (ein Herausgeber existiert einmal).
- **`retrieval_paths`** — Abrufwege (rss/api/html/googlenews_search/structured_download), mit `status`, `activation_mode`, `error_streak`, `last_success_at`, `priority`, `is_critical`.
- **`source_packages` + `package_paths`** — kuratierte Pakete, m:n auf Abrufwege, mit Referenzzählung (ein Weg läuft global genau einmal).
- **Geografie/Entitäten** — `geographies`, `electoral_districts`, `political_entities`, `path_expected_*`.
- **`model.js`** — Enums, Statusübergänge (`nextPathStatus`), Refcount (`computePathRefcounts`).
- **`quality-watchdog.js`** — mehrachsiger Watchdog (technicalHealth/contentYield/productValue, 10 Frische-Achsen, Kosten) mit vorbildlicher **Ehrlichkeit** (fehlende Datengrundlage → „nicht verfügbar", nie 0 erfunden).

Diese Substanz bleibt. Die Bibliothek ersetzt sie **nicht**, sondern legt die
universelle Beschreibungs-/Zuweisungsschicht darüber (Bridge statt Bruch).

## 2. Technische Schulden (belegt am Code)

### S1 — Zuweisung ist ein Stapel fest codierter Sonderfälle (schwerste Schuld)

`quellenarchitektur/profile-packages.js` und `seeds/packages.js` leiten die
Quellen eines Mandats über **hartkodierte Einzelfälle** ab:

| Fundstelle | Sonderfall |
|---|---|
| `profile-packages.js:28` | `LANDESPAKET_BY_BUNDESLAND = { berlin, brandenburg }` — nur 2 von 16 Ländern |
| `profile-packages.js:52` | `SOCIAL_TERMS = [...]` — handgepflegte Themenwortliste (nur Sozialpolitik) |
| `profile-packages.js:58` | `REGIO_NIEDERSACHSEN_TERMS = [...]` — eine einzige Region hartkodiert |
| `profile-packages.js:120` | `if (normalizeParty(p) === "linke") optional.push("die-linke-bund")` — eine Partei |
| `seeds/packages.js:90` | `/linke/i.test(source.party) \|\| id === "fraction-linke"` — Partei + konkrete Quellen-ID |

**Folge:** Ein zweites Bundesland, eine zweite Partei, ein zweites Fachthema oder eine
zweite Region erfordert jeweils **Code- und Seed-Änderung**. Das widerspricht dem
Sprint-Ziel „keine fest codierten Sonderfälle" und „keine manuellen Quellenpakete mehr"
direkt und ist die eigentliche Skalierungsbremse.

### S2 — Manuelle Paketebene als primäre Zuweisungswahrheit

Pakete (`PACKAGE_DEFINITIONS`) sind **kuratierte Seeds**. Jeder neue Bedarf (Land, Partei,
Thema) ist ein neues Paket, das jemand anlegt, mit Wegen bestückt und freigibt
(`berlin-basis`/`brandenburg-basis` stehen seit Sprint 9 auf `prepared` — leer). Die
Zuweisung ist damit so vollständig wie die Handarbeit an Paketen. Ein Mandat, für dessen
Land/Partei/Thema noch kein Paket existiert, ist „nicht vollständig aktivierbar" —
strukturell, nicht wegen fehlender Quellen.

### S3 — Quellenbeschreibung ist über Ebenen verstreut, nicht selbstbeschreibend

Die „Wahrheit" über eine Quelle liegt verteilt in `v1Sources` (Alt-Katalog),
`retrieval_paths`, `path_expected_levels/geographies/topics/entities` und wird in
`catalog.js` zur Laufzeit zusammengerechnet. `model.classifyMethod()` **leitet die
Methode bei jedem Aufruf erneut aus der URL ab**. Es gibt **kein einzelnes Objekt**, das
eine Quelle mit allen Zuordnungsdimensionen (Partei/Fraktion/Ausschuss/Thema/Region/
Ministerium), Vertrauen, Lizenz, Parser und Health vollständig beschreibt. Das erschwert
Zuweisung, Qualitätsvergleich und Discovery.

### S4 — Health ist kategorisch und in Produktion faktisch statisch

`model.nextPathStatus` kennt nur `success` + `errorStreak` → healthy/degraded/broken.
Es fehlen erststufige Zustände für **langsam, Parserfehler, Rate Limit, HTTP-Fehler,
nie geprüft, deaktiviert**. Schlimmer: `retrieval_paths.last_success_at` ist in Production
**leer** (Telemetrie nie verdrahtet, siehe `quality-watchdog.js:502` `pathTelemetry:false`).
`quality-watchdog` behilft sich, indem es „technische Gesundheit" aus dem *Dokumentertrag*
ableitet statt aus echten Abrufmessungen — ein Proxy, kein Motor. Der Auftrag verlangt
„keine statischen CSV-Zustände mehr".

### S5 — Kein einheitlicher, vergleichbarer Qualitäts-Score

`quality-watchdog` liefert **kategoriale** Urteile (`ergiebig`/`nur_duplikate`/`ohne_ko`),
aber keinen **nachvollziehbaren 0..1-Score** über Autorität/Aktualität/Relevanz/Stabilität/
Ausfallhäufigkeit/Einzigartigkeit/Geschwindigkeit/Redundanz. Für Ranking, Ersatzwahl
(„ist B mindestens so gut wie das defekte A?") und Discovery-Gates braucht es einen
metrischen, erklärbaren Score.

### S6 — Keine Discovery

Neue Quellen werden **von Hand** eingetragen. Es gibt keinen Mechanismus, der neue Quellen
findet, veraltete/doppelte erkennt, defekte ersetzt und dabei Qualitätsverlust verhindert.
Der Auftrag §6 ist heute schlicht unbesetzt.

### S7 — Kleinere Altlasten (dokumentiert, nicht Sprint-2-Blocker)

- `dedup.content_hash` ist faktisch ein URL/Titel-Hash (siehe `model.js:151`); ein echter
  Inhalts-Fingerabdruck (`contentFingerprint`) ist gebaut, aber nicht verdrahtet.
- Google News wurde historisch als RSS gegen `news.google.com` versteckt; `model.js` klassifiziert
  es heute korrekt als Aggregator, die **Identität** (Proxy-URL vs. Herausgeber-Domain) bleibt aber
  ein Sonderfall im Dedup.
- Referenztabellen laufen `RLS enabled, no policy` (service_role-only) — bewusst, aber
  linter-sichtbar; keine Sprint-2-Aufgabe (nur sichere Grundlagen).

## 3. Zielbild in einem Satz

Eine **datengetriebene** Quellenbibliothek, in der jede Quelle sich selbst vollständig
beschreibt und Zuweisung, Qualität, Health und Discovery **rein aus diesen Daten** folgen —
ohne Paketpflege, ohne Länder-/Partei-/Themen-Hardcode, skalierbar von Bund bis Kommune und
später EU. Der Bauplan steht in `01-zielarchitektur-quellenbibliothek.md`.
