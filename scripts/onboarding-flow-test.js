"use strict";

// Offline-Test der Erstkonfiguration (Onboarding-Flow in client.js). Lädt client.js
// in einer vm-Sandbox (KEIN echtes DOM, KEIN Netz) — dieselbe Technik wie
// onboarding-tenant-test.js — und prüft:
//  - Gate shouldRunOnboarding() (Status/Rolle/Vorschau)
//  - Vollbild-Container .onboarding-handoff (gescoptes Design-System)
//  - Copy & Zustände je Screen (Begrüßung/Identität/Bestätigen/…): „Du"-Ansprache,
//    Lade-/Fehler-/Mehrdeutig-/Landtag-/Consent-Zustände
//  - Feld -> internes camelCase-Profil (onbDraftToProfilePayload) mit den am
//    Mapper verifizierten Namen (reportingTopics/opportunityTopics/privacyConfirmedAt)
//  - Adaptivität (onbStepVisible) je Kontotyp

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

const clientSource = fs.readFileSync(path.join(root, "client.js"), "utf8");
let codeVm = clientSource.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");

const noop = () => {};
const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
  addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
  setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null,
  contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
  textContent: "", value: "", offsetParent: null });

// App-Knoten, der die zuletzt gesetzte innerHTML festhält (für Markup-Prüfungen).
const appNode = Object.assign(fakeNode(), { _html: "" });
Object.defineProperty(appNode, "innerHTML", { get() { return this._html; }, set(v) { this._html = String(v); } });

