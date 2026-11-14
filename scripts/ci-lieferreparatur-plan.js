"use strict";

// Einmaliger automatischer PR-Pruefplan fuer den unabhaengig geprueften
// Einprofil-Reparaturstand. Kein Branchname allein kann Nachweise ersetzen.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot";
const BASE = "597d7876d3f1ce963174fe749ffb28bd98f15065";
const BRANCH = "codex/einprofil-lieferfaehigkeit-20261113";
const PR = 1184;
const LOCAL_EVIDENCE_COMMIT = "80b80ee8fbafbd65a726dfb90e540c785cc01a72";
const LOCAL_EVIDENCE_PATH = "docs/betrieb/verarbeitungskern-100-20261113.md";
const RUNTIME_FILES = Object.freeze([
  "lib/helmut/admin-ergebnisstand.js", "lib/helmut/briefing-speicher.js",
  "lib/helmut/publication-eligibility.js", "lib/helmut/quellen-automatik.js"
]);
const REGRESSION_FILES = Object.freeze([
  "scripts/publication-eligibility-jsonb-test.js", "scripts/quellen-automatik-tagesfortsetzung-test.js",
  "scripts/tagespaket-ruhelage-test.js"
]);
const BLOBS = Object.freeze({
  "docs/CURRENT_STATE.md": "43a9119cf7805aac20dae017307a271324355606",
  "docs/betrieb/verarbeitungskern-100-20261113.md": "4300f83d1d46854d69582c45a5fc89f58f16d1fc",
  "lib/helmut/admin-ergebnisstand.js": "0249b1774ef73fbb2d2aea5b19177fb8565e80e8",
  "lib/helmut/briefing-speicher.js": "a29cadf29b276291dbd2636d51272637a02ff1e8",
  "lib/helmut/publication-eligibility.js": "3da807cec654fd88993d01711a0b4981b2756fba",
  "lib/helmut/quellen-automatik.js": "192d7719227c5407b5f7f4b40fd3777d70e31897",
  "scripts/browser-smoke-test.js": "6c02aa995c5f62066c6b741590d7324efc4c8707",
  "scripts/publication-eligibility-jsonb-test.js": "048574fc61b5259fee6f6125483baeaa0ac28184",
  "scripts/quellen-automatik-tagesfortsetzung-test.js": "f413f2bbbade1c0fd6837915e76d61910d59ada5",
  "scripts/tagespaket-ruhelage-test.js": "658bb6e435b95467eb0989311181720275d9e31d",
  "vercel.json": "c53a0a0f3b214102665325cf02b6ca39c527d7de"
});
// Zweites festes Profil: nur der separat abgenommene DIP-Einzelartikelfix.
const DIP = Object.freeze({
  PR: 1185, BASE: "73b34b02c7690656191a5d45d5efd32c954ff771",
  BRANCH: "codex/dip-einzelartikel-20261113", LOCAL_EVIDENCE_COMMIT: "6797d89159de7b8fd56a0e0e932663176fa81e2b",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze(["lib/helmut/scalable-pipeline.js"]),
  REGRESSION_FILES: Object.freeze(["scripts/dip-einzelartikel-isolation-test.js"]),
  BLOBS: Object.freeze({
    "docs/CURRENT_STATE.md": "1e1a694fabcfd6eac8871a2241956253d9fe08c9",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "fc916dff904a474c26e5f47498b8daf8f04f8845",
    "lib/helmut/scalable-pipeline.js": "7261b5a21fd58aeefb47c9d6657e6162c13556ac",
    "scripts/dip-einzelartikel-isolation-test.js": "4e47a94a34fcc5491be0dbc311886b300096df87",
    "vercel.json": "ff6ca830a085f9df582cc719a2802700d4ef8622"
  })
});
// Drittes festes Profil: nur die separat abgenommene begrenzte Mandatsphase.
const MANDAT = Object.freeze({
  PR: 1186, BASE: "cc283e0bae8ed7b9f25c551379a9ee1f8895a91c",
  BRANCH: "codex/mandatsarbeit-vorrang-20261113", LOCAL_EVIDENCE_COMMIT: "12f275eb801a1a46cd6c36399535b1e357937a7c",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze(["lib/helmut/worker-betrieb.js"]),
  REGRESSION_FILES: Object.freeze(["scripts/worker-mandatsphase-test.js"]),
  BLOBS: Object.freeze({
    "docs/CURRENT_STATE.md": "e3dd365950b904c64e89b28ac62657847eceaada",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "6f7bb98c16b19f7b39d82364c682cd80e47b5790",
    "lib/helmut/worker-betrieb.js": "9631b255e642dfcd29115207681c4fd33663aeb7",
    "scripts/worker-mandatsphase-test.js": "b78687866436ddaecf170d56ce5b8a682741b88f",
    "vercel.json": "b2ac9375c5e3de8671faa6781ddec7f2c1004126"
  })
});
// Viertes festes Profil: separat gepruefter Lage-Teilstand mit exakter
// PR-/Basis-/Evidencebindung, keine allgemeine Runtimeausnahme.
const TEILSTAND = Object.freeze({
  PR: 1187, BASE: "32311c78fb17843631f6851ec7103b5f9759ff68", BRANCH: "codex/gepruefte-lage-teilstaende-20261114",
  LOCAL_EVIDENCE_COMMIT: "90fc459c31aff8b7b31ca8ba9ec4a2445c441421",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze([
    "lib/helmut/lage-teilstand.js", "lib/helmut/lage.js", "lib/helmut/storage.js",
    "lib/helmut/briefing-speicher.js", "lib/helmut/tagespaket-auslieferung.js", "client.js"
  ]), REGRESSION_FILES: Object.freeze(["scripts/lage-teilstand-test.js"]), BLOBS: Object.freeze({
    "client.js": "71bf4cd796ebdfc2aa8be149b607656689a927fc",
    "docs/CURRENT_STATE.md": "ed79cdb45e288071472125937e1d3b3b1f2cb8ec",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "1985c7bd3cd05fdedef7a016900ff5d10e4bcded",
    "lib/helmut/briefing-speicher.js": "1343e328f5c83c6bc48120401fed1c5ce402777c",
    "lib/helmut/lage-teilstand.js": "0aedee16d69a433e3fd53fc849da8da7fb7bf8b0",
    "lib/helmut/lage.js": "b4cd7b12c9427c0c722d25e4deed96f912d95a45",
    "lib/helmut/storage.js": "b7491d9fc91094196e373748e79285c32ce5365f",
    "lib/helmut/tagespaket-auslieferung.js": "fcd6c0cb2ae9bf8840a5f55a1fb77d4b7b0c3a0f",
    "scripts/browser-smoke-test.js": "3ded2fa012acc125ac8522f700d458b681699b6c",
    "scripts/lage-teilstand-test.js": "7680514530e84700a00d55a5f18544dc66e84c4e",
    "vercel.json": "4f7c75ce053b4458378aa79d2f7f4e6bc0ece5aa"
  })
});
// Fuenftes festes Profil: aktuelle Artikelarbeit und reine Radar-Klarheit.
// Exakter unabhaengig gepruefter Evidencebaum; keine allgemeine Runtimeausnahme.
const TAGESFRISCHE = Object.freeze({
  PR: 1188, BASE: "c97fbbd0e9a894e4072252be3863bffa29c625e8",
  BRANCH: "codex/tagesfrische-und-radarklarheit-20261114", LOCAL_EVIDENCE_COMMIT: "f05be50d379a14f92b7c26afd8ccc0006db9e715",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze([
    "lib/helmut/scalable-pipeline.js", "lib/helmut/artikel-tagesrelevanz.js", "client.js"
  ]), REGRESSION_FILES: Object.freeze(["scripts/artikel-tagesrelevanz-test.js"]), BLOBS: Object.freeze({
    "client.js": "878077cea323a9bc50f09ba5c1ec18debac918b8",
    "docs/CURRENT_STATE.md": "98eb4f6872e0da0a067b4e7ff722930bfbd53d9c",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "77393f84e7423fa61a9a253cfe56f32cc8d263a0",
    "lib/helmut/artikel-tagesrelevanz.js": "acd16d56ca22447f430b34c1e395e686b0fcb18d",
    "lib/helmut/scalable-pipeline.js": "669b1689062b00c28fdc943cc9bea0aa5952d1ac",
    "scripts/artikel-tagesrelevanz-test.js": "0520abc9ea4fea969fd88e9e2f1daa66fc4db255",
    "scripts/browser-smoke-test.js": "bfeb549ab7c5aed71268c0f78dbff6916835a925",
    "vercel.json": "53e72943a9da96435d013fbd44071952af6f5053"
})
});
// Sechstes festes Profil: begrenzter Abrufanteil im bestehenden Einzelworker.
const ABRUFANTEIL = Object.freeze({
  PR: 1189, BASE: "5a734cc38549c0e6f922bf7471d44042ed3b5deb",
  BRANCH: "codex/quellenabruf-arbeitsanteil-20261114",
  LOCAL_EVIDENCE_COMMIT: "c1512499df99c378c25b72ba0e69382fecb04530",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze(["lib/helmut/worker-betrieb.js"]),
  REGRESSION_FILES: Object.freeze(["scripts/quellenabruf-arbeitsanteil-test.js"]),
  BLOBS: Object.freeze({
    "docs/CURRENT_STATE.md": "87a7a48ff9eae4e15e7d2bf91b2a6763f325fd54",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "58d2b60b776f29e11ee92ab0efea20fb259e9659",
    "lib/helmut/worker-betrieb.js": "b8d7448aee77218c68d8afff64dc528ffcaa339b",
    "scripts/quellenabruf-arbeitsanteil-test.js": "a9545eee0b22a2064d8043c792753c8d8590d147",
    "vercel.json": "490f91f09d66d4fc002d4c606aee12f1053036f3"
  })
});
// Siebtes festes Profil: bestaetigte Metadatenkonflikte als einzelne Fehlerartikel.
const VERSIONSKONFLIKT = Object.freeze({
  PR: 1190, BASE: "441ed0af2bf4bd1a5dbd137d8eb7ac4c3d87b616",
  BRANCH: "codex/artikel-versionskonflikte-20261114",
  LOCAL_EVIDENCE_COMMIT: "5cf693f233d96965c0c4d52c260cefc2315d1175",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze(["lib/helmut/storage.js", "lib/helmut/scalable-pipeline.js"]),
  REGRESSION_FILES: Object.freeze(["scripts/artikel-versionskonflikt-test.js"]),
  BLOBS: Object.freeze({
    "docs/CURRENT_STATE.md": "a49c1eda6b3906a189a127f18c54d800bb004807",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "8be1ea413dd9f99d18da1863ab8fc778ae81668d",
    "lib/helmut/storage.js": "c094169837b66a807d95aedff5c8871d55ba0e65",
    "lib/helmut/scalable-pipeline.js": "7b9d75b46a9235742c66645ec3cb06aeeb6f3096",
    "scripts/artikel-versionskonflikt-test.js": "27584e7141efc01770dc3a0101cef93040ef9cb1",
    "vercel.json": "7333a34ba8e230354d12b84b2ab9a2033ace7415"
  })
});
// Achtes festes Profil: eine streng gebundene Ergaenzung nach bekanntem Negativreview.
const LAGEERGAENZUNG = Object.freeze({
  PR: 1191, BASE: "0339f19e6167d9f0f9eff67b7acfb0e997af1180",
  BRANCH: "codex/lage-ergaenzung-20261114",
  LOCAL_EVIDENCE_COMMIT: "e517ef976c4e7308a8021cdf56e3fe1d584456cd",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze([
    "lib/helmut/lage.js", "lib/helmut/ai.js", "lib/helmut/lage-ergaenzung.js"
  ]), REGRESSION_FILES: Object.freeze(["scripts/lage-ergaenzung-test.js"]),
  BLOBS: Object.freeze({
    "docs/CURRENT_STATE.md": "f2574c90c0fb3dfe6cc3d0ff98cea9a06183377c",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "d2e58880cda1ad6daf03250a476fcc1e0d737e5d",
    "lib/helmut/lage.js": "40eb287daa6478b6541632f1db984b915f142df7",
    "lib/helmut/ai.js": "8098593988c3fe220636459be0e0d599e95469c8",
    "lib/helmut/lage-ergaenzung.js": "00899a0ee097889419ad03a63b975006b8c0ed34",
    "scripts/lage-ergaenzung-test.js": "813ea9f05a58fe89ca7b66e5b44dab14b575e7bb",
    "vercel.json": "9ca2788b82276face0ff07102a44061b0e033d7a"
  })
});
// Neuntes festes Profil: zwei Metadatenkorrekturen gegen den nativen Kostenvertrag.
const LAGEKOSTEN = Object.freeze({
  PR: 1192, BASE: "21816be73c5a7a759b35e907b9030a37d5c9b294",
  BRANCH: "codex/lage-kostenvertrag-20261114",
  LOCAL_EVIDENCE_COMMIT: "a6b1293cff7cfd68d0bf9cfab8a4f51801061a92",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze([
    "lib/helmut/ai.js"
  ]), REGRESSION_FILES: Object.freeze(["scripts/lage-ergaenzung-test.js"]),
  BLOBS: Object.freeze({
    "docs/CURRENT_STATE.md": "a16c323cbed7104ddf9092429627f049556ac116",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "62ac824b32e5de58481caf5aad45cd147cd193a1",
    "lib/helmut/ai.js": "2a4f0bac1a0c2f16289a378bbda5c22a903d1812",
    "scripts/lage-ergaenzung-test.js": "0141f907d7f0f51aaa66bf83ad27fd028f5a9da3",
    "vercel.json": "fd8a29190060df78159c84412356ec10fc48d7f8"
  })
});
// Zehntes festes Profil: echte Kundenansichten, nur neue UI-/Bestandsfaelle.
const KUNDENANSICHTEN = Object.freeze({
  PR: 1193, BASE: "097d14e29be63e0c19d7c8fedae9e7eb16195c57",
  BRANCH: "codex/kundenansichten-20261114",
  LOCAL_EVIDENCE_COMMIT: "abb5dc3f8b8781bce4ea00642e5befcd08a01390",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze([
    "client.js", "styles.css", "lib/helmut/radarState.js"
  ]), REGRESSION_FILES: Object.freeze([
    "scripts/radar-zusammenfassung-bestand-test.js", "scripts/radar-anzeige-zusammenfassung-test.js", "scripts/browser-smoke-test.js"
  ]), BLOBS: Object.freeze({
    "docs/CURRENT_STATE.md": "c8754d1f78d83627e5d99d73c3e93dc6e9a17027",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "320db032ae50a89e3a65ef713d4a1f8d9fc16146",
    "client.js": "46f878dc64ee4cc9ce351f84b5c4b9d1c4556fdc",
    "styles.css": "9b6d1cbf68c56623c800142bc053cbd99e5d19fe",
    "lib/helmut/radarState.js": "a4a41697a4587a3d6afec4b987b223a39aa7e746",
    "scripts/radar-zusammenfassung-bestand-test.js": "df43281c028b175df1e558f21001dd42cfc5cea5",
    "scripts/radar-anzeige-zusammenfassung-test.js": "5d2ca20c9b52fd23ef433c701c3666d84f03ff95",
    "scripts/browser-smoke-test.js": "f1980da33b6bea633f8788ae6cbc517d208637da",
    "vercel.json": "352fa106b8438a3661598829fc7f6c94ecc8a372"
  })
});
const EINPROFIL = Object.freeze({ PR, BASE, BRANCH, LOCAL_EVIDENCE_COMMIT,
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES, REGRESSION_FILES, BLOBS });
const profileFor = ({ prNumber, headRef }) => prNumber === KUNDENANSICHTEN.PR || headRef === KUNDENANSICHTEN.BRANCH ? KUNDENANSICHTEN
  : prNumber === LAGEKOSTEN.PR || headRef === LAGEKOSTEN.BRANCH ? LAGEKOSTEN
  : prNumber === LAGEERGAENZUNG.PR || headRef === LAGEERGAENZUNG.BRANCH ? LAGEERGAENZUNG
  : prNumber === VERSIONSKONFLIKT.PR || headRef === VERSIONSKONFLIKT.BRANCH ? VERSIONSKONFLIKT
  : prNumber === ABRUFANTEIL.PR || headRef === ABRUFANTEIL.BRANCH ? ABRUFANTEIL
  : prNumber === TAGESFRISCHE.PR || headRef === TAGESFRISCHE.BRANCH ? TAGESFRISCHE
  : prNumber === TEILSTAND.PR || headRef === TEILSTAND.BRANCH ? TEILSTAND
  : prNumber === MANDAT.PR || headRef === MANDAT.BRANCH ? MANDAT
  : prNumber === DIP.PR || headRef === DIP.BRANCH ? DIP : EINPROFIL;
