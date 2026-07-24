# Fachreview — Quellenpaket `wohnen-bauen-stadtentwicklung-bund` (WBSB)

**Ziel:** erstes **produktionsreifes Referenzpaket**. Alle weiteren Quellenpakete werden nach
diesem Muster aufgebaut.
**Ebene:** Bund · **Geography:** Deutschland · **Status:** `prepared` (technisch **INAKTIV** —
alle Wege `needs_review` / `manual`, `is_critical=false`).
**Stand:** 2026-07-24 · **Reviewtyp:** rein fachlich (kein Workflow-/Registry-/Generator-Umbau).
**Basis:** `main` nach dem Merge von PR #117 (Quellenarchitektur technisch abgeschlossen).

> Dieses Review betrifft ausschließlich die **fachliche Qualität** dieses einen Pakets. Die
> technische Quellenarchitektur (Registry, Generatoren, Testarchitektur) bleibt unverändert;
> geändert wurden nur die **Paketdaten** und zwei davon **zwingend** abhängige Paket-Assertions.

---

## 0. Verifikationsrealität & echter Prüflauf (ehrlich, vorab)

Die Agent-Sandbox blockt ausgehenden Egress per Organisations-Policy (`curl`/`WebFetch` → `403`
für alle `.bund.de`/`.de`-Hosts); nur `WebSearch` ist verfügbar. Reale HTTP-Verifikation läuft
daher — wie im Vorsprint — **auf einem GitHub-Actions-Runner mit offenem Egress**
(`wohnen-bauen-stadtentwicklung-verify.yml` → `scripts/wohnen-bauen-stadtentwicklung-verify.js`).

**Für dieses Review wurde ein ECHTER Prüflauf ausgelöst und ausgewertet:**
Actions-Run **`30097099429`** (Branch `claude/quellenpaket-fachqualitaet-j1fwfz`, 2026-07-24),
Egress **OFFEN** (Kontrolle: `example.com=200`, `google.com=200`). 30 Kandidaten, davon
**20 „geeignet mit Einschränkung" (alle HTTP 200) · 5 „ablehnen" · 5 „nicht_verifizierbar"**.

Dieser Lauf hat die reine WebSearch-Recherche **korrigiert** (Ehrlichkeitsprinzip: kein
erfundenes Urteil, keine erfundene URL):

| Kandidat | WebSearch-Annahme | ECHTES Runner-Urteil | Konsequenz |
|---|---|---|---|
| BBSR `…/presse/presseinformationen/` | live | **HTTP 200 ✅** | → **Pflichtkern** (BBSR-Lücke geschlossen) |
| BBSR `…/veroeffentlichungen/` | live | **HTTP 200 ✅** | verifizierte Alternative |
| BBSR `…/Aktuell/aktuell.html` | live | **HTTP 404 ✘** | verworfen (Adresse instabil) |
| BBSR RSS-Hub | Feed vorh. | **HTTP 404 ✘** | Feed erst aus Prod-Infra |
| Destatis GENESIS REST-Basis | strukturierte API | **HTTP 404** (GET; Redirect) | **nicht** Pflichtkern — POST+Token nötig |
| `gii-toc.xml` (gesetze-im-internet) | XML-Index | **Timeout 12 s** | **nicht** Pflichtkern — Host aus CI unerreichbar |
| BMWSB-RSS-Hub / BGBl-RSS-Hub | RSS | **HTML** (kein Feed) | Feed-Deep-Link offen |
| 11 gewählte HTML-Wege | erreichbar | **alle HTTP 200 ✅** | Pflichtkern bestätigt |

**Kernbefund:** Von den strukturierten Kandidaten (RSS-Feeds, GENESIS-API, gii-toc.xml) ist
**derzeit keiner aus unserer/CI-Infrastruktur nutzbar/verifizierbar**. Ein „produktionsreifes"
Paket darf keine unverifizierten 404/Timeout-Wege als Kern führen — deshalb enthält der
Pflichtkern **ausschließlich real (HTTP 200) verifizierte** Wege, und die strukturierte
Migration ist als **oberster Aktivierungs-Task** dokumentiert (§3/§10), nicht vorgetäuscht.

---

## 1. Vollständige Fachanalyse je Quelle (§1)

