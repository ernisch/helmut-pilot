# Realistiknachweis Z3 — 25 / 50 / 100 Mandate (Sprint 2026-08-26)

**Ausgangscommit:** `ade1674` (= `main` am 26.08., Merge PR #271) · **Branch:** `claude/load-test-mandate-proof-wtlew0`
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
>
> *Der Absatz oben beschreibt den Sprint vom 26.08. Die Nachträge §13–§14 dokumentieren die
> spätere Entwicklung; seit dem 29.08. ist Z22 mit ausdrücklicher Betreiberfreigabe in
> Production angewendet (§14.6).*

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

## 7 · Der tragende Befund: die Vorbedingungsprüfung hatte keinen Mandatsfilter

> **Stand 26.08., abends — behoben auf dem Folgezweig.** Der hier beschriebene Befund ist mit
> `claude/z22-tenant-isolation-after-z3a` **geschlossen**: Migration
> `20260826190000_jobqueue_vorbedingung_mandatsfilter.sql` gibt `helmut_jobs_offen` ein
> optionales drittes Argument `p_mandat`, der Motor übergibt die Mandatskennung des fragenden
> Auftrags. Was danach gemessen wurde, steht in §13. Dieser Abschnitt beschreibt den Zustand
> **vor** der Korrektur und bleibt als Beleg erhalten.

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

> **Alle Zahlen dieses Abschnitts stammen aus den Läufen von PR #272 — also von *vor* der
> Z22-Korrektur.** Sie bleiben unverändert stehen, weil sie der Beleg dieses PR sind. Wo unten
> „Struktur: helmut_jobs_offen hat keinen Mandatsfilter" steht, beschreibt das den damaligen
> Zustand; er ist im Folgezweig behoben. Die Werte **nach** der Korrektur stehen in §13.5–§13.7.


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

---

## 13 · Nachtrag 26.08. abends — Befund Z22 behoben und gegengemessen

> Dieser Abschnitt gehört zum **Folgezweig** `claude/z22-tenant-isolation-after-z3a`
> (abhängiger Pull Request auf `claude/load-test-mandate-proof-wtlew0`). Er ändert an §1–§12
> nichts; §7 trägt oben den Hinweis, dass sein Befund hier geschlossen wird.

### 13.1 Was genau falsch war — enger als §7 es beschrieb

`helmut_jobs_offen(p_fenster, p_typen)` zählte über Aktualitätsfenster und Typ, ohne
Mandatsbezug. Nicht jede daraus folgende Blockade war falsch. Getrennt nach Auftragsklasse:

| Vorbedingung | Mandatsbezug | Blockade über Mandate hinweg |
|---|---|---|
| **Geteilter** `source_fetch` | `tenant_id is null` (`source-demand.js`: „GETEILTE Arbeit gehört KEINEM Mandat") | **richtig** — speist alle Mandate |
| `document_understanding` | bauartbedingt **immer** `tenant_id is null` (`scalable-pipeline.js`: „Ein Vorgang gehört keinem Mandanten") | **richtig** — bleibt global |
| **Persönlicher** `source_fetch` | `tenant_id = <mandat>` — die Namenssuche genau eines Mandats | **falsch** |
| `mandate_projection` | `tenant_id = <mandat>` — Vorbedingung des Briefings **desselben** Mandats | **falsch** |

Die letzten beiden Zeilen sind der Befund. Die zweite fehlte in §7 ganz: dort ist nur von
`source_fetch` die Rede, doch `briefing_materialization` wartet laut `VORBEDINGUNGEN` auch auf
`mandate_projection` — und die trägt **immer** ein Mandat. Ein hängendes Mandat hielt damit
nicht nur fremde Projektionen auf, sondern auch fremde Briefings.

**Ursache, nicht Absicht.** Die Funktion entstand für die Fenster- und Typdimension, als Helmut
faktisch einen Mandanten hatte. Die Mandatsdimension hat schlicht gefehlt. Beide Planungsstellen
setzen den Mandatsbezug ausdrücklich und kommentiert — die Zählung hat ihn nur nie gelesen.

### 13.2 Die Korrektur — kleinster Änderungssatz

1. **Migration** `20260826190000_jobqueue_vorbedingung_mandatsfilter.sql` (+ Rückweg):
   drittes Argument `p_mandat text default null`. Ohne Argument **verhaltensgleich**; mit
   Argument zählt sie globale Arbeit (`tenant_id is null`) **plus** die Arbeit dieses einen
   Mandats. Die Zählmenge selbst bleibt unangetastet: `offen` ist weiterhin
   `wartend + laeuft`, endgültig gescheiterte Aufträge zählen weiterhin bewusst nicht.
2. **`storage.jobQueueOffeneVorbedingungen`** nimmt `mandat` entgegen. Nur eine nicht leere
   Zeichenkette gilt; alles andere führt zur globalen Zählung — **mehr** Warten, nie weniger.
3. **`scalable-pipeline.vorbedingungOffen`** übergibt die Kennung aus der Spalte `tenant_id`
   des fragenden Auftrags. Die Nutzlast (`payload.mandatsId`) wird ausdrücklich **nicht** als
   Ersatz herangezogen: gefiltert wird nach der Spalte, und zwei Wahrheiten wären eine
   Einladung zum Auseinanderlaufen.
4. **In-Memory-Attrappe** wortgleich nachgezogen — eine Attrappe, die enger filtert als die
   Datenbank, meldete zu wenige Vorbedingungen.

**Kein neuer Index.** An PostgreSQL 17.6 gemessen (20 000 Zeilen): Zugriffsweg und
Ausführungszeit sind mit und ohne Filter identisch — `Bitmap Index Scan on
helmut_jobs_window_idx`, 1,481 ms gegen 1,397 ms. Der Mandatsfilter ist ein Nachvergleich auf
der bereits eingegrenzten Treffermenge.

### 13.3 Der Deployment-Riegel, der hier nötig war

Merge ist Deployment, Migrationen sind freigabepflichtig — der Code steht also **vor** der
Migration in Production. Ohne Vorkehrung hätte PostgREST den Aufruf mit unbekanntem Argument
mit `PGRST202` beantwortet, `jobQueueOffeneVorbedingungen` hätte `verfuegbar:false` gemeldet,
und `vorbedingungOffen` hätte **gar nicht mehr geprüft** — die Reihenfolgezusage wäre
**stillschweigend abgeschaltet** gewesen. Deshalb fragt der Code bei genau diesem Fehler
**einmal** ohne `p_mandat` nach und meldet `mandatsfilter-migration-fehlt`. Ohne angewendete
Migration gilt damit exakt das alte, konservativere Verhalten — nicht Ausfall.

**Das ist nicht behauptet, sondern gefahren** (§11 des Datenbanktests): echte PostgreSQL 17.6,
echtes PostgREST, Rückweg eingespielt, Schema neu eingelesen — und dann der *Anwendungscode*
gegen genau diesen Server. Gemessen: die alte Fassung antwortet auf den Aufruf mit `p_mandat`
mit **HTTP 404 / `PGRST202`**, `jobQueueOffeneVorbedingungen` liefert daraufhin
`verfuegbar: true`, `mandatsfilter: false`, `grund: mandatsfilter-migration-fehlt` und **genau
die alte, globale Zahl** (16 005 gegen 16 005). Die ganze Sicherung hängt an einer Annahme über
einen fremden Dienst — die lässt sich nicht durch Lesen prüfen, nur durch Fragen. Ihr erster
Testaufbau sprach versehentlich rohes PostgREST statt des `/rest/v1`-Tors an und meldete
deshalb einen Ausfall, den es nicht gab; erst mit dem Tor davor misst er den Produktionsweg.

### 13.4 Gegenbeispiele: vorher rot, nachher grün

`scripts/vorbedingung-mandatsfilter-test.js` (39 Prüfungen, ohne Netz und Datenbank, im
Pflicht-CI-Gate). Gegen den Stand **vor** der Korrektur, gemessen:

| Gegenbeispiel | vorher | nachher |
|---|---|---|
| 2.1 Fremder persönlicher Abruf blockiert Projektion nicht | **FAIL** (offen 1) | PASS |
| 2.3 Fremde Projektion blockiert Briefing nicht | **FAIL** (offen 1) | PASS |
| 2.5 Fremde Arbeit blockiert Narrativ nicht | **FAIL** (offen 1) | PASS |
| 2.6 Dauerhaft krankes Mandat hält keine Stufe eines gesunden auf | **FAIL** (alle drei blockiert) | PASS |
| 2.7 Gleichnamige Typen zweier Mandate werden nicht vermischt | **FAIL** (A sieht 2, B sieht 2) | PASS |
| 2.8 Gezählt wird geteilt + eigen | **FAIL** (offen 3 statt 2) | PASS |

§1 (globale Arbeit bleibt global) und §3 (Reihenfolge im eigenen Mandat) sind in **beiden**
Ständen grün — die Korrektur nimmt nichts weg, was gebraucht wird.

Der Datenbankteil (`scripts/vorbedingung-mandatsfilter-datenbank-test.js`, **34 Prüfungen**,
PostgreSQL 17.6) prüft zusätzlich: Migration vorwärts/rückwärts/erneut vorwärts, genau **eine**
Fassung (kein mehrdeutiger Aufruf), keine Rechte für `anon`/`authenticated`/`PUBLIC`, fester
`search_path`, `stable` + `security invoker` — und dass eine **leere** Zeichenkette als Mandat
kein Generalschlüssel ist.

### 13.5 Z3a erneut gefahren — 25, 50, 100, je mit und ohne Fehlermandat

Sechs Läufe, je zwei volle Tagesrunden, dieselbe lokale Plattform wie §2.

| Mandate | Aufträge | erledigt | endgültige Fehler | Wdh. | häng. Leases | Dubletten | Doppelabschluss | unbek. Vorgänge | Fairness | Rückstau T1 → T2 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|:--:|:--:|
| 25 | 1.105 | 1.053 | 1 (nur Fehlermandat) | 18 | 0 | 0 | 0 | 0 | 6–6 | 50 → 51 |
| 50 | 1.800 | 1.711 | 1 (nur Fehlermandat) | 24 | 0 | 0 | 0 | 0 | 6–7 | 91 → 88 |
| 100 | 2.597 | 2.408 | 1 (nur Fehlermandat) | 41 | 0 | 0 | 0 | 0 | 6–7 | 197 → 188 |

**Ergebnis je Stufe: 24 PASS · 0 FAIL · 0 offene Befunde.** Z22 ist damit auf allen drei Stufen
**geschlossen** — in PR #272 war es auf allen Stufen offen.

### 13.6 Der eigentliche Beweis: die Produktionsfunktion, je Slot zweimal gefragt

Das neue Kriterium **Z22a** fragt in jedem Slot dieselbe Funktion zweimal — einmal ohne Mandat
(die alte, mandatsblinde Sicht) und einmal mit einem **gesunden** Mandat — und prüft das
Ergebnis gegen die Rohtabelle, nicht gegen die Zusage der Funktion.

| Mandate | Slots mit Wirkung | Aufträge, auf die ein gesundes Mandat nicht mehr wartet | Abweichungen Funktion ↔ Ablage |
|---:|---:|---:|---:|
| 25 | 5 von 6 | 57 | **0** |
| 50 | 5 von 6 | 111 | **0** |
| 100 | 5 von 6 | 220 | **0** |

Am deutlichsten am Ende von **Slot 1**: global waren 7 / 10 / 17 vorgelagerte Aufträge offen,
ein gesundes Mandat sah **0**. Vor der Korrektur hätte es auf alle gewartet. Zu Beginn von Tag 2
(Slot 4) sieht ein gesundes Mandat rund 40 % weniger Vorbedingungen (193→146, 326→229, 489→292).

### 13.7 Vorher/nachher im Lastmaßstab — und was der Rest ist

| Mandate | langsamster Slot **ohne** Fehlermandat | **mit** Fehlermandat | Aufschlag |
|---:|---:|---:|---:|
| 25 (PR #272, ohne Filter) | 119.175 ms | 152.509 ms | **+28 %** |
| 25 (dieser Zweig) | 117.005 ms | 134.986 ms | **+15 %** |
| 50 (PR #272, ohne Filter) | 172.424 ms | 180.340 ms | **+4,6 %** |
| 50 (dieser Zweig) | 184.090 ms | 185.190 ms | **+0,6 %** |
| 100 (PR #272, ohne Filter) | 198.132 ms | 215.504 ms | **+8,8 %** |
| 100 (dieser Zweig) | 194.990 ms | 214.383 ms | **+9,9 %** |

**Ehrlich benannt: der Aufschlag verschwindet nicht vollständig, und bei 100 Mandaten ist er
im Rauschen unverändert.** Das ist erwartbar und **nicht** Z22. Was übrig bleibt, ist
**Arbeitszeit**, nicht Blockade: der tote Abrufweg des Fehlermandats läuft in jedem Versuch in
die volle Zeitgrenze (`CRAWLER_TIMEOUT_MS`) und belegt dabei einen der vier Arbeiter. Diese
Kosten sind durch `max_attempts` und die Zeitgrenze **begrenzt** und treffen nur die
Slotdauer, nicht die Vollständigkeit: liegengeblieben ist auf **keiner** Stufe Arbeit eines
gesunden Mandats (0 gegen 0), und die Fairness bleibt 6–6 bzw. 6–7 Abschlüsse je Mandat.
Ein einzelner Slotwert ist zudem verrauscht (die Läufe teilen sich eine Maschine); belastbar
ist die Richtung bei 25 und 50, nicht die zweite Stelle bei 100.

### 13.8 Was dieser Nachtrag **nicht** beweist

Unverändert offen bleibt alles aus §8: die Anbieter sind lokal, weder Google noch Azure
antwortet, geprüft ist PostgREST und nicht Supabase. **Z3 bleibt unvollständig, Z3b offen,
Z4 nicht erteilt, Z5 unverändert fünf reale Mandate.** Die Migration ist **nicht** auf
Production angewendet und bleibt freigabepflichtig *(Stand 26.08.; am 29.08. nach
ausdrücklicher Betreiberfreigabe angewendet — §14.6)*.

Und eine fachliche Grenze, die zur Korrektur selbst gehört: ein Mandat wartet jetzt nicht mehr
auf die **persönliche** Namenssuche eines anderen Mandats. Ein Dokument, das ausschließlich
diese fremde Suche gefunden hätte und zufällig auch zum eigenen Profil passt, kann damit erst
im nächsten Fenster in die eigene Lage kommen. Das ist bewusst in Kauf genommen: dieselbe
Abwägung trifft der Motor schon heute beim 7-Tage-Archivfenster („ein Briefing darf nicht auf
eine Hintergrundsuche mit Wochenkadenz warten") und bei der 6-Stunden-Obergrenze des Wartens.
Vorgänge bleiben persistent, das Matching liest gespeicherte Vorgänge — verloren geht nichts,
es kommt nur später.

## 14 · Nachtrag 28.08. — zwei Nachweislücken im Z22-Beleg geschlossen

Dieser Abschnitt gehört zu PR #273. Er korrigiert **nicht** den Befund Z22 selbst — der
bleibt behoben wie in §13 beschrieben — sondern **zwei Lücken im Nachweis dieses Befunds**.
Beide standen in derselben Ursache: der Datenbankteil lief nicht wirklich, und deshalb fiel
nicht auf, dass SQL und Attrappe an einer Stelle auseinanderliefen.

**Keine Production-Aktion.** Migration weiterhin nicht angewendet, kein Deployment, kein
Flag, keine Env, kein Cron, kein Import, keine echten Anbieteraufrufe, keine Kosten
*(Stand 28.08.; Z22 ist seit dem 29.08. in Production angewendet — §14.6)*. Der
gesamte Datenbankteil lief gegen eine **kurzlebige lokale PostgreSQL**, die für den Lauf
angelegt und danach verworfen wird; die Zeilen sind ausschließlich synthetisch.

### 14.1 Lücke 1 — der Datenbanknachweis meldete grün, ohne zu laufen

`scripts/vorbedingung-mandatsfilter-datenbank-test.js` beendete sich ohne
`HELMUT_TEST_PG_HOST` mit **Exit 0**. `scripts/run-offline-tests.js` kennt aber nur
`exit === 0` ⇒ `PASS`. Der kanonische Gesamtlauf zählte diesen Nachweis also als **grüne
Suite**, obwohl gegen die Datenbank nichts geprüft wurde — genau das falsche Grün, das
`CLAUDE.md` §4.4 verbietet. Die in §13 genannten „34 PASS" waren echt, stammten aber aus
einem **Handlauf auf einer Arbeitsmaschine**, nicht aus dem Merge-Gate.

Die Lösung folgt dem Muster, das im Repo für denselben Fall bereits existiert
(`browser-smoke-test.js`):

1. Der Nachweis steht jetzt in der **DENYLIST** von `run-offline-tests.js`. Ein stiller Skip
   kann dort keine Abdeckung mehr vortäuschen. Der Runner zählt dadurch **eine Suite
   weniger** (284 statt 285) — die Suite ist nicht verschwunden, sie läuft anderswo.
2. Er hat einen **eigenen Schritt im Pflichtjob „Syntax + Offline-Suiten"** mit einem
   kurzlebigen `postgres:17`-Dienst (Hauptversion wie Production 17.6). Der Schritt läuft
   über `scripts/lokal.js` (CLAUDE.md §6). **Kein neuer Required Check** — der Jobname
   bleibt unverändert.
3. `HELMUT_REQUIRE_PG=1` macht ihn **fail-closed**: fehlende oder unerreichbare Datenbank
   ist ein FEHLSCHLAG (Exit 1), kein Skip. Belegt, beide Wege:

| Lauf | Erwartung | Ergebnis |
|---|---|---|
| `HELMUT_REQUIRE_PG=1`, kein Host | Exit 1 | **Exit 1**, „FEHLSCHLAG: kein HELMUT_TEST_PG_HOST gesetzt" |
| `HELMUT_REQUIRE_PG=1`, Host auf totem Port 5999 | Exit 1 | **Exit 1**, „kein erreichbarer Server" |
| lokal ohne Pflicht und ohne Host | Exit 0, ehrlicher Skip | **Exit 0**, Skip ausdrücklich benannt |

`HELMUT_TEST_PG_HOST` wird **nur in diesem Schritt** gesetzt, nicht job-weit: sonst gingen
rund 35 weitere Datenbanksuiten unbeabsichtigt scharf.

**Dritter Befund, in derselben Lücke gefunden.** Der Nachweis legte die Supabase-Rollen nie
selbst an. `20260808_scalable_job_queue.sql` enthält unbedingte
`revoke … from public, anon, authenticated`; auf einem **frischen** Cluster bricht die
Basismigration deshalb mit `role "anon" does not exist` ab — hier reproduziert. Er lief
bisher nur, weil auf der Arbeitsmaschine eine **andere** Suite die Rollen bereits hinterlassen
hatte (Rollen sind clusterweit, die Testdatenbank wird jedes Mal neu erzeugt): eine stille
Abhängigkeit von der Laufreihenfolge. Der Nachweis legt `anon`, `authenticated`,
`service_role` und `authenticator` jetzt selbst an — wortgleich zu den übrigen
Datenbanksuiten.

### 14.2 Lücke 2 — leere `tenant_id` auf der Zeile: SQL und Attrappe waren uneins

`tenant_id` ist `text` **ohne** NOT-NULL und **ohne** Prüfbedingung
(`20260808_scalable_job_queue.sql` Z. 111). Eine Zeile mit `''` oder nur Leerzeichen ist
also möglich. Die beiden Umsetzungen behandelten sie **verschieden**:

| Stand | Regel auf der Zeilenseite | Zeile `tenant_id = ''` bei Filter auf ein Mandat |
|---|---|---|
| SQL (vorher) | `j.tenant_id is null` | **fiel heraus** — das Mandat wartete nicht mehr auf sie |
| Attrappe (vorher) | `z.tenant_id !== ""` | zählte mit, aber `'   '` galt als eigenes Mandat |
| **beide (jetzt)** | `nullif(btrim(…), '') is null` | **zählt global** — jedes Mandat wartet auf sie |

**Maßgeblich ist der sichere Production-Vertrag**, und der ist eindeutig: eine Zeile ohne
brauchbaren Mandatsbezug ist geteilte Arbeit. Weniger zu warten ist nie die sichere Seite —
dieselbe Richtung, die §13 für die leere Kennung als **Argument** bereits festhält. Die SQL-
Seite lag auf der unsicheren Seite und wurde an die Attrappe angeglichen; beide trimmen
jetzt auf beiden Seiten. Das Trimmen kann nur **mehr** Zeilen treffen als der frühere
ungetrimmte Vergleich (jede vorher passende Zeile passt weiterhin) — fail closed.

**Die Gegenprobe ist eindeutig, nicht behauptet.** Fünf Zeilen in einem eigenen
Aktualitätsfenster — `null`, `''`, `'   '`, ein fremdes und das eigene Mandat — gefiltert
auf das eigene Mandat:

| | erwartet (sicherer Vertrag) | SQL vorher | Attrappe vorher |
|---|---:|---:|---:|
| offene Vorbedingungen | **4** | 2 | 3 |

Gegen den Stand **vor** der Korrektur gefahren: `8b.2`, `8b.3`, `8b.4`, `8b.5` sind **rot**
(`PASS 30 · FAIL 4`, Exit 1); nach der Korrektur grün (`PASS 34 · FAIL 0`). Die
verhaltensgleiche Gegenprobe ohne Datenbank steht als `6.6`–`6.8` in
`vorbedingung-mandatsfilter-test.js`, dazu `6.1b` gegen den Wortlaut der Migration.

### 14.2b Was die Gegenprüfung des eigenen Fixes noch fand

Die Korrektur wurde nach dem ersten Entwurf gegengeprüft. Vier Befunde daraus sind
eingearbeitet — der erste war ein echter Fehler im Fix selbst:

1. **`btrim()` und `String.prototype.trim()` sind nicht dieselbe Zeichenmenge.**
   `btrim(x)` mit einem Argument entfernt in PostgreSQL **nur** U+0020, `trim()` in
   JavaScript **jeden** Weißraum. Der erste Entwurf hätte SQL und Attrappe bei einer
   `tenant_id` aus einem **Tabulator** erneut auseinanderlaufen lassen — wieder mit SQL
   auf der unsicheren Seite. Gemessen: SQL 4, Attrappe 5. Beide Seiten schreiben die
   Zeichenmenge jetzt aus (`E' \t\n\r\f\v'` bzw. `[ \t\n\r\f\v]`), und die
   Gegenprobe enthält eine Tabulatorzeile.
2. **§9 maß gar keinen Filter.** Die Vergleichsabfrage trug
   `(null is null or j.tenant_id is null or …)`; `null is null` ist immer wahr, die
   Klausel war eine Tautologie und wurde wegoptimiert. Sie trägt jetzt die echte
   Mandatsklausel. Ergebnis unverändert: gleicher Zugriffsweg
   (`Bitmap Index Scan on helmut_jobs_window_idx`), **kein neuer Index nötig**.
3. **§6.1 hätte auf einem Kommentar grün werden können.** Die Textprüfung durchsuchte die
   ganze Migrationsdatei — deren Kopfkommentar zitiert die alte Fassung wörtlich. Sie
   prüft jetzt ausschließlich den Rumpf zwischen `as $$` und `$$;`, ohne SQL-Kommentare.
4. **Die Zeitschranken in §9 waren als Pflicht-Check zu eng.** < 50 ms je Zählung
   inklusive Prozessstart ist auf einem geteilten Runner mit Dienstcontainer ein
   Merge-Blocker aus Maschinenrauschen. Sie sind jetzt großzügig (im CI Faktor 4 bzw.
   400 ms) und ausdrücklich als Grobsicherung benannt; die Aussage von §9 trägt 9.1.

Zwei kleinere Härtungen kamen aus derselben Prüfung:

* **`PGHOSTADDR` fehlte im Netzschutz.** libpq benutzt `host` nur noch zur
  Authentifizierung, sobald `hostaddr` gesetzt ist — ein `PGHOSTADDR` in der Umgebung
  schlägt also das `-h` auf der Kommandozeile. Weil `psql` ein natives Binary ist, greift
  die Laufzeitsperre dort nicht; die Umgebungsprüfung ist der einzige Riegel. Die Variable
  steht jetzt in `DB_HOST_VARIABLEN` (`netzschutz-test.js`: 81 PASS).
* **`psql` war eine unausgesprochene Voraussetzung.** Seit der Nachweis fail-closed im
  Pflichtjob läuft, würde ein fehlendes Binary jeden Merge blockieren. Der Workflow prüft
  es jetzt ausdrücklich und installiert `postgresql-client` nur, wenn es fehlt.

### 14.3 Was jetzt wirklich gelaufen ist — und was nicht

| Prüfung | Ergebnis | Grenze |
|---|---|---|
| `vorbedingung-mandatsfilter-test.js` | **45 PASS / 0 FAIL** (vorher 39) | ohne Netz und Datenbank |
| `vorbedingung-mandatsfilter-datenbank-test.js` §1–§10 inkl. §8b | **34 PASS / 0 FAIL** | echte PostgreSQL, aber **16.13**, nicht 17.6 |
| dieselbe Suite gegen den alten Stand | **30 PASS / 4 FAIL**, Exit 1 | die Gegenprobe greift wirklich |
| fail-closed-Pfade | 3 von 3 wie erwartet | — |
| **§11 Rückfall gegen echtes PostgREST** | **NICHT gelaufen** | kein PostgREST-Binary in dieser Umgebung |
| dieselbe Suite **im Pflicht-CI** (Lauf `33243831751`, abgeschlossen 29.08. 08:51 UTC) | **34 PASS / 0 FAIL**, `UEBERSPRUNGEN 1` | erster echter CI-Beleg, **PostgreSQL 17.11** |

**Ehrlich benannt, dreierlei:**

1. Die lokale PostgreSQL dieser Sitzung ist **16.13**, Production ist **17.6**. Der CI-Dienst
   ist `postgres:17` — und dieser Lauf ist **erbracht**: am 29.08. um 08:51 UTC war der
   Nachweis im Pflichtjob gegen **PostgreSQL 17.11** mit **34 PASS / 0 FAIL** abgeschlossen, gleicher
   Zugriffsweg (`Bitmap Index Scan on helmut_jobs_window_idx`), 1,114 ms gegen 1,166 ms.
   Die Hauptversion von Production ist damit im Gate belegt, nicht nur lokal.
2. **§11 ist weiterhin offen.** Der Rückfall gegen echtes PostgREST ist der Nachweis, dass
   ein Deployment **vor** der Migration die Reihenfolgezusage nicht still abschaltet. Er
   wurde am 26.08. einmal von Hand erbracht (§13) und läuft weder lokal noch im neuen
   CI-Schritt mit — dort fehlt das PostgREST-Binary. Drei Dinge halten das ehrlich: der
   CI-Schritt heißt ausdrücklich nur **„§1–§10"**, die Schlusszeile des Nachweises benennt
   übersprungene Abschnitte namentlich (damit „FAIL 0" nicht als Vollständigkeit gelesen
   wird), und `HELMUT_REQUIRE_POSTGREST=1` macht auch §11 fail-closed, sobald jemand das
   Binary bereitstellt. **`HELMUT_REQUIRE_PG=1` erzwingt §1–§10, nicht §11.**
3. Die rund **35 übrigen Datenbanksuiten** überspringen weiterhin still. Dieselbe Lücke
   besteht dort unverändert; sie wurde hier **nicht** geschlossen, weil der Auftrag den
   Z22-Nachweis betraf. Das ist ein eigener, benannter offener Punkt.

Nicht berührt: die Zahlen aus §10 und §13, der Befund Z22 selbst, Z2, Z3a und jede Aussage
über Production. Der isolierte Supabase-Lauf mit 500 synthetischen Aufträgen beweist
unverändert **nur den Warteschlangenmotor** und niemals 500 echte Mandate.

### 14.4 Nachtrag 29.08. — angewendete Fassung und sicherer Konvergenzweg

Die Abweichung wurde vor der Anwendung exakt und ausschliesslich lesend geklaert. In
`supabase_migrations.schema_migrations` liegt unter `20260827121931` eine Datei mit 6.873 Byte
und SHA256 `081c9c43a6d1c03121bde40902850b7348dc8d971f57e0e35ee32ce96796408b`. Sie ist
byteidentisch zur Repository-Fassung aus Commit `2a01ea9`. Die dort aktive dreistellige
Funktion bestaetigt denselben Stand: leere Parameterkennung zaehlt global, aber die
Zeilenkennung wird nur mit `tenant_id is null` als global behandelt.

Der Kopf von PR #273 traegt fuer `20260826190000` dagegen 8.977 Byte und SHA256
`f709747834898bf84b776f806429e95ffa4eeb727dd326f7dbf2d88d403c2f4e`. Diese Datei behandelt
auch leere und aus der ausgeschriebenen Weissraummenge bestehende Zeilenkennungen global.
Die beiden Fassungen unterscheiden sich damit byteweise und fachlich.

Die angewendete Historie wird nicht ueberschrieben. Der neue Vorwaertsweg
`20260829123132_z22_mandatsfilter_zeilenkennung_korrigieren.sql` ersetzt ausschliesslich eine
bereits vorhandene dreistellige Z22-Funktion. Fehlt sie oder steht daneben noch die
zweistellige Fassung, bricht die Transaktion ab. Der zugehoerige Rueckweg stellt die alte
dreistellige Fassung aus `2a01ea9` wieder her und entfernt Z22 nicht. Der vollstaendige
Z22-Rueckbau auf zwei Argumente bleibt dem vorhandenen, getrennten Rueckweg zugeordnet.

Die Repository-Datei der Vorwaertskorrektur hat 4.568 Byte und SHA256
`c4bb62673f2282f72a585ea4fa6e486a0ed62fdfe951523f066212239158cd23`; ihr getrennt
gehaltener Rueckweg hat 3.363 Byte und SHA256
`9791aa5061db85dd81186ec6f7ba2a77517855aa525ed2cd804c402812394a02`.

**Anwendung im isolierten Testprojekt, 29.08. um 16:54:55 Tuerkei / 15:54:55 Berlin /
13:54:55 UTC:** Nach ausdruecklicher Betreiberfreigabe wurde genau die Vorwaertskorrektur
angewendet. Das Supabase-Managementwerkzeug erzeugt seine 14-stellige Buchungsnummer beim
Lauf selbst. Deshalb steht die Repository-Version `20260829123132` im Testprojekt transparent
unter Version `20260829135455` und dem Namen
`repo_20260829123132_z22_mandatsfilter_zeilenkennung_korrigieren`; beide Nummern werden nicht
stillschweigend gleichgesetzt. Der Rueckweg wurde nicht ausgefuehrt.

**Vorpruefung:** Projekt `ffzaxdbatoamsovncrym` war `ACTIVE_HEALTHY`, PostgreSQL 17.6; genau
eine dreistellige und keine zweistellige Funktion war vorhanden. Ihr Rumpf trug nachweislich
die alte Regel aus `2a01ea9`. Die Tabelle enthielt 900 synthetische Auftraege ohne leere
Zeilenkennung.

**Nachpruefung:** weiterhin 900 Auftraege; genau eine dreistellige, `stable`,
`security invoker`-Funktion mit festem `search_path`. `anon` und `authenticated` duerfen sie
nicht ausfuehren, `service_role` darf es. Der gespeicherte Rumpf enthaelt die ausgeschriebene
Weissraummenge auf Parameter- und Zeilenseite und nicht mehr die alte reine
`tenant_id is null`-Regel. Fuer alle 500 vorhandenen Mandatskennungen wurde das
Funktionsergebnis rein lesend gegen eine unabhaengige SQL-Zaehlogik verglichen:
**500 geprueft, 0 Abweichungen.** Vor und nach der Anwendung meldeten die Supabase-Advisors
keine neue Sicherheits- oder Leistungswarnung. Der 500er Plattformlasttest wurde nicht
wiederholt; sein frueherer Beleg bleibt unveraendert auf den Warteschlangenmotor begrenzt.

Production besass bei der letzten lesenden Pruefung weiterhin nur die zweistellige
Vor-Z22-Funktion. Die Production-Datenbank wurde in diesem Nachtrag weder gelesen noch
veraendert. Eine Production-Anwendung von Z22 und der Vorwaertskorrektur bleibt eine eigene
Betreiberfreigabe *(am 29.08. erteilt und vollzogen — §14.6)*.

### 14.5 Nachtrag 29.08. — Production-Vorpruefung ohne Anwendung

Die ausdruecklich freigegebene, rein lesende Vorpruefung lief am 29.08. gegen das eindeutig
vom isolierten Testprojekt getrennte Production-Projekt `ddckuvvpcytqbyfmbvie`. Zeitpunkt der
Bestandsaufnahme: 19:55 Uhr Tuerkei, 18:55 Uhr Berlin, 16:55 Uhr UTC. Das Projekt war
`ACTIVE_HEALTHY`, Region `eu-west-1`, PostgreSQL 17.6. Es wurde keine Migration angewendet,
kein Funktionsrumpf ersetzt und keine Auftragszeile veraendert.

**Migrationsstand:** Die Production-Historie endet mit den beiden bereits dokumentierten
Buchungen `20260823063140` und `20260823063208` fuer denselben Aufgeben-Weg. Weder F9
(`20260825101500`) noch Z22 (`20260826190000`) noch die Z22-Vorwaertskorrektur
(`20260829123132`) sind gebucht. Ein spaeterer Z22-Lauf muss deshalb zuerst die Basismigration
und danach die fail-closed Vorwaertskorrektur anwenden; die Korrektur darf wegen ihres
Vorbedingungsriegels nicht allein starten.

**Exakter Vorzustand:** Es existiert genau eine Funktion
`public.helmut_jobs_offen(text[],text[])` und keine dreistellige Fassung. Definition,
Rueckgabetyp, `stable`, `security invoker`, `search_path=public, pg_temp` und Rumpf stimmen mit
`20260808_jobqueue_abhaengigkeiten.sql` ueberein. `anon` und `authenticated` besitzen kein
Ausfuehrungsrecht, `service_role` besitzt es. Es gibt keine abhaengigen Datenbankobjekte, die
das transaktionale Ersetzen der Signatur blockieren. Die erwarteten Fenster-, Typ-, Status-
und Tenant-Indizes sind vorhanden.

**Nur zusammengefasster Datenbestand:** 3.330 Auftraege, davon 3.122 `erledigt`, 208
`wartend`, 0 `laeuft` und 0 `fehlgeschlagen`. 3.161 Zeilen tragen keine Mandatskennung; die
restlichen Zeilen verteilen sich auf genau fuenf brauchbare Kennungen. Es existieren 0 leere
und 0 nur aus der ausgeschriebenen Weissraummenge bestehende Zeilenkennungen. Keine Kennung
und kein Auftragsinhalt wurde ausgegeben.

**Production-Planprobe:** Die korrigierte Filterbedingung wurde als eigenstaendige
`EXPLAIN (ANALYZE, BUFFERS)`-SELECT-Abfrage mit einer garantiert kuenstlichen Kennung gegen den
Bestand gemessen. Ergebnis: 4,011 ms Gesamtlaufzeit, 481 Cache-Treffer, 0 gelesene,
verschmutzte oder geschriebene Bloecke. Der heutige kleine Bestand wird sequenziell gelesen;
die Anwendung erzeugt deshalb keinen neuen Index. Diese Einzelmessung ist kein Lastbeweis.

**Gebundene Dateien und Rueckweg:** Basismigration SHA256
`f709747834898bf84b776f806429e95ffa4eeb727dd326f7dbf2d88d403c2f4e`, Vorwaertskorrektur
SHA256 `c4bb62673f2282f72a585ea4fa6e486a0ed62fdfe951523f066212239158cd23`.
Der partielle Rueckweg zur alten dreistelligen Z22-Fassung hat SHA256
`9791aa5061db85dd81186ec6f7ba2a77517855aa525ed2cd804c402812394a02`; der vollstaendige
Rueckweg zur heutigen zweistelligen Fassung hat SHA256
`3c3cde417f4f4fcb1c5335362eb43cb7d5c64fdf492dae2a2d35e88580cfe86d`.

Die Vorpruefung ist **gruen**, aber sie ist keine Anwendungsfreigabe. Vor einer spaeteren
Anwendung sind der aktuelle Vorzustand und 0 laufende Auftraege erneut zu bestaetigen. Danach
braucht die Anwendung beider Vorwaertsschritte weiterhin eine eigene ausdrueckliche
Betreiberfreigabe. Azure, echte Modellaufrufe und der 500er Plattformlasttest waren nicht Teil
dieser Vorpruefung. *(Die Freigabe wurde noch am 29.08. erteilt; Anwendung und Nachpruefung
stehen in §14.6.)*

### 14.6 Nachtrag 29.08. — Z22 in Production angewendet und gegengeprüft

Nach der grünen Vorprüfung (§14.5) wurde der Vollzug in genau dieser Reihenfolge
abgeschlossen: PR #280 wurde gemergt (`main` = `87bed2219f9d64f9c832b7b4baff63875f15ddab`),
das automatische Vercel-Production-Deployment war grün, und die öffentliche
Production-Adresse antwortete mit HTTP 200 und lieferte exakt diesen Commit. **Anschließend
wurde Z22 mit ausdrücklicher Betreiberfreigabe auf das Production-Projekt
`ddckuvvpcytqbyfmbvie` angewendet** — zuerst die Basismigration, danach die fail-closed
Vorwärtskorrektur, wie es §14.5 verlangt.

| Repository-Datei | Production-Buchung |
|---|---|
| `20260826190000_jobqueue_vorbedingung_mandatsfilter.sql` | `20260829175642` |
| `20260829123132_z22_mandatsfilter_zeilenkennung_korrigieren.sql` | `20260829175749` |

Wie schon bei der Testprojekt-Anwendung (§14.4) erzeugt das Supabase-Managementwerkzeug
seine 14-stellige Buchungsnummer beim Lauf selbst; Repository-Version und Production-Buchung
werden nicht stillschweigend gleichgesetzt.

**Nachprüfung des Bestands:** 3.330 Aufträge, davon 3.122 `erledigt`, 208 `wartend`,
0 `laeuft` und 0 `fehlgeschlagen`; 3.161 Zeilen ohne Mandatskennung, 0 leere und 0 nur aus
der ausgeschriebenen Weißraummenge bestehende Zeilenkennungen; genau fünf brauchbare reale
Mandatskennungen. Die Aggregate entsprechen unverändert der Vorprüfung (§14.5). **Keine
Auftragsdaten wurden verändert**, keine Mandatskennung und kein Auftragsinhalt wurde
ausgegeben.

**Nachprüfung der Funktion:** Es steht genau **eine** dreistellige Funktion
`public.helmut_jobs_offen(text[],text[],text)` mit drei Vorgabewerten; die alte zweistellige
Fassung ist entfernt. `stable`, `security invoker` und `search_path=public, pg_temp` sind
gesetzt; `anon` und `authenticated` besitzen kein Ausführungsrecht, `service_role` besitzt
es. Fünf globale Funktionsgegenproben bestanden. Für alle fünf vorhandenen Mandate wurde das
Funktionsergebnis rein lesend gegen die direkte SQL-Erwartung geprüft: **5 passend,
0 Abweichungen.**

**Rein lesende Laufzeitmessung:** 5,973 ms Gesamtlaufzeit, 922 gemeinsame Puffertreffer,
0 gelesene, 0 veränderte und 0 geschriebene Blöcke. Wie in §14.5 gilt: eine Einzelmessung
ist kein Lastbeweis.

**Nicht berührt:** das isolierte Supabase-Testprojekt blieb unverändert, Azure wurde nicht
aufgerufen — es gab keine Modellaufrufe und damit keine Azure-Modellkosten. **Z22 wird nicht erneut
angewendet** — die Anwendung ist abgeschlossen; ein weiterer Lauf ist weder nötig noch
freigegeben. Der partielle und der vollständige Rückweg bleiben unverändert die in §14.5
gebundenen Dateien und sind nicht ausgeführt.

**Beweisebenen nach diesem Nachtrag:** Z22 ist lokal, im Pflicht-CI, isoliert gegen Supabase
und jetzt **in Production bewiesen** — als Funktions- und Plattformzustand. Ein neuer
**Mandats- oder Skalierungsnachweis** entstand dadurch nicht: in Production bleiben genau
fünf reale Mandate bewiesen, und die 500 synthetischen Mandate belegen weiterhin
ausschließlich den isolierten Warteschlangenmotor. Offen bleiben §11 (Rückfall gegen echtes
PostgREST), die übrigen still überspringenden Datenbanksuiten (§14.3), Z3b, Azure, der
Parserfix aus PR #274 und die nächste natürliche Fünferprüfung.
