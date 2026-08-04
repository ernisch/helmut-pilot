# E-Mail-Versand über Resend — Einrichtung und kontrollierte Aktivierung

**Stand:** 2026-08-01 · **Zustand:** **vorbereitet, in Production NICHT aktiviert.**

> **Das Wichtigste zuerst:** Nach diesem Sprint versendet Helmut **weiterhin keine echte
> E-Mail**. Der Resend-Transport ist gebaut und offline bewiesen, aber er ist ausgeschaltet:
> Solange `HELMUT_MAIL_TRANSPORT` in Vercel nicht auf `resend` steht **und** kein gültiger
> API-Schlüssel in der Umgebung liegt, passiert exakt das, was vorher passierte —
> `mail.sent:false` mit Grund `mail-versand-nicht-konfiguriert`, Zustellweg ist der
> Kopierlink im Admin. Es wurde **kein** Resend-Konto eingerichtet, **keine** Domain
> verifiziert, **kein** DNS-Eintrag gesetzt, **keine** Vercel-Variable verändert.

**Kanonisch für den lokalen Testweg:** [`lokale-mailtests-mailpit.md`](lokale-mailtests-mailpit.md).
Diese Datei beschreibt ausschließlich den **echten** Versand.

---

## 1 · Warum Resend, und warum ohne Paket

| Frage | Entscheidung |
|---|---|
| **Anbieter** | Resend. Der kostenlose Tarif deckt den Pilotbedarf (siehe §8), die Einrichtung braucht nur DNS-Einträge und einen API-Schlüssel, und die Sende-API ist ein einziger HTTP-Aufruf. |
| **Offizielles Paket `resend` oder direkte API?** | **Direkte API.** Für **einen** POST mit vier Feldern wäre ein zusätzlicher Lieferkettenpfad (Paket + Transitivabhängigkeiten, Aktualisierungspflicht, Angriffsfläche) unverhältnismäßig. <br>*Nachtrag 2026-08-02:* die ursprüngliche Begründung lautete zusätzlich „das Repo ist abhängigkeitsfrei, CI und Vercel-Build brauchen keinen Installationsschritt". **Das gilt seit dem Sprint „Kalender Machbarkeit 1" nicht mehr** — `package.json` führt jetzt genau eine Laufzeitabhängigkeit (`ical.js`, RFC-5545-Parser), und CI installiert per `npm ci`. **Die Entscheidung für Resend ändert sich dadurch nicht:** der Verhältnismäßigkeitsgrund trägt weiterhin. Ein vollständiger Kalenderstandard ist etwas anderes als ein POST mit vier Feldern — siehe [`../kalender-machbarkeit-1.md`](../kalender-machbarkeit-1.md) §2. Node 22 — die vom Repo vorausgesetzte und in CI (`.github/workflows/ci.yml`, `node-version: 22`) gefahrene Version — bringt `fetch` und `AbortController` mit. Dieselbe Begründung wie beim Mailpit-Transport. |
| **SMTP statt HTTP?** | Nein. SMTP bräuchte eine Bibliothek; die HTTP-API tut dasselbe mit Bordmitteln. |

**Sendevertrag:** `POST https://api.resend.com/emails`, Kopfzeile
`Authorization: Bearer <API-Schlüssel>`, Rumpf
`{ from, to: [...], subject, text, html?, reply_to? }`, Antwort `{"id":"…"}`.
`html` steht seit den gestalteten Systemmails daneben (mehrteilige Nachricht) und wird nur
gesetzt, wenn es auch Inhalt gibt — ohne HTML-Teil ist der Rumpf byte-identisch zu vorher.
Die Ziel-URL ist im Code eine **Konstante** und bewusst **nicht** über eine Umgebungsvariable
umstellbar — eine konfigurierbare Ziel-URL wäre ein Ausleitungsweg für den API-Schlüssel.

---

