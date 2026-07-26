# Berlin aktivieren — Runbook und Go-/No-Go-Grundlage

**Stand:** 2026-07-26 (zweiter Durchgang) · **Sprint:** Phase-1-Punkt 14 · **Zustand:**
aktivierungsreif **mit reduziertem Set**, **Production unverändert** · **Kanonische Daten:**
[`seeds/berlin-aktivierung.js`](../../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung.js) ·
[`seeds/berlin-neutralitaet.js`](../../lib/helmut/quellenarchitektur/seeds/berlin-neutralitaet.js) ·
[`seeds/berlin-profilplan.js`](../../lib/helmut/quellenarchitektur/seeds/berlin-profilplan.js)

> **Diese Datei beschreibt einen Eingriff, der noch nicht stattgefunden hat.**
> Es wurde **nichts** in Production aktiviert, kein Flag gesetzt, kein SQL ausgeführt, keine Zeile
> geschrieben. Alle Production-Zahlen stammen aus `select`-Abfragen. Brandenburg wurde nicht berührt.

---

## 0 · Was sich gegenüber dem ersten Durchgang geändert hat

Vier Korrekturen, alle belegt. Sie machen das Vorhaben **kleiner und ehrlicher**, nicht größer.

| # | Vorher | Jetzt | Grund |
|---|---|---|---|
| K-1 | Aktivierungsset **6 Wege** | **4 Wege** | 2 Wege sind seit dem 14.07. veraltet (§2) |
| K-2 | „**8 von 12** Pflichtklassen liefern" | **4 eigenständig, 1 mitabgedeckt, 7 ohne Weg** | „liefernd" zählte auch Klassen, die nur mitlaufen (§5) |
| K-3 | Last: **2** Crawl-Läufe/Tag, „bis 192 Dok./Tag gegen 15–20 Understandings" | **5** gemessene Vollrunden/Tag; Verarbeitung real **~40 KO/Tag**; Berlin real **4,6–11,4 Dok./Tag** | beide Terme der Alt-Rechnung waren falsch angesetzt (§7) |
| K-4 | V1 als SQL-Zeile im Runbook | V1 als **ausführbare Funktion** über Code *und* gemessenen DB-Bestand | eine Bedingung, die nur als Text existiert, kann nur vergessen werden (§3) |

## 1 · Der Unterschied, um den es geht

| Begriff | Bedeutung | Stand heute |
|---|---|---|
| **Aktivierungsreife** | Alles ist gebaut, geprüft und rückrollbar; der Eingriff ist auf die Zeile genau beschrieben | **erreicht** (für das reduzierte Set) |
| **Aktiviert** | Flag, Paketstatus, Wegstatus und Profil sind in Production gesetzt | nein |
| **Laufende Versorgung** | Berlin liefert über mehrere Läufe regelmäßig echte, aktuelle, politisch verwertbare Dokumente | nein, nicht bewiesen |

Punkt 14 ist erst mit der dritten Zeile erfüllt.

## 2 · Neuverifikation der Quellen (Bedingung V2) — **erfüllt**

Gelaufen auf einem GitHub-Actions-Runner mit **offenem Egress** (die Agenten-Sitzung selbst hat
keinen: `CONNECT` → `403`). Workflow `sprint9b-verify.yml`, neu eingrenzbar über `S9B_ONLY`.

- **Run 30208901908** — `S9B_ONLY=BE,BE+BB`, 10/10 real geprüft, Kontroll-Abruf
  `example.com`/`google.com` = HTTP 200 → die Urteile stammen vom Zielserver, nicht vom Proxy.
- **Run 30208997672** — Gegenprobe der drei kritischen Wege, **identische Werte**.

| Weg | HTTP | Items | jüngstes Item | Urteil | Folge |
|---|:--:|:--:|:--:|---|---|
| `rp-be-landesregierung` | 200 | 20 | **0 Tage** | geeignet | **aktivieren** |
| `rp-be-regionale_leitmedien` | 200 | 20 | **0 Tage** | geeignet | **aktivieren** |
| `rp-rbb24-politik` | 200 | 20 | **0 Tage** | geeignet | **aktivieren** |
| `rp-be-staatskanzlei` | 200 | 20 | **14 Tage** | geeignet | **aktivieren, unter Beobachtung** |
| `rp-be-landesfraktionen` | 200 | 20 | **41 Tage** | mit Einschränkung | **gesperrt — veraltet** |
| `rp-be-landesparlament` | 200 | 20 | **156 Tage** | mit Einschränkung | **gesperrt — veraltet** |
| `rp-be-plenum` | 200 | 8108 XML | — | geeignet | gesperrt — Dispatch liefert `items: []` |
| `rp-be-partei_pilot` | **429** | 0 | — | mit Einschränkung | gesperrt — Bot-Sperre, Parteipaket |
| `rp-be-fraktion_pilot` | **429** | 0 | — | mit Einschränkung | gesperrt — Bot-Sperre, Parteipaket |
| `rp-be-person_pilot` | 200 | 20 | 12 Tage | geeignet | gesperrt — Personenquelle, Parteipaket |

