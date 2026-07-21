# Quellenplattform — Architektur-Konsolidierung

**Branch:** `architecture/quellenplattform-konsolidierung`
**Basis:** `integration/quellenplattform-sprints-1-3` @ `9c52bbb` (= `main` @ `d6d9063` + Sprint 1/2/3 + Audit)
**Stand:** 2026-07-21
**Charakter:** **entschiedene, additive Konsolidierung** — die im Integrationsaudit offen gelassenen
Architekturfragen werden gemäß dem verbindlichen Auftrag entschieden und in einer **dormanten,
getesteten** Konsolidierungsschicht verdrahtet. Keine Live-/Produktionsdatei wird verändert, keine
Migration ausgeführt, kein Merge nach `main`.

---

## 0. Auftragskorrektur — warum diese Konsolidierung

Der vorherige Auftrag lautete **Architektur-Konsolidierung**, gebaut wurde jedoch ein **Dark Launch**.
Dieses Dokument liefert (1) die geforderte Herkunftsdiagnose des Dark-Launch-Branches und (2) die
tatsächliche Konsolidierung auf dem korrekten Integrationsstand.

---

## 1. Phase 1 — Herkunftsdiagnose des Dark-Launch (eindeutig)

**Frage:** Stammt `claude/dark-launch-quellenplattform-s8ge3a` vom richtigen Integrationsbranch ab?
**Antwort: NEIN — der Dark Launch wurde direkt auf `main` gebaut, nicht auf dem Integrationsbranch.**

| Fakt | Wert |
|---|---|
| `main` HEAD | `d6d9063` |
| `integration/quellenplattform-sprints-1-3` HEAD | `9c52bbb` (= `main` + **10 Commits**) |
| `claude/dark-launch-quellenplattform-s8ge3a` HEAD | `075b1fb` (= `main` + **1 Commit**) |
| merge-base(integration, dark-launch) | `d6d9063` = **main** (nicht integration) |
| Ist `integration` Vorfahr von `dark-launch`? | **NEIN** (`git merge-base --is-ancestor` = false) |
| Gemeinsame Sprint-Commits integration ∩ dark-launch | **0** |

**Belegkette:**
1. **Gemeinsame Merge-Basis** von Integration und Dark Launch ist `d6d9063` = der aktuelle `main`-HEAD.
   Läge der Dark Launch auf dem Integrationsbranch, wäre die Merge-Basis ein Commit *auf* Integration.
2. **Enthaltene Commits:** Integration trägt 10 Commits (Sprint 1 ×2, Sprint 2 ×1, Sprint 3 ×2,
   Review-Fixes ×3, Audit ×1, Angleichung ×1). Der Dark-Launch-Branch trägt **genau 1** Commit
   (`075b1fb Sprint 4: Dark Launch`).
3. **Sprint 1/2/3 im Dark Launch?** **Nein.** Auf dem Dark-Launch-Branch fehlen vollständig:
   - `lib/helmut/quellenbibliothek/*` (Sprint 2, 9 Module)
   - `lib/helmut/quellenarchitektur/master/*` (Sprint 3, ~22 Module)
   - `lib/helmut/quellenarchitektur/seeds/mandate-registry.js` (Sprint 1)
   - 9 Testsuiten: `mandate-register-test`, `master-catalog-{,tenant-,migration-}test`,
     `quellenbibliothek-{assignment,descriptor,discovery,health,quality}-test`.
4. **Warum wurden dort nur 140 Basistests erkannt?** Der Offline-Runner sammelt `scripts/*-test.js`
   automatisch ein. `main` hat **140** Suiten; Integration fügt die **9** Sprint-Suiten hinzu → **149**.
   Der Dark-Launch-Branch (auf `main`) hat 140 + seine eigene `dark-launch-test.js` = **141**. Sein
   Bericht nennt selbst „Baseline 140" — das ist die reine `main`-Basis und der direkte Beweis, dass
   Sprint 1–3 dort nie vorlagen. Gemessen (`run-offline-tests.js --list`): integration **149**,
   dark-launch **141**.
