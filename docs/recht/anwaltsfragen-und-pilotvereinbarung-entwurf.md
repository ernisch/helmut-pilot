# Fragenkatalog Anwalt/DSB + Pilotvereinbarung (ARBEITSENTWURF)

**Status: unverbindlicher ARBEITSENTWURF (Audit 2026-07-15). KEINE
Rechtsberatung, KEINE Verwendung ohne anwaltliche Prüfung.**

## Teil 1 — Fragenkatalog für Anwalt / Datenschutzbeauftragten

**F1 (Art. 9, dringend — Pilot läuft seit Juni):** Welche Rechtsgrundlage trägt
die Verarbeitung des politischen Mandatsprofils (politische Meinung des Kunden:
Positionen, No-Go-Themen, Parteizugehörigkeit)? Ausdrückliche Einwilligung
(Art. 9 Abs. 2 lit. a) im Vertrag/Onboarding? Reicht für amtliche/öffentliche
Angaben lit. e?
**F2 (DSFA):** Bestätigung der DSFA-Pflicht (politische Profilbildung +
Medienmonitoring) und Durchführung; Scope inkl. der global geteilten
KI-Analysen (knowledge_objects mit mentioned_people).
**F3 (Urheberrecht/Leistungsschutz):** V2-Pfad speichert RSS-`content`
ungekürzt; V3 nur ≤240-Zeichen-Snippets + Links. Bewertung §§ 87f ff. UrhG
(Presseverleger), § 44b UrhG (TDM), Google-News-Nutzungsbedingungen. Muss der
V2-content-Pfad gekappt werden (technisch einfach — bitte Vorgabe)?
**F4 (AI Act):** Einordnung der KI-Textentwürfe (Pressemitteilungen,
Krisenstatements) — Transparenzpflichten? Die UI kennzeichnet KI-/Regel-Texte
seit Sprint 1; reicht das Format?
**F5 (Erwähnungs-Radar):** Verarbeitung von Artikeln über den Kunden und
Nennungen Dritter (Politiker in amtlicher Rolle) — Grundlage berechtigtes
Interesse? Informationspflichten Art. 14 gegenüber Dritten (Medienprivileg?)?
**F6 (Auftragsverarbeitung):** AVV-Liste (datenfluss-dienstleister-avv.md)
durchgehen; Einordnung Push-Dienste + GitHub; SCC/TIA-Bedarf.
**F7 (Aufbewahrung):** Fristen aus Löschkonzept-Entwurf bestätigen; dürfen
anonymisierte Kostensummen nach Kundenlöschung bleiben? Sicherheits-Audit-Logs?
**F8 (Vertrag/AGB):** Nutzungsvertrag mit Haftungsbegrenzung für
KI-Empfehlungen (politische Fehleinschätzung!), Verfügbarkeit "best effort",
Kündigungsregeln, Impressums-Vervollständigung (USt-IdNr, Rechtsform).
**F9 (Meldewege):** 72h-Prozess für Datenpannen (Vorlage), zuständige
Aufsichtsbehörde (Berlin), Schwellen.
**F10 (Behördenkunden):** Zusatzanforderungen, wenn Fraktionen/Ministerien
Kunden werden (Landes-DSG, Beschaffung, ggf. Geheimschutz).

## Teil 2 — Pilotvereinbarung (ARBEITSENTWURF zur anwaltlichen Ausarbeitung)

**Zwischen** Lüey Nohut (Betreiber, lt. Impressum) **und** [Cem Ince, MdB]
(Pilotnutzer).

1. **Gegenstand:** Unentgeltliche Testnutzung der Software „Helmut" (politisches
   Lagebild, Radar, Briefing, Büro-Entwürfe) für [4 Wochen] ab [Datum], zur
   gemeinsamen Erprobung. Kein Anspruch auf Verfügbarkeit oder bestimmte
   Ergebnisse (Pilotcharakter).
2. **Leistungsumfang/Wahrheit:** KI-generierte Inhalte sind als solche
   gekennzeichnet; Empfehlungen sind EntscheidungsUNTERSTÜTZUNG — die politische
   Verantwortung und die Prüfung vor Veröffentlichung verbleiben beim Nutzer.
3. **Daten:** Verarbeitete Kategorien inkl. besonderer Kategorien (politisches
   Mandatsprofil) gemäß Anlage Datenschutzinformation; **ausdrückliche
   Einwilligung** in die Verarbeitung der Profilangaben nach Art. 9 Abs. 2
   lit. a DSGVO [FORMULIERUNG DURCH ANWALT]; Widerruf jederzeit; Export und
   vollständige Löschung über die App (technisch umgesetzt) oder auf Zuruf.
4. **Dienstleister:** Hosting/DB/KI in der EU (Vercel fra1, Supabase Irland,
   Azure OpenAI EU) gemäß Dienstleisterliste; Änderungen werden mitgeteilt.
5. **Vertraulichkeit:** Beidseitig; der Betreiber greift auf Mandatsdaten nur
   zur Störungsbeseitigung/Weiterentwicklung zu und protokolliert Zugriffe.
6. **Haftung:** [ANWALT — Begrenzung auf Vorsatz/grobe Fahrlässigkeit;
   Ausschluss für inhaltliche Richtigkeit politischer Hinweise, soweit zulässig.]
7. **Laufzeit/Ende:** endet automatisch nach [4 Wochen]; jederzeit beidseitig
   formlos kündbar; bei Ende: Export-Angebot + Löschung binnen [14] Tagen mit
   Bestätigung.
8. **Feedback:** Nutzer nennt einen Ansprechpartner; wöchentliches Kurz-Feedback;
   Nennung als Referenz NUR nach gesonderter Zustimmung.
9. **Kosten:** Pilot unentgeltlich; Anschlussangebot separat.
10. **Notfallkontakt Betreiber:** [Telefon/Signal], Reaktionszeiten: kritisch
    < 1 h werktags 8–20 Uhr, sonst < 1 Werktag.

Anlagen: Datenschutzinformation (auf Basis /datenschutz, aktualisiert um
Account-Modus), Dienstleisterliste, Erfolgs-/Abbruchkriterien des Piloten.
