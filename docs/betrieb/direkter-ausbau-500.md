# Direkter Ausbau von 25 auf 500

Stand 08.09.2026. Die neuere Betreiberanweisung in SR §60 erlaubt den sofortigen Test ohne Nachtfenster und ohne vorgeschaltete A Abnahme. Urspruengliche Umsetzung in [SR §55 und §56](500-funktionstest-sicherheitsrahmen-2026-09-01.md).
Der folgende Kurztest samt Qualitätskorrektur und geplantem Abschluss wird in **SR §57** ergänzt.
Der Code bereitet den Ausbau und einen kontrollierten Test vor. Er behauptet weder
500 aktive Production Profile noch deren erfolgreiche fachliche Abnahme.

## Ablauf und Zielbestand

Der bestehende Betreiberweg `scripts/testkohorte-vorwaerts.js` erhält den ausdrücklichen
Parameter `--ziel=500`. Der bisherige Stufenvertrag bleibt für `--stufe` und `--gruppe`
unverändert. Beide Verträge können nicht vermischt werden. Es gibt keine erfundene B Abnahme.

| Schritt | Wirkung | Gesamt / aktiv / inaktiv danach |
|---|---|---|
| `vorpruefung` | Bestand, Production Konfiguration und Kosten ausschließlich lesen | unverändert |
| `provisionierung` | B 75 und C 400 über den vorhandenen Provisionierer inaktiv anlegen | 504 / 25 / 479 |
| `aktivierung` | Genau diese vollständig angelegten 475 Mandatsprofile aktivieren | 504 / 500 / 4 |
| `fachzyklus` | Genau eine bestehende Pipeline Runde bei 500 aktiven Profilen | Profilbestand unverändert |

Die 29 vorhandenen Mandatszeilen einschließlich A, 30 bestehenden Identitätszeilen und
25 bestehenden Konten werden vollständig verglichen. Die fünf älteren aktiven und vier
sonstigen inaktiven Profile bleiben geschützt. Neue Konten bleiben inaktiv, ausschließlich
`.invalid` Adressen. Keine Löschung, Schemaänderung oder Wiederherstellung von `crawlRuns`.

## Geschützter Ausführungskontext

Die manuelle Action `500-direkt-ausbau.yml` läuft nur auf `ernisch/helmut-pilot`, Branch `main`,
mit einem separat als Production READY bestätigten vollständigen Commit. Der authentifizierte
Statusleser prüft den tatsächlichen Production Commit und die wirksamen Speicherparameter.
Anlage, Aktivierung und Facharbeit haben separate Bestätigungen:

| Schritt | Exakte Bestätigung |
|---|---|
| Provisionierung | `TESTKOHORTE_ZIEL_500_475_INAKTIV_ANLEGEN_BESTAETIGT` |
| Aktivierung | `TESTKOHORTE_ZIEL_500_475_AKTIVIEREN_BESTAETIGT` |
| Fachzyklus | `TESTKOHORTE_ZIEL_500_EINE_PIPELINE_RUNDE_BESTAETIGT` |

Ohne `--scharf` liefern diese drei Schritte nur einen Plan ohne Netz, Beleglesen oder Schreiben.
Die Vorprüfung braucht kein Bestätigungswort und erlaubt kein `--scharf`. Andere Ziele,
Stufen, Teilmengen, doppelte Parameter und gesetzte Prüfuhren werden abgewiesen.

Die Action verwendet bereits vorhandene GitHub Secrets; sie überträgt oder ändert keine Secrets.
Nach erfolgreichem Lesen bindet der Adapter ausschließlich seinen eigenen Prozess an
Supabase, V3 und den relationalen Exklusivmodus. Aufbewahrung 36, Deckel 2416,
Understanding Reserve 702, tatsächlicher Vorrang mindestens 200 sowie Kommunikationssperre
müssen vorher in Production bestätigt sein. Diese Prozessbindung ist Teil des geprüften
Ausführungswegs und ausdrücklich auszuweisen; sie verändert keine Vercel Konfiguration.

