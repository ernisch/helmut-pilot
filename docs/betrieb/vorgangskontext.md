# OP-25 K2.1 — Globaler Abruf, kontextgebundene Vorgangsbildung

**Kanonische Dokumentation des K2.1-Schattenpfads.** Stand: **2026-07-31**.
Zustand: **PR #201 ist gemergt und in Production deployt (`dpl_BkhKkPSAMEoYPzFbSQqUebkTSGzz`,
`READY` 14:45:11 UTC); der Pfad ist in Production NICHT aktiviert.** Beide Pflicht-Checks grün
(am gemergten Kopf `7b0a3e2` Lauf `30639121215`, auf `main` für `255df013` Lauf `30639915579`;
`Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`).

> **Aktivierungsfreigabe (K2.2): → [§10](#10--k22--aktivierungsfreigabe-stand-2026-07-31-151x-utc-rein-lesend).**
> Ergebnis **BLOCKIERT** — technisch vorbereitet, aber es fehlen die regulären Läufe für R-6,
> 25B und 29B, und der Flagzustand der Vercel-Env ist aus einer Cloud-Sitzung nicht lesbar.

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

---

## 10 · K2.2 — Aktivierungsfreigabe (Stand 2026-07-31, 15:1x UTC, rein lesend)

**Auftrag:** belastbare GO-/NO-GO-Entscheidung für `HELMUT_CRON_GLOBALABRUF` in Production.
Keine Aktivierung, keine Env-Änderung, kein Redeploy, kein manueller Cron, keine
Production-Schreibzugriffe, keine Migration.

**Ergebnis in einem Satz: BLOCKIERT.** Technisch und betrieblich ist die Aktivierung
vorbereitet — das aktuelle Production-Deployment ist `READY`, enthält PR #201, zeigt keine
neue Regression, und der Rückweg ist eindeutig und ohne Datenrückbau. **Blockierend ist die
Reihenfolge:** das Deployment hat **noch keinen einzigen regulären Cron-Lauf** ausgeführt, und
die drei offenen Production-Nachweise (**R-6**, **25B**, **29B**) hängen alle genau an solchen
Läufen. Eine Aktivierung *jetzt* würde den ersten regulären Lauf dieses Deployments zugleich
zum ersten Lauf des neuen Pfades machen — die Wirkungen wären nicht mehr trennbar, und für
**R-6 wäre der geforderte Nachweis strukturell nicht mehr erreichbar** (§10.3).

### 10.1 · Repository und Deployment (Phase 1)

| # | Prüfung | Befund |
|---|---|---|
| 1 | Arbeitsbaum sauber | ✅ `git status --porcelain` leer |
| 2 | HEAD = `origin/main` | ✅ beide `255df01337f82d54765b773b7b5354dd04dee725`, `rev-list --left-right --count` = `0 0` |
| 3 | PR #201 in `main` | ✅ gemergt 2026-07-31 **14:44:53 UTC** durch `ernisch`, Basis `3b72a88`, Kopf `7b0a3e2`, 17 Dateien, +4023/−47 |
| 4 | K2.1-Dateien und Tests vorhanden | ✅ alle 11 geprüften Pfade vorhanden (`vorgangskontext.js`, `cron-globalphase.js`, 4 Suiten, 3 Mutationsproben, 2 Betriebsdokumente) |
| 5 | Keine späteren Änderungen an Flag-/Pfadlogik | ✅ **strukturell**: `main` hat seit dem Merge **keinen weiteren Commit** — HEAD *ist* der Merge-Commit |
| 6–8 | Aktuelles Production-Deployment | ✅ `dpl_BkhKkPSAMEoYPzFbSQqUebkTSGzz`, Commit `255df013`, `target: production`, Region `fra1`, erstellt **14:44:56.862 UTC**, Build **14:44:58.292**, **`READY` 14:45:11.294 UTC**, `aliasError: null`, Alias `helmut-pilot.vercel.app` zugewiesen |
| 9 | Neueres Deployment? | ✅ **nein** — `project.latestDeployment` ist dasselbe Deployment |
| 10 | Build-/Runtime-Fehler seitdem | ✅ **keine**. Runtime-Log dieses Deployments: **genau ein Eintrag** (`GET / 200`, 14:45:46). Fehler-Cluster der letzten 7 Tage: 50 Gruppen, **jüngster Zeitstempel 2026-07-31 10:00:30 UTC** — also **vor** dem Deployment |

**Regression vs. Bestand, ausdrücklich getrennt.** Alle 50 Fehlergruppen sind bekannte
Bestandsklassen: Google-News-`Timeout`/`HTTP 503` (OP-15) · `[cron/crawl]`/`[cron/lage-check]
Zeitbudget erschöpft` (OP-25, ehrliche Kapazitätsmeldung) · `[understanding] OpenAI request
timeout` · `Supabase storage timed out` (`pipelineLock` fail-closed, `gate_shadow_events`,
`processRun`-Telemetrie) · `Vercel Runtime Timeout Error: Task timed out after 300 seconds`
(3 Vorkommen, letztes **2026-07-27**, also vor der R-6-Behebung). **Keine neue Klasse, kein
Vorkommen nach dem Deployment.**

**CI gegen den aktuellen Commit verifiziert** (nicht aus der PR-Beschreibung übernommen):
Push-Lauf auf `main` für `255df0133` = **`30639915579`, `success`**. Die Check-Runs am
gemergten Kopf `7b0a3e2` stammen aus Lauf **`30639121215`**: `Syntax + Offline-Suiten`
**success** (Job `91184250827`) und `Browser-/Mobile-Smoke (Chromium)` **success**
(Job `91184250852`). *Korrektur/Ergänzung zum Kopfblock dieses Dokuments und zur
PR-Beschreibung: dort ist Lauf `30638964148` genannt; die am gemergten Kopf hängenden
Pflicht-Checks tragen `30639121215`. Beide Pflicht-Checks sind grün — die Aussage bleibt
gültig, die Laufnummer war überholt.*

**Lokale Nachprüfung im Arbeitsbaum auf `255df013`** (offline erzwungen, 0 KI-Aufrufe,
0,00 USD): Offline-Suite **180/194 in 54 s** mit exakt den **14** umgebungsbedingten
Fehlschlägen (`admin-profile-fields`, `berlin-aktivierung`, `drei-profile-e2e`,
`landesmodul-mandatsgate`, `llm-reservation`, `p1-security-check`, `privacy-vollstaendigkeit`,
`profile-db`, `provision-tenant`, `saas-foundation`, `sales-blockers`, `tenant-guard`,
`tenant-llm-cap`, `tenant-neutrality`) · `vorgangskontext-test` **102/102** ·
`cron-globalphase-test` **176/176** · `globalphase-buendelung-test` **56/56** ·
`cron-fairness-test` **285/285** · `punkt29-fehlervertrag-test` **80/80** ·
`env-inventar-test` **38/38** · Mutationsproben **18/18**, **17/17**, **15/15 rot, je
0 Löcher**. **Alle Zahlen der PR-Beschreibung sind damit gegen den gemergten Commit
reproduziert.**

### 10.2 · Production-Flags (Phase 2)

**Was bewiesen ist — repositoryseitig, vollständig:**

| # | Zusage | Beleg |
|---|---|---|
| 1 | Default AUS, fail closed | `kontextpfadEnabled()` (`vorgangskontext.js`) und `globalPhaseEnabled()` (`cron-globalphase.js`) schalten **nur** bei `on`/`true`/`1`/`an` ein; leer, `off`, `ja`, `yes`, `onn`, `0` bedeuten AUS. Verträge: `vorgangskontext-test` 1.2–1.3, `cron-globalphase-test` „Flaggrenze" |
| 2 | Beide Flaggen gesetzt → **Altpfad** | `waehleCronPfad()` gibt bei Widerspruch `{ pfad: "alt", widerspruch: true }` zurück und protokolliert laut (`server.js` `cronSchwererPfad`). Vertrag: `vorgangskontext-test` 1.6 |
| 3 | Aktivierung über `helmut-flags.json` **ausgeschlossen** | `FILE_FLAG_ALLOWLIST` in `flags.js` enthält nur `HELMUT_UNDERSTANDING_GATE`, `HELMUT_PARDOK_DISPATCH`, `HELMUT_SOURCE_MODE`, `HELMUT_LANDESMODULE`. Beide Cron-Flaggen lesen `process.env` **direkt**, nicht über `flagValue()`. `helmut-flags.json` enthält keinen der beiden Namen; `vercel.json` ebenfalls nicht. Mutationsprobe **M18** („das Flag wird über `helmut-flags.json` aktivierbar") ist **rot** |
| 4 | Kein Preview-/Development-Pfad aktiviert etwas unerwartet | Es gibt **keinen** Codepfad, der eines der Flaggen setzt, ableitet oder aus einer Datei liest; die einzige Quelle ist die Prozess-Umgebung |

**Was NICHT bewiesen werden kann — ehrlich benannt:** der **tatsächliche Wert der
Vercel-Production-Env** ist aus einer Claude-Code-Cloud-Sitzung **nicht lesbar**. Das ist
kein neuer Befund, sondern die am 2026-07-26 auf **sechs** Kanälen gemessene Bestandsgrenze
(`CURRENT_STATE.md` §9, `berlin-aktivierung.md` §20.3): `VERCEL_TOKEN` ist nicht gesetzt,
der Vercel-MCP-Server stellt **kein** Env-Werkzeug bereit, `api.vercel.com`/`vercel.com` sind
proxy-gesperrt (`CONNECT` → 403), die App antwortet unauthentifiziert (401), und die
Admin-Konfigurationsdiagnose (`buildHelmutConfigDiagnose`) führt eine **eingefrorene
Sieben-/Acht-Namen-Whitelist**, in der keines der beiden Cron-Flaggen steht.

**Der übliche Ersatzbeleg „Wirkung statt Variable" ist heute ebenfalls nicht verfügbar:** der
Code beider Flaggen existiert in Production erst seit **13:17 UTC** (K1) bzw. **14:45 UTC**
(K2.1), und seitdem hat **kein einziger Cron gelaufen** (nächster relevanter Termin:
`pipeline` **16:00 UTC**). Es gibt also weder eine Log-Zeile `[cron/*/pfadwahl]` noch einen
Datenstandsvermerk, aus dem sich der Flagzustand ableiten ließe.

**Folge für die Entscheidung:** die Zusage „beide Flaggen sind AUS" ist **plausibel und
dokumentiert** (`env-inventar.md` §115/§116: „DEFAULT AUS, in Production NICHT gesetzt"), aber
**aus dieser Sitzung nicht belegbar**. Sie ist eine **Betreiberprüfung unmittelbar vor der
Aktivierung** (§10.6 Schritt 1) — 30 Sekunden im Vercel-Dashboard, kein Entwicklungsaufwand.

### 10.3 · Offene Production-Nachweise und Wirkung einer Aktivierung (Phase 3)

Gemeinsame, entscheidende Tatsache für alle drei: **auf dem aktuellen Production-Deployment
(`READY` 14:45:11 UTC) ist bis jetzt (15:1x UTC) kein einziger regulärer Cron-Lauf
abgeschlossen.** Der nächste pfadrelevante Termin ist `pipeline` **16:00 UTC**; nur `crawl`
und `pipeline` laufen über `cronSchwererPfad`.

| Nachweis | Ziel | Fensterbeginn | Erforderlich | Vollständige reguläre Läufe | Fehlend | Letzter gültiger Lauf | Zustand | Wirkung einer Aktivierung |
|---|---|---|---|---|---|---|---|---|
| **R-6** — Cron-Telemetrie bei Zeitüberschreitung (`cron-fairness.md` §11.8) | Laufdatensatz je Cron bleibt bei äußerem Zeitlimit vollständig rekonstruierbar | frühestens Deployment PR #199 (`61a0947`, 11:03 UTC), faktisch das aktuelle Deployment **14:45 UTC** | **≥ 24 h** reguläre Kadenz **und mindestens ein Lauf mit äußerem Zeitlimit** | **0** | 24 h abzüglich ~0,5 h; **alle 7 Prüfpunkte** | — (kein Lauf auf diesem Stand) | **teilweise abgeschlossen** (Repository fertig, CI grün, Production offen) | 🔴 **bestehender Nachweis würde unerreichbar.** K2.1 beseitigt gerade die Überziehung, auf der R-6 gemessen werden muss (gemessen n=6: alt **2/6 mit +37 585 ms Überziehung** → K2.1 **6/6 ohne Überziehung**). Zusatzrisiko: endet der Lauf **innerhalb der globalen Phase**, existiert zwar der Timeout-Vermerk (`laufTimeoutPatch`), aber **ohne** `geplant`/`ausgaenge` — Prüfpunkt 2 verlangt beides |
| **25B** — Ende-zu-Ende-Nachweis Pilotmandant (`roadmap/punkt-25-e2e-nachweis.md` §6) | **16 von 17** Kriterien erfüllt; offen ist ein vollständiger regulärer Lauf **des Pilotmandanten** nach dem Deployment, der seine **2** falschen Alt-Zeilen ablöst | wirksam erst mit PR #190 (B25-2-Fix, Rezeptversion v2, `bd7c889`, Deployment **10:43 UTC**), heute im Stand enthalten | 1 vollständiger regulärer Lauf **mit** Mandatszuordnung Pilot | **0** seit 10:43 UTC | genau dieser eine Lauf | 2026-07-30 16:04:59 UTC (anderer Mandant, 16/17) | **teilweise abgeschlossen** | 🟠 **teilweise Überlagerung.** K2.1 erhöht die Trefferwahrscheinlichkeit (6/6 statt 2/6) — aber der Lauf entstünde dann aus einem **nie in Production geprüften Pfad**. Ein 25B-„bestanden" auf einem solchen Lauf belegt B25-2 **nicht** sauber: Abweichungen wären nicht zwischen PR #190 und K2.1 trennbar |
| **29B** — Fehler-/Belastungsvertrag (`roadmap/punkt-29-fehlervertrag.md` §6) | 6 Beobachtungen an **regulären** Läufen: Fairness/Timeout · natürlicher Lock-Skip · natürliche Drossel-Episode · Fehlklassen · natürliche Matching-Wiederholung · kein falsches Grün | aktuelles Deployment **14:45 UTC** | mehrere reguläre Läufe (`pipeline` 16:00, `crawl` 20:00/04:00) | **0** | alle 6 Punkte | — | **teilweise abgeschlossen** (29A vollständig, 29B offen) | 🔴 **neues Beobachtungsfenster nötig.** Punkt 1 misst genau die `[cron/*/fairness]`-Zeilen und `zeitbudget`-Skips, die K2.1 verändert; Punkt 2 (Lock-Skip) wird durch die höhere Kapazität seltener. Ein vor der Aktivierung begonnenes Fenster wäre entwertet |

**Weitere laut `CURRENT_STATE.md` offene Nachweise** (durch eine Aktivierung **nicht** berührt,
weil sie nicht am Cron-Pfad hängen): OP-15 Google-News-Härtung (braucht echte Drosselung) ·
OP-07 Monitoring-Zweitkanal (`HELMUT_MONITORING_WEBHOOK_URL` unset) · OP-19 `source_id`-Dubletten ·
OP-09/OP-10 Lock-Deny und Fehlerpfad (brauchen ein echtes Störereignis).

**Nur vollständig abgeschlossene reguläre Läufe zählen.** Der wiederkehrende Lauf um **~07:5x
UTC** ist **kein** Cron-Termin aus `vercel.json` (Watchdog-ausgelöst) und wurde schon im
OP-25-Durchgang vom 2026-07-31 als **nicht regulär** ausgeschlossen; diese Konvention gilt
unverändert.

### 10.4 · GO-Kriterien (Phase 4)

| # | Kriterium | Stand | Beleg |
|---|---|---|---|
| 1 | Aktuelles Production-Deployment `READY` | ✅ | `dpl_BkhKkPSAMEoYPzFbSQqUebkTSGzz`, `readyState: READY`, 14:45:11 UTC |
| 2 | PR #201 enthalten | ✅ | `githubCommitSha 255df013…` = Merge-Commit; `main`-CI `30639915579` grün |
| 3 | Keine neue Regression im betroffenen Pfad | ✅ | 0 Fehler nach 14:45 UTC; alle 50 Fehlergruppen sind Bestandsklassen |
| 4 | Beide Flaggen AUS | ⚠️ **nicht belegbar** | repositoryseitig vollständig (§10.2 Tabelle); Vercel-Env aus der Cloud-Sitzung nicht lesbar → **Betreiberprüfung** |
| 5 | Rollback eindeutig ausführbar | ✅ | §10.7, zwei Stufen, beide ohne Datenrückbau |
| 6 | Aktive Bundestagsquellen unverändert | ✅ | read-only gemessen 2026-07-31 ~15:05 UTC: **163** Abrufwege (`needs_review/auto` 136 · `needs_review/manual` 18 · `healthy/always_on` 3 · `broken/auto` 3 · `healthy/auto` 1 · `broken/always_on` 1 · `needs_review/always_on` 1), **9** Pakete — identisch zum dokumentierten Bestand |
| 7 | Budgets unverändert | ✅ | PR #201 fasst weder `flags.js` noch `storage.js` noch einen Kostendeckel an (17-Datei-Diff) |
| 8 | Cron-Zeiten unverändert | ✅ | `vercel.json` zuletzt geändert **2026-07-27** (`d33f540`), also vor PR #199/#200/#201 |
| 9 | Berlin, Brandenburg, M8, Testmandate AUS | ✅ | read-only gemessen: **6 aktive Mandate, ausnahmslos `politische_ebene = bundestag`** (kein aktives Landtagsmandat, M8 unverändert inaktiv); alle **18** Landesmodul-Wege (10 Berlin inkl. `rp-rbb24-politik`, 8 Brandenburg) `needs_review` + `manual` |
| 10 | Bestehende Nachweise abgeschlossen **oder** Überlagerung ausdrücklich bewertet | ⚠️ **bewertet, Ergebnis negativ** | §10.3 — R-6 würde unerreichbar, 29B bräuchte ein neues Fenster, 25B wäre nicht sauber zuordenbar |
| 11 | Erforderliche Telemetrie vorhanden | ✅ | Datenstandsvermerk (`buendelung`, `kontexte`), `mode: "global"`/`mode: "mandat"`-Laufdatensätze, `[cron/*/pfadwahl]`-Zeile, R-6-Laufdatensatz, `[cron/*/fairness]` |
| 12 | Nächster regulärer relevanter Lauf bekannt | ✅ | `pipeline` **16:00 UTC**, danach `crawl` **20:00 UTC** und **04:00 UTC** |
| 13 | Abbruchschwellen definiert | ✅ | §10.7, zehn sofortige Auslöser |
| 14 | Kein Datenrückbau für den Rollback nötig | ✅ | keine Tabelle, keine Spalte, keine Migration (§7.2) |

**12 von 14 erfüllt. Kriterium 4 ist eine Betreiberprüfung, Kriterium 10 ist bewertet und
fällt negativ aus.**

### 10.5 · NO-GO-Kriterien (Phase 4)

| # | Kriterium | Trifft zu? |
|---|---|---|
| 1 | Deployment nicht `READY` | nein |
| 2 | PR #201 nicht im aktuellen Deployment | nein |
| 3 | Eines der Flaggen unerwartet aktiv | **unbekannt** — nicht auszuschließen, weil nicht lesbar (§10.2) |
| 4 | Neue Runtime-, Daten- oder Sicherheitsregression | nein |
| 5 | Bestehende Nachweise würden fälschlich als bestanden gelten | **ja** — 25B auf einem Lauf des neuen Pfades wäre kein sauberer B25-2-Beleg; 29B-Punkt 1/2 misst Größen, die K2.1 verändert |
| 6 | Rollback nicht eindeutig | nein |
| 7 | Notwendige Telemetrie fehlt | nein |
| 8 | Erster regulärer Lauf nicht eindeutig zuordenbar | **ja** — der erste Lauf dieses Deployments wäre zugleich der erste Lauf des neuen Pfades; R-6-, 25B- und K2.2-Wirkungen fielen in denselben Lauf |
| 9 | Budgets oder Laufzeit könnten überschritten werden | nein (Budget wird geteilt, nicht erhöht; Aufschlag ≈ 3 s = 3,3 % des Verstehensbudgets bei 15 Kontexten) |
| 10 | Berlin, Brandenburg, M8 oder Testmandate würden indirekt beeinflusst | nein — die Vereinigungsmenge entsteht aus `getSourcesForProfile()` der **aktiven** Mandate; alle Landesmodul-Wege bleiben `manual` |

**Drei NO-GO-Kriterien greifen: 3 (unbekannt), 5 und 8 (zutreffend).**

### 10.6 · Aktivierungsplan für den Betreiber (Phase 5 — NICHT ausgeführt)

> Dieser Plan wird **erst nach** Abschluss oder ausdrücklichem Verzicht auf die Nachweise aus
> §10.3 ausgeführt. Er ist hier vollständig festgehalten, damit er dann nicht neu entstehen muss.

1. **Letzte Prüfung unmittelbar vor der Aktivierung.**
   a) Vercel → Projekt `helmut-pilot` → Settings → Environment Variables → **Production**:
      `HELMUT_CRON_GLOBALPHASE` ist **nicht vorhanden** oder steht auf `off` (Screenshot als Beleg);
      `HELMUT_CRON_GLOBALABRUF` ist **noch nicht vorhanden**.
   b) Deployments → jüngstes `production`-Deployment ist `READY` und trägt Commit `255df013`
      (oder einen späteren `main`-Commit, dessen CI grün ist).
   c) `main`-CI des betroffenen Commits grün (`Syntax + Offline-Suiten`, `Browser-/Mobile-Smoke`).
