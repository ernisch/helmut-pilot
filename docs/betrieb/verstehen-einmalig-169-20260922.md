# Einmaliger Verstehenslauf für die 169 gespeicherten Rohdokumente — vorbereiteter Runner

**Stand:** 2026-09-22
**Status:** **vorbereitet, NICHT ausgeführt.** Kein Production-Lauf, kein Modellaufruf.
**Zugehöriger Status:** [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)

---

## 1 · Zweck und Umfang

Der Quellen-Vorlauf ist fachlich abgeschlossen (zwei scharfe Quellenläufe am 22.09.2026,
32 + 137 = **169 neue Rohdokumente**). Diese Dokumente liegen in `raw_documents` und sind noch
nicht verstanden. Dieses Dokument beschreibt den **kleinsten sicheren, einmaligen Runner**, der
genau diese 169 Dokumente durch den **unveränderten Produktionsmotor** schickt — genau einmal.

Nicht enthalten und ausdrücklich nicht Teil dieses Schritts:

- kein Quellenabruf, keine Artikelkontext-Versorgung
- keine Profiländerung, keine Profilaktivierung
- kein Briefing, keine Lage, kein Matching, keine Kommunikation
- kein fremdes `raw_document`
- keine Cron-, Environment-, Migrations- oder Aktivierungsänderung
- **kein Merge, kein Production-Lauf, kein Modellaufruf durch diesen Sprint**

## 2 · Artefakte

| Datei | Rolle |
|---|---|
| `lib/helmut/verstehen-einmalig.js` | Kern: Schutzvertrag, Klassifikation, Laufgrenzen, Einmalquittung, Lauf |
| `scripts/verstehen-einmalig-169.js` | Bedienweg: Kennungsliste, Produktionsdeps, Quittungsadapter, Plan-/Laufmodus |
| `scripts/verstehen-einmalig-test.js` | Gezielte Tests (40 Prüfungen, offline, ohne echten Modellaufruf) |
| `belege/verstehen-169-ids.json` | **Vorhanden**: die gebundene Kennungsliste samt unabhängiger Production-Prüfung (§3) |

## 3 · Die 169er-Bindung und der verifizierte Hash

Der Runner bindet **nicht nur den Hash, sondern die exakte Liste** der 169 Dokumentkennungen.
Die Liste liegt als versionierter Beleg (`belege/verstehen-169-ids.json`) und trägt selbst
Commit, Anzahl und Hash; der Kern vergleicht sie zusätzlich gegen die fest eingeschriebenen
Werte:

| Wert | Fest eingeschrieben |
|---|---|
| Production Commit | `ea84f26ccc380e22961335926e2d4e585cee2308` |
| Dokumentanzahl | `169` |
| Dokument-ID-Hash | `5f3878409cc9dbe742a3c9b465e54fff53b3e7622065f90c04915eb01ac2aed9` |
| Clusterzahl | `122` |
| Cluster-Größenverteilung | `110×1 · 5×2 · 2×3 · 1×4 · 2×8 · 1×11 · 1×12` |
| Modellaufruf-Kandidaten (Obergrenze) | `113` |
| Laufdeckel Kosten | `0,80 USD` |
| Laufzeitlimit | `35 min` |
| Aufruftyp | `understanding-rueckstand` (bestehende, nicht priorisierte Klasse) |
| Quittungsschlüssel | `verstehen169-20260922-a` |

Der Hash ist genau das Verfahren aus dem Auftrag: **Kennungen alphabetisch sortieren, mit `"\n"`
verbinden, SHA256.** `V.idsHash()` setzt es wörtlich um und wird dagegen geprüft.

**Belegter Stand (2026-09-22):** Die Kennungsliste liegt als
[`belege/verstehen-169-ids.json`](../../belege/verstehen-169-ids.json) im Repository
(SHA256 der Datei `237c482a9dd4d6e4ce1ad4ec313571ecfb0a756888a939059f80becbd1a7fa86`) und wurde
unabhängig **rein lesend in Production** geprüft:

| Prüfung | Wert |
|---|---|
| Dokumente am UTC-Tag 2026-09-22 über `created_at` | 169 |
| Dokumente am UTC-Tag 2026-09-22 über `retrieved_at` | 169 |
| erzeugte und abgerufene Menge identisch | ja (`created_only 0`, `retrieved_only 0`) |
| eindeutige Kennungen | 169 |
| eindeutige `content_hash`-Werte | 169 |
| Hash der erzeugten Menge | `5f387840…a2ed9` |
| Hash der abgerufenen Menge | `5f387840…a2ed9` |

