# Skalierung 25 / 50 / 100 Mandate — Kapazität, Kriterien, Nachweise, Aktivierungsplan

**Stand:** 2026-08-25 (Korrekturrunde 4) · **Ausgangscommit:** `24a895ed` (= `main`, Merge PR #269)
**Kanonische Stelle für die Skalierung auf 25/50/100.** Ältere Skalierungsdokumente bleiben
gültig für ihren jeweiligen Gegenstand:
[`skalierung-200-mandate.md`](skalierung-200-mandate.md) (Rechenmodell 200),
[`op30-kapazitaet-morgenslots-2026-08-09.md`](op30-kapazitaet-morgenslots-2026-08-09.md)
(Slot-Stufenplan 5→200),
[`op30-zielarchitektur-2026-08-13.md`](op30-zielarchitektur-2026-08-13.md) §14 (Stufe 2).

---

## 0 · Die fünf Zustände — strikt getrennt

Diese Datei verwendet ausschließlich diese Begriffe. Sie werden **nie** vermischt.

| # | Zustand | Bedeutung |
|---|---|---|
| **Z1** | technisch vorbereitet | Code, Werkzeuge und Tests existieren und sind lokal grün |
| **Z2** | mit synthetischer Last getestet | echter Motor, echte Datenbank, **Attrappen** für KI und Netz |
| **Z3** | mit realistischer Last getestet | echte Laufzeiten, echte Datenbankpfade, echte externe Dienste |
| **Z4** | für Aktivierung freigegeben | ausdrückliche Gründerfreigabe liegt vor |
| **Z5** | real in Production aktiv | Mandate sind angelegt und arbeiten |

**Ein Nachweis auf Z2 ist niemals ein Nachweis auf Z3, und Z3 ist niemals Z4.**

### 0.1 Verbindlicher Stand (Fassung 2026-08-25/4)

Eine frühere Fassung sagte „**Z1 und Z2 für 25/50/100 erreicht**". Das war **zu weit** und
ist **zurückgenommen**. Verbindlich gilt:

| Aussage | Stand |
|---|---|
| **Werkzeuge und Änderungssatz dieses PR** | **lokal vollständig belegt** (281/281 Suiten, gezielte Tests, echte PostgreSQL) |
| **Synthetischer Motorlasttest 25/50/100** | **bestanden** (60 PASS, zweimal, Attrappen für KI und Netz) |
| **Z1 — technische Gesamtbereitschaft für 25/50/100** | **weiterhin teilweise / offen** |
| **Z3 — realistischer Lastnachweis** | **nicht erreicht** |
| **Z4 — Freigabe** | **nicht erteilt** |
| **Z5 — real aktiv** | **nur die bestehenden 5 Mandate** |
| **Production-Freigabe** | **keine** |

**Warum Z1 nicht vollständig ist** — sechs Punkte, die zur technischen Betriebsbereitschaft
gehören und offen sind:

1. die **Ankunftskennzahl ist nicht angewendet** (F9) — ohne sie ist die Stufe-2-Bedingung
   „Abfluss ≥ Ankunft" nicht messbar;
2. **Fluid Compute ist unbestätigt** — jede Laufzeit über 300 s bleibt eine Hypothese (§6.1);
3. **Supabase unter realistischer Last ist ungeprüft** — der Lasttest lief gegen eine lokale
   PostgreSQL; auch die **Verbindungsfrage** ist offen (§4.3a);
4. der **KI-Tagesdeckel** ist für die Stufen 25/50/100 nicht festgelegt (§5.2), und ob er
   bei **25** überhaupt reißt, ist **modellabhängig und damit unentschieden** (§2c);
5. es gibt **drei reguläre Abflussläufe/Tag**, nicht elf (§2a) — der Abstand zur
   hochgerechneten Menge ist damit größer als zuvor dargestellt;
6. die **Quellenversorgung der vorbereiteten Landtagsprofile fehlt** (§8.0).

Belegt ist damit: *die Werkzeuge sind fertig und der Motor trägt die Menge* — **nicht**:
*Helmut ist für 25 Mandate betriebsbereit*.

### 0.2 Was die Korrekturrunde 4 (2026-08-25) geändert hat

Sieben bestätigte Widersprüche behoben, zwei Ausgangsbefunde **widerlegt**:

| # | Befund | Ergebnis |
|---|---|---|
| 1 | Veraltete Testzahlen (42 PASS, 24 PASS, 279/279) | **bestätigt** — berichtigt auf 117 / 30 / 281 (§4.4, §4.6, §4.7) |
| 2 | „~11 schwere Slots" als Abflusskapazität | **bestätigt** — es sind **drei** reguläre Abflussläufe (§2a), testgesichert |
| 3 | 8/12/20 Läufe als bewiesener Bedarf | **bestätigt** — jetzt ausdrücklich als vorsichtige **Hochrechnung** ausgewiesen (§2) |
| 4 | KI-Deckel als `100 + 30 = 130` gerechnet | **bestätigt** — Gesamtobergrenze ist **100**; Limit und Reserve sind getrennte Eingaben (§5.2, `kapazitaetsmodell-test.js` §B0) |
| 5 | Stapelprovisionierung legte Mandate **aktiv** an | **bestätigt** — Anlage und Aktivierung sind jetzt technisch getrennt (§4.5a) |
| 6 | Zu weite Aussagen zu Datenbankverbindungen | **bestätigt** — auf das Belegbare zurückgeführt (§4.3a) |
| 7 | Indexfrage der Ankunftskennzahl offen | **bestätigt** — lokal gemessen und **entschieden**: kein Index, F9 unverändert (§4.9) |
| 8 | „Die 20 Profile erfüllen die Zweitquellenanforderung nicht" | **widerlegt in dieser Form** — die Zweitquelle wurde in Lauf 4 **bewusst als doppelte Beweislogik entfernt**; die Bestätigung steht auf **einer** amtlichen Quelle je Profil. Die echte Lücke ist die **Quellenversorgung** (gesperrte Landesmodule), nicht die Verifikation (§8.0) |
| 9 | „80 weitere Kandidaten mit Indexbelegen" | **widerlegt** — eine solche Liste existiert im Repository **nicht** (§8.0) |

Ebenfalls berichtigt: der Alleinvertretungsanspruch von `scripts/skalierungsmodell.js`
(„genau EINE Rechenquelle") — es gibt **drei** fachlich relevante Modelllinien, jetzt
nebeneinander mit Zweck und Grenze dokumentiert (§2c). Und die Frage, warum ein beobachteter
Lauf weit unter der geplanten Menge blieb, ist aus dem Protokoll beantwortet statt vermutet
(§2b).

---

## 1 · Belegter Ausgangszustand (gemessen, 2026-08-25)

Rein lesende SELECTs gegen Production (Supabase `ddckuvvpcytqbyfmbvie`, PostgreSQL 17.6.1).
Keine Schreiboperation, kein `EXPLAIN ANALYZE`.

| Größe | Wert | Bewertung |
|---|---|---|
| aktive Mandate | **5** | Z5 für 5 Mandate |
| `helmut_jobs` / `helmut_job_outbox` | 1123 / 888 | deckt sich mit 1124→1123 bzw. 889→888 nach der Neutralisierung |
| Status `fehlgeschlagen` | **0** | `endgueltig_fehler = 0` |
| hängende Leases | **0** | |
| verwaiste Outbox-Zeilen | **0** | |
| Dubletten über `idempotency_key` | **0** | |
| neu / abgeschlossen in 24 h | **455 / 456** | Abfluss ≥ Ankunft |
| ältester fälliger Auftrag | **2,3 h** | < 24 h |

### 1.1 Arbeitsprofil (24 h, 5 Mandate)

| `job_type` | global | neu 24 h |
|---|---|---|
| `source_fetch` | ja | 338 |
| `document_understanding` | ja | 98 |
| `source_fetch` | nein | 9 |
| `briefing_materialization` | nein | 5 |
| `mandate_projection` | nein | 5 |

**Mandatsgebunden 19/Tag (3,8 je Mandat), global 436/Tag.**

---

## 2 · Kapazitätsmodell — an der Messung geeicht

`source_fetch`-Aufträge tragen `payload.beispielMandate`: Quellenabrufe sind über Mandate
**nachfrageaggregiert und dedupliziert**. Gemessen:

| Nachfrage je Quelle | distinkte Quellen |
|---|---|
| von **allen 5** Mandaten (geteilt) | **139** |
| von **genau 1** Mandat (mandatsspezifisch) | **30** ⇒ 6 je Mandat |

Jede Quelle wird **2×/Tag** abgerufen (crawl 04:00 + 20:00 UTC).

```
source_fetch/Tag       = (139 + 6 × M) × 2
document_understanding = source_fetch × 0,29     (gemessen 98/338)
mandatsgebunden/Tag    = 3,8 × M                 (gemessen 19/5)
```

**Eichprobe:** für M = 5 liefert die Formel `(139 + 30) × 2 = 338`; gemessen sind **exakt 338**.

| Mandate | source_fetch | verstehen | mandatsgeb. | **Gesamt/Tag** | Minuten/Tag¹ | Läufe à 117¹ |
|---:|---:|---:|---:|---:|---:|---:|
| 5 (gemessen) | 338 | 98 | 19 | **455** | 17 | 3,9 → **4** |
| 25 | 578 | 168 | 95 | **841** | 31 | 7,2 → **8** |
| 50 | 878 | 255 | 190 | **1323** | 49 | 11,3 → **12** |
| 100 | 1478 | 429 | 380 | **2287** | 84 | 19,5 → **20** |

¹ Grundlage: **27,1 Abschlüsse/min** (117 in 259 s, Runbook §30.7, Worker 4/25/25).

> **Die Zahlen 8, 12 und 20 sind eine vorsichtige HOCHRECHNUNG, kein bewiesener Bedarf.**
> Sie stehen auf drei Stützen, von denen keine ein Nachweis für 25/50/100 Mandate ist:
>
> 1. **Ein einziger realer Wirkungslauf** — 117 Abschlüsse in 259 s (Runbook §30.7,
>    crawl 20:00 am 23.08., Worker 4/25/25). Eine Stichprobe der Größe 1, bei fünf
>    Mandaten, an einem Tag, mit einer bestimmten Quellenlage. Daraus wird der Divisor
>    117 je Lauf; jede Abweichung der echten Bedienzeit verschiebt alle vier Zeilen.
> 2. **Hochgerechnete Tagesmengen** — 841 / 1323 / 2287. Sie stammen aus der Formel
>    oben, die für M = 5 exakt trifft, aber für M = 25/50/100 **nicht gemessen** ist
>    (§2c, Modelllinie B).
> 3. **Ein nicht repräsentativ bewiesener Auftragsmix.** Die vier Auftragsarten haben
>    sehr unterschiedliche Bedienzeiten (geteilter Abruf ~11 s, Personenabruf ~30 s,
>    Verstehen ~20 s, Projektion/Briefing ~3 s — `scripts/kapazitaetsmodell-test.js`).
>    Der Divisor 117 mittelt sie zu **einer** Zahl und unterstellt damit, dass der Mix
>    bei 100 Mandaten derselbe bleibt wie in diesem einen Lauf. Dafür gibt es keinen Beleg.
>
> Die Zeile „Läufe à 117" ist deshalb eine **Größenordnung für die Planung**, nicht die
> Zahl der Läufe, die ein Betrieb bei 25/50/100 Mandaten braucht. Belastbar wird sie erst
> durch den realistischen Nachweis (Z3).

**Kernaussage:** der Motor skaliert **unterlinear** — 20× Mandate ergeben nur **5,0×** Arbeit,
weil 139 Quellen geteilt bleiben. Der Engpass ist nicht der Durchsatz, sondern die
**Anzahl der Abflussläufe** und der **KI-Tagesdeckel**.

**In welche Richtung das Modell irrt (wichtig für die Bewertung):** die 6 mandatsspezifischen
Quellen je Mandat stammen aus den 30 Quellen, die heute von **genau einem** der fünf Mandate
nachgefragt werden. Mit wachsender Mandatszahl werden einige davon zwangsläufig **geteilt**
(gleicher Ausschuss, gleiche Partei, gleiches Bundesland) und fallen aus dem
mandatsspezifischen Anteil heraus. Die 6 sind deshalb eine **Obergrenze**, und die
Hochrechnung **überschätzt** die Arbeit eher, als sie zu unterschätzen. Der Lasttest bestätigt
die Richtung unabhängig: der Planer erzeugt für 100 Mandate nur 490 statt der linear
fortgeschriebenen 593 `source_fetch` (§4.2).

---

## 2a · Wie viele Abflussplätze hat die Warteschlange wirklich? — **drei**

> **Berichtigung (2026-08-25/4).** Eine frühere Fassung führte als Risiko R2
> „19,5 nötig bei 100, **~11 schwere Slots vorhanden**". Die 11 war die Zahl der
> **Cron-Einträge in `vercel.json`** — nicht die Zahl der Läufe, die die Warteschlange
> leeren. Wer aus elf Abflussplätzen plant, plant mit dem knapp Vierfachen dessen, was es
> gibt. Testgesichert gegen Code und Konfiguration: `scripts/warteschlangen-abfluss-test.js`.

| Größe | Wert | Herleitung |
|---|---|---|
| Cron-**Einträge** konfiguriert | **11** | `vercel.json` |
| **Reguläre Abflussläufe/Tag** | **3** | crawl 04:00 · pipeline 16:00 · crawl 20:00 UTC |
| bedingter Ersatzlauf | **1** | GitHub-Actions-Watchdog, 05:30 UTC — **keine garantierte Kapazität** |
| Einträge ohne Warteschlangenabfluss | **8** | siehe unten |

**Der Weg, den es gibt — und nur diesen einen.** Die Warteschlange wird ausschließlich über
`runCronUeberWarteschlange` geleert (`server.js`). Dorthin führt genau ein Aufruf:
`cronSchwererPfad(...)` bei aktivem `HELMUT_SCALABLE_PIPELINE`. `cronSchwererPfad` wird von
genau **zwei** Routen benutzt — `/api/cron/crawl` und `/api/cron/pipeline` —, und diese zwei
Routen stehen mit **drei** Zeiteinträgen im Plan.

**Was die übrigen acht Einträge NICHT tun.** `morning-briefing` (05:00), `understanding`
(05:30/21:30), `lage-briefing` (05:45), `health-report` (06:00), `lage-briefing-nachlauf`
(06:10/06:22) und `lage-check` (10:00) rufen den Warteschlangenabfluss nicht auf. Die drei
Narrativslots (`lage-briefing` + zwei Nachlaufslots) würden über `narrativSlotLauf`
**ausschließlich Aufträge des Typs `tenant_narrative`** abarbeiten — und auch das nur, wenn
**beide** Flags gesetzt sind (`HELMUT_SCALABLE_PIPELINE` **und** `HELMUT_NARRATIV_QUEUE`).
`HELMUT_NARRATIV_QUEUE` ist aus und die zugehörige Migration `20260809_jobqueue_narrativ.sql`
ist nicht angewendet (F6); die Slots sind heute **inert**. Ein schwerer Cron, der diesen Pfad
nicht aufruft, ist kein Abflussplatz — auch dann nicht, wenn er lange läuft und viel tut.

**Warum der Watchdog nicht mitzählt.** `briefing-watchdog.yml` ruft zwar `/api/cron/pipeline`
und damit denselben Abflusspfad. Er ist aber ein **bedingter Ersatzlauf**: die Vorprüfung
(K7) sucht zuerst den regulären Erfolg. Findet sie ihn, läuft **kein** Ersatzlauf; scheitert
die Vorprüfung am Lesen, läuft ausdrücklich **auch keiner** (fail closed, damit kein blinder
schwerer Lauf einen laufenden doppelt). Nur ein manueller Dispatch mit `force_run=1` erzwingt
ihn. Ein Lauf, der genau dann ausfällt, wenn der reguläre Betrieb funktioniert, ist ein
Sicherheitsnetz — **keine planbare vierte Kapazität**. (Er ist außerdem oft 2–3 h verzögert,
`CURRENT_STATE.md` §3.)

**Unabhängige Gegenprobe im Repository:** die zentrale Skalierungsrechnung
`scripts/skalierungsmodell.js` führt denselben Parameter mit derselben Zahl und derselben
Begründung — `schwereLaeufeJeTag: 3`, „Herkunft: Cron-Definition (drei schwere Läufe)".

> **Keine Cron-Änderung und keine Erhöhung der Parallelität in dieser Runde.** Diese
> Feststellung ist eine **Konfigurationstatsache**, keine Empfehlung. Wie viel ein einzelner
> Lauf schafft, sagt sie nicht (dazu §2b).

---

## 2b · Warum endete der beobachtete Lauf weit unter der geplanten Menge?

Die Frage stammt aus dem ersten Lauf mit aktivem OP-30
([`op30-aktivierung-5-mandate.md`](op30-aktivierung-5-mandate.md) §15.4,
`cron-crawl-20260811200004-xyejr`). Sie ist berechtigt — die Antwort ist aber **nicht** die,
die man zuerst vermutet.

**Was die Quittung wirklich sagt** (die genauen Zahlen, gegen die hier geprüft wurde):

```
[cron/crawl/warteschlange] 266583ms geplant=193 neu=193 worker=2 erledigt=55
  wiederholt=2 endgueltigFehler=0 wiedervorgelegt=0 rotation=5 zustand=kritisch
```

| Größe | Wert |
|---|---|
| geplant / neu angelegt | 193 / 193 (plus 42 während des Laufs aus frischen Dokumenten ⇒ **235**) |
| erledigt | **55** · wiederholt 2 |
| zurückgestellt | **43** |
| endgültig fehlgeschlagen | 0 |
| **Laufzeit** | **266 583 ms** von 270 000 ms Slotbudget |

**Erster, wichtigster Befund: der Lauf endete NICHT vor Ausschöpfung der Laufzeit.** Er lief
266,6 s von 270 s — also **bis an sein Slotende**. Eine Formulierung wie „endete mit 58 von
193 Aufträgen vor Ausschöpfung der Laufzeit" trifft auf diesen Lauf nicht zu; die
verbuchte Menge war 55 erledigt + 2 wiederholt = **57**, und die Zeit war aufgebraucht.
(Ein Lauf, der *tatsächlich* vor dem Slotende endete, ist der Wirkungslauf vom 23.08.:
259 s von 280 s bei 117 Abschlüssen, Bilanz 137 = 117 + 8 vertagt + 12 wiederholt-offen.)

**Zweiter Befund: die dokumentierten Rückstellgründe nennen die Ursache selbst.** Die 43
zurückgestellten Aufträge verteilen sich laut Protokoll **ausschließlich** auf:

- **39 ×** `verstehen-uebersprungen: understanding-locked` — die Vorgangswache. Das Verstehen
  läuft je Vorgang exklusiv (`verstehen-vorgang:<id>`, `max: 1`), und
  `HELMUT_VERSTEHEN_PARALLELITAET` ist nicht gesetzt ⇒ wirkt als **1**
  ([`CURRENT_STATE.md`](../CURRENT_STATE.md) §4).
- **4 ×** `zeitbudget-des-laufs-erschoepft`.

**Dritter Befund: die Abhängigkeitskette erklärt den Rest.** `mandate_projection` und
`briefing_materialization` (je 5) blieben `wartend`, weil ihre Vorbedingung — das Verstehen —
offen war. Keine Projektion ohne Verstehen, kein Briefing ohne Projektion. Das ist der
vorgesehene Vertrag, kein Fehler.

**Die Ursachen sauber getrennt — und was davon belegt ist:**

| Mögliche Ursache | Für diesen Lauf | Beleg |
|---|---|---|
| fehlende Fälligkeit | **nein** — 193 Aufträge waren fällig und wurden angelegt | Quittung `geplant=193 neu=193` |
| **Abhängigkeiten** | **ja** — Projektion/Briefing warteten auf das Verstehen | Zustandstabelle §15.4 (10 Zeilen `wartend`) |
| **Rückstellung durch die Vorgangswache** | **ja, dominant** — 39 von 43 | Rückstellgründe §15.4 |
| **Zeitbudget** | **ja, nachrangig** — 4 von 43; der Slot war voll ausgeschöpft | 266 583 ms von 270 000 ms |
| Budgetdeckel (KI) | **kein Beleg** — `endgueltigFehler=0`, keine Budgetablehnung im Protokoll | Quittung |
| **Klassengrenze `verstehen` = 1** | **ja** — sie ist die Ursache hinter `understanding-locked` | `scalable-pipeline.KLASSEN_STANDARD.verstehen === 1` |
| Worker-Zahl / Rotation | **kein Beleg als Ursache** | siehe unten |

> **Ausdrücklich nicht behauptet:** dass Worker-Zahl oder Rotation die Ursache waren. Der
> Lauf fuhr `worker=2` und `rotation=5`; beide Werte stehen in der Quittung, aber **kein**
> Protokolleintrag führt einen zurückgestellten Auftrag auf sie zurück. Alle 43
> Rückstellungen tragen einen der zwei oben genannten Gründe. Mehr Worker hätten die 39
> Fälle an der Vorgangswache **nicht** gelöst — die Wache ist je Vorgang exklusiv, nicht je
> Worker. Wer hier „zu wenige Worker" liest, verwechselt eine **Klassengrenze** mit einer
> **Parallelitätsgrenze**.

**Was daraus folgt — und was nicht.** Die belegte Engstelle dieses Laufs war die
Verstehens-Klassengrenze in Verbindung mit der Abhängigkeitskette, nicht der Durchsatz des
Workers. Der spätere Wirkungslauf (117 Abschlüsse, 259 s, Worker 4/25/25, mit `HELMUT_VERSTEHEN_CAS=on`)
zeigt ein anderes Bild — er ist aber ebenfalls **ein** Lauf. **Diese Runde ändert nichts
daran:** keine Cron-Zeit, keine Cron-Reihenfolge, keine Worker-Zahl, keine Klassengrenze,
keine Parallelität. Die Frage „wie viele Läufe braucht es wirklich" beantwortet erst der
realistische Nachweis (Z3).

---

## 2c · Drei Modelllinien — nebeneinander, mit Zweck und Grenze

Für dieselbe Frage („wie viel KI-Arbeit entsteht bei M Mandaten?") existieren im Repository
**drei** Rechenwege mit deutlich verschiedenen Ergebnissen. Das ist kein Versehen und wird
**nicht durch Löschen einer Linie aufgelöst** — jede beantwortet eine andere Frage. Wer eine
Zahl benutzt, muss wissen, welche Linie sie liefert.

> **Zurückgenommen:** `scripts/skalierungsmodell.js` erklärte im Kopfkommentar, es gebe „ab
> jetzt **GENAU EINE** Rechenquelle" und „keine zweite Herleitung mehr". Das trifft nicht zu,
> solange die beiden anderen Linien fachlich in Gebrauch sind. Der Alleinvertretungsanspruch
> ist gestrichen; die Datei bleibt unverändert die Quelle **ihrer** Größen.

| | **Linie A — Klassenkapazität** | **Linie B — an der Fünfermessung geeicht** | **Linie C — Vollmodell aus dem Produktionscode** |
|---|---|---|---|
| **Ort** | `scripts/kapazitaetsmodell-test.js` | dieses Dokument, §2 / §5.1 | `scripts/skalierungsmodell.js` |
| **Zweck** | Wo ist der Engpass? Reserve **je Auftragsklasse**, damit eine einzelne knappe Klasse nicht in einer Gesamtreserve verschwindet | Wie viel Arbeit entsteht **heute** bei M Mandaten, hochgerechnet aus dem laufenden Betrieb | Vollständige Bandbreite inkl. Dubletten, Clustern, Nutzung, Speicher und Kosten — bis 1000 Mandate |
| **Eingabedaten** | Bedienzeiten je Klasse aus dem zweiten Fünferlauf (Runbook §19); Klassengrenzen aus dem Code | Production-`SELECT`s vom 25.08.: 139 geteilte + 30 mandatsspezifische Quellen, 338 `source_fetch`, 98 Verstehen, 19 mandatsgebunden je Tag | Abrufwege je Profil aus `scheduler`/`source-demand` (bei jedem Lauf neu gemessen), Katalogwege = 140 |
| **Gemessene Ausgangswerte** | 62–77 KI-Aufrufe/Tag bei 5 Mandaten | **455 Aufträge/Tag bei 5 Mandaten**; die Formel trifft für M = 5 exakt die gemessenen 338 | 519 Abrufe/Tag bei 5 Mandaten (41 Abrufaufträge) |
| **Annahmen** | Auslastung 50 % (A) bzw. 12,5 % (A2); KI-Faktor 0,43–1,3 je Verstehensauftrag | 2 Abrufe/Tag je Quelle; Verstehen = 0,29 × `source_fetch`; 6 mandatsspezifische Quellen je Mandat | Dublettenanteil, Cluster­größe, Anteil aktiver Mandate, Tokens je Aufruf — alle als Szenario Minimum/Realistisch/Stress |
| **Ergebnis 25 Mandate** | 204 Verstehensaufträge ⇒ **88–265** KI-Aufrufe/Tag | 168 Verstehensaufträge ⇒ **113 / 198 / 336** (niedrig/realistisch/hoch) | keine 25er-Stufe; für 5 Mandate bereits **35 / 391 / 3109** |
| **Ergebnis 100 Mandate** | 352 ⇒ **151–458** | 429 ⇒ **251 / 399 / 647** | — |
| **Darf verwendet werden für** | die Frage „welche Klasse reißt zuerst" und für die nötige Verstehens­parallelität | die Frage „reicht der Tagesdeckel bei M Mandaten" und für Größenordnungen der Tagesmenge | Obergrenzen, Speicherabschätzung, Deckelempfehlung mit ausgewiesener Herkunft |
| **Darf NICHT verwendet werden für** | eine Tagesmenge in Aufträgen (sie modelliert Zeit, nicht Auftragszahlen) | eine Aussage über 25+ Mandate als Messung — sie ist **an 5 Mandaten geeicht und dort hochgerechnet** | die Frage „was passiert heute" — ihr realistisches Szenario sagt 391 KI-Aufrufe/Tag bei 5 Mandaten, gemessen sind **62–77** (Faktor ~5 zu konservativ) |

**Der wichtigste offene Widerspruch, ehrlich benannt:** an der Stelle, die die
Aktivierungsentscheidung trägt — „trägt der Gesamtdeckel 100 die Stufe 25?" — **widersprechen
sich A und B**. Linie A sagt 88–265: der günstige Fall läge **knapp unter** 100. Linie B sagt
113–336: schon der günstigste Fall liegt **darüber**. Beide sind aus ihren Eingaben korrekt
gerechnet; keine ist gemessen. Verbindlich ist deshalb nur die Schnittmenge:

- **ab 50 Mandaten reißt der Deckel 100 in beiden Linien und in beiden Richtungen der
  Spanne** (Linie A: 110–333; Linie B: 160–444);
- **bei 25 Mandaten ist die Antwort modellabhängig** und damit **nicht entschieden**.

Wer die Stufe 25 freigeben will, braucht dafür eine **Messung**, keine dritte Rechnung.

---

## 3 · Abnahmekriterien — VOR dem ersten Lasttest festgeschrieben

> **Diese Kriterien wurden vor dem ersten Lauf festgelegt und werden nach einem Ergebnis
> nicht rückwirkend geändert.** Sie sind in einem eigenen Commit festgehalten, der dem
> Ergebniscommit vorausgeht.

### 3.1 Herleitung der Zeitgrenze

- reguläres Zeitfenster je Slot: `maxDuration` = **300 s** (`vercel.json`), Arbeitsbudget der
  schweren Crons **240–280 s**
- Sicherheitsreserve: der Lauf muss in **≤ 70 %** des Slotbudgets fertig sein
- erwarteter Durchsatz je Stufe aus §2

### 3.2 Verbindliche Kriterien (gelten für jede Stufe 25 / 50 / 100)

| # | Kriterium | Grenze |
|---|---|---|
| K1 | alle erwarteten Testaufträge eindeutig verbucht | Soll = Ist, exakt |
| K2 | Quittung und tatsächliche Verarbeitung deckungsgleich | Differenz 0 |
| K3 | unerwartete endgültige Fehler | **0** (absichtliche Fehler des Fehlermandats zählen nicht) |
| K4 | unbekannte Vorgänge | **0** |
| K5 | hängende Leases nach Laufende | **0** |
| K6 | Dubletten (doppelt erledigte Aufträge, doppelte `idempotency_key`) | **0** |
| K7 | mandatsfremde Lese-/Schreibzugriffe | **0** |
| K8 | verwaiste Outbox-Einträge | **0** |
| K9 | kein gesundes Mandat verhungert | jedes gesunde Mandat ≥ 1 Abschluss |
| K10 | Rückstau wächst nicht dauerhaft | Abfluss ≥ Ankunft über den Lauf |
| K11 | begrenzter Rückstau wird abgebaut | Restbestand nach Aufräumlauf = 0 |
| K12 | Laufzeit / Parallelität / DB-Verbindungen unter den Grenzen | Laufzeit ≤ 70 % Slotbudget; Verbindungen ≤ 50 % `max_connections` |
| K13 | fehlerhaftes Mandat beeinträchtigt gesunde nicht | gesunde Mandate 100 % abgeschlossen |
| K14 | Wiederaufnahme/Wiederholung ohne Doppelverarbeitung | jeder Auftrag genau 1× `erledigt` |
| K15 | Kosten innerhalb der dokumentierten Obergrenze | Attrappen ⇒ 0 KI-Aufrufe, 0 USD |

### 3.3 Stufenregel

Die nächste **nicht produktive** Teststufe wird nur ausgeführt, wenn die vorherige Stufe
**vollständig** bestanden ist. Das ist **keine** Freigabe für eine Production-Aktivierung (Z4).

---

## 4 · Testergebnisse

> **Lesehinweis.** Die Unterabschnitte sind historisch gewachsen und stehen **nicht** in
> Nummernfolge. Reihenfolge in dieser Datei: 4.1 Lasttest · 4.2 Unterlinearität ·
> 4.3 Grenzen der Zahlen · 4.3a Datenbankverbindungen · 4.4 Provisionierung ·
> 4.7 Gesamtlauf · 4.5 zwei Produktfehler · 4.6 Ankunftskennzahl · 4.5a Anlage und
> Aktivierung getrennt · 4.9 Indexfrage · 4.8 die 139 Befundlücken. Die Nummern bleiben
> stehen, damit Verweise aus PR-Beschreibungen und älteren Belegen weiter treffen.

### 4.1 Gestufter Belastungsnachweis — **Zustand Z2 (synthetisch)**

Werkzeug: `scripts/skalierung-stufen-lasttest.js`, ausgeführt am 2026-08-25 über
`scripts/lokal.js` gegen eine **lokale** PostgreSQL 16.13 (127.0.0.1:5433).

**Was echt war:** der Arbeitsplan aus dem Produktionscode (`planeArbeit` →
`kompiliereQuellenbedarf` + `planeMandatsarbeit`), die echten Migrationen, echte
Workerprozesse (eigener Node-Prozess, eigene Verbindung, eigener Lease-Besitzer, echter
`arbeite()`-Aufruf, echte Leases und Fencing), ein echtes Fehlermandat und ein echtes
langsames Mandat.

**Was Attrappe war:** die Aufgabenhandler. Kein Netzverkehr, kein Google-Abruf, kein
KI-Aufruf. **Damit ist dies ein synthetischer Nachweis (Z2), kein realistischer (Z3).**

**Ergebnis: 60 PASS / 0 FAIL über alle drei Stufen.**

| Mandate | Aufträge | Laufzeit | Durchsatz | erledigt | endgült. Fehler | Rest | häng. Leases | Verbindungen (Spitze, **lokal**) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 25 | 244 | 463 ms | 522,7/s | 242 | 2 (Fehlermandat) | 0 | 0 | 5 / 300 |
| 50 | 427 | 442 ms | 961,5/s | 425 | 2 (Fehlermandat) | 0 | 0 | 5 / 300 |
| 100 | 690 | 660 ms | 1042,4/s | 688 | 2 (Fehlermandat) | 0 | 0 | 5 / 300 |

**Fairness:** in allen drei Stufen hatten **alle** gesunden Mandate exakt gleich viele
Abschlüsse (min = max = 4). Kein Mandat verhungert.

**Fehlermandat und langsames Mandat:** das Fehlermandat scheiterte bei jedem Versuch und
erreichte nach den Wiederholungen den Endzustand `fehlgeschlagen` (K13b, die Probe war also
wirksam). Die gesunden Mandate waren dennoch **nach dem Hauptlauf vollständig** abgearbeitet
(K13) — ein krankes Mandat hält die gesunden nicht auf.

**Determinismus belegt — auf zwei Ebenen:**

1. **Der Plan.** Drei unabhängige Planungsläufe für 25 Mandate ergaben je **244 Aufträge**
   mit identischer SHA-256-Summe der sortierten Idempotenzschlüssel (`b7e397b0db3113f3`).
   Die Fixture `synthetische-mandate-1000.js` benutzt kein `Math.random`.
2. **Der ganze Lauf.** Ein **zweiter vollständiger Durchlauf** aller drei Stufen ergab
   erneut **60 PASS / 0 FAIL** mit **identischen** Mengen und Ergebnissen —
   244/427/690 Aufträge, 242/425/688 erledigt, je 2 endgültige Fehler (Fehlermandat),
   0 Rest, 0 hängende Leases, Verbindungsspitze 5/300. Abweichend waren **nur die
   Laufzeiten** (423/534/549 ms gegen 463/442/660 ms) — erwartbar, weil parallel die
   Offline-Gesamtsuite lief. Der Nachweis ist also **wiederholbar, nicht einmalig**.

### 4.2 Zweite, unabhängige Bestätigung der Unterlinearität

Der Planer erzeugt für 25 / 50 / 100 Mandate **194 / 327 / 490** `source_fetch`-Aufträge.
Eine Verdopplung der Mandate erhöht die Abrufe nur um Faktor 1,69 bzw. 1,50 — dieselbe
Dedup-Wirkung, die §2 aus den Production-Daten misst, hier unabhängig aus dem Planer.

### 4.3 Was diese Zahlen **nicht** sagen

Nachgeschärft nach Review 2026-08-25/2 — drei Grenzen, die vorher zu weit formuliert waren:

1. **Die Laufzeiten messen die LOKALE Mechanik, nicht die Wirklichkeit.** In Production
   dominieren die externen Abrufe: der reale Wirkungslauf brauchte **259 s für 117
   Abschlüsse** (0,45/s) — rund **2 300-mal langsamer**. Über die Gesamtdauer eines echten
   Tageslaufs sagt der Test nichts.
2. **Die Verbindungsspitze 5/300 ist ein LOKALER Messwert** einer selbst gestarteten
   PostgreSQL 16 mit `max_connections=300`. Sie ist **kein Supabase-Grenzwert** und **keine
   Aussage über den Pooler des Free-Plans**. Production spricht über PostgREST/HTTP mit
   PostgreSQL 17.6.1 und ganz anderen Verbindungsgrenzen — die hier **nicht** gemessen wurden.
3. **Der Test beweist NICHT, dass Supabase unter realistischer Production-Last kein Engpass
   wird.** Bewiesen ist ausschließlich: *die Warteschlangenmechanik selbst* — Reservieren,
   Lease, Fencing, Abschluss, Nebenläufigkeit — trägt bis 100 Mandate gegen eine lokale
   Datenbank. Ob der Supabase-Free-Plan die dabei entstehenden Abfragen, Verbindungen und
   Datenmengen trägt, ist **offen** und gehört zum realistischen Nachweis (Z3).

Die frühere Formulierung „Warteschlange und Datenbank sind bis 100 Mandate nicht der
Engpass" ging über die Belege hinaus und ist **zurückgenommen**.

### 4.3a Was über Datenbankverbindungen belegt ist — und was nicht

> **Zurückgenommen (2026-08-25/4):** jede Formulierung, Datenbankverbindungen seien für
> Helmut „praktisch irrelevant" oder durch den HTTP-Zugriff erledigt. Das ist zu weit.

**Belegt ist genau dies — nicht mehr:**

1. **Helmut spricht heute über HTTP/PostgREST**, nicht über eine eigene
   PostgreSQL-Verbindung. Der Anwendungscode hält keinen eigenen Verbindungspool.
2. **Eine einzelne Momentaufnahme** zeigte in Production eine geringe Zahl aktiver Backends.
   Eine Momentaufnahme ist eine Messung **zu einem Zeitpunkt**, kein Lastprofil.
3. **Diese Momentaufnahme beweist keine Verbindungsspitze bei 25, 50 oder 100 Mandaten.**
   Sie wurde bei fünf aktiven Mandaten und außerhalb eines schweren Slots genommen.
4. **Der interne Verbindungspool von PostgREST und das Verhalten von Supabase unter
   realistischer Last sind ungeprüft.** PostgREST hält selbst Verbindungen zur Datenbank;
   deren Zahl und Sättigung unter Last hat Helmut **nie gemessen** und kann sie aus einer
   Claude-Sitzung auch nicht messen.

**Praktische Folge:** die Verbindungsfrage bleibt ein **offener Punkt des realistischen
Nachweises (Z3)**, nicht ein erledigter. Sie ist ausdrücklich **nicht** durch den
synthetischen Lasttest beantwortet (dessen 5/300 eine lokale Zahl ist) und **nicht** durch
die HTTP-Architektur erledigt.

### 4.4 Provisionierung

`scripts/provision-stapel-test.js` — **117 PASS / 0 FAIL**. Abgedeckt: Wiederholungslauf ohne
Feldverlust, keine stille Reaktivierung, Vorprüfung des ganzen Pakets (unvollständig,
doppelte id, doppelte E-Mail, leeres Paket), Trockenlauf ohne Schreibvorgang, zweiter
identischer Stapellauf ohne Dubletten, fehlerhaftes Mandat ohne Teilzustand,
`weiterBeiFehler`, Mandantentrennung, eng begrenzte Rückwege (§13) und die vollständige
Trennung von Anlage und Aktivierung (§14, siehe §4.5a).

> **Berichtigung (2026-08-25/4):** hier stand **42 PASS**. Das war der Stand vor den beiden
> Reviewrunden; schon der Commit `69be0714` führte 83 PASS. Mit §14 sind es jetzt 117.

Bestandssuiten unverändert grün: `provision-tenant-test.js` 41 PASS,
`profil-bereitschaft-test.js` 91 PASS, `jobqueue-lasttest.js` 19 PASS (inkl. SIGKILL-Probe).

### 4.7 Gesamtlauf

**`node scripts/lokal.js -- node scripts/run-offline-tests.js` → 281/281 Suiten grün in
562 s, 0 FAIL.** Das sind die 277 Bestandssuiten plus die vier neuen dieses Sprints
(`provision-stapel`, `jobqueue-ankunft-datenbank`, `warteschlangen-abfluss`,
`jobqueue-ankunft-index-datenbank`).

> **Berichtigung (2026-08-25/4):** frühere Fassungen nannten **279/279**. Das war richtig für
> den Stand `69be0714`; die Korrekturrunde bringt zwei weitere Suiten mit.
Darin ausdrücklich grün: alle vier vormals roten Befunde (`privacy-vollstaendigkeit`,
`profile-db`, `provision-tenant`, `tenant-neutrality`).

**Ehrlich zur Einordnung:** `jobqueue-ankunft-datenbank-test.js` läuft im kanonischen Lauf
in **79 ms** — das ist der saubere Übersprung, weil dort kein PostgreSQL-Server gesetzt ist.
Sein eigentlicher Nachweis (**30 PASS**, §4.6) wurde getrennt **mit** echter PostgreSQL
geführt; dasselbe gilt für den neuen Indexnachweis (**26 PASS**, §4.9).
Dasselbe gilt für alle `*-datenbank-test.js`-Suiten; der kanonische Lauf ist bewusst
DB-frei (so läuft auch die CI).

**Zwischenläufe, die rot waren und es aus UMGEBUNGSGRÜNDEN nicht mehr sind** (jeweils
beidseitig belegt — rot ohne, grün mit der fehlenden Voraussetzung):
- `kalender-ics` und `lambda-paket` scheiterten, weil in dieser Sitzung **`node_modules`
  fehlte** (`npm ci` war nie gelaufen). Nach der Installation grün — in der Korrekturrunde 4
  erneut belegt: derselbe Lauf lieferte zuerst 279/281 mit genau diesen beiden roten Suiten
  (`MODULE_NOT_FOUND`), nach `npm ci` **134/134 Kalender-Assertions** bzw. **43 PASS** und
  im Gesamtlauf **281/281**.
- `quellen-mehrfachabruf` scheiterte an einer **zeitabhängigen** Zusicherung
  (1304 ms gegen 1339 ms), während parallel der Lasttest lief. Ohne Konkurrenzlast grün.
- `vorgangskontext` §8.8a schlug an, weil die neue Migration nicht in der Allowlist stand.
  Das ist die **vorgesehene Wirkung** dieser Prüfung: jede fremde Migration muss ausdrücklich
  mit Begründung deklariert werden. Nachgetragen; die inhaltliche Gegenprüfung 8.8b war und
  bleibt grün.

### 4.5 Zwei echte Produktfehler in der Provisionierung — behoben

Beide betrafen genau die geforderte Zusicherung „ein zweiter identischer
Provisionierungslauf erzeugt keine Dubletten **und keine unbeabsichtigten Änderungen**".

1. **Feldverlust bei Wiederholung.** `buildProfile` erzeugt 13 Felder, `toMandateProfileRow`
   schreibt jede Spalte, der Upsert ersetzt die Zeile vollständig — ein zweiter Lauf löschte
   damit alle nachträglich gepflegten Felder (`regionale_interessen`,
   `relevante_ministerien`, `namensvarianten`, `regierungsrolle`, `themen_prioritaeten`,
   `profil_extras`). Behoben durch `mergeMitBestand`: **was die Spec nicht trägt, behält
   seinen Bestandswert.**
2. **Stille Reaktivierung.** `profileActive: true` war fest gesetzt; ein Wiederholungslauf
   aktivierte damit ein deaktiviertes Mandat wieder und umging faktisch die
   Aktivierungsfreigabe (`CLAUDE.md` §5). Jetzt gewinnt der Bestandswert — und das
   Zusammenspiel ist sogar **fail-closed**: der Lauf bricht mit `profile-not-ready` ab und
   verändert das Mandat überhaupt nicht. Eine Reaktivierung verlangt ausdrücklich
   `reaktivieren: true`.

Zusätzlich: nach dem Anlegen eines Auth-Nutzers wird der persistierte Stand
zurückgeprüft (`CLAUDE.md` §4.10) — der Auth-Speicher wird als ganzer Blob unbedingt
geschrieben, was bei einem Stapel über 25/50/100 Mandate ein realer Rennfall ist.

### 4.6 Beobachtbarkeit: die fehlende Ankunftskennzahl — vorbereitet, nicht angewendet

**Befund:** die verbindliche Freigabebedingung der Stufe 2 lautet „**Abfluss ≥ Ankunft**
über 7 Tage". Die vorhandene `helmut_job_metrics` liefert den **Abfluss**
(`erledigt_im_zeitraum`), aber **keine Ankunft**. Der siebentägige Fünfernachweis ist
damit heute **gar nicht messbar** — nicht, weil er scheitern würde, sondern weil eine
Seite der Ungleichung nirgends erhoben wird.

**Vorbereitet:** `supabase/migrations/20260825101500_jobqueue_ankunftskennzahl.sql` legt
eine **neue, rein lesende** Funktion `helmut_job_ankunft(p_seit_minuten)` an
(Ankunft, Abfluss, Abflussverhältnis, Fenster). Rollback-SQL liegt im selben Verzeichnis.

**Warum eine neue Funktion statt einer Erweiterung:** eine zusätzliche Spalte in einer
`returns table`-Funktion erzwingt in PostgreSQL ein DROP + CREATE — ein Eingriff in eine
Funktion, die Production laufend liest, mit einem Fenster, in dem sie nicht existiert.
Die neue Funktion daneben hat denselben Nutzen ohne dieses Risiko: **kein bestehender
Aufrufer ändert sich, keine bestehende Signatur wird angefasst.**

**Nachweis:** `scripts/jobqueue-ankunft-datenbank-test.js` — **30 PASS / 0 FAIL** gegen
echte PostgreSQL 16: Migration additiv, wiederholbar, Rechte wie `helmut_job_metrics`
(nichts für `anon`/`authenticated`/`public`), Datensparsamkeit, Zeitfenster wirkt,
Rollback ohne Datenverlust und idempotent. Bei leerer Warteschlange meldet das Verhältnis
**`null` (unbestimmt)**, nicht `0` — eine `0` wäre ein falsches Alarmsignal.

> **Die Migration ist NICHT angewendet.** Anwendung gegen Production ist freigabepflichtig
> (`CLAUDE.md` §5) und in §10 als **F9** geführt.

### 4.5a Anlage und Aktivierung sind jetzt technisch getrennt (2026-08-25/4)

**Der Widerspruch, der hier bestand.** Drei Stellen sagten Verschiedenes über denselben
Vorgang:

| Stelle | Aussage |
|---|---|
| Importvertrag [`op30-profilvertrag-200-mandate.md`](op30-profilvertrag-200-mandate.md) §6 | „Ein Import aktiviert **niemals** ein Mandat" · `profileActive: false` **unabhängig vom Eingang** · ein Datensatz mit `aktiv: true` wird **abgelehnt**, nicht still korrigiert |
| Provisionierung `lib/helmut/provisioning.js` | `buildProfile` setzte fest `profileActive: **true**` |
| `CLAUDE.md` §5 | Import **und** Aktivierung sind getrennte, ausdrücklich freigabepflichtige Schritte |

Ein scharfer Stapellauf hätte damit **25/50/100 Mandate AKTIV angelegt** und die
Aktivierungsfreigabe faktisch übersprungen. Der in §4.5 behobene Befund („keine stille
Reaktivierung") schützte nur **bestehende** deaktivierte Mandate — für **neue** Mandate
blieb die Aktivierung der Vorgabewert.

**Der kleinste sichere Änderungssatz:**

1. **Kein stiller Vorgabewert mehr.** `buildProfile(spec, { aktiv })` **wirft**, wenn der
   Zustand nicht ausdrücklich übergeben wird. Ein vergessener Aufrufer bricht laut ab statt
   still zu aktivieren. Dasselbe gilt für `provisionTenant(spec, deps, { neuAktiv })`.
2. **Der Stapelpfad kennt nur inaktiv.** `provisionBatch` setzt `neuAktiv: false` fest und
   nimmt dafür **keinen Parameter** entgegen — es gibt keinen Aufrufweg, der ihn übersteuert.
3. **Ein Aktivierungswunsch wird abgelehnt, nicht umgedeutet.** Trägt eine Spec `aktiv`,
   `profileActive`, `active` oder `reaktivieren` mit irgendeinem Wert außer `false`, bricht
   die **Vorprüfung des ganzen Pakets** ab — vor dem ersten Schreibvorgang. Auch `"true"`
   oder `1` werden abgelehnt statt still als wahr gelesen.
4. **Der Zustand eines bestehenden Mandats gehört dem Bestand.** `mergeMitBestand` übernimmt
   `profileActive` nie aus dem gebauten Profil. Beide Richtungen sind damit gesperrt: ein
   Stapellauf aktiviert kein deaktiviertes Mandat **und deaktiviert kein aktives**.
5. **Der Riegel hängt am Widerspruch, nicht an der Inaktivität.** Ein Lauf, der ein aktives
   Mandat herstellen will (Einzelprovisionierung von Hand), bricht bei einem deaktivierten
   Mandat ab wie bisher. Ein Lauf, der ohnehin inaktiv arbeitet, findet dort keinen
   Widerspruch und aktualisiert nur den Inhalt. Ohne diese Unterscheidung könnte der Stapel
   **seine eigenen, inaktiv angelegten Mandate nie wieder anfassen** — die zugesicherte
   Wiederholbarkeit wäre verloren gewesen.
6. **Inhalt und Zustand werden getrennt geprüft.** `validateProfile` meldet `deaktiviert`,
   sobald `profileActive === false` ist, und verdeckt damit jedes inhaltliche Urteil. Wo die
   Inaktivität die Absicht ist, läuft die Reifeprüfung an einer Prüfkopie. Die Löschmarke
   (`deletedAt`) bleibt dabei stehen — ein soft-gelöschtes Mandat bricht weiterhin ab.
7. **Das Konto entsteht gesperrt.** Der Stapel legt den Auth-Nutzer mit `active: false` an
   (`accounts.resolveSession`/`createPasswordToken` lesen genau diesen Riegel). Für ein
   Mandat, das niemand freigegeben hat, entsteht also kein anmeldefähiges Konto. Ein
   bestehendes Konto wird im inaktiven Pfad **nicht** auf `status: "aktiv"` gezogen.
8. **Die Vorschau nennt den Zielzustand.** Jede Zeile trägt `zielAktiv` (`true`/`false`) und
   ein sprechendes `vorhaben`: `anlegen-inaktiv`, `aktualisieren-bleibt-inaktiv`,
   `aktualisieren-bleibt-aktiv`. Ist der Zustand **nicht sicher vorhersagbar** — etwa weil
   ein Bestandswert weder `true` noch `false` ist —, schlägt die **gesamte** Vorschau
   geschlossen fehl (`abbruch:aktivierungszustand-unklar`), und der scharfe Lauf ebenso.
9. **Die engen Rückwege aus Reviewrunde 3 bleiben unverändert.** `rolleNeuesKontoZurueck`
   trifft weiterhin ausschließlich die **Nutzer-ID** des in diesem Lauf angelegten Kontos,
   meldet Erfolg nur nach bestätigter Löschung und lässt vorbestehende
   Referentenzuweisungen unangetastet.

**Was dieser Sprint ausdrücklich NICHT tut:** er baut **keinen** Aktivierungspfad. Die
Aktivierung bleibt der bestehende, getrennte Betreiberweg (Profil auf `aktiv` setzen) und
ist weiterhin freigabepflichtig (F3). Es wurde nichts aktiviert und nichts importiert.

**Nachweis:** `scripts/provision-stapel-test.js` §14 (Teil von 117 PASS / 0 FAIL) —
Trockenlauf als Standard, scharfer lokaler Stapellauf, Wiederholungslauf, bestehende
Deaktivierung, sechs Varianten eines unzulässigen Aktivierungswunschs, bestehendes aktives
Mandat, unbestimmbarer Zustand, Teilfehler mit Rückweg. Ausschließlich synthetische
Mandanten (Präfix `stapel-`), kein Netz, keine echte Datenbank.

### 4.9 Indexfrage der Ankunftskennzahl — lokal gemessen, entschieden

**Die Frage:** `helmut_job_ankunft` zählt zweimal über `helmut_jobs` — nach `created_at`
(Ankunft) und nach `status = 'erledigt' AND finished_at` (Abfluss). Auf `helmut_jobs` gibt es
**keinen** Index auf `created_at` und **keinen** auf `finished_at`. Braucht die Funktion
einen?

**Messung** (`scripts/jobqueue-ankunft-index-datenbank-test.js`, **26 PASS / 0 FAIL**,
echte lokale PostgreSQL 16.13, `EXPLAIN ANALYZE, BUFFERS`). Die Nutzlast ist auf die in
Production **rein lesend gemessene** mittlere Größe geeicht (`avg(pg_column_size(payload))`
= **821 Byte**, 25.08.) — ohne diese Eichung fiele die Messung zu günstig aus, weil der
sequentielle Durchlauf die Nutzlast mitliest.

| Datenmenge | Zeilen | `helmut_jobs` gesamt | gelesene Puffer | Laufzeit `…(1440)` | Plan |
|---|---:|---:|---:|---:|---|
| 7 Tage à 2287 | 16 009 | 18 MB | 10 616 | **17–25 ms** | Seq Scan |
| 90 Tage à 2287 | 205 830 | 227 MB | 129 255 | **341–366 ms** | Seq Scan |
| ~1 Jahr à 2287 | 834 755 | 921 MB | 522 333 | **1584–1649 ms** | Seq Scan |

**Drei Befunde aus dem Plan:**

1. **Der Aufwand hängt an der Tabellengröße, nicht am Fenster.** Ein 24-Stunden-Fenster liest
   bei 365 Tagen Bestand dieselben 522 333 Puffer wie ein 365-Tage-Fenster (522 331). Die
   Funktion liest immer alles.
2. **Er wächst rund linear** mit der Zeilenzahl: Zeilen ×52,1 ⇒ Puffer ×49,2.
3. **Ein Index würde massiv helfen:** mit `(created_at)` und `(finished_at) where status =
   'erledigt'` fällt der Plan auf Index Only Scan und der Leseaufwand von 522 333 auf **691
   Puffer** — **Faktor 756**, Laufzeit 1,6 s → **28 ms**. Das Ergebnis bleibt exakt gleich.

**Entscheidung: KEIN zusätzlicher Index in diesem Sprint. F9 bleibt unverändert** und enthält
weiterhin ausschließlich die dokumentierte Ankunftskennzahl. Begründung — vier Punkte, alle
aus den Messungen oben:

1. **Kein heißer Pfad.** Die Funktion wird von `/api/ops/jobqueue` und vom siebentägigen
   Nachweis wenige Male am Tag gelesen — nicht je Auftrag, nicht je Slot. 1,6 s im
   Worst Case sind 0,6 % eines 270-s-Slots.
2. **Die Datenmenge, bei der es weh täte, ist auf dem Free-Plan nicht erreichbar.**
   Bei 100-Mandate-Menge wächst `helmut_jobs` um **2,52 MB/Tag**; ein Jahr ergäbe **921 MB**
   allein in dieser Tabelle. Die Supabase-Free-Grenze liegt bei **500 MB für die ganze
   Datenbank**, von denen heute schon **160 MB** belegt sind (rein lesend geprüft, 25.08.).
   Innerhalb des Erreichbaren bleibt die Funktion **unter einer Sekunde**.
3. **Der Index kostet 35 MB** — rund 10 % des heute verbleibenden Speicherbudgets. Er würde
   Risiko R3 (500-MB-Grenze) verschärfen, um ein Problem zu lösen, das vorher nicht eintritt.
4. **Die Ursache des Wachstums ist die fehlende Aufbewahrung (R5), nicht der Plan.**
   `helmut_jobs_bereinigen` hat im Anwendungscode **keinen Aufrufer** (im Test geprüft).
   Ein Index gegen das Symptom, während die Ursache offen bleibt, wäre die falsche Reihenfolge.

**Erneut zu prüfen, sobald eines davon nicht mehr stimmt:** Supabase Pro (größere Grenze),
Aufbewahrung weiterhin aus **und** 50+ aktive Mandate, oder ein neuer Aufrufer, der die
Kennzahl häufig liest. Der Test hält die Messung fest; wer die Entscheidung umdreht, sieht
im selben Lauf, was sie kostet.

**Mitgeprüft:** Vorwärtsmigration additiv, fachliche Richtigkeit bei voller Datenmenge
(Ankunft und Abfluss exakt gegen eine unabhängige Gegenzählung, Verhältnis exakt
`runde(Abfluss/Ankunft, 4)`), Datenunversehrtheit beim Anlegen und Entfernen der
Kandidatenindizes (834 755 Zeilen unverändert) und der **Rollback bei voller Datenmenge**
(Funktion weg, `helmut_job_metrics` unberührt, kein Datenverlust, Indexlage unverändert).

> **Production wurde dabei nicht angefasst.** Alle `EXPLAIN ANALYZE` liefen lokal; gegen
> Production lief ausschließlich ein rein lesendes `SELECT` für Zeilenzahl, Tabellengröße
> und mittlere Nutzlast.

---

## 4.8 · Die 139 Befundlücken — ehrliche Einordnung

Die rein lesende Prüfung (zwölf Aufträge) hat **139 Lücken** erhoben:
**28 kritisch · 47 hoch · 44 mittel · 20 niedrig**. Dieser Sprint hat sie **nicht alle
geschlossen** — er hat sie erhoben und einen kleinen, klar begrenzten Teil behoben.

### Geschlossen (in diesem PR belegt)

| Lücke | Nachweis |
|---|---|
| Kein Stapelpfad für viele Mandate | `provision-stapel-test.js` |
| Wiederholungslauf löscht gepflegte Profilfelder | `provision-stapel-test.js` §1 |
| Wiederholungslauf reaktiviert still ein deaktiviertes Mandat | §2 |
| Auth-Blob ohne Erfolgsprüfung gegen die Ablage | §11 |
| Halber Zustand nach fehlgeschlagener Auth-Kontrolle | §11 *(Review 2)* |
| Falsches Grün im Trockenlauf | §9 *(Review 2)* |
| Trockenlauf sagt Konto-/E-Mail-/Deaktivierungskonflikte nicht voraus | §10 *(Review 2)* |
| `service_role` ohne EXECUTE auf der neuen Funktion | `jobqueue-ankunft-datenbank-test.js` §6 *(Review 2)* |
| Vier vermeintliche Testbefunde (Ursache falsch dokumentiert) | Bisektion + CI (279/279 an `69be0714`) |
| `CURRENT_STATE` nach dem Merge von PR #269 veraltet | §2/§14 berichtigt |
| Doku-Drift: 9 statt 11 Crons, falscher Modell-Default | `workerbetrieb.md`, `env-inventar.md` |
| Stapelpfad legte Mandate AKTIV an (Widerspruch zum Importvertrag) | `provision-stapel-test.js` §14 *(Runde 4)* |
| „~11 schwere Slots" als Abflusskapazität | `warteschlangen-abfluss-test.js` *(Runde 4)* |
| `100 + 30 = 130` als KI-Gesamtdeckel | `kapazitaetsmodell-test.js` §B0 *(Runde 4)* |
| Indexfrage der Ankunftskennzahl unbeantwortet | `jobqueue-ankunft-index-datenbank-test.js` *(Runde 4)* |

**Vorbereitet, aber nicht wirksam:** die fehlende Ankunftskennzahl. Migration liegt vor und
ist lokal belegt, ist aber **nicht angewendet** (F9) — die Lücke bleibt bis dahin offen.

### Weiterhin blockierend (entscheidungsrelevant)

| # | Lücke | Blockiert |
|---|---|---|
| R1 | KI-Tagesdeckel 100 trägt keine Stufe | jede Aktivierung |
| — | Siebentägiger Fünfernachweis nicht begonnen | Stufe A |
| F9 | Ankunftskennzahl nicht angewendet ⇒ Nachweis nicht messbar | Stufe A |
| R2 | Abflussläufe: **3 reguläre/Tag** gegen hochgerechnet ~20 nötige bei 100 (§2a) | Stufe B/C |
| R8 | Morgenlage im Direktpfad: ~28 Mandate je Lauf | Stufe B/C |
| R5 | keine automatische Aufbewahrung (`helmut_jobs` wächst unbegrenzt) | Stufe B/C |
| R3/R4 | Supabase 500-MB-Grenze unüberwacht, kein PITR | Stufe C |
| — | Berlin/Brandenburg: Landesmodule inaktiv, Seeds nicht eingespielt | Stufe A (BE/BB-Profile) |
| — | Migration `20260720` offen (OP-03) | Zweitmandant |

### Nicht blockierend

Der verbleibende Rest — im Wesentlichen die Stufen *mittel* und *niedrig* sowie ein Teil der
*hohen* — betrifft Härtung, Beobachtbarkeit und Dokumentation (z. B. fehlende Teilindizes,
ungedeckelte Outbox-Zweige, Ringspeicher im Auth-Blob, Fairness-Rotation, Doppelpfad über
`POST /api/admin/users`). Sie sind in den Prüfberichten mit Datei und Zeile erfasst.

> **Ehrlich zur Methode:** diese Einordnung ist **nicht** eine einzeln nachgeprüfte Triage
> aller 139 Punkte. Geschlossen und blockierend sind namentlich belegt; der Rest ist nach
> der Schwere-Einstufung der Prüfberichte eingeordnet und **nicht erneut verifiziert**.
> Wer eine belastbare Vollständigkeitsaussage braucht, muss die Restliste einzeln abarbeiten.

---

## 5 · Kostenrechnung

### 5.0 Vier Dinge, die hier NICHT dasselbe sind

Diese vier Größen werden in der Kostenfrage regelmäßig vermischt. Sie werden hier getrennt
geführt und tragen jeweils ihre Belegqualität:

| # | Größe | Belegqualität | Was sie NICHT ist |
|---|---|---|---|
| 1 | **OpenAI-Listenpreise** | öffentlich, anbieterseitig — aber aus dieser Sitzung **nicht eigenhändig geöffnet** (Egress-Sperre), belegt über auf die Anbieterdomain beschränkte Suchtreffer | **kein Beleg für eine Rechnung**, auch nicht für eine OpenAI-Rechnung (Rabatte, Kontingente, Batch-/Cache-Tarife bleiben außen vor) |
| 2 | **Mögliche Azure-Preise** | **unbelegt** — die Azure-Preisseite war aus dieser Sitzung nicht erreichbar, und es ist auch nicht belegt, dass Helmut über Azure abrechnet | **kein Ersatz für 1** und **kein Beleg für 3 oder 4**. Ein OpenAI-Listenpreis ist keine Azure-Rechnung, und eine Azure-Rechnung ist kein OpenAI-Listenpreis |
| 3 | **Gemessene Tokenmengen** | teilweise gemessen: der Ist-Wert **0,1370 USD/Tag** bei 5–6 Mandaten stammt aus dem Kostenlog ([`kostenmessung.md`](kostenmessung.md) §3.2) und trägt **~16 % Logverlust** | **keine Monatskosten** und keine Aussage über 25/50/100 Mandate |
| 4 | **Hochgerechnete Monatskosten** | **Rechnung aus 1 und angenommenen Faktoren** — Aufruffaktor und Tokens je Aufruf sind angenommen, nicht gemessen | **kein Rechnungsbetrag.** Als „Kosten" dürfen die Beträge erst gelten, wenn F7 erfüllt ist (Preisbasis aus einer echten Rechnung) |

**Was Helmut tatsächlich abrechnet, ist in dieser Sitzung nicht feststellbar.** Der Code
kennzeichnet seine Preistabelle selbst als `unbelegt-schaetzwert`, solange
`HELMUT_LLM_PRICE_SOURCE` fehlt (`storage.js:990-1009`) — und diese Variable ist eine
Vercel-Env, die eine Claude-Sitzung weder lesen noch setzen kann.

### 5.0a Preisliste (Größe 1)

Preisquelle: offizielle OpenAI-Preisseiten, Abruf **2026-08-25**
(`https://developers.openai.com/api/docs/pricing` und die Modellseiten).
**Einschränkung, ehrlich:** der direkte Seitenabruf ist aus dieser Sitzung egress-gesperrt;
die Werte stammen aus Suchtreffern, die auf die offiziellen Anbieterdomains beschränkt waren —
**belegt, aber nicht eigenhändig geöffnet**. Die Azure-Preisseite war **nicht** erreichbar.

| Modell | Eingabe $/1M | Ausgabe $/1M | Rolle |
|---|--:|--:|---|
| `gpt-5-mini` | 0,25 | 2,00 | Verstehen; in Production laut Kostenlog **alle** bepreisten Aufrufe |
| `gpt-5.5` | 5,00 | 30,00 | Standardmodell im OpenAI-Direktpfad (`ai.js:8`) |
| `gpt-4.1` | 2,00 | 8,00 | Rückfall bei HTTP 400 |

### 5.1 Szenarien (Modell `gpt-5-mini`)

| Mandate | Szenario | Aufrufe/Tag | **USD/Monat** | Belegqualität |
|---:|---|---:|---:|---|
| 25 | niedrig | 113 | **6,36** | BERECHNET aus gemessenen Tokens |
| 25 | realistisch | 198 | **15,12** | ANGENOMMEN |
| 25 | hoch | 336 | **33,77** | ANGENOMMEN + 16 % Logverlust |
| 50 | niedrig | 160 | **9,00** | BERECHNET |
| 50 | realistisch | 268 | **21,22** | ANGENOMMEN |
| 50 | hoch | 444 | **44,63** | ANGENOMMEN |
| 100 | niedrig | 251 | **14,12** | BERECHNET |
| 100 | realistisch | 399 | **32,78** | ANGENOMMEN |
| 100 | hoch | 647 | **65,03** | ANGENOMMEN |

> **Korrektur nach Review 2026-08-25/2:** Die Beträge **15 / 21 / 33 USD im Monat**
> (25/50/100, Spalte „realistisch") sind **angenommene Szenarien, keine gemessenen
> Monatswerte**. Sie beruhen auf einem angenommenen Aufruffaktor und angenommenen
> Tokenmengen je Aufruf; offiziell belegt sind nur die Preise, gemessen ist nur die
> Vergleichszeile unten. Als „Kosten" dürfen sie erst gelten, wenn F7 erfüllt ist —
> bis dahin sind es **Größenordnungen**.

**Einziger Ist-Wert:** heute 5–6 Mandate → **0,1370 USD/Tag** ≈ 4,11 USD/Monat
([`kostenmessung.md`](kostenmessung.md) §3.2). Die Szenarien klammern diesen Wert ein.

### 5.2 Zwei Kostenbefunde, die eine Betreiberentscheidung brauchen

1. **Der KI-Tagesdeckel ist kein Kostenproblem, sondern eine Einstellung.**

   **Semantik, verbindlich** ([`llm-budget-reservierung.md`](llm-budget-reservierung.md);
   Code: `storage.js reserveLlmCall`): das **Tageslimit ist die absolute Gesamtobergrenze**.
   Die Understanding-Reserve wird **innerhalb** dieser Obergrenze freigehalten, sie wird
   **nicht addiert**. Bei Limit 100 und Reserve 30 heißt das:

   | | Obergrenze |
   |---|---|
   | **Gesamt, alle Aufruftypen zusammen** | **100** |
   | priorisiertes Verstehen (`callType = understanding`) | bis **100** |
   | alles andere (Büro, Kommunikation, Lage, App-Start, Backfills) | höchstens **70** |

   **Eine Gesamtgrenze von 130 gibt es nicht** — weder hier noch irgendwo im System.
   Die Schreibweise „100 + 30" ist eine Kurzform für „Gesamtdeckel 100, davon 30
   reserviert", keine Summe. Der Deckel-Scope ist `global` (alle Mandate zusammen).
   Testgesichert: `scripts/kapazitaetsmodell-test.js` §B0.

   **Fehlt die Umgebungsvariable, greift laut Code das Schutzlimit 50**
   (`storage.js LLM_LIMIT_FALLBACK = 50`, fail-closed statt unbegrenzt); eine fehlende
   oder ungültige Reserve wirkt als **0**.

   **Der in Production tatsächlich gesetzte Wert ist aus dieser Sitzung NICHT nachprüfbar.**
   `HELMUT_MAX_LLM_CALLS_PER_DAY` und `HELMUT_LLM_RESERVE_UNDERSTANDING` sind Vercel-Env
   (weder lesbar noch setzbar, [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3), und die
   Datenbank speichert in `llm_budget_counters` nur den **Verbrauch**, nicht die Grenze
   (rein lesend geprüft, 25.08.). Die Werte **100/30** sind daher **dokumentiert** — gestützt
   auf die Production-Ablesungen „66/100" und „29/100" vom 23./24.08. (Runbook §30.7) —,
   aber in dieser Runde **nicht verifiziert**.

   **Reicht der Deckel für 25 Mandate? Modellabhängig — und damit nicht entschieden.**
   Linie B sagt für den günstigsten Fall **113** Aufrufe/Tag (> 100), Linie A sagt **88**
   (< 100). Siehe §2c. Verbindlich ist nur: **ab 50 Mandaten reißt der Deckel in beiden
   Linien**. Gleichzeitig kosten 350 Aufrufe/Tag **unter 1,20 USD** (Größenordnung nach
   §5.0, Zeile 4) — der Deckel drosselt fail-closed und kostet **Wirkung, nicht Geld**.
   → Anhebung ist eine Freigabeentscheidung (`CLAUDE.md` §5), keine Codeentscheidung.
2. **Die Preisbasis im Code ist ausdrücklich unbelegt.** `llmPriceProvenance()` meldet
   dauerhaft `unbelegt-schaetzwert`, solange `HELMUT_LLM_PRICE_SOURCE` fehlt
   (`storage.js:990-1009`). Zusätzlich weicht der hinterlegte `gpt-5.5`-Preis
   (1,25/10,00) vom offiziellen (5,00/30,00) ab. **Dieser Sprint ändert die Preistabelle
   bewusst NICHT** — der Codekommentar erklärt ausdrücklich, dass ein aus zweiter Hand
   gesetzter Preis schlechter wäre als ein deklarierter Schätzwert. Richtige Behebung:
   der Betreiber setzt `HELMUT_LLM_PRICE_JSON` + `HELMUT_LLM_PRICE_SOURCE` +
   `HELMUT_LLM_PRICE_ASOF` aus einer echten Rechnung. Solange das offen ist, ist jeder
   Betrag oben eine **Größenordnung, kein Rechnungsbetrag**.

---

## 6 · Plattformgrenzen

| Grenze | Wert | Quelle | Abruf |
|---|---|---|---|
| Vercel-Tarif Team `nohut` | **Pro** | Vercel-API `list_teams` → `plan: "pro"` | 2026-08-25 |
| `maxDuration` **konfiguriert** | **300 s** | `vercel.json` (`functions."api/index.js"`) | — |
| Cron-**Einträge** konfiguriert | **11** | `vercel.json` | — |
| **reguläre Warteschlangenabflüsse/Tag** | **3** | §2a, testgesichert | — |
| Supabase-Plan | **Free** (500 MB) | [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3 | — |
| Supabase belegt | **160 MB** | rein lesendes `pg_database_size` | 2026-08-25 |
| Production-Postgres | **17.6.1** | Supabase-API | 2026-08-25 |

### 6.1 Was heute für Pro gilt — und was davon Helmut betrifft

Stand der offiziellen Vercel-Dokumentation, geprüft **2026-08-25**. **Ehrliche Beleggrenze:**
`vercel.com` ist aus dieser Sitzung **egress-gesperrt** (`EGRESS_BLOCKED`); die Werte stammen
aus auf `vercel.com` beschränkten Suchtreffern und dem Vercel-Dokumentationswerkzeug —
**belegt, aber nicht eigenhändig geöffnet**, dieselbe Einschränkung wie bei den Preisen (§5.0).

| Fall | Standard | Maximum |
|---|---|---|
| Pro **mit** Fluid compute (Standard für nach dem 23.04.2025 angelegte/deployte Projekte) | **300 s** | **800 s** (allgemein verfügbar) |
| Pro, erweitertes Maximum | — | **1800 s** — **Beta**, Opt-in, nur bestimmte Node-/Bun-/Python-Laufzeiten, und **je Funktion** zu konfigurieren, nicht als Projektvorgabe |
| Pro **ohne** Fluid compute (Altbestand vor dem 23.04.2025) | abweichend, niedriger | in dieser Runde **nicht belegt** |

**Fünf Einordnungen, die dazugehören:**

1. **Helmut ist auf `maxDuration: 300` konfiguriert.** Das entspricht exakt dem
   Pro-**Standard** — es ist also keine Drosselung gegenüber dem Standard, sondern der
   Standard selbst.
2. **Der Fluid-Compute-Status genau dieses Projekts ist unbestätigt.** Die
   Vercel-Projekt-API (`get_project` für `helmut-pilot`) liefert `nodeVersion`, `framework`,
   Domains und das letzte Deployment — **kein Feld zu Fluid Compute und keines zur maximal
   zulässigen Laufzeit**. Ohne diesen Beleg trägt keine Zahl über 300 s eine Planung.
   Prüfweg: Betreiber liest im Vercel-Dashboard unter Settings → Functions nach und trägt
   das Ergebnis ins Env-Inventar ein.
3. **Die ältere Projektangabe „bis 800 s"**
   ([`op30-zielarchitektur-2026-08-13.md`](op30-zielarchitektur-2026-08-13.md) §80-82) ist
   nach heutigem Stand **nicht falsch, aber unvollständig**: 800 s ist weiterhin das
   allgemein verfügbare Maximum für Pro — **aber nur mit Fluid compute**, und die
   Bedingung stand dort nicht. Neu hinzugekommen ist das 1800-s-**Beta**-Maximum, das
   zusätzliche Auflagen trägt und keine belastbare Planungsgrundlage ist.
4. **Eine Plattformobergrenze ist keine wirksame Helmut-Konfiguration.** Was Vercel
   erlaubt, sagt nichts darüber, was `vercel.json` fährt. Eine Erhöhung wäre eine
   Konfigurationsänderung und damit eine Betreiber-/Freigabeentscheidung.
5. **Eine längere Laufzeit darf nicht isoliert empfohlen werden — sie kollidiert mit dem
   Zeitplan.** Die kleinsten Abstände zwischen zwei konfigurierten Cron-Einträgen sind
   **10 Minuten** (06:00 `health-report` → 06:10 Nachlauf) und **12 Minuten**
   (06:10 → 06:22). Ein `maxDuration` über **600 s** kann im Morgencluster also dazu
   führen, dass ein Lauf noch arbeitet, während der nächste startet. Die drei
   Abflussläufe selbst (04:00, 16:00, 20:00 UTC) hätten zwar Luft — aber genau die
   naheliegende Abhilfe für R2, **zusätzliche Abflussslots**, würde in den engen Cluster
   gelegt. Laufzeit und Cron-Plan sind deshalb **eine gemeinsame Entscheidung**, keine zwei.

> **Diese Runde ändert nichts davon:** kein Eingriff in `vercel.json`, kein Fluid Compute,
> keine Cron-Zeit, keine Cron-Reihenfolge.

---

## 7 · Bekannte Risiken

| # | Risiko | Stufe | Bewertung |
|---|---|---|---|
| R1 | KI-Tagesdeckel 100 trägt keine Stufe | 25/50/100 | **blockierend**, Freigabeentscheidung |
| R2 | Abflussläufe: **3 reguläre/Tag** (§2a) gegen hochgerechnet ~20 nötige bei 100 (§2, Hochrechnung) — der Watchdog ist ein **bedingter Ersatzlauf** und zählt nicht mit | 50/100 | hoch |
| R3 | Supabase Free: 500-MB-Grenze nicht überwacht; Überschreitung ⇒ Read-only. **Heute 160 MB belegt** (rein lesend, 25.08.); bei 100-Mandate-Menge wäre der Rest in rund **136 Tagen** aufgebraucht (§4.9) | 25/50/100 | hoch |
| R4 | kein PITR/Backup (OP-01) | alle | hoch, Kostenentscheidung |
| R5 | keine automatische Aufbewahrung: `helmut_jobs`/`helmut_job_outbox` wachsen unbegrenzt (`helmut_jobs_bereinigen` hat keinen Aufrufer); gemessen **2,52 MB/Tag** bei 100-Mandate-Menge (§4.9) | 25/50/100 | hoch |
| R6 | Google-Klumpenrisiko 146/163 Wege (OP-15) | alle | bestehend |
| R7 | `HELMUT_CRAWL_RUN_RETENTION=36` reicht nur für n=5 | 25/50/100 | mittel, Betreiberaktion |
| R8 | Morgenlage im Direktpfad: ~28 Mandate je Lauf sind die Obergrenze | 50/100 | hoch |

---

## 8 · Aktivierungsplan für echte Mandate

**Keine Stufe gibt automatisch die nächste frei. Jede Stufe braucht eine eigene
ausdrückliche Gründerfreigabe.**

### 8.0 Welche Mandatsgrundlage es wirklich gibt (Einordnung 2026-08-25/4)

**Was existiert.** Ein lokales Datenpaket
`daten/mandatsprofile-berlin-brandenburg-2026-08-24.json` mit **20 Profilen** — 10
`landtag-berlin`, 10 `landtag-brandenburg`, **alle `aktiv: false`**. Es ist eine
**vorbereitete Datengrundlage**, mehr nicht:

1. **Nicht aktiviert.** Kein einziges dieser Profile ist in Production importiert oder
   aktiviert. Aktiv sind unverändert die **5 bestehenden Mandate**.
2. **Amtlich bestätigt — aber aus genau EINER Quelle je Profil.** Der rein lesende
   Actions-Lauf 4 vom 24.08. bestätigte 20 von 20 unter Strenge-Stufe 2. Die früher
   hinterlegte **Zweitquelle** (Landeswahlleiterin, `wahlen-berlin.de`) wurde dabei
   **bewusst entfernt**, weil die Mandatsachse auf der amtlichen Profilseite selbst
   ausgewiesen ist und die zweite Quelle „doppelte Beweislogik" war
   (`daten/…-pruefstand.md`). **Ehrliche Einordnung:** die Bestätigung steht damit auf
   **einer** amtlichen Quelle je Profil. Das war eine begründete Entscheidung, ist aber
   eine Einquellenprüfung — kein Mehrquellenabgleich.
3. **Die Quellenversorgung fehlt.** Es sind **Landtags**profile, und beide Landesmodule
   sind **nicht betriebsbereit**: Berlin inaktiv (Flagwirkung **unbewiesen**), Brandenburg
   `prepared` mit **8/8 gesperrten Wegen**, insgesamt **18 gesperrte BE/BB-Abrufwege**, und
   die Seeds `20260713`/`20260717` sind **nicht eingespielt**
   ([`CURRENT_STATE.md`](../CURRENT_STATE.md) §3/§5,
   [`quellen-seed-einspielung.md`](quellen-seed-einspielung.md): BLOCKIERT). Ein heute
   aktiviertes Berliner Mandat würde im Wesentlichen aus dem geteilten Katalog versorgt —
   und der trägt das Google-Klumpenrisiko **146 von 163 Wegen** (OP-15). Die zusätzliche
   regionale Quellenbasis, die ein Landtagsmandat braucht, ist damit **nicht vollständig
   vorhanden**.
4. **Terminrisiko.** Die zehn Berliner Profile gelten nur für die 19. Wahlperiode; am
   **20.09.2026** ist Berliner Wahl. Danach ist erneut zu prüfen.

**Was daraus folgt:** diese 20 Profile **beweisen keine Aktivierungsbereitschaft für 25
reale Mandate.** Sie belegen, dass die Daten da und geprüft sind — nicht, dass Helmut sie
tragen kann.

**Was NICHT existiert.** Eine Liste von **80 weiteren Kandidaten** gibt es im Repository
**nicht** — weder mit Indexbelegen noch anderweitig (gesucht am 25.08.). Wer für 100 Mandate
plant, hat heute **20 vorbereitete Profile und sonst nichts**. Das ist keine Kritik am Paket,
sondern der Abstand zwischen Datenlage und Zielbild, der benannt gehört.

**Zwei Wege, die nicht verwechselt werden dürfen:**

| | **Technischer Kapazitätsnachweis** | **Zusätzliche REALE Mandate** |
|---|---|---|
| Frage | Trägt der Motor die Menge? | Wen betreut Helmut wirklich? |
| Schnellster Weg | **synthetische oder inaktive Profile** — der gestufte Lasttest (§4.1) fährt bereits 25/50/100 gegen echte Migrationen und echte Workerprozesse, ohne ein einziges reales Mandat | nach heutigem Stand **voraussichtlich zunächst die Bundestagsebene**: sie ist die einzige, die Helmut heute aktiv betreibt (alle 5 aktiven Mandate), sie hat eine harte Reifeprüfung im Code (`profile-readiness.pruefeNeuaktivierung`), und ihre Quellenversorgung läuft — anders als BE/BB — nicht über ein gesperrtes Landesmodul |
| Braucht eine Freigabe? | **nein** (nur lokale Läufe) | **ja, zwei getrennte** (F2 Import, F3 Aktivierung) |

> **Daraus folgt ausdrücklich KEINE Freigabe und keine Personenauswahl.** Die Aussage
> „voraussichtlich zunächst Bundestagsebene" ist eine **Einschätzung der Reihenfolge**, keine
> Empfehlung, jetzt Profile zu recherchieren. **Diese Runde enthält keine Profilrecherche,
> keinen Import und keine Aktivierung.**

### Stufe A · 5 → 25

1. **Vorprüfung:** siebentägiger Nachweis des echten Warteschlangenbetriebs mit fünf
   Mandaten bestanden (Stufe 2 nach Zielarchitektur §14: Abfluss ≥ Ankunft über 7 Tage,
   0 Verlust, 0 Doppelarbeit, Wartezeit < 24 h). **Heute nicht begonnen — und ohne die
   Ankunftskennzahl (§4.6, F9) auch nicht messbar.**
2. **Vollständige Mandatsdaten:** 20 Profile amtlich bestätigt, `aktiv: false`, nicht
   importiert. Berliner Wahl **20.09.2026** — die zehn Berliner Profile gelten nur für die
   19. WP; danach erneute Prüfung.
3. **Ausdrückliche Gründerfreigabe** für Import **und** getrennt für Aktivierung.
4. **KI-Deckel vorher anheben** (R1) — sonst ist die Aktivierung wirkungslos.
5. **Begrenzte Aktivierung:** in Tranchen, nicht 20 auf einmal.
6. **Rein lesende Wirkungskontrolle:** Briefings je Mandat, `endgueltig_fehler`, Leases,
   Rückstauentwicklung über mindestens drei Tage.
7. **Stopkriterien:** `endgueltig_fehler > 0` · hängende Leases > 0 · Rückstau wächst zwei
   Tage in Folge · ein Mandat ohne Briefing · Datenbank über 350 MB.
8. **Rückfallweg:** betroffene Profile auf `aktiv: false` setzen (Betreiberaktion); der
   Motor bleibt unverändert. Kein Code-Rollback nötig.

### Stufe B · 25 → 50

Zusätzlich zu A: **R8 muss vorher gelöst sein** (Morgenlage über die Warteschlange:
Migration `20260809_jobqueue_narrativ.sql` freigeben und anwenden, dann
`HELMUT_NARRATIV_QUEUE=on`) — sonst bleiben ab ~28 Mandaten Mandate systematisch ohne
Morgenlage. Außerdem: Aufbewahrung (R5) scharf, `HELMUT_CRAWL_RUN_RETENTION` angehoben (R7).

### Stufe C · 50 → 100

Zusätzlich zu B: Slot-Kapazität (R2) belegt erhöht — entweder mehr Slots, höhere
`maxDuration` (Pro-Tarif, §6) oder Ereignis-Antrieb. Supabase-Plan entschieden (R3/R4:
500-MB-Grenze und PITR). **Ohne diese drei Punkte ist 100 nicht betreibbar.**

---

## 9 · Stopkriterien für jeden Lasttest

Ein Lauf wird sofort abgebrochen und gilt als **nicht bestanden**, wenn eines eintritt:

- ein Kriterium aus §3.2 verletzt
- der Lauf schreibt gegen eine andere Datenbank als die lokale Testdatenbank
- Produktionskennungen sind in der Prozessumgebung sichtbar
- die Laufzeit überschreitet das doppelte Slotbudget

---

## 9a · Der sichere chronologische Restweg

Diese Reihenfolge ist verbindlich. Jeder Schritt ist eine **eigene** Entscheidung; keiner
gibt den nächsten automatisch frei.

| # | Schritt | Wer | Art |
|---|---|---|---|
| 1 | **PR #270 vollständig prüfen** | Betreiber | Review |
| 2 | **Getrennte Gründerfreigabe zum Merge** | Gründer | Freigabe |
| 3 | **Automatisches Production-Deployment rein lesend bestätigen** (Commit, `READY`, Uhrzeit) | Betreiber | Kontrolle |
| 4 | **Getrennte Vorprüfung und Gründerfreigabe für Migration F9** | Gründer | Freigabe |
| 5 | **F9 anwenden und rein lesend verifizieren** (Funktion vorhanden, `service_role` kann sie ausführen, `anon`/`authenticated` nicht) | Betreiber | Migration |
| 6 | **Siebentägigen Nachweis mit den fünf bestehenden Mandaten beginnen** | Betreiber | Nachweis |
| 7 | **KI-Deckel festlegen — separat und VOR der Aktivierung der nächsten Mandatsstufe** | Gründer | Freigabe |

> **Korrektur einer früheren Aussage (2026-08-25/3):** hier stand, der KI-Deckel müsse
> **vor** dem Fünfernachweis angehoben werden. **Dafür gibt es keinen Beleg.** Der Nachweis
> läuft mit den **fünf bestehenden** Mandaten, die heute unter dem geltenden Deckel
> arbeiten — gemessen 455 Aufträge/Tag mit rund 98 Verstehensaufträgen. Der Deckel wird
> erst dann zum Hindernis, wenn **zusätzliche** Mandate aktiviert werden (§5.2). Er gehört
> deshalb an Position 7, nicht vor Position 6.
>
> Sollte der laufende Nachweis zeigen, dass der Deckel **schon bei fünf Mandaten** drosselt,
> rückt er vor — das wäre dann ein **gemessener** Befund und keine Annahme.

---

## 10 · Noch erforderliche Freigaben

| # | Freigabe | Wer | blockiert |
|---|---|---|---|
| F1 | KI-Tagesdeckel festlegen (Vorschlag 350/450/700 je Stufe) | Gründer | **Aktivierung** der nächsten Mandatsstufe — **nicht** den Fünfernachweis (§9a) |
| F2 | Import der 20 Profile | Gründer | Stufe A |
| F3 | Aktivierung je Tranche (getrennt von F2) | Gründer | Stufe A |
| F4 | Siebentägiger Fünfernachweis starten | Betreiber | Stufe A |
| F5 | Supabase Pro (PITR, 500-MB-Grenze) | Gründer, Kosten | Stufe C |
| F6 | Migration `20260809_jobqueue_narrativ.sql` anwenden | Gründer | Stufe B |
| F7 | Preisbasis aus echter Rechnung belegen | Betreiber | ehrliche Kostenangabe |
| F8 | Realistischer Belastungsnachweis (Z3) | Gründer, Kosten | Z3 überhaupt |
| F9 | Migration `20260825101500_jobqueue_ankunftskennzahl.sql` anwenden | Gründer | Messbarkeit des 7-Tage-Nachweises (F4) |
