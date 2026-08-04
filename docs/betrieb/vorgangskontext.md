# OP-25 K2.1 — Globaler Abruf, kontextgebundene Vorgangsbildung

**Kanonische Dokumentation des K2.1-Pfads.** Stand: **2026-08-04** (§7.7 ergänzt: ausführbarer
Nachweisvertrag nach der E3-Entscheidung; Mandatserwartung überall von sechs auf **fünf aktive
reale Mandate / dynamisch ermittelt** korrigiert).
Zustand: **gemergt und deployt; `HELMUT_CRON_GLOBALABRUF` ist seit dem gescheiterten
Kapazitätslauf vom 2026-08-03 wieder DEAKTIVIERT** (Betreiberaktion, §7.6). Die Reparatur der
Kapazitätsursachen ist als **PR #219** gemergt (`89427c5`) und ausgerollt; die erneute
Aktivierung ist eine **getrennte, noch nicht erfolgte Betreiberaktion**.
**PR #201** gemergt (`255df01`), beide Pflicht-Checks grün (Lauf `30638964148`,
`Syntax + Offline-Suiten` **194/194 Suiten**, `Browser-/Mobile-Smoke (Chromium)`).

> **Der Pfad ist damit scharf, aber NICHT abgenommen.** Deployment `READY` und unmittelbarer,
> rein lesender Smoke-Check sind bestanden (§7.4). **Der reguläre Production-Kapazitätsnachweis
> über mindestens 24 h reguläre Kadenz steht vollständig aus** — bis dahin ist über die
> tatsächliche Wirkung des Pfades in Production **nichts** belegt, und **OP-25 bleibt teilweise
> abgeschlossen**. Kein falsches Grün (`CLAUDE.md` §4.4).

> **Flaggrenze, verbindlich — Code-Default und Production-Zustand sind zu unterscheiden:**
> `HELMUT_CRON_GLOBALABRUF` hat den **Code-Default AUS**; ohne ausdrücklich gesetzten Wert
> (`on`/`true`/`1`/`an`) läuft ausschließlich der bisherige Pfad, und das bleibt so. Das Flag ist
> **nicht** über `helmut-flags.json` setzbar — nur über die Vercel-Env, also nur durch den
> Betreiber. **Aktueller Production-Zustand: `on`, gesetzt am 2026-08-03, 13:15:11 UTC,
> ausschließlich in der Umgebung `Production`** (Preview und Development unverändert ohne Wert,
> dort greift weiter der Default). Sind `HELMUT_CRON_GLOBALPHASE` **und**
> `HELMUT_CRON_GLOBALABRUF` gesetzt, läuft der **Altpfad** (fail closed bei Widerspruch);
> `HELMUT_CRON_GLOBALPHASE` ist unverändert **nicht** gesetzt.

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

**Stand 2026-08-03:** der Schalter ist **eingeschaltet** — der Betreiber hat
`HELMUT_CRON_GLOBALABRUF=on` für Production gesetzt (13:15:11 UTC). Der neue Weg ist damit
scharf, aber **noch nicht abgenommen**: der reguläre Production-Nachweis über mindestens 24 h
steht aus (§7.4). *(Bis dahin galt: der Weg lag hinter einem ausgeschalteten Schalter, und ihn
einzuschalten war eine Freigabeentscheidung des Betreibers.)*

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
| Dokument ohne bestimmbare Sichtbarkeit | in einen **unbekannten** Kontext — **je Quelle einer**, wenn die Quelle bekannt ist (Dokumente derselben Quelle haben zwangsläufig dieselbe, wenn auch unbekannte Sichtbarkeit); **je Dokument einer**, wenn auch die Quelle unbestimmbar ist. Nie geraten, nie einem bekannten Kontext zugeschlagen (§7.5) |
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

### 7.1 Voraussetzungen für eine Aktivierung

**Stand 2026-08-03, 13:15 UTC:** die Punkte 1–3 sind **erledigt**. **Punkt 4 ist der einzige noch
offene Punkt des Production-Nachweises** (§7.4). **Punkt 5 ist kein Nachweispunkt**, sondern eine
davon unabhängige Produktentscheidung über einen möglichen Folgesprint — er blockiert die Abnahme
von K2.1 nicht und wird hier nur mitgeführt, damit er nicht verlorengeht. Die Vorprüfung, die zu
Punkt 2 führte, steht in §7.3; sie endete zunächst blockiert, weil der Handgriff aus einer
Agenten-Sitzung nicht ausführbar ist — er wurde am selben Tag vom Betreiber ausgeführt.

| # | Voraussetzung | Stand |
|---|---|---|
| 1 | Merge des PR (= Production-Deployment) durch den Betreiber | **erledigt** — PR #201 gemergt (`255df01`); **zum Aktivierungszeitpunkt trug Production den Stand `ded0e24`** (Deployment `dpl_J4g3k4QPUEaKAad3pB83ByGcvUkn`, `READY` 2026-08-03 13:15:11 UTC), der `255df01` enthält. *(Die Vorprüfung in §7.3 lief auf dem Vorgängerstand `c6f3f9f`; `ded0e24` unterscheidet sich davon nur in vier Markdown-Dateien unter `docs/` — der Anwendungscode ist identisch, §7.4.)* |
| 2 | `HELMUT_CRON_GLOBALABRUF=on` **in der Vercel-Env** setzen — nicht in `helmut-flags.json` (dort wirkt es nicht) und nicht im Repo | **erledigt** — 2026-08-03, 13:15:11 UTC, Betreiberaktion, §7.4 |
| 3 | Sicherstellen, dass `HELMUT_CRON_GLOBALPHASE` **nicht** gesetzt ist (sonst greift die Widerspruchsregel und es läuft der Altpfad) | **erfüllt** — unverändert nicht gesetzt, §7.3/§7.4 |
| 4 | Rein lesender Production-Nachweis über mindestens 24 h: `mode: "global"`-Laufdatensatz vorhanden, `datenstand.status` gemäß **E3-Regel aus §7.7** (`abgeschlossen` ODER ein ehrliches `teilweise` ausschließlich aus dauerhaft vorgemerkter Verstehensarbeit), je Mandat ein vollständig abgeschlossener `mode: "mandat"`-Datensatz, **die sieben Vertragskriterien aus §7.5** (Partition · Kontextgrenze · unbekannte Kontexte ausgewiesen · keine `kontextvertrag`-Fehler · Datenstand gemäß E3-Regel · **alle beim Fensterstart aktiven Mandate** fertig (dynamisch ermittelt; Stand 2026-08-04: **fünf** reale) · Kontextzahl berichtet und bei Auffälligkeit erklärt) | **OFFEN — der einzige noch offene Punkt des Nachweises**; ausführbar über `scripts/op25-production-nachweis.js`, §7.7 |
| 5 | Bewertung, ob die verbleibenden Bestandsbefunde (F10/Z2, Formularvokabular) einen eigenen Sprint auslösen sollen | **offen, aber KEIN Nachweispunkt** — unabhängige Produktentscheidung, blockiert die Abnahme von K2.1 nicht |

### 7.2 Rückbaupfad

| Stufe | Maßnahme | Wirkung |
|---|---|---|
| 1 | `HELMUT_CRON_GLOBALABRUF` auf `off` setzen oder löschen, Redeploy | sofort zurück auf den Altpfad, **ohne Codeänderung** |
| 2 | Revert des PR | entfernt den Pfad vollständig; `main` ist ohne ihn lauffähig, weil der Altpfad nie verändert wurde |
| 3 | nach erfolgreichem Nachweis | der K1-Pfad (`HELMUT_CRON_GLOBALPHASE` + `buendelung: "global"`) kann entfernt werden — er ist durch K2 als nicht aktivierungsfähig belegt und nur noch Vergleichsmaßstab. Das ist ein eigener, kleiner Aufräumsprint. |

**Es gibt keinen Datenrückbau:** K2.1 schreibt keine neuen Tabellen, keine neuen Spalten und
keine Migration. Alles, was entsteht, sind dieselben `raw_documents`, Wissensobjekte und
Telemetriezeilen wie heute.

### 7.3 Aktivierungsprüfung 2026-08-03 — geprüfter Ausgangszustand und der eine Blocker

Vollständige Vorprüfung mit ausdrücklicher Betreiberfreigabe, **rein lesend**. **Ergebnis:
11 von 13 Gates erfüllt, nicht aktiviert.** Sprintprotokoll und Zahlen:
[`../CURRENT_STATE.md`](../CURRENT_STATE.md), Kopfeintrag vom 2026-08-03.

**Der Blocker — der Schreibweg, nicht die Sache.** `VERCEL_TOKEN` liegt inzwischen in den
Claude-Code-Environment-Einstellungen; die Egress-Richtlinie der Sitzung sperrt aber
`api.vercel.com`, `vercel.com` **und** `mcp.vercel.com` (`CONNECT → HTTP 403`, vom Sitzungsproxy
je einzeln als `connect_rejected` protokolliert). Die Vercel CLI **58.4.4** liest den Token
selbstständig und scheitert schon beim **rein lesenden** `project ls` (`fetch failed`); der
Vercel-MCP-Server ist authentifiziert und liefert Teams, Projekte, Deployments und Runtime-Logs,
hat aber **kein** Environment-Werkzeug und **keinen** Redeploy. Damit ist **Stufe 1 des
Rückbaupfads (§7.2) aus einer Sitzung nicht ausführbar** — und ohne ausführbaren Rückweg wird
nicht aktiviert (`CLAUDE.md` §4.4). Die Bedingung ist seit 2026-07-26 bekannt und unverändert:
*„`VERCEL_TOKEN` **und** geöffneter Egress — eines allein genügt nicht"*
([`berlin-aktivierung.md`](berlin-aktivierung.md) §20.3, [`env-inventar.md`](env-inventar.md) §8).

**Wie „beide Flaggen AUS" belegt wurde, ohne den Wert lesen zu können.** Der Flagwert bleibt aus
einer Sitzung unlesbar; geprüft wurde deshalb die **Wirkung**: in 24 h Production-Runtime-Logs
existiert **keine** `[cron/*/globalphase]`-Zeile (die der neue Pfad je Lauf schreibt) und **keine**
`[cron/*/pfadwahl]`-Widerspruchszeile (die bei zwei gesetzten Flaggen entsteht), und die
Stapelspuren der `crawl`-Läufe 04:00 und 20:00 UTC führen durch `runSourceCrawl` und `perTenant` —
den **Altpfad**. Beides zusammen schließt jeden der drei Pfade außer `alt` aus.

**Wirkungsgrenze am Code gegengeprüft:** `cronSchwererPfad` hat genau **zwei** Aufrufstellen —
`server.js:829` (`/api/cron/crawl`) und `server.js:903` (`/api/cron/pipeline`). `morning-briefing`,
`lage-check`, `health-report`, `lage-briefing` und `understanding` rufen sie **nicht**; sie bleiben
von einer Aktivierung unberührt.

