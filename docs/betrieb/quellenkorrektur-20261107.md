# Quellenkorrektur vom 7. November 2026

## Stand

**Am 7. November 2026 nach Betreiberfreigabe ausgeführt und anhand nativer Daten geprüft.**
Basis: `c8637001415d8803ba4e1cf01a168c33a3a01534`. Die Freigabe für den unten begrenzten Umfang wurde im selben Thread ausdrücklich erteilt.

## Konkretes Ergebnis der Prüfung

Von den sechs ursprünglich unvollständigen Fällen lassen sich fünf anhand der Originalseiten oder einer amtlichen Quelle korrigieren. Die Originalseite von RP Online liefert weiterhin nur eine Fehlerseite. Ein wechselnder n tv Liveticker ist keine identitätsstabile Ersatzquelle. Dieser sechste Fall bleibt unverändert als unvollständig kenntlich.

| Fall | Vorgesehene Korrektur |
| --- | --- |
| NDR Pflegegesetz | Begrenzter Originalauszug und belegte Kurzfassung zur Kritik am Sparpaket |
| RND Pflegereform | Tatsächlicher Pflegeabsatz statt der themenfremden Newsletter Einleitung |
| Bundestag Pflegebetrug | Konkrete Forderung nach Betrugspräventionsdatenbank belegen |
| Bundestag Anhörungsplan | Vollständiger erster Termin mit Datum, ausdrücklich Plan für 2. bis 6. November 2026 |
| CO₂ Preis | Überholte Septemberdarstellung durch den amtlichen Beschluss vom 15. Oktober 2026 ersetzen; alte Rohquelle bleibt erhalten |

Eine reine Ergänzung der Rohtexte wäre unsicher: Die bestehende Karte würde damit sämtliche bisher zurückgehaltene KI Analyse freischalten. Deshalb umfasst die Vorlage auch die Prüfung und Ersetzung der fünf Kurzfassungen sowie das Leeren nicht belegter Empfehlungen und Einordnungen.

Der Anhörungsplan ist außerdem mit zwei vermischten Altvorgängen verknüpft. Die konkrete Probe zeigt: Nach Ergänzung des kürzeren Originalauszugs würde deren bisherige Quellenmix Sperre nicht mehr greifen. Daher müssen diese zwei Altvorgänge mit dem bestehenden Status `pending` und `understanding_status=failed` zurückgehalten werden. Ihre Texte und Verknüpfungen bleiben erhalten. Das ist keine erneute Understanding Verarbeitung und kein neuer Statusmechanismus.

Beim CO₂ Vorgang wird die aktuelle Quellenverknüpfung zur PresseBox Meldung durch die neue amtliche Quelle ersetzt. Das Original und der vorherige Link werden für den Rückweg erhalten. Fremder amtlicher Text wird nicht in die PresseBox Rohzeile geschrieben.

## Gezielte Prüfung

Mit den tatsächlichen 19 geladenen Quellen und acht zugehörigen Vorgängen wurden die Quellenprojektion `geleseneQuelle`, `koToVorgangCard`, `themenrein` und `quellengebunden` ausgeführt. Die 36 dabei geladenen Helmut Module stimmen anhand ihrer Git Blob SHA mit der genannten Basis überein. Start über `scripts/lokal.js`, mit Netzschutz und ohne Production Zugangsdaten im Kindprozess.

Ergebnis: fünf korrigierte Karten mit nutzbarem Text und bestandenem bestehenden Quellencheck; zwei vermischte Vorgänge nicht mehr auslieferungsberechtigt; RP Karte unverändert eingeschränkt. Die Prüfung ist kein vollständiger semantischer Faktenbeweis und kein authentifizierter Production Browsertest. Die Fakten wurden separat an den Originalseiten geprüft. Null Production Schreibvorgänge, null Provideraufrufe. Kein Mock Test.

Die Prüfung war adaptiv: Die erste Vorschau legte die Nebenwirkung auf die zwei geteilten Altvorgänge offen. Die endgültige Vorlage berücksichtigt sie ausdrücklich. Die früheren Vorschauen zählen nicht als Abnahme des endgültigen Umfangs.

## Ausführung und Rückweg

