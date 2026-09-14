"use strict";

// Bindung einer SEPARATEN fachlichen Gesamtpruefung. Dieser Vertrag trifft
// selbst kein positives Sachurteil und setzt keinen 500er Erfolgsnachweis.
const { hash } = require("./briefing-speicher");
const VERSION = 1;
const KRITERIEN = Object.freeze(["quellentiefe", "rangfolge", "mandatsbezug",
  "auslassungen", "zeitbezug", "vollstaendigkeit"]);
const keys = (v, names) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const text = v => typeof v === "string" && v.trim().length >= 20;

function leseTag(value) {
  if (typeof value !== "string") return null;
  // Alte Recherchebelege kennen teils nur den Tag. Keine Uhrzeit erfinden.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value.slice(0, 10)
    ? require("./briefing-frische").berlinTagKey(d) : null;
}

// Separat gelesener Originalkontext ist keine wortgetreue Quellenpassage.
// Er bleibt als datierte Lesenotiz im Urteil, niemals im Quellenfeld auszug.
// Diese Bindung ersetzt weder das Sachurteil noch eine historische Aufnahme.
function leseBelegPasst(q, b, tag) {
  const gelesenTag = leseTag(b?.gelesenAm);
  return keys(b, ["version", "art", "url", "gelesenAm", "quellenHash", "notiz",
    "nachweisDateiHash", "nachweisStelle", "historischeFassungBestaetigt"])
    && b.version === 1 && b.art === "redaktionelle-lesenotiz"
    && b.url === q.url && b.quellenHash === hash(q)
    && gelesenTag !== null && gelesenTag <= tag
    && text(b.notiz) && b.notiz.trim() !== q.titel.trim()
    && /^[a-f0-9]{64}$/.test(b.nachweisDateiHash) && text(b.nachweisStelle)
    && b.historischeFassungBestaetigt === false;
}

function umfang(result, urteil) {
  const e = result.eingabe;
  return { eingabeHash: e.eingabeHash, darstellungsHash: e.darstellungsHash,
    ursprungHash: urteil.korrektur?.ursprungHash || urteil.ursprungHash,
    auswahl: (result.briefing.items || []).map(i => i.vorgangId),
    hauptvorgang: result.briefing.currentHelmutState?.primaryVorgangId || null,
    auslassungen: (urteil.korrektur?.auslassungen?.map(a => a.vorgangId)
      || urteil.ausgelasseneVorgaenge || []).slice().sort() };
}

function pruefe(result, urteil) {
  const fail = grund => ({ bereit: false, grund, vollstaendigeFaktenpruefung: false });
  if (!result?.briefing?.available || !result?.eingabe) return fail("briefing-gesamtpruefung-ohne-inhalt");
  const g = urteil?.gesamtpruefung;
  if (!keys(g, ["version", "umfang", "kriterien", "quellen"]) || g.version !== VERSION)
    return fail("briefing-gesamtpruefung-fehlt");
  const u = umfang(result, urteil);
  if (!u.auswahl.length || new Set(u.auswahl).size !== u.auswahl.length
    || !/^[a-f0-9]{64}$/.test(u.ursprungHash || "") || hash(g.umfang) !== hash(u))
    return fail("briefing-gesamtpruefung-veraltet");
  if (!keys(g.kriterien, KRITERIEN) || KRITERIEN.some(k =>
    !keys(g.kriterien[k], ["bestanden", "begruendung"])
    || g.kriterien[k].bestanden !== true || !text(g.kriterien[k].begruendung)))
    return fail("briefing-gesamtpruefung-abgelehnt");
  const quellen = result.eingabe.quellen.filter(q => u.auswahl.includes(q.vorgangId));
  if (!Array.isArray(g.quellen) || g.quellen.length !== quellen.length
    || new Set(g.quellen.map(q => `${q?.vorgangId}:${q?.documentId}`)).size !== quellen.length)
    return fail("briefing-quellentiefe-unvollstaendig");
  for (const q of quellen) {
    const r = g.quellen.find(r => r?.documentId === q.documentId && r.vorgangId === q.vorgangId);
    // Ein Titel allein bleibt unzureichend. Alternativ darf ein separat
    // gelesener Kontext exakt gebunden werden. Das tatsaechliche Lesedatum
    // bleibt erhalten; das gesonderte Zeiturteil muss seine Tragfaehigkeit
    // am aktuellen Prueftag bestaetigen. Kein kuenftiger Beleg, kein Umstempeln.
    const fields = ["vorgangId", "documentId", "quellenHash", "kontextGetragen", "begruendung"];
    const hatLesebeleg = Object.hasOwn(r || {}, "lesebeleg");
    const auszug = q.auszug?.trim() && q.auszug.trim() !== q.titel.trim();
    if (!keys(r, hatLesebeleg ? fields.concat("lesebeleg") : fields)
      || r.quellenHash !== hash(q) || r.kontextGetragen !== true || !text(r.begruendung))
      return fail("briefing-quellentiefe-abgelehnt");
    if ((hatLesebeleg && !leseBelegPasst(q, r.lesebeleg, result.eingabe.tag))
      || (!auszug && !hatLesebeleg)) return fail("briefing-quellentiefe-abgelehnt");
  }
  if (u.auswahl.some(id => !quellen.some(q => q.vorgangId === id)))
    return fail("briefing-quellentiefe-unvollstaendig");
  return { bereit: true, grund: null, gesamturteilHash: hash(g),
    methode: "separates-gesamturteil-exakt-gebunden", vollstaendigeFaktenpruefung: false };
}

module.exports = { VERSION, KRITERIEN, umfang, pruefe };
