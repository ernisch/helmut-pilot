# OP-25 K2.1 — Globaler Abruf, kontextgebundene Vorgangsbildung

**Kanonische Dokumentation des K2.1-Schattenpfads.** Stand: **2026-07-31**.
Zustand: **im Repository umgesetzt, offline bewiesen, mutationsgesichert, in Production
NICHT aktiviert.** **PR #201**, beide Pflicht-Checks grün (Lauf `30638964148`,
`Syntax + Offline-Suiten` **194/194 Suiten**, `Browser-/Mobile-Smoke (Chromium)`).

> **Flaggrenze, verbindlich:** `HELMUT_CRON_GLOBALABRUF` ist **Default AUS**. Ohne
> ausdrücklich gesetzten Wert (`on`/`true`/`1`/`an`) läuft ausschließlich der bisherige Pfad.
> Das Flag ist **nicht** über `helmut-flags.json` setzbar — nur über die Vercel-Env, also nur
> durch den Betreiber. **Es ist heute nicht gesetzt. Der Pfad ist in Production ohne
> Wirkung.** Sind `HELMUT_CRON_GLOBALPHASE` **und** `HELMUT_CRON_GLOBALABRUF` gesetzt, läuft
> der **Altpfad** (fail closed bei Widerspruch).

Verwandte Dokumente: [`cron-globalphase.md`](cron-globalphase.md) (K1-Vertrag und der
K2-Befund §8a) · [`cron-fairness.md`](cron-fairness.md) (Rotation, `ceil(n/k)`) ·
[`env-inventar.md`](env-inventar.md) §Flags.

---

## 1 · Worum es geht, in einfachen Worten

Helmut sammelt jede Nacht dieselben politischen Quellen für alle Mandate ein — und hat das
bisher **für jedes Mandat noch einmal** getan. Das erste Mandat verbrauchte fast das ganze
Zeitfenster, der Rest kam nicht mehr dran.

**K1** hat das Einsammeln global gemacht. Dabei ist aber unbeabsichtigt auch das
**Zusammenfassen zu Vorgängen** global geworden — und **K2** hat gemessen, dass genau das
schadet: Nachrichten aus der Personensuche eines Mandats konnten den Vorgang eines anderen
Mandats verändern, zusammenschieben oder auseinanderreißen.

**K2.1 trennt beides sauber:**

- **Eingesammelt** wird weiterhin **einmal für alle** — dort liegt der Kapazitätsgewinn
  (1 162 geplante Abrufwege → 196 in der Vereinigung, gemessen in K1).
- **Zusammengefasst** wird nur noch innerhalb einer **Sichtbarkeitsgrenze**: zwei Meldungen
  dürfen nur dann locker zusammengeworfen werden, wenn **dieselben Mandate beide sehen**.

**Heute ändert sich nichts.** Der neue Weg liegt hinter einem Schalter, der ausgeschaltet
ist. Ihn einzuschalten ist eine Freigabeentscheidung des Betreibers.

---

## 2 · Phase 1 — Bestand und Grenze: jeder Schritt einzeln eingeordnet

Bestandsprüfung gegen `main` (Stand `3b72a88`). **Keine Einordnung aus K1 wurde ungeprüft
übernommen** — die Zeilen 6 und 7 widersprechen der K1-Tabelle ausdrücklich.

Kategorien: **A** sicher global · **B** global nur mit Herkunfts-/Sichtbarkeitskontext ·
**C** zwingend kontextgebunden · **D** unklar, Entscheidung erforderlich.