## 2 · Benötigte Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `HELMUT_MAIL_TRANSPORT` | ja (für echten Versand) | **Der eine Schalter.** Nur der exakte Wert `resend` schaltet den echten Versand ein (Groß-/Kleinschreibung und Leerraum egal, **kein** Präfix-Treffer: `resendx` schaltet nicht). Leer = Versand aus. `mailpit` = lokaler Testweg, in Production technisch gesperrt. |
| `HELMUT_RESEND_API_KEY` | ja | **Secret.** Der Resend-API-Schlüssel. Wird ausschließlich aus der Umgebung gelesen, steht in keinem Konfigurations- oder Antwortobjekt und wird nur in die `Authorization`-Kopfzeile geschrieben. Gehört **nie** ins Repo, nie in einen Commit, nie in den Chat. |
| `HELMUT_MAIL_FROM` | ja | Absender, z. B. `Helmut <no-reply@deine-domain.de>`. Bereits vorhandene Konfiguration — es gibt bewusst keine zweite. Der Code-Default ist ein Platzhalter ohne gültige Domain und wird **ehrlich abgelehnt** (`resend-absender-ungueltig`). |
| `HELMUT_MAIL_REPLY_TO` | nein | Antwortadresse, z. B. `Büro <buero@deine-domain.de>`. Fehlt sie, geht die Mail ohne `Reply-To` hinaus. Ungültiger Wert → `resend-antwortadresse-ungueltig`, **kein** Versand. |
| `HELMUT_PUBLIC_URL` | **ja**, sofern nicht `HELMUT_CANONICAL_HOST` auf einem Deployment greift | Basis-URL für den Zugangslink in der Mail. **Sicherheitsrelevant, seit 2026-08-04 erzwungen:** Ließe Helmut die Basis aus dem `Host`-Kopf der Anfrage ableiten, könnte **jeder** sie fälschen und sich per anonymem `request-reset` eine echte Mail an ein **fremdes** Opfer schicken lassen, deren Link auf **seinen** Server zeigt (Token-Exfiltration, empirisch reproduziert). Steht die Basis nur im Request-Header, wird bei aktivem `resend`-Transport **nicht gesendet** — `mail-basis-url-nicht-vertrauenswuerdig`, der Kopierlink im Admin bleibt der Rückfallweg. Auf Vercel greift ersatzweise `HELMUT_CANONICAL_HOST` (Default `helmut-pilot.vercel.app`); der lokale Testtransport `mailpit` ist ausgenommen, weil Loopback niemanden erreichen kann. |

Vollständige Referenz aller Variablen: [`env-inventar.md`](env-inventar.md).

---

## 3 · Sicheres Anlegen eines Resend-API-Schlüssels

1. Bei <https://resend.com> anmelden (kostenloser Tarif genügt, siehe §8).
2. **Zuerst die Domain verifizieren** (§4) — ein Schlüssel ohne verifizierte Domain führt nur
   zu abgelehnten Sendungen.
3. Dashboard → **API Keys** → *Create API Key*:
   - **Permission: `Sending access`** (nicht *Full access*). Helmut liest nichts bei Resend,
     Helmut sendet nur.
   - Wenn Resend eine Einschränkung auf **eine Domain** anbietet: auf die eigene
     Versanddomain begrenzen.
   - Name so wählen, dass er den Einsatzort nennt, z. B. `helmut-production`.
4. Der Schlüssel wird **genau einmal** angezeigt. Sofort in den Passwort-Manager, **nicht**
   in eine Datei im Repo, **nicht** in `.env.example`, **nicht** in eine Chat-Nachricht.
5. In Vercel eintragen: Project → Settings → **Environment Variables** →
   `HELMUT_RESEND_API_KEY`, Environment **Production** (Preview nur, wenn dort bewusst
   echt gesendet werden soll — siehe Warnung in §6).
6. Für lokale Läufe: `.env.local` (gitignored) oder Shell-Variable. In einer
   Claude-Code-Cloud-Sitzung ausschließlich über die Environment-Einstellungen der Sitzung
   (CLAUDE.md §4.9) — niemals über den Chat, niemals über einen Commit.

**Getrennte Schlüssel je Umgebung** verwenden. Ein Schlüssel, der in Production und in
Preview liegt, macht jeden Preview-Fehler zu einem Production-Risiko.

**Rotation:** siehe [`secret-rotation.md`](secret-rotation.md), Abschnitt `HELMUT_RESEND_API_KEY`.

---

## 4 · Eigene Versanddomain einrichten und verifizieren

Ohne verifizierte Domain lehnt Resend den Versand ab (`resend-abgelehnt`, Status 422,
Fehlerart `validation_error`). Über `resend.dev` zu senden ist nur zum Ausprobieren gedacht
und für ein Produkt, das Zugangslinks verschickt, nicht angemessen.

