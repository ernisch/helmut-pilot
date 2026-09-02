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

---

## §19 · Nachtrag 02.09. — sechs Befunde der breiten Gegenanalyse

Nach dem Draft-PR #295 lief eine getrennte, breit angelegte Gegenanalyse über sieben
Teilsysteme zu Ende (72 Agenten, jeder Befund adversarial gegengeprüft). Sie bestätigte
acht Befunde. Zwei davon waren durch §18 bereits geschlossen (Planungsabbruch am
Listenende, O(n²)-Quellenplanung). Die verbleibenden **sechs** sind hier geschlossen —
jeder mit Regressionstest, keiner mit Production-Wirkung.

### 19.1 · Einladung und Passwort-Reset trugen nie eine Mandatskennung  (schwer)

**Tatsache.** `accounts.createUser` setzt `politicianId` **nur** für die Rolle
`abgeordneter` (`accounts.js:176-180`); `updateUser` setzt sie bei jeder anderen Rolle
hart auf `null`. Die Mandatsbindung eines Referenten liegt ausschließlich in den
Zuweisungen. Alle vier `sendAccessMail`-Aufrufer reichten aber allein
`user.politicianId` durch.

**Wirkung.** Ein Referent mit **echter Dienstadresse**, der einem synthetischen Mandat
zugewiesen ist, erzeugte einen Riegel-Vorgang mit `kennung=""` und realer Adresse →
`BEFUND_REAL` → **erlaubt**. Eine echte Einladungs- bzw. Reset-Mail mit gültigem
Passwort-Token hätte das System für ein synthetisches Mandat verlassen, ohne dass eine
Fehlkonfiguration nötig gewesen wäre. Der bisherige Vertragstest H4 prüfte nur, dass die
Aufrufer `kennung` **syntaktisch** mitgeben — nicht, dass der Wert je gefüllt ist.

**Geschlossen.** Neue Auflösung `kontoKennung(user)` in `server.js`: eigene Kennung hat
Vorrang (der reale Mailweg bleibt damit unverändert), sonst gewinnt eine **synthetische**
Zuweisung. Ein Vorgang kann dadurch nur **strenger** werden, nie lockerer. H4 pint jetzt
die Auflösung statt der Syntax; H4a pint die Reihenfolge.

**Einordnung (Schlussfolgerung).** Die Kohorte selbst war doppelt geschützt
(Kennungsfamilie **und** reservierte Maildomain `@test-kohorte.invalid`). Der Weg war nur
über ein **von Hand angelegtes** Referentenkonto erreichbar. Der Befund ist damit real,
aber er lag außerhalb des Runbooks.

### 19.2 · Der EUR-Profildeckel war für alle 495 Kohortenprofile ein No-op  (mittel)

**Tatsache.** `baueSpezifikation` setzte weder `aiBudgetDailyCents` noch
`aiBudgetMonthlyCents`. `evaluateTenantBudget` liefert dann `applied:false, allowed:true`
— der **einzige heute produktiv wirksame** Per-Mandant-Deckel griff für die Kohorte nicht,
während er für reale Mandate mit gesetztem Profilbudget greift.

**Geschlossen.** Die Spezifikation trägt jetzt `aiBudgetDailyCents: 10` und
`aiBudgetMonthlyCents: 100`.

**Ehrliche Grenze (ausdrücklich mitgeprüft, §8.6).** 495 × 10 ct liegt **über** der
Kostenabbruchgrenze. Dieser Deckel ist ein Rückfallnetz gegen **ein** durchdrehendes
Profil (gemessen ~0,27 ct/Aufruf ⇒ 10 ct kappen bei ~37 Aufrufen), **nicht** die bindende
Tagesgrenze. Bindend bleiben Tagesdeckel und Kostenabbruchgrenze.

### 19.3 · Der Fensterbefund war zeitlos  (mittel)

**Tatsache.** `planeAktivierung` akzeptierte jedes Objekt mit `startErlaubt === true`.
Es gab weder eine Gültigkeitsdauer noch eine Prüfung, gegen wie viele Croneinträge der
Befund gerechnet wurde.

**Wirkung.** Ein am Vortag korrekt für 11:36–15:59 erhobener Befund ließ einen scharfen
Lauf am nächsten Morgen um **05:47** anstandslos durch — genau in die 05:45/05:48-Laufzeit,
deren Verträglichkeit ausdrücklich **nicht** bewiesen ist.

**Geschlossen.** `pruefeStartfenster` liefert `gepruefteCrons`; ein Befund ohne
`gepruefteCrons > 0` gilt als **ungeprüft**. `planeAktivierung` verlangt zusätzlich
`jetztUtc` und prüft, dass die aktuelle Minute **im** Fenster liegt (auch über
Mitternacht). Fünf neue Blockadegründe benennen den Fall genau: `startfenster-nicht-geprueft`,
`startfenster-ohne-cronliste`, `startfenster-konflikt`, `startzeit-fehlt`,
`startzeit-ausserhalb-des-fensters`.

### 19.4 · Die Fairness-Zeile überlebt den Rückbau  (schwer)

**Tatsache.** Der Fairnesszustand ist **eine** `helmut_store`-Zeile, die je Mandatswechsel
vollständig gelesen und geschrieben wird; `mergeState` kappt den Bereich `crons` nicht nach
Anzahl, es gibt nur eine 90-Tage-Retention.

**Wirkung.** 500 Mandate × 4 Crons ≈ 2.000 Einträge — grob 0,5 MB statt der im Code
angenommenen ~4 KB. **Nachwirkung:** Der Rückbau deaktiviert, aber die Spur der 495
Kennungen bleibt danach **90 Tage** stehen und verlangsamt jeden Fairness-Schreibvorgang
der fünf realen Mandate weiter.

**Geschlossen.** Neuer, **getrennt freigegebener** Schritt
`testkohorte-rueckbau.entferneSchedulerSpur` mit eigenem Wort
`TESTKOHORTE_495_SCHEDULERSPUR_ENTFERNEN_BESTAETIGT`. Er entfernt ausschließlich
Scheduler-Metadaten (`storage.deleteCronFairnessTenant`), niemals Profil-, Inhalts- oder
Kontodaten, und läuft durch dieselben drei Riegel wie der Rückweg. Bewusst **nicht** Teil
von `fuehreRueckbauAus`: der Rückweg muss in jedem Moment sofort laufen dürfen, das
Aufräumen hat Zeit. Testgesichert, dass keines der beiden Wörter das jeweils andere
scharfschaltet.

### 19.5 · Der 5.000er-Ringpuffer kürzte Berichtsfenster still  (schwer)

**Tatsache.** `writeAuthStore` kappt das Nutzungslog bei 5.000 Einträgen. Bei 5 Mandaten
umspannten diese 5.000 Einträge belegt **62 Tage** (§16.2) — ein `days:30`-Bericht war
vollständig.

**Schlussfolgerung (Arithmetik).** Bei 100-facher Profilzahl liegt der Tagesanfall in
derselben Größenordnung 100× höher; Deckel 2.416 **plus** die Skip-Einträge füllen den Ring
in unter zwei Tagen. Der Admin-Kostenbericht `days=30` zeigte dann eine Summe, die
tatsächlich weniger als einen Tag abdeckt — **ohne jeden Hinweis**. Das ist ein falsches
Grün (CLAUDE.md §4.4).

**Geschlossen.** Neuer rein lesender Helfer `storage.blobFensterVollstaendig(alle, vonMs)`
und ein additives Feld `fenster` in `getAdminStatsCosts` und `getAdminCostsPerUser`. Die
Kürzung wird damit **sichtbar**, nicht behoben — der Ring bleibt bei 5.000, das ist
weiterhin Phase 3/4 der relationalen Umstellung.

**Abgrenzung (Tatsache, testgesichert E7).** Die Kosten-Abbruchregel **A04 ist nicht
betroffen**: die Stufenkontrolle leitet den Kostenwert aus `llm_budget_counters` ×
bestätigtem Preis ab, nicht aus dem Blob-Ring. Auch `op25-nachweis.kostenAusNutzung` meldet
die Retentionsgrenze bereits selbst. Die Behauptung der Analyse, A04 rechne gegen dasselbe
verkürzte Fenster, ist damit **widerlegt**.

### 19.6 · `slotKapazitaetReicht` wurde berechnet, aber nie ausgewertet  (mittel)

**Tatsache.** `tagesModell()` liefert das Feld seit jeher; weder `zielDeckel()` noch
`pruefeKonfiguration()` wertete es aus.

**Wirkung.** Ein später auf das Stressszenario (3.510) angehobener Deckel hätte
`bereit = true` gemeldet, obwohl die Verstehens-Slotlast (1.122) die physische Kapazität
(984/Tag) um 14 % übersteigt: die Reserve wäre im Deckel gebucht, aber physisch nicht
abrufbar, und der Frischverstehens-Rückstand wüchse ab dem ersten Tag. Aufgefallen wäre das
erst über Abbruchregel A07 — nach dem Schaden.

**Geschlossen.** Neue Bindung in `pruefeKonfiguration()`:
`reserveVerstehen ≤ slotKapazitaetVerstehenProTag`. Die vorbereitete Reserve **702 ≤ 984**
besteht sie; eine Reserve über 984 macht die Konfiguration nicht mehr bereit.

