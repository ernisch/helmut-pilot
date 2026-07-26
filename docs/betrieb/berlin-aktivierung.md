# Berlin aktivieren — Runbook und Go-/No-Go-Grundlage

**Stand:** 2026-07-26 (dritter Durchgang, Production-Sprint) · **Sprint:** Phase-1-Punkt 14 ·
**Zustand:** aktivierungsreif **mit reduziertem Set**, **Sicherung erstellt**, **Production
weiterhin unverändert** — die Aktivierung ist an einem fehlenden Zugang blockiert (**§16**) ·
**Kanonische Daten:**
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

**Gegenprobe zur Methode (Run 30209848288, voller Umfang, 24 Wege).** Der Verdacht liegt nahe, dass
der `site:`-Operator in Google News generell nicht mehr trägt. Er trägt: `bb-landesparlament` nutzt
**dieselbe Abfrageform** (`site:landtag.brandenburg.de`) und liefert ein **1 Tag** altes jüngstes
Item; `bundesregierung` (`site:bundesregierung.de`) und `die-linke` (`site:die-linke.de`) liegen bei
**0 Tagen**. Das Problem ist also **domänenspezifisch**: Google News indexiert
`parlament-berlin.de` nicht mehr aktuell. Damit ist auch die Reparaturrichtung klar — nicht die
Methode wechseln, sondern die Abfrage vom `site:`-Operator lösen. Das bleibt ein eigener Schritt
**mit eigener Verifikation**; ihn hier zu raten wäre eine erfundene Quelle.

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
2. ~~**Sicherung** nach V6 (`backup-export.js --scope=seed`, Manifest `vollstaendig: true`).~~
   **Erledigt am 2026-07-26, 16:47 UTC** — 8/8 Tabellen, 0 Fehler, `vollstaendig: true`,
   an `mainCommit 93006e8` gebunden (§16.3). Gültig, solange `retrieval_paths`,
   `package_paths` und `source_packages` unverändert bleiben.
3. **Nur Stufe 1** (die zwei Direktfeeds) im ersten Schritt; Stufe 2 erst nach einem sauberen
   vollen Crawl-Zyklus.
4. **Neuverifikation wiederholen**, wenn zwischen §2 und der Ausführung mehr als 14 Tage liegen.
5. **Bewusst akzeptieren**, dass Berlin ohne amtliche parlamentarische Quelle startet — oder
   `rp-be-landesparlament` vorher reparieren und neu verifizieren.

**Kein Go für:** `rp-be-landesparlament`, `rp-be-landesfraktionen` (veraltet), `rp-be-plenum`
(strukturell 0 Items), `die-linke-berlin` und seine drei Wege (Parteipaket, 2× bot-gesperrt),
jede Brandenburg-Änderung, jede `max_items`- oder Cron-Änderung.

## 16 · Ausführungsprotokoll des Production-Sprints vom 2026-07-26 (Stufe 1)

**Sprintzustand: blockiert. Keine Production-Mutation erfolgt.** Ausgeführt wurden ausschließlich
`select`-Abfragen und der read-only Backup-Export. Kein `insert`, kein `update`, kein `delete`, kein
Flag, kein Profil, kein Crawl.

### 16.1 Startbedingungen — 11 von 12 erfüllt

| # | Bedingung | Ergebnis |
|---|---|---|
| 1 | PR #134 in `main` gemergt | **ja** — `merged: true`, 2026-07-26 16:38:41 UTC |
| 2 | finaler PR-Commit Bestandteil von `main` | **ja** — `e2be0a4` und `5cfce6c` sind Vorfahren |
| 3 | Pflichtprüfungen von #134 grün | **ja** — 6/6 `success`, beide Pflicht-Checks grün |
| 4 | lokaler Stand == `origin/main` | **ja** — `93006e8` |
| 5 | Arbeitsbaum sauber | **ja** |
| 6 | keine neueren Berlin-Änderungen | **ja** — 0 Commits nach `93006e8`; V2-Verifikation 0 Tage alt (Grenze 14) |
| 7 | Brandenburg vorbereitet/gesperrt und inaktiv | **ja** — `brandenburg-basis` = `prepared`, alle 9 Wege `needs_review` + `manual`, 0 BB-Profile |
| 8 | keine laufende/teilweise Berliner Aktivierung | **ja** — alle 10 BE-Wege `needs_review` + `manual`, `berlin-basis` = `prepared`, 0 Landtagsprofile, **0** Berliner Telemetriezeilen jemals |
| 9 | keine parallele Änderung derselben Tabellen | **ja** — letzte Konfigänderung 11:13:10 UTC, seither unverändert (Messung 16:45 UTC) |
| 10 | **notwendige Production-Zugänge vorhanden** | **NEIN — siehe §16.5** |
| 11 | Backup-/Aktivierungs-/Rollback-Werkzeuge auf `main` | **ja** — alle vorhanden, Backup real ausgeführt |
| 12 | Sprint ausdrücklich freigegeben | **ja** |

