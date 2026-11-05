# Kundenformular: vorhandene Kontoverträge sicher anschließen

**Fertig zur Integration in die Originalverwaltung: Feldvalidierung, echte gesperrte Kontoanlage mit Kundennotiz und ehrliche Fehler-/Teilzustände. 21 gezielte Prüfgruppen bestanden, darunter 21 echte HTTP-Requests.** Originaltemplate, CSS, Backendkern und Motor bleiben unverändert.

## Was tatsächlich gespeichert wird

Das Backend besitzt Konten mit Kundendaten, keinen separaten CRM-Kundenentwurf. Der kleinste vorhandene Anschluss ist:

1. Frischer GET `/api/admin/users`: vorhandene admin-geschützte Route belegt den aktuellen Verwaltungszugriff; Duplikat-E-Mail und bereits gebundene Profil-ID werden vor dem Schreiben geprüft. Der Server prüft die Rolle beim anschließenden Schreiben erneut.
2. GET `/api/security/csrf`, dann POST `/api/admin/users` ausschließlich mit `{name: person, email, role:"abgeordneter", active:false}` und optional ausgewählter `politicianId`. Kein Passwort, keine Schnellstart-/Mandatsdaten.
3. PATCH `/api/admin/users/:id` ausschließlich mit den bestehenden Kundenfeldern `{customer:{pricePerMonth:null,paymentStatus:"none",internalNote:...}}`.

Die lesbare vorhandene interne Notiz bewahrt getrennten Kundennamen, Ansprechpartner und Tarifwunsch:

```text
Kundenname: Fiktives Buero Kundenformular
Ansprechpartner: Synthetische Person Alpha
Tarifwunsch: Büro (Preis offen)
```

Das ist eine gewöhnliche interne Notiz, kein neues CRM-Schema oder zusätzlicher Speicher. Die Kontobezeichnung bleibt die Ansprechperson. Der Tarifwunsch wird nicht als abgeschlossener Tarif oder echter Preis ausgegeben. Die ursprünglichen Simulationspreise **290/490/1200 werden nie in einen Schreibpayload übernommen**. Keine Rechnung und keine Einladung werden ausgelöst.

Auch ohne gewähltes Profil erzeugt die bestehende Kontoroute eine Mandats-ID aus dem Namen. Diese Referenz beweist kein gespeichertes oder versorgtes Profil. Bei bereits gebundener ID suffixiert der Server sie; deshalb werden Vorprüfung und bestätigte POST-Antwort gegen die Auswahl geprüft. Eine Abweichung lässt das bereits angelegte gesperrte Konto offen erkennen und stoppt den zweiten Schreibschritt. Es gibt keine automatische Löschung.

## Originalformular und Integrationshook

```js
import { attachCustomerForm } from "./original-customer-form.mjs";
Component = attachCustomerForm(
  attachOriginalBackend(Component, { actionsFactory: createAdminActions })
);
```

`attachCustomerForm` muss **außen** um den vorhandenen Backend-Wrapper liegen, damit es den bislang blockierten `formSubmit` ersetzt. Es verwendet dessen `_actions`, `_phase`, `refresh()`, `denyAccess()`, `data()`, `go()` und `say()`; Import allein startet keine Anfrage.

Eingabe-DTO für `createAdminActions().createCustomerAccount(...)`:

```js
{ customerName, person, email, tariffIntent, politicianId: null /* oder bestätigte Auswahl */ }
```

- Bestehende `hasFormErr`, `formErr` und `formFields` zeigen Feldfehler und rote Originalfeldrahmen/`aria-invalid`. Name und Person bleiben getrennt; Pflichtangaben, Längen, E-Mail, Steuerzeichen, Tarif- und freie Profilauswahl werden geprüft.
- Neue Werte für das vorhandene Submit-Element: `customerSubmitDisabled`, `customerSubmitLabel`, `customerFormBusy`, `customerFormLocked`. Root bindet diese Werte in seinem Paket ein; das Originaltemplate wurde hier nicht geändert.
- Busy und Doppelsubmit sind unabhängig von der Buttondarstellung im Verhalten gesperrt. Währenddessen bleiben Eingaben erhalten. Kein Simulationskunde in `extraCust` und kein lokaler Erfolgsentwurf.
- Erfolg erst nach zwei passenden bestätigten Schreibantworten. Danach wird der tatsächliche Kundenbestand neu gelesen. Nur ein dort vorhandenes Konto öffnet die Detailansicht. Scheitert diese Lesebestätigung, wird das bestätigte Konto mit ID genannt und weiterer POST gesperrt.
- HTTP 400/409 bleiben Feld-/Konfliktfehler, ohne automatischen Retry. POST-/PATCH-Timeout, verlorene Antwort oder unpassende 2xx-Antwort gelten als unklar. Nach bereits bestätigtem POST wird die bekannte Konto-ID genannt. Teilanlage/unklarer Ausgang sperrt weiteren Submit in dieser Komponente; ein neuer POST erfolgt weder automatisch noch durch erneuten Klick.
- HTTP 401/403 entzieht über den bestehenden `denyAccess()` den gesamten privaten Bestand und leert zusätzlich die Formularangaben. Nach Zugriffsentzug werden keine privaten Teilkontoangaben angezeigt.

## Geprüft und belegt

[kundenformular-pruefbeleg-20261104.json](kundenformular-pruefbeleg-20261104.json): **PASS, 21 Prüfgruppen, 21 echte HTTP-Requests** auf dem finalen Stand. Zwei gezielte erfolgreiche Läufe: Nach dem ersten wurde ausschließlich das Nachweisschreiben des Testskripts zusätzlich auf den eigenen Arbeitsbereich begrenzt und der Endstand nochmals geprüft. VM-Prüfungen verwenden die tatsächliche Originalkomponente plus vorhandenen Backend-Wrapper und neuen Formular-Wrapper.

