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
  // Verschärft (Review): nicht nur 'found', sondern der RICHTIGE Datensatz (id 21,
  // nicht der 'Vogt-Meier'-Köder) — ein Fehlgriff auf die falsche Person würde sonst
  // still durchgehen.
  check("exakter Treffer wählt die KORREKTE Person (id 21)", exact.profile && exact.profile.mandateSourceId === "21", exact.profile && exact.profile.mandateSourceId);

  // ── 2c) GLEICHER NAME + GLEICHE PARTEI, KEIN Geburtsjahr -> mehrdeutig ───────
  // Zwei ECHTE, unterschiedliche Personen dürfen ohne Unterscheidungsmerkmal NICHT
  // still zu einer verschmelzen (kein stilles Raten) -> Auswahlliste.
  installFetch([
    ["/politicians?", { data: [
      { id: 61, label: "Hans Meier", first_name: "Hans", last_name: "Meier", party: { label: "SPD" } },
      { id: 62, label: "Hans Meier", first_name: "Hans", last_name: "Meier", party: { label: "SPD" } }
    ] }]
  ]);
  const twins = await lookup.lookupMandate({ name: "Hans Meier" });
  check("Namensgleich + parteigleich ohne Geburtsjahr -> 'ambiguous' (kein stilles Auto-Wählen)", twins.status === "ambiguous", twins.status);
  check("Namensgleich: beide Personen zur Auswahl (2 Kandidaten)", (twins.candidates || []).length === 2, String((twins.candidates || []).length));

  // ── 2d) DIESELBE Person aus zwei Datensätzen (gleiches Geburtsjahr) -> 1x ────
  installFetch([
    ["/politicians?", { data: [
      { id: 71, label: "Eva Klein", first_name: "Eva", last_name: "Klein", party: { label: "CDU" }, year_of_birth: 1970 },
      { id: 72, label: "Eva Klein", first_name: "Eva", last_name: "Klein", party: { label: "CDU" }, year_of_birth: 1970 }
    ] }],
    ["/candidacies-mandates?", { data: [] }],
    ["/committee-memberships?", { data: [] }]
  ]);
  const sameYob = await lookup.lookupMandate({ name: "Eva Klein" });
  check("Gleicher Name + Partei + Geburtsjahr = dieselbe Person -> 'found' (Dedup greift)", sameYob.status === "found", sameYob.status);

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

  // ── 4b) VERBINDLICHE HTTP-Klassifikation ────────────────────────────────────
  // GRUNDREGEL: KEIN Nicht-200 wird not_found. Ein 4xx/401/403/429/5xx/Netz
  // beweist NICHT die Nichtexistenz der Person; jeder Status bleibt intern getrennt.
  installFetch([["/politicians?", { __status: 400 }]]);
  const invalid400 = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("400 auf Query: status 'invalid_request' (NICHT not_found)", invalid400.status === "invalid_request", invalid400.status);
  check("400: KEIN Profil, sourceStatus 400 vermerkt (Telemetrie)", invalid400.profile === null && invalid400.sourceStatus === 400);

  installFetch([["/politicians?", { __status: 422 }]]);
  const invalid422 = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("422 auf Query: status 'invalid_request'", invalid422.status === "invalid_request", invalid422.status);

  installFetch([["/politicians?", { __status: 401 }]]);
  const denied401 = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("401 auf Query: status 'access_denied' (NICHT not_found)", denied401.status === "access_denied", denied401.status);

  // 403 (Egress-Proxy/AW/Sicherheitsregel blockt) -> access_denied, NIE not_found.
  installFetch([["/politicians?", { __status: 403 }]]);
  const denied403 = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("403 auf Query: status 'access_denied' (NICHT not_found)", denied403.status === "access_denied", denied403.status);
  check("403: KEIN Profil (kein hohles 'found')", denied403.profile === null);

  installFetch([["/politicians?", { __status: 429 }]]);
  const limited = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("429 auf Query: status 'rate_limited' (NICHT not_found/source_down)", limited.status === "rate_limited", limited.status);

  // ── 4c) 5xx = echter technischer Ausfall -> 'source_down' ───────────────────
  installFetch([["/politicians?", { __status: 503 }]]);
  const serverErr = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("5xx auf Query: status 'source_down' (technischer Ausfall)", serverErr.status === "source_down", serverErr.status);
  installFetch([["/politicians?", { __status: 500 }]]);
  const err500 = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("500 auf Query: status 'source_down'", err500.status === "source_down", err500.status);

  // ── 4c2) Timeout/Netzabbruch -> 'source_down' (kind 'network' in fetchJson) ──
  installFetch([["/politicians?", "THROW"]]);
  const timeout = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("Timeout/Netzausfall: status 'source_down'", timeout.status === "source_down", timeout.status);

  // ── 4c3) KEIN technischer Fehler wird als Nichtexistenz ausgegeben ──────────
  // (Anforderung #8: ein technischer Fehler darf nicht als „Person existiert nicht"
  // gespeichert werden — d. h. NIE not_found, NIE ein Profil.)
  for (const st of [400, 401, 403, 429, 500, 503]) {
    installFetch([["/politicians?", { __status: st }]]);
    const r = await lookup.lookupMandate({ name: "Katrin Vogt" });
    check(`HTTP ${st}: NICHT 'not_found' und KEIN Profil (keine Nichtexistenz gespeichert)`, r.status !== "not_found" && r.profile === null, `${r.status}`);
  }
  installFetch([["/politicians?", "THROW"]]);
  const rThrow = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("Timeout: NICHT 'not_found' und KEIN Profil", rThrow.status !== "not_found" && rThrow.profile === null, rThrow.status);

  // ── 4c4) Klassifikator direkt (Einheitentest der verbindlichen Zuordnung) ───
  check("classify: kind 'network' -> source_down", lookup.classifyLookupError({ kind: "network" }) === "source_down");
  check("classify: 500 -> source_down", lookup.classifyLookupError({ status: 500 }) === "source_down");
  check("classify: 429 -> rate_limited", lookup.classifyLookupError({ status: 429 }) === "rate_limited");
  check("classify: 403 -> access_denied", lookup.classifyLookupError({ status: 403 }) === "access_denied");
  check("classify: 401 -> access_denied", lookup.classifyLookupError({ status: 401 }) === "access_denied");
  check("classify: 400 -> invalid_request", lookup.classifyLookupError({ status: 400 }) === "invalid_request");
  check("classify: 422 -> invalid_request", lookup.classifyLookupError({ status: 422 }) === "invalid_request");
  check("classify: alle Fehlstatus sind KEINE Nichtexistenz", !lookup.LOOKUP_FAILURE_STATUSES.includes("not_found") && lookup.LOOKUP_FAILURE_STATUSES.length === 4);

  // ── 4d) Erste Query-Form 4xx, zweite liefert Treffer -> found (Fallback greift) ─
  installFetch([
    ["last_name[cn]", { __status: 400 }],
    ["/politicians?", { data: [politician(51, "Robust Fallback", "SPD")] }],
    ["/candidacies-mandates?", { data: [] }],
    ["/committee-memberships?", { data: [] }]
  ]);
  const fallback = await lookup.lookupMandate({ name: "Robust Fallback" });
  check("Query-Fallback: 1. Form 4xx, 2. Form liefert -> 'found'", fallback.status === "found", fallback.status);

  // ── 4e) Beide Formen blockiert (403) -> access_denied (nicht 'found'/'not_found') ─
  installFetch([["/politicians?", { __status: 403 }]]);
  const bothBlocked = await lookup.lookupMandate({ name: "Katrin Vogt" });
  check("Beide Query-Formen 403 -> 'access_denied'", bothBlocked.status === "access_denied", bothBlocked.status);

  // ── 4e2) Gemischt: Form1 5xx, Form2 200-leer -> 'not_found' (eine 200 kam an) ─
  // Kam MINDESTENS eine erfolgreiche 200-Antwort an, ist eine leere Trefferliste
  // eine echte Nichtexistenz — der 5xx der anderen Form ändert daran nichts.
  installFetch([
    ["last_name[cn]", { __status: 500 }],
    ["/politicians?", { data: [] }]
  ]);
  const mixed = await lookup.lookupMandate({ name: "Niemand Da" });
  check("Gemischt: Form1 5xx + Form2 200-leer -> 'not_found' (echte Nichtexistenz)", mixed.status === "not_found", mixed.status);

  // ── 4f) Treffer, aber Kernmandat-Abruf 5xx -> 'source_down' (kein hohles 'found') ─
  // Root-Cause-Prinzip „nie einen Ausfall verstecken": schlägt der Mandat-Abruf
  // NACH erfolgreicher Namenssuche technisch fehl, darf KEIN leeres, aber
  // „gefundenes" Profil entstehen.
  installFetch([
    ["/politicians?", { data: [politician(81, "Ausfall Danach", "SPD")] }],
    ["/candidacies-mandates?", { __status: 503 }],
    ["/committee-memberships?", { data: [] }]
  ]);
  const hollow = await lookup.lookupMandate({ name: "Ausfall Danach" });
  check("Treffer + Mandat-Abruf 5xx -> 'source_down' (nicht hohles 'found')", hollow.status === "source_down", hollow.status);
  check("Treffer + Mandat-Abruf 5xx -> KEIN Profil ausgeliefert", hollow.profile === null);

  // ── 4g) Treffer, Mandat-Abruf ERREICHBAR aber leer -> bleibt 'found' (legitim) ─
  // Gegenprobe zu 4f: eine leere, aber erreichbare Antwort ist KEIN Ausfall.
  installFetch([
    ["/politicians?", { data: [politician(82, "Leer Aber Da", "SPD")] }],
    ["/candidacies-mandates?", { data: [] }],
    ["/committee-memberships?", { data: [] }]
  ]);
  const emptyMandate = await lookup.lookupMandate({ name: "Leer Aber Da" });
  check("Treffer + leeres (erreichbares) Mandat -> bleibt 'found'", emptyMandate.status === "found", emptyMandate.status);

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
