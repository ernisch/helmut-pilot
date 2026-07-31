# OP-25 K1/K2 — Globale Erfassung und mandatsbezogene Projektion

**Kanonische Dokumentation des Schattenpfads.** Stand: **2026-07-31** (K2 ergänzt: §8a).
Zustand: **im Repository umgesetzt, offline bewiesen, in Production NICHT aktiviert.**
**K2-Ergebnis: Befund K1-1 bleibt bestehen und ist breiter als in §8 beschrieben — §8a.**

> **Flaggrenze, verbindlich:** `HELMUT_CRON_GLOBALPHASE` ist **Default AUS**. Ohne
> ausdrücklich gesetzten Wert (`on`/`true`/`1`/`an`) läuft ausschließlich der bisherige
> Pfad. Das Flag ist **nicht** über `helmut-flags.json` setzbar — nur über die Vercel-Env,
> also nur durch den Betreiber. **Es ist heute nicht gesetzt. Der Pfad ist in Production
> ohne Wirkung.**

Verwandte Dokumente: [`cron-fairness.md`](cron-fairness.md) (Rotation, `ceil(n/k)`,
Telemetrie bei Zeitüberschreitung) · [`../datenmotor-restliste.md`](../datenmotor-restliste.md)
(OP-25, Befund B5).

---

## 1 · Worum es geht, in einfachen Worten

Helmut sammelt jede Nacht politische Nachrichten und amtliche Vorgänge ein und rechnet
danach für jedes Mandat aus, was davon für dieses Mandat wichtig ist.

Das Einsammeln ist für alle Mandate **dieselbe Arbeit**. Trotzdem hat Helmut es bisher
**für jedes Mandat noch einmal** gestartet. Das erste Mandat verbrauchte damit fast das
gesamte Zeitfenster; das zweite wurde mitten in der Arbeit abgeschnitten, der Rest kam gar
nicht mehr dran. Die im Juli gebaute Fairnessrotation verteilte diesen Rückstand gerecht —
sie machte den Topf aber nicht größer.

K1 dreht die Reihenfolge um: **einmal einsammeln, danach für jedes Mandat nur noch
ausrechnen.** Das Ausrechnen dauert je Mandat gut eine Sekunde. Damit passen alle Mandate
in einen einzigen Lauf.

**Heute ändert sich nichts.** Der neue Weg liegt hinter einem Schalter, der ausgeschaltet
ist. Ihn einzuschalten ist eine Freigabeentscheidung des Betreibers, keine Codeentscheidung.

---

## 2 · Was vorher falsch war (Bestandsprüfung gegen `main`)

`lib/helmut/scheduler.js` → `runSourceCrawl(mandat)` führt je Mandat aus:

| # | Schritt | tatsächlich | Beleg |
|---|---|---|---|
| 1 | Sperre `crawl-<mandat>` | **mandatsbezogen** | `scheduler.js:223` |
| 2 | Profil laden | **mandatsbezogen** | `scheduler.js:246` |
| 3 | Quellenplan bilden (`getSourcesForProfile`) | **profilabhängig** | `scheduler.js:838` |
| 4 | Quellen abrufen (`crawlAllSources`) | **global** (geteilte Wege werden bereits prozessweit entdoppelt) | `scheduler.js:277`, `google-news-hardening.js:179` |
| 5 | Rohitems speichern (`saveRawItems`) | **global**, mandantenneutral | `scheduler.js:318` |
| 6 | Rohdokumente (`raw_documents`) | **global**, mandantenneutral (keine `user_id`) | `scheduler.js:192–218` |
| 7 | Lazy-Understanding | **global** — prüft je Cluster **alle** Profile | `scheduler.js:328–352` |
| 8 | Eager-Understanding | **global**, eigene globale Sperre | `understanding.js:1186` |
| 9 | Matching (`runMatchingShadow`) | **mandatsbezogen** | `scheduler.js:412` |
| 10 | Entscheidungen (`runDecisionShadow`) | **mandatsbezogen** | `scheduler.js:423` |
| 11 | Lauftelemetrie (`saveCrawlRun`) | mandatsbeschriftet, inhaltlich global | `scheduler.js:467` |
| 12 | Quellen-Telemetrie | lauf-, nicht mandatsbezogen | `scheduler.js:519–540` |

**Die Ausgangsthese ist damit bestätigt, aber zu grob:** die Schritte 4–8 sind global; die
Wiederholung ist jedoch nicht vollständig teuer. Das prozessweite Gedächtnis geteilter
Abrufwege (`sharedFetchLedger`, Incident 2026-07-25) überspringt für spätere Mandate bereits
die gemeinsamen Google-Wege, und ein bereits verstandener Vorgang kostet keinen zweiten
KI-Aufruf. Was jedes Mandat **doch** noch einmal zahlt:

