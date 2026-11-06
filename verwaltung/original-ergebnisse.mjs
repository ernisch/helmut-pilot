import { dateTime } from "./model.mjs";

// Ergebnisstand aus GET /api/admin/ergebnisse in die Originalansichten übertragen.
// Drei Positionen je Profil: Briefing · Zustellung · Lage. Radar nur im Profildetail.
// Höchste Stufe ohne Fachurteil ist „vollständig · nicht beurteilt“ – nie grün.
export const ERGEBNIS_POSITIONEN = Object.freeze([["briefing", "Briefing"], ["zustellung", "Zustellung"], ["lage", "Lage"]]);
export const ERGEBNIS_URSACHEN = Object.freeze({
  fehlt: { label: "Fehlt", tone: "bad", title: "Ergebnis fehlt", detail: "Für heute liegt kein gespeichertes Ergebnis vor." },
  fehler: { label: "Fehlt", tone: "bad", title: "Fehlt · technischer Fehler", detail: "Der Morgenlauf hat für dieses Profil einen Fehler gemeldet." },
  leer: { label: "Leer", tone: "warn", title: "Leer", detail: "Der Lauf ist erfolgt, hat aber keinen Fachinhalt geliefert." },
  unvollstaendig: { label: "Unvollständig", tone: "warn", title: "Inhalt unvollständig", detail: "Die Strukturprüfung hat Lücken gefunden." },
  wiederholung: { label: "Wiederholung", tone: "warn", title: "Wiederholung zwischen Ansichten", detail: "Derselbe Text steht in mehreren Ansichten." },
  "nicht-zugestellt": { label: "Nicht zugestellt", tone: "bad", title: "Nicht zugestellt", detail: "Die Zustellquittung fehlt oder bindet den gespeicherten Inhalt nicht." }
});
// Sechs Bilanzspalten (Vorlage: repeat(6)). Brauchbar/Unbrauchbar bleiben ohne Fachurteil ausgeblendet.
const SPALTEN = Object.freeze([["fehlt", "Fehlt"], ["leer", "Leer"], ["wiederholung", "Wiederholung"], ["unvollstaendig", "Unvollständig"],
  ["nichtZugestellt", "Nicht zugestellt"], ["nichtBeurteilt", "Nicht beurteilt"]]);
const STUFEN = ["Lauf erfolgt", "Inhalt vorhanden", "Inhalt vollständig", "Inhalt brauchbar"];
const ID = /^[a-z0-9][a-z0-9-]{0,119}$/i;
const n = value => Number.isInteger(value) && value >= 0 ? value : 0;

// Mehrere Seiten der Route zu einem Stand zusammenführen. Unklare Antworten zählen nicht.
export function ergebnisStand(seiten) {
  const liste = (Array.isArray(seiten) ? seiten : [seiten]).filter(Boolean);
  const erste = liste[0];
  if (!erste || erste.verfuegbar !== true || !/^\d{4}-\d{2}-\d{2}$/.test(erste.tag || "") || !erste.bilanz) return null;
  const byId = Object.create(null);
  for (const seite of liste) for (const p of Array.isArray(seite.profile) ? seite.profile : [])
    if (p && typeof p.id === "string" && ID.test(p.id) && p.positionen) byId[p.id] = p;
  return { tag: erste.tag, aktiv: n(erste.aktiv), bilanz: erste.bilanz, byId, vollstaendig: Object.keys(byId).length === n(erste.aktiv) };
}

const zelle = (component, e) => {
  if (!e) return component.st("Nicht geprüft", "neutral", { low: "nicht geprüft", hint: "Kein Ergebnis gelesen" });
  const u = e.ursache ? ERGEBNIS_URSACHEN[e.ursache] : null;
  if (u) return component.st(u.label, u.tone, { low: u.label.toLowerCase(), hint: u.title });
  if (e.stufe >= 3 && e.hinweis === "ruhiger-tag") return component.st("Vollständig", "neutral", { low: "vollständig", hint: "Ruhiger Tag · kein neuer Tagesanlass" });
  return e.stufe >= 3 ? component.st("Vollständig", "neutral", { low: "vollständig", hint: "Vollständig · nicht beurteilt" })
    : component.st("Nicht geprüft", "neutral", { low: "nicht geprüft", hint: "Nicht geprüft" });
};
const problemTon = r => {
  const toene = ERGEBNIS_POSITIONEN.map(([k]) => ERGEBNIS_URSACHEN[r.positionen[k]?.ursache]?.tone).filter(Boolean);
  return toene.includes("bad") ? "bad" : toene.length ? "warn" : null;
};

