# Quellenbetrieb 24.11.2026 — Sperre, Ursache und Wiederaufnahme

Alle Zeiten in Berliner Zeit (`Europe/Berlin`), ergänzende UTC-Werte in Klammern.
Rein lesender Betriebsnachweis; es wurde **kein** Code, keine Datenbankzeile und keine
Konfiguration geändert.

## 1 · Was heute geschah

Zwei Dinge gleichzeitig:

1. Die **Profilbindung ist wieder in Ordnung.** Der historische Massenfehler
   `betriebskosten-profilbindung-abweichend` hat keine Grundlage mehr.
2. Die **Quellenautomatik ist angehalten** — durch einen einzigen Lauf, nicht durch
   eine Systemstörung. Sie gibt sich um **01:00 Berlin** von selbst wieder frei.

## 2 · Gemergt und ausgerollt

Am 24.11. wurden acht PRs auf `main` gemergt:

| PR | Inhalt |
| --- | --- |
| #1329 | Worker- und Queue-Quittungen abgesichert; **Vercel-Crawl-Cron entfernt** — Quellen laufen nur noch auf Hetzner bzw. über den geschützten manuellen Weg. Fehlerprotokoll des Workers nennt jetzt eine Fehlerklasse. |
| #1330 | `gpt-5-mini-eu` in der Preistabelle ergänzt |
| #1331 | Abgleich für abgestorbene Reservierungen (neu) |
| #1332 | Kostenabgleich optional beim Worker-Start |
| #1333 | Regel A — archivierte Fassung statt Versionskonflikt-Diagnose |
| #1334 | toten Versionskonflikt-Diagnosepfad entfernt |
| #1335 | Regel A verfeinert — inhaltliche Titel-/Herausgeber-Abweichung bleibt terminal |
| #1336 | dieser Beleg (reine Dokumentation, Vercel-Build bewusst übersprungen) |

Die Hetzner-Läufe des Tages tragen nacheinander `1491c4d6`, `7d94e92c`, `5613a436`,
`0e39c4c6`, `2de88969` und `2f396992` — jeder Stand war also kurz nach dem Merge dort
aktiv. Der Worker meldete zuletzt `bereit`, `ort: hetzner-de`.

Mit #1335 bleibt eine inhaltliche Titel-/Herausgeber-Abweichung terminal
(`quellenstand-nicht-bestaetigt`); nur reiner Zeitstempel-Drift nutzt die Archivfassung.

## 3 · Profilbindung geprüft (rein lesend)

Der Verdacht war, dass die Betriebszulassung noch die 100 Mock-Profile enthält und
deshalb jede Analyse dauerhaft an der Profilbindung scheitert. **Er trifft nicht zu.**

```
kosten.aktiv: true | Vertrag gesetzt: true | Zulassung gesetzt: true
Vertrag OK: profileId=cem-ince Tagesgrenze=1 Gesamt=30 Start=2026-11-05T23:00:10Z
Zulassung roh: version=1 profileIds=1 erste=["cem-ince"]
Profile gelesen: 501
PROFILBINDUNG OK: profileIds=["cem-ince"], betriebskostenProfileId=cem-ince
```

Bestand: **501 Profile, genau 1 aktiv (`cem-ince`)**, 500 inaktive synthetische
Testprofile (`test-kohorte-synthetik-*`). Kostenvertrag und Betriebszulassung
(`HELMUT_BETRIEBSZULASSUNG_JSON`) nennen beide ausschließlich `cem-ince`.
`betriebskosten-budget.pruefeProfile()` liefert damit ein grünes Ergebnis.

**Folge:** Die 635 fehlgeschlagenen Analysen mit `betriebskosten-profilbindung-abweichend`
sind historisch und können erneut laufen — der Grund existiert nicht mehr.

### 3.1 Fehlerverteilung der 896 Analysen ohne Artikel-Fehler

| Anzahl | Fehler | Aussicht bei Wiedervorlage |
| ---: | --- | --- |
| 635 | `betriebskosten-profilbindung-abweichend` | **Ursache aufgehoben** |
| 186 | `artikel-abseits: kein-bestaetigtes-artikelziel` | bleibt voraussichtlich |
| 21 | `quellenstand-metadatenabweichung` | bleibt |
| 8 | `artikel-abseits: artikeltitel-abweichend` | bleibt |
| 7 | `verstehen-uebersprungen-dauerhaft: artikelkontext-offen` | bleibt |
| 6 | `artikel-abseits: strukturierter-artikel-mehrdeutig-oder-fehlend` | bleibt |
| 6 | `artikel-pruefung-fehlgeschlagen: skipped-failed` | bleibt |
| ~12 | `verstehen-uebersprungen-dauerhaft` (Zeitbudget, Fortsetzung, Budget) | bleibt |
| 2 | `modellausgang-unbekannt: quellenbeleg-parteien` (1/1) | bleibt |

