# Profildatenkarte — Helmut Mehrmandantenfähigkeit (Phase 1)

**Stand:** 2026-07-12 · **Branch:** `claude/helmut-multi-tenant-is7j32`
**Modus:** Rein lesende Analyse (Code + Production-Supabase read-only). Keine Schreibzugriffe.
**Grundlage:** `audit/*.md`, `docs/multitenancy-plan.md`, `docs/jwt-aktivierung-runbook.md`,
`docs/readiness-verdict-2026-07.md`, `docs/ko-anreicherung-analyse.md`, Production-DB `ddckuvvpcytqbyfmbvie`.

---

## 1. Wo liegen Cems Profildaten heute wirklich?

**Drei Speicherorte, nur einer ist live:**

| Ort | Was steht drin | Live genutzt? |
|---|---|---|
| `lib/helmut/config.js` (`cemInceProfile`, 133 Zeilen) | Vollständiges, handgepflegtes Profil (Partei, Ausschuss, 16 Fokusthemen, Themen-Prioritäten, Wahlkreis, Kampagnen, Termine, Risiko-/Chancenthemen …) | Nur als **Fallback**, wenn kein Blob-Profil existiert UND `HELMUT_AUTH_MODE != accounts` |
| `helmut_store.data.profiles['cem-ince']` (JSON-Blob, Supabase-Zeile `id='main'`) | Kopie/Erweiterung von `cemInceProfile`, geschrieben via `saveProfile()` | **JA — das ist die tatsächliche Quelle**, gelesen von `storage.getProfile()` → `getActiveProfile()`/`activeProfile()` |
| SQL-Tabelle `public.profiles` (3 Zeilen: `cem-ince`, `james-brown`, `angela-merkel`) | Nur `id`/`email`/`name` gepflegt — `party`, `committee`, `focustopics`, `embedding` bei **allen 3** NULL | **NEIN** — wird von keinem Read-Pfad für Personalisierung genutzt |
| SQL-Tabelle `public.mandate_profiles` (0 Zeilen) | Existiert mit **fast genau den Feldern**, die `toMandateProfile()` (storage.js:2469) aus dem Blob-Profil ableitet (`partei`, `fraktion`, `rolle`, `politische_ebene`, `wahlkreis`, `bundesland`, `ausschuesse`, `fachpolitische_schwerpunkte`, `aktuelle_kampagnen`, `risiko_themen`, `chancen_themen`, `bevorzugte_kanaele`, `naechste_termine`, …) | **NEIN** — die Blob-eigene `store.mandateProfiles[id]`-Kopie wird gepflegt, aber **nie in diese SQL-Tabelle geschrieben**. Toter, aber strukturell fertiger Zielort. |

**Kernbefund:** Der produktive Lesepfad für JEDES Profil (Cem eingeschlossen) ist der JSON-Blob
(`helmut_store` → `data.profiles[id]`), nicht die relationalen Tabellen. Die relationale Struktur
(`mandate_profiles`) existiert bereits vollständig im Schema, ist aber **nicht verdrahtet** —
das ist die kürzeste Brücke zu Phase 2/3, kein Neubau.

## 2. Wie kommt ein Profil heute zustande? (Admin-Flow, bereits vorhanden)

`POST /api/admin/users` (server.js:867, `accounts.createUser`) kann **schon heute ohne
Codeänderung** ein neues Mandat anlegen:
1. Legt einen Nutzer mit Rolle `abgeordneter` an, leitet automatisch eine eindeutige
   `politicianId` aus Name/E-Mail ab (`accounts.js:154-197`, slug + Kollisionsschutz).
2. „Schnellstart"-Felder (`party`, `faction`, `committee`, `constituency`, `state`,
   `focusTopics`) werden, falls mitgegeben, direkt per `saveProfile(normalizeProfile(...))`
   ins Blob-Profil geschrieben (server.js:876-890).
3. Ein zweiter Endpunkt (server.js:343/351, gleiche `saveProfile`/`normalizeProfile`-Kette)
   erlaubt spätere Bearbeitung.

**Das heißt:** Die Grundmechanik „neues Profil ohne Codeänderung" existiert bereits. Was fehlt,
ist (a) eine SQL-Persistenz statt Blob, (b) die vollen Fachfelder aus dem Pflichtenheft, (c) eine
Admin-Oberfläche, die das sichtbar macht (heute nur API, `client.js` hat dafür keine Formulare
für alle Felder), (d) Vollständigkeits-/Validierungsanzeige, (e) KI-Budget pro Profil.

## 3. Welche Profilfelder werden von Lage/Radar/Helmut/Büro wirklich gelesen?

Aus `matching.js`/`decisions.js`/`lage.js` (verifiziert, siehe `audit/profile-coverage.md` §2-3):

