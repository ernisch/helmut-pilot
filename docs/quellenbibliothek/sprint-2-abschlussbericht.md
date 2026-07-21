# Sprint 2 · Universelle Quellenbibliothek — Abschlussbericht

> Stand 2026-07-21. Additive, sichere Grundlagen. **Keine** Produktivänderung, kein
> Deployment, keine Migration, keine kostenpflichtige API, keine Massen-Einpflege.

## Was gebaut wurde (Überblick)

Neue, in sich geschlossene Bibliothek `lib/helmut/quellenbibliothek/` (reine Logik,
kein Netz/KI/Storage-Write) mit 8 Modulen + 5 Offline-Testsuiten (**104 neue Assertions**),
plus 3 Architekturdokumente. Bestehende Offline-Suite: **145/145 grün** (vorher 140, +5).

| Baustein | Datei | Kernleistung |
|---|---|---|
| Typen/Schnittstellen | `types.js` | Verbindlicher Vertrag (Deskriptor/Requirement/Quality/Health/Discovery) |
| Deskriptor | `descriptor.js` | Strukturierte Beschreibung + kanonische Dedup-ID + Validierung |
| Parser-Registry | `parsers.js` | Parser-Registrierung, Methoden-Kompatibilität, Konfliktschutz |
| Registry („Fabrik") | `registry.js` | Aufnahme, globale Dedup, dimensionale Indizes |
| Zuweisung | `assignment.js` | Kriterienbasierte, hardcode-freie Mandat→Quellen-Ableitung |
| Qualitätsmodell | `quality.js` | 8 nachvollziehbare Achsen, ehrliche Verfügbarkeit |
| Gesundheitsmotor | `health-engine.js` | Zustandsmaschine (8 Zustände + Serie + letzter Erfolg) |
| Discovery | `discovery.js` | finden / veralten / doppeln / ersetzen / Qualitätsschutz |

Details: `00-ist-analyse-und-schulden.md`, `01-zielarchitektur-quellenbibliothek.md`.

---

## 1. Ist die Quellenbibliothek universell genug?

**Ja — für die Architektur; die Datenfüllung ist bewusst Sprint 3.**

Universell ist erreicht, weil **jede Zuordnung datengetrieben** ist und die alten
Sonderfälle verschwinden:

- Kein `LANDESPAKET_BY_BUNDESLAND`, kein `SOCIAL_TERMS`, kein `=== "linke"`, keine
  `fraction-linke`-ID mehr — ein neues Land/Partei/Thema/Region wird versorgt, **sobald eine
  Quelle mit den passenden Feldern in der Registry liegt** (Test 3c beweist: neue Partei-Quelle
  wirkt sofort ohne Codeänderung).
- Dieselben Deskriptorfelder tragen Bundestag, Bundesrat, Landtage, Ministerien, Behörden,
  Parteien, Fraktionen, Kommunen und (per Enum bereits vorgesehen) EU/international — ohne
  Sondermodell (§7-Tabelle in der Zielarchitektur).
- Die Ausschuss↔Thema-Brücke (Politikfeld) ersetzt handgepflegte Wortlisten durch normalisierten
  Schlüsselabgleich.

**Grenze (ehrlich):** universell ist die *Struktur*, nicht der *Bestand*. Die Registry ist im
Repo leer geseedet (Auftrag: „nicht tausende Quellen manuell einpflegen"). Erst Sprint 3 füllt
sie — über Discovery und den Adapter aus der bestehenden `retrieval_paths`.

## 2. Welche Architektur wurde gebaut?

Eine **selbstbeschreibende, datengetriebene Bibliothek** als Logikschicht über der
bestehenden relationalen Persistenz:

- **Ein flacher `SourceDescriptor` je Quelle** trägt alle Zuordnungs-, Vertrauens-, Lizenz-,
  Parser- und Health-Felder; ein kanonischer Schlüssel macht physisch identische Quellen
  deckungsgleich (globale Dedup).
- **Zuweisung = Laufzeitfunktion**, nicht kuratiertes Paket: aus dem Mandatsregister ein
  Anforderungsprofil, dann gewichteter Kriterienabgleich mit Begründung; global genau einmal
  via Referenzzählung.
- **Qualität = 8 erklärbare Achsen** mit ehrlicher Verfügbarkeit; **Health = Zustandsmaschine**
  aus injizierten Beobachtungen; **Discovery = Provider-Intake + Veraltung/Dedup/Ersatz +
  Qualitäts-Guard**.
- **Brücke statt Bruch:** die relationale `quellenarchitektur/` bleibt Persistenz und aktive
  Crawl-Wahrheit; ein späterer, freigabepflichtiger Adapter verbindet beide Welten.

## 3. Welche Risiken bestehen noch?

- **R1 — Datenqualität der Deskriptoren.** Die Zuweisung ist nur so gut wie die Feldpflege
  (korrekte Themen/Regionen/Vertrauen/Lizenz). Gegenmittel: Validierungs-Warnungen +
  Discovery-Anreicherung; Vollständigkeit ist Sprint-3-Arbeit.
- **R2 — Gewichte sind eine Redaktionsentscheidung.** Die Dimensionsgewichte (5/4/3/2) und
  Qualitätsgewichte sind plausibel, aber nicht empirisch kalibriert. Sie sind zentral +
  überschreibbar; Kalibrierung gegen echte Erträge steht aus (freigabepflichtig).
- **R3 — Health-Motor noch ohne echte Telemetrie-Anbindung.** Die Zustandsmaschine ist fertig,
  aber noch nicht an `source_crawl_telemetry` gehängt (Sprint 3, additiv).
- **R4 — Doppelte Wahrheit während der Übergangszeit.** Bibliothek und Paketebene existieren
  parallel, bis ein Shadow-Vergleich die Ablösung absichert. Bis dahin bleibt die Paketebene die
  produktive Wahrheit.
- **R5 — Regionsmodell vereinfacht.** Region/Wahlkreis/Bundesland werden als Slug-Schlüssel
  gematcht; eine echte Geografie-Hierarchie (Kreis→Land→Bund-Vererbung) ist noch nicht
  ausgenutzt (die Tabellen existieren, die Nutzung folgt).

## 4. Welche Entscheidungen benötigen Freigabe?

Nichts in diesem Sprint berührt Production. Für die *nächsten* Schritte freigabepflichtig:

- **F1 — Adapter `retrieval_paths` ⇄ `SourceDescriptor`** aktivieren (Read-Migration der
  Bestandsquellen in die Registry).
- **F2 — Health-Motor an `source_crawl_telemetry` hängen**, um `last_success_at` real zu befüllen.
- **F3 — Shadow-Vergleich** der Laufzeit-Zuweisung gegen die aktuelle Paket-Aktivierung, danach
  Entscheid über die Ablösung der manuellen Paketebene.
- **F4 — Kalibrierung** der Dimensions-/Qualitätsgewichte gegen echte 30-Tage-Erträge.
- **F5 — Discovery-Provider** (Sitemaps/OParl/Outlinks) und ggf. deren Netz-/Kostenrahmen.

Jede dieser Entscheidungen ist additiv und rollback-fähig geplant.

## 5. Ist Helmut bereit für Sprint 3 („Automatische Quellenzuweisung und Befüllung")?

**Ja.** Die Fundamente für Sprint 3 stehen und sind grün getestet:

- Zuweisung, Qualität, Health und Discovery existieren als reine, deterministische, getestete
  Bausteine mit klaren Schnittstellen.
- Der Weg zur Befüllung ist definiert: Adapter (F1) → Registry füllen → Discovery-Provider (F5)
  → Health-Telemetrie (F2) → Shadow (F3) → Kalibrierung (F4).
- Kein Blocker aus Sprint 2 offen; alle Änderungen sind additiv, ohne Produktivwirkung.

Empfehlung: Sprint 3 mit **F1 (Adapter, read-only)** und **F3 (Shadow-Vergleich)** beginnen —
damit wird die Bibliothek an echten Bestandsdaten gemessen, bevor irgendetwas produktiv
umgestellt wird.

---

## Testnachweis

| Suite | Assertions |
|---|---|
| `quellenbibliothek-descriptor-test.js` | 30 (Normalisierung, Dedup-Schlüssel, Validierung, Parser-Registry) |
| `quellenbibliothek-assignment-test.js` | 32 (Zuweisung, Gewichtung, Paketbildung, kein Hardcode, adversarial) |
| `quellenbibliothek-quality-test.js` | 20 (8 Achsen, Nachvollziehbarkeit, Ehrlichkeit, Monotonie) |
| `quellenbibliothek-health-test.js` | 23 (alle Zustände, Fehlerserie, Ausfallszenarien) |
| `quellenbibliothek-discovery-test.js` | 19 (Intake, Duplikate, Veraltung, Ersatz, Qualitäts-Guard) |
| **Gesamte Offline-Suite** | **145/145 Suiten grün** |

Abgedeckte Auftrags-Pflichttests (§9): Quellenzuweisung, Discovery, Health-Status, Duplikate,
Gewichtung, Parser-Registrierung, Paketbildung, Ausfallszenarien — alle grün.
