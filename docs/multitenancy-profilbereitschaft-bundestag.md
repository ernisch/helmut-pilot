# Bundestags-Profilbereitschaft — Vertrag, Bestandsprüfung, Reparaturpaket, Testmandate

**Stand:** 2026-08-04 · **Sprint:** „Profilreife, Bestandsprüfung und kontrollierte Testmandate"
**Modul:** `lib/helmut/profile-readiness.js` · **Werkzeug:** `scripts/profil-bereitschaft.js`
**Tests:** `scripts/profil-bereitschaft-test.js` (49/49) · **Seed:** `lib/helmut/quellenarchitektur/seeds/bundestag-testmandate.js`
**Reparaturpaket:** `scripts/fixtures/profil-reparatur-2026-08-04.js` (nicht automatisch angewendet)

Dieses Dokument ist die **eine kanonische Stelle** für den Bundestags-Bereitschaftsvertrag.
Es baut auf [`multitenancy-profilvalidierung.md`](multitenancy-profilvalidierung.md)
(Grundzustände aus `validateProfile`) auf und ersetzt sie nicht.

**Verbindliche Trennung (gilt für alles Folgende):**

| Begriff | Bedeutung | Prüft dieses Modul? |
|---|---|---|
| **Mandatsprofil** | fachliches Profil für Matching/Lage/Radar/Briefing/Quellen | ja |
| **Benutzerkonto** | Login, E-Mail, Passwort, Einladung | **nein** — nie Voraussetzung für den Datenmotor |
| **Aktive Verarbeitung** | Teilnahme an regulären Production-Abläufen (`profileActive`) | getrennt vom Inhalt bewertet |

---

## 1 · Profilvertrag: Feldklassen aus dem echten Code

Jedes harte Pflichtfeld ist durch einen konkreten Codeverbraucher begründet — keine
erfundenen Pflichtfelder. Kanonische Ablage: `profiles` (id, name) + `mandate_profiles`
(alle Fachspalten) + `profil_extras` (Auffangbehälter); Mapping `storage.fromMandateProfileRow`.
**Wirksamer Lesepfad heute: Blob** (`HELMUT_PROFILE_DB_MODE` in Production nicht gesetzt).

### Technisch zwingend (ohne sie bricht Verarbeitung oder Zuordnung)

| Feld | Verbraucher / Wirkung bei Fehlen |
|---|---|
| `id` (Slug) | Storage-Schlüssel, `user_id`-Mandantenfilter, Quellen-IDs `<id>-news` — ohne id keine Referenzierbarkeit (harter Fehler) |
| Mandatsebene = Bundestag | `resolveProfilePackages` (Pflichtpaket Bund Basis), Landesmodul-Gate — ohne Ebene keine Paketzuordnung |
| gültige KI-Budgets | DB-CHECK (`ki_budget_*_cent > 0`), `validateProfile` → `fehlerhaft` — ungültiger Wert blockiert KI-Pfad |
| Lifecycle konsistent | `profileActive`/`geloescht_at` steuern Cron-Teilnahme (`tenant-context.isActiveMandate`) |

### Fachlich zwingend (ohne sie ist ein Bundestagsprofil nicht nutzbar)

| Feld | Verbraucher / Wirkung bei Fehlen |
|---|---|
| `fullName` als **Klarname** (≥ 2 Wörter, kein Slug) | `scheduler.personNewsSource` baut die Radar-Personensuche **wörtlich** aus `fullName`; ein Slug erzeugt falsche/leere Treffer |
| Partei **oder** „Fraktionslos" | Matching-Parteidimension, Fraktions-/Partei-Quelle (`mandateNewsSources` Nr. 2), Parteipakete |
| Region **oder** Wahlkreis | Regionale Lage (Quelle Nr. 7), Radar-Wahlkreisbezug |
| ≥ 1 Ausschuss **oder** Thema | Matching-Themendimension, Quellen Nr. 1/4/5 — ohne beides läuft der Job leer |
| angegebene Ausschüsse in der **WP-21-Sollmenge** auflösbar | Radar-Ausschussbeleg, Ausschuss-Themenradar; ein Ausschuss einer früheren Wahlperiode erzeugt **falsche Zuständigkeitsbelege** (Sollmenge: `seeds/bundestag-ausschuesse.js`, Drs. 21/150) |

### Empfohlen (Qualität — Warnung, kein Blocker)