**Der wichtigste Befund: Erreichbarkeit ist nicht Lieferfähigkeit.** `rp-be-landesparlament` ist
**kritisch** markiert, antwortet mit HTTP 200, parst sauber 20 Items — und sein jüngster Eintrag ist
**156 Tage** alt (am 14.07. waren es 23). Titel[0] ist eine Bilderseite. Google News indexiert
`site:parlament-berlin.de` praktisch nicht mehr aktuell. Telemetrie hätte diesen Weg dauerhaft als
`ok` gemeldet — der gefährlichere Ausfall, weil er unsichtbar ist.

**Frischegate (neu, ausführbar):** ≤ 7 Tage `frisch` · ≤ 30 Tage `Beobachtung` · darüber `veraltet`
und **nicht aktivierbar**. Ein Weg ohne datierbares Item gilt als veraltet, nicht als frisch.
Maßstab ist der Produktzweck: Helmut baut eine **tägliche** Morgenlage.

## 3 · Neutralität von `berlin-basis` (Bedingung V1)

`berlin-basis` ist das `is_base`-Pflichtpaket **jedes** Berliner Landtagsmandats.

### 3.1 Einstufung aller zehn Wege

| Weg | Kategorie | gehört nach | aktiviert |
|---|---|---|---|
| `rp-be-landesregierung` | amtlich neutral | `berlin-basis` | **ja** |
| `rp-be-staatskanzlei` | amtlich neutral | `berlin-basis` | **ja** (Beobachtung) |
| `rp-be-regionale_leitmedien` | journalistisch neutral | `berlin-basis` | **ja** |
| `rp-rbb24-politik` | **mehrländrig** (BE + BB) | `berlin-basis` (+ `brandenburg-basis`) | **ja** |
| `rp-be-landesparlament` | amtlich neutral, aber **veraltet** | `berlin-basis` | nein |
| `rp-be-landesfraktionen` | amtlich neutral, aber **veraltet** | `berlin-basis` | nein |
| `rp-be-plenum` | **technisch ungeeignet** (Dispatch `items: []`) | `berlin-basis` | nein |
| `rp-be-partei_pilot` | **parteispezifisch** | `die-linke-berlin` | nein |
| `rp-be-fraktion_pilot` | **fraktionsspezifisch** | `die-linke-berlin` | nein |
| `rp-be-person_pilot` | **personenspezifisch** | `die-linke-berlin`, langfristig ein Mandatspaket | nein |

Kategorie `unklar` kommt **nicht** vor (ausführbar geprüft — sie wäre ein Befund, kein Grün).

### 3.2 Der Befund A-3, ausführbar statt behauptet

`pruefeBerlinNeutralitaet()` läuft mit **demselben** Prüfer über beide Bestände:

| Bestand | Ergebnis |
|---|---|
| **Code-Abbild** (`seeds/landesmodule-quellen.js`) | **neutral** — 0 Verstöße, 10 Zuordnungen eingestuft |
| **Production-Ist, gemessen 2026-07-26** | **nicht neutral** — 3 benannte Verstöße |
| **Production nach Block A** | **neutral** — die Umhängung genügt und nichts sonst |

Gemessen hängen in der Datenbank **alle zehn** Berliner Wege an `berlin-basis`;
`die-linke-berlin` existiert seit dem 26.07. 11:07 UTC mit **0 Wegen**. Ohne Block A bekäme ein
Mandat **jeder** Partei die Quellen **einer** Partei und die Nachrichtensuche zu **einer namentlich
benannten realen Person** (`CLAUDE.md` §4.2).

Die Erkennung nutzt **zwei unabhängige Merkmale** — Herausgebertyp *und* Pflichtklasse. Eine
einzelne falsch gepflegte Spalte umgeht die Prüfung dadurch nicht.

