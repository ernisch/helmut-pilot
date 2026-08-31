"use strict";

// Helmut — Vertragstest RÜCKSTANDSSCHLEIFE DES VERSTEHENS (Kapazitätssprint 2026-08-31).
// Offline, reine Funktionen und Attrappen — kein Netz, keine Datenbank, kein echter Modellaufruf.
// =============================================================================================
// BELEGTER ANLASS (Production rein lesend vermessen, 31.08.; Beleg
// docs/betrieb/understanding-kapazitaet-2026-08-31.md): 9.080 wartende Vorgänge, davon
// 8.895 älter als 24 h (ältester 02.07.), Ankunft Ø 307/Tag gegen Abfluss Ø 68/Tag. Die
// Auswahl (`updated_at.desc`, Fenster 50) bediente fast ausschließlich Vorgänge unter
// 24 h (älter als 7 Tage: 1–5/Tag) — strukturelles Verhungern. Gleichzeitig blieben im
// Schnitt ~19 Aufrufe des KI-Tagesdeckels ungenutzt (100 nur an 4 von 47 Tagen erreicht).
//
// DIE KORREKTUR: zwei zeitversetzte Rückstandsslots (11:30/17:30 UTC) auf einer eigenen
// Route, die denselben unveränderten Verstehensmotor fahren — älteste zuerst, Modell-
// aufrufe NICHT priorisiert gebucht (Tagesdeckel − Reserve), mit Laufdeckel und
// Budget-Boden, beide fail closed.
//
// Pflichtprüfungen dieses Sprints (Nummern aus dem Sprintauftrag):
//   §1  Konfiguration: fehlende/ungültige Werte fallen geschlossen auf sichere Defaults (P16)
//   §2  Wächter: Laufdeckel und Budget-Boden stoppen sicher; unklares Budget erlaubt nichts (P1, P15, P16)
//   §3  Buchungsklasse: Rückstandsaufrufe reservieren NICHT priorisiert (Deckel − Reserve),
//       der Frischpfad weiter priorisiert bis Deckel — Tagesdeckel nie überschritten (P1)
//   §4  Auswahl: älteste zuerst; alte Vorgänge werden nicht dauerhaft verdrängt (P6)
//   §5  Kein Vorgang erhält zwei Modellaufrufe; CAS-Reservierung bleibt exklusiv;
//       Fencing bleibt wirksam (P2, P3, P4 — Kernbeweise, Vollabdeckung in den CAS-Suiten)
//   §6  Globales Understanding-Schloss: zusätzliche Slots erzeugen keine Doppelarbeit (P7)
//   §7  Restzeitwache: der Rückstandslauf beginnt keine neue Arbeit zu spät (P9)
//   §8  Laufbilanz (PR #283): vertagte Arbeit sichtbar, Fehlerstatus/Zähler korrekt (P10, P11)
//   §9  Gesundheitsbericht: Rückstandsslots ehrlich überwacht, selbstverankert ohne
//       Deploy-Tag-Fehlalarm (P12)
//  §10  Kapazitätsrechnung: Deckel rechnerisch nie überschritten; berechneter Abfluss
//       unter dokumentierter Betreiberkonfiguration größer als die belegte Ankunft;
//       ungültige Eingaben fail closed (P13, P14, P15, P16)
//  §11  Quelltextverträge: Route, Cron-Zeiten, Deployment-Sperre, unveränderte
//       Prioritätsmenge, unveränderte Parallelität (P8)

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const rueckstand = require(path.join(ROOT, "lib/helmut/verstehen-rueckstand"));
const understanding = require(path.join(ROOT, "lib/helmut/understanding"));
const { runPendingUnderstandingShadow } = understanding;
const { laufBilanz } = require(path.join(ROOT, "lib/helmut/lauf-bilanz"));
const storage = require(path.join(ROOT, "lib/helmut/storage"));
const motorHealth = require(path.join(ROOT, "lib/helmut/motor-health"));
const restzeit = require(path.join(ROOT, "lib/helmut/verstehen-restzeit"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Gemessene Production-Ausgangswerte (24.–30.08., rein lesend erhoben; Beleg §2 des
// Kapazitätsdokuments). Sie sind hier FESTGESCHRIEBEN, damit die Rechnung des Belegs
// ausführbar bleibt — sie behaupten nichts über künftige Tage.
const MESSWERTE = {
  ankunftGesamtProTag: 307,          // Ø neu angelegte Wissensobjekte/Tag
  ankunftGateVerstehenProTag: 91,    // Ø Neuankünfte mit Gate-Urteil "verstehen"
  frischKiProTag: 72,                // priorisierte Verstehensaufrufe/Tag (2 Crons + Queue-Slots + Lage)
  andereVerbraucherKiProTag: 8,      // nicht priorisierte Aufrufe/Tag (Briefings, Lage, Büro)
  aufrufeJeSlot: 19,                 // ~220 s nutzbare Slotzeit / ~11,5 s Modellzeit
  aufrufeJeErgebnis: 1.09            // 845 Aufrufe / 772 fertige Vorgänge seit 17.08.
};

const ANALYSE = {
  headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
  display_title: "Haushaltsausschuss vertagt Foerderprogramm", display_summary: "s",
  why_relevant: "w", recommendation: "r", display_category: "Haushalt"
};

// Pending-Attrappen, bewusst mit Altersspreizung (ältester zuerst = korrekte Reihenfolge).
function baueAltbestand(n, { abIso = "2026-07-02T16:00:00Z" } = {}) {
  const start = Date.parse(abIso);
  return Array.from({ length: n }, (_, i) => ({
    id: `ko-alt-${i}`, vorgang_id: `vg-altbestand-${String(i).padStart(3, "0")}`,
    status: "pending", understanding_status: "pending",
    created_at: new Date(start + i * 86400e3).toISOString(),
    updated_at: new Date(start + i * 86400e3).toISOString()
  }));
}

function baueDeps(p, extra = {}) {
  const basis = {
    enabled: () => true,
    aiEnabled: () => true,
    gateMode: () => "off",
    acquireLock: async () => ({ granted: true }),
    releaseLock: async () => {},
    canSpend: async () => ({ allowed: true, used: 0, limit: 1000, remaining: 1000 }),
    requestUnderstanding: async () => { p.kiAufrufe += 1; return { ...ANALYSE }; },
    save: async (ko) => { p.gespeichert.push(ko.vorgang_id); return { saved: true, id: ko.id || `ko-${ko.vorgang_id}` }; },
    saveSources: async () => {},
    markFailed: async () => { p.markiertFehlgeschlagen += 1; },
    modelName: () => "test",
    logSkip: () => {},
    findVorgangCandidates: async () => [],
    listPending: async () => [],
    listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [] }),
    listVorgangDocuments: async (koId) => [{
      id: `rd-${koId}`, title: `Beleg fuer ${koId}`, published_at: "2026-08-01T08:00:00Z"
    }],
    getExisting: async () => null,
    verstehenVertrag: () => null,
    speicherWiederholungWarteMs: 0
  };
  const d = { ...basis, ...extra };
  if (!Object.prototype.hasOwnProperty.call(extra, "getExistingStreng")) d.getExistingStreng = d.getExisting;
  return d;
}

const neuesProtokoll = () => ({ kiAufrufe: 0, gespeichert: [], markiertFehlgeschlagen: 0 });

async function main() {
  abschnitt("§1 Konfiguration fail closed (P16)");
  {
    const leer = {};
    check("§1.1 Fenster-Default 120 ohne Env", rueckstand.rueckstandFenster(leer) === 120);
    check("§1.2 Laufdeckel-Default 20 ohne Env", rueckstand.rueckstandLaufDeckel(leer) === 20);
    check("§1.3 Budget-Boden-Default 30 (= dokumentierte Verstehens-Reserve) ohne Env",
      rueckstand.rueckstandBudgetBoden(leer) === 30);
    check("§1.4 ungültige Werte fallen auf Defaults zurück (nie optimistisch)",
      rueckstand.rueckstandFenster({ HELMUT_RUECKSTAND_FENSTER: "kaputt" }) === 120
      && rueckstand.rueckstandLaufDeckel({ HELMUT_RUECKSTAND_MAX_AUFRUFE: "NaN" }) === 20
      && rueckstand.rueckstandBudgetBoden({ HELMUT_RUECKSTAND_BUDGET_BODEN: "-x" }) === 30);
    check("§1.5 Klemmen wirken (Fenster 10–500, Laufdeckel 1–50, Boden ≥ 0)",
      rueckstand.rueckstandFenster({ HELMUT_RUECKSTAND_FENSTER: "99999" }) === 500
      && rueckstand.rueckstandFenster({ HELMUT_RUECKSTAND_FENSTER: "1" }) === 10
      && rueckstand.rueckstandLaufDeckel({ HELMUT_RUECKSTAND_MAX_AUFRUFE: "500" }) === 50
      && rueckstand.rueckstandLaufDeckel({ HELMUT_RUECKSTAND_MAX_AUFRUFE: "0" }) === 1
      && rueckstand.rueckstandBudgetBoden({ HELMUT_RUECKSTAND_BUDGET_BODEN: "-5" }) === 0);
    check("§1.6 gültige Werte werden übernommen",
      rueckstand.rueckstandFenster({ HELMUT_RUECKSTAND_FENSTER: "200" }) === 200
      && rueckstand.rueckstandLaufDeckel({ HELMUT_RUECKSTAND_MAX_AUFRUFE: "12" }) === 12
      && rueckstand.rueckstandBudgetBoden({ HELMUT_RUECKSTAND_BUDGET_BODEN: "50" }) === 50);
  }

  abschnitt("§2 Wächter: Laufdeckel + Budget-Boden stoppen sicher (P1, P15, P16)");
  {
    let used = 60;
    const w = rueckstand.baueRueckstandsWaechter({
      canSpendGlobal: async () => ({ allowed: true, used, limit: 100, remaining: 100 - used }),
      laufDeckel: 3, budgetBoden: 30
    });
    const e1 = await w.canSpend(); used += 1;
    const e2 = await w.canSpend(); used += 1;
    const e3 = await w.canSpend(); used += 1;
    const e4 = await w.canSpend();
    check("§2.1 die ersten drei Erlaubnisse werden erteilt",
      e1.allowed === true && e2.allowed === true && e3.allowed === true);
    check("§2.2 die vierte scheitert am Laufdeckel — Rückstandsabbau stoppt sicher",
      e4.allowed === false && e4.reason === "rueckstand-laufdeckel-erreicht");
    check("§2.3 der Wächter zählt genau die erteilten Erlaubnisse", w.erlaubnisse() === 3);
  }
  {
    const w = rueckstand.baueRueckstandsWaechter({
      canSpendGlobal: async () => ({ allowed: true, used: 70, limit: 100, remaining: 30 }),
      laufDeckel: 20, budgetBoden: 30
    });
    const e = await w.canSpend();
    check("§2.4 Rest ≤ Boden verweigert (die Verstehens-Reserve bleibt unangetastet)",
      e.allowed === false && e.reason === "rueckstand-budget-boden-erreicht" && w.erlaubnisse() === 0);
  }
  {
    const w = rueckstand.baueRueckstandsWaechter({
      canSpendGlobal: async () => ({ allowed: true, used: null, limit: null, remaining: null }),
      laufDeckel: 20, budgetBoden: 0
    });
    const e = await w.canSpend();
    check("§2.5 unbestimmbarer Reststand erlaubt NICHTS (strenger als der Frischpfad)",
      e.allowed === false && e.reason === "rueckstand-budget-unbekannt");
  }
  {
    const w = rueckstand.baueRueckstandsWaechter({
      canSpendGlobal: async () => { throw new Error("störung"); },
      laufDeckel: 20, budgetBoden: 0
    });
    const e = await w.canSpend();
    check("§2.6 eine werfende Budgetprüfung erlaubt NICHTS", e.allowed === false);
  }
  {
    const w = rueckstand.baueRueckstandsWaechter({
      canSpendGlobal: async () => ({ allowed: false, reason: "daily-llm-budget-reached", used: 100, limit: 100, remaining: 0 }),
      laufDeckel: 20, budgetBoden: 0
    });
    const e = await w.canSpend();
    check("§2.7 ein erreichter Tagesdeckel wird unverändert durchgereicht",
      e.allowed === false && e.reason === "daily-llm-budget-reached" && w.erlaubnisse() === 0);
  }

  abschnitt("§3 Buchungsklasse: nicht priorisiert = Deckel − Reserve (P1)");
  {
    const altLimit = process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
    const altReserve = process.env.HELMUT_LLM_RESERVE_UNDERSTANDING;
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "100";
    process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = "30";
    try {
      const gesehen = [];
      const rpc = async (params) => { gesehen.push(params); return { allowed: true, used: 1 }; };
      const usageToday = async () => ({ calls: 0 });
      const rRueck = await storage.reserveLlmCall({
        callType: rueckstand.RUECKSTAND_CALLTYPE, deps: { rpc, usageToday }
      });
      const rFrisch = await storage.reserveLlmCall({
        callType: "understanding", deps: { rpc, usageToday }
      });
      check("§3.1 Rückstandsaufrufe reservieren mit effectiveMax = 100 − 30 = 70",
        gesehen[0] && gesehen[0].p_max === 70 && rRueck.priority === false,
        JSON.stringify(gesehen[0]));
      check("§3.2 der Frischpfad bleibt priorisiert (effectiveMax = 100)",
        gesehen[1] && gesehen[1].p_max === 100 && rFrisch.priority === true,
        JSON.stringify(gesehen[1]));
      check("§3.3 beide buchen gegen DENSELBEN globalen Tageszähler (Scope global)",
        gesehen[0].p_scope === "global" && gesehen[1].p_scope === "global");
    } finally {
      if (altLimit === undefined) delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
      else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = altLimit;
      if (altReserve === undefined) delete process.env.HELMUT_LLM_RESERVE_UNDERSTANDING;
      else process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = altReserve;
    }
  }
  {
    // Der Prioritätsvorteil bleibt exakt EINEM callType vorbehalten — die
    // Rückstandsklasse darf dort nie hineinrutschen.
    const storageSrc = src("lib/helmut/storage.js");
    check("§3.4 LLM_PRIORITY_CALLTYPES bleibt exakt {'understanding'}",
      /LLM_PRIORITY_CALLTYPES = new Set\(\["understanding"\]\)/.test(storageSrc));
    check("§3.5 der Rückstands-callType ist NICHT 'understanding'",
      rueckstand.RUECKSTAND_CALLTYPE !== "understanding"
      && rueckstand.RUECKSTAND_CALLTYPE.startsWith("understanding-"));
  }

  abschnitt("§4 Auswahl: älteste zuerst, keine dauerhafte Verdrängung (P6)");
  {
    const storageSrc = src("lib/helmut/storage.js");
    check("§4.1 die Reihenfolgen sind eine Whitelist (neueste=updated_at.desc, aelteste=created_at.asc)",
      /KO_REIHENFOLGEN = Object\.freeze\(\{\s*\n\s*neueste: "updated_at\.desc",\s*\n\s*aelteste: "created_at\.asc"\s*\n\s*\}\)/.test(storageSrc));
    // Gate-Arm 2026-08-31: die Durchreiche traegt zusaetzlich `ohneGateGeparkt: true`
    // (geparkte Vorgaenge serverseitig raus, sonst verdraengen sie das Fenster) —
    // die Reihenfolge-Durchreiche selbst ist unveraendert Vertragsinhalt.
    check("§4.2 listPendingKnowledgeObjects reicht die Reihenfolge durch",
      /listPendingKnowledgeObjects\(\{ limit = 50, reihenfolge = "neueste" \} = \{\}\)/.test(storageSrc)
      && /listKnowledgeObjects\(\{ status: "pending", limit, reihenfolge, ohneGateGeparkt: true \}\)/.test(storageSrc));
    check("§4.3 ein unbekannter Reihenfolgewert fällt geschlossen auf das Bestandsverhalten zurück",
      /KO_REIHENFOLGEN\[reihenfolge\] \|\| KO_REIHENFOLGEN\.neueste/.test(storageSrc));
  }
  {
    // Verhaltensbeweis: der Motor arbeitet die Liste in der gelieferten Reihenfolge ab —
    // liefert die Auswahl die ältesten zuerst, bekommen GENAU sie die Modellaufrufe.
    const p = neuesProtokoll();
    const bestand = baueAltbestand(5);
    const reihenfolge = [];
    const r = await runPendingUnderstandingShadow([], baueDeps(p, {
      listPending: async () => bestand,
      requestUnderstanding: async () => { p.kiAufrufe += 1; return { ...ANALYSE }; },
      save: async (ko) => { reihenfolge.push(ko.vorgang_id); return { saved: true, id: ko.id || "x" }; }
    }));
    check("§4.4 alle fünf ältesten Vorgänge wurden verarbeitet",
      reihenfolge.length === 5 && !r.skipped, JSON.stringify({ reihenfolge, r: r.reason }));
    check("§4.5 exakt in Altersreihenfolge (ältester zuerst)",
      reihenfolge.join("|") === bestand.map((k) => k.vorgang_id).join("|"), reihenfolge.join("|"));
  }

  abschnitt("§5 Kein zweiter Modellaufruf je Vorgang (P2, P3, P4)");
  {
    // KERNBEWEIS über den ECHTEN Vertragsadapter (verstehen-vertrag.js) mit einer
    // CAS-Attrappe: derselbe Vorgang, zwei aufeinanderfolgende Rückstandsläufe mit
    // identischer Dokumentlage — der zweite Lauf endet an der Reservierung
    // (bereits-fertig, identischer Eingabehash) und ruft NIE ein zweites Mal das Modell.
    const vertragModul = require(path.join(ROOT, "lib/helmut/verstehen-vertrag"));
    const zeilen = new Map();
    const hole = (id) => {
      if (!zeilen.has(id)) {
        zeilen.set(id, { besitzer: null, fencing: 0, leaseBis: null, zustand: "offen", eingabeHash: null, versuche: 0, kiAufrufe: 0 });
      }
      return zeilen.get(id);
    };
    const speicher = {
      async verstehenReserviere({ vorgangId, eingabeHash, besitzer, ttlMs }) {
        const r = hole(vorgangId);
        if (r.zustand === "fertig" && r.eingabeHash === eingabeHash) {
          return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: "fertig", grund: "bereits-fertig" };
        }
        r.fencing += 1; r.besitzer = besitzer; r.leaseBis = Date.now() + ttlMs;
        r.zustand = "reserviert"; r.eingabeHash = eingabeHash; r.versuche += 1;
        return { verfuegbar: true, erlaubt: true, fencing: r.fencing, zustand: "reserviert", grund: "uebernommen" };
      },
      async verstehenModellstart({ vorgangId, besitzer, fencing, ttlMs }) {
        const r = hole(vorgangId);
        if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "reserviert") return { verfuegbar: true, ok: false };
        r.zustand = "modell-laeuft"; r.kiAufrufe += 1; r.leaseBis = Date.now() + ttlMs;
        return { verfuegbar: true, ok: true };
      },
      async verstehenSchreibrecht({ vorgangId, besitzer, fencing, ttlMs }) {
        const r = hole(vorgangId);
        if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "modell-laeuft") return { verfuegbar: true, ok: false };
        r.leaseBis = Date.now() + ttlMs;
        return { verfuegbar: true, ok: true };
      },
      async verstehenSpeichere({ vorgangId, besitzer, fencing }) {
        const r = hole(vorgangId);
        if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "modell-laeuft") return { verfuegbar: true, ergebnis: "fencing-veraltet" };
        r.zustand = "fertig"; r.besitzer = null; r.leaseBis = null;
        return { verfuegbar: true, ergebnis: "gespeichert" };
      },
      async verstehenAusgangUnbekannt({ vorgangId }) {
        const r = hole(vorgangId);
        r.zustand = "unbekannt"; r.besitzer = null; r.leaseBis = null;
        return { verfuegbar: true, blockiert: true, ergebnis: "unbekannt" };
      },
      async verstehenAbschluss() { return { verfuegbar: true, ok: true }; },
      async verstehenFreigabe({ vorgangId }) { const r = hole(vorgangId); r.zustand = "offen"; r.besitzer = null; return { ok: true }; },
      async verstehenFreigabeOhneAufruf({ vorgangId }) { const r = hole(vorgangId); r.zustand = "offen"; r.besitzer = null; return { ok: true }; },
      async verstehenVormerkungLese() { return { verfuegbar: true, eintraege: {} }; },
      async verstehenVormerkungErhoehe() { return { verfuegbar: true, fehlversuche: 1 }; },
      async verstehenVormerkungLoese() { return { ok: true }; }
    };
    const item = baueAltbestand(1)[0];
    const dokumente = [{ id: "rd-a", title: "Beleg", published_at: "2026-07-01T08:00:00Z" }];
    const laufDeps = (p) => baueDeps(p, {
      listPending: async () => [{ ...item }],
      listVorgangDocuments: async () => dokumente,
      verstehenVertrag: () => vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } })
    });
    const p1 = neuesProtokoll();
    await runPendingUnderstandingShadow([], laufDeps(p1));
    const p2 = neuesProtokoll();
    const r2 = await runPendingUnderstandingShadow([], laufDeps(p2));
    const zeile = zeilen.get(item.vorgang_id);
    check("§5.1 erster Lauf: genau EIN Modellaufruf, Vorgang fertig",
      p1.kiAufrufe === 1 && zeile && zeile.zustand === "fertig" && zeile.kiAufrufe === 1,
      JSON.stringify({ ki: p1.kiAufrufe, zeile }));
    check("§5.1b zweiter Lauf: NULL weitere Modellaufrufe (bereits-fertig an der CAS-Reservierung)",
      p2.kiAufrufe === 0 && zeile.kiAufrufe === 1,
      JSON.stringify({ ki: p2.kiAufrufe, results: (r2.results || []).map((x) => x && x.status) }));
  }
  {
    // Quelltextvertrag: die Route überschreibt AUSSCHLIESSLICH Auswahl, Budget-Vorprüfung
    // und Buchungsklasse — CAS-Vertrag, Vorgangswache, Speicher- und Modellpfad bleiben
    // die unveränderten Defaults des Motors.
    const serverSrc = src("server.js");
    const i = serverSrc.indexOf('url.pathname === "/api/cron/understanding-rueckstand"');
    // Blockgrenze statt festem Zeichenfenster (dasselbe Brüchigkeitsmuster wie der
    // in PR #283 behobene kostenmessung-Test): der Vertrag liest die GANZE Route
    // bis zur nächsten Route — Einschübe wie die Vorab-Bodenprüfung (2026-09-01)
    // verschieben die Anker sonst still aus dem Fenster.
    const ende = i >= 0 ? serverSrc.indexOf("if (url.pathname === ", i + 10) : -1;
    const block = i >= 0 ? serverSrc.slice(i, ende > i ? ende : i + 8000) : "";
    check("§5.2 die Route existiert und ist cron-geschützt",
      i >= 0 && /authorizeCron\(request, url, response\)/.test(block));
    check("§5.3 nur listPending, canSpend und callType werden überschrieben",
      /listPending:/.test(block) && /canSpend: waechter\.canSpend/.test(block)
      && /callType: verstehenRueckstand\.RUECKSTAND_CALLTYPE/.test(block)
      && !/verstehenVertrag:/.test(block) && !/clusterWache:/.test(block)
      && !/requestUnderstanding:/.test(block) && !/save:/.test(block));
    check("§5.4 kein Recovery-Vorlauf im Rückstandspfad (gehört zum Frischpfad)",
      !/recoverFailedUnderstanding/.test(block));
    check("§5.5 identische Zeitgrenzen wie der Frischlauf (280-s-Deadline, 240-s-Loop-Budget)",
      /deadlineMs: rueckstandStartMs \+ 280000/.test(block)
      && /HELMUT_UNDERSTAND_BUDGET_MS \|\| 240000/.test(block));
  }

  abschnitt("§6 Globales Schloss: keine Doppelarbeit zwischen den Slots (P7)");
  {
    const p = neuesProtokoll();
    const r = await runPendingUnderstandingShadow([], baueDeps(p, {
      listPending: async () => baueAltbestand(3),
      acquireLock: async () => ({ granted: false })
    }));
    check("§6.1 ohne Schloss läuft nichts (understanding-locked), 0 Modellaufrufe",
      r.skipped === true && r.reason === "understanding-locked" && p.kiAufrufe === 0,
      JSON.stringify({ skipped: r.skipped, reason: r.reason }));
  }
  {
    const serverSrc = src("server.js");
    const i = serverSrc.indexOf('url.pathname === "/api/cron/understanding-rueckstand"');
    const block = i >= 0 ? serverSrc.slice(i, i + 3200) : "";
    check("§6.2 die Route überschreibt acquireLock NICHT (dasselbe globale Schloss)",
      i >= 0 && !/acquireLock:/.test(block));
  }

  abschnitt("§7 Restzeitwache: keine neue Arbeit zu spät (P9)");
  {
    const p = neuesProtokoll();
    // Deadline so knapp, dass die Vor-Modellstart-Reserve sie sofort reißt —
    // übergeben als Override (dieselbe Stelle, an der die Route ihre 280-s-Deadline setzt).
    const deadline = Date.now() + restzeit.reserveVorModellstartMs() - 1000;
    const r = await runPendingUnderstandingShadow([], baueDeps(p, {
      listPending: async () => baueAltbestand(4),
      deadlineMs: deadline
    }));
    check("§7.1 bei erschöpfter Restzeit: 0 Modellaufrufe, alles ehrlich vertagt",
      p.kiAufrufe === 0 && ((r.deferred || 0) >= 1 || r.skipped === true),
      JSON.stringify({ ki: p.kiAufrufe, deferred: r.deferred, skipped: r.skipped }));
  }

  abschnitt("§8 Laufbilanz: Status und Zähler bleiben ehrlich (P10, P11)");
  {
    const p = neuesProtokoll();
    let aufrufe = 0;
    const w = rueckstand.baueRueckstandsWaechter({
      canSpendGlobal: async () => ({ allowed: true, used: 10, limit: 100, remaining: 90 }),
      laufDeckel: 2, budgetBoden: 30
    });
    const r = await runPendingUnderstandingShadow([], baueDeps(p, {
      listPending: async () => baueAltbestand(4),
      canSpend: w.canSpend,
      requestUnderstanding: async () => {
        aufrufe += 1;
        if (aufrufe === 2) throw new Error("synthetischer Modellfehler");
        return { ...ANALYSE };
      }
    }));
    const bilanz = laufBilanz(r);
    check("§8.1 gemischter Lauf ergibt partial — nie success mit Fehlerfall",
      bilanz.status === "partial", `status=${bilanz.status}`);
    check("§8.2 die vier Hauptzähler decken die Arbeitsliste exakt (Identität aus PR #283)",
      bilanz.stimmig === true
      && (bilanz.gespeichert + bilanz.uebersprungen + bilanz.fehlgeschlagen + bilanz.vertagt) === bilanz.cluster,
      JSON.stringify(bilanz));
    check("§8.3 vertagte Arbeit bleibt eigenständig sichtbar (Laufdeckel → skipped-budget → vertagt)",
      bilanz.vertagt >= 2, JSON.stringify(bilanz));
    check("§8.4 genau 1 gespeichert, genau 1 fehlgeschlagen",
      bilanz.gespeichert === 1 && bilanz.fehlgeschlagen === 1, JSON.stringify(bilanz));
    check("§8.5 der Wächter hat exakt seine zwei Erlaubnisse erteilt", w.erlaubnisse() === 2);
  }

  abschnitt("§9 Gesundheitsbericht: ehrlich überwacht, ohne Deploy-Tag-Fehlalarm (P12)");
  {
    const nowMs = Date.parse("2026-09-02T20:00:00Z");
    const basisQuittungen = [
      { process: "understanding-cron", status: "success", startedAt: "2026-09-02T05:31:00Z" },
      { process: "briefing-morning", status: "success", startedAt: "2026-09-02T05:01:00Z" },
      { process: "briefing-lage", status: "success", startedAt: "2026-09-02T05:46:00Z" },
      { process: "understanding-cron", status: "success", startedAt: "2026-09-01T21:31:00Z" }
    ];
    const ohneRueckstand = motorHealth.pruefeSlotQuittungen({ quittungen: basisQuittungen, nowMs });
    check("§9.1 VOR der ersten Rückstandsquittung wird kein Rückstandsslot erzwungen (kein Deploy-Fehlalarm)",
      !(ohneRueckstand.fehlendeSlots || []).some((s) => String(s).includes("understanding-rueckstand")),
      JSON.stringify(ohneRueckstand.fehlendeSlots));
    const mitErster = motorHealth.pruefeSlotQuittungen({
      quittungen: [...basisQuittungen,
        { process: "understanding-rueckstand", status: "success", startedAt: "2026-09-01T11:31:00Z" }],
      nowMs
    });
    check("§9.2 NACH der ersten Quittung wird ein fehlender Rückstandsslot ehrlich gemeldet",
      (mitErster.fehlendeSlots || []).some((s) => String(s).includes("understanding-rueckstand")),
      JSON.stringify(mitErster.fehlendeSlots));
    const mitHeutigen = motorHealth.pruefeSlotQuittungen({
      quittungen: [...basisQuittungen,
        { process: "understanding-rueckstand", status: "success", startedAt: "2026-09-01T11:31:00Z" },
        { process: "understanding-rueckstand", status: "success", startedAt: "2026-09-02T11:31:00Z" },
        { process: "understanding-rueckstand", status: "partial", startedAt: "2026-09-02T17:31:00Z" }],
      nowMs
    });
    check("§9.3 ein partial-Rückstandslauf erscheint als Störung (kein falsches Grün)",
      (mitHeutigen.teilweiseSlots || []).some((s) => s && s.process === "understanding-rueckstand"),
      JSON.stringify((mitHeutigen.teilweiseSlots || []).map((s) => s.slot)));
  }

  abschnitt("§10 Kapazitätsrechnung: Deckel hält, Abfluss > belegte Ankunft (P13, P14, P15)");
  {
    const basis = {
      frischKiProTag: MESSWERTE.frischKiProTag,
      andereVerbraucherKiProTag: MESSWERTE.andereVerbraucherKiProTag,
      aufrufeJeSlot: MESSWERTE.aufrufeJeSlot,
      laufDeckel: 20,
      reserveVerstehen: 30,
      aufrufeJeErgebnis: MESSWERTE.aufrufeJeErgebnis
    };
    const heute = rueckstand.kapazitaetsRechnung({ ...basis, slotsRueckstand: 0, tagesdeckel: 100 });
    check("§10.1 Ist-Zustand: Rechnung trifft den gemessenen Abfluss (Ø 68/Tag, Toleranz ±10)",
      heute.gueltig && Math.abs(heute.abflussProTag - 68) <= 10,
      JSON.stringify(heute));
    const mitSlots = rueckstand.kapazitaetsRechnung({ ...basis, slotsRueckstand: 2, tagesdeckel: 100 });
    check("§10.2 +2 Slots bei Deckel 100: mehr Abfluss, Deckel NIE überschritten",
      mitSlots.gueltig && mitSlots.abflussProTag > heute.abflussProTag
      && mitSlots.gesamtKiProTag <= 100,
      JSON.stringify(mitSlots));
    const betreiber = rueckstand.kapazitaetsRechnung({ ...basis, slotsRueckstand: 2, tagesdeckel: 200 });
    check("§10.3 Betreiberkonfiguration (Deckel 200): berechneter Abfluss > belegte gate-würdige Ankunft (Ø 91/Tag)",
      betreiber.gueltig && betreiber.abflussProTag > MESSWERTE.ankunftGateVerstehenProTag,
      JSON.stringify(betreiber));
    check("§10.4 EHRLICH: auch mit Deckel 200 bleibt der Abfluss UNTER der Gesamtankunft (Ø 307/Tag) — "
      + "ohne Gate-Entscheidung des Betreibers gibt es keine Gesamtstabilität",
      betreiber.gueltig && betreiber.abflussProTag < MESSWERTE.ankunftGesamtProTag,
      JSON.stringify(betreiber));
    const vollausbau = rueckstand.kapazitaetsRechnung({
      ...basis, frischKiProTag: 110, slotsRueckstand: 12, tagesdeckel: 400
    });
    check("§10.5 erst eine dokumentierte Vollausbau-Konfiguration (Deckel 400, 12 Slots) trüge die Gesamtankunft",
      vollausbau.gueltig && vollausbau.abflussProTag > MESSWERTE.ankunftGesamtProTag,
      JSON.stringify(vollausbau));
    for (const szenario of [heute, mitSlots, betreiber, vollausbau]) {
      if (!szenario.gueltig) continue;
      if (szenario.gesamtKiProTag > (szenario === vollausbau ? 400 : (szenario === betreiber ? 200 : 100))) {
        check("§10.6 Deckel-Invariante verletzt", false, JSON.stringify(szenario));
      }
    }
    check("§10.6 Deckel-Invariante hielt in allen Szenarien", true);
    const kaputt = rueckstand.kapazitaetsRechnung({ ...basis, slotsRueckstand: 2 });
    check("§10.7 fehlende Eingaben machen die Rechnung ungültig statt optimistisch (P16)",
      kaputt.gueltig === false && String(kaputt.grund || "").startsWith("eingabe-fehlt"),
      JSON.stringify(kaputt));
  }

  abschnitt("§11 Quelltext- und Konfigurationsverträge (P8)");
  {
    const vercel = JSON.parse(src("vercel.json"));
    const crons = vercel.crons || [];
    const rueckstandCrons = crons.filter((c) => c.path === "/api/cron/understanding-rueckstand");
    check("§11.1 genau zwei Rückstandsslots: 11:30 und 17:30 UTC (≥ 30 min Abstand zu jedem anderen Slot)",
      rueckstandCrons.length === 2
      && rueckstandCrons.map((c) => c.schedule).sort().join("|") === "30 11 * * *|30 17 * * *");
    check("§11.2 die elf bestehenden Cron-Einträge sind unverändert",
      crons.length === 13
      && crons.filter((c) => c.path === "/api/cron/understanding").length === 2);
    check("§11.3 der Diagnose-Branch ist für Deployments gesperrt",
      vercel.git.deploymentEnabled["claude/understanding-kapazitaet-diagnose-7meqjr"] === false);
    check("§11.4 main bleibt entsperrt (kein Eintrag, keine Sperre)",
      !Object.prototype.hasOwnProperty.call(vercel.git.deploymentEnabled, "main"));
    check("§11.5 die bestehenden Sperren bleiben unverändert",
      vercel.git.deploymentEnabled["codex/ki-antwortumschlag-hardening"] === false
      && vercel.git.deploymentEnabled["claude/understanding-telemetrie-korrektur-ty5gb2"] === false);
  }
  {
    const undSrc = src("lib/helmut/understanding.js");
    check("§11.6 der Standard-callType des Motors bleibt 'understanding' (Frischpfad byte-identisch)",
      /ctx && ctx\.callType \? String\(ctx\.callType\) : "understanding"/.test(undSrc));
    const serverSrc = src("server.js");
    const i = serverSrc.indexOf('url.pathname === "/api/cron/understanding-rueckstand"');
    const block = i >= 0 ? serverSrc.slice(i, i + 3200) : "";
    check("§11.7 die Route setzt KEINE Parallelität und lockert keine Grenze (P8)",
      i >= 0 && !/PARALLELITAET|parallelitaet/i.test(block));
    check("§11.8 die Route quittiert als eigener Prozess 'understanding-rueckstand'",
      /process: "understanding-rueckstand"/.test(block));
    check("§11.9 der Frisch-Cron bleibt unverändert auf listPending-Default (kein Umbau des bewährten Pfads)",
      (() => {
        const j = serverSrc.indexOf('url.pathname === "/api/cron/understanding"');
        const frisch = j >= 0 ? serverSrc.slice(j, j + 3600) : "";
        return j >= 0 && !/listPending:/.test(frisch) && !/reihenfolge/.test(frisch);
      })());
  }

  abschnitt("§12 Quittung trägt den Wächterblock (Befund 1. Naturlauf 31.08.)");
  {
    // BELEGTER ANLASS: der erste natuerliche Rueckstandslauf (31.08. 11:30 UTC,
    // success, 18/0/0/95) quittierte OHNE seinen telemetrie.rueckstand-Block —
    // sanitizeProcessRun und die relationale Projektion whitelisteten ihn weg,
    // waehrend die Route glaubte, ihn zu persistieren (CLAUDE.md §4.10). Diese
    // Pruefung laesst den Block durch die GESAMTE Kette laufen: sanitize ->
    // relationale Zeile -> Rueckabbildung.
    const { sanitizeProcessRun } = require("../lib/helmut/storage");
    const { processRunToRelationalRow, relationalRowToProcessRun } = require("../lib/helmut/blob-relational");
    const clean = sanitizeProcessRun({
      process: "understanding-rueckstand", runId: "t-r1", status: "success",
      telemetrie: {
        cluster: 113,
        rueckstand: {
          fenster: 120, laufDeckel: 20, budgetBoden: 30, erlaubnisse: 18,
          wiedervorlage: { skipped: true, reason: "gate-nicht-scharf" }
        }
      }
    });
    check("§12.1 sanitize behält den Wächterblock (nur Zahlen + Wiedervorlage-Marker)",
      clean.rueckstand && clean.rueckstand.fenster === 120 && clean.rueckstand.laufDeckel === 20
      && clean.rueckstand.budgetBoden === 30 && clean.rueckstand.erlaubnisse === 18
      && clean.rueckstand.wiedervorlage && clean.rueckstand.wiedervorlage.uebersprungen === true);
    check("§12.2 sanitize übernimmt KEINEN Freitext aus der Wiedervorlage (kein reason-Feld)",
      !("reason" in (clean.rueckstand.wiedervorlage || {})));
    const row = processRunToRelationalRow(clean);
    check("§12.3 die relationale Projektion trägt den Block im telemetrie-jsonb",
      row.telemetrie && row.telemetrie.rueckstand && row.telemetrie.rueckstand.erlaubnisse === 18);
    const zurueck = relationalRowToProcessRun(row);
    check("§12.4 die Rückabbildung liefert den Block unverändert (Dual-Read-Parität)",
      zurueck.rueckstand && zurueck.rueckstand.laufDeckel === 20 && zurueck.rueckstand.budgetBoden === 30);
    const ohne = sanitizeProcessRun({ process: "understanding", runId: "t-r2", status: "success", telemetrie: { cluster: 5 } });
    check("§12.5 Läufe ohne Wächterblock bleiben byte-identisch (rueckstand=null, kein Geisterfeld)",
      ohne.rueckstand === null && !("rueckstand" in (processRunToRelationalRow(ohne).telemetrie || {})));
  }

  console.log(`\nERGEBNIS: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("Testlauf abgebrochen:", e && e.stack || e);
  process.exit(1);
});
