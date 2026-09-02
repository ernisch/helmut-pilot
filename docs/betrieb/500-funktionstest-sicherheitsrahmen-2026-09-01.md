# 500er-Funktionstest — technischer Sicherheitsrahmen (Beleg, 2026-09-01)

**Sprint:** rein vorbereitender Sicherheitssprint für den später **getrennt
freizugebenden** Production-Funktionstest mit 500 aktiven Profilen
(5 real + 495 synthetisch).
**Branch:** `claude/security-sprint-functional-test-wap0q1`, Basis `main` =
`b998e9bc6a0ecca0cd3d43e344f03101c0ede5f0`.

**Nachtrag 2026-09-01 (Doku-Commit, kein Code):** Nach dem Bau dieses Rahmens
wurden **zwei einzeln freigegebene Azure-Messpakete tatsächlich ausgeführt**
(Vorprobe 3 Aufrufe, Stichprobe 21 Aufrufe) und anschließend die Z3b-Belegprüfung
gegen die **korrigierte** Telemetriequelle wiederholt. Alle daraus folgenden
Messwerte, Korrekturen (K1–K6) und verbleibenden Lücken stehen in **§16**; die
Abschnitte §3.1, §4, §11 und §12 sind entsprechend nachgezogen. Der Stand „kein
Modellaufruf" gilt damit **nur noch für den Bausprint selbst**, nicht mehr für
den Gesamtvorgang.

**Dieser Sprint hatte KEINE Production-Wirkung.** Keine Production-Datenänderung,
keine Provisionierung, keine Aktivierung, keine Migration, keine
Cron-/Env-/Secret-/Flag-/Budget-Änderung, kein Merge, kein Deployment. Der
Supabase-Zugriff dieser Sitzung war ausschließlich `SELECT`, der Vercel-Zugriff
ausschließlich lesend. Die beiden Modellaufruf-Pakete liefen **außerhalb** des
Repos, ohne Datenbankzugriff und mit `store: false` (§16.1); jedes hatte eine
eigene, ausdrückliche Betreiberfreigabe.

---

## 1 · Ausgangsstand (rein lesend bestätigt, 2026-09-01)

| Prüfpunkt | Befund |
|---|---|
| Offene Pull Requests | **0** |
| `origin/main` | `b998e9bc6a0ecca0cd3d43e344f03101c0ede5f0` (= der zuletzt bestätigte Kopf, neu ermittelt) |
| Vercel-Production-Deployment | `dpl_DeUTUaw7J7jFtc6xPEffFAcjKrJG` **READY**, target `production`, `githubCommitSha` exakt `b998e9bc…` |
| Migrationen | 35 Einträge, letzte `20260829175749` — **unverändert**, keine neue |
| Mandate | **9** Mandatsprofile: **5 aktiv**, 4 inaktiv, **0** Löschmarken |
| Identitätsprofile | 10 |
| Testkohorte in Production | **0** Zeilen `test-kohorte…` |
| Crons | 13 Einträge, **kein** `18,48 * * * *` |

Damit ist die Grundlinie des späteren Tests belegt: **9 Mandatszeilen, davon
5 aktiv, 0 synthetische.**

## 2 · Beweisstand — die drei Ebenen bleiben strikt getrennt

| Ebene | Stand |
|---|---|
| **Warteschlangen-Aufnahme für 500 Aufträge** | **ERBRACHT** (28.08., isoliertes Testprojekt, Actions-Lauf `33158170030`). In diesem Sprint auftragsgemäß **nicht wiederholt**. |
| **Rechnerische/architektonische Tragfähigkeit** | **vorbereitet — finaler Production-Deckel weiterhin OFFEN.** Seit 01.09. ist die Spanne 1.492–2.416 **gemessen unterfüttert** (Boden 1.496/Tag, §16.4) und **2.416/702 ist ein belegter Vorschlag** — gesetzt oder freigegeben ist er nicht (§4). |
| **Fachlicher Production-Zyklus mit 5 realen + 495 aktiven synthetischen Profilen** | **NICHT BEWIESEN.** Weder durch diesen Sprint noch durch Offline-Tests ersetzbar. |

## 3 · Was gebaut wurde

| Bestandteil | Datei | Zweck |
|---|---|---|
| Azure-Messläufer | `scripts/skalierung-z3b-azure.js` | Vorprobe (3) und Stichprobe (21) als **getrennte** Freigabepakete |
| Messplan (rein lokal) | `scripts/fixtures/z3b-azure-plan.js` | synthetische Prompts, Ziel-, Mengen- und Kostenriegel |
| Berichtsvertrag | `scripts/fixtures/z3b-azure-bericht.js` | fail-closed Prüfung des bereinigten Berichts (Schema `v3`) |
| **Kommunikationsriegel** | `lib/helmut/kommunikationsriegel.js` | der bisher **fehlende** gemeinsame Punkt vor allen sechs Außenkanälen |
| Kohorten-Betriebswerkzeuge | `lib/helmut/testkohorte-betrieb.js` | Plan, Isolation, Aktivierung, Deaktivierung, Rückbauprüfung |
| Betreiber-CLI | `scripts/testkohorte-495.js` | druckt Pläne und das rein lesende Erhebungs-SQL; **führt nichts aus** |
| Sicherheitsrahmen | `lib/helmut/funktionstest-500.js` | Kapazitäts-/Kostenriegel, 12 Abbruchregeln, Startfenster |

Der Kohortengenerator `lib/helmut/test-kohorte-500.js` (495 deterministische
Spezifikationen, Gruppen 20/75/400) bestand bereits und wurde **unverändert**
weiterverwendet.

### 3.1 · Messläufer — wiederhergestellt und geschärft

Der Läufer war auf `main` nicht vorhanden: er entstand in PR #277, der am
01.09. nach Konsolidierung **geschlossen, nicht gemergt** wurde. Wiederhergestellt
wurde der jüngste, gehärtetste Stand aus dem Auditbranch
`codex/z3b-proof-gates-500` (`a705c18`, 29.08.) — seine 64 Vertragsprüfungen
laufen unverändert grün.

Eigenschaften (alle testgesichert): standardmäßig vollständig gesperrt ·
Parallelität 1 · keine Wiederholung · nur synthetische Prompts · keine
Production-Inhalte · **kein** Datenbank- oder Importpfad · `store: false` ·
harter Aufrufdeckel (3 bzw. 21, zusammen höchstens 24) · harter Kostenriegel
(technisch nie über 1 USD) · Abbruch bei Fehler, Drosselung, Zeitüberschreitung,
fehlendem `usage`-Block und unvollständigem Status · Ausgabe nur bereinigter
Messwerte (kein Prompt, keine Antwort, kein Schlüssel, kein Hostname — nur der
volle SHA256-Fingerabdruck) · Modell, Deploymentart, Region, Preise und
Preisdatum müssen ausdrücklich übergeben und validiert werden.

**Neu in diesem Sprint — keine automatische Fortsetzung:** Die Freigabekennung
der Stichprobe lautet
`z3b-azure:stichprobe:21:<lauf>:nach-vorprobe:<vorprobe-lauf>:<vorprobe-fingerabdruck>`.
Der Fingerabdruck ist der SHA256 über die Einzelmessungen des Vorprobeberichts
(`einzelmessungenSha256`, Schema `v4`) — ihn besitzt nur, wer einen echten
Vorprobebericht in der Hand hält. Dazu kommen eine prozessweite Paketsperre
ohne Rücksetzer und ein Verbot des Selbstbezugs (`vorprobeLauf === lauf`).

> **Ehrliche Grenze dieser Kette (adversarialer Review 01.09., bestätigter
> Befund):** Ein früherer Stand dieses Belegs nannte die Kette „strukturell
> unterbrochen". Das war zu grün und ist zurückgenommen. Das Werkzeug führt
> bewusst **kein Gedächtnis über Prozessgrenzen** (es hat keine Datenbank); es
> kann den **Besitz** eines Vorprobeberichts erzwingen, nicht dessen Echtheit
> gegenüber Azure. Ohne den Fingerabdruck genügte eine frei erfundene
> Laufkennung — mit ihm nicht mehr. Die verbleibende Lücke schließt allein die
> getrennte Kostenfreigabe des zweiten Pakets.

**Im Bausprint selbst wurde kein Modellaufruf ausgeführt.** Der Nachweis dafür
ist kein Versprechen, sondern gemessen: `scripts/z3b-azure-freigaberiegel-test.js`
führt 25 unvollständige Konfigurationen gegen einen **zählenden** fetch-Ersatz
und belegt einen Zählerstand von **0**.

**Danach — und nur nach je eigener Betreiberfreigabe — liefen beide Pakete
tatsächlich:** Vorprobe `vorprobe20260901` (3 Aufrufe) und Stichprobe
`stichprobe20260901` (21 Aufrufe). Messwerte, Fingerabdrücke und Randbedingungen:
**§16.1**. Die Kette hat dabei getragen: die Stichprobe wurde erst nach Übergabe
von Laufkennung **und** Vorprobe-Fingerabdruck freigeschaltet. Die oben genannte
ehrliche Grenze bleibt bestehen — erzwungen wird der **Besitz** des
Vorprobeberichts, nicht dessen Echtheit gegenüber Azure.

## 4 · Kapazitäts- und Kostenriegel — Entscheidungstabelle

Sieben Pflichtwerte. **Fehlt einer, meldet `pruefeKonfiguration()` `bereit=false`
und der Test darf nicht beginnen.**

Die Spalte „offen" gibt den Stand **nach** den Messläufen vom 01.09. wieder;
belegte Werte sind mit ihrer Herkunft in §16 nachgewiesen.

| Wert | Umgebungsname | Empfehlung | Herkunft | offen |
|---|---|---|---|---|
| Gesamtdeckel | `HELMUT_MAX_LLM_CALLS_PER_DAY` | **2.416** (Spanne 1.492–2.416; oberer Rand als Vorschlag) | `kapazitaet-500.zielDeckel()`: konservativer Bedarf ÷ 0,75; Untergrenze 2n−1 = **999**; gemessener Boden **1.496/Tag** (§16.4) | Verstehenswachstum bei 500 Mandaten (geteiltes Korpus, §16.6) |
| Verstehens-Reserve | `HELMUT_LLM_RESERVE_UNDERSTANDING` | **702** (Anteil **IM** Deckel) | konservativer priorisierter Frischbedarf; gestützt durch p95 Verstehen **82/Tag** bei 5 Mandaten (§16.3) | dasselbe Wachstum wie oben |
| Anfragen/Minute | `HELMUT_TESTLAUF_MAX_RPM` | **250** (Deploymentgrenze) | Betreiberangabe 01.09.; Stichprobe erreichte **10,8 RPM = 4,3 %** (§16.1) | **Azure-Gesamtkontingent des Kontos** (getrennt von der Deploymentgrenze) — nur im Portal/ARM sichtbar |
| Token/Minute | `HELMUT_TESTLAUF_MAX_TPM` | **250.000** (Deploymentgrenze) | Betreiberangabe 01.09.; Stichprobe erreichte **32.686 TPM = 13,1 %** (§16.1) | dasselbe Gesamtkontingent |
| Kostenbudget | `HELMUT_TESTLAUF_KOSTENBUDGET_USD` | **≈ 7,10 USD/Tag** bei Deckel 2.416 (obere Schranke **8,11**) | Deckel × gemessene Mischkosten 0,002941 USD/Aufruf (§16.5) | Kontopreis am Lauftag (F7 bleibt unbelegt — Listenpreis) |
| Vorrang reale Mandate | `HELMUT_TESTLAUF_VORRANG_REAL` | **mindestens 170** statt 5 | p95 **Gesamtbedarf 170/Tag** der 5 realen Mandate (Untergrenze, §16.3) — 5 schützt nur die Mandatszahl, nicht deren Tagesbedarf | Anteil je Mandat (Bedarf ist nicht je Mandat aufgeschlüsselt) |
| Parallelität | `HELMUT_TESTLAUF_MAX_PARALLEL` | **1** | `HELMUT_VERSTEHEN_PARALLELITAET` ist ungesetzt und wirkt als 1 | — |

**Verbindliche Semantik:** Die Reserven liegen **innerhalb** des Deckels und
werden **nie** addiert. Geprüfte Bindungen: Deckel ≥ 2n−1 · Reserve < Deckel ·
Verstehens-Reserve + Vorrangreserve < Deckel · Vorrangreserve ≥ 5 ·
Parallelität ≤ RPM · Deckel ≤ RPM × 1440.

**2.416 ist ein belegt gestützter VORSCHLAG, kein gesetzter Production-Deckel.**
Der Code wurde dafür **nicht** geändert: `zielDeckel()` gibt weiterhin die Spanne
aus, und keine Umgebungsvariable ist gesetzt. Die verbindliche Festlegung bleibt
eine getrennte Betreiberfreigabe.
Solange eine davon fehlt, ist der Rahmen **nicht bereit** — auch bei sonst
vollständiger und stimmiger Konfiguration (testgesichert §D).

## 5 · Die zwölf Abbruchregeln

