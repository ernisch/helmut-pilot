# Katalogsperren fuer Native-D: gezielte normale SQL-Gegenproben

Stand07.10.2026. Fortsetzung nach PR838 auf main`9eb1434a`.
Sieben neue, erstmals gemeinsam erfolgreiche Gruppen auf isolierter
PostgreSQL17.6, gepinntes Image mit deaktiviertem Containernetz.
Kein Production-Write, Modellaufruf, neuer Vollcapture oder STOP-Kostenexport.
Native-D bleibt nicht zur Installation zugelassen.

## Frisch beobachtete Rechte

Ein begrenzter RR/RO-Read am07.10.00:02:58.273795UTC zeigt
`current_user=session_user=postgres`, Server17.6,
`rolsuper=false`, `rolcreaterole=true`, `rolcreatedb=true`.
Die sieben geprueften Kataloge `pg_class`, `pg_proc`, `pg_namespace`,
`pg_authid`, `pg_auth_members`, `pg_default_acl`, `pg_event_trigger`
gehoeren `supabase_admin`: SELECT vorhanden, UPDATE/INSERT/DELETE fehlen.
Das ist ein aktueller RO-Caller-/Rechtebeleg, keine Messung des schreibenden
Migrationscallers und keine Production-Gegenprobe einer LOCK-Anweisung.
Eine gezielte RO-Ergaenzung am00:09:02.826015UTC bestaetigt auf allen
sieben Katalogen auch MAINTAIN/TRUNCATE=false. Damit fehlen alle vom
PostgreSQL-Core fuer SHARE-/ACCESS-EXCLUSIVE-Locks akzeptierten Rechte.
AccessShare durch SELECT wuerde Katalogwrites nicht ausschliessen.

Die lokale Testrolle ist ein Nichtsuperuser mit CREATEROLE und eigenen
Fixtureobjekten, ohne UPDATE auf `pg_class`. Alle streitenden Befehle laufen
unter dieser normalen Rolle. Sie simuliert nicht Supabases gesamte
Rollen-/Supautils-Politik. Statement15s/Transaktion17s/Lock2s bleiben gesetzt.

## Gepruefte Positivsperren und konkrete Auswege

Die erste Gruppe bindet Caller, Nichtsuperuser-/CREATEROLE-Rechte und Fristen.
Die sechs folgenden Gruppen pruefen jeweils eine echte vorhandene Sperre
und, wo vorhanden, einen unabgedeckten Schreibpfad:

| Normale Sperranweisung | Belegte Sperrwirkung | Gleichzeitig erfolgreicher Ausweg |
| --- | --- | --- |
| ALTER FUNCTION mit unveraendertem SECURITY INVOKER | Weitere Funktionsoption und Funktions-GRANT erreichen Locktimeout bei konfigurierten2s | Kein Gesamtschutz fuer neue Funktionen/Abhaengigkeiten behauptet |
| Wiederholter vorhandener Tabellen-GRANT | Weiterer Tabellen-GRANT erreicht Locktimeout bei konfigurierten2s | Spalten-GRANT auf derselben Tabelle |
| Wiederholter vorhandener Schema-GRANT | Weiterer Schema-GRANT erreicht Locktimeout bei konfigurierten2s | CREATE TABLE in demselben Schema |
| Wiederholter vorhandener Default-ACL-GRANT | Andere ACL fuer denselben vorhandenen Schluessel erreicht Locktimeout bei konfigurierten2s | Neuer bisher fehlender globaler Funktions-Default-ACL-Schluessel |
| Unveraenderter Membership-GRANT | Weiterer GRANT derselben vergebenen Rolle erreicht Locktimeout bei konfigurierten2s | Neue Rolle an dasselbe bereits geschuetzte Mitglied |
| ALTER ROLE mit unveraendertem NOLOGIN | Weiterer Rollenattribut-ALTER erreicht Locktimeout bei konfigurierten2s | Membership-GRANT an dieselbe Rolle |

