# Gesicherte Bereinigung auf exakt500 Zielprofile

Betreiberauftrag25.09.: Roadmap vollautonom, alle erforderlichen Freigaben und
Entscheidungen delegiert. Die vier Nichtzielkennungen sind angela-merkel,
helmut-abnahme-berlin, james-brown und max-mustermann. Keine davon gehoert
zu den495 synthetischen oder fuenf geschuetzten realen Zielprofilen.

## Konkreter Plan

Eine atomare Production-Transaktion,15s Anweisungsgrenze und2s Sperrwartezeit.
Voraussetzungen:504/0,505 Identitaeten, genaue vollstaendige Profil-/Konten-/
Main-/Fairnessgrundlinien, keine laufenden Jobs/Prozesse/Leases/Testfenster.
Die16 bekannten Profil-Fremdschluessel muessen unveraendert kaskadieren.

Vor Entfernung in der privaten Betriebsquittung bereinigung-exakt500-20260925-a
sichern:4 Identitaeten,4 Mandatszeilen,46 Briefings,480 Entscheidungen,
8 Matchinglaeufe,98 Matchingtreffer,2 Profilvektoren; insgesamt642 Zeilen.
Alle17 betroffenen Tabellen werden fuer die uebrigen Profile vollstaendig
ueber ihre PostgreSQL-Zeilenversionen (ctid,xmin) gebunden. Unerwartete weitere Zielzeilen oder Fremdschluessel stoppen.

Zusaetzlich: zwei inaktive Konten mit ihrer urspruenglichen Listenposition,
drei vorhandene eigene Inhaltsablagen und die betroffenen Profilkopien sichern.
Nur diese Konten entfernen; Sitzungen/Zuordnungen/Passwortlinks muessen fehlen.
Kostenbuecher, KI-Nutzung und Auditgeschichte bleiben unveraendert erhalten.
Nur die vier alten Fairness-Metadateneintraege von max-mustermann entfernen;
keine laufende oder historische Laufquittung umschreiben. Geteilte Rohquellen
bleiben erhalten; explizite eigene Rohquellen wuerden die Ausfuehrung sperren.
Main/Auth erhalten neue UUID-Revisionen; der Fairnesszaehler steigt.
Damit koennen vorherige Leser nicht zurueckschreiben.

Nachbedingung innerhalb der Transaktion: exakt500 Mandatsprofile/0 aktiv,
501 Identitaeten, kein Zielrest in17 Tabellen; saemtliche uebrigen Tabellenzeilen
zeilenversionengleich, Speicher exakt wie geplant. Bei jedem Fehler vollstaendiger Rollback.
Danach unabhaengig Quittung, alle17 Schutz-Hashes, Bestand und Kosten nachlesen.

Rueckweg: nur aus exakter ruhender Nachhergrundlinie. Alle642 Zeilen in
Abhaengigkeitsreihenfolge, die drei Inhaltsablagen, Profilkopien und Konten
einschliesslich Reihenfolge wiederherstellen. Neue Kostenhistorie bleibt erhalten.
Revisionen werden auch beim Rueckweg erneuert. Kein Wiederherstellen ueber fremde
Profil-/Tabellen-/Speicheraenderungen. Keine Modelle, Aktivierung oder Kommunikation.

## Lokaler Nachweis

Isolierte PGlite-Datenbank mit echten Feldtypen und den642 gesicherten
Nichtzielzeilen:10/10 Gruppen bestanden. Vollstaendige Entfernung/Schutz,
Kosten-/Auditgleichheit, Einmaligkeit, exakter Rueckweg, aktive Profile,
laufender Job, falsche Grundlinie, fremde Querverknuepfung mit vollem Rollback,
Rueckwegsperre bei spaeteren Aenderungen.
Der erste Laborlauf stoppte an einer mehrdeutigen lokalen SQL-Variablen;
nach eindeutiger Qualifizierung bestanden alle Gruppen. Keine Production-Wirkung
dieses Laborfehlers. Operator-Dateien liegen privat unter /private/tmp/helmut-cleanup500-*.

