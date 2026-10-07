# Unterstuetzte native Controllerkanaele vor Native-D

Stand07.10.2026, Fortsetzung nach PR839/main`05f599e7`.
Neue begrenzte RR/RO- und Management-API-Belege; keine Production-Writes,
Modellaufrufe, Aktivierung,500er Tests oder STOP-Vollkostenexporte.
Die bedingungslose Installationsverweigerung bleibt erhalten.

## Frischer Bestand und normale Rechte

Native07.10.00:36:03.684650UTC:501 Identitaeten,500 vollstaendig synthetische
Profile,0 aktiv/unknownActive,330BT/120BE/50BB;0 running/liveLeases/liveLocks,
Journal58/latest20261006183544, Native-D-Namespace fehlt, drei RPCs fehlen.
Callerpostgres/postgres, PostgreSQL17.6. Dies belegt den RO-Caller, nicht den
tatsaechlichen schreibenden Migrationscaller oder einen dauerhaften Kanal.

Neue native Metadaten00:31:54.865267UTC:postgres ist Nichtsuperuser mit
CREATEROLE/CREATEDB. Alle sieben bereits relevanten Kataloge gehoeren
supabase_admin; UPDATE/MAINTAIN/TRUNCATE fehlen weiterhin.
postgres-Datenbank gehoert postgres. template1 ist offen und CONNECT erlaubt,
gehoert aber supabase_admin; postgres hat weder geerbtes Ownerrecht noch
CONNECT-/CREATE-Vergaberecht. template0 ist geschlossen.
Eine alleinige normale postgres-Owner-Abschaltung der Zieldatenbank schliesst
den schon lokal belegten Shared-Rollen-/Membership-Ausweg ueber template1
somit weiterhin nicht nachweisbar. Keine native Abschaltung oder Rechteprobe.

Beobachtete authenticator-/Admin-Clients, pg_cron-Launcher und pg_net-Worker
bleiben gesondert zu beurteilen. Ruhende Sitzungen und leere template1-Aktivitaet
sind kein technisch erzwungener Ausschluss zukuenftiger Writes.
Login/CREATEROLE-Attribute allein beweisen ebenfalls keinen konkreten
Schreibumfang einer Plattformrolle. In dieser Datenbank sind dblink,
postgres_fdw, pg_cron, pg_net und pgaudit nicht in pg_extension registriert;
pg_cron-/pg_net-Prozesse sind dennoch beobachtet. Kein behaupteter
Worker-Ausschluss durch fehlenden Extensioneintrag.

## Tatsaechlich verfuegbare Transporte