**Sicheres Aktivierungsfenster.** Es folgt aus `vercel.json` **und** dem GitHub-Actions-Watchdog
(`briefing-watchdog.yml`), der `pipeline` auslöst — `vercel.json` ist nicht die einzige
Zeitplanquelle (Befund D-2, [`cron-fairness.md`](cron-fairness.md) §14.9). Der Watchdog ist auf
05:30 UTC geplant, startete real aber zwischen **07:30 und 08:55 UTC** (zehn Läufe geprüft) und
feuert einmal täglich. Daraus: **das täglich verlässlichste Fenster ist 09:15–15:30 UTC =
11:15–17:30 Berlin** — nach dem Watchdog und mit 30 min Abstand vor dem 16:00-UTC-`pipeline`.
Zweitfenster: 16:20–19:30 UTC = 18:20–21:30 Berlin. Es muss Environment-Änderung, Redeploy bis
`READY`, Smoke-Check **und** vollständigen Rückbau tragen.

### 7.4 Aktivierung 2026-08-03 — ausgeführt, Smoke bestanden, Kapazitätsnachweis offen

> **Historisch-Vermerk (2026-08-04/5):** Dieser Abschnitt beschreibt die Aktivierung vom
> **2026-08-03** und den damals gescheiterten ersten Wirkungslauf. **Der HEUTIGE Zustand von
> `HELMUT_CRON_GLOBALABRUF` in Production ist aus einer Sitzung nicht lesbar (§7.3) und wird
> deshalb nicht behauptet — er ist eine offene Betreiberprüfung.** Spätere Statusdokumente
> enthalten sowohl „gesetzt seit 2026-08-03" als auch „bleibt deaktiviert"; keiner der beiden
> Sätze ist lesend belegt. Zusätzlich gilt seit §7.7.5: das **Setzen** der Env allein ist
> keine wirksame Aktivierung — eine Vercel-Umgebungsvariable gilt erst in einem **neuen
> Deployment**, und der Aktivierungszeitpunkt des Nachweises ist dessen READY-Zeitpunkt.

**Kurzstatus, verbindlich:** *K2.1 ist in Production aktiviert. Deployment `READY` und der
unmittelbare Smoke-Check sind bestanden. Der reguläre Production-Kapazitätsnachweis über das
vorgeschriebene Beobachtungsfenster ist noch offen. **OP-25 bleibt teilweise abgeschlossen.***

**Der Handgriff war eine Betreiberaktion** — der in §7.3 belegte Blocker (kein Vercel-Schreibweg
aus einer Agenten-Sitzung) besteht unverändert fort und wurde **nicht** umgangen, sondern vom
Betreiber über die Vercel-Oberfläche erledigt.