| # | Schritt | Kat. | Begründung (belegt) |
|---|---|---|---|
| 1 | **Quellenplan** (`getSourcesForProfile`) | **B** | Der Plan ist profilabhängig. Global bildbar **als Vereinigungsmenge**, aber nur, wenn die **Herkunft je Abrufweg** mitgeführt wird — genau das leistet `planGlobaleQuellen(...).herkunft`. Ohne Herkunft wäre die Sichtbarkeit später nicht mehr bestimmbar. |
| 2 | **Abruf** (`crawlAllSources`) | **A** | Ein HTTP-Abruf hat keinen Mandantenbezug. Geteilte Wege werden schon heute prozessweit entdoppelt (`sharedFetchLedger`). Hier liegt der gesamte Kapazitätsgewinn. |
| 3 | **Rohitems** (`saveRawItems`) | **A** | `raw_items` trägt keine `user_id`. Global entdoppelt nach Hash. |
| 4 | **Rohdokumente** (`raw_documents`) | **A** | Trägt keine `user_id`, ist minimiert (kein Volltext) und schon heute global entdoppelt. |
| 5 | **Dedup** (`dedupeRawDocuments`) | **A** | Rein inhaltsbasiert (Hash + kanonische URL), kein Mandantenbezug. |
| 6 | **Clustering** (`clusterRawDocuments`) | **C** | **Widerspruch zur K1-Tabelle, hier korrigiert.** K1 führte den Schritt unter „global". Er ist es **nicht**: eine **einzige** paarweise Kante genügt und wirkt **transitiv**. Welche Dokumente gemeinsam in einen Aufruf gehen, entscheidet damit über die Vorgangsidentität. Belegt in K2 (`globalphase-buendelung-test.js`, Befund K1-1a/b/c). |
| 7 | **Understanding** (lazy + eager) | **C** | Der Schritt selbst ist mandantenneutral (er prüft je Cluster **alle** Profile). Kontextgebunden ist seine **Eingabe**: er verarbeitet, was Schritt 6 gebündelt hat. Deshalb muss er dem Kontext folgen. |
| 8 | **Knowledge Object** (`resolveVorgang`, `understandOneCluster`) | **B** | Das Wissensobjekt selbst trägt **keinen** Mandantenbezug (nachgemessen: `vorgangskontext-test.js` 4.12). Die **Kandidatensuche** ist global und bleibt es — sie ist der Grund, warum gleiche Bundestagsvorgänge überhaupt wiederverwendet werden können. Sie arbeitet **streng** (Themenwurzel-Präfix **und** Kern-gegen-Kern) und ist deshalb nicht die Fehlerquelle von K1-1. |
| 9 | **Matching** (`runMatchingShadow`) | **C** | Projektion des globalen Korpus auf **ein** Profil. Schreibt `matching_results` mit `user_id`. |
| 10 | **Entscheidungen** (`runDecisionShadow`) | **C** | Erzeugt mandatsbezogene Empfehlungen. |
| 11 | Lauftelemetrie | **B** | Inhaltlich global; im neuen Pfad ein Datensatz `mode: "global"`, `politicianId: null` plus je Mandat ein `mode: "mandat"`. |
| 12 | Quellen-Telemetrie | **A** | Lauf-, nicht mandatsbezogen. |

**Kein Schritt bleibt in Kategorie D.** Der einzige Kandidat war Schritt 8; er ist durch die
Messung in K2 (§8a.1: das strenge Regime trennt schnell, es verbindet nicht leicht) und durch
die Gleichheitsmessung dieses Sprints (§5.1) eindeutig als **B** belegt.

---

## 3 · Phase 2 — Architekturentscheidung: welcher Kontext?

Der Auftrag verlangt ausdrücklich, **nicht** automatisch die Mandats-ID zu nehmen. Geprüft
wurden alle genannten Kandidaten:

| Kandidat | Bewertung | Ergebnis |
|---|---|---|
| **Mandat** | Korrekt, aber zu grob: geteilte Quellen (der ganze Bundestagskatalog) würden **je Mandat** dupliziert — genau die Doppelarbeit, die der Sprint vermeiden soll. | verworfen |
| **Quellenplan** | Identisch zum Mandat (der Plan *ist* mandatsdefiniert). | verworfen |
| **Herausgeber** | Zu fein und fachlich falsch: zwei Meldungen desselben Vorgangs von zwei Herausgebern gehören zusammen (Familie F2, F7). | verworfen |
| **Quellentyp** | Fachlich unsicher: „Ausschussquelle" umfasst Ausschüsse **verschiedener** Mandate (Familie F10). Trennt nicht, was zu trennen ist. | verworfen |
| **Suchpräfix** | Ist bereits das Kriterium des **strengen** Regimes. Als Bündelungsgrenze ungeeignet, weil er die Herkunft nicht kennt. | verworfen |
| **Fachliche Domäne** | Nicht verfügbar: die Domäne entsteht erst **durch** das Understanding, also **nach** der Bündelung. Zirkulär. | verworfen |
| **Sichtbarkeitsmenge** | **Gewählt.** | siehe unten |

### 3.1 Der Vertrag

```
Kontext(Dokument) = { Mandate, deren Quellenplan dieses Dokument liefert }
```

Zwei Dokumente liegen genau dann im selben Bündelungskontext, wenn ihre Sichtbarkeitsmengen
**identisch** sind. Daraus folgt die Sicherheitszusage unmittelbar:

> Werden zwei Dokumente lose gebündelt, sieht jedes Mandat, das das eine sieht, auch das
> andere. Eine **fremde** Mandatsquelle kann die Vorgangsidentität also nicht verändern —
> nicht weil es verboten wäre, sondern weil sie strukturell nie im selben Kontext liegt.

Die Sichtbarkeitsmenge ist **echt kleiner und echt besser** als die Mandats-ID:

- Quellen, die **alle** Mandate erhalten, bilden **einen** Kontext → derselbe politische
  Vorgang wird **nicht** je Mandat dupliziert.
- Mandatseigene Quellen (`<mandats-id>-news`, Partei-, Ausschusssuchen) haben die
  Sichtbarkeit `{dieses Mandat}` und bilden automatisch einen eigenen Kontext.
- Die Einteilung hängt **nicht** von der Mandatsreihenfolge ab.

### 3.2 Was global bleibt, was kontextgebunden wird

| global (einmal je Lauf) | kontextgebunden (je Sichtbarkeitsmenge) | je Mandat |
|---|---|---|
| Quellenpläne + Vereinigungsmenge | Clustering (`clusterRawDocuments`) | Matching |
| Abruf (jeder Weg höchstens einmal) | Vorgangskennung (`deriveVorgangId`) | Entscheidungen |
| DIP-Abruf (Filter je Profil, Herkunft mitgeschrieben) | Lazy-Understanding | Mandatstelemetrie |
| Rohitems + Rohdokumente + Dedup | Eager-Understanding | |
| Lauf- und Quellentelemetrie, **Datenstand versiegeln** | | |

**Das strenge Regime (`resolveVorgang`) bleibt global und unverändert.** Es ist der Grund,
warum ein amtliches Dokument und die Personensuche eines anderen Mandats weiterhin **einen**
Vorgang ergeben (Familie F1) — Abnahmekriterium 13. Der Beweis für „keine neue
Fremdbeeinflussung" ist deshalb nicht eine zusätzliche Trennung, sondern die **Gleichheit mit
dem heutigen Ergebnis** (§5.1).

### 3.3 Verhältnis zum heutigen Altpfad — ehrlich benannt

Heute ist ein Batch „alles, was der Lauf **eines** Mandats neu gefunden hat". Weil
Rohdokumente global entdoppelt werden, landen geteilte Dokumente vollständig im Batch des
**ersten** Mandats der Reihenfolge; jedes spätere sieht nur noch seine eigenen. K2.1 ist damit

- für jedes Mandat **außer dem ersten**: dieselbe Einteilung wie heute,
- für das **erste** Mandat: **strenger** (seine eigenen Quellen werden nicht mehr lose mit den
  geteilten gebündelt),
- und in keinem Fall **loser** als heute.

### 3.4 Fail closed

