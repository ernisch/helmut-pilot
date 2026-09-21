# Pruefvertrag: unabhaengige Sachpruefung der Prosa-Einordnung

21.09.2026 (Fassung 6: Satztrennung bei deutschen Ordinaldaten im Motor korrigiert; dadurch sind eingabeHash, vertragHash und paketHash neu).
**Kein neuer Lauf durch diese Fassung.** Diese Datei legt den kleinsten sachlich
vertretbaren Methodenvergleich fest und dokumentiert dessen implementierten
Vorbereitungsstand. Der zuvor vorbereitete Lauf wurde am 21.09. ausgefuehrt und
vom Serververtrag strukturell abgelehnt; der Ausgang steht in
[CURRENT_STATE](../../CURRENT_STATE.md), die Ursache behebt Fassung 6 unten.
Kein weiterer Modellaufruf, keine Productionwirkung, keine Profilaktivierung,
keine Migration, keine Cron- oder Environmentaenderung.

Vorlage/Quelle: [prosa-belegplan-2026-09-20.md](prosa-belegplan-2026-09-20.md),
Abschnitte "Praemissenvergleich mit getrennten Sollurteilen" und "Abschluss des
Referenzversuchs". Basis: Main `c4d93e689c185c7f2f90304f565485e67e6425a7`
(Merge PR#493, aliasfreier Schemafix).

**Implementierter Stand (Fassung 6):**
- `lib/helmut/prosa-praemissenpruefung.js` — Fallgrenze `list(data, 1, 6)` auf
  `list(data, 1, 8)` erweitert; **Satzgrenzen-Helfer `saetzeVon`** ergaenzt (siehe
  Fassung 6 unten); alle uebrigen Grenzen und das fail-closed-Verhalten unveraendert.
- `scripts/fixtures/prosa-modellvergleich-8faelle.js` — die acht neuen,
  unabhaengigen Sollfaelle (getrennt vom Modellpayload).
- `scripts/prosa-modellvergleich-8faelle-versuch.js` — der einmalige Ausfuehrer
  (ein Aufruf, `max_output_tokens 8000`, 0,232 USD Deckel, 8-von-8-Auswertung, kein Retry).
- `scripts/prosa-modellvergleich-8faelle-test.js` — gezielte Offline-Abnahme.
- `.github/workflows/staff-backfill-one.yml` — neuer manueller Job
  `prosa-modellvergleich-8faelle` (nur `workflow_dispatch`, kein Cron).

**Fassung 6 — Korrektur der Satztrennung (Ordinaldaten):**
- Belegter Harness-Defekt aus dem ausgefuehrten Lauf (Run `35643571975`, Status in
  CURRENT_STATE): `Intl.Segmenter("de")` zerlegte ein Ordinaldatum
  ("... am 1. Mai 2027 ...") in zwei Scheinsaetze; die unveraenderte
  Deckungsregel `covered.size === f.saetze.length` war dadurch nicht erfuellbar
  (`praemissenpruefung-satz-fehlt`). Die acht Modellurteile selbst entsprachen den
  Sollurteilen.
- Korrektur in `saetzeVon`: Eine von `Intl.Segmenter` gesetzte Grenze wird
  verworfen, wenn ihr eine ein- oder zweistellige Tageszahl mit Punkt vorausgeht
  **und** der naechste Abschnitt mit einem deutschen Monatsnamen beginnt. Das
  trifft genau den Ordinaltag und erhaelt normale Satzenden, Zahlenenden ohne
  Monatsfolge (`... um 9. ...`, `... war 42. ...`) und Abkuerzungen. Nur die
  Grenzen werden bestimmt; die Segmente werden unveraendert zusammengesetzt,
  der Text bleibt also unangetastet (keine Normalisierung, keine Aenderung von
  Belegzitaten). Keine Schutzregel wurde abgesenkt; die Deckungsregel bleibt
  streng.
- **Neue gebundene Werte** (alle acht Sollfaelle sind jetzt genau ein Satz):
  - `eingabeHash` = `vertragHash` = `7f24364b7bd2e62c228887686d15b2d18e86c60c3193ebcae9216c2dde93f187`
  - `paketHash` = `73a88aecfcd918bffe498a53d433541dc71dd9d0e8edd2eb472dcc7694c29ff2`
  - vorher: `eingabeHash`/`vertragHash` `eaa4b69a20dff407ab79ca54e930dc559c937eb3b2563f980954a3f761c00973`,
    `paketHash` `401c90210cb0cde9e1f3d209d24e04e9603e6a82404b9066d09655640bc8e747`
- Ein neuer `CONFIRM_TEXT` ist erst nach feststehendem Commit zu erzeugen und
  bindet dann `commit`, `productionCommit`, den neuen `paketHash` und den
  oeffentlichen Schluessel. Kein kostenpflichtiger Lauf durch diese Fassung.

---

## 1 · Fachliche Frage des Vergleichs

Besteht der zuletzt implementierte Praemissenpruefer
(`lib/helmut/prosa-praemissenpruefung.js` + `lib/helmut/prosa-praemissenreferenzen.js`,
aliasfrei durch PR#493) die getrennt und unabhaengig vom erzeugenden Modell
festgelegten redaktionellen Sollurteile zu Voraussetzungen, Rollen,
Quellenluecken und konkretem Profilbezug **nachvollziehbar und in beide
Richtungen**, also sowohl bei der Abweisung ungedeckter Voraussetzungen als auch
bei der Bestaetigung tatsaechlich getragener Voraussetzungen?

Kurz: *Trennt die Methode belegte Tatsache, offene Informationsluecke und reine
Moeglichkeit/Vorschlag so voneinander, dass ein Gesamturteil `tragfaehig` genau
dann entsteht, wenn wirklich alle Sach- und Rollenvoraussetzungen getragen sind —
und `widersprochen` genau dann, wenn eine Voraussetzung ungedeckt ist?*

Der Vergleich misst **nur die Pruefmethode** (den skeptischen zweiten Schritt nach
einem Entwurf), nicht den Entwurfsgenerator selbst und keine Fachenabnahme der 36
Produktfaelle.

## 2 · Warum dieser Auftrag sachlich neu und keine verbotene Wiederholung ist

Die drei abgeschlossenen Prosaserien und der Quellenpruefer sind dauerhaft nach
je einem Aufruf geschlossen (Grundlage: prosa-belegplan, Abschluss des
Referenzversuchs, L1251–1261). Dieser Auftrag wiederholt davon nichts:

- **Neue Technikbasis.** Der letzte Referenzversuch scheiterte an einem eigenen
  Implementierungsfehler (`structuredClone`-Alias verengte die freien
  Begruendungs-/Behauptungsfelder auf die Fallkennung). PR#493 hat genau diesen
  Fehler behoben. Es gibt damit erstmals einen sauber *ausfuehrbaren* Vertrag,
  der noch nie sauber gegen Sollurteile gemessen wurde.
- **Neue, vollstaendige Sollfellmenge.** Die acht hier definierten Sollfaelle
  sind **nicht** die bereits gesendeten oder gesperrten Faelle (Kennungs- und
  Eingabehash-basiert ausgeschlossen). Sie sind neu, ausschliesslich fuer diesen
  Vergleich formulierte redaktionelle Faelle — einschliesslich zweier positiver
  Kontrollfaelle, die in der ersten Fassung fehlten.
- **Neuer Zweck.** Nicht "Modellurteile aufzuspueren", sondern die *korrigierte
  Methode* in **beide** Richtungen (Ablehnung und Bestaetigung) gegen unabhaengige
  Sollurteile abzunehmen. Ein positiver Einzelfall ersetzt dies nicht (L166,
  L951, L1258–1263).

Damit liegt ein inhaltlich begruendeter, neuer Methodenauftrag vor.

## 3 · Anzahl der unabhaengigen Sollfaelle

**Acht** Sollfaelle:

- **Sechs negative** Sollfaelle, genau einer je Risikoklasse (Finanzen, Vollzug,
  Zuschreibung, Zeit, Profil, Bedingung), Sollurteil jeweils `widersprochen`.
- **Zwei positive Kontrollfaelle**, Sollurteil jeweils `tragfaehig`.

Keine Dreiergruppen, keine doppelte Pfadabdeckung, keine positiv/negativ/unklar-
Vervielfaeltigung. Das ist die kleinste Menge, die (a) alle sechs belegten
Fehlerklassen in der Abweisungsrichtung abdeckt **und** (b) die Gegenrichtung
(Bestaetigung tatsaechlich getragener Voraussetzungen) sichert — eine Pauschale
Ablehnungsmethode wuerde die sechs Negativfaelle bestehen, aber an den zwei
Positivfaellen scheitern. Weiterhin **keine** repraesentative Validierung und
keine Fachenabnahme.

### Warum die zwei positiven Kontrollfaelle notwendig sind

Eine Methode, die pauschal jede Praemisse ablehnt, wuerde die sechs rein
negativen Sollfaelle trivial bestehen — der Vergleich bewiese dann nur
"schlaegt immer aus", nicht "unterscheidet richtig". Die zwei positiven
Kontrollfaelle mit klar belegter Tragfaehigkeit erzwingen, dass die Methode
auch tatsaechlich getragene Voraussetzungen **erkennt und bestaetigt**. Erst
diese Symmetrie macht den Vergleich zu einem echten Unterscheidungstest.

## 4 · Einfrieren der Sollfaelle vor dem Modellaufruf

- Jeder der acht Sollfaelle liegt als fixe, menschengeschriebene redaktionelle
  Referenz mit (a) Quellen-Eingabetext, (b) Profil-Eingabetext, (c)
  Einordnungssatz/-saetze und (d) dem erwarteten Urteil samt Begruendungsanker vor.
- Die zwei positiven Kontrollfaelle tragen ihre Tragfaehigkeit **vollstaendig aus
  den eingefrorenen Belegen**: jede Sach- und Rollenvoraussetzung ist durch eine
  wörtliche Originalstelle gedeckt, es gibt keine Informationsluecke, keine
  unbelegte Befugnis und keinen unbekannten Entscheidungsstand.
- Diese Referenzen werden **vor** jedem kostenpflichtigen Aufruf zu einem
  kanonischen `paketHash` gefroren, der als einziger Eingabewert in den
  `eingabeHash`-Bindungsknoten des Praemissenpruefers eingeht.
- Ein Commitwechsel, eine nachtraegliche Aenderung einer Sollaussage oder ein
  neuer Paketinhalt aendert den Hash und sperrt den Lauf (fail-closed).
- Anbieter sieht nur Kennungen und Eingaben; Sollurteile, Fallklassen und
  Begruendungsanker bleiben verborgen (analog L1012–1015).

## 5 · Erwartetes Sollurteil je Fall

Sechs negative Faelle (Abweisungsrichtung, Sollurteil `widersprochen`) und zwei
positive Kontrollfaelle (Bestaetigungsrichtung, Sollurteil `tragfaehig`). Das
Modell schreibt dazu getrenntes `urteil` je Fall; der unabhaengige Soll-Vergleich
weist die Abweichung aus. Die acht Faelle liegen eingefroren in
`scripts/fixtures/prosa-modellvergleich-8faelle.js`; ihre Sollurteile und
Begruendungen gelangen **nie** in den Modellauftrag.

### Negative Sollfaelle (`widersprochen`), je ein Fall

| # | Klasse | Konstruiertes Negativmerkmal (Quelle -> fehlgedeutete Einordnung) |
| --- | --- | --- |
| N1 | Finanzen | "Ruecklage, keine Grundsteuererhoehung" wird als "beschlossene Grundsteuererhoehung" verteidigt |
| N2 | Vollzug | "zur Beratung ueberwiesen, Beschluss offen" wird als "beschlossenes Gesetz" verteidigt |
| N3 | Zuschreibung | "persoenliche Einzelmeinung" wird zur "offiziellen Fraktionsposition" |
| N4 | Zeit | "Beschluss am 8. Februar / Inkrafttreten 1. Mai" werden vertauscht zum "Beschluss am 1. Mai" |
| N5 | Profil | "Stellvertretung, Vorsitz bei anderer Person" wird zu "Vorsitzende + Entscheidungspflicht" |
| N6 | Bedingung | "nur wenn Antrag fristgerecht, keine Zusage" wird zu "wer einreicht, dem ist sicher bewilligt" |

### Positive Kontrollfaelle (`tragfaehig`), zwei Faelle

| # | Klasse | Belegte Tragfaehigkeit (vollstaendig aus den eingefrorenen Belegen) |
| --- | --- | --- |
| P1 | Profilbezug | "Mitglied im Ausschuss fuer Arbeit und Soziales" + "Ausschuss beraet ueber Grundsicherung" tragen den fachlichen Bezug; Vorbereitung ist reine Moeglichkeit ohne neue Tatsache/Befugnis |
| P2 | Beschluss und Frist | "Beschluss am 3. Mai 2027" + "Inkrafttreten 1. Juli 2027" sind ausdruecklich genannt; Begruessen ist freiwillige Bewertung ohne neue Tatsache oder Leserposition |

Die zwei positiven Faelle sind fachlich eindeutig: Jede nichtleere Voraussetzung
ist auf eine ganze Originalstelle zurueckgefuehrt, es bleibt keine Praemisse
`offen` oder `widersprochen`, und es liegt keine reine Moeglichkeit/Vorschlag
ohne Sachdeckung vor. Die sechs negativen Faelle tragen je ein konkretes
Negativmerkmal, das die Methode als `widersprochen` erkennen muss.

## 6 · Bewertung: bestanden / teilweise / abgelehnt

Massgebend ist der unabhaengige Soll-Vergleich, **nicht** das Selbsturteil des
Modells (ein eigenes `fachlichBestanden` des Generators ist keine Freigabe —
prosa-belegplan L27–28, L949).

- **Bestanden:** Exakt **8 von 8** Sollurteilen korrekt. Alle sechs negativen
  Faelle liefern `widersprochen`, beide positiven Kontrollfaelle liefern
  `tragfaehig`. Zudem: keine unbelegte Sachpraemisse, keine falsche
  Rollenpraemisse, keine falsche Zuschreibung, keine unzulaessige Fremdreferenz,
  keine Kennung als Ersatz fuer einen Beleg, keine abgeschnittene oder
  unbrauchbare Originalstelle, keine Serverablehnung; Quellen und Originalstellen
  korrekt gebunden; Kosten und Quittung vollstaendig nachvollziehbar.
- **Teilweise bestanden:** Ein bis sieben Faelle korrekt, aber mindestens ein Fall
  abweichend; ODER alle Urteile stimmen, aber einzelne Belegbindungen fehlen/
  abgeschnitten oder Kosten/Quittung unvollstaendig. Teilbestand gilt **nicht**
  als Freigabe.
- **Abgelehnt:** Ein einziges falsches Urteil genuegt — sei es ein negativer Fall
  faelschlich `tragfaehig`, ein positiver Kontrollfall faelschlich
  `widersprochen`/`offen`, ODER Serverablehnung, ODER technischer Fehler/Timeout,
  ODER unvollstaendige Quittung.

**Keine Mehrheitsregel.** Ein einzelner Fehler bedeutet "nicht abgenommen",
unabhaengig von den uebrigen sieben. Kein Retry, keine zweite Modellanforderung.

## 7 · Anforderungen an Sach-/Rollenpraemissen, Quellenluecken, Profilbezug

Pro Fall muessen die methodischen Pflichtpruefungen aus
`prosa-praemissenpruefung.js` gelten, unveraendert:

- **Sachpraemisse:** Jede ausdrueckliche oder stillschweigende Voraussetzung ist
  einzeln benannt; `befund` nur `getragen`/`widersprochen`/`offen`/
  `keineTatsachenbehauptung`. Eine Informationsluecke ist `offen`, keine kausale
  Wirkung.
- **Rollenpraemisse:** Sprecher, Adressat, Herausgeber und Gruppe bleiben
  getrennt; Mitgliedschaft belegt weder Vorsitz noch Verfahrensrecht.
- **Quellenluecke:** "Nicht genannt" bedeutet unbekannt, nicht "fehlt in
  Wirklichkeit"; daraus wird keine Wirkung abgeleitet.
- **Profilbezug:** Ein vorhandener Profileintrag belegt keinen fachlichen Bezug
  zu jedem Vorgang; der konkret gewaehlte Bezug muss gegen den ganzen
  Quelleninhalt und das Profil stehen.
- **Moeglichkeit/Vorschlag:** `keineTatsachenbehauptung` nur bei `moeglichkeit`
  oder `vorschlag`; jede darin vorausgesetzte Tatsache oder Befugnis bleibt eine
  eigene, belegpflichtige Pruefzeile.
- **Positivfall-Pflicht:** `tragfaehig` ist nur zulaessig, wenn `befund` aller
  Praemissen `getragen` oder `keineTatsachenbehauptung` ist, jede `getragen`-
  Praemisse mindestens einen Beleg traegt und keine Praemisse ungedeckt bleibt
  (Serververtrag `prosa-praemissenpruefung.js` L71–77).

Keine dieser Pflichten wird fuer diesen Vergleich abgeschwaecht. Zitate beweisen
keine Bedeutung (`bedeutungUnabhaengigBewiesen: false` bleibt).

## 8 · Modell

`gpt-5-mini` (Azure Global Standard), `reasoning effort low`,
`max_output_tokens 8000`, strukturierte JSON-Ausgabe `strict` — Modell, Reasoning
und Schemavorgabe identisch mit dem zuletzt belegten Referenzversuch
(prosa-belegplan L1187–1189). Einzig die Ausgabegrenze wurde fuer diesen
isolierten Lauf von 3000 auf 8000 angehoben (Fassung 5): acht Faelle in EINEM
Aufruf brauchen mehr Ausgaberaum als der Standardpfad von `prosa-einordnung-versuch.js`
(`model: "gpt-5-mini"`, `reasoning: { effort: "low" }`,
`text.format.type: "json_schema"`, `strict: true`). Kein Modellwechsel.

**Keine stille Abweichung.** Modell, Reasoning und Schema werden unveraendert
uebernommen. Die **einzige** Abweichung ist die ausdruecklich dokumentierte
Ausgabegrenze 3000 → 8000 (Fassung 5) samt ihrer konservativen Volldecke; sie ist
nicht still, sondern in §8, §10 und der Zusammenfassung belegt.

## 9 · Exakte maximale Zahl kostenpflichtiger Modellaufrufe

**Ein (1)** Aufruf: genau ein Praemissenpruefgang ueber alle acht Sollfaelle,
gebuendelt in einem Paket. Kein Entwurfsschritt (der Entwurf existiert bereits
als fixer Einordnungstext in den Sollfaellen), kein separater Reviewschritt, kein
Retry, keine zweite Modellanforderung.

Begruendung fuer einen statt mehrerer Aufrufe: Der zu pruefende Unterschied ist
ausschliesslich die *Sachentscheidung* der korrigierten Methode gegen die
Sollurteile; die Entwurf-und-Review-Kette der abgelehnten Vorlaeufe ist
geschlossen und wird nicht wiederholt. Ein Aufruf ist die minimale, sachlich
vertretbare Kostenstelle.

**Technischer Stand:** Der Serververtrag `binde()` in `prosa-praemissenpruefung.js`
ist fuer diesen Vertrag von `list(data, 1, 6)` auf `list(data, 1, 8)` erweitert
(Fassung 3). Acht Faelle werden akzeptiert, neun Faelle weiterhin **fail-closed**
abgelehnt; alle uebrigen Grenzen (Kontext je Fall 1–6, Praemissen 1–12, Belege
0–6, Zitat <=1200, Referenztext <=6000, Gesamt <=48000 Zeichen) sind unveraendert.

## 10 · Konservative maximale Gesamtkosten

**Kostenarten strikt getrennt:**

- **KI-Kosten (absoluter Deckel):** **0,232000 USD** (232.000 Mikro-USD). Das ist
  die harte volle Reserve fuer genau einen Aufruf, gemaess dem konservativen
  Reservierungspfad `lib/helmut/testkosten-budget.js`:
  `tokenKosten(MAX_INPUT_TOKENS=400000, MAX_OUTPUT_TOKENS=8000)
  = ceil(400000/2 + 8000*4) = ceil(200000 + 32000) = 232000` Mikro-USD.
  Die Reserve deckt das **gesamte Modellkontextlimit** ab (kein Tokenraten). Die
  tatsaechlichen Ist-Kosten liegen erfahrungsgemaess deutlich darunter
  (Referenzlauf 7.589 Mikro-USD bei 1.226/1.744 Token, prosa-belegplan
  L1119–1122); massgeblich als Obergrenze ist aber die konservative Volldecke von
  0,232 USD.
- **Infrastruktur-/Abokosten:** nicht Teil dieses Vertrags; Azure- und
  Supabase-Grundgebuehren sind getrennt und werden hier weder erhoeht noch
  angesetzt. Es entsteht **keine** neue Infrastruktur- oder Abokostenposition
  durch diesen Lauf.

0,232 USD liegt **deutlich unter** dem unveraenderten 4-USD-Tagesriegel.

Der exakte Deckel wird beim Freigeben an den tatsaechlichen Tokenkostensatz aus
`lib/helmut/testkosten-budget` gebunden und als harte Obergrenze in den
Ausfuehrer geschrieben (Fail-Closed).

## 11 · Tageskostengrenze

**4 USD** je UTC-Tag, unveraendert (der technische atomare Riegel). Die fruehere
10-USD-Betreibergrenze erhoeht diesen engeren Riegel nicht (CLAUDE.md §5,
CURRENT_STATE §12.3). Zusaetzlich gilt `HELMUT_MAX_LLM_CALLS_PER_DAY=2416` etc.
unveraendert; es wird **kein** Budget- oder Environmentwert geaendert, keine
stille Budgeterhoehung.

## 12 · Harte Stoppbedingungen

Sofortiger Stop ohne Retry, Modellwechsel oder zweitem Aufruf bei **jeder** der
folgenden Bedingungen (analog der bereits belegten Ausfuehrerkonfiguration):

1. Abweichung vom eingefrorenen Sollfallpaket (`paketHash` oder `eingabeHash`
   weicht ab).
2. Hashabweichung (eingefrorener Stand, Schema- oder Prompt-Hash weicht ab).
3. Wiederverwendung alter Kennungen oder Eingaben (ein bereits behandelter
   Referenz-/Praemissen-/Restfaellen-Stand oder Eingabehash taucht wieder auf).
4. Mehr als ein Modellaufruf (Transportzaehler `requests !== 1`).
5. Ueberschreitung des absoluten Kostendeckels (0,232000 USD bzw. der gebundene
   Tokenkostenwert).
6. Falscher Vorflugzustand: nicht exakt 504 Profile, eines aktiv, lebende
   Sperre/Lease/junger Prozess, Kommunikations- oder Kohortenquelle nicht
   gesperrt.
7. Serverablehnung (fehlende Praemisse/Satz, Fremdreferenz, abgeschnittene
   Stelle, Kennung als Beleg, abweichender `eingabeHash`).
8. Unvollstaendige Quittung (fehlende oder nicht rueckgelesene Quittungszeile,
   Kostenbeleg oder Rohantwort).
9. Unbrauchbare Belegbindung (Zitat nicht Teil der Originalstelle, abgeschnittene
   Stelle ueber 1200 Zeichen, Kandidatensatz als Beleg).
10. Ein einziges falsches Sollurteil (negativer Fall nicht `widersprochen`, oder
    positiver Kontrollfall nicht `tragfaehig`).
11. Technischer Fehler, der die fachliche Bewertung unzuverlaessig macht
    (Timeout, kein HTTP200, keine Antwortbytes, Transportabbruch).
12. Zeitablauf des Gesamtlauf-Fensters oder Schreib-/Ablagekonflikt (nicht gegen
    den persistierten Stand gegengeprueft).

Keine automatische Wiederholung, keine stille Budgeterhoehung, kein Modellwechsel.

## 13 · Zu speichernde Belege und Quittungen

Alle privat und dauerhaft, rueckgelesen und gegen Wiederholung gesperrt:

- Vollstaendige Anbieter-Rohantwort (Bytes + `responseHash`).
- Transportbeleg (Request-Nutzlast, Status, `responseHash`).
- Eingefrorenes Paket (acht Sollfaelle, Prompts, Schema), `paketHash`,
  `eingabeHash`.
- Kostenbeleg je Lauf (`testKostenTage`-Zeile, `llmUsage`-Zeile, Ticket).
- Einmalige Quittungszeile im Auth-Store (eigener KEY, Status `gestoppt`,
  `fachlichBestanden=false`, `inProductionImportiert=false`).
- Der unabhaengige Soll-Vergleich (menschengeschrieben) als getrenntes
  Referenzdokument, einschliesslich der zwei positiven Kontrollfaelle samt ihren
  Belegankern.

Kein privater Schluessel, kein Rohlog, keine Rohantwort liegt im Repository
(Grundlage: prosa-belegplan L799–801; CLAUDE.md §7: keine Secrets ins Repo).

## 14 · Zu schuetzende private Daten / Schluesselbindungen

- Eigener, einmaliger privater Empfaengerschluessel und
  `Bestaetigungspraefix MODELLVERGLEICH8_EINMAL:`, exklusiv fuer diesen einen Lauf.
- Alle alten Quittungen (`prosaPraemissen20260921`, `prosaRestfaelle20260921`,
  `prosaReferenzen20260921`) bleiben geschlossen und unveraendert geschuetzt.
- Kostenhistorie, Telemetrie und `llmUsage`-Ring bleiben erhalten; keine alte
  Quittung wird wiederverwendet.
- Schutzgrundlinie (Profile/Konten/Main/Auth-Hash) wird vor Lauf eingefroren und
  nach Lauf gegenrueckgelesen; nur die neue Quittung, `llmUsage`,
  `testKostenTage` und `_authStoreRevision` sind ausgenommen.

## 15 · Automatische vs. fachlich manuelle Auswertung

- **Automatisch (Serververtrag, offline reproduzierbar):** Bindungs- und
  Vollstaendigkeitspruefung (jeder Satz eine Praemisse, alle Belege an
  Originalstellen gebunden, kein Alias, keine Fremdreferenz), Erkennung eines
  faelschlichen `tragfaehig` beziehungsweise einer fehlenden Bestaetigung im
  Positivfall, Quittungs- und Kostenbeleg.
- **Fachlich manuell (unabhaengiger Redakteur):** Abgleich aller acht
  Modellurteile und Begruendungsanker gegen die eingefrorenen Sollurteile; die
  Entscheidung "bestanden/teilweise/abgelehnt". Das Modell bewertet sich dabei
  nicht selbst und die zwei positiven Kontrollfaelle werden gegen ihre belegten
  Beleganker geprueft.

## 16 · Ergebnis, das den Blocker als geschlossen gelten laesst

**Bestanden** nach §6, belegt durch: (a) vollstaendige, rueckgelesene
Rohantwort, (b) automatische Serverannahme ohne Abschwaechung, (c) manuellen
Sollabgleich **acht Mal exakt richtig** (6×`widersprochen`, 2×`tragfaehig`) mit
sauberer Zitatbindung, (d) keine einzige faelschlich-`tragfaehige` oder unbewertete
Praemisse und keine faelschlich abgelehnte getragene Praemisse, (e) Kosten/Quittung
belegt innerhalb des 4-USD-Riegels. **Erst danach** darf die 36er Fachabnahme (36
echte Produktfaelle, beide Pfade) ueberhaupt geplant werden.

## 17 · Ergebnis, das bedeutet: Methode weiterhin nicht abgenommen

**Teilweise bestanden** oder **abgelehnt** nach §6, oder irgendein Stopp aus §12,
oder fehlende/mehrdeutige Quittung, oder ein einziges falsches Sollurteil. In
diesen Faellen gilt der Blocker als weiterhin offen; der negative Befund darf
nicht als bestanden umgedeutet werden (CLAUDE.md §4, kein falsches Gruen). Ein
erneuter Versuch braucht dann einen **neuen** sachlich begruendeten Auftrag, nicht
ein Prompttuning derselben Faelle.

## 18 · Umgang mit den Testdaten nach dem Lauf

- Die acht Sollfaelle sind synthetische Beispiele; sie enthalten **keine** realen
  Personen-, Ereignis- oder Profildaten und werden nicht in den produktiven
  Bestand uebernommen.
- Die Quittungszeile bleibt dauerhaft erhalten und gegen Wiederholung gesperrt
  (Status `gestoppt`, `inProductionImportiert=false`).
- Rohantwort, Transportbeleg und Soll-Vergleich bleiben privat gesichert; im
  Repository verbleiben ausschliesslich anonymisierte Belegverweise.
- Keine der acht Faelle wird einer erneuten Sendung, Kennung oder Auswertung
  zugefuehrt; ein Commitwechsel darf sie nicht als unbehandelt ausgeben.

## 19 · Naechster Schritt nach Erfolg Richtung 36 Produktfaelle und 500er Nachweis

1. 36er Fachabnahme definieren (36 echte Produktfaelle in beiden Pfaden,
   Speicherung + Ruecklesung), erneut mit eingefrorenen Sollurteilen.
2. Belastbare frische Quellenversorgung fuer exakt 500 Profile erheben (kein
   31er-Import-Recht, kein Versorgungsbetrug).
3. 1500 Ergebnispositionen messen und belastbare Zeit-/Kostenrechnung anlegen
   (Einzelpaar-Hochrechnung ist keine 500er-Summe).
4. Erst danach Freigabeentscheidung ueber einen 500er-Production-Test stellen.

---

## Zusammenfassung Entscheidungsgrundlage

| Frage | Antwort |
| --- | --- |
| Fachliche Frage | Unterscheidet die Methode getragen/offen/widersprochen korrekt in **beide** Richtungen? |
| Neu / keine Wiederholung | Ja: neue Technikbasis (PR#493), neue 8 Sollfaelle, neuer Zweck |
| Sollfaelle | 8 (6 negative `widersprochen` + 2 positive Kontrolle `tragfaehig`) |
| Max. Modellaufrufe | 1 |
| Modell | gpt-5-mini, reasoning low, 8000 out, JSON strict (nur Ausgabegrenze erhoeht) |
| Max. KI-Kosten absolut | 0,232000 USD (volle Reserve, 1 Aufruf); Infrastruktur/Abos getrennt |
| Tagesgrenze | 4 USD unveraendert |
| Erfolg | 8/8 korrekt (6×`widersprochen` + 2×`tragfaehig`), sauber gebunden, keine Serverablehnung, Quittung vollstaendig |
| Stopp | Hash-/Paketabweichung, alte Kennung, >1 Aufruf, Kostendeckel, Vorflug, Serverablehnung, Quittung/Belegbindung fehlerhaft, 1 falsches Urteil, technischer Fehler |

Dieser Vertrag loest selbst keinen bezahlten Lauf aus; der eine kostenpflichtige
Modellaufruf bleibt gesondert freizugeben und wird hier nicht ausgefuehrt.
