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
| `scripts/verstehen-einmalig-test.js` | Gezielte Tests (116 Prüfungen, offline, ohne echten Modellaufruf) |
| `belege/verstehen-169-ids.json` | **Vorhanden**: die gebundene Kennungsliste samt unabhängiger Production-Prüfung (§3) |

## 3 · Die 169er-Bindung und der verifizierte Hash

Der Runner bindet **nicht nur den Hash, sondern die exakte Liste** der 169 Dokumentkennungen.
Die Liste liegt als versionierter Beleg (`belege/verstehen-169-ids.json`) und trägt selbst
Commit, Anzahl und Hash; der Kern vergleicht sie zusätzlich gegen die fest eingeschriebenen
Werte:

| Wert | Fest eingeschrieben |
|---|---|
| Dokument-Snapshot-Commit (der Datensatz) | `ea84f26ccc380e22961335926e2d4e585cee2308` |
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

## 3c · Bestandslesefehler fail closed (2026-09-22)

**Anlass (belegt):** während des erfolgreichen Planlaufs erschien
`[v3Store] listKoDocuments fehlgeschlagen: fetch failed` — der Plan lief trotzdem mit `ok: true`
weiter. Ursache: `storage.listKoDocuments` fing den Lesefehler und lieferte `[]`; damit war ein
echter Bestandslesefehler **fachlich nicht von einer gültigen leeren Liste unterscheidbar**.
`resolveVorgang` und `sameVorgang` entschieden dadurch auf unvollständiger Grundlage — ein
Vorgang konnte als `neu` gelten und später Modellaufruf + Write auf möglicherweise bereits
vergebener Kennung auslösen.

**Die Reparatur (drei Punkte, keine Änderung an `sameVorgang`/`candidatePrefixes`/
`deriveVorgangId`/`neueErkenntnisse`):**

1. `storage.listKoDocuments` wirft bei einem Lesefehler einen typisierten `StorageReadError`
   (`quelle: ko_document_links`) statt `[]` — wie die Geschwister-Leser `listKoDocumentLinks`
   und `listRawDocuments`. Eine erfolgreich gelesene, tatsächlich leere Liste bleibt `[]`.
2. `resolveVorgang` bricht bei einem Bestandslesefehler fail closed ab
   (`resolution: "bestand-lesefehler"`, sichtbarer `lesefehler`-Grund) — es wird **kein** Urteil
   auf leerer Grundlage getroffen, insbesondere **kein** `neu`-Übergang.
3. Der Motor (`understandOneCluster`) liefert `skipped-bestandslesefehler` **vor** Reservierung,
   Budget, Modellaufruf und Write; die Planung (`klassifiziereCluster`/`pruefeUndPlane`) bricht
   mit `verstehen-bestandslesefehler` ab (`ok: false`).

**Abgrenzung (damals):** ein Lesefehler bei der Kandidatensuche
(`listKnowledgeObjectsByVorgangPrefix`) lieferte weiterhin `[]` (catch im Speicher) — ein
**verwandter, aber getrennter** Befund desselben Typs und bewusst **nicht** in dieser minimalen
Reparatur enthalten (eigener Folgeschritt). Dieser Folgeschritt ist inzwischen geschlossen: §3d.

## 3d · Letzte Lesefehler-Pfade im Resolver fail closed (2026-09-22)

