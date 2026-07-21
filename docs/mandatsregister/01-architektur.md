# Universelles Mandatsregister — Technische Architektur

**Stand:** 2026-07-21 · Ergänzung zu `00-abschlussbericht.md`.

## 1. Profilfluss End-to-End (Ist, analysiert)

```
Provisionierung            Speicher                 Quellenwahl            Bewertung        Ausgabe
provisionTenant   ─▶  saveProfile (Blob main)  ─▶  getSourcesForProfile ─▶ matching   ─▶ lage/briefing
 validateSpec           store.profiles[id]          neutral + person +     decisions      (Ranking +
 buildProfile           (relational inert bis        mandateNews            (Feature-      KI-Narrativ)
 resolveProfilePackages  HELMUT_PROFILE_DB_MODE)                            gewichte)
```

**Autoritative Daten je Sprung (Ist):** Spec → Blob (nur `id`-keyed, sonst Code-Defaults) →
Profilfelder für Quellenwahl + hartkodierte Term-Tabellen fürs Scoring → Profilmerkmale
(Name wird **nie** genutzt) → globales Ranking + Profil fürs Narrativ.

**Wo das Register andockt:** als kanonische Auflösungs-Schicht **zwischen** Profil und allen
Konsumenten. Es liest ein (beliebiges) Profil und liefert die stabile, universelle Projektion,
auf der Provisionierung, Quellenwahl (Sprint 2) und Admin/Coverage einheitlich aufsetzen.

## 2. Module

### `seeds/mandate-registry.js` — die Daten
Rein deklarativ, komponiert über `seeds/entities.js` (keine Duplikation):
- **`PARTY_TO_FRACTION`** — Partei-Key → Fraktions-Key (CDU/CSU/Union → `cdu-csu`).
- **`COMMITTEE_RELATIONS`** — je Ausschuss: `policyField`, `ministry(+Entity)`, `themeTerms[]`,
  `aliases[]`. Erweiterbar; `aliases` fängt Schreibvarianten ab, ohne die ranking-kritische
  `matching.js` anzufassen.
- **`PARTY_PACKAGE_KEYS` / `COMMITTEE_PACKAGE_KEYS`** — Paket-Index (heute nur Pilot-Pakete;
  Sprint 2 füllt ihn → `sourceReady` folgt automatisch).
- **`FUNCTIONS`** — Funktionskatalog (Vorsitz/Obmann/Sprecher/Berichterstatter/…).
- Lookups: `resolveParty`, `fractionForParty`, `resolveCommittee` (kollisionssicher via
  `committeeMatchKey` + Alias), `resolveFunction` (maximal-munch), `registrySummary`.

### `mandate-register.js` — der Resolver
- **Identität:** `mandateIdentity` (stabile externe ID bevorzugt, sonst Namensslug mit
  Umlaut-Faltung + Titelbereinigung), `identityClusterKey`, `detectDuplicates`
  (Dubletten vs. Namensvetter).
- **Auflösung:** `resolvePartyBlock`, `resolveCommitteeBlock`, `resolveFunctionBlock`,
  `deriveThemes` (Politikfelder/Ministerien/Themen aus Ausschüssen, datengetrieben).
- **Feldbrücke:** `bridgeProfile` (deutsche `mandate_profiles`-Felder ↔ englische Aliase).
- **Versorgung:** `computeVersorgungsstatus` (4 Zustände), `computeSupplyOutlook`
  (Sprint-2-Bauliste), `resolveMandate` (alles zusammen), `buildCoverageMatrix`.
- **Wiederverwendung:** `parliamentTypeOf`/`accountType` (config), `validateProfile`
  (profile-validation), `resolveProfilePackages`/`profileSupplyStatus` (profile-packages),
  `normalizeParty`/`committeeMatchKey` (matching). Kein Doppelmodell.

## 3. Verbindlicher Versorgungsstatus — Zustände & Präzedenz