**Nebenbefund zu #6:** der offene **PR #132** (Brandenburg, seit 15:24 UTC) führt einen
*konkurrierenden* Gate-Namen `HELMUT_LANDESMODUL_FREIGABE` ein, während `main` seit #133/#134
`HELMUT_LANDESMODULE` verwendet. `main` ist maßgeblich und #132 ist nicht gemergt — vor einem
Merge von #132 muss aber entschieden werden, welcher Gate-Name gilt, sonst entsteht ein zweites,
womöglich abweichend benanntes Landesmodul-Gate.

### 16.2 Gemessener Production-Ausgangszustand (2026-07-26, 16:45–16:52 UTC)

| Bereich | Messwert |
|---|---|
| Pakete | **9**; `berlin-basis` `prepared`/`is_base`/**10 Wege** · `brandenburg-basis` `prepared`/9 Wege · `die-linke-berlin` `prepared`/**0 Wege** |
| Berliner Wege | **10/10** `needs_review` + `manual`, alle `updated_at` = 2026-07-14 06:53:45 |
| Brandenburg-Wege | **9/9** `needs_review` + `manual`, unverändert |
| nicht-neutrale Zuordnungen | **3** — `rp-be-partei_pilot`, `rp-be-fraktion_pilot`, `rp-be-person_pilot` an `pkg-berlin-basis` (Befund **A-3** erneut bestätigt) |
| Profile | 8 (6 aktiv), **alle `bundestag`** — **0 Landtagsprofile**, 0 Berliner Mandat |
| `HELMUT_LANDESMODULE` | in `helmut-flags.json` **nicht gesetzt**; Vercel-Env **nicht lesbar** (§16.5) |
| Crons | 9 Einträge in `vercel.json`, unverändert; real 5 Crawl-Vollrunden/Tag |
| Locks | 3 Zeilen in `pipeline_locks`, **alle abgelaufen** — nichts hängt |
| Pending-Rückstand | **50** (43 `pending` + 7 `failed`) — unverändert, wächst nicht |
| Rohdokumente | **1978** in 7 Tagen (≈ **283/Tag**), 215 in 24 h; gesamt 8733 |
| Knowledge Objects | 712 gesamt · **274** in 7 Tagen (≈ **39/Tag**) · 31 in 24 h |
| LLM-Nutzung | heute **34**/100; letzte 8 Tage 34/53/65/53/55/59/**100**/88 (Mittel ≈ 63, Spitze 100 am 20.07.) |
| Bundesversorgung | letzter Vollcrawl `crawl-20260726160130-7bznw` 16:01:32 UTC: **145 von 147** Wegen `ok`, 2 `empty`, **0 error**, 0 `circuit-open`, 940 neue Dokumente, Laufzeit **33 s** |
| Invariante B3 | **erfüllt** — 147 Telemetriezeilen = 147 distinct `source_id` |
| Fehlerrate 24 h | 28 Fehlerzeilen von 2534 (**1,1 %**), 56 `circuit-open`, 16 Retries |
| Berliner Bestand | **0** Rohdokumente, **0** Telemetriezeilen, 0 Berliner Knowledge Objects aus Landesquellen |
| Originalverweis | **99,5 %** aufgelöst (7 Tage) |

### 16.3 Backup — ausgeführt und vollständig

`node scripts/backup-export.js --scope=seed`, Exit **0**:

- Verzeichnis `backups/2026-07-26T16-47-32-498Z/` (gitignored — Production-Daten bleiben aus dem Repo)
- **8/8 Tabellen**, `fehler: []`, **`vollstaendig: true`**
- Zeilen: `geographies` 50 · `political_entities` 73 · `publishers` 64 · `retrieval_paths` **163** ·
  `source_packages` **9** · `package_paths` **165** · `path_expected_levels` 18 · `path_expected_geographies` 18
- `pruefsummeGesamt` `49a5b92d…cc0ee`, je Tabelle eine eigene Prüfsumme
- gebunden an `mainCommit` `93006e8cdbf71593c35c1d02b3df17c43a9f7eea`

