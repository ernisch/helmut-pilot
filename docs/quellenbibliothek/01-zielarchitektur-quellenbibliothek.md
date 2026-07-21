# Sprint 2 · Zielarchitektur — Universelle Quellenbibliothek

> Bauplan der neuen `lib/helmut/quellenbibliothek/`. Reine, additive Bibliothek:
> kein Netz, keine KI, kein Storage-Write, keine Produktivmigration. Sie verändert
> das Live-Verhalten nicht und ist unabhängig lauffähig/testbar.

## 1. Prinzipien

1. **Selbstbeschreibend** — jede Quelle ist EIN flacher `SourceDescriptor` mit allen
   Zuordnungs-, Vertrauens-, Lizenz-, Parser- und Health-Feldern. Keine verstreute Wahrheit.
2. **Datengetrieben statt fest codiert** — Zuweisung/Qualität/Health/Discovery lesen NUR
   Deskriptorfelder. Kein Länder-, Partei-, Themen- oder Quellen-ID-Sonderfall im Code.
3. **Paket = Laufzeitergebnis** — die Quellenmenge eines Mandats wird zur Laufzeit aus
   Kriterien GEBILDET, nicht kuratiert. Es gibt keine manuell gepflegte Paketebene mehr.
4. **Ehrlichkeit** — fehlende Datengrundlage ist „nicht verfügbar", nie eine erfundene 0
   (Prinzip aus dem bestehenden `quality-watchdog` übernommen).
5. **Reine Funktionen, injizierte Uhr/Provider** — deterministisch und offline testbar.

## 2. Bausteine (`lib/helmut/quellenbibliothek/`)

| Modul | Aufgabe | Auftrag |
|---|---|---|
| `types.js` | JSDoc-Typen/Schnittstellen (Deskriptor, Requirement, QualityScore, HealthRecord, DiscoveryCandidate) | §2 |
| `descriptor.js` | Normalisierung + Validierung + kanonischer Dedup-Schlüssel | §2 |
| `parsers.js` | Parser-Registry (Methoden-Kompatibilität, Konflikt, `supports`) | §9 |
| `registry.js` | „Quellenfabrik": Aufnahme, globale Dedup, dimensionale Indizes | §2/§7 |
| `assignment.js` | automatische Quellenzuweisung aus dem Mandatsregister | §3 |
| `quality.js` | mehrachsiges, nachvollziehbares Qualitätsmodell | §4 |
| `health-engine.js` | Gesundheitsmotor / Zustandsmaschine | §5 |
| `discovery.js` | Discovery-Strategie (finden/veralten/doppeln/ersetzen/schützen) | §6 |
| `index.js` | Fassade + `createLibrary()` | — |

## 3. Der universelle Deskriptor (§2)

Ein `SourceDescriptor` beschreibt jede Quelle strukturiert mit **allen geforderten
Feldern**: Herausgeber (`publisher`), Quelle (`name`), Typ (`evidenceRole`), Abrufweg
(`access.method` ∈ rss/api/html/search/structured_download) inkl. `url`/`query`/`provider`/
`parser`, Partei (`parties`), Fraktion (`factions`), Ausschüsse (`committees`), Themen
(`topics`), Regionen (`regions`), Ministerien (`ministries`), Ebene (`level`), Priorität
(`priority`), Vertrauensniveau (`trust`), Aktualität (`expectedFrequency`), Health-Status
(`health`), letzter Erfolg (`health.lastSuccessAt`), Lizenz/Nutzungsstatus (`license`/`status`).

- **Normalisierung** faltet Umlaute, sluggt Themen/Regionen, normalisiert Partei/Ausschuss
  (Wiederverwendung von `matching.js`), vereinheitlicht Methoden-Aliase (`googlenews_search`→`search`).
- **Kanonischer Schlüssel** (`canonicalKey`) macht physisch identische Quellen deckungsgleich:
  Methode+Herausgeber-Domain+bereinigte URL, für Suchen Provider+`site:`-Domain/Query. www und
  Tracking-Parameter fallen weg. Das ist die Grundlage für globale Dedup und Discovery.
- **Validierung** erzwingt den Vertrag: Herausgeber, Abrufweg, mindestens EINE
  Zuordnungsdimension (oder `universal`). Unvollständiges (Lizenz/Vertrauen/Parser/Aktualität
  unbekannt) ist eine **Warnung**, kein Fehler — Discovery/Anreicherung zieht nach.

