# Lokale Graphtransport-Qualifikation19.10.2026

## Entscheidung und Geltungsbereich

**Kein angenommener Speicherfix. Graph-Reuse bleibt standardmäßig OFF und ist
im tatsächlichen500er-Descriptor ausdrücklich gesperrt.** Die lokale Variante
ist ein gesicherter Versuch, keine Productionintegration. Der zuvor einmalig
freigegebene Ressourcenlauf `a2521b52a505` bleibt am gemeinsamen Speicherlimit
gescheitert, sein GO verbraucht; [vollständiger Ausgang](local-resource-outcome-20261019.md).

Der Versuch verwendet genau einen privaten Graphzeugen für den aktuellen
Target/Store/Generation/Root/Originalhash. Ein frischer nativer Leser prüft bei
ausgelassenen Transportbytes sämtliche tatsächlichen gespeicherten Payloadhashes,
Erreichbarkeit, Postorder, Größen, Tiefe und Arbeitsgrenzen. Nonce, aktuelle
Revision, vollständiger Historiennachweis, Knotenzahl und Knotendigest binden die
Antwort. Der Digest ist keine Signatur und ersetzt nicht den authentifizierten
nativen Datenbankursprung. Der Client führt weiterhin den vollständigen Decoder
aus. Alle fachlichen Berechtigungs-/Kosten-/Quellen-/Profil-/Frist-/Notstoppprüfungen
und atomaren Schreibbedingungen bleiben unverändert. Keine Autorität aus Write-ACKs.

Der private eingefrorene Zeuge ist auf8MiB serialisierte Bytes je aktuellem
Cacheeintrag begrenzt. Das begrenzt weder den gesamten Prozessheap noch alte,
durch konkurrierende Reads noch referenzierte Einträge. Es ersetzt keine
gemeinsame Kernelmessung. Änderungen, falsche Bindungen, Neustart oder ein zu
großer Zeuge führen zum vollständigen Abruf beziehungsweise sicheren Fehler.

## Gezielte Sicherheitsabnahme

Der finale native Fall `graph-e5b24e976f` besteht24/24 Gruppen:6 bestehende
Graphprüfungen,8 Historienprüfungen und10 neue Gruppen für Kalt-/Warmzugriff,
Revisionsfortschritt, Rootänderung, acht manipulierte Antworten, konkurrierende
Snapshots/Stale-CAS, Berechtigungen/fehlerhafte Eingaben, echte zurückgerollte
Payloadmanipulation, echten Prozessneustart, Local-only-Grenzen und Cacheoverflow.
Das tatsächliche Payloadhashing liegt hinter der bestehenden32MiB-Vorgrenze.
13 damals ausgeführte Sourcepins sind gebunden. Native Fixture und Originale
bleiben nach Abschluss unverändert, alle eigenen Prozesse beendet.

Die nachträgliche reine Descriptor-/SourceBinding-Sperre wurde unabhängig als
Delta geprüft;14/14 gezielte Offline-Integrationstests bestanden. Sie erlaubt
keine Aktivierung des Experiments im vollständigen Ablauf. Der neue Modus ist
Teil der SourceBinding; der Source-only-Vorcheck stellt fremde Envwerte auch bei
Fehlern synchron wieder her. Keine erneute native Vollwiederholung für diese
rein hostseitige Sperre.

## Genau ein gepaarter kleiner Vergleich

Endgültig verglichen wurden `read-path-8896b373d9` und `read-path-9c6a273fa0`:
derselbe aktuelle Code,16 übereinstimmende vollständige Quellen-/Eingangspins,
21 gleiche native Funktionskörper und gleiche PG-Einstellungen. Je42 gemessene
Operationen einschließlich32 zusätzlicher No-op-Schreibvorgänge,120 vollständige
HTTP200-Antworten,36 CAS-Aufrufe,5.000 Historienzeilen,500 zurückbehaltene Units,
1.000 Intents und künstliche4MiB Padding. Jede Seite nutzt ein eigenes1GiB-
Loopdateisystem in derselben unveränderten gemeinsamen Kernelmessung.

| Messgröße | Graph OFF | Graph ON |
|---|---:|---:|
| Gemeinsamer Peak, ganze eigene Lebensdauer |910.200.832B|1.087.426.560B|
| Prozessmaximum Node-RSS, separat |575.496.192B|757.100.544B|
| Gemeinsame CPU |55,919067s|51,953633s|
| Ganze eigene Lebensdauer |62,440453383s|55,892483956s|
| Summe42 gemessener Aufrufe |12,827629863s|13,275280298s|
| Langsamster gemessener Aufruf |559,023663ms|602,771453ms|
| Antwortbodybytes |505.304.460B|40.165.378B|
| Beobachtete kumulierte DB-Tempbytes |458.960.409B|465.334.800B|
| Beobachtete WAL-Statistikdifferenz |1.113.930B|1.117.470B|

Graph ON spart92,051% Antwortbytes und7,091% Gesamt-CPU, erhöht aber den
maßgeblichen Peak um177.225.728B beziehungsweise19,471%. Der langsamste Aufruf
und die Summe der einzeln gemessenen Aufrufe steigen. Die kürzere ganze
Lebensdauer ist eine andere Messgrenze und widerlegt das nicht.75 kompakte und
drei volle Graphantworten zeigen wirksame Wiederverwendung bei gleicher Root
trotz frischer Revisionen. Der bestehende innere CAS-Renderer bleibt36-mal mit
53.448 Temp-Schreibblöcken erhalten; inklusive Nested-Zähler wurden nicht addiert.

