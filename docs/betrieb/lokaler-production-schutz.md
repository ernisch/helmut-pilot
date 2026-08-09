# Lokaler Production-Schutz

**Stand:** 2026-08-08 · OP-30, Korrektur- und Abnahmesprint
**Code:** [`scripts/lokaler-netzschutz.js`](../../scripts/lokaler-netzschutz.js) · [`scripts/lokal.js`](../../scripts/lokal.js)
**Nachweis:** [`scripts/netzschutz-test.js`](../../scripts/netzschutz-test.js) — 76 PASS / 0 FAIL

---

## 1 · Der Vorfall

Am 2026-08-08 ging beim ersten Testaufruf von `scripts/gate-shadow-auswertung.js` eine
**lesende** REST-Abfrage gegen die **Production**-Datenbank (`public.gate_shadow_events`,
`select=*`, 1 000 Zeilen geliefert). Kein Schreibvorgang, keine Schemaänderung, keine
Migration, kein Flag, kein KI- oder Google-Aufruf.

## 2 · Die Ursache — nicht das Skript, sondern eine Lücke im Schutz

Vier Fragen, vier belegte Antworten:

| Frage | Antwort |
|---|---|
| **Welcher Befehl?** | `node scripts/gate-shadow-auswertung.js` — ein **Direktaufruf**, nicht über den Test-Runner |
| **Welche Konfiguration?** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, in der Sitzungsumgebung vorhanden; das Skript nutzte sie, sobald es sie vorfand |
| **Warum griff der Schutz nicht?** | Der Netz-Guard in `run-offline-tests.js` installiert sich **ausschließlich** als `--require`-Preload mit `NO_NETWORK_TESTS=1`. Beides setzt nur der Runner selbst, in seinem eigenen `spawnSync`. Ein direkter `node scripts/<x>.js` hatte **überhaupt keinen** Schutz. |
| **Welche Befehle noch?** | Alle. Der Runner sammelt nur `scripts/*-test.js` ein — **90 Skripte** in `scripts/` sind das nicht, rund **25 davon sind netzfähig**. |

Gemessen (ohne echten Zugriff, gegen `beispiel.invalid`): über den Runner-Preload greift der
Guard; beim Direktaufruf lief der Versuch bis zur Namensauflösung durch.

## 3 · Der Schutz

**Zwei unabhängige Schichten.** Eine allein wird irgendwann übersehen.

### Schicht 1 — Umgebungsprüfung (vor jedem Netzzugriff, fail closed, Exit 3)

Bricht ab, sobald **eine** dieser Bedingungen zutrifft:

1. eine Datenbankadresse ist nicht eindeutig lokal
2. eine bekannte Production-Kennung liegt in der Umgebung
3. eine lokale Adresse wird durch eine nicht-lokale überschrieben (Widerspruch)
4. notwendige Angaben fehlen oder sind ungültig
5. `HELMUT_SOURCE_MODE` ist nicht **exakt** `off`
6. ein externer KI- oder Quellenanbieter wäre erreichbar

**Es wird nie ein Wert ausgegeben** — nur der Name der Variablen.

### Schicht 2 — Laufzeitsperre (immer aktiv)

`http`/`https` (`request`, `get`), `fetch`, `net.connect`/`createConnection`, `tls.connect`
werden umschlossen. Jede Verbindung zu einem nicht-lokalen Ziel wird hart abgewiesen. Die
rohen Sockets sind wichtig: **jede Datenbankbibliothek ginge sonst am Schutz vorbei.**

### Vererbung

`NODE_OPTIONS` trägt den Preload an **jeden** Unterprozess weiter — belegt bis in die zweite
Ebene (Enkelprozess). Ein Schutz, der beim ersten `spawn` endet, ist keiner.

### Was als lokal gilt

`localhost`, das gesamte `127.0.0.0/8` **mit gültigen Oktetten** (`127.0.0.256` ist keine
Adresse), IPv6-Loopback in allen Schreibweisen, `host.docker.internal`, Unix-Socket-Pfade.
Alles andere ist fremd — auch `10.x`, `192.168.x` und `169.254.169.254`.

## 4 · Der Starter

```sh
node scripts/lokal.js scripts/irgendein-skript.js
node scripts/lokal.js -- node -e '…'
```

Entfernt die Zugangsdaten **aus der Umgebung des Kindprozesses** (nie aus einer Datei, nie
dauerhaft), erzwingt `HELMUT_SOURCE_MODE=off` und lädt den Schutz als Preload.

Der Grund für den Starter ist der Vorfall selbst: ein Schutz, der vor jedem Aufruf ein langes
`env -u …` von Hand verlangt, wird irgendwann vergessen — und genau das Vergessen war die
Ursache.

## 5 · Die eine Ausnahme — und warum sie kein Loch ist

Drei Suiten bauen **absichtlich** eine Production-aussehende Umgebung auf, um die
**Verweigerungslogik der Werkzeuge** zu beweisen: `restore-drill-test.js` (Restore lehnt
Production als Ziel ab), `backup-export-test.js`, `understanding-recovery-test.js`.

Mein Umgebungsriegel beendete diese Prozesse mit Exit 3, **bevor** das Werkzeug seine eigene
Verweigerung mit Exit 2 zeigen konnte — der Schutz hätte ausgerechnet die Nachweise zerstört,
die dieselbe Gefahr abdecken.