### 19.7 · Was die Gegenanalyse ausdrücklich NICHT fand

Kein Befund gegen den Verdrängungsschutz selbst, gegen die Erlaubnisliste, gegen die
Zwei-Riegel-Freigaben oder gegen die Inertheit bei 0 synthetischen Zeilen. Der Bereich
**Kohorte/Stufen/Rückbau** lieferte **null** bestätigte Befunde.

---

## §20 · Nachtrag 02.09. — adversariales Diff-Review: 20 Befunde, alle geschlossen

Ein zweites, unabhängiges Review prüfte den **Diff dieses Sprints** über sechs Dimensionen
(Sicherheit, Korrektheit, Inertheit, Fail-closed, Daten, Vertrag), jeder Befund
adversarial gegengeprüft; 20 überlebten die Gegenprüfung, 20 sind geschlossen.

**Der schwerste Befund traf die eigene Änderung dieses Sprints.**

### 20.1 · Die Vorrangreserve war widersprüchlich beschrieben und konnte still auf 0 klemmen

**Tatsache.** `mandatsklasse.vorrangGiltFuer` liefert für `geteilt === true` ausdrücklich
`gilt: true` — die Vorrangreserve wird also **auch der geteilten Verstehensarbeit**
abgezogen, und zwar auf dem Prioritätspfad, der bisher den vollen Deckel sah.
`storage.js` und — schwerwiegender — die **betreibersichtbare Ausgabe** von
`funktionstest-500-ablauf.js werte` behaupteten wörtlich das Gegenteil: „reale Mandate und
geteilte Arbeit sehen unverändert dasselbe Maximum". Zwei einander widersprechende
Beschreibungen desselben Schutzmechanismus, und die falsche stand genau dort, wo der
Betreiber über den Wert entscheidet.

**Wirkung (nachgerechnet).** Production-Deckel ist heute **100**, der vorbereitete
Vorrangwert **200**. Ohne Untergrenze wäre `effectiveMax = max(0, 100 − 200) = 0` für
**jeden** Verstehensaufruf: der Datenmotor **auch der fünf realen Mandate** stünde
vollständig still, während deren mandatsgebundene Aufrufe weiterliefen. Die Reserve, die
reale Mandate schützen soll, hätte ihnen die Inhalte abgeschaltet.

**Geschlossen.** (a) Alle drei Beschreibungen sagen jetzt dasselbe wie der Code.
(b) Neue **Untergrenze**: dem geteilten/priorisierten Pfad bleibt immer mindestens die
Verstehens-Reserve — eine Fehlkonfiguration bremst, sie schaltet nicht ab, und sie wird
**einmalig** protokolliert. (c) Die betreibersichtbare Ausgabe trägt jetzt eine
ausdrückliche `warnung`, dass der Deckel **vor** der Vorrangreserve angehoben wird.

### 20.2 · `startbereitschaft()` war asymmetrisch

**Tatsache.** Die Vorrangreserve wurde zur **Laufzeit** aus der Umgebung gelesen,
Tagesdeckel und Verstehens-Reserve blieben reines Papier aus der übergebenen
Konfiguration. Ein Lauf konnte „startbereit" melden, während live 100 gegen 200 stand.

**Geschlossen.** Neunte Hürde: `HELMUT_MAX_LLM_CALLS_PER_DAY` und
`HELMUT_LLM_RESERVE_UNDERSTANDING` werden aus **derselben** Umgebung gelesen und gegen die
Vorrangreserve geprüft. Fehlt einer, ist die Hürde nicht erfüllt (fail closed).

### 20.3 · Die Klassentrennung ließ synthetische Profile verhungern

