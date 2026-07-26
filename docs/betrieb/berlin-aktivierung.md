# Berlin aktivieren — Runbook und Go-/No-Go-Grundlage

**Stand:** 2026-07-26 (fünfter Durchgang, zweiter Production-Anlauf) · **Sprint:** Phase-1-Punkt 14 / 14A ·
**Zustand:** aktivierungsreif **mit reduziertem Set**, **Production weiterhin unverändert** — die
Aktivierung ist an **zwei** Startbedingungen blockiert: dem fehlenden Flag-Zugang (**§19.4**) und
dem fehlenden Berliner Landtagsprofil (**§19.5**, seit 14A entscheidend). Die beiden
Vorprüfungsbefunde **V-1** (Staffelung) und **V-2** (globale Landesquellenauflösung) sind in
**§18** behoben; der aktuelle Anlauf ist in **§19** protokolliert ·
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
| 1b | **Berechtigtes Landesmandat** (seit 14A) | `laenderMitBerechtigtemMandat()` in `source-mode.js`, Regel 1 des Plans | **0** Landtagsprofile → Berlin bleibt gesperrt, auch mit gesetztem Flag |
| 2 | **Paketstatus** `berlin-basis` | `source_packages.status` | `prepared` → `computeGlobalActivation` aktiviert nicht |
| 3 | **Wegstatus** je Abrufweg | `retrieval_paths.activation_mode` | alle 10 auf `manual` → Plan-Regel 4b schließt aus |
| 4 | **Profil-Referenz** | `mandate_profiles` | 0 Landtagsprofile → Referenzzählung ergibt 0 |

Das Gate wirkt **je Land getrennt**. `HELMUT_LANDESMODULE=berlin` öffnet ausschließlich Berliner
Wege — **zuzüglich des zweiländrigen `rp-rbb24-politik`**, der in beiden Landespaketen hängt und
seine Brandenburg-Inhalte mitbringt (§13, Befund V-4; der Plan weist ihn unter
`landesmodule.mehrlaendrig` samt Fremdland aus). Es gibt bewusst **kein** Sammel-Schlüsselwort
(`alle`, `*`, `all`, `true`, `on` sind alle wirkungslos).

**Riegel 1 und 1b sind seit 14A UND-verknüpft** (Befund V-2): Freigabe **und** mindestens ein
aktivierungsberechtigtes Landtagsmandat dieses Landes. Vorher genügte das Flag — dadurch konnte
ein **Brandenburger** Mandat den zweiländrigen rbb24-Weg unter reiner Berlin-Freigabe starten.
Der Plan weist beide Bedingungen jetzt getrennt aus (`landesmodule.freigegeben`,
`landesmodule.mitBerechtigtemMandat`, `landesmodule.wirksam`, `landesmodule.freigegebenOhneMandat`),
damit ein gesetztes Flag ohne Mandat nicht wie eine Aktivierung aussieht.

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
  **Seit 14A ist das zusätzlich eine Sperre, nicht nur Datenlage:** `getSourcesForProfile` filtert
  auch im Fallback jede Quelle mit Landespräfix gegen die Landesberechtigung des Profils
  (`landesmodulQuelleGesperrt`). Vorher hätte eine später ergänzte `be-`-Katalogquelle das Gate
  im Fallback umgangen.

**Wichtig — und bis 14A missverständlich:** diese Tabelle beschreibt die **Paketauflösung**, nicht
eine Mandantentrennung des Abrufs. Was global bleibt und was mandatsbezogen ist, steht in
**§18.2**. Kurzfassung: Bundes-/neutrale Wege werden geteilt abgerufen und landen in einem
**gemeinsamen Rohkorpus**; nur die **Landesmodul**-Wege sind mandatsbezogen.

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

**Seit Punkt 14B ausführbar statt beschrieben.** Bis 14A war dieser Schritt der einzige der
neun Production-Schritte ohne eigene Datei, ohne Vor-/Nachbedingung, ohne Dry Run und ohne
Rollback-Datei — verwiesen wurde auf „das Provisionierungswerkzeug". Jetzt gilt dieselbe
Bauform wie für die Aktivierungs-SQL: eine Datei je Schritt, eine Transaktion je Datei,
`raise exception` als Riegel.

| Schritt | Datei | mutierend |
|---|---|---|
| 1+2 beide Zeilen (`profiles` **und** `mandate_profiles`) in **einer** Transaktion | [`20260726_berlin_abnahmeprofil.sql`](../../supabase/seeds/20260726_berlin_abnahmeprofil.sql) | **ja** |
| 3 Dry Run gegen den Ist-Zustand (Vor-/Nachbedingungen, Kontrollfragen) | `node scripts/berlin-abnahmeprofil-dryrun.js` | nein |
| 4 Gegenprobe gegen das **gemappte** Profil und die Paketauflösung | derselbe Dry Run, Abschnitt „Wirkung" | nein |

Warum beide Zeilen in **einer** Transaktion: getrennt ausgeführt entstünde ein Zwischenzustand
mit `profiles`-Zeile ohne Mandat (oder umgekehrt gar nicht erst möglich, weil der Fremdschlüssel
`mandate_profiles.user_id → profiles.id` greift). Der Zwischenzustand wäre ein Profil ohne
Mandatsdaten — genau der Fall aus Befund P-1.

**Rückweg — Deaktivieren schlägt Löschen (drei Dateien, drei Transaktionen):**

| Stufe | Datei | Wirkung |
|---|---|---|
| **0** | [`…_rollback_stufe0.sql`](../../supabase/seeds/20260726_berlin_abnahmeprofil_rollback_stufe0.sql) | `aktiv = false` → sofort aus der Referenzzählung, Auditspur bleibt |
| **1** | [`…_rollback_stufe1.sql`](../../supabase/seeds/20260726_berlin_abnahmeprofil_rollback_stufe1.sql) | zusätzlich `geloescht_at` → unabhängig von `validateProfile` nicht mehr berechtigt |
| **2** | [`…_rollback_stufe2.sql`](../../supabase/seeds/20260726_berlin_abnahmeprofil_rollback_stufe2.sql) | `delete` in beiden Tabellen — **nur** nach 0 **und** 1 und **nur** ohne anhängende erzeugte Daten |

**Korrektur einer bisherigen Angabe:** Die frühere Formulierung „sonst bleiben
Fremdschlüssel-Waisen" war falsch. Gegen das Production-Schema gemessen (`pg_constraint`,
2026-07-26) hängen **14** Tabellen mit `ON DELETE CASCADE` an `profiles(id)` — ein `delete`
erzeugt also keine Waisen, sondern **löscht erzeugte Daten mit**. Das ist das größere Risiko,
nicht das kleinere. Stufe 2 bricht deshalb ab, sobald auch nur eine abhängige Zeile existiert.

## 9 · Ausführung (freigabepflichtig, nicht Teil dieses Sprints)

**Seit 14A: eine Datei je Schritt.** Die frühere Sammeldatei `20260726_berlin_aktivierung.sql` ist
**stillgelegt** — sie mutiert nichts mehr und bricht mit `raise exception` ab (Befund V-1, §18.1).

| Schritt | Datei / Ort | mutierend |
|---|---|---|
| 1 | `node scripts/backup-export.js --scope=seed` **und** `--scope=profil` — beide Manifeste `vollstaendig: true` | nein |
| 2 | Neuverifikation **erneut** laufen lassen, falls seit §2 mehr als 14 Tage vergangen sind | nein |
| 3 | `node scripts/berlin-aktivierung-dryrun.js` **und** `node scripts/berlin-abnahmeprofil-dryrun.js` — Dry Run **je Schritt** gegen den Ist-Zustand | nein |
| 4 | `20260726_berlin_aktivierung_a_neutralisierung.sql` (Block A) | **ja** |
| 5 | `20260726_berlin_abnahmeprofil.sql` (Abnahmeprofil, §8, **zwei** Zeilen in **einer** Transaktion) | **ja** |
| 6 | `20260726_berlin_aktivierung_b1_paketstatus.sql` (Paketstatus `active`) | **ja** |
| 7 | `HELMUT_LANDESMODULE=berlin` setzen (**Vercel-Env**, nicht die Datei — §17 V-3) | **ja** |
| 8 | `20260726_berlin_aktivierung_b2_stufe1.sql` (**Stufe 1**, die 2 Direktfeeds) | **ja** |
| 9 | `node scripts/berlin-aktivierung-dryrun.js --schritt=S2` — muss weiter **NEIN** melden | nein |
| 10 | einen vollen Crawl-Zyklus beobachten (§10), mindestens 2 Läufe je Weg mit `ok` | nein |
| 11 | `20260726_berlin_aktivierung_b2_stufe2.sql` (**Stufe 2**) — der Telemetriebeleg lässt sie vorher nicht zu | **ja** |

