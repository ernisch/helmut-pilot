# Datenschutz Masterakte — Helmut

**Stand:** 05.10.2026  
**Status:** Arbeitsgrundlage, keine anwaltliche Freigabe  
**Verantwortlicher:** Lüey Nohut als aktueller Einzelunternehmer  
**Domain:** `mithelmut.de`, vom Betreiber festgelegt. Eine produktive Verbindung als Custom Domain ist noch nicht belegt.

## 1. Zweck dieser Akte

Diese Datei ist die aktuelle Arbeitsübersicht für Datenschutz bei Helmut. Sie bündelt bestätigte technische Fakten, Betreiberentscheidungen, offene Rechtsfragen und die Reihenfolge bis zur Freigabe für echte Kunden.

Sie ersetzt keine Rechtsberatung und keine formelle Freigabe. Der verbindliche rechtliche Abschlussstatus bleibt in `docs/datenmotor-restliste.md` unter OP 02. Technische Detailentwürfe bleiben in `docs/recht/`.

Für den rein synthetischen technischen 500er Nachweis ist die offene Datenschutzfreigabe nach aktueller Projektsteuerung kein Startblocker. Vor dem ersten echten Pilotkunden und vor vertraulicher Büronutzung müssen die unten markierten Verkaufsblocker geschlossen sein.

## 2. Festgelegte Betreiberentscheidungen

| Bereich | Entscheidung |
|---|---|
| Verantwortlicher | Aktuell Lüey Nohut als Einzelunternehmer |
| Geschäftsanschrift | Anschrift gemäß aktuellem Impressum |
| Hauptdomain | `mithelmut.de` |
| Geplanter Webauftritt | `www.mithelmut.de` |
| Geplante App | `app.mithelmut.de` |
| Datenschutzkontakt | Nach Domain Einrichtung bevorzugt `datenschutz@mithelmut.de` |
| Zielgruppe | Zunächst Politiker in Deutschland, später gegebenenfalls deren Mitarbeiter |
| Registrierung | Keine öffentliche Selbstregistrierung. Konten werden durch den Betreiber angelegt und eingeladen |
| Datenminimierung | Verbindliches Ziel. Nur für die Funktion erforderliche Daten verarbeiten |
| Datei Upload | Derzeit nicht als Produktfunktion vorgesehen |
| E Mail Integration | Nur Zukunftsidee, noch keine aktuelle Datenschutzgrundlage |
| Eigene Modelltrainings | Nicht vorgesehen |
| DeepSeek | Entwicklungswerkzeug, nicht Teil der aktuellen Helmut Production Laufzeit für Kunden |
| Private Personenprofile | Nicht gewollt und im aktuellen Understanding Pfad ausdrücklich untersagt |

## 3. Datenschutz Cockpit