- seinen eigenen Quellenplan (Katalog- bzw. Planauflösung),
- den Abruf seiner **eigenen** Wege (Personensuche, Partei, Ausschuss, Region),
- Speichern und globale Deduplizierung seiner Ergebnisse,
- Clustern und Lazy-Understanding über **seinen** Ausschnitt,
- einen Eager-Understanding-Durchgang mit eigenem 90-s-Budget,
- Lauf- und Quellen-Telemetrie.

Production-Beleg für die Folge (rein lesend, 2026-07-29 bis 07-31): *„der erste Mandant
eines Laufs verbraucht rund vier der viereinhalb Minuten, der zweite wird angefangen und
abgeschnitten, der Rest startet nie"* — belegt über drei Crawl-Sperren ohne zugehörigen
`matching_run`. Gemessene Kapazität bei sechs Mandaten: `crawl` und `pipeline` **2 begonnen /
1 erfolgreich** je Lauf, `lage-check` **1**, nur das leichte `morning-briefing` erreicht alle
sechs ([`cron-fairness.md`](cron-fairness.md) §10.5).

**Was NICHT falsch war und deshalb unangetastet bleibt:** die Fairnessrotation, die
Mandatssperre, die Zeitbudgets, die Cron-Zeiten, die Kostendeckel, die Quellenauswahl je
Profil und die Landesmodulsperre.

---

## 3 · Der Architekturvertrag

### 3.1 Globale Phase — höchstens **einmal** je regulärem Lauf

1. aktive Mandate auflösen (`tenant-context.resolveCronTenants`, unverändert)
2. Profile laden, **in der Fairnessreihenfolge** (`cron-fairness.planTenantOrder`)
3. je Profil den Quellenplan mit der **unveränderten** `getSourcesForProfile` bilden
4. **Vereinigungsmenge** bilden (§4)
5. Quellen abrufen — gleiches Gate, gleicher Cooldown, gleiches Gedächtnis geteilter Wege
6. DIP: Abruf ist global (prozessweit zwischengespeichert), der **Filter** ist profilabhängig
   → Vereinigung über alle Profile, entdoppelt nach Dokumentkennung
7. Rohitems speichern, Rohdokumente global deduplizieren
8. Lazy-Understanding (unverändert global)
9. Eager-Understanding mit **unverändertem** Budget (90 000 ms)
10. **eine** globale Lauftelemetrie (`mode: "global"`, `politicianId: null`) + Quellen-Telemetrie
11. **Datenstand versiegeln**

### 3.2 Mandatsphase — danach je aktivem Mandat

1. Sperre `crawl-<mandat>` erwerben — **unverändert** in Name, Laufzeit und Rückgabewert
2. `mandatsphaseBereit(datenstand)` — **harter Riegel**, wirft bei unversiegeltem oder
   fehlgeschlagenem Datenstand
3. Profil laden
4. Matching gegen den versiegelten globalen Datenstand
5. Entscheidungen erzeugen
6. Mandatstelemetrie (`mode: "mandat"`) **mit** Datenstandsvermerk
7. Fehler je Mandat isoliert (unverändert in der Fairnessschleife)

### 3.3 Bewusst **nicht** verschoben — und warum

Der Sprintauftrag nennt „Lage- und Briefing-Projektion" als mögliche Schritte der
Mandatsphase. Gegen `main` geprüft: **`runSourceCrawl` erzeugt beide heute nicht.** Die
Lage-Projektion entsteht im eigenen Cron `/api/cron/lage-check` (10:00 UTC), das Briefing in
`/api/cron/morning-briefing` (05:00 UTC) — beide mit eigenem Zeitbudget und eigener
Fairnessrotation. Sie in die Mandatsphase zu ziehen wäre eine **Erweiterung des sichtbaren
Verhaltens**, keine Trennung. K1 lässt sie deshalb unangetastet.

Ebenfalls nicht verschoben: die **Quellenplanbildung**. Sie ist profilabhängig und bleibt es;
die globale Phase ruft dieselbe Funktion je Profil auf und vereinigt nur das Ergebnis.

---

## 4 · Die Vereinigungsmenge — der kritischste Teil

**Regel:** Vereinigung = die Pläne aller aktiven Profile, hintereinandergehängt in der
Fairnessreihenfolge, entdoppelt nach **Quellenkennung**, erstes Auftreten gewinnt.