Die Reihenfolge ist bindend und seit 14A **technisch erzwungen**, nicht nur empfohlen:

- Schritt 6 bricht ab, solange Block A nicht gelaufen ist.
- Schritt 8 bricht ab, solange Block A oder Block B1 fehlt **oder** Stufe 2 nicht vollständig
  gesperrt ist.
- Schritt 11 bricht ab, solange Stufe 1 nicht **vollständig aktiv** ist **und** je Stufe-1-Weg
  mindestens **2** Läufe mit `status='ok'` in `source_crawl_telemetry` stehen. Damit ist Schritt 10
  nicht überspringbar — auch nicht durch das Ausführen beider Dateien direkt hintereinander.
- Jede Datei prüft nach ihrer Mutation die eigene Vollständigkeit; eine Teilausführung endet
  fail-closed statt in einem stillen „0 Zeilen betroffen".
- **Seit 14B auch Schritt 5:** die Profildatei bricht ab, wenn unter der Abnahme-Id bereits ein
  fremder Datensatz oder eine abweichende Mandatszeile steht, wenn ein **anderes** aktives
  Landtagsmandat existiert oder wenn nach dem Anlegen nicht **genau ein** aktivierungs­berechtigtes
  Berliner Landtagsmandat vorliegt. Damit ist auch dieser Schritt weder überspringbar noch
  versehentlich überschreibend.

Flag **vor** Stufe 2 bleibt bindend, damit der schnellste Rückweg (Rollback Stufe 0) steht, bevor
die Google-Last dazukommt. Der Flag-Schritt steht bewusst **nach** Block A und B1 und **vor**
Stufe 1: erst dann ist er der letzte fehlende Riegel, und ohne berechtigtes Abnahmeprofil (Schritt 5)
wäre er ohnehin wirkungslos (Riegel 1b).

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
16. **(neu, 14B)** ein Cron-Lauf meldet `Zeitbudget erschoepft` (systemError) oder
    `/api/cron/crawl` antwortet häufiger mit `504` als im Vorlauf (Ist über 7 Tage: **3**,
    gemessen 2026-07-26, §20.5) → sofort **Rollback Ebene 0b** (Abnahmeprofil deaktivieren),
    damit kein Bestandsmandat unversorgt aus dem Zeitbudget fällt

## 12 · Rollback (sechs Ebenen, getestet)

Zwei Begriffe, die vorher denselben Namen trugen und deshalb verwechselbar waren:
**Aktivierungs*stufe*** = welche Wege scharf sind (Stufe 1 / Stufe 2). **Rollback-*Ebene*** = wie
tief zurückgerollt wird. Seit 14A hat jede Aktivierungsstufe ihren **eigenen** Rollback.

| Ebene | Mittel | Wirkung | Dauer |
|---|---|---|---|
| **0** | `HELMUT_LANDESMODULE` leeren (**Vercel-Env**) | alle Landesmodule sofort gesperrt, **kein** DB-Schreibzugriff | Sekunden |
| **0b** | `…_berlin_abnahmeprofil_rollback_stufe0.sql` (**neu, 14B**) | Abnahmeprofil `aktiv = false` → Berlin hat **kein berechtigtes Landtagsmandat** mehr, **alle** Berliner Wege fallen aus dem Plan — **auch bei gesetztem Flag** und unabhängig vom Wegzustand | < 1 min |
| **1** | `…_b2_stufe2_rollback.sql` | **nur Stufe 2** zurück; Stufe 1 läuft ausdrücklich weiter (Rückfall auf den bewiesenen Zustand) | < 1 min |
| **2** | `…_b2_stufe1_rollback.sql` | **nur Stufe 1** zurück; **fail-closed, solange Stufe 2 aktiv ist** — dann erst Ebene 1 oder direkt Ebene 3 | < 1 min |
| **3** | `…_rollback.sql` | **alle 7** Wege des Basispakets → `needs_review`/`manual`, `berlin-basis` → `prepared`; **Neutralisierung bleibt** | < 1 min |
| **4** | `…_rollback_vollstaendig.sql` | zusätzlich Block A zurück → exakt der gemessene Ist-Zustand vom 2026-07-26, **inklusive Befund A-3** | < 1 min |

**Wirkungsgarantien je Ebene (getestet, `scripts/berlin-staffelung-test.js`):**

- **Ebene 0b ist allein hinreichend** und aus einer Cloud-Sitzung ausführbar (Supabase ist
  erreichbar, die Vercel-Env nicht). Ausführbar geprüft in
  `scripts/berlin-abnahmeprofil-test.js` §4: mit gesetztem Flag **und** scharfen Wegen fallen
  nach Ebene 0b **0** Berliner Wege in den Plan, während die Bundesversorgung unverändert bleibt.
  Damit gibt es **zwei** voneinander unabhängige, datenbankseitige Not-Aus-Schalter (0b und 2),
  von denen jeder für sich jeden Berliner Abruf stoppt. Was Ebene 0b **nicht** kann: den
  Flag-Wert zurücknehmen oder belegen — sie nimmt ihm nur die Wirkung.
- Ebene 1 lässt Stufe 1 unverändert aktiv und den Paketstatus unverändert.
- Ebene 2 lässt Stufe 2 **unverändert gesperrt** und den Paketstatus unverändert; sie dreht die
  Neutralisierung (Block A) **nicht** zurück — Befund A-3 kehrt nicht zurück.
- Ebene 2 ist bei aktiver Stufe 2 **nicht ausführbar**: sonst liefe die Google-Last weiter, während
  die Direktfeeds, die sie rechtfertigen sollten, abgeschaltet sind.
- Ebene 3 und 4 setzen **alle sieben** Wege des Basispakets zurück, nicht nur das aktuelle
  Aktivierungsset — sonst bliebe ein von einer **älteren** Planfassung (6 Wege) scharfgeschalteter
  Weg aktiv und der Rollback hätte sich trotzdem als vollständig gemeldet.
- Ebene 4 stellt den Ausgangszustand **zeilengenau** her und ist idempotent.

**Was kein Rollback tut:** bereits erzeugte Berliner Rohdokumente, Knowledge Objects und
Telemetriezeilen werden **nicht** gelöscht. Die Auditspur bleibt vollständig.

**Testnachweis:** `node scripts/berlin-staffelung-test.js` führt die **committeten** Schrittdateien
in der vorgesehenen Reihenfolge gegen eine Speicherdatenbank aus — inklusive der fail-closed
Riegel, aller Rollback-Ebenen und des Falls „ein Operator führt alle 9 Dateien am Stück aus"
(Endzustand: der Ausgangszustand). `node scripts/berlin-aktivierung-test.js` prüft zusätzlich
Idempotenz und die Zeichenketten-Invarianten. Der Mini-SQL-Ausführer bricht bei jeder ihm
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

> **In zwei Punkten überholt — aktueller Stand ist §19.4.** Die Kernaussage (Flag nicht lesbar,
> nicht setzbar, nicht rücksetzbar) gilt unverändert. Überholt sind: die Zeile „Production-App
> nicht erreichbar" (sie ist **erreichbar**, antwortet aber **401** — siehe §19.4) und die Annahme,
> ein bereitgestelltes `VERCEL_TOKEN` genüge (die Vercel-API ist zusätzlich proxy-gesperrt).
> Seit 14A kommt ein **zweiter**, unabhängiger Blocker hinzu: §19.5.

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

> **Ergänzt und geschärft in §19.8.** Schritt 1 dieser Liste ist unvollständig: der Weg
> „`VERCEL_TOKEN` bereitstellen" verlangt zusätzlich einen geöffneten Egress, und die Liste nennt
> das fehlende **Landtagsprofil** noch nicht als eigenständige Voraussetzung.

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

> **Stand nach Zwischensprint 14A (2026-07-26):** **V-1 und V-2 sind behoben** (§18). **V-3** ist
> als bindende Ausführungsregel in §9 Schritt 7 übernommen (Freigabe über die Vercel-Env, nicht
> über die Datei) — die Ursache selbst (leerer Env-Wert fällt auf die Dateiebene durch) bleibt
> bestehen und ist ein offenes Restrisiko. **V-4** ist in §4 nachgeschärft. Die Befundtexte unten
> bleiben als Beleg unverändert stehen.

### V-1 (kritisch, **behoben in §18.1**) · Die Staffelung ist im SQL nicht erzwungen — B2.1 und B2.2 teilen eine Transaktion