Nur der erste Posten hat eine aufgehobene Ursache. Die übrigen 261 sind fachliche
Befunde am Artikel oder endgültige Obergrenzen: eine Wiedervorlage lässt sie
erwartungsgemäß erneut scheitern. Das ist keine Schwäche der Wiedervorlage, sondern
ihre Zusage — höchstens zwei Vorlagen, danach bleibt der Befund sichtbar.

### 3.2 Warteschlange am Abend (Stichprobe, Abfragelimit 2000 Zeilen)

| Status | Typen |
| --- | --- |
| offen (`wartend`/`läuft`) | `source_fetch` 515, `document_understanding` 52, `mandate_projection` 1, `briefing_materialization` 1 |
| fehlgeschlagen | `document_understanding` ≥ 1000 (Limit der Abfrage erreicht) |
| erledigt | `briefing_materialization` ≥ 1000 (Limit der Abfrage erreicht) |

Die Briefing-Stufe arbeitet also; der Engpass ist verstandener Inhalt. Die Zahlen sind
eine Stichprobe und keine Gesamtmenge.

## 4 · Wiedervorlage Stufe A (echt ausgeführt)

Über die bestehende RPC `helmut_jobs_wiedervorlage` (löscht nichts, setzt
`first_due_at` nicht zurück, nimmt den Fehlertext als Verlauf mit):

| Schritt | Ergebnis |
| --- | --- |
| Vorschau | 189 Kandidaten, 286 dauerhaft blockiert, 2 511 noch zu jung, ältester 18.11. |
| Trockenlauf | gefunden 189, wiedervorgelegt 0 |
| Echt (Portion 5) | gefunden 190, **wiedervorgelegt 5** |

Die 5 Aufträge stehen wieder auf `wartend` (Versuche 0). Sie werden ab dem ersten
freigegebenen Fenster abgearbeitet.

## 5 · Die Sperre: ein Lauf, eine Zeile

Lauf `cron-crawl-20261124140000-p87r2` (15:00, Commit `2de88969`) endete
`partial` mit `fehlerklasse: vertagung-unbestaetigt`:

| zielmenge | processed | deferred | fehlgeschlagen | wiederholt | leaseVerloren |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 12 | 4 | 7 | 0 | 0 | 0 |

4 + 7 + 0 + 0 = 11 von 12. **Genau eine** Zurückstellung wurde von der Datenbank nicht
bestätigt (`quellen-warteschlangenlauf.js`, `zurueckstellungNichtVerfuegbar > 0`).

`lib/helmut/quellen-automatik.js` lässt nur zwei fortsetzbare Fehlerklassen zu
(`auftraege-endgueltig-fehlgeschlagen`, `lease-ohne-fortschritt`) und hält bei allem
anderen an — bewusst, denn ein unbestätigter Ausgang ist ein offener Befund.
Ergebnis: `automatik-startfehler`, kein Fensterstart, wiederholt alle 15 Minuten.

## 6 · Belegt einmalig, nicht systemisch

Die letzten 40 Läufe des Tages wurden gelesen. `vertagung-unbestaetigt` kommt
**genau einmal** vor (14:00 UTC). Davor ausschließlich `success` sowie die beiden
fortsetzbaren Klassen `lease-ohne-fortschritt` und
`auftraege-endgueltig-fehlgeschlagen`. Die RPC selbst ist gesund
(6532 Aufrufe, 0,541 ms mittlere Datenbankzeit laut Infrastrukturabgleich).

## 7 · Warum die Sperre um 01:00 Berlin endet

`pruefe()` betrachtet nur Läufe des **laufenden UTC-Tages**. Der 15:00-Lauf
(14:00 UTC) fällt mit dem UTC-Tageswechsel heraus. Nachgeprüft durch echte Aufrufe
der Prüffunktion mit drei Zeitpunkten — rein lesend:

```
JETZT            : automatik-startfehler | erlaubt: false   (24.11., 16:40 UTC)
24.11. 23:55 UTC : automatik-startfehler | erlaubt: false   (00:55 Berlin)
25.11. 00:05 UTC : automatik-erster-start | erlaubt: true   (01:05 Berlin)
```

