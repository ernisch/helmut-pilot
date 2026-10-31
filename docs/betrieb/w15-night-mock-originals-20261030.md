# W15 Nachtauftrag: bestehende Mock500-Originale

Stand: 30.10.2026, 01:55 UTC. **BLOCKIERT.** Die zwei neuen, eng begrenzten
Drive-Namenssuchen lieferten keinen Treffer für den vorhandenen
Qualifikationsbericht oder die neun anderen bisher nicht lokalisierten
Zusatzoriginale. Damit ist keine neue physische Ursprungsdatei und kein passender
Snapshot bestätigt. Es gibt weiterhin keinen ausführbaren Transferweg.

Arbeitszweig: `codex/w15-night-originals-20261030`, Basis
`deb812f9e7e3a2d58e5b4e593a1eec00ef1e22d8`. Ausschließlich dieser Bericht und sein
[SAFE-Beleg](belege/w15-night-mock-originals-20261030/SOURCE_SEARCH.SAFE.json)
wurden neu angelegt. Kein Push, PR, Merge oder Deployment. Den zentralen Status
integriert der führende Orchestrator.

## Neue Prüfung und ihre Grenze

1. Drive-Suche über zugängliche Drives mit `trashed = false` und exakt
   `ALL500_MOCK_BINDINGS_CHECK.SAFE.json`: `results=[]`.
2. Zweite Suche mit demselben Verfahren für die neun weiteren fehlenden exakten
   Dateinamen: ebenfalls `results=[]`. Beide Aufrufe waren metadatenrein,
   `item_type=document`, `best_effort_fetch=false`, ohne zurückgegebenen
   Fortsetzungszeiger. Danach wurde der Weg neu bewertet und beendet.

Das erweitert die frühere Prüfung des bekannten Ordners um diese exakten
Live-Namensabfragen. Der Connector meldet leere Resultate, keine vollständige
physische Abdeckung aller Speicherorte oder Dateitypen. Umbenannte Dateien,
Archivmitglieder, andere Konten und unerreichbare Ursprungsbestände bleiben offen.
Kein globaler Verlust und keine Hashabweichung sind bewiesen.

Nach Neubewertung wurde nur das bereits bekannte Builder-ZIP gezielt per
`files.get` auf einen serverseitigen SHA256-Wert geprüft. Die Antwort nennt
`269598` Bytes, ZIP-MIME und das historische Änderungsdatum16.10., liefert aber
trotz angefordertem `sha256Checksum` keinen Checksum-Wert; ihr Zugriffshinweis
lautet `access_not_verified`. Deshalb bleibt auch dieser Hash historisch. Ein
zweiter identischer Metadatenaufruf wurde nicht ausgeführt. Es wurden keine
Originalbytes heruntergeladen und keine frischen Originalhashes berechnet.

Die aktuelle Toolliste enthält kein Codex-`read_thread` oder `list_threads`.
Die gezielt gelesenen vorhandenen Herkunftsbelege nennen keine verwendbare
Thread-ID. Der schon zweimal erfolglose Threadindex-Aufruf wurde nicht wiederholt.

## Exakt offener Bestand

Alle nachfolgenden Größen und Hashes sind **historische Pins aus vorhandenen
SAFE-Belegen**, bis eine zugängliche physische Datei unabhängig damit verglichen
wurde. Die zehn weiterhin nicht lokalisierten Dateien haben217280887bekannte
Bytes zuzüglich der unbekannten Größe von `CURRENT_NATIVE_REPLACEMENTS.PRIVATE.json`.

