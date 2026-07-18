# Understanding-Recovery — Trockenlauf-Bericht (rein lesend)

> **Hinweis 2026-07-17:** Freigabe-Nummern folgen jetzt dem eindeutigen Thread-2-Schema **FT2-x** (früher „Fx“); Mapping und verbindlicher Reststand: `docs/datenmotor-restliste.md`.

> **STILLLEGUNG 2026-07-18 (Pending-Sprint):** Der in diesem Bericht vorbereitete
> **anker-basierte Ausführungspfad** (Nachtrag §B, 6er-Allowlist, `understanding-recovery.yml`)
> ist **stillgelegt und entfernt** — ein echter Anker-Lauf erzeugte einen Multi-Themen-Digest
> (`rec-29569461715`, vollständig zurückgerollt). Die rein lesende Analyse dieses Berichts
> bleibt gültig; für echte Recovery gilt ausschließlich der Einzel-Dokument-Pfad je exakter
> `raw_document_id` (Restliste **OP-05**; aktueller Stand dort).

**Auftrag:** Ohne Production-Änderung und ohne KI-Aufruf prüfen, ob die politisch relevanten
`pending`/`failed`-Vorgänge des Alt-Bestands (02./03.07., 2 `failed` vom 15.07.) aus den noch
vorhandenen Rohdokumenten **zuverlässig** rekonstruiert werden können. Grundlage:
`docs/betrieb/understanding_rueckstand_analyse.md`.

**Arbeitsweise (eingehalten):** kein Prod-Write, kein Deploy, keine Migration angewendet, keine
Env-Änderung, keine KI-Aufrufe, FT2-6/FT2-7 nicht aktiviert, keine Retention/Löschung, keine Änderung an
Crawl/Lock/Telemetrie. Keine vollständigen Dokumenttexte / keine unnötigen personenbezogenen Daten
in dieser Doku (nur Themen-Labels, `vorgang_id`-Slugs, Zahlen).

**Ehrlichkeitshinweis zur Herkunft der Zahlen:** Das mitgelieferte Skript
(`scripts/understanding-recovery-dryrun.js`) ist **read-only** und durch Offline-Tests belegt
(26/26), konnte aber in dieser Umgebung **nicht** gegen Production laufen (keine Lese-Secrets).
Die Fallzahlen unten stammen daher aus **äquivalenten, rein lesenden SQL-Abfragen** (Anker-Treffer
im Seed-Fenster + `complete`-Themen-Kollision), die die Skript-Matching-Logik 1:1 abbilden. Der
echte Skriptlauf gegen Prod (mit Lesezugriff) ist der nächste, gefahrlose Schritt.

---

## Gelieferte Artefakte (Code, Tests, Doku — nur Feature-Branch)

- `lib/helmut/understanding-recovery.js` — **reine, schreibfreie** Matching-/Klassifikationslogik
  (nutzt die kanonischen `clusterRawDocuments`/`deriveVorgangId` aus `understanding.js`). Keine
  DB-/KI-/Schreibfunktion.
- `scripts/understanding-recovery-dryrun.js` — **Dry-Run ist der einzige Modus.** Liest Kandidaten
  + Rohdokumente + `complete`-KOs (read-only), erzeugt Vorschläge/Konflikte, schreibt einen
  redigierten JSON-Bericht. **Kein `--execute`** (harter Abbruch), ruft **keine** Storage-Schreib-
  funktion auf.
- `scripts/understanding-recovery-test.js` — 26 Offline-Assertions (siehe §Tests).

**Skript darf nur:** (1) Kandidaten lesen, (2) passende Rohdokumente suchen, (3) Rekonstruktions-
vorschläge erzeugen, (4) Konflikte melden, (5) Bericht schreiben. **Speichert/verändert nichts.**

---

## Bericht

### 1 · Anzahl geprüfter Fälle
**14** repräsentativ geprüft: **8** kernmandatsrelevante `pending` (Kat. 1), **2** `failed` (Kat. 4),
**4** Stichprobe „möglicherweise relevant" (Kat. 2). (Die 27 Rauschen-Fälle sind bereits als
verwerfbar eingestuft; siehe Rückstand-Analyse §3.)

