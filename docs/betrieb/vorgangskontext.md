# OP-25 K2.1 — Globaler Abruf, kontextgebundene Vorgangsbildung

**Kanonische Dokumentation des K2.1-Pfads.** Stand: **2026-08-03** (§7.4: Aktivierung ergänzt).
Zustand: **gemergt, deployt und seit 2026-08-03, 13:15:11 UTC in Production AKTIVIERT** —
`HELMUT_CRON_GLOBALABRUF=on`, ausschließlich in der Production-Umgebung.
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
| 4 | Rein lesender Production-Nachweis über mindestens 24 h: `mode: "global"`-Laufdatensatz vorhanden, `datenstand.status = abgeschlossen`, je Mandat ein vollständig abgeschlossener `mode: "mandat"`-Datensatz, **die sieben Vertragskriterien aus §7.5** (Partition · Kontextgrenze · unbekannte Kontexte ausgewiesen · keine `kontextvertrag`-Fehler · Datenstand abgeschlossen · alle sechs Mandate fertig · Kontextzahl berichtet und bei Auffälligkeit erklärt) | **OFFEN — der einzige noch offene Punkt des Nachweises**, §7.4 |
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
reguläre Kadenz, rein lesend: je Lauf ein `mode: "global"`-Laufdatensatz · `datenstand.status =
abgeschlossen` · für **alle sechs** Mandate ein vollständig abgeschlossener
`mode: "mandat"`-Datensatz · die **sieben Vertragskriterien** aus **§7.5** (Partition ·
Kontextgrenze · unbekannte Kontexte vollständig ausgewiesen und untersucht · **keine**
`kontextvertrag`-Fehler · Datenstand `abgeschlossen` · alle Mandate fertig · Kontextzahl berichtet
und bei auffälliger Höhe erklärt) · keine neue Fehlerklasse · LLM-Kosten unverändert. **Eine
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
| 6 | **Für alle sechs aktiven Mandate existiert ein vollständig abgeschlossener Mandatslauf** | je Mandat ein `mode: "mandat"`-Datensatz |
| 7 | **Die gemessene Kontextzahl wird berichtet** und bei auffälliger Höhe **erklärt** — sie wird **nicht** allein wegen einer Zahl (etwa 13) als falsch bewertet | `kontexte` in der Telemetriezeile |

Punkt 7 ist die bewusste Grenze dieses Kriteriums: die Kontextzahl ist eine **Beobachtungsgröße**,
kein Schwellwert. Auffällig hoch heißt „erklären", nicht „durchgefallen".

## 8 · Verbleibende Risiken

| # | Risiko | Bewertung |
|---|---|---|
| R1 | **Kein Production-Nachweis.** Alle fachlichen Aussagen sind offline erhoben. | **Unverändert offen — und seit dem 2026-08-03 das einzige verbleibende Risiko dieser Liste, das eine Handlung verlangt.** Das Flag ist seit 13:15:11 UTC gesetzt, der Pfad läuft also scharf, **bevor** er in Production nachgewiesen ist; der Nachweis über ≥ 24 h ist der nächste Schritt (§7.4/§7.5). Verschärfend: der **Rückbau ist aus einer Agenten-Sitzung nicht ausführbar** (§7.3) — zeigt ein regulärer Lauf ein Problem, muss der Betreiber zurückrollen. |
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
