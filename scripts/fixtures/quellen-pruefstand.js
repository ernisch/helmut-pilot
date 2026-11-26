"use strict";

const http = require("node:http");
const https = require("node:https");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { once } = require("node:events");

const BT = "https://www.bundestag.de";
const GOOGLE = "https://news.google.com";
const VERLAG = "https://nachrichten.fixture.invalid";
const AZURE = "https://helmut-fixture.openai.azure.com";
const DIP = "https://search.dip.bundestag.de/api/v1";
const DIP_TITEL = "Antrag zur Beratung über Arbeitsmarktpolitik";
const DIP_RESSORT = "Bundesministerium für Arbeit und Soziales";
const DIP_VORGANG = "990002";
const DIP_DATUM = "2026-11-19";
const DIP_ORIGINAL = "https://dserver.bundestag.de/btd/21/099/2109900.pdf";
const mandat = Object.freeze({
  id: "synthetik-quellenpruefstand", fullName: "Mara Beispiel", name: "Mara Beispiel",
  party: "Fraktionslos", parliamentType: "Bundestag", constituency: "Beispielregion",
  committees: ["Arbeit und Soziales", "Wirtschaft und Energie", "Digitales und Staatsmodernisierung"],
  focusTopics: ["Arbeit", "Wirtschaft", "Digitales"], profileActive: true
});

function monatsquellen() {
  const ids = ["bundesregierung", "bmas"];
  return ids.map(id => require("../../lib/helmut/sources").v1Sources.find(q => q.id === id));
}

function katalog(monat = false) {
  const { QUELLEN } = require("../../lib/helmut/quellen-bundestag-termine");
  const { resolveProfilePackages } = require("../../lib/helmut/quellenarchitektur/profile-packages");
  const pakete = resolveProfilePackages(mandat);
  const publishers = [
    ["publisher-bundestag.de", "bundestag.de", "parliament", "official_primary"],
    ["publisher-dip.bundestag.de", "dip.bundestag.de", "parliament", "official_primary"],
    ["publisher-news.google.com", "news.google.com", "aggregator", "aggregator"],
    ["publisher-fixture.invalid", "nachrichten.fixture.invalid", "media", "journalistic"]
  ].map(([id, canonical_domain, publisher_type, evidence_role]) =>
    ({ id, name: id, canonical_domain, publisher_type, evidence_role }));
  if (monat) {
    for (const q of monatsquellen()) {
      const domain = new URL(q.rssUrl).hostname.replace(/^www\./,"");
      publishers.push({ id:"publisher-" + domain, name:q.name, canonical_domain:domain,
        publisher_type:"ministry", evidence_role:"official_primary" });
    }
  }
  const retrievalPaths = [], packagePaths = [];
  const links = new Set();
  function weg(row, packageId) {
    retrievalPaths.push({ status: "healthy", activation_mode: "auto", ...row });
    links.add(packageId);
    packagePaths.push({ package_id: packageId, retrieval_path_id: row.id });
  }
  if (monat) for (const q of monatsquellen()) weg({
    id:"rp-" + q.id, legacy_source_id:q.id, publisher_id:"publisher-" + new URL(q.rssUrl).hostname.replace(/^www\./,""),
    name:q.name, represents_type:q.type, method:"rss", url:q.rssUrl
  }, "pkg-bund-basis");
  for (const q of QUELLEN) weg({
    id: q.retrievalPathId, legacy_source_id: q.id, publisher_id: "publisher-bundestag.de",
    method: q.crawlMethod, url: q.url
  }, q.packageId);
  weg({ id: "rp-dip", legacy_source_id: "dip", publisher_id: "publisher-dip.bundestag.de",
    method: "api", activation_mode: "always_on", parser: "dip-json", url: DIP }, "pkg-bund-basis");
  // Der echte Profilresolver ergänzt seine Suchwege zusätzlich zum relationalen Katalog.
  const profilQuellen = require("../../lib/helmut/scheduler").mandateNewsSources(mandat);
  const geteilteGoogle = 143 - new Set(profilQuellen.flatMap(q => q.rssUrls || [q.rssUrl])).size;
  for (let i = 1; i <= geteilteGoogle; i++) weg({
    id: `rp-fixture-google-${i}`, publisher_id: "publisher-news.google.com",
    method: "googlenews_search", url: `${GOOGLE}/rss/search?q=fixture-ressort-${i}&hl=de&gl=DE&ceid=DE:de`
  }, "pkg-bund-basis");
  for (let i = 1; i <= 11; i++) weg({
    id: `rp-fixture-rss-${i}`, publisher_id: "publisher-fixture.invalid",
    method: "rss", url: `${VERLAG}/feeds/${i}.xml`
  }, "pkg-bund-basis");
  weg({ id: "rp-fixture-pausiert", publisher_id: "publisher-fixture.invalid", method: "rss",
    status: "paused", url: `${VERLAG}/feeds/gesperrt.xml` }, "pkg-bund-basis");
  // Katalog-ID und Paket-Key bleiben getrennt. Amtliche Pakete behalten ihre
  // exakten IDs, auch wenn die Fiktion nur einen Teil der Paketwege abbildet.
  const keyFuerId = new Map(require("../../lib/helmut/quellenarchitektur/seeds/packages").PACKAGE_DEFINITIONS.map(p => [p.id, p.key]));
  const packages = [...links].map(id => ({
    id, key: keyFuerId.get(id) || id.slice(4), name: id, status: "active",
    is_base: pakete.required.includes(keyFuerId.get(id) || id.slice(4))
  }));
  return { publishers, retrievalPaths, packages, packagePaths };
}