Vor der Ausführung sind die gebundenen Zeilen und Links frisch zu lesen und die Vorherwerte der tatsächlich geänderten Felder im bestehenden Git Arbeitszweig zu sichern. Diese Sicherung enthält keine Profile, Schlüssel, Volltexte oder Embeddings. Erst danach darf die hier beschriebene einzelne, mengenbegrenzte Transaktion ausgeführt werden. Bei einer Abweichung der Hashes, Ziel Links oder laufender Verarbeitung wird nichts geschrieben. Der Rückweg betrifft ausschließlich die geänderten Felder und Verknüpfungen und prüft seinerseits die Nachherwerte.

Bestehende Briefings und historische Nachweise werden nicht umgeschrieben. `HELMUT_ARTIKELKONTEXT` bleibt aus. Die in PR #1094 vorbereitete automatische Ergänzung neuer Artikel wird hiermit weder aktiviert noch als produktiv erfolgreich behauptet. Kein Code Merge oder Production Deployment ist für diese Datenkorrektur erforderlich.

## Exakt begrenzte Vorlage

```json
{
  "version": 1,
  "status": "executed_and_native_read_back",
  "project_id": "ddckuvvpcytqbyfmbvie",
  "baseCommit": "c8637001415d8803ba4e1cf01a168c33a3a01534",
  "changes": {
    "rawSummaryUpdates": 4,
    "newOfficialSourceRows": 1,
    "reviewedKnowledgeObjects": 5,
    "parkMixedKnowledgeObjects": 2,
    "oldSourceLinksDetached": 1,
    "newSourceLinks": 1,
    "environmentChanges": 0,
    "providerCalls": 0
  },
  "candidates": [
    {
      "case": "NDR Pflege",
      "rawId": "rd-c298f6df6f15b3ce9cf0c0bfdcdf9f8be51dfbdb86fc8ffbb0e834ff88cdefca",
      "koId": "ko-vg-pflegegesetz-20261105-ede54f",
      "title": "Pflegeversicherung: Sparpaket wird kritisiert",
      "summary": "Die chronisch unterfinanzierte Pflegeversicherung soll neu aufgestellt werden. In einem ersten Schritt geht es vor allem um ein Sparpaket, kritisieren soziale Dienste wie die Diakonie.",
      "origin": "Originalmetadaten",
      "url": "https://www.ndr.de/nachrichten/info/neues-pflegegesetz-reines-sparpaket-oder-gezieltere-foerderung,pflege-694.html",
      "expectedKoHash": "d79515c75c256d19e60685621723fff4bcf4b89e6acbe3faafaf518ffa59f967",
      "expectedRawHash": "d30094af2af8a148f733be42f19fc585ba0ac0ffd1005091956732053d0bece4"
    },
    {
      "case": "RND Pflegereform",
      "rawId": "rd-4d615e8e738c50b6a12772b7701267d3ad2fa6d3ec2ae6c50a3771e31e214ca5",
      "koId": "ko-vg-pflegereform-20261105-b189ff",
      "title": "Pflegereform: Nachbesserungen angekündigt",
      "summary": "Bei der ersten Beratung der Pflegereform im Bundestag hat Gesundheitsminister Carsten Linnemann (49, CDU) Schwachstellen eingeräumt und Nachbesserungen angekündigt.",
      "origin": "Originalabsatz im Abschnitt zur Pflegereform",
      "url": "https://www.rnd.de/politik/sexismus-problem-in-der-bundeswehr-nachbesserungs-vesprechen-bei-der-pflegereform-77KDNKNJYREEREH3LK37QEEFBA.html",
      "expectedKoHash": "d58a57c0cba01a08d891190bb1846625189b6c39523aef394cbef0ad6bcbbd59",
      "expectedRawHash": "0e16a34577993a44ae654cd8429baf0af1422c80c05bb207935f8948e05d215e"
    },
    {
      "case": "Bundestag Pflegebetrug",
      "rawId": "rd-25dafbdc7b9afb0ffa35e0d75608f7bb8c2c100d9195862929428ec67af8616c",
      "koId": "ko-vg-pflegebetrug-20261104-becc2d",
      "title": "AfD fordert eine Betrugspräventionsdatenbank",
      "summary": "Die Abgeordneten fordern vom Spitzenverband der Gesetzlichen Krankenversicherung (GKV) eine Betrugspräventionsdatenbank. Dabei sollten KI-gestützte Analyseverfahren zur Identifizierung auffälliger Abrechnungsmuster genutzt werden.",
      "origin": "Originalabsatz der amtlichen Meldung",
      "url": "https://www.bundestag.de/presse/hib/kurzmeldungen-1231210",
      "expectedKoHash": "47346c48707c5977a54810bc36f461a473128b5d88f8652d6964b338adf010b4",
      "expectedRawHash": "bb7765f49014952492102d6ab14a3a682fc5b579908c6c9f1bd2581a800a504d"
    },
    {
      "case": "Bundestag Anhörungsplan",
      "rawId": "rd-abe2c9a6e146b7dd37785c5a06ce7f6e8a46f8d6bfaf0f5333220a7130110ce8",
      "koId": "ko-vg-infrastrukturbeschleunig-20261028-7081d4",
      "title": "Anhörungsplan für die Sitzungswoche 2. bis 6. November 2026",
      "summary": "Der veröffentlichte Plan kündigte für Montag, 2. November 2026, um 12.30 Uhr eine Anhörung im Ausschuss für Wirtschaft und Energie zum Ausbau der Windenergie auf See an.",
      "origin": "Originaltermin mit Originaldatum; Kurzfassung als geprüfte Paraphrase",
      "url": "https://www.bundestag.de/presse/pressemitteilungen/2026/pm-261027-oea-kw45-1229788",
      "expectedKoHash": "1c71fc1c30f8b15421a73d3757ea08b0408a0f8abe8d4d0b65170baca7848028",
      "expectedRawHash": "5e8cf5e2e2013f5cf3cf07960394ccb91e891ca626b5807f9828d789d700e83c",
      "sourceExcerpt": "Montag, 2. November 2026 12.30 Uhr: Ausschuss für Wirtschaft und Energie - Ausbau der Windenergie auf See (Paul-Löbe-Haus, Sitzungssaal 4 600)"
    },
    {
      "case": "CO2 Quelle korrigieren",
      "rawId": null,
      "koId": "ko-vg-bundestages-20261105-c4c8fe",
      "title": "Bundestag beschloss Änderung des Brennstoffemissionshandelsgesetzes am 15. Oktober",
      "summary": "Der Bundestag beschloss am 15. Oktober 2026 den geänderten Entwurf zum Brennstoffemissionshandel. Das Abstimmungsergebnis lautete 303 Ja Stimmen, 210 Nein Stimmen und 52 Enthaltungen.",
      "sourceExcerpt": "In namentlicher Abstimmung votierten 303 Abgeordnete für den Gesetzentwurf, 210 stimmten dagegen. Es gab 52 Enthaltungen.",
      "origin": "Neue amtliche Quelle; überholte Aussage aus September wird ersetzt",
      "url": "https://www.bundestag.de/dokumente/textarchiv/2026/kw42-de-brennstoffemissionshandelsgesetz-1223608",
      "sourceDate": "2026-10-15",
      "expectedKoHash": "feac2719f2b6e9325b4e847bcde082579b3d9f0ab90294a5b9918586e885a5d6"
    }
  ],
  "park": [
    {
      "id": "ko-vg-öffentliche-20260529-0b6720",
      "expectedRowSha256": "d63827e0b0889963f6455cb8b9554996bbe71aeb512e773018ad0b31c5d32d13",
      "set": {
        "status": "pending",
        "understanding_status": "failed"
      },
      "reason": "Vor Korrektur wegen Quellenmix ausgeblendet; kurzer amtlicher Auszug darf diese ungeprüften Altanalysen nicht freischalten. Alte Texte und Quellenlinks erhalten."
    },
    {
      "id": "ko-vg-öffentliche-20260529-0b6720-2",
      "expectedRowSha256": "28d73eebeaf63930a59523411a04fbe06d9b1b321e54416eb7134a585315d037",
      "set": {
        "status": "pending",
        "understanding_status": "failed"
      },
      "reason": "Vor Korrektur wegen Quellenmix ausgeblendet; kurzer amtlicher Auszug darf diese ungeprüften Altanalysen nicht freischalten. Alte Texte und Quellenlinks erhalten."
    }
  ],
  "reviewedSet": {
    "textFieldsEmpty": [
      "warum_wichtig",
      "why_relevant",
      "wer_ist_betroffen",
      "handlungsempfehlung",
      "recommendation",
      "risk_of_no_action",
      "opportunity_summary",
      "recommended_communication",
      "stage"
    ],
    "arrayFieldsEmpty": [
      "risiken",
      "chancen",
      "action_items",
      "action_items_struct"
    ],
    "fixed": {
      "risk_level": "unknown",
      "opportunity_level": "unknown",
      "zeitdruck": "",
      "recommended_communication_struct": {
        "suggestedOutputs": [],
        "communicationLine": "",
        "recommendedFormat": "none",
        "recommendedChannel": "none"
      }
    },
    "facts": [
      "headline und display_title aus candidate.title",
      "was_ist_passiert und display_summary aus candidate.summary",
      "best_source_url aus candidate.url",
      "source_document_count aus tatsächlichen Links",
      "ko_version erwarteter Altwert plus 1; verstehen_fencing bleibt unverändert; updated_at tatsächlicher Ausführungszeitpunkt"
    ],
    "typedNullFields": [
      "deadline"
    ]
  },
  "rawRules": [
    "summary aus candidate.sourceExcerpt, andernfalls candidate.summary; kein fremder Text unter alter URL",
    "Bestehende übrige Quellfelder unverändert; separater manueller Korrekturbeleg mit URL, Methode, Auszugshash und tatsächlicher Prüfzeit; keine automatische v2 Provenienz erfinden",
    "Neue amtliche Quelle über existierenden Dedup Algorithmus aus ihrer eigenen kanonischen URL; kein erfundenes published_at; Originaldatum 2026-10-15 nur taggenau belegen",
    "PresseBox Rohzeile bleibt erhalten; aktuelle KO Verknüpfung durch amtliche Quelle ersetzen und alte Verknüpfung im Rückweg sichern"
  ],
  "blocked": {
    "id": "ko-vg-schulbesuche-20261105-26a829",
    "reason": "RP Original nicht abrufbar; keine verifizierte identitätsstabile Alternative. Unverändert Titel und ehrlicher Hinweis."
  },
  "preconditions": [
    "Alle erwarteten Rowhashes sowie vollständige Ziel Links unmittelbar vor Schreiben prüfen; Abbruch bei Abweichung",
    "Keine aktive Verarbeitung oder Lease für Zielobjekte; Schutzgrenzen und andere Arbeit unverändert",
    "Vorherwerte nur der betroffenen Daten und alten CO2 Verknüpfung vor Ausführung dauerhaft im Git Arbeitszweig sichern; keine Profile, Schlüssel, Volltexte oder Embeddings",
    "Alle Schreibvorgänge in genau einer Transaktion mit Zeilensperren und exakten Soll Anzahlen; bei Abweichung Rollback",
    "Nachher native Zeilen rücklesen; dieselbe Quellenprojektion und Kartenfunktionen offline prüfen; keine modellaufrufende Production API zum Test starten",
    "Rückweg nur betroffene Felder und Quelle Links mit Nachher Hashbindung zurücksetzen; neue amtliche Quelle nur entfernen wenn unverändert und ohne neue fremde Verknüpfung"
  ],
  "note": "Freigabe gilt ausschließlich für diesen begrenzten Datenumfang, keine Aktivierung HELMUT_ARTIKELKONTEXT, keine Profiländerung und keine Neuberechnung von Briefings."
}
```