Daraus folgt strukturell:

> Vereinigung = ⋃ (heutige Profilpläne) **und** Vereinigung ⊆ ⋃ (heutige Profilpläne)

Es kann also **kein Weg entstehen**, den nicht mindestens ein aktives Profil schon heute
erhielte — und **keiner verschwinden**. Insbesondere:

| Anforderung | wie sie erfüllt ist |
|---|---|
| jede mandatsindividuelle Personenquelle bleibt | Kennung `<mandats-id>-news` ist je Mandat eigenständig, kann nicht kollidieren |
| parteispezifische Wege bleiben | stehen im Plan jedes passenden Profils, werden als *gemeinsam* erkannt |
| ausschussspezifische Wege bleiben | Kennung `<mandats-id>-news-ausschuss-themen`, mandatseigen |
| Landesquellen bleiben gesperrt | die Sperre wirkt **vor** der Vereinigung (`landesmodulQuelleGesperrt`, `planQuellenFuerProfil`); die Vereinigung hebt nichts nach |
| Berlin / Brandenburg bleiben bei **0** aktiven Landeswegen | im Vertragstest **mit** einem Berliner und einem Brandenburger Landtagsprofil gegen das **echte** Seed-Modell geprüft |
| manuelle Wege bleiben manuell | stehen schon im Profilplan nicht drin |
| deaktivierte Wege bleiben deaktiviert | dito (`active: false`, `status = paused`) |
| ein fehlerhaftes Profil bricht nichts | wird benannt, übersprungen; alle anderen bleiben versorgt; der Datenstand meldet **teilweise** |

### 4.1 Reihenfolge — ehrlich benannt

Die naive Erwartung „jeder Profilplan bleibt vollständige Teilfolge der Vereinigung" ist
**nachweislich falsch** und wird nicht behauptet: ein **geteilter** Weg steht für ein
späteres Profil früher, weil ihn ein früheres Profil eingebracht hat. Bewiesen wird, was
tatsächlich gilt:

- die relative Reihenfolge der **mandatseigenen** Wege bleibt je Profil exakt erhalten,
- das **erste** Profil der Fairnessreihenfolge steht vollständig und unverändert vorn,
- die Reihenfolge ist genau „erstes Auftreten in der Profilreihenfolge" (unabhängig nachgerechnet),
- eine andere Profilreihenfolge ändert **nur die Reihenfolge, nicht die Menge**.

**Warum das fachlich folgenlos ist:** `crawlAllSources` kennt **keine** Deadline — es ruft
jede aktive Quelle des Plans ab. Die Reihenfolge entscheidet also nicht darüber, *welche*
Quelle abgerufen wird, sondern nur, in welcher Reihenfolge Gate-Slots vergeben werden. Und
weil die Profilreihenfolge die **Fairnessreihenfolge** ist, kommt bei Störungen das Mandat
zuerst, das am längsten wartet.

### 4.2 Strukturgleiche Abrufwege unter verschiedenen Kennungen

Zwei Mandate derselben Partei erzeugen dieselbe Suchanfrage unter zwei Kennungen. Diese
Einträge werden **nicht** zusammengelegt — das wäre eine stille Änderung der
Telemetrieschlüsselung. Sie werden **gezählt und ausgewiesen** (`doppelteAbrufwege`); dass
ein solcher Weg trotzdem nur **einmal abgerufen** wird, garantiert unverändert das
prozessweite Gedächtnis. Beides wird getrennt geprüft.

---

## 5 · Der Datenstandsvertrag

Ein Datenstand entsteht **offen** und wird **genau einmal** versiegelt.

| Zustand | Bedeutung | projizierbar? | gilt als frisch? |
|---|---|---|---|
| `offen` | die globale Phase läuft noch | **nein** (Riegel wirft) | nein |
| `abgeschlossen` | alle geplanten Schritte fertig, keine Fehler | ja | **ja** |
| `teilweise` | versiegelt, aber Budgetabbruch oder Teilfehler | ja | **nein** |
| `fehlgeschlagen` | Erfassung gescheitert | **nein** (Riegel wirft) | nein |

Daraus folgen zwei Zusagen, die im Test einzeln verankert sind:

1. **Kein Matching vor Abschluss der globalen Phase.** `mandatsphaseBereit` *wirft* — kein
   stiller Fehlschlag, der zu einer Projektion auf unfertigen Daten führen könnte.
