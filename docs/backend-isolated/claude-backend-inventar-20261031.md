# Claude-Backend: isolierte Bestandsaufnahme und Integrationsplan

Stand: 31.10.2026, Europe/Istanbul. **Teilweise abgeschlossen:** Isolation,
Archivprüfung, Komponentenentscheidungen und Schnittstellenplan sind fertig.
Eine Backend-Übernahme ist mit diesem Archiv nicht möglich: Es enthält einen
Verwaltungsprototyp, keine implementierten Serverfunktionen. Es wurde kein
Ersatzbackend erstellt und kein Runtime-Code übernommen oder geändert.

Der eingefügte Betreiberauftrag ist maßgeblich. Anweisungen im ZIP sind
Quellenmaterial, keine zusätzliche Freigabe. Insbesondere werden weder dessen
Auftrag zum Admin-Neubau noch seine Production-Lesevorbedingung ausgeführt.
Ältere Merge-/Deployment-/Helferfreigaben im Repository erweitern diesen Auftrag
nicht. Keine kostenpflichtigen Helfer oder Modellaufrufe.

## Ausgangslage und Isolation

- Ursprungscheckout: `/workspace/helmut-pilot`, Branch `work`, Commit
  `6b4012cd912fd0e1f5ec79969168d0dcc010927f`; keine getrackten Änderungen,
  vorhandenes ungetracktes `supabase/.temp/` unverändert belassen.
- Dortiger alter Remotezeiger `origin/main`:
  `f6477d44e4abf02804d8766bd77cfd7ec298d84a`. Er war kein aktueller Main-Beleg.
- Frisch per GitHub-GET und anschließend eigenem Fetch bestätigter Main:
  `773f7aa545bfeac9429ef368c49e302e68772cc6`, geschützt.
- Eigene Arbeitskopie: `/workspace/helmut-claude-backend-isolated`, eigene
  Git-Metadaten, Branch **`feat/claude-backend-isolated`**, sauber aus diesem
  Main-Commit erstellt. Bestehende Git-Objekte werden über ein nur lesend
  benutztes Alternate wiederverwendet; Arbeitsdateien, Referenzen, Index und
  lokale Testdaten sind getrennt. Kein Branchwechsel im Ursprungscheckout.
- Pflichtdateien vollständig gelesen; im Repository existiert nur die
  übergeordnete `AGENTS.md`. Diese vier Pflichtdateien sind zwischen
  Ursprungscheckout und Ausgangscommit identisch.
- Lokal beim Start: Infrastrukturprozesse, kein Helmut-Server oder Testprozess
  sichtbar. Kein Prozess beendet oder neu gestartet. Die Sicht gilt nur für
  diese Cloud-Umgebung, nicht für andere Rechner oder Production.
