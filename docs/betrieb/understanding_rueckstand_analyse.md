# Understanding-Rückstand — vollständige, rein lesende Analyse

> **Hinweis 2026-07-17:** Freigabe-Nummern folgen jetzt dem eindeutigen Thread-2-Schema **FT2-x** (früher „Fx“); Mapping und verbindlicher Reststand: `docs/datenmotor-restliste.md`.

**Auftrag:** Klären, ob die offenen Understanding-Fälle irrelevantes Rauschen sind oder ob
politisch relevante Inhalte verloren gehen. **Arbeitsweise:** ausschließlich lesend — keine
Production-Daten geändert, kein Deploy, keine Migration, keine Env-Änderung, FT2-6/FT2-7 nicht
aktiviert, keine KI-Aufrufe. Keine personenbezogenen Rohtexte/Volltexte übernommen (nur
öffentliche Themenlabels + `vorgang_id`-Slugs). Stand 2026-07-17.

Methode: DB-Forensik (Supabase `ddckuvvpcytqbyfmbvie`, nur SELECT) + Code-Forensik
(`lib/helmut/**`, `server.js`, mit file:line-Belegen), gegengeprüft durch eine adversariale
Datenverlust-Prüfung.

---

## 0 · Kernurteil (ehrlich, keine Schönfärberei)

- **Kein laufender Datenverlust.** Der heutige Ingest-Pfad ist lückenlos: **alle 4230
  `raw_documents` seit 2026-07-04 sind verarbeitet** (`finding_count>0`, **0** unverarbeitet),
  `complete`-KOs wachsen täglich bis heute (07-15=48, 07-16=40, 07-17 läuft).
- **Der Rückstand ist ein eingefrorener Alt-Bestand:** 50 `pending` vom **02./03.07.**
  (`max(created_at)=2026-07-03`, seit 14 Tagen kein Zuwachs trotz täglicher Crawls) + 2 `failed`
  vom 15.07.
- **Es ist NICHT nur Rauschen.** ~**8 Fälle sind kernmandatsrelevant und blockiert**
  (Rente/GKV/Steuer/Arbeitsrecht) und wurden **nicht** wegen Irrelevanz übersprungen, sondern
  durch einen technischen Mechanismus (`skipped-no-cluster`), obwohl die Quellinhalte real
  existieren.
- **Datenverlust = TEILWEISE und (noch) reversibel:** Die Seed-Rohdokumente vom 02./03.07.
  **existieren noch** (1839 Zeilen in `raw_documents`, innerhalb Retention). Sie sind aber über
  die **bestehenden** Pfade nicht erreichbar (Fenster zu klein). Ohne gezielte Recovery bleiben
  diese Vorgänge **dauerhaft `pending`** = werden nie an ein Profil ausgeliefert; bei späterer
  Retention-Löschung würde der Verlust **permanent**.
- **FT2-6 löst den Rückstand NICHT** (nur die 2 `failed`). **FT2-7 ist wirkungslos** dafür.

---

## 1 · Datenlage (52 Fälle, gemessen, PII-minimiert)

| Merkmal | Wert |
|---|---|
| `pending` | 50 (alle `created_at` 2026-07-02/03) |
| `failed` | 2 (beide 2026-07-15) |
| `source_document_count = 0` | 50/52 (2 `pending` tragen `docs=1`) |
| `policy_field` | bei allen `[]` (leer) |
| `political_level` / `event_type` / `embedding` / `best_source_url` | bei allen leer/NULL |
| Rückstand-Wachstum seit 07-03 | **0** (eingefroren) |
| `raw_documents` 07-02/03 noch vorhanden | **1839** (oldest_raw = 2026-07-02) |
| `raw_documents` seit 07-04 unverarbeitet (`finding_count=0`) | **0** von 4230 |
| `raw_documents.cluster_id` | durchgängig **NULL** (0/6069 — Spalte ungenutzt) |

---

## 2 · Technische Ursache (mit Code-Belegen)