| Zustand | Bedeutung | Auslöser |
|---|---|---|
| **vollständig** | datenreif, eindeutig aufgelöst, nicht blockiert | alle Pflichtdaten da, Partei/Ausschuss bekannt, keine Blocker |
| **unvollständig** | Pflichtdaten fehlen | `validateProfile.missingRequired` nicht leer |
| **blockiert** | Daten ok, aber strukturell nicht versorgbar | deaktiviert; Landesmodul fehlt; Pflichtpaket prepared/draft |
| **review** | Auflösung unsicher | unbekannte Partei/Ausschuss; mehrdeutige Identität (Dublette); Budgetfehler |

**Präzedenz (dokumentiert):** deaktiviert → *blockiert*; sonst fehlende Pflichtdaten →
*unvollständig*; sonst Review-Flags → *review*; sonst Blocker → *blockiert*; sonst *vollständig*.
Alle Achsen werden **immer** berechnet und als `reviewFlags`/`blockers`/`infoFlags` mitgeliefert
— nichts verschwindet hinter der Präzedenz. Die fehlende stabile ID ist **advisory**
(`infoFlags`, kein Review-Auslöser); Review entsteht nur bei echter Kollision.

## 4. Identität & Dubletten

- **Clusterschlüssel:** mit stabiler externer ID → `ext:<quelle>:<id>`; sonst
  `name:<slug>|<partei>|<wahlkreis>`. → Namensvetter werden **nicht** zusammengelegt, echte
  Doppelanlagen schon.
- **Namensslug:** Umlaute gefaltet (`ü`→`ue`), Titel/Adelspartikel entfernt (Dr., Prof., MdB,
  von, …), Bindestrich-Namen als Worttrenner. „Prof. Dr. Änna von Müller-Schmidt (MdB)" →
  `aenna-mueller-schmidt`.
- **DB-Durchsetzung:** `mandate_external_ids UNIQUE(id_source, external_id)` — eine externe ID
  gehört zu genau einem Mandat.

## 5. Vorbereitete Schemaänderung (nicht angewendet)

`supabase/migrations/prepared/20260722_mandate_register.sql` (außerhalb des aktiven Pfads):

- **`mandate_register`** — 1:1-Projektion je Mandat (kanonische Schlüssel, Politikfelder,
  Versorgungsstatus, Coverage, Bauliste), jederzeit aus Profil + Registry neu berechenbar.
- **`mandate_external_ids`** — stabile externe Personen-IDs mit UNIQUE-Dubletten-Schutz.

Additiv, idempotent, service_role-only (RLS an, keine Policies). Rollback beiliegend.
Anwendung ist ein eigener, freigabepflichtiger Schritt (Checkliste: `prepared/README.md`).

## 6. Erweiterbarkeit (Auftrag §6)

| Erweiterung | Nötige Änderung |
|---|---|
| Neue Partei | Zeile in `entities.js` `PARTIES` + Eintrag in `PARTY_TO_FRACTION` |
| Neue Fraktion | Zeile in `entities.js` `FRACTIONS` + `FRACTION_ENTITY_BY_KEY` |
| Neuer Ausschuss | Zeile in `entities.js` `COMMITTEES` + `COMMITTEE_RELATIONS` |
| Neues Thema/Politikfeld | `themeTerms`/`policyField` am Ausschuss |
| Neues Quellenpaket (Sprint 2) | Eintrag in `PARTY_PACKAGE_KEYS`/`COMMITTEE_PACKAGE_KEYS` → `sourceReady` folgt automatisch |

**Kein Resolver-Code muss angefasst werden** — die Registry ist die einzige Wahrheit.

## 7. Tests

`scripts/mandate-register-test.js` (138 Checks, offline, in der CI-Suite):
Registry-Vollständigkeit · Kollisions-Auflösung (Menschenrechte) · Funktionen · Identität &
Dubletten (Titel/Umlaut/Stable-ID/Namensvetter) · **Universalität über alle 8 Fraktionen und
alle 23 Ausschüsse** · 4 Coverage-Zustände · DE/EN-Feldbrücke · Themen-Ableitung ·
Zwei-Achsen-Trennung (registerReady vs. sourceReady) · Coverage-Matrix · Robustheit gegen
Müll-Eingaben · Migrations-Hygiene (prepared, nicht im aktiven Pfad, wohlgeformt).