5. **Auf veraltetem `main` gebaut?** Nicht „veraltet" im Sinne von zurückliegend — `main`-HEAD ist
   `d6d9063` — sondern auf `main` **statt** auf Integration. Der Effekt ist identisch: die gesamte
   Sprint-1/2/3-Arbeit fehlt.
6. **Fehlende Dateien/Tests aus dem Integrationsbranch:** ja, exakt die unter (3) genannten.

**Verifiziert:** `integration/quellenplattform-sprints-1-3` läuft **149/149 Offline-Suiten grün**
(Exit 0; der `[NETZ-GUARD]`-Hinweis zu `pardok-shadow-test.js` ist Bestand aus `main`, kein Regress).

---

## 2. Phase 2 — Bewertung des Dark Launch (isolierter Prototyp)

Der Dark Launch wird als **isolierter Prototyp** behandelt. Er wird **nicht verworfen**, **nicht
automatisch cherry-gepickt**, **nicht produktiv aktiviert**; **Sprint 5 wird nicht begonnen**.

**Technischer Befund:** `lib/helmut/quellenarchitektur/dark-launch.js` importiert **ausschließlich
Basis-`main`-Module** (`../flags`, `./model`, `../matching`, `./supply-shadow-compare`,
`./profile-packages`) — **keinen** Sprint-1/2/3-Baustein. Sein „neuer Plan" stützt sich auf das
**Legacy-`profile-packages`-Modell** (injizierte `newSources` + `resolveProfilePackages`), und er
bringt **eigene, duplizierte** Health-/Quality-/Coverage-Vergleichslogik über 13 Dimensionen mit.

**Bewertung, welche Teile später gefahrlos übernehmbar sind:**

| Dark-Launch-Baustein | Wert | Später übernehmbar? |
|---|---|---|
| Shadow-Compare-Muster (Legacy ∥ Neu, nur Legacy sichtbar) | hoch | **Ja, als Muster** — nach Umverdrahtung auf den Laufzeit-Versorgungsplan (Kap. 4) statt auf `profile-packages`. |
| Difference-Report mit Begründung je Unterschied (`blackBox:false`) | hoch | Ja, als Muster. |
| Telemetrie mit PII-Allowlist (`telemetryIsPiiClean`) | hoch | Ja — deckt sich mit der DSGVO-Schicht (Kap. 4 §9). |
| Abbruchregeln (`autoActivateNewAllowed` strukturell false) | hoch | Ja — als Sicherheitsnetz für Sprint 5. |
| Eigene Health-/Quality-/Coverage-Vergleichslogik (13 Dim.) | **Duplikat** | **Nein as-is** — ersetzt durch die kanonischen Einzelmodelle (Kap. 4 §5/§6). |
| `computeMandateShadow` gegen `profile-packages` | falsche Bezugsebene | **Nein as-is** — muss gegen den S3-Katalog + Laufzeitplan laufen. |

**Verdikt:** wertvolles Harness-**Muster**, aber **nicht as-is integrierbar** — falsche Basis
(`main` statt Integration) **plus** Duplikat-Modelle. Eine spätere Integration ist gefahrlos möglich,
sobald der Harness auf die hier konsolidierte Architektur umverdrahtet und seine Duplikat-Modelle
durch die kanonischen Einzelmodelle ersetzt sind.

---

## 3. Verbindliche Zielarchitektur (Auftrag Phase 3)

Diese Konsolidierung entscheidet die offenen Fragen des Integrationsaudits (§6) verbindlich:

1. **Sprint 1** (`seeds/mandate-registry.js`) ist die **einzige Mandatswahrheit** (abgeleitet über `mandate_profiles`).
2. **Sprint 3** (`quellenarchitektur/master/*`) ist der **einzige globale Master-Quellenkatalog**.
3. **Sprint 2** (`quellenbibliothek/*`) liefert **dynamische Auswahl, Gewichtung, Discovery und Parser-Logik**.
4. Dauerhaft **gespeicherte Quellenpakete** werden **nicht** die neue Architektur.
5. Ein **Paket** ist künftig nur ein **dynamisch erzeugter Laufzeit-Versorgungsplan** (nicht persistiert).
6. **Bestehende Pakettabellen** bleiben **vorübergehend** als Kompatibilitätsschicht.
7. Es darf nur **ein Gesundheitsmodell** geben.
8. Es darf nur **ein Qualitätsmodell** geben.
9. **Globale Quellen** werden **nicht pro Mandant kopiert** (Referenz).
10. **Private Quellen** bleiben strikt nach Tenant getrennt.

Das Manifest ist maschinell geprüft: `lib/helmut/quellenarchitektur/konsolidierung.js:ARCHITECTURE`
(Test `scripts/konsolidierung-architektur-test.js`, Fälle M1–M8).

---

## 4. Phase 4 — Komponentenmatrix (12 Komponenten)

Legende: **Verbindlich** = die eine Wahrheit · **Übernommen** = adaptierte Teile · **Doppelung** ·
**Legacy-Übergang** · **Risiko** · **Tests**. Die Konsolidierung ist **additiv**: sie baut die
verbindlichen Entscheidungen als neue, dormante Schicht (`konsolidierung*.js`) und entfernt nur
**mechanisch sichere** Doppelungen (Kap. 5).

### 1. Mandatsauflösung
- **Verbindlich:** `seeds/mandate-registry.js` (Sprint 1) als abgeleitetes Read-Model über `mandate_profiles`.
- **Übernommen:** Ausschuss→Politikfeld/Ministerium/Themen-Relationen (Obermenge). Ebene zentral aus `config.parliamentTypeOf`.
- **Doppelung:** `mandate-registry.COMMITTEE_RELATIONS.policyField` überlappt `matching.POLICY_FIELD_LABELS` (~22 Keys).
- **Legacy-Übergang:** keiner nötig — `mandate_profiles` ist bereits die einzige Schreibwahrheit.
- **Risiko:** die policyField-Dedup berührt die **Live-Datei** `matching.js` → **nicht** angefasst; die beiden Karten werden zudem von **verschiedenen** Nachschlagefunktionen adressiert (`normalizeCommittee` mit der akzeptierten `menschenrechte→recht`-Kollision auf dem Live-Ranking-Pfad vs. kollisionssicherem `committeeMatchKey`) — ein Zusammenlegen der Pfade würde das Live-Ranking verschieben.
- **Tests:** `mandate-register-test.js` (Bestand) + Manifest-Fall M1 + **neu** `mandate-policyfield-consistency-test.js` (Drift-Guard, siehe Kap. 5).

### 2. Quellenmodell
- **Verbindlich:** `master/model.js` + `master/source-record.js` (Sprint 3, 20-Attribut-Record, kanonischer Dedup-Schlüssel).
- **Übernommen:** `../model`-Enums (Wiederverwendung statt Parallelmodell); S2-`descriptor` ist eine **Laufzeit-Sicht**, kein persistiertes Modell.
- **Doppelung:** `master/model.js:TRUST_LEVELS` redeklariert `../model.TRUST_LEVELS`; `master/taxonomy.js:EVIDENCE_ROLES` redeklariert `../model.EVIDENCE_ROLES`.
- **Legacy-Übergang:** `main` `source_architecture` bleibt Schreibbasis; S3-Neu-Teile additiv daneben (nicht als paralleles aktives Schema).
- **Risiko:** gering — beide Enum-Doppelungen sind wertgleich und getestet.
- **Tests:** `master-catalog-test.js` (Bestand) + Kap. 5 Äquivalenzprüfung.