Die Datei trägt diese Prüfung selbst (`productionReadOnlyVerification`) und wird zusätzlich
gegen die fest eingeschriebenen Werte geprüft: Anzahl, Commit, Hash und — wenn der Prüfblock
vorhanden ist — auch dessen Zählwerte und beide Hashes. Eine Abweichung stoppt fail closed
(`verstehen-liste-pruefbeleg-abweichend`); ein fehlender, leerer oder unlesbarer Beleg
stoppt mit `verstehen-ids-liste-fehlt` bzw. `verstehen-ids-liste-unbrauchbar`.

**Der Runner wurde nicht scharf ausgeführt.** Der **rein lesende Planlauf** lief in der Codespace-Shell
des Betreibers und endete **fail closed** an `verstehen-kandidaten-ueber-deckel`: 169 Dokumente,
169er Kennungsmenge, ID-Hash exakt, 122 Cluster, Größen exakt
`110×1 · 5×2 · 2×3 · 1×4 · 2×8 · 1×11 · 1×12`, danach Stopp vor jeder Wirkung.

## 3a · Abbruchdiagnose (nur meldend, ab 2026-09-22)

Bricht der Schutzvertrag ab, gibt `fuehreAus` die von `pruefeUndPlane` **bereits berechneten**
Werte mit aus: `modellaufrufeKandidaten`, `clusterArten` und `clusterDiagnose`. Die Diagnose je
Cluster trägt ausschließlich `vorgangId`, `art`, `kandidat`, `resolution`, `begruendung` — keine
Titel, keine Auszüge, keine Modelltexte.

Für Cluster der Klasse `neu` trägt sie zusätzlich `spuren`: die von `resolveVorgang` **bereits
berechneten** Prüfspuren je Kandidat, reduziert auf `vorgangId`, `gleich`, `grund` (leer, wenn
kein Kandidat geprüft wurde). Bewusst **nicht** übernommen werden die übrigen Felder der Rohspur
(Kernanker, Wortformen, geprüfte Dokumentkennungen, Überdeckung) — sie sind aus Titeln abgeleitet
und gehören nicht in eine Meldung. `resolveVorgang`, `sameVorgang`, `candidatePrefixes` und
`neueErkenntnisse` sind **unverändert**; es wird ausschließlich der vorhandene Rückgabewert
weitergegeben und projiziert.

Das ist **ausschließlich Meldung**: `ok`, `schutzvertrag` und `ausgeloest` bleiben falsch, es
wird kein Cluster verarbeitet, kein Modell aufgerufen und keine Quittung beansprucht. Die
113er-Grenze, 0,80 USD, 35 Minuten und der 4-USD-Tagesriegel sind unverändert.

## 3b · Resolver-Korrektur im Motor (2026-09-22)

**Anlass (belegt durch den Planlauf):** mehrere Cluster wurden als `neu` klassifiziert, obwohl ein
Knowledge Object mit **exakt derselben** `deriveVorgangId`-Kennung bereits existierte — unter
anderem `vg-unterschriften-20210212-f1fc37` (bestehend, `pending`),
`vg-studierendenwerk-20260306-1739d7`, `vg-zeitarbeit-20230320-04da1b` (beide `complete`),
`vg-profitieren-20251017-03ed5b`, `vg-sommerpause-20260824-fd5644`,
`vg-warburger-20200515-4b0e00`-Reihe (alle `pending`). Die Diagnose zeigte bei diesen Clustern
acht **andere** Kandidaten — der exakte Bestand wurde gar nicht geprüft.

**Ursache (am Code belegt):** `storage.listKnowledgeObjectsByVorgangPrefix` liefert EIN globales
Fenster von `MAX_VORGANG_KANDIDATEN = 8` Zeilen, `order=updated_at.desc`, über **alle** Präfixe
**gemeinsam**. Ein thematisch verwandter, frisch aktualisierter Vorgang kann damit einen exakt
passenden älteren Vorgang aus dem Fenster drängen. Folge: `resolveVorgang` findet keinen Beleg,
`belegt.has(vorschlag)` ist falsch und der Cluster endet als `neu` — mit einer `vorgangId`, die
**bereits vergeben ist**. Der folgende Schreibpfad hätte auf dieselbe Kennung geschrieben.

