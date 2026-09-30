"use strict";

// Helmut — kleinste, geschlossene lokale KOMPOSITIONSKETTE der amtlichen Presseartikel des
// Landtags Brandenburg bis zur bestehenden minimierten Stand-Rohzeile.
// =============================================================================================
// BELEGTER ANLASS (lokale Vorbereitung der Landesversorgung Brandenburg, 28./29.09.2026): Die
// Einzelbausteine liegen fertig und je einzeln offline geprueft vor:
//   * lib/helmut/brandenburg-landtag-presse-rss.js           — Fundstellenleser + Item-Bindung,
//   * lib/helmut/brandenburg-landtag-presseartikel.js        — strenger Artikel-HTML-Leser,
//   * lib/helmut/brandenburg-landtag-presseartikelstand.js   — minimierter Stand bis zur Rohzeile.
// Es fehlte genau EINE getrennte, ausdruecklich lokale Komposition, die daraus die amtliche
// Landtagspresse als minimierte Stand-Rohzeilen bildet — ohne neuen Netzweg und ohne neue
// URL-Familie.
//
// Vertrag (ladeLandtagPresseKette(quelle, deps)):
//   Eingang: quelle ist die feste Quellenbindung { source_id, source_name, source_type } mit
//            source_type === "parliament". deps.abrufen ist der EINZIGE Abrufweg und MUSS
//            ausdruecklich injiziert werden; es gibt KEINEN generischen Netz- oder RSS-Fallback.
//            Der injizierte Abruf bekommt genau eine feste Adresse und liefert die beobachtete
//            finale Adresse, den HTTP-Status und den Textkoerper: { finalUrl, http, body }.
//   Ablauf:  1) die FESTE Feedidentitaet pruefen und den Feed GENAU an der beobachteten
//               Anfrage-Adresse abrufen,
//            2) den Feed ausschliesslich ueber den bestehenden strengen RSS-Leser pruefen,
//            3) fuer JEDES Feed-Item den Artikel AUSSCHLIESSLICH ueber den gebundenen Item-Link
//               abrufen und verlangen, dass die finale Adresse der kanonische Artikelpfad GENAU
//               dieser Itemnummer auf dem amtlichen Host ist,
//            4) ueber standAusRssItem aus Artikelbeleg und gebundenem Item GENAU EINE minimierte
//               Rohzeile erzeugen,
//            5) jede Rohzeile vor der Rueckgabe erneut als minimale Stand-Rohzeile pruefen.
//   Ergebnis: nur bei vollstaendigem Erfolg { ok:true, kennungen:[rd-<Standhash>…], rows:[…] }.
//             KEIN HTML, KEIN Volltext, KEIN RSS-Rohtext: published_at bleibt null, der belegte
//             Kalendertag steht ausschliesslich im bestehenden Stand-Rohfeld.
//             Bei EINEM Fehler: atomar { ok:false, reason, kennungen:null, rows:null } — keine
//             Teilfreigabe, nie ein abgeschnittenes Teilergebnis.
//
// Fail closed: falsche Feedadresse/Hostwechsel, defektes RSS, fremder oder abweichender
// Artikellink, HTTP-Drift, Titel-/Tages-/Bindungswiderspruch, unzulaessige Quelle oder
// Rohzeilen-Drift brechen die GANZE Kette ab.
//
// KEIN Netz, KEINE Datei-, DB-, Modell- oder Productionwirkung. Dieses Modul wird von nichts
// anderem automatisch aufgerufen; der Abruf kommt ausschliesslich injiziert.

const { isDeepStrictEqual } = require("node:util");

const VERSION = "brandenburg-landtag-presse-kette-v1";