2. **Ein fehlgeschlagener globaler Lauf erzeugt keine Projektion**, die anschließend als
   frisch gilt. Die Mandatsphase startet dann gar nicht; stattdessen entsteht ein sichtbarer
   `systemError` und der Lauf meldet `ohneFortschritt`.

Ein `teilweise` markierter Datenstand liefert weiterhin Ergebnisse — aber jede
Mandatstelemetrie trägt `datenstandFrisch: false`. Kein falsches Grün (`CLAUDE.md` §4.4).

---

## 6 · Budget — es wird **geteilt**, nicht erhöht

Unverändert: inneres Zeitlimit **270 000 ms**, äußeres **280 000 ms**, Funktionslimit
**300 s**, Erfassungsbudget `HELMUT_CRAWL_GESAMTBUDGET_MS` **240 000 ms**, Verstehensbudget
**90 000 ms**, Vormerkbudget **60 000 ms**, alle Cron-Zeiten.

```
globalMs = min( 240 000 , Restzeit − n × 8 000 )   , mindestens  0,5 × Restzeit
Rest     = Restzeit − globalMs   → Mandatsphase, über die unveränderte Fairnessschleife
```

- `HELMUT_CRON_PROJEKTION_MS` (Default **8 000 ms**) ist die Reserve **je Mandat**. Production
  gemessen: ein Matchinglauf dauert **1 041 ms** bzw. **1 074 ms** — die Reserve ist ein
  Vielfaches des gemessenen Bedarfs.
- Die **Untergrenze von 50 %** verhindert, dass eine wachsende Mandatszahl die Datenerfassung
  aushungert.
- Die Mandatsphase prüft ihre eigene Reserve je Mandat weiterhin selbst
  (`HELMUT_CRON_TENANT_RESERVE_MS`, 15 000 ms) — unverändert.

---

## 7 · Kapazität

### 7.1 Gemessen (offline, deterministische Laufzeitsimulation)

`scripts/cron-globalphase-test.js` Abschnitt 8 fährt **beide** Pfade mit demselben
Produktionscode, denselben Profilen, demselben Quellenkatalog, derselben Uhr und demselben
Kostenmodell. Gezählt wird nicht die Buchführung, sondern was **wirklich im 270-s-Fenster
fertig** wurde — die Fairnessschleife prüft die Restzeit nur **vor** dem Beginn eines
Mandats (Start-Gatter, R-6), ein spät begonnenes Mandat überzieht sonst unbemerkt.

Zwei Kostenmodelle, klar getrennt:

- **optimistisch** (Standard der Suite): perfektes Gedächtnis geteilter Wege, billige
  Wiederholung. Auch der alte Pfad schafft dort alle Mandate — der Unterschied ist der
  **Zeitbedarf**, nicht Erfolg/Misserfolg.
- **Production-kalibriert**: der Abrufanteil ist so gesetzt, dass die globale Erfassung die
  in Production gemessenen ~156 s Crawl erreicht. Dort erreicht der **alte** Pfad nicht mehr
  alle Mandate im Fenster, der neue schon.

Die konkreten Zahlen stehen im Testprotokoll (`INFO`-Zeilen) und im Pull Request — sie
werden hier bewusst **nicht** dupliziert, damit es keine zweite, veraltende Fassung gibt.

### 7.2 Gerechnet (Modell, **keine** Messung)

Mit den Production-Eingangswerten (globale Arbeit ≈ 240 s, Projektion ≈ 1,65 s, Reserve 15 s,
Fenster 270 s):

| n | alter Pfad | neuer Pfad | Bemerkung |
|---|---|---|---|
| 6 | **1 von 6** | **6 von 6** | ein Lauf genügt, `ceil(n/k) = 1` |
| 11 | **1 von 11** | **10 von 11** | **die ehrliche Grenze von K1** |

**Bei elf Mandaten bleibt je Lauf ein Mandat übrig.** Es kommt im nächsten Lauf dran
(Fairnessrotation, `ceil(11/10) = 2`). Wird die globale Phase auf ~200 s gedrückt, reicht
ein Lauf auch für elf. Das ist die Zahl, an der sich entscheidet, ob später zusätzlich
**K3** nötig wird (§10).

---

## 8 · Der eine unvermeidbare Unterschied — Befund **K1-1**

Die Vorgangsbildung arbeitet auf dem **Batch**, nicht auf dem Gesamtbestand:
`clusterRawDocuments` gruppiert die Dokumente **eines** Understanding-Laufs, und
`deriveVorgangId` hängt am Inhalt des entstandenen Clusters. Wer anders bündelt, erhält eine
andere Vorgangskennung.