### 3.3 Offener Punkt: die Personenquelle gehört langfristig nirgends in den Katalog

`rp-be-person_pilot` ist eine Google-News-Suche auf eine **namentlich benannte reale Person**.
Nach Block A steht sie im optionalen Parteipaket und ist damit kein Neutralitätsverstoß mehr.
Sie widerspricht aber weiterhin dem Prinzip aus [`START_HERE.md`](../START_HERE.md) §5.4:
personenbezogene Quellen entstehen **zur Laufzeit aus dem Profil**
(`scheduler.personNewsSource`, id `<mandats-id>-news`), nicht als feste Katalogzeile.

**Nicht in diesem Sprint geändert**, weil das Entfernen die in Punkt 13 belegte Vollständigkeit von
`die-linke-berlin` (3/3 Pflichtklassen) aufbrechen würde — das ist eine eigene Entscheidung mit
eigenem Umfang. Der Weg bleibt **inaktiv**; das Risiko ist damit vertagt, nicht gelöst.

## 4 · Wie die Sperre funktioniert (vier unabhängige Riegel)

Berlin läuft erst, wenn **alle vier** offen sind. Jeder einzelne genügt, um es zu stoppen.

| # | Riegel | Ort | Zustand heute |
|---|---|---|---|
| 1 | **Landesmodul-Freigabe** `HELMUT_LANDESMODULE` | Vercel-Env oder `helmut-flags.json`; gelesen in `source-mode.js` | **leer** = jedes Landesmodul gesperrt |
| 2 | **Paketstatus** `berlin-basis` | `source_packages.status` | `prepared` → `computeGlobalActivation` aktiviert nicht |
| 3 | **Wegstatus** je Abrufweg | `retrieval_paths.activation_mode` | alle 10 auf `manual` → Plan-Regel 4b schließt aus |
| 4 | **Profil-Referenz** | `mandate_profiles` | 0 Landtagsprofile → Referenzzählung ergibt 0 |

Das Gate wirkt **je Land getrennt**. `HELMUT_LANDESMODULE=berlin` öffnet ausschließlich Berlin.
Es gibt bewusst **kein** Sammel-Schlüsselwort (`alle`, `*` sind wirkungslos).

## 5 · Pflichtklassen — mit Tiefe statt binär

Die alte Zählung kannte nur „liefert / liefert nicht". Sie zählte eine Klasse auch dann als
erfüllt, wenn sie bloß als **Nebenprodukt** der Suchanfrage einer anderen Klasse mitläuft.

| Zustand | Klassen | |
|---|---|---|
| **eigenständig** (eigener Weg) | `landesregierung`, `staatskanzlei`, `regionale_leitmedien`, `oer_landesberichterstattung` | **4** |
| **mitabgedeckt** (läuft an einer fremden Suchanfrage mit) | `ministerien` (an der Landesregierungs-Suche) | **1** |
| **ohne liefernden Weg** | `landesparlament`, `ausschuesse`, `landesfraktionen` (veraltet) · `plenum`, `drucksachen`, `schriftliche_anfragen`, `gesetzgebung` (PARDOK) | **7** |

**Das ist die unangenehme Zahl dieses Sprints:** Berlin startet **ohne jede amtliche
parlamentarische Quelle**. Was ankommt, ist Senat, Regierender Bürgermeister, Tagesspiegel und
rbb24 — eine tragfähige Tageslage, aber keine parlamentarische Vorgangsverfolgung.

Zum Vergleich, mit dem alten 6er-Set: 6 eigenständig + 2 mitabgedeckt. Die Aussage „8 von 12
liefern" verdeckte also **zwei nur formal erfüllte Klassen** — und sie stützte sich zusätzlich auf
zwei Wege, die inzwischen veraltet sind.

**Nebenbeobachtung, kein Paketfehler:** `rp-be-staatskanzlei` verfolgt das *Amt* des Regierenden
Bürgermeisters, nicht eine Person oder Partei. Da das Amt derzeit von einem CDU-Politiker
ausgeübt wird, ist der Strom faktisch CDU-lastig. Das ist politische Realität, keine
Parteibindung des Pakets — die Suchanfrage nennt eine Institution, keinen Namen.

## 6 · Auswahlpfade — wer bekommt was

