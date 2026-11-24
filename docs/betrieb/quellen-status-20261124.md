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

| Was | Beleg |
| --- | --- |
| PR #1335 „Regel A verfeinern" gemergt, `main` = `2f396992` | Merge-Commit `2f396992` |
| Hetzner-Worker auf `2f396992` ausgerollt | Worker meldet `bereit`, `ort: hetzner-de` |

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