2. **Env setzen:** `HELMUT_CRON_GLOBALABRUF` = `on`.
3. **`HELMUT_CRON_GLOBALPHASE` bleibt aus** oder ungesetzt. Werden beide gesetzt, läuft der
   Altpfad — die Aktivierung wäre wirkungslos und nur an der Log-Zeile
   `[cron/*/pfadwahl] … Es laeuft der ALTPFAD.` erkennbar.
4. **Ausschließlich Environment `Production`.** Preview und Development bleiben unberührt
   (gleiches Vorgehen wie bei `HELMUT_MATCHING_AUDIT` am 2026-07-28).
5. **Redeploy-Mechanismus:** eine Env-Änderung wirkt in Vercel **erst mit einem neuen
   Deployment**. Vercel → Deployments → aktuelles Production-Deployment → **Redeploy**
   (derselbe Commit, kein neuer Merge, kein CLI-Deploy). Es entsteht eine **neue
   Deployment-ID** auf demselben Commit.
6. **Nachweis, welches Deployment die Env-Änderung enthält:** neue Deployment-ID notieren;
   sie muss `target: production`, `state: READY`, Commit `255df013` und einen Zeitstempel
   **nach** der Env-Änderung tragen. Zusätzlicher Wirknachweis im ersten Lauf: die Log-Zeile
   `[cron/<cron>/pfadwahl]` bzw. der Datenstandsvermerk mit `buendelung: "kontext"`.