`state` (Regionalpakete, geteilter Regionalfilter) · `topicPriorities` (Priorisierung) ·
`nameVariants` (Radar-Recall) · `deputyCommittees` · `regionalInterests` · `relevantMinistries`
(Quelle Nr. 3) · Wahlkreis-Beschriftung mit Nummer.

### Nicht Teil des Mandatsprofils

E-Mail, Passwort, Einladung, `onboardingStatus`-Sphäre, Konto-/Auth-Daten. Nutzerverfasste
Prompt-Kontexte (`mainQuestion`, `localMedia`, …) sind Personalisierung, keine Pflicht.

## 2 · Bereitschaftsvertrag (deterministisch, lesend)

`bewerteBundestagsprofil(profil)` liefert: `bereit` (ja/nein) · `fehlend` (mit Klasse +
Verbraucher) · `ungueltig` (Wert + Grund) · `warnungen` · `duplikate` · `widersprueche` ·
`betroffeneFunktionen` · `hinweise` (Korrekturanleitung). `bewerteProfilbestand(profile,
{personalSources})` prüft bestandsweit: eindeutige Kennungen, gleiche Klarnamen auf mehreren
Mandaten (Vermischungsrisiko der Personensuchen), Fehlzuordnung mandatseigener Quellen,
doppelte eigene Quellen; **geteilte Quellen werden nie als Duplikat gewertet**. Garantien:
kein Netz, kein Storage-Write, keine Uhrzeit, stabile Sortierung, Landtag wird **nicht**
vermischt (eigene Meldung „nicht zuständig", `validateProfile` gilt dort unverändert),
kein Benutzerkonto nötig, fehlende Daten werden benannt statt ergänzt.

## 3 · Aktivierungssperre: neu ≠ Bestand

- **Neuer Aktivierungsübergang (hart):** `provisioning.provisionTenant` bricht für
  Bundestagsprofile vor jedem Write ab, wenn `pruefeNeuaktivierung` Blocker meldet
  (`reason: bundestagsprofil-nicht-bereit`, Fehlerliste nennt jede Angabe konkret).
  Landtag: unveränderte Altregel (Berlin-Pfade unberührt).
- **Bestehende aktive Profile (Warnung):** die laufende Verarbeitung liest weiterhin
  **nur** `validateProfile` — kein Bestandsprofil wird durch diesen Merge deaktiviert,
  übersprungen oder anders verarbeitet (Test 17). Admin-API (`/api/admin/profile/:id`)
  und Admin-Tabelle „Daten & Profile" zeigen die Bereitschaft additiv mit konkreten
  Blockern an; gespeichert wird **nichts** (immer frisch berechnet, keine Migration).

## 4 · Bestandsprüfung der sechs aktiven Mandate (2026-08-04, rein lesend)

Geprüft über die **wirksame** Profilsicht (Blob-Lesepfad) per
`node scripts/profil-bereitschaft.js --production` plus relationale Gegenprüfung
(`profiles`/`mandate_profiles`, nur SELECT). Kein Production-Write, keine Auth-Daten
gelesen. Die Mandats-Kennungen stehen bereits offen in der Repo-Doku (u. a.
`datenmotor-restliste.md` B5).

| Mandat | Gesamtstatus | Blocker | Warnungen | betroffene Funktionen | Korrektur (Beleg: §5) |
|---|---|---|---|---|---|
| `annika-klose` | **nicht bereit** | 2 Widersprüche: Funktionsbezeichnungen („Sprecher/in der Fraktion", „Obmann/Obfrau im Ausschuss") im Themenfeld `reportingTopics`; zusätzlich Ausschüsse ≠ WP-21-Mitgliedschaften (Gesundheit/EU/Kultur statt **Arbeit und Soziales + Petitionsausschuss**) | keine Prioritäten, keine Namensvarianten | Quellen-Queries (Pseudo-Themen), Radar-Ausschussbeleg, Ausschuss-Themenradar | Ausschüsse ersetzen, Rollen aus Themenfeld entfernen |
| `cem-ince` | **bereit** | — | keine Namensvarianten | — | latent: relationale `profiles.name` = Slug (§5); stv. Ausschüsse ergänzen (empfohlen) |
| `helmut-kleebank` | **bereit** (Inhalt formal) | — · **aber:** Ausschüsse (Finanzen, Haushalt) ≠ WP-21-Mitgliedschaften (**Wirtschaft und Energie + Umwelt/Klimaschutz/Naturschutz/nukleare Sicherheit**) — formal gültige, inhaltlich falsche Angaben | keine Prioritäten, keine Namensvarianten | Radar-Zuständigkeitsbelege, Matching-Gewichte | Ausschüsse ersetzen |
| `max-mustermann` (Demo) | **bereit** (Inhalt formal) | **Bestandsproblem:** trägt den Klarnamen einer realen Abgeordneten → identische Personensuche wie `ottilie-paola-klein-2` (Vermischung) | kein Wahlkreis, keine Prioritäten | Radar-Personensuche beider Mandate | Produktentscheidung OP-04 (Demo entfernen/umbenennen) |
| `ottilie-paola-klein-2` | **nicht bereit** | ungültiger Ausschuss „Bildung, Forschung und Technikfolgenabschätzung" (WP-20-Bezeichnung, in WP 21 aufgeteilt); Namensduplikat mit Demo-Mandat | Wahlkreis unspezifisch („Berlin"), keine Prioritäten | Radar-Ausschussbeleg, Ausschuss-Themenradar, Personensuche | Ausschüsse → **Kultur und Medien**; Wahlkreis präzisieren |
| `ruppert-st-we` | **bereit** (Inhalt formal) | — · Ausschussliste unvollständig (Petitionsausschuss fehlt; Haushalts-Status zu bestätigen) | keine Prioritäten, keine Namensvarianten | Zuständigkeitsbelege (unvollständig) | Petitionsausschuss ergänzen, Haushalts-Status bestätigen |

