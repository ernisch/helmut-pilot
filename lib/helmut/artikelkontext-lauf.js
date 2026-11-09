"use strict";

// Ausfuehrungsschicht: der reine Understanding-/Lesepfad importiert keinen Crawler.
// Code vorbereitet, Default AUS; weder Datei-Flag noch Umgebung werden gesetzt.
const U = require("./understanding");
const B = require("./artikelkontext-beschaffung");
const R = require("./verstehen-restzeit");
const { MAX_ABRUF_MS } = require("./artikelkontext-abrufschutz");
const MAX_NEUE_ABRUFE = 1;

function mitArtikelkontext(overrides = {}, env = process.env, beschaffungsDeps = {}, optionen = {}) {
  // Die globale Versorgung hat bereits einmal beschafft. Ihr rein lesender
  // Beleganschluss darf nicht durch einen Beschaffer je Understanding-Stapel
  // ersetzt werden, auch nicht bei aktiviertem bisherigen Artikelkontextflag.
  const versorgt = typeof overrides.artikelkontextVersorgung === "function";
  if (!versorgt && env.HELMUT_ARTIKELKONTEXT !== "on") return overrides;
  const jetzt = () => Date.now();
  const fristen = [Number(overrides.deadlineMs),
    Number(overrides.budgetMs) > 0 ? jetzt() + Number(overrides.budgetMs) : 0]
    .filter(n => Number.isFinite(n) && n > 0);
  const laufDeadline = fristen.length ? Math.min(...fristen) : 0;
  // Auch ein bereits gelieferter Beleganschluss muss das engere Teilbudget
  // einhalten. Nur den Beschaffer erhalten, nicht die aeussere Modellfrist.
  if (versorgt) return { ...overrides, ...(laufDeadline ? { deadlineMs: laufDeadline } : {}) };
  let neueAbrufe = 0;
  const zeitReicht = (deadline, reserve) => deadline > 0 && deadline - jetzt() >= reserve;
  const speicherMs = R.speicherTimeoutMs(env);
  const modellReserve = R.reserveVorModellstartMs(env);
  const luecke = reason => ({ angefordert: true, ok: false, reason });
  const nurBestand = optionen.nurBestand === true;
  const hosts = new Set(require("./quellen-inhaltsversorgung-anschluss").inhaltsauftragAusEnv(env)?.hosts || []);
  // Dieselbe engere Frist muss auch hinter der Beschaffung gelten: Reservierung,
  // Budgetlesung und Modellstart verbrauchen weitere Zeit. Sonst prueft nur der
  // Belegweg das Teilbudget, waehrend der Modellweg die laengere Aussenfrist nutzt.
  const artikelkontextVersorgung = async (dokumente, { cas, deadlineMs } = {}) => {
    // Kein vermeintlicher Faktencheck anhand einzelner Woerter oder Auszuglaengen.
    // Nur die bestehende Promptauswahl. Kein Ausweichen auf einen anderen
    // Artikel bei fehlendem/widerspruechlichem Beleg.
    // Im Nachholpfad nur echte Inhaltsluecken schliessen. Bereits nutzbarer
    // RSS-/Originaltext und amtlich gebundene Metadaten brauchen keinen Cache.
    // Der Quellentyp darf einen Verband wie den DGB nicht ausschliessen.
    const inhaltsluecken = nurBestand
      ? dokumente.filter(d => require("./quellen-inhaltsversorgung-anschluss").brauchtInhalt(d)) : [];
    // Der bestehende Promptvertrag traegt genau einen Beleg. Eine zweite
    // nackte Titelquelle darf damit weder verstanden noch verknuepft werden.
    if (inhaltsluecken.length > 1) return luecke("mehrere-artikelkontexte");
    const doc = nurBestand
      ? inhaltsluecken[0]
      : dokumente.find(d => d.source_type === "media" && d.link_type === "direct");
    if (!doc) return { angefordert: false };
    if (!cas) return luecke("cas-erforderlich");
    const deadline = Number.isFinite(deadlineMs) && deadlineMs > 0
      ? Math.min(laufDeadline || deadlineMs, deadlineMs) : laufDeadline;
    if (!deadline) return luecke("deadline-erforderlich");
    if (!zeitReicht(deadline, speicherMs + modellReserve)) return luecke("restzeit-vor-beleglesung");
    if (nurBestand) {
      if (doc.link_type !== "direct") return luecke("artikelziel-nicht-bestaetigt");
      // Den alten Quellenstand zuerst lesen, damit bestehende Eingabehashes
      // erhalten bleiben. Ein spaeter gespeicherter Einstieg liegt unter v2.
      // Beide Versuche bleiben vor Reservierung/Netz strikt lesend.
      const deps = { ...beschaffungsDeps, env, erlaubeNeuenAbruf: () => "nur-bestand" };
      let result = await B.beschaffeArtikelkontext(doc, { versuch: true }, deps);
      if (!result.ok) {
        if (!zeitReicht(deadline, speicherMs + modellReserve)) return luecke("restzeit-vor-beleglesung");
        result = await B.beschaffeArtikelkontext(doc, { versuch: true, kontext: "einstieg" }, deps);
      }
      if (!zeitReicht(deadline, modellReserve)) return luecke("restzeit-nach-beschaffung");
      return { ...result, angefordert: true };
    }
    // Wie der Beschaffer das Ziel vor seinem ersten await festhalten. Eine
    // spaetere Aufrufermutation darf keinen anderen Host fuer den Abruf erlauben.
    let hostErlaubt = false;
    try { hostErlaubt = hosts.has(new URL(doc.url).hostname); } catch { /* Beschaffer prueft das Ziel. */ }
    const result = await B.beschaffeArtikelkontext(doc, { versuch: true, einstiegBestand: true }, {
      ...beschaffungsDeps, env,
      // NACH der Bestandslesung, VOR INSERT. Ein fertiger Beleg kostet keinen
      // neuen Abrufplatz. Synchroner Riegel auch fuer parallele Cluster im Lauf.
      erlaubeNeuenAbruf: () => {
        // Auch die alten Eagereinstiege teilen die exakte Hostfreigabe. Ein
        // bestaetigter Cachebeleg wurde vorher gelesen und braucht keinen Abruf.
        if (!hostErlaubt) return "herausgeber-nicht-freigegeben";
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
  };
  if (nurBestand) artikelkontextVersorgung.nurBestand = true;
  return { ...overrides, ...(laufDeadline ? { deadlineMs: laufDeadline } : {}), artikelkontextVersorgung };
}

function runUnderstandingShadow(dokumente, overrides = {}) {
  return U.runUnderstandingShadow(dokumente, mitArtikelkontext(overrides));
}
function runPendingUnderstandingShadow(dokumente, overrides = {}) {
  return U.runPendingUnderstandingShadow(dokumente, mitArtikelkontext(overrides, process.env, {}, { nurBestand: true }));
}
module.exports = { mitArtikelkontext, runUnderstandingShadow, runPendingUnderstandingShadow, MAX_NEUE_ABRUFE };
