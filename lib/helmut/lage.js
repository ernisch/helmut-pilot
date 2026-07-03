"use strict";

// Helmut — Lage-Briefing (das politische Morgen-Briefing des digitalen Referenten).
//
// Lage beantwortet AUSSCHLIESSLICH: "Worüber muss ich heute Bescheid wissen?"
// KEINE Handlungsempfehlung, KEINE Bewertung, KEINE Priorisierung — das ist
// Aufgabe des Helmut-Tabs. Diese Trennung ist bewusst und darf nicht verwischen.
//
// Datenquelle (Zielbild): ausschließlich die bereits vorhandenen politischen
// Vorgänge (V3 knowledge_objects). Die KI erzeugt lediglich den Briefing-Text.
//
// STAND: In dieser Ausbaustufe liefert buildLageBriefing() ein hochwertiges
// DEMO-Briefing (klar als demo:true markiert), damit der neue Lage-Tab gerendert
// und abgenommen werden kann. Der echte, KO-basierte, gecachte KI-Generator +
// die Quellen-Provenienz werden in der nächsten Ausbaustufe hier angeschlossen
// (generateLageBriefing über die V3-KOs, Cache in der briefings-Tabelle).

// Ein Beispiel-Briefing im Zielbild: sachlich, präzise, ohne Empfehlung/Bewertung,
// jede Aussage aus den angegebenen Quellen ableitbar. Passt zum Referenzscreenshot.
function demoLageBriefing(profile = {}) {
  const firstName = String(profile.fullName || "Cem").split(/\s+/)[0] || "Cem";

  const S = (name, type, urlHost, publishedLabel, documentType) => ({
    name, type, url: urlHost ? `https://${urlHost}` : "", dateLabel: publishedLabel || "", documentType: documentType || ""
  });

  const paragraphs = [
    {
      text:
        "Die Bundesregierung treibt das Bundestariftreuegesetz weiter voran. Gleichzeitig hat die " +
        "Bundestagsfraktion Die Linke einen eigenen Antrag zur Stärkung der Tarifbindung eingebracht. " +
        "Im Ausschuss für Arbeit und Soziales wird das Thema voraussichtlich in den kommenden Tagen weiter " +
        "an Bedeutung gewinnen.",
      sources: [
        S("DGB", "Verband", "dgb.de", "Heute"),
        S("Deutscher Bundestag", "Drucksache", "dip.bundestag.de", "Heute", "PDF"),
        S("BMAS", "Ministerium", "bmas.de", "Heute"),
        S("Die Linke", "Partei", "die-linke.de", "Heute"),
        S("Reuters", "Medien", "reuters.com", "Heute"),
        S("Tagesschau", "Medien", "tagesschau.de", "Heute")
      ]
    },
    {
      text:
        "Parallel hat das Bundesministerium für Gesundheit erste Eckpunkte zur Pflegereform vorgestellt. " +
        "Mehrere Verbände haben bereits Kritik angekündigt. Eine parlamentarische Behandlung wird nach der " +
        "Sommerpause erwartet.",
      sources: [
        S("Deutscher Bundestag", "Bundestag", "bundestag.de", "Heute"),
        S("BMG", "Ministerium", "bundesgesundheitsministerium.de", "Heute"),
        S("Sozialverband VdK", "Verband", "vdk.de", "Heute"),
        S("dpa", "Medien", "dpa.com", "Heute")
      ]
    },
    {
      text:
        "Innerhalb deiner Fraktion standen heute arbeitsmarktpolitische Themen im Mittelpunkt. Neben einer " +
        "neuen Pressemitteilung wurde ein Antrag zur Tarifbindung veröffentlicht.",
      sources: [
        S("Die Linke", "Fraktion", "linksfraktion.de", "Heute"),
        S("Deutscher Bundestag", "Drucksache", "dip.bundestag.de", "Heute", "PDF"),
        S("Tagesschau", "Medien", "tagesschau.de", "Heute")
      ]
    }
  ];

  const vorgaenge = [
    {
      id: "vg-bundestariftreuegesetz",
      vorgangId: "vg-bundestariftreuegesetz",
      policyField: "Arbeit & Soziales",
      title: "Bundestariftreuegesetz",
      status: "update",
      standLabel: "Referentenentwurf liegt vor",
      nextStep: "Kabinettsbeschluss",
      updatedLabel: "Heute, 08:45",
      updatedDot: "today",
      summary: {
        text:
          "Das Bundesarbeitsministerium hat den Referentenentwurf zum Bundestariftreuegesetz vorgelegt. Ziel des " +
          "Gesetzes ist es, die Einhaltung von Tarifverträgen bei der Vergabe öffentlicher Aufträge verbindlicher zu " +
          "regeln. Die Linke fordert in einem eigenen Antrag weitergehende Regelungen, insbesondere eine Ausweitung " +
          "auf alle Branchen. Im Ausschuss für Arbeit und Soziales ist das Thema für die kommende Sitzungswoche angekündigt."
      },
      chronologie: [
        { dateLabel: "12. Juni 2025", timeLabel: "08:30", text: "BMAS veröffentlicht Referentenentwurf zum Bundestariftreuegesetz." },
        { dateLabel: "12. Juni 2025", timeLabel: "09:15", text: "Die Linke bringt Antrag zur Stärkung der Tarifbindung ein." },
        { dateLabel: "12. Juni 2025", timeLabel: "10:45", text: "Ausschuss für Arbeit und Soziales setzt Thema auf vorläufige Tagesordnung." }
      ],
      sources: [
        { name: "BMAS – Referentenentwurf", type: "Web", host: "bmas.de", url: "https://bmas.de", documentType: "PDF" },
        { name: "Bundestag Drucksache 20/1234", type: "Web", host: "dip.bundestag.de", url: "https://dip.bundestag.de", documentType: "PDF" },
        { name: "Pressemitteilung Die Linke", type: "Web", host: "die-linke.de", url: "https://die-linke.de", documentType: "Web" },
        { name: "Tagesschau – Bericht", type: "Web", host: "tagesschau.de", url: "https://tagesschau.de", documentType: "Web" }
      ],
      documents: [
        { name: "Referentenentwurf (BMAS)", kind: "PDF", sizeLabel: "1,2 MB", url: "https://bmas.de" },
        { name: "Antrag Die Linke", kind: "PDF", sizeLabel: "312 KB", url: "https://die-linke.de" },
        { name: "Synopse", kind: "PDF", sizeLabel: "456 KB", url: "#" }
      ]
    },
    {
      id: "vg-pflegereform",
      vorgangId: "vg-pflegereform",
      policyField: "Gesundheit",
      title: "Pflegereform",
      status: "neu",
      standLabel: "Eckpunkte veröffentlicht",
      nextStep: "Verbändeanhörung",
      updatedLabel: "Heute, 07:30",
      updatedDot: "today",
      summary: {
        text:
          "Das Bundesgesundheitsministerium hat Eckpunkte zu einer Reform der Pflegeversicherung vorgestellt. Mehrere " +
          "Sozial- und Pflegeverbände haben Kritik angekündigt. Ausformulierte Regelungen liegen noch nicht vor; eine " +
          "parlamentarische Behandlung wird nach der Sommerpause erwartet."
      },
      chronologie: [
        { dateLabel: "12. Juni 2025", timeLabel: "07:30", text: "BMG stellt Eckpunkte zur Pflegereform vor." },
        { dateLabel: "12. Juni 2025", timeLabel: "11:10", text: "Sozialverband VdK kündigt kritische Stellungnahme an." }
      ],
      sources: [
        { name: "BMG – Eckpunktepapier", type: "Web", host: "bundesgesundheitsministerium.de", url: "https://bundesgesundheitsministerium.de", documentType: "PDF" },
        { name: "Sozialverband VdK", type: "Web", host: "vdk.de", url: "https://vdk.de", documentType: "Web" },
        { name: "dpa – Meldung", type: "Web", host: "dpa.com", url: "https://dpa.com", documentType: "Web" }
      ],
      documents: [
        { name: "Eckpunktepapier (BMG)", kind: "PDF", sizeLabel: "890 KB", url: "https://bundesgesundheitsministerium.de" }
      ]
    },
    {
      id: "vg-mindestlohn",
      vorgangId: "vg-mindestlohn",
      policyField: "Arbeit & Soziales",
      title: "Mindestlohn",
      status: "beobachtung",
      standLabel: "Mindestlohnkommission tagt",
      nextStep: "Empfehlung der Kommission",
      updatedLabel: "Gestern, 18:20",
      updatedDot: "yesterday",
      summary: {
        text:
          "Die Mindestlohnkommission tagt weiter. Eine Empfehlung zur nächsten Anpassung steht noch aus und wird bis " +
          "Quartalsende erwartet. Erste Einschätzungen der Sozialpartner liegen vor."
      },
      chronologie: [
        { dateLabel: "11. Juni 2025", timeLabel: "18:20", text: "Mindestlohnkommission setzt Beratungen fort." }
      ],
      sources: [
        { name: "Mindestlohnkommission", type: "Web", host: "mindestlohn-kommission.de", url: "https://mindestlohn-kommission.de", documentType: "Web" },
        { name: "Tagesschau – Bericht", type: "Web", host: "tagesschau.de", url: "https://tagesschau.de", documentType: "Web" }
      ],
      documents: []
    },
    {
      id: "vg-rentenpaket-ii",
      vorgangId: "vg-rentenpaket-ii",
      policyField: "Alterssicherung",
      title: "Rentenpaket II",
      status: "beobachtung",
      standLabel: "Gesetzentwurf in Vorbereitung",
      nextStep: "Ressortabstimmung",
      updatedLabel: "Gestern, 17:10",
      updatedDot: "yesterday",
      summary: {
        text:
          "Der Gesetzentwurf zum Rentenpaket II befindet sich in der Ressortabstimmung. Vorgesehen sind die Haltelinie " +
          "beim Rentenniveau sowie der Einstieg in ein kapitalgedecktes Generationenkapital. Die parlamentarische " +
          "Beratung ist noch nicht terminiert."
      },
      chronologie: [
        { dateLabel: "11. Juni 2025", timeLabel: "17:10", text: "Überarbeiteter Entwurf geht in die Ressortabstimmung." }
      ],
      sources: [
        { name: "BMAS – Mitteilung", type: "Web", host: "bmas.de", url: "https://bmas.de", documentType: "Web" },
        { name: "Reuters – Bericht", type: "Web", host: "reuters.com", url: "https://reuters.com", documentType: "Web" }
      ],
      documents: []
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    demo: true,
    firstName,
    paragraphs,
    vorgaenge
  };
}

// Baut das Lage-Briefing für einen Nutzer. Aktuell: Demo. Nächste Ausbaustufe:
// gecachtes, KO-basiertes KI-Briefing (generateLageBriefing über V3 + briefings-Cache).
async function buildLageBriefing(profile = {}, _opts = {}) {
  return demoLageBriefing(profile);
}

module.exports = {
  buildLageBriefing,
  demoLageBriefing
};
