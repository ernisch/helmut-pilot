# Vorhandene Mock500-Fehlerkapsel gezielt lesen

Dieser Anschluss liest ausschließlich den bereits gespeicherten verschlüsselten
Diagnosebeleg. Er startet weder einen weiteren Materialtest noch Originalempfang,
Datenbank, Profilaktivierung, Einheiten, Modellphasen oder Sicherung.

## Unveränderter Ausgangsbefund

Run41365567913/32655e8f und Run41427480765/1fb2cfe1 bleiben FAIL. Die ursprüngliche
Materialursache ist weiterhin UNKNOWN. Die einmalige Materialdiagnose
Run41455150159/582ca4e6 scheiterte mit WORKER_RESULT_REJECTED; ihr GO und ihre
Linkrunde sind verbraucht. Der separat nachgestellte Abschlussvalidatorfehler ist
auf32c9a3ef/PR1020 geprüft: drei neue Gegenproben, zwei betroffene alte Kontrollen,
Pflicht-CI41457428169 und unabhängige Reviews PASS. Das beweist nicht nachträglich
die ursprüngliche Materialursache oder die Dateirechte des tatsächlichen Runs.

Die Kapsel wurde privat dauerhaft gesichert. Fest gebundene Quelle:

| Bindung | Wert |
| --- | --- |
| Repository | ernisch/helmut-pilot |
| Quellrun / Versuch | 41455150159 / 1 |
| Quellcommit | 582ca4e6dca9d78b0008d8837ed1b171cf8fe920 |
| Artefakt | 13145634042 |
| Cipherbytes | 10.699 |
| Cipher-SHA256 | fa9ff9bae552cf3998101470dc88c3e6c3347800113e0960afbe34609a5e5753 |
| Erhaltene ZIP-Bytes | 10.893 |
| ZIP-SHA256 | 59dfe57a07457115803fcec23a9021b1669d08c1889da50560ee68ee8409cea6 |

## Kleinste zusätzliche Einstiegskante

Eigener manueller Modus `mock500-materials-capsule-readback` im bestehenden
Workflow, gleiches geschütztes Environment `helmut-ci-originals`, höchstens
fünf Minuten. Der neue Modus öffnet keinen alten Empfangs- oder Controllerpfad.
Er verwendet das bereits für den Artefakttransport gepinnte offizielle
Download-Bundle, genau die obige Artefakt-/Run-ID und nur Leserechte. Kein Drive,
keine frische Originalverbindung, kein Upload, Cache oder neues Artefakt.

Das SDK läuft über den bestehenden privaten Transport-Logkanal, damit auch
Transportfehler keine Rohtexte oder signierten Downloadlinks veröffentlichen.
Ein enger zusätzlicher Nur-Lesezweig akzeptiert ausschließlich dieses gepinnte
Downloadprogramm, die festen Quellkennungen und den Lesetoken des neuen Jobs.
Er erzeugt keine Upload- oder Runtime-Zugangsdaten; der bisherige Standardzweig
behält seine unveränderten Anforderungen. Node stammt aus dem vorhandenen
Ubuntu-Runner, kein zusätzliches Image oder Dienst wird installiert.

Vor dem Cipherdownload wird die öffentliche Leseanforderung an den tatsächlich
ausgecheckten Commit, den zugelassenen Ausführungsbranch, Versuch1, eine neue Nonce,
kurze Gültigkeit und den eigenen Scope `READ_EXISTING_MATERIALS_CAPSULE_ONLY`
gebunden. Die Anforderung enthält ausschließlich technische Metadaten. Eingaben
werden über Umgebungsvariablen gelesen, niemals als Shellcode interpoliert.
Exklusive lokale Marker binden beide Schritte und verhindern einen zweiten
Entschlüsselungsversuch im selben Job. Sie erzeugen keine neue Betreiberfreigabe.

Vor jeder Entschlüsselung müssen Name, Dateityp, Größe und der unabhängig bekannte
Cipherhash stimmen. Es werden ausschließlich die beiden vorhandenen geschützten
Empfängerbindungen verwendet. Schlüsselimport, privates kurzes GPG-Verzeichnis,
Passphrase über Dateideskriptor und Agentbereinigung verwenden die vorhandenen
Hilfen. Keine Schlüsselgenerierung, Secretänderung oder privaten Befehlsargumente.

Der private Klartext ist begrenzt. Nur das unkomprimierte USTAR-Format dieser
Kapsel wird akzeptiert: ein Manifest sowie höchstens die fünf fest benannten
Fehler-/Outcome-/Collection-Dateien. Pfade, zusätzliche Namen, Links, Duplikate,
PAX/GNU-Erweiterungen und Überschreitungen werden abgewiesen. Quellcommit, Quellrun,
Empfänger, vorhandene Eingabemanifestbindung und sämtliche manifestierten Größen
und Hashes bleiben Pflicht. Der extern nicht erhaltene private Manifesthash wird
nicht erfunden; die bestehende vollständige Backup-Rückleseprüfung bleibt streng
und unverändert. Dieser kleine Leser erzeugt ausdrücklich keine Backupabnahme.

Öffentlich dürfen nur die bereits geschlossenen Fehlerkategorien aus dem privaten
Outcome, eindeutig benannte historische Beobachtungen und der tatsächliche
Abschluss des Lesers erscheinen. Rohmeldung, Stack, private Dateipfade und Secrets
bleiben privat. Abgeschnittene Quellen dürfen nicht als vollständige JSON-Berichte
ausgegeben werden. Der neue Leser darf keine unbekannte historische Runtime-Nonce,
keinen Containerstopp oder vollständigen Mock500-Erfolg aus lokalen Vorgaben ergänzen.

## Freigabegrenze und nächster Schritt

Entwicklung und synthetische Prüfung sind freigegeben. Es wurde hierdurch kein
weiterer geschützter Job, Fast Forward oder Originalversuch freigegeben. Der neue
Codekopf benötigt erfolgreiche Pflicht-CI und unabhängigen Review. Erst dann kann
die konkrete einmalige Lesefreigabe mit exaktem Commit, neuer Nonce und sicherem
Fast Forward des weiterhin unveränderten Ausführungsbranches vorgelegt werden.
Bei FAIL/UNKNOWN stoppen; kein Retry und kein Wechsel auf Original-/Materialtests.
Quellen, vorhandene Kapsel, Secrets und historische Belege bleiben erhalten.

Nach einer tatsächlichen Lesung wird nur eine damit konkret belegte Ursache
minimal korrigiert und gezielt geprüft. Das bestehende bedingte vollständige
Mock500-GO bleibt genau ein ungenutzter Versuch. Es gilt erst nach belegter
Ursachenbehebung, Pflicht-CI, unabhängigem Review und allen ursprünglichen
Startbedingungen einschließlich positivem End500, Quellen, Tagesfenster,+dynamischem Hostschutz, unveränderten Kosten und sämtlichen Ergebniszählern.
Keine Production-Aktion, kein Merge und kein Deployment.
