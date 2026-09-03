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

---

## §27 · Telemetrie für die Auswertung — der blinde Fleck der Vollständigkeitsprüfung

**Frage.** Genügen die bestehenden relationalen Vorbereitungen für die Auswertung des
500er-Tests, **ohne** die Migration `20260902121500` anzuwenden und **ohne**
`HELMUT_LLM_USAGE_RELATIONAL` zu aktivieren?

### §27.1 Der Vorbereitungsstand ist sauber

* **Flag AUS ist ein vollständiger No-Op.** Ohne Flag und ohne Migration wird der relationale
  Zweig gar nicht betreten; der Blob-Schreibweg ist byte-identisch zum bisherigen Stand.
* Die Migration ist **rein additiv** (fünf Spalten, drei Indizes auf einer **bestehenden**
  Tabelle) und durch einen Existenz-Guard geschützt. Das Rollback nimmt Struktur und Indizes
  vollständig zurück; nicht zurückgenommen wird die Rechteentziehung — also die
  **restriktive** Richtung, was hinnehmbar ist.
* **Offene Lücke:** die Basis-Spaltenstruktur von `public.llm_usage` ist im Repository nirgends
  definiert. Für zwölf der geschriebenen Spalten existiert weder eine anlegende Migration noch
  ein Schema-Nachweis — der Dual-Write ist insoweit **unbewiesen**. Das ist heute folgenlos
  (Flag AUS), wäre es aber nicht mehr, sobald jemand Schritt 19/20 des Ablaufplans freigibt.

### §27.2 Reicht der Ring von 5.000 für die Auswertung? Je Stufe getrennt

| Stufe | aktiv (synthetisch + 5 real) | Bedarf/Tag (konservativ) | Ringreichweite |
|---|---|---|---|
| **A** | 20 + 5 = 25 | 591 | ~8,5 Tage |
| **B** | 95 + 5 = 100 | 733 | ~6,8 Tage |
| **C** | 495 + 5 = 500 | 1.812 | **~2,8 Tage** |

**Für einen einzelnen Testtag reicht der Ring in jeder Stufe** — ein Tag der Stufe C belegt
36 % der 5.000 Plätze. **Eine gemeinsame Auswertung über die ganze Stufenkette reißt dagegen
ab Tag 3–5.** Wer die drei Stufen zusammen auswerten will, braucht die relationale Ablage.

> **Nebenbefund:** Der Codekommentar in `storage.js`, der Tagesanfall liege bei 500 Profilen
> „in derselben Größenordnung 100× höher" und der Ring sei „in unter zwei Tagen gefüllt", ist
> um **Faktor 3–7 überhöht**. Er unterstellt lineares Wachstum mit der Mandatszahl — genau das
> schließt das eigene kanonische Modell aus (`kapazitaet-500.js`: der geteilte Katalog wächst
> nicht mit, nur profilgetriebene Quellen und Personensuchen). Die Richtung des Kommentars
> stimmt, seine Zahl nicht.

### §27.3 Der eigentliche Riss: ein Lost Update ist strukturell unsichtbar

Die Vollständigkeitsprüfung (`blobFensterVollstaendig`, `werteNutzungslogAus`) entscheidet über
**genau zwei** Größen: die **Länge** der Liste und den **ältesten** Eintrag.

Ein **Lost Update** — zwei gleichzeitige Läufe lesen denselben Blob, hängen je einen Eintrag an
und schreiben unbedingt zurück (`CLAUDE.md` §4.10; die Ursache ist seit dem Sprint vom 01.09.
belegt) — entfernt aber einen **jüngeren** Eintrag aus der Mitte. **Die Länge bleibt bei 5.000,
der älteste Eintrag bleibt derselbe: beide Prüfungen melden weiterhin „auswertbar".**

**Experimentell nachgewiesen** (`scripts/testkohorte-stufen-test.js`, Abschnitt Q): ein
nachgebauter Ring mit einem verlorenen jüngeren Eintrag und unveränderter Länge wird von der
Prüfung als auswertbar gemeldet. Eine echte Fensterkürzung wird dagegen korrekt fail closed
zurückgewiesen.

Das ist **kein neuer Defekt** — es ist die bekannte `CLAUDE.md`-§4.10-Verletzung, gesehen aus
der Perspektive der Prüfung, die sie eigentlich auffangen sollte. Es wäre falsch, aus
`auswertbar: true` zu schließen, dass kein Eintrag verloren ging. Das Ergebnisobjekt sagt das
jetzt ausdrücklich (`verlustErkennung: "keine"` mit Begründung), statt es dem Leser zu
überlassen.

**Ein Nachweis dafür braucht einen vom Listeninhalt unabhängigen Zähler** — also genau die
relationale Ablage oder ein bedingtes Schreiben. Beides bleibt freigabepflichtig und ist in
diesem Sprint **nicht** geschehen.

### §27.4 Größenordnung des Lese-Ändere-Schreibe-Objekts

Bei vollem Ring ist das Objekt, das **jeder einzelne KI-Aufruf** liest und zurückschreibt, rund
**2,9 MiB** groß. Bei 1.812 Aufrufen am Tag sind das grob **10 GiB Lese- und Schreibverkehr
pro Tag über eine einzige `helmut_store`-Zeile** — zusätzlich zu allem anderen, was in
derselben Zeile liegt. Das ist keine Sicherheits-, sondern eine Betriebs- und Kostenfrage, und
sie gehört zu den Größen, die der Mehrtagesbetrieb erst beantworten kann.

### §27.5 Urteil

**Für die Auswertung EINES Testtags je Stufe genügt die heutige Telemetrie** — A01/A06 rechnen
über dem Ring und melden eine Ringkürzung nachweislich fail closed; A04 (Kosten) hängt als
einzige Regel gar nicht am Ring, sondern am atomaren relationalen Tageszähler.

**Für eine stufenübergreifende Mehrtagesauswertung genügt sie nicht**, und der Lost Update
bleibt in jedem Fall unsichtbar. Die Migration **nicht** anzuwenden ist für den Testlauf
selbst richtig; wer die Stufenkette gemeinsam auswerten will, braucht die beiden getrennten
Freigaben (Schritte 19/20).

---

## §28 · Der 400er-Rückbau — drei Defekte im eigenen Diff, behoben

**Der wichtigste Abschnitt dieses Sprints.** Die adversariale Gegenprüfung richtete sich
ausdrücklich auch gegen das, was in diesem Sprint **neu gebaut** wurde — und sie fand dort drei
Defekte. Alle drei sind behoben und regressionsgesichert
(`scripts/testkohorte-stufen-test.js`, Abschnitt R).

### §28.1 Der „Teardown" legte Zeilen an, statt sie zu entfernen

`storage.deleteTenantScopedData` schrieb den leeren Mandanten-Store **unbedingt** zurück:

```js
await writeStore(defaultPoliticianStore(), pKey(uid));   // Upsert, kein Löschen
```

Für eine Kennung **ohne** bestehenden Mandanten-Store legte der Teardown die Zeile damit
**erst an**. Eine „vollständige Entfernung" der 400er-Gruppe hätte so **400 zusätzliche
Dauerzeilen** in `helmut_store` hinterlassen — also genau das Gegenteil ihres Zwecks, und
genau die Zahl, die der Restbestandsbefund dann als „nicht vollständig entfernt" gemeldet
hätte, ohne dass jemand die Ursache gekannt hätte.

