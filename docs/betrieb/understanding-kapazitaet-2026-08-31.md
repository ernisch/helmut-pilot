# Understanding-Kapazität: Diagnose und Rückstandsschleife (2026-08-31)

**Sprint:** Getrennter Kapazitätssprint nach PR #283 · Branch `claude/understanding-kapazitaet-diagnose-7meqjr`
**Production wurde ausschließlich lesend geprüft** (`SELECT`-Aggregate, Vercel-API lesend). Keine Datenänderung,
keine Migration, kein Modellaufruf, keine Preview. Alle Zahlen dieses Belegs sind am 31.08. frisch gemessen
(Projekt `ddckuvvpcytqbyfmbvie`) oder ausdrücklich als dokumentiert/unbelegt gekennzeichnet.

---

## 1 · Frisch gemessene Production-Ausgangslage (31.08., Stichzeit ~09:30 UTC)

**Deployment-Stand:** `main` = `0f900e68` (Merge PR #283, 31.08. 07:14 UTC), Vercel-Production-Deployment
dazu `READY` (rein lesend geprüft). Alle Läufe bis einschließlich 31.08. 05:32 UTC trugen noch den
Vorgänger-Commit `afc807e0` — der Merge lag nach dem Morgenlauf; kein Widerspruch.

**Rückstand (knowledge_objects):**

| Kennzahl | Wert |
|---|---|
| pending | **9.080** (davon **8.895 älter als 24 h**) |
| Altersgruppen pending | <24 h: 185 · 1–3 T: 475 · 4–7 T: 1.048 · 8–30 T: 6.451 · >30 T: 921 |
| Ältester offener Vorgang | **2026-07-02 16:36 UTC** |
| complete / failed | 2.645 / 31 · 0 Dubletten (11.756 Zeilen = 11.756 distinct `vorgang_id`) |
| Verarbeitbarkeit pending | 7.311 mit Rohdokument im 30-Tage-Fenster · 1.727 nur älter · **42 ohne jedes Rohdokument** |

**Zustände (CAS-Reservierungen seit 17.08.):** fertig 772 (Ø 1,09 KI-Aufrufe je Ergebnis, Summe 845) ·
offen 11 (0 aktive Leases) · unbekannt 3 · aufgegeben 1 · **0 hängende CAS-Leases, 0 hängende
Warteschlangen-Leases** (helmut_jobs: 0 aktive/abgelaufene Leases; document_understanding 742 erledigt /
8 wartend, attempts ≤ 1) · Vormerkungen: 2 (ältestes ~100 h, 0 Fehlversuche) · pipeline_locks leer.

**Ankunft je UTC-Tag (neu angelegte Wissensobjekte):** 15.–30.08.: 232 · 320 · 386 · 322 · 351 · 390 ·
449 · 338 · 247 · 282 · 226 · 469 · 358 · 298 · 232 · 286. **Ø 324/Tag (16 Tage), Ø 307/Tag (7 volle
Tage 24.–30.08.), Maximum 469 (26.08.).** Ankunftsschübe zu den vier Quellslots 04/10/16/20 UTC.

**Abfluss je UTC-Tag (Reservierungen → fertig):** 17.–30.08.: 24 · 43 · 43 · 39 · 38 · 34 · 47 · 59 ·
64 · 70 · 68 · 64 · 82 · 69. **Ø 68/Tag (24.–30.08.). Nettodefizit Ø −239/Tag.** Der Rückstand wächst
an jedem einzelnen Tag; der Siebentagenachweis (Stufe 2: Abfluss ≥ Ankunft über 7 Tage, Wartezeit < 24 h)
hat strukturell nicht begonnen.

**Abfluss nach Uhrzeit (7 Tage):** 05:3x ≈ 18/Tag und 21:3x ≈ 16/Tag (dedizierte Understanding-Crons) ·
04/16/20 UTC ≈ 29/Tag zusammen (Verstehensphase der drei schweren Warteschlangen-Slots, je ~90-s-Budget) ·
10:0x ≈ 5/Tag (Lage-Check). Damit ist der gemessene Abfluss vollständig erklärt.

**Läufe (process_runs):** `understanding-cron` 2×/Tag, Dauer 215–229 s (Ende ~60 s vor der harten
280-s-Grenze), Arbeitsfenster 50–51 Cluster, verarbeitet 14–20, vertagt 25–45. `understanding-lage`
täglich ~10:01 (Cluster ~535–597, verarbeitet 4–12). `understanding-eager` sporadisch (0–7, Grund
`zeitbudget`). Abgeleitete Modellzeit: **~11,5 s je verarbeitetem Vorgang, strikt seriell** (Parallelität 1).

**KI-Tageszähler (llm_budget_counters, Scope global):** 24.–30.08.: 72 · 82 · 88 · 79 · 77 · **100** · 84.
Der Deckel 100 wurde in 47 Tagen nur **4-mal** erreicht (20.07., 01.08., 02.08., 29.08. — dort letzte
Buchung 21:33 UTC, also im Abendlauf). **An 43 von 47 Tagen blieben im Schnitt ~19 Aufrufe ungenutzt.**
Werte > 50 an fast allen Tagen beweisen zugleich: das 50er-Schutzlimit greift nicht, der wirksame Deckel
ist 100. Die Reserve 30 ist nur dokumentiert (Env nicht lesbar). Andere Verbraucher: ~6–8 Aufrufe/Tag.

**Qualität der Arbeit (kein nennenswerter Ausschuss):** 1,09 KI-Aufrufe je Ergebnis · 0 technische
Dubletten · echte Fehler klein (31 failed Altbestand, 3 unbekannt, 1 aufgegeben; Gründe dokumentiert,
davon 1 U+0000-Fall aus PR #283) · Wiederholungen: `versuche` Ø 1,10. **„Unnötige KI-Aufrufe reduzieren"
ist KEIN wirksamer Hebel — die Verschwendung liegt unter 10 %.**

**Altersverteilung des Abflusses (VERDRÄNGUNG BEWIESEN):** Von 483 Abschlüssen der letzten 7 Tage waren
je Tag 22–67 jünger als 24 h; Vorgänge älter als 7 Tage kamen nur **1–5 je Tag** dran — bei 7.372
Wartenden über 7 Tagen. Beleg: von 43 am 31.08. (Teiltag) neu angelegten Vorgängen waren um 06:00 UTC
bereits 25 verstanden, während 8.895 ältere warteten.

**Gate-Schatten (OP-18, 14 Tage):** Entscheidungen „verstehen" 10.799 · „parken" 5.886 · „zurückstellen"
5.793. Je Tag (24.–30.08.) sind von Ø 307 Neuankünften nur **Ø 91 (55–156) gate-würdig** („verstehen"),
Ø 161 parken/zurückstellen, Ø 55 ohne Bewertung. **Fehlallokation gemessen:** von 483 Abschlüssen der
letzten 7 Tage waren nur 155 (32 %) gate-würdig — 267 (55 %) der knappen Aufrufe gingen an Vorgänge, die
das Gate parken/zurückstellen würde. Rückstands-Zusammensetzung: 1.599 „verstehen" · 1.292 „parken" ·
1.147 „zurückstellen" · 5.042 ohne Bewertung (Altbestand vor Gate-Telemetrie).
`estimated_cost_usd` in gate_shadow_events ist im Messfenster durchgehend NULL — Preisbasis bleibt
unbelegt (F7).

## 2 · Primärer Engpass

**Slot-Laufzeitkapazität der seriellen Verarbeitung — nicht der KI-Tagesdeckel.**

Rechnung aus Messwerten: 2 dedizierte Slots × (~220 s nutzbar / 11,5 s je Aufruf) ≈ 38 + Warteschlangen-
Verstehensphase ~29 + Lage ~5 ≈ **72 priorisierte Verstehensaufrufe/Tag** → ~68 Ergebnisse/Tag (×1/1,09).
Genau das wird gemessen. Der Deckel 100 band nur an 4 von 47 Tagen; an allen anderen endete der Tag mit
ungenutztem Budget, weil **kein Slot mehr Zeit hatte** — die Restzeitwache vertagt korrekt bei ~60 s
Restreserve. Mehrere natürliche Slots schöpfen den heutigen Deckel also NICHT nur früher aus: im Mittel
sind ~19 Aufrufe/Tag schlicht unerreichbar liegen geblieben.

## 3 · Sekundäre Engpässe

1. **Auswahlstrategie (Verhungern, bewiesen):** `listPendingKnowledgeObjects` = Fenster 50, `updated_at.desc`
   (jüngst-zuerst). Bei ~307 Neuankünften/Tag enthält das Fenster strukturell nur die jüngsten Vorgänge;
   der Rückstand > 24 h ist für die Frischläufe unsichtbar. Zusätzlich altert er täglich weiter über die
   30-Tage-Klippe des Rohdokument-Fensters (heute schon 1.727 nur noch über Verknüpfungen erreichbar).
2. **KI-Tagesdeckel 100:** wird zum bindenden Engpass, sobald der Slot-Engpass behoben ist
   (~93 Verstehensaufrufe/Tag Obergrenze bei ~7 anderen Verbrauchern). Für Ankunft Ø 307 bräuchte
   „alles verstehen" 335–511 Aufrufe/Tag — der Deckel ist dafür um Faktor 3,5–5 zu klein.
3. **Fehlallokation ggü. Gate-Urteil:** 55 % der Aufrufe an nicht gate-würdige Vorgänge (siehe §1) —
   der dokumentiert wirksamste Hebel (OP-18, „~54 % Ersparnis") ist nicht aktiv (Betreiberentscheidung).

**Ausgeschlossen als Engpässe** (gemessen): CAS/Leases (0 hängend), Datenbankzugriffe (Läufe enden an
der Zeitwache, nicht an Timeouts), Dubletten/Wiederholungen (Ø 1,09), Fehlerquote (<1 %/Tag),
Warteschlangenmotor (leer, gesund, shadow-Dispatch ohne Abflussbeitrag).

## 4 · Mengen- und Kostenrechnung

Preisbasis unverändert unbelegt (F7). Kostenwerte sind **Untergrenzen** aus
[`kostenmessung.md`](kostenmessung.md): ~0,137 USD/Betriebstag bei Ø ~81 Aufrufen → **~0,0017–0,0034
USD je Aufruf** (gemessener Einzellauf §3.3: 0,0034).

| Größe | Wert |
|---|---|
| Ankunft Ø / Max (16 T) | 324 / 469 pro Tag; 7-Tage-Ø 307 |
| davon gate-würdig | Ø 91, Spitze 156 |
| Abfluss Ø | 68/Tag · Defizit Ø −239/Tag |
| Nötiger Abfluss „alles verstehen“, stabil | ≥ 324 Ø → 335–511 Aufrufe/Tag; mit Reservefaktor ≥ 2 (Zielarchitektur §23): ~700–1.020 Kapazität |
| Nötiger Abfluss „gate-treu“, stabil | ≥ 91 Ø → 99–170 Aufrufe/Tag; mit Reserve ×2: ~200–340 Kapazität |
| Rückstandsabbau gate-würdig (sicher 1.599; Obergrenze ~4.000 inkl. ~48 % der 5.042 Unbewerteten — **nicht eindeutig beweisbar, nur Obergrenze**) | 7 T: +229…+571/Tag (unrealistisch) · 14 T: +114…+286 · 30 T: +53…+133 |
| Rückstandsabbau gesamt verarbeitbar (7.311) | 30 T: +244/Tag · 90 T: +81/Tag |

**Szenariotabelle** (Rechenmodell ausführbar in `lib/helmut/verstehen-rueckstand.js` →
`kapazitaetsRechnung()`, testgesichert in `scripts/verstehen-rueckstand-test.js` §10):

| Szenario | Abfluss/Tag | KI/Tag | Wirkung | Zusatzkosten/Tag (Untergrenze) |
|---|---|---|---|---|
| 1 Heute | 68 | ~81 | Defizit −239; Verhungern | 0 |
| 2 Nur Gate scharf (Betreiber) | 68 | ~81 | Defizit der gate-würdigen Menge nur noch −23 | 0 |
| 3 **+2 Rückstandsslots (dieser PR)** | ~84–98 | ≤100 | +16–30/Tag; Altbestand garantiert bedient; Deckel bindet an guten Tagen | +0,03–0,07 USD |
| 4 Nur Deckel anheben (ohne Slots) | 68 | ~81 | **wirkungslos** — Deckel band ja nicht | ~0 |
| 5 Nur Parallelität 2 (Betreiber-Env; Anbieterdrosselung unbewiesen) | ~110–125 | ≤100 | Deckel bindet sofort; Z3b offen | +0,04 |
| 6 **Kombination: PR + Gate scharf + Deckel 200 (Betreiber)** | ~130–160 (gate-würdig + Abbau) | ~145–175 | Überschuss +40–70/Tag auf gate-würdige Menge; Abbau 1.599–4.000 in ~30–90 T | +0,10–0,32 USD (~3–10 USD/Monat) |

Rechenprobe des Modells gegen die Realität: Szenario 1 liefert rechnerisch 66/Tag — gemessen 68 ✓.

**Skalierung:** Verstehen ist quellengetrieben (global geteilt), nicht mandatsgetrieben — 10 Mandate ohne
neue Quellen erzeugen ≈ dieselbe Verstehenslast (nur mandatsgebundene Arbeit wächst, +3,8 Aufträge/Mandat/Tag,
Linie B). Dokumentierte KI-Bedarfe: 25 Mandate 88–336/Tag · 50: 110–444 · 100: 151–647 · 500: 344–1.040
([`skalierung-25-50-100.md`](skalierung-25-50-100.md) §2c) — Gate- und Deckelentscheidung sind ab 10–25
Mandaten ohnehin Pflicht; die Rückstandsslots skalieren linear mit der Slotzahl und bleiben durch
Laufdeckel/Boden kostenkontrolliert.

## 5 · Gewählte Lösung (dieser PR): Rückstandsschleife

Kleinste sichere Korrektur, die den ungenutzten Deckelrest in garantierte Altbestand-Bedienung umsetzt —
**der Verstehensmotor selbst bleibt byte-identisch** (CAS, Fencing, Vorgangswache, Restzeitwache,
Laufbilanz aus PR #283, Parser aus PR #274 unangetastet):

1. **Neue Route `/api/cron/understanding-rueckstand`** (server.js), zwei Cron-Slots **11:30 und 17:30 UTC**
   (≥ 30 min Abstand zu jedem bestehenden Slot; das globale Understanding-Schloss, TTL 10 min, schließt
   Überlappung ohnehin aus). Gleiche Zeitgrenzen wie der Frischlauf (280-s-Deadline, 240-s-Loop-Budget),
   kein Recovery-Vorlauf.
2. **Auswahl älteste zuerst:** `listPendingKnowledgeObjects({ limit, reihenfolge: "aelteste" })` →
   `order=created_at.asc` (Whitelist, jeder andere Wert fällt auf das Bestandsverhalten zurück).
   Fenster 120 (`HELMUT_RUECKSTAND_FENSTER`, 10–500), damit die 42 beleglosen Altvorgänge
   (je Lauf ehrlich `skipped-no-cluster`, 0 KI-Kosten, ~6 s Lesezeit) das Fenster nicht leerfressen.
3. **Nicht priorisierte Buchung:** callType `understanding-rueckstand` ist bewusst NICHT in
   `LLM_PRIORITY_CALLTYPES` — am atomaren Choke-Point (`helmut_reserve_llm_call`) gilt damit
   effectiveMax = Tagesdeckel − Reserve (100−30=70). **Rückstandsarbeit kann der Frischverarbeitung nie
   die dokumentierte Reserve nehmen und den Tagesdeckel nie überschreiten** — dieselbe geprüfte Mechanik,
   kein neuer Budgetcode.
4. **Zwei zusätzliche fail-geschlossene Grenzen** (`lib/helmut/verstehen-rueckstand.js`):
   Laufdeckel `HELMUT_RUECKSTAND_MAX_AUFRUFE` (Default 20, 1–50) und Budget-Boden
   `HELMUT_RUECKSTAND_BUDGET_BODEN` (Default 30 = dokumentierte Reserve; keine neue Erlaubnis, wenn vom
   Tagesdeckel ≤ Boden übrig ist). Ein nicht bezifferbarer Budgetstand erlaubt NICHTS (strenger als der
   Frischpfad; `Number(null)`-Falle aus PR #283 ausdrücklich behandelt und getestet).
5. **Ehrliche Telemetrie:** eigener Prozessname `understanding-rueckstand` (Laufbilanz + recordProcessRun
   wie im Frischlauf, zusätzlich Fenster/Laufdeckel/Boden/Erlaubnisse in der Telemetrie); Gesundheitsbericht
   überwacht die neuen Slots (SLOT_PLAN 11:30/17:30) **selbstverankert**: erzwungen erst ab der ersten
   eigenen Quittung — kein „Slot fehlt"-Fehlalarm am Deploy-Tag (Muster des belegten 26.08.-Fehlalarms),
   danach volle Erwartung inkl. Störungsmeldung bei `partial/failed`.

**Erwartete Wirkung nach Merge (heutiger Deckel 100):** +16–30 Ergebnisse/Tag (begrenzt durch den
ungenutzten Budgetrest), Abfluss ~84–98/Tag, und erstmals eine **garantierte** tägliche Bedienung der
ältesten Vorgänge statt 1–5 Zufallstreffern. Mit Betreiberentscheidung Deckel 200: +35–38/Tag aus den
beiden Slots (dann slotbegrenzt), plus voller Frischpfad.

## 6 · Verworfene Lösungen

| Ansatz | Grund der Verwerfung |
|---|---|
| Nur KI-Deckel erhöhen | Deckel band an 43 von 47 Tagen nicht — ohne zusätzliche Slotzeit wirkungslos (Messung §1); zudem ausdrücklich untersagt ohne Mengen-/Kostenrechnung |
| Parallelität > 1 (Code-Default ändern) | Anbieterdrosselung/Azure-Verhalten unbewiesen (Z3b offen); Zielarchitektur bindet Parallelität an eigene Freigabestufe; Env-Aktivierung bleibt dem Betreiber dokumentiert offen |
| Gate scharfschalten (shadow→on) | Feature-Flag-Scharfschaltung ist ausdrücklich freigabepflichtig (CLAUDE.md §5); als Betreiberempfehlung in §8 quantifiziert |
| Frischpfad auf Gate-/Altersreihenfolge umbauen | Eingriff in den bewährten, production-belegten Pfad (Briefing-Zulieferung 05:30/21:30); Verdrängungsproblem wird bereits durch die getrennten Slots gelöst |
| Recovery-/Anker-Pfad reaktivieren | F-3: in Production gescheitert, dreifach stillgelegt, `understanding-recovery.yml` darf nie laufen |
| Pauschales Aussortieren alter Vorgänge (>30 T, „zu-alt") | Production-Datenänderung/Produktentscheidung (OP-06-Muster); die 1.727 + 42 Fälle sind in §8 als eigener Entscheidungspunkt beziffert |
| Ereignis-Antrieb (Selbstweck) aktivieren | fünf Env-Werte + Betreiberfreigabe + eigener Nachweisplan (Runbook §31); orthogonal zur Auswahlkorrektur |

## 7 · Lokale Umsetzung und Testergebnisse

**Geänderte Dateien:** `lib/helmut/verstehen-rueckstand.js` (neu) · `server.js` (+Route) ·
`lib/helmut/storage.js` (Reihenfolge-Whitelist) · `lib/helmut/understanding.js` (callType-Durchreiche,
Default byte-identisch) · `lib/helmut/motor-health.js` (SLOT_PLAN + Selbstanker) · `vercel.json`
(2 Cron-Einträge + Branch-Deploysperre) · `scripts/verstehen-rueckstand-test.js` (neu, 56 Prüfungen) ·
3 Cron-Vertragstests fachlich nachgeführt (`cron-fairness-test.js`, `scalable-pipeline-flag-test.js`,
`warteschlangen-abfluss-test.js`).

**Tests (alle über `scripts/lokal.js`):** neue Suite **56 PASS / 0 FAIL** (deckt die 16 Pflichtprüfungen
des Sprintauftrags; Zuordnung im Suitenkopf). Gezielt: lauf-bilanz 149/0 · motor-health 65/0 ·
health-report-route 49/0 · cron-fairness 285/0 · cron-fairness-persistenz 54/0 · cron-globalphase 176/0 ·
scalable-pipeline-flag 52/0 · warteschlangen-abfluss 32/0 · env-inventar 38/0 · verstehen-wiederaufnahme
47/0 · verstehen-restzeit 50/0 · current-state-groesse 4/0. **Kanonischer Offline-Gesamtlauf: 285/287
Suiten grün (667 s)** — die zwei roten sind die bekannten fehlenden lokalen npm-Pakete (`ical.js`,
`@aws-sdk/client-sqs`; identischer Altbestand wie vor dem Sprint, CURRENT_STATE §19). Während der
Testentwicklung deckte §2.5 einen echten Fehler im neuen Wächter auf (Number(null)→0 wäre in den
falschen Ablehnungszweig gelaufen — dieselbe Falle wie in PR #283) — behoben, bevor irgendetwas
gepusht wurde.

## 8 · Was in Production noch unbewiesen ist — und die Betreiberhebel

**Unbewiesen bis zum Merge + natürlichen Läufen:** die reale Slotleistung der Rückstandsläufe
(~19 Aufrufe/Lauf sind aus Frischlauf-Messwerten abgeleitet), das Zusammenspiel mit dem Tagesbudget an
echten Tagen, die Selbstanker-Slotüberwachung, und ob verstandene Altvorgänge die Verbraucher-Scan-Fenster
(500 zuletzt geänderte KOs) unerwünscht fluten — die Frischeverträge (OP-31) und das Ranking begrenzen
das; zu beobachten im ersten natürlichen Fenster.

**Dokumentierte Betreiberhebel (KEINE Codeänderung, hier nur beziffert — nichts davon wird von diesem
PR verändert):**

1. **`HELMUT_MAX_LLM_CALLS_PER_DAY` 100 → 200.** Herleitung: gate-würdige Ankunft Ø 91 × 1,09 ≈ 100
   Aufrufe/Tag + Abbau 1.599–4.000 in 30–90 Tagen (+53–133/Tag) + andere Verbraucher ~8 → 160–240;
   200 deckt den Ø-Fall mit Reservefaktor ~2 und die Spitze (156×1,09≈170) knapp. Kosten:
   +100 Aufrufe/Tag ≈ +0,17–0,34 USD/Tag (~5–10 USD/Monat, Untergrenze, Preisbasis unbelegt F7).
   Risiko: Kostenobergrenze steigt; Rückweg: Wert zurücksetzen — Mechanik fail-closed, keine Codeänderung.
   **Ohne gleichzeitige Slot-/Gate-Maßnahme wirkungslos (§4 Szenario 4).**
2. **Understanding-Gate shadow → on (OP-18, Produktentscheidung).** Shadow-Messung: nur ~48 % der
   Dokumente „verstehen"-würdig; Restliste nennt das Gate den wirksamsten Kostenhebel (~54 % Ersparnis).
   Voraussetzung: Produktentscheidung über die ehrliche Darstellung geparkter Vorgänge (kein falsches
   Grün, keine stillen Löschungen).
3. **`HELMUT_VERSTEHEN_PARALLELITAET` (1 → 2):** erst nach Z3b/Anbieternachweis; CAS ist seit 17.08.
   aktiv, die Klemme ohne CAS bleibt.
4. **OP-06-Erweiterung:** Entscheidung über die 42 beleglosen + 1.727 außerfenstrigen Altfälle
   (ehrlicher Terminalzustand statt ewigem Fensterballast).

## 9 · Voraussetzungen Siebentagenachweis und zehn Mandate

**Siebentagenachweis (Stufe 2):** beginnt frühestens, wenn Abfluss ≥ Ankunft über 7 Tage UND Wartezeit
< 24 h. Mit diesem PR allein: nicht erreichbar (Defizit sinkt auf ~−200/Tag gesamt bzw. −23/Tag
gate-würdig). Erreichbar für die gate-würdige Menge mit Kombination §4/Szenario 6 (PR + Gate + Deckel
200): Überschuss +40–70/Tag, Wartezeit-<24-h-Ziel nach Abbau des gate-würdigen Bestands (~30–90 Tage).
„Alles verstehen" bräuchte ~700er-Kapazität (Szenario-Obergrenze, §4). **Die Aktivierung von zehn
Mandaten bleibt gesperrt**, bis der Nachweis geführt ist; die Verstehenslast selbst ist quellengetrieben
und steigt durch +5 Mandate kaum (§4), aber Stufe-2-Kriterien und OP-15 gelten unverändert.

## 10 · Rückkehrweg

Merge rückgängig = Revert des PR (die zwei Cron-Einträge und die Route verschwinden, Auswahl-Whitelist
und callType-Durchreiche sind ohne Aufrufer inert; keine Migration, keine Datenformate geändert).
Betrieblich ohne Revert: beide Rückstandsslots sind über `HELMUT_RUECKSTAND_MAX_AUFRUFE=1` faktisch
stilllegbar (je Lauf höchstens 1 Aufruf) — kein Flag nötig, kein Deploy über den Wert hinaus.
Die Selbstanker-Slots melden nach Stilllegung „Slot fehlt" — erwartetes, ehrliches Verhalten;
bei dauerhafter Stilllegung SLOT_PLAN-Eintrag entfernen (Doku-Change).

## 11 · Nächster sicherer Schritt

1. Betreiber: PR prüfen und mergen (Merge = Deployment; erste natürliche Rückstandsläufe 11:30/17:30 UTC).
2. Nach 2–3 natürlichen Läufen: Quittungen `understanding-rueckstand` rein lesend gegen §5 prüfen
   (Erlaubnisse ≤ 20, Boden gehalten, Altersverteilung des Abflusses verschiebt sich in die 8–30-Tage-Gruppe).
3. Betreiberentscheidung §8 (Deckel 200 und/oder Gate) mit den dann gemessenen Slotleistungen nachschärfen.
4. OP-06-Entscheidung für die 1.769 nicht verarbeitbaren Altfälle.

## 12 · Gate-Arm (OP-18): der echte Vorfilter — Umsetzung 31.08. (zweiter Änderungssatz)

**Anlass (belegt):** Die Gate-Freigabeprüfung ergab, dass `HELMUT_UNDERSTANDING_GATE=on` bis zu
diesem Änderungssatz **mechanisch wirkungslos** war — `runUnderstandingShadow` protokollierte bei
`on` nur (`blockiert: 0` hartkodiert), `runPendingUnderstandingShadow` (Pending-, Rückstands-,
Lage-, Warteschlangenpfad) hatte **gar keinen** Gate-Bezug. Ein Flag-Umlegen wäre falsches Grün
gewesen; der Betreiber hat es ausdrücklich untersagt und stattdessen den echten Arm beauftragt.
Messgrundlage bleibt der Schattenbetrieb: 109.480 `gate_shadow_events`, davon **0** amtliche/
kuratierte Dokumente mit Parken-Entscheidung, **0** Entscheidungen ohne Grund.

**Kanonische Prüfstelle (genau eine):** `understandOneCluster` prüft bei Modus `on` — **vor**
Restzeitwache, CAS-Reservierung, Vorgangswache und Budget — die Cluster-Entscheidung
(`understandingGate.assessCluster`). Alle Erstverstehens-Pfade (Frisch-Cron, Rückstandsschleife,
Warteschlangen-Verstehensphase, Lage, eager) laufen durch diese eine Funktion; es gibt keine
zweite Gate-Logik und keinen Pfad daran vorbei (strukturgesichert,
`scripts/understanding-gate-arm-test.js` §12). **Nie geparkt werden:** Aktualisierungen
bestehender `complete`-Vorgänge, `failed`/`failed-final` (eigene Zustände) und ausdrückliche
Betreiberfreigaben (`erneut` schlägt das Gate). Geparkt wird nur bei positivem Befund
(Cluster-Entscheidung `parken` aus ≥ 1 bewertetem Dokument); leere/nicht ladbare Cluster und
Gate-Fehler parken nichts.

**Produktentscheidung geparkter Vorgänge (verbindlich umgesetzt):** eigener, sichtbarer,
reversibler Zustand `understanding_status='gate-geparkt'` auf `knowledge_objects` — **keine
Migration** (Spalte existiert, kein CHECK-Constraint; gegen `pg_constraint` verifiziert), kein
Delete, keine Überladung von `failed`. Jede Parkung trägt Grund + Gate-Version +
Entscheidungszeitpunkt als Belegzeilen in `gate_shadow_events`
(`understanding_result='gate-geparkt@<GATE_VERSION>'`, Zeitpunkt = `created_at`), Reihenfolge
fail-geschlossen **erst Beleg, dann Zustand** — scheitert irgendein Schritt, wird normal
verarbeitet (kostet schlimmstenfalls einen Aufruf, nie Arbeitsverlust, nie beleglose Parkung).
Geparkte verbrauchen kein Budget, keine CAS-Lease, und die pending-Auswahl schließt sie
server- **und** clientseitig aus (kein sofortiges Wiedereinsammeln, kein Fensterverdrängen).
Zählung getrennt: Gesundheitsbericht-Queue-Zeile `· Gate geparkt <n>` (null ⇒ „?", nie erfundene
0), Lauftelemetrie-Gruppe `ausgeschlossen` (Laufbilanz-Identität aus PR #283 bleibt erhalten).

**Rückwege (drei, alle belegt):**
1. **Eingabeänderung:** erreicht ein Cluster-Pfad einen geparkten Vorgang und das Gate
   befürwortet jetzt (neues Dokument), wird erst der Zustand auf `pending` zurückgesetzt, dann
   normal verarbeitet.
2. **Neue Gate-Version / Wiedervorlage:** `pruefeGeparkteNeuBewertung` läuft KI-frei als
   begrenzter Vorlauf jedes Rückstandslaufs (nur bei `on`; Default 25, Deckel 50, Tagesrotation
   über die älteste-zuerst sortierte geparkte Menge) und gibt inzwischen Befürwortete frei
   (Beleg `gate-freigegeben@<version>`, dann Zustand). `GATE_VERSION` (aktuell `g2026-08-31.1`)
   muss bei jeder fachlichen Regeländerung erhöht werden.
3. **Betreiber:** `GET /api/admin/gate/geparkt` (Sicht) und
   `POST /api/admin/gate/parkung-freigeben` (admin-geschützt, bestätigungspflichtig, explizite
   Kennungen, max 200) — kontrollierte Rückgabe in die Bewertung.
   Rückweg des Modus: `on → shadow` stoppt jede neue Parkung sofort; bereits Geparkte behalten
   ihren Zustand bis zur Freigabe (einer der drei Wege) und blockieren nichts.

**Aktivierung bewusst getrennt:** Dieser Änderungssatz lässt `helmut-flags.json` auf `shadow` —
der Arm ist einsatzbereit, aber **nicht scharf**. Scharfschalten ist ein eigener, minimaler
Folgeschritt (Flag `shadow → on`), erst nach rein lesender Prüfung der natürlichen
Rückstandsläufe und der nachgeführten Kapazitätsrechnung (§8-Entscheidung). Wirkung bei `on`
(aus Schattenmesswerten): ~55 % der bisherigen Aufrufe gingen an nicht gate-würdige Vorgänge —
der Arm lenkt diese Aufrufe auf gate-würdige Arbeit um (kein Mehrverbrauch: Deckel/Reserve
unverändert; Kostenwirkung ist eine **Umverteilung**, keine Erhöhung).

**Testergebnisse (alle über `scripts/lokal.js`):** neue Suite
`scripts/understanding-gate-arm-test.js` **48 PASS / 0 FAIL** (off/shadow byte-gleich ·
Parkung verhindert Aufruf vor Budget/CAS · exakte Buchungen · 6 Fehlerpfade fail-geschlossen ·
Idempotenz ohne Doppel-Writes · Eingabe-/Versions-Neubewertung · Betreiberfreigabe schlägt Gate ·
Rückweg on→shadow · Laufbilanz-Identität · Wiedervorlage inkl. Tagesrotation · unbekannte
Flag-Werte fallen auf `off` · Strukturprüfungen). Nachgeführte Suite
`scripts/understanding-gate-integration-test.js` **19 PASS / 0 FAIL** (u. a. `on` parkt einen
echten Parken-Cluster vor dem Modell; ohne persistierbaren Beleg keine Parkung). Kanonischer
Offline-Gesamtlauf mit dem Arm: **286/288 Suiten grün (581 s)** — rot ausschließlich die zwei
bekannten lokalen npm-Fehlstände (`ical.js`, `@aws-sdk/client-sqs`), identisch zur Basis vor
diesem Änderungssatz (§7).
