# Lokaler Kandidat: unveränderliche Teile des Kontenspeichers

Dieser Kandidat ist ausschließlich lokal und standardmäßig ausgeschaltet.
Er ist keine Production-Migration und keine Freigabe für einen weiteren 500er Lauf.

Beim Ressourcenlauf `5d168e3561a5` blieb nach der getrennten Verbrauchshistorie
die wiederholte vollständige Aktualisierung des übrigen JSONB-Kontenspeichers
übrig. Der Lauf überschritt die gemeinsame Grenze von 2.048.000.000 Bytes.
Die neue lokale Variante ersetzt diese großen Schreibvorgänge durch
unveränderliche, inhaltsadressierte Teile und einen kleinen atomaren Wurzelzustand.

## Daten- und Sicherheitsvertrag

- `llm_usage` bleibt im bereits bestehenden append-only Verfahren. Neue
  Verbrauchseinträge, Wurzelzustand und dessen Versionsnummer werden in derselben
  Transaktion unter derselben globalen Zeilensperre geändert.
- Jeder Teil erhält seinen SHA256 aus den tatsächlich gespeicherten UTF-8-
  Nutzdaten. Der Hash ist eine native generierte Spalte; Clients können ihn
  nicht überschreiben. Der UTF-8-Hashhelfer ist nur für Datenbanken mit festem
  `server_encoding=UTF8` zulässig.
- Die Struktur eines unveränderlichen Blatts wird beim Einfügen geprüft. Tiefe
  und Größen entstehen als generierte Spalte aus denselben tatsächlichen Bytes;
  Aufrufer können diese Werte nicht vorgeben oder überschreiben. Frische Leser
  verwenden diese gebundene Strukturinformation, berechnen den erreichbaren
  aktuellen Zustand und prüfen weiterhin alle Gesamtgrenzen.
- Begrenzte Objektblätter bis 16 KiB und Pakete aus höchstens 32 Arrayelementen
  bis 64 KiB vermeiden Tausende winzige Teilobjekte. Die globale Größen-, Tiefen-
  und Arbeitsgrenze bleibt erhalten. Bei zu vielen Blattwerten oder einem zu
  großen Paket werden Referenzknoten verwendet.
- Die Wurzel enthält nur Versionsnummer, Verbrauchsbindung und Inhaltsbindung.
  Die Inhaltsbindung enthält eine neue serverseitige Generation, den tatsächlichen
  Wurzelhash und den nativen Originalhash vor der lokalen Umstellung.
- Leser rekonstruieren alle aktuellen Daten aus diesem Zustand. Berechtigungen,
  Profile, Quellen, Kosten, Fristen und Notstopp werden weiterhin frisch geprüft.
  Keine Sicherheitsentscheidung wird zwischengespeichert.
- Der lokale Graphleser liest Wurzel, Versionsnummer und vollständige
  Verbrauchsbindung aus einem frischen konsistenten Datenbank-Snapshot. Er
  verwendet denselben nativen Vorlauf für Knoten-, Tiefen-, Text- und
  JSONB-Arbeitsgrenzen wie der vollständige native Leser. Es wird keine
  Zeilensperre für diese stabile Leseoperation behauptet; Änderungen werden
  weiterhin durch den atomaren Versionsvergleich beim Schreiben geschützt.
- Statt die Daten zuerst in PostgreSQL und danach im Client erneut aufzubereiten,
  überträgt dieser Leser die tatsächlichen unveränderlichen Nutzdaten. Der Client
  berechnet jeden SHA256 frisch aus diesen Bytes und prüft Postorder, vollständige
  Erreichbarkeit und Gesamtgrenzen. Ein unbekannter Wurzelhash wird zusätzlich
  durch vollständige erneute Kanonisierung mit dem bisherigen Verfahren geprüft.
- Ein privater einzelner Wurzelhash merkt ausschließlich die mathematische
  Feststellung einer erfolgreichen Kanonisierung. Höchstens ein privater,
  erreichbarer Graph darf bereits geprüfte unveränderliche Knoten wiederverwenden.
  Er ist an Ziel und Generation gebunden und auf 20.000 Knoten, 32 MiB Nutzdaten
  sowie 256 MiB aufsummierte Textarbeit begrenzt. Alle tatsächlichen Bytes,
  Kindreferenzen und Grenzen werden auch bei Wiederverwendung frisch geprüft.
  Ein anderer Ziel-/Generationsschlüssel ersetzt diesen Bestand; ein Neustart
  verliert ihn. Eine abgeschlossene neue Lesung ersetzt alle nicht mehr
  erreichbaren Knoten. Keine frühere Berechtigung oder aktuelle Kontensicht wird
  daraus übernommen.
- Vor Rückgabe werden alle logischen Objektvorkommen getrennt kopiert. Eine
  Änderung eines gleichlautenden Werts darf keinen zweiten Wert mitverändern.
  Die privaten wiederverwendbaren Knoten werden niemals dem Aufrufer ausgehändigt.
