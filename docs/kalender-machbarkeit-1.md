# Kalender Machbarkeit 1 — kann Helmut Kalendereinladungen verstehen?

**Stand:** 2026-08-02 · **Sprintzustand: erfolgreich abgeschlossen** (lokaler
Machbarkeitsnachweis; kein Production-Pfad berührt, kein Merge)

Kanonisch für: Verständnis von ICS-Kalendereinladungen (RFC 5545) und die
Zustandslogik für Einladung / Änderung / Absage.

---

## 1 · Was hier geprüft wurde, in einfachen Worten

Die Produktidee lautet: **ein Nutzer trägt eine persönliche Helmut-Terminadresse
als Teilnehmer in einen Termin ein.** Helmut bekommt die Einladung dann wie jeder
andere Teilnehmer per E-Mail, übernimmt den Termin, merkt Änderungen und
verarbeitet Absagen.

Der Umweg über die Einladung statt über einen Kalenderzugriff hat einen Grund:
Bundestags- und Landtagskalender sind nicht verlässlich direkt abrufbar, und
Outlook kann an Microsoft 365 **oder** an ein hausinternes Exchange hängen — ein
Zugang, den wir nicht voraussetzen können. Eine Einladung dagegen sieht überall
gleich aus, weil alle Kalendersysteme denselben Standard sprechen.

**Geprüft wurde nur der mittlere Schritt:** aus dem Anhang einer Einladung einen
verlässlichen Termin machen. **Nicht** geprüft und **nicht** gebaut wurde der
E-Mail-Empfang, eine Adresse, ein Postfach, eine Datenbank oder eine Oberfläche.

## 2 · Technisches Ergebnis

**Ja, das funktioniert — und zwar für Outlook und Google gleichermaßen.**

Der Nachweis, auf den es ankommt: dieselbe Ortszeit, von Outlook-Desktop und von
Google Kalender verschickt, ergibt **denselben** UTC-Zeitpunkt — obwohl die
beiden den Termin völlig unterschiedlich aufschreiben.

| | Outlook-Desktop / Exchange | Google Kalender |
|---|---|---|
| Zeitzone im Anhang | `TZID:W. Europe Standard Time` (Windows-Name) | `TZID:Europe/Berlin` (IANA-Name) |
| Absage | oft `METHOD:CANCEL` **ohne** `STATUS:CANCELLED` | `METHOD:CANCEL` + `STATUS` |
| Zusatzfelder | `X-MICROSOFT-*`, `X-ALT-DESC` (HTML) | keine |

Beide Wege führen im Test auf `2026-08-14T07:30:00Z`.

**Der Windows-Zonenname war der wichtigste Einzelbefund.** `Intl`/ICU in Node
kennt `W. Europe Standard Time` **nicht** — ohne eine Übersetzungstabelle wäre
jede Outlook-Desktop-Einladung unverarbeitbar gewesen. Die Tabelle
(`lib/helmut/kalender/zeitzonen.js`) ist ein bewusster Ausschnitt der
CLDR-Liste: die für Helmut realistischen Zonen. Was nicht darin steht, wird
**abgelehnt und nicht geraten**.

**Bibliothek:** `ical.js` 2.2.1 (MPL-2.0, gepflegt von Philipp Kewisch,
Thunderbird-Kalender). Ausgewählt, weil sie **null Transitivabhängigkeiten** hat
und selbst weder Netz noch Dateisystem berührt (geprüft: alle Treffer auf
`fetch`/`import(` in der Auslieferung sind JSDoc-Kommentare).

> **Das war der einzige echte Architekturbruch dieses Sprints.** Das Repo war bis
> hierhin **abhängigkeitsfrei** — `ical.js` ist die **erste** Laufzeitabhängigkeit
> überhaupt, und CI braucht jetzt einen `npm ci`-Schritt. Die Entscheidung wurde
> dem Betreiber vor der Installation vorgelegt und von ihm getroffen. Begründung:
> ein eigener Parser hätte Zeilenfaltung, Escaping, `VTIMEZONE`, `RECURRENCE-ID`
> und `RRULE` nur teilweise verstanden — und ein halb verstandener Standard ist
> bei Terminen schlimmer als gar keiner. Siehe [`ARCHITECTURE.md`](ARCHITECTURE.md) §10.