- Relevante offene Motorarbeit: Draft-PRs #998–#1004, außerdem die W15-Kette
  #969/#971/#973–#1000. Startbeobachtung: CI
  [41235111330](https://github.com/ernisch/helmut-pilot/actions/runs/41235111330)
  für [PR #1004](https://github.com/ernisch/helmut-pilot/pull/1004) lief;
  keine wartenden Runs gemeldet. Kein eigener Runner/Workflow gestartet.
- Aktuellerer Motorstand aus `docs/CURRENT_STATE.md` auf PR-1004-Kopf
  `66e6cfa6ff30412b80ac96f537629fb2f9c0cf92`: getrennte synthetische
  Ressourcendiagnose vorbereitet; End500-Gesamtabnahme und Mock500 offen;
  keine aktuelle Production-500-Abnahme. Das alte Main-Cockpit enthält noch
  Oktober-13-Befunde und wird hier nicht als frische Production-Messung benutzt.
- UI: [Draft-PR #771](https://github.com/ernisch/helmut-pilot/pull/771), Branch
  `codex/ui-design-20261002`, Kopf
  `eaf0d5d517d104beaeac53ebeecc6957d3dcadc1`. Dateiliste, relevante
  Schnittstellenänderungen und UI-Plan ausschließlich lesend geprüft.

Endkontrolle: Main und UI-Kopf sind unverändert. Der parallel bearbeitete
Motorzweig von PR #1004 ist inzwischen auf
`1bb917bb3eaeeb154fd45dcb6f1d8d7a81af8c0c` fortgeschritten. Diese Sitzung hat
ihn ausschließlich per GET gelesen; sie hat weder dessen Branch noch CI geändert.
Sein neuer Kopf wurde hier nicht getestet oder fachlich abgenommen.

Die Start-/Endbelege und Dateihashes stehen im
[maschinenlesbaren Prüfbeleg](claude-backend-pruefbeleg-20261031.json).
Der Abschlusscommit ist über `git log -1 feat/claude-backend-isolated` feststellbar;
er wird nicht zirkulär in seine eigene Datei geschrieben.

## Was das ZIP tatsächlich enthält

`Helmut Backened.zip`: 602.860 Bytes, SHA256
`402c025b2b58b581312e290f70e3503af8e4b396867be78ae3415ad448938384`.
35 Dateien, entpackt 1.356.697 Bytes, Wurzel `design_handoff_verwaltung_v3/`.

`README.md:13` bezeichnet die HTML-Datei selbst als Design-Referenz und
`v3_logik.js` als Beispieldaten. `INTEGRATIONSPLAN_v3.md:3–6` ist ein Plan vom
03.10.; er hat die damaligen Serverrouten ausdrücklich nicht bestätigt.
Seine Aussagen wurden daher gegen den aktuellen Ausgangscode abgeglichen.

| Wesentliche Komponente | Tatsächlicher Stand | Entscheidung |
| --- | --- | --- |
| `README.md`, `INTEGRATIONSPLAN_v3.md` | Geplanter Admin-Anschluss, keine Implementierung | Als Anforderung prüfen; bereinigter Plan unten |
| `prototyp/Helmut Verwaltung v3.dc.html` | Browseransichten für Übersicht, Profile, Betrieb, Kunden, Einstellungen | Später als Designreferenz prüfen; nicht als Backend übernehmen |
| `prototyp/v3_logik.js` | Deterministischer Generator für Beispielprofile, Status, Kosten, Kunden/Rechnungen und Verlauf | Weglassen; keine echten Backend-, Qualitäts- oder Kostendaten |
| `prototyp/support.js` | Design-Laufzeit mit dynamischer Codeauswertung und CDN-Nachladen | Weglassen |
| `prototyp/_ds/*` | Designsystem, Bundle, Token und Schriftdateien | Nicht übernehmen; vorhandene UI verwenden, Asset-Lizenzen bei späterem Bedarf prüfen |
| `design/v2_tokens.css`, `design/logo/*` sowie Kopien unter `prototyp/design/` | Gestaltung und doppelte Assets | Später mit UI-Branch abgleichen; keine UI-Dateien ändern |
| Login, Sessions, Kundenberechtigungen, Profilzuordnung | Im ZIP nicht implementiert | Vorhandene Helmut-Funktionen wiederverwenden |
| Briefing-/Quellen-/Empfehlungs-API und Persistenz | Im ZIP nicht implementiert | Bestehenden Motor und Speicher unverändert nutzen |
| `admin-ergebnisstand.js`, `GET /api/admin/ergebnisse` | Nur im README vorgeschlagen, im ZIP und Ausgangscode nicht implementiert | Später gesondert auf Bedarf prüfen; jetzt keine Route/kein Ersatzmodul |
| Kundenanlage, Rechnungs-/Zahlungsdienst | Nur Formulare/Beispielwerte | Weglassen; kein neues CRM oder Abrechnungssystem |

Unverändert wiederverwendbarer **Backend-Code aus dem ZIP: keiner**.
Nützlich sind seine Begriffe und Anforderungen, nach Korrektur der Simulationen.
Die vorhandene Browserlogik wurde nur gelesen; ihre Ausführung ist ungeprüft.

## Statische Archiv- und Sicherheitsprüfung

Das ZIP wurde nicht extrahiert, ausgeführt, im Browser geöffnet oder importiert.
Alle Inhalte wurden zur Prüfung als Bytes/Text gelesen; CRC aller 35 Dateien
bestanden. Keine absoluten Pfade, `..`-Komponenten, Windows-/Backslashpfade,
doppelten Archivpfade, Symlinks, verschlüsselten Einträge oder gesetzten
Ausführungsbits gefunden. Keine Datei über 2 MB, keine Kompressionsrate über
100:1. Keine `.env`-, Server-/Paket-/Installations-/Migrationsdateien enthalten.
Die JSON-Dateien konfigurieren das Designsystem, keinen Dienst.

Kein Treffer auf die geprüften Muster für private Schlüssel, bekannte
API-Tokenformate, JWTs und nichtleere literale Zugangsdatenzuweisungen.
Das ist ein begrenzter Musterscan, keine Garantie für Freiheit von Geheimnissen.
JavaScript und HTML bleiben ausführbarer Browsercode, auch ohne Ausführungsbit.

Konkrete Übernahmerisiken:

- `support.js:1143–1147` lädt React 18.3.1, ReactDOM und Babel 7.29.0 von
  `unpkg.com`; außerdem Self-Fetch und dynamische Auswertung mit `new Function`
  (`:844`, `:1218`). Kein serverseitiges Abhängigkeitspaket, aber unnötige
  Browser-Lieferkette und unpassend zum bestehenden Vanilla-Client.
- `v3_logik.js:64–77` erzeugt positive Qualitätszustände ohne Fachurteil;
  `:137` beschreibt auch unbeurteilte Ergebnisse als gesund. Nicht als
  Betriebsdiagnose verwenden.
- `v3_logik.js:7–8` bilanziert Briefing/Lage/Radar. Der bestehende Nachweis
  verlangt Mandatsbriefing/Morgenbriefing/Lage. Radar ist Teil des Pakets.
- `v3_logik.js:41`, `:103–110` simuliert Budgets/Kosten; `:148–160` simuliert
  Kunden und Rechnungen. Kein realer Kosten-, Vertrags- oder Qualitätsbeleg.
- Es gibt keine serverseitige Berechtigungsprüfung im Prototyp. Eine versteckte
  Schaltfläche, lokal veränderte Profil-ID oder Bestätigung schützt keine Daten.
- Fremde Daten später niemals ungeprüft in HTML/JSX übernehmen; das Vorhandensein
  von Template-/HTML-Auswertung ist kein Freigabebeleg für Kundendaten.

## Vorhandene Helmut-Schnittstellen: wiederverwenden statt neu bauen

Codebezug: Ausgangscommit oben. Dies sind Codebefunde, keine Production-Aufrufe.

| Bedarf | Bestehender Anschluss | Sicherheits-/Integrationsgrenze |
| --- | --- | --- |
| Anmeldung/Abmeldung/Session | `POST /api/auth/login`, `POST /api/auth/logout`, `/api/auth/session` (`server.js:540–575`) | Account-Modus; `auth.js`, `accounts.js`, serverseitige Session |
| Zugang einrichten/zurücksetzen | `/api/auth/set-password`, `/request-reset`, `/password-token` | Bestehende Einmal-Token-/Drosselungslogik erhalten; keine externe Nachricht auslösen |
| Nutzer → Mandat | `auth.getAllowedPoliticianIds`, `pickPoliticianId`; `/api/admin/assignments` | Client-ID ist Auswahl, keine Berechtigung; ohne Mandat 403/`no-mandate`, keine fremde Default-ID |
| Persönliche Inhalte/Empfehlungen/Quellen | `/api/app/start`, `/api/briefing/latest`, vorhandene Briefing-/Lage-/Radarverträge | Dieselben Daten für Mobile/Desktop; kein zweiter Generator |
| Profileinstellungen | `GET/PATCH /api/profile/current` (`server.js:739`) | Sessionzuordnung, bestehender CSRF-/Validierungspfad; hier nicht verändert |
| Internes Profil | `GET /api/admin/profile/:id` (`server.js:2584`) | Admin-Rolle, keine neue Aktivierungs-/Löschlogik |
| Übersicht/Kunden/Nutzer | `/api/admin/overview`, `/customers`, `/users`, `/assignments` | Bestehende Admin-Prüfung; keine Hashes/Tokens ausliefern |
| Budget/Kosten/Läufe/Audit/Quellen | `/api/admin/stats/budget-today`, `/stats/costs-per-user`, `/stats/process-runs`, `/audit`, `/sources-status` | Bestehende Lesefunktionen und Fehlerpfade; Kosten als Schätzung |
| Quellenarchitektur | `sourceArchitecture` in `/api/admin/overview` (`server.js:6660–6691`) | Antwortfeld, keine belegte separate `/sourceArchitecture`-Route |
| Zugang sperren | Bestehendes `PATCH /api/admin/users/:id` mit Kontostatus, `accounts.updateUser` | Später genaue Sessionwirkung prüfen; hier weder aufgerufen noch geändert |
| Recovery/Löschen/Provisionierung | Bereits vorhandene geschützte Routen | Nur dokumentiert; keine Nutzung oder Änderung in diesem Auftrag |

`lib/helmut/auth.js:41–43` setzt HttpOnly/SameSite und im Deployment Secure.
`accounts.js:90–116` verwendet scrypt und zeitkonstanten Hashvergleich.
`server.js:591–658` bindet die Mandatsauswahl an Session/Zuordnungen.
Der spätere Anschluss bleibt vollständig auf diesen Mechanismen.

`storage.assertTenant`/`assertTenantRows` und explizite `user_id`-Filter bleiben
Pflicht: Der bestehende Service-Role-Pfad umgeht RLS; vorhandene Policies sind
kein zusätzlicher wirksamer Mandantenschutz dieses Pfads. Maßgeblich ist
`docs/quellenarchitektur/05-sicherheitsmodell-rls.md`; der stillgelegte
Tenant-JWT-Pfad wird nicht aktiviert. Keine Auth-/RLS-Migration.

`respondError` in `server.js:6087` gibt generische öffentliche Serverfehler aus.
Spätere UI-Anbindung muss 401, 403, fehlende Daten und Serverausfall unterscheiden
und darf weder Fehlerdetails noch Beispielwerte als echte Antwort anzeigen.
Ein GET ist nicht automatisch wirkungslos: `/api/app/start` erfasst Aktivität.
Deshalb wurde für diese Analyse keine Production-App-/Admin-API abgerufen.

## Minimaler späterer Integrationsplan

1. **Material klären:** Für eine tatsächliche Claude-Backend-Übernahme fehlt
   Serverquellcode. Das richtige Archiv prüfen, bevor Backend-Code geschrieben
   wird. Soll stattdessen diese Verwaltung umgesetzt werden, den konkreten
   Admin-Umfang als nächsten Auftrag festlegen; kein kompletter Neuaufbau.
2. **Bestehende Verträge erhalten:** UI-PR #771 erwartet weiterhin
   `/api/app/start`, Profil-PATCH und bestehende Interaktions-/Aktionsantworten.
   Keine Umbenennung der Nutzerschnittstellen oder Änderungen an `client.js`,
   `styles.css`, `index.html`, `server.js`, Auth, Storage oder Motor in diesem
   Vorbereitungsbranch. Client-Rollenchecks ersetzen keine Serverprüfung.
3. **Verwaltung vereinfachen:** Übersicht/Profile/Betrieb auf vorhandene
   Admin-Aggregate beschränken. Prototyp-Panel, Beispieldaten, Rechnungsdienst,
   neue Kundenanlage, neue Recovery und zusätzliche KI weglassen. Bestehende
   Adminseiten nicht löschen. Design-/Navigationsänderungen gehören in einen
   später abgestimmten UI-Auftrag.
4. **Begriffe festhalten:** Technische Positionen unverändert
   `mandatsbriefing`, `morgenbriefing`, `lage`; Anzeigenamen Briefing,
   Zustellung, Lage. Radar nur im Paketdetail. Strukturell vollständig bedeutet
   nicht fachlich brauchbar: `briefing-speicher.pruefeInhalt` setzt
   `bestanden: false` (`:103–106`). Ohne geprüftes, an genau den Inhalt
   gebundenes Fachurteil bleibt „nicht beurteilt“ neutral.
5. **Aktivstatus wiederverwenden:** Kein neuer konkurrierender Schalter.
   `tenant-context.relationalesProfilLebenszyklus` projiziert
   `mandate_profiles.aktiv` nach `profileActive`, berücksichtigt fehlende
   Mandatszeilen und Soft-Delete; `isActiveMandate` verwendet diese Projektion.
6. **Nur bei belegter Datenlücke einen Leser planen:**
   `/api/admin/ergebnisse?tag=&seite=` ist derzeit ausschließlich ein Vorschlag.
   Vor Umsetzung konkrete Speicher-Lesefunktion, maximale Seitengröße,
   kalendarisch gültigen Berliner Tag, streng positive ganzzahlige Seite,
   Antwort-Feldliste und konsistente Gesamtbilanz über alle Seiten festlegen.
   Globale Bilanz nicht aus einer Einzelpage ableiten; „0 aktive Profile“
   von einem Lesefehler trennen. Keine Komplettläufe oder ungebundene
   Qualitätsableitung im Request. Admin-Rolle und Fehlerpfad vor jedem Read.
   Nur pure vorhandene Inhalts-/Quittungsprüfer wiederverwenden;
   `testnachweis-ergebnisse.pruefe` ist an `tagImFenster` gebunden, der
   `realkohorte-500-ergebnisleser` zusätzlich an Nachweisverträge. Diese
   Sicherheitsbindungen niemals für einen Adminabruf lockern.
7. **Vor späterem Anschluss gezielt prüfen:** Mit synthetischen lokalen
   Fixtures Login/Session, unzugewiesene und fremde Mandate, Nicht-Admin,
   Datum/Paging, Fehler/Leerzustände, fehlendes Radar und fehlende
   Inhaltsbindung prüfen. Keine Production-Verbindung in dieser Phase.

Mögliche spätere gemeinsame Konfliktdateien: `server.js`, `client.js`,
`styles.css`, `index.html`, `storage.js`, `auth.js`, `accounts.js`,
`tenant-context.js`, CI-/Vercel-Konfiguration und `docs/CURRENT_STATE.md`.
Sie wurden hier sämtlich unverändert belassen. Der Aufgabenstatus steht deshalb
nur in diesem neuen Dossier statt im gemeinsam bearbeiteten Cockpit.

## Verifikation und offene Grenzen

Im eigenen Checkout, ohne geerbte Zugangsdaten und ausschließlich über
`scripts/lokal.js` samt bestehender Netzsperre, nacheinander bestanden:

| Bestehende Suite | Ergebnis | Aussage |
| --- | --- | --- |
| `tenant-guard-test.js` | 37/37 | Fehlender Kontext, gefilterte Leser und Schreibguards |
| `cross-tenant-security-test.js` | 43/43 | Zwei synthetische Mandanten, Fremdlesen/-schreiben und manipulierte Mandatsauswahl |
| `profile-validation-test.js` | 36/36 | Profilzustände, Pflichtfelder und Validierung |

**116/116 Assertions, keine Fehler.** Keine Testdatei verändert oder neu erfunden.
Die Cross-Tenant-Suite verwendet allein `.helmut-data` in der eigenen Kopie.
Der JSON-Beleg enthält Befehle, Ergebnisse und Log-Prüfsummen. Diese Tests
bestätigen bestehende Teilfunktionen, keine Backend-Übernahme und keine
vollständige Sicherheitsabnahme.

Ungeprüft: echter Login-/Reset-HTTP-Ablauf, Browserprototyp, gesamter UI-Branch,
Production-Pakete, DB/RLS, Live-Sessions, Quality-Urteile, neue Admin-Ergebnisroute
und jede spätere Motor-/UI-Integration. Keine Last-/500er-/Gesamtsuite,
keine Installation, keine Modellaufrufe, kein Docker-/Dienststart.

Nur neue Dokumentations-/Belegdateien auf dem eigenen Branch geändert.
Kein Push/PR: Für den neuen Branch ist ein automatisches Vercel-Deployment
nicht sicher ausgeschlossen; außerdem lief die Motor-CI. Keine
Vercel-Konfiguration zur Umgehung geändert. Kein Merge, Deployment,
Production-Datenzugriff oder -Eingriff, keine Cron-/Budget-/Umgebungsänderung.
Unveränderte Ursprungsreferenzen/-dateien und UI-Kopf werden im Endbeleg
kontrolliert. Globale Zustände anderer Rechner sind damit nicht bewiesen.

Nächster Schritt: tatsächlichen Backend-Quellcode bereitstellen oder den
Admin-Prototyp ausdrücklich als nächsten konkreten Umsetzungsumfang festlegen.
Für die abgeschlossene isolierte Analyse ist keine weitere Freigabe erforderlich.
Im selben Chat fortsetzen; **Sol Hoch** genügt für die nächste gezielte
Materialprüfung.
