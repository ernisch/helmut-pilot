"use strict";

// Helmut — VERTRAGSTEST des ATOMAREN VERSTEHENSVERTRAGS (OP-30 CAS, 2026-08-14).
// =============================================================================================
// Was hier geprüft wird, ist die ANWENDUNGSSEITE: benutzt der Fachkern den Vertrag an genau
// den richtigen Stellen, in der richtigen Reihenfolge, und zieht er aus jeder Absage die
// richtige Folgerung? Die DATENBANKSEITE (echte Nebenläufigkeit, Row-Locks, Trigger) weist
// `scripts/verstehen-cas-datenbank-test.js` an einer echten PostgreSQL nach.
//
// Die Attrappe `baueSpeicherAttrappe()` bildet die SQL-Semantik der Migration
// 20260814180000 nach. Sie ist KEIN Beweis für die Migration — sie ist der Prüfstand für
// den Aufrufer. Beide Nachweise zusammen decken den Vertrag ab; einer allein nicht.
//
// §1  Flag, Parallelitätsriegel, Klassengrenze
// §2  Eingabehash: Identität einer Verstehenseingabe
// §3  Erstverstehen: Reihenfolge Reservieren → Modellstart → Schreibrecht → Save → Abschluss
// §4  Belegter Vorgang: kein Modellaufruf
// §5  Idempotenz: dieselbe Eingabe nutzt das bestehende Ergebnis
// §6  Unbekannter Ausgang: sichtbar blockiert, kein zweiter Aufruf
// §7  Lease verloren vor der Persistenz: der alte Besitzer speichert NICHT
// §8  Die Datenbank wehrt eine veraltete Überschreibung ab
// §9  Absturz VOR dem Modellaufruf ist sicher wiederholbar
// §10 Absturz NACH dem Modellaufruf meldet nichts → unbekannter Ausgang
// §11 Vormerkungen: atomar erhöht, bedingt gelöscht — kein verlorener Eintrag
// §12 Fail closed an jeder Vertragsstelle
// §13 Mindestens 8 verschiedene Vorgänge laufen nachweislich parallel
// §14 Mindestens 20 gleichzeitige Arbeiter auf DENSELBEN Vorgang → genau ein Modellaufruf
// §15 Cron, Warteschlange und Lambda benutzen denselben Fachpfad

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const { understandOneCluster, runUnderstandingShadow, deriveVorgangId } = require(path.join(ROOT, "lib/helmut/understanding"));
const vertragModul = require(path.join(ROOT, "lib/helmut/verstehen-vertrag"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// ── Attrappe der Datenbankseite (bildet 20260814180000 nach) ────────────────────────────────
// JavaScript ist einfädig — jeder dieser Aufrufe ist damit von sich aus atomar, exakt so wie
// der Row-Lock in der echten Funktion. Genau deshalb taugt sie zum Prüfen des AUFRUFERS.
function baueSpeicherAttrappe({ jetzt = () => Date.now(), protokoll = null } = {}) {
  const zeilen = new Map();       // vorgangId -> Reservierungszeile
  const vormerkungen = new Map(); // vorgangId -> { fehlversuche, letzteFencing }
  const kos = new Map();          // vorgangId -> verstehen_fencing

  const hole = (id) => {
    if (!zeilen.has(id)) {
      zeilen.set(id, {
        vorgangId: id, eingabeHash: null, besitzer: null, fencing: 0, leaseBis: null,
        zustand: "offen", ergebnisFencing: null, ergebnisHash: null, versuche: 0, kiAufrufe: 0
      });
    }
    return zeilen.get(id);
  };

  return {
    zeilen, vormerkungen, kos,
    async verstehenReserviere({ vorgangId, eingabeHash, besitzer, ttlMs }) {
      const r = hole(vorgangId);
      if (protokoll) protokoll.push(["reserviere", vorgangId, besitzer]);
      if (r.zustand === "aufgegeben") return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: r.zustand, grund: "aufgegeben" };
      if (r.zustand === "unbekannt") return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: r.zustand, grund: "ausgang-unbekannt" };
      if (r.zustand === "fertig" && r.eingabeHash === eingabeHash) {
        return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: "fertig", grund: "bereits-fertig", ergebnis_hash: r.ergebnisHash };
      }
      if (["reserviert", "modell-laeuft"].includes(r.zustand) && r.leaseBis && r.leaseBis > jetzt()) {
        if (r.besitzer === besitzer) { r.leaseBis = jetzt() + ttlMs; return { verfuegbar: true, erlaubt: true, fencing: r.fencing, zustand: r.zustand, grund: "wiedereintritt" }; }
        return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: r.zustand, grund: "belegt" };
      }
      if (r.zustand === "modell-laeuft") {
        const belegt = kos.has(vorgangId) && Number(kos.get(vorgangId)) >= r.fencing;
        if (belegt) {
          r.zustand = "fertig"; r.ergebnisFencing = r.fencing; r.besitzer = null; r.leaseBis = null;
          if (r.eingabeHash === eingabeHash) {
            return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: "fertig", grund: "bereits-fertig" };
          }
        } else {
          r.zustand = "unbekannt"; r.besitzer = null; r.leaseBis = null;
          return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: "unbekannt", grund: "ausgang-unbekannt" };
        }
      }
      r.fencing += 1; r.besitzer = besitzer; r.leaseBis = jetzt() + ttlMs;
      r.zustand = "reserviert"; r.eingabeHash = eingabeHash; r.versuche += 1;
      return { verfuegbar: true, erlaubt: true, fencing: r.fencing, zustand: "reserviert", grund: "uebernommen" };
    },
    async verstehenModellstart({ vorgangId, besitzer, fencing, ttlMs }) {
      const r = hole(vorgangId);
      if (protokoll) protokoll.push(["modellstart", vorgangId, besitzer]);
      if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "reserviert" || !(r.leaseBis > jetzt())) {
        return { verfuegbar: true, ok: false };
      }
      r.zustand = "modell-laeuft"; r.kiAufrufe += 1; r.leaseBis = jetzt() + ttlMs;
      return { verfuegbar: true, ok: true };
    },
    async verstehenSchreibrecht({ vorgangId, besitzer, fencing, ttlMs }) {
      const r = hole(vorgangId);
      if (protokoll) protokoll.push(["schreibrecht", vorgangId, besitzer]);
      if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "modell-laeuft") return { verfuegbar: true, ok: false };
      r.leaseBis = jetzt() + ttlMs;
      return { verfuegbar: true, ok: true };
    },
    async verstehenAbschluss({ vorgangId, fencing, ergebnisHash }) {
      const r = hole(vorgangId);
      if (protokoll) protokoll.push(["abschluss", vorgangId]);
      if (r.fencing !== fencing || (r.ergebnisFencing != null && r.ergebnisFencing > fencing)) return { verfuegbar: true, ok: false };
      r.zustand = "fertig"; r.ergebnisFencing = fencing; r.ergebnisHash = ergebnisHash;
      r.besitzer = null; r.leaseBis = null;
      return { verfuegbar: true, ok: true };
    },
    async verstehenFreigabe({ vorgangId, besitzer, fencing }) {
      const r = hole(vorgangId);
      if (protokoll) protokoll.push(["freigabe", vorgangId]);
      if (r.besitzer !== besitzer || r.fencing !== fencing || !["reserviert", "modell-laeuft"].includes(r.zustand)) {
        return { verfuegbar: true, ok: false };
      }
      r.zustand = "offen"; r.besitzer = null; r.leaseBis = null;
      return { verfuegbar: true, ok: true };
    },
    async verstehenVormerkungLese(ids) {
      const eintraege = {};
      for (const id of ids) if (vormerkungen.has(id)) eintraege[id] = vormerkungen.get(id).fehlversuche;
      return { verfuegbar: true, eintraege };
    },
    async verstehenVormerkungErhoehe({ vorgangId, delta, fencing }) {
      const v = vormerkungen.get(vorgangId) || { fehlversuche: 0, letzteFencing: 0 };
      v.fehlversuche += Math.max(0, Number(delta) || 0);
      v.letzteFencing = Math.max(v.letzteFencing, Number(fencing) || 0);
      vormerkungen.set(vorgangId, v);
      return { verfuegbar: true, fehlversuche: v.fehlversuche };
    },
    async verstehenVormerkungLoese({ vorgangId, fencing }) {
      const v = vormerkungen.get(vorgangId);
      if (!v || v.letzteFencing > (Number(fencing) || 0)) return { verfuegbar: true, ok: false };
      vormerkungen.delete(vorgangId);
      return { verfuegbar: true, ok: true };
    }
  };
}

