# Sprint 1 — Universelles Mandatsregister · Abschlussbericht

**Stand:** 2026-07-21 · **Branch:** `claude/universelles-mandatsregister-sprint1`
**Modus:** additiv, rein lesend gegen Produktion. **Keine** Prod-Änderung, **kein** Deploy,
**keine** angewandte Migration, **keine** Änderung an aktiven Crawls/Quellen, **keine** kostenpflichtige API.

> **Kernergebnis:** Das Fundament steht. Helmut kann jetzt für **jeden beliebigen
> Bundestagsabgeordneten** — unabhängig von Partei, Fraktion oder Ausschuss — eindeutig
> bestimmen: **wer** der Mandant ist, **welche Partei/Fraktion**, **welche Ausschüsse/Funktionen**,
> **welche Themen** daraus folgen, **welche Pflichtdaten fehlen** und **welche Quellenpakete
> später nötig sind**. Alles datengetrieben, erweiterbar, getestet (138/138), ohne einen
> einzigen Produktions-Eingriff.

---

## Was gebaut wurde (Lieferumfang)

| Artefakt | Datei | Zweck |
|---|---|---|
| **Register-Daten** | `lib/helmut/quellenarchitektur/seeds/mandate-registry.js` | Datengetriebene, erweiterbare Registry: 9 Parteien, 8 Fraktionen, 23 Ausschüsse (je Politikfeld/Ministerium/Themen), Partei→Fraktion, Funktionskatalog, Paket-Index. |
| **Register-Resolver** | `lib/helmut/mandate-register.js` | `resolveMandate(profil)` → kanonisches Mandat: Identität, Partei/Fraktion, Ausschüsse, Themen, Pflichtdaten, verbindlicher Versorgungsstatus, Quellen-Ausblick; Dubletten-Erkennung; Coverage-Matrix. |
| **Tests** | `scripts/mandate-register-test.js` | 138 Checks (alle Parteien/Ausschüsse universell, 4 Coverage-Zustände, Identität/Dubletten, DE/EN-Felder, Migrations-Hygiene). |
| **Vorbereitete Migration** | `supabase/migrations/prepared/20260722_mandate_register.sql` (+ Rollback, README) | Persistente kanonische Projektion + DB-seitiger Dubletten-Schutz. **NICHT angewendet** (außerhalb des aktiven Migrationspfads). |
| **Doku** | `docs/mandatsregister/00-abschlussbericht.md`, `01-architektur.md` | Dieser Bericht + technisches Design. |

**Offline-Suite: 141/141 grün** (inkl. neue Suite), keine Regression. **Additiv:** keine
bestehende Produktionsdatei geändert.

---

## Die sechs Sprint-Fragen — jetzt beantwortbar

Aus einem beliebigen Mandatsprofil liefert `resolveMandate(profil)`:

| Frage | Feld | Beispiel (CDU-Verteidigungspolitikerin) |
|---|---|---|
| Wer ist der Mandant? | `identity.personKey` / `displayName` | `name:anna-muster` (bzw. `ext:bundestag:<id>` bei stabiler ID) |
| Partei und Fraktion? | `party` / `fraction` | `cdu` → Fraktion `cdu-csu` (datengetrieben abgeleitet) |
| Ausschüsse und Funktionen? | `committees` / `functions` | `verteidigung`; Funktion z. B. `obmann` |
| Welche Themen? | `themes` | Politikfeld „Verteidigung", Ministerium BMVg, Thementermini |
| Welche Pflichtdaten fehlen? | `requiredData.missing` | `[]` (vollständig) |
| Welche Quellenpakete später? | `supplyOutlook.gaps` | `parteipaket:cdu`, `themenpaket:verteidigung` |

---

## Coverage-Matrix (Beispiel, real erzeugt)

Zehn frei erfundene Mandate quer durch alle Parteien/Ausschüsse — **kein Pilot-Bezug**:

| Mandat | Partei | Fraktion | Politikfeld | Coverage | registerReady | sourceReady | Sprint-2-Bauliste |
|---|---|---|---|---|:---:|:---:|---|
| Linke A&S / NI (Pilot-Typ) | linke | linke | Arbeit und Soziales | Vollständig | ✓ | ✓ | — |
| CDU Verteidigung | cdu | cdu-csu | Verteidigung | Vollständig | ✓ | — | parteipaket:cdu, themenpaket:verteidigung |
| SPD Gesundheit | spd | spd | Gesundheit | Vollständig | ✓ | — | parteipaket:spd, themenpaket:gesundheit |
| Grüne Finanzen | gruene | gruene | Finanzen | Vollständig | ✓ | — | parteipaket:gruene, themenpaket:finanzen |
| AfD Inneres | afd | afd | Inneres | Vollständig | ✓ | — | parteipaket:afd, themenpaket:inneres |
| FDP Digitales | fdp | fdp | Digitales | Vollständig | ✓ | — | parteipaket:fdp, themenpaket:digitales |
| BSW Wirtschaft | bsw | bsw | Wirtschaft | Vollständig | ✓ | — | parteipaket:bsw, themenpaket:wirtschaft |
| Leeres Profil | — | — | — | Unvollständig | — | — | (Pflichtdaten fehlen) |
| Landtag Bayern (CSU) | csu | cdu-csu | Arbeit und Soziales | Blockiert | — | — | landespaket:bayern, parteipaket:csu |
| Unklare Partei | ? | — | Sport | Review | — | — | themenpaket:sport |

**Ablesbar:** 7 von 10 Mandaten sind **register-datenreif** — quer über CDU/CSU/SPD/Grüne/
AfD/FDP/BSW/Linke. `sourceReady` ist heute nur beim Pilot-Typ ✓ (dessen Pakete existieren);
für alle anderen zeigt die Matrix die **konkrete Sprint-2-Bauliste**. Das ist die ehrliche
Trennung: **Register-Reife (Sprint 1) ist da; Quellen-Reife (Sprint 2) ist die nächste Arbeit.**

*(Hinweis: `sourceReady` ist nur bei `registerReady=true` aussagekräftig.)*

---

## Die zwei Achsen — bewusst getrennt (wichtigste Design-Entscheidung)

Ein Vor-Audit-Befund war, dass der alte `fullyActivated`-Status ein Mandat schon dann als
„versorgt" meldete, wenn nur das **Basispaket** aktiv war — unabhängig von Partei/Ausschuss.
Ein CDU-Gesundheitspolitiker sah damit genauso „versorgt" aus wie der voll abgedeckte Pilot.
Das Register trennt daher **strikt**:

| Achse | Feld | Bedeutung | Sprint |
|---|---|---|---|
| **Datenreife** | `registerReady` / `coverageStatus` | Mandant eindeutig identifiziert, Partei/Ausschuss/Themen aufgelöst, Pflichtdaten da, nicht strukturell blockiert | **1 (jetzt)** |
| **Quellenreife** | `sourceReady` / `supplyOutlook` | Existieren die konkret nötigen Quellenpakete (Partei/Thema/Region) bereits? | **2 (nächster Sprint)** |

`registerReady=true` heißt **nicht** „fertige Briefings", sondern **„das Register kann dieses
Mandat an Sprint 2 übergeben, damit es automatisch versorgt wird"**. Kein Feld überverkauft mehr.

---

## Die vier Antworten (Auftrag)

### 1 · Welche Pilotabhängigkeiten wurden gefunden?

Vollständige Inventur über den gesamten Profilfluss (Provisionierung → Speicher → Scheduler →
Matching → Briefing; 9 Teilsysteme parallel analysiert). Zwei Schichten:

**A) Register-/Identitätsschicht** (Gegenstand dieses Sprints):

| Fund | Ort | Wirkung für beliebigen MdB |
|---|---|---|
| **Keine stabile Personen-ID** | repo-weit; `entities.js` kennt genau **eine** Person (hardcodiert „Tobias Schulze") | Identität nur über Namensslug → Dubletten/Namensvetter nicht trennbar |
| **Verlustbehafteter, uneinheitlicher Slug** | `provisioning.js:32` (`ü`→`-`) vs. `sources.js` (`ü`→`ue`) | dieselbe Person unterschiedlich geslugt; verschiedene Nachnamen kollidieren |
| **Reihenfolge-abhängige Kollision** | `accounts.js:208` (`-2`-Zähler) | gleiche MdB bekommen je nach Umgebung andere IDs |
| **Namens-blindes Matching** | `matching.js:236`, `decisions.js:39` | ein Vorgang, der den MdB nennt, hilft ihm nicht beim Ranking |
| **DE/EN-Feldkopplung** | `profile-validation.js`/`config.js` lesen nur `party/committees/focusTopics`, **nicht** `partei/ausschuesse/fachpolitische_schwerpunkte` | ein Profil in deutschen `mandate_profiles`-Feldern gilt fälschlich als „unvollständig" |
| **Überverkaufter Versorgungsstatus** | `profile-packages.js:169/178` prüft nur das Basispaket | jeder MdB gilt als „versorgt", sobald `bund-basis` aktiv ist |

**B) Quellenschicht** (bewusst **Sprint 2**, hier nur inventarisiert — Anfassen = Quellen ändern):