| # | Regel | Beobachtung | Grenze | Quelle |
|---|---|---|---|---|
| A01 | erster unbekannter Modellaufruf | `unbekannteModellaufrufe` | fest 0 | `llm_usage` / Laufquittung |
| A02 | hängende oder verlorene Lease | `haengendeLeases` | fest 0 | `helmut_jobs` / CAS-Leases |
| A03 | Fehlerquote über der Grenze | `fehlerquote` | `maxFehlerquote` | Laufbilanz |
| A04 | Kostenüberschreitung | `kostenBisherUsd` | `kostenbudgetUsd` | `llm_budget_counters` × Preis |
| A05 | Laufzeitüberschreitung | `laufzeitMinuten` | `maxLaufzeitMinuten` | Startzeitpunkt |
| A06 | Azure-Drosselung | `drosselungen` | fest 0 | HTTP 429 |
| A07 | wachsender fälliger Rückstand | `rueckstandWachstum` | `maxRueckstandWachstum` | Drain-Bilanz |
| A08 | unvollständige Bilanz | `bilanzVollstaendig` | fest `true` | `lauf-bilanz.js` |
| A09 | Veränderung eines realen Mandats | `realeMandateVeraendert` | fest 0 | Grundlinienvergleich |
| A10 | erkannter externer Kommunikationsversuch | `kommunikationsversuche` | fest 0 | Kommunikationsriegel |
| A11 | unerwarteter Commit oder Deployment | `productionCommit` | `erwarteterCommit` (voller SHA) | Vercel `githubCommitSha` |
| A12 | Überschneidung unverträglicher Laufzeitfenster | `fensterKonflikte` | fest 0 | `pruefeStartfenster()` |

**Fail closed in beide Richtungen.** Eine ausgelöste Regel bricht ab — eine
Regel **ohne Messwert oder ohne gesetzte Grenze** ebenfalls. „Kein Messwert"
wirkt nie wie „alles in Ordnung"; `null` gilt nicht als gemessene Null. Ohne
Beobachtungen sind alle zwölf Regeln `nicht bewertbar` und der Lauf bricht ab.

Die fünf Pflichtgrenzen (`maxFehlerquote`, `kostenbudgetUsd`,
`maxLaufzeitMinuten`, `maxRueckstandWachstum`, `erwarteterCommit`) müssen
**vor** Testbeginn gesetzt sein; jede einzelne fehlende blockiert.

## 6 · Externe Kommunikation — zentraler, fail-closed Riegel

**Befund vor diesem Sprint:** sechs voneinander unabhängige Außenkanäle und
**kein gemeinsamer Punkt**, an dem eine ausgehende Nachricht hätte gestoppt
werden können. `lib/helmut/kommunikationsriegel.js` ist dieser Punkt. Er sitzt
in **jedem** der sechs Kanäle **vor** der jeweiligen Konfigurationsprüfung
(testgesichert per Reihenfolgevertrag am Quelltext):

| # | Kanal | Einhängepunkt |
|---|---|---|
| 1 | Mail | `mail-transport.js` `sendeMail` |
| 2 | Einladung / Passwort | derselbe Punkt (`invite-mail.js` reicht durch) |
| 3 | Web-Push | `push.js` `sendPushToPolitician` **und** `sendPush` (zweite Lage an der Netzgrenze) |
| 4 | WhatsApp (CallMeBot) | `server.js` `sendCallMeBotMessage` |
| 5 | Monitoring-Webhook | `monitoring-webhook.js` `deliverMonitoringWebhook` |
| 6 | Job-/Wecktransporte | `job-dispatch.js` `erstelleTransport` |
| 6b | Lambda-Invoke | `lambda-verbraucher.js` `erstelleRelayAusloeser` (läuft **nicht** über 6) |

**Die Sicherheit hängt nicht an `.invalid` und nicht an fehlenden
Umgebungsvariablen:**

- Das tragende Merkmal ist die **Kennungsfamilie** (`test-kohorte-`,
  `test-mdb-`, `synth-mandat-`, `stapel-`). Ein synthetisches Profil bleibt
  gesperrt, **auch wenn man ihm eine echte Adresse einträgt** (testgesichert).
  **Damit das auf dem echten Mailweg auch gilt, reichen seit diesem Sprint alle
  vier `sendAccessMail`-Aufrufer in `server.js` die Mandatskennung durch**
  (`kennung: <konto>.politicianId`) — zuvor kam am Mailkanal keine Kennung an,
  und dort trug allein das Adresssignal (adversarialer Review 01.09.,
  bestätigter Befund; Vertragstest §H).
- Die reservierte Maildomain und ein reserviertes Ziel sind **zweite und dritte,
  unabhängige** Signale. Ein Signal genügt zum Sperren.
- Die Sperre wirkt bei **völlig leerer** und bei **voll konfigurierter**
  Umgebung gleichermaßen — sie ist nicht „an, weil kein Schlüssel gesetzt ist".
- Ein **unbekannter Kanal** wird gesperrt, nicht durchgelassen. Ein
  mandatsgebundener Kanal ohne jede zuordenbare Angabe ebenfalls. Eine
  unlesbare Umgebung schaltet in die **strengere** Stellung.

**Zwei Modi.** Standard (`MODUS_KANAL`, immer aktiv, ohne Konfiguration): es
wird gesperrt, was synthetisch oder nicht zuzuordnen ist — realer Betrieb läuft
unverändert weiter, wie er es heute tut. Scharf
(`HELMUT_TESTLAUF_KOMMUNIKATION=gesperrt`): **jeder** Außenkanal schweigt, auch
die Betreiberkanäle WhatsApp und Monitoring-Webhook und auch reale Empfänger.
Das ist die Betriebsstellung des Testtages.

**Nachweis:** `scripts/kommunikationsriegel-test.js` schickt alle **495**
Kohortenprofile durch den echten Mail- und Push-Pfad bei **voll konfigurierter**
Umgebung, gegen einen zählenden `fetch`-Ersatz. Ergebnis: 495/495 gesperrt,
**Netzzähler 0**.

## 7 · Zeitüberschneidung — der Test kollidiert nicht mit 05:45/05:48

Der Minimal-Cron `18,48 * * * *` **bleibt aus**. In `vercel.json` sind die
**13 Cron-Einträge byte-identisch** (testgesichert); die Datei selbst wurde in
diesem Sprint an **einer** Stelle geändert — um die dokumentierte
**Deploy-Selbstsperre** für den Sprintbranch
(`git.deploymentEnabled["claude/security-sprint-functional-test-wap0q1"] = false`,
belegtes Verfahren des 30.08.). Wirkung per Vercel-API belegt: seit dem Push
**0** neue Deployments. Dokumentiert und getestet ist:

- Ein Startfenster, das **05:45** und **05:48** berührt, wird **gesperrt**.
  Grund: Das 05:45-Lage-Briefing darf bis zu **300 s** laufen (`maxDuration`),
  der 05:48-Slot startet dann während seiner Laufzeit. Die beiden teilen **kein
  Schloss**; ihre Verträglichkeit ist **NICHT belegt**
  (`minimal-cron.js`, Befund 6 — `laufzeitUeberschneidungen()` benennt genau
  dieses eine Paar).
- Auch **ohne** aktiven Minimal-Cron sperrt das 05:45-Briefing selbst das
  Fenster.
- Ein später erbrachter 05:45/05:48-Nachweis (`ueberschneidung0545Belegt`) hebt
  **nur diesen einen** Konflikt auf — die übrigen Bestandscrons bleiben
  gesperrt.
- Ein aktiver Minimal-Cron sperrt **jedes** Fenster ab 60 Minuten Dauer.
- Ein unvollständiges Startfenster und ein nicht parsebarer Cron zählen
  konservativ als Konflikt (fail closed).

**Betriebsregel:** Der 500er-Funktionstest wird in ein Fenster gelegt, das
`pruefeStartfenster()` mit `startErlaubt: true` beantwortet. Solange der
05:45/05:48-Nachweis fehlt, ist der Morgenblock gesperrt.

## 8 · Testkohorte — Werkzeuge und der harte Schutz der realen Mandate

Der Schutz ist eine **Erlaubnisliste**, keine Sperrliste: jedes Werkzeug wirkt
ausschließlich auf die 495 Kennungen, die `baueKohorte()` deterministisch
erzeugt. Eine fremde Kennung wird **nicht gefiltert**, sondern **bricht den
gesamten Vorgang ab**. Damit ist es strukturell unmöglich, ein reales Mandat zu
verändern, zu deaktivieren oder zu löschen — und im Code steht **kein einziger
realer Slug** (CLAUDE.md §4.2). Ein bloßes Präfix genügt nicht: auch
`test-kohorte-a-999` (existiert nicht) wird abgewiesen.

**Grundlinie und Bestand sind EINGABE, nicht Selbstauskunft.** Sie kommen aus
einer rein lesenden Vorprüfung (`node scripts/testkohorte-495.js sql`) und
werden als eingefrorener Vertrag übergeben. Fehlt ein Pflichtwert, entsteht
kein Plan.

**Alle sechs Werkzeuge sind idempotent:** ein zweiter Lauf mit erreichtem
Zielzustand plant **null** Änderungen (`bereitsErreicht: true`); ein
abgebrochener Lauf wird exakt ergänzt (Beispiel: 200 von 495 angelegt → Plan
über genau 295).

**Freigabe-Mechanik (Vorbild `pending-terminal.js`): zwei unabhängige Riegel.**
`HELMUT_TESTKOHORTE_EXECUTE` (Flag) **und** `HELMUT_TESTKOHORTE_CONFIRM` mit
dem exakten Wort des jeweiligen Schrittes. Jeder Schritt hat ein **eigenes**
Wort — die Freigabe der Anlage aktiviert nichts, und die Freigabe der Gruppe A
aktiviert nicht die Gruppe C. Ohne beides fällt jeder scharfe Lauf auf den
Trockenlauf zurück.

**Stufenvertrag:** Gruppe B ist blockiert, solange Gruppe A nicht vollständig
aktiv ist; Gruppe C, solange A und B es nicht sind. Eine nicht angelegte Gruppe
kann nicht aktiviert werden.

**Der scharfe Lauf ist im CLI bewusst NICHT implementiert** — er wäre eine
Production-Datenänderung und damit nach CLAUDE.md §5 einzeln freigabepflichtig.

## 9 · Runbook: Sicherung und Rückbau (ausführbar, **in diesem Sprint nicht ausgeführt**)

Das Production-Projekt läuft im **Supabase-Free-Tarif**: keine nativen Backups,
kein PITR (OP-01). Deshalb ist die gezielte Sicherung die einzige
Wiederherstellungsgrundlage.

### 9.1 Gezielte Sicherung **vor** der Provisionierung

```bash
# Genau die zwei betroffenen Tabellen (profiles, mandate_profiles) —
# datenminimierend, FK-sichere Reihenfolge im Manifest.
node scripts/backup-export.js --scope=profil
```

- Ablage `./backups/<UTC-Zeitstempel>/` (gitignored — **nie committen**).
- Der Export ist personenbezogen: `profiles` trägt Klarnamen realer
  Mandatsträger. Aufbewahrung/Verschlüsselung/Löschung nach
  [`backup-restore-runbook.md`](backup-restore-runbook.md) §1b.
- Zeitpunkt: **nutzungsarm**, vor dem 20:00-UTC-Crawl.

### 9.2 Prüfung der Sicherung

1. `manifest.json`: `manifestart: "pre-profil"`, `vollstaendig: true`.
   Ein Teil-Export mit 0 Zeilen in einer der Tabellen endet mit
   `vollstaendig: false` und Exit 1 — **das gilt nicht als Sicherung**.
2. Zeilenzahlen gegen die Grundlinie aus §1 vergleichen:
   `profiles` = 10, `mandate_profiles` = 9.
3. Mindestens einmal je Schlüssel eine **Entschlüsselungsprobe** durchführen —
   eine nie entschlüsselte Kopie ist keine Sicherung
   ([`backup-restore-runbook.md`](backup-restore-runbook.md) §1b).

### 9.3 Rückbau — **erster Rückweg ist Deaktivierung, nicht Löschen**

```bash
node scripts/lokal.js -- node scripts/testkohorte-495.js sql            # Bestand neu erheben
node scripts/lokal.js -- node scripts/testkohorte-495.js deaktivierung \
  --grundlinie=grundlinie.json --bestand=bestand.json                   # Plan (Trockenlauf)
```

Der Plan nennt genau die aktiven Kohortenzeilen. Er kennt **keinen Löschpfad**
(`loeschtNichts: true`). Der scharfe Lauf braucht Flag **und** Wort
`TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT` — und eine gesonderte Freigabe.

### 9.4 Wiederherstellung der Grundlinie

Ziel: **5 aktive und 4 inaktive reale Mandate**, 0 aktive synthetische Zeilen.
Der Weg dorthin ist die Deaktivierung aus 9.3, **nicht** ein Restore. Ein
Restore aus §9.1 ist der Rückweg **zweiter** Wahl und verändert
Production-Daten — er bleibt nach CLAUDE.md §5 freigabepflichtig
([`backup-restore-runbook.md`](backup-restore-runbook.md) §2).

### 9.5 Verifikation

```bash
node scripts/lokal.js -- node scripts/testkohorte-495.js rueckbau \
  --grundlinie=grundlinie.json --bestand=bestand.json
```

