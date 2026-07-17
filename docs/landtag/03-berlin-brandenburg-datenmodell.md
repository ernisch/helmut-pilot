# Landtag-Megasprint — Phase 5/6: Vollmodell Berlin & Brandenburg (inaktiv)

**Stand:** 2026-07-17 · Web-verifiziert gegen amtliche Quellen (Suchtreffer/Seitentitel; Direktabruf der amtlichen Seiten war aus der Arbeitsumgebung durch den Netz-Proxy blockiert — deshalb verlangt die Aktivierungscheckliste eine amtliche Endprüfung vor jedem Prod-Seed).

## Modellumfang

| Element | Berlin (`seeds/landtag-berlin.js`) | Brandenburg (`seeds/landtag-brandenburg.js`) |
|---|---|---|
| Parlament | Abgeordnetenhaus von Berlin (`parliament-berlin-agh`, bestand) | Landtag Brandenburg (`parliament-brandenburg-landtag`, bestand) |
| Regierung | Senat von Berlin (bestand) + **Senatskanzlei + 10 Senatsverwaltungen** (neu, Zuschnitt seit 2023) | Landesregierung (bestand) + **Staatskanzlei + 9 Ministerien** (neu, Kabinett Woidke V seit 18.03.2026) |
| Ausschüsse | **18 ständige Ausschüsse** der 19. WP | **14 ständige Ausschüsse** der 8. WP (Haupt/Petition/Wahlprüfung + A3–A13) |
| Fraktionen | CDU, SPD, Grüne, AfD (neu) + Linke (bestand: `group-agh-linke`) | SPD, AfD, CDU, BSW |
| Gruppen | — (keine im AGH) | **Gruppe „Wir für Brandenburg"** (3 Ex-BSW, anerkannt 03/2026) |
| Wahlkreise | **78** („Bezirk N", Verteilung Senatsbeschluss 03.06.2025 für AGH-Wahl 2026; Summe testerzwungen) | **44** (LTW 2024; 41 amtlich belegt, **28/34/42 teilverifiziert**) |
| Behörden | Rechnungshof von Berlin, BlnBDI, Landeswahlleitung (+ Amt für Statistik BE-BB, bestand) | Landesrechnungshof, Landesverfassungsgericht, LDA, Landeswahlleitung (teilverif.) |
| Medien | Tagesspiegel, rbb24 (im Kandidaten-Seed) + Berliner Zeitung, Morgenpost, B.Z., taz | MAZ, rbb24 (im Kandidaten-Seed) + MOZ, Lausitzer Rundschau, PNN, Nordkurier |
| Relevanzregeln | Senat/Senatsverwaltung/Reg. Bürgermeister + Kurzformen (SenBJF …) | Landesregierung/Staatskanzlei/MP + Kurzformen (MIK, MBJS …) |
| Amtliche Quellen | PARDOK (be-plenum), LPD, AGH — im 20260717-Kandidaten-Seed | parldok (bb-plenum), StK, Ministerien — im 20260717-Kandidaten-Seed |
| Testprofil (anonym) | `test/fixtures/profiles/landtag-berlin-testprofil.json` | `…/landtag-brandenburg-testprofil.json` |

## Wichtige Rechercheergebnisse (weichen von naiven Annahmen ab)

1. **Brandenburg regiert seit 18.03.2026 als SPD-CDU (Kabinett Woidke V)** — der Ressortzuschnitt der Regierungsbildung 12/2024 (SPD-BSW) ist überholt: MdFE→MdF (Europa ans Wirtschaftsressort), MWAEK→MWEKE, MGS→MASGZ. Die Landtags-Ausschüsse A7/A8 wurden im WP-Verlauf entsprechend umbenannt.
2. **BSW-Fraktion geschrumpft** (Austritte 11/2025 + 01/2026, heute 9 Sitze); die **Gruppe „Wir für Brandenburg"** (3 Sitze) wurde 03/2026 anerkannt. Fraktionsstärken ändern sich laufend — das Modell führt bewusst KEINE Sitzzahlen als Daten.
3. **Berlins Rechnungshof heißt amtlich „Rechnungshof von Berlin"** (nicht „Landesrechnungshof Berlin").
4. **Berliner AGH-Wahlkreisverteilung ändert sich zur Wahl 2026** (Friedrichshain-Kreuzberg 6→5, Treptow-Köpenick 6→7). Das Modell führt die 2026er-Einteilung (amtlich beschlossen), dokumentiert die Abweichung zur laufenden 19. WP.
5. **3 Brandenburger Wahlkreisnamen (28 Dahme-Spreewald III, 34 Märkisch-Oderland IV, 42 Spree-Neiße II)** sind nur indirekt belegt und im Seed als prüfpflichtig markiert.

## Nichtaktivierungs-Garantien

- Die Modelle sind **reine Daten** (Entitäten/Wahlkreise/Kataloge). Entitäten sind kein Crawl-Gegenstand — es entsteht **kein** Abrufweg, **kein** Publisher, **keine** Paket-/Statusänderung.
- Der generierte PREPARED-Seed (`supabase/seeds/20260722_landtag_vollmodell_be_bb_seed.sql` + Rollback) fügt ausschließlich `political_entities` + `electoral_districts` ein (idempotent, nicht-destruktiv) und wurde **NICHT angewendet**. Testerzwungen durch `scripts/landtag-vollmodell-test.js` (5a–5d).
- Klassifikations-Einbindung ist kollisionsfrei: Landes-Ausschüsse/-Fraktionen tragen **kein** `canonical_key` — der `committee:<key>`-Index bleibt exklusiv Bundestag (testerzwungen, 4c/4d).

## Quellen (Recherche 2026-07-17)

parlament-berlin.de (Ausschüsse 19. WP, Fraktionen), berlin.de/rbmskzl (Geschäftsverteilung Senat, PM Wahlkreise 2026), wahlen-berlin.de, landtag.brandenburg.de (Ausschüsse 8. WP, Kabinettsvereidigung 03/2026), brandenburg.de (Ressorts), wahlergebnisse.brandenburg.de (amtliche Wahlkreis-Seitentitel LTW 2024), service.brandenburg.de (Behördenverzeichnis); Presse (Tagesspiegel u. a.) als Zweitquelle für Fraktionsdynamik.
