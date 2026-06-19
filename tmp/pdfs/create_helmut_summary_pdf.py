from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


OUTPUT = "output/pdf/helmut-v1-kurzzusammenfassung.pdf"


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="TitleLarge",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=24,
    leading=28,
    textColor=colors.HexColor("#111111"),
    spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="Section",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=13,
    leading=16,
    textColor=colors.HexColor("#111111"),
    spaceBefore=14,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="Body",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=10.5,
    leading=15,
    textColor=colors.HexColor("#333333"),
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="Small",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9,
    leading=12,
    textColor=colors.HexColor("#666666"),
))


def p(text, style="Body"):
    return Paragraph(text, styles[style])


doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=18 * mm,
    bottomMargin=18 * mm,
)

story = []
story.append(p("Helmut V1 - Kurzzusammenfassung", "TitleLarge"))
story.append(p("Stand: 18. Juni 2026. Einfacher Überblick, wie Helmut im Hintergrund arbeitet.", "Small"))
story.append(Spacer(1, 8))

story.append(p("1. Was Helmut ist", "Section"))
story.append(p("Helmut ist kein News-Aggregator und kein Medienmonitoring. Helmut ist ein digitaler politischer Referent. Er liest Quellen, reduziert die Lage und bereitet politische Entscheidungen vor."))
story.append(p("Ziel: Cem soll morgens in weniger als 30 Sekunden sehen, was wichtig ist, was ignoriert werden kann, worauf reagiert werden sollte und welche Aufgabe daraus entsteht."))

story.append(p("2. Crawling-Rhythmus", "Section"))
schedule_data = [
    ["Zeit", "Aktion"],
    ["06:00", "Quellen abrufen"],
    ["07:00", "Morgenbriefing erzeugen"],
    ["12:00", "Quellen abrufen"],
    ["18:00", "Quellen abrufen"],
    ["22:00", "Quellen abrufen"],
]
table = Table(schedule_data, colWidths=[30 * mm, 120 * mm])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F0F0EE")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#111111")),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E5E5")),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
]))
story.append(table)
story.append(Spacer(1, 6))
story.append(p("Wichtig: Lokal crawlt Helmut nur manuell ueber /api/crawl/run. Automatisch laeuft der Rhythmus erst nach Deployment mit Vercel Cron.", "Small"))

story.append(p("3. Welche Quellen aktuell geprueft werden", "Section"))
story.append(p("BMAS, Bundesregierung, Bundestag, Ausschuss Arbeit und Soziales, Die Linke, Die Linke im Bundestag, Tagesschau Politik, Deutschlandfunk Politik, DGB und Cem Ince News-Suche."))

story.append(p("4. Wie aus Quellen ein Briefing wird", "Section"))
pipeline = [
    "Quelle abrufen",
    "Raw Item speichern",
    "Duplikate entfernen",
    "Cem-Relevanz pruefen",
    "Themen clustern",
    "politische Relevanz bewerten",
    "Chance und Risiko erkennen",
    "Handlung empfehlen",
    "Kommunikation vorschlagen",
    "Aufgabe vorbereiten",
    "Morgenbriefing anzeigen",
]
story.append(p(" -> ".join(pipeline)))
story.append(p("Wenn Live-Quellen keine belastbare Entscheidungslage ergeben, zeigt Helmut fuer den Pilot eine kuratierte Demo-Lage. Das ist Absicht: keine Datenflut, sondern Entscheidungsklarheit."))

story.append(p("5. Was OpenAI macht", "Section"))
story.append(p("OpenAI ist aktiviert. Es veredelt Texte, Empfehlungen und Kommunikationsvorschlaege. Die Grundlogik bleibt regelbasiert, damit Helmut auch ohne OpenAI weiter funktioniert."))
story.append(p("An OpenAI werden nur begrenzte Inhalte geschickt: Mandatsprofil, konkrete Empfehlung und relevante Quellen-Auszüge. Keine private Kalenderdatenbank und keine Login-Daten."))

story.append(p("6. Aufgaben", "Section"))
story.append(p("Aufgaben entstehen automatisch aus Handlungsempfehlungen. Cem kann sie starten, erledigen, kopieren oder per E-Mail an das Buero weitergeben. Eine eigene Buero-App ist fuer V1 bewusst nicht noetig."))
story.append(p("Das Reaktionsfenster ist kein Kalendertermin. Es ist eine politische Empfehlung: Bis wann sollte reagiert werden, damit die Wirkung noch hoch ist."))

story.append(p("7. Updates und Radar", "Section"))
story.append(p("Das Herz zeigt nur dann einen roten Punkt, wenn es frische Updates gibt. Beim Klick oeffnet sich ein Benachrichtigungs-Panel. Im Radar stehen namentliche Erwaehnungen, Chancen und Risiken."))

story.append(p("8. Was bewusst noch nicht gebaut ist", "Section"))
story.append(p("Keine Benutzerverwaltung, keine echte Kalenderintegration, kein komplexes Projektmanagement, kein Bilder-Scraping mit Browserautomation, keine Datenbank wie Supabase. Das haelt V1 schnell, testbar und datensparsam."))

story.append(p("9. Pilot-Regel", "Section"))
story.append(p("Jetzt nicht weiter aufblasen. Fuer Cem/Jam reicht der Pilot, wenn Morgenbriefing, Quellenbasis, Kommunikation, Aufgaben und Updates sauber funktionieren. Danach 7 Tage echte Nutzung messen."))

doc.build(story)
print(OUTPUT)
