# START HERE — Helmut in fünf Minuten

**Zweck dieser Datei:** Produktverständnis. Kein Status, keine Architektur, keine
Historie. Für den aktuellen Stand → [`CURRENT_STATE.md`](CURRENT_STATE.md), für die
Systemkarte → [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Letzte Aktualisierung:** 2026-08-17

---

## 1 · Was Helmut ist

Helmut ist ein **politischer KI-Stabschef** für Mandatsträgerinnen und Mandatsträger
(aktuell Bundestag; Landtagsebene vorbereitet, nicht aktiv).

Helmut ist **kein** Medienmonitoring-Tool, kein News-Reader und kein Dashboard.
Helmut beantwortet morgens und im Tagesverlauf:

- Was steht heute an?
- Worauf solltest du reagieren?
- Welche Chance entsteht, welches Risiko entsteht?
- Welcher Termin muss vorbereitet werden?
- Welche Formulierung kannst du direkt nutzen?
- Welche Aufgabe kannst du delegieren?

Kernsatz: *Helmut reduziert die politische Morgenlage auf Entscheidungen,
Kommunikation und Aufgaben.*

## 2 · Aktuelles Produktziel

**Verkaufsbereitschaft für den ersten zahlenden Zweitmandanten.** Der Einzelpilot
läuft stabil in Production. Was fehlt, ist nicht Funktionsumfang, sondern
Betriebs-, Rechts- und Sicherheitsreife — geführt als **P0-Verkaufsblocker**
(OP-01…OP-04) in [`datenmotor-restliste.md`](datenmotor-restliste.md).

Neue Funktionen sind nachrangig, solange die P0-Punkte offen sind.

## 3 · Zielgruppe und Pilotlogik

- **Zielgruppe:** Abgeordnete und deren Büros — Menschen mit zu vielen Quellen und
  zu wenig Zeit für Entscheidungen.
- **Erster Tester:** ein einzelner realer Pilotmandant (sitzendes Bundestagsmandat).
  Seine Identität wird in Code und Doku bewusst **nicht** geführt — siehe §5,
  Prinzip „Mandantenneutralität". Historische Altdokumente und Testfixtures
  enthalten noch den Klarnamen; das ist Alt-Bestand, keine aktive Logik.
- **Betriebsmodus heute:** kontrollierter Mehrmandantenbetrieb mit mehreren aktiven
  Mandatsprofilen. Die aktuelle Anzahl und der Nachweisstand stehen ausschließlich in
  [`CURRENT_STATE.md`](CURRENT_STATE.md). Vor dem ersten zahlenden Zweitmandanten bleibt
  das Freigabepaket **OP-03** verbindlich; deaktivierte Demo-Profile bleiben OP-04.

## 4 · Produktbereiche

| Bereich | Was er leistet |
|---|---|
| **Heute / Briefing** | Morgenlage: die wichtigste Entscheidung des Tages, belegt mit Direktlinks |
| **Lage** | Tageslage über den Tag hinweg, Vorgänge und Einordnung |
| **Radar** | namentliche Erwähnungen, Ausschuss-/Partei-/Wahlkreis-Bezug |
| **Büro** | kopierbare Arbeitsaufträge zur Delegation ans Büro |
| **Profil** | Mandatsprofil, Ausschüsse, Themen, Termine — steuert die Personalisierung |
| **Admin** | Betreibersicht: Nutzer, Quellen, Kosten, Datenstand, Betriebsmetadaten |

## 5 · Verbindliche Produktprinzipien

1. **Entscheidungen statt Daten.** Helmut zeigt nicht, was passiert ist, sondern was
   zu tun ist. Eine Funktion, die nur Inhalte anzeigt, ist keine Helmut-Funktion.
2. **Belegpflicht.** Kein erfundener Inhalt. Jede Aussage trägt eine echte,
   öffnende Quelle. Lieber „keine belastbare Lage" als eine erfundene.
3. **Ehrlichkeit über Zustände.** Leere Zustände, Störungen und Rückstände werden
   benannt, nicht kaschiert. Kein falsches Grün.
4. **Mandantenneutralität.** Kein Mandant ist im Code bevorzugt, hartkodiert oder
   Fallback. Personenbezogene Quellen entstehen zur Laufzeit aus dem Profil
   (`scheduler.personNewsSource`, id `<mandats-id>-news`).
5. **Einfachheit vor Funktionsumfang.** Konkreter politischer Nutzen und
   Verkaufsbereitschaft schlagen jede zusätzliche Funktion.
6. **Deutsch, Du-Form, mobil zuerst.** Die Oberfläche spricht Deutsch; Zeiten in
   `Europe/Berlin`.

## 6 · Wichtigste technische Regeln

- **Mandantentrennung ist App-seitig**, nicht DB-seitig. Jeder DB-Zugriff läuft über
  `service_role` (umgeht RLS); durchsetzend sind `assertTenant`/`assertTenantRows`
  plus ein verpflichtender `user_id=eq.<tenant>`-Filter in jeder mandantenbezogenen
  Query. Verbindlich:
  [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md).
- **Quellenwahrheit ist relational** (`HELMUT_SOURCE_MODE=on`); der hartkodierte
  Katalog `lib/helmut/sources.js` ist nur noch Fallback.
- **Kosten sind gedeckelt** (Tageslimit + Reserve, fail-closed). Jeder neue
  KI-Pfad muss durch das Budget-Gate.
- **Feature-Flags sind Default AUS.** Aktivierung ist eine Freigabeentscheidung,
  keine Code-Entscheidung (`helmut-flags.json`, Vercel-Env überstimmt die Datei).
- **Jede Migration braucht Rollback-SQL** im selben Verzeichnis.
- **`main` ist die einzige Architekturwahrheit.** Die dormanten
  „Quellenplattform"-Branches (Generation B) dürfen weder gemergt noch als Basis
  verwendet werden:
  [`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md).

## 7 · Vertiefende Dokumente

| Thema | Kanonische Quelle |
|---|---|
| Offene Punkte (OP-01…OP-23), verbindlich | [`datenmotor-restliste.md`](datenmotor-restliste.md) |
| Gesamt-Migrations-/Systemstatus | [`quellenarchitektur/00-master-status.md`](quellenarchitektur/00-master-status.md) |
| Sicherheit, Mandantentrennung, RLS, JWT | [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md) |
| Quellen-Zielarchitektur (Herausgeber/Abrufweg/Paket) | [`quellenarchitektur/02-zielarchitektur.md`](quellenarchitektur/02-zielarchitektur.md) |
| Paketaktivierung & Profil-Resolver | [`quellenarchitektur/07-paketaktivierung-profil-resolver.md`](quellenarchitektur/07-paketaktivierung-profil-resolver.md) |
| Production-Beweise | [`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) |
| Deploy & Rollback | [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md) |
| Recht/DSGVO (Entwürfe, ungeprüft) | [`recht/`](recht/) |

> **Nicht als aktueller Stand zitieren:** `AUDIT_DATENMOTOR_2026-07.md`,
> `freigabepunkte.md`, `readiness-verdict-2026-07.md`, `pilot-mandant.md`,
> `helmut_datenmotor_thread2_handoff.md`, `audit/*`. Diese Dokumente tragen
> Historisch-Banner und bleiben nur als Beleg erhalten.