const storageStub = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
const sandbox = {
  console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
  document: { querySelector: (sel) => (sel === "#app" ? appNode : fakeNode()), querySelectorAll: () => [],
    getElementById: () => fakeNode(), createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(),
    body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop, cookie: "",
    visibilityState: "visible", hidden: false },
  navigator: { userAgent: "node-test", language: "de-DE", onLine: true, sendBeacon: noop },
  localStorage: storageStub, sessionStorage: storageStub,
  location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost", reload: noop },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
  fetch: () => Promise.reject(new Error("no-net-in-test")),
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  performance: { now: () => 0 },
  atob: (s) => Buffer.from(s, "base64").toString("binary"), btoa: (s) => Buffer.from(s, "binary").toString("base64")
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;

// Test-Brücke: Zugriff auf die internen Flow-Funktionen/-State ohne Prod-Hooks.
codeVm += `\n;globalThis.__onb = {
  gate: () => shouldRunOnboarding(),
  setAuth: (a, u) => { authState = a; currentUser = u; },
  setProfile: (p) => { profile = p; },
  setPreview: (v) => { previewMode = v; },
  setPid: (v) => { activePoliticianId = v; },
  setDraft: (d) => { onboardingDraft = d; },
  setUi: (u) => { onboardingUi = u; },
  seed: () => { onbSeedDraftFromProfile(); },
  draft: () => onboardingDraft,
  payload: () => onbDraftToProfilePayload(),
  renderStep: (n) => { onboardingActive = true; onboardingStep = n; renderOnboardingFlow(); return document.querySelector("#app").innerHTML; },
  stepBody: (n) => { const s = onbRenderStep(n); return (s.full || "") + (s.body || "") + (s.action || ""); },
  stepVisible: (n) => onbStepVisible(n),
  corePct: () => onbCorePct(),
  operational: (p) => isProfileOperational(p),
  firstMissing: (p) => onbFirstMissingStep(p),
  startFlowStep: () => { onboardingActive = false; startOnboardingFlow(); return onboardingStep; },
  parliament: () => onbParliament(),
  migrateChannels: (l) => onbMigrateChannels(l)
};`;

vm.createContext(sandbox);
vm.runInContext(codeVm, sandbox, { filename: "client.js" });
const onb = sandbox.__onb;

// Standard-Setup: Account-Modus, Abgeordneter.
onb.setAuth({ authenticated: true }, { role: "abgeordneter" });
onb.setPid("mandat-test");
onb.setPreview(false);

// Vollständiger Bundestags-Kern (ohne optionale Felder), inkl. Datenschutz.
const completeBt = { id: "mandat-test", fullName: "Katrin Vogt", role: "MdB", parliamentType: "Bundestag", party: "Die Linke", constituency: "Salzgitter", state: "Niedersachsen", privacyConfirmedAt: "2026-07-19T00:00:00Z" };

// ── 1) Gate = !isProfileOperational (Einsatzbereitschaft) ───────────────────
onb.setProfile({ id: "x", onboardingStatus: "neu" });
check("Gate: neues, leeres Profil -> Onboarding fällig", onb.gate() === true);
onb.setProfile(Object.assign({}, completeBt, { onboardingStatus: "in_bearbeitung" }));
check("Gate: Kern vollständig aber Status 'in_bearbeitung' -> fällig (muss abschließen)", onb.gate() === true);
onb.setProfile(Object.assign({}, completeBt, { onboardingStatus: "abgeschlossen" }));
check("Gate: Kern vollständig + 'abgeschlossen' -> NICHT fällig", onb.gate() === false);
onb.setProfile(Object.assign({}, completeBt, { onboardingStatus: "abgeschlossen", committees: [], focusTopics: [] }));
check("Gate: fehlende OPTIONALE Felder (Ausschüsse/Themen) blockieren die App NICHT", onb.gate() === false);
onb.setProfile(Object.assign({}, completeBt)); // Altprofil ohne onboardingStatus, Kern vollständig
check("Gate: Altprofil mit vollständigem Kern (kein Status) -> KEIN erneutes Onboarding", onb.gate() === false);
onb.setProfile(Object.assign({}, completeBt, { onboardingStatus: "abgeschlossen", privacyConfirmedAt: "" })); // Datenschutz fehlt
check("Gate: Kern ok + 'abgeschlossen' aber Datenschutz fehlt -> fällig (Sicherheit)", onb.gate() === true);
onb.setProfile({ id: "mandat-test", fullName: "Teil Profil", role: "MdB", parliamentType: "Bundestag", party: "SPD" }); // Region fehlt
check("Gate: Altprofil mit fehlenden Kernfeldern -> fällig (gezielt ergänzen)", onb.gate() === true);

// Vorschau-Modus nie onboarden.
onb.setProfile({ id: "x", onboardingStatus: "neu" });
onb.setPreview(true);
check("Gate: Vorschau-Modus -> nie Onboarding", onb.gate() === false);
onb.setPreview(false);

// EINE Quelle der Wahrheit: das Server-Urteil (profilValidierung.operational) gewinnt.
onb.setProfile({ id: "x", onboardingStatus: "neu", profilValidierung: { operational: true } });
check("Gate: Single-Source — Server sagt operational=true -> KEIN Onboarding (trotz dünnem Profil)", onb.gate() === false);
onb.setProfile(Object.assign({}, completeBt, { onboardingStatus: "abgeschlossen", profilValidierung: { operational: false } }));
check("Gate: Single-Source — Server sagt operational=false -> Onboarding (trotz vollem Kern)", onb.gate() === true);

// ── 1b) Rollenlogik: nur Abgeordnete, NIE Admin/Referent/Demo ───────────────
onb.setProfile({ id: "x", onboardingStatus: "neu" }); // unvollständig
for (const role of ["admin", "referent", "demo"]) {
  onb.setAuth({ authenticated: true }, { role });
  check(`Gate: Rolle '${role}' -> NIE ins Abgeordneten-Onboarding`, onb.gate() === false);
}
onb.setAuth(null, null);
check("Gate: Legacy/Pilot (kein Account-Modus) -> kein Onboarding", onb.gate() === false);
onb.setAuth({ authenticated: true }, { role: "abgeordneter" });
check("Gate: Abgeordneter mit unvollständigem Profil -> fällig", onb.gate() === true);

// ── 1c) Einsatzbereitschafts-Funktion direkt ────────────────────────────────
check("operational: vollständiger Kern + abgeschlossen -> true", onb.operational(Object.assign({}, completeBt, { onboardingStatus: "abgeschlossen" })) === true);
check("operational: vollständiger Kern + 'neu' -> false", onb.operational(Object.assign({}, completeBt, { onboardingStatus: "neu" })) === false);
check("operational: Altprofil (kein Status) + vollständiger Kern -> true", onb.operational(completeBt) === true);

// ── 1d) Erster fehlender Pflichtschritt (gezielte Wiederaufnahme) ───────────
// Auto-Erkennung: Name/Ebene/Partei führen zum Mandat-Screen (S3) — kein separater
// Identitäts-Screen mehr, keine erneute Namenseingabe im Normalfall.
check("firstMissing: kein Name -> S3 (Mandat, nicht mehr S1)", onb.firstMissing({ id: "m" }) === 3);
check("firstMissing: Ebene/Partei fehlen -> S3 (Mandat)", onb.firstMissing({ id: "m", fullName: "Max Muster" }) === 3);
check("firstMissing: Region fehlt -> S6", onb.firstMissing({ id: "m", fullName: "Max Muster", parliamentType: "Bundestag", party: "SPD" }) === 6);
check("firstMissing: Datenschutz fehlt -> S10", onb.firstMissing({ id: "m", fullName: "Max Muster", parliamentType: "Bundestag", party: "SPD", constituency: "K1" }) === 10);
check("firstMissing: alles da -> S11 (nur bestätigen)", onb.firstMissing(Object.assign({}, completeBt, { privacyConfirmedAt: "2026-07-19T00:00:00Z" })) === 11);

// ── 1e) startOnboardingFlow: frisch -> S0, Wiederaufnahme -> gezielt ─────────
onb.setProfile({ id: "mandat-test", fullName: "Frisch Neu", role: "MdB", onboardingStatus: "neu" }); // keine politischen Daten
check("startFlow: frisches leeres Mandat -> Begrüßung (S0)", onb.startFlowStep() === 0);
onb.setProfile({ id: "mandat-test", fullName: "Teil Profil", role: "MdB", parliamentType: "Bundestag", party: "SPD", onboardingStatus: "in_bearbeitung" }); // Region fehlt
check("startFlow: Wiederaufnahme mit Lücke -> springt zum ersten fehlenden Schritt (S6)", onb.startFlowStep() === 6);
onb.setAuth({ authenticated: true }, { role: "abgeordneter" });

// ── 2) Vollbild-Container + personalisierte Begrüßung (Auto-Erkennung) ───────
// Der Name kommt aus dem Konto (Admin-Anlage). S0 begrüßt persönlich; ein Tippen
// startet AUTOMATISCH die Suche — kein Namensfeld, kein „Mein Mandat suchen".
onb.setAuth({ authenticated: true }, { role: "abgeordneter", name: "Katrin Vogt" });
onb.setProfile({ id: "x", onboardingStatus: "neu", fullName: "" });
onb.seed();
const welcome = onb.renderStep(0);
check("Container: gescoptes .onboarding-handoff", welcome.includes("onboarding-handoff") && welcome.includes('id="onbRoot"'));
check("S0 personalisiert: 'Hallo, Katrin.' + Ich-Form + Mandat-Zusage",
  welcome.includes(">Hallo, Katrin.<") && welcome.includes("Ich bin Helmut") && welcome.includes("richte mich jetzt auf dein Mandat ein"));
check("S0 Auto-Suche: ganzflächig tippbar (data-onb-tap) + dezenter Puls-Hinweis",
  welcome.includes("data-onb-tap") && welcome.includes("Zum Starten tippen") && welcome.includes("ho-pulse"));
check("S0 KEINE Namenseingabe / KEIN 'Mein Mandat suchen'-Button",
  !welcome.includes('data-onb-input="fullName"') && !/Mein Mandat suchen/.test(welcome));
// Ohne Konto-Name (Sonderfall): neutrale Begrüßung, kein leerer/kaputter Name.
onb.setAuth({ authenticated: true }, { role: "abgeordneter" });
onb.setProfile({ id: "x", onboardingStatus: "neu", fullName: "" });
onb.seed();
check("S0 ohne Konto-Name: neutrale Begrüßung 'Hallo.'", onb.renderStep(0).includes(">Hallo.<"));
// S1 (manuelle Namenseingabe) und S2 (Scan) sind KEINE Navigationsziele mehr.
check("S1/S2 aus der Navigation entfernt (onbStepVisible=false)", onb.stepVisible(1) === false && onb.stepVisible(2) === false);
onb.setAuth({ authenticated: true }, { role: "abgeordneter" });

// ── 3) Scan (Lade-Zustand) ───────────────────────────────────────────────────
onb.setUi({ scanPhase: 2, lookup: { status: "loading", candidates: [], warnings: [] }, saving: false, editMandate: false, error: "" });
const scan = onb.stepBody(2);
check("S2 Erkennung: Spinner + Quell-Checkliste (Abgeordnetenwatch)", scan.includes("ho-scan") && scan.includes("Abgeordnetenwatch") && scan.includes("Ausschuss-Zuordnung"));

// ── 4) Bestätigen: gefunden / mehrdeutig / techn. Ausfall / kein Treffer / Landtag ─
// Hochwertige Bestätigungskarte („Ich habe dein Mandat gefunden.") mit erkannten
// Stammdaten als Zeilen + klaren Aktionen „Das bin ich" / „Etwas stimmt nicht".
onb.setUi({ scanPhase: 3, lookup: { status: "found", candidates: [], warnings: [] }, saving: false, editMandate: false, error: "" });
onb.setDraft(Object.assign(onb.draft(), { fullName: "Beispiel Person", party: "SPD", faction: "SPD", parliamentType: "Bundestag", constituency: "Musterkreis", committees: ["Gesundheit"] }));
const confirm = onb.stepBody(3);
check("S3 gefunden: Bestätigungskarte ('Ich habe dein Mandat gefunden.') + Quellenhinweis",
  confirm.includes("Ich habe dein Mandat gefunden.") && confirm.includes("Abgeordnetenwatch"));
check("S3 gefunden: Name + Mandatszeile + Kartenzeilen",
  confirm.includes("Beispiel Person") && confirm.includes("Mitglied des Deutschen Bundestages") && confirm.includes("ho-card-line"));
check("S3 gefunden: Aktionen 'Das bin ich' + 'Etwas stimmt nicht'",
  confirm.includes("Das bin ich") && confirm.includes("Etwas stimmt nicht") && !/Mein Mandat suchen/.test(confirm));

onb.setUi({ scanPhase: 3, lookup: { status: "ambiguous", candidates: [{ id: "1", name: "A Person", party: "SPD" }, { id: "2", name: "B Person", party: "CDU/CSU" }], warnings: [] }, saving: false, editMandate: false, error: "" });
const ambiguous = onb.stepBody(3);
check("S3 mehrdeutig: Auswahlliste (Welche/r bist du?), kein stilles Raten", ambiguous.includes("Welche/r bist du?") && ambiguous.includes('data-onb-pick="1"'));

// Technischer Ausfall (source_down) -> RUHIGER Hilfezustand: keine alarmierende
// Überschrift, KEINE API/Timeout/Netzwerk/Quelle-Begriffe, nur fehlende
// Pflichtfelder + automatischer Wiederholungsversuch.
onb.setUi({ scanPhase: 3, lookup: { status: "source_down", candidates: [], warnings: [] }, saving: false, editMandate: true, error: "" });
onb.setDraft(Object.assign(onb.draft(), { fullName: "Voll Name", party: "", faction: "", parliamentType: "" }));
const down = onb.stepBody(3);
check("S3 techn. Ausfall: ruhiger Hilfezustand ('Ich brauche kurz deine Hilfe.')", down.includes("Ich brauche kurz deine Hilfe."));
check("S3 techn. Ausfall: KEINE technischen/alarmierenden Begriffe",
  !/nicht erreichbar|Netzwerk|Timeout|\bAPI\b|Quellen?\s+(sind|nicht|nicht erreichbar)|Fehler|Server/i.test(down));
check("S3 techn. Ausfall: automatischer Wiederholungsversuch angeboten", down.includes("Automatisch erneut suchen"));
check("S3 techn. Ausfall: nur fehlende Pflichtfelder (Ebene + Partei), kein Namensfeld nötig",
  down.includes('data-onb-select="parliamentType"') && down.includes('data-onb-select="party"') && !down.includes('data-onb-input="fullName"'));

// Kein Treffer (echt) -> derselbe ruhige Hilfezustand (nicht als Ausfall getarnt).
onb.setUi({ scanPhase: 3, lookup: { status: "not_found", candidates: [], warnings: [] }, saving: false, editMandate: true, error: "" });
onb.setDraft(Object.assign(onb.draft(), { fullName: "Kein Treffer", party: "", faction: "", parliamentType: "" }));
const none = onb.stepBody(3);
check("S3 kein Treffer: ruhiger Hilfezustand ohne Retry-Zwang", none.includes("Ich brauche kurz deine Hilfe.") && !none.includes("Automatisch erneut suchen"));

// S3-Mandat-Gate (Review-Fix): „Weiter/Das bin ich" bleibt gesperrt, solange
// Name/Ebene/Partei unvollständig sind — auch nachdem eine Auswahl den Button
// per onbSyncDynamic aktualisiert (kein Durchrutschen mit leerer Partei).
check("S3-Gate: unvollständiges Mandat (keine Partei/Ebene) -> Bestätigen gesperrt", /ho-btn is-disabled/.test(onb.stepBody(3)));
onb.setDraft(Object.assign(onb.draft(), { parliamentType: "Bundestag" })); // nur Ebene, Partei fehlt weiter
check("S3-Gate: nur Ebene gesetzt, Partei fehlt -> weiter gesperrt", /ho-btn is-disabled/.test(onb.stepBody(3)));
onb.setDraft(Object.assign(onb.draft(), { party: "SPD" }));
check("S3-Gate: Name+Ebene+Partei vollständig -> Bestätigen frei", !/ho-btn is-disabled/.test(onb.stepBody(3)));

onb.setUi({ scanPhase: 3, lookup: { status: "found", candidates: [], warnings: ["landtag-quellen-im-aufbau"] }, saving: false, editMandate: false, error: "" });
onb.setDraft(Object.assign(onb.draft(), { fullName: "Lea Berg", party: "CDU/CSU", faction: "CDU/CSU", parliamentType: "Landtag", state: "Niedersachsen" }));
const landtag = onb.stepBody(3);
check("S3 Landtag: transparenter Vorbehalt (Quellen im Aufbau)", /Landtag erkannt/.test(landtag) && /baue ich gerade aus|im Aufbau/.test(landtag));

// ── 5) Datenschutz-Consent-Gate (S10) ────────────────────────────────────────
onb.setDraft(Object.assign(onb.draft(), { consent: false }));
const privacyOff = onb.stepBody(10);
check("S10 Datenschutz: Weiter-Button gesperrt ohne Zustimmung", privacyOff.includes("is-disabled") && privacyOff.includes("Zustimmen &amp; weiter"));
onb.setDraft(Object.assign(onb.draft(), { consent: true }));
const privacyOn = onb.stepBody(10);
check("S10: Zustimmung an -> Weiter-Button frei", !/ho-btn is-disabled/.test(privacyOn) && privacyOn.includes("is-on"));

// ── 6) Feld -> internes camelCase-Profil (verifizierte Namen) ────────────────
onb.setProfile({ id: "mandat-test", onboardingStatus: "neu" });
onb.seed();
onb.setDraft(Object.assign(onb.draft(), {
  fullName: "Test Abgeordnete", party: "Die Linke", faction: "Die Linke", parliamentType: "Bundestag",
  constituency: "Salzgitter", state: "Niedersachsen", location: "Salzgitter",
  committees: ["Arbeit und Soziales"], deputyCommittees: ["Gesundheit"], reportingTopics: ["Sprecher/in der Fraktion"],
  focusTopics: ["Rente & Alterssicherung"], currentCampaigns: ["Rentenpaket"], regionalInterests: ["Stahlwerk"],
  relevantMinistries: ["BMAS — Arbeit & Soziales"], monitoringTargets: ["DGB"], localMedia: ["Lokalzeitung"],
  communicationStyle: "Nahbar & klar", communicationDirectness: "Ausgewogen", communicationLength: "Mittel",
  preferredChannels: ["Pressemitteilung"], noGoTopics: ["Migration"]
}));
const pl = onb.payload();
check("Mapping: fullName", pl.fullName === "Test Abgeordnete");
check("Mapping: party/faction", pl.party === "Die Linke" && pl.faction === "Die Linke");
check("Mapping: parliamentType -> politicalLevel Bund", pl.parliamentType === "Bundestag" && pl.politicalLevel === "Bund");
check("Mapping: committees[] + deputyCommittees[]", pl.committees.includes("Arbeit und Soziales") && pl.deputyCommittees.includes("Gesundheit"));
check("Mapping: reportingTopics (NICHT rapporteurTopics)", Array.isArray(pl.reportingTopics) && pl.reportingTopics.includes("Sprecher/in der Fraktion") && !("rapporteurTopics" in pl));
check("Mapping: focusTopics[]", pl.focusTopics.includes("Rente & Alterssicherung"));
check("Mapping: currentCampaigns[]", pl.currentCampaigns.includes("Rentenpaket"));
check("Mapping: constituency/state/location", pl.constituency === "Salzgitter" && pl.state === "Niedersachsen" && pl.location === "Salzgitter");
check("Mapping: relevantMinistries/monitoringTargets/localMedia", pl.relevantMinistries.length === 1 && pl.monitoringTargets.includes("DGB") && pl.localMedia.includes("Lokalzeitung"));
check("Mapping: communicationStyle + preferredChannels + noGoTopics", pl.communicationStyle === "Nahbar & klar" && pl.preferredChannels.includes("Pressemitteilung") && pl.noGoTopics.includes("Migration"));
check("Mapping: KEIN chanceTopics-Feld (heißt opportunityTopics)", !("chanceTopics" in pl));

// ── 7) Adaptivität: keine Sackgasse — Kernscreens bleiben immer erfüllbar ────
onb.setDraft(Object.assign(onb.draft(), { accountType: "abgeordneter" }));
check("Adaptiv: Kernscreens sichtbar (Abgeordneter)", onb.stepVisible(3) && onb.stepVisible(4) && onb.stepVisible(6));
onb.setDraft(Object.assign(onb.draft(), { accountType: "ministerium" }));
check("Adaptiv: keine Sackgasse für andere Kontotypen (Kernscreens bleiben erfüllbar)", onb.stepVisible(3) && onb.stepVisible(4) && onb.stepVisible(6));

// ── 8) Pflichtkern zur Laufzeit aus dem Entwurf (inkl. Landtag→Bundesland) ────
onb.setDraft({ fullName: "Voll Ständig", party: "SPD", parliamentType: "Bundestag", constituency: "K1", committees: ["Gesundheit"], focusTopics: [] });
check("Pflichtkern: vollständiges Bundestagsprofil ist ready (100 %)", onb.corePct().ready === true && onb.corePct().pct === 100);
onb.setDraft({ fullName: "", party: "", parliamentType: "", constituency: "", committees: [], focusTopics: [] });
const empty = onb.corePct();
check("Pflichtkern: leeres Profil nicht ready + benennt fehlende Felder", empty.ready === false && empty.missing.length >= 4);
onb.setDraft({ fullName: "Land Tag", party: "CDU/CSU", parliamentType: "Landtag", constituency: "K2", focusTopics: ["Bildung"], state: "" });
check("Pflichtkern: Landtag ohne Bundesland NICHT ready", onb.corePct().ready === false && onb.corePct().missing.includes("Bundesland"));
onb.setDraft({ fullName: "Land Tag", party: "CDU/CSU", parliamentType: "Landtag", constituency: "K2", focusTopics: ["Bildung"], state: "Bayern" });
check("Pflichtkern: Landtag MIT Bundesland ready", onb.corePct().ready === true);

// ── 9) Kommunikationskanäle: Katalog + verlustfreie Migration ───────────────
// Primär: Pressemitteilung, Social Media, Newsletter, Rede, Interview, Bürgerdialog.
// Podcast lebt in „Weitere Kanäle"; alte Labels wandern verlustfrei (keine
// verschwundene Auswahl): Bürgersprechstunde→Bürgerdialog, Reden→Rede, Interviews→Interview.
check("Kanäle: Bürgersprechstunde -> Bürgerdialog", onb.migrateChannels(["Bürgersprechstunde"]).includes("Bürgerdialog") && !onb.migrateChannels(["Bürgersprechstunde"]).includes("Bürgersprechstunde"));
check("Kanäle: Reden->Rede, Interviews->Interview", JSON.stringify(onb.migrateChannels(["Reden", "Interviews"])) === JSON.stringify(["Rede", "Interview"]));
check("Kanäle: Podcast bleibt erhalten (nur anders einsortiert)", onb.migrateChannels(["Podcast"]).includes("Podcast"));
check("Kanäle: Migration ist idempotent + dedupliziert", JSON.stringify(onb.migrateChannels(["Bürgerdialog", "Bürgersprechstunde"])) === JSON.stringify(["Bürgerdialog"]));
const comm = onb.stepBody(8);
check("S8 Kanäle: primärer Katalog gerendert (Pressemitteilung … Bürgerdialog)",
  comm.includes("Pressemitteilung") && comm.includes("Bürgerdialog") && !comm.includes("Bürgersprechstunde"));
check("S8 Kanäle: Podcast unter 'Weitere Kanäle'", comm.includes("Weitere Kanäle") && comm.includes("Podcast"));

// ── 10) Abschluss-Screen (S12) erscheint NUR nach erfolgreichem Speichern ────
// (onbComplete bleibt bei Speicherfehler auf S11; hier prüfen wir die Copy des
// Willkommen-Screens, den onbComplete NUR nach erfolgreichem PATCH ansteuert.)
onb.setDraft(Object.assign(onb.draft(), { fullName: "Katrin Vogt" }));
const done = onb.stepBody(12);
check("S12 Willkommen: 'Willkommen, Katrin.' + 'Ab jetzt bin ich an deiner Seite.' + Los geht's",
  done.includes("Willkommen, Katrin.") && done.includes("Ab jetzt bin ich an deiner Seite") && done.includes("Los geht"));

console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Onboarding-Flow-Assertions`);
process.exit(fail > 0 ? 1 : 0);
