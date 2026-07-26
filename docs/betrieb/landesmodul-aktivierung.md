# Landesmodul-Aktivierung (Berlin / Brandenburg) — Runbook

**Stand:** 2026-07-26 · **Erstellt in:** Phase-1-Punkt 15 (Activation Readiness Brandenburg)
**Status dieses Dokuments:** vorbereitet. **Es wurde noch nie ausgeführt.**

> Dieses Runbook beschreibt, wie ein Landesmodul in Production aktiviert und wieder
> zurückgerollt wird. Es aktiviert selbst nichts. Jeder Schritt ist freigabepflichtig
> (`CLAUDE.md` §5).
>
> **Verbindliche Reihenfolge:** Berlin zuerst, allein, mit eigenem Production-Beweislauf.
> Brandenburg erst danach — und erst nach ausdrücklicher Bestätigung des Betreibers, dass
> der Berlin-Nachweis stabil ist. Beide gleichzeitig zu aktivieren ist ausgeschlossen.

---

## 1 · Warum es dieses Dokument gibt

Bis Punkt 15 gab es kein Aktivierungsverfahren, und die naheliegende Annahme war falsch.
Drei belegte Befunde:

| # | Befund | Folge |
|---|---|---|
| **B-1** | Das Landesmodul-Gate in `lib/helmut/quellenarchitektur/source-mode.js` war **unbedingt** und kannte kein einzelnes Bundesland | „Berlin zuerst, Brandenburg später" war **technisch nicht ausführbar** — jede Öffnung hätte beide Länder freigegeben |
| **B-2** | Eine reine **Datenänderung** (Paket `prepared` → `active`, Wege auf `healthy`) war **wirkungslos** | Ein Runbook, das nur Seeds und Status beschreibt, läuft ins Leere |
| **B-5** | Ohne ein **Landtagsprofil des jeweiligen Landes** bleibt das Paket trotz `status='active'` technisch inaktiv (`refCount 0`) | Production führt heute 8 Profile, davon 6 aktiv — **alle Bundestagsebene**. Eine Aktivierung ohne neues Profil ist ein reiner No-Op |

Belegt durch `scripts/brandenburg-aktivierung-test.js` (Gruppen 2, 3, 6).

## 2 · Die vier Stellschrauben

Eine Aktivierung ist **genau** diese vier Schritte. Es gibt keine fünfte, versteckte.
Jeder Schritt für sich ist wirkungslos — erst alle vier zusammen lassen einen Weg laufen.

| # | Schritt | Wo | Umkehrbar durch |
|---|---|---|---|
| **1** | Landtagsprofil des Landes anlegen | Production-DB (`mandate_profiles`) | Profil deaktivieren |
| **2** | Paketstatus `prepared` → `active` | Production-DB (`source_packages`) | zurück auf `prepared` |
| **3** | Wege abnehmen: `needs_review` → `healthy` **und** `manual` → `auto` | Production-DB (`retrieval_paths`) | zurück auf `needs_review` + `manual` |
| **4** | Landesfreigabe setzen | `HELMUT_LANDESMODUL_FREIGABE` (Vercel-Env **oder** `helmut-flags.json`) | Wert entfernen |

**Schritt 4 ist der schnellste Rückweg** — er benötigt keinerlei Schreibzugriff auf
Produktionsdaten. Entzieht man die Freigabe, werden ab dem nächsten Lauf **null**
Landeswege geplant, ohne dass eine einzige DB-Zeile angefasst wird.

### Der Freigabeschalter

```
HELMUT_LANDESMODUL_FREIGABE=berlin                 # nur Berlin
HELMUT_LANDESMODUL_FREIGABE=brandenburg            # nur Brandenburg
HELMUT_LANDESMODUL_FREIGABE=berlin,brandenburg     # beide (erst nach zwei getrennten Nachweisen)
```

- **Default: nicht gesetzt** = kein Landesmodul freigegeben. Das ist der heutige Zustand
  und in `helmut-flags.json` **bewusst nicht** eingetragen.
- **Fail-closed:** unbekannte Token wirken wie leer. `all`, `*`, `on`, `true`, `1`, `alle`
  und Tippfehler geben **nichts** frei. Es gibt keine Wildcard.
- Der Schalter ist eine **Erlaubnis, kein Auslöser**. Ein freigegebenes Land durchläuft
  danach unverändert alle normalen Regeln (Paket aktiv, Weg nicht `paused`/`broken`,
  Referenzzählung).

