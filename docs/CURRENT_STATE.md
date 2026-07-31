# CURRENT STATE — Helmut

**Letzte Aktualisierung:** 2026-07-31 (**Sprint OP-25 K1 — globale Datenerfassung von der
mandatsbezogenen Verarbeitung trennen. TEILWEISE ABGESCHLOSSEN: der Schattenpfad ist gebaut,
offline bewiesen und mutationsgesichert; er ist in Production NICHT aktiviert, und genau das
war der Auftrag. Der Kapazitätsblocker aus OP-25 §10.5/§10.7 ist damit gelöst GEBAUT, aber
nicht GESCHLOSSEN.** **Ursache bestätigt und geschärft (Bestandsprüfung gegen `main`, keine
Vermutung):** von den zwölf Schritten in `runSourceCrawl` sind **fünf fachlich global** —
Quellenabruf, Rohitems, Rohdokumente, Lazy- und Eager-Understanding. `raw_documents` und die
Wissensobjekte tragen **keinen** Mandantenbezug; nur Matching, Entscheidungen und die
Mandatstelemetrie sind echte Projektionen. Die Ausgangsthese stimmt, war aber **zu grob**: das
prozessweite Gedächtnis geteilter Abrufwege entdoppelt schon heute einen Teil. Teuer bleibt,
was **jedes** Mandat trotzdem wiederholt: eigener Quellenplan, eigene Abrufwege, Speichern,
Dedup, Clustern — und ein **eigenes 90-Sekunden-Verstehensbudget**. Production-Beleg (rein
lesend, aus PR #191 übernommen und gegen den aktuellen Stand geprüft): *„der erste Mandant
verbraucht rund vier der viereinhalb Minuten, der zweite wird angefangen und abgeschnitten, der
Rest startet nie"*. **Lösung (klein, additiv, ohne Migration, ohne Queue):** neues Modul
[`lib/helmut/cron-globalphase.js`](../lib/helmut/cron-globalphase.js) — Vereinigungsmenge,
Budgetaufteilung, Datenstandsvertrag, Kapazitätsmodell, alles rein und IO-frei — plus
`scheduler.runGlobaleErfassung` / `scheduler.runMandatsProjektion`. **`runSourceCrawl` wurde
NICHT angefasst**; die Doppelung der Orchestrierung ist bewusst in Kauf genommen und gehört zu
K2 zurückgebaut. Die Mandatsphase läuft durch die **unveränderte** Fairnessschleife
`runCronForTenants` → `cron-fairness.runTenantsFairly` — Reihenfolge, Losentscheid, Sperren,
Laufdatensatz (R-6), Fehlerisolation und `ceil(n/k)` bleiben, nur die **Arbeit je Mandat** ist
eine andere. **Flaggrenze:** `HELMUT_CRON_GLOBALPHASE`, **Default AUS**, fail closed (nur
`on`/`true`/`1`/`an` schalten ein, ein Tippfehler bedeutet AUS), **nicht** über
`helmut-flags.json` setzbar — die Aktivierung ist ausschließlich eine Vercel-Env-Entscheidung
des Betreibers. Ohne Flag ist der Aufruf **byte-identisch** zum bisherigen
(`runCronForTenants(cronName, (t) => runSourceCrawl(t), { deadlineMs, runId })`; Quelltextvertrag
+ Mutationsprobe M8). **Vereinigungsmenge bewiesen — gegen das ECHTE relationale Seed-Modell**
(Modus `on` wie Production, 152 Abrufwege) mit acht Profilen, darunter je ein **Berliner** und
ein **Brandenburger** Landtagsprofil als schärfster Fall: Vollständigkeit (kein Weg verloren),
jede Kennung genau einmal, alle acht Personenquellen erhalten, **0 Berliner und 0 Brandenburger
Landeswege**, keine manuellen, keine deaktivierten Wege, kein DIP-Weg im Quellencrawl.
**Gemessen: 1 162 Wege in den Einzelplänen → 196 in der Vereinigung**, also **966 geplante
Abrufe weniger je Lauf**. Zur Reihenfolge wird **nicht** behauptet, jeder Profilplan bleibe
vollständige Teilfolge — das ist nachweislich falsch; bewiesen wird, was gilt: mandatseigene
Wege behalten ihre Reihenfolge, das erste Profil der **Fairnessreihenfolge** steht unverändert
vorn, die Ordnung ist exakt „erstes Auftreten", und sie entscheidet **nicht** über die
Versorgung, weil `crawlAllSources` keine Deadline kennt. **Kapazität, gemessen** (deterministische
Laufzeitsimulation, **beide** Pfade am echten Produktionscode, gezählt wird was WIRKLICH im
270-s-Fenster fertig wurde): production-kalibriert **n=6 alt 2/6 mit 37,6 s Überziehung → neu
6/6 ohne Überziehung**; **n=11 alt 2/11 → neu 11/11**. Grenzkosten je zusätzlichem Mandat
**32 920 ms → 6 620 ms**. **Modellrechnung** (Production-Eingangswerte: globale Arbeit 240 s,
Projektion 1,65 s, Reserve 15 s): n=6 **1/6 → 6/6**, n=11 **1/11 → 10/11** — **bei elf Mandaten
bleibt je Lauf eines übrig** (`ceil(11/10) = 2` Läufe); mit einer auf 200 s gedrückten globalen
Phase reicht ein Lauf auch für elf. **Ergebnisgleichheit — drei Unterschiede einzeln benannt und
bewertet, keiner als „erwartbar" abgehakt:** **K1-1** die Vorgangskennung hängt an der Bündelung
(mit den echten Funktionen gemessen: global 1 Cluster, mandatsweise 2 mit anderen Kennungen);
Bewertung: alle teilen dasselbe Suchpräfix, `sameVorgang` hält sie für **denselben** Vorgang, es
entsteht kein zweiter Vorgang, kein Dokument geht verloren, und die globale Bündelung kostet
**höchstens so viele** KI-Aufrufe — sie ist die kanonisch richtige, aber eine Änderung, und
deshalb freigabepflichtig. **K1-3** das 90-s-Verstehensbudget gilt künftig je **Lauf** statt je
**Mandat**; der Rest bleibt zurückgestellt und wird vom dedizierten Understanding-Cron (05:30 /
21:30 UTC) geholt — das Budget wurde **nicht** erhöht. **K1-4** im alten Pfad matcht ein früh
verarbeitetes Mandat gegen einen **unvollständigen** Korpus, im neuen sehen alle denselben. Nach
**zwei** Läufen sind beide Pfade **feldgleich**: Rohdokumente, Fundstellen, Wissensobjekte,
Matching-Ergebnisse, Scores, Entscheidungstypen, Prioritäten, Mandantentrennung und KI-Aufrufe
identisch, Gesamtfingerabdruck gleich. **Zwei Bestandsbefunde nebenbei belegt und ehrlich
benannt:** `crawlAllSources` kennt **keine** Deadline (im neuen Pfad durch stufenweisen Abruf
begrenzt — `crawler.js` blieb unverändert), und `budgetMs = 0` bedeutet in
`runUnderstandingShadow` „**kein** Limit" statt „keine Zeit" (im neuen Pfad ehrlich
übersprungen; `runSourceCrawl` bewusst nicht angefasst, damit der Altpfad byte-gleich bleibt).
**Tests (real ermittelt, kein Test als grün behauptet, der nicht lief):** neue Suite
`cron-globalphase-test.js` **169/169** · Mutationsprobe `cron-globalphase-mutationsprobe.js`
**17/17 rot** (die erste Fassung fand ein echtes Loch — die Budgetprüfung des Abrufs war nicht
abgesichert; nachgezogen) · Offline-Suite **178/192** gegen Basislinie `origin/main` `61a0947`
**177/191** mit **identischer** Fehlschlagliste (14 umgebungsbedingte Suiten, Delta genau **+1**
= die neue Suite; Basislinie im eigenen Worktree gemessen) · Browser-/Mobile-Smoke **32/32** ·
`cron-fairness` **285/285** · `punkt29-fehlervertrag` **80/80** · `pipeline-zeitbudget`
**21/21** · `source-architecture` **99/99** · `cross-tenant-security` **43/43** ·
`nachhol-schreibgate` **52/52** · `security-hardening-sql` **26/26** · Syntaxprüfung aller
geänderten Dateien grün. **Ein währenddessen eingeführter Regressionsfehler wurde gefunden und
behoben:** `env-inventar-test.js` schlug zunächst fehl (drei neue Env-Variablen nicht
dokumentiert) — nachgetragen, danach 38/38. **Sicherheitsgrenzen eingehalten:** keine
Production-Schreibzugriffe, kein manueller Cron-Lauf, keine Migration, keine Env-/Budget-/Cron-/
Zeitbudget-/Quellenänderung, keine Aktivierung von M8/Berlin/Brandenburg, keine neuen
Testmandate, kein Merge, kein Deployment, **0 KI-Aufrufe, 0,00 USD**. **Statusgrenzen:** OP-25
bleibt **teilweise abgeschlossen**; die Testmandat-Sperre aus
[`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §9 bleibt **unverändert gültig**, alle
dortigen Messwerte (`k`, `ceil(n/k)`, §10.5/§10.6) gelten weiter, weil das Flag aus ist. 25B,
29B und der R-6-Nachweis sind unberührt. **Nächster Schritt:** Merge-Entscheidung des
Betreibers; danach K2 — Entscheidung zu Befund K1-1, Aktivierung ausschließlich über die
Vercel-Env, rein lesender Production-Nachweis über mindestens 24 h. **K3 wird wahrscheinlich
nötig, sobald mehr als zehn Mandate aktiv sind.** **Zu PR #191/#192 (beide reine Doku, beide auf
dem überholten Stand `071f91c`): NICHT gemergt, NICHT geschlossen.** Aus #191 wurde der
Durchsatz-Messwert übernommen (er gilt weiter und stützt diesen Sprint); die Aussage „OP-25 ist
zwischenzeitlich behoben" darin ist **überholt** — behoben ist die Fairness, nicht die
Kapazität. #192 ist durch den Merge von PR #190 überholt: es führt „Rezeptversion anheben" als
noch offene Option, während genau das gemergt wurde; sein Messwert „5 → 2 falsche
Ausschussbelege" gilt weiter. **Empfehlung: beide nachziehen oder ersetzen, Entscheidung liegt
beim Betreiber.** Geänderte Dateien: `lib/helmut/cron-globalphase.js` (neu),
`lib/helmut/scheduler.js`, `server.js`, `scripts/cron-globalphase-test.js` (neu),
`scripts/cron-globalphase-mutationsprobe.js` (neu), `docs/betrieb/cron-globalphase.md` (neu),
`docs/betrieb/cron-fairness.md` (§9-Hinweis, §12 neu), `docs/betrieb/env-inventar.md`,
`docs/ARCHITECTURE.md` (§7-Hinweis), `docs/datenmotor-restliste.md`, `docs/CURRENT_STATE.md`.
Branch `claude/op25-k1-crons-capacity-pd1tvx`, **PR #200** (offen, kein Draft, **beide
Pflicht-Checks grün**: `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`, Lauf
`30630934870`). **Nicht gemergt, nicht deployt, Flag nicht gesetzt** — Merge =
Production-Deployment und bleibt Betreiberentscheidung.) ·
(**Sprint R-6 — Zuverlässige Cron-Telemetrie bei
Zeitüberschreitung. TEILWEISE ABGESCHLOSSEN: die Beobachtbarkeitslücke ist im Code behoben,
offline bewiesen und mutationsgesichert; der rein lesende Production-Nachweis steht aus
(Merge nötig).** **Ursache belegt (drei Teile, keine Vermutung):** (1) `withTimeout` ist ein
`Promise.race` — es **beendet die ursprüngliche Promise nicht**; greift das äußere Zeitlimit
(280 000 ms), kehrt `runCronForTenants` **nie** zurück und alles danach (die
`[cron/*/fairness]`-Zeile, der Zeitbudget-`systemError`, der Antwortkörper) entfällt.
(2) Die nominelle Differenz von 10 s zur inneren Deadline (270 000 ms) kann prinzipiell nicht
reichen: die innere Deadline ist ein **START-Gatter**, kein STOPP-Gatter — sie wird nur **vor**
dem Beginn eines Mandats geprüft, ein bei 269 s begonnenes Mandat läuft beliebig lange weiter
(`runSourceCrawl` hat sein eigenes Budget). Offline gemessen: **> 400 s über der Deadline**.
(3) Ein `finally` allein hätte **nicht** gereicht — bei einem echten Vercel-Prozessabbruch läuft
die Ereignisschleife nicht weiter; genau deshalb ist auch die Sperrfreigabe im `finally` von
`runSourceCrawl` schon heute nicht garantiert (die TTL räumt auf). **Behebung (klein, additiv,
ohne Migration und ohne zweites System):** dieselbe `helmut_store`-Zeile
`<storeId>-cron-fairness` trägt jetzt zusätzlich einen **Laufdatensatz je Cron**
(`laeufe[<cron>]`). Er wird **nicht am Ende** geschrieben, sondern bei **jedem
Mandatsübergang** — huckepack auf die Schreibvorgänge, die für die Buchführung ohnehin
stattfinden (Claim/Abschluss). Zusatzkosten im Normalfall: **2 kleine Schreibvorgänge je Lauf**
(~0,04 % des Zeitbudgets), **0 KI-Aufrufe, 0,00 USD**. Der äußere Catch der Routen `crawl`,
`pipeline` und `lage-check` vermerkt zusätzlich **nur die Tatsache** „das äußere Zeitlimit hat
gegriffen" (`aeusseresTimeoutAt`) — er behauptet **nicht**, dass die Promise beendet wurde;
läuft sie intern weiter und schreibt später ihren Abschluss, **hebt dieser den Zustand**
(monotone Rangfolge `laufend < abgebrochen < teilweise/abgeschlossen`). **Neuer Vertrag:** nach
jedem Übergang ist der Ausgang jedes geplanten Mandats eindeutig einer Klasse zuzuordnen
(`begonnen` ohne Abschluss · `erfolgreich` · `fehlgeschlagen` · `laeuft-bereits` ·
`sperre-verweigert` · `zeitbudget` · **kein Ausgang = nicht begonnen**);
`cron-fairness.rekonstruiereLauf` rechnet daraus die **vollständige** Telemetriezeile nach,
inklusive `kapazitaet` und `ceil(n/k)`. **Kein erfundener Erfolg möglich:** ein Abschluss
entsteht ausschließlich durch einen Schreibvorgang — bleibt er aus, bleibt der Datensatz
`laufend`, und ein veraltetes `laufend` **ist** die Abbruchmeldung (abgeleitet, nicht
behauptet). **Unverändert:** Reihenfolge, Losentscheid, `k`, `ceil(n/k)`, Rotation, Zeitbudgets
(270 000/240 000 ms), äußere Zeitlimits (280 000 ms), Funktionslimit (300 s), Cron-Zeiten,
Kostenbudgets, Quellen, Flags, Mandatszahl — durch Vertragstests gesichert. **Preis, ehrlich
benannt:** `FAIRNESS_VERSION` steigt 1 → 2 (Pflicht — ein Codestand der Version 1 würde
`laeufe` beim Verschmelzen **still verwerfen**). Folge: bedient während des Rollouts noch eine
Vorgänger-Instanz einen Cron, **verweigert sie den Schreibvorgang**
(`zustand-neuere-version-2`) → bereits getesteter Fail-safe-Pfad mit `systemError`,
`zustand=gestoert`, unbeschädigter Rotation. Laut und auf das Rolloutfenster begrenzt statt
still und dauerhaft (`CLAUDE.md` §4.4). **Wachstumsgrenzen:** genau **ein** Laufdatensatz je
Cron, höchstens 12 Crons, 200 Kennungen je Datensatz, 14 Tage Retention — gemessen **< 8 KB**
bei 6 Mandaten und 40 Läufen; DSGVO-Löschung erfasst die Laufspur mit. **Tests (real
ermittelt):** `cron-fairness-test.js` **285/285** (vorher 201/201, **+84**), davon 15
Mutationsproben **15/15 rot** (5 davon neu und R-6-spezifisch) · `punkt29-fehlervertrag-test.js`
**80/80** · `punkt29-fix-mutationsprobe.js` **7/7 rot** · Offline-Suite **177/191**, exakt die
**identische** Basislinie und Fehlschlagliste wie `main` `bd7c889` (14 umgebungsbedingte
Suiten, kein Delta; Basislinie im eigenen Worktree auf `origin/main` gemessen) ·
Browser-/Mobile-Smoke **32/32** · die mit `main` hinzugekommene Suite
`matching-rezeptversion-v2-test.js` **39/39**. **Auf `origin/main` `bd7c889` rebasiert**
(2026-07-31, nach den Merges von PR #190/#198); einziger Konflikt war der Kopfblock dieser
Datei — von Hand aufgelöst, R-6-Block vorn, B25-2- und OP-25-Block vollständig erhalten, keine
fachliche Änderung. Pflichtprüfungen danach **wiederholt** (Zahlen oben sind die Werte NACH dem
Rebase). **Beobachtung B29-F1 erweitert (kein Befund dieses Sprints):** unter hoher
Parallellast sind neben `berlin-e2e-vertrag-test.js` auch `brandenburg-e2e-vertrag-test.js`
flaky — je einmal in vier Runner-Läufen rot, isoliert **76/0** bzw. **98/0** grün, im
Wiederholungslauf beide wieder grün. Keine der beiden Suiten fasst dieser Sprint an. **Sicherheitsgrenzen eingehalten:** keine
Production-Schreibzugriffe, kein manueller Cron-Lauf, keine Migration, keine Env-/Budget-/
Cron-/Zeitbudget-/Quellenänderung, keine Aktivierung von M8/Berlin/Brandenburg, keine neuen
Testmandate, kein Merge, kein Deployment, **0 KI, 0,00 USD**. **Der Kapazitätsblocker aus
OP-25 §10.5/§10.7 bleibt vollständig offen** — dieser Sprint macht ihn nur zuverlässig
**messbar**, er behebt ihn ausdrücklich nicht. **Nächster Schritt:** Merge-Entscheidung des
Betreibers, danach der in [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) **§11.8**
beschriebene rein lesende Production-Nachweis (mind. 24 h reguläre Kadenz, darunter mindestens
ein Lauf mit äußerem Zeitlimit). Geänderte Dateien: `lib/helmut/cron-fairness.js`, `server.js`,
`scripts/cron-fairness-test.js`, `scripts/berlin-abnahmeprofil-test.js`,
`docs/betrieb/cron-fairness.md` (§11 neu, §4/§5/§6/§8 nachgezogen),
`docs/datenmotor-restliste.md`, `docs/CURRENT_STATE.md`. Branch
`claude/cron-telemetry-timeout-sg8emb`, **PR #199** (offen, kein Draft, `mergeable_state:
clean`, beide Pflicht-Checks grün: `Syntax + Offline-Suiten` und
`Browser-/Mobile-Smoke (Chromium)`, Lauf `30625243467`). **Nicht gemergt, nicht deployt** —
Merge = Production-Deployment und bleibt Betreiberentscheidung.) ·
(**Sprint B25-2-Auflösung — Matching-Rezeptversion
`legacy_relevance_v1` → `v2`. ERFOLGREICH ABGESCHLOSSEN (repo-seitig; Merge und damit die
Wirkung stehen beim Betreiber).** **Ausgangslage belegt:** `origin/main` = `071f91c`
(Merge PR #188), Production-Deployment `dpl_3LESACWZLhCYGis6Zh5ckRMMpRov`, Commit `071f91c`,
Ziel `production`, Alias `helmut-pilot.vercel.app`, Region `fra1` — Push 01:37:41 → Build
01:37:45 → **`READY` 01:37:56 UTC** (rein lesend über die Vercel-Deployment-API).
**Befund:** Die Ausschussbeleg-Regel (`ausschussBelegZulaessig`, Befund 27A-2/PR #185)
entscheidet, WELCHE Merkmale als Ausschussmitgliedschaft zählen; sie gibt seit dem Fix bei
gleicher Eingabe ein anderes Ergebnis (`matched_features`, Signale, Begründung, Gewicht 34).
Nach der Definition der Versionsachse (`rezept_version` = „nach welcher Regel: Merkmale,
Gewichte, Auswahl") ist das eine **Rezeptänderung** — die Anhebung war in PR #185 unterblieben
und ist die belegte Ursache von **Befund B25-2**: `matched_features` gehen bewusst nicht in
`computeInputFingerprint` ein, deshalb wurde nie neu gerechnet und die falschen Belege blieben
sichtbar (inkl. **Rang 1** des Piloten). **Abgrenzung zur Gegenentscheidung §36** (dort wurde
eine Anhebung zu Recht abgelehnt): dort rechnete das Rezept nach dem Fix exakt wie vorher und
sah nur seinen Eingang nicht — hier rechnet die Regel selbst anders. **Fix: eine Zeile
Produktionscode** (`lib/helmut/matching-contract.js`), nur die Rezeptachse; Engine
(`legacy-shadow-1`), Vektor (`feature-hash-256-v1`) und Auditschema (`matching-audit-1`)
unverändert. Keine Migration, kein Backfill, kein Flag, kein Cron. **Deterministisch bewiesen**
(neuer Vertrag `scripts/matching-rezeptversion-v2-test.js`, **39/39**, am echten
`runMatchingShadow` mit echtem `matching-audit`): (1) der Eingabefingerabdruck ändert sich an
allen drei Stellen, an denen die Version eingeht; (2) der nächste **reguläre** Lauf rechnet neu
— mit **Gegenprobe**, dass er ohne die Anhebung idempotent bliebe (= B25-2); (3) die
Ausschussbelege folgen der korrigierten Logik (Bund × Landesvorgang mit gleichem
Ausschuss-Stamm → kein Beleg, Thema bleibt), und die Anhebung ändert die **Regel** nicht;
(4) der identische Folgelauf ist wieder idempotent — die Anhebung wirkt **genau einmal je
Mandant**; (5) keine Regression für andere Mandanten: Feld-für-Feld byte-identisch außer
Versions-/Laufmetadaten, **Ähnlichkeit und Rang unverändert — die Kartenreihenfolge kippt
nicht**, Mandantentrennung gewahrt. **Golden-Anker versionsexplizit ergänzt statt neu gesetzt:**
`48d761b7…`/`3d4e2222…` gelten unter `v1` unverändert weiter (0a/0b), die v2-Stände sind
zusätzlich verankert (0a2), und **0a3** beweist, dass der Unterschied v1→v2 ausschließlich in
`rezept_version` und `ko_eingabe_hash` liegt. **Kosten: 0 KI-Aufrufe, 0,00 USD** (Matching ist
ein reiner Rechenpfad); einmalig ≤ 126 Zeilen (6 Profile × 1 Laufzeile + je bis zu 20
Ergebniszeilen), verteilt über die ohnehin stattfindende reguläre Rotation — **kein
zusätzlicher, kein manueller Lauf**. **Sichtbare Wirkung:** die 5 heute noch sichtbaren
falschen Ausschussbelege werden abgelöst (2 Pilot inkl. Rang-1-Karte, 3 zweiter Mandant),
Score −34, überwiegend Wechsel der Entscheidungsstufe; es verschwinden Belege und Dringlichkeit,
keine Karten. **Rückweg belegt (H1–H3):** `git revert` → der nächste Lauf findet den alten
v1-Lauf in der append-only-Historie, bleibt idempotent, erzeugt keine dritte Generation; bereits
korrigierte Zeilen behalten ihre korrigierten Werte — der Rückweg beschädigt nichts und macht
die Korrektur nicht rückgängig. **Tests (real ermittelt):** neuer Vertrag **39/39** ·
Ausschuss-Zuständigkeit **88/88** (2 neue Anker-Assertions) · Audit **178/178** ·
Erklärungsabdeckung **60/60** · Offline-Suite ohne Secrets **190/191** gegen Basislinie
`origin/main` **im selben Verzeichnis** 188/190 bzw. 189/190 — gemeinsamer Fehlschlag
`p1-security-check.js` auf **beiden** Ständen (umgebungsbedingt: bei **identischem Code** in
zwei Verzeichnissen unterschiedliche Fehlschlaglisten reproduziert; `werkzeug-lesefehler-test.js`
zusätzlich nur auf der Basislinie, flatternd), Suiten-Delta genau **+1** (der neue Vertrag) ·
Browser-/Mobile-Smoke **32/32** (allein gelaufen; ein früherer 19/3-Lauf war Parallellast, vgl.
B29-F1). **CI auf PR #190 vollständig grün** (beide Pflicht-Checks ✅) —
`p1-security-check.js` läuft dort durch und ist damit als umgebungsbedingt bestätigt.
**Ehrlich benannt:** der erste CI-Lauf des reinen **Doku**-Commits war rot
(`werkzeug-lesefehler-test.js`, 42/1) — bei identischem Produktionscode zum grünen
Vorgängercommit, lokal 6/6 grün, dieselbe Suite flatterte zuvor auch auf der
Basislinie; nach Neulauf grün. **Neue benannte Beobachtung B25-F1** (kein Befund
dieses PRs): diese Suite ist unter Last flatteranfällig, dasselbe Muster wie B29-F1
— eigene kleine Aufgabe „lastfeste Testdoppel". **Grenzen eingehalten:** kein manueller Lauf, kein Backfill, kein
Production-Schreibzugriff (nur lesende Deployment-API), keine Sonderbehandlung des
Pilotmandanten, keine künstlichen Fehler für 29B, kein Merge; Berlin/Brandenburg/M8 unverändert
AUS. **Statusgrenzen: 25B und 29B bleiben offen** — beide warten weiterhin auf ihre regulären,
rein lesenden Production-Nachweise; Checkliste unverändert. **Nächster Schritt:**
Merge-Entscheidung des Betreibers, danach 25B rein lesend am ersten regulären Pilotlauf nach
dem Deployment. Branch `claude/p25b-rezeptversion-anheben`. Kanonisch:
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §53.) ·
(**Sprint OP-25, regulärer Production-Nachweis, 2. Durchgang —
rein lesend, kein Code, keine Production-Änderung. TEILWEISE ABGESCHLOSSEN: die Fairnesslogik
arbeitet in Production nachweislich korrekt, ein VOLLSTÄNDIGER Fairnesszyklus gelang aber nur beim
leichtesten Cron. Die fünf weiteren realen Testmandate bleiben GESPERRT — aus einem jetzt
gemessenen Kapazitätsgrund.** **Nicht mit Phase-1-Punkt 25 verwechseln** (Ende-zu-Ende-Test
Pilotmandant, Zeile 25 der Checkliste) — anderer Punkt, hier unberührt. **Vorprüfung vollständig
bestanden (12/12):** PR #179 gemergt (Merge `30c86cf`), `main` enthält `9454d8e` (per
`git merge-base --is-ancestor` bestätigt), Deployment `dpl_9PvfRQV4…` **READY 2026-07-30 06:27:19
UTC** und vor allen gewerteten Läufen aktiv, Arbeitsbaum sauber, M8/Berlin/Brandenburg unverändert
AUS, Quellen/Budgets/Cron-Zeiten unverändert, `HELMUT_CRON_FAIRNESS` **positiv als aktiv belegt**
(`zustand=ok` in den Telemetriezeilen **und** nachweislich nicht-alphabetische Reihenfolge — bei
`off` wäre sie exakt alphabetisch). **Beobachtungsfenster:** 30.07. 06:27:19 UTC → 31.07. 08:00 UTC.
**Fünf reguläre fairness-relevante Läufe gewertet:** `lage-check` 30.07. 10:00:31 (**k=1**, 1/6
erfolgreich, `obergrenzeLaeufe=6`) · `pipeline` 30.07. 16:01:01 (**k=2**, 1 erfolgreich) · `crawl`
30.07. 20:00:30 (**k=2**, 1 erfolgreich) · `crawl` 31.07. 04:01:04 (**k=2**, 1 erfolgreich) ·
`morning-briefing` 31.07. 05:00:50 (**k=6**, **6/6 erfolgreich**, `obergrenzeLaeufe=1`, 13 596 ms).
**Nicht gewertet:** 30.07. 07:52:56 `pipeline` — entspricht **keinem** Cron-Eintrag in
`vercel.json` (pipeline = 16:00 UTC), also kein regulärer Lauf; seine Wirkung auf den Zustand ist
ausgewiesen. **Was korrekt funktioniert (belegt):** Reihenfolge **nicht alphabetisch** und je Lauf
verschieden (alphabetisch wäre `M-2,M-1,M-5,M-3,M-6,M-4`; beobachtet `M-1,M-2,M-5,M-6,M-3,M-4`
bzw. `M-3,M-6,M-1,M-2,M-5,M-4`) · nicht begonnene Mandate rückten im Folgelauf vor · **kein
erfundener Erfolg** (das jeweils zweite begonnene Mandat trägt `versuche=1, erfolge=0` **ohne**
`letzterErfolgAt`, obwohl der Lauf global HTTP 200 meldete) · `ceil(n/k)` stimmt exakt mit den
gemeldeten Werten · persistenter Zustand über **drei Commits** und 22 Stunden erhalten · **kein
`k=0`** (min. `k=1`) · **keine** neuen Runtime-/DB-/Lock-/Fairnessfehler · der Zeitbudget-Abschnitt
wird **gemeldet** statt still grün zu bleiben (`[cron/lage-check] Zeitbudget erschoepft — 5 von 6
Mandaten NICHT verarbeitet.` + Systemfehler). **Nicht in Production beobachtbar** (trat nicht auf,
gilt weiter nur offline belegt): `lockVerweigert` (`sperreVerweigert=-` überall), Fehlerisolation
bei Mandatsfehlern (`fehlgeschlagen=0` überall), `k=0`. **NICHT BESTANDEN:** ein vollständiger
Fairnesszyklus gelang nur beim `morning-briefing` (6/6); `crawl` 4/6, `pipeline` 4/6, `lage-check`
1/6. **Wichtige Korrektur einer bisherigen Erwartung (R-4):** der Fairnesszustand ist **je Cron
getrennt** (`data.crons[<cronName>]`) — die Zusage „über vier Läufe (04/10/16/20 UTC) sind alle
Mandate begonnen" war fachlich falsch, jeder Cron rotiert seinen **eigenen** Zyklus.
**NEUER BEFUND R-6 (Beobachtbarkeitslücke):** endet `crawl`/`pipeline` im äußeren
`withTimeout(…, 280000)` bei innerer Deadline 270 000 ms, kehrt `runCronForTenants` **nie** zurück
— die `[cron/*/fairness]`-Zeile wird **nie geschrieben**, sichtbar bleibt nur
`tenants=undefined bounded=true`. Betroffen **3 von 5** gewerteten Läufen; `k` musste dort aus dem
persistenten Zustand **rekonstruiert** werden (Primärdaten, keine Schätzung). Die Buchführung
selbst bleibt korrekt — behebbar ohne Fairnessänderung, **eigener Sprint, hier nicht umgesetzt**.
**GEMESSENE KAPAZITÄT (n = 6 aktive Mandate):** min `k` = **1** (`lage-check`), typisch **2
begonnen / 1 erfolgreich** (`crawl`, `pipeline`), max **6** (`morning-briefing`, ≈ 2,3 s/Mandat).
Real heißt das: ein Mandat wird im `crawl` alle **1,5 Tage begonnen** und alle **3 Tage
erfolgreich** verarbeitet, im `pipeline` alle 3 bzw. 6 Tage, im `lage-check` alle **6 Tage**; nur
das `morning-briefing` erreicht alle sechs **täglich**. **HOCHRECHNUNG (Rechnung, keine Messung)
bei n = 11:** `crawl` 3 bzw. 5,5 Tage · `pipeline` 6 bzw. 11 Tage · `lage-check` **11 Tage** ·
`morning-briefing` weiterhin täglich. **ENTSCHEIDUNG zu den fünf weiteren realen Testmandaten:
NICHT aktivieren — auch nicht einzeln.** Vorbereiten ist erlaubt. Begründung: **nicht die
Fairness, sondern die Kapazität ist der Blocker.** Schon bei sechs Mandaten ist die
Datengrundlage je Mandat 1–3 Tage alt; das täglich erzeugte `morning-briefing` baut auf genau
diesen Daten auf — ein frisches Briefing über drei Tage alte Vorgänge erfüllt „Was steht heute
an?" (`START_HERE.md` §1) nicht. Es entsteht damit ein **neuer Kapazitätsblocker, obwohl die
Fairness korrekt funktioniert**; er ist die direkte Fortsetzung von Befund **B5** (280-s-Limit)
und gehört fachlich zu OP-25/OP-15/OP-21. Voraussetzung für eine spätere Aktivierung: höheres `k`
im schweren Pfad (mehr Cron-Slots, Parallelisierung je Mandat, kürzere Google-News-Timeouts →
OP-15, oder eine Stufe außerhalb des 300-s-Fensters). **Sicherheitsgrenzen eingehalten:**
ausschließlich lesende Zugriffe (Vercel-Deployment-Metadaten und Runtime-Logs, `SELECT` auf
`helmut_store`, `mandate_profiles`, `process_runs`, `pipeline_locks`), **0 KI-Aufrufe, 0,00 USD**,
keine Production-Schreibzugriffe, kein manueller Cron-Lauf, keine Migration, keine Env-/Budget-/
Cron-/Quellenänderung, keine Aktivierung von M8/Berlin/Brandenburg, keine neuen Testmandate,
keine Testdaten in Production, keine Überwachungszusage. **Mandate erscheinen in Doku und
Ausgaben ausschließlich pseudonymisiert** (`M-1` … `M-6`); die Zuordnung zu Klarnamen wird bewusst
nicht dokumentiert (`CLAUDE.md` §4.2). **Statusgrenzen:** OP-25 bleibt **teilweise abgeschlossen**;
Phase-1-Punkt 25 (25B), Punkt 27, OP-15, OP-21, OP-27 und M8 unverändert. **Nächster Schritt:**
Betreiberentscheidung über den Kapazitätspfad (R-6-Fix und `k`-Erhöhung sind getrennte Sprints);
die Testmandat-Sperre aus [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §9 bleibt gültig.
Geänderte Dateien: `docs/betrieb/cron-fairness.md` (§10 neu, R-4 korrigiert, R-6 neu, §9-Hinweis),
`docs/datenmotor-restliste.md` (OP-25-Status), `docs/CURRENT_STATE.md`. Branch
`claude/op-25-production-nachweis-2` (nur Doku), PR folgt.) ·
(**Sprint P29-Fix — Fehlerpfade schließen (P29-1…P29-4).
ERFOLGREICH ABGESCHLOSSEN (repo-seitig) — alle vier
in Punkt 29A deterministisch belegten Produktionsfehler sind behoben, offline bewiesen und
mutationsgesichert; 29B (rein lesender Production-Nachweis) bleibt offen.**
**Nachtrag 2026-07-31 (Etappe 2 des Integrationssprints): auf `main` `cb10d76` (= Merge PR #187)
rebasiert und in den jetzt gemergten 29A-Vertrag integriert.** Konflikt in `CURRENT_STATE.md` von
Hand gelöst (P29-Fix-Block vorn, 29A-Block vollständig erhalten). **Assertions an die korrigierte
Produktionslogik angepasst:** **B9** fordert jetzt, dass ein zurückgegebenes Timeout-Objekt als
FEHLER gebucht wird (`letzterErfolgAt === null`, Fehlerserie läuft weiter) statt als Erfolg ·
**C9** fordert `skipped-invalid` MIT markFailed, Begründung und Endzustand (`cluster-error === 0`)
statt des anonymen `cluster-error` · **D9** fordert den zweiten Update-Versuch
(`updateVersucht === 2`, zweiter Lauf zeigt `skipped-error === 1`) und lässt die **4 unveränderten**
Cluster ausdrücklich als zulässige Duplikate zu. **Überstrenge P29-3-Befundprobe korrigiert:** die
frühere Bedingung `duplicate === 0` über ALLE Cluster war fachlich falsch und hätte auch nach einem
korrekten Fix nie grün werden können — geprüft wird jetzt der tatsächlich geforderte erneute
Updateversuch (`updateVersuche >= 2`, `skipped-error === 1`), während der unveränderte Nachbarcluster
zulässig `duplicate` bleibt; Befundproben stehen damit auf **4/4 behoben, Exit 0**.
**Zwei Regressionen dabei gefunden und behoben:** (1) **Deckungslücke** — nach dem P29-2-Fix lief
kein Test mehr durch den `cluster-error`-Catch, der die Fehlerisolation je Cluster absichert;
Mutation **M12 überlebte**. Geschlossen durch den neuen Vertragsfall **C9b** (ausgelöst über einen
ungeschützten Speicherfehler), Probe erkennt M12 wieder → **12/12**. (2) **Drei veraltete
Mutationsproben** — der P29-3-Fix hat den `duplicate`-Block umgeschrieben, dadurch brachen die
Pilot-/Berlin-/Brandenburg-Proben mit **Exit 2 („Probe ist veraltet")** ab und liefen gar nicht;
Anker auf die stabile Zeile `if (!neueDocs.length) {` verkürzt, alle drei laufen wieder.
**Tests nach der Integration (real ermittelt):** 29A-Vertrag **80/80** · 29A-Mutationsprobe
**12/12 rot** · Befundproben **4/4 behoben** · Fixpfade **40/40** · Fix-Mutationsprobe **7/7 rot** ·
Offline-Suite ohne Secrets **186/190** gegen Basislinie `main` `cb10d76` **185/189** mit identischer
Fehlschlagliste (4 umgebungsbedingte Suiten), Delta genau **+1** (`punkt29-fixpfade-test.js`) ·
E2E-Proben Pilot/Berlin/Brandenburg **10/10 · 10/10 · 17/17 rot** · E2E-Verträge **96/96 · 76/76 ·
98/98** · cron-fairness **201/201** · matching-audit **178/178** · vorgangs-lebenszyklus **81/81** ·
pending-terminal **63/63** · ko-recovery **12/12** · ai-json-parse **13/13** · nachhol-schreibgate
**52/52** · understanding-recovery **57/57** · Browser-/Mobile-Smoke **32/32**.
**Benannte Beobachtung B29-F1 (kein Befund dieses PRs):** `berlin-e2e-vertrag-test.js` ist unter
hoher Parallellast flaky (Fall J8, Rangfolge) — der Fehlschlag trat **auch auf `main` `cb10d76`**
isoliert auf (75/76) und ist nicht von diesem PR verursacht; ohne Parallellast 4/4 grün auf beiden
Ständen. Nicht behoben, eigene kleine Aufgabe. **Punkt 29 bleibt ⏳ teilweise; 29B unverändert
offen** (Production-Nachweis an natürlich auftretenden Fehlerzuständen, künstliche Fehler in
Production verboten). Ausgangspunkt
`origin/main` `75d7286`; die 29A-Befundproben (aus PR #187 rein lesend übernommen) reproduzierten
dort **0/4 behoben (Exit 1)**. **Fixes (kleinste sichere Korrektur, je `git revert`-rückbaubar):**
**P29-1** `cron-fairness.js` bucht zurückgegebene Fehler-/Timeout-Objekte (`ok:false` /
`bounded:true` / `failed:true`; Skip-Vorrang: `skipped:true` ist NIE ein Fehler) jetzt als FEHLER
statt Erfolg — kein erfundener `letzterErfolgAt`, keine zurückgesetzte `fehlerSerie` (neue
exportierte Klassifikation `ergebnisFehlgeschlagen`); `server.js` hebt die inneren
`build-`/`lage-check-`/`push-timeout`-Befunde in die Mandatsantwort (die `status:'stable'`-
Maskierung bleibt nur für die Push-Logik erhalten). **P29-2** `understanding.js` parkt nicht
verwertbare KI-Rückgabewerte (`null`/kein Objekt) kontrolliert (`skipped-invalid` + markFailed +
Skip-Log + Verknüpfung) statt als anonymer `cluster-error` ohne Endzustand — kein unbegrenzter
Retry mehr. **P29-3** „duplicate" gilt nur noch für nachweislich vollständig verarbeitete
Fassungen: nicht erfolgreiche Aktualisierungen werden vorgemerkt (Auth-Store-Muster wie P1-4,
KEINE Migration; neue Storage-Primitiven `getUpdateRetries`/`saveUpdateRetries`) und BEGRENZT
wieder aufgenommen — Deckel 3 Fehlversuche → sichtbar `skipped-update-final` (neue Ergebnisklasse,
Gruppe „fehlgeschlagen", kein weiterer KI-Call); Budget-Vertagung zählt nicht gegen den Deckel;
ein Erfolg löst die Vormerkung auf; echte neue Dokumente heilen weiterhin über den normalen
Update-Pfad. **P29-4** Existenz-Check der Pending-Vormerkung fail-closed
(`getKnowledgeObjectByVorgang` mit `throwOnError`-Option, Default für Bestandsaufrufer
unverändert): Lesefehler → `skipped, reason:'existenz-unbekannt'`, KEIN Schreibvorgang — ein
fertiges Wissensobjekt kann nicht mehr auf `pending` zurückgestuft werden. **Tests (real
ermittelt):** neue Regressionssuite `scripts/punkt29-fixpfade-test.js` auf dem Ausgangscode
**24 rot / 16 Gegenproben grün** → nach den Fixes **40/40**; Mutationsprobe
`scripts/punkt29-fix-mutationsprobe.js` **7/7 rot erkannt** (Referenzlauf grün; M1–M3 P29-1 inkl.
Skip-Unterscheidbarkeit und Routen-Anhebung, M4 P29-2, M5/M6 P29-3 inkl. Deckel, M7 P29-4);
29A-Befundproben nach den Fixes **3/4 behoben** — P29-3 bleibt dort formal rot wegen einer
überstrengen Gesamt-Erwartung (`duplicate===0` über ALLE Cluster; der unveränderte Nachbar-Cluster
bleibt ehrlich ein Duplikat), real belegt: der geforderte zweite Update-Versuch findet statt →
Integrationshinweis für PR #187 (dort gepinnte Assertions B9/C9/D9 + Probe-Erwartung anpassen,
`roadmap/punkt-29-fixsprint.md` §5); Offline-Suite ohne Secrets **189/189** gegen Basislinie
`origin/main` `75d7286` **188/188** (getrennter Worktree, identische Umgebung; Fehlschlaglisten
byte-identisch — beide leer; die +1 ist die neue Suite); Browser-/Mobile-Smoke **32/32**;
betroffene Bestandsverträge einzeln grün (cron-fairness · vorgangs-lebenszyklus 81/81 ·
matching-audit 178/178 · ai-json-parse 13/13 · ko-recovery 12/12 · pending-terminal 63 ·
pipeline-zeitbudget · Pilot-E2E 96/96 · Berlin 76/76 · Brandenburg 98/98 — Testgerüst
`e2e-vertrag-geruest.js` additiv um die Vormerkungs-Replik erweitert). **Sicherheitsgrenzen
eingehalten:** 0 Production-Zugriffe (auch nicht lesend), 0 KI-Aufrufe / 0,00 USD, keine
Migration, kein Backfill, keine Datenkorrektur, keine manuellen Läufe, keine Env-/Flag-/Cron-/
Lock-/Budget-/Quellen-Änderung, Berlin/Brandenburg/M8 unverändert AUS, keine neuen Mandate,
keine Production-Daten im Repository; Checkliste Zeile 29 unangetastet (der Statuswechsel
offen→teilweise gehört zu PR #187); 25B/OP-25/Punkt 27 unberührt. **Branch
`claude/p29-fehlerpfade-schliessen-wpxb1h`, PR #188 (offen, NICHT gemergt); CI auf dem PR
vollständig grün (beide Pflicht-Checks, 2026-07-30 17:09 UTC).**
**Nächster Schritt:** Betreiberentscheidung über den Merge dieses Fix-PRs (unabhängig von 25B und
PR #187 mergefähig; Empfehlung: VOR PR #187 mergen, dann dort B9/C9/D9 + Befundprobe anpassen),
danach 29B rein lesend. Kanonisch:
[`roadmap/punkt-29-fixsprint.md`](roadmap/punkt-29-fixsprint.md).) ·
(**Sprint Phase-1-Punkt 29A — deterministischer Belastungs-
und Fehlervertrag (Fehlerpfade und Wiederholungen), geschnitten in 29A (Repository-Vertrag) und 29B
(rein lesender Production-Nachweis). TEILWEISE ABGESCHLOSSEN — 29A vollständig erfüllt, 29B offen,
und es wurden VIER echte Produktionsfehler gefunden (nicht behoben — Befundregel).**
**Nachtrag 2026-07-31 (Etappe 1 des Integrationssprints): auf `main` `1e34761` (= Merge PR #189)
rebasiert, die Merge-Sperre „nicht vor 25B" ist AUFGEHOBEN.** Begründung, belegt: (a) **Befund
B25-2** ([`roadmap/punkt-25-e2e-nachweis.md`](roadmap/punkt-25-e2e-nachweis.md) §6c, mit PR #189 in
`main`) — der reguläre Pilotlauf am 2026-07-30 **20:04:27 UTC** blieb **idempotent**
(`wiederholungen` 0 → 1, keine neue Generation), weil `matched_features` bewusst nicht in
`computeInputFingerprint` eingehen; 25B hat damit **keinen zusagbaren Abschlusstermin**, und eine
Sperre dagegen wäre unbefristet. (b) Der zweite Sperrgrund — Doku-Überschneidung in
`CURRENT_STATE.md`/`phase_1_checkliste.md` mit dem 25B-Folgeauftrag — ist mit dem Merge von PR #189
und diesem Rebase **aufgelöst** (Konflikt in `CURRENT_STATE.md` von Hand gelöst, der 25B-Block ist
vollständig erhalten). **Unverändert:** keine Zeile Produktionscode, kein Lauf, kein
Production-Zugriff; Punkt 29 bleibt **⏳ teilweise**; 25B bleibt offen.
**Startprüfung bestanden:** Arbeitsbaum sauber, Branch `claude/phase-1-punkt-29a-deterministic-0v63lz`
ursprünglich vom `main` `75d7286` (= Merge PR #186), jetzt auf `1e34761` (= Merge PR #189);
PR #185 (`cf290ab`), PR #186 und PR #189 vollständig in
`main`, Punkt 25 ⏳ (25B offen — von diesem Sprint NICHT berührt:
kein Lauf, kein Trigger, keine Env-/Cron-/Lock-/Budget-/Quellen-Änderung), Punkt 27 ⏳, Punkt 29
vorher ☐, Punkt 30 blockiert, OP-25 getrennt, Berlin/Brandenburg/M8 AUS; keine überschneidende
Arbeit an Punkt 29 (offene PRs #159/#148/#132/#117/#115/#112/#111/#88/#70/#8 betreffen andere
Themen). **29A:** neuer Vertrag `scripts/punkt29-fehlervertrag-test.js` (**79/79**, drei Läufe
identisch, mit und ohne Production-Secrets) prüft gegen die **echten Produktionsfunktionen** alle
sechs Fehlerklassen des Auftrags: A Zeitüberschreitungen/harte Grenzen (Fairness-Deadline vor
Beginn/je Mandat mit injizierter Uhr, Understanding-Zeitbudget mit Teilzustand + Vormerkung,
absolute Vormerk-Deadline, Quellen-Timeout-Klassifikation) · B fehlerhafte Inhalte (leere
Antwort/ungültiges JSON → `skipped-error` + failed-Parkung + Skip-Log + begrenzter errorCode,
falscher Typ/fehlende Pflichtfelder → `skipped-invalid`, ein defekter Datensatz blockiert nicht,
kein KO/keine Entscheidung aus defektem Inhalt, keine Secrets in Fehlerzuständen, unlesbarer
Zeitstempel/Rieseninhalt/kaputte Kodierung gedeckelt, widersprüchliche Metadaten deterministisch) ·
C Wiederholungen/Idempotenz (Duplikat-Erkennung byte-identisch, Audit-Fingerabdruck: neue
Laufkennung + identischer Inhalt → `wiederholungen+1` ohne zweite Generation, vergebene Sperre →
`matching-locked` ohne Laufzeile, `already running` zählt nicht als begonnen, Vermerk läuft
kontrolliert ab) · D Circuit Open (Schwelle→öffnet, unterbundene Aufrufe klassifiziert und weder
Erfolg noch Quellenfehler — A-7-Zählvertrag `aggregator-gedrosselt`, echter Totalausfall bleibt
`fehlgeschlagen`, Abkühlzeit + kontrollierte Probe, Mandanten-/Quellentrennung, Retry-Budget hart
gedeckelt) · E kein falsches Grün (jeder Torzustand trägt seinen Grund und erhöht keine
Erfolgszähler; Publish-Abbruch → Lauf `fehlgeschlagen`, alte Generation bleibt, nie idempotenter
Treffer; Lage wirft bei Store-Fehler statt „ruhiger Tag") · F kontrollierte Wiederaufnahme
(Abbruch vor erstem Schreiben/nach Rohdokument/KO/Understanding/Matching/Entscheidung → Neustart
ohne fachliche Duplikate über den ECHTEN Nachholpfad, Cluster aus der Verknüpfung; erneuter Fehler
→ failed geparkt ohne Endlos-Retry; begrenzte Heilung failed→pending→complete, nach maxRetries
terminal; Mandantentrennung inkl. Audit-Guard CROSS_TENANT_WRITE; ohne KI, ohne Secrets). Alle 15
Pflichtkonstellationen enthalten. **Mutationsprobe `scripts/punkt29-mutationsprobe.js`: 12/12 rot**
— alle 12 Pflichtmutationen des Auftrags, jede gegen Produktionsdateien (`understanding.js`,
`cron-fairness.js`, `google-news-hardening.js`, `matching-audit.js`). **VIER ECHTE
PRODUKTIONSFEHLER GEFUNDEN, deterministisch reproduziert, NICHT behoben** (Korrektur = aktive
Produktionslogik = getrennte freigabepflichtige Fix-Sprints; „roter Regressionstest" =
`scripts/punkt29-befundproben.js`, **4/4 rot erwartungsgemäß**, bewusst nicht im Offline-Runner;
heutiges Verhalten im Vertrag gepinnt B9/C9/D9): **P29-1** `cron-fairness.js:535-537` — von
perTenant ZURÜCKGEGEBENE Fehler-/Timeout-Objekte der Cron-Routen (`build-timeout`,
`lage-check-timeout` — server.js:1066 maskiert den Timeout sogar als `status:'stable'`) werden als
ERFOLG verbucht: erfundener letzter Erfolg, Fehlerserie auf 0, Kapazität zu optimistisch; Rotation
selbst korrekt (sortiert nach Versuch) · **P29-2** `understanding.js:839` (außerhalb try) +
`ai.js` `parseJsonText("null")`→`null` ohne throw — nicht verwertbarer KI-Rückgabewert endet als
`cluster-error` OHNE markFailed/logSkip: kein failed-Zustand, Dokumente ohne Endzustand,
unbegrenzter Retry im Pending-Pfad · **P29-3** `understanding.js:762-764` verknüpft neue Dokumente
VOR dem KI-Call — eine gescheiterte Aktualisierung wird beim identischen Neustart `duplicate`, der
zweite Update-Versuch findet nie statt (Nachholpfad greift nicht: Bestand ist `complete`, nicht
`pending`) · **P29-4** `storage.js:2344-2353+2961-2975` — Lesefehler beim Existenz-Check →
`null` → pending-Upsert über ein womöglich fertiges Wissensobjekt (fail-open; mit lokalem
PostgREST-Stub bewiesen: nach GET-500 erfolgt der POST mit `status:'pending'`). Zusätzlich 8
dokumentierte Beobachtungen (B29-1…B29-8, u. a. stiller `v3-store-error`-Skip im Matching-Pfad,
`'empty'`-Maskierung von 200er-Störungen, DIP ohne Timeout, Blob-Lock fail-open per Default,
`saveCrawlRun` ohne runId-Dedup). **Bestandsbelege wiederverwendet statt dupliziert** (Tabelle in
der Nachweisdoku §7: cron-fairness inkl. eigener 10/10-Mutationsprobe, crawler-hardening,
incident-crawl-amplifikation, google-news-hardening, source-failure, llm-reservation,
matching-audit, stoerungswahrheit, werkzeug-lesefehler, prozesslauf-telemetrie, pilot-25A-Störfall
u. a.). **Tests (real ermittelt):** neuer Vertrag **79/79** · neue Mutationsprobe **12/12 rot** ·
Befundproben **4/4 rot** (erwartungsgemäß, Exit 1) · Offline-Suite **ohne** Production-Secrets
(maßgeblich, bildet CI nach) **185/189** gegen Basislinie `origin/main` `75d7286` **184/188** mit
**byte-identischer** Fehlschlagliste (privacy-vollstaendigkeit, profile-db, provision-tenant,
tenant-neutrality — umgebungsbedingt, im CI grün; die +1 ist die neue Suite) · Pilot-Mutationsprobe
**10/10 rot** · Berlin **10/10 rot** · Brandenburg **17/17 rot** (alle drei unverändert grün trotz
neuer Suite) · Browser-/Mobile-Smoke **32/32**. **Sicherheitsgrenzen eingehalten:** KEINE Zeile
Produktionscode geändert (nur neue Dateien unter `scripts/` + `docs/`), kein Production-Zugriff
(auch kein lesender), 0 KI-Aufrufe, 0,00 USD, keine Migration, kein Backfill, kein manueller Lauf,
keine Env-/Flag-/Cron-/Lock-/Budget-/Quellen-Änderung, Berlin/Brandenburg/M8 unverändert AUS, keine
neuen Mandate, keine Production-Daten im Repository, 25B-Wartesituation unberührt.
**Statusgrenzen:** Checkliste Zeile 29 jetzt ⏳ (29A erfüllt; ✅ erst nach 29B UND den vier
Fix-Sprints); Punkt 25 bleibt ⏳ (25B offen), Punkt 27 bleibt ⏳, OP-25 getrennt und unverändert
(ihr Production-Nachweis fließt in 29B ein, wird getrennt bewertet), M8 AUS, Punkt 30 blockiert.
**Nächster Schritt:** Merge-Entscheidung über den 29A-PR (Sperre gegen 25B aufgehoben — siehe
Nachtrag oben). Danach
Betreiberentscheidung über die Reihenfolge der Fix-Sprints (Empfehlung: P29-2/P29-4 zuerst —
kleinste Eingriffe), dann 29B nach [`roadmap/punkt-29-fehlervertrag.md`](roadmap/punkt-29-fehlervertrag.md) §6.
Geänderte Dateien: `scripts/punkt29-fehlervertrag-test.js` (neu),
`scripts/punkt29-mutationsprobe.js` (neu), `scripts/punkt29-befundproben.js` (neu),
`docs/roadmap/punkt-29-fehlervertrag.md` (neu, kanonisch), `docs/roadmap/phase_1_checkliste.md`
(Zeile 29 ⏳), `docs/CURRENT_STATE.md`. Branch `claude/phase-1-punkt-29a-deterministic-0v63lz`,
PR folgt. Kanonisch: [`roadmap/punkt-29-fehlervertrag.md`](roadmap/punkt-29-fehlervertrag.md).) ·
(**Nachprüfung Punkt 25B — rein lesend, kein Code, keine
Production-Änderung. ERGEBNIS: 16 von 17 Abnahmekriterien erfüllt; 25B bleibt offen und braucht
jetzt eine BETREIBERENTSCHEIDUNG statt weiterer Wartezeit.** **Geschlossen:** der
Deployment-`READY`-Beleg, der in PR #184/#185 nicht erbringbar war — die Vercel-API war in dieser
Sitzung erstmals verfügbar: `dpl_HFU8JjcREEFX4YXESsk7ua8uEhog`, Commit `cf290ab` (Merge PR #185),
Ziel production, Alias `helmut-pilot.vercel.app`, **`READY` 2026-07-30 13:22:02 UTC** (Merge
13:21:45 → Build 13:21:50 → READY 13:22:02); PR #186 entsprechend `dpl_HLasm9hNVti4mJLobwGGmGHP2atQ`
(`75d7286`). **Erster regulärer Lauf nach dem Deployment vollständig geprüft** (2026-07-30,
16:04:59,977 → 16:05:01 UTC, Auslöser `crawl`, Status `vollstaendig`, 20 veröffentlicht / 33
abgelöst, 0 Wiederholungen): **alle inhaltlichen Kriterien erfüllt** — **0 von 20** Zeilen tragen
überhaupt einen Ausschussbeleg, jede Zeile mit der echten Produktionsfunktion
`ausschussBelegZulaessig` gegen die KO-Zuständigkeit nachgerechnet, sichtbare Erklärung
deckungsgleich mit persistierter Begründung/Signalen (`erklaerungAusErgebnis`), Mandantenzuordnung,
Ränge 1–20 lückenlos, Versionsachsen unverändert, Zeitreihenfolge Deployment 13:22:02 < Laufstart
16:04:59 < `berechnet_am` ≤ Laufende, keine Fehlerzeile. **Einziges offenes Kriterium:** der Lauf
gehört einem **anderen** Mandanten (OP-25-Rotation), nicht dem Piloten. **NEUER BEFUND B25-2 —
belegt, freigabepflichtig, ändert die bisherige Erwartung:** Der Pilotmandant *war* nach dem
Deployment dran (2026-07-30, **20:04:27 UTC**, regulärer `crawl`-Cron), der Lauf blieb aber
**idempotent** — `wiederholungen` 0 → 1, `letzter_lauf_at` gesetzt, **keine neue Generation**, keine
Zeile neu berechnet. **Ursache aus dem Vertrag selbst belegt** (`lib/helmut/matching-contract.js`,
`computeInputFingerprint`/`computeCandidateSetHash`): der Idempotenzschlüssel besteht aus Mandant ·
Profil · `profil_hash` · Engine-/Rezept-/Vektorversion · Schwellenwerte · Kandidatenhash
(`ko_id|similarity|ko_eingabe_hash`); **`matched_features` gehen bewusst NICHT ein** — sie sind
Ergebnis, nicht Eingang. PR #185 verändert ausschließlich `matched_features` und erzeugt deshalb
**keinen** neuen Fingerabdruck und **keine** Neuberechnung. **Gemessen 2026-07-31, 00:45 UTC:** von
den **20** Wissensobjekten der aktuellen Pilot-Trefferliste haben sich seit dem 07:56-Lauf **0**
geändert (weder `ko_version` noch `updated_at`); Ähnlichkeitsschwelle Rang 20 = **0,2329**; seit dem
letzten Pilot-Lauf sind **97** neue Wissensobjekte entstanden (davon **23** verstanden) und **101**
geändert worden — **keines** erreicht seine Top-20. Der nächste reguläre Pilotlauf bliebe damit
**erneut idempotent** (dasselbe Muster wie in Sprint 23B-1: identischer Fingerabdruck trotz 179
neuer Wissensobjekte). **Konsequenz, ehrlich benannt:** die **2** falschen Ausschussbelege des
Piloten — darunter die **Rang-1**-Karte „Betrifft deinen Ausschuss Arbeit und Soziales und deine
Partei Die Linke." auf einem Vorgang der Ebene `land` — **bleiben sichtbar**, bis unabhängig vom Fix
eine Eingabeänderung eintritt (neues KO über der Schwelle · Aktualisierung eines der 20 Objekte ·
Profiländerung · Versionsanhebung). Ein Zeitpunkt ist **nicht vorhersagbar**. Insgesamt stehen
weiterhin **5** falsche Alt-Zeilen (2 Pilot, 3 zweiter Mandant, alle vor dem Deployment gerechnet).
**B25-2 ist kein Fehler des Fixes**, sondern die Kehrseite der Idempotenz aus Sprint 23B-1 in
Kombination mit einem Fix, der nur die Ergebnisseite betrifft. **Optionen für die
Betreiberentscheidung, keine davon ausgeführt oder vorbereitet:** (a) weiter abwarten, 25B bleibt
offen · (b) Rezeptversion anheben — erzwingt Neuberechnung **aller** Mandanten mit breiter sichtbarer
Wirkung · (c) gezielter Neulauf des Piloten (manueller Lauf, im Sprintauftrag ausdrücklich verboten)
· (d) Backfill der betroffenen Zeilen (Production-Schreibzugriff). **Sicherheitsgrenzen
eingehalten:** ausschließlich lesende Zugriffe (HTTPS-`GET` gegen PostgREST und die
Vercel-Deployment-API), **0 KI-Aufrufe, 0,00 USD**, kein manueller Lauf, kein neuer Cron/Trigger,
keine Migration, kein Backfill, keine Datenkorrektur, keine Env-/Flag-/Budgetänderung,
Berlin/Brandenburg/M8 unverändert AUS, keine Production-Rohdaten im Repository (Mandanten in allen
Ausgaben pseudonymisiert). **Statusgrenzen:** Zeile 25 bleibt ⏳ (25A erfüllt, 25B offen); Punkt 27A
bleibt erfolgreich abgeschlossen, Punkt 27 gesamt ⏳, 27B durch Punkt 15 blockiert; OP-25 unverändert;
M8 AUS. **Nächster Schritt:** Betreiberentscheidung zu B25-2; danach Folgeauftrag 25B aus
[`roadmap/punkt-25-e2e-nachweis.md`](roadmap/punkt-25-e2e-nachweis.md) §6. ~~**PR #187 (Punkt 29A)
wartet vereinbarungsgemäß auf den 25B-Abschluss und ist danach zu rebasen.**~~ **Überholt am
2026-07-31:** die Sperre ist aufgehoben (Begründung im 29A-Block oben), PR #187 ist auf `1e34761`
rebasiert. Geänderte Dateien:
`docs/roadmap/punkt-25-e2e-nachweis.md` (§6 neu gefasst, B25-2 kanonisch), `docs/roadmap/phase_1_checkliste.md`
(Zeile 25 ergänzt), `docs/CURRENT_STATE.md`. Branch `claude/phase-1-punkt-25-e2e-bcsru5` (frisch von
`75d7286`), PR folgt.) · (**Sprint Phase-1-Punkt 25 — Ende-zu-Ende-Nachweis für den
Pilotmandanten (Bund), geschnitten in 25A (deterministischer Repository-E2E-Vertrag) und 25B
(regulärer Production-Nachweis nach PR #185). TEILWEISE ABGESCHLOSSEN — 25A vollständig erfüllt,
25B wartet auf den ersten regulären Lauf nach dem Deployment.** **Wichtige Statuskorrektur zum
Block darunter: PR #184 (11:54:27 UTC) und PR #185 (13:21:45 UTC) sind am 2026-07-30 GEMERGT;
`main` = `cf290ab`.** **25A:** neuer Vertrag `scripts/pilot-e2e-vertrag-test.js` (**96/96**,
identisch mit und ohne Production-Secrets, deterministisch über 3 Läufe) führt ein synthetisches,
klar markiertes Bundesdokument durch die **echten Produktionsfunktionen** DIP-Normalisierung →
Crawl-Item → DSGVO-minimiertes Rohdokument (Regel-0-Identität) → `runUnderstandingShadow` →
aktiver Matching-Pfad (echtes `matching-audit`, Audit AN wie Production, **M8 AUS**) →
persistierte Begründung/Signale → sichtbare Erklärung → Entscheidung → Lage-Auswahl. Alle 10
Pflichtfälle des Sprintauftrags abgedeckt: echter Ausschussbezug (Bund) · thematische Nähe ohne
Ausschuss · Landes- und Kommunalvorgang mit ähnlich benanntem Ausschuss (Stamm
`arbeit-und-soziales` — Regression zu Befund 27A-2: **kein** Ausschussbeleg, Thema bleibt,
kontrafaktisch bewiesen, dass der entfallene Beleg (34) die Stufe kippen würde) · Irrelevanz →
„Ignorieren" · fehlende/unbekannte Ebene und unvollständige Institutionsangabe fail-closed ·
doppelte Verarbeitung idempotent (Understanding `duplicate:7`, Matching-Fingerabdruck, genau 1
aktuelle Zeile je Vorgang) · Zweitmandant getrennt · unberechtigter Zugriff abgelehnt (ohne
Mandant, Cross-Tenant-Write, fremde Profilkennung `CROSS_TENANT_WRITE`) · Störfall ohne
falsches Grün (KI-Fehler → `failed`, Publish-Abbruch → alte Generation bleibt).
**Mutationsprobe `scripts/pilot-e2e-mutationsprobe.js`: 10/10 rot** — alle 6 Pflichtmutationen
(Zuständigkeit umgangen · Mandantenfilter entfernt · Irrelevanz zugelassen · Stufe falsch ·
Begründung verliert Pflichtbeleg · Doppelverarbeitung sichtbar) plus 4 unabhängige Zweitwege,
jede gegen Produktionsdateien; das gemeinsame Probe-Gerüst wurde rückwärtskompatibel um
`zusatzdateien` erweitert (Berlin 10/10 rot und Brandenburg 17/17 rot nachgemessen, unverändert).
**Nutzerpfad belegt** (Route `/api/app/start` → `briefing.lageBriefing` bzw. `/api/lage/briefing`;
Persistenz `matching_results`/`knowledge_objects`/`ko_document_links`/`matching_runs`/`decisions`;
Filter, Sortierung, Frische-/Störungssignale, Mobile via Browser-Smoke 32/32). **Neue benannte
Beobachtung B25-1:** die Lage sortiert nach Merkmalsähnlichkeit, nicht nach Entscheidungsstufe —
ein merkmalsarmer Landes-Kurztext mit gleichem Ausschuss-Stamm kann vor dem dringlichen
Bundesfall stehen; Belege und Dringlichkeit bleiben korrekt, der Vertrag pinnt das ehrlich
(E4/E4b/I11); eine Sortierungsänderung wäre ein eigener freigabepflichtiger Sprint (verwandt mit
M-8). **25B, bereits vorweggenommen (rein lesend):** Wiederholung der PR-184-Messung nach dem
Merge — **qualifizierte falsche Ausschussbelege NACHHER = 0** (VORHER 14), 16 entfallen
(14 `land` + 2 `kommune`), 0 neu, **10 836/10 836** Paare sonst byte-identisch, Score-Delta
ausschließlich 34, `decisions`-Abgleich 10/10 exakt; die **5** aktuellen Zeilen mit falschem Beleg
stammen sämtlich aus Läufen **vor** dem Merge (07:56:55 bzw. 16:04 UTC). **25B noch offen:**
Deployment-`READY`-Beleg (Vercel-Zugriff fehlt in dieser Sitzung — dieselbe Grenze wie PR #184;
Ersatzweg: Lauftelemetrie des ersten Laufs nach dem Merge) und mindestens eine
`matching_results`-Zeile aus einem **regulären, vollständig abgeschlossenen** Lauf des aktiven
Pilotmandanten nach dem Deployment — nächste reguläre Termine laut aktiver `vercel.json`:
`pipeline` 16:00 UTC, `crawl` 20:00/04:00 UTC. **Kein manueller Lauf, kein neuer Cron/Trigger,
keine automatische Überwachung behauptet.** **Tests (real ermittelt):** neuer Vertrag **96/96** ·
neue Probe **10/10 rot** · Ausschuss-Zuständigkeit 86/86 · Erklärung 64/64 + Abdeckung 60/60 ·
Entscheidungen 38/38 · Audit 178/178 · M8-Gate 40/40 · Radar-Ausschussbeleg 30/30 ·
Drei-Profile-E2E 94/94 · Mandantentrennung 14/14 + Tenant-Guard 37/37 + Cross-Tenant 43/43 ·
Lage 138/138 + 6/6 + 9/9 · Berlin 76/76 + 10/10 rot · Brandenburg 98/98 + 17/17 rot ·
Befund-27A2-Probe 9/9 rot · Offline-Suite **ohne** Secrets (maßgeblich, bildet CI nach)
**184/188** gegen Basislinie `origin/main` `cf290ab` **183/187** mit **byte-identischer**
Fehlschlagliste (privacy-vollstaendigkeit, profile-db, provision-tenant, tenant-neutrality —
umgebungsbedingt, im CI grün); mit Secrets 174/188 (dieselben 14 bekannten, nicht aussagekräftig) ·
Browser-/Mobile-Smoke **32/32**. **Sicherheitsgrenzen eingehalten:** ausschließlich lesende
Production-Zugriffe (HTTPS-`GET` der schreibgeschützten Messdatei), 0 KI-Aufrufe, 0,00 USD, keine
Migration, kein Backfill, keine Datenkorrektur, kein manueller Lauf, keine Env-/Flag-/Cron-/
Budgetänderung, Berlin/Brandenburg/M8 unverändert AUS, keine neuen Mandate, keine
Production-Rohdaten im Repository (Fixtures künstlich, `.example`-Domänen). **Statusgrenzen:**
Checkliste Zeile 25 jetzt ⏳ (25A erfüllt, 25B offen — ✅ erst nach 25B); Punkt 27A bleibt
erfolgreich abgeschlossen, Punkt 27 gesamt bleibt ⏳, 27B bleibt durch Punkt 15 blockiert;
OP-25 (Cron-Fairness) getrennt und unverändert; M8 AUS. **Nächster Schritt:** Merge-Entscheidung
über den 25A-PR (nur Tests + Doku, keine Produktionswirkung), danach Folgeauftrag 25B nach
[`roadmap/punkt-25-e2e-nachweis.md`](roadmap/punkt-25-e2e-nachweis.md) §6 (rein lesend, nach dem
ersten regulären Lauf des Pilotmandanten). Geänderte Dateien: `scripts/pilot-e2e-vertrag-test.js`
(neu), `scripts/pilot-e2e-mutationsprobe.js` (neu), `scripts/e2e-mutationsprobe-geruest.js`
(additiv `zusatzdateien`), `docs/roadmap/punkt-25-e2e-nachweis.md` (neu, kanonisch),
`docs/roadmap/phase_1_checkliste.md` (Zeile 25 ⏳), `docs/CURRENT_STATE.md`. Branch
`claude/phase-1-punkt-25-e2e-bcsru5`, **PR #186 (offen, nicht gemergt)**. Kanonisch:
[`roadmap/punkt-25-e2e-nachweis.md`](roadmap/punkt-25-e2e-nachweis.md).) ·
(**Sprint Fix Befund 27A-2: symmetrische Ausschuss-Zuständigkeit
— inklusive Nachtrag „fehlende Ebene fail-closed". TEILWEISE ABGESCHLOSSEN — der Fix ist gebaut,
offline und an echten Production-Eingaben belegt, die im ersten Durchgang benannte Abweichung ist
im Nachtrag GESCHLOSSEN; was fehlt, ist Betreiberentscheidung, Merge und der Production-Nachweis
nach dem ersten regulären Lauf.** **URSACHE (belegt):** die 27A-1-Regel war einseitig — `ausschussBelegZulaessig` gab für ein
BUNDESprofil sofort `true` zurück (`pz.ebene !== "land"` → „unbestimmt → unverändert"), während
`normalizeCommittee` Gremiennamen verschiedener Institutionen auf denselben Stamm faltet
(„Gesundheit" ↔ „Gesundheitsausschuss (Landtag)" → `gesundheit`). **FIX (umgesetzte Variante 3,
§50.5/§51.9):** die Prüfung ist jetzt **symmetrisch** — ein Bundesmandat erhält bei einem
Wissensobjekt der Ebene `land`/`kommune` **keinen** Ausschussbeleg mehr; die Landesseite bleibt
byte-identisch. `decision_level` ist auf beiden Seiten das führende Feld, die Geografie präzisiert
nur das Bundesland. Zwei Zeilen in `lib/helmut/matching.js`, `matched_features` bleibt der einzige
Eingriffspunkt. **WIRKUNG, an echten Production-Daten rein lesend gemessen (dieselbe Messung wie
PR #184, jetzt mit Vorher/Nachher in EINEM Lauf):** über 6 aktive Bundestagsprofile × 1 806
Wissensobjekte = **10 836 Paare** fallen die **14** bekannten qualifizierten falschen Belege auf
**0**; insgesamt entfallen **16** Belege (**14** Ebene `land` + **2** Ebene `kommune` —
Kreistagsausschüsse, die §51.3 nicht mitgezählt hatte, weil dort „kommunal 0" steht und die
Ebenensumme 1 776 statt 1 806 ergibt: **Korrektur**, es gibt **30** `kommune`-Objekte); **0** neue
Belege; in **10 836 von 10 836** Paaren ist außer dem Ausschussbeleg **alles byte-identisch**;
Score-Delta **ausschließlich 34**; **13 von 14** wechseln die Entscheidungsstufe; **7** der 16
bleiben ohne jeden Beleg. **Gegenprobe gegen den echten Bestand:** für **10** der 14 Paare
existiert eine `decisions`-Zeile, in **allen 10** stimmt der gespeicherte Score **exakt** mit der
lokalen Vorher-Rechnung überein — **9** wechseln die Stufe, **7** stehen heute auf „Sofort
reagieren", **6** davon nicht mehr. **Ähnlichkeit, Kandidatenrang und Top-N-Schnitt unverändert**
(sie entstehen vor `matched_features`; offline mit identischen Ranglisten gegengeprüft), ebenso
`normalizeCommittee`/`slugCommittee`, Merkmalsvektoren, `profileHash`, Eingabefingerabdruck und
Rezeptversion — **deshalb keine Migration, kein Backfill, keine neue Rezeptversion.**
**BEWEIS STATT BEHAUPTUNG:** die **regelfreie** Bundestagsprojektion ist byte-identisch zum Stand
`d9006c1` (`48d761b7…bee387`) — außerhalb der Regel hat sich nichts bewegt; der neue Stand ist als
zweiter Hash verankert (`3d4e2222…412e20`); auf `d9006c1` liefert der Druckmodus für beide Zeilen
`48d761b7…`. Der Unterschied ist als **vollständige Liste** verankert (5 Wegfälle im Golden-Satz,
0 neue Belege). **NACHTRAG 2026-07-30 — die benannte Abweichung ist GESCHLOSSEN (§52.6):** für ein
belegtes Bundestagsprofil entsteht eine Ausschussmitgliedschaft jetzt **nur** bei **positiv als
`bund` belegter** Vorgangsebene; **fehlende, leere und `unknown`** Ebenen sind fail-closed, ebenso
belegte, aber unlesbare Angaben. Damit ist die Vorgangsseite auf beiden Ebenen gleich streng.
**Der Grund für den ersten, laxen Stand lag in Fixtures, nicht in der Regel:** vier Zusicherungen
von `radar-committee-evidence-test.js` (1/1b/6c/8) trugen **gar keine** `decision_level`-Angabe,
sollten aber echte **Bundes**vorgänge darstellen — ein realer Bundesvorgang trägt seit Sprint 2/19
immer eine Ebene. Die Fixtures sind deshalb **fachlich korrigiert** (Bundesfälle `bund`,
kommunale Fälle `kommune`, Landesfälle `land` samt belegter Landesgeografie), **keine
Evidenzprüfung wurde abgeschwächt** — alle 25 bisherigen Assertionen bleiben gültig und grün, zwei
davon sind **strenger** geworden (5b beweist den Landestreffer jetzt über eine positiv belegte
Zuständigkeit statt über den inerten Pfad; 5c wird zusätzlich von der Regel abgelehnt). `ebene` ist
im Testgerüst **Pflichtfeld**. **Neu und eigenständig: Fall 14** (5 Assertionen) — derselbe
perfekte Positivfall wie 1/8 erhält bei Ebene `null`/`""`/`unknown` **keinen** Beleg, 14d ist die
Gegenprobe mit `bund`, 14e zeigt, dass die Entscheidung schon in `matchedFeatures` fällt.
**Production-Wirkung der Verschärfung: 0 zusätzliche Wegfälle** — erneut rein lesend gemessen:
die 16 entfallenen Belege verteilen sich weiterhin ausschließlich auf `land` (14) und `kommune`
(2); kein Objekt ohne belegte Ebene trägt überhaupt eine Ausschussangabe. **Es geht kein echter
Beleg verloren.** Mutation **N9** ist umgedreht: sie baut die Lücke wieder ein und wird erkannt.
**Zwei Vertragssuiten brauchten dieselbe Fixture-Korrektur**, die zweite
(`drei-profile-e2e-test.js`, drei Bundes-KOs ohne Ebene) fiel **erst im CI** auf — und damit eine
**methodische Lücke, die hier benannt wird:** der Vergleich „Fehlschlagliste byte-identisch zur
Basislinie" ist blind für Regressionen *innerhalb* von Suiten, die lokal ohnehin umgebungsbedingt
fehlschlagen. Maßgeblich ist deshalb ab jetzt der lokale Lauf **ohne** Production-Secrets
(`env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY`), weil er die CI-Umgebung nachbildet.
**NEBENBEFUND GETRENNT UND GESTOPPT (§52.7):** die **9** EU- und **2** internationalen Paare mit
Ausschussbeleg bleiben unverändert. Gemessen an den echten Gremiennamen nennen sie **teils echte
Bundestagsausschüsse** („Ausschuss für Arbeit und Soziales", „Auswärtiger Ausschuss"), **teils
fremde Gremien** („Europäischer Ausschuss für soziale Rechte") — die Ebene allein trennt das nicht,
eine Verschärfung braucht eine neue fachliche Entscheidung und würde richtige Belege entfernen.
**PRODUCTION-WIRKUNG DES MERGES, ehrlich:** ein Merge ändert **keine** bestehenden Daten. Die **5**
heute sichtbaren `matching_results`-Zeilen mit falschem Beleg und die **10** daraus entstandenen
`decisions` **bleiben zunächst stehen**; ersetzt werden sie durch den **normalen Betrieb** (nächster
regulärer Matchinglauf des Mandanten, Cron `pipeline` 16:00 UTC bzw. `crawl` 20:00/04:00 UTC).
**Bis dahin kann der Bundestagspilot weiterhin falsche sichtbare Ergebnisse enthalten** — inklusive
„Betrifft deinen Ausschuss Arbeit und Soziales …" auf Rang 1. Manueller Lauf, Backfill und
Datenbereinigung sind **möglich, aber ausdrücklich NICHT Bestandteil dieses Sprints** und
freigabepflichtig. **Tests (real ermittelt):** `matching-ausschuss-zustaendigkeit-test` **86/86**
(von 54) · neue `scripts/befund-27a2-mutationsprobe.js` **9/9 Mutationen rot** (N1 = Rückkehr zur
Bundes-Sonderbehandlung → 21 Assertionen rot; N9 = fehlende Ebene wieder zugelassen → 7 rot) · Schreibschutzsuite **54/54** (von 48; F1–F5 vom
Befundzeugen zum Fixzeugen umgedreht) · `matching-erklaerung-test` **64/64** ·
`radar-committee-evidence-test` **30/30** (Ebenen jetzt ausdrücklich, neuer Fall 14) · Brandenburg-Vertrag **98/98** und
Mutationsprobe **17/17 rot** (neu M17) · Berlin-Vertrag **76/76** und Mutationsprobe **10/10 rot** ·
`drei-profile-e2e-test` **94/94** (Fixtures korrigiert, Assertionen unverändert) ·
Offline-Suite **ohne Production-Secrets** (bildet CI nach, maßgeblich) **183/187** gegen
Basislinie `origin/main` **183/187** mit **identischer** Fehlschlagliste (4 Suiten brauchen hier
Netz/DB, im CI grün); der Lauf **mit** Secrets ergibt 173/187 = Basislinie, ist für Regressionen
aber **nicht** aussagekräftig · Browser-/Mobile-Smoke
**32/32** · **CI-Gate grün (maßgeblich laut `CLAUDE.md` §6): Offline-Suite 187/187 und
Browser-/Mobile-Smoke 32/32**, Lauf `30545738005` auf Commit `b4d4059`. **Ehrlich benannt:** der
erste Anlauf des Nachtrags (Lauf `30545272316`, Commit `6520e09`) war **rot** — 186/187,
`drei-profile-e2e-test.js`; genau daraus entstanden die zweite Fixture-Korrektur und die
Methodenkorrektur oben. **Beobachtung ohne Erklärung, nicht kaschiert:** ein einzelner Referenzlauf der
**Berliner** Mutationsprobe war rot (1 Assertion), fünf folgende Läufe grün (je 10/10); Verdacht ist
die `Date.now()`-Sperr-TTL im gemeinsamen `e2e-vertrag-geruest.js` unter Last, belegt ist das nicht.
**Sicherheitsgrenzen eingehalten:** ausschließlich lesende Production-Zugriffe (HTTPS-`GET`, keine
RPC), **0 KI-Aufrufe, 0,00 USD**, keine Migration, kein Backfill, keine Datenkorrektur, kein
manueller Lauf, kein Crawl, keine Env-/Flag-/Cron-/Budgetänderung, Berlin, Brandenburg und **M8
unverändert AUS**, keine neuen Mandate, keine Production-Rohdaten im Repository. **Statusgrenzen:**
Punkt 27A bleibt erfolgreich abgeschlossen (der Fix verletzt keines seiner Abnahmekriterien; die
Zusage aus §50.4 gilt jetzt als „regelfrei byte-identisch" plus verankertem neuen Stand), Punkt 27
gesamt bleibt ⏳, 27B bleibt durch Punkt 15 blockiert, OP-25 und OP-27 unverändert. **Rückweg:**
`git revert` + Redeploy — es gibt keinen Datenstand, der zurückzudrehen wäre. **Nächster Schritt:**
Betreiberentscheidung über den Merge (er verändert sichtbare Bundestagsergebnisse) und danach die
Messung als Abnahme wiederholen (`node scripts/befund-27a2-production-messung.js` → erwartet
„QUALIFIZIERTE Faelle NACHHER: 0" **und** eine `matching_results`-Zeile aus einem Lauf **nach** dem
Deployment). Geänderte Dateien: `lib/helmut/matching.js`,
`scripts/matching-ausschuss-zustaendigkeit-test.js`, `scripts/befund-27a2-mutationsprobe.js` (neu),
`scripts/befund-27a2-production-messung.js`, `scripts/befund-27a2-schreibschutz-test.js`,
`scripts/brandenburg-e2e-mutationsprobe.js`, `docs/matching-nachvollziehbarkeit.md` (§52 neu),
`docs/roadmap/phase_1_checkliste.md`, `docs/CURRENT_STATE.md`. Branch
`claude/fix-befund-27a-2-k8lazs`, **PR #185 (offen, nicht gemergt)**. Kanonisch:
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §52.) ·
(**Sprint Production-Messung Befund 27A-2: erhalten
Bundestagsprofile falsche Ausschussbelege aus Landesvorgängen? TEILWEISE ABGESCHLOSSEN — die
Messung ist vollständig und eindeutig, aber zwei Abnahmestücke fehlen (siehe unten): der
persistierte Nachweis NACH dem Deployment und die Startzusage „Deployment READY".**
**Ergebnis: Befund 27A-2 ist BESTÄTIGT.** An echten Production-Daten erhalten **4 von 6**
aktiven Bundestagsprofilen einen Ausschussbeleg aus einem Landesvorgang: **14 qualifizierte
Profil-Objekt-Paare** über **9 Wissensobjekte** und **3 geteilte normalisierte
Ausschusstoken** (`gesundheit`, `arbeit-und-soziales`, `finanzen`). **Einordnung: Kategorie 2
„bestätigt, aber latent"** — strikt nach der Beweisregel des Sprints, und damit
**konservativer als die Datenlage**: seit dem Merge von PR #183 (11:01:58 UTC) gab es
**keinen** regulären Matchinglauf (letzter 07:56:55 UTC), der Nachweis nach dem Deployment ist
deshalb **nicht verfügbar** — nicht negativ. Der Fehler ist aber **bereits in aktiven
Production-Daten materialisiert**: **5** `matching_results`-Zeilen mit `aktuell=true` tragen
heute eine falsche Ausschussbehauptung samt gespeicherter Begründung (z. B. „Betrifft deinen
Ausschuss Arbeit und Soziales und deine Partei Die Linke." auf **Rang 1**), und **10**
`decisions`-Zeilen stammen aus genau diesen Paaren. **Dass das Deployment daran nichts
geändert haben kann, ist gemessen, nicht angenommen:** über 6 aktive Bundestagsprofile ×
1 806 Wissensobjekte = **10 836 Paare** sind die `matched_features` auf `d9006c1` (vor dem
27A-1-Fix) und auf `94f73e4` (`main`) **byte-identisch — 10 836 gleich, 0 abweichend**; das
bestätigt unabhängig die Zusage aus §50.4. **URSACHE (gemessen):** `normalizeCommittee` faltet
„Gesundheit" (Bundestag) und „Gesundheitsausschuss (Landtag)" auf denselben Stamm
`gesundheit`, ebenso „Arbeit und Soziales" und „Sozialausschuss Kreistag Ostallgäu" auf
`arbeit-und-soziales`; der 27A-1-Riegel `ausschussBelegZulaessig` gibt für ein Bundesprofil
sofort `true` zurück (`pz.ebene !== "land"` → „unbestimmt → unverändert"). **WIRKUNG (lokale
schreibfreie Gegenprobe mit echten Production-Eingaben, nur der Beleg entfällt):** Score
**−34 in allen 14 Fällen** (Ausschussgewicht in `decisions.js`), **13 von 14** wechseln die
Entscheidungsstufe, in **5 von 14** ist der fremde Ausschuss der **einzige** Beleg (dort
entfällt die sichtbare Erklärung ganz und M8 würde die Zeile entfernen). **Ähnlichkeit, Rang
und Top-N-Schnitt bleiben unberührt** — der Rang entsteht aus der Vektorsuche,
`matched_features` werden danach berechnet. **Gegenprobe gegen echte Production-Wirkung:** für
**10** der 14 Paare existiert eine `decisions`-Zeile; in **allen 10** stimmt der gespeicherte
Score **exakt** mit der lokalen Rechnung überein — **9** davon hätten ohne den falschen Beleg
eine andere Stufe, darunter **6** heutige „Sofort reagieren". **NICHT PRÜFBAR in dieser
Sitzung (ehrlich benannt):** die Startzusage „Production-Deployment READY". Vercel-Werkzeuge
fehlen, `helmut-pilot.vercel.app` ist durch die Egress-Policy gesperrt (Proxy `403` auf
`CONNECT`), das GitHub-Token hat weder `deployments`- noch `statuses`-Leserecht (je `403`).
Belegt ist nur: PR #183 gemergt, `94f73e4` = `origin/main` = Branchbasis; jüngste
Lauftelemetrie (`process_runs.commit_ref`, 07:55 UTC) zeigt noch `5d475e6`. **Kein Hinweis auf
ein fehlgeschlagenes Deployment — aber auch kein Nachweis für `READY`.** Für die Messung
folgenlos (0 von 10 836 Abweichungen). **Startprüfung sonst bestanden:** Arbeitsbaum sauber,
Branch `claude/befund-27a-2-messung-43ka47` vom aktuellen `main` `94f73e4`, PR #183
vollständig in `main`, keine neuere überschneidende Matchingarbeit (offene PRs #117/#132/#148/
#159 betreffen Quellenpakete, Landesmodul-Aktivierung und Doku), Punkt 27A laut Hauptstand
erfolgreich abgeschlossen, Punkt 27 gesamt weiterhin ⏳, Befund 27A-2 offen, OP-25 und OP-27
unverändert. **KEIN FIX — bewusst:** keine Änderung an Merkmalsvektoren, keine neue
Rezeptversion, keine Migration, kein Backfill, keine Flagänderung, keine Aktivierung (Berlin,
Brandenburg, M8 unverändert AUS), keine Cron-/Budget-/Quellen-/Env-Änderung, **0 KI-Aufrufe,
0,00 USD**, ausschließlich lesende Production-Zugriffe (nur HTTPS-`GET`, keine RPC, keine
Datenbankfunktion). **Neu im Repository:** `scripts/befund-27a2-production-messung.js`
(rein lesend, technischer Schreibschutz: genau eine HTTP-Funktion mit `GET`-Literal,
eingefrorene Tabellen-Allowlist ohne `/rest/v1/rpc/`, kein `storage.js` im Prozess, Secrets
nur aus `process.env`, Mandanten und Laufkennungen nur pseudonymisiert) und
`scripts/befund-27a2-schreibschutz-test.js`, der das offline beweist. **Tests (real
ermittelt):** Schreibschutzsuite **48/48** · `matching-ausschuss-zustaendigkeit-test`
**54/54** · `matching-erklaerung-test` **64/64** · Brandenburg-Vertrag **98/98** und
Mutationsprobe **16/16 rot** · Berlin-Vertrag **76/76** und Mutationsprobe **10/10 rot** ·
Offline-Suite lokal **173/187** gegen Basislinie `main` `94f73e4` **172/186** — die **+1** ist
die neue Suite, die Fehlschlagliste ist **byte-identisch** (14 umgebungsbedingte Fehlschläge,
kein Regress) · Browser-/Mobile-Smoke **32/32** · **CI-Gate grün (maßgeblich laut `CLAUDE.md`
§6): Offline-Suite 187/187 und Browser-/Mobile-Smoke 32/32**, Lauf `30539215650` auf Commit
`3767b12`. **Statusgrenzen eingehalten:** Punkt 27A
bleibt erfolgreich abgeschlossen (die Messung widerlegt keines seiner Abnahmekriterien,
sondern bestätigt §50.4), Punkt 27 gesamt bleibt ⏳, 27B bleibt durch Punkt 15 blockiert,
OP-25 und OP-27 unverändert, M8 bleibt AUS. **Rückweg:** `git revert` — es gibt keinen
Datenstand, der zurückzudrehen wäre. **Nächster Schritt:** Betreiberentscheidung über die
Fixvariante (§50.5 Variante 3, jetzt beziffert in §51.9) und ein **getrennter Fix-Sprint**;
danach dieselbe Messung als Abnahme wiederholen (`scripts/befund-27a2-production-messung.js`).
Geänderte Dateien: `scripts/befund-27a2-production-messung.js` (neu),
`scripts/befund-27a2-schreibschutz-test.js` (neu), `docs/matching-nachvollziehbarkeit.md`
(§51 neu, §50.5 Nachtrag), `docs/CURRENT_STATE.md`. Branch
`claude/befund-27a-2-messung-43ka47`, PR #184 (offen, nicht gemergt). Kanonisch:
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §51.) ·
(**Sprint Matchingfix Befund 27A-1: Ausschussbeleg nur bei
passendem Zuständigkeitsraum. ERFOLGREICH ABGESCHLOSSEN — damit ist auch Punkt 27A erfolgreich
abgeschlossen; Checklisten-Punkt 27 gesamt bleibt ⏳, weil 27B weiterhin durch Punkt 15 blockiert
ist.** **Verbindliche Abgrenzung:** dieser Sprint betrifft **Zeile 27** der
[`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md) — **nicht** OP-27 der Restliste
(M8-Aktivierung) und **nicht** OP-25; beide bleiben unangetastet, `HELMUT_MATCHING_RELEVANZ_GATE`
unverändert AUS. **Startprüfung bestanden:** Arbeitsbaum sauber, HEAD = `origin/main` = `d9006c1`
(Merge PR #182, vollständig in `main` inklusive `edf2258`/`ceaca8c`), Branch
`claude/matching-befund-27a-9gycsj` vom aktuellen `main`; keine neuere überschneidende
Matchingarbeit (offene PRs #117/#132 betreffen Quellenpakete bzw. das ersetzte
`HELMUT_LANDESMODULE`-Gate); Punkt 27A laut Hauptstand teilweise abgeschlossen; OP-25 und OP-27
getrennt und unverändert. **URSACHE (gemessen, nicht vermutet):** `normalizeCommittee` baut
Ausschussnamen auf einen Synonymstamm ab; der Brandenburger „Ausschuss für Inneres und Kommunales"
UND der Berliner „Ausschuss für Inneres, Sicherheit und Ordnung" enthalten beide den Schlüssel
`inneres` und fallen deshalb auf **denselben** Stamm. **`committeeMatchKey` war ausdrücklich keine
Lösung** — es korrigiert nur die Reihenfolge des Substring-Fallbacks und liefert für beide Namen
ebenfalls `inneres` (gegengeprüft). Ein Ausschussname trägt strukturell **keinen** Hinweis auf sein
Parlament. Reproduziert mit den echten Produktionsfunktionen auf `d9006c1`: ein Berliner Vorgang
erhielt beim Brandenburger Profil `matched_features` `ausschuss: „Ausschuss für Inneres und
Kommunales"`, die sichtbare Behauptung **„Betrifft deinen Ausschuss Ausschuss für Inneres und
Kommunales und deinen Schwerpunkt Inneres."** und über das Ausschussgewicht (34) **Score 62 →
„Sofort reagieren"**. **FIX (kleinste robuste Korrektur, eine Bedingung + zwei reine
Ableitungen):** aus **bereits belegten** Feldern entsteht je Seite ein **institutioneller
Zuständigkeitsraum** — Profil aus `mandate_profiles.politische_ebene` + `.bundesland`, Vorgang aus
`decision_level` (Sprint 2/19) + `affected_geographies` (Sprint 20, Kommune/Bezirk über den
kanonischen Geografie-Seed auf ihr Bundesland aufgelöst; `mentioned_geographies` zählt bewusst
nicht — erwähnt ist nicht zuständig). Regel: **eine Ausschussüberschneidung gilt nur dann als
Mitgliedschaftsbeleg, wenn das Profil einen bestimmten Landes-Zuständigkeitsraum hat und der
Vorgang positiv demselben Bundesland zugeordnet ist** (fail-closed: fremdes Land, übergeordnete
Ebene `bund`/`eu`/`international` oder fehlende Zuständigkeit → kein Beleg; mehrdeutige Angaben mit
dem eigenen Land → Beleg bleibt). Die Regel **entfernt nur** Belege, sie fügt nie einen hinzu
(getestet). **WIRKUNG ÜBER DEN GANZEN PFAD:** `matched_features` ist der einzige Eingriffspunkt,
von dort wirkt die Korrektur auf gespeicherte `signale`, gespeicherte Begründung, sichtbare
Erklärung, Belege der Lage-Karte, Entscheidungsgewicht (`decisions.js` ausschuss 34) und den
M8-Riegel (eine Zeile, deren **einziger** Beleg der fremde Ausschuss war, passiert ihn nicht mehr).
**BEWUSST UNVERÄNDERT — deshalb keine Migration, kein Backfill, keine neue Rezeptversion:**
`normalizeCommittee`/`slugCommittee` und damit Merkmalsvektor, Kosinus-Ähnlichkeit, Rangfolge,
Top-N-Schnitt, `profileHash`, `computeKnowledgeObjectInputHash` und der Eingabefingerabdruck
bleiben **byte-identisch**; der Token `ausschuss:inneres` steht weiter in beiden Vektoren — das ist
die laut Produktregel **erlaubte fachliche Ähnlichkeit** und bleibt als `thema`-Beleg („Inneres",
aus `derivePolicyFields`) sichtbar. Ebenfalls unangetastet: der harte Ausschussfilter
(`passesFilters`/`filter_committees`, in Production nicht gesetzt) und `scoring.js`
(`proximityScore` vergleicht die volle Bezeichnung, die beiden Innenausschüsse kollidieren dort
gar nicht). **BUNDESTAGSPROFILE UNVERÄNDERT — gemessen, nicht behauptet:** die **volle** Projektion
(Rang, Ähnlichkeit, `matched_features`, `signale`, Begründung, KO-Eingabehash, Profilhash,
Merkmalsvektoren, Rezept-/Vektorversion, abgeleitete Entscheidung) für drei Bundesprofile und ein
Profil ohne Mandatsebene gegen neun Vorgänge (Bund/Land/Kommune/ohne Ebene, mit und ohne
Ausschussnennung) ist vor und nach der Änderung **byte-identisch** (sha256
`48d761b7…bee387`, erhoben auf dem Stand `d9006c1` **vor** dem Fix und als Golden-Hash im
Repository verankert). **Der Merge verändert kein Production-Verhalten:** die Regel greift nur bei
Profilen mit bestimmtem Landes-Zuständigkeitsraum, und in Production existiert kein solches
aktives Profil (Berliner Abnahmeprofil deaktiviert; Berlin/Brandenburg liefern strukturell nichts,
`pardokDispatch` → `items: []`). **VERTRAG BEWEIST DEN FALL JETZT, statt ihn zu vermeiden:** der
27A-Vertrag führt einen zweiten **echten** Berliner Gold-Record (**V-351616** „Pyrotechnik an
Silvester", eigener Vorgang) durch denselben Produktionspfad; dessen Analyse nennt ausdrücklich den
**realen** Berliner Innenausschuss. Bewiesen beim Brandenburger Profil: kein Ausschussbeleg (F11),
Fachgebiet bleibt als `thema` (F12), kein Ausschusssignal und keine Ausschussbegründung in der
Persistenz (F13), sichtbare Erklärung ohne Ausschussbeleg (F14), eigener Ausschuss unbeschädigt
(F15), Rangfolge unverändert (F16), M8 nicht allein wegen des falschen Ausschusses passiert (F17),
kein Ausschussgewicht in der Entscheidung (I8/I9), sichtbare Karte ohne fremde
Mitgliedschaftsbehauptung (J7b). **OFFEN, FREIGABEPFLICHTIG — Befund 27A-2:** ein
**Bundestags**profil erhält weiterhin einen Ausschussbeleg, wenn ein **Landes**vorgang den
gleichnamigen Landesausschuss nennt (gemessen). Fachlich dieselbe Fehlerklasse, hier bewusst
**nicht** behoben, weil die Verschärfung aktive Bundestagsergebnisse verändern würde und die
Betroffenheit offline nicht bestimmbar ist. Drei Varianten samt Kosten in
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §50.5; **Empfehlung: erst rein
lesend in Production messen** (wie viele `ausschuss`-Belege aktiver Bundesprofile hängen an
Wissensobjekten mit `decision_level <> 'bund'`), dann entscheiden. Weitere benannte
Restunschärfen: Landtagsprofil ohne `bundesland` behält das alte Verhalten (in
`profile-validation.js` ohnehin `requiredMissing`; die Alternative hätte Fall 5b von
`radar-committee-evidence-test.js` gebrochen), Vorgang ohne belegte Zuständigkeit verliert für
Landesmandate den Ausschussbeleg (gewollter ehrlicher Leerzustand), die **Ähnlichkeit** trennt die
Länder weiterhin nicht (§50.6). **Tests (real ermittelt):** neue Suite
`scripts/matching-ausschuss-zustaendigkeit-test.js` **54/54** · 27A-Vertrag **98/98** (von 86/86) ·
27A-Mutationsprobe **16/16 rot** (von 14/14; neu **M15/M16** = Rücknahme der Zuständigkeitsprüfung
auf zwei unabhängige Weisen, beide machen den Vertrag rot) · Berliner Vertrag **76/76** und Berliner
Mutationsprobe **10/10 rot** **unverändert** (damit ist „echter Treffer im eigenen Parlament bleibt
erhalten" end-to-end und ohne Fixture-Anpassung belegt) · Offline-Suite lokal **172/186** gegen
Basislinie `main` `d9006c1` **171/185** — die **+1** ist die neue Suite, die **14** Fehlschläge sind
**dieselben** umgebungsbedingten (Fehlschlagliste byte-identisch verglichen, kein Regress) ·
Browser-/Mobile-Smoke **32/32** · **CI-Gate grün (maßgeblich laut `CLAUDE.md` §6): Offline-Suite 186/186 und Browser-/Mobile-Smoke 32/32**, Lauf `30534950711` auf Commit `962af06`; der Lauf `30534821817` (Commit `fdb68eb`, vollständiger Fix + Doku) war ebenfalls grün. **Keine Migration, kein Backfill, kein neuer Schalter, keine
Aktivierung (Berlin, Brandenburg, M8 unverändert aus), keine Cron-/Budget-/Quellen-/Env-Änderung,
0 KI-Aufrufe, 0,00 USD, kein Production-Zugriff, keine realen Testmandate.** **Rückweg:**
`git revert` der Commits, Redeploy — es gibt keinen Datenstand, der zurückzudrehen wäre.
**Nächster Schritt:** Betreiberentscheidung zu **Befund 27A-2** (Empfehlung: lesende
Production-Messung); 27B bleibt durch Punkt 15 blockiert. Geänderte Dateien:
`lib/helmut/matching.js`, `scripts/matching-ausschuss-zustaendigkeit-test.js` (neu),
`scripts/brandenburg-e2e-vertrag-test.js`, `scripts/brandenburg-e2e-mutationsprobe.js`,
`docs/matching-nachvollziehbarkeit.md` (§50), `docs/roadmap/phase_1_checkliste.md`,
`docs/CURRENT_STATE.md`. Branch `claude/matching-befund-27a-9gycsj`, PR #183. Kanonisch:
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §50 + Checklisten-Zeile 27.) ·
(**Sprint Punkt 27A: Brandenburger Ende-zu-Ende-Repository-Vertrag.
27A TEILWEISE ABGESCHLOSSEN — dieser Status ist durch den Folgesprint oben ÜBERHOLT: Befund 27A-1
ist behoben, 27A ist erfolgreich abgeschlossen. Der folgende Block bleibt als Sprintprotokoll
unverändert stehen. — Korrektur vom 2026-07-30 (Betreiberentscheidung): der Vertrag selbst
steht (86/86, Mutationsprobe 14/14 rot), aber der dabei dokumentierte Befund **27A-1** ist ein
REALER FEHLER im aktiven Matching (Ausschussnormalisierungs-Kollision, Details unten) — die
vollständige fachliche Trennung der Landesmandate auf Ausschussebene ist damit noch nicht
abgenommen. Der Matchingfix wird in einem getrennten Folgesprint umgesetzt; erst danach (plus
Regressionserwartung im Vertrag) kann 27A als erfolgreich abgeschlossen gelten. Checklisten-Punkt
27 gesamt bleibt ⏳; 27B (regulärer Production-Nachweis) bleibt offen und durch Punkt 15 blockiert.** **Verbindliche Definition:** „Punkt 27"
ist Zeile 27 der [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md) (E2E-Test
Brandenburger Profil) — **nicht** OP-27 der Restliste (Production-Aktivierung des M8-Relevanzriegels;
Status dort unverändert, `HELMUT_MATCHING_RELEVANZ_GATE` bleibt AUS, der Riegel wurde weder aktiviert
noch analysiert noch erweitert). **Startprüfung bestanden:** Arbeitsbaum sauber, HEAD = `origin/main`
= `5d475e6` (erwarteter Mindeststand, geprüft), PR #180 (`fc3c4cc`) und #181 (`5d475e6`) vollständig
in `main`; keine neue Arbeit zu Punkt 27/Brandenburg; `docs/roadmap/analyse-punkte-24-30.md` existiert
weiterhin nicht (dokumentierter Widerspruch, kein Blocker). **PR #132 gezielt geprüft, nicht
verwendet:** sein Gate `HELMUT_LANDESMODUL_FREIGABE` ist auf `main` vollständig durch
`HELMUT_LANDESMODULE` (14A) ersetzt (0 Treffer in aktivem Code); die für Punkt 27 relevante
Erkenntnis B-5 (ohne Brandenburger Landtagsprofil bleibt jede Aktivierung ein No-Op) ist
Punkt-15-/27B-Vorbedingung und bleibt in der PR-Tabelle dokumentiert; PR weder gemergt noch
geschlossen (getrennte Betreiberentscheidung). **Umsetzung:** neue Suite
`scripts/brandenburg-e2e-vertrag-test.js` (**86/86**) + `scripts/brandenburg-e2e-mutationsprobe.js`
(**14/14 Mutationen rot**, davon 4 Brandenburg-spezifisch: BB-Typtabelle vergisst die Kleine Anfrage ·
`vorgangsKennung` liefert keinen Bezug mehr · delete-Stubs werden wieder Inhalt · unbelegte
Fremdtreffer bleiben in der Entscheidungsliste). **Wiederverwendung aus 26A bewusst NUR als
technisches Testgerüst:** `scripts/e2e-vertrag-geruest.js` (Zählwerk, Fixture-Understanding,
In-Memory-Store mit PostgREST-Vertragsgrenzen, Audit-Doppel auf echtem `matching-audit`, atomare
Publish-Semantik) + `scripts/e2e-mutationsprobe-geruest.js` (Abzug/Ausführung/Auswertung); Berlin und
Brandenburg behalten getrennte Profile, Gold-Records, Analyse-Fixtures und Assertions; **kein
Produktionscode geändert, kein generisches Länder-Framework**; der Berliner Vertrag ist nach der
Umstellung unverändert gültig (**76/76**, Mutationsprobe **10/10 rot**, Einstieg
`scripts/berlin-e2e-vertrag-test.js` unverändert). Der Vertrag führt echte Gold-Records (BB
**V-369657** Kleine Anfrage „Straf- und Gewalttaten" als relevanter Hauptfall · **V-369325**
Plenarprotokoll der konstituierenden Sitzung als fachlich irrelevante Kontrolle, zugleich
delete-Stub-Paar · **V-370081** Gesetzentwurf Kommunalverfassung regional passend/fachfremd, als
Mehrdokument-Vorgang Beweis „Dokument ≠ Vorgang" · BLN **V-351039** Waffengebührenordnung als
thematisch ähnliche Berlin-Kontrolle · klar markiertes synthetisches Bundes-Kontrolldokument) durch
die **echten Produktionsfunktionen**: `pardok-parser` → `zuRohdokument` (Herkunft **BRA**, Ebene
land, Geografie Brandenburg, Vorgangsbezug, Regel-0-Identität) → `runUnderstandingShadow` →
`runMatchingShadow` mit echtem `matching-audit` (Audit AN wie Production, **M8 nachweislich AUS**) →
persistierte `matching_results` samt Begründung/Signalen → sichtbare Erklärung
(`matching-erklaerung`, Belegpflicht) → `decisions` → Lage-Auswahl mit Original-PDF des Landtags
Brandenburg als sichtbarer Quelle. **Bewiesen (Auszug):** Vorgangsbezug ohne `VID`/`DBID` (externe
Kennung VNr+ReihNr), 0 Kennungskonflikte, ehrliche Stub-/Leer-Zähler · Regel 0 hält zwei echte
Records mit derselben Protokoll-PDF auseinander · Rang 1 + Belege Ausschuss („Inneres und
Kommunales")/Thema/Region beim richtigen Profil · Erklärung deckungsgleich mit gespeicherten
Gründen; die Berliner Kontrollzeile ohne Beleg liefert `null` statt einer erfundenen Erklärung ·
Entscheidung „Sofort reagieren" nur beim richtigen Mandanten; konstituierende Sitzung „Ignorieren";
Kommunalverfassung kein „Sofort reagieren"; **gemessen:** der thematisch ähnliche Berliner Fall
trägt beim Brandenburger Profil eine **negative** Merkmalsähnlichkeit (−0,1539) ohne Beleg und
erreicht die Entscheidungsliste gar nicht · Berlin bleibt `land`+Berlin, Bund bleibt `bund` —
nichts wird Brandenburger Landesvorgang · Cross-Tenant-Schreibversuch und fremde Profilkennung
werden hart abgelehnt · Idempotenz beider Stufen (Understanding `duplicate:5`, 0 Schreibvorgänge;
Matching `idempotent`, Projektion byte-identisch) · erzwungener Störfall erzeugt
`skipped-error`/`fehlgeschlagen` statt falschem Grün, ein `failed`-Vorgang erreicht das Matching
strukturell nie, ein Publish-Abbruch lässt die vorherige Generation intakt. **Damit ist die bisher
nur hergeleitete Ebenen-Unabhängigkeit des aktiven Matchings erstmals für ein Brandenburger
Landtagsprofil offline gemessen** ([`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md)
§48.5 — der Production-Nachweis bleibt 27B). **Befund 27A-1 — REALER FEHLER im aktiven Matching
(gefunden, in diesem Sprint bewusst NICHT behoben):** `normalizeCommittee` faltet den
Brandenburger „Ausschuss für Inneres und Kommunales" und den Berliner „Ausschuss für Inneres,
Sicherheit und Ordnung" auf denselben Merkmalsstamm `inneres`. Dadurch kann ein **Berliner**
Vorgang beim **Brandenburger** Profil einen **falschen Ausschussbeleg** erhalten (und umgekehrt),
sobald die Analyse den fremden Landesausschuss nennt — der Beleg speist `matched_features`,
Begründung, sichtbare Erklärung und über das Ausschussgewicht (34) auch die Entscheidung. Der
Vertrag **vermeidet** den Fehler derzeit, indem die Kontrollfall-Fixtures bewusst keinen Ausschuss
nennen (im Suitenkopf als Befund markiert). Er beweist deshalb **zuverlässig**: Erhaltung von
Ebene und Geografie über den gesamten Pfad, Priorisierung des relevanten Falls, Belegpflicht der
Erklärung, Mandantentrennung, Idempotenz und Fehlerpfade — aber noch **NICHT** die vollständige
fachliche Trennung der Landesmandate auf Ausschussebene. **Fehlende Abnahme für 27A:** ein
Vertragsnachweis, dass ein fremder Landesvorgang **mit** Ausschussnennung beim Brandenburger
Profil keinen Ausschussbeleg erhält — möglich erst nach dem getrennten Matchingfix (dann als
Regressionserwartung in Vertrag und Mutationsprobe zu ergänzen). Tests:
neue Suite **86/86**, Mutationsprobe **14/14 rot**, Berlin **76/76** + **10/10 rot**, Offline-Suite
lokal **171/185** gegen Basislinie `main` (unveränderter Worktree `5d475e6`) **170/184** — die
**+1** ist die neue Suite, die **14** Fehlschläge sind **byte-identisch** dieselben
umgebungsbedingten wie auf `main` (kein Regress), Browser-Smoke **32/32**. **Keine Migration, kein
neuer Schalter, keine Aktivierung (Berlin, Brandenburg, M8 unverändert aus), keine
Cron-/Budget-/Quellenänderung, 0 KI-Aufrufe, 0,00 USD, kein Production-Zugriff, keine realen
Testmandate angelegt.** Der Merge hat keine unmittelbare Production-Wirkung (nur Tests + Doku).
**Offen:** der Matchingfix zu Befund 27A-1 samt Regressionserwartung im Vertrag (getrennter
Folgesprint; erst damit wird 27A erfolgreich abgeschlossen); 27B (blockiert durch Punkt 15 und den
freigabepflichtigen Dispatch-Cutover — `pardokDispatch` liefert strukturell `items: []`); der
OP-25-Production-Nachweis und OP-27 bleiben
getrennte, unangetastete Themen. Branch `claude/brandenburg-offline-repo-contract-bs10y0`, PR #182.
Kanonisch: Checklisten-Zeile 27 in [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md)
+ Kopfkommentar der Suite.) ·
(**Sprint OP-25, regulärer Production-Nachweis, 1. Durchgang:
BLOCKIERT — das Beobachtungsfenster enthält 0 reguläre Läufe, weil zwischen dem Production-Deployment
des PR-179-Merges (READY 2026-07-30 06:27:19 UTC) und dem Sprintende (~07:20 UTC) kein regulärer
fairness-relevanter Cron-Termin lag. Keine Production-Änderung; ausschließlich lesende Zugriffe.**
**Startprüfung vollständig bestanden:** Arbeitsbaum sauber, HEAD = `origin/main` `fc3c4cc`; PR #179
vollständig in `main` (Merge `30c86cf` inkl. `51f2ae8` und Nachfix `9454d8e`), PR #180 vollständig in
`main`; Production-Deployment des PR-179-Merges (`dpl_9PvfRQV4…`, Commit `30c86cf`) READY 06:27:19 UTC;
aktuell aktives Production-Deployment `dpl_BMg9y9J8…` (Commit `fc3c4cc` = PR-180-Merge, seit ~07:03 UTC)
unterscheidet sich von `30c86cf` ausschließlich in Doku/Tests — **die Fairnesslogik ist seit dem
PR-179-Merge unverändert deployt**, kein späteres Production-Deployment. Cron-Zeiten unverändert
(`vercel.json`-Diff seit `51732e2` leer; fairness-relevante Termine UTC: 04:00 crawl, 05:00
morning-briefing, 10:00 lage-check, 16:00 pipeline, 20:00 crawl), Laufzeitbudgets unverändert (270 s
crawl/pipeline, 240 s Default), Kostenbudgets unverändert, keine Env-/Secret-/Flag-Änderung, keine
neuen Mandate angelegt oder aktiviert, Berlin/Brandenburg (`HELMUT_PARDOK_DISPATCH=shadow`, kein
Live-Cutover) und M8 (`HELMUT_MATCHING_RELEVANZ_GATE`, Default aus, nicht gesetzt) unverändert aus.
**Kernbefund — doppelt belegt, rein lesend:** (1) die Runtime-Logs beider Production-Deployments
zeigen seit 06:27 UTC ausschließlich je einen `GET /` (06:27:31 / 07:03:44) und **keinen einzigen
`/api/cron/*`-Aufruf** — auch keinen Watchdog- oder manuellen Lauf; (2) die Fairness-Zeile
`main-cron-fairness` **existiert in `helmut_store` noch nicht** (auch keine Zeile mit anderem
Store-Präfix) — sie entsteht erst mit dem ersten fairen Lauf; ihr Fehlen ist der erwartete ehrliche
Leerzustand, kein Fehler. Ergänzend belegt: **n = 6 aktive Mandate**, in beiden Profilquellen
deckungsgleich (SQL: `mandate_profiles.aktiv=true` ∧ nicht gelöscht; Blob: `profileActive` nicht
`false`; eine Identitätszeile ohne Mandatssatz fällt heraus; das Berliner Abnahmeprofil ist
deaktiviert) — Klarnamen bewusst nicht dokumentiert; der nie freigegebene `crawl-<mandat>`-Lock des
Vor-Deployment-Laufs von 04:05:04 UTC ist 04:20:04 UTC regulär abgelaufen und blockiert nichts.
**In diesem Sprint nicht prüfbar (ehrlich offen):** Reihenfolge-, Beginn-, k-, k=0-, Rotations-,
Kapazitäts- und Aktualitätsnachweis — jede dieser Fragen braucht mindestens die Läufe eines vollen
Tageszyklus (10/16/20/04 UTC); die vollständige Rotation braucht bei n=6 je nach k bis zu 6 reguläre
Läufe; ein k=0-Lauf ist nur dokumentierbar, falls er real auftritt (sonst gilt weiter nur der
Offline-Beweis aus PR #179, kein realer Production-Beweis). Einzige direkte Restunsicherheit zur
Aktivität: `HELMUT_CRON_FAIRNESS` ist default-an und steht nicht in der Datei-Flag-Allowlist; ein
`off` in der Vercel-Env ließe sich rein lesend nicht ausschließen (kein Env-Lesezugriff in diesem
Sprint) — es gab keine Env-Änderung, und der erste reguläre Lauf beweist die Aktivität über die
`[cron/*/fairness]`-Protokollzeile bzw. die Store-Zeile. **Die fünf weiteren realen Testmandate
bleiben gesperrt** (Folgeregel [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §9 unverändert
gültig; Entscheidung erst datenbasiert nach erbrachtem Nachweis). **0 KI-Aufrufe, 0,00 USD, keine
Production-Schreibzugriffe** (nur SELECT auf `helmut_store`, `profiles`/`mandate_profiles` [nur
id + Lifecycle-Felder], `pipeline_locks` sowie Vercel-Deployment-Metadaten und Runtime-Logs).
Nächster regulärer fairness-relevanter Termin (nur Information, keine Überwachungszusage): 10:00 UTC
lage-check; nach dem 04:00-Lauf des Folgetags sind erstmals vier reguläre Läufe auswertbar.
**Nächster Schritt:** denselben Nachweis in einem neuen Sprint wiederholen, sobald reguläre Läufe
vorliegen. Branch `claude/op-25-production-nachweis-ktwnke` (nur Doku), PR #181.) ·
(**Sprint Punkt 26A: Berliner Ende-zu-Ende-Repository-Vertrag.
26A ERFOLGREICH ABGESCHLOSSEN — Checklisten-Punkt 26 gesamt bleibt ⏳, weil 26B (regulärer
Production-Nachweis) offen und durch Punkt 14 blockiert ist.** **Verbindliche Definition geklärt:**
„Roadmap Punkt 26" ist Zeile 26 der [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md)
(Ende-zu-Ende-Test Berliner Profil) — **nicht** OP-26 der Restliste (Matching-Einzelauslösung,
anderes Thema); die im Auftrag genannte `docs/roadmap/analyse-punkte-24-30.md` **existiert nicht im
Repository** (dokumentierter Widerspruch, kein Blocker). Der Punkt ist geschnitten in **26A**
(deterministischer Offline-Repository-Vertrag, dieser Sprint) und **26B** (Production-Nachweis,
nicht begonnen). **Vorbedingung bestätigt:** PR #179 (OP-25 Cron-Fairness) ist gemergt, `main`
`30c86cf` enthält `51f2ae8` und den Nachfix `9454d8e`; Arbeitsbaum sauber. **Umsetzung:** neue Suite
`scripts/berlin-e2e-vertrag-test.js` (**76/76**) + `scripts/berlin-e2e-mutationsprobe.js`
(**10/10 Mutationen rot**, Konvention wie `geografie-mutationsprobe.js`). Der Vertrag führt echte
Gold-Records (Waffengebührenordnung **V-351039** als relevanter Fall, „Chaos am BER" als
irrelevanter Berliner Fall, BB **V-369657** „Straf- und Gewalttaten" als thematisch ähnliche
Brandenburg-Kontrolle, ein klar markiertes synthetisches Bundes-Kontrolldokument) durch die
**echten Produktionsfunktionen**: `pardok-parser` → `zuRohdokument` (Herkunft BLN, Ebene land,
Geografie, Vorgangsbezug, Regel-0-Identität) → `runUnderstandingShadow` (echte Orchestrierung,
Resolver, `assembleKnowledgeObject` inkl. Ebenen-/Geografie-Gedächtnis und Merkmalsvektor) →
`runMatchingShadow` mit **echtem `matching-audit`** (Audit AN wie in Production seit 2026-07-28,
M8 nachweislich AUS) → persistierte `matching_results` samt Begründung/Signalen → sichtbare
Erklärung (`matching-erklaerung`, Belegpflicht) → `decisions` → Lage-Auswahl
(`loadRankedVorgaenge`/`koToVorgangCard`/`selectLageVorgaenge`) mit Original-PDF als sichtbarer
Quelle. Testdoubles klar begrenzt und dokumentiert: deterministische LLM-Fixture-Analysen,
In-Memory-Store mit PostgREST-Vertragsgrenzen (Mandantenfilter, `aktuell`, Tenant-Guards, atomare
Publish-Semantik nach `matching-audit-test.js`), dokumentgetreue Offline-Replik der RPC
`match_knowledge_objects`. **Bewiesen (Auszug):** Rang 1 + Belege Ausschuss/Thema/Region für das
richtige Profil · Erklärung deckungsgleich mit gespeicherten Gründen, ohne Beleg `null` ·
Entscheidung „Sofort reagieren" nur beim richtigen Mandanten, irrelevanter Berliner Vorgang
„Ignorieren", derselbe Vorgang beim Kontrollprofil „Ignorieren" · Bund bleibt `bund`, Brandenburg
bleibt Brandenburg — nichts davon wird Berliner Landesvorgang · Cross-Tenant-Schreibversuch und
fremde Profilkennung werden hart abgelehnt · Idempotenz beider Stufen (Understanding `duplicate:4`,
0 Schreibvorgänge; Matching `idempotent`, `wiederholungen 1`, Projektion byte-identisch) ·
erzwungener Störfall erzeugt `skipped-error`/`fehlgeschlagen` statt falschem Grün, ein
`failed`-Vorgang erreicht das Matching strukturell nie, ein Publish-Abbruch lässt die vorherige
Generation intakt. **Erkenntnis (dokumentiert, bewusst nicht „gefixt"):** `assembleKnowledgeObject`
übernimmt keine `tags` aus der Analyse (Whitelist) — die Themen-Dimension eines Wissensobjekts
entsteht im aktiven Pfad ausschließlich aus den Ausschüssen (`derivePolicyFields`, bekanntes
P1-1-Verhalten); das Berliner Testprofil trägt deshalb den Schwerpunkt „Inneres". **Strukturbefund
(bestätigt, kein neuer):** der Live-Cutover Berlin → Pipeline existiert nicht —
`pardokDispatch` liefert in jedem Modus `items: []`; 26B braucht Punkt 14 (Berliner Lieferung)
plus den freigabepflichtigen Dispatch-Cutover. Tests: neue Suite **76/76**, Mutationsprobe
**10 von 10 rot**, Offline-Suite lokal **170/184** gegen Basislinie `main` **169/183** (die
**+1** ist die neue Suite; **dieselben 14** umgebungsbedingten Fehlschläge, kein Regress),
Browser-Smoke **32/32**. **Keine Migration, kein neuer Schalter, keine Aktivierung (Berlin,
Brandenburg, M8 unverändert aus), keine Cron-/Budget-/Quellenänderung, 0 KI-Aufrufe, 0,00 USD,
kein Production-Zugriff, keine realen Testmandate angelegt.** Der Merge hat keine unmittelbare
Production-Wirkung (nur Tests + Doku). **Offen:** 26B; die fünf weiteren realen Testmandate
bleiben unangelegt; der reguläre OP-25-Production-Nachweis bleibt ein getrenntes Thema und war
für diesen Sprint keine Voraussetzung. Kanonisch: Checklisten-Zeile 26 in
[`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md) + Kopfkommentar der Suite.) ·
(**Sprint OP-25, letzte Vorprüfung vor der Mergefreigabe:
EIN ECHTER FEHLER GEFUNDEN UND BEHOBEN.** Die Betreiberfrage war präzise und traf einen realen
Defekt: der Fairnessvermerk entsteht **vor** der Verarbeitung, die Sperre `crawl-<mandat>` erst
**in** `runSourceCrawl` — und `runSourceCrawl` **wirft** bei verweigerter Sperre nicht, sondern
liefert `{ skipped: true, reason: "already running" }`. Die Ausführungsschleife sah darin einen
erfolgreichen Rückgabewert und schrieb einen **erfundenen Erfolg**: Erfolgszeitpunkt gesetzt,
Erfolgszähler erhöht, Fehlerserie auf 0, Mandat in `begonnen` und damit in der Kapazität `k` →
die gemeldete Obergrenze `ceil(n/k)` war **zu optimistisch**, und `fairness.erfolgreich` nannte
ein Mandat, das dieser Lauf nie angefasst hat. **Auch die frühere Einschätzung war zu
optimistisch:** `fremderHalter` deckt diesen Pfad **nicht** ab — claimt der andere Lauf erst
*nachdem* dieser geplant hat, ist der eigene Vermerk der jüngere und führt die Verschmelzung, die
Prüfung greift also nicht. Nur die Sperre fängt es dann, und genau deren Rückgabewert wurde
falsch verbucht. **Behoben, ohne die Sperre anzufassen:** eine verweigerte Sperre wird erkannt und
zählt nicht als Verarbeitung — kein `begonnen`, nicht in `k`, **kein** Abschluss-Schreibvorgang
(kein erfundener Erfolg, kein erfundener Fehler), eigener sichtbarer Ausgang in
`fairness.lockVerweigert` und in der Protokollzeile als `sperreVerweigert=…`. Der bereits
geschriebene Versuchsvermerk bleibt bewusst `laufend` (monotone Verschmelzung lässt ihn nicht
zurücknehmen) — er sperrt das Mandat für **weitere** überlappende Läufe und läuft nach 30 min ab;
danach steht es wieder **vorn**, weil sein Versuchszeitpunkt der älteste ist. Nur die exakte
Zeichenkette `already running` gilt als Verweigerung (Vertragstest gegen `scheduler.js`); andere
`skipped`-Gründe wie `profil-deaktiviert` bleiben normale Versuche. **Zusätzlich geprüft und
dokumentiert:** `HELMUT_CRON_FAIRNESS` ist **ohne gesetzte Variable aktiv** (nur `off`/`false`/`0`
schalten ab, jeder andere Wert lässt es an — kein stilles Abschalten durch Tippfehler), der
Schalter steht **nicht** in der Datei-Flag-Allowlist (Rückweg nur über Vercel-Env), und der Merge
verändert damit **unmittelbar** das Production-Verhalten: die nächste Cron-Ausführung nutzt die
neue Reihenfolge und beginnt die `main-cron-fairness`-Zeile zu schreiben. Tests: Suite
**201/201** (von 176), **Mutationsprobe 10 von 10 rot** (neu: „verweigerte Sperre gilt wieder als
Erfolg"), Offline-Suite **169/183** gegen Basislinie `main` **168/182**, Browser-Smoke **32/32**.
Ein Einzellauf zeigte zusätzlich `werkzeug-lesefehler-test.js` rot — Parallellast-Flake, allein
43/0, unter dem Runner dreimal grün, im Wiederholungslauf der vollen Suite wieder auf der
Basislinie. **Keine Änderung an der Sperre, an Cron-Zeiten, Budgets, Quellen, M8, Berlin oder
Brandenburg; kein Production-Zugriff.** Sprintzustand bleibt **teilweise abgeschlossen** —
Production-Nachweis nach dem Merge offen. Kanonisch:
[`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §3a.1.) ·
(**Abschlussdurchgang: CI-Gate grün, drei Nachprüfungen belegt.** **Jeder Commit dieses Branches hat das CI-Gate grün passiert** — beide
Pflicht-Checks, jeweils Offline-Suite **183/183** und Browser-/Mobile-Smoke **32/32**:
`eeaa363` (Lauf `30499103799`) · `2dc4154` (Härtung, Lauf `30516881711`) · `ee1bce4`
(Doku, Lauf `30517066137`) · `a251d91` (Wortlaut, Lauf `30517190157`) sowie der Lauf dieses
Doku-Nachtrags. Der lokale Wert **169/183** enthält 14 umgebungsbedingte Fehlschläge, die auf
unverändertem `main` identisch rot sind — maßgeblich ist laut `CLAUDE.md` §6 die CI-Zahl. Danach die drei vom Betreiber
verlangten Nachprüfungen — jede führte zu einer echten Nachbesserung, keine war reine Bestätigung:
**(1) Garantie präzisiert.** `ceil(n/k)` gilt **nur** für Läufe mit `k ≥ 1`. Der Fall `k = 0`
(die Restlaufzeit reicht nicht einmal für das erste Mandat) trägt **keine** Fortschrittsgarantie
und wird jetzt ausdrücklich als solcher ausgewiesen: `kapazitaet`, `fortschrittsgarantie`,
`ohneFortschritt`, `obergrenzeLaeufe: null` (statt `Infinity`, das in JSON zu `null` würde und
dort nicht von „unbekannt" zu unterscheiden wäre), `kapazitaet=0
obergrenzeLaeufe=keine-garantie` im Protokoll und ein `systemError`, der den Fall wörtlich
benennt. Ein solcher Lauf schreibt **nichts** — die Warteschlange bleibt unverändert, der nächste
Lauf holt genau dort nach. **(2) Überlappungsschutz bewiesen — und ein falsches Dokument
korrigiert.** Der Watchdog ruft `/api/cron/pipeline` außerplanmäßig auf, ein Überlappungspfad
existiert also real. Die Sperre `crawl-<mandat>` wird als **erste** Anweisung in `runSourceCrawl`
erworben (TTL 15 min > Funktionslimit 300 s), deckt den gesamten Mandatslauf ab, verweigert dem
zweiten Lauf die Verarbeitung und bleibt bei Prozessabbruch bis zum Ablauf stehen.
**`env-inventar.md` behauptete, die Migration `20260719` sei „NICHT auf Prod angewendet" und der
Modus sei „fail-open" — beides ist falsch.** Rein lesend in Production gegengeprüft (keine
Schreibzugriffe): beide Lock-Funktionen und `pipeline_locks.token` existieren, und die Zeilen des
regulären 04:00-Crawls vom **2026-07-30** tragen einen **Token** — den schreibt ausschließlich der
atomare Pfad. Damit ist `HELMUT_ATOMIC_LOCK` in Production **AN**, die Sperre atomar und
fail-closed, und ein **atomarer Mandatsclaim in der Fairnessschicht ist nicht erforderlich**
(keine Queue, keine Parallelisierung, keine Architekturänderung). Das Inventar ist korrigiert.
**Frischer Beleg für OP-25 aus derselben Abfrage:** der 04:05:04-Lauf vom 2026-07-30 hat seine
Sperre **nie freigegeben** — der Prozess starb am Zeitlimit beim **zweiten** Mandat der
alphabetischen Reihenfolge, gleicher Mandant und gleiches Muster wie am 29.07. Der Fehler trat
also bis zuletzt auf. **(3) Persistenz gehärtet.** Drei Schranken gegen Datenverlust, jede
getestet: Lesefehler → **kein** Schreibvorgang (ein Patch trägt nur ein Mandat und würde alle
anderen Einträge löschen); **neuere** Schemaversion in der Zeile → kein Schreibvorgang (Rollout
mit zwei Codeständen — das Feld `version` wird jetzt tatsächlich ausgewertet statt nur
geschrieben); Versuchsvermerk wird nach dem Schreiben **gegengelesen** und begrenzt wiederholt,
gewinnt dabei ein fremder Versuch, lässt dieser Lauf das Mandat aus. Der Abschluss wird bewusst
**nicht** gegengelesen (er läuft über die Frist ab) — ein Lesen, ein Schreiben. Ein korrupter
Eintrag blockiert niemanden: er wird verworfen, das Mandat gilt als „ohne Versuch", wird zuerst
verarbeitet und heilt sich selbst. Ein gestörter Zustand erzeugt weiterhin einen eigenen
`systemError` plus `fairnessGestoert: true`; `ok` bleibt bewusst `true`, weil die Verarbeitung
stattgefunden hat und ein `false` den Watchdog fehlalarmieren würde. Tests: Suite **176/176**
(von 118), **Mutationsprobe 9 von 9 rot**, Offline-Suite lokal **169/183** gegen Basislinie `main`
**168/182** (dieselben 14 umgebungsbedingten Fehlschläge), Browser-Smoke **32/32**. **Weiterhin
keine Migration, keine Cron-/Budget-/Flagänderung, keine Production-Schreibzugriffe, 0
KI-Aufrufe.** Sprintzustand bleibt **teilweise abgeschlossen**: der reguläre Production-Nachweis
steht aus, weil er erst nach dem Merge entstehen kann. Kanonisch:
[`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §3a/§4.) · (**Sprint OP-25, 1. Durchgang:
faire Mandantenreihenfolge in den Mehrmandanten-Crons. TEILWEISE ABGESCHLOSSEN — offline
vollständig belegt, Production-Nachweis offen, PR offen, kein Merge, keine Migration, keine
Production-Änderung.** Der Auftrag nennt
diesen Punkt „Roadmap Punkt 25"; gemeint ist **OP-25** der Restliste — Zeile 25 der
`roadmap/phase_1_checkliste.md` (Ende-zu-Ende-Test Pilotmandant) ist ein anderer Punkt und bleibt
unberührt. **Befund gegen `main` nach PR #178 (`51732e2`) bestätigt, nicht übernommen:**
`listActiveTenantIds` endete auf `ids.sort()` (**alphabetisch**), `runCronForTenants` verarbeitete
die Mandate **seriell** gegen `Date.now() > deadline`, und es existierte **kein** persistenter
Fortschritt je Mandat. Die Verdrängung traf damit strukturell **immer dieselben** Mandate — belegt
am **2026-07-24** (4 von 6 Mandaten über Tage nie gecrawlt) und erneut am **2026-07-29** (der
16:00-`pipeline`-Lauf erreichte die Matching-Stufe bei **1 von 7**). Präzisierung zum Auftrag: „4
von 6" ist der Messwert vom 24.07., am 29.07. waren es 6 von 7. **Lösung (kleinste robuste
Variante):** Reihenfolge nach dem **ältesten letzten Versuch** statt nach der Kennung
(`lib/helmut/cron-fairness.js`), Mandate ohne Versuch vorn, Kennung nur noch als letzter
Gleichstandsentscheid; der Versuch wird **vor** der Verarbeitung persistiert, Erfolg/Fehler/Dauer
getrennt danach. **Persistenz ohne Migration:** eine **eigene Zeile** im bestehenden
`helmut_store` (`<storeId>-cron-fairness`) — kein Last-Write-Wins-Wettlauf mit dem Blob (Befund
W-2), keine neue Tabelle, **keine RLS-Änderung** (die `helmut_store`-Policy matcht nur `main-p-`,
jede andere Zeile ist für `anon`/`authenticated` implizit gesperrt), kein Freigabegate — der Fix
wirkt mit dem Deployment. **Fairnessgarantie:** bei `n` planbaren Mandaten und mindestens `k`
begonnenen Mandaten (**k ≥ 1**) je Lauf wird jedes Mandat spätestens im **ceil(n/k)**-ten
regulären Lauf begonnen; deterministisch bewiesen für n=1…9 × k=1…4. Für `k = 0` gilt sie nicht —
siehe Abschlussdurchgang oben. **Nicht begonnene Mandate werden NICHT als
versucht vermerkt** und bleiben deshalb vorn; ein abgebrochener Lauf setzt an der Mandatsgrenze
fort; ein `laufend` gebliebener Versuch wird nach 30 min kontrolliert erneut zugelassen; ein
dauerhaft scheiterndes Mandat rutscht wie jedes andere nach hinten und blockiert niemanden.
**Beobachtbarkeit ohne neue Oberfläche:** eine `[cron/*/fairness]`-Protokollzeile (geplant,
begonnen, erfolgreich, fehlgeschlagen, zeitbudget, laeuftBereits, nächstes Mandat, Obergrenze) und
dieselben Angaben im Antwortkörper; der `systemError` beim Zeitbudget nennt jetzt die **Kennungen**
statt nur eine Anzahl, und ein unbrauchbarer Fairnesszustand erzeugt einen **eigenen**
`systemError` („keine Fairnessgarantie") statt falschem Grün. Tests dieses Durchgangs: neue Suite
**118/118** (18 geforderte Fälle + Grenzbeweis), **Mutationsprobe 7 von 7 rot** — im
Abschlussdurchgang auf 176/176 und 9 von 9 erweitert, siehe oben. Offline-Suite **169/183**
gegen Baseline `main` **168/182** — **dieselben 14 umgebungsbedingten Fehlschläge**, kein
Regress; Browser-Smoke **32/32**. Ein bei der Integrationsprüfung gefundener Merge-Fallstrick
(ein Abschluss mit leicht früherem Startzeitstempel fiel hinter den eigenen `laufend`-Vermerk
zurück) ist behoben und als Test verankert. Nebenbefund: `HELMUT_CRON_FAIRNESS*` fehlte im
Env-Inventar — die bestehende Prüfung hat es gefangen, Inventar nachgezogen. **0 KI-Aufrufe,
0,00 USD, keine Migration, keine Cron-/Budget-/Flagänderung in Production, kein Production-Zugriff,
M8 unverändert deaktiviert, Berlin/Brandenburg unverändert deaktiviert, aktive Bundestagsquellen
unverändert.** Rückweg: `HELMUT_CRON_FAIRNESS=off`. **Offen:** der reguläre
Production-Nachweis nach Merge sowie OP-25 (a) Abdeckungsmessung und (c) Abdeckungsalarm über eine
Serie von Läufen. Restlücke R-1: `/api/cron/lage-briefing` hat eine eigene Schleife und ist noch
nicht fair. Kanonisch: [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md).) ·
(**Roadmap-Punkt 24 ABGESCHLOSSEN — 3. Durchgang: der
Vorgangsbezug ist jetzt GEMESSEN statt an einem Beispiel belegt.** Die Kardinalitätsfrage war die
letzte offene Lücke: wäre die Beziehung **n:m**, wäre `vorgangsnummer` am Dokument eine
willkürliche Auswahl. Läufe `30493097161` (Berlin) und `30493614179` (beide Länder, nur lesend):
Berlin **41 853** `<Vorgang>` / **47 415** `<Dokument>`, Brandenburg WP8 **vollständig** (9 092 /
8 133). **Kernbefund: 1:n, nicht n:m** — keine `DBID` unter mehr als einer `VNr` (0 von 47 415).
`VNr` in Berlin 100 %, formstabil, ohne Platzhalter, ohne Mehrfachvergabe, `VNr` == `VID` in
**allen** 41 853 Fällen. **Länderunterschiede gemessen statt angenommen:** Brandenburg hat **kein**
`<VID>` und **keine** `<DBID>`; **411 von 4 751** vollständigen Vorgängen (8,7 %) tragen keinen
verwertbaren `VNr`-Wert → Bezug `null`, Dokument bleibt lesbar. Ergänzt wurde nur die kleinste
Absicherung (`vorgangsKennung()`): Widerspruch `VNr`≠`VID` und Platzhalter `-` führen **fail
closed** zu keinem Bezug statt zu einem geratenen — beides sichtbar gezählt, damit ein
Formatwechsel nicht still durchläuft. **Wechselwirkung geprüft, nicht umgebaut:** die Adressregel
der globalen Dedup **würde** zwei Dokumente eines Vorgangs mit gleicher Protokoll-PDF
zusammenführen — Regel 0 fängt es ab, der Ursachennachweis steht als Test. Tests **141/141**,
Mutationsprobe **6 von 6 rot**, Offline-Suite **182/182 grün im CI** (Lauf `30494735859`,
Commit `70e746d`) — **beide Pflicht-Checks grün**; lokal 168/182, die 14 Abweichungen sind
umgebungsbedingt und **identisch zur gegengeprüften Baseline auf `main`**, Browser-Smoke **32/32**. **0 KI-Aufrufe,
0,00 USD, kein Flag, kein Cron, kein Secret, kein Schreibzugriff, keine Production-Abfrage.**
Verbleibend: Berlin am 48-MiB-Lesecap abgeschnitten (Stichprobe) · für Brandenburg ist n:m ohne
Dokumentkennung nicht über eine Kennung prüfbar · `NrInN` (3×) unerklärt und nicht gedeutet.
Details: [`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md)
**Teil C**. — Vorheriger Durchgang: drei
Restpunkte geschlossen. Keine Aktivierung, keine Migration, keine Production-Änderung.**
**(1) Berliner Vorgangsbezug:** der öffentliche Sondenlauf `30483735900` mit
`PP_RECORD_TAG=Vorgang` widerlegt die frühere Aussage — **Berlin ist ebenfalls
vorgangsstrukturiert** (41 854 `<Vorgang>`, `VNr`/`VID` je **100 %**, ~50 % delete-Stubs).
`V-351039` trägt Drucksache **und** Plenarprotokoll; die Dokumentidentität bleibt die `DBID`, der
Vorgang liefert nur den **Bezug** — kein Vorgangsobjekt, nie `cluster_id`. Zusätzlich belegt:
Dokumenttyp **`MdlAnfr`/„Mündliche Anfrage"** und **drei** eigenständige Dokumente mit
**derselben** PDF-Adresse. **(2) Identitätskollision: behoben, nicht nur beschrieben.** Gegen den
echten Schreibpfad gemessen: **10 eigenständige Rohdokumente wurden zu 8** (Adresse **und** Titel),
im Folgelauf wurde ein Dokument **gar nicht gespeichert** (`persists: 0`). Neue **Regel 0** —
Identität aus **Herausgeber + externer Kennung + Dokumenttyp**, Adresse nur noch Rückfall,
Identität im **bestehenden** Feld `content_fingerprint` — **ohne Migration**. Nachher **10 → 10**,
Folgelauf eigenständig, Zweitlauf idempotent. Für Bestandsquellen inkl. Bund **strukturell inert**
(keine Quelle trägt heute eine externe Kennung). **(3) Understanding-Gate: begrenzt.** Die
Ergänzung wäre **global** gewesen; die **aktive DIP-Bundestagsquelle** setzt `document_type` aus
der API, ihr Vokabular ist offline nicht prüfbar und eine Production-Abfrage nicht freigegeben —
ein Treffer hätte dort **einen zusätzlichen KI-Aufruf** je Dokument gekostet. Die drei Typen
greifen jetzt **nur** bei Landessignal (`politische_ebene = land`, Herkunft `BLN`/`BRA`, Abrufweg
`be-`/`bb-`); für den Bund strukturell wirkungslos, 42/42 Gate-Entscheidungen unverändert.
Tests: Suite **116/116**, **Mutationsprobe 14 von 14 rot**, Offline-Suite **182/182** unter
CI-Bedingungen, Browser-Smoke **32/32**, **CI-Gate grün — beide Pflicht-Checks** (Lauf
`30484947476`, finaler Commit `4906122`). **0 KI-Aufrufe, 0,00 USD, kein Flag, kein Cron, kein
Secret, kein Schreibzugriff, keine Production-Abfrage**; `rp-be-plenum`/`rp-bb-plenum` bleiben
`needs_review` + `manual`. **PR #177 inzwischen gemergt** (Stand 2026-07-29, `41da94b`). Verbleibende Risiken: Vollzähligkeit
der Dokumente je Vorgang unbelegt (Sonde kürzt bei 1 800 Zeichen) · Typtabellen aus Stichproben ·
kein Production-Beleg möglich, solange die Wege inaktiv sind. Details:
[`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md) Teil B.) ·
(**Sprint Roadmap-Punkt 24 (1. Durchgang): Landtags-Parser Berlin/Brandenburg —
Dokumentklassen und kanonischer Rohdokument-Vertrag. TEILWEISE ABGESCHLOSSEN, keine Aktivierung,
keine Production-Änderung.** Vorher lieferte der bewiesene Parser je Land nur die **rohen**
Typbezeichnungen der Quelle (`DokArt`/`DokTyp`) — es gab weder eine normalisierte Dokumentklasse
noch eine Abbildung auf den kanonischen Vertrag `raw_documents` noch einen Test für die von
Punkt 24 geforderte Trennung. Jetzt: acht kanonische Klassen mit **getrennten Typtabellen je Land**,
Auswertung `DokTyp` **vor** `DokArt` und **fail closed** auf `unbekannt` — ein nicht belegter
Typwert wird nie geraten. **`vorgang` ist bewusst KEINE Dokumentklasse:** der Vorgang bleibt ein
Bezug, `cluster_id` wird nie gesetzt, die Vorgangsbildung bleibt beim Resolver. **Berlin belegt:**
Drucksache · Schriftliche Anfrage · Antwort · Sitzung · Sonstiges. **Brandenburg belegt:**
Drucksache · Kleine Anfrage · Sitzung · **Tagesordnung** (Dokumentart `Einladung`) · Sonstiges +
Vorgangsbezug. Nicht lieferbare Klassen sind als fachliche Ausnahme hinterlegt und werden **nicht**
simuliert. **Drei Befunde:** **24-1** — das
Understanding-Gate kannte **„Schriftliche Anfrage" nicht**; das wichtigste Berliner Instrument fiel
in den Stichwort-/Alterspfad (gemessen `parken`/`zu-alt`). Behoben, rein additiv, **42/42
Bundes-Gate-Entscheidungen unverändert**. **24-2** — die globale Dedup identifiziert **über die
URL**; zwei echte Berliner Dokumente (Plenarprotokoll und die darin enthaltene Antwort) zeigen auf
**dieselbe** PDF-Adresse und würden verschmelzen. Architektur bewusst **nicht** geändert,
verbindlich ist `content_hash` als PARDOK-Identität. **24-3** — die gegen die **gemessene
Dokumentart-Verteilung** geprüfte Brandenburg-Tabelle war unvollständig: **Brandenburg führt 11
Dokumentarten, Berlin nur 4**; ohne die Ergänzung wären **290 von 816 Dokumenten (35,5 %)**
fälschlich `unbekannt` geblieben. Dabei korrigiert: die zuerst notierte Ausnahme „Brandenburg
liefert keine Tagesordnung" ist falsch — die Dokumentart `Einladung` trägt sie. Belegt aus dem echten Sondenlauf
`30209973678` (26.07.2026) — Live-Abrufe sind aus der Sitzung gesperrt (`403` am Agent-Proxy),
deshalb wurde **kein** Feldwert erfunden; drei echte Records wanderten in die Gold-Fixtures,
Grenzfälle in getrennte, ausdrücklich als kein Quellenbeleg markierte Fixtures. Tests: neue Suite
**94/94**, **Mutationsprobe 9 von 9 rot**, Offline-Suite **182/182** unter CI-Bedingungen
(Ausgang 181/181), Browser-Smoke **32/32**, **CI-Gate grün — beide Pflicht-Checks** (Lauf `30482172757`). **PR #177 inzwischen gemergt** (Stand 2026-07-29, `41da94b`). **0 KI-Aufrufe, 0,00 USD, keine Migration, kein Flag,
kein Cron, kein Secret, kein Schreibzugriff**; `rp-be-plenum`/`rp-bb-plenum` bleiben nachweislich
`needs_review` + `manual`. **Offen und ehrlich benannt:** der Berliner Export enthält **41 854
`<Vorgang>`-Elemente**, deren Feldstruktur in keinem gespeicherten Beleg dokumentiert ist — Berlin
führt deshalb keinen Vorgangsbezug. Schließungsweg vorbereitet (`PP_RECORD_TAG=Vorgang`), braucht
Netzzugang. **Roadmap-Punkt 24 steht auf ⏳.** Details:
[`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md) Teil B.) ·
(**Sprint M-8: Relevanzschwelle analysiert — Ergebnis:
KEIN Ähnlichkeitsschwellenwert, sondern Belegpflicht. TEILWEISE ABGESCHLOSSEN, Aktivierung
freigabepflichtig, keine Production-Änderung.** Rein lesend gemessen (271 aktuelle `matching_results`
über 7 Mandanten + die RPC selbst, Werkzeug `scripts/matching-schwellenwert-analyse.js`, 0 KI,
0 Schreibzugriff): **Korrektur der bisherigen Zahl — es sind 63 von 271 Zeilen (23,2 %) mit
Ähnlichkeit ≤ 0, nicht 40**; die 40 waren eine Stichprobe (40 von 80 betrachteten unbelegten
Treffern). Diese 63 Zeilen stammen **ausnahmslos aus dem jeweils ersten Lauf eines Mandanten**
(15./17./19./20.07., Profil bzw. Wissensbestand noch leer) und stehen nur deshalb noch auf
`aktuell=true`, weil die Ablösung erst seit dem 29.07. greift. **In keinem sichtbaren 12er-Fenster
eines gepflegten Mandanten steht heute eine Zeile mit Ähnlichkeit ≤ 0** (niedrigster sichtbarer Wert
0,2094). **Das heutige Top-20 aller sechs gepflegten Mandanten liegt vollständig in
[0,2211 … 0,4319]** — ein absoluter Schwellenwert bis 0,20 entfernt **nichts**, ab 0,22 entfernt er
belegte Treffer (bei 0,25 verliert ein Mandant 10 von 20). **Die Ähnlichkeit trennt belegbar von
unbelegbar nicht:** bei einem Mandanten liegen die beiden unbelegbaren Treffer (0,2487/0,2741)
**über** dem Median seiner 18 belegten (0,2617). **Zwei Platzhalterprofile erzeugen ein
byte-identisches, vollständig unbelegbares Top-20 im Band 0,1768…0,3162** — mitten im Band der
echten Mandate; ein globaler Schwellenwert ließe dieses Rauschen durch und schnitte zugleich
Substanz weg. **Empfohlene Regel: veröffentlicht wird nur, was begründbar ist** (belegtes
`matched_feature`), **ohne jede Auffüllung und ohne Mindestmenge** — Wirkung gemessen: 20→20 bei
fünf Mandanten, 20→18 bei einem, 20→**0** beim Platzhalterprofil; Verlust echter Treffer durch
zusätzliche Signale (Namensnennung/Geografie) gemessen **0**. **Das korrigiert die Empfehlung aus
§39.1** (dort wurde ein Erklärbarkeits-Gate abgelehnt) — die Grundlage hat sich mit der M-7-Behebung
messbar geändert; Details und Gegenüberstellung in Teil E §46. **Umgesetzt: nur offline, hinter dem
neuen Flag `HELMUT_MATCHING_RELEVANZ_GATE`, DEFAULT AUS** — aus = byte-identisch zum bisherigen
Verhalten. Keine Migration, kein manueller Lauf, keine KI (0,00 USD), keine Änderung an
Production-Daten, Flags, Cron, Embeddings, Profilen oder Briefing-Texten. Ränge, Ähnlichkeiten,
Reihenfolge und Ergebniskennungen bleiben unangetastet, der Rang wird bewusst **nicht** neu vergeben.
Tests: neue Suite **40/40**, Offline-Suite **181/181** unter CI-Bedingungen (Ausgang 180/180),
Browser-Smoke **32/32**, **Mutationsprobe gegen das heutige Top-N-Verhalten: 15 von 40 Prüfungen
fallen**. Offene Risiken ehrlich benannt: der Riegel räumt den Alt-Bestand **nicht** auf (bei
0 veröffentlichten Zeilen löst `helmut_publish_matching_run` nichts ab → beim Platzhalterprofil
bleibt die Rausch-Lage stehen, das löst nur Profilpflege/**OP-04**), die erste Aktivierung ist nicht
idempotenz-neutral, und für die **Landtagsebene existiert kein Production-Beleg** (das einzige
Landtagsprofil ist über den produktiven Profil-Lesepfad nicht erreichbar und hat 0
`matching_results`). Nächster kleinster Beweisschritt: Flag für einen gepflegten Mandanten
aktivieren und den nächsten **regulären** Lauf gegenmessen. Details:
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) Teil E, §42–§49.) ·
(**Sprint 23C-2A: Befund M-7 behoben — die Erklärung wird
jetzt gegen das TATSÄCHLICHE Wissensobjekt gebildet.** Der Schreibpfad lud für die
Merkmalsauflösung ein Fenster von 200 nach Änderungszeit sortierten Wissensobjekten, während die
Vektorsuche über alle **1 702** läuft; jeder Treffer außerhalb dieses Fensters wurde gegen ein
**leeres** Objekt ausgewertet und blieb ohne `matched_features`, `signale` und `begruendung`.
Behoben durch **gebündeltes Laden nach Kennung** (`storage.listKnowledgeObjectsByIds`, eine Anfrage
je 100 Kennungen — bei 20 Treffern genau **eine**, kein N+1, 20 statt 200 gelesene Zeilen).
**Kandidaten, Ähnlichkeiten, Ränge, Reihenfolge und Ergebniskennungen bleiben byte-identisch**
(Abschnitt B der neuen Suite). **Keine Versionsanhebung nötig und bewusst keine vorgenommen:** der
Eingabefingerabdruck ändert sich von allein und exakt bei den betroffenen Läufen, weil
`ko_eingabe_hash` von `null` auf einen echten Hash wechselt — nicht betroffene Läufe bleiben
idempotent. **0 KI-Aufrufe, 0,00 USD, keine Migration, kein Flag, keine UI-Änderung, keine
Production-Datenänderung.** Erwartete Abdeckung nach kontrollierter Neuberechnung: **63 → 191 von
271 Zeilen (23,2 % → 70,5 %)**, im sichtbaren 12er-Lagefenster **46 → 71 von 84 (54,8 % → 84,5 %)**.
Tests: neue Suite **60/60**, Offline-Suite **180/180** (Ausgangsmessung 179/179), Browser-Smoke
**32/32**, **externe Mutationsprobe gegen den alten 200er-Stand: 11 Fehlschläge**, **CI-Gate grün —
beide Pflicht-Checks** (Lauf `30450796962`). **Zwei neue
Befunde** aus der rein lesenden Restanalyse: **M-8** — `match_knowledge_objects` kennt keinen
Schwellenwert, **40** aktuelle Zeilen tragen eine Ähnlichkeit ≤ 0 (min −0,0735) auf den Rängen
1–20, sind also reine Auffüllung; **M-9** — ein Mandatsprofil ohne Partei/Ausschuss/Schwerpunkt kann
konstruktionsbedingt nie einen Beleg erzeugen (ein Mandant, 20 von 20 Zeilen).
**Produktempfehlung: KEIN Erklärbarkeits-Gate** — es entfernte bei gepflegten Profilen genau einen
Vorgang und leerte beim Platzhalterprofil die Lage vollständig; erst M-8/M-9 und das semantische
Matching lösen, was ein Gate nur verstecken würde. **PR #174 gemergt (`bb539b1`), ausgerollt (`dpl_7NwHyiwYuECi4y2RXaoRQCCmjdo5`, `READY` 12:19:17 UTC) und in Production nachgewiesen:** erster regulärer Lauf `mrun-annika-klose-20260729160408-5293c9ec` am 29.07.2026, 16:04:08–16:04:09 UTC (1 074 ms) aus dem regulären 16:00-`pipeline`-Cron, Status `vollstaendig`, 20/20/20, 0 abgelöst, **Kernfingerabdruck über `id|ko_id|similarity|rank` vorher = nachher = `8a3975a5486fbdbe4790083875cbc1cf`** — kein Score, kein Rang, keine Ergebniskennung verändert. Belege **3 → 20 von 20** (`matched_features`, `begruendung`, `ko_eingabe_hash`), sichtbares Lagefenster dieses Mandanten **3 → 12 von 12**. Gesamtbestand **63 → 80 von 271 (23,2 % → 29,5 %)** — der Rest steigt erst mit den Läufen der übrigen Mandanten (Befunde **B5**/**B6**, je Cron nur ein bis zwei Mandanten). **Vorhersage punktgenau eingetroffen** (projiziert 17 Gewinner, real 17). 290 → 290 Zeilen, nichts gelöscht, 0 laufende/fehlgeschlagene Läufe, 0 Zeilen auf unvollständigem Lauf, `knowledge_object_embeddings` unverändert (772 / `b2b4b7e9…`), **0 KI-Aufrufe / 0,00 USD**, Matching-Sperre sauber freigegeben, keine Fehlergruppe aus dem Matching-Pfad. **Sprint erfolgreich abgeschlossen; Roadmap-Punkt 23 bleibt ⏳ offen**, bis alle Mandanten neu gerechnet sind. Details:
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) Teil D, §34–§40.) ·
(**Sprint 23C auf `main` = `a53e37b` rebasiert — PR #171
enthält jetzt ausschließlich die sichtbare Erklärung.** Die in der ersten Fassung enthaltene
Änderung an `lib/helmut/storage.js` (Aktualitätsfilter) ist inhaltsgleich über den Hotfix
**PR #172** in `main` und wurde beim Rebase **entfernt** — `storage.js` ist jetzt byte-identisch
mit `main`. Verbleibende Funktion: **„Warum für dich relevant?"** in der Vorgangs-Detailansicht —
ein deterministischer Hauptsatz plus zwei bis vier aufklappbare Belege, ausschließlich aus den
bereits persistierten Feldern (`begruendung`, `signale`, ersatzweise `matched_features`).
**0 KI-Aufrufe, 0,00 USD, keine Migration, kein Flag, keine Änderung an Lesepfad, Scores, Rängen
oder `matched_features`.** Ohne Beleg **kein Abschnitt** — kein Ersatztext, keine erfundene
Begründung; technische Felder sind per Weißliste strukturell ausgeschlossen (keine einzige Ziffer).
**Korrektur zur ersten Fassung dieses PR:** dort war der Lesepfadbefund als „latent, kein Nutzer
betroffen" beschrieben — das galt nur vor der Flag-Aktivierung. Mit `HELMUT_MATCHING_AUDIT=on`
und 19 abgelösten Zeilen war er **aktiv** und wurde deshalb getrennt als PR #172 ausgeliefert.
**Merge-Sperre aufgehoben:** Sprint 23B-1 ist mit PR #173 abgeschlossen, der Hotfix ist in `main` —
es bestehen keine fachlichen Vorbedingungen mehr, der Merge ist nur noch eine Freigabeentscheidung.
**PR #171 weiterhin ungemergt.** Roadmap-Punkt 23 bleibt offen. Details:
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) Teil C, §26–§32.) ·
(**HOTFIX Aktualitätsfilter `matching_results` — aktiver
Pilotblocker, nicht mehr latent.** `HELMUT_MATCHING_AUDIT` ist seit dem 29.07.2026 in Production
**aktiv**; der erste Production-Lauf hat **290** `matching_results` erzeugt — **271 `aktuell=true`,
19 `aktuell=false`** (die 19 abgelösten Zeilen gehören zu `annika-klose`). Damit ist der in
Sprint 23C gefundene Lesepfadfehler kein latenter Befund mehr: `listMatchingResults` filterte
nicht auf `aktuell=true`, abgelöste Ergebnisse konnten in der Lage — und mittelbar im
Briefing-Narrativ — als aktuelle Lage erscheinen und aktuelle Vorgänge aus dem Limit verdrängen.
**Behoben als eigener, kleiner Hotfix, getrennt von Sprint 23C:** der Standardlesepfad filtert
serverseitig auf `aktuell=is.true` (vor `limit`, Sortierung `created_at.desc` unverändert),
`includeAbgeloest: true` bleibt als ausdrücklicher Historienzugang erhalten. Keine Zeile gelöscht,
keine Änderung an Matching, Scores, Rängen, `matched_features`, `matching_runs`, Audit-Publikation,
Cron, Understanding, Briefing-Erzeugung, Schema, Migrationen oder Env. **Roadmap-Punkt 23 bleibt
offen**; die sichtbare Nutzererklärung bleibt Sprint 23C (**PR #171 weiterhin ungemergt**, baut
nach diesem Hotfix nur noch auf ihm auf). Tests: neue Suite `matching-aktualitaet-test.js`
**29/29** (Mutationsprobe gegen den unkorrigierten Stand: **7 Fehlschläge** — der Test greift),
Offline-Suite **175/178** gegen **174/177** auf unverändertem `main` (identische 3 Vorbefunde,
Befund E-2), Browser-/Mobile-Smoke **32/32**, Secret-Scan 0 Treffer.) ·
(**Sprint 23B-1 ERFOLGREICH ABGESCHLOSSEN: PR #169 gemergt
(`b1d450c`), Doku-Nachtrag PR #170 gemergt (`5c254c4`), Migration `20260728_matching_audit` in
Production angewendet, `HELMUT_MATCHING_AUDIT` aktiviert, erster Production-Auditlauf und
Idempotenz bewiesen.** Algorithmusunabhängige
Matching-Auditpersistenz: neue append-only Tabelle `matching_runs` (nach Abschluss per Trigger
unveränderlich), 14 additive Spalten auf `matching_results`, getrennte Engine-/Rezept-/Vektorversion,
stabiler Eingabefingerabdruck, Ablösung statt Löschung, Sperre auch im bisher ungesperrten Lage-Pfad,
deterministische Begründung ohne KI. Veröffentlichung ist **eine echte Datenbanktransaktion**
(`helmut_publish_matching_run`, SECURITY INVOKER) plus Riegel, dass `matching_results.run_id`
ausschließlich auf vollständige Läufe zeigen darf — nach Betreibereinwand korrigiert und mit
8 Atomizitätsfällen, einem Mutationstest und erzwungenen Abbrüchen gegen eine echte PostgreSQL
bewiesen. Legacy-Matching fachlich unverändert (253 Vergleiche gegen `main`, 0 Abweichungen).
**Migration am 28.07.2026, 20:20:57 UTC, nach bestätigtem Ruhefenster angewendet:** `matching_runs`
existiert (0 Zeilen), `matching_results` trägt jetzt 23 Spalten (14 additiv, kein Backfill), Bestand
vorher/nachher **byte-identisch** (287 Zeilen, Fingerabdruck `be4670c61235c908559853a6f6fc6c8c`
unverändert, alle `aktuell=true`, alle `run_id=NULL`), 0 Zeilen mit `run_id` auf einem unvollständigen
Lauf, RLS/Grants/Funktionen/Trigger/Indizes vollständig verifiziert, keine Production-Fehler, Rollback
nicht nötig. **`HELMUT_MATCHING_AUDIT` steht seit 28.07.2026, ~20:55 UTC in Vercel (ausschließlich
Production) auf `on`; die Auditpersistenz ist aktiv** — Redeploy `dpl_ChLoTuKztU1B835PfckELKp8doMZ`
(Commit `5c254c4`) `READY` 20:56:48 UTC. **Erster Production-Auditlauf am 29.07.2026,
04:05:07–04:05:08 UTC** (1 041 ms, Mandant `annika-klose`, Auslöser `crawl`,
`mrun-annika-klose-20260729040507-32c822e0`, Status `vollstaendig`, 20 Kandidaten/berechnet/
veröffentlicht, 19 abgelöst, `matching_results` 287 → 290, nichts gelöscht, 251 Fremdzeilen unberührt).
**Idempotenz in Production bewiesen am 29.07.2026, 08:07:20 UTC:** identischer Eingabefingerabdruck →
keine neue Laufzeile, `wiederholungen` 0 → 1, `letzter_lauf_at` gesetzt, `matching_results`
vollständig unverändert. 0 zusätzliche KI-Aufrufe, 0 Production-Fehler. Sprint damit **erfolgreich
abgeschlossen**; Roadmap-Punkt 23 bleibt **offen**, weil 23C (sichtbare Nutzererklärung) fehlt.
Details: [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §21.6 und §25.) ·
(**Sprint 23A erfolgreich abgeschlossen: Matching-Bestand
vollständig verifiziert, Architekturentscheidung für 23B getroffen — Production nur lesend,
keine Produktlogik verändert. Kernbefund: `matching_results` speichert je Mandant×Vorgang
GENAU EINE Zeile, wird bei jedem Lauf überschrieben, kennt weder Lauf-ID noch Profil-/
Vorgangsstand noch Rezeptversion; `created_at` friert beim ERSTEN Auftreten ein — alte
Ergebnisse sind nicht reproduzierbar, Briefings verweisen auf kein Ergebnis. Kanonisch:**
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md)) · (**Sprint 22C1 erfolgreich abgeschlossen: PR #165 gemergt,
Shadow-Migration in Production angewendet, RLS/Zugriffsschutz verifiziert, alle 772 berechtigten
Wissensobjekte semantisch eingebettet — 0 Fehler, 0 Wiederholungen, 17 API-Aufrufe, ≈0,0022 USD,
Canary 56/56, Wiederaufnahme und Idempotenz (0 Aufrufe/0 Writes) in Production bewiesen, Matching/
Briefings/Crawl nachweislich unverändert; Embeddings bleiben vollständig im Shadow-Betrieb** ·
**Sprint 22B: externer Testlauf ausgeführt und
Qualitätsvergleich vorliegend — semantisches Embedding (Azure `text-embedding-3-small`)
schlägt den Legacy-Merkmalsvektor deutlich (Top-5 38/38 vs. 33/38, mittlerer Rang 1,2
vs. 4,4, praktikabler Einzelschwellenwert bei 0,75–0,80: Präzision 1,00/Trefferquote
0,95); erfolgreich abgeschlossen als Analyse-Sprint, Production-Umsetzung bleibt
freigabepflichtig (§11 der Architekturdoku)** · **Sprint 22A: Embedding-Architektur bewiesen —
das „embedding" ist ein deterministischer Merkmalsvektor, kein semantisches Embedding;
Datenvertrag + Shadow-Entwurf liegen vor, keine Production-Änderung** ·
**OP-01-Sprint: Production-Sicherung und isolierter
Rückweg bewiesen — teilweise abgeschlossen, nur die Pro/PITR-Tarifentscheidung steht aus** ·
**Sprint 21 Hauptlauf: vollständiger Production-Schreiblauf
Umfang B ausgeführt — 728 von 728 Objekten korrigiert, 0 Fehler, 0 Kollisionen, Idempotenz 0,
OP-24 inhaltlich erledigt** · **Sprint 21 Stufe 1: kontrollierter Production-Probelauf
über 12 Objekte erfolgreich ausgeführt** ·
**Sprint 21: Altbestand kontrolliert nachklassifizieren
(OP-24) — technisch vorbereitet, PR #156 gemergt und ausgerollt** · **Sprint 20: Geografie
dauerhaft und nachvollziehbar speichern** (gemergt, #155) · **Sprint 19: politische Ebene dauerhaft speichern** (gemergt, #154) ·
Reparatursprint Vorgangsbildung B4 · Berliner Beweislauf und
Rollback · lesender Production-Nachweis zu #143 · Qualitätssprint · Stabilisierungssprint
Pipeline-Zeitbudget · Phase-1-Punkt 18: wiederholbare Paket-Inventur ·
CSD-Production-Nachweis Anlauf 2: ausgeführt und gescheitert, Befund B4-3 ·
Hotfix B4-3: Beweisfamilien im Resolver (gemergt, #147) ·
Hotfix B4-4: Herausgebernamen stiften keine Vorgangsidentität (gemergt, #149) ·
B4-4 in Production nachgewiesen (gemergt, #150) ·
**B4-4-/CSD-Production-Nachweis abgeschlossen — beide Restdokumente verstanden** ·
Werkzeug-Härtung W-1+W-2 gemergt (#152) · **W-2 erfolgreich abgeschlossen:
Migration `20260727` angewendet, Flag aktiv, echter Production-Lauf
`crawl-20260727160048-ct8lt` relational gespeichert und erhalten — alle 15
Erfolgskriterien erfüllt**) ·
**`main`-HEAD:** `e1b7a7e` (Merge #175 = Doku-Nachtrag zum Production-Nachweis von Sprint 23C-2A;
reine Dokumentation, kein Code). Davor `bb539b1` (Merge #174 = Sprint 23C-2A, Erklärungsabdeckung; in Production ausgerollt — Deployment `dpl_7NwHyiwYuECi4y2RXaoRQCCmjdo5`, `target: production`, `READY` 2026-07-29 12:19:17 UTC. Davor `387b1a5` (Merge #171 = Sprint 23C, sichtbare Relevanzerklärung; in Production
ausgerollt — Deployment `dpl_4tyHsdwjCYEHwGMz6zAAcsAvMmUC`, `target: production`, `READY`,
am 2026-07-29 rein lesend geprüft. Davor `a53e37b` = Merge #173, `24b436e` = Merge #172 = Hotfix
Aktualitätsfilter, `5c254c4` = Merge #170 = Doku-Nachtrag zur angewendeten Migration; davor `b1d450c` =
Merge #169 = Sprint 23B-1, Matching-Auditpersistenz, `53893fa` = Merge #168 = Sprint-23A-Dokumentation,
`5528fd8` = Merge #167, `51a533d` = Merge #166, in Production ausgerollt — Deployment
`dpl_ChLoTuKztU1B835PfckELKp8doMZ` (Redeploy von `dpl_7kag3HkqK61KTRAu2y9jBUFhxBo1`) `READY`
2026-07-28, 20:56:48 UTC, `target: production`; dieser Redeploy trägt zugleich
`HELMUT_MATCHING_AUDIT=on`)

> **Sprint 23C-2A am 2026-07-29 ausgeführt — ERFOLGREICH ABGESCHLOSSEN (offline bewiesen, gemergt,
> ausgerollt und in Production am ersten regulären Lauf nachgewiesen).**
> *Der Zustand „teilweise abgeschlossen" galt bis 16:04 UTC und wurde durch den Production-Beweislauf
> abgelöst — siehe Nachtrag unten.*
> **Startprüfung:** Arbeitsbaum sauber, Branch `claude/matching-explanation-coverage-cnzjgy` auf
> `origin/main` = `387b1a5`. **PR #171 ist in `main`** (Merge-Commit `387b1a5`), das zugehörige
> **Production-Deployment `dpl_4tyHsdwjCYEHwGMz6zAAcsAvMmUC` ist `READY`** (`target: production`,
> Commit `387b1a5`) — beide Startbedingungen erfüllt. Bestand gegengemessen (rein lesend):
> **271** aktuelle `matching_results` über **7** Mandanten, **63** mit Beleg, **208** ohne —
> exakt die Ausgangsmessung des Sprintauftrags.
>
> **Der Fehler (M-7), in einem Satz:** die Vektorsuche läuft über **alle 1 702** Wissensobjekte,
> die Merkmalsauflösung danach lud aber nur ein Fenster der **200 zuletzt geänderten**
> (`listKnowledgeObjects({limit:200})`, `matching.js:461`). Jeder Treffer außerhalb dieses
> Fensters wurde gegen ein **leeres Objekt** ausgewertet und blieb ohne `matched_features`,
> `signale` und `begruendung` — obwohl Ausschuss, Partei, Wahlkreis und Schwerpunkt tatsächlich
> übereinstimmten. Der Verlust entstand im **Schreibpfad**, nicht in der Anzeige; die Oberfläche
> aus PR #171 hat immer korrekt gearbeitet.
>
> **Geliefert (zwei Produktionsdateien, additiv):** **(1)** neuer, gebündelter Lesezugriff
> `storage.listKnowledgeObjectsByIds(ids)` — **eine** PostgREST-Anfrage je 100 Kennungen
> (`id=in.(…)`), bei der produktiven Trefferzahl 20 also genau **eine**; dieselbe Leseprojektion
> wie bisher; dedupliziert und byte-stabil sortiert (deterministisch); **mandantenneutral**
> (`knowledge_objects` trägt kein `user_id` — die Mandantengrenze liegt eine Ebene höher und
> bleibt unverändert); **fail closed und laut** (ein echter Lesefehler wirft `StorageReadError`,
> statt still als „nichts gefunden" zu erscheinen — genau diese Verwechslung **ist** M-7).
> **(2)** `matching.js` lädt die Trefferobjekte über ihre Kennungen statt über das Fenster.
> Die Änderung liegt **hinter** der Trefferbestimmung und **vor** der Ergebnisprojektion: sie
> liest, sie wählt nicht aus, sie bewertet nicht neu.
>
> **Warum kein größeres Limit:** `listKnowledgeObjects` liefert die zuletzt **geänderten**
> Objekte, die Trefferliste folgt der **Ähnlichkeit** — beide Ordnungen sind unabhängig. Jedes
> feste N ist nur eine Wette auf zufällige Überlappung, sie wird mit jedem neuen Wissensobjekt
> unwahrscheinlicher und bricht **still**. Ein Fenster von 2 000 wäre zudem in die bekannte
> stille 1 000-Zeilen-Kappung von PostgREST gelaufen (Nebenbefund W-1) und hätte die zehnfache
> Lesemenge verursacht. Das Laden nach Kennung ist das einzige konstruktionsbedingt korrekte
> **und** zugleich das billigste Verfahren: **20 statt 200** gelesene Zeilen je Lauf.
>
> **Versionsentscheidung — bewusst KEINE Anhebung.** Der Eingabefingerabdruck trägt je Kandidat
> `id | Ähnlichkeit | ko_eingabe_hash`. Für einen Treffer außerhalb des Fensters war dieser Hash
> `null`, nach der Behebung ist er echt: der Fingerabdruck ändert sich damit **von allein und
> exakt bei den betroffenen Läufen**, der bestehende Idempotenzriegel lässt dort genau eine neue
> Generation zu. Läufe, deren Treffer schon im Fenster lagen, behalten ihren Fingerabdruck und
> bleiben idempotent. Eine Versionsanhebung hätte dagegen **jeden** Lauf **jedes** Mandanten neu
> erzeugt und außerdem etwas Falsches behauptet: Rezept, Engine und Vektor rechnen exakt wie
> vorher — sie bekommen nur endlich ihren tatsächlichen Eingang zu sehen.
>
> **Tests:** neue Suite `matching-erklaerungsabdeckung-test.js` **60/60** (Abschnitte: Fehler +
> Gegenprobe · Unveränderlichkeit von Scores/Rängen/Kennungen · Bündelung ohne N+1 · **11
> Prüfungen gegen ein echtes lokales PostgREST-Doppel**, inkl. 150 Kennungen → 2 Anfragen und
> HTTP 500 → `StorageReadError` · Fail-closed · Mandantengrenze · 0 KI · Fingerabdruck und
> Idempotenz · Oberfläche ohne UI-Änderung · Mutation). **Offline-Suite 180/180** gegen eine
> Ausgangsmessung von **179/179** auf unverändertem Stand · **Browser-/Mobile-Smoke 32/32** ·
> **externe Mutationsprobe:** der Schreibpfad wurde testweise auf die alte 200er-Zeile
> zurückgesetzt — die neue Suite meldet dann **11 Fehlschläge** und Exit-Code 1, während
> Abschnitt B (Scores/Ränge) korrekt grün bleibt. Danach Mutation entfernt und erneut grün.
> **CI-Gate grün:** beide Pflicht-Checks — `Syntax + Offline-Suiten` und
> `Browser-/Mobile-Smoke (Chromium)`, Lauf `30450796962` auf `4626767`.
>
> **Rein lesende Restanalyse (`scripts/matching-erklaerungsluecke-analyse.js`, schreibt nichts):**
> von den 208 unbelegten Zeilen gewinnen **128** einen Beleg, **80** bleiben ehrlich leer →
> erwartete Abdeckung **191/271 = 70,5 %**; im sichtbaren 12er-Lagefenster **46 → 71 von 84
> (54,8 % → 84,5 %)**, für jeden Mandanten mit gepflegtem Profil **11–12 von 12**.
> Die 80 zerfallen in: **20** bei einem Mandanten mit Platzhalterprofil (kein Beleg möglich,
> Befund **M-9**), **7** Wissensobjekte ohne eigene Merkmale, **73** mit beidseitigen, aber
> wirklich nicht überschneidenden Merkmalen. **40 der 80 tragen eine Ähnlichkeit ≤ 0**
> (min −0,0735) auf den Rängen **1–20** — sie stehen nur im Ergebnis, weil die RPC die Top-N
> **unbedingt** liefert (Befund **M-8**); die übrigen 40 werden ausschließlich von
> Wortüberschneidung getragen. Geprüft und **ohne Treffer**: namentliche Erwähnung (0),
> betroffene Geografie (0), erwähnte Geografie (0) — es gibt in diesem Rest **keine billige
> zweite Ernte**.
>
> **Produktempfehlung: KEIN Erklärbarkeits-Gate**, unbelegte Treffer sichtbar lassen (= der
> heutige, in PR #171 umgesetzte Zustand: ohne Beleg kein Abschnitt, kein Ersatztext). Ein Gate
> entfernte bei gepflegten Profilen genau **einen** Vorgang, leerte beim Platzhalterprofil die
> Lage aber **vollständig** — und es verstecke M-8, statt ihn zu beheben. Reihenfolge stattdessen:
> diesen Fix ausrollen → Profilpflege/OP-04 → Schwellenwert für die RPC (eigener,
> freigabepflichtiger Sprint, verändert Kandidaten und Ränge) → semantisches Matching (22C2).
>
> **Nicht angefasst:** `knowledge_object_embeddings`, semantisches Matching, Briefing-Logik,
> Cron, Budgets, Flags, Schema, Migrationen, `client.js`/`styles.css`, Lesepfad,
> `matching-audit.js`/`matching-contract.js`/`matching-begruendung.js`/`matching-erklaerung.js`.
> **Kein Production-Write, keine Migration, kein Deployment, kein Merge, keine Neuberechnung.**
> Kanonisch: [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) Teil D (§34–§40).

> **Nachtrag 2026-07-29, 16:04 UTC — Production-Beweislauf erbracht. SPRINT 23C-2A ERFOLGREICH
> ABGESCHLOSSEN.**
> **Deployment:** `dpl_7NwHyiwYuECi4y2RXaoRQCCmjdo5` (Commit `bb539b1`, Merge #174), `target: production`,
> **`READY` 12:19:17 UTC**.
> **Erster regulärer Lauf mit korrigiertem Code:** `mrun-annika-klose-20260729160408-5293c9ec`,
> 16:04:08.392 → 16:04:09.466 UTC (**1 074 ms**), ausgelöst vom regulären `/api/cron/pipeline` um 16:00 UTC
> (`crawl-20260729160012-x0ni0`) — **kein manueller Lauf**. Status `vollstaendig`, `fehler=NULL`,
> Kandidaten/berechnet/veröffentlicht **20/20/20**, **0 abgelöst** (dieselben Wissensobjekte erneut getroffen),
> Versionsachsen `legacy-shadow-1`/`legacy_relevance_v1`/`feature-hash-256-v1` **unverändert**,
> Eingabefingerabdruck `cb3b436a…` statt `d396c545…` — **genau der vorhergesagte Mechanismus**: der Hash ändert
> sich von allein, weil `ko_eingabe_hash` von `null` auf einen echten Wert wechselt, ganz ohne Versionsanhebung.
> **Unverändert, hart gegengemessen:** Kernfingerabdruck über `id|knowledge_object_id|similarity|rank` vorher und
> nachher **identisch** (`8a3975a5486fbdbe4790083875cbc1cf`), Ränge **1–20 lückenlos**. Kein Score, kein Rang,
> keine Ergebniskennung verändert.
> **Hinzugekommen:** `matched_features` **3 → 20 von 20**, `begruendung` **3 → 20**, `ko_eingabe_hash` **3 → 20**;
> `signale` trägt jetzt neben `legacy_vektor` die politischen Schlüssel. Rang 1 stand vorher **unbelegt** an
> erster Stelle der Lage und trägt jetzt „Betrifft deinen Ausschuss Gesundheit und deinen Schwerpunkt Pflege." —
> bei identischem Rang und identischer Ähnlichkeit.
> **Abdeckung:** betroffener Mandant **15,0 % → 100 %**, dessen sichtbares 12er-Lagefenster **3 → 12 von 12**,
> Gesamtbestand **63 → 80 von 271 (23,2 % → 29,5 %)**. **Die Vorhersage traf punktgenau:** die lesende Analyse
> hatte für diesen Mandanten 17 Gewinner projiziert, real wurden es **genau 17**. Das stützt die Projektion
> **191/271 (70,5 %)** für den Endstand.
> **Warum erst 29,5 % — ehrlich benannt:** der 16:00-Cron erreichte **genau einen** Mandanten. Ursache sind die
> bekannten Befunde **B5** (280-s-Zeitlimit) und **B6** (kein Einzelmandanten-Einstieg), nicht dieser Sprint. Die
> Abdeckung steigt über die kommenden regulären Läufe (04:00 · 10:00 · 16:00 · 20:00 UTC), nicht auf einen Schlag.
> **Invarianten:** `matching_results` **290 → 290** (nichts gelöscht), `aktuell` 271 / `abgeloest` 19 unverändert,
> 0 abgelöste Zeilen ohne `abgeloest_am`, **0 laufende**, **0 fehlgeschlagene** Läufe, **0 Ergebniszeilen auf
> unvollständigem Lauf**, `knowledge_object_embeddings` **772 / `b2b4b7e9ab312749e4584f9d060374d2` identisch**,
> `llm_usage` **0 Aufrufe / 0,000000 USD**.
> **Logs und Sperren:** 9 Vercel-Fehlergruppen seit dem Deployment, **alle bekannte Bestandsklassen**
> (Google-News-Timeouts/503, OpenAI-Understanding-Timeouts) — **keine** aus dem Matching-Pfad. Postgres im
> Laufzeitfenster: 2 Einträge, beide reguläre `LOG checkpoint`, **0 `ERROR`** (die 11 `ERROR` im 24-h-Fenster
> stammen ausnahmslos aus eigenen lesenden Probeabfragen dieser Sitzung). **Keine `matching-<mandant>`-Sperre
> mehr vorhanden** — sauber freigegeben; verbleibend nur zwei Crawl-/Understanding-Sperren im regulären TTL.
> **Nicht getan:** kein manueller Lauf, keine Migration, kein Flag, keine Cron-Änderung, keine Neuberechnung,
> keine Production-Datenänderung. **M-8 unangetastet.**
> **Roadmap-Punkt 23 bleibt ⏳ offen**, bis die übrigen sechs Mandanten ebenfalls gelaufen sind und die Abdeckung
> über alle Mandanten nachgemessen ist. Kanonisch:
> [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §41.

> **Sprint 23B-1 am 2026-07-28/29 ausgeführt — ERFOLGREICH ABGESCHLOSSEN (Umsetzung offline
> bewiesen; alle drei Freigabegates einzeln erteilt und ausgeführt: Merge → Migration →
> Aktivierung; Production-Abnahme inklusive Idempotenznachweis erbracht).**
> *Der Zustand „teilweise abgeschlossen" galt bis zum 29.07.2026 und wurde durch den
> Production-Beweislauf abgelöst — siehe Nachtrag 2026-07-29 unten.*
> **Startprüfung vollständig:** Arbeitsbaum sauber, Branch `claude/matching-audit-persistence-lw4vab`
> auf `origin/main` = `53893fa`, **PR #166 in `main`**, **Sprint 23A in `main`** (alle drei
> Nachweise vorhanden: `matching-nachvollziehbarkeit.md`, Abschlussstatus hier, Roadmap-Punkt 23
> auf ⏳). *Erster Anlauf dieses Threads wurde am Start Gate gestoppt, weil 23A noch nicht gemergt
> war — nach dem Merge von **PR #168** wurde das Gate erneut und vollständig durchlaufen.*
> **Konfliktprüfung:** 9 offene PRs (#159, #148, #132, #117, #115, #112, #111, #88, #70) —
> unverändertes Bild gegenüber 23A, kein PR angefasst. Einzige fachliche Berührung bleibt **#112**
> (Onboarding verändert, *wie* Mandatsprofile entstehen); **aufgelöst statt umgangen**: der
> Profilhash kommt aus `matching.profileHash(profile)` und hängt ausschließlich an den
> Profilmerkmalen, **nicht** an der Herkunft (Blob vs. SQL) — die Reihenfolge der beiden PRs ist
> damit gleichgültig. Kein Konflikt, der eine sichere additive Umsetzung verhindert.
>
> **Geliefert (additiv, Production nur gelesen — genauer: in diesem Sprint gar nicht angefasst):**
> **(1)** Migration `supabase/migrations/20260728_matching_audit.sql` + vollständiges Rollback:
> neue Tabelle **`matching_runs`** (append-only, FK auf `profiles` mit `ON DELETE CASCADE`,
> Trigger `helmut_matching_run_immutable` friert einen `vollstaendig`-Lauf fachlich ein — nur
> `wiederholungen`/`letzter_lauf_at`/`wiederaufnahme_am`/`fehler` bleiben fortschreibbar),
> **14 additive Spalten** auf `matching_results` (alle NULL-fähig, **kein Backfill**), echter
> eindeutiger Index `(user_id, knowledge_object_id)` (Codekonvention wird zur DB-Zusicherung;
> Production hat 0 Duplikate, Vorabprüfung im Runbook), **Teilindex
> `(user_id, eingabe_fingerabdruck) where status='vollstaendig'`** = datenbankseitig erzwungene
> Idempotenz, RLS aktiv, **keine `SECURITY DEFINER`-Funktion**. **(2)** Drei kleine Module:
> `matching-contract.js` (kanonische Serialisierung, Eingabehash je Wissensobjekt,
> Eingabefingerabdruck, deterministische Rangliste mit byte-stabiler Tie-Break-Regel — bewusst
> **kein** `localeCompare`), `matching-audit.js` (**algorithmusunabhängige** Audit-Schnittstelle:
> Sperre, Idempotenz, Laufzeile, Veröffentlichung, Fehlerzustand — kennt kein Matching-Verfahren
> und keine Embeddings), `matching-begruendung.js` (deterministische Kurzbegründung, **0 KI**,
> max. 2 Gründe, Priorität Ausschuss → Thema → Wahlkreis → Partei, **ohne Beleg `null`**).
> **(3)** Anbindung des Legacy-Matchings hinter der Rollout-Grenze **`HELMUT_MATCHING_AUDIT`
> (Default AUS)**: aus = kein Zugriff auf `matching_runs`, keine Sperre, keine Audit-Spalten,
> keine neue Fehlerquelle, byte-identische Zeilen. An = ein Lauf wird protokolliert, ein
> **identischer** Zweitlauf schreibt **0 Ergebniszeilen statt bisher 20 wirkungsloser UPDATEs**
> (die Schreiblast sinkt), aus der Trefferliste gefallene Zeilen werden `aktuell=false` **statt
> gelöscht**, und der bisher **ungesperrte Lage-Pfad** nimmt dieselbe Sperre `matching-<mandant>`
> wie der Crawl-Pfad (bestehende `pipeline_locks`, kein zweites Sperrsystem).
>
> **NACHSCHÄRFUNG nach Betreibereinwand (2026-07-28, nach dem ersten CI-Durchlauf):**
> Der erste Entwurf veröffentlichte in **drei aufeinanderfolgenden Schreibvorgängen**
> (Projektion → Ablösung → Laufabschluss) und begründete das damit, dass der Abschluss
> zuletzt komme. Das war die **falsche Invariante**: `matching_results` wird per Upsert
> **in place** überschrieben — ein Abbruch dazwischen ersetzte die operative Projektion,
> ließ den Lauf aber `laufend`/`fehlgeschlagen` und hinterließ damit Ergebniszeilen, die
> auf einen unvollständigen Lauf zeigten. **Der letzte vollständige Stand war in diesem
> Fall verloren, nicht erhalten.** Der frühere Abschlussbericht hat das als „ehrliche
> Restgrenze" verharmlost — das war falsch.
> **Korrigiert:** Laufabschluss, Ergebnisprojektion und Ablösung sind jetzt **ein
> Aufruf und damit eine Transaktion** — `helmut_publish_matching_run`, **SECURITY
> INVOKER** (keine neue privilegierte Fläche, nur eine Transaktionsgrenze), mit
> Mandanten- und Zustandsprüfung unter Zeilensperre, Prüfung **jeder** Ergebniszeile,
> festem `search_path`, `grant execute` nur für `service_role` und einem
> `pg_advisory_xact_lock` je Mandant. Zusätzlich der Trigger
> **`matching_results_run_complete`**: eine Ergebniszeile mit `run_id` darf
> **ausschließlich** auf einen `vollstaendig`-Lauf verweisen — datenbankseitig
> erzwungen, nicht bloß im Code zugesichert. Nur ein `laufend`-Lauf ist
> veröffentlichbar; ein vollständiger kann nicht erneut, ein fehlgeschlagener nicht
> wiederbelebt werden.
>
> **Bewiesene Zusicherungen (offline, In-Memory-Nachbildung inkl. Teilindex und Trigger):**
> Idempotenz · Historisierung bei Profil-, Vorgangs- und Rezeptwechsel · Unveränderlichkeit
> abgeschlossener Läufe · `partial`/`failed` ersetzen den letzten vollständigen Stand nie ·
> Parallelität (gleiches Profil abgewiesen, verschiedene Profile parallel) · Ablehnung fremder
> Mandanten/Profile mit `CROSS_TENANT_WRITE` · RLS/Grants statisch · **Abbruch vor der
> Veröffentlichung lässt den bisherigen Stand byte-identisch** · Reihenfolgeunabhängigkeit ·
> Begründungsdeterminismus · keine Begründung ohne Beleg · Semantiktrennung.
> **Legacy-Stabilität gegengeprüft gegen unverändertes `origin/main` in einem eigenen Worktree:
> 253 Vergleiche (Merkmalsvektoren, Kosinuswerte, Ranking, `matched_features`, geschriebene
> Ergebniszeilen, Rückgabewert; 60 Wissensobjekte, 4 Grenzwerte, 4 Filterkombinationen) —
> 0 Abweichungen.**
> **Atomizität bewiesen:** **A1–A8** decken Abbruch vor / während / nach der
> Ergebnisschreibung, Fehler beim Laufabschluss, parallele Veröffentlichung desselben
> Profils, „nach jedem Fehler bleibt die vorherige vollständige Generation aktuell",
> „keine Zeile verweist auf laufend/fehlgeschlagen" und die konsistente Veröffentlichung
> ab. **Mutationstest als Gegenprobe:** wird im Datenbank-Doppel das Rollback der
> Projektion entfernt — also das alte, nicht-atomare Design nachgebaut —, schlagen
> **10** Prüfungen fehl (mit Gegenbeispiel); mit der Korrektur **0**. Die Tests sind
> damit nachweislich wirksam und nicht bloß grün.
> **Gegen eine echte PostgreSQL erzwungen:** ein Abbruch **mitten** in der
> Veröffentlichung (FK-Verletzung bei der zweiten Zeile) lässt die Projektion
> **byte-identisch** zurück (`similarity` unverändert, `run_id` unverändert) und den
> neuen Lauf auf `laufend`; der Riegel lehnt eine Zeile auf einen laufenden Lauf ab;
> vier Mandanten-/Zustandsverstöße werden abgelehnt; zwei **gleichzeitige** Prozesse
> werden vom Advisory-Lock serialisiert; Endzustand **0 Invariantenverletzungen**.
> **Tests:** neue Suite `matching-audit-test.js` **178/178** · **Offline-Suite 177/177** ·
> Gegenbeweis auf unverändertem `main` **176/176** · Legacy-Gegenbeweis erneut **253
> identisch, 0 abweichend** · **CI-Gate grün: beide Pflicht-Checks** (Lauf `30392456786`
> auf dem Korrekturstand `69d8eda`).
> **Die Migration wurde nicht nur statisch geprüft, sondern in einer isolierten lokalen
> PostgreSQL wirklich angewendet:** leere Struktur ✅, zweiter Lauf derselben Migration ✅,
> Bestand mit 246 Ergebniszeilen **byte-identisch vorher/nachher** (alle 14 neuen Spalten leer,
> `aktuell` überall `true`), **11** Constraint-/Trigger-Prüfungen (abgeschlossener Lauf
> unveränderlich, zweiter vollständiger Lauf mit gleichem Fingerabdruck abgelehnt, laufender
> Lauf erlaubt, `partial` als Status abgelehnt, Ablösung ohne Löschung, DSGVO-Kaskade), **9**
> RLS-Rollenprüfungen mit echten Rollen (Mandant A sieht nur eigene Läufe, Kreuzprobe, ohne
> Claim nichts, `authenticated` darf weder schreiben noch truncaten, `anon` gar nichts, Eigner
> sieht alles = die ehrlich benannte `service_role`-Analogie), **Duplikat → fail-closed ohne
> Halbzustand**, **Rollback vollständig** (23 → 9 Spalten, Daten unverändert) und danach erneut
> anwendbar. Details: §23.1 der Doku. Zwei sprintbedingte Testpflege-Änderungen dokumentiert: D7-Datumsriegel in
> `geografie-gedaechtnis-test` nimmt die geografiefreie Auditmigration namentlich aus,
> `env-inventar.md` um `HELMUT_MATCHING_AUDIT` ergänzt.
>
> **Gemessene Größen (statt geschätzt):** Laufzeile **8 070 B roh / ~2 539 B komprimiert**
> (Faktor 4,4), Zusatz je Ergebniszeile **713 B**; **10 Profile ≈ 28 MB/Jahr**, **100 Profile
> ≈ 278 MB/Jahr** (dann Retention nötig — eigener Schritt). **Zusätzliche KI-Kosten: 0,00 USD.**
> *Korrektur zu 23A §10.5: dort waren 1,5–2,0 kB je Laufzeile geschätzt; real ist es mehr, weil
> die umgesetzte Rangliste `result_id`, `ko_eingabe_hash`, `signale` und `begruendung` trägt.*
>
> **Bewusst NICHT umgesetzt (je mit Begründung in §22 der Doku):** Briefing-Historisierung
> (→ 23B-2) · sichtbare Nutzererklärung (→ 23C) · semantische Produktfunktion (→ 22C2) ·
> `HELMUT_SCORING_MODE` unverändert · Spalten für fachlichen/geografischen/institutionellen
> Teilscore (existieren im Rezept nicht — kein falsches Grün) · `ausschlussgruende` (die RPC
> verwirft keinen Kandidaten, die Spalte wäre dauerhaft leer; **Abweichung von 23A §10.3,
> begründet**) · NOT-NULL-Verschärfung (braucht eigenen Production-Beweis) · **Revoke der
> `TRUNCATE`-Rechte (Befund M-6) — eigener Security-Sprint**, weil es eine Rechteänderung in
> Production ist und `listMatchingResults` im Tenant-JWT-Modus als `authenticated` liest.
> **Neuer Befund M-7:** `runMatchingShadow` lädt für die `matched_features` nur ein Fenster von
> 200 Wissensobjekten — das ist die wahrscheinlichste Erklärung für die 78,4 % leeren
> `matched_features`. **Nicht behoben**, weil eine Änderung das fachliche Ergebnis veränderte;
> die Auditpersistenz geht damit ehrlich um (`ko_eingabe_hash` bleibt dann `null`).
>
> **Bei Sprintbeginn galt: Kein Production-Write, keine Migration angewendet, kein KI-Aufruf, kein
> Flag/Cron/Secret/Vercel-Variable verändert, keine Nutzeroberfläche berührt, kein fremder PR
> angefasst, kein Merge.** Gate 1 (Merge) und Gate 2 (Migration) sind seither ausgeführt — siehe
> den nachfolgenden Nachtrag. **Kanonisch:**
> [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) Teil B (§14–§24).

> **Nachtrag 2026-07-28: PR #169 gemergt, Migration in Production angewendet und verifiziert —
> weiterhin TEILWEISE ABGESCHLOSSEN (Gate 3 offen).**
> **Gate 1 erfüllt:** `main`-HEAD ist jetzt `b1d450c` (Merge #169). **Gate 2 erfüllt:** die Migration
> `20260728_matching_audit.sql` wurde nach ausdrücklicher Freigabe am **28.07.2026, 20:20:57 UTC**
> in Production angewendet — erst nachdem die Vorprüfung ein bestätigtes Ruhefenster zeigte (ein
> erster Anlauf um 20:09 UTC wurde verworfen, weil die Sperren `crawl-cem-ince` und
> `global-understanding` aus dem laufenden 20:00-UTC-Cron noch aktiv waren; erneute Prüfung um
> 20:19:30 UTC: 0 Sperren, 0 laufende Fremdprozesse).
> **Ergebnis, vollständig gegengemessen:** `matching_runs` existiert jetzt in Production (**0
> Zeilen** — der Auditpfad ist inaktiv, es wurde nichts hineingeschrieben); `matching_results` trägt
> jetzt **23 Spalten** (9 bestehende + **14 additive, ohne Backfill**). Bestand vorher **287** Zeilen
> mit Fingerabdruck `be4670c61235c908559853a6f6fc6c8c`, danach **weiterhin 287** Zeilen mit
> **exakt demselben** Fingerabdruck — **byte-identisch**. Alle 287 bestehenden Ergebnisse tragen
> weiterhin `aktuell=true` und `run_id=NULL`. Harte Invariante geprüft: **0** Ergebniszeilen
> verweisen auf einen unvollständigen Lauf. **RLS, Grants, Funktionen, Trigger und Indizes
> vollständig verifiziert:** RLS auf `matching_runs` aktiv mit genau einer Policy
> (`matching_runs_tenant_read`, `SELECT`, `authenticated`); `anon` besitzt **keinen** Zugriff;
> `authenticated` besitzt **ausschließlich `SELECT`** auf eigene Läufe; `service_role` besitzt die
> vorgesehenen vollen Rechte (App-seitig durchgesetzt, nicht durch RLS — `service_role` umgeht RLS
> konstruktionsbedingt). Alle **drei** neuen Funktionen sind **`SECURITY INVOKER`**;
> `helmut_publish_matching_run` ist **ausschließlich für `postgres` und `service_role`**
> ausführbar. Die Production-Logs im Migrationsfenster zeigen **keine Fehler** (nur reguläre
> `LOG`-Einträge); der Security-Advisor meldet nach der Migration dieselben 19 Bestandsbefunde wie
> vorher — `matching_runs` erzeugt **keinen** neuen Befund. **Rollback wurde nicht ausgeführt und
> ist nicht notwendig** — alle Verifikationen bestanden.
> **`HELMUT_MATCHING_AUDIT` existiert weiterhin nicht in Vercel** (vom Betreiber bestätigt) und
> wurde in diesem Schritt **nicht** gesetzt — die Auditpersistenz ist damit **weiterhin nicht
> aktiv**. Keine Vercel-Variable verändert, kein Matching-Lauf manuell gestartet, keine weitere
> Migration ausgeführt, keine Briefing-Logik, keine Scores/Rankings/Kandidaten/`matched_features`,
> `knowledge_object_embeddings` unverändert.
> **Sprint 23B-1 bleibt teilweise abgeschlossen**, bis Gate 3 (Flag-Freigabe) erteilt und ein
> kontrollierter Production-Beweislauf samt Idempotenz-Zweitlauf gefahren ist. Roadmap-**Punkt 23
> bleibt offen/in Arbeit**. Briefing-Historisierung bleibt **Sprint 23B-2**, die sichtbare
> Nutzererklärung bleibt **Sprint 23C**, der Befund zum 200er-Wissensobjekt-Ladefenster (M-7)
> bleibt unverändert außerhalb dieses Sprints. Vollständiger Nachweis:
> [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §21.6.
> *(Stand 2026-07-28. Die Aussagen zum Flag und zum Sprintzustand sind durch den Nachtrag
> 2026-07-29 überholt — Doku-Nachtrag wurde als **PR #170** gemergt, CI-Gate grün, Lauf
> `30397010300`.)*

> **Nachtrag 2026-07-29 — Gate 3 erteilt und ausgeführt: `HELMUT_MATCHING_AUDIT` aktiv,
> erster Production-Auditlauf und Idempotenz bewiesen. SPRINT 23B-1 ERFOLGREICH ABGESCHLOSSEN.**
> **Aktivierung:** `HELMUT_MATCHING_AUDIT` am 28.07.2026, ~20:55 UTC in Vercel **ausschließlich für
> Production** auf den Wert **`on`** gesetzt (`isFlagOn` akzeptiert `1|true|on|yes`;
> `matchingAuditEnabled()` liest direkt `process.env`, `helmut-flags.json` ist nicht beteiligt —
> das Flag steht nicht in `FILE_FLAG_ALLOWLIST`). Wirksam mit Redeploy
> `dpl_ChLoTuKztU1B835PfckELKp8doMZ` (Commit `5c254c4`, Redeploy von `dpl_7kag3HkqK61KTRAu2y9jBUFhxBo1`),
> `READY` 20:56:48 UTC, keine Build-Fehler. Prüfungen unmittelbar danach: `matching_runs` 0 Zeilen,
> `matching_results` 287 Zeilen, 0 Zeilen auf unvollständigem Lauf, Fingerabdruck
> `be4670c61235c908559853a6f6fc6c8c` unverändert.
> **Erster Auditlauf (29.07.2026, 04:05:07–04:05:08 UTC, 1 041 ms):** ausgelöst vom regulären
> `/api/cron/crawl` (04:01:08 UTC), **kein manueller Lauf**. Lauf
> `mrun-annika-klose-20260729040507-32c822e0`, Mandant `annika-klose`, `ausloeser='crawl'`,
> `pipeline_run_id='crawl-20260729040110-0zay2'`, Status `vollstaendig`, Versionsachsen
> `legacy-shadow-1` / `legacy_relevance_v1` / `feature-hash-256-v1`, `kandidaten`=`berechnet`=
> `veroeffentlicht`=20, `abgeloest`=19, `fehler=NULL`. `matching_results` **287 → 290**
> (17 wiederverwendet, 3 neu, 19 abgelöst) — **nichts gelöscht**, alle abgelösten Zeilen mit
> `abgeloest_am`. Invarianten: 0 Läufe `laufend`, 0 `fehlgeschlagen`, 0 vollständige Läufe ohne
> `beendet_am`, 0 Ergebniszeilen auf unvollständigem Lauf, 0 Sperrenreste, Lauf-`ergebnis`
> deckungsgleich mit der Projektion (20/20 bei `result_id`+`rank`+`similarity`).
> **Legacy unverändert:** Ränge lückenlos 1–20, Kennungen weiter im Altschema `mr-annika-klose-*`,
> `created_at` der 17 wiederverwendeten Zeilen friert wie bisher ein, die 251 Zeilen der übrigen
> sechs Mandanten sind unberührt (0 mit `updated_at`/`berechnet_am`/`aktuell=false`).
> Referenzfingerabdruck der 270 unberührten Zeilen: `7837ae7f3dbceba9f5e6e30e8586adb9`.
> **Idempotenz in Production bewiesen (29.07.2026, 08:07:20 UTC):** ein regulärer Zweitlauf für
> denselben Mandanten mit **identischem Eingabefingerabdruck**
> (`d396c545431210e1cef4ebb8e12c4d7ad4ec75a8103e289ce38fb13b62bcc8ac`) erzeugte **keine neue
> Laufzeile**; die bestehende Laufzeile wurde wiederverwendet, `wiederholungen` **0 → 1**,
> `letzter_lauf_at` gesetzt. `matching_results` blieb **vollständig unverändert** — keine neue Zeile,
> keine Löschung, `updated_at` und `berechnet_am` stehen weiterhin auf 04:05:08, Ränge, `similarity`,
> `matched_features`, `run_id` und `aktuell` unangetastet. Bemerkenswert: zwischen beiden Läufen
> entstanden **179 neue Wissensobjekte**, ohne die Kandidatenmenge dieses Mandanten zu verändern —
> der Fingerabdruck reagiert also auf fachliche Änderung, nicht auf Bestandswachstum.
> **Kosten und Fehler:** 0 zusätzliche KI-Aufrufe, 0 Token, 0,00 USD (`llm_usage` im Fenster leer,
> identisch zum Vergleichsfenster vor der Aktivierung; der Auditpfad ruft strukturell kein Modell auf).
> Postgres-Logs seit der Aktivierung: 1 `ERROR`, und der stammt aus einer eigenen Prüfabfrage dieser
> Sitzung (`column "purpose" does not exist`) — **kein** Fehler zu `matching_runs`, `matching_results`
> oder `helmut_publish_matching_run`. Vercel-Runtime-Fehler: 0 in 24 h.
> **Zwei neue Befunde, die nicht zum Sprintumfang gehören, aber daraus entstanden sind:**
> (1) der Crawl läuft reproduzierbar in sein **280-Sekunden-Zeitlimit**
> (`[cron/crawl] 280001ms tenants=undefined bounded=true`) und erreicht deshalb je Lauf nur einen
> Teil der Mandanten — belegt auch am 28.07. um 04:00 und 20:00, also **vor** der Aktivierung, damit
> **kein Flag-Effekt** → **OP-25**; (2) es gibt **keinen produktiv verwendeten Einstieg**, um Matching
> für genau einen Mandanten isoliert auszuführen (`runMatchingShadow` hat nur zwei produktive
> Aufrufer: `scheduler.js:412` in `runSourceCrawl` und `scheduler.js:588` in `runLageCheck`, beide
> crawlen; keine HTTP-Route, kein npm-Skript, kein Workflow) → **OP-26**. Befund (2) ist auch der
> Grund, warum der Idempotenznachweis **nicht** manuell erzwungen, sondern an einem regulären Lauf
> beobachtet wurde.
> **Nicht verändert:** kein Code, keine Migration, keine Cron-Konfiguration, keine Scores/Rankings/
> Kandidaten/`matched_features`, `knowledge_object_embeddings` unverändert (772), kein manueller Lauf,
> keine Datenkorrektur. Rollback oder Deaktivierung **nicht notwendig**; das Flag ist **aktiv**.
> **Roadmap-Punkt 23 bleibt offen**, weil **Sprint 23C** (sichtbare Nutzererklärung) fehlt;
> Briefing-Historisierung bleibt **Sprint 23B-2**; der Befund zum 200er-Wissensobjekt-Ladefenster
> (M-7) bleibt unverändert außerhalb dieses Sprints. Vollständiger Nachweis:
> [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §25.

> **Sprint 23A am 2026-07-28 ausgeführt — ERFOLGREICH ABGESCHLOSSEN (Bestandsaufnahme;
> Production ausschließlich lesend, keine Produktlogik, kein Schema, keine Daten verändert).**
> Startprüfung vollständig: `main` = `51a533d` (Merge **PR #166**), Arbeitsbranch deckungsgleich,
> 10 offene PRs geprüft — konkrete Überschneidung nur bei **#112** (Onboarding verändert, wie
> Mandatsprofile entstehen → berührt den Profilhash von 23B) sowie Textkonflikte in
> `CURRENT_STATE.md` mit #167/#159/#148; **kein PR angefasst**.
> **Verifizierter Ist-Zustand:** Einstiegspunkt ist `matching.js:runMatchingShadow`, aufgerufen an
> **genau zwei** Stellen in `scheduler.js` (Crawl-Pfad Z. 409, Lage-Pfad Z. 577) → **4 Läufe je
> Mandant und Tag** (Crons 04/10/16/20 UTC, durch das Stundenhistogramm der Daten bestätigt).
> **Einziger Konsument** ist `lage.js:325` — und auch nur, solange `HELMUT_SCORING_MODE` aus ist
> (OP-22); **Radar liest die Ergebnisse nicht** (`rankForRadar` wird im Produktcode nirgends
> aufgerufen). **Schema** identisch zum Repo, kein Drift: 9 Spalten, PK `id`, 2 FKs mit
> `ON DELETE CASCADE`, **kein eindeutiger Index auf (user_id, knowledge_object_id)** — die
> Eindeutigkeit ist reine Codekonvention (`mr-<mandant>-<vorgang>`), hält aber 287/287.
> **Schreibpfad:** Bulk-Upsert auf `id` → **vollständiges Überschreiben**, **kein DELETE**, keine
> Retention, **keine Lauf-ID**, **kein `updated_at`**; `created_at` bleibt auf dem ERSTEN
> Auftreten des Paares stehen. **Empirischer Beweis:** `profile_embeddings.updated_at` von
> `annika-klose` steht auf **28.07. 16:04:32 UTC** (dieses Feld setzt `saveProfileEmbedding` bei
> jedem Lauf explizit), die jüngste `matching_results.created_at` desselben Mandanten auf
> **08:02** — der 16:04-Lauf schrieb 20 Zeilen und hinterließ **keine sichtbare Spur**.
> **Production-Zahlen (read-only):** 10 Mandanten · 9 Mandatsprofile (6 aktiv) · 1 507
> Wissensobjekte (776 verstanden) · **287** `matching_results` auf **7** Mandanten und 181
> Vorgängen · 7 Profilvektoren · 71 Briefings · 976 Decisions · 772 semantische Embeddings ·
> 685 Byte/Zeile · DB 64 MB. **Sauber:** 0 Duplikate, 0 Waisen, 0 fehlende Scores, 0 Ergebnisse
> ohne Profil/Vorgang, 0 abweichende Kennungen. **Nicht sauber:** **64 Zeilen tragen Rang 20**
> (je Lauf wird jeder Rang genau einmal vergeben) — der direkte Abdruck vermischter
> Generationen; der Lesepfad sortiert folgerichtig nach `created_at`, **nicht** nach `rank`.
> **Erklärbarkeit heute: 225 von 287 Zeilen (78,4 %) haben leere `matched_features`**; von 79
> Einzeltreffern sind 55 „Partei", nur 12 „Ausschuss" und 8 „Thema". `filters` ist **287/287
> leer** — im Produktionspfad wird nie gefiltert und kein Schwellenwert angewendet (gespeicherte
> Ähnlichkeiten reichen bis **−0,0735**). **Versionierung: nichts davon existiert** — kein
> Profilstand, kein Vorgangsstand, keine Rezept-/Vektorversion, kein Berechnungszeitpunkt am
> Ergebnis; `profile_hash` existiert nur einmal je Mandant und wird mitüberschrieben,
> `ko_version` (1 505 × v1, 2 × v2) wird nicht mitgeführt. **Alte Ergebnisse sind nicht
> reproduzierbar.** **Briefing-Befund:** der Payload enthält **nur** `generatedAt`, `koSetHash`,
> `model`, `paragraphs`, `wordCount` — **keine Vorgangskennungen, kein Verweis auf ein
> Matching-Ergebnis**; `koSetHash` ist eine Einwegfunktion. Zeilenkennung ist
> `bf-<mandant>-lage-<tag>` mit Upsert → **ein neuer Matching-Lauf kann ein Tagesbriefing
> rückwirkend überschreiben**, der alte Text ist dann verloren. **Mandantentrennung:** RLS aktiv,
> **eine** Policy `tenant_isolation` nur für `authenticated`; **`service_role` umgeht RLS
> vollständig** — durchsetzend ist allein die App-Seite, und die ist für beide Zugriffsfunktionen
> geprüft (`assertTenant` + Pflichtfilter bzw. `assertTenantRows`). Kein ungefilterter Pfad
> gefunden. **Befund M-6 (Hygiene, nicht akut):** `anon`/`authenticated` halten auf allen älteren
> V3-Tabellen den Supabase-Standardrechtesatz inkl. **`TRUNCATE`** (RLS greift bei `TRUNCATE`
> nicht) — über das API nicht erreichbar, aber inkonsistent zur gehärteten
> `knowledge_object_embeddings`. **Befund M-3 (schwerwiegendster inhaltlicher Befund):** nach
> einer Profil- oder Vorgangsänderung bleiben alte Ergebnisse **unverändert und stillschweigend
> falsch zugeordnet** stehen. **Semantik-Abgrenzung bestätigt:** `knowledge_object_embeddings`
> wird ausschließlich von `embedding-backfill.js` und dessen Test berührt — **null Einfluss** auf
> `matching_results`; für Punkt 23 ist **keine** Änderung daran nötig. **Keine feste Bindung an
> den Pilotmandanten in aktiver Logik** (einziger Treffer: ein Kommentar in `source-mode.js`).
> **Entscheidung für 23B: Variante B+** — neue schmale Lauftabelle `matching_runs` (mit kompakter
> Rangliste je Lauf = die eigentliche Historie), **additive** Spalten auf `matching_results`
> (Lauf-ID, Profilhash, Vorgangs-Eingabehash, `ko_version`, Rezept-/Vektorversion,
> `berechnet_am`, `aktuell`/`abgeloest_am`, Signale, Begründung, Eingabefingerabdruck) plus
> erstmals ein **echter** eindeutiger Index `(user_id, knowledge_object_id)`; Briefing-Anbindung
> **ohne Migration** im vorhandenen `payload`-jsonb + schmale Archivtabelle `briefing_versionen`.
> Idempotenz über einen Eingabefingerabdruck: ein identischer Zweitlauf erzeugt **0 Zeilen und
> genau 1 UPDATE** (heute: 20 UPDATEs) — die Schreiblast **sinkt**. **Verworfen:** A (der PK
> erzwingt eine Zeile je Paar → Historie unmöglich), C (20 Zeilen je Lauf ≈ 2,2 Mio./Jahr bei 100
> Profilen für zu >90 % identische Daten), D (protokolliert nur, *dass* gerechnet wurde).
> **Bewusst nicht gespeichert:** Artikeltexte, Vektoren je Ergebnis, Profilkopien,
> Zwischenschritte, verworfene Kandidaten, KI-Erklärungen — sowie fachlicher/geografischer/
> institutioneller Teilscore, weil sie im Rezept **nicht existieren** (leere Spalten wären
> falsches Grün). **Kostenschätzung:** +0 Zeilen einmalig, ~1,0–1,2 kB je Ergebnis, ~1,5–2,0 kB
> je Lauf, ~20 MB/Jahr bei 10 Profilen, ~200 MB/Jahr bei 100 Profilen (dann Retention nötig),
> **0,00 USD zusätzliche KI-Kosten**. **23C-Erklärung definiert** (1–2 Sätze, deterministisch aus
> `matched_features`, Reihenfolge Ausschuss → Thema → Wahlkreis → Partei, ohne Belege **kein**
> Satz statt Erfindung, sichtbar in der Vorgangskarte, **nicht** im KI-Narrativ) — heute für
> 20 von 287 Zeilen politisch aussagekräftig belegbar; das ist der ehrliche Ausgangswert.
> **Tests:** Offline-Suite **176/176** in bereinigter Umgebung (Zweitlauf; im Erstlauf 175/176 —
> `werkzeug-lesefehler-test` einzeln 43/0, Parallellast-Flake). Mit den Sitzungs-Secrets
> `HELMUT_STORAGE_BACKEND`/`HELMUT_V3_STORE`/`SUPABASE_URL` meldet derselbe Aufruf 162/176 —
> **bekanntes Umgebungsmuster**, gegenbewiesen durch `git status` = leer (kein Byte Code
> geändert). **Kein Production-Write, keine Migration, kein Flag, kein Cron, kein Secret, keine
> Vercel-Variable, kein KI-Aufruf, kein Merge, kein Deployment.** Vollständig:
> [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md).
> **Nächster Schritt: Sprint 23B-1** (Migration + Rollback, `matching-contract.js`, Laufzeile,
> Sperre `matching-<mandant>` **auch im Lage-Pfad**, Idempotenz, Tests T-1…T-7) — die Migration
> ist freigabepflichtig.

> **Sprint 22C1 am 2026-07-28 ausgeführt — ERFOLGREICH ABGESCHLOSSEN. Beide Gates
> passiert: PR #165 gemergt (`ce5e3b8`, beide Pflicht-Checks grün, Deployment
> `dpl_CDfzvCaanmYsiZG62n9hKUaYLbCC` `READY`), Production-Freigabe für alle sechs
> Schritte erteilt, Runbook 14:56–14:59 UTC vollständig durchlaufen. Die
> Abschlussdokumentation ist mit **PR #166** gemergt (`51a533d`, 15:52 UTC, beide
> Pflicht-Checks grün, Deployment `dpl_E9JKeXKhd2b5mK2QJDNuRSquXJGg` `READY`) —
> damit ist auch das letzte Abnahmekriterium (Projektstatus aktualisiert) erfüllt.**
> **Production-Ergebnis:** Shadow-Migration angewendet und verifiziert (19 Spalten,
> RLS aktiv, **0 Policies**, Grants nur `postgres`/`service_role`, Teilindex für die
> Ein-Aktiv-Garantie, Renew-RPC ohne Fremd-Grants); **Canary 56/56 fehlerfrei**;
> Restbestand in zwei Etappen (300 + 416) mit belegter **Wiederaufnahme** (56 bzw. 356
> Objekte als aktuell übersprungen); Abdeckungsprüfung **BESTANDEN — 772 von 772
> berechtigten Objekten** mit aktuellem Embedding, alle Negativlisten 0;
> **Idempotenz-Zweitlauf: 0 geplant, 0 API-Aufrufe, 0 Writes, 772 übersprungen**.
> **17 API-Aufrufe, 110 992 Tokens (Schätzung) / 133 277 (providergemeldet),
> ≈ 0,0022 USD, 0 Fehler, 0 Wiederholungen** (`attempt_count` = 1 bei allen 772).
> Datenqualität gegengemessen: 1 Modellgeneration (`text-embedding-3-small` · dim 256 ·
> `ko-kanon-1` · Deployment/API-Version protokolliert), 0 falsche Dimensionen,
> 0 fehlende Vektoren, 0 Nullvektoren, 0 Fehlerzeilen. **Unverändert (Vorher/Nachher
> identisch):** `knowledge_objects`-Fingerabdruck `f56283f5…` byte-identisch,
> Legacy-Vektoren 773, `matching_results` 287 (jüngste 08:16 UTC), Briefings 71,
> `llm_usage` heute **0**, Crawl-Telemetrie 14 379 (jüngste 10:02 UTC), 0 aktive
> Sperren. **Kein Rollback nötig; keine semantische Produktfunktion aktiviert, keine
> Duplikatzusammenführung, kein Flag/Cron/Secret/Vercel-Variable verändert.**
> Werkzeugbefund **W-3** im Lauf gefunden und behoben (CLI schnitt große
> `--json`-Ausgaben auf einer Pipe ab — `process.exitCode` statt `process.exit()`;
> Ergebnisse waren korrekt, Laufprotokolle vollständig). Vollständige Zahlen:
> [`embedding-architektur.md`](embedding-architektur.md) §14.6.
> **Nächster Schritt: Sprint 22C2** — Produktnutzung der semantischen Ähnlichkeit
> entscheiden und vorbereiten (eigene RPC auf der Shadow-Tabelle, Duplikat-/
> Wiedererkennungsvorschläge **mit menschlicher Bestätigung**, Schwellenwert erst nach
> größerer Stichprobe; Legacy-Matching bleibt unverändert). Ebenfalls offen: laufende
> Erzeugung für neue Objekte (regulärer Embedding-Deckel) — beides freigabepflichtig.
>
> **Sprintverlauf bis Gate 1 (unverändert gültig):** Startprüfung vollständig
> (PR #164 gemergt, beide Pflicht-Checks grün, `main` = `77e4de3`, Deployment
> `dpl_9Kt9LpvYPCRNxeK4MhycsQmH8k29` `READY`, seit 22B nur Doku-Änderungen, Azure-Deployment
> `text-embedding-3-small` per Data-Plane-Abfrage bestätigt, Secrets nur über
> Environment-Einstellungen). Production erneut read-only vermessen (~14:30 UTC, Bestand
> stabil zu 22A): 1 501 Objekte, 772 verstanden, **772 berechtigt** (JS-exakt nach
> Datenvertrag = SQL-Näherung; 0 inhaltsleer, 0 unter 60 Zeichen, 599 ohne Fachgebiet und
> 78 Ebene `unknown` bleiben berechtigt, 729 unverstandene ausgeschlossen, 0 aussortiert,
> 0 zusammengeführt — `merged_into`/`superseded_by` existieren im Schema nicht, der Vertrag
> prüft sie defensiv), Dry-Run: 16 Batches ≤ 50, 110 992 Tokens ≈ **0,0022 USD**.
> **Geliefert (additiv, Production nur lesend):** **(1)** Shadow-Migration finalisiert und
> aus `entwuerfe/` nach `supabase/migrations/20260728_embedding_shadow.sql` überführt
> (+ vollständiges Rollback): alle 16 Datenvertragsfelder inkl. `deployment`/`api_version`/
> `model_version`/`input_tokens`, **genau eine aktive Repräsentation je Objekt DB-erzwungen**
> (Teilindex auf `is_active`), Modellwechsel ohne Datenverlust (PK je Modellgeneration),
> RLS aktiv ohne Policies + explizite Revokes, `updated_at`-Trigger, **neue RPC
> `helmut_renew_pipeline_lock`** (token-gebunden, nie nach Ablauf), kein ANN-Index
> (bewusst, < 2 000 Zeilen). **(2)** Production-Backfill `lib/helmut/embedding-backfill.js`
> + CLI `scripts/embedding-backfill.js`: Dry-Run-Default, `--vermessen`/`--pruefen`
> (read-only Bestands-/Abdeckungsprüfung), echter Lauf nur mit `--echt --freigabe erteilt`
> + Production-Schreibgate; **harte fail-closed Obergrenzen** ≤ 1 000 Objekte / ≤ 200 000
> Tokens / ≤ 0,05 USD / Batch ≤ 50 / Parallelität exakt 1 (Ablehnung statt Kappung,
> Kostenlimit zusätzlich als Tokenlimit erzwungen); **eigenes Lock
> `semantic_embedding_backfill`** (nie Crawl/Understanding; Erwerb fail-closed, TTL,
> Erneuerung je Batch, Abbruch bei Verlust, fremde Sperren blockieren den Start);
> idempotent + wiederaufnehmbar (Skip bei aktuellem Hash, Versuchsdeckel 3, Zweitlauf
> = 0 API-Aufrufe/0 Writes), Vektorvalidierung vor jedem Schreiben, maschinenlesbares
> Laufprotokoll (`shadow-store/`, gitignored). **Budgettrennung entschieden:** kein zweites
> Budgetsystem — Embeddings sind mandantenlos und laufen bewusst NICHT über
> `helmut_reserve_llm_call`/`llm_usage`; Tokenwahrheit je Zeile (`input_tokens`) + je Lauf
> im Protokoll, bestehende Budgets/Vercel-Variablen unverändert. **(3)** Tests: neue Suite
> `embedding-backfill-test.js` **40/40** (Migration/Rollback/RLS statisch, alle Limits,
> Lock-Lebenszyklus, Abbruch/Wiederaufnahme/Idempotenz, Dimension/NaN/∞/Teilbatch/Timeout,
> Modellversionsmischung, Mandantenneutralität, Legacy-Unantastbarkeit), Bestand 31/31 +
> 43/43, **Offline-Suite 176/176** (CI-Umgebung; auf unverändertem `main` 175/175
> gegenläufig bewiesen). Zwei sprintbedingte Testpflege-Änderungen dokumentiert:
> Env-Inventar um `HELMUT_EMBEDDING_DEPLOYMENT`/`AZURE_OPENAI_API_KEY`-Alias ergänzt,
> D7-Datumsriegel in `geografie-gedaechtnis-test` nimmt die geografie-freie
> Embedding-Migration namentlich aus. **Kein Production-Write, keine Migration angewendet,
> kein KI-Aufruf, kein Flag, Matching/Briefings unverändert, keine semantische
> Produktnutzung.** Runbook für den Production-Ablauf nach Freigabe:
> [`embedding-architektur.md`](embedding-architektur.md) §14.5 (Canary 56 → Rest in
> Paketen ≤ 50 → Abdeckungs- + Idempotenzprüfung → Vorher/Nachher-Vergleich).
> **Nächster Schritt:** Gate 1 (Merge dieses PR), danach Gate 2 (ausdrückliche Freigabe
> für genau: Migration · Canary 56 · Rest-Backfill · Azure `text-embedding-3-small` ·
> nur Shadow-Tabelle · vereinbarte Limits).

> **OP-01-Sprint am 2026-07-28, 09:32–10:10 UTC ausgeführt — teilweise abgeschlossen:
> Sicherung und isolierter Restore bewiesen, Tarifentscheidung für PITR ausstehend.**
> Production ausschließlich **lesend** angefasst. Tarif gegengeprüft (**Free-Plan**, keine
> nativen Backups, kein PITR; einziges Projekt `ddckuvvpcytqbyfmbvie`, PG 17.6). Danach:
> **(1)** Deckungslücke geschlossen — `source_crawl_telemetry` (14 289 Zeilen) und
> `process_runs` fehlten in Export **und** Restore-Reihenfolge, ein „Voll“-Backup deckte
> **38 von 40** Tabellen; **(2)** vollständige Production-Sicherung erstellt: **40/40
> Tabellen, 74 844 Datensätze, 56 MB in 50 s**, Prüfsumme `c63f1d95…`, gebunden an `main`
> `0f8d33a`, gitignored unter `backups/`, Ruhefenster belegt (0 Locks, 0 laufende Prozesse);
> **(3)** Rückweg praktisch bewiesen: neues Werkzeug `scripts/restore-verify-local.js`
> stellt das Backup in eine **isolierte lokale PostgreSQL** her (Production ist als Ziel
> konstruktionsbedingt verweigert — Host-Guards, Freigabe-Schalter, Prüfsummen-Pflicht,
> nie in eine bestehende DB) und beweist: **18/18 Prüfungen** — Zeilenzahlen 40/40 exakt,
> PK-Mengen byte-identisch, 90 feldgenaue Stichproben, alle 60 `knowledge_objects`-Spalten
> mengenidentisch (Sprint-19–21-Felder erhalten, Nachklassifikation **740/740**), Policies
> 23/23 · Trigger 14/14 · Funktionen 7/7 gegen die neue Production-Strukturreferenz, RLS
> überall aktiv, **Mandantentrennung funktional belegt** (RLS-Probe als `authenticated`
> mit JWT-Claim: je Mandant nur eigene Zeilen, Kreuzprobe 0, ohne Claim 0),
> `match_knowledge_objects` mit echtem Embedding, Trigger-Probe in Rollback-Transaktion.
> **RTO gemessen: Export 50 s, Restore+Beweis 20 s** (Schema 2 s · Import 6 s · Prüfung 12 s);
> Drill-DB danach gelöscht (PII). **Befund B-2:** spaltengenau belegter Schema-Drift
> Repo↔Production (NOT-NULL bei `knowledge_objects.action_items*`, 10 Alt-Spalten in
> `profiles` + `topic_memory.vorgang_id` nur in Production, 4 `llm_usage`-Spalten nur im
> Repo) — dokumentiert und im Drill automatisch korrigiert (`scripts/
> produktions-strukturreferenz.json` → `schemaDrift`), dauerhafte Bereinigung offen.
> RPO/RTO/Datenklassen jetzt verbindlich im Runbook §0; Automatisierung bewertet (§3d:
> Export bleibt bewusst manuell — kein neuer Secret-Ort, keine neue Infrastruktur).
> **Kein Production-Write, keine Migration, kein Flag, kein Cron, keine Kosten.**
> Offen bleibt genau **eine Betreiberentscheidung**: Supabase Pro (~25 $/Monat) + PITR
> (RPO 24 h → Minuten). Beleg: [`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md),
> Runbook [`betrieb/backup-restore-runbook.md`](betrieb/backup-restore-runbook.md).

> **Sprint 22B am 2026-07-28 ausgeführt — teilweise abgeschlossen (alle Offline-Arbeiten
> fertig, der kostenpflichtige externe Testlauf wartet definitionsgemäß auf
> Betreiberfreigabe).** Startprüfung vollständig (PR #161 gemergt, beide Pflicht-Checks
> grün, `main` = `b273877`, Deployment `dpl_ECKRnJRxNocyfPttwrh4Kw3ZQpA1` `READY`, keine
> neueren Embedding-Änderungen). **Geliefert (additiv, offline, Production nur lesend):**
> **(1)** Testmenge **56 Objekte** über alle 15 Fallgruppen inkl. B4-3-/B4-4-Umgebungen +
> **Goldstandard 47 Paare** in 7 Klassen, vor jeder Modellauswertung fixiert
> (`scripts/fixtures/embedding-testset-22b.json`); Nebenbefund: 238/772 verstandene
> Objekte ohne `headline` (236 bleiben berechtigt). **(2)** Legacy-Basislinie gegen den
> Goldstandard (`embedding-quality-eval.js`; 56/56 Production-Vektoren lokal exakt
> reproduziert): wortnahe Duplikate gut (Top-5 33/38), aber gleiche Vorgänge mit anderer
> Formulierung fallen durch (GVK-Duplikat Kosinus 0,059; CSD-Folge 0,269) und
> Negativkontrollen liegen über echten Duplikaten (0,429) — **kein tragfähiger
> Einzelschwellenwert** (0,45 → Präzision 1,0 bei Trefferquote 26 %). **(3)**
> Offline-Shadow-Pipeline (`lib/helmut/embedding-shadow-pipeline.js`, injizierter
> Provider, lokale Ablage `shadow-store/`, harte Objekt-/Tokenlimits fail-closed,
> idempotent, wiederaufnehmbar, Versuchsdeckel) mit Testsuite **31/31** (alle 20
> Pflichtprüfungen + 8 Fehlerszenarien). **(4)** Modell-/Providerentscheidung:
> **Azure OpenAI `text-embedding-3-small`, dim 256, Rezept `ko-kanon-1`** (bestehender
> Helmut-Provider; Alternativen 3-large und jina-embeddings-v3 bewertet; lokal weiterhin
> abgelehnt); Preise extern belegt (0,02 USD/1M), Azure-Preis+Deployment = Freigabepunkt.
> **(5)** Kostenmodell real: Ø **144 Tokens/Objekt**, Testlauf 8 621 Tokens ≈
> **0,0002 USD**, Altbestand 772 Objekte ≈ **0,0022 USD**; Deckel-Vorschlag 50 k
> Tokens/Tag + 1 USD/Monat, getrennt vom Understanding-Budget. **(6)**
> Migrationsentwurf geschärft (PK jetzt Objekt+Art+Modell+Dim+Rezept, Status-Index),
> weiterhin **nicht angewendet**. **(7)** Testlauf-CLI `embedding-testlauf.js`:
> Dry-Run Default, echter Lauf nur mit `--echt --freigabe erteilt` + Env-Secrets.
> Berlin/Brandenburg geprüft (Eingang ebenen-/geografie-/mandantenfrei, hash-stabil
> getestet; Brandenburg im Bestand nur 1 echtes Landes-Objekt — dokumentierte Grenze).
> Offline-Suite **171/175** (die 3 E-2-Vorbefunde + `profile-db-test` nur bei gesetzten
> Sitzungs-Env-Vars `HELMUT_STORAGE_BACKEND`/`HELMUT_V3_STORE`, auf unverändertem `main`
> identisch rot — Umgebungs-Vorbefund; Abnahmezahl ist das CI-Gate). **Kein
> Production-Write, keine Migration, kein KI-Aufruf, kein Flag, Matching unverändert.**
> Kanonisch: [`embedding-architektur.md`](embedding-architektur.md) §13 (inkl.
> Freigabepaket §13.6).
>
> **Nachtrag (~12:45 UTC): Betreiberfreigabe für den Testlauf wurde erteilt** —
> die auferlegte Deployment-Gegenprüfung ergab jedoch: der bestehende
> Azure-Ressourcenbereich enthält **nur** `gpt-5-mini`, **kein
> Embedding-Deployment** → Testlauf gemäß Auflage **gestoppt, bevor ein
> Modellaufruf erfolgte** (0 Aufrufe, 0,00 USD; kein Deployment angelegt, keine
> Azure-Einstellung geändert). Nebenbefund behoben: Testlauf-CLI nutzt jetzt die
> Repo-Konvention `AZURE_OPENAI_KEY`. **Nächster Schritt:** Betreiber legt ein
> `text-embedding-3-small`-Deployment an + setzt `HELMUT_EMBEDDING_DEPLOYMENT`
> in den Session-Environment-Einstellungen, dann erneute Freigabe des Laufs
> (Details: `embedding-architektur.md` §13.6).
>
> **Nachtrag (~13:04 UTC): Deployment angelegt, Env gesetzt, Testlauf
> ausgeführt und ausgewertet — erfolgreich abgeschlossen.** Betreiber hat das
> `text-embedding-3-small`-Deployment angelegt und `HELMUT_EMBEDDING_DEPLOYMENT`
> in den Cloud-Session-Environment-Einstellungen gesetzt; die frühere Freigabe
> galt weiter. Dry-Run zuerst (56 geplant, 3 Batches, 8 621 Tokens, ≈0,0002 USD),
> danach `--echt --freigabe erteilt`: **56/56 Objekte berechnet, 0
> fehlgeschlagen, 8 621 Tokens, ≈0,0002 USD, 0 Abbrüche**, Ablage ausschließlich
> lokal (`shadow-store/`, gitignored) — **kein Production-Write.**
> **Qualitätsvergleich gegen den 47-Paar-Goldstandard:** das semantische
> Embedding schlägt den Legacy-Merkmalsvektor deutlich — Top-5-Trefferquote
> **38/38 vs. 33/38**, mittlerer Rang **1,2 vs. 4,4**, Rang-1-Trefferquote
> **33/38 vs. 20/38**. Alle vier bekannten B4-Problemfälle (CSD-Folge,
> GVK-Duplikat, Iran-Serienende, Petition) springen von Rang 21–42 auf Rang 1.
> Beim Legacy-Vektor gibt es **keinen** tragfähigen Einzelschwellenwert
> (Präzision 1,0 nur bei Trefferquote 21–26 %); semantisch ist bei Schwelle
> 0,75–0,80 Präzision 1,00 bei Trefferquote 0,95 erreichbar. **Kein
> Production-Write, keine Migration, kein Flag, Matching unverändert.**
> Vollständige Zahlen: [`embedding-architektur.md`](embedding-architektur.md)
> §13.8. **Nächster Schritt:** Produktentscheidung, ob/wann ein
> semantisches Embedding produktiv wird (§11: Migration, Modell-/Provider-
> Aktivierung, Backfill, Matching-Änderung sind je einzeln freigabepflichtig) —
> kein automatischer Anschluss an diesen Sprint.
>
> **Sprint 22A am 2026-07-28 ausgeführt — erfolgreich abgeschlossen (Analyse-Sprint,
> keine Production-Änderung).** Zentrale Produktfrage beantwortet und **bewiesen**: das
> „embedding" in `knowledge_objects.embedding vector(256)` ist ein **deterministischer
> Merkmalsvektor** (Token-Hash aus Partei/Ausschuss/Region/Thema/Inhalt,
> `lib/helmut/matching.js`), **kein** semantisches Text-Embedding — 3 Production-Vektoren
> lokal exakt nachgerechnet (Abweichung < 1e-8, reine float4-Rundung). Production read-only
> vermessen (~13:00 UTC): **1 501** Wissensobjekte, **772 verstanden — alle 772 mit Vektor**,
> **0** falsche Dimensionen, **0** Nullvektoren, **0** ungültige Werte; 599 verstanden ohne
> Fachgebiet und 78 mit Ebene `unknown` — **alle mit Vektor, beide Gruppen kein
> Embedding-Blocker** (Fachgebiet/Ebene/Geografie sind bewusst nicht Teil des kanonischen
> Eingangs); 729 unverstandene bleiben ausgeschlossen. Profilvektoren 7/10 (dim 256, mit
> Hash), `matching_results` 287 Zeilen (frisch) → der pgvector-Shadow-Pfad läuft aktiv
> (**Befund E-1:** `env-inventar.md` führte `HELMUT_V3_MATCHING` ohne Prod-Vermerk).
> **Geliefert (additiv, offline):** Datenvertrag `lib/helmut/embedding-contract.js`
> (kanonischer Eingang `ko-kanon-1`, Input-Hash, Berechtigung, Vektorvalidierung,
> Veraltet-Erkennung, idempotente Arbeitsplanung), Tests `embedding-contract-test.js`
> **43/43** (alle 14 Sprintregeln inkl. Idempotenz, Wiederaufnahme, Mandantenneutralität),
> Shadow-Migrations-**Entwurf** `supabase/migrations/entwuerfe/` (nicht freigegeben, mit
> Rollback), kanonische Doku [`embedding-architektur.md`](embedding-architektur.md)
> (Datenfluss, Objektklassen, Anwendungsfälle, parametrisiertes Kostenmodell ~0,19 M Tokens
> Altbestand, Backfill-Sicherheitsmodell, Berlin/Brandenburg-Neutralität, Freigabepunkte).
> **Kein Production-Write, keine Migration angewendet, kein Flag, kein KI-Aufruf, Matching
> unverändert.** Achtung: Roadmap-**Punkt 22** (Embeddings) ≠ **OP-22** (Scoring).
> Empfehlung: **Sprint 22B** (Modell-/Providerwahl mit belegten Preisen, Shadow-Migration
> nach Freigabe, begrenzter Qualitätsvergleich am Duplikat-/Wiedererkennungsfall).

> **Sprint 21, Stufe 1 am 2026-07-28, 08:25:13–08:25:21 UTC ausgeführt — erfolgreich.**
> Erster **Schreiblauf** der Nachklassifikation gegen Production, begrenzt auf **12 namentlich
> ausgewählte Wissensobjekte** (2 je sicherer Fehlerklasse, alle **6** Klassen abgedeckt).
> **12 geplant, 12 geschrieben, 0 Fehler, 0 Kollisionen.** Der vollständige Readback zeigt
> **0 Abweichungen von der Vorschau**: keine belegte Geografie verloren, keine ungeplante
> ergänzt, **0** Ebenen-, Fachgebiets- oder Entitätsänderungen, berührt wurden ausschließlich
> `affected_geographies`, `mentioned_geographies` und `classification_confidence`. **Kein
> anderes Objekt verändert** — der Fingerabdruck über die **1 237 übrigen** Wissensobjekte ist
> vorher wie nachher `f277c07b…`. **0 KI-Aufrufe, 0,00 USD** (`llm_usage` 0 Zeilen,
> Budgetzähler unverändert). Der zweite Vorschaulauf über dieselben IDs meldet **0**
> Schreibvorgänge (Idempotenz). Matching gegen alle **8** echten Production-Profile,
> Briefings und Betrieb unverändert stabil; **keine** neuen Briefings, **keine** regulären
> Läufe für den Test gestartet. **Der Lauf wurde nicht erzwungen:** um 07:58 UTC lief ein
> realer Crawl mit `understanding-eager`; geschrieben wurde erst nach drei ruhigen Messungen
> (08:18:50 UTC, 0 Sperren). **Befund N-1:** die Nachklassifikation schreibt `updated_at`
> **nicht** fort — kein Defekt und kein neues Verhalten, aber der Hauptlauf ist deshalb über
> `classification_confidence.nachklassifikation_am` gegenzumessen, nicht über `updated_at`.
> **Keine Codeänderung nötig, keine Migration, kein Flag, kein Cron, kein Lock verändert.**
> Branch `claude/sprint-21-production-pilot-enef9l`, **PR #157** (reine Doku), **CI-Gate grün:
> beide Pflicht-Checks**, Lauf `30343049294`.
> Vollständiges Protokoll: [`nachklassifikation-altbestand.md`](nachklassifikation-altbestand.md) §13.

> **Sprint 21, Hauptlauf am 2026-07-28, 09:03:49–09:07:09 UTC ausgeführt — erfolgreich.**
> Auf ausdrückliche Freigabe der **vollständige Production-Schreiblauf über Umfang B**:
> Startprüfung **12 von 12**, frische Gesamtvorschau (1 249 gelesen, 482 unverstanden
> ausgeschlossen, **728** Schreibvorgänge = exakt 740 − 12 Probelauf; alle 12 Probelaufobjekte
> als unverändert erkannt), Sicherung aller 728 Objekte mit Prüfsumme
> (`5b2ba8d1…`, gitignored unter `backups/`), letzte Kollisionsprüfung **0/0/0**. Ergebnis:
> **728 geplant, 728 geschrieben, 30 Batches, 0 Fehler, 0 Kollisionen, 0 KI-Aufrufe, 0,00 USD**
> (`llm_usage` heute 0 Zeilen, vor wie nach dem Lauf). Readback **728 von 728 exakt wie
> geplant**: 562 erfundene Geografien entfernt, **0** belegte verloren, **0** ungeplant ergänzt,
> **0** Ebenen-/Fachgebiets-/Entitätsänderungen; Fingerabdruck der **521 übrigen** Objekte
> vorher wie nachher `64044fbf…`. Markierte Objekte gesamt **740 = 12 + 728**, exakt.
> Idempotenz: neue Gesamtvorschau meldet **0** Restschreibvorgänge, **0** Batches, keine neue
> Fehlerklasse. Matching (8 echte Profile fehlerfrei), Briefings (71 vorher wie nachher, 8 von 8
> abrufbar, 0 neue), Telemetrie (0 Fehlläufe in 3 h), Sperren (0) — Betrieb stabil. Regional
> zugeordnete Vorgänge **573 → 11** (geplante Wirkung: erfundene Zuordnungen entfernt, belegte
> geschützt). Befund N-1 bestätigt: `updated_at` bei **0 von 728** fortgeschrieben — Nachweis
> über `classification_confidence.nachklassifikation_am`. **Kein Codefehler, keine Codeänderung,
> keine Migration, kein Flag, kein Cron, kein Lock verändert. Kein Rückweg nötig** (der Rückweg
> bleibt gegen Production ungetestet — OP-01, bekanntes Altrisiko). **OP-24 ist inhaltlich
> erledigt.** Vollständiges Protokoll:
> [`nachklassifikation-altbestand.md`](nachklassifikation-altbestand.md) §14.

> **CSD-Production-Nachweis am 2026-07-27 ausgeführt, gescheitert und vollständig
> zurückgenommen.** Der genehmigte Nachhollauf (08:41–08:42 UTC, 21 namentlich genannte
> Rohdokumente) hat **keinen** CSD-Vorgang gebildet, sondern **19 CSD-Rohdokumente** dem
> fachfremden Bestandsvorgang `vg-angriffen` (Iran/Huthi) zugeschlagen und den vorgemerkten
> Vorgang `vg-tagesspiegel-20260519-f29ebd` inhaltlich überschrieben. Ursache ist ein
> **neuer** Resolver-Defekt **B4-3**: zwei Flexionsformen desselben generischen
> Ereignissubstantivs („angriff"/„angriffen") zählen als zwei unabhängige spezifische
> Belege und erfüllen `MIN_BEWEISGEWICHT=2` allein. **#145 deckt das nicht ab**, weil es nur
> gegen Magnete mit ≥ 10 Dokumenten validiert wurde — ein **Ein-Dokument**-Vorgang ist
> leichter zu treffen als ein Magnet. Die Rücknahme ist um 08:56 UTC ausgeführt und
> gegengemessen: `knowledge_objects` **982**, `ko_document_links` **3 217**, `pending`
> **277** — **Netto 0 veränderte Zeilen in Production**. Vollständige Beweiskette:
> [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §15.
> **Stand 2026-07-27 (Hotfix-Sprint):** B4-3 ist **im Code behoben** und mit **PR #147
> gemergt** (`27d7787`) — damit in Production deployt.
>
> **Beim Abschlusslauf zu B4-3 wurde ein weiterer Defekt gefunden: B4-4.** Das Dokument
> „Kai Wegner zu queeren Rechten … - Tagesspiegel" landete in einem fachfremden Vorgang,
> weil der **Herausgebername** als spezifischer thematischer Anker zählte: `tagesspiegel`
> hat 13 Zeichen, lag damit über `STRONG_ANCHOR_LEN` und erfüllte `MIN_BEWEISGEWICHT=2`
> **allein**. Der Zielvorgang enthielt bereits mehrere Tagesspiegel-Artikel — zwei Texte
> wurden zu einem Vorgang, weil sie in derselben Zeitung standen. **In Production ist
> B4-4 weiterhin aktiv**, weil der Fix nicht gemergt und damit nicht deployt ist. Vor
> jedem weiteren Nachhollauf müssen Merge und Deployment erfolgt sein. Details: §3, Zeile
> „Hotfix Vorgangsbildung B4-4", und
> [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §17.
>
> **Erledigt am 2026-07-27, 12:15 UTC: B4-4 ist gemergt (#149, `ad0cf99`), deployt und in
> Production nachgewiesen.** Der eng begrenzte Nachhollauf für die **zwei** verbliebenen
> CSD-Rohdokumente (`nachhol-20260727121511`, 39 s) hat beide als **eigene neue Vorgänge**
> aufgelöst — der Herausgebername `tagesspiegel` taucht nicht einmal mehr in der
> Kandidatensuche auf. `vg-tagesspiegel-20260519-f29ebd` (2 Dokumente), `vg-angriffen`
> (1 Dokument) und `vg-csd-20260727-12aae0` (27 Dokumente) sind **unverändert**; außerhalb
> der Zielmenge wurde **nichts** verändert (+2 Knowledge Objects, +2 Verknüpfungen, +2
> LLM-Aufrufe, sonst 0). **Kein Rückweg nötig.** Unvollständig bleibt genau ein Punkt: das
> Wegner-Dokument lief in einen **Azure-Zeitüberlauf** und steht klassifiziert auf
> `fehlgeschlagen` — zugeordnet und verknüpft, aber inhaltlich noch nicht verstanden.
> Vollständige Beweiskette:
> [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §18.
>
> **Abgeschlossen am 2026-07-27, 12:36 UTC.** Die kontrollierte Wiedervorlage
> (`nachhol-20260727123643`, 16 s) hat das Wegner-Dokument **im bestehenden** Vorgang
> `vg-grundgesetz-20260725-15b616` verstanden (`aufloesungen: {"bestand": 1}`): `pending`/
> `failed` → **`neu`/`complete`**, Inhalt fachlich korrekt, **kein** zweiter Vorgang, **kein**
> doppelter Link, **+1** LLM-Aufruf, **genau eine** geänderte Zeile in Production. Voraussetzung
> war das gezielte Zurücksetzen des Vorgangs über die bestehende Ein-Vorgang-Primitive
> `resetUnderstandingToPending` (8 → 7 `failed`, die übrigen sieben unberührt) — der allgemeine
> Nachholpfad verweigert einen geparkten Vorgang ausdrücklich. **Damit ist der gesamte
> B4-4-/CSD-Production-Nachweis vollständig:** beide Restdokumente sind zugeordnet, verknüpft
> und verstanden, keines über einen Herausgebernamen. Alle 14 Kriterien erfüllt, kein Rückweg
> nötig. Details: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §19.

> **Offener Production-Befund seit 2026-07-26, 22:05 UTC:** der Crawl läuft ins
> 300-s-Funktionslimit (zwei belegte `504`, einer davon der reguläre 04:00-Cron **ohne jeden
> Berlin-Bezug**). **Folge: `source_crawl_telemetry` bekommt seit dem 26.07., 20:00:47 UTC keine
> neue Zeile** — Punkt 16 ist blind, Invariante B3 nicht messbar, und der Stufe-2-Riegel von
> Punkt 14 ist unerfüllbar. Ursache bewiesen, Reparatur in **PR #144 gemergt** (`719df29`):
> [`betrieb/incident_2026-07-27_crawl_zeitlimit.md`](betrieb/incident_2026-07-27_crawl_zeitlimit.md).

> **Berlin wurde am 2026-07-26 erstmals aktiviert — und noch am selben Abend zurückgerollt.**
> Aktivierung bis Stufe 1 um 21:01–21:03 UTC, Rollback (Ebene 0b **und** Ebene 2) um 22:47–22:49 UTC,
> nachdem Abbruchkriterium 16 eingetreten war. **Berlin ist heute wieder vollständig inaktiv:**
> 0 berechtigte Berliner Mandate, 0 aktive Berliner Wege. Der Auslöser war sehr wahrscheinlich
> **nicht** Berlin, sondern ein manueller `/api/pipeline/run` auf dem frisch deployten #143-Stand.
> Vollständige Beweiskette: [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §21/§22.

> **Diese Datei ist der aktuelle Stand.** Bei Widerspruch zu älteren Statusdokumenten
> gilt diese Datei. Sie enthält **keine Chronik** — Details je offenem Punkt stehen in
> [`datenmotor-restliste.md`](datenmotor-restliste.md) (OP-Nummern, verbindlich),
> der Systemstatus in [`quellenarchitektur/00-master-status.md`](quellenarchitektur/00-master-status.md),
> die Sicherheitswahrheit in [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md).
>
> **Pflege:** nach jedem größeren Sprint aktualisieren — nur die tatsächlich
> veränderten Zeilen. Regeln dafür: [`../CLAUDE.md`](../CLAUDE.md) §8/§9.

---

## 1 · Aktive Phase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Produktseitig gilt Feature-Stopp zugunsten
von Betriebs-, Rechts- und Sicherheitsreife.

## 2 · Erfolgreich abgeschlossen (Abnahme erfüllt, Production-belegt)

| Punkt | Beleg |
|---|---|
| Quellen-Cutover: relationale DB ist aktive Quellenwahrheit (`HELMUT_SOURCE_MODE=on`) | `helmut-flags.json`, Freigabe 2026-07-15 |
| App-seitige Mandantentrennung inkl. Cross-Tenant-Write-Guard | PR #96, `quellenarchitektur/05-sicherheitsmodell-rls.md` |
| Mandantenneutralisierung: kein Pilot-/Default-/Fallback-Mandant im Code | PR #97 |
| Atomare fail-closed Locks (Crawl + Understanding), Quellen-Telemetrie | PR #95, `betrieb/production_beweisprotokoll.md` |
| LLM-Tagesbudget 100 + Reserve 30, fail-closed | live (FA-5/FA-6/FA-12) |
| Ehrlicher Health-Report, Radar-Störungswahrheit, echte Laufzeitmessung | PR #95, Beweisprotokoll |
| PILOT_SECRET rotiert (alter Klartext-Code wertlos) | FA-1, 2026-07-15, `HTTP 200` verifiziert |
| KO-Klassifikations-Backfill inkl. Idempotenz-Nachweis (OP-08) | Runs 29511858469 / 29621926765, SQL-Gegenprobe 0 Lücken |
| Blockierendes CI-Gate (Offline-Suite + Chromium-Smoke) existiert | `.github/workflows/ci.yml` |
| Profil-Storage relational entkoppelt (Exklusivmodus) | PR #113 |
| Doku-Konsolidierung: `main` als einzige Architekturwahrheit | PR #114 (Recovery Sprint R2) |
| Quellenarchitektur-Remediation: Seed-Reproduzierbarkeit (P0-1) inkl. Drift-CI-Gate, Neutralisierung der Pflicht-Landespakete (P0-2), 6 Bundesweg-Reparaturen im Katalog (P1-5) | PR #118, gemergt 2026-07-25 (`61767a9`), CI grün, Deployment `READY` |
| Kontext-Einstiegsschicht (`CLAUDE.md`, `START_HERE`, `CURRENT_STATE`, `ARCHITECTURE`) | PR #119, gemergt 2026-07-25 |
| **Anker-Recovery-Pfad (F-3) technisch stillgelegt** — Workflow entfernt, Execute-Skript ohne DB-/KI-/Write-Pfad, `RECOVERY_ALLOWLIST` leer, namensunabhängiger CI-Riegel | PR #105, gemergt 2026-07-25 (`43e9e35`); auf `main` verifiziert: Workflow weg, Allowlist `[]`, 0 `require` im Execute-Skript |
| `failed-final` wird im Pending-Filter und in `understandOneCluster` terminal behandelt („nie wieder") | PR #105 |
| Freigabevorlage Quellen-Seed-Einspielung (Soll-Zahlen, Idempotenznachweis, Go-/Stop-Kriterien) | PR #123, gemergt 2026-07-25 (`bed7f53`), CI grün |
| ~~Production-Inventur aller Quellenpakete (Handerhebung 2026-07-25)~~ — **abgelöst am 2026-07-27** durch die wiederholbare Inventur (Punkt 18, unten). Die Handerhebung bleibt als Beleg erhalten (Befunde A-1…A-8) | PR #124, gemergt 2026-07-25 (`118e90c`); Inhalt jetzt `quellenarchitektur/30-paket-inventur-production.md` §9 |
| **Automatische Profil→Paket-Zuweisung belegt** — Bund/Berlin/Brandenburg gegen den echten Production-Katalog, ohne Codeänderung; keine Mandanten-Hardcodes, Bestandsmandanten unverändert | `scripts/paketzuweisung-nachweis-test.js` 147/147, Inventur §6; PR #124, gemergt 2026-07-25 (`118e90c`) |
| **Fachliche Vollständigkeit aller Quellenpakete belegt** (Phase-1-Punkt 13) — alle **8** Pakete abgeschlossen: **7 vollständig + 1 vollständig mit belegten Ausnahmen**, 0 teilweise, 0 blockiert. Ausführbares Kriterium je Paket (Pflichtklassen · Pflicht-Herausgeberklassen · Vollzähligkeit · begründete Überschneidungen · geprüfte Nicht-Anwendbarkeit); **keine** Vollzähligkeitsregel ist mehr katalogrelativ: Ausschüsse **24/24** und Fraktionen **5/5** gegen amtliche Sollmengen. **Ausschussstruktur zusätzlich Bezeichnung für Bezeichnung gegen die amtliche Bundestagsgrundlage abgeglichen** (Anzahl, Namen, Schreibweise, Ausschussnummer, Sonderfälle, Umbenennungen): 22 von 24 stimmten, **2 amtliche Bezeichnungen korrigiert** (Nr. 4 → „Innenausschuss", Nr. 15 → „Verkehrsausschuss") | `quellenarchitektur/31-paketvollstaendigkeit.md` §2a–§2c; `bundestag-ausschuesse-test.js` 54/54, `parlamentszusammensetzung-test.js` 65/65, `paketvollstaendigkeit-test.js` 99/99, Offline-Suite 150/150, Browser-Smoke 32/32; Branch `claude/helmut-phase1-punkt13-9iwu69` |

| **Punkt 14A: Berliner Aktivierung technisch abgesichert** — V-1 (Staffelung strukturell erzwungen: 9 Einzeldateien, je eine Transaktion, fail-closed `raise exception`-Riegel, Telemetriebeleg vor Stufe 2, Rollback je Stufe, Dry Run je Schritt) und V-2 (Landesmodule brauchen Freigabe **und** ein berechtigtes Landtagsmandat) | PR #138, gemergt 2026-07-26 19:14 UTC (`2f58d4c`), CI grün, Deployment `READY`. **Keine** Production-Mutation; auf `main` read-only nachgemessen: 0 Landesmodul-Wege aktiv, alle 18 Landeswege `needs_review`+`manual` |

| **Punkt 18: Production-Inventur aller Quellenpakete ist ein Werkzeug, keine Tabelle** — die Inventur vom 2026-07-25 war eine Handerhebung und veraltete still; genau der Fehlermodus, den sie aufdecken soll. Jetzt: `node scripts/paket-inventur.js` führt die **vier bereits vorhandenen** Wahrheiten zu **einer Paketzeile** zusammen (Bestand · Crawl-Plan = tatsächliche Einplanung · Referenzzählung über die echten Profile · Punkt-16-Laufverhalten aus `source_crawl_telemetry`) und leitet daraus **genau einen** Zustand ab: gesund · eingeschränkt · ausgefallen · inaktiv · unbekannt. Kein zweites Inventursystem, keine zweite Datenhaltung, Punkt 16 unverändert. Neu ist die Trennung der **zwei Achsen** je Abrufweg — `planzustand` (eingeplant/defekt/ausgeschlossen **mit Grund**) und Punkt-16-Laufklasse; ohne sie sah ein bewusst abgeschalteter `broken`-Weg wie ein Datenloch aus. „Aktiviert" heißt hier **eingeplant und ausführbar**, nicht „Datensatz vorhanden". Unbekanntes wird nie grün; Pakete ohne Abrufwege, ohne Lieferung oder ohne verwertbare Telemetrie tragen eigene Kennzeichen. Rein additiv auch im Admin (`sources.paketInventur` + Karte „Paket-Inventur"). **Production-Nachweis erbracht** (read-only, 2026-07-27 07:30 UTC, §9) | `quellenarchitektur/30-paket-inventur-production.md` (kanonisch, neu gefasst); `paket-inventur-test.js` **162/162**, `admin-source-ui-test.js` 40 → **56/56**, Offline-Suite **163/163**, Browser-Smoke **32/32**; Reproduzierbarkeit **gegen Production** belegt (zwei Läufe mit `--stand=…` byte-identisch, 289 526 Bytes); Zahlen per SQL gegengeprüft (9 Pakete · 163 Wege · 165 Zuordnungen; 140 + 4 + 19 = 163). Branch `claude/phase1-point18-production-inventory-l60wzr`. **Keine** Production-Mutation, **keine** Migration, **kein** Flag verändert. Der Admin-Teil ist getestet, aber **noch nicht deployt** (Merge = Deployment, freigabepflichtig) — der Production-Nachweis läuft über das Betriebsskript |

| **Punkt 14B: Berliner Abnahmeprofil ist ausführbar statt beschrieben** — Schritt 5 der Aktivierungsreihenfolge war der einzige der 9 Production-Schritte ohne Datei, ohne Vor-/Nachbedingung, ohne Dry Run und ohne Rollback-Datei. Jetzt: **4 generierte SQL-Dateien** (anlegen + Rollback Stufe 0/1/2), fail-closed, idempotent, drift-gebunden; read-only **Dry Run gegen Production**; neuer Backup-Umfang `--scope=profil` für die beiden Tabellen, die der Schritt mutiert | `berlin-abnahmeprofil-pgverify.sh` **36/36 gegen echtes PostgreSQL 16**, `berlin-abnahmeprofil-test.js` **78/78**, `backup-export-test.js` 38 → **48/48**, Offline-Suite **157/157**, Browser-Smoke 32/32, Dry Run gegen Production Exit 0. **Keine** Production-Mutation. Branch `claude/helmut-production-berlin-prep-l0lfbg`, Details `betrieb/berlin-aktivierung.md` §20 |

## 3 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt | → OP |
|---|---|---|
| **Zuverlässige Cron-Telemetrie bei Zeitüberschreitung (R-6)** — Laufdatensatz je Cron in der bestehenden Fairnesszeile, bei jedem Mandatsübergang fortgeschrieben; äußerer Timeout-Vermerk ohne Abschlussbehauptung; `rekonstruiereLauf` rechnet die vollständige Telemetrie nach. Ursache dreiteilig belegt (`Promise.race` beendet nichts · innere Deadline ist ein START-Gatter · `finally` trägt bei Prozessabbruch nicht) | **Nur noch Merge + rein lesender Production-Nachweis** nach [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §11.8: mind. 24 h reguläre Kadenz, darunter **mindestens ein Lauf mit äußerem Zeitlimit**. Repository-Umsetzung vollständig: Suite **285/285**, Mutationsprobe **15/15 rot**, Offline-Suite ohne Delta zur Basislinie, Smoke **32/32**. Keine Migration, keine Konfigurationsänderung | OP-25 (R-6) |
| **Faire Mandantenreihenfolge der Mehrmandanten-Crons** (Rotation nach ältestem Versuch, persistent, ohne Migration; Garantie ceil(n/k) für k ≥ 1, Beobachtbarkeit je Mandat) | **Nur noch Merge + regulärer Production-Lauf**: erwartet werden über die vier Läufe (04/10/16/20 UTC) alle aktiven Mandate mindestens einmal begonnen, belegt über die `[cron/*/fairness]`-Zeilen. Repository-Umsetzung vollständig: Suite **176/176**, Mutationsprobe **9/9 rot**, **CI-Gate grün** (183/183 + 32/32, Lauf `30499103799`), Überlappungsschutz und Persistenzhärtung belegt | OP-25 |
| Google-News-Härtung (Gate/Retry/Breaker/Cooldown, Default AN) | Production-Beweislauf unter echter Drosselung | OP-15 |
| Monitoring-Zweitkanal + Meta-Heartbeat (Sender gehärtet) | `HELMUT_MONITORING_WEBHOOK_URL` unset → No-Op, kein `webhook.sent`-Beleg | OP-07 |
| `source_id`-Dubletten-Fix | Live-Nachweis „Telemetriezeilen = distinct `source_id`" | OP-19 |
| Zweitmandanten-Provisionierung + Per-Mandant-Kostendeckel | Migration `20260721` nicht angewandt, `HELMUT_TENANT_LLM_CAP` AUS, DB-seitige Durchsetzung unentschieden | OP-03 |
| Retention/Löschung | nur Trockenlauf; braucht verbindliche Fristen aus OP-02 | OP-12 |
| **Kostenmessung je Lauf und je Tag** (Phase-1-Punkt 17) — Auswertung ist belastbar und ehrlich: Beispiellauf **0,026805 USD**, Betriebstag im Mittel **0,1370 USD**, global/direkt **79 %/21 %** gemessen, unbekannte Kosten nie als 0,00; PR #136 | die **Datengrundlage** ist unvollständig: ~16 % Logverlust (K-1) · Preisbasis unbelegt (K-2) · Nicht-LLM-Provider ungemessen und ungedeckelt (K-6) · Gesamtbetrag nur **Untergrenze** · pro Mandant nur die 21 % direkt zurechenbaren Kosten (Rest bleibt global) · Ringpuffer 5 000 (K-7) | Punkt 17 · OP-03 |
| Understanding-Gate, Cheap-Triage, Scoring, Berlin/Brandenburg | in `shadow`/`off`, Scharfschaltung ist Freigabe | OP-18, OP-21, OP-22 |
| Pre-Seed-Sicherung + gezielter Seed-Restore (kein `drop table cascade`) — gebaut, adversarial reviewt, isoliert getestet (43/43 lokal, 41/41 in CI; `backup-export-test` 38/38; Suite 147/147). **Am 2026-07-26, 16:47 UTC erstmals real gegen Production gelaufen:** 8/8 Tabellen, 0 Fehler, `vollstaendig: true`, `pruefsummeGesamt` `49a5b92d…`, an `mainCommit 93006e8` gebunden | der **Restore** ist weiterhin nie gegen Production gelaufen (bewusst — freigabepflichtig); der **isolierte Voll-Rückweg ist seit 2026-07-28 bewiesen** (40 Tabellen, `betrieb/restore-uebung-2026-07-28.md`); der Seed-Restore deckt weiterhin nur seine 8 Tabellen ab | OP-01 |
| **Berlin-Aktivierungsreife (Phase-1-Punkt 14)** — Gate je Land freigebbar, `manual` ist eine echte Sperre, Aktivierungs-SQL + 3 Rollback-Stufen generiert und getestet, Runbook vollständig. **Zweiter Durchgang 2026-07-26:** Neutralität von `berlin-basis` ist jetzt eine **ausführbare Prüfung** (Code neutral, Production-Bestand **nicht** — Befund A-3 reproduziert), Wege **neu verifiziert** (Aktivierungsset 6 → **4**, zwei Wege veraltet), Lastmodell gegen gemessene Production-Zahlen korrigiert, Profilplan getestet, Aktivierung gestaffelt, Rollback gehärtet. **Dritter Durchgang (Production-Sprint) 2026-07-26:** Ausgangszustand vollständig gemessen, **Sicherung real erstellt**, Dry Run gegen den Ist-Zustand bestätigt (3/3/1/2 Zeilen, 0 Bund, 0 Brandenburg). **Vierter Durchgang (Zwischensprint 14A) 2026-07-26:** die beiden Vorprüfungsbefunde sind **behoben** — **V-1** (Staffelung war nur ein Kommentar: Block A/B1/Stufe 1/Stufe 2 in einer Datei, Block B in einer Transaktion) → **9 Dateien, je eine Transaktion**, mit `raise exception`-Riegeln, Reihenfolge in beide Richtungen erzwungen, **Telemetriebeleg** für Stufe 2 (je Weg ≥2 `ok`-Läufe), Dry Run **je Schritt**, Rollback **je Stufe**; **V-2** (Landesquellenauflösung wirkte global) → Landesmodule brauchen **Freigabe UND ein berechtigtes Landtagsmandat**, und ihre Wege erscheinen nur in der Versorgung berechtigter Mandate (`planQuellenFuerProfil`). Read-only gemessen: **kein** Production-Effekt heute (0 Landesmodul-Wege aktiv, Plan unverändert 140 Wege, alle 8 Profile mit unveränderter Versorgung). **Fünfter Durchgang (zweiter Production-Anlauf) 2026-07-26, 19:15–19:30 UTC:** PR #138 ist gemergt (`2f58d4c`, CI grün, Deployment `READY`), Startprüfung **11 von 14** erfüllt, Ausgangszustand neu gemessen, alle **8** Dry-Run-Schritte grün, Suiten grün (156/156 · Berlin 126/71/109 · Mandatsgate 71 · Punkt 16 160/160 · Punkt 17 128/128). **Erneut nichts mutiert** (`berlin-aktivierung.md` §19). **Sechster Durchgang (Vorbereitungssprint 14B) 2026-07-26, 20:15–21:10 UTC:** der zweite Blocker ist **beseitigt** — das Abnahmeprofil ist keine Entwicklungsaufgabe mehr, sondern **4 geprüfte SQL-Dateien** (anlegen + 3 Rückwege), gegen ein echtes PostgreSQL 16 bewiesen (36/36) und read-only gegen Production trockengefahren (Schritt 1 **jetzt ausführbar**: 4/4 Vorbedingungen, Treffer 1+1 Zeilen, 5/5 Nachbedingungen, Kontrollfragen 0). Zusätzlich: **zwei frische Sicherungen** (`pre-seed` 8/8 und der neue Umfang `pre-profil` 2/2, beide `vollstaendig: true`) und der Nachweis, dass **zwei** DB-seitige Not-Aus-Schalter (Profil deaktivieren · Wege auf `manual`) **jeder für sich** jeden Berliner Abruf stoppen — auch bei gesetztem Flag. **Erneut nichts mutiert** (§20). **Siebter Durchgang (dritter Production-Anlauf) 2026-07-26, 20:49–21:30 UTC — erstmals AUSGEFÜHRT:** der Betreiber hat `HELMUT_LANDESMODULE=berlin` gesetzt und Production neu deployt (Redeploy `dpl_7443DBt1…`, 20:58:57 UTC, `action: "redeploy"` auf **demselben** Commit `b83d33f` — starkes Indiz für eine Env-Änderung, **kein** Wertbeleg; der Flag-Wert bleibt aus einer Sitzung unlesbar). Startprüfung erstmals **14 von 14**. Zwei frische Sicherungen (`pre-seed` `49a5b92d…` 8/8, `pre-profil` `0c514ace…` 2/2, beide **byte-identisch** zu 14B → DB nachweislich unverändert), beide Dry Runs Exit 0, Ausführungskanal vorab per Riegeltest geprüft (`raise exception` bricht ab, 0 Zeilen). Dann **vier Mutationen, je eine Transaktion**: Block A 21:01:08 (`berlin-basis` **10 → 7** Wege, `die-linke-berlin` **0 → 3**, Summe 165 unverändert → **Befund A-3 in der DB geschlossen**) · Abnahmeprofil 21:01:52 (Profile 8 → **9**, aktive Mandate 6 → **7**, Landtagsprofile 0 → **1**, kein Klarname, Partei `Fraktionslos`) · B1 21:02:11 (`prepared` → **`active`**) · **Stufe 1** 21:02:48 (`rp-be-regionale_leitmedien` + `rp-rbb24-politik` → `healthy`/`auto`; beides **RSS-Direktfeeds**, keine Suchmaschine). Gegen den echten Resolver mit den mutierten Daten gerechnet: Plan **140 → 142**, genau die 2 Stufe-1-Wege, **0** Brandenburg; **alle 8 Bestandsmandate unverändert bei 140 Quellen** — auch die fünf Bundestagsmandate mit `bundesland=Berlin` erhalten **0** Berliner Wege (V-2 an echten Daten belegt). Neu: `scripts/berlin-beweislauf-auswertung.js` macht §10/§11 ausführbar (Referenzmessung **9 grün · 0 verletzt · 7 unbekannt**) und meldet Kriterium 16 ehrlich als `nicht_aus_db_messbar`. Suite **158/158** vor dem Eingriff (§21). **Abbruch und Rollback am selben Abend (§22):** um **22:05:34 UTC** wurde **PR #143** (Reparatur der Vorgangsbildung, 3 449 Zeilen an `understanding.js`, `scheduler.js`, `storage.js`, `server.js`) nach `main` gemergt und deployt — **nach** meiner Startprüfung um 21:32. Vier Minuten später endete ein **manuell** ausgelöster `GET /api/pipeline/run` um **22:09:52 UTC** mit **HTTP 504** (`Task timed out after 300 seconds`), dazu ein fail-closed Lock-Timeout und **0 Telemetriezeilen** bei 46 geschriebenen Rohdokumenten. Damit war **Abbruchkriterium 16** eingetreten (und über den Pending-Sprung 50 → 226 auch Kriterium 9). **Rollback ausgeführt:** Ebene **0b** um 22:43:06, Ebene **2** um 22:43:23 UTC. Endzustand nachgemessen: **0 berechtigte Berliner Mandate, 0 aktive Berliner Wege**, Brandenburg 8/8 gesperrt, Bund unverändert, Suite **160/160**. **Ursache sehr wahrscheinlich nicht Berlin:** der 20:00-Lauf lief bereits mit 6 Mandaten **vor** der Aktivierung ins selbe Limit, die Clusterlast sprang von **91 auf 336** (die erklärte Wirkung von #143), und Berlin steuerte **0** Dokumente bei | der **Betriebsnachweis** vollständig: **0** Berliner Telemetriezeilen und Rohdokumente **jemals**, 0 Knowledge Objects, 0 Vorgänge, keine Lage, kein Briefing. **Stufe 2 wurde nie aktiviert.** Vor allem offen bleibt die Kernfrage: **ob `HELMUT_LANDESMODULE=berlin` in Production wirkt, ist unbewiesen** — belegt ist nur der Redeploy, nicht der Flag-Wert; der eine Lauf mit aktivem Berlin brach ab, **bevor** Telemetrie geschrieben wurde. **Nächste Schritte in dieser Reihenfolge:** erst #143 stabilisieren (176 neue `pending`), dann das 300-s-Zeitbudget klären (OP-15/B1), **erst danach** Berlin erneut aktivieren. Neue Startbedingung: kein frisch deploytes Pipeline-Update und kein manueller Vollpipeline-Lauf im Beobachtungsfenster | Punkt 14 |
| **Automatische Quellenstörungs-Erkennung (Phase-1-Punkt 16)** — `source_crawl_telemetry` hat einen Lesepfad (Befund **A-6** behoben); 14 Zustandsklassen, 4 Handlungsstufen, rhythmus-bewusste Leer-/Veraltet-Schwellen, Erholungsregel, Paket-/Mandatswirkung, Meldungs-Deduplizierung; Admin-Bereich „Quellen & Watchdog” erweitert | der **Production-Beleg für 7 der 14 Klassen** (u. a. `parserfehler`, `veraltet`, `nie_erfolgreich`) — diese Fehler sind in Production real nie aufgetreten und dürfen nicht künstlich erzeugt werden; ausschließlich testbelegt | Punkt 16 |
| OP-06 Terminales Aussortieren des Alt-Rückstands (34 Fälle, Default AUS) | Ausführung ist freigabepflichtig — **und** eine offene Fachfrage: 16 der 34 Allowlist-Einträge sind mit „außerhalb Mandat" begründet, also relativ zum Pilotmandat, geschrieben wird aber in das mandantenneutrale `knowledge_objects` (kein `tenant_id`). Ein künftiger Zweitmandant mit regionalem/EU-Schwerpunkt bekäme diese Vorgänge dauerhaft nie verstanden | OP-06 |
| **Diagnosesprint CSD-2026 (Betriebsbefund B4)** — belastbar bewiesen, warum der tödliche Anschlag auf den Berliner CSD (25./26.07.) in keiner Lage/keinem Briefing erschien: Quellen und Crawl arbeiteten fehlerfrei (21 Rohdokumente, 0 Fehler/Rate-Limits/Parserprobleme), der Verlust liegt in der **Vorgangsbildung** — `deriveVorgangId()` reduzierte einen Cluster auf ein einzelnes Wort; kollidierte dieses Wort mit einem älteren, fachfremden Knowledge Object, verwarf `understandOneCluster` den Cluster lautlos (`skipped-exists`). Ergebnis: **0 Knowledge Objects** zum Anschlag trotz vollständiger Quellenabdeckung. Vollständige Beweiskette in [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §1–§8 | **erledigt durch den Reparatursprint** (nächste Zeile) — die Diagnose selbst ist abgeschlossen; Branch `claude/csd-2026-event-diagnosis-lr4sr4`, PR #141 gemergt (`8085745`) |

| **Reparatursprint Vorgangsbildung (Betriebsbefund B4)** — der stille Verlustpfad ist geschlossen. **Leitentscheidung:** `vorgang_id` trug zwei unvereinbare Aufgaben zugleich (fachliche Identität *und* technischer Eindeutigkeitsschlüssel) — jetzt getrennt: die Kennung `vg-<themenwurzel>-<ereignistag>-<prüfsumme>` ist ein **Vorschlag**, die Zugehörigkeit entscheidet ein **Belegvergleich** gegen echte Kandidaten (neu `lib/helmut/vorgang-identity.js`, `resolveVorgang()` in `understanding.js`). Ankerschwelle 8 → 5 Zeichen plus Abkürzungen („CSD", „AfD") und Jahreszahlen; der Teilstring-Abgleich (`a.includes(b)`, dieselbe Konstruktion wie F-3) ist durch ein **Beweisgewicht** ersetzt; Clusterbildung ist **reihenfolgeunabhängig**. **Korrektur 2026-07-27:** die frühere Aussage „gegen Digest-Cluster abgesichert" war **falsch** und ist widerrufen — das Ventil begrenzt einen Cluster nur *innerhalb eines Laufs*, nicht das Wachstum eines Vorgangs über die Auflösung (neuer Befund **B4-2**, `befund-csd-2026-vorgangsverlust.md` §12b). **`skipped-exists` ist ersatzlos entfallen** — jeder Ausgang ist klassifiziert (`saved`/`updated`/`merged`/`duplicate`/`skipped-*`). **Verknüpfungsinvariante:** jeder Ausgang mit gefundenem Vorgang schreibt `ko_document_links`, dadurch ist der Endzustand jedes Rohdokuments **ohne neue Tabelle und ohne Migration** ableitbar (neu `lib/helmut/vorgangs-lebenszyklus.js`, 6 Zustände, genau einer unzulässig). Nachholpfad repariert (zurückgestellte Cluster werden vorgemerkt **und** verknüpft; der Nachhollauf bildet Cluster aus den Verknüpfungen statt aus einer Neuclusterung — vorher: 3 Läufe, 0 verarbeitet) plus Werkzeug `scripts/vorgangsbildung-nachholen.js` (Vorschau ist Standard, Ausführung braucht `HELMUT_NACHHOLEN_BESTAETIGT=ja`, harte Mengengrenze). Telemetrie je Lauf **und je Tag**; Großereignisse werden **flagunabhängig** vorgezogen; Watchdog im Health-Report-Cron (48-h-Fenster, mandantenneutral, einmal je Lauf). **Nebenbefund behoben:** `listRawDocuments`/`listRecentRawDocuments` wurden von PostgREST still auf 1 000 Zeilen gekappt — Aufrufe mit `limit=2000` sahen die Hälfte nicht. **Read-only verifiziert (7 Tage, 1 970 Rohdokumente):** Altverfahren 254 Kollisionen = **47,3 % der Rohdokumente** → *die 47-%-Angabe ist bestätigt*; neues Verfahren **0 Kollisionen**, 252 Cluster schreiben einen Bestand fort. Gesamtbild schlechter als gedacht: **76,3 % der Rohdokumente haben heute keinen nachvollziehbaren Endzustand** (ältestes 161 h alt). Tests: Offline-Suite **160/160** (3 neue Suiten: Identität 52, Lebenszyklus 55, CSD-Regression 38 Assertions), Browser-Smoke **32/32**. **Keine** Production-Mutation, **keine** Migration, **kein** Flag verändert | der **Production-Nachweis** — **Anlauf 1** (2026-07-27, 07:17 UTC) brach vor jeder Mutation ab (kein KI-Schlüssel in der Sitzung), **Anlauf 2** (08:41 UTC) wurde ausgeführt und ist **gescheitert**: kein CSD-Vorgang, stattdessen 20 falsche Verknüpfungen und ein überschriebener Bestandsvorgang; neuer Defekt **B4-3**. Rücknahme um 08:56 UTC ausgeführt und gegengemessen (netto 0 veränderte Zeilen, `befund-csd-2026-vorgangsverlust.md` §15.9). Vor jedem weiteren Nachhollauf ist B4-3 zu beheben. Nachweisplan und Freigabeanfrage: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §12/§13. **Kostenbefund, der eine Entscheidung braucht:** die Obergrenze der KI-Aufrufe steigt von **115 auf 159 je Tag bei Tagesbudget 100** — der Engpass bestand vorher, wird jetzt aber sichtbar (`skipped-budget` statt stillem Verlust). Damit wird **OP-14** (Relevanzsortierung) dringlich. **Getrennt** freizugeben: das Nachholen des Altbestands (1 504 Dokumente). Branch `claude/helmut-vorgangsbildung-fehler-coolvq` |

| **Hotfix Vorgangsbildung B4-3 (2026-07-27)** — der Resolver zählte **Flexionsformen desselben Wortes als unabhängige Belege**. Der Bestandsvorgang `vg-angriffen` (**1** Dokument, Trump/Iran/Huthi) hatte den Kern `["angriffen","droht","huthi",…]`, der Berliner CSD-Cluster `["angriff","angriffe","berlin","csd",…]` — beide CSD-Formen trafen auf „angriffen", ergaben Gewicht 2 und erfüllten `MIN_BEWEISGEWICHT=2` allein durch **einen generischen Wortstamm**. Folge in Production: 19 CSD-Dokumente in einem Iran-Vorgang, **0** Knowledge Objects zum Anschlag. **Drei unabhängige Riegel:** (A) `anchorOverlap` gruppiert Treffer zu **Beweisfamilien** und wertet je Familie den *stärksten* Beleg statt der Summe — zwei Schreibweisen sind **ein** Beleg; die Normalisierung ist **aufgezählt**, keine allgemeine Stammwortlogik (ein Stemmer zöge „Wahlkampf"/„Wahlrecht"/„Auswahl" zusammen). (B) **Generische Ereignisfamilien** (Angriff, Anschlag, Treffen, Gespräch, Debatte, Streit, Kritik, Forderung, Entscheidung, Protest, Demonstration, Wahl, Abstimmung, Konflikt, Krise + Vorwurf/Warnung) tragen **0** zum geforderten Gewicht bei; „treffen"/„getroffen" bleiben bewusst getrennt. (C) **Ein-Dokument-Vorgänge** brauchen **zwei** unabhängige spezifische Familien, nicht überwiegend generische Evidenz und keinen Datumskonflikt — bei n=1 ist jeder Anker ein „Kernanker", weshalb solche Vorgänge **leichter** zu treffen waren als Magnete. Read-only gemessen: **735 von 986** Vorgängen (**74,6 %**) haben genau ein Dokument, **sechs** davon allein auf der Familie „angriff". Zusätzlich: exakt gleiche **Abkürzungen** (3–4 Zeichen) zählen als starker Beleg (ohne das zerfiele der CSD-Vorgang), Allerweltskürzel (Parteien, Sender) ausgenommen. **Magnet-Analyse erweitert:** sie war blind, weil die 19 CSD-Dokumente *untereinander* kohärent waren (Kohärenz 0,95 > Schwelle 0,6) — neu erkennt sie die **Übernahme** (winziger Ursprung, großer fremder Block, **keine** gemeinsame spezifische Familie) plus `gespalten` und `evidenzUeberwiegendGenerisch`; an Production kalibriert (ein Fremdblock ohne eigenen Kern ist **keine** Übernahme: 14 → **9**). **Nachholskript:** `--ids` wirkt jetzt **vor** der Mengenkappung (Gegenprobe: vorher hätten **0 von 21** Kennungen überlebt), `--ids=` bricht ab, die Vorschau nennt **jede** Kennung. **Storage-Gate** (neu `lib/helmut/production-schreibgate.js`): ein Production-Schreiblauf bricht **vor** dem ersten fachlichen und dem ersten KI-Zugriff ab, wenn Fachtabellen und Betriebsdaten nicht beweisbar dasselbe Backend nutzen — ohne `HELMUT_STORAGE_BACKEND=supabase` startet der **LLM-Tagesdeckel bei 0**. **Audit-Blindstelle geschlossen:** `updated_at` wird bei jedem Schreibvorgang gesetzt (vorher war eine Inhaltsaktualisierung nicht auffindbar). Resolver-**Ablehnungen** sind jetzt telemetriert (`telemetrie.resolver`). **Read-only Production-Vergleich (177 Vorgänge, 2 482 Zuordnungen):** die neue Regel hätte **35 (1,4 %)** verhindert und **1** zusätzlich getragen; **12** davon liegen in Vorgängen, die die Analyse selbst als defekt ausweist, **23** in unauffälligen — davon nach Einzelprüfung **10–12 plausibel richtige** (**0,4–0,5 %** aller Zuordnungen). Tests: Offline **166/166** (3 neue Suiten: Beweisfamilien 103, Übernahme 35, Nachhol/Gate 52), Browser-Smoke **32/32**, **5 Mutationen** des Fixes machen die Suite je einzeln rot. **Keine** Production-Mutation, **keine** Migration, **kein** Flag verändert | der **Production-Nachweis** — er verlangt Merge + Deployment und ist freigabepflichtig. **Ehrliche Grenze:** die exakte Konstellation aus dem gescheiterten Lauf ist **heute nicht mehr reproduzierbar** (Rückweg ausgeführt; die 33 vorhandenen CSD-Rohdokumente ergeben den Kern `["berlin","berliner","csd"]` ohne die Familie „angriff", alle Kurzfassungen leer) — der Rot/Grün-Nachweis ruht deshalb auf den in §15.5 **dokumentierten echten Kernen**, mutationsgeprüft nachgebaut. **Nicht enthalten:** Bereinigung der 20 Magnete und 9 Übernahmen im Bestand (Production-Schreibzugriff mit KI-Kosten, eigene Freigabe). Details: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §16. Branch `claude/hotfix-b4-3-vorgangsbildung-hzn92o`, **PR #147 gemergt** (`27d7787`) — der Code ist damit deployt, der **Nachweis am echten Fall** steht weiter aus. **Zusätzlich blockierend:** der beim Abschlusslauf gefundene Defekt **B4-4** (nächste Zeile) ist noch nicht gemergt |

| **Hotfix Vorgangsbildung B4-4 (2026-07-27)** — **Herausgebernamen stifteten Vorgangsidentität.** Google-News-RSS liefert Titel der Form `<Schlagzeile> - <Herausgeber>`; der Suffix wurde zu einem ganz normalen Anker. `tagesspiegel` hat **13 Zeichen**, lag damit über `STRONG_ANCHOR_LEN` und galt als **starker** Beleg (Gewicht 2) — er erfüllte `MIN_BEWEISGEWICHT=2` **allein**. Weil der Zielvorgang schon mehrere Tagesspiegel-Artikel enthielt, genügte der gemeinsame Herausgeber für eine Zusammenführung: „Kai Wegner zu queeren Rechten … - Tagesspiegel" landete in einem fachfremden Vorgang. **Zweiter, unauffälligerer Weg:** `isAcronym()` erkennt 3–6 Zeichen mit ≥ 2 Großbuchstaben — `DIE ZEIT`, `WELT`, `BILD`, `FAZ` zählten als **starke** Abkürzungen; sogar der Artikel **„DIE"** wurde zum Identitätsanker (Production-Kern von `vg-zeit-20260311-030001`, 26 Dokumente: `["bundesregierung","die","zeit"]`). **Lösung — neues Modul `lib/helmut/herausgeber.js`, zwei unabhängige Riegel.** Leitgedanke: *ein Herausgebername in Herausgeberposition beschreibt die **Herkunft**, nicht das Ereignis* — jedes Dokument desselben Feeds trägt ihn, er kann strukturell nichts unterscheiden. (A) **Strukturell, ohne jede Wortliste:** der Titel wird vor der Ankerbildung um seinen **belegten** Suffix gekürzt; sechs benannte Belegarten (`quellenname` 262 · `host` 147 · `domainform` 118 · `gattung` 47 · `medienname` 37 · `quellenname-teil` 20 · `titel-ist-herausgeber` 2, gemessen an 1 000 Production-Dokumenten). Wirkt auch für Herausgeber, die in **keiner** Liste stehen (`Vietnam.vn`, `Hasepost`, `bundesregierung.de`). (B) **Aufgezählt:** Medien-, Agentur-, Plattform- und Verlagsgattungsnamen sind **überall** nicht-spezifisch — auch mitten im Text und in Abkürzungsschreibweise. Zusätzlich sind kurze Funktionswörter (`die`, `der`, `und`, `für` …) generisch; sie kamen ausschließlich über die Abkürzungsregel aus Zeitungsnamen in die Anker. **Verworfen und begründet:** blindes Abschneiden des letzten Titelsegments (gemessen falsch — 613 von 1 000 Titeln haben eines, viele sind der echte Schlagzeilenrumpf hinter einer **Dachzeile**) sowie das Streichen aller Quellennamen-Tokens (überschießend: die Quelle „Deutscher Bundestag" nähme jedem Dokument den Sachanker `bundestag`). **Read-only Production-Analyse** (neu `scripts/herausgeber-identitaet-analyse.js`, 1 140 Vorgänge · 3 005 Zuordnungen · 1 000 Rohdokumente): **20 Vorgänge (1,8 %)** tragen einen Herausgebernamen als **Themenwurzel** ihrer Kennung · **524 von 1 000** Rohdokumenten (52,4 %) trugen einen Herausgebernamen unter den Ankern · **130 von 206** geprüften Vorgängen hatten einen im spezifischen Kern, **8** wurden **ausschließlich** dadurch zusammengehalten (u. a. zwei `vg-bundesregierung-*` mit **52** und **48** Dokumenten quer durch Krankenversicherung, Asyl, Haushalt, BAföG, Wohngeld) · **7** haben nach der Kürzung **keinen Sachkern mehr** und können strukturell nichts mehr anziehen · **189 Zuordnungen (6,3 %)** würden heute nicht mehr getragen, **172 davon (91 %)** hingen **allein** am Herausgebernamen. Tests: neue Suite `herausgeber-identitaet-test.js` **109/109** (alle 22 im Auftrag genannten Medien einzeln, Google-News-Suffix eines **unbekannten** Hauses, gleiches Medium/verschiedene Themen, verschiedene Medien/gleiches Ereignis), Offline **167/167**, Browser-Smoke **32/32**, **7 von 7 Mutationen** rot (wiederholbar über `scripts/herausgeber-mutationsprobe.js`, das nur in einem temporären Abzug mutiert). **Keine** Production-Mutation, **keine** Migration, **kein** Flag verändert | der **Production-Nachweis** — er verlangt Merge + Deployment und ist freigabepflichtig. **Ehrlicher Preis der Regel:** von den 189 nicht mehr getragenen Zuordnungen sind **17** nicht allein auf den Herausgebernamen zurückzuführen; 6 davon einzeln geprüft → **5 korrekte Trennungen** (ein Bestandskern lautete `["asteroiden","chinesische","raumfahrt","sonde","tianwen"]` und nahm Mutterschutzmeldungen auf), **1 plausibel richtige Zuordnung verloren** (`vg-koalition-20251128-09e59e`). Damit **0,03 % belegt** bis **0,57 % maximal**. **Nicht enthalten:** Bereinigung der 8 herausgebergetragenen Bestandsvorgänge (Production-Schreibzugriff mit KI-Kosten, eigene Freigabe) — die Regel verhindert nur ihr **Weiterwachsen**. Details: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §17. Branch `claude/b4-4-publisher-identity-hotfix-k03z30`, **PR #149 gemergt** (`ad0cf99`) und deployt |

| **B4-4 in Production nachgewiesen (2026-07-27, 12:15 UTC)** — der eng begrenzte Nachhollauf für die **zwei** aus Anlauf 3 verbliebenen CSD-Rohdokumente ist auf dem deployten Stand `ad0cf99` gelaufen (`nachhol-20260727121511`, 12:15:11–12:15:52 UTC, 39 s, 2 Cluster). **Beide wurden als eigene neue Vorgänge aufgelöst** (`aufloesungen: {"neu": 2}`) — kein Bestandsvorgang wurde angenommen. Entscheidend und vorab read-only nachgerechnet: beim Wegner-Dokument entfernt die Suffixkürzung `Tagesspiegel` über den **Host-Beleg** (`source_name` ist bei beiden Zieldokumenten `NULL`, getragen hat also der strukturelle Riegel), die Themenwurzel ist danach `grundgesetz`, und das Präfix `vg-tagesspiegel` **erscheint nicht einmal mehr in der Kandidatensuche** — der Fehler ist eine Stufe **vor** dem Beweisvergleich abgeschnitten. Zielzustand: `rd-8c977d6b…` → **`vg-grundgesetz-20260725-15b616`** (neu), `rd-d982a68f…` → **`vg-islamisten-20260726-0ab9e8`** (neu, `complete`). Vorher/nachher vollständig gegengemessen: `knowledge_objects` 1 140 → **1 142**, `ko_document_links` 4 141 → **4 143**, `pending` 426 → 427, LLM-Zähler 52 → **54** (exakt 2 Aufrufe), aktive Locks 0 → 0. **Unverändert:** `vg-csd-20260727-12aae0` (27 Dokumente, `updated_at` 10:29:28, Magnet-Analyse Kohärenz **0,96**, unauffällig), `vg-tagesspiegel-20260519-f29ebd` (2 Dokumente, `pending`, `updated_at` 10:48:09), `vg-angriffen` (1 Dokument). **Außerhalb der Zielmenge wurde nichts verändert** (seit 12:14 UTC: 2 neue und 2 geänderte Knowledge Objects — dieselben zwei —, 2 neue Verknüpfungen, 0 neue Rohdokumente, 0 Telemetriezeilen). **Kein Abbruchkriterium eingetreten, kein Rückweg nötig.** Das Sitzungs-Schutzlimit (Default 50 bei 52 verbrauchten Aufrufen) wurde **ausschließlich als Präfix an genau diesen einen Befehl** auf 55 gesetzt — keine Vercel-Env, kein Export, keine Persistenz; Production-Budget (100) und Reserve unverändert. **11 von 12 Abnahmekriterien erfüllt; das offene Kriterium ist am 12:36 UTC geschlossen (nächste Zeile)** | Kriterium 2 war zunächst nur **teilweise** erfüllt: das Wegner-Dokument lief in einen **Azure-Zeitüberlauf** (`skipped-error`, `OpenAI request timeout`). Es ist **zugeordnet und verknüpft**, sein Vorgang steht aber auf `pending`/`failed` mit leerem Inhalt und ist regulärer Wiedervorlagekandidat (`fehlgeschlagen -> vg-grundgesetz-20260725-15b616`). Die Wiedervorlage war in diesem Sprint nicht erlaubt (genau ein Lauf). **Zwei Werkzeugbefunde, nur beobachtet:** (W-1) `listRawDocuments` liefert bei jedem Lesefehler `[]`, der Aufrufer unterscheidet das nicht von „leer" — ein DNS-Fehler ergäbe „Nichts nachzuholen" mit Exit 0; in diesem Lauf **nicht** eingetreten, durch Codeinspektion belegt. (W-2) `processRuns` (Store-Zeile **`main-auth`**, 148 Einträge, jüngster 10:29:31) enthält **weder** diesen Lauf **noch** den zurückgerollten Restlauf — obwohl die Zeile um **12:15:54** geschrieben wurde. Muster eines **Last-Write-Wins-Verlusts** auf dem zentralen Blob; der Aufruf ist zusätzlich mit `.catch(() => {})` abgesichert. Details: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §18 |

| **B4-4-/CSD-Production-Nachweis abgeschlossen (2026-07-27, 12:36 UTC)** — die kontrollierte Wiedervorlage des letzten offenen Rohdokuments lief auf dem deployten Stand `c85167e` (`nachhol-20260727123643`, 16 s, 1 Cluster). Ergebnis: `aufloesungen: {"bestand": 1}` — der **bestehende** Vorgang `vg-grundgesetz-20260725-15b616` wurde weiterverwendet und ist jetzt **`neu`/`complete`** mit fachlich korrektem Inhalt („Kai Wegner forderte im Bundestag ein klares Bekenntnis zu queeren Rechten im Grundgesetz …", `confidence_score` 75, `understanding_model` gpt-5-mini). **Pfadanalyse als Kern des Sprints:** `understandOneCluster()` verweigert einen geparkten Vorgang ausdrücklich (`understanding_status === "failed"` → `skipped-failed`, kein KI-Aufruf) — ein reiner Nachhollauf hätte den Vorgang nie vervollständigt. Von den drei vorhandenen Reset-Pfaden waren zwei unzulässig (`bulkResetUnderstandingFailed` und `ko-recovery.js` wirken auf **alle** damals **8** `failed`-Vorgänge, letzterer braucht zusätzlich ein Flag); gewählt wurde die bestehende, in `server.js` verdrahtete Ein-Vorgang-Primitive **`resetUnderstandingToPending`** mit konditionalem Filter (`vorgang_id=eq.<Ziel>` **und** `understanding_status=eq.failed`) — gegengemessen 8 → **7** `failed`, die übrigen sieben unberührt. Vor dem Schreibzugriff read-only bewiesen: abgeleitete Kennung **identisch**, `resolution=bestand`, spezFamilien 10 / gewichtSpez 10 bei nötig 2, „neuer Vorgang würde entstehen: **false**"; Linkverdopplung ist strukturell ausgeschlossen (`v3Upsert` auf `knowledge_object_id,raw_document_id`). Nettowirkung: `knowledge_objects` **1 142 → 1 142**, `ko_document_links` **4 143 → 4 143**, `pending` 427 → 426, `failed` 8 → 7, LLM-Zähler 54 → **55** (**+1**), aktive Locks 0. **Genau eine geänderte Zeile** seit 12:36:30 — der Zielvorgang; 0 neue Knowledge Objects, 0 neue Verknüpfungen, 0 neue Rohdokumente. `vg-csd-20260727-12aae0` (27 Dok.), `vg-tagesspiegel-20260519-f29ebd` (2 Dok., `pending`), `vg-angriffen` (1 Dok.) und `vg-islamisten-20260726-0ab9e8` **unverändert**. Der Sitzungsriegel wurde nur als Präfix an den einen Schreibbefehl auf **55** gesetzt — der kleinste Wert, der genau einen weiteren Aufruf zulässt und einen zweiten blockiert. **Alle 14 Erfolgskriterien erfüllt, kein Rückweg nötig.** Damit sind **beide** Restdokumente zugeordnet, verknüpft und verstanden — der B4-4-/CSD-Nachweis ist **vollständig** | **erledigt.** Benannter Qualitätspunkt ohne Handlungsbedarf: `headline` und `display_title` des neuen Vorgangs sind **leer** — `sanitizeDisplayTitle()` verwirft einen Modelltitel bei schwacher Qualität bewusst, statt ihn abzuschneiden, und beide Felder sind im Schema nicht verpflichtend; die Anzeige greift auf das gefüllte `display_summary` zurück. **Weiterhin offen, ausdrücklich nicht Teil dieses Sprints:** Bereinigung der herausgebergetragenen Altvorgänge, die Werkzeugbefunde W-1/W-2 (**bearbeitet am 2026-07-27** — siehe Zeile „Werkzeug-Härtung W-1+W-2" unten) und die verbleibenden **7** `failed`-Vorgänge. Details: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §19 |

| **Pipeline-Zeitbudget (Stabilisierungssprint 2026-07-27)** — der Crawl bricht seit dem #143-Deployment nach 300 s ab. **Ursache quantifiziert, nicht geschätzt:** Crawl ~156 s (1 745 Google-News-Auflösungen) + `lazy` 16,8 s + `eager` 90 s = **263 s**, bevor der neue Vormerk-Loop für zurückgestellte Cluster überhaupt beginnt — und er war der **einzige Loop der Kette ohne Zeitgrenze** (gemessen 1,7 Cluster/s, ~300 Cluster → ~176 s nötig, 37 s vorhanden). Zweiter Teil: `/api/cron/crawl` war der **einzige Cron ohne jedes Zeitlimit**, während `/api/cron/pipeline` seit je `withTimeout` **und** `deadlineMs` hat. **Reproduzierbar** (22:09 manuell, 04:01 Cron) und **Berlin-unabhängig** (04:01 lief mit 6 Mandaten, 0 Berliner Wegen). Reparatur: Zeitgrenze für den Vormerk-Loop, Gesamtbudget `HELMUT_CRAWL_GESAMTBUDGET_MS` (240 s) aus dem alle Phasen `min(Budget, Restzeit)` erhalten, und dieselbe Zeitgrenze für `/api/cron/crawl` und `/api/pipeline/run`. **#143 ist nicht kaputt** — sein Nachholpfad arbeitet nachweislich (05:31-Lauf: 20 × `saved`, `clusterHerkunft: "verknuepfung"`; vorher 0), 1 280 neue `ko_document_links`, 6 von 6 Morgenbriefings. Tests: Offline **161/161**, neu `pipeline-zeitbudget-test.js` **21/21**, Browser-Smoke 32/32 | der **Production-Nachweis** — er verlangt Merge + Deployment und ist freigabepflichtig. Baseline vor der Reparatur: 2 × `504` in 12 h · letzte Telemetriezeile 2026-07-26 20:00:47 · `pending` **270** (43 alt + **227 aus den zwei abgebrochenen Läufen**) · 0 aktive Locks. Abnahme nach dem Deployment in `incident_2026-07-27_crawl_zeitlimit.md` §7.2 | Pipeline |

| **Werkzeug-Härtung W-1+W-2 (Megasprint 2026-07-27)** — beide beim B4-4-Nachweis entdeckten Werkzeugdefekte sind behoben bzw. abgesichert. **W-1 (Lesefehler war leere Ergebnismenge):** die vier Lebenszyklus-Lesepfade (`listRawDocuments`, `listRecentRawDocuments`, `listKoDocumentLinks`, `listKnowledgeObjectStates` — die letzten beiden lieferten sogar stille **Teilmengen**) werfen jetzt einen typisierten `StorageReadError` (Quelle + Fehlerklasse dns/timeout/auth/connection/db/http, redigiert, undici-cause-Kette wird mitklassifiziert); `[]` heißt ausschließlich „erfolgreich gelesen, null Zeilen". Das Nachholwerkzeug bricht bei Lesefehler **vor** KI/Write mit **Exit 6** ab („Nichts nachzuholen" nur noch nach erfolgreichem Read); Vorschau und Ausführung identisch fail-closed. **W-2 (Production-Läufe verschwanden aus `processRuns`):** Ursache belegt — Voll-Blob-RMW auf `main-auth`, den ~15 parallele Writer (LLM-Log je KI-Call, Sessions, Locks …) per Last-Write-Wins überschreiben; deterministisch offline reproduziert. Lösung Option B: neue relationale Tabelle **`public.process_runs`** (Migration `20260727` + Rollback, pgverifiziert **21/21** gegen echtes PostgreSQL 16), atomarer Upsert je `(run_id, process)` = append-only + idempotent + parallel-sicher; sechs kanonische Zustände (`running/success/partial/failed/blocked/rolled_back`, CHECK); `recordProcessRun` liefert ein Ergebnisobjekt statt `null`, **kein `.catch(() => {})` mehr** (nachhol/server/scheduler), Telemetriefehler strukturiert geloggt + als systemError + im Abschlussstatus (`lauftelemetrie`, Werkzeug-**Exit 7**); `recordProcessRunStart` macht hart sterbende Läufe sichtbar (nur relational); Dual-Read hält Altbestand ohne Datenmigration lesbar (auch `getRunCostReport`). Flag `HELMUT_PROCESS_RUNS_RELATIONAL` Default AUS (env-inventar §, Migrationsplan Freigabepunkt 4). **Read-only Production-Analyse:** 149 Einträge (16.–27.07., Kappung fern), Blob `main-auth` 1,1 MB; **mindestens 5 unsichtbare Läufe in 12 Tagen** belegt (4 per Telemetrie-Abgleich + `nachhol-20260727121511`); Tabelle in Production erwartungsgemäß nicht vorhanden (404). Tests: `werkzeug-lesefehler-test.js` **43/43**, `prozesslauf-telemetrie-test.js` **37/37**, Mutationsprobe **8/8 rot** (+2 Vorbedingungen grün), Offline-Suite ohne neuen Rotfall (14 Sandbox-Vorbestände = `origin/main`-Baseline), Browser-Smoke **32/32**. **Keine** Production-Mutation, **keine** Migration angewandt, **kein** Flag verändert. Kanonischer Befund: [`betrieb/befund-werkzeug-haertung-w1-w2.md`](betrieb/befund-werkzeug-haertung-w1-w2.md). **Gemergt als PR #152 (`54e9c12`), CI grün, Production-Deployment `dpl_C2ErVsq7sEWyFb3xJTughKx43K5y` READY — W-1 ist damit in Production wirksam.** | **nur noch die Flag-Aktivierung** (nächste Zeile) | W-1/W-2 |

| **Phase B: Migration `20260727` in Production angewendet und verifiziert (2026-07-27, 14:03–14:08 UTC)** — auf Betreiberfreigabe ausgeführt. **Vorprüfung** 14:02 UTC: PR #152 gemergt, beide Pflicht-Checks grün, Production-Deployment READY, **0 aktive Sperren** (alle Lock-Zeilen abgelaufen), nächster Cron erst 16:00 UTC, Supabase-Projekt gegen `SUPABASE_URL` gegengeprüft. **Migration unverändert angewendet**, registriert als `20260727140343`. **Verifikation ohne jede Abweichung:** 22 Spalten in exakter Reihenfolge/Typ/Nullability/Default, `PRIMARY KEY (run_id, process)`, CHECK mit genau den sechs kanonischen Zuständen, beide Indizes + PK-Unique-Index, **RLS aktiv mit 0 Policies**, Grants nur `postgres`/`service_role` (**0** für anon/authenticated/PUBLIC), Kommentar gesetzt, 0 Zeilen. Supabase-Advisor: `rls_enabled_no_policy` **INFO** wie bei 16 Bestandstabellen — **kein neuer WARN/ERROR**. **Telemetrie-Smoke bestanden** (14:06:58–14:07:00, `phase-b-20260727140658`, Prozess `telemetrie-smoke`): über den echten Codepfad, **kein Crawl, kein KI-Aufruf, keine Fachdatenänderung**; **drei Schreibvorgänge auf eine Laufkennung** (`running` → `success` → Wiederholung) ergaben **genau 1 Zeile, 0 Dubletten**, Start→Abschluss auf derselben Zeile; **Dual-Read 150 = 149 Blob-Historie + 1 relational**, Gegenprobe mit Flag AUS 149 und Smoke unsichtbar. Bewusst abgesichert: `HELMUT_STORAGE_BACKEND=local` für den Smoke, damit aus der Sitzung **kein Voll-Blob-RMW** auf `main-auth` ausgelöst wird — genau der Verlustpfad, um den es geht. **Nichts anderes verändert:** `knowledge_objects` 1 142, `ko_document_links` 4 143, `raw_documents` 8 929, `pending`/`failed` 426/7, LLM-Zähler **55 → 55** (0 Aufrufe), Blob `main-auth` **byte-identisch** (1 104 347) mit unverändert 149 Einträgen, 0 aktive Locks; der Smoke steht nachweislich **nicht** im Production-Blob. **Nebenbefund korrigiert:** `20260721` war entgegen der Doku **bereits seit 2026-07-16 angewendet** (in Production an allen sechs Funktionen mit `search_path=public, pg_temp` gegengeprüft) — offen ist damit **nur noch `20260720`**. Details: [`betrieb/befund-werkzeug-haertung-w1-w2.md`](betrieb/befund-werkzeug-haertung-w1-w2.md) §14 | **erledigt** — das Flag ist seit 14:23 UTC gesetzt (nächste Zeile). Festgehaltene Betriebsgrenze: `HELMUT_PROCESS_RUNS_RELATIONAL` war **aus der Sitzung nicht setzbar** (Vercel-MCP-Zugang rein lesend, kein `VERCEL_TOKEN`, kein CLI; `helmut-flags.json` scheidet wegen fester Allowlist aus, und der Code liest bewusst direkt `process.env`) — jede künftige Env-Änderung bleibt Betreiberaktion | W-2 |

| **Phase C: Flag aktiviert, Dual-Write über den echten Production-Pfad bewiesen (2026-07-27, 14:23–14:36 UTC)** — der Betreiber hat `HELMUT_PROCESS_RUNS_RELATIONAL=on` gesetzt; Production-Deployment **`dpl_AfputRmtSgFGp7P4bTokBg37rMhP`** **READY** (14:23:14 UTC, `action: "redeploy"` auf demselben Commit `54e9c12` — Signatur einer Env-Änderung, **kein** Wertbeleg), CI des deployten Commits grün (Lauf 30272642696), Migration weiterhin registriert, Schema unverändert korrekt. **Gates vor dem Smoke:** 0 aktive Locks, kein Crawl/Lage-/Understanding-Lauf, nächster Cron 16:00 UTC. **Smoke `abnahme-20260727142935` (14:29:35–14:29:41) diesmal OHNE lokale Umgehung** — `HELMUT_STORAGE_BACKEND=supabase`, also voller Dual-Write inklusive Blob-Spiegel; kein Crawl, kein KI-Aufruf, keine Fachdatenänderung. Drei Schreibvorgänge auf **eine** Kennung (`running` → `success` → Wiederholung) ergaben **genau 1 Zeile, 0 Dubletten**, Status `success`, `duration_ms` 5 161. **Dual-Read 151 = 2 relational + 149 Blob**; der neue Lauf steht durch den Dual-Write in **beiden** Quellen, erscheint aber **genau 1×** (Dedup über `(runId, process)` greift). Gegenprobe mit abgeschalteter relationaler Lesestrecke: 150 — und der **nur relationale** Phase-B-Lauf ist dort **unsichtbar**, der relationale Pfad liefert also nachweislich Daten, die der Blob nicht hat. **Stärkster Einzelbeweis gegen Last-Write-Wins:** der Phase-B-Lauf steht nach dem zweiten unabhängigen Write **unverändert** in `process_runs` (2 Zeilen nebeneinander) — auf dem Blob-Pfad hätte er überschrieben werden können. **Blob-Integrität bewiesen:** 149 → 150 Einträge, neuer vorangestellt, Prüfsumme der übrigen 149 **byte-identisch** (`6e76e22fe8bba22afe70556ad4df5f51`). **Nichts anderes verändert:** KO 1 142, Links 4 143, Rohdok 8 929 (je 0 neu/geändert), LLM-Zähler **55 → 55**, 0 Locks. Kein Abbruchkriterium, **kein Rückweg genutzt**. Details: [`betrieb/befund-werkzeug-haertung-w1-w2.md`](betrieb/befund-werkzeug-haertung-w1-w2.md) §15 | **erledigt** — der echte Cron-Lauf ist erbracht (nächste Zeile) | W-2 |

| **W-2 ERFOLGREICH ABGESCHLOSSEN: echter Production-Lauf relational gespeichert (2026-07-27, 16:00 UTC)** — der reguläre `/api/cron/pipeline` hat den Nachweis erbracht, **ohne dass irgendetwas künstlich gestartet wurde**. Lauf **`crawl-20260727160048-ct8lt`** / `understanding-eager` / **`success`**, 16:03:09.619 → 16:04:44.040 (**94 420 ms**), `processed` 4, `deferred` 527, Telemetrie cluster 531 · dokumente 942 · `saved` 3 · `skipped-error` 1 · aufloesungen `{neu: 2, bestand: 2}` · vorgemerkt 53 · grossereignisse 5. **Zugleich der Wirksamkeitsbeweis des Flags** (Kriterium 3, da der Wert selbst aus einer Sitzung unlesbar bleibt): die Zeile trägt `location` **`fra1`** — die Vercel-Region, während alle Sitzungs-Smokes `cloud-sitzung` tragen — und `commit_ref` **`54e9c12a…`**, exakt den deployten Commit. Der Write kam also aus der Production-Runtime; ohne gesetztes Flag hätte `recordProcessRun` den relationalen Pfad übersprungen. **Abgleich konsistent:** `source_crawl_telemetry` **147 Zeilen mit derselben `run_id`** über **147 verschiedene Quellen**, Locks `crawl-cem-ince`/`global-understanding` passend, Blob-Spiegel trägt denselben Lauf (Ring 149 → **151**), Dual-Read **152 = 3 relational + 149 Blob** mit **genau 1×** je Lauf. **Erhalt beidseitig belegt (Kriterium 11):** der Cron-Lauf steht nach 147 Telemetriezeilen, Lock-Erwerb, Rohdokumenten bis 16:05:20 und KO-Aktualisierungen bei **drei** Messungen (16:15:24 · 16:16 · 16:17:54) unverändert — **und** die beiden Smoke-Zeilen von 14:07/14:29 haben den kompletten Cron-Lauf überlebt, obwohl dieser einen eigenen `process_runs`-Write ausführte und den Auth-Blob mehrfach per Lese-Ändere-Schreibe anfasste (5 LLM-Aufrufe). Genau diese Konstellation hat vor der Härtung Läufe vernichtet. **Fachwirkung ist die des echten Crawls, nicht des Smokes:** +101 Rohdokumente (8 929 → 9 030), +51 Knowledge Objects (1 142 → 1 193), +153 Verknüpfungen (4 143 → 4 296), LLM **55 → 60**. **Alle 15 Erfolgskriterien erfüllt, kein Rückweg genutzt.** Rückweg bliebe `HELMUT_PROCESS_RUNS_RELATIONAL=off` + Redeploy (nicht die Migrationsrücknahme). Details: [`betrieb/befund-werkzeug-haertung-w1-w2.md`](betrieb/befund-werkzeug-haertung-w1-w2.md) §15.5/§15.6 | **nichts** — W-2 ist abgeschlossen. Die Blob-Ablösung selbst (Phase 3/4 des Migrationsplans: Lesepfad nur relational, Blob-Key abschalten) bleibt ein **eigener, nicht erforderlicher** Freigabeschritt; die Verlustfreiheit hängt nicht daran | — |

## 4 · Blockiert

| Punkt | Ursache | Nächster Schritt |
|---|---|---|
| **OP-01** Supabase Pro + PITR | Kostenentscheidung des Betreibers (~25 $/Monat); Free-Plan = **keine nativen Backups, kein PITR**. Der kostenfreie Teil ist seit 2026-07-28 erledigt: Vollsicherung (40/40 Tabellen) + bewiesener isolierter Restore (18/18 Prüfungen, `betrieb/restore-uebung-2026-07-28.md`); Restrisiko ist das RPO von bis zu 24 h | Betreiber schaltet Pro + PITR frei, dann PITR-Restore-Übung nach `betrieb/backup-restore-runbook.md` §3 |
| **Quellen-Seed-Einspielung** (macht P0-2 und die 6 Bundesweg-Reparaturen in der DB wirksam) | **Go-Kriterium 2 ist seit 2026-07-26, 16:47 UTC erfüllt** — die Pre-Seed-Sicherung ist gelaufen (`vollstaendig: true`, 8/8 Tabellen, `mainCommit 93006e8`). Offen ist nur noch Go-Kriterium **8**: die Einspielung ist nicht freigegeben. Kriterium **11** ist **entschieden**: gestaffelte Reaktivierung (§6d). **Erledigt 2026-07-26:** derselbe Aufruf lief in der Cloud-Sitzung durch (Exit 0), weil `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` diesmal über die Claude-Code-Environment-Einstellungen gesetzt waren und der Supabase-Egress offen ist. Der Versuch vom 2026-07-25 war nur an fehlenden Zugangsdaten gescheitert, nicht am Werkzeug | Betreiber gibt die Einspielung frei; danach Runbook `betrieb/quellen-seed-einspielung.md` §6c Schritt 6 ff. Die Sicherung liegt vor und ist gültig, solange `retrieval_paths`/`package_paths`/`source_packages` unverändert bleiben |
| **OP-02** Recht (Pilotvertrag, AVV, DSFA, Art.-9-Grundlage, Fristen) | externe Prüfung durch Anwalt/DSB steht aus | Entwürfe aus `recht/` prüfen lassen und zeichnen; blockiert OP-12 |
| **OP-03** Zweitmandanten-Freigabepaket | Grundsatzentscheidung „DB-seitige Durchsetzung vs. dokumentierte App-Guard-Akzeptanz" fehlt (`mandantentrennung-architektur.md` bewertet die Wege) | Betreiber entscheidet einen Weg; danach Migration + Env + Probelauf |
| **OP-04** Demo-Mandate entfernen — **Umfang korrigiert 2026-07-25:** Production führt **8 Profile, davon 6 aktiv** (nicht 1 Pilot + 2 Demo-Mandate); fünf davon tragen Klarnamen realer Abgeordneter | Production-Datenänderung, freigabepflichtig; berührt zusätzlich OP-02 (personenbezogene Daten) | je Profil entscheiden, dann über Provisionierungswerkzeug deaktivieren (`quellenarchitektur/30-paket-inventur-production.md` §5, A-1) |
| **OP-09/OP-10** Production-Beweise Lock-Deny und Fehlerpfad | brauchen ein echtes Störereignis; künstliche Injektion und Doppelstart sind verboten | beim nächsten echten Vorfall dokumentieren |

## 5 · Fehlgeschlagene oder abgebrochene Ansätze — **nicht wiederholen**

> Diese Einträge existieren, damit kein neuer Thread dieselbe Sackgasse erneut baut.

### F-1 · Tenant-JWT-Selbstsignierung → RLS scharfschalten — **gescheitert, dauerhaft stillgelegt**
- **Versucht:** Mandantentrennung DB-seitig über selbstsignierte Tenant-JWTs und die
  23 RLS-Policies durchsetzen.
- **Warum gescheitert:** Supabase stellte auf asymmetrische JWT-Signing-Keys um; der
  Selbstsignatur-Pfad ist tot (PGRST301-Logs 12./13.07.). Stillgelegt am 2026-07-13
  (Commit `f952b69`, PR #68); `tenantJwtModeEnabled()` gibt hart `false`.
- **Folge:** RLS ist **inert**, Trennung ist App-seitig. Ein Nachfolgekonzept ist Teil
  von **OP-03**. `HELMUT_TENANT_JWT_MODE` zu setzen ist wirkungslos.

### F-2 · Generation B „Quellenplattform" — **abgebrochen, nicht mergen**
- **Versucht:** paralleler Nachbau der Quellenarchitektur auf eigenen Branches.
- **Warum abgebrochen:** dupliziert, was auf `main` bereits live läuft; aus Sicht des
  Servers additiver toter Code. Merge würde die laufende Architektur gefährden.
- **Verbindlich:** [`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)
  (vollständige Branch-Liste).

### F-3 · Anker-basierter Understanding-Recovery-Pfad — **in Production fehlgeschlagen**
- **Versucht:** 6 eingefrorene Alt-Fälle über einen anker-basierten Recovery-Pfad
  rekonstruieren (OP-05).
- **Was passierte:** der Lauf `rec-29569461715` erzeugte in Production einen
  **Multi-Themen-Digest** statt sauber getrennter Vorgänge; er wurde zurückgerollt.
- **Ursache (verifiziert):** `matchDocuments`/`anchorsMatch` in
  `lib/helmut/understanding-recovery.js` vergleicht über **Teilstring-Anker**
  (`a.includes(b) || b.includes(a)`) ab 8 Zeichen. Bei Multi-Doc-Fällen zieht das
  fremde Themen in dasselbe Cluster. Der Fehler liegt im Matcher, nicht in der
  Orchestrierung — er ist also **reproduzierbar**, solange Matcher und Allowlist stehen.
- **Blast-Radius:** Der Workflow lief nur manuell (`workflow_dispatch`, kein
  `schedule`/`push`), griff aber mit dem **Service-Role-Key** auf die Production-DB zu
  (umgeht RLS) und schrieb bis zu 6 neue complete-KOs. `knowledge_objects` trägt
  **kein** `tenant_id` — ein falsches KO ist für **alle** Mandanten sichtbar, inklusive
  Pilot-Briefing.
- **Stand auf `main`: stillgelegt** (PR #105, gemergt 2026-07-25, `43e9e35`). Auf
  `main` verifiziert: `.github/workflows/understanding-recovery.yml` existiert nicht
  mehr, `RECOVERY_ALLOWLIST` ist `[]`, das Execute-Skript enthält 0 `require`.
- **Die drei unabhängig wirksamen Sperren:** Workflow-Datei
  entfernt · `scripts/understanding-recovery-execute.js` auf einen Hinweis reduziert
  (kein `require` von `storage`/`ai`/`understanding`, wirkungslos auch mit Flag +
  korrektem Token) · `RECOVERY_ALLOWLIST` geleert. Zusätzlich ein
  **namensunabhängiger Regressionsriegel**: die Offline-Suite schlägt fehl, sobald
  *irgendein* Workflow — auch unter anderem Dateinamen — das Execute-Skript aufruft
  oder `HELMUT_RECOVERY_EXECUTE`/`-CONFIRM` setzt. Da CI die Offline-Suite fährt,
  blockiert das eine spätere Wiederbelebung.
- **Nicht wiederbeleben:** Der Branch `claude/helmut-datenmotor-impl-2-kd1jl9` trägt
  unter demselben Pfad eine **lauffähige** Fassung. Bei einem späteren Merge gilt für
  alle vier Recovery-Dateien die stillgelegte Fassung aus #105; eine
  Einzeldokument-Recovery gehört unter einen **eigenen** Dateinamen.
- **Konsequenz:** Diesen Workflow **nicht** ausführen. Der tragfähige Ersatzweg ist
  die **Einzeldokument-Recovery** je exakter `raw_document_id` (1 von 6 Fällen so
  bereits erfolgreich recovert, `singledoc-29583280106`); 1 Fall ist live als Duplikat
  verifiziert (→ OP-06).
- **Nicht betroffen:** `lib/helmut/ko-recovery.js` (P1-4, Default AUS) sowie
  `POST /api/admin/recovery/reset-failed` und `GET /api/debug/reset-failed-kos` nutzen
  den **normalen** Understanding-Pfad, nicht den Anker-Matcher.

### F-4 · Befund „Quellenbasis zu dünn" (altes Schema P2-5) — **Fehlbefund**
- Die Warnung entstand aus nie erfüllbaren Schwellen (495/450/405) gegen einen
  gesunden Crawl (~145 Quellen) und einer Zählung über den toten `store.sources`-Blob.
  Schwellen und Zählung sind korrigiert. **Es fehlen keine Quellen für den Piloten** —
  diese Analyse nicht erneut aufsetzen.

### F-5 · Feste Referenzzahl „145 Quellen" — **verworfen**
- Die Quellenzahl ist mandats-/profilabhängig (Demo-Mandat: 139). Die gültige
  Invariante ist `Telemetriezeilen = distinct source_id`, nicht eine feste Zahl (B3).

## 6 · Offene Punkte (Übersicht)

Vollständig und verbindlich in [`datenmotor-restliste.md`](datenmotor-restliste.md) §6.

- **P0 (Verkaufsblocker):** OP-01 Backups · OP-02 Recht · OP-03 Zweitmandanten-Paket · OP-04 Demo-Mandate
- **P1 (Betriebsreife):** OP-05 … OP-12
- **P2 (Produktqualität):** OP-13 … OP-20
- **P3 (später):** OP-21 Berlin/Brandenburg · OP-22 Scoring · OP-23 Hygiene
- **Neu ab Sprint 23B-1:** OP-25 Crawl-Zeitdeckelung (P1) — **Teilstück „Rotation" am 2026-07-29/30
  umgesetzt und CI-belegt** (faire Reihenfolge, Garantie ceil(n/k) für k ≥ 1, Überlappungsschutz
  bewiesen, Persistenz gehärtet; Production-Nachweis offen), offen bleiben Abdeckungsmessung und
  Abdeckungsalarm · OP-26 mandantenscharfer Matching-Einstieg (P2)

## 7 · Aktuelle Blocker (zusammengefasst)

1. **Kein natives Backup/PITR in Production (Free-Plan).** Seit 2026-07-28 deutlich
   entschärft: es existiert eine aktuelle, geprüfte Vollsicherung (40/40 Tabellen,
   74 844 Datensätze, Prüfsumme `c63f1d95…`) **und** der Rückweg ist in einer isolierten
   lokalen PostgreSQL praktisch bewiesen (18/18 Prüfungen inkl. Mandantentrennung,
   `betrieb/restore-uebung-2026-07-28.md`). Restrisiko: **RPO bis 24 h** (kein PITR,
   kein transaktionaler Snapshot) — die Pro/PITR-Kostenentscheidung bleibt offen (OP-01).
   Der Seed-Sonderfall (§12) deckt weiterhin nur die 8 Quellentabellen ab.
2. **Keine rechtliche Grundlage für Verkauf.** Kein geprüfter Pilotvertrag/AVV/DSFA,
   `knowledge_objects` enthalten Art.-9-Daten (OP-02).
3. **Sicherheits-Grundsatzentscheidung offen.** Ohne Entscheidung zu OP-03 darf kein
   zahlender Zweitmandant aufgeschaltet werden.
4. **Branch Protection unbestätigt.** Das CI-Gate blockiert erst mit aktivierter
   Branch Protection; Aktivierungsstand ist nicht verifiziert (OP-11,
   `betrieb/branch-protection.md`).

## 8 · Offene Pull Requests (Stand 2026-07-28)

> **Konfliktprüfung für Roadmap-Punkt 23 (Sprint 23A, 2026-07-28):** alle 10 offenen PRs geprüft,
> **keiner angefasst**. Fachlich relevant ist nur **#112** (Onboarding verändert, wie
> Mandatsprofile entstehen und geschrieben werden → berührt den Profilhash von 23B; der Hash wird
> deshalb bewusst herkunftsunabhängig definiert). **#167/#159/#148** ändern ebenfalls
> `CURRENT_STATE.md` → reine Markdown-Textkonflikte, keine fachliche Kollision. #132/#88 berühren
> `source-mode.js` bzw. `scheduler.js`, nicht den Matching-Pfad. #117/#115/#111/#70 ohne Bezug.
> Einzelbewertung: [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §2.

| PR | Inhalt | Einschätzung |
|---|---|---|
| **#184** | **Befund 27A-2: Production-Messung (rein lesend)** — kein Fix. Neu: `scripts/befund-27a2-production-messung.js` (technischer Schreibschutz: eine HTTP-Funktion mit `GET`-Literal, eingefrorene Tabellen-Allowlist ohne `/rest/v1/rpc/`, kein `storage.js` im Prozess, Pseudonymisierung ohne Klartextschalter), `scripts/befund-27a2-schreibschutz-test.js` (**48/48**) und §51 der Matching-Doku. Gemessen: **14** falsche Ausschussbelege bei **4 von 6** aktiven Bundestagsprofilen über **9** Landesvorgänge; Score **−34** in allen Fällen, **13 von 14** wechseln die Entscheidungsstufe, **5** hängen allein am falschen Beleg. `matched_features` auf `d9006c1` und `94f73e4` über **10 836** Paare byte-identisch. Offline **173/187** (Basislinie 172/186, Fehlschlagliste byte-identisch), Browser **32/32** | **offen, nicht gemergt** — reine Messung + Doku + zwei Skripte, kein Production-Bezug beim Merge. Der **Fix** ist ein getrennter, freigabepflichtiger Sprint (Variante 3 in `matching-nachvollziehbarkeit.md` §50.5, beziffert in §51.9) |
| **OP-25-Fairness** (PR-Nummer siehe Branch `claude/helmut-roadmap-25-cron-fairness-g8qjcx`) | **Faire Mandantenreihenfolge der Mehrmandanten-Crons (OP-25)** — `runCronForTenants` lief seriell in **alphabetischer** Reihenfolge gegen ein hartes Zeitbudget; dieselben Mandate fielen deshalb wiederholt aus (belegt 2026-07-24: 4 von 6; 2026-07-29: 1 von 7 erreichte die Matching-Stufe). Jetzt Rotation nach dem **ältesten letzten Versuch** (`lib/helmut/cron-fairness.js`), Versuch **vor** der Verarbeitung persistiert in einer **eigenen `helmut_store`-Zeile** — **keine Migration**, keine RLS-Änderung, kein Flag-Gate; Garantie **ceil(n/k)**; Beobachtbarkeit je Mandat; `systemError` nennt jetzt die Kennungen. Neue Suite **176/176**, Mutationsprobe **9/9 rot**, Offline **169/183** (Baseline `main` 168/182, dieselben 14 umgebungsbedingten Fehlschläge), Browser **32/32**. Keine Cron-/Budget-/Flagänderung, kein Production-Zugriff | **offen, nicht gemergt** — Merge ist eine Freigabeentscheidung und gleichzeitig die Aktivierung (der Fix wirkt ohne Flag). Rückweg: `HELMUT_CRON_FAIRNESS=off`. **Production-Nachweis danach offen** (vier reguläre Läufe beobachten), deshalb bleibt OP-25 bis dahin teilweise abgeschlossen |
| **#178** | **Roadmap-Punkt 24 (Abschluss): Vorgangsbezug messen statt annehmen** — der Bezug war an **einem** Record belegt; gemessen sind jetzt 41 853 Berliner `<Vorgang>` / 47 415 `<Dokument>` und der Brandenburger WP8-Export **vollständig** (9 092 / 8 133). **Kernbefund 1:n, nicht n:m** (0 `DBID` unter mehreren `VNr`) — damit ist `vorgangsnummer` am Dokument keine willkürliche Auswahl. Ergänzt nur `vorgangsKennung()` mit zwei Fail-closed-Schranken (Widerspruch `VNr`≠`VID`, Platzhalter `-`) plus zwei Zähler; beide greifen auf echten Daten nie. Keine neue Spalte, keine Migration, **kein Umbau der globalen Dublettenerkennung** — nur deren Wechselwirkung gemessen (Ursachennachweis `M10c`) und als Cutover-Vorbedingung dokumentiert. Tests 141/141, Mutationsprobe 6/6 rot, **Offline-Suite 182/182 im CI, beide Pflicht-Checks grün** (Lauf `30494735859`), Browser-Smoke 32/32. **Offen, nicht gemergt.** | **Merge-Empfehlung: ja.** Reine Parser-/Test-/Doku-Änderung an zwei **inaktiven** Wegen; auf echten Daten ergebnisneutral (Gold-Fixtures unverändert 10/3/7 Dokumente). Keine Aktivierung, keine Migration, kein Flag, kein Cron, kein Secret, keine Production-Berührung |
| **#177** | **Roadmap-Punkt 24: Dokumentklassen und Rohdokument-Vertrag für die Landtags-Parser Berlin/Brandenburg** — acht kanonische Klassen mit getrennten Typtabellen je Land, fail closed auf `unbekannt`, Abbildung auf die bestehenden `raw_documents`-Spalten (keine Migration), `vorgang` bewusst KEINE Dokumentklasse. Drei Befunde: **24-1** das Understanding-Gate kannte „Schriftliche Anfrage" nicht (behoben, rein additiv, 42/42 Bundes-Entscheidungen unverändert) · **24-2** die globale Dedup identifiziert über die URL — für PARDOK falsch, Architektur bewusst nicht geändert · **24-3** Brandenburg führt 11 Dokumentarten, Berlin nur 4 (gemessen je 800 Records); ohne die Ergänzung wären 35,5 % der Brandenburger Dokumente fälschlich `unbekannt` geblieben, und die Annahme „Brandenburg liefert keine Tagesordnung" war falsch. Keine Aktivierung, keine Migration, keine Production-Änderung | **offen** — Merge ist eine Freigabeentscheidung. **CI-Gate grün: beide Pflicht-Checks** (Lauf `30482172757`, Offline-Suite **182/182**, Browser-Smoke **32/32**). Roadmap-Punkt 24 steht nach dem 2. Durchgang auf ✅ (Vorgangsstruktur belegt, Identitätskollision behoben, Gate-Änderung begrenzt) |
| **#175** | **Doku: Production-Nachweis Sprint 23C-2A** — reiner Dokumentations-PR, kein Code. Trägt den Beweislauf vom 29.07.2026, 16:04 UTC nach: neuer vollständiger `matching_run`, Kernfingerabdruck vorher = nachher, Belege 3 → 20 von 20, Abdeckung 63 → 80 von 271, nichts gelöscht, 0 KI-Aufrufe / 0,00 USD, keine Fehlergruppe aus dem Matching-Pfad. Neuer §41 in der Matching-Doku, Punkt 23 bleibt ⏳ | **offen** — reine Dokumentation, kein Risiko, kein Production-Bezug beim Merge. **CI-Gate grün: beide Pflicht-Checks** (Lauf `30470515758`) |
| ~~#174~~ | **Sprint 23C-2A: Erklärungsabdeckung im Matching-Schreibpfad (Befund M-7)** — der Schreibpfad löste die Merkmale gegen ein Fenster der 200 zuletzt geänderten Wissensobjekte auf, während die Vektorsuche über alle 1 702 läuft; jeder Treffer außerhalb blieb ohne `matched_features`/`signale`/`begruendung`. Jetzt gebündeltes Laden nach Kennung (`storage.listKnowledgeObjectsByIds`, eine Anfrage je 100 Kennungen, kein N+1, 20 statt 200 gelesene Zeilen, tenant-sicher, deterministisch, fail closed). Scores, Ränge, Reihenfolge und Ergebniskennungen byte-identisch; **keine** Versionsanhebung nötig. Neue Suite **60/60**, Offline **180/180** (Ausgang 179/179), Browser **32/32**, externe Mutationsprobe **11 Fehlschläge**. Keine Migration, kein Flag, keine UI-Änderung, 0,00 USD | **gemergt** (`bb539b1`), ausgerollt (`dpl_7NwHyiwYuECi4y2RXaoRQCCmjdo5`, `READY` 12:19:17 UTC) und am ersten regulären Lauf (16:04 UTC) in Production nachgewiesen: Kernfingerabdruck vorher = nachher, Belege 3 → 20 von 20, Abdeckung des betroffenen Mandanten 15 % → 100 %, Gesamtbestand 23,2 % → 29,5 % (Rest folgt mit den Läufen der übrigen Mandanten). 0 KI-Aufrufe, 0,00 USD, nichts gelöscht, keine neue Fehlerklasse |
| ~~#169~~ | **Sprint 23B-1: algorithmusunabhängige Matching-Auditpersistenz** — neue Tabelle `matching_runs` (append-only, nach Abschluss per Trigger unveränderlich), 14 additive Spalten auf `matching_results`, Migration `20260728_matching_audit` + Rollback, drei kleine Module (`matching-contract` / `matching-audit` / `matching-begruendung`), atomare Veröffentlichung (`helmut_publish_matching_run`, SECURITY INVOKER), Anbindung des Legacy-Matchings hinter `HELMUT_MATCHING_AUDIT` (**Default AUS**), neue Suite 178/178, Offline-Suite 177/177 | **gemergt** (`b1d450c`). **Migration am 28.07.2026, 20:20:57 UTC in Production angewendet und vollständig verifiziert** (287→287 Zeilen byte-identisch, Fingerabdruck unverändert, RLS/Grants/Funktionen/Trigger korrekt, 0 Production-Fehler, Rollback nicht nötig). **Gate 3 inzwischen ebenfalls erteilt:** `HELMUT_MATCHING_AUDIT=on` (nur Production) seit 28.07. ~20:55 UTC, erster Auditlauf 29.07. 04:05 UTC, Idempotenz 08:07:20 UTC bewiesen — Sprint 23B-1 damit erfolgreich abgeschlossen |
| ~~#170~~ | **Doku-Nachtrag: Production-Migration `20260728_matching_audit` angewendet und verifiziert** — reine Statuspflege (CURRENT_STATE, `matching-nachvollziehbarkeit.md` §21.6, Roadmap-Punkt 23, ARCHITECTURE §7d) | **gemergt** 2026-07-28, 20:37 UTC (`5c254c4`), beide Pflicht-Checks grün (Lauf `30397010300`), in Production ausgerollt (Deployment `dpl_7kag3HkqK61KTRAu2y9jBUFhxBo1` `READY`, später als `dpl_ChLoTuKztU1B835PfckELKp8doMZ` mit gesetztem Flag neu ausgerollt). Änderte keine Production-Daten |
| ~~#166~~ | **Sprint 22C1 abgeschlossen: Production-Backfill ausgeführt und belegt** — Protokoll §14.6 (Migration angewendet und verifiziert, Canary 56/56, 772/772 eingebettet, Idempotenz 0 Aufrufe/0 Writes, Vorher/Nachher-Nachweise), Roadmap-Punkt 22 auf erfüllt, Werkzeugbefund W-3 behoben (`process.exitCode` statt `process.exit()`) | **gemergt** 2026-07-28, 15:52 UTC (`51a533d`), beide Pflicht-Checks grün (Lauf `30371556515`), in Production ausgerollt (Deployment `dpl_E9JKeXKhd2b5mK2QJDNuRSquXJGg` `READY`). Der Production-Zustand war zum Merge-Zeitpunkt bereits hergestellt — der PR selbst änderte keine Production-Daten |
| ~~#165~~ | **Sprint 22C1: Production-Shadow-Struktur + Backfill-Pipeline für semantische Embeddings** — finalisierte Migration `20260728_embedding_shadow.sql` (+ Rollback, aus `entwuerfe/` überführt), Renew-Lock-RPC, Backfill-Lib+CLI mit harten fail-closed Deckeln und eigenem Lock, Testsuite 40/40, Env-Inventar + D7-Testpflege, Doku §14 inkl. Production-Runbook | **gemergt** 2026-07-28 (`ce5e3b8`), beide Pflicht-Checks grün (Lauf `30367524365`), in Production ausgerollt (Deployment `dpl_CDfzvCaanmYsiZG62n9hKUaYLbCC` `READY`). Danach auf ausdrückliche Freigabe: **Migration angewendet + Backfill 772/772 erfolgreich** (§14.6). Der Merge selbst änderte keine Production-Daten |
| ~~#164~~ | **Sprint 22B: Embedding-Testlauf ausgeführt, Qualitätsvergleich dokumentiert** — reine Doku (§13.6/§13.8) | **gemergt** 2026-07-28, 13:13 UTC (`77e4de3`), beide Pflicht-Checks grün, in Production ausgerollt (Deployment `dpl_9Kt9LpvYPCRNxeK4MhycsQmH8k29` `READY`). Damit ist Sprint 22B **erfolgreich abgeschlossen** |
| ~~#163~~ | **Doku: PR #162 nach Merge nachgetragen** (nur Statuspflege) | **gemergt** 2026-07-28 (`7e881b8`) |
| ~~#162~~ | **Sprint 22B: Embedding-Qualitätsvergleich vorbereitet** — Testmenge+Goldstandard (56 Objekte/47 Paare), Legacy-Basislinie, Offline-Shadow-Pipeline (31/31), Testlauf-CLI mit Freigabe-Riegel, Auswertungswerkzeug, Kostenmodell real, Migrationsentwurf geschärft (weiter nicht angewendet), Doku §13 inkl. Testlauf-Stopp (kein Azure-Embedding-Deployment) | **gemergt** 2026-07-28 (`b6ca441`), beide Pflicht-Checks grün (Lauf `30360250937`), in Production ausgerollt (Deployment `dpl_8YEqNJbcatonqZULweseyuRCCv7X` `READY`). Der Merge ändert keine Production-Daten (additive Offline-Module). Sprint 22B bleibt **teilweise abgeschlossen**, bis der freigegebene Testlauf nach Anlage des Embedding-Deployments ausgeführt und ausgewertet ist |
| ~~#161~~ | **Sprint 22A: Embedding-Architektur bewiesen, Datenvertrag und Zielmodell festgelegt** — kanonische Doku `embedding-architektur.md`, Offline-Modul `embedding-contract.js` (nirgends eingebunden), Testsuite 43/43, Shadow-Migrations-**Entwurf** (nicht angewendet), Roadmap-/Statuspflege | **gemergt** 2026-07-28, 11:11 UTC (`b273877`), beide Pflicht-Checks grün, Deployment `dpl_ECKRnJRxNocyfPttwrh4Kw3ZQpA1` `READY` |
| ~~#160~~ | **OP-01-Sprint: Sicherung + isolierter Rückweg bewiesen** — Werkzeug `restore-verify-local.js` (+46er-Testsuite), Strukturreferenz mit belegtem Schema-Drift, Export auf 40 Tabellen erweitert, Runbook §0/3c/3d, Beweisdokument `restore-uebung-2026-07-28.md` | **gemergt** 2026-07-28 (`1226232`), in Production ausgerollt (Deployment `dpl_DVxGNjzq6btxGiMUq3rAxfKt4aUv` `READY`) |
| ~~#158~~ | **Sprint 21 Hauptlauf: vollständiger Production-Schreiblauf Umfang B ausgeführt und belegt** — Protokoll §14 im kanonischen Dokument, CURRENT_STATE, OP-24 auf „inhaltlich erledigt" | **gemergt** 2026-07-28, 09:25 UTC (`0f8d33a`), reine Dokumentation |
| ~~#156~~ | **Sprint 21: Altbestand kontrolliert nachklassifizieren (OP-24)** — reines Planungsmodul `nachklassifikation.js` (baut einen Plan, schreibt nichts) plus Werkzeug mit Vorschau als Standard; Schreiben verlangt `--ausfuehren` **und** `HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja` **und** das Production-Schreibgate; begrenzbar nach IDs, Zeitraum, Mandant, Fehlerklasse und Menge; seitenweiser Lesepfad gegen die stille PostgREST-Kappung | **gemergt** 2026-07-28 (`f59bc7c`), in Production ausgerollt (Deployment `dpl_ERm1PDWzUY9xSFUnTDrVcbLmZcem`). **Keine Migration, keine neue Spalte, kein Flag, kein Cron, kein Lock, kein zusätzlicher KI-Aufruf, keine Matching-/Scoring-Änderung.** Der Merge allein ändert **keine** Production-Daten — das Werkzeug läuft nur, wenn es jemand aufruft. Rollback per `git revert`. Offline **158/172** gegen Basislinie **157/171** (identische 14 Vorbefunde), `nachklassifikation-test` **101/101**, **21/21 Mutationen rot**, Idempotenz an allen 740 Production-Objekten bewiesen. **CI-Gate grün (beide Pflicht-Checks, Lauf `30317133853`).** Branch `claude/sprint-21-reclassification-rawkji` |
| ~~#155~~ | **Sprint 20: Geografie dauerhaft und nachvollziehbar speichern** — neues reines Modul `geografie-gedaechtnis.js`; die betroffene Geografie entsteht nicht mehr aus `decision_level`, sondern ausschließlich aus Nachweisen (Herkunftsrang `parser` > `amtlich` > `inhalt` > `ki` > `erwaehnung` > `quelle`); Quellengeografie ist strukturell vom Betroffensein ausgeschlossen; mehrere betroffene Regionen sind möglich; fail closed gegen leer/unbekannt; zwei korrigierte Kennzahlen | **mergefähig, aber Merge = Deployment.** **Keine Migration, keine neue Spalte, kein Flag, kein Schema, kein zusätzlicher KI-Aufruf, keine Änderung an Cronjobs/Crawlern/Budget/Locks/Matchinggewichten/aktiven Quellen.** Additiv: Herkunft je Eintrag + `geography_*`-Schlüssel im bestehenden jsonb `classification_confidence`. Rollback per `git revert`. **CI-Gate grün: Offline-Suite 171/171, Browser-/Mobile-Smoke 32/32** (Lauf `30299183808`, Commit `f4d6648`). `geografie-gedaechtnis-test` **61/61**, **11/11 Mutationen rot**, Production read-only gegengemessen. Branch `claude/sprint-20-geography-storage-vuhqcn`, **PR #155** |
| ~~#154~~ | **Sprint 19: politische Ebene dauerhaft speichern** — neues reines Modul `ebenen-gedaechtnis.js` (Wiederverwendung statt Neuberechnung, fail closed gegen `unknown`, monoton), Einbindung in `classifyKnowledgeObject`/`assembleKnowledgeObject`/`understandUpdate`, Klassifikationsspalten in der Kandidatenprojektion, ehrliche Abdeckungskennzahl | **mergefähig, aber Merge = Deployment.** **Keine Migration, kein Flag, kein Schema, kein zusätzlicher KI-Aufruf, keine Änderung an Cronjobs/Crawlern/Budget/`process_runs`/W-1/W-2.** Additiv: die Herkunft der Ebene wandert in das bestehende jsonb `classification_confidence`. Rollback per `git revert`. Offline **156/170** (Basislinie **155/169** — identische 14 Vorbefunde, +1 neue Suite grün), Browser-Smoke **32/32**, `ebenen-gedaechtnis-test` **41/41**, **7/7 Mutationen rot**, Production read-only gegengemessen. Branch `claude/politische-ebene-speichern-e7ad56` |
| offen | **Doku: B4-4-/CSD-Nachweis abgeschlossen** — Wiedervorlage des Wegner-Dokuments im bestehenden Vorgang, Pfadanalyse (warum der allgemeine Nachholpfad nicht reicht), Trockenlauf, Vorher/Nachher, Abnahme gegen die 14 Kriterien | **reine Dokumentation** — kein Code, keine Migration, kein Flag, keine Resolver-Änderung. Rollback per `git revert`. Branch `claude/b4-4-publisher-identity-hotfix-k03z30` |
| ~~#150~~ | **Doku: B4-4 in Production nachgewiesen** — Deployment-Nachweis, Sicherheitsgates, Trockenlauf, der Lauf `nachhol-20260727121511`, vollständige Vorher/Nachher-Messung, Abnahme gegen die zwölf Kriterien, zwei Werkzeugbefunde | **gemergt** 2026-07-27 (`c85167e`), Deployment `dpl_4DQkazAyLMDxeC2ZBZQLkzPj3r5N` `READY` um 12:28:48 UTC, beide Pflicht-Checks grün |
| ~~#149~~ | **Hotfix B4-4: Herausgebernamen stiften keine Vorgangsidentität** — belegte Google-News-Titelsuffixe werden vor der Ankerbildung entfernt (strukturell, ohne Wortliste), Medien-/Agentur-/Plattform-/Verlagsnamen sind überall nicht-spezifisch, kurze Funktionswörter aus Zeitungsnamen ebenfalls; neues Modul `lib/helmut/herausgeber.js`, read-only Analysewerkzeug, wiederholbare Mutationsprobe | **mergefähig, aber Merge = Deployment.** Reine Logikänderung, keine Migration, kein Flag, kein Schema, keine Änderung an gespeicherten Titeln. Rollback über `git revert` bzw. Vercel-Redeploy. Offline **167/167**, Smoke **32/32**, **7/7 Mutationen rot**, read-only Production-Analyse vorhanden. **gemergt** 2026-07-27 (`ad0cf99`), Deployment `dpl_8oC6U67Kvx8UxwZrHBDR3CMASp5t` `READY` um 12:03:43 UTC, beide Pflicht-Checks grün. **Production-Nachweis erbracht** (§18 des Befunds) |
| ~~#147~~ | **Hotfix B4-3: Beweisfamilien im Resolver** — Flexionsformen zählen einmal, generische Ereignisbegriffe tragen nichts, Ein-Dokument-Vorgänge sind fail-closed; Magnet-Analyse erkennt die Übernahme; `--ids` vor der Mengenkappung; Production-Schreibgate | **gemergt** 2026-07-27 (`27d7787`). Production-Nachweis am echten Fall steht aus. Branch `claude/hotfix-b4-3-vorgangsbildung-hzn92o` |
| ~~#146~~ | **Phase-1-Punkt 18: wiederholbare Production-Inventur aller Quellenpakete** — Werkzeug `scripts/paket-inventur.js`, reine Logik `quellenarchitektur/paket-inventur.js`, additive Admin-Karte, kanonische Doku neu gefasst | **gemergt** 2026-07-27 (`a05f273`) — die Zeile stand bis dahin fälschlich als offen. Vorherige Einschätzung: **mergefähig.** Rein lesend und additiv (`git revert` genügt); Server-Block ist fail-safe (Fehler → Karte entfällt, Rest intakt). Production-Nachweis **erbracht** (read-only, reproduzierbar). Vier neue Befunde nur beobachtet, nichts korrigiert. Merge = Deployment und bleibt Betreiberentscheidung. Branch `claude/phase1-point18-production-inventory-l60wzr` |
| ~~#144~~ | Pipeline-Zeitbudget: Crawl kann das 300-s-Funktionslimit nicht mehr reißen | **gemergt** 2026-07-27 (`719df29`); Production-Nachweis steht aus — der Crawl steht seit 2026-07-26 20:03 UTC (§9) |
| ~~#142~~ | Phase-1-Punkt 14 (3. Production-Anlauf): Berlin aktiviert und zurückgerollt | **gemergt** 2026-07-27 (`bc333cb`) |
| ~~#145~~ | **Qualitätssprint + Resolver-Härtung gegen Magnet-Vorgänge (B4-2)** — Kern-gegen-Kern-Vergleich statt Dokument-gegen-Dokument; 12 von 12 Magneten read-only blockiert; neues Werkzeug `scripts/vorgangs-magnet-analyse.js` | **gemergt** 2026-07-27, 07:13 UTC (`d33f540`). **Offen bleibt** die Bereinigung der 12 bestehenden Magnete — Production-Schreibzugriff mit KI-Kosten, eigene Freigabe. Details: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §12b/§12c |
| ↳ | **derselbe PR, Teil 1: drei Korrekturen vor dem CSD-Nachweis** | **gemergt mit #145.** (1) `--karenz=<stunden>` im Nachhol-Werkzeug — Standard bleibt 24 h, wirkt nur dort; ohne diese Option blockierte die Karenz 16 von 20 CSD-Dokumenten. (2) Dokumentauswahl für den KI-Prompt: statt nach Dokumentkennung (faktisch zufällig) jetzt nach Faktenabdeckung mit festen Endpunkten — am echten CSD-Stapel **6/6 Schlüsselfakten statt 5/6**, „neueste zuerst" wurde geprüft und ist **nicht** optimal. (3) Telemetrie-Aggregation: `understanding-lagecheck` → Präfix `understanding-`; dabei **zwei weitere** Fehler derselben Klasse gefunden und behoben (`ERGEBNISGRUPPEN` ohne die zwei Pending-Ergebnisse; `verarbeitet = counts.saved` ohne `updated`/`merged`). Zwei neue **Strukturtests** prüfen künftig den Quelltext gegen die Zuordnungstabellen. Offline-Suite **160/160**, Browser-Smoke **32/32**. Details: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §12a. Branch `claude/helmut-vorgangsbildung-fehler-coolvq` |
| ~~#143~~ | Reparatur der Vorgangsbildung (Betriebsbefund B4) | **gemergt** 2026-07-26, ~22:05 UTC (`746eaf9`), Deployment `dpl_8ot9fCnko…` `READY`. **Wichtig für Punkt 14:** der erste Lauf auf diesem Stand (`/api/pipeline/run`, manuell, 22:09:52 UTC) endete mit **HTTP 504** nach 300 s — 336 Cluster gegenüber 91 im Lauf davor. Siehe `berlin-aktivierung.md` §22. **Lesender Nachweis erbracht:** derselbe Lauf schrieb **184 Knowledge Objects** (8 verstanden, 176 vorgemerkt) und **693 `ko_document_links`**; im 24-h-Fenster danach **0 % Rohdokumente ohne gültigen Endzustand** (vorher 32,6 % über 2 Tage, 76,3 % über 7 Tage), Watchdog **ok**, Kollisionen **0**. Die Verknüpfungsinvariante trug auch durch das Timeout, weil der Endzustand aus `ko_document_links` abgeleitet wird und nicht aus der Lauftelemetrie |
| ~~#140~~ | Phase-1-Punkt 14B: Berliner Abnahmeprofil ausführbar vorbereiten | **gemergt** 2026-07-26, 20:47:03 UTC (`b83d33f`) |
| #132 | Phase-1-Punkt 15: Brandenburg Activation Readiness (aktiviert nichts) | **nicht in der jetzigen Form mergen.** Basiert auf `ca80b2f` (**vor** #138) und führt ein **konkurrierendes** Gate `HELMUT_LANDESMODUL_FREIGABE` ein; `main` kennt seit 14A ausschließlich `HELMUT_LANDESMODULE`. Vor einem Merge: Gate-Name vereinheitlichen und Branch auf den Stand nach #138 heben (`berlin-aktivierung.md` §19.6). Heute wirkungslos, weil nicht gemergt |
| #117 | WBSB-Pilotpaket + Workflow-Härtung vereinigt | **Draft, ausdrücklich nicht mergen** (öffnet nur die CI-Prüfung) |
| #115 | Bestandsabgleich `bund-basis` + Pflichtquellen-Verifikationstest | **Draft, ausdrücklich nicht mergen** (nur um den Workflow auf einem Runner mit Egress laufen zu lassen) |
| #112 | Geführter Erstlogin-/Onboarding-Flow (14 Screens) | manuelle Abnahme im Preview ausstehend |
| #111 | Sichtbarkeits-Toggle auf `/passwort-setzen` | technisch mergefähig, wartet auf Freigabe |
| #88, #70, #8 | ältere Stände (teils auf verwaisten Basis-Branches) | **veraltet** — vor Verwendung auf Aktualität prüfen oder schließen |

## 9 · Aktuelle Production-Situation

- **Deployment:** Vercel, Region `fra1`, Projekt `helmut-pilot`; Deploy erfolgt
  automatisch beim Merge nach `main`. Rollback: `betrieb/deploy-rollback.md`.
- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (OP-01;
  Tarif am 2026-07-28 via Management-API gegengeprüft). Seit 2026-07-28: tägliche
  manuelle Vollsicherung möglich und geübt (40 Tabellen, `backup-restore-runbook.md` §1/3c),
  isolierter Rückweg bewiesen.
- **Flags:** `HELMUT_SOURCE_MODE=on` · `HELMUT_UNDERSTANDING_GATE=shadow` ·
  `HELMUT_PARDOK_DISPATCH=shadow` · Scoring `off` ·
  **`HELMUT_MATCHING_AUDIT=on` seit 2026-07-28, ~20:55 UTC — ausschließlich in Production**
  (Redeploy `dpl_ChLoTuKztU1B835PfckELKp8doMZ` / `5c254c4`, `READY` 20:56:48 UTC; Preview und
  Development bleiben aus). Wirkung in Production belegt: erster Auditlauf 29.07. 04:05 UTC,
  Idempotenz 08:07:20 UTC. Der Wert selbst ist aus einer Cloud-Sitzung nicht lesbar — belegt ist
  er über die Wirkung, nicht über die Variable. Rückweg: Wert auf `off` + Redeploy ·
  **`HELMUT_LANDESMODULE=berlin` ist seit
  2026-07-26, ~20:58 UTC gesetzt** (Redeploy belegt, Wert aus einer Cloud-Sitzung nicht lesbar) —
  **aber wirkungslos**: seit dem Rollback um 22:43 UTC gibt es **0 berechtigte Berliner Mandate**,
  damit ist das Landesmodul auch bei gesetztem Flag inaktiv (gegen den echten Resolver
  nachgerechnet: 0 Berliner Wege im Plan, 140 gesamt — identisch zum Zustand ohne Flag).
  **Brandenburg unverändert inaktiv** (`brandenburg-basis` `prepared`, alle 8 `rp-bb-*`
  `needs_review`+`manual`).
- **Crons:** 9 Vercel-Cron-Einträge (Crawl 04:00/20:00, Understanding 05:30/21:30,
  Morgenbriefing 05:00, Lage-Briefing 05:45, Health-Report 06:00, Lage-Check 10:00,
  Pipeline 16:00 UTC) — siehe `vercel.json`.
- **Quellen (read-only gemessen 2026-07-25):** 7 Pakete in der DB (die zwei Landes-Partei-Pakete
  aus #118 existieren bisher nur im Code-Seed) · 163 Abrufwege · 145 modell-aktiv ·
  138 real gecrawlt (6 defekte Wege ohne Abruf, DIP eigener Pfad) · 19 Berlin-/Brandenburg-Wege
  hart gesperrt · 8 Mandatsprofile, davon 6 aktiv, alle Bundestagsebene.
  Details: `quellenarchitektur/30-paket-inventur-production.md`.
- **Nachtrag, read-only nachgemessen am 2026-07-26 (Punkt-14-Sprint):** die Datenbank hat sich
  seit dem 25.07. verändert — die Seed-Einspielung ist **teilweise erfolgt**. Gemessen:
  **9 Pakete** (`die-linke-berlin` und `die-linke-brandenburg` am 2026-07-26 11:07:48 UTC
  angelegt, beide `prepared`, beide mit **0 Abrufwegen**) · 144 Abrufwege um 11:07:48 aktualisiert,
  **0 neu angelegt** · `rp-bundestag` und `rp-linksfraktion` sind nicht mehr `broken`
  (= **Stufe 1** der beschlossenen gestaffelten Reaktivierung), die 4 Google-Wege blieben in einem
  zweiten Eingriff um 11:13:10 bewusst `broken` (= Stufe 2 offen) · `package_paths` unverändert
  **165**. **Folge:** der Landesmodul-Seed `20260717` ist **nicht** eingespielt — die
  P0-2-Umhängung (Befund **A-3**) ist in der Datenbank weiterhin **offen**: `berlin-basis`
  (`is_base`) trägt nach wie vor `rp-be-partei_pilot`, `rp-be-fraktion_pilot` und
  `rp-be-person_pilot`. Ebenfalls nicht eingespielt: die Punkt-13-Ergänzungen
  (24. Ausschuss `rp-committee-wahlpruefung` fehlt, 7 Niedersachsen-Wege fehlen) und die
  reparierten URLs (die on-conflict-Klausel aktualisiert `url` nicht — `rp-bundestag` ist
  reaktiviert, zeigt aber weiter auf die alte Adresse `bundestag.de/rss`).
  **Dieser Sprint hat nichts davon verändert** (nur `select`-Abfragen); wer den Eingriff
  ausgeführt hat, ist von hier aus nicht feststellbar. Die Zeilen in §4 zur
  Quellen-Seed-Einspielung sind damit **überholt** und gehören beim nächsten Seed-Sprint
  nachgezogen.
- **Betriebszahlen, read-only gemessen am 2026-07-26 (Punkt-14-Sprint, zweiter Durchgang):**
  **277 Rohdokumente/Tag** (1937 in 7 Tagen, 97 liefernde Quellen; je Quelle **Median 1,14/Tag**,
  Mittel 2,85, Max 41) · nur **13 %** der Rohdokumente werden mit einem Knowledge Object verknüpft ·
  **~40 Knowledge Objects/Tag** (32–50 über 11 volle Tage) · **LLM-Aufrufe Mittel 64/100**, am
  2026-07-20 **100/100** (Tagesbudget einmal voll ausgeschöpft) · Pending-Rückstand **50**
  (43 `pending` + 7 `failed`), **wächst nicht** — alle 43 stammen vom 02./03.07. ·
  **5 Crawl-Vollrunden/Tag** (04:00, ~07:5x, 10:00, 16:00, 20:00 UTC), Wiederholungsläufe holen
  nicht erneut ab (`skipped-shared`, 134–135 von 145 Wegen) · Originalverweis in **99,5 %**
  aufgelöst, **0** Rohdokumente tragen noch eine `news.google.com`-URL.
  **Damit sind zwei ältere Angaben überholt:** die „Verarbeitungskapazität ~15–20 Understandings/Tag"
  (real ~40) und die Annahme „2 Crawl-Läufe/Tag" aus `vercel.json` (real 5).
- **Nachmessung 2026-07-26, 16:45–16:52 UTC (Production-Sprint, read-only):** Bestand stabil.
  Letzter Vollcrawl `crawl-20260726160130-7bznw` (16:01:32 UTC): **145 von 147** Wegen `ok`, 2 `empty`,
  **0 error**, 0 `circuit-open`, 940 neue Rohdokumente, Laufzeit **33 s** · Invariante **B3 erfüllt**
  (147 Telemetriezeilen = 147 distinct `source_id`) · Fehlerrate 24 h **1,1 %** (28 von 2534), 56
  `circuit-open`, 16 Retries · `pipeline_locks` 3 Zeilen, **alle abgelaufen** (nichts hängt) ·
  Pending unverändert **50** · LLM heute **34**/100 (8-Tage-Mittel ≈ 63, Spitze 100 am 20.07.) ·
  Rohdokumente **1978**/7 Tage ≈ 283/Tag · Knowledge Objects **274**/7 Tage ≈ 39/Tag ·
  Originalverweis **99,5 %**. **Berlin weiterhin bei null:** 0 Rohdokumente, **0 Telemetriezeilen
  jemals**, alle 10 BE-Wege `needs_review`+`manual`, `berlin-basis` `prepared`, 0 Landtagsprofile.
- **Zugangsgrenze einer Cloud-Sitzung (präzisiert 2026-07-26, 19:15–19:30 UTC):** Supabase ist
  erreichbar (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` gesetzt, Egress HTTP 200) — Messung, Backup
  und SQL sind möglich. **Nicht** verfügbar ist die Vercel-Env: `VERCEL_TOKEN` ist nicht gesetzt,
  der Vercel-MCP-Server ist zwar **authentifiziert** (Team `nohut`, `prj_xbZ6…`), stellt aber **kein**
  Env-Werkzeug bereit, und `api.vercel.com`/`vercel.com` sind proxy-gesperrt (`CONNECT` → **403**) —
  ein bereitgestelltes `VERCEL_TOKEN` allein würde deshalb **nicht** genügen, der Egress müsste
  zusätzlich geöffnet werden.
  **Zwei ältere Angaben sind damit überholt:** (a) die Production-App ist **erreichbar** — über
  `web_fetch_vercel_url` (Vercel-MCP) antwortet sie mit **HTTP 401** statt des Proxy-`403`; sie ist
  also nicht unerreichbar, sondern unauthentifiziert (`PILOT_SECRET`/`CRON_SECRET` nicht gesetzt),
  und der Aufruf ist `GET`-only ohne eigene Header, kann also weder einen Crawl auslösen noch einen
  geschützten Endpunkt lesen. (b) Vercel-**Runtime-Logs** sind über MCP lesbar — ein
  Beobachtungskanal existiert, er zeigt aber HTTP-Ebene, **nicht** Umgebungsvariablen.
  **Folge unverändert:** `HELMUT_LANDESMODULE` ist weder lesbar noch setzbar noch rücksetzbar; damit
  ist Rollback Ebene 0 nicht verfügbar. Das blockiert jede Landesmodul-Aktivierung (Berlin wie
  Brandenburg) unabhängig vom Datenbankstand.
- **Nachmessung 2026-07-26, 19:21–19:24 UTC (zweiter Berlin-Production-Anlauf, read-only):** Bestand
  gegenüber 16:45–16:52 UTC **unverändert**. 9 Pakete · 163 Abrufwege · 165 Paketzuordnungen ·
  **8 Profile, 6 aktiv, politische Ebene ausnahmslos `bundestag`** → **0 Landtagsprofile** ·
  alle 18 Landesmodul-Wege (9 BE + `rp-rbb24-politik` + 8 BB) `needs_review`+`manual`,
  `last_success_at` **null** · Berliner Rohdokumente und Telemetriezeilen **jemals 0** ·
  Pending unverändert **50** (43 + 7) · LLM heute **34**/100 (Vortage 53/65/53/55) ·
  Fehlerrate 24 h **1,1 %** (28 von 2 534), 56 `circuit-open` · `pipeline_locks` 3 Zeilen,
  **alle abgelaufen** · letzte DB-Änderung 2026-07-26 **11:13:10 UTC** — also **vor** der Sicherung
  von 16:47, deren Grundlage damit weiterhin gültig ist (die Exportdatei selbst lag im Container
  jener Sitzung und existiert nicht mehr; vor jeder Mutation neu exportieren).
- **Nachmessung 2026-07-26, 20:15–21:10 UTC (Vorbereitungssprint 14B, read-only + zwei Sicherungen):**
  Profilbestand unverändert — **8 Profile, 6 aktiv, 0 Landtagsprofile**, das Abnahmeprofil existiert
  **nicht**. Quellenbestand unverändert (9 Pakete · 163 Abrufwege · 165 Zuordnungen ·
  `berlin-basis` trägt weiterhin die 3 Partei-/Fraktions-/Personenwege, Befund **A-3** offen).
  Zwei Sicherungen real erstellt (gegen `mainCommit 4bc58dc`): `pre-seed` **8/8**,
  `pruefsummeGesamt` `49a5b92d…` — **byte-identisch** mit der Sicherung vom 16:47 UTC, die
  Backup-Grundlage ist damit **gegengerechnet** statt aus Zeitstempeln erschlossen; und
  `pre-profil` **2/2** (`profiles` 8, `mandate_profiles` 8), `pruefsummeGesamt` `0c514ace…`.
  Beide Artefakte liegen im Container dieser Sitzung — vor jeder Mutation neu exportieren.
- **Paket-Inventur 2026-07-27, 07:30 UTC (Punkt 18, read-only, reproduzierbar):** **9 Pakete ·
  163 Abrufwege · 165 Zuordnungen · 0 verwaiste Zuordnungen · 0 Abrufwege ohne Paket ·
  9 Profile, davon 6 aktivierungsberechtigt.** Wege: **140 eingeplant · 4 defekt · 19 ausgeschlossen**
  (18 Landesmodul + 1 DIP-API). Paketzustände: **1 gesund · 3 eingeschränkt · 1 ausgefallen ·
  4 inaktiv · 0 unbekannt.** Ertrag 14 Tage: 86 485 gefunden, **47 344 neu** über 182 Quellen.
  Vier neue Befunde, alle **beobachtet, nichts korrigiert**
  (Details: [`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) §6):
  **(B-1)** `berlin-basis` steht weiterhin auf **`status='active'`** (`updated_at` 26.07. 21:02:11 =
  Block B1) — die ausgeführten Rollback-Ebenen 0b und 2 setzen den Paketstatus laut Runbook
  ausdrücklich **nicht** zurück. Heute folgenlos (0 berechtigte Berliner Mandate, alle 7 Wege
  gesperrt), aber eine der zwei Sicherungsschichten für Berlin ist damit verbraucht; die
  Rückstellung auf `prepared` wäre eine **freigabepflichtige** Production-Datenänderung.
  **(B-2)** `profil-<mandats-id>` ist das einzige **ausgefallene** Paket: sein Katalogweg teilt sich
  die `source_id` mit der Laufzeit-Personensuche, beide sind in der Telemetrie nicht unterscheidbar
  (Klasse `instabil`, 21 Ausfälle, letzte Lieferung 17.07.) → verschärft **A-5**, berührt **OP-19**.
  **(B-3) neu und gewichtig:** von **42** Laufzeit-Personensuchen haben **29 im Betriebszeitraum nie
  geliefert**; der letzte Volllauf enthielt **7 von 42** — alle von **einem** Mandat. Damit erhält
  **eines von sechs** aktivierungsberechtigten Mandaten seine personenbezogene Beobachtung, die
  übrigen stützen sich allein auf die geteilten Bundespakete. Dominante Ursache ist `circuit-open`
  (zentrale Drosselung, kein Quellendefekt) → **OP-15**. **(B-4)** 11 von 82 eingeplanten Wegen in
  `arbeit-und-soziales` sind `instabil`, ausnahmslos Google-News-Bündelsuchen → **OP-15**.
  **Bestätigt:** Befund **A-4** ist von 2 auf **1** defekten `always_on`-Weg geschrumpft
  (`bundesregierung`; `bundestag` und `linksfraktion` liefern wieder — die Stufe-1-Reaktivierung
  vom 26.07. wirkt). **Ebenfalls bestätigt:** der Crawl steht seit **2026-07-26 20:03:55 UTC** —
  die Inventur erkennt das automatisch (jüngste Telemetriezeile 11,4 h alt gegen eine
  rhythmus-abgeleitete Erwartung von 8 h) und meldet ausdrücklich, dass sie **nicht** den Zustand
  von jetzt beschreibt.
- **Nachmessung 2026-07-26 (Reparatursprint Vorgangsbildung, read-only):** erstmals wurde der
  **Endzustand jedes Rohdokuments** gemessen statt nur die Verknüpfungsquote. 7 Tage, **1 970
  Rohdokumente**, 97 liefernde Quellen: **13,9 % verstanden · 9,7 % offen in der Karenzzeit ·
  76,3 % ohne nachvollziehbaren Endzustand** (1 504 Dokumente, ältestes 161 h alt). 0 als Duplikat
  zusammengeführt, 0 bewusst ausgeschlossen, 0 vorgemerkt — diese Kategorien existierten schlicht
  nicht. Verarbeitungsdauer Rohdokument → Vorgang: **Median 2 min, Mittel 428 min, Max 112 h**
  (274 Fälle). Der Vergleich beider Verfahren an denselben Daten: Altverfahren 1 062 Cluster mit
  **254 Kollisionen = 932 Rohdokumente (47,3 %)** — die 47-%-Angabe aus PR #141 ist damit
  **bestätigt**; neues Verfahren 1 365 Cluster, **0 Kollisionen**, 252 Cluster (511 Rohdokumente)
  schreiben einen bestehenden Vorgang fort. **Damit ist eine ältere Angabe präzisiert:** die in
  §9 geführte „Verknüpfungsquote 13 %" war korrekt, beschrieb aber nur die Erfolgsseite — die
  Gegenseite (76,3 % ohne Endzustand) war nie gemessen worden. Werkzeuge:
  `scripts/vorgangsbildung-nachholen.js`, `scripts/vorgangsbildung-vergleich.js` (beide read-only,
  Vorschau ist Standard). **Nichts mutiert.**
- **NEU und bisher undokumentiert — die Crawl-Cron läuft ins Funktionslimit (gemessen 2026-07-26
  über die Vercel-Runtime-Logs):** in 7 Tagen **3** Antworten mit **HTTP 504**, **alle drei** auf
  `/api/cron/crawl`. Der Lauf um 20:00 UTC endete mit
  `Vercel Runtime Timeout Error: Task timed out after 300 seconds` (ein Mandat mit
  `eager-understanding 92371ms`, dazu 7 Zeitüberschreitungen auf Google-News-Profilquellen eines
  weiteren Mandats). Die Telemetrie desselben Laufs ist sauber (147 Zeilen = 147 distinct
  `source_id`, 145 `ok`, 0 `error`) — **eine reine Telemetriebetrachtung hätte diesen Befund nicht
  gezeigt.** Folge für Punkt 14: das Abnahmeprofil wäre ein **7.** aktives Mandat an
  Sortierposition **3 von 7** in einer **sequenziellen** Cron-Schleife mit hartem Zeitbudget und
  erzeugt selbst **6 zusätzliche Google-News-Abrufe je Lauf** (5 Mandats- + 1 Personenquelle,
  gemessen) — unabhängig vom Flag. Gehört zu OP-15/B1; neues Abbruchkriterium 16 in
  `betrieb/berlin-aktivierung.md` §11.
- **Ist-Zustand nach Aktivierung UND Rollback (gemessen 2026-07-26, 22:45–22:50 UTC):** **163**
  Abrufwege · **165** Paketzuordnungen · **9** Pakete — alle drei **unverändert**.
  `berlin-basis` **`active`** mit **7** (statt 10) Wegen — Block A und B1 wurden bewusst **nicht**
  zurückgerollt, weil sie keinen Abruf erzeugen und Block A den Befund **A-3** schließt.
  `bund-basis` unverändert `active`/54, `brandenburg-basis` unverändert `prepared`/9 mit **8/8**
  gesperrten Wegen. **0 Berliner Wege aktiv** — alle **10** wieder `needs_review`+`manual`.
  Profile **9**, aktive Mandate zurück auf **6**, **0 berechtigte Berliner Landtagsmandate**
  (das Abnahmemandat steht auf `aktiv = false` und bleibt als Auditspur), Bundestagsprofile
  unverändert **8** mit unveränderter Versorgung (140 Quellen je Mandat).
  Berliner Telemetriezeilen und Rohdokumente: **jemals 0** — der erste Berliner Crawl hat **nie**
  stattgefunden.
- **Zwei `504` am 2026-07-26** (beide über die Vercel-Runtime-Logs, **nicht** aus der Telemetrie
  sichtbar): **20:00:14** `/api/cron/crawl` (noch mit 6 Mandaten, **vor** der Berliner Aktivierung,
  91 Cluster) und **22:09:52** `/api/pipeline/run` (manuell ausgelöst, 4 Minuten nach dem
  #143-Deployment, **336** Cluster). Der zweite Lauf schrieb **46 Rohdokumente** (0 Berlin),
  **184 Knowledge Objects** (8 `complete`, **176 `pending`**) und **0 Telemetriezeilen**.
  **Folge: Pending-Rückstand 50 → 226** (219 + 7). Das ist ein Betriebsbefund zu **#143**, kein
  Punkt-14-Befund — er wird durch den Berlin-Rollback **nicht** abgebaut.
- **Zustand:** 0 neue `systemErrors` im dokumentierten Beweiszeitraum; Betriebsbefunde
  B1 (Google-News-Klumpenrisiko, 146 von 163 Wegen über Google) und B2
  (Understanding-Rückstand) bleiben offen. Neu belegt: jeder Cron-Lauf erscheint doppelt —
  ein vollständiger Lauf und ~3 min später eine Wiederholung mit `circuit-open` auf fast
  allen Wegen (3 988 Telemetriezeilen gesamt) → gehört zu OP-15.
- **Kosten (read-only gemessen 2026-07-26):** bekannte LLM-Kosten **0,1370 USD/Betriebstag**
  im Mittel (7 volle Tage, Spanne 0,118–0,150; 30-Tage-Hochrechnung ≈ 4,11 USD) · einziger
  bepreister Provider ist `gpt-5-mini` · **79 % global / 21 % direkt mandantenzurechenbar** ·
  die Zahl ist eine **Untergrenze** (~16 % der Protokolleinträge gehen unter Parallelität
  verloren) und beruht auf einer **unbelegten** Preisbasis · Supabase, Vercel, Crawl-Volumen,
  Push und DIP sind ungemessen **und ungedeckelt**. Vollständig:
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md).
- **Nicht angewandte Migration:** `20260721` (DB-Härtung) — gehört zu OP-03.

## 10 · Letzte wichtige Entscheidungen

| Datum | Entscheidung |
|---|---|
| 2026-07-26 | **Jeder Production-Schritt bekommt eine Datei — auch der, der nur „zwei Zeilen" ist** (14B). Schritt 5 der Berliner Reihenfolge stand als Prosa zwischen acht fail-closed SQL-Schritten und wäre im Beweislauf von Hand ausgeführt worden: ohne Vorbedingung, ohne Idempotenz, ohne eigenen Rückweg. Ein Schritt ohne Riegel ist kein kleiner Schritt, sondern der ungesicherte |
| 2026-07-26 | **Ein Rückweg zählt nur, wenn er aus der Sitzung heraus ausführbar ist** (14B). Rollback Ebene 0 (Flag) bleibt es nicht. Belegt ist stattdessen, dass **zwei** datenbankseitige Not-Aus-Schalter — Abnahmeprofil deaktivieren (Ebene 0b) und Wege auf `manual` (Ebene 2) — **jeder für sich** jeden Berliner Abruf stoppen, auch bei gesetztem Flag. Das ersetzt Ebene 0 **nicht**: wer das Flag setzt, muss es zurücknehmen können — es macht die Lage aber steuerbar statt unsteuerbar |
| 2026-07-26 | **Ein Sicherungsumfang wird an den Eingriff geschnitten, nicht an die Bequemlichkeit** (14B). `--scope=seed` deckte die beiden Profiltabellen nicht ab, `--scope=voll` hätte Rohdokumente, Briefings und Interaktionen mitgezogen. Neuer Umfang `--scope=profil` sichert genau `profiles` + `mandate_profiles`. Ein leerer Teil-Export gilt weiterhin **nicht** als Sicherung (Exit 1) |
| 2026-07-26 | **Der Rückweg eines Profilschritts ist die Rollback-Datei, nicht der Restore** (14B). `profiles` trägt `ON DELETE CASCADE` auf **14** Tabellen — ein `delete` erzeugt keine Fremdschlüssel-Waisen (die frühere Runbook-Formulierung war falsch), sondern **löscht erzeugte Daten mit**. Deshalb: deaktivieren vor markieren vor löschen, und Stufe 2 bricht ab, sobald eine abhängige Zeile existiert |
| 2026-07-26 | **Die Abnahme-Id wird NICHT ans Ende der Mandatssortierung gelegt** (14B). Das hätte die Bestandsmandate im Zeitbudget nach vorn geholt, aber das Testmandat selbst zum wahrscheinlichsten Abschnittskandidaten gemacht — ein Beweislauf, der „0 Berliner Dokumente" meldet, weil sein Mandat nie verarbeitet wurde, ist die schlechtere Fehlerart. Beide Fälle sind sichtbar (systemError), keiner ist still; die Wahl gehört dem Betreiber (`berlin-aktivierung.md` §20.5) |
| 2026-07-26 | **Der Berliner Beweislauf braucht zwei Voraussetzungen, nicht eine** — der zweite Production-Anlauf hat belegt, dass der Flag-Zugang allein nicht genügt. Seit 14A/V-2 aktiviert `HELMUT_LANDESMODULE=berlin` **ohne** ein berechtigtes Berliner Landtagsprofil **0** Wege; Production führt 0 Landtagsprofile. Ein Anlauf, der nur das Flag beschafft, endet in einem No-Op statt in einem Beweis (`berlin-aktivierung.md` §19.5) |
| 2026-07-26 | **Ein `VERCEL_TOKEN` allein macht die Vercel-Env aus einer Cloud-Sitzung nicht erreichbar** — `api.vercel.com` und `vercel.com` sind proxy-gesperrt (`CONNECT` → 403). Die Übergabe an den Betreiber verlangt deshalb entweder das Setzen des Flags durch ihn selbst **oder** Token **und** geöffneten Egress. Die frühere Formulierung „einer Agenten-Sitzung `VERCEL_TOKEN` bereitstellen" war unvollständig (§19.4) |
| 2026-07-26 | **Ein Backup, auf das nicht mehr zugegriffen werden kann, gilt nicht als Backup** — die Sicherung vom 16:47 UTC ist inhaltlich weiterhin gültig (die drei gebundenen Tabellen sind seit 11:13 UTC unverändert), ihre Exportdatei lag aber im Container jener Sitzung. Vor jeder künftigen Mutation wird neu exportiert, statt sich auf ein Manifest aus einer beendeten Sitzung zu berufen |
| 2026-07-26 | **Eine gestaffelte Production-Änderung wird durch getrennte Dateien und ausführbare Riegel erzwungen, nicht durch Kommentare** (14A/V-1). Jede Stufe hat eine eigene Transaktion, eigene Vor-/Nachbedingungen als `raise exception`, einen eigenen Dry Run und einen eigenen Rollback. Die frühere Sammeldatei bleibt als **fail-closed Stop-Datei** erhalten, damit eine ältere Anleitung nichts mehr aktiviert |
| 2026-07-26 | **Die Reihenfolge einer Staffelung wird am Betriebsbeleg geprüft, nicht am Zustand** (14A/V-1). Stufe 2 verlangt je Stufe-1-Weg mindestens **2** Läufe mit `status='ok'` in `source_crawl_telemetry`. Zwei Dateien direkt hintereinander auszuführen wäre formal „Stufe 1 zuerst“ und trotzdem genau der Lastfall, den die Staffelung verhindern soll |
| 2026-07-26 | **Ein Landesmodul braucht Freigabe UND ein berechtigtes Landtagsmandat** (14A/V-2). Das Flag allein genügte bisher; über den zweiländrigen `rp-rbb24-politik` konnte ein **Brandenburger** Mandat bei reiner Berlin-Freigabe einen Landesweg starten. Gezählt wird über `resolveProfilePackages()` — ein **Bundestags**mandat mit `bundesland='Berlin'` berechtigt Berlin nicht (4 der 6 aktiven Production-Profile sind genau das) |
| 2026-07-26 | **Der geteilte Rohkorpus wird dokumentiert, nicht als Isolation ausgegeben** (14A/V-2). `raw_documents` und `knowledge_objects` tragen kein `tenant_id`; mandatsscharf ist die Relevanzauswahl stromabwärts, nicht der Abruf. Mandatsbezogen auf Abrufebene sind **nur** Landesmodul-Wege. Ein Berliner Testprofil beweist deshalb die Paketauflösung und das Gate — **nicht** eine getrennte Verarbeitung (`berlin-aktivierung.md` §18.3) |
| 2026-07-26 | **Die allgemeine Paketberechtigung je Profil wird in 14A NICHT geändert** — read-only gemessen würde sie 5 von 6 aktiven Profilen betreffen (−6 bis −88 von 140 Abrufwegen, u. a. 82 Wege aus `arbeit-und-soziales`). Das ist eine Produktentscheidung über die Versorgung bestehender Mandate und stellt **keine** Isolation her (gemeinsamer Korpus). Gehört zu OP-03 |
| 2026-07-26 | **Eine Landesmodul-Aktivierung wird nicht begonnen, solange das Freigabeflag nicht auch zurückgenommen werden kann.** Der Production-Sprint hätte Block A, Testprofil und Stufe 1 rein datenbankseitig ausführen können — er hat es nicht getan. Ohne Vercel-Zugang ist Rollback **Stufe 0** (Flag leeren, ohne DB-Schreibzugriff) nicht verfügbar, und Riegel 1 ist nicht einmal auslesbar. Drei von vier Riegeln zu entfernen, während der vierte weder messbar noch steuerbar ist, ist kein zulässiger Zwischenzustand |
| 2026-07-26 | **Die Pre-Seed-Sicherung ist erstmals real gelaufen** (8/8 Tabellen, `vollstaendig: true`). Damit ist belegt, dass produktionsrelevante Skripte in einer Cloud-Sitzung lauffähig sind, sobald die Secrets über die Environment-Einstellungen bereitstehen (`CLAUDE.md` §4.9) — der Fehlschlag vom 2026-07-25 lag an fehlenden Zugangsdaten, nicht am Werkzeug |
| 2026-07-26 | **Unbekannte Kosten werden nie zu 0,00 addiert** — `0,00` ist ausschließlich zulässig, wenn nachweislich **kein** Provideraufruf stattfand. Der Kostenkern trennt dauerhaft `gemessen` / `kosten-unbekannt` / `kein-provideraufruf`; die Altsummen (`getLlmUsageToday`, `getLlmCostSince`) bleiben unverändert bestehen, sind aber ausdrücklich **nicht** die ehrliche Wahrheit |
| 2026-07-26 | **Preise werden deklariert, nicht korrigiert** — die Preistabelle bleibt unverändert (eine Preisrecherche oder ein aus dem Gedächtnis gesetzter Preis wäre schlechter als ein deklarierter Schätzwert). Stattdessen trägt jede Kostenangabe ihre Herkunft; belegt wird sie vom Betreiber über `HELMUT_LLM_PRICE_SOURCE`. Solange sie unbelegt ist, gilt ein Betrag als **berechnet**, nicht als Providerkosten |
| 2026-07-26 | **Globale Kosten werden nicht auf Mandanten verteilt** — gemessen sind 79 % geteilte Arbeit; jede Verteilungsformel ohne gemessene Bezugsgröße wäre eine erfundene Wahrheit. Ausgewiesen wird nur die Bemessungsgrundlage (direkt zurechenbar · global · noch nicht zurechenbar) |
| 2026-07-26 | **Vorbereitete Pflichtquellen statt globaler Kuratierungsschwelle** — `regional-niedersachsen` bekommt seine benannte Basis über 7 gezielt gebundene Wege im Zustand `paused`/`manual` + `active: false`. Das Anheben der Kuratierungsschwelle (rund 20 zusätzliche Google-Abrufe je Crawl) ist damit **nicht** nötig; die Aktivierung bleibt eine eigene Freigabeentscheidung |
| 2026-07-26 | **„Fachlich nicht anwendbar" ist nur mit überprüfbarer Voraussetzung zulässig** — stabile Kennung, politische Begründung, Wahlperiode, amtlicher Beleg und eine Prüfung gegen `seeds/parlamentszusammensetzung.js`. Eine unbestätigte Ausnahme lässt die Klasse als offene Lücke stehen; Freitext genügt nicht mehr |
| 2026-07-26 | **Auch die Fraktionssollmenge wird extern verankert** — die Alt-Zählung „8 von 8" war fachlich falsch (FDP und BSW nicht im 21. Bundestag, SSW ohne Fraktionsstatus). Richtig sind 5 Fraktionen. Die drei Quellen bleiben erhalten, werden aber als `parteien_ohne_fraktionsstatus` geführt |
| 2026-07-26 | **Die amtliche Bezeichnung wird je Ausschuss belegt, nicht aus der Anzahl geschlossen** — die Sollmenge hatte mit 24 die richtige Anzahl und trotzdem für 2 Ausschüsse die falsche Bezeichnung („Ausschuss für Inneres und Heimat" ist die der 20. WP, „Ausschuss für Verkehr" war nie amtlich). Die Sollmenge trägt jetzt zusätzlich die **amtliche Ausschussnummer**; kein aktueller Ausschuss darf mit einer Webarchiv-Seite einer älteren Wahlperiode belegt werden |
| 2026-07-26 | **Die Ausschuss-Sollmenge wird extern verankert, nicht aus dem Katalog abgeleitet** — eine katalogrelative Vollzähligkeitsprüfung ist per Konstruktion erfüllbar und hat den Fehlbestand 23 statt 24 verdeckt. Kanonische Quelle: `seeds/bundestag-ausschuesse.js` (Drucksache 21/150) |
| 2026-07-26 | **Katalog-Ids der Ausschusswege bleiben eingefroren**, auch wo der Slug nicht mehr zum amtlichen Namen passt. Eine Id-Änderung würde beim Seed-Einspielen eine neue `retrieval_paths`-Zeile anlegen und die alte als weiter gecrawlte Waise im Pflichtpaket zurücklassen. Die fachliche Bindung läuft über `ausschussKey` |
| 2026-07-26 | **Ein ständiger Bundestagsausschuss gehört immer auch in `bund-basis`** — die Zusage „alle Ausschuesse" des neutralen Pflichtpakets ist eine Vollzähligkeitsregel und wird jetzt gezählt, nicht behauptet. Zuvor fehlte genau der Ausschuss des Pilotmandats im Pflichtpaket |
| 2026-07-26 | **`regional-niedersachsen` bleibt „teilweise vollständig"** — die fehlenden benannten Regionalherausgeber werden **nicht** durch Anheben der Kuratierungsschwelle nachgezogen (≈ 20 zusätzliche Google-Abrufe je Crawl, verstärkt Befund B1). Kosten-/Laufzeitentscheidung des Betreibers; die Lücke ist testgesichert statt kaschiert |
| 2026-07-26 | **Fachlich unmögliche Pflichtklassen werden ausgewiesen, nicht entfernt** — `die-linke-brandenburg` behält alle 3 Pflichtklassen; die 2 nicht besetzbaren tragen eine Begründung und halten das Paket bei „teilweise vollständig". Kriterien werden nicht abgeschwächt, um Grün zu erzeugen |
| 2026-07-25 | **Neue dauerhafte Regel (`CLAUDE.md` §4.9):** produktionsrelevante Skripte mit Secrets müssen sowohl lokal als auch in einer Claude-Code-Cloud-Sitzung lauffähig sein. Secrets erreichen eine Cloud-Sitzung ausschließlich über die Claude-Code-Environment-Einstellungen, niemals über Chat oder Commits. Geprüft: kein Skript im Repo parst `.env.local` selbst per `dotenv` — alle lesen ausschließlich `process.env` und sind damit bereits kanalunabhängig; `docs/betrieb/env-inventar.md` §8 führt die Cloud-Environment-Variable als vierten Kanal neben Vercel, lokaler Shell/`.env.local` und GitHub Secrets |
| 2026-07-25 | **Die 6 reparierten Bundeswege werden gestaffelt reaktiviert** — erst die 2 Direktfeeds, nach einem vollen Crawl-Zyklus die 4 Google-Wege (`betrieb/quellen-seed-einspielung.md` §6d). Umsetzung als gezieltes `update` nach dem Seed, **nicht** durch Bearbeiten der Seed-Datei: der Bund-Seed ist per Drift-Gate byte-genau an seinen Generator gebunden |
| 2026-07-25 | Der Parallelbranch `claude/helmut-seed-review-6nocps` wird **nicht als Ganzes gemergt** — seine Doku-Fassung ist von vor den Korrekturen abgezweigt und würde die gemessenen Ist-Zahlen, die Delta-Prüflogik und die Staffelung zurückdrehen. Seine drei Code-Änderungen sind einzeln triagiert (Runbook §6d.2) |
| 2026-07-25 | `rp-ausschuss-arbeit-soziales` wird **erst vor Stufe 2 entschieden**, anhand echter Telemetrie. Das zweite Argument des Parallelbranches trifft zu: der reparierte `rp-bundestag` holt `pressemitteilungen.rss` **und** `presse/hib/rss` direkt — der Google-Weg `site:bundestag.de` ist damit ein Aggregator-Umweg auf eine bereits direkt abgerufene Domain. Umsetzung per `update`, nicht per Katalog-Override |
| 2026-07-25 | Die Erweiterung der `on-conflict`-Klausel um `url`/`query`/`parser`/`max_items` (R-2) **läuft nicht mit der Erstanwendung** — sie betrifft 144 Abrufwege statt 6 und ist von keiner geprüften Soll-Zahl abgedeckt. Eigener Schritt, eigene Vorschau, eigene Freigabe |
| 2026-07-25 | PR #125 (Sicherung + gezielter Restore) gemergt (`0d6d867`); CI auf `main` grün, Vercel-Production `READY` |
| 2026-07-25 | **Prüfungen im Seed-Runbook arbeiten mit gemessenen Deltas und benannten Zeilen**, nicht mit absoluten Zahlen aus einer Doku — absolute Zahlen driften bei jeder Provisionierung und hätten eine korrekte Datenbank fälschlich gestoppt |
| 2026-07-25 | Der Seed-Rückweg ist ein **gezielter, zeilenscharfer Restore** — `drop table … cascade` ist als Rollback **verworfen** (würde wegen `ON DELETE CASCADE` fremde Daten mitreißen und ist für Rückbau unbrauchbar) |
| 2026-07-25 | Ein Backup mit Fehlern gilt **nicht** als Backup: `backup-export.js` prüft die Zeilenzahl serverseitig gegen und markiert das Manifest `vollstaendig: false` + Exit 1 |
| 2026-07-25 | PR #124 (Paket-Inventur + Zuweisungsnachweis) auf Betreiberfreigabe gemergt (`118e90c`); CI auf `main` grün, Vercel-Production `READY` |
| 2026-07-25 | Anker-Recovery-Pfad **stillgelegt und auf `main` durchgesetzt** (PR #105, `43e9e35`); Wiederbelebung wird durch einen namensunabhängigen CI-Riegel blockiert |
| 2026-07-25 | Kontext-Einstiegsschicht ist verbindlich; `CLAUDE.md` → `START_HERE` → `CURRENT_STATE` ist die Pflichtlektüre jedes Threads (PR #119) |
| 2026-07-25 | Der anker-basierte Recovery-Pfad wird **nicht repariert, sondern stillgelegt**; echte Recovery läuft ausschließlich über den Einzeldokument-Pfad je exakter `raw_document_id` (PR #105) |
| 2026-07-22 | `main` ist die einzige Architekturwahrheit; Generation B wird nicht integriert (PR #114) |
| 2026-07-22 | Kanonische Doku-Hierarchie festgelegt: Sicherheit → `05-…`, Status → `00-master-status`, offene Punkte → `datenmotor-restliste` |
| 2026-07-17 | Einheitliches Nummernschema: OP-xx für offene Punkte; FA-x/FT2-x/A-Px nur noch historisch |
| 2026-07-15 | Quellen-Cutover ausgeführt (`HELMUT_SOURCE_MODE=on`) |
| 2026-07-15 | PILOT_SECRET rotiert |
| 2026-07-13 | Tenant-JWT-Pfad dauerhaft stillgelegt; Trennung bleibt App-seitig |

## 11 · Nächster sinnvoller Sprint

> **Nachtrag 2026-07-29 (Sprint 23C-2A):** Für Roadmap-Punkt 23 ist der nächste Schritt keine
> Entwicklung mehr, sondern eine **Freigabeentscheidung**: Merge von PR #171 (sichtbare Erklärung,
> bereits in `main`) ist erfolgt, **PR #174 (Sprint 23C-2A) ist ebenfalls gemergt und in Production nachgewiesen**.
> Für Punkt 23 ist jetzt gar keine Arbeit mehr offen, sondern nur noch **Zeit**: die Abdeckung steigt mit den
> regulären Läufen, bis alle sieben Mandanten neu gerechnet sind.
> Danach steigt die Abdeckung **ohne weiteren Eingriff** mit den regulären Crawl-Läufen — wegen
> Befund **B5** (Crawl-Zeitlimit) und **B6** (kein Einzelmandanten-Einstieg) über mehrere Tage
> statt auf einen Schlag. Erst danach ist zu entscheiden, ob **M-8** (fehlender Schwellenwert der
> RPC — 40 aktuelle Zeilen mit Ähnlichkeit ≤ 0) als eigener, freigabepflichtiger Sprint angegangen
> wird; er verändert Kandidatenmenge und Ränge und ist deshalb **keine** Fehlerbehebung mehr,
> sondern eine Produktentscheidung. **M-9** (Mandatsprofil ohne Partei/Ausschuss/Schwerpunkt)
> ist Betriebsarbeit und hängt an **OP-04**.

**Empfehlung: die eine offene OP-01-Betreiberentscheidung einholen — Supabase Pro
(~25 $/Monat) + PITR aktivieren.** Der kostenfreie Teil von OP-01 ist seit
2026-07-28 erledigt (Vollsicherung + bewiesener isolierter Rückweg, RTO gemessen);
was fehlt, ist ausschließlich die Kostenfreigabe im Supabase-Dashboard (Billing →
Pro → PITR), danach eine PITR-Restore-Übung nach Runbook §3. Bis dahin gilt der
tägliche manuelle Export (Runbook §1, 5 Minuten) als Betreiber-Routine —
insbesondere **vor jeder Migration** (OP-03/OP-17).

**Für Punkt 14 gilt nach dem Vorbereitungssprint 14B: es fehlt genau EINE Voraussetzung, und sie
ist keine Entwicklungsaufgabe.** Von den beiden Blockern des zweiten Anlaufs ist der zweite
beseitigt.

1. **Flag-Zugang — offen, Betreiberhandlung.** `HELMUT_LANDESMODULE` ist aus einer Cloud-Sitzung
   weder lesbar noch setzbar noch rücksetzbar; am 2026-07-26 auf **sechs** Kanälen neu gemessen
   (Vercel-REST · Vercel-MCP · Datei-Flag · App · GitHub Actions · Runtime-Logs),
   [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §20.3. **Kleinste Aktion:** in
   der Vercel-Oberfläche Projekt `helmut-pilot` → Settings → Environment Variables → Production
   `HELMUT_LANDESMODULE` = `berlin` setzen und redeployen; Rücknahme = Wert auf `off` oder Variable
   löschen + Redeploy (ein unbekannter Wert wirkt fail-closed). Alternativ `VERCEL_TOKEN` **und**
   geöffneter Egress zu `api.vercel.com` — eines allein genügt nicht.
2. **Abnahmeprofil — erledigt (14B).** Schritt 5 ist keine Prosa mehr, sondern vier generierte,
   fail-closed, idempotente SQL-Dateien mit drei Rückwegen, gegen ein echtes PostgreSQL 16
   bewiesen (36/36) und read-only gegen Production trockengefahren (Schritt 1 **jetzt ausführbar**,
   Kontrollfragen 0). Ebenfalls geschlossen: der passende Sicherungsumfang (`--scope=profil`) und
   der Nachweis, dass **zwei** DB-seitige Not-Aus-Schalter jeder für sich jeden Berliner Abruf
   stoppen. Details: §20.

Punkt 15 (Brandenburg) bleibt aus demselben Grund (1) blockiert; zusätzlich ist vor einem Merge von
PR #132 der konkurrierende Gate-Name zu vereinheitlichen (§19.6).

**Ansonsten entscheidungsreif und wartend (seit 2026-07-26): die Berlin-Aktivierung.** Punkt 14 ist bis
unmittelbar vor die erste Production-Änderung vorbereitet; jeder Eingriff ist zeilengenau benannt
und seit 14A in **fünf Ebenen** rückrollbar — davon zwei je Aktivierungsstufe getrennt. **Bedingung V2 (Neuverifikation) ist erledigt** — sie lief am
2026-07-26 auf einem Actions-Runner mit offenem Egress (Runs `30208901908` + `30208997672`,
zweimal identisch) und hat das Aktivierungsset von 6 auf **4** Wege reduziert: `rp-be-landesparlament`
(jüngstes Item **156 Tage** alt) und `rp-be-landesfraktionen` (**41 Tage**) antworten zwar mit
HTTP 200, liefern aber nichts Aktuelles. **Offen bleibt V1**: die Neutralisierung von `berlin-basis`
ist in der Datenbank weiterhin nicht vollzogen (Befund A-3, am 2026-07-26 um 16:45 UTC erneut
gemessen). Der Dry Run des Production-Sprints hat belegt, dass Block A exakt 3 + 3 Zeilen berührt
und **keinen** Bundes- oder Brandenburg-Datensatz.
Runbook: [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md), Ausführungsprotokoll §16.

Der **konkret vorbereitete** nächste Schritt ist die **Quellen-Seed-Einspielung** (Seeds
`20260713` + `20260717`); sie macht die P0-2-Neutralisierung und die 6 Bundesweg-Reparaturen in
der Datenbank wirksam. Sie ist jetzt **vollständig entscheidungsreif**: Soll-Zahlen,
Idempotenznachweis, Rückweg, Kontrollkarten je Abrufweg und ein 17-Schritte-Runbook stehen in
[`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md).

Sie bleibt **blockiert**, aber nur noch an zwei Betreiberhandlungen:
1. `node scripts/backup-export.js --scope=seed` gegen Production ausführen (read-only, braucht
   `SUPABASE_SERVICE_ROLE_KEY`) und im Manifest `vollstaendig: true` bestätigen.
2. Die **absichtliche Reaktivierung der 6 Bundeswege** ausdrücklich mitfreigeben (§12).

Der gezielte Restore für den Fehlerfall ist gebaut und isoliert getestet — er ersetzt OP-01
**nicht**, deckt aber genau den Seed-Sonderfall ab.

Die Paket-Inventur belegt den Handlungsbedarf mit Production-Zahlen: die Landes-Basispakete tragen
in der Datenbank weiterhin Partei-, Fraktions- und Personenquellen (A-3), und 2 der 5
`always_on`-Kernwege stehen weiterhin auf `broken` (A-4). Ohne die Seed-Einspielung können die
Phase-1-Punkte 6, 7, 14 und 15 nicht grün werden
([`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) §7).

Parallel möglich, ohne Freigabe:
1. **OP-11 Branch Protection** verifizieren (2 Minuten, reversibel,
   `betrieb/branch-protection.md`).
2. **Review offener PRs** (#112, #111).
3. **Phase-1-Checkliste** fortführen: [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md)
   ist die operative Wahrheit; nächster nicht-freigabepflichtiger Block sind die Punkte 19–23
   (Ebenen-/Geografie-/Embedding-Vollständigkeit, Matching-Nachvollziehbarkeit).
   **Punkt 23 steht weiterhin auf ⏳ (Stand 2026-07-29)**: Sprint 23A hat den Ist-Zustand
   verifiziert und die Architekturentscheidung getroffen, **Sprint 23B-1 ist erfolgreich
   abgeschlossen** — die Auditpersistenz läuft seit 2026-07-28 in Production, erster Auditlauf
   und Idempotenz sind belegt
   ([`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §25). Offen bleiben
   **23B-2** (Briefing-Historisierung) und **23C** (sichtbare Nutzererklärung); erst mit 23C
   wird Punkt 23 erfüllt, weil der Nutzen bis dahin nicht sichtbar ist.
   **Punkt 19 ist seit 2026-07-27 auf ⏳**: die Ebene wird jetzt dauerhaft gespeichert und
   wiederverwendet (`ARCHITECTURE.md` §7b), inhaltlich fehlen aber noch **78** verstandene
   Vorgänge ohne ermittelte Ebene. Ihre Nachklassifikation gehört fachlich zu **Punkt 21** und
   braucht vorher eine Entscheidung, woraus die Ebene dort kommen soll (Quelle/Paket als
   autoritatives Signal vs. erneuter KI-Aufruf) — das ist der naheliegende Anschlusssprint.

**Vor einer OP-06-Ausführung ist eine Fachentscheidung nötig:** die mandatsrelative
Begründung von 16 der 34 Allowlist-Einträge (§3) muss bewertet werden — terminale
Markierung in einer mandantenneutralen Tabelle wirkt für alle künftigen Mandanten.

## 12 · Letzter Sprintausgang

| Sprint | Datum | Zustand |
|---|---|---|
| **Sprint R-6 — Zuverlässige Cron-Telemetrie bei Zeitüberschreitung** | 2026-07-31 | **Teilweise abgeschlossen (Ursache belegt, Behebung offline bewiesen und mutationsgesichert; Production-Nachweis offen, weil er einen Merge voraussetzt).** **Ursache in drei Teilen, im Code belegt:** (1) `withTimeout` ist ein `Promise.race` und **beendet die ursprüngliche Promise nicht** — greift das äußere Zeitlimit (280 000 ms), kehrt `runCronForTenants` nie zurück und die `[cron/*/fairness]`-Zeile entsteht nie; (2) die 10 s Differenz zur inneren Deadline (270 000 ms) reichen **prinzipiell** nicht, weil die innere Deadline ein **START-Gatter** ist (`if (now() + reserveMs > deadline) … continue`) und ein einmal begonnenes Mandat sie beliebig weit überzieht — offline gemessen **> 400 s**; (3) ein `finally` allein wäre keine Lösung, weil bei einem Vercel-Prozessabbruch die Ereignisschleife nicht weiterläuft. **Behebung:** Laufdatensatz je Cron (`laeufe[<cron>]`) in derselben `helmut_store`-Zeile `<storeId>-cron-fairness` — Laufbeginn (Planung, aktive Zahl, blockierte Mandate) vor dem ersten Mandat, jeder Mandatsausgang huckepack auf Claim/Abschluss (**0 zusätzliches IO**), Abschluss am Ende; verweigerte Sperre und fremder Halter erhalten einen eigenen Ausgang, der die Buchführung je Mandat **nicht** anfasst (kein erfundener Erfolg, kein erfundener Fehler). Der äußere Catch der drei betroffenen Routen vermerkt **nur die Tatsache** `aeusseresTimeoutAt` und hebt den Status auf `abgebrochen` **nur**, solange er `laufend` ist — ein später eintreffender echter Abschluss gewinnt (monotone Rangfolge). `rekonstruiereLauf` rechnet die vollständige Telemetrie aus den Zwischenständen nach; Rekonstruktion und gemeldete Telemetrie werden im Test **gegeneinander** geprüft. **Warum ein Prozessabbruch keinen erfundenen Erfolg erzeugen kann:** ein Abschluss entsteht nur durch einen Schreibvorgang; bleibt er aus, bleibt der Datensatz `laufend`, und ein veraltetes `laufend` **ist** die Abbruchmeldung. **Bewusst nicht getan:** `process_runs` als Ablage (relational flaggegated und damit freigabepflichtig, Blob-Rückfallpfad ist genau der W-2-Last-Write-Wins-Pfad mit 1,24 MB je Schreibvorgang), zweites Telemetriesystem, neue Tabelle, Anhebung irgendeiner Zeitgrenze, Kapazitätsarbeit. **Preis:** `FAIRNESS_VERSION` 1 → 2; im Rolloutfenster kann eine Vorgänger-Instanz den Schreibvorgang verweigern (`zustand-neuere-version-2`) → getesteter Fail-safe-Pfad, laut statt still. **Tests:** cron-fairness **285/285** (+84 gegenüber 201/201), Mutationsprobe **15/15 rot** (5 neu), p29-Vertrag **80/80**, p29-Mutationsprobe **7/7 rot**, Offline-Suite **177/191** mit identischer Basislinie und Fehlschlagliste wie `main` `bd7c889` (nach dem Rebase erneut gemessen), Browser-/Mobile-Smoke **32/32**. **0 KI, 0,00 USD**, keine Migration, keine Production-Änderung, kein Merge, kein Deployment. **Der Kapazitätsblocker (OP-25 §10.5/§10.7) bleibt offen** und war ausdrücklich nicht Gegenstand. Branch `claude/cron-telemetry-timeout-sg8emb`. Kanonisch: [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §11. |
| **Sprint OP-25, Vorprüfung Mergefreigabe: verweigerte Mandatssperre wurde als Erfolg verbucht** | 2026-07-30 | **Teilweise abgeschlossen (Fehler gefunden und behoben, Repository-Umsetzung vollständig; Production-Nachweis offen).** Die Betreiberfrage nach der Reihenfolge „Fairnessvermerk vor Mandatslock" traf einen **realen Defekt**. Ablauf: der Vermerk entsteht vor der Verarbeitung, die Sperre `crawl-<mandat>` erst in `runSourceCrawl` — und die **wirft** bei verweigerter Sperre nicht, sondern liefert `{ skipped: true, reason: "already running" }`. Die Schleife wertete das als Erfolg und schrieb einen **erfundenen Erfolg** (Erfolgszeitpunkt, Erfolgszähler +1, Fehlerserie 0), zählte das Mandat in `begonnen` und damit in `k`, wodurch die gemeldete Obergrenze `ceil(n/k)` **zu optimistisch** wurde und `fairness.erfolgreich` ein nie angefasstes Mandat nannte. **Korrektur einer früheren Aussage dieses Sprints:** `fremderHalter` deckt diesen Pfad **nicht** ab — claimt der andere Lauf erst nach der Planung dieses Laufs, ist der eigene Vermerk der jüngere, führt die Verschmelzung, und die Prüfung greift nicht. Nur die Sperre fängt es, und deren Rückgabewert war falsch verbucht. **Fix, ohne die Sperre anzufassen:** `sperreVerweigert()` erkennt genau die Zeichenkette `already running` (Vertragstest gegen `scheduler.js`); das Mandat wird aus `begonnen` zurückgenommen, es gibt **keinen** Abschluss-Schreibvorgang (kein erfundener Erfolg, kein erfundener Fehler), und der Fall ist eindeutig beobachtbar in `fairness.lockVerweigert` (Teilmenge von `laeuftBereits`) sowie in der Protokollzeile als `sperreVerweigert=…`. Der bereits geschriebene Versuchsvermerk bleibt bewusst `laufend` — monotone Verschmelzung lässt ihn nicht zurücknehmen, er sperrt das Mandat für weitere überlappende Läufe und läuft nach 30 min ab; danach steht es wieder vorn, weil sein Versuchszeitpunkt der älteste ist (getestet). Andere `skipped`-Gründe (`profil-deaktiviert`) bleiben normale Versuche. **Zusätzlich belegt:** `HELMUT_CRON_FAIRNESS` ist ohne gesetzte Variable **aktiv**; nur `off`/`false`/`0` schalten ab, jeder andere Wert lässt es an; der Schalter steht **nicht** in der Datei-Flag-Allowlist, der Rückweg läuft nur über die Vercel-Env; der Merge verändert damit **unmittelbar** das Production-Verhalten (neue Reihenfolge + erste Schreibvorgänge in `main-cron-fairness`) — und das ist jetzt durch sieben eigene Prüfungen abgedeckt (§19e). **Tests:** Suite **201/201** (von 176), **Mutationsprobe 10 von 10 rot**, Offline-Suite **169/183** gegen Basislinie `main` **168/182**, Browser-Smoke **32/32**. Ein Einzellauf zeigte `werkzeug-lesefehler-test.js` rot (Parallellast-Flake: allein 43/0, unter dem Runner 3× grün, Wiederholung der vollen Suite wieder auf der Basislinie). **Keine Änderung an der Sperre, Cron-Zeiten, Budgets, Quellen, M8, Berlin, Brandenburg; kein Production-Zugriff, 0 KI-Aufrufe.** Kanonisch: [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §3a.1 |
| **Sprint OP-25, Abschlussdurchgang: CI grün, Garantie präzisiert, Überlappung bewiesen, Persistenz gehärtet** | 2026-07-30 | **Teilweise abgeschlossen (Repository-Umsetzung vollständig und CI-belegt; nur der reguläre Production-Nachweis fehlt, und der kann erst nach dem Merge entstehen).** **CI-Gate zweimal grün** — beide Pflicht-Checks auf `eeaa363` (Lauf `30499103799`) und nach der Härtung auf `2dc4154` (Lauf `30516881711`), jeweils Offline-Suite **183/183** und Browser-/Mobile-Smoke **32/32**. Drei Nachprüfungen, jede mit echter Nachbesserung: **(1) `k = 0` ist jetzt ein benannter Zustand.** `ceil(n/k)` gilt nur für Läufe mit `k ≥ 1`; ein Lauf, dessen Restlaufzeit nicht einmal für das erste Mandat reicht, trägt keine Fortschrittsgarantie und weist das aus (`kapazitaet`, `fortschrittsgarantie`, `ohneFortschritt`, `obergrenzeLaeufe: null` statt `Infinity`, `kapazitaet=0 obergrenzeLaeufe=keine-garantie` im Protokoll, wörtlicher `systemError`). Er schreibt **nichts**, die Warteschlange bleibt unverändert, der nächste Lauf holt genau dort nach — im selben Zeitfenster deterministisch getestet (§12b, 8 Prüfungen). **0 aktive Mandate** sind ausdrücklich **kein** `ohneFortschritt`. **(2) Überlappungsschutz bewiesen, ein falsches Dokument korrigiert.** Der Watchdog ruft `/api/cron/pipeline` außerplanmäßig (`workflow_dispatch`), der Pfad existiert real. Sperre `crawl-<mandat>`: erste Anweisung in `runSourceCrawl`, TTL 15 min > Funktionslimit 300 s, deckt den gesamten Mandatslauf, verweigert dem zweiten Lauf die Verarbeitung, bleibt bei Prozessabbruch bis zum Ablauf stehen, Freigabe token-gebunden. **`env-inventar.md` behauptete „Migration `20260719` NICHT auf Prod angewendet" und „Default fail-open" — beides falsch**; rein lesend gegengeprüft (0 Schreibzugriffe): beide Lock-Funktionen und `pipeline_locks.token` existieren, und die Zeilen des regulären 04:00-Crawls vom 2026-07-30 tragen einen **Token**, den ausschließlich die atomare RPC schreibt. `HELMUT_ATOMIC_LOCK` ist in Production **AN** → die Sperre ist atomar und fail-closed, **ein atomarer Mandatsclaim in der Fairnessschicht ist nicht erforderlich**, keine Queue, keine Parallelisierung, keine Architekturänderung. Inventar korrigiert (widersprach `datenmotor-restliste.md` FT2-2 und `CLAUDE.md` §5, die recht hatten). **Frischer OP-25-Beleg aus derselben Abfrage:** der 04:05:04-Lauf vom 2026-07-30 gab seine Sperre **nie** frei — Prozessende am Zeitlimit beim **zweiten** Mandat der alphabetischen Reihenfolge, gleicher Mandant und gleiches Muster wie am 29.07.; der Fehler trat bis zuletzt auf. **(3) Persistenz gehärtet — drei Schranken, jede getestet.** Lesefehler → **kein** Schreibvorgang (ein Patch trägt nur ein Mandat und hätte alle anderen Einträge gelöscht); **neuere** Schemaversion → kein Schreibvorgang (Rollout mit zwei Codeständen; das Feld `version` wird jetzt ausgewertet statt nur geschrieben); Versuchsvermerk wird nach dem Schreiben **gegengelesen** und begrenzt wiederholt (Default 3, danach ehrlich `ok:false, konflikt:true`) — gewinnt dabei ein neuerer fremder Versuch, ist nichts verloren und dieser Lauf lässt das Mandat aus. Der **Abschluss** wird bewusst nicht gegengelesen (er läuft über die Frist ab): ein Lesen, ein Schreiben, damit die Buchführung das Zeitbudget nicht auffrisst. Ein **korrupter** Eintrag (Nicht-Objekt, unbekannter Status, unlesbares Datum, negative Zähler, fremde Felder) blockiert niemanden: er wird verworfen, das Mandat gilt als „ohne Versuch", wird zuerst verarbeitet und heilt sich selbst; alle übrigen bleiben planbar. Ein gestörter Zustand erzeugt weiterhin einen eigenen `systemError` plus `fairnessGestoert: true` — `ok` bleibt bewusst `true`, weil die Verarbeitung stattfand und ein `false` einen erfolgreichen Crawl als Ausfall melden und den Watchdog fehlalarmieren würde. **Tests:** Suite **176/176** (von 118 im 1. Durchgang), **Mutationsprobe 9 von 9 rot** (neu: Wettlauf-Verlierer verarbeitet trotzdem · Lauf ohne Kapazität behauptet eine Garantie), Offline-Suite lokal **169/183** gegen Basislinie `main` **168/182** (dieselben 14 umgebungsbedingten Fehlschläge, kein Regress), Browser-Smoke **32/32**, Integrationsbeweis erneut gegen den echten Cron-Pfad. **Keine Migration, keine Cron-/Budget-/Flagänderung, keine Production-Schreibzugriffe, 0 KI-Aufrufe, 0,00 USD; M8, Berlin und Brandenburg unverändert deaktiviert, aktive Bundestagsquellen unverändert.** **Warum nicht „erfolgreich abgeschlossen":** der reguläre Production-Nachweis fehlt und kann erst nach dem Merge entstehen; die Roadmap trennt Implementierung und Nachweis, die Repository-Umsetzung selbst ist vollständig. Branch `claude/helmut-roadmap-25-cron-fairness-g8qjcx`, **PR #179**. **Nächster Schritt:** Merge-Freigabe, dann die vier regulären Läufe beobachten |
| **Sprint OP-25, 1. Durchgang: faire Mandantenreihenfolge in den Mehrmandanten-Crons** | 2026-07-29 | **Teilweise abgeschlossen (offline vollständig belegt, PR offen, Production-Nachweis offen; keine Migration, keine Production-Änderung).** **Der Befund wurde nicht übernommen, sondern gegen `main` nach PR #178 (`51732e2`) geprüft und bestätigt:** `tenant-context.listActiveTenantIds` endete auf `ids.sort()` (**alphabetisch**), `runCronForTenants` verarbeitete seriell gegen `Date.now() > deadline`, und **kein** persistenter Fortschritt je Mandat existierte — die Verdrängung traf strukturell immer dieselben Mandate. Belege: **2026-07-24** vier von sechs Mandaten über Tage nie gecrawlt (Incident-Doku), **2026-07-28/29** drei Läufe reproduzierbar am 280-s-Limit (`bounded=true`, zwei davon **vor** `HELMUT_MATCHING_AUDIT` → kein Flag-Effekt), **2026-07-29 16:00** nur **eines von sieben** Mandaten bis zur Matching-Stufe (Befund B5). Präzisierung zum Auftrag: „4 von 6" ist der Wert vom 24.07.; am 29.07. waren es 6 von 7. **Gewählte Lösung (kleinste robuste Variante):** neues reines Modul `lib/helmut/cron-fairness.js` — Reihenfolge nach dem **ältesten letzten Versuch**, Mandate ohne Versuch vorn, Losentscheid je 6-h-Fenster bei Gleichstand, Kennung nur als letzter Entscheid; Versuch **vor** der Verarbeitung persistiert, Erfolg/Fehler/Dauer getrennt danach; Restzeitprüfung mit Reserve **vor** jedem weiteren Mandat; ein Mandat wird je Lauf höchstens einmal begonnen; ein als `laufend` vermerktes Mandat wird von einem überlappenden Lauf nicht begonnen und nach 30 min kontrolliert erneut zugelassen. **Persistenz ohne Migration:** eine **eigene Zeile** im bestehenden `helmut_store` (`<storeId>-cron-fairness`, ~4 KB, genau ein Schreiber, monotone Verschmelzung) — damit kein Last-Write-Wins-Verlust wie in Befund W-2, **keine neue Tabelle, keine RLS-Änderung** (die `helmut_store`-Policy matcht nur `main-p-`), kein Freigabegate; DSGVO-Löschung und Teardown entfernen die Spur mit, Einträge ohne Versuch verfallen nach 90 Tagen rein zeitbasiert. **Garantie:** bei `n` planbaren Mandaten und mindestens `k` begonnenen je Lauf wird jedes Mandat spätestens im **ceil(n/k)**-ten regulären Lauf begonnen — deterministisch bewiesen für n=1…9 × k=1…4; die Grenzen der Garantie (k=0, hängender Versuch, gestörte Ablage, Flag aus) sind ausdrücklich benannt. **Beobachtbarkeit ohne neue Oberfläche:** `[cron/*/fairness]`-Zeile und `fairness` im Antwortkörper (geplant · begonnen · erfolgreich · fehlgeschlagen · zeitbudget · laeuftBereits · letzter Versuch/Erfolg/Wartezeit je Mandat · nächstes Mandat · Obergrenze); der Zeitbudget-`systemError` nennt jetzt die **Kennungen** statt nur eine Anzahl, ein unbrauchbarer Fairnesszustand erzeugt einen eigenen `systemError` statt falschem Grün. **Verworfen:** neue Tabelle + atomarer Claim (freigabepflichtig → Fix wäre wirkungslos geblieben) · Zustand im Auth-/Main-Blob (W-2, 1,24 MB je Schreibvorgang) · `crawlRuns` als Verlaufsquelle (nur abgeschlossene Läufe — ein hängendes Mandat bliebe vorn) · `matching_runs` (nur Matching-Stufe, flag-gebunden) · `pipeline_locks` als Historie missbrauchen · Queue · Parallelisierung · stateless Uhr-Rotation (keine Garantie). **Tests:** neue Suite `cron-fairness-test.js` **118/118** (im Abschlussdurchgang auf 176/176 erweitert) (alle 18 geforderten Fälle einzeln benannt + Grenzbeweis + Sicherheitsgrenzen), **Mutationsprobe 7 von 7 rot**, Offline-Suite **169/183** gegen die im selben Arbeitsbaum gemessene Basislinie `main` **168/182** — **dieselben 14 umgebungsbedingten Fehlschläge**, also +1 Suite, +1 grün, kein Regress; Browser-Smoke **32/32**; Integrationsbeweis gegen den echten Cron-Pfad (lokaler Speicher, `cron-morning-briefing`-Laufkennung im persistierten Zustand). Zwei Befunde **im** Sprint gefunden und behoben: ein Merge-Fallstrick (Abschluss mit leicht früherem Startzeitstempel fiel hinter den eigenen `laufend`-Vermerk zurück) und ein fehlender Env-Inventar-Eintrag (von der bestehenden Prüfung gefangen). **0 KI-Aufrufe, 0,00 USD, keine Migration, keine Änderung an Cron-Zeiten/Frequenzen, Laufzeit- oder Kostenbudgets, keine Flag-Scharfschaltung in Production, kein Production-Zugriff; M8 unverändert deaktiviert, Berlin/Brandenburg unverändert deaktiviert, aktive Bundestagsquellen unverändert** (alle zehn Grenzen als Test verankert, §20 der Suite). Rückweg: `HELMUT_CRON_FAIRNESS=off`. **Warum nicht erfolgreich abgeschlossen:** der Merge ist gleichzeitig die Aktivierung und eine Freigabeentscheidung, und der reguläre Production-Nachweis (vier Läufe, alle aktiven Mandate mindestens einmal begonnen) fehlt. **Restlücken:** R-1 `/api/cron/lage-briefing` hat eine eigene Schleife und ist noch nicht fair · R-3 der `laufend`-Vermerk ist kein atomarer Claim (harter Riegel bleibt der Lock `crawl-<mandat>`, P0-4) · OP-25 (a) Abdeckungsmessung und (c) Abdeckungsalarm über eine Serie von Läufen bleiben offen. Branch `claude/helmut-roadmap-25-cron-fairness-g8qjcx`. Kanonisch: [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md). **Nächster Schritt:** Merge-Freigabe, dann die vier regulären Läufe beobachten |
| **Sprint Roadmap-Punkt 24 (3. Durchgang, Abschluss): Vorgangsbezug messen statt annehmen** | 2026-07-29 | **Erfolgreich abgeschlossen (offline vollständig belegt, Struktursonde gegen die amtlichen Quellen nur lesend, als PR geliefert; Merge bleibt eine Freigabeentscheidung).** Die Ausgangsprämisse des Auftrags war überholt — die Berliner `<Vorgang>`-Struktur war im 2. Durchgang bereits belegt und implementiert. Echte Lücke war die **Kardinalität**: an **einem** Record (`V-351039`) belegt, war `vorgangsnummer` eine Setzung mit Beispielcharakter. Neues Diagnosewerkzeug `scripts/pardok-vorgangs-analyse.js` (bewusst **kein** `*-test.js`, damit die Offline-Suite netzfrei bleibt), beide Länder durch dieselbe Analyse. **Gemessen:** Berlin 41 853 `<Vorgang>` / 47 415 `<Dokument>` (20 939 delete-Stubs), Brandenburg WP8 vollständig 9 092 / 8 133 (4 341 Stubs). **Beziehung 1:n, nicht n:m** — 0 von 47 415 `DBID` unter mehreren `VNr`; 1…75 Dokumente je Vorgang in Berlin (häufigster Fall 2: 17 407), 1…33 in Brandenburg. Verbindung entsteht **ausschließlich aus der Verschachtelung**, ein Verweisfeld am Dokument existiert in keinem der Exporte. **Drei Länderunterschiede, die vorher Annahme waren:** Brandenburg ohne `<VID>`, ohne `<DBID>`, und 411/4 751 vollständige Vorgänge ohne verwertbare `VNr`. **Umsetzung minimal-additiv:** das Mapping existierte schon, ergänzt wurden nur zwei Fail-closed-Schranken in `vorgangsKennung()` (Widerspruch `VNr`≠`VID`; Platzhalter `-`, vom Export belegt als Leerwert an `<VIR>`) plus zwei Zähler (`kennungKonflikt`, `mitVorgangsbezug`). Auf echten Daten greifen beide Schranken **nie** — sie verhindern die stille Falschaussage bei Formatdrift. **Keine** neue Spalte, **keine** Migration, **keine** parallele Vorgangsstruktur, nie `cluster_id`. **Globale Dublettenerkennung unangetastet**, nur die Wechselwirkung gemessen: ohne externe Kennung führt die Adressregel zwei Dokumente eines Vorgangs mit derselben Protokoll-PDF zu **einem** zusammen (Test `M10c` als Ursachennachweis) — Regel 0 fängt das ab; **Vorbedingung für einen späteren Cutover:** jeder Weg muss die externe Kennung durchreichen, `shadow-ingest.js` tut es nicht. Tests: Suite **141/141** (neuer Teil M, 25 Nachweise), **Mutationsprobe 6 von 6 rot**, Offline-Suite **182/182 grün im CI** (Lauf `30494735859`, Commit `70e746d`, 42 s) mit **beiden Pflicht-Checks grün**; lokal 168/182 — die 14 Abweichungen sind umgebungsbedingt (kein DB-/Netzzugang) und **identisch zur im Worktree gegengeprüften Baseline auf `main`**, also keine durch diesen Sprint. Browser-Smoke **32/32**. Bei `H8f` wurde eine Schranke ergänzt: der Nachweis brach unter Mutation mit `TypeError` ab statt rot zu werden und ließ alle nachfolgenden Zeilen still ausfallen. **Ehrlich offen:** Berlin ist am 48-MiB-Lesecap abgeschnitten (die 2 Dokumente „ohne Vorgangsrahmen" sind der abgeschnittene letzte Record, kein Strukturbefund) · für Brandenburg ist n:m ohne Dokumentkennung nicht über eine Kennung prüfbar · die Ursache der 411 kennungslosen Vorgänge ist **nicht bestimmt** und wird nicht geraten · `NrInN` (3 Vorkommen) bleibt unerklärt. **0 KI-Aufrufe, 0,00 USD**, keine Aktivierung, keine Migration, keine Production-Berührung; `rp-be-plenum`/`rp-bb-plenum` bleiben `needs_review` + `manual` (im Test `L4` verankert). **Branch/PR:** `claude/roadmap-24-berlin-brandenburg-rft35w`, **PR #178 offen — NICHT gemergt** (Merge ist eine Freigabeentscheidung). Details: [`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md) **Teil C**. |
| **Sprint Roadmap-Punkt 24 (2. Durchgang): drei Restpunkte geschlossen — Vorgangsstruktur, Identitätskollision, Gate-Begrenzung** | 2026-07-29 | **Erfolgreich abgeschlossen (offline vollständig belegt und als PR geliefert; Merge bleibt eine Freigabeentscheidung und ist bewusst nicht erfolgt).** **Restpunkt 1 — Berliner Vorgangsbezug: GESCHLOSSEN, die frühere Aussage war falsch.** Der öffentliche Sondenlauf `30483735900` mit `PP_RECORD_TAG=Vorgang` (nur lesende XML-Abrufe, keine Secrets, keine DB, kein LLM, `permissions: contents: read`) belegt: **Berlin ist ebenfalls vorgangsstrukturiert** — 41 854 `<Vorgang>`, `<VNr>` und `<VID>` je **100 %**, `<VTyp>`/`<VTypL>` 46 %, ~**50 % `VFunktion=delete`-Stubs** (dieselbe Tombstone-Form wie Brandenburg). **Verknüpfung belegt:** `V-351039` trägt die Drucksache `D-351040` **und** das Plenarprotokoll `D-351042` — zwei Dokumente **unterschiedlicher Klasse** in einem Vorgang. **Belastbare Identität bleibt die `<DBID>`**; der Vorgang liefert nur den Bezug, es entsteht **kein** Vorgangsobjekt und weiterhin **nie** `cluster_id`. Neuer Adapter `parseBerlinVorgang`; `fallbackRecordTag` hält flache Exporte lesbar (bestehende Fixture unverändert 10 Dokumente). Zwei weitere Belege aus demselben Lauf: Dokumenttyp **`MdlAnfr`/„Mündliche Anfrage"** und **drei** eigenständige Dokumente (`D-351042`, `D-351603`, `D-351617`) mit **derselben** PDF-Adresse. Neue verbatim-Fixture `berlin-vorgang-gold.xml`; **ehrliche Grenze:** die Sonde kürzt Beispiel-Records bei 1 800 Zeichen, die Vollzähligkeit der Dokumente je Vorgang ist damit **nicht** belegt. **Restpunkt 2 — Identitätskollision: BEHOBEN statt nur dokumentiert.** Gegen den **echten** Schreibpfad gemessen (`scheduler.js:202` → `persistRawDocumentsDeduped` → `planDedupWrites` → `mergeIntoDocuments`): **zwei** Kollisionsmodi, nicht einer — Regel A (kanonische Adresse) führte `D-351042` und `D-351603` zusammen, Regel B (Titel-Fingerabdruck) zusätzlich zwei Drucksachen gleichen Titels. **Ergebnis vorher: 10 eigenständige Rohdokumente → 8 Dokumente, 2 Verluste.** Im Folgelauf gegen den Bestand wurde das Antwort-Dokument **gar nicht gespeichert** (`persists: 0`), sondern als Fundstelle an ein **fremdes** Dokument gehängt. **Kleinste additive Lösung ohne Migration:** neue **Regel 0** vor A/B/C — Identität aus **Herausgeber + externer Kennung + Dokumenttyp**; die kanonische Adresse ist nur noch **Rückfall**; der Adress-Rückfall gegen den Bestand ist für solche Dokumente abgeschaltet; die Identität reist im **bestehenden** Feld `content_fingerprint` (Präfix `ident:`) — **keine neue Spalte, kein Schemawechsel**. Nachher: **10 → 10**, Folgelauf speichert eigenständig, Zweitlauf ist **idempotent** (Fundstelle am eigenen Dokument). **Rückwärtskompatibel:** heute trägt **keine** Quelle eine externe Kennung, auch keine Bundesquelle — Regel 0 ist dort strukturell inert; im Test belegt, dass ein Bundesartikel über zwei Wege **ein** Dokument mit **zwei** Fundstellen bleibt. **Restpunkt 3 — Understanding-Gate: BEGRENZT.** Die Prüfung ergab, dass die Ergänzung **global** gewirkt hätte und dass die **aktive DIP-Bundestagsquelle** `document_type` aus der API setzt (`scheduler.js:161` → `dip.js:46`). Ihr Wertevokabular ist **offline nicht prüfbar**, eine Production-Abfrage ist nicht freigegeben; ein zusätzlicher Treffer hätte dort `zurückstellen` → `verstehen` verschoben und **je Dokument einen zusätzlichen KI-Aufruf** gekostet. Die drei Typen liegen jetzt in `LANDESPARLAMENT_DOC_TYPES` und greifen **ausschließlich** bei Landessignal (`politische_ebene = land`, Herkunft `BLN`/`BRA`, Abrufweg `be-`/`bb-`). Für den Bund ist die Änderung damit **strukturell** wirkungslos, nicht nur empirisch — belegt: keine der 42 realen Bundes-Stichprobenzeilen gilt als Landesdokument, alle 42 Gate-Entscheidungen unverändert. **Tests:** Suite `landesparser-klassen-test.js` **116/116** (vorher 94/94), **Mutationsprobe 14 von 14 rot** (neu: Regel 0 ausgeschaltet 5 · Adress-Rückfall reaktiviert 1 · Gate-Begrenzung entfernt 1 · Vorgangsbezug verworfen 2 · delete-Stubs nicht übersprungen 1), Offline-Suite **182/182** unter CI-Bedingungen, Browser-/Mobile-Smoke **32/32**, **CI-Gate grün — beide Pflicht-Checks** (Lauf `30484947476`, finaler Commit `4906122`). **Production vollständig unangetastet:** keine Aktivierung, keine Migration, kein Flag, kein Cron, kein Secret, kein Schreibzugriff, keine Production-Abfrage, **0 KI-Aufrufe / 0,00 USD**; `rp-be-plenum`/`rp-bb-plenum` bleiben `needs_review` + `manual` (im Test verankert). **Roadmap-Punkt 24 steht damit auf ✅.** **Verbleibende Risiken:** Vollzähligkeit der Dokumente je Vorgang unbelegt · Typtabellen aus Stichproben (500/800 Records), neue Werte fallen fail closed auf · kein Production-Beleg möglich, solange die Wege inaktiv sind · `shadow-ingest.js` (Diagnoseskript, nie im Produktivpfad) reicht die externe Kennung nicht durch. **Nächster Schritt:** Merge-Freigabe für PR #177. Details: [`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md) Teil B. |
| **Sprint Roadmap-Punkt 24: Landtags-Parser Berlin/Brandenburg — Dokumentklassen und Rohdokument-Vertrag** | 2026-07-29 | **Teilweise abgeschlossen (offline vollständig belegt und als PR geliefert; EINE Lücke bleibt offen, Merge ist eine Freigabeentscheidung und ist bewusst nicht erfolgt).** **Was vorher da war:** ein bewiesener, laufender Parser je Land (`pardok-parser.js`, getrennte Adapter, stabile Identität, Gold-Fixtures, 45 Offline-Tests), der isolierte Dispatch hinter `HELMUT_PARDOK_DISPATCH` (Invariante `items: []` in **jedem** Modus) und die vorbereiteten, gesperrten Wege `rp-be-plenum`/`rp-bb-plenum`. **Die echte Lücke:** der Parser lieferte nur die **rohen** Typbezeichnungen der Quelle (`DokArt`/`DokTyp`). Es gab **keine** normalisierte Dokumentklasse, **keine** Abbildung auf den kanonischen Rohdokument-Vertrag `raw_documents` und **keinen** Test, der die von Punkt 24 geforderte Trennung nachweist — die Abnahmefrage war schlicht nicht beantwortbar. **Was geändert wurde:** neues, reines Modul `pardok-dokumentklassen.js` mit acht kanonischen Klassen (`drucksache`·`anfrage`·`antwort`·`sitzung`·`tagesordnung`·`pressemitteilung`·`sonstiges`·`unbekannt`), **getrennten Typtabellen je Land**, Auswertungsreihenfolge `DokTyp` **vor** `DokArt` und **fail closed** auf `unbekannt` (nie geraten, nie stille Ersatzklasse); Abbildung auf die **bestehenden** `raw_documents`-Spalten plus das vorhandene `raw`-jsonb — **keine Migration, kein Schemawechsel, keine Parallelstruktur**. **`vorgang` ist bewusst KEINE Dokumentklasse:** der Vorgang bleibt ein Bezug (`vorgangsnummer`/`vorgangstyp`), `cluster_id` wird nie gesetzt, die Vorgangsbildung bleibt vollständig beim Resolver. Titellose Formate bekommen eine aus echten Feldern **abgeleitete und als solche gekennzeichnete** Bezeichnung (`raw.titel_abgeleitet`), keinen erfundenen Titel. **Berlin belegt:** Drucksache · Schriftliche Anfrage · Antwort · Sitzung (Plenar-/Ausschussprotokoll) · Sonstiges (GVBl). **Brandenburg belegt:** Drucksache · Kleine Anfrage · Sitzung + belegter Vorgangsbezug. **Fachlich begründete Ausnahmen** (maschinenlesbar, nicht simuliert): Tagesordnung/Termin und Pressemitteilung in **beiden** Ländern, Antwort in **Brandenburg**. **Drei Befunde im Bestand:** **24-1** — `OFFICIAL_DOC_TYPES` kannte **„Schriftliche Anfrage" nicht**; das wichtigste Instrument des Abgeordnetenhauses fiel aus der amtlichen Erkennung in den Stichwort-/Alterspfad (gemessen: `parken`, Grund `zu-alt`). Ergänzt zusammen mit den realen Typen „Behandlung im Plenum" und „Ausschussberatung", **rein additiv** — gegen die reale Production-Stichprobe geprüft: **42/42 Bundes-Gate-Entscheidungen unverändert**. **24-2** — `dedup-global.mergeIntoDocuments` identifiziert **zuerst über die kanonische URL**; für PARDOK ist das falsch, weil ein Plenarprotokoll-PDF viele Einträge trägt. Real belegt: `D-351042` (Plenarprotokoll) und `D-351603` (Antwort) zeigen auf **dieselbe** Adresse `p19-002-wp.pdf`. Die globale Dedup-Architektur wurde bewusst **nicht** angefasst; verbindlich ist stattdessen `content_hash` als PARDOK-Identität — als Vorbedingung für einen späteren Cutover dokumentiert und als Befundtest festgehalten. **24-3** — die Brandenburg-Typtabelle war unvollständig, und die Messung hat es gezeigt: gegen die real gemessene Dokumentart-Verteilung (Lauf `30481670298`, 29.07.2026, je 800 Records) führt **Brandenburg 11 Dokumentarten, Berlin nur 4**. Ohne die Ergänzung um neun belegte Arten wären **290 von 816 Dokumenten (35,5 %)** fälschlich `unbekannt` geblieben (allein `Ausschussprotokoll` 221). **Dabei korrigiert:** die zuerst notierte Ausnahme „Brandenburg liefert keine Tagesordnung" ist **falsch** — die Dokumentart `Einladung` (11 Treffer) trägt sie; die Ausnahme gilt nur für Berlin. Genau diesen Unterschied hätte eine gemeinsame Textmuster-Lösung eingeebnet. **Belegpflicht eingehalten:** Live-Abrufe sind aus der Sitzung **gesperrt** (Agent-Proxy `403` auf `CONNECT` für beide Hosts, im Proxy-Status protokolliert); belegt wurde stattdessen aus dem echten Sondenlauf **`30209973678` vom 26.07.2026** (je 500 Records, Feld-Inventar + verbatim Beispiel-Records). Daraus **drei echte Records** in die Gold-Fixtures übernommen (`D-351603`, `D-357045`, `V-369325` — letzterer im echten Export **gepaart mit seinem eigenen delete-Stub**, also der reale Fall „aktualisierter Eintrag"). Grenzfälle liegen in **getrennten Fixtures, die ausdrücklich als kein Quellenbeleg gekennzeichnet sind**. **Tests:** neue Suite `landesparser-klassen-test.js` **94/94** (Berlin und Brandenburg getrennt nachgewiesen, inkl. vollständigem Offline-Weg bis ins Understanding-Gate und Prüfung gegen die real gemessene Dokumentart-Verteilung), **Mutationsprobe: 9 von 9 Mutationen machen die Suite rot**, Offline-Suite **182/182** unter CI-Bedingungen (Ausgangsmessung auf unverändertem `main`: **181/181**), Browser-/Mobile-Smoke **32/32**, **CI-Gate grün — beide Pflicht-Checks** (Lauf `30482172757`, Offline-Suite 182/182, Browser-Smoke 32/32). **PR #177 inzwischen gemergt** (Stand 2026-07-29, `41da94b`). **Production vollständig unangetastet:** keine Aktivierung, keine Migration, kein Flag, kein Cron, kein Secret, kein Schreibzugriff, **0 KI-Aufrufe / 0,00 USD**; `rp-be-plenum`/`rp-bb-plenum` bleiben nachweislich `needs_review` + `manual` (im Test verankert). **Warum nicht vollständig abgeschlossen:** der Berliner Export enthält **41 854 `<Vorgang>`-Elemente** neben 47 417 `<Dokument>`. Die Sonde wählt automatisch das häufigste Element, weshalb die **Feldstruktur des Berliner `<Vorgang>` in keinem gespeicherten Beleg dokumentiert** ist. Berlin führt deshalb **keinen** Vorgangsbezug — erfunden wird nichts. Der Schließungsweg ist vorbereitet (`PP_RECORD_TAG=Vorgang` in `scripts/pardok-structure-probe.js`, ein Lauf des Workflows `pardok-parser.yml`), braucht aber Netzzugang. **Roadmap-Punkt 24 steht deshalb auf ⏳.** **Nächster Schritt:** Merge-Freigabe für den PR, danach ein Sondenlauf mit `PP_RECORD_TAG=Vorgang`, um den Berliner Vorgangsbezug zu belegen oder ihn begründet auszuschließen. Details: [`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md) Teil B. |
| **Sprint 23C-2A: Erklärungsabdeckung im Matching-Schreibpfad reparieren (Befund M-7)** | 2026-07-29 | **Erfolgreich abgeschlossen (offline bewiesen, PR #174 gemergt `bb539b1`, ausgerollt und am ersten regulären Production-Lauf nachgewiesen).** Der Schreibpfad löst die Merkmale eines Treffers jetzt gegen das **tatsächlich zugehörige** Wissensobjekt auf: gebündeltes Laden nach Kennung (`storage.listKnowledgeObjectsByIds`, eine Anfrage je 100 Kennungen, kein N+1, 20 statt 200 gelesene Zeilen) statt eines Fensters der 200 zuletzt geänderten Objekte. **Kandidaten, Ähnlichkeiten, Ränge, Reihenfolge und Ergebniskennungen byte-identisch.** Keine Versionsanhebung — der Fingerabdruck ändert sich von allein und nur bei den betroffenen Läufen (`ko_eingabe_hash` `null` → echt). Tests: neue Suite **60/60**, Offline **180/180** (Ausgang 179/179), Browser **32/32**, externe Mutationsprobe **11 Fehlschläge**. Rein lesende Restanalyse: **63 → 191 von 271** erwartete Abdeckung (23,2 % → 70,5 %), sichtbares Lagefenster **46 → 71 von 84**. Neue Befunde **M-8** (RPC ohne Schwellenwert: 40 Zeilen mit Ähnlichkeit ≤ 0 auf den Rängen 1–20) und **M-9** (Platzhalterprofil kann nie belegen). Empfehlung: **kein Erklärbarkeits-Gate**. **Production-Nachweis 16:04 UTC:** Lauf `vollstaendig` (20/20/20, 1 074 ms), Kernfingerabdruck `8a3975a5…` vorher = nachher, Belege **3 → 20 von 20**, Lagefenster **3 → 12 von 12**, Gesamtbestand **63 → 80 von 271**, 290 → 290 Zeilen (nichts gelöscht), Embeddings unverändert, **0 KI-Aufrufe / 0,00 USD**, 0 laufende/fehlgeschlagene Läufe, Sperre freigegeben, keine Fehlergruppe aus dem Matching-Pfad. **Offen bleibt allein Roadmap-Punkt 23**, bis die übrigen sechs Mandanten gelaufen sind (Befunde B5/B6). |
| **Sprint 23C: „Warum ist das relevant?“ produktseitig umsetzen** | 2026-07-29 | **Teilweise abgeschlossen (implementiert, offline und im Browser bewiesen, PR #171 offen — nicht gemergt).** **Auf `main` = `a53e37b` rebasiert.** Verbleibende Funktion: **„Warum für dich relevant?“** in der Vorgangs-Detailansicht — ein deterministischer Hauptsatz plus zwei bis vier aufklappbare Belege (`<details>`, nativ, kein zusätzliches JavaScript), ausschließlich aus bereits persistierten Feldern (`begruendung`, `signale`, ersatzweise `matched_features`). **Phase-1-Audit (read-only):** einziger produktiver Leser von `matching_results` ist `storage.listMatchingResults`, einziger Konsument `lage.js:325`, Auslieferung im Lage-Payload von `/api/app/start`; **Radar liest die Ergebnisse nicht** (der Entwurf in §11 der Matching-Doku war insoweit unzutreffend); vor diesem Sprint erreichte **kein einziges Feld** der Ergebniszeile den Browser — `lage.js` nutzte nur `knowledge_object_id` und verwarf `signale`/`begruendung`. **Der in diesem Sprint gefundene Lesepfadfehler wurde getrennt als Hotfix PR #172 ausgeliefert** und ist beim Rebase aus diesem PR **entfernt** worden; `storage.js` ist byte-identisch mit `main`. **Korrektur zur ersten Fassung:** dort stand „latent, kein Nutzer betroffen“ — das galt nur vor der Flag-Aktivierung; mit `HELMUT_MATCHING_AUDIT=on` und 19 abgelösten Zeilen war der Befund **aktiv**. **Geliefert:** neues Modul `matching-erklaerung.js` (rein lesend, 0 KI/DB/Netz/Zufall, Weißliste auf vier Signalarten, Rückgabe nur `{satz, belege}` oder `null`) · `lage.js` führt die Erklärung mit und reicht sie als `relevanz` an der Vorgangskarte durch · `client.js` rendert den Abschnitt vor „Warum wichtig?“ · `styles.css` mit bestehenden Tokens. **Bewusste Abweichung vom Entwurf (§11):** Anzeige **nur** in der Detailansicht, **nicht** auf der Lage-Karte — die Karte trägt bereits drei Zeilen mit gemessenen Zeichenbudgets und Line-Clamps, eine vierte hätte verdrängt oder abgeschnitten; die zweistufige Form passt nicht in eine geclampte Karussellkarte; die Karte ist der Einstieg, ein Tippen öffnet das Sheet. Kleinste Lösung: ein Anzeigeort, keine neue Karte, kein Navigationspunkt, keine neue Designabstraktion. **Ehrlichkeit:** ohne Beleg **kein Abschnitt** — der im Auftrag vorgeschlagene Fallbacksatz („Helmut hat einen Bezug zu deinem Profil erkannt…“) wurde **bewusst nicht** übernommen, weil eine Legacy-Zeile ohne `matched_features` gerade **nicht** belegt, dass ein Bezug erkannt wurde; das wäre eine erfundene Begründung. **Abdeckung am 2026-07-29 rein lesend gemessen (271 aktuelle Zeilen: 251 Altzeilen, 20 Auditzeilen):** verwertbare `begruendung` 3 (1,1 %) · verwertbare `signale` 3 (1,1 %) · verwertbare `matched_features` 63 (23,2 %) · **kein Beleg 208 (76,8 %)** · **UI zeigt Erklärung bei 63 (23,2 %)**. Der scheinbare Widerspruch „`signale` bei 20/20 Auditzeilen“ löst sich auf: strukturell ja, **verwertbar nur bei 3** — bei 17 der 20 enthält `signale` ausschließlich `legacy_vektor` (den Rohwert, der bewusst nie angezeigt wird). `signale` wird aus `matched_features` abgeleitet und kann nie mehr Belege enthalten als diese. **Der `matched_features`-Fallback greift vollständig:** 60 von 60 Zeilen ohne `signale`, aber mit Merkmalen werden erklärt (100 %); nur zwei Rohformen im Bestand (leeres Array 208, `Array<type+value>` 63). **Ursache der Lücke ist Befund M-7, belegt:** read-only Nachrechnung der 208 leeren Zeilen gegen die gespeicherten KOs (141) und Profile (7) ergibt **128 Zeilen, die Merkmale hätten** (Verlust durch das 200er-Ladefenster in `matching.js:461` — die Vektorsuche läuft über alle 1 507 KOs, die Merkmalsauflösung nur über 200; ein Treffer außerhalb wird gegen `{}` gematcht) und **80 echt ohne Überschneidung**. **Ein rein darstellender Fix kann die Abdeckung nicht verbessern** (geprüft): aus `signale` ist nichts zu holen, der Fallback greift schon zu 100 %, und eine Neuberechnung zur Anzeigezeit nutzte das *heutige* Profil statt des Laufzeitstands (Befund M-3) — der gezeigte Grund wäre dann nicht mehr nachweislich der Grund des Rankings und verdeckte M-7 zusätzlich (falsches Grün). **23,2 % ist die ehrliche Obergrenze ohne M-7; mit behobenem M-7 wären 191/271 = 70,5 % erreichbar, ohne eine Zeile Anzeigecode zu ändern.** **Korrektur:** die früher hier geführten 78,4 % stammten aus Sprint 23A (225/287) und waren nicht der heutige Stand; gemessen sind es 76,8 % (208/271). Details: [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §33. **Strukturell nichts Technisches sichtbar** (Weißliste statt Verbotsliste): keine Hashes, Kennungen, Versionen, Rohvektoren, `similarity`/`rank`/ `legacy_vektor` — **keine einzige Ziffer**. **Tests:** neue Suite **64/64** (Modul A1–A24, Vorbedingung im Lesepfad B1–B5, Serverpfad C1–C13, echte Client-Renderer im `vm` D1–D16, Nichtregression E1–E6) · **Offline-Suite 179/179** in bereinigter Umgebung · **Browser-/Mobile-Smoke 32/32** · Chromium-Sichtprüfung 390×844 (kein horizontaler Überlauf, Belege zugeklappt, Trefferfläche 32 px, vier Belege ohne Textüberlauf) · **CI-Gate grün, beide Pflicht-Checks**. **Nicht enthalten:** keine Änderung am Lesepfad, keine Migration, kein Flag, keine Cron-/Env-Änderung, kein Production-Zugriff, keine Matchingänderung, keine Embeddings, kein LLM-Aufruf. Kanonisch: [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) Teil C (§26–§32). **Merge-Bedingung:** die ursprüngliche Sperre ist mit PR #173 (23B-1 abgeschlossen) und PR #172 (Hotfix in `main`) **erfüllt** — es bestehen keine fachlichen Vorbedingungen mehr, der Merge ist nur noch eine Freigabeentscheidung des Betreibers |
| **Hotfix: abgelöste Matching-Ergebnisse aus aktiven Nutzerpfaden ausschließen** | 2026-07-29 | **Teilweise abgeschlossen (Fix fertig, offline bewiesen und als PR geliefert; Merge/Deployment sind Freigabeentscheidungen und sind bewusst nicht erfolgt).** **Anlass:** `HELMUT_MATCHING_AUDIT` ist in Production **aktiv**; erster Lauf **290 Zeilen — 271 `aktuell=true`, 19 `aktuell=false`** (die 19 bei `annika-klose`). Der in Sprint 23C gefundene Lesepfadfehler ist damit **kein latenter Befund, sondern ein aktiver Pilotblocker**. **Fehler:** `storage.listMatchingResults` filterte nicht auf `aktuell`; einziger produktiver Konsument ist `lage.js:325` („Aktuelle Lage", mittelbar das Briefing-Narrativ) → abgelöste Ergebnisse konnten als aktuelle Lage erscheinen **und** aktuelle Vorgänge aus dem `limit` verdrängen. **Fix (eine Datei, 2 Stellen):** `includeAbgeloest = false` als Default-Parameter, im Endpoint zusätzlich `&aktuell=is.true`. Filter greift **serverseitig vor `limit`** (PostgREST: where → order → limit), **Sortierung unverändert** `created_at.desc`, **keine Zeile gelöscht**, Historienzugang über `includeAbgeloest: true` erhalten, Mandantenfilter unverändert Pflicht. **Nicht angefasst:** Matching-Berechnung, Scores, Ränge, `matched_features`, `matching_runs`, Audit-Publikation, Cron, Understanding, Briefing-Erzeugung, 23C-UI-Erklärung, Schema, Migrationen, Env. **Tests:** neue Suite `matching-aktualitaet-test.js` **29/29** (Standardpfad · Limit-Verdrängung inkl. Gegenprobe · Historienzugang · Tenant-Isolation · Sortierung · Lage-Nutzerpfad · Legacy `run_id=NULL` · keine Schreiboperation · kein KI-Aufruf); **Mutationsprobe gegen den unkorrigierten Stand: 7 Fehlschläge** (der Test greift wirklich). Offline-Suite **175/178** gegen **174/177** auf unverändertem `main` (`5c254c4`) — **identische 3 Vorbefunde** (`privacy-vollstaendigkeit`, `provision-tenant`, `tenant-neutrality`, Befund E-2), also 0 Regressionen. Browser-/Mobile-Smoke **32/32**, Secret-Scan 0 Treffer. **Keine Production-Daten geändert, kein Production-Lauf ausgelöst, kein Flag/Cron/Secret angefasst, 0 KI-Kosten** — der Idempotenznachweis von Sprint 23B bleibt unberührt. **Roadmap-Punkt 23 bleibt offen.** **Auswirkung auf PR #171:** der dort enthaltene Aktualitätsfix ist jetzt doppelt vorhanden und wird nach dem Merge dieses Hotfixes aus #171 entfernt bzw. auf ihn aufgebaut; **#171 bleibt ungemergt, bis Sprint 23B abgeschlossen ist**. **Nächster Schritt:** Merge-Freigabe außerhalb eines aktiven Cron-/Matching-/Understanding-Fensters |
| **Sprint 23B-1: algorithmusunabhängige Matching-Auditpersistenz** | 2026-07-28/29 | **Erfolgreich abgeschlossen — alle drei Freigabegates einzeln erteilt und ausgeführt (Merge → Migration → Aktivierung), Production-Abnahme inklusive Idempotenznachweis erbracht.** Start Gate im zweiten Anlauf vollständig passiert (erster Anlauf gestoppt, weil Sprint 23A noch nicht gemergt war; nach **PR #168** erneut geprüft). **Geliefert:** `matching_runs` als append-only Auditprotokoll mit DB-Trigger gegen jede fachliche Änderung eines abgeschlossenen Laufs · 14 additive, NULL-fähige Spalten auf `matching_results` **ohne Backfill** · echter Unique-Index `(user_id, knowledge_object_id)` · **Teilindex auf (user_id, eingabe_fingerabdruck) where status='vollstaendig'** = datenbankseitig erzwungene Idempotenz · getrennte `engine_version` / `rezept_version` / `vektor_version` · stabiler Eingabefingerabdruck (unabhängig von Lauf-ID, Zeit, Auslöser und Eingabereihenfolge) · Ablösung (`aktuell=false`) **statt Löschung** · Sperre `matching-<mandant>` über die bestehende `pipeline_locks`-Infrastruktur, **erstmals auch im Lage-Pfad** · deterministische Kurzbegründung **ohne KI** (max. 2 Gründe, ohne Beleg `null`). **Drei Laufzustände statt fünf**, begründet: `partial` ist durch `laufend` abgedeckt (die Projektion wird in EINEM Bulk-Upsert geschrieben), `cancelled` erzeugt bewusst gar keine Zeile. **Nach Betreibereinwand nachgeschärft:** die ursprüngliche Schreibreihenfolge war nicht atomar; jetzt EIN Aufruf = EINE Transaktion (`helmut_publish_matching_run`, SECURITY INVOKER) plus Trigger, der `matching_results.run_id` auf vollständige Läufe beschränkt. **Legacy unverändert:** 253 Vergleiche gegen unverändertes `origin/main` (Merkmalsvektoren, Kosinuswerte, Ranking, `matched_features`, geschriebene Zeilen, Rückgabewert) → **0 Abweichungen**. **Tests:** neue Suite **178/178** (inkl. A1–A8 Atomizität; Mutationstest belegt ihre Wirksamkeit mit 10 Fehlschlägen gegen das alte Design), Offline-Suite **177/177**, Gegenbeweis auf `main` **176/176**, Browser-Smoke nicht nötig (keine UI-Änderung). **Gemessen:** Laufzeile 8 070 B roh / ~2 539 B komprimiert, +713 B je Ergebniszeile, ~28 MB/Jahr bei 10 Profilen, ~278 MB/Jahr bei 100 (dann Retention); **0,00 USD zusätzliche KI-Kosten**; identischer Lauf schreibt **0 statt 20** Ergebniszeilen. **Neuer Befund M-7** (200er-Ladefenster erklärt die 78,4 % leeren `matched_features`) — bewusst **nicht** behoben, weil es das fachliche Ergebnis veränderte, und bleibt außerhalb dieses Sprints. **Nachtrag 2026-07-28: PR #169 gemergt (`b1d450c`); Migration `20260728_matching_audit` um 20:20:57 UTC nach bestätigtem Ruhefenster in Production angewendet und vollständig verifiziert** — 287→287 Zeilen byte-identisch (Fingerabdruck `be4670c61235c908559853a6f6fc6c8c` unverändert), `matching_results` jetzt 23 Spalten (14 additiv, kein Backfill), `matching_runs` existiert mit 0 Zeilen, 0 Zeilen mit `run_id` auf unvollständigem Lauf, RLS/Grants/Funktionen (alle SECURITY INVOKER)/Trigger/Indizes korrekt, `anon` ohne Zugriff, `authenticated` nur SELECT, `helmut_publish_matching_run` nur für `postgres`/`service_role`, 0 Production-Fehler, Rollback nicht nötig. **Nachtrag 2026-07-29 — Gate 3 erteilt und ausgeführt:** Doku-PR **#170 gemergt** (`5c254c4`, Lauf `30397010300` grün); `HELMUT_MATCHING_AUDIT` am 28.07. ~20:55 UTC in Vercel **nur für Production** auf **`on`** gesetzt, wirksam mit Redeploy `dpl_ChLoTuKztU1B835PfckELKp8doMZ` (`READY` 20:56:48 UTC, keine Build-Fehler). **Erster Production-Auditlauf 29.07. 04:05:07–04:05:08 UTC** (1 041 ms), ausgelöst vom regulären `/api/cron/crawl` — **kein manueller Lauf**: `mrun-annika-klose-20260729040507-32c822e0`, Mandant `annika-klose`, Status `vollstaendig`, 20 Kandidaten/berechnet/veröffentlicht, 19 abgelöst, `matching_results` **287 → 290** (17 wiederverwendet, 3 neu, 19 abgelöst), **nichts gelöscht**, 251 Fremdzeilen unberührt, Ränge lückenlos 1–20, Altschema-Kennungen erhalten, Lauf-`ergebnis` 20/20 deckungsgleich mit der Projektion. **Idempotenz in Production bewiesen 29.07. 08:07:20 UTC:** identischer Eingabefingerabdruck (`d396c545…c8ac`) → **keine neue Laufzeile**, `wiederholungen` **0 → 1**, `letzter_lauf_at` gesetzt, `matching_results` **vollständig unverändert** (`updated_at` bleibt 04:05:08) — und das **trotz 179 neuer Wissensobjekte** zwischen den Läufen. **0 zusätzliche KI-Aufrufe, 0,00 USD**, 0 Production-Fehler zu `matching_runs`/`matching_results`/`helmut_publish_matching_run`, `knowledge_object_embeddings` unverändert (772), Rollback nicht nötig, Flag bleibt aktiv. **Zwei neue Befunde aus dem Beweislauf** (nicht Sprintumfang): der Crawl läuft reproduzierbar in sein 280-s-Zeitlimit und erreicht je Lauf nur einen Teil der Mandanten (**auch schon vor der Aktivierung**, kein Flag-Effekt) → **OP-25**; und es gibt **keinen produktiv verwendeten Einstieg** für isoliertes Matching eines einzelnen Mandanten → **OP-26** (deshalb wurde der Idempotenznachweis an einem regulären Lauf beobachtet statt manuell erzwungen). **Roadmap-Punkt 23 bleibt offen**, weil **Sprint 23C** (sichtbare Nutzererklärung) fehlt; Briefing-Historisierung bleibt Sprint 23B-2; M-7 bleibt außerhalb. Kanonisch: [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) Teil B §21.6 und §25. **Nächster Schritt:** Sprint 23B-2 oder 23C |
| **Sprint 23A: Matching-Bestand und Auditgrundlage verifizieren** | 2026-07-28 | **Erfolgreich abgeschlossen (Bestandsaufnahme; Production ausschließlich lesend, 21 reine `SELECT`-Abfragen, kein Byte Code geändert — `git status` leer).** Alle 20 Abnahmekriterien erfüllt. **Ist-Zustand belegt:** Einstieg `matching.js:runMatchingShadow`, zwei Aufrufstellen in `scheduler.js` → 4 Läufe je Mandant/Tag (04/10/16/20 UTC, durch das Stundenhistogramm bestätigt); einziger Konsument `lage.js:325`, und nur solange `HELMUT_SCORING_MODE` aus ist (OP-22); **Radar liest die Ergebnisse nicht**. Schema ohne Drift (9 Spalten, PK `id`, 2 FKs mit CASCADE), **kein eindeutiger Index auf (user_id, knowledge_object_id)** — Eindeutigkeit ist Codekonvention, hält 287/287. Schreibpfad = Bulk-Upsert auf `id`: **vollständiges Überschreiben, kein DELETE, keine Retention, keine Lauf-ID, kein `updated_at`**, `created_at` friert beim ERSTEN Auftreten ein (empirisch bewiesen: `annika-klose` 16:04:32-Lauf schrieb 20 Zeilen und hinterließ 0 Spuren). **Zahlen:** 10 Mandanten · 9 Mandatsprofile (6 aktiv) · 1 507 KOs (776 verstanden) · **287** Ergebnisse auf 7 Mandanten/181 Vorgängen · 71 Briefings · 976 Decisions · 685 B/Zeile · DB 64 MB. 0 Duplikate/Waisen/fehlende Scores — aber **64 Zeilen mit Rang 20** (vermischte Generationen) und **225 von 287 (78,4 %) ohne jedes `matched_feature`**; `filters` 287/287 leer, Ähnlichkeiten bis **−0,0735** (kein Schwellenwert im Produktionspfad). **Versionierung existiert nicht** → alte Ergebnisse **nicht reproduzierbar**. **Briefings** speichern nur `koSetHash` (Einwegfunktion), **keine Vorgangskennungen, keinen Ergebnisverweis**; Upsert auf `bf-<mandant>-lage-<tag>` → ein neuer Lauf kann ein Tagesbriefing **rückwirkend überschreiben**. **RLS aktiv, aber `service_role` umgeht sie vollständig** — durchsetzend ist allein die App-Seite (für beide Zugriffsfunktionen geprüft, kein ungefilterter Pfad). Befund **M-3** (nach Profil-/Vorgangsänderung bleiben Ergebnisse stillschweigend falsch zugeordnet), Befund **M-6** (`TRUNCATE`-Recht für `anon`/`authenticated` auf allen älteren V3-Tabellen; RLS greift bei `TRUNCATE` nicht, über das API aber nicht erreichbar). **Semantik-Abgrenzung bestätigt:** semantische Embeddings haben **null** Einfluss, `knowledge_object_embeddings` braucht für Punkt 23 **keine** Änderung. **Entscheidung 23B: Variante B+** (neue Lauftabelle `matching_runs` mit kompakter Rangliste, additive Spalten + echter Unique-Index, Briefing-Anbindung ohne Migration im jsonb, Archivtabelle `briefing_versionen`, Idempotenz per Eingabefingerabdruck → identischer Zweitlauf **0 Zeilen/1 UPDATE** statt 20). Verworfen: A (PK erzwingt eine Zeile je Paar), C (≈2,2 Mio. Zeilen/Jahr bei 100 Profilen), D (kein Ergebnisbezug). Kostenschätzung ~20 MB/Jahr bei 10 Profilen, ~200 MB/Jahr bei 100 (dann Retention), **0,00 USD KI**. 23C-Erklärung definiert (deterministisch, ohne Beleg **kein** Satz — heute nur 20 von 287 Zeilen aussagekräftig belegbar). Tests: **Offline-Suite 176/176** (bereinigte Umgebung, Zweitlauf; Erstlauf 175/176 = Parallellast-Flake, Suite einzeln 43/0; mit Sitzungs-Secrets 162/176 = bekanntes Umgebungsmuster). **Kein Production-Write, keine Migration, kein Flag/Cron/Secret, kein KI-Aufruf, kein Merge.** Kanonisch: [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md). Nächster Schritt: **Sprint 23B-1** (Migration freigabepflichtig) |
| **Sprint 22C1: Semantische Embeddings — Production-Shadow-Struktur + kontrollierter Backfill** | 2026-07-28 | **Erfolgreich abgeschlossen — beide Gates passiert, alle 20 Production-Abnahmekriterien erfüllt.** PR **#165 gemergt** (`ce5e3b8`, beide Pflicht-Checks grün, Deployment `READY`); danach auf ausdrückliche Freigabe der Production-Ablauf 14:56–14:59 UTC: **Migration angewendet und verifiziert** (RLS aktiv, 0 Policies, Grants nur `postgres`/`service_role`, Teilindex für die Ein-Aktiv-Garantie, Renew-RPC ohne Fremd-Grants), **Canary 56/56 fehlerfrei**, Restbestand in zwei Etappen (300 + 416) mit belegter **Wiederaufnahme**, Abdeckungsprüfung **BESTANDEN: 772 von 772 berechtigten Objekten** mit aktuellem Embedding (alle Negativlisten 0), **Idempotenz-Zweitlauf 0 API-Aufrufe / 0 Writes**. **17 API-Aufrufe, 110 992 Tokens (Schätzung) / 133 277 (providergemeldet), ≈ 0,0022 USD, 0 Fehler, 0 Wiederholungen.** Ein Modell/Rezept/Dimension über alle Zeilen, 0 Dimensions-/Wert-/Hashfehler. **Unverändert:** `knowledge_objects`-Fingerabdruck byte-identisch, Legacy-Vektoren 773, `matching_results` 287, Briefings 71, `llm_usage` heute 0, Crawl-Telemetrie stabil, 0 aktive Sperren. Kein Rollback nötig, **keine semantische Produktfunktion aktiviert**, keine Duplikatzusammenführung. Werkzeugbefund W-3 (abgeschnittene `--json`-Ausgabe auf Pipe) im Lauf behoben. Belege: [`embedding-architektur.md`](embedding-architektur.md) §14.6. Zuvor geliefert: finalisierte Shadow-Migration `20260728_embedding_shadow.sql` mit vollständigem Rollback (alle 16 Datenvertragsfelder, genau eine aktive Repräsentation je Objekt DB-erzwungen, RLS ohne Policies + Revokes, Renew-Lock-RPC, kein ANN-Index), Backfill `lib/helmut/embedding-backfill.js` + CLI `scripts/embedding-backfill.js` (Dry-Run-Default, `--vermessen`/`--pruefen` read-only, echter Lauf nur `--echt --freigabe erteilt` + Schreibgate, harte fail-closed Deckel ≤ 1 000 Objekte/≤ 200 000 Tokens/≤ 0,05 USD/Batch ≤ 50/Parallelität 1, eigenes Lock `semantic_embedding_backfill` mit TTL+Erneuerung, idempotent + wiederaufnehmbar, maschinenlesbares Protokoll), Budgettrennung ohne zweites Budgetsystem (Tokenwahrheit je Zeile + Laufprotokoll, bestehende Budgets unverändert). Production read-only nachgemessen: **772 berechtigte** Objekte (JS-exakt = SQL-Näherung), Dry-Run 16 Batches/110 992 Tokens ≈ **0,0022 USD**, Canary-Dry-Run 56 Objekte/8 621 Tokens. Tests: `embedding-backfill-test.js` **40/40** (neu), Bestand 31/31 + 43/43, **Offline-Suite 176/176** (CI-Umgebung; `main`-Gegenlauf 175/175). Runbook: `embedding-architektur.md` §14.5. Roadmap-Punkt 22 bleibt ⏳ bis zum bewiesenen Production-Backfill |
| **Sprint 22A: Embedding-Architektur verstehen, bereinigen, Zielmodell festlegen** | 2026-07-28 | **Erfolgreich abgeschlossen (Analyse + additive Verträge; bewusst ohne Backfill und ohne Production-Änderung).** Bewiesen: `knowledge_objects.embedding` ist ein **deterministischer 256-dim Merkmalsvektor** (Token-Hash, `matching.js`), kein semantisches Embedding — 3 Production-Vektoren exakt lokal reproduziert. Production read-only vermessen: 1 501 KOs, 772/772 verstandene mit Vektor, 0 Dimensionsfehler/Nullvektoren/ungültige Werte; **599 ohne Fachgebiet und 78 mit Ebene `unknown` sind KEINE Blocker** (nicht Teil des kanonischen Eingangs `ko-kanon-1`); 729 unverstandene ausgeschlossen; Profilvektoren 7/10; pgvector-Shadow-Matching läuft aktiv (287 `matching_results`, Befund E-1: Env-Inventar ohne Prod-Vermerk). Geliefert: `lib/helmut/embedding-contract.js` (Eingang/Hash/Berechtigung/Validierung/Veraltet-Erkennung/idempotente Planung), `embedding-contract-test.js` **43/43**, Shadow-Migrations-**Entwurf** mit Rollback (`supabase/migrations/entwuerfe/`, nicht freigegeben), kanonische Doku [`embedding-architektur.md`](embedding-architektur.md) inkl. parametrisiertem Kostenmodell (~0,19 M Tokens Altbestand ≈ 0,19 × P USD bei P = Preis/1 M Tokens), Backfill-Sicherheitsmodell und Mandantenneutralität (kein Mandanten-Hardcode, testgesichert). Offline-Suite: **171/174** mit bereinigter Env (3 Vorbefunde, auch auf unverändertem `main` rot: `privacy-vollstaendigkeit`, `provision-tenant`, `tenant-neutrality` — Befund E-2, fachfremd, nicht angefasst); mit Sitzungs-Secrets 160/174 (Netz-Guard, bekanntes Muster). Roadmap Punkt 22 → ⏳. Nächster Schritt: **Sprint 22B** (Freigaben: Shadow-Migration, Modell/Provider, Testlauf-Kosten) |
| **Sprint 21: Altbestand kontrolliert nachklassifizieren (OP-24)** | 2026-07-28 | **Teilweise abgeschlossen — Production-Nachklassifikation erfolgreich, Dokumentationsmerge ausstehend.** **Hauptlauf (Umfang B) am 2026-07-28, 09:03:49–09:07:09 UTC: 728 von 728 Objekten geschrieben, 30 Batches, 0 Fehler, 0 Kollisionen, Readback 728/728 exakt wie geplant, Fingerabdruck der 521 übrigen identisch, Idempotenz 0 Restschreibvorgänge, 0 KI-Aufrufe/0,00 USD — Protokoll [`nachklassifikation-altbestand.md`](nachklassifikation-altbestand.md) §14. Nach dem Merge des Doku-PR **#158** darf der Sprint als erfolgreich abgeschlossen markiert werden.** **Stufe-1-Protokoll: [`nachklassifikation-altbestand.md`](nachklassifikation-altbestand.md) §13** — am 2026-07-28, 08:25:13–08:25:21 UTC wurden **12 namentlich ausgewählte** Wissensobjekte (2 je Klasse, alle **6** sicheren Klassen) in Production korrigiert: 12 geplant, **12 geschrieben, 0 Fehler, 0 Kollisionen**, Readback **0 Abweichungen**, **0** belegte Geografien verloren, **0** andere Objekte verändert (Fingerabdruck der 1 237 übrigen identisch), **0 KI-Aufrufe / 0,00 USD**, Idempotenz bestätigt. **Der Rest des Sprints (Vorbereitung) blieb ohne Production-Mutation.** Gebaut ist ein kontrollierter, wiederholbarer Nachlauf über den Wissensobjektbestand: neues reines Planungsmodul `quellenarchitektur/nachklassifikation.js` (es schreibt nichts, es baut einen **Plan**) plus Werkzeug `scripts/nachklassifikation.js`. **Die zentrale Sicherheitsregel:** ein Altwert wird nur entfernt, wenn er **keine** echte Herkunft trägt (nur `bestand-alt`, Rang 2) **und** die erneute deterministische Nachweissuche für genau diese Geografie **keinen** Beleg findet. Alles andere bleibt stehen und wird zur manuellen Prüfung gemeldet — fail closed. **Kosten: 0 KI-Aufrufe, 0,00 USD** — die Nachweissuche benutzt `classification.sammleGeografieKandidaten`, also **denselben Code wie der Schreibpfad**; es entsteht keine zweite, parallele Klassifikationslogik. **Read-only Production-Vorschau (2026-07-28):** **1 230** Wissensobjekte gelesen, davon **490 unverstandene (`pending`/`failed`) hart ausgeschlossen**, **740** verstandene geplant. Sicher automatisch korrigierbar: **570 Geografien entfernen** — **471** Deutschland aus der Bundesebene, **30** Deutschland als verbotener Ersatzwert bei Ebene `land`, **37** nicht-kanonische „Europäische Union", **32** bloße Ortsnennungen (die nach `mentioned_geographies` wandern) — und **2** Belege stärken. **0** manuelle Prüffälle, **0** Ebenen- und **0** Entitätsänderungen. **Die Zahlen reproduzieren die Sprint-19/20-Messung exakt:** 78 unbestimmte Ebenen (Sprint 19: **78**), 30 Ersatzwerte (Sprint 20: **30** von 60), 37 EU-Einträge (Sprint 20: **37**), und 32 + 2 heute belegte = **34** aus Ortsnennungen (Sprint 20: **34**). **Zwei Befunde aus der Vorschau haben den Umfang verändert.** (1) Der erste Lauf las **1 000** statt 1 230 Objekte: ein einzelner PostgREST-Aufruf kappt still bei 1 000 Zeilen — exakt der Fehlermodus W-1, der im Repo schon einmal die Hälfte eines Bestands unsichtbar gemacht hat. Neu deshalb `storage.listKnowledgeObjectsSeitenweise` (seitenweise, `order` auf der **stabilen** Spalte `id`, wirft bei Lesefehlern statt Leerstand zu melden), und der Bericht weist aus, wenn die Leseobergrenze erreicht wurde. (2) **Alle 490 Objekte ohne `decision_level` sind `pending`/`failed`** — nie verstanden, ohne Inhalt außer einer Schlagzeile. Da die Ebene seit Sprint 19 **monoton** ist, würde eine daraus abgeleitete Ebene zum „ermittelten" Wert und wäre später nur noch per KI korrigierbar: **eine Vermutung würde zum Gedächtnis.** Deshalb harter Ausschluss. **Idempotenz an echten Production-Daten bewiesen** (rein lesend, Schreibvorgang im Speicher simuliert): über **alle 740** Objekte schreibt Lauf 1 740, **Lauf 2 und Lauf 3 schreiben 0**, und **0** Geografien mit echter Herkunft gehen verloren. **Zwei freigabefähige Umfänge:** A nur Geografie (**572** Schreibvorgänge, 23 Batches, 168 Objekte unverändert) oder B zusätzlich die ehrliche Geografie-Konfidenz (**740**, 30 Batches) — ohne B behaupten **166** Objekte weiterhin `geography: "medium"`, obwohl sie **keine** belegte Region tragen (falsches Grün). Neu dafür `--klassen=` als Positivliste: eine klassenweise Freigabe ist damit **strukturell erzwingbar**. **Ehrliche Grenze:** die ursprüngliche KI-Antwort (`ai.affected_geographies`) hat der alte Schreibpfad verworfen; sie ist nicht rekonstruierbar. Objekte, deren Region nur die KI kennen könnte, bleiben danach **ehrlich ohne** betroffene Geografie statt mit einer falschen. **Tragweite ehrlich benannt:** `affected_geographies` und `political_level` haben heute **keinen** Laufzeitkonsumenten — `matching.js` liest beides nicht; der Gewinn ist Datenintegrität, das Risiko einer stillen Matching-/Scoring-Änderung ist strukturell ausgeschlossen. **Nicht angefasst:** Fachgebiete (`tags`/`policy_field` — zuständig ist der bestehende `ko-enrichment`-Pfad, 567 Objekte nur **gemeldet**), `related_levels`, `event_type`, Quellen, Pakete, Crons, Locks, Mandantenprofile. **Keine** Migration, **keine** neue Spalte, **kein** Flag. **Tests:** neue Suite `nachklassifikation-test.js` **101/101** (die 20 im Auftrag verbindlich geforderten Fälle einzeln und benannt), Mutationsprobe **21 von 21 rot**, Offline-Suite **158/172** gegen die im selben Arbeitsbaum gemessene Basislinie **157/171** — **identische 14 Vorbefunde** (netz-/DB-abhängige Suiten scheitern in dieser Sitzung am Netz-Guard, weil Zugangsdaten gesetzt sind), also **+1 Suite, +1 grün, keine Verschlechterung**; die Abnahmezahl ist der CI-Lauf ohne Secrets. Browser-Smoke lokal nicht gefahren (keine UI-Änderung), im CI aber grün. **CI-Gate grün: beide Pflicht-Checks** (`Syntax + Offline-Suiten`, `Browser-/Mobile-Smoke (Chromium)`), Lauf `30317133853`, Commit `8d8ae3e`; die Einzelzahl der CI-Suiten war aus der Sitzung nicht lesbar (Actions-Log-Host proxy-gesperrt) — belegt ist der Ausgang, nicht die Zahl. Branch `claude/sprint-21-reclassification-rawkji`, **PR #156**. Kanonisch: [`nachklassifikation-altbestand.md`](nachklassifikation-altbestand.md) |
| **Sprint 20: Geografische Zuordnungen dauerhaft und nachvollziehbar speichern** | 2026-07-27 | **Teilweise abgeschlossen — der Speicherpfad ist gebaut, getestet und in Production read-only gegengemessen; Merge/Deployment stehen aus (freigabepflichtig).** **Befund, an echten Production-Daten belegt (1 193 Knowledge Objects, vollständiger Seitenlauf, strikt lesend):** von **552** Vorgängen mit gespeicherter „betroffener Geografie" tragen **481 (87,1 %) Deutschland** — darunter **451 von 451** Bundesvorgängen, also **ausnahmslos**, und **30 von 60** Landesvorgängen, bei denen Deutschland der verbotene Ersatzwert für eine unbekannte Landesgeografie war. **37** Einträge lauten „Europäische Union" **ohne kanonische ID**. **0 von 1 193** Vorgängen haben mehr als **eine** betroffene Region. Damit waren **518 von 552 (93,8 %)** der gespeicherten Zuordnungen reine Ebenen-Ableitungen; die restlichen **34** stammten aus bloßen Ortsnennungen. **Kein einziger** Wert beruhte auf einem geografischen Nachweis. **Ursache in vier Zeilen:** `deriveAffectedGeographies(level, mentionedGeos)` erzeugte die Geografie aus `decision_level` (`bund` → Deutschland, `eu` → Europäische Union, `land` ohne erkanntes Bundesland → **ebenfalls Deutschland**), wertete eine Erwähnung als Betroffenheit und gab strukturell **höchstens eine** Region zurück. **Lösung — kleinstes tragfähiges Zielmodell, ohne Migration und ohne zweite Geografiestruktur:** neues reines Modul `quellenarchitektur/geografie-gedaechtnis.js`; die drei fachlichen Bedeutungen liegen auf den **vorhandenen** Strukturen (betroffen → `affected_geographies`, erwähnt → `mentioned_geographies`, Quellengeografie bleibt kanonisch am Abrufweg und erscheint am Vorgang nur als **Indiz** in `classification_confidence.geography_indizien`). Herkunftsrang `parser` > `amtlich` > `inhalt` > `ki` > `erwaehnung` > `quelle`; der Resolver **kennt `decision_level` nicht einmal als Parameter** (durch Test E3/A19 gesichert). Inhaltlicher Nachweis sind **ausschließlich subnationale** Entscheidungskörper aus dem kanonischen Entitätenkatalog (Abgeordnetenhaus, Senat, Landtag, Staatskanzlei) — **Bundesinstitutionen ausdrücklich nicht**, sonst wäre es die Ableitung aus der Ebene durch die Hintertür. Fail closed: eine ermittelte Region wird nie durch leer/unbekannt ersetzt; nur eine **höherwertige** Herkunft korrigiert, **gleich starke** Nachweise werden **vereinigt** (mehrere Regionen). Quellengeografie ist **strukturell** vom Betroffensein ausgeschlossen — auch wenn ein Aufrufer sie als „betroffen" anböte. **Zwei korrigierte Kennzahlen:** `berlin-beweislauf-auswertung.js` prüfte Geografie-**Objekte** per `/berlin/i.test(String(g))` und traf deshalb immer `"[object Object]"` — die Kennzahl war strukturell **0**; und `classification_confidence.geography` maß die Zahl der **Erwähnungen** und nannte das Geografie-Konfidenz. Neu in `getClassificationCoverage()`: `affectedGeographyCoverage` über `neq.[]` (gegen Production verifiziert: 552/1 193). **Nicht enthalten und ausdrücklich Sprint 21:** die Nachklassifikation des Altbestands (die 481 Deutschland- und 37 EU-Einträge bleiben unverändert stehen; sie sind über `herkunft: bestand-alt` korrigierbar, sobald ein echter Nachweis vorliegt). **Keine** Production-Mutation, **keine** Migration, **kein** Flag verändert, **keine** Berliner/Brandenburger Quelle aktiviert. Tests: **CI-Gate grün — Offline-Suite 171/171 und Browser-/Mobile-Smoke 32/32** (Lauf `30299183808`, Commit `f4d6648`; die Suite läuft dort ohne Secrets, während in dieser Sitzung 14 netz-/DB-abhängige Suiten wegen vorhandener Zugangsdaten am Netz-Guard scheitern — der lokale Wert **167/171** ist deshalb NICHT die Abnahmezahl). Neue Suite `geografie-gedaechtnis-test.js` **61/61** (alle 10 im Auftrag verbindlich geforderten Fälle einzeln benannt), **11 von 11 Mutationen rot** (`scripts/geografie-mutationsprobe.js`, mutiert nur in einem temporären Abzug). **Zwei Bestandstests wurden angepasst, weil sie den Defekt festschrieben** (`ko-classification-test.js`: „Erwähnung Bayern → betroffen" und „Bundes-KO → affected = geo-bund"; `ebenen-gedaechtnis-test.js` B5: „affected = Deutschland"). **Befund aus dem CI-Gate, den der lokale Lauf verdeckte:** die erste Fassung wertete Landesinstitutionen nur in den **strukturierten** Feldern aus, nicht im **Fließtext** — `berlin-aktivierung-test.js` (8h) wurde dadurch rot. In dieser Sitzung ist diese Suite netz-/DB-abhängig und lief lokal ohnehin nicht durch; sichtbar wurde der Fehler erst im CI ohne Secrets. Behoben: Institutionsnennungen zählen jetzt aus **beiden** Fundorten — der Fließtext wird dabei **Feld für Feld** durchsucht, nie als zusammengeklebter Text (sonst ergäben ein Eintrag „Landtag" und eine getrennte Ortsnennung „Brandenburg" die Phrase „Landtag Brandenburg", die niemand geschrieben hat — dieselbe zufällige Nachbarschaft, die B4-3/B4-4 verursacht hat). **Zweite Schranke dabei ergänzt:** die gefundene Bezeichnung muss die Region **selbst nennen** — sonst hätte ein regionloses „Senatskanzlei" (im Katalog an Berlin gebunden) eine Hamburger Meldung nach Berlin verschoben. Branch `claude/sprint-20-geography-storage-vuhqcn`, **PR #155** |
| **Sprint 19: Politische Ebene dauerhaft speichern** | 2026-07-27 | **Teilweise abgeschlossen — der Speicherpfad ist gebaut, getestet und in Production gegengemessen; der Merge (= Deployment) steht aus, und die inhaltliche Vollständigkeit der Ebene ist nicht Gegenstand dieses Sprints.** **Befund E-1 (der eigentliche Grund):** `understandUpdate` baute das Knowledge Object bei jeder Aktualisierung komplett neu auf und leitete die politische Ebene dabei erneut ab — den **gespeicherten Wert las es nicht einmal**. Ein einmal belegt als `bund` erkannter Vorgang konnte damit auf `unknown` zurückfallen, sobald die neue Dokumentmenge kein Institutionssignal mehr trug: stiller Datenverlust ohne Gegenwert. **E-2:** selbst wenn man hätte wiederverwenden wollen, wäre es unmöglich gewesen — die Kandidatenprojektion `listKnowledgeObjectsByVorgangPrefix` (sie liefert den `existing`-Datensatz des häufigsten Aktualisierungspfads) selektierte `decision_level` gar nicht. **E-3, falsches Grün:** `getClassificationCoverage` zählte `decision_level=not.is.null` als „mit Ebene"; die Spalte ist seit Sprint 2 aber **nie** `null` (der Deriver schreibt im Zweifel `unknown`) — die Kennzahl konnte strukturell nie warnen. **Gebaut:** neues reines Modul `ebenen-gedaechtnis.js` — ermittelte Ebene wird **wiederverwendet**, **nie** durch `unknown` ersetzt (fail closed), und nur eine **höherwertige** Herkunft (KI > Deriver) darf sie ersetzen → die Ebene ändert sich **höchstens einmal** und flackert nie. Herkunft, Zeitpunkt der Erstermittlung und Wiederverwendung stehen additiv im bestehenden jsonb `classification_confidence` — **keine neue Spalte, keine Migration, keine Datenwanderung**. **Read-only in Production gemessen (2026-07-27):** 1 193 Wissensobjekte, 719 verstanden, **642 mit ermittelter Ebene** (bund 451 · international 66 · land 60 · eu 37 · kommune 28), **78 `unknown`**, 473 ohne Analyse; **0** Widersprüche zwischen `decision_level` und `political_level`, **0** Zeilen mit kaputtem `classification_confidence`, **0** Zeilen mit dem neuen Herkunftsschlüssel (erwartet — er entsteht erst mit dem nächsten Schreibvorgang). **Ehrlichkeit statt Kosmetik:** die Abdeckungsachse meldet ab jetzt **53,8 %** (642/1 193 ermittelt) statt **60,3 %** (720/1 193 Spalte gefüllt) und kippt damit von `ok` auf `niedrig` — WARN-only, der Health-Status bleibt unberührt. **Kostenwirkung ehrlich:** **null zusätzliche KI-Aufrufe**, aber auch **keine messbare Einsparung heute** — in Production trägt genau **1** Vorgang `ko_version > 1`, der Aktualisierungspfad ist also noch selten. Der Gewinn ist Datenintegrität, nicht Budget. **Nicht getan:** kein `insert`/`update`/`delete` in Production, keine Migration, kein Flag, keine Änderung an Cronjobs, Crawlern, Budgetsystem, `process_runs` oder W-1/W-2; die Ebenen-Ableitung je Rohdokument im Understanding-Gate (`understanding-gate.js`) wurde analysiert und **bewusst nicht angefasst** (sie ist rein regelbasiert, kostenlos und läge im Crawl-Pfad). Die 78 unbestimmten Vorgänge bleiben offen — Nachklassifikation ist Phase-1-Punkt 21. **Tests:** `ebenen-gedaechtnis-test` **41/41** (neu), Offline-Suite **156/170** gegen die Basislinie **155/169** desselben Arbeitsbaums — identische 14 Vorbefunde (Suiten, die echte Supabase-/Netzzugriffe brauchen und am Netz-Guard scheitern), also **+1 Suite, +1 grün, keine Verschlechterung** —, Browser-Smoke **32/32**, **7/7 gezielte Mutationen rot** (Gedächtnis abgeschaltet · Fail-Closed-Regel entfernt · Bestand nicht durchgereicht · Klassifikationsspalten aus der Projektion entfernt · `unknown` wieder als abgedeckt gezählt · Abdeckungsachse auf die alte Kennzahl zurückgesetzt · Alt-Spalte `political_level` nicht mehr gelesen). Branch `claude/politische-ebene-speichern-e7ad56`, Commit `a65fd9a`, **PR #154** (nicht gemergt). Kanonisch: `ARCHITECTURE.md` §7b, `roadmap/phase_1_checkliste.md` Punkt 19 |
| **Phase-1-Punkt 14B: Production-Vorbereitung Berlin** | 2026-07-26 | **Teilweise abgeschlossen — der zweite von zwei Blockern ist beseitigt, keine Production-Mutation.** Startprüfung **5 von 6** (nicht erfüllt: Production-Zugänge nur teilweise — Supabase ja, Vercel-Env nein). **Erreicht:** Schritt 5 der Aktivierungsreihenfolge (Abnahmeprofil) war der **einzige** der 9 Production-Schritte ohne Datei, Vorbedingung, Dry Run und Rollback — er ist jetzt **4 generierte SQL-Dateien** (anlegen + Rollback Stufe 0/1/2), fail-closed, idempotent, drift-gebunden, **36/36 gegen ein echtes PostgreSQL 16** bewiesen (u. a.: fremder Datensatz unter derselben Id bricht ab; zweites Landtagsmandat blockiert; Stufe 2 schützt erzeugte Daten gegen `ON DELETE CASCADE`; Endzustand zeilengenau der Ausgangszustand). Read-only **Dry Run gegen Production**: Schritt 1 **jetzt ausführbar** (4/4 Vor-, 5/5 Nachbedingungen, Treffer 1+1 Zeilen, Kontrollfragen 0). Neuer Backup-Umfang **`--scope=profil`** schließt die Lücke, dass `--scope=seed` die beiden Profiltabellen nicht abdeckt; **zwei frische Sicherungen** real erstellt (`pre-seed` 8/8 `49a5b92d…` — **byte-identisch** zur Sicherung von 16:47 UTC, und `pre-profil` 2/2 `0c514ace…`, beide `vollstaendig: true`). Belegt: **zwei** DB-seitige Not-Aus-Schalter (Profil deaktivieren · Wege auf `manual`) stoppen **jeder für sich** jeden Berliner Abruf, auch bei gesetztem Flag. **Neuer Betriebsbefund:** `/api/cron/crawl` läuft ins 300-s-Funktionslimit (3 × HTTP 504 in 7 Tagen) — das Abnahmeprofil wäre ein 7. Mandant an Sortierposition 3 und erzeugt 6 zusätzliche Google-Abrufe je Lauf; neues Abbruchkriterium 16. **Nicht erreicht:** `HELMUT_LANDESMODULE` bleibt auf allen 6 geprüften Kanälen weder lesbar noch setzbar noch rücksetzbar — **kein Workaround gebaut**, kleinste Betreiberaktion benannt (§20.3). **Nicht getan:** kein `insert`/`update`/`delete`, kein Flag, kein Profil, kein Crawl, keine Aktivierung, Brandenburg unberührt, Punkt 16/17 unberührt. Offline-Suite **157/157**, Browser-Smoke **32/32**, `berlin-abnahmeprofil-test` **78/78**, `backup-export-test` **48/48** (von 38), pgverify **36/36**. Branch `claude/helmut-production-berlin-prep-l0lfbg`, Commit `a476f21`, **PR #140** (nicht gemergt). Kanonisch: `betrieb/berlin-aktivierung.md` §20 |
| **Punkt 14 (2. Production-Anlauf): Berlin Stufe 1 in Production aktivieren und beweisen** | 2026-07-26 | **Blockiert — erneut keine Production-Mutation.** **11 von 14** Startbedingungen erfüllt. Nicht erfüllt: **(8)** `HELMUT_LANDESMODULE` ist weder lesbar noch setzbar noch rücksetzbar → **Rollback Ebene 0 nicht verfügbar**, Abbruchkriterium **14** greift vor jeder Mutation; **(7)** Production-Zugänge nur teilweise; **(10)** die Backup-*Grundlage* ist gültig (die drei gebundenen Tabellen sind seit 11:13 UTC unverändert), das Backup-*Artefakt* aus der Vorsitzung existiert nicht mehr. **Neuer, zweiter Blocker:** Production führt **0 Landtagsprofile** (8 Profile, alle `bundestag`) — seit 14A/V-2 aktiviert das Flag ohne berechtigtes Landtagsmandat **0** Berliner Wege; der Beweislauf wäre auch mit Flag ein No-Op. **Zwei Zugangsangaben korrigiert:** die Production-App ist **erreichbar** (über `web_fetch_vercel_url` **HTTP 401** statt Proxy-403, also unauthentifiziert statt unerreichbar; `GET`-only ohne Header → kein Crawl auslösbar), und ein `VERCEL_TOKEN` allein würde **nicht** genügen, weil `api.vercel.com` proxy-gesperrt ist. **Erreicht:** Ausgangszustand vollständig neu gemessen · alle **8** Dry-Run-Schritte grün, Kontrollfragen durchweg **0** (Brandenburg, Bund, Partei-/Fraktions-/Personenwege, fremde Pakete) · Brandenburg und Bund nachweislich unberührt · PR #132 als konkurrierender Gate-Name erkannt. **Nicht getan:** kein `insert`/`update`/`delete`, kein Flag, kein Profil, kein Backup, kein Crawl, keine Stufe 1, keine Stufe 2, kein Rollback (keiner nötig). Beobachtete erfolgreiche Berliner Production-Läufe: **0**. Offline-Suite **156/156**; Berlin 126/71/109, Mandatsgate 71, Punkt 16 **160/160**, Punkt 17 **128/128**, Seed-Drift grün. Kanonisch: `betrieb/berlin-aktivierung.md` §19 |
| **Phase-1-Punkt 16: Quellenfehler vollständig automatisch erkennen** | 2026-07-26 | **Teilweise abgeschlossen — Erkennung vollständig gebaut und getestet, Production lesend belegt, 7 Klassen nur testbelegt.** Befund **A-6 behoben**: `source_crawl_telemetry` (13 081 echte Laufzeilen) hatte **keinen Lesepfad**, während `retrieval_paths.last_success_at`/`last_error`/`error_streak` zu **0 von 163** befüllt sind — die Admin-Ansicht las genau die leeren Spalten und meldete **falsches Grün**. Neue zentrale, reine Klassifikation mit **14 Zustandsklassen** und **4 Handlungsstufen**, abgeleitet aus der echten Laufhistorie statt zweitgespeichert (**keine Migration, kein Production-Write**). Fünf belegte Fehlalarmbremsen: übersprungene Läufe und zentrale Drosselung sind **keine** Quellenfehler (1 736 bzw. **4 044** der 13 081 Zeilen), Leer/Veraltet brauchen **zusätzlich** eine überschrittene Lieferpause, ein Einzelausreißer wird nie hochgestuft, zu wenig Daten heißt `unbekannt`. **Production-Gegenprobe (read-only)** über 205 Quellen: 150 ohne Handlungsbedarf, 48 beobachten, 6 zeitnah, **1 akut**; **141 von 154** je gestörten Quellen hatten sich selbst erholt — ein naiver Alarm hätte 154 Meldungen erzeugt, 141 davon bereits erledigt. Deduplizierung gegen echte Daten belegt (**0** neue Meldungen bei unverändertem Zustand). `source-failure` **160/160** (neu), `admin-source-ui` **40/40** (von 20 erweitert), **Offline-Suite 153/153**, Browser-Smoke 32/32. **Keine Production-Mutation, kein Cron, kein Flag, keine Migration.** Berlin/Brandenburg unverändert (beide Pakete bleiben `unbestimmt`, keine Störung behauptet). Punkt 17 unberührt. Details unten. |
| **Punkt 14 (Production-Sprint): Berlin Stufe 1 aktivieren** | 2026-07-26 | **Blockiert — keine Production-Mutation.** 11 von 12 Startbedingungen erfüllt; Bedingung **10** (notwendige Production-Zugänge) **nicht**: `HELMUT_LANDESMODULE` ist aus einer Cloud-Sitzung weder lesbar noch setzbar (`VERCEL_TOKEN` nicht gesetzt, Vercel-MCP ohne Env-Werkzeug), die Production-App ist nicht erreichbar (`CONNECT` → 403). Damit wäre **Rollback Stufe 0 nicht verfügbar** gewesen → Abbruchkriterium 20 greift vor jeder Mutation. **Erreicht:** vollständiger Ausgangszustand gemessen · **Sicherung erstmals real erstellt** (8/8 Tabellen, `vollstaendig: true` — schließt Go-Kriterium 2 der Seed-Einspielung) · Dry Run gegen den Ist-Zustand bestätigt (**3/3/1/2** Zeilen, **0** Bund, **0** Brandenburg) · Übergabe §16.6. **Nicht getan:** kein `insert`/`update`/`delete`, kein Flag, kein Profil, kein Crawl, keine Stufe 2. Brandenburg unverändert. Details unten. |
| **Phase-1-Punkt 17: Echte Kostenmessung im Betrieb bestätigen** | 2026-07-26 | **Teilweise abgeschlossen** (Status nach unabhängigem adversarialem Review von PR #136 **von „erfolgreich abgeschlossen" herabgestuft**). **Was erfüllt ist:** Kosten sind **pro Lauf** und **pro Tag** mit read-only Production-Messung belegt (Beispiellauf `crawl-20260726160130-7bznw`: 147 Abrufwege, 940 neue Dokumente, 8 LLM-Aufrufe, **0,026805 USD**; Betriebstag im Mittel **0,1370 USD** über 7 volle Tage), zwei unabhängige Wege liefern identische Zahlen, unbekannte Kosten erscheinen nie als 0,00, und die Trennung global/direkt/nicht-zurechenbar ist gemessen (**79 % / 21 % / 0 %**). **Warum nicht erfolgreich abgeschlossen:** das Abnahmekriterium verlangt einen **vollständigen Production-Kostennachweis**; geliefert ist eine **Untergrenze auf unbelegter Preisbasis**. Die sechs Einschränkungen bestehen unverändert fort: ~16 % Logverlust (K-1) · Preise sind intern deklarierte Schätzwerte (K-2) · Nicht-LLM-Providerkosten ungemessen (K-6) · Gesamtbetrag nur Untergrenze · pro Mandant nur direkt zurechenbare Teilkosten (79 % bleiben global) · Ringpuffer 5 000 (K-7). Der Review fand zusätzlich **4 Code-Defekte im PR selbst**, alle behoben (siehe unten). `kostenmessung-test` **128/128**, `admin-overview` 104/104, Offline-Suite **153/153**, Browser-Smoke 32/32. **Keine Production-Mutation** — ausschließlich `select`. Details unten. |
| **Punkt 14 (2. Durchgang): Berlin fachlich neutralisieren, aktuell verifizieren, freigabereif machen** | 2026-07-26 | **Teilweise abgeschlossen — Aktivierungsreife für ein reduziertes Set, Production unverändert.** Neutralität ist jetzt eine **ausführbare Prüfung** über Code **und** gemessenen Datenbankbestand: Code neutral, Production **nicht** (Befund A-3 reproduziert), nach Block A neutral. Neuverifikation auf einem Runner mit offenem Egress hat **zwei Wege als veraltet entlarvt** (156 bzw. 41 Tage) — Aktivierungsset **6 → 4**. Pflichtklassen ehrlich neu gezählt: **4 eigenständig, 1 mitabgedeckt, 7 ohne Weg** (vorher „8 von 12 liefern"). Lastmodell gegen gemessene Production-Zahlen korrigiert (beide Terme der Alt-Rechnung waren falsch). Profilplan getestet, zwei Befunde (P-1, P-2). Aktivierung gestaffelt, Rollback gehärtet. **Empfehlung: Go mit Bedingungen** für das reduzierte Set; harter Blocker bleibt V1. Offline-Suite **152/152**, Browser-Smoke 32/32, `berlin-neutralitaet` 109/109 (neu), `berlin-aktivierung` 123/123. **Keine Production-Mutation.** Brandenburg unverändert und inaktiv. Details unten. |
| **Phase-1-Punkt 14: Berlin als laufende Versorgung aktivieren** | 2026-07-26 | **Teilweise abgeschlossen — Aktivierungsreife erreicht, Production unverändert.** Berlin ist bis unmittelbar vor die erste Production-Änderung vorbereitet: Aktivierungsplan, SQL, 3 Rollback-Stufen, Runbook und 123 ausführbare Prüfungen liegen vor. **Keine** Aktivierung, kein Flag, kein SQL ausgeführt, keine Zeile verändert. Zwei echte Sperrlücken behoben (globales statt landesscharfes Gate; `activation_mode='manual'` war wirkungslos). **Empfehlung: Go mit Bedingungen** — der harte Blocker ist die in der Datenbank offene Neutralisierung von `berlin-basis` (A-3). Offline-Suite 151/151, Browser-Smoke 32/32. Brandenburg unverändert und inaktiv. Details unten. |
| Punkt 13 — Abschlusskorrektur: Niedersachsen, nicht-anwendbar, Fraktionen | 2026-07-26 | **Erfolgreich abgeschlossen** — alle 8 Pakete abgeschlossen (7 vollständig + 1 mit belegten Ausnahmen, 0 teilweise, 0 blockiert). `regional-niedersachsen` hat eine benannte Basis aus 7 Wegen (5 Bestandsquellen + 2 amtliche), **vorbereitet und inaktiv, 0 zusätzliche Abrufe**. „Nicht anwendbar" ist gegen die amtliche Parlamentszusammensetzung überprüfbar. Fraktionssollmenge extern verankert — die Alt-Angabe „8 von 8" war fachlich falsch, richtig sind **5**. Offline-Suite 150/150. Keine Production-Änderung. Details unten. |
| Punkt 13 — Nachtrag: Ausschuss-Sollmenge extern verankern (23 → 24) | 2026-07-26 | **Erfolgreich abgeschlossen** — der 21. Bundestag hat 24 ständige Ausschüsse (Drucksache 21/150); der Katalog führte 23 und neun Bezeichnungen der 20. Wahlperiode. Fehlend war der Ausschuss für Wahlprüfung, Immunität und Geschäftsordnung. Kanonische Quelle korrigiert (nicht der Testwert), Sollmenge extern verankert, 36 neue Prüfungen mit 6 Negativkontrollen; zusätzlich eine Lücke im Seed-Rückweg behoben. Offline-Suite 149/149. Keine Production-Änderung. Details unten. |
| Phase-1-Punkt 13: Vollständigkeit jedes Quellenpakets prüfen | 2026-07-26 | **Erfolgreich abgeschlossen** — Abnahmekriterium erfüllt und belegt: alle 8 Pakete haben ein ausführbares fachliches Kriterium, 6 sind vollständig, 2 belegt teilweise vollständig (kein falsches Grün), 3 Lücken behoben. `paketvollstaendigkeit-test` 89/89, Offline-Suite 148/148, Seeds byte-identisch reproduzierbar. Keine Production-Änderung, Berlin/Brandenburg unverändert vorbereitet und inaktiv. Details unten. |
| Go-Kriterium 2 kontrolliert versuchen: Pre-Seed-Backup-Export | 2026-07-25 | **Blockiert** — `node scripts/backup-export.js --scope=seed` exakt wie angefordert ausgeführt; Abbruch vor jedem Netzwerkzugriff (Exit 2), da diese Agenten-Sitzung keine `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` und keine `.env.local` besitzt. **Kein** Production-Zugriff erfolgt. Betreiberentscheidung: Export läuft auf der Betreibermaschine mit echter `.env.local`, Manifest wird zurückgemeldet. Details unten. |
| Review + Merge von PR #125, danach Production-Ablauf bis vor den ersten Zugriff vorbereiten | 2026-07-25 | **Teilweise abgeschlossen** — PR #125 adversarial reviewt (3 Reviewer, 20 belegte Befunde, alle behoben) und als `0d6d867` gemergt (CI auf `main` grün, Vercel-Production `READY`). Der Production-Ablauf ist vollständig vorbereitet; **kein Production-Zugriff erfolgt, keine Seeds ausgeführt**. Wartet auf die Betreiberfreigabe für den Pre-Seed-Export. Details unten. |
| Merge #123 + Sicherung, gezielter Restore und Entscheidungsreife für die Seed-Einspielung | 2026-07-25 | **Teilweise abgeschlossen** — #123 gemergt (`bed7f53`); Backup- und Restore-Werkzeug gebaut und isoliert getestet (33/33 lokal, 31/31 in CI, Suite 145/145). Die Seed-Ausführung bleibt **blockiert**: die Sicherung ist noch nicht gelaufen und die Reaktivierung der 6 Bundeswege ist nicht freigegeben. Details unten. |
| Phase-1-Block: Quellenpakete inventarisieren + automatische Paketzuweisung beweisen | 2026-07-25 | **Erfolgreich abgeschlossen** — beide Abnahmekriterien erfüllt und belegt; 145/145 Offline-Suiten grün; als PR #124 gemergt (`118e90c`), CI auf `main` grün, Vercel-Production `READY`. Details unten. |
| Merge PR #118 + Vorbereitung des Quellen-Seed-Sprints | 2026-07-25 | **Teilweise abgeschlossen** — #118 gemergt (`61767a9`), CI grün, Deployment `READY`. Die Seed-Einspielung ist vollständig entscheidungsreif vorbereitet, aber **blockiert** (fehlende Sicherung). Details unten. |
| Merge #122 + adversarialer Review von PR #118 (Quellenarchitektur-Remediation) | 2026-07-25 | **Erfolgreich abgeschlossen** — #122 gemergt (`54fe370`); #118 reviewt, 3 belegte Defekte behoben. |
| Merge von PR #105 — Anker-Recovery-Pfad in Production stillgelegt | 2026-07-25 | **Erfolgreich abgeschlossen** — gemergt als `43e9e35`; Stilllegung auf `main` verifiziert. |
| Recovery-Pfad-Review + Zusammenführung von PR #105 auf die kanonische Kontextstruktur | 2026-07-25 | **Erfolgreich abgeschlossen** |
| Kontextstruktur für Claude Code (`CLAUDE.md` + Einstiegsschicht) | 2026-07-25 | **Erfolgreich abgeschlossen** — reine Dokumentation, gemergt als PR #119 (`c6a3d40`). |

**Sprint „Phase-1-Punkt 16: Quellenfehler vollständig automatisch erkennen" — Nachweis**

- **Auftrag:** leere, blockierte, langsame und fehlerhafte Quellen zuverlässig erkennen, speichern,
  verständlich klassifizieren und melden — ohne Production-Mutation. **Ergebnis: Erkennung gebaut,
  getestet und in Production lesend gegengeprüft; 7 von 14 Klassen sind mangels realer Vorfälle nur
  testbelegt.**
- **Startprüfung bestanden:** Arbeitsbaum sauber, lokaler Stand == `origin/main` == `93006e8`,
  Pflichtlektüre in der vorgeschriebenen Reihenfolge gelesen.
- **Der eigentliche Befund (A-6), read-only nachgemessen am 2026-07-26:** `source_crawl_telemetry`
  trägt **13 081 echte Laufzeilen** (2026-07-16 bis 2026-07-26, 105 Läufe, 182 verschiedene Quellen) —
  im Code gab es dafür aber **keinen einzigen Lesepfad**. Gleichzeitig sind
  `retrieval_paths.last_success_at`, `last_error` und `error_streak` zu **0 von 163** befüllt. Die
  Admin-Ansicht „Problematische Abrufwege" las genau diese drei leeren Spalten. Ergebnis war
  **falsches Grün** über einer Datenbank mit 215 belegten Timeouts, 47 Rate-Limit-Treffern und
  4 044 Drosselungsabbrüchen.
- **Architekturentscheidung: `source_crawl_telemetry` ist die führende Wahrheit.** Der Zustand wird
  daraus **abgeleitet**, nicht zweitgespeichert. Ein Rückschreiben nach `retrieval_paths` wäre ein
  Production-Write je Crawl **und** eine redundante Doppelspeicherung. **Folge: keine Migration,
  kein Schemawechsel, kein Production-Write** — und damit keine Berührungsfläche mit Punkt 14 oder 17.
- **14 Zustandsklassen, 4 Handlungsstufen.** Klassen: `ok` · `leer` · `veraltet` · `blockiert` ·
  `gedrosselt` · `langsam` · `parserfehler` · `abruffehler` · `instabil` · `erholt` ·
  `nie_erfolgreich` · `inaktiv` · `manuell` · `unbekannt`. Stufen: `keine` · `beobachten` ·
  `zeitnah_pruefen` · `akut`. Jeder Befund trägt Kurzbezeichnung, Klartext-Erklärung, Problembeginn,
  letzten Erfolg, letzte Lieferung, Wiederholungszahl, Ursache, Erholungsstatus und Auswirkung.
- **Fünf Fehlalarmbremsen — jede an Production-Zahlen begründet:**
  1. **Übersprungene Läufe sind keine Versuche** (`skipped-shared`: **1 736** der 13 081 Zeilen) —
     sie erreichten die Quelle nie, begründen keine Fehlerserie und unterbrechen keine.
  2. **Zentrale Drosselung ist kein Quellendefekt** (`circuit-open`: **4 044** Zeilen, der mit
     Abstand häufigste „Fehler") — eigene Klasse `gedrosselt`, Stufe `beobachten`, gehört zu OP-15.
     Ohne diese Trennung wäre der Bericht dauerhaft rot.
  3. **Nie allein aus „0 Dokumente".** Leer und veraltet verlangen **zusätzlich** eine überschrittene
     Lieferpause. Bei 5 Crawl-Vollrunden je Tag erzeugt eine wöchentliche Quelle zwangsläufig
     dutzende Leerläufe — eine reine Zählschwelle hätte genau die seltenen Quellen als kaputt gemeldet.
  4. **Ein Einzelausreißer ist keine Störung** — nie über `beobachten`, auch bei einer Pflichtquelle,
     und er zählt für das Paket weiterhin als tragend.
  5. **Zu wenig Daten heißt `unbekannt`** (unter 3 echten Versuchen), unklare Ursache heißt
     `abruffehler` statt erfundener Präzision.
- **Erwarteter Rhythmus, ehrlich gelöst:** `expected_frequency` ist in Production bei **allen 163**
  Wegen `NULL`. Die Erwartung kommt deshalb aus dem **beobachteten** Median-Lieferabstand × 3
  (begrenzt auf 3…60 Tage, ab 4 Lieferungen), sonst aus einem Standardwert. Deterministisch und
  testbar — kein Anomalie-Lernverfahren.
- **Erholungsregel (§13 des Auftrags):** Erholung wird erst anerkannt, wenn nach dem letzten Fehler
  wieder **echter Inhalt** geliefert wurde. Eine rein technische 200-Antwort ohne Inhalt genügt
  **nicht** und fällt weiter zu `leer`/`veraltet` durch. Bei ≥ 2 getrennten Ausfällen bleibt die
  Quelle `instabil` — Erholung überschreibt Instabilität nicht.
- **Production-Gegenprobe (read-only, ausschließlich `select`), 2026-07-26.** Eingang: 13 081
  Telemetriezeilen · 163 Abrufwege · 9 Pakete · 165 Zuordnungen. Klassifiziert wurden **205 Quellen**
  (163 Katalogwege + 42 Laufzeit-Personenquellen aus Profilen):

  | Klasse | n | | Stufe | n |
  |---|---:|---|---|---:|
  | `erholt` | 110 | | `keine` | 150 |
  | `unbekannt` | 23 | | `beobachten` | 48 |
  | `ok` | 22 | | `zeitnah_pruefen` | 6 |
  | `manuell` | 18 | | `akut` | **1** |
  | `gedrosselt` | 13 | | | |
  | `instabil` | 12 | | | |
  | `langsam` | 6 | | | |
  | `leer` | 1 | | | |

  **Der wichtigste einzelne Beleg:** von 154 je gestörten Quellen hatten sich **141 selbst erholt**.
  Ein System, das jeden Fehler meldet, hätte 154 Alarme erzeugt — 141 davon zum Meldezeitpunkt
  bereits erledigt. Genau deshalb ist die Erholungsregel keine Kosmetik.
  Weiter belegt: `manuell` **18** deckt sich exakt mit den 18 `activation_mode='manual'`-Wegen ·
  `unbekannt` **23** sind exakt die 23 Katalogwege ohne jede Telemetrie (nie abgerufen, ehrlich
  „keine Aussage" statt „defekt") · der eine `akut`-Fall ist ein Personenpaket mit genau **einem**
  Abrufweg, 21 getrennten Ausfällen und ohne Alternative · **Deduplizierung belegt: 0 neue Meldungen**,
  wenn derselbe Bericht zweimal gegen dieselben Production-Daten läuft.
- **Ein echter Klassifikationsfehler, den erst die Production-Gegenprobe zeigte:** `langsam` entsteht
  sowohl aus reiner Laufzeit (Quelle liefert weiter) als auch aus einer **Timeout-Serie** (Quelle
  liefert nichts). Beide landeten zunächst auf `beobachten` — 6 Laufzeitquellen mit bis zu 13
  aufeinanderfolgenden Timeouts wären damit untergegangen. Behoben: die Stufe hängt jetzt an der
  Ursache, nicht am Klassennamen; die 6 Fälle stehen korrekt auf `zeitnah_pruefen`. Als
  Regressionstest fixiert.
- **Politische Versorgung statt technischem Alarm.** Paketlage: `versorgt` · `teilweise_geschwaecht` ·
  `ohne_funktionierenden_weg` · `leer` · `unbestimmt`. Liefert ein anderer Weg desselben Pakets, wird
  **kein** Versorgungsausfall behauptet und die Stufe heruntergesetzt. Mandatswirkung nur mit
  übergebenen Profilen über den bestehenden Resolver; ohne sie meldet der Bericht ausdrücklich
  `bestimmbar: false` **mit Begründung** plus Strukturhinweis bei Pflicht-Basispaketen — nie geraten.
- **Tests:** `source-failure` **160/160** (neu; deckt alle 26 geforderten Fälle ab, davon 9 reine
  Fehlalarm-Gegenproben) · `admin-source-ui` **40/40** (von 20 erweitert, inkl. ehrlichem
  Leerzustand ohne Telemetrie) · **Offline-Suite 153/153** · **Browser-Smoke 32/32**.
- **Nicht getan (bewusst):** keine Production-Mutation — ausschließlich `select`-Abfragen · keine
  Migration · kein Flag gesetzt · keine Cron-Änderung · keine Quelle/kein Paket verändert · kein
  Rückschreiben nach `retrieval_paths` · **keine externe Benachrichtigungsplattform** (nur der
  bestehende Admin-Bereich) · keine künstlichen Fehler erzeugt · Berlin/Brandenburg unverändert.
- **Verbleibende Grenzen, ehrlich:** `parserfehler`, `nie_erfolgreich`, `veraltet`, `blockiert` als
  laufende Serie, HTTP-4xx-Serie, Rückfall nach Erholung und die Mandatswirkung mit Profilen sind in
  Production **nie aufgetreten** und daher **ausschließlich testbelegt** — ein echter Beleg entsteht
  erst beim nächsten realen Vorfall (künstliche Fehler sind verboten) · die doppelten Cron-Läufe
  (A-7/OP-15) verzerren die Rohzählung weiterhin, `gedrosselt` fängt das nur ab · `retrieval_paths`
  bleibt unbefüllt, die konfigurierte und die beobachtete Sicht stehen als solche beschriftet
  nebeneinander.
- **Betriebsdokumentation:** [`betrieb/quellenstoerungen.md`](betrieb/quellenstoerungen.md)
  (Zustandsklassen, Schwellen, Handlungsstufen, Erholungslogik, Fehlalarmvermeidung,
  Production-Nachweis, Grenzen, sichere spätere Aktivierung).
**Sprint „Punkt 14 (Production-Sprint): Berlin Stufe 1 aktivieren" — Nachweis**

- **Auftrag:** die vorbereitete erste Berliner Aktivierungsstufe in Production ausführen und den
  ersten realen Crawl belegen. **Ergebnis: blockiert vor der ersten Mutation.**
- **Startprüfung: 11 von 12 erfüllt.** #134 gemergt (`merged: true`, 16:38:41 UTC), `e2be0a4` und
  `5cfce6c` Vorfahren von `main`, alle **6** Checks `success` (beide Pflicht-Checks grün), lokal ==
  `origin/main` == `93006e8`, Arbeitsbaum sauber, 0 Commits nach #134, V2-Verifikation **0 Tage** alt.
  Gemessen und bestätigt: Brandenburg `prepared` + 9/9 Wege `manual` + 0 BB-Profile · keine laufende
  Berliner Aktivierung (10/10 BE-Wege `manual`, **0 Berliner Telemetriezeilen jemals**) · keine
  parallele Änderung (letzte Konfigänderung 11:13:10 UTC, seither unverändert).
- **Die fehlende Bedingung (10):** Supabase ist erreichbar (Egress HTTP 200) — Messung, Backup und
  SQL wären möglich. **Nicht** erreichbar: Vercel-Env (`VERCEL_TOKEN` nicht gesetzt; der
  Vercel-MCP-Server stellt **kein** Werkzeug für Environment-Variablen bereit) und die Production-App
  (`CONNECT` → **403**, `CRON_SECRET` nicht gesetzt). `HELMUT_LANDESMODULE` ist damit weder **lesbar**
  noch **setzbar**, und ein Crawl nicht auslösbar.
- **Warum das die Mutation ausschließt** (und nicht nur den Crawl): der schnellste Rückweg —
  Rollback **Stufe 0**, Flag leeren **ohne** DB-Schreibzugriff — setzt genau diesen Zugang voraus.
  Wer das Flag nicht setzen kann, kann es auch nicht leeren. Abbruchkriterium **20** („Rollback ist
  nicht unmittelbar ausführbar") wäre ab der ersten Mutation dauerhaft erfüllt gewesen. Zusätzlich
  ist Riegel 1 nicht messbar, und nach Block A + Profil + Stufe 1 stünde nur noch eine einzelne,
  von hier aus unsichtbare Env-Variable zwischen dem sicheren Zustand und einem unbeobachteten
  Berliner Crawl. Die bindende Reihenfolge „Flag **vor** Stufe 2" wäre verletzt.
- **Trotzdem erreicht — die Sicherung.** `node scripts/backup-export.js --scope=seed` lief zum
  **ersten Mal real gegen Production** (Exit 0): **8/8 Tabellen**, `fehler: []`,
  **`vollstaendig: true`**, `pruefsummeGesamt` `49a5b92d…cc0ee`, gebunden an `mainCommit 93006e8`;
  163 `retrieval_paths`, 165 `package_paths`, 9 `source_packages`. Verzeichnis `backups/…` ist
  gitignored — Production-Daten kommen nicht ins Repo. **Damit ist Go-Kriterium 2 der
  Quellen-Seed-Einspielung erfüllt**, das seit 2026-07-25 offen war. Der Fehlschlag von damals lag
  an fehlenden Zugangsdaten, nicht am Werkzeug.
- **Dry Run gegen den gemessenen Ist-Zustand** (nicht gegen die Doku): A1 **3** · A2 **3** ·
  B1 **1** · B2.1 **2** Zeilen — exakt der Plan. Kontrollfragen alle **0**: kein Bundesweg, kein
  Brandenburg-Weg, keine `pkg-brandenburg-basis`-Zeile betroffen. `die-linke-berlin` trägt heute
  **0** Wege, daher legt A1 genau 3 Zeilen an und Rollback Stufe 2 bleibt zeilengenau umkehrbar.
- **Ausgangszustand (16:45–16:52 UTC), vollständig in §9 und im Runbook §16.2.** Kernwerte:
  Bundesversorgung gesund (letzter Vollcrawl 145/147 `ok`, 0 Fehler, 33 s) · Invariante B3 erfüllt
  (147 = 147) · Locks 3 Zeilen, **alle abgelaufen** · Pending unverändert **50** · LLM heute 34/100 ·
  Rohdokumente ≈ 283/Tag · KO ≈ 39/Tag · Originalverweis 99,5 % · Berlin bei **null**.
- **Unabhängige Vorprüfung (8 Prüfer, je Thema ein Gegenprüfer) — vier belegte Befunde**, alle
  selbst am Code nachgeprüft, in `betrieb/berlin-aktivierung.md` §17:
  **V-1 (kritisch)** die Staffelung ist im SQL **nicht erzwungen** — B1, B2.1 und B2.2 stehen in
  **einer** Transaktion; wer Block B am Stück ausführt, schaltet auch die zwei Google-Wege scharf,
  auf deren Verzögerung die gesamte Lastbegründung beruht ·
  **V-2** das Abnahmeprofil ist **kein mandantenbezogener Schalter**: `loadRelationalSharedSources`
  baut **einen globalen** Plan ohne Profilparameter, der in die Quellenliste **jedes** Profils
  gemischt wird — der Beweislauf fände im geteilten Korpus statt, nicht in einer isolierten Testspur ·
  **V-3** Rollback **Stufe 0 wirkt nur**, wenn die Freigabe über die **Vercel-Env** kam: ein leerer
  Env-Wert gilt als nicht gesetzt und fällt auf `helmut-flags.json` zurück ·
  **V-4** „öffnet ausschließlich Berlin" ist zu stark — der zweiländrige `rp-rbb24-politik` läuft mit
  (bekannte, in §13 akzeptierte Nebenwirkung, **keine** Brandenburg-Aktivierung).
  **Bestätigt** wurden: fail-closed Default, kein Sammel-Schlüsselwort, Gate als Regel 1 vor allen
  anderen Prüfungen, `manual` als echte Sperre, vollständige Rollback-Abdeckung ohne jeden
  `rp-bb-*`/`brandenburg-*`-Bezug, `Fraktionslos` ohne Parteibindung.
- **Nebenbefund, entscheidungsrelevant:** der offene **PR #132** (Brandenburg) führt einen
  konkurrierenden Gate-Namen `HELMUT_LANDESMODUL_FREIGABE` ein, während `main` seit #133/#134
  `HELMUT_LANDESMODULE` verwendet. `main` ist maßgeblich und #132 ist nicht gemergt — vor einem Merge
  von #132 muss entschieden werden, welcher Name gilt, sonst entstehen zwei Landesmodul-Gates.
- **Nicht getan (bewusst):** kein `insert`/`update`/`delete` · kein Flag gesetzt · kein Profil
  angelegt · kein SQL-Block ausgeführt · kein Crawl ausgelöst · **keine Stufe 2** · keine Migration ·
  keine Seed-Einspielung · keine Cron-/Lock-/Scheduler-/Secret-Änderung · Brandenburg, Bund,
  Niedersachsen und alle Bestandsmandanten unverändert · kein Rollback nötig (nichts zu rollen).
**Sprint „Phase-1-Punkt 17: Echte Kostenmessung im Betrieb bestätigen" — Nachweis**

- **Auftrag:** belegen, was ein Lauf und was ein Betriebstag kostet, welche Prozesse und
  Anbieter die Kosten treiben, und welche Kosten später einem Mandanten zugerechnet werden
  können — ohne Production-Mutation. **Ergebnis: teilweise erfüllt.** Kanonische Stelle:
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md).
- **Statusbewertung (adversarialer Review, 2026-07-26).** Der Sprint war zunächst als
  *erfolgreich abgeschlossen* geführt. Das war **zu großzügig**: das Abnahmekriterium
  verlangt einen vollständigen Production-Kostennachweis, und Schätzwerte sind kein
  solcher. Belegt sind Kosten je Lauf und je Tag als **Untergrenze** auf **unbelegter**
  Preisbasis; die Kosten je Mandant decken nur die 21 % direkt zurechenbaren Aufrufe ab.
  Korrekter Zustand: **teilweise abgeschlossen**. Die Messung selbst ist belastbar und
  ehrlich — unvollständig ist die *Datengrundlage*, nicht die Auswertung.
- **Vier Code-Defekte, die der Review im PR selbst fand — alle behoben und mutationsgeprüft:**
  1. **R-1 (hoch):** Der dedizierte **Understanding-Cron** (`/api/cron/understanding`,
     ein Hauptkostenpfad) reichte die Laufkennung **nicht** an den Kostenlog durch,
     obwohl sie im Scope lag und für `recordProcessRun` benutzt wurde. Die zentrale
     Zusage des PR („Laufkennung erreicht den Kostenlog") galt damit nur für 2 der
     Aufrufstellen. Behoben; ein **Quelltext-Riegel** verhindert den Rückfall.
  2. **R-2 (mittel):** Der neu protokollierte Diagnoseaufruf `pipeline-probe` zählte als
     *billable* und verbrauchte dadurch **Budget-Kopfraum, den er nie reservierte** —
     eine ungewollte Verhaltensänderung gegenüber `main`, die im Extremfall echte
     Fachaufrufe verdrängt hätte. Zusätzlich verfälschte er den Reservierungsabgleich,
     also genau den Messbefund K-1. Jetzt aus dem Gate **und** aus dem Abgleich
     ausgenommen; seine **Kosten** bleiben vollständig in der Kostenwahrheit.
  3. **R-3 (mittel):** Derselbe Diagnosepfad wurde als `nicht-zurechenbar` geführt und
     täuschte damit eine **Mandanten-Messlücke vor, die es nicht gibt**. Diagnose ist
     geteilte Infrastruktur → `global`.
  4. **R-4 (niedrig, latent):** `getRunCostReport` konnte denselben Aufruf **zwei
     Läufen** zurechnen, wenn sich Laufzeitfenster überlappen (heute durch den globalen
     Understanding-Lock 0 Fälle bei 51 Läufen, konstruktiv aber möglich). Zusätzlich
     galt ein Eintrag **ohne Id** dauerhaft als unzugeordnet. Beides behoben; die
     exakte Zuordnung per Laufkennung wird dabei nie von einem Zeitfenster verdrängt.
- **Branch/Commit/PR:** `claude/helmut-cost-measurement-4ietbr` · **PR #136**, auf
  `4aa15de` rebased (Basis enthält Punkt 16 und den Berliner Production-Sprint)
  (offen, wartet auf Review und Betreiberfreigabe — nicht selbst gemergt).
  Geänderte Dateien: `lib/helmut/cost-model.js` (neu) · `lib/helmut/storage.js` ·
  `lib/helmut/understanding.js` · `lib/helmut/scheduler.js` · `server.js` · `client.js` ·
  `scripts/kostenmessung-nachweis.js` (neu) · `scripts/kostenmessung-test.js` (neu) ·
  `scripts/admin-overview-test.js` · `docs/betrieb/kostenmessung.md` (neu) ·
  `docs/betrieb/env-inventar.md` · `docs/roadmap/phase_1_checkliste.md` · diese Datei.
- **Startprüfung (bei Sprintbeginn):** Arbeitsbaum sauber, Stand == `origin/main` ==
  `93006e8` (Merge #134). **Punkt 16 war zu diesem Zeitpunkt nicht gemergt** (Checkliste
  ⏳, Befund A-6 offen, kein Branch, kein PR, kein Commit). Der Betreiber hat das Git-Gate
  nach Vorlage dieses Befunds ausdrücklich freigegeben, weil damit **keine**
  Punkt-16-Telemetriearbeit existierte, die überschrieben werden konnte.
  `source_crawl_telemetry` und die Pfad-Statusmaschine wurden deshalb **bewusst nicht
  angefasst**; der Berlin-Sprint blieb unverändert.
- **Nachtrag 2026-07-26: Punkt 16 ist inzwischen gemergt** (PR #137, `4aa15de`), ebenso
  der Berliner Production-Sprint (PR #135). Der Punkt-17-Branch wurde auf diesen Stand
  **rebased**; die Zusage von oben hat gehalten und ist nachgeprüft:
  `lib/helmut/quellenarchitektur/`, `scripts/source-failure-test.js`,
  `docs/betrieb/quellenstoerungen.md`, `scripts/admin-source-ui-test.js`, `supabase/`,
  `vercel.json` und `helmut-flags.json` haben gegenüber `main` **0 Zeilen Diff**.
  Punkt 16 wurde an **einer** Stelle textlich berührt — der gemeinsamen
  `require("./lib/helmut/storage")`-Importzeile in `server.js`, an die beide Sprints
  angehängt haben. Aufgelöst als **Vereinigung** (79 Namen, keine Doublette):
  `listSourceCrawlTelemetry` aus Punkt 16 **und** `getRunCostReport`,
  `llmPriceProvenance`, `recordLlmUsage` aus Punkt 17. `source-failure-test` 160/160
  nach dem Rebase unverändert grün.
- **Zentraler Befund — die Kostenquelle war nicht die, die die Doku annahm.** Die
  relationale Tabelle `llm_usage` hat in Production **0 Zeilen**; die tatsächliche
  Kosten-/Auditquelle ist der `llmUsage`-Ring im Auth-Store-Blob (2 493 Einträge). Der
  Alt-Beleg in der Phase-1-Checkliste („Tages-/Laufkosten über `llm_usage`") war damit
  sachlich falsch.
- **Kosten je Lauf waren nicht messbar, nur rekonstruierbar.** `runId` war in **0 von
  1 290** Einträgen gesetzt — obwohl `source_crawl_telemetry.run_id` und
  `processRuns.runId` dieselbe Kennung seit jeher tragen. Der Sprint reicht die Kennung
  jetzt vom Scheduler bis in den Kostenlog durch; der Altbestand bleibt über das
  Zeitfenster rekonstruierbar und wird **als rekonstruiert gekennzeichnet** (0 mehrdeutige
  Zuordnungen bei 337 von 611 eindeutig zuordenbaren Alteinträgen).
- **Der ehrliche Kern:** `lib/helmut/cost-model.js` (rein, ohne I/O) trennt
  `gemessen` / `kosten-unbekannt` / `kein-provideraufruf` und
  `global` / `direkt` / `nicht-zurechenbar`. Die Altsummen rechneten einen als
  `"unknown"` protokollierten Betrag still als **0,00** — genau das ist jetzt
  ausgeschlossen. `0,00` erscheint nur noch, wo nachweislich **kein** Provideraufruf
  stattfand (1 277 von 2 493 Einträgen — abgewiesene und übersprungene Aufrufe).
- **Kostenwahrheit statt Scheingenauigkeit.** Die Preistabelle ist im Code selbst als
  „Schaetzwerte" deklariert, ohne Quelle und ohne Stand. **Kein Preis wurde geändert oder
  erfunden** (Preisrecherche war ausgeschlossen); stattdessen trägt jede Kostenangabe ihre
  Herkunft mit (`llmPriceProvenance()`), und der Betreiber belegt die Basis über
  `HELMUT_LLM_PRICE_SOURCE`/`HELMUT_LLM_PRICE_ASOF`.
- **Gemessene Kostenobergrenze, ehrlich abgegrenzt.** Der Deckel ist atomar und
  fail-closed und hat real gegriffen (2026-07-20: Zähler 100/100, **34** Abweisungen
  `daily-llm-budget-reached` + **4** über die Understanding-Reserve, alle ohne Kosten).
  Er **zählt aber Aufrufe, kein Geld**; Reservierungen werden bewusst nie freigegeben
  (misst also Reservierungen, keine bestätigten Kosten); der Per-Mandant-Deckel ist AUS
  (OP-03); und **alle Nicht-LLM-Kosten liegen außerhalb** — Supabase, Vercel,
  Crawl-Volumen, Push und DIP sind ungemessen und ungedeckelt (offene Kostenexposition).
- **Sicherheitsbefund behoben:** `/api/debug/pipeline-probe` sendete einen echten,
  token-verbrauchenden Azure-Aufruf **ohne** Reservierung **und ohne** Kostenlog — die
  einzige Stelle mit vollständig unsichtbaren Kosten. Der Aufruf wird jetzt als
  `callType: "pipeline-probe"` protokolliert; die Reservierung bleibt bewusst aus (eine
  Diagnose muss gerade bei erschöpftem Budget laufen — dieselbe Begründung wie beim
  `budgetExempt`-Pfad des KO-Backfills). Die Route ist secret-gated und auf 20 Aufrufe
  je 15 min limitiert; der volle Antwort-Body wird weiterhin **nicht** persistiert.
- **Betriebsnachweis, zweifach gedeckt.** Dieselben Zahlen entstehen unabhängig über
  read-only SQL gegen Production **und** über `scripts/kostenmessung-nachweis.js`
  (0,075587 / 0,125336 / 0,149161 USD für den 26./25./24.07.). Das Skript läuft live
  (Secrets nur aus `process.env`, Abbruch mit Exit 2 **vor** jedem Netzzugriff) oder
  offline gegen einen Auszug. Der verwendete Produktionsauszug wurde pseudonymisiert und
  **nicht** ins Repository übernommen.
- **Tests:** `kostenmessung-test` **128/128** (neu; 24 Prüfgruppen, u. a. kein falsches
  0,00 · Doppelzählung · Retry als echter Zusatzverbrauch · parallele Einträge ·
  Reservierungsabgleich in beide Richtungen · fehlende Preise · Währung · abgebrochene
  Läufe · Preisherkunft · Diagnose ohne Budgetwirkung · überlappende Laufzeitfenster ·
  Quelltext-Riegel für die Laufkennung) · `admin-overview` **104/104** (vorher 86) ·
  **Offline-Suite 153/153** (vorher 152/152) · **Browser-Smoke 32/32**.
  Die drei Review-Korrekturen sind **mutationsgeprüft**: jede der drei gezielten
  Rückmutationen (Doppelzähl-Sperre entfernt · Diagnose wieder budgetwirksam ·
  Laufkennung im Cron entfernt) wurde von der Suite erkannt.
  Zwei eigene Defekte fanden die Tests bereits vor dem ersten Commit
  (`Number(null) === 0` ließ einen fehlenden Zähler als „deckungsgleich" erscheinen;
  ein `= {}`-Default griff bei `null` nicht) — beide behoben.
- **Nicht getan (bewusst):** keine Production-Mutation · keine Migration · kein Flag ·
  kein Cron · kein Secret · keine Quelle, kein Paket, kein Abrufweg · **kein zweites
  Abrechnungssystem** (die vorhandene Telemetrie wurde erweitert, keine neue Tabelle) ·
  **keine Verteilung globaler Kosten** auf Mandanten · **keine Preisrecherche** und keine
  aus dem Gedächtnis gesetzten Preise · Punkt-16-Gebiet unberührt.
- **Verbleibende Grenzen, ehrlich:** die bekannten Kosten sind wegen K-1 eine
  **Untergrenze** · die Euro-Größe ist wegen K-2 eine berechnete, keine belegte ·
  zwischengespeicherte und Reasoning-Tokens werden nicht gelesen (K-3) · Azure und OpenAI
  sind im Log nicht unterscheidbar (K-5) · **Kosten je Mandant bleiben bis OP-03 offen**.

**Sprint „Punkt 14 (2. Durchgang): Berlin fachlich neutralisieren, aktuell verifizieren" — Nachweis**

- **Auftrag:** die offenen Bedingungen des letzten Go-/No-Go-Berichts belastbar erfüllen oder
  objektiv als nicht erfüllbar dokumentieren — **ohne** Production-Aktivierung. **Ergebnis: erfüllt
  für V2, V3, Last und Neutralitätsnachweis; V1 bleibt objektiv offen** (Production-Mutation).
- **Startprüfung bestanden:** PR #133 gemergt (`merged: true`, 15:35 UTC), lokaler Stand ==
  `origin/main` == `299470a`, Arbeitsbaum sauber, `2c77114` Vorfahre von `main`, beide
  Pflichtchecks von #133 grün.
- **Phase 1 — Neutralität ist jetzt ausführbar, nicht behauptet.** `seeds/berlin-neutralitaet.js`
  prüft einen beliebigen Bestand; **derselbe** Prüfer läuft über das Code-Abbild und über den
  gemessenen Datenbankbestand. Ergebnis: Code **neutral** (0 Verstöße, 10 Zuordnungen eingestuft) ·
  Production-Ist **nicht neutral**, 3 benannte Verstöße (`rp-be-partei_pilot`,
  `rp-be-fraktion_pilot`, `rp-be-person_pilot` am `is_base`-Paket) · **nach Block A neutral** — die
  Umhängung genügt und nichts sonst. Erkennung über **zwei unabhängige Merkmale** (Herausgebertyp
  *und* Pflichtklasse), damit eine falsch gepflegte Spalte die Prüfung nicht umgeht. Alle zehn Wege
  sind einer der acht Kategorien zugeordnet; **keiner** blieb `unklar`.
- **Phase 2 — die entscheidende Entdeckung: zwei Wege sind veraltet.** Die Neuverifikation lief auf
  einem Actions-Runner mit offenem Egress (die Agenten-Sitzung selbst hat keinen, `CONNECT` → 403).
  Dafür wurde `sprint9b-verify.yml` um eine Eingrenzung `S9B_ONLY` erweitert, damit die Prüfung eng
  begrenzt laufen kann statt über alle 24 Wege. **Run 30208901908** (10/10, Kontroll-Abruf 200/200)
  und **Run 30208997672** (Gegenprobe, identisch):

  | Weg | HTTP | jüngstes Item | Folge |
  |---|:--:|:--:|---|
  | `rp-be-landesregierung` · `rp-be-regionale_leitmedien` · `rp-rbb24-politik` | 200 | **0 Tage** | aktivieren |
  | `rp-be-staatskanzlei` | 200 | **14 Tage** | aktivieren, unter Beobachtung |
  | `rp-be-landesfraktionen` | 200 | **41 Tage** | **gesperrt** |
  | `rp-be-landesparlament` (kritisch) | 200 | **156 Tage** | **gesperrt** |

  `rp-be-landesparlament` antwortet sauber und parst 20 Items — Telemetrie hätte ihn dauerhaft als
  `ok` gemeldet. Neues **Frischegate** (≤ 7 frisch · ≤ 30 Beobachtung · darüber veraltet) entscheidet
  das jetzt ausführbar. **Aktivierungsset 6 → 4.**
- **Pflichtklassen ehrlich neu gezählt.** Die alte Zählung kannte nur „liefert/liefert nicht" und
  zählte auch Klassen mit, die bloß als Nebenprodukt einer fremden Suchanfrage mitlaufen. Neu drei
  Zustände: **4 eigenständig** (landesregierung, staatskanzlei, regionale_leitmedien,
  oer_landesberichterstattung) · **1 mitabgedeckt** (ministerien) · **7 ohne liefernden Weg**.
  **Berlin startet damit ohne jede amtliche parlamentarische Quelle** — die größte fachliche Lücke,
  benannt statt kaschiert. Zum Vergleich: das alte 6er-Set war real 6 eigenständig + 2 mitabgedeckt,
  die Zusage „8 von 12 liefern" verdeckte also zwei nur formal erfüllte Klassen.
- **Phase 3 — Profilweg, zwei Befunde, kein Profil angelegt.**
  **P-1:** die V3-Zählabfrage des Runbooks belegt keine Aktivierungsberechtigung. Sie zählt Zeilen;
  aktivierungsberechtigt ist ein Profil erst nach `validateProfile`, und die liest die **gemappte**
  Form. Eine rohe `mandate_profiles`-Zeile wird mitgezählt, ist aber `nicht_bereit` und trägt **0**
  zur Referenzzählung bei — `berlin-basis` bliebe **still inaktiv**, obwohl die Prüfung 1 meldet.
  Geschärfte Abfrage ergänzt. **P-2:** ein Berliner Profil braucht **zwei** Zeilen (`profiles` +
  `mandate_profiles`); ohne die erste ist `impact.kannRadar` false. Das Abnahmeprofil ist als
  **Testmandat** benannt und trägt `Fraktionslos` — keine reale Person, keine Parteibindung.
  Rückweg beginnt mit Deaktivieren, nicht Löschen.
- **Phase 4 — Lastmodell korrigiert, beide Terme der Alt-Rechnung waren falsch.** Gemessen statt
  angenommen: Verarbeitung **~40 KO/Tag** (nicht 15–20) · Eingang heute **277 Rohdokumente/Tag**,
  davon nur **13 %** mit KO verknüpft (Rohdokumente sind keine Understandings) · echte Obergrenze
  ist das **LLM-Tagesbudget**: Mittel 64/100, am 20.07. **100/100** · **5** Crawl-Vollrunden/Tag
  statt der angenommenen 2 (Abruflast um Faktor 2,5 unterschätzt) · Pending-Rückstand wächst nicht.
  Berlin steuert realistisch **4,6–11,4 Dokumente/Tag** bei (**1,6–4,1 %** des Eingangs), also
  **+1 bis +2,6 LLM-Aufrufe/Tag**. Im Mittel reicht das Budget; **am gemessenen Spitzentag nicht** —
  beides steht so im Modell. Gewählte Gegenmaßnahme ist die **einfachste sichere**: gestaffelte
  Aktivierung (erst 2 Direktfeeds mit 0 Google-Requests, nach einem vollen Crawl-Zyklus die 2
  Google-Wege). **Keine** `max_items`-Änderung — der gemessene Median von 1,14 Dokumenten je Quelle
  und Tag zeigt, dass `max_items` außerhalb des Erstlaufs nicht bindet. Keine neue Queue-Architektur.
- **Rollback gehärtet (adversarialer Befund).** Stufe 1 und 2 setzten bisher nur das *aktuelle*
  Aktivierungsset zurück. Nach der Reduktion 6 → 4 hätte ein Rollback genau die zwei Wege aktiv
  gelassen, die eine ältere Planfassung scharfgeschaltet hätte — und sich trotzdem als vollständig
  gemeldet. Beide Stufen setzen jetzt **alle 7** Wege des Basispakets zurück.
- **Tests:** `berlin-neutralitaet` **109/109** (neu; gegen **5 gezielte Mutationen** geprüft — jede
  wurde erkannt, 2–10 Fehlschläge je Mutation) · `berlin-aktivierung` **123/123** ·
  `seed-drift` grün (auch die gestaffelten SQL-Blöcke sind byte-genau an den Generator gebunden) ·
  **Offline-Suite 152/152** · **Browser-Smoke 32/32**.
- **Nicht getan (bewusst):** keine Production-Mutation — ausschließlich `select`-Abfragen · kein
  Flag gesetzt · kein SQL ausgeführt · kein Profil angelegt · keine Migration · keine
  Seed-Einspielung · keine Cron-/Lock-/Telemetrie-/Secret-Änderung · Brandenburg, Niedersachsen und
  alle Bundesquellen unverändert · kein PARDOK-Cutover · **keine Quelle erfunden** (die zwei
  veralteten Wege wurden gesperrt, nicht durch geratene Ersatzadressen ersetzt).
- **Verbleibende Grenzen, ehrlich:** Berlin startet ohne amtliche parlamentarische Quelle · die
  Personenquelle `rp-be-person_pilot` steht nach Block A im Parteipaket, widerspricht aber weiterhin
  dem Prinzip „Personenquellen entstehen zur Laufzeit aus dem Profil" (nicht geändert, weil das die
  in Punkt 13 belegte Vollständigkeit von `die-linke-berlin` aufbrechen würde) · das Monitoring ist
  definiert, aber nie gegen einen echten Berliner Lauf erprobt · die Verifikation ist eine
  Momentaufnahme und gehört unmittelbar vor die Aktivierung wiederholt.
- **Empfehlung: Go mit Bedingungen** für das reduzierte Set — Block A zuerst, Sicherung nach V6,
  nur Stufe 1 im ersten Schritt, Neuverifikation bei mehr als 14 Tagen Abstand, und die bewusste
  Annahme der fehlenden parlamentarischen Quelle. **Kein Go** für die zwei veralteten Wege,
  `rp-be-plenum`, `die-linke-berlin` und jede Brandenburg-Änderung.

**Sprint „Phase-1-Punkt 14: Berlin als laufende Versorgung aktivieren" — Nachweis**

- **Auftrag:** Berlin bis zur sicheren Production-Aktivierungsreife bringen; die Aktivierung selbst
  war ausdrücklich verboten. **Ergebnis: Aktivierungsreife erreicht, Production unverändert.**
- **Zwei echte Sperrlücken gefunden und behoben** (beide hätten bei der Aktivierung zugeschlagen):
  1. **`activation_mode='manual'` war keine Sperre.** `model.isPathActive` prüft nur
     `dev_only`/`paused`/`archived`; ein manueller Weg in einem aktiven Paket galt als aktiv. Das
     fiel nie auf, weil das Landesmodul-Gate vorher greift. Beim Öffnen des Gates wären **alle 10**
     vorbereiteten Berliner Wege auf einmal gelaufen — inklusive der Partei-/Personenquellen und
     des ~48-MB-PARDOK-Downloads. Neue Plan-Regel 4b im **ausführenden** Plan
     (`buildRelationalCrawlPlan`), nicht in `model.isPathActive`. Wirkung auf den Bund: **keine** —
     0 Bundeswege tragen `manual` (gemessen: 18 manuelle Wege, alle BE/BB).
  2. **Das Gate war global.** Berlin und Brandenburg konnten nur gemeinsam geöffnet werden. Jetzt
     je Land: `HELMUT_LANDESMODULE` (Default **leer**, fail-closed, **kein** Sammel-Schlüsselwort;
     `alle`/`*` sind wirkungslos). Auf der Datei-Allowlist, damit eine Freigabe ein reviewbarer,
     sofort rollbarer Diff ist. In `helmut-flags.json` **nicht** gesetzt.
- **Geplante Aktivierung: 6 liefernde Wege** (4 Google-News-Suchwege + 2 Direktfeeds), Ziel je Weg
  `healthy`/`auto`. Pflichtklassen ehrlich: **8 von 12 liefern, 4 nicht** — `plenum`,
  `drucksachen`, `schriftliche_anfragen` und `gesetzgebung` hängen alle an `rp-be-plenum`, dessen
  PARDOK-Dispatch die harte Invariante `items: []` in **jedem** Modus hält (Live-Modus bewusst nicht
  implementiert). Der Weg wird deshalb **nicht** aktiviert; er würde je Crawl ~48 MB laden und
  0 Dokumente liefern. `die-linke-berlin` bleibt `prepared` (2 seiner 3 Wege sind bot-gesperrt, 429).
- **Harter Blocker (V1):** `berlin-basis` ist das `is_base`-Pflichtpaket **jedes** Berliner
  Landtagsmandats und trägt in der Datenbank weiterhin `rp-be-partei_pilot`,
  `rp-be-fraktion_pilot`, `rp-be-person_pilot` (Befund **A-3**, am 2026-07-26 nachgemessen). Eine
  Aktivierung ohne Neutralisierung gäbe einem Mandat **jeder** Partei die Quellen **einer** Partei
  und die Nachrichtensuche zu **einer namentlich benannten realen Person** (`CLAUDE.md` §4.2).
  Der Landesmodul-Seed würde das beheben, würde dabei aber auch eine Brandenburg-Zeile umhängen —
  deshalb ist die Umhängung hier **Berlin-genau** als eigenes SQL formuliert (Block A).
- **Last, aus dem Crawler abgeleitet statt geschätzt:** +6 Wege je Lauf · **6–198 Abrufe je Lauf** ·
  **12–396 je Tag** (2 Crawl-Crons) · bis **196** davon gegen `news.google.com` · bis **96** neue
  Rohdokumente je Lauf, **192** je Tag · **0 LLM-Aufrufe durch den Crawl**. Annahmen: `max_items`=16,
  je Google-Item 0–3 Auflösungs-Requests. **Keine Behauptung „kostenlos":** die Google-Requests
  verschärfen Befund B1 und OP-15, und bis zu 192 Rohdokumente/Tag treffen auf ein
  Understanding-Tagesbudget von ~15–20 — der Rückstand B2 wächst.
- **Rollback in drei Stufen, getestet:** Stufe 0 = Flag leeren (Sekunden, **kein** DB-Schreibzugriff,
  der Regelweg) · Stufe 1 = SQL, dreht die Aktivierung zurück und **lässt die Neutralisierung
  bestehen** · Stufe 2 = zusätzlich Block A zurück, zeilengenau auf den gemessenen Ist-Zustand.
  Keine Stufe löscht Dokumente, Knowledge Objects oder Telemetrie — die Auditspur bleibt.
- **Tests:** `berlin-aktivierung` **123/123** (neu) · `seed-drift` grün (Aktivierungs-SQL ist
  byte-genau an seinen Generator gebunden) · `source-mode` 51/51 · `profile-packages` 69/69 ·
  `paketzuweisung-nachweis` 147/147 · `env-inventar` grün · **Offline-Suite 151/151** ·
  **Browser-Smoke 32/32**. Der Rollback-Test führt das committete SQL wirklich aus; sein
  Mini-SQL-Ausführer bricht bei jeder unbekannten Statementform hart ab.
- **Adversarialer Review (24 Punkte), drei nennenswerte Befunde:** die 4 Berliner Google-Wege
  werden vom Google-Gate erkannt (Drossel/Retry/Breaker greifen), die 2 Direktfeeds nicht
  (Provider-Trennung bleibt) · `retrieval_paths.parser` ist **Metadatum**: `toCrawlerSource`
  entscheidet allein über `method` — eine Parser-Korrektur ändert das Abrufverhalten nicht ·
  hinter dem Crawl gibt es **keinen** zweiten Berlin-Filter, die Kette bricht nicht still ab
  (alle „Berlin"-Treffer in Lage/Radar/Briefing/Push sind `Europe/Berlin`).
- **Nicht getan (bewusst):** keine Production-Mutation · kein Flag gesetzt · kein SQL ausgeführt ·
  kein Profil angelegt · keine Migration · keine Seed-Einspielung · keine Cron-/Lock-/Telemetrie-/
  Secret-Änderung · Brandenburg, Niedersachsen und alle Bundesquellen unverändert · kein
  PARDOK-Cutover · keine Quelle erfunden.
- **Verbleibende Grenzen, ehrlich:** die Live-Verifikation der 6 Wege stammt vom **2026-07-14** —
  aus dieser Sitzung ist kein Egress möglich (`CONNECT` → `403`, auch für `tagesspiegel.de` und
  `rbb24.de`), deshalb ist die Neuverifikation als Bedingung **V2** geführt · 4 der 6 Wege sind
  Google-News-Suchwege, keine amtlichen Direktfeeds · ein Berliner Testmandat existiert nicht, der
  Kettennachweis ist bisher rein lokal · `rp-rbb24-politik` hängt in **beiden** Landespaketen und
  bringt auch Brandenburg-Inhalte in den Rohstrom (benannt, im Plan als `mehrlaendrig` ausgewiesen,
  im Monitoring getrennt gemessen — es wird dadurch **kein** Brandenburg-Paket, -Weg oder -Profil
  aktiv).
- **Nächster Schritt:** Betreiberentscheidung über den Go/No-Go-Bericht. Bei „Go mit Bedingungen"
  folgt ein **eigener** Sprint für die Aktivierung und den Beweislauf (empfohlene
  Beobachtungsdauer: **3 Tage = 6 Crawl-Läufe**; ein Weg gilt als tragfähig ab 4 von 6 `ok`).
  Runbook: [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md).

**Sprint „Punkt 13 — Abschlusskorrektur: Niedersachsen, nicht-anwendbar, Fraktionen" — Nachweis**

- **Auslöser:** drei offene Punkte des vorigen Abschlusses. Punkt 13 war damit **nicht** vollständig
  abgeschlossen: `regional-niedersachsen` hatte keine benannten Herausgeber, die beiden nicht
  erfüllbaren Pflichtklassen von `die-linke-brandenburg` waren nur als Freitext begründet, und die
  Fraktionsvollzähligkeit war weiterhin katalogrelativ — derselbe Fehlermodus wie bei den
  Ausschüssen.
- **Ergebnis: alle 8 Pakete liegen in einer abgeschlossenen Kategorie** — **7 vollständig** +
  **1 vollständig mit belegten Ausnahmen**, **0 teilweise**, **0 blockiert**.

  | Paket | Ergebnis |
  |---|---|
  | `bund-basis` | vollständig (7/7 Klassen · 24/24 Ausschüsse · **5/5 Fraktionen**) |
  | `arbeit-und-soziales` | vollständig (10/10) |
  | `die-linke-bund` | vollständig (1/1) |
  | `regional-niedersachsen` | **vollständig (6/6)** — benannte Basis vorbereitet und inaktiv |
  | `berlin-basis` · `brandenburg-basis` | vollständig (je 12/12) |
  | `die-linke-berlin` | vollständig (3/3) |
  | `die-linke-brandenburg` | **vollständig mit belegten Ausnahmen** (1/3 besetzt, 2 geprüft nicht anwendbar) |

- **Teil A — `regional-niedersachsen` fachlich repariert, ohne Crawl-Kosten.** Ursache des Befunds:
  die Regionalmedien der Region **lagen im Katalog**, wurden aber von `keepCuratedSource` entfernt
  (`media` erst ab `priority >= 64`, regionale Medien tragen 52–60). Die Sollmenge unterscheidet
  jetzt sechs Klassen; erfüllt durch **7 benannte Wege**, davon **5 Bestandsquellen** (HAZ, NDR,
  Braunschweiger Zeitung, Salzgitter Zeitung, regionalHeute — identische URL und Query, nur
  angereichert) und **2 neu angelegte** für die im Katalog fehlende amtliche Landesebene
  (`landtag-niedersachsen.de`, `niedersachsen.de`, beide `site:`-gebunden; ein Direktfeed-Pfad ist
  von hier aus nicht verifizierbar und wäre geraten). Beleglage jetzt **2 amtlich · 5
  journalistisch · 4 Aggregator** statt 0 · 0 · 4.
  **Nicht aktiviert — drei unabhängige, getestete Riegel:** der Crawler ruft nur Quellen mit
  `active` ab · die Profilauswahl des Fallback-Pfads schließt `active === false` aus · der
  relationale Plan schließt `status='paused'` aus (Regel 4). Gemessen: Fallback **0 von 7**,
  relationaler Plan **0 von 7** (Grund `nicht-reaktiviert (status=paused)`). Der `purpose` trennt
  jetzt Region von Fachthema.
- **Teil B — „nicht anwendbar" ist überprüfbar statt Freitext.** Jede Ausnahme trägt stabile
  Kennung, politische Begründung, Wahlperiode, Geltungsbereich, amtlichen Beleg **und** eine
  `voraussetzung`, die gegen die kanonische Parlamentszusammensetzung geprüft wird. Amtliche
  Grundlage: Landtag Brandenburg, 8. Wahlperiode — 4 Fraktionen (SPD 32, AfD 30, BSW 14, CDU 12);
  alle weiteren Landeslisten blieben unberücksichtigt, darunter Die Linke (Landeswahlleiterin,
  Endergebnis LTW 22.09.2024 + Landtagshandbuch 8. WP). Neue vierte Ergebniskategorie
  `vollstaendig_mit_belegten_ausnahmen`; eine **unbestätigte** Ausnahme erzeugt
  `nicht-anwendbar-unbegruendet` und lässt die Klasse als offene Lücke stehen, eine Ausnahme für
  eine besetzte Klasse `nicht-anwendbar-ohne-not`. Kehrt die Partei in den Landtag zurück, wird die
  Ausnahme unbegründet und die Prüfung verlangt eine bewusste Aktualisierung.
- **Teil C — Fraktionssollmenge extern verankert, und die Alt-Angabe war falsch.** Gemessen wurde
  „8 von 8 Fraktionen". Fachlich richtig sind **5**: FDP (4,3 %) und BSW (4,97 %) sind im
  21. Bundestag **nicht vertreten**, der SSW hat mit **einem** Mandat keinen Fraktionsstatus
  (Minderheitenpartei, von der Fünf-Prozent-Hürde befreit). Amtliche Grundlage: Sitzverteilung des
  21. Deutschen Bundestages (630 Sitze) — CDU 164 + CSU 44 = 208 · AfD 152 · SPD 120 ·
  Bündnis 90/Die Grünen 85 · Die Linke 64 · SSW 1. **Keine Quelle entfernt:** die drei Quellen
  bleiben im Katalog und im Pflicht-Basispaket, tragen aber jetzt die Klasse
  `parteien_ohne_fraktionsstatus` (zusätzlich, nicht Pflicht). Alle 8 `fraction-`Wege behalten
  Status und Aktivierungsmodus — **0 zusätzliche und 0 entfallene Abrufe**.
- **Weitere gefundene Fehler (in diesem Sprint behoben):**
  1. **Eigene Fehlannahme korrigiert:** ich hatte die Inaktivität zunächst auf einen `active`-Filter
     in `scheduler.js` gestützt, der dort tatsächlich `selectLageCheckSources` betrifft.
     `sourceAllowedForProfile` prüfte `active` **nicht**. Die eigentliche Garantie lag beim
     Crawler-Filter (`sources.filter((source) => source.active)`), es wäre also kein Abruf
     entstanden — die Wege hätten aber in der Profilauswahl gestanden. Riegel ergänzt und alle drei
     strukturell getestet.
  2. **Der gezielte Seed-Restore deckte neue Herausgeber nicht ab.** Seed 1 legt jetzt 7 neue
     `publishers`-Zeilen an; ohne Erweiterung wären sie nach einem Restore als Waisen
     stehengeblieben (gefangen von der Byte-Gleichheitsprüfung, Gruppe 8). Sie werden jetzt
     *guarded* entfernt — nur wenn kein Abrufweg sie mehr referenziert. Die Invariante des Tests
     wurde dabei **präzisiert, nicht aufgeweicht**: `geographies`/`political_entities` werden gar
     nicht angefasst, jedes `publishers`-Delete muss die `not exists`-Absicherung tragen.
  3. **Der Mini-SQL-Executor** des Restore-Tests führt die neue Guard-Form wirklich aus, statt sie
     zu überspringen; das Backup-Fixture sichert `publishers` mit (wie der echte Export).
- **Neue ausführbare Zusicherungen:** `scripts/parlamentszusammensetzung-test.js` — **65/65** in
  7 Gruppen mit **15 Negativkontrollen**: fehlende Fraktion · zusätzliche nicht vertretene Partei ·
  Mandat ohne Fraktionsstatus als Fraktion · **Tausch bei Zahlengleichstand (5 bleibt 5)** ·
  Umbenennung · **falscher politischer Typ** · Eintrag ohne stabile Kennung · doppelte Kennung ·
  unbekanntes Parlament · Ausnahme für eine Partei **mit** Fraktion · falsche Wahlperiode · bloßer
  Freitext · fehlender Beleg · unbekannte Prüfart · missbräuchliche Ausnahme rettet kein Paket.
  Dazu die drei Inaktivitäts-Riegel und die Wahlperioden-Konsistenz beider Sollmengen.
  In `paketvollstaendigkeit-test.js` neu: rein aggregatorbasiertes Regionalpaket wird abgelehnt ·
  fehlender Wahlkreis-Herausgeber wird erkannt · fehlende amtliche Ebene wird erkannt · die
  7 benannten Wege sind vorbereitet · Niedersachsen ist nicht aktiviert (mit Wirksamkeitsnachweis).
- **Tests (echte Zahlen):** `parlamentszusammensetzung` **65/65** · `paketvollstaendigkeit`
  **99/99** · `bundestag-ausschuesse` **36/36** · `source-architecture` **99/99** ·
  `profile-packages` **69/69** · `seed-restore` **46/46** · `seed-drift` grün ·
  `admin-source-report` **56/56** · `sprint6-pilot-migration` **46/46** ·
  `landesmodule-kandidaten` **77/77** · `paketzuweisung-nachweis` **147/147** ·
  `tenant-neutrality` **39/39** · **Offline-Suite 150/150 grün**. Generatorlauf zweimal
  wiederholt: beide Seeds byte-identisch; der Landesmodul-Seed ist gegen `main` unverändert.
- **Production-Sicherheitsnachweis:** keine Production-Änderung, keine Migration, keine
  Seed-Einspielung, keine Aktivierung, keine Änderung an Cron, Locks, Telemetrie, Flags oder
  Secrets. Die 5 `always_on`-Kernwege sind unverändert. Berlin/Brandenburg: alle 4 Landespakete
  `prepared`, alle 18 Landeswege `needs_review` + `manual`, **0 aktiv**, im Plan mit
  `landesmodul-gesperrt` ausgeschlossen. Niedersachsen: 7 Wege `paused` + `manual`, **0 aktiv**.
- **Wirkung einer späteren freigegebenen Seed-Einspielung, getrennt betrachtet:** Metadaten
  (`required_classes`, `purpose`, 28 korrigierte Namen — `name` wird von der `on-conflict`-Klausel
  gar nicht aktualisiert) = **0 Laufzeitwirkung** · **+9** Paketzuordnungen = 0 · **+8** Abrufwege,
  davon 7 dauerhaft `paused` = **+1 Abruf je Crawl** (der 24. ständige Ausschuss; 145 → 146 Wege,
  +0,7 %) · **+7** Herausgeber = 0. Der Restore dreht alles zurück, Wege und Herausgeber jeweils
  guarded. Runbook §4/§10a–§10c nachgezogen.
- **Verbleibende Grenzen (unverändert ehrlich benannt):** der Volltext der Drucksache 21/150 wurde
  nicht gelesen (`bundestag.de`/`dserver.bundestag.de` aus dieser Sitzung nicht abrufbar, `403` auf
  `CONNECT`) — die 24 Ausschussbezeichnungen stammen aus amtlichen Ausschuss-Tagesordnungen der
  21. WP, jeder Eintrag nennt seine Fundstelle · ob die laufende Wahlperiode **heute noch** die 21.
  bzw. 8. ist, kann offline nicht geprüft werden; ein Wechsel macht die Prüfungen rot statt still
  falsch · die Aktivierung der benannten Niedersachsen-Basis (+7 Abrufe je Crawl) und das
  Nachziehen der amtlichen Namen in die Datenbank bleiben freigabepflichtig.
- **Nicht getan (bewusst):** kein Production-Zugriff · kein Seed eingespielt · keine Migration ·
  keine Quelle erfunden (die 2 neuen Wege nutzen verifizierte amtliche Domains über den bereits
  verwendeten Suchweg) · keine Quelle entfernt · keine Kuratierungsschwelle global angehoben ·
  keine Aktivierung von Niedersachsen, Berlin oder Brandenburg · keine Cron-/Lock-/Telemetrie-/
  Flag-/Secret-Änderung · keine Anforderung entfernt, um einen grünen Test zu erzeugen.

**Sprint „Punkt 13 — Nachtrag: Ausschuss-Sollmenge extern verankern" — Nachweis**

- **Auslöser:** externe Prüfung des Betreibers. Der 21. Deutsche Bundestag hat **24** ständige
  Ausschüsse (Einsetzungsbeschluss vom 15.05.2025 auf Grundlage der **Drucksache 21/150** vom
  13.05.2025). Der erste Punkt-13-Abschluss arbeitete mit **23** und war damit nur
  **katalogrelativ** bewiesen — das genügt dem Abnahmekriterium nicht. Punkt 13 wurde
  zwischenzeitlich auf „teilweise abgeschlossen" zurückgesetzt und ist erst mit dieser Korrektur
  wieder grün.
- **Der fehlende Ausschuss:** **Ausschuss für Wahlprüfung, Immunität und Geschäftsordnung**
  (§ 128 GO-BT, 14 Mitglieder). Er war im Katalog **überhaupt nicht vorhanden** — kein Abrufweg,
  keine Zuordnung, keine Erwähnung.
- **Ursache der Abweichung 23 statt 24** (kein Zählfehler, sondern zwei fehlende Verankerungen):
  1. `bundestagCommitteeSources` war eine **handgepflegte Politikfeld-Auswahl**, nie ein Abgleich
     gegen den Einsetzungsbeschluss. Ein Ausschuss ohne Sachpolitikfeld — parlamentarische
     Selbstorganisation — fiel durch das Raster.
  2. Die Vollzähligkeitsregel leitete ihre Sollmenge **aus demselben Katalog** ab und war damit
     per Konstruktion erfüllbar: 23 von 23, ohne zu wissen, dass 24 richtig ist.
- **Zusätzlich gefunden: neun Bezeichnungen/Zuschnitte aus der 20. Wahlperiode.** Darunter zwei
  echte Zuschnittwechsel: Bildung liegt in der 21. WP beim **Ausschuss für Bildung, Familie,
  Senioren, Frauen und Jugend**, Forschung bildet den eigenen **Ausschuss für Forschung,
  Technologie, Raumfahrt und Technikfolgenabschätzung**. Ebenfalls korrigiert: Landwirtschaft,
  Ernährung und Heimat · Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit · Recht und
  Verbraucherschutz · Digitales und Staatsmodernisierung · Wohnen, Stadtentwicklung, Bauwesen und
  Kommunen · Sport und Ehrenamt · die Angelegenheiten der Europäischen Union · sowie die fünf
  Kurzformen (Verteidigungs-, Finanz-, Haushalts-, Auswärtiger, Petitionsausschuss).
- **Korrektur an der kanonischen Quelle, nicht am Testwert:**
  - **Neu:** `lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse.js` — Wahlperiode,
    Einsetzungsbeschluss und die 24 Ausschüsse mit stabiler Kennung, amtlicher Bezeichnung und je
    eigenem amtlichen Fundstellenhinweis. Wird **nicht** aus dem Katalog abgeleitet.
  - **Katalog:** alle 24 Ausschussquellen holen ihren Namen aus der Sollmenge und tragen eine
    `ausschussKey`-Kennung; der fehlende 24. Ausschuss ist als `rp-committee-wahlpruefung`
    ergänzt — derselbe Google-News-Suchweg wie die anderen 22, Suchbegriffe strikt aus der
    amtlichen Bezeichnung. **Keine erfundene Quelle, keine erfundene URL.**
  - **Katalog-Ids eingefroren**, auch wo der Slug nicht mehr passt (`committee-bildung` trägt
    jetzt den Forschungsausschuss). Eine Id-Änderung hätte beim Seed-Einspielen eine neue
    `retrieval_paths`-Zeile angelegt und die alte als weiter gecrawlte Waise im Pflichtpaket
    zurückgelassen.
  - **Erkennung umgestellt** auf `ausschussKey` statt Namensmuster `^Ausschuss ` — fünf der 24
    amtlichen Bezeichnungen beginnen nicht mit „Ausschuss " und wären ab jetzt übersehen worden.
  - **Vollzähligkeitsregel** prüft gegen die externe Sollmenge (24) und nennt die Wahlperiode.
- **Zweiter behobener Defekt (durch die Korrektur aufgedeckt):** Seed 1 legt jetzt erstmals einen
  **neuen Abrufweg** an. Der gezielte Restore (`scripts/seed-restore-sql.js`) deckte diesen Fall
  nicht ab und hätte die Zeile stehen gelassen — gefangen von der Byte-Gleichheitsprüfung des
  Restore-Tests, nicht von einer Annahme. Er entfernt sie jetzt *guarded* (nur wenn keine
  `package_paths`-Zeile sie mehr referenziert, wegen `on delete cascade`), mit eigener
  Vorprüfung und eigener Nachprüfung. Der Mini-SQL-Executor des Tests führt die neue
  Guard-Form wirklich aus, statt sie zu überspringen.
- **Neue extern verankerte Zusicherung:** `scripts/bundestag-ausschuesse-test.js` — **36/36**.
  Sichert ab: Wahlperiode = 21 · Sollmenge = exakt 24 · Kennungen und amtliche Bezeichnungen
  festgeschrieben, jede mit Fundstelle · Katalog == Sollmenge · **sechs Negativkontrollen**:
  fehlender Ausschuss, zusätzlicher veralteter Ausschuss der 20. WP, **Tausch bei
  Zahlengleichstand (24 bleibt 24)**, Umbenennung, Zusammenlegung, Quelle ohne Kennung — jede
  einzeln rot. Zahlengleichheit allein rettet nirgends.
- **Tests (echte Zahlen):** `bundestag-ausschuesse` **36/36** · `paketvollstaendigkeit`
  **91/91** · `source-architecture` **98/98** · `profile-packages` **69/69** · `seed-restore`
  **43/43** · `seed-drift` grün · `admin-source-report` **56/56** · `sprint6-pilot-migration`
  **46/46** · `landesmodule-kandidaten` **77/77** · `paketzuweisung-nachweis` **147/147** ·
  `tenant-neutrality` **39/39** · **Offline-Suite 149/149 grün**. Generatorlauf zweimal
  wiederholt: beide Seeds byte-identisch; der Landesmodul-Seed ist gegen `main` unverändert.
- **Ergebnis der Vollständigkeitsprüfung unverändert:** 6 vollständig · 2 belegt teilweise ·
  0 blockiert. `bund-basis` deckt jetzt **24/24** ständige Ausschüsse ab (vorher 23/23 gegen eine
  zu kleine Sollmenge).
- **Production-Sicherheitsnachweis:** keine Production-Änderung, keine Migration, keine
  Seed-Einspielung, keine Berlin-/Brandenburg-Aktivierung, keine Änderung an Cron, Locks,
  Telemetrie, Flags oder Secrets. Die 5 `always_on`-Kernwege sind unverändert; der neue Weg ist
  `needs_review` + `auto`, **nicht** `always_on`, **nicht** `is_critical`. Der Live-Crawlpfad baut
  im Modus `on` weiterhin aus DB-Zeilen und importiert weder `packageKeysForSource` noch
  `buildFullModel` (Strukturriegel im Test).
- **Ehrlich benannte Laufzeitwirkung nach der freigabepflichtigen Seed-Einspielung:** **ein**
  zusätzlicher Google-News-Abruf je Crawl (145 → 146 Wege für ein voll versorgtes Profil,
  +0,7 %); die Google-Konzentration (Befund B1) steigt um einen Weg. Soll-Zahlen im Seed jetzt
  **145** Abrufwege und **147** Zuordnungen; gegen die gemessene Production **+1** Abrufweg und
  **+2** Zuordnungen. `betrieb/quellen-seed-einspielung.md` §4/§10b ist nachgezogen.
- **Ehrliche Grenze:** Der **Volltext der Drucksache 21/150 wurde nicht gelesen** —
  `bundestag.de` und `dserver.bundestag.de` sind aus der Agentensitzung nicht abrufbar (die
  Netzrichtlinie antwortet `403` auf `CONNECT`, zusätzlich Bot-`403` auf den HTML-Seiten; dieselbe
  Sperre wie bei `rp-bundestag`). Die 24 Bezeichnungen stammen aus amtlichen
  Bundestagsdokumenten der 21. Wahlperiode, überwiegend aus **Ausschuss-Tagesordnungen**
  (`bundestag.de/resource/blob/…`), die jede Bezeichnung wörtlich im Kopf tragen; jeder Eintrag
  der Sollmenge nennt seine Fundstelle. Ein direkter Abgleich gegen 21/150 bleibt empfohlen.
  **Überholt:** die damals noch katalogrelative Fraktionsvollzähligkeit ist im Abschlusssprint
  oben extern verankert — und die Angabe „8/8" war fachlich falsch (richtig: 5).
- **Nicht getan (bewusst):** kein Production-Zugriff · kein Seed eingespielt · keine Migration ·
  keine Quelle außer dem belegten 24. Ausschuss hinzugefügt · keine Katalog-Id geändert · keine
  Kuratierungsschwelle angehoben · keine Berlin-/Brandenburg-Aktivierung · keine Cron-/Flag-/
  Secret-Änderung · keine Abschwächung eines Kriteriums, um Grün zu erzeugen.

**Sprint „Phase-1-Punkt 13: Vollständigkeit jedes Quellenpakets" — Nachweis**

- **Auftrag / Abnahmekriterium:** „Jedes Quellenpaket ist fachlich vollständig und nicht nur
  technisch angelegt." Kanonischer Nachweis:
  [`quellenarchitektur/31-paketvollstaendigkeit.md`](quellenarchitektur/31-paketvollstaendigkeit.md).
- **Was geprüft wurde:** alle **8** Pakete des Code-Seeds — `bund-basis`, `arbeit-und-soziales`,
  `die-linke-bund`, `regional-niedersachsen`, `berlin-basis`, `brandenburg-basis`,
  `die-linke-berlin`, `die-linke-brandenburg`. Personenbezogene Pakete `profil-<mandats-id>`
  existieren bewusst nur als DB-Zeilen; die Regel dafür (nie `is_base`, nie im Code-Seed) ist
  jetzt getestet. Je Paket erhoben: Zweck, politische Zuständigkeit, Ebene, Region, erwartete
  Themen, Herausgeberklassen, vorhandene Wege, Paketzuordnungen, Aktivierungsstatus,
  Einschränkungen, Tests, Recherchegrundlage.
- **Verwendete fachliche Kriterien (jetzt ausführbar, nicht nur Fließtext):** Pflichtklassen je
  Paket · Pflicht-**Herausgeber**klassen (`evidence_role`) · Vollzähligkeit („alle Ausschüsse",
  „alle Fraktionen", „alle genannten Regionen") · mindestens **ein** benannter Herausgeber je
  Paket (nicht nur Aggregatoren) · leere Platzhalter · begründete vs. unbegründete
  Mehrfachzuordnungen · fachlich **unmögliche** Pflichtklassen getrennt von offenen Lücken ·
  vorbereitet ≠ aktiv · Determinismus. Die Klasse eines Abrufwegs wird deterministisch aus
  committeten Katalogmerkmalen abgeleitet (neues Modul
  `lib/helmut/quellenarchitektur/paket-vollstaendigkeit.js`), nicht aus einer gepflegten Liste.
- **Zwischenergebnis dieses ersten Sprints — inzwischen überholt:** 6 vollständig · 2 teilweise ·
  0 blockiert, mit `bund-basis` als „7/7 Klassen, 23/23 Ausschüsse, 8/8 Fraktionen".
  **Beide Zählwerte waren falsch** (richtig: 24 Ausschüsse, 5 Fraktionen) — sie stammten aus einer
  katalogrelativen Prüfung. Der **aktuelle** Stand steht in der Tabelle in §2 und im kanonischen
  Nachweis `quellenarchitektur/31-paketvollstaendigkeit.md`: **7 vollständig + 1 vollständig mit
  belegten Ausnahmen**, Ausschüsse **24/24**, Fraktionen **5/5**.
- **Gefundene Lücken (6, davon 3 behoben):**
  1. **V-3 (behoben):** Das neutrale Pflicht-Basispaket enthielt nur **22 der 23** ständigen
     Bundestagsausschüsse — es fehlte genau der Ausschuss für Arbeit und Soziales, der
     ausschließlich im **Themenpaket** lag. Jedes andere Mandat hätte 22 von 23 bekommen, und die
     Lücke wäre der Profilform des Pilotmandats gefolgt, obwohl `bund-basis` „alle Ausschuesse"
     zusagt. Behoben über die Paketableitung: **+1** `package_paths`-Zeile, **0** neue Abrufwege,
     **0** Änderung an Aktivierungsmodi.
  2. **V-4 (behoben):** `packageKeysForSource` ordnete **jede** regionale Quelle dem
     Niedersachsen-Paket zu. Unter der Production-Kuratierung unsichtbar, mit
     `HELMUT_SOURCE_CURATION=off` wären es **30** fremde Regionalquellen gewesen. Die Zuordnung
     läuft jetzt über die Regionsbegriffe der Paketdefinition; der generierte Seed ist unter
     Production-Kuratierung dadurch **unverändert**.
  3. **V-5 (behoben):** Die Regionsbegriffe lagen doppelt (Profil-Resolver + implizit im
     Paketinhalt) und konnten auseinanderlaufen — jetzt eine Quelle der Wahrheit in der
     Paketdefinition.
  4. **V-1 (erkannt, bewusst nicht behoben):** `regional-niedersachsen` hat **0 benannte
     regionale Herausgeber** — alle 4 Wege sind Google-News-Themensuchen (Herausgeber =
     Aggregator, 0 journalistische und 0 amtliche Beleglage) und zusätzlich thematisch auf
     Arbeit/Soziales gebunden, obwohl das Paket nach **Region** zugewiesen wird. Die
     Regionalmedien der Region (Braunschweiger Zeitung, Salzgitter Zeitung, regionalHeute, HAZ,
     Neue Presse, NDR) **liegen im Katalog**, werden aber von `keepCuratedSource` entfernt
     (`type: "media"` erst ab `priority >= 64`, regionale Medien tragen 52–60). Das Anheben
     dieser Schwelle wären rund **20 zusätzliche Google-News-Abrufe je Crawl** — eine Kosten-/
     Laufzeitentscheidung und damit freigabepflichtig, zumal die Google-Konzentration (B1) der
     wichtigste offene Architekturpunkt ist. Paket blieb zunächst **teilweise vollständig** —
     **überholt:** im Abschlusssprint über 2 benannte amtliche + 5 wiederverwendete Bestandsquellen
     geschlossen, ohne Schwellenanhebung und ohne Aktivierung (§2b.1 des Nachweises).
  5. **V-2 (erkannt, als fachlich unmöglich ausgewiesen):** `die-linke-brandenburg` kann 2 seiner
     3 Pflichtklassen nicht besetzen — Die Linke hat in der 8. Wahlperiode keine
     Landtagsfraktion in Brandenburg und keinen MdL. Die Pflichtklassen werden **nicht** entfernt
     (das wäre eine Abschwächung des Kriteriums); ein Ersatz aus fremder Partei ist ausgeschlossen.
     **Überholt:** die Nicht-Anwendbarkeit ist jetzt nicht mehr Fließtext, sondern eine überprüfbare
     Ausnahme mit stabiler Kennung, Wahlperiode, amtlichem Beleg und Voraussetzungsprüfung gegen
     `seeds/parlamentszusammensetzung.js` (§2b.2) — Ergebniskategorie
     `vollstaendig_mit_belegten_ausnahmen`.
  6. **V-6 (erkannt, Umsetzung als OP-23):** Die Pflichtklassenanzeige im Admin zeigt weiterhin
     `present: 0`. Ursache ist **nicht** fehlendes Klassen-Tagging, sondern dass
     `buildSourceAdminReport` auf `buildFullModel()` arbeitet, das die Berlin-/Brandenburg-Wege
     nicht kennt. Die Anzeige **untertreibt** also, erzeugt kein falsches Grün.
- **Korrigierte Altangabe:** Die Inventur führte Berlin mit **10 von 15** und Brandenburg mit
  **9 von 15** Pflichtklassen. Das war eine Unterzählung der Id-Namensableitung (deduplizierte
  Rohquellen tragen nur die *erste* Klasse in ihrer Id) — die Inventur hatte das selbst als
  „Hilfsableitung, keine Systemwahrheit" markiert. Gemessen an `covers` sind es **12/12** bzw.
  **12/12**. Die Checklistenpunkte 6/7 bleiben trotzdem ⏳ — allein wegen der Neutralitätslücke
  **A-3** in der Production-**Datenbank**, die nur die freigabepflichtige Seed-Einspielung schließt.
- **Ausführbare Absicherung:** neue Suite `scripts/paketvollstaendigkeit-test.js` — **89
  Prüfungen** in 14 Gruppen, mit **6 Negativkontrollen** (fehlender Ausschuss, undeklarierte
  Doppelzuordnung, Paket ohne Anforderung, umbenanntes Paket, Themenbündel als Ausschuss, und ein
  Wirksamkeitsnachweis, dass die BE/BB-Nichtaktivierungsprobe überhaupt Zähne hat). Zusätzlich ein
  **Strukturriegel**: schlägt an, sobald der Live-Crawlpfad `packageKeysForSource` oder
  `buildFullModel` importiert.
- **Tests dieses ersten Sprints (echte Zahlen, seither gewachsen):** `paketvollstaendigkeit-test`
  **89/89** · `source-architecture-test` **98/98** · `profile-packages-test` **69/69** ·
  `seed-restore-test` **43/43** · `seed-drift-test` grün · **Offline-Suite 148/148 grün** (37 s).
  Kein Browser-Smoke nötig (keine UI-Änderung). Generatorlauf wiederholt: beide Seeds
  byte-identisch; der Landesmodul-Seed ist gegen `main` **unverändert**. Aktuelle Zahlen nach den
  drei Folgesprints: siehe Tabelle §2 (Zeile Punkt 13).
- **Production-Sicherheitsnachweis (verifiziert, nicht behauptet):** Im Modus
  `HELMUT_SOURCE_MODE=on` baut der Scheduler seinen Plan aus den **DB-Zeilen**
  (`listSourceArchitectureRows` → `buildRelationalCrawlPlan`); der Fallback filtert `v1Sources`
  direkt über `neutral`/`themeTerms`/`regional`. **Beide Pfade importieren
  `packageKeysForSource`/`buildFullModel` nicht** — die Änderung wirkt erst mit der
  freigabepflichtigen Seed-Einspielung. Unverändert: 5 `always_on`-Wege, 144 Katalogwege, 139
  `auto`, 0 `dev_only`, Wegestatus, Cron, Flags, Secrets.
- **Wirkung auf die vorbereitete Seed-Einspielung (dokumentiert, nicht ausgeführt):** Seed
  `20260713` setzt zusätzlich `required_classes` für die vier Bundespakete (reine Metadaten, kein
  Einfluss auf Crawl/Aktivierung/Matching) und fügt **eine** Paketzuordnung ein
  (`pkg-bund-basis` ↔ `rp-ausschuss-arbeit-soziales`). Soll-Zahl im Seed damit **146** statt 145;
  gegen die gemessene Production **+1** statt bisher **0**. `betrieb/quellen-seed-einspielung.md`
  §4 ist entsprechend nachgezogen (Einfügungen Seed 1: 3, Aktualisierungen: 12).
- **Berlin/Brandenburg nicht aktiviert — geprüft:** alle 4 Landespakete `prepared`, alle 18
  Landeswege `needs_review` + `manual`, `aktiveAbrufwege = 0`, kein Landesweg in einem aktiven
  Paket, ein Berliner Landtagsprofil aktiviert **0** Landeswege (bei nicht-leerer
  Bundesaktivierung), `berlin-basis` bleibt ehrlich `requested_unsupplied`.
- **Verbleibende Grenze (ehrlich) — inzwischen überholt:** Die Vollzähligkeit war zu diesem
  Zeitpunkt **katalogrelativ**; bewiesen war nur, dass jeder ständige Ausschuss, den der Katalog
  kennt, im Pflichtpaket liegt. Genau dort lag der Fehler: der Katalog kannte 23, richtig sind
  **24**. Behoben im Nachtragssprint oben.
- **Nicht getan (bewusst):** kein Production-Zugriff, weder lesend noch schreibend · kein Seed
  eingespielt · keine Migration · keine Quelle aktiviert oder deaktiviert · keine neue Quelle
  erfunden oder hinzugefügt · keine Berlin-/Brandenburg-Aktivierung · keine Cron-/Flag-/
  Secret-Änderung · keine Änderung am Datenmodell oder an der Gesamtarchitektur · keine
  Abschwächung eines Pflichtklassenkriteriums, um ein Paket grün zu bekommen.

**Sprint „Go-Kriterium 2 kontrolliert versuchen" — Nachweis**

- **Auftrag:** ausschließlich `node scripts/backup-export.js --scope=seed` gegen Production
  ausführen, danach Manifest vollständig prüfen, dann zwingend vor Seed 1 stoppen.
- **Ausgeführt:** genau dieser eine Befehl, ohne Abweichung. Ergebnis: sofortiger Abbruch mit
  Exit-Code 2, Meldung „SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein
  (.env.local)". Das Skript prüft die Zugangsdaten **vor** jedem `fetch`-Aufruf — es wurde
  **keine einzige Anfrage** gegen Production gestellt, kein Verzeichnis unter `./backups/`
  angelegt, kein Manifest erzeugt.
- **Ursache verifiziert:** diese Agenten-Sitzung führt weder `SUPABASE_URL` noch
  `SUPABASE_SERVICE_ROLE_KEY` als Umgebungsvariable, und es existiert keine `.env.local` im
  Projektverzeichnis (nur `.env.example`). Das ist keine neue Erkenntnis — bereits im vorigen
  Sprint dokumentiert (s. u., „Die Production-Secrets sind in dieser Umgebung nicht gesetzt").
- **Keine Ersatzmaßnahme ergriffen:** kein Rückgriff auf den Supabase-MCP-Connector oder einen
  anderen Zugangsweg, da der Auftrag ausdrücklich genau dieses Skript vorschrieb.
- **Betreiberentscheidung:** der Export läuft auf der Betreibermaschine mit echter `.env.local`;
  das Manifest (`art`, `vollstaendig`, Zeilenzahlen je Tabelle, `pruefsummeGesamt`, `mainCommit`)
  wird zurückgemeldet und gegen die erwarteten Werte (163 Abrufwege, 7 Pakete, 165 Zuordnungen,
  siehe Inventur) geprüft, bevor Runbook-Schritt 6 fortgeführt wird.
- **Nicht getan (bewusst):** kein Production-Zugriff, weder lesend noch schreibend · keine
  Migration · kein Seed · kein Restore · keine Cron-/Flag-/Secret-Änderung · keine
  Quellenaktivierung · keine Datenänderung.

**Sprint „Review + Merge PR #125, Production-Ablauf vorbereiten" — Nachweis**

- **Review von PR #125:** drei spezialisierte Reviewer gegen den tatsächlichen Code, **20 belegte
  Befunde**, jeder einzeln nachgerechnet und behoben. Die vier schwersten:
  1. **Ein leerer Export galt als vollständiges Backup.** Auf allen 8 Quellentabellen ist RLS
     aktiv, aber es existiert **keine Policy** — ein anon-Key oder ein falsches Projekt liefert
     deshalb `HTTP 200` mit `[]` statt eines Fehlers. Das Ergebnis war ein grünes Manifest über
     leeren Dateien, und genau dieses Manifest ist das Go-/Stop-Gate des Runbooks. Der
     wahrscheinlichste Bedienfehler hätte das Sicherheitsnetz passiert.
  2. **Der Restore-`delete` war nicht eingegrenzt** und hätte eine nach dem Backup entstandene
     Mandantenzeile still gelöscht. Die Nachprüfung konnte das **strukturell nicht** bemerken:
     nach `delete … not in` + `insert` ist der Inhalt per Konstruktion die Backup-Menge, die
     Zählprüfung war damit **immer** erfüllt.
  3. **Ein zu spät gezogenes Backup wurde nicht erkannt** — der Restore wäre ein No-Op gewesen
     und hätte Erfolg gemeldet.
  4. **Die Soll-Zahlen des Runbooks widersprachen der gemessenen Production.** Die Vorlage
     rechnete mit 6 Paketen / 162 Wegen / 163 Zuordnungen, die Inventur aus #124 misst **7 / 163 /
     165**. Runbook-Schritt 6 hätte eine **korrekte** Datenbank gestoppt.
- **Konsequenz aus Befund 4:** Alle Prüfungen im Runbook arbeiten jetzt mit **gemessenen Deltas
  und benannten Zeilen** statt mit absoluten Zahlen aus einer Doku — absolute Zahlen driften bei
  jeder Provisionierung. Jede Differenz ist zugeordnet: zwei DB-only-Zeilen aus der
  Provisionierung, eine bereits vorhandene Zuordnung. **Seed 1 fügt in Production 0 statt 1
  Zuordnung ein.**
- **Weitere behobene Sachfehler:** Runbook-Schritt 13 prüfte auf `status='healthy'`, den kein
  Landesmodul-Weg je hat (wirkungslose Sicherheitsprüfung) · Schritt 16 konnte die
  Stopentscheidung aus Schritt 15 stillschweigend rückgängig machen · die Gate-Beschreibung
  behauptete, Paketschlüssel spielten keine Rolle, obwohl sie für `rp-rbb24-politik` die einzige
  Barriere sind · „2× `html` → `rss`" war in Anzahl und Richtung falsch (4×, alle nach
  `googlenews_search`) · die Kostenrechnung unterschlug die nicht deduplizierten Direktfeeds
  (≈16 statt 4 Abrufe) · `--scope seed` mit Leerzeichen fiel still auf den Voll-Export zurück.
- **Testlage.** `backup-export.js` hatte vorher **keinen einzigen Test**; der neue
  `scripts/backup-export-test.js` fährt es als echten Kindprozess gegen einen lokalen
  PostgREST-Nachbau und belegt **am HTTP-Verkehr**, dass ausschließlich `GET` rausgeht.
  Im `seed-restore-test.js` wurden die `do $$`-Prüfblöcke bisher nur **gezählt**, nie ausgeführt —
  sie werden jetzt ausgewertet.

  | Lauf | Ergebnis |
  |---|---|
  | `seed-restore-test.js` (lokal) | **43 PASS, 0 FAIL** |
  | `seed-restore-test.js` (`--depth 1`-Klon wie CI) | **41 PASS, 0 FAIL** |
  | `backup-export-test.js` | **38 PASS, 0 FAIL** |
  | `run-offline-tests.js` | **147/147 grün** |

  Mutationsprobe: Nimmt man die Eingrenzung des Restore-`delete` zurück, fängt Test 16 das
  reproduzierbar als FAIL.
- **Production-Ablauf vorbereitet, nicht ausgeführt.** Offline prüfbar und geprüft: `main`-Stand,
  Seeds unverändert seit #118, Drift-Gate grün, Cron-Fenster, Ablageort und Dateinamen des
  Backups, erwartete Manifest-Werte, Soll-Zahlen vor/nach Seed 1 und Seed 2, Stop-Kriterien,
  Restore-Entscheidungspunkte, Überwachung der 6 Wege. **Nicht** geprüft, weil es Production-Lesezugriff
  erfordert: laufende Locks, Health, offene Vorfälle — die stehen als Runbook-Schritte 2 und 3.
- **Die Production-Secrets sind in dieser Umgebung nicht gesetzt.** Der Export kann hier also
  ohnehin nicht laufen; er gehört auf die Betreibermaschine mit `.env.local`.
- **Merge:** PR #125 als Merge-Commit `0d6d867`. Vorab verifiziert: `mergeable_state: clean`,
  beide Pflichtchecks grün auf `6baaa0b`, keine offenen Reviews, Basis = aktueller `main`.
  Nach dem Merge auf `main` gegengeprüft: CI-Lauf #134 `success`, Vercel-Production-Deployment
  `dpl_4NFEyoJgQnbjTP4G8u1pJrjDrxuB` **READY** mit `githubCommitSha=0d6d867`; die drei
  Kernkorrekturen (Leer-Backup-Plausibilisierung, Vor-Seed-Prüfung, eingegrenzter `delete`)
  liegen auf `main`, das Runbook trägt weiterhin `Status: BLOCKIERT`.
- **Paralleler Arbeitsstand, ungemergt:** Branch `claude/helmut-seed-review-6nocps` enthält eine
  read-only Fachprüfung jeder einzelnen Seed-Änderung gegen Production. Sie **bestätigt die hier
  korrigierten Ist-Zahlen unabhängig** (7 Pakete / 163 Abrufwege / 165 Zuordnungen) und empfiehlt
  zusätzlich, `rp-ausschuss-arbeit-soziales` **nicht** mitzuaktivieren (einziger Google-Weg ohne
  belegten Eigenertrag). **Bewertet, triagiert und dokumentiert** — Einzelheiten in §6d.1/§6d.2
  des Runbooks.
- **Nicht getan (bewusst):** kein Production-Zugriff, weder lesend noch schreibend · kein Backup
  ausgeführt · keine Seeds eingespielt · kein Restore gefahren · keine Secrets gelesen, gesetzt
  oder rotiert · keine Cron-Änderung · keine Quelle aktiviert oder deaktiviert · keine Änderung
  an der Paketfachlogik oder an `required_classes` · kein weiterer PR gemergt.

**Sprint „Merge #123 + Sicherung und Restore für die Seed-Einspielung" — Nachweis**

- **PR #123 gemergt** als Merge-Commit `bed7f53` (Doku-only). Vorher geprüft: `mergeable: clean`,
  CI-Pflichtchecks grün, keine offenen Reviews, kein Code-Pfad berührt. Auf `main` gegengeprüft:
  `betrieb/quellen-seed-einspielung.md` trägt weiterhin `Status: BLOCKIERT`.
- **Backup-Umfang.** `scripts/backup-export.js` bekommt einen `--scope=seed`-Modus: genau die
  **8 Tabellen**, die die beiden Seeds berühren oder per Fremdschlüssel daran hängen
  (`geographies`, `political_entities`, `publishers`, `retrieval_paths`, `source_packages`,
  `package_paths`, `path_expected_levels`, `path_expected_geographies`), in FK-sicherer
  Restore-Reihenfolge. Neu **für beide Modi**: serverseitige Zeilenzahl-Gegenprobe per
  `Prefer: count=exact`, SHA-256 je Tabelle plus Gesamtprüfsumme, der gesicherte `main`-Commit
  im Manifest, und ein `vollstaendig`-Flag mit Exit-Code 1 — ein still gekapptes Teil-Backup
  kann damit nicht mehr wie ein vollständiges aussehen. Das Skript bleibt **ausschließlich
  lesend** (nur `GET`).
- **Restore-Status: gebaut und getestet, nicht ausgeführt.** `scripts/seed-restore-sql.js` ist ein
  reiner **SQL-Generator** — kein DB-Client, kein Netzwerk, kein Schreibpfad. Er erzeugt aus einem
  Pre-Seed-Backup ein zeilenscharfes Rückbau-Skript: eine Transaktion mit Vorprüfung
  (`raise exception` bei Abweichung), gezielten `update`s auf die 6 Abrufwege, `delete … not in`
  plus Wiedereinfügen der gesicherten Paketzuordnungen, bedingtem Entfernen der 2 neuen Pakete
  und einer Nachprüfung. **Kein `drop table … cascade`** — das war der bisherige Rollback und ist
  wegen `ON DELETE CASCADE` auf `retrieval_paths.publisher_id` und beiden `package_paths`-FKs für
  gezielten Rückbau unbrauchbar. Ehrliche Grenze: `updated_at` ist wegen des `set_updated_at`-
  Triggers **nicht** wiederherstellbar.
- **Testergebnisse (echte Zahlen).** `scripts/seed-restore-test.js`: **33 PASS, 0 FAIL** lokal,
  **31 PASS, 0 FAIL** in CI (zwei Herkunftsprüfungen der Fixture brauchen die volle Git-Historie
  und melden im flachen CI-Klon ausdrücklich „nicht prüfbar" statt still durchzulaufen) — 14
  Gruppen, darunter Byte-Gleichheit der zurückgeschriebenen Spalten, Idempotenz des Restores,
  Schutz der Eltern-Zeilen, Abbruch bei verändertem Ausgangszustand und „kein Restdiff nach
  vollständigem Zyklus". Kanonische Offline-Suite: **145/145 Suiten grün**. Der Test
  arbeitet auf **synthetischen Fixtures** aus den committeten Seeds — **keine
  Production-Daten**. Eine formprüfende Mutation im Generator erzeugt reproduzierbar **2 FAIL**
  (Erkennung belegt); zwei formverändernde Mutationen brachten den Mini-Executor stattdessen zum
  Abbruch — als Grenze in `betrieb/quellen-seed-einspielung.md` §5b offen dokumentiert.
- **Die 6 betroffenen Retrieval Paths** (heute `broken`, Seed 1 setzt sie auf `needs_review` und
  macht sie damit **absichtlich wieder ausführbar**):

  | # | Pfad-ID | Betreiber | Abruf | Aktivierung |
  |---|---|---|---|---|
  | 1 | `rp-bundestag` | bundestag.de | Direktfeed (RSS) | `always_on` — **läuft sofort** |
  | 2 | `rp-bundesregierung` | bundesregierung.de | Google News | `always_on` — **läuft sofort** |
  | 3 | `rp-die-linke` | die-linke.de | Google News | `auto` — nur bei aktivem Paket |
  | 4 | `rp-linksfraktion` | dielinkebt.de | Direktfeed (RSS) | `auto` |
  | 5 | `rp-ausschuss-arbeit-soziales` | bundestag.de | Google News | `auto` |
  | 6 | `rp-dgb` | dgb.de | Google News | `auto` |

  Kontrollkarten je Weg (URL, Parser, Item-Deckel, Ausfallmuster, Dedup-Verhalten):
  `betrieb/quellen-seed-einspielung.md` §6b.
- **Entscheidung: weiterhin Option B — Ausführung blockiert.** Werkzeug und Rückweg stehen
  bereit und sind getestet; es fehlen genau zwei Betreiberhandlungen (§4, §11): die Sicherung
  muss **tatsächlich gelaufen** sein (`vollstaendig: true`), und die Reaktivierung der 6
  Bundeswege muss ausdrücklich mitfreigegeben werden.
- **Fehlende Betreiberfreigaben:** (1) Production-Lesezugriff für den Pre-Seed-Export ausführen ·
  (2) Reaktivierung der 6 Bundeswege · (3) Seed-Ausführung selbst · (4) OP-01 (Supabase Pro/PITR)
  als dauerhafte Lösung.
- **Nicht getan (bewusst):** kein Production-Backup ausgeführt, kein Seed eingespielt, kein
  Restore gefahren, kein Production-Schreibzugriff, keine Secrets, keine Cron-Änderung, kein
  Flag, kein weiterer PR gemergt.
**Sprint „Quellenpakete inventarisieren + Paketzuweisung beweisen" — Nachweis**

- **Auftrag:** die beiden nächsten zusammenhängenden Phase-1-Punkte schließen — Punkt 18
  (Production-Inventur aller Quellenpakete) und Punkt 12 (automatische Paketzuweisung
  beweisen).
- **Was erledigt wurde:** vollständige, rein lesende Production-Inventur aller Pakete
  (Wege, Aktivierung, Ertrag, letzte Lieferung, Fehler, Pflichtklassen, zugeordnete
  Profile) in `quellenarchitektur/30-paket-inventur-production.md`; Nachweis der
  automatischen Paketzuweisung für Bundestag/Berlin/Brandenburg **gegen den echten
  Production-Katalog** und zusätzlich als Offline-Suite
  `scripts/paketzuweisung-nachweis-test.js`; neue operative Checkliste
  `docs/roadmap/phase_1_checkliste.md` (11 ✅ / 7 ⏳ / 12 ☐).
- **Ergebnis der Zuweisungsprüfung:** Bund→`bund-basis`, Berlin→`berlin-basis`,
  Brandenburg→`brandenburg-basis`; Fachpakete entstehen aus Profildaten; keine fremden
  Regionalpakete; kein Mandant im Code hartkodiert (Sachzuordnung ist unter beliebiger
  Profil-ID identisch); drei zusätzliche Profile ändern an den Bestandsmandanten nichts
  (145 → 145 aktive Abrufwege); Berlin/Brandenburg bleiben ehrlich `requested_unsupplied`.
- **Modell ↔ Realität abgeglichen:** 145 modell-aktive Wege gegen 145 real gecrawlte
  Quellen vollständig aufgelöst (138 Katalogwege + 7 profilgenerierte Personensuchen;
  6 defekte Wege und DIP laufen bewusst nicht mit); 0 Berlin-/Brandenburg-Wege im Lauf.
- **Gefundene Abweichungen (A-1…A-8):** in der Inventur §7 dokumentiert. Doku-Fehler in
  `quellenarchitektur/07-…` korrigiert (Landespakete sind nicht leer; der Resolver ist
  seit dem Cutover live verdrahtet). **A-1** hat OP-04 in der Restliste verschärft.
  **A-3** (Landes-Basispakete nicht mandantenneutral) und **A-4** (2 von 5
  `always_on`-Kernwegen defekt) sind seit dem Merge von #118 **auf `main` behoben**, in der
  **Production-Datenbank aber weiterhin wirksam** — dafür fehlt das freigabepflichtige
  Einspielen der Seeds (§11).
- **Was bewusst nicht erledigt wurde:** keine Production-Datenänderung, kein Seed-Einspielen,
  keine Migration, keine Aktivierung von Berlin/Brandenburg, kein Deaktivieren bestehender
  Quellen, keine Flag-/Cron-/Secret-Änderung, kein Anlegen echter Profile. Keine Änderung an
  `profile-packages.js` oder `seeds/packages.js` — die Zuweisungslogik war fehlerfrei.
- **Tests:** Offline-Suite **145/145 grün** (`node scripts/run-offline-tests.js`, 38 s); neue
  Suite `paketzuweisung-nachweis-test` **147/147** nach dem Rebase auf `61767a9` (die zwei
  neuen Landes-Parteipakete aus #118 sind mit abgedeckt), dreimal wiederholt byte-identisch.
  Kein Browser-Smoke nötig (keine UI-Änderung).
- **Merge:** PR #124 auf ausdrückliche Betreiberfreigabe gemergt (`118e90c`, 2026-07-25).
  Vorab verifiziert: `mergeable_state: clean`, beide Pflicht-Checks grün (Offline-Suite,
  Chromium-Smoke), Vercel-Preview `Ready`, keine offenen Reviews/Change-Requests, kein
  Rebase nötig (Basis = aktueller `main`-Stand). Nach dem Merge gegengeprüft: CI auf dem
  Merge-Commit grün, Vercel-Production-Deployment `dpl_47sPA8z5T11rWjYT4J6R83XdxPd8`
  `READY` mit `githubCommitSha=118e90c`.
- **Nächster Schritt:** Freigabe für das Einspielen der beiden Seeds — vorbereitet und
  bewertet in [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md),
  derzeit blockiert durch die fehlende Sicherung (§11).

**Sprint „Merge PR #118 + Seed-Vorbereitung" — Nachweis**

- **PR #118 gemergt** als Merge-Commit `61767a9`. Vorab alle zwölf Bedingungen verifiziert
  (`clean`, CI 5/5, 0 fehlende `main`-Commits, keine Reviews, Trockenlauf konfliktfrei, alle vier
  Korrekturen im Branch, keine festen Personen-IDs). CI auf `main` **grün**, Vercel-Production
  `READY`. Auf `main` gegengeprüft: Aufräum-DELETE vorhanden, Editionspinning gesetzt, 0
  `broken`-Annotationen in `catalog.js`.
- **Der Merge hat die Datenbank nicht verändert** — verifiziert: kein Workflow, kein Cron und kein
  Server-Pfad spielt Seeds ein; die Dateien werden ausschließlich von Test-/Preflight-Skripten
  gelesen.
- **Seed-Sprint vorbereitet, nicht ausgeführt.** Vollständige Vorlage inklusive Soll-Zahlen,
  Reihenfolge, Idempotenznachweis, Rollback-Bewertung, Go-/Stop-Kriterien und Betreiberentscheidung:
  [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md).
- **Vorschau (lokal simuliert, kein Production-Zugriff):** Seed 1 → +2 Pakete, +1 Paketzuordnung,
  6 Abrufwege aktualisiert; Seed 2 → 4 alte Paketzuordnungen entfernt, 4 neue eingefügt.
  Betroffen: **0** Publisher · **6** Retrieval Paths · **4** Source Packages · **4** entfernte und
  **5** neu eingefügte Paketzuordnungen. Zweiter Lauf beider Seeds: **0 Änderungen** (idempotent).
- **Wichtigster operativer Punkt:** die 6 reparierten Bundeswege stehen in Production auf
  `broken` und laufen deshalb heute **nicht**. Seed 1 setzt sie auf `needs_review` und macht sie
  damit **absichtlich wieder ausführbar** — am Crawl-Plan verifiziert: +2 garantiert und sofort
  (die beiden `always_on`-Wege), bis zu +4 weitere abhängig vom Live-Profilbestand. Das muss
  ausdrücklich mitfreigegeben werden. Keine Amplifikation (Shared-Path-Dedup aus #120), keine
  zusätzlichen KI-Kosten.
- **Berlin/Brandenburg bleiben gesperrt** — verifiziert: alle 18 BE/BB-Wege `landesmodul-gesperrt`,
  0 im aktiven Plan; das Gate greift über Pfad-IDs, nicht über Paketschlüssel.
- **Backup/Rollback:** **kein Backup, kein PITR** (Supabase Free-Plan, Folge von OP-01). Feiner
  Rollback existiert nur für Seed 2; der Bund-Rollback ist ein `drop table … cascade` und für
  gezielten Rückbau unbrauchbar. Ein Rollback stellt die alten Zuordnungen **nicht** wieder her.
- **Entscheidung: Option B — Ausführung blockiert.** Es fehlt genau eine belastbare Sicherung.
  Kleinster Weg ohne Kostenentscheidung: `node scripts/backup-export.js` vor dem Lauf. Dauerhaft:
  OP-01 freigeben. **Die Kostenentscheidung liegt beim Betreiber.**

**Sprint „Merge #122 + Review PR #118" — Nachweis**

- **PR #122 gemergt** (`54fe370`, Merge-Commit). Vorab verifiziert: `clean`, CI 3/3 grün, keine
  neuen `main`-Commits, keine Reviews, Trockenlauf konfliktfrei, Diff = nur die angekündigte
  Doku-Korrektur. Danach auf `main` gegengeprüft: Banner und Tabelle nennen beide `d6d9063`/#113
  als Re-Anker, der Altwert `035898b`/#114 kommt im Dokument nicht mehr vor.
- **PR #118 adversarial reviewt** (5 spezialisierte Prüfer, jeder Befund gegen den echten Code
  verifiziert). **Weiterhin nötig:** P0-1 ist auf `main` nachweislich offen — die committeten
  Seeds reproduzieren dort nicht aus dem Code (empirisch: realer Diff). Nicht überholt.
- **Verifizierte Risiken — entwarnt:**
  - *Kein* BE/BB-Aktivierungsleck: das harte Gate greift über die Pfad-IDs (`rp-be-`/`rp-bb-`),
    nicht über Paketschlüssel. Ausführung von `buildRelationalCrawlPlan` mit einem Berlin-/
    Linke-Landtagsprofil: alle 18 BE/BB-Wege `landesmodul-gesperrt`, `plan.aktiv = []`.
    Zweite Barriere: beide neuen Pakete sind `prepared` → nie `active`.
  - *Keine* neue Crawl-Amplifikation: die 4 neuen Google-News-Wege sind mandantenunabhängig und
    werden von der Shared-Path-Dedup aus PR #120 abgedeckt (Mandant 2+ → `skipped-shared`).
  - *Kein* Konflikt mit #105/#120/#121/#122; Merge konfliktfrei; Provenienz (`site:`-Filter hält
    die Herausgeber-Domain) intakt; keine festen Personen-IDs; Paketzuweisung datengetrieben.
  - `sources.js` ist trotz `SOURCE_MODE=on` produktionswirksam (`toCrawlerSource` gibt das
    Legacy-Objekt zurück). Die 6 reparierten Wege tragen in der DB aber weiterhin `status='broken'`
    und bleiben damit ausgeschlossen — die Reparatur wird erst mit dem **freigabepflichtigen**
    Seed-Einspielen wirksam. Der Merge allein ändert das Crawl-Verhalten nicht.
- **Behobene Defekte (in #118 nachgebessert):** (1) P0-2 war in der **Datenbank** wirkungslos —
  der Seed verschob die Partei-/Personenwege per `insert … on conflict do nothing` ohne Delete,
  die alten Zuordnungen am Pflicht-Basispaket wären geblieben (Seed 20260717 ist laut
  `quellenarchitektur/18-production-freigabeanfrage.md` in Production angewendet); (2) die einzige
  Google-News-URL ohne Editions-/Sprachpinning; (3) zwei Testlücken, beide per Mutationstest
  belegt (Sortierung nach Schwere nirgends mehr abgedeckt; zwei nie fehlschlagende Zusicherungen).
- **Tests:** Offline-Suite **144/144 grün** · source-architecture 97/0 · admin-source-report 56/0 ·
  profile-packages 69/0 · landesmodule-kandidaten 77/0 · quality-watchdog 66/0 ·
  tenant-neutrality 39/0 · seed-drift grün (adversarial: Manipulation auf Code- **und** Seed-Seite
  wird gefangen) · Generatoren byte-identisch · Mutationsproben rot wie erwartet.
- **Offene Entscheidungen (bewusst nicht geändert):** `required_classes` von
  `die-linke-brandenburg` (3 Pflichtklassen, nur `partei_pilot` belegt) ist eine **fachliche**
  Paketfrage; Rollback lässt zwei leere `prepared`-Pakete stehen (kosmetisch); die
  **Google-News-Konzentration** steigt von 134 auf 138 von 143 Wegen — bei offenem Circuit Breaker
  liefern nur noch 5 statt 9 Direktfeeds. Das ist kein Defekt dieses PRs, aber der wichtigste
  verbleibende Architekturpunkt (SPOF, im Audit als eigener P1 geführt).
- **Merge-Empfehlung:** **ja** (Option B abgeschlossen). Merge und Deployment bleiben beim Betreiber.

**Sprint „Recovery-Pfad: Review, Stilllegung, Merge" — Nachweis**

- **Was versucht wurde:** prüfen, ob der Understanding-Recovery-Pfad auf `main`
  tatsächlich noch scharf ist, das Production-Risiko bewerten, PR #105 vollständig
  gegen `main` reviewen und ihn mergefähig machen.
- **Was erledigt wurde:** Der Verdacht wurde **bestätigt** (F-3). Die Stilllegung in
  PR #105 wurde gegen den Code geprüft und ist **technisch wirksam**, nicht nur
  dokumentarisch — belegt durch einen Subprozess-Aufruf mit Flag *und* korrektem
  Token, der `{executed:false, stillgelegt:true}` liefert. Ein verifizierter Defekt
  wurde behoben: die Regression prüfte nur **einen festen Dateinamen** und hätte eine
  umbenannte Action nicht gefangen — ersetzt durch einen namensunabhängigen Riegel
  über alle Workflows (Negativkontrolle: eine umbenannt wiederhergestellte Kopie
  lässt den Test korrekt fehlschlagen). Die frühere PR-Empfehlung, beim späteren
  `impl-2`-Merge dessen Fassung zu übernehmen, war gefährlich und wurde
  zurückgezogen. PR #105 wurde auf `main` `c6a3d40` gezogen; seine eigene, vor #119
  angelegte `CURRENT_STATE.md` ist in **diese** kanonische Datei überführt. Danach
  gemergt (siehe unten).
- **Merge:** PR #105 auf ausdrückliche Betreiberfreigabe als Merge-Commit gemergt
  (`43e9e35`, 2026-07-25). Vorab verifiziert: `mergeable_state: clean`, CI 3/3 grün,
  keine neuen `main`-Commits, keine Reviews/Change-Requests, Trockenlauf konfliktfrei.
  Nach dem Merge auf `main` gegengeprüft: Workflow entfernt, `RECOVERY_ALLOWLIST` `[]`,
  0 `require` im Execute-Skript.
- **Was nicht erledigt wurde:** keine Ausführung von OP-06 und keine Recovery — beides
  freigabepflichtig. Die mandatsrelative OP-06-Allowlist wurde bewusst **nicht**
  fachlich neu bewertet (§3). Keine Migration, keine Flag-Aktivierung, keine
  Production-Datenänderung.
- **Tests:** Offline-Suite **141/141 grün** · `understanding-recovery` 57/57 (davon 2
  neu) · `pending-terminal` 63/63 · `tenant-neutrality` 39/39 · `tenant-guard` 37/37 ·
  `ko-recovery` 12/12 · YAML-Validierung aller Workflows · 55 Doku-Verweise (0 tot) ·
  Negativkontrolle umbenannter Workflow.
- **Offener Folgepunkt:** die OP-06-Fachfrage (§3) — nicht blockierend, da OP-06
  Default AUS ist und ein eigenes Token braucht.
