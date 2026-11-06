# Cem Ince: begrenzter Tagesbetrieb

## Auftrag und Ursache

Betreiberauftrag im Chat: Briefing wiederherstellen, bisher nur Cem Ince;
alle anderen Profile deaktivieren. Explizite Budgetwahl: 1 USD pro Tag,
maximal30 USD insgesamt. Dies ist ein neuer Betriebsauftrag, keine Fortsetzung
eines500er Tests. Entwicklung/Review mit GPT-6.1 Sol und Astra; kein DeepSeek.

Production14501c59 hatte keine Vercel-Zeitplaene, kein aktives relationales
Mandat und keine heutigen Briefingquittungen. Die alten Kostentickets waren
an ein abgelaufenes Testfenster gebunden. Die Login-Aktivitaet von Cem hatte
sein fehlendes relationales Mandatsprofil nicht ersetzt.

## Vorbereitung vor Aktivierung (historischer Zwischenstand)

- Bestehendes Cem-Profil ueber die vorhandene Profil-API wiederhergestellt;
  amtliche Zuordnung am05.11.2026 gegen
  https://www.bundestag.de/abgeordnete/biografien/I/ince_cem-1045160 geprueft.
  Genau `cem-ince` aktiv,500 andere inaktiv. Keine anderen Profile geloescht.
- Hash der anderen vollstaendigen Mandatszeilen unveraendert:
  `d024d08864a9f2330cd0b114122f60ff`; andere Profilzeilen:
  `2a649c4643ad656df9df8eb713903450`.
- No-Paid-Crawl `crawl-20261105214921-2nifd`:147/147 Quellen erfolgreich,
  686 neue Rohdokumente, keine Modellaufrufe. Paid-Usage amUTC-Tag weiterhin0.
- Morgenlauf `cron-morning-briefing-20261105215309-dh3lo`:1/1 Mandat,
  Paket und Frischequittung gespeichert/verifiziert. Fachlich noch partial,
  vollstaendige Pakete0. App-Lesung: `daten-veraltet`, letzter Wissensstand
  Oktober. Kein falscher Nachweis aktueller KI-Versorgung.
- Keine laufenden Jobs/Leases: alle vorhandenen Queuejobs erledigt.
  Kommunikationsriegel `gesperrt` bestaetigt, Push wurde blockiert.

## Aktivierter Betriebsweg und erster Livebefund

`HELMUT_BETRIEBSKOSTENVERTRAG_JSON` ist ein expliziter Vertrag:

```json
{
  "version": 1,
  "profileId": "cem-ince",
  "startsAt": "2026-11-05T23:00:10.000Z",
  "dailyLimitUsd": 1,
  "totalLimitUsd": 30,
  "route": {
    "provider": "azure",
    "responsesUrl": "https://helmut-resource.openai.azure.com/openai/v1/responses",
    "model": "gpt-5-mini-eu"
  }
}
```

Der bestehende Azure-Anbieterpfad bleibt erhalten. Der neue separate
CAS-Kostenstand `betriebskostenBudget` reserviert vor jedem Versand die
volle Modell-Kontextobergrenze samt maximalen Ausgabetokens. Tageswechsel
setzt den Gesamtverbrauch nicht zurueck. Fehlende native Usage oder
unbestaetigte Ablage laesst die volle Reserve gebunden. Aenderungen am
Vertrag setzen das Buch niemals zurueck. Historische Testkosten, Admission,
Journale und offene Reserven werden nicht veraendert oder freigegeben.
Die Tagesgrenze gilt je UTC-Tag; die30 USD gelten insgesamt ab Vertragsstart.

Jeder Modellaufruf prueft genau ein aktives Profil und den passenden
Profil-/Aufgabenbezug. Globales Understanding bekommt seine Bindung nur aus
dem direkten Profil-Crawl. Dessen bestehender Rohquellenfilter waehlt maximal
25 relevante aktuelle Crawl-Eingaben; kein Abarbeiten des alten Backlogs.
Bereits beim No-Paid-Vorlauf gespeicherte Artikel bleiben bei Wiederbeobachtung
in genau diesem Crawl verwendbar. Rohspeicher-Dedup ist kein Beleg fuer bereits
abgeschlossenes Understanding; dessen eigener KO-/Hashschutz bleibt erhalten.
Nur Briefing-Aufgaben sind freigegeben; andere KI-Funktionen und historische
Testrequests koennen den Betriebsvertrag nicht als Ausweichpfad nutzen.

