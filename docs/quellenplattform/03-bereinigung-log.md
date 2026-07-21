# Bereinigung — Log & Ablöseplan (Aufgabe 8)

**Grundsatz eingehalten:** *Keine aggressive Löschung. Keine stillen Architekturänderungen.
Bei Unsicherheit stoppen und fragen.* In diesem Sprint wurde **nichts physisch entfernt** —
die konsolidierte Plattform ist additiv und dormant. Dieses Log dokumentiert, was **superseded**
(abgelöst) ist, warum es (noch) nicht gelöscht wurde, und den sicheren Rückweg.

## Was wurde entfernt?

**Nichts.** Alle Bestands- und Sprint-Module bleiben physisch erhalten. Begründung: die
Löschkandidaten berühren getestete Module bzw. Sprint-3-interne Verdrahtung — das fällt unter
„bei Unsicherheit stoppen und fragen" und benötigt Freigabe (siehe unten).

## Superseded-Analyse (was die Konsolidierung ablöst)

| Modul | Ersetzt durch | Tests belegen Gleichwertigkeit | Noch Importierende? | Rückweg | Empfehlung |
|---|---|---|---|---|---|
| S2 `quellenbibliothek/assignment.js` (`deriveRequirement` = zweite Mandatsableitung) | `quellenplattform/assignment.js` (`buildRequirement` aus S1) | `quellenplattform-mandat-test`, `-zuweisung-versorgung-test` | **nur eigene Tests** (`quellenbibliothek-assignment-test.js`) | git revert | **entfernbar nach Freigabe** |
| S2 `quellenbibliothek/quality.js` | `quellenplattform/quality-model.js` (10 Achsen) | `quellenplattform-gesundheit-qualitaet-test` | nur eigener Test | git revert | entfernbar nach Freigabe |
| S2 `quellenbibliothek/health-engine.js` (8 Zustände) | `quellenplattform/health-model.js` (10, via Mapper) | `-gesundheit-qualitaet-test` | nur eigener Test | git revert | entfernbar nach Freigabe |
| S2 `quellenbibliothek/{registry,descriptor,types,parsers,discovery,index}.js` | S3 `master/*` + `quellenplattform/runtime-source.js` | `quellenmodell-test` | nur eigene Tests | git revert | entfernbar nach Freigabe |
| S2 `index.js` `createLibrary` (tote Fassade) | — | — | niemand | git revert | entfernbar nach Freigabe |

### Wichtige Nicht-Löschungen (bewusst behalten)

- **S3 `master/*`** (`model`, `source-record`, `taxonomy`, `supply-standard`, `tenant-scope`, `coverage-matrix`,
  `health`, `assignment`, `intake-pipeline`, `acquisition`, `adapter`, `shadow-compare`, seeds): **Fundament**
  der Konsolidierung — vielfach **wiederverwendet**, nicht abgelöst. `master/assignment.js`/`master/health.js`
  sind zwar teilweise überlappend, aber **Sprint-3-intern** von `master/index.js` (Katalogaufbau) genutzt und
  bilden dort einen anderen Zweck (Quelle→Paket-Klassifikation des Seeds) ab → **behalten**.
- **main** `quellenarchitektur/*`, `profile-packages.js`, `matching.js`, `tenant-context.js`, Migrationen:
  Live-/Kompatibilitätsschicht → **unverändert behalten** (Aufgabe 4 / Sicherheitsregeln).

## Zusammenfassung der Prüf-Fragen (Aufgabe 8)

1. **Was wurde entfernt?** — nichts (konservativ, freigabepflichtig).
2. **Was ersetzt es?** — die konsolidierte Plattform `quellenplattform/*` (siehe Tabelle).
3. **Welche Tests belegen Gleichwertigkeit?** — die 5 `quellenplattform-*-test.js`-Suiten (105 Prüfungen, grün).
4. **Gibt es noch Importierende?** — S2 `quellenbibliothek/*`: **keine außerhalb der eigenen Tests**
   (verifiziert per grep). S3 `master/assignment|health`: **Sprint-3-intern** (behalten).
5. **Gibt es einen Rückweg?** — ja, vollständig: nichts wurde gelöscht; jeder spätere Schritt ist ein `git revert`.

## Empfohlener nächster Schritt (freigabepflichtig, **nicht** in diesem Sprint ausgeführt)

Physische Entfernung des vollständig abgelösten Moduls **S2 `lib/helmut/quellenbibliothek/`** (9 Dateien)
**samt seinen 5 Tests** (`scripts/quellenbibliothek-*-test.js`) und Rücknahme des zugehörigen
`ci.yml`-Syntax-Globs. Voraussetzung erfüllt (Ersatz implementiert + getestet, keine externen Importierenden);
zurückgehalten nur wegen „keine aggressive Löschung / bei Unsicherheit fragen". **Wartet auf Freigabe.**
