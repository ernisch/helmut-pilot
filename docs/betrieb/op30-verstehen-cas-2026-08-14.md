# OP-30 · Verstehensparallelität und atomarer Verstehensvertrag (CAS)

**Sprint 2026-08-14/6 · Zustand: erfolgreich abgeschlossen (lokal belegt; Aktivierung = Betreiberentscheidung)**
**Korrekturlauf 2026-08-15 · drei bestätigte Lücken geschlossen — siehe [§11](#10--korrekturlauf-2026-08-15-drei-bestätigte-lücken).**

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

### 2.3 Ein einziger, atomar geprüfter Schreibweg

*Fassung nach dem Korrekturlauf 2026-08-15 (§10.3). Die erste Fassung prüfte den
Fencing-Wert am Trigger; das reichte nicht.*

Jede Übernahme erhöht `fencing` um 1. Geschrieben wird ausschließlich über
**`helmut_verstehen_speichere`**: eine Datenbankfunktion, die unter dem **Row-Lock der
Vorgangszeile** fünf Dinge **gemeinsam** prüft und erst dann schreibt.

| geprüft | abgewiesen mit |
|---|---|
| aktuelle Reservierung = eigener Fencing-Wert | `fencing-veraltet` |
| Zustand = `modell-laeuft` | `zustand-<x>` |
| Besitzer = eigener Besitzer | `fremder-besitzer` |
| Lease noch gültig | `lease-abgelaufen` |
| keine neuere Fassung gespeichert | `ergebnis-neuer` |

Wissensobjekt **und** Abschluss der Reservierung liegen danach in **derselben
Transaktion**. Es gibt damit kein Fenster mehr, in dem das Ergebnis geschrieben, der
Vorgang aber noch offen wäre — und keines, in dem ein abgelöster Arbeiter zwischen
Prüfung und Schreibvorgang durchrutschen könnte.

**Der Trigger `helmut_ko_fencing_wache` ist der zweite, unabhängige Riegel.** Er
entscheidet nicht mehr am *Wert*, sondern an der *Herkunft*:

* außerhalb von `helmut_verstehen_speichere` darf `verstehen_fencing` **weder gesetzt
  noch geändert** werden (SQLSTATE `HV002`) — auch nicht auf denselben Wert;
* innerhalb wird zusätzlich Monotonie gegen die gespeicherte Fassung **und** gegen die
  aktuelle Reservierung erzwungen (`HV001`).

Technisch trägt das ein `before insert or update **of verstehen_fencing**`: der Trigger
feuert bei einem UPDATE nur, wenn die Spalte ausdrücklich im SET-Teil steht — unabhängig
davon, ob sich ihr Wert ändert. Genau diese Unterscheidung fehlte vorher.

**Bestehende Schreibpfade bleiben unberührt.** Anreicherung, Matching und
Nachklassifikation senden die Spalte nicht mit; ihr Teil-Update erwähnt sie nicht und
löst deshalb nicht einmal einen Triggeraufruf aus (nachgewiesen: Datenbanktest §13.1–13.3).
Zusätzlich strukturell abgesichert: `verstehen_fencing` steht nicht mehr in der
PostgREST-Schreibprojektion `V3_KO_WRITE_COLUMNS` — dieser Weg kann den Wert gar nicht
mehr tragen.

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
| **Kein automatischer Doppelaufruf** | `modellstart` vermerkt den Aufruf **vor** dem Absenden. Ab diesem Vermerk führt **kein** automatischer Weg zurück nach `offen`: `freigabe` greift nur noch aus `reserviert`, jeder andere Ausgang endet in `unbekannt` (§10.1). |
| **Unbekannter Ausgang sichtbar blockiert** | `zustand = 'unbekannt'`, `letzter_grund` benennt die Ursache, zählbar über `helmut_verstehen_kennzahlen()`, in der Lauftelemetrie als eigene Klasse `skipped-ausgang-unbekannt` (Gruppe „fehlgeschlagen"); der Rückgabewert des Laufs trägt zusätzlich `ausgang: "unbekannt"`. |
| **Keine erfundene Erfolgsmeldung** | Persistenz und Abschluss liegen in **einer** Transaktion (`helmut_verstehen_speichere`); scheitert sie, meldet der Lauf `skipped-veraltet` bzw. `skipped-store` statt „saved". |

**Die einzige automatische Auflösung ist eine belegte.** Findet `reserviere` in
`knowledge_objects` ein Ergebnis mit mindestens dem Fencing-Wert des Abgestürzten, dann
lag der Absturz **nach** dem Speichern — der Ausgang ist damit bekannt, und der Vertrag
löst selbst auf `fertig` auf. Ohne KI, ohne Betreiber (Datenbanktest §10.1).

Alles andere braucht eine ausdrückliche Entscheidung:
`helmut_verstehen_ausgang_aufloesen(vorgang, 'erneut' | 'aufgeben')`. `erneut` ist die
bewusste Zustimmung zu einem zweiten, bezahlten Aufruf; `aufgeben` ist terminal.

### 3.2 Der Zustandsvertrag vor und nach dem Modellstart

*Fassung nach dem Korrekturlauf 2026-08-15 (§10.1).*

| | **vor** `modellstart` | **nach** `modellstart` |
|---|---|---|
| Was gilt | es **kann** kein Aufruf abgesetzt worden sein | es **kann** ein bezahlter Aufruf gelaufen sein |
| Fehler (Budget, Wache, Reservierung) | `freigabe` ⇒ `offen`, sicher wiederholbar | — |
| Zeitüberschreitung · Verbindungsabbruch · unklarer Anbieterfehler | — | `unbekannt` |
| ungültige oder schemawidrige Modellantwort | — | `unbekannt` |
| Validierungs-, Schreibrechts- oder Speicherfehler | — | `unbekannt` |
| Prozessabsturz (meldet nichts) | Lease läuft ab ⇒ regulär übernehmbar | Lease läuft ab ⇒ `unbekannt` |
| **belegt** nichts abgesendet (Tagesbudget, Anbietergrenze) | `freigabe` ⇒ `offen` | `freigabe_ohne_aufruf` ⇒ `offen`, Zähler korrigiert |

Aus `unbekannt` entsteht **nie** automatisch ein weiterer Modellaufruf. Nur
`helmut_verstehen_ausgang_aufloesen(…, 'erneut')` gibt ihn wieder frei — oder der Vertrag
löst selbst auf, wenn das Ergebnis nachweislich doch vorliegt.

**Der Beleg „nicht abgesendet" ist ein Beleg, keine Vermutung.** Er entsteht an der
KI-Engstelle selbst: `ai.markiereNichtGesendet` markiert genau die Fehler, die
**nachweislich vor** `https.request(…)` entstehen — Tagesbudget und Anbietergrenze. Fehlt
die Marke, gilt „unbekannt". Die Richtung des Irrtums ist Absicht: teurer und ehrlich
statt billig und falsch.

**Die verbleibende Ungenauigkeit, ehrlich benannt:** stirbt der Prozess zwischen dem
erfolgreichen `modellstart` und dem Absenden, hat kein Aufruf stattgefunden — der Vertrag
stuft den Vorgang trotzdem als `unbekannt` ein. Das ist die konservative Seite des
Irrtums: kein Doppelaufruf, sondern ein sichtbarer Vorgang, der eine Entscheidung braucht.

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
Betriebssystemprozess** (`spawn psql`), kein gemeinsamer JavaScript-Faden.
**103 PASS / 0 FAIL** (Stand Korrekturlauf 2026-08-15; vorher 68).

| § | Nachweis | Ergebnis |
|---|---|---|
| 1 | Migration vorwärts → rückwärts → erneut vorwärts an frischer Datenbank | restlos, idempotent; ohne `knowledge_objects` bricht sie ehrlich ab |
| 2 | RLS an+erzwungen, keine Policy, 0 Rechte für anon/authenticated/PUBLIC, fester `search_path`, kein `SECURITY DEFINER` | 6/6 |
| 3 | **20 gleichzeitige Arbeiter auf denselben Vorgang** | genau **1** Berechtigung, genau **1** erfolgreicher `modellstart`, `ki_aufrufe = 1` |
| 4 | **8 verschiedene Vorgänge gleichzeitig**; zusätzlich 24 Arbeiter auf 8 Vorgänge | 8 aktive Leases zum selben Zeitpunkt, 8 gleichzeitig auf `modell-laeuft`; 24 → genau 8 Berechtigungen |
| 5 | Lease-Verlust an einen Nachfolger | alter Besitzer: kein Schreibrecht, kein Abschluss |
| 6 | Veraltetes Überschreiben | Datenbank weist ab — auch bevor der neue Besitzer geschrieben hat |
| 7 | Absturz **vor** dem Modellaufruf | reguläre Übernahme, Fencing +1, `ki_aufrufe = 0` |
| 8 | Absturz **nach** dem Modellaufruf | `ausgang-unbekannt`, dauerhaft blockiert, `ki_aufrufe` bleibt 1, in den Kennzahlen sichtbar |
| 9 | Idempotenz | gleiche Eingabe → `bereits-fertig`; 20 gleichzeitige Wiederholungen → **0** Berechtigungen; neue Eingabe → zugelassen |
| 10 | Vormerkungen | 20 gleichzeitige Erhöhungen ergeben **genau 20**; alter Erfolgsmelder löscht nicht |
| 11 | Auflösung des unbekannten Ausgangs | automatisch bei belegtem Ergebnis; sonst nur `erneut`/`aufgeben` |
| 12 | Fehlerhafte Argumente | Fehler statt stillem Erfolg; unbekannter Zustand strukturell ausgeschlossen |
| 13 | Fremde Schreibpfade | unberührt (Anreicherung/Matching laufen durch); ein Fencing-Wert von außen wird abgewiesen — auch ein gleich hoher |
| **14** | **abgelaufene Lease OHNE Nachfolger** (Lücke 2) | Schreibrecht `false`, Speicherweg `lease-abgelaufen`, **0** geschriebene Zeilen; ein gültiges Lease behält sein Recht |
| **15** | **F1 gespeichert · F2 reserviert · erneuter F1** (Lücke 3) | `fencing-veraltet`, Bestand unverändert `F1`; auch mit vorgetäuschtem F2: `fremder-besitzer` |
| **16** | **nach dem Modellstart kein Weg zurück nach `offen`** (Lücke 1) | `freigabe` wirkungslos, Zustand bleibt `modell-laeuft`, `ausgang_unbekannt` → `blockiert`, nächster Lauf `ausgang-unbekannt`, `ki_aufrufe = 1` über beide Läufe; der belegte Fall hat einen eigenen, eng gefassten Weg |
| **17** | **Atomarität des Speicherwegs** | Schreiben und Abschluss gemeinsam; nur übergebene Spalten werden geschrieben; unbekannte Schlüssel werden ignoriert; fremde Vorgangskennung → Fehler statt stillem Erfolg |

### 5.2 `scripts/verstehen-cas-vertrag-test.js` — die Anwendungsseite

Offline, gegen eine Attrappe der SQL-Semantik.
**107 PASS / 0 FAIL** (Stand Korrekturlauf 2026-08-15; vorher 68). Kernpunkte:

* **§3** vollständige Reihenfolge belegt: `reservieren → modellstart → KI → schreibrecht →
  speichern(+abschluss)`; Speichern und Abschluss sind **ein** Schritt.
* **§13** **acht verschiedene Vorgänge laufen im Fachkern wirklich gleichzeitig**
  (gemessener Höchststand 8) — und die Gegenprobe: **ohne** Vertrag bleibt derselbe Lauf
  seriell (Höchststand 1). Der Riegel greift.
  *Korrekturlauf: die frühere Zusage über die **Wanduhr** ist ersatzlos entfallen. Sie hat
  in einer geteilten Sandbox die Maschine gemessen, nicht die Parallelität, und schlug
  auch am **unveränderten** Bestand fehl (262–291 ms gegen ein Budget von 200 ms). Der
  gemessene Höchststand ist der deterministische, aussagekräftigere Beleg; die Dauer wird
  nur noch berichtet.*
* **§14** **20 gleichzeitige Arbeiter auf denselben Cluster**: genau 1 Modellaufruf,
  genau 1 Speicherung, 19 geschlossen zurückgestellt, kein leeres Ergebnis.
* **§12** fail closed an **jeder** Vertragsstelle (Reservierung, Modellstart, Schreibrecht,
  Speicherweg) — eine nicht prüfbare Zusage erlaubt nichts und wird nach dem Modellstart
  als `unbekannt` geführt.
* **§16** (neu) **at most once über ZWEI aufeinanderfolgende Läufe**, je Fehlerfall
  einzeln: Zeitüberschreitung · Verbindungsabbruch · unklarer Anbieterfehler · ungültige
  Antwort · schemawidrige Antwort · Speicherfehler · Absturz im Speichern ·
  Prozessabbruch. **Jeweils höchstens ein Modellaufruf insgesamt**, der zweite Lauf
  sichtbar blockiert.
* **§17** (neu) ein **belegbar nicht abgesendeter** Aufruf darf erneut versucht werden:
  erster Lauf 0 Modellaufrufe und Zustand wieder `offen`, zweiter Lauf versteht —
  **genau ein Modellaufruf insgesamt**.
* **§18** (neu) abgelaufene Lease **ohne Nachfolger**: nicht gespeichert, Ausgang
  `unbekannt`, kein zweiter Aufruf im Folgelauf.
* **§19** (neu) F1 gespeichert · F2 reserviert · erneuter F1-Schreibversuch → abgewiesen,
  Bestand unverändert.
* **§15** Cron, Warteschlange und Lambda benutzen denselben Fachpfad; es gibt genau **eine**
  `understandOneCluster`.

### 5.3 `scripts/verstehen-cas-mutationsprobe.js` — kann die Suite überhaupt rot werden?

Je EIN Schutzmechanismus wird aus einer **In-Memory-Kopie** der Migration entfernt (die
Datei selbst bleibt unangetastet), die Mutation in eine Wegwerf-Datenbank eingespielt und
der Schaden nachgewiesen. **ROT 9 / Löcher 0** (Stand Korrekturlauf 2026-08-15; vorher 6).
Vorher wird die **Grundlinie** geprüft — eine bereits beschädigte Grundlinie würde jede
Mutation aussagelos machen.

| Mutation | Entfernter Schutz | Nachgewiesener Schaden |
|---|---|---|
| M1 | atomare Erhöhung → Lesen-Ändern-Schreiben | 20 gleichzeitige Erhöhungen ergeben **3** statt 20 |
| M2 | monotoner Fencing-Wert | ein **nie berechnetes** Ergebnis wird als fertig gemeldet (falsches Grün) |
| M3 | Row-Lock in `reserviere` | **15** berechtigte KI-Ausführungen statt 1 |
| M4 | Lease-/Besitzerprüfung im Schreibrecht | der ALTE Besitzer bekommt Schreibrecht zurück |
| M5 | Fencing-Riegel am Wissensobjekt | ein altes Ergebnis überschreibt das neuere |
| M6 | Sperre des unbekannten Ausgangs | der unbekannte Ausgang wird **still wiederholt** (zweiter KI-Aufruf) |
| **M7** | **Lücke 1** — `freigabe` wirkt wieder aus `modell-laeuft` | ein Fehler nach dem Modellstart öffnet den Vorgang wieder → **zweiter Modellaufruf** |
| **M8** | **Lücke 2** — Lease-Zwang in `schreibrecht` **und** `speichere` | abgelaufene Lease **ohne Nachfolger** speichert trotzdem |
| **M9** | **Lücke 3** — Triggerlogik in der Originalfassung (Wertgleichheit springt ab) | F1 gespeichert + F2 reserviert → ein erneuter F1-Schreibversuch kommt **durch** |

M2 brauchte im Korrekturlauf einen neuen Schadensnachweis: der alte („der abgelöste
Arbeiter schließt mit seinem Ergebnis ab") wird inzwischen von der **zusätzlichen**
Besitzerprüfung in `abschluss` aufgefangen — die Mutation blieb grün, obwohl der Schutz
fehlte. Der neue Nachweis hängt an dem, was allein die Monotonie leistet: ohne sie kann
die Datenbank die Generationen eines Vorgangs nicht mehr trennen und meldet einen nie
berechneten Vorgang als fertig. **Das ist genau der Fall, für den Mutationsproben da
sind** — ein grüner Test, dessen Schutz längst woanders liegt.

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

### 5.4 CI auf den Sprint-Commits

**Lauf 522, Commit `ff04b54` (Korrekturlauf 2026-08-15, PR #248) — beide Pflicht-Checks
grün:** `Syntax + Offline-Suiten` ✅ (00:53:40–01:01:44 UTC) · `Browser-/Mobile-Smoke
(Chromium)` ✅. Damit ist der Korrekturlauf im CI vollständig grün; die lokal roten sechs
Suiten sind Sandbox-Bedingungen (nicht installierte npm-Abhängigkeiten, lokaler
Blob-/Auth-Store, Netzzugriff) und auf unverändertem `main` identisch rot nachgewiesen.

**Lauf 521, Commit `e69328e`:** beide Pflicht-Checks grün.

**Lauf 520, Commit `a78d6e8` (PR #248).** `Browser-/Mobile-Smoke (Chromium)`: **grün**.
`Syntax + Offline-Suiten`: **261 von 262 Suiten grün** in 452 s — beide neuen Suiten
darunter (`verstehen-cas-vertrag-test.js` PASS; `verstehen-cas-datenbank-test.js` meldet
ohne PostgreSQL im Runner ehrlich „übersprungen, Nachweis offen" und endet mit Exit 0 —
der Datenbanknachweis wird lokal geführt, nicht im CI).

**Die eine rote Suite ist `werkzeug-lesefehler-test.js` und nicht dieser Sprint.** Sie ist
als **F-PORT** bekannt und in `CURRENT_STATE.md` §6 als PR #216 / OP-28 geführt: die
gescheiterte Zusage („Netzwerkfehler: Meldung nennt Quelle und Fehlerklasse") hängt daran,
dass ein *soeben geschlossener* lokaler Port sofort `ECONNREFUSED` liefert — im CI kann ihn
inzwischen ein anderer Prozess belegt haben. Dieselbe Suite lief auf demselben Branch
**lokal grün** (42+1 Zusagen, 1 749 ms). Der Sprint fasst weder das Werkzeug noch den
Lesepfad an, den sie prüft.

Ein Folge-Commit belegt jeweils ausschließlich das CI-Ergebnis in dieser Datei.

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
2. **Der Trigger liegt auf `knowledge_objects`.** Er feuert nur, wenn ein Schreibvorgang
   `verstehen_fencing` ausdrücklich setzt (§2.3, Datenbanktest §13.1–13.3) — aber er liegt
   auf der zentralen Tabelle. Ein künftiger Schreibpfad, der die Spalte mitsendet, würde
   mit `HV002` **abgewiesen**, nicht stillschweigend geduldet. Das ist gewollt (nur ein
   Weg darf den Wert setzen) und muss bei jeder Erweiterung des KO-Schreibpfads bekannt
   sein. Die Spalte steht in keiner Leseprojektion und seit dem Korrekturlauf auch in
   keiner PostgREST-Schreibprojektion mehr.
5. **Ein direkter SQL-Schreibvorgang mit `service_role` bleibt möglich.** Wer die
   Datenbank unmittelbar beschreibt, kann Inhalte eines Wissensobjekts ändern, solange er
   `verstehen_fencing` nicht anfasst — davon ist ein legitimes Teil-Update aus
   Anreicherung oder Matching nicht unterscheidbar. Der Vertrag schützt den
   *Verstehenspfad*, nicht die Tabelle gegen jeden denkbaren Schreiber. Für den
   Auftragsfall (ein abgelöster Verstehenslauf) ist das geschlossen, weil dieser Pfad
   ausschließlich über `helmut_verstehen_speichere` läuft.
6. **Der Beleg „nicht abgesendet" ist eine Codeeigenschaft, keine Laufzeitprüfung.** Die
   Datenbank kann ihn nicht nachprüfen; sie stellt nur sicher, dass er über einen eigenen,
   eigens berechtigten Weg (`helmut_verstehen_freigabe_ohne_aufruf`) laufen muss und eine
   eigene Spur hinterlässt. Wer künftig eine Fehlerklasse als „nicht abgesendet" markiert,
   muss belegen, dass sie den HTTP-Aufruf nicht erreichen kann.
3. **Die Parallelität ist lokal belegt, nicht in Production.** Alles über Parallelität 1
   hinaus ist eine Betreiberentscheidung nach Stufenplan, nicht eine Codefolge.
4. **A2 ist eine Annahme, keine Messung.** Sie ist bewusst pessimistisch gewählt, aber
   nicht aus Production abgeleitet; die einzige echte Messung bleibt der Fünferlauf.

## 10 · Korrekturlauf 2026-08-15: drei bestätigte Lücken

Ein Review der ersten Fassung hat **drei Lücken** bestätigt. Alle drei sind geschlossen,
alle drei sind einzeln durch eine Mutationsprobe belegt (M7, M8, M9 in §5.3). Die
Migration `20260814180000` wurde dafür **an Ort und Stelle korrigiert** — sie ist nirgends
angewendet, weder in Production noch sonst wo, und eine Korrekturmigration auf eine nie
angewendete Migration wäre eine Fiktion.

### 10.1 Lücke 1 — nach dem Modellstart wurde automatisch wieder geöffnet

**Ursache.** Beide Verstehenspfade endeten in einem *allgemeinen* `finally`:

```js
} finally {
  if (vertrag && reservierung && !abgeschlossen) {
    await vertrag.freigabe({ … });     // -> zustand = 'offen'
  }
}
```

`helmut_verstehen_freigabe` akzeptierte `zustand in ('reserviert','modell-laeuft')`.
Damit führte **jeder** Fehler nach dem Modellstart — Zeitüberschreitung,
Verbindungsabbruch, unklarer Anbieterfehler, ungültige Antwort, Validierungsfehler,
Speicherfehler — den Vorgang zurück auf `offen`. Der nächste Cron-Lauf reservierte ihn
regulär und bezahlte **denselben Aufruf ein zweites Mal**. Die Zusage „at most once" galt
faktisch nur für den Prozessabsturz, also genau für den Fall, den niemand meldet.

**Korrektur, in dieser Reihenfolge:**

1. **In der Datenbank**, damit die Zusage nicht am Aufrufer hängt: `freigabe` greift nur
   noch aus `reserviert`. Neu: `helmut_verstehen_ausgang_unbekannt` setzt `unbekannt` für
   den eigenen, noch aktuellen Vorgang.
2. **Im Fachkern**: `understanding.js` führt einen ausdrücklichen Zustand
   `modellGestartet` und verzweigt im `finally` dreifach — `unbekannt` nach dem
   Modellstart, `freigabeOhneAufruf` bei **belegtem** Nichtabsenden, `freigabe` davor.
3. **An der KI-Engstelle**: `ai.markiereNichtGesendet` markiert die Fehler, die
   nachweislich vor `https.request(…)` entstehen (Tagesbudget, Anbietergrenze). Nur sie
   gelten als Beleg. Fehlt die Marke, gilt `unbekannt`.
4. **In der Meldung**: der Rückgabewert trägt `ausgang: "unbekannt"`. Es wird nicht
   behauptet, es sei kein Aufruf erfolgt, wenn das nicht belegbar ist.

Wo *fail closed* nicht mehr weiterhilft, gibt es bewusst **keinen** Notausgang: lässt sich
`unbekannt` nicht schreiben (DB-Fehler), bleibt die Zeile auf `modell-laeuft` stehen und
läuft über das ablaufende Lease von selbst in `unbekannt`. Ein Rückfall auf `freigabe`
wäre genau die Lücke.

**Nachweis.** Vertragstest §16: acht Fehlerfälle, jeder über **zwei aufeinanderfolgende
Läufe**, jeweils **höchstens ein** Modellaufruf insgesamt. Datenbanktest §16.
Mutationsprobe M7.

### 10.2 Lücke 2 — abgelaufene Lease ohne Nachfolger

**Ursache.** `helmut_verstehen_schreibrecht` prüfte Besitzer, Fencing-Wert und Zustand —
**nicht** aber, ob das Lease noch gilt:

```sql
where res.vorgang_id = p_vorgang_id
  and res.besitzer   = p_besitzer
  and res.fencing    = p_fencing
  and res.zustand    = 'modell-laeuft';    -- kein lease_bis > now()
```

Solange **kein Nachfolger** übernommen hatte, blieb die Zeile unverändert stehen — ein
beliebig lange angehaltener Arbeiter bekam sein Schreibrecht deshalb noch immer
bestätigt. Ein Lease ohne Ablaufzwang ist kein Lease.

**Korrektur.** `and res.lease_bis is not null and res.lease_bis > now()` — und dieselbe
Prüfung, verbindlich, im neuen atomaren Speicherweg (§10.3). Ein **erneuerbarer**
Lease-Vertrag wurde bewusst *nicht* gebaut: erneuert wird nur, solange das Lease noch
gilt; ein abgelaufenes ist endgültig verloren, und sein Ausgang gehört nach `unbekannt`.

**Nachweis.** Datenbanktest §14 (Zeile gehört noch dem alten Besitzer, Schreibrecht
`false`, Speicherweg `lease-abgelaufen`, **0** geschriebene Zeilen; ein gültiges Lease
behält sein Recht). Vertragstest §18. Mutationsprobe M8.

### 10.3 Lücke 3 — die Fencing-Umgehung bei Wertgleichheit

**Ursache.** Der Trigger sprang ab, sobald der geschriebene Wert dem gespeicherten
entsprach:

```sql
if new.verstehen_fencing is null
   or (tg_op = 'UPDATE' and new.verstehen_fencing is not distinct from old.verstehen_fencing) then
  return new;                       -- <- hier ging der alte Arbeiter durch
end if;
```

Das war als Kostenriegel für fremde Teil-Updates gedacht (die tragen den Altwert mit),
riss aber ein Loch: **gespeichert F1 · aktuelle Reservierung F2 · alter Arbeiter schreibt
erneut F1** ⇒ `new = old = F1` ⇒ Prüfung übersprungen ⇒ veralteter Inhalt geschrieben.
Am *Wert* allein sind die beiden Fälle nicht unterscheidbar.

**Korrektur — zwei unabhängige Riegel:**

1. **Ein wirklich atomarer Speicherweg.** `helmut_verstehen_speichere` prüft Besitzer,
   aktuelle Reservierung, Fencing-Wert, Zustand und Lease **gemeinsam** unter dem Row-Lock
   der Vorgangszeile und schreibt erst dann — Wissensobjekt und Abschluss in **einer**
   Transaktion (§2.3). Der Auftragsfall endet dort mit `fencing-veraltet`, ohne dass eine
   einzige Spalte angefasst wird.
2. **Der Trigger entscheidet an der Herkunft statt am Wert.** `before insert or update
   **of verstehen_fencing**` feuert bei einem UPDATE nur, wenn die Spalte ausdrücklich
   gesetzt wird — auch bei gleichem Wert. Außerhalb des geprüften Wegs ist das verboten
   (`HV002`).

**Und `helmut_verstehen_abschluss` prüft jetzt den Besitzer** (Auftragsfrage: „reicht
Fencing allein?"). Antwort: **nein.** Freigabe und `unbekannt` erhöhen den Fencing-Wert
*nicht*; ein später eintreffender Melder hätte eine bereits blockierte Zeile
stillschweigend wieder auf `fertig` gesetzt. `abschluss` verlangt deshalb Besitzer **und**
`zustand = 'modell-laeuft'`.

**Bestehende Schreibwege sind nachweislich unbeschädigt** (Datenbanktest §13.1–13.3):
ein Wissensobjekt ohne Fencing-Wert entsteht unverändert, ein Teil-Update aus Anreicherung
oder Matching läuft durch — auch bei gesetztem Fencing-Wert. Zusätzlich strukturell:
`verstehen_fencing` ist aus der PostgREST-Schreibprojektion entfernt.

**Nachweis.** Datenbanktest §15 (F1/F2/F1 → `fencing-veraltet`, Bestand unverändert) und
§13.4–13.6. Vertragstest §19. Mutationsprobe M9.

### 10.4 Was der Korrekturlauf **nicht** getan hat

Keine Migration angewendet, keine Umgebungsvariable, kein Flag, keine Daten, kein
Deployment, kein Production-Lauf, kein Secret gelesen, keine AWS-Ressource berührt. Die
Freigabe für 25 bis 500 Mandate ist **nicht** erteilt und wird hier auch nicht behauptet
(§7 bleibt ein Rechenmodell).

## 11 · Nächster Schritt

**Genau einer:** den PR reviewen und mergen (ändert Production nicht — alles Default-AUS).
Erst danach, und als getrennte Betreiberentscheidung, die Migration `20260814180000`
anwenden und `HELMUT_VERSTEHEN_CAS=on` im Schattenbetrieb beobachten (Parallelität bleibt
dabei zunächst 1: der Vertrag wirkt dann, ohne dass sich der Durchsatz ändert).
