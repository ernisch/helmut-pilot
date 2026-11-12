# Helmut-Systemmails — Inhalte, Gestaltung, Nachweis

**Stand:** 2026-11-12 · **Zustand:** umgesetzt, lokal nachgewiesen, **in Production nicht
aktiviert** (es gibt weiterhin keinen scharfgeschalteten Versand).

**Zweck dieser Datei:** die eine kanonische Stelle für die Frage *„Welche Mails schickt Helmut,
was steht drin, wie sehen sie aus und wie weist man das nach?"*

Nicht hier, sondern dort:

| Thema | Kanonische Quelle |
|---|---|
| Lokales Testpostfach starten und benutzen | [`lokale-mailtests-mailpit.md`](lokale-mailtests-mailpit.md) |
| Vorhandenes Tophoster-Postfach, SMTP-Einrichtung und Test | [`mailversand-tophoster.md`](mailversand-tophoster.md) |
| Alternativer Versand über Resend, Aktivierung, Domain, Schlüssel | [`mailversand-resend.md`](mailversand-resend.md) |
| Umgebungsvariablen | [`env-inventar.md`](env-inventar.md) |

---

## 1 · Welche Systemmails Helmut versendet

Genau **zwei**. Es gibt keine Willkommensmail, keinen Newsletter, keine Benachrichtigungen.

| Mail | Betreff | Wann | Ausgelöst von |
|---|---|---|---|
| **Einladung** | `Ihre Einladung zu Helmut` | Konto ohne Passwort bekommt einen Zugangslink | Admin legt ein Konto an · Admin klickt „Zugangslink erstellen" · „Passwort vergessen" für ein noch nicht aktiviertes Konto |
| **Passwort zurücksetzen** | `Neues Passwort für Helmut festlegen` | Konto **mit** Passwort fordert einen neuen Link an | Admin klickt „Zugangslink erstellen" · „Passwort vergessen" · eingeloggtes „Passwort ändern" |

Welche der beiden Mails es wird, entscheidet **ausschließlich** `user.passwordHash` — nicht
der Auslöser. Das ist unverändert.

## 2 · Wo die Inhalte gepflegt werden

| Was | Datei |
|---|---|
| **Wortlaut** (Betreff, Absätze, Schaltflächenbeschriftung, Hinweise, Anrede) | `lib/helmut/invite-mail.js` |
| **Gestaltung** (HTML-Gerüst, Farben, Abstände, Maskierung, Linkprüfung) | `lib/helmut/mail-layout.js` |
| **Versandweg** (Transportauswahl, Sperren, Zeitlimits) | `lib/helmut/mail-transport.js` |

HTML- und Textfassung entstehen in `mail-layout.js` aus **derselben** Beschreibung. Sie können
deshalb nicht inhaltlich auseinanderlaufen — wer einen Absatz ändert, ändert beide Fassungen.

**Eine Änderung am Wortlaut braucht keine Layoutänderung.** Ein neuer Absatz ist ein neuer
Eintrag im Feld `absaetze`, mehr nicht.

## 3 · Gestaltungsregeln (bewusst eng)

- Dunkler Helmut-Hintergrund (`#070b16`), ruhige Karte (`#0c1322`), Inhaltsspalte **max. 600 px**.
- **Tabellenlayout mit direkten `style`-Attributen.** Abstände auf kleinen Schirmen sind eine
  zusätzliche Verbesserung; auch ohne Style-Block bleiben alle Inhalte lesbar.
- **Helmut-Schriften mit lokalen Ersatzschriften:** Spectral → Georgia/Times für Wortmarke
  und Überschrift; Hanken Grotesk → Systemschrift/Arial für Text. Keine externen Font-Abrufe.
  Eine pixelgleiche Schrift in allen Mailprogrammen ist damit nicht zugesichert.