**Behoben** mit derselben Bedingung, die die Schwesterfunktion `deleteProfileData` zwei
Funktionen weiter oben bereits benutzt (*„Politiker-Store nur leeren, wenn er überhaupt Daten
trägt"*): eine nicht vorhandene Zeile liefert den Standard-Store ohne Inhalte, und der
Schreibvorgang entfällt. Der Fix folgt damit einem im Repository etablierten Muster und ist
kein neuer Entwurf.

### §28.2 Ein Teilfehler des Teardowns wurde verschluckt

`teardownTenant` liefert `ok: false` genau dann, wenn `deleteTenantScopedData` einen
**Teil**fehler hatte — typischerweise Restzeilen der Auth-Löschung. Das Profil ist dann weg,
die Reste bleiben stehen.

Der neue Entfernungsausführer prüfte nach dem Schreiben nur `vorhanden === false` und zählte
diesen Fall als **entfernt**. Ein Lauf konnte damit `ok: true` und `0 fehlgeschlagen` über
einer **unvollständigen** Entfernung melden — dieselbe Sorte falsches Grün, gegen die dieser
Ausführer gebaut wurde.

**Behoben:** ein Schreibfehler ist jetzt **immer** ein Fehlschlag, auch wenn die Zeile, auf die
gelesen werden kann, verschwunden ist. Der Zustand heißt dann ausdrücklich
`teilweise-entfernt-schreibfehler` statt `entfernt`.

### §28.3 Die CLI meldete Erfolg über einem gescheiterten scharfen Lauf

Der Bibliotheksvertrag war ehrlich (`ok: false` bei leerer Zielmenge), die
**Prozessschnittstelle** nicht: ein scharfer Lauf mit `ok: false` beendete sich mit
**Exitcode 0**. Ein Aufruf wie

```
node scripts/testkohorte-entfernung.js --stufe=c --scharf --ids=,,  &&  echo FERTIG
```

hätte „FERTIG" gemeldet, ohne eine einzige Zeile entfernt zu haben. Wer den Rückbau skriptet,
wäre genau daran vorbeigelesen.

**Behoben:** ein **scharfer** Lauf ohne bestätigten Erfolg endet mit Exitcode 1, und eine leere
Zielmenge wird dabei ausdrücklich als Aufrufparameterfehler benannt. Der **Trockenlauf** bleibt
Exitcode 0 — er ist der Normalfall, kein Fehler.

### §28.4 Was der Rückbau weiterhin NICHT abräumt

Mindestens elf mandatsbezogene Ablagen überleben die Entfernung. Der Pfad deckt die relationale
Profil- und Inhaltsebene ab (17 Kindtabellen plus `profiles` plus Auth-Blob), **nicht** die
Warteschlangen-, Telemetrie- und Wissensebene. Namentlich:

* `helmut_jobs` (trägt bei mandatsgebundener Arbeit die Kennung) und `helmut_job_outbox`
* `crawl_runs.politician_id`
* die **Rohdaten der Personenquelle** im geteilten `main`-Blob: die synthetischen Mandate
  erzeugen ihre Personenquelle zur Laufzeit aus dem Profil (`scheduler.personNewsSource`,
  `CLAUDE.md` §4.2); die entstehenden Rohdaten tragen `sourceId = "test-kohorte-…-news"`,
  aber **keine** `politicianId` — der auf `politicianId` gescopte Filter greift dort nicht.

**Das ist nicht verschwiegen, sondern erzwungen sichtbar:** der `restbestandsBefund` verlangt
fünf **gezählte** Familien (darunter `warteschlangenAuftraege` und `storeZeilen`) und meldet
jede Restzeile als **nicht vollständig entfernt**. Eine nicht durchgeführte Zählung gilt nie
als Null.

**Offen bleibt** — ehrlich als Lücke ausgewiesen, nicht als erledigt:

1. Für drei der fünf Restbestandsfamilien existiert **keine Erhebungs-SQL**. Der Betreiber
   müsste sie von Hand schreiben; der Riegel ist damit korrekt fail closed, aber praktisch
   noch nicht bedienbar.
2. Es gibt **keinen Räumweg** für die Warteschlangenreste (`helmut_jobs`) und die
   Personenquellen-Rohdaten.
3. Der Lauf über 400 Kennungen erzeugt rund **10.800 sequentielle Requests**, davon etwa 1.200
   Schreibvorgänge auf **drei gemeinsam genutzte Zeilen** (`main`, `main-auth`,
   `main-cron-fairness`) — beim Lese-Ändere-Schreibe-Muster derselbe Wettlauf wie in §27.3.
4. Es gibt **keine Fortschrittsanzeige und keine Wiederaufnahmehilfe**. Bricht der Lauf bei
   Kennung 200 ab, weiß der Betreiber nicht, welche 200 erledigt sind. Fachlich ist der Lauf
   sauber wiederholbar (idempotent), betrieblich ist er blind.

---

## §29 · Korrektur zu §24.1 — die Rechnung stimmt, die Begründung war falsch

**Dieser Abschnitt nimmt eine eigene Aussage teilweise zurück.** Die adversariale
Gegenprüfung dieses Sprints hat §24.1 widerlegt — nicht in den Zahlen, sondern in der
Kausalkette. Ein überzogener Befund ist so unehrlich wie ein verschwiegener; deshalb steht die
Rücknahme hier, und nicht als stille Umformulierung.

### §29.1 Was bestätigt bleibt

* Die Zerlegung **702 + 1.000 + 100 + 10 = 1.812** und der Anteil **55,19 %** sind exakt
  nachgerechnet.
* `mandate_projection` und `briefing_materialization` sind **belegt KI-frei** — strukturell
  nachgeprüft, nicht nur am Kommentar: `matching.js` und `decisions.js` laden kein KI-Modul,
  `buildV3Briefing` enthält keinen Modellaufruf.
* Blocker 2 ist szenarioabhängig (Kipppunkt 1,84), und die Grenzen RPM/TPM sind keine Drosseln.

### §29.2 Was FALSCH war und zurückgenommen wird

**Die Behauptung, die 1.000 mandatsgebundenen Modellaufrufe könnten im Testfenster gar nicht
entstehen, ist nicht belegt.** Die Kausalkette war falsch verknüpft:

Die 1.000 stammen **nicht** aus `mandate_projection`/`briefing_materialization`, sondern aus
`MESSWERTE.mandatsgebundenJeMandatProTag`. Deren Messgrundlage nennt das Modul selbst
(`kapazitaet-500.js:318`): **390 `communicationDraft`-Aufrufe** gegen 238 `lageBriefing`-Aufrufe.
`communicationDraft` ist

* ein **echter** Modellaufruf (`ai.js:299`, `requestJson`, `callType: "communicationDraft"`),
* **mandatsgebunden** (`politicianId: profile?.id`),
* und wird über **`POST /api/communication/generate`** ausgelöst (`server.js:823–827`) — eine
  **nutzergetriebene HTTP-Route** mit einer Ratengrenze von 18/Stunde und **ohne jede
  Fensterbindung**.

Er kann also in **jedem** Fenster entstehen. Damit ist der dominierende Posten der 1.000 genau
**nicht** fensterfrei im behaupteten Sinne.

**Folge:** Die Zahl **812 darf NICHT als Fenstergröße eingesetzt werden.** Sie kippt beide
Fenster schon bei Parallelität 1 auf „passt" (1.732 bzw. 941 möglich) und erzeugte damit
genau das falsche Grün, gegen das dieser Abschnitt geschrieben war.

> **Was die Entscheidung gerettet hat:** §24.1 hat die Zahl ausdrücklich **nicht** in die
> Hürde eingebaut. Diese Zurückhaltung war richtig — und sie ist der Grund, warum aus einem
> falsch begründeten Befund kein falsches Grün geworden ist.

Ergänzend zur Belastbarkeit: 812 ist bei Parallelität 1 auch rechnerisch **grenzwertig**, nicht
komfortabel. Unter Berücksichtigung der Scheibenreserven (Planungsbudget, Abschlussreserve,
Scheibenpause) liegt die reale Spanne bei etwa **660–840** Aufrufen je Fenster — 812 liegt
darin, im ungünstigen Fall also **darunter**.

### §29.3 Der stärkere Befund, der stattdessen gilt: das Tor prüft die falsche Bedingung

Die Gegenprüfung hat dafür einen **besser belegten** Befund geliefert:

| Ebene | Bedingung |
|---|---|
| **Motor** (Warteschlange) | `where j.status = 'wartend' and j.due_at <= v_now` — **Fälligkeit** |
| **Tor** (`arbeitsklassenImFenster`) | `ueberlapp = max(0, min(bis, phaseBis) − max(von, phaseVon)) > 0` — **Schnittmenge mit dem Streuintervall** |

Das sind **verschiedene Fragen**, und sie fallen auseinander, sobald ein Fenster **nach** einer
Phase liegt. Ein Auftrag mit `dueAt` in 18:00–21:36, der noch nicht abgearbeitet ist, ist um
22:00 **fällig** — das Tor meldet für ein Fenster ab 21:36 aber Überlappung 0 und damit
„nicht fällig".

**Gemessen:** Für das Fenster **21:36–03:59 UTC** (Türkei 00:36–06:59, Berlin 23:36–05:59)
meldet das Tor `sichtbareProduktstufeErreichbar = false` — und genau dieses Fenster ist das
**einzige**, das das Kapazitätstor bei **Parallelität 1** besteht (383 min → 2.522 möglich
≥ 1.812 nötig).

> **Wenn dieser Modellfehler zutrifft, verwirft das Tor als einziges das Fenster, das beide
> Tore bei Parallelität 1 tragen könnte — und die Forderung nach Parallelität 2 wie auch der
> Zwei-Fenster-Ablauf wären überflüssig.**

Die Fehlerrichtung ist **ausschließlich fail closed**: `ueberlapp > 0` setzt voraus, dass ein
Teil des Streuintervalls im Fenster liegt; dann werden dort tatsächlich Aufträge fällig. Ein
falsches Grün kann daraus **nicht** entstehen. Der Schaden ist eine falsche
Betreiberempfehlung und ein blockiertes, womöglich taugliches Fenster.

### §29.4 Warum das Tor in diesem Sprint trotzdem NICHT geändert wurde

Die naheliegende Korrektur — Fälligkeit statt Schnittmenge — ist **nicht** so einfach, wie sie
aussieht, und eine Änderung würde einen der beiden Blocker aufheben. Das ist zu folgenreich für
eine unbelegte Annahme:

1. **Das Nachtfenster überschreitet 00:00 UTC**, also die Grenze des 24-Stunden-Frischefensters
   (`fensterKennung`). Vor Mitternacht sind die Aufträge des laufenden Fensters fällig, danach
   beginnt ein **neues** Fenster mit **neu geplanten** Aufträgen. „100 % fällig" ist damit
   keine gesicherte Aussage, sondern selbst eine Annahme.
2. Ob ein Briefingauftrag am Abend tatsächlich noch **offen** ist, hängt davon ab, ob der
   20:00-Crawl-Cron ihn bereits abgearbeitet hat — er treibt dieselbe Warteschlange an.
3. Die **Vorbedingungssperre** (`vorbedingungOffen`) stellt ein fälliges Briefing zurück,
   solange im selben Fenster noch Abruf- oder Verstehensarbeit offen ist — im 500er-Lasttest
   der Normalfall.

**Urteil:** Der Modellfehler ist **bestätigt und belegt**; die daraus folgende Aussage „das
Nachtfenster trägt beide Tore" ist **plausibel, aber nicht bewiesen**. Sie zu unterstellen und
die Hürde entsprechend zu drehen, wäre dieselbe Sorte Fehler wie die 812. Der Befund gehört
deshalb als **benannte, offene Frage** in die Betreiberentscheidung — und er ist die
aussichtsreichste davon, weil er als einziger beide Blocker **ohne** zusätzliche Freigabe
auflösen könnte.

### §29.5 Was daraus für die nächste Freigabe folgt

Die in §24.1 formulierte Frage bleibt richtig, ihre Begründung ändert sich:

> **Nicht** „812 statt 1.812" — sondern: **Welcher Anteil des Tagesbedarfs ist im gewählten
> Fenster überhaupt erzeugbar, und prüft das Tor Fälligkeit oder Streuintervall?**

Beides ist heute unbeantwortet, beides ist ohne Production-Lauf klärbar, und an beidem hängen
die bisher als „ungedeckt" geführten Entscheidungen.

---

## §30 · Betreiberentscheidung 02.09. — das Startfenster-Tor prüft ab jetzt FÄLLIGKEIT

**Entscheidung des Betreibers (02.09.):** Das Startfenster-Tor prüft die Fälligkeit, genau wie
der Warteschlangenmotor. Maßgeblich ist, ob ein Auftrag nach `due_at <= jetzt` vom Motor
beansprucht werden kann. Die bisherige Prüfung einer bloßen **Schnittmenge** zwischen
Testfenster und Streuintervall beschreibt nicht das tatsächliche Verhalten des Motors und
dient nicht länger als Startentscheidung.

Die Entscheidung ist ausdrücklich **kein** Auftrag, pauschal „100 Prozent fällig" einzubauen.
Die neue Prüfung ist datumsgenau, kohortengenau, reproduzierbar und fail closed.

### §30.1 Welche Aussage ersetzt wurde

| | bisher (§29.3) | ab jetzt |
|---|---|---|
| Frage des Tores | Wird in diesem Fenster ein Auftrag **erstmals** fällig? | Kann der Motor in diesem Fenster einen Auftrag **beanspruchen**? |
| Formel | `ueberlapp(Fenster, Streuintervall) > 0` | `dueAt <= Fensterende` je Auftrag |
| Datenquelle | Phasenanteile aus `MANDATSPHASEN` | die **echte** `source-demand.planeMandatsarbeit` |
| Ergebnis | ein Ja/Nein je Klasse | sieben Kennzahlen je Klasse, kohortengenau |

Beides fällt genau dann auseinander, wenn ein Fenster **nach** einer Phase liegt: die
Aufträge sind längst fällig, aber ihr Streuintervall liegt hinter dem Fenster. Das traf
ausgerechnet das Nachtfenster 21:36–03:59 UTC — das einzige, das das Kapazitätstor bei
Parallelität 1 besteht.

### §30.2 Warum Fälligkeit die maßgebliche Motorbedingung ist

`helmut_claim_jobs` (Migration `20260808_scalable_job_queue.sql`) beansprucht nach genau
dieser Bedingung, und nach keiner anderen:

```sql
where status = 'wartend' and due_at <= v_now and attempts < max_attempts
order by priority asc, due_at asc, created_at asc
for update skip locked
```

Das Streuintervall kommt darin **nicht vor**. Es entsteht einmalig bei der Planung
(`dueAt = fensterStartMs + abMs + versatz`) und ist danach nur noch ein historischer Wert in
der Zeile. `helmut_enqueue_job` schreibt zudem `on conflict (idempotency_key) do nothing` —
ein bereits vorhandener Auftrag **behält seine `due_at`**. Ein Tor, das das Streuintervall
prüft, misst also den Planungszeitpunkt; der Motor misst die Fälligkeit.

### §30.3 Der Vertrag des neuen Tores (vor der Umsetzung festgelegt)

`lib/helmut/funktionstest-faelligkeit.js` — `faelligkeitsBefund(…)`. Sechs Festlegungen:

1. **Eine einzige Quelle.** Der Befund ruft `sourceDemand.planeMandatsarbeit` auf — dieselbe
   Funktion wie der Motor. Es gibt **keine zweite Phasenlogik** und keinen hartkodierten
   Ersatz; die Testsuite prüft das (Abschnitt B).
2. **Pflichtklassen** sind `mandate_projection` und `briefing_materialization`;
   `briefing_materialization` ist die **sichtbare Produktstufe** und entscheidet.
3. **Sieben Kennzahlen je Klasse:** `geplant`, `beiStartFaellig`,
   `imFensterZusaetzlichFaellig`, `bisFensterendeBeanspruchbar`, `nichtBeanspruchbar`,
   `abdeckung`, `vollstaendigeAbdeckung`.
4. **Kohortengenau.** Die Kohortengröße kommt aus `testkohorte-stufen.js` (A 20, B 95,
   C 495 kumulativ). Eine Abdeckung wird gegen die **geforderte** Kohorte gerechnet, nicht
   gegen ein einzelnes fälliges Briefing.
5. **Fail closed.** Jede fehlende, unlesbare oder unplausible Eingabe führt zu
   `bewertbar: false` mit Grund — nie zu einem Grün. `zahl()` weist `null`, `undefined`,
   `""` und Wahrheitswerte **vor** `Number()` ab (sonst wäre ein fehlender
   Planungszeitpunkt der 01.01.1970 gewesen).
6. **Fälligkeit ist nicht Status.** `vollstaendigerZyklus` ist **`null` = NICHT BEWERTBAR**,
   solange die Zahl **offener** Aufträge nicht rein lesend erhoben wurde. `null` ist
   ausdrücklich kein Erfolg; die CLI beendet sich dann mit Exitcode 1.

### §30.4 Gemessen: drei Fenster × drei Stufen (Tag 2026-09-03, Plan zum Fensterbeginn)

Anteil der Kohorte, den der Motor bis Fensterende in der **sichtbaren Produktstufe**
`briefing_materialization` beanspruchen könnte:

| Fenster (UTC) | Türkei / Berlin | Stufe A (20) | Stufe B (95) | Stufe C (495) |
|---|---|---|---|---|
| 11:36–15:59 | 14:36–18:59 / 13:36–17:59 | 0/20 = **0,0 %** | 0/95 = **0,0 %** | 0/495 = **0,0 %** |
| 17:36–19:59 | 20:36–22:59 / 19:36–21:59 | 12/20 = **60,0 %** | 53/95 = **55,8 %** | 273/495 = **55,2 %** |
| 21:36–03:59 | 00:36–06:59 / 23:36–05:59 | 20/20 = **100,0 %** | 95/95 = **100,0 %** | 495/495 = **100,0 %** |

> **Korrigiert am 02.09. nach dem Ausführbarkeitsreview (§31).** Eine erste Fassung dieser
> Tabelle wies für das Abendfenster 80,0 / 57,9 / 55,1 % aus. Sie war falsch: der Befund
> übergab dem Planer **keinen Rotationsrang**, Production aber schon
> (`rotation: tagesplan.reihenfolge`). Die Zahlen oben sind die mit Rotation.

Damit ist §29.3 **bestätigt und jetzt beziffert**: das Vormittagsfenster trägt in keiner Stufe
eine sichtbare Produktstufe, das Abendfenster nur gut die Hälfte, und allein das Nachtfenster
erreicht die volle Kohortenabdeckung — dasselbe Fenster, das das Kapazitätstor bei
Parallelität 1 als einziges besteht.

Die gemessenen Fälligkeitsspannen der Stufe C (die Klassengrenzen folgen den Phasenanteilen
des Frischefensters, die Lage innerhalb der Phase dem Rotationsrang):

- `mandate_projection` 12:00:00 – 17:59:16 UTC
- `briefing_materialization` 18:00:00 – 21:35:34 UTC

### §30.4a Wie robust ist das gegen die Rangkarte?

Der Rotationsrang verschiebt jede Fälligkeit **innerhalb** ihres Phasenfensters. Das
Nachtfenster beginnt exakt am **Ende** der Briefingphase (21:36 UTC) — dort ist jeder Auftrag
bereits fällig, **gleich welchen Rang** sein Mandat hat. Das Abendfenster liegt **mitten** in
der Phase, dort entscheidet der Rang. Gemessen über fünf verschiedene Rangkarten:

| Fenster | Stufe A | Stufe B | Stufe C |
|---|---|---|---|
| 21:36–03:59 | **100 % in allen fünf** | **100 % in allen fünf** | **100 % in allen fünf** |
| 17:36–19:59 | 35–60 % | 50,5–55,8 % | 54,3–55,2 % |

**Das ist der eigentliche Grund, warum das Nachtfenster trägt.** Es hängt nicht an einer
Rangkarte, die diese Sitzung gar nicht kennen kann — die übrigen aktiven Mandate stehen
bewusst nicht im Repo. Für die beiden anderen Fenster gilt das ausdrücklich **nicht**: ihre
Prozentwerte sind ohne die vollständige Rangkarte **keine belastbaren Zahlen**. Deshalb ist
`rotationVollstaendig` eine eigene, harte Startbedingung; das CLI nimmt die übrigen Mandate
zur Laufzeit über `--weitere=` entgegen.

### §30.5 Mitternacht — was bestätigt und was widerlegt wurde

Das Nachtfenster überschreitet 00:00 UTC, also die Grenze des 24-Stunden-Frischefensters.
Gemessen (Stufe C, Fenster 21:36–03:59 UTC, nur der **Planungszeitpunkt** variiert):

| Plan geschrieben | Frischefenster des Plans | passt zum Fenster | Abdeckung |
|---|---|---|---|
| 03.09. 20:00 UTC | `2026-09-03T00Z` | ja | **100,0 %** |
| 03.09. 21:36 UTC (Fensterbeginn) | `2026-09-03T00Z` | ja | **100,0 %** |
| 04.09. 00:30 UTC | `2026-09-04T00Z` | **nein** | **0,0 %** |
| 04.09. 02:00 UTC | `2026-09-04T00Z` | **nein** | **0,0 %** |

**Bestätigt (§29.4 Punkt 1):** Mitternacht ist tatsächlich eine harte Grenze. Eine Planung
**nach** 00:00 UTC legt die Fälligkeiten auf den **Folgetag** (12:00–21:36 UTC des 04.09.) —
im Nachtfenster wäre dann kein einziger Auftrag beanspruchbar. Die Idempotenzschlüssel
unterscheiden sich über Mitternacht (`typ|mandatsId|fenster`), es entstehen also **neue**
Aufträge.

**Widerlegt:** „100 % fällig ist selbst eine Annahme" gilt in dieser Pauschalität **nicht**.
Wird der Plan **vor oder zum Fensterbeginn** geschrieben, behalten die Aufträge ihre `due_at`
(`on conflict do nothing`) und bleiben über Mitternacht hinweg beanspruchbar — die 100 % sind
dann gerechnet, nicht angenommen. Entscheidend ist allein der **Planungszeitpunkt**, nicht die
Fensterlage. Der Befund führt deshalb `planPasstZumFenster` als eigene, harte Startbedingung.

### §30.6 Fällt Blocker 1 damit weg?

**Ja, für das Nachtfenster — und nur dort, und nur unter benannten Bedingungen.** Blocker 1
lautete: „`briefing_materialization` ist 18:00–21:36 UTC fällig, der Schnitt mit 11:36–15:59
ist leer." Das bleibt richtig; die Prüfung war nur die falsche. Nach Fälligkeit gerechnet
trägt das Nachtfenster **100 %** in allen drei Stufen. Bedingung: der Plan wird **vor
00:00 UTC** geschrieben (§30.5).

**Nein für die beiden anderen Fenster.** 0,0 % bzw. 55,1 % sind keine vollständige
Kohortenabdeckung. Das Tor verwirft sie weiterhin — jetzt aber mit einer Zahl statt mit einer
Ja/Nein-Schnittmenge.

### §30.7 Fällt Blocker 2 damit weg?

**Nicht durch dieses Tor.** Blocker 2 ist die Kapazität und wurde in §23.2 mit 1.812 gegen
1.732 in 263 min bei Parallelität 1 beziffert. Neu gerechnet für das **Nachtfenster**
(383 min, Parallelität 1): **2.522 möglich ≥ 1.812 nötig** — es passt, mit 710 Aufrufen Luft.
Nicht das Tor löst den Blocker, sondern die **Fensterwahl**, die das Tor jetzt erst zulässt.

Neu und ausdrücklich getrennt (`kapazitaet-500.lastTrennung`, **beschreibend**, konservativ,
500 Mandate):

| Lastart | pro Tag | Anteil |
|---|---|---|
| Warteschlangenarbeit (die der Motor im Fenster treibt) | **802** | 44,3 % |
| nutzergetrieben + eigene Crons (`communicationDraft`, `lageBriefing`, …) | **1.000** | 55,2 % |
| andere Verbraucher | 10 | 0,6 % |
| **Gesamtbedarf** | **1.812** | |
| erforderlicher Tagesdeckel | 2.416 | |
| Budgetreserve | 604 | |

Die 802 sind **keine Fenstergröße**. Die nutzergetriebene Last hat keine Fensterbindung, kann
gleichzeitig anfallen und zehrt vom **selben** Tagesdeckel. Deshalb bleibt die Kapazitätshürde
auf 1.812 — die 812 aus §24.1 bleibt zurückgezogen (§29), und die 802 tritt **nicht** an ihre
Stelle.

### §30.8 Der Nachweis, der weiterhin fehlt — und wie er rein lesend zu holen ist

Fälligkeit ist aus dem Plan berechenbar. **Status ist es nicht.** Ob ein fälliger Auftrag
abends noch `wartend` ist, hängt davon ab, ob der 20:00-Crawl-Cron ihn bereits abgearbeitet
hat: er findet in Stufe C **275/495** Briefings fällig (55,6 %) und treibt dieselbe
Warteschlange an. Es wird deshalb **kein Grün gebaut**, wo eine Messung fehlt:
`vollstaendigerZyklus` bleibt `null`, bis die Zahl offener Aufträge übergeben wird.

`funktionstest-faelligkeit.erhebungsSql()` gibt die dafür nötige, **rein lesende** Abfrage
aus. Sie bildet die Claim-Bedingung exakt nach und enthält kein `update`, kein `insert` und
keinen Claim. Die Eingaben werden **validiert und abgewiesen**, nicht escaped. Aufruf:

```
node scripts/lokal.js -- node scripts/funktionstest-500-faelligkeit.js --sql --ende=<ISO>
node scripts/lokal.js -- node scripts/funktionstest-500-faelligkeit.js \
     --stufe=c --start=… --ende=… --geplant=… --offen=495,495
node scripts/lokal.js -- node scripts/funktionstest-500-faelligkeit.js --alle --tag=2026-09-03
```

Das CLI rechnet und schreibt nichts, es öffnet keine Verbindung und ruft keine Route auf.
Exitcode 0 nur bei einem **belegten** vollständigen Zyklus; `null` ist Exitcode 1.

### §30.9 Zwölf harte Startbedingungen (`startbedingungen`)

Das Nachtfenster trägt einen vollständigen Zyklus **bedingt**, also stehen die Bedingungen im
Code und nicht in einer Empfehlung. Jede einzelne ist fail closed:

Fälligkeitsbefund bewertbar · Plan passt zum Fenster (vor Mitternacht geschrieben) ·
**Rotationsrang vollständig (alle am Testtag aktiven Mandate)** · vollständige Kohortenliste
geplant · geforderte Kohortenabdeckung erreicht · offene Aufträge rein lesend gemessen ·
vollständiger Zyklus belegt (nicht `null`) · Aktivierung der Stufe abgeschlossen **vor**
Fensterbeginn und vor dem Frischefensterwechsel · Restzeit im Fenster ≥ Mindestrestzeit ·
keine konkurrierende schwere Ausführung · Vorbedingungen (`source_fetch`,
`document_understanding`) erfüllt · Tagesdeckel wirksam · Vorrangreserve für die fünf realen
Mandate wirksam · Kommunikationsriegel scharf.

### §30.10 Was dieser Nachtrag NICHT behauptet

- Kein Production-Lauf, keine Migration, keine Route, keine Datenänderung. Alle Zahlen
  entstehen offline aus der echten Planungsfunktion.
- Der Durchsatz der **KI-freien** Warteschlangenklassen (`mandate_projection`,
  `briefing_materialization`) ist **nicht gemessen**. Die Kapazitätsrechnung deckt die
  Modellaufrufe ab; für die 990 KI-freien Aufträge im Fenster gibt es keine Laufzeitmessung.
  Das bleibt eine offene Lücke.
- Die Vorbedingungssperre (§29.4 Punkt 3) ist als Startbedingung **abgefragt**, aber ihre
  Wirkung unter Last ist nicht gemessen.
- Die **vollständige Rangkarte** liegt dieser Sitzung nicht vor (die übrigen aktiven Mandate
  stehen bewusst nicht im Repo). Für das Nachtfenster ist das folgenlos (§30.4a), für die
  beiden anderen Fenster sind die Prozentwerte damit **nicht belastbar**.
- Das Tor wählt kein Fenster aus. Es beziffert, was ein Fenster trägt; die Entscheidung
  bleibt beim Betreiber.

---

## §31 · Zwei unabhängige Reviews — 24 Befunde, alle geschlossen

Nach der Umsetzung der Betreiberentscheidung (§30) wurden zwei voneinander unabhängige
Prüfungen angesetzt: **fachliche Ausführbarkeit** (läuft es, und stimmen seine Aussagen mit
dem Motor überein?) und **adversariales Diff-Review** (wo entsteht ein falsches Grün?).

**Alle 24 Befunde stammen aus Code, den dieser Sprint selbst gebaut hat** — zehn aus der
Ausführbarkeitsprüfung (§31.1–§31.6), vierzehn aus dem adversarialen Diff-Review
(§31.9–§31.12). Jeder ist am Code nachgeprüft, behoben und mit einer Regressionszusicherung
versehen (Abschnitte **Q** und **R** der Suite `funktionstest-faelligkeit-test.js`).

Der schwerste Befund war **blockierend**: die Korrektur des 400er-Teardowns aus §28 wirkte in
Production **gar nicht** — sie verschob das Anlegen der Zeilen nur vom Schreib- auf den
Lesevorgang. Ohne den zweiten Review wäre eine unwirksame Korrektur als „behoben"
dokumentiert worden.

### §31.1 Befund 1 (hoch) — der Plan wurde ohne Rotationsrang gerechnet

**Der schwerste Befund.** `scalable-pipeline.planeArbeit` ruft den Planer mit
`rotation: tagesplan.reihenfolge` auf; der Rang steuert den Versatz **innerhalb** des
Phasenfensters. Das Tor übergab **keine** Rotation — der Planer fiel damit auf den
tagesunabhängigen Streuwert zurück und lieferte **andere Fälligkeiten als Production**.

Es war also dieselbe *Funktion*, aber nicht dieselben *Eingaben*. Gemessen für das
Abendfenster 17:36–19:59 UTC:

| Stufe | Tor vorher (ohne Rotation) | mit Rotation (wie Production) |
|---|---|---|
| A | 16/20 = 80,0 % | 12/20 = **60,0 %** |
| B | 55/95 = 57,9 % | 53/95 = **55,8 %** |
| C | 273/495 = 55,2 % | 273/495 = 55,2 % |

**Behoben:** Der Befund baut die Rotation jetzt mit derselben reinen Funktion, die Production
benutzt (`llm-budget-fair.tagesplan`), und übergibt sie. Neue Felder `rotationsQuelle`,
`rotationsGroesse`, `rotationVollstaendig`; neuer Parameter `weitereAktiveMandate` für die am
Testtag aktiven Mandate **außerhalb** der Kohorte, die in Production mit in der Rangkarte
stehen. Fehlen sie, meldet der Befund `rotationVollstaendig: false`, und die **zwölfte harte
Startbedingung** ist nicht erfüllt. Kein Mandant steht dafür im Repo — das CLI nimmt die Liste
zur Laufzeit über `--weitere=` entgegen (`CLAUDE.md` §4.2).

**Wichtig für die Entscheidung:** Das Nachtfenster ist von alldem **nicht betroffen**
(§30.4a) — es beginnt am Ende der Phase, dort ist jeder Auftrag fällig, gleich welchen Rang
sein Mandat hat. Die Korrektur ändert die Empfehlung also nicht, sie macht die Zahlen der
**anderen** Fenster erst ehrlich.

### §31.2 Befund 2 (hoch) — die Erhebungsabfrage zählte fremde Frischefenster und Stufen mit

`erhebungsSql()` filterte `status`, `due_at`, `attempts`, Kennungspräfix und Auftragstyp —
aber **nicht das Frischefenster** und **nicht die Stufe**. `helmut_defer_job` setzt
zurückgestellte Aufträge wieder auf `wartend` (Aufbewahrung 14 Tage); Altbestände früherer
Tage stehen also mit `due_at` in der Vergangenheit als `wartend` da.

**Fehlerszenario:** Der 20:00-Crawl hat alle 495 heutigen Briefings abgearbeitet, es liegen
aber 495 zurückgestellte des Vortags. Die Abfrage meldet 495, `vollstaendigerZyklus` wird
`true` — obwohl im geprüften Fenster **kein einziger** Auftrag des richtigen Frischefensters
offen ist. Zweite Variante: eine Stufe-A-Erhebung (20 Profile) zählt alle 495 provisionierten
Kennungen mit und besteht damit immer.

**Behoben:** Die Abfrage nimmt `frischefenster` und `stufe` entgegen, validiert beide (und
weist sie ab, statt sie zu escapen) und erzeugt die kumulative Präfixliste. Fehlt ein Filter,
schreibt sie einen sichtbaren **ACHTUNG-Hinweis in sich selbst**. Das CLI setzt beide Filter
automatisch aus dem Befund.

### §31.3 Befund 3 (hoch) — `mindestAbdeckung` koerzierte `null`/`0`/`""` zu einer Schwelle von 0

`Number.isFinite(Number(mindestAbdeckung))` — und `Number(null)` wie `Number("")` sind 0 und
endlich. **Genau die Falle, die dieses Modul an anderer Stelle ausdrücklich verbietet.** Der
Aufrufer schützte nicht: `eingabe.mindestAbdeckung ?? 1` lässt `0` und `""` durch.

**Fehlerszenario, real gemessen:** Fenster 11:36–15:59, Stufe C, `mindestAbdeckung: 0`,
`offeneAuftraege: {0, 0}` → Schwelle 0, `abdeckungErreicht: true`, `vollstaendigerZyklus: true`,
Urteil *„Vollständiger Zyklus"*. **Null beanspruchbare und null offene Aufträge wurden als
vollständiger Zyklus gemeldet.**

**Behoben:** Die Schwelle geht durch `zahl()` und muss echt größer 0 und höchstens 1 sein;
alles andere ist `bewertbar: false` mit Grund. Der Aufrufer reicht den Wert jetzt **roh**
durch, statt ihn zu veredeln.

### §31.4 Befund 4 (mittel) — dieselbe Falle in der Restzeitschwelle

`zahl(restzeitMinuten) >= Number(mindestRestzeitMinuten)`: die Schwelle ging an `zahl()`
vorbei. Gemessen: `restzeitMinuten: 0, mindestRestzeitMinuten: null` → Bedingung **erfüllt**.
Ein Fenster mit null Restminuten bestand die Mindestrestzeit. **Behoben:** ungültige Schwelle
fällt auf den strengen Standardwert 60 zurück.

### §31.5 Befund 5 (mittel) — `kennungen` überschrieb die Stufe ohne Erlaubnisliste

Eine übergebene Kennungsliste hatte Vorrang vor der Stufe, wurde aber weder gegen
`istKohortenKennung` geprüft noch entdoppelt — während das Feld `stufe` im Ergebnis weiter die
angegebene Stufe trug.

**Zwei Fehlerszenarien, beide real gemessen:** (a) Ein Duplikat vergrößerte die Kohorte
rechnerisch, obwohl der Idempotenzschlüssel in der Warteschlange nur **eine** Zeile je Mandat
erzeugt — `vollstaendigerZyklus: true` für eine Kohorte, die es so nicht gibt. (b) Eine
**fremde** Kennung (etwa ein realer Pilotmandant) wurde geplant und als „Stufe C"-Zahl
berichtet — im Widerspruch zu `CLAUDE.md` §4.2.

**Behoben:** Erlaubnisliste, Entdoppelung, und bei gleichzeitig angegebener Stufe zusätzlich
die Prüfung, dass jede Kennung zu dieser Stufe **oder darunter** gehört. Eine fremde Kennung
ist ein Abbruchgrund, kein stiller Filter.

### §31.6 Befunde 6–10 (niedrig) — fünf kleinere Korrekturen

| Nr. | Was | Behoben |
|---|---|---|
| 6 | „bildet die Claim-Bedingung **exakt** nach" war zu stark: der vorgelagerte Lease-Rücklauf, `order by` und `limit` fehlen | Wortlaut korrigiert; die drei Auslassungen stehen benannt in der Abfrage, und die Zahl ist ausdrücklich eine **Untergrenze** |
| 7 | `--alle` endete mit Exitcode **0**, obwohl es kein Urteil fällen kann — eine Automatisierung hätte ein Grün gelesen | Übersichtslauf endet mit **1** und sagt ausdrücklich, dass er kein Urteil fällt |
| 8 | Doppelte Rundung: 273/495 = 55,1515 % wurde als **55,1 %** statt 55,2 % ausgewiesen | Vorrundung entfernt, neues Feld `abdeckungProzent` rundet **einmal** |
| 9 | `aktivierungAbgeschlossenMs: 0` galt als gültige Aktivierung („1970-01-01") | `> 0` gefordert |
| 10 | `ueberschreitetMitternacht` verglich die Kalendertagsnummer — ein Fenster über einen Monat meldete `false` | Vergleich über Tagesgrenzen |

### §31.7 Was die Reviews ausdrücklich bestätigt haben

- **Kein Netz, keine Datenbank, kein Schreibvorgang, kein Modellaufruf.** Der Ladegraph des
  CLI wurde protokolliert: nur Rechenmodule, kein `http`/`https`/`net`/`dns`/`fetch`, keine
  Supabase-Anbindung, keine `fs`-Schreibaufrufe.
- **Keine zweite Phasenlogik, keine hartkodierten Prozentwerte.** `MANDATSPHASEN` liegt allein
  in `source-demand.js`.
- **`vollstaendigerZyklus === null` ist überall Nicht-Erfolg** — in der Hürde, in der
  Startbedingung und im CLI-Exitcode.
- **Das Frischefenster-Tor ist korrekt:** eine Planung nach 00:00 UTC führt zuverlässig zu
  `planPasstZumFenster: false`.
- **Die Kapazitätszahlen reproduzieren exakt:** 383 min bei Parallelität 1 → 2.522 möglich
  gegen 1.812 nötig; Lasttrennung 802 / 1.000 / 10, Deckel 2.416, Reserve 604.

### §31.8 Der Ablauf selbst, offen gesagt

Der erste Anlauf lief als Workflow mit vier Prüfagenten und einer Gegenprüfung jedes Befunds.
Er lieferte über eine Stunde **keine einzige Ausgabe** und wurde abgebrochen; die beiden
Reviews wurden danach direkt beauftragt. Das kostet Zeit und ist hier vermerkt, weil ein
abgebrochener Prüfweg sonst als „zwei Reviews durchgeführt" verschwinden würde.

### §31.9 Befund A (BLOCKIEREND) — der Teardown-„Fix" aus §28 wirkte in Production nicht

`§28` hielt fest: `deleteTenantScopedData` schrieb den leeren Mandanten-Store **unbedingt**
zurück, ein Upsert — der „Teardown" der 400er-Gruppe hätte damit **400 Zeilen angelegt**. Die
Korrektur ersetzte den unbedingten Schreibvorgang durch `readStore(...)` + Bedingung.

**Das war keine Korrektur.** `readSupabaseStore` (`storage.js:486–489`) legt eine fehlende
Zeile **beim Lesen selbst an**:

```js
const seeded = storeKey === "main" ? defaultStore() : defaultPoliticianStore();
await writeSupabaseStore(seeded, storeKey);
return seeded;
```

Der neu eingefügte Lesevorgang erzeugte in Production also **genau die Zeile**, die er
verhindern sollte; die nachfolgende Bedingung sparte danach nur noch den zweiten
Schreibvorgang ein. Netto: ein zusätzlicher Lese- **und** Schreibvorgang je Mandat, **kein**
Nutzen — und `CURRENT_STATE.md` hätte den Defekt als „behoben" geführt, während der Rückbau
der Stufe C weiterhin 400 Dauerzeilen hinterlassen hätte.

**Behoben:** neue Funktion `pStoreHatDatenOhneAnlegen(storeKey)`. Sie fragt im
Supabase-Pfad direkt nach der Zeile (`select=data`), legt **nichts** an und umgeht den
Zwischenspeicher — eine Löschentscheidung darf nicht auf einer bis zu 10 s alten Kopie
beruhen (das war Befund L). Im lokalen Pfad liest sie den lokalen Store, ebenfalls ohne
Nebenwirkung.

**Und die Tests, die das hätten finden müssen:** R4/R5 in `testkohorte-stufen-test.js` waren
**reine Quelltextregexe** — sie prüften, ob die eigene Implementierungszeile im Text von
`storage.js` vorkommt, riefen die Funktion nie auf und wären auch über der unwirksamen
Korrektur grün geblieben. Sie prüfen jetzt das **Verhalten** (R5) und dass die
Existenzprüfung in **keinem** Pfad schreibt (R4b).

### §31.10 Befund B (hoch) — die neue Stufen-Hürde konnte strukturell nie grün werden

Die Hürde verlangte `stufenvertrag(...).offeneFreigaben.length === 0`, also **alle fünf**
schreibenden Vorgänge einer Stufe **gleichzeitig** freigegeben. `HELMUT_TESTKOHORTE_CONFIRM`
ist aber **eine** Variable mit **einem** Wort. Gemessen mit der bestmöglichen Umgebung:
*„Stufe A (20 Profile): 4 Freigabe(n) fehlen"* — und die Meldung hätte dem Betreiber vier
Worte genannt, die er in ein einziges Feld schreiben soll.

Fail closed war die Hürde, richtig nicht: die fünf Vorgänge laufen zu **verschiedenen**
Zeitpunkten (anlegen → aktivieren → Fachzyklus → deaktivieren → entfernen). Niemand hält sie
je gleichzeitig.

**Behoben:** neue Funktion `startfreigabe(stufe, env)`. Zum **Starten** gebraucht wird genau
eine Freigabe — die des Fachzyklus dieser Stufe. Dass die Aktivierung vorher abgeschlossen
war, ist eine eigene Startbedingung, kein gleichzeitig zu haltendes Wort. Die vier späteren
Freigaben werden als Kette **benannt**, aber nicht verlangt. Gegengeprüft: die Hürde wird mit
einem einzigen korrekten Wort tatsächlich grün (R6) und bleibt ohne es rot (R7).

### §31.11 Befund C (hoch) — der `gelesen`-Fix öffnete die Kapazitätshürde in die unsichere Richtung

§24.6 behob, dass `pruefeKonfiguration()` das Feld `gelesen` nie zurückgab — die Zyklushürde
rechnete deshalb **immer** mit Parallelität 1. Der Kommentar nannte die Richtung des alten
Fehlers „die sichere". Was dort **nicht** stand: die Korrektur macht den vom Betreiber
**erklärten** Wert zum Entscheider. Gemessen:

| Fenster | Parallelität 1 | Parallelität 2 |
|---|---|---|
| 143 min | 941 gegen 1.812 → **passt nicht** | 1.883 gegen 1.812 → **passt** |
| 263 min | 1.732 gegen 1.812 → **passt nicht** | 3.464 gegen 1.812 → **passt** |

Ein eingetragenes `maxParallel: 2` hätte damit **beide** Tagesfenster von rot auf grün
gekippt, ohne dass irgendwo eine erreichbare Parallelität **gemessen** wäre — „Parallelität 2"
ist ausdrücklich unterbestimmt (§25.1).

**Behoben:** neuer Parameter `parallelitaetBelegt` (Default **false**). Ohne ihn rechnet die
Hürde weiter mit 1, und die Meldung sagt es: *„erklärte Parallelität 2 ist NICHT belegt,
gerechnet wird mit 1. Eine erklärte Zahl ist keine gemessene."*

### §31.12 Befund D (hoch) und die zehn kleineren

**Befund D — der Stufenpfad verlor die Duplikatsperre des Bestandspfades.**
`pruefeStufenZielmenge` prüfte fremde Kennungen und falsche Stufen, aber **keine Duplikate** —
während `testkohorte-betrieb.pruefeZielmenge` das tut. Bei gesetzter Stufe benutzen
Vorwärtsweg **und** Entfernung ausschließlich die neue, schwächere Prüfung. `--ids=x,x` hätte
`provisionTenant` zweimal für dieselbe Kennung laufen lassen und bei der Entfernung den
zweiten Durchgang als `nichtVorhanden` gezählt — mit `ok: true`. **Behoben.**

| Nr. | Schwere | Was | Behoben |
|---|---|---|---|
| E | mittel | `zahl()` koerzierte **Arrays**: `Number([])` ist 0. Ein leeres Array — der typische Rückgabewert einer **fehlgeschlagenen** Erhebung — ging als „1970-01-01" durch und erzeugte ein Fenster von 31.000 Jahren, in dem trivialerweise alles fällig ist | nur `number` und `string` gelten |
| F | mittel | `env` wurde an `arbeitsklassenImFenster` **nicht** durchgereicht — genau die Inkonsistenz, die derselbe Commit zu beheben behauptete; zwei Teile desselben Befunds lasen aus zwei Umgebungen | durchgereicht, gegengeprüft (R10/R10b) |
| G | mittel | Der Cron-Nachweis filterte mit `abstand > 0` ausgerechnet den **schlimmsten Fall** heraus: zwei Crons zur selben Minute | neue Zusicherung **2.0**, `>= 0` |
| H | mittel | Mehrere Zusicherungen waren **Quelltextregexe** statt Verhaltensprüfungen | R4/R4b/R5 auf Verhalten umgestellt; die übrigen als Struktur­prüfungen benannt |
| I | mittel | `CURRENT_STATE.md` §25 trug noch **80,0 / 57,9 / 55,1 %**, der Code rechnete bereits mit Rotation | nachgezogen (**60,0 / 55,8 / 55,2 %**) |
| J | niedrig | `check("5.3 …", true, …)` — eine **trivial wahre** Zusicherung in einem Lauf, dessen PASS-Zahl als Beleg zitiert wird | prüft jetzt, dass `18,48` nicht in `vercel.json` steht |
| K | niedrig | Der reale Mandats-Slug wurde in **drei neuen** Testfixtures verwendet — `CLAUDE.md` §4.2 verbietet die Ausweitung ausdrücklich | durch eine erfundene Kennung ersetzt; **R11** hält es fest |
| L | niedrig | Der Existenz-Lesevorgang im Teardown konnte aus einem bis zu **10 s alten** Zwischenspeicher antworten | die neue Prüfung umgeht ihn |
| M | niedrig | Die Fälligkeitssuite übergab **nie** `env`, die Gegenproben aber `{}` — heute gleich, morgen ein stiller Unterschied | beide Seiten lesen aus derselben Umgebung |
| N | niedrig | `--sql` mit ungültigem `--ende` brach mit einem **Stacktrace** ab | lesbare Abbruchmeldung, Exitcode 2 |

### §31.13 Was der zweite Review ausdrücklich NICHT beanstandet hat

Einschleusung über die SQL-Erzeugung (beide Eingaben werden normalisiert bzw. abgewiesen, kein
Pfad erzeugt etwas anderes als ein `select`, und `helmut_jobs`/`tenant_id`/`freshness_window`
existieren — die Abfrage ist tatsächlich ausführbar) · Mandantentrennung (kein hartkodierter
Mandant in `lib/`, kein Pilot-Testnutzer, `assertTenant` an erster Stelle) · gemeinsamer
Zustand (kein unbedingtes Lesen-Ändern-Schreiben im Diff) · schreibende Nebenwirkungen (außer
dem beabsichtigten Teardown unter vierfacher Verriegelung keine; `vercel.json` ändert **keine
Cronzeit**) · die Zahlen 802 + 1.000 + 10 = 1.812, Deckel 2.416, Reserve 604, 2.522 ≥ 1.812
bei 383 min und Parallelität 1.

---

## §32 · Der Kreisschluss zwischen Planung, Statusmessung und Startfreigabe

**Betreiberbefund 02.09., unabhängig geprüft und in der Sache bestätigt** — aber nicht in der
Form, in der er formuliert war. Der Unterschied ist wichtig, deshalb steht er vorn.

### §32.1 Die Production-Nullmessung, korrekt benannt

Eine rein lesende Abfrage über alle Kennungen mit dem Präfix `test-kohorte-` ergab am 02.09.:
**0 Aufträge insgesamt · 0 wartend · 0 laufend · 0 erledigt · 0 endgültig fehlerhaft.**

| Was sie beweist | Was sie NICHT beweist |
|---|---|
| Vor dem Test existiert **kein einziger** Kohortenauftrag. Eine saubere Nullbasis. | Die Zahl der Aufträge **nach** Provisionierung und Planung. |
| Der Rückbau früherer Anläufe hat nichts hinterlassen. | Dass ein vollständiger Zyklus möglich ist. |

Eine aussagekräftige Messung ist **erst möglich, nachdem die konkrete Stufe angelegt und
geplant wurde**. Provisionierung, Aktivierung und Planung bleiben jeweils **freigabepflichtige
Production-Änderungen**.

Die alte Abfrage lieferte für diese Nullbasis **keine Gruppenzeile** — ein `group by` ohne
Treffer liefert nichts. Genau das ist behoben (§32.5): die Klassen stehen jetzt links in einer
`VALUES`-Liste, die Warteschlange hängt per `LEFT JOIN` daran. Es gibt immer zwei Zeilen, und
eine 0 ist eine **gemessene** 0.

### §32.2 Der Befund: kein Ring, aber ein unerreichbares Tor

Die acht Behauptungen des Betreibers, einzeln am Code geprüft (Verhaltenstest, nicht
Quelltextsuche — `scripts/funktionstest-ablaufkette-test.js`):

| # | Behauptung | Ergebnis |
|---|---|---|
| 1 | `fuehreZyklusAus` verlangt bestätigte Startbereitschaft vor `/api/cron/pipeline` | **BEWIESEN** — gemessen 0 Routenaufrufe bei `startbereit` null/false |
| 2 | `/api/cron/pipeline` plant und verarbeitet gemeinsam | **BEWIESEN** — `server.js:7849` (planen) und `:7891` (arbeiten) in einem Aufruf |
| 3 | Ohne Planung existieren keine Kohortenaufträge | **BEWIESEN** als Satz |
| 4 | Der natürliche Lauf plant und beginnt zugleich zu verarbeiten | **BEWIESEN** |
| 5 | Erledigte Aufträge stehen nicht mehr auf `wartend` | **BEWIESEN** |
| 6 | `offeneAuftraegeReichen` verlangte die volle geplante Menge als offen | **BEWIESEN** |
| 7 | Ein korrekt erledigter Zyklus wird fälschlich blockiert | **BEWIESEN, gemessen** |
| 8 | Kreisschluss | **TEILWEISE** — siehe unten |

**Punkt 7, direkt am committeten Stand `5526f60` gemessen:**

```
Stufe A, Nachtfenster:
  alle 20 geplant, ALLE noch offen        → vollstaendigerZyklus: true
  alle 20 ERFOLGREICH erledigt (0 offen)  → vollstaendigerZyklus: false
  Urteil: "Fällig wären genug Aufträge, aber die gemessene Zahl OFFENER Aufträge
           reicht nicht — ein früherer Lauf hat sie bereits abgearbeitet."
```

Ein **vollständig und erfolgreich abgearbeiteter Zyklus** galt als gescheitert. Und
schlimmer: „es wurde nie etwas geplant" (0 offen) und „alles ist fertig" (0 offen) waren für
das Tor **nicht unterscheidbar**.

**Punkt 8 in seiner Ringform ist WIDERLEGT.** Die Aufträge entstehen *nicht* erst durch den
Lauf, den das Tor freigeben soll: `planeArbeit` hat in Production genau einen Aufrufer
(`server.js:7849`), der aus drei **Bestandscrons** läuft. Für das Nachtfenster hat der
20:00-Lauf bereits geplant.

> **Das Ergebnis ist deshalb genauer als die Behauptung: es ist kein Deadlock, sondern ein
> falsch-negatives Tor, dessen einziger grüner Zustand — „geplant, aber noch nichts
> verarbeitet" — nur in den Sekunden zwischen Planung und erstem Claim INNERHALB desselben
> Cron-Slots existiert. Eine rein lesende Messung um 21:36 trifft ihn praktisch nie. In der
> Wirkung ist das ein Kreisschluss; in der Struktur ist es keiner.**

### §32.3 Die tatsächliche Reihenfolge einer Stufe

| Schritt | Wo | Freigabe |
|---|---|---|
| a) Provisionierung (**inaktiv**) | `testkohorte-vorwaerts.js:118` | stufengenau |
| b) Aktivierung | `testkohorte-vorwaerts.js:267` | stufengenau |
| c) **Planung** | `scalable-pipeline.js:320` `planeArbeit` — plant **alle aktiven Profile**, keine Kohortenauswahl | — (Bestandscron) |
| d) Einreihung | `planeArbeit:434` → `helmut_enqueue_job`, `on conflict do nothing` | — |
| e) Erste Verarbeitung | `server.js:1031` → `:7699` → `:7849` planen → `:7891` arbeiten → `helmut_claim_jobs` | — |
| f) **Rein lesende Messung** | `erhebungsSql()` + CLI | keine |
| g) Weitere Verarbeitung | `funktionstest-zyklus.js:382–414`, Scheiben à 280 s | Fachzyklus |
| h) Auswertung | `funktionstest-500.pruefeAbbruch` (A01–A15) | **keine** (rein lesend) |
| i) Deaktivierung | `testkohorte-rueckbau.js` | stufengenau (**neu**, §32.6) |
| j) Entfernung | `testkohorte-entfernung.js:95` | stufengenau |