**Anlass (belegt):** unabhängige Prüfung bestätigte zwei verbleibende Lesefehler-Pfade im
Resolver, die wie in §3c („Abgrenzung") noch offen waren:

1. **Exakter Leser** `deps.getExisting` → `storage.getKnowledgeObjectByVorgang` gab bei einem
   Lesefehler `null` zurück (fachlich = „Vorgang existiert nicht").
2. **Präfix-Kandidatensuche** `deps.findVorgangCandidates` →
   `storage.listKnowledgeObjectsByVorgangPrefix` gab bei einem Lesefehler `[]` zurück
   (fachlich = „keine Kandidaten").

Beides konnte einen Cluster als `neu` klassifizieren (Modellaufruf + Write auf möglicherweise
vergebener Kennung).

**Die Reparatur (keine Änderung an `sameVorgang`/`candidatePrefixes`/`deriveVorgangId`/
`neueErkenntnisse`/`MAX_VORGANG_KANDIDATEN`/`MAX_KANDIDATEN_MIT_BELEG`/Sortierung):**

1. `storage.listKnowledgeObjectsByVorgangPrefix` wirft bei Lesefehler einen typisierten
   `StorageReadError` (`quelle: knowledge_objects`) statt `[]`; erfolgreich gelesenes `[]` bleibt.
2. `storage.getKnowledgeObjectByVorgang` wirft bei `throwOnError: true` einen typisierten
   `StorageReadError` statt des rohen Fehlers — `getExistingStreng` wird damit typisiert und
   wiederverwendet.
3. `resolveVorgang` fährt den exakten Leser über `deps.getExistingStreng` (Fallback
   `deps.getExisting` für Alt-Deps) und bricht bei beiden Fehlerarten fail closed ab
   (`resolution: "bestand-lesefehler"`, unterscheidbare `begruendung` `exakt-lesefehler` bzw.
   `kandidaten-lesefehler`, sichtbarer `lesefehler`-Grund). Die Kennung verschafft dem exakten
   Kandidaten weiterhin **nur** einen Platz im Fenster; `sameVorgang` bleibt die fachliche
   Entscheidung.
4. Motor (`understandOneCluster`) liefert `skipped-bestandslesefehler` vor Reservierung, Budget,
   Modell und Write; die Planung (`klassifiziereCluster`/`pruefeUndPlane`) bricht mit
   `verstehen-bestandslesefehler` ab. Die `begruendung` wird durchgereicht (unterscheidbar),
   `status`/`reason` bleiben `skipped-bestandslesefehler`/`bestandslesefehler` (ERGEBNISGRUPPE
   „erneut" unverändert).

**Erfolgreiche Leerfälle bleiben unverändert:** erfolgreich gelesener, nicht existierender
Vorgang → `null`; erfolgreich gelesene leere Präfixliste → `[]`.

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

Die Klassifikation zählt den Fall „bereits verstanden, alle Dokumente bekannt“ **exakt wie der
Motor**: ein vollständiges Duplikat ist nur dann Kandidat, wenn der Motor dort tatsächlich aufruft
— bei offener Update-Vormerkung oder ausdrücklicher Betreiberfreigabe (`erneut`). Beide Seiten
benutzen dieselbe Funktion (`duplikatBrauchtAufruf`), es gibt keine zweite Regel. Damit bildet der
Plan die echte Aufrufentscheidung ab. Ändert sich der Vormerkungszustand zwischen Plan und Lauf,
kann die tatsächliche Aufrufzahl abweichen — begrenzt bleibt sie durch den harten Laufdeckel
(113) und den Kostendeckel. Siehe §23 (Korrektur 2026-09-24).

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

`version · quittungsschluessel · commit` (Dokument-Snapshot) `· runtimeCommit` (der tatsächlich
ausgeführte Code-Stand, §18) `· dokumente · idHash · cluster · maxModellaufrufe ·
maxUsd · maxMs · runId · gestartetAm · status · beendetAm · modellaufrufe ·
modellaufrufeKandidaten · laufMaxModellaufrufe · laufkostenUsd · bilanz · automatischeWiederholung`

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

**Drei Größen werden ausdrücklich unterschieden:**

1. **Gemessener Durchschnittspreis** `0,189405 USD / 36 Aufrufe ≈ 0,00526 USD je Aufruf`
   (belegte Messgröße der 36er-Fachabnahme). Er ist eine **Prognosegröße, KEINE harte
   Kostenobergrenze** — reale Einzelaufrufe schwanken bis ~0,013 USD.
2. **Harte Laufkostenobergrenze 0,80 USD** (technisch erzwungen, seit 2026-09-23): Der Lauf
   nutzt die **bestehende** atomare Kostenwahrheit (`lib/helmut/testkosten-budget.js`): vor
   vor jedem Aufruf wird die volle Reservierung gebucht (0,212 USD bei der
   Understanding-Ausgabegrenze 3000), nach der Anbieterantwort werden die **echten
   Tokenkosten** abgerechnet, ungeklärte Ausgänge bleiben voll reserviert. Jede Buchung
   trägt die Laufkennung `verstehen169-…` (`bezug.runId`). Vor jedem Cluster prüft der
   Runner: **echte Laufkosten + volle Reservierung des nächsten Aufrufs ≤ 0,80 USD** —
   sonst Stopp `verstehen-kostendeckel-erreicht` **vor** dem Provider-Aufruf. Ohne
   Kostenwahrheit startet nichts (`verstehen-kostenwahrheit-fehlt`); ein unlesbarer
   Kostenstand stoppt fail closed (`verstehen-kostenleser-fehler`). **Nach** dem letzten
   Aufruf wird der endgültig gebundene Stand noch einmal rein lesend geladen: der
   Abschlussbericht (`laufkostenUsd`) und die Einmalquittung tragen exakt diesen Endstand —
   nicht den Stand vor dem letzten Cluster. Ein danach unlesbarer Stand
   (`verstehen-kostenleser-fehler`) oder ein wider Erwarten überschrittener 0,80-USD-Rahmen
   (`verstehen-kosten-invariante-verletzt`) werden **nicht** als erfolgreich gemeldet; die
   Quittung schließt sichtbar `gestoppt`, ohne weiteren Aufruf und ohne automatische
   Wiederholung.
3. **Globaler 4-USD-Tagesriegel** (atomar, unverändert) — er bleibt zusätzlich und unabhängig
   wirksam und ersetzt den Laufdeckel nicht.

## 12 · Bedienung

```sh
# Rein lesende Planung (Bindung, Dedup, Cluster, Kandidaten) — kein Modellaufruf:
#   KANONISCH/PRODUCTION: der getrennte manuelle Workflow
#     `.github/workflows/verstehen-169-plan.yml` (siehe §19)
#   Nur LOKAL, ohne Production-Bezug: node scripts/lokal.js -- node scripts/verstehen-einmalig-169.js
#     Der lokale Starter entfernt die Production-Kennungen bewusst — der Plan endet dort
#     strukturell mit `verstehen-speicher-nicht-verfuegbar`. Genau diese Bedienluecke schliesst §19.

# Scharfer Lauf (eigene Freigabe erforderlich, bestaetigendes Wort):
HELMUT_VERSTEHEN_169_COMMIT=<dokument-snapshot-commit> \
HELMUT_VERSTEHEN_169_RUNTIME_COMMIT=<git-commit-des-ausgefuehrten-codes> \
HELMUT_VERSTEHEN_169_LISTE=belege/verstehen-169-ids.json \
HELMUT_VERSTEHEN_169_SCHARF=1 \
HELMUT_VERSTEHEN_169_BESTAETIGT=EINMALIGER_VERSTEHENSLAUF_169_RUHDOKUMENTE_BESTAETIGT \
  node scripts/verstehen-einmalig-169.js
```

Kein Durchschnittspreis-Parameter mehr: der 0,80-USD-Laufdeckel liest die echten Laufkosten
aus der bestehenden atomaren Kostenablage (§11). Voraussetzung ist die aktive Reservierung
(`VERCEL_ENV=production`, `HELMUT_TESTLAUF_KOMMUNIKATION=gesperrt`) — sonst stoppt der Lauf
fail closed.

Der Dokument-Snapshot-Commit wird **nicht** aus dem laufenden Prozess geraten, sondern ausdrücklich
übergeben (`verstehen-commit-fehlt` sonst): eine selbst erratene Bindung wäre keine Bindung.
Davon getrennt ist der **Runtime-Commit** — der Git-Commit des tatsächlich ausgeführten Codes
(§18). Im scharfen Lauf ist er Pflicht.

## 13 · Gezielte Tests

`node scripts/lokal.js -- node scripts/verstehen-einmalig-test.js` — **91 von 91 grün** (bis 2026-09-23: 84/84 mit §23 Diagnosewahrheit, +7 Prüfungen §24 Runtime-Commit),
offline, ausschließlich mit Attrappen für Datenbank, Netz und Modell. Abgedeckt sind alle
zwanzig Pflichtprüfungen des Auftrags (§1–§20), die Vertragsfälle S1/S6/S9/S10
(Commit, Größenverteilung, Lesefehler, Kennungsabbildung), die Auftragswerte selbst, die
**echte 169er-Bindung** (169 eindeutige Kennungen, exakter Hash, Beleg wird von Bedienweg und
Kern akzeptiert; falscher Hash, veränderter Prüfbeleg sowie 168 und 170 Kennungen bleiben fail
closed), die **Abbruchdiagnose** (§21), die **Resolver-Spuren** (§22) und die
**Diagnosewahrheit des gescheiterten scharfen Laufs** (§23): sichere Validierungsfehlercodes
bleiben erhalten (maximal fünf, nur feste Wortmarken), `documents` entspricht exakt der
Clustergröße, Prompt und Modellantwort gelangen nicht in Bericht oder Quittung, die
Verknüpfung an einen pending/failed-Vorgang wird nicht als Erfolg gezählt,
`verstehen-ausgang-unbekannt` bleibt fail closed ohne Retry, Kostenlogik und Grenzen
(0,80 USD, 4 USD, 113, 35 min) unverändert. Der Prüflauf erzeugt **keinen** echten
Modellaufruf und **keinen** Production-Schreibzugriff.

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
`understanding-mandatsneutral` 5/5, `cron-globalphase`, `globalphase-buendelung`,
`vorgangs-resolver-exakt` 12/12, `werkzeug-lesefehler` 43/43 und die neue Suite
`vorgangs-bestand-lesefehler` 11/11 (§3c).

Für §3d zusätzlich grün: die neue Suite `vorgangs-resolver-lesefehler-2` **17/17** — exakter
Leser (Treffer/Leer/Lesefehler, auch über Legacy-`getExisting`), Präfix-Suche
(Kandidaten/Leer/Lesefehler), unterscheidbare Fehlergründe (`exakt-lesefehler`/
`kandidaten-lesefehler`), Motor- und Planungs-Stopp vor Modell/Write, kein künstlicher `neu`,
sowie der Storage-Vertrag (beide Leser werfen typisierten `StorageReadError`, erfolgreiches
`null`/`[]` unverändert). Der `vorgangs-resolver-exakt-test` prüft §4b jetzt auf den
fail-closed-Abbruch (statt des früheren „läuft als `neu` weiter"). 0 Modellaufrufe, 0 Writes.

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

## 15 · Manueller GitHub-Actions-Ausführungsweg (vorbereitet, 2026-09-23)

Für den scharfen Lauf existiert ein eigener **manueller** Workflow
`.github/workflows/verstehen-169-einmalig.yml` — per `workflow_dispatch` auf `main` startbar,
verlangt das **exakte** Bestätigungswort, läuft nur bei `run_attempt = 1`,
hat `contents: read`, keine persistierten Git-Credentials, die bestehende globale
Concurrency-Gruppe `helmut-500-kontrollierte-facharbeit` (`cancel-in-progress: false`) und ein
Job-Timeout von **40 Minuten** (der Runner kontrolliert seine 35 Minuten selbst). Er startet
direkt `node scripts/verstehen-einmalig-169.js` (**nicht** über `scripts/lokal.js`) mit den
GitHub-Secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AZURE_OPENAI_KEY`,
`AZURE_OPENAI_ENDPOINT` und dem bestehenden Azure-Deployment-Muster; Werte werden nie geloggt.
Zwei Pflicht-Parameter beschreiben zwei **getrennte** Bindungen: `runtime_commit` (der Git-Commit
des tatsächlich auszuführenden Codes — der Workflow checkt genau ihn aus, §18) und — für einen
neuen Versuch — `quittungsschluessel` (leer = alter Auftrag, blockiert).
Der harte 0,80-USD-Laufdeckel nutzt die bestehende atomare Kostenwahrheit (volle Reservierung
je Aufruf + echte Abrechnung, Laufkennung `verstehen169-…`) — ein Durchschnittspreis wird
**nicht** verwendet (§11).
Unmittelbar vor dem Start läuft ein fail-closed-Preflight (Bestätigungswort, Repository, main,
Event, run_attempt, **vollständiger Runtime-Commit + Abgleich mit dem echten Checkout über
`git rev-parse HEAD`**, nicht-leere Secrets und Deployment). Alle Fachgrenzen bleiben im Runner —
der Workflow baut keine zweite Fachlogik. Statische Vertragsprüfung:
`scripts/verstehen-169-workflow-test.js`.

> **Status 2026-09-23: ausgeführt — §16 dokumentiert den scharfen Lauf und seine
> Auswertung. Der Weg selbst bleibt für eine künftige Betreiberentscheidung unverändert;
> ein weiterer Dispatch ist KEIN Folgeschritt dieses Sprints und braucht eine eigene Freigabe.**

## 16 · Der scharfe 169er Lauf und die Diagnosewahrheit (2026-09-23)

Der scharfe Lauf wurde **genau einmal** ausgeführt: Workflow-Run `35829992528`,
`run_attempt = 1`, `failure`, 23.09.2026 07:06–07:09 UTC. Er stoppte nach **einem**
Modellaufruf fail closed mit `verstehen-ausgang-unbekannt`; die Einmalquittung wurde terminal
`unbekannt` geschlossen (ein zweiter Lauf desselben Auftrags stoppt mit
`verstehen-bereits-verwendet`). Finale Laufkosten `0,005997 USD`; globaler Tageskostenstand
danach `0,116068 USD` von 4 USD. Kein 500er Nachweis, keine Profilaktivierung, kein Retry.

**Die Fehlerklasse ist `validierung-fehlgeschlagen` — nicht `dokumente:kernueberdeckung`.**
Der Abschlussbericht nannte `reason = dokumente:kernueberdeckung`. Das war die
**Resolver-Begründung** dafür, dass das neue Dokument (`rd-f9a5ff81…`, Berliner Morgenpost,
„Ökonom für Abschaffung der Rente mit 63 – Linke fordert das Gegenteil", 2026-08-03,
`retrieved_at` 2026-09-22) dem bestehenden pending-Vorgang `vg-abschaffung-20260911-7420f6`
zugeordnet wurde — **nicht** die Ursache der ungültigen Modellantwort. Der Modellpfad endete
in `validateUnderstandingResult` mit `validierung-fehlgeschlagen`. Production-belegt am
CAS-Vertrag: `zustand=unbekannt`, `versuche=1`, `ki_aufrufe=1`,
`letzter_grund=validierung-fehlgeschlagen`; KO: `status=pending`,
`understanding_status=failed`.

**Verknüpft ist nicht verstanden.** Das Dokument wurde während des Laufs tatsächlich an
`ko-vg-abschaffung-20260911-7420f6` verknüpft. Der Bericht meldete `dokumente = 0` —
Ergebniswahrheitslücke: der Erstverstehen-`skipped-invalid`-Pfad verknüpft die
Cluster-Dokumente (über `markFailed`), trug aber keine Dokumentzahl zurück. Der Vorgang
blieb unverstanden; eine Verknüpfung ist kein fachlicher Erfolg.

**Historischer konkreter Validierungsfehler nicht rekonstruierbar.** Welche der sicheren
Fehlercodes den Ausschlag gaben (`quellenbeleg-*`, `decision_level-antwortkonflikt`),
wurde **nicht** persistiert: das Skip-Log trägt nur `callType=skipped-understanding-invalid`,
der CAS-Vertrag nur die Klasse `validierung-fehlgeschlagen`, und der Runner verwarf die
motorseitig bereits begrenzten `errors` beim Erstellen seines Abschlussberichts. Es wurde
keine Modellantwort rekonstruiert, kein Prompt ausgelesen und kein Modell neu aufgerufen.

**Reparatur (Diagnose-/Ergebniswahrheit; kein Retry, kein neuer Lauf):**

- `understandOneCluster` trägt im Erstverstehen-`skipped-invalid`-Pfad jetzt `reason`
  (`ki-antwort-nicht-verwertbar` bzw. `validierung-fehlgeschlagen` — die Fehlerklasse des
  Modellpfads, identisch mit `letzter_grund` im CAS) und `documents: clusterDocs.length`.
  `skipped-error` erhält dieselbe Dokumentzahl (gleicher Zählfehler: `markFailed` verknüpft).
- Der 169er Runner übernimmt bei `skipped-invalid` höchstens **fünf** sichere Fehlercodes
  aus `r.errors` in das neue Feld `validierungsfehler` — ausschließlich feste Wortmarken
  (`ki-antwort-nicht-verwertbar`, `decision_level-antwortkonflikt`, `quellenbeleg-<feld>`).
  Frei formulierte Schema-Meldungen (können Rohwerte der Antwort enthalten), Prompt und
  Antwort bleiben außen.
- Die Einmalquittung trägt dieselben Codes (dedupliziert, maximal fünf) — auch bei einem
  Stopp mit `verstehen-ausgang-unbekannt` bleibt der Abschlussbeleg nachvollziehbar. Keine
  neue Tabelle, keine zweite Diagnoseablage.
- Ein Link an einen failed/pending-Vorgang bleibt `skipped-invalid` (Motor-Gruppe
  `fehlgeschlagen`) und wird **nie** als `saved`/`merged` gezählt.
- Tests: `scripts/verstehen-einmalig-test.js` §23 (19 neue Prüfungen, insgesamt 84/84 grün,
  offline, 0 Modellaufrufe, 0 Writes). Grenzen unverändert: 113 Aufrufe, 0,80 USD, 35 min,
  4-USD-Tagesriegel, Quittungsschlüssel `verstehen169-20260922-a`.

**Ausdrücklich kein Retry.** Der Lauf wird nicht wiederholt, der unbekannte CAS-Zustand
nicht verändert, die Quittung nicht zurückgesetzt. Ob ein erneuter scharfer Lauf stattfindet
— und mit welcher Kennung — ist eine getrennte Betreiberentscheidung.

> §14 („kein Production-Lauf …") ist durch diesen Abschnitt überholt: der dort
> beschriebene Vorbereitungsstand galt vor dem scharfen Lauf. §15 („vorbereitet, NICHT
> ausgeführt") ist ebenfalls überholt — der Workflow wurde für Run `35829992528` genau
> einmal ausgeführt.

## 17 · Der kleinste sichere Weg zu einem NEUEN Versuch (2026-09-23)

**Der erste Lauf ist terminal unbekannt; der alte Auftrag ist nicht wiederverwendbar.**
Die Einmalquittung `verstehen169-20260922-a` bleibt unveraendert (`unbekannt`) — sie wird
nicht zurückgesetzt, nicht gelöscht, nicht überschrieben. Ein zweiter Lauf desselben
gebundenen Auftrags stoppt weiterhin mit `verstehen-bereits-verwendet` vor jedem
Modellaufruf (testgesichert: `verstehen-169-neuversuch-test.js` §2).

**Ein neuer Versuch braucht einen eigenständigen, belegbaren Vertrag:**

1. **Neue Quittungskennung, ausdrücklich übergeben und streng geprüft.** Der
   Quittungsschlüssel ist jetzt ein expliziter Parameter (`HELMUT_VERSTEHEN_169_QUITTUNG`
   bzw. Workflow-Input `quittungsschluessel`). Ohne Kennung gilt unveraendert die alte —
   der alte Auftrag bleibt blockiert. Eine gültige neue Kennung trägt das Muster
   `verstehen169-<JJJJMMTT>-<suffix>`; die alte Kennung selbst und Fremdformate stoppen
   fail closed (`verstehen-quittung-identisch` / `verstehen-quittung-ungueltig`), VOR jedem
   Zugriff. Die Kennung vergibt der Betreiber — der Code erfindet keine.
2. **Alle übrigen Grenzen bleiben identisch:** 169 Dokumentbindung, derselbe Kennungshash,
   dieselben 122 Cluster, höchstens 113 Modellaufrufe, 0,80 USD Laufdeckel, 35 Minuten
   Zeitdeckel, 4 USD Tagesriegel, Aufruftyp `understanding-rueckstand`. Keine
   Budgeterhoehung, keine automatische Wiederholung, keine Profilwirkung.
3. **Der Problemvorgang `vg-abschaffung-20260911-7420f6` bleibt unveraendert gesperrt.**
   Ohne Betreibereingriff meldet der neue Lauf ihn ehrlich als `skipped-failed` (kein
   Modellaufruf, kein Abbruch, sichtbar in Bilanz und Ergebnissen) und verarbeitet die
   übrigen Cluster normal — die Kandidatenzahl sinkt auf höchstens 112, was der
   Schutzvertrag ausdrücklich erlaubt („weniger ist erlaubt"). Kein stilles
   Ueberspringen, keine Behandlung als erledigt.
4. **Erneutes Verstehen NUR über den kanonischen Wiederaufnahmeweg.** Die einzige
   Freigabe ist `helmut_verstehen_ausgang_aufloesen('vg-abschaffung-20260911-7420f6',
   'erneut')` (CAS `unbekannt` → `offen` + `erneut-freigegeben`; KEIN manueller
   Zustandswechsel, KEIN Zaehler-Reset). Der reguläre Wiederaufnahmepfad
   (`runPendingUnderstandingShadow` über `listWiederaufnahmen`,
   `wiederaufnahmeFreigabe`) versteht den Vorgang danach mit einem einzigen
   Modellaufruf, voller CAS-Reservierung, Budget-Gate und unveraenderten Deckeln.
   Wird der Vorgang vor dem 169er Lauf verstanden, endet sein Cluster dort kostenfrei
   als Duplikat — beide Reihenfolgen sind doppelkostenfrei.

**Keine Quittungs- oder CAS-Manipulation.** Kein Reset, kein Löschen, kein manuelles
Setzen von `offen`/`frei`. Die alte Quittung und der gescheiterte Run bleiben vollständig
auditierbar erhalten; die neue Kennung erzeugt eine eigene, getrennte Quittungszeile.

**Belege dieses Abschnitts:** `scripts/verstehen-169-neuversuch-test.js` (18/18, offline,
0 Modellaufrufe, 0 Writes) und die erweiterte statische Workflow-Pruefung
`scripts/verstehen-169-workflow-test.js` (85/85). Die Mechanik des Wiederaufnahmepfads
bleibt durch `verstehen-wiederaufnahme-test` (47/47) und `verstehen-cas-vertrag-test`
(107/107) belegt.

## 18 · Runtime-Commit: der tatsächlich ausgeführte Code-Stand (2026-09-23)

**Der Befund.** Der Workflow checkte mit `actions/checkout` **ohne `ref`** den jeweiligen
Workflow-Stand aus, während `HELMUT_VERSTEHEN_169_COMMIT` fest auf `ea84f26c…` stand. Der Kern
verglich nur den übergebenen **String** mit `PINNED.commit` (S1) — der **echt ausgecheckte und
ausgeführte** Git-Commit wurde **nicht** geprüft. Nach heutigen Fixes konnte damit aktueller Code
laufen, während der Bericht weiter den alten Commit als angeblich gebunden auswies. Für einen
belastbaren Production-Nachweis war das zu wenig.

**Zwei getrennte Commits — nie vermischen.**

| Begriff | Was er beschreibt | Wo er gebunden ist |
|---|---|---|
| Dokument-Snapshot-Commit `ea84f26c…` | den **Datensatz** (169 Kennungen, Hash, 122 Cluster) | `PINNED.commit` / `HELMUT_VERSTEHEN_169_COMMIT` (fest eingeschrieben, unverändert) |
| Runtime-Commit | den **ausgeführten Code** | Workflow-Input `runtime_commit` / `HELMUT_VERSTEHEN_169_RUNTIME_COMMIT` (Laufparameter) |

**Der Vertrag (fail closed, vor jedem Write und Modellaufruf).**

1. Der Betreiber übergibt `runtime_commit` als **vollen** Git-SHA; der Workflow checkt mit
   `ref: ${{ inputs.runtime_commit }}` **genau diesen** Commit aus.
2. **Dreiseitige Bindung an den Dispatch** (seit 2026-09-23, scharf wie Plan): der Job läuft nur
   bei `inputs.runtime_commit == github.sha`; der Preflight prüft zusätzlich hart
   `RUNTIME_COMMIT == DISPATCH_SHA` (`DISPATCH_SHA: ${{ github.sha }}`) und danach
   `git rev-parse HEAD == RUNTIME_COMMIT`. Jede Abweichung ⇒ sofortiger Abbruch **vor** der
   Nutzung der Production-Zugangsdaten und vor dem Runner. Damit gilt nur:
   angefordert = Dispatch = Checkout — ein beliebiger, älterer oder fremder Repository-Commit wird
   fail closed abgelehnt (auch die reine 40-Hex-Formatprüfung ist **keine** Zulassung).
3. Der Runner prüft **dieselbe** Regel erneut (`pruefeRuntimeCommit`) und bricht fail closed ab
   bei `verstehen-runtime-commit-fehlt` (scharfer Lauf ohne Runtime-Commit),
   `verstehen-runtime-commit-ungueltig` (kein voller SHA),
   `verstehen-runtime-commit-nicht-pruefbar` (Checkout nicht lesbar) oder
   `verstehen-runtime-commit-abweichend` (Abweichung). Ein unlesbarer Checkout gilt nie als gültig.
4. Der Kern (`lib/helmut/verstehen-einmalig.js`) erfindet **keinen** Lauf-Commit: er prüft nur die
   Form, führt den Wert in Bericht **und** Quittung (`runtimeCommit`) und lässt `commit`
   unverändert den Dokument-Snapshot bezeichnen. Keine selbstreferenzielle Konstante im Code.

Der Runtime-Commit ist ein **Laufparameter**, keine fest eingeschriebene Zahl: nach einem Merge
wird der dann ausdrücklich freigegebene `main`-Commit übergeben. Alle Fachgrenzen bleiben
unverändert (169/122/113 · 0,80 USD · 35 min · 4 USD Tagesriegel · CAS, Fencing, Locks, Budget,
Clustering, Resolver, Validatoren).

**Belege.** `scripts/verstehen-einmalig-test.js` §24 (7 Prüfungen, 91/91 grün, offline) und
`scripts/verstehen-169-workflow-test.js` (152/152): `ref`-Bindung, SHA-Muster, `rev-parse`-Abgleich,
Abbruchpfad, getrennte Env-Werte, kein hart kodierter Runtime-Commit. Die Preflight-Shell wurde
zusätzlich funktional gegen ein eigener Test-Repository geprüft: richtiger Commit ⇒ `PREFLIGHT ok`;
falscher, verkürzter oder fehlender Runtime-Commit ⇒ Abbruch mit exit 1. **0 Modellaufrufe,
0 Production-Writes, 0 USD.** Ein neuer 169er Lauf wurde **nicht** gestartet.

## 19 · Zwei strikt getrennte Bedienwege: Plan (rein lesend) und Scharf (2026-09-23)

**Der Befund.** Der Planmodus des Runners (`scripts/verstehen-einmalig-169.js` ohne
`HELMUT_VERSTEHEN_169_SCHARF`) braucht echten Production-Lesezugriff auf Supabase. Der
dokumentierte lokale Starter `scripts/lokal.js` entfernt diese Kennungen bewusst und stellt den
Speicher auf lokal — der Plan endet dort strukturell mit `verstehen-speicher-nicht-verfuegbar`
(2026-09-23 belegt, ohne Production-Kontakt). Der scharfe Workflow
(`.github/workflows/verstehen-169-einmalig.yml`) darf dafür **nicht** verwendet oder aufgeweicht
werden: er setzt fest `HELMUT_VERSTEHEN_169_SCHARF: "1"`.

**Der getrennte Planweg.** `.github/workflows/verstehen-169-plan.yml` ist ein eigener, manueller
Workflow und ruft **denselben** Runner **ohne** SCHARF auf — keine zweite Fachlogik. Er ist
ausschließlich `workflow_dispatch` auf `main`, `run_attempt = 1`, `contents: read`, nutzt dieselbe
globale Concurrency-Gruppe (`helmut-500-kontrollierte-facharbeit`, `cancel-in-progress: false`)
und verlangt den vollen `runtime_commit` als Pflicht-Input. Dieser Wert ist **fail closed an den
Dispatch gebunden**: `runtime_commit` muss exakt `github.sha` des auf `main` gestarteten
Workflow-Dispatches sein (Job-`if` **und** Preflight-Abgleich), genau dieser Commit wird
ausgecheckt und zusaetzlich ueber `git rev-parse HEAD` gegen den echten Checkout geprueft.
Ein aelterer, fremder oder sonstiger gueltiger Repository-Commit wird **vor** dem Runner-Aufruf
abgelehnt — er kann die Production-Lesekennungen nicht bekommen. Dokument-Snapshot-Commit
(`ea84f26ccc380e22961335926e2d4e585cee2308`) und Liste (`belege/verstehen-169-ids.json`) bleiben
fest eingeschrieben; die Production-Lesekennungen kommen aus den bestehenden GitHub-Secrets
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), Speicher `HELMUT_V3_STORE=1`,
`HELMUT_STORAGE_BACKEND=supabase`, `HELMUT_SUPABASE_STORE_ID=main`.

**Warum der Planweg technisch nicht scharf laufen kann.** Er setzt die Scharf-Variablen **gar
nicht**: kein `HELMUT_VERSTEHEN_169_SCHARF`, kein `HELMUT_VERSTEHEN_169_BESTAETIGT`, keine
Quittungskennung und **keine** Azure-/Modell-Zugangsdaten. Der Laufschritt bricht zusätzlich hart
ab, falls `HELMUT_VERSTEHEN_169_SCHARF` doch gesetzt wäre. Eine gemeinsame Umschaltung
(`mode=plan|scharf`) gibt es bewusst **nicht** — zwei getrennte Bedienwege bleiben Absicht. Beide
Wege tragen dieselbe dreiseitige Dispatch-Bindung (siehe §18); kein Weg kann einen fremden Commit
mit Production-Zugangsdaten ausführen.

**Was der Plan liefert.** Bindungsprüfung, Production-Dedup, Production-Clusterung und
Kandidatenzählung: 0 Modellaufrufe, 0 Quellenabrufe, 0 Profilwrites, 0 Kommunikation, keine
Quittung, 0 USD. Er ist **kein** Funktionsnachweis — Planung belegt keine Funktion.

**Belege.** `scripts/verstehen-169-workflow-test.js` (**152/152**, offline, 0 Modellaufrufe,
0 Writes) prüft beide Workflows statisch: Trigger, `main`-/`run_attempt`-Bindung, Rechte,
Concurrency, `runtime_commit`-Pflicht samt `rev-parse`-Abgleich, **dreiseitige Dispatch-Bindung
(Job-`if` auf `github.sha`, `DISPATCH_SHA`-Abgleich, Reihenfolge vor Secrets und vor dem Runner)**, feste
Snapshot-/Listenwerte,
Supabase-Lesezugang über Secrets, direkter Runner-Aufruf, kein `scripts/lokal.js`, keine
Scharf-/Bestätigungs-/Quittungsvariable, keine Modell-Secrets, keine Profil-/Lock-/CAS-/Budget-
Variablen, kein Schedule und kein Push-Trigger. **Kein Workflow wurde ausgeführt.**

## 20 · Dritter scharfer 169er Lauf: Ergebnis und Bilanz (2026-09-24)

Der dritte scharfe Lauf wurde **genau einmal** ausgefuehrt: Workflow-Run `35964405263`,
`run_attempt = 1`, `failure`, 24.09.2026 06:25–06:33 UTC (~8 min). Runtime-Commit
`b35e34a208fe7972385e2ed7bfe5d72f15f2dc65` (Dispatch = `github.sha` = Checkout),
Dokument-Snapshot `ea84f26ccc380e22961335926e2d4e585cee2308`. Quittungskennung
`verstehen169-20260924-b` (neu vom Betreiber vergeben) — der Runner beansprucht sie und
schliesst sie terminal: `quittungStatus = unbekannt`.

**Bindung und Schutzvertrag gehalten.** Gebunden 169 Dokumente, `idHash 5f387840…a2ed9`,
122 Cluster, 113 Modellkandidaten (exakt am Deckel, ≤ 113), Schutzvertrag `true`;
`quellenabrufe 0`, `profilwrites 0`, `kommunikation 0`, `automatischeWiederholung false`.
Jederzeit innerhalb der Grenzen: 24 von 113 Modellaufrufen, 0,15696 von 0,80 USD,
deutlich unter 35 Minuten.

**Abbruch.** Nach **36 von 122 Clustern** (54 von 169 Dokumenten) stoppte der Lauf mit
`verstehen-ausgang-unbekannt` am Cluster `vg-gemeinsame-20260921-dcd0f5`
(`status skipped-invalid`, `reason validierung-fehlgeschlagen`,
`validierungsfehler = ["quellenbeleg-parteien"]`). Ursache: ein einzelner **unbelegter Wert
in der Beteiligungsliste `parteien`** — der strenge Validator verwarf die gesamte Antwort, der
Motor setzte `ausgang=unbekannt`, der Runner beendet darauf den gesamten Lauf. Das ist **genau
der vorab benannte Fall** (die Felder `parteien`/`ausschuesse` bleiben bewusst streng); es wurde
**nichts** automatisch repariert oder weich gefiltert.

**Bilanz der verarbeiteten 36 Cluster:** duplicate 10 (17 Dokumente), saved 17 (17),
merged 2 (12), updated 6 (7), skipped-invalid 1 (1). Die **uebrigen 86 Cluster / 115 Dokumente
wurden nicht verarbeitet** — kein 169er Nachweis, keine Profilwirkung.

**Nicht verfuegbar aus diesem Lauf.** Prompt-/Completion-/Gesamttoken gibt der Runner-Bericht
nicht aus; der globale UTC-Tageskostenstand war aus dieser Sitzung nicht lesbar (lokal keine
Production-Zugangsdaten). Beide Werte wurden **nicht geprueft** und werden **nicht behauptet**.
Der bekannte vorherige UTC-Tagesstand vom 23.09. lag bei 0,116068 USD von 4 USD; der technische
Tagesriegel (4 USD, atomar) blieb unveraendert wirksam.

**Belege.** Abschlussbericht (JSON) des Runners im Workflow-Log von Run `35964405263`.
**Kein Retry, kein zweiter Dispatch, kein Rerun, keine Quittungs-/CAS-/Budgetaenderung.**

## 21 · Lokaler Clusterfehler beendet den Lauf nicht mehr (2026-09-24)

**Der Befund.** Alle drei scharfen Laeufe scheiterten an derselben strukturellen Fragilitaet: der
Runner behandelte JEDEN `ausgang === "unbekannt"` als globalen Abbruch. Ein EINZELNER Cluster mit
`skipped-invalid` beendete damit den gesamten gebundenen Auftrag — im dritten Lauf blieben so 86
von 122 Clustern und 115 von 169 Dokumenten ungeprueft.

**Zwei Klassen, eine Grenze.** Der Runner unterscheidet jetzt:

| Klasse | Ausloeser | Wirkung |
|---|---|---|
| A — LOKALER CLUSTERFEHLER | `status === "skipped-invalid"` (fachlich ungueltige Modellantwort DIESES Clusters, z. B. `quellenbeleg-parteien`) | Vorgang terminal `unbekannt` gesperrt (CAS/Fencing, keine Verknuepfung, KEIN Retry); uebrige unabhaengige Cluster laufen weiter; Gesamtstatus bleibt rot |
| B — GLOBALER VERTRAGS-/INFRASTRUKTURFEHLER | `cluster-error` (unerwarteter Motorwurf), `skipped-error`, `skipped-store`, `skipped-veraltet` sowie alle Bindungs-, Lock-, Quittungs-, Kosten- und Zeitfehler | unveraendert sofortiger Gesamtabbruch vor dem naechsten Cluster |

**`cluster-error` ist ausdruecklich Klasse B.** Ein unerwartetes Werfen des Motors ist kein
lokaler Fachfehler — die Ursache ist nicht sicher klassifizierbar (Code-, Speicher-,
Infrastruktur- oder Vertragsfehler). Der betroffene Cluster wird mit seiner bekannten
Clustergroesse als `cluster-error` bilanziert, dann bricht der Lauf mit dem eindeutigen Grund
`verstehen-cluster-error` global ab: kein Folgecluster, `vollstaendigVerarbeitet = false`,
`fachlichBestanden`/`ok` = false, Quittung terminal `gestoppt`. **Der globale Abbruch hat beim
Quittungsstatus Vorrang:** kam zuvor bereits ein lokales `skipped-invalid` (unknown) vor, bleibt der
Quittungsstatus trotzdem `gestoppt` und traegt den Grund `verstehen-cluster-error` — das lokale
unknown verschleiert den schwereren globalen Befund nicht. Ein `cluster-error` kann **nie**
zu einem fachlichen Gruen fuehren. Die rohe Fehlermeldung wird bewusst NICHT persistiert (sie
kann Hostnamen enthalten); das CAS setzt den nach dem Modellstart geworfenen Vorgang ueber den
bestehenden Weg auf `unbekannt` (At-most-once, kein Retry).

**Vollstaendig abgearbeitet ist NICHT fachlich bestanden.** Ein Klassen-A-Lauf kann alle Cluster
abarbeiten; `bilanz.unbekannt > 0` haelt den Lauf trotzdem rot: `quittungStatus = "unbekannt"`,
`fachlichBestanden`/`ok` = false, `abbruchGrund = null`. Ein Lauf gilt nur dann als fachlich
bestanden, wenn KEIN `unbekannt` uebrig bleibt.

**Unveraendert streng bleibt:** die Beteiligungslisten `parteien`/`ausschuesse` (unbelegter Wert
sperrt weiter und wird NICHT still entfernt), das Schema, der `decision_level-Konflikt`, der
Goldsetauswerter, der Quellenbeleg sowie CAS, Fencing, Locks, Quittung, Aufruf-/Kosten-/Zeitdeckel
und die 169er-Bindung. Der Production-CAS-Zustand von `vg-gemeinsame-20260921-dcd0f5`
(`unbekannt`) wird NICHT veraendert.

**Kein Retry und keine Doppelkosten.** Der lokale Fehlercluster wird genau einmal modellseitig
bearbeitet (CAS-At-most-once) und nie erneut; die volle Reservierung des Aufrufs bleibt gebucht.
Ist die Quittung verbraucht, startet derselbe Auftrag nicht neu (`verstehen-bereits-verwendet`,
0 Modellaufrufe).

**Belege.** `scripts/verstehen-einmalig-test.js` §25 (**106/106** gruen, offline, 0 Modellaufrufe,
0 Production-Writes): genau ein unknown-Cluster bei `quellenbeleg-parteien`; kein zweiter
modellseitiger Aufruf; die uebrigen Cluster laufen weiter; mehrere lokale unknown bleiben exakt
gezaehlt; der unknown-Cluster wird NICHT zu `saved`/`merged`/`duplicate`; frueher erfolgreiche
Cluster werden nicht zurueckgerollt; Aufruf- und USD-Deckel bleiben hart; ein globaler
Transportfehler stoppt weiter fail closed; **ein unerwarteter Motorwurf im zweiten von vier
Clustern stoppt global (`verstehen-cluster-error`) und kann NIE `ok`/`fachlichBestanden` = true
werden**; **§25.31: ein lokales `skipped-invalid` VOR einem `cluster-error` laesst den globalen
Abbruch gewinnen (Quittung `gestoppt`, Grund `verstehen-cluster-error`)**; die Quittung wird
genau einmal beansprucht.
Zusaetzlich gruen: `verstehen-169-neuversuch-test` (19/19), `verstehen-169-kosten-deckel-test`
(29/29), `verstehen-169-workflow-test` (152/152), `verstehen-cas-vertrag-test` (107/107).
**Kein Merge, kein neuer Lauf; die Wirkung ist NICHT Production-belegt.**

## 22 · Vierter (freigegebener) scharfer 169er Lauf: fail closed im Schutzvertrag (2026-09-24)

Der Betreiber gab genau EINEN neuen scharfen Lauf frei (Quittung `verstehen169-20260924-c`,
Runtime-Commit `f5dc612ee3e5ce5917d9a4d08bc4a2aec0c92ee7`). Er wurde **genau einmal** ausgefuehrt:
Workflow-Run `35978125747`, `run_attempt = 1`, `failure`, 24.09.2026 08:55:40–08:57:02 UTC
(1 min 22 s).

**Abbruch im Schutzvertrag, VOR jedem Modellaufruf.** Die Bindung hielt (169 Dokumente,
`idHash 5f387840…a2ed9`, 122 Cluster, Groessenverteilung exakt 110/5/2/1/2/1/1), aber der Deckel
`maxModellaufrufe 113` wurde ueberschritten: **114 Modellkandidaten** ⇒
`grund = verstehen-kandidaten-ueber-deckel`, `schutzvertrag = false`, `ausgeloest = false`.

**Wirkung: keine.** `modellaufrufe 0`, `quellenabrufe 0`, `profilwrites 0`, `kommunikation 0`
⇒ **0 USD**; `quittung = null` ⇒ die Quittung `verstehen169-20260924-c` wurde **nicht beansprucht**;
kein Lock, kein CAS-Zugriff, keine Zustandsaenderung an `vg-gemeinsame-20260921-dcd0f5`.

**Clusterarten des Plans:** duplikat 34, neu 44, failed 1, update 13, pending-erst 23, merged 7
(Summe 122); Kandidaten 114, davon 8 nicht-Kandidaten (7× `merged`, 1× `failed` =
`vg-gemeinsame-20260921-dcd0f5`). Die vollstaendige Cluster-Diagnose liegt im Workflow-Log.

**Ausdruecklich:** Der eine freigegebene Lauf ist damit verbraucht. **Kein zweiter Dispatch,
kein Retry, keine neue Quittung, keine CAS-Aenderung.** Mit derselben Bindung startet ein weiterer
Versuch erneut am 113-Deckel — das ist eine Betreiberentscheidung, kein automatischer Schritt.

## 23 · Zwei belegte Ursachen der 114er-Ueberzaehlung und die Reparatur (2026-09-24, PR #541)

**Status dieser Aenderung: Code bereit und gezielt testgesichert — NICHT Production-belegt.** Es
wurde **kein** neuer Lauf gestartet, **kein** Dispatch, **keine** Quittung beansprucht, **keine**
CAS-Aenderung, **keine** Profileaenderung, **kein** Merge.

### Ursache 1 — der Plan zaehlte jedes vollstaendige Duplikat pauschal als Kandidat

Der Plan (`klassifiziereCluster`) setzte fuer einen Cluster, dessen Dokumente alle schon bekannt
sind, unbedingt `kandidat = true` („vormerkung-moeglich"). Der echte Motor ruft das Modell in
diesem Fall aber **nur** bei einer offenen Update-Vormerkung oder einer ausdruecklichen
Betreiberfreigabe (`erneut`); sonst endet der Vorgang OHNE Aufruf als `duplicate`.

**Direkt belegt am dritten Lauf.** Der dritte scharfe Lauf (Run `35964405263`, §20) verbrauchte
seine 24 Modellaufrufe ausschliesslich fuer `saved`/`updated`; die **10** `duplicate`- und **2**
`merged`-Ergebnisse dieses Laufs entstanden **ohne** jeden Modellaufruf.

**Die Rechnung des Betreibers ist als Aenderung der Kandidatenzahl bestaetigt.**
Plan des dritten Laufs (Run `35963641921`): duplikat 10 + neu 57 + pending-erst 27 + update 19 =
**113** Kandidaten (merged 9 zaehlte nicht). Plan des vierten Laufs (Run `35978125747`):
duplikat 34 + neu 44 + pending-erst 23 + update 13 = **114** Kandidaten (merged 7 und failed 1
zaehlten nicht). Die Nicht-Kandidaten gingen also von 9 auf 8 (−1) und die Kandidaten von 113 auf
114 (+1): zwei zuvor `merged` gefuehrte Cluster wurden jetzt `duplikat` (jeweils **+1**), und
`vg-gemeinsame-20260921-dcd0f5` wurde nach seinem Modellfehler `failed` (**−1**). Der Betreiber hat
fuer die beiden namentlich genannten `merged`-Faelle (`vg-berlin-20260914-093115`,
`vg-dauerbrenner-20260827-57e561`) in Production geprueft, dass `public.helmut_verstehen_vormerkungen`
fuer sie **keine** Zeile enthaelt — sie waren also faelschlich als Duplikat-Kandidaten gezaehlt.

**Was daraus folgt:** Die Kandidatenzahl des vierten Plans wurde um 34 Duplikate aufgeblaeht,
obwohl nur Duplikate mit belegter Vormerkung (oder Freigabe) einen Aufruf kosten. Fuer die 32
uebrigen Duplikate liegt **kein** Production-Beleg zum Vormerkungszustand vor; eine exakte
Vorhersage der Kandidatenzahl nach der Reparatur ist damit **nicht** moeglich. Belegbar ist:
80 Kandidaten aus `neu 44 + pending-erst 23 + update 13` plus die Duplikate mit Vormerkung plus
— nach der zweiten Korrektur — genau der ausdruecklich freigegebene `vg-gemeinsame-20260921-dcd0f5`.
Fuer die zwei geprueften Duplikate **sinkt** die Zahl, der Stand kann mit den vorhandenen Belegen
nicht ueber 113 liegen.

### Ursache 2 — die Betreiberfreigabe war im 169er Runner nicht verdrahtet

`vg-gemeinsame-20260921-dcd0f5` wurde ueber den kanonischen CAS-Weg ausdruecklich erneut
freigegeben (Betreiberbeleg: `zustand = offen`, `letzter_grund = erneut-freigegeben`). Der
regulaere Production-Motor unterstuetzt diesen Weg (`runPendingUnderstandingShadow` liest die
Wiederaufnahmeliste und reicht `wiederaufnahmeFreigabe` durch), der 169er Runner tat es nicht:
er klassifizierte den Vorgang als `failed`/`kandidat = false` und uebergab dem Motor **kein**
`wiederaufnahmeFreigabe: true` — der bezahlte Wiederaufnahmeweg blieb damit unerreichbar.

### Die Reparatur (kleinste sichere Loesung, generisch)

* **Eine geteilte Entscheidung fuer Plan UND Motor.** Aus `understanding.js` sind jetzt
  `duplikatBrauchtAufruf(deps, retriesCtx, vorgangId, vertrag, freigabe)` und
  `leseWiederaufnahmeFreigaben(deps, vertragAktiv)` herausgezogen. Der Duplikat-Zweig des Motors
  (`understandOneCluster`) und die Plan-Klassifikation benutzen **dieselbe** Funktion — es gibt
  keine zweite Kopie der Regel. Ein vollstaendiges Duplikat ist nur dann Kandidat, wenn die
  Vormerkung offen (und nicht erschoepft) ist oder eine ausdrueckliche Freigabe vorliegt.
* **Die Freigabeliste wird EINMAL gelesen** (`leseWiederaufnahmeFreigaben`, derselbe Aufruf wie im
  bestehenden Pfad). Plan und Lauf verwenden dasselbe Set. Der Lauf reicht die Freigabe **exakt**
  fuer die Kennung des jeweiligen Clusters an den Motor weiter (`freigaben.has(vorgangId)`), keine
  automatische Wiederaufnahme anderer `failed`/`duplikat`-Vorgaenge.
* **Fail closed bei Lesefehlern.** Ist eine Vormerkung nicht sicher lesbar, bricht der **Plan** ab
  (`verstehen-bestandslesefehler`) statt die Kandidatenzahl still zu verkleinern; ist die
  Wiederaufnahmeliste wegen eines echten Transportfehlers nicht lesbar, startet der Lauf nicht
  (`verstehen-wiederaufnahmen-nicht-lesbar`). „Nicht konfiguriert" bleibt ein Umgebungszustand
  (leeres Set, kein Befund). Der Motor bleibt in demselben Fall wie bisher fail-**safe** `duplicate`
  (kein Aufruf).
* **Unveraendert:** harter Deckel **113**, Laufkostendeckel **0,80 USD**, Laufzeit **35 min**,
  Tagesriegel **4 USD**, Quittungslogik, CAS/Fencing/Locks, At-most-once (kein Retry, kein zweiter
  Modellaufruf desselben Vorgangs), Klassen A/B aus §21.

**Belege.** `scripts/verstehen-einmalig-test.js` §26 (**116/116** gruen insgesamt, offline, 0
Modellaufrufe, 0 Production-Writes): Duplikat ohne Vormerkung ⇒ kein Kandidat, Motor `duplicate`,
0 Aufrufe; Duplikat mit Vormerkung ⇒ Kandidat und genau ein Aufruf; erschoepfter Wiederaufnahme-
deckel ⇒ plan- und motorseitig kein Aufruf; ausdrueckliche Freigabe ⇒ Kandidat und genau ein
Aufruf; `failed` ohne Freigabe ⇒ kein Kandidat und `skipped-failed`; `failed` mit Freigabe ⇒
Kandidat und genau ein Aufruf; **eine Freigabe greift nicht auf einen zweiten `failed`-Vorgang
ueber**; unlesbare Vormerkung und unlesbare Wiederaufnahmeliste stoppen fail closed; die
Auftragsgrenzen 169/122/113/0,80 USD/35 min bleiben woertlich unveraendert.

## 24 · Fuenfter (freigegebener) scharfer 169er Lauf: alle 122 Cluster verarbeitet, vier lokale unknown (2026-09-24)

Der Betreiber gab genau EINEN neuen scharfen Lauf frei (Quittung `verstehen169-20260924-c`,
Runtime-Commit `2d412d0418f5d6170f2c34ff69dbd846c4e0c703` = Merge von PR #541). Er wurde **genau
einmal** ausgefuehrt: Workflow-Run `35987448290`, `run_attempt = 1`, `failure`,
24.09.2026 10:28:42–10:54:17 UTC (Runner-Bericht 10:54:15 UTC, ca. 25 min).

**Bindung und Schutzvertrag hielten.** 169 Dokumente, `idHash 5f387840…a2ed9`, 122 Cluster,
Groessenverteilung 110/5/2/1/2/1/1, `maxModellaufrufe 113`, `maxUsd 0,8`, **81 Modellkandidaten**
⇒ `schutzvertrag = true`, `ausgeloest = true`. **Damit wirkte die Reparatur aus PR #541
belegbar:** der vierte Lauf war noch mit 114 Kandidaten im Schutzvertrag gescheitert; die
gemeinsame Entscheidung von Plan und Motor (`duplikatBrauchtAufruf`) und die verdrahtete
Betreiberfreigabe ergaben **80 + 1 = 81** Kandidaten (der eine ist die ausdrueckliche
`erneut`-Freigabe fuer `vg-gemeinsame-20260921-dcd0f5`).

**Ergebnis: vollstaendig verarbeitet, fachlich NICHT bestanden.** Alle **122 Cluster** wurden
abgearbeitet (erstmals), `abbruchGrund = null`, `vollstaendigVerarbeitet = true`,
`fachlichBestanden = false`. Bilanz: `saved 63`, `updated 14`, `duplicate 34`, `merged 7`,
`skipped-invalid 4` (`unbekannt 4`). **81 Modellaufrufe** (genau die Kandidatenzahl; die vier
unknown haben je einen Aufruf bezahlt), `quellenabrufe 0`, `profilwrites 0`, `kommunikation 0`,
Laufkosten **0,522795 USD** von 0,80 USD, `automatischeWiederholung: false`. Die Quittung
`verstehen169-20260924-c` ist terminal **`unbekannt`** und damit **verbraucht**.

**Die vier lokalen unknown** (alle `ausgang = unbekannt`, Klasse A aus §21 — **kein** globaler
Abbruch):

| Vorgang | reason | validierungsfehler | CAS danach (Betreiberbeleg) |
|---|---|---|---|
| `vg-gemeinsame-20260921-dcd0f5` | `validierung-fehlgeschlagen` | `["quellenbeleg-parteien"]` | `unbekannt`, versuche 2, ki_aufrufe 2, fencing 2, ergebnis_fencing null |
| `vg-arbeitsplätze-20260715-6cc672` | `aktualisierung-ungueltig` | `["quellenbeleg-parteien"]` | `unbekannt`, versuche 2, ki_aufrufe 2, fencing 2, ergebnis_fencing 1 |
| `vg-linkenpolitiker-20260921-37cdeb` | `validierung-fehlgeschlagen` | `["quellenbeleg-parteien"]` | `unbekannt`, versuche 1, ki_aufrufe 1, fencing 1, ergebnis_fencing null |
| `vg-verzögerung-20230613-95c80f` | `validierung-fehlgeschlagen` | `[]` | `unbekannt`, versuche 1, ki_aufrufe 1, fencing 1, ergebnis_fencing null |

Status, `reason`, `validierungsfehler` und Dokumentzahl stehen im Laufbericht (Log des Runs);
die CAS-Werte der vier Vorgaenge sind **Betreiberbelege**. **Keine Profilwirkung, keine
Kommunikation, kein Retry.** Die vier Vorgaenge bleiben terminal `unbekannt` und wurden in
diesem Sprint **nicht** erneut freigegeben.

## 25 · Die vier lokalen Fehler und ihre generische Reparatur (2026-09-24, PR #542)

**Status: Code bereit und gezielt testgesichert — NICHT Production-belegt.** Es wurde **kein**
neuer Lauf gestartet, **kein** Dispatch, **keine** Quittung beansprucht, **keine** CAS-Aenderung,
**keine** Profil-/Environment-/Cron-Aenderung, **kein** Merge.

### Ursache 1 — `parteien` war als Beteiligungsliste unbedingt streng

Der Validator prueft **nur den Nennungsbeleg**: jeder Wert in `parteien` muss woertlich im
tatsaechlich abgesendeten Prompt (Titel, Auszug, expliziter Artikelkontext) vorkommen. Die drei
betroffenen Antworten trugen mindestens einen `parteien`-Wert, der dort nicht woertlich stand
(Alias, amtliche Langform, Kuerzel oder Flexion). **Welcher konkrete Wert das war, ist NICHT
belegt** — die rohe Modellantwort wird bewusst nicht gespeichert; daraus wird hier nichts
abgeleitet. Belegt ist die Klasse: `quellenbeleg-parteien` ist genau die Wortmarke fuer „kein
woertlicher Nennungsbeleg“. Ein einzelner solcher Wert verwarf die **gesamte**, sonst brauchbare
Antwort.

### Ursache 2 — eine rein schemabedingte Ablehnung blieb anonym

`vg-verzögerung-20230613-95c80f` trug `validierungsfehler = []`. Das ist deterministisch
aufloesbar: `validateUnderstandingResult` fuehrt Quellenbeleg-Codes, den
`decision_level-antwortkonflikt` und die Schema-/DSGVO-Meldungen zusammen; der Bedienweg
uebernimmt nur die **festen** Codes. Ist die Liste leer, gab **ausschliesslich** eine
Schema-/DSGVO-Meldung den Ausschlag (ihr Text kann Rohwerte tragen und bleibt deshalb aussen).
**Welches Feld es war, ist aus den vorhandenen Belegen nicht rekonstruierbar** und wird nicht
erfunden. Deshalb wurde statt eines geratenen Feldfixes der **ganze generische Fehlerbereich**
vermesssen und abgesichert (`scripts/understanding-schema-diagnose-test.js`, **51 Pruefungen**):

**(1) Welche Schema-/DSGVO-Fehler koennen nach der heutigen Sanitisierung real entstehen?**
Gemessen gegen die echte Assemblierung — genau **zwei** Klassen:

* eine **Pflichtprosa bleibt leer** (`was_ist_passiert`, `warum_wichtig`, `wer_ist_betroffen`,
  `handlungsempfehlung`): das Feld fehlte bzw. war leer **oder** war laenger als 800 Zeichen und
  wurde deshalb bewusst **nicht** gekuerzt;
* ein **DSGVO-Treffer in der Prosa** (E-Mail-Muster). In Erwaeehnungslisten entfernt der
  bestehende Sanitizer solche Eintraege schon vorher (2.6); in der Prosa bleibt die Pruefung
  bewusst **laut** (2.7).

Alle uebrigen denkbaren Fehler sind **strukturell unerreichbar**, weil die Sanitisierung jede
angreifbare Form vorher neutralisiert: falsche Typen, ungueltige Enums, zu lange optionale Texte,
Nicht-Arrays, kaputte Eintraege und verschachtelte Strukturen erzeugen **keinen** Schema-Fehler
(1.x). Ein verbotenes PII-Feld kann nicht entstehen, weil die Schluessel aus unserem eigenen
Assembler stammen (2.4); der Zweig „Erwaehnungseintrag zu lang“ ist durch die 120-Zeichen-Grenze
unerreichbar (2.5). Jede Meldung wird gegen eine feste Klassenliste geprueft (2.y) — eine neue,
unbekannte Meldung waere ein Befund, kein Rauschen.

**(2) Welche davon sind deterministisch korrigierbar, ohne etwas zu erfinden oder zu verkuerzen?**
**Keine** — belegt in Abschnitt 3 derselben Suite:

* es wird **nichts erfunden**: eine fehlende Pflichtprosa bleibt leer und wird weder mit
  Ersatztext gefuellt (3.1) noch aus anderen Feldern abgeleitet (3.2);
* es wird **nichts verkuerzt**: ein 801-Zeichen-Kerntext erscheint nicht als kuerzere
  Tatsachenbehauptung (3.3), der Grenzwert 800 bleibt unveraendert erhalten (3.4), 801 wird
  abgewiesen (3.5). Das ist der **bereits abgenommene** Vertrag aus
  [`prosa-textgrenzen-2026-09-19.md`](prosa-textgrenzen-2026-09-19.md) (PR453/PR454): dort beginnt
  ein 440-Zeichen-Gegenfall mit einem behaupteten Beschluss und nimmt ihn am Ende ausdruecklich
  zurueck — nach einer Kuerzung war die Einschraenkung verloren. „Das kleinste sichere Verhalten
  ist, niemals einen zu langen Text in eine kuerzere Tatsachenbehauptung umzuwandeln.“
* die DSGVO-Klasse still zu bereinigen (statt abzulehnen) wuerde den **Sicherheitsalarm**
  abschalten und die Modellaussage veraendern; sie bleibt laut und fail closed.

**(3) Was bleibt fail closed?** Genau diese zwei realen Klassen. Fuer sie ist fail closed die
**einzige** Loesung, die „keine erfundene Aussage“ und „keine Informationsverfaelschung“
gleichzeitig einhaelt. **Kriterium 8 ist damit bewusst korrekt fail closed erfuellt und nicht
durch eine Verhaltensaenderung im Code loesbar** — jede Alternative waere Raten oder Vertragsbruch.
Geliefert wurde die Beseitigung der **Unsichtbarkeit** (wertfreie, rohwertfreie Codes; Abschnitte
4/5 der Suite) plus der belegte Nachweis, dass der Fehlerbereich vollstaendig vermessen ist.

### Die Reparatur (kleinste sichere Loesung, generisch)

* **`parteien` wird deterministisch reduziert — nur bei nachgewiesener Unabhaengigkeit**
  (`ohneUnbelegteAkteurswerte`): derselbe Beleg wie im strengen Validator, aber ein unbelegter
  String entfaellt **nur dann**, wenn er in **keinem anderen Feld** der Antwort vorkommt (Prosa,
  Empfehlung, Risiko/Chance, Listen, strukturierte Kommunikations-/Handlungselemente). Sonst bleibt
  `parteien` unveraendert und die Antwort wird wie bisher abgewiesen (`quellenbeleg-parteien`,
  `skipped-invalid`, nichts gespeichert) — **keine** abhaengige Prosa wird entfernt oder
  umgeschrieben. Damit bleibt der historische Grund der Sonderstrenge („keine stille
  Listenbereinigung bei erhaltener abhaengiger Empfehlung“) wirksam und wird geprueft statt
  umgangen. Die Beteiligungsliste `ausschuesse` bleibt **vollstaendig streng**; der strenge
  Validator und der GOLDSET-Auswerter pruefen unveraendert jeden Rohwert.
* **Wertfreie Schema-Diagnose** (`sichereSchemaFehler` in `understanding-schema.js`): die
  Schema-/DSGVO-Meldungen werden zusaetzlich als feste, **wertfreie** Codes gefuehrt
  (`schema-leer:<feld>`, `schema-enum:<feld>`, `schema-typ:<feld>`, `dsgvo-pii-feld`,
  `dsgvo-eintrag-zu-lang:<feld>`, …) — uebernommen wird ausschliesslich der **Fuehrende Feldpfad
  aus unserem eigenen Schema** (auch der Feldname im DSGVO-Fall stammt aus unserer festen
  Erwaeehnungsliste), niemals ein Modellwert. Der Bericht fuehrt nur diese Fassung
  (`sichereFehler`); `errors` bleibt fuer den Auswerter unveraendert vollstaendig.
* **Unveraendert:** 113er-Kandidatendeckel, 0,80 USD, 35 min, 4-USD-Tagesriegel, Quittungslogik,
  CAS/Fencing/Locks, At-most-once, Klassen A/B, Schema, `decision_level-antwortkonflikt`.
* **Zusatz (gleiche Ursache, ausserhalb der Fachlogik):** `scripts/lokal.js` und
  `scripts/lokaler-netzschutz.js` zitieren den Preload-Pfad in `NODE_OPTIONS`. In einem
  Projektpfad mit Leerzeichen zerlegte Node die Option sonst am Leerzeichen: der lokale Starter
  brach ab und der **Kindprozess-Schutz fiel still aus** (belegt durch `netzschutz-test.js`
  10.1–10.3).

**Belege.** `node scripts/lokal.js -- node scripts/run-offline-tests.js --aendert "<geaenderte
Dateien>"` (STANDARD + automatische Bereichs-Regression, offline, 0 Modellaufrufe, 0
Production-Writes) sowie die Pflicht-CI des PR. Zusaetzlich gezielt:
`parteien-quellenbindung-test` **29/29** (die zehn Pflichtfaelle in **beiden** Pfaden),
`understanding-schema-diagnose-test` **51/51** (Vermessung des Schema-/DSGVO-Bereichs),
`personen-quellenbindung-test` 10/10 (war auf `main` **bereits rot** — Altbestand aus PR #537,
nie in der CI gelaufen; ueber einen temporaeren Worktree auf `origin/main` belegt),
`ministerien-quellenbindung-test` 22/22, `ausschuesse-quellenbindung-test` 10/10,
`understanding-akteursbeleg-test` 21/21, `understanding-ebenen-konsistenz-test` 8/8,
`understanding-einzelvorgang-test` 49/49 (neu: wertfreier Schema-Code),
`verstehen-169-neuversuch-test` 19/19, `verstehen-einmalig-test` 117/117.
