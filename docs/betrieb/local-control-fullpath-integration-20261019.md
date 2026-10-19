# Lokale Kontrollsicht im Ressourcenablauf, 19.10.2026

**Verschlüsselte Übernahme und gezielte neue Glue-Prüfung abgeschlossen.**
Kein vollständiger Ressourcenlauf, keine Productionabnahme. Standard bleibt AUS.
Die begrenzte W50-Quellenannahme nimmt diesen späteren Glue-Code nicht mit ab;
seine neue Prüfung ist unten getrennt belegt.

## Tatsächliche Wiederherstellung

Die neue Betreiberfreigabe erlaubt die verschlüsselte serverseitige Übernahme
mit notwendigen Originalen. Die geprüfte Anleitung hat SHA256
`23270eadb85f0199ded3421f0efa816b39d2257c49e91f62e0825d9ed4b8d669`.
Sie ersetzt den früheren Haltepunkt wegen fehlender Originaldateien.
Die ursprüngliche Cloud und ihre laufenden Prozesse bleiben nicht direkt
angebunden; wiederhergestellt sind übertragene Dateien und ein isolierter
eingefrorener Datenbankstand, keine historischen Liveprozesse.

Sieben Cipherteile, Gesamtcipher, Klartextarchiv, inneres Manifest und alle443
Dateiziele geprüft. Vorgegebener Helper zuerst ohne Schreiben, dann expliziter
Restore fehlender Dateien, danach erneut443/443 identisch und0 fehlend.
443 Dateien angelegt,0 überschrieben. Acht katalogisierte Originalbindungen und
zehn input19-Capturepins zusätzlich unabhängig bestätigt. Historische zwei
Generator-Pindifferenzen bleiben dokumentiert und unverändert; keine Repins.
Private Schlüssel und Klartextoriginale bleiben lokal, keine erneute Übertragung.

Commit `c8624f7c875a4f6f849d83951898c5e205833a6e` und das ursprüngliche Zielworktree
`/workspace/helmut-control-integration-20261019` sind erhalten. Eigenes Worktree
am erwarteten Pfad `/workspace/helmut-cpu-epoch-20261015`, Branch
`codex/control-integration-restored-20261019`. Nachfolgend nur gebündelte
Statusdokumentation, keine neue Änderung des getesteten Anwendungscodes.

## Anbindung und tatsächliche gezielte Prüfungen

Descriptor: `controlRead: "verified-control-view-v1"` ausschließlich mit
`stateStorage: "merkle-auth-v1"` und
`historyReadReuse: "verified-history-reuse-v1"`. Graph-Reuse und
Single-Write-Capture bleiben gesperrt. Neun akzeptierte Leser-/Transport-/
Aufrufer-/SQL-Quellen bleiben fest an ihre W50-Hashes gebunden.
Review-/Transportumfang bleiben eingebettete Metadaten ohne zusätzliche private
Laufzeitbelege oder Laufgenehmigung. Writer/Originaldecoder/SQL unverändert.

Renderer prüft den vollständigen Descriptor vor Ausgabe und reicht den Modus
an Brücke, Materialvorbereitung, Autoritätsprozess und initiale Assembly weiter.
Konfigurationsassembly trägt wie bisher Descriptor und Bootstrapquittung.
Widersprüche einschließlich leer/null/false/0 beim Merkle-Modus werden vor dem
Überschreiben verworfen. Alle sieben Aufrufervariablen werden auch bei Fehlern
wiederhergestellt. Zusätzliche Quellen stehen in `sourcePins` und damit im
bestehenden gemeinsamen Laufzeitmanifest.

- `atomic-usage-integration-test.py`:19/19 PASS, einschließlich aller26 echten
  Quellenvorlagen, vollständigem Delta-Replay, JS-Syntax, Descriptor-/Modus-/
  Quellendrift-Negativen, Kalenderkombination und Umgebungswiederherstellung.
- `runtime-read-contract-test.py`:13/13 PASS. Dies sind Testfälle, keine
  Bestätigung der32 frischen Startbedingungen.
- Echte Containersicht über bestehenden gemeinsamen RO-Mountbuilder und
  unveränderten `isolation.py --verify-visible-files`:20 Dateien/948611Bytes
  geöffnet, gehasht, readonly; Descriptor und sämtliche19 Quellenpins.
  UID1000:1000, networknone/capdropALL/nnp, exaktes Image, Exit0; Belege behalten.
  Kein vollständiger Recipecheck oder vorweggenommene GO-/Startbelege.
- Separater Codex-Helfer prüfte den begrenzten Code-Delta039b115b..c8624f7c und
  die späteren lokalen Prüfscripte ohne konkreten Schutzblocker. Keine bezahlten
  Modellaufrufe und keine behauptete modellübergreifende Productionendannahme.

## Isolierter nativer Integrationsbeleg