**Die generische Reparatur** (in `resolveVorgang`, `lib/helmut/understanding.js`):

1. Der exakte Kandidat `vorgang_id === deriveVorgangId(cluster)` wird über den **bestehenden**
   Leser `deps.getExisting` immer gelesen (derselbe Weg, der vorher nur die Rückfallebene war).
2. Er wird dem Kandidatensatz **vorangestellt**; der Kandidatensatz wird über `vorgang_id`
   **dedupliziert** und bleibt **hart auf 8 begrenzt**.
3. Die Sortierung stellt ihn **voran** — nur die ersten `MAX_KANDIDATEN_MIT_BELEG = 5` Kandidaten
   werden mit Dokumentbeleg geprüft, der exakte darf nicht am Belegbudget scheitern.
4. Jeder Kandidat durchläuft **unverändertes** `sameVorgang`. Die Kennung ist und bleibt ein
   Vorschlag: sie verschafft nur einen Platz im Fenster, sie ersetzt **keine** fachliche Prüfung.

**Warum das keine zweite Fachlogik ist:** es wird kein neuer Vergleich, keine neue Ähnlichkeit und
keine neue Schwelle eingeführt. `sameVorgang`, `candidatePrefixes` und `neueErkenntnisse` sind
byte-unverändert; das Fenster wird nicht vergrößert. Die Reparatur stellt ausschließlich die
**Vollständigkeit des Eingangs** der bestehenden Prüfung her.

**Bewusster, benannter Preis:** liegt der exakte Kandidat außerhalb des Fensters, verdrängt er
nun den **ältesten** der acht Präfix-Kandidaten. Das Fenster bleibt bei 8 Kandidaten und 5
Beleglesungen — keine unbegrenzte Suche.

**Residualrisiko:** `deps.getExisting` liefert bei einem Lesefehler `null` (unverändertes
Bestandsverhalten). Dann greift exakt das Verhalten vor der Reparatur — nie schlechter, aber
ohne den exakten Kandidaten.

**Nicht behauptet:** dass der Übergang `74 → 75 neu` (und damit 113 → 114) ausschließlich durch
diesen Fehler entstand. Belegt ist der Fehler als solcher; der Nachweis, **welcher** der `neu`
Cluster der frühere `bestand-ohne-beleg`-Fall war, steht noch aus (§3a liefert dafür die Spuren).

## 4 · Der Schutzvertrag (fail closed, vor dem ersten möglichen Modellaufruf)

| Nr. | Prüfung | Abbruchgrund |
|---|---|---|
| S1 | Production Commit exakt gebunden | `verstehen-commit-abweichend` |
| S2 | exakt 169 gebundene Kennungen, keine Doppelte | `verstehen-ids-anzahl-abweichend` |
| S3 | Hash der sortierten Kennungen exakt | `verstehen-ids-hash-abweichend` |
| S8 | kein Dokument außerhalb der Liste | `verstehen-fremdes-dokument` |
| S9 | geladene Menge ist genau die gebundene Liste (nichts fehlt/doppelt/kennungslos) | `verstehen-dokumentanzahl-abweichend`, `verstehen-dokument-fehlt`, `verstehen-dokument-ohne-kennung`, `verstehen-dokument-doppelt` |
| S10 | die Produktionsabbildung erhält jede Kennung | `verstehen-idabbildung-abweichend` |
| S4 | Dedup-Ergebnis exakt 169 | `verstehen-dedup-abweichend` |
| S5 | Clusterzahl exakt 122 | `verstehen-cluster-abweichend` |
| S6 | Größenverteilung exakt + Clusterung ist eine Partition | `verstehen-clustergroessen-abweichend`, `verstehen-cluster-nicht-partition` |
| S7 | Kandidaten höchstens 113 | `verstehen-kandidaten-ueber-deckel` |

Weniger als 113 Kandidaten ist ausdrücklich erlaubt. Mehr als 113 stoppt **vor** jedem
Modellaufruf.

## 5 · Wie die 122 Cluster geprüft werden

Die Clusterung ist **die bestehende Produktionslogik**, nicht eine Nachbildung:

1. Die geladenen Zeilen laufen durch `dedupeRawDocuments(raw.map(toRawDocumentRow))` — genau die
   Abbildung, die auch der Warteschlangen- und Batchpfad benutzt.
2. Darauf `clusterRawDocuments()` aus `lib/helmut/vorgang-identity.js`.
3. Geprüft wird nicht nur die **Anzahl 122**, sondern zusätzlich die **vollständige
   Größenverteilung** und die **Partitionseigenschaft** (Summe der Clusterdokumente = 169).
   Damit ist nicht nur „122 irgendwie" belegt, sondern die belegte Struktur selbst.

Die Cluster werden deterministisch geordnet (`deriveVorgangId`, dann sortierte Dokumentkennungen),
damit Plan und Lauf dieselbe Reihenfolge sehen und die Reihenfolge nicht von der
Ankunftsreihenfolge abhängt.

## 6 · Wie höchstens 113 Modellaufrufe garantiert werden

Zwei unabhängige Riegel mit derselben Zahl:

1. **Plan-Gate (S7):** Die Klassifikation läuft **rein lesend** über die echten Funktionen
   `resolveVorgang` + `neueErkenntnisse` + `isTerminalUnderstandingStatus` und spiegelt exakt den
   Entscheidungskopf von `understandOneCluster`. Mehr als 113 Kandidaten ⇒ sofortiger Stopp.
2. **Laufdeckel:** Vor **jedem** Cluster wird geprüft, ob bereits 113 Aufrufe begonnen wurden.
   Ein Cluster kostet höchstens einen Aufruf (CAS-At-most-once), also gilt für den gesamten Lauf
   Aufrufe ≤ 113 — unabhängig davon, ob der Plan die Zahl exakt getroffen hat.

Die Klassifikation zählt den Fall „bereits verstanden, alle Dokumente bekannt" **konservativ als
Kandidat** (der Motor kann dort wegen einer offenen Update-Vormerkung begrenzt wieder aufnehmen).
Damit ist der Plan eine **Obergrenze**: kleiner werden darf die spätere Zahl, nie größer.

Zusätzlich unabhängig wirksam: **Kostendeckel** (0,80 USD, geprüft vor jedem Cluster; ohne
bestätigten Preis startet gar nichts) und **Zeitdeckel** (35 min absolute Deadline über die
bestehende Restzeitwache, die zusätzlich im Motor selbst dreifach greift).

## 7 · Wie bestehende Knowledge Objects wiederverwendet werden

Für jeden bestehenden Vorgang läuft **dieselbe** Produktionskandidatensuche und Belegprüfung:
`candidatePrefixes()` → `findVorgangCandidates()` → `listVorgangDocuments()` →
`sameVorgang()` (Kern gegen Kern). `neueErkenntnisse()` entscheidet weiterhin, ob ein
`complete`-Vorgang wirklich einen Aktualisierungsaufruf braucht. Der bestehende
`merged`-Pfad bei fehlendem ausreichendem Altbeleg (`bestand-ohne-beleg`) bleibt erhalten und
erzeugt **keinen** Modellaufruf. Der Test beweist beides mit dem echten Motor: `merged` kostet
0 Aufrufe, ein `update` genau 1.

## 8 · Wie CAS und Fencing wiederverwendet werden

Der Lauf geht ausschließlich durch `understandOneCluster` mit den echten
`understanding.defaultDeps()`:

- **CAS:** `deps.verstehenVertrag()` → die unveränderte Fabrik in
  `lib/helmut/verstehen-vertrag.js` (je Cluster ein eigener Besitzer). Vor dem Lauf wird
  erzwungen, dass der Vertrag aktiv ist (`verstehen-cas-erforderlich`) — ohne ihn gäbe es keine
  At-most-once-Zusage.
- **Fencing:** Der Fencing-Wert aus `reserviere` trägt durch `modellstart`, `schreibrecht` und
  `speichere`. Eine abgelehnte Fencing-/Lease-Prüfung verhindert den Modellaufruf.
- **Vorgangswache + globales Schloss:** Das globale Understanding-Schloss
  (`acquireGlobalUnderstandingLock`) wird für den Lauf gehalten — keine parallele zweite
  Verarbeitung desselben Vorgangs.
