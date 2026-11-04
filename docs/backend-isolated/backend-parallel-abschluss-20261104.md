# Sichere Parallelentwicklung: Kunden, Betrieb und Kontoschutz

Stand: 04.11.2026. Eigener Branch `feat/claude-backend-isolated`,
Ausgangs- und unveränderter HEAD `ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`.
**Lokale Funktions-/Browserprüfungen bestanden. Gemeinsame Integration und
Production-Freigabe offen.**

Zu Beginn wurden die vorgeschriebenen Projektdateien, Branch, vorhandene
Änderungen und Prozesse geprüft. Die 63 bisherigen Arbeitsdateien wurden mit
Hashes erhalten; nur die zu diesem Auftrag gehörenden eigenen Module wurden
weiterentwickelt. Keine weitere geltende Unterverzeichnis-`AGENTS.md` gefunden.
Die ausdrücklichen Dateisperren dieses Nutzerauftrags gehen älteren allgemeinen
Merge-/Deploymentfreigaben vor.

Drei getrennte Bereiche: Hauptbereich für Laufzeit/Betrieb/Browser,
`/workspace/helmut-backend-kunden-20261104` für das Formular und
`/workspace/helmut-backend-sicherheit-20261104` für den Kontopatch-Abgleich.
Die zwei Klone haben eigene Git-Metadaten und denselben vorhandenen Backendbranch.
Keine parallelen Schreibzugriffe auf dieselben Dateien. Gemeinsame Quellen
wurden ausschließlich gelesen. Alle Änderungen sind lokal, kein Commit/Push/PR.

## A — Original-Kundenformular: lokal funktionsfähig

Der neue [Formularwrapper](../../verwaltung/original-customer-form.mjs) ergänzt
die unveränderte Claude-Komponente; der vorhandene
[Aktionsadapter](../../verwaltung/original-actions.mjs) wurde gezielt erweitert.
Keine Ersatzoberfläche, neue CRM-Datenhaltung oder neue Serverroute.

Fertig und geprüft:

- Kundenname, Ansprechpartner, E-Mail, Tarifwunsch und optionale Profilwahl
  werden validiert. Fehler erscheinen in den vorhandenen Originalfeldern und
  im ursprünglichen Fehlerblock. Busy-Zustand und Doppelsubmit sind abgesichert.
- Frischer Admin-Lesebeleg und CSRF vor den festen vorhandenen same-origin-
  Kontorouten. Kein frei wählbarer Zielpfad, kein Rollen-/Passwortfeld.
- Ein gesperrtes Konto ohne Passwort entsteht über `POST /api/admin/users`.
  Danach speichert ein bestehender Kunden-PATCH beide Namen und den Tarifwunsch
  in `customer.internalNote`. Preis bleibt `null`, Zahlung `none`.
  Die simulierten290/490/1200EUR werden nicht übernommen.
- Einladungen, Passworttokens, Rechnungen und gespeicherte Mandatsprofile
  entstehen dabei nicht. Ohne Auswahl vergibt der vorhandene Server trotzdem
  eine Profilkennung. Formular und Bestätigung legen dies ausdrücklich offen;
  die Referenz muss vor einer späteren Freigabe geprüft werden.
- POST und PATCH sind zwei getrennte Vorgänge. Verlorene Antworten und
  Teilanlagen werden ausdrücklich unklar beziehungsweise unvollständig
  gemeldet, mit bestätigter Kennung soweit vorhanden. Kein automatischer
  neuer POST und keine kompensierende Löschung. Ein Erfolgshinweis erfordert
  zusätzlich einen frisch gelesenen gesperrten Kontostand.
- 401/403 löschen Formulareingaben und private Ansichtsdaten. Duplikate,
  konkurrierende Profilzuordnung und widersprüchliche2xx-Antworten sind
  abgesichert. Der technische Backendstatus `eingeladen` erscheint als
  „Zugangseinrichtung offen“, damit er keinen erfolgten Versand behauptet.

**25/25 gezielte Prüfgruppen bestanden, darin 21 echte HTTP-Anfragen.**
Unabhängiger Review fand zwei Anzeige-/Bestätigungsfehler; beide wurden
korrigiert, gezielt ergänzt und unabhängig akzeptiert. Der frühere21er-Beleg
bleibt unverändert erhalten.
[Nachreviewbericht](kundenformular-nachreview-20261104.md),
[Beleg](kundenformular-nachreview-pruefbeleg-20261104.json),
[Test](../../scripts/kundenformular-test.js).

