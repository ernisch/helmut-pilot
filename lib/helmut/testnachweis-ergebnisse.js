"use strict";

// Vollstaendigkeit und Herkunft, niemals eine semantische Faktenfreigabe.
const B = require("./briefing-speicher");
const A = require("./briefing-ausgabebeleg");
const L = require("./briefing-lauf");
const E = require("./lage-quellenbeleg");
const { berlinTagKey } = require("./briefing-frische");
const { assertTenant } = require("./storage");
const ARTEN = ["mandatsbriefing", "morgenbriefing", "lage"];
const GRUENDE = ["ergebnis-fehlt", "tag-ausserhalb-testfenster", "paketbindung-fehlt",
  "ergebnis-auswahl-abweichend", "paketbindung-abweichend", "ergebnis-ausserhalb-testfenster",
  "ergebnis-strukturell-unvollstaendig", "struktur-und-fenster-bestaetigt", "lage-paketbindung-abweichend",
  "morgen-quittung-abweichend", "morgen-inhaltsbindung-fehlt", "morgen-paket-unvollstaendig",
  "ergebnis-waehrend-lesung-veraendert", "ergebnis-unlesbar", "app-vertrag-nicht-pruefbar"];
const negativ = grund => ({ geprueft: false, vollstaendig: false, grund });
const offen = grund => Object.fromEntries(ARTEN.map(art => [art, negativ(grund)]));
function tagImFenster(tag, fenster) {
  const start = Date.parse(fenster?.aktiviertAm), ende = Date.parse(fenster?.manifest?.endeAm);
  return Number.isFinite(start) && Number.isFinite(ende)
    && tag >= berlinTagKey(new Date(start)) && tag <= berlinTagKey(new Date(ende));
}
function pruefe({ userId, tag, fenster, app, rows, jetzt = new Date() }) {
  assertTenant(userId, "testnachweisErgebnisse");
  const out = offen("ergebnis-fehlt"), n = app?.gespeicherterNachweis;
  if (!tagImFenster(tag, fenster)) return offen("tag-ausserhalb-testfenster");
  const start = Date.parse(fenster.aktiviertAm);
  const ende = Math.min(Date.parse(fenster.manifest.endeAm), new Date(jetzt).getTime(),
    fenster.zustand === "beendet" ? Date.parse(fenster.beendetAm) : Infinity);
  const zeitPasst = value => typeof value === "string" && Number.isFinite(Date.parse(value))
    && Date.parse(value) >= start && Date.parse(value) <= ende && berlinTagKey(new Date(value)) === tag;
  const ids = { mandatsbriefing: n?.id, morgenbriefing: L.laufId(userId, tag), lage: `bf-${userId}-lage-${tag}` };
  if (!require("./briefing-profilkontext").nachweisKennungGueltig(n, userId, tag)) return offen("paketbindung-fehlt");
  if (!Array.isArray(rows) || rows.length > 3 || new Set(rows.map(r => r?.id)).size !== rows.length
    || rows.some(r => r?.user_id !== userId || !Object.values(ids).includes(r.id)))
    return offen("ergebnis-auswahl-abweichend");
  const paket = rows.find(r => r.id === ids.mandatsbriefing), p = paket?.payload;
  let paketGebunden = false;
  if (paket) {
    try {
      B.pruefeZeile(paket, { userId, day: tag, id: ids.mandatsbriefing });
      paketGebunden = /^[a-f0-9]{64}$/.test(n.profilHash || "") && n.profilHash === p.profilHash
        && n.inhaltHash === p.inhaltHash
        && Date.parse(n.erzeugtAm) === Date.parse(paket.generated_at);
      const inhalt = B.pruefeInhalt(p.briefing, p.lage);
      // Dieselbe strenge Paketpruefung wie beim Writer, frisch berechnet.
      const nichtLeer = p.briefing.items.every(i => i && typeof i === "object"
        && [i.title, i.displayTitle, i.display_title].some(t => typeof t === "string" && t.trim()));
      out.mandatsbriefing = !paketGebunden ? negativ("paketbindung-abweichend")
        : !zeitPasst(paket.generated_at) || !zeitPasst(p.erzeugtAm)
          || Date.parse(p.erzeugtAm) !== Date.parse(paket.generated_at) ? negativ("ergebnis-ausserhalb-testfenster")
        : !inhalt.strukturellVollstaendig || !nichtLeer ? negativ("ergebnis-strukturell-unvollstaendig")
        : { vollstaendig: true, grund: "struktur-und-fenster-bestaetigt", inhaltHash: p.inhaltHash,
          erzeugtAm: paket.generated_at };
    } catch { out.mandatsbriefing = negativ("paketbindung-abweichend"); }
  }
  const lage = rows.find(r => r.id === ids.lage);
  if (lage) {
    const lp = lage.payload;
    out.lage = lage.slot !== "lage" || !paketGebunden || !lp || B.hash(lp) !== B.hash(p.lage)
      ? negativ("lage-paketbindung-abweichend")
      : !zeitPasst(lage.generated_at) || !zeitPasst(lp.generatedAt)
        || Date.parse(lage.generated_at) !== Date.parse(lp.generatedAt) ? negativ("ergebnis-ausserhalb-testfenster")
      : !E.gespeicherterTextGueltig(lp) ? negativ("ergebnis-strukturell-unvollstaendig")
      : { vollstaendig: true, grund: "struktur-und-fenster-bestaetigt", inhaltHash: B.hash(lp), erzeugtAm: lage.generated_at };
  }
  const morgen = rows.find(r => r.id === ids.morgenbriefing);
  if (morgen) {
    const q = morgen.payload;
    out.morgenbriefing = morgen.slot !== L.SLOT_ERFOLG || q?.tenantId !== userId || q?.berlinTag !== tag
      || q?.vertragVersion !== require("./briefing-frische").VERTRAG_VERSION || q.status !== L.STATUS_ERFOLG
      || ![L.AUSLOESER_MORGENLAUF, L.AUSLOESER_NACHLAUF].includes(q.ausloeser)
      ? negativ("morgen-quittung-abweichend")
      : !zeitPasst(morgen.generated_at) || !zeitPasst(q.erzeugtAm)
        || Date.parse(q.erzeugtAm) !== Date.parse(morgen.generated_at) ? negativ("ergebnis-ausserhalb-testfenster")
      : !paketGebunden || !A.passt(q.ausgabeBeleg, paket)
        || q.signatur !== L.inhaltsSignatur(p.briefing) ? negativ("morgen-inhaltsbindung-fehlt")
      : !out.mandatsbriefing.vollstaendig ? negativ("morgen-paket-unvollstaendig")
      : { vollstaendig: true, grund: "struktur-und-fenster-bestaetigt",
        inhaltHash: q.ausgabeBeleg.briefingHash, erzeugtAm: morgen.generated_at };
  }
  for (const art of ARTEN) out[art].geprueft = true;
  return out;
}