| Bereich | Stand | Tatsächlicher Befund | Nächster Schritt | Verkaufsblocker |
|---|---|---|---|---|
| Verantwortlicher | 🟢 | Betreiber ist aktuell Lüey Nohut | In Rechtstexten einheitlich führen | Nein |
| Domain | 🟡 | `mithelmut.de` ist festgelegt, Custom Domain Verbindung noch nicht belegt | Nach technischer Einrichtung Website und App zuordnen | Nein |
| Website Tracking | 🟢 | Kein Google Analytics, Meta Pixel oder vergleichbarer Tracker im aktuellen Live Auftritt gefunden | Tracking weiterhin vermeiden | Nein |
| Website Fonts | 🟢 | Schriften werden lokal ausgeliefert | So beibehalten | Nein |
| Website Datenschutzhinweis | 🟢 | Am 06.10.2026 auf Production aktualisiert: Vercel Hosting, technische Zugriffsdaten, Rechtsgrundlage, Drittlandhinweise, Speicherkriterien, E Mail Kontakt, Betroffenenrechte und Beschwerderecht enthalten. Alte falsche Aussage entfernt. Live Prüfung: HTTP 200, keine Marketing Tracker gefunden, kein Set Cookie Header | Bei Anbieter oder Website Funktionsänderungen erneut prüfen | Nein |
| App Datenschutzhinweis | 🟢 technisch aktuell | PR #824 ist gemergt und Production `READY`. Live `/datenschutz` liefert HTTP 200 und nennt freie Texteingaben, öffentliche politische Quellen, Vercel, Supabase `eu-west-1` Irland, Microsoft Azure OpenAI `gpt-5-mini-eu` in der europäischen Azure Datenzone, Push, Browser Speicher, Retention, Rechte und Art.-9-Offenheit. | Bei Datenflussänderungen nachziehen; rechtliche Art.-9-/Art.-14-/DSFA-Entscheidungen bleiben getrennt offen | Nein für die technische Aktualität des Hinweises |
| Öffentliche Registrierung | 🟢 | Keine öffentliche Signup oder Register Route gefunden | Betreiber Einladung beibehalten | Nein |
| Kontodaten | 🟡 | Name, E Mail, Rolle, Passwort Hash, Sessions, Login Zeitpunkte und Sicherheitsmetadaten sind technisch vorgesehen | Rechtsgrundlage, Frist und Empfänger dokumentieren | Ja |
| Mandatsprofil | 🟠 | Partei, Fraktion, Parlament, Region, Wahlkreis, Ausschüsse, Themen, Funktionen und weitere politische Profildaten werden verarbeitet | Art. 6 und Art. 9 Grundlage verbindlich festlegen | Ja |
| Politische Positionen | 🟠 | Felder wie `publicPositions`, `riskTopics`, `opportunityTopics` und weitere Profilfelder existieren | Nutzung auf erforderliche und belegte Angaben begrenzen | Ja |
| Öffentliche Politiker Nennungen | 🟠 | `knowledge_objects` kann Namen öffentlich handelnder politischer Akteure speichern | Art. 9 und Art. 14 Behandlung klären | Ja |
| Privatpersonen | 🟢 technisch | Understanding Prompt verbietet Privatpersonen, Adressen, E Mails, Telefonnummern und private Personenprofile | Schutzregel beibehalten und später gezielt testen | Nein, sofern wirksam |
| Freie Texteingaben | 🟡 | Kommunikationsprompt bis 1200 Zeichen geht an `/api/communication/generate` und wird an die KI übergeben. Tagesinput speichert unter anderem Kontext, Ziel und gewünschte Vorbereitung. PR #824 nimmt diese Verarbeitung ausdrücklich in den App Datenschutzhinweis auf | Vor echten Kunden zusätzlich einen klaren Eingabehinweis und die Zweckbegrenzung in der Produktoberfläche festlegen | Ja bis Eingabegrenze geklärt |
| Datei Uploads | 🟢 | Keine aktuelle Produktfunktion gefunden | Nicht ohne neue Datenschutzprüfung hinzufügen | Nein |
| Eigene KI Trainings | 🟢 | Kein Fine Tuning oder eigenes Training mit Kundendaten gefunden | So beibehalten | Nein |
| Azure KI | 🟢 technisch / 🟡 Vertragsakte | Production ist auf `gpt-5-mini-eu` / `DataZoneStandard` umgestellt. Microsoft stellt für abonnierte Produkte eine aktuelle Product and Services DPA bereit; Azure kann vom Kunden auch für besonders geschützte Datenarten eingesetzt werden. DataZone verarbeitet Prompts und Antworten innerhalb der europäischen Datenzone. Der konkrete Kundenvertrag/Rechtsträger des bestehenden Azure-Abos ist hier noch nicht separat belegt | Azure Vertragsprofil und Rechtsträger einmal archivieren | Nein technisch; Vertragsakte vervollständigen |
| Direkte OpenAI API | 🟠 | Ein direkter OpenAI Production Schlüssel ist vorhanden. Azure hat im Code Vorrang | Vor echten Kunden entscheiden, ob der direkte Fallback vollständig entfernt wird | Ja |
| DeepSeek | 🟢 für Kundensicht | Kein DeepSeek Schlüssel in der aktuellen Vercel Production Konfiguration gefunden | Interne Regel: keine echten Kunden oder Production Personendaten an DeepSeek | Nein |
| Supabase | 🟢 technisch / 🟡 Vertragsakte | Organisation ist Pro; Production liegt in `eu-west-1` Irland. Der aktuelle Supabase DPA ist Bestandteil der Nutzungsvereinbarung, enthält EU Standardvertragsklauseln und erfasst auch besonders geschützte Datenarten | DPA Fassung und Unterauftragnehmerliste archivieren; Benachrichtigungen für Änderungen aktivieren | Nein für die DPA Grundlage; Rechtsgrundlage der konkreten Verarbeitung bleibt getrennt offen |
| Vercel | 🔴 Vertragsprüfung offen | Aktuelles Team ist Pro und der aktuelle Vercel DPA gilt für Pro. Der DPA schließt bestimmte besonders geschützte Datenarten in Customer Data aus. Helmut verarbeitet über die Vercel Runtime politische Profilfelder; deshalb muss vor echten Kunden geklärt werden, ob dieser Datenfluss mit dem Vertrag vereinbar ist | Schriftliche Klärung mit Vercel oder betroffenen Backend-Datenfluss aus Vercel herausnehmen | Ja |
| Push | 🟠 | Web Push mit VAPID ist vorhanden. Browser Push Dienste können beteiligt sein | Einwilligung, Empfänger und Drittlandprüfung festlegen | Ja, falls Push genutzt wird |
| Operator Alarm | 🟡 | CallMeBot und ein Monitoring Webhook sind technisch konfigurierbar, Production Schlüssel für CallMeBot sind vorhanden | Sicherstellen, dass keine Mandatsinhalte übertragen werden. Webhook Empfänger identifizieren | Ja |
| Mail Einladungen | 🟡 | Einladungscode existiert. Ein aktiver externer Mail Anbieter ist im aktuellen Production Env Inventar nicht belegt | Anbieter vor erster Einladung festlegen und datenschutzrechtlich aufnehmen | Ja |
| Session Cookie | 🟢 technisch | `helmut_session` ist HttpOnly und SameSite Lax, bei HTTPS Secure | Datenschutzhinweis korrekt beschreiben | Nein |
| Browser Speicher | 🟡 | App nutzt unter anderem localStorage für Push Status und sessionStorage für den Installationshinweis | TDDDG Bewertung je Speicherung dokumentieren | Vor Launch klären |
| Export | 🟢 technisch vorbereitet | `/api/privacy/export` existiert und hat Berechtigungsprüfungen | Vor Kunden reale Vollständigkeit erneut belegen | Ja |
| Löschung Profil | 🟢 technisch vorbereitet | `/api/privacy/delete` existiert und meldet Teilfehler ausdrücklich | Vor Kunden reale Vollständigkeit und Backup Behandlung belegen | Ja |
| Automatische Aufbewahrung | 🔴 | Retention Werkzeug und Fristvorschläge existieren, Ausführung ist in Production nicht aktiviert. Betreiberziel: personenbezogene technische Logs grundsätzlich höchstens 7 Tage, soweit kein dokumentierter zwingender Sicherheitszweck eine längere Frist rechtfertigt; danach löschen oder wirksam entpersonalisieren | Fristen je Logklasse technisch belegen, Provider-Retention gesondert prüfen und erst danach kontrolliert aktivieren | Ja |
| DSFA | 🔴 | Technische Vorprüfung sieht mehrere Risikokriterien | Pflicht verbindlich feststellen und falls nötig vollständige DSFA abschließen | Ja |
| Datenschutzbeauftragter | 🟠 | Noch keine verbindliche Entscheidung | Nach DSFA Entscheidung anhand Art. 37 DSGVO und § 38 BDSG verbindlich klären | Ja |
| Art. 14 Information und Datenherkunft | 🟠 | Daten über andere öffentlich handelnde Politiker stammen aus Drittquellen. Herkunft und konkrete Quelle sind für Helmut fachlich ohnehin zentral | Informationspflicht und mögliche Ausnahme samt Schutzmaßnahmen verbindlich klären; Herkunft so dokumentieren, dass sie bei Auskunft nachvollziehbar genannt werden kann | Ja |
| Strafrechtliche Angaben | 🟠 | Quellen und Source Safety Logik können Meldungen zu Strafverfahren und Vorwürfen erkennen. Das ist keine rechtliche Ausschlussregel | Art. 10 DSGVO ausdrücklich in die Rechtsprüfung aufnehmen | Ja |
| Weitere sensible Angaben | 🟠 | Quellen können theoretisch Gesundheitsdaten, Religion, Herkunft oder andere sensible Angaben enthalten | Technische Regel für nicht erforderliche private oder sensible Attribute prüfen | Ja |
| AV Verträge / DPAs | 🔴 wegen Vercel | Supabase und Microsoft haben aktuelle DPA Grundlagen; bei Azure muss der konkrete Kundenvertrag noch archiviert werden. Vercel Pro hat zwar einen bindenden DPA mit Standardvertragsklauseln, dessen aktueller Inhalt ist für Helmuts politischen Datenfluss aber klärungsbedürftig | Vercel schriftlich klären oder Datenpfad ändern; danach Vertragsakte vervollständigen | Ja |
| Datenpannen Prozess | 🟠 | Technische Logs und Security Maßnahmen existieren, formaler Meldeprozess ist nicht abschließend dokumentiert | 72 Stunden Prozess und Verantwortlichkeit festlegen | Ja |

