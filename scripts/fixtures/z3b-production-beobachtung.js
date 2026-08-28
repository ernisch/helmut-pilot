"use strict";

// Strenger, rein lokaler Vertrag fuer bereits erhobene Production Beobachtungswerte.
// Dieses Modul liest weder Netz noch Datenbank und kann deshalb nur Form, Vollstaendigkeit
// und innere Konsistenz eines Berichts pruefen. Ob die Werte wirklich aus Production
// stammen, muss ausserhalb dieses Validators anhand der genannten Rohbelege bestaetigt
// werden. Das Ergebnis behauptet diese externe Herkunft niemals.

const SCHEMA = "z3b-production-beobachtung/v1";
const ART = "Z3b strenger Production Beobachtungsbericht";
const TAGE_EXAKT = 7;
const TAG_MS = 24 * 60 * 60 * 1000;
const SLOT_BUDGET_MS = 290000;
const SLOT_STOP_MS = 280000;
const SLOT_RESERVE_ANTEIL = 0.25;
const SLOT_P95_GRENZE_MS = Math.floor(SLOT_BUDGET_MS * (1 - SLOT_RESERVE_ANTEIL));
const SLOTS_PRO_TAG_MIN = 20;
const ZAEHLER_MAX = 1_000_000_000;
const STUFEN = Object.freeze([5, 10, 25, 50, 100, 200, 500]);
const EREIGNISTRANSPORTE = Object.freeze(["selbstweck", "sqs", "vercel-queues", "externer-worker"]);
const GROSSE_TRANSPORTE = Object.freeze(["sqs", "vercel-queues", "externer-worker"]);

const SHA256_RE = /^[a-f0-9]{64}$/;
const GIT_SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const KENNUNG_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;
const SLOT_ID_RE = /^[a-z0-9][a-z0-9._:-]{1,63}$/;
const DEPLOYMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

function objekt(wert, name) {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) {
    throw new Error(`${name} fehlt oder ist kein Objekt`);
  }
  return wert;
}

function nurSchluessel(wert, erlaubt, name) {
  const o = objekt(wert, name);
  const fremd = Object.keys(o).filter((schluessel) => !erlaubt.includes(schluessel));
  const fehlt = erlaubt.filter((schluessel) => !(schluessel in o));
  if (fremd.length) throw new Error(`${name} enthaelt unbekannte Felder: ${fremd.join(", ")}`);
  if (fehlt.length) throw new Error(`${name} fehlt: ${fehlt.join(", ")}`);
  return o;
}

function text(wert, name, muster) {
  if (typeof wert !== "string" || !muster.test(wert)) throw new Error(`${name} ist nicht gueltig`);
  return wert;
}

function sha256(wert, name) {
  return text(wert, name, SHA256_RE);
}

function boolean(wert, name) {
  if (typeof wert !== "boolean") throw new Error(`${name} muss ein explizites Boolean sein`);
  return wert;
}

function ganzeZahl(wert, name, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(wert) || wert < minimum || wert > maximum) {
    throw new Error(`${name} muss eine sichere ganze Zahl zwischen ${minimum} und ${maximum} sein`);
  }
  return wert;
}

function sichereSumme(werte, name) {
  const summe = werte.reduce((gesamt, wert) => gesamt + wert, 0);
  if (!Number.isSafeInteger(summe)) throw new Error(`${name} ist keine sichere Ganzzahlsumme`);
  return summe;
}

function endlicheZahl(wert, name, { minimum = 0 } = {}) {
  if (!Number.isFinite(wert) || wert < minimum) throw new Error(`${name} ist keine gueltige Zahl`);
  return wert;
}

function utcTag(wert, name) {
  if (typeof wert !== "string") throw new Error(`${name} ist kein UTC Kalenderdatum`);
  const tag = wert;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) throw new Error(`${name} ist kein UTC Kalenderdatum`);
  const zeit = Date.parse(`${tag}T00:00:00.000Z`);
  if (!Number.isFinite(zeit) || new Date(zeit).toISOString().slice(0, 10) !== tag) {
    throw new Error(`${name} ist kein gueltiges UTC Kalenderdatum`);
  }
  return Object.freeze({ tag, zeit });
}