const CI_FILES = Object.freeze([
  ".github/workflows/ci.yml", "scripts/ci-lieferreparatur-plan.js",
  "scripts/ci-lieferreparatur-plan-test.js"
]);
const OUTPUTS = Object.freeze(["standard", "core", "area", "database", "browser", "syntax", "npm", "verarbeitungskern", "lieferreparatur", "dipartikelisolation", "mandatsarbeitvorrang", "lageteilstand", "tagesfrische", "quellenabrufanteil", "artikelversionskonflikt", "lageergaenzung", "lagekostenvertrag", "kundenansichten"]);
const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("lieferreparatur-ci:" + reason); }

function validate({ event, repository, ref, headRef, baseRef, prNumber, pr, checkedOutHead, baseTree, headTree, evidenceTree }) {
  const profile = profileFor({ prNumber, headRef }), dip = profile === DIP, mandat = profile === MANDAT,
    teilstand = profile === TEILSTAND, frische = profile === TAGESFRISCHE, abruf = profile === ABRUFANTEIL, konflikt = profile === VERSIONSKONFLIKT, ergaenzung = profile === LAGEERGAENZUNG, kosten = profile === LAGEKOSTEN, kunden = profile === KUNDENANSICHTEN;
  const { PR, BASE, BRANCH, LOCAL_EVIDENCE_COMMIT, LOCAL_EVIDENCE_PATH,
    RUNTIME_FILES, REGRESSION_FILES, BLOBS } = profile;
  need(Number.isSafeInteger(PR) && PR > 0 && sha(BASE) && sha(LOCAL_EVIDENCE_COMMIT)
    && LOCAL_EVIDENCE_PATH.startsWith("docs/") && sha(BLOBS[LOCAL_EVIDENCE_PATH])
    && RUNTIME_FILES.length === (kunden ? 3 : kosten ? 1 : ergaenzung ? 3 : konflikt ? 2 : frische ? 3 : teilstand ? 6 : dip || mandat || abruf ? 1 : 4)
    && REGRESSION_FILES.length === (kunden ? 3 : kosten || ergaenzung || konflikt || frische || teilstand || dip || mandat || abruf ? 1 : 3)
    && [...RUNTIME_FILES, ...REGRESSION_FILES, ...(dip || mandat || abruf || konflikt || ergaenzung || kosten || kunden ? [] : ["scripts/browser-smoke-test.js"])].every(file => sha(BLOBS[file])), "belegbindung-fehlt");
  need(event === "pull_request" && repository === REPOSITORY, "pr-ereignis-repository");
  need(ref === `refs/pull/${PR}/merge` && headRef === BRANCH && baseRef === "main"
    && prNumber === PR && pr?.number === PR && pr.state === "open" && typeof pr.draft === "boolean"
    && pr.base?.sha === BASE && pr.base.ref === "main" && pr.base.repo?.full_name === REPOSITORY
    && pr.head?.ref === BRANCH && pr.head.repo?.full_name === REPOSITORY, "pr-bindung");
  need(sha(checkedOutHead) && pr.head.sha === checkedOutHead, "checkout-kopf-abweichend");
  need([baseTree, headTree, evidenceTree].every(t => t instanceof Map && t.size > 0), "baum-fehlt");
  for (const file of CI_FILES) {
    const row = headTree.get(file);
    need(row?.mode === "100644" && row.type === "blob" && sha(row.oid), "ci-datei-ungueltig:" + file);
  }
  for (const [file, blob] of Object.entries(BLOBS)) {
    need(!CI_FILES.includes(file) && sha(blob), "blobvertrag-ungueltig:" + file);
    const row = headTree.get(file), evidence = evidenceTree.get(file);
    need(row?.mode === "100644" && row.type === "blob" && row.oid === blob, "abnahmeblob-abweichend:" + file);
    need(same(row, evidence), "lokaler-belegbaum-abweichend:" + file);
  }
  for (const file of new Set([...baseTree.keys(), ...headTree.keys(), ...evidenceTree.keys()])) {
    if (CI_FILES.includes(file) || Object.hasOwn(BLOBS, file)) continue;
    need(same(baseTree.get(file), headTree.get(file)), "unerwarteter-diff:" + file);
    need(same(evidenceTree.get(file), headTree.get(file)), "lokale-abhaengigkeit-abweichend:" + file);
  }
  const changed = [...new Set([...baseTree.keys(), ...headTree.keys()])]
    .filter(file => !same(baseTree.get(file), headTree.get(file))).sort();
  const mode = kunden ? "kundenansichten" : kosten ? "lagekostenvertrag" : ergaenzung ? "lageergaenzung" : konflikt ? "artikelversionskonflikt" : abruf ? "quellenabrufanteil" : frische ? "tagesfrische" : teilstand ? "lageteilstand" : mandat ? "mandatsarbeitvorrang" : dip ? "dipartikelisolation" : "lieferreparatur";
  return {
    mode,
    reason: kunden ? "Exakte Kundenansichten: sichtbare Lageeinordnung, kompakte mobile Titel und ehrlicher Radarbestand"
      : kosten ? "Exakter nativer Kostenvertragsanschluss ohne Phasen- oder Budgetlockerung"
      : ergaenzung ? "Exakte einmalige Lage-Ergaenzung mit unveraenderter Gesamtpruefung und Phasensicherheit"
      : konflikt ? "Exakte Artikelkonfliktisolation ohne Freigabe inkompatibler Quellenversionen"
      : abruf ? "Exakter begrenzter Abrufanteil ohne weiteren Slot oder Datenbank-/Readeraenderung"
      : frische ? "Exakte datumsgebundene Artikelarbeit und verstaendlicher gespeicherter Radarstand"
      : teilstand ? "Exakter gepruefter Lage-Teilstand ohne Lockerung des Originalqualitaetsvertrags"
      : mandat ? "Exakte begrenzte Mandatsphase ohne Reader- oder Datenbankaenderung"
      : dip ? "Exakte DIP-Einzelartikelisolation ohne Browser- oder Datenbankaenderung"
      : "Exakter Einprofil-Reparaturstand mit gebundenen lokalen Nachweisen",
    ...Object.fromEntries(OUTPUTS.map(key => [key, key === mode])), changed,
    source: { repository: REPOSITORY, pr: PR, base: BASE, head: checkedOutHead },
    reused: kunden ? { status: "Neue Browserfaelle werden ausgefuehrt; alte nicht betroffene Fach-/Browser-/Mengenbelege erhalten",
      urls: ["https://github.com/ernisch/helmut-pilot/actions/runs/43565666630"] }
      : kosten || ergaenzung ? { status: "Browser bewusst nicht erneut ausgefuehrt; App, Auth, normaler Ausgabe-/Paketlesevertrag und Abhaengigkeiten unveraendert",
      urls: ["https://github.com/ernisch/helmut-pilot/actions/runs/43531055622",
        "https://github.com/ernisch/helmut-pilot/actions/runs/43537245306/job/132269105907"] }
      : abruf || konflikt ? { status: "Browser bewusst nicht erneut ausgefuehrt; App, Auth, Paketleser, Lage, Radar und Abhaengigkeiten unveraendert",
      urls: ["https://github.com/ernisch/helmut-pilot/actions/runs/43531055622",
        "https://github.com/ernisch/helmut-pilot/actions/runs/43537245306/job/132269105907"] }
      : frische ? { status: "WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT: vier unveraenderte Profilgruppen, drei Fachgruppen und sieben Radar-Browserchecks",
      commit: "43282d1be8be5899696472a553d56ccb6f7f14dc",
      url: "https://github.com/ernisch/helmut-pilot/actions/runs/43537245306" }
      : teilstand ? { status: "Historische Vorbelege bleiben erhalten; nur neue Teilstandfaelle werden ausgefuehrt" }
      : dip || mandat ? { status: mandat
      ? "Browser bewusst nicht erneut ausgefuehrt; Eingaben ausser Mandatsworker unveraendert"
      : "Browser bewusst nicht erneut ausgefuehrt; Eingaben ausser Quellenhandler unveraendert",
      urls: ["https://github.com/ernisch/helmut-pilot/actions/runs/43512468427",
        "https://github.com/ernisch/helmut-pilot/actions/runs/43511072972/job/132181165997"] }
      : { status: "WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT", cases: 24,
      commit: LOCAL_EVIDENCE_COMMIT,
      url: `https://github.com/${REPOSITORY}/blob/${LOCAL_EVIDENCE_COMMIT}/${LOCAL_EVIDENCE_PATH}` },
    execute: kunden ? ["Sechs neue Pruefplan-Gegenfaelle", "Zwei neue Radar-Bestandsinteraktionen",
      "Neue Kundenansichten in echtem Chromium Desktop und Mobil", "Syntax geaenderter JavaScriptdateien"]
      : kosten ? ["Nur neue Kostenvertrags-Profilgegenfaelle", "Zwei neue native Kosten-/Lageinteraktionen",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien"]
      : ergaenzung ? ["Nur neue Ergaenzungs-Profilgegenfaelle", "Neue Lage-/KI-/Phaseninteraktionen",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien"]
      : konflikt ? ["Nur neue Versionskonflikt-Profilgegenfaelle", "Neue native Artikelkonfliktregression",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien"]
      : abruf ? ["Nur neue Abrufanteil-Profilgegenfaelle", "Neue begrenzte Worker-Fairnessregression",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien"]
      : frische ? ["Zwei geaenderte Frische-Schrittanker", "Sechs bisher offene Artikel-Tagesrelevanzgruppen",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien"]
      : teilstand ? ["Nur neue Teilstand-Profil-Gegenfaelle", "Neue Teilstand-Fachregression",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien", "Neuer Teilstand-Browserfall auf Desktop und Mobil"]
      : mandat ? ["Nur neue Mandatsphasen-Profil-Gegenfaelle", "Eine neue begrenzte Workerregression",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien"]
      : dip ? ["Nur neue DIP-Profil-Gegenfaelle", "Eine neue DIP-Einzelartikelregression",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien"]
      : ["Betroffene CI-Zeilenankergruppe", "Syntax der tatsaechlich geaenderten JavaScriptdateien",
        "Nur zwei betroffene Ruhelage-Browserfaelle auf Desktop und Mobil"]
  };
}
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 });
}
function tree(ref) {
  const rows = new Map();
  for (const line of git(["ls-tree", "-rz", "--full-tree", ref]).split("\0").filter(Boolean)) {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(line);
    need(Boolean(match), "git-baum-unlesbar");
    rows.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  return rows;
}
function fromCheckout(env = process.env) {
  need(env.GITHUB_EVENT_PATH && env.GITHUB_EVENT_NAME === "pull_request", "pr-metadaten-fehlen");
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  need(event.repository?.full_name === REPOSITORY, "ereignis-repository-abweichend");
  const profile = profileFor({ prNumber: event.number, headRef: env.GITHUB_HEAD_REF });
  const checkedOutHead = git(["rev-parse", "HEAD"]).trim();
  git(["diff", "--quiet", "HEAD", "--"]);
  git(["merge-base", "--is-ancestor", profile.BASE, checkedOutHead]);
  git(["merge-base", "--is-ancestor", profile.LOCAL_EVIDENCE_COMMIT, checkedOutHead]);
  return validate({ event: env.GITHUB_EVENT_NAME, repository: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF, headRef: env.GITHUB_HEAD_REF, baseRef: env.GITHUB_BASE_REF,
    prNumber: event.number, pr: event.pull_request, checkedOutHead,
    baseTree: tree(profile.BASE), headTree: tree(checkedOutHead), evidenceTree: tree(profile.LOCAL_EVIDENCE_COMMIT) });
}
function main() {
  const args = process.argv.slice(2);
  need(args.length === 1 && args[0] === "--syntax"
    || args.length === 2 && args[0] === "--github-output" && Boolean(args[1]), "argumente-ungueltig");
  const result = fromCheckout();
  if (args[0] === "--syntax") {
    for (const file of result.changed.filter(f => f.endsWith(".js"))) {
      execFileSync(process.execPath, ["--check", file], { stdio: "inherit", timeout: 10000 });
      console.log("Syntax OK: " + file);
    }
  } else {
    fs.appendFileSync(args[1], OUTPUTS.map(key => `${key}=${result[key]}\n`).join("") + `mode=${result.mode}\n`);
    console.log(JSON.stringify(result));
  }
}
module.exports = { REPOSITORY, BASE, BRANCH, PR, LOCAL_EVIDENCE_COMMIT, LOCAL_EVIDENCE_PATH,
  RUNTIME_FILES, REGRESSION_FILES, BLOBS, DIP, MANDAT, TEILSTAND, TAGESFRISCHE, ABRUFANTEIL, VERSIONSKONFLIKT, LAGEERGAENZUNG, LAGEKOSTEN, KUNDENANSICHTEN, CI_FILES, OUTPUTS, validate, fromCheckout };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