| Fall | Verhalten |
|---|---|
| Flag nicht gesetzt / Tippfehler / `off` | Altpfad, unverändert |
| Beide Flaggen gesetzt | **Altpfad**, laut protokolliert (`[cron/*/pfadwahl]`) |
| Dokument ohne bestimmbare Sichtbarkeit | **isoliert** in einen eigenen Kontext — nie geraten, nie einem fremden Kontext zugeschlagen |
| Partition verletzt (Dokument verloren/doppelt) | Datenstand wird **FEHLGESCHLAGEN** versiegelt, **keine** Mandatsprojektion in diesem Lauf |
| Kontextgrenze verletzt | dito |
| Globale Phase unvollständig | Datenstand `teilweise` — projizierbar, aber **nie** als `frisch` ausgewiesen |

---

## 4 · Umsetzung

| Datei | Rolle |
|---|---|
| [`lib/helmut/vorgangskontext.js`](../../lib/helmut/vorgangskontext.js) | **neu.** Rein und IO-frei: Flag, Sichtbarkeit, Signatur, Kontextplanung, Partitions- und Grenzprobe, Budgetaufteilung. |
| [`lib/helmut/cron-globalphase.js`](../../lib/helmut/cron-globalphase.js) | `waehleCronPfad()` (Pfadwahl an **einer** Stelle, fail closed) + zwei additive Felder im Datenstandsvermerk (`buendelung`, `kontexte`). |
| [`lib/helmut/scheduler.js`](../../lib/helmut/scheduler.js) | `runGlobaleErfassung` bekommt die Option `buendelung`. Ohne sie ist der K1-Pfad unverändert (eine Schleife über **einen** Stapel ist derselbe Aufruf wie vorher). DIP schreibt jetzt die Herkunft je Dokument mit. |
| [`server.js`](../../server.js) | `cronSchwererPfad` wählt zwischen `alt`, `globalphase` und `kontext`. |

**Nicht angefasst:** `runSourceCrawl`, `vorgang-identity.js`, `understanding.js`,
`crawler.js`, `cron-fairness.js`, der Quellenplan, die Landesmodulsperre, alle Zeitbudgets,
alle Cron-Zeiten, alle Kostendeckel. Keine Migration, keine Warteschlange, keine neue
Infrastruktur.

### 4.1 Zeitbudget — geteilt, nicht erhöht

Das Verstehensbudget bleibt `HELMUT_CRAWL_UNDERSTAND_BUDGET_MS` (90 000 ms) **je Lauf**, das
Lazy-Budget `HELMUT_CRAWL_LAZY_BUDGET_MS` (60 000 ms) **je Lauf**. Beide werden über die
Kontexte in **kumulative Stichtage** aufgeteilt (`verstehensScheiben`): nicht verbrauchte Zeit
eines früheren Kontexts fällt dem nächsten zu, die Summe bleibt hart gedeckelt. Die Zahl der
KI-Aufrufe je Lauf ist damit exakt so begrenzt wie heute.

**Der ehrliche Preis:** je Kontext ein zusätzlicher Sperr-Roundtrip
(`runUnderstandingShadow` erwirbt seine globale Sperre je Aufruf). Gemessen: 15 Kontexte bei
elf Mandaten → rund 3 s, **3,3 %** des Verstehensbudgets. Das ist keine längere Laufzeit,
sondern etwas weniger im selben Fenster verstandene Cluster; der Rest holt der dedizierte
Understanding-Cron (05:30 / 21:30 UTC, unverändert).

---

## 5 · Fachlicher Nachweis

Kanonisch: [`scripts/vorgangskontext-test.js`](../../scripts/vorgangskontext-test.js)
(**102/102**) und
[`scripts/vorgangskontext-mutationsprobe.js`](../../scripts/vorgangskontext-mutationsprobe.js)
(**18/18 rot**). Die Fallfamilien stammen aus der K2-Analyse und werden über
[`scripts/vorgangskontext-geruest.js`](../../scripts/vorgangskontext-geruest.js) geteilt —
dieselben Fälle, derselbe Produktionscode, nur ein Pfad mehr.

