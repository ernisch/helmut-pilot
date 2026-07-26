# Berlin aktivieren — Runbook und Go-/No-Go-Grundlage

**Stand:** 2026-07-26 · **Sprint:** Phase-1-Punkt 14 · **Zustand:** Aktivierungsreife hergestellt,
**Production unverändert** · **Kanonische Daten:**
[`lib/helmut/quellenarchitektur/seeds/berlin-aktivierung.js`](../../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung.js)

> **Diese Datei beschreibt einen Eingriff, der noch nicht stattgefunden hat.**
> In diesem Sprint wurde **nichts** in Production aktiviert, kein Flag gesetzt, kein SQL
> ausgeführt, keine Zeile in der Datenbank verändert. Brandenburg wurde nicht berührt.

---

## 1 · Der Unterschied, um den es geht

| Begriff | Bedeutung | Stand heute |
|---|---|---|
| **Aktivierungsreife** | Alles ist gebaut, geprüft und rückrollbar; der Eingriff ist auf die Zeile genau beschrieben | **erreicht** |
| **Aktiviert** | Flag, Paketstatus, Wegstatus und Profil sind in Production gesetzt | nein |
| **Laufende Versorgung** | Berlin liefert über mehrere Läufe regelmäßig echte, aktuelle, politisch verwertbare Dokumente | nein, nicht bewiesen |

Punkt 14 ist erst mit der dritten Zeile erfüllt. Ein einzelner Treffer genügt nicht.

## 2 · Wie die Sperre funktioniert (vier unabhängige Riegel)

Berlin läuft erst, wenn **alle vier** offen sind. Jeder einzelne genügt, um es zu stoppen.

| # | Riegel | Ort | Zustand heute |
|---|---|---|---|
| 1 | **Landesmodul-Freigabe** `HELMUT_LANDESMODULE` | Vercel-Env oder `helmut-flags.json`; gelesen in `source-mode.js` | **leer** = jedes Landesmodul gesperrt |
| 2 | **Paketstatus** `berlin-basis` | `source_packages.status` | `prepared` → `computeGlobalActivation` aktiviert nicht |
| 3 | **Wegstatus** je Abrufweg | `retrieval_paths.activation_mode` | alle 10 auf `manual` → Plan-Regel 4b schließt aus |
| 4 | **Profil-Referenz** | `mandate_profiles` | 0 Landtagsprofile → Referenzzählung ergibt 0 |

Das Landesmodul-Gate wirkt **je Land getrennt**. `HELMUT_LANDESMODULE=berlin` öffnet ausschließlich
Berlin; Brandenburg bleibt gesperrt. Es gibt bewusst **kein** Sammel-Schlüsselwort (`alle`, `*`
sind wirkungslos) — jedes Land muss einzeln benannt werden.

**Zwei in diesem Sprint gefundene und behobene Lücken:**

1. `activation_mode='manual'` war **keine Sperre**. `model.isPathActive` prüft nur
   `dev_only`/`paused`/`archived`; ein manueller Weg in einem aktiven Paket galt als aktiv. Ohne
   die neue Plan-Regel 4b wären beim Öffnen des Gates **alle 10** vorbereiteten Berliner Wege auf
   einmal gelaufen — inklusive der Partei-/Personenquellen und des ~48-MB-PARDOK-Downloads.
2. Das alte Gate war **global**: Berlin und Brandenburg konnten nur gemeinsam geöffnet werden.

## 3 · Voraussetzungen vor der Aktivierung

Alle sechs sind objektiv prüfbar; die Prüfungen stehen maschinenlesbar in
`seeds/berlin-aktivierung.js` (`VORAUSSETZUNGEN`).

