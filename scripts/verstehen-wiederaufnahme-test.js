"use strict";

// Helmut — Vertragstest WIEDERAUFNAHME AUSDRUECKLICH FREIGEGEBENER VORGAENGE (OP-30 §30).
// Offline, Attrappen — kein Netz, keine Datenbank, kein echter Modellaufruf.
// =============================================================================================
// BELEGTE LUECKE (Production 2026-08-21/22): ein per kanonischem Betreiberweg
// (`helmut_verstehen_ausgang_aufloesen(..., 'erneut')`) freigegebener Vorgang steht auf
// `zustand='offen'`, ist aber in KEINER Liste, die ein regulaerer Verstehenslauf abarbeitet.
// `runPendingUnderstandingShadow` las ausschliesslich Wissensobjekte mit `status='pending'`;
// ein Vorgang mit bestehendem `complete`-KO (oder ganz ohne KO) war dort nie enthalten. Er
// kam nur dran, wenn sein Cluster ZUFAELLIG durch neue Dokumente erneut gebildet wurde.
// Messbare Folge: 0caefc33 und vier weitere blieben ueber vier Slots offen, obwohl allein der
// 21:30-Lauf 18 Vorgaenge verarbeitete.
//
//   §1 Kernbeweis: ein freigegebener Vorgang ist OHNE jede Clusterbildung (rawDocs = [])
//      reservierbar und wird verstanden — die Abhaengigkeit ist aufgehoben
//   §2 Vorgang MIT complete-KO und Vormerkung: Wiederaufnahme ueber den Update-Pfad
//   §3 Vorgang OHNE KO: aufgenommen; ohne auffindbare Quellen ehrlich `skipped-no-cluster`
//      (KEIN Modellaufruf), mit Kennungstreffer regulaeres Erstverstehen
//   §4 ENGE GRENZE: ausschliesslich `erneut-freigegeben` — keine pauschale Wiederverarbeitung
//   §5 Ausgeschoepftes Versuchslimit: kein weiterer Modellaufruf
//   §6 Parallele Laeufe: genau EIN Modellaufruf, keine verwaiste Lease
//   §7 Erfolg setzt `fertig` und loest die Vormerkung vertragsgemaess
//   §8 Erneuter Fehler endet ehrlich (`unbekannt`), kein Doppelaufruf, kein stilles Verschwinden
//   §9 Fail closed: ein Lesefehler der Wiederaufnahmeliste gilt NICHT als „kein Rueckstand"
//  §10 Selbstbegrenzung, Grenzen und Quelltextvertraege (inkl. Restzeitwache unveraendert)
//  §11 REVIEW-KORREKTUR: die belegten Produktionsfaelle (complete-KO ohne Vormerkung,
//      geparktes KO) werden wirklich geloest — und OHNE Freigabe bleiben beide Vorfilter scharf
//  §12 REVIEW-KORREKTUR: Vertragsbindung (kein Pfad ohne CAS-Flag), Zeit-Gate vor der
//      Vorarbeit, strenger Bestandsleser statt stillem Ueberschreiben, `desc`-Sortierung

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const vertragModul = require(path.join(ROOT, "lib/helmut/verstehen-vertrag"));
const understanding = require(path.join(ROOT, "lib/helmut/understanding"));
const { runPendingUnderstandingShadow } = understanding;

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// ── Attrappe der CAS-Datenbankseite (bildet 20260814180000 nach) ─────────────────────────────
function baueSpeicherAttrappe({ start = {} } = {}) {
  const zeilen = new Map();
  const kos = new Map();
  const vormerkungen = new Map();
  const hole = (id) => {
    if (!zeilen.has(id)) {
      zeilen.set(id, {
        besitzer: null, fencing: 0, leaseBis: null, zustand: "offen",
        eingabeHash: null, ergebnisHash: null, versuche: 0, kiAufrufe: 0, letzterGrund: null,
        ...(start[id] || {})
      });
    }
    return zeilen.get(id);
  };
  for (const id of Object.keys(start)) hole(id);
  const attrappe = {
    zeilen, kos, vormerkungen,
    async verstehenReserviere({ vorgangId, eingabeHash, besitzer, ttlMs }) {
      const r = hole(vorgangId);
      if (r.zustand === "aufgegeben") return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: r.zustand, grund: "aufgegeben" };
      if (r.zustand === "unbekannt") return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: r.zustand, grund: "ausgang-unbekannt" };
      if (r.zustand === "fertig" && r.eingabeHash === eingabeHash) return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: "fertig", grund: "bereits-fertig" };
      if (["reserviert", "modell-laeuft"].includes(r.zustand) && r.leaseBis > Date.now()) {
        if (r.besitzer === besitzer) { r.leaseBis = Date.now() + ttlMs; return { verfuegbar: true, erlaubt: true, fencing: r.fencing, zustand: r.zustand, grund: "wiedereintritt" }; }
        return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: r.zustand, grund: "belegt" };
      }
      r.fencing += 1; r.besitzer = besitzer; r.leaseBis = Date.now() + ttlMs;
      r.zustand = "reserviert"; r.eingabeHash = eingabeHash; r.versuche += 1; r.letzterGrund = null;
      return { verfuegbar: true, erlaubt: true, fencing: r.fencing, zustand: "reserviert", grund: "uebernommen" };
    },
    async verstehenModellstart({ vorgangId, besitzer, fencing, ttlMs }) {
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "reserviert" || !(r.leaseBis > Date.now())) {
        return { verfuegbar: true, ok: false };
      }
      r.zustand = "modell-laeuft"; r.kiAufrufe += 1; r.leaseBis = Date.now() + ttlMs;
      return { verfuegbar: true, ok: true };
    },
    async verstehenSchreibrecht({ vorgangId, besitzer, fencing, ttlMs }) {
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "modell-laeuft" || !(r.leaseBis > Date.now())) {
        return { verfuegbar: true, ok: false };
      }
      r.leaseBis = Date.now() + ttlMs;
      return { verfuegbar: true, ok: true };
    },
    async verstehenSpeichere({ vorgangId, besitzer, fencing, ko, ergebnisHash }) {
      const r = hole(vorgangId);
      if (r.fencing !== fencing) return { verfuegbar: true, ergebnis: "fencing-veraltet" };
      if (r.zustand !== "modell-laeuft") return { verfuegbar: true, ergebnis: `zustand-${r.zustand}` };
      if (r.besitzer !== besitzer) return { verfuegbar: true, ergebnis: "fremder-besitzer" };
      if (!(r.leaseBis > Date.now())) return { verfuegbar: true, ergebnis: "lease-abgelaufen" };
      kos.set(vorgangId, { fencing, koVersion: Number(ko && ko.ko_version) || 1 });
      r.zustand = "fertig"; r.ergebnisHash = ergebnisHash; r.besitzer = null; r.leaseBis = null; r.letzterGrund = null;
      return { verfuegbar: true, ergebnis: "gespeichert" };
    },
    async verstehenAusgangUnbekannt({ vorgangId, grund }) {
      const r = hole(vorgangId);
      if (r.zustand !== "modell-laeuft") return { verfuegbar: true, blockiert: false, ergebnis: `zustand-${r.zustand}` };
      r.zustand = "unbekannt"; r.besitzer = null; r.leaseBis = null; r.letzterGrund = String(grund || "").slice(0, 200);
      return { verfuegbar: true, blockiert: true, ergebnis: "unbekannt" };
    },
    async verstehenAbschluss() { return { verfuegbar: true, ok: true }; },
    async verstehenFreigabe({ vorgangId, besitzer }) {
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer) return { ok: false };
      r.zustand = "offen"; r.besitzer = null; r.leaseBis = null; r.letzterGrund = "kein-ergebnis-vor-modellstart";
      return { ok: true };
    },
    async verstehenFreigabeOhneAufruf({ vorgangId, besitzer, fencing, grund }) {
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer || r.fencing !== fencing) return { ok: false };
      if (r.zustand === "modell-laeuft") r.kiAufrufe = Math.max(0, r.kiAufrufe - 1);
      r.zustand = "offen"; r.besitzer = null; r.leaseBis = null;
      r.letzterGrund = ("belegt-ohne-aufruf:" + (grund || "unbenannt")).slice(0, 200);
      return { ok: true };
    },
    async verstehenVormerkungLese(ids) {
      const eintraege = {};
      for (const id of ids || []) if (vormerkungen.has(id)) eintraege[id] = vormerkungen.get(id);
      return { verfuegbar: true, eintraege };
    },
    async verstehenVormerkungErhoehe({ vorgangId, delta }) {
      const bisher = vormerkungen.get(vorgangId) || 0;
      const neu = bisher + Math.max(0, Number(delta) || 0);
      vormerkungen.set(vorgangId, neu);
      return { verfuegbar: true, fehlversuche: neu };
    },
    async verstehenVormerkungLoese({ vorgangId }) {
      const gab = vormerkungen.delete(vorgangId);
      return { ok: gab };
    }
  };
  return attrappe;
}