Beide Fälle stellen Root, Historie, Benutzer, Geldbücher und übrige Daten
vollständig wieder her. Eigene Kernelgruppen einschließlich Storagehelper und
letztem Prozessende sind leer, Originalpins unverändert, keineOOMs.

Der Mehrpeak entsteht im Workload; Samples zeigen mehr anonymen Speicher bei
ähnlichen Dateicachegrößen. Die genaue Allokation/GC-Ursache und der exakte
Peak-Auslöser sind nicht belegt. Node-RSS und gemeinsame Kernelpeaks sind
verschiedene Maxima und dürfen nicht als additive Zerlegung verwendet werden.
Temp-/WAL-Differenzen sind kumulierte Beobachtungen, keine simultanen Peaks.
Ein künstlicher kleiner Vergleich beweist weder Unit60/Auth30 noch500/1500/8000
oder die Productionbelastung. Keine Hochrechnung auf500, kein erneuter Gesamtlauf.

## Genau freigegebene Speicherbereinigung

Das neue ausdrückliche GO vom19.10. erlaubt ausschließlich zehn im SHA-gebundenen
Plan benannte, beendete Containerhüllen. Vor der ersten Entfernung wurden alle
Identitäten, Stillstand, Image, Cgroup, Mounts, Config, unveränderte Diffs, beide
Logstreams, exklusiven Layeridentitäten und Abhängigkeiten frisch geprüft. Das
lokale private Wiederherstellungsarchiv wurde mit45 regulären Mitgliedern und
44 Manifestpins vollständig rückgelesen. Zwei einzige311B-Rootkonfigurationen
sind darin gesichert; keine Datenbankinhalte gelöscht oder hochgeladen.

Exakt zehn `docker rm FULL_CID`, ohne force/volumes/prune: tatsächlicher Gewinn
**9.116.696.576B**, frei unmittelbar danach **17.260.896.256B**, damit die damalige
16.589.934.592B-Plattenreserve erfüllt. Alle Datenverzeichnisse/Volumes/Images,
Originale, Belege und der ursprüngliche laufende PG-Prozess bleiben erhalten.
Ein separater transienter Read-only-Metadatenhelper war keine zusätzliche
historische Hülle. Der generische Kurz-ID-Guard ist begrenzt; im konkreten
Zustand war der einzige Nichtzielcontainer ohne jegliche Containerreferenz.

Nach den beiden notwendigen kleinen Vergleichen sind deren neue Artefakte und
vier Hüllen bewusst erhalten: zuletzt **13.403.398.144B** frei, also wieder unter
der vollständigen16.589.934.592B-Startreserve. Keine weiteren Löschungen durch
dieses GO erlaubt. Keine Reserve für einen neuen500er-Lauf behaupten.

## Belege und nächster notwendiger Schritt

Nur fünf notwendige SAFE-Berichte, insgesamt51.856B, liegen im bestehenden
privaten Driveordner. Alle vollständig rückgeladen, byte- und SHA256-identisch,
nur Owner-ACL, keine Zugriffsänderung. Das Containersicherungsarchiv, GO-Dateien,
Rootkonfigurationen, Rohlogs und vertrauliche Originale bleiben ausschließlich
lokal. Der frühere Ressourcenmanifest bleibt unverändert erhalten.

- [Messentscheidung](https://drive.google.com/file/d/1oQSYGLD6vnqLhAAyBk7G5uHVt2bpuimX/view)
- [Unabhängige Paarabnahme](https://drive.google.com/file/d/1LpDuct_rvIqusGPK-aQ-uELpe7Nvo1fd/view)
- [Bereinigungsergebnis](https://drive.google.com/file/d/1GLe8vKIUJqtRVyiaM8VMz39f08mroyen/view)
- [Unabhängige Bereinigungsabnahme](https://drive.google.com/file/d/1auQNSnt9rYs-P21VeCyOv8akEm6LIxFx/view)
- [Unabhängige Codeabnahme](https://drive.google.com/file/d/1pXATTzxagKqXj3nYVJRZCJiZEJzIBPKW/view)
- [SHA256-Addendum](https://drive.google.com/file/d/1QZVA4A6r6QMQQC_bjG1aJ5mivypWd_8C/view),
  SHA256 `ba6e36a968b490e1486e53e2e5ae7114aaf41a5377b4bab977062866d0f1d419`.
  Auch das Manifest vollständig rückgeladen und bytegleich geprüft; insgesamt
  sechs Dateien/55.530B. Der lokale vollständige Rückdownloadbeleg ist
  `wave43-graph-wire-reuse/SAFE_DRIVE_COMPLETE_RETURN_VERIFICATION.SAFE.json`.

Nächster enger Architekturentscheid: unnötige große dekodierte Zustandskopien
im Node-Leser vermeiden, ohne frische native Ist-Payloadnachweise, aktuelle
Zustandsbindung oder irgendeine fachliche Kontrolle zu entfernen. Das ist eine
unqualifizierte Alternative, noch keine implementierte oder gemessene Lösung.
Keine weitere ungezielte CPU-/WAL-/Cache-/Rendereroptimierung aus diesem Ergebnis
ableiten. Vor einem neuen Gesamtlauf sind eine tatsächlich angenommene Korrektur,
neue Fall-/Zeit-/Codebindung, freie Reserve,32 vollständige Vorbedingungen und
ein separates konkretes GO erforderlich. Kosten-/Productiontore bleiben offen.

Sol integrierte/bewertete lokal; eine bestehende unabhängige Codex-Prüfinstanz
prüfte nur Quellen und vorhandene Belege. Keine neue bezahlte DeepSeek-Abnahme,
kein Push/Merge/Deployment, keine Productionaktion und kein Verbrauch eines500er-GO.
