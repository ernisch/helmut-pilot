"use strict";

// Begrenzte, reine Gewinnung aus einer explizit gelieferten Originalantwort.
// Kein Abruf, Speicherzugriff oder Faktenurteil. HTML und JSON-LD muessen
// dieselbe Artikelidentitaet UND denselben vollstaendigen Absatz tragen.
const crypto = require("node:crypto");
const A = require("./artikelkontext");
const D = require("./artikelkontext-deutschlandfunk");
const { plain } = require("./quellen-auszug");
const MAX_ANTWORT_BYTES = 1024 * 1024;
const MAX_ABSAETZE = 256;
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const space = s => s.replace(/\s+/gu, " ").trim();
const stop = new Set(("der die das den dem des ein eine einer eines einem einen und oder im in am an auf aus als mit "
  + "von vom zu zum zur fuer für nach vor sich ihren ihr ihre sein seine ist sind wird werden wie was wer "
  + "nicht mehr auch bei über unter durch aber um für haben hat werden wurde wurden soll sollen").split(" "));
const words = s => new Set((s.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(w => !stop.has(w)));
function fordere(ok, reason) { if (!ok) throw new Error("artikelkontext-" + reason); }
const TAG = /<[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
function attrs(tag) {
  const result = {};
  for (const m of tag.matchAll(/\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu)) {
    const key = m[1].toLowerCase();
    fordere(!Object.hasOwn(result, key), "html-attribute-mehrdeutig");
    result[key] = plain(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return result;
}
function text(block) {
  // Keine Blockelemente, Zeilenumbrueche, versteckten Teiltexte oder Skripte
  // zusammenziehen. Unbekannte Entity-Namen bleiben eine sichtbare Luecke.
  const inline = new Set(["a", "strong", "em", "b", "i", "span", "sup", "sub", "small", "abbr", "q", "cite"]);
  for (const m of block.matchAll(/<\/?([\w:-]+)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gu)) {
    if (!inline.has(m[1].toLowerCase())) return null;
    if (!m[0].startsWith("</")) {
      const a = attrs(m[0]);
      if (Object.hasOwn(a, "hidden") || Object.hasOwn(a, "style") || a["aria-hidden"] === "true") return null;
    }
  }
  const value = plain(block);
  return /&[a-z][a-z0-9]+;/iu.test(value) ? null : value;
}
function articleNodes(html) {
  const nodes = [];
  let scripts = 0, visited = 0;
  function visit(value, depth = 0) {
    fordere(++visited <= 512 && depth <= 8, "strukturierte-daten-zu-gross");
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(v => visit(v, depth + 1)); return; }
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.includes("NewsArticle") || types.includes("Article")) nodes.push(value);
    if (Object.hasOwn(value, "@graph")) visit(value["@graph"], depth + 1);
  }
  for (const m of html.matchAll(/(<script\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)<\/script\s*>/gi)) {
    if (attrs(m[1]).type?.toLowerCase() !== "application/ld+json") continue;
    fordere(++scripts <= 32, "strukturierte-daten-zu-gross");
    let value;
    try { value = JSON.parse(m[2]); } catch { throw new Error("artikelkontext-strukturierte-daten-ungueltig"); }
    visit(value);
  }
  fordere(nodes.length === 1, "strukturierter-artikel-mehrdeutig-oder-fehlend");
  return nodes[0];
}
function articleParagraphs(html) {
  const stack = [], paragraphs = [];
  const excluded = new Set(["nav", "aside", "header", "footer", "figure", "figcaption", "noscript", "iframe", "svg", "form"]);
  const voids = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  let active = null, count = 0;
  for (const m of html.matchAll(/<(\/?)([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    fordere(++count <= 8192, "html-struktur-zu-gross");
    const name = m[2].toLowerCase();
    if (m[1]) {
      if (name === "p" && active) { active.block = html.slice(active.start, m.index); active = null; }
      const index = stack.findLastIndex(t => t.name === name);
      if (index >= 0) stack.splice(index);
      continue;
    }
    const a = attrs(m[0]);
    const blocked = excluded.has(name) || Object.hasOwn(a, "hidden") || Object.hasOwn(a, "style")
      || a["aria-hidden"]?.toLowerCase() === "true";
    if (blocked && active) active.blocked = true;
    if (name === "p") {
      if (active) active.blocked = true;
      active = { start: m.index + m[0].length, blocked: blocked || stack.some(t => t.blocked || t.name === "p") };
      paragraphs.push(active);
      fordere(paragraphs.length <= MAX_ABSAETZE, "zu-viele-absaetze");
    }
    if (!voids.has(name) && !/\/\s*>$/.test(m[0])) stack.push({ name, blocked });
  }
  return paragraphs;
}

// Bundestag liefert kein Article-JSON-LD. Die amtliche HTML-Struktur bindet
// stattdessen og:url, og:title und genau eine gleichnamige Artikelueberschrift.
// Ein Archivdokument kann mehrere Beratungen enthalten: niemals deren Absaetze
// vereinigen oder lediglich den ersten/aktiven Tab annehmen.
function bundestagArtikel(doc, response, html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi, "");
  const key = s => plain(s).normalize("NFKC").replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
  const sichtbarAn = position => {
    const stack = [], voids = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    let count = 0;
    for (const m of clean.slice(0, position).matchAll(/<(\/?)([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
      fordere(++count <= 16384, "html-struktur-zu-gross");
      const name = m[2].toLowerCase();
      if (m[1]) { const i = stack.findLastIndex(t => t.name === name); if (i >= 0) stack.splice(i); }
      else if (!voids.has(name) && !/\/\s*>$/.test(m[0])) {
        stack.push({ name, tag: m[0] });
      }
    }
    return !stack.some(t => {
      const a = attrs(t.tag);
      return ["nav", "aside", "footer", "figure", "noscript"].includes(t.name)
        || Object.hasOwn(a, "hidden") || Object.hasOwn(a, "style") || a["aria-hidden"] === "true";
    });
  };
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
  const ogTitle = key(meta("og:title")), expectedTitle = "Deutscher Bundestag - " + key(doc.title);
  fordere(ogTitle === expectedTitle || (ogTitle.endsWith("...") && ogTitle.length >= 70
    && expectedTitle.startsWith(ogTitle.slice(0, -3))), "artikeltitel-abweichend");
  check(meta("og:url"), doc.title);
  // Ein vorhandenes kanonisches Gegenziel darf nicht durch og:url verdeckt werden.
  const canonicals = [...head.matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .map(m => attrs(m[0])).filter(a => a.rel?.toLowerCase().split(/\s+/).includes("canonical"));
  fordere(canonicals.length <= 1, "artikelmetadaten-mehrdeutig-oder-fehlend");
  if (canonicals.length) check(new URL(canonicals[0].href, response.finalUrl).href, doc.title);
  const published = Date.parse(doc.published_at || "");
  fordere(Number.isFinite(published) && meta("date") === new Intl.DateTimeFormat("de-DE",
    { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(published), "artikeldatum-abweichend");
  const articles = [], articleStack = [];
  for (const m of clean.matchAll(/<\/?article\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    if (!m[0].startsWith("</")) articleStack.push(m);
    else {
      const start = articleStack.pop();
      fordere(start, "artikelbereich-mehrdeutig-oder-fehlend");
      if (attrs(start[0]).class?.split(/\s+/).includes("bt-artikel")) {
        articles.push([clean.slice(start.index, m.index + m[0].length), start[0], clean.slice(start.index + start[0].length, m.index), start.index]);
      }
    }
  }
  fordere(articleStack.length === 0 && articles.length > 0 && articles.length <= 32, "artikelbereich-mehrdeutig-oder-fehlend");
  const matches = articles.filter(m => {
    const headings = [...m[2].matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)];
    return headings.length === 1 && key(headings[0][1]) === key(doc.title);
  });
  fordere(matches.length === 1, "artikelbereich-mehrdeutig-oder-fehlend");
  fordere(sichtbarAn(matches[0][3]), "artikelbereich-mehrdeutig-oder-fehlend");
  const article = matches[0][0], articleAttrs = attrs(matches[0][1]);
  fordere(articleAttrs.class?.split(/\s+/).includes("bt-artikel")
    && !Object.hasOwn(articleAttrs, "hidden") && !Object.hasOwn(articleAttrs, "style")
    && articleAttrs["aria-hidden"] !== "true", "artikelbereich-mehrdeutig-oder-fehlend");
  // Nur der Fliesstext; Redner-/Dokumentlisten, Bilder und Randspalten sind
  // keine Prosa des Berichts. Balance der Divs haelt spaetere Tabs draussen.
  const starts = [...article.matchAll(/<div\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .filter(m => attrs(m[0]).class?.split(/\s+/).includes("bt-artikel__article"));
  fordere(starts.length === 1, "artikelbereich-mehrdeutig-oder-fehlend");
  const start = starts[0].index;
  fordere(sichtbarAn(matches[0][3] + start), "artikelbereich-mehrdeutig-oder-fehlend");
  let depth = 0, end = null;
  for (const m of article.slice(start).matchAll(/<\/?div\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) { end = start + m.index + m[0].length; break; }
  }
  fordere(end !== null, "artikelbereich-mehrdeutig-oder-fehlend");
  // Screenreader-Linkhinweise sind keine Aussage und werden nur in exakt der
  // amtlichen Markierung entfernt; sonstige versteckte Absatze bleiben gesperrt.
  const body = article.slice(start, end).replace(/<span class="a-link__label --hidden">\(Dokument, öffnet ein neues Fenster\)<\/span>/g, "");
  const paragraphs = articleParagraphs(body);
  const values = paragraphs.map(p => !p.blocked && p.block !== undefined && text(p.block)
    ? plain(p.block.replace(/<[^>]*>/g, "")) : null);
  const articleText = values.filter(Boolean).join(" ");
  fordere(articleText.length <= 128 * 1024, "artikeltext-ungueltig");
  // Die amtliche Artikelidentitaet ist durch die vollstaendige H1 gebunden.
  // Ihr erster Absatz ist die Meldung, unabhaengig von Flexionen im Titel.
  // Kein spaeterer, lexikalisch staerkerer Absatz und kein Weglassen einer
  // kurzen Korrektur-/Absagezeile, nur um einen passenden Treffer zu erhalten.
  const value = values[0];
  fordere(value && value.length >= 60 && !space(String(doc.summary || "")).includes(value), "leitabsatz-nicht-nutzbar");
  fordere(value.length <= A.MAX_ZEICHEN_BUNDESTAG_LEITABSATZ, "absatz-zu-lang");
  fordere(articleText.indexOf(value, value.length) === -1, "kein-eindeutiger-titelbezug");
  const titleWords = words(doc.title), tokens = words(value);
  return A.pruefeArtikelkontext([doc], { version: 2, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: response.finalUrl, artikelTitel: doc.title, herkunft: "strukturierter-originalartikel",
    gelesenAm: response.gelesenAm, absatzPosition: 1, text: value,
    gewinnung: { verfahren: "bundestag-artikel-leitabsatz-v1", positionsbasis: "html-article-p",
      antwortHash: hash(html), artikelTextHash: hash(articleText), artikelTextPosition: 0,
      titelTreffer: [...titleWords].filter(w => tokens.has(w)).length, kandidatZahl: 1, artikelAbsatzZahl: paragraphs.length } });
}
function gewinne(doc, response) {
  const html = response?.body;
  fordere(typeof html === "string" && html.length > 0 && Buffer.byteLength(html, "utf8") <= MAX_ANTWORT_BYTES, "antwort-ungueltig");
  // Erst den bestehenden Quellenvertrag pruefen; ohne passende Quelle wird
  // auch keine HTML Antwort als vermeintlicher Zusatz ausgewertet.
  A.pruefeArtikelkontext([doc], { version: 1, dokumentId: doc?.id,
    quellenHash: A.quellenstandHash(doc), artikelUrl: response.finalUrl,
    artikelTitel: doc?.title, herkunft: "manueller-originalvergleich",
    gelesenAm: response.gelesenAm, absatzPosition: 1, text: "Strukturpruefung" });
  if (/^https:\/\/(?:www\.)?bundestag\.de\/dokumente\/textarchiv\/\d{4}\/[a-z0-9-]+-\d+$/.test(response.finalUrl)) {
    return bundestagArtikel(doc, response, html);
  }
  // Deutschlandfunk liefert ebenfalls kein Article-JSON-LD; nur die explizite
  // Host-/Pfadbindung auf den Herausgeber erreicht den Sonderpfad.
  if (/^https:\/\/(?:www\.)?deutschlandfunk\.de\/[a-z0-9-]+-\d+\.html$/.test(response.finalUrl)) {
    return D.deutschlandfunkArtikel(doc, response, html);
  }
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, "");
  const data = articleNodes(uncommented);
  const cleaned = uncommented.replace(/<(script|style|template)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi, "");
  const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(cleaned)?.[1];
  fordere(head, "artikelmetadaten-fehlen");
  const tags = [...head.matchAll(TAG)].map(m => ({ name: /^<([\w:-]+)/.exec(m[0])[1].toLowerCase(), a: attrs(m[0]) }));
  const canonicals = tags.filter(t => t.name === "link" && t.a.rel?.toLowerCase().split(/\s+/).includes("canonical"));
  const titles = tags.filter(t => t.name === "meta" && t.a.property?.toLowerCase() === "og:title");
  fordere(canonicals.length === 1 && titles.length === 1, "artikelmetadaten-mehrdeutig-oder-fehlend");
  let canonical;
  try { canonical = new URL(canonicals[0].a.href, response.finalUrl).href; } catch { throw new Error("artikelkontext-artikelziel-abweichend"); }
  const page = typeof data.mainEntityOfPage === "string" ? data.mainEntityOfPage : data.mainEntityOfPage?.["@id"];
  for (const [url, title] of [[canonical, titles[0].a.content], [page, data.headline]]) {
    A.pruefeArtikelkontext([doc], { version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
      artikelUrl: url, artikelTitel: title, herkunft: "manueller-originalvergleich",
      gelesenAm: response.gelesenAm, absatzPosition: 1, text: "Strukturpruefung" });
  }
  fordere(typeof data.articleBody === "string" && data.articleBody.length >= 60
    && data.articleBody.length <= 128 * 1024 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(data.articleBody), "artikeltext-ungueltig");
  const articleText = space(data.articleBody);
  fordere((cleaned.match(/<article\b/gi) || []).length === 1
    && (cleaned.match(/<\/article\s*>/gi) || []).length === 1, "artikelbereich-mehrdeutig-oder-fehlend");
  const article = /<article\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/article\s*>/i.exec(cleaned)?.[0];
  fordere(article, "artikelbereich-mehrdeutig-oder-fehlend");
  const paragraphs = articleParagraphs(article);
  fordere(paragraphs.length > 0, "keine-artikelabsaetze");
  fordere(paragraphs.length <= MAX_ABSAETZE, "zu-viele-absaetze");
  const titleWords = words(doc.title), summary = space(String(doc.summary || ""));
  const candidates = [];
  for (const [i, p] of paragraphs.entries()) {
    if (p.blocked || p.block === undefined) continue;
    const value = text(p.block);
    if (!value || value.length < 60 || summary.includes(value)) continue;
    const position = articleText.indexOf(value);
    if (position < 0 || articleText.indexOf(value, position + 1) !== -1) continue;
    const tokens = words(value), score = [...titleWords].filter(w => tokens.has(w)).length;
    if (score >= 2) candidates.push({ value, position, score, index: i + 1 });
  }
  fordere(candidates.length > 0, "kein-eindeutiger-titelbezug");
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  fordere(candidates.length === 1 || best.score > candidates[1].score, "absatzauswahl-mehrdeutig");
  // Erst die staerkste Stelle waehlen, dann begrenzen. Kein Rueckfall auf
  // einen schlechteren Treffer, nur weil der beste Absatz zu lang ist.
  fordere(best.value.length <= A.MAX_ZEICHEN, "absatz-zu-lang");
  return A.pruefeArtikelkontext([doc], {
    version: 2, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: response.finalUrl, artikelTitel: data.headline,
    herkunft: "strukturierter-originalartikel", gelesenAm: response.gelesenAm,
    absatzPosition: best.index, text: best.value,
    gewinnung: { verfahren: "artikel-absatz-titel-v1", positionsbasis: "html-article-p",
      antwortHash: hash(html), artikelTextHash: hash(articleText), artikelTextPosition: best.position,
      titelTreffer: best.score, kandidatZahl: candidates.length, artikelAbsatzZahl: paragraphs.length }
  });
}
function gewinneArtikelkontext(document, response) {
  try { return { ok: true, beleg: gewinne(document, response) }; }
  catch (error) {
    if (!error.message?.startsWith("artikelkontext-")) throw error;
    return { ok: false, reason: error.message.slice("artikelkontext-".length) };
  }
}
module.exports = { MAX_ANTWORT_BYTES, gewinneArtikelkontext };