function isoZeit(wert, name) {
  if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(wert)) {
    throw new Error(`${name} ist kein UTC Zeitpunkt`);
  }
  const zeit = Date.parse(wert);
  if (!Number.isFinite(zeit)) throw new Error(`${name} ist kein gueltiger UTC Zeitpunkt`);
  return Object.freeze({ text: wert, zeit });
}

function eindeutigeTexte(wert, name, muster, { minimum = 1 } = {}) {
  if (!Array.isArray(wert) || wert.length < minimum) throw new Error(`${name} ist nicht vollstaendig`);
  const liste = wert.map((eintrag, index) => text(eintrag, `${name}[${index}]`, muster));
  if (new Set(liste).size !== liste.length) throw new Error(`${name} enthaelt Dubletten`);
  return Object.freeze(liste);
}

function gleicheMenge(links, rechts) {
  if (links.length !== rechts.length) return false;
  const a = [...links].sort();
  const b = [...rechts].sort();
  return a.every((wert, index) => wert === b[index]);
}

function p95NaechsterRang(werte) {
  const sortiert = [...werte].sort((a, b) => a - b);
  return sortiert[Math.max(0, Math.ceil(sortiert.length * 0.95) - 1)];
}

function stabileEigenschaft(tage, feld, name) {
  const erster = tage[0][feld];
  if (tage.some((tag) => tag[feld] !== erster)) throw new Error(`${name} wechselte im Beobachtungsfenster`);
  return erster;
}

function pruefeZaehler(wert, tagName) {
  const z = nurSchluessel(wert, [
    "offenAnfang", "ankunft", "abfluss", "offenEnde", "endgueltigeFehler",
    "unbekannt", "dubletten", "haengendeLeases", "briefingFehlt", "kiDeckelErreicht"
  ], `${tagName} Zaehler`);
  const ergebnis = {};
  for (const feld of ["offenAnfang", "ankunft", "abfluss", "offenEnde", "endgueltigeFehler",
    "unbekannt", "dubletten", "haengendeLeases", "briefingFehlt"]) {
    ergebnis[feld] = ganzeZahl(z[feld], `${tagName} ${feld}`, { maximum: ZAEHLER_MAX });
  }
  ergebnis.kiDeckelErreicht = boolean(z.kiDeckelErreicht, `${tagName} kiDeckelErreicht`);
  const linkeBilanz = sichereSumme(
    [ergebnis.offenAnfang, ergebnis.ankunft],
    `${tagName} Bilanzsumme Anfang und Ankunft`
  );
  const rechteBilanz = sichereSumme(
    [ergebnis.abfluss, ergebnis.offenEnde],
    `${tagName} Bilanzsumme Abfluss und Ende`
  );
  if (linkeBilanz !== rechteBilanz) {
    throw new Error(`${tagName} Bilanz ist nicht Anfang plus Ankunft gleich Abfluss plus Ende`);
  }
  return Object.freeze(ergebnis);
}

