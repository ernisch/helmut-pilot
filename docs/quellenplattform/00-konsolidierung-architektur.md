# Quellenplattform — Konsolidierung Sprint 1–3

**Branch:** `integration/quellenplattform-konsolidierung` (aus `integration/quellenplattform-sprints-1-3`)
**Charakter:** additiv, **dormant** (nicht produktiv verdrahtet), keine Migration ausgeführt, keine Live-Datei verändert.
**Neues Modul:** `lib/helmut/quellenplattform/` — die **eine verbindliche Quellenplattform**.

---

## 1. Verbindliche Wahrheiten (beschlossen)

| Belang | Verbindliche Wahrheit | Herkunft |
|---|---|---|
| Mandat (Identität/Partei/Fraktion/Ausschüsse/Funktionen/Themen/Region/Vollständigkeit/Registerreife) | `lib/helmut/mandate-register.js` `resolveMandate()` | **Sprint 1** — einzige Profil→Anforderungs-Ableitung |
| Kanonisches Quellenmodell / Master-Katalog | `lib/helmut/quellenarchitektur/master/*` + Laufzeitprojektion `quellenplattform/runtime-source.js` | **Sprint 3** |
| Dynamische Zuweisung | `quellenplattform/assignment.js` (Logik aus **Sprint 2** portiert, auf S3-Modell) | konsolidiert |
| Laufzeit-Versorgungsplan | `quellenplattform/supply-plan.js` | konsolidiert |
| Gesundheitsmodell (10 Zustände) | `quellenplattform/health-model.js` | konsolidiert (main/S2/S3 → ein Vokabular) |
| Qualitätsmodell (10 Achsen) | `quellenplattform/quality-model.js` | konsolidiert (S2-Ehrlichkeit erweitert) |
| Tenant-Trennung / RLS / privat vs. global | `lib/helmut/quellenarchitektur/master/tenant-scope.js` | **Sprint 3** |
| Pakete | **nur noch Laufzeitergebnis** des Versorgungsplans; Legacy als Kompatibilitätsschicht | konsolidiert |

## 2. Zielablauf (dynamisch, kein dauerhaftes Paket)

```
Mandatsprofil
  → resolveMandate() (Sprint 1: einzige Mandatswahrheit)
  → buildRequirement() (Versorgungsbedarf: Partei/Fraktion/Ausschuss/Politikfeld/Ministerium/Region)
  → Master-Katalog-Abfrage (Sprint 3: globale Quellen + eigene private Tenant-Quellen, per Referenz)
  → assignSources() (dynamische, gewichtete, nachvollziehbare Auswahl — Logik aus Sprint 2)
  → Laufzeit-Versorgungsplan (gewählt / Ebene / Kriterien / Relevanz / Alternativen / ausgeschlossen / Lücke)
  → Gesundheitsprüfung (health-model, global-technisch)
  → Qualitätsprüfung (quality-model, unbekannt ≠ negativ)
  → Coverage-Ergebnis (supply-standard: vollständig / eingeschränkt / blockiert)
```

Ein „Paket" ist damit **das Laufzeitergebnis für ein konkretes Mandat zu einem konkreten Zeitpunkt** —
keine dauerhaft gespeicherte Liste. Globale Quellen werden **nie pro Mandant kopiert**, sondern per ID referenziert.

## 3. Komponentenmatrix (Aufgabe 1)

Legende Sieger: **P**=Quellenplattform (konsolidiert) · S1/S2/S3/main.

