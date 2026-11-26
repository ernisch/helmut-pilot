"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { toRawDocumentRow } = require("../../lib/helmut/dedup");
const { standHash } = require("../../lib/helmut/roh-quellenstaende");
const { hash } = require("../../lib/helmut/quellen-lektuerebeleg");
const artikelStatus = require("../../lib/helmut/artikel-verarbeitungszustand");
const { einzelArtikelAuftrag, setzePlanungFort } = require("../../lib/helmut/scalable-pipeline");
const { fristen } = require("../../lib/helmut/quellen-faelligkeit");
const budget = require("../../lib/helmut/betriebskosten-budget");
const D = require("../../lib/helmut/source-demand");

const TAG = 86400000;
const START = Date.parse("2026-11-24T00:00:00Z");
const tage = Array.from({ length: 30 }, (_, i) => new Date(START + i * TAG).toISOString().slice(0, 10));
const stoertage = ["2026-11-27", "2026-11-28", "2026-12-10", "2026-12-11"];
const keinZiel = "kein-bestaetigtes-artikelziel";
const titelAbweichend = "artikeltitel-abweichend";
const bereichFehlt = "artikelbereich-mehrdeutig-oder-fehlend";
const artikelAbseits = [
  [keinZiel, 804, 61, 16], [titelAbweichend, 24, 2, 1],
  ["strukturierter-artikel-mehrdeutig-oder-fehlend", 17], ["artikelmetadaten-mehrdeutig-oder-fehlend", 12],
  [bereichFehlt, 9, 1, 1], ["artikeldatum-abweichend", 1]
];
const terminal = [
  ["profil", 869, "betriebskosten-profilbindung-abweichend"],
  ["versionsdiagnose", 120, "artikel-eingangsfehler: quellenstand-versionskonflikt"],
  ["wartezeit", 88, "verstehen-uebersprungen-dauerhaft: zeitbudget"],
  ["metadaten", 55, "quellenstand-metadatenabweichung"],
  ["sonstiger-eingang", 19, "artikel-eingangsfehler: quellenstand-nicht-bestaetigt"],
  ["vorgaengerstatus", 9, "artikel-vorgaengerstatus-nicht-bestaetigt"],
  ["cas-unbekannt", 1, "modellausgang-unbekannt: cas"]
];
const json = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const iso = ms => new Date(ms).toISOString();
const vor = iso(START - 6*TAG);
const stunde = ms => iso(ms).slice(0,13) + "Z";
const gruppen = [
  ...terminal.map(([art, n, error]) => ({ name: "terminal-" + art, n, error, terminal: true })),
  ...artikelAbseits.flatMap(([abseits, anzahl, erneut, wieder2]) => [
    { name: "terminal-artikel-abseits-" + abseits, n: anzahl, error: "artikel-abseits: " + abseits, terminal: true, abseits },
    ...(erneut ? [{ name: "alt-artikel-abseits-" + abseits, n: erneut, error: "artikel-abseits: " + abseits,
      abseits, wieder: 1, wieder2 }] : [])
  ]),
  { name: "profil-wieder", n: 738, error: "betriebskosten-profilbindung-abweichend", wieder: 1, wieder2: 14 },
  ...[["datum",74,15],["titel",44,8],["herausgeber",20,4]].map(([art,n,wieder2]) => ({name:"diagnose-" + art, n,
    error:"artikel-eingangsfehler: quellenstand-versionskonflikt", wieder: 1, wieder2, max: 1 })),
  { name: "ausgang-wieder", n: 2, error: "modellausgang-unbekannt: quellenbeleg-parteien", wieder: 1, max: 1 },
  { name: "ausgang-wartend", n: 1, error: "modellausgang-unbekannt: quellenbeleg-parteien", mitVersuch: 1 },
  { name: "analyse-fortsetzung", n: 88, error: "zurueckgestellt: verstehen-uebersprungen: verstehen-fortsetzung" },
  { name: "analyse-budget", n: 61, error: "zurueckgestellt: verstehen-uebersprungen: budget-nicht-verfuegbar", mitVersuch: 2 },
  { name: "alt-wartefrist", n: 18, error: "verstehen-uebersprungen-dauerhaft: artikelkontext-zeitbudget seit 122 h", wieder: 1, wieder2: 1 },
  { name: "analyse-tagesbetrieb", n: 10, error: "zurueckgestellt: analyse-wartet-auf-tagesbetrieb", aktuell: 1, mitVersuch: 1 },
  { name: "analyse-quellenstand", n: 4, error: "artikel-eingangsfehler: quellenstand-nicht-bestaetigt", mitVersuch: 4 },
  { name: "alt-operatorbindung", n: 2, error: "payload-ungueltig: wiederaufnahme", wieder: 1, max: 1 },
  { name: "alt-artikelpruefung", n: 2, error: "artikel-pruefung-fehlgeschlagen", wieder: 1 },
  { name: "analyse-wartefrist", n: 1, error: "verstehen-uebersprungen-dauerhaft: zeitbudget seit 122 h", mitVersuch: 1 },
  { name: "analyse-metadaten", n: 1, error: "quellenstand-metadatenabweichung", mitVersuch: 1 },
  { name: "analyse-ohne-fehler", n: 66, error: null, aktuell: 27 }
];