Planung und Beanspruchung stecken in **einem** Routenaufruf. Jede Scheibe plant erneut mit
(idempotent) und arbeitet erneut.

### §32.4 Die sieben Mengen, streng getrennt

Die alte Fassung kannte **eine** Zahl je Klasse. Jetzt sind es sieben:

| Menge | Bedeutung |
|---|---|
| **erwartet** | was der echte Planer für diese Kohorte, Stufe und dieses Frischefenster erzeugen muss |
| **vorhanden** | erwartete Aufträge, die in der Warteschlange existieren — unabhängig vom Status |
| **wartend** | noch nicht abgeschlossen, im Testfenster beanspruchbar (Versuche **nicht** erschöpft) |
| **laufend** | beansprucht, mit gültiger oder abgelaufener Lease |
| **erledigt** | erfolgreich abgeschlossen, **exaktes** Frischefenster |
| **endgültig fehlerhaft** | `fehlgeschlagen` **oder** `wartend` mit erschöpften Versuchen |
| **fehlend** | erwartet, aber keine passende Zeile |

**Zwei Fallstricke, die die Statusspalte nicht zeigt** und die jetzt aufgelöst sind:
`wartend` mit erschöpften Versuchen ist **nicht** beanspruchbar (der nächste Claim setzt ihn
auf `fehlgeschlagen`) und zählt als endgültiger Fehler; `laeuft` mit abgelaufener Lease kommt
beim nächsten Claim **zurück** auf `wartend` und bleibt ausstehende Arbeit.