**Antworten auf die Pflichtfragen des Auftrags:**

1. **Sind alle sechs Profile vollständig?** Nein. Formal bereit sind 4 von 6; `annika-klose`
   und `ottilie-paola-klein-2` sind nicht bereit. Inhaltlich (gegen amtliche WP-21-Daten)
   tragen **drei** Profile falsche Ausschüsse (`annika-klose`, `helmut-kleebank`,
   `ottilie-paola-klein-2`).
2. **Nicht testbereit:** `annika-klose`, `ottilie-paola-klein-2`; dazu das Namensduplikat
   `max-mustermann`/`ottilie-paola-klein-2` als Bestandsproblem.
3. **Matching-/Briefing-verfälschend:** falsche Ausschüsse (falsche Zuständigkeitsbelege,
   fehlgeleitetes Ausschuss-Themenradar), Rollenfloskeln als Pseudo-Themen in Quellen-Queries,
   Namensduplikat (Personentreffer fließen in zwei Mandate).
4. **Nur Qualitätswarnungen:** fehlende Prioritäten/Namensvarianten/regionale Interessen.
5. **267-Sekunden-Lauf:** **Kein** Profilfehler kann ihn verursacht haben. Belegte
   Laufreihenfolge: das Zeitbudget war **vor** Beginn der Mandatsverarbeitung erschöpft
   (globale Phase: Persistenz-Round-Trips F-RT + Doppelarbeit F-CL); Profilfelder werden in
   der globalen Phase nicht gelesen. Die bestehende Ursachenanalyse bleibt unverändert.

**Latenter Befund F-P6 (kein aktiver Fehler):** die relationale Zeile `profiles.name` des
Pilotmandats trägt den Slug statt des Klarnamens; die wirksame Blob-Sicht trägt den
Klarnamen. Beim künftigen Umschalten auf `HELMUT_PROFILE_DB_MODE` würde die
Radar-Personensuche degradieren → vor dem Cutover beheben (§5). Zusätzlich ist der
relationale persönliche Abrufweg (`profil-cem-ince`, 1 Weg) `needs_review` und damit inaktiv —
die Personenversorgung läuft heute ausschließlich über die zur Laufzeit erzeugte Profilquelle.

## 5 · Reparaturpaket (vorbereitet, NICHT angewendet)