### 5.1 Das zentrale Ergebnis

**In allen sechzehn Fallfamilien liefert der K2.1-Pfad exakt dieselbe Vorgangsgruppierung wie
der heutige Altpfad** — auch in den **acht** Familien, in denen der K1-Pfad eine andere
liefert (F4, F7, F9, F11, F12, F13, Z1, Z3).

| Abnahmekriterium | Beleg | Ergebnis |
|---|---|---|
| 1 · verschiedene Vorgänge verschmelzen nicht durch fremde Mandatsquellen | 4.1 | K1 verschmilzt 6 Trennfamilien, **K2.1 keine** |
| 2 · zusammengehörige Vorgänge bleiben zusammen | 4.2 | keine Familie wird gegenüber heute zerrissen |
| 3 · Ketten laufen nicht über die Kontextgrenze | 4.3 (F12) | K2.1 zwei Vorgänge, K1 einer |
| 4 · Quellen- und Mandatsreihenfolge | 4.4a–c | Dokumentreihenfolge **nie** wirksam; Mandatsreihenfolge wirkt in **genau denselben** Familien wie heute (F3, F7, F13 — Bestandsbefund des strengen Regimes); die **Kontexteinteilung** ist immer reihenfolgeunabhängig |
| 5 · kein Dokument geht verloren | 4.5, 2.3, 2.7 | 0 verloren, auch bei feindlichen Eingaben |
| 6 · jedes Dokument eindeutig nachvollziehbar | 4.6 | genau eine Verknüpfung je Dokument |
| 7 · keine unkontrollierte KO-Vervielfachung | 4.7, 4.8 | Summe identisch zum heutigen Pfad, in keiner Familie mehr |
| 8 · Matching bleibt korrekt | 4.9 | identische Wissensobjekte und Verknüpfungen |
| 9 · Entscheidungen bleiben korrekt | 4.10 | dieselbe Grundlage |
| 10 · keine Digest-Cluster in Lage/Briefing | 4.11 | größte Gruppe nie größer als heute |
| 11 · Mandantentrennung vollständig | 4.12 | kein Wissensobjekt trägt Mandantenbezug |
| 12 · Personen-, Partei-, Ausschuss-, allgemeine Quellen | 4.14 | alle vier Klassen wie heute |
| 13 · Bundestagsvorgänge bleiben wiederverwendbar | 4.15 (F1) | amtliches Dokument + fremde Personenquelle → **ein** Vorgang, über das unveränderte strenge Regime |

### 5.2 Adversariale Proben (Abschnitt 5 der Suite)

Formularvokabular als falscher Beweis (F9, F11) · transitive Ketten (F12) · sehr ähnliche
Titel (F4) · gleicher Drucksachentyp mit anderer Nummer (Z3) · unterschiedliche Vorgänge
derselben Partei (F11) · Personenquelle gegen fremde Ausschussquelle (Z2) ·
Reihenfolgeänderungen · unvollständige Datenstände (ein Kontext fällt aus, der Rest wird
nachgeholt → gleiches Ergebnis) · Wiederholung über mehrere Läufe (idempotent) · feindliche
Eingaben · zusätzliches Mandat verändert bestehende Kontexte nicht.

### 5.3 Was K2.1 **nicht** leistet — ausdrücklich

- Es **verbessert** die Vorgangsbildung nicht. Es erhält den heutigen Stand **einschließlich
  seiner bekannten Schwächen**: F10 (zwei verschiedene Ausschüsse, gleiches Formular) und Z2
  verschmelzen in **beiden** Pfaden fälschlich. Ursache ist das Formularvokabular im strengen
  Regime — Bestandsbefund aus K2 §8a.2, Option **M2** dort, ausdrücklich **nicht** Gegenstand
  dieses Sprints (sie wirkt sofort und ohne Flag auf die aktive Vorgangsbildung und ist
  freigabepflichtig).