Die aktuelle offizielle [Verbindungsanleitung](https://supabase.com/docs/guides/database/connecting-to-postgres)
beschreibt direkte Verbindungen und Supavisor-Sessionmodus fuer dauerhafte
Sitzungen. Der Transaktionsmodus gibt Backendverbindungen nach Transaktionen
zurueck und garantiert keine transaktionsuebergreifende Sitzungskontinuitaet.
Der aktuelle Projekt-Poolerread liefert aws-0-eu-west-1.pooler.supabase.com,
6543,postgres,transaction. Dies ist kein Nachweis einer Controllerverbindung
zu einer anderen Datenbank; auch der Sessionmodus waere dafuer separat zu pruefen.
Die Projekt-Netzbeschraenkung erlaubt derzeit IPv4/IPv6-Netze; das hebt die
Cloud-Ausgangspolitik nicht auf.

Die Cloud-Policyversion1 enthaelt tcp_network_access mit leeren domains und
ip_ranges sowie vpn_configured=false. Native Zugangsdaten sind in den
beobachteten ueblichen DB-Variablen nicht gebunden. Vorhanden sind
SUPABASE_ACCESS_TOKEN und SUPABASE_PROJECT_REF. Der Runtime-Status meldet
deren Readiness unknown; erfolgreiche HTTPS-Aufrufe belegen nur deren
tatsaechlich beobachteten Management-API-Zugang. Kein TCP-Bypass,
keine Suche nach unbereitgestellten Geheimnissen und kein Passwortreset.

## Neuer unterstuetzter Tokenweg und seine Projektgrenze

Die aktuelle [Temporary-access-Anleitung](https://supabase.com/docs/guides/platform/temporary-access)
beschreibt native Authentifizierung mit PAT nach aktivierter Konfiguration
und berechtigter Rollenbindung, mindestens PG17.6.1.081 und SSL-Erzwingung.
Der aktuelle vollstaendige OpenAPI-Vertrag ist privat gepinnt.
GET /v1/projects/{ref}/jit-access antwortet hier HTTP200 mit
state=unavailable/unavailableReason=ssl_enforcement_required.
GET database/jit liefert406, GET database/jit/list liefert403 mit
missing_permissions=[database_jit_write]. Keine Rollenbindung wird daraus
als vorhanden, leer oder freigegeben behauptet.

Ein erhaltener GET-Fehlversuch fuer database/jit-access liefert404.
Aktuelle Markdownseite und
OpenAPI verwenden jit-access; der einmalige korrigierte GET ist der
massgebliche Statusbeleg. Keine erfolglose Wiederholung desselben GET.
SSL-/JIT-Aktivierung, neue Rollenbindung und ein Upgrade wurden nicht angewandt.
Die vorhandene API-Tokenbindung gilt nur fuer api.supabase.com; sie ist kein
bereitgestelltes natives Datenbankpasswort oder TCP-Authentifizierungsbeleg.

## Weitere offizielle Alternative: temporaere CLI-Loginrolle

Der vollstaendige aktuelle API-Vertrag beschreibt ausserdem POST
/v1/projects/{ref}/cli/login-role: erforderliches read_only:boolean,
Antwortfelder role/password/ttl_seconds; Beta/experimental und
database_write-Berechtigung erforderlich. Die native Metadatenaufnahme
enthaelt bereits cli_login_postgres, aber keinen Beleg eines hier gueltigen
Passworts, einer Rollenfreigabe oder einer dauerhaften nativen Verbindung.
Der POST erzeugt eine Loginrolle mit temporaerem Passwort und ist kein
rein lesender Statusabruf, auch nicht mit read_only=true. Er wurde nicht
ausgefuehrt. Dieser Weg ist separat zu pruefen und verlangt nicht logisch
ein vom Betreiber geliefertes oder zurueckgesetztes Dauerpasswort.
Cloud-TCP, sichere Credentialbehandlung, wirkliche Rolle/TTL und unabhaengige
Controller-/Guard-/Recoverykanaele bleiben auch damit unbelegt.

## API-Atomaritaet und konkrete Fortsetzung

Auch der aktuelle OpenAPI-Vertrag bietet fuer database/query nur
query/parameters/read_only, keinen Datenbankselector oder Sitzungshandle.
Migrations-POST bietet query/name/rollback und nun einen optionalen
Idempotency-Key-Header. Der Header garantiert laut Vertrag nur einmalige
Nachverfolgung; er belegt weder denselben Guard-/Wirkungs-/Journalcommit,
den tatsaechlichen Caller noch den Umgang mit einem gelieferten COMMIT.
rollback bleibt ein SQL-String, kein dokumentierter Dry-run.
Kein schreibender API-Versuch wurde als harmlose Callerdiagnose ausgefuehrt.

Konkreter naechster Zugangsschritt ist ein unterstuetzter nativer Kanal mit
sicher gebundener DB-Authentifizierung und gepruefter Cloud-TCP-Freigabe.
Danach zuerst rein lesend andere Datenbank, tatsaechliche Rolle und getrennte
dauerhafte Guard-/Recoveryverbindungen belegen. Diese Zugangsvoraussetzung
erteilt keine Installationszulassung. Ein technisch belegter Ausschluss
normaler Shared-Katalogwriter ueber template1/weitere Eintrittswege sowie
relevanter bestehender und Worker-Sitzungen bleibt erforderlich.
Eine neue Vertrauensgrenze braucht ausdrueckliche Betreiberentscheidung.
Keine universelle SQL-Unmoeglichkeit oder logisch zwingenden globalen
Sonderrechte behauptet; pg_maintain/privilegierte Kundensonderwege bleiben aus.

Unveraenderte15s Statement/17s Transaktion/2s Lock; kein neuer Vollcapture,
kein Commitment zu nativer Vollbestands-, Commit- oder OS-Gesamtfrist.
Fullrow+xmin, vollstaendiger Katalog-/Abhaengigkeitsumfang und alle58
individuellen Journalzeilen muessen an dieselbe Guard-/Wirkungs-/Journal-TX
gebunden werden. Neuer Client, unabhaengige Einmalkontinuitaet, frisches
konkretes Paket, native Postimages und fingerprintgebundener Rueckweg bleiben
separate nachgelagerte Tore. Keine Erneuerung des abgelaufenen V2-Pakets.

20USD-Auftrag/6USD je UTC-Tag und alle Altreserven einschliesslich privater
0.636USD ohne belegte Ueberschneidung bleiben erhalten. W/Resolver/Briefing-
Eingaenge aller500, finanzierter Gesamtplan und lebender Endwaechter offen.
Die historische968er Inventur ist kein pauschaler Startblocker oder
Uploadauftrag; die Einzeldateiliste direkt im Chat wird gesondert berichtet.
Alle neuen Originalantworten und Quellpins bleiben privat ausserhalb Git.
