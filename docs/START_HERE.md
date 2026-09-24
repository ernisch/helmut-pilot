# START HERE — Helmut in fünf Minuten

**Zweck dieser Datei:** Produktverständnis. Kein Status, keine Architektur, keine
Historie. Für den aktuellen Stand → [`CURRENT_STATE.md`](CURRENT_STATE.md), für die
Systemkarte → [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Letzte Aktualisierung:** 2026-09-23 (aktuelle Priorität: 500er Production-Nachweis; laufender Betriebszustand nur in `CURRENT_STATE.md`)

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

## 2 · Aktuelles Projektziel

**Oberstes Projektziel ist der belastbare Production-Nachweis mit exakt 500
gleichzeitig aktiven Profilen.** Die Stufen und den aktuellen Stand führt ausschließlich
[`CURRENT_STATE.md`](CURRENT_STATE.md).

Danach ist die **Verkaufsbereitschaft für den ersten zahlenden Zweitmandanten** das
Produktziel. Was dort fehlt, ist nicht Funktionsumfang, sondern Betriebs-, Rechts- und
Sicherheitsreife — geführt als **P0-Verkaufsblocker** (OP-01…OP-04) in
[`datenmotor-restliste.md`](datenmotor-restliste.md).

Neue Funktionen sind nachrangig, solange der 500er-Nachweis und die P0-Punkte offen sind.

## 3 · Zielgruppe und Pilotlogik

- **Zielgruppe:** Abgeordnete und deren Büros — Menschen mit zu vielen Quellen und
  zu wenig Zeit für Entscheidungen.
- **Erster Tester:** ein einzelner realer Pilotmandant (sitzendes Bundestagsmandat).
  Seine Identität wird in Code und Doku bewusst **nicht** geführt — siehe §5,
  Prinzip „Mandantenneutralität". Historische Altdokumente und Testfixtures
  enthalten noch den Klarnamen; das ist Alt-Bestand, keine aktive Logik.
- **Betriebsmodus:** kontrollierter Mehrmandantenbetrieb. **Die aktuelle Anzahl aktiver
  Profile und der Nachweisstand stehen ausschließlich in
  [`CURRENT_STATE.md`](CURRENT_STATE.md)** und werden hier bewusst nicht als Zustand
  geführt. Vor dem ersten zahlenden Zweitmandanten bleibt das Freigabepaket **OP-03**
  verbindlich; deaktivierte Demo-Profile bleiben OP-04.

## 4 · Produktbereiche

| Bereich | Was er leistet |
|---|---|
| **Heute / Briefing** | Tagespriorität und nächster Schritt mit belegtem Tagesanlass; kein zweiter Lagebericht |
| **Lage** | Mandatsrelevanter Sachstand, Einordnung, Unsicherheit und Quellen |
| **Radar** | Belegte Vorzeichen, kommende Fristen und neue Resonanz; kein allgemeiner Themenfeed |
| **Büro** | kopierbare Arbeitsaufträge zur Delegation ans Büro |
| **Profil** | Mandatsprofil, Ausschüsse, Themen, Termine — steuert die Personalisierung |
| **Admin** | Betreibersicht: Nutzer, Quellen, Kosten, Datenstand, Betriebsmetadaten |

Der verbindliche [Bereichsvertrag](betrieb/lage-radar-briefing-abnahme-20260924.md)
trennt Produktziel, bisherigen Production-Stand und noch auszurollende Absicherung.

## 5 · Verbindliche Produktprinzipien

1. **Entscheidungen statt Daten.** Helmut zeigt nicht, was passiert ist, sondern was
   zu tun ist. Eine Funktion, die nur Inhalte anzeigt, ist keine Helmut-Funktion.
2. **Belegpflicht.** Kein erfundener Inhalt, keine erfundene Quellen-URL. Jedes
   sichtbare Inhaltselement in Lage, Heute/Briefing, Radar und Büro trägt
   mindestens eine echte, öffnende https-Quelle — keine bloße
   Herausgeber-Startseite; ohne solche Quelle erscheint ein ehrlicher Leerzustand
   (testgesichert: `scripts/quellenpflicht-vertrag-test.js`). **Noch nicht
   garantiert** ist die Beleg-Bindung: dass jede einzelne Aussage eines Elements
   einer bestimmten Quelle oder Textstelle zugeordnet ist. Lieber „keine
   belastbare Lage" als eine erfundene.
   **Freigegebener Entwicklungsvertrag seit21.09.2026:** Belegte Tatsachen und
   weitergehende KI Einordnung werden sichtbar getrennt. Die Einordnung braucht
   eine zusätzliche Prüfung und bleibt als fehlbar gekennzeichnet. Das Label
   erlaubt keine erfundenen Tatsachen, Rollen, Fristen oder Pflichten. Der
   aktuelle Umsetzungsstand steht in `CURRENT_STATE.md`.
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
