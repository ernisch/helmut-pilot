# P2-5 Quellenabdeckung — warum der Readiness-Check „zu dünn" meldete

**Stand:** 2026-07-15 · **Modus der Analyse:** lesend gegen Production
(`ddckuvvpcytqbyfmbvie`) + Code · **Branch:** `claude/source-coverage-p2-readiness-cqh0za`
**Umfang:** Bundestag + Cem-Pilot. **Büro bewusst ausgelassen** (wird separat überarbeitet).

> **Kernbefund in einem Satz:** Es fehlen **keine** Quellen für den Piloten — der
> Readiness-Check stellte einen **gesunden ~145-Quellen-Crawl** gegen Schwellen von
> **495/450/405**, die seit ihrer Einführung (2026-07-11) **nie erfüllbar** waren und
> ~3× zu hoch lagen. Zusätzlich zählte die „Quellenbasis"-Prüfung die **falsche Zahl**
> (eingefrorener `store.sources`-Blob statt der relationalen Quellenwahrheit).

---

## Die fünf geforderten Klärungen

### 1. Welche Schwelle verlangt der Check?

Drei Schwellen bewerten die Quellenmenge (alle `server.js`, ENV-überschreibbar; Defaults
vor dieser Behebung):

| Konstante | alt (Default) | Wo geprüft | Effekt bei Unterschreitung |
|---|---|---|---|
| `HELMUT_MIN_CONFIGURED_SOURCES` | **495** | Backend-Health „Quellenbasis" | Check rot |
| `HELMUT_MIN_CHECKED_SOURCES` | **450** | Crawl-Qualität · pilotReadiness · isFullCrawlHealthy · Release · Live-Flow · Watchdog-INGEST | „zu wenige Quellen geprüft" → **nicht pilotbereit** |
| `HELMUT_MIN_SUCCESSFUL_SOURCES` | **405** | isFullCrawlHealthy · pilotReadiness (Warnung) | „erfolgreiche Quellenbasis ist noch dünn" |

Dieselben Werte (450/405) standen dupliziert in `lib/helmut/watchdog-state.js`
(`DEFAULT_THRESHOLDS`) und in `scripts/smoke-test.js`.

### 2. Warum werden aktuell nur 145 Quellen gezählt?

Der profil-gebundene Crawl liefert **145 Quellen** (145 geprüft / 145 erfolgreich /
**0 Fehler**, jüngster Lauf 2026-07-15 20:03). Das ist der **gesunde Normalzustand**,
nicht ein Ausfall:

- Seit dem **QUELLEN-CUTOVER** (`HELMUT_SOURCE_MODE=on`, 2026-07-15 06:45) ist die
  relationale DB die Quellenwahrheit. `buildRelationalCrawlPlan` erzeugt einen
  **global deduplizierten** Plan: jeder Abrufweg genau einmal, nur aktive Pakete,
  Berlin/Brandenburg hart gesperrt, defekte Wege ausgeschlossen.
- **Entscheidend:** Auch **vor** dem Cutover war der Crawl schon ~**149** Quellen groß
  (20 crawlRuns durchgehend 145–149). Der Profilfilter + die Kuratierung des alten
  Katalogs (`slice(0,560)`) ergaben **nie** die ~450–495 der Schwelle. Der Cutover senkte
  149→145 (global-URL-Dedup entfernt ~4 doppelte Wege) — die Diskrepanz existierte schon
  **davor**.

Die aktive relationale Struktur (Production):

| Ebene | Zahl |
|---|---|
| retrieval_paths gesamt | 163 |
| davon aktiv im Plan (Cem-Profil) | ~138 (+ Profilquellen → 145 geprüft) |
| davon **broken** (ausgeschlossen) | 6 |
| davon Landesmodul BE/BB (hart gesperrt) | 18 |
| aktive Pakete | 5 (bund-basis, arbeit-und-soziales, die-linke-bund, regional-niedersachsen, profil-cem-ince) |