function pruefeSlots(wert, erwarteteSlotIds, tagName) {
  if (!Array.isArray(wert) || wert.length !== erwarteteSlotIds.length) {
    throw new Error(`${tagName} enthaelt nicht exakt alle erwarteten Slots`);
  }
  const slots = wert.map((eintrag, index) => {
    const s = nurSchluessel(eintrag,
      ["slotId", "runId", "dauerMs", "ausloeser", "natuerlich", "vollstaendig"],
      `${tagName} Slot ${index + 1}`);
    return Object.freeze({
      slotId: text(s.slotId, `${tagName} Slot ID`, SLOT_ID_RE),
      runId: text(s.runId, `${tagName} Slot Run ID`, KENNUNG_RE),
      dauerMs: ganzeZahl(s.dauerMs, `${tagName} Slot Dauer`, { minimum: 1 }),
      ausloeser: s.ausloeser,
      natuerlich: boolean(s.natuerlich, `${tagName} Slot natuerlich`),
      vollstaendig: boolean(s.vollstaendig, `${tagName} Slot vollstaendig`)
    });
  });
  const ids = slots.map((slot) => slot.slotId);
  if (new Set(ids).size !== ids.length || !gleicheMenge(ids, erwarteteSlotIds)) {
    throw new Error(`${tagName} Slot IDs sind nicht vollstaendig und eindeutig`);
  }
  const runIds = slots.map((slot) => slot.runId);
  if (new Set(runIds).size !== runIds.length) throw new Error(`${tagName} Slot Run IDs enthalten Dubletten`);
  const dauern = slots.map((slot) => slot.dauerMs);
  const p95Ms = p95NaechsterRang(dauern);
  const maxMs = Math.max(...dauern);
  return Object.freeze({
    slots: Object.freeze(slots),
    runIds: Object.freeze(runIds),
    p95Ms,
    maxMs,
    budgetMs: SLOT_BUDGET_MS,
    stopMs: SLOT_STOP_MS,
    reserveAnteil: SLOT_RESERVE_ANTEIL,
    p95GrenzeMs: SLOT_P95_GRENZE_MS
  });
}

function pruefeWeckquittungen(wert, slots, transport, tagName) {
  if (!Array.isArray(wert) || wert.length !== slots.length) {
    throw new Error(`${tagName} braucht exakt eine Weckquittung je Slot`);
  }
  const slotNachId = new Map(slots.map((slot) => [slot.slotId, slot]));
  const quittungen = wert.map((eintrag, index) => {
    const q = nurSchluessel(eintrag, [
      "quittungId", "slotId", "ausloeserRunId", "weckRunId", "transport",
      "natuerlich", "vollstaendig", "angenommen", "verarbeitet", "doppelt"
    ], `${tagName} Weckquittung ${index + 1}`);
    const slotId = text(q.slotId, `${tagName} Weckquittung Slot ID`, SLOT_ID_RE);
    const slot = slotNachId.get(slotId);
    if (!slot) throw new Error(`${tagName} Weckquittung verweist auf unbekannten Slot`);
    const ausloeserRunId = text(q.ausloeserRunId, `${tagName} Weckquittung Ausloeser`, KENNUNG_RE);
    if (ausloeserRunId !== slot.runId) {
      throw new Error(`${tagName} Weckquittung ist nicht an den Slot Run gebunden`);
    }
    if (q.transport !== transport) throw new Error(`${tagName} Weckquittung hat den falschen Transport`);
    return Object.freeze({
      quittungId: text(q.quittungId, `${tagName} Weckquittung ID`, KENNUNG_RE),
      slotId,
      ausloeserRunId,
      weckRunId: text(q.weckRunId, `${tagName} Weck Run ID`, KENNUNG_RE),
      transport: q.transport,
      natuerlich: boolean(q.natuerlich, `${tagName} Weckquittung natuerlich`),
      vollstaendig: boolean(q.vollstaendig, `${tagName} Weckquittung vollstaendig`),
      angenommen: boolean(q.angenommen, `${tagName} Weckquittung angenommen`),
      verarbeitet: boolean(q.verarbeitet, `${tagName} Weckquittung verarbeitet`),
      doppelt: boolean(q.doppelt, `${tagName} Weckquittung doppelt`)
    });
  });
  const quittungIds = quittungen.map((q) => q.quittungId);
  const weckRunIds = quittungen.map((q) => q.weckRunId);
  const quittierteSlotIds = quittungen.map((q) => q.slotId);
  if (new Set(quittungIds).size !== quittungIds.length) throw new Error(`${tagName} Weckquittungs IDs enthalten Dubletten`);
  if (new Set(weckRunIds).size !== weckRunIds.length) throw new Error(`${tagName} Weck Run IDs enthalten Dubletten`);
  if (new Set(quittierteSlotIds).size !== quittierteSlotIds.length
      || !gleicheMenge(quittierteSlotIds, slots.map((slot) => slot.slotId))) {
    throw new Error(`${tagName} Weckquittungen sind nicht bijektiv an die Slots gebunden`);
  }
  return Object.freeze({ quittungen: Object.freeze(quittungen), weckRunIds: Object.freeze(weckRunIds) });
}