function analyseZeile(gruppe, i, amtlich) {
  const terminal = gruppe.terminal === true;
  const diagnose = gruppe.name.startsWith("diagnose-") || gruppe.name === "terminal-versionsdiagnose";
  const wieder = i < (gruppe.wieder2 ?? 0) ? 2 : gruppe.wieder ?? 0;
  const datum = amtlich ? iso(START-3*3600000) : i < (gruppe.aktuell ?? 0) ? iso(START) : vor;
  const publisher = gruppe.abseits === keinZiel;
  const archiv = amtlich || toRawDocumentRow({
    url: publisher ? null : "https://nachrichten.fixture.invalid/archiv/" + gruppe.name + "/" + i,
    linkType: publisher ? "publisher" : "direct",
    title:"Synthetischer Bericht zur Arbeitsmarktpolitik " + gruppe.name + " " + i,
    summary: gruppe.abseits ? null : "Eine synthetische Meldung dokumentiert die Beratung im Testmandat.",
    sourceName:"Prüfverlag", sourceId:"pruefverlag",
    publishedAt: vor, retrievedAt: vor });
  const beobachtet = { ...archiv };
  if (gruppe.name === "diagnose-datum") beobachtet.published_at = iso(START - 5*TAG);
  if (gruppe.name === "diagnose-titel") beobachtet.title += " – andere Überschrift";
  if (gruppe.name === "diagnose-herausgeber") beobachtet.source_name = "Anderer Prüfverlag";
  const stand = standHash(archiv);
  const job = einzelArtikelAuftrag({ id: archiv.id, stand, fenster: stunde(Date.parse(datum)), priority: amtlich ? 35 : 80 });
  if (diagnose) { job.idempotencyKey += "|eingangsfehler|versionskonflikt"; job.payload.artikelFehler = "quellenstand-versionskonflikt"; }
  if (gruppe.name === "analyse-quellenstand") job.payload.artikelFehler = "quellenstand-nicht-bestaetigt";
  if (gruppe.name === "alt-operatorbindung") {
    job.idempotencyKey += "|begrenzt-" + i;
    job.payload.wiederaufnahme = { vorgangId: "vg-synthetische-altbindung-" + i, bisMs: START - TAG };
  }
  if (gruppe.abseits) {
    const beleg = publisher ? { art: "gebundener-publisherverweis" } : {
      art: "bestaetigter-extraktionsfehler", schluessel: hash([archiv.id, "extraktion"]),
      negativHash: hash([archiv.id, gruppe.abseits]), ...(gruppe.abseits === bereichFehlt ? { gepruefteRevision: 2 } : {})
    };
    const basis = { version: 1, zustand: "abseits", dokumentId: archiv.id, artikelVersion: stand, grund: gruppe.abseits, beleg };
    job.payload.artikelVerarbeitungszustand = { ...basis, zustandsHash: hash(basis) };
    assert(artikelStatus.lese(job.payload.artikelVerarbeitungszustand, job.payload));
  }
  const max = gruppe.max ?? (diagnose ? 1 : 3);
  const zeile = { gruppe:gruppe.name, raw:archiv, beobachtet:standHash(beobachtet), stand, amtlich:Boolean(amtlich),
    key:job.idempotencyKey, typ:job.jobType, payload:job.payload, fenster:job.freshnessWindow,
    gesehen:gruppe.name === "profil-wieder" && i < 2 ? stunde(START) : null, faellig:datum, zuerst:datum,
    fehler:wieder ? `wiedervorlage ${wieder} nach: ${gruppe.error}` : gruppe.error,
    status:terminal ? "fehlgeschlagen" : "wartend", priority:job.priority, max,
    versuche:terminal ? max : i < (gruppe.mitVersuch ?? 0) ? 1 : 0, wieder,
    ende:amtlich ? iso(START-3600000) : terminal ? iso(START-TAG) : null };
  if ((amtlich && gruppe.name === "terminal-wartezeit") || gruppe.name === "terminal-cas-unbekannt") {
    const identity = require("../../lib/helmut/vorgang-identity");
    zeile.vorgang = identity.deriveVorgangId(identity.clusterRawDocuments([archiv])[0]);
    zeile.eingabeHash = require("../../lib/helmut/verstehen-vertrag").eingabeHash({
      vorgangId: zeile.vorgang, dokumente: [archiv], modus: "erst"
    });
  }
  return zeile;
}