| # | Bereich | Bestehende Implementierungen | Sieger | Wiederverwendete Teile | Zu entfernende Doppelung | Übergangsabhängigkeit | Risiko |
|---|---|---|---|---|---|---|---|
| 1 | Mandatsauflösung | S1 `mandate-register`; S2 `assignment.deriveRequirement` | **S1** | S1 vollständig | S2 `deriveRequirement` (zweite Ableitung) | keine | niedrig |
| 2 | Quellen-Deskriptor | main `model`; S2 `descriptor/types`; S3 `source-record` | **S3** (+ `runtime-source`) | S3 `buildSourceRecord`/Enums; S2 canonicalKey-Idee | S2 `types/descriptor` als Parallelmodell | main-Persistenz bleibt | mittel |
| 3 | Quellen-Registry | main `catalog`/`dedup-global`; S2 `registry` | **main + S3** | S3 `dedupeCandidates`; main Persistenz | S2 `registry` (zweiter Store) | main-Tabellen | mittel |
| 4 | Master-Katalog | S3 `master/*` | **S3** | vollständig | — | prepared-Migration nicht ausführen | niedrig |
| 5 | Zuweisung | main `profile-packages`; S2 `assignment`; S3 `master/assignment` | **P** `assignment` | S2 Match-Dimensionen/Score; S1 Bedarf; S3 Katalog | S2/S3-Zuweisung als binden­de Logik | Pakete → Laufzeit | mittel |
| 6 | Qualitätsbewertung | main `quality-watchdog`; S2 `quality` | **P** `quality-model` | S2 Achsen + Ehrlichkeit; Watchdog als Betriebs­sicht | S2 `quality` als Parallelmodell | — | niedrig |
| 7 | Gesundheitsstatus | main `nextPathStatus`(6); S2 `health-engine`(8); S3 `health`(4) | **P** `health-model`(10) | alle drei via Mapper | drei Vokabulare | Telemetrie global | niedrig |
| 8 | Discovery/Intake | S2 `discovery`; S3 `acquisition/intake-pipeline` | **S3** (+ P-Bedarf) | S3 Intake-FSM; S2 stale/replace als Folgeschritt | S2 `discovery` doppelt | Sieger-Quellmodell | mittel |
| 9 | Parser-Registry | S2 `parsers` | **S2-Idee** (Folgeschritt) | Parser-Registrierungsmuster | — | an Abrufweg koppeln | niedrig |
| 10 | Coverage | S3 `coverage-matrix`/`supply-standard` | **S3** | `evaluateSupply` im Plan | — | — | niedrig |
| 11 | Tenant-Trennung | main `tenant-context`; S3 `tenant-scope` | **main + S3** | S3 7-Schichten + `helmut_current_tenant()` | — | RLS nicht ändern | niedrig |
| 12 | Persistenz | main relational (live); S3 prepared | **main (live)** | main bleibt; S3 vorbereitet (nicht angewendet) | — | Migration nie automatisch | hoch (nur bei Aktivierung) |
| 13 | Pakete | main `source_packages`/`package_paths`/`profile_packages` | **nur Laufzeit** | Legacy als Kompatibilitätsschicht (lesend) | keine neuen dauerhaften Pakete | Ablöseplan (Doc 01) | niedrig |
| 14 | Legacy-Adapter | S3 `adapter`; P `legacy-packages` | **P** `legacy-packages` (Shadow) | S3 Adapter-Muster | — | Shadow-Vergleich | niedrig |

## 4. Modulüberblick `lib/helmut/quellenplattform/`

| Datei | Aufgabe | Baut auf |
|---|---|---|
| `runtime-source.js` | kanonisches Laufzeit-Quellobjekt (20 Attribute, Sichtbarkeit, Health/Quality-Overlay) | S3 `source-record`/`model`/`taxonomy` |
| `health-model.js` | 10-Zustands-Gesundheit + Mapper (main/S2/S3) + FSM | — |
| `quality-model.js` | 10-Achsen-Qualität; unbekannt ≠ negativ | S3 `taxonomy`/`model`, `health-model` |
| `assignment.js` | Bedarf aus S1-Mandat + gewichtete, nachvollziehbare Auswahl | S1 `mandate-register`, main `matching`, S3 `model`/`taxonomy` |
| `supply-plan.js` | Laufzeit-Versorgungsplan + Coverage | S3 `supply-standard`, `assignment`, `quality-model` |
| `legacy-packages.js` | Legacy-Paket-Adapter (lesend) + Shadow-Vergleich | main `profile-packages`/`seeds/packages`, `supply-plan` |
| `index.js` | Fassade + End-to-End `planSupplyForMandate()` | alle obigen + S3 `tenant-scope`, S1 |

## 5. Tests (Aufgabe 9)

`scripts/quellenplattform-*-test.js` (5 Suiten, vom Offline-Runner automatisch erfasst):
`mandat`, `quellenmodell`, `zuweisung-versorgung`, `gesundheit-qualitaet`, `tenant-dsgvo` —
decken die 20 geforderten Bereiche ab. Fixture: `scripts/quellenplattform-fixture.js` (kein Test).

## 6. Sicherheitsregeln eingehalten

Keine Produktionsänderung · kein Deployment · **keine Migration ausgeführt** · kein Schreiben in
Produktionsdaten · keine Crawls/Crons/Locks/Auth/RLS geändert · **kein Merge nach main** · kein PR.
Alle Live-Dateien (`server.js`, `quellenarchitektur/model.js`, `tenant-context.js`, `profile-packages.js`,
`matching.js`, bestehende Migrationen) bleiben unverändert; das neue `quellenplattform/`-Modul ist nirgends
in Scheduler/Server/Crawler eingehängt.