Der erste reguläre Slot liegt 01:00–01:04 Berlin. Es ist **kein** Eingriff nötig:
weder Codeänderung noch Datenbankkorrektur noch Neustart.

## 8 · Verbrauch am 24.11. (UTC-Tag)

| Größe | Wert |
| --- | --- |
| Modellkosten abgerechnet | 0,672405 USD von 1,00 USD |
| Offene Buchungen | 0 |
| Verbrauchte Fenster | 54 von 96 |
| Reservierte Sekunden | 16 200 |
| Originale | 0 |

Damit waren am Abend nur **0,3276 USD** frei; eine Analyse reserviert allein 0,232 USD
(konservative Obergrenze für 400 000 Eingabetoken). Ein zusätzliches Admin-Fenster
hätte heute höchstens **eine** Analyse starten können.

## 9 · Entscheidungen

- **Die 500 Testprofile bleiben.** Sie sind inaktiv, werden nicht mitgeplant und sind
  der Beleg des bestandenen Mock100-Nachweises. Löschen wäre eine
  Production-Datenänderung mit null Nutzen und würde Nachweise vernichten.
- **Kein Admin-Fenster heute.** Grund: nur 0,3276 USD frei, ein Fenster hätte eine
  Analyse geschafft. Ab 01:00 Berlin gilt gleichzeitig frisches Tagesbudget und
  freie Automatik.
- **Keine Codeänderung an der Fortsetzbarkeitsregel.** `vertagung-unbestaetigt` ist
  bewusst nicht fortsetzbar; das ist durch
  `scripts/quellen-automatik-route-test.js` ausdrücklich abgesichert. Ein Aufweichen
  hätte einen bestehenden Schutztests gebrochen.

## 10 · Nächster Schritt

1. Nach 01:00 Berlin die Nachtläufe lesen: `document_understanding`
   `fehlgeschlagen` sinkend, `erledigt` steigend; `process_runs` ohne neue
   `vertagung-unbestaetigt`-Zeile.
2. Danach **Stufe B**: die verbleibenden ~185 Kandidaten in Portionen von 25–50
   wiederbeleben, vor jeder echten Portion ein Trockenlauf. Unveränderte Grenzen:
   1 USD je UTC-Tag, 30 USD insgesamt.
3. Ziel bleibt die gefüllte Kundenausgabe: Lage 06:45/06:55, Paket 07:10/07:20 Berlin.

## 11 · Ausdrücklich nicht gemacht

Kein Löschen von Profilen, Jobs, Läufen oder Belegen. Keine Migration, kein Cron,
keine Umgebungsvariable, kein Secret, kein Budget, kein Originalverbrauch, kein
zusätzlicher Admin- oder Modellaufruf. Die fünf wiederbelebten Aufträge sind die
einzige Zustandsänderung des Tages.

## 12 · Nachprüfung (rein lesend)

```bash
# Automatik-Entscheidung jetzt
docker exec helmut-quellenworker-worker-1 node -e \
 'require("/app/lib/helmut/quellen-automatik").pruefe().then(r=>console.log(r.grund,r.erlaubt))'

# Letzte Quellenläufe mit Fehlerklasse
docker exec helmut-quellenworker-worker-1 node -e \
 'require("/app/lib/helmut/storage").listProcessRunsRelational({process:"warteschlange-crawl",limit:10}).then(r=>r.forEach(x=>console.log(x.runId,x.status,x.fehlerklasse)))'
```

Die Zeitpunkte aus §7 lassen sich wiederholen, indem `pruefe({ now: () => <ms> })`
übergeben wird; die Prüffunktion liest ausschließlich.

## 13 · Serverzugang und Diagnosewerkzeuge

Die Anmeldung am Hetzner-Server (`root@helmut-worker`) erfolgt mit dem vorhandenen
Schlüssel `helmut_auto`. Die Firewall erlaubte Port 22 zuvor nur von einer einzelnen,
alten Quelladresse; der Betreiber hat die Freigabe erweitert. Danach lief die erste
Diagnose ohne Unterbrechung.

Auf dem Server liegen zwei Hilfsskripte:

| Datei | Zweck |
| --- | --- |
| `~/update-helmut.sh` | Rollout des gewünschten Commits |
| `~/diag.sh` | fünf rein lesende Diagnoseabschnitte: Worker-Version und letzte Logzeilen, Warteschlangen-Pipeline, Fenster- und Kostenstand |

Hinweis für die Bedienung: `diag.sh` gibt viel aus; die letzten Zeilen sind nicht der
Anfang. Bei Fragen gezielt einen Abschnitt oder einen Einzelbefehl ausführen.