function pruefeTag(wert, { erwarteteSlotIds, transport, stufe, erwartetesDatum }) {
  const name = `Tag ${erwartetesDatum.tag}`;
  const t = nurSchluessel(wert, [
    "datumUtc", "vonUtc", "bisUtcExklusiv", "vollstaendig", "natuerlich",
    "aktiveMandate", "aktiveMandatsmengenSha256", "gitSha", "deployment",
    "migrationenSha256", "konfigurationSha256", "rohwerteSha256", "runIds",
    "zaehler", "aeltesterOffenerStunden", "slots", "weckquittungen"
  ], name);
  const datum = utcTag(t.datumUtc, `${name} Datum`);
  if (datum.tag !== erwartetesDatum.tag) throw new Error(`${name} steht nicht an der erwarteten UTC Position`);
  const von = isoZeit(t.vonUtc, `${name} vonUtc`);
  const bis = isoZeit(t.bisUtcExklusiv, `${name} bisUtcExklusiv`);
  if (von.zeit !== datum.zeit || bis.zeit !== datum.zeit + TAG_MS) {
    throw new Error(`${name} ist kein exakter vollstaendiger UTC Kalendertag`);
  }
  const aktiveMandate = ganzeZahl(t.aktiveMandate, `${name} aktive Mandate`, { minimum: 1 });
  if (aktiveMandate !== stufe) throw new Error(`${name} wechselte die aktive Mandatsstufe`);
  const zaehler = pruefeZaehler(t.zaehler, name);
  let alter = t.aeltesterOffenerStunden;
  if (zaehler.offenEnde === 0) {
    if (alter !== null) throw new Error(`${name} Alter darf bei Endbestand null nur null sein`);
  } else {
    if (alter === null) throw new Error(`${name} Alter darf nur bei Endbestand null null sein`);
    alter = endlicheZahl(alter, `${name} aeltester offener Auftrag`);
  }
  const slotPruefung = pruefeSlots(t.slots, erwarteteSlotIds, name);
  const weckPruefung = pruefeWeckquittungen(t.weckquittungen, slotPruefung.slots, transport, name);
  const runIds = eindeutigeTexte(t.runIds, `${name} Run IDs`, KENNUNG_RE);
  const erwarteteRunIds = [...slotPruefung.runIds, ...weckPruefung.weckRunIds];
  if (!gleicheMenge(runIds, erwarteteRunIds)) {
    throw new Error(`${name} Run IDs stimmen nicht exakt mit Slots und Weckquittungen ueberein`);
  }
  return Object.freeze({
    datumUtc: datum.tag,
    vonUtc: von.text,
    bisUtcExklusiv: bis.text,
    vollstaendig: boolean(t.vollstaendig, `${name} vollstaendig`),
    natuerlich: boolean(t.natuerlich, `${name} natuerlich`),
    aktiveMandate,
    aktiveMandatsmengenSha256: sha256(t.aktiveMandatsmengenSha256, `${name} Mandatsmengensignatur`),
    gitSha: text(t.gitSha, `${name} Git SHA`, GIT_SHA_RE),
    deployment: text(t.deployment, `${name} Deployment`, DEPLOYMENT_RE),
    migrationenSha256: sha256(t.migrationenSha256, `${name} Migrationen SHA256`),
    konfigurationSha256: sha256(t.konfigurationSha256, `${name} Konfiguration SHA256`),
    rohwerteSha256: sha256(t.rohwerteSha256, `${name} Rohwerte SHA256`),
    runIds,
    zaehler,
    aeltesterOffenerStunden: alter,
    slotPruefung,
    weckquittungen: weckPruefung.quittungen
  });
}