### 3. Fehlen wirklich Quellen — oder zählt der Check falsch?

**Der Check zählt falsch / ist fehlkalibriert.** Zwei unabhängige Fehler:

1. **Fehlkalibrierte Schwellen (Hauptursache).** 495/450/405 wurden am **2026-07-11**
   gesetzt — vermutlich am rohen Katalogumfang (~566) orientiert statt am tatsächlichen
   profil-gefilterten, kuratierten, deduplizierten Ist-Crawl (~145–149). Sie waren **nie**
   erfüllbar und meldeten die Basis seit vier Tagen dauerhaft als „zu dünn".

2. **Falsche Zählgröße bei „Quellenbasis" (Nebenfehler).** Die Prüfung zählte
   `storeSummary.sources.active` = der **eingefrorene `store.sources`-Blob** (144). Nach dem
   Cutover ist dieser Blob nur noch **Fallback-Katalog** — eine tote Zahl, die sich nicht
   mit Paketen/Wegen ändert. Die echte aktive Quellenbasis ist der relationale Plan.

**Belastbarkeit der 145 (kein Grün-Trimmen):** raw_documents tagesfrisch — **915 Dok./24h**,
2.983/7d, 105 distinct Quellen/7d, jüngstes 2026-07-15 20:00 (Momentaufnahme 2026-07-15;
Zahlen bewegen sich pro Crawl). Abgedeckt: alle Ausschüsse (committee-*), alle Fraktionen
(fraction-*), Leitmedien (Deutschlandfunk/Tagesschau), Ministerien, Bundestag (general-hib,
general-bundestag-plenum) + **DIP** (amtliche Drucksachen, direkt). Die 145 sind eine
**ausreichende, belastbare** Basis für den Piloten (kritische Nachprüfung s. u.).

### 4. Welche Quellen/Abrufwege/Pakete fehlen konkret?

**Für die Breite des Piloten: keine.** Die 5 aktiven Pakete decken das Cem-Mandat exakt ab
(Bundestag + Die Linke + Arbeit&Soziales + Niedersachsen + persönliche Beobachtung). Die
Audit-Empfehlung war ausdrücklich **B (gezielte Pakete), keine Massenerweiterung**.

**Ein realer Qualitäts-Gap (sekundär, nicht die Ursache des „zu dünn"):** 6 **direkte
Primärquellen** stehen auf `status='broken'` und sind daher aus dem Crawl ausgeschlossen:

| Weg | kritisch | ersetzt heute durch (Google-News-Proxy) |
|---|---|---|
| `rp-bundestag` (Bundestag RSS) | ja | general-hib, general-bundestag-plenum + DIP |
| `rp-bundesregierung` (Bundesregierung RSS) | ja | general-bundesregierung-vorhaben |
| `rp-die-linke` (Die Linke Presse) | ja | fraction-linke |
| `rp-linksfraktion` (Linksfraktion Presse) | ja | fraction-linke |
| `rp-ausschuss-arbeit-soziales` (HTML-Scrape) | nein | committee-Radare |
| `rp-dgb` (DGB HTML) | nein | association-Quellen |

Die **Breite** dieser Themen ist also über Proxys + DIP bereits abgedeckt; was fehlt, ist
die **direkte Primär-Beleg-Qualität** (official_primary statt Aggregator). Das senkt die
Readiness **nicht** (die 6 sind bereits ausgeschlossen; die 145 enthalten sie nicht).

**Warum sie nicht einfach „repariert" wurden:** Sprint 9B (`bundeswege-reparaturen.js`,
2026-07-14) hat für **alle 6** funktionierende Ersatz-/Reparatur-URLs auf einem
GitHub-Runner **real verifiziert** (HTTP 200, u. a. echte Direktfeeds für Bundestag
`…/pressemitteilungen.rss` und Linksfraktion `…/feed.rss`) — **aber nichts angewendet**
(`angewendet: 0`). Die Reparatur ist **zweiteilig und freigabepflichtig**:
- **Production-DB-Write** auf `retrieval_paths` (url/method/status/error_streak) **und**
- eine koordinierte **Code/Katalog-Anpassung**: `toCrawlerSource` bevorzugt das
  Legacy-Objekt (`lib/helmut/sources.js`) vor der Pfad-URL — dort stehen noch die **alten
  defekten** URLs. Ein reiner `UPDATE` auf `retrieval_paths` allein würde durch das
  Legacy-Mapping wieder auf die alte URL zurückfallen.

