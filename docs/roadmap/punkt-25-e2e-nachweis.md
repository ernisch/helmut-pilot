# Punkt 25 — Ende-zu-Ende-Nachweis für den Pilotmandanten (Bund)

**Kanonische Nachweisdokumentation.** Stand: 2026-07-30 (Sprint Punkt 25A).
Zustand: **teilweise abgeschlossen** — 25A vollständig belegt, 25B wartet auf den
ersten regulären Production-Lauf nach dem Deployment von PR #185.

---

## 1 · Verbindliche Definition und Schnitt

„Punkt 25" ist **Zeile 25** der [`phase_1_checkliste.md`](phase_1_checkliste.md):
*„Ende-zu-Ende-Test für den Pilotmandanten durchführen — Der Pilotmandant erhält
passende Bundespolitik bis ins fertige Briefing."*

- **Nicht zu verwechseln mit OP-25** der [`../datenmotor-restliste.md`](../datenmotor-restliste.md)
  (Cron-Fairness der Mehrmandanten-Crons). Die beiden Punkte haben nichts miteinander
  zu tun; OP-25 bleibt von diesem Sprint unberührt.
- **Mandantenneutralität** (`CLAUDE.md` §4.2): „Pilotmandant" meint die ROLLE
  (aktives Bundestagsmandat mit gepflegtem Profil). Der Vertrag verwendet die
  zentrale künstliche Profil-Fixture (`scripts/fixtures/test-profiles.js`) —
  keine echte Person, kein echtes Mandat, kein Klarname.
- **Schnitt** (analog Punkt 26/27): **25A** = deterministischer Repository-E2E-Vertrag
  (offline, dieser Sprint) · **25B** = rein lesender Production-Nachweis anhand eines
  vollständig abgeschlossenen **regulären** Laufs **nach** dem Deployment von PR #185.

## 2 · Stand vor diesem Sprint

