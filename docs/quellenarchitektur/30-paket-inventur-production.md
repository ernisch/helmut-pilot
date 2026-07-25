# Paket-Inventur Production — Quellenpakete und automatische Paketzuweisung

**Erhebung:** 2026-07-25, **rein lesend** gegen die Production-Datenbank (Supabase-Projekt
`ddckuvvpcytqbyfmbvie`) · **Code-Stand:** `main` `54fe370` (Merge #122) · **Quellenmodus:**
`HELMUT_SOURCE_MODE=on` (relationale DB ist die aktive Quellenwahrheit)

> **Zweck.** Diese Datei ist die kanonische Antwort auf „welche Quellenpakete gibt es
> wirklich, was liefern sie, und bekommt ein neues Profil automatisch die richtigen?"
> Sie erfüllt Punkt **18** (Production-Inventur) und Punkt **12** (Paketzuweisung
> beweisen) aus [`../roadmap/phase_1_checkliste.md`](../roadmap/phase_1_checkliste.md).
>
> **Es wurde nichts verändert.** Keine Migration, keine Aktivierung, keine
> Production-Datenänderung, keine Flag-/Cron-/Secret-Änderung.

---

## 1 · Was „vorhanden" jeweils bedeutet

Die Inventur unterscheidet strikt — eine Zeile in einer Tabelle ist **kein** Beweis für
Versorgung:

| Stufe | Bedeutung | Prüfung |
|---|---|---|
| **technisch angelegt** | Paketdefinition existiert im Code-Seed | `seeds/packages.js` |
| **auf `main`** | im gemergten Stand, nicht nur auf einem Branch | `git`, `buildFullModel()` |
| **in Production** | Zeile in `source_packages` | SQL (§2) |
| **aktiviert** | Paket `active` **und** von ≥1 aktivem Profil referenziert | `computeGlobalActivation` (§5) |
| **liefert echte Daten** | Abrufwege des Pakets liefern `status='ok'` mit Dokumenten | `source_crawl_telemetry` (§3) |
| **fachlich vollständig** | alle `required_classes` des Pakets besetzt | §4 |
| **durch Tests belegt** | automatisierte Offline-Suite | `scripts/paketzuweisung-nachweis-test.js` (§6) |

## 2 · Bestand: 7 Pakete in Production

Gesamtbestand der relationalen Quellenwahrheit: **7 Pakete · 163 Abrufwege · 165
Paket-Zuordnungen · 64 Herausgeber · 73 politische Entitäten · 50 Geografien.**

| Paket | Zweck (Kurzform) | Ebene | Region | Status | Herkunft |
|---|---|---|---|---|---|
| `bund-basis` | neutrale bundespolitische Grundversorgung für **jedes** Mandat | bund | `geo-bund` | `active`, `is_base` | Code-Seed |
| `arbeit-und-soziales` | Fachthemenpaket Arbeits-/Sozialpolitik | bund | `geo-bund` | `active` | Code-Seed |
| `die-linke-bund` | Partei-Direktquellen Die Linke (Bund) | bund | `geo-bund` | `active` | Code-Seed |
| `regional-niedersachsen` | regionale Beobachtung Niedersachsen | land | `geo-land-niedersachsen` | `active` | Code-Seed |
| `berlin-basis` | Landespaket Berlin | land | `geo-land-berlin` | `prepared`, `is_base` | Code-Seed (Struktur) + Landesmodul-Seed (Wege) |
| `brandenburg-basis` | Landespaket Brandenburg | land | `geo-land-brandenburg` | `prepared`, `is_base` | Code-Seed (Struktur) + Landesmodul-Seed (Wege) |
| `profil-<pilot-mandats-id>` | personenbezogene Nachrichtensuche **eines** Mandats | bund | — | `active` | **nur DB** (Provisionierung), bewusst nicht im Code-Seed |

**Abrufwege je Paket** (`package_paths` → `retrieval_paths`):

| Paket | zugeordnet | aktiv¹ | vorbereitet² | deaktiviert³ | `always_on` |
|---|---|---|---|---|---|
| `bund-basis` | 54 | 51 | 0 | 2 (+1 DIP separat) | 5 (davon 2 defekt) |
| `arbeit-und-soziales` | 84 | 82 | 0 | 2 | 0 |
| `die-linke-bund` | 3 | 1 | 0 | 2 | 0 |
| `regional-niedersachsen` | 4 | 4 | 0 | 0 | 0 |
| `profil-<pilot-mandats-id>` | 1 | 1 (liefert aber nichts, §3) | 0 | 0 | 0 |
| `berlin-basis` | 10 | 0 | 10 | 0 | 0 |
| `brandenburg-basis` | 9 | 0 | 9 | 0 | 0 |

¹ *aktiv* = im letzten vollständigen Production-Crawl tatsächlich abgerufen ·
² *vorbereitet* = `activation_mode='manual'` in einem `prepared`-Paket, wird nie
automatisch abgerufen · ³ *deaktiviert* = `status='broken'`, wird bewusst nicht abgerufen.

Gesamtverteilung der 163 Abrufwege: **5 `always_on`** (2 davon `broken`) · **140 `auto`**
(4 davon `broken`) · **18 `manual`** (alle Landesmodul-Wege; ein Weg hängt in beiden
Landespaketen → 19 Zuordnungen) · **0 `dev_only`**.

## 3 · Ertrag und letzte Lieferung

Grundlage: die **5 letzten vollständigen Crawl-Läufe** (20.–25.07.2026) aus
`source_crawl_telemetry`. Die Spalten `retrieval_paths.last_success_at`, `.last_error`
und `.error_streak` sind in Production **zu 0 von 163 befüllt** — die Pfad-Statusmaschine
schreibt nicht zurück; Lieferwahrheit gibt es ausschließlich aus der Telemetrie.

| Paket | Wege mit Telemetrie | davon `ok` | gefunden | neu | letzte erfolgreiche Lieferung | bekannte Fehler |
|---|---|---|---|---|---|---|
| `bund-basis` | 51 / 54 | 51 | 3 800 | 2 356 | 2026-07-25 07:31 UTC | 2 `broken` Kernwege werden nie abgerufen |
| `arbeit-und-soziales` | 82 / 84 | 82 | 4 052 | 1 604 | 2026-07-25 07:31 UTC | 2 `broken` Wege |
| `die-linke-bund` | 1 / 3 | 1 | 80 | 60 | 2026-07-25 07:31 UTC | 2 von 3 Wegen `broken` (Direktfeeds) |
| `regional-niedersachsen` | 4 / 4 | 4 | 160 | 8 | 2026-07-25 07:31 UTC | sehr geringe Neu-Quote (8 auf 160) |
| `profil-<pilot-mandats-id>` | 1 / 1 | **0** | 0 | 0 | **nie** | 5 von 5 Läufen `empty` |
| `berlin-basis` | **0 / 10** | 0 | 0 | 0 | **nie** | — (bewusst nicht abgerufen) |
| `brandenburg-basis` | **0 / 9** | 0 | 0 | 0 | **nie** | — (bewusst nicht abgerufen) |

**Abgleich Modell ↔ echter Lauf (vollständig aufgelöst).** Der Resolver hält für die
6 aktiven Production-Profile **145 Abrufwege** für aktiv. Der letzte vollständige Crawl
(`crawl-20260725073113-yx61b`) hat **145 Quellen** abgerufen — die Zahlen sind gleich,
die Mengen nicht:

- 138 Katalogwege wurden wirklich abgerufen,
- **7 modell-aktive Wege liefen nicht:** die 6 `broken`-Wege (`bundestag`,
  `bundesregierung`, `die-linke`, `linksfraktion`, `ausschuss-arbeit-soziales`, `dgb` —
  bot-gesperrt, bewusst kein Abruf) plus `dip` (eigener DIP-API-Pfad, keine
  Crawl-Telemetrie),
- **7 profilgenerierte Personensuchen** liefen zusätzlich; sie sind Laufzeitobjekte aus
  dem Profil (`scheduler.personNewsSource`), keine Katalogzeilen.
- **0 Berlin-/Brandenburg-Wege im Lauf** — das harte Gate für BE/BB wirkt in Production.

## 4 · Fachliche Vollständigkeit

`bund-basis`, `arbeit-und-soziales`, `die-linke-bund` und `regional-niedersachsen` führen
**keine** `required_classes`; für sie existiert kein maschinell prüfbares
Vollständigkeitskriterium. „Fachlich vollständig" ist für diese vier Pakete **nicht
belegt und nicht widerlegt** — das bleibt Checklistenpunkt 13.

Die beiden Landespakete führen je **15 Pflichtklassen**. Abgeleitet aus der
Klassenkennung der zugeordneten Wege:

| Paket | Pflichtklassen | besetzt | fehlend |
|---|---|---|---|
| `berlin-basis` | 15 | **10** | `ausschuesse`, `drucksachen`, `schriftliche_anfragen`, `gesetzgebung`, `ministerien` |
| `brandenburg-basis` | 15 | **9** | `drucksachen`, `schriftliche_anfragen`, `gesetzgebung`, `staatskanzlei`, `fraktion_pilot`, `person_pilot` |

Der Admin-Report weist die Pflichtklassen heute ehrlich als `present: 0` aus, weil
Abrufwege **kein** Klassen-Tagging tragen; die Zahlen oben stammen aus der
Namenskonvention der Landesmodul-Wege und sind eine Hilfsableitung, keine Systemwahrheit.

## 5 · Zugeordnete Profile / Mandate

In Production existieren **8 Mandatsprofile, davon 6 aktiv** (nicht 1 Pilot + 2
Demo-Mandate, wie ältere Statusstände sagen — siehe §7, Abweichung A-1). Alle 8 sind
`politische_ebene = bundestag`; **kein einziges Landtagsprofil ist angelegt.**

Zuordnung nach dem echten Resolver gegen den echten Production-Katalog (anonymisiert):

| Profil | aktivierungsberechtigt | vollständig aktiviert | zugewiesene Pakete |
|---|---|---|---|
| P1 (Pilot) | ja | ja | `bund-basis`, `die-linke-bund`, `arbeit-und-soziales`, `regional-niedersachsen`, `profil-<id>` |
| P2 | ja | ja | `bund-basis`, `arbeit-und-soziales`, `profil-<id>` |
| P3 | ja | ja | `bund-basis`, `profil-<id>` |
| P4 | ja | ja | `bund-basis`, `arbeit-und-soziales`, `profil-<id>` |
| P5 | ja | ja | `bund-basis`, `arbeit-und-soziales`, `profil-<id>` |
| P6 | ja | ja | `bund-basis`, `arbeit-und-soziales`, `profil-<id>` |
| P7, P8 | **nein** (`aktiv=false`) | nein | zählen nicht zur Aktivierung |

Technisch aktive Pakete daraus: `bund-basis`, `arbeit-und-soziales`, `die-linke-bund`,
`regional-niedersachsen`, `profil-<pilot-mandats-id>` — **5 von 7**. Die beiden
Landespakete sind `inactive`, weil kein Landtagsprofil existiert.

## 6 · Nachweis: ein neues Profil bekommt automatisch die richtigen Pakete

**Methode.** Drei klar künstliche Testprofile wurden durch den **produktiven** Resolver
(`lib/helmut/quellenarchitektur/profile-packages.js`) gegen den **echten, read-only
gelesenen Production-Katalog** geführt. Es wurde **kein** Profil in Production angelegt,
**kein** Datensatz geschrieben und **keine Zeile Code** geändert.

| Testprofil | Pflichtpakete | ergänzt | vollständig aktiviert | aktive Abrufwege |
|---|---|---|---|---|
| Bundestag (SPD, Ausschuss Arbeit und Soziales) | `bund-basis` | `arbeit-und-soziales` | **ja** | 138 |
| Landtag Berlin (CDU, Ausschuss Inneres) | `bund-basis` + **`berlin-basis`** | — | **nein**, `pflichtpaket-unversorgt` | 54 |
| Landtag Brandenburg (Die Linke, Ausschuss Wirtschaft) | `bund-basis` + **`brandenburg-basis`** | `die-linke-bund` | **nein**, `pflichtpaket-unversorgt` | 56 |

Ergebnis gegen den Production-Katalog, jeweils belegt:

1. Jedes Profil erhält sein korrektes Basispaket — Bund, Berlin, Brandenburg.
2. Fachpakete entstehen aus **Profildaten** (Ausschuss → `arbeit-und-soziales`, Partei →
   `die-linke-bund`), nicht aus einer Namensliste.
3. **Keine fremden Regionalpakete:** das Berliner Profil erhält weder
   `brandenburg-basis` noch `regional-niedersachsen`; umgekehrt ebenso.
4. **Kein Mandant ist hartkodiert.** Die Sachzuordnung ist unter beliebiger Profil-ID
   identisch; nur der personenbezogene Schlüssel folgt der ID
   (`profil-<mandats-id>`, Konvention in `personalPackageKeyFor`). Das Personenpaket des
   Piloten wird von **keinem** anderen Profil aktiviert (`refCount` bleibt 1).
5. **Bestandsmandanten bleiben unberührt:** mit den drei zusätzlichen Testprofilen
   bleiben aktive Pakete und aktive Abrufwege exakt gleich (145 → 145); kein bisher
   aktiver Weg fällt weg, kein `prepared`-Paket wird still aktiviert.
6. **Ehrlicher Leerzustand statt falschem Grün:** Berlin/Brandenburg werden korrekt
   angefordert (`refCount` 1), aber als `requested_unsupplied` geführt — Status
   `prepared` verhindert die Aktivierung, **auch wenn Abrufwege vorhanden sind**.

**Automatisierter Beleg:** `scripts/paketzuweisung-nachweis-test.js` — **139/139 grün**,
dreimal wiederholt mit identischem Ergebnis. Die Suite prüft dieselbe Logik gegen zwei
Katalogformen: den Bund-Code-Seed **und** einen produktionsförmigen Katalog (Landespakete
**mit** Abrufwegen, ein personenbezogenes Paket) aus neutralen Platzhaltern. Sie enthält
**keine** Production-Daten und keine reale Mandantenidentität.

## 7 · Gefundene Abweichungen

Alle Abweichungen sind **Befunde dieser Inventur**, keine in diesem Sprint verursachten
Änderungen. Nichts davon wurde in Production korrigiert.

| # | Befund | Wirkung | Behandlung |
|---|---|---|---|
| **A-1** | Production führt **8 Profile (6 aktiv)**, nicht „1 Pilot + 2 Demo-Mandate". Fünf davon tragen Klarnamen realer Bundestagsabgeordneter und wurden am 20.07. angelegt. | `OP-04` ist deutlich größer als dokumentiert; jedes aktive Profil erzeugt Crawl-Last und Personensuchen | in `CURRENT_STATE.md` §3 und `datenmotor-restliste.md` (OP-04) nachgezogen. Löschen/Deaktivieren ist **freigabepflichtig** — nicht ausgeführt |
| **A-2** | `docs/quellenarchitektur/07-…` behauptete, `berlin-basis`/`brandenburg-basis` hätten **0 Quellen**. Production führt **10 bzw. 9** Abrufwege. | Doku widersprach dem Ist-Stand | Doku korrigiert (dieser Sprint) |
| **A-3** | Die Landes-Basispakete (`is_base`, für **jedes** Landtagsprofil verpflichtend) enthalten in Production **Partei-, Fraktions- und Personenquellen** (`be-partei_pilot`, `be-fraktion_pilot`, `be-person_pilot`, `bb-partei_pilot`). | Ein Landtagsmandat beliebiger Partei bekäme zwingend die Quellen **einer** Partei — Verstoß gegen die Mandantenneutralität | Codeseitig behoben in **PR #118** (P0-2), dort **nicht gemergt**. Production-Daten unverändert. **Vor jeder BE/BB-Aktivierung zu bereinigen** |
| **A-4** | 2 der 5 `always_on`-Kernwege (`bundestag`, `bundesregierung`) sind `broken` — die „5 neutralen Kernquellen ohne Profil" sind faktisch **3**. | Ein Betrieb ohne aktives Profil hätte weniger Grundversorgung als dokumentiert | verifizierte Ersatz-URLs liegen in **PR #118** (P1), ungemergt |
| **A-5** | `profil-<pilot-mandats-id>` liefert in **5 von 5** Läufen `empty`, während dasselbe Mandat parallel 6 profilgenerierte Personensuchen fährt. | Die DB-Katalogzeile ist redundant zum Laufzeitmechanismus und trägt nichts bei | dokumentiert; Entfernen wäre eine **Production-Datenänderung** → freigabepflichtig, nicht ausgeführt |
| **A-6** | `retrieval_paths.last_success_at`/`last_error`/`error_streak` sind zu **0 von 163** befüllt. | Die Pfad-Statusmaschine ist toter Code; `status` (`healthy`/`needs_review`/`broken`) ist eine Seed-Annotation, keine Messung | bekannt und als P1 in **PR #118** ausdrücklich ausgeklammert; hier nur belegt |
| **A-8** | `docs/quellenarchitektur/07-…` schloss mit „**nicht** in den Live-Scheduler verdrahtet". Tatsächlich läuft der Resolver seit dem Cutover live: `scheduler.getSourcesForProfile` → `buildRelationalCrawlPlan` → `computeGlobalActivation`. | Die zentrale Aussage dieses Sprints stand in der Doku als „nicht produktiv" | Doku korrigiert (dieser Sprint) |
| **A-7** | Jeder Cron-Lauf erscheint doppelt: ein vollständiger Lauf (145 Quellen, 143 `ok`) und ~3 Minuten später ein Wiederholungslauf mit **`circuit-open`** auf fast allen Wegen (3 988 Zeilen gesamt). | Telemetrie-Auswertungen über „alle Läufe" unterschätzen den Ertrag massiv | für diese Inventur durch Beschränkung auf vollständige Läufe entschärft; Ursachenanalyse gehört zu **OP-15** |

## 8 · Was diese Inventur **nicht** belegt

- Keine Aussage über **inhaltliche** Qualität der gelieferten Dokumente (Checklistenpunkte
  19–28 der Phase-1-Liste).
- Keine Aussage zur fachlichen Vollständigkeit der vier Bundespakete (Punkt 13) — es
  fehlt das Kriterium, nicht die Messung.
- Kein Ende-zu-Ende-Nachweis bis ins Briefing (Punkte 25–28).
- Kein Nachweis, dass ein Landtagsprofil **versorgt** würde — Berlin/Brandenburg sind
  `prepared` und liefern nichts (Punkte 14/15).

## 9 · Reproduktion

Die Inventur ist ohne Schreibrechte reproduzierbar. Alle Zahlen dieser Datei stammen aus:

```sql
-- Bestand
SELECT key, status, is_base, political_level, geography_id FROM source_packages ORDER BY key;

-- Abrufwege je Paket
SELECT p.key, count(pp.retrieval_path_id) AS wege,
       count(*) FILTER (WHERE rp.status='broken')       AS defekt,
       count(*) FILTER (WHERE rp.activation_mode='manual') AS vorbereitet
FROM source_packages p
LEFT JOIN package_paths pp ON pp.package_id = p.id
LEFT JOIN retrieval_paths rp ON rp.id = pp.retrieval_path_id
GROUP BY p.key ORDER BY p.key;

-- Ertrag und letzte Lieferung (nur vollstaendige Laeufe, siehe A-7)
WITH prim AS (
  SELECT run_id FROM source_crawl_telemetry WHERE run_id LIKE 'crawl-%'
  GROUP BY run_id HAVING count(*) FILTER (WHERE status='ok') > 100
  ORDER BY min(started_at) DESC LIMIT 5)
SELECT pk.key, count(DISTINCT t.source_id) AS wege_mit_telemetrie,
       sum(t.found_documents) AS gefunden, sum(t.new_documents) AS neu,
       max(t.finished_at) FILTER (WHERE t.status='ok') AS letzte_lieferung
FROM source_packages pk
LEFT JOIN package_paths pp ON pp.package_id = pk.id
LEFT JOIN retrieval_paths rp ON rp.id = pp.retrieval_path_id
LEFT JOIN source_crawl_telemetry t ON t.source_id = rp.legacy_source_id
     AND t.run_id IN (SELECT run_id FROM prim)
GROUP BY pk.key ORDER BY pk.key;
```

Der Zuweisungsnachweis (§6) ist ohne DB-Zugriff reproduzierbar:

```
node scripts/paketzuweisung-nachweis-test.js     # 139/139
node scripts/profile-packages-test.js            # Bestandssuite
node scripts/run-offline-tests.js                # gesamte Offline-Suite
```
