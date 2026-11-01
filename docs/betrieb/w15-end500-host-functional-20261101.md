# End500 Funktion mit dynamischem Hostlimit

Vertragsversion: `helmut-w15-end500-host-functional/1`, 01.11.2026.
Freigegeben sind Entwicklung und Prüfung. **Kein Originallauf ist freigegeben.**

## Getrennte Urteile

1. **End500 Funktion:** Ein einziger tatsächlicher Lauf muss zwölf Originalpins,
   Restore mit exakt 500 Profilen und null aktiven Profilen, 500 Auth CAS,
   6.000 Usagezeilen, 3.501 native Postimages, Export, null aktive Profile,
   bestätigten Dienststopp, vollständige verschlüsselte Sicherung,
   authentifizierte entfernte Rücklesung und zweite frische isolierte
   Wiederherstellung mit vollständigem Integritätsvergleich belegen.
   Anschließend müssen Worker, Supervisor und eigener Parent beendet sein.
2. **Ressourcen:** Gemeinsamen Kernel-Lebenszeitpeak und vorhandene Phasen-/
   Komponentenmessungen berichten. Dateiseiten und Prozess-PSS überlappen;
   zeitlich verschiedene Maxima nicht addieren. Unbekannte Anteile bleiben
   UNKNOWN. Die alten 2.048.000.000 und 4.999.999.488 Bytes sind hier nur
   Vergleiche des gesamten Lebenszeitpeaks einschließlich Sicherung, keine
   neu gemessenen reinen Verarbeitungsspitzen. Ihre ursprünglichen Abnahmen
   werden nicht bestanden erklärt.
3. **Production:** Vercel 2 GB je Funktionsinstanz und Supabase Micro 1 GB
   bleiben getrennte Referenzen. Eignung für 500 Profile bleibt UNKNOWN.
   Kein Production-, Mock500- oder Anbieter-PASS aus dieser End500-Abnahme.

## Vor dem Lauf ausdrücklich binden

Der vorhandene geschützte Workflow und sein Modus
`end500-full-host-capacity-diagnostic` werden unverändert wiederverwendet.
Die **zusätzliche ausdrückliche Vertragsauswahl** ist das Feld
`approval.resourceContract = helmut-w15-end500-host-functional/1`.
Es bindet sich mit exaktem Commit, neuer Nonce, Quellenqualifikation,
Einmalfreigabe, Frist, unverändertem ursprünglichem Manifest und Empfänger.
Sender und Empfänger prüfen diese Auswahl vor Originalzugriff. Das bestehende
Ausführungsfenster 01.–07.11.2026 und die maximal 60 Minuten bleiben erhalten.

Ohne diese Auswahl bleibt der bisherige Diagnosepfad unverändert. Alte
Diagnosequittungen, insbesondere Run 41300846909 (**FAIL**), erhalten keine
Funktionsabnahme. Sein letzter gesicherter Peak 5,118 GB ist eine Beobachtung,
keine Garantie für den nächsten Lauf. Die Reparatur aus PR1012 bleibt erhalten:
UID1000 nutzt das bereits hashgeprüfte Stagingmodul; Root prüft unabhängig.

## Unveränderte physische Schutzbedingungen

Der bereits geprüfte privilegierte Hostpfad berechnet auf dem tatsächlichen
GitHub Runner einmalig:

`floor((min(MemAvailable, alle endlichen Vorfahren-Headrooms) - 2.147.483.648) / 4096) * 4096`

Das Ergebnis ist das feste harte Limit dieses gesamten Laufs. Es wird weder
aus einer früheren Maschine übernommen noch später erhöht. Die bestehende
laufende Prüfung der Hostreserve und ursprünglichen Vorfahrenidentitäten und
Grenzen bleibt aktiv. Unbekannte Kapazität oder verlorene Reserve sperrt/stoppt.

- Mindestens 2.147.483.648 Bytes tatsächliche Hostreserve, ungefähr 2,15 GB.
- Swap, OOM, OOM-Kills und harte Speichergrenzereignisse jeweils null.
- Vollständiger bestehender Plattenplan; mindestens 512 MiB frei.
- Höchstens 3.600 Sekunden gemeinsam; keine Verlängerung durch diesen Vertrag.
- Höchstens 0,05 USD neue Speicherung; höchstens ein verschlüsseltes Artefakt,
  Aufbewahrung ein Tag. Null echte Modellaufrufe, keine Profilaktivierung.
- Kein Peakreset, kein Cacheeingriff, keine neuen Prozesse oder Ressourcen.
- Alle Vorbereitung einschließlich Pflicht-CI und Reviews vor frischen Links;
  unmittelbar vor genau einem Start Restgültigkeit über 90 Sekunden und
  höchstens 65.535 Zeichen Gesamtparameter. Kein Retry oder Linkrefresh.

