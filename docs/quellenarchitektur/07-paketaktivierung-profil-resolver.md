# Paketaktivierung, Profil→Paket-Ableitung & Referenzzählung (Sprint 4)

Erklärt, wie ein Profil automatisch seine Pakete bekommt und wie viele Profile trotzdem nur **einen**
Crawl auslösen — verständlich aus Gründerperspektive.

> **Nachtrag 2026-07-25 (Production-Abgleich).** Zwei Aussagen dieses Dokuments waren zum
> Prüfzeitpunkt überholt und sind unten korrigiert:
> 1. Die Landespakete `berlin-basis`/`brandenburg-basis` sind **nicht** leer — Production
>    führt **10 bzw. 9** Abrufwege (`manual`/`needs_review`). Sie bleiben trotzdem
>    unaktiviert, weil der Paketstatus `prepared` allein genügt, um die Aktivierung zu
>    verhindern.
> 2. Der Resolver ist **in den Live-Betrieb verdrahtet** (seit dem Quellen-Cutover,
>    `HELMUT_SOURCE_MODE=on`): `scheduler.getSourcesForProfile` → `buildRelationalCrawlPlan`
>    → `computeGlobalActivation`. Der Schlusssatz „nicht in den Live-Scheduler verdrahtet"
>    galt für den Stand vor dem Cutover.
>
> Belege und vollständige Inventur: [`30-paket-inventur-production.md`](30-paket-inventur-production.md).

## Zwei getrennte Aktivierungen (Auftrag §10)

1. **Profilzuordnung:** Jedes aktive Profil bekommt **automatisch** seine Pakete abgeleitet — keine
   kopierte Quellenliste.
2. **Technische Paketaktivierung:** Braucht **mindestens ein** aktives Profil ein Paket, werden dessen
   Abrufwege **global einmal** aktiviert. Hundert Profile mit „Berlin Basis" → trotzdem **ein** Crawl.

## Welche Pakete bekommt ein Profil? (`resolveProfilePackages`)

Verbindlich aus `mandate_profiles` (die `politische_ebene` wird direkt gelesen — anders als
`config.parliamentTypeOf`, das nur `parliamentType` kennt; der Resolver liest beide).

| Profil | Pflicht-Basispakete | Ergänzend (optional) |
|---|---|---|
| **Bundestag** | Bund Basis | Partei (Die Linke), Fachthema (Arbeit&Soziales), Region |
| **Landtag** | Bund Basis **+** Landespaket (Berlin/Brandenburg) | dito |

Ergänzende Pakete entstehen aus **belegten** Feldern: Partei/Fraktion → Partei-Paket; Ausschuss/
Fachthema sozialpolitisch → `arbeit-und-soziales`; Region Niedersachsen → `regional-niedersachsen`.
Andere Politikfelder haben noch **kein** eigenes Paket → keine Zuordnung (ehrlich, kein Raten).

**Sozialthema-Erkennung (wortgenau, Nachschärfung):** sozialpolitische Begriffe werden am
**Wortanfang** erkannt, nicht als beliebiger Teilstring. `pflege` trifft „Pflege"/„Pflegeversicherung"
(Sozial-Stamm als Kompositum-Kopf), aber **nicht** „Denkmalpflege"/„Landschaftspflege" (dort ist der
Stamm nur ein Suffix, das Thema ist Denkmal/Landschaft) — so verschwindet ein früherer Fehltreffer,
ohne den Recall für echte Sozial-Komposita (`Tarifbindung`, `Rentenreform`) zu verlieren.

**Personenbezogenes Paket (`profil-<pilot-mandats-id>`):** an die **konkrete Profil-ID** gebunden (Pilot
`<pilot-mandats-id>`), **nicht** aus Sachfeldern ableitbar (personenbezogene Nachrichtensuche nur für dieses
Profil). Ohne diese explizite Bindung wäre das Paket samt seinem `demoOnly`-Abrufweg unerreichbar
(nie referenziert → nie aktiviert). Ein anderes gleichnamiges Profil (andere ID) bekommt es **nicht**.

## Pflichtpaket-Garantie & unvollständige Aktivierung (`profileSupplyStatus`)

Ein Profil ist nur **vollständig aktiviert**, wenn **alle** Pflicht-Basispakete existieren, Status
`active` haben **und** Abrufwege tragen. Konsequenzen:
- **Bundestagsprofil:** Bund Basis ist `active` + versorgt → vollständig aktiviert.
- **Berliner/Brandenburger Landtagsprofil:** braucht `berlin-basis`/`brandenburg-basis` — die sind
  aktuell `prepared` (Code-Seed 0 Wege; **Production 10 bzw. 9 Wege**, alle `manual` und durch das
  harte Landesmodul-Gate nie abgerufen) → **nicht vollständig aktiviert**,
  `missingBasePackages` nennt das fehlende Landespaket, `reason = "pflichtpaket-unversorgt"`. Der
  Admin (Sprint 8) macht das sichtbar.
- **Landtagsprofil ohne Bundesland:** kein falsches Landespaket; `requiredMissing` meldet
  `landespaket:unbekannt`.

## Referenzzählung & Aktivierung (`computeGlobalActivation`)

- **Aktivierungsberechtigt** ist nur ein Profil, das nicht deaktiviert/gelöscht **und** brauchbar ist
  (`validateProfile().usable`). Fehlerhafte/leere Profile tragen **nicht** zur Aktivierung bei →
  keine falsche Aktivierung.
- **Paket technisch aktiv** **nur**, wenn ≥1 aktives Profil es braucht **und** Status `active`. Es
  gibt **keine** Paket-Ebene-Daueraktivierung: ohne aktives Profil ist **kein** Paket aktiv.
  `prepared`/`draft`-Pakete werden **nie** technisch aktiviert; angefordert-aber-unversorgt erscheint
  als `requested_unsupplied`.
