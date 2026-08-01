# Lokale E-Mail-Tests mit Mailpit

**Stand:** 2026-08-01 · **Zustand:** lokal einsatzbereit, in Production technisch gesperrt.

**Zweck in einem Satz:** Die bestehenden Einladungs- und Passwort-Reset-Abläufe sollen
sich lokal mit **echten Nachrichten** prüfen lassen, ohne dass jemals eine Mail den
eigenen Rechner verlässt.

**Was dieser Weg ausdrücklich NICHT ist:** kein Production-Versand. Über Anbieter,
Absenderdomain, SPF/DKIM/DMARC, Zustellbarkeit, Bounces, Versandlimits und
Production-Secrets ist hier **nichts** entschieden.

> **Nachtrag 2026-08-01:** Der echte Versand ist inzwischen als **zweiter** Transport
> (`HELMUT_MAIL_TRANSPORT=resend`) vorbereitet, aber **in Production nicht aktiviert**.
> Der hier beschriebene lokale Weg ist davon unberührt und unverändert gültig. Alles zum
> echten Versand steht ausschließlich in [`mailversand-resend.md`](mailversand-resend.md).
> Eine Ausnahme, die man kennen muss: `HELMUT_MAIL_REPLY_TO` wirkt **nur** im
> Resend-Transport — der Mailpit-Rumpf wurde bewusst nicht angefasst.

---

## 1 · In drei Schritten loslegen

**Schritt 1 — Mailpit starten** (eigenes Terminal, läuft im Vordergrund):

```
mailpit
```

Oberfläche danach: <http://localhost:8025>

**Schritt 2 — Umgebungsvariablen setzen** (lokal, z. B. in `.env.local`; Vorlage
steht in `.env.example`):

```
HELMUT_MAIL_TRANSPORT=mailpit
HELMUT_MAILPIT_URL=http://127.0.0.1:8025
HELMUT_MAIL_FROM=Helmut <noreply@helmut.test>
```

`HELMUT_MAILPIT_URL` darf entfallen — ohne den Wert gilt `http://127.0.0.1:8025`.
`HELMUT_MAIL_FROM` ist die **bereits vorhandene** Absenderkonfiguration; es gibt
bewusst keine zweite. Der Code-Default (`Helmut <no-reply@…de>`) ist ein Platzhalter
ohne gültige Domain und wird vom Transport ehrlich abgelehnt — für lokale Läufe
deshalb eine reservierte Testdomain setzen.

**Schritt 3 — Testnachricht auslösen.** Zwei Wege:

| Weg | Befehl | Was passiert |
|---|---|---|
| **Ein Befehl, alles automatisch** | `npm run test:mailpit-smoke` | Legt über den echten Admin-Ablauf ein Testkonto an, prüft Einladung, erneute Einladung, anonymen Reset, unbekannte Adresse, Token-Einmaligkeit, Sitzungsentzug und den Mailpit-Ausfall — und räumt danach nur die **eigenen** Testnachrichten wieder weg |
| **Von Hand in der App** | Helmut lokal starten, als Admin einloggen, unter *Admin → Nutzer* ein Konto **ohne Passwort** anlegen (oder „Zugangslink erstellen") | Die Einladung erscheint innerhalb von Sekunden in <http://localhost:8025> |

Ebenfalls von Hand auslösbar: „Passwort vergessen" auf der Login-Seite
(`POST /api/auth/request-reset`) — mit konfiguriertem Mailpit erzeugt auch der
**anonyme** Weg eine Nachricht.

---

## 2 · Was lokal funktioniert — und was nicht

**Funktioniert:**

- Einladung (Betreff „Dein Zugang zu Helmut steht bereit") und Passwort-Reset
  (Betreff „Passwort zurücksetzen") landen als **echte Nachricht** im lokalen Mailpit.
- Absender, Empfänger, Betreff, Text und der jeweilige Link sind dort sichtbar und
  automatisiert prüfbar.
- Der Link in der Mail ist derselbe wie im Admin-Kopierlink und funktioniert.
- Fällt Mailpit aus, bleibt der Status **ehrlich `sent:false`** und der Kopierlink im
  Admin ist weiterhin der Zustellweg.

**Funktioniert ausdrücklich NICHT (und soll es auch nicht):**

- **Kein Versand an echte Adressen.** Nichts verlässt den lokalen Rechner.
- **Kein Versand in Production/Preview.** Der Transport ist dort technisch gesperrt.
- **Kein HTML-Design.** Die Vorlagen bleiben reiner Text (unverändert).
- **Keine öffentliche Selbstregistrierung**, keine Supabase-Auth-Migration, keine
  Zwei-Faktor-Anmeldung — an alledem ändert dieser Weg nichts.

---

## 3 · Sicherheitsgrenzen (alle fail closed)

| Grenze | Verhalten |
|---|---|
| **Standard AUS** | Ohne `HELMUT_MAIL_TRANSPORT=mailpit` ist alles exakt wie vorher: `sent:false`, Grund `mail-versand-nicht-konfiguriert` |
| **Nur der eine Wert** | Nur `mailpit` (Groß-/Kleinschreibung und Leerraum egal) schaltet ein; jeder andere Wert lässt den Versand aus |
| **Production gesperrt** | `NODE_ENV=production` → `mailpit-in-production-gesperrt`. Die Sperre greift **vor** jeder Zielprüfung |
| **Vercel gesperrt** | Ein nicht leeres `VERCEL` oder `VERCEL_ENV` → `mailpit-in-vercel-gesperrt` |
| **Nur Loopback** | Ziel muss `127.0.0.1`, `localhost` oder `::1` sein. Exakter Hostvergleich — `127.0.0.1.example.org` wird abgelehnt, `0.0.0.0` ebenfalls (das ist kein Loopback) |
| **Keine Zugangsdaten in der URL** | `http://nutzer:geheim@127.0.0.1:8025` → abgelehnt |
| **Nur http/https** | `file:`, `smtp:` usw. → abgelehnt |
| **Keine Weiterleitungen** | Die Anfrage läuft mit `redirect: "error"` — ein Redirect könnte aus dem Loopback herausführen |
| **Kurzer Zeitabbruch** | 3 Sekunden. Ein nicht laufendes Mailpit blockiert keinen Admin-Klick |
| **Kein falsches Grün** | Jeder verweigerte oder fehlgeschlagene Versand liefert `sent:false` mit einem Grundcode. Ein Versand gilt erst als erfolgt, wenn Mailpit mit einer Nachrichtenkennung antwortet |
| **Keine Protokollierung** | Es werden **nie** Empfänger, Nachrichtentexte, Token oder vollständige Links geloggt. Gründe sind nutzdatenfreie Codes |
| **Kopfzeilen-Schutz** | Zeilenumbrüche in Absender, Empfänger oder Betreff → abgelehnt |

**Nebenwirkung, die man kennen muss:** Mit konfiguriertem Mailpit wird der **anonyme**
`request-reset`-Zweig aktiv (bisher erzeugte nur der eingeloggte Besitzer einen Token).
Das ist gewollt — sonst ließe sich der Reset-Weg nicht prüfen. Der bereits im Code
notierte Punkt bleibt offen und ist **kein** Thema dieses lokalen Wegs: bei einem
späteren **echten** Versand muss die Store-Arbeit des Treffer-Zweigs (Token + Audit)
gegen den Not-Found-Zweig angeglichen werden, damit kein Timing-Seitenkanal zur
Nutzer-Enumeration entsteht (`server.js`, `handleAuthRequestReset`).

---

## 4 · Technische Entscheidung: HTTP-API statt SMTP

Mailpit nimmt Nachrichten **auch über HTTP** entgegen: `POST {basis}/api/v1/send`,
JSON hinein, `{"ID":"…"}` heraus. Gegen den Quellcode des Tags **v1.30.6** geprüft
(Routentabelle in `server/server.go`, Vertrag in `server/apiv1/send.go`) — also genau
die Version, die lokal installiert ist.

Daraus folgt: das bereits vorhandene native `fetch` genügt. **Keine SMTP-Bibliothek,
keine neue Paketabhängigkeit** — `package.json` bleibt abhängigkeitsfrei
(`"dependencies": {}`). Docker wird für Mailpit ebenfalls nicht eingeführt; der
direkte Start mit `mailpit` reicht.

Zwei Adressformate, die man beim Lesen des Codes auseinanderhalten muss (das ist
Mailpits Vertrag, kein Versehen):

| Richtung | Format |
|---|---|
| **Senden** (`POST /api/v1/send`) | `{"Email": "…", "Name": "…"}` |
| **Lesen** (`GET /api/v1/message/{id}`) | `{"Address": "…", "Name": "…"}` (Go `net/mail`) |

---

## 5 · Tests

| Test | Befehl | Braucht Mailpit? |
|---|---|---|
| **Offline-Suite** (Transport, Vorlagen, alle Sperren, kompletter HTTP-Ablauf gegen ein Stub-Mailpit) | `npm run test:mailpit` | nein |
| Resend-Transport (offline, ruft die echte API nie auf) | `npm run test:resend` | nein |
| **Echter Smoke-Test** (gegen das laufende Mailpit) | `npm run test:mailpit-smoke` | **ja** |
| Bestehender Invite-/Passwort-Ablauf (unverändert) | `npm run test:invite-flow` | nein |
| Kanonischer Gesamtlauf | `node scripts/run-offline-tests.js` | nein |

Der echte Smoke-Test **gilt nie still als grün**: ist Mailpit nicht erreichbar, endet
er mit Exit-Code 1 und einer Anleitung, statt die Prüfungen zu überspringen.

Er benutzt ausschließlich reservierte Adressen (`example.org`, RFC 2606) mit einer
eindeutigen Laufkennung (`helmut-smoke-<lauf>@example.org`), löscht in Mailpit
**ausschließlich** Nachrichten an genau diese Adressen (`DELETE /api/v1/search?query=to:…`)
und sichert den lokalen Datenspeicher `.helmut-data` vor dem Lauf, um ihn danach
wiederherzustellen.

---

## 6 · Wenn etwas nicht klappt

| Symptom | Ursache | Abhilfe |
|---|---|---|
| `mail.sent:false`, Grund `mail-versand-nicht-konfiguriert` | `HELMUT_MAIL_TRANSPORT` fehlt | Variable setzen und den Serverprozess neu starten |
| Grund `mailpit-absender-ungueltig` | `HELMUT_MAIL_FROM` steht auf dem Platzhalter `Helmut <no-reply@…de>` | Reservierte Testadresse setzen, z. B. `Helmut <noreply@helmut.test>` |
| Grund `mailpit-nicht-erreichbar` | Mailpit läuft nicht oder hört auf einem anderen Port | `mailpit` starten bzw. `HELMUT_MAILPIT_URL` anpassen |
| Grund `mailpit-nur-loopback` | Ziel ist kein Loopback-Host | Auf `127.0.0.1`/`localhost`/`::1` zeigen |
| Grund `mailpit-in-production-gesperrt` / `mailpit-in-vercel-gesperrt` | `NODE_ENV=production` bzw. Vercel-Variablen sind gesetzt | So gewollt — der Transport ist ausschließlich lokal |
| Smoke-Test bricht sofort mit Exit-Code 1 ab | Mailpit nicht erreichbar | `mailpit` starten, dann erneut ausführen |

---

## 7 · Betroffene Dateien

| Datei | Rolle |
|---|---|
| `lib/helmut/mail-transport.js` | der lokale Transport samt aller Sperren (neu) |
| `lib/helmut/invite-mail.js` | Vorlagen (inhaltlich unverändert) + Anbindung des Transports |
| `scripts/mailpit-transport-test.js` | Offline-Suite (neu) |
| `scripts/mailpit-smoke.js` | echter Smoke-Test gegen laufendes Mailpit (neu) |
| `.env.example` · [`env-inventar.md`](env-inventar.md) | Konfigurationsdokumentation |

`server.js`, das Konten-/Sitzungsmodell, die Token-Logik und die Oberfläche sind
**nicht** verändert worden.