### 2 · Eindeutig rekonstruierbar (1 Dokumentgruppe, netto-neu, kein `complete`-Duplikat)
**4 Fälle** — genau ein kohärenter Treffer, keine Themen-Kollision:

| `vorgang_id` | Thema | Seed-Docs / Quellen |
|---|---|---|
| `vg-steuerstrafrecht` | Steuerstrafrecht / Selbstanzeige-Reform | 1 / 1 |
| `vg-umstellungen` | Arbeitsschutz (TRBA 500 Biostoffe) | 1 / 1 |
| `vg-arbeitsvertraege` | Arbeitsrecht (Arbeitsverträge) | 1 / 1 |
| `vg-sozialwohnungen` | Sozialer Wohnungsbau | 1 / 1 |

### 3 · Wahrscheinlich rekonstruierbar (kohärente Kleingruppe, netto-neu, aber Prüfung nötig)
**2–3 Fälle**:

| `vorgang_id` | Thema | Seed-Docs / Quellen | Anmerkung |
|---|---|---|---|
| `vg-medikamenten` | GKV-Zuzahlung Medikamente/Zahnersatz | 3 / 3 | kohärent, ein Ereignis |
| `vg-psychotherapie` | GKV Psychotherapie-Honorare | 2 / 2 | kohärent |
| `vg-buerokratie` (failed) | Gesundheit/Digital (Arztüberweisung) | ~1 (≈15.07.) | wenige Docs, ≈15.07.-Fenster |

### 4 · Nicht sicher rekonstruierbar (mehrdeutig / manuell)
**3 Fälle**:

| `vorgang_id` | Thema | Befund | Grund |
|---|---|---|---|
| `vg-krankschreibung` | Krankschreibung ab 1. Tag | **36 Docs / 20 Quellen** | starke Mehrdeutigkeit → hohes Fehlzuordnungsrisiko (welche 36?) |
| `vg-privatsieren` | Rente „privatisieren" (Partei-Kampagne) | 1 Doc (Tippfehler-Slug) | Kampagnen-Inhalt, redaktionell zu bewerten |
| `vg-riesenfehler` | „Rente mit 63" (Kommentar) | 5 Docs / 5 Quellen + `complete` existiert | mehrdeutig **und** Duplikat-Risiko |