| # | Voraussetzung | Prüfung | mutierend |
|---|---|---|---|
| **V1** | `berlin-basis` enthält keine Partei-/Fraktions-/Personenquelle | `select count(*) from package_paths where package_id='pkg-berlin-basis' and retrieval_path_id in ('rp-be-partei_pilot','rp-be-fraktion_pilot','rp-be-person_pilot')` → **0** | ja (Block A) |
| **V2** | die 6 Wege sind **erneut** real abgerufen worden | Lauf von `.github/workflows/sprint9b-verify.yml` auf einem Runner mit offenem Egress; je Weg HTTP-Status, Item-Zahl, Alter des jüngsten Eintrags | nein |
| **V3** | genau ein aktivierungsberechtigtes Berliner Landtagsprofil existiert | `select count(*) from mandate_profiles where politische_ebene='landtag' and lower(bundesland)='berlin' and aktiv` → **1** | ja |
| **V4** | `HELMUT_LANDESMODULE` = exakt `berlin` | Vercel-Env bzw. `helmut-flags.json` | ja |
| **V5** | `berlin-basis` steht auf `active` | `select status from source_packages where key='berlin-basis'` | ja (Block B) |
| **V6** | Sicherung der 8 Quellentabellen liegt vor | `node scripts/backup-export.js --scope=seed`, Manifest `vollstaendig: true` | nein |

**V1 ist der harte Blocker.** Production führt `berlin-basis` als `is_base`-Pflichtpaket — jedes
Berliner Landtagsmandat bekommt es zwingend. Am 2026-07-26 hängen dort weiterhin
`rp-be-partei_pilot`, `rp-be-fraktion_pilot` und `rp-be-person_pilot` (Befund **A-3**). Eine
Aktivierung ohne V1 würde einem Mandat **jeder** Partei die Quellen **einer** Partei und die
Nachrichtensuche zu **einer namentlich benannten realen Person** zuweisen. Das verletzt die
Mandantenneutralität (`CLAUDE.md` §4.2).

## 4 · Berliner Pakete und Wege

`berlin-basis` — neutrales Pflicht-Basispaket, 12 Pflichtklassen, `geo-land-berlin`, Ebene `land`.

| Weg | Herausgeber | Methode · Parser | Klassen | Status heute | Ziel |
|---|---|---|---|---|---|
| `rp-be-landesparlament` | Abgeordnetenhaus von Berlin | `googlenews_search` · `googlenews-batchexecute` | landesparlament, ausschuesse | `needs_review`/`manual` | **`healthy`/`auto`** |
| `rp-be-landesregierung` | Land Berlin — Landespressedienst | `googlenews_search` · `googlenews-batchexecute` | landesregierung, ministerien | `needs_review`/`manual` | **`healthy`/`auto`** |
| `rp-be-staatskanzlei` | Senatskanzlei / Reg. Bürgermeister | `googlenews_search` · `googlenews-batchexecute` | staatskanzlei | `needs_review`/`manual` | **`healthy`/`auto`** |
| `rp-be-landesfraktionen` | Fraktionen im Abgeordnetenhaus | `googlenews_search` · `googlenews-batchexecute` | landesfraktionen | `needs_review`/`manual` | **`healthy`/`auto`** |
| `rp-be-regionale_leitmedien` | Der Tagesspiegel | `rss` · `rss-regex` | regionale_leitmedien | `needs_review`/`manual` | **`healthy`/`auto`** |
| `rp-rbb24-politik` | rbb24 | `rss` · `rss-regex` | oer_landesberichterstattung | `needs_review`/`manual` | **`healthy`/`auto`** |
| `rp-be-plenum` | Abgeordnetenhaus (PARDOK) | `structured_download` · `pardok-xml` | plenum, drucksachen, schriftliche_anfragen, gesetzgebung | `needs_review`/`manual` | **unverändert** |

`die-linke-berlin` — optionales Parteipaket, 3 Pflichtklassen, bleibt `prepared`:
`rp-be-partei_pilot` (429 Bot-Sperre), `rp-be-fraktion_pilot` (429), `rp-be-person_pilot`.
Es wird **nicht** mitaktiviert: ohne ein reales Berliner Mandat dieser Partei gibt es keinen
Anlass, und zwei seiner drei Wege sind bot-gesperrt.