### 3. Registry
- **Verbindlich:** `master/index.js` (Sprint-3-Katalog) als Registry of record; die S2-`SourceRegistry` ist die **Laufzeit-Zuweisungs-Registry** (In-Memory-Index) über den Katalog.
- **Übernommen:** globale Dedup + dimensionale Indizes (S2), Katalogaufbau + Seeds (S3).
- **Doppelung:** `quellenbibliothek/index.js:createLibrary` war ein **toter** Export.
- **Legacy-Übergang:** `catalog.js` (Alt-Mapper) bleibt unverändert dormant.
- **Risiko:** S2-Registry ist **tenant-blind** → nur In-Memory-Laufzeit, nie Persistenz (Kap. 11/10 regelt die Trennung).
- **Tests:** `master-catalog-test.js`, `quellenbibliothek-descriptor-test.js` (Bestand); der tote `createLibrary` wird **verdrahtet** (statt entfernt) in `konsolidierung-versorgungsplan.js` und durch `konsolidierung-versorgungsplan-test.js` abgedeckt.

### 4. Zuweisung
- **Verbindlich:** `quellenbibliothek/assignment.js` (Sprint 2) — kriterienbasierte, dynamische Zuweisung; das „Paket" ist das **Laufzeitergebnis**.
- **Übernommen:** `deriveRequirement` (Mandat→Anforderung), `assignSources`, `computeGlobalAssignment` (globale Referenzzählung).
- **Doppelung:** drei Zuweisungswege (`profile-packages` Legacy, S2-Kriterien, S3-`master/assignment` Paket-Klassifikator) — **entschieden zugunsten S2**.
- **Legacy-Übergang:** `profile-packages.resolveProfilePackages` bleibt als Kompatibilitätsschicht (Shadow-Vergleich, Kap. 12).
- **Risiko:** mittel — die Laufzeit-Zuweisung ist die zentrale neue Wahrheit; abgesichert durch Shadow-Vergleich gegen Legacy.
- **Tests:** `quellenbibliothek-assignment-test.js` (Bestand) + `konsolidierung-versorgungsplan-test.js` + `konsolidierung-legacy-shadow-test.js`.

### 5. Gesundheit — **EIN Modell**
- **Verbindlich:** `quellenarchitektur/model.js` (Live-FSM, `PATH_STATUS` 6 Zustände, `nextPathStatus`, Schwellen `DEGRADE=3`/`BROKEN=6`).
- **Übernommen:** S2-`health-engine` als **Akut-Klassifikator** (Beobachtung→Zustand), dessen 8 Zustände über eine **totale Abbildung** ins kanonische Vokabular überführt werden; die **Eskalation** läuft ausschließlich über die kanonischen Schwellen (nicht S2s Serie 5). S3-`master/health` nutzt bereits die kanonischen Schwellen.
- **Doppelung:** drei Vokabulare (6/8/4). **Aufgelöst** durch die Konsolidierungsschicht `konsolidierung-modelle.js` (`acuteToCanonicalHealth`, `catalogHealthToCanonical`, `healthFromObservations`).
- **Legacy-Übergang:** keiner — das Live-FSM bleibt kanonisch und **unverändert**.
- **Risiko:** gering — additiv; die Sprint-Module bleiben für ihre eigenen Tests unverändert.
- **Tests:** `konsolidierung-architektur-test.js` H1–H9 (Vokabular, Totalität, Eskalation 3/6, Delegation).

### 6. Qualität — **EIN Modell**
- **Verbindlich:** `quellenarchitektur/quality-watchdog.js` (Live, **kategoriales** Urteil `technicalHealth`/`productValue`).
- **Übernommen:** S2-`quality.js`-Skalar (0..1) als **untergeordnete Ranking-Schicht**; seine Stabilitätsachse wird verbindlich aus der **kanonischen Gesundheit** gespeist.
- **Doppelung:** zwei Modelle (kategorial vs. skalar). **Aufgelöst:** Watchdog ist die Wahrheit, der Skalar ordnet nur.
- **Legacy-Übergang:** keiner — Watchdog bleibt **unverändert**.
- **Risiko:** gering — additiv.
- **Tests:** `konsolidierung-architektur-test.js` Q1–Q5.

