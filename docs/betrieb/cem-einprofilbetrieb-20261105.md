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

## Bereits ausgefuehrt und nativ gegengelesen

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

## Implementierter Betriebsweg, noch nicht produktiv aktiviert

`HELMUT_BETRIEBSKOSTENVERTRAG_JSON` ist ein expliziter Vertrag:

```json
{
  "version": 1,
  "profileId": "cem-ince",
  "startsAt": "<unveraenderlicher UTC-Start in ISO8601>",
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
Nur Briefing-Aufgaben sind freigegeben; andere KI-Funktionen und historische
Testrequests koennen den Betriebsvertrag nicht als Ausweichpfad nutzen.

Vercel-Zeitplan UTC:04:00 Quellen/Crawl,05:00 Lage,05:15 Morgenpaket.
Damit liegt der Abschluss im Winter um06:15 und im Sommer um07:15 Berlin.
Erforderliche Produktionskonfiguration: `HELMUT_SCALABLE_PIPELINE=off`,
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
- No-Paid-/Crawl-Bindung25 PASS; echte Rohquellen-Relevanz und inaktive Profile
  PASS; Tagesplan/Historienerhalt PASS; CI-Testauswahl19 PASS.
- Unabhaengiger Astra-Review meldet keine offenen Blocker an der Kostennaht.
  Ein im Review entdeckter Filterfehler wurde vor Aktivierung korrigiert.

Pflicht-CI, Produktionskonfiguration, Deployment und aktuelle fachliche
Briefingausgabe sind vor dem Abschluss noch nachzuweisen.

Erster Pflichtlauf42118060914:179/180 Standardsuiten PASS. Zwei Erwartungen
in `testkohorte-vorwaerts-cli-test.js` setzten noch eine produktive leere
Cronliste voraus. Der historische Pausenfall wird jetzt explizit nur im
Kindprozess isoliert; aktuelle Tagesplaene prueft die eigene Plansuite.
Kein Produkt- oder Kostenfehler, keine Abschwaechung der Schreibsperren.

## Wirkung und Rueckweg

Neue Kosten bleiben bei1 USD/UTC-Tag und30 USD insgesamt einschliesslich
offener neuer Reserven. Bei Fehler/Unklarheit keine automatischen
Budgeterhoehungen oder Wiederholung alter Tests. Ein erschopftes Budget kann
die Tagesausgabe begrenzen; ehrlicher Status statt erfundener Aktualitaet.

Notstopp: Cem ueber dieselbe Profil-API deaktivieren und die drei Zeitplaene
zurueck auf leer stellen. Der neue Kostenstand bleibt erhalten. Entfernen
der Betriebsvariable faellt auf die weiterhin gesperrte historische
Admission zurueck; es gibt dadurch keine kostenfreie Umgehung. Keine
Loeschung alter oder neuer Kostenbelege. Vorheriges Productiondeployment:
`dpl_Dujd3QXVwj4hjLU8sPef7yA9eF7w` auf14501c59.