Vier Einzelbefunde, alle müssen `ok` sein: keine aktive synthetische Zeile ·
Zahl der realen Mandate unverändert · Zahl der **aktiven** realen Mandate
unverändert · keine neue Löschmarke an realen Mandaten. Zusätzlich rein lesend
zu bestätigen: Briefings, `llm_budget_counters` und Reservierungen der realen
Mandate unverändert.

## 10 · Ablaufplan für denselben Tag

Jede Zeile mit **F** ist eine **eigene, getrennte Freigabe**. Die kurzen
Sicherheitskontrollen zwischen den Gruppen ersetzen für diesen internen Test
die früher geplanten Siebentagesfenster.

| # | Schritt | Werkzeug | Freigabe |
|---|---|---|---|
| 1 | **Grundlinie** rein lesend erheben | `testkohorte-495.js sql` | — |
| 2 | **Sicherung** der zwei Tabellen + Prüfung | `backup-export.js --scope=profil` (§9.1–9.2) | — |
| 3 | Startfenster prüfen, Kommunikationsriegel scharf schalten | `funktionstest-500.startbereitschaft()` | **F** (Env) |
| 4 | **495 Profile INAKTIV provisionieren** | `testkohorte-495.js plan` → scharfer Lauf | **F** |
| 5 | **Isolation** prüfen (6 Einzelbefunde) | `testkohorte-495.js isolation` | — |
| 6 | **Gruppe 20 aktivieren** (Stufe A) | `aktivierung --gruppe=a` | **F** |
| 7 | **Kurze Sicherheitskontrolle** (§10.1) | Abbruchregeln A01–A12 | — |
| 8 | **Gruppe 75 aktivieren** (Stufe B) | `aktivierung --gruppe=b` | **F** |
| 9 | **Kurze Sicherheitskontrolle** | Abbruchregeln A01–A12 | — |
| 10 | **Gruppe 400 aktivieren** (Stufe C) | `aktivierung --gruppe=c` | **F** |
| 11 | **Kontrollierter Fachzyklus** | bestehender Motor | **F** |
| 12 | **Gemeinsame Auswertung** | Laufbilanz, Drain-Bilanz, Kosten | — |
| 13 | **Synthetische Profile deaktivieren** | `deaktivierung` | **F** |
| 14 | **Grundlinie bestätigen** | `rueckbau` (§9.5) | — |

### 10.1 · Die kurze Sicherheitskontrolle zwischen den Gruppen

Alle zwölf Abbruchregeln gegen frisch erhobene Messwerte auswerten. **Eine
Regel ohne Messwert stoppt den Test** — sie gilt nicht als grün. Zusätzlich:

1. reale Mandate: 5 aktiv / 4 inaktiv / 0 neue Löschmarken (A09),
2. Kommunikationsriegel: 0 durchgelassene Zustellversuche (A10),
3. Production-Commit unverändert (A11),
4. Laufbilanz geht auf (A08),
5. Kosten gegen das Budget (A04).

**Jede Production-Aktion und jedes Modellaufrufpaket bleibt eine eigene spätere
Freigabe.** Kein Schritt dieses Plans wurde in diesem Sprint ausgeführt.

## 11 · Was in Production weiterhin NICHT bewiesen ist

1. Der **fachliche Production-Zyklus** mit 5 realen + 495 aktiven synthetischen
   Profilen (§2, Ebene 3).
2. **ERLEDIGT am 01.09.** — die echten Azure-Werte liegen vor: Vorprobe (3) und
   Stichprobe (21) sind **ausgeführt**, 24/24 erfolgreich (§16.1). Was daran
   **offen bleibt**: das Azure-**Gesamtkontingent des Kontos** (getrennt von der
   Deploymentgrenze 250.000 TPM / 250 RPM) ist weiterhin nur im Portal/ARM
   sichtbar und wurde nicht erhoben.
3. Der **finale Production-Deckel** und die zugehörige Verstehens-Reserve —
   Vorschlag 2.416/702 belegt (§16.4), aber **nicht gesetzt** und nicht
   freigegeben.
4. Die **05:45/05:48-Laufzeitüberschneidung** — offen, deshalb im Startfenster
   gesperrt (§7).
5. Der **Kommunikationsriegel unter echter Production-Last**: offline für alle
   495 Profile mit Netzzähler 0 belegt, in Production nie gelaufen.
6. Der **siebentägige Nachweis** der jeweiligen Vorstufe (Stufentore
   5→10→…→500) bleibt für den regulären Betrieb bestehen; die kurzen
   Kontrollen aus §10.1 ersetzen ihn ausdrücklich **nur** für diesen internen
   Funktionstest.

## 12 · Welche Messwerte fehlen

Stand nach den Messläufen und der korrigierten Belegprüfung vom 01.09. (§16).
Die Bezeichner sind die Schlüssel aus `zielDeckel().offeneMessungen`; der Code
führt sie **unverändert** weiter, weil keine Freigabe zum Setzen erteilt ist.

| Messwert | Woher | Blockiert | Stand 01.09. |
|---|---|---|---|
| `p95-tagesbedarf-verstehen` | natürliche Läufe | Deckel, TPM | **belegt: 82/Tag** (§16.3) |
| `p95-tagesbedarf-lage` | natürliche Läufe | Deckel | **belegt: 7/Tag** (§16.3) |
| `p95-tagesbedarf-buero` | natürliche Läufe | Deckel | **belegt: 24/Tag** (§16.3) |
| `azure-kontingente-und-rate-limits` | Azure-Portal, rein lesend | RPM, TPM | **teilweise:** Deploymentgrenze 250.000 TPM / 250 RPM belegt; **Gesamtkontingent des Kontos offen** |
| `vollstaendiger-fachwegbericht` | Z3b | Deckel | **belegt** über alle drei Arbeitsformen (§16.1, §16.3) |
| Azure-Preis am Lauftag (F7) | Kontopreis am Lauftag | Kostenbudget | **weiter offen** — nur **Listenpreis** 0,25 / 2,00 USD je Mio. Token, kein Kontopreis (§16.1) |
| Laufzeit-/Tokenwerte je Arbeitsform | Vorprobe 3 + Stichprobe 21 | TPM, Kostenbudget | **belegt** (§16.1) |

**Zusätzlich offen geblieben (neu erkannt, §16.6):** das Verstehenswachstum bei
500 Mandaten (geteiltes Korpus, aus 5 Mandaten nicht ableitbar) · die ~12 %
Untererfassung des Ringpuffers gegenüber dem atomaren Zähler · der operative
Mehrtagesbetrieb · `HELMUT_TENANT_LLM_CAP` ist **aus**, die fünf realen Mandate
haben damit keinen wirksamen Verdrängungsschutz.

## 13 · Die einzeln notwendigen Freigaben (streng getrennt)

> **Stand 01.09.:** Die Punkte 1–3 sind **erteilt und ausgeführt** (§16.1). Die
> Punkte 4–14 stehen unverändert aus.

1. ~~**Azure-Anmeldung** wieder freigeben~~ — **erledigt 01.09.**
2. ~~**Vorprobe: 3 Modellaufrufe**~~ — **erledigt 01.09.**, 3/3, 0,005236 USD.
3. ~~**Stichprobe: 21 Modellaufrufe**~~ — **erledigt 01.09.**, 21/21, 0,035605 USD;
   die Freigabekennung verlangte technisch Laufkennung und Fingerabdruck der
   Vorprobe und hat das auch geleistet.
4. **Deckel und Verstehens-Reserve** setzen (zwei getrennte Env-Werte).
5. **RPM, TPM, Kostenbudget, Vorrangreserve, Parallelität** setzen.
6. **Kommunikationsriegel scharf schalten** (`HELMUT_TESTLAUF_KOMMUNIKATION=gesperrt`).
7. **Sicherung** ausführen.
8. **Provisionierung** der 495 inaktiven Profile.
9. **Aktivierung Gruppe A (20)** — eigenes Bestätigungswort.
10. **Aktivierung Gruppe B (75)** — eigenes Bestätigungswort.
11. **Aktivierung Gruppe C (400)** — eigenes Bestätigungswort.
12. **Fachzyklus** ausführen.
13. **Deaktivierung** der Kohorte — eigenes Bestätigungswort.
14. Falls je gewünscht: **Minimal-Cron** (`18,48 * * * *`) — die sieben
    dokumentierten Schritte aus `minimal-cron.aktivierungsVoraussetzungen()`,
    einschließlich des 05:45/05:48-Nachweises.

## 14 · Testnachweise

Alle Läufe über `scripts/lokal.js` (CLAUDE.md §6).

| Suite | Ergebnis |
|---|---|
| `z3b-azure-laeufer-test.js` (wiederhergestellt + geschärft) | **66 PASS / 0 FAIL** |
| `z3b-azure-freigaberiegel-test.js` (neu) | **24 PASS / 0 FAIL** — Netzzähler 0 |
| `kommunikationsriegel-test.js` (neu) | **44 PASS / 0 FAIL** — 495/495 gesperrt, Netzzähler 0 |
| `testkohorte-betrieb-test.js` (neu) | **83 PASS / 0 FAIL** |
| `funktionstest-500-test.js` (neu) | **101 PASS / 0 FAIL** |

**Kanonischer Offline-Gesamtlauf** (`scripts/lokal.js` → `run-offline-tests.js`) auf
dem Code-Endstand: **302/302 Suiten grün in 590 s** — vollständig grün. Die zwei
historisch roten npm-Fehlstände (`ical.js`, `@aws-sdk/client-sqs`) wurden für den
Lauf lokal nachinstalliert (`npm install --no-save`; `package.json` und Lockfile
unverändert). Beide sind **auch auf `main` rot** — gegengeprüft per `git stash`:
`lambda-paket-test.js` exit 1, `kalender-ics-test.js` exit 1. Sie sind kein Befund
dieses Sprints.

**Browser-/Mobile-Smoke** (`browser-smoke-test.js`): **32 PASS / 0 FAIL**.

**Ein Zwischenlauf war rot und ist ursächlich geklärt, nicht wiederholt:** Der erste
Entwurf des Kommunikationsriegels führte `.test`, `.example` und
`example.com/.net/.org` als synthetische Maildomains. Damit fielen vier gepinnte
Verträge des **echten** Mailwegs (`mailpit-transport`, `resend-transport`,
`reset-timing-seitenkanal`, `mail-vorlagen`) — sie verwenden seit Langem
`eva@example.org` und `noreply@helmut.test` als Fixtures. Das Verhalten des realen
Mailwegs zu ändern ist nicht Aufgabe dieses Riegels; das Zweitsignal wurde deshalb
auf die garantiert nicht auflösenden Namensräume `.invalid` und `.localhost`
verengt. Die geforderte Garantie bleibt vollständig: sie trägt auf der
Kennungsfamilie, nicht auf der Maildomain (§6, Test B1).

**Ein während des Sprints gefundener eigener Testfehler ist dokumentiert statt
stillschweigend korrigiert:** Der erste Entwurf des Freigaberiegel-Tests reichte
das geprüfte Preisdatum als eigenen Bezugstag durch — damit prüfte sich das Feld
gegen sich selbst, und eine veraltete Preisangabe kam durch (Netzzähler 1). Der
Läufer selbst war korrekt; der Bezugstag ist jetzt fest und vom geprüften Feld
unabhängig.

## 15 · Adversariales Diff-Review (37 Agenten) — 13 bestätigte Befunde, alle behoben

Über den gesamten Diff lief ein adversariales Review in sechs Dimensionen; jeder
gemeldete Befund wurde von einem zweiten, ausdrücklich auf **Widerlegung**
angesetzten Prüfer gegengeprüft. Ergebnis: **31 Befunde gemeldet, 13 bestätigt,
18 widerlegt.** Alle 13 sind behoben und mit einer Regressionsprüfung belegt.