**Pflichtklassen ehrlich: 8 von 12 liefern, 4 liefern nicht.** `plenum`, `drucksachen`,
`schriftliche_anfragen` und `gesetzgebung` hängen alle am selben PARDOK-Weg. Dessen Dispatch
(`pardok-dispatch.js`) hält die harte Invariante `items: []` in **jedem** Modus — ein Live-Modus
ist bewusst nicht implementiert (das wäre der PARDOK-Cutover, Schritt D/E, eigene Freigabe).
Der Weg wird deshalb **nicht** aktiviert: er würde je Crawl ~48 MB laden und 0 Dokumente liefern.

## 5 · Auswahlpfade — wer bekommt was

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

## 6 · Erwartete Last und Kosten

Abgeleitet aus dem Crawler, nicht geschätzt: je Weg 1 Feed-Abruf; Google-News-Wege lösen je Item
zusätzlich die Zieladresse auf (0 Requests bei lokaler Dekodierung, sonst 1 Seitenabruf + bis zu
2 `batchexecute`-POSTs). Obergrenze Items je Weg = `max_items` = 16. Crawl läuft 2× täglich
(`vercel.json`: `0 4 * * *`, `0 20 * * *`).

| Größe | Wert |
|---|---|
| zusätzliche Wege je Lauf | **6** (4 Google-News + 2 Direktfeeds) |
| zusätzliche Abrufe je Lauf | **6 (min) – 198 (max)** |
| zusätzliche Abrufe je Tag | **12 – 396** |
| davon gegen `news.google.com` je Lauf | bis **196** |
| neue Rohdokumente je Lauf | bis **96** |
| neue Rohdokumente je Tag | bis **192** |
| LLM-Aufrufe durch den Crawl | **0** (Kosten entstehen erst im Understanding) |
| Laufzeit | Nebenläufigkeit 20, Funktionsbudget 300 s — 6 zusätzliche Wege bleiben im Rahmen |

**Was das nicht heißt:** „keine Kosten". Die bis zu 196 zusätzlichen Google-Requests je Lauf
verschärfen Befund **B1** (Klumpenrisiko: 146 von 163 Wegen laufen bereits über Google) und
treffen dieselbe Drosselung wie **OP-15**. Der Crawl selbst ist LLM-frei, aber bis zu 192 neue
Rohdokumente pro Tag laufen anschließend in die Understanding-Warteschlange und erzeugen dort
LLM-Kosten unter dem Tagesbudget (100 + 30 Reserve, fail-closed). Bei bestehendem
Understanding-Rückstand (Befund **B2**) vergrößert Berlin die Warteschlange.

## 7 · Ausführung (freigabepflichtig, nicht Teil dieses Sprints)

| Schritt | Datei / Ort | mutierend |
|---|---|---|
| 1 | `node scripts/backup-export.js --scope=seed` — Manifest `vollstaendig: true` | nein |
| 2 | `sprint9b-verify.yml` laufen lassen, 6 Wege verifizieren | nein |
| 3 | **Block A** aus `supabase/seeds/20260726_berlin_aktivierung.sql` (Neutralisierung) | **ja** |
| 4 | Selbstprüfung 2 aus derselben Datei → 0 Zeilen | nein |
| 5 | Berliner Landtagsprofil anlegen (Provisionierungswerkzeug) | **ja** |
| 6 | **Block B** aus derselben Datei (Paketstatus + 6 Wege) | **ja** |
| 7 | `HELMUT_LANDESMODULE=berlin` setzen (Vercel-Env oder `helmut-flags.json` + Deploy) | **ja** |
| 8 | Selbstprüfungen 1, 3, 4 → 6 / 0 / `prepared` | nein |
| 9 | einen Crawl beobachten, danach Monitoring nach §8 | nein |

Die Reihenfolge ist bindend: Flag zuletzt. Damit ist der letzte Schritt zugleich der
schnellste Rückweg.

## 8 · Monitoring des ersten Laufs

Grundlage ist `source_crawl_telemetry` (je Weg eine Zeile pro Lauf).