**Damit ist Go-Kriterium 2 der Seed-Einspielung erstmals erfüllt** — es war seit 2026-07-25
blockiert, weil der damaligen Sitzung die Supabase-Zugangsdaten fehlten. Das Backup deckt
weiterhin nur die 8 Quellentabellen ab und **ersetzt OP-01 nicht**.

### 16.4 Dry Run — gegen den gemessenen Ist-Zustand, nicht gegen die Doku

| # | Tabelle | Datensatz | aktuell | geplant | Grund | Rollback-Wert |
|---|---|---|---|---|---|---|
| A1 | `package_paths` | `pkg-die-linke-berlin` × 3 Wege | Zeile fehlt (**3**) | Zeile vorhanden | Parteipaket wird Zielort | Zeile wieder löschen |
| A2 | `package_paths` | `pkg-berlin-basis` × dieselben 3 Wege | Zeile vorhanden (**3**) | Zeile gelöscht | Pflichtpaket neutralisieren (A-3) | Zeile wieder anlegen |
| B1 | `source_packages` | `berlin-basis` | `prepared` (**1**) | `active` | Referenzzählung möglich machen | `prepared` |
| B2.1 | `retrieval_paths` | `rp-be-regionale_leitmedien`, `rp-rbb24-politik` | `needs_review`/`manual` (**2**) | `healthy`/`auto` | Stufe 1, 0 Google-Requests | `needs_review`/`manual` |
| B2.2 | `retrieval_paths` | `rp-be-landesregierung`, `rp-be-staatskanzlei` | `needs_review`/`manual` (2) | — | **Stufe 2, in diesem Sprint nicht vorgesehen** | — |

**Kontrollfragen, alle 0:** getroffene Bundeswege **0** · getroffene Brandenburg-Wege **0** ·
getroffene `pkg-brandenburg-basis`-Zeilen **0**.

Die Trefferzahlen entsprechen **exakt** dem Plan (3/3/1/2). Es gibt keine unerwartete Zusatzzeile.
`die-linke-berlin` trägt heute 0 Wege, daher legt A1 genau 3 Zeilen an und Rollback Stufe 2 ist
zeilengenau umkehrbar — es entsteht keine Doppelzuordnung, die ein Rollback zu weit zurückdrehen
könnte.

### 16.5 Der Blocker: Riegel 1 ist aus dieser Sitzung weder lesbar noch setzbar

Die Ausführungsreihenfolge in §9 verlangt in Schritt 7 `HELMUT_LANDESMODULE=berlin`. Dieser Schritt
ist aus einer Claude-Code-Cloud-Sitzung **nicht ausführbar**:

| Weg zum Flag | Stand |
|---|---|
| **Vercel-Env setzen** | `VERCEL_TOKEN` ist in dieser Sitzung **nicht gesetzt**; der Vercel-MCP-Server stellt **kein** Werkzeug für Environment-Variablen bereit |
| **Vercel-Env lesen** | aus demselben Grund nicht möglich — der **aktuelle Produktionswert des Flags ist nicht feststellbar**, und Vercel-Env überstimmt `helmut-flags.json` immer |
| **`helmut-flags.json` + Deploy** | erfordert einen Merge nach `main`; Merge = Production-Deployment und ist ausdrücklich Betreiberentscheidung (`CLAUDE.md` §5) |
| **Crawl auslösen** | `https://helmut-pilot.vercel.app` ist aus dieser Sitzung nicht erreichbar (Proxy: `CONNECT` → **403**); `CRON_SECRET` ist nicht gesetzt |

Was **verfügbar** ist: Supabase-Egress ist offen (HTTP 200), deshalb funktionieren Messung, Backup
und — grundsätzlich — auch die SQL-Blöcke. Der Crawl-Verlauf wäre über `source_crawl_telemetry`
sogar beobachtbar. Es fehlt ausschließlich der Schalter.

**Warum daraus „keine Mutation" folgt und nicht „so weit wie möglich ausführen":**