1. Resend-Dashboard → **Domains** → *Add Domain*, eigene Domain eintragen.
   Empfehlung: eine **Subdomain** für Transaktionsmails, z. B. `mail.deine-domain.de`.
   Das hält die Zustellreputation der Hauptdomain unberührt.
2. Resend zeigt die zu setzenden DNS-Einträge an — typischerweise:
   - **SPF** (`TXT`, `v=spf1 include:…`) — erlaubt Resend den Versand für die Domain,
   - **DKIM** (`TXT`, Schlüsselmaterial) — signiert die Nachrichten,
   - **MX** für den Rückkanal (Bounces), sofern Resend das für die Subdomain verlangt.
3. Einträge beim DNS-Anbieter der Domain anlegen. **Bestehende SPF-/DMARC-Einträge nicht
   ersetzen, sondern zusammenführen** — eine Domain darf genau **einen** SPF-Eintrag haben.
4. Im Resend-Dashboard *Verify* auslösen und warten, bis der Status **Verified** ist
   (DNS-Verbreitung kann Stunden dauern).
5. **DMARC** ergänzen, falls noch nicht vorhanden: `_dmarc.deine-domain.de` `TXT`
   `v=DMARC1; p=none; rua=mailto:dmarc@deine-domain.de`. Mit `p=none` beginnen, Berichte
   auswerten, erst danach verschärfen.

**Empfohlene Absenderadresse:**

```
HELMUT_MAIL_FROM=Helmut <no-reply@mail.deine-domain.de>
HELMUT_MAIL_REPLY_TO=Helmut Büro <buero@deine-domain.de>
```

Begründung: Der Absender ist eine **nicht überwachte** Adresse auf der Versand-Subdomain
(Antworten dorthin gehen niemandem verloren, weil `Reply-To` gesetzt ist); die Antwortadresse
ist ein **echtes, gelesenes** Postfach auf der Hauptdomain. Die Fußzeile der Mail nennt den
**Absender** und das Impressum — die Antwortadresse steht dort bewusst **nicht** im Text,
sondern ausschließlich in der Kopfzeile `Reply-To`.

---

## 5 · Vorher lokal prüfen (ohne echten Versand)

Der komplette Ablauf lässt sich **ohne** Resend prüfen — das ist der empfohlene Weg vor
jeder Aktivierung:

| Prüfung | Befehl | Braucht Netz? |
|---|---|---|
| Resend-Transport vollständig (Auswahl, Sperren, Fehlerbilder, Zeitabbruch, Anfrageformat) | `npm run test:resend` | nein |
| Mailvorlagen HTML + Text, Maskierung, beide Transporte | `npm run test:mail-vorlagen` | nein |
| Lokales Testpostfach (Mailpit), unverändert | `npm run test:mailpit` | nein |
| Echter Mailpit-Smoke-Test | `npm run test:mailpit-smoke` | nur lokal |
| Kanonischer Gesamtlauf | `node scripts/run-offline-tests.js` | nein |

`scripts/resend-transport-test.js` ruft die echte Resend-API **nie** auf: jeder Aufruf läuft
gegen ein eingespeistes `fetch`, der Schlüssel ist ein offensichtlicher Platzhalter, und im
kanonischen Lauf blockt der Netz-Guard jede Nicht-Localhost-Verbindung zusätzlich technisch.

**Mehrteilige Nachrichten (seit dem HTML-Mail-Sprint):** Einladung und Reset tragen HTML **und**
reinen Text. Resend erwartet die beiden Teile in den Feldern `html` und `text` — das ist der
Anbietervertrag und offline nicht gegenprüfbar, weil kein Test je die echte API aufruft. Ohne
HTML-Teil steht `html` gar nicht erst im Rumpf; das Verhalten ist dann byte-identisch zu vorher.
Inhalte und Gestaltung: [`systemmails.md`](systemmails.md).

Der lokale Mailpit-Weg bleibt vollständig erhalten und ist von dieser Arbeit unberührt.
**Einzige benannte Grenze:** `HELMUT_MAIL_REPLY_TO` wirkt **nur** im Resend-Transport — der
Mailpit-Rumpf wurde bewusst nicht angefasst, um den bereits bewiesenen lokalen Weg nicht zu
verändern. Wie die Antwortadresse gesetzt wird, prüft stattdessen die Offline-Suite.