async function lese({ userId, tag, fenster, app, projectUrl, key, fetchFn, jetzt }) {
  assertTenant(userId, "testnachweisErgebnisseLesen");
  if (!tagImFenster(tag, fenster)) return offen("tag-ausserhalb-testfenster");
  const n = app?.gespeicherterNachweis;
  if (!require("./briefing-profilkontext").nachweisKennungGueltig(n, userId, tag)) return offen("paketbindung-fehlt");
  const url = new URL(projectUrl + "/rest/v1/briefings");
  url.searchParams.set("select", "id,user_id,slot,generated_at,payload");
  url.searchParams.set("user_id", "eq." + userId);
  url.searchParams.set("id", `in.(${n.id},${L.laufId(userId, tag)},bf-${userId}-lage-${tag})`);
  url.searchParams.set("order", "id.asc"); url.searchParams.set("limit", "4");
  const lesen = async () => {
    const r = await fetchFn(url.href, { method: "GET", redirect: "error", signal: AbortSignal.timeout(12000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", Prefer: "count=exact" } });
    if (r.status !== 200) throw new Error("ergebnis-unlesbar");
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length > 3
      || r.headers?.get("content-range") !== (rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0"))
      throw new Error("ergebnis-unlesbar");
    return rows;
  };
  try {
    const vorher = await lesen(), nachher = await lesen();
    // Keine Snapshotbehauptung: erkannte Aenderung macht diesen Beleg unpruefbar.
    if (B.hash(vorher) !== B.hash(nachher)) return offen("ergebnis-waehrend-lesung-veraendert");
    return pruefe({ userId, tag, fenster, app, rows: nachher, jetzt });
  } catch { return offen("ergebnis-unlesbar"); }
}
function bilanziere(results) {
  return Object.fromEntries(ARTEN.map(art => {
    const zaehler = { ziel: 500, geprueft: 0, nichtGeprueft: 500,
      vollstaendig: 0, nichtBestaetigt: 500, gruende: {} };
    for (const r of results) {
      const e = r.ergebnisArten?.[art] || negativ("app-vertrag-nicht-pruefbar");
      if (e.geprueft === true) zaehler.geprueft++;
      if (e.geprueft === true && e.vollstaendig === true) zaehler.vollstaendig++;
      const grund = GRUENDE.includes(e.grund) ? e.grund : "sonstige";
      zaehler.gruende[grund] = (zaehler.gruende[grund] || 0) + 1;
    }
    // Auch bei Abbruch vor der ersten oder mitten in der Lesung stehen alle
    // 1500 Sollpositionen in der Bilanz. Unbesucht bedeutet nicht fehlend.
    if (results.length < 500) zaehler.gruende["profil-nicht-gelesen"] = 500 - results.length;
    zaehler.nichtGeprueft = 500 - zaehler.geprueft;
    zaehler.nichtBestaetigt = 500 - zaehler.vollstaendig;
    return [art, zaehler];
  }));
}
module.exports = { ARTEN, offen, tagImFenster, pruefe, lese, bilanziere };