// Amtliche Hosts der Landtag-Brandenburg-Pressefamilie (www- und Normalform).
const HOSTS = new Set(["landtag.brandenburg.de", "www.landtag.brandenburg.de"]);
// Kanonischer Artikelpfad: /de/meldungen/<slug>/<nr>. Der Slug wird NICHT normalisiert; nur die
// belegte Zeichenfamilie ist zugelassen (siehe bestehender Artikelleser/Standvertrag).
const ARTIKEL_PFAD = /^\/de\/meldungen\/[A-Za-z0-9._:!$&'()*+,;=@~-]+\/(\d{1,10})$/;
// Das RSS verlinkt auf die amtliche sixcms-Weiche. Diese leitete zum Zeitpunkt des
// vorbereiteten Vertrags noch auf die kanonische Artikeladresse weiter, liefert sie
// inzwischen aber als <link rel="canonical"> im unveraenderten HTML. Die Weiche ist
// nur als Transportadresse erlaubt; sichtbar und gespeichert bleibt ausschliesslich
// die erneut strikt gepruefte kanonische Artikeladresse.
const SIXCMS_DETAIL_PATH = "/sixcms/detail.php";
// Feste Quellenbindung. Genau diese drei Felder bilden die minimale Quellenangabe der Rohzeile.
const QUELLE_FELDER = Object.freeze(["source_id", "source_name", "source_type"]);
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
// Der injizierte Abruf liefert GENAU diese drei Felder; jedes weitere Feld waere eine zweite,
// ungepruefte Aussage ueber die Antwort.
const ANTWORT_FELDER = Object.freeze(["body", "finalUrl", "http"]);

function fordere(ok, grund) { if (!ok) throw new Error("brandenburg-landtag-presse-kette-" + grund); }
function grundVon(error, praefix) {
  const nachricht = String((error && error.message) || "");
  return nachricht.startsWith(praefix) && /^[a-z0-9-]{1,120}$/.test(nachricht.slice(praefix.length))
    ? nachricht.slice(praefix.length) : null;
}
const alsFeldliste = felder => Object.keys(felder).sort().join(",");

// Atomarer Fehler: nie ein Teilresultat.
function fehler(reason) {
  return Object.freeze({ ok: false,
    reason: /^[a-z0-9-]{1,120}$/.test(String(reason)) ? String(reason) : "kette-fehlgeschlagen",
    kennungen: null, rows: null });
}

// Die feste Quellenbindung: genau die drei Felder, Typ ist und bleibt amtliches Parlament.
function pruefeQuelle(quelle) {
  fordere(quelle && typeof quelle === "object" && !Array.isArray(quelle), "quelle-ungueltig");
  fordere(alsFeldliste(quelle) === QUELLE_FELDER.join(","), "quelle-ungueltig");
  fordere(typeof quelle.source_id === "string" && SOURCE_ID.test(quelle.source_id),
    "quellen-id-ungueltig");
  fordere(typeof quelle.source_name === "string" && quelle.source_name === quelle.source_name.trim()
    && quelle.source_name.length > 0 && quelle.source_name.length <= 200
    && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(quelle.source_name), "quellen-name-ungueltig");
  fordere(quelle.source_type === "parliament", "quellentyp-ungueltig");
  return Object.freeze({ source_id: quelle.source_id, source_name: quelle.source_name,
    source_type: "parliament" });
}

// Strikt die Antwortform des injizierten Abrufs. Rueckgabe { finalUrl, http, body } oder null.
function leseAntwort(antwort) {
  if (!antwort || typeof antwort !== "object" || Array.isArray(antwort)) return null;
  if (alsFeldliste(antwort) !== ANTWORT_FELDER.join(",")) return null;
  return { finalUrl: antwort.finalUrl, http: antwort.http, body: antwort.body };
}

// Ausschliesslich der kanonische Artikelpfad DIESER Itemnummer auf dem amtlichen Host. Fremder
// Host, Port, Benutzerinfo, Query/Fragment, fremde Pfadfamilie, fremde Nummer, '.'/'%'/'\\' oder
// eine nicht byte-identische Adresse werden abgewiesen (fail closed, keine Normalisierung).
function kanonischeArtikelUrl(wert, nummer) {
  if (typeof wert !== "string" || wert.length === 0 || wert !== wert.trim()) return null;
  const authority = /^https:\/\/([^/?#]+)/.exec(wert)?.[1];
  if (!authority || authority.includes(":")) return null;
  let url;
  try { url = new URL(wert); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const treffer = ARTIKEL_PFAD.exec(url.pathname);
  if (!treffer || treffer[1] !== nummer) return null;
  if (url.pathname.includes("..") || url.pathname.includes("%") || url.pathname.includes("\\")) {
    return null;
  }
  if (url.href !== wert) return null;
  return wert;
}

function canonicalHrefAusHtml(html) {
  if (typeof html !== "string" || html.length === 0 || html.length > 4 * 1024 * 1024) return null;
  const sichtbar = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const treffer = [];
  for (const tag of sichtbar.match(/<link\b[^>]*>/gi) || []) {
    const rel = /\brel\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
    if (rel && rel.trim().toLowerCase() === "canonical" && href) treffer.push(href);
  }
  return treffer.length === 1 ? treffer[0] : null;
}

function kanonischeArtikelUrlAusAntwort(finalUrl, html, nummer) {
  const direkt = kanonischeArtikelUrl(finalUrl, nummer);
  if (direkt) return direkt;
  let weiche;
  try { weiche = new URL(finalUrl); } catch { return null; }
  if (weiche.protocol !== "https:" || weiche.username || weiche.password || weiche.port
    || weiche.hash || !HOSTS.has(weiche.hostname.toLowerCase())
    || weiche.pathname !== SIXCMS_DETAIL_PATH || !weiche.searchParams.get("id")) return null;
  return kanonischeArtikelUrl(canonicalHrefAusHtml(html), nummer);
}

// Die minimale Quellen-Rohzeile des bestehenden Standvertrags: Quellenbindung, exakter Titel und
// die kanonische Adresse dieses Artikels. `published_at` bleibt ausdruecklich leer.
function rohzeilenDoc(quelle, item, artikelUrl) {
  return { source_id: quelle.source_id, source_name: quelle.source_name,
    source_type: quelle.source_type, url: artikelUrl, canonical_url: artikelUrl,
    title: item.titel, published_at: null };
}

// Eine erzeugte Rohzeile wird VOR der Rueckgabe erneut geprueft: eigene Kennung, leerer
// Zeitwert, unveraendertes Stand-Rohfeld, genau die Quellenbindung und KEIN Roh-Text irgendwo.
function pruefeKettenrohzeile(quelle, stand, row) {
  try {
    const B = require("./brandenburg-landtag-presseartikelstand");
    const q = pruefeQuelle(quelle);
    const s = B.pruefeArtikelstand(stand);
    fordere(row && typeof row === "object" && !Array.isArray(row), "rohzeile-ungueltig");
    fordere(typeof row.id === "string" && row.id === "rd-" + s.standHash
      && row.content_hash === s.standHash, "kennung-abweichend");
    // Der belegte Kalendertag bleibt der einzige Zeitwert; published_at bleibt leer.
    fordere(row.published_at === null && !Object.hasOwn(row, "publishedAt"), "uhrzeit-widerspruch");
    for (const feld of ["volltext", "content", "html", "rohtext", "rss", "rssText"]) {
      fordere(!Object.hasOwn(row, feld), "rohtext-im-ergebnis");
    }
    fordere(row.source_id === q.source_id && row.source_name === q.source_name
      && row.source_type === "parliament", "quelle-abweichend");
    fordere(row.title === s.titel, "titel-abweichend");
    // Das bestehende Stand-Rohfeld steht unveraendert; kein fremdes Rohfeld daneben.
    const raw = row.raw;
    fordere(raw && typeof raw === "object" && !Array.isArray(raw), "standfeld-fehlend");
    const erlaubt = new Set(["sourcePriority", "originalUrl", B.ROHFELD]);
    for (const feld of Object.keys(raw)) fordere(erlaubt.has(feld), "fremdfeld-in-raw");
    const meta = raw[B.ROHFELD];
    fordere(meta && typeof meta === "object" && !Array.isArray(meta), "standfeld-fehlend");
    for (const feld of ["volltext", "content", "html", "rohtext"]) {
      fordere(!Object.hasOwn(meta, feld), "rohtext-im-ergebnis");
    }
    fordere(isDeepStrictEqual({ ...meta }, { ...s }), "standfeld-abweichend");
    // Die eigene Leseprojektion bestaetigt dieselbe Kennung (kein stiller Rueckfall).
    fordere(B.leseArtikelstand(row)?.standHash === s.standHash, "rohzeile-stand-abweichend");
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: grundVon(error, "brandenburg-landtag-presse-kette-")
      || grundVon(error, "brandenburg-landtag-presseartikelstand-") || "rohzeile-ungueltig" };
  }
}

function tiefKuehl(wert) {
  if (wert && typeof wert === "object" && !Object.isFrozen(wert)) {
    Object.freeze(wert);
    for (const schluessel of Object.keys(wert)) tiefKuehl(wert[schluessel]);
  }
  return wert;
}

async function ladeLandtagPresseKette(quelle, deps = {}) {
  let quelleGeprueft;
  try { quelleGeprueft = pruefeQuelle(quelle); }
  catch (error) { return fehler(grundVon(error, "brandenburg-landtag-presse-kette-") || "quelle-ungueltig"); }

  // Der Abruf ist ausschliesslich injiziert; ohne Injektion gibt es keinen Ersatzweg.
  const abrufen = deps && typeof deps.abrufen === "function" ? deps.abrufen : null;
  if (!abrufen) return fehler("abruf-nicht-injiziert");

  const R = require("./brandenburg-landtag-presse-rss");
  const B = require("./brandenburg-landtag-presseartikelstand");

  // 1) Feste Feedidentitaet: genau die beobachtete Anfrage-Adresse abrufen und genau die
  //    beobachtete finale Feedadresse verlangen.
  let rohFeed;
  try { rohFeed = await abrufen(R.ANFRAGE_URL); }
  catch { return fehler("feed-abruf-fehlgeschlagen"); }
  const feed = leseAntwort(rohFeed);
  if (!feed || feed.http !== 200 || feed.finalUrl !== R.FINALE_URL) {
    return fehler("feed-identitaet-abweichend");
  }

  // 2) Ausschliesslich der bestehende strenge RSS-Leser. Kein generischer RSS-Fallback.
  let fundstellen;
  try {
    fundstellen = R.pruefePresseRss({ url: R.ANFRAGE_URL, finalUrl: feed.finalUrl,
      http: feed.http, rss: feed.body });
  } catch (error) {
    return fehler(grundVon(error, "brandenburg-landtag-presse-rss-") || "rss-ungueltig");
  }

  // 3)..5) Jedes Item seriell: Artikel NUR ueber den gebundenen Item-Link, danach genau EINE
  //        minimierte Rohzeile. Jeder Fehler bricht die gesamte Kette atomar ab.
  const rows = [];
  try {
    for (const item of fundstellen.items) {
      let rohArtikel;
      try { rohArtikel = await abrufen(item.link); }
      catch { return fehler("artikel-abruf-fehlgeschlagen"); }
      const antwort = leseAntwort(rohArtikel);
      if (!antwort || antwort.http !== 200) return fehler("artikel-http-nicht-ok");
      const artikelUrl = kanonischeArtikelUrlAusAntwort(antwort.finalUrl, antwort.body, item.nummer);
      if (!artikelUrl) return fehler("artikelziel-ungueltig");

      const stand = B.standAusRssItem(rohzeilenDoc(quelleGeprueft, item, artikelUrl), item,
        { url: artikelUrl, finalUrl: artikelUrl, http: antwort.http, html: antwort.body });
      if (!stand || stand.ok !== true) return fehler((stand && stand.reason) || "artikel-ungueltig");

      const geprueft = pruefeKettenrohzeile(quelleGeprueft, stand.stand, stand.row);
      if (geprueft.ok !== true) return fehler(geprueft.reason);
      rows.push(stand.row);
    }
  } catch (error) {
    return fehler(grundVon(error, "brandenburg-landtag-presse-kette-")
      || grundVon(error, "brandenburg-landtag-presseartikelstand-")
      || grundVon(error, "brandenburg-landtag-presse-rss-") || "kette-fehlgeschlagen");
  }

  const eingefroren = Object.freeze(rows.map(row => tiefKuehl(row)));
  return Object.freeze({ ok: true,
    kennungen: Object.freeze(eingefroren.map(row => row.id)), rows: eingefroren });
}

module.exports = { VERSION, QUELLE_FELDER, pruefeQuelle, kanonischeArtikelUrl,
  kanonischeArtikelUrlAusAntwort,
  pruefeKettenrohzeile, ladeLandtagPresseKette };
