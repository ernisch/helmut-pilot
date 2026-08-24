# Fundament 25 Mandate — Vorbereitungssprint 2026-08-24

**Rolle:** kanonischer Beleg des Vorbereitungssprints „Fundament 25 Mandate" (Teil B
Skalierungspfad, Teil C Profilpaket, Teil D Startblocker). Statuszusammenfassung:
[`../CURRENT_STATE.md`](../CURRENT_STATE.md) §8. **Dieser Sprint hat Production nicht
verändert:** keine Abfrage, kein Import, keine Aktivierung, keine Migration, kein Flag,
kein manueller Lauf, kein Actions-Lauf, kein Merge, kein Deployment.

---

## 1 · Teil B — Verbindlicher Skalierungspfad

### 1.1 Der Stufenplan bleibt verbindlich (Prüfergebnis)

Geprüft wurde, ob ein späterer kanonischer Beleg den Stufenplan der Zielarchitektur ersetzt.
**Ergebnis: Nein.** [`op30-zielarchitektur-2026-08-13.md`](op30-zielarchitektur-2026-08-13.md)
**§14** bleibt der verbindliche Stufenplan (er selbst ersetzte den älteren Plan aus
[`op30-kapazitaet-morgenslots-2026-08-09.md`](op30-kapazitaet-morgenslots-2026-08-09.md) §10).
Spätere Abschnitte schärfen ihn, ersetzen ihn aber nicht:

- Runbook [`op30-aktivierung-5-mandate.md`](op30-aktivierung-5-mandate.md) **§21**
  (Härtungssprint 2026-08-14): Standardtransport `sqs`, Selbstweck gesperrt.
- Runbook **§22**: vollständige AWS-Betreiberanleitung für Stufe 2 — „**Nichts davon ist
  getan**".
- Runbook **§30.7** (2026-08-24): schließt ausschließlich **Versuch 5 = Stufe 1** ab.

Damit gilt unverändert (Zielarchitektur §14):

| Stufe | Mandate | Kern | Nachweis |
|---|---|---|---|
| 1 ✅ | 5 | `HELMUT_SCALABLE_PIPELINE=on` + Dispatch `shadow` | erbracht: Versuch 5, §30.7 (376 Abschlüsse, elf §28.6-Kontrollen) |
| 2 ⬜ | 5 | `HELMUT_KLASSEN_GRENZEN=on` + Dispatch **`queue`** | **Abfluss ≥ Ankunft über 7 Tage · 0 Verlust · 0 Doppelarbeit · ältester offener Auftrag dauerhaft < 24 h** |
| 3 ⬜ | 25 | `HELMUT_LLM_FAIRNESS=on` + Drain 2 | OP-25 **vollständig neu** bestanden + 20 echte Profile |

**Versuch 5 ist ausdrücklich KEIN Queue-Nachweis.** `HELMUT_JOB_DISPATCH_MODE` stand
durchgehend auf `shadow`: die Outbox wurde beschrieben, aber nichts verließ den Prozess;
der Antrieb war der Cron. Die Stufe-2-Kriterien (7 Tage, Queue-Antrieb) sind unberührt offen.

### 1.2 Transportfrage: was Stufe 2 tatsächlich braucht

- **Standardtransport ist `sqs`** (Runbook §21 Punkt 1, seit 2026-08-14). Der frühere
  „erste produktive Transport" `selbstweck` ist in Production **ohne
  `HELMUT_SELBSTWECK_ERLAUBT=on` gesperrt** und nur noch Notfall-/Entwicklungsweg.
- `vercel-queues` ist gebaut, aber **fail closed ohne installiertes SDK**; Aktivierung wäre
  eine eigene kostenpflichtige Gründerentscheidung (Public Beta, keine EU-Residenzzusage im
  Failover; [`env-inventar.md`](env-inventar.md) §4).
- **Die AWS-Ressourcen existieren nicht** (Runbook §21 Punkt 2): Queue, Dead-Letter-Queue,
  KMS-Schlüssel, IAM-Sender, Lambda-Verbraucher. Vorlage:
  `infra/aws/helmut-auftrags-queue.yaml` (erstbereitstellbar seit der
  CloudFormation-Korrektur, Zielarchitektur §26), Region eu-central-1, Secrets als
  SSM-SecureString. Datenumfang über die Transportgrenze: nur `{jobId, schemaVersion}`;
  die eigentliche Vertrauensentscheidung ist der **Supabase-service_role-Schlüssel in AWS**
  (Runbook §22.1).