### 5 · Fehlende Quelldokumente
**0 endgültig verloren.** Alle geprüften Themen haben noch Rohdokumente (die 1839 Seed-Zeilen vom
02./03.07. sind vorhanden). ABER: bei **3** Fällen findet der **gespeicherte `vorgang_id`-Slug**
kein Dokument (Anker-Drift) — die Docs existieren unter einem anderen Token
(z. B. `vg-kinderfreibetrag` → Docs sagen „Kindergeld", 10 Treffer). D. h. der gespeicherte
`vorgang_id` ist **nicht zuverlässig reproduzierbar**; eine Recovery würde teils eine **andere**
`vorgang_id` ableiten.

### 6 · Mögliche Duplikate
**5 Fälle** tragen bereits ein `complete`-KO zum selben Thema → eine Recovery würde **duplizieren**:
`vg-einkommensteuer`, `vg-kinderfreibetrag` (→ „kindergeld"), `vg-bundesagentur`,
`vg-riesenfehler` (→ „rente mit 63"), `vg-gesetzentwurf` (failed, → „arbeitszeit"). Zusätzlich
strukturell: `vg-forschung` == `vg-wissenschafts` (identisches Thema, zwei `vorgang_id`).

### 7 · Geschätzte KI-Aufrufe für einen späteren echten Recovery-Lauf
**≤ ~6–8 KI-Understand-Calls** (genau **1 pro empfohlenem Vorgang**; die Zahl folgt deterministisch
aus der Empfehlungsliste). Das ist **vernachlässigbar** — ein einzelner täglicher Crawl versteht
bereits 50–66 Vorgänge. Die 5 Duplikat-Risiko-Fälle und die mehrdeutigen erzeugen **0** Calls
(sie werden nicht automatisch recovert). Keine Bulk-Kosten. (Keine €-Schätzung — nur die
gemessene Call-Zahl.)

### 8 · Risiken
- **Falschzuordnung bei Mehrdeutigkeit:** `vg-krankschreibung` (36/20) und ähnliche Großthemen
  könnten die *falschen* Dokumente bündeln → inhaltlich falscher Vorgang. → nur manuell.
- **Duplikat:** ohne `complete`-Themen-Prüfung würden 5 Fälle bestehende Wissensobjekte doppeln.
  Das Skript flaggt sie (`duplikat-risiko`), aber die Prüfung ist eine **konservative Anker-
  Heuristik** (kann über-flaggen → dann manuell, nie stille Auto-Recovery).
- **`vorgang_id`-Drift:** ein echter Recovery-Lauf muss entscheiden, ob er den **alten** `vorgang_id`
  behält (dann inkonsistent zur neu abgeleiteten ID) oder die **neue** nimmt (dann verweisen evtl.
  Alt-Referenzen ins Leere). Ohne persistente Provenienz-Verknüpfung bleibt Restunschärfe.
- **Zeitfenster:** Der reguläre Cron/Admin-Recovery erreicht den 02./03.07.-Bestand **nicht**
  (Recency-Limit) — eine Recovery braucht ein **gezieltes/weites** Lesefenster (das Skript nutzt
  bewusst 120 Tage / großes Limit, rein lesend).
- **Retention:** Wird die Retention aktiviert und die Seed-Rohdokumente gelöscht, ist der Verlust
  **permanent** — daher zeitkritisch.

### 9 · Rollback-Konzept
- **Trockenlauf:** kein Rollback nötig — er schreibt **nichts**.
- **Echter Recovery (späterer, freigabepflichtiger Schritt):** jeder wiederhergestellte KO erhält
  eine **Recovery-Kennung** (z. B. `understanding_model="recovery-<datum>"` + Herkunftsvermerk),
  sodass die Menge **eindeutig identifizierbar** ist. Rollback = **gezieltes Löschen** genau dieser
  Zeilen (kleine, benannte Menge ≤ ~8) — keine Berührung bestehender `complete`-KOs. Da der
  Recovery **nur netto-neue** Themen anlegt (Duplikat-Fälle ausgeschlossen), gibt es **kein
  Überschreiben**; Rollback ist ein sauberes Delete der additiven Zeilen. Empfohlen: den echten
  Recovery ebenfalls zuerst als **Dry-Run mit `--plan`** (Vorschau der zu schreibenden Zeilen)
  fahren, dann in **einer** kleinen Transaktion, protokolliert.

### 10 · Klare Empfehlung für den echten Recovery-Lauf
**Ja, aber eng begrenzt.** Ein echter Recovery lohnt sich **nur** für die **6 netto-neuen,
eindeutig/wahrscheinlich** rekonstruierbaren Fälle (§11) — kleiner, gut umrissener Satz, ≤ ~6
KI-Calls, additiv, sauber rückrollbar. **Nicht** pauschal „alle 10/14": 5 sind Duplikate
(bereits `complete`), 3 sind mehrdeutig/redaktionell. Reihenfolge: (a) Feldnamen-Bug
`lazyUnderstanding.js:111` fixen (verhindert neue Waisen), (b) gezielten Recovery-Plan-Lauf
(read-only Vorschau) für die 6 Fälle, (c) nach Freigabe echter Lauf in einer Transaktion mit
Recovery-Kennung, (d) die 5 Duplikat- + 27 Rauschen-Fälle kontrolliert terminal aussortieren
(`failed-final`/verworfen), damit der Cron sie nicht ewig neu prüft.

### 11 · Fälle, die freigegeben werden sollten (echter Recovery)
**Eindeutig (4):** `vg-steuerstrafrecht`, `vg-umstellungen`, `vg-arbeitsvertraege`, `vg-sozialwohnungen`.
**Wahrscheinlich, mit Vorschau-Prüfung (2):** `vg-medikamenten`, `vg-psychotherapie`.
*(Optional, mit manueller Dokumentwahl: `vg-buerokratie` (failed) — wenige, klare ≈15.07.-Docs.)*

### 12 · Fälle, die verworfen oder manuell geprüft werden sollten
**Verwerfen — bereits durch `complete`-KO abgedeckt (Duplikat, 5):** `vg-einkommensteuer`,
`vg-kinderfreibetrag`, `vg-bundesagentur`, `vg-riesenfehler`, `vg-gesetzentwurf` (failed —
FT2-6-Retry würde hier **duplizieren**, nicht helfen).
**Manuell prüfen (3):** `vg-krankschreibung` (mehrdeutig, 36 Docs — redaktionelle Dokumentwahl),
`vg-privatsieren` (Partei-Kampagne), sowie das strukturelle Duplikatpaar `vg-forschung` ≡
`vg-wissenschafts`.
**Verwerfen — Rauschen (27):** der Nicht-/Regional-/Ausland-Bestand aus der Rückstand-Analyse §3.

---

## Tests (`scripts/understanding-recovery-test.js`, 26/26 grün, offline)

1. **Eindeutige Rekonstruktion** — 1 Cluster, abgeleitete == gespeicherte `vorgang_id`.
2. **Mehrdeutige Zuordnung** — zwei Dokumentgruppen → `mehrdeutig`, Empfehlung manuell.
3. **Kein passendes Dokument** — `keine-quelle`.
4. **Duplikat-Schutz** — `complete`-Thema → `duplikat-risiko`/verwerfen (+ Gegenprobe ohne complete → recovery).
5. **Idempotenz** — zwei Läufe byte-identisch; KI-Call-Schätzung deterministisch.
6. **Mandantentrennung** — tenant/user-Felder ändern weder Klassifikation noch Ausgabe; Ausgabe trägt keine tenant/user-Schlüssel.
7. **Datenschutz der Ausgabe** — kein Name/keine E-Mail/kein Geburtsjahr/kein Rohtitel im Bericht; nur Slugs/Zahlen/Klassen.
8. **Schutz vor versehentlichem Write** — (a) Modul exportiert keine Schreib-/Execute-Funktion, (b) Eingaben werden nicht mutiert (eingefroren), (c) Skript verweigert `--execute` und ruft keine Storage-Schreibfunktion auf.

Gesamte Offline-Suite: **117/117 grün** (inkl. der neuen Suite; Netz-Guard aktiv).

---

## Notwendige Production-Änderungen für den echten Recovery (freigabepflichtig, hier NICHT ausgeführt)

1. **Code-Fix** `lazyUnderstanding.js:111` (`documentCount` → `documents.length`) → Deploy.
2. **Recovery-Ausführungspfad** (schreibend): ein KO-Complete-Write mit Recovery-Kennung für die 6
   Fälle → Code + Deploy + **echte KI-Calls** (≤ ~6) + **Prod-Write**.
3. **Terminales Aussortieren** der Duplikat-/Rauschen-Fälle (`failed-final`/verworfen) → Prod-Write.
4. **Bis dahin:** keine Retention-Löschung der 02./03.07.-Rohdokumente.

---

## Nachtrag (2026-07-17): Live-Bestätigung am aktuellen Prod-Stand + vorbereitete Umsetzung

### A · Live-Bestätigung der 6 Fälle (rein lesend, kein Write/KI)
Am aktuellen Datenstand erneut über die Supabase-Leseschnittstelle geprüft (der Container hat keine
direkten Skript-Lese-Secrets, und für eine dispatchbare GitHub-Action dürfte ich nicht nach `main`
mergen — daher dieselbe read-only-Matching-Logik live). **Alle 6 weiterhin freigabetauglich:**

| exakte `vorgang_id` | Status jetzt | Seed-Docs / Quellen | complete-KO jetzt? (Dup) | Zuordnung |
|---|---|---|---|---|
| `vg-arbeitsverträge` | pending | 1 / 1 | **0** | eindeutig |
| `vg-medikamenten` | pending | 3 / 3 | **0** | wahrscheinlich (1 Cluster) |
| `vg-psychotherapie` | pending | 2 / 2 | **0** | wahrscheinlich (1 Cluster) |
| `vg-sozialwohnungen` | pending | 1 / 1 | **0** | eindeutig |
| `vg-steuerstrafrecht` | pending | 1 / 1 | **0** | eindeutig |
| `vg-umstellungen` | pending | 1 / 1 | **0** | eindeutig |

**Re-Checks bestätigt:** (1) kein Fall inzwischen `complete` — alle noch `pending`; (2) Duplikation
ausgeschlossen — `complete`-Themen-Treffer = 0 für alle 6; (3) Quelldokumente vorhanden (Seed-Docs
je Fall ≥1); (4) Zuordnung eindeutig (je 1 Dokumentgruppe). **Korrektur:** die exakte ID lautet
`vg-arbeitsverträge` (mit „ä"; `slug()` behält Umlaute) — die Allowlist verwendet die exakte Form.

### B · Vorbereiteter Code + Tests (committet, NICHT ausgeführt/deployt)
- **Feldbug-Fix** `lib/helmut/lazyUnderstanding.js`: neue Helferin `clusterDocCount(cluster)` nimmt
  `documents.length` (Fallback `documentCount`); `source_document_count` beim Vormerken ist nicht
  mehr fälschlich 0. Export + Tests.
- **Recovery-Pfad** `lib/helmut/understanding-recovery.js`: `RECOVERY_ALLOWLIST` (die 6 exakten IDs),
  `recoveryExecuteEnabled` (Flag `HELMUT_RECOVERY_EXECUTE`, **Default AUS**), `recoveryConfirmed`
  (Token `RECOVER_6_CONFIRMED`), `planRecovery` (rein; nur Allowlist + offen + eindeutig/
  wahrscheinlich + kein Duplikat), `recoverOne` (Laufzeit-Re-Checks: Idempotenz/Dedup; delegiert den
  EINZIGEN KI-/Schreibschritt an injizierte Deps).
- **Ausführungs-Skript** `scripts/understanding-recovery-execute.js`: **doppelt gesperrt** (Flag +
  Token). Ohne beides: reiner Plan-Ausdruck, kein Write/KI. **Auch mit Flag+Token schreibt es NICHTS**,
  weil der `understandAndSave`-Deps-Schritt bewusst **nicht verdrahtet** ist (das Verdrahten =
  Deploy + KI + Prod-Write = genau der freizugebende Schritt).
- **Tests** (`scripts/understanding-recovery-test.js`, jetzt **48/48**): zusätzlich Feldbug-Fix (9),
  planRecovery Allowlist/offen/fehlend (10), Duplikat/mehrdeutig/keine-Quelle-Ausschluss (11),
  Gating + `recoverOne`-Idempotenz/Write-Sperre (12), Skript-Default-Sperre (13).
- **Env-Inventar** um `HELMUT_RECOVERY_EXECUTE` ergänzt (Regressionstest grün). Gesamte Offline-Suite
  **117/117 grün**.

### C · Weiterhin offen (freigabepflichtig — Gegenstand der Freigabeanfrage)
Feldbug-Fix-**Deploy**; Verdrahten + Ausführen des Recovery-Write-/KI-Pfades für die 6 Fälle
(≤ ~6 KI-Calls, ~6 Prod-Writes); terminales Aussortieren der Duplikat-/Rauschen-Fälle; bis dahin
keine Retention-Löschung der 02./03.07.-Rohdokumente.

_Rein lesende Vorbereitung. Keine Production-Änderung. Umsetzung ausschließlich nach ausdrücklicher Freigabe._
