# Backend-Fertigstellung: isolierter Arbeitsstand

Stand: 04.11.2026. Branch `feat/claude-backend-isolated`, Ausgangscommit
`ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`.
**Technisch weiter vorbereitet, noch nicht verkaufsfreigegeben.**
Die unabhängig möglichen Arbeiten sind umgesetzt und gezielt geprüft.
Gemeinsame Laufzeitdateien bleiben bis zur Abstimmung mit Motor/UI unverändert.

## Was jetzt zusätzlich vorhanden ist

### Sprint C: echte Daten für die Originalverwaltung

Die 25 Originaldateien aus dem Claude-Prototyp liegen bytegleich unter
`verwaltung/claude-original/`; ein [Manifest](../../verwaltung/claude-original-manifest.json)
bindet ihre SHA256-Werte an das hochgeladene Archiv. Die verbindlichen Schriften,
Farben, Abstände, fünf Navigationsbereiche und DC-/React-Komponentenstruktur
bleiben erhalten. Die frühere helle Ersatzansicht wird nicht weiterentwickelt
oder eingebunden. Der eigene Verwaltungs-README verweist nun auf das Original.

Neue, getrennte Module:

- [Datenadapter](../../verwaltung/original-adapter.mjs): übersetzt die bestehenden
  Adminantworten in Werte für das Originaltemplate. Er berechnet keine neuen
  Briefings, Qualitätsurteile, Budgets oder Quellenzustände. Unbekannt bleibt
  unbekannt; ein abgeschlossener Prozess gilt nicht als brauchbares Ergebnis.
- [Controller](../../verwaltung/original-controller.mjs): verwendet den vorhandenen
  Leser für Übersicht, Kosten, Kunden, Quellen, Läufe und Profildetails.
  Suche, 50er-Seiten, Detailauswahl, Navigation und Themenwechsel stammen weiter
  aus der Originalkomponente. Alte Antworten überschreiben keine neueren
  Zustände. 401/403 löschen private Daten und Lesercache auch nach Navigation.
- [Begrenzter Kontoclient](../../verwaltung/original-actions.mjs): bestehendes
  Konto sperren oder manuell Preis/Zahlungsstatus ändern, mit frischem CSRF-Token,
  festen same-origin-Routen, Zeitlimit und ohne automatische Wiederholung.
  Rollen, Passwörter, Profilaktivierung, Löschen, Recovery und KI sind nicht
  sein Anschluss. Nach unklarem Schreibausgang wird erneutes Lesen verlangt.
  `active:true` bleibt bis zum integrierten D-01-Fix gesperrt; Adminzugänge
  werden im Originaldialog nicht zur Sperrung angeboten.
- [Paketbauer](../../scripts/original-verwaltung-paket.js): hängt diese Logik an
  die Originalkomponente. Original-CSS und Originalassets bleiben bytegleich.
  Nur notwendige Datenbindungen und irreführende feste Prototyptexte werden im
  erzeugten Integrationskandidaten ersetzt: Aktualisieren statt Simulation,
  letzte statt heutige Läufe, kein erfundenes Lexware-Grün, keine simulierte
  Bestätigung einer echten Kontosperre. Ein unbekannter Integrationszustand nutzt
  den vorhandenen neutralen Farbwert. Kein Redesign und keine neue Laufzeit.

**21/21 gezielte Prüfgruppen bestanden, Exitcode 0.** Die tatsächliche
Originalklasse wird in einer VM ausgeführt, einschließlich ihrer zwölf
Ansichts-/Unteransichtsfälle. Zusätzlich läuft die echte bestehende
HTTP-Anwendung in einem frischen lokalen Wegwerfklon: fünf Übersichtleser,
Profildetail, echte Anmeldung/Session, CSRF, Preis-/Zahlungsänderung sowie
Kontosperre mit Entzug der bestehenden Kundensitzung. Das synthetische
Mandatsprofil bleibt inaktiv, Provideraufrufe 0. Testdaten und Server entfernt.

Die unabhängige rein lesende Sicherheitsprüfung fand sechs konkrete Fehler
im ersten neuen Adapterstand. Sie wurden korrigiert und gezielt abgesichert:
globaler Detail-Zugriffsentzug nach Navigation, echte Aktion als Simulation,
fester Lexware-Erfolgstext, falsche Nullfilter/Profilkosten, historische Läufe
unter „heute“ und verlorene Zuordnungen bei fehlender Übersicht. Die
Nachprüfung akzeptierte die Korrekturen. Der abschließende Test-/Bildstand
enthält zusätzlich kurze KPI-Platzhalter mit erklärendem Untertext und keinen
unbelegten roten Abrechnungspunkt.

[Prüfergebnis](original-verwaltung-pruefbeleg-20261104.json),
[Test](../../scripts/original-verwaltung-test.js).
Vollständige lokale Protokolle bleiben unter
`/workspace/helmut-claude-backend-evidence/backend-fertigstellung-20261104/`.

