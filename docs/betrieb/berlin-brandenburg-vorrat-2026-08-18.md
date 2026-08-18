# Berlin/Brandenburg-Vorrat für die 25-Mandate-Stufe (Parallelsprint 2026-08-18)

**Sprint:** isolierter Parallelsprint zur Verkaufsstart-Vorbereitung Berlin/Brandenburg ·
**Zustand: Teilweise abgeschlossen** (Vorrat gebaut und getestet; Aktivierung bewusst nicht
Teil dieses Sprints, PR-Merge erst nach der ersten grünen OP-30-Wirkungskontrolle) ·
**Production unberührt:** keine Migration, keine Supabase-Mutation, kein Flag, kein Cron,
kein Lauf, keine Änderung an Warteschlange/Worker/Dispatch/CAS, die 5 aktiven Mandate
unverändert, Berlin/Brandenburg unverändert inaktiv.

**Kanonische neue Artefakte:**
[`seeds/landtag-testmandate.js`](../../lib/helmut/quellenarchitektur/seeds/landtag-testmandate.js) ·
[`seeds/landesstufe-kapazitaet.js`](../../lib/helmut/quellenarchitektur/seeds/landesstufe-kapazitaet.js) ·
[`seeds/parlamentszusammensetzung.js`](../../lib/helmut/quellenarchitektur/seeds/parlamentszusammensetzung.js)
(neu: `ABGEORDNETENHAUS_BERLIN_19`) ·
[`scripts/landtag-testmandate-test.js`](../../scripts/landtag-testmandate-test.js)

> **Absichtlich NICHT geändert:** `docs/CURRENT_STATE.md` und alle OP-30-Vollzugsabschnitte —
> der heutige OP-30-Production-Test läuft parallel im bestehenden Chat. Die Statusaufnahme
> gehört nach dessen Abschluss in den regulären Statuspfad.

---

## 1 · Bestandsaufnahme (Teil A) — was bereits fertig ist

Geprüft am 2026-08-18 gegen `main` `6bc5e35`. Nur Verdichtung mit Fundstellen; Details in den
kanonischen Dokumenten.