- Checkliste Zeile 25: ☐ offen („nicht Gegenstand dieses Sprints").
- Teilbelege existierten verstreut: `drei-profile-e2e-test.js` (Produktflächen mit
  vorgefertigten KOs, ohne Einlese-/Understanding-/Persistenzpfad), Matching-/
  Entscheidungs-/Lage-Suiten (je Baustein), 26A/27A (Landesprofile, nicht Bund).
- Es fehlte: ein Vertrag, der ein **Bundesdokument** vom Einlesen bis zur sichtbaren
  Lage **über die tatsächlichen Übergaben** führt, mit den Pflichtfällen des
  Sprintauftrags (fremde Ausschüsse, fehlende Ebene, Idempotenz, Mandantentrennung,
  unberechtigter Zugriff) und wirksamen Mutationsproben.

## 3 · 25A — Der deterministische Ende-zu-Ende-Vertrag

**Suite:** `scripts/pilot-e2e-vertrag-test.js` — **96/96 Assertions grün**, identisch
mit und ohne gesetzte Production-Secrets, deterministisch (drei Wiederholungsläufe
byte-gleich im Ergebnis), läuft im Offline-Runner und damit im CI-Pflicht-Check.

**Geprüfter Pfad (echte Produktionsfunktionen, keine Logik-Kopien):**

| Stufe | Produktionsfunktion |
|---|---|
| Einlesen (DIP) | `dip.normalizeDrucksache` (inkl. echter Titelbereinigung `cleanDipTitle`) |
| Crawl-Item | `scheduler.dipDocToRawItem` (wie im Live-Crawl) |
| Rohdokument | `dedup.toRawDocumentRow` + `dedupeRawDocuments` + `canonicalizeUrl` (DSGVO-Minimierung, kanonische Identität) |
| Vorgangsbildung/Verstehen | `understanding.runUnderstandingShadow` (Clustering, Resolver, Assemble, Klassifikation, Ebenen-/Geografie-Gedächtnis, Merkmalsvektor) |
| Matching (aktiver Pfad) | `matching.runMatchingShadow` + echtes `matching-audit.auditRun` (Audit AN wie Production seit 2026-07-28), `ausschussBelegZulaessig` (PR #185) |
| Begründung/Signale | `matching-begruendung.buildSignals`/`begruendungAusSignalen` (persistiert) |
| Sichtbare Erklärung | `matching-erklaerung.erklaerungAusErgebnis` |
| Entscheidung | `decisions.runDecisionShadow` / `decideForUser` (Score, Stufe) |
| Politische Ausgabe | `lage.loadRankedVorgaenge` → `koToVorgangCard` → `selectLageVorgaenge` |

**Testdoubles (einzige Ersatzteile, identisch zu 26A/27A, gemeinsames Gerüst
`scripts/e2e-vertrag-geruest.js`):** deterministische Fixture-Analysen statt LLM
(fail-loud bei Mehrdeutigkeit), In-Memory-Store mit PostgREST-Vertragsgrenzen
(Mandantenfilter, `aktuell=is.true`, Tenant-Guard, atomare Publish-Semantik wie
`helmut_publish_matching_run`), dokumentgetreue Offline-Replik der pgvector-RPC über
die echten write-time-Merkmalsvektoren. Alle Fixture-Adressen liegen auf
`.example`-Domains — keine erfundenen echten Quellen-URLs, keine Production-Rohdaten,
keine personenbezogenen Inhalte.

**Pflichtfälle des Sprintauftrags → Abdeckung:**

| # | Pflichtfall | Fixture / Abschnitt | Ergebnis |
|---|---|---|---|
| 1 | Relevanter Bundesvorgang mit echtem Ausschussbezug | DIP-Gesetzentwurf „Tariftreue" / B–I | Ebene `bund`, Ausschuss- + Themenbeleg, Begründung/Erklärung deckungsgleich, „Sofort reagieren", Lage-Karte mit DIP-Quelle |
| 2 | Thematisch relevanter Bundesvorgang ohne Ausschussbezug | DIP-Antwort „Tarifbindung/Mindestlohn" | positive Merkmalsähnlichkeit, kein Ausschussbeleg, sichtbar unterhalb des belegten Falls |
| 3 | Landesvorgang mit ähnlich benanntem Ausschuss | „Landtag in Sachsen … Sozialbericht", Ausschuss „Soziales, Gesundheit und Integration" → Stamm `arbeit-und-soziales` | **kein** Ausschussbeleg (PR #185), Themenbeleg bleibt, kein „Sofort reagieren" |
| 4 | Kommunaler Vorgang mit ähnlich benanntem Ausschuss | „Sozialausschuss des Kreistags Musterkreis" → Stamm `arbeit-und-soziales`, Ebene `kommune` (KI-Wert wie in Production) | **kein** Ausschussbeleg, Themenbeleg bleibt |
| 5 | Irrelevanter Vorgang | DIP-Unterrichtung „Hochseefischerei" | „Ignorieren", keine erfundene Relevanz |
| 6 | Fehlende/unbekannte Ebene | „Fachtagung Alterssicherung" (kein Institutionssignal) + Regelprobe am geklonten Positivfall | Ebene ehrlich `unknown`; `ausschussBelegZulaessig` fail-closed für `null`/`unknown`/unlesbar |
| 7 | Unvollständige Institutionsangabe | „Ministerium für Soziales" (weder Bund noch Land erkennbar) | Ebene `unknown`, kein Beleg, keine Handlungsaufforderung |
| 8 | Doppelte Verarbeitung derselben Eingabe | Abschnitte D (Understanding) + F (Matching) | 7× `duplicate`, 0 Schreibvorgänge; Matching idempotent (gleicher Fingerabdruck, keine neue Generation), genau 1 aktuelle Zeile je Vorgang |
| 9 | Zweiter Mandant mit anderem Profil | Gesundheits-Kontrollprofil / G | nur eigene Zeilen, keine Fremd-Belege, fachlich getrennte Ergebnisse |
| 10 | Nicht berechtigter Nutzerzugriff | G6–G8 | Lesen ohne Mandant abgelehnt, Cross-Tenant-Write blockiert, Audit lehnt fremde Profilkennung ab (`CROSS_TENANT_WRITE`) |

**Regression zu PR #185 verankert:** Die Fälle 3/4/6/7 sind exakt die in Production
gemessene Fehlerklasse Befund 27A-2 (14 qualifizierte Fälle, §51/§52 in
[`../matching-nachvollziehbarkeit.md`](../matching-nachvollziehbarkeit.md)).
Zusätzlich beweist H7 kontrafaktisch, dass der entfallene Ausschussbeleg (Gewicht 34)
die Entscheidungsstufe des Landesfalls kippen würde — der Fix trägt also sichtbar.

**Störfall ohne falsches Grün (J):** simulierter KI-Transportfehler → `failed`
geparkt, erreicht das Matching nie; simulierter Abbruch während der atomaren
Veröffentlichung → Fehler sichtbar, Audit-Lauf `fehlgeschlagen`, vorherige
Generation bleibt unverändert aktuell.

## 4 · Mutationsnachweis

**Probe:** `scripts/pilot-e2e-mutationsprobe.js` — **10/10 Mutationen rot** (jede
einzeln, gegen Produktionsdateien, Arbeitskopie unangetastet, Abzug im Temp-Verzeichnis).

| Sprint-Pflichtmutation | Mutation(en) | mutierte Produktionsdatei |
|---|---|---|
| Ausschusszuständigkeit wird umgangen | N1 (Bundeszweig → immer ja) + N2 (Aufruf entfernt) | `lib/helmut/matching.js` |
| Mandantenfilter wird entfernt | N3 (Schreibseite trägt fremden Mandanten) + N4 (Audit-Profilprüfung aus) | `lib/helmut/matching.js`, `lib/helmut/matching-audit.js` |
| Irrelevanter Vorgang wird zugelassen | N5 (Score-Sockel 50) | `lib/helmut/decisions.js` |
| Entscheidungsstufe wird falsch berechnet | N6 (Schwelle entfällt) | `lib/helmut/decisions.js` |
| Sichtbare Begründung verliert einen Pflichtbeleg | N7 (Ausschuss aus der Priorität) + N8 (Ersatztext ohne Beleg) | `lib/helmut/matching-begruendung.js`, `lib/helmut/matching-erklaerung.js` |
| Doppelte Verarbeitung erzeugt ein zweites sichtbares Ergebnis | N9 (Matching-Idempotenz aus) + N10 (Understanding-Duplikate neu) | `lib/helmut/matching-audit.js`, `lib/helmut/understanding.js` |

Das gemeinsame Probe-Gerüst (`scripts/e2e-mutationsprobe-geruest.js`) wurde
rückwärtskompatibel um `zusatzdateien` erweitert (der 25A-Vertrag braucht die
zentrale Profil-Fixture im Abzug); Berlin- und Brandenburg-Proben laufen unverändert
(10/10 bzw. 17/17 rot, nachgemessen).

## 5 · Der tatsächliche Nutzerpfad (belegt)

1. **API-Route:** Die App lädt die Lage über **`GET /api/app/start`**
   (`client.js` → `fetchWithTimeout("/api/app/start?…")`); der Server hängt
   `briefing.lageBriefing` an (`server.js`: `buildLageBriefing(profile, { cacheOnly: true })`,
   8-s-Timeout, Störungs-Sentinel `reason: "error"` statt stillem Leerzustand).
   Dedizierter Refresh: **`GET /api/lage/briefing`**.
2. **Maßgebliche Persistenz:** `matching_results` (`aktuell=true`, `run_id`,
   `begruendung`, `signale`, `matched_features`) + `knowledge_objects` (verstandene
   Vorgänge inkl. `decision_level`, Merkmalsvektor) + `ko_document_links` (Quellen)
   + `matching_runs` (append-only Laufprotokoll) + `decisions` (Score/Stufe).
3. **Filter:** verstandene Vorgänge (`status <> 'pending'`,
   `understanding_status = 'complete'`, Inhalt vorhanden) · Mandantenfilter
   `user_id=eq.<tenant>` + `aktuell=is.true` in `listMatchingResults` ·
   `selectLageVorgaenge` lässt nur Karten mit echter Quelle durch.
4. **Sortierung:** gespeicherte Rangfolge der Matching-Zeilen (Merkmalsähnlichkeit,
   Ränge 1–20); `selectLageVorgaenge` gruppiert „moderne" Karten (gefüllte
   Anzeigefelder) vor die übrigen, erhält aber die relative Reihenfolge.
   → Beobachtung B25-1 unten.
5. **Sichtbare Entscheidung:** `decisions.score`/`decision` („heilige"
   Schwellenregel 60/40, Server == Client, `contract-snapshot-test`).
6. **Sichtbare Begründung:** `relevanz_erklaerung = erklaerungAusErgebnis(zeile)`
   — liest ausschließlich persistierte `begruendung`/`signale` (ersatzweise
   `matched_features`), Weißliste der vier Signalarten, ohne Beleg `null`
   (kein Ersatztext). Vertrag beweist Deckungsgleichheit Karte == Persistenz (I6).
7. **Mobil:** `browser-smoke-test.js` **32/32** (echtes Chromium, u. a. 390×844,
   Tablet, schmale Desktop-Viewports).
8. **Veraltete Ergebnisse erkennbar:** je Karte `updatedLabel`/`updatedDot`
   (Frische), `lageFreshnessLabel` im Client, `fromCache`/`generatedAt` im Payload,
   Störungszustand statt ruhigem Leerzustand bei Ladefehler.
9. **Laufunterscheidbarkeit:** jede aktuelle Zeile trägt `run_id`,
   `berechnet_am` und `eingabe_fingerabdruck`; `matching_runs` ist append-only —
   ein neuer regulärer Lauf ist vom vorherigen eindeutig unterscheidbar
   (in Production nachgewiesen in Sprint 23B-1/23C-2A).

**Beobachtung B25-1 (dokumentierte Lücke, kein Fix in diesem Sprint):**
Die Kartenreihenfolge der Lage entsteht aus der reinen **Merkmalsähnlichkeit** —
nicht aus der Entscheidungsstufe. Ein merkmalsarmer Kurztext mit gleichem
Ausschuss-Stamm und Fachgebiet (der Landesfall des Vertrags) kann dadurch **vor**
dem inhaltsreichen, dringlichen Bundesfall stehen: kurze Texte verdünnen den
L2-normalisierten Merkmalsvektor weniger, die erlaubte fachliche Nähe
(`thema`) hebt die Kosinus-Ähnlichkeit. Belege und Dringlichkeit bleiben dabei
korrekt (kein Ausschussbeleg, kein „Sofort reagieren" am Landesfall; die
Top-Entscheidung ist der Bundesfall — H12). Der Vertrag pinnt diesen Zustand
ehrlich (E4/E4b/I11), statt eine nicht garantierte Rangfolge zu behaupten.
Eine Änderung der Lage-Sortierung (z. B. Entscheidungsstufe vor Ähnlichkeit)
wäre eine sichtbare Produktänderung → eigener, freigabepflichtiger Sprint;
fachlich verwandt mit Befund M-8 (Top-N ohne Schwellenwert).

## 6 · 25B — Production-Nachweis (Stand 2026-07-30, ~14:30 UTC)

**Bereits belegt (rein lesend, `node scripts/befund-27a2-production-messung.js`,
Wiederholung der Messung aus PR #184 nach dem Merge von PR #185, `cf290ab`,
gemergt 13:21:45 UTC):**

- 6 aktive Bundestagsprofile × 1 806 Wissensobjekte = **10 836 Paare**.
- **Qualifizierte falsche Ausschussbelege NACHHER: 0** (VORHER: 14) — die
  Kern-Erwartung des Sprintauftrags ist erfüllt.
- Belege gesamt VORHER 276 → NACHHER 260: **16 entfallen** (14 `land` + 2 `kommune`),
  **0 neu**, in **10 836/10 836** Paaren ist außer dem Ausschussbeleg alles
  byte-identisch, Score-Delta ausschließlich **34**, 13 Stufenwechsel,
  Ähnlichkeit/Rang unverändert (kein Vektoreingriff).
- Abgleich mit gespeicherten `decisions`: **10/10** Scores exakt identisch zur
  lokalen VORHER-Rechnung; 9 wechseln durch den Fix die Stufe, 7 stehen heute auf
  „Sofort reagieren".
- Persistierter Bestand: 290 `matching_results`-Zeilen, davon **5 aktuelle Zeilen
  mit qualifiziert falschem Ausschussbeleg** — alle aus Läufen **vor** dem Merge
  (`…20260730075654…` 07:56:55 UTC und `…20260729160408…` 16:04 UTC). Erwartet:
  sie verschwinden mit dem nächsten regulären Lauf des jeweiligen Mandanten.
- 0 KI-Aufrufe, 0,00 USD, ausschließlich HTTPS-`GET` (technischer Schreibschutz
  der Messdatei, offline bewiesen durch `befund-27a2-schreibschutz-test.js` 54/54).

**Noch offen (deshalb Punkt 25 nur teilweise abgeschlossen):**

1. **Deployment `READY`** für den Merge-Commit `cf290ab`: in dieser Sitzung nicht
   belegbar — keine Vercel-Werkzeuge, `helmut-pilot.vercel.app` durch die
   Egress-Policy gesperrt, GitHub-Token ohne `deployments`-/`statuses`-Leserecht
   (dieselbe dokumentierte Grenze wie in PR #184). Ersatznachweis: die
   Lauftelemetrie (`process_runs.commit_ref` bzw. `matching_runs`) des ersten
   Laufs nach dem Merge.
2. **Mindestens eine `matching_results`-Zeile aus einem regulären, vollständig
   abgeschlossenen Lauf NACH dem Deployment**, zugehörig zum aktiven
   Pilotmandanten. Der jüngste sichtbare Lauf (07:56:55 UTC) liegt **vor** dem
   Merge — es existiert noch kein geeigneter Lauf. **Kein manueller Lauf wurde
   gestartet, kein Cron/Trigger eingerichtet, keine automatische Überwachung.**

**Nächste reguläre Termine (tatsächlich aktive Konfiguration, `vercel.json`):**
`pipeline` **16:00 UTC** (erreicht je Lauf einen Mandanten, Rotation nach
OP-25-Fairness) · `crawl` **20:00 UTC** und **04:00 UTC** · `understanding`
21:30/05:30 UTC. Der erste Kandidat für einen qualifizierenden Lauf ist damit der
16:00-UTC-Pipeline-Lauf am 2026-07-30, sonst 20:00 UTC (crawl) bzw. Folgetermine.

**Folgeauftrag 25B (klar umrissen):** Nach einem vollständig abgeschlossenen
regulären Lauf des aktiven Pilotmandanten mit `berechnet_am` > Deployment-Zeitpunkt:
(1) rein lesend prüfen, dass der Lauf regulär (Cron-Auslöser), vollständig und dem
Pilotmandanten zugeordnet ist; (2) `node scripts/befund-27a2-production-messung.js`
erneut ausführen — Erwartung unverändert „QUALIFIZIERTE Faelle NACHHER: 0", **und**
die 5 falschen Alt-Zeilen des betroffenen Mandanten sind abgelöst, **0** neue
falsche Belege, Rang/Ähnlichkeit unverändert; (3) Erscheinen/Nichterscheinen in der
Lage samt sichtbarer Erklärung gegen die persistierten Felder prüfen; (4) zeitliche
Reihenfolge (Deployment → Lauf → Zeilen) und Laufzuordnung dokumentieren;
(5) keinerlei Schreibzugriffe.

## 7 · Sicherheitsgrenzen, Datenschutz, unveränderte Bereiche

- **Keine Änderung an aktiver Produktionslogik, Datenmodell, Migration, Cron,
  Quellen, Budget oder Nutzeroberfläche.** Neu sind ausschließlich zwei
  Test-/Probeskripte, eine rückwärtskompatible Gerüst-Erweiterung und Doku.
- Keine Production-Schreibzugriffe (nur HTTPS-`GET` der Messdatei), kein manueller
  Pipeline-/Matching-/Crawl-Lauf, 0 echte KI-Aufrufe, 0,00 USD, keine Env-/Flag-/
  Cron-/Budgetänderung, Berlin/Brandenburg/M8 unverändert AUS, keine neuen Mandate.
- Fixtures: rein künstlich, `.example`-Domänen, keine Production-Rohdaten, keine
  personenbezogenen Inhalte, keine Secrets; Secrets nur aus `process.env`
  (`CLAUDE.md` §4.9).

## 8 · Testergebnisse (real ermittelt, 2026-07-30)

| Nachweis | Ergebnis |
|---|---|
| `pilot-e2e-vertrag-test.js` (neu) | **96/96** — identisch mit und ohne Production-Secrets, 3 Wiederholungsläufe deterministisch |
| `pilot-e2e-mutationsprobe.js` (neu) | **10/10 Mutationen rot** (alle 6 Pflichtmutationen + 4 unabhängige Zweitwege) |
| `matching-ausschuss-zustaendigkeit-test.js` | 86/86 |
| `matching-erklaerung-test.js` / `matching-erklaerungsabdeckung-test.js` | 64/64 · 60/60 |
| `decisions-test.js` / `matching-audit-test.js` | 38/38 · 178/178 |
| `matching-relevanz-gate-test.js` (M8) | 40/40 |
| `radar-committee-evidence-test.js` | 30/30 |
| `drei-profile-e2e-test.js` | 94/94 |
| `mandantentrennung-test.js` / `tenant-guard-test.js` / `cross-tenant-security-test.js` | 14/14 · 37/37 · 43/43 |
| `lage-test.js` / `lage-visible-vorgaenge-test.js` / `lage-cacheonly-test.js` | 138/138 · 6/6 · 9/9 |
| Berlin-Vertrag / -Mutationsprobe | 76/76 · **10/10 rot** |
| Brandenburg-Vertrag / -Mutationsprobe | 98/98 · **17/17 rot** |
| `befund-27a2-mutationsprobe.js` | **9/9 rot** |
| Offline-Suite **ohne** Production-Secrets (bildet CI nach, maßgeblich) | **184/188** gegen Basislinie `origin/main` (`cf290ab`) **183/187** — die +1 ist die neue Suite, Fehlschlagliste **byte-identisch** (privacy-vollstaendigkeit, profile-db, provision-tenant, tenant-neutrality — umgebungsbedingt, im CI grün) |
| Offline-Suite **mit** Secrets (nicht maßgeblich) | 174/188 — dieselben 14 bekannten umgebungsbedingten Fehlschläge, neue Suite grün |
| `browser-smoke-test.js` (Desktop + Mobil) | **32/32** |
| Production-Messung (rein lesend) | QUALIFIZIERT NACHHER **0** (VORHER 14) · 16 entfallen · 0 neu · 10 836/10 836 sonst byte-identisch |

## 9 · Verhältnis zu anderen Punkten

- **Punkt 27:** 27A bleibt erfolgreich abgeschlossen; 27 gesamt bleibt ⏳; **27B
  bleibt durch Punkt 15 blockiert.** Punkt 25 ist von Punkt 27B **unabhängig**
  (Bundespfad, keine Landeslieferung nötig) — nur der Fix aus PR #185 ist geteilte
  Grundlage und in `main` gemergt.
- **Punkt 15:** Punkt 25 ist **ohne Punkt 15 vollständig abschließbar** — 25B
  braucht nur einen regulären Bundeslauf, keine Landesaktivierung.
- **OP-25 (Cron-Fairness):** getrennt, unverändert. Berührungspunkt nur insofern,
  als die Rotation bestimmt, wann der Pilotmandant im 16:00-Pipeline-Cron drankommt.
- **M8 (`HELMUT_MATCHING_RELEVANZ_GATE`):** unverändert AUS; der Vertrag beweist den
  AUS-Zustand und rechnet M8 nur als reine Funktion.

## 10 · Nächster Schritt

1. PR dieses Sprints reviewen und mergen (nur Tests + Doku, keine Produktionswirkung).
2. Nach dem ersten vollständig abgeschlossenen regulären Lauf des Pilotmandanten
   (frühestens 16:00 UTC `pipeline`, sonst 20:00/04:00 UTC `crawl`): Folgeauftrag
   25B aus §6 ausführen (rein lesend). Erst danach darf Zeile 25 auf ✅ gehen.