## 4. Aktueller Datenfluss

### Website

Besucher ruft die Website auf → Vercel liefert Seite und lokal gehostete Schriften aus.

Der aktuelle Live Auftritt enthält keine gefundenen externen Marketing Tracker und keine Google Fonts. Das geladene Website Runtime Skript verwendet keinen gefundenen Cookie, localStorage oder sessionStorage Zugriff. Es ruft die eigene Seite technisch erneut ab.

Unabhängig davon verarbeitet der Hosting Dienst für die Bereitstellung technisch notwendige Verbindungsdaten. Deshalb darf die Website Datenschutzerklärung nicht pauschal behaupten, dass keinerlei personenbezogene Daten erhoben werden.

### Konto und Zugang

Betreiber legt Konto an → Einladung → Nutzer richtet Zugang ein → Session Cookie → App Zugriff.

Es gibt keine gefundene öffentliche Selbstregistrierung.

### Mandatsprofil

Nutzer beziehungsweise Betreiber hinterlegt Mandatsdaten → Profil wird in Helmut gespeichert → Profil steuert Quellen, Matching, Priorisierung und teilweise KI Prompts.

Das Profil kann politische Daten enthalten und ist deshalb rechtlich besonders sensibel.

### Öffentliche Quellen

Amtliche Seiten, DIP, RSS, Google News und weitere öffentliche politische Quellen → Helmut Abruf → Supabase → Knowledge Objects → Matching und Ausgabe.

