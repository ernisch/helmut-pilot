# Originalzustands-Reader: native Quelle und Counter-Abwesenheit

Stand13.10.2026 UTC. Diese Änderung ist ein Quell- und Fixture-Nachweis auf dem
noch ungemergten PR906. Sie installiert keinen Reader und erteilt keine
Lese-, Staging-, Command-, Aktivierungs- oder500er-Freigabe.

Der neue ausdrückliche Paketmodus `/3-counter-absence` bindet die native ABI
`/2-counter-absence`. Er erhält die Altzustandsprüfungen aus PR906 und kann den
nativen Tageszähler entweder als vorhandene Zeile mit echtem `xmin` oder als
exaktes Null-Zeilen-Ergebnis mit `rowCount:0,used:0` übernehmen. Eine fehlende
Antwort, `null`, ein erfundener `xmin` oder eine unpassende Finance-Bindung
schließt den Pfad. Beide älteren Paketmodi erlauben weiterhin nur vorhandene
Zählerzeilen und ihre bisherige ABI. Der vollständige Startschutz bleibt der
Verbraucher; Finanzierung und Betriebsrechte bleiben in der Antwort `false`.

[`native-witness-abi.inert.sql`](native-witness-abi.inert.sql) ist bewusst keine
Migration. Alle sechs Materialisierungskonstanten sind `NULL`; die erste
Prüfung stoppt vor dem Lesen von Geschäftsfeldern. Das DDL enthält keinen
Execute-Grant. Eine spätere Anwendung erfordert eine eigenständige Freigabe,
frische Fakten und eine Neubindung des geschützten Public-Funktionskatalogs
für Native-D. Dessen Eigentumsumfang wird nicht verkleinert.

Die SQL-Quelle prüft zuerst Invoker-/Session-/JWT-Rolle, READ ONLY, die endliche
native Katalogbindung und den vorhandenen Serializer. Der Deskriptor bindet
sechs gewöhnliche Heap-Relationen, elf Attribute, vier Stock-Typen, sechzehn
IO-Funktionen, zwei Rollen, zwei vorhandene Funktionen und drei Namespaces.
Sein SHA256 gehört zur PostgreSQL-Domäne `JSONB::text`, nicht zu JS `V.hash`.
Danach bindet ein STABLE-Statement den gespeicherten Root-Paketinhalt, beide
unveränderten vollständigen Originalobjekte, ihre tatsächlichen Zeilenköpfe,
die erhaltenen Kontrollobjekte und den Zähler. Quiet-Scans umfassen alle Zeilen
der benannten Tabellen; lebende oder ungeklärte Arbeit schließt den Pfad.
Die begrenzte Rückgabe enthält keine Originaldaten oder Startautorität.

Die tatsächlichen Produktions-Katalog- und Rollenmetadaten wurden rein lesend
aufgenommen und unabhängig akzeptiert. Der neue direkte PostgREST-Metadaten-
GET belegt Rollen und Nonce-Echo, jedoch kein `transaction_read_only`-GUC.
Der alte abgelaufene Vercel-Actorpfad wurde nicht verwendet; ohne dessen alten
Receipt ist die Nichtwiederverwendung ausdrücklich nur Capture-Attestierung.
Private Belege und eine nicht ausgeführte materialisierte SQL-Vorschau bleiben
außerhalb des Repositorys. Die Faktenprüfung ersetzt keine Quellen-,
Installations-, ursprüngliche spezifische Lese- oder Runtime-Abnahme.

Gezielt lokal bestanden:16 Counter-Former-Gruppen,11 vollständige Reader-
Integrationsgruppen,38 Auswahlprüfungen und sechs Gruppen gegen echten
netzlosen PostgreSQL17.6. Die Datenbank-Fixture erzeugt ausschließlich
synthetische Objekte, eigene lokale Katalogpins und keine Produktions-
Leseberechtigung. CI führt die neue Datenbank-Fixture zusätzlich aus; der
Counter-Former ist Teil der expliziten STANDARD-Menge. Frühere Qualifikationen
werden nicht als neue Produktionsabnahme ausgegeben.

Das separat freigegebene UTC13-Tagesbuch wurde genau einmal initialisiert:
35 erhaltene Bücher, Kapazität35, heutiges EU-Limit82,036000USD, heutige
Kosten/Baseline/Zähler0. Die unabhängige Delta-Abnahme umfasst46 erfolgreiche
Prüfungen. Historische34 Bücher,5000 Usage-Einträge, Reserven, Journale,
Profile und andere Daten blieben erhalten. Konservative Auftragsbindung
7,445364USD einschließlich0,636000USD privater Reserve; `runDayUTC=null`.
Dies ist keine Finanzierung oder Reservierung des500er-Laufs.

Für die tatsächliche vollständige Command-Bindung fehlen weiterhin die
aktuellen originalen Runtime-/Finance-/Quiet-Belege, eine akzeptierte und
installierte native ABI, spezifische Original-Lesezulassung und Staging.
`CRON_SECRET` ist in der Cloud nicht konfiguriert. Die vorhandene tatsächliche
Composite-Dictionary wird wiederverwendet:3.154.026.709 expandierte Bytes,
SHA256 `c2e147274b44c8b555804b96b69e04b8d33f24be783d1cf458ecb54257bef351`.
Der bisherige vollständige Command-Unterwert3.154.159.684Bytes ist kein Beweis
des finalen Fits. Das vorgeschlagene Zeitfenster ist weiterhin unfreigegeben.