## 3 · Aktivierungsumfang Brandenburg

**2 Pakete · 8 eigene Abrufwege · 1 geteilter Weg.**

| Paket | Status heute | Ziel | Wege |
|---|---|---|---|
| `pkg-brandenburg-basis` (`is_base`) | `prepared` | `active` | 7 eigene + 1 geteilt |
| `pkg-die-linke-brandenburg` (optional) | `prepared` | `active` | 1 eigener |

| Weg | Herausgeber | Methode / Parser | `max_items` | Live-Urteil (2026-07-14) |
|---|---|---|---|---|
| `rp-bb-landesparlament` | Landtag Brandenburg | googlenews_search / `googlenews-batchexecute` | 16 | geeignet (20 Items, 5 Tage) |
| `rp-bb-plenum` | Landtag Brandenburg (parldok) | opendata_xml / `pardok-xml` | 16 | geeignet (6092 `<Vorgang>`, WP8) |
| `rp-bb-ausschuesse` | Landtag Brandenburg | googlenews_search / `googlenews-batchexecute` | 16 | geeignet (20 Items, 10 Tage) |
| `rp-bb-landesregierung` | Landesregierung Brandenburg | googlenews_search / `googlenews-batchexecute` | 16 | geeignet (20 Items, 0 Tage) |
| `rp-bb-ministerien` | Ministerien Brandenburg | googlenews_search / `googlenews-batchexecute` | 16 | geeignet (20 Items, 0 Tage) |
| `rp-bb-landesfraktionen` | Landtagsfraktionen SPD/AfD/CDU/BSW | googlenews_search / `googlenews-batchexecute` | 16 | geeignet (20 Items, 15 Tage) |
| `rp-bb-regionale_leitmedien` | MAZ / Lausitzer Rundschau | googlenews_search / `googlenews-batchexecute` | 16 | geeignet (20 Items, 0 Tage) |
| `rp-bb-partei_pilot` | Die Linke Brandenburg | rss / `rss-regex` | 16 | **geeignet mit Einschränkung** (HTTP 429, Bot-Sperre) |
| `rp-rbb24-politik` *(geteilt BE+BB)* | rbb24 | rss / `rss-regex` | 16 | geeignet (20 Items, 0 Tage) |

`rp-bb-plenum` deckt vier Pflichtklassen aus **einer** Rohquelle ab (Plenum, Drucksachen,
schriftliche Anfragen, Gesetzgebung) — bewusst, statt viermal dieselbe XML zu laden.
`rp-bb-landesregierung` deckt zusätzlich `staatskanzlei` ab. So kommen **12 von 12**
Pflichtklassen mit 8 Wegen zustande.

**Der geteilte Weg `rp-rbb24-politik`** gehört beiden Landespaketen (rbb ist ein
Zwei-Länder-Sender). Wird Berlin zuerst aktiviert, läuft er bereits — Brandenburg
verursacht dann **0 zusätzliche Abrufe** für diesen Weg.

## 4 · Last und Kosten (gerechnet, nicht geschätzt, wo möglich)

Grundlage: `vercel.json` (Crawl-Crons 04:00 und 20:00 UTC = **2 Läufe/Tag**),
`lib/helmut/crawler.js` (`CRAWLER_TIMEOUT_MS` 7000 ms), `lib/helmut/google-news-hardening.js`.

| Größe | Wert |
|---|---|
| zusätzliche Wege je Lauf | **8** (bei Berlin-zuerst; sonst 9) |
| davon über Google News | **6 von 8** |
| max. Rohkandidaten je Weg | 16 (`max_items` gesetzt, überstimmt den Google-Default 12) |
| max. zusätzliche Rohkandidaten je Lauf | **128** |
| Läufe je Tag | 2 |
| max. zusätzliche Abrufe je Tag | **16 Wegabrufe** |
| max. zusätzliche Rohkandidaten je Tag | **256** |
| Retries | max. 2 je Google-Weg, hart gedeckelt auf **12 je Lauf** (`HELMUT_GOOGLE_RETRY_BUDGET`) |
| Timeout je Abruf | 7 s |
| zusätzliche Laufzeit (Schätzung) | ~20–30 s je Lauf bei Google-Nebenläufigkeit 5; Worst Case mit Retries deutlich höher, aber durch das Retry-Budget begrenzt. Function-Limit: 300 s |
| direkte externe Kosten | **0 €** — alle 9 Wege sind unbezahlte HTTP-Endpunkte (Google News RSS, parldok-XML, rbb24-RSS, Partei-RSS). Kein bezahlter API-Anbieter |
| indirekte Infrastrukturkosten | Vercel-Funktionslaufzeit, Supabase-Zeilen (`raw_documents`), Egress |

