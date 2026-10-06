# Native-D: neue inerte Implementierung, offline vorbereitet

Stand 07.10.2026. **Neue Implementierung**, kein wiedergefundenes historisches
Original. Die fehlenden privaten Installer und historische Primaerbelege bleiben
fehlend. Keine Production-Installation, keine Native-D-/Root-Zulassung, keine
Profilaktivierung und kein500er Test durch diesen Entwurf.

Die drei bestehenden Funktionen aus dem oeffentlichen ABI erhalten eine neue
SQL-Quelle [native-d-new-v1.sql](../../lib/helmut/sql/native-d-new-v1.sql).
Es ist bewusst keine automatische Migration. Sie erzeugt nur ein leeres eigenes
Schema mit unveraenderlichen D-Versionszeilen und drei RPCs; sie schreibt keine
Auth-, Budget-, Profil-, Quellen- oder alten Journalzeilen. Der
[Generator](../../lib/helmut/synthetik-500-native-d-new.js) liest diese neue Quelle
und erstellt auf ausdruecklichen Aufruf einen fingerprintgebundenen Rueckweg.
Konkrete Installations- und Rueckwegsdateien gehoeren0600 ausserhalb aller
Gitroots. Keine privaten Production-Originale sind Bestandteil dieses Entwurfs.

## Schutz und Grenzen

Der Dienstschluessel bekommt ausschliesslich EXECUTE auf die drei RPCs. Die
privaten Tabellen und Helfer sind fuer PUBLIC/anon/authenticated/service_role
gesperrt; RLS/FORCE RLS ist eingeschaltet. Die RPCs benoetigen SECURITY DEFINER,
damit der Dienstschluessel keine direkte INSERT-Berechtigung und damit keinen
unguardierten Schreibweg erhaelt. Fester search_path=pg_catalog, voll qualifizierte
Objekte, kein dynamisches SQL, explizite Pruefung der tatsaechlichen
service_role und vollständiger Widerruf der Standard-EXECUTE-Rechte sind Pflicht.
Dies folgt dem vorhandenen serverseitigen Dienstrollenmodell; es fuehrt keine
neue Endnutzer-/JWT-Authentifizierung ein.

Speicherung bindet kanonische Bytes und SHA256 von Entry, Completion, Output,
Quellen und Usage an die aktuelle persistierte Auth. Erforderlich sind die
aktuelle laufende Operation, richtige Einheit/Owner, aktives Zeitfenster,
gespeicherte Completion, konsumierter D-Intent, abgerechnetes Ticket und genau
ein erfolgreicher Usagebeleg. Ein Auth-Zeilenlock haelt parallele CAS-Aenderungen
bis zum Append zurueck. Derselbe Owner/ID kann nur identisch wieder gelesen
werden; eine andere Version wird abgewiesen. UPDATE/DELETE/TRUNCATE sind durch
Trigger gesperrt. Der Rueckweg entfernt ausschliesslich ein leeres eigenes
Schema bei identischem aktuellen Fingerprint und benutzt kein CASCADE.
Gespeicherte Belege werden durch den Rueckweg niemals geloescht.

Der Fingerprint bindet eigene Funktionskoerper/Owner/ACL, Namespaces,
Dienstrollen/ihre Mitgliedschaften, Tabelle/Spalten/Defaults/Constraints/Indizes,
RLS/Policies und Trigger. Er bindet auch die bestehende oeffentlich belegte
`helmut_synthetik500_internal.json_compact(jsonb)`-Abhaengigkeit sowie die
Struktur/Owner/ACL von `public.helmut_store`. Er ist bewusst ein **aktueller
SQL-Kataloghash**, kein historischer Beleg und kein Ersatz fuer den umfassenden
Native-Katalog-/Caller-/Root-Nachweis. Der erwartete Hash muss aus einer echten
nativen Nachkontrolle und unabhaengigen Pruefung stammen.