| # | Schwere | Ort | Befund | Korrektur |
|---|---|---|---|---|
| 1 | hoch | `mail-transport.js` | Kein Produktionsaufrufer übergab die Mandatskennung — am Mailweg trug allein `.invalid` | alle vier `sendAccessMail`-Aufrufer reichen `politicianId` durch; `sendAccessMail` setzt den Kanal `einladung` selbst (§6, Test §H) |
| 2 | mittel | `testkohorte-betrieb.js` | Isolationsprüfung las die **generierten** Adressen statt der hinterlegten | der Bestand führt die gelesene Adresse je Zeile (Pflichtfeld); die Prüfung nutzt sie |
| 3 | hoch | `testkohorte-betrieb.js` | Löschmarken-Invariante verglich alle gegen nur reale Zeilen — eine Löschmarke auf einer Kohortenzeile hätte eine an einem **realen** Mandat verdeckt | Grundlinie führt `kohortenProfileGeloescht`; verglichen wird real gegen real |
| 4 | mittel | `testkohorte-betrieb.js` | `Number(null)` machte einen nicht gelesenen Wert zur gemessenen 0 | strikte Typprüfung ohne Koerzierung (vgl. `CLAUDE.md` §4.4) |
| 5 | mittel | `testkohorte-betrieb.js` | Isolation galt als belegt, obwohl **null** Kohortenzeilen gelesen wurden | die Prüfung verlangt die **vollständige** Kohorte (495) |
| 6 | hoch | `funktionstest-500.js` | Minimal-Cron-Slots wurden nur zwischen 00:00 und 01:59 erkannt | echte Intervallüberlappung über alle Stunden |
| 7 | hoch | `funktionstest-500.js` | Die 05:45/05:48-Sperre griff nicht, wenn das Fenster erst 05:46 begann | das Briefing belegt seine **Laufzeit** (05:45–05:50), nicht nur die Startminute |
| 8 | hoch | `funktionstest-500.js` | `Number(false)`, `Number("")`, `Number([])` = 0 meldeten feste Nullgrenzen als eingehalten | numerische Regeln verlangen eine echte, endliche Zahl |
| 9 | hoch | `skalierung-z3b-azure.js` | Die Paketkette war **deklarativ**, nicht strukturell: die Vorprobe-Laufkennung war frei erfindbar | Bindung an den Einzelmessungs-Fingerabdruck der Vorprobe **und** ehrliche Einordnung im Text (§3.1) |
| 10 | mittel | `skalierung-z3b-azure.js` | Der Antwortrumpf wurde ohne Zeit- und Größengrenze gepuffert (Hänger/OOM möglich) | der Zeitgeber läuft bis nach dem Lesen; angekündigte Überlänge wird vorher abgelehnt |
| 11 | mittel | `skalierung-z3b-azure.js` | `fetch` folgte Umleitungen — der Azure-Schlüssel wäre an einen ungeprüften Host gegangen | `redirect: "manual"`; jede 3xx-Antwort ist ein Abbruchgrund |
| 12 | hoch | Beleg §6 | Doku behauptete die Kennungs-Garantie für den echten Mailweg, wo sie nicht galt | mit Befund 1 behoben; die Stelle nennt die Änderung ausdrücklich |
| 13 | mittel | Beleg §7 | „`vercel.json` ist unverändert" — die Datei wurde geändert (Deploy-Selbstsperre) | präzisiert: die **Cron-Einträge** sind byte-identisch, die Selbstsperre ist benannt |

Die 18 widerlegten Befunde sind nicht eingearbeitet; sie betrafen unter anderem
die Perzentil-Konvention bei n=21, die `messungen`-Deklarationskarte und den
Schattentransport im Testfenster — jeweils mit ausgeführter Gegenprobe.

---

## 16 · Nachtrag 01.09. — ausgeführte Azure-Messläufe und korrigierte Z3b-Belegprüfung

Dieser Abschnitt entstand in einem reinen **Dokumentationscommit** (kein Code,
keine Konfiguration, keine Daten). Er trägt die Ergebnisse zweier einzeln
freigegebener Messpakete und einer anschließend **zweimal** durchgeführten
Belegprüfung nach — die zweite Prüfung korrigiert die erste (§16.7).

### 16.1 · Die beiden ausgeführten Messpakete

Randbedingungen beider Läufe: Parallelität 1 · keine Wiederholungen · nur
synthetische Prompts · `store: false` · **kein Datenbankzugriff** — der Prozess
wurde mit `env -i` gestartet und sah ausschließlich die übergebenen
Azure-Werte, sodass ein Supabase-Zugriff nicht bloß verboten, sondern technisch
unmöglich war. Beide Läufe liefen außerhalb des Repos und erzeugten keine Datei
im Projekt.

**Konfiguration (Betreiberangabe, 01.09.):** Deployment `gpt-5-mini` · Modell
`gpt-5-mini`, Version `2025-08-07` · Deploymentart **Global Standard** · Region
`swedencentral`, gemessen bestätigt durch den Antwortkopf `x-ms-region:
Sweden Central` · Preise **0,25 / 2,00 USD je Mio. Token** (Eingabe/Ausgabe).

> **Preisbasis bleibt F7-offen:** 0,25/2,00 ist der **öffentliche Listenpreis**
> der Microsoft-Azure-OpenAI-Preisseite (Betreiberangabe, geprüft 01.09.), **kein
> nachgewiesener Kontopreis**. Alle Kostenzahlen unten sind deshalb
> Listenpreis-Rechnungen. Zwischenspeicher-Rabatte sind bewusst **nicht**
> eingerechnet (konservativ).

| | Vorprobe | Stichprobe |
|---|---|---|
| Laufkennung | `vorprobe20260901` | `stichprobe20260901` |
| Aufrufe | **3/3 erfolgreich** | **21/21 erfolgreich** |
| Gesamtlaufzeit | 21.477 ms | 116,4 s |
| Eingabetoken | 7.464 (davon 4.224 aus dem Zwischenspeicher) | 52.094 (davon 29.568 aus dem Zwischenspeicher) |
| Ausgabetoken | 1.685 | 11.291 |
| Reasoning-Token | 0 | 0 |
| Kosten (Listenpreis, ohne Cache-Rabatt) | **0,005236 USD** | **0,035605 USD** |
| Kostenlimit des Pakets | 0,25 USD | 0,99 USD — ausgeschöpft zu **3,6 %** |
| Fehler / Drosselung / Zeitüberschreitung | 0 / 0 / 0 | 0 / 0 / 0 |
| Fingerabdruck (SHA256 über die Einzelmessungen) | `d69af1ae7477aac8170896c772ef9284339f56122a6d282b74e45a4c1bf7e30a` | `5baac1c0aa5a5209a02129470a5965eca6f08d9a080f660569733d9c7a685d77` |

Die Stichprobe wurde technisch erst durch Übergabe der Vorprobe-Laufkennung
**und** deren Fingerabdruck entriegelt (§3.1). Ihr Vorab-Kostendeckel lag bei
0,192367 USD; die tatsächlichen Kosten blieben mit 0,035605 USD bei **19 %**
davon.

**Belastbare Vergleichswerte je Arbeitsform (n=7 je Form, Stichprobe):**

| Arbeitsform | Laufzeit min / Median / p90 / max (ms) | Kosten je Aufruf (USD) |
|---|---|---|
| Verstehen | 8.367 / 9.110 / 9.893 / 10.431 | 0,003301 |
| Lage | 3.473 / 4.342 / 5.106 / 5.632 | 0,001186 |
| Büro | 2.285 / 2.832 / 3.511 / 3.662 | 0,000599 |

**Auslastung gegen die Deploymentgrenzen:** 10,8 Anfragen/Minute (**4,3 %** von
250) und 32.686 Token/Minute (**13,1 %** von 250.000). Beide Grenzen sind
Betreiberangaben; das **Gesamtkontingent des Azure-Kontos** ist davon getrennt
und wurde **nicht** erhoben (nur Portal/ARM).

**Abgleich mit der echten Production-Telemetrie:** Verstehen weicht um 1,6 %,
Lage um 6,7 % ab — die synthetischen Prompts sind für diese beiden Formen
realistisch. **Büro liegt 52 % daneben**, weil der synthetische Büro-Prompt zu
klein war (451 statt 1.372 Eingabetoken). Für Büro gelten deshalb die
Production-Werte, nicht die Stichprobenwerte.

### 16.2 · Korrigierte Datenquelle und ihre harte Grenze

**Maßgeblich für die KI-Nutzung ist `helmut_store.data.llmUsage`** (Zeile
`main-auth`), **nicht** die relationale Tabelle `llm_usage`. Letztere ist auf
diesem Pfad leer; daraus folgt **nicht**, dass keine Aufrufe stattfanden — die
Nutzung wird in den Blob geschrieben.

> **Ringpuffergrenze 5.000 Einträge.** `lib/helmut/storage.js:622` kürzt die
> Liste mit `slice(0, 5000)`. Das Beobachtungsfenster ist damit **durch die
> Puffergröße begrenzt, nicht durch eine Aufbewahrungsregel**: ältere Einträge
> fallen ohne Meldung heraus. Alles unten Berechnete gilt für das Fenster
> **2026-07-02 bis 2026-09-01 (62 Tage)**, das diese 5.000 Einträge aufspannen.

Zusammensetzung der 5.000 Einträge: **3.673 Erfolge · 19 technische Fehler ·
1.260 Budgetablehnungen · 48 fachliche Übersprünge.**

> **Budgetablehnungen sind keine Azure-Fehler.** Sie haben Azure nie erreicht;
> sie sind die Wirkung des Tagesdeckels. Sie werden hier ausschließlich als
> **Bedarfsnachweis** verwendet, nie als Fehlerquote.

**Technische Azure-Fehlerquote: 19 von 3.692 = 0,51 %.**

### 16.3 · Tagesbedarf, Verteilung und die Wirkung des Tagesdeckels

Grundlage sind die **60 vollständigen Tage** 2026-07-03 bis 2026-08-31 (die
Randtage 07-02 und 09-01 sind angeschnitten und bleiben außen vor).

| Größe | min | Median | p90 | **p95** | max | Mittel |
|---|---|---|---|---|---|---|
| **ausgeführte** Aufrufe/Tag | 20 | 60 | 81 | 93 | 185 | 60,3 |
| **Bedarf**/Tag (ausgeführt + abgelehnt) | — | 66 | 120 | **170** | 298 | 81,0 |

**p95-Tagesbedarf je Fachweg: Verstehen 82 · Büro 24 · Lage 7.**

> **Warum die ausgeführte Zahl den Bedarf nicht zeigt:** Der Tagesdeckel von 100
> schneidet die **ausgeführten** Aufrufe ab — an 5 der 48 ausgewerteten Tage
> wurde er erreicht. Die Messreihe ist damit **rechtsseitig zensiert**; p90/p95
> der ausgeführten Zahl laufen gegen den Deckel und sind keine Bedarfsaussage.
> Der Bedarf ist nur deshalb rekonstruierbar, weil die Ablehnungen **getrennt**
> protokolliert werden.

> **`p95 = 170` ist eine UNTERGRENZE, keine Punktschätzung.** Der Blob
> untererfasst gegenüber dem atomaren Tageszähler: an **47 von 48** gemeinsamen
> Tagen liegt der Zähler höher, im Mittel um **8,8 Aufrufe/Tag (rund 12 %)**. Die
> Ursache ist **nicht** ermittelt. Solange sie offen ist, darf 170 nur als
> Untergrenze verwendet werden.

### 16.4 · Konservativer Vorschlag: Gesamtdeckel 2.416, Verstehens-Reserve 702

**Gesamtdeckel: 2.416/Tag. Verstehens-Reserve: 702/Tag — innerhalb des Deckels,
nicht zusätzlich.**

Gestützt wird der Vorschlag durch eine **unabhängig gemessene Untergrenze**:
Skaliert man die mandatsgebundenen Arbeitsformen (Lage, Büro) von 5 auf 500
Mandate und lässt das geteilte Verstehenskorpus unskaliert, ergibt sich ein
Boden von **1.122 Aufrufen/Tag**, mit dem im Rahmen verwendeten
Auslastungsfaktor 0,75 also **1.496/Tag**. Das liegt **0,3 %** neben dem im Repo
schon vorhandenen Szenariowert 1.492 — zwei unabhängige Wege, dasselbe Ergebnis.

Zwei Rechenregeln, die dabei bewusst eingehalten wurden:

1. **Nicht `p95 × 100`.** Die relative Streuung einer Summe aus 100 unabhängigen
   Mandaten schrumpft mit √100; mandatsgebundene Arbeit wird deshalb vom
   **Mittelwert** hochgerechnet, nicht vom p95.
2. **Verstehen wird nicht linear skaliert.** Es verarbeitet ein **geteiltes**
   Dokumentenkorpus einmal, unabhängig von der Mandatszahl.

### 16.5 · Kosten

Gemessene Production-Kosten je Aufruf (Listenpreis): Verstehen 0,003355 ·
Lage 0,001266 · Büro 0,000913 · **gemischt 0,002941 USD**.

Bei Deckel 2.416: **7,10 USD/Tag ≈ 213 USD/Monat (gemischt)**. Als **obere
Schranke** — wenn der Verstehensanteil deutlich höher ausfällt als gemessen —
**243 USD/Monat**. Beide Zahlen sind Listenpreis-Rechnungen ohne
Zwischenspeicher-Rabatt (F7 offen, §16.1).

### 16.6 · Verbleibende Blocker und Messlücken für den 500er-Funktionstest

1. **Azure-Gesamtkontingent des Kontos** — nicht erhoben; nur Portal/ARM. Die
   Deploymentgrenze (250.000 TPM / 250 RPM) ist **nicht** dasselbe.
2. **Verstehenswachstum bei 500 Mandaten** — aus 5 Mandaten nicht ableitbar,
   weil das Korpus geteilt ist. Das ist die größte verbleibende Unsicherheit im
   Deckelvorschlag.
3. **~12 % Untererfassung des Ringpuffers** gegenüber dem atomaren Zähler,
   Ursache unbekannt (§16.3) — hält p95 170 auf dem Rang einer Untergrenze.
4. **Ringpuffer 5.000** begrenzt jede künftige Messung; ein längeres Fenster
   erfordert eine andere Ablage.
5. **05:45/05:48-Laufzeitüberschneidung** — unverändert offen, im Startfenster
   weiterhin gesperrt (§7).
6. **`HELMUT_TENANT_LLM_CAP` ist aus (OP-03).** Die fünf realen Mandate haben
   damit **keinen wirksamen Verdrängungsschutz**: der Vorrangwert im Rahmen
   schützt den Testlauf, nicht den Production-Betrieb. Zusätzlich schützt
   `HELMUT_TESTLAUF_VORRANG_REAL=5` nur die **Zahl** der Mandate — deren
   Tagesbedarf liegt bei p95 **170** (§4).
