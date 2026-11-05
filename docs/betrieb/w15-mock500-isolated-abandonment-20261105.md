# Ein isolierter Nachfolger nach abgebrochenem Mock500

Run [41939166457](https://github.com/ernisch/helmut-pilot/actions/runs/41939166457)
auf Runtime `33d588b6209ad912c5045f6561c07b7dc3d60e63` bleibt **UNKNOWN**.
GitHub bestätigt `completed/cancelled`; das bestätigt weder native Nullaktivität
noch acht erfolgreiche Bereinigungen, vollständige Ergebnisse oder Sicherung.
Die spätere authentisierte Cancel-Annahme ist ebenfalls kein solcher Nachweis.
Alte Grants, STOPs, Journale, Gegenanker und private Laufbelege bleiben bytegleich.

## Belegte Unabhängigkeit

Der genaue Runtimekopf verwendet für `mock500-full-gated` einen frischen Standard-
`ubuntu-24.04`-Runner. Laut [GitHub-Runnervertrag](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)
erhalten diese Jobs eine neue VM. Kontext und Controller erzeugen neue, an Run und
Nonce gebundene Verzeichnisse und lehnen vorhandene Laufpfade/Container ab.
Primärdatenbank und zweite Rücksicherung liegen in eigenen frischen PGDATA-Verzeichnissen.
Der PostgreSQL-/PostgREST-Container hat `--network=none`, keinen veröffentlichten Port
und `--restart=no`; Anwendung und lokale Testzugänge zeigen auf diese Testdatenbank.
Die Quellenbaseline wird aus den gebundenen Eingaben gelesen, nicht aus einer
gemeinsamen Productiondatenbank.

Die VM selbst ist nicht offline: Originalempfang und authentisierter Artefakttransport
benötigen Netzwerkzugriff. Der geprüfte externe Schreibpfad ist auf GitHub-Laufstatus,
Logs und höchstens ein verschlüsseltes Artefakt des jeweiligen Runs begrenzt. Beim
alten Run sind null Artefakte authentisiert beobachtet. Eine neue VM übernimmt weder
seine PGDATA noch Testprofile oder Prozesse. Das beweist die Unabhängigkeit eines
neuen Testbestands, nicht den fehlenden sauberen Abschluss des alten Bestands.

## Enger Vertragszusatz

Die gesonderte Betreiberzustimmung erlaubt genau einen unabhängig gebundenen
Nachfolger dieses abgebrochenen Runs unter der bestehenden Dauerfreigabe.
`helmut-w15-mock500-isolated-abandonment/1` ergänzt das vorhandene append-only
Standing-Journal um `ISOLATED_ABANDONMENT` samt Gegenanker. Das alte HOLD bleibt
UNKNOWN; es entsteht ausdrücklich kein `TERMINAL`, kein sicherer FAIL und kein PASS.

Vor dem Zusatz und erneut vor dem nächsten CLAIM müssen gelten:

- Exakter alter Claim, vollständiges HOLD-Ereignis, Run, Job, Nonce und Runtime;
  authentisierter Abschluss `completed/cancelled`, Versuch 1, erwarteter Workflow,
  Ausführungsbranch und GitHub-Standardrunner. Kein aktiver oder unklarer Dispatch.
- Unveränderte historische Dateien und vollständige authentisierte manuelle
  GitHub-Historie; gesonderte Betreiberbindung sowie unabhängige Isolationsabnahme.
- Neuer Kontrollkopf mit eigener Pflicht-CI, gezielten Tests und Sicherheitsreview;
  Runtime bleibt exakt `33d588b6`. Der funktionale Workerfehler wird damit nicht
  als behoben behauptet. Der kontrollierte neue Bestand ist separat zugelassen.
- Genau eine frische nächste Nonce, neuer Case, Code-/Original-/Quellenbindung,
  aktuelles Zeitfenster, Kostenprüfung und unabhängiger vollständiger Vorflug.
- Start, Beobachtung und Eigentümer-Abbruch nutzen denselben ausdrücklich gebundenen
  vorhandenen GitHub-Zugang. Kein Fallback auf den früher fehlgeschlagenen Zugang,
  keine Secretänderung. Erfolgreicher GET und historische Cancel-Annahme garantieren
  keine zukünftige Tokenlebensdauer; bei erneuter Unklarheit bleibt der neue Lauf HOLD.

Nur die exakt im Zusatz gebundene nächste Ausführung darf `priorAbandonmentSHA256`
verwenden. Fehlende, geänderte, widersprüchliche oder wiederverwendete Belege sperren.
Ein SECURITY-/COST-HOLD ist nicht zulässig; ein zweiter solcher Zusatz ist ebenfalls
gesperrt. Nachfolgende sichere funktionale FAILs bleiben an tatsächlich belegte minimale
Reparaturen gebunden. Ein erneutes UNKNOWN erhält keine automatische Fortsetzung.
Normale PASS-, FAIL-, Kosten-, Produktions- und Originalintegritätsregeln bleiben bestehen.

## Abnahme und Grenzen

17 gezielte Standing-Prüfungen bestehen, darunter unveränderte bisherige Übergänge,
frischer Nachfolger, wiederholter/falscher Zusatz, abweichende Bindung, fehlende
Authentisierung, Zeitablauf, Sicherheits-HOLD, veränderte Historie und normale
Reparaturfortsetzung nach dem neuen Lauf. Der private operative Anschluss wird separat
mit synthetischen Daten und unabhängiger Sicherheitsprüfung qualifiziert. Die eigene
Pflicht-CI muss auf dem finalen veröffentlichten Kontrollkopf bestehen.

Der vollständige nächste Mock500 muss sämtliche 500/500/1.000/1.500/8.000/17.000-
Sollwerte, fünf Fehlerkategorien, vollständige Sicherung, authentisierte Rücklesung,
zweite Wiederherstellung, Integrität, native Nullaktivität und acht Bereinigungen
aus demselben tatsächlichen Lauf nachweisen. Historische Ergebnisse ersetzen das nicht.

180 Minuten Verarbeitung/210 Minuten Gesamtvertrag, gleicher UTC-/Berliner Tag im
Fenster 1.–7. November, dynamisches Hostlimit mit 2.147.483.648 Byte Reserve,
536.870.912 Byte freie Platte, Swap/OOM/Grenzereignisse null und höchstens 60
DB-Verbindungen bleiben unverändert. Der GitHub-Job hat einen äußeren YAML-Timeout
von 240 Minuten; daraus wird keine zusätzliche Vertragslaufzeit. Innerer Vertrag und
Eigentümer-Watcher begrenzen den Ablauf auf 210 Minuten. Nur vorhandener kostenloser
Public-Standard-Actions-Pfad, ein verschlüsseltes Artefakt/Tag, null echte Modellaufrufe.

Rückweg: neuen Zusatz nicht verwenden, weitere geschützte Starts gesperrt lassen.
Keine automatische Branchrücksetzung, Löschung oder Umwertung alter Belege. Kein Merge,
Deployment oder Productioneingriff. Dieser Entwicklungsstand selbst startet keinen Job.