`20260726_berlin_aktivierung.sql` schreibt in Block B **ein** `begin;` … `commit;` um B1, B2.1
**und** B2.2. Der Kommentar „die Stufen sind EINZELN auszuführen, nicht zusammen" ist damit die
einzige Sperre — eine Kommentarzeile. Wer Block B als Ganzes ausführt (das ist die naheliegende
Lesart einer Datei mit `begin`/`commit`), schaltet **alle vier** Wege auf einmal scharf, inklusive
der zwei Google-Wege, deren ganzer Zweck es war, einen vollen Crawl-Zyklus **später** zu kommen.

Die gesamte Lastbegründung aus §7.4 hängt an dieser Trennung. **Vor der Ausführung:** B2.2 in einen
eigenen `begin`/`commit`-Block ziehen (oder in eine eigene Datei), sodass die Staffelung strukturell
und nicht nur redaktionell besteht. Bis dahin gilt: **nur die Zeilen B1 und B2.1 einzeln ausführen**,
niemals den Block am Stück.

### V-2 (wichtig, **behoben in §18.2**) · Das Abnahmeprofil ist kein mandantenbezogener Schalter — der Crawl-Plan ist global

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

## 18 · Zwischensprint 14A (2026-07-26) · V-1 und V-2 technisch behoben

**Production wurde in 14A nicht verändert.** Es wurde kein Flag gesetzt, kein SQL ausgeführt, keine
Zeile geschrieben, kein Crawl ausgelöst, kein Testprofil angelegt. Alle Production-Zahlen dieses
Abschnitts stammen aus `select`-Abfragen.

### 18.1 V-1 · Die Staffelung ist jetzt strukturell, nicht redaktionell

**Was falsch war.** `20260726_berlin_aktivierung.sql` enthielt Block A, B1, Stufe 1 und Stufe 2 in
einer Datei — Block B sogar in **einer** Transaktion (`begin` … B1 … B2.1 … B2.2 … `commit`). Die
einzige Sperre war der Kommentar „die Stufen sind EINZELN auszuführen". Wer die Datei am Stück
ausführte, schaltete alle vier Wege scharf, inklusive der zwei Google-Wege, deren ganzer Zweck es
war, einen vollen Crawl-Zyklus **später** zu kommen. Die gesamte Lastbegründung aus §7.4 hing an
dieser Trennung.

**Was jetzt gilt — 9 Dateien, je eine Transaktion:**

| # | Datei | Wirkung | Rollback |
|---|---|---|---|
| — | `20260726_berlin_aktivierung.sql` | **stillgelegt**: mutiert nichts, bricht mit `raise exception` ab und nennt die Einzelschritte | — |
| 1 | `20260726_berlin_aktivierung_a_neutralisierung.sql` | Block A: 3 Partei-/Fraktions-/Personenwege von `berlin-basis` nach `die-linke-berlin` | Ebene 4 |
| 2 | `20260726_berlin_aktivierung_b1_paketstatus.sql` | `berlin-basis` `prepared` → `active` | Ebene 3 |
| 3 | `20260726_berlin_aktivierung_b2_stufe1.sql` | **Stufe 1**: `rp-be-regionale_leitmedien`, `rp-rbb24-politik` | Ebene 2 |
| 4 | `20260726_berlin_aktivierung_b2_stufe2.sql` | **Stufe 2**: `rp-be-landesregierung`, `rp-be-staatskanzlei` | Ebene 1 |
| 5 | `20260726_berlin_aktivierung_b2_stufe1_rollback.sql` | nur Stufe 1 zurück | — |
| 6 | `20260726_berlin_aktivierung_b2_stufe2_rollback.sql` | nur Stufe 2 zurück | — |
| 7 | `20260726_berlin_aktivierung_rollback.sql` | alle Stufen zurück, Paket `prepared` | — |
| 8 | `20260726_berlin_aktivierung_rollback_vollstaendig.sql` | zusätzlich Block A zurück | — |

**Die vier Eigenschaften, die die Trennung tragen:**

1. **Getrennte Dateien und getrennte Transaktionen.** Stufe 1 nennt in ihrem Mutationsteil keinen
   Weg aus Stufe 2 und umgekehrt (geprüft als Mengengleichheit über die tatsächlich genannten
   `rp-…`-Kennungen, nicht als Kommentarzusage).
2. **Vor- und Nachbedingungen als `raise exception`.** Jeder Schritt trägt ausführbare Riegel:
   Verletzung → Abbruch → Rollback der eigenen Transaktion. Kein stilles „0 Zeilen betroffen", das
   wie Erfolg aussieht. Jeder Schritt prüft **nach** seiner Mutation die eigene Vollständigkeit;
   eine Teilausführung (1 von 2 Wegen getroffen) bricht ab.
3. **Reihenfolge in beide Richtungen erzwungen.** Stufe 1 verlangt eine **vollständig gesperrte**
   Stufe 2; Stufe 2 verlangt eine **vollständig aktive** Stufe 1. Rollback Stufe 1 verlangt eine
   gesperrte Stufe 2.
4. **Telemetriebeleg statt Reihenfolgevertrauen.** Stufe 2 verlangt zusätzlich je Stufe-1-Weg
   mindestens **2** Läufe mit `status='ok'` in `source_crawl_telemetry`. Ohne diesen Riegel wäre
   „erst Stufe 1, dann Stufe 2" auch erfüllt, wenn ein Operator beide Dateien in derselben Minute
   ausführt — genau der Lastfall, den die Staffelung verhindern soll. Abgefragt wird die
   **Quellenkennung** (`be-regionale_leitmedien`, `rbb24-politik`), nicht die Abrufweg-Id, weil
   `source_crawl_telemetry.source_id` die Crawler-Quellen-Id trägt.

**Eine Quelle für SQL, Dry Run und Test.** Reihenfolge, Bedingungen und berührte Wege stehen
deklarativ in `seeds/berlin-aktivierung.js` (`ausfuehrungsschritte()`). Der Generator rendert daraus
das SQL, der Dry Run wertet dieselben Bedingungen gegen den Ist-Zustand aus, der Test führt sie
gegen eine Speicherdatenbank aus. Der Seed-Drift-Test bindet alle 9 committeten Dateien byte-genau
an den Generator. Staffelung im SQL und Staffelung im Test können damit nicht auseinanderlaufen.

**Dry Run je Stufe.** `node scripts/berlin-aktivierung-dryrun.js [--schritt=S1|S2|…] [--json]` —
strikt read-only, Secrets nur aus `process.env` (`CLAUDE.md` §4.9), ohne Datenbankzugang Exit 2 mit
„nicht prüfbar" statt eines grünen Ergebnisses. Je Schritt: Vorbedingungen mit Ist-Wert, die genau
getroffenen Zeilen namentlich, die Nachbedingung nach Simulation und die Kontrollfragen
(Brandenburg / Bund / Partei-Wege / fremde Pakete — alle 0 erwartet).

**Gemessen am 2026-07-26 gegen Production (read-only):** Schritt A ist ausführbar (3 Zeilen am
Pflichtpaket, wie dokumentiert), Schritt B1, Stufe 1 und Stufe 2 sind **nicht** ausführbar und
melden genau die fehlende Bedingung. Alle Kontrollfragen 0.

**Gegen ein echtes PostgreSQL ausgeführt — nicht nur simuliert.** Die Offline-Suite prüft die
Staffelung gegen eine Speicherdatenbank; ihr Mini-SQL-Ausführer kann kein PL/pgSQL und könnte
deshalb nicht belegen, dass die Riegel gültige Syntax sind, dass `raise exception` die Transaktion
wirklich abbricht und dass dabei **0** Zeilen verändert bleiben.
`bash scripts/berlin-staffelung-pgverify.sh --eigenes-cluster` legt ein Wegwerf-Cluster an, spielt
den gemessenen Ist-Zustand ein und führt die **committeten** Dateien in der vorgesehenen Reihenfolge
aus. Ergebnis am 2026-07-26 gegen **PostgreSQL 16.13**: **35/35 grün** — die vier verfrühten
Aufrufe brechen mit benannter Bedingung ab und lassen den Zustand *zeilengenau* unverändert; Stufe 2
scheitert am Telemetriebeleg, auch mit einem Lauf je Weg, und läuft erst mit zwei; die Rollbacks je
Stufe wirken getrennt; der vollständige Rückweg stellt den Ausgangszustand zeilengenau her und ist
idempotent. Das Skript ist **nicht** Teil der Offline-Suite (es braucht ein lokales PostgreSQL) und
berührt Production nicht.

### 18.2 V-2 · Das tatsächliche Modell: globaler Crawl, mandatsbezogene Landesmodule

**Was falsch war.** `loadRelationalSharedSources()` nahm **keinen** Profilparameter. Sie baute einen
globalen Plan aus *allen* Profilen, und `getSourcesForProfile()` mischte genau diesen Plan in die
Quellenliste **jedes** Profils. Daraus folgten zwei getrennte Fehler:

- **(a) Das Landesmodul-Gate hing allein am Betreiberflag.** Ein gesetztes Flag ließ die Wege eines
  Landes laufen, sobald irgendein aktives Paket sie referenzierte — unabhängig davon, ob es ein
  Mandat dieses Landes gibt. Beim zweiländrigen `rp-rbb24-politik` (hängt in `berlin-basis` **und**
  `brandenburg-basis`) genügte dafür ein **Brandenburger** Mandat bei reiner Berlin-Freigabe.
- **(b) Ein einziges Berliner Landtagsmandat hätte die Berliner Wege in den Abruf jedes
  Bundestagsmandats gelegt.** Das Abnahmeprofil war damit kein mandantenbezogener Schalter.

**Das Modell, ehrlich benannt.** Es gibt zwei Ebenen, und nur eine davon ist mandatsscharf:

| Ebene | Was passiert | Trennung |
|---|---|---|
| **Globaler Crawl + gemeinsamer Rohkorpus** | Ein Abrufweg läuft systemweit genau **einmal** (Referenzzählung statt Kopien). Die Ergebnisse landen in `raw_documents` und `knowledge_objects` — **beide ohne `tenant_id`** | **keine Mandantentrennung, bewusst.** 100 Mandate mit demselben Paket erzeugen genau einen Abruf |
| **Mandatsbezogene Relevanz, Zuordnung und Ausspielung** | Briefing, Lage, Radar, Büro wählen je Mandat aus dem gemeinsamen Korpus | **hier** ist es mandatsscharf — über Relevanz, nicht über Paketzugehörigkeit |
| **Landesmodul-Versorgung** (Ausnahme, seit 14A) | Landesmodul-Wege erscheinen nur in der Versorgung der Mandate, die ein berechtigtes Landesmandat tragen | mandatsbezogen auf der **Abruf**-Ebene |

**Die minimale Korrektur — zwei Stellen, kein Pipeline-Neubau:**

1. **Mandatsbindung des Gates** (`source-mode.js`, Regel 1 des Plans). Ein Landesmodul ist
   **wirksam** nur, wenn sein Land *ausdrücklich freigegeben* ist **und** mindestens ein
   *aktivierungsberechtigtes* Landtagsmandat dieses Landes existiert. Gezählt wird über
   `resolveProfilePackages()` — also genau die Logik, die auch die Referenzzählung benutzt, nicht
   über ein Profilfeld. Folgen: ein **Bundestags**mandat mit `bundesland='Berlin'` berechtigt Berlin
   **nicht** (gemessen 2026-07-26: **4 der 6** aktiven Production-Profile sind genau das); ein
   deaktiviertes, gelöschtes oder unvollständiges Profil zählt nicht; ein mehrländriger Weg braucht
   ein Land, das **beides** ist — freigegeben und bemandatiert. Der Ausschlussgrund nennt getrennt,
   welche der beiden Bedingungen fehlt.
2. **Profilbezogene Landesmodul-Versorgung** (`planQuellenFuerProfil`, aufgerufen von
   `loadRelationalSharedSources(profile)`). Der Plan bleibt global; nur die Landesmodul-Wege werden
   auf die Länder des jeweiligen Profils eingeschränkt. Die **Vereinigung** über alle berechtigten
   Profile ergibt wieder exakt `plan.aktiv` — es fällt also kein Weg aus dem Gesamtcrawl heraus, er
   läuft nur im Lauf des Mandats, das ihn berechtigt (testgesichert).

Zusätzlich greift der Landesriegel jetzt auch im **Fallback**-Pfad (§6), damit die Sperre nicht von
der Datenlage des alten Katalogs abhängt.

**Ausdrücklich NICHT geändert** — und das ist eine Entscheidung, keine Auslassung: die
**allgemeine** Paketberechtigung je Profil. Heute erhält jedes Mandat alle global aktiven Bundes-,
Partei-, Themen- und Regionalwege im Abruf. Read-only gemessen am 2026-07-26 würde eine
profilbezogene Einschränkung **5 von 6** aktiven Profilen betreffen (−6 bis −88 von 140 Wegen, u. a.
82 Wege des Pakets `arbeit-und-soziales`). Das ist eine Produktentscheidung über die Versorgung
bestehender Mandate, kein Sicherheitsdefekt — **und sie würde keine Isolation herstellen**, weil
Rohkorpus und Knowledge Objects ohnehin mandantenneutral sind. Sie gehört zu OP-03, nicht zu 14A.

### 18.3 Was ein Berliner Testprofil künftig wirklich beweist

| Beweist es | Beweist es **nicht** |
|---|---|
| dass die Paketauflösung ein Berliner Landtagsmandat auf `bund-basis` + `berlin-basis` (+ ggf. `die-linke-berlin`) abbildet | dass Berliner Inhalte von anderen Mandanten getrennt verarbeitet werden — der Rohkorpus ist **gemeinsam** |
| dass die Berliner Wege ohne dieses Profil **nicht** laufen (Riegel 1b) | dass ein Bundestagsmandant keine Berliner Knowledge Objects sehen kann — das entscheidet die **Relevanzauswahl**, nicht der Abruf |
| dass die Berliner Wege **nur** in der Versorgung dieses Profils erscheinen | dass die Berliner Last einem Mandanten zugerechnet würde — die Kostenmessung weist geteilte Arbeit als **global** aus (Punkt 17) |
| dass die 4 Wege real liefern und die Kette bis zur Klassifikation `land`/`geo-land-berlin` trägt | dass eine parlamentarische Vorgangsverfolgung existiert — 7 von 12 Pflichtklassen haben **keinen** liefernden Weg (§5) |

Der Beweislauf findet also **im geteilten Korpus** statt, nicht in einer isolierten Testspur. Das ist
seit 14A nicht mehr nur ein Hinweis, sondern die dokumentierte Zusage — und §18.2 nennt die
Stelle, an der Mandatsschärfe tatsächlich besteht.

### 18.4 Verbleibende Risiken nach 14A

| # | Risiko | Warum es bleibt |
|---|---|---|
| R-1 | **`HELMUT_LANDESMODULE` ist aus einer Cloud-Sitzung weder lesbar noch setzbar** | unverändert der Blocker aus §16.5; 14A hat daran nichts geändert und konnte es nicht |
| R-2 | Rollback Ebene 0 wirkt nur, wenn die Freigabe über die **Vercel-Env** kam (§17 V-3) | In 14A gegen `flags.js:74–87` nachgeprüft und **bestätigt**: ein leerer Env-Wert gilt als *nicht gesetzt* und fällt auf die Dateiebene durch. Teilweise abgesichert — die Offline-Suite schlägt fehl, sobald `helmut-flags.json` ein Landesmodul setzt (`berlin-aktivierung-test` 1f/10u), der Dateiweg ist also CI-gesperrt. Nicht abgesichert ist eine Freigabe, die den CI-Riegel bewusst entfernt; deshalb bleibt §9 Schritt 7 bindend |
| R-3 | Der zweiländrige `rp-rbb24-politik` bringt Brandenburg-Inhalte in den Berliner Rohstrom | bewusst akzeptiert (§13); der Plan weist ihn aus. Keine Aktivierung Brandenburgs |
| R-4 | Der gemeinsame Rohkorpus bleibt ohne `tenant_id` | Architekturentscheidung, gehört zu OP-03. 14A dokumentiert sie, statt sie zu verdecken |
| R-5 | Berlin startet **ohne amtliche parlamentarische Quelle** (7 von 12 Pflichtklassen ohne Weg) | §5; unabhängig von 14A |
| R-6 | Der Telemetriebeleg für Stufe 2 prüft `status='ok'`, nicht die **Frische** der Dokumente | ein erreichbarer, aber veralteter Weg könnte den Beleg formal erfüllen. §10 verlangt die Frischeprüfung als Beobachtung; sie ist **nicht** im SQL-Riegel |
| R-7 | Die allgemeine Paketberechtigung je Profil bleibt offen (§18.2) | Produktentscheidung, gehört zu OP-03 |
| R-8 | **Berliner Dokumente können in der Ausspielung anderer Mandate erscheinen** | Folge von R-4: der Korpus ist gemeinsam, die Auswahl läuft über Relevanz. **4 der 6** aktiven Production-Profile sind Bundestagsmandate mit `bundesland='Berlin'` — regionale Relevanz kann Berliner Landesinhalte dort plausibel nach oben holen, obwohl sie Berlin nicht als eigene Versorgung erhalten. 14A verhindert den **Abruf** durch fremde Mandate, nicht die **Sichtbarkeit** im gemeinsamen Korpus. §10 beobachtet den Effekt über den Anteil `decision_level='land'`; der Nachweis der mandatsbezogenen Auswahl ist Phase-1-Punkt 28 |