## Betreiberfreigabe und technische Ausführungsvoraussetzung

Der Betreiber hat am 7. November 2026 im selben Thread mit „Ja go. Merge.“ den beschriebenen Datenumfang und den anschließenden Merge freigegeben.

Vor dem Schreiben wurde die Vorlage an der nativen Datenbank geprüft. Der bestehende Trigger erlaubt Änderungen von `verstehen_fencing` ausschließlich über den Understanding Speicherweg. Diese Spalte wird deshalb entgegen der ersten technischen Vorlage vollständig aus den Schreiboperationen entfernt und unverändert gelassen. Kein Trigger wird deaktiviert und kein Freigabeschalter gesetzt. Stattdessen werden alle sieben bestehenden Reservierungszeilen vor den Datenänderungen gesperrt und mit ihren vollständigen nativen Hashes verglichen. Fehlende Zeilen, jede Veränderung oder ein nicht leerer Lease führen zum vollständigen Abbruch. `ko_version` wird wie vorgesehen erhöht.

Sechs Zielreservierungen stehen auf `fertig`; die Reservierung zur Pflegereform hat bereits zuvor den historischen Ausgang `unbekannt` bei Fencing 3 und Ergebnisfencing 2. Dieser Ausgang bleibt vollständig erhalten. Die redaktionelle Quellenkorrektur löst keinen Modellaufruf aus und klärt diesen historischen Verarbeitungsausgang nicht nachträglich.

