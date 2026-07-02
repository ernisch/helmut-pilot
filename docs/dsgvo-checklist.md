# DSGVO-Checkliste fuer Helmut

Stand: technische Haertung im Pilotbetrieb. Letzte Aktualisierung 2026-06-29 (EU-Datenresidenz).

## Vor Produktivbetrieb klaeren (rechtlich/organisatorisch)

- Verantwortlicher, Datenschutzkontakt und Impressum festlegen.
- Rechtsgrundlage fuer das politische Mandatsprofil und Nutzungssignale dokumentieren.
- Ausnahme nach Art. 9 DSGVO fuer politische Daten pruefen und dokumentieren (besondere Kategorie -- hoechste Stufe).
- Datenschutz-Folgenabschaetzung (DSFA) durchfuehren -- bei politischer Profilbildung + Monitoring sehr wahrscheinlich Pflicht, nicht optional.
- AV-Vertraege (AVV) mit allen Subprozessoren abschliessen/dokumentieren: Microsoft Azure (KI), Vercel (Hosting), Supabase (DB), Google FCM/Mozilla (Web-Push).
- Organisatorische Loeschfristen fuer Profile, Briefings, Notizen, Push-Daten und Logs festlegen.
- EMPFEHLUNG: Datenschutzbeauftragten oder Fachanwalt einbinden, bevor echte Mandatsdaten verarbeitet werden (insb. DSFA + Art. 9 bei Behoerdenkunden).

## EU-Datenresidenz (Stand 2026-06-29)

- KI-Verarbeitung: Azure OpenAI EU, Sweden Central, Deployment gpt-5-mini. ERLEDIGT.
- Server-/Funktionsverarbeitung: Vercel-Region auf Frankfurt (fra1) gepinnt in vercel.json. PRUEFEN ob auf aktuellem Plan wirksam (ggf. Vercel Pro noetig) -- in Function-Logs verifizieren.
- Datenbank: Supabase-Projekt liegt in AWS eu-west-1 (Irland, EU). ERLEDIGT. Hinweis: laeuft auf Free-Plan (NANO) -- fuer Produktivbetrieb spaeter Supabase Pro fuer Backups/keine Pausierung (Zuverlaessigkeit, kein DSGVO-Thema).
- Drittlandtransfer-Grundlagen (SCCs, TIA) nur noch fuer unvermeidbare Subprozessoren wie Web-Push (Google FCM) dokumentieren.

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

## Helmut Core V3 — Datenschutz by design (Stand C6)

Grundtrennung: **oeffentliche politische Daten** (mandantenlos, kein `user_id`) sind
strikt von **Nutzerdaten** getrennt.

- **Global/public (keine Nutzerdaten):** `sources`, `raw_documents`, `knowledge_objects`,
  `ko_document_links`, `ko_relations`, `pipeline_locks`. Enthalten ausschliesslich
  oeffentliche politische Vorgaenge und Quell-Metadaten.
- **Pro Nutzer (loeschbar):** `profiles`, `mandate_profiles`, `matching_weights`,
  `decisions`, `topic_memory`, `interactions`, `office_outputs`, `briefings`,
  `user_notes`, `daily_tasks` — alle mit `on delete cascade` auf `profiles(id)`.

### In V3 bereits umgesetzt (C6, Datenminimierung)
- `raw_documents` speichert nur Dedup-Identitaet + oeffentliche Schlagzeile + **gekuerzten**
  Kontext (`summary` <= 240 Zeichen). Bewusst NICHT gespeichert: Volltext/`content`,
  `excerpt`, `imageUrl`, Autor-PII, kompletter Rohpayload.
- Erwaehnungen (`mentioned_*` in `knowledge_objects`) sind ausschliesslich **oeffentliche
  politische** Erwaehnungen (Abgeordnete/Parteien/Ausschuesse/Ministerien in ihrer
  amtlichen Rolle). Es werden KEINE privaten Personenprofile aus Artikeln abgeleitet.
- `llm_usage` (Kostenlog) speichert nur Tokens/Kosten/Modell/`call_type` — **keine
  Prompt- oder Antwortinhalte**.

### Vor V3-Produktivbetrieb noch ergaenzen
- **Loeschung erweitern:** `deleteProfileData`/`/api/privacy/delete` muss auch die neuen
  V3-Nutzer-Tabellen abdecken (FK-`cascade` greift beim Loeschen der `profiles`-Zeile;
  Export `/api/privacy/export` analog erweitern).
- **Aufbewahrungsfristen** fuer `raw_documents` (z. B. Rohdoku-TTL) und Nutzer-Artefakte
  organisatorisch + technisch festlegen.
- **RLS-Policies** pro `user_id` auf den V3-Nutzer-Tabellen definieren (aktuell RLS aktiv
  = deny-by-default; Server nutzt Service-Role). Vor Nicht-Server-Zugriff Policies noetig.
- **Art. 9 / DSFA** fuer die globale, geteilte KI-Analyse (`knowledge_objects`) im DSFA-Scope
  mitfuehren (politische Daten = besondere Kategorie).
- **Mentions-Freigabe:** Understanding-Prompt (C7) so einschraenken, dass `mentioned_people`
  nur oeffentlich handelnde politische Akteure erfasst, keine zufaellig genannten Privatpersonen.