Mit den echten Produktionsfunktionen gemessen (zwei Dokumente **eines** Vorgangs, die über
den amtlichen Weg und über die Personensuche eines Mandats kommen):

| Bündelung | Cluster | Vorgangskennung |
|---|---|---|
| **global** (K1) | **1** | `vg-pflegereform-20260730-4e3451` |
| **mandatsweise** (heute) | **2** | `…-10fb35` und `…-e2f855` |

**Bewertung — nicht „erwartbar", sondern geprüft:**

1. Alle drei Kennungen teilen dasselbe **Suchpräfix** (`candidatePrefixes`). Der Resolver
   findet den bereits angelegten Vorgang.
2. `sameVorgang` hält die beiden getrennten Cluster für **denselben** Vorgang. Der alte Pfad
   legt also **keinen** zweiten Vorgang an — er legt zuerst einen **Teilvorgang** an und
   ergänzt ihn später (zweiter KI-Aufruf, Aktualisierungspfad).
3. **Kein Dokument geht verloren** — beide Bündelungen enthalten beide Dokumente.
4. Die globale Bündelung braucht für denselben Vorgang **höchstens so viele** KI-Aufrufe wie
   die mandatsweise, nie mehr.

**Was trotzdem bleibt:** der **Suffix der Vorgangskennung** kann sich unterscheiden, und der
Vorgang entsteht sofort vollständig statt in zwei Schritten. Beides ist schon heute nicht
stabil — welches Mandat welchen Ausschnitt einsammelt, hängt an der Rotation und am
Gedächtnis geteilter Wege.

> **Nachtrag K2 (2026-07-31): die obige Bewertung ist zu eng.** Sie stimmt für den hier
> gemessenen Fall, gilt aber **nicht allgemein**. Punkt 1 (gemeinsames Suchpräfix) trifft in
> anderen Fällen nachweislich **nicht** zu, und der Satz „die globale Bündelung ist die
> kanonisch richtige" ist **nicht belegt** — er wurde in §8a widerlegt. Die vier Zusagen
> „kein Dokument verloren", „kein zweiter Vorgang je Dokument", „keine Mehrkosten" und
> „Resolver bleibt anschlussfähig" gelten weiterhin und sind jetzt einzeln bewiesen.

---

## 8a · **K2-Ergebnis: K1-1 bleibt bestehen und ist breiter als beschrieben**

**Kanonische Nachweise:** `scripts/globalphase-buendelung-test.js` (56/56) und
`scripts/globalphase-buendelung-mutationsprobe.js` (15/15 rot). Beide fahren den **echten**
Produktionscode (`clusterRawDocuments`, `deriveVorgangId`, `candidatePrefixes`, `sameVorgang`,
`resolveVorgang`, `understandOneCluster`, Schemaprüfung) gegen dreizehn konstruierte
Fallfamilien; nur der KI-Aufruf ist ein Testdouble.

### 8a.1 Die Ursache: zwei verschiedene Regime

Helmut entscheidet „gehört zusammen" an **zwei** Stellen — mit **sehr** unterschiedlicher
Strenge:

| | **loses Regime** — innerhalb eines Batches | **strenges Regime** — zwischen Batches/Läufen |
|---|---|---|
| Wer entscheidet | `clusterRawDocuments` → `docsShareEvent` | `resolveVorgang` → `candidatePrefixes` **und** `sameVorgang` |
| Kriterium | **eine einzige** paarweise Kante, **transitiv** wirksam (A~B, B~C ⇒ ein Vorgang) | gemeinsame **Themenwurzel** als Suchpräfix, danach **Kern gegen Kern** |
| Wirkung | verbindet leicht | trennt schnell — oft schon, weil kein Kandidat gefunden wird |

**Die globale Bündelung verschiebt eine große Dokumentmenge vom strengen ins lose Regime.**
Betroffen ist genau das, was heute in **getrennten** Batches liegt: Dokumente
**mandatseigener** Quellen — Personen-, Partei- und Ausschussquellen. Nach der K1-Messung
sind das **58 von 196** Wegen der Vereinigung bei acht Profilen. Dokumente **geteilter**
Quellen sind nicht betroffen: sie liegen schon heute vollständig im Batch des **ersten**
Mandats (globale Rohdokument-Entdoppelung) — im Test belegt (3.2).

Der unbequeme Teil, ebenfalls gemessen (Test 7.4): in genau den Fällen, die der alte Pfad
heute trennt, würde `sameVorgang` sie **zusammenführen**. Der heutige Schutz ist also **nicht**
der Belegvergleich, sondern die **Enge der Präfixsuche**.