- Der Writer darf unveränderte Teile aus genau diesem bestätigten Ziel-/Wurzel-
  und Generationsstand übernehmen. Dafür vergleicht er die tatsächlich
  transportnormalisierten JSON-Werte vollständig mit den privaten geprüften
  Werten. Objektidentität oder eine behauptete Hashgleichheit genügen nicht.
  Jeder übernommene Knoten durchläuft erneut denselben SHA256 und dieselbe
  gemeinsame Knoten-, Byte-, Arbeits- und Tiefenzählung wie ein neuer Knoten.
- Nur eigenständige kanonische Werte sind dafür geeignet: Wurzel, normale
  Objekt-/Arraywerte und kompakte Blätter. Virtuelle Hashbucketteile und
  Verkettungsgruppen dürfen nicht allein wegen gleichen logischen Inhalts in
  einen anderen Strukturkontext übernommen werden. Die Vergleichstexte gehören
  zum selben begrenzten privaten Graphen und werden im gemeinsamen Speicher
  mitgemessen. Ohne passenden privaten Zustand verwendet der Writer vollständig
  das bisherige Erzeugungsverfahren.
- Neue Teile werden vor ihrer Verwendung geprüft; Fremdgenerationen, fehlende
  Teile, Zyklen, widersprüchliche Schlüssel und überschrittene Größen-/Tiefengrenzen
  dürfen keinen teilweise geschriebenen Zustand hinterlassen.
- Der JS-Writer trennt die versendeten Daten vor dem ersten `await` von den
  veränderlichen Objekten des Aufrufers. Bestätigungen gelten ausschließlich für
  diese gesendeten Inhalte und die private gelesene Version. Unbekannte
  Netzwerkausgänge werden nicht automatisch wiederholt.
- Alte Writer und direkte Änderungen an gebundenen Daten bleiben gesperrt.
  Der native Rückweg rekonstruiert den vollständigen Zustand unter derselben
  Sperre, erhält die Verbrauchshistorie und vergibt eine neue Version. Die
  unveränderlichen Teile bleiben als Archiv erhalten.

Die normale Schreibschnittstelle akzeptiert die vom JS-Codec erzeugte Darstellung.
Ein privilegierter direkter RPC-Aufruf mit einer anderen gültigen Darstellung ist
nicht als normaler Writer unterstützt. Der JS-Leser muss eine abweichende
Inhaltsbindung vor Rückgabe verweigern; die native Wiederherstellbarkeit wird
gesondert geprüft. Das ist keine Behauptung einer zweiten nativen JS-Kanonisierung.
Der lokale Protokollkandidat ist noch nicht veröffentlicht. Eine Änderung der
Kanonisierung sperrt alte Quellbindungen; alte Testaufträge werden nicht erneut
verwendet. Der native Rückweg bleibt verfügbar.

Eine am Arrayende ausgerichtete Paketierung bewahrt nicht alle Teilobjekte bei
Sortierung, Anhängen oder gleichzeitigem Voranstellen und Kürzen. Insbesondere
`processRuns` mit fester Länge benötigt dafür einen eigenen Verbrauchsbeleg;
ein Vergleich mit unveränderter Liste beweist diesen Schreibpfad nicht.

## Lokale Anbindung

Beide expliziten Schalter sind erforderlich:

```
HELMUT_LLM_USAGE_STORAGE=relational-atomic-v1
HELMUT_AUTH_STATE_STORAGE=merkle-auth-v1
```

Nicht lokale URLs und `VERCEL` werden abgewiesen. Die SQL-Vorlage liegt unter
`supabase/proposals/auth_state_parts_local.sql`; sie wird ausschließlich in einer
neuen eigenen isolierten Zieldatenbank nach der bestehenden Verbrauchsumstellung
angewandt. Code-, Umgebungs-, native Funktions-, Trigger-, Rechte- und
Originaldatenbindungen gehören zur Anbindung im bestehenden Messpfad.

## Abnahme

Der letzte kleine Datenbankvergleich vom 18.10.2026 umfasst 96 logische
Änderungen, 120 tatsächliche CAS-Schreibzugriffe, 32 Aufrufe des bestehenden
`storage.recordProcessRun` einschließlich Kürzung sowie 24 neue Nullkostenbuchungen.
Die 5.000 vorhandenen Verbrauchseinträge bleiben erhalten. Vollständige native
Rekonstruktion und manuell berechneter Sollzustand stimmen überein. Andere
Kostenbücher, Profile, Originale und Quellen bleiben unverändert.