---

## 6 · Kontrollierte Aktivierung in Vercel

**Voraussetzungen — alle vier, sonst nicht aktivieren:**

1. Domain im Resend-Dashboard auf **Verified**.
2. API-Schlüssel mit `Sending access` im Passwort-Manager.
3. Die offenen Punkte aus §9 entschieden. Der frühere Blocker „Timing-Seitenkanal im
   anonymen Reset-Zweig" (§9.1) ist seit 2026-08-01 geschlossen; offen bleiben §9.2 (Bounces)
   und §9.3 (AVV, gehört zu OP-02).
4. Eine Freigabeentscheidung des Betreibers — das Setzen dieser Variablen ist laut
   CLAUDE.md §5 ausdrücklich freigabepflichtig.

**Reihenfolge (bewusst: erst Schlüssel, dann Schalter):**

1. Vercel → Project → Settings → Environment Variables → **Production**:
   - `HELMUT_RESEND_API_KEY` = der Schlüssel
   - `HELMUT_MAIL_FROM` = `Helmut <no-reply@mail.deine-domain.de>`
   - `HELMUT_MAIL_REPLY_TO` = `Helmut Büro <buero@deine-domain.de>` (optional)
2. **Erst danach** `HELMUT_MAIL_TRANSPORT` = `resend` setzen.
   Solange dieser Schalter fehlt, ändert der Schlüssel allein **nichts**.
3. Redeploy auslösen (Environment-Variablen wirken erst mit einem neuen Deployment).

> **Preview-Umgebungen:** `HELMUT_MAIL_TRANSPORT=resend` nur für **Production** setzen.
> Eine Preview mit echtem Versand verschickt bei jedem Test echte Mails an echte Adressen und
> verbraucht das Tageslimit.

---

## 7 · Prüfung nach der Aktivierung

1. **Zuerst an die eigene Adresse.** Im Admin ein Konto mit einer Adresse anlegen, die man
   selbst liest — nicht mit der Adresse eines echten Mandanten.
2. Antwort der Route prüfen: `mail.sent` muss `true` sein. Bei `false` steht dort ein
   Grundcode (§10).