**Keine globale Unveraenderlichkeit gegen Supabase-Administratoren/Owner.**
Diese koennen DDL, Trigger oder Auth aendern. Die RPCs erkennen Drift gegen den
gebundenen erwarteten Katalog, die private externe Original-/Body-/Rootbindung
bleibt Pflicht. SQL hat keine originalen Anbieterantwortbytes; deren Herkunft
bleibt an die vorherige echte Completion-Erzeugung und private Primaerbelege
gebunden. Ein Dienstrollenschluessel bleibt ein privilegierter Serverzugang,
kein unabhaengiger Beweisgeber. Isolierte Fixtures erteilen keinerlei Zulassung.

## Bisherige gezielte Pruefung

[SQL-Abnahme](../../scripts/synthetik-500-native-d-new-datenbank-test.js) benutzt
`node scripts/lokal.js`, eine eigene zufaellige Testdatenbank, PostgreSQL17.6
und einen Container ohne Netz oder Portbindung. Production-Kennungen werden
nicht an den Testkindprozess weitergereicht. Das Test-PGOPTIONS setzt15s
Statement,17s Transaktion und2s Lockwartezeit; es beweist keine entsprechende
native Production-Leistung oder effektive PostgREST-Frist.

Image `postgres:17.6-bookworm`, Registry-Digest
`sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3`.
Sieben echte isolierte SQL-Gruppen erfolgreich: RPC-/ACL-Isolation;
Append/Read/Idempotenz; Completion/Kosten/Usage/Owner/Journal;
Hash-/Output-/Quellen-/Kanonikdrift und konsistenter Versionskonflikt;
UPDATE/DELETE/TRUNCATE-/belegloeschender Rueckweg gesperrt;
Funktionskatalogdrift; leerer fingerprintgebundener Rueckweg mit komplett
unveraenderter Auth. Keine bezahlten Aufrufe oder Production-Daten verwendet.

## Noch notwendige Installations- und Abnahmekriterien

1. Unabhaengige kritische Pruefung dieser **neuen** Quelle und ihres Rueckwegs,
   aktueller main/PR-/CI-Abgleich. Originalinstaller bleiben als fehlend berichtet.
2. Frische native Katalog-/Owner-/ACL-/Rollen-/Abhaengigkeitspruefung: die drei
   Namen und der neue Namespace muessen wirklich fehlen; keine bestehenden
   Objekte ersetzen. Tatsaechliche Definer-Rechte und PostgREST-service_role
   muessen das beabsichtigte Modell tragen. Native Canonicalizer-Paarung pruefen.
3. Konkrete private Installation an aktuellen Preimage, Commit, Quelle/Bodyseal,
   Katalog und Schutzbestaende binden; keine automatischen Migrationen oder
   Wiederverwendung verbrauchter Auftraege. Wirksame15s/17s/2s-DB-Fristen und
   begrenzten Transport nativ belegen; unbekannter Ausgang: Stop, rein lesende
   Klaerung, kein Retry. Kein Budget-/Auth-/Profil-/Quelleneingriff.
4. Native Nachkontrolle: genau drei ABI-Signaturen mit korrekten Argumentnamen,
   gesperrte direkte Tabellen-/Schema-/Helferrechte, eigene leere Tabelle,
   intakte Trigger/RLS und erwarteter Funktions-/Schemahash. Vollstaendige
   geschuetzte Originalbestaende/Journale unveraendert nachweisen und private
   Rueckwegsdatei an genau diesen aktuellen Fingerprint binden.
5. Neues unabhängiges Native-D-Urteil mit echten nativen Primärbelegen und
   klarer Admin-/Anbieter-/Performancegrenze; dann erst Root-Gate binden.
   Finanzierungs-, W-, Endwaechter-, Profil-GO- und500er Testgrenzen bleiben
   vollstaendig bestehen. Vor Aktivierung/Test ausdrueckliches Betreiber-GO.
