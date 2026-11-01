# W15: Empfang und isolierten Restore im selben Job verbinden

Auftrag vom29.10.2026: ausschließlich Code, gezielte synthetische Tests und
Draft-PR vorbereiten. Kein echter Restore, kein neuer Originalempfang oder
Sourceexport, kein End500/Mock500, Merge, Deployment oder Production-Eingriff.
Der erfolgreiche Zwölfdateienempfang40876458074 bleibt unverändert als Beleg
erhalten und wurde nicht wiederholt. Vergangene Runner-Klartexte werden nicht
als heute vorhandene Eingaben vorausgesetzt.

## Verbindung innerhalb eines künftigen Jobs

Die neue Bibliothek `scripts/w15-github/restore_connection.py` verbindet die
vorhandenen Komponenten in einem Prozess auf demselben Runner. Sie hat keinen
CLI-/Workflow-Startmodus und startet beim Import nichts. Es wurde kein neuer
ausführbarer Workflowmodus hinzugefügt. Die folgenden Aufrufe sind eine
Schnittstellenbeschreibung für einen später gesondert freigegebenen Job;
sie wurden jetzt ausschließlich mit erfundenen Adaptern geprüft:

```python
connection = restore_connection.prepare_same_job(
    forward, context, common_resources,
    source_review_raw=source_review_raw,
    source_review_sha256=independently_bound_review_sha256,
    node_source=verified_node_path,
    postgrest_source=verified_postgrest_path,
)
# Erst im gesondert freigegebenen begrenzten Restorelauf:
result = connection.restore_only()
```

Zuerst werden der echte Actions-/Branch-/Commit-/Versuch1-Kontext, bestehender
gemeinsamer Parent und vollständiger aktueller SourceReview geprüft. Danach
bindet der vorhandene `apply_context` den bestehenden Controller. Diese Prüfungen
laufen vor Anlage des neuen Controller-Laufverzeichnisses; die bestehende
Frischesperre wird nicht gelockert.

Der interne `_receive_existing_verified` liefert nur intern die tatsächlich
verifizierte Empfangswurzel und den bisherigen Bericht, erst nach bestätigt
geschlossenem GPG-Agent. Öffentlicher Empfänger und CLI bleiben pfadfreie
Summary-Wrapper. Im künftigen Job übergibt die Verbindung die private Wurzel
direkt an `forward.open_runtime_inputs`. Genau dieser kanonische Modulloader
erhält die bestehende strikte RuntimeInputs-Typbindung. Ein grüner Bericht
allein ersetzt keine Input-/SourceReview-/Manifest-/Relokationsprüfung.

Erst danach baut `runtime_cache.stage_cache` den frischen privaten Laufbaum mit
zwei vorhandenen gepinnten Binärdateien und den qualifizierten Paketdateien auf.
Bytes und SHA256 aller vier Quellen müssen passen; ein öffentlicher Paketbaum
wird nicht nur wegen gleichbleibendem Dateinamen angenommen. Exklusive Kopien,
Streaming/Readback und CommonResources-Guard bleiben Pflicht. Quellen nur root-
oder Worker-eigen; keine freie UID-Ausnahme, Downloads oder npm-Installation.
Der vorhandene `forward.prepare` ergänzt aktuelle App-/Lib-/Scriptdateien. Die
neue Cachekopie beweist keine vollständige App-/Abhängigkeitsabnahme.

## Gemeinsame Restorekante und harte Begrenzung

Der bestehende Restoreblock ist in `runtime_restore` geteilt. Der Legacypfad
verwendet dieselben Befehle wie zuvor. Der Runtimepfad verwendet dieselben
fünf fachlichen Schritte: Datenbank anlegen, Rollen, Dump nach SQL rendern,
transaktional einspielen und auf0aktiv setzen, frisch500Profile/0aktiv lesen.
Ab dieser Kante beginnen im Vollcontroller erst Seed/Postimages/Atomik/500CAS;
die neue `restore_only`-Verbindung ruft diese Fortsetzung nicht auf.

Native Kinder laufen über die bestehende OwnedBackupRunner-Technik, jetzt mit
zwei festen getrennten Scopes. Der bisherige Backupdefault bleibt erhalten.
Der neue Scope erlaubt ausschließlich fünf feste Restoreaktionen, denselben
Node-Identitäts-/TERM-/echten Child-Exit-Vertrag und den bestehenden Stophelfer.
Docker-Client-Exit allein ist kein Nachweis des nativen Restoreabschlusses.
Private Lebenszyklus-/Ausgabe-/Fehlerdateien werden gehasht zurückgelesen.
Die gerenderte SQL-Fassung wird vor Apply erneut gebunden; kein unbelegter
Wechsel zwischen geprüftem Render und tatsächlichem Einspielen.

