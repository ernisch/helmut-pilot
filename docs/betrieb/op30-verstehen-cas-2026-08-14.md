# OP-30 · Verstehensparallelität und atomarer Verstehensvertrag (CAS)

**Sprint 2026-08-14/6 · Zustand: erfolgreich abgeschlossen (lokal belegt; Aktivierung = Betreiberentscheidung)**

Kanonische Belegdatei für den letzten globalen Engpass der OP-30-Zielarchitektur.
Vorgeschichte: [`op30-zielarchitektur-2026-08-13.md`](op30-zielarchitektur-2026-08-13.md)
§22 („Verstehenskapazität: Parallelität bleibt 1") hat den Befund gestellt — diese Datei
löst ihn ein.

> **Production, Supabase Production und AWS sind in diesem Sprint vollständig unangetastet
> geblieben.** Keine Migration angewendet, keine Umgebungsvariable geändert, kein Flag
> aktiviert, keine AWS-Ressource angelegt, kein Production-Lauf gestartet, keine Daten
> neutralisiert, kein Secret gelesen. Alle Nachweise stammen aus einer lokalen
> Wegwerf-PostgreSQL 16.

---

## 1 · Der alte Engpass, am Code belegt

Die allgemeine Warteschlange konnte längst parallel arbeiten; die Arbeitsklasse
`verstehen` stand aber auf Parallelität **1**
(`lib/helmut/scalable-pipeline.js`, `KLASSEN_STANDARD.verstehen`). Der Grund war **nicht**
die Warteschlange und **nicht** der Fachkern, sondern eine einzige Ablage:

`lib/helmut/understanding.js` hielt die Vormerkungen gescheiterter Aktualisierungen
(P29-3) in **einer Karte** im Auth-Store und schrieb sie mit **Lesen → Ändern →
Schreiben** zurück:

```js
const map = await leseUpdateVormerkungen(deps, retriesCtx);   // ganze Karte lesen
map[vorgangId] = bisher + 1;                                  // einen Eintrag ändern
await schreibeUpdateVormerkungen(deps, retriesCtx);           // GANZE Karte schreiben
```

Zwei gleichzeitige Verstehensläufe lesen denselben Stand und schreiben anschließend
widersprüchlich; der langsamere Schreiber überschreibt den Eintrag des schnelleren. Ein
verlorener Eintrag ist ein Vorgang, der **nie wieder aufgenommen** wird — genau der Fall,
den `CLAUDE.md` §4 Regel 10 verbietet (belegter Anlass: F-CAS,
[`cron-fairness.md`](cron-fairness.md) §13).

Die Kommentarzeile „mehr als 1 ist nur mit der Vorgangswache sicher" war bis zu diesem
Sprint **nur ein Kommentar**: `klassenMax()` hätte einer Konfiguration `HELMUT_KLASSE_
VERSTEHEN_MAX=8` widerspruchslos gehorcht. Auch das ist jetzt behoben (§3.5).

## 2 · Der neue atomare Vertrag

**Migration `20260814180000_verstehen_cas.sql`** (+ `rollback_…`, beide **nicht
angewendet**, freigabepflichtig). Zwei Tabellen, zehn Funktionen, ein Trigger.

### 2.1 Eine Zeile je Vorgang statt einer Karte

| Tabelle | Zweck |
|---|---|
| `helmut_verstehen_reservierungen` | Besitzer, Lease, monotoner Fencing-Wert, Zustand, Eingabe-/Ergebnishash, Zähler — **eine Zeile je Vorgang** |
| `helmut_verstehen_vormerkungen` | Fehlversuche je Vorgang, **atomar** erhöht (`insert … on conflict do update set fehlversuche = fehlversuche + delta`), **bedingt** gelöscht (Compare-and-Set gegen `letzte_fencing`) |

Die Serialisierung liegt auf dem **Row-Lock der Vorgangszeile** (`select … for update`),
nicht auf einem globalen Schloss. Verschiedene Vorgänge blockieren sich deshalb **nie**.

### 2.2 Der Zustandsverlauf

```
                    reserviere()                 modellstart()
   offen ─────────────────────────► reserviert ─────────────────► modell-laeuft
     ▲                                  │  │                            │  │
     │ freigabe() (bekannter Ausgang)   │  │ Lease laeuft ab            │  │ abschluss()
     └──────────────────────────────────┘  │ (Absturz VOR dem Aufruf)   │  ▼
                                           └──► offen, Fencing +1       │ fertig
                                                                        │
                                        Lease laeuft ab (Absturz NACH   │
                                        dem Aufruf) und KEIN Ergebnis   │
                                        in knowledge_objects            ▼
                                                                   unbekannt
                                                          (geschlossen blockiert)
```

`fertig` + gleicher Eingabehash ⇒ **`bereits-fertig`**: der nächste Anlauf nutzt das
vorhandene Ergebnis ohne Modellaufruf (Idempotenz). Ein **neuer** Eingabehash wird
zugelassen — Fortschreibung bleibt möglich.

### 2.3 Der Fencing-Wert ist erzwungen, nicht nur geprüft

Jede Übernahme erhöht `fencing` um 1. Der Wert wandert über die neue Spalte
`knowledge_objects.verstehen_fencing` mit in das Ergebnis und wird dort vom Trigger
`helmut_ko_fencing_wache` **durchgesetzt** — in zwei Richtungen:

1. gegen die **gespeicherte Fassung**: `new < old` ⇒ Abweisung (SQLSTATE `HV001`);
2. gegen die **aktuelle Reservierung**: `new < reservierung.fencing` ⇒ Abweisung.

Punkt 2 schließt das Fenster, das eine reine Vorher-Prüfung offen lässt: ein abgelöster
Arbeiter kann auch dann nicht schreiben, wenn der neue Besitzer sein Ergebnis noch nicht
persistiert hat. Das ist der Unterschied zwischen „vorher geprüft" und „erzwungen".

**Der Trigger ist ohne den neuen Pfad wirkungslos.** Er kehrt sofort zurück, wenn
`verstehen_fencing` NULL ist oder sich nicht ändert. Alle bestehenden Schreibpfade
(Anreicherung, Matching, Nachklassifikation) senden die Spalte nicht mit; PostgREST
behält dann den Altwert, `NEW = OLD`, und der Vergleich schlägt nie an
(nachgewiesen: Datenbanktest §13).

### 2.4 Rechte und Datenschutz

RLS an **und** erzwungen, keine Policy, keine Rechte für `anon`/`authenticated`/`PUBLIC`,
`security invoker` (kein `SECURITY DEFINER`), fester `search_path = public, pg_temp` auf
**jeder** Funktion — nachgewiesen in §2 des Datenbanktests. Gespeichert werden
Vorgangskennung, zwei Hashes, eine technische Halterkennung, Zähler und Zeitstempel:
**keine Inhalte, keine Mandate, keine URLs, keine Namen.** Der Eingabehash wird bewusst
nur aus Dokument**kennungen** gebildet — ein Titelwechsel am selben Dokument löst dadurch
weder eine neue Analyse noch eine neue Kosten aus (Vertragstest §2.5).

## 3 · Umgang mit KI-Aufrufen und unbekannten Ausgängen

### 3.1 Die Unmöglichkeitsgrenze — ausdrücklich geprüft

**Eine echte Zusage von genau einem externen KI-Aufruf über alle Absturzzeitpunkte ist
technisch unmöglich.** Der Grund ist strukturell, nicht behebbar: der Modellaufruf und
die eigene Datenbank haben **kein gemeinsames Commit**. Zwischen „die Anfrage ist raus"
und „die Antwort ist persistiert" gibt es immer einen Zeitpunkt, an dem der Prozess
sterben kann, ohne irgendwo eine Spur zu hinterlassen, aus der sich der Ausgang ableiten
ließe. Eine verteilte Transaktion mit dem Anbieter gibt es nicht, und einen
Idempotenzschlüssel, den der Anbieter über Tage vorhält, ebenso wenig.

**Also wurde priorisiert, wie im Auftrag gefordert:**

| Zusage | Umsetzung |
|---|---|
| **Kein automatischer Doppelaufruf** | `modellstart` vermerkt den Aufruf **vor** dem Absenden. Ein danach abgestürzter Vorgang wird nie automatisch erneut aufgerufen. |
| **Unbekannter Ausgang sichtbar blockiert** | `zustand = 'unbekannt'`, `letzter_grund = 'absturz-nach-modellstart'`, zählbar über `helmut_verstehen_kennzahlen()`, in der Lauftelemetrie als eigene Klasse `skipped-ausgang-unbekannt` (Gruppe „fehlgeschlagen"). |
| **Keine erfundene Erfolgsmeldung** | `abschluss` läuft **nach** der Persistenz und nur mit passendem Fencing-Wert; scheitert er, meldet der Lauf `skipped-veraltet` statt „saved". |

**Die einzige automatische Auflösung ist eine belegte.** Findet `reserviere` in
`knowledge_objects` ein Ergebnis mit mindestens dem Fencing-Wert des Abgestürzten, dann
lag der Absturz **nach** dem Speichern — der Ausgang ist damit bekannt, und der Vertrag
löst selbst auf `fertig` auf. Ohne KI, ohne Betreiber (Datenbanktest §11.1).

Alles andere braucht eine ausdrückliche Entscheidung:
`helmut_verstehen_ausgang_aufloesen(vorgang, 'erneut' | 'aufgeben')`. `erneut` ist die
bewusste Zustimmung zu einem zweiten, bezahlten Aufruf; `aufgeben` ist terminal.

### 3.2 Die verbleibende Ungenauigkeit, ehrlich benannt

Zwischen dem erfolgreichen `modellstart` und dem tatsächlichen Absenden der Anfrage
liegen wenige Millisekunden. Stirbt der Prozess **in** diesem Fenster, hat kein Aufruf
stattgefunden — der Vertrag stuft den Vorgang trotzdem als `unbekannt` ein. Das ist die
konservative Seite des Irrtums: es entstehen keine Doppelkosten, sondern ein sichtbarer
Vorgang, der eine Entscheidung braucht. Die umgekehrte Wahl (im Zweifel wiederholen)
wäre die teure und wurde bewusst nicht getroffen.

### 3.3 Keine Doppelbuchung des Tagesbudgets

Der Budget-Vorgriff (`canSpend`) ist rein lesend; die eigentliche Reservierung passiert
unverändert am Choke-Point in `ai.js`. Die Reservierung des Vertrags steht **vor** dem
Budget-Gate, damit eine bereits fertige Eingabe gar nicht erst gegen den Tagesdeckel
läuft. `ki_aufrufe` in der Reservierungszeile ist ein zweiter, unabhängiger Zähler:
er steht nach einem Absturz auf 1 und bleibt dort (Datenbanktest §8.5).

## 4 · Verdrahtung — ein Fachpfad, drei Wege

Der Vertrag hängt in `understanding.defaultDeps` als **Fabrik**
(`verstehenVertrag: () => baueVertrag(…)`). Damit gilt er automatisch für alle drei Wege,
ohne dass eine zweite Verstehensimplementierung entsteht:

| Weg | Einstieg | Fachkern |
|---|---|---|
| Cron | `scheduler.runSourceCrawl` / `/api/cron/understanding` | `understanding.runUnderstandingShadow` |
| Warteschlange | `scalable-pipeline.fuehreAuftragAus` → `deps.eagerUnderstanding` | dieselbe Funktion |
| Lambda / Wecksignal | `queue-verbraucher.verarbeiteWecksignal` → `fuehreAuftragAus` | dieselbe Funktion |

**Warum eine Fabrik und kein fertiges Objekt:** jeder Cluster bekommt einen **eigenen**
Besitzer. Sonst hielten zwei gleichzeitig laufende Cluster desselben Vorgangs innerhalb
eines Prozesses einander für denselben Arbeiter (Wiedereintritt) — und **beide** würden
das Modell aufrufen. So verhält sich prozessinterne Nebenläufigkeit exakt wie
prozessübergreifende.

### 4.1 Drei Konfigurationsgrößen, alle Default sicher

| Größe | Standard | Wirkung |
|---|---|---|
| `HELMUT_VERSTEHEN_CAS` | **aus** | ohne sie: `baueVertrag()` liefert `null`, der Karten-Store läuft byte-identisch weiter |
| `HELMUT_VERSTEHEN_PARALLELITAET` | **1** | Cluster gleichzeitig **innerhalb** eines Laufs; 1 = unveränderte serielle Schleife |
| `HELMUT_KLASSE_VERSTEHEN_MAX` | **1** | Arbeiter gleichzeitig **systemweit** (verteilte Klassengrenze, Migration 20260813090100) |

**Beide Parallelitäten werden ohne `HELMUT_VERSTEHEN_CAS` auf 1 geklemmt** — mit einer
einmaligen Meldung, nicht stillschweigend. Konfiguration darf eine Sicherheitszusage nie
aushebeln, und ein vergessenes Flag darf nicht in doppelte KI-Kosten münden. Die
Obergrenze ist **8** — genau die Zahl, die lokal nachgewiesen ist (§5).

## 5 · Nebenläufigkeitsnachweise

Zwei getrennte Suiten, weil sie zwei verschiedene Dinge beweisen. Eine allein genügt nicht.

### 5.1 `scripts/verstehen-cas-datenbank-test.js` — die Datenbankzusagen

Echte PostgreSQL 16, echte Nebenläufigkeit: **je Arbeiter ein eigener
Betriebssystemprozess** (`spawn psql`), kein gemeinsamer JavaScript-Faden. **68 PASS / 0 FAIL.**

| § | Nachweis | Ergebnis |
|---|---|---|
| 1 | Migration vorwärts → rückwärts → erneut vorwärts an frischer Datenbank | restlos, idempotent; ohne `knowledge_objects` bricht sie ehrlich ab |
| 2 | RLS an+erzwungen, keine Policy, 0 Rechte für anon/authenticated/PUBLIC, fester `search_path`, kein `SECURITY DEFINER` | 6/6 |
| 3 | **20 gleichzeitige Arbeiter auf denselben Vorgang** | genau **1** Berechtigung, genau **1** erfolgreicher `modellstart`, `ki_aufrufe = 1` |
| 4 | **8 verschiedene Vorgänge gleichzeitig**; zusätzlich 24 Arbeiter auf 8 Vorgänge | 8 aktive Leases zum selben Zeitpunkt, 8 gleichzeitig auf `modell-laeuft`; 24 → genau 8 Berechtigungen |
| 5 | Lease-Verlust | alter Besitzer: kein Schreibrecht, kein Abschluss |
| 6 | Veraltetes Überschreiben | Datenbank weist ab — auch bevor der neue Besitzer geschrieben hat |
| 7 | Absturz **vor** dem Modellaufruf | reguläre Übernahme, Fencing +1, `ki_aufrufe = 0` |
| 8 | Absturz **nach** dem Modellaufruf | `ausgang-unbekannt`, dauerhaft blockiert, `ki_aufrufe` bleibt 1, in den Kennzahlen sichtbar |
| 9 | Idempotenz | gleiche Eingabe → `bereits-fertig`; 20 gleichzeitige Wiederholungen → **0** Berechtigungen; neue Eingabe → zugelassen |
| 10 | Vormerkungen | 20 gleichzeitige Erhöhungen ergeben **genau 20**; alter Erfolgsmelder löscht nicht |
| 11 | Auflösung des unbekannten Ausgangs | automatisch bei belegtem Ergebnis; sonst nur `erneut`/`aufgeben` |
| 12 | Fehlerhafte Argumente | Fehler statt stillem Erfolg; unbekannter Zustand strukturell ausgeschlossen |
| 13 | Fremde Schreibpfade | unberührt (Anreicherung/Matching laufen durch) |

### 5.2 `scripts/verstehen-cas-vertrag-test.js` — die Anwendungsseite

Offline, gegen eine Attrappe der SQL-Semantik. **68 PASS / 0 FAIL.** Kernpunkte:

* **§3** vollständige Reihenfolge belegt: `reservieren → modellstart → KI → schreibrecht →
  speichern → abschluss`; das Ergebnis trägt den Fencing-Wert der Reservierung.
* **§13** **acht verschiedene Vorgänge laufen im Fachkern wirklich gleichzeitig**
  (gemessener Höchststand 8, Laufzeit unter der seriellen Summe) — und die Gegenprobe:
  **ohne** Vertrag bleibt derselbe Lauf seriell (Höchststand 1). Der Riegel greift.
* **§14** **20 gleichzeitige Arbeiter auf denselben Cluster**: genau 1 Modellaufruf,
  genau 1 Speicherung, 19 geschlossen zurückgestellt, kein leeres Ergebnis.
* **§12** fail closed an **jeder** Vertragsstelle (Reservierung, Modellstart, Schreibrecht,
  Abschluss) — eine nicht prüfbare Zusage erlaubt nichts.
* **§15** Cron, Warteschlange und Lambda benutzen denselben Fachpfad; es gibt genau **eine**
  `understandOneCluster`.

### 5.3 `scripts/verstehen-cas-mutationsprobe.js` — kann die Suite überhaupt rot werden?

Je EIN Schutzmechanismus wird aus einer **In-Memory-Kopie** der Migration entfernt (die
Datei selbst bleibt unangetastet), die Mutation in eine Wegwerf-Datenbank eingespielt und
der Schaden nachgewiesen. **ROT 6 / Löcher 0.** Vorher wird die **Grundlinie** geprüft —
eine bereits beschädigte Grundlinie würde jede Mutation aussagelos machen.

| Mutation | Entfernter Schutz | Nachgewiesener Schaden |
|---|---|---|
| M1 | atomare Erhöhung → Lesen-Ändern-Schreiben | 20 gleichzeitige Erhöhungen ergeben **3** statt 20 |
| M2 | monotoner Fencing-Wert | der abgelöste Arbeiter schließt den Vorgang mit **seinem** Ergebnis ab |
| M3 | Row-Lock in `reserviere` | **12** berechtigte KI-Ausführungen statt 1 |
| M4 | Lease-/Besitzerprüfung im Schreibrecht | der ALTE Besitzer bekommt Schreibrecht zurück |
| M5 | Fencing-Riegel am Wissensobjekt | ein altes Ergebnis überschreibt das neuere |
| M6 | Sperre des unbekannten Ausgangs | der unbekannte Ausgang wird **still wiederholt** (zweiter KI-Aufruf) |

Zwei Befunde aus der Erstellung der Probe, beide behoben und hier festgehalten, weil sie
sich sonst in der nächsten Probe wiederholen:

1. **`String.replace` deutet `$$` im Ersatz-String als escaptes `$`.** Aus `$$;` wurde
   `$;` — die Dollar-Quotes der Funktionskörper waren zerstört, und eine syntaktisch
   kaputte Mutation hätte wie ein *fehlender Schaden* ausgesehen. Behoben durch einen
   Ersatz als **Funktion**; zusätzlich bleibt die mutierte Datei bei einem Fehler liegen.
2. **Ohne vorhandene Ankerzeile serialisiert schon das `insert … on conflict do nothing`
   am Unique-Index.** M3 wäre grün geblieben — nicht weil der Row-Lock wirkt, sondern
   weil ein ganz anderer Mechanismus zufällig dasselbe leistet. Die Probe legt die
   Ankerzeile deshalb vorher an.

## 6 · Migration und Rückweg

* **Vorwärts:** `supabase/migrations/20260814180000_verstehen_cas.sql` — 14-stelliger,
  eindeutiger Zeitstempel (`CLAUDE.md` §4 Regel 8), testgesichert durch
  `scripts/migrations-organisation-test.js`.
* **Rückwärts:** `rollback_20260814180000_verstehen_cas.sql` — für die Supabase-CLI
  strukturell unausführbar, im selben Verzeichnis auffindbar.
* **Vorbedingung:** `public.knowledge_objects` muss existieren; fehlt sie, bricht die
  Migration mit einer klaren Meldung ab statt die Fencing-Zusage still auszulassen.
* **Unabhängig** von `20260813090000` (Outbox) und `20260813090100` (Klassengrenzen).
* **Nachgewiesen:** vorwärts → rückwärts → erneut vorwärts an frischer PostgreSQL 16
  (Datenbanktest §1).
* **Was der Rollback kostet:** die Reservierungs- und Vormerkungszeilen. Das ist
  **Arbeitszustand, kein Inhalt** — Wissensobjekte, Rohdokumente und Verknüpfungen bleiben
  unberührt. Ein verlorener `unbekannt`-Zustand würde den Vorgang allerdings wieder
  freigeben; der Rollback nennt den Export dafür in seinem Kopf.
* Die Spalte `knowledge_objects.verstehen_fencing` wird **mit** entfernt: ohne Trigger
  trägt sie keine Zusage mehr, und ein zurückbleibender hoher Wert würde einen späteren
  Neuaufbau gegen einen wieder bei 0 startenden Zähler verfälschen.

**Nicht angewendet.** Die Anwendung auf Production ist eine gesonderte Betreiberfreigabe
(`CLAUDE.md` §5).

## 7 · Kapazität für 5 bis 500 Mandate (neu gerechnet)

`scripts/kapazitaetsmodell-test.js` §B1/§B2, **37 PASS**. Grundlage unverändert: die
Production-Messwerte des zweiten Fünferlaufs (Runbook §19). Neu ist die **zweite,
pessimistische Annahme A2** — Annahme A (50 % des Tages nutzbar) ist eine Annahme, keine
Messung, und der zweite Fünferlauf hat gezeigt, wie weit die Wirklichkeit davon abweichen
kann (Ankunft ~440–470/Tag gegen Abfluss ~130–180/Tag). A2 rechnet mit einem Viertel: 12,5 %.

| Mandate | nötige Verstehensparallelität bei A | bei A2 | Reserve bei p=1 / A | Reserve bei p=8 / A2 |
|---|---|---|---|---|
| 5 | 1 | 1 | ×13,4 | ×26,8 |
| 25 | 1 | 1 | ×10,6 | ×21,2 |
| 100 | 1 | 2 | ×6,1 | ×12,3 |
| 200 | 1 | 2 | ×4,2 | ×8,3 |
| 500 | 1 | **3** | **×2,7** | ×5,4 |

Die übrigen Klassen (`quellenabruf`, `projektion`, `briefing`) sind unverändert; die
Bedarfs-/Angebotstabelle je Klasse steht im Testlauf selbst.

**Lokal belegte sichere Verstehensparallelität: 8.** Das ist keine gerundete Wunschzahl,
sondern genau die Zahl, die zweifach nachgewiesen ist — acht gleichzeitig gehaltene
Vorgänge an echter PostgreSQL (§5.1 §4) und acht wirklich gleichzeitig verarbeitete
Vorgänge im Fachkern (§5.2 §13). `VERSTEHEN_PARALLELITAET_MAX` deckelt bei genau dieser
Zahl, damit die Konfiguration keinen ungedeckten Wert annehmen kann.

**Ausdrückliche Einordnung.** Das ist ein **Rechenmodell aus Production-Messwerten**, kein
Production-Nachweis. **Helmut ist durch diesen Sprint nicht für 25 bis 500 Mandate
freigegeben.** Der bindende Grund dagegen ist unverändert **nicht** der technische
Durchsatz, sondern der **KI-Tagesdeckel**: ab 25 Mandaten reicht 100+30 auch im günstigen
Fall nicht (§B3), und OP-15 (Google-Drosselung) bleibt ab ~10 Mandaten offener Blocker.
Zusätzlich fehlen unverändert **190 echte Profile** (es gibt 10).

## 8 · Was dieser Sprint ausdrücklich NICHT tut

* Kein Flag aktiviert, keine Migration angewendet, kein Redeploy, keine Env-Änderung.
* Keine zweite Verstehensimplementierung; `helmut_jobs`, Outbox, AWS-Transport und der
  Cron-Rückfallweg sind unverändert.
* Der AWS-Trockenlauf aus Runbook §22 bleibt gesonderte Betreiberentscheidung und wurde
  **nicht** ausgeführt.
* Die 524 inerten Aufträge aus §7b des Statusdokuments sind **nicht** angefasst worden.

## 9 · Restrisiken

1. **Der unbekannte Ausgang braucht eine Betriebsroutine.** Ohne regelmäßigen Blick auf
   `helmut_verstehen_kennzahlen()` sammeln sich blockierte Vorgänge an. Sie sind sichtbar
   und harmlos (keine Kosten, kein falsches Grün) — aber sie lösen sich nicht von selbst.
   Ein Alarmweg dafür gehört zu OP-07 und ist **nicht** Teil dieses Sprints.
2. **Der Trigger liegt auf `knowledge_objects`.** Er ist nachweislich inert, solange
   niemand `verstehen_fencing` setzt (§2.3, Datenbanktest §13) — aber er liegt auf der
   zentralen Tabelle. Ein künftiger Schreibpfad, der die Spalte versehentlich mitsendet,
   könnte abgewiesen werden. Deshalb ist sie ausschließlich Schreibspalte und steht in
   keiner Leseprojektion.
3. **Die Parallelität ist lokal belegt, nicht in Production.** Alles über Parallelität 1
   hinaus ist eine Betreiberentscheidung nach Stufenplan, nicht eine Codefolge.
4. **A2 ist eine Annahme, keine Messung.** Sie ist bewusst pessimistisch gewählt, aber
   nicht aus Production abgeleitet; die einzige echte Messung bleibt der Fünferlauf.

## 10 · Nächster Schritt

**Genau einer:** den PR reviewen und mergen (ändert Production nicht — alles Default-AUS).
Erst danach, und als getrennte Betreiberentscheidung, die Migration `20260814180000`
anwenden und `HELMUT_VERSTEHEN_CAS=on` im Schattenbetrieb beobachten (Parallelität bleibt
dabei zunächst 1: der Vertrag wirkt dann, ohne dass sich der Durchsatz ändert).