- **Keine Bilder, Grafiken, Zählpixel, Animationen, Social-Links oder versteckten Vorschautexte.**
  Die Wortmarke ist echter Text; es wird kein Ersatzlogo erfunden.
- Genau **zwei** Linkziele: Aktionslink und Impressum.
- Markenfarben aus `verwaltung/einfach/styles.css`, deckende Hex-Werte für Mailprogramme.
  Alle fünf Textkombinationen erfüllen **WCAG AAA** (≥ 7:1); die Suite rechnet jeweils gegen
  den tatsächlichen Hintergrund nach: Fließtext `#eaeef6`, Nebentext `#aeb8c9`, Links und
  Schaltfläche `#7fa8e0`, Schaltflächentext `#0a0f1c`, Fußzeile `#9ca8bc`.
- **Durchgehend Sie-Ansprache** in beiden Mails und auf den zugehörigen Zugangsseiten.
  Einladung: „Willkommen bei Helmut.“ mit „Passwort setzen“. Passwort-Hilfe: „Ein neues
  Passwort.“ mit „Neues Passwort festlegen“. Kurze Erklärung des tatsächlichen App-Ablaufs.
- Der **vollständige Ziel-Link** steht zusätzlich als sichtbarer Rückfallweg unter der
  Schaltfläche — in **beiden** Fassungen.

## 4 · Personalisierung — und was bewusst NICHT drinsteht

Helmut hat **kein getrenntes Vornamensfeld**: `accounts.createUser` speichert ein einziges
`name`-Feld und fällt, wenn es leer ist, auf die **E-Mail-Adresse** zurück. Der Vorname wird
deshalb hergeleitet — und nur benutzt, wenn dabei etwas Brauchbares herauskommt:

| Namensfeld | Anrede | warum |
|---|---|---|
| `Eva Eingeladen` | `Guten Tag Eva,` | Normalfall |
| `Dr. h.c. Maximiliane-Charlotte von Sonnenberg` | `Guten Tag Maximiliane-Charlotte,` | Titel und Abkürzungen werden übersprungen |
| `Müller, Eva` | `Guten Tag Eva,` | Sortierform aus Mandats-/Ausschusslisten — sonst grüßte Helmut mit dem **Nach**namen |
| `Eva Müller, MdB` | `Guten Tag Eva,` | hinter dem Komma steht nur ein Titel, also greift der Teil davor |
| `Jean-Luc` · `Renée` · `O'Brien` · `Ayşe` | wie geschrieben | Bindestrich, Diakritika, Apostroph, nicht-lateinische Schrift sind zulässig |
| *(leer)* · `kontakt@example.org` · `123` · `---` · Vorname > 64 Zeichen | `Guten Tag,` | kein brauchbarer Vorname |
| `http://example.org` · `www.example.org` | `Guten Tag,` | Mailprogramme **verlinken** so etwas automatisch — ein Anzeigename wäre damit ein Klickziel in einer Mail, die von Helmut zu kommen scheint |

Ein Vorname besteht danach aus einem Buchstaben, gefolgt von Buchstaben, diakritischen
Zeichen, Bindestrichen und Apostrophen — sonst grüßt Helmut neutral. Diese Prüfung ist eine
**zweite, unabhängige** Schicht; die Maskierung (§5) bleibt die eigentliche Schutzmaßnahme.

**Es wird nichts erfunden.** Keine internen Kennungen, keine Mandanten-ID, keine Rolle, kein
Token außerhalb des Links.

**Die Einmaligkeit steht ausdrücklich in der Mail** — und das ist belegt, nicht behauptet:
`accounts.setPasswordWithToken` setzt `usedAt`, jeder zweite Versuch endet mit **410**.
Anders als die Gültigkeitsdauer hängt diese Aussage an **keiner** Umgebungsvariablen und ist
deshalb dauerhaft korrekt (abgedeckt von `mailpit-smoke` und `reset-timing-seitenkanal`).