- **Budget-Gate:** `deps.canSpend` (der bestehende `canSpendLlm`) plus die bestehende
  Budget-Boden-Vorprüfung `vorabBodenPruefung`.

Der Test protokolliert die Aufrufreihenfolge und beweist sie:
`claimRun → reserviere → modellstart → requestUnderstanding → schreibrecht → speichere`,
mit identischem Fencing-Wert in allen drei Vertragsschritten.

## 9 · Unbekannter Modellausgang

Ein Ausgang `ausgang === "unbekannt"` (bezahlter Aufruf ohne belegtes Ergebnis) beendet den
**gesamten** Runner: kein nächster Cluster, kein automatischer Retry desselben Clusters. Der
Motor vermerkt ihn als sichtbar blockiert (`verstehenAusgangUnbekannt`), **nicht** als Freigabe.
Die bestehende Kostenreserve des unbekannten Aufrufs (Production-Stand 22.09.2026: **0,212 USD**,
Aufruf `2026-09-22T11:33:37.964Z`, `understanding-rueckstand`, `gpt-5-mini`, `ECONNRESET`) bleibt
vollständig gebunden und wird **nicht** gelöscht, **nicht** zurückgesetzt, **nicht** als 0 USD
behandelt und **nicht** automatisch wiederholt.

## 10 · Einmalquittung

Vor dem ersten möglichen Modellaufruf wird eine Zeile in der **bestehenden** `helmut_store`-Ablage
per CAS beansprucht (`verstehen169-20260922-a`) — dieselbe Bauart wie die Quittung des
Quellen-Vorlaufs, keine neue Tabelle, keine Migration. Die Quittung trägt:

`version · quittungsschluessel · commit · dokumente · idHash · cluster · maxModellaufrufe ·
maxUsd · maxMs · runId · gestartetAm · status · beendetAm · modellaufrufe ·
modellaufrufeKandidaten · laufMaxModellaufrufe · bilanz · automatischeWiederholung`

Sie wird **immer** terminal abgeschlossen — auch bei Abbruch oder unbekanntem Ausgang
(`abgeschlossen` / `gestoppt` / `unbekannt`). Ein zweiter Lauf desselben gebundenen Auftrags
findet die Zeile und stoppt mit `verstehen-bereits-verwendet`, **ohne** einen Modellaufruf. Auch
ein abgebrochener oder unbekannter Ausgang wird damit nicht still wiederholbar.

## 11 · Kosten und Betriebsgrenzen

| Grenze | Wert | Herkunft |
|---|---|---|
| Modellaufrufe dieses Laufs | ≤ 113 | Auftrag |
| Kosten dieses Laufs | ≤ 0,80 USD | Auftrag |
| Laufzeit | ≤ 35 min | Auftrag |
| Aufruftyp | `understanding-rueckstand` | bestehende, nicht priorisierte Budgetklasse |
| Globaler Tagesriegel | **4 USD/UTC-Tag unverändert** | nicht berührt |
| Tagesdeckel/Reserven | **unverändert** | nicht berührt |

Der Kostenrahmen ist mit den belegten Produktionswerten konsistent (gemessen: 0,189405 USD für
36 Aufrufe ≈ 0,00526 USD je Aufruf; 113 × 0,00526 ≈ 0,59 USD < 0,80 USD). **Ohne bestätigten
Preis je Aufruf** (`HELMUT_VERSTEHEN_169_PREIS_USD`) startet kein bezahlter Lauf
(`verstehen-preis-fehlt`) — „fehlt der Preis, fehlt die Zahl".

## 12 · Bedienung

```sh
# Rein lesende Planung (Bindung, Dedup, Cluster, Kandidaten) — kein Modellaufruf:
node scripts/lokal.js -- node scripts/verstehen-einmalig-169.js

# Scharfer Lauf (eigene Freigabe erforderlich, bestätigendes Wort):
HELMUT_VERSTEHEN_169_COMMIT=<commit> \
HELMUT_VERSTEHEN_169_LISTE=belege/verstehen-169-ids.json \
HELMUT_VERSTEHEN_169_PREIS_USD=<preis> \
HELMUT_VERSTEHEN_169_SCHARF=1 \
HELMUT_VERSTEHEN_169_BESTAETIGT=EINMALIGER_VERSTEHENSLAUF_169_RUHDOKUMENTE_BESTAETIGT \
  node scripts/lokal.js -- node scripts/verstehen-einmalig-169.js
```