function gruendeFuerTag(tag) {
  const gruende = [];
  if (!tag.vollstaendig) gruende.push("UTC Kalendertag ist nicht vollstaendig");
  if (!tag.natuerlich) gruende.push("Kalendertag ist nicht natuerlich beobachtet");
  if (tag.zaehler.abfluss < tag.zaehler.ankunft) gruende.push("Abfluss ist kleiner als Ankunft");
  if (tag.zaehler.endgueltigeFehler !== 0) gruende.push("endgueltige Fehler");
  if (tag.zaehler.unbekannt !== 0) gruende.push("unbekannte Auftraege");
  if (tag.zaehler.dubletten !== 0) gruende.push("Dubletten");
  if (tag.zaehler.haengendeLeases !== 0) gruende.push("haengende Leases");
  if (tag.zaehler.briefingFehlt !== 0) gruende.push("fehlende Briefings");
  if (tag.zaehler.kiDeckelErreicht) gruende.push("KI Deckel erreicht");
  if (tag.aeltesterOffenerStunden !== null && tag.aeltesterOffenerStunden >= 24) {
    gruende.push("offene Arbeit mindestens 24 Stunden alt");
  }
  if (tag.slotPruefung.p95Ms > SLOT_P95_GRENZE_MS) gruende.push("Slot p95 hat keine 25 Prozent Reserve");
  if (tag.slotPruefung.maxMs > SLOT_STOP_MS) gruende.push("Slot Maximum ueberschreitet 280 Sekunden");
  if (tag.slotPruefung.slots.some((slot) => slot.ausloeser !== "cron" || !slot.natuerlich || !slot.vollstaendig)) {
    gruende.push("Slots sind nicht vollstaendig natuerlich ausgeloest");
  }
  if (tag.weckquittungen.some((q) => !q.natuerlich || !q.vollstaendig
      || !q.angenommen || !q.verarbeitet || q.doppelt)) {
    gruende.push("Weckquittungen sind nicht vollstaendig und eindeutig verarbeitet");
  }
  return Object.freeze(gruende);
}