Kanonische Ablage: `scripts/fixtures/profil-reparatur-2026-08-04.js` — je Feld: aktueller
Wert → vorgeschlagener Wert → Grund → offizielle Quelle → Abrufdatum → Status
(`belegt`/`zu_bestaetigen`/`entscheidung`). Getestet (49/49): belegte Vorschläge machen die
nicht-bereiten Profile bereit, Anwendung ist idempotent, kein Skript wendet sie automatisch an.
**Anwendungsweg (spätere, ausdrückliche Betreiberentscheidung):** vorhandene
Admin-Profilverwaltung (`/api/admin/profile/<id>`); kein neues Production-Schreibwerkzeug.
**Abrufgrenze (ehrlich):** Direktabrufe externer Seiten sind aus der Arbeitsumgebung gesperrt
(HTTP 403 der Egress-Richtlinie, wie in `seeds/bundestag-ausschuesse.js` dokumentiert);
Verifikation am 2026-08-04 über Suchtreffer der genannten amtlichen/offiziellen Quellen;
Unsicheres ist `zu_bestaetigen` statt behauptet.

## 6 · Fünf reale Testmandate (deaktivierte Offline-Daten)

Kanonische Ablage inkl. Belegen, Abrufdatum, Testnutzen: `seeds/bundestag-testmandate.js`.
Alle fünf: `profileActive: false`, `internesTestmandat: true`, **kein** Benutzerkonto, keine
E-Mail, keine Einladung, kein zahlender Tenant, kein automatischer Import beim Merge; jede
spätere Aktivierung ist eine getrennte ausdrückliche Betreiberentscheidung. Die betreffenden
Abgeordneten **nutzen Helmut nicht** und dürfen nicht so dargestellt werden.

| Kennung | Name | Fraktion | Land | Mandatsart | Fachbereich/Ausschuss | Rolle | Testnutzen |
|---|---|---|---|---|---|---|---|
| `test-mdb-andrea-lindholz` | Andrea Lindholz | CDU/CSU (CSU) | Bayern | Direktmandat Aschaffenburg | Inneres/Recht (Themenpfad, kein Ausschuss) | Bundestagsvizepräsidentin | Präsidiumsrolle, Fraktionsgemeinschaft CSU↔CDU/CSU |
| `test-mdb-bernd-baumann` | Bernd Baumann | AfD | Hamburg | Landesliste | Innenausschuss | 1. Parlamentarischer Geschäftsführer | Stadtstaat ohne Wahlkreis, Fraktionsgeschäftsführung |
| `test-mdb-ralf-stegner` | Ralf Stegner | SPD | Schleswig-Holstein | Landesliste (betreut Pinneberg) | Auswärtiger Ausschuss | Fachpolitiker Außen | GG-Ausschuss, betreuter Wahlkreis |
| `test-mdb-julia-verlinden` | Julia Verlinden | Bündnis 90/Die Grünen | Niedersachsen | Landesliste | Energie/Umwelt (Koordination, kein Ausschuss behauptet) | stellv. Fraktionsvorsitzende | Themenkoordination statt Ausschuss |
| `test-mdb-soeren-pellmann` | Sören Pellmann | Die Linke | Sachsen | Direktmandat Leipzig II | Soziales/Inklusion (Themenpfad) | Fraktionsvorsitzender (Co) | ostdeutsches Direktmandat, Namens-/Paket-Kollisionsprobe |

Abdeckung: alle 5 Fraktionen der 21. WP (Sollmenge `seeds/parlamentszusammensetzung.js`),
5 Bundesländer, Direkt- und Listenmandate, 2 w / 3 m, Rollen vom Präsidium bis zum
Fachausschuss — keine Auswahl allein nach Bekanntheit, keine politische Bewertung.

## 7 · Prüfwerkzeug

```
node scripts/profil-bereitschaft.js --fixtures <datei.json> [--profil <id>] [--json]
node scripts/profil-bereitschaft.js --production [--profil <id>] [--json]
```

Ausschließlich lesend; Secrets nur aus `process.env` (CLAUDE.md §4.9); Exit 0 = bereit,
2 = Blocker, 3 = Ladefehler; keine Secrets/Rohdaten in der Ausgabe; wendet nie Korrekturen an.

## 8 · Getrennte spätere Betreiberschritte (nichts davon ist Teil dieses Sprints)

1. Reparatur der sechs Bestandsprofile über die Admin-Profilverwaltung (§5).
2. Entscheidung OP-04 zum Demo-Mandat mit realem Klarnamen.
3. `profiles.name`-Korrektur vor einem `HELMUT_PROFILE_DB_MODE`-Cutover (F-P6).
4. Anlage/Aktivierung der fünf Testmandate (Provisionierung mit Konten ist bewusst **nicht**
   vorbereitet worden — nur Mandatsprofile).
5. OP-25-Production-Nachweis — der Elf-Profile-Offlinetest ist **kein** Ersatz dafür.