- **Abrufweg aktiv** per Referenzzählung (≥1 aktives Paket via `package_paths`) **oder** wenn er
  selbst `activation_mode = always_on` trägt. `dev_only` löst **nie** einen Crawl aus.

### `always_on` (Abrufweg-Ebene) vs. `is_critical` — Nachschärfung K1
Daueraktivierung lebt **ausschließlich auf der Abrufweg-Ebene** (`activation_mode = always_on`) —
bewusst **nur** die **5 neutralen Bund-Basis-Kernquellen** (Bundestag, Bundesregierung, Tagesschau,
Deutschlandfunk, DIP). Ein Paket-Feld `always_on` existiert **nicht mehr** (es hätte fälschlich das
ganze Bund-Basis-Paket ohne Profil aktiviert). **Ohne aktives Profil laufen daher genau diese 5
Abrufwege** — Bund Basis läuft **voll (54)**, sobald **ein** Profil aktiv ist (jedes Profil braucht
Bund Basis). **`is_critical`** (nicht still archivieren) ist orthogonal und gilt breiter (auch BMAS,
Die Linke, Linksfraktion) — diese laufen aber **nur über Referenzzählung**, nicht dauerhaft.

## Verifiziertes Verhalten (Tests, echter Katalog)

| Fall | Ergebnis |
|---|---|
| Bundestagsprofil | → Bund Basis, vollständig aktiviert |
| Berliner/Brandenburger Landtag | → Bund Basis + Landespaket; **nicht** vollständig (Landespaket prepared) |
| **reines** Bundestagsprofil (SPD, Gesundheit) | → **nur** Bund Basis = **54 Abrufwege** (nicht 144) |
| **Pilot**-Profil (`<pilot-mandats-id>`: Linke/Sozial/NDS + persönliches Paket) | → Bund Basis + Die-Linke + Arbeit&Soziales + Regional NDS + `profil-<pilot-mandats-id>` = **145 Abrufwege** |
| 1 vs. 100 identische Profile (ohne Pilot-ID) | **144 aktive Abrufwege** in beiden Fällen (Refcount 1 vs. 100) |
| Berliner/Brandenburger Landtag | Bund Basis aktiv (54); Landespaket `requested_unsupplied` (prepared) |
| **kein** aktives Profil | **5 aktive Abrufwege** (nur die neutralen Kern-Systemquellen; **kein** Paket aktiv) |
| pausiert/gelöscht | Refcount → 0, Paket nicht mehr aktiv |
| leeres/unvollständiges Profil | keine falsche Aktivierung |

**Stand 2026-07-25 — live verdrahtet.** Mit dem Quellen-Cutover (`HELMUT_SOURCE_MODE=on`,
Freigabe 2026-07-15) baut `scheduler.getSourcesForProfile` den geteilten Quellenplan über
`buildRelationalCrawlPlan` → `computeGlobalActivation`. Der Satz „nicht in den Live-Scheduler
verdrahtet" galt für den Vor-Cutover-Stand von Sprint 4.

**Wichtige Abgrenzung:** Der Plan wird **global über alle aktiven Profile** gebildet
(global-once). Die Paketzuweisung entscheidet damit, **was überhaupt gecrawlt wird** — nicht,
welche Dokumente ein einzelnes Mandat sieht. Die mandatsbezogene Auswahl entsteht erst im
Matching/Briefing und ist ein eigener, noch offener Nachweis (Phase-1-Punkt 28).

## Landesmodule: die eine Ausnahme von „global-once" (Punkt 14A, 2026-07-26)

Global-once gilt für Bundes- und neutrale Wege weiterhin unverändert. **Landesmodul-Wege sind
davon ausgenommen**, in zwei Richtungen:

1. **Aktivierung braucht ein Mandat, nicht nur ein Flag.** Ein Landesmodul ist **wirksam** nur,
   wenn sein Land in `HELMUT_LANDESMODULE` *ausdrücklich freigegeben* ist **und**
   `laenderMitBerechtigtemMandat()` mindestens ein aktivierungsberechtigtes Landtagsmandat dieses
   Landes findet. Gezählt wird über `resolveProfilePackages()` — dieselbe Auflösung wie in der
   Referenzzählung, **nicht** über ein Profilfeld. Folge: ein **Bundestags**mandat mit
   `bundesland='Berlin'` berechtigt Berlin **nicht**. Vorher genügte das Flag; ein zweiländriger Weg
   (`rp-rbb24-politik` hängt in `berlin-basis` **und** `brandenburg-basis`) konnte dadurch über ein
   **Brandenburger** Mandat bei reiner Berlin-Freigabe laufen.
2. **Versorgung ist mandatsbezogen.** `planQuellenFuerProfil(plan, profil)` schränkt die
   Landesmodul-Wege des globalen Plans auf die Länder des jeweiligen Profils ein
   (`scheduler.loadRelationalSharedSources(profile)`). Die **Vereinigung** über alle berechtigten
   Profile ergibt wieder exakt `plan.aktiv` — global-once bleibt also gewahrt, der Weg läuft nur im
   Lauf des Mandats, das ihn berechtigt.

Der Plan weist beide Bedingungen getrennt aus (`landesmodule.freigegeben`,
`.mitBerechtigtemMandat`, `.wirksam`, `.freigegebenOhneMandat`, `.bemandatiertOhneFreigabe`), damit
ein gesetztes Flag ohne berechtigtes Mandat nicht wie eine Aktivierung aussieht.

Betriebsdetails, Ausführungsreihenfolge und Rollback:
[`../betrieb/berlin-aktivierung.md`](../betrieb/berlin-aktivierung.md) §4/§18.