function pruefeProduktionsBeobachtung(bericht, {
  jetzt = new Date(),
  heuteUtc = new Date(jetzt).toISOString().slice(0, 10),
  vertrauenswuerdigeSlotIds
} = {}) {
  const b = nurSchluessel(bericht, [
    "schema", "art", "production", "synthetisch", "simulation", "hochrechnung",
    "erhobenUtc", "aktiveStufe", "erwarteteSlotIds", "ereignistransport", "tage"
  ], "Production Beobachtungsbericht");
  if (b.schema !== SCHEMA || b.art !== ART) throw new Error("Production Beobachtungsbericht hat den falschen Vertrag");
  if (boolean(b.production, "production") !== true
      || boolean(b.synthetisch, "synthetisch") !== false
      || boolean(b.simulation, "simulation") !== false
      || boolean(b.hochrechnung, "hochrechnung") !== false) {
    throw new Error("Production Beobachtungsbericht ist nicht als natuerlicher Bericht deklariert");
  }
  const jetztZeit = jetzt instanceof Date ? jetzt.getTime() : Date.parse(jetzt);
  if (!Number.isFinite(jetztZeit)) throw new Error("jetzt ist kein gueltiger Zeitpunkt");
  const heute = utcTag(heuteUtc, "heuteUtc");
  if (new Date(jetztZeit).toISOString().slice(0, 10) !== heute.tag) {
    throw new Error("heuteUtc stimmt nicht mit jetzt ueberein");
  }
  const erhoben = isoZeit(b.erhobenUtc, "erhobenUtc");
  if (erhoben.zeit > jetztZeit) throw new Error("Bericht wurde in der Zukunft erhoben");
  if (erhoben.zeit < heute.zeit) throw new Error("Bericht ist nicht nach Abschluss des Siebentagefensters erhoben");
  const stufe = ganzeZahl(b.aktiveStufe, "aktive Stufe", { minimum: 1 });
  if (!STUFEN.includes(stufe)) throw new Error("aktive Stufe ist nicht erlaubt");
  const erwarteteSlotIds = eindeutigeTexte(b.erwarteteSlotIds, "im Bericht erwartete Slot IDs", SLOT_ID_RE);
  const gebundeneSlotIds = vertrauenswuerdigeSlotIds === undefined
    ? null
    : eindeutigeTexte(vertrauenswuerdigeSlotIds, "vertrauenswuerdige Slot IDs", SLOT_ID_RE);
  if (gebundeneSlotIds && !gleicheMenge(erwarteteSlotIds, gebundeneSlotIds)) {
    throw new Error("selbst deklarierte Slot IDs stimmen nicht mit dem vertrauenswuerdigen Slotplan ueberein");
  }
  if (gebundeneSlotIds && gebundeneSlotIds.length < SLOTS_PRO_TAG_MIN) {
    throw new Error(`vertrauenswuerdiger Slotplan braucht fuer diesen Vertrag mindestens ${SLOTS_PRO_TAG_MIN} Slots je Tag`);
  }
  const transport = typeof b.ereignistransport === "string" ? b.ereignistransport : "";
  if (!EREIGNISTRANSPORTE.includes(transport)) throw new Error("Ereignistransport ist nicht belegt oder kein Ereignistransport");
  if (!Array.isArray(b.tage) || b.tage.length !== TAGE_EXAKT) {
    throw new Error(`Production Beobachtung braucht exakt ${TAGE_EXAKT} Tage`);
  }
  const ersterTagZeit = heute.zeit - TAGE_EXAKT * TAG_MS;
  const tage = b.tage.map((tag, index) => pruefeTag(tag, {
    erwarteteSlotIds,
    transport,
    stufe,
    erwartetesDatum: utcTag(new Date(ersterTagZeit + index * TAG_MS).toISOString().slice(0, 10), `erwarteter Tag ${index + 1}`)
  }));
  if (tage[tage.length - 1].bisUtcExklusiv !== `${heute.tag}T00:00:00.000Z`) {
    throw new Error("Beobachtungsfenster endet nicht unmittelbar vor dem laufenden UTC Tag");
  }
  for (let index = 1; index < tage.length; index += 1) {
    if (tage[index - 1].zaehler.offenEnde !== tage[index].zaehler.offenAnfang) {
      throw new Error("Tagesendbestand stimmt nicht mit dem Anfangsbestand des Folgetags ueberein");
    }
  }
  const aktiveMandatsmengenSha256 = stabileEigenschaft(tage,
    "aktiveMandatsmengenSha256", "aktive Mandatsmenge");
  const gitSha = stabileEigenschaft(tage, "gitSha", "Git SHA");
  const deployment = stabileEigenschaft(tage, "deployment", "Deployment");
  const migrationenSha256 = stabileEigenschaft(tage, "migrationenSha256", "Migrationsstand");
  const konfigurationSha256 = stabileEigenschaft(tage, "konfigurationSha256", "Konfiguration");
  const rohHashes = tage.map((tag) => tag.rohwerteSha256);
  if (new Set(rohHashes).size !== rohHashes.length) {
    throw new Error("Rohwerte SHA256 wurden zwischen Beobachtungstagen wiederverwendet");
  }
  const alleRunIds = tage.flatMap((tag) => tag.runIds);
  if (new Set(alleRunIds).size !== alleRunIds.length) {
    throw new Error("Run IDs wurden zwischen Beobachtungstagen wiederverwendet");
  }
  const alleQuittungIds = tage.flatMap((tag) => tag.weckquittungen.map((q) => q.quittungId));
  if (new Set(alleQuittungIds).size !== alleQuittungIds.length) {
    throw new Error("Weckquittungs IDs wurden zwischen Beobachtungstagen wiederverwendet");
  }
  const tagesErgebnisse = tage.map((tag) => Object.freeze({
    datumUtc: tag.datumUtc,
    bestanden: gruendeFuerTag(tag).length === 0,
    gruende: gruendeFuerTag(tag),
    p95Ms: tag.slotPruefung.p95Ms,
    maxMs: tag.slotPruefung.maxMs,
    slots: tag.slotPruefung.slots.length,
    weckquittungen: tag.weckquittungen.length
  }));
  const gruende = tagesErgebnisse.flatMap((tag) => tag.gruende.map((grund) => `${tag.datumUtc}: ${grund}`));
  if (!gebundeneSlotIds) {
    gruende.push("vertrauenswuerdiger Slotplan wurde nicht separat eingebunden");
  }
  const internBestanden = gruende.length === 0;
  return Object.freeze({
    art: "Z3b Production Beobachtungspruefung",
    schema: SCHEMA,
    status: internBestanden ? "intern-gruen-externe-herkunft-offen" : "intern-rot",
    strukturGueltig: true,
    interneKonsistenzBewiesen: true,
    kriterienInternBestanden: internBestanden,
    externeHerkunftBewiesen: false,
    productionHerkunftBewiesen: false,
    productionBewiesen: false,
    beweisgrenze: "Der Offline Validator beweist keine externe Production Herkunft. Rohwerte, Run IDs und Hashes muessen getrennt gegen unveraenderliche Quellsystembelege bestaetigt werden.",
    aktiveStufe: stufe,
    tage: TAGE_EXAKT,
    vonDatumUtc: tage[0].datumUtc,
    bisDatumUtc: tage[tage.length - 1].datumUtc,
    ereignistransport: transport,
    erwarteteSlotIds,
    slotplanSeparatEingebunden: gebundeneSlotIds !== null,
    aktiveMandatsmengenSha256,
    gitSha,
    deployment,
    migrationenSha256,
    konfigurationSha256,
    rohwerteSha256: Object.freeze(rohHashes),
    runIds: Object.freeze(alleRunIds),
    tagesErgebnisse: Object.freeze(tagesErgebnisse),
    gruende: Object.freeze(gruende)
  });
}