**Tatsache, nachgemessen.** Der Rotationsversatz ist `(tagesNummer × schritt) % länge`.
Teilen sich `schritt` und `länge` einen Teiler, werden Positionen **nie** erreicht. Beim
Aufteilen wandert die Klassenlänge von 500 auf 495, die Schrittweite bleibt: über 30 Tage
bei Deckel 990 blieben **5 synthetische Profile dauerhaft unbedient** — entgegen dem
Kommentar, den ich selbst geschrieben hatte („rotiert gegen sich selbst und verhungert
nicht").

**Geschlossen.** Je Klasse eine zu ihrer Länge **teilerfremde** Schrittweite. Gemessen:
0 unbediente Mandate über 30 Tage, die fünf realen an jedem Tag. Die Korrektur greift
ausschließlich im aufgeteilten Fall — die homogene Liste (heutiger Production-Zustand)
bleibt byte-identisch.

### 20.4 · Sechs Befunde in der Stufenkontrolle — alle derselben Form

Jede Abbruchregel meldete eine **gemessene 0**, obwohl gar nichts gemessen worden war.
Das ist die gefährlichste Fehlerklasse in einem Sicherheitsnetz.

| Regel | Befund | Geschlossen durch |
|---|---|---|
| **A13** Dubletten | `group by idempotency_key having count(*) > 1` — auf dieser Spalte liegt ein **UNIQUE-Index**. Die Abfrage konnte strukturell nie eine Zeile liefern: eine Abbruchregel, die niemals auslöst. | Gruppierung über die **fachliche** Arbeit (`job_type, tenant_id, freshness_window`) — das ist die echte Dublettenklasse: dieselbe Arbeit unter verschiedenen Schlüsseln. |
| **A01/A06** unbekannte Aufrufe, Drosselungen | Gelesen aus `public.llm_usage` — einer Tabelle, die dieser Sprint bewusst **leer lässt** (Flag aus, Migration nicht angewendet). Genau der Fehlschluss K4. | Die Zahl entsteht nur bei ausdrücklich erklärter Quelle (`relationalAktiv` oder `blobAusgezaehlt`), sonst bleibt die Regel **unbewertbar**. |
| **A10** Kommunikationsversuche | Gemessen wurde `durchgelassen` — am Testtag sperrt der Riegel jeden Kanal, die Zahl ist strukturell immer 0. Der Riegel führt zudem **keinen** persistenten Zähler: es gab keine erhebbare Quelle. | Beobachtung nur bei `gezaehlt: true`; sonst ausdrücklich unbewertbar. |
| **A12** Fensterkonflikte | Gelesen wurde allein `konflikte.length`. Ein **nicht bewertbarer** Befund (leere Liste, `startErlaubt: false`) wurde zur gemessenen 0 und sah frei aus. | Nur bei `gepruefteCrons > 0`; ein gesperrtes Fenster ohne benannten Konflikt zählt als **mindestens ein** Konflikt. |
| **A14** Verdrängung | Fehlten die realen Mandate in der Zuteilung **vollständig** — der Fall der totalen Verdrängung, den A14 fangen soll —, war die Zahl 0 und ununterscheidbar von „alles in Ordnung". | Fehlende reale Mandate zählen als verdrängt. |

Neue Suite `scripts/funktionstest-kontrolle-test.js` (27 Prüfungen) pint durchgehend die
Unterscheidung **„gemessen und in Ordnung"** gegen **„gar nicht bewertbar"**.

### 20.5 · Weitere geschlossene Befunde

- **Das verbindliche Aktivierungstor prüfte schwächer als die Empfehlung** — die
  Watchdog-Vorsichtsspanne fehlte. Ein Tor darf nie schwächer sein als die Empfehlung, die
  es durchsetzt. (`watchdogBeruecksichtigen: true`)
- **Der Rückbau meldete `ok: true` für eine leere Zielmenge** — „nichts getan" sah aus wie
  „vollständig zurückgebaut", und zwar in genau dem Moment, in dem der Rückweg zählt.
- **Die Rückbauprüfung der Identitätsprofile** unterstellte eine Grundlinie mit 0
  Kohortenzeilen, die `pruefeGrundlinie` ausdrücklich nicht verlangt. Sie ist jetzt nur bei
  nachweislich kohortenfreier Grundlinie bewertbar.
- **Die Äquivalenzprüfung des Dual-Write** meldete „gleich", wenn die relationale Spalte
  NULL ist und der Blob 0 trägt — `Number(null)` ist 0. Genau die Abweichung, die sie finden
  soll, sah korrekt aus.
- **Der Tabellenkommentar der Migration** versprach „Insert mit id-Konflikt-Auflösung,
  idempotent"; der Schreibpfad hat ausdrücklich **kein** `on_conflict`.

### 20.6 · Fünf abgeschwächte Testverträge wieder geschärft

Das Review prüfte auch, ob dieser Sprint **bestehende Verträge entschärft** hat. Fünfmal ja:

- `kapazitaetsmodell-test` prüfte nur noch den Default-Fall — der gefährliche Fall
  (Vorrangreserve > Deckel) blieb ungeprüft. Jetzt gepinnt, inklusive der neuen Untergrenze
  und der ehrlichen Betreiberausgabe.
- `funktionstest-500-test` K2 zementierte „startbereit" für eine Umgebung **ohne** Deckel
  und **ohne** Verstehens-Reserve — genau die Asymmetrie aus §20.2. Ergänzt um K2a/K2b.
- `provision-stapel-test` schaltete den neuen Familienschutz für **alle** Specs ab, ohne
  Gegenprobe. Eine Ausnahme ohne Gegenprobe ist keine Ausnahme, sondern ein Loch — fünf
  Gegenproben ergänzt. (Die erste Fassung der Gegenprobe war selbst falsch geschrieben und
  erklärte den Schutz fälschlich für kaputt: `validateSpec` wirft nicht, es liefert eine
  Fehlerliste. Auch das steht hier, weil ein Test, der aus dem falschen Grund grün oder rot
  ist, kein Beleg ist.)
- `cron-fairness-test` ersetzte eine exakte Pinnung durch eine Whitelist mit `.every(...)` —
  auf einer **leeren** Liste wahr. Die Liste muss jetzt nachweislich Treffer enthalten.
- `testkohorte-betrieb-test` H8: Begründungskommentar („sechs") widersprach der gepinnten
  Zahl (acht).

### 20.7 · Was das Review NICHT fand

Kein Befund gegen die Erlaubnisliste, gegen die Zwei-Riegel-Freigaben, gegen den
Kommunikationsriegel oder gegen die Inertheit bei 0 synthetischen Zeilen. Zwanzig Befunde
wurden in der Gegenprüfung **widerlegt** und bewusst nicht umgesetzt.

---

## §21 · Nachtrag 02.09. — sechs Ausführungslücken, zwei davon nicht schließbar

Ein dritter Review prüfte, ob der Test **tatsächlich durchführbar** ist. Ergebnis: der
Abschlussbericht hatte „technisch vollständig vorbereitet" behauptet, während der Code an
sechs Stellen keine Ausführung zuließ. **Alle sechs Befunde sind gegen den Kopf `331859a`
bestätigt worden.** Vier sind geschlossen, **zwei sind strukturell nicht schließbar** und
stehen ab jetzt als Blocker im Code, nicht nur in der Prosa.

### 21.1 · Die sechs Befunde, einzeln geprüft

| # | Befund | Prüfung gegen `331859a` |
|---|---|---|
| 1 | `scripts/testkohorte-495.js` verweigert jeden scharfen Lauf | **TRIFFT ZU** — `process.exit(2)` bei `--scharf` |
| 2 | `funktionstest-ablaufplan.js` meldet `ausfuehrbar: false` | **TRIFFT ZU** |
| 3 | Kein verriegelter Ausführer für Provisionierung und die drei Aktivierungsstufen | **TRIFFT ZU** — der einzige scharfe Ausführer war der Rückweg |
| 4 | Schritt 14 nennt keinen ausführbaren Start; Fenster endet 15:59, Pipeline-Cron 16:00 | **TRIFFT ZU, und schwerer als beschrieben** (siehe 21.4) |
| 5 | A10 akzeptiert nur ein von Hand gesetztes `gezaehlt: true` | **TRIFFT ZU** — der Riegel führt überhaupt keinen Zähler |
| 6 | A01/A06 ohne relationale Telemetrie nicht automatisch messbar | **TRIFFT ZU** |

### 21.2 · Geschlossen: der Vorwärtsweg (Befunde 1, 2, 3)

Neu: `lib/helmut/testkohorte-vorwaerts.js` + `scripts/testkohorte-vorwaerts.js`. Es trägt
**dieselben drei Riegel** wie der Rückweg — Erlaubnisliste (unmittelbar vor **jedem**
Schreibvorgang erneut geprüft; eine fremde Kennung bricht ab, **bevor** irgendetwas
geschrieben wurde), zwei unabhängige Freigaben je Schritt, Nachprüfung je Zeile gegen die
Ablage — und **einen vierten, den der Rückweg ausdrücklich nicht hat: das Startfenster.**

Der Rückweg bleibt fenster- und vorstufenfrei. Er muss in jedem Moment sofort laufen
dürfen; testgesichert (E1–E3).

Ergänzt wurde `provisioning.activateTenant(id)` als Spiegelbild zu `deactivateTenant`.
Es schreibt **genau ein Feld** (`profileActive: true`) und rührt das **Konto absichtlich
nicht an** — ein deaktiviertes Konto kann sich nicht anmelden und keine Mail auslösen; das
ist für den Testtag die sicherere Stellung. Der Stapelvertrag („ein Stapellauf aktiviert
kein Mandat") bleibt unverändert gültig.

Ein versehentlich **aktiv** angelegtes Profil zählt in der Provisionierung als
**Fehlschlag**, nicht als Erfolg — sonst wäre die Stufung umgangen.

### 21.3 · Geschlossen: echte Auswerter statt menschlicher Zusagen (Befunde 5, 6)

Neu: `lib/helmut/funktionstest-nachweise.js` + `scripts/funktionstest-500-nachweise.js`.
Die Stufenkontrolle nimmt **keine Zusagen mehr an**: `blobAusgezaehlt: true` und
`gezaehlt: true` erzeugen keine Beobachtung mehr, nur noch das Ergebnis eines Auswerters.

**A01/A06** rechnen über `helmut_store.data.llmUsage` gegen den freigegebenen
callType-Katalog. Der 5.000er-Ring meldet seine eigene Kürzung fail-closed — ein gekürztes
Fenster liefert **keine** Zahl statt einer zu niedrigen. Damit sind beide Regeln **heute**
messbar, ohne Migration und ohne Flag.

**A10 musste zweimal gebaut werden.** Die erste Fassung zählte Auditereignisse als
Mailversandspur. Eine Gegenprüfung widerlegte das: `recordAudit` wird von der **Route**
geschrieben, unabhängig davon, ob die Mail hinausging — unter dem Riegel entsteht der
Eintrag also auch dann, wenn nichts gesendet wurde, und er trug keine Mandatskennung. Als
Versandnachweis war er ein Falschpositiv.

Behoben **an der Quelle**: die Mailaufrufer schreiben jetzt die aufgelöste Kennung **und**
`versand=ja|nein`. Nur `versand=ja` zählt. Dazu kommen die beiden Spuren, die der
**Sendepfad selbst** schreibt: `pushEvents.delivered` (vom Push-Dienst angenommene
Sendungen) und `helmut_job_outbox`.

**Ehrlich benannt bleibt:** drei der sieben Kanäle haben bauartbedingt **keine**
mandatsbezogene Versandspur — `whatsapp`, `lambda-invoke` und `monitoring-webhook`. Der
Auswerter weist sie als `nichtMessbar` aus. Eine dort gemeldete 0 wäre kein Freispruch.

### 21.4 · NICHT SCHLIESSBAR (1): die sichtbare Produktstufe entsteht im Fenster nicht

**Tatsache.** `source-demand.MANDATSPHASEN` (jetzt die einzige Quelle dieser Zahlen) legt
die Fälligkeit der mandatsgebundenen Arbeit im 24-Stunden-Frischefenster fest:

| Arbeitsklasse | Anteil | UTC | im Fenster 11:36–15:59 |
|---|---|---|---|
| `mandate_projection` | 50 %–75 % | 12:00–18:00 | **66,4 %** |
| `briefing_materialization` | 75 %–90 % | 18:00–21:36 | **0 %** |

Ein Auftrag wird erst bearbeitet, wenn er **fällig** ist. **Über die Warteschlange**
entsteht im empfohlenen sicheren Fenster deshalb **kein einziges Briefing** — also genau
die Stufe, die das Produkt sichtbar macht. Das ist **kein** Kapazitäts- und **kein**
Budgetproblem, sondern ein struktureller Zeitkonflikt. Auflösen ließe er sich für den
Warteschlangenweg nur durch eine Änderung an Phasenfenstern (Code),
`HELMUT_DEMAND_TENANT_MAX_AGE_H` (Umgebung) oder der Cronliste — alle drei nach
CLAUDE.md §5 getrennt freigabepflichtig und in diesem Auftrag verboten.

**PRÄZISIERUNG (vierter Reviewbefund, nachgeprüft).** Hier stand zuerst, die Produktstufe
entstehe „gar nicht" und der Konflikt sei „mit keinem Aufruf bestehender Routen zu
umgehen". Das war **zu absolut und ist zurückgenommen** — ein überzogener Blocker ist so
unehrlich wie ein verschwiegener. Richtig ist: der **Direktpfad**
`/api/cron/lage-briefing` ruft `buildLageBriefing` je Profil unmittelbar auf und kennt die
Phasenfenster der Warteschlange gar nicht. Er ist deshalb aber **kein gleichwertiger
Ersatz**, und der Zyklus-Startweg treibt ihn bewusst nicht an:

* Er ist je Aufruf auf **240 s** Arbeitszeit begrenzt und arbeitet die Profile in fester
  Listenreihenfolge ab; bei 500 Profilen kommt je Aufruf nur ein Ausschnitt durch, der
  Rest bekommt `reason: "zeitbudget"`.
* Er wirkt auf **alle** aktiven Profile, also auch auf die **fünf realen Mandate** — er
  erzeugte dort Briefings zu einer unüblichen Stunde.

Wer ihn nutzen will, entscheidet das **getrennt und mit offenen Augen**. Die Hürde in
`startbereitschaft()` heißt deshalb jetzt ausdrücklich „…über die Warteschlange fällig".

### 21.5 · NICHT SCHLIESSBAR (2): ein vollständiger Zyklus passt nicht in 263 Minuten

**Nachgerechnet** (`kapazitaet.zyklusPasstInsFenster`, Messwerte 9.110 ms/Aufruf):

| Szenario | Bedarf/Tag | in 263 min bei Parallelität 1 möglich | passt |
|---|---|---|---|
| Erwartung | 1.119 | 1.732 | ja |
| **Konservativ** | **1.812** | **1.732** | **nein** (nötig: 276 min) |
| Stress | 2.632 | 1.732 | nein |

Der **Deckel** 2.416 ist dabei ausdrücklich **nicht** das Arbeitspensum — er enthält 25 %
Reserve. Verglichen wird der Bedarf.

### 21.6 · Der einzige heute belegbare Ablauf — und was ihm fehlt

`funktionstest-zyklus.bewerteFensterFuerZyklus` bewertet **alle** freien Fenster gegen
**beide** Tore. Belegtes Ergebnis für die 13 Bestandscrons:

| Fenster (UTC) | Dauer | Briefing fällig | Projektion | Zyklus par 1 | Zyklus par 2 |
|---|---|---|---|---|---|
| 21:36–03:59 | 383 | 0 % | 0 % | ja | ja |
| 11:36–15:59 | 263 | **0 %** | 66,4 % | **nein** | ja |
| **17:36–19:59** | 143 | **55,1 %** | 6,7 % | nein | **ja** |
| 20:06–21:29 | 83 | 38,4 % | 0 % | nein | nein |

> **Bei Parallelität 1 trägt KEIN einziges Fenster einen vollständigen Zyklus.**
> Bei Parallelität 2 trägt genau eines beide Tore: **17:36–19:59**.

Daraus folgt der einzige heute belegbare Ablauf: **zwei Fenster nacheinander** —
11:36–15:59 für Abruf/Verstehen/Projektion, dann 17:36–19:59 für die Briefings. Er hat
**zwei ungedeckte Voraussetzungen**, beide getrennte Betreiberentscheidungen und in
diesem Sprint **nicht** getroffen:

1. **Parallelität 2** (`HELMUT_VERSTEHEN_PARALLELITAET`) — eine Umgebungsänderung, die
   ihren eigenen Nachweis braucht. Die acht vorbereiteten Betreiberwerte enthalten sie
   **nicht**.
2. **Teilabdeckung wird akzeptiert** — 55,1 % der Briefings, nicht 100 %.

### 21.7 · Was daraus für die Startbereitschaft folgt

`startbereitschaft()` hat zwei neue Hürden, die beide **fail closed** sind und heute beide
**nicht erfüllt** werden. Der Rahmen meldet deshalb von sich aus **„nicht startbereit"**,
auch wenn alle acht Betreiberwerte gesetzt sind. Der Vertragstest K2 pinnt das
ausdrücklich — er behauptete vorher das Gegenteil.

**Die Aussagen „technisch vollständig vorbereitet" und „kein Bauteil fehlt" sind damit
zurückgenommen.** Sie waren falsch.

### 21.8 · Zwei zusätzliche, getrennte Freigaben (Anforderung 11)

A01/A06 sind über den Blob-Auswerter **heute** messbar; die relationale Telemetrie wird
dafür **nicht** gebraucht. Wer sie dennoch will, braucht **zwei** getrennte Freigaben, und
sie stehen jetzt als Schritte 19 und 20 im Ablaufplan: die Migration anwenden **und**
`HELMUT_LLM_USAGE_RELATIONAL` einschalten. **Die acht Betreiberwerte allein genügen dafür
ausdrücklich nicht.**

---

## §22 · Nach-Merge-Nachweis 02.09. — PR #295 ist gemergt und deployt

**Zweck.** `CLAUDE.md` §9 verlangt nach einem autorisierten Merge einen **eigenen, rein
lesenden** Nachweis des tatsächlichen Endzustands. Der vor dem Merge geschriebene PR-Text
(„mergefähig", „nicht gemergt") erfüllt diese Pflicht danach nicht mehr. Dieser Abschnitt
ist dieser Nachweis. Er entstand **ausschließlich lesend**: keine Route ausgeführt, keine
Migration angewendet, kein Datensatz verändert.

### §22.1 Der Merge — belegte Tatsachen

| Gegenstand | Belegter Wert | Quelle |
|---|---|---|
| Pull Request | #295, `state: closed`, `merged: true` | GitHub-API, rein lesend |
| Zusammengeführt am | **2026-09-02, 13:08:53 UTC** (Berlin 15:08:53, Türkei 16:08:53) | `merged_at` |
| Zusammengeführt von | `ernisch` (Betreiber) | `merged_by` |
| Geprüfter PR-Kopf | `04b9f07601b859031805d1043f87f8614d3dfba0` | `head.sha` |
| Basis vor dem Merge | `881739da0f8f06184a1bdf7dd86895d896cf0336` | `base.sha` |
| **Neuer `main`-Kopf (Merge-Commit)** | **`9079ac3cc7d5d60ee993f7c45684a0591a254802`** | `git cat-file -p` |
| Eltern des Merge-Commits | `881739da…` **und** `04b9f076…` | `git cat-file -p` |
| Umfang | 55 Dateien, +9.111/−204, 8 Commits | GitHub-API |

Der Merge-Commit trägt eine **verifizierte Signatur** (`githubCommitVerification: verified`).

### §22.2 Die beiden Pflichtprüfungen auf **genau diesem** Kopf

Beide nach dem Merge gestarteten Pflicht-Checks liefen auf `9079ac3…` und sind **grün**.
Maßgeblich ist Lauf **33634007860** (`.github/workflows/ci.yml`, Ereignis `push`, Branch `main`):

| Pflichtprüfung | Ergebnis | Dauer | Job-Kennung |
|---|---|---|---|
| **Syntax + Offline-Suiten** | `success` | 13:09:05 → 13:17:50 UTC (8 min 45 s) | 100260175439 |
| **Browser-/Mobile-Smoke (Chromium)** | `success` | 13:09:05 → 13:10:01 UTC (56 s) | 100260175015 |

Im Job „Syntax + Offline-Suiten" ist auch der Schritt *„Z22-Datenbanknachweis §1–§11 gegen
echte PostgreSQL + echtes PostgREST (fail-closed)"* grün — der §11-Rückfallnachweis läuft
also weiterhin im Pflicht-CI.

### §22.3 Das Production-Deployment — **die `dpl_`-Kennung ist jetzt belegt**

Der Sprintbericht vom 02.09. musste festhalten, dass die interne Vercel-Kennung **nicht
auslesbar** war; GitHub meldete nur `success` und „Deployment has completed". Diese Lücke
ist geschlossen — die Kennung wurde am 02.09. rein lesend über die Vercel-API abgerufen:

| Gegenstand | Belegter Wert |
|---|---|
| **Deployment-Kennung** | **`dpl_DHTnMxFsibaj3XxdkpgDzandursx`** |
| Zustand | **`READY`** |
| Ziel | **`production`** |
| Commit | `9079ac3cc7d5d60ee993f7c45684a0591a254802` — **exakt der neue `main`-Kopf** |
| Erstellt | 2026-09-02, 13:08:57 UTC (Berlin 15:08:57, Türkei 16:08:57) |
| Projekt / Team | `helmut-pilot` (`prj_xbZ6QzTkr7YoxQI71lW59FT03IR3`) / `nohut` |
| Rücksetzbar | `isRollbackCandidate: true` |

Damit ist der Deployment-Beleg **vollständig**: Commit, Zustand, Ziel und interne Kennung
stimmen überein. Eine frühere Sitzung durfte diese Kennung nicht behaupten — jetzt darf sie
zitiert werden.

### §22.4 Was der Merge **nicht** verändert hat (rein lesend nachgezählt, 02.09.)

| Gegenstand | Wert nach dem Merge | Erwartet |
|---|---|---|
| Mandatsprofile gesamt | **9** | 9 |
| davon aktiv | **5** | 5 |
| davon inaktiv | **4** | 4 |
| Löschmarken (`geloescht_at`) | **0** | 0 |
| Identitätsprofile | **10** | 10 |
| Synthetische Mandatszeilen (`test-kohorte-`, `test-mdb-`, `synth-mandat-`, `stapel-`) | **0** | 0 |
| Synthetische Identitätszeilen | **0** | 0 |
| Synthetische `helmut_store`-Zeilen | **0** | 0 |
| `helmut_store`-Zeilen gesamt | **12** | — |
| Angewendete Migrationen | **35**, letzte `20260829175749` | 35 |
| Crons in `vercel.json` | **13** | 13 |

Der Minimal-Cron `18,48 * * * *` ist **nicht** in `vercel.json` — er bleibt vorbereitet und
unaktiviert. Migration `20260902121500` liegt weiterhin **nur als Datei** vor.
`HELMUT_LLM_USAGE_RELATIONAL` ist **nicht** aktiv. Keiner der acht Betreiberwerte ist gesetzt.

**Diese Nullen sind gezählt, nicht angenommen** — jede Zeile stammt aus einer `SELECT count(*)`-
Abfrage gegen die Production-Datenbank bzw. aus `vercel.json` im gemergten Baum.

### §22.5 Das Urteil nach dem Merge — unverändert

Der Merge machte die Schutzregeln, die Ausführer **und beide Blocker-Hürden** wirksam. Er
machte den 500er-Funktionstest **nicht** startbereit, und er sollte es nicht. Die beiden
strukturellen Blocker aus §21.4/§21.5 gelten unverändert weiter; sie sind in §23 erneut und
unabhängig am Code nachgeprüft.

---

## §23 · Nachprüfung 02.09. nach dem Merge — beide Blocker bestätigt, zwei neue Lücken geschlossen

**Zweck.** Der Auftrag verlangt, beide verbleibenden Blocker **erneut und unabhängig**
am Code nachzuprüfen, alle Zeitfenster und Kapazitäten reproduzierbar nachzurechnen und
vier Lösungswege gegeneinander zu bewerten. Dieser Abschnitt ist das Ergebnis. Er entstand
**ausschließlich lesend** gegenüber Production; jede Ausführung lief über
`scripts/lokal.js` (Production-Kennungen aus der Kindprozess-Umgebung entfernt).

### §23.1 Blocker 1 — bestätigt, Zahlen exakt reproduziert

`lib/helmut/source-demand.js:84–87` ist die einzige Quelle der Phasenfenster:

```
MANDATSPHASEN = [
  ["mandate_projection",        200, 0.50, 0.75],
  ["briefing_materialization",  250, 0.75, 0.90]
]
```

Die Anteile beziehen sich auf ein **24-Stunden-Frischefenster**; `dueAt` entsteht in
`source-demand.js:542` als `fensterStartMs + versatz`, wobei `versatz` innerhalb
`[ab·24 h, bis·24 h)` liegt. Daraus:

| Arbeitsklasse | Anteil | Fällig (UTC) | Türkei | Berlin |
|---|---|---|---|---|
| `mandate_projection` | 0,50–0,75 | **12:00–18:00** | 15:00–21:00 | 14:00–20:00 |
| `briefing_materialization` | 0,75–0,90 | **18:00–21:36** | 21:00–00:36 | 20:00–23:36 |

Nachgerechnete Überdeckung der drei freien Fenster — jede Zahl ist der Quotient aus
Schnittmenge und Phasendauer, nicht eine Schätzung:

| Fenster (UTC) | Dauer | `briefing_materialization` | `mandate_projection` |
|---|---|---|---|
| 21:36–03:59 | 383 min | 0 min / 216 = **0,0 %** | 0 min / 360 = **0,0 %** |
| **11:36–15:59** | **263 min** | 0 min / 216 = **0,0 %** | 239 min / 360 = **66,4 %** |
| 17:36–19:59 | 143 min | 119 min / 216 = **55,1 %** | 24 min / 360 = **6,7 %** |

**Alle vier im PR #295 genannten Prozentzahlen sind exakt bestätigt.** Der Schnitt von
18:00–21:36 mit 11:36–15:59 ist die leere Menge — über die Warteschlange entsteht im
empfohlenen sicheren Fenster **kein einziges Briefing**, unabhängig von Budget,
Parallelität und Aufrufzahl.

**Der Direktpfad bleibt die einzige Umgehung, und er bleibt ungeeignet** (`server.js:1637–1710`,
am Code nachgeprüft): die Route iteriert über **alle** aktiven Profile, besitzt **keinen**
Filterparameter (kein `nur`, `only`, `mandat`, `tenant`, `limit`), arbeitet gegen ein hartes
Zeitbudget von **240 000 ms** (`server.js:1671`) und in fester Listenreihenfolge; nicht
erreichte Profile bekommen `reason: "zeitbudget"`. Der Verdrängungsschutz aus #295 sortiert
reale Mandate nach vorn (`server.js:1663`) — er verhindert damit ihre Verdrängung, aber
**nicht**, dass sie überhaupt bearbeitet werden. Der Direktpfad erzeugt für die fünf realen
Mandate Briefings zu einer unüblichen Stunde.

### §23.2 Blocker 2 — bestätigt, aus den Einzelposten nachgerechnet

Reproduzierbar über `node scripts/lokal.js -- node -e "…kapazitaet-500…"`:

| Szenario | Bedarf/Tag bei 500 | 263 min · par 1 | passt | nötige Minuten |
|---|---|---|---|---|
| erwartung | 1.119 | 1.732 | ja | 170 |
| **konservativ** | **1.812** | **1.732** | **nein** | **276** |
| stress | 2.632 | 1.732 | nein | 400 |

Grundwerte: `LAUFZEIT_JE_AUFRUF_MS = 9110`, `SCHEIBE_MS = 280000`, `TOKEN_JE_AUFRUF = 3018`.
Rechnung: 263 min × 60 000 ms ÷ 9 110 ms = 1 732,2 → **1.732**; 1 812 × 9 110 ÷ 60 000 =
275,1 → **276 min**. Beide Zahlen stimmen auf die Einheit.

Über alle Fenster und beide Parallelitäten:

| Fenster (UTC) | Dauer | par 1 möglich | par 2 möglich |
|---|---|---|---|
| 21:36–03:59 | 383 min | 2.522 (**passt**) | 5.045 (passt) |
| 11:36–15:59 | 263 min | 1.732 (nein) | 3.464 (passt) |
| 17:36–19:59 | 143 min | 941 (nein) | 1.883 (passt) |

> **Präzisierung gegenüber #295:** Der Satz „bei Parallelität 1 trägt KEIN Fenster einen
> vollständigen Zyklus" gilt für die **tagsüber** freien Fenster. Das Nachtfenster
> 21:36–03:59 UTC (Türkei 00:36–06:59, Berlin 23:36–05:59) trägt den konservativen Zyklus
> bei Parallelität 1 rechnerisch sehr wohl (2.522 ≥ 1.812) — es scheitert am **anderen**
> Tor: dort ist **keine** der beiden Arbeitsklassen fällig (0,0 % / 0,0 %). Das Fenster ist
> also nicht zu klein, sondern leer. Die Aussage bleibt im Ergebnis richtig, ihre Begründung
> war zu grob.

### §23.3 Zwei NEUE bestätigte Lücken — und was dagegen gebaut wurde

**Lücke 1 — die Stufung war eine Stufung der Aktivierung, nicht des Tests.**
`testkohorte-betrieb.FREIGABEWORTE` trägt **sieben** Worte. Stufengenau ist davon
ausschließlich die **Aktivierung** (`aktivierung-a/-b/-c`). Provisionierung, Fachzyklus,
Deaktivierung und Scheduler-Spur gelten pauschal für alle 495; der Ablaufplan sieht den
Fachzyklus erst bei **500 aktiven Profilen** vor (Schritt 14) und die Auswertung nur
**gemeinsam** (Schritt 15).

*Folge:* Nach der Aktivierung von Gruppe A gab es keinen freigegebenen Weg, für genau diese
20 Profile einen Fachzyklus zu fahren und ihn auszuwerten. Die Sicherheitsfrage „hält der
Verdrängungsschutz unter Last?" wäre erst bei 500 gestellt worden — also genau dann, wenn
ein Fehlschlag am teuersten ist.

*Gebaut:* `lib/helmut/testkohorte-stufen.js` — **15 stufengenaue Freigaben**
(3 Stufen × 5 schreibende Vorgänge). Die Auswertung ist rein lesend und bekommt bewusst
**keine** Scheinfreigabe: eine Freigabe, die nichts schützt, entwertet die anderen. Die
Reihenfolge C nach B nach A ist erzwungen, und `bestandeneStufen` kommt aus einer Messung,
nicht aus einer Zusage. Die sieben Bestandsworte bleiben unverändert gültig; die Aktivierung
übernimmt ihr Bestandswort, statt eine zweite Wahrheit zu erfinden.

**Lücke 2 — es gab keinen Weg zur vollständigen Entfernung.**
`testkohorte-rueckbau.js` sagt es selbst: „KEIN LÖSCHPFAD IM RÜCKWEG." Als Rückweg ist das
richtig — er muss jederzeit sofort laufen dürfen, und Löschen ist keine Notbremse. Aber:

* `provisioning.teardownTenant` (über `storage.deleteTenantScopedData`) **kann** vollständig
  entfernen und ist über `isProtectedTenant` fail-closed gegen reale Mandate geschützt;
* es war an **keinen** kohortengeschützten Ausführer angeschlossen.

*Folge:* Die vollständige Entfernung der 400er-Gruppe wären **400 Einzelaufrufe von Hand**
gewesen — ohne Erlaubnisliste, ohne Stufenfreigabe, ohne Nachprüfung, bei der gefährlichsten
Operation des Vorhabens. Genau diesen Mangel hat #295 für das *Deaktivieren* behoben und für
das *Löschen* offen gelassen. Ohne Entfernung trüge Production dauerhaft 495 zusätzliche
Mandats- und 495 Identitätsprofile: die belegte Grundlinie 9/10 würde zu 504/505, und jede
spätere Zählung müsste sie von Hand herausrechnen.

*Gebaut:* `lib/helmut/testkohorte-entfernung.js` + `scripts/testkohorte-entfernung.js` mit
**sechs** Riegeln: Trockenlauf ist Standard · Erlaubnisliste **je Stufe** (eine Kennung der
falschen Stufe bricht genauso ab wie eine fremde) · eigene Stufenfreigabe · **aktive Profile
werden übersprungen, nicht gelöscht** · Nachprüfung je Zeile · leere Zielmenge ist nie ein
Erfolg. Ein nicht lesbarer Vorzustand führt fail closed **nicht** zur Löschung. Der
`restbestandsBefund` verlangt **fünf** gezählte Familien (Mandatsprofile, Identitätsprofile,
Store-Zeilen, Warteschlangenaufträge, Scheduler-Spuren) — eine nicht durchgeführte Zählung
gilt nie als Null.

### §23.4 Befund zu den Schutzgrenzen — drei von vier sind NICHT hart

Der Auftrag spricht von „Parallelität 2 mit hartem RPM-, TPM-, Kosten- und Vorrangschutz".
Am Code nachgeprüft gilt:

| Grenze | Wirkt zur Laufzeit? | Beleg |
|---|---|---|
| Tagesdeckel + Verstehens-Reserve + Vorrang real | **JA**, atomar und fail closed | `storage.reserveLlmCall` |
| `HELMUT_TESTLAUF_MAX_RPM` (82) | **NEIN** | kommt nur in `funktionstest-500.js` (Konfigurationsprüfung) und `kapazitaet-500.js` (Planung) vor |
| `HELMUT_TESTLAUF_MAX_TPM` (250000) | **NEIN** | ebenso |
| `HELMUT_TESTLAUF_KOSTENBUDGET_USD` (10,00) | **nur entdeckend** | Abbruchregel A04, ausgewertet an den Kontrollpunkten **zwischen** den Stufen |

Es existiert im gesamten `lib/helmut/` **kein Minutentakt-Begrenzer**;
`lib/helmut/azure-endpunkt.js` ist ein reiner Zieladressen-Wächter (Hostliste, Port, Länge)
und drosselt nichts. **RPM 82 und TPM 250000 sind Planungswerte, keine Drosseln** — sie zu
setzen ändert am Laufverhalten nichts. Das Kostenbudget kann innerhalb einer Stufe
überschritten und erst danach bemerkt werden. Testgesichert:
`scripts/testkohorte-stufen-test.js` Abschnitt K.

### §23.5 Die vier Lösungswege, gegeneinander bewertet

Bewertet nach den acht geforderten Kriterien. **Keiner ist heute vollständig belegbar.**

| Kriterium | (a) Mehrfenster | (b) Nur-Kohorte-Briefing | (c) Testphasensteuerung | (d) Parallelität 2 |
|---|---|---|---|---|
| Schutz der 5 realen Mandate | gut (Klassentrennung greift) | **Eingriff** in die Route, die reale Mandate bedient | **Eingriff** in `dueAt` **aller** Mandate | Vorrang greift, aber ungetestet unter Last |
| Vollständige fachliche Abdeckung | **nur mit par 2** | ja für Briefings, nicht für den Rest | ja | ja |
| Laufzeit | 263 + 143 = 406 min über 2 Fenster | ≤ 240 s je Aufruf, viele Aufrufe | wie (a) | 138 min |
| Kosten | unverändert (Bedarf ist gleich) | unverändert | unverändert | unverändert |
| Rückbaubarkeit | vollständig (nur Ablaufplanung) | Code-Rückbau + Deployment | Flag löschen, **aber** veränderte `dueAt` bleiben in `helmut_jobs` stehen | Flag löschen + Redeploy |
| Gefahr von Doppelarbeit | gering (Warteschlange idempotent) | gering (`fromCache`) | **hoch**: `idempotencyKey` ist `typ\|mandat\|fenster` — ein verschobenes `dueAt` bei gleichem Schlüssel erzeugt Zweideutigkeit | gering |
| Gefahr externer Kommunikation | Riegel greift (7 Kanäle) | Riegel greift | Riegel greift | Riegel greift |
| Abbruch und Wiederholung | sauber (Fenstergrenze erzwungen) | Teilabdeckung bleibt Teilabdeckung | unklar bei halb verschobener Warteschlange | sauber |
| **Neue Voraussetzung** | Parallelität 2 **und** Teilabdeckung akzeptieren | **neue Route oder neuer Parameter** in Production-Code | Eingriff in den Datenmotor **aller** Mandate | **ungedeckte Betreiberentscheidung**; RPM/TPM schützen dabei **nicht** (§23.4) |

**Urteil je Weg:**

* **(a) Mehrfenster** — der sauberste Weg und der einzige ohne Eingriff in Production-Code.
  Er trägt aber **nicht** bei Parallelität 1: 11:36–15:59 liefert keine Briefings (0 %), und
  17:36–19:59 trägt bei par 1 nur 941 der 1.812 nötigen Aufrufe. Er hängt damit an (d).
* **(b) Nur-Kohorte-Briefing** — verlangt einen **neuen Filterparameter oder eine neue Route**
  im Production-Code, der die fünf realen Mandate bedient. Das ist ein Deployment und eine
  Verhaltensänderung am laufenden System, für einen Test. Der Nutzen ist zudem begrenzt: es
  löst Blocker 1, nicht Blocker 2.
* **(c) Testphasensteuerung** — der gefährlichste Weg. Der Eingriff säße in
  `source-demand.js`, also im `dueAt` **jedes** Mandats, und die Idempotenzschlüssel tragen
  das Frischefenster, nicht die Phase. Rückbau ließe veränderte Fälligkeiten in der
  Warteschlange stehen. **Nicht empfohlen.**
* **(d) Parallelität 2** — löst Blocker 2 rechnerisch und macht (a) tragfähig. Aber:
  `HELMUT_VERSTEHEN_PARALLELITAET` wirkt auf die **geteilte** Verstehensarbeit, also auch auf
  die fünf realen Mandate; und die im Auftrag angenommenen harten RPM-/TPM-Grenzen existieren
  nicht (§23.4). Parallelität 2 ist damit heute **nicht ausreichend bewiesen** — sie ist eine
  Betreiberentscheidung mit offenem Restrisiko.

### §23.6 Fazit dieser Nachprüfung

**Beide Blocker bestehen unverändert.** Es wird **keine** Lösung ausgewählt und **kein**
riskanter Ersatz gebaut: der einzige rechnerisch tragfähige Ablauf (zwei Fenster bei
Parallelität 2) hängt an zwei ungedeckten Betreiberentscheidungen, von denen eine — die
Parallelität — nicht durch die angenommenen Rate-Grenzen abgesichert ist.

Geschlossen wurden stattdessen die zwei Lücken, die **vor jeder Stufe** geschlossen sein
müssen, unabhängig davon, welchen Weg der Betreiber wählt: die stufengenaue Freigabe und der
Weg zur vollständigen Entfernung.

---

## §24 · Zweiter, unabhängiger Review 02.09. — die Kapazitätsfrage ist falsch gestellt

**Vorgehen.** Nach der eigenen Nachprüfung (§23) lief ein zweiter, unabhängiger
Review-Durchgang mit getrennten Prüfern je Thema und anschließender adversarialer
Gegenprüfung. Die folgenden Befunde sind **von mir am Code nachgeprüft**, nicht ungeprüft
übernommen; eine überzogene Behauptung ist ausdrücklich als widerlegt gekennzeichnet.

### §24.1 Der schwerste Befund: 55 % des Bedarfs können im Fenster gar nicht entstehen

Die Zahl **1.812**, gegen die beide Fenster geprüft werden, enthält **1.000 mandatsgebundene
Modellaufrufe** (55,2 %). Die beiden mandatsgebundenen Arbeitsklassen der Warteschlange sind
aber ausdrücklich **KI-frei**:

* `handleMandatsProjektion` → `matching` + `decisions`, Kommentar im Code:
  *„Beides KI-frei (V3-Vertrag §13.3/§13.4)"* (`lib/helmut/scalable-pipeline.js:1113`);
* `handleBriefingMaterialization` → `buildV3Briefing`, Kommentar im Code:
  *„reine Lese-Transformation, 0 KI"* (`lib/helmut/scalable-pipeline.js:1175`).

Die gemessenen mandatsgebundenen **Modellaufrufe** (1,2–2,0 je Mandat und Tag) entstehen
nicht hier, sondern auf den Narrativ-/Bürowegen der Morgen- und Lagecrons (05:00 / 05:45 UTC)
— und die treibt der Fachzyklus ausdrücklich **nicht** an
(`funktionstest-zyklus.js:427`, `treibtMandatsgebundeneBriefingRoutenAn: false`).

**Folge, nachgerechnet:**

| Größe | Wert |
|---|---|
| Tagesbedarf gesamt (konservativ, 500) | 1.812 |
| davon mandatsgebunden — entsteht über Morgen-/Lagecron, **nicht** im Fenster | 1.000 |
| **im Fenster über `/api/cron/pipeline` erzeugbar** | **812** |
| Fenster 11:36–15:59 (263 min), Parallelität **1** | 1.732 möglich → **passt** (nötig 124 min) |
| Fenster 17:36–19:59 (143 min), Parallelität **1** | 941 möglich → **passt** (nötig 124 min) |

> **Wenn dieses Framing gilt, löst sich Blocker 2 vollständig auf — und Parallelität 2 wird
> überflüssig.** Die Hürde vergleicht heute einen **Tagesbedarf** mit einer
> **Fensterkapazität**; das ist nur dann die richtige Frage, wenn der Testlauf im Fenster
> tatsächlich den ganzen Tagesbedarf erzeugen soll. Genau das kann er bauartbedingt nicht.

**Diese Rechnung wurde NICHT in die Hürde eingebaut.** Ein Tor, das sich selbst grün rechnet,
wäre das falsche Grün, das dieses Vorhaben mehrfach beseitigt hat. Was der Testlauf im Fenster
tragen **soll**, ist eine Architekturentscheidung des Betreibers — sie ist der billigste und
wirksamste nächste Schritt, weil an ihr zwei bisher als „ungedeckt" geführte Entscheidungen
hängen.

### §24.2 Blocker 2 ist eine Eigenschaft des konservativen Szenarios

Auch ohne §24.1: von den 1.812 stammen 1.000 aus
`SZENARIEN.konservativ.mandatsgebundenJeMandat = 2,0`. Der **gemessene** Wert steht als
`MESSWERTE.mandatsgebundenJeMandatProTag = 1,2` im selben Modul (42 Aufrufe / 7 Tage /
5 Mandate) und wird vom Erwartungsszenario benutzt.

| Faktor | Bedarf | Minuten bei par 1 | passt in 263 min |
|---|---|---|---|
| 1,2 (**gemessen**) | 1.412 | 215 | **ja** |
| **1,84 (Kipppunkt)** | 1.732 | 263 | ja (exakt) |
| 2,0 (konservativ) | 1.812 | 276 | nein |

Das ist **kein Defekt** — ein konservatives Szenario darf pessimistischer rechnen als die
Messung. Es ist aber eine Tatsache, die der Betreiber kennen muss: **Blocker 2 ist keine
gemessene Größe, sondern eine Szenarioentscheidung.** Testgesichert:
`scripts/testkohorte-stufen-test.js` Abschnitt N.

### §24.3 Blocker 1 — präzisiert, und eine Lücke in seiner Absolutheit

**Präzisierung:** Die im Fenster gesperrte Arbeitsklasse `briefing_materialization` erzeugt
`buildV3Briefing` — **0 KI**. Der Direktpfad `/api/cron/lage-briefing` erzeugt dagegen das
Lage-**Narrativ** (`tenant_narrative`, mit KI). Beide sind also nicht nur „nicht
gleichwertig", sie erzeugen **verschiedene Erzeugnisse**. Wer den Direktpfad als Ersatz nimmt,
prüft eine andere Produktstufe als die, die der Test messen soll.

**Lücke in der Absolutheit:** Der Satz „über die Warteschlange entsteht im Fenster kein
Briefing" gilt streng nur für Aufträge, die **im laufenden Fenster geplant** wurden. Ein
`briefing_materialization`-Auftrag eines **vorigen** Fensters, der noch `wartend` ist, ist zu
jeder Uhrzeit fällig und würde im Fenster reserviert. Die Bereinigung löscht ausschließlich
`status='erledigt'`. Für den Testlauf ist das eher Chance als Risiko — es heißt aber, dass die
Aussage eine Bedingung trägt, die bisher nicht genannt war.

### §24.4 Weitere bestätigte Befunde

| Befund | Schwere | Beleg |
|---|---|---|
| **Zwischen und nach den Fenstern treiben Bestandscrons dieselbe Warteschlange über dieselben 500 aktiven Profile** (16:00 pipeline, 20:00 crawl). Die Fensterlogik schützt nur den MANUELLEN Lauf. | hoch | `server.js` `cronSchwererPfad` → `runCronUeberWarteschlange` |
| **Parallelität 2 ist mit den acht vorbereiteten Werten gar nicht herstellbar** — `HELMUT_TESTLAUF_MAX_PARALLEL` ist eine reine Prüfgröße; die wirksame Parallelität hängt an `HELMUT_VERSTEHEN_PARALLELITAET` und weiterem. | blockierend | `HELMUT_TESTLAUF_MAX_PARALLEL` kommt nur in `kapazitaet-500.js` und `funktionstest-500.js` vor |
| **Der Kommunikationsriegel wäre bei zwei Fenstern rund 8,4 h scharf statt 4,4 h** — er blendet in dieser Zeit auch Alarme der fünf realen Mandate aus. | mittel | 11:36–19:59 = 503 min gegen 263 min |
| **Der Rückbau lässt Warteschlangenreste der Kohorte stehen** — kein Kohortenwerkzeug rührt `helmut_jobs` an (0 Treffer). | mittel | testgesichert, Abschnitt O4 |
| **`sortiereRealZuerst` sortiert, filtert aber nicht**, und behandelt `unbestimmt` wie real — als Grundlage einer Begrenzung wäre das fail-open. | mittel | `lib/helmut/mandatsklasse.js:113–119` |
| **Ein Kohortenlauf unter demselben `cronName` verschmutzte die Fairness-Buchführung der realen Mandate.** | hoch (für Weg b) | `lib/helmut/cron-fairness.js:307–326` |
| **Die Briefing-Cronrouten lesen keinen einzigen Query-Parameter**, und `resolveCronTenants` ist ausdrücklich ohne Auswahl gebaut („KEIN Environment, KEIN Flag, KEIN über Environment ausgewählter Einzelmandant"). | hoch (für Weg b) | `lib/helmut/tenant-context.js:113–125` |

### §24.5 Eine Behauptung ausdrücklich widerlegt

Ein Prüfer meldete: *„Eine fachlich gescheiterte Scheibe gilt als Erfolg — die Zusage ‚eine
fehlgeschlagene Scheibe beendet den Lauf' greift nicht."* **Das ist in dieser Form falsch.**
`funktionstest-zyklus.js` bricht bei `!gut` ausdrücklich ab
(`abgebrochen = "scheibe-fehlgeschlagen"; break;`), und `ok` verlangt zusätzlich
`fehlgeschlagen === 0 && erfolgreich > 0`.

**Richtig ist der engere Kern:** `antwort.ok` ist der **HTTP-Status**. Eine Scheibe, die
HTTP 200 liefert, deren Körper aber fachliche Fehlschläge meldet, zählt als Erfolg. Diese
Grenze ist jetzt **im Ergebnisobjekt benannt** (`abbruchEbene: "http"`,
`fachlicheBewertungDurch: "funktionstest-kontrolle (A01–A15…)"`) statt stillschweigend zu
gelten. Sie wurde **nicht** stillschweigend erweitert: welche Felder des Antwortkörpers einen
fachlichen Fehlschlag bedeuten, ist ein Vertrag der Route, der hier nicht belegt ist — ihn zu
erraten wäre genau die Sorte Annahme, die dieses Vorhaben schon zweimal teuer bezahlt hat.

### §24.6 Zwei Defekte des Tors, behoben

1. **`pruefeKonfiguration()` gab das Feld `gelesen` nie zurück**, während `startbereitschaft()`
   genau `konfig.gelesen.maxParallel` und `konfig.gelesen.maxAnfragenJeMinute` las. Beide
   Zugriffe liefen ins Leere: die Zyklushürde rechnete **immer** mit Parallelität 1 und ohne
   Minutengrenze. Die Richtung war die sichere (zu streng, nie zu lax) — falsch war sie
   trotzdem: eine Betreiberentscheidung für Parallelität 2 wäre im Tor wirkungslos geblieben,
   ohne Hinweis.
2. **`arbeitsklassenImFenster()` rechnete mit fest eingebauten 24 Stunden**, und kein Aufrufer
   übergab etwas anderes. Der Motor liest die Breite aus `HELMUT_DEMAND_TENANT_MAX_AGE_H`
   (`source-demand.fensterKonfig`). Wäre die Variable je gesetzt worden, hätten Tor und Motor
   still mit verschiedenen Phasenfenstern gerechnet — genau das, was der Kommentar im Tor
   ausschließen wollte.

Beide behoben, beide regressionsgesichert (`testkohorte-stufen-test.js` Abschnitt M).

---

## §25 · Nachtrag zum zweiten Review — Parallelität, Vorrangschutz, Weg (c)

### §25.1 „Parallelität 2" ist als Betreiberentscheidung unterbestimmt

Im Warteschlangenpfad wirken **zwei multiplikative Parallelitätsebenen**, und das
Kapazitätsmodell kennt nur **eine**:

| Ebene | Variable | Heute | Bei „Parallelität 2" |
|---|---|---|---|
| Worker | `HELMUT_WORKER_PARALLEL` (Default **2**, 1–8) | 2 | 2 |
| Verstehen | `HELMUT_VERSTEHEN_PARALLELITAET` (ungesetzt ⇒ 1) | 1 | 2 |
| **Wirksame Gleichzeitigkeit der Modellaufrufe** | — | **2** | **4** |

`kapazitaet-500.zyklusPasstInsFenster({parallel})` rechnet mit **einem** Faktor. Die Frage
„soll Parallelität 2 freigegeben werden?" ist deshalb nicht eindeutig beantwortbar, solange
nicht gesagt ist, **welche** Ebene gemeint ist und was das für die andere bedeutet.

Weiter belegt:

* **`HELMUT_VERSTEHEN_PARALLELITAET` wirkt ausschließlich in `runUnderstandingShadow`** — also
  auf die **geteilte** Verstehensarbeit, die auch die fünf realen Mandate versorgt. Eine
  Erhöhung lässt sich **nicht** auf die 495 synthetischen Profile beschränken.
* Die vier dedizierten Verstehens-Cronslots (05:30, 21:30, 11:30, 17:30 UTC) laufen
  unverändert seriell — Parallelität 2 beschleunigt sie **nicht**.
* **RPM 82 bindet rechnerisch erst ab Parallelität ~13.** Bei Parallelität 2 liegt die Last bei
  13,2 Anfragen/min (16 % der TPM-verträglichen 82 RPM, 5 % des Azure-Kontingents 250 RPM) und
  bei 39.754 von 250.000 Token/min (16 % TPM). Die im Auftrag angenommenen Rate-Grenzen sind
  bei Parallelität 2 also nicht nur unwirksam (§23.4) — sie wären selbst dann nicht bindend,
  wenn es sie gäbe.
* Die einzigen **instanzübergreifend** gebauten Begrenzer (`HELMUT_ANBIETER_STEUERUNG`,
  `HELMUT_KLASSEN_GRENZEN`) sind dokumentiert **AUS**.

### §25.2 Schutzbeleg der fünf realen Mandate — ehrlich formuliert

Der Verdrängungsschutz aus #295 ist **gebaut**, aber **heute nicht wirksam**. Die Funktion sagt
es selbst (rein lesend geprüft, Umgebung leer):

> `HELMUT_TESTLAUF_VORRANG_REAL` ist nicht gesetzt — die realen Mandate haben **KEINEN**
> wirksamen Verdrängungsschutz im KI-Tagesbudget. Für den 500er-Funktionstest ist das ein
> Startblocker.

**Das ist heute kein Risiko**, sondern eine Vorbedingung: bei **0 synthetischen Zeilen**
(rein lesend bestätigt 02.09.) gibt es nichts, was verdrängen könnte. Der Schutz wird in genau
dem Moment nötig, in dem das erste synthetische Profil aktiv wird — und er ist bis dahin zu
setzen.

Der Schutzbeleg lautet damit dreiteilig, und alle drei Teile gehören zusammen:

1. **Strukturell:** vier Schutzregeln auf `mandatsklasse.js`, bei 0 synthetischen Zeilen
   byte-identisch zum Vorzustand (testgesichert).
2. **Laufzeitwirksam:** der Tagesdeckel wird atomar und fail closed reserviert
   (`reserveLlmCall`) — das ist die einzige harte Grenze (§23.4).
3. **Heute inaktiv:** die Vorrangreserve ist **0**, weil die Variable nicht gesetzt ist.
   `startbereitschaft()` führt genau das als eigene Hürde und meldet deshalb — zusätzlich zu
   den beiden strukturellen Blockern — nicht startbereit.

Eine schon bekannte Einschränkung bleibt bestehen: das `llmUsage`-Protokoll wird unbedingt
zurückgeschrieben (Lese-Ändere-Schreibe, `CLAUDE.md` §4.10). Das trifft **nicht** das Budget —
das ist atomar —, sondern die **Meldung**: Kostenbilanz und Aufrufzählung. Die Ursache ist seit
§23 des Vorsprints belegt; die relationale Ablage (Migration `20260902121500`, **nicht
angewendet**) ist der vorbereitete Ausweg.

### §25.3 Weg (c) — zusätzlich zu §23.5 belegt

Der Eingriffsort wäre klein (eine Phasenliste, ein Produktionsaufrufer), und die `dueAt`-Werte
der fünf realen Mandate blieben **gemessen** unverändert. Trotzdem bleibt (c) der schlechteste
Weg, und zwar aus vier belegten Gründen:

1. **Er beseitigt höchstens EINE der beiden Hürden.** Die Kapazitätshürde rechnet gegen einen
   Tagesbedarf und kennt die Phasenlage überhaupt nicht — eine Phasenverschiebung ändert dort
   keine einzige Zahl.
2. **Er erzeugt für die Kohorte genau den Reihenfolgefehler, gegen den die Phasen gebaut
   wurden:** verschoben würde nur die zweite Hälfte der Kette (Projektion/Briefing), nicht die
   erste (Abruf/Verstehen). Für einen erheblichen Teil der Kohorte kehrte sich damit die
   Reihenfolge um.
3. **Die Vorbedingungssperre macht die verschobenen Briefings voraussichtlich wirkungslos:**
   solange im selben Fenster noch ein geteilter Abruf oder ein Verstehensauftrag offen ist —
   der Normalfall eines 500er-Lasttests —, stellt sich jedes fällige Briefing zurück.
4. **Der Rückbau räumt nichts ab.** Nach dem Entfernen der Variable behalten alle während der
   Scharfschaltung erzeugten synthetischen Aufträge ihr verschobenes `dueAt`, und es gibt
   keinen mandatsgenauen Räumweg.

Dazu kommen **drei** freigabepflichtige Production-Vorgänge (Merge/Deployment, Variable setzen
+ Redeploy, Variable löschen + Redeploy) am **live geschalteten Planer der realen Mandate**.
**Weg (c) bleibt nicht empfohlen.**

---

## §26 · Die Frage „05:45/05:48" — offline entschieden, soweit sie offline entscheidbar ist

**Zwei Fragen stecken in einer.** `CURRENT_STATE.md` führt „05:45/05:48" seit dem
Korrektursprint als offen. In dieser Formulierung stecken aber zwei verschiedene Fragen, und
nur eine davon braucht einen Production-Lauf:

| Frage | Status |
|---|---|
| (a) Tritt die Überschneidung **heute** auf? | **Offline entschieden: NEIN** (§26.1) |
| (b) Ist gleichzeitiger Betrieb unbedenklich? | **Bleibt offen** — verlangt den Aktivierungsnachweis |

### §26.1 Eine Auftragsannahme ist zu korrigieren: „05:48" ist kein regulärer Ablauf

Um **05:45 UTC** (Türkei 08:45, Berlin 07:45) läuft `/api/cron/lage-briefing`. Um
**05:48 UTC läuft heute NICHTS.** Der 05:48-Slot entsteht ausschließlich aus dem
**vorbereiteten, nicht aktivierten** Minimal-Cron-Rhythmus `18,48 * * * *`
(`lib/helmut/minimal-cron.js`) — und der steht nicht in `vercel.json` (gemessen).

Weiter gemessen, gegen die tatsächliche Konfiguration gerechnet (`maxDuration` aus
`vercel.json` gelesen, nicht abgeschrieben):

| Größe | Wert |
|---|---|
| Crons in `vercel.json` | **13** |
| Harte Plattformgrenze jeder Cron-Route | **300 s = 5 min** |
| Kleinster Startabstand zweier Bestandscrons | **10 min** (06:00 `health-report` → 06:10 `lage-briefing-nachlauf`), Tagesübergang mitgerechnet |
| **Überschneidung zweier Bestandscrons heute möglich?** | **NEIN** — 10 min Abstand gegen 5 min Grenze |

**Das ist eine gerechnete Aussage, keine Annahme.** Testgesichert durch die neue Suite
`scripts/cron-ueberschneidung-test.js` (**16/0**), die gegen `vercel.json` rechnet: ändert
jemand einen Cron oder die Laufzeitgrenze, wird sie rot statt still falsch.

### §26.2 Was wäre, wenn der Minimal-Cron aktiv wäre

Dann gäbe es **genau zwei** Überschneidungspaare, beide unter der Plattformgrenze und damit
real:

| Paar | Abstand |
|---|---|
| `lage-briefing` 05:45 → Slot 05:48 | 3 min |
| Slot 06:18 → `lage-briefing-nachlauf` 06:22 | 4 min |

### §26.3 Was dabei ausdrücklich NICHT gezeigt ist

* **Es gibt keine Sperre zwischen verschiedenen Cron-Pfaden.** Alle Sperren sind namensbasiert
  und wirken nur gegen Aufrufer desselben Namens; die relevanten Namensräume sind disjunkt.
* **Die reale Gefahr wäre nicht Doppelarbeit, sondern der gemeinsame `helmut_store`-Blob.**
  Beide Pfade schreiben am Laufende ihre Prozesstelemetrie über `recordProcessRun`, und das
  liest den ganzen Blob, hängt an und schreibt zurück (Last-Write-Wins, `CLAUDE.md` §4.10).
  Der KI-Tagesdeckel dagegen wird atomar reserviert und kann nicht überschritten werden;
  doppelte KI-Arbeit am selben Vorgang schließt die CAS-Reservierung mit Fencing aus.
* **Der Actions-Watchdog ist der einzige Akteur, der 05:45 heute tatsächlich überschneiden
  könnte** — er ist kein Vercel-Cron, löst aber eine echte Production-Route aus, startet
  nominell 05:30 UTC und ist belegt oft 2–3 h verzögert. Die Überschneidungsrechnung sieht ihn
  bauartbedingt **nicht** (sie bekommt nur `vercel.json`-Crons).
* **Frage (b) bleibt offen** und wird hier nicht behauptet. Sie verlangt einen Production-Lauf
  mit aktivem Minimal-Cron — und der ist nicht freigegeben.