## 4. Automatische Quellenzuweisung (§3) — der Kern

Ersetzt `resolveProfilePackages` + alle Sonderfälle aus S1/S2.

```
Mandatsregister ──deriveRequirement──▶ MandateRequirement (WAS braucht das Mandat)
                                         │
Registry (alle Quellen) ──Index──▶ Kandidaten ──scoreSource──▶ relevante Quellen (Score+Begründung)
```

- **`deriveRequirement(profile)`** bildet rein aus Mandatsdaten ein Anforderungsprofil
  (Ebene, Parteien, Fraktionen, Ausschüsse, Themen, Regionen, Ministerien). Es kennt KEINE
  Quelle. Bundesland wird zur Region; Ausschuss+Thema werden zum **Politikfeld** verschmolzen.
- **Politikfeld-Brücke** löst die alte `SOCIAL_TERMS`-Schuld ohne Wortliste: die Mitgliedschaft
  im Ausschuss „Arbeit und Soziales" matcht eine Fachquelle mit `topic:"arbeit-und-soziales"`,
  weil beide auf denselben normalisierten Schlüssel fallen.
- **`scoreSource(desc, req)`** wertet die Überschneidung je Dimension mit transparenten
  Gewichten (Fraktion 5 > Partei 4 > Politikfeld 3 = Ministerium 3 > Region 2), plus feste
  Basiswertung für universale Grundversorgung und Priorität als Tie-Breaker. Jede Zuweisung
  trägt ihre **Begründung** (`reasons`) — nachvollziehbar.
- **Regionsschutz ohne Länder-Hardcode:** eine land-/kommunenbezogene Quelle ohne
  Regionstreffer ist nicht relevant (ein bayerisches Regionalmedium landet nie bei einem
  niedersächsischen Mandat) — allein über Datenabgleich, keine Länderliste.
- **Global genau einmal:** `computeGlobalAssignment` bildet über N Mandate die Vereinigung;
  jede Quelle erscheint einmal mit `refCount` (100 gleiche Mandate ⇒ 1×). Universale Quellen
  laufen immer (always_on). Unbrauchbare/deaktivierte Mandate tragen nicht bei.

**Effekt:** Eine neue Partei/ein neues Land/ein neues Thema wird versorgt, sobald eine
Quelle mit den entsprechenden Feldern in der Registry liegt — **ohne Codeänderung**.

## 5. Qualitätsmodell (§4)

`scoreSourceQuality(desc, metrics)` liefert acht getrennte 0..1-Achsen mit je einer
Begründung und einem Verfügbarkeits-Flag; der Gesamtscore ist das **gewichtete Mittel der
verfügbaren Achsen** (fehlende werden weggelassen, nicht als 0 erfunden):

| Achse | Grundlage |
|---|---|
| Autorität | Belegfunktion × Vertrauensniveau (Deskriptor, immer verfügbar) |
| Aktualität | Alter des jüngsten Ertrags ggü. erwarteter Frequenz |
| Relevanz | KO-Ausbeute (Knowledge Objects / Dokumente) |
| Stabilität | Health-Zustand + Fehlerserie |
| Ausfallhäufigkeit | beobachtete Erfolgsquote (Erfolge/Versuche) |
| Einzigartigkeit | Anteil nicht-duplizierter Beiträge |
| Geschwindigkeit | letzte Latenz ggü. Schwellen |
| Redundanz | Zahl gleichwertiger Ersatzquellen (Ausfallsicherheit) |

Die Erklärungszeilen (`explanation`) und ausgewiesenen `weights` machen das Urteil
vollständig prüfbar. Metriken werden injiziert (aus echten Reads oder dem Health-Record).

## 6. Gesundheitsmotor (§5)

`health-engine.js` ist eine deterministische Zustandsmaschine mit injizierter Uhr. Sie
faltet **Beobachtungen** (`HealthObservation`: httpStatus, latencyMs, parserOk, rateLimited,
disabled, at) zu einem laufend fortgeschriebenen `HealthRecord`:

- Zustände: **erreichbar / langsam / defekt / Parserfehler / Rate Limit / HTTP-Fehler /
  nie geprüft / deaktiviert** — plus `errorStreak` (Fehlerserie) und `lastSuccessAt` (letzter Erfolg).