| Feld | Wert |
|---|---|
| Aktiviertes Flag | **`HELMUT_CRON_GLOBALABRUF = on`** |
| Geltungsbereich | **ausschließlich `Production`**; Preview und Development unverändert. `Sensitive` bewusst deaktiviert — der Wert ist kein Geheimnis |
| `HELMUT_CRON_GLOBALPHASE` | **unverändert nicht gesetzt (AUS)** — die Widerspruchsregel greift damit nicht, es läuft `kontext` und nicht der Altpfad |
| Aktivierungs-/READY-Zeitpunkt | **2026-08-03 13:15:11 UTC = 15:15:11 Berlin** (Buildstart 13:15:00, Deploymentanlage 13:14:58) |
| Production-Deployment | **`dpl_J4g3k4QPUEaKAad3pB83ByGcvUkn`**, `target: production`, `readyState: READY`, `source/action: redeploy` (aus `dpl_9ihAmLeKea3rcySF8jm3Xa6nq1ch`), Region `fra1` |
| Deployter Commit | **`ded0e240e24ca081b5ff68e150a95f7006b08ad7`** = `origin/main` (Merge PR #213) |
| Verhältnis zum freigegebenen Stand `c6f3f9f` | `git diff c6f3f9f ded0e24` über `server.js`, `client.js`, `styles.css`, `lib/`, `scripts/`, `supabase/`, `vercel.json`, `helmut-flags.json`, `.github/`, `api/`, `package*.json` ist **leer** — der Unterschied sind **vier Markdown-Dateien unter `docs/`**. Der deployte **Anwendungscode ist identisch** mit dem geprüften Stand |
| Aliasse | `helmut-pilot.vercel.app`, `helmut-pilot-nohut.vercel.app`, `helmut-pilot-git-main-nohut.vercel.app` — die Production-Domain zeigt auf dieses Deployment |

**Rein lesender Smoke-Check (13:21–13:23 UTC) — bestanden, keine Production-Daten verändert:**

| Prüfung | Ergebnis |
|---|---|
| Startseite `GET /` | **HTTP 200**, Ausführungsregion `fra1`, `cache-control: no-store` |
| **Asset-Rotation** (Pflichtprüfung nach jedem Redeploy, [`deploy-rollback.md`](deploy-rollback.md) §3) | `styles.css?v=**ded0e240**`, `client.js?v=**ded0e240**`, Icons und Manifest ebenso — **exakt der deployte Commit**. Keine Stale-Asset-Falle |
| Sicherheits-/Routing-Header | CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` vollständig — die Regeln aus `vercel.json` greifen |
| `GET /site.webmanifest` | HTTP 200, korrekter Content-Type |
| `GET /api/health` | **HTTP 401** — das Auth-Gate antwortet korrekt (dokumentiertes Verhalten ohne Secret); die Route ist erreichbar, nicht defekt |
| Build | **keine** Fehlerzeile, `Build Completed in /vercel/output [2s]` |
| Runtime-Fehler | **0** (aggregierte Fehlertabelle, 2-h-Fenster) |
| Runtime-Logs seit `READY` | 3 Anfragen, **alle** `GET / 200` auf dem neuen Deployment; **0** Einträge der Stufen `error`/`warning`/`fatal` |
| Konfigurationswiderspruch | **keine** `[cron/*/pfadwahl]`-Zeile — sie entstünde nur bei zwei gesetzten Flaggen. *Aussagekraft heute begrenzt:* seit dem Deployment lief noch kein schwerer Cron, die Zeile könnte also auch aus diesem Grund fehlen |
| Datenbank | **0** aktive Sperren; Fairnesszeile `main-cron-fairness` unverändert (`rev = 46`, 9 467 Bytes, `updated_at` 10:04:36 UTC); `process_runs` unverändert; **0** neue `systemError` seit `READY`; **0** DB-Fehler |
| Betriebsgrenzen | unverändert: **0** aktive Berliner/Brandenburger Abrufwege (alle 17 `needs_review`/`manual`), 1 aktiver Abrufweg insgesamt, 6 aktive Mandate, Cron-Zeiten und Budgets unberührt |

**Ein Rückbau war nicht erforderlich** — kein Fehler, kein Widerspruch, kein Abbruchkriterium.

**Was ausdrücklich NOCH NICHT belegt ist.** Der Flagwert ist aus einer Sitzung unlesbar: keine
Route gibt ihn aus, und `waehleCronPfad()` wird **ausschließlich zur Cron-Zeit** ausgewertet
(`cronSchwererPfad`, `server.js`). **Der erste Beleg, dass der Pfad wirklich greift, ist deshalb
der nächste reguläre schwere Lauf** — `/api/cron/pipeline` um **16:00 UTC / 18:00 Berlin**. Er
wurde **nicht** ausgelöst und **nicht** abgewartet. Bis dahin gilt: aktiviert und fehlerfrei
deployt, **aber wirkungsseitig unbelegt**.

**Der Nachweis nach Punkt 4 bleibt vollständig offen** und verlangt über **mindestens 24 h**
reguläre Kadenz, rein lesend: je Lauf ein `mode: "global"`-Laufdatensatz · `datenstand.status`
gemäß **E3-Regel (§7.7)** · für **alle beim Fensterstart aktiven** Mandate (dynamisch ermittelt;
Stand 2026-08-04: **fünf** reale — die frühere Sechs-Mandate-Erwartung ist seit der Deaktivierung
von `max-mustermann` überholt) ein vollständig abgeschlossener
`mode: "mandat"`-Datensatz · die **sieben Vertragskriterien** aus **§7.5** (Partition ·
Kontextgrenze · unbekannte Kontexte vollständig ausgewiesen und untersucht · **keine**
`kontextvertrag`-Fehler · Datenstand gemäß E3-Regel · alle Mandate fertig · Kontextzahl berichtet
und bei auffälliger Höhe erklärt) · keine neue Fehlerklasse · LLM-Kosten im dokumentierten Rahmen. **Eine
Obergrenze für `kontexte` gehört ausdrücklich NICHT dazu** — die Zahl ist eine Beobachtungsgröße,
kein Schwellwert (§7.5). **Die Kapazitätsaussage selbst** (Offline-Simulation: alt
2/6 → K2.1 6/6, §6) ist bis dahin **kein Production-Nachweis**. Vergleichsmaßstab ist die am
2026-08-03 vor der Aktivierung aufgenommene Baseline: `crawl` und `pipeline` je **2 begonnen /
1 erfolgreich** mit äußerem Zeitlimit, `lage-check` 1/6, `morning-briefing` 6/6.

**Rückbau — weiterhin Betreiberaktion.** Stufe 1 aus §7.2 (`HELMUT_CRON_GLOBALABRUF` auf `off`
oder löschen, Redeploy) ist aus einer Agenten-Sitzung **nicht** ausführbar, solange der Egress zu
`api.vercel.com` gesperrt ist (§7.3). Wer aktiviert hat, muss auch zurücknehmen können: **zeigt
ein regulärer Lauf ab 16:00 UTC ein Problem, liegt der Rückbau beim Betreiber.**

---

### 7.5 Die Zahl der Bündelungskontexte — Definition, Beobachtung, Bestehenskriterium

Diese Regel gilt **überall** in der Doku; frühere Formulierungen („≈ 1 + Zahl der Mandate",
„erwartet 10", „Abnahmeschranke `≤ 2n + 1`") waren **falsch oder zu weitgehend** und sind hiermit
ersetzt. Alles Folgende ist am Code (`lib/helmut/vorgangskontext.js`) und an der Suite gemessen.

**Definition (`planKontexte`):**

> **`kontexte` ist die Anzahl *verschiedener Sichtbarkeitsmengen* unter den Rohdokumenten eines
> Laufs**, zuzüglich der fail-closed gebildeten **unbekannten** Kontexte.

Die Zahl ist **datenabhängig und keine Funktion von `n` allein**. Sie setzt sich zusammen aus:

| Anteil | Beitrag |
|---|---|
| Quellen, die **alle** Mandate erhalten (der geteilte Katalog) | **1** Kontext |
| jede Quellengruppe, die eine **echte Teilmenge** der Mandate versorgt (Partei-, Regional-, Ausschussquellen) | **1** Kontext **je verschiedener Teilmenge** |
| die **eigenen** Quellen eines Mandats (`<mandats-id>-news` usw.) | **1** Kontext **je Mandat** |
| Dokumente mit **unbestimmbarer Sichtbarkeit**, aber **bekannter Quelle** | **1** unbekannter Kontext **je Quelle** — Dokumente derselben unbekannten Quelle haben zwangsläufig dieselbe, wenn auch unbekannte Sichtbarkeit |
| Dokumente **ohne bestimmbare Quelle** | **1** unbekannter Kontext **je Dokument** (einzeln isoliert) |

Fail closed heißt hier: eine unbestimmbare Sichtbarkeit wird **nie geraten** und **nie** einem
bekannten Kontext zugeschlagen.

#### Die Telemetriegleichung

Die Zeile `[globalphase/kontext]` meldet je Lauf `kontexte`, `geteilt`, `mandatseigen`,
`unbekannt`, `dokumente` und `ohneSichtbarkeit`. `planKontexte` zählt

- `geteilt` = Kontexte mit **mehr als einem** Mandat,
- `mandatseigen` = Kontexte mit **genau einem** Mandat,
- `unbekannt` = Kontexte ohne bestimmbare Sichtbarkeit.

Ein unbekannter Kontext trägt **keine** Mandate (`signaturZuMandaten` liefert für ihn `[]`), fällt
also **weder** unter `geteilt` **noch** unter `mandatseigen`. Es gilt deshalb:

```
kontexte = geteilt + mandatseigen + unbekannt
```

Nur **wenn `unbekannt = 0` ist**, vereinfacht sich das zu `kontexte = geteilt + mandatseigen`.
Zusätzlich gilt immer `mandatseigen ≤ n`.

#### Was `1 ≤ kontexte ≤ 2n + 1` ist — und was nicht

`scripts/cron-globalphase-test.js` Prüfpunkt **8.13f** prüft diese Grenze **ausschließlich für die
vier konstruierten Simulationsprofile** (n = 1 · 2 · 6 · 11). Sie ist damit eine **Beobachtung
dieser Profilwelt**, **kein allgemeiner Vertrag** und **kein Production-Bestehenskriterium**. Der
Test selbst hält fest, dass die Zahl im allgemeinen Fall **exponentiell** sein kann: bei sechs
Mandaten sind theoretisch **bis zu 63** verschiedene bekannte, nicht leere Sichtbarkeitsmengen
möglich (2⁶ − 1) — zuzüglich unbekannter Kontexte. Ein Lauf mit mehr als 13 Kontexten ist deshalb
**nicht** allein deswegen fehlerhaft.

**Offline gemessen** (Laufzeitsimulation, §6): **1 · 3 · 10 · 15** für n = **1 · 2 · 6 · 11**; in
dieser Profilwelt kommt ab sechs Mandaten genau **ein** Kontext je zusätzlichem Mandat hinzu.
**Wie die 10 bei sechs Mandaten entsteht** — am echten Code nachgemessen, nicht gerechnet:

```
 1  alle sechs        geteilter Katalog (Drucksachen, Ausschüsse, Leitmedium)
 3  echte Teilmengen  Partei A (4 Mandate) · Regionalpresse einer Region (4) · Partei B (2)
 6  je Mandat         dessen eigene Personen-, Ausschuss-, Themen- und Regionsuchen
──  ─────────────
10  Kontexte
```

Die **10** ist und bleibt ein **Messwert der Simulationsprofilwelt** — **keine
Production-Sollzahl** und kein Erwartungswert für einen echten Lauf.

#### Das Production-Bestehenskriterium

Es prüft **Verträge, keine Zahlengrenze**. Erfüllt ist Punkt 4 der Aktivierungsvoraussetzungen,
wenn über das Beobachtungsfenster gilt:

| # | Kriterium | Woran belegt |
|---|---|---|
| 1 | **Jedes Dokument liegt genau einmal in genau einem Kontext** (Partition) | `pruefePartition`; eine Verletzung versiegelt den Datenstand als **fehlgeschlagen** |
| 2 | **Alle Dokumente eines bekannten Kontexts tragen dieselbe Sichtbarkeitsmenge** — und in einem unbekannten Kontext liegt kein Dokument mit bestimmbarer Sichtbarkeit | `pruefeAlleKontextgrenzen` |
| 3 | **Unbekannte Kontexte werden vollständig ausgewiesen und untersucht** — `unbekannt` und `ohneSichtbarkeit` stehen in der Telemetriezeile und werden benannt, nicht überlesen | `[globalphase/kontext]` |
| 4 | **Keine `kontextvertrag`-Fehler** | Fehlerliste des Laufdatensatzes |
| 5 | **Der globale Datenstand ist `abgeschlossen`** | `datenstand.status` |
| 6 | **Für alle beim Fensterstart aktiven Mandate existiert ein vollständig abgeschlossener Mandatslauf** (dynamisch ermittelt, keine feste Zahl; Stand 2026-08-04: **fünf** aktive reale Mandate) | je Mandat ein `mode: "mandat"`-Datensatz |
| 7 | **Die gemessene Kontextzahl wird berichtet** und bei auffälliger Höhe **erklärt** — sie wird **nicht** allein wegen einer Zahl (etwa 13) als falsch bewertet | `kontexte` in der Telemetriezeile |

Punkt 7 ist die bewusste Grenze dieses Kriteriums: die Kontextzahl ist eine **Beobachtungsgröße**,
kein Schwellwert. Auffällig hoch heißt „erklären", nicht „durchgefallen".

### 7.6 Der gescheiterte Kapazitätsnachweis vom 2026-08-03 — Ursache, Reparatur, offene Entscheidungen

> **Kanonisch für den Kapazitätsteil.** §7.4 beschreibt die Aktivierung, §7.5 das
> Kontextkriterium. Dieser Abschnitt beschreibt, **warum der erste reguläre Wirkungslauf am
> Kapazitätsnachweis gescheitert ist**, was dagegen gebaut wurde und was ausdrücklich **nicht**
> gebaut wurde.

**Der Befund.** Der erste reguläre schwere Lauf nach der Aktivierung
(`/api/cron/pipeline`, 2026-08-03 16:00 UTC, Lauf `cron-pipeline-20260803160002-xm71n`) meldete:

```
[cron/pipeline/globalphase] 267122ms status=teilweise quellen=181 rohdokumente=2179
                            verstanden=0 budgetGlobalMs=221674 reserveMs=48000 restMs=2552
[cron/pipeline] Zeitbudget erschoepft — 6 von 6 Mandaten NICHT verarbeitet.
```

Die globale Phase überzog ihr Budget (221,674 s) um **45,45 s** und verbrauchte damit die
Mandatsreserve (48 s) vollständig. Übrig blieben **2,552 s**; die Fairnessschleife beginnt ein
Mandat nur mit **15 s** Vorlaufreserve (`HELMUT_CRON_TENANT_RESERVE_MS`) — daher **0 von 6**.
Ein späterer regulärer Crawl lief aus demselben Grund in das äußere Zeitlimit.
`HELMUT_CRON_GLOBALABRUF` wurde danach durch den Betreiber wieder auf `off` gesetzt.

**Die Zerlegung.** Rekonstruiert aus `source_crawl_telemetry` (181 Zeilen mit
`started_at`/`finished_at`/`duration_ms`), `raw_documents.created_at`,
`document_findings.created_at`, `process_runs` und den Vercel-Runtime-Logs desselben Laufs;
alle Zeiten relativ zum Start der globalen Phase (16:00:02,895 UTC):

| Phase | Dauer | Anteil |
|---|---:|---:|
| Vorlauf (Sperre, 6 Profile, 6 Quellenpläne, Cooldown-Vorlauf) | 3,10 s | 1,2 % |
| **Quellenabruf**, 181 Quellen in 10 Stufen à 20 | **112,11 s** | 42,0 % |
| DIP (inaktiv) + `saveRawItems` + Bestandsabruf + Dedup-Plan | 5,41 s | 2,0 % |
| **`raw_documents`: 616 EINZELNE Upserts** | **89,89 s** | 33,6 % |
| `document_findings` (1 Bulk) + **`finding_count`: ~108 × (GET + PATCH)** | **34,85 s** | 13,1 % |
| Lazy-Understanding: 14 Stapel geclustert, **1 242 Cluster gebildet, 0 verarbeitet** | 15,94 s | 6,0 % |
| Eager-Understanding — übersprungen, Grund `zeitbudget` | 0,00 s | 0,0 % |
| Lauftelemetrie + 181 Quellen-Telemetriezeilen | 5,19 s | 1,9 % |
| **Summe** | **267,12 s** | |

**Hauptursache F-RT — 124,74 s (46,7 %) sind sequenzielle Einzelzeilen-Round-Trips.**
`persistRawDocumentsDeduped` schrieb **je Dokument einen eigenen Request** an PostgREST
(616 Einzel-Upserts) und erhöhte `finding_count` je Bestandstreffer mit einem **eigenen
GET plus einem eigenen PATCH** (~108 × 2). Zusammen **834 Requests à ~149,6 ms**. Derselbe
Pfad benutzt für `document_findings` in derselben Funktion längst einen Bulk-Write — die
Fähigkeit war da, sie wurde an den beiden teuren Stellen nur nicht genutzt.

**Zweitursache F-CL — 15,94 s reine Doppelarbeit.** Die Stapelschleife des
Lazy-Understanding bildete für **jeden** der 14 Kontexte erst die Cluster und prüfte **danach**
das Restbudget. Das Budget war zu diesem Zeitpunkt bereits aufgebraucht: 1 242 Cluster gebildet,
**0** verarbeitet.

**Was `CRAWLER_TIMEOUT_MS` begrenzt — und was nicht (Befund F-REQ, nachgemessen 2026-08-04).**
Der Wert (Default 7 000 ms) wird ausschließlich als `timeout` an `client.get(...)` (`fetchUrl`,
`fetchText`, `fetchPardokText`) und `client.request(...)` (`postForm`) durchgereicht. Das ist ein
Socket-Timeout **je einzelner Anfrage** — und dort ein *Inaktivitäts-*, kein Gesamtdauerlimit. Es
begrenzt **weder `crawlSource` noch eine Quelle noch eine Stufe**. Eine Google-News-Quelle löst
eine ganze Anfragenkette aus:

| Schritt | Sequenzielle Anfragen |
|---|---|
| Feedabruf je Feed-URL (`personNewsSource` hat **zwei**, sequenziell abgearbeitet) | 1, unter dem Gate zzgl. `withGoogleRetry` (bis 3 Versuche + Backoff bis 8 s bzw. 15 s) |
| `resolveEntryUrls` — Nebenläufigkeit **4 innerhalb** der Quelle, je Eintrag `resolveArticleUrl` | 1× `fetchUrl` (folgt bis zu **6** Weiterleitungen, jede eine eigene Anfrage mit eigenem Timeout) + bis zu **2×** `postForm` |
| `enrichPersonArticleImages` (nur `type: "person"`) — **vollständig sequenzielle** Schleife | je Eintrag nochmals `resolveArticleUrl` + 1× `fetchText` |

Mengengerüst je Feed: `HELMUT_GOOGLE_NEWS_MAX_ITEMS` 12, `HELMUT_PROFILE_NEWS_MAX_ITEMS` 24,
`HELMUT_PERSON_NEWS_MAX_ITEMS` **30**. Offline gemessen
(`scripts/quellen-mehrfachabruf-test.js` — echter Crawler, echtes Gate, ersetzte HTTP-Schicht):
**eine** Suchquelle mit 12 Einträgen = **37 Anfragen = 11,5 Anfragezeitlimits**; **eine**
Personenquelle (2 Feeds × 12 Einträge) = **98 Anfragen = 45,4 Anfragezeitlimits**. Production
bestätigt es: einzelne Quellen liefen **41 892 / 41 340 / 40 851 / 35 005 ms** bei
`CRAWLER_TIMEOUT_MS = 7 000` — drei davon mit `retry_count = 0`, es waren also keine
Wiederholungen, sondern die Kette selbst. **Jede Aussage, die eine Quelle oder eine Abrufstufe an
`CRAWLER_TIMEOUT_MS` bindet, ist damit widerlegt** — insbesondere die Formel
`ceil(stufenGroesse / HELMUT_GOOGLE_CONCURRENCY) × CRAWLER_TIMEOUT_MS`.

**Was NICHT die Ursache war — ausdrücklich geprüft:**

- **Der Abruf nicht.** Alle 181 Quellen wurden abgerufen (`fehler: 0`, keine Zeile
  „Abrufbudget erschoepft"). 112,11 s sind der reale Netzaufwand von 181 Abrufwegen durch das
  Google-Gate (Parallelität 5, Mindestabstand 200 ms) — die Härtung ist eine
  Sicherheitsmaßnahme aus dem Vorfall 2026-07-25 und wurde **nicht** angefasst.
  **Quellenmix gemessen statt geschätzt** (`source_crawl_telemetry` gegen `retrieval_paths`):
  **134** Katalog-Google-News-Wege + **42** profilgenerierte Google-Suchen (`personNewsSource`
  und `newsSearchSource` bauen beide `news.google.com/rss/search`) = **176 Google-Wege** und
  genau **5 direkte/amtliche** — **97,2 %**. Die fünf direkten Quellen sind im Laufprotokoll
  eindeutig wiederzufinden: sie starten sofort und enden in unter 200 ms (26 / 55 / 67 / 102 /
  155 ms). Eine frühere Annahme von „88 % Google" ist damit ersetzt.
- **Das Start-Gatter des Stufenabrufs nicht.** Die Restzeitprüfung zwischen den Abrufstufen ist
  tatsächlich nur ein *Start*-Gatter — eine begonnene Stufe läuft ungebremst zu Ende. In diesem
  Lauf hat sie aber **nie gegriffen**: der Abruf endete bei **t = 115,2 s** eines
  **221,674-s**-Budgets, `nichtAbgerufen = 0`, `fehler: 0`. Die Überziehung entstand vollständig
  danach.
- **Keine Mehrfachverarbeitung.** Die Vereinigungsmenge ist vertragsgemäß:
  `gesamt=181 gemeinsam=140 mandatseigen=41` = 6 Mandate × 7 eigene Quellen (eines mit 6) plus
  140 geteilte. `doppelteWege=3` sind bekannte, ausgewiesene strukturgleiche Wege; der
  prozessweite `sharedFetchLedger` hat sie erwartungsgemäß übersprungen (`skipped-shared`).
- **Die interne Zeitreservierung hat gerechnet, aber nicht gegriffen.** `budgetAufteilung`
  hat korrekt 221,674 s / 48 s geteilt. Zwischen dem Ende des Abrufs (t = 115 s) und der
  Versiegelung (t = 267 s) gab es jedoch **keine einzige Stelle**, an der der Lauf sein
  Restbudget geprüft hätte: Persistenz, Fundstellen, Zählerpflege und Telemetrie liefen
  unbegrenzt. Die Grenze existierte als Zahl, nicht als Riegel.

**Die Reparatur (dieser Sprint).**

1. **Bulk-Upsert der Rohdokumente.** Blockweise statt zeilenweise
   (`HELMUT_RAW_DOCUMENT_BULK_CHUNK`, Default 200). Zeilen werden nach ihrer **Spaltensignatur**
   gruppiert, statt fehlende Spalten mit `null` aufzufüllen — sonst überschriebe ein
   `merge-duplicates`-Upsert eine vorhandene Spalte eines bestehenden Dokuments mit `null`.
   Schlägt ein Block fehl, wird **genau dieser Block** einmal einzeln nachgezogen; die
   bisherige Robustheit gegen eine einzelne unbrauchbare Zeile bleibt damit erhalten.
2. **Gebündeltes UND bedingtes `finding_count`-Update.** Gruppiert nach (gelesener Stand,
   Zuwachs), ein `PATCH …&finding_count=eq.<gelesener Stand>` je Gruppe. Das ist ein echtes
   **Compare-and-Set** (CLAUDE.md §4.10): eine Zeile, die inzwischen ein anderer Lauf verändert
   hat, wird **nicht** getroffen und **nicht** überschrieben, sondern gezählt und benannt. Der
   bisherige Pfad war ein unbedingtes Lesen→Ändern→Schreiben und hätte still überschrieben.
3. **Budgetriegel vor der Clusterbildung.** Die Stapelschleife entscheidet zuerst über das
   Budget. Ein übersprungener Stapel wird mit Dokumentzahl gezählt und macht den Datenstand
   ehrlich `teilweise` (`datenstand.lazy.uebersprungeneStapel` / `…uebersprungeneDokumente`).
4. **Phasenmessung.** `[globalphase/phasen]` und `datenstand.phasen` zerlegen jeden Lauf.
   Der gescheiterte Lauf musste über vier Tabellen rekonstruiert werden; das ist einmalig.

**Gemessene Wirkung** (Offline-Kapazitätstest `scripts/globalabruf-kapazitaet-test.js`,
Production-Größenordnung 181 Quellen / 2 179 Dokumente / 6 Mandate, Production-Latenzen als
Eingabe):

| | vorher | nachher |
|---|---:|---:|
| Round-Trips des Schreibpfads | **834** | **10** |
| Persistenzphase | 130,51 s | **1,56 s** |
| globale Phase (Budget 222 s) | **263,79 s** | **197,19 s** |
| Restzeit für die Mandatsphase | 6,21 s | **72,80 s** |
| verarbeitete Mandate | **0 von 6** | **6 von 6** |
| Gesamtlauf (Limit 270 s) | am Limit | **207,10 s** |

Die globale Phase wird **nicht** um die volle Ersparnis kürzer: die gewonnene Zeit fällt dem
Verstehen zu, das im gescheiterten Lauf gar nicht mehr lief (Lazy 0 Cluster, Eager
`zeitbudget`). Genau das ist beabsichtigt — es ist fachliche Arbeit, die vorher ausfiel.

**Offene Entscheidungen — bewusst NICHT in diesem Sprint umgesetzt:**

| # | Befund | Messwert | Warum nicht hier entschieden |
|---|---|---|---|
| **E-1** | **Stufenbarriere im Abruf.** Der Abruf läuft in 10 Stufen à 20 Quellen; jede Stufe ist eine Sperre, die auf ihre langsamste Quelle wartet. Stufe 9 enthielt 200,9 s Arbeit und dauerte 53,1 s, Stufe 10 bestand aus **einer** Quelle und begann erst bei t = 99 s. | Untere Schranke bei idealer Bündelung: 391,3 s Arbeit / 5 Gate-Slots = **78,3 s**; gemessen **112,1 s**. Einsparpotenzial ≈ **34 s**. | Der Rückbau der Barriere verlangt eine Deadline **im** Crawler (`crawler.js`) — aktiver Produktionspfad, eng verzahnt mit der Google-Härtung. Nicht nötig, um den Vertrag zu erfüllen. **Die Stufe zu VERKLEINERN ist keine Option** (siehe §7.6.1). |
| **E-2** | **`HELMUT_CRAWL_MAX_CANDIDATES` wirkt je STUFE statt je LAUF.** Der Kandidatendeckel (1 000) sitzt in `crawlAllSources` und wird im globalen Pfad zehnmal angewendet. | Altpfad: **603–621** Dokumente je Lauf vom Deckel verworfen. Globaler Pfad: **0**. Der globale Pfad verarbeitet **2 140** statt ~**945** neuer Kandidaten — **2,3-fach**. | Das ist eine stille **Ausweitung**, keine Reduktion. Sie zurückzunehmen hieße, Dokumente zu verwerfen — eine Produktentscheidung, keine Reparatur. |
| **E-3** | **`datenstand.status = abgeschlossen` ist mit dem heutigen Verstehensrückstand praktisch unerreichbar.** `budgetErschoepft` wird schon wahr, wenn **ein** Lazy-Cluster zurückgestellt wurde. Bei 1 242 Clustern und 60 s Lazy-Budget bleibt immer ein Rest. | Nachher-Lauf des Kapazitätstests: `teilweise` trotz eingehaltenem Budget und 6 von 6 Mandaten. | **ENTSCHIEDEN 2026-08-04 (verbindliche Produktentscheidung), umgesetzt in §7.7:** `datenstand.status` wird **nicht** kosmetisch umgedeutet — ein ehrliches `teilweise` bleibt `teilweise`. Der Kapazitätsvertrag kann trotzdem bestehen, aber **nur**, wenn strukturierte Laufdaten beweisen, dass die **einzige** Ursache regulär zurückgestellte, **vollständig gezählte und dauerhaft vorgemerkte** Verstehensarbeit ist. Jede andere `teilweise`-Ursache fällt durch. Der fachliche Rückstand bleibt offen (**OP-14**) und gilt **nicht** als gelöst. |

### 7.6.1 Die Abrufstufe: warum „kleiner" nicht „sicherer" heißt — und was ein echtes Stopp-Gatter kostet

Am 2026-08-04 wurde geprüft, ob eine **kleinere** Abrufstufe
(`HELMUT_GLOBALPHASE_ABRUF_STUFE` 20 → 5) die Überziehung begrenzt. **Sie tut es nicht, und sie
schadet.** Drei Belege, keiner davon eine Annahme:

1. **Die Stufe war nie die wirksame Grenze.** Der Abruf endete bei t = 115,2 s eines
   221,674-s-Budgets. Das Start-Gatter hat nicht gegriffen.
2. **Die behauptete Schranke existiert nicht.** `ceil(stufenGroesse / concurrency) ×
   CRAWLER_TIMEOUT_MS` setzt voraus, dass eine Quelle eine Anfrage ist — sie ist es nicht
   (Befund F-REQ oben: 37 bzw. 98 Anfragen je Quelle, Production 41 892 ms bei 7 000 ms Limit
   und `retry_count = 0`).
3. **Kleiner ist langsamer, und zwar beweisbar.** Eine Stufe wartet auf ihre langsamste Quelle,
   also ist die **Summe der Stufenmaxima** eine Untergrenze der Abrufdauer. Beim Verfeinern der
   Aufteilung kann diese Summe nie sinken, weil `max(A ∪ B) ≤ max(A) + max(B)` gilt — das ist
   datenunabhängig. An den 181 gemessenen Quellendauern:

| Stufengröße | Stufen | Untergrenze des Abrufs | späteste direkte Quelle startet frühestens |
|---:|---:|---:|---:|
| **20 (heute)** | 10 | **71,3 s** | **9,85 s** |
| 10 | 19 | 90,2 s | 16,92 s |
| **5** | 37 | **153,0 s** | **31,53 s** |

Der letzte Punkt widerlegt zugleich die Annahme, direkte und amtliche Quellen seien von der
Stufengröße unberührt: `runGlobaleErfassung` schneidet `plan.quellen` **unabhängig vom
Quellentyp**, eine direkte Quelle in Stufe *k* kann also erst starten, wenn alle Google-Quellen
der Stufen davor fertig sind. Am laufenden Code gegengeprüft
(`scripts/quellen-mehrfachabruf-test.js` §4, echter `crawlAllSources`, echtes Gate, 181 Quellen
mit den gemessenen Kostenverhältnissen): identische Abrufmenge, Gesamtlauf nicht schneller, die
direkten Quellen sind bei Stufe 5 später fertig.

**Entscheidungsvorlage — echtes Stopp-Gatter (nicht umgesetzt, Freigabe erforderlich).**
Ein Gatter, das laufende Netzarbeit *wirklich* abbricht, ist keine Konstantenänderung. Nötig
wären: ein `AbortSignal` (oder ein Abbruchtoken) durch `crawlAllSources` → `crawlSource` →
`parseRssFeed` → `fetchText` → **`fetchUrl`** (inklusive der rekursiven Weiterleitungsschleife),
**`postForm`**, `fetchPardokText`, `resolveEntryUrls` und `enrichPersonArticleImages`; ein
`request.destroy()` je offener Anfrage; und die Zusage, dass nach der Rückkehr **keine**
Hintergrundarbeit weiterläuft (heute hält `withGoogleRetry` Backoff-Schlafzeiten, und der
Gate-Semaphor gibt Slots erst im `finally` frei). Das berührt **mehrere Netzwerkfunktionen und
Abbruchsignale** in einem aktiven Produktionspfad, der zugleich die Google-Härtung aus dem
Vorfall 2026-07-25 trägt.

| Option | Aufwand | Wirkung | Risiko |
|---|---|---|---|
| **A — nichts ändern** (heutiger Stand nach der Reparatur) | keiner | Der Abruf endete bei t = 115 s; die Überziehung lag danach und ist behoben. Reserve nach dem Fix: 72,80 s. | keins |
| **B — Deadline im Crawler, ohne Abbruch** (`crawlAllSources` startet keine *neue* Quelle mehr nach der Deadline) | klein, additiv, ein optionaler Parameter mit Default „kein Limit" | Beseitigt die Stufenbarriere (≈ 34 s) und macht das Start-Gatter feinkörnig (je Quelle statt je 20). Begrenzt eine **laufende** Quelle nicht. | gering — bestehende Aufrufer bleiben byte-gleich |
| **C — echtes Stopp-Gatter mit `AbortSignal`** | groß, quer durch 6+ Netzwerkfunktionen | Bricht auch laufende Anfragen ab. | hoch: Abbruch mitten in der Google-Auflösung, Wechselwirkung mit Retry/Breaker/Semaphor, Fehlerklassifikation ändert sich |

**Empfehlung: A jetzt, B als eigener kleiner Sprint mit eigenem Nachweis, C nur, wenn B
nachweislich nicht reicht.** C ist ausdrücklich **nicht** ohne neue Freigabe umzusetzen.

### 7.7 Der ausführbare Nachweisvertrag (E3-Entscheidung, 2026-08-04) — kanonisch

> **Kanonisch für den neuen OP-25-Production-Nachweis.** Er ersetzt jede frühere, nur in Prosa
> beschriebene Abnahme. Ausführung: `node scripts/op25-production-nachweis.js` (rein lesend,
> GET-Literal + Tabellen-Allowlist, kein Trigger, keine Flag-/Env-Änderung, 0 KI-Aufrufe);
> Bewertungskern: [`lib/helmut/op25-nachweis.js`](../../lib/helmut/op25-nachweis.js)
> (reine Logik, testgesichert über `scripts/op25-nachweis-vertrag-test.js` (207 Prüfpunkte),
> `scripts/op25-e3-dauerhaftigkeit-test.js` (52 Prüfpunkte) und
> `scripts/op25-nachweis-mutationsprobe.js` (**62 von 62 rot**)).
>
> **Stand 2026-08-04/5 (nach Merge von PR #222):** um die Befunde aller vier Reviewdurchgänge
> **und** die Nachtragskorrektur gehärtet — Kostenvertrag, identitätsgenau eingefrorene
> Mandatsmenge, dauerhafte Belegquelle samt versiegelter Laufzeit (§7.7.1) · der **echte
> Kostenleser** und die **vollständig fail-closed Startbaseline** (§7.7.2) · das
> **Erhebungsfenster der Baseline** (§7.7.3) · die strikte SHA-Normalisierung (§7.7.4) ·
> **deploymentgebundene Startbaseline + verbindlicher Commitnachweis der Fensterläufe**
> (**§7.7.5**, kanonisch für Aktivierungszeitpunkt und Betreiberablauf).

**Die verbindlichen Produktentscheidungen (2026-08-04):** **E1 bleibt Option A** (keine neue
Crawler-Deadline, kein `AbortSignal`, kein Eingriff in Gate/Retry/Breaker/Netz). **E2 bleibt
unverändert** (`HELMUT_CRAWL_MAX_CANDIDATES` wird für den Nachweis nicht angefasst; die heutige
Kandidatenmenge bleibt stabil). **E3 trennt Kapazitätsvertrag und Verstehensrückstand** — siehe
E-3-Zeile in §7.6 und die Regel unten.

**Vier eindeutige Ausgänge (= Exit-Codes des Werkzeugs):**

| Ausgang | Exit | Bedeutung |
|---|---:|---|
| `bestanden` | 0 | alle Vertragspunkte aus strukturierten Laufdaten belegt |
| `nicht_bestanden` | 1 | mindestens eine **bewiesene** Vertragsverletzung |
| `blockiert` | 2 | Beleg-/Konfigurationslücke oder ungültiges Fenster (auch: Mandatsmengen-Änderung im Fenster, Fenster vor Aktivierung, Lauf ohne `datenstandDetail`, Kosten nicht belegbar) |
| `noch_nicht_auswertbar` | 3 | kein Fenster, Fenster < 24 h oder noch nicht vollständig vergangen |

**Vorrang:** Fensterprüfung zuerst (ein Fenster unter 24 vollständig vergangenen Stunden wird
**nie** grün und nie rot); danach schlägt eine bewiesene Verletzung (`nicht_bestanden`) jede
Beleglücke (`blockiert`), diese wiederum ein „Lauf möglicherweise noch nicht versiegelt".

**Das Beobachtungsfenster** ist explizit (Start/Ende), umfasst **mindestens 24 vollständig
vergangene Stunden** und beginnt **erst nach** dem künftigen READY-Deployment **und** der
erneuten Betreiber-Aktivierung von `HELMUT_CRON_GLOBALABRUF` (Übergabe an das Werkzeug per
`--aktivierung <ISO>` / `--fenster-start` / `--fenster-ende`). **Harte Untergrenze
2026-08-04T00:00Z:** der gescheiterte Lauf vom 2026-08-03 (`cron-pipeline-20260803160002-xm71n`)
kann **niemals** in einen Erfolgsnachweis einfließen. Die aktive Mandatsmenge wird am
Fensterstart **dynamisch und identitätsgenau** eingefroren (§7.7.1 (2)) — keine hartkodierten
Mandats-IDs, keine feste Sollzahl im Vertrag (die dokumentierte Gegenprobe „fünf" ist ein
überschreibbarer Baseline-Wert, keine Namensliste); **jede** Änderung der Menge im Fenster macht
das Fenster ungültig (`blockiert`). Alte, manuelle, außerplanmäßige oder unvollständige Läufe
werden **mit Grund gezählt und ausgeschlossen**, nie als Beleg verwendet; die erwarteten Läufe
kommen aus der **wirksamen Cron-Konfiguration** (`vercel.json`: `crawl` 04:00/20:00, `pipeline`
16:00 UTC — nichts wird erfunden). Das Werkzeug unterscheidet je erwartetem Termin **fehlend ·
verdrängt · möglicherweise noch laufend · abgebrochen · Altpfad · irregulär · Beleglücke ·
Vertragsverletzung · vollständig**.

**Ein Lauf besteht den Kapazitätsvertrag nur, wenn ALLE folgenden Punkte aus persistierten,
strukturierten Daten belegt sind** (jede fehlende Zählung ist eine Beleglücke, nie ein
Freifahrtschein):

1. regulärer schwerer Cron (Laufkennung `cron-crawl-…`/`cron-pipeline-…` im ±15-min-Fenster des
   Termins), kein manueller/künstlicher Lauf;
2. globaler Pfad tatsächlich verwendet (`mode: "global"`, `buendelung: "kontext"`);
3. globale Phase innerhalb ihres Budgets — geprüft an der **versiegelten** Dauer
   (`datenstand.dauerMs ≤ datenstand.budgetMs`, §7.7.1 (3)), **nicht** am vor dem Versiegeln
   gebildeten `durationMs` — und der Gesamtlauf innerhalb des äußeren Zeitlimits (280 s +
   Schreibtoleranz; ein Abbruch-/Timeout-Vermerk im Fairness-Laufdatensatz fällt durch);
4. Quellenabruf vollständig (`nichtAbgerufen = 0`, kein `abruf`-Fehlerschritt); fehlgeschlagene
   Quellen nur als **klassifizierte** Abweichung (`errorCodes` vorhanden, `runState` nicht
   stark degradiert) — sonst durchgefallen;
5. Persistenz belegt und ohne unaufgelöste Kollision (`persistenz.ergebnis = "ok"`,
   `zaehlerVerfehlt = 0`, `newRawDocuments ≠ null`); ein leerer Datenbestand ist nie ein Erfolg;
6.–7. Partition und Kontextgrenzen korrekt (eine Verletzung versiegelt fatal — es existiert dann
   kein bestehensfähiger Laufdatensatz);
8. keine `kontextvertrag`-Fehler und überhaupt **kein** Eintrag in `fehlerSchritte`, keine
   `fehlerhafteProfile`;
9.–10. Kontexttelemetrie vorhanden, Telemetriegleichung erfüllt
   (`kontexte = geteilt + mandatseigen + unbekannt`); unbekannte Kontexte und eine auffällige
   Kontextzahl (> 2n+1 als **Aufgreifschwelle**, kein Fehlwert — §7.5) brauchen eine
   dokumentierte Erklärung, sonst durchgefallen; mit Erklärung: bestanden mit Warnung;
11.–13. für **alle beim Fensterstart aktiven** Mandate ein vollständiger Mandatslauf
   (Datensatz + versiegelter Datenstands-Vermerk desselben globalen Laufs + Matching- und
   Entscheidungsschritt nicht verschluckt); keine Mandatsmengen-Änderung im Fenster;
14. keine neue System-/Fehlerklasse (beobachtete `errorCodes` ⊆ dokumentiertes Vokabular;
   `unknown` gilt als **unbekannte** Klasse und fällt durch);
15. keine Budgetüberziehung (siehe 3);
16. keine erfundene Erfolgsmeldung bei Sperrverweigerung oder Skip (ein sperrverweigertes
   Mandat hat keinen Datensatz und fällt als fehlend auf);
17. LLM-Kosten des Fensters innerhalb des dokumentierten Rahmens (Baseline 2026-08-04:
   0,20 USD/24 h gemessen, Rahmen 2 USD, überschreibbar) — **und** die Kostendaten selbst
   belegt vollständig und brauchbar (§7.7.1 (1)); sonst `blockiert`;
18. **E3-Regel:** ein `teilweise` besteht **ausschließlich**, wenn zusätzlich zu 1–17 der
   gesamte Verstehensrückstand **vollständig gezählt** (`datenstandDetail.lazy`/`.eager`) und
   **dauerhaft** ist. Dauerhaft heißt beweisbar: **lazy komplett** (jeder Stapel erreicht, jeder
   Cluster bewertet — alle interessierten Cluster sind pending-Wissensobjekte) **oder** **eager
   komplett** (kein Stapel übersprungen, `nichtVorgemerkt = 0` — jeder zurückgestellte Cluster
   ist als pending-Wissensobjekt **mit Dokumentverknüpfung** vorgemerkt). Zurückgestellte
   Cluster **ohne** Vormerkung sind später nicht garantiert wiederauffindbar → durchgefallen.
   Die Prüfung hängt am **Rückstand**, nicht am Statuswort: auch ein `abgeschlossen` mit
   zählbarem, nicht dauerhaftem Rückstand fällt durch.

**Ein `teilweise` wegen Quellen, Persistenz, Kontext, Datenbank, Sperre, unbekannter Ursache
oder Datenverlust ergibt immer `nicht_bestanden`.** Der fachliche Verstehensrückstand
(~1 242 Cluster, Stand 2026-08-03) gehört weiterhin zu **OP-14** und wird durch ein Bestehen
des Kapazitätsvertrags **nicht** als gelöst behauptet.

**Datengrundlage (additive Telemetrie dieses Sprints — keine Migration, keine neue Tabelle,
keine Budgetänderung):** der globale Laufdatensatz trägt jetzt `datenstandDetail`
(Fehlerschritte, Persistenzbilanz inkl. CAS-Zähler, Lazy-/Eager-Bilanz inkl.
`vorgemerkt`/`nichtVorgemerkt`, Kontexttelemetrie, `buendelung`, `budgetMs`) und
`quellenVereinigung`; Mandatsläufe behalten `datenstand`-Vermerk, `globalLaufId`,
`datenstandFrisch` sowie die Matching-/Entscheidungs-Zusammenfassungen über die
`compactCrawlRunForStore`-Allowlist. Zusätzlich schreibt jede globale Phase **eine** dauerhafte
`process_runs`-Zeile (`process: "globalphase"`) mit versiegeltem Status und kompakter
Ursachenzerlegung — sie übersteht die Blob-Retention (20 Einträge) und das
Last-Write-Wins-Fenster (Befund W-2). Dabei behoben: ein **Persistenzfehler** der
Rohdokumente war zuvor **stilles Grün** (`.catch(() => null)` ohne Fehlereintrag — der Lauf
konnte als `abgeschlossen` versiegeln); er wird jetzt als Fehlerschritt `persistenz` benannt und
macht den Datenstand ehrlich `teilweise`.

**Betriebshinweis:** die Auswertung zeitnah nach Fensterende ausführen — die reichen
Laufdatensätze liegen im Blob mit Retention 20 (≈ 1–2 Tage Kadenz). Fehlt einem Fensterlauf das
`datenstandDetail` (z. B. Lauf vor dem Deployment dieses Sprints), ist das Ergebnis ehrlich
`blockiert`.

### 7.7.1 Die drei Härtungen aus der Review zu PR #222 (2026-08-04) — alle fail closed

Die Review hat drei Wege gefunden, auf denen der Vertrag **fälschlich grün** hätte werden
können. Alle drei sind geschlossen; jede Zusage ist mutationsgeprüft.

**(1) Der Kostenvertrag konnte durch kaputte Zahlen bestehen.** Geprüft wurde nur auf `null` —
und `NaN > rahmen` ist *immer* `false`, ein `NaN` wäre also ein bestandener Kostenvertrag
gewesen. Ebenso hätte eine **fehlende** Nutzungsliste im CLI wie **0,00 USD** ausgesehen.
Jetzt gilt: jeder Kostenwert muss eine **endliche, nicht negative Zahl** sein (`NaN`,
`±Infinity`, negative Werte, Zeichenketten und Wahrheitswerte fallen durch); die
**Vollständigkeit** der Kostendaten ist eine **ausdrückliche Zusage** des Lesers, keine
Annahme — fehlt `llmUsage`, ist der Auth-Store nicht lesbar, oder sitzt die Nutzungsliste an
ihrer Aufbewahrungsgrenze (5 000) mit einem ältesten Eintrag *nach* dem Fensterstart, ist das
Ergebnis `blockiert`; **nicht bepreisbare** Nutzungseinträge im Fenster werden gezählt und
blockieren, statt die Summe still zu verkleinern. Eine **belegte** 0,00 USD besteht weiterhin —
der Unterschied ist der Beleg, nicht die Zahl. *Gemeinsame Wurzel, ebenfalls geschlossen:*
`Number(null)` ist `0` und gilt als „endlich". Der Vertrag liest Zahlen deshalb überall durch
`alsZahl()`, das `null`/`undefined`/`""` strikt als **nicht vorhanden** behandelt — nie als Null.

**(2) Die Mandatsmenge war nicht wirklich eingefroren.** Das Werkzeug las bei der späteren
Auswertung den *aktuellen* Profilbestand, und `quellenVereinigung` speicherte nur die **Anzahl**.
Ein **Austausch bei gleicher Anzahl** (Mandat A raus, Mandat B rein) wäre damit unsichtbar
geblieben. Jetzt gilt ein Zwei-Schritt-Ablauf:

```
# Schritt 1 — unmittelbar NACH der Aktivierung (rein lesend gegen Production).
# Seit §7.7.5 ist --erwarteter-commit (voller Merge-Commit, 40 Hexziffern) PFLICHT,
# und die Aktivierung ist der READY-Zeitpunkt des neuen Deployments:
node scripts/op25-production-nachweis.js --aktivierung <READY-ISO> \
     --erwarteter-commit <voller-merge-commit> \
     --startbaseline-schreiben belege/op25-startbaseline.json
# Schritt 2 — frühestens 24 h später:
node scripts/op25-production-nachweis.js --aktivierung <READY-ISO> \
     --startbaseline belege/op25-startbaseline.json
```

Die **Startbaseline** hält Aktivierungszeitpunkt, exakte Mandatsmenge und einen stabilen Hash
(`m<n>-<sha256/16>`) fest. Geprüft wird **identitätsgenau** gegen: jeden einzelnen Lauf
(`quellenVereinigung.mandateIds`, neu persistiert) **und** den Endzustand am Fensterende.
Fehlt die Startbaseline, ist das Ergebnis `blockiert` — der aktuelle Bestand wird **nicht**
ersatzweise verwendet. Eine nachträglich veränderte Baseline (Liste ≠ Signatur), eine Baseline
einer fremden Aktivierung und eine erst nach dem Fensterstart erhobene Baseline blockieren
ebenfalls. Ein Lauf **ohne** Mandatskennungen (Altdatensatz) ist nicht prüfbar und blockiert.
Eine **spätere Rückkehr** zur Ursprungsmenge heilt das Fenster nicht: der abweichende Lauf
bleibt der Beleg, auch wenn der Endzustand wieder stimmt.

**(3) Die dauerhafte Belegquelle wurde behauptet, aber nicht benutzt — und die Laufzeit kam aus
der falschen Quelle.** Bewertet wurden ausschließlich `mainStore.crawlRuns` (Retention **20**),
während ein 24-h-Fenster bei fünf Mandaten bereits **18** Datensätze braucht. Jetzt gilt:

- Die `process_runs`-Zeilen `globalphase` gehen **wirklich** in die Bewertung ein (relational
  plus Auth-Store-Spiegel, dedupliziert). Sie unterscheiden zwei völlig verschiedene Fälle:
  fehlt der reiche Laufdatensatz, **existiert** aber die dauerhafte Zeile, ist das eine
  **Beleglücke** (`blockiert`, „verdrängt"), kein bewiesener Vertragsbruch; fehlen **beide**,
  ist der Termin nachweislich leer geblieben (`nicht_bestanden`).
- **Aufbewahrungsvertrag, reproduzierbar und fail closed:** benötigt werden
  `Zahl schwerer Läufe × (1 global + n Mandate)` Datensätze. Ist die Retention kleiner, ist das
  Ergebnis `blockiert` (mit der Handlungsanweisung: `HELMUT_CRAWL_RUN_RETENTION` anheben oder
  das Fenster verkürzen). Wird es knapp (heute 18 von 20), erscheint eine ausdrückliche Warnung.
  Sitzt die Ablage an ihrer Grenze und liegt ein erwarteter Termin **vor** dem ältesten
  sichtbaren Datensatz, ist er weder belegt noch widerlegt → `blockiert`.
- **Die Laufzeit stammt aus dem versiegelten Beleg.** `datenstandVermerk` trägt jetzt `dauerMs`
  (aus `datenstandVersiegeln`) und `budgetMs` (in den Datenstand hineingegeben) — Dauer und
  Grenze also aus **derselben** versiegelten Quelle. Der Laufdatensatz-Wert `durationMs` wird
  **vor** dem Versiegeln gebildet (er entsteht im `saveCrawlRun`-Aufruf, der selbst noch Teil der
  Phase ist) und unterzeichnet die Dauer systematisch; er belegt den Budgetvertrag **nicht mehr**.
  Fehlen Vermerk *und* dauerhafte Zeile, ist die Grenze nicht prüfbar → `blockiert`.
  Widersprechen sich beide Belege, wird das benannt (`nicht_bestanden`) statt einer Quelle blind
  geglaubt.

### 7.7.2 Zweiter Reviewdurchgang (2026-08-04) — der echte Leser und die Belegdatei

Der erste Härtungsdurchgang schrieb den strikten Zahlenvertrag in den Bewertungskern, ließ
aber zwei Stellen aus, an denen das Werkzeug **selbst** noch weicher war als seine Doku.

**(1) Der Kostenleser lebte im CLI und war laxer als der Vertrag.** Er benutzte
`typeof roh === "number" ? roh : Number(roh)` und deutete damit genau die Werte um, die §7.7.1
ausdrücklich als unbrauchbar führt: `"1.20"` wurde zu 1,20 USD, `true` zu 1, `false` und `null`
zu 0. Zusätzlich wurden Nutzungseinträge **ohne lesbaren Zeitstempel** stillschweigend
übersprungen — obwohl sie im Fenster liegen könnten und die Summe dann zu klein wäre.
**Jetzt** liegt der Leser als `kostenAusNutzung` im **reinen Kern** (eine einzige Umsetzung,
direkt testbar); das CLI reicht nur noch durch. Ein Kostenwert zählt **nur**, wenn er **roh
schon eine `number`** ist — endlich und nicht negativ; alles andere ist `unbepreist` und
blockiert. Ein Eintrag ohne eindeutig lesbaren `createdAt` (fehlend, `null`, leer, unparsbar,
Zahl statt Zeichenkette) macht die Kostendaten **unvollständig** ⇒ `blockiert`. Eine leere,
aber lesbare Nutzungsliste bleibt eine **belegte** 0,00 USD und besteht.

**(2) Die Startbaseline war noch nicht vollständig fail closed.** `signatur`,
`aktivierungAtMs` und `erhobenAtMs` wurden nur geprüft, **wenn** sie vorhanden waren — eine
Baseline ohne diese Felder wurde also akzeptiert. Das CLI erlaubte außerdem
`--startbaseline-schreiben` **ohne** gültige `--aktivierung` und schrieb dann `null`, und
`leseStartbaseline` enthielt mit `Number(null)` erneut dieselbe stille Umdeutung.
**Jetzt** prüft `pruefeStartbaseline` an genau einer Stelle **alle** Pflichtfelder strikt:

| Feld | Bedingung | Befund bei Verstoß |
|---|---|---|
| `mandate` | Array, nicht leer, nur nicht leere Zeichenketten, **ohne Duplikate** | `startbaseline-mandate-fehlen` / `…-ungueltig` |
| `anzahl` | vorhanden **und** gleich der Listenlänge | `startbaseline-anzahl-fehlt` / `…-widerspruch` |
| `signatur` | vorhanden **und** gleich dem berechneten Hash | `startbaseline-signatur-fehlt` / `…-passt-nicht` |
| `aktivierungAtMs` (oder ISO-Zwilling) | vorhanden **und** identisch zur bewerteten Aktivierung | `startbaseline-aktivierung-fehlt` / `…-fremde-aktivierung` |
| `erhobenAtMs` (oder ISO-Zwilling) | vorhanden **und** nicht nach dem Fensterstart (+15 min) | `startbaseline-erhebung-fehlt` / `…-zu-spaet-erhoben` |

Jeder Verstoß ergibt `blockiert`. Das CLI **verweigert** das Schreiben ohne gültigen
Aktivierungszeitpunkt (Exit 2, es entsteht keine Datei) und liest die Belegdatei **roh** ein —
ohne Ergänzung, Umdeutung oder Reparatur. Eine unlesbare oder fehlende Datei ist `blockiert`.

**Nebenbefund, mit behoben:** `deploymentCommit` wurde mit einer **Laufkennung** befüllt, was
keine Commit-Kennung ist. Der Wert stammt jetzt aus `process_runs.commit_ref` — und wird
seit §7.7.3 auch nicht mehr als Deployment-Stand *bezeichnet*.

### 7.7.3 Dritter Reviewdurchgang (2026-08-04) — Erhebungsfenster und Commit-Wahrheit

**(1) Die Startbaseline gilt nur unmittelbar nach der Aktivierung.** Die Toleranz war zuvor am
**Fensterstart** verankert. Damit wäre eine Baseline zulässig gewesen, die *lange vor* der
Aktivierung erhoben wurde — also den Bestand der Zeit **davor** zeigt — oder erst Stunden
danach. Der Bezugspunkt ist jetzt die **Aktivierung**; verbindlich gilt:

```
aktivierungAtMs ≤ erhobenAtMs ≤ aktivierungAtMs + BASELINE_TOLERANZ_MS   (15 min)
aktivierungAtMs ≤ jetzt                                                   (keine Zukunft)
```

Beide Grenzen sind **inklusiv** (Erhebung exakt zur Aktivierung und exakt an der
Toleranzgrenze bestehen). Drei Fälle sind fail closed `blockiert`:

| Fall | Befund |
|---|---|
| Baseline **vor** der Aktivierung erhoben | `startbaseline-vor-aktivierung` |
| Aktivierungszeitpunkt liegt in der **Zukunft** | `aktivierung-in-zukunft` (Gesamtbewertung, **vor** allen Fensterprüfungen) bzw. `startbaseline-aktivierung-in-zukunft` (Baselineprüfung) |
| Erhebung **später** als Aktivierung + 15 min | `startbaseline-zu-spaet-erhoben` |

Die **Schreibseite** setzt dieselben Grenzen: `--startbaseline-schreiben` verweigert eine
zukünftige Aktivierung und eine Aktivierung, die mehr als 15 min zurückliegt (Exit 2, **es
entsteht keine Datei**) — statt eine Datei zu erzeugen, die die Auswertung ohnehin ablehnen
müsste.

**(2) Kein möglicherweise veralteter Commit als Deployment-Stand.** `process_runs.commit_ref`
ist der Commit **des jüngsten gespeicherten Laufs**. Nach einem frischen Deployment, das noch
keinen Lauf erzeugt hat, ist er **veraltet** — ihn `deploymentCommit` zu nennen war eine
Behauptung über etwas, das hier nicht gemessen wird. Der Vercel-Deployment-Zustand ist aus
einer Sitzung nicht lesbar (Egress zu `api.vercel.com` gesperrt, §7.3), also wird er **nicht
geraten**. Stattdessen:

- Das Feld heißt jetzt **`zuletztBeobachteterProzessCommit`** — mit dem ausdrücklichen
  Hinweis, dass es **kein Deployment-Beleg** ist. Ein Feld `deploymentCommit` gibt es nicht
  mehr, auch nicht im `--baseline`-Querschnitt.
- Wer den Stand **belegen** will, übergibt ihn ausdrücklich: `--erwarteter-commit <sha>`.
  Er wird **strikt** gegen den beobachteten Prozess-Commit geprüft (Voll- oder Kurzform als
  echtes Präfix). Nur bei Übereinstimmung wird `deploymentCommitBestaetigt: true` gesetzt.
- Eine **Abweichung ist fail closed**: es wird nichts geschrieben (Exit 2). Entweder läuft ein
  anderer Stand, oder der erwartete hat noch keinen Lauf hinterlassen — in beiden Fällen darf
  nichts als „aktueller Deployment-Stand" festgehalten werden.
- Ohne `--erwarteter-commit` bleibt `deploymentCommitBestaetigt: false`, und das Werkzeug sagt
  das im Bericht ausdrücklich.

> **Überholt-Vermerk (2026-08-04/5, §7.7.5):** Die drei vorstehenden Punkte zur
> **Schreibzeit-Bestätigung** sind ersetzt — genau dieser Vergleich mit dem Commit des
> **jüngsten gespeicherten (alten) Laufs** verwechselte den Zeitpunkt der Env-Änderung mit
> ihrer Wirksamkeit. Heute gilt: `--erwarteter-commit` ist beim Schreiben **Pflicht** (volle
> SHA), wird dort **nicht** geprüft und erst in der **Auswertung** gegen die `commit_ref`
> aller Fensterläufe durchgesetzt. Die ehrliche Benennung `zuletztBeobachteterProzessCommit`
> gilt unverändert.

### 7.7.4 Vierter Reviewdurchgang (2026-08-04) — die Commitprüfung selbst war zu schwach

Der Befund aus §7.7.3 war richtig, seine **Umsetzung** nicht. Die Prüfung bestand nur aus
Längenvergleich und `startsWith` und **im CLI**, nicht im Bewertungskern. Beides war belegbar
falsch:

- **Angehängter Unsinn wurde bestätigt.** Beobachtet `89427c5…1085d` (gültige volle SHA),
  erwartet dieselbe SHA **plus** `-VOELLIGER-UNSINN` → `deploymentCommitBestaetigt: true`,
  weil der längere Wert mit dem kürzeren beginnt. Ebenso `…1085dzzzz` und eine **verdoppelte**
  SHA. Alle drei sind empirisch reproduziert und heute abgewiesen.
- **Die Absicherung war Textsuche.** Die Prüfpunkte suchten im Quelltext nach Zeichenketten
  statt die Funktion aufzurufen; die Mutationen betrafen nur die Zeitlogik. Eine Lockerung der
  Commitprüfung hätte die Suite nicht rot gemacht.

**Korrektur.** Die Prüfung liegt jetzt im reinen Bewertungskern (`lib/helmut/op25-nachweis.js`)
als `pruefeCommitBeleg` — genau die Funktion, die das CLI aufruft, ist damit direkt testbar.
Verbindlich gilt nach `trim` + Kleinschreibung:

```
gueltig ⇔ /^[0-9a-f]+$/  ∧  7 ≤ Länge ≤ 40
Übereinstimmung ⇔ soll = ist  ∨  soll ist ECHTES Präfix von ist  ∨  ist ist ECHTES Präfix von soll
```

„Echtes Präfix" heißt **kürzer und Anfang von** — gleich lange, aber verschiedene Werte
bestehen nicht. Ein Wert, der nach `trim` nicht dem Muster entspricht, ist **kein Commit**,
also kein Präfix von irgendetwas; angehängter Unsinn scheitert damit schon an der Formatprüfung
und nicht erst am Vergleich. Fehlende, zu kurze, zu lange und nicht hexadezimale Werte bleiben
fail closed — auf **beiden** Seiten, auch beim beobachteten Wert. Großbuchstaben und
Leerzeichen am Rand sind nach Normalisierung zulässig, weil sie denselben Commit bezeichnen.
Ein **übergebener**, aber nicht bestätigter Commit bleibt Exit 2 ohne Datei.

**Absicherung.** `scripts/op25-nachweis-vertrag-test.js` §34 ruft in 34.1–34.24 die Funktion
tatsächlich auf (die zwölf geforderten Fälle plus Normalisierungs- und Grenzfälle); die
Textsuchen sind auf 34.25–34.30 reduziert und nur noch **ergänzend**. Die Mutationsprobe deckt
die Lockerungen mit **M47–M54** ab, darunter die vier geforderten: Formatprüfung entfernt (M47),
Mindestlänge entfernt (M48), angehängter Unsinn wieder akzeptiert (M50, exakt die alte
`startsWith`-Logik), abweichender Commit wieder bestätigt (M51).

> **Überholt-Vermerk (2026-08-04/5, §7.7.5):** Die hier beschriebene **Schreibzeit-Bestätigung**
> (`pruefeCommitBeleg` gegen den zuletzt beobachteten Prozess-Commit,
> `deploymentCommitBestaetigt`, „übergebener, aber nicht bestätigter Commit bleibt Exit 2")
> ist **ersetzt**. Sie verglich den erwarteten Commit mit dem Commit des **jüngsten alten**
> Laufs — direkt nach READY existiert aber noch kein Lauf des neuen Deployments. Die strikte
> SHA-Normalisierung dieses Abschnitts (`normalisiereCommit`, `istEchtesPraefix`) gilt
> unverändert weiter; die Bestätigung selbst geschieht seit §7.7.5 ausschließlich in der
> **Auswertung** gegen die `commit_ref`-Werte der Fensterläufe.

### 7.7.5 Nachtragskorrektur (2026-08-04/5) — deploymentgebundene Startbaseline und verbindlicher Commitnachweis

**Vier belegte Lücken** (alle am unveränderten `main`-Stand `3fa8830` empirisch reproduziert,
bevor sie geschlossen wurden):

1. **Eine Startbaseline konnte ohne `--erwarteter-commit` geschrieben werden.** Das Gate im
   CLI feuerte nur, *wenn* ein erwarteter Commit übergeben war (`commitPruefung.uebergeben &&
   !bestaetigt`); ohne Übergabe entstand eine Baseline ohne jeden Deployment-Bezug.
2. **`pruefeStartbaseline` prüfte `erwarteterDeploymentCommit` und
   `deploymentCommitBestaetigt` überhaupt nicht.** Reproduziert: eine Baseline **ohne** diese
   Felder und sogar eine mit `erwarteterDeploymentCommit: "voelliger-unsinn"` **plus**
   `deploymentCommitBestaetigt: true` ergab `befunde: []` — akzeptiert.
3. **Die Gesamtauswertung prüfte die `commit_ref`-Werte der `globalphase`-Fensterläufe nie.**
   Reproduziert: ein 24-h-Fenster, in dem **alle** dauerhaften Zeilen einen **fremden** Commit
   trugen — `bestanden`; dieselben Zeilen ganz **ohne** `commit_ref` — ebenfalls `bestanden`.
4. **Zeitpunktverwechslung:** die Schreibzeit-Prüfung aus §7.7.3/§7.7.4 verglich den
   erwarteten Commit mit `process_runs.commit_ref` des **jüngsten gespeicherten** Laufs.
   Eine Vercel-Umgebungsvariable gilt aber erst in einem **neuen Deployment**, und unmittelbar
   nach dessen READY existiert noch **kein** Lauf des neuen Stands — der Vergleich traf also
   systematisch den **alten** Stand und hätte eine korrekte Baseline abgewiesen (bzw. bei
   zufälliger Übereinstimmung Falsches „bestätigt").

**Die Korrektur (kleinste robuste Fassung, alle Zusagen mutationsgeprüft):**

- **Der Aktivierungszeitpunkt ist der READY-Zeitpunkt des neuen Production-Deployments, das
  `HELMUT_CRON_GLOBALABRUF=on` tatsächlich enthält.** Das Setzen der Env allein ist **keine**
  Aktivierung.
- **`--startbaseline-schreiben` verlangt zwingend `--erwarteter-commit` mit dem vollständigen
  erwarteten Merge-Commit (40 Hexziffern).** Kurzformen, Anhänge, Nicht-Hex ⇒ Exit 2, **keine
  Datei**. Die Baseline speichert den Commit verbindlich (`erwarteterDeploymentCommit`).
- **Beim Schreiben wird ausdrücklich NICHT gegen alte Prozessläufe geprüft** — ein alter Lauf
  darf die Baseline weder blockieren noch fälschlich bestätigen. Das Feld
  `zuletztBeobachteterProzessCommit` bleibt rein informativ; ein Feld
  `deploymentCommitBestaetigt` gibt es nicht mehr, und eine Baseline, die es auf wahr trägt,
  wird als `startbaseline-commit-vorab-bestaetigt` **abgewiesen**.
- **`pruefeStartbaseline` prüft den Commit verbindlich:** fehlend ⇒
  `startbaseline-erwarteter-commit-fehlt` · ungültig/verkürzt ⇒
  `…-ungueltig` · Vorab-Bestätigung ⇒ `…-commit-vorab-bestaetigt` — alle `blockiert`.
  Optional erlaubt die Auswertung `--erwarteter-commit` als **Gegenprobe** gegen die
  Belegdatei (`startbaseline-fremder-commit` bei Abweichung).
- **Die Auswertung prüft alle zum Nachweisfenster gehörenden `globalphase`-Prozessläufe**
  (Laufstart im Fenster oder einem erwarteten Termin zugeordnet): `commit_ref` fehlt oder ist
  kein SHA-Wert ⇒ `commit-beleg-fehlt` (`blockiert`) · gültiges echtes Präfix ⇒
  `commit-beleg-unvollstaendig` (`blockiert`) · gültiger, **abweichender** Commit ⇒
  `fremder-deployment-commit` (**`nicht_bestanden`** — im Fenster lief ein anderer Stand,
  z. B. ein weiteres Deployment). Auch eine **fehlende dauerhafte Zeile** zu einem bewerteten
  Fensterlauf ist jetzt `commit-beleg-fehlt` (`blockiert`) statt nur einer Warnung.
- **Läufe vor dem Fenster (Alt-Bestand) werden weder geprüft noch als Bestätigung verwendet.**
- **Unverändert streng:** Mandatsmenge/Signatur, Aktivierungszeitpunkt, Erhebungsfenster
  (`aktivierung ≤ erhoben ≤ aktivierung + 15 min`), Fensterregeln, Kosten.

**Der verbindliche Betreiberablauf** (ersetzt die Kurzfassung in §7.7.1 (2)):

```
# Voraussetzung: Ziel-PR gemergt; vollen Merge-Commit (40 Hexziffern) notieren.
# 1. Betreiber setzt HELMUT_CRON_GLOBALABRUF=on (nur Production). Setzen allein wirkt NICHT.
# 2. Betreiber löst ein neues Production-Deployment dieses Stands aus und notiert den
#    READY-Zeitpunkt. Aktivierungszeitpunkt := READY.
# 3. Innerhalb von 15 min nach READY (rein lesend gegen Production):
node scripts/op25-production-nachweis.js --aktivierung <READY-ISO> \
     --erwarteter-commit <voller-merge-commit> \
     --startbaseline-schreiben belege/op25-startbaseline.json
# 4. Während der folgenden 24 h: KEIN weiteres Production-Deployment, keine Mandatsänderung.
# 5. Frühestens 24 h nach READY:
node scripts/op25-production-nachweis.js --aktivierung <READY-ISO> \
     --startbaseline belege/op25-startbaseline.json
#    (optional erneut --erwarteter-commit als Gegenprobe gegen die Belegdatei)
```

**Absicherung.** `scripts/op25-nachweis-vertrag-test.js` §34 (neu, 34.1–34.27 Verhaltens-
prüfungen: fehlender/verkürzter/ungültiger erwarteter Commit, Vorab-Bestätigung, Gegenprobe,
korrekter Commit in allen Fensterläufen, fehlender/ungültiger/abweichender/gemischter
`commit_ref`, Präfix-Fall, alter Lauf vor der Aktivierung, 15-min-Grenze; §32 führt
`erwarteterDeploymentCommit` als Pflichtfeld) — **207/207**. Mutationsprobe **62 von 62 rot**
(M50/M51/M53/M54 auf die neue Logik umgezogen; neu **M55–M62**: Pflichtfeld entfällt,
Kurzform akzeptiert, Vorab-Bestätigung akzeptiert, fehlender `commit_ref` blockiert nicht
mehr, alte Läufe mitgeprüft, dauerhafte Zeile wieder nur Warnung, Präfix als Bestätigung,
Gegenprobe entfällt). Production-Proben rein lesend: Dry-Run `noch_nicht_auswertbar`
(Exit 3) · Schreiben ohne Commit / mit Kurzform / mit Anhang ⇒ je **Exit 2, keine Datei** ·
voller Commit mit 2 h alter Aktivierung ⇒ **Exit 2, keine Datei** (15-min-Grenze) ·
Auswertung mit Baseline ohne Commit ⇒ **`blockiert` (Exit 2)**.

## 8 · Verbleibende Risiken

| # | Risiko | Bewertung |
|---|---|---|
| R1 | **Kein Production-Nachweis.** Alle fachlichen Aussagen sind offline erhoben. | **Unverändert offen — das einzige verbleibende Risiko dieser Liste, das eine Handlung verlangt.** Der Nachweis wurde **nicht gestartet**, es existiert **keine gültige Startbaseline**. Der aktuelle Flagzustand ist aus einer Sitzung **nicht lesbar** und damit eine **offene Betreiberprüfung** (§7.4-Vermerk); die Aktivierung selbst verlangt seit §7.7.5 ein **neues** READY-Deployment, dessen Zeitpunkt der Aktivierungszeitpunkt ist. Verschärfend: der **Rückbau ist aus einer Agenten-Sitzung nicht ausführbar** (§7.3) — zeigt ein regulärer Lauf ein Problem, muss der Betreiber zurückrollen. |
| R2 | **Die Fallfamilien sind konstruiert.** Wie oft die Muster real auftreten, ist unbekannt. | Bewusst so (Auftrag Phase 4). Die Gleichheit mit dem heutigen Pfad gilt unabhängig von der Häufigkeit. |
| R3 | **Bestandsbefund F10/Z2** — Formularvokabular verschmilzt auch heute falsch. | Nicht durch K2.1 verursacht und nicht durch K2.1 verschlimmert. Eigener Sprint, freigabepflichtig. |
| R4 | **Reihenfolgeempfindlichkeit** des strengen Regimes (F3, F7, F13). | Bestand, unverändert. K2.1 ist nicht empfindlicher als heute (4.4b). |
| R5 | **Kontextzahl** wächst mit der Mandatszahl (gemessen 15 bei elf Mandaten). | Jeder Kontext kostet einen Sperr-Roundtrip. Bei sehr vielen Mandaten wäre ein Sammelaufruf sinnvoll — das wäre K3 und ist heute nicht nötig. |
| R6 | **Kapazitätsgrenze bei elf Mandaten** — eines bleibt je Lauf übrig. | Identisch zu K1, dokumentiert, durch die Fairnessrotation abgefangen (`ceil(11/10) = 2`). |
| R7 | **Zwei Schattenpfade gleichzeitig im Code.** | Durch die Widerspruchsregel (beide Flaggen → Altpfad) und den Rückbaupfad §7.2 Stufe 3 begrenzt. |

---

## 9 · Production-Auswirkung des Bausprints (2026-07-31) — historisch

> **Historischer Abschnitt.** Er beschreibt den Sprint, der K2.1 **gebaut** hat, und gilt
> unverändert **für diesen Sprint**. Für den heutigen Zustand ist **§7.4** maßgeblich: das Flag
> ist seit dem 2026-08-03, 13:15:11 UTC in Production gesetzt.

**Keine.** Kein Flag gesetzt, keine Env geändert, kein Cron gestartet, keine Production-Daten
geschrieben, keine Migration ausgeführt, keine Cron-Zeit und kein Budget geändert, keine
Quelle aktiviert oder deaktiviert, Berlin/Brandenburg/M8/Testmandate unverändert AUS,
**0 KI-Aufrufe, 0,00 USD**.