Keine Action startet automatisch eine andere. Die gemeinsame Concurrency Gruppe sperrt
gleichzeitige manuelle Testaktionen. Aktive oder verwaiste Leases verhindern den Beginn;
die aktuelle Systemuhr wird geprueft. Anlage und Aktivierung sind zu jeder Uhrzeit erlaubt;
keine neue Zeile nach 20 Minuten pro Vorgang. Ein bereits laufender
Speicheraufruf kann diese Frist überschreiten; ein unbekannter Ausgang bleibt offen. Ein Fachlauf benötigt
sechs Minuten Restzeit im selben UTC Kostentag. Keine Uhrmanipulation.

## Qualitaetsabnahme nach dem Teststart

**Seit SR §60 keine Startvoraussetzung mehr.** Die 25er Abnahme, der damalige
Zaehler ueber 100 und eine Abnahmedatei werden beim direkten Ausbau nicht verlangt.
Bestandsintegritaet wird an den unmittelbar frisch gelesenen Stand gebunden.
Die nachfolgende historische Belegbeschreibung bleibt zur Auswertung erhalten.

Der feste Belegpfad lautet `belege/500/abnahme-a.json`. Er wird **erst aus tatsächlich
erhobenen und geprüften Production Befunden** erzeugt. Ein Platzhalter mit `bestanden:true`
genügt nicht. In diesem Sprint wird kein solcher bestandener Beleg erfunden.

Der Beleg enthält:

| Feld | Herkunft und Prüfung |
|---|---|
| `schemaVersion:1`, `stufe:"a"`, `abgenommenAm` | tatsächlicher Abschlusszeitpunkt, nicht in der Zukunft; höchstens 48 Stunden alt |
| `productionCommit` | vollständiger damals unabhängig bestätigter Production Commit, Vorfahr des aktuellen main |
| `quellen` | unverändertes Quellenformat von `funktionstest-kontrolle.js`; alle 15 Regeln werden neu gerechnet |
| `budgetTag`, `reservierungen` | echter globaler Zähler über 100 am UTC Tag der Abnahme, erneut aus der DB gelesen |
| `frischefenster`, `auftraege` | 60 eindeutige erledigte A Aufträge, 20 je `source_fetch`, `mandate_projection`, `briefing_materialization`; IDs, Mandate, Fenster und Abschlusszeiten werden erneut gelesen |
| `qualitaet` | 25 eindeutige Mandate einschließlich aller A Profile; jeweils Urteil, konkrete Begründung und vorhandener Belegpfad unter `belege/` |
| `geschuetzterBestandHash` | SHA256 der vollständigen sortierten geschützten Mandatszeilen, Identitätszeilen und Konten aus der Vorprüfung |

Die Qualitätsbelege müssen Quellenbezug, richtige Zuordnung, Aktualität und brauchbaren Inhalt
belegen. Das Programm prüft die Vollständigkeit dieser dokumentierten Abnahme, es bewertet
die verlinkten Inhalte nicht selbst. Rohkonten, Passwörter und Zugangsdaten gehören nicht in
Belegdateien. Die Vorprüfung gibt nur Summen, Hash und offene Gründe aus.

Der abgeschlossene Lagebeleg 25/25 und natürlicher Arbeitsfortschritt bleiben verwendbar.
Ein alter Zähler über 100 ist kein aktueller Tageskostenbeleg. Ein gewöhnlicher Rückstand
allein ist kein Fehler. Ein gesonderter neuer Start des zuvor abgelehnten A Workflows bleibt
an seine eigene Freigabe gebunden; der neue Fachzyklus kann A nicht ersetzen, weil er erst
bei exakt 500 startet. Eine fehlende A Abnahme blockiert ihn nicht mehr.

## Fehler, Fortsetzung und Nachkontrolle

Nach jeder Mandatsoperation wird die konkrete relationale Zeile frisch gelesen. Je zehn
bestätigte Zeilen und am Ende werden alle Bestandsinvarianten, Konfiguration, Leases,
Kommunikationsspur und Tageskosten erneut geprüft. Bei Aktivierung bleiben zusätzlich
alle Konten, Identitäten und übrigen Mandatsfelder unverändert. Auth Speicherung nutzt
den bestehenden CAS Schutz. Es gibt keine Transaktion über den gesamten Stapel und
keine Garantie gegen einen fremden Schreiber zwischen zwei Kontrollen.

