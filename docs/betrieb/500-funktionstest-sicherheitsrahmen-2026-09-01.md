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