3. Postfach prüfen: Absender, Antwortadresse, Betreff („Deine Einladung zu Helmut"),
   Text und der Link. Der Link muss funktionieren und **einmalig** sein.
4. **Spam-Ordner prüfen.** Landet die Mail dort, sind SPF/DKIM/DMARC oder die Reputation der
   Domain die Ursache — nicht der Code.
5. Resend-Dashboard → **Logs**: Die Nachricht muss als *delivered* geführt sein, nicht nur
   als *sent*. Bounces und Beschwerden stehen ebenfalls dort.
6. „Passwort vergessen" mit derselben eigenen Adresse auslösen und Betreff
   („Neues Passwort für Helmut festlegen") sowie Link prüfen. **Erwartet:** die HTTP-Antwort kommt nach
   rund einer halben Sekunde und trägt **nur** den generischen Hinweis — die Mail wird erst
   danach zugestellt, das ist der Timing-Schutz (§9.1) und kein Fehler. Dieselbe Anfrage mit
   einer garantiert **unbekannten** Adresse wiederholen: Statuscode, Rumpf und gefühlte
   Antwortzeit müssen ununterscheidbar sein, und es darf **keine** Mail ankommen.
7. Erst wenn 1–6 sauber sind: echten Nutzenden anlegen.

---

## 8 · Kostenloses Limit

Der kostenlose Resend-Tarif erlaubt **100 E-Mails pro Tag** und **3.000 pro Monat**
(Stand der Anbieterangabe zum Zeitpunkt dieses Dokuments — vor der Aktivierung im Dashboard
gegenprüfen, Tarife ändern sich).

Für den Pilotbetrieb reicht das deutlich: Helmut versendet ausschließlich **Transaktionsmails**
(Einladung, Passwort-Reset) — typischerweise eine Handvoll pro Woche, keine Serienmails,
keine Newsletter. Ein Erreichen des Tageslimits wäre ein Alarmsignal, kein Normalzustand.

Wird das Limit dennoch erreicht, antwortet Resend mit HTTP 429; Helmut meldet dann ehrlich
`sent:false` mit Grund `resend-limit-erreicht`, und der Kopierlink im Admin bleibt der
Zustellweg. **Es geht dabei niemals ein Zugang verloren** — der Link existiert unabhängig
vom Mailversand.

---

## 9 · Vor der Aktivierung noch zu entscheiden (offen)

1. ~~**Timing-Seitenkanal im anonymen Passwort-Reset.**~~ **Wesentlich geschlossen am
   2026-08-01, am 2026-08-04 unabhängig nachgemessen** — **keine offene Vorbedingung**,
   aber mit einer **benannten Restschwäche** (siehe Kasten).

   > **Präzisierung 2026-08-04 (Belegpflicht, „kein falsches Grün"):** Die Formulierung
   > „erledigt" war zu stark. Eine unabhängige Nachmessung zeigt: am **Median** sind beide
   > Zweige ununterscheidbar (101,5 ms gegen 101,4 ms bei 100-ms-Fenster; AUC 0,56), im
   > **Schwanz** der Verteilung aber nicht ganz. Nur der Treffer-Zweig hat Arbeit, die den
   > Freigabezeitpunkt überziehen kann; 3 × 40 Messungen ergaben Treffer-Maxima von
   > **528,0 / 516,3 / 514,4 ms** gegen Nicht-Treffer-Maxima von **509,7 / 504,0 / 503,8 ms**
   > (Fenster 500 ms). Eine Antwort deutlich oberhalb des Gitterpunkts ist damit ein
   > schwaches Existenz-Signal — es betrifft rund 2,5 % der Anfragen und braucht viele
   > Messungen.
   >
   > **Drei Gegenmaßnahmen wurden gebaut und gemessen — alle drei waren schlechter** und
   > sind deshalb **nicht** übernommen worden (Zahlen und Begründung stehen im Code bei
   > `handleAuthRequestReset`):
   >
   > | Variante | AUC (0,5 = ununterscheidbar) | Bewertung |
   > |---|---|---|
   > | **Ist-Zustand** (Arbeit im Wartefenster, festes Gitter) | **0,44–0,56** | bestes gemessenes Ergebnis |
   > | Arbeit nach der Antwort + Rückkehr auf das Gitter | 0,63–0,73 | Zustellung stört die **Folgeanfrage** |
   > | Arbeit im Wartefenster + Rückkehr auf das Gitter | 0,69 | **deterministischer** Fenstersprung 201 ms / 102 ms |
   > | Arbeit nach der Antwort, ohne Gitter | **1,00** | jede einzelne Messung verrät den Zweig |
   >
   > Ursache ist in allen Fällen dieselbe: Node ist einkernig, und die Serialisierung des
   > Auth-Blobs blockiert den Event-Loop, gleich wann sie läuft. Eine vollständige Schließung
   > bräuchte eine **Architekturänderung** (Zustellung außerhalb des Anfrageprozesses) — das
   > ist bewusst nicht Teil eines Härtungssprints. **Wirksame Bremse bleibt das
   > Rate-Limit** (5 Anfragen / 15 min / IP). Beleg: `scripts/resend-mail-haertung-test.js`
   > Abschnitt E (friert die gemessene Lage ein) und `scripts/reset-timing-seitenkanal-test.js`
   > Abschnitt H.

   *Was er war:* Sobald ein Transport konfiguriert ist, wird auch der **nicht eingeloggte**
   Weg (`POST /api/auth/request-reset`) aktiv. Der Treffer-Zweig leistete danach zusätzlich
   Token-Schreiben, Mailversand und Audit-Schreiben **innerhalb** der HTTP-Anfrage, der
   Not-Found-Zweig antwortete direkt nach dem einen Lesezugriff. Das Delta lag in der
   Größenordnung mehrerer hundert Millisekunden — **eine einzige Anfrage** hätte genügt, um
   eine Adresse als registriert zu erkennen.

   *Wie er geschlossen ist:* zwei unabhängige Maßnahmen, keine davon allein (Begründung und
   verworfene Alternativen stehen in `lib/helmut/reset-timing.js`):
   **(1) Entkopplung** — Token, Versand und Audit liegen nicht mehr im Antwortpfad, sondern
   laufen als Hintergrundarbeit derselben Anfrage, die **nach** dem Schreiben der Antwort
   abgewartet wird. Bis zur Antwort leisten beide Zweige exakt dieselbe Arbeit.
   **(2) Antwortgitter** — die Antwort verlässt den Server nur zu `t0 + n·Fenster`
   (`HELMUT_RESET_ANTWORT_MS`, Default 500 ms, hart auf 50…5000 ms geklemmt).
   Der eingeloggte Besitzer-Pfad („Passwort ändern") ist unverändert: wer eine gültige
   Sitzung für genau dieses Konto hat, kennt dessen Existenz bereits.

   *Beleg:* `scripts/reset-timing-seitenkanal-test.js` (Abschnitt H misst beide Zweige über
   viele Durchläufe und weist Verteilung, Median und hohe Perzentile aus) plus
   `scripts/reset-timing-mutationsprobe.js`. **Es geht dabei keine Nachricht verloren** — die
   Entkopplung verschiebt nur, wann geantwortet wird, nicht ob gesendet wird.
2. **Bounces und Beschwerden.** Helmut wertet Resend-Webhooks nicht aus. Eine dauerhaft
   unzustellbare Adresse fällt nur im Resend-Dashboard auf. Für den Pilot vertretbar; vor
   mehreren Mandanten neu bewerten.

   **Bewertet und bewusst nicht gebaut (2026-08-04)** — jetzt als **OP-30** geführt
   ([`../datenmotor-restliste.md`](../datenmotor-restliste.md)). Eine Auswertung bräuchte
   einen öffentlichen Webhook-Endpunkt mit Signaturprüfung, ein neues Production-Geheimnis,
   externe Konfiguration bei Resend **und** eine neue Ablage für den Zustellstatus — also
   genau die Mittel, die ohne getrennte Freigabe nicht eingesetzt werden. **Kein Blocker für
   den Pilotbetrieb:** jeder synchron gemeldete Fehler ist fail closed, wird im Audit als
   `mail:nicht-gesendet:<grund>` belegt, und der Kopierlink bleibt der Zustellweg.
   **Ehrliche Restlücke:** nimmt Resend an und stellt später doch nicht zu, meldet Helmut
   „gesendet" — die einzige Stelle des Mailwegs mit einer ungeprüften Behauptung.
3. **Rechtlicher Rahmen.** Resend ist ein Auftragsverarbeiter (Empfängeradressen sind
   personenbezogene Daten). AVV/Auftragsverarbeitung gehört zu OP-02
   ([`../datenmotor-restliste.md`](../datenmotor-restliste.md)) und ist vor dem ersten
   zahlenden Zweitmandanten zu klären.

---

## 10 · Rückweg: Deaktivierung

**Sofort und vollständig, ohne Deploy von Code:**

1. Vercel → Environment Variables → `HELMUT_MAIL_TRANSPORT` **löschen** (oder leeren).
2. Redeploy.

Danach ist der Zustand byte-identisch zu heute: `mail.sent:false`, Grund
`mail-versand-nicht-konfiguriert`, Kopierlink im Admin. **Der Schlüssel darf dabei stehen
bleiben** — ohne den Schalter wird er nie benutzt. Wer ganz sicher gehen will, entfernt
zusätzlich `HELMUT_RESEND_API_KEY` (dann lautet der Grund `resend-api-schluessel-fehlt`) und
widerruft den Schlüssel im Resend-Dashboard.

Es gibt **keinen** Zustand, in dem eine fehlende oder fehlerhafte Konfiguration zu einem
stillen echten Versand führt.

---

## 11 · Gründe, wenn etwas nicht klappt

Alle Gründe sind **nutzdatenfreie Codes**: sie enthalten nie einen Empfänger, nie einen Text,
nie einen Token, nie den Schlüssel. Externe Resend-Fehler werden bereinigt — es verlassen nur
der HTTP-Status und eine zeichengefilterte Fehlerart den Transport, nie der Antworttext.

| Grund | Ursache | Abhilfe |
|---|---|---|
| `mail-versand-nicht-konfiguriert` | `HELMUT_MAIL_TRANSPORT` fehlt | So gewollt, solange nicht aktiviert. Sonst §6. |
| `mail-transport-unbekannt` | Tippfehler im Transportnamen | Exakt `resend` (oder `mailpit`) setzen |
| `resend-api-schluessel-fehlt` | `HELMUT_RESEND_API_KEY` fehlt oder ist leer | Schlüssel in Vercel eintragen, Redeploy |
| `resend-api-schluessel-ungueltig` | Leerzeichen/Zeilenumbruch im Wert, zu kurz | Wert sauber neu einfügen (kein Zeilenumbruch beim Kopieren) |
| `resend-absender-ungueltig` | `HELMUT_MAIL_FROM` fehlt oder steht auf dem Platzhalter | Gültige Absenderadresse setzen (§4) |
| `resend-antwortadresse-ungueltig` | `HELMUT_MAIL_REPLY_TO` ist keine gültige Adresse | Wert korrigieren oder Variable entfernen |
| `resend-nicht-autorisiert` (401/403) | Schlüssel falsch, widerrufen oder ohne Senderecht | Schlüssel prüfen/neu erzeugen (§3) |
| `resend-abgelehnt` + `status: 422` + `fehlerart: validation_error` | meist: **Domain nicht verifiziert** oder Absender gehört nicht zur verifizierten Domain | §4 abschließen |
| `resend-limit-erreicht` (429) | Tages-/Monatslimit erreicht | §8; Kopierlink nutzen, Ursache klären |
| `resend-nicht-erreichbar` | DNS-, Netz- oder TLS-Fehler | Anbieterstatus prüfen, später erneut |
| `resend-zeitabbruch` | Resend antwortet nicht binnen 10 s | erneut versuchen; Kopierlink bleibt |
| `resend-antwort-fehlerhaft` | Antwort ohne Nachrichtenkennung | fail closed — gilt **nicht** als versendet |
| `resend-kopfzeilen-einschleusung` | Zeilenumbruch in Empfänger/Betreff/Absender | Eingabe prüfen (sollte im Normalbetrieb nie auftreten) |
| `mail-transport-fehlgeleitet` | interner Verwechslungsschutz (Konfiguration passt nicht zum Pfad) | sollte nie auftreten; als Fehler melden |
| `mail-basis-url-nicht-vertrauenswuerdig` | Die Basis-URL des Zugangslinks stammt nur aus dem `Host`-Kopf der Anfrage — der ist fälschbar. **Kein echter Versand** (seit 2026-08-04, siehe §2). | `HELMUT_PUBLIC_URL` setzen und neu deployen. Auf Vercel greift ersatzweise `HELMUT_CANONICAL_HOST`; tritt der Grund dort trotzdem auf, ist beides leer. |

**Interner Nachweis (seit 2026-08-04).** Der anonyme Reset-Weg kann von außen nichts über
den Ausgang verraten — intern muss er es trotzdem. Der Audit-Eintrag
`password.reset-requested` trägt deshalb das Versandergebnis als nutzdatenfreien Code:
`mail:gesendet` · `mail:nicht-gesendet:<grund>` (Codes aus der Tabelle oben) ·
`mail:nicht-erstellt:token-nicht-ausstellbar`. Enthält **nie** Adresse, Token, Link oder
Schlüssel. Vorher stand dort nur „angefordert" — ein von Resend abgelehnter Versand war
intern von einem erfolgreichen nicht unterscheidbar (`CLAUDE.md` §4.4, kein falsches Grün).
Für eine **unbekannte** Adresse entsteht weiterhin **kein** Eintrag: sonst wäre das
Audit-Log selbst der Enumerationskanal für jeden, der es lesen darf.

---

## 12 · Betroffene Dateien

| Datei | Rolle |
|---|---|
| `lib/helmut/mail-transport.js` | zentrale Transportauswahl + beide Transporte |
| `lib/helmut/invite-mail.js` | Wortlaute beider Systemmails + eine gemeinsame Versandstelle |
| `lib/helmut/mail-layout.js` | gemeinsames HTML-/Text-Layout, Maskierung, Linkprüfung ([`systemmails.md`](systemmails.md)) |
| `lib/helmut/redact.js` | kennt `HELMUT_RESEND_API_KEY` als Secret |
| `scripts/resend-transport-test.js` | Offline-Suite für den Resend-Transport (neu) |
| `.env.example` · [`env-inventar.md`](env-inventar.md) · [`secret-rotation.md`](secret-rotation.md) | Konfigurations- und Rotationsdokumentation |

`server.js`, das Konten-/Sitzungsmodell, die Token-Logik und die Oberfläche sind
**nicht** verändert worden.
