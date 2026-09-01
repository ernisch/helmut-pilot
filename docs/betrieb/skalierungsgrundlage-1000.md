# Skalierungsgrundlage 1000 — lokale Umsetzung (OP-30)

**Datum:** 2026-08-08 (zweiter Sprint desselben Tages: Belastungstest, Kapazitätsmessung,
Mutationsprobe, Belegkette, KI-Deckel- und Google-Bewertung) · **Zustand:** lokal umgesetzt
und getestet, **in Production nicht aktiviert und nicht nachgewiesen** ·
**Arbeitsbaum:** `/home/user/helmut-scaling`, Branch `claude/helmut_scaling_foundation_1000`,
Ausgangscommit `a07954d` · **kein Commit, kein Push, kein Pull Request**

**Anlass:** [`v3-skalierungspruefung-2026-08-08.md`](v3-skalierungspruefung-2026-08-08.md) —
der V3-Datenmotorkern skaliert (ein Dokument wird **einmal** verstanden, Matching und
Entscheidungen ohne KI), aber der schwere Cronlauf erledigt Planung **und** Verarbeitung in
einem 300-s-Slot. Daraus folgen zwei harte, unabhängige Schranken: der Quellenabruf reißt sein
Budget zwischen n = 14 und n = 15 Mandaten, und `budgetAufteilung` deckelt die Projektionszeit
auf ~16–17 Mandate **je Lauf**. Beides ist eine Eigenschaft des Cron-Slots, nicht des Motors.

---

## 1 · Was gebaut wurde

| Baustein | Datei | Zweck |
|---|---|---|
| **Warteschlange (Schema)** | `supabase/migrations/20260808_scalable_job_queue.sql` | `public.helmut_jobs` + 6 Funktionen. Rollback im selben Verzeichnis. |
| **Datenzugriff** | `lib/helmut/storage.js` (additiver Block vor `module.exports`) | 6 dünne RPC-Hüllen, fail closed. |
| **Source-Demand-Compiler** | `lib/helmut/source-demand.js` (neu) | Aus n Profilen die **Menge der verschiedenen Abrufdefinitionen** statt der Summe der Profilpläne. |
| **Scheduler + Worker + Handler** | `lib/helmut/scalable-pipeline.js` (neu) | Planen und Verarbeiten getrennt; Handler rufen ausschließlich Bestandsfunktionen. |
| **Anbindung** | `server.js` (`cronSchwererPfad`, `runCronUeberWarteschlange`, `/api/ops/jobqueue`) | Einsprung hinter dem Flag; rein lesender Betriebsstatus. |
| **Sichtbarkeit** | `lib/helmut/scheduler.js` | `personNewsSource` additiv exportiert. Kein Verhaltensänderung. |

**V3 bleibt vollständig erhalten.** Kein neuer Motor, keine neue Sprache, keine neue
Oberfläche, kein neuer Anbieter, keine neue Abhängigkeit (`package.json` hat unverändert
genau `ical.js`), keine Postgres-Extension.

## 2 · Warum eine relationale Tabelle und nicht pgmq

Geprüft wurden genau die zwei vom Auftrag genannten Möglichkeiten.

| Anforderung (§5) | pgmq ab Werk | relationale Tabelle |
|---|---|---|
| Dauerhafte Speicherung | ja | ja |
| Atomare Reservierung | ja | ja (`for update skip locked`) |
| Sichtbarkeitsdauer / Lease | ja | ja (`lease_owner` + `lease_expires_at`) |
| Wiederaufnahme nach Absturz | ja | ja (Claim nimmt abgelaufene Leases mit) |
| Idempotenz | **nein** | ja (`unique(idempotency_key)`) |
| Priorität | **nein** | ja (`priority`, kleiner = wichtiger) |
| Faire Verarbeitung | **nein** | ja (`order by priority, due_at, created_at`) |
| Geplante Fälligkeit | **nein** | ja (`due_at`) |
| Begrenzte Wiederholungen | ja | ja (`attempts`/`max_attempts`) |
| Fehlerstatus | teilweise | ja (`fehlgeschlagen` + `last_error`) |
| Rückstandsmessung | **nein** | ja (`helmut_job_metrics`) |
| Auditierbarkeit | **nein** | ja (Zeile bleibt stehen) |
| Serverseitiger Zugriff | ja | ja |
| Keine Freigabe an Browser | ja | ja (RLS forced, keine Policy, Rechte entzogen) |

**Entscheidung: relationale Tabelle.** Drei Gründe:

1. **Verfügbarkeit.** `pgmq` ist im Repository nirgends aktiviert (die einzige
   `create extension` im Bestand ist `vector`, `supabase/schema.sql:520`), und die
   Supabase-Version ist lokal **nicht verlässlich feststellbar**: kein `supabase`-CLI, keine
   `supabase/config.toml`, kein Egress. Im lokalen PostgreSQL 16.13 ist `pgmq` nicht
   installiert (`create extension pgmq` → „Could not open extension control file"). Der
   Auftrag schreibt für genau diesen Fall die relationale Lösung vor.
2. **Anforderungsdeckung.** pgmq deckt 5 von 14 Punkten ab. Die übrigen 9 bräuchten in jedem
   Fall zusätzliche eigene Tabellen — also genau diese Struktur, dann aber doppelt geführt.
3. **Keine neue Abhängigkeit.** `for update skip locked` ist Kern-Postgres seit 9.5.

## 3 · Der Kern: Quellenbedarf einmal kompilieren

Der Bestandspfad dedupliziert über `source.id`, und die Kennung **enthält die Mandats-ID**
(`<mandats-id>-news-fraktion-partei`). Zwei Mandate derselben Fraktion mit denselben Themen
ergeben dort zwei Planeinträge; nur der prozessweite `sharedFetchLedger` verhindert den
doppelten HTTP-Abruf — und auch nur innerhalb eines Prozesses und eines 15-Minuten-Fensters.

Der Compiler dedupliziert stattdessen über die **normalisierte Abrufdefinition** (die
kanonisierten Feed-URLs). Die Mandats-ID ist gar nicht Teil des Schlüssels — **außer** der
Auftrag ist wirklich persönlich.

**Gemessen an 1000 synthetischen Profilen** (`scripts/skalierung-1000-test.js`):

| | Zahl |
|---|---:|
| Profileigene Quellen (1000 Profile: 875 × 7 + 125 × 8) | **7 125** |
| daraus kompilierte Aufträge | **3 190** |
| davon geteilt | 1 190 |
| davon persönlich aktuell | 1 000 |
| davon persönlich Archiv | 1 000 |
| zusammengefasst | 4 935 |

**Struktur der 1 190 geteilten Aufträge — ehrlich benannt:**

| | Zahl |
|---|---:|
| von ≥ 25 Mandaten gebraucht | 120 |
| von ≥ 10 Mandaten gebraucht | 190 |
| von genau 1 Mandat gebraucht | **1 000** |
| meistgeteilter Auftrag | **50 Mandate** |

Die 1 000 einzeln angeforderten sind **überwiegend Regionalsuchen**: die Abfrage enthält den
Wahlkreis, und Wahlkreise sind in der Wirklichkeit (und im Testdatensatz bewusst) fast
eindeutig. Sie lassen sich **nicht** zusammenfassen, ohne fachlich falsch zu werden. Der
Compiler tut das Richtige, indem er sie stehen lässt — aber sie dominieren damit den
verbleibenden Bedarf. **Das ist die bekannte nächste Stellschraube** (§9).

## 4 · Mengengerüst pro Tag bei 1000 Mandaten

| Posten | neuer Pfad | Herleitung |
|---|---:|---|
| geteilte/globale Abrufe | 3 570 | 1 190 × 3/Tag (8-h-Fenster) |
| persönliche Aktuell-Suchen | 1 000 | 1 000 × 1/Tag (24-h-Fenster) |
| persönliche Archivsuchen | 143 | 1 000 alle 7 Tage |
| **externe Abrufe gesamt** | **4 713** | |
| Mandatsprojektionen | 1 000 | 1 × täglich je Mandat |
| Briefingmaterialisierungen | 1 000 | 1 × täglich je Mandat |
| Understanding-Aufträge | *aus neuen Vorgängen* | **unabhängig von der Mandatszahl** |

**Vergleich Bestandspfad bei 1000 Mandaten:** 3 schwere Läufe × (140 geteilte + 7 125 eigene)
= **21 795 Abrufe/Tag**. Der neue Pfad braucht **4,6× weniger**.

**KI-Aufrufe aus diesem Pfad, aus dem Code abgeleitet:**

| Schritt | KI-Aufrufe | Beleg |
|---|---|---|
| Understanding | 1 je **neuem Vorgang**, global | `understanding.js:560` `canSpendLlm(null)` |
| Matching | **0** | `llm-pfad-karte.md` Zeile 14 |
| Entscheidungen | **0** | ebd. |
| Briefingmaterialisierung | **0** | ebd. Zeile 15 |
| **Summe mandatsabhängig** | **0** | |

**Nicht Teil dieses Pfades** und unverändert je Mandant: Lagenarrativ und Bürotexte
(Prüfbericht §B.15). Sie bleiben der Grund, warum der globale Tagesdeckel von 100 Aufrufen
rechnerisch bei ~70 Mandaten greift. **OP-30 löst das nicht** — dafür ist M3
(`HELMUT_TENANT_LLM_CAP`, gehört zu OP-03) zuständig.

## 5 · Was lokal bewiesen ist — und was nicht

### Bewiesen (Testzahlen)

| Suite | Ergebnis | Was sie beweist |
|---|---|---|
| `jobqueue-datenbank-test.js` | **52/52** | **Echter PostgreSQL 16.13**, echte gleichzeitige Verbindungen: Migration + Rollback anwendbar, RLS/Rechte/`search_path`, Idempotenz, keine Doppelvergabe, Lease/Absturz/Wiederaufnahme, kein Doppelabschluss, Wiederholungsgrenze, Priorität, Kappung, Kennzahlen, Aufräumen. |
| `jobqueue-vertrag-test.js` | **100/100** | Flaggrenze, Idempotenz, Parallelität, Lease, Worker-Zeitbudget (auch gegen einen ewig hängenden Handler), Fehlerklassen, Bereinigung, Betriebsschwellen, **Gleichheit der Attrappe mit der echten Datenbank**, Handler nutzen Bestandsfunktionen. |
| `source-demand-test.js` | **59/59** | Fensterlogik, Normalisierung, persönliche Suchen nie zusammengefasst, geteilte zusammengefasst, Determinismus, Streuung, keine harte Mandatsgrenze, Nutzdatensparsamkeit. |
| `skalierung-1000-test.js` | **69 PASS / 0 FAIL / 2 offen** | Vollständiger Durchlauf mit 1000 Profilen, 4 Worker × 25 Runden; dazu Planungsidempotenz über fünf identische Läufe, Belegkette je Profil und die gemessene Google-Abhängigkeit. |
| `jobqueue-sicherheit-test.js` | **69/69** mit Server · 58/58 + 1 offen ohne | Die sieben geforderten Angriffs-/Fehlerfälle plus Mandantentrennung und Budgetunversehrtheit — und dieselben Fälle noch einmal gegen einen **echten** PostgreSQL (Einschleusungsversuche, Kappung, fremder Halter, Doppelabschluss). Ohne Server wird das ausdrücklich als **offen** gezählt, nicht als bestanden. |
| `scalable-pipeline-flag-test.js` | **50/50** | Aktivierungsschutz, Rückweg, OP-25-Pfad unangetastet, keine neue Abhängigkeit. |
| `jobqueue-lasttest.js` | **19/19** | Belastungstest gegen echten PostgreSQL: 5 190 echte Aufträge, 1 Worker gegen 8 Workerprozesse, harter `SIGKILL` mitten im Lauf, zweiter Volllauf zur Wiederholbarkeit, Kapazitätskennzahlen a–i. **Nicht Teil des Offline-Laufs** (braucht einen Server). |
| `jobqueue-mutationsprobe.js` | **10 rot / 0 grün** | Neun Schutzmechanismen einzeln aus der Migration entfernt — **jede** Entfernung färbt einen Nachweis rot. **Nicht Teil des Offline-Laufs.** |
| **Gesamtlauf** | **199/214** | `node scripts/run-offline-tests.js` — **identischer Fehlschlagsatz wie die Baseline** (dieselben 15 Umgebungsfehler), **keine Regression**, 6 neue Suiten. Die Baseline wurde dafür aus einem frischen `git archive HEAD`-Baum erzeugt und dreimal gelaufen (stabil 193/208). |

**Ein beobachteter Wackler, ehrlich benannt:** in **einem** von vier Volläufen fiel zusätzlich
`berlin-e2e-vertrag-test.js` (Prüfpunkt „J8 Rangfolge") aus. Einzeln läuft die Suite in beiden
Arbeitsbäumen 3/3 grün, in den übrigen Volläufen ist der Fehlschlagsatz baseline-identisch, und
die Suite lädt **keines** der neuen Module (`grep` auf `source-demand`/`scalable-pipeline`: 0
Treffer). Bewertung: Lastabhängige Unschärfe des Parallelrunners, **kein** belegter
Zusammenhang mit dieser Arbeit — aber auch **nicht** als „nie passiert" verbucht.

Der 1000-Profile-Durchlauf belegt konkret: alle 1000 Profile eingelesen, kein Abschneiden,
**kein doppelt reservierter Auftrag**, **kein verlorener Auftrag**, kein Auftrag blieb in
`laeuft` hängen, jedes der 1000 Mandate erhielt Projektion **und** Briefingmaterialisierung
genau einmal, **keine Datenvermischung**, ein Dokument wird auch bei drei Aufträgen nur
**einmal** verstanden, Absturz und Dauerfehler enden kontrolliert.

### Nicht bewiesen — ausdrücklich

| Punkt | Warum offen |
|---|---|
| **Rückstand in ≤ 24 h abarbeitbar** (§12.15) | Die Abrufdauer ist im Test eine Attrappe. Die reale Dauer hängt an der Google-Drosselung (Parallelität 5, Mindestabstand 200 ms) und an der Zahl gleichzeitiger Worker. |
| **Kapazitätsreserve Faktor zwei** (§12.16) | Setzt eine gemessene Verarbeitungsrate voraus. Für den neuen Pfad liegen keine Laufzeitdaten vor; jede Zahl wäre erfunden. |

**Was sich rechnerisch sagen lässt** (keine Messung): 4 713 Abrufe/Tag × 0,619 s (die im
Production-Lauf gemessene amortisierte Rate, Prüfbericht §C.10) = **~0,8 h** reine Abrufzeit
bei **einem** Worker. Das ließe eine große Reserve vermuten — **aber** die 0,619 s stammen aus
einem Lauf mit 97 % Google-Anteil hinter **einer** Egress-IP. Ob mehrere Worker diese Rate
halten oder sich gegenseitig in die Drosselung treiben, ist **nicht gemessen**. Deshalb bleibt
die Reserve offen.

## 6 · Was Production noch nicht hat

| Schritt | Zustand |
|---|---|
| Migration `20260808_scalable_job_queue.sql` | **nicht angewendet** — freigabepflichtig (CLAUDE.md §5) |
| Flag `HELMUT_SCALABLE_PIPELINE` | **nirgends gesetzt** — Aktivierung ist Betreiberaktion über Vercel-Env |
| Worker-Betrieb | **nie gelaufen** |
| Durchsatzmessung | **liegt nicht vor** |

**Reihenfolge einer späteren Aktivierung (verbindlich):**

1. OP-25-Fenster auswerten und freigeben — **vorher gar nichts**.
2. Migration anwenden (freigabepflichtig). Ohne sie meldet die Warteschlange ehrlich
   `verfuegbar:false / migration-fehlt`; der Lauf gilt dann als **nicht ok**.
3. Deployment mit diesem Codestand.
4. `HELMUT_SCALABLE_PIPELINE=on` in Vercel, **nur Production**.
5. Beobachten über `/api/ops/jobqueue` (CRON_SECRET, rein lesend).
6. **OP-25 vollständig von vorn** — der Nachweis ist deploymentgebunden und misst genau die
   Größen, die dieser Pfad verändert.

**Rückweg, jederzeit:** Flag auf `off` oder Variable löschen, Redeploy. Der bisherige Pfad
läuft danach unverändert weiter. Die Tabelle darf gefahrlos stehen bleiben — sie wird dann von
niemandem gelesen oder geschrieben. Das Rollback-SQL ist der seltene Fall, nicht der Regelfall.

## 7 · Sicherheit

- **RLS aktiviert UND erzwungen** (`force`), `anon`/`authenticated`/`PUBLIC` alle Rechte
  entzogen, **keine Policy** — zwei unabhängige Riegel. Selbst ein späteres versehentliches
  `grant select to authenticated` zeigte ohne Policy keine Zeile.
- **Keine SECURITY-DEFINER-Funktion.** Alle 7 Funktionen sind SECURITY INVOKER; `search_path`
  ist trotzdem fest auf `public, pg_temp` gesetzt (Advisor 0011, Konvention aus `20260721`).
- **Keine Geheimnisse in der Ablage.** `bereinigeFehler` maskiert Bearer/Basic/JWT/API-Keys/
  Query-Secrets/Zugangsdaten in URLs, reduziert Stacktraces auf die erste Zeile und kappt auf
  300 Zeichen; die Datenbank kappt zusätzlich hart auf 500. Ein zu großer Payload wird
  **ehrlich abgelehnt**, nicht still gekürzt.
- **Mandantentrennung.** Persönliche Aufträge tragen die Mandats-ID im Schlüssel und werden
  nie zusammengefasst — auch nicht bei gleichem Namen. Geteilte Aufträge tragen
  ausdrücklich **keinen** Mandatsbezug (`tenant_id = null`, CLAUDE.md §4.2). Im
  1000-Profile-Durchlauf: **0 Fälle** von Fremdbezug.
- **Budget unangetastet.** Der skalierbare Pfad ruft im Code kein Budget-Gate auf und
  importiert `ai.js` nicht. Das Verstehen läuft über die unveränderte
  `runUnderstandingShadow` und damit über deren unveränderten **globalen** Deckel.

## 8 · Echte Befunde, beim Bauen gefunden und behoben

> Vier davon stehen hier, ein fünfter (Briefing vor den eigenen Abrufen) in §14, und zwei
> weitere Befunde über die Nachweise selbst in §8c.

1. **`helmut_finish_job` gab im Fehlerpfad ZWEI Zeilen zurück.** `return query` setzt die
   Funktion fort; ohne folgendes `return;` hängte der Rumpf eine zweite, widersprüchliche
   Antwort an. Gefunden von `jobqueue-datenbank-test.js` §6 (`f` **und** `t`). Behoben.
2. **`bereinigeFehler` maskierte `?service_key=` nicht.** Das Muster verlangte den
   Parameternamen exakt (`key`), traf also nicht die häufigen zusammengesetzten Namen
   (`service_key`, `access_token`, `anon_key`). Gefunden von `jobqueue-sicherheit-test.js`
   §8.1. Behoben — Wortpräfixe sind jetzt erlaubt.

3. **Der Worker konnte sein Laufzeitbudget nicht halten.** Ein Handler, der nie zurückkehrt,
   hätte den gesamten Slot verbraucht: `crawlAllSources` hat je **einzelner** Anfrage ein
   Timeout, aber **keine** Gesamtgrenze (Befund F-REQ — einzelne Production-Quellen liefen
   41 892 ms bei 7 000 ms Anfragelimit). Empirisch nachgewiesen mit einem Handler, der ein
   nie erfülltes Promise liefert. Behoben: Zeitgrenze je Auftrag
   (`HELMUT_JOB_TIMEOUT_MS`, Default 120 s, zusätzlich durch die Restzeit gedeckelt). Ein
   überschrittener Auftrag gilt **nicht** als erledigt, sondern als vorübergehend
   gescheitert — die Lease läuft aus, er kehrt zurück.
4. **Die Reservierung lief als Seq Scan statt über den Index.** Die Bedingung
   `status='wartend' OR status='laeuft'` machte den partiellen Claim-Index unbrauchbar —
   gemessen mit `explain analyze` gegen die echte Datenbank. Bei 1 000 Mandaten trägt die
   Tabelle mit 14 Tagen Aufbewahrung rund 66 000 Zeilen, und der Claim läuft mehrfach je
   Lauf. Behoben: abgelaufene Leases werden in einem eigenen, über `helmut_jobs_lease_idx`
   indizierten Schritt nach `wartend` zurückgesetzt; die Reservierung liest danach nur noch
   `status='wartend'`.
   **Gemessene Wirkung:** `Seq Scan`, 1,8 ms bei 5 000 Zeilen → **`Index Scan using
   helmut_jobs_claim_idx`, 0,343 ms bei 50 000 Zeilen.** Die Fachlogik ist unverändert
   (Nachweis: `jobqueue-datenbank-test.js` 47/47 vor und nach dem Umbau identisch).

Dazu **drei Fehler in den Prüfungen selbst**, die ausdrücklich festgehalten werden, weil sie
zeigen, wo eine Prüfung grün sein kann, ohne etwas zu beweisen: (a) die 24-h-Prüfung im Skalierungstest forderte pauschal „nichts wartet mehr" und hätte
damit den **korrekten** Entwurf als Fehler gewertet — Archivsuchen haben per Entwurf ein
7-Tage-Fenster; sie ist jetzt präzise (§11.3a–d) und schärfer als vorher. (b) Drei Prüfungen
durchsuchten den **Quelltext samt Kommentaren** nach Wörtern (`MAX_LAUF`, `create extension`,
`canSpendLlm`) und schlugen an der Begründung an, die genau erklärt, warum das dort *nicht*
getan wird; sie prüfen jetzt Code ohne Kommentare. (c) Zwei Prüfungen verglichen SQL-Text
wörtlich statt der Zusage und brachen beim Index-Umbau, obwohl die Zusage galt; sie prüfen
jetzt Struktur und Reihenfolge.

## 8a · Gemessene Leistungsgrenze der Warteschlange selbst

Gegen den lokalen PostgreSQL 16.13, `explain analyze`:

| Zeilen in `helmut_jobs` | Claim-Abfrage |
|---:|---|
| 5 000 (vor dem Umbau) | Seq Scan, 1,8 ms |
| 50 000 (nach dem Umbau) | **Index Scan, 0,343 ms** |

Die Warteschlange selbst ist damit **nicht** der Engpass. Der Engpass bleibt der externe
Abruf — und der ist nicht gemessen (§5).

## 8b · Belastungstest und Kapazitätsmessung (Sprint 2026-08-08)

`node scripts/jobqueue-lasttest.js` gegen den lokalen PostgreSQL 16.13.
**5 190 echte Aufträge** aus dem Produktionsplaner (3 190 Abrufe + 1 000 Projektionen +
1 000 Briefingmaterialisierungen), echte Workerprozesse (eigener Node-Prozess, eigene
Verbindung, eigener Lease-Besitzer), Worker-Schleife aus `lib/helmut/scalable-pipeline.js`.

| Kennzahl (Sprintauftrag §10) | Messwert |
|---|---|
| a) Aufträge gesamt | 5 190 |
| b) je Typ | `source_fetch` 3 190 · `mandate_projection` 1 000 · `briefing_materialization` 1 000 |
| c) Durchsatz **ein** Worker | **≈ 950 Aufträge/s** (5 190 in 5,5 s) |
| d) Durchsatz **acht** Worker | **≈ 2 750 Aufträge/s** (5 190 in 1,9 s); Wiederholung 3 093/s |
| e) mittlere Bearbeitungszeit | 25,5 ms je Auftrag (Reservieren → Abschluss) |
| f) Gesamtdauer aller Testläufe | ≈ 27 s |
| g) maximales Rückstandsalter | 27 s (Laufzeit des Tests selbst) |
| h) rechnerisch nötige Worker für 24 h | **1** (Tagesbedarf 15 570 Aufträge bei 3 Fenstern) |
| i) Kapazitätsreserve Faktor zwei | **1 Worker**; Dauerauslastung eines Workers ≈ **0,02 %** |