- Es verzichtet auf die **eine** Verbesserung, die K1 gebracht hätte (F7: zwei Parteiquellen
  zur selben Debatte werden global korrekt zusammengeführt). Das ist der bewusst gezahlte
  Preis für „nie loser als heute".
- Es misst **keine** Production-Häufigkeit. Die Fälle sind konstruiert.

---

## 6 · Kapazität

Gemessen mit der deterministischen Laufzeitsimulation aus
[`scripts/cron-globalphase-test.js`](../../scripts/cron-globalphase-test.js) Abschnitt 8a3 —
**alle drei Pfade gegen denselben Produktionscode und dieselben Kostenannahmen**
(Production-kalibriertes Kostenmodell, 270-s-Fenster, gezählt wird, was **wirklich** im
Fenster fertig wurde).

| n | Altpfad | K1 | K2.1 | Kontexte |
|---|---|---|---|---|
| 1 | 1/1 · 148 650 ms | 1/1 · 148 800 ms | 1/1 · 148 800 ms | 1 |
| 2 | 2/2 · 215 320 ms | 2/2 · 186 470 ms | 2/2 · **180 470 ms** | 3 |
| 6 | **2/6** · 307 585 ms (**+37 585 ms Überziehung**) | 6/6 · 205 145 ms | **6/6** · 205 145 ms | 10 |
| 11 | **2/11** · 300 785 ms (**+30 785 ms**) | 11/11 · 245 885 ms | **11/11** · 245 885 ms | 15 |

**Grenzkosten je zusätzlichem Mandat** (ohne Zeitdruck gemessen, damit vollständige Läufe
verglichen werden): **alt 66 670 ms · K1 7 110 ms · K2.1 7 110 ms**.

**Ehrlich dazu:**

- Bei **einem** Mandat gibt es nichts zu entdoppeln — K2.1 ist dort **150 ms langsamer** als
  der Altpfad (zusätzliche globale Lauftelemetrie). Der Gewinn beginnt bei zwei Mandaten.
- Das Kostenmodell der Simulation rechnet je Dokument und je Cluster, **nicht** je
  Understanding-Aufruf. Der Sperr-Roundtrip je Kontext ist in der Tabelle **nicht** enthalten;
  er ist getrennt abgeschätzt (§4.1: ~3 s, 3,3 % des Verstehensbudgets bei elf Mandaten).
- **Abrufwege:** unverändert gegenüber K1, weil K2.1 die Vereinigungsmenge nicht anfasst —
  **1 162 → 196** bei acht Profilen (K1-Messung gegen das echte relationale Seed-Modell).
- **KI-Aufrufe:** durch dasselbe Verstehensbudget je Lauf gedeckelt wie heute; in den
  Fallfamilien erzeugt K2.1 in keiner Familie mehr Wissensobjekte als der heutige Pfad.
- **Verbleibende Doppelarbeit:** die mandatseigenen Kontexte werden einzeln geclustert und
  verstanden (15 Kontexte bei elf Mandaten). Abruf und geteilter Korpus laufen genau einmal.
  Das ist gewollt: es ist exakt die Doppelarbeit, die heute schon anfällt, und der Preis für
  die Sicherheitsgrenze.
- **Modellrechnung** (Eingangswerte, keine Messung, `vorgangskontext-test.js` §7): bei elf
  Mandaten und einer globalen Phase von 240 s bleibt **eines** je Lauf übrig
  (`ceil(11/10) = 2` Läufe) — dieselbe ehrliche Grenze wie bei K1.

---

## 7 · Aktivierungsvoraussetzungen und Rückbaupfad

### 7.1 Voraussetzungen für eine Aktivierung (alle offen)

1. Merge des PR (= Production-Deployment) durch den Betreiber.
2. `HELMUT_CRON_GLOBALABRUF=on` **in der Vercel-Env** setzen — nicht in `helmut-flags.json`
   (dort wirkt es nicht) und nicht im Repo.