### §32.5 Zwei getrennte Urteile

| Urteil | Bedingung |
|---|---|
| **Fachzyklus vollständig** | nichts fehlt · nichts endgültig blockiert · nichts überzählig · jeder erwartete Auftrag ist **erledigt oder noch sicher abschließbar** |
| **Lastbeweis vollständig** | die geforderte Menge wurde **im Testfenster selbst** verarbeitet (`finished_at` innerhalb des Fensters) |

Gemessen (Stufe A, Nachtfenster, `funktionstest-ablaufkette-test.js`):

| Zustand | Fachzyklus | Lastbeweis | Restlast |
|---|---|---|---|
| nichts geplant | **NEIN** | NEIN | 0 |
| alles geplant, nichts verarbeitet | JA | NEIN | 40 |
| Hälfte erledigt, Rest wartend | JA | NEIN | 20 |
| alles erledigt **im** Fenster | **JA** | **JA** | 0 |
| alles erledigt **vor** dem Fenster | **JA** | **NEIN** | 0 |
| 3 endgültig fehlerhaft | NEIN | NEIN | — |
| eine Klasse fehlt ganz | NEIN | NEIN | — |
| nicht gemessen | **NICHT BEWERTBAR** | NICHT BEWERTBAR | n/a |

Die vorletzte Zeile ist der Kern von Punkt 9 des Auftrags: **ein vor dem Nachtfenster
erledigter Auftrag zählt für den Fachzyklus, beweist aber nichts über die Belastbarkeit des
Fensters.** Die Restlast ist die **tatsächlich ausstehende** Arbeit, nicht die geplante Menge.