| Profil | Pflichtpakete | ergänzend |
|---|---|---|
| Landtag Berlin, beliebige Partei | `bund-basis` + `berlin-basis` | — |
| Landtag Berlin, Die Linke | `bund-basis` + `berlin-basis` | `die-linke-berlin`, `die-linke-bund` |
| Bundestag | `bund-basis` | kein Landespaket |
| Landtag Brandenburg | `bund-basis` + `brandenburg-basis` | kein Berliner Paket |

Es gibt **zwei** Auswahlpfade, beide geprüft:

- **relational** (`HELMUT_SOURCE_MODE=on`, Production): `buildRelationalCrawlPlan` — dort greifen
  die Riegel 1–4.
- **Fallback** (leerer Plan / Ladefehler): der alte Katalog `lib/helmut/sources.js`. Er enthält
  **keine** Berliner Landesmodulquelle — Berlin kann über den Fallback technisch nicht laufen.

## 7 · Last und Verarbeitungskapazität — gegen gemessene Zahlen

### 7.1 Der Ist-Betrieb (read-only gemessen, 2026-07-26)

| Größe | Wert | Anmerkung |
|---|---|---|
| Rohdokumente je Tag | **277** | 1937 in 7 Tagen, 97 liefernde Quellen |
| je Quelle und Tag | **Median 1,14** · Mittel 2,85 · Max 41 | **nicht** `max_items` — der Median liegt bei gut einem Dokument |
| Anteil mit Knowledge-Object-Verknüpfung | **13 %** | Rohdokumente sind **nicht** Understandings |
| Knowledge Objects je Tag | **~40** (32–50) | 11 volle Tage |
| LLM-Aufrufe je Tag | **Mittel 64**, Max **100** | Tagesbudget 100 + 30 Reserve, fail-closed |
| Pending-Rückstand | **50** (43 `pending` + 7 `failed`) | **wächst nicht** — alle 43 stammen vom 02./03.07. |
| Crawl-Vollrunden je Tag | **5** (04:00, ~07:5x, 10:00, 16:00, 20:00 UTC) | Wiederholungsläufe holen nicht erneut ab (`skipped-shared`, 134–135 von 145) |
| Originalverweis aufgelöst | **99,5 %** | 1928 von 1937; **0** Dokumente tragen noch eine `news.google.com`-URL |

### 7.2 Zwei Fehler der Alt-Rechnung

Der erste Durchgang stellte „bis 192 Rohdokumente/Tag" einer „Verarbeitungskapazität von
~15–20 Understandings/Tag" gegenüber. **Beide Terme waren falsch angesetzt:**

1. Die reale Understanding-Leistung liegt bei **~40 KO/Tag**, nicht 15–20.
2. Rohdokumente **sind keine** Understandings — nur ~13 % werden überhaupt mit einem KO verknüpft.

Zusätzlich unterschätzte die Alt-Rechnung die **Abruflast** um den Faktor 2,5: sie nahm 2
Crawl-Läufe aus `vercel.json` an, real laufen **5** Vollrunden pro Tag.

### 7.3 Prognose für die 4 Wege

| Größe | Obergrenze | realistisch (gemessen) |
|---|---|---|
| zusätzliche Abrufe je Lauf | 4 – **100** | — |
| zusätzliche Abrufe je Tag | 20 – **500** | — |
| davon gegen `news.google.com` je Lauf | bis **98** | — |
| neue Rohdokumente je Tag | bis **320** | **4,6 – 11,4** (1,6 – 4,1 % des Ist-Eingangs) |
| zusätzliche LLM-Aufrufe je Tag | — | **+1 bis +2,6** |
| LLM je Tag nach Aktivierung (Mittel) | — | **~67 von 100** |
| Erstlauf, einmalig | **64 Dokumente** | ~15 LLM-Aufrufe |
| LLM-Aufrufe durch den Crawl selbst | **0** | Kosten entstehen erst im Understanding |

**Ehrlich:** Im Mittel reicht das Tagesbudget. **Am gemessenen Spitzentag (20.07., 100/100) gibt es
keinen Spielraum.** Das Budget ist fail-closed — es bricht nicht, es verschiebt Arbeit auf den
Folgetag. Die zusätzlichen Google-Requests verschärfen Befund **B1** (146 von 163 Wegen laufen
bereits über Google) und treffen dieselbe Drosselung wie **OP-15**.

### 7.4 Gewählte Gegenmaßnahme: gestaffelte Aktivierung

Die einfachste sichere Variante — **keine** neue Queue-Architektur, **keine** `max_items`-Änderung
(der Median von 1,14 Dokumenten/Tag zeigt, dass `max_items` außer im Erstlauf nicht bindet).