function radarZeile(radar) {
  if (!radar || radar.vorhanden === null) return "Nicht prüfbar, weil kein gültiges Briefing-Paket vorliegt";
  if (radar.vorhanden === false) return "Nicht im Paket";
  const teile = radar.abschnitte.map(a => `${a.label} ${a.anzahl ? a.anzahl : "leer"}`);
  teile.push(radar.wiederholung ? "Wiederholung zwischen Ansichten" : "keine Wiederholung");
  if (radar.ohneQuelle) teile.push(`${radar.ohneQuelle} ohne Quell-URL`);
  return teile.join(" · ");
}

export function applyErgebnisse(component, v, D, p) {
  const R = D.ergebnisse;
  if (v.rows) for (const row of v.rows) {
    const id = String(row.href || "").replace("#/profil/", "");
    const prof = D.byId[id], r = R?.byId[id];
    if (prof?.aktiv === false) continue;
    // Vorlage: Spalte b = Briefing, l = Zustellung, rd = Lage (Kopfzeilen im Paketbau umbenannt).
    [row.b, row.l, row.rd] = ERGEBNIS_POSITIONEN.map(([k]) => zelle(component, r?.positionen[k]));
    if (r) {
      const ton = problemTon(r);
      row.st = ton === "bad" ? component.st("Problem", "bad") : ton === "warn" ? component.st("Unvollständig", "warn") : component.st("Nicht beurteilt", "neutral");
      if (r.letzterErfolg) row.last = dateTime(r.letzterErfolg, true);
    }
  }
  if (v.pProfil && p && v.pd) {
    const r = R?.byId[p.id];
    v.pd.areas = ERGEBNIS_POSITIONEN.map(([k, label]) => {
      const e = r?.positionen[k], u = e?.ursache ? ERGEBNIS_URSACHEN[e.ursache] : null;
      const stufe = e ? e.stufe : 0, t = component.tone(u?.tone || "neutral");
      const stufen = k === "zustellung" ? [0, 2] : [0, 1, 2]; // Zustellung kennt nur Stufe 1 und 3.
      return { label, st: zelle(component, e),
        segs: STUFEN.map((tt, i) => ({ t: k === "zustellung" && [1, 3].includes(i) ? `${tt} · –` : tt,
          bg: stufen.includes(i) && i < stufe ? t.bar : "var(--line-2)" })),
        stageText: !e ? "Kein Ergebnis gelesen" : stufe === 0 ? "Lauf nicht erfolgt" : `Erreicht: ${STUFEN[stufe - 1]}`,
        text: u ? `${u.title}. ${u.detail}` : e?.hinweis === "ruhiger-tag" ? "Ruhiger Tag: kein neuer belegter Tagesanlass. Das Briefing ist vollständig; Sachstand und Einordnung stehen in der Lage." : e?.stufe >= 3 ? "Inhalt vollständig. Die Qualitätsprüfung hat noch kein Urteil." : "Kein Ergebnis für diesen Tag gelesen." };
    });
    if (r) {
      const ton = problemTon(r);
      v.pd.st = ton === "bad" ? component.st("Problem", "bad") : ton === "warn" ? component.st("Unvollständig", "warn") : component.st("Nicht beurteilt", "neutral");
      v.pd.answers = v.pd.answers.filter(a => !["Ergebnisse", "Radar im Briefing"].includes(a.k));
      v.pd.answers.push({ k: "Radar im Briefing", v: radarZeile(r.radar), ink: "var(--text)" });
      v.pd.tech = [...(v.pd.tech || []), ...ERGEBNIS_POSITIONEN.map(([k]) => ({ line: `${k}: stufe ${r.positionen[k].stufe}${r.positionen[k].code ? " · " + r.positionen[k].code : ""}` }))];
    }
  }
  if (!R) return v;
  const ergebnisse = Object.values(R.byId);
  const mitProblem = ergebnisse.filter(r => problemTon(r)).length;
  const vollstaendig = ergebnisse.filter(r => ERGEBNIS_POSITIONEN.every(([k]) => r.positionen[k]?.stufe >= 3 && !r.positionen[k]?.ursache)).length;
  if (v.bigNums) {
    v.bigNums[2] = { ...v.bigNums[2], label: "Vollständig", value: R.vollstaendig ? String(vollstaendig) : "—", sub: "Vollständig · nicht beurteilt", ink: "var(--ink)" };
    v.bigNums[3] = { ...v.bigNums[3], value: R.vollstaendig ? String(mitProblem) : "—", sub: "Ursachen unten", ink: mitProblem ? "var(--risk)" : "var(--ink)" };
  }
  // Problemgruppen nach Ursache und Position.
  const gruppen = [];
  for (const [k, label] of ERGEBNIS_POSITIONEN) for (const [code, u] of Object.entries(ERGEBNIS_URSACHEN)) {
    const anzahl = ergebnisse.filter(r => r.positionen[k]?.ursache === code).length;
    if (anzahl) gruppen.push({ ...component.tone(u.tone), title: u.title, detail: u.detail, areaLabel: label, tone: u.tone,
      countLabel: `${anzahl} ${anzahl === 1 ? "Profil" : "Profile"}`, anzahl, onClick: component.go("#/profile") });
  }
  gruppen.sort((a, b) => (a.tone === "bad" ? 0 : 1) - (b.tone === "bad" ? 0 : 1) || b.anzahl - a.anzahl);
  if (v.groups) { v.groups = gruppen.slice(0, 6); v.groupsEmpty = !gruppen.length; v.groupsMore = gruppen.length > 6;
    v.attSub = gruppen.length ? `${mitProblem} ${mitProblem === 1 ? "Profil" : "Profile"} · nach Ursache` : "Ergebnisse vollständig · nicht beurteilt"; }
  if (v.health && !["Zugriff gesperrt", "Daten nicht verfügbar"].includes(v.health.label)) {
    const top = gruppen[0];
    v.health = mitProblem
      ? { ...v.health, dot: component.tone(top.tone).dot, halo: component.tone(top.tone).halo, label: top.tone === "bad" ? "Störung" : "Eingeschränkt",
        text: `${mitProblem} von ${R.aktiv} aktiven Profilen mit Problem. Häufigste Ursache: ${top.areaLabel} · ${top.title}.` }
      : { ...v.health, text: `Alle ${R.aktiv} aktiven Profile vollständig. Ein Fachurteil liegt nicht vor, daher nicht beurteilt.` };
  }
  if (v.hasTabs && component.state.route.page === "betrieb" && R.bilanz) {
    v.bilanzHead = R.vollstaendig ? `${vollstaendig} von ${R.aktiv} aktiven Profilen vollständig · nicht beurteilt.` : `Ergebnisstand ${R.tag}`;
    v.bilanzSub = `Berliner Tag ${R.tag} · ${R.aktiv} aktive Profile · ohne Fachurteil ist nichts „brauchbar“`;
    v.bucketHeads = SPALTEN.map(([, label]) => ({ label }));
    v.bilanzRows = ERGEBNIS_POSITIONEN.map(([k, label]) => ({ label, cells: SPALTEN.map(([key, spalte]) => {
      const b = R.bilanz[k] || {}, wert = key === "fehlt" ? n(b.fehlt) + n(b.fehler) : n(b[key]);
      const passt = !(k === "zustellung" && ["leer", "wiederholung", "unvollstaendig"].includes(key))
        && !(k !== "zustellung" && key === "nichtZugestellt");
      const ton = ["fehlt", "nichtZugestellt"].includes(key) ? "var(--bad-ink)" : key === "nichtBeurteilt" ? "var(--text)" : "var(--warn-ink)";
      return { v: passt ? String(wert) : "–", label: spalte, aria: `${label}, ${key === "wiederholung" ? "Wiederholung zwischen Ansichten" : spalte}: ${passt ? wert : "nicht zutreffend"}`,
        pe: passt && wert ? "auto" : "none", ink: !passt || !wert ? "var(--muted-2)" : ton, onClick: component.go("#/profile") };
    }) }));
  }
  return v;
}
