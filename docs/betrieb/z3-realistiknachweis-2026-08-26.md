# Realistiknachweis Z3 — 25 / 50 / 100 Mandate (Sprint 2026-08-26)

**Ausgangscommit:** `ade1674` (= `main`, Merge PR #271) · **Branch:** `claude/load-test-mandate-proof-wtlew0`
**Kanonische Skalierungsdatei bleibt** [`skalierung-25-50-100.md`](skalierung-25-50-100.md).
Diese Datei ist die **Belegdatei des realistischen Nachweises** und ergänzt dort §0.1 Punkt 3
(„Supabase unter realistischer Last ist ungeprüft") und die vier verstreuten Z3-Fehlstellen.

> **Kurzfassung in drei Sätzen.** Der Nachweis ist **als Z3a erbracht und als Z3 offen**:
> echte Fachhandler, echter Anwendungsweg zur Datenbank über HTTP/PostgREST/PostgreSQL 17.6,
> echtes Netz, echte Modellaufrufe über echtes TLS — aber **lokale Anbieter** statt Google und
> Azure. Der fehlende Rest (**Z3b**) ist kein Werkzeugproblem, sondern eine Freigabefrage:
> echte Anbieteraufrufe in Lasthöhe wären ein Massen‑Crawl (CLAUDE.md §5) und echte
> Modellaufrufe kosten Geld. **Production wurde nicht verändert** — kein Schreibvorgang, keine
> Migration, kein Flag, keine Env, kein Cron, kein manueller Lauf.

---

## 1 · Was Z3a von Z2 unterscheidet

Der synthetische Nachweis Z2 (`scripts/skalierung-stufen-lasttest.js`, PR #270) misst die
**Warteschlangenmechanik**. Er ersetzt dafür die komplette Handlerabbildung durch eine
Attrappe und spricht die Datenbank über einen `psql`-Fremdprozess an. Genau die drei Fragen,
die die Skalierungsdoku als offen führt, bleiben dort unberührt.

| | **Z2** (synthetisch, gemergt) | **Z3a** (dieser Sprint) |
|---|---|---|
| Fachhandler | Attrappe (`setTimeout`, meldet Erfolg) | **echt** — `HANDLER` aus `scalable-pipeline.js` |
| Weg zur Datenbank | `psql`-Fremdprozess | **HTTP → PostgREST 12.2.3 → PostgreSQL 17.6** |
| Netz | keins | **echtes HTTP je Quelle**, echte Zeitgrenzen |
| Parsen | keins | **echter RSS-Parser** des Produktionscodes |
| Verstehen | keins | **echter Modellaufruf über echtes TLS**, echter `usage`-Block |
| Projektion / Briefing | keins | **echte Produktionsfunktionen** (inkl. `server.js __buildV3Briefing`) |
| Betriebsform | 4 Dauer-Worker | **Cron-Slots** wie in Production (eigener Prozess je Slot) |
| Budget-Gate, Reservierung | inert | **aktiv** (`helmut_reserve_llm_call`) |
| KI-Menge / Token | 0, unmessbar | **gemessen** |

**Der Anwendungsweg ist der eigentliche Zugewinn.** Production spricht ausschließlich
`POST {SUPABASE_URL}/rest/v1/rpc/<funktion>` mit Dienstschlüssel
(`lib/helmut/storage.js`, `performSupabaseFetch`/`jobQueueRpc`). Z3a fährt genau diesen Weg:
ein lokales Tor schneidet `/rest/v1` ab und reicht an PostgREST weiter — dieselbe Aufteilung,
die Supabase zwischen seinem API-Tor und PostgREST hat. Statuscode, Rumpf und Fehler stammen
unverändert von PostgREST; das Tor fälscht nichts und misst nur.

---

## 2 · Aufbau der lokalen Plattform

| Baustein | Umsetzung | Beleg |
|---|---|---|
| Datenbank | **PostgreSQL 17.6** (Production-Hauptversion), eigener Cluster, eigenes Datenverzeichnis, `trust` nur auf 127.0.0.1 | `@embedded-postgres/linux-x64@17.6.0-beta.15`, Sitzungswerkzeug außerhalb des Arbeitsbaums |
| Schema | `supabase/schema.sql` **plus alle 31 Vorwärtsmigrationen** | `skalierung-z3-realistiklauf.js`, `baueLokalesSchema` |
| Datenschnittstelle | **PostgREST 12.2.3**, HS256-Dienstschlüssel, Rollen `anon`/`authenticated`/`service_role`, `auth`-Schema nachgebildet | `startePostgrest`, `VORBEREITUNG_SQL` |
| Anbieterursprung | echter HTTP-Server: RSS, Latenz, `429` + `Retry-After`, `503`, ausbleibende Antwort | `scripts/fixtures/z3-plattform.js` |
| KI-Endpunkt | echter **HTTPS**-Server im Zuschnitt der Azure-Responses-API, eigene ephemere Zertifizierungsstelle, `usage`-Block, Kostenriegel | ebenda |
| Worker | ein **eigener Node-Prozess je Slot** — wie eine Serverless-Ausführung | `scripts/fixtures/z3-slotlauf.js` |

**Zwei benannte Abweichungen des lokalen Schemas**, beide ohne Bezug zum Warteschlangenpfad:

1. **`pgvector` fehlt** — die eingebettete PostgreSQL bringt kein `pg_config` mit, die
   Erweiterung ist damit nicht baubar. `vector(256)` wird lokal zu `jsonb`, der
   ivfflat-Index und die RPC `match_knowledge_objects` entfallen. Der Warteschlangenpfad
   benutzt sie nicht: `lib/helmut/matching.js` rechnet die Merkmalsvektoren in JavaScript.
2. **Supabase-Rollen und `auth`-Schema** werden nachgebildet, damit die Migrationen
   unverändert laufen.

**Der Slotlauf fährt dieselbe Reihenfolge wie `server.js runCronUeberWarteschlange`:**
Laufquittung → planen → Wiedervorlage → Outbox-Abgleich und Weckversand (bei `shadow` ein
No-Op) → `worker-betrieb.durchlauf` mit echten Handlern → Laufquittung abschließen.
**Ein benannter Unterschied:** der Cron deckelt den Planungsanteil zusätzlich auf
`min(60 s, 25 % des Slotbudgets)`; der Prüfstand tut das nicht. Gemessen bleibt die Planung
weit darunter (Werte in §10), der Unterschied ist damit ohne Wirkung — er wird trotzdem
genannt, weil er den Prüfstand an dieser Stelle nachsichtiger macht als Production.
Die Produktionsflaggen sind gesetzt wie in Production (`CURRENT_STATE` §4):
`HELMUT_SCALABLE_PIPELINE=on`, `HELMUT_JOB_DISPATCH_MODE=shadow`, `HELMUT_V3_STORE=1`,
`HELMUT_SOURCE_MODE=on`, `HELMUT_V3_MATCHING=1`, `HELMUT_MATCHING_AUDIT=on`,
`HELMUT_VERSTEHEN_CAS=on`, `HELMUT_ATOMIC_LOCK=on`, Worker **4/25/25**.

---

## 3 · Die eine benannte Ersetzung — und was sie kostet

Die Quellenadressen entstehen im Produktionscode **fest** auf `news.google.com`
(`lib/helmut/scheduler.js`, `personNewsSource`/`mandateNewsSources`). Ein Lasttest gegen
diesen Anbieter wäre ein **Massen-Crawl** und damit ohne Freigabe verboten (CLAUDE.md §5).
Der Slotlauf schreibt deshalb **beim Planen den Ursprungs-Host** der Quellenadresse auf den
lokalen Ursprung um; Pfad und Abfrage bleiben unverändert, das Quellobjekt bleibt sonst
identisch, und **Handler, Crawler, Parser und Persistenz laufen unverändert**.

**Was diese eine Ersetzung ungeprüft lässt — vollständig und ohne Beschönigung:**

- `isGoogleNewsUrl()` prüft den Hostnamen (`lib/helmut/crawler.js`). Bei `127.0.0.1` ist er
  falsch. Damit laufen **nicht**: die Browser-Kennung für Google, das **Google-News-Gate**,
  der **Circuit-Breaker** (`google-news-hardening.js`, ≥10 Beobachtungen und ≥60 % Fehlerquote)
  und die **Artikel-URL-Auflösung** (`batchexecute`-POST je Meldung).
- Die Artikel-URL-Auflösung ist zugleich der größte unbekannte Aufschlag auf die Zahl der
  Netzabrufe: Z3a misst **einen** GET je Abrufweg; der Google-Pfad erzeugt zusätzlich bis zu
  einen POST je Meldung und bis zu sechs Weiterleitungen je Abruf.
- **Echte Antwortzeiten, echte Drosselgrenzen und echte Fehlerquoten eines fremden Anbieters**
  bleiben unbekannt. Der lokale Ursprung liefert *eingestellte* Latenz, *eingestellte*
  Drosselung und *eingestellte* Ausfälle — er beweist, wie Helmut damit umgeht, nicht, wie
  oft es vorkommt.

---

## 4 · Der Inhalt des lokalen Ursprungs — und warum seine Form entscheidend ist

Der Ursprung liefert **strukturechtes, ausdrücklich als synthetisch gekennzeichnetes**
Material (Kategorie `synthetischer-lasttestinhalt`, Kunstwörter, keine Aussage über reale
Personen oder Vorgänge). Aufgezeichnete fremde Antworten wären weder rechtlich noch fachlich
tragfähig gewesen.

**Zwei empirisch belegte Fallen, beide in diesem Sprint aufgelaufen und behoben:**

1. **Gemeinsamer Fülltext legt alles zu EINEM Vorgang zusammen.** Die Vorgangsbildung
   (`lib/helmut/vorgang-identity.js`) wertet Wörter ab **fünf** Zeichen als Anker. Ein
   erklärender Fließtext („synthetischer Lasttestvorgang", „Nachrichtenmeldung") erzeugt
   damit in jedem Dokument dieselben starken Anker. **Gemessen (Eichlauf, 5 Mandate):**
   345 Rohdokumente ergaben **2** Vorgänge und **3** Modellaufrufe — der Lauf hätte die
   KI-Menge um mehr als das Fünfzigfache unterschätzt. Der Fülltext besteht seitdem
   ausschließlich aus Wörtern bis vier Zeichen; die einzigen Anker sind zwei
   vorgangseigene Kunstwörter. Die Werte danach stehen in §10.
2. **Ein zu kleiner gemeinsamer Themenvorrat erzeugt künstlich totale Überschneidung.**
   Hing der Themenschlüssel nur an (Abrufzähler, Eintragsnummer), lieferten **alle** Quellen
   dieselben zwölf Themen; 564 Einträge ergaben nur 105 Dokumente. Der Schlüssel hängt
   seitdem am Abrufweg mit — die Überschneidung entsteht durch **Kollision** in einem Vorrat
   fester Größe, so wie sich Suchergebnisse verschiedener Mandate teilweise überschneiden.

**Die drei Stellschrauben werden ausgewiesen, weil jede abgeleitete Zahl an ihnen hängt:**
`geteilteThemen` (Vorratsgröße), `ueberschneidungAnteil`, `dokumenteJeVorgang` und zusätzlich
`frischeAnteil` (Anteil wirklich neuer Meldungen je Abruf — ein echter Feed liefert beim
zweiten Abruf desselben Tages ganz überwiegend dieselben Meldungen).

**Eichung.** Die einzige belegte Production-Messgröße ist die Kostenmessung: **rund 113
Verstehensaufrufe je Betriebstag bei fünf Mandaten** — und zwar **gedeckelt**, also eine
Untergrenze des tatsächlichen Bedarfs. Die Stufe 5 wird deshalb mitgefahren; ihre gemessene
Zahl ist der Prüfstein dafür, dass die Mengen der Stufen 25/50/100 nicht aus der Luft
gegriffen sind. Sie ist eine **Eichung**, keine Vorhersage.

> **Ergebnis der Eichung.** Der Lauf über **zwei Tagesrunden** ergab bei fünf Mandaten
> **177 Modellaufrufe**, also rund **88 je Betriebstag** — gegen einen belegten
> Production-Boden von **113**. Der Prüfstand liegt damit in derselben Größenordnung und eher
> **unter** dem realen Bedarf. Für eine Kapazitätsaussage ist das die richtige Richtung: die
> Zahlen der Stufen 25/50/100 sind damit eher zu niedrig als zu hoch.

---

## 5 · Sicherheit: was den Lauf von Production trennt

**Vier Riegel, jeder für sich fail closed.**

1. `scripts/lokal.js` entfernt die Production-Kennungen aus der Kindprozess-Umgebung.
2. Der **Laufzeitriegel** (`scripts/lokaler-netzschutz.js`) weist jede nicht-lokale
   Verbindung ab — er wird an keiner Stelle abgeschaltet, auch nicht über
   `HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG`.
3. Der Nachweislauf bricht ab, sobald eine Production-Kennung sichtbar ist oder der
   Datenbankhost nicht lokal ist.
4. Der Slotlauf bricht zusätzlich ab, wenn Datenbanktor, KI-Endpunkt oder Anbieterursprung
   nicht auf `127.0.0.1` zeigen, und wenn die lokale Zertifizierungsstelle fehlt.

### 5.1 Belegte Lücke, in diesem Sprint geschlossen

`scripts/lokal.js` räumte **`AZURE_OPENAI_KEY` und `AZURE_OPENAI_ENDPOINT` nicht** aus der
Kindprozess-Umgebung. Azure ist der **tatsächliche** Produktionsanbieter für KI
(`lib/helmut/ai.js`, `isAzure()`; Vorrang laut [`env-inventar.md`](env-inventar.md) §38) —
die reale Zugangsdatei wurde also an **jeden** Testkindprozess weitergereicht. Gehalten hat
allein die Laufzeitsperre, also **ein** Riegel, wo der Entwurf zwei vorsieht. Ein Handlauf
mit umgangener Laufzeitsperre hätte kostenpflichtige Aufrufe auf dem Production-Konto
ausgelöst. Die drei Namen (`AZURE_OPENAI_KEY`, `AZURE_OPENAI_API_KEY`,
`AZURE_OPENAI_ENDPOINT`) stehen jetzt in `REINE_ZUGANGSDATEN`; Gegenprobe in
`scripts/z3-realistiklauf-vertrag-test.js` §A.

### 5.2 Production-Berührung dieses Sprints

**Ausschließlich rein lesend und aggregiert** — und auch das nur zur Einordnung. Es gab
**keinen** Schreibvorgang, **keine** Migration, **keine** Env-, Flag- oder Cron-Änderung,
**keinen** manuellen Cron-, Worker-, Watchdog- oder Gesundheitslauf, **keine** Testmandate,
**keinen** Import, **kein** Deployment und **keine** Änderung am historischen roten
Cron-Beleg. Der morgige Fünfernachweis des WhatsApp-Bots ist unberührt.

---

## 6 · Zwei Fehler im BESTEHENDEN Z2-Werkzeug — gefunden und behoben

Beide betreffen den bereits gemergten synthetischen Nachweis (PR #270). Keiner macht dessen
Datenbankstand falsch; beide machen seine **Quittungen** und die **Wirksamkeit seiner Probe**
schwächer, als die Beschreibung behauptet.

| # | Fehler | Wirkung | Behebung |
|---|---|---|---|
| **F-Z2-1** | `scripts/fixtures/lasttest-worker.js` las `auftrag.tenant_id`; der Motor übergibt `normalisiereAuftrag(...)` mit **`tenantId`** (camelCase) | Die Einspritzung von Fehler- und Langsam-Mandat fiel **immer** auf `payload.mandatsId` zurück — ein Feld, das nur `mandate_projection` und `briefing_materialization` tragen. Das „Fehlermandat" scheiterte deshalb **nicht bei jedem Versuch**, sondern nur bei einem Teil seiner Aufträge; daher die in allen drei Stufen konstante Zahl **2 endgültige Fehler**. | beide Schreibweisen werden gelesen |
| **F-Z2-2** | `scripts/fixtures/psql-sitzung.js` lieferte `status`; der Motor liest `abschluss.neuerStatus` | Ein endgültig gescheiterter Auftrag wurde in der **Workerbilanz** als `wiederholt` verbucht, `endgueltigFehlgeschlagen` blieb **strukturell 0** — obwohl die Ablage `fehlgeschlagen` trug. Die Ablage war richtig, die Meldung nicht (CLAUDE.md §4.10). | `neuerStatus` wird geliefert, `status` bleibt als Altname erhalten |

Beide sind durch `scripts/z3-realistiklauf-vertrag-test.js` §H testgesichert — samt Gegenprobe
gegen den Produktionscode, damit die Namen nicht wieder auseinanderlaufen.

---

## 7 · Der tragende Befund: die Vorbedingungsprüfung hat keinen Mandatsfilter

**Verifizierte Tatsache (aus dem Code gelesen, nicht aus diesem Lauf).**
`public.helmut_jobs_offen(p_fenster, p_typen)` (Migration
`20260808_jobqueue_abhaengigkeiten.sql`) zählt offene Aufträge über **Aktualitätsfenster und
Typ** — `where (p_fenster is null or j.freshness_window = any(p_fenster)) and (p_typen is null
or j.job_type = any(p_typen))`. Ein Mandatsbezug kommt in der Funktion nicht vor. Solange also
**irgendein** `source_fetch` im Fenster offen ist, wird **jede** Projektion und **jedes**
Briefing zurückgestellt, auch die vollkommen gesunder Mandate.

**Gemessener Wert (dieser Lauf).** Eine Zurückstellung mit Grund `vorbedingung-offen` ist für
sich genommen **kein Befund** — sie ist die Reihenfolgezusage bei der Arbeit. Nachgewiesen ist
die Kopplung erst dort, wo am Ende eines Slots die **einzige** offene vorgelagerte Arbeit dem
Fehlermandat gehört, während nachgelagerte Arbeit gesunder Mandate offen ist und im Slot mit
`vorbedingung-offen` zurückgestellt wurde. Für diese Aufträge existiert dann kein anderer
Kandidat mehr, auf den sie gewartet haben können. Genau das zählt Kriterium **Z22**; die Zahlen
je Stufe stehen in §10.5.

**Der Gegenbeweis: jede Stufe lief zweimal.** Einmal mit dem Fehlermandat, einmal ohne
(`HELMUT_Z3_FEHLERMANDAT=aus`) — bei identischer Mandatszahl, identischen Quellen, identischen
Slotzeiten und identischem Ursprungsinhalt. Jeder Unterschied zwischen beiden Läufen kann
deshalb **nur** am Fehlermandat liegen. Verglichen werden die Slotdauer, die Zahl der
Zurückstellungen und die am Tagesende liegengebliebene Arbeit **gesunder** Mandate (§10.5).

**Eine erste, verworfene Fassung dieses Befundes.** Das Kriterium zählte zunächst nur Slots, in
denen **überhaupt nichts** erledigt wurde, und meldete sonst „keine Kopplung beobachtet" —
also **grün**. Das war falsches Grün: ein Slot, der die geteilten Abrufe abarbeitet, aber jede
Projektion gesunder Mandate zurückstellt, hat `erledigt > 0` und fiel durch das Raster. Die
Fassung hätte selbst dann Entwarnung gegeben, wenn jede nachgelagerte Arbeit gesunder Mandate
blockiert gewesen wäre — und sie widersprach dem, was dieser Abschnitt behauptete. Beides ist
korrigiert: das Kriterium misst jetzt den oben beschriebenen Alleinstand, und ohne Kontrolllauf
entscheidet es **gar nicht** (offener Befund), statt zu raten.

**Zwei Einschränkungen, damit der Befund nicht überdehnt wird:**

1. Der Prüfstand setzt einen **dauerhaft nicht antwortenden** Weg ein — der Abruf läuft jedes
   Mal in die volle Zeitgrenze (`CRAWLER_TIMEOUT_MS`). In Production federt der
   **Google-Circuit-Breaker** genau das ab: nach genügend Fehlbeobachtungen scheitert der
   Abruf **sofort** statt nach einer Zeitüberschreitung, die Versuche sind schneller
   aufgebraucht und das Fenster der Blockade ist kürzer. Dieser Weg ist im Prüfstand
   **nicht aktiv** (§3) — die Kopplung ist dort also **ausgeprägter** als heute in Production.
2. Die Kopplung selbst ist davon **unberührt**: sie liegt in der Abfrage, nicht in ihrer Dauer.
   Dass sie in Production heute weniger auffällt, ist eine Frage der Bremsstrecke, nicht des
   Bremsdefekts. Mit mehr Mandaten steigt die Wahrscheinlichkeit, dass **irgendein** Mandat
   eine gestörte Quelle hat — und OP-15 führt bereits **29 von 42** Personensuchen, die im
   Betriebszeitraum nie geliefert haben.

**Warum Z2 das nicht zeigen konnte:** dort meldete die Attrappe sofort einen Fehler, das
Fehlermandat war innerhalb desselben Laufs terminal, und die Einspritzung traf wegen F-Z2-1
ohnehin nur einen Teil seiner Aufträge. Das Z2-Kriterium K13 („Das fehlerhafte Mandat
beeinträchtigt gesunde Mandate nicht") ist damit **nicht widerlegt, aber auch nicht belegt** —
es misst unter Bedingungen, unter denen die Kopplung gar nicht entstehen kann.

> **Einordnung.** Das ist **kein Fehler dieses Laufs**, sondern eine Eigenschaft des heutigen
> Motors. Sie ist für die Skalierung erheblich: je mehr Mandate, desto größer die Chance, dass
> irgendeines eine gestörte Quelle hat — und desto häufiger warten alle anderen. Eine Abhilfe
> (Vorbedingung je Mandat statt global) ist **nicht Teil dieses Sprints**: sie berührt den
> Fachvertrag der Reihenfolgezusage und gehört in eine eigene Entscheidung.

---

## 8 · Was Z3a beweist und was Z3b noch braucht

| Aussage | Stand nach diesem Sprint |
|---|---|
| Der echte Fachpfad trägt die Menge (Abruf → Verstehen → Projektion → Briefing) | **Z3a belegt** |
| Der echte Anwendungsweg zur Datenbank (HTTP/PostgREST/PostgreSQL 17.6) trägt die Menge | **Z3a belegt** |
| Wiederholungen, Zeitüberschreitungen, Drosselungsantworten werden korrekt behandelt | **Z3a belegt** (generischer Pfad) |
| Mandatstrennung im Lastbetrieb | **Z3a belegt** (keine mandatsfremde Zuordnung) |
| KI-Menge und Tokenmenge je Stufe | **Z3a gemessen** — Token **geschätzt** aus gemessener Zeichenzahl |
| Der Google-Sonderweg (Gate, Breaker, Artikelauflösung) | **offen (Z3b)** |
| Echte Anbieterantwortzeiten, echte Drosselgrenzen | **offen (Z3b)** |
| Echte Modellantwortzeiten, echte Tokenzählung, echte Rechnung | **offen (Z3b)** |
| **Supabase** unter Last (Pooler, Free-Plan-Grenzen, echte Latenz) | **offen (Z3b)** — lokal geprüft ist PostgREST, nicht Supabase |
| Burstverhalten der Anwendung gegen die Datenschnittstelle | **Z3a gemessen** — siehe Hinweis unten |
| Vercel-Laufzeitwirklichkeit (Fluid Compute) | **offen**, unverändert |

| Kopplung an ein gestörtes Mandat | **Z3a gemessen** — gegen einen Kontrolllauf ohne Fehlermandat (§10.5) |

**Z3a ist kein kleiner Stichprobentest**: jede Stufe wird über **zwei volle Tagesrunden**
(sechs reguläre Cron-Slots, jeder mit seiner Production-Cron-Zeit) vollständig geplant und
gefahren, und jede Stufe zusätzlich ein **zweites Mal** als Kontrolllauf ohne Fehlermandat —
acht Läufe insgesamt. Aber Z3a ist auch **kein vollständiges Z3** — und wird in Code,
Testausgabe und dieser Datei nirgends so genannt.

> **Nebenbefund, der bei Supabase zählen wird.** Das Datenbanktor misst nicht nur die Zahl der
> Anfragen, sondern auch, wie viele **gleichzeitig** unterwegs sind. Die Spitze wächst mit der
> Stufe deutlich schneller als die reine Anfragezahl (Werte in §10.3): die Anwendung feuert
> ihre Lesezugriffe in **Stößen**. Lokal fängt PostgREST das mit einem Verbindungsvorrat von 30
> ab — die Anfragen warten dort, statt zu scheitern. Ob der **Supabase-Pooler des Free-Plans**
> dieselbe Stoßhöhe wegsteckt, ist damit **nicht** gezeigt; genau das ist der Kern des offenen
> Plattformnachweises (§8) und der bereits in
> [`skalierung-25-50-100.md`](skalierung-25-50-100.md) §4.3a benannten Verbindungsfrage.

---

## 9 · Preisbasis — vier verschiedene Dinge, streng getrennt

| Größe | Wert | Herkunft |
|---|---|---|
| **Preistabelle im Code** | `gpt-5-mini` **0,25 / 2,00 USD** je 1 Mio. Ein-/Ausgabetoken | `lib/helmut/storage.js`, `LLM_PRICE_DEFAULTS` — **ausdrücklich als unbelegter Schätzwert deklariert** (`llmPriceProvenance()` meldet `unbelegt-schaetzwert`) |
| **Sekundärquelle** | Azure `gpt-5-mini` **0,25 / 2,00 USD** je 1 Mio. | Websuche 2026-08-26. **Die offizielle Azure-Preisseite ist aus dieser Sitzung nicht zu öffnen** — `azure.microsoft.com` ist vom Egress-Proxy gesperrt (403). Damit ist die Zahl **nicht eigenhändig belegt**. |
| **Gemessene Tokenmenge** | siehe §10 | am lokalen KI-Endpunkt gemessene **Zeichenzahl**, umgerechnet mit dem sichtbaren Teiler **3,8 Zeichen/Token** — also **geschätzt**, nicht vom Anbieter gezählt |
| **Berechnete Kosten** | siehe §10 | Produkt aus beidem — **eine Größenordnung, kein Rechnungsbetrag** |

**Ein OpenAI-Listenpreis ist kein Azure-Preis.** Die Zahlen stimmen nach der Sekundärquelle
überein, aber `buildLlmUsageRecord` schreibt kein `provider`-Feld
([`kostenmessung.md`](kostenmessung.md) K-5) — Helmut kann heute nicht einmal belegen, über
welchen Anbieter ein gegebener Aufruf lief. **Die Preisbasis bleibt offen (F7).**

---

## 10 · Messwerte

*(Die Zahlen dieses Abschnitts stammen aus dem maschinenlesbaren Bericht des Laufs. Sie
werden nach jedem Lauf ersetzt, nie ergänzt.)*

**Ankunft und Abfluss** werden hier **unmittelbar an der Ablage** gemessen: Ankunft ist die
Zahl der je Slot **neu** eingereihten Aufträge (Rückgabewert von `planeArbeit`, gegen
`helmut_jobs` gegengeprüft), Abfluss die Zahl der je Slot **abgeschlossenen**. Die
Ankunftskennzahl **F9** (`helmut_job_ankunft`, Migration `20260825101500`) wird dafür **nicht
gebraucht** und ist **nicht angewendet**; sie hat im Anwendungscode bis heute keinen Aufrufer
(`betriebsstatus` und `/api/ops/jobqueue` lesen `helmut_job_metrics`). Was F9 leisten würde,
ist dieselbe Aussage **im laufenden Production-Betrieb** — nicht in diesem Prüfstand.

**Jeder Slot plant mit SEINER Cron-Zeit, nicht mit der Wanduhr.** Die Bedarfsverdichtung legt
Arbeit in Aktualitätsfenster fester Breite (`lib/helmut/source-demand.js`, `fensterKennung`):
geteilte Abrufe in **8-Stunden**-Fenster, mandatsgebundene Arbeit in ein **24-Stunden**-Fenster.
Welches Fenster ein Slot plant, hängt damit an seiner Uhrzeit — und die drei Production-Abflüsse
04:00, 16:00 und 20:00 UTC liegen in **zwei verschiedenen** 8-Stunden-Fenstern. Slot 1–3 sind
deshalb diese drei Zeiten **eines** Tages, jeder weitere Slot ist der nächste Abfluss des
**folgenden** Tages.

> **Belegter Messfehler, deshalb korrigiert.** Ohne diese Vorgabe plante der Prüfstand mit der
> Wanduhr: ob zwei Slots dasselbe Fenster sahen, hing davon ab, ob der Lauf zufällig eine
> Fenstergrenze kreuzte. Im Eichlauf plante derselbe zweite Slot einmal **0** und einmal **144**
> zusätzliche Aufträge. Die Ankunftsmenge wäre also vom Startzeitpunkt des Laufs abhängig
> gewesen — und damit als Kapazitätsaussage wertlos.

**Zeitfortschritt zwischen den Slots.** Der kleinste Abstand zweier Production-Abflüsse ist
**vier Stunden**; alle Wartezeiten des Motors sind kürzer (Vorbedingung 120 s, Budgetwarten 1 h,
Wiederholungs-Backoff höchstens 30 min). Der Prüfstand fährt die Slots in Sekunden
hintereinander und zieht deshalb zwischen zwei Slots **ausschließlich die Fälligkeit** vor —
kein Status, kein Versuchszähler, kein `created_at`. **Ehrliche Grenze:** weil `created_at`
unverändert bleibt, laufen die **absoluten** Aufgabefristen (Vorbedingung 6 h, Budget 48 h) in
diesem verdichteten Lauf nicht ab. Der Prüfstand ist an dieser Stelle **nachsichtiger** als
Production, nicht strenger.

**Was „Rückstau abgebaut" hier heißt.** Weil jeder Slot neue Arbeit anmeldet, ist „alles fertig"
nicht die richtige Frage. Ausgewiesen werden deshalb **zwei** Größen: ob am Ende überhaupt noch
etwas offen war (Z20) und ob der Rückstau **von Tagesrunde zu Tagesrunde wächst** (Z20b). Nur
die zweite trägt eine Aussage über Tragfähigkeit.

<!-- MESSWERTE-BEGINN -->
**Lauf vom 2026-08-26** · Slotbudget 290.000 ms (= `maxDuration` 300 s) · Worker 4/25 · reguläre Tagesslots 3 · KI-Deckel **offen** (Bedarfsmessung; der Kostenriegel des lokalen Endpunkts lag bei 40.000 Aufrufen).

### 10.1 Mengen, Laufzeiten, Abfluss

| Mandate | Aufträge | Slots | langsamster Slot | erledigt | endgültige Fehler | offen am Ende | davon aus **früheren** Tagesfenstern |
|---:|---:|---:|---:|---:|---:|---:|---:|
| **5** | 271 | 6 | 143.097 ms | 259 | 1 (Fehlermandat 1, fremd 0) | 11 | 0 |
| **25** | 1.090 | 6 | 152.509 ms | 1.038 | 1 (Fehlermandat 1, fremd 0) | 51 | 0 |
| **50** | 1.801 | 6 | 180.340 ms | 1.699 | 1 (Fehlermandat 1, fremd 0) | 101 | 0 |
| **100** | 2.596 | 6 | 215.504 ms | 2.394 | 1 (Fehlermandat 1, fremd 0) | 201 | 0 |

„Offen am Ende“ ist **kein** Rückstand: der letzte Slot eines Tages stellt regelmäßig Arbeit des laufenden Tages zurück, die der erste Slot des nächsten Tages aufnimmt — genau wie in Production. Rückstand ist ausschließlich die letzte Spalte.

### 10.2 Fachpfad: Dokumente, Vorgänge, Netzabrufe

| Mandate | Netzabrufe | davon gedrosselt (429) | davon Ausfall (503) | Anbieter p95 | Rohdokumente | Vorgänge | Dok./Vorgang |
|---:|---:|---:|---:|---:|---:|---:|---:|
| **5** | 181 | 8 | 3 | 195 ms | 409 | 172 | 2.38 |
| **25** | 842 | 35 | 16 | 194 ms | 822 | 382 | 2.15 |
| **50** | 1.400 | 54 | 26 | 193 ms | 1.067 | 563 | 1.90 |
| **100** | 2.084 | 79 | 39 | 194 ms | 1.240 | 662 | 1.87 |

### 10.3 Datenbank über HTTP/PostgREST/PostgreSQL 17.6

| Mandate | HTTP-Anfragen | p50 | p95 | max | Transportfehler | Konflikte (409) | gleichzeitig max | PostgreSQL-Verbindungen (Spitze / aktiv / Grenze) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **5** | 4.992 | 3 ms | 73 ms | 160 ms | 0 | 0 | 151 | 25 / 1 / 100 |
| **25** | 20.240 | 4 ms | 161 ms | 311 ms | 0 | 0 | 349 | 27 / 2 / 100 |
| **50** | 42.566 | 80 ms | 458 ms | 682 ms | 0 | 0 | 900 | 32 / 3 / 100 |
| **100** | 73.789 | 151 ms | 696 ms | 1078 ms | 0 | 0 | 1435 | 32 / 3 / 100 |

### 10.4 KI-Menge, Token, berechnete Kosten

| Mandate | Modellaufrufe | Eingabetoken (geschätzt) | Ausgabetoken (geschätzt) | Token/Aufruf | Modelldauer p95 | **berechnete** Kosten |
|---:|---:|---:|---:|---:|---:|---:|
| **5** | 177 | 828.089 | 60.888 | 5.022 | 1764 ms | 0.3288 USD |
| **25** | 415 | 1.942.901 | 142.760 | 5.026 | 1764 ms | 0.7712 USD |
| **50** | 622 | 2.913.077 | 213.968 | 5.027 | 1763 ms | 1.1562 USD |
| **100** | 738 | 3.456.075 | 253.872 | 5.027 | 1763 ms | 1.3718 USD |

> **Der Deckel.** Der dokumentierte Production-Tagesdeckel ist **100** Modellaufrufe (davon 30 für das Verstehen reserviert). Die hier gemessene Nachfrage ist die Nachfrage **ohne** Deckel — sie sagt, was ein Tag verlangen würde, nicht was heute durchkäme.


### 10.5 Kontrolllauf: was das **eine** kranke Mandat kostet

Jede Stufe wurde **zweimal** gefahren — einmal mit dem Fehlermandat, einmal ohne (`HELMUT_Z3_FEHLERMANDAT=aus`). Mandatszahl, Quellen, Slotzeiten und Ursprungsinhalt sind identisch; **jeder Unterschied kann daher nur am Fehlermandat liegen**.

| Mandate | langsamster Slot ohne / mit | Zurückstellungen ohne / mit | liegengebliebene Arbeit **gesunder** Mandate ohne / mit | Slots, in denen **nur** das Fehlermandat vorgelagert offen war |
|---:|---:|---:|---:|---:|
| **5** | 74.187 ms / 143.097 ms (+68.910 ms) | 45 / 51 (+6) | 0 / 0 | 1 |
| **25** | 119.175 ms / 152.509 ms (+33.334 ms) | 246 / 255 (+9) | 0 / 0 | 1 |
| **50** | 172.424 ms / 180.340 ms (+7.916 ms) | 584 / 520 (−64) | 0 / 0 | 1 |
| **100** | 198.132 ms / 215.504 ms (+17.372 ms) | 1.146 / 1.160 (+14) | 0 / 0 | 1 |

Die letzte Spalte ist der **Nachweis** der Kopplung: ein Slot, an dessen Ende die einzige offene vorgelagerte Arbeit dem Fehlermandat gehörte, während nachgelagerte Arbeit gesunder Mandate offen war und im Slot mit `vorbedingung-offen` zurückgestellt wurde. Für diese Aufträge gibt es keinen anderen Kandidaten, auf den sie gewartet haben können.

**Wie die Spalten zu lesen sind — und wie nicht.**

* Die **Zurückstellungen** sind *kein* Kopplungsmaß. Bei 50 Mandaten fällt ihre Zahl mit dem
  Fehlermandat sogar (−64): das kranke Mandat verschiebt die Reihenfolge, in der die Slots
  ihre Arbeit sehen, und damit auch, wie oft ein Auftrag auf eine noch laufende Vorbedingung
  trifft. Die Spalte steht als Mengengerüst da, nicht als Beweis.
* Die **Slotdauer** ist der belastbar gemessene Preis. Er ist absolut am größten, wo am
  wenigsten anderes zu tun ist (5 Mandate: +68,9 s auf 74,2 s, also **+93 %**) und wird
  relativ kleiner, je mehr echte Arbeit den Slot ohnehin füllt (100 Mandate: +17,4 s auf
  198,1 s, also **+9 %**). Der tote Abrufweg kostet in jedem Slot dieselbe Zeitgrenze; nur
  fällt sie bei viel Arbeit weniger ins Gewicht.
* Die **liegengebliebene Arbeit** ist auf allen vier Stufen **0 gegen 0**. Das ist die
  wichtigste ehrliche Einschränkung dieses Befundes: die Kopplung ist nachgewiesen und sie
  kostet Zeit — sie hat aber in **keiner** der acht Läufe dazu geführt, dass Arbeit eines
  gesunden Mandats über den Tag hinaus liegen blieb. Wer aus diesem Nachweis „ein krankes
  Mandat legt den Betrieb lahm" liest, überdehnt ihn.

### 10.6 Kriterien je Stufe

**Korrektheits- und Sicherheitskriterien: 92 erfüllt, 0 nicht erfüllt.**

**Kapazitätsbefunde** (kein Fehler des Laufs, sondern sein Ergebnis):

| Befund | Stufe | erfüllt | Messwert |
|---|---:|---|---|
| Z20 Am Ende eines Tages liegt keine Arbeit eines FRUEHEREN Tages mehr | 5 | ja | nach Slot 6 (2026-08-27): 0 Auftraege aus frueheren Tagesfenstern offen · 11 Auftraege insgesamt offen (davon Arbeit des laufenden Tages, die der naechste Slot aufnimmt — das ist der Normalfall) |
| Z20b Der Rueckstau waechst nicht von Tag zu Tag (Toleranz: +2 Auftraege bzw. +10 %) | 5 | ja | nach Tag 1 (Slot 3) 10 offen · nach Tag 2 (Slot 6) 11 offen · Grenze 12 |
| Z21 Die Tagesarbeit der GESUNDEN Mandate fliesst in den drei regulaeren Tagesslots ab (§2a) | 5 | ja | nach Slot 6: 0 Auftraege gesunder Mandate aus frueheren Tagesfenstern offen · 6 Slots gefahren · langsamster Slot 143097 ms |
| Z22 Kein gesundes Mandat wird durch das fehlerhafte Mandat aufgehalten (gemessen gegen den Kontrolllauf ohne Fehlermandat) | 5 | **nein** | 1 Slot(e), in denen NUR noch das Fehlermandat vorgelagert offen war und gesunde Mandate nachgelagert warteten · 51 Zurueckstellungen mit Grund `vorbedingung-offen` (fuer sich genommen normal: Reihenfolgezusage) · Struktur: helmut_jobs_offen hat keinen Mandatsfilter (aus dem Code belegt, nicht aus diesem Lauf) · Vergleich mit/ohne Fehlermandat: liegengebliebene Arbeit gesunder Mandate 0 gegen 0 (+0) · Zurueckstellungen 51 gegen 45 (+6) |
| Z23 Die Nebenlaeufigkeit erzeugt keine nennenswerte Konfliktrate an der Datenbank | 5 | ja | 0 von 4.992 Anfragen (0.00 %) — Fremdschluesselkonflikte auf ko_document_links unter Parallelitaet 4; vom Wiederholungsweg aufgefangen |
| Z20 Am Ende eines Tages liegt keine Arbeit eines FRUEHEREN Tages mehr | 25 | ja | nach Slot 6 (2026-08-27): 0 Auftraege aus frueheren Tagesfenstern offen · 51 Auftraege insgesamt offen (davon Arbeit des laufenden Tages, die der naechste Slot aufnimmt — das ist der Normalfall) |
| Z20b Der Rueckstau waechst nicht von Tag zu Tag (Toleranz: +2 Auftraege bzw. +10 %) | 25 | ja | nach Tag 1 (Slot 3) 51 offen · nach Tag 2 (Slot 6) 51 offen · Grenze 57 |
| Z21 Die Tagesarbeit der GESUNDEN Mandate fliesst in den drei regulaeren Tagesslots ab (§2a) | 25 | ja | nach Slot 6: 0 Auftraege gesunder Mandate aus frueheren Tagesfenstern offen · 6 Slots gefahren · langsamster Slot 152509 ms |
| Z22 Kein gesundes Mandat wird durch das fehlerhafte Mandat aufgehalten (gemessen gegen den Kontrolllauf ohne Fehlermandat) | 25 | **nein** | 1 Slot(e), in denen NUR noch das Fehlermandat vorgelagert offen war und gesunde Mandate nachgelagert warteten · 255 Zurueckstellungen mit Grund `vorbedingung-offen` (fuer sich genommen normal: Reihenfolgezusage) · Struktur: helmut_jobs_offen hat keinen Mandatsfilter (aus dem Code belegt, nicht aus diesem Lauf) · Vergleich mit/ohne Fehlermandat: liegengebliebene Arbeit gesunder Mandate 0 gegen 0 (+0) · Zurueckstellungen 255 gegen 246 (+9) |
| Z23 Die Nebenlaeufigkeit erzeugt keine nennenswerte Konfliktrate an der Datenbank | 25 | ja | 0 von 20.240 Anfragen (0.00 %) — Fremdschluesselkonflikte auf ko_document_links unter Parallelitaet 4; vom Wiederholungsweg aufgefangen |
| Z20 Am Ende eines Tages liegt keine Arbeit eines FRUEHEREN Tages mehr | 50 | ja | nach Slot 6 (2026-08-27): 0 Auftraege aus frueheren Tagesfenstern offen · 101 Auftraege insgesamt offen (davon Arbeit des laufenden Tages, die der naechste Slot aufnimmt — das ist der Normalfall) |
| Z20b Der Rueckstau waechst nicht von Tag zu Tag (Toleranz: +2 Auftraege bzw. +10 %) | 50 | ja | nach Tag 1 (Slot 3) 101 offen · nach Tag 2 (Slot 6) 101 offen · Grenze 112 |
| Z21 Die Tagesarbeit der GESUNDEN Mandate fliesst in den drei regulaeren Tagesslots ab (§2a) | 50 | ja | nach Slot 6: 0 Auftraege gesunder Mandate aus frueheren Tagesfenstern offen · 6 Slots gefahren · langsamster Slot 180340 ms |
| Z22 Kein gesundes Mandat wird durch das fehlerhafte Mandat aufgehalten (gemessen gegen den Kontrolllauf ohne Fehlermandat) | 50 | **nein** | 1 Slot(e), in denen NUR noch das Fehlermandat vorgelagert offen war und gesunde Mandate nachgelagert warteten · 520 Zurueckstellungen mit Grund `vorbedingung-offen` (fuer sich genommen normal: Reihenfolgezusage) · Struktur: helmut_jobs_offen hat keinen Mandatsfilter (aus dem Code belegt, nicht aus diesem Lauf) · Vergleich mit/ohne Fehlermandat: liegengebliebene Arbeit gesunder Mandate 0 gegen 0 (+0) · Zurueckstellungen 520 gegen 584 (-64) |
| Z23 Die Nebenlaeufigkeit erzeugt keine nennenswerte Konfliktrate an der Datenbank | 50 | ja | 0 von 42.566 Anfragen (0.00 %) — Fremdschluesselkonflikte auf ko_document_links unter Parallelitaet 4; vom Wiederholungsweg aufgefangen |
| Z20 Am Ende eines Tages liegt keine Arbeit eines FRUEHEREN Tages mehr | 100 | ja | nach Slot 6 (2026-08-27): 0 Auftraege aus frueheren Tagesfenstern offen · 201 Auftraege insgesamt offen (davon Arbeit des laufenden Tages, die der naechste Slot aufnimmt — das ist der Normalfall) |
| Z20b Der Rueckstau waechst nicht von Tag zu Tag (Toleranz: +2 Auftraege bzw. +10 %) | 100 | ja | nach Tag 1 (Slot 3) 201 offen · nach Tag 2 (Slot 6) 201 offen · Grenze 222 |
| Z21 Die Tagesarbeit der GESUNDEN Mandate fliesst in den drei regulaeren Tagesslots ab (§2a) | 100 | ja | nach Slot 6: 0 Auftraege gesunder Mandate aus frueheren Tagesfenstern offen · 6 Slots gefahren · langsamster Slot 215504 ms |
| Z22 Kein gesundes Mandat wird durch das fehlerhafte Mandat aufgehalten (gemessen gegen den Kontrolllauf ohne Fehlermandat) | 100 | **nein** | 1 Slot(e), in denen NUR noch das Fehlermandat vorgelagert offen war und gesunde Mandate nachgelagert warteten · 1160 Zurueckstellungen mit Grund `vorbedingung-offen` (fuer sich genommen normal: Reihenfolgezusage) · Struktur: helmut_jobs_offen hat keinen Mandatsfilter (aus dem Code belegt, nicht aus diesem Lauf) · Vergleich mit/ohne Fehlermandat: liegengebliebene Arbeit gesunder Mandate 0 gegen 0 (+0) · Zurueckstellungen 1160 gegen 1146 (+14) |
| Z23 Die Nebenlaeufigkeit erzeugt keine nennenswerte Konfliktrate an der Datenbank | 100 | ja | 0 von 73.789 Anfragen (0.00 %) — Fremdschluesselkonflikte auf ko_document_links unter Parallelitaet 4; vom Wiederholungsweg aufgefangen |

<!-- MESSWERTE-ENDE -->

---

## 11 · Was für Z3b nötig wäre — und was davon **nicht** geht

Der offene Teil ist **keine Werkzeugfrage**. Die Werkzeuge stehen; es fehlt eine Entscheidung.
Dieser Abschnitt trennt sauber, was verantwortbar ist und was nicht.

### 11.1 Der Anbieterteil im Lastmaßstab ist **nicht** verantwortbar — und wird nicht vorgeschlagen

Rechnung aus den gemessenen Auftragsmengen: je `source_fetch` **ein** GET; auf dem
Google-Pfad kommen bis zu **ein POST `batchexecute` je Meldung** (Artikel-URL-Auflösung) und
bis zu sechs Weiterleitungen hinzu. Bei zwölf Meldungen je Antwort ist das rund **13×** die
lokal gemessene Abrufzahl. Auf die Stufe 100 hochgerechnet liegt der Tagesbedarf damit im
**fünfstelligen Bereich an Anfragen gegen `news.google.com`** — ein **Massen-Crawl** im Sinne
von CLAUDE.md §5 und eine Belastung eines fremden Dienstes, die weder durch ein Testinteresse
gedeckt noch mit seinen Nutzungsbedingungen vereinbar ist.

**Deshalb wird ein Lasttest gegen echte Quellenanbieter hier ausdrücklich NICHT beantragt.**
Er bleibt auch mit Freigabe der falsche Weg.

### 11.2 Was stattdessen möglich ist — zwei eng begrenzte Messungen

Beide ersetzen **eingestellte** Parameter des Z3a-Laufs durch **gemessene**. Damit wird aus
Z3a kein Z3, aber der verbleibende Unterschied schrumpft auf das, was ohne fremde Last nicht
zu haben ist.

| # | Messung | Umfang | Weg | Kosten |
|---|---|---|---|---|
| **M1** | echte Antwortzeit, echte Drosselschwelle, echte Fehlerquote eines Quellenanbieters | **Größenordnung eines normalen Betriebstages der heutigen 5 Mandate**, nicht der Laststufen | der bereits freigegebene, secret-freie Actions-Weg mit Host-Allowlist (Muster: `profil-quellen-verifikation.yml`) | **0 USD** |
| **M2** | echte Modell-Antwortzeit, **echte** Tokenzählung (`usage`), echtes Fehlerverhalten | **fest gedeckelte Zahl echter Aufrufe** mit produktionstypischem Prompt | Azure OpenAI, Deployment wie Production | kostenpflichtig, siehe §11.3 |

Danach wird der Z3a-Lauf mit den gemessenen Werten **wiederholt** — gleiches Werkzeug,
gleiche Kriterien, nur belegte statt gesetzter Parameter.

### 11.3 Die Freigabeanfrage — vollständig, in einer Vorlage

<!-- FREIGABE-BEGINN -->

**Gegenstand: M2 — echte Modellaufrufe, fest gedeckelt.** M1 (echter Quellenanbieter) braucht
**keine** Freigabe und **kein** Geld; er läuft über den bereits freigegebenen, secret-freien
Actions-Weg und ist unabhängig davon zu starten.

| # | Punkt | Angabe |
|---|---|---|
| 1 | **Teststufen** | keine. M2 ist eine **Messung**, kein Lasttest: die Stufen 25/50/100 laufen unverändert gegen den lokalen Endpunkt. Gemessen wird ausschließlich, **wie sich ein echter Aufruf verhält**. |
| 2 | **Netzabrufe gegen Quellenanbieter** | **0**. Ein Lasttest gegen Quellenanbieter wird ausdrücklich **nicht** beantragt (§11.1). |
| 3 | **KI-Aufrufe, konservativ maximal** | **60** erfolgreiche Aufrufe · **höchstens 120** Aufrufe insgesamt (ein voller Wiederholungsspielraum). Harter Riegel im Werkzeug, fail-closed. |
| 4 | **Erwartete Tokenmenge** | aus dem Z3a-Lauf gemessen: rund **4.600 Eingabe-** und **340 Ausgabetoken** je Aufruf ⇒ 60 Aufrufe ≈ **0,28 Mio. Eingabe-** und **0,02 Mio. Ausgabetoken**; bei 120 Aufrufen das Doppelte. |
| 5 | **Preisbasis** | `gpt-5-mini` **0,25 / 2,00 USD** je 1 Mio. Ein-/Ausgabetoken. **Herkunft: nicht eigenhändig belegt** (§9) — Codewert und Sekundärquelle stimmen überein, die offizielle Azure-Seite ist aus dieser Sitzung gesperrt. |
| 6 | **Erwartete Kosten** | **≈ 0,11 USD** (60 Aufrufe) |
| 7 | **Absoluter Höchstbetrag** | **1,00 USD**. Er ist mit dem Riegel aus Zeile 3 auch dann nicht erreichbar, wenn die Preisbasis um den Faktor 4 danebenliegt. |
| 8 | **Anbieter und Domains** | **ausschließlich** der in Production konfigurierte Azure-OpenAI-Endpunkt (`AZURE_OPENAI_ENDPOINT`), Pfad `/openai/v1/responses`. Keine weitere Domain. |
| 9 | **Datenbankumgebung** | **keine**. M2 berührt keine Datenbank — weder Production noch lokal. |
| 10 | **Zugangsdaten** | Es gibt **keine nicht-produktiven Azure-Zugangsdaten**. M2 benutzt zwangsläufig den **Production-Schlüssel**. Berührt werden damit das **Kostenkonto** und der **Tagesdeckel** — **nicht** Production-Daten, nicht die Datenbank, nicht die App. |
| 11 | **Erwartete Gesamtdauer** | **unter 10 Minuten**. |
| 12 | **Abbruchgrenzen** | Abbruch bei: erreichter Aufrufobergrenze · erstem Fehler, der kein Anbieterfehler ist · zwei aufeinanderfolgenden `429` · jeder Abweichung der Antwortform · Überschreiten von 5 Minuten. Kein automatischer Neuversuch über die Obergrenze hinaus. |
| 13 | **Production** | bleibt **unverändert**: kein Schreibvorgang, keine Migration, kein Flag, keine Env, kein Cron, kein Import, kein Deployment. Der einzige Abdruck ist der **Verbrauch im KI-Tagesbudget** — deshalb ist der Zeitpunkt Teil der Freigabe. |
| 14 | **Benötigte Freigabe, wörtlich** | „**Ich gebe bis zu 120 echte Modellaufrufe gegen den Production-Azure-Endpunkt mit einem Höchstbetrag von 1,00 USD frei, ausgeführt außerhalb der Cron-Zeiten, ohne jede Änderung an Production-Daten, -Konfiguration oder -Deployment.**" |

**Was mit dem Ergebnis geschieht.** Die gemessene Antwortzeitverteilung und das gemessene
Verhältnis `usage`-Token zu Zeichen ersetzen im Z3a-Lauf die beiden gesetzten Parameter
(Modelllatenz, Teiler 3,8 Zeichen/Token). Danach wird der Lauf wiederholt — gleiches Werkzeug,
gleiche Kriterien. **Auch das ergibt kein vollständiges Z3**: der Anbieterteil (§11.1) bleibt
offen und bleibt es auch, solange ein Lasttest gegen fremde Dienste die falsche Antwort ist.

<!-- FREIGABE-ENDE -->

### 11.4 Was ohne jede Freigabe schon jetzt möglich ist

**M1 kostet nichts und braucht keine Gründerentscheidung** — der Actions-Weg ist bereits
freigegeben und secret-frei. Er ist der schnellste sichere nächste Schritt: mit einer
gemessenen Antwortzeit, einer gemessenen Fehlerquote und einer beobachteten Drosselschwelle
lässt sich der Z3a-Lauf sofort mit belegten statt gesetzten Parametern wiederholen.

**M2 ist die einzige Position, die Geld kostet** — und sie kostet wenig, weil sie eine
Messung ist und kein Lasttest.

---

## 12 · Reproduktion

```
# lokale PostgreSQL 17.6 (Sitzungswerkzeug, nicht im Repository)
npm pack @embedded-postgres/linux-x64@17.6.0-beta.15
initdb -D <datenverzeichnis> -U helmut --auth=trust --encoding=UTF8 --locale=C
# listen_addresses = '127.0.0.1', port = 5434

# PostgREST 12.2.3 (Sitzungswerkzeug, nicht im Repository)
curl -sSL -o postgrest.tar.xz \
  https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz

HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5434 HELMUT_TEST_PG_USER=helmut \
HELMUT_Z3_POSTGREST=<pfad>/postgrest \
  node scripts/lokal.js scripts/skalierung-z3-realistiklauf.js
```

**Eine Stufe läuft in genau einem Prozess — bewusst ohne Teilstücke.** Ein früherer Entwurf
dieses Sprints konnte eine Stufe zerlegen (`HELMUT_Z3_SLOT_START`, `…_SLOTS_PRO_LAUF`,
`…_ZWISCHENLAUF`, `…_VORBERICHT`, `…_KEIN_RESET`) und nur das letzte Teilstück bewerten. Das
war **falsch**, und zwar auf die gefährliche Art: die Warteschlange steht in der Datenbank und
überlebt ein Teilstück — die **Messstellen tun das nicht**. Datenbanktor, Anbieterursprung und
KI‑Endpunkt sind Dienste *im Laufprozess* und starten mit jedem Teilstück bei null, ebenso die
Verbindungsabtastung. Der Schlussbericht hätte Netzabrufe, Modellaufrufe, Drosselungen,
Konfliktrate, Antwortzeiten und Verbindungsspitze **für die ganze Stufe behauptet und nur den
Schlussteil gemessen** — genau das falsche Grün, das dieser Nachweis ausschließen soll
(Mandat §11). Die Zerlegung wurde deshalb aus `scripts/skalierung-z3-realistiklauf.js`
**entfernt**, bevor eine Zahl aus ihr in dieses Dokument gelangt ist. *Belegter Anlass:
26.08., Stufe 50, Teilstück 1 — der Zwischenlaufpfad brach ohnehin mit einem
`ReferenceError` ab, was den Entwurf aufgedeckt hat.*

Der Wanduhrbedarf einer großen Stufe wird stattdessen dadurch getragen, dass der Lauf
**abgesetzt** gestartet wird (eigene Sitzung, eigener Ausgabekanal) und seine Abschrift selbst
schreibt (`HELMUT_Z3_LOG`):

```
setsid nohup env HELMUT_Z3_STUFEN=100 HELMUT_Z3_MAX_SLOTS=6 \
  HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5434 HELMUT_TEST_PG_USER=helmut \
  HELMUT_Z3_POSTGREST=<pfad>/postgrest \
  HELMUT_Z3_BERICHT=/pfad/stufe100.json HELMUT_Z3_LOG=/pfad/stufe100.txt \
  node scripts/lokal.js scripts/skalierung-z3-realistiklauf.js >/dev/null 2>&1 &
```

**Jede Stufe zweimal — sonst entscheidet Z22 gar nicht.** Zuerst der Kontrolllauf **ohne**
Fehlermandat, danach der Lauf **mit**, der den Kontrollbericht liest. Beide brauchen eine
**eigene** Testdatenbank (`HELMUT_Z3_PG_DB`), sonst löscht der zweite Lauf die Ablage des
ersten:

```
# 1 · Kontrolllauf
HELMUT_Z3_FEHLERMANDAT=aus HELMUT_Z3_PG_DB=helmut_z3_kontrolle \
HELMUT_Z3_BERICHT=/pfad/stufe100-ohne.json  … skalierung-z3-realistiklauf.js

# 2 · Lauf mit Fehlermandat, misst gegen den Kontrolllauf
HELMUT_Z3_PG_DB=helmut_z3_last HELMUT_Z3_VERGLEICH=/pfad/stufe100-ohne.json \
HELMUT_Z3_BERICHT=/pfad/stufe100.json       … skalierung-z3-realistiklauf.js
```

Fehlt `HELMUT_Z3_VERGLEICH`, meldet Z22 einen **offenen Befund** („in einem Einzellauf nicht
entscheidbar") — nie ein Grün.

Die Tabellen in §10 sind die zusammengestellten Zahlen der **acht** maschinenlesbaren Berichte
(`HELMUT_Z3_BERICHT`); jede Zelle steht so auch in genau einem dieser Berichte. Die Berichte
sind die Belege, die Tabellen nur ihre Ansicht.

Findet der Aufbau Sitzungen eines **abgebrochenen** Vorlaufs auf der Testdatenbank, beendet er
genau diese — nie andere — und **schreibt die Zahl in die Abschrift**; stilles Aufräumen gäbe
es hier nicht.

Ohne lokale PostgreSQL **oder** ohne PostgREST meldet der Lauf einen **ehrlichen Übersprung**
(„DER REALISTIKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT") und wird nie grün. Beide Werkzeuge
liegen außerhalb des Arbeitsbaums; es wurde **keine** Abhängigkeit in `package.json`
aufgenommen und **kein** Binärpaket eingecheckt.

Der Vertragstest `scripts/z3-realistiklauf-vertrag-test.js` läuft dagegen **ohne** Datenbank
und ist deshalb im Pflicht-CI-Gate.