| Gelesenes Feld (Code) | Gewicht im Scoring | Genutzt von |
|---|---|---|
| `committee`/`committees` | 34 Punkte (höchstes Gewicht) | Matching (Ausschuss-Dimension) |
| `party`/`faction` | 22 Punkte | Matching (Partei-Dimension) |
| `constituency`/`state`/`location` | 20 Punkte | Matching (Region/Wahlkreis) |
| `focusTopics`/`topicPriorities` | 12 Punkte + Similarity 24 | Matching (Themen-Dimension) |
| `id` (= politicianId = Mandanten-Schlüssel) | — | **Alles** (Tenant-Scoping) |
| `fullName` | — | Personentreffer (Radar-Erwähnungen), Entity-Ableitung |
| `parliamentType`/`politicalLevel` | — | Landtag/Bundestag-Unterscheidung (`parliamentTypeOf`) |
| `regionalInterests`, `relevantMinistries`, `opponents` | — | Radar/Entity-Erkennung (`inferEntities`) |
| `preferredChannels`, `communicationStyle` | — | Büro (Entwurfs-Ton/-Kanal) |
| `officeHandoffMethod` | — | Büro-Übergabe |
| Rest (`mainQuestion`, `outputNeeds`, `localMedia`, `keyAudiences`, `currentCampaigns`, `publicPositions`, `riskTopics`, `opportunityTopics`, `noGoTopics`, `upcomingAppointments`) | — | Nur im Prompt-Kontext für KI-Erzeugung (Büro-Entwürfe), **kein** Matching-Einfluss |

**Nicht funktional genutzte Felder (heute reine Deko/Prompt-Kontext):** `mainQuestion`,
`outputNeeds`, `localMedia`, `currentCampaigns`, `publicPositions`, `keyAudiences`,
`upcomingAppointments`, `riskTopics`, `opportunityTopics`, `noGoTopics`. Diese sind für die
Büro-Textqualität wertvoll, aber **kein Pflichtfeld** für ein funktionierendes Profil.

## 4. Welche Felder sind leer/veraltet? (Production, gemessen)

- SQL `profiles`: **alle Inhaltsfelder NULL** bei allen 3 Zeilen (siehe §1).
- SQL `mandate_profiles`: **0 Zeilen** — komplett ungenutzt trotz fertigem Schema.
- Blob `store.profiles['james-brown']`/`['angela-merkel']`: **Demo-/Test-Platzhalter**, 0
  decisions, 0 embedding, keine Fachfelder gefüllt (`audit/profile-coverage.md` §3).
- `knowledge_objects.tags`/`policy_field`: **jetzt teilweise gefüllt** (161/217 bzw. 61/217,
  nach dem am 2026-07-12 gelaufenen KO-Backfill — siehe §7).

## 5. Welche Demo-/Test-Profile existieren in Production?

| id | Rolle | Zustand | Empfehlung |
|---|---|---|---|
| `cem-ince` | echter Pilot | vollständig (Blob), aktiv | bleibt |
| `james-brown` | Demo/Test-Platzhalter | leer, 0 Nutzung | **vor echtem Zweitmandanten löschen** (P2-10, eigener Freigabepunkt — Datenlöschung) |
| `angela-merkel` | Demo/Test-Platzhalter | leer, 0 Nutzung | dito |

Beide sind bereits im vorherigen Audit als Löschkandidaten (P2-10) identifiziert; hier nur
bestätigt, nicht ausgeführt (Datenlöschung braucht explizite Freigabe laut Auftrag).

## 6. Aktive Production-Profile

Nur `cem-ince` hat reale Nutzung (73 decisions, 3 briefings, 217 KOs Gesamtkorpus, Radar/Lage
aktiv). Kein zweites reales Mandat aktiv.

## 7. Fehlende Daten für Bundestag/Landtag

- **Landtag/Landesregierung:** keine Crawl-Quelle (bestätigt in `audit/source-coverage.md`) —
  ein Landtags-Profil (z. B. NRW/Bayern) wäre inhaltlich unterversorgt, unabhängig vom
  Profilmodell. `parliamentTypeOf()`/`state`-Feld existieren bereits im Code, sind aber ohne
  Landtags-Quellen wirkungslos. **Das ist eine Quellen-, keine Profilmodell-Lücke** (Phase-2-Fix
  löst das nicht; separater Punkt, außerhalb dieses Sprints).
