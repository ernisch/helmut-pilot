# Wiederaufnahme und private Client-Sicherung vor dem 500er Starttor

Stand07.10.2026; Beobachtungen am06.10.UTC. Keine Aktivierung, kein500er Test,
keine Migration und kein neuer kostenpflichtiger Production-Modellaufruf.
Private Originale und neuer Client bleiben ausserhalb von Git.

## Verifizierter Ausgang

Upload-SHA256`591f6656430dc273c10beaefb241ea76b37ce62c86cfef8b210356b814cec839`
stimmt exakt. Alle288 Manifest-Payloaddateien und alle verfuegbaren Manifeste der
drei enthaltenen Originalarchive stimmen in Groesse/SHA256. Keine unsicheren,
doppelten oder nicht gelisteten Archivpfade. THREAD_HANDOFF/FINAL_STATE sind
Uebergabedaten, keine zusaetzlichen Freigaben. Pflichtdateien aus dem aktuellen
main vollstaendig gelesen; nur rootAGENTS ist im tatsaechlichen main anwendbar.

Read-only GitHub/Vercel-Audit23:03:37UTC: main`0333fd208b9d8d4a2e63c9102d429dc6b79713e3`,
PR835-Kopf`f3b8d97feb4a45239a362928d218c9a3b2b64300`, PR834/835 gemerged;
Pflicht-CI37540295584 und main-CI37542178794 erfolgreich. Native-D-PG17-Schritt
war tatsaechlich erfolgreich, keine Wiederholung der sieben belegten Gruppen.
Production-Alias auf regulaerem Git-READY`dpl_E2kyvMw6bMetgeKxvTqeExKzmM8n` genau
an diesem Runtimecommit. Fremde PR771/811 bleiben unangetastet.

Native23:03:52UTC:501 Identitaeten/500 Synthetikprofile/0 aktiv/0 unbekannt aktiv/
0 geloescht;330BT/120BE/50BB.756 Prozesse/0 running,22709 erledigte Jobs/
0 Live-Leases,2 historische Locks/0 live,22474 terminale Outboxeintraege.
Journal58, letzteVersion20261006183544. Gezielte Katalogklaerung23:04:13UTC:
End-RPChelmut_synthetik500_ende unveraendert vorhanden; eigene neue Native-D-
Namespace und drei RPCs fehlen. Eine aeltere archivierte Querydatei listet
falsche End-RPC-Namen; ihr leeres Teilresultat ist kein Abwesenheitsbeleg.

Neue Kostenmetadaten23:05:51UTC, kein STOP-Vollkostenexport: gespeicherter
VertragVersion4/20USD ist im aktuellen Betreiberauftrag ausdruecklich bestaetigt,
KEINE Budgeterhoehung.6USD/UTC-Tag und alle Altreserven bleiben unveraendert.
NativeAuftragsbindung6.809364USD plus private0.636USD, deren Ueberschneidung
nicht belegt ist: konservativ7.445364USD/Rest12.554636USD. Alle28Buecher
16.718966USD inkl3.176USD Altreserven; globaler Scope ist nicht automatisch
Auftragsscope. Kein finanzierter500er Gesamtplan daraus ableiten.

## Neue private Clientfassung, eng begrenzte Abnahme

Der unveraenderte Originalclient war noch nicht unabhaengig zugelassen. Neue
GPT6AstraHigh-Pruefung sperrte Dispatch wegen nur textueller Guard-Pruefung,
fehlender verbindlicher Transaktionshülle und nicht crashfestem Verbrauch.
Die abgelaufene alte V2-Installationsvorlage bleibt unveraendert und unbenutzt;
die neue Clientfassung2 ist KEINE Erneuerung dieser Vorlage.

