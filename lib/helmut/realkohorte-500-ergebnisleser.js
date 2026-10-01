"use strict";

// Reine Bindungs-/Sollpositionspruefung. Kein Client, Fachurteil oder Startrecht.
const V = require("./realkohorte-500-vertrag");
const E = require("../../scripts/realkohorte-500-erwartungen");
const BEREICHE = Object.freeze(["mandatsbriefing", "morgenbriefing", "lage"]);

function pruefeSollplan(erwartungen, paketBytes) {
  V.pruefePaket(paketBytes);
  // Vollstaendiger kanonischer Erwartungsvertrag, kein frei behaupteter Hash.
  const erwartet = E.erzeuge(paketBytes);
  V.fordere(V.hash(erwartungen) === V.hash(erwartet), "ergebnis-sollplan-drift");
  V.fordere(erwartungen.blocker.length === 0 && erwartungen.sollpositionen.length === 1500,
    "ergebnis-sollplan-unvollstaendig");
  return { ids: [...erwartungen.ids], erwartungenHash: erwartungen.erwartungenHash,
    sollpositionen: erwartungen.sollpositionen.map(({ mandatsId, bereich }) =>
      ({ mandatsId, bereich, status: "nicht-geprueft", fachqualitaet: "ausstehend" })),
    jeBereich: Object.fromEntries(BEREICHE.map(b => [b, 500])),
    teilbilanzen: structuredClone(erwartungen.bilanzvertrag.teilbilanzen),
    vollstaendigeFachabnahme: false, funktionsnachweis500: false, aktivierungsrecht: false };
}

function pruefeQuittung(quittung, manifest) {
  V.fordere(quittung && ["aktiv", "beendet"].includes(quittung.zustand), "ergebnis-quittung-zustand");
  if (quittung.zustand === "aktiv") return V.pruefeEndquittung(quittung, manifest);
  const { beendetAm, deaktiviert, endgrund, ...aktiv } = quittung;
  V.pruefeEndquittung({ ...aktiv, zustand: "aktiv" }, manifest);
  V.fordere(V.zeit(beendetAm) && Date.parse(beendetAm) >= Date.parse(quittung.aktiviertAm)
    && Number.isSafeInteger(deaktiviert) && deaktiviert >= 0 && deaktiviert <= 500
    && ["frist", "notstopp"].includes(endgrund), "ergebnis-endquittung");
  return quittung;
}

function pruefeLesung({ manifest, snapshot, quittung, lesung, erwartungen }, paketBytes) {
  V.pruefeManifest(manifest, paketBytes, snapshot);
  pruefeQuittung(quittung, manifest);
  const plan = pruefeSollplan(erwartungen, paketBytes);
  V.fordere(lesung && V.zeit(lesung.beobachtetAm) && Array.isArray(lesung.mandate_profiles)
    && Array.isArray(lesung.profiles), "ergebnis-lesung-format");
  const mandate = V.sortiere(lesung.mandate_profiles, "user_id"), profiles = V.sortiere(lesung.profiles, "id");
  V.fordere(mandate.length === 500 && profiles.length === 501
    && mandate.every(r => typeof r.aktiv === "boolean")
    && V.hash(mandate.map(r => r.user_id)) === V.IDS_HASH
    && V.hash(V.fachzeilen(mandate)) === manifest.profilnullzustand.mandateFachHash
    && V.hash(profiles) === manifest.profilnullzustand.profilesHash,
  "ergebnis-bestand-bindung");
  const aktive = mandate.filter(r => r.aktiv).length;
  V.fordere(quittung.zustand !== "beendet" || aktive === 0, "ergebnis-reaktivierung-nach-ende");
  V.fordere(Date.parse(lesung.beobachtetAm) >= Date.parse(quittung.aktiviertAm)
    && (quittung.zustand !== "beendet" || Date.parse(lesung.beobachtetAm) >= Date.parse(quittung.beendetAm)),
  "ergebnis-lesung-vor-quittung");
  // Auch bei 0 aktiven bleibt der Nenner 500/1500. Quittungen pruefen keine Texte.
  return { ...plan, operationId: manifest.operationId, quittungszustand: quittung.zustand,
    profile: 500, soll: 1500, aktive, geprueft: 0, nichtGeprueft: 1500,
    aktuelle500AktiveGelesen: aktive === 500, fehlendeAusgabenFestgestellt: null,
    hinweis: "Nur Auswahl und 1500 Sollpositionen gebunden; keine Ergebnisinhalte oder fachlichen Einzelurteile gelesen." };
}

function pruefeRuntimeLesung({ runtimeManifest, snapshot, quittung, lesung, erwartungen, runtimeStatus }, paketBytes) {
  const S = require("./realkohorte-500-startschutz"), R = require("./realkohorte-500-end-runtime");
  S.pruefeRuntimeManifestFormat(runtimeManifest);
  const manifest = runtimeManifest.profilvertrag;
  V.fordere(V.hash(snapshot) === runtimeManifest.startbelegeGrundlinie.snapshotHash,
    "ergebnis-runtime-snapshot-drift");
  const r = pruefeLesung({ manifest, snapshot, quittung, lesung, erwartungen }, paketBytes);
  const manifestHash = V.hash(runtimeManifest), profilManifestHash = V.hash(manifest);
  const status = R.pruefeLesung({ operationId: manifest.operationId, manifestHash,
    productionCommit: runtimeManifest.startbelegeGrundlinie.productionCommit }, runtimeStatus);
  V.fordere(status.profilManifestHash === profilManifestHash && status.aktiv === r.aktive
    && status.zustand === r.quittungszustand && status.endeAm === manifest.endeAm,
    "ergebnis-runtime-status-drift");
  return { ...r, manifestHash, profilManifestHash, runtimeGrundlinieHash: V.hash(runtimeManifest.startbelegeGrundlinie) };
}
module.exports = { BEREICHE, pruefeSollplan, pruefeQuittung, pruefeLesung, pruefeRuntimeLesung };
