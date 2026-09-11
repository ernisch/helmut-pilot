"use strict";

// Enger interner Writervertrag: ein synthetisches Profil, ein Berliner Tag,
// eine Neuanlage. Kein HTTP-Eingang, keine Aktivierung, keine Modellarbeit.
const { hash } = require("./briefing-speicher");
const Q = require("./briefing-aussagenbindung");
const F = require("./briefing-fachurteil");
const { berlinTagKey } = require("./briefing-frische");
const fordere = (b, grund) => { if (!b) throw new Error(grund); };
const keys = (v, fields) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));

function pruefeUrteil(result, urteil) {
  const fields = ["version", "eingabeHash", "aussagen", "gesamtpruefung"];
  fordere(keys(urteil, fields.concat(urteil?.korrektur ? ["korrektur"]
    : ["ursprungHash", "ausgelasseneVorgaenge"])), "urteilsimport-payload-ungueltig");
  fordere(Q.pruefe(result.eingabe, urteil).bereit, "urteilsimport-einzelurteil-abgelehnt");
  for (const r of urteil.aussagen) {
    const a = result.eingabe.aussagen.find(a => a.pfad === r.pfad);
    const required = ["pfad", "text", "sachlichGetragen", "kontextGetragen", "mandatsbezugGetragen", "begruendung"];
    const optional = ["art", "vorgangId", "belege", "ausgabeBeleg"];
    fordere(Object.keys(r).every(k => required.includes(k) || optional.includes(k))
      && required.every(k => Object.hasOwn(r, k))
      && (!Object.hasOwn(r, "art") || r.art === a.art)
      && (!Object.hasOwn(r, "vorgangId") || r.vorgangId === a.vorgangId)
      && (r.belege || []).every(b => keys(b, ["vorgangId", "documentId", "feld", "text"]))
      && (a.art !== "ausgabe" || !r.belege?.length), "urteilsimport-aussagenfelder-abweichend");
  }
  fordere(F.pruefe(result, urteil).bereit, "urteilsimport-gesamturteil-abgelehnt");
}

function pruefeZeile(entry, result, { gelesen = false } = {}) {
  const p = entry?.payload;
  const fields = ["id", "user_id", "slot", "generated_at", "payload"];
  if (gelesen && Object.hasOwn(entry || {}, "created_at")) fields.push("created_at");
  fordere(keys(entry, fields)
    && require("./testkohorte-betrieb").istKohortenKennung(entry.user_id)
    && entry.slot === Q.SLOT && keys(p, ["urteil", "importbeleg"]), "urteilsimport-zeile-ungueltig");
  const b = p.importbeleg;
  fordere(keys(b, ["version", "tag", "productionCommit", "freigabeHash", "urteilHash", "kontextHash"])
    && b.version === 1 && /^\d{4}-\d{2}-\d{2}$/.test(b.tag)
    && /^[a-f0-9]{40}$/.test(b.productionCommit)
    && [b.freigabeHash, b.urteilHash, b.kontextHash].every(h => /^[a-f0-9]{64}$/.test(h))
    && entry.id === `bf-${entry.user_id}-${Q.SLOT}-${b.tag}`
    && Number.isFinite(Date.parse(entry.generated_at))
    && berlinTagKey(new Date(entry.generated_at)) === b.tag
    && result?.eingabe?.mandat === entry.user_id && result.eingabe.tag === b.tag
    && b.urteilHash === hash(p.urteil), "urteilsimport-bindung-abweichend");
  pruefeUrteil(result, p.urteil);
}