function pruefeTerminales500Tor(bericht, optionen = {}) {
  const beobachtung = pruefeProduktionsBeobachtung(bericht, optionen);
  if (beobachtung.aktiveStufe !== 500) {
    throw new Error("Terminales 500er Tor braucht sieben Tage mit exakt 500 aktiven Mandaten");
  }
  const gruende = [...beobachtung.gruende];
  if (!GROSSE_TRANSPORTE.includes(beobachtung.ereignistransport)) {
    gruende.push("500er Production Betrieb braucht einen grossen Ereignistransport statt Selbstweck");
  }
  const internBestanden = beobachtung.kriterienInternBestanden && gruende.length === 0;
  return Object.freeze({
    art: "Z3b terminales 500er Production Tor",
    zielMandate: 500,
    status: internBestanden ? "intern-gruen-externe-herkunft-offen" : "nicht-bestanden",
    strukturUndKonsistenzInternBestanden: internBestanden,
    externeHerkunftBewiesen: false,
    productionBewiesen: false,
    aufnahmebeweis500Vollstaendig: false,
    beweisgrenze: beobachtung.beweisgrenze,
    beobachtung,
    gruende: Object.freeze(gruende)
  });
}

module.exports = {
  SCHEMA,
  ART,
  TAGE_EXAKT,
  SLOT_BUDGET_MS,
  SLOT_STOP_MS,
  SLOT_RESERVE_ANTEIL,
  SLOT_P95_GRENZE_MS,
  SLOTS_PRO_TAG_MIN,
  ZAEHLER_MAX,
  STUFEN,
  EREIGNISTRANSPORTE,
  GROSSE_TRANSPORTE,
  p95NaechsterRang,
  pruefeProduktionsBeobachtung,
  pruefeTerminales500Tor
};