| Originaldatei | Historische Bytes | Historischer SHA256 |
| --- | ---: | --- |
| `ALL500_MOCK_BINDINGS_CHECK.SAFE.json` |13706128| `d2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d` |
| `ORIGINAL_PACKAGE.PRIVATE.json` |631359| `52b4a49c334a2d537f642cddf3f95d3eb6e6830e0f3b1b7280c8bd8fd3812f10` |
| `NORMALIZED500_CURRENT_POLICY.PRIVATE.json` |89982254| `90e11a4228e2e568edf03c3feb9ea2c79e71449e68fdc6c563a3355f1fbaaa14` |
| `ORIGINAL_U_PACKET.PRIVATE.json` |53018| `8d732cb88dc6df457b66682a45831e60b8ecdb28d92b35d4c1db4440991f2ed2` |
| `QUALIFIED_ROWS.PRIVATE.json` |99566746| `22d4f73337178ec260c6d963f5539044f15e07d952aafc83e258cfdc4d267359` |
| `QUALIFIED_MOCK_FIXTURES.PRIVATE.json` |1895933| `548a5bd3e268be76a85ba8088c6993c0860b4f90659b47da1c76526cf486d9d1` |
| `QUALIFIED_NATIVE.PRIVATE.json` |53017| `986379885a2e7ea74de82d5075201183f8fc3837eec1f24c3ece4480561dee8b` |
| `QUALIFIED_DERIVATIONS.PRIVATE.json` |11391939| `c19a56ea20ee4d05f8c6578b2bfe5af603fe89c0418df4fda7be085a1e19c261` |
| `CURRENT_NATIVE_REPLACEMENTS.PRIVATE.json` |unbekannt| unbekannt; vorhandener Bericht unter `currentNativeReplacementsPin` nötig |
| `publication-policy.PRIVATE.json` |493| `274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04` |

Das elfte Zusatzoriginal ist weiterhin ausschließlich durch bestehende
Drive-Metadaten lokalisiert: `HELMUT_HANDOFF_20261016_MINIMAL.zip`, Datei-ID
`1_yaGlXYrG2ExYbE2MFBq_ucE4YtgMFCm`,269598Bytes, historischer SHA256
`c979e18775f285ddf7af4328c8efc8f0642954eb6d0e52e50636d3b4ab902d15`.
Der bereits empfangene End500-Receptionbericht bleibt wiederverwendbarer Bestand;
die zwölf End500-Dateien ersetzen keine der zehn fehlenden Mock-Zusatzdateien.

## Kleinster notwendiger nächster Dateischritt

Zuerst muss ein zugänglicher **erhaltener Ursprungsbestand oder ein konkret
benannter Snapshot nach Erstellung des Berichts am28.10.** nachgewiesen werden,
der exakt den13706128Byte-Bericht mit obigem `d260…`-Hash enthält. Dazu braucht
es den tatsächlich lesbaren Quellort oder einen vorhandenen Snapshot-/Archivbeleg
mit dessen exaktem Memberpfad und Pin. Der bekannte historische
`/workspace/shared/helmut-w15-current-source-update-20261028/qualification-b/`-Pfad
ist laut Betreiber unerreichbar und wurde nicht erneut identisch geprüft.

Am belegten Quellort den vorhandenen Bericht rein lesend auf Größe und SHA256
prüfen, danach ausschließlich seine bestehenden `qualifiedAssets`-Bindungen und
`currentNativeReplacementsPin` lesen. Diese Metadaten erlauben die gezielte Suche
nach den passenden bestehenden Zusatzdateien. Keine Neuqualifikation, kein
Nachbau und kein abgeleiteter Ersatzpin. Ohne bestätigten Quellort lässt sich
auch kein konkreter privater Transfer zur Freigabe vorbereiten.

Ein späterer Transfer bleibt gesondert freizugeben: nur tatsächlich gefundene,
hashgeprüfte fehlende Originalbytes, vorhandene Empfängerkryptografie, bestehende
private Ablage und gebundene Rückleseprüfung. Dieser Bericht erteilt keine
Transfer- oder Laufberechtigung.

## Erhaltene Belege und Validierung

Die vorhandenen [kombinierten Backupbelege](belege/w15-mock500-integration-20261029/EXISTING_BACKUP_INVENTORY.SAFE.json)
und der [komprimierte Metadatenreview](belege/w15-mock500-integration-20261029/COMPRESSED_METADATA_INVENTORY_REVIEW.SAFE.json)
wurden gelesen. Die605Ordner-Einträge, die364084Stat-Inventarzeilen, die
Trash-Namenssuche und der30Teil-Backupindex wurden nicht neu inventarisiert.
Der26.10.-Index bleibt ohne Mitgliedschaftsnachweis für diese Ziele; insbesondere
belegt er keine erst am28.10.entstandenen Dateien. Kein Cipher-/Key-Download,
keine Entschlüsselung, keine private Payloadübertragung oder neue Beschaffung.

Validierung: JSON lesbar, Zielnamen/Pins gegen vorhandene kanonische Belege
abgeglichen, `git diff --check` erfolgreich. Keine App-, DB-, Browser-, Original-
oder500er-Tests: reine Dokumentation ohne Codeänderung. Kein Modell-/Provideraufruf,
kein Secretzugriff und keine externe Nachricht. Die physische Quellenabnahme
bleibt offen.