**Keine Gültigkeitsdauer im Text — das ist eine Korrektur, kein Weglassen.** Die früheren
Fassungen behaupteten „7 Tage gültig" bzw. „1 Stunde gültig". Beides sind nur die *Defaults*
von `HELMUT_INVITE_TOKEN_TTL_MS` / `HELMUT_RESET_TOKEN_TTL_MS` (`lib/helmut/accounts.js`) —
wer eine der beiden Variablen setzt, bekommt eine Mail, die den Empfänger nachweislich falsch
informiert. Eine Zahl, die nicht dauerhaft korrekt gehalten wird, gehört nach Belegpflicht und
„kein falsches Grün" nicht in die Mail. Der Hinweis nennt die Befristung deshalb ohne Zahl:
*„Der Link ist nur für dich bestimmt, zeitlich begrenzt und kann nur einmal verwendet
werden."* — die Befristung ohne Zahl, die Einmaligkeit mit klarer Aussage.

## 5 · Sicherheit der HTML-Fassung

| Schutz | Umsetzung |
|---|---|
| **Maskierung** | Jeder dynamische Wert (Name, Link, Absender) geht durch `escapeHtml` — den **einen** vorhandenen Maskierer des Repos (`lib/helmut/template.js`). Es gibt in `mail-layout.js` keinen Pfad, auf dem ein Wert unmaskiert ins HTML gelangt |
| **Linkprüfung** | Zwei unabhängige Wachen: die Zeichenkette muss **buchstäblich** mit `http://` oder `https://` beginnen, **und** der geparste `protocol` muss `http:`/`https:` sein. `javascript:`, `data:`, `vbscript:`, `mailto:`, protokollrelative und leerraumhaltige Ziele fallen durch — an der Prüfung, nicht an einer Musterliste. Verlinkt wird immer **exakt der geprüfte** String, nie der Rohwert |
| **Fail closed** | Ist der Link unsicher, entfallen **Schaltfläche und Verlinkung**; die Adresse erscheint nur noch als maskierter Text. Relevant, weil die Basis-URL im lokalen Betrieb aus der `Host`-Kopfzeile stammt |
| **Kopfzeilen** | Unverändert: CR/LF in Absender, Empfänger oder Betreff sperren den Versand. Der HTML-Teil ist **Nutzlast**, keine Kopfzeile — Umbrüche darin sind zulässig und blockieren nichts |
| **Keine Protokollierung** | Unverändert: kein Empfänger, kein Text, kein Token, kein Link in irgendeinem Log |

Der **Schutz gegen Nutzererkennung** aus dem Timing-Sprint ist unberührt: der anonyme
`request-reset`-Zweig ruft dieselbe zentrale Versandlogik auf, nur der Nachrichteninhalt hat
sich geändert.

## 6 · Wie HTML und Textfassung getestet werden

| Test | Befehl | Braucht Mailpit? |
|---|---|---|
| **Vorlagen** (Wortlaut, Anrede, Maskierung, Layoutregeln, beide Transporte) | `npm run test:mail-vorlagen` | nein |
| **Mutationsprobe** (belegt, dass die Prüfungen echte Fehler fangen) | `npm run test:mail-vorlagen-mutation` | nein |
| Mailpit-Transport (offline, gegen ein Stub-Mailpit) | `npm run test:mailpit` | nein |
| Resend-Transport (offline, ruft die echte API nie auf) | `npm run test:resend` | nein |
| Timing-Schutz des anonymen Resets | `npm run test:reset-timing` | nein |
| **Echter Ende-zu-Ende-Lauf** | `npm run test:mailpit-smoke` | **ja** |
| **Visueller Nachweis** (die sechs Sprintfälle) | `npm run mail:vorschau` | **ja** |
| Kanonischer Gesamtlauf | `node scripts/run-offline-tests.js` | nein |