7. **Kein manueller Cron.** Kein `curl` auf `/api/cron/*`, kein Dashboard-Trigger, kein
   Workflow-Dispatch. Der Nachweis zählt nur an regulären Terminen.
8. **Zeitpunkt des nächsten regulären relevanten Crons** (nur `crawl`/`pipeline` betreten den
   neuen Pfad): `pipeline` **16:00 UTC** · `crawl` **20:00 UTC** · `crawl` **04:00 UTC**.
   Sinnvoll ist eine Aktivierung **nach** dem 04:00-`crawl` und **vor** dem 16:00-`pipeline`,
   damit der erste Lauf des neuen Pfades allein steht.
9. **Erste Kontrollprüfung direkt nach diesem Lauf** (rein lesend, §10.8 Punkte 1–9):
   Pfadwahl, globaler Datenstand `abgeschlossen`, Kontextzahl, Laufzeit der globalen Phase,
   Fehler/Timeouts, R-6-Laufdatensatz vorhanden.
10. **Beobachtungsfenster mindestens 24 h** ab `READY` des Redeploys — es enthält dann
    mindestens `pipeline` 16:00, `crawl` 20:00 und `crawl` 04:00.
11. **Abschlussprüfung nach dem Fenster:** vollständige Messliste §10.8, Vergleich gegen die
    letzte gültige Altpfad-Basislinie, Eintrag in `CURRENT_STATE.md` und in dieses Dokument.