**Was das beweist:** die Warteschlange ist nicht der Engpass — auch nicht annähernd.
Ein einzelner Worker schöpft den kompletten Tagesbedarf von 1 000 Mandaten in
**unter 20 Sekunden** reiner Warteschlangenzeit ab.

**Was das ausdrücklich nicht beweist:** die Aufgabenhandler sind Attrappen. Es gab keinen
Netzverkehr, keinen Google-Abruf, keinen KI-Aufruf. Die Zeilen h) und i) sind deshalb
**rechnerisch plausibel**, nicht bewiesen. Die reale Tagesdauer wird vom externen Abruf
bestimmt (§5, „Nicht bewiesen").

**Absturz unter Last:** ein Worker wird nach 1,5 s mit `SIGKILL` hart getötet, während er
Aufträge reserviert hält. Der Test hält **genau diese** Auftragskennungen fest und prüft
danach, dass **jede einzelne** wieder vergeben und erledigt wurde. Ergebnis: 3 von 3
wiederhergestellt, 0 verloren, 0 doppelt erledigt, keine Zeile verschwunden.

## 8c · Mutationsprobe: sind die Nachweise überhaupt empfindlich?

`node scripts/jobqueue-mutationsprobe.js` entfernt **je einen** Schutzmechanismus aus der
Migration, spielt sie in eine Wegwerf-Datenbank ein und prüft, ob der zugehörige Nachweis
rot wird. **10 von 10 Mutationen wurden erkannt, keine blieb grün.**

Zwei Mutationen haben dabei etwas Echtes über den Code verraten, statt nur den Test zu
bestätigen:

* **Versuchsobergrenze:** das Entfernen der Bedingung `attempts < max_attempts` aus der
  Reservierung allein erzeugt **keinen** Fehler — Schritt (b) des Claims setzt erschöpfte
  Aufträge schon vorher auf `fehlgeschlagen`. Die Grenze ist **doppelt** gesichert. Die
  Probe prüft seitdem beide Gürtel einzeln **und** gemeinsam.
* **Rechteentzug:** in einer nackten lokalen Datenbank bekommen `anon`/`authenticated`
  ohnehin keine Tabellenrechte — der `revoke` lief dort ins Leere und die Mutation blieb
  fälschlich grün. In Supabase ist das anders (Standardvergabe an neue Tabellen). Die Probe
  **stellt die Supabase-Standardvergabe nach** und führt einen Kontrolllauf, damit der
  Nachweis nicht am Testaufbau hängt.

## 8d · Zwei Testfehler, gefunden weil dieselbe Suite oft genug lief

Beide betreffen **die Tests**, nicht das Produkt — und beide hätten später als „mysteriöses
Wackeln" Zeit gekostet.

1. **Geteilte Testdatenbank.** `jobqueue-datenbank-test.js` und `jobqueue-vertrag-test.js` §9
   benutzten beide die Vorgabe `helmut_test`, und §9 spielt dort Rollback + Migration **neu**
   ein. Liefen beide gleichzeitig, riss §9 dem Datenbanknachweis die Tabelle mitten im Lauf
   weg (einmal als **51/52** beobachtet). **Behoben:** jede Suite hat jetzt ihre eigene
   Datenbank (`helmut_test_datenbank` / `helmut_test_vertrag`), die sie selbst anlegt;
   `HELMUT_TEST_PG_DB` behält Vorrang. Unter absichtlicher Mehrfachlast danach **8 × 52/52**.
2. **Eine Zeitmessung als Korrektheitsnachweis.** Punkt 4.8 verglich die Wanduhrzeit mit einer
   sequenziellen Erwartung. Auf einer ausgelasteten Maschine ist das unscharf — der Punkt fiel
   um, während **alle** Korrektheitspunkte grün blieben. **Behoben:** der
   Gleichzeitigkeitsnachweis hängt jetzt an der **beobachteten Überlappung** in
   `pg_stat_activity` (Punkt 4.1); die Uhr ist Zusatzbeleg und wird bei Abweichung als Messwert
   ausgegeben.

## 9 · Was weiterhin offen ist

1. **Die Regionalsuche** ist strukturell fast eindeutig und trägt 1 000 der 1 190 geteilten
   Aufträge. Sie zu entzerren (eigenes, längeres Fenster) ist die naheliegende nächste
   Stellschraube und über `HELMUT_DEMAND_*` bereits konfigurierbar — aber eine
   **Produktentscheidung**, keine technische: seltenere Regionalnachrichten sind ein
   spürbarer Produktunterschied.
2. **Durchsatz unter echter Google-Drosselung** — siehe §5, offen.
3. **Der Google-News-SPOF** bleibt unberührt. Inzwischen gemessen statt geschätzt: **100 %**
   der 3 190 profileigenen Abrufwege laufen über `news.google.com` (§13). Bei 4 713
   Abrufen/Tag ist das ein eigenständiges Risiko.
4. **`document_understanding` wird noch von niemandem eingereiht.** Der Handler existiert und
   ist getestet; der Compiler erzeugt bisher `source_fetch`, `mandate_projection` und
   `briefing_materialization`. Das Verstehen läuft weiterhin im bestehenden Pfad. Das ist
   Absicht — der Auftrag verlangt „mindestens `source_fetch` vollständig", und eine
   Verstehensplanung ohne gemessenen Rückstand wäre geraten.
5. **Der globale KI-Deckel** (100 Calls/Tag) ist die erste Wand, die 1 000 Mandate treffen
   würden — nicht die Warteschlange. Bewertung und der Weg dahin: §12. In diesem Sprint
   wurde **nichts** daran geändert.
6. **Kein Production-Nachweis** für irgendetwas davon. Alle Zahlen dieses Dokuments stammen
   aus lokalen Läufen mit Attrappen für Netz und KI.

## 10 · Warum V3 nicht ersetzt wurde

Weil der Prüfbericht belegt hat, dass V3 an der richtigen Stelle richtig gebaut ist: ein
Dokument wird **einmal** verstanden (`understanding.js:765–859`), Matching und Entscheidungen
laufen **ohne** KI. Die Grenze lag davor — in der Eingangsmenge und im Cron-Slot. Genau dort
setzt diese Arbeit an. Der Datenmotor ist unverändert; er bekommt nur weniger zu tun und mehr
Zeit dafür.

## 11 · Warum der Pilot unverändert bleibt

Der Einzelpilot läuft mit 5–6 Mandaten, und diese Größenordnung ist Production-bewiesen. OP-30
ist **kein Blocker** für ihn. Das Flag ist aus, die Migration ist nicht angewendet, kein
Cron-Zeitpunkt und kein Budget wurde verändert. Für den Piloten ändert sich durch diesen
Sprint **nichts** — nachgewiesen durch `scalable-pipeline-flag-test.js` §3 (ohne Flag steht vor
der bisherigen Pfadwahl nur die Flagabfrage: kein `await`, kein `require`, keine Abfrage).

---

## 12 · Der globale KI-Deckel — warum er 1 000 Mandate heute blockiert

**Keine Production-Änderung. Kein Deckel wurde angefasst.** Der folgende Befund stammt aus
dem Code (`lib/helmut/storage.js`).

**a) Was heute gilt.** `llmDailyCallLimit()` liest `HELMUT_MAX_LLM_CALLS_PER_DAY`; in
Production steht dort **100 Calls/Tag**. Fehlt oder ist der Wert ungültig, greift ein
Schutzlimit von **50** (fail-closed, kein „unbegrenzt"). Dieser Deckel zählt **global** über
alle Mandanten und alle Pfade. Der Per-Mandant-Deckel (`HELMUT_TENANT_LLM_CAP`) existiert,
ist aber **standardmäßig aus**. Understanding hat eine Prioritätsklasse: es darf das volle
Limit nutzen, alle anderen Pfade nur `limit − Reserve`.

**b) Warum das bei 1 000 Mandaten blockiert.** Der KI-Bedarf des Datenmotors hängt **nicht**
an der Mandatszahl — ein Vorgang wird global genau einmal verstanden (im
1000-Profile-Durchlauf gemessen: Matching 0, Entscheidungen 0, Briefingmaterialisierung 0
KI-Aufrufe). Was **doch** mit der Mandatszahl wächst, sind die mandantengebundenen Pfade
außerhalb dieses Sprints: Lagenarrativ und Bürotexte, je Mandant mindestens ein Aufruf pro
Tag. **1 000 Mandate × ≥ 1 Aufruf ≥ 1 000 Aufrufe/Tag gegen einen Deckel von 100.** Der
Deckel ist damit die erste Wand, die 1 000 Mandate treffen — nicht die Warteschlange, nicht
der Motor, nicht Google.

