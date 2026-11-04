# Sprint D2: letzter Administrator

**Die unveränderte Baseline kann den letzten anmeldbaren Administrator verlieren. Der kleine vorbereitete Patch besteht alle sieben gezielten lokalen HTTP-Szenarien; zusammen mit D1 bestehen zusätzlich alle 30 gezielten Kombinationsprüfungen. Im bestehenden Arbeitsbranch wurden beide Patches nicht angewandt.**

## Belegter Fehler

Branch `feat/claude-backend-isolated`, Commit `ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`. `lib/helmut/accounts.js:240` prüft beim Bearbeiten nicht, ob ein weiterhin anmeldbarer Administrator übrig bleibt. Die bestehenden Löschsperren (`accounts.js:346`) schützen nur die Löschaktion.

| Gezielt geprüfter Fall | Unveränderte Baseline | Patch im Wegwerfklon |
|---|---|---|
| Letzter Admin → `status:deaktiviert` | HTTP 200; 0 anmeldbare Admins | HTTP 409; ursprüngliches Konto unverändert |
| Letzter Admin → `active:false` | HTTP 200; 0 anmeldbare Admins | HTTP 409; ursprüngliches Konto unverändert |
| Letzter Admin → Rolle `referent` | HTTP 200; 0 anmeldbare Admins | HTTP 409; ursprüngliches Konto unverändert |
| Zusätzlich nur gesperrter und eingeladener Admin vorhanden; letzter anmeldbarer Admin → `gekuendigt` | HTTP 200; 0 anmeldbare Admins | HTTP 409; unbenutzbare Ersatzkonten zählen nicht |
| Selbst-/Adminlöschung und legitime Übergabe | Selbstlöschung 400, fremder Admin 403; Entzug/Rollenwechsel bei verbleibendem anmeldbarem Admin 200 | Unverändert bestanden |
| Zwei gleichzeitige eigene Statusentzüge | Beide HTTP 200; Endstand 1 anmeldbarer Admin | HTTP 200 + 409; Endstand 1 |
| Zwei gleichzeitige eigene Rollenentzüge | Beide HTTP 200; Endstand 0 anmeldbare Admins | HTTP 200 + 409; Endstand 1 |

Der parallele Statusfall hat **keinen** Null-Admin-Endstand reproduziert. Beide Aktionen meldeten Erfolg, obwohl im Endbestand ein Statusentzug nicht wirksam blieb. Der genaue nachgelagerte Schreiber wurde in diesem Sprint nicht isoliert; diese Beobachtung ist kein Nachweis eines belastbaren Schutzes. Der parallele Rollenfall belegt den vollständigen Verlust der Verwaltungsrolle tatsächlich.

## Durchführung und Grenzen

- Baseline: **1/7 Szenarien bestanden, 6/7 fehlgeschlagen; 6 PASS/15 FAIL Einzelprüfungen; 29 HTTP-Requests**, Exit 1. Der rote Beleg bleibt erhalten.
- Kandidat: **7/7 Szenarien, 21/21 Einzelprüfungen bestanden; 29 HTTP-Requests**, Exit 0. Je ein gezielter Durchlauf, keine Wiederholung der D1-Kontosuite.
- Pro Szenario ein frischer rein lokaler Git-Klon mit eigenen Metadaten, leerem Store und ausschließlich synthetischen Konten unter `/tmp/helmut-sprint-d2-runtime-*/repo`. Alle 14 Laufzeitklone wurden danach entfernt. Direkte synthetische Konto-Fixtures bereiten die Fälle vor; Kontoanlage ist bereits in D1 über HTTP belegt.
- Echte `server.js`-, Auth-, CSRF-, Passwort-/Session- und Persistenzpfade. Nur `/api/auth/login`, `/api/security/csrf` und `/api/admin/users/:id` über HTTP. Bindung ausschließlich `127.0.0.1`, zufälliger Port. Der Endbestand wird nach der HTTP-Antwort aus dem tatsächlichen Auth-Store gelesen.
- Die parallelen Fälle setzen ausschließlich eine Synchronisationsbarriere **vor** der echten `accounts.updateUser`-Mutation: Beide echten HTTP-Requests müssen ihre Auth-/CSRF-/Rollenprüfung bereits bestanden haben. Der vorhandene atomare Schreibpfad selbst bleibt echt. Damit wird die Konkurrenz gezielt erzeugt; dies ist keine Mehrprozess-/Supabase-Abnahme.
- Als anmeldbar zählt im Endbestand eine Adminrolle mit `active !== false`, erlaubtem Status und vorhandenem Passwort-Hash/Salt. Die verwendeten aktiven Ausgangskonten haben sich vorher tatsächlich über HTTP angemeldet. Nach jeder Änderung wurde kein zusätzlicher frischer Passwortlogin ausgeführt.
- `scripts/lokal.js` und explizite kleine Environment-Allowlist, lokaler Speicher, Quellenmodus aus, Kommunikationsriegel `gesperrt`; vorhandene Pakete nur lesend über `NODE_PATH=/workspace/helmut-pilot/node_modules`. Keine geerbten Credentials, Installation, externe Verbindung, Modellaufrufe oder Dienste außerhalb des eigenen Testprozesses.
- In allen Szenarien: **0 Profil-Schreibversuche, 0 persistierte Profile, 0 Fetchversuche**. Keine Motor-, UI-, Profilaktivierungs-, Scheduler-, Budget-, Quellen- oder 500er-Aktion. D1-Belege unverändert.

## Vorbereiteter Patch