function speichere(db, zeilen) {
  // Der separate Fixture-Namensraum bleibt für PostgREST unsichtbar.
  for (let i=0; i<zeilen.length; i+=60) {
    const batch = json(zeilen.slice(i,i+60));
    db.psql(`with d as (select value v from jsonb_array_elements(${batch})),
      cas as (insert into public.helmut_verstehen_reservierungen
        (vorgang_id,eingabe_hash,zustand,fencing,versuche,ki_aufrufe,letzter_grund)
        select v->>'vorgang',v->>'eingabeHash','unbekannt',1,1,1,'quellenbeleg-parteien' from d where v ? 'vorgang'),
      jobs as (insert into public.helmut_jobs(job_type,idempotency_key,freshness_window,last_seen_window,
        due_at,first_due_at,created_at,priority,status,payload,attempts,max_attempts,wiedervorlagen,last_error,finished_at)
        select v->>'typ',v->>'key',v->>'fenster',v->>'gesehen',(v->>'faellig')::timestamptz,(v->>'zuerst')::timestamptz,
        (v->>'zuerst')::timestamptz,(v->>'priority')::smallint,v->>'status',v->'payload',(v->>'versuche')::int,
        (v->>'max')::int,(v->>'wieder')::int,v->>'fehler',(v->>'ende')::timestamptz from d returning id,idempotency_key),
      roh as (insert into public.raw_documents(id,canonical_url,content_hash,title,summary,url,source_name,source_id,source_type,
        published_at,retrieved_at,raw,confidence,document_type,wahlperiode,link_type)
        select x.id,x.canonical_url,x.content_hash,x.title,x.summary,x.url,x.source_name,x.source_id,x.source_type,
        x.published_at,x.retrieved_at,x.raw,x.confidence,x.document_type,x.wahlperiode,x.link_type from d
        cross join lateral jsonb_populate_record(null::public.raw_documents, v->'raw') x where v ? 'raw'),
      archiv as (insert into public.helmut_store(id,data) select
        'main-rohstand-'||substr(v->'raw'->>'id',4)||'-'||(v->>'stand'),
        jsonb_build_object('version',1,'quellenHash',v->>'stand','dokument',v->'raw') from d where v ? 'raw')
      insert into helmut_monat.startbestand(id,gruppe,startstatus,fehler,amtlich,archivhash,beobachtet,vorgang)
      select j.id,v->>'gruppe',v->>'status',v->>'fehler',coalesce((v->>'amtlich')::boolean,false),v->>'stand',
        v->>'beobachtet', v->>'vorgang' from d join jobs j on j.idempotency_key = v->>'key';`);
  }
}