**Feldnamen der beiden Transporte für mehrteilige Nachrichten** (sie heißen verschieden, das
ist kein Versehen): Mailpit `{"Text": …, "HTML": …}` — gegen v1.30.6 geprüft **und** gegen ein
laufendes Mailpit belegt. Resend `{"text": …, "html": …}` — Anbietervertrag, offline nicht
gegenprüfbar, weil kein Test je die echte Resend-API aufruft.

Ohne HTML-Teil steht der Schlüssel **gar nicht erst** im Rumpf: das Verhalten ist dann
byte-identisch zu der Fassung vor dieser Arbeit.

## 7 · Lokalen Mailpit-Nachweis ausführen

```
# Terminal 1
mailpit

# Terminal 2
export HELMUT_MAIL_TRANSPORT=mailpit
export HELMUT_MAIL_FROM="Helmut <noreply@helmut.test>"
npm run mail:vorschau
```

Das Skript erzeugt die sechs Sprintfälle. Sie sind bewusst **nicht** symmetrisch verteilt —
jede Ausprägung wird einmal geprüft, nicht jede Kombination:

| # | Mail | Namensfeld |
|---|---|---|
| 1 | Einladung | mit Vorname |
| 2 | Einladung | ohne Vorname (leer) |
| 3 | Reset | mit Vorname |
| 4 | Reset | ohne Vorname (leer) |
| 5 | Einladung | sehr langer Name |
| 6 | Reset | Umlaute und Sonderzeichen |

Sie gehen über die echte zentrale Versandlogik an Mailpit; jede Nachricht wird danach
**zurückgelesen** und in beiden Fassungen geprüft. Die HTML- und Textfassungen landen zusätzlich in `.helmut-mailvorschau/`
(gitignoriert), damit man sie direkt im Browser ansehen oder als Screenshot sichern kann.

Anschauen: <http://localhost:8025> → Reiter **HTML** und **Text** derselben Nachricht.
Mailpits eingebauter Reiter **HTML Check** bewertet die Mailprogramm-Kompatibilität.

**Grenzen, die das Skript einhält:** Es verlässt keine Nachricht den lokalen Rechner
(Loopback-Zwang im Transport). Ausschließlich reservierte Adressen (RFC 2606). Es wird kein
Konto angelegt, kein Token erzeugt, kein Datenspeicher angefasst — die Links sind sichtbar
gekennzeichnete Vorschau-Platzhalter. Es werden nur die **eigenen** Nachrichten des Laufs
wieder gelöscht.

## 8 · Was für den echten Nutzerbetrieb noch fehlt

**Versand weiterhin deaktiviert.** Aktuell wird das vorhandene Tophoster-Postfach mit SMTP
vorbereitet. Verbindungsdaten, sichere Konfiguration, Nachweise und Aktivierung stehen unter
[Tophoster-SMTP](mailversand-tophoster.md). Das Passwort und der echte Posteingangstest fehlen.
Resend bleibt als bereits vorbereitete Alternative erhalten; dessen Domainverifizierung und
API-Schlüssel sind für SMTP nicht erforderlich. Historische Resend-Anforderungen bleiben in
[der Resend-Anleitung](mailversand-resend.md) erhalten.

Bis zum bestätigten Versand bleibt der Kopierlink im Admin der Rückfallweg.

## 9 · Aktuelle Gestaltungsvorschau und Freigabestand (12.11.2026)

[Private Mailvorschau und Nachweise](../ui/systemmails-20261112/README.md).
Der Betreiber hat `Helmut <hallo@mithelmut.de>` als Absender gewählt; Antworten gehen ebenfalls
an das vorhandene Hauptpostfach `hallo@mithelmut.de`. Persönliche Kommunikation und automatische
Einladungen verwenden dieselbe Adresse. Ein zusätzliches Postfach ist nicht nötig, wohl aber
eine beim Versanddienst verifizierte Domain.
Der Versand ist dadurch noch nicht konfiguriert oder freigeschaltet.
