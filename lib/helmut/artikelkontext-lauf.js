"use strict";

// Ausfuehrungsschicht: der reine Understanding-/Lesepfad importiert keinen Crawler.
// Code vorbereitet, Default AUS; weder Datei-Flag noch Umgebung werden gesetzt.
const U = require("./understanding");
const B = require("./artikelkontext-beschaffung");
const R = require("./verstehen-restzeit");
const { MAX_ABRUF_MS } = require("./artikelkontext-abrufschutz");
const MAX_NEUE_ABRUFE = 1;

function mitArtikelkontext(overrides = {}, env = process.env, beschaffungsDeps = {}) {
  if (env.HELMUT_ARTIKELKONTEXT !== "on") return overrides;
  const jetzt = () => Date.now();
  const fristen = [Number(overrides.deadlineMs),
    Number(overrides.budgetMs) > 0 ? jetzt() + Number(overrides.budgetMs) : 0]
    .filter(n => Number.isFinite(n) && n > 0);
  const laufDeadline = fristen.length ? Math.min(...fristen) : 0;
  let neueAbrufe = 0;
  const zeitReicht = (deadline, reserve) => deadline > 0 && deadline - jetzt() >= reserve;
  const speicherMs = R.speicherTimeoutMs(env);
  const modellReserve = R.reserveVorModellstartMs(env);
  const luecke = reason => ({ angefordert: true, ok: false, reason });
  return { ...overrides, artikelkontextVersorgung: async (dokumente, { cas, deadlineMs } = {}) => {
    // Kein vermeintlicher Faktencheck anhand einzelner Woerter oder Auszuglaengen.
    // Genau der erste direkte Medienartikel der bestehenden Promptauswahl. Kein
    // Ausweichen auf einen anderen Artikel bei fehlendem/widerspruechlichem Beleg.
    const doc = dokumente.find(d => d.source_type === "media" && d.link_type === "direct");
    if (!doc) return { angefordert: false };
    if (!cas) return luecke("cas-erforderlich");
    const deadline = Number.isFinite(deadlineMs) && deadlineMs > 0
      ? Math.min(laufDeadline || deadlineMs, deadlineMs) : laufDeadline;
    if (!deadline) return luecke("deadline-erforderlich");
    if (!zeitReicht(deadline, speicherMs + modellReserve)) return luecke("restzeit-vor-beleglesung");
    const result = await B.beschaffeArtikelkontext(doc, { versuch: true }, {
      ...beschaffungsDeps, env,
      // NACH der Bestandslesung, VOR INSERT. Ein fertiger Beleg kostet keinen
      // neuen Abrufplatz. Synchroner Riegel auch fuer parallele Cluster im Lauf.
      erlaubeNeuenAbruf: () => {
        if (neueAbrufe >= MAX_NEUE_ABRUFE) return "laufgrenze";
        // Vier weitere Belegzugriffe + zwei Anbieterzugriffe + Netzfrist + Puffer.
        // Konservativ auch dann, wenn Anbieterreservierung schon in der Netzfrist liegt.
        if (!zeitReicht(deadline, 6 * speicherMs + MAX_ABRUF_MS + 5000 + modellReserve)) return "restzeit-vor-abruf";
        neueAbrufe++;
        return null;
      }
    });
    if (!zeitReicht(deadline, modellReserve)) return luecke("restzeit-nach-beschaffung");
    return { ...result, angefordert: true };
  } };
}

function runUnderstandingShadow(dokumente, overrides = {}) {
  return U.runUnderstandingShadow(dokumente, mitArtikelkontext(overrides));
}
function runPendingUnderstandingShadow(dokumente, overrides = {}) {
  return U.runPendingUnderstandingShadow(dokumente, mitArtikelkontext(overrides));
}
module.exports = { mitArtikelkontext, runUnderstandingShadow, runPendingUnderstandingShadow, MAX_NEUE_ABRUFE };