- Die fünf OP-30-Migrationen (inkl. beider `20260814`-Paare) sind seit 15.08. angewendet
  (§24.10) — **für Stufe 2 fehlt keine Migration**, nur AWS + Flags.

### 1.3 Benötigte Betreiber-/Gründerentscheidungen vor Stufe 2

1. **Gründerentscheidung AWS-Kosten** (SQS je Anfrage, Lambda, KMS, CloudWatch; Mengen
   Zielarchitektur §23: bei 5 Mandaten ~612 Nachrichten/Tag ≈ ~123 Lambda-Aufrufe/Tag).
2. **Betreiberausführung nach Runbook §22:** Stack anlegen, SSM-Parameter, Lambda-Paket,
   IAM-Sender-Zugangsdaten in Vercel, dann `HELMUT_SQS_QUEUE_URL`,
   `HELMUT_KLASSEN_GRENZEN=on`, `HELMUT_JOB_DISPATCH_MODE=queue` + Redeploy.
3. **Messfenster-Festlegung:** Beginn der 7 Tage, Kennzahlenquelle (Motor-Quittungen
   `warteschlange-*`, R4/Watchdog), Abbruchgrenzen (§28.6 sinngemäß) — Rücknahme in einem
   Schritt: Dispatch `shadow`/`off` + Redeploy (Runbook §21.2 Punkt 7).
4. **Keine KI-Deckel-Änderung nötig für Stufe 2** (5 Mandate: Deckel „trägt nur im
   günstigen Fall — beobachten", §23). Die Deckel-Entscheidung gehört zu Stufe 3 (§1.5).

### 1.4 OP-15 und die 10-Mandate-Schwelle

Ein Start **über ~10 Mandate ist ohne strukturelle OP-15-Lösung nicht sinnvoll**:

- Zielarchitektur §23: „OP-15 (Google-Drosselung) ist nicht mit echten Messungen gelöst und
  bleibt **ab ~10 Mandaten Blocker**." §14 führt OP-15 formal erst als
  Stufe-4-Voraussetzung — der Belegtext §23 hält die Schwelle bei ~10; dieser Widerspruch
  ist zu Lasten der vorsichtigeren Aussage aufzulösen.
- 146 von 163 Katalogwegen laufen über Google News; die Drosselung trifft **zuerst die
  mandatsindividuelle Versorgung** (29 von 42 Personensuchen lieferten im Betriebszeitraum
  nie; Restliste OP-15).
- Konsequenz für Stufe 3 (25 Mandate): vorher OP-15(b) (Direkt-RSS-Umstellung der Kernwege,
  telemetrie-belegt) **oder** eine ausdrückliche, dokumentierte Gründer-Risikoübernahme.

### 1.5 KI-Budget ab 25 Mandaten

Der Deckel 100+30 **reicht ab 25 Mandaten nicht** (Zielarchitektur §23: 204
Verstehensaufträge, 88–265 KI-Aufrufe/Tag). Vor Stufe 3: Gründerentscheidung Deckelhöhe,
`HELMUT_LLM_FAIRNESS=on` (Stufenplan) und Prüfung `HELMUT_LLM_GLOBAL_ANTEIL` (gemessener
Bedarf ist zu 80–98 % global; Standard 0,5 wäre zu knapp — [`env-inventar.md`](env-inventar.md) §4).

### 1.6 Lage-Kapazität (eigenständiger Produktblocker)

Der Lage-Cron schafft **2 Mandate je Tageslauf** (Zeitbudget; systemErrors 21.–23.08.).
Bei 25 Mandaten wäre jede vollständige Lage-Rotation ≈ **13 Tage** — unabhängig vom
Queue-Durchsatz (der Morgen-Briefing-Pfad skaliert, die Lage rotiert). Vor Stufe 3 ist eine
Kapazitäts-/Produktentscheidung nötig (mehr Lage-Slots im Queue-Betrieb, geändertes
Produktversprechen oder gestaffelte Lage-Frequenz). Der Bot meldet den Rückstand seit
PR #266 als Produkthinweis, nicht als Störung.

### 1.7 Parallel vorbereitbar ohne Production-Änderung

- Profilpaket 20 (dieser Sprint, §2) — lokal, deaktiviert.
- Verifikationslauf der Profilquellen (vorbereitet, §2.4) — Ausführung freigabepflichtig.
- Gate-je-Land-Code für Berlin/Brandenburg neu aufsetzen (PR #132 wurde am 31.07.
  **ungemergt geschlossen**; die Befunde B-1…B-5 dort bleiben gültig).
- Direkt-RSS-Kandidaten für OP-15(b) quellenweise vorbereiten (Seeds lokal).
- OP-25-Wiederholungsplan und Abbruchgrenzen für Stufe 2/3 dokumentieren.
- AWS: die Vorlage liegt bereit; das **Anlegen** ist die Freigabegrenze.

---

## 2 · Teil C — Profilpaket 25 (20 Brandenburg-Profile, lokal, deaktiviert)

**Ergebnis:** [`../../data/mandatsprofile/brandenburg-25-kandidaten.json`](../../data/mandatsprofile/brandenburg-25-kandidaten.json)
— 20 Profile, **alle `aktiv:false`**, Prüfer-Ergebnis „**importierbar**" (20/20 gültig,
`alleAktivFalse: ja`), testgesichert durch `scripts/profilpaket-25-test.js` (**25/25 PASS**).
**Kein Import, keine Production-Verbindung, keine Aktivierung.**