**c) Welche technische Änderung später nötig wäre.** Drei Ebenen, die zusammenspielen müssen:

1. **Globaler Notfalldeckel** bleibt, wird aber zum reinen *Kostennotaus* (Größenordnung
   Tagesbudget, nicht Tagesarbeit). Er darf nie die normale Arbeit begrenzen.
2. **Per-Mandant-Deckel wird der Regelmechanismus** (`HELMUT_TENANT_LLM_CAP` scharf, mit
   dem vorhandenen atomaren Zähler `helmut_reserve_llm_call(day, scope, max)` und
   `scope = 'tenant:<id>'`). Jeder Mandant bekommt sein eigenes Kontingent; ein Mandant
   kann keinen anderen aushungern.
3. **Faire Budgetverteilung** zwischen den Mandanten: das globale Restbudget wird nicht
   „wer zuerst kommt" vergeben, sondern nach demselben Rotationsprinzip wie OP-25 bei den
   Crawls (`docs/betrieb/cron-fairness.md`).

**d) Wie verhindert wird, dass frühe Mandate das Budget der späten aufbrauchen.** Genau das
ist heute der Fall: der globale Zähler ist ein „first come, first served"-Topf, und die
Mandate werden in Listenreihenfolge abgearbeitet. Der Reihenfolgeschutz muss aus zwei
Bausteinen bestehen, die **beide** schon im Repo liegen und nur verbunden werden müssen:
der atomare Reservierungszähler je Mandant (Migration `20260717`, vorhanden) und die
faire Rotation aus OP-25 (vorhanden). Der Warteschlangenpfad liefert dafür die dritte
Zutat, die vorher fehlte: eine **Priorität und ein Fälligkeitszeitpunkt je Auftrag**,
sodass ein Mandat, das gestern zu spät kam, heute mit besserer Priorität startet.

