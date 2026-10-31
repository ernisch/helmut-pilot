// Explizit synthetische Vorschau; nie ein Fallback für fehlgeschlagene Live-Daten.
const generatedAt = "2026-10-31T08:42:00.000Z";
const definitions = [
  ["synthetik-nord", "Büro Nord", "Berlin", true, true],
  ["synthetik-mitte", "Büro Mitte", "Brandenburg", true, false],
  ["synthetik-spree", "Büro Spree", "Berlin", true, true],
  ["synthetik-west", "Büro West", "Nordrhein-Westfalen", true, true],
  ["synthetik-havel", "Büro Havel", "Brandenburg", true, true],
  ["synthetik-sued", "Büro Süd", "Bayern", false, true]
];
const mandates = definitions.map(([id, fullName, state, active, ready]) => ({
  id, fullName, state, party: "Beispielpartei", faction: "Beispielfraktion",
  constituency: "Fiktiver Wahlkreis", committees: ready ? ["Haushalt und Finanzen"] : [],
  focusTopics: ready ? ["Haushalt", "Digitalisierung"] : [], profileActive: active,
  validierung: { bereit: ready, nutzbar: ready, zustand: ready ? "vollstaendig" : "nicht_bereit",
    fehlendePflichtfelder: ready ? [] : ["Ausschuss oder thematischer Schwerpunkt"] }
}));
const kunden = mandates.slice(0, 4).map((p, i) => ({
  userId: `synthetisches-konto-${i}`, name: p.fullName, email: `buero-${i}@example.invalid`,
  politicianId: p.id, role: "abgeordneter", status: i === 3 ? "pausiert" : "aktiv", active: true,
  customer: { pricePerMonth: [290, 290, 490, null][i], paymentStatus: ["paid", "overdue", "paid", "none"][i],
    startDate: "2026-10-01", trialUntil: null, nextInvoice: "2026-11-01", internalNote: "" }
}));
const source = { quelle: "synthetische-quelle-brandenburg", name: "Brandenburg · Pressemitteilungen",
  klasse: "langsam", kurz: "Letzter Abruf nicht bestätigt",
  erklaerung: "Die Quelle antwortet gerade zu langsam. Der letzte erfolgreiche Abruf war um 08:15 Uhr.",
  letzterErfolg: "2026-10-31T07:15:00.000Z", ursacheText: "Zeitüberschreitung", wirkung: null };
const data = {
  overview: { generatedAt, counts: { profiles: 6, users: 5, admins: 1, assignments: 4 }, mandates,
    users: kunden, assignments: kunden.map(k => ({ userId: k.userId, politicianId: k.politicianId })),
    system: { authMode: true, deploy: { environment: "development", version: "Vorschau" }, helmutConfig: [] } },
  customers: { generatedAt, counts: { kunden: 4, paid: 2, open: 0, overdue: 1, none: 1 }, kunden, mrrEur: 1070, sessionsAktiv: 2 },
  budget: { generatedAt, day: "2026-10-31", estimatedCostUsd: 1.42, calls: 92, errors: 0,
    kostenwahrheit: { gesamt: { aufrufe: 92, gemessen: 92, kostenUnbekannt: 0, keinProvideraufruf: 0, kostenUsd: 1.42 } },
    remaining: null, limit: null, byTenant: {}, monat: { seit: "2026-10-01", estimatedCostUsd: 24.76, calls: 1680 } },
  sources: { generatedAt, statusCounts: { healthy: 7, degraded: 1 }, zaehler: { abrufwege: 8 },
    stoerungen: { verfuegbar: true, handlungsbedarf: [source], gestoerte: [source], hinweis: null } },
  runs: { generatedAt, processRuns: [
    { process: "morning-briefing", status: "ok", startedAt: "2026-10-31T06:30:00.000Z", finishedAt: "2026-10-31T06:32:18.000Z", durationMs: 138000 },
    { process: "understanding", status: "ok", startedAt: "2026-10-31T06:12:00.000Z", finishedAt: "2026-10-31T06:14:12.000Z", durationMs: 132000 },
    { process: "crawl", status: "partial", startedAt: "2026-10-31T06:00:00.000Z", finishedAt: "2026-10-31T06:04:08.000Z", durationMs: 248000 }
  ] }
};

export function createPreviewReader() {
  let disposed = false;
  return {
    async read(key, id) {
      if (disposed) throw new Error("Vorschau beendet");
      if (key === "profile") {
        const p = mandates.find(p => p.id === id);
        if (!p) throw new Error("Profil nicht gefunden");
        return structuredClone({ profile: { ...p, parliamentType: p.state === "Berlin" || p.state === "Brandenburg" ? "Landtag" : "Bundestag" }, validierung: p.validierung });
      }
      if (!data[key]) throw new Error("Unbekannte Vorschauansicht");
      return structuredClone(data[key]);
    },
    clear() {},
    dispose() { disposed = true; }
  };
}
