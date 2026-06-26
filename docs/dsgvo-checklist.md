# DSGVO-Checkliste fuer Helmut

Stand: technische Haertung im Pilotbetrieb.

## Vor Produktivbetrieb klaeren

- Verantwortlicher, Datenschutzkontakt und Impressum festlegen.
- Rechtsgrundlage fuer das politische Mandatsprofil und Nutzungssignale dokumentieren.
- Ausnahme nach Art. 9 DSGVO fuer politische Daten pruefen und dokumentieren.
- AV-Vertraege und Subprozessoren fuer Hosting, Supabase, OpenAI und Web-Push klaeren.
- Drittlandtransfer-Grundlagen, insbesondere SCCs und Transfer Impact Assessment, dokumentieren.
- Organisatorische Loeschfristen fuer Profile, Briefings, Notizen, Push-Daten und Logs festlegen.
- Datenschutz-Folgenabschaetzung pruefen, weil politische Profilbildung und Monitoring zusammenkommen.

## Technisch umgesetzt

- Oeffentliche Datenschutzhinweise unter `/datenschutz`.
- Datenexport fuer Pilotprofile unter `/api/privacy/export`.
- Profilbezogene Loeschung unter `/api/privacy/delete`.
- CSRF-Schutz fuer schreibende API-Endpunkte und zustandsaendernde Lauf-Routen.
- Query-Secret-Login standardmaessig deaktiviert; nur mit `HELMUT_ALLOW_QUERY_SECRETS=true`.
- Kein Browser-Cache des kompletten Startpayloads mit Profil und Briefing.
- Security-Basisheader fuer HTML, JSON und statische Assets.
- Push-Subscriptions koennen geloescht werden und werden im Export mit redigierten Keys ausgegeben.

## Noch empfohlen

- Echte Auth statt gemeinsamem Pilot-Code einfuehren.
- Rollenmodell fuer Nutzer, Buero und Admins ergaenzen.
- Supabase relational nutzen und RLS-Policies pro `user_id` statt zentralem JSONB-Store erzwingen.
- Audit-Log fuer Export und Loeschung mit minimalen Metadaten ergaenzen.
- Datenschutzhinweise mit finalem Verantwortlichen, Rechtsgrundlagen, Speicherdauer und Kontakt ausfuellen.
