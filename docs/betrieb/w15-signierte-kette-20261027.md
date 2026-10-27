# W15: echte signierte isolierte Verbindung, 27.10.2026

**Ergebnis: PASS fuer die signierte Backendkette bis `prepared0`.**
Kein Nachweis einer aktiven500er-Ausfuehrung oder heutigen D-Senderfreigabe.
Eigener Branch auf PR971/969; beide bleiben ungemergt. Main bleibt6b4012cd.
Der [bereinigte Einzelbeleg](belege/w15-signed-chain-20261027/SIGNED_CHAIN.SAFE.json)
enthaelt zwoelf erfolgreiche Pruefungen, Messungen und Hashes der erhaltenen
Rohberichte. Es wurden keine Originaldaten erneut uebertragen.

## Aenderungen

Aus PR967 nur die benoetigte getrennte Auftragsverlaengerung bis31.10.:
EU-Vertrag, Kostenbuch, Routen-/Datumsbindung sowie zwei kleine Adapterstellen.
Der urspruengliche Vertrag/SHA78833d91 bleibt erhalten; Geldlimits,9h,
Einmaligkeit und historische Kostenbuecher bleiben gleich. Die Verlaengerung
verlangt den exakten neuen Hash in Auftrag, Route und Runtime; kein Datums-ENV.
Keine SQL-Proposals, Migrationen, Finanzierungslesewege oder sonstigen PR967-
Aenderungen uebernommen. Nur die vier betroffenen Workerquellpins aktualisiert.

Originalrestore im vorhandenen netzlosen PG17.6 unveraendert belassen. Fuer den
gezielten Test neue isolierte Datenbankkopien angelegt; nur dort Profile inaktiv,
simulierte Nullkostenbuecher und frische lokale Freigaben/Signaturen fuer27.10.
angelegt. Die native `vorbereiten`-SQL installiert wirklich `prepared0`, ohne
Aktivierung, neue Rollen oder Funktions-/ACL-Aenderungen. Echte PostgREST12.2.3
laeuft voruebergehend im vorhandenen Container; roher Docker-stdio-Tunnel und
vorhandenes REST-Tor verbinden ausschliesslich Loopback. Kein neuer Container,
Server, Hetzner oder Productionzugriff. Der temporaere REST-Prozess wird beendet;
Originalrestore, Testkopien und Fehlerbelege bleiben erhalten.

## Was wirklich durchlief

- Echtes `prepare`: gespeicherte Commandbytes, vollstaendige C-Pruefung,
  frische native Nachlesung, neue Ed25519-Signatur und immutable Ablage.
- Echte Root-Dateipins und signierte Installation im isolierten Ziel.
- Kaltes `open` in neuem Prozess nur mit oeffentlichem Schluessel:
  Wiederherstellung ohne erneutes C, ALS, echte native Runtime-Lesung;
  `vorbereitet`,500Mandate/501Identitaeten/0aktiv.
- Tatsächlicher HTTP-Endpunkt: Status200 mit1500 **ausstehenden** Positionen;
  falscher Token404, zusaetzliches Profil409, Start409 ohne Claim/Attempt.
- Manipulierte Signatur und bereits abgelaufenes frisch erzeugtes Zertifikat
  werden von den echten Pruefern und HTTP abgewiesen. Reale Uhr unveraendert.
- Ein geaendertes Fachprofil scheitert im echten nativen Runtimepruefer;
  vollstaendige Negativtransaktion zurueckgerollt und Zustandsvergleich gleich.
- Tatsächlicher persistenter CAS-Einmalclaim: zweiter Claim und erneuter Claim
  nach Prozessneustart scheitern. Eigene Operation gestoppt; keine Unit betreten,
  keine Attempts/Modelltickets, keine Anbieteraufrufe, keine500erAusfuehrung.

HTTP409 maskiert seinen konkreten internen Grund. Deshalb wird daraus **nicht**
behauptet, genau der Aktivitaetsriegel sei im HTTP-Aufruf getroffen worden.
Eine zusaetzliche Diagnose nach Schliessen des kurzlebigen REST-Tors scheiterte
mit `fetch failed`; erhalten und nicht als Anwendungsergebnis mitgezaehlt.
Der aktuelle Harness ergaenzt fuer einen spaeter ohnehin erforderlichen Lauf
einen direkten echten Aktivitaetsriegel-Assert sowie einen Pristine-Copy-Assert.
Diese spaeteren Harness-Ergaenzungen sind keine nachtraeglich bestandenen Faelle.

## Wichtige Eingabegrenze

Die unveraenderten ordinary-v1-Originale tragen16.10. als Eingabetag und kein
aeusseres `briefingDatum`. Fuer die aktuelle **lokale Protokollfixture** sind nur
Kalendermetadaten und davon abhaengige Hashes neu gebunden; keine Quelldaten,
Urteilstexte oder Frischepruefer geaendert. Der echte aktuelle D-Vorflug scheitert
nach51 geprueften Eingaben bei einem Berliner Profil am leeren Quellenkontext.
Das ist ein Ablehnungsbeispiel, keine vollstaendige heutige500erD-Pruefung.
Rein lesend eingegrenzt: dessen einzige ausgewaehlte Quelle ist vom13.10.,
11:02:48UTC; der unveraenderte14Tage-Cutoff lag beim Test am13.10.,15:38:22UTC.