7. **Operativer Mehrtagesbetrieb** mit 500 Profilen — unverändert nicht bewiesen.
8. **Preisbasis F7** — nur Listenpreis, kein Kontopreis.
9. **Büro-Prompt der Stichprobe zu klein** (451 statt 1.372 Eingabetoken); für
   Büro gelten die Production-Werte. Eine Wiederholung der Stichprobe mit
   realistischerem Büro-Prompt wäre eine **neue**, getrennt freizugebende Messung.

### 16.7 · Korrekturen K1–K6 gegenüber dem falschen Zwischenbericht

Eine erste Belegprüfung stützte sich auf die **leere** Tabelle `llm_usage` und
kam damit zu falschen Schlüssen. Sie wird hier nicht stillschweigend ersetzt,
sondern ausdrücklich berichtigt (`CLAUDE.md` §4.4, §7.11):

| # | Falsche Aussage der ersten Prüfung | Belegte Korrektur |
|---|---|---|
| **K1** | „Büro: keine Daten, `office_outputs` ist leer." | **Falsch.** 390 erfolgreiche `communicationDraft`-Aufrufe, **p95 24/Tag**. Ein leeres `office_outputs` heißt nur, dass dort keine Artefakte abgelegt werden — es sagt nichts über Modellaufrufe. |
| **K2** | „Lage: keine Aufrufzuordnung möglich." | **Falsch.** 238 `lageBriefing`-Aufrufe, davon 230 erfolgreich, **p95 7/Tag**. |
| **K3** | „Verstehen: p50 0/Tag, Mittel 1,8/Tag." | **Irreführend.** Tatsächlich **p50 46**, Mittel **46,4/Tag**. Die Fehlzahl stammte aus `process_runs.saved_count` — das zählt **gespeicherte Wissensobjekte**, nicht Modellaufrufe. |
| **K4** | „`llm_usage` ist leer ⇒ p95 je Fachweg ist prinzipiell nicht erhebbar." | **Falscher Schluss.** Die relationale Tabelle war als einzige Quelle behandelt worden; maßgeblich ist `helmut_store.data.llmUsage` (§16.2). |
| **K5** | „p95 des Gesamtbedarfs ist wegen Zensur nicht bestimmbar." | **Teilweise falsch.** Der **ausgeführte** Wert ist zensiert, der **Bedarf** nicht: weil Ablehnungen getrennt protokolliert werden, ist p95 **170/Tag** messbar — als Untergrenze (§16.3). |
| **K6** | Fehlerquoten aus `process_runs` (u. a. `globalphase` 51/51). | **Ersetzt.** Maßgeblich ist die **technische Azure-Fehlerquote 19/3.692 = 0,51 %**; `process_runs`-Zustände mischen fachliche und Budgetgründe hinein. |

### 16.8 · Zwei Punkte aus der Betreiberprüfung

**(a) Vercel-Umgebungsvariablen — Betreiberangabe, in dieser Sitzung nicht selbst
geprüft.** Der Betreiber berichtet: die sensiblen Variablen wurden in der
Vercel-Oberfläche **maskiert** dargestellt, und Production arbeitet nachweislich
korrekt. **Diese Sitzung konnte das nicht nachvollziehen** — Vercel-Env ist aus
Claude-Sitzungen weder lesbar noch setzbar (§3 `CURRENT_STATE.md`,
[`env-inventar.md`](env-inventar.md) §8); der Sitzungszugriff beschränkte sich
auf das **lesende** Abrufen von Deployments. Die Angabe steht deshalb
ausdrücklich als **Betreiberangabe**, nicht als eigener Befund.
Was diese Sitzung **selbst belegen kann**, stützt den zweiten Teil der Aussage:
die Telemetrie zeigt **3.673 erfolgreiche Modellaufrufe** über Azure im Fenster
bis zum 01.09. bei **0,51 %** technischer Fehlerquote — der Azure-Zugang in
Production ist also wirksam konfiguriert. Über die **Darstellung** in der
Oberfläche sagt das nichts.

**(b) Azure-Endpunktguard — offene Sicherheitsverbesserung (in dieser Sitzung
geprüft).** Der **Production**-Pfad `lib/helmut/ai.js` baut die Ziel-URL direkt
aus der Umgebungsvariablen:

```js
const apiUrl = isAzure()
  ? `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1/responses`
  : OPENAI_API_URL;
```

Der Wert wird **nicht validiert**: kein Schema-Zwang (`https:`), keine
Host-Erlaubnisliste (etwa `*.openai.azure.com`), keine Prüfung auf
eingebettete Zugangsdaten oder abweichenden Port. Zusammen mit dem
`api-key`-Kopf bedeutet das: **ein falsch gesetzter oder manipulierter
Umgebungswert schickt Prompt und Schlüssel an einen beliebigen Host.**

Einordnung, ehrlich abgegrenzt:
- Der Weg nutzt `https.request` und folgt Umleitungen **nicht** automatisch —
  das Risiko ist der **Wert der Variablen**, nicht das Verfolgen von 3xx.
- Der Angriffsweg setzt Schreibzugriff auf die Vercel-Env voraus; das ist eine
  Betreiberberechtigung. Es ist eine **Verteidigung in der Tiefe**, kein
  aktueller Vorfall — es gibt **keinen** Hinweis auf eine Fehlkonfiguration.
- Der Messläufer dieses Sprints hat den entsprechenden Teil bereits geschlossen
  (`redirect: "manual"`, Review-Befund 11, §15). Der **Production**-Pfad hat
  diesen Schutz **nicht**.

**Bewusst nicht behoben:** Der Auftrag dieses Commits erlaubt ausschließlich
Dokumentation; `lib/helmut/ai.js` bleibt unverändert. Vorschlag für einen
eigenen, kleinen Sprint: Erlaubnisliste + Schemaprüfung beim Start,
fail-closed — ein unpassender Endpunkt verhindert den Start, statt still zu
senden.

### 16.9 · Was dieser Commit NICHT ist

Kein Code, keine Konfiguration, keine Daten. Keine Umgebungsvariable gesetzt,
kein Deckel aktiviert, keine Kohorte provisioniert, kein weiterer Modellaufruf,
keine Azure-, Supabase- oder Vercel-Änderung, kein Merge, kein Deployment. **PR
#294 bleibt Draft.** Alle 14 Freigaben aus §13 stehen unverändert aus; erledigt
sind aus dieser Liste allein die Punkte 1–3 (Azure-Anmeldung, Vorprobe,
Stichprobe).

---

## 17 · Nachtsprint 01./02.09. — Endpunktguard und Telemetriekorrektur

Letzte technische Härtung vor einer späteren Mergeentscheidung. **Keine
Production-Wirkung:** kein Modellaufruf, keine Umgebungs-, Azure- oder
Supabase-Änderung, kein Deployment, kein Merge, keine Aktivierung. Der
Supabase-Zugriff dieses Sprints war ausschließlich `SELECT`.

### 17.1 · Azure-Endpunktguard — die offene Sicherheitsverbesserung aus §16.8b ist geschlossen

Neues Modul [`lib/helmut/azure-endpunkt.js`](../../lib/helmut/azure-endpunkt.js).
Es ist reine Logik: kein Netz, keine Datenbank, keine Uhr, keine Secrets — und es
**wirft nie**, sondern antwortet immer mit einer vollständigen Entscheidung.

**Erlaubnisliste statt Sperrliste.** Akzeptiert werden ausschließlich gültige
HTTPS-Adressen der drei vorgesehenen Azure-Hostfamilien:

| erlaubt | Beispiel |
|---|---|
| `*.openai.azure.com` | `https://ressource.openai.azure.com` |
| `*.services.ai.azure.com` | `https://ressource.services.ai.azure.com` |
| `*.cognitiveservices.azure.com` | `https://ressource.cognitiveservices.azure.com` |

Die Suffixregel greift auf **Labelgrenze**: `ressource.openai.azure.com.angreifer.de`
und `openai.azure.com` (ohne Unterlabel) werden abgewiesen. Zusätzlich abgewiesen
werden: kein HTTPS · eingebettete Zugangsdaten · abweichender Port · mitgegebener
Pfad · Query oder Fragment · Steuerzeichen und Nullbytes · übermäßige Länge ·
alles syntaktisch Unparsbare. Die Ziel-URL wird aus der **normalisierten,
geprüften Basis neu zusammengesetzt** — der Rohwert wird nie mehr konkateniert.

**Zwei Prüfstellen, und die Reihenfolge ist die eigentliche Aussage:**

1. **Vor jeder Budgetreservierung** — ganz am Anfang von `requestOpenAI`. Vorher
   fiel eine ungültige Adresse erst beim `https.request` auf; da war der
   Reservierungsslot bereits verbraucht.
2. **Unmittelbar vor dem Netzaufruf** — Verteidigung in der Tiefe.

**Kein stiller, kostenpflichtiger Anbieterwechsel.** Ist Azure beabsichtigt
(eine der beiden Azure-Variablen gesetzt), aber nicht sicher benutzbar, meldet
`isAiEnabled()` **AUS**. Die Fachpfade nehmen dann ihren bereits vorgesehenen,
kostenfreien Regelweg (Regelfassung, ehrlicher Leerzustand) — statt still auf den
bezahlten OpenAI-Direktweg auszuweichen. Ausdrücklich erfasst ist auch die
**halb gesetzte** Konfiguration (nur Schlüssel oder nur Endpunkt): genau dort
schaltete der alte Code lautlos auf OpenAI um.

**Keine Geheimnisse in der Diagnose.** Ein Fehler aus diesem Weg trägt nur einen
Grund und einen sicheren Fingerabdruck (`ep:` + 12 Hexzeichen aus SHA-256) — nie
den Wert, in keiner Eigenschaft.

> **Empirische Korrektur einer verbreiteten Annahme** (Node v22.22.2, in diesem
> Sprint gemessen): Bei `https.request` lautet die `message` eines
> `ERR_INVALID_URL` nur „Invalid URL"; der Eingabewert steht in der aufzählbaren
> Eigenschaft **`err.input`**. Der Leckweg ist also **nicht** `error.message`,
> sondern jedes `console.error(err)` und jedes `JSON.stringify(err)` mit dem
> rohen Fehlerobjekt. Bei `fetch` (undici) ist es umgekehrt: dort steht die
> volle URL in der `message`. Und der praktisch häufigste Weg ist ein
> **Netzfehler**: `getaddrinfo ENOTFOUND <ressource>.openai.azure.com` trägt den
> Hostnamen in der `message`.

Daraus folgten drei weitere Korrekturen:

- **`lib/helmut/redact.js`**: `AZURE_OPENAI_ENDPOINT` fehlte als einziger
  Azure-Wert in der Secret-Liste — obwohl `HELMUT_MONITORING_WEBHOOK_URL` seit
  jeher darin steht, eine URL hier also grundsätzlich als schützenswert gilt.
  Ergänzt, **plus** eine Musterregel über die drei Azure-KI-Hostfamilien: der
  Endpunkt leckt meist als bloßer Hostname in einer Netzfehlermeldung, den ein
  reiner Wertabgleich nicht trifft.
- **`lib/helmut/ai.js`, `sourceNote`**: hier stand der rohe `error.message`, und
  dieses Objekt geht unverändert als JSON an den angemeldeten Nutzer. Der
  Azure-Ressourcenname des Mandanten verließ damit den Server im
  Produktbildschirm. Jetzt nur noch die symbolische Fehlerklasse.