1. **Rollback Stufe 0 wäre nicht verfügbar.** Der schnellste Rückweg — Flag leeren, **ohne**
   Schreibzugriff auf Production — setzt genau den Zugang voraus, der fehlt. Wer das Flag nicht
   setzen kann, kann es auch nicht leeren. Damit greift Abbruchkriterium **20** („Rollback ist
   nicht unmittelbar ausführbar") und §11 Kriterium **15** unmittelbar.
2. **Riegel 1 ist nicht messbar.** Phase 1 verlangt „Erfasse `HELMUT_LANDESMODULE`", Phase 5
   verlangt „Das Berlin Flag enthält kein Sammelwort und kein weiteres Land". Beides ist ohne
   Vercel-Zugriff nicht belegbar. Eine Aktivierung, bei der einer der vier Riegel weder gelesen
   noch gesteuert werden kann, ist ein widersprüchlicher Production-Zustand.
3. **Vier Riegel würden zu einem.** Nach Block A + Profil + B1 + B2.1 stünde zwischen dem heutigen
   sicheren Zustand und einem laufenden Berliner Crawl nur noch eine einzelne Env-Variable —
   gesetzt zu unbekannter Zeit von jemandem, der die Datenbankänderungen nicht selbst begleitet
   hat, ohne dass der erste Lauf beobachtet wird. Die bindende Reihenfolge aus §9 („Flag **vor**
   Stufe 2, damit der schnellste Rückweg schon steht") wäre verletzt.
4. **Der Sprintzweck wäre nicht erreichbar.** Ziel ist der erste reale Berliner Crawl **und dessen
   Auswertung**. Ohne Flag betritt kein Berliner Weg den Plan; es gäbe keinen Lauf, keine
   Dokumente, keinen Beweis — nur eine halb ausgeführte Production-Änderung.

Deshalb: **keine Mutation, Sprint blockiert** — entsprechend der Sprintregel „fehlende
Startbedingung → keine Production-Mutation, keine improvisierte Ersatzlösung".

### 16.6 Übergabe an den Betreiber — was jetzt genau zu tun ist

Das Backup (§16.3) ist gültig, solange `retrieval_paths`/`package_paths`/`source_packages`
unverändert bleiben. Reihenfolge unverändert nach §9:

1. **`HELMUT_LANDESMODULE` bereitstellen** — entweder Wert `berlin` in der Vercel-Env setzen
   (bevorzugt: sofort wirksam, Rollback Stufe 0 ohne DB-Schreibzugriff), **oder** einer
   Agenten-Sitzung `VERCEL_TOKEN` über die Claude-Code-Environment-Einstellungen bereitstellen
   (`CLAUDE.md` §4.9), damit der Schritt dort ausführbar wird. Der Wert ist exakt `berlin` —
   **kein** Sammelwort, **kein** zweites Land.
2. **Block A** ausführen (3 Zeilen um, siehe §16.4) und Selbstprüfung 2 → 0 Zeilen.
3. **Abnahmeprofil** anlegen (§8.2, **zwei** Zeilen).
4. **Block B1 + B2.1** ausführen (1 + 2 Zeilen).
5. Flag setzen, einen vollen Crawl-Zyklus nach §10 beobachten.
6. **Block B2.2 erst danach** — Stufe 2 ist in keinem Fall Teil des ersten Schritts.

Solange Schritt 1 nicht geklärt ist, sind die Schritte 2–4 **nicht** vorzuziehen: sie nehmen drei
der vier Riegel weg, ohne dass der vierte kontrollierbar ist.

## 17 · Befunde der unabhängigen Vorprüfung (2026-07-26, vor der Aktivierung)

Vier Prüfer plus vier Gegenprüfer haben die Zusagen dieses Runbooks gegen den Code auf `93006e8`
geprüft. Die vier folgenden Befunde sind **selbst nachgeprüft** und gehören vor der Aktivierung
entschieden. Sie ändern die Empfehlung aus §15 nicht, aber sie ändern die Ausführung.

### V-1 (kritisch) · Die Staffelung ist im SQL nicht erzwungen — B2.1 und B2.2 teilen eine Transaktion

`20260726_berlin_aktivierung.sql` schreibt in Block B **ein** `begin;` … `commit;` um B1, B2.1
**und** B2.2. Der Kommentar „die Stufen sind EINZELN auszuführen, nicht zusammen" ist damit die
einzige Sperre — eine Kommentarzeile. Wer Block B als Ganzes ausführt (das ist die naheliegende
Lesart einer Datei mit `begin`/`commit`), schaltet **alle vier** Wege auf einmal scharf, inklusive
der zwei Google-Wege, deren ganzer Zweck es war, einen vollen Crawl-Zyklus **später** zu kommen.

Die gesamte Lastbegründung aus §7.4 hängt an dieser Trennung. **Vor der Ausführung:** B2.2 in einen
eigenen `begin`/`commit`-Block ziehen (oder in eine eigene Datei), sodass die Staffelung strukturell
und nicht nur redaktionell besteht. Bis dahin gilt: **nur die Zeilen B1 und B2.1 einzeln ausführen**,
niemals den Block am Stück.

### V-2 (wichtig) · Das Abnahmeprofil ist kein mandantenbezogener Schalter — der Crawl-Plan ist global

`loadRelationalSharedSources()` (`scheduler.js:758–773`) nimmt **keinen** Profilparameter: es baut
**einen** Plan aus *allen* Profilen. `getSourcesForProfile()` (`scheduler.js:776–787`) mischt genau
diesen Plan in die Quellenliste **jedes** Profils.

**Folge:** ein einziges Berliner Abnahmeprofil aktiviert die Berliner Wege **systemweit**. Sobald
Profil + Paketstatus + Wegstatus + Flag stehen, laufen die Berliner Wege im geteilten Crawl mit,
aus dem auch der bestehende reale Pilotmandant versorgt wird. Das ist **keine** Verdrängung
(die Bundeswege bleiben unverändert, Berlin kommt rein additiv dazu) und deckt sich mit dem
Lastmodell in §7.3 — die Formulierung „das Profil ist der vierte Riegel" in §4 legt aber eine
Mandantenschärfe nahe, die es auf der Crawl-Ebene nicht gibt. Mandantenscharf ist erst die
**Auswahl stromabwärts** (Briefing, Radar), nicht der Abruf.

Vor der Aktivierung ist das ausdrücklich zur Kenntnis zu nehmen: der Beweislauf findet **im
geteilten Korpus** statt, nicht in einer isolierten Testspur.

### V-3 (wichtig) · Rollback Stufe 0 wirkt nur, wenn die Freigabe über die Vercel-Env kam

§9 Schritt 7 erlaubt die Freigabe wahlweise über **Vercel-Env** oder über **`helmut-flags.json` +
Deploy**. Die Rollback-Tabelle in §12 verspricht dagegen pauschal „Stufe 0 = `HELMUT_LANDESMODULE`
leeren (Vercel-Env), Sekunden".

`flags.js:74–87` gibt `process.env` Vorrang — aber ein **leerer** Env-Wert gilt als *nicht gesetzt*
und fällt auf die Dateiebene durch. Wurde die Freigabe also über `helmut-flags.json` erteilt, ist
das Leeren der Env-Variable **wirkungslos**; der Dateiwert gewinnt sofort wieder. Der Rückweg wäre
dann ein Commit + Deploy, also Minuten statt Sekunden.

**Konsequenz für die Ausführung:** die Freigabe **über die Vercel-Env** erteilen, nicht über die
Datei. Nur dann stimmt die zugesagte Rollback-Dauer, und nur dann ist Stufe 0 ohne
Repo-Änderung erreichbar.

### V-4 (Hinweis) · „öffnet ausschließlich Berlin" ist eine Spur zu stark formuliert

Das Gate vergleicht mit `landesmodule.some(land => freigegeben.has(land))` (`source-mode.js:172`).
Der zweiländrige Weg `rp-rbb24-politik` hängt in `berlin-basis` **und** `brandenburg-basis` und
läuft deshalb schon bei reiner Berlin-Freigabe mit. Das ist die in §13 bereits benannte und bewusst
akzeptierte Nebenwirkung — **keine** Aktivierung Brandenburgs (kein `rp-bb-*`-Weg, kein
Brandenburg-Paket, 0 Brandenburg-Referenzen), und der Plan weist solche Wege unter
`landesmodule.mehrlaendrig` samt Fremdland aus. Der Satz in §4 sollte trotzdem auf „öffnet
ausschließlich Berliner Wege — zuzüglich des zweiländrigen rbb24-Wegs" geschärft werden.

**Sonst bestätigt:** der Default ist leer und fail-closed · es gibt **kein** Sammel-Schlüsselwort
(`alle`, `*`, `all`, `true`, `on` sind alle wirkungslos) · das Gate ist **Regel 1** im ausführenden
Plan, also vor Paketstatus, Wegstatus und Referenzzählung — das leere Flag allein genügt als Sperre
(Test 10o: Paket `active` + Wege `healthy`/`auto` + Berliner Profil + leeres Flag → **0** Berliner
Wege) · `manual` ist als Regel 4b eine echte Sperre im ausführenden Plan · beide Rollback-Stufen
decken jede der fünf mutierenden Anweisungen ab und nennen **keinen** `rp-bb-*`-Weg und **kein**
`brandenburg-*`-Paket in einem ausführbaren Statement · `partei='Fraktionslos'` bindet **kein**
Parteipaket · `bundesland='Berlin'` + `politische_ebene='landtag'` ergibt genau
`bund-basis` + `berlin-basis` und **kein** Brandenburg-Paket.
