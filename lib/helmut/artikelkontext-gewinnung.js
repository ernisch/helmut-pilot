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
function articleNodes(html, optional = false) {
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
  fordere(nodes.length === 1 || (optional && nodes.length === 0), "strukturierter-artikel-mehrdeutig-oder-fehlend");
  return nodes[0] || null;
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
function bundestagArtikel(doc, response, html, vollstaendig = false) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi, "");
  const key = s => plain(s).normalize("NFKC").replace(/\u00ad/g, "")
    .replace(vollstaendig ? /[„“”«»"'‘’‚]/gu : /$^/g, "").replace(/\s+/g, " ").trim();
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
  fordere(!vollstaendig || !metas.some(a => /^(?:robots|helmutbot)$/i.test(a.name || "")
    && /(?:^|[\s,])(?:nosnippet|noai|noindex|max-snippet\s*:\s*0)(?:$|[\s,])/i.test(a.content || "")), "original-metadaten-gesperrt");
  // Dieser amtliche HTML-Pfad gilt fuer Seiten ohne Article-JSON-LD. Eine
  // zusaetzliche abweichende Artikeldeklaration darf er nicht verdecken.
  fordere(!vollstaendig || articleNodes(html, true) === null, "strukturierter-artikel-widerspruch");
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
  fordere(ogTitle === expectedTitle || (vollstaendig && [key(doc.title), key(doc.title) + " - Deutscher Bundestag"].includes(ogTitle))
    || (ogTitle.endsWith("...") && ogTitle.length >= 70
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
  if (vollstaendig) return bundestagVolltext(doc, response, html, body, meta("date"), meta("og:url"), vollstaendig);
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
function bundestagVolltext(doc, response, html, body, originalDatum, artikelUrl, modus) {
  // Leere CMS-Layoutabsaetze enthalten keinen Text. Alle anderen Absaetze,
  // auch kurze Absagen sowie Zeit/Ort vor dem Meldungstext, bleiben erhalten.
  const ps = articleParagraphs(body).filter(p => p.block === undefined || !/^\s*$/.test(p.block));
  const sichtbar = block => text(block.replace(/<br\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, tag => {
    const a = attrs(tag);
    fordere(!Object.hasOwn(a, "hidden") && !Object.hasOwn(a, "style") && a["aria-hidden"]?.toLowerCase() !== "true", "keine-artikelabsaetze");
    return " ";
  }));
  const values = ps.map(p => !p.blocked && p.block !== undefined ? sichtbar(p.block) : null);
  fordere(values.length && values.every(Boolean), "keine-artikelabsaetze");
  fordere(zwischenText(body.slice(0, ps[0].start)) === ""
    && zwischenText(body.slice(ps.at(-1).start + ps.at(-1).block.length)) === "", "artikelanfang-oder-ende-ungueltig");
  const zwischen = ps.slice(1).map((p, i) => zwischenText(body.slice(ps[i].start + ps[i].block.length, p.start)));
  fordere(zwischen.every(t => t !== null), "zwischenkontext-ungueltig");
  const ganz = A.einstiegText(values, zwischen);
  fordere(ganz.length <= 128 * 1024 && !require("./quellen-auszug").stoertext(ganz), "artikeltext-ungueltig");
  fordere(modus !== true || (ganz.length <= A.MAX_ZEICHEN_ARTIKEL
    && Buffer.byteLength(ganz) <= A.MAX_BYTES_ARTIKEL), "artikeltext-zu-lang");
  return A.pruefeArtikelkontext([doc], { version: 2, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: response.finalUrl, artikelTitel: doc.title, herkunft: "strukturierter-originalartikel",
    gelesenAm: response.gelesenAm, absatzPosition: 1, text: ganz,
    gewinnung: { verfahren: modus === "abschnitte" ? "artikelabschnitte-v4" : "artikeltext-v3",
      positionsbasis: "html-article-p", antwortHash: hash(html), artikelTextHash: hash(ganz), artikelTextPosition: 0,
      titelTreffer: words(doc.title).size, kandidatZahl: 1, artikelAbsatzZahl: values.length,
      absaetze: values, zwischenTexte: zwischen, struktur: "bundestag", originalDatum, datumsFeld: "date",
      kanonischDeklariert: artikelUrl,
      ...(modus === "abschnitte" ? { abschnitte: require("./artikel-abschnitte").segmentiere(ganz) } : {}) } });
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
// Geschlossene strukturelle Bereiche, derselbe begrenzte Token-/Attributleser.
function bloecke(html, tag, passend = () => true) {
  const stack = [], out = [];
  for (const m of html.matchAll(new RegExp(`<\\/?${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi"))) {
    fordere(stack.length < 64 && out.length < 256, "html-struktur-zu-gross");
    if (!m[0].startsWith("</")) stack.push({ start: m.index, body: m.index + m[0].length, a: attrs(m[0]) });
    else {
      const open = stack.pop(); fordere(open, "artikelbereich-mehrdeutig-oder-fehlend");
      if (passend(open.a)) out.push({ ...open, html: html.slice(open.start, m.index + m[0].length), inhalt: html.slice(open.body, m.index) });
    }
  }
  fordere(stack.length === 0, "artikelbereich-mehrdeutig-oder-fehlend");
  return out;
}
function zwischenText(html) {
  // Ganze sichtbare Zwischenueberschriften und sonstiger Text zwischen den
  // Absaetzen bleiben erhalten. Verstecktes/unerwartetes Markup nie glattschleifen.
  const inline = html.replace(/<\/?(?:p|div|h[2-6])\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, tag => {
    if (!tag.startsWith("</")) {
      const a = attrs(tag);
      fordere(!Object.hasOwn(a, "hidden") && !Object.hasOwn(a, "style")
        && a["aria-hidden"]?.toLowerCase() !== "true", "zwischenkontext-ungueltig");
    }
    return " ";
  });
  return text(inline);
}
function datumsAbsatz(block, publikation) {
  if (typeof block !== "string") return false;
  const times = [...block.matchAll(/<time\b([^>]*)>([\s\S]*?)<\/time\s*>/gi)];
  if (times.length !== 1) return false;
  const Q = require("./quellen-zeitvertrag"), a = attrs(`<time ${times[0][1]}>`);
  const datum = Q.publikationsdatum(a.datetime), publiziert = Q.publikationsdatum(publikation);
  if (!datum || !publiziert || (datum.original.includes("T") ? datum.iso !== publiziert.iso
    : datum.original !== publiziert.original.slice(0, 10))) return false;
  if (Object.hasOwn(a, "hidden") || Object.hasOwn(a, "style") || a["aria-hidden"]?.toLowerCase() === "true") return false;
  const tag = datum.original.slice(0, 10);
  const angezeigt = plain(times[0][2]);
  const deutsch = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(tag + "T00:00:00Z"));
  return [tag, deutsch, deutsch.replace(/^0/, "")].includes(angezeigt)
    && /^(?:Datum|Date|Veröffentlicht(?: am)?|Published(?: on)?)?$/iu.test(plain(block.replace(times[0][0], "")));
}
function einstieg(doc, response, vollstaendig = false) {
  const html = response?.body;
  fordere(typeof html === "string" && Buffer.byteLength(html) <= MAX_ANTWORT_BYTES, "antwort-ungueltig");
  A.pruefeArtikelkontext([doc], { version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: response.finalUrl, artikelTitel: doc.title, herkunft: "manueller-originalvergleich",
    gelesenAm: response.gelesenAm, absatzPosition: 1, text: "Strukturpruefung" });
  if (vollstaendig && A.bundestagArtikelUrl(response.finalUrl)) return bundestagArtikel(doc, response, html, vollstaendig);
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, "");
  const clean = uncommented.replace(/<(script|style|template)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi, "");
  const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(clean)?.[1];
  fordere(head, "artikelmetadaten-fehlen");
  const tags = [...head.matchAll(TAG)].map(m => ({ tag: /^<([\w:-]+)/.exec(m[0])[1].toLowerCase(), a: attrs(m[0]) }));
  fordere(!tags.some(t => t.tag === "meta" && /^(?:robots|helmutbot)$/i.test(t.a.name || "")
    && /(?:^|[\s,])(?:nosnippet|noai|noindex|max-snippet\s*:\s*0)(?:$|[\s,])/i.test(t.a.content || "")), "original-metadaten-gesperrt");
  const canonicals = tags.filter(t => t.tag === "link" && t.a.rel?.toLowerCase().split(/\s+/).includes("canonical"));
  fordere(canonicals.length === 1, "artikelmetadaten-mehrdeutig-oder-fehlend");
  const deklaration = canonicals[0].a.href;
  const canonicalUrl = new URL(deklaration, response.finalUrl);
  fordere(!canonicalUrl.username && !canonicalUrl.password && !canonicalUrl.hash
    && !/^[a-z]+:\/\/[^/?#]*:/i.test(deklaration), "artikelziel-abweichend");
  const canonical = canonicalUrl.href;
  const titelKey = s => plain(s).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const meta = key => tags.filter(t => t.tag === "meta" && (t.a.property || t.a.name)?.toLowerCase() === key);
  // Ein als Ganzes gelieferter Herausgebername kann selbst Trenner enthalten.
  // Nur den exakt bestaetigten gesamten Suffix entfernen, keine Wortnaehe.
  const geliefert = String(doc.source_name || "");
  // Ein kurzer Quellenname kann im Google-Titel gemeinsam mit dem nativen
  // Seitennamen stehen (DGB - Deutscher Gewerkschaftsbund). Beide Namen muessen
  // exakt geliefert sein; der Kurzname muss zudem dem Herausgeberhost entsprechen.
  const siteNames = meta("og:site_name"), host = new URL(response.finalUrl).hostname.replace(/^www\./, "").split(".");
  const namensPaar = siteNames.length === 1 && siteNames[0].a.content
    && /^[a-z][a-z0-9-]{1,62}$/i.test(geliefert) && host.length === 2 && host[0] === geliefert.toLowerCase()
    ? [geliefert + " - " + siteNames[0].a.content, siteNames[0].a.content + " | " + geliefert] : [];
  const suffix = [geliefert, ...namensPaar].find(s => s && doc.title.endsWith(" - " + s));
  const ohneSuffix = suffix ? doc.title.slice(0, -(suffix.length + 3)) : null;
  const titel = ohneSuffix || require("./herausgeber").titelRumpf(doc);
  const istTitel = s => titelKey(s) === titelKey(titel);
  const ogTitles = meta("og:title"), ogUrls = meta("og:url");
  fordere(ogTitles.length <= 1 && (!ogTitles.length || istTitel(ogTitles[0].a.content)), "artikeltitel-abweichend");
  fordere(ogUrls.length <= 1, "artikelmetadaten-mehrdeutig-oder-fehlend");
  if (ogUrls.length) A.pruefeArtikelkontext([doc], { version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: ogUrls[0].a.content, artikelTitel: doc.title, herkunft: "manueller-originalvergleich",
    gelesenAm: response.gelesenAm, absatzPosition: 1, text: "Strukturpruefung" });
  const allPs = articleParagraphs(clean);
  const absatzTexte = block => articleParagraphs(block.html).map(p => {
    const original = allPs.find(q => q.start === block.start + p.start);
    return original && !original.blocked && !p.blocked && p.block !== undefined ? text(p.block) : null;
  });
  const checkUrl = url => A.pruefeArtikelkontext([doc], { version: 1, dokumentId: doc.id,
    quellenHash: A.quellenstandHash(doc), artikelUrl: url, artikelTitel: doc.title,
    herkunft: "manueller-originalvergleich", gelesenAm: response.gelesenAm, absatzPosition: 1, text: "Strukturpruefung" });
  const checkIdentitaet = data => {
    const urls = [];
    if (Object.hasOwn(data, "url")) urls.push(data.url);
    if (Object.hasOwn(data, "mainEntityOfPage")) urls.push(typeof data.mainEntityOfPage === "string"
      ? data.mainEntityOfPage : data.mainEntityOfPage?.["@id"]);
    fordere(urls.length > 0, "artikelziel-abweichend");
    urls.forEach(checkUrl);
  };
  let values, struktur, originalDatum, datumsFeld, articleText, sourceBlock, ps;
  const micro = bloecke(clean, "div", a => a.itemprop?.split(/\s+/).includes("articleBody"));
  if (micro.length) {
    fordere(micro.length === 1, "artikelbereich-mehrdeutig-oder-fehlend");
    const articles = bloecke(clean, "article");
    fordere(articles.length === 1 && articles[0].inhalt.includes(micro[0].html), "artikelbereich-mehrdeutig-oder-fehlend");
    const headings = [...articles[0].html.matchAll(/<(h[12])\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)];
    fordere(headings.length === 1 && attrs(`<${headings[0][1]} ${headings[0][2]}>`).itemprop === "name"
      && istTitel(headings[0][3]), "artikeltitel-abweichend");
    const times = [...articles[0].html.matchAll(/<time\b[^>]*>/gi)].map(m => attrs(m[0]));
    fordere(times.length === 1 && ["dateCreated", "datePublished"].includes(times[0].itemprop), "artikeldatum-abweichend");
    originalDatum = times[0].datetime; datumsFeld = times[0].itemprop; struktur = "microdata";
    sourceBlock = micro[0]; ps = articleParagraphs(sourceBlock.html); values = absatzTexte(sourceBlock);
    fordere(ps.length && !plain(sourceBlock.html.slice(0, ps[0].start))
      && !plain(sourceBlock.html.slice(ps.at(-1).start + (ps.at(-1).block?.length || 0))), "artikelanfang-oder-ende-ungueltig");
    const declared = articleNodes(uncommented, true);
    if (declared) {
      fordere(istTitel(declared.headline), "artikeltitel-abweichend");
      checkIdentitaet(declared);
      const Q = require("./quellen-zeitvertrag");
      for (const field of ["datePublished", ...(datumsFeld === "dateCreated" ? ["dateCreated"] : [])]) {
        fordere(!Object.hasOwn(declared, field) || (Q.publikationsdatum(declared[field])
          && Date.parse(declared[field]) === Date.parse(doc.published_at)), "artikeldatum-abweichend");
      }
      if (Object.hasOwn(declared, "articleBody")) articleText = typeof declared.articleBody === "string" ? space(declared.articleBody) : null;
      fordere(!Object.hasOwn(declared, "articleBody") || articleText, "artikeltext-abweichend");
    }
  } else {
    const data = articleNodes(uncommented);
    fordere(istTitel(data.headline), "artikeltitel-abweichend");
    fordere(meta("og:title").length === 1 && istTitel(meta("og:title")[0].a.content), "artikeltitel-abweichend");
    checkIdentitaet(data);
    checkUrl(canonical);
    const ogUrls = meta("og:url"); fordere(ogUrls.length <= 1, "artikelmetadaten-mehrdeutig-oder-fehlend");
    if (ogUrls.length) checkUrl(ogUrls[0].a.content);
    const blocks = [...bloecke(clean, "article"), ...bloecke(clean, "div", a => a.class?.split(/\s+/).includes("article"))];
    fordere(blocks.length === 1 && typeof data.articleBody === "string" && data.articleBody.length <= 128 * 1024, "artikelbereich-mehrdeutig-oder-fehlend");
    articleText = space(data.articleBody); originalDatum = data.datePublished; datumsFeld = "datePublished"; struktur = "jsonld";
    sourceBlock = blocks[0]; ps = articleParagraphs(sourceBlock.html);
    const texte = absatzTexte(sourceBlock);
    const start = texte.findIndex(p => p && articleText.startsWith(p));
    fordere(start >= 0, "artikeltext-abweichend");
    fordere(ps.slice(0, start).every(p => !p.blocked && datumsAbsatz(p.block, originalDatum)), "artikelvorspann-ungebunden");
    let vorspann = sourceBlock.html.slice(0, ps[start].start);
    for (const p of ps.slice(0, start).reverse()) vorspann = vorspann.slice(0, p.start) + vorspann.slice(p.start + p.block.length);
    vorspann = vorspann.replace(/<(h[12])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,
      (whole, tag, content) => istTitel(content) ? " " : whole);
    fordere(!plain(vorspann), "artikelvorspann-ungebunden");
    values = texte.slice(start); ps = ps.slice(start);
  }
  fordere(values.length > 0 && values.every(Boolean), "keine-artikelabsaetze");
  const zwischen = ps.slice(1).map((p, i) => zwischenText(sourceBlock.html.slice(ps[i].start + ps[i].block.length, p.start)));
  fordere(zwischen.every(t => t !== null), "zwischenkontext-ungueltig");
  const ganz = A.einstiegText(values, zwischen);
  // Nicht ueber abweichende Saetze hinweg suchen. Beide Darstellungen muessen
  // dasselbe lueckenlose Praefix tragen, einschliesslich Zwischenkontext.
  fordere(!articleText || articleText === ganz, "artikeltext-abweichend");
  articleText = articleText || ganz;
  fordere(vollstaendig !== true || (ganz.length <= A.MAX_ZEICHEN_ARTIKEL
    && Buffer.byteLength(ganz, "utf8") <= A.MAX_BYTES_ARTIKEL), "artikeltext-zu-lang");
  const selected = [], selectedZwischen = [];
  for (let i = 0; i < Math.min(values.length, vollstaendig ? 256 : 4); i++) {
    // Keinen zu langen oder widerspruechlichen Anfang ueberspringen.
    const probeZwischen = i ? [...selectedZwischen, zwischen[i - 1]] : [];
    if (!vollstaendig && A.einstiegText([...selected, values[i]], probeZwischen).length > A.MAX_ZEICHEN_EINSTIEG) break;
    selected.push(values[i]); if (i) selectedZwischen.push(zwischen[i - 1]);
  }
  fordere(selected.length > 0, "einstieg-zu-lang");
  fordere(titelKey(selected[0]) !== titelKey(titel), "kein-artikeltext");
  const auszug = A.einstiegText(selected, selectedZwischen);
  fordere(!require("./quellen-auszug").stoertext(auszug), "kein-artikeltext");
  return A.pruefeArtikelkontext([doc], { version: 2, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: response.finalUrl, artikelTitel: doc.title, herkunft: "strukturierter-originalartikel",
    gelesenAm: response.gelesenAm, absatzPosition: 1, text: auszug,
    gewinnung: { verfahren: vollstaendig === "abschnitte" ? "artikelabschnitte-v4" : vollstaendig ? "artikeltext-v3" : "artikel-einstieg-v2", positionsbasis: "html-article-p", antwortHash: hash(html),
      artikelTextHash: hash(articleText), artikelTextPosition: 0, titelTreffer: words(titel).size,
      kandidatZahl: 1, artikelAbsatzZahl: values.length, absaetze: selected, zwischenTexte: selectedZwischen, struktur,
      originalDatum, datumsFeld, kanonischDeklariert: canonical,
      ...(vollstaendig === "abschnitte" ? { abschnitte: require("./artikel-abschnitte").segmentiere(auszug) } : {}) } });
}
function gewinneArtikelEinstieg(document, response) {
  try { return { ok: true, beleg: einstieg(document, response) }; }
  catch (error) { return { ok: false, reason: error.message?.startsWith("artikelkontext-") ? error.message.slice(15) : "artikelstruktur-ungueltig" }; }
}
function gewinneArtikeltext(document, response, opts = {}) {
  try { return { ok: true, beleg: einstieg(document, response, true) }; }
  catch (error) {
    // Dieselbe bereits gelieferte Antwort, kein zweiter GET: Bei Ueberlaenge
    // bleibt der bisherige gebundene Ausschnitt nutzbar. Sein v2-Verfahren
    // und Absatzzaehler bleiben unveraendert; niemals als Volltext markieren.
    if (error.message === "artikelkontext-artikeltext-zu-lang") {
      if (opts.abschnittsweise) {
        try { return { ok: true, beleg: einstieg(document, response, "abschnitte") }; }
        catch (e) { return { ok: false, reason: String(e.message).replace(/^artikelkontext-/, "") }; }
      }
      return gewinneArtikelEinstieg(document, response);
    }
    return { ok: false, reason: error.message?.startsWith("artikelkontext-") ? error.message.slice(15) : "artikelstruktur-ungueltig" };
  }
}
module.exports = { MAX_ANTWORT_BYTES, gewinneArtikelkontext, gewinneArtikelEinstieg, gewinneArtikeltext };