| Baustein | Stand | Fundstelle |
|---|---|---|
| **Parser Berlin (PARDOK)** | fertig und gemergt (PR #177): `<Vorgang>`-Adapter, DBID-Identität, Vorgangsbezug 1:n **gemessen** (0 von 47 415 n:m), fail closed | `quellenarchitektur/17-pardok-parser.md` Teil A–C |
| **Parser Brandenburg (parldok)** | fertig und gemergt: `VNr#ReihNr`-Identität, delete-Stubs, 11 Dokumentarten belegt, 411 Vorgänge ohne `VNr` → Bezug ehrlich `null` | dito |
| **Dokumentklassen + Rohdokument-Vertrag** | fertig: 8 Klassen, getrennte Typtabellen je Land, Dedup-Regel 0 (externe Kennung vor Adresse), Gate-Ergänzung auf Landessignal begrenzt | dito, Teil B |
| **E2E-Verträge MdA/MdL** | fertig (offline): Berlin 76/76 + 10/10 Mutationen rot (26A), Brandenburg 98/98 + 17/17 rot (27A inkl. Zuständigkeitsraum-Fix) — Briefing/Lage/BELEG/Erklärung/Mandantentrennung je Landesprofil bewiesen | Roadmap Punkte 26/27 |
| **Quellen als Vorrat** | 10 Berliner + 9 Brandenburger Wege in Production angelegt, **alle inaktiv** (`needs_review`/`manual`); `berlin-basis` seit 26.07. `active` **und neutral** (Block A, Befund A-3 geschlossen); `brandenburg-basis` `prepared` | `betrieb/berlin-aktivierung.md` §21/§22 |
| **Aktivierungswerkzeuge Berlin** | real erprobt: 9 Aktivierungsdateien, 4 Profildateien, 6 Rollback-Ebenen, 2 Dry Runs, Auswertung — Aktivierung + Rollback liefen am 26.07. fehlerfrei in Production (17 s Not-Aus) | dito §9/§12/§22 |
| **Vier-Riegel-Sperre** | Flag je Land + berechtigtes Landtagsmandat (UND-verknüpft) + Paketstatus + Wegstatus; Fallback-Katalog zusätzlich gesperrt | dito §4, `07-paketaktivierung…` |
| **Profilmodell MdL** | technisch identisch zu MdB: gleiche `mandate_profiles`-Zeilen, gleiche Validierung; einziger Unterschied ist `politische_ebene='landtag'` + `bundesland` → Landespaket-Pflicht. Befunde P-1/P-2 (gemappte Form, zwei Zeilen) dokumentiert | `seeds/berlin-profilplan.js` |
| **Mandantentrennung** | App-seitig (`assertTenant` + `user_id`-Filter), RLS inert; für einen zahlenden Zweitmandanten bleibt **OP-03** verbindlich — zusätzliche *Testmandate* ändern das Modell nicht | `quellenarchitektur/05-sicherheitsmodell-rls.md` |

**Echte Blocker vor einer kontrollierten Aufnahme (unverändert, nichts davon in diesem Sprint lösbar):**

1. **OP-30-Nachweis:** Versuch 3 nicht gestartet; Abflussraten-Entscheidung offen (CURRENT_STATE §11).
2. **Wirksamkeit von `HELMUT_LANDESMODULE` in Production unbewiesen** (der einzige Berliner Lauf brach vor der Telemetrie ab).
3. **Berlin ohne amtliche parlamentarische Quelle im Aktivierungsset** (`rp-be-landesparlament` veraltet, `rp-be-plenum`-Dispatch liefert `items: []`).
4. **Brandenburg: PARDOK-Live-Ingest-Cutover fehlt** (Vorbedingung: jeder Weg reicht die externe Kennung durch, 17-pardok-parser §C.5) → bis dahin 0 liefernde BB-Wege.
5. **Seeds `20260713`/`20260717` nicht eingespielt** (BLOCKIERT, Betreiberfreigabe; `betrieb/quellen-seed-einspielung.md`).
6. **Vercel-Flagzugang** bleibt Betreiberaktion; Cloud-Sitzungen können Flags weder lesen noch setzen.
7. **Wahl zum 20. Abgeordnetenhaus am 20.09.2026** (amtlich festgesetzt, Senatsbeschluss 03.06.2025): `pardok-wp19.xml` und jede WP-19-Personenauswahl veralten in Wochen — Vorprüfung §5 Schritt V-0.

## 2 · Was dieser Sprint neu gebaut hat (Teil C)

Alles rein lokal, deaktiviert, ohne Laufzeitwirkung (testgesichert, Suite G2: kein
Laufzeitmodul importiert den Vorrat):

1. **Berliner Parlaments-Sollmenge** `ABGEORDNETENHAUS_BERLIN_19` (Wiederholungswahl
   12.02.2023: CDU 52 · SPD 34 · Grüne 34 · Die Linke 22 · AfD 17 = 159; FDP 4,6 % nicht
   vertreten) — damit ist die Fraktionsprüfung für **beide** Landesmodule extern verankert,
   nicht mehr nur für Bund und Brandenburg. Inklusive Pflege-Hinweis auf den Wahltag 20.09.2026.
2. **20 synthetische, deaktivierte Landtags-Testmandate** (12 Berlin `test-mda-be-01…12`,
   8 Brandenburg `test-mdl-bb-01…08`) mit vollständigen, validierbaren Profilfeldern,
   belegten Ausschüssen (10 AGH-Ausschüsse, 8 Landtagsausschüsse mit amtlichen Fundstellen)
   und Selbstschutz-Vertrag (`validateLandtagTestmandate`, inkl. Mutations-Gegenproben).
   **Bewusst synthetisch statt real:** die Berlin-Wahl am 20.09.2026 macht jede reale
   WP-19-Auswahl binnen Wochen alt, und die byte-genaue Verifikation amtlicher Profilseiten
   ist aus dieser Umgebung gesperrt (Egress-403). Die Auswahl realer Personen ist ein eigener
   Schritt nach der Wahl, mit eigener Verifikation (Muster: `seeds/bundestag-testmandate.js`).
3. **Kapazitätsmodell** `landesstufe-kapazitaet.js` für +5/+10/+20 Mandate — jede Eingabe mit
   Herkunft (`gemessen`/`prognose`/`simuliert`/`annahme`) und Beleg (§4).
4. **Testsuite** `landtag-testmandate-test.js` (54 Prüfungen): Sollmenge Berlin ·
   Seed-Vertrag + 5 Mutations-Gegenproben · fail closed (deaktivierter Vorrat aktiviert
   nichts; selbst aktivierte Kopien aktivieren `prepared`-Pakete nicht) · Profilnormalisierung
   (jede aktivierte Kopie „vollständig", Briefing/Radar/Lage-fähig) · keine Vermischung
   (BE↔BB, MdB↔MdL, Riegel 1/1b, Fallback-Sperre) · Kapazitätsmodell (Determinismus,
   ehrliche Deckelaussage, keine erfundene Brandenburg-Zahl).

## 3 · Die 20 empfohlenen Testmandate (Teil B)

**Verteilung Berlin 12 / Brandenburg 8.** Begründung: größeres Parlament (159 vs. 88 Sitze),
5 vs. 4 Fraktionen, und die Berliner Quellen-/Werkzeuglage ist weiter (Aktivierungsreife
erreicht und real erprobt; Brandenburg hängt zusätzlich am PARDOK-Cutover). Keine politische
Bewertung: die Mischung folgt der amtlichen Sitzverteilung und maximaler Abdeckung von
Fraktionen, Ausschüssen, Themen und Regionen.

| Land | Fraktion | Anzahl | Ausschüsse/Schwerpunkte |
|---|---|---|---|
| Berlin | CDU | 3 | Hauptausschuss (Haushalt) · Inneres/Sicherheit/Ordnung · Stadtentwicklung/Bauen/Wohnen |
| Berlin | SPD | 2 | Bildung/Jugend/Familie · Gesundheit/Pflege |
| Berlin | Grüne | 2 | Umwelt-/Klimaschutz · Wissenschaft/Forschung |
| Berlin | Die Linke | 2 | Stadtentwicklung (Mieten/Wohnen) · Verfassung/Recht/Verbraucherschutz — **einzige Profile mit `die-linke-berlin`** |
| Berlin | AfD | 2 | Wirtschaft/Energie/Betriebe · Verfassungsschutz |
| Berlin | Fraktionslos | 1 | ohne Ausschuss, Schwerpunkte tragen (Sonderpfad `partei_oder_fraktionslos`) |
| Brandenburg | SPD | 2 | Inneres/Kommunales · Bildung/Jugend/Sport |
| Brandenburg | AfD | 2 | Wirtschaft/Arbeit/Energie/Klimaschutz · Infrastruktur/Landesplanung |
| Brandenburg | BSW | 2 | Gesundheit/Soziales · Europa/Entwicklungspolitik |
| Brandenburg | CDU | 2 | Haushalt/Finanzen · Landwirtschaft/Umwelt/Verbraucherschutz |

Eingebaute Testfälle: geteilter Ausschuss über zwei Fraktionen (BE-03/BE-08) ·
Fachpolitik-Zwilling über Ländergrenze (BE-01/BB-07, Trennungsnachweis) · Sozialbegriff-
Trennschärfe (BE-05 „Pflege" und BB-05 „Soziales" ziehen `arbeit-und-soziales`, BB-03
„Arbeit" im Ausschussnamen gemessen **nicht**) · BSW existiert nur im Landtag Brandenburg ·
kein Brandenburger Linke-Mandat (8. WP nicht vertreten, Sollmengen-gesichert) ·
Stadtstaat-Bezirke vs. Landkreise/kreisfreie Städte · Direkt- und Listenmandate.

## 4 · Kapazität, Kosten, Testbarkeit (Teil B 7–9)

Rechnung: `berechneLandesstufe(n)`; alle Zahlen mit Herkunft und Beleg im Modul. Kernergebnis:

| Stufe | Mandate | LLM/Tag Mittel¹ | LLM/Tag Spitzentag¹ | Narrativ USD/Tag² |
|---|---|---|---|---|
| +5 | 10 | ~77 | ~113 | 0,013 |
| +10 | 15 | ~82 | ~118 | 0,020 |
| +20 | 25 | ~93 | ~129 | 0,033 |

¹ global gemessen Mittel 64/Spitze 100 (26.07., Vor-CAS-Architektur) + 1,05 mandatsbezogene
Aufrufe je Mandat/Tag (Simulation 200 Mandate) + Berliner Zusatz ≤ 2,6.
² Messreihe 0,001307 USD je Lage-Narrativ (126 bepreiste Aufrufe); das Verstehen kostet heute
~0,14 USD/Tag (Untergrenze) und wächst mit der Dokumentmenge, nicht mit der Mandatszahl.

**Ehrliche Antworten auf die Testbarkeitsfrage:**

- **Auf dem heutigen Pfad (OP-30 aus) ist keine der drei Stufen seriös testbar.** Der
  16:00-Lauf brauchte bei n=5 bereits ~4 min (Limit 270/280 s), und OP-30-Versuch 2 scheiterte
  bei 5 Mandaten an Abfluss 130–180 gegen Ankunft 440–470 Aufträge/Tag.
- **Mit dem neuen Motor ist die 25er-Stufe lokal bewiesen** (Morgenslot-Simulation: 25/25 im
  Fenster, Reserve 89,3 %, < 60 s, Parallelität 2, 1 Slot — Stufe 2 des Aktivierungsplans in
  `op30-kapazitaet-morgenslots-2026-08-09.md` §10), aber **nicht in Production**.
- **KI-Tagesdeckel (100 + 30 Reserve):** das Tagesmittel passt bei 25 Mandaten (~93), der
  gemessene Spitzentag (global 100) **überschreitet den Deckel** (~129 > 100, knapp innerhalb
  von 100+30). Fail-closed heißt: nichts bricht, Arbeit verschiebt sich — aber ein
  Beweisfenster braucht einen ruhigen Tag oder eine Deckelanhebung (Betreiberentscheidung).
  Zusätzlich ist der **wirksame** Production-Deckel offline nicht lesbar (Code-Fallback 50).
- **Cron-Zeiten:** unverändert ausreichend für die Morgenlage nur mit dem neuen Motor
  (1 Slot 05:45 genügt für 25 laut Simulation); der Altpfad bräuchte Slots, die es nicht gibt.

**Fehlende Messungen (nicht behauptet):** Brandenburg-Dokument-/Aufrufmenge (0 Messungen bis
zum PARDOK-Cutover) · realer Berliner Ertrag über mehrere Läufe · mandatsbezogene Aufrufe
unter CAS · wirksamer Production-Deckel · Wirkung von `HELMUT_LANDESMODULE` in Production.

## 5 · Späterer Aktivierungsplan (nur Freigabe-Vorlage, nichts ausgeführt)

**Vorprüfung (alle müssen grün sein, sonst kein Start):**

- **V-0 Wahlperiodenlage Berlin:** vor/nach dem 20.09.2026 prüfen, ob `pardok-wp19.xml` noch
  die laufende WP ist und ob die 19.-WP-Ausschussliste noch gilt; nach der Wahl zuerst
  Sollmenge + Seeds pflegen (belegpflichtig).
- V-1 OP-30-Wirkungskontrolle grün (CAS-Betrieb stabil, Abflussrate entschieden, Stufenplan
  freigegeben); nach jeder OP-30-Aktivierung OP-25 vollständig wiederholen.
- V-2 Quellen-Neuverifikation ≤ 14 Tage alt (`sprint9b-verify.yml`, Frischegate).
- V-3 keine frisch deployten Pipeline-Umbauten, kein manueller Vollpipeline-Lauf im Fenster
  (Lehre aus dem 26.07.).
- V-4 Betreiber-Flagzugang vorhanden (`HELMUT_LANDESMODULE`, Vercel-Env).
- V-5 für Brandenburg zusätzlich: PARDOK-Cutover mit durchgereichter externer Kennung.

**Stufen (je Stufe eigene Freigabe, Reihenfolge bindend):**

1. Berlin nach `berlin-aktivierung.md` §9 mit **einem** Abnahmeprofil (Runbook steht, real
   erprobt) → Betriebsnachweis 3 Tage/6 Läufe.
2. +5 Berliner Testmandate (aus diesem Vorrat, per Betreiberentscheidung aktiviert) →
   Beobachtung nach §10-Metriken.
3. +7 weitere Berliner Mandate (BE komplett, n=13).
4. Brandenburg-Basisstufe (RSS-/Suchwege) + 4 BB-Testmandate, erst nach V-5 auch PARDOK.
5. +4 restliche BB-Mandate → Zielbild 25.

**Abbruchgrenzen (zusätzlich zu `berlin-aktivierung.md` §11, die vollständig weitergelten):**

- ein Mandat ohne Morgenlage bis 06:30 UTC → Stufe halten, Ursache klären
- LLM-Tageszähler erreicht an zwei Tagen in Folge den Deckel → Stufe zurück
- Warteschlangen-Rückstand wächst über zwei Läufe monoton → sofort Stufe zurück (Versuch-2-Muster)
- ein Berliner/Brandenburger Inhalt erscheint bei einem Mandat des jeweils anderen Landes
  oder bei einem MdB-Profil als Landespflichtinhalt → sofortiger Abbruch (Trennungsverstoß)

**Rücknahme:** je Stufe genügt das Deaktivieren der Testmandate (`aktiv = false` —
datenbankseitig, aus einer Cloud-Sitzung ausführbar, Muster Rollback-Ebene 0b, real erprobt
in 17 s); darunter unverändert die 6 Rollback-Ebenen des Berliner Runbooks. Kein Rollback
löscht erzeugte Daten.

## 6 · Testergebnisse dieses Sprints

Stehen im PR (echte Zahlen aus dem CI-Lauf); lokal: neue Suite 54/54,
`parlamentszusammensetzung-test.js` 65/65 mit der neuen Berliner Sollmenge.

## 7 · Bewusst nicht enthalten

Keine Aktivierung, keine Production-Profile, keine Migration, kein Seed-Einspielen, keine
Flag-/Cron-/Env-Änderung, keine Änderung an OP-30-Pfaden (Warteschlange, Worker, Dispatch,
CAS), keine realen Personen, keine Kontaktaufnahme mit Parlamenten, keine Änderung an
`docs/CURRENT_STATE.md` (läuft parallel im OP-30-Chat), kein Umbau bestehender E2E-Verträge.