3. Sicherstellen, dass `HELMUT_CRON_GLOBALPHASE` **nicht** gesetzt ist (sonst greift die
   Widerspruchsregel und es läuft der Altpfad).
4. Rein lesender Production-Nachweis über mindestens 24 h: `mode: "global"`-Laufdatensatz
   vorhanden, `datenstand.status = abgeschlossen`, je Mandat ein `mode: "mandat"`-Datensatz,
   `kontexte` plausibel (≈ 1 + Zahl der Mandate), keine `kontextvertrag`-Fehler.
5. Bewertung, ob die verbleibenden Bestandsbefunde (F10/Z2, Formularvokabular) einen eigenen
   Sprint auslösen sollen.

### 7.2 Rückbaupfad

| Stufe | Maßnahme | Wirkung |
|---|---|---|
| 1 | `HELMUT_CRON_GLOBALABRUF` auf `off` setzen oder löschen, Redeploy | sofort zurück auf den Altpfad, **ohne Codeänderung** |
| 2 | Revert des PR | entfernt den Pfad vollständig; `main` ist ohne ihn lauffähig, weil der Altpfad nie verändert wurde |
| 3 | nach erfolgreichem Nachweis | der K1-Pfad (`HELMUT_CRON_GLOBALPHASE` + `buendelung: "global"`) kann entfernt werden — er ist durch K2 als nicht aktivierungsfähig belegt und nur noch Vergleichsmaßstab. Das ist ein eigener, kleiner Aufräumsprint. |

**Es gibt keinen Datenrückbau:** K2.1 schreibt keine neuen Tabellen, keine neuen Spalten und
keine Migration. Alles, was entsteht, sind dieselben `raw_documents`, Wissensobjekte und
Telemetriezeilen wie heute.

---

## 8 · Verbleibende Risiken

| # | Risiko | Bewertung |
|---|---|---|
| R1 | **Kein Production-Nachweis.** Alle Aussagen sind offline erhoben. | Der Sprintauftrag verbietet die Aktivierung. Der Nachweis ist der nächste Schritt, nicht ein Versäumnis. |
| R2 | **Die Fallfamilien sind konstruiert.** Wie oft die Muster real auftreten, ist unbekannt. | Bewusst so (Auftrag Phase 4). Die Gleichheit mit dem heutigen Pfad gilt unabhängig von der Häufigkeit. |
| R3 | **Bestandsbefund F10/Z2** — Formularvokabular verschmilzt auch heute falsch. | Nicht durch K2.1 verursacht und nicht durch K2.1 verschlimmert. Eigener Sprint, freigabepflichtig. |
| R4 | **Reihenfolgeempfindlichkeit** des strengen Regimes (F3, F7, F13). | Bestand, unverändert. K2.1 ist nicht empfindlicher als heute (4.4b). |
| R5 | **Kontextzahl** wächst mit der Mandatszahl (gemessen 15 bei elf Mandaten). | Jeder Kontext kostet einen Sperr-Roundtrip. Bei sehr vielen Mandaten wäre ein Sammelaufruf sinnvoll — das wäre K3 und ist heute nicht nötig. |
| R6 | **Kapazitätsgrenze bei elf Mandaten** — eines bleibt je Lauf übrig. | Identisch zu K1, dokumentiert, durch die Fairnessrotation abgefangen (`ceil(11/10) = 2`). |
| R7 | **Zwei Schattenpfade gleichzeitig im Code.** | Durch die Widerspruchsregel (beide Flaggen → Altpfad) und den Rückbaupfad §7.2 Stufe 3 begrenzt. |

---

## 9 · Production-Auswirkung dieses Sprints

**Keine.** Kein Flag gesetzt, keine Env geändert, kein Cron gestartet, keine Production-Daten
geschrieben, keine Migration ausgeführt, keine Cron-Zeit und kein Budget geändert, keine
Quelle aktiviert oder deaktiviert, Berlin/Brandenburg/M8/Testmandate unverändert AUS,
**0 KI-Aufrufe, 0,00 USD**.