const ANALYSE = {
  headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
  display_title: "Bundestag debattiert Haushaltsentwurf", display_summary: "s",
  why_relevant: "w", recommendation: "r", display_category: "Haushalt"
};

const TITEL = [
  "Bundestag debattiert Haushaltsentwurf",
  "Bundesrat stoppt Vermittlungsausschuss Verfahren",
  "Kabinett beschliesst Klimaschutzprogramm Novelle",
  "Innenausschuss beraet Cybersicherheitsgesetz",
  "Verkehrsministerium plant Schienenausbau Finanzierung",
  "Gesundheitsausschuss prueft Pflegereform Entwurf",
  "Wirtschaftsministerium meldet Industriestrompreis Vorschlag",
  "Bildungsausschuss beraet Digitalpakt Fortsetzung",
  "Umweltausschuss debattiert Wasserstoffstrategie Ausbau",
  "Rechtsausschuss beraet Strafprozessordnung Aenderung"
];

function baueCluster(titel, docId) {
  return { documents: [{ id: docId, title: titel, published_at: "2026-08-14T08:00:00Z" }] };
}

function baueDeps(p, speicher, extra = {}) {
  return {
    canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async () => {
      p.kiAufrufe += 1;
      p.reihenfolge.push("ki");
      if (p.gemeinsam) p.gemeinsam.push(["ki"]);
      if (p.kiVerzoegerung) await new Promise((r) => setTimeout(r, p.kiVerzoegerung));
      return { ...ANALYSE };
    },
    save: async (ko) => {
      p.reihenfolge.push("save");
      if (p.gemeinsam) p.gemeinsam.push(["save"]);
      p.gespeichert.push({ id: ko.id, fencing: ko.verstehen_fencing });
      if (speicher) {
        const alt = speicher.kos.get(ko.vorgang_id);
        // Trigger-Semantik: eine kleinere Fassung wird abgewehrt.
        const aktuell = (speicher.zeilen.get(ko.vorgang_id) || {}).fencing;
        if ((alt != null && ko.verstehen_fencing < alt)
            || (aktuell != null && ko.verstehen_fencing != null && ko.verstehen_fencing < aktuell)) {
          return { skipped: true, reason: "verstehen-fencing-veraltet", veraltet: true };
        }
        if (ko.verstehen_fencing != null) speicher.kos.set(ko.vorgang_id, ko.verstehen_fencing);
      }
      return { saved: true, id: ko.id };
    },
    saveSources: async (koId, docs) => { p.verknuepft.push({ koId, ids: docs.map((d) => d.id) }); },
    markFailed: async () => {}, modelName: () => "test", logSkip: () => {},
    findVorgangCandidates: async () => [],
    listVorgangDocuments: async () => [],
    verstehenVertrag: () => vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } }),
    ...extra
  };
}