**Zeitzonen kommen bewusst NICHT aus der Einladung.** Jede ICS-Datei bringt ihre
eigenen Sommerzeitregeln als `VTIMEZONE` mit — vom Absender, teils jahrealt. Wir
rechnen stattdessen über den IANA-Namen mit der Zeitzonendatenbank von Node/ICU,
die unter unserer Kontrolle steht und aktuell gehalten wird.

## 3 · Der interne Vertrag „Helmut-Termin"

Alles Weitere in Helmut soll später nur diese Form kennen, nie ICS
(`lib/helmut/kalender/termin-vertrag.js`):

| Feld | Bedeutung |
|---|---|
| `mandat_id` | **von außen übergeben**, nie aus dem Inhalt hergeleitet |
| `event_uid` | UID aus der Einladung |
| `recurrence_id` | gesetzt, wenn es um **eine** Wiederholung geht; sonst `null` |
| `sequence` | Fortschreibungszähler des Organisators |
| `method` | `REQUEST`, `CANCEL`, `PUBLISH`, … |
| `status` | `bestaetigt` · `vorlaeufig` · `abgesagt` |
| `summary` · `location` | Titel und Ort, bereinigt und längenbegrenzt |
| `start_at` · `end_at` | UTC-Zeitpunkt (`…Z`) oder bei ganztägig reines Datum |
| `all_day` | ganztägig ja/nein |
| `timezone` | aufgelöster IANA-Name, bei ganztägig `null` |
| `organizer` | **nur Anzeige** — nie zur Mandatsfindung |
| `last_modified` | `LAST-MODIFIED`, ersatzweise `DTSTAMP` |
| `serie` | `ist_serie` · `ist_ausnahme` · `rrule_roh` · `termine_aufgeloest` |

**Terminidentität = `mandat_id` + `event_uid` + `recurrence_id`.** Das Mandat ist
Teil des Schlüssels: dieselbe Einladung an zwei Mandate ergibt zwei getrennte
Termine, und ein Termin des einen kann den des anderen nicht überschreiben.

Die Feldliste ist eine **weiße Liste**: `baueTermin` übernimmt nur die oben
genannten Felder. Ein zusätzliches Feld aus dem Parser käme gar nicht erst durch.

## 4 · Zustandslogik

Rein, ohne Speicher, ohne Uhr, ohne Zufall — dieselben Eingaben ergeben immer
dieselbe Antwort. Das ist hier keine Stilfrage: **E-Mail liefert nicht in der
Reihenfolge des Absendens.** Eine ältere Änderung kann nach einer neueren
eintreffen.

Ordnung nach RFC 5546: `SEQUENCE` entscheidet, bei Gleichstand `DTSTAMP`.

| Fall | Ergebnis |
|---|---|
| neue Einladung | `angelegt` |
| höhere `SEQUENCE` | `aktualisiert` |
| gleiche `SEQUENCE`, neueres `DTSTAMP` | `aktualisiert` |
| identische Wiederholung | `unveraendert` |
| ältere, verspätete Nachricht | `veraltet-ignoriert` |
| Absage | `abgesagt` |
| Nachricht nach einer Absage | `unveraendert` (Absage ist **Endzustand**) |
| Absage zu unbekanntem Termin | `veraltet-ignoriert`, es wird **nichts angelegt** |
| fremdes Mandat | `abgelehnt` |

**Zwei Entscheidungen, die nicht selbsterklärend sind:**

1. **Eine Absage bei *gleichem* Stand wird trotzdem angenommen.** Outlook
   wiederholt bei Absagen teils `SEQUENCE` und `DTSTAMP` unverändert. Strikt
   „gleich = nichts tun" ließe einen abgesagten Termin im Kalender stehen — der
   teuerste aller Fehler in diesem Produkt.
2. **Eine Absage ist endgültig.** Ein Organisator, der einen abgesagten Termin
   wiederbeleben will, vergibt laut RFC 5546 eine neue UID. Alles andere hieße:
   eine verspätete Nachricht könnte einen abgesagten Termin zurückholen.