Der erste Fehler oder unbekannte Schreibausgang beendet die Serie. `schreibversuche` zählt
Versuche, `bestaetigt` nur frisch gelesene Erfolge. Keine automatische Wiederholung,
Kontolöschung oder Rückabwicklung. Ein später ausdrücklich gestarteter Lauf darf bereits
vollständig vorhandene Zielprofile überspringen; Konten ohne Profil, unbekannte Inhalte und
abweichende Kennungen stoppen ihn. Einen unklaren Teilbestand erst unabhängig lesen.

Die Kostenkontrolle übernimmt den geprüften Kostenvertrag des A Ausführers: bekannte Kosten,
enge Reserve für historische Lücken und 2 USD zusätzliche Reserve; Stopp ab Prognose 9 USD.
Das ist keine atomare USD Grenze und kein Rechnungsbeleg. Keine Änderung der Aufrufdeckel.

Der Fachzyklus akzeptiert Erfolg nur bei 500 adressierten Mandaten, positiver Verarbeitung,
vollständig gespeicherter Lauftelemetrie, null endgültigen Fehlern und null Weckversand.
Eine separate DB Abfrage bestätigt die konkrete `process_runs` Quittung. Anschließend werden
Kosten, Konfiguration, Kommunikation und unveränderter Profilbestand erneut kontrolliert.
Ein HTTP Fehler oder fehlender Beleg startet keinen zweiten Versuch.

**Eine Runde ist noch keine 500er Gesamtabnahme.** Danach für alle 500 Abdeckung,
systematische Auslassungen, Quellenqualität, Briefingqualität, fortlaufenden Abfluss,
Integrität, Kommunikation und Kosten anhand persistierter Ergebnisse auswerten. Die
Ausgabe behält deshalb auch bei Erfolg `funktionsnachweis500:false`.

## Kurztest und geplanter Abschluss

Betreiber möchte ein bis zwei Tage testen. Ab tatsächlicher Aktivierung 24 Stunden planen,
höchstens 48 Stunden; konkrete Endzeit und ausführbaren Abschluss vor Beginn festhalten.
Der manuelle Workflow `500-testende.yml` prüft den Bestand und deaktiviert separat mit
`TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT` die aktiven synthetischen Zielprofile. Kein
automatischer Timer ist allein durch diesen Workflow eingerichtet. Vertrag und Grenzen
einschließlich laufender Arbeit: [SR §57.4](500-funktionstest-sicherheitsrahmen-2026-09-01.md).

Die am 07.09. dokumentierte Qualitätsprüfung aller 25 Lagebriefings hat Fehler gefunden
und ist **keine** A Abnahme. Nach Übernahme der Quellenkorrektur neue tatsächliche Texte
prüfen. Dafür hat der vorhandene manuelle 25er Workflow die separate Auswahl `briefing`
mit eigenem Bestätigungswort und unabhängigen Datenbanknachweisen (SR §57.3). Der
erfolgreiche natürliche Abendcrawl desselben UTC Tages und sämtliche vorhandenen
Starttore bleiben erforderlich. Kein Ersatzstart des abgelehnten A Workflows.

## Prüfungen und Nachweisgrenzen

Die gezielten Tests prüfen den echten Provisionierer und Aktivierer mit 475 zusätzlichen
Profilen, Fehler und Teilbestände, exakte Zielmengen, CLI Riegel, UTC Grenzen sowie echte
statt bloß behaupteter Laufquittungen. Der vorhandene verpflichtende Datenbanktest enthält
zusätzlich den kompletten direkten Ausbau über echtes PostgreSQL 17, PostgREST 12.2.3,
`storage.js`, `accounts.js` und die vorhandenen Tabellendefinitionen. Die dafür angelegte
zufällige lokale Testdatenbank enthält ausschließlich synthetische Daten.

Diese technischen Tests sind vom späteren Production Funktionsnachweis getrennt.
Vollständige Testergebnisse, PR und Deployment stehen im aktuellen SR §56 und PR Verlauf.
