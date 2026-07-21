# Pakete → Kompatibilität: sicherer Ablöseplan (Aufgabe 4)

**Grundsatz:** Der globale Master-Quellenkatalog (Sprint 3) ist die einzige Quellenwahrheit.
Ein „Quellenpaket" ist künftig **nur noch das dynamisch erzeugte Ergebnis** des Versorgungsplans
für ein konkretes Mandat zu einem konkreten Zeitpunkt (`quellenplattform/supply-plan.js`).
**Es wird nichts produktiv entfernt.** Die bestehenden Paket-Strukturen bleiben zunächst als
Kompatibilitätsschicht.

## Betroffene Legacy-Komponenten (bleiben vorerst unverändert)

| Komponente | Rolle heute | Status nach Konsolidierung |
|---|---|---|
| `source_packages` (Tabelle) | kuratierte Pakete | **Kompatibilitätsschicht** — bleibt, keine neue verbindliche Produktlogik |
| `package_paths` (Tabelle) | Abrufwege je Paket | **Kompatibilitätsschicht** — bleibt |
| `profile_packages` (Tabelle) | Paketzuweisung je Profil | **Kompatibilitätsschicht** — bleibt |
| `lib/helmut/quellenarchitektur/seeds/packages.js` | Paket-Seeds | bleibt (lesend über Adapter) |
| `lib/helmut/quellenarchitektur/profile-packages.js` | Paket-Resolver (`resolveProfilePackages`) | bleibt (lesend über Adapter) |

## Garantien

1. **Bestehende Produktion läuft unverändert** — keine dieser Dateien/Tabellen wurde geändert;
   `resolveProfilePackages` liefert weiterhin identische Ergebnisse (Test `quellenplattform-tenant-dsgvo-test.js` §20).
2. **Keine neuen dauerhaften Pakete** — der Versorgungsplan ist ein reines Laufzeitobjekt ohne Persistenz
   (`legacyPackages.assertNoNewPersistentPackages` → `persistentPackagesCreated: 0`).
3. **Legacy lesbar über Adapter** — `quellenplattform/legacy-packages.js`:
   - `readLegacyPackages(profile)` — liest die Legacy-Paketauswahl (unverändert).
   - `legacyPackageMeta(key)` — Paket-Metadaten.
4. **Shadow-Vergleich** — `shadowComparePlanVsLegacy(profile, catalog)` stellt den dynamischen Plan
   den Legacy-Paketen auf **Versorgungsebenen-Ebene** gegenüber und meldet Divergenzen
   (`legacyRequiresButPlanUnassigned`, `planCoversBeyondLegacy`, `planCoversAllLegacyRequired`).
5. **Spätere Abschaltung ohne Datenverlust** — da der dynamische Plan die Quellen **direkt** aus dem
   globalen Katalog referenziert (nicht aus Paketen), können die Paket-Tabellen später entfernt werden,
   ohne Quellen- oder Mandatsdaten zu verlieren.

## Ablösestufen (Vorschlag, jeweils freigabepflichtig — **nichts davon in diesem Sprint**)

- **Stufe 0 (jetzt, erledigt):** dynamischer Plan gebaut + getestet; Legacy unverändert; Shadow verfügbar.
- **Stufe 1:** Shadow-Vergleich über den realen Bestand fahren (offline, gegen exportierte Daten),
  Divergenzen prüfen. Kein Schreibzugriff.
- **Stufe 2:** dynamischen Plan im Read-Path parallel berechnen (Dark-Launch), weiterhin Legacy ausliefern.
- **Stufe 3:** nach Parität den Read-Path auf den dynamischen Plan umstellen; Paket-Tabellen nur noch lesend.
- **Stufe 4:** Paket-Seeds/Resolver/Tabellen entfernen (eigener, freigabepflichtiger Schritt mit Backup/PITR).

## Bekannte Divergenz (ehrlich)

Die alte Paketlogik trägt hartkodierte Sonderfälle (`profile-packages.js`: `=== "linke"`,
`LANDESPAKET_BY_BUNDESLAND`, Sozial-Themen-Heuristik). Der dynamische Plan ersetzt diese durch
**datengetriebene** Zuweisung (Match über Entity-IDs/Slugs, keine Partei-/Ausschuss-Literale — Test §18).
Ergebnisse können daher bewusst abweichen; der Shadow-Vergleich macht das sichtbar, bevor umgestellt wird.