### Visuelle Originaltreue

Sechs neue statische Chromium-Bildprojektionen: Übersicht dunkel/hell bei
1440 und 390 Pixeln, außerdem Kosten und Abrechnung. Original-Spectral,
Hanken Grotesk und die 212-Pixel-Seitenleiste sind physisch gemessen;
kein horizontaler Überlauf, keine beobachteten externen/API-Anfragen und
keine Browserausnahme. Bilder und Hashes im [Bildbeleg](original-verwaltung-bildbeleg-20261104.json).

- [Originalanbindung, dunkel](../../../helmut-claude-backend-evidence/backend-fertigstellung-20261104/original-angeschlossen-uebersicht-dunkel-1440.png)
- [Originalanbindung, mobil](../../../helmut-claude-backend-evidence/backend-fertigstellung-20261104/original-angeschlossen-uebersicht-dunkel-390.png)
- [Abrechnung ohne erfundene Verbindung](../../../helmut-claude-backend-evidence/backend-fertigstellung-20261104/original-angeschlossen-abrechnung-dunkel-1440.png)

Die Original-React-Laufzeit ist hier nicht installiert. Der Bildtest projiziert
deshalb ausschließlich das Originaltemplate mit den neuen tatsächlichen
View-Werten, ohne interaktive Ereignisbehandlung. Das ist **keine vollständige
React-/Bedienabnahme**. Das Prüfmittel gehört nicht zur Produktlaufzeit.

### Sprint D: Kontoverwaltung und echter Sperrfehler

Der getrennte Helferarbeitsbereich prüfte Kontoanlage, Rollen, Mandatszuordnung,
CSRF, manuelle Konditionen, Einladung, Passwortsetzen/-reset, Logout,
Sitzungsentzug und Löschen über den echten isolierten HTTP-Server.
**Erstbeleg: 13 PASS / 1 FAIL bei 60 Requests**, unverändert erhalten.

**D-01 ist ein bestehender Fehler:** `status:"deaktiviert"` oder `"gekuendigt"`
kann durch widersprüchliches `active:true` überstimmt werden; tatsächlicher
Passwortlogin bleibt möglich. Der [vorbereitete Patch](sprint-d-status-active.patch)
weist diese neuen Konflikte mit 400 ab. **9/9 gezielte Statusprüfgruppen** im
Wegwerfklon bestanden; unabhängige Prüfung akzeptiert den begrenzten Fix.
Bestehende widersprüchliche Konten werden dadurch nicht automatisch repariert.

Details und ursprüngliche Belege: [Sprint-D-Bericht](sprint-d-kontoverwaltung-20261104.md).

### Sprint D2: letzten anmeldbaren Administrator erhalten

**Zweiter bestehender Fehler:** Der letzte anmeldbare Administrator kann durch
Deaktivierung oder Rollenwechsel verloren gehen. Auch zwei gleichzeitige
Entzüge können den lokalen Bestand ohne nutzbaren Admin zurücklassen.
Ein gesperrter oder noch eingeladener Ersatzadmin genügt nicht.

Der [zweite vorbereitete Patch](sprint-d2-last-admin.patch) prüft diese
Invariante innerhalb der vorhandenen wiederholbaren Kontomutation.
Baseline: sechs von sieben Szenarien fehlerhaft. Kandidat:
**7/7 Szenarien, 21/21 Prüfungen, 29 HTTP-Requests bestanden.**
Der lokale Parallelitätsfall belegt eine Node-Instanz mit Dateispeicher;
Production-CAS ist hierfür ausschließlich Codebezug, kein neuer Datenbankbeleg.

Beide Kontopatches wurden außerdem **gemeinsam** ausschließlich im Wegwerfklon
geprüft: **8/8 Fälle, 30/30 Prüfungen, 56 HTTP-Requests bestanden**.
Kein bloßer Nachweis, dass sich die Patches anwenden lassen.
Kombinierte temporäre `accounts.js`:
`608838b6674a17c1028bd3cda3edcb129188f6d75923fbb7b62bab04fdf6e703`.

[D2-Bericht](sprint-d2-last-admin-20261104.md),
[Kombinationsbeleg](sprint-d-kombination-20261104.json).
Die echten gemeinsamen Dateien sind weiterhin unverändert und fehlerhaft;
diese Kandidaten müssen koordiniert übernommen werden.

### Sprint E: klarer Profil-Lesefehlervertrag vorbereitet

Der bestehende GET-Handler verschluckt Lesefehler; zusätzlich erzeugt
`activeProfile()` für fehlende Datensätze ein neutrales Blankprofil.
HTTP 200 beweist daher keinen gespeicherten vollständigen Profilbestand.
Der neue Client behandelt einen namenlosen HTTP200-Ersatz vorsichtig; er
kann den grundsätzlichen Serververtrag nicht reparieren.