### 10.7 · Rollback (Phase 6)

**Stufe 1 — Konfiguration (Minuten, kein Codeeingriff):**

1. `HELMUT_CRON_GLOBALABRUF` in der Production-Env auf `off` setzen **oder** die Variable löschen
   (beides wirkt fail closed; ein unbekannter Wert wirkt ebenfalls AUS).
2. **Redeploy** desselben Commits — ohne neues Deployment wirkt die Änderung nicht.
3. **Beweis, dass der Altpfad wieder läuft:** im nächsten regulären `crawl`/`pipeline`
   **kein** Datenstandsvermerk mit `buendelung: "kontext"`, **kein** `mode: "global"`-Laufdatensatz,
   und die `[cron/*/fairness]`-Zeile trägt wieder das Altpfad-Muster (je Mandat ein
   `runSourceCrawl`).
4. **Kein Datenrückbau** — es entstehen keine neuen Tabellen, Spalten oder Migrationen; alles
   Erzeugte sind dieselben `raw_documents`, Wissensobjekte und Telemetriezeilen wie heute.
5. **Kein manueller Cron** zur Bestätigung; der nächste reguläre Lauf genügt.

**Stufe 2 — Code (nur, wenn Stufe 1 nicht genügt):**

1. Merge-Commit `255df01337f82d54765b773b7b5354dd04dee725` reverten
   (`git revert -m 1 255df013`) auf einem eigenen Branch.