| Messgröße | Bisheriger Speicherweg | Neuer Kandidat |
| --- | ---: | ---: |
| Gemeinsamer Kernel-Speicherhöchststand | 975.331.328 B | 850.702.336 B |
| CPU einschließlich Vorbereitung und Prozessende | 43,383262 s | 48,445973 s |
| Schreibfenster | 37,427360 s | 39,377216 s |
| Langsamste logische Operation | 861,359 ms | 724,807 ms |
| WAL als tatsächliche LSN-Differenz | 114.742.888 B | 6.091.128 B |
| Temporäre Datenbankdateien | 0 B | 0 B |

Der neue Weg spart in diesem Vergleich 124.628.992 B gemeinsamen Speicher und
94,69 % WAL. Der Dateicache wächst in den beiden Hälften um 4.952.064/1.888.256 B
statt 144.711.680/87.379.968 B. Der Speicher enthält PostgreSQL, PostgREST, Node,
Hilfsprozesse und Dateicaches bis zum vollständigen Prozessende. WAL und
Datenbankdateigrößen haben ergänzende Stichproben; diese werden nicht als
kontinuierliche Maxima ausgegeben. Kein Cache wird aus der Messung entfernt.

Der bisherige Speicherweg stammt aus der unmittelbar zuvor gemessenen identischen
Last. Danach ändern sich genau zwei Dateien ausschließlich im zugeschalteten
Parts-Pfad; neun weitere Quellenbindungen bleiben gleich. Die Nicht-Parts-Zweige
werden auf Bytegleichheit geprüft. Dies ist ein offengelegter Referenzvergleich,
kein gleichzeitig ausgeführtes A/B-Paar. Unterschiede der Hostauslastung bleiben
eine Einschränkung. Die 5,21 % Mehrzeit beziehen sich auf das Schreibfenster;
CPU benötigt 11,67 % mehr Zeit. Das ist ein reales verbleibendes Zeitrisiko.

Aktuelle native Sicherheitsabnahme: 17/17 Prüfgruppen und strikter Katalog aller
14 Funktionen bestanden, gemeinsamer Peak 813.383.680 B. Darin liegen negative
Payload-/Bindungs-/Grenzfälle, konkurrierende Versionen, Schutz vor Änderungen,
Rechte und Rückweg. Die getrennten Codec-Prüfungen vergleichen vollständige
Payloadmengen und Wurzeln mit dem unveränderten Builder, einschließlich
Kontextwechseln und verlorener privater Wiederverwendungsbindung.

DeepSeek V4 Pro High prüft die Wiederverwendung, vollständige Closure,
Kontextzulässigkeit und unveränderte Grenzen positiv. Sein Rohurteil bleibt
`blocked`: Der einzige angeführte fehlende State-Guard ist bereits unverändert
vor dem Zugriff vorhanden, wurde aber im engen Quellenausschnitt nicht
mitgeliefert. Die unabhängige Sol-Disposition enthält die tatsächliche Quelle
und Bytegleichheit zum abgenommenen Vorgänger. Es wird keine vorbehaltlose
Modellfreigabe oder vom Modell ausgeführter Test behauptet.

Belege im privaten ursprünglichen Workspace liegen unter
`wave35-auth-state-parts/meter/WRITE_REUSE_*` und
`wave35-auth-state-parts/security/WRITER_REUSE_*`. Die Messwerte qualifizieren
den Kandidaten für die Vorbereitung eines neuen vollständigen Ressourcenlaufs.
Sie belegen weder eine Speicherobergrenze für 500 Profile noch Unit60/Auth30.
Weitere isolierte Varianten werden auf dieser Basis nicht begonnen.

Kleine Tests verwenden die bestehende gemeinsame Kernelmessung einschließlich
PostgreSQL, Node, PostgREST und Dateicaches. Der Vergleich benötigt identische
Schreiblast, vollständige Datenprüfung, WAL, temporäre Daten, CPU und langsamste
Antworten. Kleine Tests ersetzen weder Unit60/Auth30 noch den vollständigen
500er Ressourcennachweis.

Die unveränderten Grenzen bleiben Offline90, Unit60, Auth30 und gemeinsamer
Speicher höchstens 2.048.000.000 Bytes. Ein neuer vollständiger Lauf benötigt
einen neuen gebundenen Kandidaten, den vollständigen Vorabcheck und ein separates
ausdrückliches lokales GO. Keine bestehende verbrauchte Freigabe wird verwendet.

## Herkunft der Prinzipien

- [Instagram Explore](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/):
  wiederverwendbare Daten von frischen Eingaben trennen.
- [Instagram Immortal Objects](https://engineering.fb.com/2023/08/15/developer-tools/immortal-objects-for-python-instagram-meta/):
  physische Kopien unveränderlicher Objekte vermeiden. Die CPython-Technik selbst
  wird hier nicht übernommen.
- [Stripe Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement):
  unveränderliche Ereignisse mit einem nachvollziehbaren konsistenten Kontenstand.

Diese Quellen begründen die Wahl des Prinzips. Sie belegen keine gemessene
Speicherersparnis, keine lokale Sicherheitsabnahme und keine Production-Eignung.
