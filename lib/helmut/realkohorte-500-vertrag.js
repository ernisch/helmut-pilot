"use strict";

// Ausschliesslich Offline-Vorbereitung. Kein Client, keine Aktivierung, keine
// Freigabe. Der synthetische null500-v1/v2-Vertrag bleibt unveraendert.
const crypto = require("node:crypto");
const Z = require("./profil-zulassung");
const VERSION = "helmut-realkohorte-500/1";
const PAKET_HASH = "775356e2c464a307a3f5e5c5852394aa5fe033253a4dccbb155131f4e1b21e59";
const IDS_HASH = "28eb5266f5b4372e8c093223190b5f273c5588996bc30b5411dd175ea6094ca9";
const OFFEN = Object.freeze(["qualifizierte-rechtsfreigabe", "aktivierungs-go", "500er-test-go",
  "endweg-datenbankabnahme", "endwaechter-live-nachweis"]);
const VERTEILUNG = Object.freeze({ bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
const fordere = (ok, code) => { if (!ok) throw new Error("real500-" + code); };
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
function stabil(value) {
  if (Array.isArray(value)) return "[" + value.map(stabil).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort()
    .map(k => JSON.stringify(k) + ":" + stabil(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
const hash = value => sha(stabil(value));
const exakt = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).sort().join("|") === [...keys].sort().join("|");
const zeit = value => typeof value === "string" && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const sortiere = (rows, key) => [...rows].sort((a, b) => a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
const fachzeilen = rows => rows.map(({ aktiv, updated_at, ...row }) => row);

function pruefePaket(bytes) {
  fordere(Buffer.isBuffer(bytes) || typeof bytes === "string", "paket-fehlt");
  const p = JSON.parse(String(bytes));
  fordere(p.version === "helmut-mandatsprofil/1" && Array.isArray(p.profile) && p.profile.length === 500,
    "paket-version-menge");
  const n = {};
  for (const row of p.profile) {
    Z.fordereZulassung(row); // aktuelle Partei UND Fraktion, auch fraktionslos
    // Vier kanonische Faelle haben amtlich belegte Parteilosigkeit bzw.
    // Fraktionslosigkeit. Der feste PaketHash bindet gerade diese Feldbelege.
    fordere(row.aktiv === false, "paket-zulassung-nullzustand");
    n[row.parlament] = (n[row.parlament] || 0) + 1;
  }
  fordere(hash(n) === hash(VERTEILUNG), "paket-verteilung");
  const ids = p.profile.map(row => row.mandatsId).sort();
  fordere(ids.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(id))
    && new Set(ids).size === 500 && hash(ids) === IDS_HASH, "paket-ids-drift");
  fordere(sha(bytes) === PAKET_HASH, "paket-hash-drift");
  return { ids, profile: p.profile };
}

function pruefeNullbestand(s, ids, paketProfile) {
  fordere(exakt(s, ["beobachtetAm", "mandate_profiles", "profiles"]) && zeit(s.beobachtetAm), "nullbestand-format");
  fordere(Array.isArray(s.mandate_profiles) && s.mandate_profiles.length === 500
    && Array.isArray(s.profiles) && s.profiles.length === 501, "nullbestand-menge");
  const mandate = sortiere(s.mandate_profiles, "user_id"), profiles = sortiere(s.profiles, "id");
  fordere(mandate.every(row => row.aktiv === false && row.geloescht_at === null)
    && hash(mandate.map(row => row.user_id)) === hash(ids), "nullbestand-id-aktiv-drift");
  const pids = profiles.map(row => row.id);
  fordere(pids.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(id))
    && new Set(pids).size === 501 && ids.every(id => pids.includes(id)), "nullbestand-identitaeten");
  fordere(Array.isArray(paketProfile) && paketProfile.length === 500, "nullbestand-paketbindung");
  const erwartet = new Map(paketProfile.map(row => [row.mandatsId, row]));
  mandate.forEach(row => {
    Z.fordereZulassung(row);
    const p = erwartet.get(row.user_id);
    // Abbildung wie profil-import -> storage.toMandateProfileRow. Fehlende
    // Partei ist nur fuer genau die belegten parteilosen IDs erlaubt.
    fordere(p && row.partei === (p.partei || null)
      && row.fraktion === (p.fraktion || (p.fraktionslos === true ? "Fraktionslos" : p.partei || null)),
    "nullbestand-zulassung");
  });
  const fremd = profiles.filter(row => !ids.includes(row.id));
  return { beobachtetAm: s.beobachtetAm, mandateHash: hash(mandate), mandateFachHash: hash(fachzeilen(mandate)),
    profilesHash: hash(profiles), fremdId: fremd[0].id, fremdHash: hash(fremd), mandate: 500, profiles: 501, aktiv: 0 };
}

function pruefeKosten(k, vorflugAm, endeAm, auftragslimits = [7000000]) {
  // Nur die bestehenden Betreibergrenzen; kein beliebiger Laufparameter.
  fordere(Array.isArray(auftragslimits) && auftragslimits.length > 0
    && auftragslimits.every(n => [7000000, 20000000].includes(n)), "kosten-grenzen");
  fordere(exakt(k, ["tag", "beobachtetAm", "tageslimitMikroUsd", "auftragslimitMikroUsd",
    "tagVerbrauchtMikroUsd", "tagReserviertMikroUsd", "auftragVerbrauchtMikroUsd", "auftragReserviertMikroUsd",
    "restreserveMikroUsd", "laufreserveMikroUsd"]), "kosten-format");
  const fields = Object.keys(k).filter(key => key.endsWith("MikroUsd"));
  fordere(fields.every(key => Number.isSafeInteger(k[key]) && k[key] >= 0)
    && k.tageslimitMikroUsd === 6000000 && auftragslimits.includes(k.auftragslimitMikroUsd), "kosten-grenzen");
  fordere(zeit(k.beobachtetAm) && k.tag === vorflugAm.slice(0, 10) && k.tag === endeAm.slice(0, 10)
    && Date.parse(k.beobachtetAm) <= Date.parse(vorflugAm)
    && Date.parse(vorflugAm) - Date.parse(k.beobachtetAm) <= 60000, "kosten-zeit");
  fordere(k.auftragVerbrauchtMikroUsd >= k.tagVerbrauchtMikroUsd
    && k.auftragReserviertMikroUsd >= k.tagReserviertMikroUsd, "kosten-inkonsistent");
  const rest = Math.min(k.tageslimitMikroUsd - k.tagVerbrauchtMikroUsd - k.tagReserviertMikroUsd,
    k.auftragslimitMikroUsd - k.auftragVerbrauchtMikroUsd - k.auftragReserviertMikroUsd);
  fordere(rest >= 0 && k.restreserveMikroUsd === rest && k.laufreserveMikroUsd > 0
    && k.laufreserveMikroUsd <= rest, "kosten-restreserve");
}

function pruefeManifest(m, paketBytes, snapshot) {
  const paket = pruefePaket(paketBytes);
  fordere(exakt(m, ["version", "operationId", "paketHash", "idsHash", "ids", "verteilung", "profilnullzustand",
    "vorflugAm", "startBis", "endeAm", "kosten", "zustand", "offen"]), "manifest-format");
  fordere(m.version === VERSION && /^real500-[a-zA-Z0-9_-]{8,100}$/.test(m.operationId || "")
    && m.paketHash === PAKET_HASH && m.idsHash === IDS_HASH && hash(m.ids) === IDS_HASH
    && hash(m.ids) === hash(paket.ids) && hash(m.verteilung) === hash(VERTEILUNG), "manifest-bindung");
  fordere(m.zustand === "inaktiv-vorbereitung" && hash(m.offen) === hash(OFFEN), "manifest-keine-freigabe");
  fordere([m.vorflugAm, m.startBis, m.endeAm].every(zeit)
    && Date.parse(m.startBis) > Date.parse(m.vorflugAm)
    && Date.parse(m.startBis) - Date.parse(m.vorflugAm) <= 300000
    && Date.parse(m.endeAm) > Date.parse(m.startBis)
    && Date.parse(m.endeAm) - Date.parse(m.vorflugAm) <= 86400000, "zeitfenster");
  const nullzustand = pruefeNullbestand(snapshot, m.ids, paket.profile);
  fordere(hash(m.profilnullzustand) === hash(nullzustand)
    && Date.parse(nullzustand.beobachtetAm) <= Date.parse(m.vorflugAm)
    && Date.parse(m.vorflugAm) - Date.parse(nullzustand.beobachtetAm) <= 60000, "nullbestand-bindung-zeit");
  pruefeKosten(m.kosten, m.vorflugAm, m.endeAm);
  return m;
}

function vorbereiten({ paketBytes, snapshot, operationId, vorflugAm, startBis, endeAm, kosten }) {
  const { ids, profile } = pruefePaket(paketBytes);
  return pruefeManifest({ version: VERSION, operationId, paketHash: PAKET_HASH, idsHash: IDS_HASH, ids,
    verteilung: { ...VERTEILUNG }, profilnullzustand: pruefeNullbestand(snapshot, ids, profile),
    vorflugAm, startBis, endeAm, kosten, zustand: "inaktiv-vorbereitung", offen: [...OFFEN] }, paketBytes, snapshot);
}

function pruefeEndquittung(q, manifest) {
  fordere(exakt(q, ["version", "operationId", "manifest", "zustand", "aktiviertAm", "bestaetigtAktiv"])
    && q.version === VERSION && q.operationId === manifest.operationId && hash(q.manifest) === hash(manifest)
    && q.zustand === "aktiv" && q.bestaetigtAktiv === 500 && zeit(q.aktiviertAm)
    && Date.parse(q.aktiviertAm) >= Date.parse(manifest.vorflugAm)
    && Date.parse(q.aktiviertAm) < Date.parse(manifest.startBis), "endquittung-bindung");
  return q;
}

module.exports = { VERSION, PAKET_HASH, IDS_HASH, OFFEN, VERTEILUNG, fordere, hash, stabil, zeit,
  sortiere, fachzeilen, pruefePaket, pruefeNullbestand, pruefeKosten, pruefeManifest, vorbereiten, pruefeEndquittung };