→ **Founder-gated** (Production-Write + abgestimmter Code-Change). Nicht Teil dieser
Behebung. Siehe „Nächste Schritte".

### 5. Was ist für Bundestag + Cem-Pilot tatsächlich notwendig?

- **Notwendig & jetzt behoben:** Schwellen, die den relationalen Ist-Stand (~145)
  abbilden, und eine **ehrliche Zählung** der aktiven Quellenbasis. Damit meldet der Check
  Wahrheit statt Dauer-Rot.
- **Wünschenswert, founder-gated:** die 6 verifizierten Direktfeed-Reparaturen für bessere
  Primär-Beleg-Qualität (v. a. `rp-bundestag`, `rp-linksfraktion` als echte Direktfeeds).
- **Nicht notwendig:** eine Massenerweiterung der Quellenzahl. Sie würde nur das
  Google-News-Klumpenrisiko erhöhen, ohne echte Lücken zu schließen.

---

## Kritische Nachprüfung: Sind die 6 defekten Primärquellen für den Cem-Pilot verzichtbar?

Auftragsgemäß nochmals hart gegen Production geprüft (Momentaufnahme 2026-07-15). **Belege
je Cem-Kern-Dimension (7 Tage):** Arbeit & Soziales **700 Dok.** · Die Linke **101 Dok.** ·
Bundestag **499 Dok.** — jeweils aus *funktionierenden* Quellen, unabhängig von den 6 defekten.

Und die *funktionierende* Ersatzdeckung je defekte Quelle (aus den aktiven Paketen):