Alle sieben Gruppen bestanden im neuen Lauf. Befehle, Synchronisationsmarken,
Rueckgabecodes und Originalausgaben bleiben separat privat gepinnt.
Keine Vollbestandsperformance oder native Commit-/OS-Gesamtfrist bewiesen.
Die bisherigen52-Tabellen-/58-Journal-/Katalog-Gegenbelege bleiben unveraendert;
diese Gruppen ersetzen oder wiederholen deren Originalereignisse nicht.

## Unterstuetzte Mechanismen und Beleggrenzen

Die PostgreSQL17.6-Quelle zu
[LOCK-Rechten](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/commands/lockcmds.c#L279)
erlaubt SELECT fuer AccessShare, INSERT bis RowExclusive und
MAINTAIN/UPDATE/DELETE/TRUNCATE auch fuer SHARE/ACCESS EXCLUSIVE. Gepinntes oeffentliches Supautils
`df32bd65` erweitert bestimmte privilegierte Utilitybefehle, aber enthaelt
keinen LOCK-Stmt-Sonderweg; dessen Stand ist kein Pin der installierten
Produktionsbibliothek. Keine Production-Sperrprobe oder Rechteausweitung.

Die PostgreSQL17.6-Quelle zu
[Schema-Rename/Owner](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/commands/schemacmds.c#L249)
zeigt Katalogtupleoperationen; eine unveraenderte Owner-Zuweisung ist ein No-op.
Ein bestehendes Tuple zu sperren ist keine Sperre gegen neue Schluessel.
COMMENT-/SECURITY-LABEL-Objektlocks und REASSIGN OWNED werden unabhaengig
gegen die tatsaechlichen CREATE-/ALTER-Schreibpfade beurteilt, nicht pauschal
als globaler Katalogschutz verwendet.

Supabases aktuelle
[Event-Trigger-Dokumentation](https://supabase.com/docs/guides/database/postgres/event-triggers)
erlaubt dem normalen `postgres` durch Supautils die Erstellung/Verwaltung
und ausdruecklich das Deaktivieren von Event-Triggern.
Der relevant normale Kundenwriter wird daher nicht still durch einen
hypothetischen Superusergegner ersetzt. Ein Event-Trigger darf ohne belegte
Bootstrap-/Selbstschutz-/Rollenabdeckung nicht als Gesamtsperre gelten.

Unveraenderte Objektsemantik macht No-op-DDL nicht nebenwirkungsfrei:
ALTER/GRANT kann vorhandene Event-Trigger ausfuehren. Deren Callbackkoerper
und dynamische Abhaengigkeiten muessen vor einem solchen Sperrpraefix
schon geklaert sein. Der neue Fixturelauf beweist keinen Trigger-Selbstschutz.

Das gepinnte offizielle Management-API-Schema beschreibt POST migrations
mit query/name und einem optionalen rollback-String.
[Offizieller Vertrag, gepinnt d95ff5bd](https://github.com/supabase/supabase/blob/d95ff5bda979f910698edf0741a9ccbe92fbbbfb/apps/docs/spec/api_v1_openapi.json). Es nennt weder die
tatsaechliche Datenbankrolle noch eine gemeinsame Transaktion mit dem
Journal oder den Umgang mit geliefertem COMMIT. rollback ist kein
dokumentierter Dry-run-Schalter. CLI-Quellcode ersetzt diese API-Belege nicht.
Kein Production-Migrationsversuch wurde zur Ermittlung dieser Fakten gestartet.

## Gepruefte Verbindungssteuerung und konkreter Transportblocker

Der erste neue lokale Entwurf wurde vor einer Verbindungsabschaltung abgewiesen:
PostgreSQL17.6 erlaubt ALLOW_CONNECTIONS=false nicht fuer die aktuelle Datenbank.
Originalquelle/-fehler/-ereignisse bleiben erhalten; kein erfundener Erfolg.
Die gezielte korrigierte Folge mit einem Controller in einer anderen Datenbank
bestand vier neue Gruppen: neue Zielverbindungen werden abgewiesen, vorhandene
Zielsitzung bleibt nutzbar; normaler CREATEROLE-Writer in template1 kann trotzdem
Shared-Rollen/Membership aendern; Rollback einer anschliessend gescheiterten
Guard-TX hebt die zuvor COMMITtete Eintrittssperre nicht auf; eine separat
vorher verbundene normale Owner-Sitzung kann den Eintritt wieder herstellen.
Dies sind sieben vorherige plus vier neue bestandene Gruppen und ein erhaltener
abgewiesener Erstentwurf, kein behaupteter fehlerfreier11/11-Gesamtlauf.

Frischer RO-Inventarread07.10.00:11:55.355129UTC: postgres-Datenbank ist Eigentum
von postgres; template1 ist weiter offen/CONNECT erlaubt, aber Eigentum von
supabase_admin ohne geerbtes Ownerrecht des Callers. template0 ist geschlossen.
Vorhandene authenticator-/Admin-/Cron-/Net-Sitzungen werden durch eine blosse
Neuverbindungssperre nicht beendet; beobachtete Ruhe in template1 schliesst
kuenftigen Eintritt nicht aus. Keine Sitzung wurde in Production beendet und
keine Verbindungs-/Datenbankeinstellung geaendert.

[dbcommands.c2447ff](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/commands/dbcommands.c#L2447)
verlangt Ownerrechte und verbietet die Schliessung der aktuellen Datenbank.
[postinit.c348ff](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/utils/init/postinit.c#L348)
enthaelt auch Backgroundprozess-Ausnahmen zur Eintrittspruefung.
Der gepinnte Management-API-Vertrag fuer database/query bietet query,
parameters/read_only, aber keinen Datenbankselector oder dauerhaften
Sitzungshandle. Die hier provisionierte Supabase-Zugangsbindung ist nur
API-Zugriff, kein bereitgestellter persistenter nativer Datenbanktransport.

Die Verbindungssteuerung ist somit eine konkret nutzbare normale SQL-Primitive,
aber kein hier belegter vollstaendiger Installationsweg. Es fehlen nachweislich
Controller in anderer DB, vorher etablierter dauerhafter Guard-/Recoverytransport
und technisch erzwungene Shared-Katalog-/Worker-Schreiberausschluesse. Globale
Sonderrechte oder eine spezielle Plattformfunktion sind nicht logisch zwingend;
der verfuegbare normale Weg ist aber mit diesen Belegen nicht geschlossen.

## Zulassung bleibt getrennt

Eine Installation benoetigt weiterhin den belegten Ausschluss aller
relevanten Katalogschreiber fuer dieselbe Guard-/Wirkungs-/Journaltransaktion,
einschliesslich neuer Schluessel, sowie tatsaechlichen Migrationscaller
und belegte API-/Journal-Transaktionsgrenze. Gleichheit zweier Endpunkte,
Ruhe, Advisory Lock oder eine neue inerte Datei reichen nicht.
Keine universelle Unmoeglichkeit aller denkbaren SQL-Konstruktionen behauptet.
Der konkrete offene Sicherheitsblocker ist ein unterstuetzter belegter
Schreiberausschluss auch fuer neue Schluessel, Role-Edges und Event-Trigger.
Ein technisch erzwungenes, vollstaendig inventorisiertes Adminwriter-
Wartungsfenster waere eine zu pruefende Alternative; dessen Umsetzung
und gemeinsame API-/Journalgrenze sind hier nicht belegt. Eine blosse
Ruhezusage oder still geaenderte Vertrauensgrenze wird nicht zugelassen.

Das alte abgelaufene V2-Paket wird nicht erneuert. Neuer Client,
unabhaengige Einmalkontinuitaet, konkretes frisches Paket, native Postimages
und fingerprintgebundener Rueckweg bleiben nachgelagerte Tore.
20USD-Auftrag,6USD/UTC-Tag und alle Altreserven einschliesslich0.636USD
bleiben erhalten. Kein Start/Aktivierung/500er Production-Test ohne
separates ausdrueckliches GO.