function neuesProtokoll() {
  return { kiAufrufe: 0, gespeichert: [], verknuepft: [], reihenfolge: [], kiVerzoegerung: 0 };
}

async function main() {
  console.log("Helmut — Vertragstest des atomaren Verstehensvertrags (OP-30 CAS)");

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Flag, Parallelitaetsriegel, Klassengrenze");
  check("1.1 Ohne Flag gibt es keinen Vertrag (Default inert)",
    vertragModul.baueVertrag({ env: {} }) === null);
  check("1.2 Mit Flag entsteht ein Vertrag mit eigener Besitzerkennung",
    (() => {
      const a = vertragModul.baueVertrag({ env: { HELMUT_VERSTEHEN_CAS: "on" } });
      const b = vertragModul.baueVertrag({ env: { HELMUT_VERSTEHEN_CAS: "on" } });
      return Boolean(a && b && a.besitzer && a.besitzer !== b.besitzer);
    })());
  check("1.3 Standard-Parallelitaet ist 1 (Production unveraendert)",
    vertragModul.verstehenParallelitaet({}) === 1);
  check("1.4 Parallelitaet > 1 wird OHNE CAS auf 1 geklemmt (Konfiguration hebelt keine Zusage aus)",
    vertragModul.verstehenParallelitaet({ HELMUT_VERSTEHEN_PARALLELITAET: "8" }) === 1);
  check("1.5 Mit CAS wirkt die konfigurierte Parallelitaet",
    vertragModul.verstehenParallelitaet({ HELMUT_VERSTEHEN_CAS: "on", HELMUT_VERSTEHEN_PARALLELITAET: "6" }) === 6);
  check("1.6 Die Parallelitaet ist nach oben gedeckelt",
    vertragModul.verstehenParallelitaet({ HELMUT_VERSTEHEN_CAS: "on", HELMUT_VERSTEHEN_PARALLELITAET: "99" })
      === vertragModul.VERSTEHEN_PARALLELITAET_MAX);
  const scalable = require(path.join(ROOT, "lib/helmut/scalable-pipeline"));
  check("1.7 Die Klassengrenze `verstehen` steht im Standard auf 1",
    scalable.KLASSEN_STANDARD.verstehen === 1, String(scalable.KLASSEN_STANDARD.verstehen));
  check("1.8 HELMUT_KLASSE_VERSTEHEN_MAX>1 wird ohne CAS auf 1 geklemmt",
    scalable.klassenMax("verstehen", { HELMUT_KLASSE_VERSTEHEN_MAX: "8" }) === 1,
    String(scalable.klassenMax("verstehen", { HELMUT_KLASSE_VERSTEHEN_MAX: "8" })));
  check("1.9 Mit CAS wirkt die konfigurierte Klassengrenze",
    scalable.klassenMax("verstehen", { HELMUT_KLASSE_VERSTEHEN_MAX: "8", HELMUT_VERSTEHEN_CAS: "on" }) === 8);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Eingabehash: Identitaet einer Verstehenseingabe");
  const h1 = vertragModul.eingabeHash({ vorgangId: "vg-1", dokumente: [{ id: "a" }, { id: "b" }] });
  const h2 = vertragModul.eingabeHash({ vorgangId: "vg-1", dokumente: [{ id: "b" }, { id: "a" }] });
  check("2.1 Die Reihenfolge der Dokumente aendert den Hash NICHT (Menge zaehlt)", h1 === h2);
  check("2.2 Ein zusaetzliches Dokument aendert den Hash",
    h1 !== vertragModul.eingabeHash({ vorgangId: "vg-1", dokumente: [{ id: "a" }, { id: "b" }, { id: "c" }] }));
  check("2.3 Erstverstehen und Aktualisierung sind verschiedene Eingaben",
    h1 !== vertragModul.eingabeHash({ vorgangId: "vg-1", dokumente: [{ id: "a" }, { id: "b" }], modus: "update", koVersion: 2 }));
  check("2.4 Zwei aufeinanderfolgende Fortschreibungen sind verschiedene Eingaben",
    vertragModul.eingabeHash({ vorgangId: "vg-1", dokumente: [{ id: "a" }], modus: "update", koVersion: 2 })
      !== vertragModul.eingabeHash({ vorgangId: "vg-1", dokumente: [{ id: "a" }], modus: "update", koVersion: 3 }));
  check("2.5 Der Hash traegt keinen Dokumenttext (DSGVO-Datensparsamkeit)",
    vertragModul.eingabeHash({ vorgangId: "vg-1", dokumente: [{ id: "a", title: "Geheim" }] })
      === vertragModul.eingabeHash({ vorgangId: "vg-1", dokumente: [{ id: "a", title: "Anders" }] }));

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · Erstverstehen: Reihenfolge und Fencing-Wert am Ergebnis");
  {
    const p = neuesProtokoll();
    const proto = [];
    p.gemeinsam = proto;
    const speicher = baueSpeicherAttrappe({ protokoll: proto });
    const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p, speicher));
    check("3.1 Der Vorgang wird gespeichert (genau ein Modellaufruf)",
      r.status === "saved" && p.kiAufrufe === 1, `${r.status}/${p.kiAufrufe}`);
    const schritte = proto.map((z) => z[0]);
    check("3.2 Vollstaendige Reihenfolge reservieren -> modellstart -> KI -> schreibrecht -> speichern -> abschluss",
      JSON.stringify(schritte) === JSON.stringify(
        ["reserviere", "modellstart", "ki", "schreibrecht", "save", "abschluss"]),
      JSON.stringify(schritte));
    check("3.3 Der Modellstart steht VOR dem Aufruf (nur so ist ein Absturz danach erkennbar)",
      schritte.indexOf("modellstart") >= 0 && schritte.indexOf("modellstart") < schritte.indexOf("ki"),
      JSON.stringify(schritte));
    check("3.3b Das Schreibrecht steht VOR der Persistenz, der Abschluss DANACH",
      schritte.indexOf("schreibrecht") < schritte.indexOf("save")
        && schritte.indexOf("save") < schritte.indexOf("abschluss"), JSON.stringify(schritte));
    check("3.4 Das gespeicherte Ergebnis traegt den Fencing-Wert der Reservierung",
      p.gespeichert.length === 1 && p.gespeichert[0].fencing === 1, JSON.stringify(p.gespeichert));
    check("3.5 Es wird KEINE Freigabe nach dem Abschluss gerufen (der Vorgang ist fertig)",
      !proto.some((z) => z[0] === "freigabe"), JSON.stringify(proto.map((z) => z[0])));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · Belegter Vorgang: kein Modellaufruf");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    // Ein fremder Arbeiter haelt den Vorgang.
    await speicher.verstehenReserviere({ vorgangId: deriveVorgangId(baueCluster(TITEL[0], "rd-1")), eingabeHash: "x", besitzer: "fremd", ttlMs: 300000 });
    const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p, speicher));
    check("4.1 Ein belegter Vorgang wird zurueckgestellt", r.status === "skipped-cluster-belegt", r.status);
    check("4.2 KEIN Modellaufruf (keine doppelten KI-Kosten)", p.kiAufrufe === 0, String(p.kiAufrufe));
    check("4.3 KEINE Verknuepfung (das Dokument bleibt Nachholkandidat)", p.verknuepft.length === 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Idempotenz: dieselbe Eingabe nutzt das bestehende Ergebnis");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const cluster = baueCluster(TITEL[0], "rd-1");
    const erster = await understandOneCluster(cluster, baueDeps(p, speicher));
    // Zweiter Anlauf mit EXAKT derselben Eingabe — der Bestandskurzschluss ist bewusst
    // ausgeschaltet (findVorgangCandidates liefert nichts), damit allein der Vertrag greift.
    const zweiter = await understandOneCluster(cluster, baueDeps(p, speicher));
    check("5.1 Der zweite Anlauf derselben Eingabe kostet NICHTS (1 Modellaufruf gesamt)",
      erster.status === "saved" && zweiter.status === "duplicate" && p.kiAufrufe === 1,
      `${erster.status}/${zweiter.status} ki=${p.kiAufrufe}`);
    check("5.2 Der Grund ist ausgewiesen (kein stiller Ausgang)",
      zweiter.begruendung === "eingabe-bereits-verstanden", String(zweiter.begruendung));
    check("5.3 Die Dokumente bekommen trotzdem ihren Endzustand (Verknuepfung)",
      p.verknuepft.some((v) => v.ids.includes("rd-1")));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · Unbekannter Ausgang: sichtbar blockiert, kein zweiter Aufruf");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const vgId = deriveVorgangId(baueCluster(TITEL[0], "rd-1"));
    // Ein Arbeiter hat den Modellstart vermerkt und ist dann abgestuerzt (Lease abgelaufen).
    await speicher.verstehenReserviere({ vorgangId: vgId, eingabeHash: "x", besitzer: "abgestuerzt", ttlMs: 1000 });
    await speicher.verstehenModellstart({ vorgangId: vgId, besitzer: "abgestuerzt", fencing: 1, ttlMs: 1000 });
    speicher.zeilen.get(vgId).leaseBis = Date.now() - 1;

    const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p, speicher));
    check("6.1 Der unbekannte Ausgang wird eigenstaendig gemeldet",
      r.status === "skipped-ausgang-unbekannt", r.status);
    check("6.2 KEIN automatischer zweiter Modellaufruf", p.kiAufrufe === 0, String(p.kiAufrufe));
    check("6.3 KEINE Verknuepfung — der Endzustand ist gerade das Unbekannte", p.verknuepft.length === 0);
    const r2 = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p, speicher));
    check("6.4 Auch der naechste Lauf bleibt blockiert (kein stilles Wiederholen)",
      r2.status === "skipped-ausgang-unbekannt" && p.kiAufrufe === 0, `${r2.status}/${p.kiAufrufe}`);
    const src = fs.readFileSync(path.join(ROOT, "lib/helmut/understanding.js"), "utf8");
    check("6.5 Die Klasse ist einer Ergebnisgruppe zugeordnet (kein stiller Sammelzustand)",
      /"skipped-ausgang-unbekannt":\s*"fehlgeschlagen"/.test(src));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · Lease verloren VOR der Persistenz: der alte Besitzer speichert nicht");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const vgId = deriveVorgangId(baueCluster(TITEL[0], "rd-1"));
    const deps = baueDeps(p, speicher, {
      requestUnderstanding: async () => {
        p.kiAufrufe += 1;
        // Waehrend des Modellaufrufs uebernimmt ein neuerer Arbeiter den Vorgang.
        const z = speicher.zeilen.get(vgId);
        z.fencing += 1; z.besitzer = "neuer"; z.zustand = "reserviert"; z.leaseBis = Date.now() + 300000;
        return { ...ANALYSE };
      }
    });
    const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), deps);
    check("7.1 Der alte Besitzer meldet `skipped-veraltet`", r.status === "skipped-veraltet", r.status);
    check("7.2 Es wurde NICHT gespeichert", p.gespeichert.length === 0, JSON.stringify(p.gespeichert));
    check("7.3 Der Grund ist benannt", r.begruendung === "schreibrecht-verloren", String(r.begruendung));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("8 · Die Datenbank wehrt eine veraltete Ueberschreibung ab");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const vgId = deriveVorgangId(baueCluster(TITEL[0], "rd-1"));
    const deps = baueDeps(p, speicher, {
      save: async (ko) => {
        // Erst NACH bestandener Schreibrechtspruefung uebernimmt ein neuerer Arbeiter und
        // schreibt zuerst. Der Trigger muss die Altfassung dann abweisen.
        speicher.kos.set(ko.vorgang_id, (ko.verstehen_fencing || 0) + 1);
        const alt = speicher.kos.get(ko.vorgang_id);
        if (ko.verstehen_fencing < alt) return { skipped: true, reason: "verstehen-fencing-veraltet", veraltet: true };
        return { saved: true, id: ko.id };
      }
    });
    const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), deps);
    check("8.1 Die abgewehrte Ueberschreibung wird als `skipped-veraltet` gemeldet",
      r.status === "skipped-veraltet" && r.begruendung === "datenbank-hat-abgewehrt", `${r.status}/${r.begruendung}`);
    const telemetrie = require(path.join(ROOT, "lib/helmut/understanding")).buildOutcomeTelemetry({
      clusterCount: 1, results: [r]
    });
    check("8.2 Sie zaehlt NICHT als Fehler, sondern als Duplikat (nichts ist gescheitert)",
      telemetrie.gruppen.duplikate === 1 && telemetrie.gruppen.fehlgeschlagen === 0,
      JSON.stringify(telemetrie.gruppen));
    const src = fs.readFileSync(path.join(ROOT, "lib/helmut/understanding.js"), "utf8");
    check("8.3 `skipped-veraltet` ist der Gruppe `duplikate` zugeordnet",
      /"skipped-veraltet":\s*"duplikate"/.test(src));
    check("8.4 Der Speicherpfad erkennt den Trigger-Fehler ueberhaupt",
      /helmut-verstehen-fencing-veraltet/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8")));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("9 · Absturz VOR dem Modellaufruf ist sicher wiederholbar");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    const vgId = deriveVorgangId(baueCluster(TITEL[0], "rd-1"));
    // Reservierung eines Arbeiters, der danach verschwindet (kein Modellstart).
    await speicher.verstehenReserviere({ vorgangId: vgId, eingabeHash: "x", besitzer: "weg", ttlMs: 1000 });
    speicher.zeilen.get(vgId).leaseBis = Date.now() - 1;
    const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p, speicher));
    check("9.1 Der naechste Arbeiter uebernimmt und versteht (genau ein Modellaufruf)",
      r.status === "saved" && p.kiAufrufe === 1, `${r.status}/${p.kiAufrufe}`);
    check("9.2 Der Fencing-Wert ist gestiegen (der Vorgaenger hat sein Schreibrecht verloren)",
      p.gespeichert[0] && p.gespeichert[0].fencing === 2, JSON.stringify(p.gespeichert));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("10 · Absturz NACH dem Modellaufruf meldet nichts");
  {
    const p = neuesProtokoll();
    const proto = [];
    const speicher = baueSpeicherAttrappe({ protokoll: proto });
    const vgIdA = deriveVorgangId(baueCluster(TITEL[0], "rd-1"));
    const deps = baueDeps(p, speicher, {
      save: async () => { throw new Error("prozess-weg"); }
    });
    const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), deps).catch((e) => ({ status: `geworfen:${e.message}` }));
    check("10.1 Der Absturz wird durchgereicht (nichts wird beschoenigt)",
      String(r.status).startsWith("geworfen:"), String(r.status));
    // Ein geworfener Speicherfehler ist ein BEKANNTER Ausgang ohne Ergebnis: der finally-Zweig
    // gibt frei. Ein echter Prozessabbruch kann das nicht — dann greift die Lease-Regel.
    check("10.2 Der Zustand ist danach nicht 'fertig' (kein falsches Gruen)",
      speicher.zeilen.get(vgIdA).zustand !== "fertig",
      speicher.zeilen.get(vgIdA).zustand);
    check("10.3 Der Modellstart war vermerkt, bevor der Aufruf geschah",
      proto.some((z) => z[0] === "modellstart") && speicher.zeilen.get(vgIdA).kiAufrufe === 1);

    // Und jetzt der ECHTE Prozessabbruch: keine Freigabe, Lease laeuft ab.
    const p2 = neuesProtokoll();
    const speicher2 = baueSpeicherAttrappe();
    const vgId = deriveVorgangId(baueCluster(TITEL[0], "rd-1"));
    await speicher2.verstehenReserviere({ vorgangId: vgId, eingabeHash: "x", besitzer: "tot", ttlMs: 1000 });
    await speicher2.verstehenModellstart({ vorgangId: vgId, besitzer: "tot", fencing: 1, ttlMs: 1000 });
    speicher2.zeilen.get(vgId).leaseBis = Date.now() - 1;
    const r2 = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p2, speicher2));
    check("10.4 Ein echter Prozessabbruch endet in `skipped-ausgang-unbekannt`, nicht in einem 2. Aufruf",
      r2.status === "skipped-ausgang-unbekannt" && p2.kiAufrufe === 0, `${r2.status}/${p2.kiAufrufe}`);

    // Sichere automatische Aufloesung: das Ergebnis lag doch vor.
    const p3 = neuesProtokoll();
    const speicher3 = baueSpeicherAttrappe();
    await speicher3.verstehenReserviere({ vorgangId: vgId, eingabeHash: vertragModul.eingabeHash({ vorgangId: vgId, dokumente: [{ id: "rd-1" }], modus: "erst" }), besitzer: "tot", ttlMs: 1000 });
    await speicher3.verstehenModellstart({ vorgangId: vgId, besitzer: "tot", fencing: 1, ttlMs: 1000 });
    speicher3.kos.set(vgId, 1);                       // das Ergebnis WAR persistiert
    speicher3.zeilen.get(vgId).leaseBis = Date.now() - 1;
    const r3 = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p3, speicher3));
    check("10.5 Liegt das Ergebnis belegt vor, loest der Vertrag SELBST auf (kein Betreiber, keine KI)",
      r3.status === "duplicate" && p3.kiAufrufe === 0, `${r3.status}/${p3.kiAufrufe}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("11 · Vormerkungen: atomar erhoeht, bedingt geloescht");
  {
    const speicher = baueSpeicherAttrappe();
    const v = vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } });
    // Zwei gleichzeitige Erhoehungen VERSCHIEDENER Vorgaenge und desselben Vorgangs.
    await Promise.all([
      v.vormerkungErhoehe({ vorgangId: "vg-a", delta: 1, fencing: 1 }),
      v.vormerkungErhoehe({ vorgangId: "vg-b", delta: 1, fencing: 1 }),
      v.vormerkungErhoehe({ vorgangId: "vg-a", delta: 1, fencing: 2 })
    ]);
    check("11.1 Gleichzeitige Erhoehungen gehen NICHT verloren (2 fuer vg-a, 1 fuer vg-b)",
      speicher.vormerkungen.get("vg-a").fehlversuche === 2 && speicher.vormerkungen.get("vg-b").fehlversuche === 1,
      JSON.stringify([...speicher.vormerkungen]));
    const alt = await v.vormerkungLoese({ vorgangId: "vg-a", fencing: 1 });
    check("11.2 Ein ALTER Erfolgsmelder loescht die Vormerkung eines juengeren Laufs NICHT",
      alt.ok === false && speicher.vormerkungen.has("vg-a"));
    const neu = await v.vormerkungLoese({ vorgangId: "vg-a", fencing: 2 });
    check("11.3 Der aktuelle Lauf darf loeschen", neu.ok === true && !speicher.vormerkungen.has("vg-a"));
    check("11.4 Der Fachkern liest die Vormerkung GEZIELT je Vorgang (nie die ganze Karte)",
      /vormerkungLese\(/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/understanding.js"), "utf8")));
    check("11.5 Der CAS-Pfad benutzt KEIN Lesen-Aendern-Schreiben mehr",
      /vormerkungErhoehe\(\{/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/understanding.js"), "utf8")));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("12 · Fail closed an jeder Vertragsstelle");
  {
    const nichtPruefbar = { verfuegbar: false, grund: "migration-fehlt" };
    {
      const p = neuesProtokoll();
      const speicher = baueSpeicherAttrappe();
      speicher.verstehenReserviere = async () => nichtPruefbar;
      const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p, speicher));
      check("12.1 Reservierung nicht pruefbar -> kein Modellaufruf, sichtbarer Grund",
        r.status === "skipped-cluster-belegt" && /vertrag-nicht-pruefbar/.test(String(r.reason)) && p.kiAufrufe === 0,
        `${r.status}/${r.reason}/${p.kiAufrufe}`);
    }
    {
      const p = neuesProtokoll();
      const speicher = baueSpeicherAttrappe();
      speicher.verstehenModellstart = async () => nichtPruefbar;
      const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p, speicher));
      check("12.2 Modellstart nicht pruefbar -> KEIN Modellaufruf",
        r.status === "skipped-cluster-belegt" && p.kiAufrufe === 0, `${r.status}/${p.kiAufrufe}`);
    }
    {
      const p = neuesProtokoll();
      const speicher = baueSpeicherAttrappe();
      speicher.verstehenSchreibrecht = async () => nichtPruefbar;
      const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p, speicher));
      check("12.3 Schreibrecht nicht pruefbar -> NICHT gespeichert",
        r.status === "skipped-veraltet" && p.gespeichert.length === 0, `${r.status}/${p.gespeichert.length}`);
    }
    {
      const p = neuesProtokoll();
      const speicher = baueSpeicherAttrappe();
      speicher.verstehenAbschluss = async () => nichtPruefbar;
      const r = await understandOneCluster(baueCluster(TITEL[0], "rd-1"), baueDeps(p, speicher));
      check("12.4 Abschluss nicht pruefbar -> das eigene Ergebnis wird NICHT als fertig behauptet",
        r.status === "skipped-veraltet", r.status);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("13 · Mindestens 8 VERSCHIEDENE Vorgaenge laufen nachweislich parallel");
  {
    const p = neuesProtokoll();
    const speicher = baueSpeicherAttrappe();
    let gleichzeitig = 0;
    let hoechstens = 0;
    const deps = baueDeps(p, speicher, {
      requestUnderstanding: async () => {
        gleichzeitig += 1;
        hoechstens = Math.max(hoechstens, gleichzeitig);
        await new Promise((r) => setTimeout(r, 25));
        gleichzeitig -= 1;
        p.kiAufrufe += 1;
        return { ...ANALYSE };
      },
      enabled: () => true, aiEnabled: () => true,
      acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
      listPending: async () => [],
      verstehenParallelitaet: 8
    });
    const dokumente = TITEL.slice(0, 8).map((titel, i) => ({
      id: `rd-p${i}`, title: titel, published_at: "2026-08-14T08:00:00Z",
      url: `https://beispiel.invalid/${i}`, source_id: `q${i}`
    }));
    const start = Date.now();
    const ergebnis = await runUnderstandingShadow(dokumente, deps);
    const dauer = Date.now() - start;
    const verstanden = (ergebnis.results || []).filter((r) => r.status === "saved").length;
    check("13.1 Acht verschiedene Vorgaenge sind entstanden",
      new Set((ergebnis.results || []).map((r) => r.vorgangId)).size === 8,
      String(new Set((ergebnis.results || []).map((r) => r.vorgangId)).size));
    check("13.2 Alle acht wurden verstanden (genau acht Modellaufrufe)",
      verstanden === 8 && p.kiAufrufe === 8, `${verstanden}/${p.kiAufrufe}`);
    check("13.3 Sie liefen NACHWEISLICH gleichzeitig (Hoechststand 8)",
      hoechstens === 8, String(hoechstens));
    check("13.4 Der Lauf war kuerzer als die serielle Summe (8 x 25 ms)",
      dauer < 8 * 25, `${dauer} ms`);
    // Gegenprobe: ohne Vertrag bleibt es seriell.
    const p2 = neuesProtokoll();
    let gleichzeitig2 = 0;
    let hoechstens2 = 0;
    const ergebnis2 = await runUnderstandingShadow(dokumente, {
      ...deps,
      verstehenVertrag: () => null,
      requestUnderstanding: async () => {
        gleichzeitig2 += 1; hoechstens2 = Math.max(hoechstens2, gleichzeitig2);
        await new Promise((r) => setTimeout(r, 5));
        gleichzeitig2 -= 1; p2.kiAufrufe += 1; return { ...ANALYSE };
      }
    });
    check("13.5 OHNE Vertrag bleibt der Lauf seriell (Hoechststand 1) — der Riegel greift",
      hoechstens2 === 1 && (ergebnis2.results || []).length === 8, `${hoechstens2}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("14 · Mindestens 20 gleichzeitige Arbeiter auf DENSELBEN Vorgang");
  {
    const speicher = baueSpeicherAttrappe();
    let kiGesamt = 0;
    const cluster = baueCluster(TITEL[0], "rd-1");
    const arbeiter = Array.from({ length: 20 }, () => {
      const p = neuesProtokoll();
      const deps = baueDeps(p, speicher, {
        requestUnderstanding: async () => {
          kiGesamt += 1;
          await new Promise((r) => setTimeout(r, 20));
          return { ...ANALYSE };
        }
      });
      return understandOneCluster(cluster, deps);
    });
    const ergebnisse = await Promise.all(arbeiter);
    const gespeichert = ergebnisse.filter((r) => r.status === "saved").length;
    const belegt = ergebnisse.filter((r) => r.status === "skipped-cluster-belegt").length;
    check("14.1 Genau EIN Arbeiter fuehrt den Modellaufruf aus", kiGesamt === 1, String(kiGesamt));
    check("14.2 Genau EIN Arbeiter speichert", gespeichert === 1, String(gespeichert));
    check("14.3 Die uebrigen 19 werden geschlossen zurueckgestellt (kein stiller Verlust)",
      belegt === 19, `${belegt} von 19`);
    check("14.4 Jedes Ergebnis traegt eine benannte Klasse (keine leere Antwort)",
      ergebnisse.every((r) => r && typeof r.status === "string" && r.status.length > 0));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("15 · Cron, Warteschlange und Lambda benutzen denselben Fachpfad");
  {
    const schedulerSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/scheduler.js"), "utf8");
    const pipelineSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/scalable-pipeline.js"), "utf8");
    const verbraucherSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/queue-verbraucher.js"), "utf8");
    const understandingSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/understanding.js"), "utf8");
    check("15.1 Cron ruft runUnderstandingShadow", /runUnderstandingShadow\(/.test(schedulerSrc));
    check("15.2 Die Warteschlange ruft dieselbe Funktion ueber eagerUnderstanding",
      /eagerUnderstanding:\s*lazy\("\.\/understanding",\s*"runUnderstandingShadow"\)/.test(pipelineSrc));
    check("15.3 Der Lambda-/Wecksignal-Verbraucher ruft denselben Fachhandler",
      /fuehreAuftragAus/.test(verbraucherSrc));
    check("15.4 Der Vertrag haengt in defaultDeps — also an ALLEN drei Wegen",
      /verstehenVertrag:\s*\(\)\s*=>/.test(understandingSrc));
    check("15.5 Es gibt genau EINE Verstehensimplementierung (keine zweite Fachlogik)",
      (understandingSrc.match(/async function understandOneCluster\(/g) || []).length === 1);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("EINORDNUNG: Anwendungsseite gegen eine Attrappe der SQL-Semantik. Die");
  console.log("Datenbankzusagen selbst weist scripts/verstehen-cas-datenbank-test.js nach.");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.stack);
  process.exit(1);
});