const leer = "<rss><channel></channel></rss>";
const item = (url, titel, publikation, herausgeber = VERLAG) => `<item><title>${titel}</title>` +
  `<description>Synthetischer Bericht zu einer öffentlichen parlamentarischen Beratung.</description>` +
  `<link>${url.replaceAll("&", "&amp;")}</link><pubDate>${publikation}</pubDate>` +
  `<source url="${herausgeber}">Synthetischer Herausgeber</source></item>`;
const rss = items => `<rss version="2.0"><channel>${items.join("")}</channel></rss>`;

function pdf(zeilen) {
  const stream = "BT /F1 12 Tf 50 750 Td " + zeilen.map(line => `(${line}) Tj`).join(" 0 -20 Td ") + " ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(text.length); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = text.length;
  text += "xref\n0 6\n0000000000 65535 f \n";
  text += offsets.slice(1).map(n => String(n).padStart(10, "0") + " 00000 n \n").join("");
  return Buffer.from(text + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, "latin1");
}

function termine(saubererMorgen, wiederanlauf, monatstag) {
  const terminDatum = monatstag && new Date(Date.parse(monatstag) + 86400000).toLocaleDateString("de-DE", {weekday:"long", day:"2-digit", month:"2-digit", year:"numeric", timeZone:"UTC"}).replace(", ", ", dem ");
  const kalenderDatum = datum => datum.replaceAll("-", "");
  const { QUELLEN } = require("../../lib/helmut/quellen-bundestag-termine");
  const seiten = new Map();
  for (const [nummer, q] of QUELLEN.entries()) {
    const link = (n, name) => `/resource/blob/${1000 * (nummer + 1) + n}/${name}`;
    if (q.art === "kalender") {
      const url = link(1, "fixture.ics");
      seiten.set(new URL(q.url).pathname, () => ({ body: `<a href="${url}">Synthetischer Kalender</a>` }));
      seiten.set(url, tag => ({
        type: "text/calendar",
        body: tag === "2026-11-20" ? "BEGIN:VCALENDAR\r\nungueltig" :
          ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:fixture.invalid",
            monatstag ? "DTSTART;VALUE=DATE:" + kalenderDatum(monatstag) : "DTSTART;VALUE=DATE:20261123",
            monatstag ? "DTEND;VALUE=DATE:" + kalenderDatum(new Date(Date.parse(monatstag) + 5 * 86400000).toISOString().slice(0,10)) : "DTEND;VALUE=DATE:20261128",
            "SUMMARY:Sitzungswoche Deutscher Bundestag", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n")
      }));
      continue;
    }
    const pfad = new URL(q.url).pathname;
    const liste = Array.from({ length: saubererMorgen ? 1 : 5 }, (_, i) => {
      const url = link(i + 1, q.art === "plenum" ? "Tagesordnung-komplett.pdf" : `tagesordnung-${i + 1}.pdf`);
      const termin = terminDatum || (wiederanlauf ? "Donnerstag, dem 26.11.2026" : "Dienstag, dem 24. November 2026");
      const plenumTermin = saubererMorgen ? termin : "24.11.2026";
      const sitzung = q.art === "plenum" ? `7. Sitzung des Deutschen Bundestages am ${plenumTermin}, 09 Uhr`
        : `der 7. Sitzung am ${wiederanlauf ? termin : "Dienstag, dem 24.11.2026"}, 09 Uhr`;
      const pilotAusschuss = q.key === "arbeit-soziales";
      const revision = pilotAusschuss && i ? `${i}. Ergänzungsmitteilung` : null;
      const drucksachen = monatstag && pilotAusschuss ? [Number("99" + monatstag.slice(-2))] : wiederanlauf && pilotAusschuss ? [9923, 9924, 9925] : [pilotAusschuss && i === 0 ? 9900 : 9001 + i];
      seiten.set(url, tag => ({ type: "application/pdf", body:
        nummer === 1 && i === 1 && tag === "2026-11-19" ? "%PDF-fehlerhaft" :
          pdf(["Berlin, den 19.11.2026", "Tagesordnung " + sitzung,
            ...(revision ? [revision, "Die Tagesordnung wird um folgende Tagesordnungspunkte ergänzt."] : []),
            ...drucksachen.flatMap((nr, index) => [`Tagesordnungspunkt ${pilotAusschuss ? i + index + 1 : 1}`,
              "Beratung zum Arbeitsmarkt", `BT-Drucksache 21/${nr}`]),
            ...(tag === "2026-11-20" && i === 0 ? ["Geaenderte Fassung"] : [])])
      }));
      const sitzungstag = wiederanlauf ? termin : "Dienstag, dem 24.11.2026";
      return `<tr><td>19.11.2026</td><td><a href="${url}">7. Sitzung am ${sitzungstag}${revision ? `, ${revision}` : ""}</a></td></tr>`;
    }).join("");
    if (q.art === "ausschuss") {
      const endpoint = `/ajax/filterlist/de${pfad}/1-1`;
      seiten.set(pfad, tag => ({ body: `{"endpoint":"${endpoint}"}`,
        ...(nummer === 2 && tag === "2026-11-20" ? { headers: { "tdm-reservation": "1" } } : {}) }));
      seiten.set(endpoint, () => ({ body: `<table>${liste}</table>` }));
    } else seiten.set(pfad, () => ({ body: liste }));
  }
  return seiten;
}