## 5 · Was getestet ist

`scripts/kalender-ics-test.js` — **134/134 grün**, ausschließlich künstliche
Fixtures (erfundene Namen, reservierte Domains nach RFC 2606/6761), **keine
Daten des Pilotmandanten**.

Alle 17 Pflichtfälle des Auftrags sind abgedeckt: Outlook · Google ·
Europe/Berlin · UTC · Sommer- und Winterzeit **inklusive beider
Umstellungstage** · ganztägig · Umlaute und gefaltete Zeilen · Zeit- und
Ortsänderung · Absage · Doppelempfang · verspätete ältere Änderung · fehlende
UID · fehlender Start · ungültiger Inhalt · übergroßer Inhalt · Serie ·
Änderung und Absage **einer** Wiederholung.

Dazu, über den Auftrag hinaus: Reihenfolgeunabhängigkeit des Endstands,
Mandantentrennung, und die Sicherheitsgrenzen aus §7.

**Die Suite wurde gegengeprüft.** `scripts/kalender-ics-mutationsprobe.js`
nimmt 18 zentrale Garantien **einzeln** zurück und prüft, dass die Suite jede
Rücknahme bemerkt: **18/18 rot**, Referenzlauf grün.

> **Vier Mutationen haben im ersten Anlauf überlebt** — das wird hier benannt,
> nicht versteckt, denn es waren echte Lücken:
> (1) Ein Mandatsübergriff wurde zwar abgewiesen, aber mit der Begründung „UID
> passt nicht" — ein Übergriff zwischen Mandaten und ein UID-Irrläufer sind
> nicht dasselbe Ereignis und dürfen im Betrieb nicht gleich aussehen.
> (2) Die Sommerzeitkorrektur an der Umstellgrenze konnte falsch rechnen und den
> Fehler anschließend selbst zurechtbiegen — mit einem Warnhinweis
> „Ortszeit nicht existent" als einzigem Überbleibsel, den kein Test prüfte.
> Jetzt ist zugesichert, dass gültige Ortszeiten **keinen** solchen Hinweis
> erzeugen. (3) Die Steuerzeichen-Entfernung war nur für Zeilenumbrüche geprüft
> — die fängt schon die Leerraum-Normalisierung ab; ein rohes `U+0007` fiel
> durch. (4) Die vierte Mutation zielte auf die falsche Datei und prüfte ins
> Leere: die Garantie hing an der weißen Liste in `baueTermin`, nicht am Parser.
> Außerdem ließ eine Mutation die Suite zunächst **abstürzen**, statt sie sauber
> rot zu machen — ein Absturz sagt nicht, *welche* Zusicherung fehlt; sie ist
> jetzt eine rein semantische Rücknahme.

Dazu abgesichert: ganztägige Termine ohne `DTEND` über die **Monats-, Jahres-
und Schaltjahresgrenze** — „31.08. + 1 Tag" hätte einen 32. August erzeugen
können, ohne dass ein Test es bemerkt. `ical.js` normalisiert korrekt; das ist
jetzt zugesichert statt nur beobachtet.

**Bestandssuiten unverändert:** Offline-Gesamtlauf **186/200** gegen die im
selben Arbeitsbaum gemessene Basislinie **185/199**, mit **identischer**
14er-Fehlschlagliste (umgebungsbedingt: fehlende Umgebungsvariablen in der
Cloud-Sitzung, steht so auch in `CURRENT_STATE.md`). Delta genau **+1** = die
neue Suite. Keine Regression.

**In CI belegt, nicht nur lokal behauptet** (Lauf `30757186651`): beide
Pflicht-Checks grün — `Syntax + Offline-Suiten` **200/200 Suiten in 62 s** und
`Browser-/Mobile-Smoke (Chromium)`. Der `npm ci`-Schritt lief in **beiden** Jobs
in rund einer Sekunde durch; damit ist die einzige riskante Änderung dieses
Sprints unter echten CI-Bedingungen nachgewiesen. Dass CI 200/200 meldet und die
Cloud-Sitzung 186/200, ist kein Widerspruch — die 14 Fehlschläge sind
umgebungsbedingt und stehen identisch in der Basislinie.