Die dauerhaft gesicherten Vorherwerte stehen in `quellenkorrektur-20261107-vorher.md`. Die Ausführung und native Rücklesung sind abgeschlossen; der Nachherbeleg steht in `quellenkorrektur-20261107-nachher.md`.

## Ausführungsergebnis

Erfolgreiche Transaktion nach Betreiber GO, native Rücklesung am 07.11.2026 um 13:28 Uhr Istanbul, 11:28 Uhr Berlin, 10:28 UTC. Vier bestehende Rohzeilen erhielten begrenzte Originalauszüge mit manuellem Herkunftsbeleg. Eine neue amtliche Bundestagsquelle wurde angelegt und beim CO₂ Vorgang anstelle der überholten aktuellen PresseBox Verknüpfung gebunden. Die historische PresseBox Rohzeile blieb bytegleich. Fünf Kurzfassungen wurden anhand der verifizierten Originale korrigiert; nicht belegte Einordnungen und Handlungstexte entfernt. Zwei geteilte, vermischte Altvorgänge sind mit bestehenden Statuswerten zurückgehalten. Alle sieben technischen Reservierungen und ihre Fencing Werte blieben unverändert. RP blieb einschließlich seines KO Hashes unverändert offen. Kein 6 von 6 Erfolg.

Gezielte Nachkontrolle mit den tatsächlich rückgelesenen Zeilen: `geleseneQuelle`, `koToVorgangCard`, `themenrein`, `quellengebunden` und `sourceSafety.guardKnowledgeObject`; fünf korrigierte Karten passieren die bestehenden Prüfungen und zeigen die geprüften Kurzfassungen. Beide vermischten Altfälle sind nicht auslieferungsberechtigt. Alle 36 geladenen Helmut Module sind per Git Blob SHA an main c8637001 gebunden. Ausschließlich erwartete Felder änderten sich. Unbetroffene Rohquellen, der RP Vorgang und alle Reservierungen stimmen mit ihren vorherigen nativen Hashes überein. Start über `scripts/lokal.js` unter Netzschutz, keine Production API zum Test ausgelöst und keine Provideraufrufe durch diesen Korrekturlauf.