function modellAntwort(schema, eingabe) {
  const basis = require("./z3-plattform").baueSchemaAntwort(schema);
  if (typeof eingabe !== "string") return basis;
  const zeilen = eingabe.split("\n");
  const json = text => { try { return JSON.parse(text); } catch { return null; } };
  const aussagen = [
    { text: "Der Antrag sieht eine Beratung über Arbeitsmarktpolitik vor.", belegfeld: "titel" },
    { text: "DIP führt das " + DIP_RESSORT + " als Ressort des Antrags auf.", belegfeld: "auszug" }
  ];
  const mandatstext = "Arbeit und Soziales: Der Antrag betrifft die Beratung zur Arbeitsmarktpolitik.";
  const amtlich = q => q?.titel === DIP_TITEL && q.auszug?.includes(DIP_RESSORT) && q.quelle === "DIP Bundestag";
  if (schema?.properties?.paragraphs) {
    const quellen = zeilen.filter(z => z.startsWith("[vg-")).map(z => json(z.slice(z.indexOf("] ") + 2)));
    const vorgang = quellen.find(v => v?.quellenbelege?.some(amtlich));
    const quelle = vorgang?.quellenbelege.find(amtlich);
    if (!quelle) return basis;
    return { paragraphs: aussagen.map(({ text }) => ({ text, vorgang_ids: [vorgang.vorgang_id],
      quelle_id: quelle.quelle_id, auswahlbegruendung: mandatstext,
      mandatsbezug: { feld: "ausschuss", wert: "Arbeit und Soziales" } })) };
  }
  if (schema?.properties?.pruefungen && schema.properties.vergleiche) {
    const aus = prefix => json(zeilen.find(z => z.startsWith(prefix))?.slice(prefix.length));
    const quellen = aus("QUELLEN: "), absaetze = aus("ABSAETZE: ");
    const quelle = quellen?.flatMap(v => v.quellenbelege).find(amtlich);
    if (!quelle || absaetze?.length !== 2 || !absaetze.every((p, i) =>
      p.quelle_id === quelle.quelle_id && p.text === aussagen[i].text)) return basis;
    return { pruefungen: aussagen.map(({ belegfeld }, absatz) => ({ absatz, quelle_id: quelle.quelle_id,
      belegfeld, pruefbegruendung: "Die jeweilige Angabe steht im DIP-Beleg.", vollstaendig_belegt: true,
      themenrein: true, mandatsbegruendung: mandatstext, profilbezug: true, textart: "konkreter_sachverhalt" })),
      vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
        pruefbegruendung: "Beratungsgegenstand und gelistetes Ressort sind zwei getrennte Angaben." }] };
  }
  // Nur das vorhandene synthetische DIP-Dokument besitzt eine fachlich
  // passende Fixture-Antwort. Die übrigen Modell- und Quellenfälle bleiben.
  if (!schema?.properties?.was_ist_passiert) return basis;
  const quellen = zeilen.filter(z => z.startsWith("{")).map(json).filter(q => q?.quelle_id && q.titel);
  if (quellen.length !== 1 || quellen[0].titel !== DIP_TITEL
    || quellen[0].herausgeber !== "DIP Bundestag") return basis;
  return {
    ...Object.fromEntries(Object.entries(basis).map(([k, v]) => [k, Array.isArray(v) ? [] : v])),
    headline: DIP_TITEL, display_title: DIP_TITEL, confidence_score: 80, source_document_count: 1,
    status: "neu", zeitdruck: "keiner", decision_level: "bund", event_type: "antrag",
    was_ist_passiert: DIP_TITEL + ".", warum_wichtig: "Der Antrag betrifft die Arbeitsmarktpolitik.",
    wer_ist_betroffen: "Das " + DIP_RESSORT + " ist als Ressort gelistet.",
    handlungsempfehlung: "Die weitere Beratung zur Arbeitsmarktpolitik beobachten.",
    ministerien: [DIP_RESSORT]
  };
}