### §32.6 Fünf weitere Befunde der Analyse — alle geschlossen

| Nr. | Schwere | Was | Behoben |
|---|---|---|---|
| A | **blockierend** | Tor und Ausführer verlangten **zwei sich ausschließende Freigabeworte in derselben Variablen**: `startbereitschaft` wollte `TESTKOHORTE_STUFE_A_FACHZYKLUS_BESTAETIGT`, `fuehreZyklusAus` wollte `TESTKOHORTE_FACHZYKLUS_STARTEN_BESTAETIGT`, beide lesen `HELMUT_TESTKOHORTE_CONFIRM`. Welches Wort auch gesetzt war — die andere Seite fiel durch. **Die Kette blieb unerreichbar, genau wie vor der Korrektur der Stufenhürde in §31.10.** | `fuehreZyklusAus` nimmt jetzt eine `stufe` und nutzt dann dasselbe stufengenaue Wort wie das Tor. Ohne Stufe unverändert; eine **vertippte** Stufe fällt nie auf das Pauschalwort zurück |
| B | mittel | `--startbereit=ja` **ersetzte die Messung durch eine Behauptung** und löste gemessen zwei echte scharfe Routenaufrufe aus. Weil das Tor im Zielfenster praktisch immer rot war, wäre genau das unter Zeitdruck der Ausweg gewesen | Schalter **entfernt**; das CLI rechnet die Startbereitschaft selbst aus und weist den alten Schalter mit Begründung ab |
| C | mittel | Das abgeschaffte Feld `offeneAuftraege` wurde **stillschweigend ignoriert** — der Betreiber sah „nicht gemessen", obwohl er gemessen und übergeben hatte | wird jetzt **abgewiesen** mit Hinweis auf `bestand` |
| D | mittel | Die Kapazitätshürde war **stufenunabhängig** und verlangte für 20 Profile denselben 500-Mandate-Zyklus (1.812 Aufrufe). Die kleine, billige Absicherungsstufe war damit nur im Nachtfenster zulässig — die gestufte Absicherung lief ins Leere | rechnet stufengenau: **25 / 100 / 500** Mandate (Kohorte + 5 reale). Gemessen: Stufe A (591 Aufrufe) passt jetzt auch in ein Tagesfenster, Stufe C weiterhin nur nachts |
| E | mittel | Die **Deaktivierung** las das Pauschalwort für alle 495; das im Stufenvertrag deklarierte Stufenwort las **kein** Ausführer | `fuehreRueckbauAus` nimmt eine `stufe` und nutzt dann das Stufenwort |

### §32.7 Der Planungsschritt — kein neuer schreibender Code

Vier Wege wurden am Code geprüft (`funktionstest-faelligkeit.PLANUNGSWEGE`):

| Weg | Befund |
|---|---|
| **a** reine Planungsfunktion | `planeArbeit` ist exportiert, idempotent, modellfrei und beansprucht **nichts** (kein Claim im ganzen Block). Aber sie **reiht selbst ein** (Schreibvorgang) und plant **alle aktiven Profile** — sie lässt sich nicht auf die Kohorte einschränken |
| **b** getrennte Planungsphase | existiert nicht; verlangt **neuen schreibenden Code** |
| **c** ein Pipeline-Abschnitt mit Kontrollstopp | möglich, aber die eine Scheibe **plant und verarbeitet zugleich** — genau die Vermischung, die den Befund erzeugt hat — und kostet Modellaufrufe |
| **d** der natürliche Lauf | **GEWÄHLT.** Er plant die Kohorte automatisch, sobald die Stufe aktiv ist; die Aktivierung ist ohnehin freigabepflichtig. **Kein neuer Code, keine zusätzliche Freigabe** |

> **Eine neue schreibende Planungsfunktion wird ausdrücklich NICHT gebaut.** Punkt 11 des
> Auftrags erlaubt sie nur, wenn kein vorhandener sicherer Weg existiert — Weg (d) existiert.
> Der Befund war kein fehlender Planungsweg, sondern eine falsche Statusbedingung.

**Eine Korrektur zur Taktung, die die Analyse ergeben hat:** um 20:00 UTC läuft
`/api/cron/crawl`, **nicht** `/api/cron/pipeline` (die steht auf `0 16 * * *`). Und je Slot ist
immer nur **eine** der beiden mandatsgebundenen Klassen fällig — um 20:00 die
Briefingmaterialisierung, um 16:00 die Projektion. Wer „den natürlichen 20:00-Pipeline-Lauf"
sagt, zielt auf eine Route, die zu dieser Zeit gar nicht getaktet ist.

### §32.8 Der Teardown, jetzt im Supabase-Pfad selbst geprüft

§31.9 behob den Defekt, aber die Tests dazu blieben Quelltextregexe. Neu
`scripts/teardown-supabasepfad-test.js`: ein Zähl-`fetch` unter der Speicherschicht, der jede
HTTP-Methode gegen `helmut_store` mitschreibt. Gemessen:

- Mandant **ohne** Store: **1 GET, 0 Schreibvorgänge**, keine Kohortenzeile angelegt.
- Mandant **mit** Daten: **1 Schreibvorgang**, danach keine Nutzdaten mehr.

Ehrlich benannt: `readSupabaseStore` legt beim Lesen weiterhin `main` und `main-auth` an —
dieselbe Bauart, aber **keine** Kohortenzeile; beide existieren in Production ohnehin seit je.
Die 400er-Gruppe hätte 400 **eigene** Zeilen erzeugt, und genau die entstehen nicht.

### §32.9 Was weiterhin offen bleibt

- **Die Nullbasis ist keine Zyklusmessung.** Erst nach Provisionierung und Planung einer
  konkreten Stufe liefert die Erhebung verwertbare Zahlen — alle drei Schritte sind
  freigabepflichtig.
- **`HELMUT_TESTLAUF_VORRANG_REAL` ist ungesetzt**, die Vorrangreserve ist **0**. Der
  Verdrängungsschutz der fünf realen Mandate ist damit **nicht wirksam** — bestätigter Befund,
  eigener Startblocker (`vorrangreserveWirksam`).
- **Die vollständige Rangkarte** liegt dieser Sitzung nicht vor; für das Nachtfenster
  folgenlos (§30.4a), für die anderen Fenster nicht.
- **Die Laufzeit der KI-freien Warteschlangenklassen** ist ungemessen.
- **Der Lastbeweis** ist bisher in keiner Stufe erbracht — er verlangt einen echten Lauf.

---

## §33 · Zwei Abschlussreviews des Kreisschluss-Diffs — zwei Blocker, elf Befunde

Beide Reviews (fachliche Ausführbarkeit, adversariales Diff-Review) prüften ausdrücklich den
Kreisschluss **und** die Erreichbarkeit des Starttores für alle drei Stufen.

### §33.1 Das übereinstimmende Urteil

