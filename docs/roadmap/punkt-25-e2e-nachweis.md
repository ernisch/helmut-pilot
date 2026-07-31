# Punkt 25 — Ende-zu-Ende-Nachweis für den Pilotmandanten (Bund)

**Kanonische Nachweisdokumentation.** Stand: **2026-07-31** (25A-Sprint plus
Production-Nachprüfungen vom 30./31.07.).
Zustand: **ERFOLGREICH ABGESCHLOSSEN (2026-07-31)** — 25A und 25B vollständig
belegt, **alle 17 Abnahmekriterien erfüllt**. Der lange offene Punkt (ein regulärer
Lauf **des Pilotmandanten** mit verändertem Eingabefingerabdruck) ist am
**2026-07-31 um 16:04:28 UTC** eingetreten, nachdem die Rezeptanhebung aus PR #190
den in **Befund B25-2** (§6c) beschriebenen Idempotenz-Riegel gelöst hat. Nachweis
rein lesend: [`../../scripts/punkt25b-production-nachweis.js`](../../scripts/punkt25b-production-nachweis.js)
— **23 von 23 Prüfungen grün** (§6d).

**Historische Einordnung** (der Absatz darunter beschreibt den Stand VOR dem
2026-07-31 und bleibt als Beleg stehen): der Fix von PR #185 veränderte nur
`matched_features`, und die gehen bewusst nicht in den Idempotenz-Fingerabdruck ein,
weshalb der Pilotlauf am 30.07. um 20:04 UTC idempotent blieb und die falschen
Alt-Zeilen (inkl. Rang 1) stehen ließ.

**Stand 2026-07-31 zu B25-2: die Blockade ist auf der Codeseite aufgelöst.** Von den
in §6c aufgezählten Optionen ist **(b) Rezeptversion anheben** umgesetzt —
`legacy_relevance_v1` → `v2`, eine Zeile in `lib/helmut/matching-contract.js`,
kanonisch begründet und deterministisch belegt in
[`../matching-nachvollziehbarkeit.md`](../matching-nachvollziehbarkeit.md) §53
(Nachweisvertrag `scripts/matching-rezeptversion-v2-test.js`, 39/39). Damit ändert
sich der Eingabefingerabdruck **jedes** Mandanten genau einmal; der nächste
**reguläre** Lauf rechnet neu und löst die falschen Alt-Zeilen ab, danach ist wieder
alles idempotent. **Kein manueller Lauf, kein Backfill, kein Schreibzugriff.**
**Nachtrag 2026-07-31, 16:05 UTC: 25B ist damit ERFÜLLT.** Der reguläre `crawl`-Cron
erreichte den Pilotmandanten um **16:04:28 UTC** — knapp 5½ Stunden nach dem
Deployment — und rechnete ihn wie vorhergesagt **genau einmal** neu. Messung und
Kriterienabgleich: §6d.

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

## 6 · 25B — Production-Nachweis (Stand 2026-07-31, 00:45 UTC)

**Kurzfassung:** 25B ist **nicht abgeschlossen** und — das ist der neue, belegte
Befund — mit reinem Abwarten regulärer Läufe **auch nicht absehbar abschließbar**.
Von 17 Abnahmekriterien sind **16 erfüllt**; das offene ist die Zugehörigkeit des
Post-Deployment-Laufs zum Pilotmandanten. Ursache ist **Befund B25-2** (§6c), nicht
Zufall oder Wartezeit.

### 6a · Was inzwischen vollständig belegt ist

**Deployment `READY` — Lücke geschlossen (2026-07-30, rein lesend über die
Vercel-Deployment-API, die in dieser Sitzung erstmals verfügbar war):**