**Die eigentliche Kostenstelle ist nicht der Crawl, sondern das Verstehen.** Neue
Brandenburger Dokumente laufen in dieselbe Understanding-Kette und konkurrieren um
**dasselbe** LLM-Tagesbudget (100 Aufrufe + 30 Reserve, fail-closed). Ein Per-Mandant-Deckel
existiert, ist aber **AUS** (`HELMUT_TENANT_LLM_CAP`, OP-03).

> **Betriebsrisiko R-1:** Ohne Per-Mandant-Deckel kann ein Brandenburger Testmandat dem
> aktiven Bundestagspiloten Budget wegnehmen. Vor der Aktivierung entscheiden: entweder
> `HELMUT_TENANT_LLM_CAP` scharfschalten oder das Tagesbudget anheben. **Nicht** ohne
> Entscheidung aktivieren.

> **Betriebsrisiko R-2 (Befund B1):** 146 von 163 aktiven Wegen laufen bereits über Google
> News. Brandenburg legt **6 weitere** darauf. Das verstärkt das dokumentierte
> Klumpenrisiko und die beobachtete Drosselung (OP-15). Der Circuit Breaker greift bei
> 60 % Fehlerquote ab 10 Beobachtungen; der Cooldown beträgt 60 Minuten und wirkt
> **quellenübergreifend** — eine Brandenburg-bedingte Drosselung kann also auch
> Bundeswege in den Cooldown ziehen.

Beide Crawl-Läufe liegen zu festen Zeiten. **Cron-Zeiten werden nicht geändert** (§5).

## 5 · Ablauf einer Aktivierung (später, freigabepflichtig)

Reihenfolge ist bindend — von der kleinsten zur größten Wirkung, damit jeder Schritt
einzeln überprüfbar ist.

1. **Vorbedingung prüfen:** Berlin ist aktiviert, hat einen stabilen Production-Beweislauf
   bestanden, und der Betreiber hat den Nachweis **ausdrücklich** bestätigt.
2. **Vorbedingung prüfen:** Entscheidung zu R-1 (LLM-Budget) liegt vor.
3. **Pre-Seed-Sicherung:** `node scripts/backup-export.js --scope=seed`, Manifest
   `vollstaendig: true` (siehe `backup-restore-runbook.md`).
4. **Schritt 1** — Brandenburger Landtagsprofil anlegen (Provisionierungswerkzeug,
   `zweitmandant-provisionierung-runbook.md`). Danach prüfen: Profil ist aktiv, Ebene
   `landtag`, Bundesland `Brandenburg`.
5. **Schritt 2** — beide Brandenburg-Pakete auf `active`.
6. **Schritt 3** — die 9 Wege auf `healthy` + `auto`.
   *Kontrolle:* der Plan zeigt jetzt noch **0** Brandenburg-Wege (Freigabe fehlt).
7. **Schritt 4** — `HELMUT_LANDESMODUL_FREIGABE=brandenburg` (bzw. `berlin,brandenburg`).
8. **Kontrolle vor dem ersten Lauf:** Plan zeigt **genau 8** Brandenburg-Wege, **kein**
   zusätzliches Berlin-Paket, alle Bundespakete unverändert.
9. **Ersten Lauf beobachten** (§6).

## 6 · Beobachtung des ersten Laufs

Vor dem Lauf notieren: Startzeit, erwartete Endzeit, **geplante** Wege (Sollwert: 8).

| Messgröße | Sollwert / Schwelle |
|---|---|
| ausgeführte Wege | 8 |
| erfolgreiche Wege | ≥ 6 |
| leere Wege | ≤ 2, jeder benannt |
| fehlgeschlagene Wege | ≤ 2, jeder benannt |
| neue Rohdokumente je Weg | > 0 bei ≥ 6 Wegen |
| eindeutige Dokumente nach Dedup | wird gemessen, nicht vorhergesagt |
| Aktualität | Median-Alter der Fundstellen ≤ 14 Tage |
| Originalverweise | jede Fundstelle öffnet eine echte URL |
| politische Ebene | Dokumente werden als `land` erkannt |
| Knowledge Objects | Anzahl + Anteil, der die Kette wirklich durchläuft |
| Mandatszuordnung | ≥ 1 Vorgang erreicht das Brandenburger Testmandat |
| Laufzeit | zusätzliche Laufzeit < 60 s |
| Retries | < 12 (Budgetgrenze) |
| Auswirkung auf Bestand | Bundeswege: gleiche Erfolgsquote wie im Lauf davor |
| Kosten | LLM-Aufrufe des Tages < Budget |