2. CI vollständig prüfen — beide Pflicht-Checks.
3. PR anlegen, Risiko/Rollback in der Beschreibung.
4. **Nicht selbst mergen.** Merge = Production-Deployment und bleibt Betreiberentscheidung.

**Sofortige Rollback-Auslöser** (jeder einzeln genügt):

| # | Auslöser | Woran erkennbar |
|---|---|---|
| 1 | Globale Phase scheitert | `mode: "global"`-Laufdatensatz fehlt oder trägt `status != abgeschlossen` |
| 2 | Datenstand wird nicht versiegelt | `datenstand.status != "abgeschlossen"` am Ende der globalen Phase |
| 3 | Mandatsprojektionen starten trotz gescheiterter globaler Phase | `mode: "mandat"`-Datensätze bei fehlgeschlagener globaler Phase |
| 4 | Dokumentverlust | Rohdokumentzahl je Lauf bricht gegen die Basislinie ein; Wissensobjekte ohne Dokument |
| 5 | Unerwartete Abweichung der Vorgangsgruppierung | neue Vorgangskennungen ohne Entsprechung; Vorgänge mit fremden Dokumenten; `kontextvertrag`-Fehler |
| 6 | Überschreitung des sicheren Zeitfensters | `[cron/*] …ms bounded=true` mit Laufzeit über der Altpfad-Basislinie |
| 7 | Mehr übersprungene Mandate als im Altpfad | `k` sinkt bzw. `ceil(n/k)` steigt gegenüber der Basislinie |
| 8 | Unerwartete KI- oder Kostensteigerung | Tagesbudget-Zähler über der Basislinie; Reserve angebrochen |
| 9 | Mandantentrennungs- oder Sicherheitsverletzung | Zeile mit fremdem `user_id`; `assertTenant`-Fehler; fremder Ausschussbeleg |
| 10 | Wiederholte Runtime-Fehler im neuen Pfad | ≥ 2 Läufe mit neuen Fehlerklassen aus `vorgangskontext.js`/`cron-globalphase.js` |