- **Momentaufnahme vs. Serie:** eine einzelne Beobachtung ergibt den akuten Zustand; erst eine
  **Fehlerserie ≥ Schwelle** eskaliert zu `broken`. Ein transienter 429 ist damit nicht sofort
  „defekt", eine Serie schon. Ein Erfolg heilt und setzt die Serie zurück.
- **Deaktivierung ist kein Fehler** (erhöht die Serie nicht). Lange kein Erfolg trotz Prüfung
  → `needsAttention`. `summarizeHealth` liefert den Flottenüberblick für Admin/Discovery.

Das ersetzt den statischen CSV-/Katalogzustand durch echte, fortschreibbare Telemetrie.

## 7. Discovery-Strategie (§6)

`discovery.js` beantwortet die fünf Auftragsfragen mit reiner Logik + injizierten Providern
(kein Netz — echte Fund-Provider werden außerhalb adaptiert):

- **Neue Quellen finden** — `intakeCandidates(registry, providers)`: sammelt Kandidaten,
  normalisiert/validiert, entfernt Bestands- und Provider-übergreifende Dubletten (canonicalKey),
  vermerkt den Fundweg. Ein abstürzender Provider bricht den Intake nicht ab.
- **Veraltete Quellen erkennen** — `findStaleSources`: kein Erfolg seit Frist / dauerhaft
  defekt / archiviert / nutzungsverboten — rein aus Health+Status, keine statische Liste.
- **Doppelte Quellen erkennen** — `findDuplicateClusters`: harte Dubletten (identischer
  canonicalKey) + Redundanz-Hinweise (gleicher Herausgeber+Methode).
- **Defekte Quellen ersetzen** — `proposeReplacements`: gleichwertige GESUNDE Kandidaten mit
  überlappenden Zuordnungsdimensionen, nach Überlappungsgüte sortiert; kranke Ersatzquellen raus.
- **Qualitätsverlust verhindern** — `guardQualityLoss`: ein Austausch ist nur „sicher", wenn
  keine Zuordnungsdimension ersatzlos wegfällt, der Qualitätsscore nicht (nennenswert) sinkt und
  das Vertrauensniveau nicht abstürzt.

## 8. Skalierbarkeit ohne Umbau (§7)

Die Architektur ist **ebenen- und entitätsagnostisch** — dieselben Felder tragen jeden Träger:

| Träger | Wie er ohne Umbau passt |
|---|---|
| Bundestag | `level:"bund"`, universale Grundversorgung + Fach/Partei/Region |
| Bundesrat | `level:"bund"`, `evidenceRole:"official_primary"`, Länderkammer-Themen |
| Landtage | `level:"land"` + `regions:[<bundesland>]` — jedes Land ist nur ein Datensatz, kein Code |
| Ministerien/Behörden | `ministries`/`committees` + `evidenceRole:"data_source"/"official_primary"` |
| Parteien/Fraktionen | `parties`/`factions` + `evidenceRole:"direct_interest"` |
| Kommunen | `level:"kommune"` + `regions`/`geographyId` (Wahlkreis/AGS) |
| EU (später) | `level:"eu"`/`"international"` — bereits im Enum, kein Sondermodell |

Neue Träger = neue Deskriptoren (Daten/Discovery), nicht neuer Code. Die dimensionalen
Indizes halten die Zuweisung auch bei tausenden Quellen in O(Treffer).

## 9. Brücke zur bestehenden `quellenarchitektur/` (kein Bruch)

Die Bibliothek ist die **Fabrik-/Logikschicht**; die relationale `quellenarchitektur`
(publishers/retrieval_paths/source_packages/package_paths) bleibt die **Persistenz- und
aktive Crawl-Wahrheit**. Ein späterer, freigabepflichtiger Adapter kann:

- `retrieval_paths` (+`path_expected_*`) verlustfrei in `SourceDescriptor` abbilden (die Felder
  existieren bereits) und zurück;
- den Gesundheitsmotor an die real gemessene Crawl-Telemetrie (`source_crawl_telemetry`,
  Migration 20260718) hängen, um `retrieval_paths.last_success_at` endlich zu befüllen;
- die Laufzeit-Zuweisung schrittweise als Shadow gegen die Paket-Aktivierung vergleichen,
  bevor die Paketebene abgelöst wird.

Bis dahin ändert Sprint 2 **nichts** am Betrieb — die Bibliothek ist additiv und wird erst
nach ausdrücklicher Freigabe verdrahtet.