**Production-Bereinigung verifiziert; noch kein500er Funktionsnachweis.**

## Begrenzter erster Production-Versuch

12:38UTC:15s Anweisungsgrenze beim vorherigen vollstaendigen JSON-Aggregat der
Briefingtabelle erreicht (3443 Zeilen,189227008 Byte Relation inkl. Indizes/TOAST).
Abbruch vor dem ersten Schreibzugriff. SELECT12:38:55UTC bestaetigt504/0,
keine Bereinigungsquittung und unveraenderte Profil-/Identitaeten-/Main-/Authhashes.

Die Schutzpruefung nutzt nun die exakte PostgreSQL-Zeilenversion jeder
unbetroffenen Zeile (ctid,xmin). Die Tabellen sind waehrend der Transaktion
gegen konkurrierende Schreiber und Tabellenumbauten gesperrt. Jede Aenderung,
Entfernung oder neue Zeile aendert diesen vollstaendigen Versionsfingerabdruck;
die grossen unveraenderten Briefinginhalte muessen nicht sortiert werden.
Der Rueckweg ist entsprechend an genau diese erhaltenen Zeilenversionen gebunden.
Der unabhaengige Labornachweis vergleicht weiterhin die vollen Inhalte.
Zeitgrenze und sachlicher Schutzumfang bleiben unveraendert.

## Neu bewerteter Speichervertrag

Der zweite Production-Versuch stoppte vor dem ersten Write an einem falschen
Revisionstyp: Main/Auth benutzen UUIDs, Fairness einen Ganzzahlzaehler.
SELECT12:40:21UTC bestaetigt504/0, keine Quittung und alle Grundlinien unveraendert.
Ursache gegen storage.writeSupabaseStore und auth-store-cas geprueft: neue UUID
je Schreibvorgang, nicht numerische Fortschreibung. Vorwaerts- und Rueckweg
verwenden jetzt gen_random_uuid(); die Labordaten tragen die echten Feldtypen.
Zusaetzliche Laborgruppe belegt, dass alte UUIDs keinen Schreibzugriff mehr
legitimieren. Gesamter korrigierter Plan erneut10/10 Gruppen bestanden.

## Production erfolgreich12:41UTC

Korrigierter begrenzter Plan12:41:36UTC einmal erfolgreich ausgefuehrt.
Quittung abgeschlossen;642 Zeilen gesichert und entfernt, zwei inaktive Konten
entfernt, drei eigene Ablagen entfernt. Nachlesung12:41:57UTC:500/0,501
Identitaeten,498 Konten;0 Nichtzielkonten/Ablagen. Alle17 Schutzfingerabdruecke
passen, auch117631 Entscheidungen und3397 Briefings der Zielprofile unveraendert.
Mainrest sowie Kosten-/Auditrest bytegleich; Main-/Fairnessnachzustand exakt.
[Maschinenlesbarer Beleg](500-bestandsbereinigung-nachweis-20260925.json).

SELECT12:42:01UTC:0 Jobs/Locks/Leases,0 offene Kosten,0,304227USD Tagesverbrauch.
Regulaerer Version2-Snapshotvertrag mit frischen501 Identitaeten/498 Konten
und unveraenderten500 Mandatszeilen bestanden;0 ausserhalb. Ziel-ID-Hash
weiter dda70a02c9918d73a7ae45b7ab4febd6bae5a1df0a4d3fc65b9a260c62bcdfc6.
Dies ist eine Bestandspruefung, kein zeitgebundenes Aktivierungsmanifest.

PR569/Dokumentationsstand vorher:38d2906254810552afeafbf52387dd3bfacce9ad,
Pflicht-CI36134841820 SUCCESS, Deployment dpl_7qyTwcZcFhGk8zyY33ft4XcGGQCk
READY. Fehler-/Fatal-Logs12:35:40–12:37:04UTC leer.