Die aktuelle V3 Architektur ist auf minimierte Quelldaten ausgelegt. Ein historischer V2 Pfad mit weitergehenden Inhalten ist in den bestehenden Rechtsentwürfen als offene Prüfung markiert. Vor echten Kunden muss der tatsächlich wirksame Production Pfad nochmals gegen den aktuellen Code und Datenbestand geprüft werden.

### Freie Nutzereingaben

Es existieren mindestens drei relevante Eingabeflächen:

1. Freie Themenangabe im Onboarding
2. Tagesinput mit Titel, Datum, Kontext, Ziel und gewünschter Vorbereitung
3. Freier Kommunikationsprompt

Der Kommunikationsprompt wird serverseitig auf 1200 Zeichen begrenzt und an den KI Pfad übergeben. Nutzer könnten dort trotzdem personenbezogene oder vertrauliche Informationen eingeben. Das muss in Datenschutzhinweis, Zweckbegrenzung und Nutzerführung berücksichtigt werden.

### KI

Helmut → Azure KI → Antwort → Helmut Ausgabe beziehungsweise Speicherung.

Azure hat im aktuellen Code Vorrang. Ein direkter OpenAI Pfad existiert weiterhin als möglicher Fallback.

Microsoft dokumentiert aktuell, dass Prompts und Antworten bei Models sold by Azure nicht ohne ausdrückliche Erlaubnis zum Training generativer Basismodelle verwendet werden. Das ersetzt nicht die Prüfung von Auftragsverarbeitung, Verarbeitungsgeografie und Missbrauchsüberwachung.

Wichtig: Das aktuelle Deployment ist `GlobalStandard`. Der Standort der Azure Ressource in Sweden Central allein beweist deshalb keine ausschließlich europäische Verarbeitung von Prompts und Antworten.

## 5. Dienstleister und Empfänger

| Dienst | Rolle im System | Aktueller Stand | Pflicht vor echten Kunden |
|---|---|---|---|
| Vercel | Hosting, Functions, Logs | Aktiv | DPA, Logs, Region und Unterauftragnehmer dokumentieren |
| Supabase | Datenbank | Aktiv, Irland | DPA und Unterauftragnehmer dokumentieren |
| Microsoft Azure | KI Verarbeitung | Aktiv vorgesehen, Sweden Central Ressource, GlobalStandard Deployment | DPA, tatsächliche Verarbeitungsgeografie und Produktbedingungen dokumentieren |
| OpenAI direkt | Technischer Fallback | Production Schlüssel vorhanden | Entfernen oder rechtlich vollständig aufnehmen |
| Browser Push Dienste | Push Zustellung | Technisch vorhanden | Empfänger, Einwilligung und Drittlandprüfung |
| CallMeBot | Betreiber Alarm | Production Konfiguration vorhanden | Inhalt strikt technisch halten oder ersetzen |
| Monitoring Webhook | Betreiber Monitoring | Production Konfiguration vorhanden | Tatsächlichen Empfänger identifizieren und bewerten |
| Mail Anbieter | Einladungsversand | Code vorhanden, aktiver externer Anbieter nicht belegt | Vor erster echter Einladung festlegen |
| GitHub | Code und CI | Aktiv | Interne Dienstleisterliste und Zugriffsrisiko dokumentieren |
| DeepSeek | Entwicklung | Nicht in Helmut Production belegt | Keine echten Kunden oder Production Personendaten dorthin geben |

## 5a. Festgelegte Zielarchitektur für die KI Datenresidenz

**Entscheidung vom 05.10.2026:** Für Helmut soll der reguläre Kundenbetrieb nicht auf `GlobalStandard` verbleiben. Ziel ist `Data Zone Standard` für das bestehende Modell `gpt-5-mini`.

Microsoft dokumentiert:

* `GlobalStandard`: Prompts und Antworten können weltweit in unterstützten Azure Regionen verarbeitet werden.
* `Data Zone Standard`: Verarbeitung bleibt innerhalb der gewählten Datenzone. Für eine europäische Ressource ist dies die europäische Datenzone beziehungsweise Azure EU Data Boundary.
* `Standard/Regional`: Verarbeitung erfolgt in der Region des Deployments und ist damit noch enger.

Für das aktuell verwendete `gpt-5-mini` ist ein regionales Standard Deployment in `Sweden Central` verfügbar, nicht jedoch in `Germany West Central`. Ein strikt deutsches regionales Deployment mit demselben Modell ist nach dem Microsoft Verfügbarkeitsstand vom 05.10.2026 daher nicht möglich. Andere Modelle, beispielsweise `gpt-5.4`, sind regional in `Germany West Central` verfügbar, würden aber einen Modellwechsel und damit eine neue fachliche und kostenbezogene Abnahme erfordern.

**Pragmatisches Helmut Ziel:** `gpt-5-mini` behalten und von `GlobalStandard` auf `Data Zone Standard` umstellen. Die Subscription Kapazität ist inzwischen authentifiziert und rein lesend bestätigt: Prüfung vom 05.10.2026, 14:53 bis 14:55 Istanbul / 13:53 bis 13:55 Berlin / 11:53 bis 11:55 UTC. Aktuell bestehen 250 GlobalStandard Einheiten mit 250.000 TPM / 250 RPM. Für `DataZoneStandard` meldet Azure 670 verfügbare Einheiten; 250 Einheiten können die heutige Zuteilung vollständig spiegeln. Modell und Version bleiben `gpt-5-mini` / `2025-08-07`. Der Data Zone Deployment Vorgang ist inzwischen belegt: `gpt-5-mini-eu`, `DataZoneStandard`, `gpt-5-mini` Version `2025-08-07`, 250.000 TPM / 250 RPM, `NoAutoUpgrade`, Status `Succeeded`. Am 05.10.2026 folgte nach ausdrücklichem Betreiber GO genau ein synthetischer Foundry Playground Test ohne Websuche. Prompt: `Antworte exakt mit: OK`; Antwort: exakt `OK`; Oberfläche meldete etwa 1 Sekunde und 70 Tokens. Kein Retry. Das belegt die grundsätzliche Antwortfähigkeit des neuen Data Zone Deployments, nicht den vollständigen Helmut Production Pfad oder den 500er Nachweis. Die Production Umschaltung wurde am 05.10.2026 nach ausdrücklichem Betreiber GO durchgeführt: Vercel Production `AZURE_OPENAI_DEPLOYMENT` wurde auf `gpt-5-mini-eu` getrennt, Preview blieb auf dem bisherigen Wert. Anschließend wurde der live Production Build auf Commit `c82318e` neu bereitgestellt. Deployment `dpl_9Kxq57Bv5wGv3QfnUkAmmMgo4ZUs` ist `READY`, Region `fra1`, und `helmut-pilot.vercel.app` zeigt auf genau diesen Redeploy. Das belegt die Production Konfigurationsumschaltung. Zusätzlich meldete die laufende Production Runtime über `/api/ai/status` nach dem Redeploy `enabled: true`, `model: gpt-5-mini-eu`, `backend: azure-eu`. Damit ist belegt, dass der live Helmut Prozess die neue EU Bereitstellung geladen hat. Ein echter fachlicher Helmut KI Aufruf nach der Umschaltung ist davon getrennt und noch nicht ausgeführt.

Hinweis zur Formulierung in Rechtstexten: Microsoft beschreibt die europäische Datenzone im Zusammenhang mit der Azure EU Data Boundary. Die aktuelle Dokumentation weist darauf hin, dass diese Grenze je nach Dienst auch EFTA Regionen einbeziehen kann. Deshalb nicht pauschal „nur Deutschland“ oder ohne Vertragsprüfung „ausschließlich EU Mitgliedstaaten“ versprechen.

Offizielle Quellen:
* https://learn.microsoft.com/azure/ai-services/openai/how-to/deployment-types
* https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy
* https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability

## 6. Speicherorte und Verarbeitungsgeografie

| Bereich | Belegter Stand |
|---|---|
| Supabase Datenbank | `eu-west-1`, Irland |
| Vercel App Konfiguration | `fra1`, Frankfurt im Repository konfiguriert |
| Azure Ressource | Sweden Central |
| Azure Deployment | Aktuell `GlobalStandard`, 250 Einheiten = 250.000 TPM / 250 RPM. Für `DataZoneStandard` sind authentifiziert 670 Einheiten verfügbar; 250 Einheiten können die heutige Zuteilung spiegeln. Noch kein Data Zone Deployment angelegt |
| DeepSeek | Nicht Teil der aktuellen Helmut Production Laufzeit |
| Eigene Domain | `mithelmut.de` festgelegt, technische Verbindung noch nicht belegt |