**Nicht Teil dieses Sprints.** Es wurde bewusst **kein** Deckel geändert, kein Flag
geschärft, kein Budgetcode angefasst. `scripts/jobqueue-sicherheit-test.js` §10 prüft
ausdrücklich, dass der neue Pfad **kein** Budget berührt.

## 13 · Google News als Klumpenrisiko

**Keine neue externe Technik. Nur gemessen und bewertet.**

**a) Was daran hängt — gemessen** (`skalierung-1000-test.js` §15): von den **3 190**
Abrufaufträgen, die aus 1 000 Profilen entstehen, laufen **3 190 (100 %)** gegen
`news.google.com`. Das betrifft alle drei Arten: persönliche Aktuell-Suche (1 000),
persönliche Archivsuche (1 000) und die geteilten Fraktions-/Ausschuss-/Regional-/
Themensuchen (1 190). Nicht betroffen sind die **Katalogquellen** des Paketmodells
(Bundestag, Landtage, Ministerien — Größenordnung 140 Abrufwege), die als echte RSS-Feeds
direkt bei den Herausgebern liegen.

**b) Welcher Zustand bei Ausfall entsteht.** Kein falsches Grün: die Abrufaufträge scheitern,
werden nach `max_attempts` (5) endgültig auf `fehlgeschlagen` gesetzt und stehen mit
bereinigtem Fehlertext in der Ablage. Der Betriebsstatus (`/api/ops/jobqueue`) meldet die
endgültigen Fehler und das steigende Rückstandsalter. Die Briefings entstehen weiterhin —
aber mit **weniger Belegen**, im Extremfall mit dem ehrlichen Leerzustand. Genau dieser Fall
ist getestet: `skalierung-1000-test.js` §14 zeigt, dass ein Profil entweder einen **belegten**
Stand oder einen **ausdrücklich leeren** Stand bekommt, nie einen erfundenen.