async function ausfuehren({ userId, urteil, freigabe, storage = require("./storage"),
  leseKontext, build, pruefeBetrieb, now = () => new Date() }) {
  let versucht = false, gespeichert = false, row = null;
  const report = () => ({ schreibversuche: Number(versucht), gespeichert,
    verwendbar: false, zustandUnbekannt: versucht && !gespeichert,
    modellaufrufe: 0, funktionsnachweis500: false, vollstaendigeFaktenpruefung: false });
  try {
    urteil = structuredClone(urteil);
    freigabe = structuredClone(freigabe);
    fordere(typeof leseKontext === "function" && typeof build === "function"
      && typeof pruefeBetrieb === "function", "urteilsimport-betriebspruefung-fehlt");
    storage.assertTenant(userId, "briefingUrteilsimport");
    fordere(require("./testkohorte-betrieb").istKohortenKennung(userId), "urteilsimport-nur-synthetisch");
    fordere(keys(freigabe, ["version", "userId", "tag", "productionCommit", "urteilHash",
      "eingabeHash", "kontextHash", "maxNeuanlagen", "modellaufrufe", "gueltigBis"])
      && freigabe.version === 1 && freigabe.userId === userId && freigabe.maxNeuanlagen === 1
      && freigabe.modellaufrufe === 0 && freigabe.urteilHash === hash(urteil)
      && freigabe.eingabeHash === urteil?.eingabeHash
      && /^[a-f0-9]{40}$/.test(freigabe.productionCommit || "")
      && /^[a-f0-9]{64}$/.test(freigabe.kontextHash || ""), "urteilsimport-freigabe-abweichend");
    // Der Aufrufer liefert den unabhaengigen Betriebsvorflug. Jede Pruefung
    // MUSS werfen, wenn Steuerung, Production, Kosten oder Parallelitaet offen ist.
    const frisch = async () => {
      const zeit = now();
      fordere(berlinTagKey(zeit) === freigabe.tag && zeit.getTime() < Date.parse(freigabe.gueltigBis),
        "urteilsimport-zeit-abweichend");
      await pruefeBetrieb(freigabe.productionCommit);
      const c = await leseKontext(userId);
      fordere(c?.profile?.id === userId && c.identitaet?.id === userId
        && c.mandat?.user_id === userId && c.mandat.geloescht_at === null
        && typeof c.mandat.aktiv === "boolean" && hash(c) === freigabe.kontextHash,
      "urteilsimport-kontext-abweichend");
      const original = await build(c.profile, userId, { aussagenEingabe: true, now: zeit });
      let result;
      if (urteil.korrektur) {
        fordere(urteil.korrektur.ursprungHash === original.eingabe.eingabeHash,
          "urteilsimport-ursprung-abweichend");
        result = await build(c.profile, userId, { aussagenEingabe: true, now: zeit,
          aussagenKorrektur: urteil.korrektur });
      } else {
        const ids = Q.auslassungen(original.eingabe, urteil);
        result = ids.length ? await build(c.profile, userId, { aussagenEingabe: true,
          now: zeit, aussagenAuslassungen: ids }) : original;
      }
      pruefeUrteil(result, urteil);
      fordere(result.eingabe.eingabeHash === freigabe.eingabeHash, "urteilsimport-eingabe-abweichend");
      fordere(hash(await leseKontext(userId)) === freigabe.kontextHash
        && berlinTagKey(now()) === freigabe.tag && now().getTime() < Date.parse(freigabe.gueltigBis),
      "urteilsimport-kontext-abweichend");
      return { result, profile: c.profile };
    };
    await frisch();
    const existing = await storage.getRenderedBriefingV3(userId, Q.SLOT, freigabe.tag, { strict: true });
    if (existing) return { ...report(), grund: "vorhandenes-urteil-geschuetzt" };
    const { result } = await frisch();
    row = { id: `bf-${userId}-${Q.SLOT}-${freigabe.tag}`, user_id: userId, slot: Q.SLOT,
      generated_at: now().toISOString(), payload: { urteil: structuredClone(urteil), importbeleg: {
        version: 1, tag: freigabe.tag, productionCommit: freigabe.productionCommit,
        freigabeHash: hash(freigabe), urteilHash: hash(urteil), kontextHash: freigabe.kontextHash } } };
    pruefeZeile(row, result);
    versucht = true;
    let ack, schreibFehler;
    try { ack = await storage.insertBriefingFachurteil(row, { result }); }
    catch (e) { schreibFehler = e; /* Kein Retry, ausschliesslich Ruecklesung. */ }
    const after = await storage.getRenderedBriefingV3(userId, Q.SLOT, freigabe.tag, { strict: true });
    if (!after) return { ...report(), grund: "urteilsimport-schreibausgang-unklar" };
    fordere(after.id === row.id && after.user_id === userId && after.slot === row.slot
      && Date.parse(after.generated_at) === Date.parse(row.generated_at) && hash(after.payload) === hash(row.payload),
    "urteilsimport-ruecklesung-abweichend");
    gespeichert = true;
    if (ack?.saved === false) return { ...report(), zustandUnbekannt: false,
      grund: "vorhandenes-urteil-geschuetzt" };
    if (schreibFehler?.message?.startsWith("urteilsimport-schreibquittung-"))
      return { ...report(), zustandUnbekannt: false, grund: schreibFehler.message };
    const final = await frisch();
    const reader = await Q.leseFuerNachlauf({ profile: final.profile, userId, build, storage, now: now() });
    fordere(reader.bereit === true && reader.eingabeHash === freigabe.eingabeHash,
      "urteilsimport-leser-abweichend");
    fordere(hash(await leseKontext(userId)) === freigabe.kontextHash
      && berlinTagKey(now()) === freigabe.tag && now().getTime() < Date.parse(freigabe.gueltigBis),
    "urteilsimport-kontext-abweichend");
    return { ...report(), verwendbar: true, zustandUnbekannt: false,
      grund: ack?.saved === true ? null : "durch-ruecklesung-bestaetigt", id: row.id };
  } catch (e) {
    return { ...report(), grund: /^urteilsimport-|^briefing-/.test(e?.message || "")
      ? e.message : "urteilsimport-betrieb-oder-transport-abgebrochen" };
  }
}

module.exports = { pruefeUrteil, pruefeZeile, ausfuehren };
