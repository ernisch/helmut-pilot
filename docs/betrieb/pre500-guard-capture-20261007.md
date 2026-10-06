# Gezielte Guard-Capture-Korrektur vor dem 500er Starttor

Stand07.10.2026, Beobachtungen am06.10.UTC. Teilabschluss der privaten
Capture-Vorbereitung; kein Native-D-Dispatch, keine Installation, keine
Production-Daten-/Schemaaenderung, keine bezahlten Production-Modellaufrufe,
keine Aktivierung und kein500er Test. Private Originale bleiben ausserhalb Git.

## Frisch gepruefter Ausgang

OriginaluploadSHA256
`3b0d73501041fe0427bcf0f1746cf26d1ace53e3bc3edd10cc56473022930f9d`
stimmt. Alle363 Manifest-Payloads, Dateilisten und vier eindeutigen enthaltenen
Originalarchive stimmen in Groessen/Hashes. Fehlende historische
Review-Zwischenstaende werden nicht rekonstruiert; spaeter geaenderte Usage-
Dokumentation wird nicht als unabhaengig geprueft behauptet. Pflichtdateien und
einzige geltende rootAGENTS vollstaendig aus aktuellem main`b59828d20` gelesen.

PR836-Kopf`de8bd7a4`/Pflicht-CI37545440487 sowie main-CI37545546547 frisch gruen.
Vercel-Alias wird aktuell nach READY`dpl_E2kyvMw6bMetgeKxvTqeExKzmM8n` auf
Runtimecommit`0333fd208b9d8d4a2e63c9102d429dc6b79713e3` aufgeloest. Der fruehere
reine Doku-Buildskip bleibt ein datierter Originalbeleg, kein neues Deployment.

Native Bestandskontrolle23:32:28.326728UTC:501 Identitaeten/500 synthetische
Profile/0 aktiv/0 unbekannt aktiv/0 geloescht,330BT/120BE/50BB.756 Prozesse ohne
running,22709 erledigte Jobs ohne Live-Leases,2 historische Locks ohne live,
22474 terminale Outboxzeilen. Journal58/letzteVersion20261006183544. End-RPC
mit Originalbodyhash vorhanden, drei Native-D-RPCs fehlen. Die kleine Abfrage
wurde nach zwei automatischen Ablehnungen erst mit ausdruecklicher zusaetzlicher
Betreiberfreigabe ausgefuehrt; sie ist nicht der fehlgeschlagene Vollguard.
Der synthetische Endwaechterworkflow hat weiterhin keine Runs.

## Korrektur und tatsaechlicher Capture

Der alte57014-Fehler bleibt unveraendert gesichert. Kein unveraenderter Retry,
keine erhoehten Fristen, keine Erneuerung der abgelaufenen V2-Installationsvorlage.
Neuer privater V3-Generator: pro Relation eine feste MATERIALIZED-CTE mit
vollstaendigem Zeilen-JSON und xmin; danach unveraenderte Anzahl, C-Sortierung
der SHA256-Zeilenhashes und Multimengenhash. Alle52 Relationen, Katalog-/Owner-/
ACL-/Membership-Bindungen bleiben erhalten. Der native Plan trennt die teure
Berechnung von der Sortierung; die exakte alte Auswertungsanzahl wird nicht
behauptet. Neun native Gleichheitsgruppen stimmen exakt: acht begrenzte
Tabellenausschnitte plus das ungefilterte58-Zeilenjournal. Private Python-
Syntaxpruefung ueber scripts/lokal.js erfolgreich; keine alte14er-/PG17-Vollsuite
wiederholt.

Unabhaengige statische Capture-only-Pruefung bindet GeneratorSHA
`b015900879e1870383c502b2603de62baf602db4e3b9b5595109c7183c47d5c3`
und neuen QuerySHA
`2349ee0d80ed697394308dc297cb7bd8b3cdb4982ab66ce979b75bff3dcadd6c`.
Genau dieser geaenderte30358-Byte-READ-ONLY-Capture wurde einmal ausgefuehrt.

Tatsaechlicher RR/RO-Snapshot: Transaktionsbeginn23:35:18.824336UTC,
Ergebnisbeobachtung23:35:28.012134UTC,9187.798ms bis zur Beobachtung;
Tool-Orchestrierung16099ms. Das ist keine gemessene Commit-/OS-Gesamtgarantie.
Statement15s/Transaktion17s/Lock2s unveraendert und im Resultat sichtbar;
current_user/session_user jeweilspostgres. Alle51 aktuellen publicRelationen
und das gesamte Migrationsjournal:52 Relationen/372067 sichtbare Zeilen.
Alle58 eindeutigen Journalversionen mit individuellen Vollzeilen+xmin-Hashes
ausgewiesen; ihr Multimengenhash stimmt exakt mit dem Gesamtjournalhash.
Native-D-Namespace/RPCs weiterhin abwesend. Kataloghash
`b18bca49d684e826b656ecbfe8bd16acd264f85ce20cb8ffe7bd830c3dd6cf78`.

Die gesonderte Actual-Capture-only-Folgepruefung akzeptiert die konkrete
Originalantwort und rechnet alle58 Einzeljournalhashes unabhaengig nach.
RevieworiginalSHA
`f0b94d617410e0b0db6ae3a1553d020112e10550eb31945f9e0e871e5555fc63`;
Quellenpins und beide Reviewmanifeste privat gesichert. Der beobachtete
Captureblocker ist geloest; keine allgemeine Performance-/Installationsabnahme.

Die Bindungen sind Hash-Preimages, kein Export aller Rohzeilen und kein
Wiederherstellungspaket. Der alte V2-Client importiert weiterhin den V2-Generator;
der neue V3-Capture autorisiert keinen unveraenderten Installationsdispatch.

## Offene Starttore und Fortsetzung

Kritische Installationsabnahme bleibt offen: der bestehende Prefix verwendet
READ COMMITTED und sperrt nur helmut_store. Zwischen Pruefung und Wirkung
koennen andere Tabellen/Kataloge driften; ein erfolgreicher Capture schliesst
dieses Rennen nicht. Konkrete gleichwertige atomare Bindung, tatsaechlicher
Migrationscaller, unabhaengige Einmal-Kontinuitaet, frisches Installationspaket,
native Postimages und fingerprintgebundener Rueckweg muessen vor Wirkung
vollstaendig zugelassen werden. Keine pauschale Katalog-Immutable-Behauptung,
keine Plattformsonderrechte und keine fehlenden historischen Belege nachbauen.

W-/Resolver-/Briefingeingaenge, finanzierter500er Gesamtplan und lebender
gebundener Endwaechter bleiben offen.968 Inventareintraege sind kein pauschaler
Blocker; vollstaendige Einzeldateiliste DIREKT IM CHAT bleibt offen.
Bestehender20USD-Auftrag bestaetigt, keine Erhoehung.6USD/UTC-Tag und alle
Altreserven einschliesslich privater0.636USD erhalten; keine neue Kosten-
Vollhistorie/STOP-Export, keine Wiederverwendung alter Auftraege oder U2unknown.

Nach unabhaengiger Auswertung der Capture-Originalantwort und Doku-Abschluss
wesentlichen Zwischenstand privat nach AGENTS sichern und Threadwechsel
vorbereiten. Naechster fachlicher Schritt: das konkrete Installationsrennen
innerhalb unveraenderter Schutzfristen schliessen und die neue Client-/Caller-/
Kontinuitaets-/Paketbindung unabhaengig zulassen. Vor500-Aktivierung und
Production-Test weiterhin ausdrueckliches Betreiber-GO einholen.