### 2.1 · Was „skipped-no-cluster" wirklich bedeutet
Ausgelöst in **`lib/helmut/understanding.js:788-790`** (`runPendingUnderstandingShadow`):
```
const cluster = byVorgang.get(ko.vorgang_id);           // 787
if (!cluster || !(cluster.documents || []).length) {    // 788  <-- Auslöser
  results.push({ vorgangId: ko.vorgang_id, status: "skipped-no-cluster" }); // 790
```
- Ein „Cluster" ist eine **KI-freie, lexikalische Anker-Token-Gruppierung** von `raw_documents`
  (`understanding.js:71-85`), Schlüssel = zur Laufzeit **neu abgeleitete** `vorgang_id`-Slug
  (`deriveVorgangId`, `understanding.js:95-115`). **Kein** persistenter `cluster_id`, **kein**
  `content_fingerprint`, **keine** Nutzung der Provenienztabelle `ko_document_links`.
- Die Bedingung liest `source_document_count` **nicht**. Sie feuert, wenn im aktuellen
  Rohdok-Fenster **kein** Cluster mit passender neu-abgeleiteter `vorgang_id` (und ≥1 Dokument)
  reproduziert wird.

**Zwei völlig verschiedene Fälle werden unter EINEM Label vermengt** (vom Code selbst
eingeräumt, `server.js:1548` „skipped-no-cluster deckt beides"):
1. **Echt verwaist** (keine Quelldokumente) — korrektes Aussortieren.
2. **Nur außerhalb des Fensters / anders geclustert** — Quelldokumente existieren, werden aber
   nicht gefunden. **Das ist der eigentliche Rückstand.**

### 2.2 · Warum die Seed-Fälle unerreichbar sind (der Kern-Mechanismus)
Der Cron liest `listRecentRawDocuments(500)` (`server.js:1019`), begrenzt auf **30 Tage / 500
Zeilen** (`storage.js:1771-1777`, `ORDER BY created_at DESC`). Bei ~405 neuen Rohdokumenten/Tag
deckt das **500-Zeilen-Limit nur ~1,3 Tage** ab. Die 1839 Seed-Dokumente vom 02./03.07. sind die
**ältesten** von 6069 → sie liegen weit außerhalb der jüngsten 500 Zeilen und werden bei **jedem**
Lauf übersprungen. Der Code kennt das Problem: `server.js:1511-1513` („Ein zu enges Fenster führt
sonst zu 'skipped-no-cluster'") und der Admin-Recovery-Pfad weitet bewusst auf **2000 Zeilen / 90
Tage** (`server.js:1514`) — was aber ~5 Tage zurückreicht, also **immer noch nicht** bis zum
02./03.07. Sekundär verstärkt die **Clustering-Drift** (anderer Slug bei Neuableitung,
`understanding.js:95-114`; dokumentierter Risiko: `docs/quellenarchitektur/00-ist-architektur-und-abweichungen.md:201`).

### 2.3 · Zusätzlicher aktiver Feldnamen-Bug (getrennt bewerten)
`lib/helmut/lazyUnderstanding.js:111` schreibt
`source_document_count: (input.cluster && input.cluster.documentCount) || 0`, aber
`clusterRawDocuments` (`understanding.js:84`) liefert `{ documents, anchors }` — es gibt **kein**
`documentCount`. Ergebnis: `source_document_count` ist **immer 0**, selbst wenn der Cluster
Dokumente hat. **Wichtig:** Dieser Bug ist **nicht** die Ursache des Skips (das Gate liest den
Zähler nicht) — er macht nur den **Diagnosewert** falsch. Aktiv nur, wenn
`HELMUT_V3_LAZY_UNDERSTANDING` an ist (Default AUS, `storage.js:1524-1525`); da der Rückstand seit
07-03 eingefroren ist, ist der Stub-Erzeugungspfad derzeit inaktiv → Bug momentan **dormant**,
aber vor Reaktivierung dieses Pfades zu fixen.

### 2.4 · Status-Modell & fehlender Reparaturpfad
- `understanding_status`: `pending → complete` (Erfolg, `understanding.js:634/649`) bzw.
  `pending → failed` (KI-/Validierungsfehler, `markUnderstandingFailed`, `storage.js:1806-1817`;
  `status` bleibt `pending`, wird nie ausgeliefert). Waisen-Stubs entstehen über
  `savePendingKnowledgeObject` (`storage.js:1737`), das **nie** `ko_document_links` anlegt.
- **Kein Produktionspfad repariert verwaiste `pending`-Stubs** (löscht/verknüpft/markiert sie neu).
  `diagnosePendingUnderstanding` (`understanding.js:854-961`) klassifiziert sie nur lesend
  (`verwaist`, `mapping-fehlt`, jeweils „kein Auto-Fix").

---

## 3 · Kategorisierung aller 52 Fälle

**Cross-cutting (technisch, gilt für ALLE 52):** *Kategorie 5 (Datenqualität unzureichend:
`source_document_count=0` durch Feldbug + `policy_field` leer)* **und** *Kategorie 7 (veraltet:
Legacy 02./03.07.)*. Die folgende Primär-Zuordnung nach **Entscheidungsrelevanz** ist darüber
gelegt, weil sie die eigentliche Frage (Rauschen vs. relevanter Verlust) beantwortet.

| Kategorie | Anzahl | Fälle (`vorgang_id`, Thema) |
|---|---:|---|
| **1 · politisch relevant und blockiert** | **8** | `vg-medikamenten` (GKV-Zuzahlung), `vg-krankschreibung` (Arbeit/Gesundheit, docs=1), `vg-arbeitsvertraege` (Arbeitsrecht), `vg-einkommensteuer` (Steuer), `vg-kinderfreibetrag` (Familie/Steuer), `vg-steuerstrafrecht` (Steuer), `vg-bundesagentur` (Arbeitsverwaltung), `vg-umstellungen` (Arbeitsschutz TRBA 500) |
| **2 · möglicherweise relevant, manuell prüfen** | **14** | Rente (Position/Kampagne/Kommentar): `vg-privatsieren`, `vg-versicherten`, `vg-riesenfehler`, `vg-0fab030265ec2c2d9d1dcaf2`; GKV/Arbeit borderline: `vg-psychotherapie`, `vg-fachkraeftepotenzial`, `vg-sozialwohnungen`, `vg-mietregulierung`; Bundesthemen außerhalb Kernmandat: `vg-wissenschafts`, `vg-justizminister`, `vg-justizvertreter`, `vg-bahnprojekte`, `vg-einreise`, `vg-direktbeschluss` |
| **3 · irrelevantes Rauschen** | **27** | Nicht-politisch/Kommentar (11): `vg-achtelfinale` (Sport), `vg-seniorenresidenz` (Immo-PR), `vg-pflegefachkraft` (Stellenanzeige), `vg-volkspartei` (AT-Website), `vg-0fb6ee…` (TV-Listing), `vg-problemfall`, `vg-autosuggestion`, `vg-eingespart`, `vg-rassistische`, `vg-attackiert`, `vg-buerokratischen` · Regional/lokal (8): `vg-wochenvorschau`, `vg-dringend`, `vg-demonstranten`, `vg-mobilitaetsknoten`, `vg-parkplaetzen`, `vg-kundgebung`, `vg-minderheitenpartei`, `vg-agrarreform` · Ausland/EU (8): `vg-dauerkrise`, `vg-gerettet`, `vg-zwangsadoptionen`, `vg-produzieren`, `vg-aargauer`, `vg-ausnahmezustand`, `vg-verbrenner`, `vg-b2e2e8…` |
| **4 · technischer Fehler** | **2** | `vg-gesetzentwurf` (Arbeitszeit-Gesetzentwurf), `vg-buerokratie` (Gesundheit/Digital) — beide `understanding_status=failed`, mandatsrelevant, FT2-6-adressierbar |
| **6 · Duplikat** | **1** | `vg-forschung` (= `vg-wissenschafts`, „Wissenschaftsfreiheitsgesetz Bundesrat") |
| *5 · Datenqualität unzureichend* | *(52, cross-cutting)* | technischer Zustand aller Fälle (siehe oben), nicht als Primärkategorie gezählt |
| *7 · veraltet* | *(52, cross-cutting)* | Legacy 02./03.07., nicht als Primärkategorie gezählt |

**Kritisch (echter Handlungsbedarf): die 8 aus Kategorie 1 + die 2 aus Kategorie 4 = 10 Fälle.**
Kategorie 2 (14) ist Ermessenssache (manuell). Kategorie 3 (27) darf dauerhaft verworfen werden.

---

## 4 · FT2-6-Analyse & Empfehlung

`recoverFailedUnderstanding` (`lib/helmut/ko-recovery.js`) verarbeitet **ausschließlich**
`understanding_status='failed'` (`listFailedKnowledgeObjects`, `storage.js:1841`), **nicht**
`pending`.
- **Auf die 2 `failed`-Fälle (mandatsrelevant): FT2-6 hilft.** Reset `failed→pending` und Verstehen
  im selben Cron-Lauf kann `complete` erreichen — sofern deren Cluster/Dokumente im Fenster liegen.
- **Auf die 50 `pending`-Waisen: FT2-6 hilft NICHT.** Sie sind nie `failed`, tauchen also nie in FT2-6
  auf; würde man sie künstlich auf `failed` setzen, liefe der unmittelbar folgende
  `runPendingUnderstandingShadow` erneut in `skipped-no-cluster` (Dokumente weiter außerhalb des
  Fensters) — FT2-6 verbrennt nur den Retry-Zähler bis `failed-final`, ohne je zu verstehen.
- **Empfehlung:** **FT2-6 darf freigegeben werden** — es ist sicher, begrenzt (Default 2 Retries,
  terminal `failed-final`) und räumt die 2 echten Fehlschläge. **Aber FT2-6 ist NICHT die Lösung des
  Rückstands** und **sollte NICHT auf `pending-no-cluster` ausgeweitet werden** (kontraproduktiv:
  nutzloses Nachverstehen ohne erreichbare Quellen). FT2-6-Freigabe bleibt eine eigenständige
  Entscheidung nach einem sauberen Beweistag, nicht ein Fix für diesen Rückstand.

## 5 · FT2-7-Analyse & Empfehlung

`HELMUT_UNDERSTANDING_PRIORITY` (FT2-7) sortiert nur die **ohnehin verarbeitbaren**, dokument-tragenden
Cluster um (`understanding-priority.js:96-105`) und wirkt nur im **eager**-Pfad
(`understanding.js:732`), nicht im `pending`-Cron-Pfad. **Auf dokumentlose Waisen: null Wirkung.**
**Empfehlung:** FT2-7 nach eigener Kostenlogik entscheiden — **für diesen Rückstand irrelevant**.

---

## 6 · Datenverlust-Bewertung (reversibel/irreversibel)

- **Reversibel-Status heute:** Die Seed-Rohdokumente (1839 vom 02./03.07.) **existieren** noch
  (innerhalb Retention, ~15 Tage alt) → technisch rückholbar.
- **Aber nicht über bestehende Pfade:** weder der Cron (500 Zeilen) noch die Admin-Recovery (2000
  Zeilen) reichen bis 07-02/03 zurück (die Seeds sind die ältesten ~1839 von 6069). Eine Recovery
  bräuchte ein **gezieltes, inhalts-/anker-basiertes** Nachladen oder ein **deutlich weiteres
  Fenster** (~6000 Zeilen) — beides nicht im aktuellen Code.
- **Wird permanent, wenn ignoriert:** Sobald die Retention (nach Fristfreigabe,
  `HELMUT_RETENTION_EXECUTE`) die 02./03.07.-Rohdokumente löscht, sind die ~10 kritischen
  Mandats-Ereignisse endgültig verloren.
- **Urteil:** **Teilweiser, aktuell reversibler Verlust** konkreter mandatszentraler Quell-Ereignisse
  (spezifische Positionen/Reformentwürfe, die ein späterer generischer Artikel nicht 1:1 ersetzt).
  Schaden real, aber **begrenzt (~10 Fälle) und zeitlich befristet reversibel**.

---

## 7 · Sichere Korrektur (vorbereitet, OHNE Production-Änderung)

Keiner der Schritte wurde ausgeführt (alle brauchen Deploy oder Prod-Write → freigabepflichtig):

1. **Feldnamen-Bug fixen** (`lazyUnderstanding.js:111`: `input.cluster.documentCount` →
   `(input.cluster.documents || []).length`). Klein, risikoarm; korrigiert den Diagnosewert.
   *Fixt den Skip nicht* (Gate liest den Zähler nicht), aber Pflicht vor Reaktivierung des
   V3-Lazy-Pfades. → Code-Änderung, Deploy nötig.
2. **Gezielte Recovery der 10 kritischen Fälle** (Kat. 1 + 4): ein **read-only-Trockenlauf**-Werkzeug,
   das je `vorgang_id` die passenden Seed-Rohdokumente **inhalts-/anker-basiert** (nicht recency-
   begrenzt) sucht und die Rekonstruierbarkeit prüft; echter Complete-Lauf erst nach Freigabe
   (verursacht KI-Calls + Prod-Write). → freigabepflichtig.
3. **Terminales Aussortieren der 27 Rauschen-Fälle** (Kat. 3): kontrolliert auf `failed-final`/
   verworfen setzen, damit der Cron sie nicht ewig neu prüft. → Prod-Write, freigabepflichtig.
4. **Fenster-Härtung** gegen künftige Waisen: Pending-Completion nicht rein recency-begrenzt,
   sondern `pending`-Vorgänge gezielt nachladen; Match robuster als reine Slug-Gleichheit
   (persistenter Link statt Neuableitung). → Code-Änderung.

## 8 · Notwendige Tests (vor jeder Umsetzung)

- **Feldbug:** Unit-Test — `provisionalKnowledgeObject` schreibt `source_document_count =
  cluster.documents.length` (nicht 0) bei ≥1 Dokument.
- **FT2-6-Abgrenzung (Regression):** `recoverFailedUnderstanding` fasst **nur** `failed` an, **nie**
  `pending` (Fixture mit gemischten Status → pending unberührt).
- **Gezielte Recovery (offline):** Fixture mit einem `pending`-Waisen + vorhandenen Seed-Docs →
  Werkzeug findet die Docs anker-basiert und meldet „rekonstruierbar", ohne Prod-Write.
- **Terminal-Aussortieren:** Idempotenz (2. Lauf 0), referenzielle Integrität (keine verwaisten
  Links), keine Berührung von `complete`/`pending`-nicht-Ziel-Fällen.
- Bestehende Offline-Suite grün halten.

## 9 · Restrisiko für den Bundestagspiloten

- **Laufender Betrieb: gering.** Der Live-Pfad verarbeitet lückenlos; die tägliche Lage/Briefing
  für den Pilotmandanten stützt sich auf die wachsenden `complete`-KOs, nicht auf den eingefrorenen Alt-Bestand.
- **Historische Lücke: real, mittel-niedrig.** ~10 mandatszentrale Ereignisse vom 02./03.07.
  (Rente/GKV/Steuer/Arbeitsrecht) erscheinen **nicht** in der Vorgangsbasis und würden ohne
  gezielte Recovery nie ausgeliefert. Für einen Piloten, der **Vollständigkeit** demonstrieren
  soll, ist das eine benennbare Lücke der ersten zwei Tage — kein Einsturz, aber auch nicht „alles
  erfasst".
- **Eskalation zu permanent:** nur, falls die 02./03.07.-Rohdokumente vor einer Recovery per
  Retention gelöscht werden.

---

## 10 · Belegzitate (Auswahl)

`understanding.js:788-790` (Skip-Auslöser) · `understanding.js:71-85,95-115` (Cluster/Slug) ·
`server.js:1019`, `storage.js:1771-1777` (500 Zeilen/30 Tage) · `server.js:1511-1514,1548`
(bekanntes Fenster-Problem + Admin-Recovery 2000/90) · `lazyUnderstanding.js:111` vs.
`understanding.js:84` (Feldbug) · `storage.js:1737-1757` (Stub-Erzeugung ohne Links) ·
`ko-recovery.js:39`, `storage.js:1841` (FT2-6 nur `failed`) · `understanding.js:732`,
`understanding-priority.js:96` (FT2-7 nur eager) · `understanding.js:854-961` (Diagnose, kein Auto-Fix).
DB: `raw_documents` 07-02/03 = 1839 vorhanden; 4230/4230 seit 07-04 verarbeitet; `pending`
eingefroren `max(created_at)=2026-07-03`.

_Rein lesende Analyse. Keine Production-Daten geändert, kein Deploy/Migration/Env/Flag. Umsetzung
der Korrekturen §7 ausschließlich nach ausdrücklicher Freigabe._