**c) Was weiterläuft.** Die Katalogquellen des Pakets (echte Herausgeber-Feeds), der gesamte
Bestand an bereits verstandenen Vorgängen, Matching, Entscheidungen, Aufgaben und
Kalenderfunktionen. Helmut wird bei einem Google-Ausfall **dünner**, nicht blind — aber die
personenbezogene Lage („was steht heute über mich in den Nachrichten") fällt vollständig weg.

**d) Welche Absicherung später nötig ist** (bewusst nicht in diesem Sprint gebaut):

1. **Ein zweiter Nachrichtenweg** für dieselbe Suchsemantik, damit die Personensuche nicht an
   einem Anbieter hängt. Das ist eine Produkt- und Kostenentscheidung, keine reine
   Technikentscheidung — deshalb hier nur benannt.
2. **Anbieterkennzeichnung am Auftrag**, damit ein Ausfall pro Anbieter messbar und pro
   Anbieter abschaltbar wird. Die Warteschlange trägt dafür bereits das Feld `payload.quelle`.
3. **Sichtbarer Leerzustand im Briefing**, der den Ausfall benennt („keine Personensuche
   verfügbar"), statt still weniger zu liefern.

## 14 · Vierter echter Befund: Briefing lag vor seinen eigenen Abrufen

Beim 1000-Profile-Durchlauf mit vollständiger **Belegkette** (neu in diesem Sprint) fiel auf:
bei gleichmäßiger Streuung der Fälligkeiten über das ganze 24-Stunden-Fenster lag die
Briefingmaterialisierung von **37 der 1 000 Mandate zeitlich vor ihren eigenen Abrufen**.
Ergebnis war ein ehrlicher, aber vollständig vermeidbarer Leerzustand.

**Behoben** in `lib/helmut/source-demand.js`: Projektion und Briefing liegen jetzt in
**Phasenfenstern** statt gleichverteilt — Projektion ab 50 %, Briefing ab 75 % des Fensters.
Die Streuung innerhalb des Abschnitts bleibt deterministisch (kein `Math.random`), damit die
Planung idempotent bleibt und die Last nicht auf eine Minute fällt.
**Danach: 1 000 von 1 000 belegte Briefingstände, 0 unnötige Leerzustände.**
Regressionsschutz: `source-demand-test.js` §9.7–9.11.

## 15 · Sprint „V3-Anbindung und skalierbares KI-Budget" (2026-08-08, zweiter Sprint des Tages)

### Die Lücke, die geschlossen wurde

Der Warteschlangenpfad endete faktisch **beim Rohdokument**. `document_understanding` hatte
einen getesteten Handler — aber **niemand reihte den Auftrag ein**. Der Compiler erzeugte
`source_fetch`, `mandate_projection` und `briefing_materialization`, sonst nichts. Aus einem
Abruf wurde damit nie ein Vorgang, und aus keinem Vorgang je ein Briefinginhalt. Das war im
vorigen Sprint als offener Punkt benannt, aber es war mehr als ein offener Punkt: es war die
Stelle, an der die Kette riss.

**Jetzt geschlossen:** `handleSourceFetch` reiht nach erfolgreicher Persistenz einen
Verstehensauftrag ein. Der Schlüssel ist der **Inhaltsfingerabdruck** der Dokumentmenge
(`rd-<hash>` aus `dedup.toRawDocumentRow`), **nicht** die Zeit. Derselbe Artikel erzeugt
morgen dieselbe Kennung, dieselbe Kennungsmenge denselben Auftragsschlüssel — und
`helmut_enqueue_job` legt ihn kein zweites Mal an. Ein Aktualitätsfenster im Schlüssel wäre
hier falsch gewesen: es hätte denselben Artikel in jedem Fenster erneut zum Verstehen
angemeldet.

**Drei Schichten gegen doppeltes Verstehen**, bewusst übereinander, jede einzeln geprüft:

| Schicht | Mechanismus | Nachweis |
|---|---|---|
| Auftrag | Idempotenzschlüssel = Inhaltsfingerabdruck | `v3-anbindung-test.js` §2 |
| Budget | Reservierung an den `result_key` gebunden | `v3-anbindung-test.js` §6 · `llm-budget-fairness-test.js` B1/B4 |
| V3 | `existing` → `duplicate`, kein Modellaufruf | `v3-anbindung-test.js` §3 |

Die dritte Schicht ist die eigentliche Garantie. Die beiden darüber sparen die Arbeit, die
sie sonst leisten müsste.

### Reihenfolge über Fälligkeit **und** Prüfung

Weil Planung und Verarbeitung getrennt sind, ist die Reihenfolge Abruf → Verstehen →
Projektion → Briefing nicht mehr durch den Programmablauf gesichert. Die Phasenfenster
(Projektion ab 50 %, Briefing ab 75 %) sind eine gute Näherung — aber eine **Annahme über
die Laufzeit**. `helmut_jobs_offen` macht daraus eine Prüfung: ein Projektions- oder
Briefingauftrag fragt, ob seine Vorbedingungen im selben Fenster wirklich fertig sind.

Zwei Feinheiten, die keine sind:

* **Ein endgültig gescheiterter Abruf zählt nicht als offen.** Ein Briefing darf nicht ewig
  auf einen Abruf warten, den Google nie beantwortet — es entsteht dann mit weniger Belegen
  oder als ehrlicher Leerzustand. `helmut_jobs_offen` liefert `offen` und `fehlgeschlagen`
  getrennt, damit der Unterschied zwischen „noch nicht fertig" und „wird nie fertig"
  überhaupt benennbar ist.
* **Warten ist kein Fehlversuch.** `helmut_defer_job` nimmt den Versuch zurück. Ohne das
  hätte reines Warten die Versuche verbraucht und ein völlig gesunder Auftrag wäre nach
  fünf Runden Warten den Fehlertod gestorben — mit einem Fehlertext, der eine Störung
  behauptet, die es nie gab.

### Das skalierbare KI-Budget

`helmut_reserve_llm_call` (Migration 20260717) löst genau ein Problem: zwei gleichzeitige
Aufrufe dürfen den Deckel nicht gemeinsam überschreiten. Drei andere löst es nicht, und
genau die sind bei 1 000 Mandaten entscheidend:

1. **Idempotenz je Ergebnis.** Eine Wiederholung zog bisher eine zweite Reservierung. Bei
   fünf erlaubten Versuchen ist das ein Faktor-5-Kostenrisiko.
2. **Zwei Deckel in einem Schritt.** Mandantenanteil und globales Limit wurden nacheinander
   geprüft — dazwischen kann ein anderer Worker.
3. **Absturz zwischen Reservierung und Abschluss.** Wer sie gezogen hat und ob daraus je ein
   Ergebnis wurde, stand nirgends.

`llm_reservations` + `helmut_reserve_llm_result` lösen alle drei. Eine Zeile je
**beabsichtigtem Ergebnis**, beide Deckel in **einer** Transaktion, und ein Absturz lässt die
Reservierung bewusst gebucht — der Wiederholungslauf findet sie über den `result_key` wieder
und läuft **ohne zweite Buchung** weiter. Das ist dieselbe konservative Linie, die schon
20260717 gewählt hat: eine Rückgabe nach dem Modellaufruf wäre die teure Variante.

**Die Verteilung** (`lib/helmut/llm-budget-fair.js`) ist getrennt von der Durchsetzung, weil
es zwei verschiedene Anforderungen sind: die Politik muss offline prüfbar sein, die
Durchsetzung atomar. Drei Regeln:

1. **Notwendig vor optional** — erst bekommt *jedes* fällige Mandat seine Pflicht, dann erst
   bekommt *irgendein* Mandat Kür.
2. **Gleicher Anteil** statt „wer zuerst kommt".
3. **Rotation statt Verhungern** — der Versatz wandert mit dem Tag.

### Ein Befund beim Bauen: eine Rotation, die langsamer wandert als sie verbraucht

Die erste Fassung ließ den Versatz um **eins** pro Tag wandern. Gemessen mit 1 000 Mandaten
und 50 Plätzen: nach 30 Tagen waren **921 Mandate nie bedient** worden, während die
vordersten 30-mal drankamen. Das ist exakt das Verhungern, das die Rotation verhindern soll.
**Behoben:** der Versatz wandert um die Zahl der Plätze. Danach ist bei Deckel 100 nach
25 Tagen jedes der 1 000 Mandate mindestens einmal dran gewesen (min 1, max 2).

### Ein zweiter Befund: eine Idempotenzzusage, die zur Budgetleckage wurde

Beim zweiten Lauf desselben Auftrags greift oben die Idempotenz (`wiederverwendet`), unten
meldet V3 folgerichtig „0 verarbeitet" — und die ursprüngliche, längst **verbrauchte**
Reservierung wurde daraufhin zurückgegeben. Der Zähler wäre gesunken, obwohl der Aufruf beim
**ersten** Mal wirklich stattgefunden hat. Gefunden von `v3-anbindung-test.js` §6.3.
**Behoben:** eine wiederverwendete Reservierung wird nie freigegeben.

### Anbieterneutralität (Phase 6)

Jeder Abrufauftrag trägt jetzt eine **Anbieterkennzeichnung**, rein aus dem Host abgeleitet
(`news.google.com` → `google-news`, sonst der Host). Additiv, verhaltensneutral. Ohne sie ist
ein Anbieterausfall weder messbar noch gezielt abschaltbar — man sähe nur, dass „Abrufe
scheitern".

Zwei Attrappen, beide geprüft (`anbieterausfall-test.js`):

| | Anbieter erreichbar | Anbieter ausgefallen |
|---|---|---|
| Abruf | gelingt, Dokumente entstehen | scheitert, wird **als gescheitert geführt** |
| Fehlertext | — | benennt den Anbieter |
| Verstehen | wird eingereiht | **kein** Auftrag aus einem gescheiterten Abruf |
| Briefing | mit Belegen | **ehrlicher Leerzustand**, kein ruhiger Tag |
| Betriebsstatus | — | zeigt die endgültigen Fehler |
| Katalogquellen | laufen | **laufen unverändert weiter** |

**Empfehlung zum zweiten Anbieter** (Produktentscheidung, hier nicht getroffen):

* **Aufwand:** gering für die Auftragsform (sie trägt den Wechsel bereits — Weg + Anbieter,
  kein Google-Sonderfall), erheblich für die Suchsemantik. Eine zweite Quelle muss dieselbe
  Frage beantworten können („was steht heute über diese Person in den Nachrichten"), sonst
  ist sie kein Ersatz, sondern ein zweiter, anderer Dienst.
* **Nutzen:** heute hängen **100 %** der profileigenen Abrufe an einem Anbieter. Bei einem
  Ausfall fällt die personenbezogene Lage vollständig weg — genau das Produktversprechen.
* **Risiko:** laufende Kosten, ein zweiter Vertrag, ein zweiter Rechtsrahmen und doppelte
  Quellenpflege. Bei 1 000 Mandaten und 4 713 Abrufen/Tag ist das keine Randgröße.
* **Zwischenschritt ohne neuen Anbieter:** den Ausfall im Briefing **benennen** („keine
  Personensuche verfügbar") statt still weniger zu liefern. Das ist billig und beseitigt die
  gefährlichste Eigenschaft des Ausfalls — dass er wie ein ruhiger Tag aussieht.

### Der instabile Berliner Test — Ursache bewiesen

Der im vorigen Sprint einmal beobachtete Ausfall von `berlin-e2e-vertrag-test.js` (J8) ist
**reproduziert und erklärt**.

* **Einzelbetrieb:** 78 Läufe, 0 Fehlschläge.
* **Unter CPU-Knappheit** (8 Dauerlast-Prozesse): **1 Fehlschlag in 25 Läufen**.
* **Ursache:** `saveMatchingResults` im gemeinsamen Testgerüst stempelte `created_at`
  **innerhalb** der Schleife — jede Zeile bekam ihre eigene Millisekunde. Auf einer schnellen
  Maschine fiel das nie auf (alle Zeilen in derselben Millisekunde, stabile Sortierung ⇒
  Einfügereihenfolge). Unter Last rutschte der Stapel über eine Millisekundengrenze,
  `order=created_at.desc` drehte die Reihenfolge um, und die Rangfolge kippte.
* **Das war untreu zur Datenbank:** `now()` ist in Postgres innerhalb einer Transaktion
  **konstant**. Ein Stapel-Upsert vergibt für alle Zeilen denselben Zeitstempel.
* **Behoben** im Testgerüst: ein Zeitstempel für den ganzen Stapel. Danach **70 Läufe unter
  bis zu zwölffacher Fremdlast, 0 Fehlschläge**.

**Der ernstere Teil des Befunds, ausdrücklich OFFEN:** weil alle Zeilen eines Laufs denselben
`created_at` tragen, ist die Reihenfolge in `listMatchingResults` **in Production undefiniert**
— Postgres darf sie in beliebiger Heap-Reihenfolge liefern. Die Lage hängt damit an einer
Reihenfolge, die nichts mit Relevanz zu tun hat, und war bisher nur zufällig richtig.
**Nicht geändert**, und zwar bewusst: jede Korrektur hier entscheidet, **welcher Vorgang dem
Mandatsträger zuerst angezeigt wird**. Das ist eine Produktentscheidung, keine Aufräumarbeit.
Ein Versuch mit `order=created_at.desc,id.desc` wurde gebaut, **getestet und wieder
zurückgenommen**: er macht die Reihenfolge zwar deterministisch, aber deterministisch
*willkürlich* — im Brandenburg-Test stand danach der falsche Vorgang vorn.
**Empfehlung:** die Lage sollte gespeicherte Matchingergebnisse nach ihrer **Relevanz**
ordnen, nicht nach der Schreibzeit. Das ist eine Zeile Code und eine Gründerentscheidung.

> **Stand-Nachtrag 2026-09-01 (500-Mandate-Reifesprint, F-E2E geschlossen; nachgeschärft im
> Korrektursprint am selben Tag, Befund 1):** Die Empfehlung ist per Betreiberauftrag
> umgesetzt. Der erste Wurf (`created_at.desc,rank.asc.nullslast,id.asc`) war noch
> unzureichend: `created_at` **friert beim ersten Auftreten eines Paares ein** (Migration
> `20260728_matching_audit.sql`, Schritt 2 — der Publish-Upsert setzt es nie neu, den Rang
> dagegen bei jedem Lauf). Rein lesend belegt (01.09.): die 140 aktuellen Production-Zeilen
> aus 7 Läufen tragen **gemischte** created_at-Werte (bis 18 verschiedene je Lauf) mit
> **588 Rang-Zeitstempel-Inversionen** — eine created_at-primäre Ordnung ist damit keine
> aktuelle Relevanzordnung. `listMatchingResults` sortiert die **aktuelle Projektion**
> deshalb jetzt **rank-primär**: `rank.asc.nullslast,id.asc` (der Rang jeder aktuellen Zeile
> stammt vom jüngsten bestätigenden Lauf; ranglose Altzeilen ans Ende; `id.asc` macht die
> Ordnung total). Der Historien-/Auditzugang (`includeAbgeloest: true`) bleibt zeitlich
> (`created_at.desc,rank.asc.nullslast,id.asc`). Der oben verworfene `id.desc`-Versuch
> bleibt verworfen — der Rang, nicht die Kennung, ist der fachliche Schlüssel. Zusätzlich
> stempelte der **Audit-Publish-Pfad** des Testgerüsts (`publishRun`) weiterhin je Zeile —
> der 2026-08-08 nur in `saveMatchingResults` behobene Fehler; korrigiert auf einen
> Stapelzeitstempel, der wie in Postgres **einfriert** (Bestandszeilen behalten ihren
> Erstauftritts-Zeitstempel). Belege: 24 Gleichstandsgruppen (31.08.), beide Landes-E2E-Suiten
> je **20/20 grün unter 4-facher CPU-Fremdlast**; Regression rot-vor/grün-nach:
> `scripts/matching-reihenfolge-test.js`
> (`docs/betrieb/500-mandate-theoretische-bereitschaft-2026-09-01.md`).

### Was dieser Sprint an Zahlen belegt

| | Wert | Grad |
|---|---|---|
| Dokumente im 1000-Profile-Durchlauf | 5 336 | lokal simuliert |
| daraus entstandene Vorgänge | 998 | lokal simuliert |
| KI-Aufrufe | **998** (= Zahl der Vorgänge, nicht der Dokumente) | lokal simuliert |
| Verdichtung durch Clustering | **Faktor 5,3** | lokal simuliert |
| Profile mit belegtem Briefing | **1 000 von 1 000** | lokal simuliert |
| gleichzeitige Doppelvergaben | **0** | praktisch lokal bewiesen |
| Deckelüberschreitung bei 8 gleichzeitigen Prozessen | **0** (50 von 50 exakt) | praktisch lokal bewiesen |
| Mandantenanteil überschritten | **0** | praktisch lokal bewiesen |

## Anhang · Betriebsstatus abfragen

```
GET /api/ops/jobqueue?seitMinuten=1440
Authorization: Bearer <CRON_SECRET>
```

Rein lesend, 0 Writes, 0 KI, keine Nutzdaten. Liefert `pfadAktiv`, `zustand`
(`gruen`/`warnung`/`kritisch`/`unbekannt`), `befunde` und die 14 Kennzahlen.

**Schwellen:** Warnung ab 18 h Rückstand (**vor** 24 h), kritisch ab 24 h **oder** bei einem
endgültigen Fehler. Eine **nicht lesbare** Warteschlange meldet `unbekannt` — ausdrücklich
nicht `gruen` (CLAUDE.md §4.4).