| Frage | Messung |
|---|---|
| geplante vs. ausgeführte Berliner Wege | Plan-Kennzahl `landesmodule.aktiveWegeJeLand.berlin` gegen `count(distinct source_id)` mit `be-`/`rbb24`-Präfix |
| erfolgreiche Wege | `status='ok'` |
| leere Wege | `status='empty'` — ein Weg mit 2 leeren Läufen in Folge ist auffällig |
| fehlgeschlagene Wege | `status='error'` mit Meldung; `circuit-open` getrennt zählen (Befund A-7) |
| neue Dokumente je Weg | `new_documents` |
| Dedup | `found_documents` − `new_documents`; zusätzlich Fundstellen je Dokument |
| Aktualität | Altersverteilung `published_at`; Ziel: Median < 3 Tage |
| Originalverweis | Anteil Dokumente mit `canonical_target_url` außerhalb `news.google.com` |
| politische Ebene | Anteil KO mit `decision_level='land'` |
| Geografie | Anteil mit `geo-land-berlin`; **getrennt** der Brandenburg-Anteil aus `rp-rbb24-politik` |
| Verarbeitungskette | Rohdokument → Understanding → Knowledge Object; kein Rohdokument bleibt > 24 h unverarbeitet |
| Berliner Testmandat | erhält das Berliner Profil Inhalte im Briefing/Radar? |
| bestehende Bundescrawls | Zahl der Bund-Wege mit `ok` vor/nach der Aktivierung — muss gleich bleiben |
| Laufzeit / Kosten | `durationMs` je Lauf; LLM-Verbrauch gegen das Tagesbudget |

**Empfohlene Beobachtungsdauer: 3 Tage = 6 Crawl-Läufe.** Das deckt Werktag und Wochenende ab und
unterscheidet einen ruhigen Nachrichtentag von einem defekten Weg — ohne unnötig lange oder teure
Tests. Ein Weg gilt als tragfähig, wenn er in **mindestens 4 der 6 Läufe** `ok` liefert und über
den Zeitraum insgesamt neue Dokumente beisteuert.

## 9 · Abbruchkriterien

Sofortiger Abbruch (Rollback Stufe 0, siehe §10), wenn eines eintritt:

1. ein Weg eines **nicht freigegebenen** Landes erscheint im Plan oder in der Telemetrie
2. `brandenburg-basis` ist nicht mehr `prepared` oder ein `rp-bb-*`-Weg ist nicht mehr `manual`
3. die Zahl erfolgreicher **Bund**-Wege sinkt gegenüber dem Vorlauf
4. mehr als 2 der 6 Berliner Wege enden in einem Lauf mit `error`
5. Google-`429`-Rate oder `circuit-open`-Zeilen steigen gegenüber dem Vorlauf messbar
6. Crawl-Laufzeit überschreitet 240 s (80 % des 300-s-Funktionsbudgets)
7. mehr als 250 zusätzliche Abrufe in einem Lauf (Obergrenze 198 + Sicherheitsabstand)
8. Pending-Rückstau im Understanding wächst über zwei Läufe hinweg monoton
9. Berliner Dokumente werden mehrheitlich **nicht** als `land`/`geo-land-berlin` erkannt
10. ein Berliner Profil erhält Inhalte einer fremden Partei aus einem Pflichtpaket
11. mehr als 20 % der neuen Dokumente ohne auflösbaren Originalverweis
12. zwei aufeinanderfolgende Läufe liefern über alle 6 Wege 0 neue Dokumente
13. der Rollback ist nicht ausführbar

## 10 · Rollback (drei Stufen, getestet)

| Stufe | Mittel | Wirkung | Dauer |
|---|---|---|---|
| **0** | `HELMUT_LANDESMODULE` leeren (Vercel-Env) | alle Landesmodule sofort gesperrt, **kein** DB-Schreibzugriff | Sekunden, wirkt zum nächsten Lauf |
| **1** | `20260726_berlin_aktivierung_rollback.sql` | 6 Wege → `needs_review`/`manual`, `berlin-basis` → `prepared`; **Neutralisierung bleibt** | < 1 min |
| **2** | `20260726_berlin_aktivierung_rollback_vollstaendig.sql` | zusätzlich Block A zurück → exakt der gemessene Ist-Zustand vom 2026-07-26, **inklusive Befund A-3** | < 1 min |

