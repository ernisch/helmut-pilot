"use strict";

// Ausschliesslich im schreibenden globalen Lauf, unter dessen bestehender Sperre.
// Kein Aufrufer aus Server/App, kein eigener Schalter, Job oder Datenbestand.
const D = require("./dedup"), E = require("./quellen-auszug");
const I = require("./quellen-inhaltsversorgung");
const K = require("./vorgangskontext");
const MAX_POOL = 200;
const idOk = id => typeof id === "string" && /^rd-[a-f0-9]{64}$/.test(id);
const { inhaltsauftragAusEnv, hatOriginalinhalt, brauchtInhalt } = E;
// Bestehender PostgREST-Zugang; nur explizite globale Dokumentkennungen, keine
// unbeschraenkte Tabelle/Blobs. Am API-Deckel niemals Vollstaendigkeit behaupten.
async function leseFundstellen(ids, request) {
  if (!Array.isArray(ids) || ids.length > MAX_POOL || ids.some(id => !idOk(id))) throw Error("fundstellen-auftrag-ungueltig");
  const out = [], gesehen = new Set();
  for (let start = 0; start < ids.length; start += 100) {
    const teil = ids.slice(start, start + 100), erlaubt = new Set(teil);
    const rows = await request(`/rest/v1/document_findings?raw_document_id=in.(${teil.join(",")})`
      + "&select=raw_document_id,source_id,retrieval_path_id,original_url,link_type,found_at"
      + "&order=raw_document_id.asc,source_id.asc,original_url.asc&limit=1000");
    if (!Array.isArray(rows) || rows.length >= 1000) throw Error("fundstellen-unvollstaendig");
    for (const row of rows) {
      const key = JSON.stringify([row?.raw_document_id, row?.source_id, row?.original_url]);
      if (!erlaubt.has(row?.raw_document_id) || gesehen.has(key)) throw Error("fundstellen-bindung-abweichend");
      gesehen.add(key); out.push(row);
    }
  }
  return out;
}
function gleicheHerausgeberMetadaten(a, b) {
  if (a.title === b.title && a.source_name === b.source_name) return true;
  for (const [kurz, lang] of [[a, b], [b, a]]) {
    const name = kurz.source_name;
    if (!/^[A-Z0-9]{2,8}$/.test(name || "") || typeof lang.source_name !== "string") continue;
    let host;
    try { const u = new URL(kurz.url); if (u.protocol !== "https:" || u.username || u.password || u.port) continue;
      host = u.hostname.replace(/^www\./, "").split("."); } catch { continue; }
    if (host.length !== 2 || host[0] !== name.toLowerCase()) continue;
    const ende = " | " + name;
    if (!lang.source_name.endsWith(ende)) continue;
    const voll = lang.source_name.slice(0, -ende.length);
    if (voll.length < 5 || voll.includes("|") || voll === name) continue;
    const kurzSuffix = " - " + name + " - " + voll, langSuffix = " - " + voll + ende;
    if (typeof kurz.title !== "string" || typeof lang.title !== "string"
      || !kurz.title.endsWith(kurzSuffix) || !lang.title.endsWith(langSuffix)) continue;
    const rumpf = kurz.title.slice(0, -kurzSuffix.length);
    if (rumpf.trim() && rumpf === lang.title.slice(0, -langSuffix.length)) return true;
  }
  return false;
}
function gleicherStand(input, row) {
  const zeit = (a, b) => (!a && !b) || (Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b));
  return row && row.id === input.id && row.url === input.url
    && row.canonical_url === input.canonical_url && gleicheHerausgeberMetadaten(input, row)
    && zeit(row.published_at, input.published_at);
}
async function vorbereiteGlobaleInhalte({ auftrag, beobachtet, neu, profile, herkuenfte, laufId, deadlineMs,
  persistenzOk, now = Date.now }, deps = {}) {
  if (auftrag?.vorbereitet !== true) return null;
  const speicherMs = require("./verstehen-restzeit").speicherTimeoutMs(deps.beschaffung?.env || process.env);
  const lesezeit = aufrufe => deadlineMs - now() >= aufrufe * speicherMs + 1000;
  const V = require("./profile-validation");
  const aktive = profile.filter(p => p && !V.isDisabled(p) && V.validateProfile(p).usable);
  const aktiveIds = new Set(aktive.map(p => String(p.id)));
  const metadata = new Map(), sicht = new Map(), mehrdeutig = new Set(), rssTexte = new Map();
  for (const item of beobachtet) {
    const row = D.toRawDocumentRow(item); if (!row) continue;
    const vorher = metadata.get(row.id);
    if (vorher && !gleicherStand(vorher, row)) mehrdeutig.add(row.id);
    if (hatOriginalinhalt(row)) {
      const a = rssTexte.get(row.id), b = E.plain(row.summary);
      if (a && !a.startsWith(b) && !b.startsWith(a)) mehrdeutig.add(row.id);
      if (!a || b.length > a.length) rssTexte.set(row.id, b);
    }
    metadata.set(row.id, row);
    const menge = sicht.get(row.id) || new Set();
    for (const id of K.dokumentSichtbarkeit(item, herkuenfte).mandate) if (aktiveIds.has(id)) menge.add(id);
    sicht.set(row.id, menge);
  }
  const bereit = new Map(), ausgabe = new Map(), befund = [];
  // Der Bestands-Crawl verarbeitet auch bereits gespeicherte, noch nicht
  // verstandene RSS-Artikel aus DIESEM Abruf. Vorhandenen gelieferten Text nicht
  // allein wegen saveRawItems-Deduplizierung aus der Modelleingabe entfernen.
  for (const item of [...neu, ...beobachtet]) { const row = D.toRawDocumentRow(item);
    if (row && !brauchtInhalt(row) && sicht.get(row.id)?.size && !mehrdeutig.has(row.id)) {
      const text = E.plain(row.summary), beobachtetText = rssTexte.get(row.id);
      if (beobachtetText && !beobachtetText.startsWith(text) && !text.startsWith(beobachtetText)) {
        mehrdeutig.add(row.id); ausgabe.delete(row.id); continue;
      }
      const vorher = ausgabe.has(row.id) ? D.toRawDocumentRow(ausgabe.get(row.id)) : null;
      if (!vorher || String(row.summary || "").length > String(vorher.summary || "").length) ausgabe.set(row.id, row);
    }
  }
  const kandidatenMenge = [...metadata.values()].filter(row => brauchtInhalt(row) || mehrdeutig.has(row.id));
  const tag = new Date(now()).toISOString().slice(0, 10);
  // EIN Ring vor dem Lesepool; der Dienst behaelt diese Reihenfolge. Keine
  // synchronisierten Teilrotationen, die immer dieselben Teilmengen auslassen.
  const reihenfolge = require("./llm-budget-fair").rotationsReihenfolge(kandidatenMenge.map(r => r.id), tag, I.LIMITS.neueAbrufe);
  const rang = new Map(reihenfolge.map((id, i) => [id, i]));
  const hostErlaubt = row => { try { return auftrag.hosts.includes(new URL(row.url).hostname); } catch { return false; } };
  const kandidaten = kandidatenMenge.sort((a, b) => Number(hostErlaubt(b)) - Number(hostErlaubt(a))
    || rang.get(a.id) - rang.get(b.id));
  const pool = kandidaten.slice(0, MAX_POOL);
  for (const row of kandidaten.slice(MAX_POOL)) befund.push({ id: row.id, status: "vertagt", reason: "lesepoolgrenze" });
  const luecken = reason => { for (const row of pool) befund.push({ id: row.id, status: "luecke", reason }); };
  let grenzen = null;
  // Alle aktuell gebundenen Eingaben behalten den vorhandenen Pendingtraeger,
  // auch jenseits des Lesepools. Sie sind damit noch KEIN gelieferter Inhalt.
  const zeilen = [], offenerBestand = new Map(kandidaten.filter(r => sicht.get(r.id)?.size
    && !mehrdeutig.has(r.id)).map(r => [r.id, r])), extraHerkunft = {};
  const uebernehme = row => {
    // Die historische primaere Quelle der kanonischen Zeile darf die aktuelle
    // Sichtbarkeit nicht erweitern. Ausschliesslich die beobachtete Quellenmenge.
    extraHerkunft[row.id] = [...sicht.get(row.id)];
    ausgabe.set(row.id, row);
  };
  // Zwei Dokumentchunks, ein paralleler Katalogabruf und zwei Fundstellenchunks.
  // Die bestehende Speicherfrist bleibt auch vor der ersten Lesung reserviert.
  if (pool.length && (!persistenzOk || !lesezeit(5))) {
    luecken(persistenzOk ? "restzeit-vor-kanonischer-lesung" : "persistenz-nicht-bestaetigt");
  } else if (pool.length) {
    const storage = require("./storage");
    const leseDokumente = deps.leseDokumente || storage.getRawDocumentsByIds;
    const leseKatalog = deps.leseKatalog || storage.listSourceArchitectureRows;
    const request = deps.request || storage.supabaseRequest;
    try {
      const rows = await leseDokumente(pool.map(r => r.id), { requireArray: true });
      if (!Array.isArray(rows)) throw Error("kanonischer-bestand-ungueltig");
      const byId = new Map();
      for (const row of rows) {
        if (!pool.some(p => p.id === row?.id) || byId.has(row.id)) throw Error("kanonischer-bestand-ungueltig");
        byId.set(row.id, row);
      }
      for (const input of pool) {
        const row = byId.get(input.id);
        if (mehrdeutig.has(input.id)) {
          befund.push({ id: input.id, status: "luecke", reason: "beobachtung-mehrdeutig" });
        } else if (!gleicherStand(input, row)) {
          befund.push({ id: input.id, status: "luecke", reason: row ? "kanonischer-quellenstand-abweichend" : "kanonisches-dokument-fehlt" });
        } else if (!sicht.get(row.id)?.size) {
          befund.push({ id: row.id, status: "luecke", reason: "quellensichtbarkeit-fehlt" });
        } else if (!brauchtInhalt(row)) {
          uebernehme(row); befund.push({ id: row.id, status: "vorhanden", reason: "gespeicherter-quelleninhalt" });
        } else if (row.link_type !== "direct") {
          // Publisher-/Google-Verweise ohne Text sind kein versorgter Artikel.
          // Vorhandenen kanonischen Text oben behalten, sonst keine URL raten.
          befund.push({ id: row.id, status: "luecke", reason: "artikelziel-nicht-bestaetigt" });
          offenerBestand.set(row.id, row);
        } else { zeilen.push(row); offenerBestand.set(row.id, row); }
      }
      if (zeilen.length && lesezeit(3)) {
        const katalog = await leseKatalog();
        if (!katalog || !["packages", "packagePaths", "retrievalPaths"].every(k => Array.isArray(katalog[k]))) throw Error("quellenkatalog-nicht-lesbar");
        const fundstellen = await leseFundstellen(zeilen.map(r => r.id), (...args) => {
          if (!lesezeit(1)) throw Error("restzeit-vor-fundstellenlesung");
          return request(...args);
        });
        // Ein Dienstexemplar fuer den gesamten globalen Lauf, nicht je Mandat,
        // Kontextstapel oder App-Aufruf. Frist stammt aus dessen bestehendem Budget.
        const service = I.erzeugeInhaltsversorgung({ ...auftrag, laufId, deadlineMs }, {
          ...deps.beschaffung, reihenfolgeErhalten: true, now: () => new Date(now()), sichtbareMandate: id => [...(sicht.get(id) || [])]
        });
        const result = await service.versorge(zeilen.map(r => ({ ...r,
          findings: fundstellen.filter(f => f.raw_document_id === r.id) })), aktive, katalog);
        grenzen = result.grenzen;
        befund.push(...result.befund.map(({ id, status, reason }) => ({ id, status, ...(reason ? { reason } : {}) })));
        for (const entry of result.bereit) { bereit.set(entry.document.id, entry); uebernehme(entry.document); }
      } else if (zeilen.length) {
        for (const row of zeilen) befund.push({ id: row.id, status: "vertagt", reason: "restzeit-vor-fundstellenlesung" });
      }
    } catch {
      // Keine Rohfehlermeldungen/URLs in Lauftelemetrie; alle ungelieferten
      // Pooldokumente bleiben ausdruecklich fehlend, niemals Titel-Ersatztext.
      for (const row of pool) if (!befund.some(b => b.id === row.id))
        befund.push({ id: row.id, status: "luecke", reason: "quellenbestand-nicht-pruefbar" });
    }
  }
  // Auch begrenzte/fehlgeschlagene Originalkandidaten behalten den bestehenden
  // Pending-Traeger. Der Callback unten verhindert einen titelreinen Modellweg;
  // ein spaeterer Pendinglauf liest seinen gebundenen Beleg ohne Originalabruf.
  for (const [id, row] of offenerBestand) {
    if (bereit.has(id)) continue;
    if (befund.some(b => b.id === id && ["luecke", "vertagt"].includes(b.status))) uebernehme(row);
  }
  // Auch geliefertes RSS traegt die VEREINIGTE frische Sichtbarkeit. Der
  // Primaereintrag darf weitere beobachtete Wege weder verlieren noch erfinden.
  for (const id of ausgabe.keys()) extraHerkunft[id] = [...(sicht.get(id) || [])].sort();
  const counts = {};
  for (const b of befund) counts[b.status] = (counts[b.status] || 0) + 1;
  return {
    dokumente: [...ausgabe.values()], herkunftJeDokument: extraHerkunft,
    bilanz: { limits: { ...I.LIMITS, lesepool: MAX_POOL }, pool: pool.length, kandidaten: kandidaten.length, eingaben: ausgabe.size, belegt: bereit.size,
      zustaende: counts, ...(grenzen ? { grenzen } : {}) }, befund,
    clusterMitText: cluster => ({ ...cluster, headline: cluster.documents.map(d => d.title || "").join(" "),
      summary: cluster.documents.map(d => bereit.get(d.id)?.beleg.text || d.summary || "").join(" ") }),
    profileFuerCluster: (cluster, liste) => liste.filter(p => cluster.documents.some(d =>
      bereit.has(d.id) ? bereit.get(d.id).mandatIds.includes(p.id) : sicht.get(d.id)?.has(p.id))),
    // Ausschliesslich bereits gebundener Speicherbestand, kein I/O. Diese
    // Kennzeichnung erlaubt dem Understanding-Gate die Pruefung VOR Parkung.
    artikelkontextVersorgung: Object.assign(async (documents, context = {}) => {
      // Nur die tatsaechliche Promptauswahl braucht Belege; Quellen ausserhalb
      // der unveraenderten Zwoelfergrenze duerfen diese nicht blockieren.
      const luecken = documents.filter(brauchtInhalt);
      const entries = luecken.map(d => bereit.get(d.id));
      if (!luecken.length) return { angefordert: false };
      if (entries.some(e => !e)) return { angefordert: true, ok: false, reason: "originalinhalt-fehlt" };
      const results = await Promise.all(entries.map(e => I.artikelVersorgung(e)(documents, context)));
      const fehlend = results.find(r => !r.ok); if (fehlend) return fehlend;
      return results.length === 1 ? results[0] : { angefordert: true, ok: true, belege: results.map(r => r.beleg) };
    }, { nurBestand: true }),
    fortsetzungOffen: befund.some(b => b.status === "vertagt" || ["laufgrenze", "restzeit-vor-abruf",
      "restzeit-vor-beleglesung", "restzeit-vor-fundstellenlesung", "restzeit-vor-kanonischer-lesung"].includes(b.reason))

  };
}
// Derselbe Anschluss fuer bestehende Queueauftraege. Die gespeicherten Fundstellen
// werden gegen den HEUTIGEN Quellenplan aller aktiven Profile gebunden. Weder
// Jobtenant noch primaere source_id ersetzen diese Sichtbarkeitspruefung.
async function vorbereiteGespeicherteInhalte({ auftrag, dokumente, profile, laufId, deadlineMs, now = Date.now }, deps = {}) {
  if (auftrag?.vorbereitet !== true) return null;
  if (!Array.isArray(dokumente) || dokumente.length > MAX_POOL) throw Error("inhaltsversorgung-eingabe-zu-gross");
  const storage = require("./storage");
  const speicherMs = require("./verstehen-restzeit").speicherTimeoutMs(deps.beschaffung?.env || process.env);
  if (deadlineMs - now() < 3 * speicherMs + 1000) throw Error("restzeit-vor-quellenbindung");
  const katalog = await (deps.leseKatalog || storage.listSourceArchitectureRows)();
  if (!katalog || !["packages", "packagePaths", "retrievalPaths"].every(k => Array.isArray(katalog[k])))
    throw Error("quellenkatalog-nicht-lesbar");
  const V = require("./profile-validation");
  const aktive = profile.filter(p => p && !V.isDisabled(p) && V.validateProfile(p).usable);
  const Q = require("./quellenarchitektur/source-mode");
  const plan = Q.buildRelationalCrawlPlan({ ...katalog, profiles: aktive, env: deps.beschaffung?.env || process.env });
  const fundstellen = await leseFundstellen(dokumente.map(d => d.id), deps.request || storage.supabaseRequest);
  const sicht = {};
  for (const p of aktive) {
    const aktuelleQuellen = await (deps.quellenFuerProfil || ((profil, opts) =>
      require("./scheduler").getSourcesForProfile(profil, opts)))(p, { planCache: { plan } });
    const quellen = new Set(aktuelleQuellen.map(q => String(q.id)));
    const wege = new Set(plan.aktiv.filter(a => quellen.has(String(a.source.id))).map(a => a.id));
    for (const d of dokumente) {
      const gefunden = fundstellen.some(f => f.raw_document_id === d.id
        && (f.retrieval_path_id ? wege.has(f.retrieval_path_id) : quellen.has(String(f.source_id))));
      if (gefunden) (sicht[d.id] ||= []).push(String(p.id));
    }
  }
  return vorbereiteGlobaleInhalte({ auftrag, beobachtet: dokumente, neu: dokumente,
    profile: aktive, herkuenfte: { herkunftJeDokument: sicht }, laufId, deadlineMs, now, persistenzOk: true }, {
    ...deps, leseKatalog: async () => katalog,
    leseDokumente: async ids => dokumente.filter(d => ids.includes(d.id)),
    request: async endpoint => {
      const ids = new URL(endpoint, "https://local.invalid").searchParams.get("raw_document_id").slice(4, -1).split(",");
      return fundstellen.filter(f => ids.includes(f.raw_document_id));
    }
  });
}
module.exports = { MAX_POOL, inhaltsauftragAusEnv, hatOriginalinhalt, brauchtInhalt, leseFundstellen, gleicherStand, vorbereiteGlobaleInhalte, vorbereiteGespeicherteInhalte };