**Noch simuliert:** ausschließlich fiktive Testkonten und gezielt erzeugte
Fehlerantworten im Test. Die Konto-/Notizspeicherung selbst wurde über den
echten bestehenden lokalen HTTP-Server ausgeführt.
**Fehlende Integration:** Auslieferung unter einer abgestimmten Adminroute,
Freigabe gesperrter Zugänge, reale Einladung und tatsächliche Profilanlage.
Echte Nichtzuordnung ohne Kennung ist im bestehenden Serververtrag nicht
vorgesehen. Diese gemeinsamen Änderungen werden nicht vorweggenommen.

## B — Originalruntime und Betriebsübersicht: interaktiv lokal abgenommen

Passende Original-UMD-Dateien waren lokal nicht vorhanden. Ausschließlich die
bereits im Claude-Prototyp festgelegten URLs für React und ReactDOM18.3.1
wurden lesend abgerufen und gegen **beide Original-SHA384-Werte** geprüft.
Die Dateien und MIT-Lizenzen liegen unter `verwaltung/runtime/`, insgesamt
rund145KB. Keine Paketinstallation, neue Frameworkversion oder zusätzlicher
Modellanbieter. Der Original-DC-Renderer und seine Architektur bleiben erhalten.
ReactDOM meldet intern `18.3.1-next-f1338f8080-20240426`; die Bytes entsprechen
exakt der Original18.3.1-Ressource. Der Paketbauer liefert die Laufzeit nur lokal.

Die [Tagesauswertung](../../verwaltung/original-daily-ledger.mjs) verwendet
ausschließlich vorhandene Übersichtsdaten und die letzten20 gelesenen
`processRuns`. Sie prüft Berliner Tagesgrenzen, eindeutige Laufkennungen,
abgeschlossene Zeitfenster, Produzent und die vorhandene
SHA256(JSON-Profilkennung)-Bindung. Fremde, doppelte, widersprüchliche,
zukünftige und unvollständige Belege werden nicht positiv gezählt.

In der bestehenden Bilanzdarstellung stehen jetzt **Briefing, Lage und
Zustellung** getrennt. „Gemeldet“ bedeutet ausschließlich eine vorhandene
Speicherangabe des Laufes; auch Cachebestände können enthalten sein.
**Vollständigkeit, Qualität und tatsächlicher Empfang bleiben ungeprüft.**
Null gelesene Läufe sind kein Beweis für null Tagesergebnisse. Eine vollständige
Zustellungsbilanz ist über die hier vorhandenen Leser nicht verfügbar und wird
nicht aus technischem Prozessabschluss geraten. Diese Übersicht ersetzt keinen
Mock500-/Production500-Nachweis.

**12/12 gezielte Ledger-Prüfgruppen bestanden**, einschließlich des vorhandenen
echten Lage-Produzenten und Sommer-/Winterzeitgrenzen.
[Beleg](tagesbilanz-pruefbeleg-20261104.json),
[Test](../../scripts/original-tagesbilanz-test.js).

**13/13 interaktive Browserprüfgruppen am Endstand bestanden:**

- echte Original-DC-/React-Laufzeit und bestehender lokaler HTTP-Server;
- Originalnavigation, Suche,50er-Seiten, echte Profildetailroute;
- Tagesbilanz mit einer über die echte Leseroute gelesenen synthetischen
  Lagequittung, ohne einen Motorlauf zu starten;
- Themenwechsel und Menü bei390Pixeln;
- Feldfehler, echte Kontoanlage, sichtbare gespeicherte Kundennotiz,
  Duplikatvermeidung, verlorene POST-Antwort und Teilanlage;
- partieller Übersichtsausfall sowie tatsächliche anonyme401-/Mandats403-Sperren;
- Originalschriften Spectral/Hanken Grotesk und212Pixel-Seitenleiste;
  keine ungefangene Browser-JS-Ausnahme und kein unerlaubter Zugriff.

[Interaktiver Beleg](interaktive-abnahme-pruefbeleg-20261104.json),
[Browsertest](../../scripts/original-verwaltung-interaktiv-test.js).
Die Tests korrigierten zuvor ausschließlich eigene Prüfhilfen: Original-
ReactDOM-Buildangabe, implizites Tariflabel, optionale Token-Sammlung,
bewusste Dokumentneuladung für getrennte Fehlerszenarien und genau das
Chromium-Standardfavicon. Erstfehlerprotokolle bleiben erhalten. Es wurden
keine Produktprüfungen entfernt oder Sicherheitsgrenzen gelockert.

Die neuen Bilder stammen aus der **echten interaktiven Originalruntime**:

- [Originalübersicht](../../../helmut-claude-backend-evidence/parallel-20261104/interaktiv-original-uebersicht-dunkel-1440.png)
- [Tagesbilanz](../../../helmut-claude-backend-evidence/parallel-20261104/interaktiv-original-tagesbilanz-1440.png)
- [Formularfehler](../../../helmut-claude-backend-evidence/parallel-20261104/interaktiv-original-formular-fehler-1440.png)
- [Gespeichertes Testkonto](../../../helmut-claude-backend-evidence/parallel-20261104/interaktiv-original-kunde-gespeichert-1440.png)
- [Mobile Originalansicht](../../../helmut-claude-backend-evidence/parallel-20261104/interaktiv-original-kunden-hell-390.png)

**Noch simuliert:** fiktive Daten/Quittung sowie ausdrücklich injizierte
Netz-/Serverfehler. Kein Erzeugungs-, Zustell- oder fachlicher Qualitätsnachweis.
Vor dem Browserstart wurden52 synthetische Profile im neuen Wegwerfspeicher
vorbereitet, eines davon mit aktivem Testflag. Es wurde kein Motor gestartet;
der Profil-Schreibzähler für die anschließenden Bedienvorgänge bleibt0.
**Fehlende Integration:** Der geprüfte Testserver montiert Paket und vorhandene
Anwendung ausschließlich in einem Wegwerfklon. Das Produkt-`server.js` und
seine Asset-/CSP-Regeln wurden nicht geändert. Die spätere Auslieferung muss
gemeinsam abgestimmt werden; kein globales Aufweichen von CSP oder Assetschutz.

## C — Kontokorrekturen: mit aktuellen Quellen kompatibel

Frisch per GitHub-GET geprüft, dokumentierter Abschluss12:29UTC:

- Main `773f7aa545bfeac9429ef368c49e302e68772cc6`;
- neuester offener Motor-PR[1038](https://github.com/ernisch/helmut-pilot/pull/1038),
  Kopf `aa3c4eaf4100bd2c7cbb87a4930294ed85c35dfb`;
- UI-PR[771](https://github.com/ernisch/helmut-pilot/pull/771) weiterhin Draft/offen;
  unter91 offenen PRs keiner für den eigenen Backend-Headbranch.

**10 Dateivergleiche und8 Patch-Anwendbarkeitsprüfungen bestanden.**
`accounts.js`, Auth und CAS sind zur geprüften Baseline bytegleich.
Die relevanten Kontorouten/Login-/Mutationsabschnitte bleiben auch am Motorhead
unverändert. D1/D2 benötigen keinen Rebase. Der bereits belegte gemeinsame
30/30-Nachweis wird übernommen; **kein neuer funktionaler Kontotestlauf**.
[C-Bericht](kontosicherheit-abgleich-20261104.md),
[C-Beleg](kontosicherheit-abgleich-20261104.json).

**Noch simuliert:** keine neue Simulation oder Funktionsausführung in C;
rein lesender Quell-/Patchvergleich. **Fehlende Integration:** Beide Patches
bleiben unappliziert, `accounts.js` ist weiter gesperrt. Widersprüchliche
Altkonten, verlorene Adminzugänge und verteilte DB-Konkurrenz sind dadurch
nicht nachträglich geprüft oder repariert.

## Schutz und nächster Schritt

`server.js`, `lib/helmut/accounts.js`, Motor, gemeinsam genutzte Kunden-UI,
CI, Migrationen und fremde Branches bleiben unverändert. Aktuelle Konten/
Quittungen wurden ausschließlich im neuen lokalen Testspeicher erzeugt;
keine Productiondaten gelesen oder geändert. Eigene Server/Browser und
Wegwerfklone wurden geschlossen/entfernt. Keine Mail, kein kostenpflichtiger
Test, keine Modellanfrage, kein Merge und kein Deployment.

Die konkrete Dateiliste, Endstandhashes, lokalen Protokolle und Schutzvergleiche
stehen im [Integritätsbeleg](backend-parallel-integritaet-20261104.json).
Eine weitere Freigabe ist für die abgeschlossenen lokalen Prüfungen nicht nötig.
Für die nächste Integration gelten weiterhin die ausdrücklichen Dateisperren:
erst die betroffenen gemeinsamen Dateien abstimmen/freigeben, dann die bereits
geprüften Kontofixes und die Originalverwaltung am Integrationsstand abnehmen.
Keine Production-Freigabe aus diesem lokalen Bestehen ableiten.

Im selben Thread fortsetzen. Für die unmittelbar nächste gemeinsame
Kontosicherheitsintegration **Sehr hoch**, da Authentifizierung und der letzte
anmeldbare Administrator betroffen sind.