Vercel-Zeitplan UTC:04:00 Quellen/Crawl,05:00 Lage,05:15 Morgenpaket.
Damit liegt der Abschluss im Winter um06:15 und im Sommer um07:15 Berlin.
Aktive Produktionskonfiguration: `HELMUT_SCALABLE_PIPELINE=off`,
`HELMUT_CRON_GLOBALPHASE=off`, `HELMUT_CRON_GLOBALABRUF=off`,
`HELMUT_NARRATIV_QUEUE=off`, `HELMUT_LLM_BUDGET_FAIL_CLOSED=on`.
Kommunikation bleibt `gesperrt`, Dispatch bleibt `shadow`.
Keine Rueckstands-, Recovery-, Pipeline- oder Lasttestjobs aktivieren.

## Pruefungen

Alle lokalen Tests ueber `scripts/lokal.js`, ohne Netz/Productionzugang:

- Betriebskostengate9 Gruppen: parallele Reservierung, Tages-/Gesamtgrenze,
  ungueltige Vertrage, fremde Profile/Testrequests, native Usage,
  unbekannte Ausgaenge, nicht umgehbare HTTPS-Naht.
- Historische Testkosten26, AI-Deadline11, Admission20, Lage-Kostenbelege30:
  alle PASS; bestehende Regeln bleiben erhalten.
- No-Paid-/Crawl-Bindung29 PASS; echte Rohquellen-Relevanz und inaktive Profile
  PASS; Tagesplan/Historienerhalt PASS; CI-Testauswahl19 PASS.
- Unabhaengiger Astra-Review meldet keine offenen Blocker an der Kostennaht.
  Ein im Review entdeckter Filterfehler wurde vor Aktivierung korrigiert.

Historischer CI-Zwischenstand: Pflicht-CI42121896987 auf52d37479 vollstaendig PASS:180/180 Standardsuiten,
Bereichsregression und native PostgreSQL/PostgREST-Nachweise. Der Browserjob
ist erfolgreich; seine eigentlichen Browserschritte wurden nach Backend-Scope
planmaessig uebersprungen. Nach parallelen Navigationsmerges wurde main25476a4a
uebernommen; nur der Statusdokument-Konflikt wurde unter Erhalt beider Eintraege
geloest. Die damals noch offenen Pflichtchecks und das Deployment sind im Liveabschnitt
unten nachgewiesen. Die fachliche Briefingausgabe ist weiter offen.

Die Produktionsvariablen sind vorbereitet: Vertragsstart
`2026-11-05T23:00:10.000Z`,1/30 USD; SCALABLE_PIPELINE, GLOBALABRUF,
GLOBALPHASE und NARRATIV_QUEUE jeweils off. Kommunikation gesperrt und
Dispatch shadow gegengelesen. Sie sind seit Deployment0cda70f1 wirksam.

Erster Pflichtlauf42118060914:179/180 Standardsuiten PASS. Zwei Erwartungen
in `testkohorte-vorwaerts-cli-test.js` setzten noch eine produktive leere
Cronliste voraus. Der historische Pausenfall wird jetzt explizit nur im
Kindprozess isoliert; aktuelle Tagesplaene prueft die eigene Plansuite.
Kein Produkt- oder Kostenfehler, keine Abschwaechung der Schreibsperren.
Gezielte Korrekturpruefung59/59 PASS. Zwei entsprechende Admin-Erwartungen
aus der noch nicht gelaufenen Bereichssuite pruefen jetzt den wirklichen
Zeitplan; leere Konfiguration bleibt gesondert abgedeckt:12/12 und74/74 PASS.
Ein lesender Sol-Abgleich fand keine weiteren unisolierten Pausenannahmen
in der aktuellen Pflicht-/Bereichsauswahl. Der Runtimecode blieb bei diesen Testkorrekturen unveraendert.
Im abschliessenden Vorabcheck wurde danach die konkrete No-Paid-Uebergangsluecke
behoben: Der Betriebs-Crawl speiste zuvor nur neue Rohhashes ein. Vier weitere
Regressionen pruefen nun Wiederbeobachtung, Quellen-/Profilbindung, No-Paid und
den unveraenderten Altpfad ohne Betriebsvertrag (29/29 PASS).