| Deployment | Commit | Ziel | Zeitachse (UTC) |
|---|---|---|---|
| `dpl_HFU8JjcREEFX4YXESsk7ua8uEhog` | `cf290ab` (Merge **PR #185**) | production, Alias `helmut-pilot.vercel.app` | Merge 13:21:45 → Build 13:21:50 → **`READY` 13:22:02** |
| `dpl_HLasm9hNVti4mJLobwGGmGHP2atQ` | `75d7286` (Merge **PR #186**) | production | 14:25:00 → `READY` (nur Tests + Doku, Laufzeitlogik identisch) |

Damit ist die in PR #184 und im ersten Durchgang benannte Grenze („Vercel-Werkzeuge
fehlen, Egress gesperrt, Token ohne `deployments`-Recht") **aufgelöst**; die
Startzusage „Deployment eindeutig `READY` und enthält den Merge von PR #185" ist
belegt, nicht mehr nur plausibel.

**Messung nach dem Deployment** (`node scripts/befund-27a2-production-messung.js`,
rein lesend, HTTPS-`GET`, 0 KI-Aufrufe, 0,00 USD): 6 aktive Bundestagsprofile ×
1 806 Wissensobjekte = **10 836 Paare** · **qualifizierte falsche Ausschussbelege
NACHHER 0** (VORHER 14) · 16 Belege entfallen (14 `land` + 2 `kommune`) · **0 neu**
· 10 836/10 836 Paare außerhalb des Ausschussbelegs byte-identisch · Score-Delta
ausschließlich 34 · `decisions`-Abgleich 10/10 exakt.

**Erster regulärer Lauf nach dem Deployment — vollständig geprüft
(2026-07-30, 16:04:59,977 → 16:05:01 UTC, Auslöser `crawl`, Status `vollstaendig`,
20 veröffentlicht / 33 abgelöst, 0 Wiederholungen):** 16 von 17 Kriterien erfüllt.

| Kriterium (Sprintauftrag 25B) | Ergebnis |
|---|---|
| Deployment eindeutig `READY` · enthält PR-185-Merge | ✅ 13:22:02 UTC, `cf290ab` |
| Lauf begann nach dem Deployment | ✅ 16:04:59 UTC |
| Regulär durch den Zeitplan ausgelöst · kein manueller/nachträglicher Lauf | ✅ Cron-Auslöser, Startfenster wie am Vortag, 0 Wiederholungen |
| Lauf vollständig abgeschlossen | ✅ `vollstaendig`, Dauer 1,15 s |
| Neue/aktualisierte Zeilen · zugehörige Wissensobjekte · Matching-Ergebnis · Belege · Score · Signale · Entscheidung · persistierte Begründung | ✅ 20 Zeilen, alle Objekte lesbar und `complete` |
| Sichtbare Erklärung stimmt mit den persistierten Daten überein | ✅ deterministisch nachgerechnet (`erklaerungAusErgebnis`) |
| Korrekte Mandantenzuordnung | ✅ alle 20 Zeilen |
| **Keine fremden Ausschussbelege** | ✅ **0 von 20** Zeilen tragen überhaupt einen Ausschussbeleg |
| **Keine Ausschussbelege bei fehlender/unbekannter Ebene** | ✅ je Zeile mit der echten Produktionsfunktion `ausschussBelegZulaessig` nachgerechnet |
| Keine neuen Runtime-/Datenbankfehler im Pfad | ✅ Lauf sauber abgeschlossen, keine `fehlgeschlagen`-Zeile |
| Zeitliche Reihenfolge aller Schritte | ✅ Deployment 13:22:02 < Laufstart 16:04:59 < `berechnet_am` ≤ Laufende |
| Eindeutige Zuordnung zum regulären Lauf | ✅ alle Zeilen tragen `run_id`, Ränge 1–20 lückenlos, Versionsachsen unverändert |
| Keine Production-Schreibzugriffe durch den Nachweis | ✅ ausschließlich `GET` |
| **Lauf gehört zum aktiven Pilotmandanten** | ❌ **offen** — der Lauf gehört einem anderen Mandanten (OP-25-Rotation) |

### 6b · Der zuletzt offene Beleg — jetzt erbracht

Genau ein Beleg fehlte: **ein vollständig abgeschlossener regulärer Lauf des
Pilotmandanten nach dem Deployment**, mit Ablösung seiner **2** falschen Alt-Zeilen
(darunter der **Rang-1**-Fall „Betrifft deinen Ausschuss Arbeit und Soziales und
deine Partei Die Linke." auf einem Vorgang der Ebene `land`) und 0 neuen falschen
Belegen. **Am 2026-07-31 um 16:04:28 UTC ist er eingetreten** — die Rang-1-Karte
trägt jetzt „Betrifft deine Partei Die Linke.". Vollständige Messung: §6d.

Stand der 5 falschen Alt-Zeilen (alle `aktuell=true`, alle vor dem Deployment
gerechnet, **unverändert sichtbar**): 2 beim Pilotmandanten (Ränge 1 und 15,
gerechnet 2026-07-30 07:56:55 UTC), 3 bei einem zweiten Mandanten (Ränge 8, 10, 15,
gerechnet 2026-07-29 16:04:09 UTC).

### 6c · Befund B25-2 — warum das nicht von selbst passiert (belegt, freigabepflichtig)

Die frühere Erwartung dieses Dokuments, die falschen Zeilen „verschwinden mit dem
nächsten regulären Lauf des jeweiligen Mandanten", ist **gemessen widerlegt**.

Der Pilotmandant **war** nach dem Deployment dran — am 2026-07-30 um **20:04:27 UTC**
(regulärer `crawl`-Cron). Der Lauf war **idempotent**: `wiederholungen` 0 → 1,
`letzter_lauf_at` gesetzt, **keine neue Generation**, keine Zeile neu berechnet. Die
falschen Belege blieben stehen.

**Ursache, aus dem Vertrag selbst belegt** (`lib/helmut/matching-contract.js`
§`computeInputFingerprint`/`computeCandidateSetHash`): Der Idempotenzschlüssel eines
Laufs besteht aus Mandant · Mandatsprofil · `profil_hash` · Engine-/Rezept-/
Vektorversion · Schwellenwerte · Kandidatenhash. Der Kandidatenhash wiederum aus
`ko_id | similarity | ko_eingabe_hash` je Treffer. **`matched_features` gehen
bewusst nicht ein** — sie sind Ergebnis, nicht Eingang. Ein Fix, der ausschließlich
`matched_features` verändert (genau das ist PR #185, §52), erzeugt deshalb **keinen**
neuen Fingerabdruck und löst **keine** Neuberechnung aus.

**Gemessen am aktuellen Bestand (rein lesend, 2026-07-31 00:45 UTC):** von den **20**
Wissensobjekten der aktuellen Pilot-Trefferliste haben sich seit dem Lauf vom
07:56 UTC **0** geändert (weder `ko_version` noch `updated_at`). Die
Ähnlichkeitsschwelle des Rang-20-Kandidaten liegt bei **0,2329**. Der nächste
reguläre Lauf des Piloten bliebe damit **erneut idempotent** — obwohl seit dem
letzten Lauf **97** neue Wissensobjekte entstanden sind (davon 23 verstanden) und
101 geändert wurden: keines davon erreicht seine Top-20.

**Konsequenz, ehrlich benannt:** Die falschen Ausschussbelege des Pilotmandanten —
inklusive der Rang-1-Karte — bleiben sichtbar, bis **unabhängig vom Fix** eines
dieser Ereignisse eintritt: ein neues verstandenes Wissensobjekt überschreitet die
Ähnlichkeitsschwelle 0,2329 und verdrängt einen Top-20-Kandidaten · eines der 20
bestehenden Objekte wird aktualisiert · das Mandatsprofil ändert sich
(`profil_hash`) · Engine-, Rezept- oder Vektorversion wird angehoben. Ein Zeitpunkt
dafür ist **nicht vorhersagbar**; die bisherige Beobachtung (Sprint 23B-1: identischer
Fingerabdruck trotz 179 neuer Wissensobjekte) spricht für hohe Stabilität der Top-20.

**B25-2 ist kein Fehler des Fixes**, sondern die dokumentierte Kehrseite der
Idempotenz aus Sprint 23B-1 (Schreibersparnis) in Kombination mit einem Fix, der
nur die Ergebnisseite betrifft. Die Behebung erfordert eine **Betreiberentscheidung**
und einen getrennten, freigabepflichtigen Sprint; Optionen (nicht bewertet, nicht
umgesetzt): (a) weiter abwarten und 25B offen lassen, (b) Rezeptversion anheben —
erzwingt Neuberechnung **aller** Mandanten, verändert sichtbare Ergebnisse breit,
(c) einmaliger gezielter Neulauf des Piloten (manueller Lauf — im Sprintauftrag
ausdrücklich verboten, daher hier nicht ausgeführt), (d) Backfill der betroffenen
Zeilen (Schreibzugriff auf Production, freigabepflichtig).

**Nächste reguläre Termine (aktive `vercel.json`):** `crawl` **04:00** und
**20:00 UTC** (Matching läuft hier mit, Auslöser `crawl`) · `pipeline` **16:00 UTC**
· `understanding` **05:30/21:30 UTC**. Die Rotation (OP-25) verteilt die 6 aktiven
Profile über die Läufe. **Kein manueller Lauf wurde gestartet, kein Cron/Trigger
eingerichtet, keine automatische Überwachung behauptet.**

**Folgeauftrag 25B (klar umrissen, unverändert gültig):** Sobald ein vollständig
abgeschlossener regulärer Lauf des Pilotmandanten mit **verändertem
Eingabefingerabdruck** (also einer echten neuen Generation, nicht nur
`wiederholungen+1`) nach dem Deployment vorliegt: (1) rein lesend prüfen, dass der
Lauf regulär (Cron-Auslöser), vollständig und dem Pilotmandanten zugeordnet ist;
(2) `node scripts/befund-27a2-production-messung.js` erneut ausführen — Erwartung
„QUALIFIZIERTE Faelle NACHHER: 0", **und** die 2 falschen Alt-Zeilen des Piloten
sind abgelöst, **0** neue falsche Belege, Rang/Ähnlichkeit unverändert;
(3) Erscheinen/Nichterscheinen in der Lage samt sichtbarer Erklärung gegen die
persistierten Felder prüfen; (4) zeitliche Reihenfolge (Deployment → Lauf → Zeilen)
und Laufzuordnung dokumentieren; (5) keinerlei Schreibzugriffe.

**Vor diesem Folgeauftrag steht jedoch die Betreiberentscheidung zu B25-2** (§6c):
ob weiter abgewartet wird oder ob eine der freigabepflichtigen Optionen die
Neuberechnung auslösen soll. Ohne diese Entscheidung ist ein Abschlusstermin für
25B nicht zusagbar.

### 6d · Der erbrachte Nachweis (2026-07-31, rein lesend)

**Werkzeug:** [`../../scripts/punkt25b-production-nachweis.js`](../../scripts/punkt25b-production-nachweis.js).
Schreibschutz strukturell wie bei der 27A-2-Messung: genau **eine** HTTP-Funktion mit
GET-**Literal**, Pfad-Allowlist ohne `rpc`, `storage.js` wird nicht geladen. Mandanten
pseudonymisiert (`BT-01`…), keine Klarnamen, keine Rohtexte. **0 KI-Aufrufe, 0,00 USD,
kein manueller Lauf, kein Trigger, kein Schreibzugriff.**

**Zeitachse (alles UTC):** Merge PR #190 `bd7c889` → Deployment
`dpl_BK8WrEEPw3HxmXJfu2pT2eNSNGLv` (production, `helmut-pilot.vercel.app`, `fra1`)
**READY 10:43:27** → Vorher-Messung 11:05 → regulärer `crawl`-Cron **16:04:28**
(Ende 16:04:29) → Nachweis-Messung 16:07.

**Vorher/Nachher am Pilotmandanten (BT-02):**

| | vorher (11:05 UTC) | nachher (16:07 UTC) |
|---|---|---|
| Rezeptversion der Zeilen | `legacy_relevance_v1` | **`legacy_relevance_v2`** |
| Eingabefingerabdruck | `160cd166…` | **`56d40016…`** (gewechselt) |
| Laufzeile | 2026-07-30 07:56:54, `wiederholungen=1` (idempotent — genau B25-2) | 2026-07-31 16:04:28, **`wiederholungen=0`, 20 Zeilen veröffentlicht** |
| falsche Ausschussbelege | **2** (Rang 1 und 15, Vorgangsebene `land`, „Arbeit und Soziales") | **0** |
| Rang-1-Begründung | „Betrifft deinen Ausschuss Arbeit und Soziales und deine Partei Die Linke." | **„Betrifft deine Partei Die Linke."** |

**23 von 23 Prüfungen grün** — regulärer Cron-Auslöser · vollständig abgeschlossen ·
aktives Bundestagsmandat · **echte neue Generation** (nicht `wiederholungen+1`) ·
Zeitreihenfolge Deployment < Start < Ende · Rezeptversion angehoben ·
Fingerabdruckwechsel · Engine-/Vektorversion **unverändert** · Laufkennung an jeder
Zeile · Lauffingerabdruck an jeder Zeile · Mandantenzuordnung · Ränge 1–20 lückenlos ·
je Vorgang genau **eine** aktuelle Zeile · `berechnet_am` im Laufzeitraum ·
**kein falscher Ausschussbeleg** (je Zeile mit der echten `ausschussBelegZulaessig`
nachgerechnet, 0 von 20) · kein Beleg bei fehlender/unbekannter Ebene (fail-closed) ·
sichtbare Erklärung deckt sich je Beleg nach **Art und Wert** mit den persistierten
Merkmalen · Belegpflicht · Begründung persistiert · Signale persistiert ·
Entscheidungen vorhanden und mandantenrein (322) · Lauf ohne Fehlereintrag.

**Bestandswirkung:** im **gesamten** Production-Bestand jetzt **0** falsche
Ausschussbelege. Alt-Zeilen sind **abgelöst, nicht gelöscht** (BT-02: 57 abgelöst,
20 aktuell) — die Historie bleibt prüfbar.

**Ehrliche Korrektur zur früheren Zählung:** §6b nannte **5** falsche Belege
(2 Pilot + 3 zweiter Mandant). Zum Messzeitpunkt 11:05 UTC waren es nur noch **2** —
die 3 des zweiten Mandanten hatte ein natürlicher Lauf am 30.07. um 16:04 UTC bereits
abgelöst. Die Zahl 5 galt am 31.07. um 00:45 UTC und war zum Zeitpunkt der
Rezeptanhebung überholt.

**Zwei benannte Nebenbeobachtungen (kein Mangel dieses Nachweises):**
- **B25-3:** Zwei aktive Bundestagsprofile (`BT-05`, `BT-06`) tragen 47 bzw. 30
  aktuelle Zeilen **ohne** `rezept_version` und ohne Laufzeile — Altbestand aus der
  Zeit vor der Auditpersistenz (`matching_runs` hat erst 6 Zeilen). Sie tragen
  **keine** falschen Ausschussbelege. Sie werden bei ihrem nächsten regulären Lauf
  regulär neu gerechnet; ein Backfill ist dafür nicht nötig und wurde nicht gemacht.
- Die Rezeptanhebung wirkt **je Mandant genau einmal**; zum Messzeitpunkt standen
  **5 von 6** Profilen noch auf dem alten Stand und werden bei ihrem jeweils nächsten
  regulären Lauf nachgezogen. Das ist der vorhergesagte, erwünschte Verlauf.

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

1. ~~**Betreiberentscheidung zu Befund B25-2**~~ — **erledigt (2026-07-31):** Option
   (b) **Rezeptversion anheben** ist umgesetzt (`legacy_relevance_v1` → `v2`,
   [`../matching-nachvollziehbarkeit.md`](../matching-nachvollziehbarkeit.md) §53).
   Der Eingabefingerabdruck jedes Mandanten ändert sich damit **genau einmal**; der
   nächste reguläre Lauf löst die falschen Alt-Zeilen ab — inklusive der
   **Rang-1**-Karte des Piloten. Wirkung mandantenneutral (keine Sonderbehandlung),
   Ähnlichkeit und Rang unverändert, Kosten 0,00 USD, Rückweg `git revert` (macht
   die Korrektur nicht rückgängig, stoppt nur weitere Neuberechnungen).
   Die verworfenen Alternativen bleiben dokumentiert: weiter abwarten (Termin nicht
   zusagbar) · gezielter Neulauf des Piloten (manueller Lauf) · Backfill
   (Production-Schreibzugriff) — **keine davon wurde ausgeführt oder vorbereitet.**
2. ~~Sobald eine echte neue Generation des Piloten vorliegt: Folgeauftrag 25B aus §6
   ausführen (rein lesend).~~ — **erledigt am 2026-07-31, 16:04:28 UTC** (§6d):
   23 von 23 Prüfungen grün, alle 17 Abnahmekriterien erfüllt. **Checklisten-Zeile 25
   steht auf ✅**; Stand der Phase-1-Checkliste damit 14 ✅ · 12 ⏳ · 4 ☐.
3. Unabhängig davon: PR #187 (Punkt 29A) wartet vereinbarungsgemäß auf den
   25B-Abschluss und ist danach auf den neuen `main` zu rebasen.

3. **Punkt 25 ist abgeschlossen.** Offen bleiben getrennt davon: **29B** (rein
   lesender Production-Nachweis der Fehlerpfade, wartet auf natürlich auftretende
   Fehlerzustände — künstliche Fehler sind verboten), die Nachziehung der übrigen
   **5 von 6** Mandanten auf die neue Rezeptversion durch ihre jeweils nächsten
   regulären Läufe (kein Handlungsbedarf, nur Beobachtung) sowie die benannten
   Beobachtungen **B25-1** (Lage-Sortierung nach Ähnlichkeit statt Entscheidungsstufe),
   **B25-3** (Altbestand ohne Rezeptversion, §6d) und **B25-F1** (flatternde
   `werkzeug-lesefehler-test.js` unter Last).