function dipProbe(tag, wiederanlauf) {
  if (!wiederanlauf) return { datum: DIP_DATUM, dokumentId: "990001", vorgangId: DIP_VORGANG, original: DIP_ORIGINAL };
  const tagNummer = tag.slice(-2);
  return { datum: tag, dokumentId: "9901" + tagNummer, vorgangId: "9902" + tagNummer,
    original: `https://dserver.bundestag.de/btd/21/099/21099${tagNummer}.pdf` };
}

function dokumente(tag, wiederanlauf) {
  const dip = dipProbe(tag, wiederanlauf);
  const aktuell = {
        id: Number(dip.dokumentId), titel: DIP_TITEL, drucksachetyp: "Antrag",
        dokumentart: "Drucksache", datum: dip.datum, wahlperiode: 21,
        urheber: [{ titel: "Bundesregierung" }],
        ressort: [{ titel: DIP_RESSORT }],
        vorgangsbezug: [{ id: dip.vorgangId, titel: DIP_TITEL, vorgangstyp: "Antrag" }],
        fundstelle: { pdf_url: dip.original }
      };
  return [aktuell];
}

function monatsfeed(quelle, tag) {
  if (tag !== "2026-11-24") return leer;
  const namen = quelle.id === "bundesregierung"
    ? ["Bundeskabinett zum Klimabericht", "Kabinett zur Wohnraumförderung"]
    : ["Arbeitsmarktbericht zur Qualifizierung"];
  return rss(namen.map((titel,i) => item(new URL("/synthetik-monatsprobe/beleg-" + (i+1),quelle.url).href,
    titel, "Mon, 23 Nov 2026 20:00:00 GMT", quelle.url)));
}