## Wirkung und Rueckweg

Neue Kosten bleiben bei1 USD/UTC-Tag und30 USD insgesamt einschliesslich
offener neuer Reserven. Bei Fehler/Unklarheit keine automatischen
Budgeterhoehungen oder Wiederholung alter Tests. Ein erschopftes Budget kann
die Tagesausgabe begrenzen; ehrlicher Status statt erfundener Aktualitaet.

Notstopp: Cem ueber dieselbe Profil-API deaktivieren und die drei Zeitplaene
zurueck auf leer stellen. Der neue Kostenstand bleibt erhalten. Entfernen
der Betriebsvariable faellt auf die weiterhin gesperrte historische
Admission zurueck; es gibt dadurch keine kostenfreie Umgehung. Keine
Loeschung alter oder neuer Kostenbelege. Historischer Productionstand zu Arbeitsbeginn:
`dpl_Dujd3QXVwj4hjLU8sPef7yA9eF7w` auf14501c59. Unmittelbarer
Rueckweg vor Aktivierung nach paralleler Navigation: siehe Liveabschnitt.


## Liveaktivierung und gezielte Nachkorrektur

PR1056 ist nach beiden Pflichtchecks auf `ac10d1f5` gemergt;
CI42126935604:180/180 Standard-,332/332 Bereichssuiten und native
Datenbanknachweise PASS. Die Browserpflichtentscheidung ist erfolgreich;
die eigentlichen Browserschritte waren fuer den Backend-Scope uebersprungen.
Production `dpl_4cRoz1WcgQDyrfQEPjyinpqcWEAU`, Commit
`0cda70f1bb9d460dfb3f221cf7631d6b8b51d362`, ist READY und traegt den Livealias.
Vercel bestaetigt nativ genau die drei aktiven Zeitplaene04:00/05:00/05:15UTC.
Unmittelbar vorher aktive Profile genau `[cem-ince]`, keine laufenden Leases,
keine Aufrufe seit Vertragsstart. Voriger Rollbackkandidat nach paralleler
Navigation: `dpl_CJoBeMTV6V7MHeH86MuhM3iA1Qbj` auf7d115a41.

Erster Betriebs-Crawl `crawl-20261105234008-kgljx` am05.11.2026:
147/147 Quellen erfolgreich,43 neue relationale Rohdokumente,1 Mandat.
Die oberflaechlichen15 verarbeiteten Cluster sind KEIN Erfolgsnachweis:
vier Azure-Antworten kamen erfolgreich zurueck, ihre native Usage liegt
im auth-Store; aber der Abschluss scheiterte an
`betriebskosten-abschluss-unbestaetigt`. Kein neuer vollstaendiger KO.
Die separate relationale Usage-Ablage ist ausgeschaltet; ihre0 Zeilen
bedeuteten somit NICHT0 bezahlte Aufrufe.

Konkrete Ursache: PostgreSQL JSONB ordnet die Vertragsfelder um.
`pruefeBuch` hasht beim Abschluss den zurueckgelesenen Vertrag in dieser
Speicherreihenfolge statt derselben kanonischen Reihenfolge wie beim Start.
Vier Reserven bleiben deswegen konservativ voll gebunden:0,848 USD;
kein Reset und keine Freigabe. Der erste Tag hat damit nicht genug freie
Reserve fuer einen weiteren Modellaufruf. Die gezielte Korrektur muss
denselben bestehenden Vertragshash unter beliebiger JSONB-Feldreihenfolge
erhalten; geaenderte Inhalte muessen weiter gesperrt bleiben.
Liveversorgung ist bis zum erfolgreichen Nachlauf weiterhin NICHT belegt.