## 6 · Was noch NICHT unterstützt wird — ehrlich

| Grenze | Stand |
|---|---|
| **Serien werden nicht aufgelöst** | Die `RRULE` wird im Rohtext gespeichert, aber **nicht** in Einzeltermine ausgerechnet. „Wann genau ist der nächste Wochenauftakt?" beantwortet Helmut heute **nicht**. Der Datensatz sagt das selbst: `serie.termine_aufgeloest = false`. |
| **`EXDATE` wird nicht ausgewertet** | Einzelne gestrichene Termine einer Serie sind ohne Auflösung ohnehin nicht darstellbar. |
| **Schwebende Zeiten werden abgelehnt** | `DTSTART` ohne `TZID` und ohne `Z` bezeichnet keinen eindeutigen Zeitpunkt. Wir raten nicht „wird schon Berlin sein" — das wäre genau die stille Annahme, die einen Termin um eine Stunde verschiebt. Manche internen Exchange-Systeme senden so; ob das in der Praxis vorkommt, muss der nächste Sprint messen. |
| **Unbekannte Zeitzonen werden abgelehnt** | Was nicht in der CLDR-Tabelle steht, wird nicht geraten. |
| **`METHOD:REPLY` wird nicht verarbeitet** | Zu-/Absagen **anderer** Teilnehmer werden gelesen, aber nicht ausgewertet. Für „was steht heute an?" irrelevant. |
| **Mehrdeutige Ortszeit** | Bei der Rückstellung im Oktober gibt es 02:30 zweimal. Wir wählen das **erste** Vorkommen (noch Sommerzeit). RFC 5545 legt nichts fest. |
| **Nicht existente Ortszeit** | 02:30 am Vorstellungstag gibt es nicht. Der Termin rutscht um die Sprungweite nach vorn und wird **als Hinweis gemeldet**, nicht still verschoben. |
| **Ganztägig: Ende ist exklusiv** | `DTEND;VALUE=DATE:20260815` bei einem Termin am 14.08. heißt „bis einschließlich 14.08.". So steht es im Standard; eine Oberfläche muss das später umrechnen. |

## 7 · Sicherheitsgrenzen

Alle als Zusicherung verdrahtet, nicht nur als Vorsatz:

1. **Kein Abruf.** Kein `fetch`, kein `http`, kein `fs`, kein Kindprozess in der
   gesamten Komponente — als Test über den eigenen Quelltext geprüft.
2. **Kein HTML.** `DESCRIPTION` und `X-ALT-DESC` (dort legt Outlook seinen
   HTML-Text ab) werden **nicht übernommen**. Es gibt keinen HTML-Wert, den
   später jemand versehentlich rendern könnte.
3. **Keine URLs.** `URL` und `ATTACH` gelangen nicht in den Vertrag.
4. **Kein Sprachmodell.** Kein KI-Aufruf, 0,00 USD.
5. **Keine Inhalte in Logs oder Fehlern.** Auch der Fehlertext der Bibliothek
   wird **nicht** durchgereicht — er kann Bruchstücke des Inhalts enthalten.
6. **Eingabegrenzen.** 512 KiB Rohinhalt (in Bytes, nicht Zeichen), höchstens
   200 `VEVENT`, 1000 Zeichen je Textfeld. Die Größenprüfung greift **vor** dem
   Parsen.
7. **Kontrollierte Ablehnung.** Jede ungültige Eingabe — auch `null`, Zahlen
   oder Objekte statt Text — ergibt eine Ablehnung mit maschinenlesbarem Grund,
   nie eine Ausnahme.
8. **Steuerzeichen werden entfernt**, damit ein fremder Titel keine Logzeile
   fälschen kann.
9. **Das Mandat kommt ausschließlich vom Aufrufer.** Auch eine Einladung, die
   eine fremde Mandatskennung in Titel, `ORGANIZER` und einem eigenen
   `X-HELMUT-MANDAT`-Feld unterbringt, ändert daran nichts — getestet.

