# Atomare Native-D-Installation: belegter Teilfortschritt und offene Katalogbindung

Stand07.10.2026, Native-Beobachtung am06.10.UTC. Teilweise abgeschlossen:
neue private lokale Prototypen und gezielte isolierte Gegenproben, keine
Installationszulassung. Native-D bleibt nicht installiert. Kein
Production-Daten-/Schemawrite, kein neuer Production-Modellaufruf, keine
Budgetaenderung, Aktivierung oder500er Test in diesem Arbeitsschritt.

## Verifizierter Eingang und frischer Ausgang

Originalupload nach PR837,15598186Bytes, SHA256
`dc8539970edf57cdb8ec68653d269ac3d8ac681d1758d1f85b7d5e2a8695e100`:
alle437 Payloads des neuen Manifests und das Kontrollmanifest,363
Eingangspayloads, alle Untermanifeste/Summenlisten und fuenf eindeutige
enthaltene Originalarchive stimmen in Groessen und Hashes. Das separate
Inventurmanifest stimmt8/8; es ersetzt keine fehlenden Originalbelege.
Historische Reviewreferenzen ohne vorhandene Bytes bleiben als solche benannt.
Keine fehlende Zwischenfassung rekonstruiert. Extrahierte438 Mitglieder
abschliessend bytegenau mit dem unveraenderten Upload verglichen; Python mit-B.

Pflichtdateien aus frisch geprueftem main`4dc7c61a18bb9d4d3ce9b401275ce4a4f804ab59`
vollstaendig gelesen, nur rootAGENTS gilt. PR837/main-CI37547746173 frisch
nachgelesen gruen. Fremde PR771/811 unangetastet. Neuer eigener Worktree und
Branch`codex/atomic-native-d-20261007`; private Originale ausserhalb Git.

Neue kleine RR/RO-Bestandskontrolle,06.10.23:48:07.094319UTC
(07.10.02:48:07 Istanbul):501 Identitaeten/500 synthetische Profile/0 aktiv,
330BT/120BE/50BB,0 unbekannt aktiv,0 running/Live-Leases/Live-Locks.
Journal58/letzteVersion20261006183544. Native-D-Namespace und drei RPCs fehlen.
Dieser normale RO-Caller ist postgres/postgres auf PostgreSQL17.6;
der tatsaechliche schreibende Migrationscaller ist dadurch NICHT belegt.
Frische Aliasaufloesung READY`dpl_E2kyvMw6bMetgeKxvTqeExKzmM8n`/
Runtime`0333fd208b9d8d4a2e63c9102d429dc6b79713e3`.
Kein neuer Production-Vollcapture oder STOP-Kostenexport.

## Neue lokale Entwuerfe und gezielte Gegenproben

Der neue private Row-Prototyp nutzt READ COMMITTED und sperrt alle52 festen
Relationen einschliesslich Migrationsjournal in einem SHARE-Lockstatement,
bevor er die Zeilen liest. Nach dem Lock erfasste Datenstaende koennen dadurch
keinen zuvor etablierten RR-Snapshot behalten. Die bytegleiche V3-Zeilenquelle
bindet weiterhin komplette Zeilen+xmin, Multimengenhashes und58 individuelle
Journalzeilen. Statement15s/Transaktion17s/Lock2s bleiben unveraendert.
Der Prototyp ist nur fuer isolierte Fixtures; sein Installationsgenerator
verweigert die SQL-Ausgabe ausnahmslos wegen unbelegtem Katalogausschluss.
Sein abschliessender COMMIT beendet die Sperren: eine spaetere Installation
darf dieses Capture niemals als fortbestehenden Schutz verwenden.

Sieben neue Gruppen auf echter isolierter PostgreSQL17.6 mit synthetischen
Fixtures und deaktiviertem Containernetz, saemtlich ueber scripts/lokal.js:

1. Alter READ-COMMITTED-/Store-only-Prefix erlaubt fremden Briefingwrite
   zwischen Guard und Wirkung.
2. Alle52 SHARE-Locks blockieren Briefingwrite, Journalinsert und Tabellen-DDL
   mit unveraendertem2s-Locktimeout; die geschuetzte Zeile bleibt gleich.
3. Selbst alle52 ACCESS-EXCLUSIVE-Locks erlauben die geprueften Tabellen-ACL-,
   Funktions-, Membership- und Neutabellenaenderungen.
4. RR liest nach fremdem ACL-Commit weiterhin den alten SQL-Katalogstand;
   danach angelegte synthetische Testwirkung kann committen.
5. Dasselbe Gegenbeispiel unter SERIALIZABLE kann ebenfalls committen.
   Der konkurrierende GRANT lief dabei mit Default-Isolation. Eine getrennte
   neue Ergaenzungsgruppe mit BEIDEN Sitzungen unter SERIALIZABLE bestaetigt
   ebenfalls veraltete SQL-Kataloglesung und erfolgreichen Wirkungscommit.
6. Ein normaler lokaler Nichtsuperuser als Tabellenowner hat keine benoetigten
   Katalogtabellen-/Zeilensperrrechte. Das simuliert nicht Supabases gesamte
   Rollenpolitik und ist kein Beleg des dortigen Migrationscallers.
7. Voller52-Relationen-/58-Einzeljournal-Capture auf kleinen Fixtures bewahrt
   die Fristen; Installationsausgabe bleibt gesperrt.

