# Vollständiges500er-Root-Paket: ausdrückliche Transportauswahl

Die vorhandene vollständige synthetische Reader-Fixture erzeugt ein Paket mit
1.529.110 kanonischen UTF8-Bytes. Sie bestand zuvor die isolierte Verbraucher-
prüfung, konnte aber die echte Transportgrenze von1.048.576Bytes nicht passieren.
Das ist ein neu gemessener Entwicklungsfehler; die Messung ist kein aktueller
Produktions-Snapshot und kein Beweis des finalen tatsächlichen Paket-Fits.

Nur der exakte Header
`x-helmut-witness-packet-version: helmut-original-state-witness-root-packet/3-counter-absence`
wählt den begrenzten2-MiB-Rahmen. Der Reader vergleicht anschließend die echte
gespeicherte Paketversion mit dieser Auswahl, bevor Originaldaten gelesen werden.
Ohne Header bleiben1MiB wirksam; ungültige Auswahl, unpassende Version oder
Überschreitung schließen den Pfad. Die URL, Bearer-/CRON-Zulassung, Nonce,
Paket-/Originalhashes, Review-Pins und vollständigen fachlichen Tore bleiben
erhalten. Ein Header ist keine spezifische Original-Lesefreigabe.

Unveränderte Grenzen:4MiB pro Originalobjekt,8MiB für alle Antworten zusammen,
vier Backend-GETs, keine Wiederholungen,20s absolute Frist einschließlich
Cleanup,8KiB Ausgabe. Der zusätzliche Rahmen gilt für das gespeicherte
v3-Root-Paket; Finanzierung, Profilaktivierung und500er-Rechte bleiben `false`.
Die native Quelle bleibt außerhalb der Migrationen mit sechs `NULL`-Konstanten
und ohne Execute-Grant inert; ihr v3-Paketdeckel beträgt ebenfalls2MiB.

Der neue Integrationstest führt die vollständige500er-Fixture tatsächlich über
den vorhandenen Storage-Reader mit JSON-Streams und anschließend durch den
unveränderten vollständigen Startschutz. Fünf lokale Gruppen belegen den
positiven ausdrücklichen Fall, unveränderten Default, Versions-/Auswahlfehler,
Bytegrenze und HTTP-Zulassung. Acht Gruppen gegen netzlosen PostgreSQL17.6
belegen zusätzlich einen nativen Paketinhalt über1MiB mit vor dem Statement
gesetztem8s-Timeout sowie Ablehnung über2MiB. Alle Daten sind synthetisch;
Native-Baustein und vollständiger Verbraucher sind getrennte lokale Belege.

Eine neue echte rein lesende Katalogabfrage beobachtete13.10.,02:28:41UTC:
`authenticator` hat `statement_timeout=8s`; `service_role` hat keinen eigenen
Override. Laut [Supabase-Dokumentation](https://supabase.com/docs/guides/database/postgres/timeouts)
nutzt dieser normale REST-Pfad den Authenticator-Timeout. Damit passen die
vorhandenen Defaults nominal zur positiven≤15s-Quellprüfung. Dies empfiehlt
keine globale Timeout-Änderung. Der Management-Beobachter hatte einen eigenen
10s-Timeout und ist kein Beleg des effektiven REST-Aufrufs, Cache-/Reloadstands
oder tatsächlichen Setups vor dem äußeren Statement. Diese Runtime-Belege
bleiben bei der späteren Root-Zulassung erforderlich.

Dieser Branch baut auf dem ungemergten Draft-PR907 auf; PR906 bleibt ebenfalls
ungemergt. Alle früher akzeptierten Qualifikationen werden wiederverwendet.
`CRON_SECRET` fehlt weiterhin in der aktuellen Cloud-Konfiguration. Native
Installation/Execute-Grant, geschützter Public-Funktionskatalog, spezifische
Original-Lesezulassung, Staging und frische vollständige Command-Bindung
bleiben eigenständige Schritte. Kein Production-Eingriff, Merge, Rollen- oder
Budgetwechsel, Aufruf des Tagesbuch-Initializers oder bezahlter500er-Start.

Die nicht ausgeführte private SQL-Vorschau wird vor einer möglichen Anwendung
aus frischen unabhängig akzeptierten Fakten neu gebunden. Keine Root-Autorität
oder Quittung wird allein wegen des korrigierten Paketrahmens erneuert.