Der Commit wird **nicht** aus dem laufenden Prozess geraten, sondern ausdrücklich übergeben
(`verstehen-commit-fehlt` sonst): eine selbst erratene Bindung wäre keine Bindung.

## 13 · Gezielte Tests

`node scripts/lokal.js -- node scripts/verstehen-einmalig-test.js` — **65 von 65 grün**,
offline, ausschließlich mit Attrappen für Datenbank, Netz und Modell. Abgedeckt sind alle
zwanzig Pflichtprüfungen des Auftrags (§1–§20), die Vertragsfälle S1/S6/S9/S10
(Commit, Größenverteilung, Lesefehler, Kennungsabbildung), die Auftragswerte selbst, die
**echte 169er-Bindung** (169 eindeutige Kennungen, exakter Hash, Beleg wird von Bedienweg und
Kern akzeptiert; falscher Hash, veränderter Prüfbeleg sowie 168 und 170 Kennungen bleiben fail
closed), die **Abbruchdiagnose** (§21) und die **Resolver-Spuren** (§22). Der Prüflauf erzeugt
**keinen** echten Modellaufruf und **keinen** Production-Schreibzugriff.

`node scripts/lokal.js -- node scripts/vorgangs-resolver-exakt-test.js` — **12 von 12 Assertions
grün** für die Resolver-Korrektur (§3b): der exakte Kandidat wird auch bei acht neueren
Präfix-Kandidaten geprüft und **bleibt durch `sameVorgang` geprüft** (ein fachlich falscher
exakter Kandidat wird weiterhin abgelehnt und blockiert dann seine Kennung statt überschrieben zu
werden); ohne exakten Kandidaten ist das Verhalten unverändert (acht Kandidaten, gleiche
Reihenfolge); keine Dopplung; Fenster hart auf 8; `pending` wird als `pending-erst` erkannt;
`complete` läuft durch die bestehende `neueErkenntnisse`-Logik; 0 Modellaufrufe, 0
Schreibzugriffe, Belegbudget ≤ 5.

Zusätzlich grün: die betroffenen **Bestandssuiten** des Resolver-Bereichs —
`vorgangs-resolver` 54/54, `vorgangsidentitaet` 67/67, `vorgangs-beweisfamilien` 108/108,
`vorgangs-uebernahme-analyse` 35/35, `herausgeber-identitaet` 109/109,
`vorgangsbildung-verlust`, `vorgangskontext`, `verstehen-cas-vertrag`,
`verstehen-wiederaufnahme` 47/47, `verstehen-rueckstand` 69/69, `verstehen-drain-bilanz` 47/47,
`verstehen-restzeit` 52/52, `ereignisbindung-heute` 8/8, `lage` 141/141,
`understanding-konkurrenz`, `understanding-priorisierung` 9/9,
`understanding-ebenen-konsistenz` 8/8, `understanding-aussagen-fristen` 6/6,
`understanding-mandatsneutral` 5/5, `cron-globalphase`, `globalphase-buendelung`.

> **Anmerkung zur Prüfbindung:** Die festgeschriebenen Zahlen (169/122/113) lassen sich mit
> synthetischen Dokumenten nicht reproduzieren. Die Mechanik wird deshalb mit einer
> **Prüfbindung** geprüft, die der Kern nur mit dem ausdrücklichen Marker `pruefmodus: true`
> annimmt; ohne Marker wirft er (`verstehen-erwartung-nur-im-pruefmodus`). Ein abgeschwächter
> Wert ist in Produktion damit nicht erreichbar. Die echten Auftragswerte werden daneben
> wörtlich geprüft.

## 14 · Was dieser Sprint ausdrücklich NICHT behauptet

- kein Production-Lauf des Verstehens
- kein Modellaufruf
- kein Quellenabruf
- kein Profilwrite
- kein Merge, kein Deployment
- **keine** bestandene 169er-Fachabnahme und **kein** 500er-Nachweis

Der nächste Schritt ist eine Betreiberentscheidung: den Planlauf gegen die **belegte** Liste
bestätigen (rein lesend, ohne Modellaufruf) — und erst danach gesondert über einen scharfen Lauf
entscheiden. Der Beleg selbst ist vollständig; es fehlt keine Kennung mehr.