**Ein einzelner Treffer ist kein Nachweis.** Empfohlene Mindestbeobachtung:
**5 aufeinanderfolgende Crawl-Läufe über mindestens 3 Kalendertage** — genug, um
Wochenendlücken und einen Google-Cooldown-Zyklus (60 min) einzuschließen, ohne unnötig
lange zu messen. Mindestens **4 der 8 Wege** müssen in **mindestens 3 der 5 Läufe**
liefern. Die endgültige Wahl trifft der spätere Aktivierungssprint anhand der
Berlin-Betriebswerte.

## 7 · Abbruchkriterien

Sofort zurückrollen (§8), wenn eines eintritt:

1. Ein Berlin- oder anderer Landesweg erscheint ungeplant im Plan.
2. Ein aktives Bundespaket verliert Wege oder Erfolgsquote.
3. Fehlerquote der Brandenburg-Wege > 50 % in zwei aufeinanderfolgenden Läufen.
4. Der Google-Circuit-Breaker öffnet und zieht Bundeswege in den Cooldown.
5. Zusätzliche Laufzeit gefährdet das 300-s-Function-Limit.
6. Lock-Konflikte blockieren den bestehenden Crawl.
7. Parser erzeugen massenhaft leere oder fehlerhafte Dokumente.
8. Dokumente ohne belastbare Herkunft/Original-URL.
9. Dokumente werden der falschen politischen Ebene zugeordnet.
10. Das LLM-Tagesbudget wird durch Brandenburg ausgeschöpft und der Pilot leidet.
11. Ungeplante Kosten.
12. Der Production-Zustand weicht vom hier geprüften Aktivierungsplan ab.

## 8 · Rollback

**Reihenfolge: umgekehrt zur Aktivierung.** Lokal nachgewiesen in
`scripts/brandenburg-aktivierung-test.js` Gruppe 7 (byte-genauer Vergleich des
Ausgangszustands).

| Schritt | Wirkung |
|---|---|
| **R1** `HELMUT_LANDESMODUL_FREIGABE` entfernen | **sofort wirksam**, keine DB-Änderung. Ab dem nächsten Lauf 0 Brandenburg-Wege. **Das allein genügt, um den Crawl zu stoppen.** |
| **R2** die 9 Wege zurück auf `needs_review` + `manual` | Zustand vor der Abnahme |
| **R3** beide Pakete zurück auf `prepared` | Zustand vor der Aktivierung |
| **R4** Brandenburger Testprofil deaktivieren | `refCount` fällt auf 0 |

**Erwarteter Endzustand:** byte-identisch mit dem Ausgangszustand; der Crawl-Plan enthält
dieselben Wege wie vor der Aktivierung. Lokal geprüft.

**Was der Rollback ausdrücklich NICHT tut:**

- Er verändert **kein** Berlin-Paket und **keinen** Berlin-Weg.
- Er verändert **kein** Bundespaket.
- Er **löscht keine bereits erfassten Dokumente**. Bereits gecrawlte Brandenburger
  `raw_documents` und daraus entstandene Knowledge Objects **bleiben liegen**. Das ist
  Absicht: eine Löschung wäre eine Production-Datenänderung mit eigener Freigabepflicht.
  Diese Restdaten müssen nach einem Rollback ausdrücklich dokumentiert werden
  (Anzahl `raw_documents`, Anzahl KOs, Zeitraum).
- **Teilweise laufender Crawl:** R1 wirkt erst zum nächsten Lauf. Ein bereits gestarteter
  Lauf läuft zu Ende; seine Dokumente werden wie oben behandelt. Ein Abbruch mitten im
  Lauf ist nicht vorgesehen — die Locks sind fail-closed und ein harter Abbruch würde
  einen Lock hinterlassen.

**Prüfung nach dem Rollback:** Plan zeigt 0 Brandenburg-Wege · Bundeswege unverändert ·
Berlin unverändert · Restdaten dokumentiert.

