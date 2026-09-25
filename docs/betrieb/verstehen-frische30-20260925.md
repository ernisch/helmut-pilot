# Neuer30er Verstehensauftrag — vorbereitet25.09.2026

**Noch nicht ausgefuehrt.** Das konkrete Quellenimport-GO umfasst keinen Modellstart.
Dieser getrennte Auftrag braucht vor Ausfuehrung eine konkrete Freigabe seiner
Production-Schreibwirkung. PR-Merge/Deployment nach gruener CI sind bereits freigegeben.

## Gegenstand und Grenzen

Ausschliesslich die30 neuen Dokumente aus dem separat freigegebenen Import.
Kennungen: `belege/verstehen-frische30-ids.json`, ID-Hash
`e877d2e7fa0d583a3ebcd9c531fe74a2465a6006083c291b8e919249db9f44e3`.
Titel, Auszug, URL, Quellenidentitaet und Originalzeiten sind nochmals gemeinsam
per SHA256 gebunden (`7492cfec...c3a9350`), Quellen hoechstens48 Stunden alt.
Importplan-Codecommit `8d1ea932`; kein behaupteter Production-Snapshot-Commit.

Unveraenderte Produktionsclusterung:26 Vorgaenge (24 Einzelquellen, zweimal3).
Nurleseplanung09:34UTC mit105 Bestandskandidaten/211 Belegdokumenten:
23 neue Vorgaenge, zwei Aktualisierungen, ein bisher offener Vorgang.
Reservierungen09:35:57: zwei Bestandsvorgaenge fertig, kein unbekannter Ausgang
oder lebendes Lease fuer diese26 aufgeloesten Kennungen. Vor Ausfuehrung neu lesen.
Keine Wiederholung der169er Stufe oder der vier abgeschlossenen Problemfaelle.

Maximal26 Modellaufrufe,0,80USD gebunden inklusive offener Reservierungen,
15 Minuten absolute Laufzeit; weiterhin4USD je UTC-Tag. Kein Tageswechsel.
0 Profilwrites,0 Aktivierungen,0 Quellenabrufe,0 externe Nachrichten.
Ein bestehender fertiger Vorgang darf durch neue belegte Fakten fortgeschrieben
werden; Altfehler erhalten keine Wiederaufnahmefreigabe. Verarbeitet wird durch
`understandOneCluster` samt bestehendem CAS/Fencing, globalem Schloss und
atomarer Kostenreservierung. Feste neue Einmalquittung `verstehen30-20260925-a`.

## Bedienweg, Stopp und Nachkontrolle

Manueller Workflow `verstehen-frische30.yml`, nur erster main-Dispatch, voller
Runtime-Commit gleich Dispatch und Checkout. Ohne Bestaetigung nur lesen und
keine Modellkennungen. Scharf nur mit `DIE_30_NEUEN_QUELLEN_EINMAL_VERSTEHEN`.
504 ruhende Mandate/505 Identitaeten, keine Jobs/Prozesse/Leases, kein verwendeter
Auftrag und keine offenen Tagesreservierungen sind Voraussetzungen.

Unbekannte Ergebnisse bleiben sichtbar gesperrt; kein automatischer Neuversuch.
Kosten-, Laufzeit- oder Infrastrukturabbruch stoppt weitere Aufrufe. Nachher
Profilhash unveraendert, Sperren frei und alle26 Ergebnisse bilanziert; Erfolg
nur bei26 gespeicherten/aktualisierten/belegbar zusammengefuehrten Ergebnissen.
Zusaetzlich alle30 Production-Dokumente samt Verknuepfung und KO-Zustand lesen.
Ein Bericht allein beweist weder frische Profilversorgung noch1500 Ausgaben.

Rueckweg bei Fehler: keine weiteren Aufrufe, rein lesende Bilanz und Sperrkontrolle.
Keine pauschale Loeschung: Aktualisierungen koennen bestehende Ergebnisse betreffen;
eine Datenreparatur braucht einen eigenen belegten Plan. Kein Wiederverwenden der
Quittung oder unbelegtes Aufloesen einer Kostenreserve.

## Pruefstand

Lokal6/6 Bedien-/Bindungs-/Ruhe-Fallgruppen,117/117 bestehende Motorpruefungen,
29/29 Kosten-/Lesefehlerpruefungen. Reale30er Inhaltsbindung und6 negative
Inhalts-/Altersfaelle bestanden. Pflicht-CI und Production-Planlauf noch offen.
