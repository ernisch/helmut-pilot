# Erster zahlender Bundestagskunde: Abschluss und Entscheidungen für Thread F

Stand: 17.11.2026. Basis `main 2023dfd55702374caca153b4b81dc3beb140b1dd`.
**Arbeits- und Entscheidungsvorlage, keine Verkaufs- oder Rechtsfreigabe.**
Kanonisches Rechtsregister bleibt [#1211](https://github.com/ernisch/helmut-pilot/issues/1211).
Koordination und Dateireservierung: [#1218](https://github.com/ernisch/helmut-pilot/issues/1218).
Der bestehende Zehn-Aufgabenplan wurde von D dort in
[Kommentar 6951888895](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6951888895)
zugänglich gemacht: F bearbeitet 1 (Anbieter/DSFA/Rollen/Verträge), 2 (konkrete
Quellenrechte), 7 (vorhandene Löschtechnik); 9/10 nur anhand vorhandener Lesebelege.
Gemeinsamer Status und Integration bleiben bei D. D/E-Dateien wurden nicht geändert.

## 1. Erledigte Arbeit und belastbare Grenzen

| Aufgabe | Ergebnis in diesem Auftrag | Verbleibende Abschlussbedingung |
| --- | --- | --- |
| 1 | Anbieterantworten im Original gegengelesen; vorhandene Ergebnisse übernommen; aktuelle Empfängerwege und widersprüchliche Altdokumente abgegrenzt; Entscheidungen unten konkret vorbereitet | Inhaltliche Anbieterklärungen, konkreter Verantwortlicher, Rechtsgrundlagen und formeller DSFA-Entscheid |
| 2 | Tatsächlich erforderliche Pilot-Quellenfamilien nach bestehendem Nutzungsumfang eingegrenzt; keine neue Nutzung freigegeben | Offene Text-/Archivnutzungen einzeln beurteilen; E bleibt für ungeklärte neue Textwege inaktiv |
| 7 | Rein lokalen Planer konservativ abgesichert; vorhandene Fristen und Ausführungssperre erhalten; Vollzugsgrenzen erfasst | Freigegebene Fristen, vollständiger Vollzugs-/Wiederherstellungsvertrag und gesonderte Ausführungsfreigabe |
| Vorprüfung 9/10 | Existierende Auth-, Quellen- und Anzeige-Nachweise eingeordnet | Autorisierter echter Kunden-/Fachabnahmedurchlauf; kein solcher Lauf durch F behauptet |

Keine neuen Anbieteranfragen, Vertragsänderungen, Kundenkonten, Quellenfenster,
bezahlten Aufrufe, Migrationen, Production-Löschungen oder Lasttests.
Die technische Planeränderung allein schließt Aufgabe 7 nicht als Löschvollzug ab.

## 2. Anbieter: vorhandene Antworten und exakte Entscheidungen

Rein lesender Gmail-Abgleich am 17.11.2026: bestehende Vercel-, Supabase- und
dogado-Vorgänge gelesen; zusätzlich eingegangene Anbietermails seit 15.11.
gesucht. Keine neue inhaltliche Antwort auf die noch offenen Vertragsfragen.
Automatische Eingangsbestätigungen sind keine Zustimmung. Keine Nachrichten versandt.
Die privaten Originalmails werden nicht in dieses öffentliche Repository kopiert.

| Dienst / tatsächlich belegter Zweck | Bereits erledigt, nicht erneut anfragen | Fehlender Beleg / konkrete Entscheidung / zuständige Stelle |
| --- | --- | --- |
| Vercel: App, Functions, Auslieferung und Betriebslogs | DPA Schedule 1 Nr. 6 identifiziert; letzte konkrete Nachfrage 15.11. im bestehenden Vorgang; `vercel.json` nennt `fra1` | **V1:** Vercel Privacy/Legal muss die Zulässigkeit politischer personenbezogener Customer Data für den wirklich gebuchten Vertrag bestätigen oder den zulässigen engeren Datenweg verbindlich benennen. Betreiber ordnet Antwort, DPA-Version und Tarif ein; Rechtsberatung bewertet. Region allein beseitigt die Klausel nicht. Kein Anbieterwechsel beauftragt. |
| Supabase Pro: Postgres einschließlich app-eigener Konto-/Mandatsdaten und Quellenbestände | Originalantwort 16.11., 08:59 UTC bestätigt automatische DPA-Einbeziehung seit 01.08., Art.-9-Verarbeitungsumfang und keinen Pro-spezifischen RLS-Zwang bei sicherer serverseitiger Mandantentrennung | **S1:** Privacy/Legal-Antwort auf bereits versandte Rückfrage 16.11.: verlangt §4(d) ausdrücklich Einwilligungen auch bei anderer tragfähiger Art.-9-Ausnahme? Anlage 3 statt irrtümlichem Anlage-2-Verweis bestätigen. **S2:** Erasure einzelner Personen aus intern länger gehaltenen Sicherungen, Zugriffssperre, Ablauf und Wiederherstellung ohne Wiederbelebung gelöschter Daten verbindlich klären. |
| Supabase: Backups/Logs/Support/ggf. CDN | Laut derselben Antwort Primärdaten/übliche Sicherungen in gewählter Region Irland; Supportzugriffe und Logs/Telemetrie ggf. außerhalb; CDN ggf. global | **S3:** Betreiber/Rechtsberatung dokumentieren tatsächlich genutzte Unterauftragsverarbeiter, Transfers und Schutzmaßnahmen. **Sieben Tage Pro-Abruffenster sind keine Höchstlöschfrist:** ältere Backups laut Support ohne festen Löschplan bei aktivem Projekt; Logs ein Jahr; Backup-/WAL-Löschung bis fünf Tage **nach Kontolöschung**, keine entsprechende Zusage für einzelne Nutzer. Kein 30-Tage-Versprechen daraus ableiten. |
| Microsoft Azure OpenAI: politische Profil-/Vorgangsdaten und beauftragte Entwürfe | Allgemeine Microsoft-DPA-Abdeckung und Ausschluss von Basismodelltraining ohne Zustimmung laut in #1211 übermittelter Portalassistentenauskunft; vorhandener Betriebsvertrag bindet Azure / `gpt-5-mini-eu` | **A1:** Betreiber stellt zum konkreten Tenant/Vertrag passende DPA/Produktbedingungen und Beleg der tatsächlich verwendeten SKU/Datenzone bereit; Missbrauchsmonitoring, eventuelle Inhaltsaufbewahrung und Supportzugriff mitbewerten. Rechtsberatung ordnet Art. 6/9 und Transfers zu. „Kein Training“ bedeutet keine Nullspeicherung. Historisches `GlobalStandard` und Ressourcenstandort nicht mit aktueller Inferenzregion verwechseln. |
| dogado/Tophoster: vorhandenes Postfach für Einladungen/Passwortreset, Domain | AVV-Vorgang vom 31.10.; konkrete Nachfrage 15.11. bereits versandt; bestehender SMTP-Weg dokumentiert | **M1:** Bestehenden AVV samt Vertragsgesellschaft, eingeschlossenem Postfach, Unterauftragnehmern, Sicherheits-/Lösch-/Logfristen und Transfers zuordnen. E-Mail-Adresse und einmaliger Zugangslink sind personenbezogene/sicherheitsrelevante Daten. Kein neues Postfach, keine weitere Nachfrage. |
| GitHub: öffentliches Repo, CI und vorhandene Betriebsautomation | Code/Workflowbelege vorhanden; Produktionsinhalte gehören nicht in Issues/Logs | **G1:** Betreiber ordnet Vereinbarung/Rolle, CI-Log-/Artefaktfristen und tatsächlich dort verwendete Betriebsdaten im VVT zu. Keine Mandatsinhalte oder Mailoriginale als Reviewbeleg veröffentlichen. |
| Google News / tatsächliche Originalhosts | Bestehende Such-/Abrufwege sind belegt; Originalanbieter und Aggregator unterscheiden | **Q1:** Reale Suchparameter, öffentliche personenbezogene Daten, Nutzungsbedingungen und etwaige Transfer-/Verantwortlichenrollen in VVT/DSFA einbeziehen. RSS/Erreichbarkeit sind keine Textlizenz. |
| Push (Browserdienst), CallMeBot/WhatsApp, Monitoring, optionale Transporte | Vorhandener Kommunikationsriegel sperrt diese im dokumentierten Einprofilbetrieb; gesonderte Ausnahme nur für reale Zugangsmails | **K1:** Nicht als heute bestätigte zusätzliche Inhaltsübermittlung ausgeben. Vor späterer Nutzung tatsächlichen Empfänger, Payload, Vertragsrolle, Transfers und Löschung bewerten. Code kann bei Push politische Titel/Handlungen transportieren; Altsatz „nur Trigger, ohne Inhalt“ ist keine sichere allgemeine Beschreibung. Bestehende Subscription-Daten bleiben unabhängig vom Versand zu betrachten. |
| OpenAI-Direktpfad, Resend, Supabase Auth/Storage, weitere Sicherungsspeicher | Codevorhandensein oder allgemeine Anbieter-DPA belegt keinen aktiven Kundenweg. App-Konten liegen laut bestehender Architektur im eigenen Auth-Store, nicht automatisch in Supabase Auth | **K2:** Nur tatsächliche Nutzung inventarisieren; nicht pauschal neue Verträge/Integrationen anlegen. Direkter OpenAI-Codepfad und andere konfigurierte Sonderwege müssen vor Kundenfreigabe entweder nachweislich ungenutzt oder als eigener Empfänger bewertet sein. Entwicklungsdienste getrennt von Production-Kundendaten behandeln. |

**Frischer begrenzter Plattformbeleg 17.11., 15:04 UTC:** Vercel-Projekt
`helmut-pilot` nennt Productiondeployment `dpl_EFj3Ci2WjP9ZmByeGb8wpcaxyv9z`
als READY. `filter_project_envs(decrypt=false)` bestätigt für Production lesbar
`HELMUT_MAIL_TRANSPORT=smtp`, `HELMUT_ZUGANGSMAILS_FREIGEGEBEN=1` und die Existenz
eines sensitiven SMTP-Passworts; kein Passwort entschlüsselt. Die Antwort ist
ausdrücklich gekürzt; aus fehlenden/gekürzten Schlüsseln folgt **keine Abwesenheit**
weiterer Dienste oder Flags. Der Team-Metadatenabruf nennt keinen Tarif.
Konfiguration/READY ersetzen keinen aktuellen Versand-, Regions- oder Laufzeitnachweis.

Primärverweise: [Vercel DPA](https://vercel.com/legal/dpa),
[Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum),
[Unterauftragsverarbeiter](https://supabase.com/legal/customer-resources/subprocessor-list),
[Datenregion/Transfers](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq),
[Microsoft Datenverarbeitung](https://learn.microsoft.com/azure/ai-foundry/responsible-ai/openai/data-privacy).
Diese vorhandenen Belege wurden nicht durch neue identische Vertragsprüfungen ersetzt.

## 3. Vertragsunterlagen, Verantwortlichkeiten und DSFA

Das Register nennt Rechtspaket v0.5 mit 19 Markdown-Dateien als Gesprächsanlage,
**nicht** als eingecheckten oder unterschriebenen Vertragsbestand. Es liegt in
dieser Sitzung nicht vor. Gezielte Repo-/Drive-Suche nach Rechtspaket bzw.
Rechts-/Fertigstellungsunterlagen fand keine zugängliche Kopie. Sein vollständiger
Inhalt und die zehn DSFA-Risikoszenarien wurden deshalb nicht als geprüft bestätigt
oder neu erfunden. Betreiber stellt die vorhandene Originalfassung der
Rechtsberatung bereit; keine Veröffentlichung privater Unterlagen erforderlich.

Der Erstkäufer bleibt nach ausdrücklicher Betreiberentscheidung in #1211 unbekannt.
Keine erneute Käuferfestlegung vor realem Interesse verlangen. Dann sind diese
Entscheidungen am konkreten Vertrag zu schließen:

| Entscheidungsblatt | Benötigter konkreter Eintrag | Verantwortlich / Freigabebeleg |
| --- | --- | --- |
| R1 Vertragspartner | Natürliche Mandatsperson **oder** genau rechtsfähige Institution; Zeichnungsberechtigung, Rechnungsadressat, Vertragszweck/Verbraucherstatus, Preis/Steuer/Rechnungsweg | Betreiber beschafft Fakten; Rechtsberatung wählt geprüfte vorhandene Variante; datierte Annahme/Unterschrift |
| R2 Datenrollen | Zwecke und wesentliche Mittel für Konten/Abrechnung, globale Quellenauswertung sowie kundengesteuerte Eingaben einzeln zuordnen; echte Weisungsbindung und erforderliche AVV prüfen | Tatsächlicher Verantwortlicher; Art. 28/26 nicht aus Überschrift ableiten; Büro nicht automatisch eigener Rechtsträger |
| R3 Art. 6 und 9 | Je Verarbeitung getrennte Grundlage: Kontoverwaltung, eigenes politisches Profil/Positionen, freie Bürotexte, öffentliche Politiker, andere Dritte und globale Analysen; Art. 9(2)-Ausnahme konkret nachweisen | Verantwortlicher mit Rechtsberatung; Kundensignatur legitimiert keine fremden Daten; Öffentlichkeit allein und parlamentarische Tätigkeit sind keine pauschale Befreiung |
| R4 DSFA/DSB | Vorhandene DSFA-Arbeitsfassung an reale Datenwege anpassen; Erforderlichkeit/Verhältnismäßigkeit, technische Maßnahmen und Restrisiko je Szenario bewerten; DSB-Pflicht prüfen | Verantwortlicher zeichnet Entscheidung mit Datum/Version; DSB-Beteiligung dokumentieren; bei verbleibendem hohem Risiko Erfordernis von Art. 36 entscheiden |
| R5 VVT/TOMs/Rechte | Tatsächliche Empfänger, Quellen-/Originalarchive, Konten, Ausgaben, Logs, Backups, Zuständigkeit für Auskunft/Berichtigung/Löschung und 72h-Pannenprozess eintragen | Betreiber führt Istnachweise; Verantwortlicher/Rechtsberatung geben richtige Endfassung frei |
| R6 Veröffentlichung | Vertrag, Datenschutzhinweis, ggf. AVV und Leistungsbeschreibung gegen erlaubte Quellen, Einschränkungen und belegte Löschung abgleichen | Keine Veröffentlichung/Unterschrift von F; keine uneingeschränkte Vollständigkeits-, EU-exklusiv- oder Löschgarantie |

**Notwendige Korrekturen für die vorhandenen Entwürfe, ohne ihre Bedingungen umzuschreiben:**

- [DSFA-Vorprüfung](datenschutz-folgenabschaetzung-vorpruefung.md) stammt aus Juli:
  Profilfreitexte gehen heute nach `ai.js:publicProfile()` in KI-Prompts; RLS wird
  durch serverseitige `service_role` umgangen. „Keine Profilübertragung“ und
  wirksame DB-Mandantentrennung dürfen nicht übernommen werden.
- [Datenflussentwurf](datenfluss-dienstleister-avv.md) und
  [TOMs/VVT](toms-loeschkonzept-vvt-entwurf.md) enthalten alte Mengen, Free-Plan-,
  Volltext-/240-Zeichen- und Backupannahmen. `roh-quellenstaende.js` speichert
  gebundene Originalstände in zusätzlichen globalen `helmut_store`-Zeilen;
  aktuelle enge lizenzierte Auszüge überschreiten teilweise 240 Zeichen.
  Das tatsächliche Archiv und seine Rechts-/Löschgrenzen gehören in DSFA/VVT.
- Die [alte Pilotvereinbarung](anwaltsfragen-und-pilotvereinbarung-entwurf.md)
  ist unentgeltlich und nennt 14 Tage; sie ist kein Vertrag für den zahlenden Kunden.
  Das 30-Tage-Arbeitsziel ist ebenfalls keine heute technisch belegte Garantie.
- [App-Datenschutzhinweis](../../server.js) beschreibt noch offene Fristen bereits;
  die SMTP-Zugangsmail ist als tatsächlicher zusätzlicher Empfängerweg einzubeziehen.
  Die verbleibende Du-Ansprache dort und auftragsgerechte KI-Transparenz gehören
  vor Veröffentlichung in Ds gemeinsamen Oberflächen-/Abnahmeweg.

## 4. Quellenrechte für den konkreten Bundestagspiloten

Bedarf und Originale: [Quellenbedarf vom 17.11.](../betrieb/quellenbedarf-20261117.md),
[unabhängige Abnahme C](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6949411072).
Die bereits abgeschlossenen DIP-/Destatis-/Attributionsprüfungen aus PR1249–1251
werden nicht wiederholt. Katalogflags und ein Betreiber-GO sind keine Fremdlizenz.

| Benötigte Quelle / Inhalt | Bereits belegter enger Umfang | Noch benötigte Entscheidung |
| --- | --- | --- |
| DIP: Bundestagsvorgänge, Drucksachen/Plenarprotokolle | Kommerzielle Datenweiterverarbeitung nach konkreten DIP-Bedingungen mit Herkunft, Änderungskennzeichnung und Hinweis/Link auf kostenlose Originaldaten; ausdrücklich belegter §5-Umfang für Drucksachen/Plenarprotokolle | Dokumentart/-nummer korrekt halten; Drittrechte und Veränderungen beachten; keine allgemeine Lizenz für sämtliche Bundestagswebtexte daraus ableiten |
| Arbeit/Soziales, Wirtschaft/Energie, Digitales/Staatsmodernisierung; Plenum und öffentlicher Sitzungskalender | Amtliche Originalverweise/Fassungen im Quellenbedarf; E bereitet getrennten inaktiven Aufnahmeweg vor | **Q2:** Rechtsberatung beurteilt getrennt Tatsachenextraktion (Termin, TOP-/Drucksachenkennungen, Frist), wörtliche Auszüge, Zwischenspeicherung/Originalarchiv und Kundenauslieferung für die dort exakt verlinkten PDF/HTML/ICS-Originale. Nichtöffentliche Sitzungsinhalte bleiben ausgeschlossen. Keine pauschale §5-Zustimmung; kein Aktivieren durch F. |
| Ressorts einschließlich BMAS/BMG und weiterer tatsächlich zuständiger Ministerien | Vorhandene echte BMAS-Inhalts- und BMG-Metadatenbelege; vollständige Versorgung bleibt unbelegt | **Q3:** Konkret benötigte Originaltexte gegen deren eigene Nutzungsbedingungen/Drittrechte prüfen. Amtlicher Host und erfolgreiche Verarbeitung allein tragen keine Textlizenz. Fehlt ein erforderlicher Inhalt, ist das zusätzlich eine fachliche Lücke. |
| Destatis: Wirtschafts-/ggf. Digitalstatistik | Bereits belegte allgemeine Copyrightbedingungen plus enge Betreiberfreigabe für exakten RSS-Auszug, Herkunft/Datum/Original; keine Bilder/Volltexte/GENESIS-Übertragung | Keine offene erneute allgemeine Anfrage; abweichende Einzelrechte sperren. Digitalpaketzuordnung beweist keinen tatsächlich einschlägigen aktuellen Digitalartikel. |
| iRights: nötige Digitalfachinhalte | Nur einzeln belegter CC-BY-4.0-Text; Autor/Titel/OERinfo-Ursprung/Lizenzlink/Bearbeitungshinweis vollständig erhalten | Ungeprüfte Nachbarartikel bleiben Titel/Link. Aktuelle echte Attribution bis Kundenansicht gehört in Abnahme 9/10. |
| EUR-Lex | CC0 nur Metadaten; separat belegter enger deutscher COM-/OJ-L-Originalabsatzvertrag mit Versions-/Datums-/Urheber-/Hashbindung | Keine Übertragung auf Fremdwerke, Anhänge, Bilder, beliebige Fassungen oder Volltexte. CELLAR-Metadaten und WAF-Erreichbarkeit sind kein neuer Textnachweis. |
| Bundespuls | Bereits belegter Titel-/Linkumfang mit DIP-Hinweisen; privater Aggregator, keine zweite unabhängige Bestätigung | Keine Feedbeschreibungen oder weitergehende Textfreigabe; `aktualisiert` ist kein Publikationsdatum. |
| Partei/Fraktion, Region und journalistische Originale | Konkreter Pilotbedarf kann bestehen; RSS/Google-Suche/öffentliches Archiv begründen keine generelle kommerzielle Lizenz | **Q4:** Je tatsächlich benötigtem Artikel Quelle/URL/Fassung, Textumfang, Speicherung, KI-Auswertung und Auslieferung getrennt zuordnen. §44b-TDM ersetzt keine Auslieferungserlaubnis; §51 verlangt echten Zitatzweck; Presseverlegerschutz/Nutzungsvorbehalte gesondert. Kein Ausbau und keine pauschale 240-Zeichen-Freigrenze. |

Bestehende Primärbelege: [Bundestag Open Data](https://www.bundestag.de/services/opendata),
[Impressum](https://www.bundestag.de/services/impressum),
[DIP/EUR-Lex/Bundespuls](../quellenarchitektur/48-dip-eurlex-bundespuls.md),
[Destatis](../betrieb/destatis-wirtschaft-vorbereitung-20261115.md),
[iRights](../betrieb/irights-digital-vorbereitung-20261115.md),
[ausgeführte enge Freigabe](../betrieb/quellen-einbindung-freigabe-20261115.md),
[EUR-Lex-Originalgrenzen](../betrieb/quellen-dauerbetrieb-20261115.md).
Die sieben amtlichen Tagesordnungsfassungen samt Nummern-/Zeitkonflikten bleiben
bei E/D unverändert belegt; Rechtsklärung beseitigt keinen Inhaltswiderspruch.

## 5. Löschung: bestehende Regeln, Prüfung und offene Vollzugsabnahme

| Datenbestand | Verbindlicher Stand / Entwurfsunterschied | Fehlender Abschluss |
| --- | --- | --- |
| Kundengebundene Konto-/Mandatsdaten und Ausgaben | Kontobezogene Löschung/Export existieren; Admin-Kontolöschung und vollständige Mandatslöschung sind verschiedene Operationen. 14/30 Tage stehen in verschiedenen Arbeitsentwürfen | **L1:** Verantwortlicher legt Frist, auslösendes Ereignis, Ausnahmen und Bestätigung fest. Keine automatische Vertragsend-TTL oder vollständige Live-Löschung behaupten. |
| Globale Rohquellen und KOs | 180/365 Tage ausdrücklich technische Empfehlung; referenzierte Originale werden länger benötigt; kein automatischer Vollzug freigegeben | **L2:** Zweck, Rechtsgrundlage und Höchstdauer je Klasse verbindlich entscheiden, einschließlich öffentlicher personenbezogener Daten. Referenzschutz ist kein unbegrenzter Aufbewahrungsgrund. |
| Original-/Versionsarchive, referenzierte Belege und Ableitungen | Zusätzliche Archivzeilen sind nicht automatisch durch den Plan für `raw_documents`/`knowledge_objects` entfernt; Unveränderlichkeit bedeutet keine rechtliche Unlöschbarkeit | **L3:** Frist/Erasure über Ableitung und Original, zulässige Einschränkung/gesetzliche Ausnahmen, Betroffenenidentifikation und Umgang mit erhaltenen Zitaten definieren; dann gezielte vollständige Technikabnahme. |
| Lokale Exporte und verschlüsselte Offsite-Kopien | [Backup-Runbook §1b](../betrieb/backup-restore-runbook.md#1b-aufbewahrung-löschung-verschlüsselung-verbindlich) nennt **verbindlich Erstellungsdatum + drei Monate**, maximal drei Monatsstände, monatlichen Lösch-/Protokollprozess | Vorhandene Löschquittungen und alle Kopien zuordnen; in dieser Umgebung kein vollständiges Betreiber-Backupinventar. Keine alten Sicherungen oder Belege durch F gelöscht. |
| Supabase-Altsicherungen und Providerlogs | Gesonderte Grenzen S2/S3; Pro-Fenster sieben Tage ist keine Erasuregarantie | Anbieterantwort und rechtliche Bewertung; Löschsperrliste/Wiederherstellungsnachlauf konkret festlegen und später belegen |
| Audit-, Sicherheits-, Kosten-, Job- und Versandlogs | Eigene Zwecke/Aufbewahrungspflichten von Nutzerinhalten trennen; Ringgröße ist keine Zeitfrist; gesperrte UNKNOWN-/Kosten-/Originalbelege nicht ungebunden entfernen | **L4:** Frist und personenbezogene Minimierung je Log, Zugriff und zulässige Ausnahmen entscheiden; kein pauschales Löschen von Rechnungs-/Sicherheitsbelegen |

**Isolierte technische Änderung:** `retention.js` gibt ein altes Original nur frei,
wenn jede gelesene KO-Referenz ausdrücklich im KO-Löschplan steht. Unbekannte oder
unvollständige Referenzen bleiben konservativ gesperrt. Empfehlungen, Altersgrenzen,
ungebundene Originale und Default-AUS der Ausführung bleiben erhalten. Keine
Storage-/API-/Flag-/Schemaänderung, kein Produktionsaufruf. Rückweg: diesen
Planer-/Testdiff gezielt zurücknehmen; es sind keine Daten zurückzuspielen.

**Gezielte lokale Nachweise über `scripts/lokal.js`:** Gegenfälle zunächst rot
(drei fehlgeschlagene Assertions); nach Fix bestehende Suite 18/18 und neue
`quellen-retention-integritaet-test.js` 11/11 Referenzgruppen grün. Die vorübergehenden
Ergänzungen im alten Test sind vollständig zurückgenommen. Der neue Testname folgt
der dokumentierten vorhandenen Quellenbereichszuordnung. Endgültiger bestehender
CI-Plan: `targeted`, Schnellkern/Quellenbereich/Syntax, keine große Standard-/DB- oder
Browserprüfung; beide Pflichtjobs bleiben erforderlich. Keine CI-Regel geändert.
Unabhängiges Review und exakte Pflicht-CI werden im zugehörigen PR belegt;
lokale Prüfungen sind keine Merge-/Production- oder Löschvollzugsabnahme.

**Vor realem Vollzug weiter erforderlich:** vollständig gelesene und konsistent
gebundene Metadaten, sichere erneute Referenzprüfung bei gleichzeitiger Verarbeitung,
eindeutiger Löschumfang einschließlich aller Archive und Kopien, richtige
Betroffenen-/Mandantenzuordnung, Fehler-/Teilvollzugsbelege und tatsächlicher
Rücklesebeleg. Der Planer beweist nur seine Eingabemenge. Änderungen gemeinsamer
Storage-Funktionen bleiben bei D; F umgeht diese Eigentümerschaft nicht.

## 6. Vorprüfung 9/10 und Abschlussbedarf

Vorhandene Einladungs-/Reset-/SMTP-Prüfungen:
[Mailversand](../betrieb/mailversand-tophoster.md).
Vorhandene Quellen-/Kundenausgabebelege:
[Abnahme](../betrieb/quellen-abnahme-20261117.md),
[Briefingqualität](../betrieb/briefing-qualitaet-20261117.md).
F hat keine authentifizierte Kundensitzung, keinen echten Einladungsempfänger,
keinen Export-/Löschdurchlauf und keine fachliche Vier-Bereiche-Abnahme erzeugt.
Lokaler Browserbeleg, Mock100 und gespeicherte Metadaten ersetzen diese nicht.

**Konkretes Freigabeblatt für Betreiber/Rechtsberatung:** je V1/S1–S3/A1/M1,
R1–R6, Q2–Q4 und L1–L4 Entscheidung, verantwortliche Person, Datum, exakt geprüfte
Version und Beleg eintragen; Bedingungen an D/E übergeben. Offene Punkte bleiben
STOP für die betroffene personenbezogene oder fremdtextbezogene zahlende Nutzung.
Schon belegte enge Quellennutzungen und Supabase-DPA-Einbeziehung werden nicht
nochmals zur allgemeinen Prüfung zurückgestellt. Keine Zustimmung wird fingiert.

**Genau ein nächster Schritt:** Betreiber/Rechtsberatung schließen dieses
konkrete Freigabeblatt anhand der bestehenden Originalunterlagen und noch
ausstehenden Anbieterantworten; D koordiniert parallel den isolierten technischen PR.