Legende: ✔ ja · ✘ nein · ~ eingeschränkt. „Feed nutzbar?" = maschinenlesbarer Feed **real
verifiziert** (nicht nur „existiert laut Doku").

### 1a. Analyse-Matrix (14 Prüffragen) — die 11 Pflichtkern-Wege

| # | Quelle (Domain) | off. Herausg. | Bund | thematisch | erreichb. (Run) | RSS nutzbar | Atom | JSON/API nutzbar | Sitemap | HTML nötig | robots-ok | Aktualis. | Qualität | Dublette | bessere Alt. |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|--|--|--|--|
| 1 | BMWSB Presse (bmwsb.bund.de) | ✔ | ✔ | ✔ hoch | ✔ 200 | ✘ (Hub=HTML) | ✘ | ✘ | ✔ | ✔ | ✔ | laufend | hoch | nein | RSS (Ziel, offen) |
| 2 | BMWSB Wohnraumförd. | ✔ | ✔ | ✔ | ✔ 200 | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | period. | mittel | ~ Förderdb | — |
| 3 | BBSR Presseinfo (bbsr.bund.de) | ✔ | ✔ | ✔ hoch | ✔ 200 | ✘ (Hub=404) | ✘ | ✘ | ✔ | ✔ | ✔ | laufend | hoch | nein | RSS/IDW (Ziel) |
| 4 | BBR Presse (bbr.bund.de) | ✔ | ✔ | ✔ | ✔ 200 | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | laufend | mittel | ~ BBSR-Fam. | RSS (Ziel) |
| 5 | Destatis Bautätigkeit | ✔ | ✔ | ✔ | ✔ 200 | ✘ | ✘ | ~ GENESIS(404 GET) | ✔ | ✔ | ✔ | period. | hoch(Daten) | nein | GENESIS(Token) |
| 6 | Destatis Baupreisindex | ✔ | ✔ | ✔ | ✔ 200 | ✘ | ✘ | ~ GENESIS | ✔ | ✔ | ✔ | period. | hoch(Daten) | nein | GENESIS(Token) |
| 7 | Destatis Wohnen/Mieten | ✔ | ✔ | ✔ | ✔ 200 | ✘ | ✘ | ~ GENESIS | ✔ | ✔ | ✔ | period. | hoch(Daten) | nein | GENESIS(Token) |
| 8 | Destatis Wohngeld | ✔ | ✔ | ✔ | ✔ 200 | ✘ | ✘ | ~ GENESIS | ✔ | ✔ | ✔ | period. | hoch(Daten) | nein | GENESIS(Token) |
| 9 | Bundesgesetzblatt Teil I | ✔ | ✔ | ✔ hoch | ✔ 200 | ✘ (Hub=HTML) | ✘ | ~ ELI/geplant | ✔ | ✔ | ✔ | laufend | hoch | nein | RSS Teil I (Ziel) |
| 10 | Städtebauförderung | ✔ | ✔ | ✔ | ✔ 200 | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | laufend | mittel | ~ BMWSB-Stadt | RSS (prüfen) |
| 11 | Förderdatenbank (BMWSB) | ✔ | ✔ | ✔ | ✔ 200 | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | period. | mittel | ~ BMWSB-Förd | — |

Alle 11: offizieller Bund-Herausgeber, thematisch passend, **real HTTP 200**, `robots`-konform
(GSB-Sitemaps vorhanden; Content-Pfade i. d. R. erlaubt — je Weg vor Aktivierung final prüfen),
HTML-Scrape nötig (kein verifizierter Feed), **kein** RSS/Atom real nutzbar.

### 1b. Fachliche Einzelbewertung (Kurzform)
1. **BMWSB Presse** — zuständiges Ressort, politische Erstquelle. **Kernquelle.**
2. **BMWSB Wohnraumförderung** — Ressort-Förderliste; überschneidet Förderdatenbank → optional.
3. **BBSR Presseinformationen** — zentrale Ressortforschung (Wohnungs-/Immobilienmärkte, Stadt-/
   Raumforschung). **Vom Auditor vermisst → ergänzt** (verifizierte URL, nicht die 404-Aktuell-Seite).
4. **BBR Presse** — Bundesbau/Raumordnung; Behördenfamilie mit BBSR, Rollen getrennt.
5.–8. **Destatis Bautätigkeit / Baupreisindex / Wohnen-Mieten / Wohngeld** — je ein **distinkter**
   Auftrags-Bereich (Bautätigkeit · Baukosten · Wohnungsmarkt · Wohngeld). Daten-Grounding, keine News.
9. **Bundesgesetzblatt Teil I** — alleinige amtliche Verkündungsquelle seit 2023. **Kernquelle.**
10. **Städtebauförderung** — Bund-Länder-Programmportal.
11. **Förderdatenbank (BMWSB)** — neutrale Vollsicht der Bundes-Förderprogramme.

---

## 2. BBSR-Integration (§2)

**Befund:** BBSR fehlte im Erst-Pflichtkern (Erst-URLs 404). Der Auditor vermisste es ausdrücklich.

**Ergebnis der echten Verifikation (Run 30097099429):**

| BBSR-Adresse | Urteil |
|---|---|
| `…/BBSR/DE/presse/presseinformationen/_node.html` | **HTTP 200 → aufgenommen** |
| `…/BBSR/DE/veroeffentlichungen/_node.html` | HTTP 200 (verifizierte Alternative) |
| `…/BBSR/DE/Aktuell/aktuell.html` | **HTTP 404 → verworfen** |
| `…/BBSR/DE/Service/RSS/rssnewsfeed_node.html` (RSS-Hub) | HTTP 404 |

**Umsetzung:** `rp-wbsb-bbsr-presseinformationen` (Herausgeber `bbsr.bund.de`, neue Entität
`authority-bbsr`), Priorität **A**, `needs_review`/`manual` (INAKTIV). **Zielmethode RSS** (GSB-
Feed bzw. IDW-Feed `idw-online.de/de/institution957`) dokumentiert; die konkrete Feed-URL ist —
weil der RSS-Hub 404 lieferte — aus Produktions-Infra aufzulösen (Aktivierungs-Task).

---

## 3. HTML-Reduktion (§3) — ehrliches Ergebnis

Für **jede** Quelle wurde eine strukturierte Alternative gesucht **und real geprüft**. Ergebnis:

| Struktur-Kandidat | Prüfung (Run 30097099429) | Verwendbar? |
|---|---|---|
| BMWSB-RSS-Hub | HTTP 200, aber **text/html** (kein Feed) | ✘ Deep-Link offen |
| BGBl-RSS-Hub | HTTP 200, aber **text/html** | ✘ Deep-Link offen |
| BBSR-RSS-Hub | **HTTP 404** | ✘ |
| Destatis GENESIS REST-Basis | **HTTP 404** (GET; braucht POST+Methode+Token) | ✘ (keyfrei) |
| gii-toc.xml (gesetze-im-internet) | **Timeout 12 s** (Host aus CI unerreichbar) | ✘ |

**Folgerung:** Die strukturierten Feeds/APIs **existieren** (GSB-`/SiteGlobals/Functions/RSSFeed/…`
ist an anderen Bundesbehörden belegt; recht.bund.de nennt 3 BGBl-Feeds; GENESIS ist dokumentiert),
aber **keiner ist derzeit aus unserer Infrastruktur nutzbar/verifizierbar**. Deshalb bleiben alle
11 Pflichtkern-Wege **HTML — aus verifizierter Notwendigkeit**, nicht aus Bequemlichkeit.

**Tatsächlich reduziert wurde HTML dort, wo eine echte Dublette existiert:**
`bundestag-bauausschuss` (HTML) **entfernt** → parlamentarische Vorgänge laufen strukturiert über
die **bestehende DIP-API** (`rp-dip`, always_on, bund-basis). Das ist die einzige ehrliche
HTML-Reduktion; alle übrigen HTML-Wege bleiben **bewusst** bestehen (§10 Q5).

**Die strukturierte Migration ist damit der oberste Aktivierungs-Task** (nicht ein vorgetäuschter
Fortschritt): GSB-Feed-Deep-Links aus den Hub-Seiten extrahieren, BGBl-Teil-I-Feed-URL auflösen,
GENESIS-Token bereitstellen, gii-toc aus Prod-Infra prüfen.

---

## 4. Freshness (§4)

Bewertung = Eignung als **News-Frühwarnung für politische Lageberichte**.

| Freshness | Quellen | Begründung |
|---|---|---|
| **hoch** | BMWSB-Presse, BBSR-Presseinfo, Bundesgesetzblatt Teil I, (Parlament via **rp-dip**) | laufende, politisch unmittelbare Meldungen/Verkündungen/Vorgänge |
| **mittel** | BBR-Presse, Städtebauförderung, BMWSB-Wohnraumförderung, Förderdatenbank | ereignisgetrieben, aber seltener/programmatisch |
| **niedrig** | Destatis Bautätigkeit, Baupreisindex, Wohnen/Mieten, Wohngeld | periodische Statistik |

**Für politische Lageberichte als NEWS ungeeignet** (nur Daten-Grounding/Faktenbeleg, **nicht** als
Lagebericht-Auslöser): die **vier Destatis-Statistiken**. Sie liefern Zahlen zur Untermauerung,
keine tagesaktuelle Lage — im Seed über `update_character: periodisch` + `ziel_hinweis`
(Daten-Grounding) markiert.

---

## 5. Dubletten & Überschneidungen (§5)

| Überschneidung | Bewertung | Maßnahme |
|---|---|---|
| **Bauausschuss-HTML** ⟂ **DIP-API** (`rp-dip`, Bestand) ⟂ **committee-bau-wohnen** (Google-News, Bestand) | parlamentarische Vorgänge **dreifach** gedeckt | **Bauausschuss-HTML entfernt** → DIP-API |
| **BMWSB-Wohnraumförderung** ⟂ **Förderdatenbank (BMWSB)** | Ressortsicht vs. neutrale Vollsicht | beide behalten, Förderdatenbank priorisiert; BMWSB-Förd. → C |
| **BBR-Presse** ⟂ **BBSR** | gleiche Behördenfamilie (BBSR im BBR) | beide behalten, Rollen getrennt (BBR=Bundesbau/Raumordnung, BBSR=Forschung) |
| **4× Destatis** untereinander | je **distinkter** Auftrags-Bereich (Bautätigkeit/Baukosten/Markt/Wohngeld) | **keine** Dublette — alle 4 behalten; GENESIS-API als Konsolidierungs-**Upgrade** dokumentiert |

Kein Ministerium-/Behörden-Spiegel und kein identischer Newsfeed doppelt aufgenommen.

---

## 6. Priorisierung (§6)

| Prio | Quelle | Begründung |
|---|---|---|
| **A** | BMWSB-Presse | zuständiges Ressort, politische Erstquelle |
| **A** | BBSR-Presseinformationen | zentrale Ressortforschung, Frühindikator (Auditor-Lücke) |
| **A** | Bundesgesetzblatt Teil I | amtliche Baugesetzgebung, alleinige Verkündungsquelle |
| **A** | (Parlament via `rp-dip`, Bestand) | Ausschuss-Vorgänge/Drucksachen strukturiert (kein neuer Weg) |
| **B** | BBR-Presse | Bundesbau/Raumordnung |
| **B** | Destatis Bautätigkeit | Kernindikator Wohnungsbau |
| **B** | Destatis Wohnen/Mieten | Mietdaten (mietpolitische Bewertung) |
| **B** | Destatis Baupreisindex | Baukosten |
| **B** | Städtebauförderung | Stadtentwicklungs-/Programmnachrichten |
| **C** | Destatis Wohngeld | Wohngeld-Statistik (Sekundärindikator) |
| **C** | BMWSB-Wohnraumförderung | Ressort-Förderliste (überschneidet Förderdatenbank) |
| **C** | Förderdatenbank (BMWSB) | Förderprogramm-Referenz |

---

## 7. Retrieval-Empfehlungen (§7)

Gültig für die **Aktivierung** (aktuell inaktiv). Alle Wege heute `html`; `ziel` = strukturierte
Zielmethode (Aktivierungs-Task).

| Quelle | Methode heute / Ziel | Frequenz | Priorität | Retry | Timeout |
|---|---|---|---|---|---|
| BMWSB-Presse | html / rss | 2×/Tag | A | 3× exp. Backoff | 12 s |
| BBSR-Presseinformationen | html / rss(IDW) | 1×/Tag | A | 3× | 12 s |
| Bundesgesetzblatt Teil I | html / rss(Teil I) | 4×/Tag | A | 3× | 15 s |
| BBR-Presse | html / rss | 1×/Tag | B | 2× | 12 s |
| Destatis Bautätigkeit | html / api(GENESIS) | 1×/Woche | B | 2× | 15 s |
| Destatis Wohnen/Mieten | html / api | 1×/Woche | B | 2× | 15 s |
| Destatis Baupreisindex | html / api | 1×/Woche | B | 2× | 15 s |
| Städtebauförderung | html / rss(prüfen) | 1×/Tag | B | 2× | 12 s |
| Destatis Wohngeld | html / api | 2×/Monat | C | 2× | 15 s |
| BMWSB-Wohnraumförderung | html | 2×/Woche | C | 2× | 12 s |
| Förderdatenbank (BMWSB) | html | 1×/Woche | C | 2× | 15 s |

Allgemein (GSB/bund.de): realistischer Browser-User-Agent (keine Umgehung), TLS an, bei
`403/429` **kein Bypass**, sondern serverseitiger Abruf + Backoff; `robots.txt` je Weg vor
Aktivierung final prüfen.

---

## 8. Änderungen / Ergänzungen / Löschungen & Referenzarchitektur (§8)

### Ergänzungen (neu, real verifiziert)
- **BBSR** (`rp-wbsb-bbsr-presseinformationen`, Publisher `bbsr.bund.de`, Entität `authority-bbsr`)
  — Priorität A, **HTTP 200 verifiziert**.

### Änderungen (bestehende Wege)
- Verifikation aller Wege auf das **echte** Runner-Urteil (Run 30097099429, HTTP 200) gesetzt.
- **Zielmethode `rss`** dokumentiert (BMWSB-Presse, BBSR, Bundesgesetzblatt Teil I, Städtebauförd.).
- Prioritäten neu (A/B/C, §6); Destatis-Statistik als Daten-Grounding gekennzeichnet.

### Löschungen (Dedup)
- **`bundestag-bauausschuss` (HTML) entfernt** → DIP-API (`rp-dip`, Bestand) deckt es strukturiert.

### NICHT aufgenommen (real geprüft, als Upgrade dokumentiert)
- **Destatis GENESIS REST-API** — Basis-GET 404; braucht POST+Methode+Token → Aktivierungs-Upgrade.
- **gii-toc.xml** — Host aus CI im Timeout → nur aus Prod-Infra prüfbar.
- **RSS-Hubs** (BMWSB/BBSR/BGBl) — liefern HTML/404 → Feed-Deep-Link-Auflösung als Aktivierungs-Task.

### Endgültige Referenzarchitektur (11 Wege, alle HTTP 200, INAKTIV)

```
pkg-wohnen-bauen-stadtentwicklung-bund  (prepared, Bund, Fachthema, is_base=false)
├─ A  rp-wbsb-bmwsb-presse              bmwsb.bund.de            html → Ziel rss
├─ A  rp-wbsb-bbsr-presseinformationen  bbsr.bund.de   [NEU]     html → Ziel rss/IDW
├─ A  rp-wbsb-bgbl-teil1-liste          recht.bund.de            html → Ziel rss (Teil I)
├─ B  rp-wbsb-bbr-presse                bbr.bund.de              html → Ziel rss
├─ B  rp-wbsb-destatis-bautaetigkeit    destatis.de              html → Ziel GENESIS
├─ B  rp-wbsb-destatis-baupreisindex    destatis.de              html → Ziel GENESIS
├─ B  rp-wbsb-destatis-wohnen-mieten    destatis.de              html → Ziel GENESIS
├─ B  rp-wbsb-staedtebaufoerderung-start staedtebaufoerderung.info html → Ziel rss
├─ C  rp-wbsb-destatis-wohngeld         destatis.de              html → Ziel GENESIS
├─ C  rp-wbsb-bmwsb-foerderung-wohnen   bmwsb.bund.de            html
└─ C  rp-wbsb-foerderdatenbank-bmwsb    foerderdatenbank.de      html

Parlament: KEIN eigener Weg — Abdeckung über rp-dip (DIP-API, always_on, bund-basis).
Herausgeber: 6 neu (bmwsb/bbsr/bbr/recht.bund.de/staedtebaufoerderung/foerderdatenbank)
             + 1 wiederverwendet (destatis.de).  Entität neu: authority-bbsr.
Sicherheit:  alle Wege needs_review + manual, is_critical=false → isPathActive()=false.
Methodenmix: 11× html (strukturierte Ziele dokumentiert, s. o.).
```

---

## 9. Umsetzung & Offline-Nachweis (§9)

Geänderte Dateien (nur dieses Paket + zwei zwingend abhängige Paket-Assertions):

- `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung.js` — Pflichtkern neu
  (BBSR ergänzt, Bauausschuss entfernt), per-Weg `method`/`parser`/`ziel_methode`, echte `verifikation`.
- `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung-kandidaten.js` — reale
  Runner-Ergebnisse dokumentiert (BBSR-URL-Korrektur, GENESIS/gii-toc als Upgrade).
- `lib/helmut/quellenarchitektur/seeds/entities.js` — Entität `authority-bbsr`.
- `scripts/source-architecture-test.js` — Paket-Assertions (neue Herausgeber/Entität).
- `supabase/seeds/20260713_source_architecture_seed.sql` — deterministisch **regeneriert**.

**Offline-Suite:** `143/143 Suiten grün`. Kern-WBSB-Suiten: source-architecture **106**,
quellenpaket-workflow **30**, quellenpaket-negativ **35**, wbsb-verify **14**, admin-report **54**,
sprint6 **46**, landesmodul **18** — alle **0 FAIL**.
**Online-Verifikation:** Actions-Run `30097099429` (offener Egress) — alle 11 Pflichtkern-Wege HTTP 200.

Registry/Generatoren/Testarchitektur **unverändert** (die Registry leitet Zählungen aus dem
Paket-Seed ab; nur zwei Paket-Assertions in `source-architecture-test.js` wurden zwingend nachgezogen).

---

## 10. Offene Risiken (für den Auditor)

1. **Strukturierte Migration offen (oberster Aktivierungs-Task):** RSS-Feed-Deep-Links
   (BMWSB/BBSR/BGBl/Städtebauförd.), GENESIS-Token+Endpoint, gii-toc aus Prod-Infra — **real**
   nicht aus CI/Sandbox auflösbar (Run 30097099429: Hubs=HTML, GENESIS-Basis=404, gii-toc=Timeout).
2. **Alle 11 Kernwege sind HTML-Scrapes:** DOM-Selektoren fragil; je Weg vor Aktivierung
   Item-Extraktion + Freshness absichern (HTML liefert kein maschinelles Item-Datum).
3. **BBSR-Adress-Instabilität:** `/Aktuell/aktuell.html` = 404, `/presse/presseinformationen/` = 200;
   GSB-Case/Umzüge vor Aktivierung re-verifizieren.
4. **BBR-Presse finale URL = Suchformular:** Ergebnis-Parsing absichern.
5. **Bot-Sperren (403/429)** bei echten Crawls auf bund.de-GSB — realistischer UA, kein Bypass.
6. **Kein maschineller Feed im Kern:** bis zur Feed-Auflösung keine ereignisgenaue Frühwarnung
   (HTML-Poll-Intervalle gemäß §7).

---

## 11. Referenz-Muster für weitere Quellenpakete

Dieses Paket etabliert den wiederverwendbaren, **ehrlichen** Ablauf:
**(1)** Kandidaten-Superset per WebSearch (nur reale URLs) → `…-kandidaten.js`;
**(2)** **echter** Runner-Prüflauf (offener Egress) VOR der finalen Auswahl — WebSearch-Annahmen
werden dort widerlegt/bestätigt; **(3)** in den Pflichtkern nur **real verifizierte** Wege;
strukturierte Ziele (RSS/API) mit belegter Existenz, aber Auflösung als Aktivierungs-Task;
**(4)** Dedup gegen Bestand (DIP/Google-News/andere Pakete); **(5)** Priorisierung A/B/C +
Retrieval-Profil; **(6)** Paket bleibt `prepared`/INAKTIV bis zum freigabepflichtigen
Aktivierungs-Gate; **(7)** Offline-Suite grün + deterministische Seed-Regeneration.

> **Lehre aus diesem Piloten:** WebSearch findet Kandidaten, entscheidet aber **nicht**. Erst der
> echte HTTP-Lauf trennt „existiert laut Doku" von „real nutzbar". Genau diese Trennung macht das
> Paket referenzfähig.
