# 30er Verstehensauftrag — ausgefuehrt25.09.2026

**Technisch abgeschlossen, fachlich nicht bestanden.** Betreiber-GO fuer genau
diesen begrenzten Lauf war erteilt; CI, Rollout und Nurleseplan waren vor dem
Start erfolgreich. Die Einmalquittung ist verbraucht; kein automatischer Retry.

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
atomarer Kostenreservierung. Globale Sperre16 Minuten bei15 Minuten Laufzeit;
SQL- und Blob-Sperren werden vorher/nachher gelesen. Feste neue Einmalquittung `verstehen30-20260925-a`.

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
Inhalts-/Altersfaelle bestanden. Pflicht-CI36121292187 erfolgreich; Production75e039d4 READY
(dpl_HRGwCeZkqR5Ke6L16sATC7eHUEwF). Nurleseplan36122379403 erfolgreich.

## Production-Abschluss und Qualitaetsbefund

Scharfer Workflow [36122523412](https://github.com/ernisch/helmut-pilot/actions/runs/36122523412),
25.09.2026 10:10:47–10:18:14UTC, erster Versuch am gebundenen Commit75e039d4:
26 Modellaufrufe,24 gespeichert+2 aktualisiert,0 technisch unbekannt,
0,172350USD,0 offene Reservierungen. SELECT10:21:45: alle30 Dokumente
verknuepft,26 KOs technisch complete. Das ist **keine semantische Abnahme**.
SELECT10:22:23:504 Mandate/0 aktiv, Profilhashc32b7d4f76b4ad70ace0cac91c3e94c3,
Identitaetenhash3c5b0b5a6314f31c395b8758b166c5c3 und Mainhash
5ee6c52fa40a96a92bfa854a126fe42a unveraendert;0 Jobs/Locks. Keine lebenden
CAS-Leases bei Nachlesung. Tageskosten0,207358USD,0 offen, Limit4USD.

Alle26 Felderpaare was_ist_passiert/warum_wichtig wurden mit den verknuepften
Titeln und RSS-Auszügen gelesen; keine Vollabnahme aller KO-Felder oder Vollartikel.
Drei eindeutige Fehler:

* vg-bundestag-20260925-e16c1c vermischt Fruehstartrente und Tankrabatt.
  Reproduziert: Bundestag+Bundesregierung tragen allein die Zuordnung.
* vg-präsident-20260914-46cb50 nimmt den neuen Trump-Xi-Besuch in einen
  gemischten Altvorgang auf. Reproduziert: Trump/Trumps ist nur eine schwache
  Beweisfamilie, wurde bei kleinem Bestandskern trotzdem akzeptiert.
* vg-schulstreik-20260915-3ea9d5 macht aus 'Heute wollen Schueler …'
  stattgefundenen Protest; alte und neue Meldung werden zeitlich vermengt.

Die ausdruecklich freigegebene Fehler-Sperrung wurde nur fuer diese drei KOs
transaktional ausgefuehrt: status=pending, understanding_status=failed-final.
SELECT10:27:15 bestaetigt alle3. Kein Text/Quellenlink wurde geaendert,
keine Quittung/CAS-Freigabe, kein weiterer Modellaufruf. Privater Vorherbeleg
`/private/tmp/helmut-frische30-sperrung-vorher.json`, exaktes SQL
`/private/tmp/helmut-frische30-sperren.sql`; alle drei Zeilenhashes vor dem
Schreiben geprueft,15s SQL-/2s Lock-Grenze,504/0 und Betriebsruhe verlangt.
Inhaltshashes nachher: Bundestag6ea050f77f0313ce9dd6537a24483b3d,
Praesident213257b08ad493b576dd58d6421548e8,
Schulstreikeaa9f2f50512c7334e4237c7fdec807b.
Rueckweg nur nach fachlicher Korrektur und gebundenem Datenplan; die alten
fehlerhaften Texte nicht wieder aktivieren.

Weitere offene Pruefpunkte: Ereignisphase MPK-Vorsitz, unbelegte Ursache der
Bundespolizeigesetz-Wiederholung und 'staatlich entwickelt' bei Singapurs KI.
Diese sind nicht als bestanden bewertet. 23 verbleibende complete-Zustaende
sind ebenfalls kein positiver Qualitaetsnachweis.

## Reparatur auf Branch codex/verstehen-ereignisbindung-20260925

Institution allein ersetzt keinen gemeinsamen Titel-Sachanker. Bei nur einer
schwachen Kernfamilie muss jedes neue Dokument die regulaere Ereignispruefung
gegen einen Originalbeleg bestehen. Echte Tankrabatt-/Staatsbesuch- und
Rentenpaket-Fortschreibungen bleiben erhalten. Der vorhandene Quellenzeit-Prompt bleibt unveraendert; seine Regeln allein
haben den Zeitfehler nicht verhindert. Kein neuer Modellbeweis.
Gezielt4/4 neue Fallgruppen, Identitaet67/67, Resolver54/54, Beweisfamilien108/108,
Quellenzeit9/9. Keine Absenkung alter Schutztests. Pflicht-CI vor Merge erforderlich.

Reine Production-Eingabeaufnahme [36123683077](https://github.com/ernisch/helmut-pilot/actions/runs/36123683077)
am Commitf80334d7 erfolgreich10:23:21:0 Modelle, HTTP200, inaktives B-055.
56 interne Items,407 Aussagen,941 Quellenverweise; alle acht homeSections leer.
Dies ist eine Eingabeaufnahme, kein positiver sichtbarer Drei-Bereiche-Nachweis.
Der fehlerhafte Schulstreik war vor seiner Sperrung noch in internen Items.

### Ergaenzung nach breiterer Felderpruefung10:32UTC

Acht weitere eindeutige Fehler wurden innerhalb desselben freigegebenen
Fehler-Sperrumfangs terminal geparkt; alle acht SELECT10:32:09 bestaetigt.
Damit11 gesperrt,15 noch complete; dies ist keine Abnahme der15.
Die konkreten Fehler und der bereits separat freigegebene Korrekturplan stehen
unter [Acht Quellenkorrekturen](frische30-acht-korrekturen-20260925.md).
Private Vorherzeilen und Sperr-SQL: `/private/tmp/helmut-frische30-weitere-sperrung-vorher.json`
und `/private/tmp/helmut-frische30-weitere-sperren.sql`.

Erste CI36124183620: Ereignisregressionen gruen, zwei historische Prosa-Prompt-
Bindungen korrekt rot. Ursache war der Zusatz im Understanding-Prompt (zunaechst ueber die geteilten
Quellenzeitregeln). Auch dessen direkte Einfuegung aendert die eingefrorenen
Prompts. Zusatz verworfen: die bestehende ausdrueckliche Regel gegen
Ankuendigung-als-Vollzug bleibt unveraendert, eine weitere Promptwiederholung
waere kein Qualitaetsbeweis. Beide Originalbindungen danach lesend identisch.
Keine Aenderung alter Hashes und keine Wiederaufnahme der alten Versuche.


### Aktueller Abschluss der freigegebenen acht Korrekturen

PR565 gruen in CI36125338415, Merge512776e5 und Production
`dpl_4Q89dHGhYSr7abHw4Vxgeahq7jW6` READY. Unter dem separaten konkreten
Daten-GO wurden acht Ergebnisse redaktionell korrigiert: SELECT10:54:55UTC
bestaetigt ALLE Felder exakt gegen den freigegebenen Plan. [Vollbeleg](frische30-acht-korrekturen-20260925.md).
Zum damaligen Stand10:55:16:22 complete/4 failed-final. Die spaetere getrennte
[Restkorrektur](frische30-rest-nachweis-20260925.md) ist verifiziert:30 Quellen
an27 complete-Vorgaengen, drei alte Fehlvorgaenge bleiben gesperrt.
Der einmalige Modelllauf bleibt verbraucht:26 Aufrufe,0,172350USD.
Keine weiteren Kosten/Profilaktionen. Fachliche Gesamtabnahme weiterhin offen.