### 8a.2 Drei Teilbefunde, jeder einzeln belegt

| Teilbefund | Was passiert | Beleg |
|---|---|---|
| **K1-1a — Zusammenführung** | Fachlich **verschiedene** Vorgänge landen global in **einem** Vorgang. Ursache: Formular-/Floskelvokabular („Antrag", „Drucksache", „Fraktion", „beantragt", „betrifft", „Abgeordnete", „besucht", „Anhörung", „Sachverständigen", „Tagesordnung") trägt heute volles Beweisgewicht | Test 6.1/6.2, Familien **F9** (zwei MdB, zwei Ereignisse), **F11** (zwei Parteien, zwei Themen), **F4** (zwei Drucksachen) |
| **K1-1b — Trennung** | Die Kernanker-Nachprüfung in `clusterRawDocuments` ist **nicht monoton**: ein größerer Batch kann ein Dokument aus seiner bisherigen Gruppe **herauslösen**. Die globale Bündelung **trennt** damit auch, was mandatsweise **ein** Vorgang war | Test 4.2/6.4, Familie **F13** (`m1+m2` → `m1` allein, `m2` wandert zum größeren Cluster) |
| **K1-1c — Kette** | `x~y` und `y~z` bei `x!~z`: global entsteht **ein** Vorgang aus drei Dokumenten. Heute verhindert die Batchgrenze das, sobald `z` einem anderen Mandat gehört | Test 1.3/6.3, Familie **F12** |

**Bilanz über die dreizehn Familien:** sechs Familien zeigen eine abweichende Gruppierung —
**eine** fachlich besser (F7: zwei Parteiquellen zur **selben** Debatte werden korrekt
zusammengeführt), **vier** fachlich schlechter (F4, F9, F11, F12), **eine** nur anders (F13).
Und eine ehrliche Gegenprobe: **F10** (zwei verschiedene Ausschüsse, gleiches Formular)
verschmilzt in **beiden** Pfaden. **Der Fehler ist also Bestand — K1 macht ihn nur breiter
wirksam.**

### 8a.3 Was trotzdem gilt — die bewiesenen Garantien

| Zusage | Beleg |
|---|---|
| **Kein Dokument geht verloren** — `clusterRawDocuments` ist eine Partition, auch bei feindlichen Eingaben (leer, ohne Zeitangabe, nur Jahreszahlen, nur Füllwörter) | 2.1–2.3, 5.7 |
| **Jedes Dokument bekommt in beiden Pfaden genau eine Verknüpfung** (Verknüpfungsinvariante) | 2.4 |
| **Kein Dokument hängt an zwei Vorgängen, keine doppelten Vorgänge** | 2.5, 4.6 |
| **Kein Wissensobjekt verschwindet** — jeder Cluster führt zu einem Vorgang | 4.5 |
| **Keine Mehrkosten** — die globale Bündelung braucht in keiner Familie mehr KI-Aufrufe (gemessen: 24 → 14) | 4.7, 4.7b |
| **Mandantentrennung unverändert** — Wissensobjekte tragen keinen Mandantenbezug | 4.8 |
| **Kennungsformat und Resolver-Anschluss bleiben** (`vg-<wurzel>-<tag>-<prüfsumme>`, Präfixsuche findet sie) | 4.9, 4.10 |
| **Reihenfolgeunabhängig** — 120 Dokumentpermutationen, Quellenreihenfolge auf/ab, Mandatsreihenfolge vor/zurück: identische Bündelung | 5.1–5.3 |
| **Sicherheitsventil greift** — 90 zusammenhängende Dokumente ergeben nie einen Cluster über `MAX_CLUSTER_DOKUMENTE` | 5.9 |

Ein **Nebenbefund zugunsten von K1**: der **alte** Pfad ist von der **Mandatsreihenfolge**
abhängig (Familien F3, F7, F13 — Test 5.4), der neue in keiner Familie. „Heute ist es stabil"
stimmt also nicht.

### 8a.4 Fachliche Bewertung — was das für Lage, Briefing und Entscheidungen heißt

Technisch ist nichts verloren. **Fachlich schon:** ein verschmolzener Vorgang ist **ein**
Wissensobjekt mit **einer** Überschrift, **einer** Empfehlung und **einer** Entscheidung. Bei
Familie F9 entstehen aus **zwei** politischen Vorgängen genau **ein** Wissensobjekt (Test 6.8)
— beide Dokumente hängen daran (6.9), aber der zweite Vorgang hat danach keine eigene
Entscheidung mehr. Das ist genau die Fehlerklasse **„Digest-Cluster"**, die als **F-3** schon
einmal einen Production-Rückrollfall verursacht hat (Betriebsbefund B4).