## Same-Run-Quittung und unabhängige Abnahme

Die bestehende rohe Runner-/Workerquittung bleibt als Diagnosequittung erhalten;
ihre bisherigen Akzeptanzfelder bleiben false. Erst nach vollständig gültigem
Workerergebnis, Root-Lebenszeitprüfung und erfolgreichem Abschluss der bestehenden
Bereinigung ergänzt der äußere Empfänger eine geschlossene
`hostFunctionalObservation`. Sie enthält tatsächliche Ergebniszähler,
Nullaktivität, Export-/Stopp-/Rücklese-/Integritätsgates, finale Kernelwerte sowie
Hashes dieser tatsächlichen Anfrage und Quittung. Ihr Status lautet ausdrücklich
`PASS_SAME_RUN_END500_FUNCTION_ONLY_INDEPENDENT_ACCEPTANCE_PENDING`.
Fehlt eine Pflichtprüfung oder scheitert die Bereinigung, gibt es diese Quittung
nicht. Ein gültiger unabhängiger Review ist dadurch noch nicht erzeugt.

Der unabhängige Prüfer gleicht die vollständige Quittung mit authentifizierten
GitHub-Lauf-/Job-/Anfragebelegen, Laufzeit, Artefakt-/Speicherkostenbindung,
Originalpins und allen Sicherheitsprüfungen desselben Laufs ab. Er muss
`host_functional_contract.validate_independent_acceptance` mit den tatsächlichen
Belegen bestehen. Zwingend sind zusätzlich die authentifizierten Jobmetadaten
und die drei tatsächlich dort verwendeten öffentlichen Eingabefelder
`expected_commit`, `w15_mode`, `w15_request`. Die vollständige Deklaration
einschließlich vorher gewähltem Vertrag muss übereinstimmen; ihr Hash und die
Jobkennung werden mitabgenommen. Die authentifizierten Jobzeiten müssen positiv
und höchstens 3.600 Sekunden auseinanderliegen. Dieses zusätzliche konservative
Kriterium bilanziert die äußere Jobwall einschließlich Werkzeugvorbereitung; es
ersetzt nicht die unveränderte gemeinsame monotone Laufzeitwache. Eine nachträglich umetikettierte
alte Diagnoseanfrage scheitert auch bei selbstkonsistenten lokalen Hashes.
Kein Zusammensetzen mehrerer Läufe und keine erfundenen Werte.
Die neue Abnahme trägt Schema `helmut-w15-independent-end500-acceptance/4`,
Status `PASS_INDEPENDENT_GITHUB_END500_HOST_FUNCTIONAL_ACCEPTANCE` und den neuen
Vertrag. Sie behauptet keine historische reguläre RAM-Abnahme.

## Anschluss an Mock500

Nur der bereits vorhandene Mock-Funktionszweig darf diese neue unabhängige
End500-Abnahme zusätzlich zum bisherigen v3-Funktionsbeleg anerkennen.
Sender und Empfänger verlangen weiterhin einen tatsächlich erfolgreichen früheren
End500-Run, den exakten End500-Kopf, Originalmanifest/Empfänger und eine unabhängig
geprüfte Brücke zum Mockkopf. Die Brücke bindet zusätzlich
`end500FunctionalContract = helmut-w15-end500-host-functional/1`.
Ihr `functionalContract` bleibt der unveränderte eigene Mock-Vertrag.

Der Mock500-Vertrag, seine RAM-/Zeit-/Quellen-/Tages-/Namespace-/Ergebnisregeln,
1.500 Ergebnisse und 8.000 Kontrollen bleiben unverändert. Es fehlt weiterhin
sein gültiges eigenes GO. Ein End500-PASS startet Mock500 niemals automatisch.
Der historische Mock-Abbruch nach 69 Einheiten bleibt ein historischer FAIL.

## Fehler und Rückweg

Bei FAIL/UNKNOWN oder Sicherheitsverletzung sofort stoppen, erste Fehlerphase
und bestätigten Fortschritt erhalten. Nur eindeutig eigene Prozesse beenden;
Stillstand und die acht bestehenden Bereinigungskategorien nachkontrollieren.
Unbekannte Beobachtungen bleiben UNKNOWN. Kein weiterer Versuch, keine
Grenzerhöhung, automatische Branchrücksetzung oder Löschung.
Originale, Drive-Archive, Secrets und Versuchsjournale bleiben erhalten.
Rückweg: den neuen Vertragszweig nicht weiter verwenden. Kein Merge,
Deployment, Production-Eingriff oder nachträgliches Umwerten historischer FAILs.
