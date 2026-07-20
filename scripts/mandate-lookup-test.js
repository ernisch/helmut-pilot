"use strict";

// Offline-Test der Mandatserkennung (lib/helmut/mandate-lookup.js) — der neue
// Lesepfad hinter GET /api/mandate/lookup. KEIN echtes Netz: global.fetch wird
// je Szenario durch einen Stub ersetzt, der anhand der URL kontrollierte JSON
// liefert (Abgeordnetenwatch v2 / DIP). Deckt die VIER Fehlerpfade ab
// (found · ambiguous · not_found · source_down) plus den Landtag-Vorbehalt und
// die Normalisierungs-/Dedup-Regeln.

delete process.env.DIP_API_KEY; // DIP aus -> nur Abgeordnetenwatch im Spiel

const lookup = require("../lib/helmut/mandate-lookup");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

// Fetch-Stub: routet nach URL-Fragment auf vorbereitete Antworten.
function installFetch(routes) {
  global.fetch = async (url) => {
    const u = String(url);
    for (const [needle, payload] of routes) {
      if (u.includes(needle)) {
        if (payload === "THROW") throw new Error("network-down");                 // Netzausfall
        if (payload && payload.__status) {                                        // HTTP-Fehlerstatus
          return { ok: payload.__status < 400, status: payload.__status, json: async () => (payload.body || {}) };
        }
        return { ok: true, status: 200, json: async () => payload };
      }
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  };
}

const politician = (id, label, party) => ({ id, label, first_name: label.split(" ")[0], last_name: label.split(" ").slice(-1)[0], party: { label: party } });

(async () => {
  // ── 1) GEFUNDEN (eindeutig, Bundestag) ──────────────────────────────────────
  installFetch([
    ["/politicians?", { data: [politician(1, "Katrin Vogt", "Die Linke")] }],
    ["/candidacies-mandates?", { data: [{
      parliament_period: { label: "Bundestag 2021 - 2025", parliament: { label: "Bundestag" } },
      fraction_membership: [{ fraction: { label: "Fraktion Die Linke" } }],
      electoral_data: { constituency: { label: "Salzgitter - Wolfenbüttel" } }
    }] }],
    ["/committee-memberships?", { data: [
      { committee: { label: "Ausschuss für Arbeit und Soziales" }, committee_role: "Ordentliches Mitglied" },
      { committee: { label: "Ausschuss für Gesundheit" }, committee_role: "Stellvertretendes Mitglied" }
    ] }]
  ]);
  const found = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("gefunden: status 'found'", found.status === "found", found.status);
  check("gefunden: Partei übernommen", found.profile && found.profile.party === "Die Linke", JSON.stringify(found.profile && found.profile.party));
  check("gefunden: Fraktion normalisiert ('Fraktion ' entfernt)", found.profile && found.profile.faction === "Die Linke", found.profile && found.profile.faction);
  check("gefunden: Ebene Bundestag", found.profile && found.profile.parliamentType === "Bundestag");
  check("gefunden: politicalLevel Bund", found.profile && found.profile.politicalLevel === "Bund");
  check("gefunden: Wahlkreis übernommen", found.profile && /Salzgitter/.test(found.profile.constituency || ""), found.profile && found.profile.constituency);
  check("gefunden: ordentlicher Ausschuss in committees", found.profile && (found.profile.committees || []).some((c) => /Arbeit und Soziales/.test(c)));
  check("gefunden: stellv. Ausschuss in deputyCommittees", found.profile && (found.profile.deputyCommittees || []).some((c) => /Gesundheit/.test(c)));
  check("gefunden: Quelle abgeordnetenwatch markiert", found.sources && found.sources.abgeordnetenwatch === true);
  check("gefunden: kein Landtag-Warnhinweis", !found.warnings.includes("landtag-quellen-im-aufbau"));

  // ── 2) MEHRDEUTIG (Auswahlliste) ────────────────────────────────────────────
  installFetch([
    ["/politicians?", { data: [politician(11, "Thomas Müller", "SPD"), politician(12, "Anna Müller", "CDU")] }]
  ]);
  const amb = await lookup.lookupMandate({ name: "Müller" });
  check("mehrdeutig: status 'ambiguous'", amb.status === "ambiguous", amb.status);
  check("mehrdeutig: zwei Kandidaten", (amb.candidates || []).length === 2, String((amb.candidates || []).length));
  check("mehrdeutig: Kandidat trägt id + name + party", amb.candidates[0].id && amb.candidates[0].name && amb.candidates[0].party);
  check("mehrdeutig: kein Profil vorbelegt", amb.profile === null);

  // ── 2b) EXAKTER Namenstreffer trotz mehrerer Rohtreffer -> eindeutig ─────────
  installFetch([
    ["/politicians?", { data: [politician(21, "Katrin Vogt", "Die Linke"), politician(22, "Katrin Vogt-Meier", "SPD")] }],
    ["/candidacies-mandates?", { data: [] }],
    ["/committee-memberships?", { data: [] }]
  ]);
  const exact = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("exakter Treffer gewinnt trotz zweitem Rohtreffer -> 'found'", exact.status === "found", exact.status);

  // ── 3) NICHTS GEFUNDEN (manueller Pfad) ─────────────────────────────────────
  installFetch([["/politicians?", { data: [] }]]);
  const none = await lookup.lookupMandate({ name: "Niemand Existiertnicht" });
  check("nicht gefunden: status 'not_found'", none.status === "not_found", none.status);
  check("nicht gefunden: Profil null", none.profile === null);

  // ── 4) QUELLE NICHT ERREICHBAR (Retry + manuell) ────────────────────────────
  installFetch([["/politicians?", "THROW"]]);
  const down = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("Quelle down: status 'source_down'", down.status === "source_down", down.status);
  check("Quelle down: Profil null", down.profile === null);

  // ── 4b) ROOT-CAUSE-FIX: 4xx (Query abgelehnt) ist KEIN technischer Ausfall ───
  // Beide Query-Formen antworten 400 -> Quelle ist erreichbar, nur die Query passt
  // nicht -> 'not_found' (ruhiger Hilfezustand), NICHT 'source_down'.
  installFetch([["/politicians?", { __status: 400 }]]);
  const badQuery = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("4xx auf Query: status 'not_found' (NICHT source_down)", badQuery.status === "not_found", badQuery.status);

  // ── 4c) 5xx = echter technischer Ausfall -> 'source_down' ───────────────────
  installFetch([["/politicians?", { __status: 503 }]]);
  const serverErr = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("5xx auf Query: status 'source_down' (technischer Ausfall)", serverErr.status === "source_down", serverErr.status);

  // ── 4d) Erste Query-Form 4xx, zweite liefert Treffer -> found (Fallback greift) ─
  installFetch([
    ["last_name[cn]", { __status: 400 }],
    ["/politicians?", { data: [politician(51, "Robust Fallback", "SPD")] }],
    ["/candidacies-mandates?", { data: [] }],
    ["/committee-memberships?", { data: [] }]
  ]);
  const fallback = await lookup.lookupMandate({ name: "Robust Fallback" });
  check("Query-Fallback: 1. Form 4xx, 2. Form liefert -> 'found'", fallback.status === "found", fallback.status);

  // ── 5) LANDTAG-VORBEHALT ────────────────────────────────────────────────────
  installFetch([
    ["/politicians?", { data: [politician(31, "Lea Berg", "Bündnis 90/Die Grünen")] }],
    ["/candidacies-mandates?", { data: [{
      parliament_period: { label: "Landtag Niedersachsen 2022 - 2027", parliament: { label: "Landtag Niedersachsen" } },
      fraction_membership: [{ fraction: { label: "Fraktion Bündnis 90/Die Grünen" } }],
      electoral_data: { constituency: { label: "Hannover-Mitte" } }
    }] }],
    ["/committee-memberships?", { data: [] }]
  ]);
  const landtag = await lookup.lookupMandate({ name: "Lea Berg" });
  check("Landtag: status 'found'", landtag.status === "found", landtag.status);
  check("Landtag: Ebene Landtag", landtag.profile && landtag.profile.parliamentType === "Landtag");
  check("Landtag: Bundesland aus Parlamentslabel", landtag.profile && landtag.profile.state === "Niedersachsen", landtag.profile && landtag.profile.state);
  check("Landtag: Vorbehalt-Warnung gesetzt", landtag.warnings.includes("landtag-quellen-im-aufbau"));

  // ── 6) Gezielter Abruf nach Disambiguierung (id) ────────────────────────────
  installFetch([
    ["/politicians/42", { data: { id: 42, label: "Sven Beispiel", first_name: "Sven", last_name: "Beispiel", party: { label: "SPD" } } }],
    ["/candidacies-mandates?", { data: [{ parliament_period: { parliament: { label: "Bundestag" } }, fraction_membership: [{ fraction: { label: "SPD-Fraktion" } }] }] }],
    ["/committee-memberships?", { data: [] }]
  ]);
  const byId = await lookup.lookupMandate({ id: "42", name: "Sven Beispiel" });
  check("id-Abruf: status 'found'", byId.status === "found", byId.status);
  check("id-Abruf: Ebene Bundestag", byId.profile && byId.profile.parliamentType === "Bundestag");
  check("id-Abruf: Partei aus Detail übernommen (nicht leer)", byId.profile && byId.profile.party === "SPD", byId.profile && byId.profile.party);

  // ── 7) Leere Eingabe -> not_found (kein Netzaufruf nötig) ────────────────────
  const empty = await lookup.lookupMandate({ name: " " });
  check("leere Eingabe: status 'not_found'", empty.status === "not_found", empty.status);

  // ── 8) Reine Helfer ─────────────────────────────────────────────────────────
  check("cleanName entfernt MdB-Zusatz", lookup.cleanName("Katrin Vogt, MdB") === "Katrin Vogt", lookup.cleanName("Katrin Vogt, MdB"));
  check("levelFromParliamentLabel erkennt Landtag", lookup.levelFromParliamentLabel("Abgeordnetenhaus von Berlin") === "Landtag");
  check("stateFromParliamentLabel liest Bundesland", lookup.stateFromParliamentLabel("Landtag Nordrhein-Westfalen") === "Nordrhein-Westfalen");

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Mandatserkennungs-Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