[sprint-d2-last-admin.patch](sprint-d2-last-admin.patch) ergänzt ausschließlich `lib/helmut/accounts.js`. Vor der Mutation wird festgehalten, ob das Ziel ein anmeldbarer Admin war. Innerhalb derselben wiederholbaren Auth-Mutation wird vor dem Schreiben geprüft, ob weiterhin mindestens ein solcher Admin existiert. Andernfalls 409. Die vorhandene lokale Warteschlange/CAS-Wiederholung (`storage.js:807`) führt diese Prüfung jeweils gegen den aktuellen Stand aus. Eingeladene Konten ohne Passwort und gesperrte Konten ersetzen den letzten Zugang nicht.

Basiscommit, SHA256 der unveränderten `accounts.js` und Patch-SHA256 sind im neuen Test fest gebunden. Der Patch wurde ausschließlich in den sieben Kandidat-Wegwerfklonen angewandt. Nur dort ist `lib/helmut/accounts.js` als geänderte Datei erwartbar; alle neun beobachteten Quelldateien blieben während der Requests konstant. Der bestehende Arbeitsbranch blieb bei allen neun Dateien auf den ursprünglichen Hashes und `git diff HEAD` leer.

Der bestehende D1-Statuspatch lässt sich auf dem D2-Kandidaten konfliktfrei mit `git apply --check` prüfen. D2 repariert keine bereits verlorene Adminrolle und ersetzt den separaten D1-Sperrstatusfix nicht.

## Getrennter Kombinationsnachweis D1 + D2

Zusätzlich ausdrücklich beauftragt: Der neue Treiber [sprint-d-kombination-test.js](../../scripts/sprint-d-kombination-test.js) bindet beide Patch- und beide vorhandenen Testskript-Hashes. Er wendet beide Patches nur in acht weiteren frischen Wegwerfklonen an und verwendet die **unveränderten** D1-/D2-Worker. Die historischen Testquellen und sämtliche vorherigen Rot-/Grünbelege bleiben erhalten.

Ergebnis: **8/8 Fälle, 30/30 Prüfungen PASS, 56 HTTP-Requests, Exit 0**. Darin enthalten sind ausschließlich die D1-Statusregression (9 Prüfgruppen/27 Requests) sowie die sieben D2-Fälle (21 Einzelprüfungen/29 Requests). Die vollständige 60-Request-Kontosuite wurde nicht wiederholt. In allen Workern liegt dieselbe kombinierte `accounts.js` vor: SHA256 `608838b6674a17c1028bd3cda3edcb129188f6d75923fbb7b62bab04fdf6e703`.

Damit sind Sperrstatuskonflikte beider Statuswerte, normale Sperren/Sitzungsentzug, bewusste Reaktivierung und letzter-Admin-Schutz samt lokaler gleichzeitiger Entzüge gemeinsam gezielt bestanden. Auch hier null Profil-Schreib-/Fetchversuche; alle acht Laufzeitklone entfernt. Der separate [Kombinationsbeleg](sprint-d-kombination-20261104.json) enthält die vollständigen Workerbelege und unveränderte Hashes des bestehenden Arbeitsbranches. Es bleibt eine lokale Einprozessprüfung mit der beschriebenen Barriere, keine Abnahme verteilter Datenbankprozesse.

## Dateien und Reproduktion

Nur sieben neue D2-/Kombinationsdateien einschließlich dieses Berichts; kein Commit, Push, PR, Merge oder Deployment:

| Datei | SHA256 |
|---|---|
| [Test](../../scripts/sprint-d2-last-admin-test.js) | `0570d4fc80432ecf66cead592e64ddea39409cee1d7a5ad4bb576fc791e51a09` |
| [Baselinebeleg](sprint-d2-baseline-20261104.json) | `be8ce834b8fa60f67fdc43f4055eb1bfe64cb9a57ccda6e56b7f5bf254a0245a` |
| [Kandidatbeleg](sprint-d2-kandidat-20261104.json) | `430d31843011da7a6ad43e5410c92b893fc4351826ab3f664461e66b9be66861` |
| [Patch](sprint-d2-last-admin.patch) | `e5c2f1abf7d340c671c76187bf743d55e3fbca0a5b18398aca52bd967957868a` |
| [Kombinationstreiber](../../scripts/sprint-d-kombination-test.js) | `520ff7a1e3fdcbad4f197a1ecc44b1b7f9a422945358cbefcb5cbb79aa42607b` |
| [Kombinationsbeleg](sprint-d-kombination-20261104.json) | `b61157cae36ae0fa1884a447e06636f270369ab388887f7f230139268736b3a2` |

Unveränderte `accounts.js`: `08cfa25c4753721277b39fb7ff60ad0023d6381533fd039c337755bad84fe82e`.

Nur im getrennten B-Arbeitsbereich und mit der im Test angegebenen `fixedEnv`-Allowlist:

```text
node scripts/lokal.js scripts/sprint-d2-last-admin-test.js
node scripts/lokal.js scripts/sprint-d2-last-admin-test.js --candidate-patch docs/backend-isolated/sprint-d2-last-admin.patch
node scripts/lokal.js scripts/sprint-d-kombination-test.js
```

Der Test verweigert Root/`helmut-pilot` als Arbeitsbereich und legt seine eigenen Laufzeitklone an.

**Nächster sicherer Schritt:** Die gemeinsam gezielt bestandenen D1-/D2-Kandidaten unabhängig prüfen und koordiniert im gemeinsamen `accounts.js` übernehmen. Bis dahin die gemeinsame Baseline nicht für Status-/Rollenentzüge des letzten Administrators freigeben. Keine UI- oder Motorumbauten erforderlich. Mehrprozess-/DB-Konkurrenz und bestehende Kontobestände bleiben getrennte offene Nachweise.