Deshalb: `HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG=ja` überspringt **nur die Umgebungsprüfung**. Die
**Laufzeitsperre bleibt vollständig aktiv** — es kann weiterhin nichts nach draußen. Die
Ausnahme greift **nur** bei exakt `ja`; `1`, `true`, `vielleicht` aktivieren sie nicht.
Der Runner setzt sie ausschließlich für die drei namentlich gelisteten Suiten
(`WERKZEUG_VERWEIGERUNG` in `run-offline-tests.js`).

## 6 · Production bleibt unberührt

Der Schutz liegt in `scripts/` und wird von `lib/`, `server.js` und `api/` **nie** geladen —
nachgeprüft, kein einziger Verweis. Er kann den späteren legitimen Production-Betrieb
deshalb nicht unbrauchbar machen: die lokale Sicherheitsregel ist vom Laufzeitverhalten
sauber getrennt.

Echte Production-Werkzeuge (`op25-production-nachweis.js`, `backup-export.js`, …) laden diese
Datei nicht und verlangen ihre eigene ausdrückliche Zusage. Der Schutz sperrt nicht den
Betrieb, sondern das **Versehen**.

## 7 · Nachweis

`scripts/netzschutz-test.js` — **76 PASS / 0 FAIL**, mit echten Kindprozessen, über alle
zwölf geforderten Fälle: localhost · IPv4-Loopback · IPv6-Loopback · Testcontainer · externe
Datenbankadressen · Production-Kennungen · leere und ungültige Werte · widersprüchliche
Variablen · geerbte Shell-Variablen · Unterprozesse und Test-Runner · Lese- **und**
Schreibzugriffe · Migrationen, Simulationen und Browser-Tests.

Kein einziger echter Netzzugriff: alle nicht-lokalen Ziele sind `.invalid`-Namen (RFC 2606),
und der Schutz greift ohnehin vor der Namensauflösung.

**Der Weg des Vorfalls endet jetzt im Abbruch** — eigens geprüft (14.x/13.2).

**Grenze, ausdrücklich (Abschlussreview PR #233, 2026-08-08):** diese Datei wird von
`run-offline-tests.js`, `lokal.js` und der eigenen Suite geladen — von **keinem** der übrigen
netzfähigen Skripte selbst. Ein Direktaufruf ist also nur dann geschützt, wenn er über
`scripts/lokal.js` läuft (§7a). Der Anlassfall `gate-shadow-auswertung.js` hat inzwischen
zusätzlich ein **eigenes** Zugriffsgatter (`HELMUT_GATE_AUSWERTUNG_ZUGRIFF`). Die
Laufzeitsperre erfasst `http`/`https`/`fetch`/`net.connect`/`net.createConnection`/`tls.connect`,
**nicht** `net.Socket.prototype.connect`, nicht `dns` und keine Kindprozesse, die keine
Node-Prozesse sind — dort trägt allein die Umgebungsprüfung.

## 7a · Folge für den Pflicht-Testlauf (nachgetragen 2026-08-08, Abschlussreview PR #233)

`CLAUDE.md` §6 nennt als kanonischen Lauf `node scripts/run-offline-tests.js`. Dieser Befehl
bricht seit dem Schutz **mit Exit 3 ab**, sobald Production-Zugangsdaten in der Umgebung
liegen — also in **jeder** Claude-Code-Cloud-Sitzung, in der die Secrets über die
Environment-Einstellungen bereitstehen (`CLAUDE.md` §4.9). Das ist **richtig und
beabsichtigt**: genau dieses Vorfinden war die Ursache des Vorfalls. Der Ersatzweg ist
einzeilig und muss bekannt sein:

```
node scripts/lokal.js scripts/run-offline-tests.js
```

Der Starter entfernt die Zugangsdaten **aus der Umgebung des Kindprozesses** (nie dauerhaft,
nie aus einer Datei), setzt `HELMUT_SOURCE_MODE=off` und lädt den Schutz als Preload. Der
Abschlussreview zu PR #233 hat den vollständigen Offline-Lauf und alle Datenbanknachweise so
ausgeführt. Dasselbe gilt für jeden Direktaufruf eines Skripts aus `scripts/`.

## 8 · Nebenbefund: die Offline-Suite war nie wirklich offline

Mit gesetzten Production-Zugangsdaten scheiterten **20** Suiten, ohne sie **5** — der
Unterschied waren ausschließlich Netz-Guard-Treffer. Im CI sind die Variablen nicht gesetzt;
in einer Cloud-Sitzung schon. Seit diesem Sprint erzwingt `scripts/lokal.js` den sauberen
Zustand, statt ihn vorauszusetzen.

## 9 · Rollback

Der Schutz ist rein additiv und beeinflusst kein Production-Verhalten. Rückweg, falls er
lokale Arbeit behindert:

- einzelner Lauf ohne Starter: `env -u SUPABASE_URL … HELMUT_SOURCE_MODE=off node <skript>`
- Preload abschalten: `NODE_OPTIONS` leeren
- vollständig entfernen: `scripts/lokaler-netzschutz.js`, `scripts/lokal.js`,
  `scripts/netzschutz-test.js` löschen und den `require`-Aufruf in `run-offline-tests.js`
  zurücknehmen (eine Zeile). Der alte Runner-Guard bleibt dabei unverändert bestehen.