Gezielte Korrektur lokal bestaetigt:11/11 Kostengruppen PASS ueber
`lokal.js`. Vor der Korrektur reproduziert dieselbe JSONB-CAS-Fixture den
echten Abschlussfehler. Nachher sind nativer Abschluss, erneut gelesene
Vertraege und Neustarts erfolgreich; zusaetzliche Felder, manipulierte
Limits/Route/Hash und unbekannte Usage bleiben gesperrt. Unabhaengiger
Astra-Review ohne offene Befunde. Keine Migration, Nachabrechnung oder
Freigabe bestehender Reserven. Pflicht-CI und Live-Nachlauf folgen.


## JSONB-Korrektur produktiv bestaetigt; Lage-Schema folgt

PR1060 auf `b080bcc3` bestand CI42131866123 mit180/180 Standard-,
332/332 Bereichssuiten und nativen Datenbanknachweisen. Production
`dpl_AmiNjw92qVNG8PYokia69dU6bHKC` ist READY auf
`6507b11e59b58f762e33fc5dfe7a6213f233b642`, Livealias bestaetigt.
Cem war waehrend der Korrektur voruebergehend pausiert, um keine weiteren
fehlerhaften Abschluesse zu bezahlen; nach Deployment wieder aktiviert und
nativ als einziges aktives Profil bestaetigt. Im neuen UTC-Tag vor dem
Nachlauf0 bezahlte Aufrufe, alte4 Reserven unveraendert0,848 USD.

Nachlauf `crawl-20261106001605-ksxrl`:147/147 Quellen,15 neue relationale
Rohdokumente,8 neue Calls korrekt abgerechnet (0,053672 USD),6 neue
vollstaendige Wissensobjekte. Keine neue ungeklaerte Kostenreserve.

Morgenlauf `cron-morning-briefing-20261106001917-c9qbl`: Paket und
Frischequittung fuer06.11.2026 gespeichert/verifiziert. GET latest:
`frischeVertrag.status=aktuell`, Datenstand00:18:16UTC, `staleState=false`,
ehrliche Ruhelage ohne neue Tagesprioritaet. Kommunikation weiter gesperrt.
Paket weiterhin partial/fachliche Abnahme offen, weil Lage fehlt.

Lage-Lauf `briefing-lage-20261106001833-jl8i4` und ein einziger bewusst
begrenzter Folgeversuch `briefing-lage-20261106002026-oe8rs` verwarfen den
Entwurf mit `ai-text-profile-reference`. Beide Anbieterergebnisse sind
bekannt und abgerechnet; es war kein Retry eines ungeklaerten Aufrufs.
Das bisherige Antwortschema laesst frei erfundene Profilwerte zu.
Die gezielte Schema-Bindung gilt ausschliesslich im neuen Betriebsmodus:
vorhandene Feld-/Wertpaare aus `mandatsbezugAuswahl`, keine erfundenen Werte
oder technischen Platzhalter. Historische Anfragen bleiben unveraendert;
Quellenbindung, unabhaengige Textpruefung und Kostenreserve bleiben Pflicht.
Keine automatische Wiederholung und keine Rohtextprotokollierung.

Schema-Korrektur lokal:6/6 neue Gruppen ueber den echten Generator-/
Structured-JSON-/HTTPS-Stub-Pfad mit Betriebs-CAS und Kostenabschluss PASS.
Geprueft sind alle sechs Mandatsfelder, Stellvertretung, Normalisierung,
Platzhalter, Profiltrennung A/B/A, leere Auswahl ohne Reserve, erzwungene
ungueltige Anbieterantworten und unveraenderte Quellen-/Reviewerablehnung.
Historische Azure-/OpenAI-Payloads ohne Betrieb bytegleich. Bestehende
Lagequittierung30 PASS, Kosten11/11 PASS; unabhaengiger Astra-Review ohne
offene Befunde. Neue Suite ist im Standard-Pflichtlauf registriert.