| Nachweis | Ergebnis |
|---|---|
| Originaldesign | Alle 25 Originaldateien einschließlich Template/CSS stimmen bytegleich mit dem Manifest überein. |
| Validierung/DTO | Feldfehler, ungültige E-Mail, Namen/Steuerzeichen, Tarif-/Profilauswahl; Rollen, Passwörter, freie Pfade und echte Preise vor IO abgewiesen. |
| Verhalten | Busy/Doppelsubmit, Eingabenerhalt, keine Simulationsentwürfe, Teilkonto-ID und Sperre nach unklarer Antwort, Leeren nach 401/403. |
| Echte Persistenz | Gesperrtes Konto und Kundennotiz über tatsächlichen HTTP-POST/PATCH; GET `/api/admin/customers` bestätigt die Notiz. Kein Passwort-Hash/Salt am neuen Konto. |
| Rechte/CSRF/Duplikate | Echte Anonym-401/Nicht-Admin-403 vor POST, CSRF-403 und Duplikatsperre ohne zweites Konto. |
| Profilwettlauf | Eine gezielte synthetische Bindungsfixture entsteht nach der Vorprüfung. Tatsächliche Server-Suffixierung wird als bekannte Teilanlage erkannt; keine falsche Zuordnung und kein Notiz-PATCH. |
| Verlorene Antworten | Echte POST-/PATCH-Schreibantworten nach Ausführung synthetisch verworfen: Konto bleibt gesperrt, kein behaupteter Gesamterfolg, bei PATCH bekannte Konto-ID. |
| Sicherheitsgrenzen | **0 Mailaufrufe, 0 Passworttokens, 0 Profil-Schreibversuche, 0 gespeicherte Profile, 0 Fetchversuche**. Nur synthetische `example.invalid`-Konten. |

Der HTTP-Teil startet die echte unveränderte `server.js` nur in einem frisch lokal geklonten Branch `feat/claude-backend-isolated`, Commit `ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`. Eigene Git-Metadaten, anfangs leerer Store, keine Environment-Datei; Listen ausschließlich `127.0.0.1` auf zufälligem Port. Testklon danach entfernt.

Alle Tests über `scripts/lokal.js` und explizite kleine Environment-Allowlist: lokale Speicherung, Quellenmodus aus, Kommunikationsriegel `gesperrt`, vorhandene Pakete nur lesend über `NODE_PATH=/workspace/helmut-pilot/node_modules`. Keine Installation, Kosten, externen Zugriffe oder Production-Aktionen. `server.js`, `accounts.js`, `auth.js`, `storage.js`, Kunden-UI, Styles und Index vor/nach identische Hashes.

## Noch offen beziehungsweise bewusst begrenzt

- Root integriert den Hook, bindet Busy/Disabled am bestehenden Button, ersetzt die statischen Simulationstariftexte durch ehrliche Preis-offen-Texte und zeigt die bestehende interne Notiz im Kundendetail. Diese Paket-/Adapterdateien gehören Root und wurden hier nicht verändert. Interaktive Browserabnahme und visueller Originalvergleich folgen dort.
- Die beiden Schreibschritte sind serverseitig nicht atomar. Bei Fehler kann ein gesperrtes Konto ohne vollständige Kundennotiz bleiben. Das wird offen benannt; keine neue Transaktion, kein CRM-Backend und kein automatischer POST-Retry werden vorgetäuscht.
- Auswahlprüfung mit dem Originalformular verwendet bekannte Profillisten. Der echte isolierte HTTP-Test erzeugt absichtlich keine Profile und belegt daher den Auth-Referenzvertrag und dessen Wettlauf, keine neue Motor-/Profilversorgung.
- Preise, Rechnungsanbindung, Einladung, Aktivierung/Freigabe und Mehrbenutzer-Organisationen sind hier nicht umgesetzt. D1/D2-Kandidaten am gemeinsamen Backend bleiben getrennte vorbereitete Fixes; dieser Anschluss aktiviert keine Konten und ändert keine Adminrolle.

## Dateien und Hashes

Nur `verwaltung/original-actions.mjs` erweitert; neu sind Formularmodul, gezielter Test und diese beiden Dokumentationsdateien. Kein Commit/Push/Merge/Deployment.

| Datei | SHA256 |
|---|---|
| [Actions](../../verwaltung/original-actions.mjs) | `1b6f7366761195db8bffbfd6cb50df949009a418fceb3855920bd2e7ef6eaee3` |
| [Formularhook](../../verwaltung/original-customer-form.mjs) | `a47309d6168a54ad715379d188b2e6057ed24e919f9a839c580cbca33ba63098` |
| [Gezielter Test](../../scripts/kundenformular-test.js) | `a1a1fa79013c0cefc19b205cd45dd7fc5d0b89d65e5fd6e1e53658fb11b4c50b` |
| [Prüfbeleg](kundenformular-pruefbeleg-20261104.json) | `8c8ef418960d8bf1244ca00c930ef8afba2e05bb108219a43614398549d5ce93` |

Reproduktion ausschließlich aus `/workspace/helmut-backend-kunden-20261104`, mit der im Test `env()` angegebenen Allowlist: `node scripts/lokal.js scripts/kundenformular-test.js`. Schutz gegen Root/`helmut-pilot` als Ausführungsbereich ist eingebaut.
