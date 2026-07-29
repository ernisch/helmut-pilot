# Analyse der Phase-1-Punkte 24 bis 30

**Erstellt:** 2026-07-29 · **Branch:** `claude/roadmap-analysis-24-30-ssbf0l` ·
**Geprüfter Stand:** `main` = `b1d450c` (Merge #169) · **Art:** reine Analyse, **kein**
Production-Zugriff, **keine** Produktlogik geändert.

**Zweck:** Die Punkte 24–30 der [`phase_1_checkliste.md`](phase_1_checkliste.md) sind alle
offen (☐) und ihre Abnahmekriterien stammen aus einer Zeit, in der Berlin/Brandenburg als
laufende Versorgung erwartet wurden. Dieses Dokument prüft je Punkt: *Was ist das eigentliche
Produktziel? Was muss wirklich bewiesen werden? Was ist pilotblockierend? Was ist es nicht?*

**Verhältnis zu anderen Dokumenten:** Die Checkliste bleibt die operative Wahrheit über den
**Status**; [`../datenmotor-restliste.md`](../datenmotor-restliste.md) bleibt die einzige
verbindliche Liste der **offenen Punkte**. Dieses Dokument bewertet nur die **Kriterien** der
Punkte 24–30 und ändert keinen Status.

**Mandantenneutralität:** Der Pilotmandant wird hier durchgehend „Pilotmandant" genannt, nie
mit Klarnamen (`START_HERE.md` §5.4, `CLAUDE.md` §4.2).

---

## 0 · Belegbasis dieser Analyse

Alles Folgende ist am 2026-07-29 gegen `main` geprüft — Code gelesen, Tests ausgeführt.
Keine Production-Abfrage.

| # | Befund | Beleg |
|---|---|---|
| B-1 | Der PARDOK-**Parser** ist heute **vollständig grün**, für **beide** Länder, inklusive adversarialer Fälle | `node scripts/pardok-parser-test.js` → „ALLE TESTS GRÜN"; Gold-Fixtures `test/fixtures/pardok/{berlin,brandenburg}-gold.xml` |
| B-2 | Der PARDOK-**Dispatcher** kann **konstruktionsbedingt** keine Items in die Pipeline geben. `off` (Default) und `shadow` sind die einzigen Modi; `on`/`live` fallen auf `off` zurück | `lib/helmut/quellenarchitektur/pardok-dispatch.js:11–14,38,41,72–113` |
| B-3 | Der Mandanten-Cron arbeitet **alphabetisch sortiert, seriell, mit harter Deadline** und **ohne Rotation, ohne Nachholen** | `server.js:6070–6114` (`runCronForTenants`), `lib/helmut/tenant-context.js:78` (`ids.sort()`) |
| B-4 | Abgeschnittene Mandate werden nur **sichtbar gemacht** (systemError), nicht **nachgeholt** | `server.js:6100–6112` |
| B-5 | Der Zeitbudget-Ausfall ist **real eingetreten**: 4 von 6 aktiven Mandaten wurden über Tage nie gecrawlt | [`../betrieb/incident_2026-07-25_crawl_mandantenamplifikation.md`](../betrieb/incident_2026-07-25_crawl_mandantenamplifikation.md) §RC-4 |
| B-6 | Das Matching sieht **höchstens die 200 zuletzt aktualisierten** Wissensobjekte und behält 20 | `lib/helmut/matching.js:448,461`; `lib/helmut/storage.js:2293` (`order=updated_at.desc&limit=…`) |
| B-7 | Production führt **1 193** Wissensobjekte → das Matching sieht davon maximal **~17 %** | Checkliste Punkt 19 (read-only 2026-07-27) + B-6 |
| B-8 | Matching läuft **innerhalb** des Mandantenlaufs **nach** Crawl/Understanding; die Phasen davor verbrauchen das Budget zuerst | `lib/helmut/scheduler.js:235–248, 334, 355–372, 412` |
| B-9 | Die Matching-Auditpersistenz ist gebaut und migriert, aber **`HELMUT_MATCHING_AUDIT` existiert nicht in Vercel** → keine Lauf-ID an Ergebnissen | [`../CURRENT_STATE.md`](../CURRENT_STATE.md) Kopf, Checkliste Punkt 23 |
| B-10 | Berlin: 10 Wege, Brandenburg: 9 Wege — **0 Abrufe, 0 Dokumente** | Checkliste Punkte 14/15 |
| B-11 | Die Landesaktivierung ist in der verbindlichen Restliste als **P3 „Spätere Erweiterungen"** geführt | [`../datenmotor-restliste.md`](../datenmotor-restliste.md) OP-21 |
| B-12 | Die kanonische Offline-Suite ist in einer Claude-Cloud-Sitzung **nicht reproduzierbar**: mit gesetzten Supabase-Secrets **163/177**, ohne sie **173/177** (dokumentiert für `main`: 177/177) | eigene Läufe `node scripts/run-offline-tests.js`, siehe §4 OP-26 |

---

## 1 · Korrekturen an der Ausgangsanalyse

Die vorgelegte Analyse ist in Aufbau und Stoßrichtung tragfähig. Vier Punkte sind gegen
`main` jedoch nicht haltbar oder veraltet:

1. **„Brandenburg hat den Parsernachweis nicht in jedem Fall bestanden."** Veraltet
   (Stand Mitte Juli). Heute grün, inklusive der schwierigen Fälle: verschachtelte
   `<Vorgang>`-Dokumente mit `ReihNr`-Diskriminierung, Lösch-Stubs (`VFunktion`),
   Wahlperioden-Vorrang `<Wp>` vor `DokNr`-Präfix, HTML-Fehlerseiten-Erkennung,
   Record-Cap bei Großexporten (B-1).
2. **„Der Dispatcher lieferte in jedem Modus keine Items" (als Defekt gelesen).** Das ist
   **kein Defekt, sondern ein Riegel**: der Live-Modus ist bewusst nicht verdrahtet, der
   Cutover ist eine eigene Freigabeentscheidung (B-2). Punkt 24 kann deshalb **nie** durch
   einen Livepfad-Nachweis geschlossen werden, solange dieser Riegel steht — das ist gewollt.
3. **„Nicht zwingend erforderlich ist ein manueller Productionendpunkt für einzelne
   Mandanten."** Zutreffend — aber die daraus abgeleitete Beruhigung trägt nicht: es gibt
   heute **weder** ein Nachholen **noch** eine Rotation. Der alphabetisch letzte Mandant wird
   bei knappem Budget **systematisch** übersprungen, nicht zufällig (B-3/B-4/B-5). Das ist
   schärfer als „potenziell ein echter Pilotblocker" — es ist ein belegter, bereits
   eingetretener Versorgungsausfall.
4. **Klarname des Pilotmandanten.** Die Vorlage nennt ihn durchgehend. Im Repository ist das
   unzulässig (`CLAUDE.md` §4.2). Hier durchgehend „Pilotmandant".

Zusätzlich fehlten in der Vorlage die Punkte **29** und **30** vollständig; Punkt 28 brach ab.

---

## 2 · Management-Zusammenfassung

**Die sieben Punkte sind keine sieben Sprints.** Es bleiben fünf reale Arbeitsblöcke:

1. Punkt 23 vollständig abschließen (Flag-Freigabe + Beweislauf) — Voraussetzung für die
   Nachvollziehbarkeit, die Punkt 25 verlangt (B-9).
2. **Fairness und Vollständigkeit der Mandantenverarbeitung** herstellen und beweisen
   (B-3…B-5) — der einzige neu gefundene, harte Pilotblocker.
3. Den Ende-zu-Ende-Nachweis für den Pilotmandanten in einem **natürlichen** Lauf führen
   (Punkt 25).
4. Berlin und Brandenburg **offline** mit echten amtlichen Dokumenten bis ins Briefing
   beweisen (Punkte 24/26/27/28) — **ohne** Production-Aktivierung.
5. Fehlerpfade, Wiederholungen und Abnahme als zusammenhängendes Betriebsgate (Punkte 29/30).

**Pilotblockierend sind:** ausgelassene Mandanten ohne Nachholen (B-3…B-5) · unvollständig
veröffentlichte Matchingläufe · stiller Fallback bei fehlendem Profil · mandantenfremde Daten
in App/Briefing · veraltete Briefings ohne Kennzeichnung · dauerhaft nicht nachgeholte
KI-/Lock-/Kostenausfälle · fehlende Nachvollziehbarkeit Quelle→Briefing.

**Nicht pilotblockierend sind:** Berliner oder Brandenburger Production-Aktivierung · echte
Landtags-Kundenaccounts · Production-E2E beider Landesmodule · vollständige Abdeckung seltener
Landtags-Dokumentarten · datenbankseitige RLS-Durchsetzung, solange der Pilotmandant der
einzige reale Mandant ist und die App-Guards belegt sind
([`../quellenarchitektur/05-sicherheitsmodell-rls.md`](../quellenarchitektur/05-sicherheitsmodell-rls.md)).
Das ist keine Ermessensfrage: die Restliste führt die Landesaktivierung selbst als **P3**
(B-11).

**Empfehlung:** Phase 1 als **„Bundesdatenmotor + Landtags-Aktivierungsreife"** abnehmen.
Punkte 26/27 in Phase 1 als **isolierte, realitätsnahe Nachweise** erfüllen; die echten
Production-Nachweise gehören in einen späteren Landes-Pilot-Sprint (OP-21).

---

## 3 · Analyse je Punkt

### Punkt 24 — Landtags-Parser Berlin und Brandenburg prüfen

**Abnahmekriterium (Checkliste):** „Drucksachen, Anfragen, Sitzungen und Vorgänge werden
korrekt getrennt."

**Eigentliches Ziel:** nicht Absturzfreiheit, sondern dass ein Landesvorgang später politisch
verwertbar ist: Dokumentart, Vorgangszugehörigkeit, Aktualität/Ersetzung, Institution/Fraktion,
Ebene und Geografie, erhaltene Originalquelle und stabile Kennung.

**Ist-Stand (belegt):** Der **Parservertrag ist faktisch erfüllt** (B-1). Getrennte Adapter je
Land, `politische_ebene='land'` und `geografie` als **getrennte** Eigenschaften
(`pardok-parser.js:28–29,120–134,168–183`), stabile Identität (Berlin: `DBID`; Brandenburg:
`VNr` + `DokNr`/`ReihNr`), Inhaltsfingerabdruck gegen Falsch-Zusammenführung, Fundstellen statt
Dubletten, Lösch-Stubs übersprungen, HTML-Fehlerseiten erkannt, Record-Cap bei Großexporten.
**Was fehlt, ist nicht der Parser, sondern der Weg dorthin** (B-2).

**Empfohlene Aufteilung:**

- **24A Parservertrag** — heute erfüllbar und praktisch erfüllt. Verbleibende Lücke: je Land
  ein Goldfall **je geforderter Dokumentklasse** (Drucksache · Anfrage · Sitzung · Vorgang)
  explizit ausweisen, damit das Abnahmekriterium wörtlich und nicht nur sinngemäß belegt ist.
  Zusätzlich: **Fixture-Drift** prüfen — die Gold-Fixtures gegen einen frisch gezogenen
  amtlichen Export gegenhalten.
- **24B Ingestionsbereitschaft** — dokumentieren, dass der Parser **bewusst** keinen Livepfad
  hat, wo der Cutover ansetzen müsste (Flag, Größenlimit, Timeout, Telemetrie, Fehlerpfad),
  und einen **isolierten** Lauf von einem gespeicherten Export bis zu normalisierten
  Rohdokumenten zeigen. **Kein Production-Lauf nötig.**

**Pilotblocker:** nein — der Pilotmandant ist Bundestagsmandat. Blockierend wäre nur eine
gemeinsame Parseränderung, die den Bundespfad beschädigt (heute nicht der Fall: der Dispatcher
ist inert).

**Aufwand:** 24A ≈ 0,5–1 Tag (Klassenabdeckung + Drift-Prüfung); 24B ≈ 0,5 Tag Dokumentation.

**Urteil:** Der Punkt ist **falsch benannt**. Er ist heute zu ~80 % erfüllt und scheitert an
einem Kriterium, das er nie hatte („Ingest"). Empfehlung: als 24A/24B trennen und 24A nach der
Klassenabdeckung auf ✅ setzen.

---

### Punkt 25 — Ende-zu-Ende-Test für den Pilotmandanten

**Abnahmekriterium:** „Der Pilotmandant erhält passende Bundespolitik bis ins fertige Briefing."

**Eigentliches Ziel:** eine aktuelle, persönliche, handlungsorientierte Lage — nicht Inhalte,
sondern Entscheidungen.

**Nachzuweisende Kette:** Quelle → Rohdokument → Dedup/Cluster → Knowledge Object →
Klassifikation (Ebene/Geografie/Fachgebiet/Entitäten) → Embedding → Matchinglauf inkl.
Begründung → Entscheidung → Briefingauswahl → sichtbare Ausgabe → Originalquelle → Wiederholung
ohne Dubletten.

**Drei belegte Risiken, die diesen Nachweis heute gefährden:**

1. **Mandanten-Fairness (hart, B-3…B-5).** `runCronForTenants` läuft seriell über eine
   **alphabetisch sortierte** Mandantenliste gegen eine harte Deadline (270 s). Wer hinten
   steht, fällt bei knappem Budget aus — jeden Lauf, deterministisch. Es gibt **keinen**
   Nachholmechanismus und **keine** Rotation; der Ausfall wird nur als Systemfehler
   protokolliert. Genau das ist am 2026-07-25 eingetreten (4 von 6 Mandaten, über Tage).
   → **Neuer offener Punkt OP-25**, siehe §4.
2. **Kandidatenfenster (hart, B-6/B-7).** Das Matching lädt `limit: 200` Wissensobjekte,
   sortiert nach `updated_at DESC`. Bei 1 193 Wissensobjekten sieht ein Lauf höchstens ~17 %
   des Bestands — und das Fenster ist eine **Anzahl**, keine Zeitspanne: an einem
   nachrichtenstarken Tag schrumpft es still. Ein relevanter, aber nicht kürzlich
   aktualisierter Vorgang kann nicht ins Briefing gelangen. Für den Nachweis heißt das: die
   drei Beispielfälle müssen **innerhalb** dieses Fensters liegen, sonst misst der Test das
   Fenster statt das Matching.
3. **Fehlende Laufbindung (B-9).** Ohne aktives `HELMUT_MATCHING_AUDIT` trägt kein
   Ergebnis eine Lauf-ID, und `matching_results` wird bei jedem Lauf überschrieben. Die
   geforderte Rückverfolgung „Briefing → Matchinglauf → Eingabestand" ist damit **heute nicht
   führbar**. Punkt 25 hängt insofern an Punkt 23.

**Empfohlene Abnahmekriterien:** ein vollständiger **natürlicher** Zyklus ohne manuellen Start ·
der Pilotmandant wird in jedem planmäßigen Zyklus verarbeitet **oder** nachweislich nachgeholt ·
drei fachlich geprüfte aktuelle Fälle (klar wichtig / sinnvoll ignorierbar / Chance-Risiko-Fall) ·
jeder Fall bis zur Originalquelle **und zum Matchinglauf** rückverfolgbar · keine Meldung eines
fremden Mandats, einer falschen Ebene oder Region · zweiter Lauf ohne Dubletten und ohne
gemischten Zustand · ehrlicher Leer-/Fehlzustand · Kosten und Laufzeiten im freigegebenen
Rahmen.

**Pilotblocker:** **ja, vollständig.** Dies ist der wichtigste verbleibende Produktnachweis.

**Production-Beweis:** zwingend. Ein Offlinelauf prüft die Verkabelung, nicht Aktualität,
Schedulerverhalten, Quellenqualität oder automatische Briefingerzeugung. Wartefenster:
mindestens ein voller natürlicher Zyklus, sinnvoll zwei (Wiederholung/Idempotenz).

**Aufwand:** Vorbereitung ≈ 1 Tag · Beobachtung 1–2 Kalendertage · bei Schedulerbefunden mehr.
**Reihenfolge:** OP-25 (Fairness) **vor** dem Beweislauf — sonst misst man einen Lauf, dessen
Erreichbarkeit unbewiesen ist.

---

### Punkt 26 — Ende-zu-Ende-Test Berliner Profil

**Abnahmekriterium:** „Das Berliner Profil erhält überwiegend passende Berliner Landespolitik."

**Eigentliches Ziel:** nicht „Treffer mit dem Wort Berlin", sondern die für das Mandat
relevante Landespolitik, ergänzt um tatsächlich betreffende Bundespolitik.

**Ist-Stand:** 10 Wege angelegt, **0 Abrufe, 0 Dokumente** (B-10). Die Aktivierung ist
technisch vorbereitet, dreistufig rückrollbar, je Land freigebbar (`HELMUT_LANDESMODULE`) —
und wurde am 2026-07-26 einmal real ausgeführt und am selben Abend zurückgerollt (OP-21).
Ein Production-E2E setzt voraus: Freigabe · echtes Landtagsprofil · aktive Wege · mindestens
ein vollständiger Zyklus. Jede dieser Voraussetzungen verändert den Systemzustand, in dem
gerade Punkt 25 bewiesen werden soll.

**Empfehlung für Phase 1 — isolierter Nachweis statt Production:**
Testprofil (künstlich, minimal vollständig) · **reale gespeicherte** Berliner Quelldokumente
als Fixtures · isolierter Pfad vom normalisierten Rohdokument bis zum Briefing ·
Vergleichskorpus mit ähnlichem Bundes- und Brandenburg-Thema · Berliner Inhalte dominieren ·
Brandenburger Inhalte ausgeschlossen oder nachvollziehbar niedrig bewertet · Bundesinhalte nur
dort relevant, wo sie das Berliner Mandat betreffen.

**Zu beachten:** der rbb-Pfad bedient **beide** Länder — Überschneidung ist hier kein Fehler,
sondern muss am tatsächlichen Bezug bewertet werden.

**Pilotblocker:** nein, solange Berlin inaktiv bleibt.

**Urteil:** Der Production-E2E ist für den Phase-1-Abschluss **entbehrlich**; der isolierte
Ende-zu-Ende-Vertrag ist **notwendig** und heute baubar (der Parser liefert, B-1).

---

### Punkt 27 — Ende-zu-Ende-Test Brandenburger Profil

**Zusätzlich zu Punkt 26 nachzuweisen:** die anders strukturierten Vorgänge (verschachtelte
`<Dokument>`-Blöcke, `VNr`/`ReihNr`-Identität) — heute testbelegt (B-1) · Berlin bleibt
inaktiv oder fachlich getrennt · die dokumentierte fachliche Ausnahme bei
`die-linke-brandenburg` (2 von 3 Pflichtklassen in der 8. Wahlperiode fachlich unmöglich) darf
**nicht** als Parser- oder Abdeckungsfehler gewertet werden (Checkliste Punkt 7/V-11) ·
gemeinsame regionale Medien am tatsächlichen Bezug bewerten.

**Reihenfolge:** die Aktivierungsplanung sieht ausdrücklich **Berlin zuerst** vor; eine
parallele Aktivierung macht Ursachen und Kosten unauflösbar.

**Empfehlung Phase 1:** wie Punkt 26, zusätzlich **mindestens ein verschachtelter Vorgang mit
mehreren Dokumentbeziehungen** im Fixture-Satz.

**Pilotblocker:** nein. **Production-Beweis:** für Phase 1 nicht nötig; später zwingend und
erst nach Berlin.

---

### Punkt 28 — Inhaltliche Trennung Bund / Berlin / Brandenburg beweisen

**Abnahmekriterium:** „Die drei Profile erhalten nachweisbar unterschiedliche und passende
Inhalte."

**Der entscheidende Denkfehler, den dieser Punkt vermeiden muss:** Die Architektur nutzt
**absichtlich einen gemeinsamen globalen Rohkorpus**; im Modus `on` crawlen alle Mandate eine
Vereinigungsmenge (Checkliste Punkt 28, Punkt 12 „Grenze"). Ein Null-Überlapp-Nachweis wäre
fachlich **falsch**: ein Berliner Mandat *soll* relevante Bundespolitik sehen.

Die richtige Frage lautet nicht „Sind die Mengen disjunkt?", sondern **„Ist jede
Überschneidung politisch begründet, und ist jede mandantenspezifische Ausgabe geschützt?"**

**Zu beweisende Trennungsebenen:**

| Ebene | Zu beweisen | Heutiger Stand |
|---|---|---|
| Quellenplan | Berlin aktiviert keine Brandenburg-Wege und umgekehrt | Resolver + Mandatsgate vorhanden (Punkt 8/12 ✅), `HELMUT_LANDESMODULE` je Land |
| Profilpakete | jedes Profil erhält nur berechtigte Pakete | ✅ gegen den echten Katalog belegt (Punkt 12) |
| Klassifikation | `land` bleibt von der Geografie getrennt | im Parser ✅ (B-1); im Altbestand ⏳ (Punkte 19/20) |
| Matching | falsches Land erzeugt keinen hohen Match ohne Sachbezug | **nicht belegt** |
| Decisions / Briefings | jede Zeile trägt den richtigen Mandanten | App-Guards vorhanden, Suite `drei-profile-e2e-test.js` (94 Assertions) |
| Matching-Audit | Lauf, Ergebnis und Profilhash gehören demselben Mandanten | gebaut, **inaktiv** (B-9) |
| API / UI | kein Mandant sieht fremde Daten | `tenant-guard-test.js` (37 Assertions) |

**Bereits vorhanden und unterschätzt:** `scripts/drei-profile-e2e-test.js` beweist die
Mandantentrennung über Lage, Radar, Entscheidungen und Büro für drei künstliche Profile —
aber auf **Bundesebene**. Für Punkt 28 fehlt genau die **Ebenen-/Landesdimension**. Der
kürzeste Weg zum Abschluss ist deshalb **nicht** ein neuer Test, sondern die Erweiterung
dieses Tests um ein Berlin- und ein Brandenburg-Profil mit den Fixtures aus 26/27.

**Pilotblocker:** die **Mandantentrennung** ja (sie ist aber belegt), die **Landestrennung**
nein.

**Aufwand:** ≈ 1 Tag, aufbauend auf 26/27.

---

### Punkt 29 — Fehlerpfade und Wiederholungen prüfen

**Abnahmekriterium:** „Timeouts, Limits, fehlerhafte Inhalte und Wiederholungen funktionieren
kontrolliert."

**Was vorhanden ist:** Google-News-Härtung mit Retry/Backoff/Jitter, Retry-Budget je Lauf,
Circuit Breaker (10 Beobachtungen / 0,6) mit Prozessgedächtnis, Cooldown und Kill-Switch
(OP-15a, offline getestet) · Zeitbudgets je Phase **und** für den Gesamtlauf mit
`min(eigenes Budget, Restzeit)` (`scheduler.js:235–248`) · Pipeline-Locks inkl. der neuen
Sperre `matching-<mandant>` · `recordPipelineError` je Phase · Understanding-Retries mit
terminalem Aussortieren · Watchdog · fail-closed Kostenlimit · Fehlerisolation je Mandant im
Cron (`server.js:6094–6098`).

**Was fehlt — und zwar zusammenhängend:**

1. **Wiederholung auf Mandantenebene existiert nicht** (B-3/B-4). Alles im System wiederholt
   *innerhalb* eines Mandantenlaufs; fällt der **ganze Mandant** aus, wiederholt niemand.
   Das ist die größte Lücke dieses Punktes und identisch mit OP-25.
2. **A-7: Doppelläufe mit `circuit-open`** verzerren jede Telemetrieauswertung (OP-15).
3. **Production-Beweise offen:** OP-09 (Lock-Deny unter echter Konkurrenz) und OP-10
   (Fehlerfall → `systemErrors` → Alarmpfad). Ohne sie ist „kontrolliert" behauptet, nicht
   gezeigt.
4. **7 von 14 Störungsklassen sind nur testbelegt**, mangels realer Vorfälle (Punkt 16).
5. **Der Breaker als dauerhafter Versorgungsausfall:** 29 von 42 Laufzeit-Personensuchen haben
   nie geliefert, dominant `circuit-open` (OP-15, neuer Befund B-3/B-4 der Paket-Inventur).
   Eine Wiederholung, die dauerhaft nichts liefert, ist keine kontrollierte Wiederholung.

**Empfohlene Abnahme:** Punkt 29 als **Betriebsgate** formulieren — je Fehlerklasse
(Zeitlimit · Sperrkonflikt · Quellenausfall · KI-Ausfall · Kostenlimit · fehlerhafter Inhalt ·
Mandantenausfall) ist belegt: *wie erkannt · wie wiederholt · wann terminal · wo sichtbar*.
Fünf davon sind heute offline belegbar; **Mandantenausfall** braucht Code (OP-25), Lock-Deny
und Alarmpfad brauchen Production (OP-09/OP-10).

**Pilotblocker:** ja, in einem Teil — Punkt 1 (Mandantenausfall) und der stille Dauer-Breaker.
Der Rest ist P1.

**Aufwand:** Gate-Dokumentation + fehlende Offline-Fälle ≈ 1–2 Tage; OP-25 ≈ 1 Tag Code +
Test; die Production-Beweise sind Beobachtung, nicht Bauzeit.

---

### Punkt 30 — Phase 1 offiziell abnehmen

**Abnahmekriterium:** „Der gesamte Datenmotor arbeitet automatisch, stabil und ohne manuelle
Eingriffe."

**Ist-Stand:** 12 ✅ · 9 ⏳ · 9 ☐. Vier der neun ⏳ (Punkte 6, 7, 14, 15) hängen an **einer**
einzigen freigabepflichtigen Handlung — dem Einspielen der beiden Seeds — und **nicht** an
weiterer Bauarbeit (Checkliste, „Nächster sinnvoller Schritt").

**Das Kernproblem des Punktes:** „ohne manuelle Eingriffe" ist heute für den **Bundesbetrieb**
fast erreicht, für den **Landesbetrieb** definitionsgemäß nicht — dort ist der manuelle
Eingriff (Freigabe) das gewollte Sicherheitsmerkmal. Ein Kriterium, das beides in einem Satz
verlangt, kann nur durch eine Aktivierung erfüllt werden, die aus Produktsicht verfrüht ist.

**Empfehlung: Abnahme in zwei benannten Stufen.**

- **Phase 1a — „Bundesdatenmotor abgenommen"** (das eigentliche Ziel jetzt).
  Erfordert: Punkt 25 grün · Punkt 23 grün · Punkt 29 in seinen pilotblockierenden Teilen
  grün · Punkte 19/20/21 mit **entschiedenem** (nicht zwingend geschlossenem) Rest ·
  Punkt 17 mit geschlossenem K-1/K-2 · Punkte 24/26/27/28 als **isolierte** Nachweise.
- **Phase 1b — „Landesbetrieb abgenommen"** (nach dem Pilot, OP-21).
  Erfordert: Seed-Einspielung · Berlin-Aktivierung + Beweislauf · Brandenburg danach ·
  Production-E2E 26/27 · Punkt 28 an echten Daten.

**Pilotblocker:** nein — Punkt 30 ist Konsequenz, nicht Ursache. Er blockiert aber den
**Vertrieb**, solange unklar ist, was „Phase 1 abgenommen" gegenüber einem Kunden bedeutet.

**Entscheidung, die der Betreiber treffen muss:** Wird Punkt 30 in 1a/1b geteilt? Ohne diese
Entscheidung bleiben 24/26/27/28 dauerhaft ☐, obwohl die dahinterliegende Arbeit erledigt
sein kann.

---

## 4 · Neu entstandene offene Punkte

Zwei Befunde aus dieser Analyse stehen in keiner bestehenden OP-Nummer. Beide sind in
[`../datenmotor-restliste.md`](../datenmotor-restliste.md) aufgenommen:

- **OP-25 · Mandanten-Fairness im Cron-Zeitbudget** (P0, pilotblockierend). Serielle,
  alphabetisch feste Reihenfolge + harte Deadline + kein Nachholen = deterministische
  Benachteiligung der hinteren Mandate. Belegt eingetreten (B-5). Mindestlösung: rotierender
  Startindex **oder** Vorrang für den am längsten nicht verarbeiteten Mandanten, plus ein
  Nachholpfad, plus ein Test, der Abschneiden erzwingt und die Rotation prüft.
- **OP-26 · Offline-Suite in Cloud-Sitzungen nicht reproduzierbar** (P2, Betriebshygiene).
  `CLAUDE.md` §4.9 verlangt, dass produktionsrelevante Skripte Secrets aus `process.env`
  lesen und in Cloud-Sitzungen lauffähig sind; §6 macht die Offline-Suite zum Pflichtlauf vor
  jedem PR. Beides zusammen kollidiert: mit gesetzten Supabase-Secrets scheitern **14** Suiten
  (163/177), weil sie „kein Supabase-Kontext" als Sicherheitszusicherung **prüfen**; ohne die
  Secrets bleiben 4 Fehler (173/177). Wer die Suite in einer Cloud-Sitzung laufen lässt,
  bekommt 14 Fehlalarme — oder gewöhnt sich an rote Läufe, was gefährlicher ist.

---

## 5 · Empfohlene Reihenfolge

| Schritt | Inhalt | Freigabe nötig | Aufwand |
|---|---|---|---|
| 1 | **OP-25** Mandanten-Fairness bauen + Test | nein (Code, additiv) | ~1 Tag |
| 2 | **Punkt 23** Flag-Freigabe + Beweislauf | **ja** | Beobachtung |
| 3 | **Punkt 25** natürlicher Ende-zu-Ende-Nachweis | nein (nur Beobachtung) | 1–2 Kalendertage |
| 4 | **Punkt 24A** Klassenabdeckung + Fixture-Drift | nein | ~1 Tag |
| 5 | **Punkte 26/27** isolierte Nachweise mit echten Dokumenten | nein | 2–3 Tage |
| 6 | **Punkt 28** Erweiterung des Drei-Profile-Tests um die Landesdimension | nein | ~1 Tag |
| 7 | **Punkt 29** Betriebsgate dokumentieren + offene Fälle schließen | teilweise | 1–2 Tage |
| 8 | **Punkt 30** Abnahmeentscheidung 1a/1b | **Betreiberentscheidung** | — |
| 9 | **OP-26** Suite in Cloud-Sitzungen reproduzierbar machen | nein | ~0,5 Tag |

Schritt 1 vor Schritt 3 ist nicht verhandelbar: ein Ende-zu-Ende-Nachweis in einem System, das
Mandanten still auslassen kann, beweist nur den Einzelfall des Beobachtungstages.

---

## 6 · Was diese Analyse ausdrücklich **nicht** getan hat

- Kein Production-Zugriff, keine Datenabfrage, keine Aktivierung, kein Seed-Einspielen.
- Keine Statusänderung an Punkten 24–30 in der Checkliste (die Kriterien wurden bewertet,
  nicht die Abnahme vollzogen).
- Keine Codeänderung an Parser, Scheduler, Matching oder Cron — OP-25 ist **beschrieben**,
  nicht gebaut.
- Keine Bewertung der Punkte 1–23 über das hinaus, was für 24–30 nötig war.