Der erste Ausführungsversuch scheiterte mit SQLSTATE 22007, weil das vorhandene Feld `deadline` den Typ timestamptz hat und als leerer Text vorgesehen war. Die gesamte Transaktion wurde zurückgerollt; native Rücklesung bestätigte alle sieben unveränderten KO Hashes, alle vier unveränderten Rohhashes, 22 unveränderte Ziel Links und keine neue Quelle. Danach wurde ausschließlich das Datumsfeld auf SQL NULL korrigiert. Ein weiterer Aufruf wurde vor einer Toolrückmeldung unterbrochen; die anschließende Rücklesung bestätigte erneut den unveränderten Vorherstand. Erst der danach erfolgreiche Aufruf zählt als Ausführung. Der unabhängige Prüfer hatte zuvor den unveränderten Fencing Vertrag und die begrenzte Transaktion geprüft. Der Erstfehler wird hier ausdrücklich erhalten.

Ausgeführte SQL SHA256: `fbadae1b22385dbe63665f9aa1d1c8c086d2ffea92103316829d3696ee6e6691`. Gesicherte Vorherwerte: `quellenkorrektur-20261107-vorher.md`, ursprüngliche Sicherung vor Ausführung auf e7bfe168. Nachherhashes, Kanten und bedingter Rückweg: `quellenkorrektur-20261107-nachher.md`. Keine Trigger, Umgebungsvariablen, Profile, Budgets, Embeddings oder historischen Briefings geändert. Die automatische Ergänzung neuer Artikel bleibt inaktiv und ist kein Teil dieses Erfolgsnachweises.