## 7. Aufbewahrung und Löschung

Aktuell existiert eine technische Datenklassenmatrix mit Vorschlägen. Diese Fristen sind noch nicht rechtlich freigegeben.

| Datenklasse | Aktueller Vorschlag | Status |
|---|---:|---|
| Minimierte Quelldokumente | 180 Tage | Vorschlag |
| Politische Knowledge Objects | 365 Tage | Vorschlag |
| Technische Telemetrie | meist 90 Tage | Vorschlag |
| KI Kostenlogs | 365 Tage | Vorschlag |
| Briefings | 90 Tage | Vorschlag |
| Kundendaten nach Vertragsende | Export, danach zeitnahe Löschung | Rechtlich festzulegen |

Das Retention Werkzeug ist absichtlich nicht aktiv. Eine echte Production Löschung braucht eine gesonderte Freigabe und darf erst nach verbindlicher Festlegung der Fristen scharf geschaltet werden.

## 7a. Verbindliche Löschregel des Betreibers

**Betreiberentscheidung vom 06.10.2026:** Helmut verfolgt für kundenspezifische personenbezogene Daten eine Sofortlöschung. Sobald der Mandat sein Konto löscht oder ein berechtigter Löschantrag ausgeführt wird, werden die dem Mandat zugeordneten personenbezogenen Daten im aktiven System ohne künstliche Wartefrist hart gelöscht.

Das umfasst insbesondere Konto, Sessions, Passwort-/Einladungslinks, Zuweisungen, Tagesinputs, freie Texteingaben, Mandatsprofil, politische Profilangaben, Notizen, Briefings, Lage-Ausgaben, persönliche Radar-/Matching-Daten, Kommunikationsentwürfe, Push-Abonnements und Push-Ereignisse, mandatsbezogene KI-/Kostenmetadaten, Audit-Ereignisse mit Mandatsbezug, Scheduler-Spuren sowie abgeleitete Personalisierungsdaten.

**Kein Soft-Delete-Fenster als Standard.** Ein früher dokumentiertes 30-Tage-Löschfenster ist für Helmut verworfen. Ein Export darf angeboten werden, ist aber keine Voraussetzung für die Löschung und darf sie nicht verzögern.

**Geteilte öffentliche Quellen:** Global gemeinsam genutzte politische Quellen und mandantenlose Wissensobjekte werden nicht allein wegen der Löschung eines einzelnen Mandats entfernt, sofern sie einen eigenständigen, nicht kundenspezifischen Zweck haben. Sämtliche kundenspezifischen Zuordnungen, Ableitungen und Personalisierungen müssen jedoch entfernt werden. Eigene Personenquellen oder explizit dem Mandat gehörende Rohdaten sind Teil der Löschung.

**Gesetzliche Aufbewahrung:** Daten, die unabhängig vom Produkt aufgrund zwingender gesetzlicher Pflichten weiter aufzubewahren sind, werden vom Helmut-Kundenprofil getrennt, gesperrt und nicht weiter für Produktzwecke verwendet. Eine solche Pflicht darf nicht als Grund dienen, politische Produktdaten pauschal länger zu speichern.

**Backups:** Die aktive Datenbasis wird sofort bereinigt. Bereits bestehende unveränderliche Sicherungskopien dürfen nur bis zum technisch notwendigen, möglichst kurzen Ablauf der jeweiligen Backup-Rotation fortbestehen. Bei jeder Wiederherstellung eines älteren Backups müssen bereits ausgeführte Löschungen vor Wiederaufnahme des Betriebs erneut angewendet werden. Backup-Rotation und Wiederherstellungs-Löschjournal sind noch technisch zu belegen.

**Technischer Ist-Stand:** `/api/privacy/delete` löscht bereits den mandatsbezogenen Blob-/Profilbestand, V3-Nutzertabellen und Auth-Daten. Der Auth-Löscher umfasst Konten, Sessions, Zuweisungen, Tagesinputs, Audit-Ereignisse, KI-Nutzungsdaten und Passworttokens und führt eine Verifikationslesung mit begrenztem Wiederholungsversuch durch. V3-Teilfehler führen zu `ok=false`; es darf kein Erfolg gemeldet werden, solange bekannte Reste verbleiben. **Noch zu schließen:** `systemErrors` kann eine `userId` tragen und ist im aktuellen Auth-Löscher nicht als Löschklasse sichtbar. Außerdem schreibt `/api/privacy/delete` nach dem Löschvorgang derzeit erneut ein Audit-Ereignis mit `politicianId` und IP. Für die Sofortlöschregel darf danach höchstens eine inhaltsfreie, nicht auf eine Person rückführbare Löschquittung verbleiben. Vor regulärem Kundenbetrieb ist eine vollständige Gegenprüfung gegen alle aktuellen Speicherorte und Backup-Wege Pflicht.