| Stufe | Wege | Google-Requests | weiter erst |
|---|---|---|---|
| **1** | `rp-be-regionale_leitmedien`, `rp-rbb24-politik` | **0** | nach einem vollen Crawl-Zyklus (≥ 2 Läufe) ohne neue Fehler |
| **2** | `rp-be-landesregierung`, `rp-be-staatskanzlei` | bis 98/Lauf | — |

Beide Stufen sind eigene, einzeln ausführbare SQL-Blöcke (B2.1 / B2.2) in derselben Datei.
Stufe 1 beweist die Kette ohne jede zusätzliche Google-Last.

## 8 · Profilweg (Bedingung V3)

Kanonisch: [`seeds/berlin-profilplan.js`](../../lib/helmut/quellenarchitektur/seeds/berlin-profilplan.js).
**In diesem Sprint wurde kein Profil angelegt.**

### 8.1 Zwei Befunde

**P-1 — die V3-Prüfung des Runbooks war notwendig, aber nicht hinreichend.**
`select count(*) from mandate_profiles where politische_ebene='landtag' and lower(bundesland)='berlin' and aktiv`
zählt **Zeilen**. Aktivierungsberechtigt ist ein Profil aber erst nach `isActivationEligible` →
`validateProfile`, und die liest die **gemappte** Form (`fullName`, `party`, `state`, `committees`).
Eine rohe `mandate_profiles`-Zeile ohne Identitätsfelder wird von der Zählabfrage mitgezählt, ist
aber `nicht_bereit` und trägt **0** zur Referenzzählung bei: `berlin-basis` bliebe **still inaktiv**,
obwohl die Prüfung 1 meldet. Geschärfte Abfrage steht im Modul (`V3_PRUEFABFRAGE`).

**P-2 — ein Berliner Profil braucht zwei Zeilen.** `fromMandateProfileRow` liest `fullName` aus
der Tabelle **`profiles`** (Spalte `name`), alles Übrige aus `mandate_profiles`. Fehlt die
`profiles`-Zeile, bleibt das Profil knapp aktivierungsberechtigt (die Partei genügt als Identität),
aber `impact.kannRadar` ist **false** — ein Beweislauf mit stillem Radar-Ausfall wäre kein Beweis.

### 8.2 Das Abnahmeprofil

Ausdrücklich ein **Testmandat**, **keine reale Person**, Partei `Fraktionslos` — damit bindet es
sich an **kein** Parteipaket und behauptet kein reales Mandat.

| Feld | Wert | Quelle |
|---|---|---|
| `id` / `user_id` | `helmut-abnahme-berlin` | beide Tabellen |
| `name` | `Testmandat Berlin (Helmut-Abnahme)` | `profiles.name` |
| `politische_ebene` | `landtag` | erzeugt die Landespaket-Zuordnung |
| `bundesland` | `Berlin` | wählt `berlin-basis` |
| `partei` | `Fraktionslos` | erfüllt die Identitätspflicht ohne Parteibindung |
| `wahlkreis` | `Berlin (Landesebene, Abnahmeprofil)` | erfüllt `region_oder_wahlkreis` |
| `fachpolitische_schwerpunkte` | `["Landespolitik Berlin"]` | erfüllt `schwerpunkt_oder_ausschuss` |
| `aktiv` | `true` | ohne das: `deaktiviert` |

**Geprüftes Ergebnis:** Pflichtpakete genau `bund-basis` + `berlin-basis` · kein Brandenburg-Paket ·
kein Parteipaket · die Referenz auf `profil-helmut-abnahme-berlin` bleibt folgenlos, weil es kein
solches Paket gibt. Gegenproben: Bundestagsprofil bekommt Berlin nicht · Brandenburg-Profil bekommt
Berlin nicht und behält sein eigenes · ein Berliner Linke-Profil bekommt zusätzlich
`die-linke-berlin` · ein Berliner Nicht-Linke-Profil **nicht** · falsches Bundesland, fehlende
Ebene, deaktiviert, gelöscht und leer werden alle abgelehnt.

### 8.3 Spätere Production-Schritte und Rückweg

| Schritt | mutierend |
|---|---|
| 1 Zeile in `profiles` (id + name) | **ja** |
| 2 Zeile in `mandate_profiles` (Felder oben) | **ja** |
| 3 Gegenprobe gegen das **gemappte** Profil (Zustand muss `vollstaendig` sein) | nein |
| 4 prüfen: `required` = `bund-basis` + `berlin-basis`, kein Brandenburg-Paket | nein |