- **`server.js`, `/api/debug/azure-ping`**: schrieb die letzten **vier Zeichen
  des Azure-Schlüssels** in die HTTP-Antwort *und* in das Vercel-Konsolenlog,
  das unbefristet in einer externen Logsenke liegt. Ersetzt durch den sicheren
  Fingerabdruck, der dieselbe Diagnosefrage beantwortet („ist das noch derselbe
  Schlüssel?"), ohne ein Zeichen preiszugeben.

**Bewusst nicht geändert:** die admin-secret-gegateten Reparatur-Endpunkte
(`/api/debug/status`, `/api/debug/pipeline-probe`), die den konfigurierten
Endpunkt absichtlich anzeigen, damit der Betreiber ihn korrigieren kann. Sie sind
zugangsgeschützt, und ihr Zweck ist genau diese Anzeige. Eine Umstellung auf
Fingerabdrücke würde die Reparaturfähigkeit nehmen, ohne einen belegten Leckweg
zu schließen — sie ist als eigener Punkt vermerkt, nicht still erledigt.

### 17.2 · Telemetrieabweichung — Ursache bewiesen

**Die Ursache ist der unbedingte Lese-Ändere-Schreibe-Zyklus auf dem gemeinsamen
`helmut_store`-Blob** (`writeAuthStore`, Voll-Upsert mit
`Prefer: resolution=merge-duplicates`, last-write-wins). Sie war im Code bereits
benannt — als Befund **W-2** (`storage.js:2761–2767`): „parallele
`recordLlmUsage` können sich gegenseitig Einträge überschreiben, der Zähler zählt
dann sogar zu WENIG." Für `processRuns` wurde W-2 2026-07-27 durch eine
relationale Tabelle gelöst; **`llmUsage` bekam diese Behandlung nie.**

**Der Beweis kommt aus einem unabhängigen Datenpaar im selben Schreibpfad.**
`recordProcessRun` schreibt **doppelt**: relational (atomarer Upsert, kanonisch)
*und* in denselben Blob. Ein Lauf, der relational existiert, aber im Blob fehlt,
ist damit ein bewiesener Blob-Schreibverlust — kein Ringpuffer-Effekt, denn das
Vergleichsfenster ist das vom Blob selbst abgedeckte Zeitfenster:

> **Korrektur nach adversarialem Gegenprüfer (2026-09-02).** Eine erste Fassung
> dieses Abschnitts nannte **63 von 365 (17,3 %)**. Diese Zahl war **um rund den
> Faktor 2 überhöht** und ist zurückgenommen. Grund: `warteschlange-*`-Quittungen
> entstehen über `schreibeWarteschlangenLaufquittung` (`storage.js:2949`) und sind
> **relational-nativ** — der Code sagt es ausdrücklich: „diese Quittung ist
> relational-nativ und hat nie eine Blob-Form gehabt". Sie können im Blob gar
> nicht fehlen, weil sie dort nie hingehörten. Belegend: im Fenster stehen **37**
> solcher Zeilen relational und **0** im Blob — ein Verlustmechanismus erklärt
> keinen 37-von-37-Totalausfall, ein relational-nativer Schreibpfad schon.
> Verglichen werden dürfen nur die **echten Dual-Write-Prozesse**.

| Messung (rein lesend, 2026-09-02, **nur Dual-Write-Prozesse**) | Wert |
|---|---|
| Blob-Einträge `processRuns` im Fenster | 300 |
| Relationale Zeilen `process_runs` im Fenster, **ohne `warteschlange-*`** | 328 |
| **Nur relational vorhanden — im Blob verloren** | **26 (7,9 %)** |
| Nur im Blob vorhanden | **0** |
| *nachrichtlich:* relational-native `warteschlange-*` (kein Verlust) | 37 relational / 0 im Blob |

Ein Verlust in die eine Richtung, keiner in die andere — genau die Signatur eines
Lost Update. Der reproduzierbare Mechanismus ist zusätzlich als Regressionstest
festgehalten (`llm-telemetrie-luecken-test.js`, Abschnitt D): zwei nebenläufige
Anhänge ohne Bedingung verlieren nachweislich einen Eintrag, **lautlos und ohne
Fehler** — deshalb blieb er unentdeckt.

**Was das für die llmUsage-Lücke heißt.** Der Mechanismus ist bewiesen und wirkt
auf demselben Pfad; die Größenordnung (**7,9 %** gemessen bei den
Dual-Write-`processRuns`, ~12 % beobachtet bei `llmUsage`) liegt in derselben
Grössenordnung. Sie ist **kein Deckungsbeweis**: `llmUsage` wird bei jedem
KI-Aufruf geschrieben und damit deutlich häufiger als Laufquittungen, sodass eine
höhere Verlustquote plausibel ist — belegt ist das aber nicht. **Nicht beweisbar bleibt die exakte
Zahl für `llmUsage`**: verlorene Einträge hinterlassen keine Spur, und der
Tageszähler sättigt am Deckel 100. Die Tagesbilanz zeigt beides:

- An Deckeltagen kippt die Lücke sogar ins Negative (07-20: Zähler 100, Blob 110),
  weil der Zähler nicht über den Deckel hinaus zählt, `budgetExempt`-Aufrufe aber
  protokolliert werden.
- Die Lücke sinkt ab dem **24.08.** deutlich (von 15–20 % auf 1–5 %) — einen Tag
  nach der Aktivierung des Warteschlangenmotors, der die Schreiblast serialisiert.
  Das passt zur Ursache, ist aber ein zeitliches Zusammentreffen, kein Beweis.

**Der Ringpuffer bleibt bei 5.000 Einträgen — unverändert** (testgesichert, D3).

### 17.3 · Sechs geschlossene Verlustpfade

Alle sechs sind Pfade, auf denen ein Budgetslot verbraucht wurde, ohne dass ein
Eintrag entstand — jeder für sich belegt, jeder jetzt sichtbar:

| # | Pfad | vorher | jetzt |
|---|---|---|---|
| 1 | **Anbieter-Vertagung** (`anbietergrenze`) liegt **nach** der Reservierung; jede Wiederholung reserviert erneut | Zähler +1, Blob +0 | als Nicht-Aufruf protokolliert |
| 2 | **Synchroner Wurf** beim Aufbau der Anfrage (ungültige Adresse, ungültiges Kopfzeilenzeichen) — passiert **vor** der Registrierung des `error`-Listeners | kein Eintrag, kein Fehler, falsches Grün | abgefangen, bereinigt protokolliert |
| 3 | **Überlanger Antwortrumpf** (`MAX_AI_RESPONSE_BYTES`) — voll kostenwirksam | kein Eintrag | `response-too-large` protokolliert |
| 4 | **400er-Modell-Fallback** erbte nur `_budgetReserved`; `_anbieterGeprueft` ging verloren, der Retry konnte erneut vertagt werden | 1 Reservierung, 1 echter Aufruf, 0 Einträge | vollständige `options` werden vererbt |
| 5 | **Fehlkonfigurierter Azure-Endpunkt** | Slot verbraucht, kein Eintrag | Riegel **vor** der Reservierung (§17.1) |
| 6 | **Skip ohne `success:false`** | erschien als **erfolgreicher** Modellaufruf | Skip-Marker erzwingt `success:false` |

Punkt 6 setzt die Vorgabe „Budgetablehnungen dürfen niemals als erfolgreiche
Modellaufrufe erscheinen" technisch durch: `buildLlmUsageRecord` leitete `success`
als `entry.success !== false` ab — ein **fehlendes** Feld bedeutete also Erfolg.
Jetzt zieht der ausdrücklich gesetzte `skipped-`-Marker `success:false` nach,
unabhängig davon, was der Aufrufer meldet.

Alle technischen Aufruffehler werden weiterhin **bereinigt** protokolliert: nur
symbolische Codes und Statuszeilen, nie Prompt, Antwort, Kennung oder Geheimnis.

### 17.4 · Verbleibende Lücke — ehrlich benannt

Die **Ursache ist behoben in ihren deterministischen Ausprägungen** (§17.3), aber
**nicht in ihrer dominierenden**: `recordLlmUsage` bleibt ein unbedingter
Lese-Ändere-Schreibe-Zyklus. Das ist Absicht dieses Sprints — die Behebung wäre
eine Umstellung auf eine relationale Tabelle nach dem Muster W-2/`process_runs`
und braucht **Migration und eigene Freigabe**, beides hier ausgeschlossen. Der
Zustand ist deshalb als Messung festgehalten (Test D1/D2), damit er nicht still
verschwindet.

**Folge für die Zahlen aus §16:** der Tagesbedarf **p95 170** bleibt eine
**Untergrenze**. Sie ist jetzt nicht mehr „Ursache unbekannt", sondern „Ursache
bewiesen, Betrag nicht rekonstruierbar".

### 17.5 · Azure-Deploymentkontingent (bestätigt)

**Vom Betreiber bestätigt (2026-09-02):** **250.000 Token pro Minute** und
**250 Anfragen pro Minute** für Deployment `gpt-5-mini`, **Global Standard**,
Modellversion **2025-08-07**. Das deckt sich mit der eigenen Messung der 21er
Stichprobe, die diese Grenzen zu **13,1 %** (32.686 TPM) bzw. **4,3 %**
(10,8 RPM) auslastete (§16.1).

**Unverändert offen** bleibt davon getrennt das **Azure-Gesamtkontingent des
Kontos** — es ist nur über Portal/ARM sichtbar und wurde nicht erhoben.

### 17.6 · Deckel und Reserve — nur dokumentiert

**Gesamtdeckel 2.416** und **Understanding-Reserve 702** bleiben ein
**dokumentierter Vorschlag**. Es wurde **keine Umgebungsvariable gesetzt**,
`zielDeckel()` gibt unverändert die Spanne aus, und die Reserve liegt weiterhin
**im** Deckel (nie addiert). Ebenfalls unverändert: die fünf realen Mandate,
Gate (`shadow`), Crons, Migrationen und alle Production-Daten.

---

## 18 · Vorbereitungssprint 02.09. — Verdrängungsschutz, Ablauf und Rückweg

**Teilweise abgeschlossen — offline vollständig bewiesen, keine Production-Wirkung.**
Dieser Sprint schließt die technisch lösbaren Blocker des 500er-Funktionstests.
**Nicht ausgeführt:** kein Merge, kein Deployment, keine Migration angewendet,
keine Production-Datenänderung, keine Provisionierung, keine Aktivierung, keine
Umgebungsvariable gesetzt, kein Deckel und keine Reserve verändert, kein Cron
verändert, kein Modellaufruf, keine externe Nachricht, keine Azure-Änderung,
keine kostenpflichtige Ressource. Der Supabase-Zugriff war ausschließlich
`SELECT`, der Vercel-Zugriff ausschließlich lesend.

### 18.1 · Ausgangsstand (rein lesend bestätigt, 2026-09-02)

| Prüfpunkt | Befund |
|---|---|
| `origin/main` | `881739da0f8f06184a1bdf7dd86895d896cf0336` (Merge von PR #294) |
| Vercel-Production-Deployment | `dpl_7pNLD8PgQXLEcyVtsuZEUhG5dhxB` **READY**, target `production`, `githubCommitSha` exakt `881739da…` |
| Mandate | **9** Zeilen: **5 aktiv**, 4 inaktiv, **0** Löschmarken |
| Synthetische Profile | **0** (`test-kohorte-*`, `synth-mandat-*`, `stapel-*`, `test-mdb-*`) |
| Identitätsprofile / Kohortenkonten | 10 / **0 aktiv** |
| Migrationen | **35**, letzte `20260829175749` — unverändert |
| Crons | **13** in `vercel.json`, **kein** `18,48 * * * *` |
| Unerwartete Production-Änderung seit dem Merge | **keine** — das jüngste Production-Deployment IST der Merge-Commit |

### 18.2 · Der Kernbefund: die realen Mandate hatten keinen Verdrängungsschutz

§16.6 nannte das für das KI-Budget. Der Sprint hat es **an vier Stellen** belegt,
und an allen vieren war es dasselbe strukturelle Problem: **der Begriff
„synthetisch" existierte außerhalb des Kommunikationsriegels nicht.**

| Ebene | Befund (Code-belegt) | Wirkung bei 5 realen + 495 synthetischen |
|---|---|---|
| **KI-Budget** | `storage.reserveLlmCall` bucht alle Mandate gegen EINEN globalen Zähler, „wer zuerst kommt"; `HELMUT_TENANT_LLM_CAP` ist aus und begrenzt ohnehin nur je Mandant | die realen Mandate können den Tagesdeckel leer vorfinden |
| **Priorisierung** | `llm-budget-fair.rotationsReihenfolge` sortiert rein nach SHA-256-Streuwert | bei Deckel 100 und Standardanteil 0,5 sind es 50 Plätze für 500 Mandate — je reales Mandat rund **10 % Chance je Tag** |
| **Warteschlange** | `order by priority asc, due_at asc` — alle mandatsgebundenen Aufträge tragen dieselbe Zahl | ein reales Briefing steht hinter beliebig vielen synthetischen |
| **Laufzeit** | die Lage-Briefing-Schleife (`server.js`) arbeitet in **fester Listenreihenfolge** gegen 240 s Zeitbudget | wer hinten steht, wird nie erreicht |

**Gebaut wurde eine EINE kanonische Klassifizierung** —
[`lib/helmut/mandatsklasse.js`](../../lib/helmut/mandatsklasse.js), reine Logik,
wirft nie, **kein einziger realer Slug** (CLAUDE.md §4.2). Der
Kommunikationsriegel führte diese Liste bisher als zweite Kopie und bezieht sie
jetzt von dort; sein Verhalten ist unverändert (Gleichheitsvertrag testgesichert).

Darauf setzen vier Schutzregeln auf:

1. **Vorrangreserve im KI-Budget** (`HELMUT_TESTLAUF_VORRANG_REAL`, **Default 0,
   nicht gesetzt**): der Wert wird vom wirksamen Tagesmaximum abgezogen — aber
   **nur** für Aufrufe, die NICHT einem realen Mandat zuzuordnen sind. Reale
   Mandate sehen unverändert `Deckel − Verstehens-Reserve`. Auch **geteilte**
   Arbeit (Verstehen) ist betroffen: sie hat mit
   `HELMUT_LLM_RESERVE_UNDERSTANDING` ihre eigene Reserve, und der Code erlaubte
   ihr bis dahin den **vollen** Tagesdeckel. Eine fehlende Kennung bekommt
   fail-closed die strengere Stellung.
2. **Reale Mandate zuerst in der Tagesrotation** (`rotationsReihenfolge`).
   Innerhalb jeder Klasse gilt unverändert dieselbe wandernde Rotation — die
   Kohorte verhungert nicht.
3. **+1 Prioritätsaufschlag** für mandatsgebundene Aufträge synthetischer
   Profile (`source-demand.mandatsPrioritaet`) — eine zweite, von der
   Fälligkeit unabhängige Lage.
4. **Reale Mandate zuerst bei hartem Zeitbudget** (`cron-fairness.planTenantOrder`
   und die Lage-Briefing-Schleife).

**STRUKTURELL WIRKUNGSLOS IM HEUTIGEN PRODUCTION-ZUSTAND.** Alle vier Regeln
entscheiden an der Kennungsklasse. Bei **0 synthetischen Zeilen** ist jede
Mandatsmenge homogen, und die Ausgabe ist **byte-identisch** zur Fassung vor dem
Sprint — nachgewiesen gegen eine im Test nachgebaute Kopie der alten Funktion
(`scripts/mandatsklasse-test.js`, Abschnitt C). Die Vorrangreserve ist zusätzlich
ohne gesetzte Umgebungsvariable ein reiner No-Op.

**Zusätzlich abgeschaltet:** synthetische Profile bauen **keine eigenen
Außenquellen** mehr (`scheduler.getSourcesForProfile`). Sonst entstünden je
Zyklus rund **1.000 Google-News-Abrufe** nach Namen wie „Testmandat A-001" — das
verschärft das belegte Klumpenrisiko OP-15 (146 von 163 Wegen) um zwei
Größenordnungen und füllt das Verstehensfenster (die 500 jüngsten Rohdokumente)
mit synthetischen Treffern. Ausdrücklich wieder einschaltbar:
`HELMUT_TESTKOHORTE_QUELLEN=aktiv`.

### 18.3 · `HELMUT_TENANT_LLM_CAP` — geprüft, und warum er das Problem NICHT löst

Der Deckel ist **aus** (OP-03). Eingeschaltet begrenzt er je Mandant über
`helmut_reserve_llm_call(p_day, 'tenant:<id>', p_max)` — **den globalen Topf hält
er nicht frei**. Konkret: ohne
`HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY` greift der Fallback **40 je Mandant**;
495 × 40 = **19.800** — ein Vielfaches jedes diskutierten Tagesdeckels. Es gibt
**keine Summenprüfung**. Und `HELMUT_TENANT_LLM_LIMITS` schlägt ausschließlich
per **exaktem Schlüssel** zu: ein vertippter realer Schlüssel degradiert
stillschweigend auf den uniformen Default.

**Empfehlung, ausdrücklich:** `HELMUT_TENANT_LLM_CAP` für den Testtag **nicht**
einschalten und `HELMUT_TENANT_LLM_LIMITS` **nicht** verwenden. Der wirksame
Schutz ist die globale Vorrangreserve — sie braucht keine 500 Einzelwerte und
kann nicht durch einen Tippfehler zerfallen.

### 18.4 · Die exakt zu setzenden Werte (**nicht gesetzt**)

Maschinenlesbar an einer Stelle: `kapazitaet-500.vorbereiteteBetreiberwerte()`,
druckbar über `node scripts/funktionstest-500-ablauf.js werte`.

| Umgebungsvariable | Wert | Herkunft |
|---|---|---|
| `HELMUT_MAX_LLM_CALLS_PER_DAY` | **2416** | konservatives Szenario ÷ 0,75; Fairness-Untergrenze 2n−1 = 999; gemessener Boden 1.496/Tag (§16.4) |
| `HELMUT_LLM_RESERVE_UNDERSTANDING` | **702** | konservativer priorisierter Frischbedarf; **IM** Deckel, nie addiert |
| `HELMUT_TESTLAUF_VORRANG_REAL` | **200** | gemessener p95-Tagesbedarf der 5 realen Mandate = **170** (UNTERGRENZE, §16.3) + Aufschlag für die bewiesene ~12 % Untererfassung (§17.2) |
| `HELMUT_TESTLAUF_MAX_RPM` | **82** | **NICHT 250.** Bei gemessenen **3.018 Token je Aufruf** (52.094 + 11.291 auf 21 Aufrufe) ergäben 250 Anfragen/Minute **754.500 TPM** — das Dreifache der TPM-Grenze. Bindend ist 250.000 ÷ 3.018 = **82** |
| `HELMUT_TESTLAUF_MAX_TPM` | **250000** | Deploymentgrenze (Betreiber 02.09.); eigene Messung 32.686 TPM = 13,1 % |
| `HELMUT_TESTLAUF_KOSTENBUDGET_USD` | **10,00** | Deckel 2.416: Erwartung **7,11 USD/Tag**, obere Schranke (alles Verstehen) **8,11 USD/Tag**; die Abbruchgrenze liegt bewusst darüber |
| `HELMUT_TESTLAUF_MAX_PARALLEL` | **1** | `HELMUT_VERSTEHEN_PARALLELITAET` ist ungesetzt und wirkt als 1 |
| `HELMUT_TESTLAUF_KOMMUNIKATION` | **gesperrt** | Betriebsstellung des Testtages: jeder Außenkanal schweigt |

**Kostenfolge bei Deckel 2.416:** ≈ **213 USD/Monat** (gemischt), obere Schranke
**243 USD/Monat** — unverändert gegenüber §16.5.

> **Ehrliche Grenze der Kostenabbruchgrenze (F7):** sie ist am **Listenpreis**
> gerechnet. Läge der Kontopreis höher, unterschätzte die laufende Rechnung die
> echten Kosten im selben Verhältnis, und A04 griffe zu spät. Was das Risiko
> begrenzt, ist deshalb **nicht** diese Grenze, sondern der **Aufrufdeckel**:
> mehr als 2.416 Aufrufe kann der Tag nicht kosten, zu welchem Preis auch immer.

> **Der Deckel ist im sicheren Tagesfenster nicht ausschöpfbar** — und das ist
> kein Fehler. Bei Parallelität 1 und gemessenen 9.110 ms je Verstehensaufruf
> braucht der volle Deckel **367 Minuten** reiner Laufzeit; das längste sichere
> Fenster tagsüber ist **263 Minuten**. Ein Tag, der den Deckel wirklich
> ausschöpfen wollte, endet an Abbruchregel **A05 (Laufzeit)**, nicht am Deckel.
> Der Deckel ist eine Obergrenze, kein Arbeitspensum.

### 18.5 · `recordLlmUsage` — die Restlücke ist relational geschlossen (Phase 2)

Nach exakt dem bereits bewährten Muster `W-2`/`process_runs`:

* **`lib/helmut/llm-usage-relational.js`** — reine Projektion Blob ↔ relationale
  Zeile. `"unknown"` wird **NULL**, niemals 0.
* **Dual-Write in `recordLlmUsage`**, gesperrt durch Flag
  `HELMUT_LLM_USAGE_RELATIONAL` (**Default AUS**) **und** `v3StoreReady()`.
  **Der Blob-Pfad bleibt unverändert** — alle heutigen Leser (`getLlmUsage`,
  `getLlmUsageToday`, `getRunCostReport`, Admin-Reports, `op25-nachweis`,
  Kontolöschung) finden ihre Daten weiter dort. Ohne Flag ist das Verhalten
  byte-identisch zum bisherigen Stand.
* **Migration `20260902121500_llm_usage_relational.sql` + Rollback** — rein
  **additiv**: `public.llm_usage` existiert seit `20260716` und wird um
  `tenant_id`, `profile_id`, `run_id`, `pipeline_step` und **`kein_aufruf`**
  ergänzt, dazu drei Indizes. **Nicht angewendet** (CLAUDE.md §5).
* **`kein_aufruf` ist die Spalte, auf der der ganze Bedarfsnachweis ruht:** ohne
  sie wären die 1.260 Budgetablehnungen des Messfensters relational nicht mehr
  von Azure-Fehlern zu trennen — und p95 170 nicht mehr rekonstruierbar.

**Zwei Korrekturen aus dem adversarialen Review am eigenen Entwurf:** der
relationale Schreibvorgang ist ein **reiner Insert** (ein
`resolution=merge-duplicates` hätte den stillen Verlust vom Blob in die Tabelle
verlegt), und ein Schreibfehler wird zusätzlich **strukturiert geloggt** — alle
bisherigen Aufrufer verwerfen den Rückgabewert.

**Was NICHT geschlossen ist, ehrlich:** Phase 3 (Lesepfad bevorzugt relational)
und Phase 4 (Blob-Schlüssel abschalten) sind **nicht** Teil dieses Sprints. Der
Ringpuffer bleibt bei **5.000** und damit in Phase 2 die Lesegrenze. **p95 170
bleibt eine Untergrenze.** Die DSGVO-Löschung erfasst `llm_usage` bereits
(`V3_PRIVACY_CHILD_TABLES`, geprüft); die Aufbewahrungsmatrix kennt die Tabelle
jetzt ebenfalls.

### 18.6 · Kommunikationsriegel — geprüft und an vier Stellen gehärtet

Der Riegel wurde adversarial gegen die Frage geprüft „welcher ausgehende Weg geht
NICHT durch ihn?". Alle sieben dokumentierten Einhängepunkte sitzen belegt **vor**
der jeweiligen Konfigurationsprüfung. Vier Befunde wurden behoben:

1. **`push.sendPush`** prüfte den Riegel nur mit dem **Endpunkt**. Ein echter
   FCM-Endpunkt trägt kein Synthetiksignal — die zweite Lage war ausgerechnet
   für ihren Zweck (ein synthetisches Profil mit echtem Abo) wirkungslos. Die
   Kennung wird jetzt durchgereicht.
2. **`mail-transport.sendeMailpit` / `sendeResend`** sind exportiert und hatten
   **keine** eigene Riegel-Lage; die Sperre hing allein an der Disziplin
   künftiger Aufrufer. Zweite Lage ergänzt.
3. **`job-dispatch.versendeAbsichten`** fragte den Riegel nur, wenn es den
   Transport selbst baute — ein **injizierter** Transport umging ihn vollständig.
   Der Riegel sitzt jetzt vor der ersten Vergabe, unabhängig vom Ursprung.
4. **Der Modulkopf war zu grün.** Er versprach „ist der Empfänger nicht
   bestimmbar, wird gesperrt". Tatsächlich gilt das, wenn **alle drei** Angaben
   fehlen. Die Zusage ist auf den tatsächlichen Vertrag zurückgenommen.

**Bewusst NICHT verschärft, mit Begründung:** „keine Kennung ⇒ gesperrt" würde
das Verhalten des **echten** Mailwegs ändern — Einladungen an Betreiber- und
Referentenkonten tragen bauartbedingt keine Mandatskennung
(`accounts.createUser` setzt `politicianId` nur für die Rolle „abgeordneter").
Genau diese Art Nebenwirkung hat schon einmal vier gepinnte Mailverträge
gebrochen (§14). Für die Kohorte trägt ohnehin die Kennungsfamilie, alle vier
`sendAccessMail`-Aufrufer reichen die Kennung durch (§H), und am Testtag sperrt
`MODUS_TESTFENSTER` jeden Kanal.

**Ausdrücklich NICHT im Riegel:** der **KI-Ausgang** (`ai.js`,
`embedding-backfill.js`). Ein Modellaufruf ist keine Nachricht an einen
Empfänger, und der Testtag braucht ihn — er wird durch das **Budget** begrenzt
(Deckel, Reserven, A04), nicht durch den Kommunikationsriegel. Das ist eine
Entscheidung, keine Lücke.

### 18.7 · 05:45/05:48 — gelöst über ein sicheres manuelles Fenster

**Kein Cron wurde verändert.** Neu ist die Antwort auf die andere Hälfte der
Frage: *welches Fenster ist überhaupt sicher?* `funktionstest-500.sichereStartfenster()`
rechnet die freien Blöcke des Tages aus den 13 Bestandscrons und ihrer
`maxDuration` (300 s für **alle** Routen — `vercel.json` konfiguriert genau eine
Funktion) aus. Zwei bewusst konservative Sperren: das ungeklärte
05:45/05:48-Paar und der **Actions-Watchdog**, der 05:30 UTC startet und belegt
„oft 2–3 h verzögert" ist — die Spanne **05:30–08:30 UTC** gilt deshalb als
belegt.

**Empfohlenes Testfenster: 11:36–15:59 UTC (263 Minuten)** = 13:36–17:59
Berliner Zeit. Es ist das längste Fenster, das vollständig in der Arbeitszeit
liegt; das absolut längste (21:36–03:59 UTC, 383 min) wird ausgewiesen, aber
**nicht** empfohlen — ein kontrollierter Production-Funktionstest braucht
Aufsicht.

**Der Start wird jetzt automatisch verweigert.** Die Fensterprüfung existierte,
aber **niemand fragte sie**, bevor Profile aktiviert wurden.
`testkohorte-betrieb.planeAktivierung` verlangt seit diesem Sprint einen
bestandenen `startfensterBefund`; fehlt er oder ist er negativ, fällt der Lauf
auf den Trockenlauf zurück — die Freigabe allein genügt nicht. **Der RÜCKWEG
(Deaktivierung, Rückbauprüfung) wird NIE durch ein Zeitfenster blockiert**, sonst
wäre ein misslungener Lauf im ungünstigsten Moment nicht mehr abbaubar.

**Fünf Härtungen aus dem adversarialen Review am eigenen Entwurf:** eine fehlende
Cronliste galt als freier Tag (jetzt `cronliste-fehlt`, fail closed) · die
verbindliche Prüfung kannte die Watchdogspanne nicht, war also **schwächer** als
die Empfehlung · `ueberschneidung0545Belegt` hob die einzige unbedingte Sperre
schon bei jedem truthy Wert auf (jetzt strikt `=== true`) · ein Cron des Vortags
mit Laufzeit über Mitternacht war unsichtbar · der freie Block über Mitternacht
wurde künstlich in zwei kürzere geteilt.

**Neuer Befund zum 05:45/05:48-Komplex:** `minimal-cron.laufzeitUeberschneidungen`
rechnete nur in **eine** Richtung („Slot startet in der Cron-Laufzeit") und
meldete deshalb genau EIN Paar. Ein Slot läuft aber selbst bis zu 280 s. Mit
beiden Richtungen sind es **ZWEI** Paare:

1. `lage-briefing` 05:45 → Slot 05:48 *(Slot startet in der Cron-Laufzeit)*
2. Slot 06:18 → `lage-briefing-nachlauf` 06:22 *(Cron startet in der Slot-Laufzeit)*

Die frühere Aussage „genau EIN Paar" war zu grün und ist zurückgenommen. Sie
betrifft nur die **Aktivierungsvoraussetzungen des Minimal-Crons** (Freigabe 14),
nicht den Funktionstest selbst — der Minimal-Cron bleibt aus.

### 18.8 · Stufen 20/75/400: die Abbruchkontrollen haben jetzt einen Aufrufer

**Befund:** `pruefeAbbruch()` konnte Regeln auswerten — aber **niemand erhob die
Messwerte**. Die Regeln liefen ausschließlich im Vertragstest. „Zwischen den
Gruppen wird kontrolliert" war eine Absichtserklärung, kein Ablauf.

Neu: **`lib/helmut/funktionstest-kontrolle.js`** + CLI
`scripts/funktionstest-500-kontrolle.js`.

* `sql` druckt das **rein lesende** Erhebungs-SQL (vier Blöcke; gegen die
  Production-Schemata geprüft, nur `SELECT`).
* `pruefe` bildet die erhobenen Zahlen auf die Beobachtungsgrößen ab und wertet
  alle Regeln aus. **Keine Koerzierung:** ein nicht erhobener Wert wird nicht
  übernommen — er fehlt, und eine Regel ohne Messwert bricht ab. Ohne bestätigten
  **Preis** entsteht **keine** Kostenzahl.

**Drei Regeln ergänzt** — der Auftrag verlangt je Stufe sieben Dimensionen
(Fehler · Kosten · Laufzeit · Rückstand · hängende Leases · **Dubletten** ·
Auswirkung auf reale Mandate); zwei fehlten, eine dritte fiel im Review auf:

| # | Regel | Warum sie fehlte |
|---|---|---|
| **A13** | Dublette (doppelt ausgeführte Arbeit oder doppeltes Profil) | A02 misst die **Ursache** (hängende Lease), niemand die **Wirkung** |
| **A14** | **Verdrängung** eines realen Mandats aus der Tagesleistung | A09 prüft, ob ein reales Mandat **verändert** wurde — nicht, ob es **verdrängt** wurde. Genau das ist der Schaden, den dieser Test anrichten kann, und er ist an keiner Mandatszeile sichtbar |
| **A15** | Zu wenig beobachtete Arbeit | Keine andere Regel verlangt, dass überhaupt gearbeitet wurde. Eine **leere** Bilanz erfüllt A08 (0+0+0=0), alle Nullzähler stehen auf null — die Kontrolle wäre grün, **bevor der erste Cron gelaufen ist**. A15 ist die einzige Regel, die bei **Unterschreitung** auslöst |

Damit sind es **fünfzehn** Regeln und **sechs** Pflichtgrenzen
(`mindestVerarbeiteteVorgaenge` ergänzt).

### 18.9 · Rückbau nach Gruppe C — der Rückweg existiert jetzt wirklich

**Befund:** `testkohorte-betrieb` **plante** den Rückbau, und das CLI wies jeden
scharfen Lauf ab. Es gab **keinen Weg**, die 495 Profile tatsächlich wieder
abzuschalten — außer 495 Einzelaufrufen von `provision-tenant.js --deactivate`,
**ohne** Erlaubnisliste. Für den gefährlichsten Moment des Vorhabens war das kein
Rückweg.

Neu: **`lib/helmut/testkohorte-rueckbau.js`** + CLI
`scripts/testkohorte-rueckbau.js`. Dreifach verriegelt:

1. **Erlaubnisliste** — wirkt ausschließlich auf die 495 deterministischen
   Kennungen; eine fremde Kennung **bricht ab**, sie wird nicht gefiltert. Die
   Einzelkennung wird zusätzlich unmittelbar **vor** jedem Schreibvorgang erneut
   geprüft.
2. **Zwei unabhängige Freigaben** — Flag **und** das Wort
   `TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT`. Ohne beides: Trockenlauf.
3. **Nachprüfung je Zeile** — nach jedem Schreibvorgang wird der erreichte
   Zustand **gelesen**; gemeldet wird nur, was die Ablage trägt (CLAUDE.md §4.10).

**Ein Fehlschlag an EINER Kennung beendet den Lauf NICHT** — sonst bliebe der
Rest der Kohorte aktiv stehen. Er wird gezählt, einzeln benannt, und das
Gesamturteil ist `ok: false`. Der Lauf ist idempotent und wiederholbar.
**Kein Löschpfad.**

**Vier Härtungen der Rückbauprüfung** (adversarialer Review):

* Sie bestätigte einen **LEEREN** Bestand als Erfolg — `bestand.kohorte = []`
  ergab „0 aktive Kohortenzeilen" und damit `zurueckgebaut: true`, obwohl gar
  nichts gelesen worden war. **Das ist der gefährlichste Fehlbefund, den dieses
  Modul haben kann.** Jetzt: Vollständigkeitsprüfung als eigener Befund.
* Der Bestand trug **keinen Erhebungszeitpunkt** — ein Bestand von **vor** der
  Provisionierung hätte gegen eine Grundlinie von danach gehalten werden können.
* Die **Identitäts- und Kontoebene** wurde nie geprüft: eine deaktivierte
  Mandatszeile ist kein zurückgebautes Profil, solange das Konto weiter anmelden
  kann. Zwei neue Befunde, zwei neue Spalten im Erhebungs-SQL.
* Die Duplikatprüfung verglich **rohe**, die Zugehörigkeitsprüfung **getrimmte**
  Werte — `[" test-kohorte-a-001", "test-kohorte-a-001"]` kam durch.

Aus vier Einzelbefunden sind **acht** geworden.

**Zusätzlich:** `provisioning.validateSpec` weist jetzt jede Kennung aus einer
reservierten synthetischen Familie **hart ab**, sofern der Aufrufer sie nicht
ausdrücklich erlaubt (`synthetischErlaubt: true`). Ein reales Mandat mit einer
solchen Kennung wäre für alle vier Schutzriegel gleichzeitig synthetisch: seine
Mails wären gesperrt, es stünde in der Warteschlange hinten, das Erhebungs-SQL
zöge es in die Kohorte — und der Rückbau hätte es deaktiviert.

### 18.10 · Der Ablaufplan: ausführbar beschrieben, vollständig gesperrt

**`lib/helmut/funktionstest-ablaufplan.js`** + CLI
`scripts/funktionstest-500-ablauf.js` machen aus der Tabelle in §10 eine
**prüfbare Funktion**: 17 Schritte, je mit Befehl, Art (rein lesend /
Production-Änderung / Umgebungsänderung), Vorbedingungen, Freigabe und
zugeordneten Abbruchregeln.

* **Vorwärts streng gesperrt:** fehlt eine Vorbedingung, darf der Schritt nicht
  beginnen. Ohne Belege ist der einzige mögliche Schritt die Grundlinienerhebung.
* **Rückwärts nie gesperrt:** Deaktivierung und Rückbauprüfung sind in **jedem**
  Zustand erlaubt (ihre eigene Freigabe brauchen sie trotzdem).
* **Keine Sammelfreigabe:** jede Stufe trägt ein eigenes Bestätigungswort; wer
  Schritt 6 freigibt, hat Schritt 8 nicht freigegeben.
* `ausfuehrbar: false` — der Plan führt **nichts** aus; ein `--scharf` gibt es in
  diesem Werkzeug nicht.

### 18.11 · Azure — was belegt ist und was ausdrücklich nicht

**Belegt (Betreiberangabe 02.09., deckt sich mit der eigenen Messung):**
Deployment `gpt-5-mini`, Modellversion **2025-08-07**, **Global Standard**,
Region **Sweden Central**, **250.000 Token/Minute** und **250 Anfragen/Minute**.
Die eigene 21er-Stichprobe lastete diese Grenzen zu **13,1 %** bzw. **4,3 %** aus.

**Ausdrücklich NICHT belegt und daraus NICHT ableitbar:** das
**Gesamtkontingent des Azure-Kontos**. Es ist von der Deploymentgrenze getrennt,
nur über Portal/ARM sichtbar und wurde nie erhoben. `BELEGTE_MESSUNGEN` führt
`azure-kontingente-und-rate-limits` deshalb weiterhin als **nicht belegt**, und
`zielDeckel().offeneMessungen` bleibt **unverändert fünfteilig** — der Betreiber
bringt jede Messung weiterhin ausdrücklich bei.

### 18.12 · Testnachweise

Alle Läufe über `scripts/lokal.js` (CLAUDE.md §6).

| Suite | Ergebnis |
|---|---|
| `mandatsklasse-test.js` (neu) | **36 PASS / 0 FAIL** |
| `verdraengungsschutz-test.js` (neu) | **23 PASS / 0 FAIL** |
| `llm-usage-relational-test.js` (neu) | **37 PASS / 0 FAIL** |
| `funktionstest-ablaufplan-test.js` (neu) | **52 PASS / 0 FAIL** |
| `funktionstest-500-test.js` (erweitert) | **108 PASS / 0 FAIL** |
| `testkohorte-betrieb-test.js` (erweitert) | **89 PASS / 0 FAIL** |
| `kommunikationsriegel-test.js` | **44 PASS / 0 FAIL** — 495/495 gesperrt, Netzzähler 0 |
| `llm-telemetrie-luecken-test.js` (erweitert) | **29 PASS / 0 FAIL** |
| `minimal-cron-test.js` (korrigiert) | **39 PASS / 0 FAIL** |
| `kapazitaetsmodell-test.js` (nachgezogen) | **58 PASS / 0 FAIL** |
| `cron-fairness-test.js` (präzisiert) | **285 PASS / 0 FAIL** |
| `env-inventar-test.js` | **38 PASS / 0 FAIL** |

**Kanonischer Offline-Gesamtlauf** (`scripts/lokal.js` → `run-offline-tests.js`) auf dem
Code-Endstand: **308/308 Suiten grün in 694 s**, Exit 0 — vollständig grün. Die beiden
zuvor lokal roten Suiten (`kalender-ics-test.js`, `lambda-paket-test.js`) sind grün, sobald
die im Lockfile stehenden Abhängigkeiten installiert sind (`npm ci` im CI;
`npm install --no-save` in dieser Sitzung — `package.json` und Lockfile **unverändert**).

**Browser-/Mobile-Smoke** (`browser-smoke-test.js`, Chromium, `HELMUT_REQUIRE_BROWSER=1`):
**32 PASS / 0 FAIL**.

**Datenbankverträge:** alle 14 `*-datenbank-test.js`-Suiten grün. Der vollständige
Z22-§1–§11-Nachweis gegen echte PostgreSQL + echtes PostgREST läuft im Pflicht-CI.

**Rein lesende Production-Prüfungen** dieser Sitzung: Mandatszahlen, Identitäts- und
Kontoebene, Migrationsliste, Warteschlangenspalten, Budgetzähler und Nutzungslog — alle
vier SQL-Blöcke der neuen Stufenkontrolle wurden gegen das **echte** Schema
gegengeprüft (nur `SELECT`).

### 18.13 · Was weiterhin NICHT bewiesen ist

1. Der **fachliche Production-Zyklus** mit 5 realen + 495 aktiven synthetischen
   Profilen (§2, Ebene 3). Unverändert.
2. Das **Azure-Gesamtkontingent des Kontos**.
3. Der **Verdrängungsschutz unter echter Last** — offline vollständig belegt, in
   Production nie gelaufen (wie der Kommunikationsriegel).
4. Das **Verstehenswachstum bei 500 Mandaten** (geteiltes Korpus) — die größte
   verbleibende Unsicherheit im Deckelvorschlag.
5. **p95 170 bleibt eine Untergrenze**: Phase 3/4 der relationalen Umstellung
   sind nicht freigegeben, der Ringpuffer bleibt bei 5.000.
6. Die **05:45/05:48-Verträglichkeit** selbst — sie wird umgangen, nicht bewiesen.
7. **F7** — nur Listenpreis, kein nachgewiesener Kontopreis.
8. Der **operative Mehrtagesbetrieb** mit 500 Profilen.
9. `llm-budget-fair.mandantenDeckel`/`globalerTopf` hängen weiterhin **nicht** im
   Produktionspfad (Flag `HELMUT_LLM_FAIRNESS`); wirksam ist allein die
   **Reihenfolge**. Bewusst nicht in diesem Sprint geändert — das wäre eine
   Verhaltensänderung am laufenden Budgetpfad.
