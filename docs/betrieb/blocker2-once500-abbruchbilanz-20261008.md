# Blocker 2: neuer Einmallauf abgebrochen, Originalbelege erhalten

Stand: 08.10.2026. **Blocker 2 bleibt offen; fachliche Abnahme 0/500.**
Der Betreiber genehmigte genau einen neuen Nurleselauf auf Production
`05cc738df6e8b8856e84540fc7c5fef8c0f08fb7`. Dieser Lauf ist verbraucht.
Keine automatische Wiederholung, keine weitere Datenfreigabe.

## Lauf und tatsächliche Bilanz

[GitHub-Lauf 37745862429](https://github.com/ernisch/helmut-pilot/actions/runs/37745862429)
ist endgültig `cancelled`, Versuch 1. Gestartet 10:49:49 Uhr Türkei
(07:49:49 UTC); Collector-Abbruchmeldung 10:53:40 Uhr Türkei
(07:53:40 UTC), abschließend beendet 10:53:49 Uhr Türkei (07:53:49 UTC).
Berliner Eingabetag durchgehend `2026-10-08`.
Workflow-Commit `3b3633e6489868936f0cb804c8b3c9fd50243114` ist der
Dokumentationsnachfolger auf main. Der vollständig getrennt gebundene
Production-Commit blieb `05cc738d…`; keine Gleichsetzung beider Identitäten.

Das authentifizierte, tatsächlich hochgeladene Abschlussmanifest belegt
**88 Eingabeversuche**, **eine Startidentitätsprüfung**, keine Abschlussidentität,
87 vollständige HTTP-200-Eingaben, eine ohne erhaltenen Body unterbrochene
Position und 412 nicht erfasste Positionen. Kein 500er Funktionstest.
Keine 500 Eingaben aus den 500 verschlüsselten Positionsbelegen ableiten:
413 davon belegen einen Fehler beziehungsweise die Nichterfassung.

| Exklusive fachliche Kategorie | Anzahl |
| --- | ---: |
| Vollständig fachlich angenommen | 0 |
| Zeit-, Quellen- oder Ebenenwiderspruch | 46 |
| Ereignisduplikat ohne zusätzlichen nachgewiesenen Widerspruch | 7 |
| Fehlender fachlicher Nachweis | 34 |
| Leer | 0 |
| Unbrauchbar | 0 |
| Technisch fehlerhaft | 1 |
| Nicht erfasst | 412 |
| **Gesamt** | **500** |

Die [vollständige Positionsbilanz](blocker2-once500-abbruchbilanz-20261008.csv)
enthält alle 500 eindeutigen synthetischen Profile. Positionen 1–87 sind
Bundestagsprofile, Position 88 wurde unterbrochen, 89–500 nicht erfasst.
Damit fehlen 242 weitere BT-, sämtliche 120 BE- und sämtliche 50 BB-Eingaben.
Die 87 erhaltenen Eingabeverträge wurden vollständig neu berechnet und
gegen die tatsächlichen Originalantworten, inaktiven Profile und Paketbindungen
geprüft. Sämtliche 3679 sichtbaren KO-/Quellen-/Profilbindungen wurden einzeln
ausgewertet. 3528 bestehende Inhaltsurteile konnten ausschließlich bei exakt
gleichem KO-Hash **und sämtlichen Quellenversionshashes** wiederverwendet werden.
Frühere Antworten, Profilurteile oder Erfassungszahlen wurden nicht ergänzt.
Unbelegte Notwendigkeit und fehlender Volltext sind kein Beweis falscher Prosa.

Die verbliebenen Widersprüche betreffen die bereits belegten Land-/Kommune-
und sachfremden Quellenbindungen aus der weiterhin unfreigegebenen Maßnahme B.
Der alte relative Heute-Ausgabefehler wurde nicht ungeprüft übertragen:
In 13 neuen aktuellen Eingaben ist für den betroffenen Olympia-Vorgang die
Zusammenfassung tatsächlich leer und der Titel ohne „heute“. Originalquellen-
zitate und gespeicherte KO-Texte bleiben historisch datiert; dies ist keine
vollständige zeitliche oder fachliche Abnahme.

## Maßnahme A: gezielte Wirkung weiterhin offen

Die neuen A-KOs und jeweils die richtige Quellenkante sind in den erhaltenen
BT-Kandidaten und teilweise deren Briefingpositionen technisch angekommen:
Berliner Bildungs-KO in 75, Brandenburger Verkehrs-KO in 76 der 87 Eingaben.
Die vollständigen exponierten KO-Felder stimmen jeweils mit den frisch
zurückgelesenen A-Zeilen überein; jeweils genau die vorgesehene Quelle ist gebunden.
Das belegt keine notwendige Relevanz für diese BT-Profile.

**Die 30 Berliner Bildungsprofile und zwölf Brandenburger Verkehrsprofile
wurden nicht erreicht.** Ihre tatsächliche notwendige Briefingeingabe nach A
ist daher weiter unbelegt. Die vier vorhandenen A-Zeilen allein erzeugen keine
fachliche Annahme. B bleibt unfreigegeben; C bleibt gesperrt.

## Ursache und erhaltene Sicherung

Der lokale Monitor verwendete `gh api …/artifacts/…/zip`. Der umgeleitete
Azure-Blob-Download antwortete `Forbidden`. Die übrigen GitHub-API-Lesezugriffe
und die Abbruchanforderung funktionierten. Ein GitHub-HTTP-401-, Cron-
Authentisierungs-, Production- oder Runner-Sicherungsfehler ist damit **nicht
belegt**. Die genaue Ursache der Azure-Verweigerung bleibt unbewiesen.

Codex forderte wegen dieses lokalen Downloadfehlers den Abbruch an.
Dies war eine Entscheidung des ausführenden Assistenten, kein belegter
Collector-Schutzstop. Der funktionierende alternative Download hätte zuerst
geprüft werden sollen. Der reparierte produktive Sicherungsweg funktionierte:
sechs verschlüsselte Zwischenstände und vier abschließende Pakete blieben
auf GitHub erhalten. Auch die Paketierung nach dem Abbruch war erfolgreich.

Alle zehn Artefakte wurden danach über `github_download_workflow_artifact`
und `download_file` ohne neue Helmut-Abrufe lokal gesichert. Sämtliche ZIP-
Bytes, Größen, GitHub-Digests, CRCs und die unveränderten Cipherdateien wurden
geprüft. Alle 500 Positionsumschläge und die sieben unterschiedlichen
gesicherten Manifestversionen wurden authentifiziert; nur das tatsächlich
hochgeladene Abschlussmanifest bestimmt die Bilanz. Privater Schlüssel,
Cron-Secret, Zugangsdaten und kurzlebige signierte Downloadlinks gehören
weder in Repository noch sichtbare Fehlerausgaben.

## Vollständige Nachkontrolle

Die 52 geschützten Tabellen wurden unmittelbar vor dem Lauf um
10:49:46.410589 Uhr Türkei (07:49:46.410589 UTC) und nach dessen endgültigem
Abbruch um 10:56:02.657244 Uhr Türkei (07:56:02.657244 UTC) vollständig unter
rein lesendem, wiederholbarem Snapshot erfasst. Alle vollständigen
Zeilenbestände einschließlich `xmin` sind exakt gleich. Quellen, Profile,
Reservierungen, Modelltabellen und die vier A-Zeilen blieben unverändert.
Die 87 tatsächlichen Antworten bestätigen jeweils Nurlesen, null Schreib-
und null Modellaufrufe. Die Startidentität und Vercels nachträglicher
Nurlesebeleg bestätigen READY `dpl_8EKpz8KrQXQTDnXR21nBrGyQbH38` auf `05cc738d…`.
Die wegen Abbruchs fehlende Abschlussidentität wird nicht durch diesen
Plattformbeleg als tatsächlich ausgeführter zweiter Collector-Abruf ausgegeben.

## Kleinster sicherer nächster Schritt — neue Freigabe erforderlich

Kein Collector-, Token-, Motor-, Datenbank- oder Production-Konfigurationsumbau
ist durch diesen Befund begründet. Der alternative Transport ist bereits
an allen zehn vorhandenen Originalartefakten erfolgreich nachgewiesen.
Vor einem nächsten, separat genehmigten Start wird genau dieser Connector-
Zugangsweg an einem vorhandenen Artefakt erneut geprüft und als Downloadweg
festgelegt. Run-/ACK-Überwachung und lokaler ZIP-Download werden getrennt:
Eine lokale Downloadverweigerung wird nicht als Production-Auth- oder
ACK-Verlust ausgegeben. Echte Schutzverletzungen stoppen weiterhin sofort.
Fehlerausgaben werden privat gespeichert und vor sichtbarer Ausgabe redigiert.
Der neue lokale `post-A-next-run-metadata-watch.py` wurde bereits ausschließlich
gegen den abgeschlossenen Lauf geprüft: richtige Run-/Workflow-Bindung,
`cancelled`, zehn dauerhaft gespeicherte Artefakte, keine ZIP-Downloads,
keine Helmut-Abrufe, keine Abbruch- oder Wiederholungsfunktion. Der alte
gekoppelte Monitor wird für einen nächsten Lauf nicht wiederverwendet.

Vorbereitet ist **genau ein neuer vollständiger Nurleselauf** auf dem frisch
bestätigten READY-Commit `05cc738df6e8b8856e84540fc7c5fef8c0f08fb7`, sofern
dieser und der neu festgelegte Berliner Tag beim Start noch gelten:

- ausschließlich dieselben geschlossenen 500 inaktiven synthetischen Profile;
- höchstens 500 `briefing-nachweis?modus=eingabe`-Abrufe und zwei Identitätsabrufe;
- höchstens 55 Minuten Erfassung, ein Commit und ein Berliner Tag;
- bestehender fester Verschlüsselungsempfänger, laufende verschlüsselte ACK-Sicherung;
- vollständige native Nurlesekontrolle aller 52 Tabellen unmittelbar vorher/nachher;
- keine Daten-, Profil-, Aktivierungs- oder Reservierungsänderung, keine Modellaufrufe;
- kein Funktionstest, keine automatische Wiederholung, keine Vermischung mit Altaufnahmen;
- danach alle 500 tatsächlichen Eingaben einzeln prüfen, insbesondere die 42 A-Zielprofile.

Erwartete Wirkung: neue vollständige und eigenständig belegte Eingabegrundlage,
keine automatische Fachabnahme und keine Anwendung von B oder C.
Risiko: erneute Unterbrechung, Commit-/Tagesdrift oder Schutzverletzung;
in diesem Fall stoppen und vorhandene Cipher unverändert sichern.
Ein Production-Rückweg ist wegen des Nurleseumfangs nicht erforderlich und
keine automatische Datenrücknahme erlaubt. **Noch nicht gestartet.**

## Private Primärbelege

Die Originale bleiben unter `/workspace/private/blocker2-20261007/`, außerhalb
von Git. Kernbelege:

- `durable-37745862429-final-native-run-receipt.json` und
  `post-A-once500-20261008-final-jobs.json`;
- `durable-run-37745862429/artifacts/` und `encrypted/`, einschließlich
  `authenticated-final-manifest-selection.json`;
- `post-A-once500-20261008-immediate-before-full52.json` und
  `post-A-once500-20261008-after-cancel-full52.json`;
- `durable-37745862429-all500-actual-input-structural-evaluation.json`;
- `post-A-once500-20261008-all500-individual-available-input-assessment.json`,
  `post-A-once500-20261008-all500-individual-summary.json` und CSV;
- `post-A-once500-20261008-completion-and-guards.json`;
- `post-A-once500-20261008-independent-incident-review.json`, SHA256
  `b25429872bec084fdca6f43787943d5d29a8b798bf7778a3a566ec75c11d4b09`:
  PASS für Beweissicherung, unveränderte Daten und ehrliche Teilbilanz;
  BLOCKED für einen vollständigen 500er Nachweis.
