# Mock500 Originalempfang30.10.: tatsächliche Annahme PASS

Nach dem ausdrücklichen Einmal-GO: Launcher
`6c42716d35dfad1032a54a978e1551575e90d051`, Empfänger
`13b858b1a1e83a695e1fa64446573b5b550921ea`, Environment`helmut-ci-originals`.
[Run41037459441](https://github.com/ernisch/helmut-pilot/actions/runs/41037459441),
Job124001742313, Versuch1, Nonce71cc78fe-3957-4464-b94e-5fba0f234b23.

## Tatsächlicher Befund

Genau ein frischer Linkabruf und ein Dispatch, kein Retry/Refresh. Alle
GitHub-/CI-/Review-/Branchprüfungen und sicherer Fast Forward des zugelassenen
Entwicklungsbranches225e76d7→13b858b1 vor READY und Linkerzeugung. Launcher
danach beobachtet beendet. Tatsächlicher serialisierter Dispatch2764Zeichen,
Inputwerte2551Zeichen, jeweils unter65535. Reale SAS-Restgültigkeit>90s wurde
unmittelbar vor POST geprüft; kein numerischer Restwert wurde gespeichert.

Der **tatsächliche GitHub-Empfang** bestätigt alle elf Originaldateien, exakt
217563454Bytes. Jede ursprüngliche Größe und SHA256 stimmt; darunter der
13706128Byte-Qualifikationsbericht mit d2603d… und die vormals ungebundenen
12969Bytes Replacements mit52ee2e…. Exakte Namen und sämtliche vollständigen
Hashes stehen in der unveränderten
[GitHub-SAFE-Quittung](belege/w15-mock-original-reception-20261030/GITHUB_RECEPTION_41037459441.SAFE.json).
Ihr kanonischer SHA256 lautet
`4c92453c9566185c03f4e68395029b92a15b8917bdd939618aa8adfd81fd9776`.

Cipher17780398Bytes/SHA256f8447b… und Manifest6144Bytes/SHA256e07e41… stimmen
vollständig mit der ursprünglichen Übergabe überein. GPG-Empfänger
7E3998A6C2CB948C69A2EE51F4267ABF26796EDC, GPG-Integrität, einzelner gzip/USTAR,
alle Dateipins und vollständige private Rücklesung bestätigt. Eigener
GPG-Prozess und AgentPASS beendet. Empfangsschritt10:00:03–10:00:09UTC=6s;
ganzer Job09:59:58–10:00:11UTC=13s, unter600s/15Minuten.

Alle anderen WorkflowjobsSKIPPED, einschließlich Restore/End500/Mock500.
Keine Modelle, Artefakt-/Cacheuploads, neuen Secrets/Schlüssel, Löschungen,
Productioneingriffe oder Merges/Deployments. Drive-Datei und Originale wurden
ausschließlich gelesen. Eigene Skripte führten keine automatische
Branchrücksetzung aus; Ausführungsbranch bleibt13b858b1.

Die [unabhängige Abnahme](belege/w15-mock-original-reception-20261030/INDEPENDENT_REVIEW.SAFE.json)
vergleicht Run-/Jobmetadaten, kanonische Quittung, alle elf ursprünglichen Pins
aus dem unveränderten Empfängergitblob und Codefluss. Kein erneuter Download,
keine neue Qualifikation und kein privater Originalzugriff durch den Reviewer.
Rohlogs und deren kurzlebige Zugangs-URL wurden nicht gespeichert/ausgegeben.

**Geschlossen:** fehlender Quellort/fehlende elf Dateien, fehlender
Replacements-Pin, neuer Archivformatanschluss und zeitliche Einmalübergabe.
**Annahmescope:** Originaldateibytes im damaligen temporären Empfangsrunner.
Keine dauerhafte Klartextablage in Codex oder einem späteren Runner. Bestehendes
verschlüsseltes Drive-Archiv bleibt die erhaltene Quelle; späterer Mock500
empfängt es im eigenen gemeinsamen Job mit eigener Freigabe.
Kein RAM-v2-/Restore-/End500-/Mock500-PASS aus dieser Datenannahme.

## Ausschließlich verbleibende Startvoraussetzungen

1. **Original-Restore:** Innere Ursache von40958135662 weiterUNKNOWN. Zuerst
   begründete gezielte Diagnose-/Restoreentscheidung und neues konkretes GO;
   kein vollständiger Originallauf auf Verdacht. Danach vollständige unabhängige
   Original-Restoreabnahme500Profile/0aktiv samt verschlüsselter vollständiger
   Sicherung, Fernrücklesung und zweiter isolierter Rücksicherung. Die frühere
   erfolgreiche synthetische Minimalprobe ersetzt diese Abnahme nicht.
2. **End500:** Erst positive Restoreabnahme auf demselben gewählten exakten Kopf,
   dann separates End500-GO und tatsächliche vollständige unabhängige Abnahme.
3. **Vorwärts gerichtete Codebindung:** Ausführungsbranch steht nun13b858b1.
   Keine Rücksetzung auf den älteren Deb-Kopf. Ein späterer Restore/End500 kann
   nach passender Diagnoseentscheidung auf qualifiziertem13 erfolgen. Dieser
   Kopf wird im getrennten Mock-Nachfolger als künftiger Kandidat zugelassen;
   gezielte synthetische Gegenproben lassen weiterhin keinen Start ohne echte
   positive End500-Abnahme, passende Bridge und eigenes GO zu. Kein End500-PASS
   durch diese technische Kandidatenzulassung.
4. **Mock500-Bindungen:** Exakter endgültiger Mockkopf mit statischer
   SourceQualification, unabhängiger Eingabebindung und Bridge zur tatsächlichen
   positiven End500-Quittung. Bestehende500/500-Quellenqualifikation übernehmen;
   Dateipins aus diesem Empfang ersetzen diese Code-/Laufbindungen nicht.
5. **Gemeinsamer späterer Lauf:** Separates Mock-GO einschließlich Empfang im
   eigenen Runner, frische gültige Links und tatsächlicher verschlüsselter
   Gesamtdispatch≤65535Zeichen. Zulässiges UTC-/Berlin-Tagesfenster bis31.10.,
   aktueller vollständiger Plattenplan und unveränderte Zeit-/RAM-v2-/Abbruch-,
   Sicherungs- und Rücksicherungsgrenzen. Historischer RAM-Fehler bleibt offen;
   Lebenszeitpeak≤1638400000/Limit2048000000/Reserve≥409600000/Swap0 muss der
   tatsächliche Mocklauf nachweisen, ebenso500gleichzeitigaktiv/500Units/
   1000lokalePhasen/1500gespeichertegeprüfteErgebnisse/8000echteKontrollen und0aktiv.

Dieser Empfang erteilt keine Freigabe für einen echten Folgelauf. Der spätere
Dauerauftrag erlaubt unabhängige technische Vorbereitung; nur die belegte
Kandidatenbindung wird ergänzt. Private Originaldateien bleiben außerhalb Git.
