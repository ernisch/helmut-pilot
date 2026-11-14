"use strict";

// Zwei geschlossene Herausgeberlayouts. Nur eine explizit gelieferte Antwort;
// keine Beschaffung, Speicherung, Priorisierung oder kuenstliches JSON-LD.
const crypto = require("node:crypto"), A = require("./artikelkontext"),
  D = require("./artikelkontext-deutschlandfunk"), Q = require("./quellen-zeitvertrag"),
  { plain, stoertext } = require("./quellen-auszug");
const VERSION = 1, NEGATIVGRUND = "strukturierter-artikel-mehrdeutig-oder-fehlend";
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const key = value => plain(value).normalize("NFKC").replace(/\s+/gu, " ").trim();
const need = (ok, reason) => { if (!ok) throw Error("artikelkontext-" + reason); };
const klasse = (a, value) => a.class?.split(/\s+/u).includes(value);
function kennung(value) {
  if (typeof value !== "string") return null;
  if (/^https:\/\/(?:www\.)?bundesregierung\.de\/breg-de\/aktuelles\/[a-z0-9-]+-\d{6,}$/.test(value)) return "breg";
  if (/^https:\/\/(?:www\.)?deutschlandfunk\.de\/[a-z0-9-]+-100\.html$/.test(value)) return "dlf";
  return null;
}
function gewinne(doc, response, modus, parser) {
  const { attrs, bloecke, text, articleParagraphs, zwischenText, articleNodes } = parser;
  const html = response?.body, struktur = kennung(response?.finalUrl);
  need(typeof html === "string" && Buffer.byteLength(html) <= 1024 * 1024, "antwort-ungueltig");
  need(struktur && struktur === kennung(doc.url), "quellenlayout-nicht-freigegeben");
  const clean = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi, "");
  const root = { html: clean, start: 0 };
  const sichtbar = pos => {
    const stack = [], voids = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    let count = 0;
    for (const m of clean.slice(0, pos).matchAll(/<(\/?)([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
      need(++count <= 16384, "html-struktur-zu-gross");
      const name = m[2].toLowerCase();
      if (m[1]) { const i = stack.findLastIndex(t => t.name === name); if (i >= 0) stack.splice(i); }
      else if (!voids.has(name) && !/\/\s*>$/.test(m[0])) {
        need(stack.length < 128, "html-struktur-zu-gross"); stack.push({ name, a: attrs(m[0]) });
      }
    }
    return !stack.some(t => ["nav", "aside", "footer", "figure", "noscript", "form"].includes(t.name)
      || Object.hasOwn(t.a, "hidden") || Object.hasOwn(t.a, "style") || t.a["aria-hidden"]?.toLowerCase() === "true");
  };
  const blocks = (parent, tag, match) => bloecke(parent.html, tag, match)
    .map(b => ({ ...b, start: parent.start + b.start }));
  const one = (parent, tag, match) => {
    const found = blocks(parent, tag, match);
    need(found.length === 1, "artikelbereich-mehrdeutig-oder-fehlend");
    const b = found[0];
    need(sichtbar(b.start + b.html.indexOf(">") + 1), "artikelbereich-mehrdeutig-oder-fehlend"); return b;
  };
  const abgedeckt = (parent, bekannt) => {
    const ranges = bekannt.map(b => [b.start - parent.start, b.html.length]).sort((a,b) => a[0] - b[0]);
    need(ranges.every(([start, length], i) => start >= 0 && start + length <= parent.html.length
      && (!i || ranges[i - 1][0] + ranges[i - 1][1] <= start)), "artikelbereich-mehrdeutig-oder-fehlend");
    let rest = parent.html;
    for (const [start, length] of ranges.reverse()) rest = rest.slice(0, start) + rest.slice(start + length);
    need(!plain(rest), "artikeltext-unvollstaendig");
  };
  const main = one(root, "main", a => struktur === "breg" ? a.id === "main" : klasse(a, "main"));
  // Keine neue Struktur darf eine widersprechende Article-Deklaration verdecken.
  need(articleNodes(html, true) === null, "strukturierter-artikel-widerspruch");
  const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(clean)?.[1];
  need(head, "artikelmetadaten-fehlen");
  const metas = [...head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map(m => attrs(m[0]));
  need(!metas.some(a => /^(?:robots|helmutbot)$/i.test(a.name || "")
    && /(?:^|[\s,])(?:nosnippet|noai|noindex|max-snippet\s*:\s*0)(?:$|[\s,])/i.test(a.content || "")), "original-metadaten-gesperrt");
  const meta = name => {
    const rows = metas.filter(a => (a.property || a.name)?.toLowerCase() === name);
    need(rows.length === 1, "artikelmetadaten-mehrdeutig-oder-fehlend"); return rows[0].content;
  };
  const canonicals = [...head.matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .map(m => attrs(m[0])).filter(a => a.rel?.toLowerCase().split(/\s+/u).includes("canonical"));
  need(canonicals.length === 1 && meta("og:type") === "article", "artikelmetadaten-mehrdeutig-oder-fehlend");
  const canonical = new URL(canonicals[0].href, response.finalUrl).href;
  for (const url of [canonical, meta("og:url")]) A.pruefeArtikelkontext([doc], {
    version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc), artikelUrl: url,
    artikelTitel: doc.title, herkunft: "manueller-originalvergleich", gelesenAm: response.gelesenAm,
    absatzPosition: 1, text: "Strukturpruefung" });
  let values, zwischen, originalDatum;
  const inline = block => text(block.replace(/<br\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, tag => {
    const a = attrs(tag); need(!Object.hasOwn(a, "hidden") && !Object.hasOwn(a, "style")
      && a["aria-hidden"]?.toLowerCase() !== "true", "keine-artikelabsaetze"); return " ";
  }));
  if (struktur === "breg") {
    need(key(meta("og:title")) === key(doc.title), "artikeltitel-abweichend");
    const h1 = one(root, "h1", a => klasse(a, "bpa-accessibility"));
    need(key(inline(h1.inhalt)) === key(doc.title), "artikeltitel-abweichend");
    const header = one(main, "div", a => a.id === "rs_reading_area_header"),
      h2 = one(header, "h2", a => klasse(a, "bpa-topline-title-wrapper"));
    need(key(inline(h2.inhalt)) === key(doc.title), "artikeltitel-abweichend");
    const times = blocks(header, "time");
    need(times.length === 1 && sichtbar(times[0].start + times[0].html.indexOf(">") + 1), "artikeldatum-abweichend");
    originalDatum = times[0].a.datetime;
    const date = Q.publikationsdatum(originalDatum), pub = Q.publikationsdatum(doc.published_at);
    need(date?.original.includes("T") && pub && date.iso === pub.iso, "artikeldatum-abweichend");
    const displayDate = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long",
      day: "numeric", month: "long", year: "numeric" }).format(Date.parse(originalDatum));
    need(key(times[0].inhalt) === displayDate, "artikeldatum-abweichend");
    const intro = one(header, "div", a => klasse(a, "bpa-short-text")),
      content = one(main, "div", a => a.id === "rs_reading_area_content"),
      article = one(content, "div", a => klasse(a, "bpa-article"));
    const rich = blocks(article, "div", a => klasse(a, "bpa-richtext"));
    const outer = rich.filter(b => !rich.some(p => p !== b && p.start < b.start
      && p.start + p.html.length > b.start + b.html.length));
    need(outer.length === 1 && sichtbar(outer[0].start + outer[0].html.indexOf(">") + 1), "artikelbereich-mehrdeutig-oder-fehlend");
    const absaetze = block => {
      const ps = articleParagraphs(block.html), v = ps.map(p => !p.blocked && p.block !== undefined ? inline(p.block) : null);
      need(ps.length && v.every(Boolean) && zwischenText(block.html.slice(0, ps[0].start)) === ""
        && zwischenText(block.html.slice(ps.at(-1).start + ps.at(-1).block.length)) === "", "keine-artikelabsaetze");
      const z = ps.slice(1).map((p, i) => zwischenText(block.html.slice(ps[i].start + ps[i].block.length, p.start)));
      need(z.every(t => t !== null), "zwischenkontext-ungueltig"); return { v, z };
    };
    const first = absaetze(intro), body = absaetze(outer[0]);
    need(first.v.length === 1, "artikelvorspann-ungebunden");
    const daten = one(header, "ul", a => klasse(a, "bpa-collection-list")),
      eintraege = blocks(daten, "li", a => klasse(a, "bpa-collection-item")),
      share = one(header, "div", a => klasse(a, "bpa-header-share")),
      tools = one(header, "div", a => klasse(a, "bpa-article-meta-infos")),
      lesedauer = one(tools, "p", a => klasse(a, "bpa-article-header-reading-time")),
      vorlesen = one(tools, "div", a => klasse(a, "bpa-readspeaker-wrapper"));
    need(eintraege.length === 3 && /^Pressemitteilung \d+$/u.test(key(eintraege[0].inhalt))
      && key(eintraege[2].inhalt) === "Presse- und Informationsamt der Bundesregierung (BPA)"
      && /^\d+ Min\. Lesedauer$/u.test(key(lesedauer.inhalt)), "artikelmetadaten-ungebunden");
    abgedeckt(eintraege[1], times); abgedeckt(daten, eintraege);
    abgedeckt(tools, [lesedauer, vorlesen]);
    abgedeckt(header, [h2, intro, daten, share, tools]);
    abgedeckt(article, [outer[0], ...blocks(article, "div", a => klasse(a, "bpa-tools"))]);
    abgedeckt(content, [article]);
    values = first.v.concat(body.v); zwischen = ["", ...body.z];
  } else {
    // Der bestehende strikte DLF-Leser prueft bereits Kicker+H1, Quelle,
    // sichtbares Datum, Hauptartikel und dessen ersten Detailabsatz.
    // Nur fuer den bestehenden sichtbaren H1-Vergleich den bereits belegten
    // Herausgebersuffix entfernen. Der abschliessende Beleg bindet unten das
    // UNVERAENDERTE Dokument samt urspruenglichem Quellenhash und Feedtitel.
    D.deutschlandfunkArtikel({ ...doc, title: require("./herausgeber").titelRumpf(doc) }, response, html);
    const article = one(main, "article", a => klasse(a, "b-article")),
      header = one(article, "header", a => klasse(a, "b-article-header")),
      intro = one(header, "p", a => klasse(a, "article-header-description")),
      content = one(article, "div", a => klasse(a, "article-content")),
      body = one(content, "section", a => klasse(a, "b-article-details"));
    const times = blocks(header, "time"); need(times.length === 1, "artikeldatum-abweichend"); originalDatum = times[0].a.datetime;
    const h1 = one(header, "h1", a => klasse(a, "b-article-header-main")),
      kicker = one(h1, "span", a => klasse(a, "headline-kicker")),
      titel = one(h1, "span", a => klasse(a, "headline-title")),
      publikation = one(header, "span", a => klasse(a, "article-header-publication-date")),
      actions = one(header, "div", a => klasse(a, "article-header-actions"));
    abgedeckt(h1, [kicker, titel]); abgedeckt(publikation, times);
    abgedeckt(header, [h1, intro, publikation, actions]);
    const heads = blocks(body, "h2", a => klasse(a, "article-details-title")),
      more = heads.filter(h => key(h.inhalt) === "Mehr zum Thema");
    need(more.length <= 1, "artikelbereich-mehrdeutig-oder-fehlend");
    const details = blocks(body, "div", a => klasse(a, "article-details-text"));
    const chosen = details.filter(b => !more.length || b.start < more[0].start);
    // Nur der explizite Linkbereich und die datierte Sendemetadatenzeile
    // duerfen hinter der benannten Navigationsgrenze liegen.
    const navigation = details.filter(b => !chosen.includes(b));
    const tag = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(Date.parse(originalDatum));
    for (const b of navigation) {
      const notice = klasse(b.a, "u-text-italic") && key(b.inhalt) === `Diese Nachricht wurde am ${tag} im Programm Deutschlandfunk gesendet.`;
      need(notice || (/<a\b/i.test(b.inhalt) && !plain(b.inhalt.replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, ""))), "artikelende-ungebunden");
    }
    need(chosen.length && chosen.every(b => sichtbar(b.start + b.html.indexOf(">") + 1)), "keine-artikelabsaetze");
    values = [inline(intro.inhalt), ...chosen.map(b => inline(b.inhalt))];
    zwischen = chosen.map((b, i) => i ? zwischenText(clean.slice(chosen[i - 1].start + chosen[i - 1].html.length, b.start)) : "");
    need(values.every(Boolean) && zwischen.every(t => t !== null), "keine-artikelabsaetze");
    const erhalteneTitel = heads.filter(h => chosen.some((b, i) => i > 0
      && h.start >= chosen[i - 1].start + chosen[i - 1].html.length && h.start + h.html.length <= b.start));
    abgedeckt(body, [...chosen, ...erhalteneTitel, ...more, ...navigation,
      ...blocks(body, "figure", a => klasse(a, "b-image-figure"))]);
    abgedeckt(content, [body]);
    abgedeckt(article, [header, content]);
  }
  need(values.length <= 256 && values.every(v => v.length > 0), "zu-viele-absaetze");
  const ganz = A.einstiegText(values, zwischen);
  need(ganz.length >= 60 && ganz.length <= 128 * 1024 && !stoertext(ganz), "artikeltext-ungueltig");
  need(modus !== true || (ganz.length <= A.MAX_ZEICHEN_ARTIKEL && Buffer.byteLength(ganz) <= A.MAX_BYTES_ARTIKEL), "artikeltext-zu-lang");
  let count = values.length;
  if (!modus) { count = 0; while (count < Math.min(4, values.length)
    && A.einstiegText(values.slice(0, count + 1), zwischen.slice(0, count)).length <= A.MAX_ZEICHEN_EINSTIEG) count++; }
  need(count > 0, "einstieg-zu-lang");
  const absaetze = values.slice(0, count), zwischenTexte = zwischen.slice(0, count - 1), auszug = A.einstiegText(absaetze, zwischenTexte);
  return A.pruefeArtikelkontext([doc], { version: 2, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: response.finalUrl, artikelTitel: doc.title, herkunft: "strukturierter-originalartikel",
    gelesenAm: response.gelesenAm, absatzPosition: 1, text: auszug, gewinnung: {
      verfahren: modus === "abschnitte" ? "artikelabschnitte-v4" : modus ? "artikeltext-v3" : "artikel-einstieg-v2",
      positionsbasis: struktur === "breg" ? "html-main-p" : "html-article-div", struktur, layoutVersion: VERSION,
      antwortHash: hash(html), artikelTextHash: hash(ganz), artikelTextPosition: 0, titelTreffer: 0,
      kandidatZahl: 1, artikelAbsatzZahl: values.length, absaetze, zwischenTexte, datumsFeld: "datetime",
      originalDatum, kanonischDeklariert: canonical,
      ...(modus === "abschnitte" ? { abschnitte: require("./artikel-abschnitte").segmentiere(auszug) } : {}) } });
}
module.exports = { VERSION, NEGATIVGRUND, kennung, gewinne };
