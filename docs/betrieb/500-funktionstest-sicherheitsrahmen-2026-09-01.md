# 500er-Funktionstest — technischer Sicherheitsrahmen (Beleg, 2026-09-01)

**Sprint:** rein vorbereitender Sicherheitssprint für den später **getrennt
freizugebenden** Production-Funktionstest mit 500 aktiven Profilen
(5 real + 495 synthetisch).
**Branch:** `claude/security-sprint-functional-test-wap0q1`, Basis `main` =
`b998e9bc6a0ecca0cd3d43e344f03101c0ede5f0`.

**Dieser Sprint hatte KEINE Production-Wirkung.** Kein Modellaufruf, keine
Production-Datenänderung, keine Provisionierung, keine Aktivierung, keine
Migration, keine Cron-/Env-/Secret-/Flag-/Budget-Änderung, kein Merge, kein
Deployment. Der Supabase-Zugriff dieser Sitzung war ausschließlich `SELECT`,
der Vercel-Zugriff ausschließlich lesend.

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
| **Rechnerische/architektonische Tragfähigkeit** | **vorbereitet — finaler Production-Deckel OFFEN.** Die Spanne 1.492–2.416 Aufrufe/Tag bleibt eine **Szenariospanne**, kein Deckel (§4). |
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
`z3b-azure:stichprobe:21:<lauf>:nach-vorprobe:<vorprobe-lauf>` und trägt damit
die Laufkennung einer **bereits gelaufenen** Vorprobe. Diese Kennung kann es
vor der Vorprobe nicht geben — die Kette ist strukturell unterbrochen, nicht
nur organisatorisch. Zusätzlich: eine prozessweite Paketsperre ohne Rücksetzer,
ein Verbot des Selbstbezugs (`vorprobeLauf === lauf`), und der Bericht führt den
Vorprobebeleg mit (Schema `v3`).

**In diesem Sprint wurde kein Modellaufruf ausgeführt.** Der Nachweis dafür ist
kein Versprechen, sondern gemessen: `scripts/z3b-azure-freigaberiegel-test.js`
führt 25 unvollständige Konfigurationen gegen einen **zählenden** fetch-Ersatz
und belegt einen Zählerstand von **0**.

## 4 · Kapazitäts- und Kostenriegel — Entscheidungstabelle

Sieben Pflichtwerte. **Fehlt einer, meldet `pruefeKonfiguration()` `bereit=false`
und der Test darf nicht beginnen.**

| Wert | Umgebungsname | Empfehlung | Herkunft | offen |
|---|---|---|---|---|
| Gesamtdeckel | `HELMUT_MAX_LLM_CALLS_PER_DAY` | **1.492–2.416 (Spanne)** | `kapazitaet-500.zielDeckel()`: konservativer Bedarf ÷ 0,75; Untergrenze 2n−1 = **999** | p95-Tagesbedarfe je Fachweg, Azure-Kontingente |
| Verstehens-Reserve | `HELMUT_LLM_RESERVE_UNDERSTANDING` | **702** (Anteil **IM** Deckel) | konservativer priorisierter Frischbedarf | p95-Tagesbedarf Verstehen |
| Anfragen/Minute | `HELMUT_TESTLAUF_MAX_RPM` | **OFFEN** | Azure-Portal, rein lesend | Azure-Kontingente/Rate-Limits |
| Token/Minute | `HELMUT_TESTLAUF_MAX_TPM` | **OFFEN** | erst nach der 21er-Stichprobe belegbar | Azure-Kontingente, p95 je Fachweg |
| Kostenbudget | `HELMUT_TESTLAUF_KOSTENBUDGET_USD` | **OFFEN** | Deckel × gemessene Kosten je Aufruf | Azure-Preis am Lauftag (F7 unbelegt) |
| Vorrang reale Mandate | `HELMUT_TESTLAUF_VORRANG_REAL` | **mindestens 5** | Zahl der realen Mandate | p95-Tagesbedarf der 5 realen Mandate |
| Parallelität | `HELMUT_TESTLAUF_MAX_PARALLEL` | **1** | `HELMUT_VERSTEHEN_PARALLELITAET` ist ungesetzt und wirkt als 1 | — |