Sechs Gruppen bestanden im ersten fachlichen Lauf. Die siebte SQL-Abfrage war
erfolgreich, aber die lokale Auswertung erwartete faelschlich JSON statt einer
Spaltenausgabe. Nach expliziter JSON-Ausgabe wurde nur diese Gruppe erneut
geprueft und bestand. Erster Fehler/Originalereignisse und Reparaturdelta bleiben
getrennt erhalten. Ein vorheriger Start traf nur die Containerinitialisierung;
ein kurzer exec-Verbindungsverlust wurde vor dem fachlichen Lauf geklaert.
Das sind sieben belegte Erstgruppen plus eine gezielte SSI-Ergaenzung,
kein behaupteter fehlerfreier Gesamtlauf.
Keine Vollbestandsperformance, native Commitlatenz oder OS-Gesamtfrist bewiesen.

Ein weiterer privater Erfassungsentwurf erweitert bekannte Katalogabhaengigkeiten
um alle Rollenattribute ohne Passwortfeld, alle Membershipkanten,
Default-ACLs und Event-Trigger samt Callback-Funktion/Definition. Drei neue
isolierte Gegenfaelle bestehen: zusaetzlicher Default-Grant, transitive
Rollenmitgliedschaft, Event-Callback ausserhalb der bisherigen Namespaces.
Jeweils bleibt der alte Hash gleich und der erweiterte aendert sich.
Dies ist eine Erfassung bekannter Luecken, keine vollstaendige dynamische
Callback-Abhaengigkeitsclosure und keine Sperre gegen Katalogschreiber.

## Belegter Grund fuer die verbleibende Sperre

PostgreSQL17.6 loest GRANT-Zieltabellen ausdruecklich ohne Zieltabelle-Lock auf:
[aclchk.c663ff](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/catalog/aclchk.c#L663).
Systemrelationen sind vom Serializable-Predicate-Locking ausgenommen:
[predicate.c493ff](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/storage/lmgr/predicate.c#L493).
Event-Trigger erfassen keine Rollen/geteilten Objekte und nicht sich selbst:
[Event-Trigger64ff](https://github.com/postgres/postgres/blob/REL_17_6/doc/src/sgml/event-trigger.sgml#L64).
Advisory Locks schuetzen nur kooperierende Teilnehmer.

Normale No-op-DDL ist gezielt teilweise nuetzlich: echte Updates bestehender
Funktions-/Rollenkatalogtuple oder unveraenderte Membership-GRANTs auf derselben
vergebenen Rolle koennen einzelne Schreiber serialisieren. Sie sind kein
nachgewiesener Gesamtschutz; neue Rollenmitgliedschaften, fehlende Default-ACL-
Zeilen und Namespace-Neuanlagen bleiben konkrete offene Wege. Keine universelle
Unmoeglichkeit aller normalen SQL-Konstruktionen behauptet. Die bekannte
Supabase-Plattformgrenze erlaubt weiterhin keine pg_maintain-/globalen
Katalogsonderwege.

Die vorhandene Installationsquelle widerruft Default-Grants nur fuer vier
benannte Rollen. Zusaetzliche Grants an andere Rollen koennen damit nicht
pauschal als entfernt gelten. Vollstaendige tatsaechliche Abhaengigkeitsmenge
und Ausschluss der relevanten Schreiber einschliesslich neuer Katalogobjekte
muessen vor einer Wirkung konkret nachgewiesen werden. Gleichheit zweier
Endpunkthashes oder eine Ruhebeobachtung beweist keine unveraenderte Zwischenzeit.

## Offene Tore und naechster Schritt

Atomare Katalog-/Fullrow-/Journal-/Caller-Bindung bleibt offen. Notwendig ist
ein konkret belegter unterstuetzter Ausschluss aller relevanten Katalogschreiber
innerhalb derselben Guard-/Wirkungs-/Journaltransaktion bei15/17/2s.
Eine geaenderte Vertrauensgrenze beduerfte einer ausdruecklichen Betreiberentscheidung;
sie wird nicht durch einen lokalen Prototyp, Reviewertext oder Read-only-Capture
ersetzt. Keine neue Installationsvorlage oder Frist fuer das alte V2-Paket erzeugt.

Danach bleiben frischer neuer Client, tatsaechlicher Migrationscaller,
unabhaengige Einmalkontinuitaet, konkretes frisches Paket, native Postimages
und fingerprintgebundener Rueckweg getrennte Tore. W/Resolver/alle500
Briefingeingaenge, finanzierter500er Gesamtplan und lebender Endwaechter sind
weiterhin offen.968 Inventareintraege sind kein pauschaler Blocker;
vollstaendige Einzeldateiliste DIREKT IM CHAT bleibt offen.

Bestehender20USD-Auftrag bestaetigt;6USD/UTC-Tag und alle Altreserven
einschliesslich privater0.636USD ohne Ueberschneidungsbeleg bleiben erhalten.
Keine alten Auftraege, U2unknown oder Reserven wiederverwenden.
Vor Aktivierung und500er Production-Test weiterhin ausdrueckliches Betreiber-GO.
Nach diesem wesentlichen Zwischenabschluss private Originale/Entwuerfe/Belege
mit Groessen/Hashes sichern und Threadwechsel nach AGENTS vorbereiten.