const ANALYSE = {
  headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
  display_title: "Bundesregierung praesentiert Pflegereform", display_summary: "s",
  why_relevant: "w", recommendation: "r", display_category: "Sozialpolitik"
};

const DOK_BESTAND = { id: "rd-alt", title: "Bundesregierung praesentiert Pflegereform", published_at: "2026-08-13T08:00:00Z" };
const DOK_NEU = { id: "rd-neu", title: "Bundesrat beschliesst Entschliessung zum Pflegebudget", published_at: "2026-08-18T08:00:00Z" };

function baueDeps(p, speicher, extra = {}) {
  const basis = {
    enabled: () => true,
    aiEnabled: () => true,
    gateMode: () => "off",
    acquireLock: async () => ({ granted: true }),
    releaseLock: async () => {},
    canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async () => { p.kiAufrufe += 1; return { ...ANALYSE }; },
    save: async (ko) => ({ saved: true, id: ko.id }),
    saveSources: async () => {},
    markFailed: async () => {},
    modelName: () => "test",
    logSkip: () => {},
    findVorgangCandidates: async () => [],
    listPending: async () => [],
    listVorgangDocuments: async () => [],
    getExisting: async () => null,
    verstehenVertrag: () => vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } }),
    speicherWiederholungWarteMs: 0
  };
  const d = { ...basis, ...extra };
  // §30: der Wiederaufnahmepfad nutzt den STRENGEN Bestandsleser. Die Attrappe leitet ihn
  // auf dieselbe Quelle wie `getExisting` um, sofern ein Test ihn nicht eigens setzt —
  // sonst griffe die echte Storage-Funktion aus defaultDeps.
  if (!Object.prototype.hasOwnProperty.call(extra, "getExistingStreng")) d.getExistingStreng = d.getExisting;
  return d;
}