### 7. Discovery
- **Verbindlich:** `quellenbibliothek/discovery.js` (Sprint 2) für Kandidatenfindung; `master/intake-pipeline.js` + `master/acquisition.js` (Sprint 3) für die **Katalogaufnahme** (12-stufige Importstrecke).
- **Übernommen:** klare Grenze: **Discovery = Kandidaten finden** (S2), **Intake = in den Katalog aufnehmen/prüfen/freigeben** (S3).
- **Doppelung:** Überschneidung nur begrifflich; disjunkte Verantwortung.
- **Legacy-Übergang:** keiner.
- **Risiko:** gering (dormant).
- **Tests:** `quellenbibliothek-discovery-test.js`, `master-catalog-test.js` (Bestand).

### 8. Parser
- **Verbindlich:** `quellenbibliothek/parsers.js` (Sprint 2, Parser-Registry + Eignungsprüfung bei Aufnahme).
- **Übernommen:** `pardok-parser.js`/`pardok-dispatch.js` (`main`) bleiben die konkreten Parlaments-Parser; die S2-Registry führt sie als registrierte Parser.
- **Doppelung:** keine echte — Registry (S2) vs. konkrete Parser (`main`) sind komplementär.
- **Legacy-Übergang:** `pardok-*` unverändert.
- **Risiko:** gering.
- **Tests:** `quellenbibliothek-descriptor-test.js` (Parser-Check), `pardok-*`-Tests (Bestand).

### 9. Coverage
- **Verbindlich:** `master/coverage-matrix.js` (Sprint 3) — Abdeckung gegen den globalen Master-Katalog.
- **Übernommen:** S2-Achsen speisen die Bewertung (Qualität), aber die Coverage-**Wahrheit** liegt am Katalog (S3).
- **Doppelung:** Coverage-Teilrechnungen in S2 (Qualität) vs. S3 (Matrix) — S3 ist kanonisch.
- **Legacy-Übergang:** `source-coverage`-Bestandstest bleibt gültig.
- **Risiko:** gering (dormant); Coverage ist bis zum Klassen-Tagging bewusst konservativ.
- **Tests:** `source-coverage-test.js`, `master-catalog-test.js` (Bestand).

### 10. Tenant-Trennung
- **Verbindlich:** `master/tenant-scope.js` (Sprint 3, 7 Schichten) + `tenant-context.js`/RLS (`main`, Live).
- **Übernommen:** `resolveTenantSources` (global per Referenz, privat strikt getrennt), `assertPrivateIsolation`.
- **Doppelung:** S2-Registry ist tenant-blind → **nicht** als Persistenz genutzt; die Tenant-Wahrheit ist S3+`main`.
- **Legacy-Übergang:** aktive RLS **unverändert** (Sicherheitsregel).
- **Risiko:** hoch bei Fehlbehandlung → daher rein additiv + harte Isolationstests; **keine** RLS-/Auth-Änderung.
- **Tests:** `konsolidierung-tenant-isolation-test.js` T1–T7 + `master-catalog-tenant-test.js`, `cross-tenant-security-test.js`, `tenant-*` (Bestand).

### 11. Persistenz
- **Verbindlich:** `main` `source_architecture` (Live) bleibt Schreibbasis; S3 `catalog_*`/`tenant_source_*` sind additiv, **vorbereitet** unter `supabase/migrations/prepared/` (nicht angewendet).
- **Übernommen:** 12-Zustand-Review/Release/License/Privacy-Felder aus S3 als Neu-Teile.
- **Doppelung:** S3 `catalog_*` überschneidet konzeptuell `source_architecture` — **kein** paralleles aktives Schema.
- **Legacy-Übergang:** `source_packages`-Tabellen bleiben als Kompatibilitätsschicht bestehen (Punkt 6).
- **Risiko:** **keine Migration ausgeführt** (Sicherheitsregel); Migrationen liegen außerhalb des Runner-Pfads.
- **Tests:** `master-catalog-migration-test.js`, `source-architecture-test.js` (Bestand).