**Verbindliche Semantik:** Die Reserven liegen **innerhalb** des Deckels und
werden **nie** addiert. Geprüfte Bindungen: Deckel ≥ 2n−1 · Reserve < Deckel ·
Verstehens-Reserve + Vorrangreserve < Deckel · Vorrangreserve ≥ 5 ·
Parallelität ≤ RPM · Deckel ≤ RPM × 1440.

**Die Werte 1.492–2.416 sind SZENARIEN, kein finaler Production-Deckel.** Die
verbindliche Festlegung braucht zuvor die fünf offenen Messungen
(`zielDeckel().offeneMessungen`) und bleibt eine getrennte Betreiberfreigabe.
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

Der Minimal-Cron `18,48 * * * *` **bleibt aus**; `vercel.json` ist unverändert
(13 Einträge, testgesichert). Dokumentiert und getestet ist:

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
2. Die **echten Azure-Werte**: Vorprobe (3) und Stichprobe (21) sind gebaut,
   aber **nicht ausgeführt**. Azure bleibt extern gesperrt (Anmelderiegel,
   [`z3b-azure-messplan-2026-08-27.md`](z3b-azure-messplan-2026-08-27.md)).
3. Der **finale Production-Deckel** und die zugehörige Verstehens-Reserve.
4. Die **05:45/05:48-Laufzeitüberschneidung** — offen, deshalb im Startfenster
   gesperrt (§7).
5. Der **Kommunikationsriegel unter echter Production-Last**: offline für alle
   495 Profile mit Netzzähler 0 belegt, in Production nie gelaufen.
6. Der **siebentägige Nachweis** der jeweiligen Vorstufe (Stufentore
   5→10→…→500) bleibt für den regulären Betrieb bestehen; die kurzen
   Kontrollen aus §10.1 ersetzen ihn ausdrücklich **nur** für diesen internen
   Funktionstest.

## 12 · Welche Messwerte fehlen

| Messwert | Woher | Blockiert |
|---|---|---|
| `p95-tagesbedarf-verstehen` | natürliche Läufe | Deckel, TPM |
| `p95-tagesbedarf-lage` | natürliche Läufe | Deckel |
| `p95-tagesbedarf-buero` | natürliche Läufe | Deckel |
| `azure-kontingente-und-rate-limits` | Azure-Portal, rein lesend | RPM, TPM |
| `vollstaendiger-fachwegbericht` | Z3b | Deckel |
| Azure-Preis am Lauftag (F7) | Kontopreis am Lauftag | Kostenbudget |
| Laufzeit-/Tokenwerte je Arbeitsform | Vorprobe 3 + Stichprobe 21 | TPM, Kostenbudget |

## 13 · Die einzeln notwendigen Freigaben (streng getrennt)

1. **Azure-Anmeldung** wieder freigeben (Anmelderiegel, 24-h-Wartezeit).
2. **Vorprobe: 3 Modellaufrufe** — eigene Kostenfreigabe.
3. **Stichprobe: 21 Modellaufrufe** — eigene Kostenfreigabe, erst nach grüner
   Vorprobe; die Freigabekennung verlangt technisch deren Laufkennung.
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
| `z3b-azure-laeufer-test.js` (wiederhergestellt) | **64 PASS / 0 FAIL** |
| `z3b-azure-freigaberiegel-test.js` (neu) | **20 PASS / 0 FAIL** — Netzzähler 0 |
| `kommunikationsriegel-test.js` (neu) | **39 PASS / 0 FAIL** — 495/495 gesperrt, Netzzähler 0 |
| `testkohorte-betrieb-test.js` (neu) | **74 PASS / 0 FAIL** |
| `funktionstest-500-test.js` (neu) | **92 PASS / 0 FAIL** |

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