async function startbestand(db, profil, fixture) {
  const datum = tage[0];
  const scheduler = require("../../lib/helmut/scheduler");
  const cache = {};
  const plan = await D.kompiliereQuellenbedarf({ profile:[profil], jetztMs:START - TAG,
    quellenFuerProfil:p => scheduler.getSourcesForProfile(p,{planCache:cache}) });
  const crawler = require("../../lib/helmut/crawler");
  const amtlich = fixture.monatsquellen().flatMap(quelle => {
    const aktiverWeg = plan.auftraege.find(j => j.payload?.quelle?.id === quelle.id)?.payload.quelle;
    assert(aktiverWeg && D.amtlicheMorgenPrioritaet(aktiverWeg), "Amtlicher Planweg fehlt: " + quelle.id);
    return crawler.parseRssItems(fixture.monatsfeed(quelle,datum))
      .map(entry => toRawDocumentRow(crawler.normalizeRawItem(entry,aktiverWeg)));
  });
  assert.equal(new Set(amtlich.map(d => d.id)).size, 3);
  db.psql("create schema helmut_monat; create table helmut_monat.startbestand(id uuid primary key, gruppe text not null,startstatus text not null,fehler text,amtlich boolean,archivhash text,beobachtet text,vorgang text);");
  for (const g of gruppen) {
    speichere(db, Array.from({length:g.n}, (_,i) => analyseZeile(g,i,
      g.name === "terminal-metadaten" && i<2 ? amtlich[i] : g.name === "terminal-wartezeit" && i===0 ? amtlich[2] : null)));
  }
  const geteilt = plan.auftraege.filter(j => j.payload.art === "geteilt");
  const rss = geteilt.filter(j => j.payload.quelle.crawlMethod === "rss" && j.payload.quelle.retrievalPathId?.startsWith("rp-fixture-rss-"));
  const googleRss = geteilt.filter(j => /^https:\/\/news\.google\.com\//.test(j.payload.quelle.url));
  assert(rss.length >= 4 && googleRss.length > 1 && geteilt.length > 100, "Synthetischer Katalog für alte Abrufe fehlt");
  const abrufe = [];
  const heutigeUrls = new Set(cache.plan.aktiv.map(weg => weg.url));
  const googleKatalogUrls = [...heutigeUrls].filter(url => /^https:\/\/news\.google\.com\//.test(url));
  assert(googleKatalogUrls.length > 1, "Google-URLs im synthetischen Katalog fehlen");
  const altabgleich = { imKatalog:0, gleicherPlanweg:0, gleichePlanUrl:0, quellenkennungImPlan:0, ohneAbrufweg:0, google:0 };
  for (const [gruppe, n, quelle] of [["rss-alt",469,rss],["abruf-vertagt",122,geteilt],["abruf-sonstige",146,geteilt],["abruf-terminal",1,rss]]) {
    for (let i=0;i<n;i++) {
      const vorlagen = gruppe === "rss-alt" && i >= 4 ? googleRss : quelle;
      const vorbild = structuredClone(vorlagen[i % vorlagen.length]);
      const zeit = START - (2 + Math.floor(i/vorlagen.length))*TAG - (["rss-alt","abruf-vertagt","abruf-sonstige","abruf-terminal"].indexOf(gruppe)*3600000);
      const fenster = stunde(zeit - (gruppe === "rss-alt" ? i % vorlagen.length * 3600000 : 0));
      let key = vorbild.idempotencyKey.replace(/\|[^|]+$/, "|" + fenster);
      if (gruppe === "rss-alt") {
        const q = vorbild.payload.quelle;
        const aktuelleQuelle = vorlagen[i % vorlagen.length].payload.quelle;
        const katalogUrl = googleKatalogUrls[i % googleKatalogUrls.length];
        const andereKatalogUrl = katalogUrl === aktuelleQuelle.url
          ? googleKatalogUrls[(i + 1) % googleKatalogUrls.length] : katalogUrl;
        const alteUrl = i < 4 ? aktuelleQuelle.url : i < 428 ? andereKatalogUrl
          : "https://news.google.com/rss/search?q=veralteter-synthetischer-abruf-" + i;
        delete q.retrievalPathId;
        q.url = q.rssUrl = alteUrl;
        const variante = new URL(alteUrl);
        variante.searchParams.set("alte-variante", String(i));
        q.rssUrls = [alteUrl, variante.href];
        if (heutigeUrls.has(alteUrl)) altabgleich.imKatalog++;
        if (q.retrievalPathId && aktuelleQuelle.retrievalPathId === q.retrievalPathId) altabgleich.gleicherPlanweg++;
        if (aktuelleQuelle.url === q.url) altabgleich.gleichePlanUrl++;
        if (aktuelleQuelle.id === q.id) altabgleich.quellenkennungImPlan++;
        if (!q.retrievalPathId) altabgleich.ohneAbrufweg++;
        if (new URL(q.url).hostname === "news.google.com") altabgleich.google++;
        key = "source_fetch|geteilt|" + createHash("sha256").update(D.abrufwege(q).map(D.kanonischeUrl).join("\n")).digest("hex").slice(0,32) + "|" + fenster;
      }
      const zuerst = gruppe === "abruf-sonstige" && i<3 ? iso(START) : iso(zeit);
      const faellig = gruppe === "abruf-vertagt" || (gruppe === "abruf-sonstige" && i<6) ? iso(START) : iso(START+18*3600000);
      vorbild.payload.faelligkeit = fristen(vorbild,zuerst);
      abrufe.push({gruppe,key,typ:"source_fetch",payload:vorbild.payload,fenster,faellig,zuerst,priority:100,
        fehler:gruppe==="rss-alt" ? "quellenbedarf-nicht-mehr-bestaetigt" : gruppe==="abruf-vertagt" ? "zurueckgestellt: anbietergrenze: anbietergrenze-minutengrenze" : null,
        status:gruppe==="abruf-terminal" ? "fehlgeschlagen":"wartend",max:5,versuche:gruppe==="abruf-terminal"?5:0,
        ende:gruppe==="abruf-terminal"?vor:null,wieder:0});
    }
  }
  assert.equal(new Set(abrufe.map(a=>a.key)).size,abrufe.length,"Doppelte synthetische Abrufschlüssel");
  assert.deepEqual(altabgleich,{imKatalog:428, gleicherPlanweg:0, gleichePlanUrl:4, quellenkennungImPlan:469, ohneAbrufweg:469, google:465});
  speichere(db,abrufe);
  const stand = bilanz(db);
  assert.equal(stand.start,3962);
  assert.equal(stand.terminal,2029);
  assert.equal(stand.amtlich,3);
  assert.equal(Number(db.psql("select count(*) from public.helmut_jobs where job_type='source_fetch' and status='wartend' and due_at<=now()")),128);
  return { ...stand, altabgleich };
}

function bilanz(db) {
  return JSON.parse(db.psql(`select jsonb_build_object('unerlaubteAltabschluesse',(select count(*) from helmut_monat.startbestand b
      join public.helmut_jobs j using(id) where b.gruppe='rss-alt' and j.status='erledigt'), 'casGeschuetzt',(select count(*) from helmut_monat.startbestand b
      join public.helmut_verstehen_reservierungen c on c.vorgang_id=b.vorgang
      where c.zustand='unbekannt' and c.ki_aufrufe=1 and c.versuche=1 and c.fencing=1),
    'unbelegteWiederholungen',(select count(*) from helmut_monat.startbestand b join public.helmut_jobs z using(id)
      where b.gruppe like 'terminal-%' and (z.status<>'fehlgeschlagen' or z.last_error is distinct from b.fehler)),
    'start',count(*),'terminal',count(*) filter(where b.startstatus='fehlgeschlagen'),
    'amtlich',count(*) filter(where b.amtlich), 'gruppen',(select jsonb_agg(to_jsonb(x) order by gruppe,status) from
    (select gruppe,coalesce(j.status,'bereinigt') status,count(*) n from helmut_monat.startbestand b
    left join public.helmut_jobs j using(id) group by 1,2) x)) from helmut_monat.startbestand b`));
}

async function parken(db) {
  const sql = readFileSync(path.resolve(__dirname,"../ops/quellen-altbestand-20261126.sql"),"utf8");
  const ausfuehren = variablen => {
    const inhalt = Object.entries(variablen).map(([name,wert])=>{
      assert(/^[a-z0-9-]+$/.test(String(wert))); return "\\set " + name + " " + wert;
    }).join("\n") + "\n" + sql;
    return JSON.parse(db.psql(inhalt).split("\n").at(-1));
  };
  const geplant = await setzePlanungFort({ jetztMs:START, planungsDeadlineMs:START+60000, darfNeuPlanen:true, ganztags:true });
  assert(geplant.ok !== false, "Echter Tagesplan nicht bestätigt");
  const { erzeugePlanungsrest } = require("../../lib/helmut/quellen-planungsrest");
  const plan = await erzeugePlanungsrest({ request: db.storage.supabaseRequest, storeId: "main" }).lesen(tage[0]);
  assert.equal(plan?.zustand, "fertig");
  const bericht=[];
  for(const [klasse,anzahl] of [["diagnose",138],["profil",736],["modellausgang",2]]) {
    const v=ausfuehren({modus:"vorschau",klasse});
    assert.equal(v.anzahl,anzahl);
    const r=ausfuehren({modus:"parken",klasse,anzahl,tag:v.tag,digest:v.vorDigest,plan_digest:v.planDigest});
    assert.equal(r.anzahl,anzahl);
    bericht.push({klasse,anzahl,vorDigest:v.vorDigest,nachDigest:r.nachDigest});
  }
  return bericht;
}

function alteBuchungen(db) {
  return JSON.parse(db.psql(`select jsonb_build_object('hash', encode(sha256(convert_to(
    coalesce(jsonb_object_agg(id,c),'{}'::jsonb)::text,'UTF8')),'hex'),
    'offen',count(*) filter(where c->>'status' = 'ungeklaert'))
    from public.helmut_store s cross join lateral jsonb_each(s.data->'${budget.KEY}'->'calls') as x(id,c)
    where s.id='main-auth' and c->>'day' < '${tage[0]}';`));
}

function betriebskostenVorwert(db) {
  const contract = budget.vertrag();
  const gebunden = 9038227;
  const maxOutputTokens = 3000;
  const reserved = budget.kosten(400000, maxOutputTokens);
  const calls = {};
  let offen = 5;
  let abgerechnetRest = gebunden - offen * reserved;
  for (let index = 0; offen || abgerechnetRest; index++) {
    const id = `synthetische-altbuchung-${index}`;
    const day = iso(START - (1 + Math.floor(index / 4)) * TAG).slice(0, 10);
    const cost = Math.min(reserved, abgerechnetRest);
    calls[id] = { id, day, createdAt: day + "T12:00:00.000Z", model: contract.route.model, maxOutputTokens, reserved,
      requestHash: hash(id), contractHash: contract.contractHash,
      ...(offen > 0 ? { status: "ungeklaert" } : { status: "abgerechnet", cost, usageReceiptId: `beleg-${id}` }) };
    if (offen > 0) offen--;
    else abgerechnetRest -= cost;
  }
  const buch = { version: 1, contractHash: contract.contractHash, contract, bound: gebunden, calls, frozen: null };
  assert.equal(budget.pruefeBuch(buch, contract).total, gebunden);
  db.psql(`update public.helmut_store set data=jsonb_set(data,'{${budget.KEY}}',${json(buch)}) where id='main-auth';`);
  const alt = alteBuchungen(db);
  assert.equal(alt.offen, 5);
  return { gebunden, ...alt };
}

function tagesbeleg(db, tag, vorwert) {
  const q=JSON.parse(db.psql(`select jsonb_build_object('aufrufe', (select coalesce(max(used),0) from public.llm_budget_counters where day='${tag}' and scope='global'),
    'gesamt', (data->'${budget.KEY}'->>'bound')::bigint,
    'heute', (select coalesce(sum(case when c->>'status' in ('abgerechnet','nicht-gesendet') then (c->>'cost')::bigint else (c->>'reserved')::bigint end),0)
    from jsonb_each(data->'${budget.KEY}'->'calls') as x(id,c) where c->>'day'='${tag}'),
    'ungeklaert', (select count(*) from jsonb_each(data->'${budget.KEY}'->'calls') as x(id,c)
    where c->>'status' in ('reserviert','ungeklaert') and c->>'day'='${tag}'))
    from public.helmut_store where id='main-auth'`));
  assert(Number.isSafeInteger(q.gesamt) && q.gesamt>=0 && q.gesamt<=30000000 && q.heute>=0 && q.heute<=1000000,"Betriebsbuchgrenze");
  assert(Number.isSafeInteger(q.aufrufe) && q.aufrufe <= 100, "Modellaufrufzahl");
  const altbuch = alteBuchungen(db);
  assert.deepEqual(altbuch, { hash: vorwert.hash, offen: vorwert.offen }, "Historische Kostenbelege oder Reserven verändert");
  assert(q.gesamt >= vorwert.gebunden, "Historische Bindung fehlt im Gesamtkontingent");
  const bestand = bilanz(db);
  assert.equal(bestand.unerlaubteAltabschluesse, 0, "Historische RSS-Definition ohne aktuellen Weg abgeschlossen");
  assert.equal(bestand.casGeschuetzt, 2, "Historische CAS-Ausgänge verändert");
  assert.equal(bestand.unbelegteWiederholungen, 0, "Historische Terminalentscheidung verändert");
  const rueckstand = JSON.parse(db.psql(`select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from (
    select j.job_type, count(*) as offen,
      count(*) filter (where j.due_at <= now()) as faellig,
      count(*) filter (where s.id is null and j.first_due_at < '${tag}'::date and j.due_at <= now()) as "neuerAltbestand"
    from public.helmut_jobs j left join helmut_monat.startbestand s on s.id=j.id
    where j.status in ('wartend','laeuft') group by j.job_type order by j.job_type
  ) b`));
  return { ...q, altbuch, bestand, rueckstand };
}
module.exports = { tage, stoertage, startbestand, parken, betriebskostenVorwert, tagesbeleg };