### 12. Legacy-Pakete
- **Verbindlich (Übergang):** `profile-packages.js` + `seeds/packages.js` bleiben **vorübergehend** als Kompatibilitätsschicht.
- **Übernommen:** `resolveProfilePackages` als Referenz für den **Shadow-Vergleich** gegen den Laufzeitplan.
- **Doppelung:** das Paket-**Konzept** als persistierte Wahrheit wird zugunsten des Laufzeit-Versorgungsplans **stillgelegt** (nicht die Tabellen).
- **Legacy-Übergang:** solange die relationalen Pakete real befüllt sind, misst der Shadow-Vergleich Laufzeit ↔ Legacy je Mandat.
- **Risiko:** gering — Legacy bleibt bestehen, wird nur nicht mehr als neue Wahrheit fortgeschrieben.
- **Tests:** `konsolidierung-legacy-shadow-test.js` S1–S9.

---

## 5. Phase 4 — entfernte Doppelungen (nur sichere, mit vollständigem Ersatz)

**Grundsatz:** Entfernt wird **nur**, wo der Ersatz vollständig implementiert **und** getestet ist.
Keine aggressive Bereinigung.

**Entfernt (mechanisch, wertgleich, getestet):**
1. `master/model.js:TRUST_LEVELS` → re-exportiert aus `../model.TRUST_LEVELS` (Basis war bereits importiert).
2. `master/taxonomy.js:EVIDENCE_ROLES` → aus `../model.EVIDENCE_ROLES` bezogen (Kommentar sagte „konsistent mit" bereits zu).

Beide sind wertgleiche Redeklarationen einer bereits produktiv **getesteten** Basis; die Äquivalenz
wird zusätzlich in `konsolidierung-architektur-test.js` (bzw. den Bestandstests `master-catalog-test`)
gehalten.

**Verdrahtet statt entfernt (keine Arbeit verworfen):**
3. `quellenbibliothek/index.js:createLibrary` — der tote Komfort-Export wird von
   `konsolidierung-versorgungsplan.js:buildRuntimeRegistry` **genutzt** und damit lebendig + getestet.

**Bewusst NICHT entfernt, aber GEGEN DRIFT GESICHERT (Risiko/Live-Berührung — aufgeschoben):**
- `mandate-registry.policyField` ↔ `matching.POLICY_FIELD_LABELS`: die Auflösung würde die **Live-Datei**
  `matching.js` berühren (und die beiden Karten hängen an **verschiedenen** Nachschlagefunktionen) →
  Entfernen aufgeschoben. Statt Löschen wird die Äquivalenz durch einen **additiven Drift-Guard-Test**
  festgenagelt: `scripts/mandate-policyfield-consistency-test.js` erzwingt, dass `COMMITTEE_RELATIONS`
  eine byte-identische Obermenge von `POLICY_FIELD_LABELS` bleibt (0 Mismatches, `petitionen`=null) —
  so kann keine der beiden Tabellen künftig still von der anderen abdriften. Berührt keine Live-Datei.
- Architektonische „Doppelungen" (drei Quellmodelle, zwei Zuweisungsmaschinen, drei Health-Vokabulare,
  zwei Qualitätsmodelle) werden **nicht durch Löschen** aufgelöst, sondern durch die **kanonische
  Konsolidierungsschicht** überlagert — die Sprint-Module bleiben dormant erhalten (ihre Tests grün).

---

## 6. Konsolidierungsschicht (additiv, dormant)