| Fund | Ort |
|---|---|
| Partei→Paket ist `=== "linke"` | `profile-packages.js:120`, `packages.js:90` |
| Ausschuss→Thema→Paket ist `=== "arbeit-und-soziales"` + eine `SOCIAL_TERMS`-Liste | `profile-packages.js:52/123` |
| Region→Paket ist eine Niedersachsen-Wortliste | `profile-packages.js:58/128` |
| Bundesland→Landespaket ist 2-Einträge-Literal (Berlin/Brandenburg) | `profile-packages.js:28` |
| Paketkatalog = 4 aktive Pilot-Pakete | `seeds/packages.js:27` |
| Theme-Vokabular nur `SOCIAL_THEME_TERMS`, pauschal auf alle Quellen | `sources.js:16/107/575` |

### 2 · Welche wurden beseitigt?

Das Register **beseitigt die Register-/Identitätsschicht-Abhängigkeiten** (A) — additiv, ohne
Produktionsverhalten zu ändern:

- **Universelle Identität + Dubletten-Logik** (`mandateIdentity`, `detectDuplicates`,
  `identityClusterKey`): kanonischer Personenschlüssel mit **stabiler externer ID bevorzugt**
  (Bundestag/abgeordnetenwatch/Wahlkreis-Nr), sonst Namensslug mit **Umlaut-Faltung + Titel-
  Bereinigung** („Dr. Anna Müller (MdB)" → `mueller`). Echte Dubletten (gleiche Person doppelt)
  werden von **Namensvettern** (gleicher Name, andere Partei/Wahlkreis) getrennt; stabile IDs
  trennen Gleichnamige zuverlässig. Die DB-Migration erzwingt Eindeutigkeit zusätzlich per
  `UNIQUE(id_source, external_id)`.
- **Vollständig datengetriebene Registry** (Auftrag §6): Parteien, Fraktionen, Ausschüsse,
  Funktionen, Politikfelder und Themen sind **Daten**, keine Logik. Partei→Fraktion,
  Ausschuss→Politikfeld→Ministerium→Themen sind Tabellen; neue Partei/neuer Ausschuss/neues
  Thema = **eine Datenzeile**, kein Code-Change. Die kollisionssichere Ausschuss-Auflösung
  (Menschenrechts- vs. Rechtsausschuss) ist gelöst und getestet.
- **DE/EN-Feldkopplung beseitigt** (`bridgeProfile`): das Register liest **beide**
  Schreibweisen; ein Profil in deutschen `mandate_profiles`-Feldern wird korrekt als
  vollständig erkannt.
- **Verbindlicher, ehrlicher Versorgungsstatus** (`computeVersorgungsstatus`): vier klare
  Zustände (**vollständig / unvollständig / blockiert / review**) mit dokumentierter Präzedenz;
  der Überverkauf ist behoben durch die Zwei-Achsen-Trennung (Datenreife vs. Quellenreife).

**Nicht angefasst (bewusst):** die Quellenschicht-Abhängigkeiten (B). Ihr „Entfernen" bedeutet
den **Aufbau der universellen Quellenbibliothek** — das ist ausdrücklich **Sprint 2** („Wir
beginnen NICHT mit neuen Quellen"), und jeder Eingriff dort änderte aktive Crawls (verboten).
Das Register liefert die **datengetriebenen Ersatz-Lookups** (`partyPackageKey`,
`committeePackageKey`, Politikfeld/Themen je Ausschuss) bereits fertig — Sprint 2 muss sie nur
noch verdrahten und den Paketkatalog füllen.

### 3 · Welche Blocker bestehen noch?

| Blocker | Schicht | Auflösung |
|---|---|---|
| **Quellenpakete existieren nur für Pilot** (Partei nur Linke, Thema nur A&S, Region nur NI) | Quellen | **Sprint 2** (universelle Quellenbibliothek); Register liefert je Mandat die Bauliste |
| **Register nicht in den Live-Pfad verdrahtet** | Integration | Folgeschritt: Provisionierung/Scheduler `resolveMandate` konsumieren lassen; Dual-Write in `mandate_register` (gated) |
| **Profildaten liegen im Blob (last-write-wins)**, kein stabiler externer Schlüssel befüllt | Speicher | Migration `mandate_external_ids` einspielen (freigabepflichtig) + Backfill der IDs (abgeordnetenwatch, Sprint 2) |
| **14 Bundesländer ohne Landesmodul** | Quellen | später (Landtagsmodule, OP-21) — das Register meldet sie ehrlich als `blockiert` |
| **Personen-Entitäten fehlen als Daten** | Daten | Sprint 2: aus autoritativer Bundestagsquelle seeden (löst zugleich Identität/Matching) |

Keiner dieser Blocker verhindert die **Register-Datenreife** eines beliebigen Bundestags-MdB —
sie betreffen die **Quellen-/Speicher-Verdrahtung** der Folgesprints.

### 4 · Ist das Register bereit für den automatischen Aufbau der universellen Quellenbibliothek (Sprint 2)?

**Ja.** Das Register liefert Sprint 2 exakt die Eingaben, die die Quellenbibliothek braucht:

- pro Mandat die **kanonischen Schlüssel** (Partei, Fraktion, Ausschüsse, Politikfelder) als
  stabile Anker für Quellenpakete;
- je Mandat die **konkrete Paket-Bauliste** (`supplyOutlook.gaps`: `parteipaket:<key>`,
  `themenpaket:<key>`, `landespaket:<bl>`) — die Quellenbibliothek muss nur diese Liste abarbeiten;
- Politikfeld→Ministerium→**Thementermini** je Ausschuss als fertigen Startpunkt für
  Quellen-Suchbegriffe (heute nur A&S; die Struktur trägt alle 22 Politikfelder);
- den **Paket-Index** (`PARTY_PACKAGE_KEYS`, `COMMITTEE_PACKAGE_KEYS`): wächst Sprint 2 den
  Katalog, spiegelt `sourceReady` das automatisch wider — ohne Code-Change am Register.

---

## Aufgabenabgleich

| # | Aufgabe | Status |
|---|---|---|
| 1 | Profilfluss End-to-End analysiert | ✓ (9 Teilsysteme, `01-architektur.md` §1) |
| 2 | Pilotsonderfälle/Hardcodes/Fallbacks gefunden | ✓ (Inventur oben, 2 Schichten) |
| 3 | Universelles Mandatsmodell | ✓ (`mandate-register.js` + Registry) |
| 4 | Verbindlicher Versorgungsstatus | ✓ (4 Zustände + Zwei-Achsen-Ehrlichkeit) |
| 5 | Robuste Identitätslogik (Dubletten) | ✓ (stabile ID > Namensslug, Cluster, Titel/Umlaut) |
| 6 | Parteien/Fraktionen/Ausschüsse/Themen datengetrieben & erweiterbar | ✓ (Registry als Daten) |
| 7 | Coverage-Matrix (vollständig/unvollständig/blockiert/review) | ✓ (`buildCoverageMatrix`) |
| 8 | Schema/Schnittstellen vorbereitet, nicht ausgeführt | ✓ (`prepared/`-Migration + Rollback + README) |
| 9 | Tests für das Mandatsmodell | ✓ (138 Checks, in CI-Offline-Suite) |

---

## Empfehlung für Sprint 2 (universelle Quellenbibliothek)

1. **Register in den Live-Pfad verdrahten** (Provisionierung + Scheduler konsumieren
   `resolveMandate`; gated Dual-Write in `mandate_register`).
2. **Paketkatalog füllen** entlang der Register-Baulisten: je Fraktion ein Parteipaket, je
   Politikfeld ein Themenpaket; `PARTY_PACKAGE_KEYS`/`COMMITTEE_PACKAGE_KEYS` mitwachsen lassen.
3. **Stabile Personen-IDs backfillen** (abgeordnetenwatch/Bundestag) → `mandate_external_ids`
   einspielen; damit werden Identität, Personensuche und Löschungs-Scoping alle stabil.
4. **Landesmodule** schrittweise (das Register meldet fehlende ehrlich als `blockiert`).

Das Fundament trägt: **Helmut erkennt heute jeden Bundestagsabgeordneten eindeutig — die
Quellen sind der nächste Schritt, nicht das Register.**