function antworten(uhr, saubererMorgen, stoertag, monat) {
  const wiederanlauf = Boolean(stoertag);
  const bt = termine(saubererMorgen, wiederanlauf), tage = new Map(), zaehler = new Map(), unbekannt = [], proAdresse = new Map(), proOriginal = new Map();
  const plenum = require("../../lib/helmut/quellen-bundestag-termine").QUELLEN.find(q => q.art === "plenum").url;
  let stoerungen = 0;
  function antwort(url, methode, modellAnfrage) {
    const jetzt = new Date(uhr.now()), tag = jetzt.toISOString().slice(0, 10);
    const art = url.origin === GOOGLE ? "google" : url.origin === AZURE ? "modell" :
      url.origin === BT && url.pathname.startsWith("/resource/") ? "original" : "sonstige";
    const key = tag + "|" + art;
    zaehler.set(key, (zaehler.get(key) || 0) + 1);
    const adresse = tag + "|" + url.href;
    const vorher = proAdresse.get(adresse) || 0;
    proAdresse.set(adresse, vorher + 1);
    if (art === "original") proOriginal.set(adresse, vorher + 1);
    // Transportzeit des beobachteten Medienmixes ist eine explizite Annahme.
    uhr.setze(uhr.now() + (art === "google" ? 2000 : art === "modell" ? 2000 : 1000));
    if (url.origin === AZURE && url.pathname === "/openai/v1/responses" && methode === "POST") {
      const schema = modellAnfrage?.text?.format?.schema;
      const text = JSON.stringify(modellAntwort(schema, modellAnfrage?.input));
      return { type: "application/json", body: JSON.stringify({
        id: "fixture-antwort", status: "completed",
        output_text: text, output: [{ type: "message", content: [{ type: "output_text", text }] }],
        usage: { input_tokens: 400, output_tokens: 2 }
      }) };
    }
    if (url.origin === BT && url.pathname === "/robots.txt") return { body: "User-agent: *\nDisallow: /xml/\n" };
    if ((Array.isArray(stoertag) ? stoertag.includes(tag) : tag === stoertag) && url.href === plenum
      && jetzt.getTime() < require("../../lib/helmut/quellen-tagesbetrieb").zeiten(jetzt.getTime()).frist) {
      stoerungen++;
      return { status: 503, body: "Vorübergehend ausgefallener Bundestag-Abruf im Prüfstand" };
    }
    if (url.origin === BT) {
      if (monat && !tage.has(tag)) tage.set(tag, termine(true, true, tag));
      const seiten = monat ? tage.get(tag) : bt;
      if (seiten.has(url.pathname)) return seiten.get(url.pathname)(tag);
    }
    if (monat) {
      const quelle = monatsquellen().find(q => q.rssUrl === url.href);
      if (quelle) return { type:"application/rss+xml", body:monatsfeed(quelle,tag) };
    }
    const dip = dipProbe(tag, wiederanlauf);
    if (url.origin === new URL(DIP).origin && url.pathname === "/api/v1/drucksache")
      return { type: "application/json", body: JSON.stringify({ documents: dokumente(tag, wiederanlauf)
      }) };
    if (url.origin === new URL(DIP).origin && url.pathname === `/api/v1/vorgang/${dip.vorgangId}`)
      return { type: "application/json", body: JSON.stringify({ id: dip.vorgangId, typ: "Vorgang",
        titel: DIP_TITEL, vorgangstyp: "Antrag", wahlperiode: 21, datum: dip.datum,
        aktualisiert: `${dip.datum}T01:00:00Z` }) };
    if (url.origin === new URL(DIP).origin && url.pathname === "/api/v1/vorgangsposition"
      && url.searchParams.get("f.vorgang") === dip.vorgangId)
      return { type: "application/json", body: JSON.stringify({ numFound: 0, documents: [], cursor: "" }) };
    if (url.origin === GOOGLE && url.pathname === "/rss/search") {
      if (saubererMorgen) return { type: "application/rss+xml", body: leer };
      const query = url.searchParams.get("q") || "";
      if (query === "fixture-ressort-7" && !vorher && tag === "2026-11-20")
        return { status: 429, headers: { "retry-after": "8" }, body: "Synthetische Drosselung" };
      const hash = createHash("sha256").update(query).digest("hex").slice(0, 14);
      const person = query.includes(mandat.fullName);
      const publikation = new Date("2026-11-19T00:15:00Z").toUTCString();
      return { type: "application/rss+xml", body: rss(Array.from({ length: person ? 2 : 12 }, (_, i) =>
        item(`${GOOGLE}/rss/articles/fixture-${hash}-${person ? i + 4 : i}`,
          `${person ? mandat.fullName + " zur" : "Beratung zur"} Arbeitsmarktpolitik ${i + 1}`, publikation))) };
    }
    if (url.origin === GOOGLE && url.pathname.startsWith("/rss/articles/fixture-")) {
      const id = url.pathname.split("/").at(-1), i = Number(id.split("-").at(-1));
      if (i < 4) return { body: `<div data-n-a-id="${id}" data-n-a-ts="1795047300" data-n-a-sg="fixture"></div>` };
      return { status: 302, headers: { location: `${VERLAG}/artikel/${id}` }, body: "" };
    }
    if (url.origin === GOOGLE && url.pathname === "/_/DotsSplashUi/data/batchexecute" && methode === "POST")
      return { body: "[]\n\n" };
    if (url.origin === VERLAG && url.pathname.startsWith("/artikel/")) {
      return { body: "<html><head><meta property='og:image' content='https://nachrichten.fixture.invalid/bild.png'></head><body>Synthetischer Artikel.</body></html>" };
    }
    if (url.origin === VERLAG && /^\/feeds\/\d+\.xml$/.test(url.pathname)) {
      if (saubererMorgen) return { type: "application/rss+xml", body: leer };
      if (url.pathname === "/feeds/2.xml" && !vorher && tag === "2026-11-20")
        return { unterbrechen: true, body: leer };
      const anderung = tag === "2026-11-20" ? " – aktualisierte Fassung" : "";
      return { type: "application/rss+xml", body: url.pathname === "/feeds/1.xml"
        ? rss([item(VERLAG + "/artikel/arbeitsmarkt", "Beratung zur Arbeitsmarktpolitik" + anderung, "Thu, 19 Nov 2026 00:30:00 GMT")])
        : leer };
    }
    unbekannt.push(url.origin + url.pathname);
    return { status: 503, body: "Fixture-Ziel fehlt" };
  }
  return { antwort, zaehler, unbekannt, proOriginal, anzahlStoerungen: () => stoerungen };
}