| Datei | Rolle |
|---|---|
| `lib/helmut/quellenarchitektur/konsolidierung.js` | Fassade + maschinell geprüftes Architektur-Manifest + `buildPlatform`. |
| `lib/helmut/quellenarchitektur/konsolidierung-modelle.js` | **EIN** Gesundheitsmodell + **EIN** Qualitätsmodell (kanonisch, mit totalen Abbildungen). |
| `lib/helmut/quellenarchitektur/konsolidierung-versorgungsplan.js` | Katalog→Registry-Adapter, **Laufzeit-Versorgungsplan** (Paket = Laufzeitobjekt), Tenant-Auflösung, Legacy-Shadow. |

Alle drei liegen top-level unter `quellenarchitektur/` (vom CI-Syntax-Glob abgedeckt), sind **nirgends
in `server.js`/`scheduler.js`/`crawler.js` verdrahtet** und schreiben nichts.

---

## 7. Phase 5 — Verifikation

- **Alle bisherigen Offline-Suiten:** siehe `## Verifikationslauf` unten — die Zahl fällt **nicht** unter 149.
- **Neue Konsolidierungstests** (5 Suiten, in die Offline-Gesamtsuite eingesammelt):
  - `konsolidierung-architektur-test.js` — Syntax-implizit, EIN-Health, EIN-Quality, Manifest, keine Pilot-Sonderfälle.
  - `konsolidierung-versorgungsplan-test.js` — dynamische Zuweisung, Paket=Laufzeit, globale Nicht-Kopie, Determinismus, realer Katalog.
  - `konsolidierung-legacy-shadow-test.js` — Legacy-Paket-Shadow-Vergleich (§9), ehrliche Nicht-Abdeckung.
  - `konsolidierung-tenant-isolation-test.js` — Tenant-Isolation (global referenziert / privat getrennt) + DSGVO/PII.
  - `mandate-policyfield-consistency-test.js` — Drift-Guard für die eine Politikfeld-Label-Wahrheit (Komponente 1).
- **Syntax-Checks:** `node --check` über alle neuen `.js`-Dateien; CI-Glob deckt `quellenarchitektur/*.js` + `scripts/*.js` ab.
- **Keine Pilot-Sonderfälle:** strukturell geprüft (`konsolidierung-architektur-test.js` P1).

---

## 8. Sicherheitsregeln — eingehalten

Keine Produktion geändert · kein Deployment · keine Migration ausgeführt · keine Crawls/Crons/Locks
verändert · keine Authentifizierung/aktive RLS verändert · kein Merge nach `main` · kein Pull Request.
Alle Live-Dateien (`server.js`, `client.js`, `scheduler.js`, `model.js`, `quality-watchdog.js`,
`profile-packages.js`, `tenant-context.js`, `source_architecture.sql`) bleiben **byte-identisch** zum
Integrationsstand.

---

## 9. Abschluss — die acht Fragen

1. **Warum wurde zuvor der falsche Sprint gebaut?** Der Dark-Launch-Branch wurde auf `main` (`d6d9063`)
   statt auf `integration/quellenplattform-sprints-1-3` gebaut. Damit fehlte die gesamte Sprint-1/2/3-Arbeit;
   der Auftrag „Konsolidierung" konnte auf dieser Basis gar nicht erfüllt werden — gebaut wurde stattdessen
   ein additiver Dark-Launch-Harness gegen das Legacy-Paketmodell.
2. **Stammt der Dark Launch vom falschen Branch ab?** **Ja.** Merge-Basis = `main`, `integration` ist kein
   Vorfahr, 0 gemeinsame Sprint-Commits, 9 fehlende Suiten (140 statt 149).
3. **Welche Architektur ist jetzt verbindlich?** Sprint 1 = Mandatswahrheit; Sprint 3 = globaler
   Master-Katalog; Sprint 2 = dynamische Auswahl/Gewichtung/Discovery/Parser; Paket = Laufzeit-Versorgungsplan;
   EIN Gesundheitsmodell (Live-FSM); EIN Qualitätsmodell (Watchdog); global per Referenz; privat getrennt.
   Maschinell im Manifest verankert.
