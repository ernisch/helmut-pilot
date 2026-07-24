# 30 — HARDENING-SPRINT: BESTEHENDE QUELLENPAKETE AUF PRODUKTIONSNIVEAU

> **Auftrag:** Jedes bereits existierende Quellenpaket auf Produktionsniveau bringen —
> **härten**, nicht neu bauen. Keine neuen Pakete, keine neue Architektur, keine neuen
> Features, kein neues Datenmodell, **keine** Berlin/Brandenburg-Aktivierung. Qualität vor
> Quantität. Jede Änderung muss den Gesamtbestand robuster machen.
> **Datum:** 2026-07-24 · **Branch:** `claude/helmut-source-packages-hardening-rysu5c`
> **Basis (gestapelt):** `main` (`035898b`) **+ PR #118** (`937e494`, Gesamt-Audit doc 29 +
> Behebung P0-1/P0-2/P1-5). Dieser Sprint ist die **Folge-Härtung** auf dem von #118
> bereinigten Stand — er dupliziert #118 nicht, sondern adressiert die dort explizit
> deferierten Punkte (P1-3/P1-4/P1-6/P1-7, P2, P3).

---

## 0 · METHODEN-EHRLICHKEIT (verbindlich vorab)

Zwei harte Rahmenbedingungen bestimmen, **was in diesem Sprint sicher umgesetzt** und **was
bewusst nur dokumentiert** wurde:

1. **Kein Egress zu Behörden-/Medien-Domains.** `WebFetch`/`curl` erhalten für `bundestag.de`
   (403), `tagesschau.de` (blockiert) usw. eine Policy-Sperre — identisch zur Lage im Audit
   (doc 29, Kopf) und zu Master-Status §5. **Live-Verifikation neuer Direktquellen ist aus
   dieser Umgebung nicht möglich.** Gemäß Auftrag („keine experimentellen Quellen; nur stabile,
   offizielle, langfristig nutzbare, technisch zuverlässige Direktquellen übernehmen") wurden
   deshalb in diesem Sprint **keine unverifizierten neuen Quell-URLs in den aktiven Katalog
   aufgenommen.** Neue Direktquellen-Kandidaten sind für eine **eigens verifizierte
   Reparaturrunde auf einem Runner mit Egress** dokumentiert (§6), nicht blind eingespielt.

2. **Konservativität = keine Änderung am Live-Verhalten ohne Freigabe.** Alles, was den
   laufenden Crawl-Plan verändert (Wege entfernen, A&S konsolidieren, Status-Rückschreibung
   scharfschalten, BE/BB berühren), ist entweder freigabepflichtig oder yield-abhängig und
   **ohne DB-/Netz-Messung nicht seriös entscheidbar**. Diese Punkte sind mit konkretem
   Lösungsweg dokumentiert (§7/§8), nicht spekulativ ausgeführt.

**Konsequenz für den Sprint-Umfang.** Ausgeführt wurde ausschließlich **offline-verifizierbare,
additive, live-verhaltensneutrale Härtung** (§8). Der analytische Kern — vollständige
Paketbewertung, Pflichtanalyse, Google-News-Strategie, Future-Target-Neubewertung,
Statusmaschinen-Diagnose, Roadmap — ist der Hauptdeliverable dieses Berichts.

---

## 1 · DATENMODELL (Verständnis-Nachweis)

Die Quellenarchitektur trennt drei im Ist-Zustand verschmolzene Begriffe sauber (3NF):

- **Herausgeber (`publishers`)** — die veröffentlichende Organisation, existiert **einmal** je
  kanonischer Domain (Unique-Constraint). Google News ist **Aggregator**, kein verkleideter
  Herausgeber.
- **Abrufweg (`retrieval_paths`)** — die technische Methode (`rss`/`api`/`html`/
  `googlenews_search`/`structured_download`), über die Inhalte eines Herausgebers gefunden
  werden. Trägt `status` (6-stufig), `activation_mode` (`auto`/`always_on`/`dev_only`/`manual`),
  `is_critical`, `priority`.
- **Quellenpaket (`source_packages`)** — bündelt Abrufwege für **einen Produktzweck**; `status`
  5-stufig (`draft`/`prepared`/`active`/`paused`/`archived`), `is_base` (Pflicht-Basispaket).
- **`package_paths`** — m:n zwischen Paket und Abrufweg. Ein Weg kann in mehreren Paketen sein,
  wird aber **global genau einmal** gecrawlt (Referenzzählung, `model.computePathRefcounts` /
  `profile-packages.computeGlobalActivation`).

Zusätzlich: zentrale **Entitäts-** (`entities`) und **Geografie-**Schicht, `path_expected_*`
(Ebene/Geo-Grundwahrheit je Weg).

**Ableitungskette.** Die aktiven Pakete sind **kein handgepflegter Zweitbestand**, sondern eine
deterministische Projektion des Alt-Katalogs `lib/helmut/sources.js` (`v1Sources`) über
`catalog.buildCatalog` + `seeds/packages.packageKeysForSource`. Der committete SQL-Seed
(`20260713_source_architecture_seed.sql`) wird aus demselben Code generiert; das seit #118
aktive CI-Gate `seed-drift-test.js` erzwingt Byte-Gleichheit → **Source of Truth ist der Code.**

**Aktivierung** entsteht durch Profile: ein aktives Profil zieht per Referenzzählung seine
Pakete (`resolveProfilePackages`); ein Paket ist technisch nur aktiv, wenn ≥1 aktives Profil es
braucht **und** `status='active'`. Ohne Profil laufen nur die `always_on`-Kernwege. `prepared`-
Pakete (BE/BB) werden nie aktiv (höchstens `requested_unsupplied`).

---

## 2 · BESTAND (Ist-Stand nach #118, gemessen)

| Paket | Status | is_base | Wege | direkt (rss/api) | Google News | gnews% | kritisch | always_on |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **bund-basis** | active | ✅ | 54 | **4** | 50 | 93 % | 5 | 5 |
| **arbeit-und-soziales** | active | ❌ | 84 | **1** | 83 | 99 % | 1 | 0 |
| **die-linke-bund** | active | ❌ | 3 | **1** | 2 | 67 % | 2 | 0 |
| **regional-niedersachsen** | active | ❌ | 4 | **0** | 4 | 100 % | 0 | 0 |
| **profil-\<id\>** (dynamisch) | Laufzeit | ❌ | 1/Mandat | 0 | 1 | 100 % | 0 | 0 |
| berlin-basis | prepared | ✅ | 7 | 2 | 4 | — | (kritisch 5\*) | 0 |
| brandenburg-basis | prepared | ✅ | 8 | 3 | 4 | — | \* | 0 |
| die-linke-berlin | prepared | ❌ | 3 | 1 | 1 | — | \* | 0 |
| die-linke-brandenburg | prepared | ❌ | 1 | 1 | 0 | — | \* | 0 |

Aktiv gesamt: **144 Wege**, davon **138 `googlenews_search` (96 %)**, 5 `rss`, 1 `api`, 0 `html`,
**0 `broken`** (nach #118/P1-5). BE/BB: 18 vorbereitete Wege (9 kritisch), **0 aktiv**.
(\* BE/BB-Zahlen sind vorbereitet/inaktiv; siehe §5.)

---

## 3 · PAKETBEWERTUNG (A–F) + PFLICHTANALYSE JE PAKET

Bewertungsskala: **A** produktionsreif · **B** fast produktionsreif · **C** teilweise
produktionsreif · **D** grundlegend unvollständig · **F** neu aufbauen.

Kriterienraster (Auftrag): ① keine fehlenden Pflichtquellen · ② keine bekannten defekten Wege ·
③ ≥1 belastbarer Direktweg pro Kernbereich (wenn technisch möglich) · ④ Google News nur
Ergänzung · ⑤ keine unnötigen Dubletten · ⑥ klare Paketgrenzen · ⑦ keine politischen
Vermischungen · ⑧ Rollback geprüft · ⑨ Aktivierung dokumentiert.

### 3.1 · bund-basis — **Note B** (fast produktionsreif)

| Kriterium | Befund |
|---|---|
| ① Pflichtquellen | ✅ vollständig: Bundestag (Direkt-RSS + DIP-API), Bundesregierung, Bundesrat, **alle 22 Ausschüsse**, **alle 8 Fraktionen** (symmetrisch), Leitmedien. |
| ② defekte Wege | ✅ 0 (nach P1-5). |
| ③ Direktanker | ✅ **4 belastbare** Direktwege: DIP (`api`, Anker), Tagesschau (`rss`), Deutschlandfunk (`rss`), Bundestag-PM (`rss`). |
| ④ Google News | ⚠️ 93 % — Kern ist direkt, aber die **Breite** (Ausschuss-/Fraktions-Radar, Leitmedien-`site:`) läuft über den Aggregator. |
| ⑤ Dubletten | ✅ gering. |
| ⑥/⑦ Grenzen/Neutralität | ✅ **sauber & symmetrisch** — alle 8 Fraktionen gleichbehandelt; kein asymmetrischer Partei-Direktfeed in der Basis (per Gate-Invariante gepinnt). |
| ⑧ Rollback | ⚠️ eingeschränkt (Grundversorgung; nur archivieren, nicht löschen) — dokumentiert. |
| ⑨ Aktivierung | ✅ aktiv, dokumentiert. |

- **Fehlende Pflichtquellen:** keine harten. **Fehlende Direktquellen (Qualität):** amtliche
  **Ausschuss-Primärquelle** (alle 22 nur als Google-News-Query), Ministerien-Direktwege
  (nur BMAS hat einen), **Bundesrat-TOP/Plenar-Strukturweg**, **Bundesgesetzblatt/recht.bund.de**
  (P2-9). Alle netz-verifikationspflichtig → §6.
- **Redundant / schwach / defekt:** keine defekten; die 14 Leitmedien-`site:`-Suchen sind
  ersetzbar durch Direkt-RSS (Kandidat, §6).
- **Google-News-Wege ersetzbar:** ja, teils (Leitmedien-RSS) — dokumentiert, nicht blind.
- **Future Targets jetzt real:** Bundesgesetzblatt sofort als Kandidat (aber verifizieren).
- **Fehlende Entitäten/Geografien:** ~9 Bundesministerien als Entity ohne Direktweg (P2-9/§10).
- **Verdikt B, nicht A:** wegen 93 % Proxy-Breite + fehlender amtlicher Primärquellen. Der Kern
  trägt (Direktanker + DIP + Neutralität + 0 broken) → nahe A.

### 3.2 · arbeit-und-soziales — **Note C** (teilweise produktionsreif)

| Kriterium | Befund |
|---|---|
| ① Pflichtquellen | ✅ fachlich breit (BMAS, BA, Destatis, DRV, Gewerkschaften, Verbände, A&S-Ausschuss). |
| ② defekte Wege | ✅ 0. |
| ③ Direktanker | ⚠️ **nur 1** (BMAS-RSS). BA/Destatis/DRV liegen **nur** als Google-News-Suche vor. |
| ④ Google News | ❌ **99 %** — dominanter Beschaffungsweg, nicht Ergänzung. |
| ⑤ Dubletten | ❌ **hohe Redundanz (P2-8, ~84 Wege):** `radar-*`/`signal-*`/`process-*`/`bundle-ausschuss-*` re-abfragen dieselben Themen (Bürgergeld/Rente/Pflege/Mindestlohn/Tarif) mehrfach. |
| ⑥ Grenzen | ⚠️ Region sauber getrennt; latente Grenze **Pflege↔Gesundheit** (heute in A&S), wird real beim 2. Fachpaket. |
| ⑧ Rollback | ✅ sicher (additiv). |

- **Redundant:** ja, erheblich (P2-8). **Zu ersetzen/ergänzen:** amtliche Direktwege BA
  (`statistik.arbeitsagentur.de`-Feeds), Destatis — statt Proxy (§6, verifikationspflichtig).
- **Konsolidierung:** empfohlen, **aber nicht blind ausgeführt** — welche der ~26
  `bundle-ausschuss-*`-Wege realen Ertrag liefern, ist ohne DB-Yield-Messung nicht entscheidbar;
  ein Fehlschnitt verlöre Signal (Auftrag „Qualität vor Quantität" ⇒ konservativ messen, dann
  schneiden). Konkreter Plan in §7.
- **Verdikt C:** versorgt den Piloten nachweislich (100 % Ertragsabdeckung), aber 99 % Proxy +
  starke Redundanz + nur 1 Direktanker + fehlende amtliche Primärquellen drücken auf „teilweise".

### 3.3 · die-linke-bund — **Note B** (fast produktionsreif)

| Kriterium | Befund |
|---|---|
| ① Pflichtquellen | ✅ Partei (Die Linke) + Fraktion (Linksfraktion) + Fraktions-Radar. |
| ② defekte Wege | ✅ 0 (**P0-1 behoben** — `rp-fraction-linke` jetzt im Seed; kein 0-Wege-Paket mehr). |
| ③ Direktanker | ✅ 1 (`rp-linksfraktion` = `dielinkebt.de`-Direkt-RSS, eigene Primärstimme). |
| ④ Google News | ⚠️ 67 % (2/3), aber Kleinpaket mit direktem Fraktions-Primärfeed. |
| ⑤/⑥/⑦ | ✅ keine Dubletten; Partei-Paket sauber **aus der neutralen Basis herausgelöst**. |
| ⑧ Rollback | ✅ sicher (additiv). |

- **Fehlende/schwache Direktquelle:** `die-linke.de` läuft über Google-News-`site:` (Direktfeed
  real 429-bot-gesperrt, P1-5). **Nicht** unser Defekt — Bot-Sperre wird bewusst nicht umgangen.
- **Verdikt B:** kohärent, direkter Primäranker vorhanden, P0-1 geschlossen. Der einzige Abzug
  (Partei-Direktfeed nur als Proxy) ist extern bedingt.

### 3.4 · regional-niedersachsen — **Note C** (teilweise produktionsreif; unteres Ende)

| Kriterium | Befund |
|---|---|
| ① Pflichtquellen | ⚠️ dünn: 4 Google-News-Regionalsuchen (Salzgitter/Braunschweig/Wolfenbüttel). Kein Landtag NDS, keine Staatskanzlei, kein regionales Leitmedium als Direktfeed. |
| ② defekte Wege | ✅ 0. |
| ③ Direktanker | ❌ **0** — reiner Proxy. |
| ④ Google News | ❌ **100 %**. |
| ⑤/⑥/⑦ | ✅ keine Dubletten; Grenze zum Fachthema strikt getrennt (per Gate gepinnt). |
| ⑧ Rollback | ✅ sicher. |

- **Fehlende Direktquellen:** regionales Leitmedium (RSS), Landtag Niedersachsen, Staatskanzlei
  NDS — technisch möglich, aber netz-verifikationspflichtig (§6).
- **Verdikt C (grenzwertig D):** funktioniert (versorgt die Pilot-Region minimal), Grenzen/
  Rollback sauber — aber 0 Direktanker + 100 % Proxy + historisch schwacher Ertrag (21 Docs,
  0/24 h) machen es zum **nächsten Härtungskandidaten**. Kein D, weil strukturell korrekt und
  ohne Defekt.

### 3.5 · profil-\<mandats-id\> (dynamisch) — **Note B** (zweckerfüllend)

Ein personalisierter Google-News-Personensuchweg je Mandat, zur Laufzeit erzeugt
(`personalPackageKeyFor`). Mandantenlokal, Rollback sicher, isoliert. Einzel-Proxy-Weg ist der
**Natur der Sache** (es existiert kein amtlicher „Personen-Feed"). Keine politische Vermischung,
keine Dublette. **B** — fit for purpose; kein A, weil Single-Proxy ohne Zweitpfad.

### 3.6 · berlin-basis / brandenburg-basis (prepared) — **je Note D**

Nach #118/P0-2 **neutral** (12 institutionelle Pflichtklassen; Partei/Fraktion/Person in eigene
`die-linke-berlin`/`-brandenburg`-Pakete ausgelagert). Aber:
- **Unbesetzte Pflichtklassen:** Berlin fehlen `ausschuesse`, `ministerien`, `drucksachen`,
  `schriftliche_anfragen`, `gesetzgebung` (5); Brandenburg `staatskanzlei`, `fraktion_pilot`,
  `person_pilot`, `drucksachen`, `schriftliche_anfragen`, `gesetzgebung` (6).
- **P2-12:** Brandenburg-Herausgeber `publisher-stk.brandenburg.de` ist Orphan (0 Wege).
- **P1-6:** `rp-rbb24-politik` koppelt beide Länder (ein Weg, zwei Paketreferenzen) → kein
  modularer Rollback.
- **P1-3/P1-4:** `political_level`/`path_expected_*` für die Qualitätsprüfung + tote Live-
  Statusmaschine.
- **Verdikt D:** strukturell vorbereitet, aber für die Aktivierung **grundlegend unvollständig**.
  Kein F — die Integrität ist seit #118 intakt. **Nicht Bestandteil der Aktivierung in diesem
  Sprint** (Auftrag). Bewertung nur der Vollständigkeit halber.

### 3.7 · die-linke-berlin / die-linke-brandenburg (prepared, neu aus #118) — **je Note D**

Additiv, sauber vom Basispaket getrennt, Rollback isoliert. Aber `prepared`/inaktiv und die
Feeds sind 429-bot-gesperrt (serverseitiger Abruf nötig, unverifiziert in dieser Umgebung).
**D** (nicht aktivierbar; folgt der BE/BB-Freigabe). Strukturell korrekt — kein F.

---

## 4 · GESAMTAUSWERTUNG

| Note | Anzahl | Pakete |
|:---:|:---:|---|
| **A** | **0** | — |
| **B** | **3** | bund-basis, die-linke-bund, profil-\<id\> |
| **C** | **2** | arbeit-und-soziales, regional-niedersachsen |
| **D** | **4** | berlin-basis, brandenburg-basis, die-linke-berlin, die-linke-brandenburg |
| **F** | **0** | — |

**Kernaussage:** Der **aktive Bund-Bestand** (bund-basis, arbeit-und-soziales, die-linke-bund,
regional-niedersachsen, profil-\<id\>) ist **B/C — produktionsfähig, aber nicht
produktions-optimal**: 0 defekte Wege, saubere Grenzen/Neutralität, belastbare Direktanker im
Kern — aber ein **struktureller 96-%-Google-News-Anteil** (P1-7 SPOF), **fehlende amtliche
Primärquellen** (P2-9) und eine **tote Live-Statusmaschine** (P1-4) verhindern die Bestnote. Die
`prepared`-Landespakete sind D (bewusst inaktiv). **Kein Paket muss neu aufgebaut werden (0×F).**

---

## 5 · STATUSMASCHINE — REICHT SIE AUS, PAKETQUALITÄT OBJEKTIV ZU MESSEN?

**Antwort: NEIN — die LIVE-Statusmaschine reicht nicht (Umsetzung freigabepflichtig → hier nur
dokumentiert, Auftrag „Statusmaschine").**

**Was fehlt.** `model.nextPathStatus`/`mayAutoPause` (die 6-stufige Automatik) werden **nur in
Tests** aufgerufen. Der Live-Crawl schreibt `retrieval_paths.status`/`error_streak`/
`last_success_at` **nicht zurück** (`quality-watchdog.js:502` → `pathTelemetry:false`,
`last_success_at` in Prod leer). Folge: **140/144 Wege stehen dauerhaft auf `needs_review`**,
unabhängig von ihrer realen Gesundheit; es gibt **keine automatische Degradation/Broken-
Erkennung** und damit **keine laufzeitseitige, objektive Messung der Paketqualität** (Anteil
gesund/defekt, SPOF-Exposition, Kern-Weg-Ausfall).

**Warum jetzt nicht umgesetzt.** Die Rückschreibung verändert Live-Crawl-Verhalten → sie ist wie
die Bund-Migration **ausdrücklich freigabepflichtig** und liegt außerhalb der sicheren,
konservativen Zone dieses Sprints. Ein latenter Selbstwiderspruch bleibt bis dahin bestehen:
`rp-bundesregierung` ist `always_on`+`is_critical`, wird aber real über einen Google-News-Proxy
bedient (Direktfeed 404) — die Automatik könnte das heute nicht sichtbar machen.

**Wie später zu lösen (Reihenfolge).**
1. Telemetrie→`retrieval_paths`-Rückschreibung verdrahten (`error_streak`/`last_success_at`/
   `status` je erfolgreichem/fehlgeschlagenem Abruf), hinter eigener Freigabe + Rollback.
2. `nextPathStatus`/`mayAutoPause` scharfschalten (Kernwege `is_critical` nie still archivieren).
3. **Paket-Health-Rollup** ergänzen (je Paket: #healthy/#degraded/#broken, Direktanker-Anteil,
   SPOF-Exposition) → macht die A–F-Bewertung dieses Berichts laufzeitseitig **messbar** statt
   manuell.

**Zwischenlösung (in diesem Sprint geliefert).** `scripts/package-quality-gate-test.js` schließt
die Lücke auf der Ebene, die **ohne Freigabe/Netz sicher** ist: ein deterministisches CI-Gate,
das die harten Paketqualitäts-**Invarianten** objektiv prüft (Referenz-Integrität, 0 broken,
kein `always_on+critical+broken`, Paketgrenzen/Neutralität, Direktanker je Kernbereich, BE/BB-
Hard-Gate, Referenzzählung) und **jede Regression sofort rot** macht — bis die Live-Rückschreibung
(Schritt 1–3) scharfgeschaltet ist.

---

## 6 · QUELLENSTRATEGIE — GOOGLE NEWS & DIREKTQUELLEN

**Grundsatz:** Google News bleibt **legitime Ergänzung** dort, wo kein stabiler amtlicher
Direktweg existiert oder der Direktweg bot-gesperrt ist (bewusst nicht umgangen). Wo ein
verifizierter Direktweg möglich ist, ist er dem Proxy **vorzuziehen** — aber nur **verifiziert**.

| Google-News-Abhängigkeit | Entscheidung | Begründung |
|---|---|---|
| bund-basis: 22 Ausschuss-Radar | **behalten + ergänzen** | Kein amtlicher Ausschuss-Feed pro Ausschuss verfügbar; DIP deckt Vorgänge amtlich ab. Ergänzung: amtliche Ausschuss-Primärquelle (P2-9, verifizieren). |
| bund-basis: 8 Fraktions-Radar | **behalten** | Symmetrische Neutralität; Fraktions-Direktfeeds teils bot-gesperrt. |
| bund-basis: 14 Leitmedien-`site:` | **ersetzen (Kandidat)** | Tagesschau/DLF sind bereits Direkt-RSS; Spiegel/Zeit/FAZ/SZ haben Direkt-RSS → Proxy ersetzbar. **Verifikationspflichtig.** |
| bund-basis: `rp-bundesregierung` (always_on, Proxy) | **behalten** | Direktfeed real 404 (P1-5). Einziger `always_on`-Proxy-Weg — als Risiko markiert (§5). |
| arbeit-und-soziales: BA/Destatis/DRV als Proxy | **ersetzen (Kandidat)** | Amtliche Statistik-Feeds existieren (`statistik.arbeitsagentur.de`, Destatis) → Direktweg vorziehen. **Verifikationspflichtig.** |
| arbeit-und-soziales: `bundle-ausschuss-*`/`radar-*`/`signal-*` | **konsolidieren** | Starke Themen-Überlappung (P2-8); yield-gemessen reduzieren, nicht blind (§7). |
| die-linke-bund: `site:die-linke.de` | **behalten** | Direktfeed 429-bot-gesperrt; Fraktions-Primärfeed ist bereits direkt. |
| regional-niedersachsen: 4 Regionalsuchen | **ergänzen** | Direktes Regionalmedium/Landtag NDS als Anker ergänzen. **Verifikationspflichtig.** |
| profil-\<id\>: Personensuche | **behalten** | Kein amtlicher Personen-Feed; inhärent Proxy. |

**Direktquellen — Ehrlichkeit.** In dieser Umgebung ist **keine** neue Direktquelle live
prüfbar. Die verifizierte Whitelist aus #118 (11 aktive: BMAS, Tagesschau, DLF, DIP, Bundestag-PM
+ 6 Ersatz) **steht**. **Dokumentierter, nicht angewendeter Kandidat:** `dgb.de/service/rss`
(echter DGB-Direktfeed, WebSearch-korroboriert, besser als der aktuelle `site:dgb.de`-Proxy) —
für die verifizierte Reparaturrunde vorgemerkt. **Keine experimentellen Quellen aufgenommen.**

---

## 7 · KONSOLIDIERUNGSPLAN A&S (P2-8) — dokumentiert, nicht ausgeführt

Warum nicht jetzt: Ohne DB-Yield-Messung (netzgesperrt) ist nicht entscheidbar, welche der ~26
`bundle-ausschuss-*` + Radar/Signal-Wege realen Ertrag liefern; ein Fehlschnitt verlöre Signal.

**Vorgehen (freigabe-/messgestützt):**
1. Je Thema (Bürgergeld/Rente/Pflege/Mindestlohn/Tarif) den **Ertrag je Weg** über 30 Tage
   messen (`raw_documents` je `legacy_source_id`).
2. Pro Thema **den ertragsstärksten Weg behalten**, dublettenschwache Varianten archivieren
   (`status='archived'`, nicht löschen — Rollback bleibt).
3. Ziel: A&S von ~84 auf ~40–50 signalstarke Wege; Google-News-Klumpenrisiko + Dedup-Last sinken.
4. Nach Schnitt: `package-quality-gate-test.js` erweitern (Mindest-Themenabdeckung pinnen), damit
   die Konsolidierung nicht versehentlich ein Thema komplett verliert.

---

## 8 · AUSGEFÜHRTE HÄRTUNG (dieser PR — offline, additiv, live-neutral)

Alle drei Änderungen sind **live-verhaltensneutral**, ohne Netz/Freigabe verifizierbar, und
durch die Offline-Suite abgesichert (**142/142 grün**, inkl. Seed-Drift byte-identisch).

1. **P3-15 — DIP als Single Source of Truth.** `catalog.js` definierte den DIP-Abrufweg doppelt
   (`DIP_PATH`-Konstante **und** eine Inline-Kopie im `buildCatalog`). Die identitätsstiftenden
   Felder (`legacy_source_id`/`method`/`url`/`query`/`priority`) stammen jetzt **ausschließlich**
   aus `DIP_PATH` → Driftquelle beseitigt. **Seed byte-identisch** (Generator-Output unverändert).
2. **P3-18 — Refcount-Identitätskollision gehärtet.** In `computeGlobalActivation` diente für
   id-lose Profile `JSON.stringify(p).slice(0,40)` als Schlüssel — zwei **distinkte** Profile mit
   gleichem 40-Zeichen-Präfix wären als eines gezählt und hätten die Referenzzählung verfälscht.
   Jetzt voller JSON-Abdruck (`anon:<json>`) → kollisionsfrei für unterscheidbare Profile.
3. **Neues Offline-Paketqualitäts-Gate** (`scripts/package-quality-gate-test.js`, 27 Invarianten).
   Objektive, deterministische Messung (27 Invarianten) + Regressionspins für exakt die
   Audit-Defekte: P0-1 (die-linke-bund ≥1 Weg + `rp-fraction-linke`), P0-2/Neutralität (symmetrische 8-Fraktionen-
   Abdeckung, keine asymmetrischen Partei-Direktfeeds in der Basis), P1-5 (0 broken),
   P1-4-Selbstwiderspruch (`always_on+critical+broken`), BE/BB-Hard-Gate, Referenz-Integrität,
   Orphan-Herausgeber, Direktanker je Kernbereich, Referenzzählung (100 Profile = 1 Aktivierung).
   Automatisch von `run-offline-tests.js` erfasst (CI-blockierend).

**Bewusst NICHT ausgeführt** (dokumentiert statt spekuliert): neue Direktquellen (Netz gesperrt,
§6) · P2-8-Konsolidierung (yield-abhängig, §7) · P1-4-Live-Rückschreibung (freigabepflichtig, §5)
· P1-6-rbb24-Decoupling (BE/BB, Tradeoff — siehe §9) · P1-3-Grundwahrheit (Landesblocker) ·
jede BE/BB-Aktivierung (Auftrag).

---

## 9 · FUTURE-TARGET-NEUBEWERTUNG

| Future Target | Entscheidung | Begründung |
|---|---|---|
| **Bundesweg-Reparaturen (6)** | **verwerfen** (erledigt) | Über #118/P1-5 live in `sources.js`; kein Future Target mehr. |
| **Berlin-/Brandenburg-Landesmodul** | **bleibt Future Target** | Verifiziert (24/24, PARDOK), aber P1-3/P1-4/P1-6 + Pflichtklassen/Orphan offen; Aktivierung ist per Auftrag **ausgeschlossen**. |
| **`dgb.de/service/rss`** | **bleibt Future Target** | Echter Direktfeed, aber nur WebSearch-korroboriert → verifizierte Runde nötig. |
| **Bundesgesetzblatt / recht.bund.de** | **bleibt Future Target (hoch)** | Amtliche Gesetzesverkündung fehlt ganz (P2-9); als Kandidat anlegen, **verifizieren** vor Aufnahme. |
| **Leitmedien-Direkt-RSS (statt `site:`)** | **bleibt Future Target** | Robuster als Proxy; verifikationspflichtig. |
| **Amtliche Ausschuss-/Ministeriums-Primärquellen** | **bleibt Future Target** | Viele bot-gesperrt → einzeln prüfen; DIP deckt Vorgänge bereits amtlich ab. |
| **P1-6 rbb24-Decoupling** | **Future Target (mit Vorbehalt)** | **Design-Tradeoff, kein reiner Defekt:** die Kopplung ist teils gewollt (globaler Ein-Mal-Crawl von rbb24 für BE+BB). Decoupling erkauft modularen Rollback mit **doppeltem Crawl**. Empfohlene Lösung: Rollback über die `package_paths`-Ebene modularisieren (Link je Land lösen, Weg behalten) **statt** den Weg zu duplizieren; zusätzlich `be-`/`bb-`-Präfixerkennung im Hard-Gate. **Vor BE/BB-Aktivierung** umzusetzen, nicht jetzt (BE/BB inaktiv → Rollback-Sorge aktuell gegenstandslos). |
| **PARDOK-Dispatch** | **bleibt Future Target** | Mit BE/BB aktivieren. |
| **13 weitere Länder / Bezirks-/Kreis-Ebene** | **bleibt Future Target (niedrig)** | Erst nach BE/BB-Blaupause, profilgetrieben. |

---

## 10 · ABSCHLUSSBERICHT JE PAKET (kompakt)

| Paket | Reifegrad | Fehlende Quellen | Neu ergänzt | Entfernt | Ersetzt | Direktquellen | Proxy-Anteil | Google-News-Anteil | Bekannte Risiken | Empfehlung |
|---|---|---|---|---|---|---|---|---|---|---|
| bund-basis | **B** | amtl. Ausschuss-/Ministeriums-/Gesetzblatt-Primärquellen (§6) | — (konservativ) | — | — | 4 (DIP-API + 3 RSS) | 93 % | 93 % | SPOF; 1 always_on-Proxy (bundesregierung) | Leitmedien-RSS + amtl. Primärquellen **verifiziert** ergänzen |
| arbeit-und-soziales | **C** | amtl. Direktwege BA/Destatis/DRV | — | — (Konsolidierung nur geplant, §7) | — | 1 (BMAS-RSS) | 99 % | 99 % | Redundanz (P2-8); SPOF | Yield-gestützt konsolidieren + Statistik-Direktfeeds |
| die-linke-bund | **B** | — (die-linke.de nur Proxy, bot-bedingt) | — | — | — | 1 (Linksfraktion-RSS) | 67 % | 67 % | Partei-Direktfeed bot-gesperrt | Stabil; P0-1 geschlossen |
| regional-niedersachsen | **C** | Landtag NDS, Staatskanzlei, Regional-Leitmedium (Direkt) | — | — | — | 0 | 100 % | 100 % | 0 Direktanker; schwacher Ertrag | Direkten Regional-Anker **verifiziert** ergänzen |
| profil-\<id\> | **B** | — (kein amtl. Personen-Feed) | — | — | — | 0 | 100 % | 100 % | Single-Proxy | Zweckerfüllend; ggf. Zweitpfad |
| berlin-basis | **D** | 5 Pflichtklassen | — | — | — | 2 (prepared) | — | — | P1-3/4/6; inaktiv | Aktivierung erst nach P1-3+4+6 (nicht dieser Sprint) |
| brandenburg-basis | **D** | 6 Pflichtklassen + Orphan `stk` | — | — | — | 3 (prepared) | — | — | P1-3/4/6; P2-12 | dito |
| die-linke-berlin | **D** | — (Feeds 429) | — | — | — | 1 (prepared) | — | — | inaktiv | folgt BE-Freigabe |
| die-linke-brandenburg | **D** | fraktion/person unbesetzt | — | — | — | 1 (prepared) | — | — | inaktiv | folgt BB-Freigabe |

> „Neu ergänzt/entfernt/ersetzt" ist in diesem Sprint bewusst **leer** für den Quellenbestand:
> ohne Live-Verifikation wäre jede Quell-Mutation experimentell (Auftrag verbietet das). Die
> Härtung dieses Sprints ist **strukturell** (§8), nicht bestandsmutierend.

---

## 11 · PRIORISIERTE ROADMAP

**1 · Sofort mergefähig (dieser PR).**
- P3-15 (DIP Single Source), P3-18 (Refcount-Kollision), Offline-Paketqualitäts-Gate, doc 30.
- Risiko: minimal (live-neutral, 142/142 grün, Seed byte-identisch). **Empfehlung: mergen.**

**2 · Weitere Hardening-Sprints (freigabe-/netzverifiziert, in dieser Reihenfolge).**
- **2a P1-4** — Live-Status-Rückschreibung scharfschalten + Paket-Health-Rollup (macht A–F
  laufzeitmessbar; §5). *Freigabepflichtig.*
- **2b Verifizierte Direktquellen-Runde** (Runner mit Egress): `dgb.de/service/rss`,
  Leitmedien-Direkt-RSS statt `site:`, BA/Destatis-Statistik-Feeds, Bundesrat-TOP,
  Bundesgesetzblatt/recht.bund.de. Jede Quelle einzeln HTTP-verifiziert (P2-9).
- **2c P2-8** — A&S yield-gestützt konsolidieren (§7).
- **2d P1-3** — `political_level`/`path_expected_*` für aktive Wege befüllen.
- **2e P1-7** — Google-News-Zweitpfad/Heartbeat (SPOF-Entschärfung).

**3 · Neue Fachpakete** (z. B. Gesundheit) — **erst nach** expliziter Themen→Paket-
Zuordnungsmatrix (Audit §7; Pflege↔Gesundheit↔Soziales sauber schneiden). Nicht Teil der
Härtung.

**4 · Berlin/Brandenburg-Aktivierung** — **erst nach** P1-3 + P1-4 + P1-6 (rbb24 modularisieren,
§9) + P2-12 (Orphan/Pflichtklassen). Per Auftrag **ausgeschlossen** in diesem Sprint.

---

## 12 · FAZIT

Der **aktive Bestand ist robust genug für den laufenden Betrieb** (0 defekte Wege, saubere
Grenzen/Neutralität, belastbare Direktanker im Kern, seit #118 seed-treu) — aber **nicht
produktions-optimal**: 96 % Google-News-Anteil (SPOF), fehlende amtliche Primärquellen und eine
tote Live-Statusmaschine halten die Bestnote zurück. **A: 0 · B: 3 · C: 2 · D: 4 · F: 0.**

Dieser Sprint hat den Bestand **strukturell gehärtet** (Driftquelle beseitigt, Referenzzählung
kollisionssicher, objektives Offline-Qualitätsgate) und die substanzielle, **nur verifiziert
oder freigabepflichtig** umsetzbare Restarbeit präzise, konservativ und mit Lösungsweg
dokumentiert — statt sie experimentell zu erzwingen. Die nächste Qualitätsstufe (Note A für den
Bund) hängt an der **verifizierten Direktquellen-Runde** und der **scharfgeschalteten
Statusmaschine** — beide brauchen eine Umgebung mit Egress bzw. eine Betriebsfreigabe.