> **Der Kreisschluss selbst ist im Modul aufgelöst — verhaltensbelegt.** Beide Prüfer haben die
> Kette unabhängig nachgefahren: *nichts geplant* → `startbereit=false` (und unterscheidbar von
> „alles fertig"), *geplant* → `true`, *teilweise verarbeitet* → `true`, *vollständig erledigt*
> → `true`. Im alten Modell war genau der letzte Zustand rot.
>
> **Aber die Kette scheiterte danach an einer anderen Stelle: dem CLI.**

Beide Prüfer bestätigten unabhängig: **das einzige Betreiber-CLI konnte `startbereit`
strukturell nie erreichen.** `scripts/funktionstest-500-zyklus.js` übergab
`startfensterBefund.eingabe` — ein Feld, das `pruefeStartfenster` **gar nicht liefert**
(sie liefert `startErlaubt`, `grund`, `startMinuteUtc`, `endeMinuteUtc`, `gepruefteCrons`,
`konflikte`, `meldung`). Der Ausdruck war also **immer `{}`**, und damit die Startfensterhürde
unerfüllbar. Behoben: das CLI übergibt jetzt dieselben Eingaben, aus denen es den Befund baut.

**Erreichbarkeit, von beiden Prüfern ausgeführt und belegt:** mit vollständiger Konfiguration
und allen Messungen meldet `startbereitschaft` für **Stufe A, B und C** `startbereit: true`.
Keine Hürde ist einzeln unerfüllbar. Stufe A und B erreichen das schon bei 143 Minuten
Fensterdauer; Stufe C braucht ≥ 276 Minuten — genau der Unterschied, den die stufengenaue
Kapazitätshürde (§32.6 D) erst sichtbar macht.

### §33.2 Der zweite Blocker — selbst eingebaut

Die stufengenaue Deaktivierung aus §32.6 E hatte einen Fehler, den erst der Review fand:
**das Stufenwort schaltete die Zielmenge nicht mit um.** `fuehreRueckbauAus({stufe: "a"})`
ohne Kennungsliste nahm weiterhin **alle 495** Kohortenkennungen — das Wort für 20 Profile
hätte einen Rückbau aller 495 freigegeben. Genau die Verwechslung, die stufengenaue Freigaben
verhindern sollen.

**Behoben:** mit `stufe` ist die Zielmenge ohne ausdrückliche Liste **genau diese Stufe**, und
eine zu große Liste wird über `pruefeStufenZielmenge` **abgewiesen** (`grund: "falsche-stufe"`),
nicht stillschweigend gekürzt. Gemessen: 20 statt 495; eine 495er-Liste bricht ab.

### §33.3 Vier weitere schwere Befunde — Messintegrität

| Was | Fehlerszenario | Behoben |
|---|---|---|
| **Der Bestand trug keine Herkunft.** Das Modul konnte nicht prüfen, ob die übergebenen Zahlen zu *diesem* Fenster und *dieser* Stufe gehören | Zahlen des **Vortages** oder einer **anderen Stufe** hätten einen leeren Tag grün gemacht. Die Abfrage filtert korrekt — aber das Modul konnte nicht wissen, ob sie es getan hat | `bestand` muss `frischefenster` und `stufe` **mitbringen**; beides muss zum Befund passen, sonst gilt er als **nicht gemessen** |
| **Widersprüchliche Messung** wurde nicht geprüft | `erledigtImTestfenster > erledigt` kann die Abfrage nicht liefern — der Wert hätte den **Lastbeweis verschenkt** | ein widersprüchlicher Wert gilt als **nicht gemessen**; der Lastbeweis wird `null` |
| **Fachzyklus grün, obwohl der Rest im Fenster gar nicht beanspruchbar ist.** `Math.min(ausstehend, beanspruchbar)` ließ eine Klasse durch, solange nur genug **erledigt** war | Eine Klasse mit 495 wartenden Aufträgen im Fenster 11:36–15:59 (0 % beanspruchbar) galt als vollständig | beide Bedingungen gelten jetzt **getrennt**: nichts fehlt/blockiert **und** jeder ausstehende Auftrag ist im Fenster beanspruchbar |
| **Eine leere Rotationsliste** galt als vollständige Rotation | `rotation: []` meldete `rotationVollstaendig: true`, während der Planer auf den tagesunabhängigen Streuwert zurückfällt — also genau den Zustand, den das Feld ausschließen soll | eine leere Liste wird behandelt, als wäre nichts übergeben |

### §33.4 Drei kleinere Befunde

- **`mindestAbdeckung` war ein frei absenkbarer Hebel ohne Untergrenze.** `0.01` hätte eine
  Kohorte von 495 mit fünf Aufträgen „vollständig" gemeldet. Jetzt **Untergrenze 0,5** — der
  Test soll eine Kohorte beweisen, keine Stichprobe.
- **Das CLI nannte bei `--stufe=` das falsche Freigabewort** (das Pauschalwort statt des
  stufengenauen) und hätte den Betreiber in genau die Falle aus §32.6 A geschickt. Korrigiert.
- **Die alte Schnittmengenrechnung beendete das CLI mit einem BLOCKER** — ausgerechnet für das
  tragende Nachtfenster, obwohl dort nach Fälligkeit 100 % beanspruchbar sind. Sie ist jetzt
  reine **Beschreibung** und beendet den Lauf nicht mehr.

### §33.4a Der Betriebsweg ist jetzt bedienbar — belegt

Beide Prüfer stellten fest: `startbereit` war auf **Bibliotheksebene** erreichbar, über das
**CLI** aber nicht — es reichte weder Konfiguration noch Abbruchgrenzen, Messungen, Isolation
noch bestandene Stufen durch. Gemessen blieben 11 bis 12 Hürden offen, unabhängig davon, wie
sorgfältig der Betreiber vorbereitet hatte.

**Behoben:** `scripts/funktionstest-500-zyklus.js` nimmt jetzt `--konfiguration=`, `--grenzen=`,
`--messungen=`, `--bestandene-stufen=` (je JSON), `--isolation-belegt`,
`--parallelitaet-belegt` und `--stufe=` entgegen und reicht alles durch. Die Startbereitschaft
wird **immer** gedruckt — auch im Trockenlauf, denn das ist der Weg, auf dem der Betreiber sie
vorbereitet —, und jede offene Hürde wird namentlich genannt.

**Ausgeführter Beleg** (Stufe A, Nachtfenster 21:36–03:59 UTC, alle Eingaben gesetzt):

```
=== Startbereitschaft (ausgerechnet) ===
startbereit: true
```

Damit ist die Kette von der Messung bis zum Start **über den ausgelieferten Weg** vollständig
bedienbar. Vorher: 12 offene Hürden; nach der Verdrahtung ohne Eingaben: 10; mit vollständigen
Eingaben: **0**.

### §33.5 Was die Reviews ausdrücklich bestätigt haben

- **Der Lastbeweis geht in KEINE Entscheidung ein** (grep über `lib/` und `scripts/`: nur
  Erzeugung und Anzeige) — er rettet den Fachzyklus nicht und kippt ihn nicht.
- **Keine fehlende, abgebrochene oder leere Messung** geht als „gemessene Null" durch.
- **`vollstaendigerZyklus === null` ist überall ein Nicht-Erfolg** — Hürde, Startbedingung,
  CLI-Exitcode.
- **Kein Netzaufruf, keine Datenbankverbindung, kein Schreibvorgang, kein Modellaufruf** im
  neuen Pfad.

---

## §34 · Korrektursprint 03.09. — der Betreiberweg reichte die Stufe nicht durch

**Branch `claude/stufenweise-provisionierung-fix-rg6sij`, PR #297, Basis `main` = `a839c1b19f55246bfe747efbfcfa2269f5e28842`
(Merge von #296). Rein vorbereitender Sprint, KEINE Production-Wirkung:** keine Provisionierung,
keine Aktivierung, keine Umgebungsvariable, keine Migration, kein Cron, keine Azure-Einstellung,
kein Budget, keine Reserve, kein Modellaufruf, keine externe Nachricht, keine kostenpflichtige
Ressource. Kein Supabase-Zugriff, kein Vercel-Zugriff aus dieser Sitzung.

### §34.1 Nach-Merge-Beleg zu #296

| Tatsache | Beleg |
|---|---|
| PR #296 **gemergt** 03.09. 05:08:15 UTC (geschlossen, kein Draft, `merged: true`) | GitHub, rein lesend |
| Kopf des PR `ba0963300fbd2387e6fede6f3b642d379250dfe9`, Basis `9079ac3` | GitHub |
| **`main`-Kopf `a839c1b19f55246bfe747efbfcfa2269f5e28842`** | `git rev-parse origin/main` |
| Beide Pflichtprüfungen auf `a839c1b` grün (Syntax + Offline-Suiten · Browser-/Mobile-Smoke) | CI-Lauf **33717626724** auf `main`, `conclusion: success` (rein lesend bestätigt 03.09.) |
| Vercel: „Deployment has completed" exakt für diesen Commit | <https://vercel.com/nohut/helmut-pilot/CCbSsp58pxGNMqjuGQziVZYknaHd> |
| Interne Vercel-Deployment-Details / `dpl_`-Kennung | **nicht zusätzlich bestätigt** (Zugriff fehlte) |
| Keine offenen Pull Requests vor Beginn dieses Sprints | GitHub, rein lesend |
| Betreiberwerte, Production-Daten, Profile, Migrationen, Crons, Azure, Budgets | durch den Merge **unverändert** |

### §34.2 Der Befund — reproduziert als isolierter Trockenlauf

Am Kopf `a839c1b`, ausschließlich über `scripts/lokal.js`:

```
node scripts/lokal.js -- node scripts/testkohorte-vorwaerts.js provisionierung --stufe=a
  "zielGroesse": 495
  "erwartetesWort": "TESTKOHORTE_495_ANLEGEN_BESTAETIGT"
  Exit 0 · nichts geschrieben
```

**Ursache:** Das CLI las `--stufe` nirgends und übergab `fuehreProvisionierungAus` keine `stufe`.
Die Bibliothek konnte seit 02.09. (§23.3, Lücke 1) stufengenau anlegen — der einzige vorgesehene
Betreiberweg nutzte das nicht. Wer „nur die 20 der Stufe A" wollte, hätte mit dem Pauschalwort
**alle 495** angelegt. Die Angabe wurde **still ignoriert**; genau diese Klasse Fehler
(Angabe wird nicht abgewiesen, sondern übergangen) ist der Kern.

### §34.3 Die Korrektur am Betreiberweg (`scripts/testkohorte-vorwaerts.js`)

- `--stufe=a|b|c` ist für die Provisionierung **Pflicht**. Fehlend, leer oder unbekannt →
  **Exit 2** mit Meldung, **bevor** Fenster, Banner oder Bibliothek angesprochen werden. **Kein
  Rückfall auf die vollständige Kohorte.** Auch mit gesetztem Pauschalwort, `--scharf` und gültigem
  Fenster passiert ohne Stufe nichts (gemessen).
- **Unbekannte Angaben brechen ab** (`--stuffe=a`, `--gruppe=` bei der Provisionierung, das
  abgeschaffte `--vorstufen-vollstaendig`) — nie mehr still ignorieren.
- `--ids=` erlaubt eine Teilmenge **derselben** Stufe (Ergänzung eines abgebrochenen Laufs); eine
  Kennung einer anderen Stufe, eine fremde oder erfundene Kennung und ein Duplikat brechen über
  `pruefeStufenZielmenge` ab (**Exit 1**, `falsche-stufe` / `fremde-kennung` / `doppelte-kennung`).
- Die Aktivierung nimmt `--stufe` als Alias von `--gruppe`; ein Widerspruch bricht ab.
- **Nach dem Review (§34.12) zusätzlich:** eine **mehrfach gesetzte** Angabe (`--stufe=c --stufe=a`)
  bricht ab — „die erste gewinnt" wäre dieselbe stille Verschiebung; `--jetzt=` (Prüfuhr) wird
  **im scharfen Lauf abgewiesen** — der dritte Riegel („Fenster gilt JETZT") misst an der
  Systemuhr und ist nicht setzbar; `--start`/`--dauer`/`--jetzt` werden auf Format geprüft, ein
  halbes Fensterpaar ist ein Aufruffehler (Exit 2), kein stiller Trockenlauf; eine `--ids=`-Liste
  wird **vor dem Banner** gegen die Stufe gerechnet, damit kein Protokolleintrag etwas verspricht,
  was der Lauf danach abbricht.
- Das Banner des scharfen Laufs nennt die Stufe, nicht die 495.
- **Die Bibliothek ist unverändert**: ohne `stufe` weiterhin 495 + Pauschalwort
  (Regressionsvertrag `testkohorte-stufen-test.js` L1). Nur der Betreiberweg ist geschlossen.

Ergebnis nach der Korrektur (Trockenläufe über `scripts/lokal.js`):

| Aufruf | zielGroesse | erwartetesWort | Exit |
|---|---|---|---|
| `provisionierung --stufe=a` | **20** | `TESTKOHORTE_STUFE_A_PROVISIONIERUNG_BESTAETIGT` | 0 |
| `provisionierung --stufe=b` | **75** | `TESTKOHORTE_STUFE_B_PROVISIONIERUNG_BESTAETIGT` | 0 |
| `provisionierung --stufe=c` | **400** | `TESTKOHORTE_STUFE_C_PROVISIONIERUNG_BESTAETIGT` | 0 |
| `provisionierung` (ohne Stufe) / `--stufe=` / `--stufe=z` | — | — | **2** |
| `provisionierung --stufe=a --ids=test-kohorte-c-001` | — | — | **1** (`falsche-stufe`) |

### §34.4 Der Ablaufplan ist jetzt stufenweise (`lib/helmut/funktionstest-ablaufplan.js`)

Der maschinenlesbare Plan behauptete bis zu diesem Sprint einen Schritt „495 Profile INAKTIV
provisionieren". Er kennt jetzt **28 Schritte** und **keinen Sammelschritt**
(`keinSammelschritt`, `stufenweise: true`, `provisionierungsSchritte = [provisionierung-a, -b, -c]`):

| Nr | Schritt | Art | Vorbedingungen |
|---|---|---|---|
| 1–3 | Grundlinie · Sicherung (`backup-export.js --scope=profil`, **ohne** `lokal.js`) · Startfenster | lesend | — |
| 4 | **Betreiberentscheidung zur Kohortenspezifikation** (Bundestagsreife-Sperre, §34.7) | Entscheidung | — |
| 5 | **Stufe A: 20 Profile INAKTIV provisionieren** | Production, Stufenwort | Grundlinie, Sicherung, Fenster, **Reifeentscheidung** |
| 6 | **Stufe A: Isolation und Inaktivität rein lesend belegen** (`isolation --stufe=a`) | lesend | Stufe A angelegt |
| 7 | **Die acht Betreiberwerte setzen** (Deckel, Verstehens-Reserve, Vorrangreserve, RPM, TPM, Kosten, Parallelität, Kommunikationsriegel) | Umgebung | Grundlinie |
| 8 | Kommunikationsriegel scharf prüfen | lesend | Werte |
| 9 | **Wirksamkeit der Werte prüfen** (ehrlich: nur der Deckel ist rein lesend belegbar) | lesend | Werte, Riegel |
| 10 | **Stufe A aktivieren** (eigene Freigabe `aktivierung-a`) | Production | Isolation A, Werte, Werte geprüft, Riegel, Fenster |
| 11–12 | Fachzyklus A (Stufenwort; braucht Werte geprüft, Riegel, Fenster) · Kontrolle A (A01–A15) | Production · lesend | Gruppe A aktiv · Zyklus A |
| 13–17 | **Stufe B getrennt**: Anlage → Isolation → Aktivierung → Fachzyklus (`--bestandene-stufen='["a"]'`) → Kontrolle | | **jeder Schritt erst nach Kontrolle A** |
| 18–22 | **Stufe C getrennt** | | **jeder Schritt erst nach Kontrolle B** |
| 23 | Gemeinsame Auswertung | lesend | Kontrolle C |
| 24–25 | Deaktivierung · Rückbauprüfung (`rueckbau --stufe=<bis-stufe>`) | **nie gesperrt** | — |
| 26–28 | Scheduler-Spur · optional Migration/Flag | eigene Freigaben | Rückbau bestätigt · Migration angewendet |

Jeder Befehl im Plan wurde gegen das tatsächliche CLI geprüft (`--stufe=` bei
`testkohorte-495.js isolation`/`rueckbau`, `funktionstest-500-kontrolle.js pruefe`,
`funktionstest-500-zyklus.js`; kein `--vorstufen-vollstaendig` mehr). Der Plan trägt
`betreiberwerte.vorbedingungVon = [aktivierung-a, -b, -c]`, `keineVorbedingungVon =
[provisionierung-*, isolation-*]`, `blocker.kohortenreife` und `nichtGelieferteVorbedingungen = []`
(jede Vorbedingung wird von genau einem Schritt geliefert — nichts muss von Hand behauptet werden).
Grundlinie und Sicherung sind Einmal-Kennungen: vor Stufe B und C erneut erheben und sichern ist
**Betreiberpflicht, vom Plan nicht erzwungen** (so benannt).

### §34.5 Der Zeitpunkt der Betreiberwerte — ausdrücklich

> Die acht Betreiberwerte und `HELMUT_TESTLAUF_VORRANG_REAL` müssen **nicht** vor der rein
> inaktiven Provisionierung gesetzt sein. Sie müssen aber **zwingend gesetzt, wirksam und
> geprüft** sein, bevor auch nur das erste synthetische Profil aktiviert wird.

„Gesetzt" heißt nicht „wirksam": Vercel-Env ist aus keiner Sitzung lesbar. **Rein lesend in
Production belegbar ist heute allein `HELMUT_MAX_LLM_CALLS_PER_DAY`** (Whitelist von
`/api/admin/overview`). Verstehens-Reserve, Vorrangreserve, RPM/TPM, Kostenbudget, Parallelität
und Kommunikationsriegel sind nach dem Setzen **Betreiberangabe** — die Startbereitschaftshürden
(„… in der LAUFENDEN Umgebung", „LAUFZEITWIRKSAM") lesen das `process.env` des Prozesses, der sie
rechnet, lokal also die lokal gesetzten Werte, nicht Vercel (Reviewbefund §34.12; die erste
Fassung dieses Abschnitts hatte hier mehr behauptet). **RPM/TPM liest ohnehin kein
Ausführungspfad** (§23.4). Mit Vorrangreserve 0 ist der Verdrängungsschutz der fünf realen
Mandate **nicht** wirksam (§25.2) — deshalb Schritt 9 vor Schritt 10. Eine Erweiterung der
Overview-Whitelist um die drei Zahl-/Moduswerte wäre ein eigener, kleiner Code-PR.

### §34.6 Verhaltensbeleg: die inaktive Provisionierung erzeugt keine Last

Neu `scripts/testkohorte-provisionierung-inaktiv-test.js` (33/0). Der **echte** Provisionierer
(`provisioning.provisionTenant`, `neuAktiv:false`) läuft über den echten Vorwärtsausführer für die
20 Kennungen der Stufe A **scharf** gegen einen Arbeitsspeicher-Store; mitgezählt werden `fetch`,
`http`/`https`, rohe Sockets/TLS, DNS, Kindprozesse, jeder Aufruf des Kommunikationsriegels und
jede Funktion des KI-Moduls.

| Messung | Ergebnis |
|---|---|
| fetch · http · https · net · tls · dns · Kindprozesse | **0 · 0 · 0 · 0 · 0 · 0 · 0** |
| Kommunikationsriegel gefragt · KI-Modul aufgerufen | **0 · 0** |
| Außenkanalmodule (mail-transport, job-dispatch, lambda-verbraucher, monitoring-webhook) | **nicht einmal geladen** |
| Jedes Profil `profileActive:false`, jedes Konto `active:false`, `isDisabled` = true | 20/20 |
| Echter Planer `planeArbeit` über die 20 inaktiven Profile | **0 Profile, 0 Aufträge, `enqueue` nie** |
| Gegenprobe: ein einziges Profil aktiv | **2 Aufträge** (die 0 ist echt) |

**Präzisierung nach dem Review (§34.12):** „keine Last" heißt kein Warteschlangenauftrag, keine
Verstehensarbeit, kein Modellaufruf, keine Außenkommunikation. Die Anlage selbst **schreibt** je
Kennung ein gesperrtes Konto in den Auth-Blob `main-auth` (unbedingter Vollschreib, Last-Write-Wins
— Bestandsverhalten von `accounts.createUser`, bekannt und in `provisionTenant` durch eine
Nachprüfung gegen den persistierten Stand flankiert) und das Profil (Blob und relationale Upserts).
Schreibvorgänge sind Anlage, nicht Last.

**Zweiter Konsument aller Profile, gefunden und geschlossen:** `scheduler.js` reicht
`listFullProfiles()` (inklusive inaktiver Profile) an `lazyUnderstanding.interestedProfiles`. Ein
inaktives Kohortenprofil zählte dort als „interessiert" (gemessen: Ähnlichkeit 0,92) und hätte —
bei eingeschaltetem `HELMUT_V3_LAZY_UNDERSTANDING` (in Production **nicht gesetzt**, also heute
inert) — Verstehensarbeit vorgemerkt, die später Modellaufrufe kostet. `interestedProfiles` filtert
jetzt mit demselben Prädikat wie der Arbeitsplaner (`profile-validation.isDisabled`); belegt:
dasselbe Profil aktiv → interessiert, inaktiv oder soft-gelöscht → nicht; der Shadow-Runner merkt
für 20 inaktive Profile nichts vor. Für die vier deaktivierten Demo-Mandate in Production ist das
dieselbe, beabsichtigte Semantik.

Nicht behauptet: die Aktivierung ist hier nicht gelaufen — sie ist der Schritt, ab dem Last entsteht.

### §34.7 Der Blocker — die Bundestagsreife-Sperre wies 18 von 20 Stufe-A-Profilen ab

> **GESCHLOSSEN am 03.09.2026 nach Variante (a) — der Beleg steht in [§34.13](#3413-variante-a-die-kohorte-richtet-sich-nach-der-regel).** Dieser Abschnitt bleibt unverändert als Befundprotokoll stehen; er beschreibt den Zustand VOR der Umsetzung. Nur eine Zahl ist korrigiert (siehe die Tabelle unten): die Aufteilung der Kohorte war hier mit 62/433 falsch angegeben.

**Erstmals am echten Pfad gemessen** (alle bisherigen Suiten prüften den scharfen Pfad mit einer
Attrappe für `legeAn`): `provisionTenant` verweigert in Schritt 2b („Bundestagsreife",
`profile-readiness.pruefeNeuaktivierung`) jedes **Bundestags**profil der Kohorte mit
`bundestagsprofil-nicht-bereit` —

```
Ungueltige Angabe: committees = „Testausschuss 1" — nicht als staendiger Ausschuss der
21. Wahlperiode aufloesbar (nicht in der Sollmenge)
```

Die Kohortenspezifikation trägt **bewusst synthetische Ausschüsse** („Testausschuss N";
`test-kohorte-500.js`, testgesichert `test-kohorte-500-test.js` §4.5 — „alle
Parteien/Ausschüsse/Themen sind synthetisch"); die Reife-Sperre (Korrekturrunde 2026-08-25)
verlangt Ausschüsse der WP-21-Sollmenge. Die „Offline-Vollvalidierung" der Kohorte (§21) prüfte
`validateSpec`, **nicht** die Reife-Sperre. Beide Regeln sind je für sich richtig — zusammen machen
sie den scharfen Anlagelauf **unvollständig**:

| Stufe | Landtag (passiert) | Bundestag (abgewiesen) |
|---|---|---|
| A (20) | 2 | **18** |
| Kohorte (495) | 61 | **434** |

*(Korrektur 03.09.: hier stand zunächst 62/433. Nachgemessen über `spezifikationen()` sind es **61 Landtags- und 434 Bundestagsprofile**; die Stufenzeile A (2/18) war richtig. Die falsche Zahl war in den PR-Text von #297 und in `CURRENT_STATE.md` übernommen worden und ist dort ebenfalls berichtigt.)*

Gemessen für Stufe A: `angelegt: 2 · fehlgeschlagen: 18 · ok: false`. **Der Zustand danach ist
sicher**: die Abweisung geschieht **vor** jedem Schreibvorgang (2 Profile, 2 Konten, 2
Schreibvorgänge, alles inaktiv), der Rückweg ist anwendbar, kein Netz, kein Modellaufruf.

**Entscheidung nötig, vor jeder Provisionierung:**
(a) Kohortenspezifikation auf Ausschüsse der WP-21-Sollmenge umstellen — Kennungen und Adressen
bleiben deterministisch und unverändert; das Prinzip „keine echten Ausschüsse" (§4.5) müsste
bewusst aufgegeben werden, und die Profile erhielten damit echte Quellenpakete (für einen
Funktionstest unter realistischer Last eher erwünscht als unerwünscht);
(b) die Reife-Sperre für die synthetische Kennungsfamilie anders behandeln — **nicht empfohlen**,
weil sie eine Schutzregel für reale Profile ist und die Kohorte dann mit Ausschüssen liefe, die
im Radar nichts belegen;
(c) nur die 61 Landtagsprofile anlegen — verändert Umfang und Aussage des Tests.
Diese Entscheidung war beim Schreiben dieses Abschnitts **nicht** getroffen; der Test `A0` pinnte den
Zustand als dokumentierten Blocker. **Noch am selben Tag** entschied der Betreiber im Sprintauftrag
auf **(a)** (§34.13); `A0` ist
damit — wie angekündigt — gekippt und durch einen positiven Beleg des echten Pfades ersetzt worden
(§34.13).

### §34.8 Stufenbewusste Isolationsprüfung

`pruefeIsolation({grundlinie, bestand, stufe})` (`testkohorte-betrieb.js`) und
`testkohorte-495.js isolation --stufe=`: mit Stufe gilt der Beleg für den Bestand **bis
einschließlich** dieser Stufe (A = 20, A+B = 95, A+B+C = 495) und verlangt zusätzlich, dass genau
diese Stufe **vollständig und INAKTIV** angelegt ist und **kein Kohortenkonto aktiv** ist. Ohne
Stufe unverändert 495. Ohne diese Fassung war der Isolationsbeleg der Stufe A strukturell
unerreichbar (er verlangte 495 gelesene Zeilen). Verhaltensbelegt: aktive Zeile, aktives Konto,
vorzeitige Zeile der Stufe B, fehlende Zeile — jeweils **nicht** isoliert.

**Dasselbe für den Rückweg (Reviewbefund §34.12):** `pruefeRueckbau` verlangte ebenfalls 495
gelesene Zeilen. Nach Stufe A (20 Zeilen) hätte die Rückbaubestätigung dauerhaft „20 von 495" und
`zurueckgebaut: false` gemeldet, obwohl alles deaktiviert war — ein **falsches Rot ausgerechnet am
Rückweg**. `pruefeRueckbau({stufe})` und `testkohorte-495.js rueckbau --stufe=` prüfen jetzt den
Bestand bis einschließlich der Stufe (exakt diese Kennungen, keine doppelt); ohne Stufe unverändert
495. Verhaltensbelegt (D2.1–D2.5).

### §34.9 Welche älteren Aussagen überholt sind

| Ältere Aussage | Stand jetzt |
|---|---|
| §10 Zeile 4 „**495 Profile INAKTIV provisionieren** … F" | **überholt** — drei getrennte Schritte mit drei Stufenworten (§34.4) |
| §10 Zeile 3 (Riegel/Env vor Schritt 4) und §13 Reihenfolge 4–6 vor 8 | **präzisiert** — die Werte sind vor der **Aktivierung** Pflicht, nicht vor der inaktiven Anlage (§34.5) |
| §13 Punkt 8 „Provisionierung der 495 inaktiven Profile" | **überholt** — je Stufe eine eigene Freigabe |
| §18.10 „17 Schritte" | **überholt** — 27 Schritte |
| §21.2 Aufruf `provisionierung` ohne Stufe | **überholt** — `--stufe=` ist Pflicht |
| §33 / PR #296: „Die eine nächste notwendige Freigabe: Provisionierung der Stufe A mit dem Wort `TESTKOHORTE_STUFE_A_PROVISIONIERUNG_BESTAETIGT`" | auf Bibliotheksebene richtig; über das CLI **bis zu dieser Korrektur nicht ausführbar**, und unter der Reife-Sperre auch danach **nicht vollständig** (§34.7) |
| §21 (CURRENT_STATE) „Kohorte 495 validiert" | gilt für `validateSpec`; gegen die Bundestagsreife-Sperre **nicht** validiert |
| §33.5 „kein Netzaufruf, kein Modellaufruf im neuen Pfad" | **bestätigt und erweitert** auf den echten Provisionierungspfad (§34.6) |

### §34.10 Testnachweise

- Neu `testkohorte-vorwaerts-cli-test.js` **55/0** — echte Kindprozesse des Betreiber-CLI:
  20/75/400 mit Stufenwort · fehlende/leere/unbekannte Stufe Exit 2 · Tippfehler, `--gruppe=`,
  doppelte Angaben, ungültige Fensterangaben, `--jetzt` im scharfen Lauf abgewiesen · `--scharf`
  ohne Freigabe/Fenster bleibt Trockenlauf · fremdes Stufenwort, Pauschalwort, Aktivierungswort
  schalten nicht scharf · fremde Stufe, fremde/erfundene/doppelte Kennung brechen ab (ohne Banner) ·
  **zweifacher Schreibbeleg**: ein Schreibspion als Preload im Kindprozess protokolliert jeden
  Dateischreibvorgang unter dem Repo (Positivkontrolle grün) — 0 über alle Aufrufe — und der lokale
  Speicher enthält vor wie nach jedem Aufruf 0 Kohortenzeilen · Netz-Guard nie ausgelöst. (Die
  erste Fassung hashte das Datenverzeichnis bytegenau; im Gesamtlauf kippte der Hash durch einen
  fremden nebenläufigen Schreiber — deshalb der Schreibspion und die semantische Zählung.)
- Neu `testkohorte-provisionierung-inaktiv-test.js` **44/0**, nach §34.13 **47/0** (§34.6
  einschließlich Verstehens-Interessenprüfung, §34.8 einschließlich Rückbau; der frühere
  Blocker-Pin `A0` ist durch den positiven Beleg des echten Pfades **A0.1–A0.4** und die
  Gegenprobe **A0a.1–A0a.4** ersetzt).
- `funktionstest-ablaufplan-test.js` **81/0**, nach §34.13 **82/0** (A4/A5/A7a auf den stufenweisen Vertrag
  umgestellt — die alten Zusicherungen pinnten den Sammelschritt; A7a pinnt wieder Gesamtzahl und
  Position; neu A4b, A19–A35).
- Unverändert grün: `testkohorte-vorwaerts` 65/0 · `testkohorte-stufen` 103/0 ·
  `testkohorte-betrieb` 100/0 · `funktionstest-ablaufkette` 30/0 · `funktionstest-faelligkeit`
  175/0 · `funktionstest-500` 119/0 · `kapazitaetsmodell` 61/0 · `verdraengungsschutz` 38/0 ·
  `kommunikationsriegel` 45/0 · `mandatsklasse` 36/0 · `profil-bereitschaft` 91/0, nach §34.13
  **100/0** · `test-kohorte-500` nach §34.13 **54/0**.
- Offline-Gesamtlauf und Pflichtprüfungen des PR: siehe PR-Text und `CURRENT_STATE.md` §26.

### §34.11 Was dieser Sprint ausdrücklich NICHT ist

Keine Freigabe, keine Provisionierung. (§34.7 ist inzwischen entschieden und umgesetzt — §34.13;
das ändert an dieser Grenze nichts.) Der 500er-Funktionstest ist **weiterhin nicht startbereit**.
Die Provisionierung der Stufe A darf erst nach Merge und Production-Prüfung dieser Korrektur
empfohlen werden; davor
braucht es eine **aktuelle Grundlinie** und die vorgeschriebene **Sicherung der betroffenen
Tabellen** (§9.1–9.2). Die Betreiberwerte müssen erst vor der **Aktivierung** der Stufe A gesetzt,
wirksam und geprüft sein.

### §34.12 Adversariales Review des Diffs — vier Linsen, zwei Widerleger je Feststellung

Vier unabhängige Reviews (fail-closed des CLI · Konsistenz Plan/Code · Testvalidität/falsches
Grün · Sicherheit/Mandanten/Production-Wirkung) lieferten **24 Feststellungen**; jede wurde von
zwei weiteren Prüfern adversarial gegengeprüft (52 Agenten, 42 Minuten). Ergebnis der Widerleger:
**10 von beiden bestätigt, 0 strittig, 14 widerlegt** — davon **11 nur deshalb, weil die Korrektur
im Arbeitsbaum bereits enthalten war** (die Widerleger prüften den laufend korrigierten Stand; sie
sagen das ausdrücklich), und **3 in der Sache**: ungültige Fensterangaben waren fail closed (jetzt
trotzdem Aufruffehler), die offenen Vorbedingungsketten wurden auf „niedrig" abgeschwächt (trotzdem
geschlossen), ein stderr-Marker für den A0-Pin ist ein Gestaltungswunsch (nicht umgesetzt). Alle
Feststellungen, einzeln:

| Befund | Schwere | Behoben |
|---|---|---|
| Doppelte Angaben (`--stufe=c --stufe=a`) wurden still ignoriert — die erste gewann | mittel | Abbruch Exit 2, Test D9–D11 |
| `--jetzt=` war auch im scharfen Lauf erlaubt — eine gesetzte Uhr hätte den dritten Riegel ausgehebelt | mittel | im scharfen Lauf abgewiesen (Exit 2, kein Banner), Test E3/I5 |
| Der Plan kannte den §34.7-Blocker nicht: `provisionierung-a` galt als beginnbar | hoch | eigener Schritt `kohortenreife`, Vorbedingung jeder Anlage, `blocker.kohortenreife` |
| Der Sicherungsbefehl lief über `lokal.js` — der Starter entfernt die Kennungen, der Export bricht mit Exit 2 ab | hoch | Befehl ohne `lokal.js`, Prüfung `vollstaendig === true` benannt |
| `pruefeRueckbau` verlangte 495 Zeilen — nach Stufe A nie bestätigbar (falsches Rot am Rückweg) | hoch | stufenbewusst (`--stufe=`), Test D2.1–D2.5 |
| `werte-pruefung` behauptete einen Laufzeitbeleg, den die Hürden nicht liefern (sie lesen das lokale `process.env`) | hoch | ehrlich: nur der Deckel ist rein lesend belegbar, der Rest Betreiberangabe |
| Fachzyklus-Befehl für B/C ohne `--bestandene-stufen` — die Startbereitschaft wäre nie grün geworden | mittel | Befehl ergänzt, Test A34 |
| Isolation/Fachzyklus/Kontrolle der Stufen B/C hingen nicht an der kontrollierten Vorstufe; der Fachzyklus nicht an geprüften Werten/Riegel/Fenster | mittel | Vorbedingungen geschlossen, Test A5/A25 |
| Die Verstehens-Interessenprüfung iterierte alle Profile ohne `isDisabled` — „inaktiv = keine Last" galt nur für den Planer | mittel | Filter mit dem Planer-Prädikat, Test C2.1–C2.6 (§34.6) |
| Die inaktiv-Suite verdeckte die realen Schreibvorgänge der Anlage (Auth-Blob-Vollschreib) | mittel | Aussage präzisiert (§34.6), A6 umbenannt |
| Bundestagsreife-Blocker reproduziert; Zustand nach Abweisung sicher | hoch | dokumentiert §34.7, Plan-Vorbedingung |
| Zwei Vorbedingungen lieferte kein Schritt (`rueckbau`, `migration-llm-usage-angewendet`) | niedrig | beide werden jetzt geliefert; Test A32 |
| Banner nannte die Zielmenge vor der Prüfung der `--ids` | niedrig | Prüfung vor dem Banner |
| `plan` druckte die neuen maschinenlesbaren Felder nicht | niedrig | gedruckt |
| `testkohorte-495.js`-Hinweis warb für den pauschalen Fachzyklus; Zyklus-CLI-Kopf nannte `--startbereit=ja` | niedrig | korrigiert |
| Speicher-Schnappschuss der CLI-Suite nur zwei Dateien, keine Positivkontrolle; JSON-Parser unterschied „kein Block" nicht von „unparsebar"; I1/I2 nur über eine Teilmenge | mittel/niedrig | Schreibspion mit Positivkontrolle, am Marker verankerter Parser, alle Aufrufe gesammelt (J1–J3) |
| A7a auf relative Ordnung abgeschwächt | niedrig | Gesamtzahl 28 und Position 26 wieder gepinnt |
| Grundlinie/Sicherung sind Einmal-Kennungen, „vor JEDER Provisionierung" nicht erzwungen | niedrig | ehrlich benannt (Betreiberpflicht) |

**Bewusst nicht umgesetzt:** ein stderr-Marker für den A0-Pin im Runner (der Runner druckt
Suitenausgaben nur bei Fehlschlag; der Blocker steht in `CURRENT_STATE.md` §7 und im Plan als
Vorbedingung). **Vom Review ausdrücklich bestätigt:** kein
Rückfall auf 495/Pauschalwort in keiner Aufrufform; vor dem Stufen-Abbruch werden keine
Production-fähigen Module berührt; `--ids=` öffnet keinen Weg zu realen Mandaten; `pruefeIsolation`
mit Stufe ist nicht schwächer als ohne; der 495er-Beleg ist unverändert; keine hartkodierten
Mandanten oder Secrets; Profil-Embeddings sind deterministisch (kein Modellaufruf beim Anlegen);
beide neuen Suiten laufen im Runner und in der CI; A0 ist ein ehrlicher Charakterisierungs-Pin.

---

### §34.13 Variante (a): die Kohorte richtet sich nach der Regel

Entscheidung zu [§34.7](#347-der-blocker--die-bundestagsreife-sperre-wies-18-von-20-stufe-a-profilen-ab),
umgesetzt am 03.09.2026 im selben Branch und im selben Pull Request (#297).

**Wer entschieden hat:** der Betreiber, im Sprintauftrag vom 03.09.2026 („Schließe den
Bundestagsreife-Blocker im Pull Request #297 nach Sicherheitsrahmen §34.7 **Variante A**"). §34.7 hatte
die Wahl zwischen (a), (b) und (c) ausdrücklich dem Betreiber vorbehalten; sie ist damit getroffen und
nicht von der Umsetzung selbst hergeleitet. Was danach im Ablaufplan übrig bleibt, ist kein
Entscheidungstor mehr, sondern ein Beleg — deshalb und nur deshalb ist der Schritt `kohortenreife`
rein lesend geworden (§34.13.5).

**Die Regel bleibt, die Kohorte weicht.** Die Bundestagsreife-Sperre ist eine Schutzregel für reale
Profile; eine Ausnahme für die synthetische Kennungsfamilie hätte genau die Prüfung ausgeschaltet,
die der Funktionstest belegen soll. Deshalb wurde **nichts** an der Sperre gelockert, nichts im
Provisionierer umgangen, kein Production-Sonderfall eingeführt — geändert wurde die
Kohortenspezifikation.

#### §34.13.1 Was sich in der Kohorte geändert hat

`lib/helmut/test-kohorte-500.js` vergibt die Ausschüsse jetzt **abhängig von der politischen
Ebene** des Profils:

| Ebene | Anzahl | Ausschüsse | Herkunft |
|---|---|---|---|
| Bundestag | **434** | amtliche Bezeichnungen der 21. Wahlperiode | `quellenarchitektur/seeds/bundestag-ausschuesse.js` (`AUSSCHUSS_NAMEN`) |
| Landtag | **61** | `Testausschuss 1…12` (synthetisch) | Modulkonstante `TESTAUSSCHUESSE` |

Zwei Punkte sind dabei entscheidend:

1. **Eine Ausschusswahrheit, keine zweite Namensliste.** Die Bundestagsnamen werden aus der
   vorhandenen, extern verankerten Sollmenge **importiert**, nicht abgeschrieben. Eine Kopie wäre
   eine zweite Wahrheit und liefe bei einer Umbenennung still auseinander. Testgesichert:
   `test-kohorte-500-test.js` §11.9/§11.10 vergleichen die benutzten Namen bytegleich gegen
   `STAENDIGE_AUSSCHUESSE`.
2. **Landtagsprofile bekommen KEINE Bundestagsausschüsse.** Ein Bundestagsausschuss auf
   Landesebene wäre eine falsche politische Ebene — fachlich falsch, und die Reifeprüfung ist für
   Landtagsprofile ausdrücklich `zutreffend: false`, hätte den Fehler also nie gemeldet.
   Testgesichert: §4.5a/§4.5b und §11.0.

Die Zuweisung bleibt **deterministisch** (`index % n` und `(index + 5) % n`; 5 ist zu 24 und zu 12
teilerfremd, die zwei Ausschüsse eines Profils sind also immer verschieden). **Unverändert
synthetisch** bleiben: Kennungen `test-kohorte-<a|b|c>-<nnn>`, `.invalid`-Adressen, Mandatsnamen,
Parteien (`Testpartei N`), Themen (`Testthema N`). Ein Ausschuss ist keine Person und kein
Personendatum, sondern ein parlamentarischer Zuständigkeitsbereich — das ist der Grund, warum
gerade dieses Feld echt sein darf, während alles andere synthetisch bleibt.

#### §34.13.2 Dabei gefunden und geschlossen: veraltete Ausschussnamen wurden nicht abgewiesen

Beim Absichern der neuen Zuweisung fiel ein **eigenständiger Mangel** in
`lib/helmut/profile-readiness.js` auf, der nichts mit der Kohorte zu tun hat:

`resolveBundestagsausschuss()` las die dokumentierte Negativliste `VERALTETE_AUSSCHUSSNAMEN` nur
im **Fehlerzweig** — also erst, wenn die Tokenauflösung ohnehin schon gescheitert war. Weil die
Sollmenge stabile Schlüssel führt und mehrere WP-21-Bezeichnungen **Obermengen** ihrer Vorgänger
sind, lösten **drei von vier** dokumentierten Altbezeichnungen sauber auf und galten als gültig:

| Eingabe (veraltet) | löste auf zu | jetzt |
|---|---|---|
| „Ausschuss für Ernährung und Landwirtschaft" (WP 20) | `landwirtschaft-ernaehrung-heimat` | abgewiesen |
| „Ausschuss für Digitales" (WP 20) | `digitales-staatsmodernisierung` | abgewiesen |
| „Ausschuss für Inneres und Heimat" (WP 20) | `inneres-heimat` | abgewiesen |
| „Ausschuss für Verkehr und digitale Infrastruktur" (WP 19) | — (schon vorher abgewiesen) | abgewiesen |

Die Negativliste war also **nur auf den Katalog** angewandt (Selbstschutz der Sollmenge), nie auf
ein **Profil**. Behoben: die Prüfung auf veraltete Bezeichnungen läuft jetzt **zuerst** und weist
ab. Das ist eine **Verschärfung**, keine Lockerung — und sie ist kein Rundumschlag: alle 24
gültigen Bezeichnungen und die gebräuchlichen Kurzformen bleiben auflösbar (`profil-bereitschaft-test.js`
R1–R9, `test-kohorte-500-test.js` §11.5–§11.8).

Drei Punkte dazu, ausdrücklich, weil sie im Review aufkamen:

1. **Der Abgleich ist normalisiert, nicht bytegenau.** Die erste Fassung verglich die Zeichenkette
   exakt und wäre durch Kleinschreibung, doppelte Leerzeichen, einen Punkt am Ende oder Bindestriche
   zu umgehen gewesen — während der Tokenabgleich darunter normalisiert. Jetzt läuft beides über
   dieselbe Faltung. **Nicht** über eine Wortmenge: die stabile Kennung `inneres-heimat` (Kurzform
   des heutigen „Innenausschuss") trägt genau die Wörter der veralteten Bezeichnung und würde dabei
   fälschlich abgewiesen. Die Wortfolge bleibt deshalb erhalten. 36 Schreibvarianten geprüft, alle
   abgewiesen; 32 gültige Namen und Kurzformen geprüft, keine abgewiesen (R7/R8).
2. **Eine gewollte Asymmetrie.** „Ausschuss für Digitales" ist der belegte amtliche Name der 20. WP
   und wird abgewiesen; die bloße Kurzform „Digitales" löst weiterhin auf den heutigen „Ausschuss
   für Digitales und Staatsmodernisierung" auf. Wer die volle frühere Bezeichnung hinschreibt, meint
   erkennbar den alten Zuschnitt — genau davor schützt die Negativkontrolle. Gepinnt in R9: fällt der
   Name eines Tages aus `VERALTETE_AUSSCHUSSNAMEN` heraus, kippt der Test und die Entscheidung wird
   neu getroffen.
3. **Reichweite: eine Anzeige ändert sich, keine Sperre.** Der Resolver hat zwei Einstiege.
   `pruefeNeuaktivierung` ist die harte Sperre und gilt nur dem **neuen** Aktivierungsübergang.
   `bewerteBundestagsprofil` ist die rein lesende Bewertung und läuft auch über **bestehende**
   Profile (Admin-Profilansicht, Speicher-Antwort, Mandatsliste in `server.js`). Ein bestehendes
   Mandat, dessen Ausschussfeld noch eine Bezeichnung einer früheren Wahlperiode trägt, wird dort ab
   jetzt als „ungültig" **angezeigt**. Das ist gewollt — es ist der Hinweis, die Angabe auf die
   laufende Wahlperiode zu ziehen —, aber es deaktiviert nichts, schreibt nichts um und blockiert
   keinen Verarbeitungsschritt. **Ungeprüft:** ob eines der fünf realen Mandate betroffen ist; ein
   lesender Production-Abgleich der Ausschussfelder war in dieser Sitzung nicht möglich (siehe
   §34.13.6).

#### §34.13.3 Der Beleg am echten Pfad — A0 ist gekippt, wie angekündigt

`testkohorte-provisionierung-inaktiv-test.js` pinnte den Blocker (`A0`). Dieser Pin ist ersetzt
durch einen **positiven Beleg des echten, unveränderten Provisionierungspfades**:

- **A0.1** — der Lauf benutzt **keine Reife-Attrappe** (Prüfung über den eigenen Quelltext: der
  Aufruf injiziert kein `readiness`).
- **A0.2** — Stufe A: **20 angelegt, 0 fehlgeschlagen, `ok: true`**.
- **A0.3** — **kein** `bundestagsprofil-nicht-bereit` in irgendeinem Ergebnis.
- **A0.4** — die 18 Bundestags- und 2 Landtagsprofile der Stufe A sind je nach Ebene korrekt
  behandelt.

Und als Gegenprobe, damit die Sperre nicht bloß „grün" ist, sondern **wirkt**:

- **A0a.1** — ein Profil mit unbekanntem Ausschuss wird weiterhin abgewiesen.
- **A0a.2** — die Abweisung geschieht **vor jedem Schreibvorgang**: 0 Profile, 0 Konten, 0 Schreibvorgänge.
- **A0a.3** — jede der vier veralteten Bezeichnungen wird abgewiesen.
- **A0a.4** — im Provisionierer existiert **kein Sonderpfad** für die synthetische Kennungsfamilie
  (Prüfung über `provisioning.js`).

Die Reifeprüfung nimmt die **gesamte Kohorte** an: **495/495** bestehen die Prüfung ihrer
politischen Ebene (434 Bundestagsprofile reif, 61 Landtagsprofile `zutreffend: false` und über
`validateProfile` getragen); stufenweise **20/20 · 75/75 · 400/400**
(`test-kohorte-500-test.js` §11.1–§11.4).

#### §34.13.4 Welche Quellenpakete die echten Ausschussnamen ziehen — und was das an Last bedeutet

Ausdrücklich nachgemessen, weil echte Ausschussnamen echte Paketlogik auslösen können.

`resolveProfilePackages()` wertet von allen Ausschüssen **genau einen** aus:
`normalizeCommittee(a) === "arbeit-und-soziales"`. Alle übrigen 23 Bezeichnungen ändern die
Paketwahl **nicht**. Ergebnis über die Kohorte:

| | Profile | Sachpakete | Quellen |
|---|---|---|---|
| unverändert | 453 | wie vorher | wie vorher |
| **+1 Paket** (`arbeit-und-soziales`, Status aktiv) | **42** | +1 | je **+84** |

Keine Mehrfachzuweisung: kein Profil erhält mehr als **ein** zusätzliches Paket
(`test-kohorte-500-test.js` §11.14–§11.16).

Warteschlangenwirkung, kohortenweit gemessen über den echten Planer:

| Auftragsklasse | vorher | nachher |
|---|---|---|
| `source_fetch` (kohortenweit dedupliziert) | 54 | **138** (+84, **einmalig**) |
| `mandate_projection` (je Profil) | 495 | 495 |
| `briefing_materialization` (je Profil) | 495 | 495 |

Der Zuwachs ist **einmalig und KI-frei** (Crawl-Arbeit, keine Modellaufrufe). Die
mandatsgebundenen Klassen — die das Kapazitätsmodell in [§30.7](#307-fällt-blocker-2-damit-weg) tragen
(1.812 gegen 2.522) — bleiben **unverändert**. Damit ist das Kapazitätstor von dieser Änderung
nicht berührt. Der Zuwachs fällt in den bereits offenen Punkt „Laufzeit der KI-freien
Warteschlangenklassen (ungemessen)".

**Einschränkung, ausdrücklich:** gemessen wurde gegen den **Offline-Quellenkatalog**, weil
`scripts/lokal.js` `HELMUT_SOURCE_MODE=off` erzwingt. Die Zahl 84 ist die Katalogzahl, nicht ein
Production-Messwert. In Production kann die Paketgröße abweichen; die **Struktur** der Aussage
(genau ein zusätzliches Paket für genau 42 Profile, mandatsgebundene Klassen unverändert) hängt
nicht vom Katalog ab.

Ob das erwünscht ist: **ja.** Ein Funktionstest, dessen Profile echte Zuständigkeiten tragen,
erzeugt realistischere Quellenarbeit als einer mit Phantasieausschüssen — und er tut es hier ohne
jede Wirkung auf die KI-Last.

#### §34.13.5 Was sich am Ablaufplan geändert hat

Der Schritt `kohortenreife` war eine **offene Betreiberentscheidung** („nie durch einen Lauf
lieferbar"). Er ist jetzt ein **rein lesender Beleg**: `freigabe: null`, belegbar durch den Lauf
der beiden genannten Suiten. Er bleibt **Vorbedingung jeder Anlage** — kein Anlegen ohne frischen
Reifebeleg. Die Vorbedingungskennung heißt entsprechend
`kohortenspezifikation-reifesperre-belegt` (vorher `…-entschieden`). Der Eintrag
`blocker.kohortenreife` bleibt im Plan stehen, jetzt mit `offen: false` und Beleg — ein spurlos
entfernter Blocker wäre die unehrlichere Variante. Gesamtzahl der Schritte unverändert **28**.

#### §34.13.6 Was dieser Teil ausdrücklich NICHT ist

Keine Production-Wirkung: keine Provisionierung, keine Aktivierung, keine Migration, keine
Umgebungsvariable, keine Cron-, Azure-, Budget- oder Reserveänderung, kein Modellaufruf, keine
externe Nachricht, kein Merge. In Production existiert **kein** synthetisches Kohortenprofil —
diese Änderung berührt dort nichts. Sie macht den Funktionstest **auch nicht startbereit**: die
acht Betreiberwerte, `HELMUT_TESTLAUF_VORRANG_REAL`, eine aktuelle Grundlinie und die
vorgeschriebene Sicherung der betroffenen Tabellen bleiben getrennte, spätere
Betriebsvoraussetzungen. Die zuletzt gelesene Production-Warteschlange (207 wartend, 188 fällig)
ist eine Momentaufnahme; kein Schritt dieses Sprints wirkt darauf schreibend ein.

**Eine unbewiesene Aussage, ausdrücklich benannt:** ob eines der fünf realen Mandate in Production
ein Ausschussfeld mit einer Bezeichnung einer früheren Wahlperiode trägt, ist **nicht geprüft**. Ein
rein lesender Abgleich gegen Production war in dieser Sitzung nicht möglich. Wirkung im schlimmsten
Fall: die Admin-Ansicht zeigt für dieses Mandat „ungültig: committees" an (Anzeige, keine Sperre —
§34.13.2 Punkt 3), und eine **Neuaktivierung** dieses Mandats würde abgewiesen. Vor dem Merge lässt
sich das mit einer einzigen lesenden Abfrage der Spalte `committees`/`deputy_committees` klären.