Neu erzeugter fester Guard:BEGIN/15sStatement/17sTransaktion/2sLock,
postgres-Caller, kurze Expiry, Katalog/Owner/ACL/Rollen/Membership und volle
Zeilen+xmin-Hashes aller51publicRelations plus saemtlicher Migrationsjournalzeilen.
Exakter Vergleich zum erzeugten Prefix plus unveraendertem Original-SQL-Tail;
keine freie SQL-Prefixzulassung. Namespaceweite dauerhafte Einmal-Sperre,
O_EXCL und Datei-/Verzeichnis-fsync vor Dispatch; gesonderte tatsaechlich
unabhaengige Kontinuitaetsbindung ist Pflicht und noch NICHT hergestellt.
Token nur Curlstdin, nicht im Kindprozessenvironment; fester regulaerer
Migrationsendpoint, keine Redirects/Retry. Antwortcap131072B/Stderrcap16384B,
Originale privat; nach Unterbrechung finale Hashes aus tatsaechlich gespeicherten
Bytes, sonst null/unverified/STOP. HTTP2xx ist keine native Nachkontrolle.
20s sind ein Transportziel, keine bewiesene harte OS-/native Gesamtfrist.

Erster neuer Review sperrte104jsonb_build_object-Argumente und potenziell falsche
Hashes nach unterbrochenem append. Korrigiert auf feste Bloecke mit maximal48
Argumenten sowie finale Datei-Neupruefung.14/14 gezielte Offlinegruppen ueber
scripts/lokal.js gruen, einschliesslich Append-Unterbrechung, zusaetzlichem
COMMIT, Kommentar-/Funktionsinjektion, anderer Planbytes und Antwortcap.
Ein Testfixture-Argumentlaengenfehler wurde behoben; Originalfehlerlog erhalten.
Unabhaengige Folgepruefung23:13:11UTC akzeptiert ausschliesslich statische
Vorbereitung am exakt geprueften ClientSHA
`67c138026d4982a925bdc371b70299db40b3b666705423c3db9262cedb913bdd` und GeneratorSHA
`871ffef0c2d560c7af1728af6f353fa7e273ff0982e75a66a549bb8cc5191bb1`.
Keine tatsächliche Dispatch-/Production-Abnahme.

Neuer notwendiger rein lesender Voll-Guard-Capture wurde serverseitig mit57014
bei unveraendertem15sStatementtimeout abgebrochen; Toolgesamtzeit20.942s.
Kein vollstaendiges Preimage, kein unveraenderter Retry, keine Schutzfrist
angehoben. ActualGuard/Caller/Kontinuitaet/konkretesInstallationspaket/Postimage
und fingerprintgebundener Rueckweg bleiben offen. Dieser neue Fehlschlag
ersetzt keine historische Quelle und beweist keine fehlende Berechtigung.

## Fortsetzung und Threadwechsel

Endwaechterworkflow weiterhin ohne Runs; kein lebender gebundener Waechter.
Lokale Service-/Croncredentials fehlen; GH-Secretverfuegbarkeit bleibt unbekannt.
Managementcredentials sind kein Ersatz fuer Dienstrollen-/Cronzugang.
W-/Resolver-/Briefingeingaenge konkret vervollstaendigen;968 Inventareintraege
sind kein pauschaler Blocker. Ihre vollstaendige Einzeldateiliste DIREKT IM CHAT
bleibt offen. Keine fehlenden historischen Primaerbelege nachbauen und keine
alten Auftraege, U2unknown oder Reserven wiederverwenden/freigeben.

Nach diesem wesentlichen Zwischenabschluss proaktive private Uebergabesicherung
nach AGENTS.md; keine neue umfangreiche Facharbeit im alten Thread.
Naechster konkreter Schritt: Guard-Capture-Zeitursache gezielt am vorhandenen
Fehleroriginal analysieren, festen Leseguard sicher innerhalb15/17s binden oder
eine gleichwertige explizit gepruefte endliche Alternative entwickeln. Danach
actualCaller/Kontinuitaet/Native-D-Paket unabhaengig zulassen; keine Installation
aus statischer Abnahme ableiten. Vor500-Aktivierung/Test weiter ausdruecklichesGO.