Der schärfste Fall sind **Personenquellen**: sie sind je Mandat eigenständig
(`<mandats-id>-news`) und treffen heute nie aufeinander. Global tun sie es. **Kein
Datenschutz- oder Mandantentrennungsproblem** — der Rohkorpus und die Wissensobjekte sind
schon heute mandantenneutral, es kommt kein Datum hinzu, das nicht schon gespeichert würde.
Aber die **Vorgangsidentität** eines Mandats kann von der Personenquelle eines anderen
Mandats mitbestimmt werden, und das ist eine sichtbare Nutzerwirkung.

**Skalierung:** die Zahl der erstmals gegeneinander bewerteten Dokumentpaare wächst
**quadratisch** mit der Mandatszahl. Die Bündelung wird mit mehr Mandaten nicht stabiler,
sondern anders (Test 5.10).

**Bewertung, ehrlich:** **fachlich noch nicht akzeptabel** — nicht wegen eines Verlusts,
sondern wegen des Verlusts an **Entscheidungsschärfe** in einem Produkt, dessen Kernversprechen
„Entscheidungen statt Daten" ist (`START_HERE.md` §5.1). Die Aktivierung sollte deshalb
**nicht** allein auf Kapazitätsgewinn gestützt werden.

### 8a.5 Optionen für eine spätere Aktivierung (nicht umgesetzt, Entscheidung offen)

| # | Option | Wirkung | Preis |
|---|---|---|---|
| **M1** | **Bündelung je Herkunftsmandat behalten**, nur den **Abruf** global machen | K1-1 entfällt vollständig — die Vorgangsbildung bleibt exakt die heutige | Der Kapazitätsgewinn bleibt fast ganz erhalten: er stammt aus dem Abruf (**1 162 → 196** Wege). Kosten: mehr Understanding-Batches, also wieder die heutige Zahl KI-Aufrufe (kein Regress, aber kein Gewinn) |
| **M2** | **Formularvokabular nachschärfen** — eine rein **aufgezählte** Wortliste in `GENERISCHE_ANKER`, im Stil der bestehenden Hotfixes B4-3/B4-4 (keine Stammwortlogik) | **Gemessen** (Test 8.3, 32 Wörter): korrekte Trennung **7/12 → 11/12**, und **kein** fachlich zusammengehöriger Fall wird auseinandergerissen (8.4). Wirkt auch im **alten** Pfad, verbessert also heute schon | Ändert die **aktive** Vorgangsbildung **sofort und ohne Flag** → freigabepflichtig (`CLAUDE.md` §5), eigener Sprint mit eigenem Production-Nachweis. **In diesem Sprint bewusst nicht umgesetzt** |
| **M3** | **Global bündeln und akzeptieren** | Kanonisch „ein Vorgang = ein Wissensobjekt" — aber nur dort, wo `docsShareEvent` recht hat | Nimmt K1-1a/b/c in Kauf; nach 8a.4 nicht empfohlen, solange M2 offen ist |
| **M4** | Höheres Beweisgewicht **nur** für Kanten über Mandatsgrenzen | zielgenau | Neue geratene Schwelle, zweiter Identitätsbegriff — **verworfen**, widerspricht der Leitentscheidung von `vorgang-identity.js` |

**Empfohlene Reihenfolge:** erst **M2** (verbessert beide Pfade und ist einzeln nachweisbar),
danach K1-1 erneut messen, **dann** über die Aktivierung entscheiden. **Bis dahin bleibt
`HELMUT_CRON_GLOBALPHASE` AUS.**

---

## 9 · Was K1 ausdrücklich **nicht** tut

- kein bestehender Cron wird umgestellt (`vercel.json` unverändert, im Test verankert)
- keine Production-Variable gesetzt, kein Flag scharf geschaltet
- keine Migration, kein Backfill, kein Production-Schreibzugriff
- keine aktive Quelle verändert, keine Bundestagsquelle angefasst
- Berlin **AUS**, Brandenburg **AUS**, M8 **AUS**, die fünf weiteren Testmandate **AUS**
- kein Zeitbudget erhöht, keine Cron-Frequenz verändert
- **keine Warteschlange, keine zusätzliche Infrastruktur, keine neue laufende Kostenquelle**
- keine bestehende Sperre geschwächt (die globale Sperre kommt **zusätzlich**)
- **0 KI-Aufrufe, 0,00 USD** durch diesen Sprint

