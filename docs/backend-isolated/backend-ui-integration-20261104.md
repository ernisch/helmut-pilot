# Helmut: Kontosicherheit und Vorbereitung der aktuellen UI-Integration

Stand 04.11.2026 UTC. **Kontofixes lokal abgeschlossen; Backend-Verträge gezielt
geprüft. Gemeinsame aktuelle UI-/Browserabnahme blockiert durch fehlenden
Quellzugriff. Keine Production-Freigabe.**

## Verbindliche Stände und Isolation

- Eigener Bereich `/workspace/helmut-claude-backend-isolated`, Branch
  `feat/claude-backend-isolated`. Ausgang `ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`.
  Die vorhandene uncommittete Verwaltung wurde vor Änderungen vollständig
  gehasht und unverändert als lokaler Checkpoint gesichert.
- Kontofixes: Commit `f084bbfca4e23fa5a8286a14bf3839d9930f9d56`.
  Originalverwaltung einschließlich vorhandener Browserbelege: Commit
  `6b687621856227524c1d9873e1c48572ee368064`; enthält den Kontofix als Vorgänger.
  Der nachfolgende Integrationsbeleg-Commit ändert diese Runtimequellen nicht.
- Main frisch über GitHub-GET bestätigt:
  `773f7aa545bfeac9429ef368c49e302e68772cc6`. Zu Beginn Motor-PR1038;
  Abschlusskontrolle13:45UTC: inzwischen
  [Draft PR1039](https://github.com/ernisch/helmut-pilot/pull/1039),
  `1ccb592d165ffcde64cfcf8061eef40ce8e7e77b`. Dessen25 geänderte Pfade
  enthalten keine Accounts-/Auth-/Storage-, Server- oder UI-Runtimeänderung.
  [Frischer Remote-Beleg](integration-remote-abschluss-20261104.json).
  Keine eigenen offenen PRs.
  Diese Beobachtungen sind keine neue Mock500-/Production500-Abnahme.
- Aktuelle UI: `373c373d`, direkt auf
  `a41d51f194dba526c7aab6b922f6dc33eed3d618`,
  `codex/helmut-ui-20261031`, `/workspace/helmut-ui` **im anderen Executor**.
  Durch Nutzerangaben und rein lesenden aktuellen Thread
  „Helmut UI isoliert vorbereiten“ bestätigt. Dessen letzte Prüfung meldet einen
  sauberen Worktree. Kein frischer Git-/Vollquellenzugriff aus diesem Executor;
  vollständige Head-SHA deshalb hier nicht unabhängig ermittelt.
  [Identitätsbeleg](ui-identifikation-20261104.json),
  [Zugriffsgrenze](ui-zugriffsgrenze-20261104.json).
- PR771 ist historisch und wurde ausdrücklich **nicht** integriert. Die 554
  bisherigen UI-Prüfungen sind übergebene simulierte Prüfungen, keine hier neu
  ausgeführte Browser- oder Serverabnahme. Die aktuelle dokumentierte UI-Übergabe
  `docs/ui-backend.md` wurde über den Thread gelesen. Eine bilaterale Abstimmung
  mit einem schreibenden UI-Arbeitsbereich hat nicht stattgefunden.

Vor Beginn Pflichtdateien und unveränderte Regelhashes, Branch/Main, lokale
Änderungen, Git-Verzeichnisse, Worktrees, offene PRs und Prozesse geprüft.
Eigene Git-Metadaten und keine aktiven Motor-/Testprozesse im eigenen Checkout.
Der ursprüngliche Checkout `/workspace/helmut-pilot` bleibt auf `6b4012cd…`,
mit dem bereits vorhandenen untracked `supabase/.temp/` unverändert.

## 1. Kontosicherheit: integriert und unabhängig akzeptiert

`lib/helmut/accounts.js` enthält exakt die beiden zuvor geprüften Patches:

1. `active:true` hebt `deaktiviert`/`gekuendigt` nicht mehr widersprüchlich auf.
   Eine ausdrücklich gewählte gültige Statusaktivierung bleibt möglich.
2. Status-, Aktiv- oder Rollenentzug darf den letzten anmeldbaren Administrator
   nicht beseitigen. Prüfung innerhalb der wiederholbaren Auth-Mutation, auch
   nach einem bestätigten CAS-Konflikt auf dem frisch gelesenen Stand.

16 hinzugefügte und eine ersetzte Zeile. Vollständiger Dateihash:
`608838b6674a17c1028bd3cda3edcb129188f6d75923fbb7b62bab04fdf6e703`.
Keine andere vorhandene Backend-Runtime verändert. Keine Reparatur bereits
inkonsistenter Altkonten und kein neuer Nachweis am verteilten Productionstore.

**32 Prüfungen bestanden, darunter zwei Offline-CAS-Prüfungen; 56 echte lokale
HTTP-Anfragen.** Unveränderte vorhandene HTTP-Worker prüfen den tatsächlich
integrierten Quellstand, nicht erneut rekonstruierte Patches. Status, Login,
Sitzung, letzter Admin und parallele Entzüge abgenommen. Der CAS-Transportersatz
belegt frisches Nachlesen und Schutz vor veralteten Schreibern; keine echte DB.
Keine vollständige Testserie wiederholt.

[Prüfbericht](kontosicherheit-integration-20261104.md) ·
[Maschinenbeleg](kontosicherheit-integration-pruefbeleg-20261104.json) ·
[unabhängiger angewandter Code-Review](kontosicherheit-integriert-review-20261104.json).

## 2. Was am echten lokalen Backend zusammen funktioniert

`scripts/backend-ui-http-integration-test.js`: **11 Gruppen / 41 echte lokale
HTTP-Anfragen bestanden**, in einem frischen temporären Klon mit den tatsächlich
integrierten Accounts-Bytes, synthetischer Persistenz und inaktiven Profilen.
Der originale Kundenadapter läuft gegen diese realen Kontorouten. Aktuelle
UI-Dateien, Browserdarstellung und Benutzerbedienung sind nicht Teil dieses Laufs.

| Bereich | Tatsächlicher Nachweis |
| --- | --- |
| Anmeldung/Sitzung | Anonymzustand, falsches Passwort, Login, HttpOnly/SameSite/Path/Max-Age, tatsächliche Sessionverlängerung und Cookie, Logout entwertet Sitzung. HTTPS-/Productioncookie und Unverändertheit aller anderen Sessions separat offen. |
| Start | Eigene Profilvalidierung, Aufgaben, Notizen, Version und KI-aus-Status kommen aus dem realen Handler. `briefing/latest` liefert den Briefingvertrag ohne Appstart-Umschlag. |
| Rechte/Mandanten | Mitglied und Referent bekommen bei fremder URL weiterhin nur ihr erlaubtes Mandat; fremde Aufgaben/Notizen/Profildaten fehlen. Adminroute verweigert beide Rollen. Fehlende Zuweisung ergibt403/`no-mandate`. |
| CSRF | Alle sechs vorhandenen schreibfähigen GETs und beide Büro-POSTs ohne Token abgewiesen; manipuliertes Token verhindert Profilmutation. Kein Motorlauf. Die 12-Stunden-Grenze wurde in diesem Lauf nicht gesondert geprüft. |
| Profilpflege | Realer PATCH bindet Ziel an die Session trotz fremder URL-/Body-ID; fremdes Profil unverändert und alle Profile inaktiv. |
| Kundenverwaltung | Vorhandener Originaladapter legt ein echtes gesperrtes synthetisches Konto mit Preis offen und bestehender Kundennotiz an. Keine Einladung, Passworttokens oder Mail. Konto kann sich nicht anmelden. |
| Fehler | Tatsächlicher Authhandler liefert503 bei injiziertem Authspeicherausfall; Appstart500 bei injiziertem Profilspeicherausfall. Keine fremden Daten. |

Lage liefert ohne V3-Bestand `available:false`, `reason:v3-disabled`; Briefing
bleibt nicht frisch, Radar ist leer. **Im echten Radar-Leerzustand fehlt
`currentRadarState.anzeige` absichtlich** (`radarState.js:957`). Das war eine
falsche Annahme im ersten Testlauf und wurde nach Quellprüfung auf den realen
Leerzustand korrigiert. Der [erste Fehlbeleg](backend-ui-http-erster-fehler-20261104.json)
und das zugehörige Log sind erhalten.
Keine positive Inhaltsqualität oder vollständige kuratierte Radar-Ausgabe aus
diesem leeren lokalen Datenbestand ableiten.

Alle Funktionstests über `scripts/lokal.js`, explizite kleine Environment-Allowlist,
keine übernommenen Credentials. Modelle und Mail gesperrt. Sieben Aufrufe des
bestehenden Frischelesers `getLatestCompleteKnowledgeObjectAt` erreichen den
vollständig ersetzten Fetch und werden dort **vor jeder Weiterleitung** abgewiesen;
null weitergeleitete Abrufe. `HELMUT_SOURCE_MODE=off` allein unterbindet diesen
Lesepfad nicht. Dies ist eine Grenze der lokalen Adapterkonfiguration und kein
beobachteter Productionzugriff. Temporäre Klone und eigene Server entfernt.

[HTTP-Maschinenbeleg](backend-ui-http-result-20261104.json) ·
[unabhängiger HTTP-/Patchreview](backend-ui-integration-review-20261104.json).
Der Adapterhash ist zusätzlich durch Start-/Endinventar gebunden; das HTTP-JSON
enthält ihn nicht selbst. Keine Rootquelle während dieser Prüfung verändert.
Der [Integritätsbeleg](backend-ui-integration-integritaet-20261104.json) bestätigt
die geschützten Dateien, Originalassets und den unveränderten Ausgangscheckout.

## 3. Die beiden Büro-Endpunkte bleiben getrennt

| | Aktuelle Kommunikationsroute | Alternative native Office-Route |
| --- | --- | --- |
| Route | `POST /api/communication/generate` | `POST /api/office/generate` |
| Anfrage | `{prompt,channel,decision}` | `{vorgangId,outputType}` |
| Beispielkanal | `press` | `pressemitteilung` |
| Antwort | `{text,aiEnabled,channelLabel,degraded?,fallbackReason?,sourceNote?}` | `{content,status,id}` bei Erfolg/Cache, sonst `{skipped,reason}` |
| Voraussetzungen | Session/Mandat, CSRF, Rate-Limit; echter KI-Weg zusätzlich Budget/Anbieter | zusätzlich Office-Flag, abgeschlossene KO-Analyse, Cache/Tageslimit/Template; Erzeugung speichert Office-Ausgabe |
| Hier geprüft | Echter gekennzeichneter Regel-Fallback ohne KI-Schlüssel, ohne persistierte Entwurfs-ID | Falsches Kommunikations-DTO400; `press`400; Flag aus→`office-disabled`; Flag im eigenen Prozess an, fehlendes KO→`ko-not-ready` |

Kein stiller Wechsel. Native Erzeugung/Persistenz, positive KO-Inhalte, KI-Ergebnisse,
Budget-/429-Browseranzeige, unbekannter Schreibausgang und geräteübergreifender
Entwurfsstand sind noch nicht gemeinsam abgenommen. Ein UI-Tagescache belegt
keine serverseitige oder geräteübergreifende Persistenz. Keine neue parallele
Büro-Engine gebaut. Bei Bedarf an nativer Office-Persistenz ist ein ausdrücklicher
DTO-/Kanal-/Antwortadapter mit der aktuellen UI abzustimmen.

## 4. Getrennte, nicht angewandte Integrationspatches

1. [Originalverwaltung ausliefern](integration-01-verwaltung-server-kandidat.patch):
   nur `/verwaltung/`, Account-Adminprüfung vor HTML/Assets, feste hashgeprüfte
   Asset-Map, `no-store`, richtige Schrift-MIME-Typen. Das vorhandene DC-Original
   benötigt `unsafe-eval`; Ausnahme ausschließlich auf dieser Verwaltungsroute,
   keine Erweiterung der globalen App-CSP. Der unabhängige Review fand einen
   Boolean-Vertragsfehler im ersten Kandidaten; vor Abschluss korrigiert.
2. [Font-/Bild-MIME-Typen](integration-02-font-mime-kandidat.patch):
   TTF/WOFF/WOFF2/JPEG-Zuordnung in der bestehenden Tabelle; keine neue öffentliche
   Pfadfreigabe. Gegen den später zugänglichen aktuellen UI-Serverstand abgleichen.
3. Bereits vorhanden: [Admin-Profilfehler ehrlich erhalten](profil-lesefehler-kandidat-20261104.patch).
   Fehlendes gespeichertes Profil404, Speicherfehler500 statt Ersatzprofil/null.
   Frühere fünf Baseline- und fünf Kandidaten-HTTP-Fälle dokumentiert;
   nicht erneut ausgeführt.

Alle drei bestehen einzeln und gemeinsam `git apply --check`; Kandidaten nur im
Speicher syntaktisch geprüft. Der Verwaltungskandidat hat zusätzlich **sechs
VM-Prüfgruppen** mit echter boolescher `authMode()`-Funktion und Originalassets,
synthetischem Authkontext bestanden. Das ist keine reale Servermontage oder
Browser-/CSP-Abnahme. [Kandidatenbeleg](verwaltungsroute-kandidat-pruefbeleg-20261104.json),
[Syntax/Anwendbarkeit](integration-patches-syntax-20261104.json).
Ein fehlerhafter Textselektor im ersten VM-Test ist getrennt erhalten.

`server.js`, `client.js`, `styles.css`, `index.html`, Storage, Motor, Migrationen
und fremde Branches bleiben unverändert. Die 25 Originaldesign-Dateien und
Originalruntime-SRI sind unverändert. Die frühere interaktive Abnahme der
Originalverwaltung bleibt gültiger historischer Beleg für deren damaligen
isolierten Testwrapper; sie ersetzt nicht die neue gemeinsame UI-Abnahme.
Historische Unified-Patches enthalten formatbedingt Leerzeichen auf Kontextzeilen;
ihre Hashes wurden erhalten. Kein Quellen-Whitespacefehler daraus abgeleitet.

## 5. Konkreter nächster sicherer Sprint

1. Den vollständigen aktuellen Quellstand `373c373d` aus dem anderen Executor als
   lesbaren Snapshot bereitstellen; vollständige SHA, sauberen Stand und Regeldateien
   frisch bestätigen. Keine Verwendung von PR771 oder Rekonstruktion aus Auszügen.
2. Exakt diesen Snapshot ohne Änderungen an seinem Originalworktree mit dem
   Backendcheckpoint in einem dritten Bereich verbinden. Session-/Aktivitätswrites
   nur in der eigenen synthetischen Ablage; DIP, Push, Quellen und Modelle gesperrt.
3. Desktop/mobile mit echten lokalen Antworten prüfen: Anmeldung, alle vier
   Bereiche, Profil-/Kundenpflege, Rollen/Mandate, fehlende Daten und Fehler;
   Darstellung gegen das jeweilige Claude-Original vergleichen. Positive
   Fachinhalte aus freigegebenen synthetischen Rohdaten und unveränderten Adaptern.
4. Erst danach die konkret geprüften Serverpatches zur **ausdrücklichen
   Dateifreigabe für `server.js`** vorlegen. Eine notwendige UI-Navigation oder
   Büro-Adapteränderung benötigt eigene gemeinsame Dateifreigabe auf dem frisch
   bestätigten UI-Commit. Hier ist kein aktueller UI-Patch erfunden worden.

Abnahme: keine fremden Daten, kein automatischer Fachlauf/Anbieteraufruf, kein
falscher Erfolg bei unbekanntem Ausgang, klare Leer-/Fehlerzustände und erhaltenes
Originaldesign. Production-, echte DB-, Mail-/Pushzustellungs- und 500er-Freigaben
sind davon getrennt und wurden weder angefragt noch benutzt.

Empfohlene Denkstufe für den nächsten gemeinsamen Auth-/Integrationssprint:
**Sehr hoch**, weil Sitzungen, Rechte und automatische Schreibaktionen zusammenkommen.
Im selben Thread fortsetzen.