Stufe 0 ist der Regelweg beim Abbruch. Stufe 1 macht den Zustand dauerhaft. Stufe 2 ist nur
nötig, wenn die Umhängung selbst Schaden angerichtet hat — sie stellt den Neutralitätsmangel
wieder her und ist deshalb kein Standardweg.

**Was der Rollback nicht tut:** bereits erzeugte Berliner Rohdokumente, Knowledge Objects und
Telemetriezeilen werden **nicht** gelöscht. Die Beweis- und Auditspur bleibt vollständig
erhalten; es gibt kein `delete` auf `raw_documents`, `knowledge_objects` oder
`source_crawl_telemetry`. Ein späteres Aussortieren wäre eine eigene Entscheidung.

**Testnachweis:** `node scripts/berlin-aktivierung-test.js` führt das committete SQL gegen eine
Speicherdatenbank aus und prüft Anwendung, Idempotenz und beide Rollback-Stufen; Stufe 2 wird
zeilengenau gegen den Ausgangszustand verglichen. Der Mini-SQL-Ausführer bricht bei jeder ihm
unbekannten Statementform hart ab — er kann nichts stillschweigend überspringen.

## 11 · Was Brandenburg und der Bund betrifft

- **Brandenburg bleibt inaktiv.** Kein ausführbares Statement der drei SQL-Dateien nennt einen
  `rp-bb-*`-Weg oder ein `brandenburg-*`-Paket (als Zeichenketten-Invariante geprüft).
  `brandenburg-basis` bleibt `prepared`, alle 9 Wege bleiben `needs_review`/`manual`.
  Das Gate meldet Brandenburg-Wege ausdrücklich als `landesmodul-gesperrt (brandenburg: …)`.
- **Eine benannte Nebenwirkung:** `rp-rbb24-politik` hängt in **beiden** Landespaketen (rbb ist
  ein Zwei-Länder-Sender). Er läuft über die **Berliner** Referenz mit und bringt damit auch
  Brandenburg-Inhalte in den Rohstrom. Das ist **keine** Aktivierung Brandenburgs — kein
  Brandenburg-Paket, -Weg oder -Profil wird aktiv, `brandenburg-basis` steuert 0 Referenzen bei.
  Der Plan weist solche Wege unter `landesmodule.mehrlaendrig` aus, damit die Nebenwirkung
  sichtbar bleibt und nicht behauptet werden kann, es käme ausschließlich Berliner Inhalt an.
  §8 misst den Brandenburg-Anteil dieses Wegs getrennt.
- **Der Bund bleibt unverändert.** Kein Bundesweg wird angefasst, keiner fällt weg; Berlin kommt
  rein additiv dazu (+6 Wege). Ohne aktives Profil laufen weiterhin nur die `always_on`-Kernwege.

## 12 · Bekannte Grenzen dieses Runbooks

1. Die Live-Verifikation der 6 Wege stammt vom **2026-07-14** (Run 29297142235). Aus der
   Arbeitsumgebung dieses Sprints ist kein Egress möglich (`CONNECT`-Antwort `403` auch für
   `tagesspiegel.de` und `rbb24.de`) — deshalb V2.
2. `rp-be-plenum` verweist auf `pardok-wp19.xml`. Wechselt die Berliner Wahlperiode, ändert sich
   die Adresse. Der Weg wird nicht aktiviert, das Risiko ist damit vertagt, nicht gelöst.
3. 4 der 6 Wege sind Google-News-Suchwege, keine amtlichen Direktfeeds. Für das
   Abgeordnetenhaus und den Landespressedienst war beim Live-Test kein tragfähiger Direktfeed
   auffindbar. Berlin startet damit auf einer schmaleren Belegbasis als der Bund.
4. Ein Berliner Testmandat existiert nicht. Der Nachweis der Verarbeitungskette ist bis heute
   ausschließlich lokal geführt (`scripts/berlin-aktivierung-test.js`).