// Nur der Transport wird umgebogen. URL, Status, Header und Byte-Streams bleiben
// für die Produktionsleser sichtbar. DNS und TLS liegen außerhalb dieses Nachweises.
async function transport(uhr, { saubererMorgen = false, stoertag = null, monat = false } = {}) {
  const fixtures = antworten(uhr, saubererMorgen, stoertag, monat);
  const server = http.createServer((req, res) => {
    let daten = "";
    req.on("data", chunk => {
      if (req.headers["x-helmut-fixture-ziel"]?.startsWith(AZURE + "/")) {
        daten += chunk;
        if (daten.length > 1024 * 1024) req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const r = fixtures.antwort(new URL(req.headers["x-helmut-fixture-ziel"]), req.method, daten ? JSON.parse(daten) : null);
        res.writeHead(r.status || 200, { "content-type": r.type || "text/html; charset=utf-8", ...r.headers,
          ...(r.unterbrechen ? { "content-length": Buffer.byteLength(r.body) + 300 } : {}) });
        if (r.unterbrechen) res.write(r.body, () => res.destroy());
        else res.end(r.body);
      } catch {
        fixtures.unbekannt.push("Fixture-Antwortfehler");
        res.destroy();
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const ziel = `http://127.0.0.1:${server.address().port}/`;
  const { request: httpRequest, get: httpGet } = http;
  const { request: httpsRequest, get: httpsGet } = https;
  const fetch = globalThis.fetch;
  function lokal(url) { return url.protocol === "http:" && url.hostname === "127.0.0.1"; }
  function umleiten(args, protokoll, original, get) {
    const [input, weitere, callback] = args;
    const url = input instanceof URL || typeof input === "string" ? new URL(input)
      : new URL(input.path || "/", `${protokoll}//${input.hostname || input.host}:${input.port || (protokoll === "https:" ? 443 : 80)}`);
    if (lokal(url)) return original(...args);
    const options = typeof input === "object" && !(input instanceof URL) ? input :
      typeof weitere === "object" ? weitere : {};
    const req = httpRequest(ziel, { method: options.method, signal: options.signal, timeout: options.timeout,
      headers: { ...options.headers, "x-helmut-fixture-ziel": url.href } },
    [callback, weitere].find(fn => typeof fn === "function"));
    if (get) req.end();
    return req;
  }
  http.request = (...args) => umleiten(args, "http:", httpRequest, false);
  http.get = (...args) => umleiten(args, "http:", httpGet, true);
  https.request = (...args) => umleiten(args, "https:", httpsRequest, false);
  https.get = (...args) => umleiten(args, "https:", httpsGet, true);
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (lokal(url)) return fetch(input, init);
    assert(!(input instanceof Request), "Unerwarteter Fixture-Request");
    const headers = new Headers(init?.headers);
    headers.set("x-helmut-fixture-ziel", url.href);
    return fetch(ziel, { ...init, headers, redirect: "error" });
  };
  async function stoppe() {
    Object.assign(http, { request: httpRequest, get: httpGet });
    Object.assign(https, { request: httpsRequest, get: httpsGet });
    globalThis.fetch = fetch;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  return { ...fixtures, stoppe };
}

module.exports = { mandat, katalog, transport, dipProbe, monatsquellen, monatsfeed, AZURE };
