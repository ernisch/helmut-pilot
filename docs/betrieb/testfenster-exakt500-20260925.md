# Start- und Endvertrag nach der Bereinigung auf exakt 500

25.09.2026. Vorbereitungscode; keine Production-Migration, Bereinigung,
Aktivierung oder Testausführung in diesem Sprint.

Der bisherige Null/500/Null-Vertrag erwartet 504 Mandatsprofile, 505
Identitäten und vier ausgeschlossene Profile. Nach der in der Roadmap
verlangten Bereinigung würde er deshalb Start und Ergebnislesung ablehnen.
Die installierte Endfunktion akzeptiert ebenfalls nur dieses alte Manifest.

Manifestversion 2 verlangt ausdrücklich genau 500 Mandatsprofile, 501
Identitäten und keine ausgeschlossene Kennung. Die Zielmenge bleibt dieselbe:
495 vollständig geprüfte synthetische Profile plus fünf ausdrücklich
ausgewählte Bestandsprofile. Alle sind vor dem Start inaktiv. Nach Entfernung
der zwei inaktiven Nichtzielkonten bleiben drei aktive Bestandskonten;
synthetische Konten bleiben inaktiv. Diese Kontenannahme wurde am 25.09.
um 09:53 UTC rein lesend belegt; sie ist vor einer Bereinigung frisch zu prüfen.
Version 1 bleibt für alte Quittungen unverändert lesbar und beendbar.

Start und Ende schreiben weiterhin ausschließlich den Aktivzustand und
Zeitstempel der gebundenen 500 sowie ihre Testfensterquittung. Start verlangt
passende vollständige Grundlinien, ruhende Arbeit, ein höchstens fünf Minuten
altes Startfenster und freie Kosten innerhalb des unveränderten 4-USD-Tageslimits.
Eine zusätzliche Profilzeile verhindert den Version-2-Start. Der Ergebnisleser
behält unabhängig vom Aktivzustand alle 500 als Nenner.
Auch Textnachlauf und direkter Fachzyklus akzeptieren den bereinigten Bestand
nur über eine gültige aktive Version-2-Quittung. Fehlende Kennung, beendetes
Fenster oder unzureichende Restzeit sperren den Fachaufruf; die bloße Zahl 500
genügt nicht. Frühere Betriebsformen bleiben unverändert gebunden.

Die vorbereitete Migration
`20260925100000_testfenster_null500_bereinigt.sql` ersetzt ausschließlich
die vorhandene Endfunktion, sodass sie beide Manifestversionen gebunden
beenden kann. Installation verlangt gesondertes GO. Keine Tabelle, kein
Timer, keine Profiländerung und keine erweiterten Tabellenrechte entstehen
durch Installation. Zugriff bleibt auf service_role begrenzt.

Der zugehörige Rollback stellt die bisherige Funktion wieder her. Er verweigert
die Rücknahme bei einer aktiven Version-2-Quittung. Vor jedem späteren Start
müssen die installierte Endfunktion, der lebende Endwächter und der unabhängige
manuelle SQL-Rückweg belegt sein. Ein Code-Revert ersetzt kein sicheres Ende.

Gezielte lokale Prüfung: 9 Planergruppen, 4 Ergebnislesergruppen,
16 Direktvertragsgruppen, 10 Quellenruhegruppen und 11 Endwächtergruppen
erfolgreich. Der bestehende Pflicht-CI-Datenbanklauf wurde um tatsächliche
Version-2-Start-/Endtransaktionen, zusätzliche Profilzeilen, die Endfunktion
über PostgreSQL/PostgREST und den abgesicherten Rollback erweitert.
Im ersten CI-Lauf 36121395357 bestanden Version-2-Aktivierung, manueller
Rückweg und Ablehnung eines zusätzlichen Profils. Die neue Endfunktion
scheiterte an einer fehlenden Klammer um den CASE-Ausdruck ihrer Versionsprüfung.
Der Ausdruck ist korrigiert; vollständiger RPC-Nachweis und finale Pflicht-CI
stehen weiterhin aus. Der erweiterte Textnachlauf bestand lokal 34/34 Gruppen,
einschließlich vollständiger 500er Fixtureauswahl und Sperre ohne Fensterkennung.
Der Actionsadapter bestand 32/32 Gruppen, einschließlich Version-2-Fachlauf
und Ablehnung fehlender Kennung, beendeten Fensters und zu kurzer Restzeit.

Die vier Nichtzielprofile sind lediglich identifiziert. Ihr vollständiger
Löschplan samt abhängigen Datensätzen, Sicherung und gesondertem Daten-GO
bleibt ein eigener Schritt. Dieser Code bereinigt den Bestand nicht und
erteilt keine Freigabe für den 500er Production-Nachweis.