4. **Welche Doppelungen wurden entfernt?** `master/model.js:TRUST_LEVELS` und `master/taxonomy.js:EVIDENCE_ROLES`
   (wertgleiche Redeklarationen → aus `../model` bezogen). Der tote `createLibrary` wurde verdrahtet.
   Architektonische Doppelungen wurden durch die kanonische Schicht **überlagert**, nicht gelöscht.
5. **Welche Legacy-Komponenten bleiben?** `profile-packages.js` + `source_packages`-Tabellen (Kompatibilität),
   `source_architecture` (Schreibbasis), `catalog.js`, `pardok-*`-Parser, aktive RLS/Auth — alle unverändert.
6. **Sind mindestens alle bisherigen 149 Suiten grün?** Siehe `## Verifikationslauf` — ja, plus 4 neue.
7. **Ist der Dark Launch später gefahrlos integrierbar?** Ja — als Harness-**Muster**, nach Umverdrahtung
   auf den Laufzeit-Versorgungsplan und Ersatz seiner Duplikat-Modelle durch die kanonischen Einzelmodelle.
8. **Ist die Architektur jetzt wirklich bereit für Sprint 4?** Ja — die im Integrationsaudit blockierenden
   Fragen (Paket-Konzept, Quellmodell, Health, Quality, Tenant) sind entschieden und getestet. Sprint 4/5
   baut auf einer **einen** Wahrheit auf; die Aktivierung bleibt eine separate, freigabepflichtige Entscheidung.

---

## Verifikationslauf

- **Basis (Integrationsstand):** `run-offline-tests.js` → **149/149 Suiten grün** (Exit 0).
- **Nach Konsolidierung:** `run-offline-tests.js` → **154/154 Suiten grün** (Exit 0, ~33 s) —
  die 149 Bestands-Suiten plus 5 neue Konsolidierungs-Suiten. Die Zahl fällt **nicht** unter 149.
  - `konsolidierung-architektur-test.js` — 23/23 Assertions grün (H1–H9 Gesundheit, Q1–Q5 Qualität,
    M1–M8 Manifest, P1 keine Pilot-Sonderfälle).
  - `konsolidierung-versorgungsplan-test.js` — 13/13 (Adapter, Paket=Laufzeit, globale Nicht-Kopie,
    Determinismus, realer Master-Katalog).
  - `konsolidierung-legacy-shadow-test.js` — 9/9 (Legacy-Paket-Shadow-Vergleich, ehrliche Nicht-Abdeckung).
  - `konsolidierung-tenant-isolation-test.js` — 10/10 (global referenziert / privat getrennt + DSGVO/PII).
  - `mandate-policyfield-consistency-test.js` — 5/5 (Drift-Guard: eine Wahrheit für Politikfeld-Labels).
- **`[NETZ-GUARD]`-Hinweis** zu `pardok-shadow-test.js`: **Bestand aus `main`** (kein Sprint-/
  Konsolidierungsartefakt) — der Guard blockte einen Nicht-Localhost-Versuch, die Suite blieb grün. Kein Regress.
- **Syntax-Check:** `node --check` über alle 9 geänderten/neuen `.js`-Dateien bestanden; alle liegen im
  CI-Syntax-Glob (`lib/helmut/quellenarchitektur/*.js`, `…/master/*.js`, `scripts/*.js`).
- **Legacy-Paket-Shadow-Vergleich:** grün (§9) — der Laufzeitplan deckt die abbildbare Legacy-Intention ab.
- **Keine Pilot-Sonderfälle:** strukturell bestätigt (P1).
- **Live-Dateien byte-identisch:** `git status` zeigt als geändert ausschließlich die beiden S3-Sprint-Dateien
  (`master/model.js`, `master/taxonomy.js`, Enum-Dedup); keine Live-/Produktionsdatei ist berührt.