### 18.5 Was 14A nicht angefasst hat

Kosten- und Budgetlogik aus Punkt 17 (`cost-model.js`, `llm_usage`, Reservierungen, Preistabelle,
Kostenaggregation) · Quellenstörungs-Klassifikation aus Punkt 16 (`source-failure.js`,
`source_crawl_telemetry` als Schreibpfad) · Brandenburg (kein Datensatz, kein Statement) · aktive
Bundesquellen · Crons · Secrets · Locks · Feature-Flags · Production-Daten.

## 19 · Zweiter Production-Anlauf (2026-07-26, 19:15–19:30 UTC) · **erneut blockiert, nichts mutiert**

**Auftrag:** der echte Berliner Production-Beweislauf für Phase-1-Punkt 14 auf Basis des gemergten
PR #138 (14A). **Ergebnis: keine Production-Mutation.** Zwei voneinander unabhängige
Startbedingungen sind nicht erfüllt — die bekannte (§19.4) und eine neue, die den Sprint auch dann
gestoppt hätte, wenn die erste wegfiele (§19.5).

> Es wurde **nichts** geschrieben: kein Flag, kein SQL, keine Zeile, kein Profil, kein Crawl.
> Alle Zahlen unten stammen aus `select`-Abfragen und aus read-only Werkzeugaufrufen.

### 19.1 Startprüfung — 11 von 14 erfüllt

| # | Bedingung | Ergebnis |
|---|---|---|
| 1 | `main` enthält PR #138 | **ja** — `2f58d4c` (Merge #138, 2026-07-26 19:14:40 UTC) |
| 2 | Lokaler Stand = sauberes `origin/main` | **ja** — HEAD = `origin/main` = `2f58d4c`, Diff leer |
| 3 | Arbeitsbaum sauber | **ja** |
| 4 | Pflichtchecks von #138 grün | **ja** — `CI — Offline-Suite + Browser-Smoke` `success` auf `2f58d4c` |
| 5 | Punkt 16 und 17 in `main` | **ja** — `quellenarchitektur/source-failure.js` (160/160) und `cost-model.js` (128/128) vorhanden und grün |
| 6 | Keine parallele Arbeit an Berlin-Dateien | **ja** — alle drei älteren Berlin-Branches sind vollständig in `main` (`ahead=0`); einzige offene Berührung ist PR #132 (Brandenburg), siehe §19.6 |
| 7 | Production-Zugänge verfügbar | **teilweise** — Supabase ja; Vercel-Env **nein**; App nur unauthentifiziert lesbar |
| 8 | `HELMUT_LANDESMODULE` lesbar, setzbar, sofort rücksetzbar | **NEIN** — §19.4 |
| 9 | Kein konkurrierender oder alter Gate-Name | **ja** — `main` kennt genau `HELMUT_LANDESMODULE` (`flags.js:38`, `source-mode.js:112`); `helmut-flags.json` enthält **keinen** Landesmodul-Schlüssel |
| 10 | Backup-Grundlage gültig | **Grundlage ja, Artefakt nein** — §19.3 |
| 11 | Brandenburg vollständig gesperrt | **ja** — alle 8 `rp-bb-*` Wege `needs_review`+`manual`, `brandenburg-basis` `prepared` |
| 12 | Bundestagsversorgung gesund | **ja** — §19.2 |
| 13 | Keine aktiven oder hängenden Pipeline-Locks | **ja** — 3 Zeilen, **alle abgelaufen** |
| 14 | Dry Runs aller geplanten Schritte grün | **ja** — §19.3 |

### 19.2 Gemessener Production-Ausgangszustand (2026-07-26, 19:21–19:24 UTC, read-only)

| Größe | Wert |
|---|---|
| Pakete / Abrufwege / Paketzuordnungen | **9** / **163** / **165** |
| Mandatsprofile | **8**, davon **6 aktiv** — politische Ebene **ausnahmslos `bundestag`** |
| **Landtagsprofile** | **0** (entscheidend, §19.5) |
| `berlin-basis` | `prepared`, **10** Wege — trägt weiterhin `rp-be-partei_pilot`, `rp-be-fraktion_pilot`, `rp-be-person_pilot` (**Befund A-3 offen**) |
| `brandenburg-basis` | `prepared`, **9** Wege |
| Alle 18 Landesmodul-Wege (9 BE + `rp-rbb24-politik` + 8 BB) | `needs_review` + `manual`, `last_success_at` **null**, `error_streak` **0** |
| Berliner Rohdokumente **jemals** | **0** |
| Berliner Telemetriezeilen **jemals** | **0** |
| Letzter Vollcrawl | `crawl-20260726160130-7bznw`, 16:05:17 UTC — **147 Zeilen = 147 distinct `source_id`** (Invariante **B3 erfüllt**), **145 ok**, 2 `empty`, **0 error**, 0 `circuit-open`, **940** neue Rohdokumente |
| Fehlerrate 24 h | **1,1 %** (28 `error` von 2 534 Telemetriezeilen), 56 `circuit-open` |
| Rohdokumente / Knowledge Objects 24 h | 215 / 31 |
| Pending-Rückstand | **50** (43 `pending` + 7 `failed`, 0 `failed-final`) — **unverändert** |
| LLM-Tagesverbrauch | heute **34**/100; Vortage 53 · 65 · 53 · 55 — **kein** Tag am Deckel |
| `pipeline_locks` | 3 Zeilen, **alle abgelaufen** (`global-understanding`, `crawl-cem-ince`, `lage-briefing-…`) |

Der Bestand ist gegenüber der Messung vom 16:45–16:52 UTC **unverändert**. Die Datenbank wurde
zuletzt am 2026-07-26 11:13:10 UTC verändert (`retrieval_paths`) — also **vor** der Sicherung.

### 19.3 Backup und Dry Runs

**Backup-Grundlage: gültig. Backup-Artefakt: nicht mehr vorhanden.** Die Sicherung vom
2026-07-26, 16:47 UTC (8/8 Tabellen, `vollstaendig: true`, `pruefsummeGesamt 49a5b92d…`) ist an
`retrieval_paths` / `package_paths` / `source_packages` gebunden. Gemessen: letzte Änderung
`retrieval_paths` **11:13:10**, `package_paths` **2026-07-14**, `source_packages` **11:07:48** —
alle **vor** 16:47, die Grundlage trägt also weiterhin. Die Exportdatei selbst lag jedoch im
Container jener Sitzung und existiert nicht mehr. **Vor einer künftigen Mutation ist
`node scripts/backup-export.js --scope=seed` erneut auszuführen** — ein Backup, auf das man nicht
zugreifen kann, ist kein Backup. In diesem Sprint wurde keiner erstellt, weil nichts mutiert wurde.

**Dry Run (`node scripts/berlin-aktivierung-dryrun.js`, alle 8 Schritte, Exit 0):**

| Schritt | Jetzt ausführbar | Belegte Wirkung |
|---|---|---|
| A · Neutralisierung | **JA** | Zuordnung **+3/−3**, 0 Wege, 0 Paketstatus |
| B1 · Paketstatus | **NEIN** | Block A fehlt (`zuordnung ist=3 erlaubt=[0]`) |
| S1 · Stufe 1 | **NEIN** | Block A **und** B1 fehlen; Wegzustand korrekt bei 2 gesperrten Wegen |
| S2 · Stufe 2 | **NEIN** | Paket nicht `active` · Stufe 1 nicht aktiv · **Telemetriebeleg fehlt für beide Wege** |
| S1-RB / S2-RB / RB-ALLE / RB-VOLL | **JA** | 2 / 2 / 7 / 7 Wege, Endzustand = Ausgangszustand |

**Kontrollfragen in allen 8 Schritten `0`:** Brandenburg · Bund · Partei-/Fraktions-/Personenwege ·
fremde Pakete · fremde Zuordnung. Der Stufe-2-Riegel greift nachweislich am **Betriebsbeleg**, nicht
nur an der Reihenfolge — genau wie in 14A zugesagt.

### 19.4 Blocker 1 · Der Flag-Zugang — erneut geprüft, auf **allen** Kanälen negativ

§16.5 wurde nicht übernommen, sondern neu gemessen. Zwei Zeilen sind gegenüber §16.5 **präziser**:

| Weg zum Flag | Stand 2026-07-26, 19:15–19:30 UTC |
|---|---|
| Vercel-Env **setzen/lesen** über REST | `VERCEL_TOKEN` **nicht gesetzt** — **und** `api.vercel.com` sowie `vercel.com` sind aus dieser Sitzung proxy-gesperrt (`CONNECT` → **403**). **Neu und wichtig:** ein bereitgestelltes `VERCEL_TOKEN` allein würde hier **nicht** genügen; der Egress müsste zusätzlich geöffnet werden |
| Vercel-Env über **MCP** | Der Vercel-MCP-Server ist **authentifiziert** (Team `nohut`, Projekt `helmut-pilot` `prj_xbZ6…`) — stellt aber **kein** Werkzeug für Environment-Variablen bereit; `get_project` liefert keine Env |
| `helmut-flags.json` + Deploy | erfordert Merge nach `main` = Production-Deployment = Betreiberentscheidung (`CLAUDE.md` §5). Zusätzlich ist der Dateiweg CI-gesperrt |
| Flag über die App **lesen** | jeder Endpunkt antwortet **401**, auch `/api/health` und `/api/ai/status`; `PILOT_SECRET`/`CRON_SECRET` nicht gesetzt |
| Crawl auslösen | `/api/cron/*` schützt sich selbst (`authorizeCron`, fail-closed) und verlangt `CRON_SECRET` |
| GitHub-Actions-Umweg | **kein** Workflow im Repo setzt Vercel-Env (11 Workflows geprüft) |

**Zwei neue Befunde, die §16.5 korrigieren — ohne den Blocker aufzulösen:**

1. **Die Production-App ist erreichbar.** Über `web_fetch_vercel_url` (Vercel-MCP) antwortet
   `https://helmut-pilot.vercel.app` mit **HTTP 401** statt des Proxy-`403`. §16.5 führte die App
   als „nicht erreichbar"; richtig ist: **erreichbar, aber unauthentifiziert**. Der Aufruf ist
   `GET`-only ohne eigene Header — er kann `CRON_SECRET` nicht tragen und deshalb **weder** einen
   Crawl auslösen **noch** einen geschützten Endpunkt lesen.
2. **Ein Beobachtungskanal existiert.** Vercel-Runtime-Logs sind über MCP lesbar (Status, Pfad,
   Deployment). Sie zeigen HTTP-Ebene, **nicht** den Wert von Umgebungsvariablen.

**Ergebnis unverändert:** `HELMUT_LANDESMODULE` ist **weder lesbar noch setzbar noch rücksetzbar**.
Damit ist **Rollback Ebene 0** — der einzige Rückweg ohne Schreibzugriff auf Production — nicht
verfügbar. Das ist Abbruchkriterium **14** des Sprintauftrags und §11 Kriterium **15**.

### 19.5 Blocker 2 · **Ohne Landtagsprofil aktiviert das Flag nichts** (neu)

Seit 14A/V-2 ist ein Landesmodul nur wirksam, wenn **Freigabe UND ein berechtigtes
Landtagsmandat** vorliegen. Production führt **8 Profile, alle mit `politische_ebene='bundestag'`**
— **0 Landtagsprofile**.

Daraus folgt eine Aussage, die vor 14A so nicht galt: **selbst mit korrekt gesetztem
`HELMUT_LANDESMODULE=berlin` und vollständig ausgeführten Blöcken A, B1 und Stufe 1 würden
`0` Berliner Wege in den Crawl-Plan gelangen** und `0` Berliner Rohdokumente entstehen. Der Sprint
könnte seinen Zweck — erster realer Berliner Crawl **und dessen Auswertung** — auch mit Flag nicht
erreichen, solange das Abnahmeprofil (§8.2) fehlt.

Das Abnahmeprofil ist eine **Production-Datenänderung** und steht in der bindenden Reihenfolge aus
§9 an Schritt 5 — **vor** dem Flag. Es vorzuziehen ist nach §16.6 ausdrücklich unzulässig, solange
der Flag-Zugang ungeklärt ist: es nähme einen weiteren Riegel weg, ohne dass der letzte
kontrollierbar wäre. Deshalb wurde auch dieser Schritt **nicht** ausgeführt.

### 19.6 Hinweis zu PR #132 (Brandenburg) — konkurrierender Gate-Name

PR #132 ist offen, basiert auf `ca80b2f` (**vor** #138) und führt ein Gate namens
**`HELMUT_LANDESMODUL_FREIGABE`** ein. `main` kennt seit 14A ausschließlich
**`HELMUT_LANDESMODULE`**. Für den heutigen Production-Zustand ist das **wirkungslos** (nicht
gemergt, Startprüfung 9 ist erfüllt), aber ein Merge von #132 in der jetzigen Form brächte **zwei
konkurrierende Gate-Namen** in eine Codebasis. **Vor einem Merge von #132 ist der Gate-Name auf
`HELMUT_LANDESMODULE` zu vereinheitlichen und der Branch auf den Stand nach #138 zu heben.**
Dieser Sprint hat #132 nicht angefasst.

### 19.7 Tests (echte Zahlen, vor der geplanten Ausführung gefahren)

| Suite | Ergebnis |
|---|---|
| `run-offline-tests.js` (kanonisch) | **156/156 Suiten grün**, 0 FAIL, 41 s |
| `berlin-aktivierung-test.js` | **126 PASS / 0 FAIL** |
| `berlin-staffelung-test.js` | **71 PASS / 0 FAIL** |
| `berlin-neutralitaet-test.js` | **109 PASS / 0 FAIL** |
| `landesmodul-mandatsgate-test.js` | **71 PASS / 0 FAIL** |
| `landesmodul-seed-test.js` | grün (18 Wege) |
| `source-failure-test.js` (**Punkt 16**) | **160/160** |
| `kostenmessung-test.js` (**Punkt 17**) | **128 PASS / 0 FAIL** |
| `kosten-limits-test.js` | **20 PASS / 0 FAIL** |
| `seed-drift-test.js` | grün — Seeds byte-genau am Generator |
| `source-mode-test.js` · `profile-packages-test.js` · `flags-test.js` | 43/43 · 69/69 · 26/26 |

Browser-Smoke wurde **nicht** gefahren: es wurde kein Code geändert.

### 19.8 Ergebnis und Übergabe

**Sprintzustand: blockiert.** Kein Schritt der Production-Reihenfolge wurde ausgeführt; ein Rollback
war folglich nicht nötig und hat nicht stattgefunden. Stufe 1 ist **nicht** aktiv, Stufe 2 ist
**nicht** aktiviert und bleibt gesperrt. Beobachtete erfolgreiche Berliner Production-Läufe: **0**.

Damit die nächste Sitzung den Beweislauf tatsächlich fahren kann, sind **beide** Punkte nötig —
Reihenfolge nach §9 unverändert:

1. **Flag-Zugang herstellen.** Entweder der Betreiber setzt `HELMUT_LANDESMODULE=berlin` selbst in
   der Vercel-Env (bevorzugt: Rollback Ebene 0 bleibt ohne DB-Schreibzugriff verfügbar), **oder**
   einer Agenten-Sitzung wird `VERCEL_TOKEN` über die Claude-Code-Environment-Einstellungen
   bereitgestellt **und** der Egress zu `api.vercel.com` geöffnet — beides zusammen, eines allein
   genügt nicht (§19.4). Wert exakt `berlin`, kein Sammelwort, kein zweites Land.
2. **Abnahmeprofil einplanen.** Ohne ein berechtigtes Berliner Landtagsprofil (§8.2) bleibt die
   Aktivierung auch mit Flag ein No-Op (§19.5). Es ist Schritt 5 der Reihenfolge und wird **nach**
   Block A und **vor** dem Flag angelegt.
3. Zusätzlich hilfreich: `CRON_SECRET`, damit der erste Lauf gezielt ausgelöst statt auf den
   04:00/20:00-UTC-Cron gewartet werden muss. **Nicht** zwingend — die Beobachtung eines
   natürlichen Laufs ist gleichwertig und kostenneutral.

Erst danach gilt die unveränderte Reihenfolge: frisches Backup → Block A → Abnahmeprofil → B1 →
Flag → Stufe 1 → ein voller Crawl-Zyklus beobachten → **erst dann** Stufe 2.

## 20 · Punkt 14B (2026-07-26, 20:15–21:10 UTC) · Production-Vorbereitung · **nichts mutiert**

**Auftrag:** den letzten operativen Blocker beseitigen, damit der Berliner Beweislauf **ohne
weitere Entwicklung** starten kann. Kein Crawl, keine Aktivierung, kein Flag.

> Es wurde **nichts** in Production geschrieben: kein Flag, kein Profil, kein SQL, keine Zeile,
> kein Crawl. Alle Zahlen unten stammen aus `select`-Abfragen, read-only Werkzeugaufrufen und
> zwei read-only Sicherungsläufen.

### 20.1 Startprüfung — 5 von 6 erfüllt