---

## 10 · Was für K2 nötig wäre — und ob K3 wahrscheinlich wird

> **Stand nach K2 (2026-07-31):** Punkt 1 ist **bearbeitet, aber nicht erledigt** — K1-1 ist
> jetzt vollständig bewertet (§8a) und **bleibt bestehen**. Die Entscheidung darüber (Optionen
> §8a.5) steht beim Betreiber aus; bis dahin bleibt das Flag AUS. Die Punkte 2–5 sind
> unverändert offen.

**K2 (Aktivierung, freigabepflichtig)** braucht mindestens:

1. eine Betreiberentscheidung zu **Befund K1-1** (§8/§8a),
2. eine Aktivierung **nur** über die Vercel-Env, mit sofortigem Rückweg (Variable auf `off`),
3. einen rein lesenden Production-Nachweis über mindestens 24 h reguläre Kadenz:
   `[cron/*/globalphase]`-Zeile je Lauf, Datenstand `abgeschlossen`, `k = n`,
   `obergrenzeLaeufe = 1`, keine neue Fehlerklasse, LLM-Kosten unverändert,
4. eine Gegenprobe, dass die Mandatstelemetrie den Datenstand korrekt trägt
   (`datenstandFrisch` false bei `teilweise`),
5. Rückbau der bewusst in Kauf genommenen Doppelung der Orchestrierung
   (`runSourceCrawl` vs. globale Phase) **nach** dem Nachweis, nicht davor.

**K3 wird wahrscheinlich nötig, sobald mehr als zehn Mandate aktiv sind** (§7.2): die globale
Phase belegt heute den Großteil des 270-s-Fensters, die Restzeit trägt ~10 Projektionen.
Ansatzpunkte, alle außerhalb von K1: kürzere Google-Timeouts (**OP-15**), eine
Erfassungsstufe außerhalb des 300-s-Fensters, oder Parallelisierung des Abrufs. Solange
höchstens sechs Mandate aktiv sind, reicht K1 nach dem Modell aus.

---

## 11 · Offene Risiken

| # | Risiko | Bewertung |
|---|---|---|
| R1 | **Befund K1-1** (§8/§8a) verändert **nicht nur Kennungen, sondern die Dokumentpartition** — in beide Richtungen (K1-1a Zusammenführung, K1-1b Trennung, K1-1c Kette) | **Nach K2 vollständig bewertet und bestehend geblieben.** Kein Datenverlust, keine Mehrkosten, keine Mandantentrennungsfrage — aber Verlust an Entscheidungsschärfe (§8a.4). Freigabefrage, ohne Flag ohne Wirkung. Optionen in §8a.5, empfohlen: erst **M2** |
| R2 | Die globale Phase ist ein **einzelner Engpass**: fällt sie aus, ruht der ganze Lauf | bewusst so — eine Projektion auf gescheiterter Erfassung wäre schlimmer. Sichtbar als `systemError` + `ohneFortschritt` |
| R3 | Der globale Crawl-Lauf (`mode: "global"`, `politicianId: null`) erscheint in Admin-Ansichten, die den letzten Lauf zeigen | nur bei aktivem Flag; `mode: "global"` hält ihn ausdrücklich aus der Cooldown-Logik des Altpfads heraus |
| R4 | Die Orchestrierung liegt vorübergehend **doppelt** vor | bewusst: der Altpfad darf für diesen Sprint nicht angefasst werden. Rückbau in K2 |
| R5 | **Beobachtung K1-2 (Bestandsverhalten, nicht von K1 eingeführt):** ist die Restzeit aufgebraucht, wird `eagerBudgetMs` zu `0` — und `0` bedeutet in `runUnderstandingShadow` „**kein** Limit" statt „keine Zeit". Das gilt in `runSourceCrawl` seit je und wurde in der globalen Phase **identisch** übernommen, damit beide Pfade gleich rechnen | eigener kleiner Sprint; hier bewusst **nicht** verändert, weil jede Korrektur den Altpfad verändern würde |

---

## 12 · Rückweg

Das Flag ist nicht gesetzt — es gibt nichts zurückzudrehen. Wäre es gesetzt:
`HELMUT_CRON_GLOBALPHASE` in der Vercel-Env auf `off` (oder Variable löschen), Redeploy. Der
Altpfad läuft danach unverändert weiter; es gibt keinen Datenstand, der zurückgedreht werden
müsste — die globale Phase schreibt ausschließlich in den ohnehin mandantenneutralen
Rohkorpus und einen zusätzlichen Telemetriedatensatz.