Ein [separater kleiner Patch](profil-lesefehler-kandidat-20261104.patch) liest
nach derselben Mandatsprüfung den tatsächlichen Bestand: vorhandenes Profil
weiter 200 mit denselben Antwortfeldern/Defaults, fehlendes Profil 404,
Lesefehler generisch 500. Keine Fehlermarker in Antworten. Authschutz bleibt
401/403. **5/5 Baseline- und 5/5 Kandidatgruppen bestanden**; Patch nur im
eigenen Wegwerfklon angewandt, `server.js` im Arbeitsbranch unverändert.

[Profil-Kandidatbeleg](profil-lesefehler-pruefbeleg-20261104.json),
[gezielter Test](../../scripts/admin-profil-lesefehler-kandidat-test.js).
Diese Änderung betrifft einen gemeinsamen Antwortvertrag und muss zuerst mit
Motor/UI abgestimmt werden.

## Was noch fehlt und warum hier die sichere Grenze erreicht ist

1. **Gemeinsame Integration:** abgestimmte Übernahme der zwei Kontopatches und
   des Profil-GET-Vertrags; danach Originalverwaltung unter eigener Adminroute
   und fester Asset-Allowlist einbinden. `server.js`, `accounts.js`, Auth,
   Speicher, `client.js`, `styles.css`, `index.html`, CI und Motor bleiben bis
   zur Freigabe der betroffenen Dateien unangetastet. Kein globales Aufweichen
   von CSP/Assetschutz; keine Einbindung in den fremden UI-Branch.
2. **Originalruntime:** React/ReactDOM 18.3.1 müssen lokal vorliegen. Der
   Paketbauer remappt bereits die Original-CDN-Adressen auf feste lokale
   Pfade und prüft beim Einlegen die Original-SHA384-Integrität. Ohne freigegebene
   Bereitstellung der fehlenden Dateien keine vollständige Browserabnahme.
   Nichts wurde heruntergeladen oder nachinstalliert.
3. **Kundenanlage im Originalformular:** Der Prototyp speichert nur erfundene
   lokale CRM-Entwürfe. Das Backend besitzt Konten, keine gleichwertige
   Kundenentwurfs-/Rechnungseinheit. Statt eines zweiten CRM meldet das Formular
   ehrlich „nicht gespeichert“. Der bestehende Konto-/Einladungsweg ist über
   HTTP geprüft; seine passende Anbindung und Profilanlage betreffen gemeinsame
   Dateien und müssen zusammen mit der UI vereinbart werden. Keine Einladung
   wird automatisch ausgelöst. Manuelle Konditionen ersetzen keinen Zahlungsdienst.
4. **Verkaufsfreigabe:** Die kanonische Restliste nennt OP-01 (Rückweg/PITR),
   OP-02 (Verträge/Datenschutz) und OP-03 (Zweitmandantensicherheit) als weitere
   Betrieb-/Vertriebsgrenzen. Ihre historischen Werte sind hier keine frische
   Production-Messung. Kein neuer Rechts-/Backup-/DB-Nachweis behauptet.
   Widersprüchlichen Kontoaltbestand später rein lesend bewerten; nicht
   automatisch ändern. Reale Mailzustellung und vollständige Kundenrundreise offen.
5. **Motor und 500er:** Ergebnisqualität, Quellen-/Modellbetrieb, Last,
   Mock500 und Production500 bleiben beim separaten Auftrag. Neue UI-Anzeigen
   ersetzen keine 1500-Positionen-Bilanz. Kein anderer Prozess beeinflusst.

Alle aktuellen Prüfungen liefen mit expliziter kleiner Environment-Allowlist,
`scripts/lokal.js` und vorhandenen, ausschließlich gelesenen Werkzeugen.
Keine Production-Änderung, bezahlter Modellaufruf, externe Nachricht, kein
externer Zugriff, Merge oder Deployment. Eigene Testserver/Browser/Klone sind
beendet bzw. entfernt. Die konkrete Dateiliste, Hashes und Git-Endkontrolle
stehen im [Abschlussbeleg](backend-fertigstellung-integritaet-20261104.json).

## Nächster konkreter Schritt

Nach Freigabe der gemeinsamen Dateien zuerst die beiden zusammen geprüften
Kontoschutzfixes übernehmen und ihren gezielten Nachweis am Integrationsstand
führen. Danach Profilvertrag und Originalverwaltung anschließen und die
vollständige Original-Browserrundreise abnehmen. Kein Production-GO daraus ableiten.
Bis dahin ist die sichere unabhängige Vorbereitung abgeschlossen.

Im selben Thread fortsetzen. **Sehr hoch** für die unmittelbar nächste
koordinierte Kontosicherheits-Integration: gemeinsame Authdatei und Schutz des
letzten Administrators sind betroffen.