| # | Bedingung | Ergebnis |
|---|---|---|
| 1 | `main` enthält PR #139 | **ja** — `4bc58dc` (Merge #139); lokaler HEAD = `origin/main`, Diff leer |
| 2 | Arbeitsbaum sauber | **ja** |
| 3 | Punkt 14A in `main` | **ja** — 9 Aktivierungsdateien + `berlin-staffelung-test.js` vorhanden, Gate-Name ausschließlich `HELMUT_LANDESMODULE` |
| 4 | Punkt 16 und 17 in `main` | **ja** — `source-failure.js` **160/160**, `cost-model.js`/`kostenmessung-test` **128/128** |
| 5 | Keine parallele Arbeit an Berlin, Kosten oder Quellenlogik | **ja** — einzige offene Berührung bleibt PR #132 (Brandenburg, konkurrierender Gate-Name, §19.6); dieser Sprint hat #132 nicht angefasst |
| 6 | Production-Zugänge | **teilweise** — Supabase ja (Messung, Sicherung, Dry Run gelaufen); Vercel-Env **nein**; App nur unauthentifiziert (HTTP 401) |

### 20.2 Der eigentliche Befund: Schritt 5 war der einzige Schritt ohne Werkzeug

Von den neun Production-Schritten aus §9 hatten acht seit 14A je eine eigene Datei, eigene Vor-
und Nachbedingungen als `raise exception`, einen eigenen Dry Run und einen eigenen Rollback.
**Schritt 5 — das Abnahmeprofil — hatte nichts davon.** Er stand als Prosa („zwei Zeilen") mit
Verweis auf „das Provisionierungswerkzeug" im Runbook. Genau dieser Schritt ist aber seit dem
zweiten Production-Anlauf die **zweite** der beiden Bedingungen, an denen der Beweislauf hängt
(§19.5). Ein Beweislauf hätte ihn also von Hand ausführen müssen — ohne Vorbedingung, ohne
Idempotenz, ohne Rückweg-Datei, mitten zwischen zwei fail-closed SQL-Schritten.

**Behoben.** Vier generierte Dateien, Bauform identisch zu 14A/V-1:

| Datei | Zweck | Riegel |
|---|---|---|
| `20260726_berlin_abnahmeprofil.sql` | beide Zeilen in **einer** Transaktion | 4 Vor-, 5 Nachbedingungen |
| `…_rollback_stufe0.sql` | `aktiv = false` (Not-Aus) | 1 Vor-, 2 Nachbedingungen |
| `…_rollback_stufe1.sql` | zusätzlich `geloescht_at` | 1 Vor-, 3 Nachbedingungen |
| `…_rollback_stufe2.sql` | Zeilen entfernen | 3 Vor-, 3 Nachbedingungen |

Quelle der Wahrheit bleibt [`seeds/berlin-profilplan.js`](../../lib/helmut/quellenarchitektur/seeds/berlin-profilplan.js);
`scripts/generate-berlin-abnahmeprofil-sql.js` erzeugt die Dateien, der Seed-Drift-Test hält sie
byte-genau daran.

**Gegen ein echtes PostgreSQL 16 bewiesen** (`bash scripts/berlin-abnahmeprofil-pgverify.sh
--eigenes-cluster`, **36 PASS / 0 FAIL**), unter anderem:

- die drei Rückwege brechen ohne Profil ab und lassen **0** Zeilen verändert;
- Anlegen ist **idempotent** (zweiter Lauf ohne zweite Zeile);
- ein **fremder** Datensatz unter derselben Id bricht ab, statt überschrieben zu werden;
- ein bereits vorhandenes **anderes** Landtagsmandat blockiert das Anlegen;
- Stufe 2 bricht ab, solange erzeugte Daten anhängen (`ON DELETE CASCADE`);
- der Endzustand ist **zeilengenau** der Ausgangszustand.

**Read-only gegen Production** (`node scripts/berlin-abnahmeprofil-dryrun.js`, Exit 0):
Schritt 1 ist **jetzt ausführbar** — alle 4 Vorbedingungen erfüllt, Treffer exakt **1 + 1** Zeilen,
alle 5 Nachbedingungen nach Simulation erfüllt, Kontrollfragen durchweg **0** (fremde Profile,
Brandenburg, fremde Landtagsmandate). Die drei Rückwege melden korrekt **NEIN** (es gibt noch
kein Profil). Gegen den echten Resolver gerechnet: Zustand `vollstaendig`, aktivierungsberechtigt,
`kannRadar: true`, Pflichtpakete **`bund-basis` + `berlin-basis`**, optional nur das nicht
existierende `profil-helmut-abnahme-berlin`, Berlin wirksam **nur mit** dem Profil (`[]` → `["berlin"]`).

### 20.3 Flag-Zugang — auf allen Kanälen neu gemessen, weiter negativ

Nicht aus §19.4 übernommen, sondern am 2026-07-26 zwischen 20:15 und 20:30 UTC neu geprüft.

| Weg zum Flag | Stand | lesbar | setzbar | rücksetzbar |
|---|---|---|---|---|
| Vercel-Env über REST | `VERCEL_TOKEN` **nicht gesetzt**; `api.vercel.com` und `vercel.com` proxy-gesperrt (`CONNECT` → **403**, erneut gemessen) | nein | nein | nein |
| Vercel-Env über MCP | Server **authentifiziert** (Team `nohut`, Projekt `helmut-pilot` `prj_xbZ6…`, letztes Production-Deployment `READY`) — die Werkzeugliste enthält **kein** Environment-Werkzeug; `get_project` liefert keine Env | nein | nein | nein |
| `helmut-flags.json` + Deploy | `HELMUT_LANDESMODULE` steht auf der Datei-Allowlist (`flags.js`), die Datei setzt es **nicht**. Ein Setzen wäre ein Merge nach `main` = Production-Deployment = Betreiberentscheidung (`CLAUDE.md` §5) und verlangt zusätzlich, zwei CI-Prüfungen umzustellen (`berlin-aktivierung-test.js` 1f und 10u) | nein | nur per Merge | nur per Merge |
| Flag über die App lesen | `/api/health` antwortet **HTTP 401** (erneut gemessen, `x-vercel-id` `fra1`); `PILOT_SECRET`/`CRON_SECRET` nicht gesetzt | nein | – | – |
| GitHub-Actions-Umweg | **kein** Workflow im Repo nennt `VERCEL_TOKEN`, `vercel env`, `api.vercel.com` oder `HELMUT_LANDESMODULE` (11 Workflows geprüft) | nein | nein | nein |
| Vercel-Runtime-Logs (MCP) | lesbar — zeigen HTTP-Ebene und `console`-Ausgaben, **nicht** Umgebungsvariablen. Eine Log-Zeile mit dem Landesmodul-Sperrgrund existiert nicht (`buildRelationalCrawlPlan` protokolliert sie nicht) | nein | – | – |

**Ergebnis unverändert: `HELMUT_LANDESMODULE` ist aus einer Cloud-Sitzung weder lesbar noch
setzbar noch rücksetzbar.** Es wurde **kein** Workaround gebaut.

**Kleinste notwendige Betreiberaktion** — in dieser Reihenfolge:

1. **Bevorzugt (eine Aktion, ohne Merge, ohne Code):** in der Vercel-Oberfläche
   Projekt `helmut-pilot` → Settings → Environment Variables → Production
   `HELMUT_LANDESMODULE` = `berlin` (Wert exakt, kein Sammelwort, kein zweites Land), danach
   Redeploy. **Rücknahme:** denselben Wert auf `off` setzen oder die Variable löschen +
   Redeploy — ein unbekannter Wert wirkt fail-closed wie „kein Land freigegeben".
2. **Falls die Oberfläche nicht in Frage kommt:** einer Agenten-Sitzung `VERCEL_TOKEN` über die
   Claude-Code-Environment-Einstellungen bereitstellen **und** den Egress zu `api.vercel.com`
   öffnen. Eines allein genügt nicht.
3. Der Weg über `helmut-flags.json` ist möglich, aber **nicht** der kleinste: er kostet zwei
   Merges (setzen und zurücknehmen), zwei Deployments und eine Änderung an zwei CI-Prüfungen.

**Was sich gegenüber §19 ändert — und was nicht.** Rollback **Ebene 0** bleibt aus einer Sitzung
nicht verfügbar. Neu belegt ist aber, dass sie dafür nicht die einzige schnelle Sperre ist:
**Ebene 0b** (Abnahmeprofil deaktivieren) und **Ebene 2** (Wege zurück auf `manual`) sind beide
datenbankseitig, aus der Sitzung ausführbar und **jede für sich hinreichend**, um jeden Berliner
Abruf zu stoppen — auch bei gesetztem Flag (§12, ausführbar geprüft). Das ändert nichts daran,
dass der Flag-**Wert** unlesbar bleibt: wer ihn setzt, muss ihn auch zurücknehmen können.

### 20.4 Backup — Werkzeug geprüft, Lücke geschlossen, zwei frische Sicherungen

**Die Lücke:** `--scope=seed` sichert die **8 Quellentabellen** — und damit **keine** der beiden
Tabellen, die Schritt 5 mutiert (`profiles`, `mandate_profiles`). `--scope=voll` deckt sie ab,
zieht aber zusätzlich `raw_documents`, `briefings`, `interactions` und `user_notes` auf die
Platte und hebt genau die Datenminimierung auf, wegen der es die Teil-Umfänge gibt. Für den
einzigen mutierenden Schritt, den dieser Sprint vorbereitet, gab es also **keine passende
Sicherung**.

**Geschlossen:** neuer Umfang `--scope=profil` (genau `profiles` + `mandate_profiles`, FK-sichere
Restore-Reihenfolge, Manifestart `pre-profil`, dieselbe serverseitige Vollständigkeitsprobe,
dieselbe fail-closed Bewertung). `scripts/backup-export-test.js` von 38 auf **48** Prüfungen
erweitert — inklusive „leerer Profil-Export gilt **nicht** als Sicherung" (Exit 1).

**Beide Sicherungen sind real gelaufen** (read-only, 2026-07-26, gegen `mainCommit 4bc58dc`):

| Art | Tabellen | Zeilen | `vollstaendig` | `pruefsummeGesamt` |
|---|---|---|---|---|
| `pre-seed` | 8/8 | 50 · 73 · 64 · 163 · 9 · 165 · 18 · 18 | **true** | `49a5b92d9e27fbbd…` |
| `pre-profil` | 2/2 | `profiles` 8 · `mandate_profiles` 8 | **true** | `0c514ace8982def1…` |

**Bemerkenswert und belegend:** die Gesamtprüfsumme der Quellensicherung ist **byte-identisch**
mit der vom 2026-07-26, 16:47 UTC (`49a5b92d…`, §19.3). Die Backup-Grundlage ist damit nicht
mehr nur aus Zeitstempeln erschlossen, sondern **gegengerechnet**: an den acht Quellentabellen
hat sich seither keine Zeile geändert.

**Grenzen, unverändert benannt:** kein transaktionaler Snapshot (sequenzielle REST-Lesungen);
`./backups/` ist gitignored und liegt **im Container dieser Sitzung** — beide Artefakte
verschwinden mit ihr. Die Regel aus §19.3 gilt weiter: **vor jeder Mutation neu exportieren.**
Neu ist, dass jetzt für beide betroffenen Tabellengruppen ein passender, geprüfter Befehl
existiert. **Der Rückweg für Schritt 5 ist nicht der Restore, sondern die drei Rollback-Dateien**
— zeilenscharf, fail-closed und gegen ein echtes PostgreSQL bewiesen. Die `pre-profil`-Sicherung
ist die Beweisgrundlage für den Vorher-/Nachher-Vergleich, kein Wiederherstellungsautomat.
`OP-01` (Supabase Pro + PITR) bleibt davon **unberührt und offen**.

### 20.5 Neuer, gemessener Betriebsbefund: die Crawl-Cron läuft ins Funktionslimit

Beim Prüfen des Beobachtungskanals (Vercel-Runtime-Logs, MCP) gemessen, **nicht** vorher
dokumentiert:

- In den letzten **7 Tagen** gab es **3** Antworten mit **HTTP 504** — **alle drei** auf
  `/api/cron/crawl`, verteilt auf zwei Deployments.
- Der Lauf um **20:00 UTC am 2026-07-26** endete mit
  `Vercel Runtime Timeout Error: Task timed out after 300 seconds`. Im selben Lauf:
  `eager-understanding 92371ms` für **ein** Mandat und **7** Zeitüberschreitungen auf
  Google-News-**Profilquellen** eines weiteren Mandats.
- Die Telemetrie desselben Laufs (`crawl-20260726200015-z3qaf`) ist trotzdem sauber: **147**
  Zeilen = **147** distinct `source_id`, **145** `ok`, **0** `error`. Der Abrufteil lief durch;
  überzogen hat die Weiterverarbeitung. Ein Blick allein auf `source_crawl_telemetry` hätte
  diesen Befund **nicht** gezeigt.

**Warum das für Punkt 14 zählt:** die Crons verarbeiten die aktiven Mandate **sequenziell** in
aufsteigender Id-Reihenfolge mit hartem Zeitbudget (`runCronForTenants`). Das Abnahmeprofil wäre
ein **7.** aktives Mandat und stünde nach Id-Sortierung an **Position 3 von 7** — es schiebt also
**4** Bestandsmandate je eine Position nach hinten, in einer Schleife, die das Funktionslimit
bereits erreicht. Zusätzlich erzeugt jedes aktive Mandat eigene Profilquellen: **gemessen 5
Mandatsquellen + 1 Personenquelle = 6 zusätzliche Abrufe je Crawl-Lauf**, alle über Google News
(verstärkt Befund **B1**). Diese 6 Abrufe entstehen, **sobald das Profil aktiv ist** — unabhängig
vom Flag und unabhängig von jedem Berliner Abrufweg.

Das ist kein Grund, den Beweislauf nicht zu fahren — aber es ist eine **Betreiberentscheidung**
und gehört in die Abbruchkriterien:

- **Neues Abbruchkriterium 16:** ein Cron-Lauf meldet `Zeitbudget erschoepft` (systemError) oder
  `/api/cron/crawl` antwortet häufiger mit `504` als im Vorlauf → **Rollback Ebene 0b** (Profil
  deaktivieren), damit kein Bestandsmandat unversorgt bleibt.
- **Vor dem Beweislauf zu messen:** `504`-Rate auf `/api/cron/crawl` über 7 Tage (Ist: **3**) und
  die Zahl der `Zeitbudget erschoepft`-Systemfehler (Ist: 0 im dokumentierten Zeitraum).
- **Bewusst nicht getan:** die Abnahme-Id **nicht** so umbenannt, dass sie ans Ende der
  Sortierung fällt. Das hätte zwar die Bestandsmandate nach vorn geholt, aber dafür das
  Testmandat selbst zum wahrscheinlichsten Abschnittskandidaten gemacht — ein Beweislauf, der
  „0 Berliner Dokumente" meldet, weil sein Mandat gar nicht verarbeitet wurde, wäre die
  schlechtere Fehlerart. Beide Fälle sind seit dem Incident vom 2026-07-25 sichtbar
  (systemError), keiner ist still. Die Wahl gehört dem Betreiber.

### 20.6 Go-/No-Go

| Voraussetzung | Stand |
|---|---|
| Aktivierungs-SQL (Block A, B1, Stufe 1, Stufe 2) + 4 Rollback-Dateien | **erfüllt** (14A, gegen echtes PostgreSQL bewiesen) |
| **Abnahmeprofil ausführbar, idempotent, mit Rückweg** | **erfüllt (14B)** — 4 Dateien, 36/36 gegen echtes PostgreSQL, Dry Run gegen Production Exit 0 |
| Sicherung für **alle** von der Reihenfolge berührten Tabellen | **erfüllt (14B)** — `--scope=seed` **und** `--scope=profil`, beide `vollstaendig: true` |
| Rückweg aus einer Cloud-Sitzung heraus | **erfüllt** — Ebene 0b und Ebene 2, jede allein hinreichend, ausführbar geprüft |
| Brandenburg gesperrt, Bund unberührt | **erfüllt** — Kontrollfragen in beiden Dry Runs durchweg 0 |
| **`HELMUT_LANDESMODULE` setzbar und rücksetzbar** | **NICHT erfüllt** — Betreiberaktion, §20.3 |

**Ergebnis: Go für alles, was ohne den Flag-Zugang möglich ist — No-Go für den Beweislauf
selbst.** Von den beiden Blockern des zweiten Anlaufs ist einer beseitigt: das Abnahmeprofil ist
kein offener Entwicklungspunkt mehr, sondern eine geprüfte Datei. Es bleibt **genau eine**
Voraussetzung, und sie ist **keine Entwicklungsaufgabe**, sondern eine Betreiberhandlung von
etwa einer Minute (§20.3, Weg 1).

**Nach dieser einen Handlung ist der Beweislauf ohne weitere Entwicklung fahrbar:** frisches
Backup (`--scope=seed` **und** `--scope=profil`) → beide Dry Runs → Block A → Abnahmeprofil →
B1 → Flag ist bereits gesetzt → Stufe 1 → ein voller Crawl-Zyklus beobachten → **erst dann**
Stufe 2.
