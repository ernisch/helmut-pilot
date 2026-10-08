# Blocker 2: Einzeldiagnose in Production (Runtime-Nachweis)

**Stand:** 08.10.2026 · Berlin-Tag 2026-10-08 · lesende Einzeldiagnose, genau ein Dispatch

Vorgaenger: [blocker2-read-http500-20261008.md](blocker2-read-http500-20261008.md) (historisch). Dieses Dokument ist die neueste Fortschreibung.

## 1 Auftrag und Bindungen

Betreiberauftrag: zum vorherigen exakten Einzeldiagnose-Vorschlag fuer das feste Profil
`test-kohorte-synthetik-bt-122` zurueckkehren; genau ein Dispatch.

- Workflow `blocker2-readonly-diagnose.yml`, Run 37756943933
  (https://github.com/ernisch/helmut-pilot/actions/runs/37756943933)
- WorkflowSHA `cc6d8d026e8c6afb127eeab195422438ca5bb8ec`
- Production-SHA `3f5fbc731f32d1b73488bc0e0df49240a3993b92`, READY-Deployment
  `dpl_7q4VfZfH15PYrPEDwTDatd2afPEa`; Alias und Commit vor und nach dem Lauf gleich

## 2 Ablauf und Zeitbudget (technisch)

- Laufzeit 09:28:56 bis 09:29:31 UTC = 35 Sekunden; die 3-Minuten-Aufnahmegrenze wurde eingehalten.
- Tuerkei-Zeit 12:28:56 bis 12:29:31 (UTC+3).
- Genau 1 tatsaechlicher Eingabe-GET auf `test-kohorte-synthetik-bt-122`.

## 3 Technisches Ergebnis des Einzellaufs

- Genau 2 Identitaeten, beide `ok:true`, alle Checks `true`, gleicher Commit und gleiches Deployment.
- `paidModelCalls 0`, `productionDataWrites 0`.
- HTTP 200, Rohbody unveraendert; inaktives, geschlossenes synthetisches BT-Profil samt Paket passte.
- 44 tatsaechliche Briefing-Positionen.
- Der gesamte Eingabevertrag wurde aus dem neuen tatsaechlichen Body neu aufgebaut;
  Vertragshash `5ace85631cc420ca4041bd5d0fe6e432752fac772b8ff9d553e4b1cea5193e64`.
- Die 500 KO-Fassungen und 877 Quellenfassungen sind Kandidaten, keine 500 Profile.

## 4 Chiffre, Transport und ACK-Reihenfolge

- 3 native ZIPs: ID 11540950689 (123 Eintraege), 11540900731 (379), 11540640956 (1);
  zusammen 503 Eintraege, CRC, SHA256 und native Bytes geprueft.
- Alle 500 Chiffrepositionen authentifiziert: 1 aufgenommene Position 122, 499 bewusst nicht
  angeforderte Platzhalter; leer, technisch, unbrauchbar oder widerspruechlich im Transport = 0.
- Drei Manifeste AEAD-geprueft; der kanonisch tatsaechlich hochgeladene Schluss-Checkpoint 0002
  wurde ausgewaehlt; kein erfundener lokaler Upload nach ACK.
- Erster Artefakt-ACK 09:29:14.204 UTC vor der tatsaechlichen Serveraufnahme 09:29:15.705 UTC;
  finaler ACK erfolgreich, `cipherFinalSaved:true`.
- Flags: `diagnosticOnly:true`, `collectionCompleted:false`; die 500er-Eingabeannahme bleibt
  auch bei technischem Erfolg durchgaengig `false`.
- Der Empfaenger-SPKI-SHA256 war fest gebunden:
  `8d665b71487b557f9cbdedb7e5da848022f3f80f820f9fc6233353658ffd41e7`.
  Das Cron-Geheimnis wurde nur im bestehenden GH-Workflow verwendet und nie offengelegt.

## 5 Schutz der 52 Tabellen

- 52 geschuetzte Tabellen nativ RR/READONLY: vor 09:27:08.61468 UTC und nach 09:30:38.157378 UTC
  exakt dieselben Zeilenhashes und xmin-Werte sowie dieselben Zaehlungen, einschliesslich
  501 Identitaeten, 500 Mandate, Nutzung, Reservierungen, Budget und 4 freigegebene A-Zeilen.
- Keine Mutation, kein Modellaufruf, kein Rollback.

## 6 Einzelbewertung (semantisch)

- Alle 44 sichtbaren KO-, Quellen-, Resolver- und Profilbindungen einzeln geprueft.
- 42 exakt KO und vollstaendig quellenhashgebunden; fruehere 401-Faktenpruefungen wiederverwendet,
  ohne historische Body-, Profilurteils- oder Zaehlungszusammenfuehrung.
- 2 native A offengelegte KO-Fassungen samt rechten Quellenkanten geprueft; keine notwendige
  BT-Relevanz daraus abgeleitet.
- Aktueller DOSB-Heute-Waechter: 1 neu berechnet.
- Profil 122 mit den Themen Digitalisierung und Verkehr hat einen bestehenden Quellenwiderspruch.
  `ko-vg-neuzulassungen-20260922-760ba1` verknuepft Elektroauto-Neuzulassungen mit einer fremden
  BIP-Primaerlquelle.
- 0 Ereignisduplikate fuer 122, 0 akzeptiert. Das liegt in der gesondert unfreigegebenen Massnahme B;
  B wurde nicht angewendet, C bleibt blockiert.
- Sichtbare BT-Kandidatenpraesenz beweist keine notwendigen 30 BE/Bildung- und 12 BB/Verkehr-Ziele;
  diese waren nicht angefordert. Alle 120 BE-, 50 BB- und 329 BT-Positionen blieben ohne Anforderung.
  Keine neue Quellenarbeit, keine Importe wiederholt.

## 7 Was der Lauf ausdruecklich nicht belegt

- Der urspruengliche HTTP-500 trat hier nicht erneut auf; die genaue alte Ursache bleibt unbekannt.
- Belegt ist die Gueltigkeit des konkreten Lesers und des dauerhaften Transports, nicht die
  Beseitigung aller Fehler und keine rueckwirkende Aussage ueber den urspruenglichen Erfolg.
- Fehlerphase und tatsaechlicher Fehlerzweig bleiben code- und offlinegetestet; HTTP 200 hat sie
  nicht praktisch ausgefuehrt.
- Ein einzelner aktueller Eingabewert erzeugt keine volle 500er Basis. Die fachliche Abnahme
  bleibt bei 0/500.

## 8 Historischer Lauf bleibt unveraendert

Run 37748818380 bleibt historisch: 121 brauchbar, 1 technisch, 378 nicht aufgenommen;
0 akzeptiert, 64 Widersprueche, 10 nur Duplikate, 47 fehlend, 1 technisch, 378 nicht aufgenommen.
Der aktuelle 122-Body darf nicht in die historischen 121 eingemischt und der alte technische
Status nicht ueberschrieben werden.

## 9 Unabhaengige Pruefung

Kritische unabhaengige Pruefung (gpt-6-astra High) des tatsaechlichen Runtime- und Belegstands: PASS.
Privater Einzelbericht `single122-20261008-independent-runtime-and-evidence-review.json`,
SHA256 `9815cd883210c2e6ca765293ad282145c4b52053ab0640a4204491e092807754`.
Sie hat Chiffre, 52 Tabellen, Vertrag und alle 44 Semantiken unabhaengig neu gehasht.

## 10 Vorbereiteter, nicht autorisierter naechster Schritt

- Ein vollstaendiger frischer 500-RO-Capture mit bestehendem `blocker2-readonly500.yml` auf
  Production exakt `3f5fbc731f32d1b73488bc0e0df49240a3993b92`; Main-Workflow- und Chiffre-Code
  byteidentisch zur kritisch freigegebenen Vorlage `aaf688304f9089f2037d0694f097aa78e46e8592`.
- Genau 500 inaktive synthetische Profile 330 BT / 120 BE / 50 BB; maximal 500 Eingabe-GETs,
  maximal 2 Identitaeten, 55 Minuten Aufnahme, gleicher Berlin-Tag und Commit; gestreamte
  Chiffre-Checkpoints an festen Empfaenger, 52 native Vorher/Nachher-Vergleiche.
- Nur `modus=eingabe` plus feste Identitaetslesungen; das bestehende Cron-Geheimnis ausschliesslich
  im bestehenden GH-Workflow.
- Keine Prod-Schreibvorgaenge, keine Profilaktivierung, Reservierung, Modelle, Funktionstests,
  Budget- oder Konfigurationsaenderungen, kein Autowiederholen.
- Stop bei Commit-, Tages-, Auth- oder Profilwiderspruch, Schreib- oder Modellhinweis, anderem
  Schutz oder Nicht-200.
- Alle 500 einzeln nach Quellen, KO, Zustaendigkeit, Resolver, Briefing, Profil, Zeit und Ebene
  pruefen; A mit 30 BE und 12 BB ausdruecklich testen. Aufnahmen getrennt halten.
- Die Originalursache kann ausbleiben oder ein weiterer HTTP-500 vor 500 stoppen; gespeicherte
  Chiffre plus sichere Phase und Klasse muessen zur Untersuchung genutzt werden, ohne Garantie
  auf Vollstaendigkeit oder Abnahme.
- Status: PREPARED, NICHT AUTORISIERT und NICHT GEDISPATCHT. Das GO ist fuer eine Diagnose
  verbraucht; ein neues konkretes Voll-Capture-GO ist erforderlich. B bleibt unfreigegeben,
  C blockiert; dieser GO-Vorschlag enthaelt keine Datengenehmigung.

## 11 Belege (privates Belegverzeichnis, nicht im Repo)

Private Originale und Nachkontrollen liegen unter `/workspace/private/blocker2-20261007/`.

- `durable-run-37756943933/` (unveraenderliche ZIPs, Chiffre, entschluesselte Auth-Originale)
- `durable-37756943933-final-native-run-receipt.json`
- `durable-37756943933-all500-actual-input-structural-evaluation.json`
- `durable-37756943933-all-visible-profile-KO-source-resolver-bindings.json`
- `single122-20261008-all500-individual-available-input-assessment.json`
- `single122-20261008-all500-individual-summary.json`
- `single122-20261008-immediate-before-full52.json`
- `single122-20261008-immediate-after-full52.json`
- `single122-20261008-independent-runtime-and-evidence-review.json`

Dieses Einzeldiagnose-Ergebnis ist kein 500er Funktionsnachweis, keine fachliche Abnahme und
keine Freigabe weiterer Production-Schritte.