### 10.8 · Production-Nachweisplan (Phase 7 — später, nicht jetzt)

**Rein lesend. Keine Modellwerte als Production-Messung ausgeben** — die Zahlen aus §5/§6
dieses Dokuments sind Simulationswerte und dürfen nie als gemessen berichtet werden.

Zu messen, mindestens: (1) erster regulärer Lauf mit neuem Pfad · (2) Start, Vollständigkeit
und Versiegelung des globalen Datenstands · (3) geplante Einzelwege · (4) vereinigte Abrufwege ·
(5) erfolgreiche Abrufe · (6) Fehler und Timeouts · (7) Laufzeit der globalen Phase ·
(8) Anzahl Bündelungskontexte · (9) Verstehensbudget je Kontext · (10) vollständig verarbeitete
Mandate · (11) übersprungene Mandate · (12) Fairness-`k` · (13) `ceil(n/k)` · (14) Grenzkosten
je Mandat · (15) Matching-Ergebnisse · (16) Entscheidungen · (17) Vorgangs- und Dokumentanzahl ·
(18) KI-Aufrufe und Kosten · (19) Runtime-Fehler · (20) Vergleich gegen die letzte gültige
Altpfad-Basislinie.

**Fünf getrennt zu bewertende Nachweisarten:**

| Art | Frage | Bestanden, wenn |
|---|---|---|
| **Funktionsnachweis** | Läuft der Pfad überhaupt? | globaler Datenstand `abgeschlossen`, je Mandat ein `mode: "mandat"`-Datensatz, keine `kontextvertrag`-Fehler |
| **Kapazitätsnachweis** | Werden mehr Mandate fertig? | `k` und `ceil(n/k)` besser oder gleich der Basislinie, ohne Überziehung |
| **Fachliche Gleichheit** | Dieselbe Vorgangsbildung wie vorher? | keine unerklärten neuen/fehlenden Vorgänge; Dokumentzahl je Vorgang plausibel gegen die Basislinie |
| **Mandantentrennung** | Sieht kein Mandat fremde Daten? | jede mandantenbezogene Zeile trägt den eigenen `user_id`; keine fremden Ausschussbelege |
| **Kosten- und Budgettreue** | Nicht teurer? | KI-Aufrufe/Tag und Kosten ≤ Basislinie; Verstehensbudget geteilt, nicht erhöht |

