"use strict";

// Die geprueften Deutschlandfunk-Nachrichten tragen kein Article-JSON-LD. Die
// Seitenstruktur bindet stattdessen kanonische Adresse, og:url, og:title, die
// vollstaendige Artikelueberschrift (Kicker und Titel) und einen sichtbaren
// Publikationszeitpunkt. Nur der erste echte Inhaltsabsatz der gebundenen
// Artikelunterseite wird Beleg. Kein Titelwort-Ranking, kein spaeterer Rueckfall,
// keine Vereinigung mehrerer Bloecke und keine erfundene Evidenz. Die strengen
// HTML-Regeln sind bewusst dieselben wie im generischen Pfad: versteckte
// Vorfahren und versteckte Teiltexte sperren jeden Beleg.
const crypto = require("node:crypto");
const A = require("./artikelkontext");
const { plain } = require("./quellen-auszug");
const MAX_ABSAETZE = 256;
const INLINE = new Set(["a", "strong", "em", "b", "i", "span", "sup", "sub", "small", "abbr", "q", "cite"]);
const LEER = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
  "source", "track", "wbr"]);
const GESPERRT = new Set(["nav", "aside", "footer", "figure", "figcaption", "noscript", "iframe", "svg", "form"]);
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
function fordere(ok, reason) { if (!ok) throw new Error("artikelkontext-" + reason); }
function attrs(tag) {
  const result = {};
  for (const m of tag.matchAll(/\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu)) {
    const name = m[1].toLowerCase();
    fordere(!Object.hasOwn(result, name), "html-attribute-mehrdeutig");
    result[name] = plain(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return result;
}
function key(value) {
  return plain(value).normalize("NFKC").replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
}
function tagStart(html) { return (/<[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(html) || [""])[0]; }
// Keine Blockelemente, Zeilenumbrueche oder versteckten Teiltexte zusammenziehen.
// Belegte Inline-Auszeichnung (Links, Hervorhebungen) verschwindet wie im
// Bundestag-Leitabsatz ohne zusaetzliche Leerzeichen; geschuetzte Leerzeichen
// bleiben ein normales Leerzeichen.
function inlineText(block) {
  for (const m of block.matchAll(/<\/?([\w:-]+)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gu)) {
    if (!INLINE.has(m[1].toLowerCase())) return null;
    if (!m[0].startsWith("</")) {
      const a = attrs(m[0]);
      if (Object.hasOwn(a, "hidden") || Object.hasOwn(a, "style") || a["aria-hidden"]?.toLowerCase() === "true") return null;
    }
  }
  const value = plain(block.replace(/<\/?[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, ""));
  return /&[a-z][a-z0-9]+;/iu.test(value) ? null : value;
}
// Sichtbarkeit der Vorfahren an einer absoluten Position der bereinigten Seite.
function sichtbarAn(clean, position, inhalt = false) {
  const stack = [];
  let count = 0;
  for (const m of clean.slice(0, position).matchAll(/<(\/?)([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    fordere(++count <= 16384, "html-struktur-zu-gross");
    const name = m[2].toLowerCase();
    if (m[1]) { const i = stack.findLastIndex(t => t.name === name); if (i >= 0) stack.splice(i); }
    else if (!LEER.has(name) && !/\/\s*>$/.test(m[0])) stack.push({ name, tag: m[0] });
  }
  return !stack.some(t => {
    const a = attrs(t.tag);
    return GESPERRT.has(t.name) || (inhalt && t.name === "header") || Object.hasOwn(a, "hidden") || Object.hasOwn(a, "style")
      || a["aria-hidden"]?.toLowerCase() === "true";
  });
}
function spanEnde(html, start) {
  let tiefe = 1;
  for (const m of html.slice(start).matchAll(/<(\/?)span\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    tiefe += m[1] ? -1 : 1;
    if (tiefe === 0) return start + m.index;
  }
  return null;
}
function bereichEnde(html, start, name) {
  const muster = new RegExp("<(\\/?)" + name + "\\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*>", "gi");
  let tiefe = 1;
  for (const m of html.slice(start).matchAll(muster)) {
    tiefe += m[1] ? -1 : 1;
    if (tiefe === 0) return start + m.index + m[0].length;
  }
  return null;
}
// Genau ein Span mit der gesuchten Klasse, Inhalt bis zum passenden Ende.
function kopfSpan(html, cls) {
  const treffer = [...html.matchAll(/<span\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .filter(m => attrs(m[0]).class?.split(/\s+/).includes(cls));
  if (treffer.length !== 1) return null;
  const start = treffer[0].index + treffer[0][0].length;
  const ende = spanEnde(html, start);
  return ende === null || !sichtbarAn(html, start) ? null : inlineText(html.slice(start, ende));
}

function deutschlandfunkArtikel(doc, response, html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi, "");
  const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(clean)?.[1];
  fordere(head, "artikelmetadaten-fehlen");
  const metas = [...head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map(m => attrs(m[0]));
  const meta = name => {
    const found = metas.filter(a => (a.property || a.name)?.toLowerCase() === name);
    fordere(found.length === 1, "artikelmetadaten-mehrdeutig-oder-fehlend");
    return found[0].content;
  };
  const check = (url, title) => A.pruefeArtikelkontext([doc], { version: 1,
    herkunft: "manueller-originalvergleich", dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: url, artikelTitel: title, gelesenAm: response.gelesenAm, absatzPosition: 1, text: "Strukturpruefung" });
  fordere(meta("og:type") === "article", "artikelmetadaten-fehlen");
  const ogTitel = key(meta("og:title"));
  // Kanonische Adresse und og:url muessen beide eindeutig auf das Dokument zeigen.
  const kanonische = [...head.matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .map(m => attrs(m[0])).filter(a => a.rel?.toLowerCase().split(/\s+/).includes("canonical"));
  fordere(kanonische.length === 1 && typeof kanonische[0].href === "string", "artikelmetadaten-mehrdeutig-oder-fehlend");
  let canonicalUrl, ogUrl;
  try { canonicalUrl = new URL(kanonische[0].href, response.finalUrl).href; } catch { throw new Error("artikelkontext-artikelziel-abweichend"); }
  try { ogUrl = new URL(meta("og:url"), response.finalUrl).href; } catch { throw new Error("artikelkontext-artikelziel-abweichend"); }
  // Vollstaendige Ueberschrift: genau eine Artikel-H1 aus Kicker und Titel.
  const h1s = [...clean.matchAll(/<h1\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/h1\s*>/gi)];
  const haupt = h1s.filter(m => attrs(tagStart(m[0])).class?.split(/\s+/).includes("b-article-header-main"));
  fordere(haupt.length === 1, "artikelueberschrift-mehrdeutig-oder-fehlend");
  fordere(sichtbarAn(clean, haupt[0].index + tagStart(haupt[0][0]).length), "artikeltitel-abweichend");
  const kicker = kopfSpan(haupt[0][1], "headline-kicker");
  const titel = kopfSpan(haupt[0][1], "headline-title");
  fordere(kicker !== null && titel !== null && key(kicker) && key(titel), "artikelueberschrift-mehrdeutig-oder-fehlend");
  const ueberschrift = key(kicker) + " - " + key(titel);
  fordere(key(ueberschrift) === ogTitel, "artikeltitel-abweichend");
  check(canonicalUrl, ueberschrift);
  check(ogUrl, ueberschrift);
  // Sichtbarer Publikationszeitpunkt. Die Quellenzeit wird nur gelesen und
  // niemals umgeschrieben.
  const pubSpans = [...clean.matchAll(/<span\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .filter(m => attrs(m[0]).class?.split(/\s+/).includes("article-header-publication-date"));
  fordere(pubSpans.length === 1, "artikelmetadaten-mehrdeutig-oder-fehlend");
  const pubAttrs = attrs(pubSpans[0][0]);
  fordere(!Object.hasOwn(pubAttrs, "hidden") && !Object.hasOwn(pubAttrs, "style") && pubAttrs["aria-hidden"]?.toLowerCase() !== "true"
    && sichtbarAn(clean, pubSpans[0].index), "artikeldatum-abweichend");
  const pubStart = pubSpans[0].index + pubSpans[0][0].length;
  const pubEnde = spanEnde(clean, pubStart);
  fordere(pubEnde !== null, "artikelmetadaten-mehrdeutig-oder-fehlend");
  const datiert = [...clean.matchAll(/<time\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/time\s*>/gi)]
    .filter(m => { const a = attrs(tagStart(m[0])); return typeof a.datetime === "string" && a.datetime.length > 0; });
  fordere(datiert.length === 1 && datiert[0].index >= pubStart && datiert[0].index < pubEnde, "artikelmetadaten-mehrdeutig-oder-fehlend");
  const zeitAttrs = attrs(tagStart(datiert[0][0]));
  fordere(!Object.hasOwn(zeitAttrs, "hidden") && !Object.hasOwn(zeitAttrs, "style") && zeitAttrs["aria-hidden"]?.toLowerCase() !== "true"
    && sichtbarAn(clean, datiert[0].index), "artikeldatum-abweichend");
  const zeitpunkt = Date.parse(zeitAttrs.datetime), quellenZeitpunkt = Date.parse(doc.published_at || "");
  fordere(Number.isFinite(zeitpunkt) && Number.isFinite(quellenZeitpunkt) && zeitpunkt === quellenZeitpunkt, "artikeldatum-abweichend");
  const sichtbarerTag = inlineText(datiert[0][1]);
  fordere(sichtbarerTag === new Intl.DateTimeFormat("de-DE",
    { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(quellenZeitpunkt), "artikeldatum-abweichend");
  // Genau ein Hauptartikel mit genau einem Fliesstextbereich. Fremde Teaser oder
  // Podcastflaechen duerfen den gebundenen Absatz nicht verdraengen.
  const artikelStarts = [...clean.matchAll(/<article\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .filter(m => attrs(m[0]).class?.split(/\s+/).includes("b-article"));
  fordere(artikelStarts.length === 1, "artikelbereich-mehrdeutig-oder-fehlend");
  const artikelAttrs = attrs(artikelStarts[0][0]);
  fordere(!Object.hasOwn(artikelAttrs, "hidden") && !Object.hasOwn(artikelAttrs, "style") && artikelAttrs["aria-hidden"]?.toLowerCase() !== "true"
    && sichtbarAn(clean, artikelStarts[0].index), "artikelbereich-mehrdeutig-oder-fehlend");
  const artikelEnde = bereichEnde(clean, artikelStarts[0].index + artikelStarts[0][0].length, "article");
  fordere(artikelEnde !== null, "artikelbereich-mehrdeutig-oder-fehlend");
  const artikel = clean.slice(artikelStarts[0].index, artikelEnde);
  const koepfe = [...artikel.matchAll(/<header\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .filter(m => attrs(m[0]).class?.split(/\s+/).includes("b-article-header"));
  fordere(koepfe.length === 1, "artikelbereich-mehrdeutig-oder-fehlend");
  const kopfStart = koepfe[0].index + koepfe[0][0].length;
  const kopfEnde = bereichEnde(artikel, kopfStart, "header");
  const imKopf = (start, ende) => start >= artikelStarts[0].index + kopfStart
    && ende <= artikelStarts[0].index + kopfEnde;
  fordere(kopfEnde !== null && imKopf(haupt[0].index, haupt[0].index + haupt[0][0].length)
    && imKopf(pubSpans[0].index, pubEnde), "artikelbereich-mehrdeutig-oder-fehlend");
  const inhalte = [...artikel.matchAll(/<div\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .filter(m => attrs(m[0]).class?.split(/\s+/).includes("article-content"));
  const abschnitte = [...artikel.matchAll(/<section\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .filter(m => attrs(m[0]).class?.split(/\s+/).includes("b-article-details"));
  fordere(inhalte.length === 1 && abschnitte.length === 1, "artikelbereich-mehrdeutig-oder-fehlend");
  const abschnittAttrs = attrs(abschnitte[0][0]);
  fordere(!Object.hasOwn(abschnittAttrs, "hidden") && !Object.hasOwn(abschnittAttrs, "style") && abschnittAttrs["aria-hidden"]?.toLowerCase() !== "true"
    && sichtbarAn(clean, artikelStarts[0].index + abschnitte[0].index), "artikelbereich-mehrdeutig-oder-fehlend");
  const abschnittStart = abschnitte[0].index + abschnitte[0][0].length;
  const abschnittEnde = bereichEnde(artikel, abschnittStart, "section");
  fordere(abschnittEnde !== null, "artikelbereich-mehrdeutig-oder-fehlend");
  const inhaltStart = inhalte[0].index + inhalte[0][0].length;
  const inhaltEnde = bereichEnde(artikel, inhaltStart, "div");
  fordere(inhaltEnde !== null && inhalte[0].index >= kopfEnde
    && abschnitte[0].index >= inhaltStart && abschnittEnde <= inhaltEnde,
  "artikelbereich-mehrdeutig-oder-fehlend");
  const fliesstext = artikel.slice(abschnittStart, abschnittEnde);
  // Nur vollstaendige Absatzbloecke auf oberster Ebene. Kein Zusammenziehen und
  // kein spaeterer Rueckfall, wenn der erste Absatz nicht nutzbar ist.
  const absaetze = [];
  let tiefe = 0, offen = null, gesehen = 0;
  for (const m of fliesstext.matchAll(/<(\/?)div\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    fordere(++gesehen <= 8192, "html-struktur-zu-gross");
    if (m[1]) {
      tiefe -= 1;
      fordere(tiefe >= 0, "artikelbereich-mehrdeutig-oder-fehlend");
      if (offen && offen.ende === null && tiefe === 0) { offen.ende = m.index; absaetze.push(offen); offen = null; }
      continue;
    }
    const klassen = attrs(m[0]).class?.split(/\s+/);
    // Auch ein eingepackter erster Absatz darf nicht verschwinden und einen
    // spaeteren Absatz auf Position eins vorruecken lassen.
    fordere(!klassen?.includes("article-details-text") || tiefe === 0, "artikelbereich-mehrdeutig-oder-fehlend");
    if (tiefe === 0 && klassen?.includes("article-details-text")) {
      offen = { inhalt: m.index + m[0].length, ende: null, klasse: klassen };
    }
    tiefe += 1;
  }
  fordere(tiefe === 0 && offen === null, "artikelbereich-mehrdeutig-oder-fehlend");
  fordere(absaetze.length > 0, "keine-artikelabsaetze");
  fordere(absaetze.length <= MAX_ABSAETZE, "zu-viele-absaetze");
  const werte = absaetze.map(a => inlineText(fliesstext.slice(a.inhalt, a.ende)));
  const artikelText = werte.filter(Boolean).join(" ");
  fordere(artikelText.length <= 128 * 1024, "artikeltext-ungueltig");
  const erster = absaetze[0];
  fordere(sichtbarAn(clean, artikelStarts[0].index + abschnittStart + erster.inhalt, true), "artikelbereich-mehrdeutig-oder-fehlend");
  const wert = werte[0];
  // Der Deutschlandfunk markiert seinen Sendedatum-Hinweis als kursiven
  // Detailblock. Das ist kein Inhaltsabsatz; steht er an erster Stelle, gibt es
  // keinen Beleg statt einer spaeteren Ersatzwahl.
  fordere(!erster.klasse.includes("u-text-italic"), "leitabsatz-nicht-nutzbar");
  fordere(wert !== null && wert.length >= 60, "leitabsatz-nicht-nutzbar");
  fordere(wert.length <= A.MAX_ZEICHEN, "absatz-zu-lang");
  const zusammenfassung = String(doc.summary || "").replace(/\s+/gu, " ").trim();
  fordere(!zusammenfassung || !zusammenfassung.includes(wert), "leitabsatz-nicht-nutzbar");
  return A.pruefeArtikelkontext([doc], { version: 2, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: response.finalUrl, artikelTitel: ueberschrift, herkunft: "strukturierter-originalartikel",
    gelesenAm: response.gelesenAm, absatzPosition: 1, text: wert,
    gewinnung: { verfahren: "deutschlandfunk-artikel-leitabsatz-v1", positionsbasis: "html-article-div",
      antwortHash: hash(html), artikelTextHash: hash(artikelText), artikelTextPosition: 0,
      titelTreffer: 0, kandidatZahl: 1, artikelAbsatzZahl: absaetze.length } });
}

module.exports = { deutschlandfunkArtikel };