Exaktes PostgreSQL17.6-Image:
`sha256:567d5d704a3e5a4864393b623a0d50eb1b5a4ad134cdac7cf19555cb2d8ffe9e`.
Eigener Container `helmut-meter-db-w20-01a15550c862`, networknone, keine
veröffentlichten Ports. Vier Dumps sind als Dateien vorhanden; nur der tatsächlich
benötigte input19-Dump wurde eingespielt. Rollen aus exakter übertragener SQL;
neue lokale PostgreSQL-/Authenticator-/JWT-Geheimnisse und Gatewaykonfiguration0600.
Kein altes Secret übernommen. Eigener eingefrorener Eingang
`helmut_resource_input_20261019_e400dff25393` mit Defaulttransaktionen readonly;
eigene Zielkopie `helmut_resource_fixture_20261019_01a15550c862`.

Vor und nach Integration stimmen in der eingefrorenen Eingangsdatenbank
nativeAuthText/nativeAuthSHA und vollständiger nativer Countertext exakt mit dem
gebundenen Witness überein. In der Zielkopie bleibt der vollständige logische
Zustand ohne Revisionsmetadatum erhalten; der physische Authtext ändert sich durch
den Bootstrap wie vorgesehen. Die drei geprüften
Storage-RPCs laufen über den tatsächlichen pinned PostgREST und unveränderte
Storage-Leser, mit neuem lokal signiertem Service-JWT. Kein externer Verkehr.

Neuer Descriptor→echter `installAfterActivation`-Bootstrap auf eigener Kopie:
beide strikten nativen Kataloge PASS,5000 originale Historyzeilen und vollständiger
logischer Authzustand erhalten,458 Merkle-Knoten. Keine Vorbereitung/Activation/
Claim-/500er-Controller gestartet. Vollständiger Leser plus zwei Kontrollreads:
drei Graph-Read-RPCs/HTTP200; Kontrollfelder exakt gleich, Sicht eingefroren und
ohne Schreibsnapshot, zwei Schreibversuche vor RPC abgewiesen. Anonymer nativer
Zugriff abgewiesen. Profile, Zähler und übrige Storezeilen anschließend exakt
gleich zur restaurierten Quelle.

**Im eingefrorenen Originaldump stehen bereits500 aktive Profilflags.** Beide
lokalen Kopien behalten diese Originalwerte, keine Aktivierungsoperation erfolgt.
Die ältere Scopebezeichnung `INACTIVE_CLONE` im einmaligen Bootstrapreceipt war
falsch; `POST_INTEGRATION_ORIGINALS.SAFE.json` korrigiert sie ausdrücklich. Der
ursprüngliche Beleg bleibt erhalten, keine Testwiederholung dafür.
Auch das Helperfeld `includedInMeasuredPreparation` ersetzt hier keinen
gemeinsamen Ressourcenmeter: diese Prüfung ist ausdrücklich kein Zeit-/RAM-Beleg
des vollständigen Ablaufs. Die echte spätere Installation bleibt im gemeinsamen
Meter enthalten; nichts wird in ungemessene Migration vorgezogen.

## Belegort und nächster Haltepunkt

Lokale geschützte Belege:
`/workspace/helmut-migration-restore-20261019-01a15550` mit Unterordnern
`glue-targeted-tests`, `glue-container-visibility`, `local-runtime` und
`meter-capability`. Private Rohlogs/Schlüssel/Originale sind keine sicheren Uploads.

Docker/cgroup/Loop-Aufbau ist in einem kleinen Voraussetzungspfad nachgewiesen.
Erster nativer Storage-Verifier scheiterte vor Ausführung an fehlendem UID1000;
das wird nicht als PASS gezählt. Ein korrigierter kleiner Nachweis verwendet eine
neue eigene128MiB-Zuordnung: unveränderter `storage_proof.verify` tatsächlich
als UID/GID1000, Quellhash geprüft, readonly ext4 auf Loop1 bestätigt, native
FS-Größe108974080B unter Kapazitätsgrenze134217728B. Bestehendes finish PASS,
Mappingidentität unverändert, eigene Gruppen leer, Peak14356480B. Alte Zuordnung
auf Loop0 blieb unangetastet. Beide Zuordnungen/Container/Volumes/Images und
Belege bleiben erhalten. Dies ist nur ein Setup-/Sicherheitsnachweis.
Korrigierte Quittung: `meter-capability-corrected-u1000/RESULT_RECEIPT.SAFE.json`.

Im selben Chat weiterarbeiten. Kein erneutes W49/W50-Audit und kein neues
allgemeines Optimierungsprojekt. Die gezielte neue Glue-Prüfung ist abgeschlossen;
kritische Endabnahme, aktuelle Plattenreserve, frische Fall-/Code-/Quellen-/Tages-/
Fensterbindung und32 Bedingungen bleiben vor einem möglichen Vollrun nötig.
V8 und sämtliche alten Freigaben sind verbraucht. Ein vollständiger500er-Lauf
benötigt danach ein separates konkretes Betreiber-GO.

Offline90, Unit60≤60s, Auth30≤30s, gemeinsamer Gesamtpeak≤2.048.000.000B und der
gewünschte500.000.000B-Puffer (Peak≤1.548.000.000B) bleiben offen. Plattenfloor
16.589.934.592B vor einem Vollrun frisch prüfen. Übergebene Betreiberkosten gelten
unverändert. Keine Productionaktion, Profilaktivierung, Merge, Deployment,
Productionmigration, Budgetänderung oder bezahlter Modellaufruf.
