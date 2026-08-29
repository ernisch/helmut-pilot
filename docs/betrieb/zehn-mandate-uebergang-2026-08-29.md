# Zehn-Mandate-Übergang — Vorbereitungssprint 2026-08-29 (Beleg)

**Auftrag:** den sicheren Übergang von fünf auf zehn reale Mandate so weit wie technisch
möglich vorbereiten — PR-Stapel #274–#277 auf den aktuellen `main` einordnen, Nachweise
erneuern, veraltete Betriebsdoku korrigieren, offene Beweisgatter durch Werkzeuge
vorbereiten. **Keine Production-Änderung** (kein Merge, keine Migration, kein Deployment,
kein Lauf, keine Env-/Flag-Änderung; ausschließlich rein lesende Production-Abfragen mit
aggregierten Zählern).

## 1 · Ausgangs- und Endzustand (rein lesend bestätigt)

- `main` = `bb0577a9` (Merge PR #281); Vercel-Deployment grün laut Betreiberbeleg 19:12 UTC.
  Die öffentliche Adresse ist aus Cloud-Sitzungen per Egress-Proxy gesperrt (bekannte
  Zugangsgrenze) — der Betreiberbeleg wurde nicht erneut selbst geprüft.
- Production `ddckuvvpcytqbyfmbvie`: Migrationshistorie **35** Einträge, zuletzt die
  Z22-Buchungen `20260829175642`/`20260829175749`; **F9 nicht angewendet**. 5 aktive /
  4 inaktive / 0 gelöschte Mandatsprofile. 3.330 Aufträge (3.122 erledigt, 208 wartend,
  0 laufend, 0 fehlgeschlagen), 0 Dubletten, 0 Leases, 0 fällige Arbeit ≥ 24 h.
  CAS: 653 fertig · **1 unbekannt** · 1 aufgegeben · 1 offen — das Fünfertor bleibt rot.
- Der natürliche 21:30-UTC-Lauf hatte zum Sitzungsende (≈ 21:00 UTC) noch nicht
  stattgefunden; der 05:30-Lauf war `success` (227 s).
- Slotdauern 29.08.: Crawl 230,1 s · Pipeline bis 261,0 s (3 Pipeline-Quittungen:
  11:43/…/16:01) — die 217,5-s-p95-Grenze des Beobachtungsfensters ist gerissen;
  **kein grüner Tag**, Siebentagenachweis **nicht begonnen**.

## 2 · PR-Stapel am 29.08. nachgeführt (alle Pushes normal, kein Force, kein Reset)

| PR | Branch | neuer Kopf | Basis | lokale Nachweise | Pflicht-CI |
|---|---|---|---|---|---|
| #274 KI-Umschlag | `codex/ki-antwortumschlag-hardening` | `32661d6` | **`main`** (umgestellt; alte Basis ist vollständig in `main`) | 285/285 Offline · Z22-DB **48/0 (§1–§11!)** · Browser 32/0 | **grün** `33272024555` |
| #275 Planungszeitbudget | `codex/planung-zeitbudget-hardening` | `0c1ddc1` | #274 | 286/286 · 48/0 · 32/0 | **grün** `33272453956` |
| #276 Monitoring | `codex/z3b-monitoring-honesty` | `372a618` | #275 | 286/286 · 48/0 · 32/0 | **grün** `33272920479` |
| #277 Z3b-Tore | `codex/z3b-proof-gates-500` | `a705c18` | #276 | **294/294** · 48/0 · 32/0 | Lauf `33274186322` (bei Belegerstellung laufend) |

Jeder Branch wurde aus einem frischen Arbeitsbaum vom Remote-Kopf per **normalem
Merge-Commit** aktualisiert; Remote-Köpfe unmittelbar vor jedem Push erneut geprüft.
Einziger Konflikt je Branch: `docs/CURRENT_STATE.md` (bei #277 zusätzlich
`health-report-route-test.js` — dort gewann die auf `main` gemergte UTC-Einfrierung aus
PR #278). Auflösungsprinzip: der bestätigte Z22-Production-Abschluss von `main` bleibt
vollständig erhalten; die Fixes werden als lokal grün, **ungemergt und nicht deployt**
geführt. Kein PR wurde gemergt, geschlossen oder gelöscht.

## 3 · PR #277: Datei-für-Datei-Prüfung und Nachführung

Der einzigartige Diff (63 Dateien) wurde vollständig nach Zweck/Risiko/Trennbarkeit
geprüft. Ergebnis: die Z3b-Läufer/Fixtures/Tests sind durchgehend fail-closed (kein
Autostart, Kostenriegel ≤ 1 USD technisch, Testprojekt-Pinning, Production-Ref gesperrt);
die Provider-/Crawler-Härtung ist Runtime-Code und für die Z3b-Tore **notwendig** —
der PR bleibt deshalb **eine Einheit**, kein Ersatz-PR nötig. Behoben bzw. nachgeführt
(Commit `a705c18`): Migrationsvertrag der Backup-Werkzeuge auf 35/31/2 (der eigene
fail-closed-Inventarriegel hatte den Z22-Drift korrekt gefangen), 9 UTC-datumsabhängige
Testaufrufe, ein echter 3xx-Randfall in `crawler.js` (stiller Leer-Erfolg → ehrlicher
Fehler), präzisierter `TRANSPORT_GRENZEN_STATUS`-Kommentar, `restore-drill`-Meldung,
datierte Stand-Nachträge in drei Z3b-Dokumenten. Merke für den Betreiber (steht auch im
PR-Text): sollte `HELMUT_ANBIETER_STEUERUNG=on` gesetzt sein, braucht ein Merge vorher
gesetzte `HELMUT_ANBIETER_GOOGLE_MINUTE`/`_TAG`; `restore-verify-local.js` ist bewusst
in jedem Lauf gesperrt, bis ein neuer spaltengenauer Production-Abzug verankert ist.

## 4 · Neu vorbereitete Beweisgatter (dieser Branch)

1. **§11 dauerhaft im Merge-Gate:** `ci.yml` stellt PostgREST 12.2.3 versions- und
   prüfsummengepinnt bereit; der Z22-Datenbanknachweis läuft als **§1–§11 fail-closed**
   (`HELMUT_REQUIRE_POSTGREST=1`). Erstbeleg lokal 29.08.: **48 PASS / 0 FAIL,
   0 übersprungen** gegen PostgreSQL 17.6 + echtes PostgREST — auf den Ständen von
   #274, #275, #276 und #277 identisch erbracht. Der bisher offene §11-Punkt aus
   CURRENT_STATE §18 ist damit lokal geschlossen; CI-verbindlich wird er mit diesem PR.
2. **Grüntage-Werkzeug** (`scripts/gruentage-auswertung.js`, Test 34/34): rein lesender
   Sammler (GET-only, Tabellen-Allowlist, nur Zähler/Dauern, keine Kennungen) plus
   deterministische Bewertung der zehn Kriterien je vollem UTC-Tag. Fail closed: ohne
   deckende Quittung ist ein Tag nie grün. Funktionsprobe 29.08. gegen Production:
   26.–28.08. ehrlich ROT (p95 260,7/260,8/261,2 s; 1 unbekannter Vorgang;
   KI-Verbrauch 88/79/77 unter dem dokumentierten Deckel 100).
3. **F9-Entscheidungsvorlage** (`docs/betrieb/f9-entscheidungsvorlage-2026-08-29.md`):
   Empfehlung, F9 als eigene Freigabe **vor** dem Einfrieren anzuwenden; nichts angewendet.
4. **KI-Deckel-Rechnung lokal geprüft:** Kapazitätsauswertung aus PR #277 mit 90/0
   (Fairness-Untergrenze 2n−1: 399/999; Bindung an echte Produktionskonstanten), auf dem
   nachgeführten Stand.

## 5 · Beweisebenen nach diesem Sprint

- **Lokal bewiesen:** alle vier Stapel-PRs auf 29.08.-Grundlage (285–294 Suiten grün,
  Browser 32/0) · Z22-DB-Nachweis §1–§11 (48/0) auf allen vier Ständen · Grüntage-Werkzeug
  · Kapazitätsrechnung.
- **Isoliert gegen Supabase bewiesen:** unverändert der synthetische Plattformweg bis 500
  (kein neuer Lauf; der 500er-Lauf wurde nicht wiederholt).
- **Vollständig im Fachweg bewiesen:** unverändert 25/50/100 (Z3a); 200/500 nicht gefahren.
- **In Production bewiesen:** unverändert der reale Fünferbetrieb samt Z22-Anwendung;
  **neu kam kein Production-Beweis hinzu** (diese Sitzung war dort rein lesend).
- **Offen:** Merge+Deployment des Parserfixes (#274) · nächste natürliche Fünferprüfung ·
  F9-Entscheidung · Azure-Kette (Anmeldung → 3er-Vorprobe → 21er-Stichprobe → Deckel) ·
  Slotdauer-Frage (p95 reißt 217,5 s schon heute — vor dem Einfrieren klären) ·
  Siebentagefenster · Import/Aktivierung.

## 6 · Nächster Schritt (genau eine Freigabe)

**Merge-Freigabe für PR #274** (Merge = Production-Deployment des Parserfixes). Alles
Weitere (natürlicher Fünferlauf als Regression, dann #275/#276, F9, Azure, #277, Deckel,
Einfrieren, Fenster) folgt dem dokumentierten Gatterweg und braucht jeweils eigene
Freigaben. Frühester ehrlicher Aktivierungszeitpunkt bei Abschluss aller Vorarbeiten bis
30.08. 23:59 UTC: **2026-09-07 00:00 UTC** (7 volle grüne Tage 31.08.–06.09.); jede
Verzögerung über eine UTC-Tagesgrenze verschiebt ihn mindestens einen Tag — die heutige
Slotdauerlage macht einen grünen Start ohne vorherige Klärung unwahrscheinlich.
