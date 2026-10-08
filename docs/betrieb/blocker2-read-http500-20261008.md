# Blocker 2: HTTP500 im neuen Nurleselauf und sichere Einzeldiagnose

Stand 08.10.2026. **Blocker 2 offen, fachliche Abnahme 0/500.**
Der konkrete einmalige neue 500er Nurleseauftrag ist verbraucht.
Keine automatische Wiederholung oder weitere Production-Datenfreigabe.

## Tatsächlicher neuer Lauf

[Lauf 37748818380](https://github.com/ernisch/helmut-pilot/actions/runs/37748818380)
wurde nach dem direkten Betreiberauftrag „weiter“ zum exakt beschriebenen
neuen Einmallauf einmalig gestartet. Workflow-Commit
`65edf8d8730fda96258a3ab57e8363f384d41092`, tatsächlicher Production-Commit
`05cc738df6e8b8856e84540fc7c5fef8c0f08fb7`, Berliner Tag `2026-10-08`.
Start 11:17:05 Uhr Türkei (08:17:05 UTC); endgültig `failure` nach dem
eigenen Schutzstop bei Position122. Keine Abbruchentscheidung des Assistenten.

Die unveränderte Originalantwort von `test-kohorte-synthetik-bt-122` lautet:

```json
{"ok":false,"grund":"briefing-nachweis-nicht-lesbar"}
```

HTTP-Status **500**. Die vollständige Fehlerantwort wurde verschlüsselt erhalten.
Authentifiziertes hochgeladenes Abschlussmanifest: **122 Eingabeversuche**, eine
Startidentität, keine Abschlussidentität; **121 erfasst, eine technisch fehlerhaft,
378 nicht erfasst**. Keine weiteren Eingaben nach dem Fehler abgerufen.
Neun Server-Artefakte über den geprüften Connector lokal gesichert und sämtliche
ZIP-Digests, Originalbytes, Cipher-Positionsbelege und Manifestversionen geprüft.
500 verschlüsselte Positionsbelege bedeuten hier **121 nutzbare Eingaben**,
eine erhaltene Fehlerantwort und378 Nichterfassungsbelege.

| Exklusive fachliche Kategorie | Anzahl |
| --- | ---: |
| Vollständig fachlich angenommen | 0 |
| Zeit-, Quellen- oder Ebenenwiderspruch | 64 |
| Ereignisduplikat ohne zusätzlichen nachgewiesenen Widerspruch | 10 |
| Fehlender fachlicher Nachweis | 47 |
| Leer | 0 |
| Unbrauchbar | 0 |
| Technisch fehlerhaft | 1 |
| Nicht erfasst | 378 |
| **Gesamt** | **500** |

[Alle 500 eindeutigen Positionen](blocker2-read-http500-20261008.csv) sind vollständig
bilanziert. Alle121 nutzbaren Antworten wurden einzeln gegen Profil, inaktive
Synthetikbindung, Paketentscheidung, Eingabevertrag und5104 sichtbare
KO-/Quellen-/Resolver-/Profilbindungen geprüft. 4893 bereits belegte Inhaltsurteile
wurden nur bei identischen KO- **und sämtlichen Quellenversionshashes** übernommen.
Frühere Antworten, Profilbewertungen oder Erfassungszahlen wurden nicht ergänzt.
Fehlender Nachweis wird nicht als falsche Prosa ausgegeben.

Alle121 Antworten betreffen BT. Position122 ist technisch fehlerhaft;
208 weitere BT-, alle120 BE- und alle50 BB-Positionen nicht erfasst.
Die neuen A-KOs erscheinen mit der richtigen Quelle in105 beziehungsweise106
BT-Kandidaten/Briefingpositionen; daraus folgt keine notwendige BT-Relevanz.
Die **30 Berliner Bildungs- und zwölf Brandenburger Verkehrsprofile** wurden
nicht erreicht. Deren notwendige tatsächliche A-Bindung bleibt offen.
Der relative Heute-Ausgabefehler des Olympia-Vorgangs ist in17 neuen aktuellen
Eingaben tatsächlich unterdrückt; keine vollständige zeitliche Fachabnahme.
B weiterhin unfreigegeben, C gesperrt.

## Schutz- und Ursachennachweis

Die vollständigen 52 geschützten Tabellen einschließlich xmin waren unmittelbar
vorher um11:17:02.750436 Uhr Türkei (08:17:02.750436 UTC) und unmittelbar
nach dem endgültigen Workflow-Ausgang um
11:23:26.190586 Uhr Türkei (08:23:26.190586 UTC) exakt gleich.
Keine Quellen-, KO-, Profil-, Reservierungs- oder Modelltabellenänderung.
Kein Modellaufruf, keine Aktivierung, kein Funktionstest oder Rückweg.
Die fehlende Abschlussidentität wird ausdrücklich nicht als erfolgt ausgegeben.

Der ursprüngliche Servercatch verwarf die Ausnahme vollständig. Die begrenzten
Vercel-Error- und Runtime-Logabfragen lieferten keinen passenden Fehlerdatensatz.
Die konkrete HTTP500-Ursache ist daher **nicht bewiesen**; insbesondere weder
Storage-Timeout, Commit-/Profilwiderspruch noch Inhaltsfehler behauptet.
Profil122 wurde mit dem vollständigen authentischen KO-/Quellenstand aus
Position121 und seinem unveränderten gebundenen Profil durch den echten
aktuellen Aufbau **offline erfolgreich** geprüft:44 sichtbare Positionen,
null Netz, null Writes, null Modellaufrufe. Dies belegt keinen Production-Erfolg
für den fehlgeschlagenen Originalabruf und ersetzt keine neue Eingabeaufnahme.

## Eng begrenzte Codekorrektur

`briefing-pruefaufnahme` bewahrt bei Fehlern künftig den betroffenen Leseschritt
in einer modulprivaten WeakMap. Die ursprüngliche Ausnahme und alle Profil-,
Commit-, Tages-, Inaktivitäts- und Synthetikprüfungen bleiben erhalten; weiterhin
genau zwei Profilreads und ein Aufbau. Erfolgreiche Antworten unverändert.
Die Fehlerprojektion enthält ausschließlich eine feste Version, feste Phase,
feste Fehlerklasse und gegebenenfalls einen numerischen Storage-HTTP-Status.
Keine Rohfehlermeldung, Stack, URL, Query, Profilwerte, Identität oder Secrets.
Der Cron-geschützte B2-HTTP-Catch und dessen Log verwenden nur diese Projektion.
Das repariert den belegten **Diagnoseverlust**, nicht eine behauptete unbekannte
Storage- oder Fachursache. Blocker1-Motor und Blocker3-Kostensteuerung unverändert.

Ein separater manueller Workflow `blocker2-readonly-diagnose.yml` ist vorbereitet.
Er nutzt denselben freigegebenen Secret-/Cipher-/ACK-/Stop-Weg, aber ausschließlich
das fest im Code gebundene inaktive synthetische BT-Profil122. Keine frei
wählbare Person, kein Profilparameter, keine automatische Ausführung oder Wiederholung.
Maximal **eine Eingabe, zwei Identitätsprüfungen und drei Minuten Erfassung**;
die äußere Jobgrenze einschließlich Einrichtung und Cipher-Sicherung beträgt15 Minuten.
Die geschlossene500er Cipherbilanz bleibt ehrlich:499 nicht angeforderte
Positionsbelege; `diagnosticOnly=true`, `collectionCompleted=false`,
`all500InputAcceptance=false`. Ein erfolgreicher Einzeltransport ist kein
vollständiger500er Nachweis. Bei jeder unbekannten Diagnoseantwort/Lesefehler
wird auch die weitere Abschlussidentität nicht mehr abgerufen.

Gezielte Offlineprüfungen bestehen: originale Fehleridentität und Phasen,
wirkliche Storage-Timeouttexte, Geheimnisfreiheit der tatsächlichen HTTP-Antwort
und Logs, ungebundene Fehler und feindliche Getter, unveränderte aktive/fremde/
manipulierte Profilsperren, fester Einzelabruf und Höchstgrenzen, ACK-vor-GET,
Fehler-/Tag-/Commit-/Modellstop, geschlossene ehrliche Cipherpositionen sowie
bestehende500er- und reale Abbruchsignal-Regression. Die neuen Tests sind
im Pflicht-Standard registriert. Kritische unabhängige Endprüfung und Pflicht-CI
werden am exakten PR-Kopf gebunden; keine Runtime-Verifikation durch Fixtures ersetzt.

## Tatsächlicher Merge und reguläres Deployment

[PR #862](https://github.com/ernisch/helmut-pilot/pull/862) wurde ausschließlich am
Kopf `aaf688304f9089f2037d0694f097aa78e46e8592` gemergt. Beide Pflichtchecks im
[CI-Lauf37752964486](https://github.com/ernisch/helmut-pilot/actions/runs/37752964486)
erfolgreich; unabhängiger Code-/Doc-Endreview PASS, SHA256
`f4ebbba694ca2f1847214fe146c6950592cd4eb3379b7fa5693f0ed4d09ad84c`.
Merge am08.10. um12:12:48 Uhr Türkei (09:12:48 UTC), genau Eltern
`65edf8d8730fda96258a3ab57e8363f384d41092` und der geprüfte PR-Kopf.
Alle zwölf geprüften Dateihashes im Merge unverändert; der vorige Production-
Commit `05cc738df6e8b8856e84540fc7c5fef8c0f08fb7` ist Vorfahr.

Reguläres Production-Deployment **`dpl_7q4VfZfH15PYrPEDwTDatd2afPEa` READY** auf
Merge **`3f5fbc731f32d1b73488bc0e0df49240a3993b92`**, aktive Aliasbindung bestätigt.
Vollständige native52-Tabellen-/xmin-Vergleiche unmittelbar vor Merge um
09:11:52.941165 UTC und nach READY um09:13:54.055704 UTC exakt gleich;
einschließlich501 Identitäten/500 Mandate sowie Nutzungs-/Reservierungs-/Budgettabellen.
Keine Production-Daten-/Profiländerung oder Modellaufrufe. GitHub bestätigt
**null Diagnose-Läufe**; der letzte500er Lauf bleibt37748818380. Kein neuer Abruf.
Private Quittungen: `blocker2-pr862-merge-tree-proof.json`,
`blocker2-pr862-ready-protected-deployment-proof.json`,
`blocker2-pr862-immediate-premerge-full52.json`,
`blocker2-pr862-immediate-postdeployment-full52.json` und
`blocker2-pr862-diagnostic-zero-runs-native-receipt.json`.

## Nächster kleinster Production-Schritt — noch nicht freigegeben

Die konkrete neue Abruffreigabe muss an Production-Commit
**`3f5fbc731f32d1b73488bc0e0df49240a3993b92`** gebunden sein. Vorbereitung vollständig;
der ursprüngliche Einmallaufauftrag ist verbraucht. Gesondert freizugeben:

- genau ein manueller Lauf des festen Einzeldiagnose-Workflows;
- Workflow `blocker2-readonly-diagnose.yml` auf überprüftem `main`, dessen
  Diagnose-/Ciphercode bytegleich mit dem kritisch akzeptierten Kopf sein muss;
- genau `test-kohorte-synthetik-bt-122`, höchstens eine Eingabe und zwei Identitäten;
- höchstens drei Minuten Erfassung auf einem unveränderten Commit/Berliner Tag;
- native vollständige52-Tabellen-Nurlesekontrolle unmittelbar vorher/nachher;
- derselbe feste Verschlüsselungsempfänger, keine Secrets oder signierten Links ausgeben;
- Empfänger-SPKI-SHA256
  `8d665b71487b557f9cbdedb7e5da848022f3f80f820f9fc6233353658ffd41e7`,
  vorhandenes Cron-Secret ausschließlich im GitHub-Workflow verwenden;
- null Daten-/Profil-/Reservierungsänderung, Aktivierung oder Modellaufrufe;
- kein500er Funktionstest, kein weiterer500er Eingabelauf, keine automatische Wiederholung;
- neue Antwort vollständig authentifiziert auswerten; bei Fehler Phase und Klasse
  gegen Nachkontrolle prüfen; bei Erfolg keine rückwirkende Ursache erfinden.

Erwartete Wirkung: beweisbare einzelne Antwort beziehungsweise eingrenzbare
Fehlerklasse. Risiko: der Fehler tritt nicht erneut auf oder endet vor einer
gebundenen Phase; dann bleibt seine frühere Ursache offen. Kein Production-
Rückweg nötig, kein automatischer Rückweg erlaubt. **Noch kein Diagnoseabruf.**
Erst nach diesem konkreten Ursachen-/Lesepfadnachweis über einen neuen aktuellen
vollständigen500er Auftrag entscheiden; kein dritter blinder Vollversuch.

Private Originale liegen außerhalb von Git unter
`/workspace/private/blocker2-20261007/`: `durable-run-37748818380/`,
`durable-37748818380-all500-actual-input-structural-evaluation.json`,
`post-A-recapture2-20261008-immediate-before-full52.json`,
`post-A-recapture2-20261008-immediate-after-full52.json`,
`post-A-recapture2-20261008-all500-individual-available-input-assessment.json`,
`post-A-recapture2-20261008-offline-profile122-rebuild.json` und der vollständige
verschlüsselte HTTP500-Beleg. Endreview und Merge-/Deployment-Protokoll werden
mit exakten Dateihashes gesichert.

Die unabhängige Incident-Endprüfung akzeptiert ausschließlich diese belegte
Teilbilanz und Schutzgrenze, ausdrücklich keine500er Abnahme. Sie prüfte alle121
Verträge und5104 sichtbaren Bindungen selbst gegen die neuen Originalantworten.
Privater Bericht `post-A-recapture2-20261008-independent-incident-review.json`,
SHA256 `980ae2556ebce96036da4aa5bf2cb8d83aceda6ffc626e842e250debc4e21055`.