| Defekte Quelle | Cem-Bezug | Funktionierender Ersatz (aktiv/needs_review, läuft) | Verzichtbar? |
|---|---|---|---|
| `rp-ausschuss-arbeit-soziales` (HTML-Seite) | **sein Ausschuss** | **25+ googlenews-Wege** auf `"Ausschuss für Arbeit und Soziales"` (Bürgergeld/Rente/Mindestlohn/Pflege/Tarif/… je eigener Weg) + hib-Ausschuss + Prozess-Radare | **Ja — sogar übertroffen** (die eine HTML-Seite liefert weniger als die 25er-Themenmatrix) |
| `rp-bundesregierung` (RSS) | Regierung | `general-bundesregierung-vorhaben` + `process-eckpunkte/-bundeskabinett` | **Ja** — Reparatur wäre ohnehin googlenews (Direktfeed real 404); überlappt |
| `rp-dgb` (HTML) | Gewerkschaften | `news-verdi`, `news-ig-metall` (die großen DGB-Gewerkschaften, direkt), `signal-tarifflucht`, `institution-boeckler` | **Ja** — Reparatur wäre googlenews; Mitgliedsgewerkschaften gedeckt |
| `rp-die-linke` (Partei-RSS) | **seine Partei** | `fraction-linke` (deckt „Die Linke" breit) + Leitmedien | **Weitgehend** — Reparatur wäre googlenews site-search (Direktfeed bot-gesperrt); überlappt mit fraction-linke |
| `rp-bundestag` (RSS) | Parlament | `general-hib` (amtlicher Bundestags-Pressedienst), `general-bundestag-plenum`, **DIP** (amtliche Drucksachen, direkt) | Für **Breite ja**; **aber** verifizierter **echter Direktfeed** (`…/pressemitteilungen.rss`) → **Beleg-Qualität** |
| `rp-linksfraktion` (Fraktions-RSS) | **seine Fraktion** | `fraction-linke` deckt *Erwähnungen* (journalistisch), **nicht** die *amtlichen Pressemitteilungen* der eigenen Fraktion | Für **Breite ja**; **aber** verifizierter **echter Direktfeed** (`dielinkebt.de/…/feed.rss`) = eigene Fraktions-Primärstimme → **Beleg-Qualität** |

**Ehrliches Fazit der Nachprüfung — zwei getrennte Fragen:**

1. **Breite/Abdeckung:** Alle 6 sind für den Piloten **verzichtbar**. Cems Ausschuss (700),
   Partei/Fraktion (101) und der Bundestag (499) sind über funktionierende Wege dicht
   gedeckt; die A&S-Themenmatrix übertrifft die einzelne defekte Ausschuss-Seite sogar.
   Es entsteht **keine Themenlücke**, wenn die 6 fehlen.
2. **Beleg-Qualität:** **2 der 6 sind nicht gleichwertig ersetzt** — `rp-bundestag` und
   `rp-linksfraktion`. Beide haben **verifizierte echte Direktfeeds** (kein googlenews-Umweg)
   und liefern *official_primary*-Belege für das Parlament bzw. die **eigene Fraktion** des
   Piloten; die Proxys liefern nur journalistische/aggregierte Belege. Die anderen 4 werden
   ohnehin nur zu googlenews repariert und sind faktisch redundant.

**→ Empfehlung:** Die Schwellen-/Zähl-Korrektur ist unabhängig davon vollständig richtig
(kein Breiten-Gap). Für die **Beleg-Qualität** sollten — founder-gated, als eigener
Prod-Write + Code-Change — **priorisiert `rp-bundestag` und `rp-linksfraktion`** (echte
Direktfeeds) repariert werden; die übrigen 4 sind optional/redundant. Das ist eine
**Qualitäts-**, keine **Abdeckungsmaßnahme** — der Pilot ist ohne sie ausreichend versorgt.

---

## Behebung (dieser Branch, rein Code — kein Prod-Write, keine Migration, kein Flag)

1. **Neues Modul `lib/helmut/source-coverage.js`** — zentrale, reine Schwellen-/Zähllogik
   mit dokumentierter Kalibrierung (Defaults **120/120/110**, ENV-überschreibbar).
   Begründung: gesunder Ist-Crawl ~145; Floors bei ~80 % → bestehen den Normalbetrieb,
   schlagen aber bei echtem Einbruch an (Neutralbasis ~54, Plan-Ladefehler → Fallback,
   Massenausfall). Nicht auf Grün getrimmt — 145 hat >20 % Luft nach unten.
2. **`server.js`** — Schwellen aus dem Modul; „Quellenbasis" zählt via
   `effectiveActiveSourceCount` die **relationale** aktive Basis (`crawl.checkedSources`)
   statt des toten Blobs; ehrliches Label je Zählquelle (`relationaler Plan` vs.
   `Katalog-Basis`); `releaseCheck` misst die Crawl-Breite ohne Blob-Fallback.
3. **`lib/helmut/watchdog-state.js`** — `DEFAULT_THRESHOLDS` 450/405 → 120/110 (Server
   übersteuert ohnehin mit denselben Werten; Konsistenz für Modul-/Test-Nutzung).
4. **`scripts/smoke-test.js`** — Default 450 → 120.
5. **Tests:** neues `scripts/source-coverage-test.js` (33 Assertions: Kalibrierung,
   Einbruch-Erkennung, Zähl-Bug-Fix, ENV-Override, **Grenzwerte 120/110**,
   **Watchdog-Sync**, **echter Aufrufort** `__backendHealth`/`__pilotReadiness` inkl.
   mode on/off) + zwei Watchdog-Fälle (145/145 → fresh; 40 → warn).
6. **Zwei datum-abhängige Alt-Tests sauber deterministisch gemacht** (auftragsgemäß):
   `stoerungswahrheit` (Frische-Quelle = jetzt statt lokaler 08:30-Teile) und
   `helmut-tab-ui` (feste Mittags-Referenz statt Wall-Clock). Ursache war der
   Europe/Berlin-Tages-Frische-Guard des **Produktcodes** (korrekt) gegen now-relative
   Fixtures, die kurz nach Berlin-Mitternacht auf den Vortag kippten. **Volle Offline-Suite
   jetzt 98/98 grün.**

**Wirkung:** Der gesunde 145-Quellen-Crawl besteht jetzt Backend-Health („Quellenbasis"),
Crawl-Qualität, pilotReadiness, Release-Check und Watchdog-INGEST — ohne eine einzige
zusätzliche Quelle. Ein echter Einbruch (Paket-Deaktivierung, Massenausfall) schlägt weiter
an.

## Gegenprüfung (adversariale Review, 2026-07-15)

Der Fix wurde durch eine mehrperspektivische adversariale Review (Korrektheit ·
übersehene Konsumenten · Masking-Risiko · Test-/Doku-Güte) geprüft. **Masking-Verdikt:**
die Kalibrierung **verdeckt keinen Quellen-Kollaps**; die Floors (120/110 ≈ 82 %/76 % des
verifiziert gesunden 145) sind belastbar platziert — *jeder* durchgespielte Einbruch löst
aus. Behandelte Befunde:

- **Behoben:** irreführendes `(relationaler Plan)`-Label im mode off/shadow → jetzt
  mode-ehrlich; `releaseCheck`-Blob-Fallback entfernt; **Aufrufort-Test** ergänzt (fängt
  Regress an der Schwelle *oder* an der Zählquelle direkt in `server.js`); Grenzwert- und
  Watchdog-Sync-Tests ergänzt.
- **Bewusst so gelassen (dokumentiert, außerhalb dieses Auftrags):**
  - *Content-leere Degradation* (ein erreichbarer Weg mit 0 Artikeln zählt als „erfolgreich"):
    vorbestehende Crawl-Semantik, keine Schwellen-Frage.
  - *Live-Ausfall < 10 %* schlägt nicht an: gewollte Toleranz; echter Massenausfall (z. B.
    Google-News-Decoder bricht → alle ~135 Wege fehlerhaft) hebt `failureRatio`/senkt
    `successfulSources` und schlägt sicher an.
  - *Dünne-alleine paged nicht* (frisch-aber-dünn → INGEST „warn" → TEILWEISE, kein
    WhatsApp-Alarm): vorbestehendes Zwei-Achsen-Design; die Änderung **verbessert** es
    (vorher war 450 nie erfüllbar → Dauer-„warn"/keine Trennschärfe).
  - *Relationaler-Plan-Ladefehler* fällt still auf den Alt-Katalog (~149) zurück (nur
    `console.warn`): bewusste Resilienz für den laufenden Piloten.
  - *Drei Prüfungen korrelieren jetzt* (Quellenbasis ≈ Crawl-Qualität ≈ „zu wenige"):
    akzeptierter Trade-off — die frühere „unabhängige" Blob-Zahl war tot/aussagelos.

## Nächste Schritte (founder-gated, NICHT in diesem Branch)

- **Direktfeed-Reparaturen anwenden — priorisiert `rp-bundestag` + `rp-linksfraktion`**
  (echte Direktfeeds, Primär-Beleg-Qualität; s. „Kritische Nachprüfung"). Die übrigen 4
  reparieren nur zu googlenews und sind redundant. Anwendung = Prod-Write auf
  `retrieval_paths` **plus** Legacy-Katalog/`toCrawlerSource`-Abstimmung, damit die
  verifizierten URLs (9B, `bundeswege-reparaturen.js`) real greifen. Reine **Qualitäts-**,
  keine Abdeckungsmaßnahme — der Pilot ist ohne sie ausreichend versorgt.
- Optional: die Schwellen per Vercel-ENV feiner justieren (nicht nötig — Default greift).