Der getrennte Restorepfad übernimmt bestehende Vorprüfungen, Materialisierung,
readonly Asset-/Seed-Readbacks und Ressourcenüberwachung. Containerrechte sind
an frische Labels, Run/Nonce/Commit, Image, Parent und tatsächliche Container-ID
gebunden. Nur dieser Container wird beendet; PID0, Exit0, kein OOM und der
abschließende Parentreadback sind Pflicht. Ein Finalsamplefehler verhindert
keinen Versuch, den Monitor geordnet zu schließen. Erstfehler bleiben erhalten,
Teilprodukte/Container werden nicht gelöscht und nicht automatisch wiederverwendet.

Die zwölf Input- und neun Provenienzbindungen bleiben für die vorhandene
Sicherungsanbindung verfügbar. `runtime_backup._closure` wird nicht gelockert
oder mit erfundenen Full-End500-Belegen erfüllt. Ein reiner Restore ist weder
vollständige Sicherung noch unabhängiger Rücksicherungsnachweis.

## Tatsächlich gezielt geprüft

38 neue synthetische Fälle:4 Empfangs-Handoff,14 Cache,11 native Restore-/Scope-
Prüfungen,9 gemeinsame Verbindungs-/Abschlussfälle. Hinzu kommen6 notwendige
Regressionen des geänderten gemeinsamen OwnedBackup-/Stopanschlusses. Keine
echte Datenbank, Docker-/Originalausführung oder Empfängerkontrolle. Kleine
erfundene Node-Kinder prüfen allein den Stop-/Exitvertrag. Die neue CI-Zeile
prüft diese Verbindungen künftig auf dem tatsächlichen PR-Kopf.

Unabhängige lesende Gegenprüfungen bestätigen Empfang, Cache-Pin-Nachtrag,
Forward-Extraktion und neue Restorepipeline. Der notwendige Paketpin-Fix wurde
umgesetzt und gezielt nachgeprüft. Prüfungen werden nicht als Runtimebeleg
eines GitHub-Restores ausgegeben. RAM-Vertrag unverändert: gemeinsamer Parent/
Container2560000000Bytes, Lebenszeitpeak≤2048000000, Reserve512000000, Swap0.
Standalone-Full500-Controller und bestehende vollständige Backupclosure bleiben
bytegleich. Kein neuer Schlüssel, keine Infrastruktur, kein Modell-API-Aufruf.

## Verbleibende tatsächliche Startblocker und nächste Freigabe

1. Ein künftiger Job braucht einen tatsächlich erreichbaren qualifizierten
   Checkout und gepinnte Node/PostgREST-/PG17.6-Runtime innerhalb der vorgesehenen
   UID/GID1000-Topologie. Der historische Forkfix löste nur den Probe-Scriptstart;
   er beweist nicht sämtliche späteren Git-/Quell-/Cachezugriffe auf einen
   möglicherweise UID1001 gehörenden Checkout. Der neue Aufrufer erwartet diesen
   Bootstrap; ein ausführbarer gemeinsamer Restore-Workflow ist noch nicht belegt.
2. Frischer echter Parent, kompletter Platten-/Restore-/WAL-/Log-/Kopierbedarf,
   lokales tatsächliches Image und aktuelle Commit-/Run-/Nonce-/Reviewbindung
   müssen vor privater Ausführung geprüft sein. Deklarationen ersetzen das nicht.
3. Der tatsächliche Same-Job-Empfang und Originalrestore mit nachgewiesenem
   nativem Prozessabschluss fehlen. Dafür ist der einmalige frühere Runner nicht
   wiederverwendbar. Keine neue Beschaffung oder Fristverlängerung aus diesem
   Vorbereitungsauftrag ableiten.
4. Vollständige Controller-/Lebenszeit-RAM-/Fach-/Rücksicherungsabnahme bleibt
   danach separat offen. Ein500/0-Restore ist kein End500- oder Mock500-Beleg.

Weitere Codevorbereitung braucht keine zusätzliche Freigabe. Die nächste
geschützte Freigabe wäre nach konkretem Bootstrap-/CI-/Startreview **genau ein
begrenzter gemeinsamer GitHub-Job mit erneuter Übergabe des verschlüsselten
Index, Empfang der bestehenden15Cipherteile und isoliertem Restore bis500/0**,
ohne Seed, Auth-CAS, End500/Mock500 oder Production. Dieses GO ist jetzt nicht
erteilt oder durch die synthetischen Tests ersetzt; kein solcher Lauf gestartet.