- **KO-Anreicherung:** lief bereits (2026-07-12, Commit `9a9d419`/`7113f45`, PR #56/#57) —
  `tags` 161/217, `policy_field` 61/217 gefüllt (vorher 0/0). `decisions` von 52 → 73 gestiegen.
  Das ist die "Ergebnisse des KO-Backfills" aus dem Auftrag — **bestätigt gelaufen**, nicht nur
  vorbereitet.

## 8. Profildatenkarte (Feld für Feld)

Legende Nutzerwirkung: **P**=Personalisierung/Matching, **A**=Anzeige/Kontext, **T**=Tenant/Technik.

| Feld | Quelle heute | Zielquelle | Pflicht? | Nutzerwirkung | Fallback | Validierung | Mandantenbezug | Beispiel Cem | Beispiel neues Profil |
|---|---|---|---|---|---|---|---|---|---|
| `id` (politicianId) | Blob-Key, von `accounts.createUser` erzeugt | `mandate_profiles.user_id` = `profiles.id` | **Pflicht** | T | keiner — harter Fehler ohne id | eindeutig, slug-Format | ist der Mandantenschlüssel | `cem-ince` | `anna-beispiel` |
| `fullName`/`name` | Blob | `profiles.name` | **Pflicht** | A, Radar-Personentreffer | keiner | nicht leer | pro Mandant | „Cem Ince" | „Anna Beispiel" |
| Namensvarianten | **fehlt** | neu: `mandate_profiles.namensvarianten text[]` | optional | Radar-Personentreffer bei Kurz-/Titelformen | leeres Array | — | pro Mandant | `["Ince"]` | `[]` |
| `party`/`partei` | Blob (`party`), Zielspalte existiert bereits | `mandate_profiles.partei` | **Pflicht** (oder „fraktionslos") | P (22 Pkt.) | „fraktionslos" statt Rateversuch | Freitext, gegen Synonymliste normalisiert | pro Mandant | „Die Linke" | „SPD" |
| `faction`/`fraktion` | Blob | `mandate_profiles.fraktion` | optional (fällt sonst auf `partei` zurück) | P | = `party` | — | pro Mandant | „Die Linke" | „SPD" |
| Mandatsebene (Bundestag/Landtag) | `politicalLevel` (Blob, Freitext „Bund") | neu: `mandate_profiles.politische_ebene` als **Enum** (`bundestag`/`landtag`) statt Freitext | **Pflicht** | P, T (Quellen-Routing) | keiner | Enum-Check | pro Mandant | „Bundestag" | „Landtag" |
| Bundesland (bei Landtag) | `state` (Blob) | `mandate_profiles.bundesland` | **Pflicht wenn Landtag** | P (Region) | — | Pflicht nur bei `politische_ebene=landtag` | pro Mandant | „Niedersachsen" (Wohnsitz, nicht Mandat) | „Nordrhein-Westfalen" |
| Wahlkreis/Region | `constituency`/`location` | `mandate_profiles.wahlkreis` | **Pflicht** (oder „landesweite Liste") | P (20 Pkt.) | „ohne Wahlkreis (Liste)" | — | pro Mandant | „Salzgitter-Wolfenbüttel" | „Köln I" |
| Ausschüsse | `committee`/`committees` | `mandate_profiles.ausschuesse` (Array, existiert) | **Pflicht** (oder Fachthemen als Ersatz) | P (34 Pkt., höchstes Gewicht) | leeres Array → nur Themen zählen | Label-Normalisierung greift bereits (P1-2) | pro Mandant | „Arbeit und Soziales" | „Gesundheit" |
| stellv. Ausschüsse | **fehlt** | neu: `mandate_profiles.stellvertretende_ausschuesse text[]` | optional | P (kleiner Bonus, noch nicht verdrahtet) | leeres Array | — | pro Mandant | `[]` | `["Digitales"]` |
| Fachthemen/Schwerpunkte | `focusTopics` | `mandate_profiles.fachpolitische_schwerpunkte` (existiert) | **Pflicht** wenn kein Ausschuss | P (12 + Similarity) | leeres Array | mind. 1 Eintrag falls kein Ausschuss | pro Mandant | 16 Themen | `["Pflege", "Digitalisierung"]` |
| regionale Themen | `regionalInterests` | neu: `mandate_profiles.regionale_themen text[]` | optional | P/A (Entity-Erkennung) | leeres Array | — | pro Mandant | „VW-Beschäftigte" | — |
| Regierungsrolle/Opposition | **fehlt strukturiert** | neu: `mandate_profiles.regierungsrolle` (Enum `regierung`/`opposition`/`unbekannt`) | optional (Anzeige) | A | „unbekannt" | Enum | pro Mandant | „Opposition" | — |
| Amt/Funktion | `function`/`role` | `mandate_profiles.rolle` (existiert) | optional | A | „Abgeordnete:r" | — | pro Mandant | „Bundestagsabgeordneter" | „Landtagsabgeordnete" |
| aktiv/inaktiv | `users[].active` (Account-Ebene, existiert) | neu: `mandate_profiles.aktiv boolean default true` (Profil-Ebene, unabhängig vom Login) | **Pflicht** | T (steuert Job-Teilnahme) | `true` | boolean | pro Mandant | `true` | `true` |
| Onboarding-Status | **fehlt** | neu: `mandate_profiles.onboarding_status` (Enum `neu`/`in_bearbeitung`/`abgeschlossen`) | optional (Admin-UX) | A (Admin) | „neu" | Enum | pro Mandant | „abgeschlossen" | „neu" |
| Profil-Vollständigkeit | berechnet zur Laufzeit (`profileCompleteness()`, existiert in config.js) | **kein neues Feld** — bleibt berechnet, nicht gespeichert (sonst Stale-Risiko) | — | A | „empty" | siehe Phase 5 | pro Mandant | „full" | „restricted" |
| Briefing-Einstellungen | `notificationSettings` (Account-Ebene, existiert in accounts.js) | bleibt dort (Account, nicht politisches Profil) | optional | A | Default an | — | pro Mandant | alle an | alle an |
| KI-Budget | **fehlt pro Profil** — nur global (`HELMUT_MAX_LLM_CALLS_PER_DAY`) | neu: `mandate_profiles.ki_budget_taeglich_cent`, `ki_budget_monatlich_cent` | **Pflicht** (mit Systemdefault) | T (Kostenschutz) | Systemdefault (fail-closed, siehe Phase 10) | > 0, ≤ Systemdeckel | pro Mandant | Systemdefault | Systemdefault |
| Kostenstatus | **fehlt** | berechnet aus `llm_usage`, nicht gespeichert | — | A (Admin) | „unbekannt" → fail-closed | siehe Phase 10 | pro Mandant | „im Budget" | „im Budget" |
| Erstellungszeit | `createdAt` (Blob) | `mandate_profiles.created_at` (existiert, Default `now()`) | automatisch | — | — | — | pro Mandant | vorhanden | automatisch |
| Änderungszeit | `updatedAt` (Blob) | `mandate_profiles.updated_at` (existiert) | automatisch | — | — | — | pro Mandant | vorhanden | automatisch |
| Quellenpakete | **fehlt strukturiert** (heute implizit über Ebene+Ausschuss) | neu (spätere Phase, NICHT Teil dieses Sprints): Zuordnungstabelle Profil→Quellenpaket | optional | P (Zukunft) | alle globalen Quellen | — | pro Mandant | „Arbeit&Soziales-Paket" | „Landtag-NRW-Paket" (existiert noch nicht als Quelle) |
| historische Namensvarianten | **fehlt** | Teil von `namensvarianten` (s.o.) — kein separates Feld nötig | optional | P (Radar) | — | — | pro Mandant | — | — |
| Datenschutzstatus | **fehlt strukturiert** (nur `/api/privacy/export`-Funktion vorhanden) | neu: `mandate_profiles.datenschutz_bestaetigt_at timestamptz` | optional (rechtlich empfohlen) | — | NULL = ungeklärt | — | pro Mandant | NULL (nachzuholen) | NULL |
| Löschstatus | **fehlt** (nur `/api/privacy/delete`-Endpoint, löscht sofort) | neu: `mandate_profiles.geloescht_at timestamptz` (Soft-Delete vor Hard-Delete) | optional | T | NULL = aktiv | — | pro Mandant | NULL | NULL |

## 9. Bewertung: was ist Phase-2-relevant vs. außerhalb des Sprints?

- **Sofort verdrahtbar ohne neue Spalten:** `partei`, `fraktion`, `rolle`, `wahlkreis`,
  `bundesland`, `ausschuesse`, `fachpolitische_schwerpunkte`, `aktuelle_kampagnen`,
  `oeffentliche_positionen`, `wichtige_zielgruppen`, `kommunikationsstil`, `risiko_themen`,
  `chancen_themen`, `no_go_themen`, `bevorzugte_kanaele`, `naechste_termine` — die
  `mandate_profiles`-Tabelle hat sie bereits.
- **Neue Spalten nötig (Phase 2):** Namensvarianten, `politische_ebene`-Enum-Härtung
  (aktuell Freitext-kompatibel, sollte Enum werden), stellvertretende Ausschüsse, regionale
  Themen, Regierungsrolle, `aktiv`, Onboarding-Status, KI-Budget (täglich/monatlich),
  Datenschutz-/Löschstatus.
- **Explizit NICHT Teil dieses Sprints:** Quellenpakete-Zuordnungstabelle (Landtag-Quellen
  existieren noch gar nicht), Profil-Vollständigkeit als gespeichertes Feld (bleibt berechnet).

---

*Nächster Schritt: Phase 2 — vollständiges Zielschema in `docs/multitenancy-profilmodell.md`.*