**Basislinie:** die letzte gültige Altpfad-Messung ist der OP-25-Durchgang vom **2026-07-31,
08:00 UTC** (5 gewertete reguläre Läufe, `k` min. 1, typisch 2 begonnen / 1 erfolgreich bei
`crawl`). Sie stammt **vor** PR #190/#198/#199/#200/#201 und ist damit **nicht** die Basislinie
des aktuellen Stands. Eine belastbare Altpfad-Basislinie auf `255df013` **existiert noch
nicht** — sie entsteht mit den Läufen ab `pipeline` 16:00 UTC.

### 10.9 · Entscheidung

**`BLOCKIERT` — ein zukünftiger regulärer Lauf und eine Betreiberprüfung sind erforderlich.**

**Exakt fehlender Beleg:**
1. Mindestens ein vollständig abgeschlossener **regulärer** Lauf auf dem aktuellen Deployment
   — es gibt bisher **null**. Damit fehlt jede Altpfad-Basislinie für diesen Stand.
2. **R-6:** ≥ 24 h reguläre Kadenz **mit** mindestens einem Lauf am äußeren Zeitlimit. Nach
   einer Aktivierung ist dieser Lauf voraussichtlich **nicht mehr herstellbar**.
3. **25B:** ein regulärer Lauf des Pilotmandanten nach dem B25-2-Deployment.
4. **29B:** mehrere reguläre Läufe für die sechs Beobachtungen.
5. **Flagzustand** in der Vercel-Production-Env — aus der Cloud-Sitzung nicht lesbar.

**Mögliche parallele Arbeiten (ohne Freigabe, ohne Production-Wirkung):** OP-11 Branch
Protection verifizieren · Review offener PRs (#192, #191, #112, #111) · Aufräumsprint
§7.2 Stufe 3 vorbereiten (K1-Pfad entfernen) · Bestandsbefund F10/Z2 (Formularvokabular)
als eigenen, freigabepflichtigen Sprint schneiden.

**Keine künstliche Ersatzaktivierung:** kein manueller Cron, kein Preview-Deployment mit
gesetztem Flag als „Nachweis", keine Simulation als Production-Messung.