### 2.1 Kandidatenauswahl (bestätigungsbedürftig)

Neun Personen waren durch den Sprintauftrag gesetzt (empfohlene erste Gruppe: Bretz,
Poschmann, Lüders, Meyer, Liedtke; Korrektur-Vorgaben: Augustin, Peschel, Dorst, Scheetz).
Die elf weiteren wurden nach dokumentierten Kriterien gewählt: Fraktionsbreite
(SPD 7 · CDU 5 · BSW 6 · Gruppe „Wir für Brandenburg" 2), Sichtbarkeit
(Fraktionsvorsitz/PGF/Ausschussvorsitz/Sprecherrollen) und Beleglage. **Bewusst nicht
aufgenommen:** Regierungsmitglieder mit Mandat (Woidke, Redmann, Keller, Hoffmann,
Crumbach, Mittelstädt — anderes Nutzungsprofil, politisch eigener Fall) und
AfD-Abgeordnete (30 Sitze; die Vorgaben des Auftrags enthalten keinen AfD-Kandidaten —
ob diese Zielgruppe gewollt ist, ist eine **offene Produktentscheidung des Gründers**).
Wichtige Lageänderung seit 2024, in die Profile eingearbeitet: BSW-Spaltung
(5 Austritte 01/2026: Gruhn + Crumbach → SPD-Fraktion; Matzies, von Ossowski, Simon →
Gruppe „Wir für Brandenburg", anerkannt 2026), Koalitionsbruch 06.01.2026, seit
18.03.2026 SPD–CDU-Koalition (Kabinett Woidke V).

### 2.2 Rechercheweg und Beleglage (ehrlich)

- Egress-Prüfung dieses Sprints: `landtag.brandenburg.de` und `de.wikipedia.org` sind
  aus der Cloud-Sitzung **gesperrt** (EGRESS_BLOCKED) — wie beim Sprint-9B-Präzedenzfall.
- Recherche daher ausschließlich über **WebSearch-Suchtreffer**: 15 Recherche-Agenten
  (5 Fraktions-/Regierungslagen + 10 Personenpaare) mit zusammen ~130 Suchanfragen;
  Fraktions-, Landtags-, Wikipedia- und Pressetreffer, je Person mehrere unabhängige
  Suchen. **Kein Wert ist bytegenau verifiziert**; kein Profil trägt `geprueftAm`.
- **Profil-URLs:** alle 20 stammen **wörtlich** aus Suchtreffer-Titeln der amtlichen
  Seiten (`/de/<slug>/<id>`); keine URL wurde konstruiert oder geraten.
- Auftrags-Vorgaben wurden unabhängig gegengeprüft und bestätigt (Peschel: Bildung +
  Sonderausschuss Lausitz; Dorst: Haushalt + Enquete 8/1 Corona, Infrastruktur
  entfernt; Meyer: Infrastruktur und Landesplanung; Augustin: Landesliste Platz 2, URL
  identisch mit Vorgabe). Zwei Recherche-Korrekturen gegenüber Zwischenständen:
  Bommert ist in der 8. WP **nicht** mehr Wirtschaftsausschuss-Vorsitzender (Rücktritt
  01/2024, 7. WP); Augustins Bildungsausschuss-**Vorsitz** war 7. WP.

### 2.3 Bekannte offene Punkte im Paket (je Profil in `notiz` dokumentiert)

1. **Hornauf:** BSW-Fraktion wollte ihn 05/2025 aus den Ausschüssen abziehen — Vollzug
   unklar, Ausschussangaben möglicherweise überholt.
2. **Roth:** PGF-Widerspruch (09/2024 gewählt vs. aktuelle Peschel-Belege) — Rolle nicht
   übernommen.
3. **Ausschussname Infrastruktur:** Treffertitel „…und Landesentwicklung" vs.
   Slug/abgeordnetenwatch „…und Landesplanung" — Schreibweise im Verifikationslauf klären.
4. **Matzies:** amtliche Namensform (Matzies vs. Matzies-Köhler, gleiche ID 40624) und
   Regionalzuordnung offen.
5. **Hildebrandt:** keine 8.-WP-Ausschussmitgliedschaft zweifelsfrei belegbar — Feld
   bewusst leer (fachliche Achse über Themen erfüllt).
6. Ausschuss-Neuzusammensetzung nach den BSW-Austritten (Landtagsbeschluss 2025/26)
   konnte nicht einzeln gegengelesen werden — betrifft potenziell alle BSW-/Gruppen-Profile.

### 2.4 Vorbereiteter Verifikationslauf — NICHT ausgeführt (Freigabe-Gate)

**Weg** (nach dem Sprint-9B-Muster): GitHub-Actions-Workflow
[`.github/workflows/profil-quellen-verifikation.yml`](../../.github/workflows/profil-quellen-verifikation.yml)
+ Script `scripts/profil-quellen-verifikation.js`.

- **Trigger:** ausschließlich `workflow_dispatch` — **bewusst ohne `pull_request`-Trigger**
  (anders als `sprint9b-verify.yml`), damit der PR dieses Sprints keinen Lauf auslöst.
  Testgesichert (`profilpaket-25-test.js` prüft die Triggerliste).
- **Was er tut:** je Profil GET der amtlichen Profilseite (20 Abrufe, ~1,5 s Abstand,
  TLS an, realistischer User-Agent), prüft HTTP-Status, Host und Namenspräsenz;
  Urteile `bestaetigt / name_nicht_gefunden / umgeleitet / nicht_erreichbar`; JSON-Report
  als Artefakt (30 Tage).
- **Laufzeit:** < 2 Minuten. **Kosten:** nur GitHub-Actions-Minuten eines
  ubuntu-Runners (im Free-Kontingent), keine externen Kosten. **Berechtigungen:**
  `contents: read`, keine Secrets. **Datenzugriffe:** nur öffentliche
  landtag.brandenburg.de-Seiten; keine Supabase-, Vercel- oder Production-Berührung.
- **Fail-closed:** ohne `HELMUT_PROFILVERIFIKATION=on` tut das Script nichts (belegt:
  lokaler Lauf endet mit Erklärung, Exit 0).
- **Grenze des Laufs:** er verifiziert Erreichbarkeit + Namenspräsenz der amtlichen
  Seite. Der **inhaltliche Feldabgleich** (Ausschüsse, Wahlkreise, Funktionen gegen den
  Seitentext) bleibt danach eine manuelle bzw. Folgesprint-Aufgabe auf Basis des
  Reports.

> **GATE: Dieser Lauf wird erst nach ausdrücklicher Betreiberfreigabe gestartet**
> (Sprintauftrag, Verbot 7). Empfohlene Reihenfolge: PR-Review → Merge-Entscheidung →
> Freigabe → `workflow_dispatch` auf dem gemergten Stand → Reportauswertung →
> Feldkorrekturen → erst danach ist das Paket importreif (Import selbst bleibt eine
> weitere, eigene Freigabe).

### 2.5 Prüfergebnisse (echte Zahlen)

- Kanonischer Prüfer (`lib/helmut/profil-import.js`): „Profile: 20 · gültig: 20 ·
  ungültig: 0 · Alle Profile deaktiviert importierbar: ja · ERGEBNIS: importierbar".
- `scripts/profilpaket-25-test.js`: **25/25 PASS** (Vertragsform, 3×20 Eindeutigkeit,
  Brandenburg-Konsistenz, Bestands-Dubletten 0, kein `geprueftAm`, Workflow-Trigger-Gate).
- Dublettenprüfung gegen den Bestand (9 Production-Profile + 5 Offline-Testmandate):
  **0 Kollisionen** (mandatsId, Vollname, amtliche Profilseite).

---

## 3 · Teil D — Technische Startblocker für 25 Mandate

Legende: **Prod?** = Production-Änderung nötig · **Gründer?** = Gründer-/Betreiberfreigabe
nötig · **Parallel?** = ohne Production-Änderung vorbereitbar.

| # | Blocker | Aktueller Zustand | Beleg | Fehlende Arbeit | Prod? | Gründer? | Parallel? |
|---|---|---|---|---|---|---|---|
| 1 | **Stufe-2-Queue-Nachweis (7 Tage)** | nicht begonnen; Dispatch `shadow`; Versuch 5 belegt nur Stufe 1 | Zielarchitektur §14; Runbook §21/§22 („Nichts davon ist getan"); §30.7 | AWS-Stack anlegen, SSM/IAM, Flags `queue`+`HELMUT_KLASSEN_GRENZEN`, 7-Tage-Messung mit Abbruchgrenzen | **ja** | **ja** (AWS-Kosten) | teilweise (Vorlage+Messplan liegen bereit; Anlegen/Flags nicht) |
| 2 | **KI-Budgetentscheidung** | Deckel 100+30 unverändert; ab 25 Mandaten unzureichend (88–265 Aufrufe/Tag) | Zielarchitektur §23 | Gründerentscheidung Deckel; `HELMUT_LLM_FAIRNESS`; `HELMUT_LLM_GLOBAL_ANTEIL` prüfen | **ja** (Env) | **ja** | Analyse ja, Umsetzung nein |
| 3 | **OP-15 / Google-Drosselung** | Härtung gemergt, nicht production-bewiesen; Direkt-RSS nicht begonnen; 146/163 Wege Google; Blocker ab ~10 Mandaten | Restliste OP-15; Zielarchitektur §23 | (a) Beweislauf unter echter Drosselung (passiv), (b) Direkt-RSS-Kernwege + Telemetrienachweis, (c) Breaker-Dauerhänger der Personensuchen klären | **ja** für (b) | **ja** für (b) | (b) quellenweise vorbereitbar |
| 4 | **Landesmodule Berlin/Brandenburg** | beide inaktiv; Berlin-Flag-Wirkung unbewiesen; `brandenburg-basis` `prepared`, 8/8 Wege gesperrt; PR #132 (Gate je Land) 31.07. ungemergt geschlossen; ohne BB-Profil bleibt Paket `refCount 0` (Befund B-5) | CURRENT_STATE §5; PR #132; [`berlin-aktivierung.md`](berlin-aktivierung.md) §22; Sprint-9B-Ground-Truth 2026-07-14 (8/9 geeignet) | Gate-je-Land neu aufsetzen; Berlin-zuerst-Beweislauf; BB-Aktivierungsrunbook; 9B-Verifikation auffrischen | **ja** | **ja** | Code/Runbook ja |
| 5 | **Quellen-Seeds** | `20260713`/`20260717` nicht eingespielt (BLOCKIERT: nur noch Betreiberfreigabe); BB-Landesmodulquellen nur `kandidat`-Reife | [`quellen-seed-einspielung.md`](quellen-seed-einspielung.md); `seeds/landesmodule-kandidaten.js` | Betreiberfreigabe Einspielung; byte-genaue Verifikation der BB-Wege (Actions-Lauf, freigabepflichtig) | **ja** | **ja** | Vorbereitung ja |
| 6 | **Lage-Kapazität** | 2 Mandate/Tageslauf ⇒ bei 25 ≈ 13 Tage Rotation; Bot meldet Produkthinweis | CURRENT_STATE §6 Punkt 8; §1.6 | Kapazitäts-/Produktentscheidung; ggf. Lage-Slots im Queue-Betrieb | **ja** (je nach Lösung) | **ja** | Konzept ja |
| 7 | **Profilpaket 20** | lokal erstellt, 20/20 `aktiv:false`, Prüfer „importierbar"; Quellen-URLs und Feldwerte **nicht bytegenau verifiziert** (Egress-Sperre) | §2 dieses Dokuments; `data/mandatsprofile/brandenburg-25-kandidaten.json` | externer Verifikationslauf (§2.4, freigabepflichtig); danach ggf. Korrekturen; Import bleibt eigene Freigabe | nein (lokal) | **ja** (für Verifikationslauf + späteren Import) | **ja** (erledigt) |
| 8 | **OP-25-Wiederholung** | drittes Fenster bestanden — gilt nur für aktuelle Architektur mit 5 Mandaten; nach **jeder** OP-30-Aktivierungsstufe vollständig neu | [`vorgangskontext.md`](vorgangskontext.md) §7.7.5/§7.7.9; Stufenplan Stufe 3 | Wiederholungsfenster nach Stufe-2-Aktivierung und erneut nach 25er-Aktivierung planen und bestehen | nein (rein lesend, braucht aber laufende Stufe) | **ja** (Betreiberablauf) | Planung ja |
| 9 | **Mandantentrennung + K2-Signatur** | App-seitig (`assertTenant` + `user_id`-Filter); K2 grün bei 5 Mandaten (`m5-9aee228dbf2c9f13`); OP-03-Entscheidung DB-Durchsetzung offen; Tenant-Caps AUS | [`production_beweisprotokoll.md`](production_beweisprotokoll.md) §9; [`../quellenarchitektur/05-sicherheitsmodell-rls.md`](../quellenarchitektur/05-sicherheitsmodell-rls.md); Restliste OP-03 | OP-03 (a)–(d) inkl. Migration `20260720` + `HELMUT_TENANT_LLM_CAP`; K2-Neuabnahme nach jeder Mandatsänderung (neue Signatur) | **ja** | **ja** | Vorbereitung ja |
| 10 | **Rückweg + Abbruchgrenzen** | Stufe-1-Rückweg dokumentiert (Flag löschen + Redeploy); Stufe-2-Rücknahme in einem Schritt (Dispatch `shadow`/`off`); §28.6-Grenzen gelten für n=5 | Runbook §21.2 Punkt 7, §28.6, §30.7 | Abbruchgrenzen auf 25er-Skala beziffern; Rückweg für gestufte Erweiterung (5→10→25) dokumentieren | nein | nein (reine Doku; Anwendung im Ernstfall = Betreiber) | **ja** |

**Lesart:** Kein einziger der zehn Punkte erlaubt heute eine 25er-Aktivierung; die Punkte
1–3 und 6 sind harte Vorbedingungen, 7 ist erledigt bis auf die externe Verifikation,
8–10 sind planbare Begleitarbeiten. Punkt 4/5 werden erst relevant, wenn die 20
Brandenburg-Profile auch **Landesquellen** erhalten sollen (die Profile selbst laufen ohne
Landesmodul über Personen-/Themensuchen — mit OP-15-Risiko).

---

## 4 · Sprintzustand

**Teilweise abgeschlossen** (CLAUDE.md §8): die lokale Arbeit ist vollständig —
CURRENT_STATE.md archiviert und auf 17.995 Zeichen / 243 Zeilen verdichtet
(`current-state-groesse-test.js` 4/4 PASS), Skalierungspfad geklärt (§1), Profilpaket 20
erstellt und formgeprüft (§2, `profilpaket-25-test.js` 25/25 PASS), Startblocker-Tabelle
erstellt (§3), Offline-Gesamtlauf grün (Zahlen im PR). **Ausstehend und bewusst nicht
Teil dieses Sprints:** PR-Review und Merge (Betreiber), externe Byte-Verifikation der
Profilquellen (Gate §2.4, Actions-Lauf erst nach ausdrücklicher Freigabe), jeder Import
und jede Aktivierung. Production wurde nicht berührt (alle Verbote eingehalten; keine
Production-Abfrage — Production-Aussagen dieses Sprints stützen sich auf Betreiberangaben
und die dokumentierte Beleglage). Branch: `claude/fundament-25-mandate-aju9zu`;
PR: siehe CURRENT_STATE §8. Nächste Entscheidung: Gründerfreigabe für den
Verifikationslauf + Stufe-2-AWS-Entscheidung (§1.3).