## 7b. Kurze Aufbewahrung personenbezogener technischer Logs

**Betreiberentscheidung vom 06.10.2026:** Für personenbezogene technische Logs gilt als Ziel grundsätzlich **höchstens 7 Tage**, sofern kein konkret dokumentierter zwingender Sicherheits-, Missbrauchsabwehr- oder Rechtszweck eine längere Aufbewahrung erforderlich macht. Danach werden personenbezogene Anteile gelöscht oder so entpersonalisiert, dass keine Zuordnung zu einer Person oder einem Mandat mehr möglich ist.

Die 7 Tage sind eine interne Datenminimierungsentscheidung und **keine pauschal gesetzlich vorgeschriebene Frist**. Für jede Logklasse sind Zweck, tatsächlicher Speicherort, wirksame Provider-Retention und gegebenenfalls eine begründete Abweichung gesondert zu dokumentieren. Externe Provider-Logs, deren Frist Helmut nicht selbst steuern kann, müssen auf die kürzest verfügbare geeignete Einstellung geprüft und transparent dokumentiert werden.

## 8. Rechte betroffener Personen

Technisch vorhanden:

1. Profildatenexport
2. Profilbezogene Löschung
3. Berechtigungsprüfung für Export und Löschung
4. Teilfehler werden nicht als vollständiger Löscherfolg ausgegeben

Vor echten Kunden noch erforderlich:

1. Reale Vollständigkeit des Exports belegen
2. Bei Auskunft auch die Herkunft personenbezogener Daten nachvollziehbar nennen können, soweit die Daten nicht direkt bei der betroffenen Person erhoben wurden
3. Reale Vollständigkeit der Löschung belegen
4. Berichtigung als Prozess definieren
5. Umgang mit Backups und Dienstleistern definieren
6. Anfrageweg für öffentlich erwähnte politische Personen definieren
7. Fristen und Identitätsprüfung dokumentieren
8. Beschwerderecht vollständig erläutern: Beschwerde bei einer zuständigen Datenschutzaufsichtsbehörde ermöglichen; neben der für den Verantwortlichen zuständigen Berliner Behörde kommen nach den gesetzlichen Voraussetzungen insbesondere Behörden am gewöhnlichen Aufenthaltsort oder Arbeitsplatz der betroffenen Person in Betracht

## 9. Rechtliche Kernfragen für die spätere Fachprüfung

Diese Punkte werden nicht durch diese Akte entschieden:

1. Welche Rechtsgrundlage nach Art. 6 DSGVO trägt jede konkrete Verarbeitung?
2. Welche Ausnahme nach Art. 9 Abs. 2 DSGVO trägt politische Profildaten und Daten über andere Politiker?
3. Welche Daten gelten tatsächlich als von der betroffenen Person offenkundig öffentlich gemacht?
4. Wie wird Art. 14 DSGVO für Daten aus öffentlichen Drittquellen erfüllt, und wie wird die konkrete Datenherkunft für Information und Auskunft dauerhaft nachvollziehbar gehalten?
5. Ist eine Datenschutz Folgenabschätzung verpflichtend? Die technische Vorprüfung spricht deutlich dafür, dies verbindlich zu klären.
6. Falls eine DSFA verpflichtend ist, folgt daraus nach § 38 BDSG eine Pflicht zur Benennung eines Datenschutzbeauftragten?
7. Welche Verarbeitung fällt unter Art. 10 DSGVO, insbesondere bei Meldungen über Straftaten, Ermittlungen oder Vorwürfe?
8. Welche konkreten Aufbewahrungsfristen sind notwendig und verhältnismäßig?
9. Welche Dienstleister benötigen einen AV Vertrag und welche Drittlandmechanismen sind erforderlich?
10. Welche Anforderungen entstehen bei parlamentarischen Büros oder öffentlichen Stellen als Kunden?

## 10. Produktregeln für Datenschutz by Design

Bis zur späteren Rechtsfreigabe gelten als Zielregeln:

1. Nur für die öffentliche politische Tätigkeit notwendige Informationen verarbeiten.
2. Keine privaten Adressen, Telefonnummern, privaten Kontaktdaten oder privaten Personenprofile über Dritte.
3. Keine sensiblen privaten Eigenschaften aus politischer Zugehörigkeit oder anderen Indizien ableiten.
4. Keine politischen Positionen aus bloßer Parteimitgliedschaft erfinden.
5. Angaben über andere Personen nur quellenbelegt und mit nachvollziehbarer Herkunft; die Herkunft muss für Information und Auskunft abrufbar bleiben.
6. Freie Nutzereingaben als potenziell personenbezogen und vertraulich behandeln.
7. Keine echten Kunden oder Production Personendaten an DeepSeek geben.
8. Keine neuen Tracker, Upload Funktionen oder externen Datenempfänger ohne neue Datenschutzprüfung.
9. Eine fehlende Rechtsfreigabe nie durch eine technische Prüfung ersetzen.
10. Datenschutzänderungen vor dem ersten echten Kunden gegen den dann aktuellen Production Stand prüfen.

## 11. Reihenfolge ab jetzt

### Parallel zum synthetischen 500er Nachweis

1. Diese Masterakte als Arbeitswahrheit pflegen.
2. Domain technisch anbinden, sobald vom Betreiber gewünscht.
3. Website Datenschutzerklärung ist seit 06.10.2026 korrigiert und live geprüft.
4. App Datenschutzerklärung ist mit PR #824 in Production ausgerollt und live geprüft; technische Aktualität des Rechtstextes ist belegt.
5. Dienstleister und Verträge vollständig inventarisieren.
6. Verbindliche Löschfristen vorbereiten, aber Retention noch nicht scharf schalten.
7. Vollständige DSFA Vorlage und Art. 14 Information vorbereiten.

### Vor dem ersten echten Kunden

1. Tatsächlichen Production Datenfluss frisch prüfen.
2. Azure Verarbeitungsgeografie verbindlich klären.
3. Direkten OpenAI Fallback entscheiden.
4. AV Verträge abschließen und dokumentieren.
5. Rechtsgrundlagen nach Art. 6, Art. 9 und gegebenenfalls Art. 10 verbindlich festlegen.
6. Art. 14 Prozess festlegen.
7. DSFA Pflicht entscheiden und erforderliche DSFA abschließen.
8. Pflicht zum Datenschutzbeauftragten entscheiden.
9. Löschfristen freigeben und technisch umsetzen.
10. Website und App Rechtstexte finalisieren.
11. Gezielt durch spezialisierten Anwalt oder qualifizierte Datenschutzstelle prüfen lassen.

## 12. Bestehende Detailunterlagen

Diese Akte ersetzt die folgenden Fachunterlagen nicht:

* [DSGVO Checkliste](../dsgvo-checklist.md)
* [Datenfluss und Dienstleister](datenfluss-dienstleister-avv.md)
* [Technische DSFA Vorprüfung](datenschutz-folgenabschaetzung-vorpruefung.md)
* [TOMs, Löschkonzept und VVT Entwurf](toms-loeschkonzept-vvt-entwurf.md)
* [Anwaltsfragen und Pilotvereinbarung](anwaltsfragen-und-pilotvereinbarung-entwurf.md)
* [Aufbewahrung und Löschung](../betrieb/aufbewahrung-loeschung.md)
* [OP 02 und OP 03](../datenmotor-restliste.md)
* [500er Roadmap Datenschutzphase](../ROADMAP_BIS_500.md)

## 13. Technische Primärbelege im Repository

Wichtige Stellen für spätere Neuprüfung:

* `server.js` für Routen, Kommunikation und Privacy Endpunkte
* `client.js` für Eingaben, Push und Privacy Oberfläche
* `lib/helmut/ai.js` für KI Datenfluss
* `lib/helmut/understanding.js` und `lib/helmut/understanding-schema.js` für Personenschutz
* `lib/helmut/auth.js` und `lib/helmut/accounts.js` für Konto, Session und personenbezogene Daten
* `lib/helmut/retention.js` für Aufbewahrungsmatrix
* `supabase/schema.sql` für Datenmodell
* `vercel.json` für Vercel Region und Laufzeitkonfiguration

## 14. Offizielle Rechtsquellen für die Fachprüfung

* DSGVO Art. 9, Art. 14 und Art. 35: https://eur-lex.europa.eu/eli/reg/2016/679/oj
* BDSG § 38: https://www.gesetze-im-internet.de/bdsg_2018/__38.html
* TDDDG § 25: https://www.gesetze-im-internet.de/ttdsg/__25.html
* Microsoft Foundry Datenschutz: https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy

## 15. Abgrenzung

Diese Datei dokumentiert den Arbeitsstand. Sie ist weder Rechtsgutachten noch Freigabe für reale personenbezogene Profile, Retention Aktivierung, Production Änderungen, neue Dienstleister oder vertrauliche Kundendaten.