## 9 · Parlamentarische Ausnahme (Die Linke Brandenburg)

`die-linke-brandenburg` erfüllt **1 von 3** Pflichtklassen; die beiden anderen sind
**geprüft nicht anwendbar**, weil Die Linke in der 8. Wahlperiode nicht im Landtag
Brandenburg vertreten ist.

- **Grundlage:** amtliches Endergebnis der Landtagswahl 22.09.2024 (Landeswahlleiterin) +
  Landtagshandbuch 8. WP. Fraktionen: SPD 32 · AfD 30 · BSW 14 · CDU 12 = 88 Sitze.
- **Maschinelle Kontrolle:** jede Ausnahme trägt eine `voraussetzung`, die gegen
  `seeds/parlamentszusammensetzung.js` geprüft wird. Kehrt Die Linke in den Landtag zurück,
  wird die Ausnahme **unbestätigt**, das Paket fällt auf „teilweise" und
  `paketvollstaendigkeit-test.js` wird **rot**.
- **Prüfstand (neu in Punkt 15):** `geprueft_am`, `pruefart` und `pruefvorbehalt` stehen am
  Parlamentsdatensatz; `pruefstand()` meldet das Alter und ob eine Nachprüfung fällig ist
  (Horizont **180 Tage**). Bewusst **kein** zeitgesteuerter Testfehler — die Fälligkeit
  wird berichtet, nicht erzwungen.
- **Offener Vorbehalt:** die Prüfung am 2026-07-26 konnte **nicht** live gegen die
  Primärquelle laufen — der Egress der prüfenden Sitzung erreicht
  `landtag.brandenburg.de` und `wahlen.brandenburg.de` nicht. Eine echte Neuprüfung muss
  aus einer Umgebung mit offenem Egress erfolgen (wie Sprint 9B auf dem GitHub-Actions-Runner).

## 10 · Bekannte Einschränkungen

1. **`rp-bb-partei_pilot`** antwortet Bot-Anfragen mit **HTTP 429**. Server-seitiger Abruf
   nötig; die Sperre wird **nicht** umgangen. Der Weg kann dauerhaft leer bleiben.
2. **6 von 8 Wegen sind Google-News-Suchwege**, keine Direktfeeds. Sie liefern Anrisse und
   Aggregator-Links, keine amtlichen Volltexte — und verstärken Befund B1.
3. **`rp-rbb24-politik` trägt nur `geo-land-berlin`** in `path_expected_geographies`,
   obwohl er beiden Ländern gehört. **Heute ohne Laufzeitwirkung** — das Feld hat keinen
   Konsumenten in `lib/`, `server.js` oder `client.js`; die politische Ebene entsteht in
   der KO-Klassifikation. In diesem Sprint bewusst **nicht** geändert, weil der Seed ein
   generiertes, mit Berlin geteiltes Artefakt ist. Vor einer geo-basierten Auswertung
   nachziehen.
4. **`rp-bb-ausschuesse` und `rp-bb-landesfraktionen`** lieferten im Live-Test die
   ältesten Inhalte (10 bzw. 15 Tage). Für Aktualitätsschwellen relevant.
5. **Kein Direktfeed für die Landesebene** verifiziert; die amtlichen `bbo_rss`-Pfade
   waren 404/HTML und wurden durch Google-News-Suchwege ersetzt (Sprint 9B, Runde 3).

## 11 · Verwandte Dokumente

- Quellenkandidaten je Klasse: [`../quellenarchitektur/11-landesmodule-berlin-brandenburg.md`](../quellenarchitektur/11-landesmodule-berlin-brandenburg.md)
- Technische Prüfung + vorbereitete Struktur: [`../quellenarchitektur/13-landesmodule-technische-pruefung-und-bundeswege.md`](../quellenarchitektur/13-landesmodule-technische-pruefung-und-bundeswege.md)
- Paketvollständigkeit: [`../quellenarchitektur/31-paketvollstaendigkeit.md`](../quellenarchitektur/31-paketvollstaendigkeit.md)
- Seed-Einspielung: [`quellen-seed-einspielung.md`](quellen-seed-einspielung.md)
- Sicherung/Restore: [`backup-restore-runbook.md`](backup-restore-runbook.md)
- Profil-Provisionierung: [`zweitmandant-provisionierung-runbook.md`](zweitmandant-provisionierung-runbook.md)