**Rückweg — Deaktivieren schlägt Löschen:**

| Stufe | Mittel | Wirkung |
|---|---|---|
| **0** | `update mandate_profiles set aktiv = false` | sofort aus der Referenzzählung, Auditspur bleibt |
| **1** | zusätzlich `geloescht_at` setzen | unabhängig von `validateProfile` nicht mehr berechtigt |
| **2** | `delete` in beiden Tabellen | nur nach 0/1 und nur ohne anhängende erzeugte Daten |

## 9 · Ausführung (freigabepflichtig, nicht Teil dieses Sprints)

| Schritt | Datei / Ort | mutierend |
|---|---|---|
| 1 | `node scripts/backup-export.js --scope=seed` — Manifest `vollstaendig: true` | nein |
| 2 | Neuverifikation **erneut** laufen lassen, falls seit §2 mehr als 14 Tage vergangen sind | nein |
| 3 | **Block A** aus `supabase/seeds/20260726_berlin_aktivierung.sql` (Neutralisierung) | **ja** |
| 4 | Selbstprüfung 2 aus derselben Datei → 0 Zeilen | nein |
| 5 | Berliner Abnahmeprofil anlegen (§8, **zwei** Zeilen) | **ja** |
| 6 | **Block B1 + B2.1** (Paketstatus + die 2 Direktfeeds) | **ja** |
| 7 | `HELMUT_LANDESMODULE=berlin` setzen (Vercel-Env oder `helmut-flags.json` + Deploy) | **ja** |
| 8 | einen vollen Crawl-Zyklus beobachten (§10) | nein |
| 9 | **Block B2.2** (die 2 Google-Wege) — erst wenn Schritt 8 sauber war | **ja** |

Die Reihenfolge ist bindend: Flag **vor** Stufe 2, damit der schnellste Rückweg schon steht,
bevor die Google-Last dazukommt.

## 10 · Monitoring des ersten Laufs

Grundlage ist `source_crawl_telemetry` (je Weg eine Zeile pro Lauf).

| Frage | Messung |
|---|---|
| **Alter des jüngsten Dokuments je Weg** | **neu und wichtig** — `status='ok'` allein hätte den 156-Tage-Weg dauerhaft grün gemeldet |
| geplante vs. ausgeführte Berliner Wege | Plan-Kennzahl `landesmodule.aktiveWegeJeLand.berlin` gegen `count(distinct source_id)` mit `be-`/`rbb24`-Präfix |
| erfolgreiche Wege | `status='ok'` |
| leere Wege | `status='empty'` — zwei leere Läufe in Folge sind auffällig |
| fehlgeschlagene Wege | `status='error'`; `circuit-open` getrennt zählen (Befund A-7) |
| neue Dokumente je Weg | `new_documents` — Erwartung im Dauerbetrieb: **1–3 je Weg und Tag**, nicht 16 |
| Dedup | `found_documents` − `new_documents`; zusätzlich Fundstellen je Dokument |
| Originalverweis | Anteil mit `canonical_target_url` außerhalb `news.google.com` — **Ist heute 99,5 %** |
| politische Ebene | Anteil KO mit `decision_level='land'` |
| Geografie | Anteil `geo-land-berlin`; **getrennt** der Brandenburg-Anteil aus `rp-rbb24-politik` |
| LLM-Tagesverbrauch | `llm_budget_counters.used` gegen 100 — **Basiswert 64, Spitze 100** |
| Pending-Rückstand | muss auf dem Alt-Bestand (50) bleiben; jeder Zulauf ist ein Signal |
| bestehende Bundescrawls | Zahl der Bund-Wege mit `ok` vor/nach der Aktivierung — muss gleich bleiben |
| Laufzeit | `durationMs` je Lauf gegen 300 s Funktionsbudget |

**Empfohlene Beobachtungsdauer: 3 Tage = 6 Crawl-Läufe** je Stufe. Ein Weg gilt als tragfähig, wenn
er in **mindestens 4 der 6 Läufe** `ok` liefert **und** neue Dokumente beisteuert **und** sein
jüngstes Dokument im Frischefenster bleibt.

## 11 · Abbruchkriterien

Sofortiger Abbruch (Rollback Stufe 0), wenn eines eintritt:

1. ein Weg eines **nicht freigegebenen** Landes erscheint im Plan oder in der Telemetrie
2. `brandenburg-basis` ist nicht mehr `prepared` oder ein `rp-bb-*`-Weg ist nicht mehr `manual`
3. die Zahl erfolgreicher **Bund**-Wege sinkt gegenüber dem Vorlauf
4. mehr als 1 der aktivierten Wege endet in einem Lauf mit `error`
5. Google-`429`-Rate oder `circuit-open`-Zeilen steigen gegenüber dem Vorlauf messbar
6. Crawl-Laufzeit überschreitet 240 s (80 % des 300-s-Funktionsbudgets)
7. mehr als **150** zusätzliche Abrufe in einem Lauf (Obergrenze des Sets: 100)
8. der LLM-Tagesverbrauch erreicht an zwei Tagen in Folge 100/100
9. der Pending-Rückstand wächst über zwei Läufe hinweg monoton über 50 hinaus
10. Berliner Dokumente werden mehrheitlich **nicht** als `land`/`geo-land-berlin` erkannt
11. ein Berliner Profil erhält Inhalte einer fremden Partei aus einem Pflichtpaket
12. mehr als 20 % der neuen Dokumente ohne auflösbaren Originalverweis (Ist: 0,5 %)
13. zwei aufeinanderfolgende Läufe liefern über alle aktivierten Wege 0 neue Dokumente
14. das jüngste Dokument eines aktivierten Wegs überschreitet 30 Tage
15. der Rollback ist nicht ausführbar

## 12 · Rollback (drei Stufen, getestet)

| Stufe | Mittel | Wirkung | Dauer |
|---|---|---|---|
| **0** | `HELMUT_LANDESMODULE` leeren (Vercel-Env) | alle Landesmodule sofort gesperrt, **kein** DB-Schreibzugriff | Sekunden |
| **1** | `20260726_berlin_aktivierung_rollback.sql` | **alle 7** Wege des Basispakets → `needs_review`/`manual`, `berlin-basis` → `prepared`; **Neutralisierung bleibt** | < 1 min |
| **2** | `20260726_berlin_aktivierung_rollback_vollstaendig.sql` | zusätzlich Block A zurück → exakt der gemessene Ist-Zustand vom 2026-07-26, **inklusive Befund A-3** | < 1 min |

**Gehärtet in diesem Durchgang:** Stufe 1 und 2 setzen jetzt **alle sieben** Wege des Basispakets
zurück, nicht nur das aktuelle Aktivierungsset. Ein Rollback, der nur die heute aktivierten 4 Wege
zurücknimmt, ließe genau die Wege aktiv, die eine **ältere** Planfassung (6 Wege) scharfgeschaltet
hat — und hätte sich trotzdem als vollständig gemeldet.

**Was der Rollback nicht tut:** bereits erzeugte Berliner Rohdokumente, Knowledge Objects und
Telemetriezeilen werden **nicht** gelöscht. Die Auditspur bleibt vollständig.

**Testnachweis:** `node scripts/berlin-aktivierung-test.js` führt das **committete** SQL gegen eine
Speicherdatenbank aus und prüft Anwendung, Idempotenz und beide Rollback-Stufen; Stufe 2 wird
zeilengenau gegen den Ausgangszustand verglichen. Der Mini-SQL-Ausführer bricht bei jeder ihm
unbekannten Statementform hart ab.

## 13 · Was Brandenburg und der Bund betrifft

- **Brandenburg bleibt inaktiv.** Kein ausführbares Statement der drei SQL-Dateien nennt einen
  `rp-bb-*`-Weg oder ein `brandenburg-*`-Paket (als Zeichenketten-Invariante geprüft, jetzt auch
  für beide Rollback-Dateien). Gemessen 2026-07-26: `brandenburg-basis` = `prepared`, 9 Wege, alle
  `needs_review`/`manual`. **Dieser Sprint hat daran nichts geändert.**
- **Eine benannte Nebenwirkung:** `rp-rbb24-politik` hängt in **beiden** Landespaketen (rbb ist ein
  Zwei-Länder-Sender). Er läuft über die **Berliner** Referenz mit und bringt damit auch
  Brandenburg-Inhalte in den Rohstrom. Das ist **keine** Aktivierung Brandenburgs — kein
  Brandenburg-Paket, -Weg oder -Profil wird aktiv, `brandenburg-basis` steuert 0 Referenzen bei.
- **Der Bund bleibt unverändert.** Kein Bundesweg wird angefasst; Berlin kommt rein additiv dazu
  (+4 Wege).