Fuer den begrenzten Backendtest erzeugt der unveraenderte originale D-Preparer
historische Requestbytes aus den Originalen mit explizitem Fixture-Datum
16.10.,10:01UTC. Es werden keine alten Freigaben, Signaturen oder archivierten
Requestbytes wiederverwendet. Heutige Kontextdescriptoren und historische
Requesthashes sind getrennt gebunden. C rekonstruiert den D-Prompt nicht:
dieser Erfolg belegt **keine** semantische Gleichheit/heutige D-Senderzulassung.
Der heutige v1-Sender besitzt keinen angenommenen historischen Snapshotpfad.
Kein Wechsel auf den alten grossen V2-Datensatz und kein Aufweichen der14Tage.

## Messungen und Tests

| Messung im erforderlichen instrumentierten Lauf | Ergebnis | Grenze |
|---|---:|---:|
| Echtes signiertes `prepare`, inkl. C und nativer Nachlesung |24,409s|90s|
| Voll-C darin |20,602s|Teil von90s|
| Kaltes `open` bis Kontext |5,547s|60s|
| Maximaler RSS des Vorbereitungsprozesses |1.402.634.240B|keine gemeinsame Abnahme|
| Maximaler RSS des kalten HTTP-Prozesses |441.159.680B|keine gemeinsame Abnahme|

RSS ist kein gemeinsamer Kernelpeak von Anwendung, Datenbank und Transport.
Die2.048.000.000B-Grenze samt gewuenschten500MB Reserve bleibt offen; ebenso
echte Unit60s/Auth30s und der abschliessende500erLauf. Historische W15-Messungen
werden nicht wiederholt oder mit diesen Teilmessungen zu einer Abnahme addiert.

Gezielt bestanden:12 reale Verbindungspruefungen,5 wiederverwendete/ergaenzte
PR967-Vertragsgruppen,20 vorhandene Testauswahlpruefungen. Die privaten
Originaltests sind explizit aus automatischen Sammelsuiten ausgeschlossen.
V8-Coverage im ohnehin benoetigten Lauf erfasst:13 Rohdateien/168 geladene
Helmutmodule; Funktions-Eintritte der fuenf geaenderten geladenen Module im
JSON. Keine Gesamt-Repoprozentzahl, Zeilen-/Branch- oder Worker-Coveragebehauptung.

Fehlerfolge erhalten: aktueller Quellenkontext; falsche Harness-Erwartung ueber
die erste unsortierte Row; streng abgewiesene Gleichheit von Konstruktion/Start.
Korrekturen betreffen nur Fixture-Aufbau, echte Sicherheitsfunktionen bleiben
unveraendert. Zwoelf Checks erst im vierten Versuch gruen. Der Rohbericht hat
ein falsch benanntes Feld `proofExecutionWasNotAuthorized:false`; es enthielt
tatsaechlich `prepared.executionAuthorized=false`. Der Abschluss normalisiert
zu `proofExecutionAuthorized:false`, ohne den Rohbericht zu aendern.
Urspruenglichen Restore durch vollstaendige Mandats-/Storehashes und Counts
verglichen; kein Vollhash aller Tabellen behauptet. Unabhaengiger lesender
Codex-Review ohne Blocker fuer diesen begrenzten Umfang.

## CI und verbleibender Schritt

Basis PR971/7c99ee34: [CI40510429293](https://github.com/ernisch/helmut-pilot/actions/runs/40510429293)
vollstaendig erfolgreich, einschliesslich Standard, Bereich, nativer DB und
Browser/Mobile. Die zuvor dokumentierten Zwischenfehler sind damit ueberholt.
Codekopf `da63309c44625f072afb8ccaf924fc0b3da77877`:
[CI40534410137](https://github.com/ernisch/helmut-pilot/actions/runs/40534410137)
vollstaendig erfolgreich: Syntax, Standard, Bereich und saemtliche vorgesehenen
nativen Schritte einschliesslich Z22. Browserjob erfolgreich, UI-Pruefungen
gemaess vorhandener Auswahl uebersprungen; bestehender Browserbeleg7c bleibt.
Der anschliessende reine Statusnachtrag aendert keinen Anwendungscode und traegt
`[skip ci]`, damit dieselbe Vollserie nicht grundlos wiederholt wird. Der gruen
belegte Codekopf bleibt ausdruecklich da63309c, kein behaupteter neuer Testlauf.

Vor einem vollstaendigen Nachweis bleiben die heutige D-Kontextbindung des
historischen W15-Datensatzes und die gemeinsame Unit-/RAM-Abnahme zu schliessen.
Productionmerge/-rollout, Aktivierung und vollstaendiger500erLauf samt bezahlten
Modellen bleiben separat gesperrt. Ein500erStart-GO ist derzeit nicht sinnvoll.