const neuesProtokoll = () => ({ kiAufrufe: 0 });

// Ein bereits verstandener Vorgang: complete-KO, Zustand `offen` mit Freigabemarker.
const VORGANG = "vg-pflegereform-20260813-aaaaaa";

async function main() {
  abschnitt("§1 KERNBEWEIS: reservierbar OHNE jede Clusterbildung");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      start: { [VORGANG]: { zustand: "offen", letzterGrund: "erneut-freigegeben", versuche: 2, kiAufrufe: 2, fencing: 2 } }
    });
    speicher.vormerkungen.set(VORGANG, 1);
    const bestandsKo = { id: "ko-1", vorgang_id: VORGANG, status: "neu", understanding_status: "complete", ko_version: 1 };
    // rawDocs BEWUSST LEER: es kann keinerlei Cluster gebildet werden. Genau das war bisher
    // die Bedingung, unter der der Vorgang unsichtbar blieb.
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [VORGANG] }),
      getExisting: async () => bestandsKo,
      listVorgangDocuments: async () => [DOK_BESTAND, DOK_NEU]
    }));
    const z = speicher.zeilen.get(VORGANG);
    check("§1.1 Lauf ist NICHT no-pending, obwohl listPending leer ist",
      !r.skipped, `skipped=${r.skipped} reason=${r.reason}`);
    check("§1.2 genau EIN Vorgang als Wiederaufnahme aufgenommen", r.wiederaufnahmen === 1, String(r.wiederaufnahmen));
    check("§1.3 Cluster kam aus der VERKNUEPFUNG, nicht aus einer Neuclusterung",
      (r.clusterHerkunft || {}).verknuepfung === 1, JSON.stringify(r.clusterHerkunft));
    check("§1.4 der Vorgang wurde reserviert und verstanden: genau EIN Modellaufruf",
      p.kiAufrufe === 1 && z.kiAufrufe === 3, `ki=${p.kiAufrufe} casKi=${z.kiAufrufe}`);
    check("§1.5 Ergebnis traegt den Wiederaufnahmemarker (Telemetrie)",
      (r.results || []).some((x) => x && x.wiederaufnahmeFreigabe === true));
  }

  abschnitt("§2/§7 complete-KO + Vormerkung: Update-Pfad, Erfolg loest die Vormerkung");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      start: { [VORGANG]: { zustand: "offen", letzterGrund: "erneut-freigegeben", versuche: 2, kiAufrufe: 2, fencing: 2 } }
    });
    speicher.vormerkungen.set(VORGANG, 1);
    const bestandsKo = { id: "ko-1", vorgang_id: VORGANG, status: "neu", understanding_status: "complete", ko_version: 1 };
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [VORGANG] }),
      getExisting: async () => bestandsKo,
      listVorgangDocuments: async () => [DOK_BESTAND]
    }));
    const z = speicher.zeilen.get(VORGANG);
    check("§2.1 Wiederaufnahme ueber die Vormerkung, genau EIN Modellaufruf", p.kiAufrufe === 1, String(p.kiAufrufe));
    check("§7.1 Erfolg setzt den Vorgang auf `fertig`, ohne Lease und ohne Besitzer",
      z.zustand === "fertig" && z.leaseBis === null && z.besitzer === null, z.zustand);
    check("§7.2 die zugehoerige Vormerkung ist vertragsgemaess geloest",
      !speicher.vormerkungen.has(VORGANG), `vormerkungen=${[...speicher.vormerkungen.keys()].length}`);
    check("§7.3 Versuchs- und Aufrufzaehler exakt um eins erhoeht (Grenzen unveraendert)",
      z.versuche === 3 && z.kiAufrufe === 3, `v=${z.versuche} ki=${z.kiAufrufe}`);
    check("§2.2 Ausgang ist ein echter Abschluss (kein duplicate/skipped)",
      (r.results || []).some((x) => x && ["saved", "updated"].includes(x.status)),
      JSON.stringify((r.results || []).map((x) => x.status)));
  }

  abschnitt("§3 Vorgang OHNE Wissensobjekt");
  {
    // §3a: keine Quellen auffindbar -> ehrlich `skipped-no-cluster`, KEIN Modellaufruf.
    const p = neuesProtokoll();
    const OHNE = "vg-ohne-ko-20260820-bbbbbb";
    const speicher = baueSpeicherAttrappe({
      start: { [OHNE]: { zustand: "offen", letzterGrund: "erneut-freigegeben", versuche: 1, kiAufrufe: 1, fencing: 1 } }
    });
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [OHNE] }),
      getExisting: async () => null,
      listVorgangDocuments: async () => { throw new Error("darf ohne KO nicht aufgerufen werden"); }
    }));
    const z = speicher.zeilen.get(OHNE);
    check("§3a.1 aufgenommen, aber ohne Quellen ehrlich `skipped-no-cluster`",
      (r.results || []).some((x) => x && x.status === "skipped-no-cluster"),
      JSON.stringify((r.results || []).map((x) => x.status)));
    check("§3a.2 KEIN Modellaufruf, KEINE Reservierung, kein Zaehlerzuwachs",
      p.kiAufrufe === 0 && z.versuche === 1 && z.kiAufrufe === 1 && z.zustand === "offen");
  }
  {
    // §3b: derselbe Vorgang, aber seine Dokumente liegen im Rohbestand -> Kennungssuche greift.
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const rohdokumente = [
      { id: "rd-x", title: "Bundesregierung praesentiert Pflegereform", published_at: "2026-08-20T08:00:00Z" }
    ];
    const { clusterRawDocuments, deriveVorgangId } = understanding;
    const kennung = deriveVorgangId(clusterRawDocuments(rohdokumente)[0]);
    speicher.zeilen.set(kennung, {
      besitzer: null, fencing: 1, leaseBis: null, zustand: "offen",
      eingabeHash: null, ergebnisHash: null, versuche: 1, kiAufrufe: 1, letzterGrund: "erneut-freigegeben"
    });
    const r = await runPendingUnderstandingShadow(rohdokumente, baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [kennung] }),
      getExisting: async () => null
    }));
    check("§3b.1 mit Kennungstreffer regulaeres Erstverstehen, genau EIN Aufruf",
      p.kiAufrufe === 1 && (r.clusterHerkunft || {}).kennung === 1,
      `ki=${p.kiAufrufe} herkunft=${JSON.stringify(r.clusterHerkunft)}`);
  }

  abschnitt("§4 ENGE GRENZE: keine pauschale Wiederverarbeitung");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    // Ein `offen`-Vorgang OHNE Freigabemarker darf gar nicht erst geliefert werden — die
    // Filterung geschieht serverseitig; hier wird geprueft, dass der Lauf ohne Liste nichts tut.
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [] })
    }));
    check("§4.1 ohne freigegebene Vorgaenge bleibt der Lauf ein No-Op",
      r.skipped === true && r.reason === "no-pending" && p.kiAufrufe === 0);
    const src = fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
    check("§4.2 die Abfrage filtert serverseitig auf zustand=offen UND letzter_grund=erneut-freigegeben",
      /zustand=eq\.offen&letzter_grund=eq\.erneut-freigegeben/.test(src));
    check("§4.3 die Abfrage ist rein lesend (kein method/POST in der Wiederaufnahmefunktion)",
      /async function verstehenWiederaufnahmen[\s\S]{0,1400}?supabaseRequest\(\s*\n?\s*"\/rest\/v1\/helmut_verstehen_reservierungen/.test(src)
      && !/async function verstehenWiederaufnahmen[\s\S]{0,1400}?method:\s*"(POST|PATCH|DELETE)"/.test(src));
  }

  abschnitt("§5 Ausgeschoepftes Versuchslimit");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      start: { [VORGANG]: { zustand: "offen", letzterGrund: "erneut-freigegeben", versuche: 3, kiAufrufe: 3, fencing: 3 } }
    });
    speicher.vormerkungen.set(VORGANG, 3);   // Deckel UPDATE_WIEDERAUFNAHME_MAX erreicht
    const bestandsKo = { id: "ko-1", vorgang_id: VORGANG, status: "neu", understanding_status: "complete", ko_version: 1 };
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [VORGANG] }),
      getExisting: async () => bestandsKo,
      listVorgangDocuments: async () => [DOK_BESTAND]
    }));
    const z = speicher.zeilen.get(VORGANG);
    check("§5.1 Deckel erschoepft -> KEIN weiterer Modellaufruf",
      p.kiAufrufe === 0 && z.kiAufrufe === 3, `ki=${p.kiAufrufe} casKi=${z.kiAufrufe}`);
    check("§5.2 sichtbar als `skipped-update-final`, nicht still verschwunden",
      (r.results || []).some((x) => x && x.status === "skipped-update-final"),
      JSON.stringify((r.results || []).map((x) => x.status)));
  }

  abschnitt("§6 Parallele Laeufe auf demselben freigegebenen Vorgang");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      start: { [VORGANG]: { zustand: "offen", letzterGrund: "erneut-freigegeben", versuche: 2, kiAufrufe: 2, fencing: 2 } }
    });
    speicher.vormerkungen.set(VORGANG, 1);
    const bestandsKo = { id: "ko-1", vorgang_id: VORGANG, status: "neu", understanding_status: "complete", ko_version: 1 };
    const baue = () => baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [VORGANG] }),
      getExisting: async () => bestandsKo,
      listVorgangDocuments: async () => [DOK_BESTAND],
      requestUnderstanding: async () => { p.kiAufrufe += 1; await new Promise((r2) => setTimeout(r2, 30)); return { ...ANALYSE }; }
    });
    const [a, b] = await Promise.all([
      runPendingUnderstandingShadow([], baue()),
      runPendingUnderstandingShadow([], baue())
    ]);
    const z = speicher.zeilen.get(VORGANG);
    check("§6.1 GENAU EIN Modellaufruf trotz zweier gleichzeitiger Laeufe",
      p.kiAufrufe === 1, String(p.kiAufrufe));
    check("§6.2 keine verwaiste Lease, Endzustand fertig",
      z.zustand === "fertig" && z.leaseBis === null && z.besitzer === null, z.zustand);
    check("§6.3 der zweite Lauf endet geordnet (belegt/duplicate), nicht als Fehler",
      [a, b].every((r) => (r.results || []).every((x) => x && x.status !== "cluster-error")));
  }

  abschnitt("§8 Erneuter Fehler endet ehrlich");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      start: { [VORGANG]: { zustand: "offen", letzterGrund: "erneut-freigegeben", versuche: 2, kiAufrufe: 2, fencing: 2 } }
    });
    speicher.vormerkungen.set(VORGANG, 1);
    const bestandsKo = { id: "ko-1", vorgang_id: VORGANG, status: "neu", understanding_status: "complete", ko_version: 1 };
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [VORGANG] }),
      getExisting: async () => bestandsKo,
      listVorgangDocuments: async () => [DOK_BESTAND],
      requestUnderstanding: async () => { p.kiAufrufe += 1; throw new Error("OpenAI request timeout"); }
    }));
    const z = speicher.zeilen.get(VORGANG);
    check("§8.1 genau EIN Aufruf, Ausgang ehrlich `unbekannt`",
      p.kiAufrufe === 1 && z.zustand === "unbekannt", `ki=${p.kiAufrufe} zustand=${z.zustand}`);
    check("§8.2 keine verwaiste Lease, Fehlerklasse benannt",
      z.leaseBis === null && /^modellfehler:/.test(z.letzterGrund || ""), z.letzterGrund || "-");
    check("§8.3 SELBSTBEGRENZEND: der Freigabemarker ist weg -> keine automatische Wiederholung",
      z.letzterGrund !== "erneut-freigegeben");
    check("§8.4 der Ausgang ist im Ergebnis sichtbar (kein stilles Verschwinden)",
      (r.results || []).some((x) => x && x.ausgang === "unbekannt"));
  }

  abschnitt("§9 Fail closed bei nicht lesbarer Wiederaufnahmeliste");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: false, grund: "migration-fehlt", vorgaenge: [] })
    }));
    check("§9.1 der Lesefehler wird ehrlich gemeldet, nicht als kein-Rueckstand gelebt",
      /^wiederaufnahmen-nicht-lesbar:/.test(String(r.wiederaufnahmeGrund || "")), String(r.wiederaufnahmeGrund));
    check("§9.2 kein Modellaufruf aus einem Lesefehler", p.kiAufrufe === 0);
  }
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => { throw new Error("netzfehler"); }
    }));
    check("§9.3 auch eine geworfene Ausnahme wird gefangen und gemeldet",
      /^wiederaufnahmen-nicht-lesbar:/.test(String(r.wiederaufnahmeGrund || "")) && p.kiAufrufe === 0);
  }

  abschnitt("§10 Grenzen, Selbstbegrenzung und Quelltextvertraege");
  {
    check("§10.1 Default-Obergrenze je Lauf ist gesetzt und begrenzt",
      understanding.WIEDERAUFNAHME_MAX_JE_LAUF === 25
      && understanding.wiederaufnahmeMax({}) === 25
      && understanding.wiederaufnahmeMax({ wiederaufnahmeMax: 5 }) === 5
      && understanding.wiederaufnahmeMax({ wiederaufnahmeMax: 9999 }) === 200);
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    let gesehenesLimit = null;
    await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      wiederaufnahmeMax: 3,
      listWiederaufnahmen: async (limit) => { gesehenesLimit = limit; return { verfuegbar: true, vorgaenge: [] }; }
    }));
    check("§10.2 die Obergrenze wird an die Abfrage durchgereicht", gesehenesLimit === 3, String(gesehenesLimit));
    const uSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/understanding.js"), "utf8");
    check("§10.3 Wiederaufnahmen werden VOR der pending-Menge eingereiht",
      /arbeitsliste\.push\(\.\.\.\(Array\.isArray\(pending\)/.test(uSrc));
    check("§10.4 die Restzeitwache (§29) ist im Nachholpfad unveraendert wirksam",
      /restzeitWeg\(\)\s*\)\s*\{\s*budgetHit = true/.test(uSrc)
      && /reserveMs: verstehenRestzeit\.reserveVorModellstartMs\(\)/.test(uSrc));
    check("§10.5 keine Migration noetig: die Wiederaufnahme nutzt nur die bestehende Tabelle",
      !fs.readdirSync(path.join(ROOT, "supabase/migrations")).some((f) => /wiederaufnahme/i.test(f)));
    check("§10.6 der Ablauf nutzt unveraendert understandOneCluster (CAS, Wache, Budget)",
      /const r = await understandOneCluster\(cluster, deps, \{\s*\n\s*vorgangId: ko\.vorgang_id, existing: bestand, retriesCtx,/.test(uSrc));
  }

  abschnitt("§11 REVIEW-KORREKTUR: die belegten Produktionsfaelle werden wirklich geloest");
  {
    // §11a: complete-KO OHNE Vormerkung — frueher immer `duplicate`, weil Cluster und
    // Bestandsdokumente aus DERSELBEN Verknuepfungsabfrage stammen. Genau die Lage von
    // ba50848e/dcbb89b6/50390467.
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      start: { [VORGANG]: { zustand: "offen", letzterGrund: "erneut-freigegeben", versuche: 1, kiAufrufe: 1, fencing: 1 } }
    });
    const bestandsKo = { id: "ko-1", vorgang_id: VORGANG, status: "neu", understanding_status: "complete", ko_version: 1 };
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [VORGANG] }),
      getExisting: async () => bestandsKo,
      listVorgangDocuments: async () => [DOK_BESTAND]
    }));
    const z = speicher.zeilen.get(VORGANG);
    check("§11a.1 complete-KO ohne Vormerkung wird verarbeitet statt als `duplicate` verworfen",
      p.kiAufrufe === 1 && z.zustand === "fertig",
      `ki=${p.kiAufrufe} zustand=${z.zustand} status=${JSON.stringify((r.results || []).map((x) => x.status))}`);
    check("§11a.2 Freigabemarker verbraucht (Reservierung setzt letzter_grund zurueck)",
      z.letzterGrund !== "erneut-freigegeben", String(z.letzterGrund));
  }
  {
    // §11b: geparktes KO (`understanding_status='failed'`) — frueher `skipped-failed` VOR
    // jeder Reservierung. Die ausdrueckliche Freigabe IST die verlangte Operatorentscheidung.
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      start: { [VORGANG]: { zustand: "offen", letzterGrund: "erneut-freigegeben", versuche: 1, kiAufrufe: 1, fencing: 1 } }
    });
    const geparkt = { id: "ko-1", vorgang_id: VORGANG, status: "pending", understanding_status: "failed", ko_version: 1 };
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [VORGANG] }),
      getExisting: async () => geparkt,
      listVorgangDocuments: async () => [DOK_BESTAND]
    }));
    const z = speicher.zeilen.get(VORGANG);
    check("§11b.1 geparktes KO wird auf ausdrueckliche Freigabe hin verarbeitet",
      p.kiAufrufe === 1 && z.zustand === "fertig",
      `ki=${p.kiAufrufe} status=${JSON.stringify((r.results || []).map((x) => x.status))}`);
  }
  {
    // §11c: OHNE Freigabe bleiben beide Vorfilter unveraendert scharf (kein Automatismus).
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const geparkt = { id: "ko-9", vorgang_id: VORGANG, status: "pending", understanding_status: "failed", ko_version: 1 };
    await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [] }),
      listPending: async () => [geparkt],
      listVorgangDocuments: async () => [DOK_BESTAND]
    }));
    check("§11c.1 ohne Freigabe bleibt `skipped-failed` scharf: KEIN Modellaufruf", p.kiAufrufe === 0);
  }

  abschnitt("§12 REVIEW-KORREKTUR: Vertragsbindung, Zeit-Gates, Bestandslesefehler, Sortierung");
  {
    // §12a: ohne CAS-Vertrag wird die Liste gar nicht erst gelesen.
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    let gelesen = false;
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      verstehenVertrag: () => null,
      listWiederaufnahmen: async () => { gelesen = true; return { verfuegbar: true, vorgaenge: [VORGANG] }; }
    }));
    check("§12a.1 ohne CAS-Vertrag KEIN Wiederaufnahmepfad (keine Abfrage, kein Aufruf)",
      gelesen === false && p.kiAufrufe === 0 && r.skipped === true);
  }
  {
    // §12b: reicht die Restzeit nicht, wird die Liste nicht gelesen (Vorarbeit ist gedeckelt).
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    let gelesen = false;
    await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      deadlineMs: Date.now() + 500,
      listWiederaufnahmen: async () => { gelesen = true; return { verfuegbar: true, vorgaenge: [VORGANG] }; }
    }));
    check("§12b.1 ohne Restzeit wird die Wiederaufnahmeliste gar nicht erst gelesen", gelesen === false);
  }
  {
    // §12c: Lesefehler des Bestands -> ehrlich zurueckgelegt, NIEMALS als Erstverstehen.
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe({
      start: { [VORGANG]: { zustand: "offen", letzterGrund: "erneut-freigegeben", versuche: 1, kiAufrufe: 1, fencing: 1 } }
    });
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [VORGANG] }),
      getExistingStreng: async () => { throw new Error("supabase 503"); },
      listVorgangDocuments: async () => [DOK_BESTAND]
    }));
    const z = speicher.zeilen.get(VORGANG);
    check("§12c.1 Bestands-Lesefehler: KEIN Modellaufruf, kein Ueberschreiben des Wissensobjekts",
      p.kiAufrufe === 0 && z.versuche === 1 && z.kiAufrufe === 1);
    check("§12c.2 ehrlich als `skipped-store` mit Grund gemeldet",
      (r.results || []).some((x) => x && x.status === "skipped-store" && /^bestand-nicht-lesbar:/.test(String(x.reason))),
      JSON.stringify((r.results || []).map((x) => `${x.status}/${x.reason}`)));
  }
  {
    // §12d: „nicht konfiguriert" ist kein Befund und erzeugt keinen Alarm.
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const r = await runPendingUnderstandingShadow([], baueDeps(p, speicher, {
      listWiederaufnahmen: async () => ({ verfuegbar: false, grund: "supabase-nicht-konfiguriert", vorgaenge: [] })
    }));
    check("§12d.1 `supabase-nicht-konfiguriert` wird still uebergangen (kein falscher Alarm)",
      r.wiederaufnahmeGrund === undefined, String(r.wiederaufnahmeGrund));
    const speicher2 = baueSpeicherAttrappe();
    const r2 = await runPendingUnderstandingShadow([], baueDeps(neuesProtokoll(), speicher2, {
      listWiederaufnahmen: async () => ({ verfuegbar: false, grund: "migration-fehlt", vorgaenge: [] })
    }));
    check("§12d.2 ein ECHTER Lesefehler wird weiterhin gemeldet",
      /^wiederaufnahmen-nicht-lesbar:migration-fehlt/.test(String(r2.wiederaufnahmeGrund)));
  }
  {
    const sSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
    check("§12e.1 juengste Freigabe zuerst — haengende Eintraege verhungern keine neue Freigabe",
      /letzter_grund=eq\.erneut-freigegeben[\s\S]{0,600}?order=updated_at\.desc/.test(sSrc));
    const uSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/understanding.js"), "utf8");
    check("§12e.2 der Bestand wird erst hinter Sperre und Zeit-Gates geholt",
      uSrc.indexOf("const lock = await deps.acquireLock();") < uSrc.indexOf("deps.getExistingStreng"));
    check("§12e.3 der Wiederaufnahmepfad ist hart an den CAS-Vertrag gebunden",
      /const vertragAktiv = typeof deps\.verstehenVertrag === "function"/.test(uSrc)
      && /&& vertragAktiv && vorlaufZeitReicht/.test(uSrc));
  }

  console.log(`\nErgebnis: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Testlauf abgebrochen:", error && error.stack);
  process.exitCode = 1;
});