**Nicht angefasst:** keine Migration, kein Secret, keine Production-Variable,
keine neue Route, keine Microsoft-/Google-Anmeldung, kein E-Mail-Empfang, keine
Änderung an Quellen, Crons, Budgets, Sperren, Berlin, Brandenburg, M8 oder
realen Testmandaten.

**Die Komponente ist von keinem aktiven Pfad erreichbar** — kein `require` aus
`server.js`, `client.js`, `api/index.js` oder irgendeiner Datei in
`lib/helmut/`. Auch das ist eine Zusicherung der Testsuite, kein Versprechen.

## 8 · Empfehlung für die spätere Empfangsarchitektur

**Eine zufällige, widerrufbare Terminadresse pro Mandat.** Noch nichts davon ist
gebaut — hier steht nur die Empfehlung:

- Form `termin-<zufall>@<domain>`, mindestens 128 Bit Zufall, **nicht** aus Name,
  E-Mail oder Mandats-ID ableitbar. Wer die Adresse errät, schreibt sonst in
  einen fremden Kalender.
- **Widerrufbar und ersetzbar**, ohne dass das Mandat selbst berührt wird.
  Mehrere gleichzeitig gültige Adressen je Mandat erlauben einen Wechsel ohne
  Ausfall.
- **Die Adresse ist der einzige Träger der Mandatszuordnung.** Der Absender ist
  es ausdrücklich **nicht** — Absender sind fälschbar. Genau deshalb nimmt die
  Komponente das Mandat als Parameter entgegen und leitet es nie ab.
- Eine Adresse, die zu keinem Mandat auflöst, wird **verworfen**, nicht geraten.
- Nur `text/calendar`-Anhänge werden gelesen; alle anderen Anhänge werden
  verworfen, ohne sie zu öffnen.

Offen und bewusst nicht entschieden: Empfangsweg (eingehender Webhook eines
Maildienstes vs. eigenes Postfach), Ablage, Rückmeldung an den Organisator
(`METHOD:REPLY`), DSGVO-Bewertung der Termininhalte, Aufbewahrungsfrist.

## 9 · Empfehlung für den nächsten Sprint

**Zuerst die Rechtsfrage, dann Empfang, dann Ablage — in dieser Reihenfolge.**

Ein Kalendertermin eines Abgeordneten ist eine besonders heikle Datenkategorie:
er verrät Gesprächspartner, Orte und Zeiten. Bevor auch nur eine Adresse
existiert, gehört geklärt, was gespeichert werden darf und wie lange. Das ist
kein Technikthema und blockiert sonst später den fertigen Bau.

Danach, technisch:

1. **Empfangsweg entscheiden** (Webhook vs. Postfach) und die Adressvergabe aus
   §8 bauen — ohne Ablage, nur bis zum aufgelösten Mandat.
2. **Ablage und Migration** für den Vertrag aus §3, mit `assertTenant` und
   explizitem `user_id`-Filter wie überall sonst.
3. **Serien auflösen** — erst dann, denn erst dann wird die Frage „was steht
   heute an?" für Serientermine überhaupt beantwortbar.

**Nicht empfohlen:** die Komponente jetzt schon an einen Production-Pfad zu
hängen. Ohne Empfang und Ablage gäbe es nichts zu zeigen, aber bereits eine
Angriffsfläche.

## 10 · Sprintzustand

**Erfolgreich abgeschlossen** — als *Machbarkeitsnachweis*, nicht als Funktion.

Die Frage des Sprints ist beantwortet: **ja**, Helmut kann standardisierte
Kalendereinladungen aus Outlook, Google und internen Systemen zuverlässig
verstehen. Alle Abnahmekriterien sind erfüllt, alle neuen Tests grün, alle
bestehenden Tests unverändert, kein aktiver Pfad berührt, die Grenzen bei Serien
und Ausnahmen sind oben benannt statt kaschiert.

**Was ausdrücklich NICHT erledigt ist:** es gibt keine Terminfunktion. Kein
Empfang, keine Adresse, keine Ablage, keine Oberfläche. Wer aus diesem Sprint
liest, Helmut könne jetzt Termine übernehmen, liest ihn falsch.
