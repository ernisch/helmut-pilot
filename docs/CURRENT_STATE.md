# CURRENT STATE — Helmut

**Stand: 05.11.2026.** Dieses Dokument ist die kurze, entscheidungsrelevante Projektübersicht. Es unterscheidet nachgewiesene Läufe, geprüften Entwicklungscode und tatsächliche Production Funktion. Zeitgebundene Befunde gelten nur für ihren Beobachtungszeitpunkt. Eine geplante oder automatische Fortsetzung ist kein tatsächlicher Laufnachweis.

**Oberste Priorität:** Nach dem bestandenen End500 den vollständigen Mock500 Nachweis abschließen, anschließend den gesondert freizugebenden Production500 Nachweis. Danach eine sichere, nutzbare und verkaufbare Anwendung fertigstellen. Keine Nebenprojekte ohne konkreten Bezug zum nächsten Meilenstein.

## Nachweisstand

| Meilenstein | Status und entscheidender Beleg |
| --- | --- |
| **End500** | **PASS**, GitHub Run [41325430429](https://github.com/ernisch/helmut-pilot/actions/runs/41325430429) auf f157d97ff3990a71623e7037437556dfcc8b48e6. Unabhängige Funktionsabnahme unter dem End500 Hostvertrag laut [PR #1014](https://github.com/ernisch/helmut-pilot/pull/1014): Restore, 500 Auth CAS, Export, vollständige verschlüsselte Sicherung, authentifizierte Rücklesung, erneuter isolierter Restore und 0 aktive Profile am Ende. Diesen Nachweis nicht ohne konkreten Gegenbeleg wiederholen. |
| **Mock500** | **OFFEN.** Noch kein vollständiger bestätigter Lauf mit allen Pflichtzählungen, Sicherung, Wiederherstellung und Nullaktivität. |
| **Production500** | **OFFEN.** Kein aktueller vollständiger Production Funktionsnachweis mit 500 gleichzeitig aktiven Profilen und 1500 realen Ergebnissen belegt. Dafür sind frische Startbelege und eine gesonderte ausdrückliche Freigabe für Profile und kostenpflichtige Anbieteraufrufe erforderlich. |
| **Verkaufbare Anwendung** | **NICHT ABGENOMMEN.** UI und Backend sind separat gesichert; die gemeinsame Integration und der nachweislich nutzbare Production Zustand sind noch offen. |

## Mock500: aktuell belegter technischer Stand

**Vollständiger Prüfvertrag:** exakt 500 gleichzeitig aktive synthetische Profile, 500 Verarbeitungseinheiten, 1000 simulierte Modellphasen, 1500 vollständig geprüfte Ergebnisse, 8000 Sicherheitskontrollen, 17000 Auditprüfungen sowie geltende Zeit, Speicher und Schutzgrenzen, vollständige verschlüsselte Sicherung, authentifizierte Rücklesung, Wiederherstellung und nachgewiesene Nullaktivität. Keine kleineren Teststufen erfinden und Teilnachweise nicht zum Gesamterfolg erklären.

**Letzter hier anhand eines konkreten GitHub Originaljobs geprüfter Fehllauf:** [41870462562](https://github.com/ernisch/helmut-pilot/actions/runs/41870462562), Mock500 Job fehlgeschlagen. Laut [PR #1041](https://github.com/ernisch/helmut-pilot/pull/1041) erreichten die Materials die Abschlussphase; Prepare scheiterte bei stored command mit verlorener innerer Ursache. Die alte Fehlermeldung bleibt UNKNOWN; keinen Erfolg nachträglich behaupten.

**Reparatur für den nächsten Versuch vorbereitet, nicht durch Originallauf bestätigt:** Runtime Commit 33d588b6209ad912c5045f6561c07b7dc3d60e63. Der reproduzierte Kalender Import nach dem Versiegeln des Workers wurde vor das Versiegeln verschoben. [PR #1042](https://github.com/ernisch/helmut-pilot/pull/1042) dokumentiert gezielte Regression, unabhängige statische Abnahme und beide erfolgreichen Pflichtprüfungen in [CI 41889108711](https://github.com/ernisch/helmut-pilot/actions/runs/41889108711). Das ist ein Code und Testnachweis, kein Mock500 PASS.

**Dauersteuerung für kostenlose sequenzielle Mock Läufe:** [PR #1044](https://github.com/ernisch/helmut-pilot/pull/1044), Kontrollkopf 109297eb186d5e8a625243491915279540e99bee. Gezielte Prüfungen und unabhängige Sicherheitsabnahme bestanden, beide Pflichtchecks [CI 41906667602](https://github.com/ernisch/helmut-pilot/actions/runs/41906667602) erfolgreich. Die dokumentierte Betreiberfreigabe hebt die frühere reine Versuchszahlbegrenzung innerhalb der bestehenden kostenlosen GitHub Infrastruktur auf, **nicht** die bindenden Frische, Tages, Original, Ressourcen, Sicherheits, Cleanup, Kosten und Stopbedingungen. Die PR meldete noch keinen neuen geschützten Originallauf; ein späterer tatsächlicher Start oder PASS ist hier nicht belegt.

## GitHub, Vercel und parallele Produktarbeit

**GitHub Hauptbranch:** Die neue fokussierte AGENTS.md ist mit [PR #1045](https://github.com/ernisch/helmut-pilot/pull/1045) am 04.11.2026 auf main zusammengeführt (798c4ffcac8ab2cb26410ef00d3b50fbd9eeedaa). Nur Agentenregeln, kein Motorcode. Mock500 Runtime und Kontrollarbeit bleiben getrennt; ein GitHub Merge ist kein Production Funktionsnachweis.

**Vercel Production:** Bei der rein lesenden Prüfung am 05.11.2026 war das bisherige Deployment dpl_Awu9KaGdUA3xWbaEJPF9VDkYAh8L auf 773f7aa545bfeac9429ef368c49e302e68772cc6 READY. Der Dokumentationsmerge #1045 erzeugte einen als CANCELED gekennzeichneten, ignorierten Build; die alte READY Version blieb erhalten. Kein neuer produktiver 500er Lauf daraus ableiten.

**Bekannter Vercel Fehler auf neuerer Runtime:** [PR #1046](https://github.com/ernisch/helmut-pilot/pull/1046) dokumentiert eine fehlerhafte includeFiles Konfiguration und einen separaten synthetischen CI Kalenderfehler. Eine korrigierte Vorschau war READY; die finale Integration auf dem betroffenen Runtimepfad und aktuelle Pflichtprüfungen sind davon zu unterscheiden. Dieser Seitenzweig ist kein Grund, den laufenden Mock500 Originalmotor ungeprüft umzubauen oder ein Production Deployment zu starten.

**UI und Backend:** Im privaten Integrationsrepository ernisch/helmut-integration-20261105 sind die beiden angegebenen Commits tatsächlich in GitHub lesbar: UI auf Branch integration/ui-20261105, Commit 011910746294109c04fd5dac8e153a22188b7467; Backend auf integration/backend-security-admin-20261104, Commit e054c0bb80fa4c330082bace3cfff6d9bb89a926. Die gemeldeten lokalen Tests und Vollständigkeitsprüfungen ersetzen keine gemeinsame Integration oder Production Abnahme. Diese beiden Stände nicht ungeprüft nach main übernehmen.

## Starttor und Schutzgrenzen

Der technische Test verwendet **500 vollständig fiktive Profile**, verteilt auf 330 Bundestag, 120 Berlin und 50 Brandenburg. Keine Profile mit AfD Zugehörigkeit versorgen. Alle Zielprofile gleich behandeln; keine echten individuellen Mandatsprofile im synthetischen Nachweis verwenden. Quelle, Fachwahrheit, Mandantentrennung, Authentifizierung, Kostenlimits, Notstopp, Sicherung und Wiederherstellung bleiben verbindlich.

**Nicht aus historischen Daten ableiten:** aktueller Production Profilaktivitätsstand, offene Jobs, aktuelle Azure Belastbarkeit, Kostenbuch, verfügbare Reserve und tatsächliche aktive Originalserie wurden für diesen Dokumentationsstand nicht frisch aus den jeweiligen Production Systemen gelesen. Die historischen Oktoberzahlen sind keine aktuelle Freigabe oder Startquittung. Unbekannte Start oder Schreibwirkung nicht durch Wiederholung übergehen.

Eine Mock500 Dauerfreigabe ist keine Freigabe für echte Modellaufrufe in Production. Production Profileingriffe, Datenbankänderungen, Budgetänderungen, neue kostenpflichtige Dienste, externe Nachrichten und kritische Deployments benötigen die jeweils gültige ausdrückliche Freigabe. Keine Sicherheitsregel zur Beschleunigung abschalten. Vor kritischer Wirkung Risiken, Kosten, Nachkontrolle und Rückweg benennen.

## Arbeitssteuerung

Codex verwendet die geltende [AGENTS.md](../AGENTS.md). Standard sind vorhandene GitHub CI, lokale Mocks, gezielte Tests und isolierte Datenbankprüfungen. Kein neuer Hetzner Aufbau oder neue Teststufen ohne echten Bedarf. Nur an belegten Blockern arbeiten. Bereits abgenommene End500 Leistungen nicht wiederholen; bei Mock500 FAIL den belegten Erstfehler erhalten und nur die minimale Ursache korrigieren. Parallel arbeitende UI, Backend und Motor Bereiche nicht durch gegenseitige Commits, Laufbindungen oder unkontrollierte Merges beeinflussen.

**Reihenfolge:** erfolgreich abgeschlossene Nachweise behalten, dann Mock500 vollständig belegen, danach Production500 separat freigeben und belegen, anschließend die sichere Produktintegration und den konkreten Kundennutzen prüfen. Keine neuen Features zur Überbrückung von Wartezeiten.

## Nächster notwendiger Schritt

**Im bestehenden Mock500 Codex Thread anhand frischer originalgebundener Quittungen den tatsächlichen nächsten Mock500 Laufstatus feststellen und diesen einen offenen Gesamtnachweis bis PASS oder einem konkret belegten Erstfehler verfolgen.** Ist die Fortsetzung schon im Gang, nicht doppelt starten. Bei einem tatsächlichen FAIL nur den notwendigen minimalen Fix mit gezielten Prüfungen vornehmen. Keine Wiederholung von End500 und kein ungefragter Production500 Start.

## Historie und Beleggrenze

Die zuvor umfangreiche CURRENT_STATE Fassung mit Oktober Stand ist unverändert in der Git Historie auf [main vor diesem Nachtrag](https://github.com/ernisch/helmut-pilot/blob/798c4ffcac8ab2cb26410ef00d3b50fbd9eeedaa/docs/CURRENT_STATE.md) erhalten. Ältere technische Dossiers unter docs/betrieb und docs/archive bleiben Belege, werden aber ohne neue Prüfung nicht als aktuelle Betriebswirklichkeit verwendet. Dies ist eine dokumentarische Bestandsaktualisierung; sie aktiviert keine Profile, startet keine Tests und verändert keine Production Ressourcen.