- **Verhältnis zum Landesmodul-Seed `20260717`:** Der Seed würde die P0-2-Umhängung für **beide**
  Länder vornehmen, Block A nur für Berlin. Beide Wege führen zu einem neutralen `berlin-basis`;
  sie widersprechen sich nicht. Wird der Seed zuerst eingespielt, ist Block A wirkungslos
  (idempotent) — die Selbstprüfung meldet dann bereits 0 Zeilen.

## 14 · Bekannte Grenzen

1. **Berlin startet ohne amtliche parlamentarische Quelle** (§5). Das ist die größte fachliche
   Lücke. Die Reparatur von `rp-be-landesparlament` (breitere Suchanfrage ohne `site:`-Operator
   oder ein Direktfeed) ist ein eigener Schritt **mit eigener Verifikation**; sie zu raten wäre
   eine erfundene Quelle.
2. `rp-be-plenum` verweist auf `pardok-wp19.xml`. Wechselt die Berliner Wahlperiode, ändert sich
   die Adresse. Der Weg wird nicht aktiviert — das Risiko ist vertagt, nicht gelöst.
3. 2 der 4 aktivierten Wege sind Google-News-Suchwege, keine amtlichen Direktfeeds.
4. Ein Berliner Testmandat existiert nicht. Der Nachweis der Verarbeitungskette ist bis heute
   ausschließlich lokal geführt (`scripts/berlin-aktivierung-test.js`,
   `scripts/berlin-neutralitaet-test.js`).
5. Die Personenquelle im Parteipaket bleibt ein offener Grundsatzpunkt (§3.3).
6. Die Verifikation aus §2 ist eine Momentaufnahme. Zwei Wege sind zwischen dem 14.07. und dem
   26.07. veraltet — genau deshalb gehört sie **unmittelbar vor** die Aktivierung wiederholt.

## 15 · Go-/No-Go-Bericht (Stand 2026-07-26, zweiter Durchgang)

| Kriterium | Stand |
|---|---|
| 1 `berlin-basis` nachweislich neutral | **im Code ja, in der Datenbank NEIN** (A-3 offen) → Block A ist Vorbedingung |
| 2 Aktivierungsset aktuell verifiziert | **ja** — 4 von 4 Wegen heute real geprüft, zweimal reproduziert |
| 3 sicherer Berliner Profilplan | **ja** — getestet, mit zwei korrigierten Befunden (P-1, P-2) |
| 4 Last übersteigt die Verarbeitung nicht unkontrolliert | **ja** — +1,6 bis 4,1 % Eingang, +1 bis +2,6 LLM/Tag; Spitzentag-Vorbehalt benannt |
| 5 Monitoring und Rollback getestet | **Rollback ja** (ausgeführtes SQL), **Monitoring nur definiert**, nie gegen einen echten Berliner Lauf erprobt |
| 6 alle Pflichtprüfungen grün | **ja** — 152/152 Offline, 32/32 Browser, Seed-Drift grün |
| 7 keine verschwiegene Restunsicherheit | **ja** — §14 nennt sechs, darunter die fehlende parlamentarische Quelle |

**Empfehlung: Go mit Bedingungen — für das reduzierte Set von 4 Wegen, gestaffelt.**

Bedingungen, in dieser Reihenfolge:

1. **Block A zuerst** (Neutralisierung). Ohne ihn ist eine Aktivierung ausgeschlossen — sie gäbe
   jedem Berliner Mandat die Quellen einer Partei und eine Personensuche.
2. **Sicherung** nach V6 (`backup-export.js --scope=seed`, Manifest `vollstaendig: true`).
3. **Nur Stufe 1** (die zwei Direktfeeds) im ersten Schritt; Stufe 2 erst nach einem sauberen
   vollen Crawl-Zyklus.
4. **Neuverifikation wiederholen**, wenn zwischen §2 und der Ausführung mehr als 14 Tage liegen.
5. **Bewusst akzeptieren**, dass Berlin ohne amtliche parlamentarische Quelle startet — oder
   `rp-be-landesparlament` vorher reparieren und neu verifizieren.

**Kein Go für:** `rp-be-landesparlament`, `rp-be-landesfraktionen` (veraltet), `rp-be-plenum`
(strukturell 0 Items), `die-linke-berlin` und seine drei Wege (Parteipaket, 2× bot-gesperrt),
jede Brandenburg-Änderung, jede `max_items`- oder Cron-Änderung.
