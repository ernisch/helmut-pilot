let profile = null;
let briefing = null;
let aiStatus = { enabled: false, model: "" };
let opsStatus = null;
let decisions = [];
let tasks = [];
let notes = [];
let recommendations = [];
let radarArchive = [];
let radarArchiveLoaded = false;
let features = {};
let opsStatusLoaded = false;
let pushConfig = null;
let pushAutoSyncStarted = false;
let selectedDecisionId = "";
let currentView = "briefing";
let detailOriginView = "briefing";
let navOpen = false;
let updatesOpen = false;
let helmutThinking = false;
let helmutThinkingTimer = null;
let pipelineRunning = false;
let pipelineRunStep = 0;
let pipelineStepTimer = null;
let helmutTypingActive = false;
let helmutTypedText = "";
let helmutTypingFullText = "";
let helmutTypingTimer = null;
let selectedTaskHandoffId = "";
let generatedStatement = "";
let communicationContextTitle = "";
let officeDrafts = {};
let officeDraftsGenerating = false;
let selectedOfficeDraft = null;
let selectedCommunicationChannel = "press";
let berlinClockTimer = null;
const updateSeenStorageKey = "helmut:lastSeenUpdatesAt";
const officeSeenStorageKey = "helmut:lastSeenOfficeAt";
const helmutSeenStorageKey = "helmut:lastSeenHelmutAt";
const pushEnabledStorageKey = "helmut:pushEnabled";
let activePoliticianId = "cem-ince";
let previewMode = false;

// Account-Modus (HELMUT_AUTH_MODE=accounts). Bleibt null im Legacy-Pilotmodus,
// damit das bestehende Pilot-Code-Verhalten unveraendert ist.
let authState = null;
let currentUser = null;
let allowedProfiles = [];
let adminData = null;
let adminDataLoaded = false;
let adminLoadError = false;
let adminPeriod = "today";
let expandedAdminUsers = new Set();
let dailyInputs = [];
let dailyInputsLoaded = false;
let parliamentItems = [];
let parliamentLoaded = false;
let parliamentAssessments = {};
let expandedSections = new Set();
// Geführter Einstieg (Onboarding) beim ersten Öffnen eines Mandats mit leerem Profil.
let onboardingActive = false;
let onboardingStep = 0;
let onboardingDraft = {};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const USD_TO_EUR = 0.92;

function formatUsdEur(usd) {
  if (typeof usd !== "number") return "—";
  const eur = usd * USD_TO_EUR;
  return `$${usd.toFixed(4)} | €${eur.toFixed(4)}`;
}

// --- View-Persistenz ---
const VIEW_PERSIST_KEY = "helmut:view";
const VIEW_PERSIST_SAFE = new Set(["briefing", "radar", "helmut", "office", "tasks", "topics", "settings", "profile-settings", "admin", "daily-input"]);

function persistView(view) {
  if (!VIEW_PERSIST_SAFE.has(view)) return;
  try { localStorage.setItem(VIEW_PERSIST_KEY, view); } catch {}
}

function restorePersistedView() {
  try {
    const saved = localStorage.getItem(VIEW_PERSIST_KEY);
    if (!saved || !VIEW_PERSIST_SAFE.has(saved)) return;
    if (saved === "admin" && userRole() !== "admin") return;
    if (saved === "daily-input" && !["admin", "referent"].includes(userRole())) return;
    currentView = saved;
  } catch {}
}

// --- Theme (Dunkel / Hell / System) ---
const THEME_KEY = "helmut:theme";
function getThemePref() {
  try { return localStorage.getItem(THEME_KEY) || "system"; } catch { return "system"; }
}
function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
}
function applyThemePref(pref) {
  document.documentElement.setAttribute("data-theme", resolveTheme(pref));
}
function setThemePref(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch {}
  applyThemePref(pref);
  render();
}
(function watchSystemTheme() {
  try {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => { if (getThemePref() === "system") applyThemePref("system"); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch {}
  applyThemePref(getThemePref());
})();
const appStartCachePrefix = "helmut:lastStartPayload:v3";
const appStartCacheMaxAgeMs = 0;
const helmutFlowCooldownPrefix = "helmut:lastAssessmentFlow:v1";
const helmutFlowCooldownMs = 4 * 60 * 60 * 1000;
const pipelineCooldownKey = "helmut:lastPipelineRun:v1";
const pipelineCooldownMs = 10 * 60 * 1000;
let csrfTokenPromise = null;

const navItems = [
  ["briefing", "Lage"],
  ["radar", "Radar"],
  ["helmut", "Helmut"],
  ["office", "Büro"]
];

const mobileNavItems = [
  ["briefing", "Lage"],
  ["radar", "Radar"],
  ["helmut", "Helmut"],
  ["office", "Büro"]
];

const communicationChannels = [
  ["press", "Presse"],
  ["linkedin", "LinkedIn"],
  ["x", "X"],
  ["instagram", "Instagram"],
  ["committee_question", "Ausschussfrage"],
  ["citizen_dialogue", "Bürgerdialog"],
  ["internal_line", "Interne Linie"]
];

const officeHandoffMethods = [
  ["share", "Teilen"],
  ["email", "E-Mail"],
  ["whatsapp", "WhatsApp"],
  ["telegram", "Telegram"]
];

const OFFICE_FORMATS = [
  { id: "presse",       label: "Pressemitteilung",        icon: "ti-news",             channel: "press" },
  { id: "linkedin",     label: "LinkedIn",                icon: "ti-brand-linkedin",   channel: "linkedin" },
  { id: "x",           label: "X / Twitter",             icon: "ti-brand-x",          channel: "x" },
  { id: "instagram",   label: "Instagram",               icon: "ti-brand-instagram",  channel: "instagram" },
  { id: "anfrage",     label: "Parlamentarische Anfrage", icon: "ti-file-text",        channel: "committee_question" },
  { id: "rede",        label: "Rede",                    icon: "ti-microphone",       channel: "internal_line" },
  { id: "buergerbrief", label: "Bürgerbrief",            icon: "ti-mail",             channel: "citizen_dialogue" },
  { id: "intern",      label: "Interne Linie",           icon: "ti-lock",             channel: "internal_line" },
];

const mandateFunctions = [
  "Bundestagsabgeordneter",
  "Landtagsabgeordneter",
  "Fraktionsmitglied",
  "Ausschusssprecher",
  "Ministerium",
  "Referent"
];

const committeeOptions = [
  "Arbeit und Soziales",
  "Wirtschaft",
  "Digitales",
  "Bildung",
  "Inneres",
  "Verteidigung",
  "Europa",
  "Gesundheit",
  "Umwelt",
  "Verkehr"
];

const federalStateOptions = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen"
];

const constituencyOptionsByState = {
  "Niedersachsen": [
    "Salzgitter-Wolfenbüttel",
    "Braunschweig",
    "Gifhorn-Peine",
    "Goslar-Northeim-Osterode",
    "Göttingen",
    "Hannover-Land I",
    "Hannover-Land II",
    "Stadt Hannover I",
    "Stadt Hannover II",
    "Hildesheim",
    "Oldenburg-Ammerland",
    "Osnabrück-Land",
    "Osnabrück-Stadt"
  ],
  "Berlin": ["Berlin-Mitte", "Berlin-Pankow", "Berlin-Charlottenburg-Wilmersdorf", "Berlin-Friedrichshain-Kreuzberg-Prenzlauer Berg Ost", "Berlin-Neukölln"],
  "Hamburg": ["Hamburg-Mitte", "Hamburg-Altona", "Hamburg-Eimsbüttel", "Hamburg-Nord", "Hamburg-Wandsbek"],
  "Bremen": ["Bremen I", "Bremen II - Bremerhaven"],
  "Nordrhein-Westfalen": ["Köln I", "Köln II", "Düsseldorf I", "Dortmund I", "Essen I", "Bonn", "Münster", "Bielefeld-Gütersloh II"],
  "Bayern": ["München-Nord", "München-Ost", "München-Süd", "Nürnberg-Nord", "Nürnberg-Süd", "Augsburg-Stadt", "Regensburg"],
  "Baden-Württemberg": ["Stuttgart I", "Stuttgart II", "Karlsruhe-Stadt", "Freiburg", "Mannheim", "Heidelberg"],
  "Hessen": ["Frankfurt am Main I", "Frankfurt am Main II", "Wiesbaden", "Darmstadt", "Kassel"],
  "Sachsen": ["Dresden I", "Dresden II - Bautzen II", "Leipzig I", "Leipzig II", "Chemnitz"],
  "Sachsen-Anhalt": ["Magdeburg", "Halle", "Harz", "Dessau-Wittenberg"],
  "Schleswig-Holstein": ["Kiel", "Lübeck", "Flensburg-Schleswig", "Pinneberg"],
  "Thüringen": ["Erfurt-Weimar-Weimarer Land II", "Jena-Sömmerda-Weimarer Land I", "Gera-Greiz-Altenburger Land"],
  "Brandenburg": ["Potsdam", "Cottbus-Spree-Neiße", "Uckermark-Barnim I", "Dahme-Spreewald-Teltow-Fläming III"],
  "Mecklenburg-Vorpommern": ["Rostock-Landkreis Rostock II", "Schwerin-Ludwigslust-Parchim I", "Vorpommern-Rügen-Vorpommern-Greifswald I"],
  "Rheinland-Pfalz": ["Mainz", "Koblenz", "Trier", "Ludwigshafen/Frankenthal"],
  "Saarland": ["Saarbrücken", "Saarlouis", "St. Wendel"]
};

const priorityTopics = [
  "Arbeit",
  "Soziales",
  "Bürgergeld",
  "Mindestlohn",
  "Pflege",
  "Wohnen",
  "Migration",
  "Bildung",
  "Klima",
  "Energie",
  "Digitalisierung",
  "Außenpolitik",
  "Verteidigung",
  "Europa",
  "Familie",
  "Rente",
  "Gesundheit"
];

const communicationStyles = ["Sachlich", "Lösungsorientiert", "Angriffslustig", "Vermittelnd", "Aktivistisch"];

async function loadBriefing() {
  const params = new URLSearchParams(window.location.search);
  activePoliticianId = sanitizePoliticianId(params.get("politicianId") || params.get("profileId") || "cem-ince");
  previewMode = isPreviewModeParam(params);

  // Account-Modus erkennen: /api/auth/session ist nur dort eine JSON-Antwort.
  authState = await fetchAuthState();
  if (authState) {
    if (!authState.authenticated) {
      renderLogin();
      return;
    }
    currentUser = authState.user || null;
    allowedProfiles = Array.isArray(authState.profiles) ? authState.profiles : [];
    activePoliticianId = resolveAllowedActiveId(params);
  }

  const scope = apiScopeQuery();
  let renderedFromCache = false;
  const cachedStart = loadCachedStartPayload();
  if (cachedStart) {
    try {
      applyStartPayload(cachedStart);
      renderedFromCache = true;
      render();
      generateOfficeDraftsInBackground();
    } catch (error) {
      console.warn("Cached Helmut start payload ignored", error);
    }
  }

  try {
    const startResponse = await fetchWithTimeout(`/api/app/start?${scope}`, {}, renderedFromCache ? 15000 : 25000);

    if (startResponse.status === 401 || startResponse.status === 403) {
      if (authState) renderLogin();
      else renderPilotAccess();
      return;
    }
    if (!startResponse.ok) throw new Error(`Helmut konnte nicht gestartet werden (${startResponse.status})`);
    const startPayload = await startResponse.json();
    applyStartPayload(startPayload);
    saveCachedStartPayload(startPayload);
    restorePersistedView();
    render();
    ensureViewData(currentView);
    if (userRole() === "admin") ensureViewData("admin");
    loadParliament();
    generateOfficeDraftsInBackground();
  } catch (error) {
    if (renderedFromCache) {
      console.warn("Live update after cached start failed", error);
      showToast("Helmut aktualisiert im Hintergrund");
      return;
    }
    throw error;
  }
}

function applyStartPayload(startPayload) {
  profile = startPayload.profile || {};
  briefing = startPayload.briefing || {};
  briefing.items = Array.isArray(briefing.items) ? briefing.items : [];
  briefing.tasks = Array.isArray(briefing.tasks) ? briefing.tasks : [];
  briefing.personalizedRecommendations = Array.isArray(briefing.personalizedRecommendations) ? briefing.personalizedRecommendations : [];
  briefing.situationalBriefing = Array.isArray(briefing.situationalBriefing) ? briefing.situationalBriefing : [];
  previewMode = previewMode || Boolean(briefing.previewMode);
  aiStatus = startPayload.aiStatus || { enabled: false, model: "" };
  features = startPayload.features || {};
  briefing.status = previewMode ? "Vorschau" : (briefing.status || "Live");
  briefing.sourceStats = briefing.sourceStats || { checkedSources: 0, successfulSources: 0, failedSources: 0 };

  const persistedTasks = Array.isArray(startPayload.tasks) ? startPayload.tasks : [];
  notes = Array.isArray(startPayload.notes) ? startPayload.notes : [];
  tasks = mergeTasks(briefing.tasks || [], persistedTasks);
  recommendations = briefing.personalizedRecommendations || [];

  const themeSignalId = briefing.themeOfDay?.signalId;
  const activeItems = briefing.items.filter((item) => item.decision !== "Ignorieren" && hasPreciseSource(item));
  const personalizedItems = recommendations.map(recommendationToDecisionItem).filter(hasPreciseSource);
  const situationalItems = (briefing.situationalBriefing || []).map(situationalToDecisionItem).filter(hasPreciseSource);
  const prominentPool = (personalizedItems.length ? personalizedItems : (activeItems.length ? activeItems : situationalItems));
  decisions = prominentPool
    .filter(hasPreciseSource)
    .sort((a, b) => {
      if (a.signalId === themeSignalId) return -1;
      if (b.signalId === themeSignalId) return 1;
      return Number(b.priority || b.finalScore || b.totalScore || 0) - Number(a.priority || a.finalScore || a.totalScore || 0);
    })
    .slice(0, 3)
    .map(toDecision);

  selectedDecisionId = decisions[0]?.id || "";
  generatedStatement = decisions[0]?.statement || "";
  maybeStartOnboarding();
}

const ONBOARDING_STEPS = 7;

function renderOnboarding() {
  if (!onboardingActive) return "";
  const d = onboardingDraft;
  const mandateName = profile?.fullName || allowedProfiles.find((p) => p.id === activePoliticianId)?.name || "dein Mandat";
  let body = "";
  if (onboardingStep === 0) {
    body = `
      <h2>Willkommen bei Helmut.</h2>
      <p class="onboarding-lead">Lass uns ${escapeHtml(mandateName)} in unter 2 Minuten einrichten, damit dein Briefing sofort passt.</p>
      <p class="onboarding-note">Diese Angaben nutzt Helmut nur zur Personalisierung deiner Briefings. Du kannst sie jederzeit ändern oder löschen.</p>`;
  } else if (onboardingStep === 1) {
    body = `
      <h2>Partei & Fraktion</h2>
      <label>Partei<input name="party" type="text" value="${escapeAttribute(d.party || "")}" placeholder="z. B. SPD" /></label>
      <label>Fraktion<input name="faction" type="text" value="${escapeAttribute(d.faction || "")}" placeholder="z. B. SPD-Bundestagsfraktion" /></label>`;
  } else if (onboardingStep === 2) {
    body = `
      <h2>Ausschuss</h2>
      <label>Dein (Haupt-)Ausschuss
        <input name="committee" type="text" list="onboardingCommittees" value="${escapeAttribute(d.committee || "")}" placeholder="z. B. Gesundheit" />
      </label>
      <datalist id="onboardingCommittees">${committeeOptions.map((c) => `<option value="${escapeAttribute(c)}"></option>`).join("")}</datalist>`;
  } else if (onboardingStep === 3) {
    const selected = new Set(d.focusTopics || []);
    body = `
      <h2>Schwerpunktthemen</h2>
      <p class="onboarding-note">Wähle aus, was für dein Mandat zählt — das steuert deine Top-Themen.</p>
      <div class="onboarding-chips">
        ${priorityTopics.map((t) => `<label class="onboarding-chip"><input type="checkbox" name="focusTopic" value="${escapeAttribute(t)}" ${selected.has(t) ? "checked" : ""}/> ${escapeHtml(t)}</label>`).join("")}
      </div>
      <label>Weitere Themen (Komma-getrennt)<input name="focusTopicsFree" type="text" placeholder="z. B. Krankenhausreform, Prävention" /></label>`;
  } else if (onboardingStep === 4) {
    body = `
      <h2>Region & Stil</h2>
      <label>Wahlkreis<input name="constituency" type="text" value="${escapeAttribute(d.constituency || "")}" placeholder="z. B. Berlin-Mitte" /></label>
      <label>Bundesland<input name="state" type="text" value="${escapeAttribute(d.state || "")}" placeholder="z. B. Berlin" /></label>
      <label>Kommunikationsstil
        <select name="communicationStyle">${communicationStyles.map((s) => `<option value="${escapeAttribute(s)}" ${d.communicationStyle === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select>
      </label>`;
  } else if (onboardingStep === 5) {
    const selectedFormats = new Set(d.officeFormats || ["presse", "linkedin"]);
    body = `
      <h2>Büro-Formate</h2>
      <p class="onboarding-note">Was soll Helmut automatisch vorbereiten, wenn dein Briefing kommt? Du kannst das jederzeit in den Einstellungen ändern.</p>
      <div class="onboarding-chips">
        ${OFFICE_FORMATS.map((f) => `<label class="onboarding-chip"><input type="checkbox" name="officeFormat" value="${escapeAttribute(f.id)}" ${selectedFormats.has(f.id) ? "checked" : ""}/> ${escapeHtml(f.label)}</label>`).join("")}
      </div>`;
  } else {
    body = `
      <h2>Risiken & Chancen (optional)</h2>
      <label>Risiko-Themen (Komma-getrennt)<input name="riskTopics" type="text" value="${escapeAttribute(d.riskTopics || "")}" placeholder="z. B. Klinikschließungen" /></label>
      <label>Chancen-Themen (Komma-getrennt)<input name="opportunityTopics" type="text" value="${escapeAttribute(d.opportunityTopics || "")}" placeholder="z. B. Pflege-Offensive" /></label>
      <p class="onboarding-note">Fertig — danach ist Helmut auf dich eingestellt.</p>`;
  }
  const isFirst = onboardingStep === 0;
  const isLast = onboardingStep === ONBOARDING_STEPS - 1;
  return `
    <div class="onboarding-layer">
      <form class="onboarding-card" id="onboardingForm" onsubmit="return false">
        <div class="onboarding-progress">Schritt ${onboardingStep + 1} von ${ONBOARDING_STEPS}</div>
        <div class="onboarding-body">${body}</div>
        <div class="onboarding-actions">
          ${!isFirst ? `<button type="button" class="secondary-button" data-onboard-back>Zurück</button>` : ""}
          <button type="button" class="account-logout" data-onboard-skip>Später</button>
          ${isLast
            ? `<button type="button" class="primary-button" data-onboard-finish>Fertig & speichern</button>`
            : `<button type="button" class="primary-button" data-onboard-next>${isFirst ? "Los geht's" : "Weiter"}</button>`}
        </div>
      </form>
    </div>
  `;
}

function captureOnboardingStep() {
  const root = document.querySelector("#onboardingForm");
  if (!root) return;
  root.querySelectorAll("input[type=text], textarea, select").forEach((el) => {
    if (el.name && el.name !== "focusTopicsFree") onboardingDraft[el.name] = el.value;
  });
  if (root.querySelector("input[name='focusTopic']")) {
    const checked = Array.from(root.querySelectorAll("input[name='focusTopic']:checked")).map((c) => c.value);
    const free = root.querySelector("input[name='focusTopicsFree']");
    const extra = free ? String(free.value || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
    onboardingDraft.focusTopics = Array.from(new Set([...checked, ...extra]));
  }
  if (root.querySelector("input[name='officeFormat']")) {
    onboardingDraft.officeFormats = Array.from(root.querySelectorAll("input[name='officeFormat']:checked")).map((c) => c.value);
  }
}

async function finishOnboarding(skip) {
  onboardingActive = false;
  const now = new Date().toISOString();
  const payload = skip
    ? { id: activePoliticianId, onboardedAt: now }
    : {
        id: activePoliticianId,
        onboardedAt: now,
        party: onboardingDraft.party,
        faction: onboardingDraft.faction,
        committee: onboardingDraft.committee,
        committees: onboardingDraft.committee ? [onboardingDraft.committee] : undefined,
        focusTopics: Array.isArray(onboardingDraft.focusTopics) ? onboardingDraft.focusTopics : undefined,
        constituency: onboardingDraft.constituency,
        state: onboardingDraft.state,
        communicationStyle: onboardingDraft.communicationStyle,
        riskTopics: String(onboardingDraft.riskTopics || "").split(",").map((s) => s.trim()).filter(Boolean),
        opportunityTopics: String(onboardingDraft.opportunityTopics || "").split(",").map((s) => s.trim()).filter(Boolean),
        officeFormats: Array.isArray(onboardingDraft.officeFormats) ? onboardingDraft.officeFormats : ["presse", "linkedin"]
      };
  render();
  try {
    const res = await apiSend("PATCH", `/api/profile/current?${apiScopeQuery()}`, payload);
    if (res.ok && res.json) profile = res.json;
    showToast(skip ? "Du kannst dein Profil jederzeit in den Einstellungen ergänzen." : "Profil eingerichtet — Helmut ist startklar.");
  } catch (error) {
    console.warn("Onboarding speichern fehlgeschlagen", error);
  }
  render();
}

function bindOnboarding() {
  const next = app.querySelector("[data-onboard-next]");
  if (next) next.addEventListener("click", () => { captureOnboardingStep(); onboardingStep = Math.min(ONBOARDING_STEPS - 1, onboardingStep + 1); render(); });
  const back = app.querySelector("[data-onboard-back]");
  if (back) back.addEventListener("click", () => { captureOnboardingStep(); onboardingStep = Math.max(0, onboardingStep - 1); render(); });
  const skip = app.querySelector("[data-onboard-skip]");
  if (skip) skip.addEventListener("click", () => finishOnboarding(true));
  const finish = app.querySelector("[data-onboard-finish]");
  if (finish) finish.addEventListener("click", () => { captureOnboardingStep(); finishOnboarding(false); });
}

// Zeigt den geführten Einstieg, wenn ein Abgeordneter oder zugewiesener Referent
// ein Mandat mit noch nicht eingerichtetem Profil zum ersten Mal öffnet.
function maybeStartOnboarding() {
  if (!isAccountMode() || onboardingActive) return;
  if (!["abgeordneter", "referent"].includes(userRole())) return;
  if (!profile || profile.onboardedAt) return;
  onboardingActive = true;
  onboardingStep = 0;
  onboardingDraft = {
    party: profile.party || "",
    faction: profile.faction || "",
    committee: profile.committee || (profile.committees || [])[0] || "",
    focusTopics: Array.isArray(profile.focusTopics) ? [...profile.focusTopics] : [],
    constituency: profile.constituency || "",
    state: profile.state || "",
    communicationStyle: profile.communicationStyle || "Sachlich",
    riskTopics: (profile.riskTopics || []).join(", "),
    opportunityTopics: (profile.opportunityTopics || []).join(", ")
  };
}

function loadCachedStartPayload() {
  clearCachedStartPayload();
  return null;
}

function saveCachedStartPayload(payload) {
  clearCachedStartPayload();
}

function clearCachedStartPayload() {
  try {
    window.localStorage.removeItem(appStartCacheKey());
  } catch {
    // localStorage can be unavailable in private or restricted browser modes.
  }
}

function appStartCacheKey() {
  return `${appStartCachePrefix}:${activePoliticianId}:${previewMode ? "preview" : "live"}`;
}

async function ensureViewData(view) {
  if (view === "radar" && !radarArchiveLoaded) {
    radarArchiveLoaded = true;
    try {
      const response = await fetchWithTimeout(`/api/radar/archive?${apiScopeQuery()}&days=365`);
      const archivePayload = response.ok ? await response.json() : { articles: [] };
      radarArchive = Array.isArray(archivePayload.articles) ? archivePayload.articles : [];
    } catch (error) {
      radarArchiveLoaded = false;
      console.warn("Radar archive not loaded", error);
    }
    render();
  }
  if (view === "admin" && !adminDataLoaded) {
    adminDataLoaded = true;
    adminLoadError = false;
    try {
      const response = await fetchWithTimeout(`/api/admin/overview?${apiScopeQuery()}`, {}, 20000);
      if (response.status === 401 || response.status === 403) {
        adminLoadError = true;
      } else {
        adminData = response.ok ? await response.json() : null;
        if (!adminData) adminLoadError = true;
      }
    } catch (error) {
      adminDataLoaded = false;
      adminLoadError = true;
      console.warn("Admin overview not loaded", error);
    }
    render();
  }
  if (view === "daily-input" && !dailyInputsLoaded) {
    dailyInputsLoaded = true;
    try {
      const response = await fetchWithTimeout(`/api/daily-inputs?${apiScopeQuery()}`);
      const payload = response.ok ? await response.json() : { inputs: [] };
      dailyInputs = Array.isArray(payload.inputs) ? payload.inputs : [];
    } catch (error) {
      dailyInputsLoaded = false;
      console.warn("Daily inputs not loaded", error);
    }
    render();
  }
  if ((view === "settings" || view === "profile-settings") && !opsStatusLoaded) {
    opsStatusLoaded = true;
    try {
      const [response, pushResponse] = await Promise.all([
        fetchWithTimeout(`/api/ops/status?${apiScopeQuery()}`),
        fetchWithTimeout(`/api/push/public-key?${apiScopeQuery()}`).catch(() => null)
      ]);
      opsStatus = response.ok ? await response.json() : null;
      pushConfig = pushResponse?.ok ? await pushResponse.json() : null;
    } catch (error) {
      opsStatusLoaded = false;
      console.warn("Ops status not loaded", error);
    }
    render();
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const preparedOptions = await prepareRequestOptions(url, options);
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`Zeitüberschreitung beim Laden: ${url}`)), timeoutMs);
  });
  return Promise.race([fetch(url, preparedOptions), timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function prepareRequestOptions(url, options = {}) {
  if (!needsCsrfToken(url, options)) return options;
  const headers = new Headers(options.headers || {});
  headers.set("X-CSRF-Token", await getCsrfToken());
  return { ...options, headers };
}

function needsCsrfToken(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") return true;
  return ["/api/pipeline/run", "/api/crawl/run", "/api/lage/check", "/api/briefing/run"].some((path) => String(url).startsWith(path));
}

async function getCsrfToken() {
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch(`/api/security/csrf?${apiScopeQuery()}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("CSRF token request failed");
        return response.json();
      })
      .then((payload) => payload.token);
  }
  return csrfTokenPromise;
}

function renderPilotAccess(message = "") {
  hideStartupSplash();
  app.innerHTML = `
    <section class="loading-card pilot-access-card">
      <div class="loading-logo"><span>H</span></div>
      <p>Helmut</p>
      <h1>Pilot-Zugang.</h1>
      <p class="pilot-access-copy">Gib den Zugangscode ein, um deine politische Lage zu öffnen.</p>
      <form class="pilot-access-form" id="pilotAccessForm">
        <input name="secret" type="password" autocomplete="current-password" placeholder="Zugangscode" aria-label="Zugangscode" />
        <button class="primary-button" type="submit">Helmut öffnen</button>
        <small id="pilotAccessError">${escapeHtml(message)}</small>
      </form>
    </section>
  `;
  const form = document.querySelector("#pilotAccessForm");
  const input = form?.querySelector("input");
  const error = document.querySelector("#pilotAccessError");
  window.setTimeout(() => input?.focus(), 50);
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (error) error.textContent = "";
    const secret = String(new FormData(form).get("secret") || "").trim();
    try {
      const response = await fetch("/api/pilot/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret })
      });
      if (!response.ok) {
        if (error) error.textContent = "Der Zugangscode stimmt nicht.";
        return;
      }
      window.location.reload();
    } catch {
      if (error) error.textContent = "Zugang konnte nicht geprüft werden. Bitte erneut versuchen.";
    }
  });
}

// ---------------------------------------------------------------------------
// Account-Modus: Session, Login, Logout, Mandatsauswahl, Rollen
// ---------------------------------------------------------------------------

function isAccountMode() {
  return Boolean(authState);
}

function userRole() {
  return currentUser?.role || "";
}

const EYE_OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

// Schaltet Passwortfelder zwischen verdeckt/sichtbar. data-toggle-password trägt
// die id des zugehörigen Eingabefelds.
function bindPasswordToggles(root) {
  (root || document).querySelectorAll("[data-toggle-password]").forEach((button) => {
    if (button.dataset.toggleBound === "1") return;
    button.dataset.toggleBound = "1";
    button.addEventListener("click", () => {
      const input = (root || document).querySelector(`#${button.dataset.togglePassword}`);
      if (!input) return;
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      if (button.querySelector("svg")) {
        button.innerHTML = reveal ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
      } else {
        button.textContent = reveal ? "Verbergen" : "Anzeigen";
      }
      button.setAttribute("aria-label", reveal ? "Passwort verbergen" : "Passwort anzeigen");
    });
  });
}

async function fetchAuthState() {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return null;
    if (!String(res.headers.get("content-type") || "").includes("application/json")) return null;
    const data = await res.json();
    return typeof data.authenticated === "boolean" ? data : null;
  } catch {
    return null;
  }
}

// Waehlt das aktive Mandat innerhalb der erlaubten Profile. URL-Param zaehlt nur,
// wenn es freigegeben ist; sonst Fallback auf das erste erlaubte Mandat.
function resolveAllowedActiveId(params) {
  const requested = sanitizePoliticianId(params.get("politicianId") || params.get("profileId") || "");
  if (userRole() === "abgeordneter") return currentUser?.politicianId || requested;
  const ids = allowedProfiles.map((entry) => entry.id);
  if (authState?.allowedPoliticians === "all") return requested || ids[0] || requested;
  if (requested && ids.includes(requested)) return requested;
  return ids[0] || requested;
}

function renderLogin(message = "") {
  hideStartupSplash();
  app.innerHTML = `
    <div class="login-screen">
      <section class="loading-card pilot-access-card">
        <div class="loading-logo"><span>H</span></div>
        <p>Helmut</p>
        <h1>Anmeldung</h1>
        <p class="pilot-access-copy">Melde dich mit deinem Helmut Konto an, um dein persönliches Briefing zu öffnen.</p>
        <form class="pilot-access-form" id="loginForm">
          <input name="email" type="email" autocomplete="username" placeholder="E-Mail" aria-label="E-Mail" required />
          <div class="password-field">
            <input name="password" id="loginPassword" type="password" autocomplete="current-password" placeholder="Passwort" aria-label="Passwort" required />
            <button type="button" class="password-toggle password-toggle--icon" data-toggle-password="loginPassword" aria-label="Passwort anzeigen">${EYE_OPEN_SVG}</button>
          </div>
          <button class="primary-button" type="submit" disabled>Anmelden</button>
          <small id="loginError">${escapeHtml(message)}</small>
        </form>
      </section>
    </div>
  `;
  const form = document.querySelector("#loginForm");
  const error = document.querySelector("#loginError");
  const submitBtn = form?.querySelector('button[type="submit"]');
  bindPasswordToggles(document);
  window.setTimeout(() => form?.querySelector("input")?.focus(), 50);
  function syncSubmit() {
    if (!submitBtn) return;
    const fd = new FormData(form);
    submitBtn.disabled = !String(fd.get("email") || "").trim() || !String(fd.get("password") || "");
  }
  form?.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", syncSubmit));
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (error) error.textContent = "";
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        let msg = "E-Mail oder Passwort ist nicht korrekt.";
        try {
          const payload = await res.json();
          if (payload && payload.error) msg = payload.error;
        } catch {}
        if (error) error.textContent = msg;
        return;
      }
      window.location.reload();
    } catch {
      if (error) error.textContent = "Anmeldung fehlgeschlagen. Bitte erneut versuchen.";
    }
  });
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  try { localStorage.removeItem(VIEW_PERSIST_KEY); } catch {}
  window.location.reload();
}

async function switchPolitician(id) {
  const next = sanitizePoliticianId(id);
  if (!next || next === activePoliticianId) return;
  activePoliticianId = next;
  radarArchiveLoaded = false;
  opsStatusLoaded = false;
  adminDataLoaded = false;
  adminLoadError = false;
  adminData = null;
  dailyInputsLoaded = false;
  csrfTokenPromise = null;
  try {
    const res = await fetchWithTimeout(`/api/app/start?${apiScopeQuery()}`);
    if (res.ok) applyStartPayload(await res.json());
  } catch (error) {
    console.warn("Mandatswechsel fehlgeschlagen", error);
  }
  currentView = "briefing";
  render();
}

function roleLabel(role) {
  return ({ admin: "Admin", abgeordneter: "Abgeordnete:r", referent: "Referent:in", demo: "Demo" })[role] || role || "";
}

const USER_STATUS_OPTIONS = [
  ["aktiv", "Aktiv"],
  ["testphase", "Testphase"],
  ["pausiert", "Pausiert"],
  ["gekuendigt", "Gekündigt"],
  ["deaktiviert", "Deaktiviert"]
];

const PAYMENT_STATUS_OPTIONS = [
  ["none", "Nicht relevant"],
  ["open", "Offen"],
  ["paid", "Bezahlt"],
  ["overdue", "Überfällig"]
];

function statusLabel(status) {
  return (Object.fromEntries(USER_STATUS_OPTIONS))[status] || "Aktiv";
}

function paymentStatusLabel(status) {
  return (Object.fromEntries(PAYMENT_STATUS_OPTIONS))[status] || "Nicht relevant";
}

function formatCreatedAt(isoDate) {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Account-Leiste (Nutzer, Mandatsauswahl, Logout) fuer die Topbar im Account-Modus.
function renderAccountBar() {
  if (!isAccountMode() || !currentUser) return "";
  const showSwitcher = allowedProfiles.length > 1;
  const switcher = showSwitcher
    ? `<select class="account-switch" data-profile-switch aria-label="Mandat wählen">
        ${allowedProfiles.map((entry) => `<option value="${escapeAttribute(entry.id)}" ${entry.id === activePoliticianId ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}
      </select>`
    : "";
  return `
    <div class="account-bar">
      ${switcher}
      <span class="account-chip" title="${escapeAttribute(currentUser.email || "")}">${escapeHtml(currentUser.name || currentUser.email || "")} · ${escapeHtml(roleLabel(currentUser.role))}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Tagesinput-Ansicht (Referent/Admin): bis zu N Termine/Themen pro Tag
// ---------------------------------------------------------------------------

function renderDailyInputView() {
  const max = 3;
  const mandateName = allowedProfiles.find((entry) => entry.id === activePoliticianId)?.name || profile?.fullName || activePoliticianId;
  const remaining = Math.max(0, max - dailyInputs.length);
  const list = dailyInputs.length
    ? dailyInputs.map((entry) => `
        <article class="admin-card daily-input-item">
          <div class="daily-input-head">
            <strong>${escapeHtml(entry.title)}</strong>
            ${entry.datetime ? `<span class="daily-input-time">${escapeHtml(entry.datetime)}</span>` : ""}
            <button class="account-logout" type="button" data-remove-daily-input="${escapeAttribute(entry.id)}">Entfernen</button>
          </div>
          ${entry.context ? `<p><b>Kontext:</b> ${escapeHtml(entry.context)}</p>` : ""}
          ${entry.goal ? `<p><b>Ziel:</b> ${escapeHtml(entry.goal)}</p>` : ""}
          ${entry.desiredPrep ? `<p><b>Gewünschte Vorbereitung:</b> ${escapeHtml(entry.desiredPrep)}</p>` : ""}
        </article>
      `).join("")
    : `<p class="empty-state">Noch keine Termine/Themen für heute eingetragen.</p>`;

  const form = remaining > 0
    ? `
      <form class="admin-card admin-form" id="dailyInputForm">
        <h3>Termin/Thema hinzufügen</h3>
        <input name="title" type="text" placeholder="Titel (z. B. Plenardebatte Rente)" aria-label="Titel" required />
        <input name="datetime" type="text" placeholder="Uhrzeit/Datum (z. B. 10:00 oder 26.06. 10:00)" aria-label="Uhrzeit/Datum" />
        <textarea name="context" rows="2" placeholder="Kontext" aria-label="Kontext"></textarea>
        <textarea name="goal" rows="2" placeholder="Ziel" aria-label="Ziel"></textarea>
        <textarea name="desiredPrep" rows="2" placeholder="Gewünschte Vorbereitung" aria-label="Gewünschte Vorbereitung"></textarea>
        <button class="primary-button" type="submit">Hinzufügen</button>
        <small class="admin-form-error" id="dailyInputError"></small>
      </form>`
    : `<p class="empty-state">Tageslimit erreicht (${max} Einträge). Entferne einen Eintrag, um Platz zu schaffen.</p>`;

  return `
    <section class="page-intro executive-intro">
      <span class="eyebrow-line">Büro · Tagesinput</span>
      <h1 class="hero-title">Die wichtigsten Termine/Themen heute.</h1>
      <p>Mandat: ${escapeHtml(mandateName)} · ${dailyInputs.length}/${max} eingetragen</p>
    </section>
    <div class="admin-grid">
      ${list}
      ${form}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Admin-Ansicht: Nutzer, Profile, Assignments, System, Fehler, Audit
// ---------------------------------------------------------------------------

function renderAdminView() {
  if (userRole() !== "admin") return `<section class="page-intro"><h1 class="hero-title">Kein Zugriff.</h1></section>`;
  if (!adminData) {
    if (adminLoadError) {
      return `
        <section class="page-intro executive-intro">
          <span class="eyebrow-line">Verwaltung</span>
          <h1 class="hero-title">Admin</h1>
          <p style="color:var(--muted-2);margin-bottom:16px">Admin-Daten konnten nicht geladen werden.</p>
          <button class="secondary-button" type="button" data-reload-admin>Neu laden</button>
        </section>`;
    }
    return `
      <section class="page-intro executive-intro">
        <span class="eyebrow-line">Verwaltung</span>
        <h1 class="hero-title">Admin</h1>
        <div class="skeleton-stack" aria-busy="true" aria-label="Admin-Daten werden geladen">
          <div class="skeleton skeleton-line short"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
        </div>
      </section>`;
  }
  const data = adminData;
  const mandateOptions = adminMandateOptions();
  const referenten = (data.users || []).filter((user) => user.role === "referent");
  const feedbackCountByUser = {};
  (Array.isArray(data.feedback) ? data.feedback : []).forEach((item) => {
    if (item.userId) feedbackCountByUser[item.userId] = (feedbackCountByUser[item.userId] || 0) + 1;
  });

  const userRows = (data.users || []).map((user) => {
    const billingDays = user.paidUntil ? Math.ceil((new Date(user.paidUntil) - Date.now()) / 86400000) : null;
    const billingBadge = !user.paidUntil
      ? ""
      : billingDays > 7
        ? `<span class="admin-pill billing-ok">✓ bis ${new Date(user.paidUntil).toLocaleDateString("de-DE")}</span>`
        : billingDays >= 0
          ? `<span class="admin-pill billing-warn">⚠ ${billingDays}d noch</span>`
          : `<span class="admin-pill billing-overdue">✕ überfällig</span>`;
    const billingInput = user.paidUntil
      ? `<input type="date" class="billing-date-input" data-billing-user="${escapeAttribute(user.id)}" value="${user.paidUntil.slice(0, 10)}" title="Bezahlt bis" />`
      : "";
    const initials = (user.name || user.email || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const status = user.status || (user.active === false ? "deaktiviert" : "aktiv");
    const isExpanded = expandedAdminUsers.has(user.id);
    const lastSeen = user.lastSeenAt || user.lastLoginAt;
    const daysSince = lastSeen ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86400000) : null;
    const activityBadge = daysSince === null
      ? `<span class="admin-activity-badge admin-activity-none">Nie</span>`
      : daysSince <= 7
        ? `<span class="admin-activity-badge admin-activity-active">Aktiv</span>`
        : daysSince <= 30
          ? `<span class="admin-activity-badge admin-activity-idle">Vor ${daysSince}d</span>`
          : `<span class="admin-activity-badge admin-activity-idle">Vor ${Math.floor(daysSince / 30)}M</span>`;
    return `
    <tr>
      <td data-label="Name">
        <div class="admin-user-cell">
          <span class="admin-avatar">${escapeHtml(initials)}</span>
          <div class="admin-user-info">
            <strong class="admin-user-name">${escapeHtml(user.name || "")}</strong>
            <span class="admin-user-email">${escapeHtml(user.email || "")}</span>
          </div>
        </div>
      </td>
      <td data-label="Rolle"><span class="admin-role-tag admin-role-${escapeAttribute(user.role)}">${escapeHtml(roleLabel(user.role))}</span></td>
      <td data-label="Status"><span class="admin-status-tag admin-status-${escapeAttribute(status)}">${escapeHtml(statusLabel(status))}</span></td>
      <td data-label="Aktivität">${activityBadge}</td>
      <td data-label="Bezahlt bis" class="billing-cell">
        ${billingBadge}${billingInput}
      </td>
      <td data-label="Aktion" class="admin-actions-cell">
        <button class="account-logout admin-edit-toggle" type="button" data-admin-user-edit="${escapeAttribute(user.id)}">${isExpanded ? "Schließen" : "Bearbeiten"}</button>
        <button class="account-logout" type="button" data-toggle-user="${escapeAttribute(user.id)}" data-active="${user.active === false ? "0" : "1"}">${user.active === false ? "Aktivieren" : "Deaktivieren"}</button>
      </td>
    </tr>
    ${isExpanded ? renderAdminUserEditRow(user, status, feedbackCountByUser[user.id] || 0) : ""}`;
  }).join("");

  const assignmentRows = (data.assignments || []).length
    ? data.assignments.map((entry) => {
        const u = (data.users || []).find((user) => user.id === entry.userId);
        return `<tr>
          <td data-label="Referent:in">${escapeHtml(u ? (u.name || u.email) : entry.userId)}</td>
          <td data-label="Mandat">${escapeHtml(entry.politicianId)}</td>
          <td data-label="Aktion" class="admin-actions-cell"><button class="account-logout" type="button" data-remove-assignment data-user="${escapeAttribute(entry.userId)}" data-mandate="${escapeAttribute(entry.politicianId)}">Entfernen</button></td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="3" class="empty-state">Noch keine Zuweisungen.</td></tr>`;

  const errors = (data.recentErrors || []).slice(0, 12);
  const audit = (data.auditEvents || []).slice(0, 15);
  const sys = data.system || {};
  const feedback = Array.isArray(data.feedback) ? data.feedback : [];
  const mandates = Array.isArray(data.mandates) ? data.mandates : [];

  return `
    <div class="admin-page">

      <header class="admin-header">
        <span class="eyebrow-line">Verwaltung</span>
        <h1 class="admin-title">Admin</h1>
        <p class="admin-subtitle">Nutzer, Rollen und Zuweisungen verwalten.</p>
      </header>

      <div class="admin-period-toggle">
        <button class="admin-period-btn${adminPeriod === "today" ? " is-active" : ""}" type="button" data-admin-period="today">Heute</button>
        <button class="admin-period-btn${adminPeriod === "days30" ? " is-active" : ""}" type="button" data-admin-period="days30">30 Tage</button>
      </div>

      <div class="admin-stats-row admin-stats-row--5">
        <div class="admin-stat-card">
          <span class="admin-stat-num">${data.counts?.users ?? 0}</span>
          <span class="admin-stat-label">Nutzer</span>
        </div>
        <div class="admin-stat-card">
          <span class="admin-stat-num">${data.stats?.[adminPeriod]?.articles ?? "—"}</span>
          <span class="admin-stat-label">Artikel</span>
        </div>
        <div class="admin-stat-card">
          <span class="admin-stat-num">${data.stats?.[adminPeriod]?.kos ?? "—"}</span>
          <span class="admin-stat-label">KOs</span>
        </div>
        <div class="admin-stat-card">
          <span class="admin-stat-num">${data.stats?.[adminPeriod]?.briefings ?? "—"}</span>
          <span class="admin-stat-label">Briefings</span>
        </div>
        <div class="admin-stat-card">
          ${(function() {
            const cost = data.stats?.[adminPeriod]?.totalCostUsd;
            return typeof cost === "number"
              ? `<span class="admin-stat-num admin-stat-num--cost">$${cost.toFixed(3)}</span><span class="admin-stat-sub">€${(cost * USD_TO_EUR).toFixed(3)}</span>`
              : `<span class="admin-stat-num admin-stat-num--cost">—</span>`;
          })()}
          <span class="admin-stat-label">KI-Kosten</span>
        </div>
      </div>

      <div class="admin-charts-row">
        ${renderAdminEngineChart(data.stats?.[adminPeriod])}
        ${renderAdminCostsCard(data.stats?.[adminPeriod])}
      </div>

      ${renderAdminCrawlStats(data.crawlReport)}

      <div class="admin-body">
        <div class="admin-col-primary">

          <div class="admin-card admin-card-flush">
            <div class="admin-card-header">
              <div>
                <h2 class="admin-section-title">Nutzerverwaltung</h2>
                <p class="admin-section-sub">Alle Nutzer im System</p>
              </div>
            </div>
            <div class="admin-table-wrap">
              <table class="admin-table">
                <thead><tr><th>Name</th><th>Rolle</th><th>Status</th><th>Aktivität</th><th>Bezahlt bis</th><th></th></tr></thead>
                <tbody>${userRows}</tbody>
              </table>
            </div>
            <div class="admin-subsection">
              <p class="admin-subsection-label">Passwort zurücksetzen</p>
              <form class="admin-inline-form" id="resetPasswordForm">
                <select name="userId" aria-label="Nutzer">
                  ${(data.users || []).map((user) => `<option value="${escapeAttribute(user.id)}">${escapeHtml(user.name || user.email)}</option>`).join("")}
                </select>
                <div class="password-field" style="flex:1; min-width:160px;">
                  <input name="password" id="resetPasswordInput" type="password" placeholder="Neues Passwort (min. 8)" aria-label="Neues Passwort" autocomplete="new-password" />
                  <button type="button" class="password-toggle" data-toggle-password="resetPasswordInput" aria-label="Passwort anzeigen">Anzeigen</button>
                </div>
                <button class="secondary-button" type="submit">Zurücksetzen</button>
              </form>
              <small class="admin-form-error" id="resetPasswordError"></small>
            </div>
          </div>

          <div class="admin-card admin-card-flush">
            <div class="admin-card-header">
              <div>
                <h2 class="admin-section-title">Zuweisungen</h2>
                <p class="admin-section-sub">Referent:in → Mandat</p>
              </div>
            </div>
            <div class="admin-table-wrap">
              <table class="admin-table">
                <thead><tr><th>Referent:in</th><th>Mandat</th><th></th></tr></thead>
                <tbody>${assignmentRows}</tbody>
              </table>
            </div>
            <div class="admin-subsection">
              <p class="admin-subsection-label">Neue Zuweisung</p>
              <form class="admin-inline-form" id="assignForm">
                <select name="userId" aria-label="Referent:in">
                  ${referenten.map((user) => `<option value="${escapeAttribute(user.id)}">${escapeHtml(user.name || user.email)}</option>`).join("") || `<option value="">— keine Referent:innen —</option>`}
                </select>
                <select name="politicianId" aria-label="Mandat">
                  ${mandateOptions.map((entry) => `<option value="${escapeAttribute(entry.id)}">${escapeHtml(entry.name)}</option>`).join("")}
                </select>
                <button class="primary-button" type="submit">Zuweisen</button>
              </form>
              <small class="admin-form-error" id="assignError"></small>
            </div>
          </div>

        </div>

        <div class="admin-col-secondary">

          <form class="admin-card admin-card-flush admin-create-form" id="createUserForm">
            <div class="admin-card-header">
              <div>
                <h2 class="admin-section-title">Nutzer anlegen</h2>
                <p class="admin-section-sub">Neuen Nutzer im System erstellen</p>
              </div>
            </div>
            <div class="admin-field-group">
              <input name="name" type="text" placeholder="Vollständiger Name" aria-label="Name" required />
              <input name="email" type="email" placeholder="name@bundestag.de" aria-label="E-Mail" required />
              <select name="role" aria-label="Rolle">
                <option value="abgeordneter">Abgeordnete:r</option>
                <option value="referent">Referent:in</option>
                <option value="demo">Demo</option>
                <option value="admin">Administrator</option>
              </select>
              <div class="password-field">
                <input name="password" id="createUserPassword" type="password" placeholder="Mind. 8 Zeichen" aria-label="Passwort" autocomplete="new-password" required />
                <button type="button" class="password-toggle" data-toggle-password="createUserPassword" aria-label="Passwort anzeigen">Anzeigen</button>
              </div>
            </div>
            <div class="admin-quickstart">
              <p class="admin-quickstart-hint">Schnellstart <span class="admin-quickstart-opt">(optional)</span></p>
              <select name="party" aria-label="Partei / Fraktion">
                <option value="">Partei / Fraktion</option>
                <option>SPD</option>
                <option>CDU</option>
                <option>CSU</option>
                <option>Bündnis 90/Die Grünen</option>
                <option>FDP</option>
                <option>AfD</option>
                <option>BSW</option>
                <option>Die Linke</option>
                <option>SSW</option>
                <option>Fraktionslos</option>
              </select>
              <select name="committee" aria-label="Ausschuss">
                <option value="">Ausschuss wählen</option>
                <option>Auswärtiger Ausschuss</option>
                <option>Innenausschuss</option>
                <option>Rechtsausschuss</option>
                <option>Finanzausschuss</option>
                <option>Haushaltsausschuss</option>
                <option>Wirtschaftsausschuss</option>
                <option>Arbeit und Soziales</option>
                <option>Verteidigungsausschuss</option>
                <option>Ernährung und Landwirtschaft</option>
                <option>Familienausschuss</option>
                <option>Gesundheitsausschuss</option>
                <option>Verkehrsausschuss</option>
                <option>Umweltausschuss</option>
                <option>Bildung und Forschung</option>
                <option>Digitales</option>
                <option>Wohnungsbau</option>
                <option>Sportausschuss</option>
                <option>Tourismus</option>
                <option>Europaausschuss</option>
                <option>Wirtschaftliche Zusammenarbeit</option>
                <option>Petitionsausschuss</option>
              </select>
              <input name="constituency" type="text" placeholder="Wahlkreis (z. B. 096 – Köln I)" aria-label="Wahlkreis" />
              <select name="state" aria-label="Bundesland">
                <option value="">Bundesland wählen</option>
                <option>Baden-Württemberg</option>
                <option>Bayern</option>
                <option>Berlin</option>
                <option>Brandenburg</option>
                <option>Bremen</option>
                <option>Hamburg</option>
                <option>Hessen</option>
                <option>Mecklenburg-Vorpommern</option>
                <option>Niedersachsen</option>
                <option>Nordrhein-Westfalen</option>
                <option>Rheinland-Pfalz</option>
                <option>Saarland</option>
                <option>Sachsen</option>
                <option>Sachsen-Anhalt</option>
                <option>Schleswig-Holstein</option>
                <option>Thüringen</option>
              </select>
              <input name="focusTopics" type="text" placeholder="Schwerpunktthemen (Komma-getrennt)" aria-label="Schwerpunktthemen" />
            </div>
            <div class="admin-form-foot">
              <button class="primary-button" type="submit">Nutzer erstellen</button>
              <small class="admin-form-error" id="createUserError"></small>
            </div>
          </form>

          <div class="admin-card">
            <h2 class="admin-section-title">System</h2>
            <div class="admin-sys-grid">
              <div class="admin-sys-item"><span class="admin-sys-key">Speicher</span><span class="admin-sys-val">${escapeHtml(sys.storage?.backend || "?")}${sys.storage?.supabaseConfigured ? " ✓" : ""}</span></div>
              <div class="admin-sys-item"><span class="admin-sys-key">AI</span><span class="admin-sys-val">${sys.ai?.enabled ? "Aktiv" : "Aus"}</span></div>
              <div class="admin-sys-item"><span class="admin-sys-key">Modell</span><span class="admin-sys-val">${escapeHtml(sys.ai?.model || "—")}</span></div>
              <div class="admin-sys-item"><span class="admin-sys-key">Push</span><span class="admin-sys-val">${sys.push?.enabled ? "Aktiv" : "Aus"}</span></div>
              <div class="admin-sys-item"><span class="admin-sys-key">Auth</span><span class="admin-sys-val">${sys.authMode ? "Accounts" : "Pilot"}</span></div>
              <div class="admin-sys-item"><span class="admin-sys-key">Briefings</span><span class="admin-sys-val">${escapeHtml(String(sys.store?.briefings?.total ?? "—"))}</span></div>
            </div>
          </div>


        </div>
      </div>

      ${renderAdminFeedbackSection(feedback)}

      ${renderAdminMandatesSection(mandates)}

      <div class="admin-bottom-row">
        <div class="admin-card">
          <h2 class="admin-section-title">Letzte Fehler</h2>
          <div class="admin-log-list">
            ${errors.length ? errors.map((entry) => `<p class="admin-log-line"><small>${escapeHtml(formatBriefingDate(entry.createdAt))}</small> [${escapeHtml(entry.scope || "")}] ${escapeHtml(entry.message || "")}</p>`).join("") : `<p class="empty-state">Keine Fehler protokolliert.</p>`}
          </div>
        </div>
        <div class="admin-card">
          <h2 class="admin-section-title">Audit-Log</h2>
          <div class="admin-log-list">
            ${audit.length ? audit.map((entry) => `<p class="admin-log-line"><small>${escapeHtml(formatBriefingDate(entry.createdAt))}</small> ${escapeHtml(entry.action || "")}${entry.actorEmail ? ` · ${escapeHtml(entry.actorEmail)}` : ""}${entry.politicianId ? ` · ${escapeHtml(entry.politicianId)}` : ""}</p>`).join("") : `<p class="empty-state">Noch keine Ereignisse.</p>`}
          </div>
        </div>
      </div>

    </div>
  `;
}

// Aufklappbares Bearbeiten-Panel je Nutzer: Status + Kundenfelder. Speichert
// additiv via PATCH /api/admin/users/:id mit { status, customer }.
function renderAdminUserEditRow(user, status, feedbackCount = 0) {
  const c = user.customer || {};
  const statusSelect = USER_STATUS_OPTIONS
    .map(([value, label]) => `<option value="${value}" ${value === status ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
  const paymentSelect = PAYMENT_STATUS_OPTIONS
    .map(([value, label]) => `<option value="${value}" ${value === (c.paymentStatus || "none") ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
  const activity = `
    <div class="admin-activity">
      <span class="admin-subsection-label">Aktivität</span>
      <div class="admin-activity-grid">
        <div class="admin-activity-item"><span class="admin-activity-num">${Number(user.openCount) || 0}</span><span class="admin-activity-lbl">App-Öffnungen</span></div>
        <div class="admin-activity-item"><span class="admin-activity-num">${Number(user.loginCount) || 0}</span><span class="admin-activity-lbl">Logins</span></div>
        <div class="admin-activity-item"><span class="admin-activity-num">${Number(feedbackCount) || 0}</span><span class="admin-activity-lbl">Feedback</span></div>
        <div class="admin-activity-item"><span class="admin-activity-num-sm">${escapeHtml(formatLastLogin(user.lastSeenAt || user.lastLoginAt))}</span><span class="admin-activity-lbl">Zuletzt aktiv</span></div>
      </div>
    </div>`;
  return `
    <tr class="admin-edit-row">
      <td colspan="7">
        ${activity}
        <form class="admin-customer-form" data-customer-form="${escapeAttribute(user.id)}">
          <div class="admin-customer-grid">
            <label class="admin-cust-field">
              <span>Status</span>
              <select name="status">${statusSelect}</select>
            </label>
            <label class="admin-cust-field">
              <span>Zahlungsstatus</span>
              <select name="paymentStatus">${paymentSelect}</select>
            </label>
            <label class="admin-cust-field">
              <span>Preis pro Monat (€)</span>
              <input name="pricePerMonth" type="number" min="0" step="1" value="${c.pricePerMonth ?? ""}" placeholder="z. B. 49" />
            </label>
            <label class="admin-cust-field">
              <span>Startdatum</span>
              <input name="startDate" type="date" value="${c.startDate ? escapeAttribute(c.startDate.slice(0, 10)) : ""}" />
            </label>
            <label class="admin-cust-field">
              <span>Testphase bis</span>
              <input name="trialUntil" type="date" value="${c.trialUntil ? escapeAttribute(c.trialUntil.slice(0, 10)) : ""}" />
            </label>
            <label class="admin-cust-field">
              <span>Nächste Rechnung</span>
              <input name="nextInvoice" type="date" value="${c.nextInvoice ? escapeAttribute(c.nextInvoice.slice(0, 10)) : ""}" />
            </label>
          </div>
          <label class="admin-cust-field admin-cust-field--wide">
            <span>Interne Notiz</span>
            <textarea name="internalNote" rows="2" placeholder="Nur intern sichtbar">${escapeHtml(c.internalNote || "")}</textarea>
          </label>
          <div class="admin-customer-foot">
            <button class="primary-button" type="submit">Speichern</button>
            <small class="admin-form-error" data-customer-error="${escapeAttribute(user.id)}"></small>
          </div>
        </form>
      </td>
    </tr>`;
}

function renderAdminCostsCard(costs) {
  if (!costs) return "";
  const perUser = Array.isArray(costs.perUser) ? costs.perUser : [];
  const maxCost = perUser.reduce((m, u) => Math.max(m, u.totalCostUsd || 0), 0);

  const bars = perUser.length
    ? perUser.map((u) => {
        const pct = maxCost > 0 ? Math.round((u.totalCostUsd / maxCost) * 100) : 0;
        const pctEur = Math.round(pct * USD_TO_EUR);
        return `
        <div class="cost-bar-item">
          <div class="cost-bar-head">
            <span class="cost-bar-name">${escapeHtml(u.name || u.userId)}</span>
            <span class="cost-bar-amounts"><span class="cost-usd">$${u.totalCostUsd.toFixed(4)}</span> <span class="cost-sep">|</span> <span class="cost-eur">€${(u.totalCostUsd * USD_TO_EUR).toFixed(4)}</span></span>
          </div>
          <div class="cost-bar-track">
            <div class="cost-bar-fill cost-bar-fill--usd" style="width:${pct}%"></div>
            <div class="cost-bar-fill cost-bar-fill--eur" style="width:${pctEur}%"></div>
          </div>
        </div>`;
      }).join("")
    : `<p class="empty-state" style="font-size:12px;margin:8px 0">Noch keine KI-Calls.</p>`;

  return `
    <div class="admin-card">
      <h2 class="admin-section-title">KI-Kosten pro Nutzer <span class="admin-stat-period">(${costs.periodDays ?? 30}d)</span></h2>
      <div class="cost-legend">
        <span class="cost-legend-dot cost-legend-dot--usd"></span><span>USD</span>
        <span class="cost-legend-dot cost-legend-dot--eur"></span><span>EUR</span>
        <span class="cost-legend-rate">1 USD = ${USD_TO_EUR.toFixed(2)} EUR</span>
      </div>
      <div class="cost-bar-list">${bars}</div>
    </div>`;
}

function renderAdminEngineChart(aiStats) {
  if (!aiStats?.perCategory) return "";
  const ENGINES = [
    { key: "intelligence", label: "Intelligence" },
    { key: "briefing", label: "Briefing" },
    { key: "office", label: "Office" }
  ];
  const total = typeof aiStats.totalCostUsd === "number" ? aiStats.totalCostUsd : 0;
  const cat = aiStats.perCategory || {};
  const maxCost = Math.max(...ENGINES.map((e) => cat[e.key]?.estimatedCostUsd || 0), 0.000001);

  const bars = ENGINES.map(({ key, label }) => {
    const entry = cat[key] || { calls: 0, estimatedCostUsd: 0 };
    const usd = typeof entry.estimatedCostUsd === "number" ? entry.estimatedCostUsd : 0;
    const eur = usd * USD_TO_EUR;
    const sharePct = total > 0 ? Math.round((usd / total) * 100) : 0;
    const barPct = Math.round((usd / maxCost) * 100);
    const eurBarPct = Math.round(barPct * USD_TO_EUR);
    return `
    <div class="cost-bar-item">
      <div class="cost-bar-head">
        <span class="cost-bar-name cost-bar-name--wide">${escapeHtml(label)}</span>
        <span class="cost-bar-amounts">
          <span class="cost-usd">$${usd.toFixed(4)}</span>
          <span class="cost-sep">|</span>
          <span class="cost-eur">€${eur.toFixed(4)}</span>
          <span class="cost-share">${sharePct}%</span>
        </span>
      </div>
      <div class="cost-bar-track">
        <div class="cost-bar-fill cost-bar-fill--usd" style="width:${barPct}%"></div>
        <div class="cost-bar-fill cost-bar-fill--eur" style="width:${eurBarPct}%"></div>
      </div>
    </div>`;
  }).join("");

  return `
    <div class="admin-card">
      <h2 class="admin-section-title">Kosten pro Engine <span class="admin-stat-period">(${aiStats.periodDays ?? 30}d · ${aiStats.totalCalls ?? 0} Calls)</span></h2>
      <div class="cost-legend">
        <span class="cost-legend-dot cost-legend-dot--usd"></span><span>USD</span>
        <span class="cost-legend-dot cost-legend-dot--eur"></span><span>EUR</span>
        <span class="cost-legend-rate">1 USD = ${USD_TO_EUR.toFixed(2)} EUR</span>
      </div>
      <div class="cost-bar-list">${bars || '<p class="empty-state" style="font-size:12px;margin:8px 0">Noch keine KI-Calls.</p>'}</div>
    </div>`;
}

function renderAdminCrawlStats(crawlReport) {
  if (!crawlReport || crawlReport.noData) {
    return `
    <div class="admin-card admin-crawl-card">
      <h2 class="admin-section-title">Letzter Crawl</h2>
      <p class="empty-state">Kein Crawl-Lauf vorhanden.</p>
    </div>`;
  }
  const scanned = crawlReport.scannedArticles ?? 0;
  const saved = crawlReport.deduplicatedArticles ?? 0;
  const dupes = Math.max(0, scanned - saved);
  const crawlDate = crawlReport.lastCrawlAt
    ? new Date(crawlReport.lastCrawlAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";
  const metrics = [
    { label: "Gescannt", value: scanned },
    { label: "Duplikate", value: dupes },
    { label: "Neu", value: saved },
    { label: "Vorgänge", value: crawlReport.newVorgaenge ?? "—" },
    { label: "Neue KOs", value: crawlReport.newKnowledgeObjects ?? "—" },
    { label: "Dauer", value: crawlReport.durationSec !== null && crawlReport.durationSec !== undefined ? `${crawlReport.durationSec}s` : "—" }
  ];
  const metricCards = metrics.map((m) => `
    <div class="admin-crawl-metric">
      <span class="admin-crawl-num">${escapeHtml(String(m.value))}</span>
      <span class="admin-crawl-label">${escapeHtml(m.label)}</span>
    </div>`).join("");
  const errorLine = crawlReport.errorCount > 0
    ? `<p class="admin-crawl-errors">${crawlReport.errorCount} Fehler: ${(crawlReport.errors || []).slice(0, 3).map((e) => escapeHtml(e.sourceName || e.error || "")).join(", ")}</p>`
    : "";
  return `
    <div class="admin-card admin-crawl-card">
      <h2 class="admin-section-title">Letzter Crawl <span class="admin-stat-period">${escapeHtml(crawlDate)} · ${escapeHtml(crawlReport.mode || "full")}</span></h2>
      <div class="admin-crawl-grid">${metricCards}</div>
      ${errorLine}
    </div>`;
}

const FEEDBACK_TYPE_META = {
  relevant: { label: "Relevant", cls: "fb-relevant" },
  nicht_relevant: { label: "Nicht relevant", cls: "fb-nichtrelevant" },
  falsch: { label: "Falsch", cls: "fb-falsch" },
  mehr_davon: { label: "Mehr davon", cls: "fb-mehr" },
  weniger_davon: { label: "Weniger davon", cls: "fb-weniger" },
  unklar: { label: "Unklar", cls: "fb-unklar" }
};

function feedbackTypeLabel(type) {
  return FEEDBACK_TYPE_META[type]?.label || type || "—";
}

// Admin: Feedback-Inbox. Zeigt alle Rueckmeldungen, Admin kann auf erledigt setzen.
function renderAdminFeedbackSection(feedback) {
  const open = feedback.filter((item) => !item.done);
  const openCount = open.length;
  const rows = feedback.length
    ? feedback.map((item) => {
        const meta = FEEDBACK_TYPE_META[item.type] || { label: item.type || "—", cls: "fb-unklar" };
        return `
        <tr class="${item.done ? "admin-fb-done" : ""}">
          <td data-label="Typ"><span class="admin-fb-tag ${meta.cls}">${escapeHtml(meta.label)}</span></td>
          <td data-label="Bereich">${escapeHtml(item.area || "—")}</td>
          <td data-label="Thema">${escapeHtml(item.topic || "—")}${item.comment ? `<span class="admin-fb-comment">„${escapeHtml(item.comment)}"</span>` : ""}</td>
          <td data-label="Nutzer">${escapeHtml(item.userName || "—")}</td>
          <td data-label="Zeitpunkt" class="admin-last-login">${escapeHtml(formatBriefingDate(item.createdAt))}</td>
          <td data-label="Status" class="admin-actions-cell">
            ${item.done
              ? `<span class="admin-pill admin-pill-on">Erledigt</span>`
              : `<button class="account-logout" type="button" data-feedback-done="${escapeAttribute(item.id)}">Erledigt</button>`}
          </td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6" class="empty-state">Noch kein Feedback eingegangen.</td></tr>`;
  return `
    <div class="admin-card admin-card-flush">
      <div class="admin-card-header">
        <div>
          <h2 class="admin-section-title">Feedback-Inbox</h2>
          <p class="admin-section-sub">${openCount > 0 ? `${openCount} offen · ` : ""}${feedback.length} gesamt</p>
        </div>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Typ</th><th>Bereich</th><th>Thema</th><th>Nutzer</th><th>Zeitpunkt</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// Admin: Mandatsprofile (read-only). Zeigt das politische/redaktionelle Profil je Mandat.
function renderAdminMandatesSection(mandates) {
  if (!mandates.length) {
    return `
    <div class="admin-card">
      <h2 class="admin-section-title">Mandatsprofile</h2>
      <p class="empty-state">Noch keine Mandatsprofile angelegt.</p>
    </div>`;
  }
  const field = (label, value) => {
    const text = Array.isArray(value) ? value.filter(Boolean).join(" · ") : value;
    return `<div class="admin-mandate-field"><span class="admin-mandate-key">${escapeHtml(label)}</span><span class="admin-mandate-val">${text ? escapeHtml(text) : "—"}</span></div>`;
  };
  const cards = mandates.map((m) => `
    <div class="admin-mandate-card">
      <div class="admin-mandate-head">
        <strong>${escapeHtml(m.fullName || m.id)}</strong>
        ${m.party ? `<span class="admin-role-tag admin-role-abgeordneter">${escapeHtml(m.party)}</span>` : ""}
      </div>
      <div class="admin-mandate-grid">
        ${field("Fraktion", m.faction)}
        ${field("Bundesland", m.state)}
        ${field("Wahlkreis", m.constituency)}
        ${field("Ausschüsse", m.committees)}
        ${field("Politische Schwerpunkte", m.focusTopics)}
        ${field("Relevante Themen", m.relevantTopics)}
        ${field("Ignorierte Themen", m.ignoreTopics)}
        ${field("Kommunikationsstil", m.communicationStyle)}
        ${field("Tonalität", m.tonality)}
        ${field("Zielgruppen", m.keyAudiences)}
        ${field("No-Go-Formulierungen", m.noGoPhrases)}
      </div>
    </div>`).join("");
  return `
    <div class="admin-card">
      <div class="admin-card-header" style="padding:0 0 4px">
        <div>
          <h2 class="admin-section-title">Mandatsprofile</h2>
          <p class="admin-section-sub">Politisches Profil je Mandat — steuert Helmuts Relevanzlogik</p>
        </div>
      </div>
      <div class="admin-mandate-list">${cards}</div>
    </div>`;
}

// Mandatsoptionen fuer Zuweisungen: vorhandene Profile + Abgeordneten-Mandate.
function adminMandateOptions() {
  const map = new Map();
  (adminData?.profiles || []).forEach((entry) => map.set(entry.id, entry.fullName || entry.id));
  (adminData?.users || []).forEach((user) => {
    if (user.role === "abgeordneter" && user.politicianId && !map.has(user.politicianId)) {
      map.set(user.politicianId, user.name || user.politicianId);
    }
  });
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
}

function toDecision(item) {
  return {
    id: item.id,
    signalId: item.signalId,
    title: item.title,
    priorityLabel: priorityLabelForDecision(item),
    priorityType: priorityTypeForDecision(item),
    summary: twoSentenceSummary(item.summary || item.whyItMatters || item.recommendedAction),
    action: polishReferentText(item.recommendedAction),
    statement: item.suggestedStatement,
    whyNow: item.whyNow,
    whyItMatters: item.whyItMatters,
    inaction: polishReferentText(item.inactionConsequence),
    risk: item.riskNote,
    opportunity: item.opportunityNote,
    estimatedTime: `${item.estimatedTimeMinutes} Min.`,
    confidence: item.confidence,
    sourceCount: item.sourceCount,
    sources: item.sources || [],
    primarySource: item.primarySource || item.sources?.[0],
    politicalScore: item.politicalScore,
    mandateScore: item.mandateScore,
    committeeScore: item.ausschuss_bezug || item.committeeScore,
    citizenImpact: item.bürgerBetroffenheit || item.buergerBetroffenheit || item.citizenImpact,
    mediaPressure: item.medienDruck || item.mediaPressure,
    timeUrgency: item.zeitlicheDringlichkeit || item.timeUrgency,
    reactionChance: item.reaktionsChance || item.reactionChance,
    riskIfIgnoredScore: item.risikoBeiNichtstun || item.riskIfIgnoredScore,
    finalScore: item.finalScore,
    totalScore: item.totalScore,
    taskTemplate: item.taskTemplate,
    memory: item.memory || null,
    personalRelevanceExplanation: item.personal_relevance_explanation || item.personalRelevanceExplanation || item.whyItMatters,
    consequenceIfIgnored: item.consequence_if_ignored || item.inactionConsequence,
    possibleUpside: item.possible_upside || item.opportunityNote,
    actionType: item.action_type || item.actionType,
    deadline: item.deadline || item.taskTemplate?.dueDate,
    urgency: item.urgency,
    statusChange: item.status_change,
    changeReason: item.change_reason,
    lageMovement: item.lageMovement || null,
    lageMovementReason: item.lageMovementReason || item.lageMovement?.reason || "",
    lageDevelopment: item.lageDevelopment || item.lageMovement?.development || "",
    sourceFreshness: item.sourceFreshness || item.lageMovement?.sourceFreshness || "",
    priorityTrend: item.priorityTrend || item.lageMovement?.priorityTrend || "",
    relevanceScore: item.relevance_score || item.finalScore || item.totalScore
  };
}

function recommendationToDecisionItem(recommendation) {
  return {
    id: recommendation.id,
    signalId: recommendation.signal_id,
    title: recommendation.title,
    topic: recommendation.topic,
    summary: recommendation.summary,
    recommendedAction: recommendation.recommended_action,
    suggestedStatement: recommendation.communication_recommendation,
    whyNow: recommendation.change_reason,
    whyItMatters: recommendation.personal_relevance_explanation,
    inactionConsequence: recommendation.consequence_if_ignored,
    riskNote: recommendation.consequence_if_ignored,
    opportunityNote: recommendation.possible_upside,
    estimatedTimeMinutes: recommendation.estimated_effort_minutes,
    confidence: recommendation.confidence,
    sourceCount: recommendation.source_count,
    sources: recommendation.sources,
    primarySource: recommendation.primarySource,
    politicalScore: recommendation.politicalScore,
    mandateScore: recommendation.mandateScore,
    ausschuss_bezug: recommendation.ausschuss_bezug,
    bürgerBetroffenheit: recommendation.bürgerBetroffenheit,
    buergerBetroffenheit: recommendation.buergerBetroffenheit,
    medienDruck: recommendation.medienDruck,
    zeitlicheDringlichkeit: recommendation.zeitlicheDringlichkeit,
    reaktionsChance: recommendation.reaktionsChance,
    risikoBeiNichtstun: recommendation.risikoBeiNichtstun,
    finalScore: recommendation.finalScore,
    totalScore: recommendation.relevance_score,
    priority: recommendation.relevance_score,
    decision: recommendation.relevance_score >= 60 ? "Sofort reagieren" : recommendation.relevance_score >= 40 ? "Beobachten" : "Ignorieren",
    classification: recommendation.risiko_fuer_nutzer > recommendation.chance_fuer_nutzer ? "risk" : "opportunity",
    action_type: recommendation.action_type,
    deadline: recommendation.deadline,
    urgency: recommendation.urgency,
    status_change: recommendation.status_change,
    change_reason: recommendation.change_reason,
    lageMovement: recommendation.lageMovement || null,
    lageMovementReason: recommendation.lageMovementReason || recommendation.lageMovement?.reason || "",
    lageDevelopment: recommendation.lageDevelopment || recommendation.lageMovement?.development || "",
    sourceFreshness: recommendation.sourceFreshness || recommendation.lageMovement?.sourceFreshness || "",
    priorityTrend: recommendation.priorityTrend || recommendation.lageMovement?.priorityTrend || "",
    personal_relevance_explanation: recommendation.personal_relevance_explanation,
    consequence_if_ignored: recommendation.consequence_if_ignored,
    possible_upside: recommendation.possible_upside,
    learningReason: recommendation.learningReason || "",
    status: recommendation.status || "",
    feedback: recommendation.feedback || "",
    taskTemplate: recommendation.taskTemplate
  };
}

function polishReferentText(value) {
  const text = String(value || "").trim();
  if (!text) return text;
  const normalized = text
    .replace(/^Du solltest das analysieren\s+(das|den|die)\s+(.+?)\s+und\s+bereite\s+(.+?)\s+vor\b/i, "Du solltest $1 $2 analysieren und $3 vorbereiten")
    .replace(/^Du solltest das prüfen\s+(das|den|die)\s+(.+?)\s+und\s+bereite\s+(.+?)\s+vor\b/i, "Du solltest $1 $2 prüfen und $3 vorbereiten");
  if (normalized !== text) return normalized;
  const analyzePrepare = text.match(/^Du solltest das analysieren\s+(das|den|die)\s+(.+?)\s+und\s+bereite\s+(.+?)\s+vor(,?\s+.+)?\.?$/i);
  if (analyzePrepare) {
    return `Du solltest ${analyzePrepare[1]} ${analyzePrepare[2]} analysieren und ${analyzePrepare[3]} vorbereiten${analyzePrepare[4] || ""}.`;
  }
  const analyze = text.match(/^Du solltest das analysieren\s+(das|den|die)\s+(.+?)\.?$/i);
  if (analyze) {
    return `Du solltest ${analyze[1]} ${analyze[2]} analysieren.`;
  }
  const check = text.match(/^Du solltest das prüfen\s+(das|den|die)\s+(.+?)\.?$/i);
  if (check) {
    return `Du solltest ${check[1]} ${check[2]} prüfen.`;
  }
  const prepare = text.match(/^Du solltest bereite\s+(.+?)\s+vor\.?$/i);
  if (prepare) {
    return `Du solltest ${prepare[1]} vorbereiten.`;
  }
  const read = text.match(/^Du solltest lies\s+(.+?)\.?$/i);
  if (read) {
    return `Du solltest ${read[1]} lesen.`;
  }
  return text
    .replace(/\bDu solltest analysiere\b/gi, "Du solltest das analysieren")
    .replace(/\bDu solltest prüfe\b/gi, "Du solltest das prüfen")
    .replace(/\bDu solltest bereite\b/gi, "Du solltest vorbereiten")
    .replace(/\bDu solltest lies\b/gi, "Du solltest die Quellen lesen")
    .replace(/\bDu solltest entwickle\b/gi, "Du solltest eine Linie entwickeln")
    .replace(/\bDu solltest formuliere\b/gi, "Du solltest eine Formulierung vorbereiten");
}

function situationalToDecisionItem(item) {
  return {
    id: item.id,
    signalId: item.id,
    title: item.title,
    topic: item.title,
    summary: item.summary,
    recommendedAction: `Beobachte das Thema heute. Prüfe, ob daraus eine Frage an Bundesregierung oder Ausschuss entsteht.`,
    suggestedStatement: "",
    whyNow: item.relevanceReason || "Dieses Thema wurde in geprüften Quellen gefunden und berührt dein Mandatsprofil.",
    whyItMatters: `Das betrifft dich, weil ${item.relevanceReason || "ein Bezug zu deinem Mandatsprofil erkennbar ist"}.`,
    inactionConsequence: "Wenn du es ignorierst, verpasst du möglicherweise eine frühe fachliche Anschlussstelle. Noch ist aber keine öffentliche Reaktion nötig.",
    riskNote: "Derzeit kein akutes Risiko, aber beobachtbar.",
    opportunityNote: "Du bleibst früh informiert, ohne dich in irrelevante Nachrichten zu verlieren.",
    estimatedTimeMinutes: 5,
    confidence: item.confidence,
    sourceCount: 1,
    sources: [{
      sourceName: item.sourceName,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      itemUrl: item.url,
      url: item.url,
      publishedAt: item.publishedAt,
      retrievedAt: item.retrievedAt,
      confidence: item.confidence,
      excerpt: item.summary,
      relevanceReason: item.relevanceReason
    }],
    primarySource: {
      sourceName: item.sourceName,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      itemUrl: item.url,
      url: item.url,
      publishedAt: item.publishedAt,
      retrievedAt: item.retrievedAt,
      confidence: item.confidence,
      excerpt: item.summary,
      relevanceReason: item.relevanceReason
    },
    politicalScore: 45,
    mandateScore: 55,
    finalScore: 50,
    totalScore: 50,
    priority: 50,
    decision: "Beobachten",
    classification: "watch",
    actionType: "observe",
    deadline: "",
    urgency: "niedrig",
    statusChange: "Neu geprüft",
    changeReason: item.relevanceReason || "Aus geprüfter Quelle in die Lage übernommen.",
    personal_relevance_explanation: `Das betrifft dich, weil ${item.relevanceReason || "ein Bezug zu deinem Mandatsprofil erkennbar ist"}.`,
    consequence_if_ignored: "Wenn du es ignorierst, verpasst du möglicherweise eine frühe fachliche Anschlussstelle. Noch ist aber keine öffentliche Reaktion nötig.",
    possible_upside: "Du bleibst früh informiert, ohne dich in irrelevante Nachrichten zu verlieren.",
    taskTemplate: null
  };
}

function render() {
  app.innerHTML = `
    <div class="app-frame">
      ${renderSidebar()}
      <main class="content-shell">
        ${renderTopbar()}
        ${renderView()}
      </main>
      ${renderMobileDock()}
      ${renderUpdatesPanel()}
      ${renderTaskHandoffPanel()}
      ${renderOnboarding()}
    </div>
  `;
  hideStartupSplash();
  try {
    bindActions();
    updateBerlinClock();
    startBerlinClock();
  } catch (error) {
    console.warn("Helmut rendered, post-render binding failed", error);
  }
}

function hideStartupSplash() {
  window.setTimeout(() => {
    document.body.classList.remove("is-loading");
    document.body.classList.add("app-ready");
  }, 180);
  window.setTimeout(() => {
    document.body.classList.add("splash-gone");
  }, 980);
}

function renderSidebar() {
  const displayName = currentUser?.name || profile?.fullName || "Profil";
  const displayRole = currentUser ? roleLabel(currentUser.role) : (profile?.function || "MdB");
  const initials = displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const showSwitcher = isAccountMode() && currentUser && allowedProfiles.length > 1;
  const profileSwitcher = showSwitcher
    ? `<select class="account-switch" data-profile-switch aria-label="Mandat wählen">
        ${allowedProfiles.map((entry) => `<option value="${escapeAttribute(entry.id)}" ${entry.id === activePoliticianId ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}
      </select>`
    : "";
  return `
    <aside class="sidebar ${navOpen ? "open" : ""}">
      <div>
        <div class="brand">
          <b class="brand-mark" aria-hidden="true">H</b>
          <span>HELMUT</span>
          <small>Politischer Referent</small>
        </div>
        <nav class="nav-list" aria-label="Hauptnavigation">
          ${navItems.map(([id, label]) => `<button class="${isMobileNavActive(id) ? "active" : ""}" type="button" data-view="${id}">${label}${id === "helmut" && hasNewHelmutAssessment() ? `<i class="helmut-new-dot"></i>` : ""}</button>`).join("")}
          ${roleNavItems().map(([id, label]) => `<button class="${currentView === id ? "active" : ""}" type="button" data-view="${id}">${label}</button>`).join("")}
        </nav>
      </div>
      <div class="sidebar-foot">
        ${profileSwitcher}
        <div class="sidebar-user-card">
          <div class="sidebar-user-avatar">${escapeHtml(initials)}</div>
          <div class="sidebar-user-info">
            <strong>${escapeHtml(displayName)}</strong>
            <span>${escapeHtml(displayRole)}</span>
          </div>
        </div>
        ${isAccountMode() && currentUser ? `<button class="account-logout sidebar-logout" type="button" data-logout>Abmelden</button>` : ""}
      </div>
    </aside>
  `;
}

function renderMobileDock() {
  return `
    <nav class="mobile-dock" aria-label="Mobile Navigation">
      ${mobileNavItems.map(([id, label]) => `
        <button class="nav-${escapeAttribute(id)} ${isMobileNavActive(id) ? "active" : ""}" type="button" data-view="${id}">
          <span>${escapeHtml(mobileNavSymbol(id))}</span>
          ${id === "office" && actionableOfficeTaskCount() ? `<i>${escapeHtml(String(actionableOfficeTaskCount()))}</i>` : ""}
          ${id === "helmut" && hasNewHelmutAssessment() ? `<i class="helmut-new-dot"></i>` : ""}
          ${escapeHtml(label)}
        </button>
      `).join("")}
    </nav>
  `;
}

function isMobileNavActive(id) {
  if (currentView === "detail") return (detailOriginView || "briefing") === id;
  if (id === "briefing") return currentView === "briefing";
  if (id === "office") return currentView === "office" || currentView === "office-detail" || currentView === "communication" || currentView === "tasks";
  if (id === "helmut") return currentView === "helmut";
  return currentView === id;
}

function mobileNavSymbol(id) {
  return ({ briefing: "▤", radar: "◎", helmut: "H", office: "▱" })[id] || "•";
}

// Rollenabhaengige Navigationseintraege (nur im Account-Modus).
function roleNavItems() {
  if (!isAccountMode()) return [];
  const items = [];
  const role = userRole();
  if (role === "referent" || role === "admin") items.push(["daily-input", "Tagesinput"]);
  if (role === "admin") items.push(["admin", "Admin"]);
  return items;
}

function renderTopbar() {
  const hasUpdates = hasUnreadUpdates();
  return `
    <header class="topbar">
      <button class="menu-button ${navOpen ? "close" : ""}" type="button" data-menu aria-label="${navOpen ? "Menü schließen" : "Menü öffnen"}">
        ${navOpen ? "×" : "<span></span><span></span><span></span>"}
      </button>
      <span class="topbar-brand">HELMUT</span>
      <div class="topbar-meta">
        <button class="update-heart ${hasUpdates ? "has-updates" : ""}" type="button" data-updates title="${hasUpdates ? "Updates anzeigen" : "Keine neuen Updates"}" aria-label="${hasUpdates ? "Updates anzeigen" : "Keine neuen Updates"}">
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M31.7 54.2 11.9 34.5C4.4 27 4.8 15.4 12.8 9.4c6.1-4.6 14.8-3.4 19.1 2.9 4.4-6.3 13.1-7.5 19.2-2.9 8 6 8.3 17.6.8 25.1L31.7 54.2Z" />
          </svg>
          <i></i>
        </button>
        <button class="profile-avatar" type="button" data-view="settings" aria-label="Profil öffnen">
          ${escapeHtml(profileInitials())}
        </button>
        <span data-berlin-clock>${escapeHtml(briefing.status)} · ${formatBerlinNow()}</span>
      </div>
    </header>
  `;
}

function renderUpdatesPanel() {
  const updates = notificationItems();
  return `
    <div class="updates-layer ${updatesOpen ? "open" : ""}" data-updates-layer>
      <aside class="updates-panel" aria-label="Benachrichtigungen">
        <div class="updates-head">
          <div>
            <span>Benachrichtigungen</span>
            <h2>Updates</h2>
          </div>
          <button type="button" data-close-updates aria-label="Benachrichtigungen schließen">×</button>
        </div>
        <div class="updates-list">
          ${updates.length ? updates.map(renderNotificationItem).join("") : `<p class="empty-state">Keine neuen Updates.</p>`}
        </div>
        <button class="updates-radar-link" type="button" data-view="radar">Alle Erwähnungen ansehen</button>
      </aside>
    </div>
  `;
}

function renderNotificationItem(item) {
  const receivedLine = item.receivedAt ? `<small class="notification-time">Eingetroffen: ${escapeHtml(formatBriefingDate(item.receivedAt))}</small>` : "";
  if (item.href) {
    return `
      <a class="notification-row ${item.type}" href="${escapeAttribute(item.href)}" target="_blank" rel="noopener noreferrer">
        <span>${escapeHtml(item.label)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <small>${escapeHtml(item.meta)}</small>
        ${receivedLine}
      </a>
    `;
  }
  return `
    <button class="notification-row ${item.type}" type="button" data-detail="${escapeHtml(item.decisionId)}">
      <span>${escapeHtml(item.label)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
      <small>${escapeHtml(item.meta)}</small>
      ${receivedLine}
    </button>
  `;
}

function renderView() {
  if (currentView === "detail") return renderDetailView();
  if (currentView === "communication") return renderCommunicationView();
  if (currentView === "office" || currentView === "tasks") return renderOfficeView();
  if (currentView === "office-detail") return renderOfficeDraftDetail();
  if (currentView === "topics") return renderTopicsView();
  if (currentView === "radar") return renderRadarView();
  if (currentView === "helmut") return renderHelmutView();
  if (currentView === "profile-settings") return renderProfileSettingsView();
  if (currentView === "settings") return renderSettingsView();
  if (currentView === "admin") return renderAdminView();
  if (currentView === "daily-input") return renderDailyInputView();
  return renderBriefingView();
}

async function loadParliament() {
  if (parliamentLoaded) return;
  parliamentLoaded = true;
  try {
    const res = await fetchWithTimeout(`/api/parliament?${apiScopeQuery()}`, {}, 12000);
    if (!res.ok) return;
    const data = await res.json();
    parliamentItems = Array.isArray(data.items) ? data.items : [];
    if (parliamentItems.length) render();
  } catch (error) {
    console.warn("Parlament-Daten nicht geladen", error);
  }
}

function formatParliamentMeta(item) {
  const parts = [];
  if (item.date) parts.push(formatBriefingDate(item.date));
  if ((item.urheber || []).length) parts.push(item.urheber[0]);
  return parts.join(" · ");
}

function renderParliamentSection() {
  if (!parliamentItems.length) return "";
  const items = parliamentItems.slice(0, 6);
  return `
    <section class="parliament-section">
      <div class="parliament-head">
        <span class="eyebrow-line">Aus deinem Ausschuss · Bundestag</span>
        <h2>Parlamentarische Vorgänge</h2>
        <p>Offizielle Drucksachen, die zu deinen Themen passen.</p>
      </div>
      <div class="parliament-list">
        ${items.map((item) => renderParliamentItem(item)).join("")}
      </div>
    </section>
  `;
}

function renderParliamentItem(item) {
  const a = parliamentAssessments[item.id];
  let assessmentBlock = "";
  if (a && a.loading) {
    assessmentBlock = `
      <div class="skeleton-stack" aria-busy="true" aria-label="Helmut ordnet ein">
        <div class="skeleton skeleton-line medium"></div>
        <div class="skeleton skeleton-line short"></div>
      </div>`;
  } else if (a) {
    assessmentBlock = `
      <div class="parliament-assessment">
        <p><b>Warum relevant:</b> ${escapeHtml(a.whyRelevant || "")}</p>
        <p><b>Empfohlene Handlung:</b> ${escapeHtml(a.recommendedAction || "")}</p>
      </div>`;
  } else {
    assessmentBlock = `<button class="secondary-button compact-button" type="button" data-assess-id="${escapeAttribute(item.id)}">Einordnen</button>`;
  }
  return `
    <article class="parliament-item">
      <span class="parliament-type">${escapeHtml(item.type || "Drucksache")}</span>
      <a class="parliament-title" href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
      <small>${escapeHtml(formatParliamentMeta(item))}</small>
      ${assessmentBlock}
    </article>
  `;
}

async function assessParliamentItem(id) {
  const item = parliamentItems.find((entry) => entry.id === id);
  if (!item || parliamentAssessments[id]) return;
  parliamentAssessments[id] = { loading: true };
  render();
  try {
    const res = await apiSend("POST", `/api/parliament/assess?${apiScopeQuery()}`, {
      type: item.type, title: item.title, urheber: item.urheber, date: item.date
    });
    parliamentAssessments[id] = res.ok && res.json ? res.json : null;
  } catch (error) {
    parliamentAssessments[id] = null;
  }
  render();
}

function activeDecisions() {
  return decisions.filter((entry) => entry.status !== "done" && entry.status !== "ignored");
}

function lageProgress() {
  const total = decisions.length;
  const cleared = decisions.filter((entry) => entry.status === "done" || entry.status === "ignored").length;
  return { total, cleared };
}

function priorityChipClass(decision) {
  const t = decision.priorityType || "";
  if (t === "action" || t === "high") return "danger";
  if (t === "chance") return "chance";
  return "watch";
}

function lageFocusChipText(decision) {
  const t = decision.priorityType || "";
  if (t === "action" || t === "high" || t === "risk") return "Heute reagieren";
  if (t === "chance") return "Chance nutzen";
  return "Im Blick";
}

function lageCardReco(decision) {
  const text = String(decision.action || decision.summary || "").trim();
  const m = text.match(/^.+?[.!?](?=\s|$)/);
  const first = m ? m[0].trim() : text;
  if (first.length <= 68) return first;
  const t = decision.priorityType || "";
  if (t === "action" || t === "high") return "Heute öffentlich reagieren.";
  if (t === "chance") return "Linie vorbereiten.";
  if (t === "risk") return "Sofort positionieren.";
  return "Beobachten. Nicht öffentlich reagieren.";
}

function generateWarumBullets(decision) {
  const raw = {
    committee: Number(decision.committeeScore || 0),
    media: Number(decision.mediaPressure || 0),
    time: Number(decision.timeUrgency || 0),
    risk: Number(decision.riskIfIgnoredScore || 0),
    reaction: Number(decision.reactionChance || 0),
    citizen: Number(decision.citizenImpact || 0),
  };
  const maxVal = Math.max(...Object.values(raw));
  const scale = maxVal > 10 ? 1 : 10;
  const s = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v * scale]));

  const bullets = [];
  if (s.committee >= 50) bullets.push("Betrifft deinen Ausschuss");
  if (s.media >= 52) bullets.push("Hohe mediale Aufmerksamkeit");
  if ((s.time >= 52 || s.risk >= 58) && bullets.length < 3) bullets.push("Presseanfragen wahrscheinlich");
  if (s.reaction >= 55 && bullets.length < 3) bullets.push("Gute Positionierungschance");
  if (s.citizen >= 55 && bullets.length < 3) bullets.push("Bürger stark betroffen");

  return bullets.slice(0, 3);
}

function renderDecisionActions(decision, primary) {
  return `
    <div class="lage-actions">
      <button class="lage-icon-btn lage-done-btn" type="button" data-lage-done="${escapeAttribute(decision.id)}" aria-label="Als erledigt markieren" title="Erledigt">✓</button>
      <button class="secondary-button compact-button lage-details-btn" type="button" data-detail="${escapeAttribute(decision.id)}">Einordnen</button>
      <button class="lage-icon-btn lage-ignore-btn" type="button" data-lage-ignore="${escapeAttribute(decision.id)}" aria-label="Ignorieren" title="Ignorieren">✕</button>
    </div>`;
}

function renderLageFocus() {
  const active = activeDecisions();
  if (!active.length) {
    return `
      <section class="lage-focus calm">
        <span class="lage-focus-chip chance">Alles im Griff</span>
        <h2 class="lage-focus-title">Heute musst du nicht öffentlich reagieren.</h2>
        <p class="lage-focus-why">Helmut beobachtet weiter Bundesregierung, Fraktion und Ausschuss und zieht nur hoch, was wirklich zählt.</p>
      </section>`;
  }
  const top = active[0];
  const warumBullets = generateWarumBullets(top);
  const readyFormats = activeOfficeFormats().filter((f) => officeDrafts[officeDraftKey(top, f)]);
  const bueroLine = readyFormats.length
    ? `<button class="lage-buero-ready" type="button" data-view="office">Helmut hat ${escapeHtml(readyFormats.map((f) => f.label).join(" · "))} vorbereitet</button>`
    : "";
  const actionLine = lageCardReco(top);
  return `
    <section class="lage-focus">
      <span class="lage-focus-chip ${priorityChipClass(top)}">${escapeHtml(lageFocusChipText(top))}</span>
      <h2 class="lage-focus-title">${escapeHtml(draftTitle(top))}</h2>
      ${actionLine ? `<p class="lage-focus-action">${escapeHtml(actionLine)}</p>` : ""}
      ${warumBullets.length ? `
      <div class="lage-warum">
        <span class="lage-warum-label">Warum du</span>
        <ul class="lage-warum-list">
          ${warumBullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
        </ul>
      </div>` : ""}
      ${renderDecisionActions(top, true)}
      ${bueroLine}
    </section>`;
}

function renderLageGlance() {
  const active = activeDecisions();
  const watch = typeof competentNoActionItems === "function" ? competentNoActionItems().length : 0;
  const { total, cleared } = lageProgress();
  const progress = total ? `<span class="lage-progress">${cleared} von ${total} erledigt</span>` : "<span class=\"lage-progress\">nichts Dringendes</span>";
  return `
    <div class="lage-glance">
      <div class="glance-row"><span class="dot danger"></span><span>Reagieren</span><b>${active.length}</b></div>
      <div class="glance-row"><span class="dot watch"></span><span>Beobachten</span><b>${watch}</b></div>
      <div class="glance-row"><span class="dot chance"></span><span>Sonst ruhig</span>${progress}</div>
    </div>`;
}

function renderSecondaryDecisions() {
  const rest = activeDecisions().slice(1, 3);
  if (!rest.length) return "";
  return `
    <p class="lage-section-label">Danach</p>
    <div class="lage-secondary">
      ${rest.map((decision) => {
        const reco = lageCardReco(decision);
        return `
        <article class="lage-sec-item">
          <span class="lage-sec-chip ${priorityChipClass(decision)}">${escapeHtml(decision.priorityLabel || "Punkt")}</span>
          <strong>${escapeHtml(draftTitle(decision))}</strong>
          ${reco ? `<p>${escapeHtml(reco)}</p>` : ""}
          <button class="secondary-button compact-button lage-details-btn" type="button" data-detail="${escapeAttribute(decision.id)}">Einordnen</button>
        </article>`;
      }).join("")}
    </div>`;
}

function renderParliamentListHtml() {
  if (!parliamentItems.length) return "";
  return `<div class="parliament-list">${parliamentItems.slice(0, 6).map((item) => renderParliamentItem(item)).join("")}</div>`;
}

function renderCollapsible(id, title, count, content) {
  if (!content || !String(content).trim()) return "";
  const open = expandedSections.has(id);
  return `
    <div class="lage-collapsible ${open ? "open" : ""}">
      <button class="lage-collapse-head" type="button" data-collapse="${escapeAttribute(id)}" aria-expanded="${open}">
        <span class="lage-collapse-title">${escapeHtml(title)}</span>
        ${count != null ? `<span class="lage-collapse-count">${escapeHtml(String(count))}</span>` : ""}
        <span class="lage-collapse-chev">▾</span>
      </button>
      ${open ? `<div class="lage-collapse-body">${content}</div>` : ""}
    </div>`;
}

function renderBriefingView() {
  const firstName = (profile?.fullName || "").split(" ")[0];
  const watchHtml = renderWatchlistMini();
  return `
    <section class="page-intro lage-head">
      <div class="lage-head-row">
        <span class="lage-greeting">${escapeHtml(timeGreeting(firstName).replace(".", ""))}</span>
        <span class="lage-date">${escapeHtml(formatBerlinFullDateTime())}</span>
      </div>
    </section>

    <p class="lage-today-label">Heute zählt</p>
    ${renderLageFocus()}
    ${renderSecondaryDecisions()}
    ${watchHtml ? `<p class="lage-section-label">Vorbereiten</p>${watchHtml}` : ""}

    <p class="lage-more-label">Mehr, wenn du willst</p>
    ${renderCollapsible("parlament", "Parlamentarische Vorgänge", parliamentItems.length || null, renderParliamentListHtml())}
    ${renderCollapsible("termine", "Termine & Vorbereitung", null, renderMeetingPrepSection())}
    ${renderCollapsible("ausblick", "Wochenausblick & Kontext", null, renderWeeklyOutlook())}
    ${renderCollapsible("lernen", "Lernpuls", null, renderLearningPulse())}
  `;
}

function renderMorningMoment() {
  const firstName = (profile?.fullName || "").split(" ")[0];
  const top = decisions[0];
  const meeting = nextPreparedMeeting();
  const watchItems = competentNoActionItems();
  const watched = watchItems
    .map((item) => item.title || item.sourceName || "")
    .filter(Boolean)
    .slice(0, 3);
  const phase = helmutDayPhase();
  const lead = top
    ? `${momentLeadPrefix(phase.key)} zählt vor allem ${top.title}.`
    : `${momentLeadPrefix(phase.key)} musst du nicht öffentlich reagieren.`;
  const action = top
    ? compactText(chiefRecommendationText(top), 128)
    : watched.length
      ? `Ich beobachte ${humanList(watched)} und ziehe es nur hoch, wenn daraus Handlungsdruck entsteht.`
      : "Ich prüfe weiter Bundesregierung, Fraktion, Ausschuss und Personenlage.";
  const meetingLine = meeting
    ? `${meeting.terminTitel}: ${compactText(meeting.entscheidungsfrage || meeting.kurzbriefing, 118)}`
    : "Kein Termin mit akutem Vorbereitungsdruck.";
  const communicationLine = top
    ? `Kommunikation: ${communicationChannelLabel(recommendedInitialChannel(top))} vorbereiten.`
    : "Kommunikation: keine Aufmerksamkeit verbrauchen, aber sprechfähig bleiben.";
  return `
    <section class="morning-moment" aria-label="Persönlicher Morgenmoment">
      <div class="moment-orb" aria-hidden="true">H</div>
      <div class="moment-copy">
        <span>${escapeHtml(momentLabel(phase.key))} · ${escapeHtml(formatBerlinTimeOnly())}</span>
        <h2>${escapeHtml(lead)}</h2>
        <p>${escapeHtml(action)}</p>
      </div>
      <div class="moment-grid">
        <div>
          <span>Termin</span>
          <p>${escapeHtml(meetingLine)}</p>
        </div>
        <div>
          <span>Kommunikation</span>
          <p>${escapeHtml(communicationLine)}</p>
        </div>
      </div>
    </section>
  `;
}

function momentLabel(phase) {
  if (phase === "morning") return "Morgenmoment";
  if (phase === "midday") return "Mittagsmoment";
  if (phase === "afternoon") return "Nachmittagsmoment";
  if (phase === "evening") return "Abendmoment";
  return "Vorbereitung";
}

function momentLeadPrefix(phase) {
  if (phase === "morning") return "Heute";
  if (phase === "midday") return "Seit dem Morgen";
  if (phase === "afternoon") return "Jetzt";
  if (phase === "evening") return "Für morgen";
  return "Morgen";
}

function renderLageSnapshot() {
  const top = decisions[0];
  if (!top) {
    const watchItems = competentNoActionItems();
    return `
      <section class="lage-card calm">
        <span>${escapeHtml(lagePhaseLabel())}</span>
        <h2>${escapeHtml(noDecisionHeadline())}</h2>
        <p>${escapeHtml(noDecisionLead(watchItems))}</p>
        ${renderNoDecisionFocusStrip(watchItems)}
        ${renderLageCheckStatus()}
        <p class="calm-directive">${escapeHtml(noDecisionDirective())}</p>
        ${renderLearningSignal()}
        <div class="lage-actions">
          <button class="primary-button" type="button" data-view="helmut">Helmuts Einschätzung öffnen</button>
          <button class="secondary-button" type="button" data-run-lage-check>Lage jetzt prüfen</button>
        </div>
      </section>
    `;
  }
  return `
    <section class="lage-card ${escapeAttribute(top.priorityType || "action")}">
      <div class="lage-card-head">
        <span>${escapeHtml(topPriorityLabel())}</span>
        <small>${escapeHtml(sourceLine(top))}</small>
      </div>
      <h2>${escapeHtml(top.title)}</h2>
      <p>${escapeHtml(compactText(top.summary || decisionWhyImportant(top), 190))}</p>
      ${renderTopDecisionBrief(top)}
      ${renderLageMovement(top)}
      ${renderLageCheckStatus()}
      ${renderMeetingRelevanceForDecision(top)}
      ${renderLearningSignal(top)}
      <div class="lage-actions">
        <button class="primary-button" type="button" data-detail="${escapeHtml(top.id)}">Empfehlung öffnen</button>
        <button class="secondary-button" type="button" data-quick-communication="${escapeHtml(top.id)}" data-quick-channel="${escapeHtml(recommendedInitialChannel(top))}">Text vorbereiten</button>
      </div>
      ${renderFeedbackActions(top)}
    </section>
  `;
}

function renderLearningPulse() {
  const learning = opsStatus?.learning || briefing.learning || briefing.learningProfile || {};
  const count = Number(learning.eventCount || 0);
  const positive = learning.topicWeights?.find((entry) => Number(entry.score || 0) > 0);
  const negative = learning.topicWeights?.find((entry) => Number(entry.score || 0) < 0);
  const message = count
    ? learning.summary || `Helmut hat ${count} Nutzungssignale und passt die Priorisierung vorsichtig an.`
    : "Markiere Empfehlungen als relevant, später, erledigt oder nicht relevant. Daraus lernt Helmut, was für dein Mandat wirklich zählt.";
  const focus = positive ? `Stärker: ${positive.label}` : negative ? `Weniger: ${negative.label}` : "Lernmodus bereit";
  return `
    <section class="learning-pulse" aria-label="Lernmodus">
      <span>${escapeHtml(focus)}</span>
      <p>${escapeHtml(message)}</p>
    </section>
  `;
}

function renderFeedbackActions(decision) {
  if (!decision?.id) return "";
  const feedbackState = decision.feedback || (decision.status === "ignored" ? "ignored" : decision.status === "snoozed" ? "snoozed" : decision.status === "done" ? "done" : decision.status === "relevant" ? "marked_relevant" : "");
  return `
    <div class="learning-actions inline-learning" aria-label="Helmut trainieren">
      <button class="${feedbackState === "marked_relevant" || feedbackState === "marked_important" ? "is-active" : ""}" type="button" data-feedback="relevant" data-feedback-id="${escapeHtml(decision.id)}">Relevant</button>
      <button class="${feedbackState === "snoozed" ? "is-active" : ""}" type="button" data-feedback="later" data-feedback-id="${escapeHtml(decision.id)}">Später</button>
      <button class="${feedbackState === "done" ? "is-active" : ""}" type="button" data-feedback="done" data-feedback-id="${escapeHtml(decision.id)}">Erledigt</button>
      <button class="${feedbackState === "ignored" ? "is-active" : ""}" type="button" data-feedback="ignored" data-feedback-id="${escapeHtml(decision.id)}">Nicht relevant</button>
    </div>
  `;
}

function renderNoDecisionFocusStrip(items = []) {
  const names = items
    .map((item) => item.title || item.sourceName || "")
    .filter(Boolean)
    .slice(0, 3);
  const labels = names.length ? names : ["Bundesregierung", "Fraktion", "Ausschuss"];
  return `
    <div class="no-decision-focus" aria-label="Weiter beobachtet">
      ${labels.map((label) => `<span>${escapeHtml(compactText(label, 46))}</span>`).join("")}
    </div>
  `;
}

function renderTopDecisionBrief(item) {
  const rows = [
    ["Warum für dich", compactText(decisionWhyImportant(item), 112)],
    ["Jetzt tun", compactText(chiefRecommendationText(item), 112)],
    ["Wenn du wartest", compactText(decisionRisk(item), 112)]
  ];
  return `
    <div class="decision-brief-grid" aria-label="Entscheidungsgrundlage">
      ${rows.map(([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <p>${escapeHtml(value)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderLearningSignal(item = null) {
  const learning = opsStatus?.learning || briefing.learning || {};
  const reason = item?.learningReason || "";
  const count = Number(learning.eventCount || 0);
  if (!reason && count < 1) return "";
  const copy = reason || `Ich berücksichtige ${count} gespeicherte Nutzungssignale aus deinen bisherigen Entscheidungen.`;
  return `<p class="learning-signal">${escapeHtml(copy)}</p>`;
}

function renderMeetingRelevanceForDecision(item) {
  const meeting = nextMeetingForItem(item);
  if (!meeting) return "";
  return `
    <p class="meeting-relevance">
      <span>Terminbezug</span>
      ${escapeHtml(`${meeting.terminTitel} · ${formatMeetingDate(meeting)}. Dieses Thema kann dafür als Gesprächspunkt oder Nachfrage dienen.`)}
    </p>
  `;
}

function renderDailyCommunicationDecision() {
  const top = decisions[0];
  const candidate = top || reactionChanceItems().find(hasPreciseSource) || null;
  const shouldPublish = Boolean(top && top.priorityType !== "watch");
  const recommendedChannel = candidate ? recommendedInitialChannel(candidate) : "press";
  const title = shouldPublish ? communicationDecisionTitle() : "Heute lieber Linie parken.";
  const copy = shouldPublish
    ? communicationDecisionCopy(top)
    : `Noch nicht veröffentlichen. Bereite eine interne Linie vor, damit du bei Nachfragen sofort sauber antworten kannst.`;
  return `
    <section class="brief-mini communication-decision">
      <div>
        <span>Kommunikation</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(copy)}</p>
        ${candidate ? `<small>${escapeHtml(`Empfohlen: ${communicationChannelLabel(recommendedChannel)} · ${communicationChannelHint(recommendedChannel)}`)}</small>` : ""}
      </div>
      ${candidate?.id ? `<div class="mini-action-stack">
        <button class="primary-button compact-button" type="button" data-quick-communication="${escapeHtml(candidate.id)}" data-quick-channel="${escapeHtml(recommendedChannel)}">${shouldPublish ? "Text vorbereiten" : "Linie parken"}</button>
        <button class="secondary-button compact-button" type="button" data-quick-communication="${escapeHtml(candidate.id)}" data-quick-channel="x">X kurz</button>
      </div>` : ""}
    </section>
  `;
}

function renderNextMeetingMini() {
  const meeting = nextPreparedMeeting();
  if (!meeting) {
    return `
      <section class="brief-mini muted">
        <div>
          <span>Termine</span>
          <h2>Kein Termin mit Vorbereitungsdruck.</h2>
          <p>Wenn im Profil wichtige Termine stehen, bereitet Helmut Gesprächspunkte und Hintergrund vor.</p>
        </div>
      </section>
    `;
  }
  return `
    <section class="brief-mini meeting">
      <div>
        <span>Termin vorbereiten</span>
        <h2>${escapeHtml(meeting.terminTitel)}</h2>
        <p>${escapeHtml(compactText(meeting.kurzbriefing || "Helmut bereitet Kontext und Gesprächspunkte vor.", 150))}</p>
        ${meeting.relevantDecision?.title ? `<small>${escapeHtml(`Aktuelle Lage dafür: ${meeting.relevantDecision.title}`)}</small>` : ""}
      </div>
      <button class="secondary-button compact-button" type="button" data-meeting-brief="${escapeHtml(meeting.id)}">Briefing</button>
    </section>
  `;
}

function renderWatchlistMini() {
  const items = competentNoActionItems().slice(0, 1);
  if (!items.length) return "";
  return `<div class="lage-watch-grid">${items.map((item) => {
    const summary = compactText(item.summary || item.relevanceReason || "", 90);
    return `
    <article class="lage-watch-item">
      <span class="lage-watch-chip">Beobachten</span>
      <strong>${escapeHtml(compactText(item.title || item.sourceName || "Entwicklung", 70))}</strong>
      ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
    </article>`;
  }).join("")}</div>`;
}

function lagePhaseLabel() {
  const phase = helmutDayPhase().key;
  if (phase === "morning") return "Morgenlage";
  if (phase === "midday") return "Mittagslage";
  if (phase === "afternoon") return "Nachmittagslage";
  if (phase === "evening") return "Abendlage";
  return "Morgen vorbereiten";
}

function topPriorityLabel() {
  const phase = helmutDayPhase().key;
  if (phase === "morning") return "Heute wichtig";
  if (phase === "midday") return "Seit dem Morgen";
  if (phase === "afternoon") return "Jetzt prüfen";
  if (phase === "evening") return "Für morgen vorbereiten";
  return "Nächste Priorität";
}

function noDecisionHeadline() {
  const phase = helmutDayPhase().key;
  if (phase === "morning") return "Heute keine Reaktion nötig.";
  if (phase === "midday") return "Keine neue Prioritätsverschiebung.";
  if (phase === "afternoon") return "Aktuell keinen Druck erzeugen.";
  if (phase === "evening") return "Für heute ist die Lage stabil.";
  return "Morgen ruhig vorbereiten.";
}

function communicationDecisionTitle() {
  const phase = helmutDayPhase().key;
  if (phase === "morning") return "Heute eine Linie vorbereiten?";
  if (phase === "midday") return "Bis Nachmittag sprechfähig sein?";
  if (phase === "afternoon") return "Vor Dienstschluss reagieren?";
  if (phase === "evening") return "Für morgen vorbereiten?";
  return "Für morgen vormerken?";
}

function communicationDecisionCopy(top) {
  const phase = helmutDayPhase().key;
  const topic = top?.title || "das Thema";
  if (phase === "morning") return `Ja. Bereite eine kurze Linie zu ${topic} vor. Der Anlass ist belastbar genug, um früh sprechfähig zu sein.`;
  if (phase === "midday") return `Ja. Prüfe bis zum Nachmittag, ob aus ${topic} eine Presse- oder Social-Linie werden sollte.`;
  if (phase === "afternoon") return `Ja. Entscheide jetzt, ob zu ${topic} heute noch ein kurzer Text rausgehen soll oder ob die Linie nur intern vorbereitet wird.`;
  if (phase === "evening") return `Ja. Lege zu ${topic} eine Linie für morgen früh bereit, statt heute ohne Not spät zu senden.`;
  return `Ja. Halte zu ${topic} eine kurze Linie für die nächste Lage bereit.`;
}

function renderLageMovement(item) {
  const development = item.lageDevelopment || sourceExcerpt(item) || "";
  const reason = item.lageMovementReason || item.changeReason || item.whyNow || "";
  const markers = [item.sourceFreshness, priorityTrendLabel(item.priorityTrend)].filter(Boolean);
  if (!development && !reason && !markers.length) return "";
  return `
    <div class="lage-movement">
      ${markers.length ? `<div class="lage-movement-markers">${markers.map((marker) => `<span>${escapeHtml(marker)}</span>`).join("")}</div>` : ""}
      ${development ? `<p><span>Entwicklung</span>${escapeHtml(compactText(development, 170))}</p>` : ""}
      ${reason ? `<p><span>Warum jetzt</span>${escapeHtml(compactText(reason, 190))}</p>` : ""}
    </div>
  `;
}

function renderLageCheckStatus() {
  const check = briefing.latestLageCheck;
  if (!check?.checkedAt) return "";
  const changed = check.status === "changed";
  const label = changed ? "Neue Bewegung" : "Priorität stabil";
  const text = check.message || (changed ? "Helmut hat eine neue Lage erkannt." : "Helmut hat geprüft: Deine Priorität hat sich nicht verändert.");
  return `
    <p class="lage-check-status ${changed ? "changed" : "stable"}">
      <span>${escapeHtml(label)} · ${escapeHtml(formatBerlinTimeOnly(new Date(check.checkedAt)))}</span>
      ${escapeHtml(compactText(text, 150))}
    </p>
  `;
}

function priorityTrendLabel(value) {
  const trend = String(value || "").toLowerCase();
  if (!trend) return "";
  if (trend === "neu") return "neue Priorität";
  if (trend === "gestiegen") return "Priorität gestiegen";
  if (trend === "gesunken") return "Druck sinkt";
  if (trend === "neue quelle") return "neuer Beleg";
  if (trend === "stabil") return "Priorität stabil";
  return value;
}

function heroText(text) {
  if (!text) return "";
  const t = String(text).trim();
  // Short complete first sentence — show as-is
  const m = t.match(/^.+?[.!?](?:\s|$)/);
  if (m && m[0].trim().length <= 55) return m[0].trim();
  // First clause before comma if meaningful and short
  const ci = t.indexOf(",");
  if (ci > 6 && ci <= 50) return t.slice(0, ci).trim() + ".";
  // Hard cap at word boundary — no ellipsis, always ends with "."
  if (t.length <= 55) return /[.!?]$/.test(t) ? t : t + ".";
  return t.slice(0, 50).replace(/\s\S*$/, "").trimEnd() + ".";
}

function helmutDecisionState(assessment) {
  const s = String(assessment?.priorityStatus || "stable");
  if (s === "risk") return "reagieren";
  if (s === "chance" || s === "changed") return "vorbereiten";
  return "beobachten";
}

function helmutDecisionLabel(state) {
  return ({
    reagieren:   "Heute reagieren — öffentliche Position einnehmen",
    vorbereiten: "Heute vorbereiten — Position bereithalten",
    beobachten:  "Heute beobachten, nicht öffentlich reagieren",
    ignorieren:  "Kein Handlungsbedarf heute",
  })[state] || "Heute beobachten, nicht öffentlich reagieren";
}

function helmutButtonConfig(state, actionId) {
  const id = escapeHtml(actionId || "");
  const cfg = {
    reagieren:   { primary: "Jetzt reagieren",        pAttr: id ? `data-detail="${id}"` : "data-run-crawl",             secondary: "Antwort vorbereiten",   sAttr: id ? `data-communication="${id}"` : "data-run-crawl" },
    vorbereiten: { primary: "Jetzt Entwurf erstellen",  pAttr: id ? `data-communication="${id}"` : `data-view="office"`,  secondary: "Quellen prüfen",        sAttr: "data-run-crawl" },
    beobachten:  { primary: "Jetzt Entwurf erstellen",  pAttr: id ? `data-communication="${id}"` : `data-view="office"`,  secondary: "Beobachten bestätigen", sAttr: `data-view="lage"` },
    ignorieren:  { primary: "Als erledigt markieren",  pAttr: id ? `data-lage-done="${id}"` : "data-run-crawl",          secondary: "Quellen prüfen",        sAttr: "data-run-crawl" },
  };
  return cfg[state] || cfg.beobachten;
}

function renderHelmutView() {
  return helmutThinking ? renderHelmutThinkingView() : renderHelmutAssessmentView();
}

function renderRefreshButton() {
  const remaining = pipelineCooldownRemaining();
  if (remaining > 0) {
    const mins = Math.ceil(remaining / 60000);
    return `<button class="text-button refresh-cooldown" type="button" disabled title="Wieder in ${mins} Min verfügbar">${mins}m</button>`;
  }
  return `<button class="text-button" type="button" data-refresh-helmut aria-label="Einschätzung neu prüfen">↻</button>`;
}

function renderHelmutThinkingView() {
  if (pipelineRunning) {
    const stepLabel = PIPELINE_STEPS[pipelineRunStep] || PIPELINE_STEPS[PIPELINE_STEPS.length - 1];
    const pct = Math.round(((pipelineRunStep + 0.5) / PIPELINE_STEPS.length) * 100);
    const stepsHtml = PIPELINE_STEPS.map((label, i) => {
      const done = i < pipelineRunStep;
      const active = i === pipelineRunStep;
      return `<span class="pipeline-step ${done ? "done" : active ? "active" : ""}">${done ? "✓ " : active ? "· " : "  "}${escapeHtml(label)}</span>`;
    }).join("");
    return `
      <section class="helmut-thinking-screen" aria-label="Helmut aktualisiert">
        <div class="helmut-core" aria-hidden="true">H</div>
        <h1>${escapeHtml(stepLabel)} …</h1>
        <div class="pipeline-progress-bar"><div class="pipeline-progress-fill" style="width:${pct}%"></div></div>
        <div class="helmut-checks pipeline-steps">${stepsHtml}</div>
      </section>
    `;
  }
  const time = formatBerlinTimeOnly();
  return `
    <section class="helmut-thinking-screen" aria-label="Helmut analysiert">
      <div class="helmut-core" aria-hidden="true">H</div>
      <h1>Helmut analysiert die Lage ...</h1>
      <p>${escapeHtml(time)}</p>
      <div class="helmut-checks">
        <span>Aktuelle Entwicklungen prüfen</span>
        <span>Relevanz für dein Mandat bewerten</span>
        <span>Empfehlung erstellen</span>
      </div>
    </section>
  `;
}

function renderHelmutAssessmentView() {
  const assessment = buildHelmutAssessment();
  if (helmutTypingActive) return renderHelmutTypingResult(assessment);
  const top = decisions[0];
  const actionId = top?.id || "";
  const state = helmutDecisionState(assessment);
  const btn = helmutButtonConfig(state, actionId);
  const firstName = (profile?.fullName || "").split(" ")[0];
  const whyLine = assessment.heroWhy || heroText(assessment.whyImportant);
  const riskLine = assessment.heroRisk || heroText(assessment.risk);
  const nextLine = assessment.heroNextStep || heroText(assessment.recommendation);
  const deadlineText = top?.deadline
    ? `Antwort erforderlich bis: ${formatDeadlineDate(top.deadline)}`
    : "Keine Frist gesetzt";
  const srcLine = helmutBriefingSourceHtml(top);
  return `
    <section class="helmut-assessment" aria-label="Helmuts Einschätzung">
      <div class="helmut-assessment-head">
        <span>Helmut</span>
        <small>${escapeHtml(timeGreeting(firstName))} · ${escapeHtml(assessment.time)} Uhr</small>
        <h1>Was ich dir empfehle</h1>
      </div>

      <div class="helmut-hero">
        <b class="priority-status ${escapeAttribute(assessment.priorityStatus || "stable")}">${escapeHtml(priorityStatusText(assessment.priorityStatus))}</b>
        <h2 class="helmut-hero-decision">${escapeHtml(helmutDecisionLabel(state))}</h2>
        <dl class="helmut-hero-bullets">
          <div><dt>Warum</dt><dd>${escapeHtml(whyLine)}</dd></div>
          <div><dt>Risiko</dt><dd>${escapeHtml(riskLine)}</dd></div>
          <div><dt>Nächster Schritt</dt><dd>${escapeHtml(nextLine)}</dd></div>
        </dl>
      </div>

      <div class="helmut-actions">
        <button class="primary-button" type="button" ${btn.pAttr}>${escapeHtml(btn.primary)}</button>
        <button class="secondary-button" type="button" ${btn.sAttr}>${escapeHtml(btn.secondary)}</button>
      </div>

      <details class="helmut-detail" open>
        <summary>Mein Vorschlag</summary>
        <div class="helmut-detail-body">
          <p>${escapeHtml(assessment.assessment)}</p>
          ${assessment.recommendation ? `<p>${escapeHtml(assessment.recommendation)}</p>` : ""}
        </div>
      </details>

      <details class="helmut-detail">
        <summary>Warum ist das wichtig?</summary>
        <div class="helmut-detail-body">
          <p>${escapeHtml(assessment.whyImportant)}</p>
        </div>
      </details>

      <details class="helmut-detail helmut-detail--risk">
        <summary>Risiko bei Nichtreaktion</summary>
        <div class="helmut-detail-body">
          <p>${escapeHtml(assessment.risk)}</p>
        </div>
      </details>

      <div class="helmut-assessment-foot">
        <small>Aktualisiert: ${escapeHtml(formatBriefingDate(briefing.generatedAt || briefing.date || new Date().toISOString()))}</small>
        <small class="helmut-deadline">${escapeHtml(deadlineText)}</small>
        ${srcLine ? `<small class="helmut-source">${srcLine}</small>` : ""}
        ${renderRefreshButton()}
      </div>
    </section>
  `;
}

function renderHelmutTypingResult(assessment) {
  return `
    <section class="helmut-assessment helmut-assessment-typing" aria-label="Helmuts Einschätzung">
      <div class="helmut-assessment-head">
        <span>Helmut</span>
        <small>${escapeHtml(assessment.time)} Uhr</small>
        <h1>Was ich dir empfehle</h1>
      </div>
      <article class="helmut-note helmut-typewriter" aria-live="polite">
        <b class="priority-status ${escapeAttribute(assessment.priorityStatus || "stable")}">${escapeHtml(priorityStatusText(assessment.priorityStatus))}</b>
        <p>${escapeHtml(helmutTypedText)}<span class="typing-cursor" aria-hidden="true"></span></p>
      </article>
    </section>
  `;
}

function buildHelmutAssessment() {
  const stored = briefing?.helmutAssessment;
  if (stored && typeof stored === "object") {
    const normalized = {
      greeting: timeGreeting((profile?.fullName || "").split(" ")[0]),
      time: String(stored.time || formatBerlinTimeOnly()).trim(),
      assessment: String(stored.assessment || "").trim(),
      recommendation: String(stored.recommendation || "").trim(),
      whyImportant: String(stored.whyImportant || "").trim(),
      risk: String(stored.risk || "").trim(),
      priorityStatus: String(stored.priorityStatus || "stable").trim(),
      typingText: String(stored.typingText || "").trim(),
      heroWhy: String(stored.heroWhy || "").trim(),
      heroRisk: String(stored.heroRisk || "").trim(),
      heroNextStep: String(stored.heroNextStep || "").trim()
    };
    if (normalized.assessment || normalized.recommendation || normalized.typingText) {
      if (!normalized.typingText) normalized.typingText = assessmentTypingText(normalized);
      return normalized;
    }
  }
  const firstName = (profile?.fullName || "").split(" ")[0];
  const top = decisions[0];
  const watch = competentNoActionItems()[0];
  const topic = top?.title || watch?.title || centralAgendaTopic();
  const phase = helmutDayPhase();
  const prioritySentence = helmutPrioritySentence(top, topic);
  const phaseSentence = helmutPhaseSentence(phase, top, topic);
  const recommendation = top
    ? `${phase.recommendationPrefix} ${compactText(chiefRecommendationText(top), 155)}`
    : `${phase.recommendationPrefix} Halte ${topic} im Blick, aber starte keine öffentliche Reaktion ohne neuen Anlass.`;
  const fallback = {
    greeting: timeGreeting(firstName),
    time: formatBerlinTimeOnly(),
    assessment: compactText(`${prioritySentence} ${phaseSentence}`, 235),
    recommendation: compactText(recommendation, 210),
    whyImportant: top
      ? compactText(decisionWhyImportant(top), 190)
      : compactText(`Das ist wichtig, weil ${topic} an dein Mandatsprofil anschließt und sich daraus kurzfristig eine politische Anschlussfrage ergeben kann.`, 190),
    risk: top
      ? compactText(decisionRisk(top), 180)
      : `Wenn du jetzt reagierst, ohne dass sich die Lage verändert hat, verbrauchst du Aufmerksamkeit. Besser: vorbereitet bleiben und erst bei neuer Dynamik handeln.`
    ,
    priorityStatus: top ? (top.priorityType === "risk" ? "risk" : top.priorityType === "chance" ? "chance" : top.priorityTrend === "gestiegen" ? "changed" : "stable") : "stable",
    heroWhy: "",
    heroRisk: "",
    heroNextStep: ""
  };
  fallback.typingText = assessmentTypingText(fallback);
  return fallback;
}

function priorityStatusText(value) {
  return ({
    stable: "Priorität stabil",
    changed: "Priorität verändert",
    risk: "Risiko gestiegen",
    chance: "Chance erkannt"
  })[String(value || "stable").toLowerCase()] || "Priorität geprüft";
}

function assessmentTypingText(assessment) {
  return [
    assessment.greeting,
    assessment.assessment,
    `Mein Vorschlag: ${assessment.recommendation}`,
    `Warum wichtig: ${assessment.whyImportant}`,
    `Risiko bei Nichtreaktion: ${assessment.risk}`
  ].filter(Boolean).join("\n\n");
}

function helmutPrioritySentence(top, topic) {
  if (!top) return `Deine Prioritäten haben sich aktuell nicht verändert. Fokus bleibt auf ${topic}.`;
  if (top.statusChange && top.statusChange !== "Unverändert") return `${topic} hat sich verändert: ${top.changeReason || top.statusChange}.`;
  if (top.changeReason && /gestiegen|neue|risiko|chance|dynamik/i.test(top.changeReason)) return `${topic} ist wichtiger geworden. ${top.changeReason}`;
  if (top.priorityType === "risk") return `${topic} ist aktuell dein größtes Risiko.`;
  if (top.priorityType === "chance") return `${topic} eröffnet gerade politischen Handlungsspielraum.`;
  return `${topic} bleibt deine wichtigste Priorität.`;
}

function helmutPhaseSentence(phase, top, topic) {
  const mandate = profile?.committee || profile?.committees?.[0] || "dein Ausschuss";
  if (phase.key === "morning") return top ? `Heute zählt, ob du dazu früh sprechfähig bist, weil ${mandate} berührt ist.` : `Heute reicht Beobachtung; ich prüfe Regierung, Fraktion und Ausschuss weiter.`;
  if (phase.key === "midday") return top ? `Seit dem Morgen ist entscheidend, ob daraus Reaktionsdruck entsteht.` : `Seit dem Morgen gibt es keine neue Prioritätsverschiebung.`;
  if (phase.key === "afternoon") return top ? `Jetzt solltest du klären, ob eine Linie vor Dienstschluss vorbereitet werden muss.` : `Der Nachmittag bleibt stabil; keine unnötige Kommunikation.`;
  if (phase.key === "evening") return top ? `Heute solltest du abschließen, was morgen früh vorbereitet sein muss.` : `Für heute besteht kein akuter Kommunikationsbedarf.`;
  return top ? `Für morgen solltest du die Linie zu ${topic} vorbereiten.` : `Für morgen bleibt ${topic} der Beobachtungspunkt.`;
}

function helmutDayPhase() {
  const hour = berlinHour();
  if (hour >= 5 && hour < 11) return { key: "morning", recommendationPrefix: "Bereite heute" };
  if (hour >= 11 && hour < 14) return { key: "midday", recommendationPrefix: "Prüfe bis zum Nachmittag" };
  if (hour >= 14 && hour < 18) return { key: "afternoon", recommendationPrefix: "Bereite jetzt" };
  if (hour >= 18 && hour < 22) return { key: "evening", recommendationPrefix: "Bereite bis morgen 09:00 Uhr" };
  return { key: "late", recommendationPrefix: "Lege für morgen früh" };
}

function centralAgendaTopic() {
  const top = decisions[0];
  if (top?.title) return top.title;
  const watch = competentNoActionItems()[0];
  return watch?.title || "Ruhe bewahren und die Lage weiter prüfen";
}

function currentAgendaLead() {
  const top = decisions[0];
  const meeting = nextPreparedMeeting();
  if (top && meeting) return `Aktuell an: ${top.title}. Danach solltest du ${meeting.terminTitel} vorbereiten.`;
  if (top) return `Aktuell an: ${top.title}.`;
  if (meeting) return `Aktuell an: ${meeting.terminTitel} vorbereiten.`;
  return "Aktuell keine Reaktion nötig. Ich beobachte die Lage weiter und halte sie für dich schlank.";
}

function renderDailyAgendaAnswer() {
  const top = decisions[0];
  const meeting = nextPreparedMeeting();
  const chance = topChanceItem(top);
  const risk = topRiskItem(top);
  if (!top) {
    const watchItems = competentNoActionItems();
    return `
      <section class="daily-answer calm">
        <span>Was steht aktuell an?</span>
        <h2>Heute keine Reaktion nötig.</h2>
        <p>${escapeHtml(noDecisionLead(watchItems))}</p>
        <p class="calm-directive">${escapeHtml(noDecisionDirective())}</p>
        ${renderAgendaAnswerGrid(null, chance, risk, meeting)}
      </section>
    `;
  }
  return `
    <section class="daily-answer ${escapeAttribute(top.priorityType || "action")}">
      <span>Was steht aktuell an?</span>
      <h2>Heute zählt vor allem: ${escapeHtml(top.title)}</h2>
      <p>${escapeHtml(decisionWhyImportant(top))}</p>
      ${renderAgendaAnswerGrid(top, chance, risk, meeting)}
      <div class="daily-answer-actions">
        <button class="primary-button" type="button" data-detail="${escapeHtml(top.id)}">Empfehlung öffnen</button>
      </div>
    </section>
  `;
}

function renderPoliticalContextSections() {
  const governmentItems = governmentPlanItems().slice(0, 1);
  const partyItems = partyFactionItems().slice(0, 1);
  return `
    <section class="agenda-section political-context">
      <div class="agenda-section-head">
        <span>Regierung</span>
        <h2>Vorhaben der Bundesregierung</h2>
      </div>
      <div class="agenda-list compact-agenda">
        ${governmentItems.map((item) => renderPoliticalContextCard(item, "Oppositionslage", "Welche Linie kannst du setzen?")).join("") || `
          <article class="context-card calm">
            <span>Kein neues belastbares Vorhaben</span>
            <h3>Ich prüfe weiter BMAS, Bundesregierung, Bundestag und Ausschuss.</h3>
            <p>Für dich heißt das: keine vorschnelle Reaktion, aber die Regierungslage bleibt im Blick.</p>
          </article>
        `}
      </div>
    </section>
    <section class="agenda-section political-context">
      <div class="agenda-section-head">
        <span>Fraktion</span>
        <h2>Aus Fraktion und Partei</h2>
      </div>
      <div class="agenda-list compact-agenda">
        ${partyItems.map((item) => renderPoliticalContextCard(item, "Linie deiner Seite", "Was ist anschlussfähig?")).join("") || `
          <article class="context-card calm">
            <span>Keine neue Fraktionslage</span>
            <h3>Ich beobachte weiter, welche Linie Die Linke und die Fraktion setzen.</h3>
            <p>Wenn daraus ein politischer Hebel für Arbeit und Soziales entsteht, hebt Helmut es in die Tageslage.</p>
          </article>
        `}
      </div>
    </section>
  `;
}

function renderPoliticalContextCard(item, label, prompt) {
  const href = sourceHref(item.primarySource || item);
  return `
    <article class="context-card ${escapeAttribute(item.contextType || item.priorityType || "watch")}">
      <div>
        <span>${escapeHtml(label)}</span>
        <h3>${escapeHtml(item.title || "Politische Lage")}</h3>
        <p>${escapeHtml(compactText(contextItemSummary(item), 180))}</p>
        <small>${escapeHtml(prompt)} ${escapeHtml(item.sourceName ? `· ${item.sourceName}` : "")}</small>
      </div>
      ${href ? `<a class="source-pill" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>` : ""}
    </article>
  `;
}

function renderAgendaAnswerGrid(top, chance, risk, meeting) {
  const rows = [
    {
      label: "Reaktion",
      value: top ? compactText(chiefRecommendationText(top), 118) : "Keine öffentliche Reaktion nötig."
    },
    {
      label: "Chance",
      value: chance ? compactText(chance.opportunity || chance.possibleUpside || chance.summary, 118) : "Keine belastbare Chance für eine Positionierung."
    },
    {
      label: "Risiko",
      value: risk ? compactText(decisionRisk(risk), 118) : "Kein akutes Risiko durch Nichtreaktion."
    },
    {
      label: "Termin",
      value: meeting ? `${formatMeetingDate(meeting)}: ${meeting.terminTitel}` : "Kein Termin im Profil, der heute Vorbereitung verlangt."
    }
  ];
  return `
    <div class="agenda-answer-grid">
      ${rows.map((row) => `
        <div class="agenda-answer-item">
          <span>${escapeHtml(row.label)}</span>
          <p>${escapeHtml(row.value)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTodayImportantSection() {
  const items = agendaPriorities().slice(0, 2);
  return `
    <section class="agenda-section">
      <div class="agenda-section-head">
        <span>A</span>
        <h2>Heute wichtig</h2>
      </div>
      <div class="agenda-list">
        ${items.map(renderAgendaPriority).join("") || `<p class="empty-state">Heute keine priorisierte Entscheidung. Helmut hält Regierung, Fraktion und Ausschuss im Blick.</p>`}
      </div>
    </section>
  `;
}

function renderAgendaPriority(decision) {
  const metrics = decisionRelevanceMetrics(decision);
  return `
    <article class="agenda-priority ${escapeAttribute(decision.priorityType || "action")}">
      <div>
        <span>${escapeHtml(decision.priorityLabel || "Relevant")}</span>
        <h3>${escapeHtml(decision.title)}</h3>
        <p>${escapeHtml(compactText(decisionWhyImportant(decision), 170))}</p>
        <div class="agenda-metrics">
          <span>Ausschuss ${escapeHtml(metrics.committee)}</span>
          <span>Menschen ${escapeHtml(metrics.citizens)}</span>
          <span>${escapeHtml(metrics.urgency)} dringend</span>
        </div>
        <p><b>Aktion:</b> ${escapeHtml(compactText(chiefRecommendationText(decision), 150))}</p>
      </div>
    </article>
  `;
}

function renderMeetingPrepSection() {
  const meetings = meetingPreparations().slice(0, 1);
  if (!meetings.length) return `<p class="empty-state">Noch keine Termine im Mandatsprofil.</p>`;
  return `<div class="agenda-list">${meetings.map(renderMeetingPrepCard).join("")}</div>`;
}

function renderWeeklyOutlook() {
  const items = weeklyOutlookItems().slice(0, 4);
  if (!items.length) return `<p class="lage-focus-why">Keine harte Wochenpriorität. Ich melde, wenn sich das ändert.</p>`;
  return `<div class="weekly-outlook-list">${items.map(renderWeeklyOutlookItem).join("")}</div>`;
}

function weeklyOutlookItems() {
  const meeting = meetingPreparations()[0];
  const government = governmentPlanItems()[0];
  const committee = [...decisions, ...competentNoActionItems()].find((item) => {
    const text = `${item.title || ""} ${item.summary || ""} ${item.whyItMatters || ""} ${item.personal_relevance_explanation || ""}`.toLowerCase();
    return text.includes("ausschuss") || text.includes("bmas") || text.includes("arbeit und soziales");
  });
  const items = [];
  if (meeting) {
    items.push({
      type: "Termin",
      title: meeting.terminTitel,
      body: "",
      action: formatMeetingDate(meeting),
      href: ""
    });
  }
  if (government) {
    items.push({
      type: "Bundesregierung",
      title: draftTitle(government),
      body: compactText(contextItemSummary(government), 132),
      action: "Linie prüfen",
      href: sourceHref(government.primarySource || government)
    });
  }
  if (committee && committee.id !== government?.id) {
    items.push({
      type: "Ausschuss",
      title: draftTitle(committee),
      body: compactText(decisionWhyImportant(committee), 132),
      action: "Für Ausschuss vormerken",
      href: sourceHref(committee.primarySource || committee)
    });
  }
  if (items.length < 3) {
    const party = partyFactionItems().find((item) => !items.some((existing) => existing.title === item.title));
    if (party) {
      items.push({
        type: "Fraktion",
        title: draftTitle(party),
        body: compactText(contextItemSummary(party), 132),
        action: "Anschlussfähigkeit prüfen",
        href: sourceHref(party.primarySource || party)
      });
    }
  }
  if (items.length < 3) {
    const focusTopic = topProfileTopicsForView()[0] || "Arbeit und Soziales";
    items.push({
      type: "Beobachtung",
      title: `${focusTopic}: Regierungslage im Blick behalten`,
      body: `Ich prüfe weiter, ob Bundesregierung oder Ausschuss dazu in dieser Woche ein Vorhaben auslösen.`,
      action: "Nur hochziehen, wenn daraus Handlungsdruck entsteht.",
      href: ""
    });
  }
  return items;
}

function renderWeeklyOutlookItem(item) {
  return `
    <article class="weekly-outlook-item weekly-outlook-compact">
      <span>${escapeHtml(item.type)}</span>
      <strong>${escapeHtml(compactText(item.title, 60))}</strong>
      <small>${escapeHtml(item.action)}${item.href ? ` <a class="outlook-source-link" href="${escapeAttribute(item.href)}" target="_blank" rel="noopener noreferrer">↗</a>` : ""}</small>
    </article>
  `;
}

function renderMeetingPrepCard(meeting) {
  const source = meeting.relevantDecision ? sourceLine(meeting.relevantDecision) : "Mandatsprofil · Termin";
  const hint = compactText(meeting.entscheidungsfrage || meeting.kurzbriefing, 100);
  return `
    <article class="meeting-card meeting-prep-card">
      <div class="meeting-prep-main">
        <span>${escapeHtml(formatMeetingDate(meeting))}</span>
        <h3>${escapeHtml(meeting.terminTitel)}</h3>
        ${hint ? `<p>${escapeHtml(hint)}</p>` : ""}
        <details class="meeting-detail">
          <summary>Vorbereitung öffnen</summary>
          ${meeting.kernlinie ? `<div class="meeting-line-box"><small>Kernlinie</small><strong>${escapeHtml(meeting.kernlinie)}</strong></div>` : ""}
          ${(meeting.kritischeFragen || []).length ? `
          <div class="meeting-prep-grid">
            <div><small>Im Termin klären</small><ul>${meeting.kritischeFragen.slice(0, 3).map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul></div>
            ${(meeting.risiken || []).length ? `<div><small>Risiko</small><ul>${meeting.risiken.slice(0, 2).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div>` : ""}
          </div>` : ""}
          <p class="meeting-source-note">Basis: ${escapeHtml(source)}</p>
        </details>
      </div>
      <div class="meeting-actions">
        <button class="secondary-button compact-button" type="button" data-meeting-brief="${escapeHtml(meeting.id)}">Kurzbriefing</button>
        <button class="secondary-button compact-button" type="button" data-meeting-line="${escapeHtml(meeting.id)}">Linie kopieren</button>
      </div>
    </article>
  `;
}

function renderReactionChanceSection() {
  const items = reactionChanceItems().slice(0, 3);
  return `
    <section class="agenda-section">
      <div class="agenda-section-head">
        <span>C</span>
        <h2>Reaktionen und Chancen</h2>
      </div>
      <div class="agenda-list compact-agenda">
        ${items.map(renderReactionChanceCard).join("") || `<p class="empty-state">Aktuell keine zusätzliche Reaktion sinnvoll.</p>`}
      </div>
    </section>
  `;
}

function renderReactionChanceCard(decision) {
  return `
    <article class="reaction-card ${escapeAttribute(decision.priorityType || "chance")}">
      <div>
        <span>${escapeHtml(recommendedChannelLabel(decision))}</span>
        <h3>${escapeHtml(decision.title)}</h3>
        <p>${escapeHtml(compactText(decision.summary || decisionWhyImportant(decision), 160))}</p>
        <p><b>Chance:</b> ${escapeHtml(compactText(decision.opportunity || decision.possibleUpside || "Du kannst früh fachlich sichtbar werden.", 140))}</p>
      </div>
      <button class="secondary-button compact-button" type="button" data-communication="${escapeHtml(decision.id)}">Statement vorbereiten</button>
    </article>
  `;
}

function nextPreparedMeeting() {
  return meetingPreparations()[0] || null;
}

function topChanceItem(fallback) {
  return reactionChanceItems()[0] || (fallback?.priorityType === "chance" ? fallback : null);
}

function topRiskItem(fallback) {
  return decisions.find((decision) => decision.priorityType === "risk" || decision.risk || decision.consequenceIfIgnored) || fallback || null;
}

function compactText(value, maxLength = 140) {
  const text = twoSentenceSummary(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength - 1).replace(/\s+\S*$/, "");
  return `${sliced || text.slice(0, maxLength - 1)}...`;
}

function agendaPriorities() {
  const fromSections = (briefing.homeSections?.topTasks || []).map(normalizeHomeItem).filter(Boolean);
  const source = decisions.length ? decisions : fromSections;
  return source
    .filter((item) => item && item.title)
    .sort((a, b) => Number(b.relevanceScore || b.finalScore || b.priority || 0) - Number(a.relevanceScore || a.finalScore || a.priority || 0));
}

function reactionChanceItems() {
  const sectionChances = (briefing.homeSections?.opportunities || []).map(normalizeHomeItem).filter(Boolean);
  const merged = [...decisions, ...sectionChances]
    .filter((item) => item && item.title)
    .filter(uniqueDecisionItem);
  return merged
    .filter((item) => (item.priorityType === "chance" || item.opportunity || Number(item.reactionChance || item.relevanceScore || 0) >= 55))
    .slice(0, 5);
}

function governmentPlanItems() {
  const home = (briefing.homeSections?.governmentPlans || []).map(normalizeHomeItem).filter(Boolean);
  const situational = (briefing.situationalBriefing || []).filter((item) => contextTypeForItem(item) === "government");
  const fromDecisions = decisions.filter((item) => contextTypeForItem(item) === "government");
  return [...home, ...fromDecisions, ...situational]
    .filter((item) => item && item.title && hasPreciseSource(item))
    .filter(uniqueDecisionItem)
    .sort(sortContextPriority)
    .slice(0, 3);
}

function partyFactionItems() {
  const home = (briefing.homeSections?.partyFaction || []).map(normalizeHomeItem).filter(Boolean);
  const situational = (briefing.situationalBriefing || []).filter((item) => contextTypeForItem(item) === "party");
  const fromDecisions = decisions.filter((item) => contextTypeForItem(item) === "party");
  return [...home, ...fromDecisions, ...situational]
    .filter((item) => item && item.title && hasPreciseSource(item))
    .filter(uniqueDecisionItem)
    .sort(sortContextPriority)
    .slice(0, 3);
}

function sortContextPriority(a, b) {
  return Number(b.relevanceScore || b.finalScore || b.priority || 0) - Number(a.relevanceScore || a.finalScore || a.priority || 0)
    || new Date(b.publishedAt || b.updatedAt || 0) - new Date(a.publishedAt || a.updatedAt || 0);
}

function contextTypeForItem(item = {}) {
  if (item.contextType) return item.contextType;
  const sourceText = `${item.sourceName || ""} ${item.sourceType || ""} ${item.title || ""} ${item.summary || ""} ${item.content || ""}`.toLowerCase();
  if (sourceText.includes("bundesregierung") || sourceText.includes("bundesministerium") || sourceText.includes("bmas") || sourceText.includes("bundeskabinett") || sourceText.includes("ministerium")) return "government";
  if (sourceText.includes("die linke") || sourceText.includes("linksfraktion") || sourceText.includes("fraktion")) return "party";
  return "";
}

function contextItemSummary(item = {}) {
  if (item.action) return item.action;
  if (item.summary) return item.summary;
  if (item.relevanceReason) return item.relevanceReason;
  return item.excerpt || item.content || "Helmut hält diese politische Lage für dich im Blick.";
}

function uniqueDecisionItem(item, index, items) {
  const key = item.signalId || item.id || item.title;
  return items.findIndex((entry) => (entry.signalId || entry.id || entry.title) === key) === index;
}

function decisionRelevanceMetrics(decision) {
  return {
    committee: qualitativeScore(decision.committeeScore || decision.mandateScore || 0, "direkt", "mittel", "schwach"),
    citizens: qualitativeScore(decision.citizenImpact || decision.mandateScore || 0, "hoch", "mittel", "begrenzt"),
    urgency: decision.urgency ? capitalize(decision.urgency) : qualitativeScore(decision.timeUrgency || decision.relevanceScore || 0, "hoch", "mittel", "niedrig")
  };
}

function qualitativeScore(value, highLabel, mediumLabel, lowLabel) {
  const score = Number(value || 0);
  if (score >= 75) return highLabel;
  if (score >= 45) return mediumLabel;
  return lowLabel;
}

function recommendedChannelLabel(decision) {
  const channel = String(decision.recommendedChannel || decision.actionType || "").toLowerCase();
  if (channel.includes("social") || channel.includes("post") || channel.includes("linkedin") || channel.includes("x")) return "Social Media";
  if (channel.includes("press") || channel.includes("presse")) return "Presse";
  if (channel.includes("plenum")) return "Plenum";
  if (channel.includes("ausschuss") || channel.includes("committee")) return "Ausschuss";
  if (channel.includes("office") || channel.includes("brief_team") || channel.includes("büro")) return "Büro";
  return "Presse";
}

function meetingPreparations() {
  // Nur ECHTE Termine aus dem Mandatsprofil. Keine erfundenen Fallback-Termine:
  // ist nichts hinterlegt, bleibt die Liste leer und der Render zeigt den
  // Empty-State ("Noch keine Termine im Mandatsprofil.").
  return asTextList(profile?.upcomingAppointments)
    .map(parseAppointmentText)
    .filter(isRelevantMeetingDate)
    .map((meeting, index) => prepareMeeting(meeting, index))
    .sort((a, b) => new Date(a.datum || 0) - new Date(b.datum || 0));
}

function isRelevantMeetingDate(meeting) {
  const date = new Date(meeting?.datum || "");
  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() >= Date.now() - 12 * 60 * 60 * 1000;
}

function parseAppointmentText(value, index = 0) {
  const text = String(value || "").trim();
  const parts = text.split(/\s*[|;]\s*/).filter(Boolean);
  return {
    id: `meeting-profile-${index}-${slugify(text).slice(0, 36)}`,
    terminTitel: parts[0] || text || "Politischer Termin",
    datum: parts[1] || nextWeekdayIso(index + 1),
    uhrzeit: parts[2] || "10:00",
    teilnehmer: parts[3] || "",
    organisation: parts[4] || "",
    thema: parts[5] || parts[0] || text,
    notizenVomBüro: parts.slice(6).join(" · ")
  };
}

// Bewusst leer: Es werden KEINE erfundenen Termine mehr erzeugt. Echte Termine
// kommen ausschließlich aus profile.upcomingAppointments (siehe meetingPreparations).
function fallbackMeetings() {
  return [];
}

function prepareMeeting(input, index = 0) {
  const topic = input.thema || input.terminTitel || "den Termin";
  const sourceDecision = decisions.find((decision) => textHasTopic(decision, topic)) || decisions[0] || {};
  const context = sourceDecision.title ? `Aktuelle Lage: ${sourceDecision.title}. ${sourceDecision.summary || ""}` : "Aktuelle Lage aus Mandatsprofil und laufenden Quellen prüfen.";
  const committee = profile?.committee || profile?.committees?.[0] || "Arbeit und Soziales";
  const coreLine = meetingCoreLine(input, sourceDecision);
  return {
    ...input,
    id: input.id || `meeting-${index}-${slugify(input.terminTitel || topic)}`,
    kurzbriefing: `Dieser Termin ist relevant, weil er direkt an deinen Ausschuss ${committee} und deine Schwerpunkte ${topProfileTopicsForView().slice(0, 3).join(", ")} anschließt.`,
    kernlinie: coreLine,
    entscheidungsfrage: meetingDecisionQuestion(input, sourceDecision),
    politischerKontext: context,
    aktuelleLage: context,
    relevantDecision: sourceDecision?.title ? sourceDecision : null,
    moeglicheInteressenDerGegenseite: opponentInterestForMeeting(input),
    empfohleneGespraechspunkte: meetingTalkingPoints(input, sourceDecision),
    kritischeFragen: meetingCriticalQuestions(input, sourceDecision),
    chancen: meetingChances(input, sourceDecision),
    risiken: meetingRisks(input, sourceDecision),
    moeglicheAnschlussaktion: `Nach dem Termin kurze Linie festhalten: Was kannst du öffentlich aufgreifen, was geht ans Büro, was bleibt intern?`,
    optionalRedeentwurf: `Redeimpuls: Gute Arbeit und soziale Sicherheit müssen im Alltag der Menschen ankommen. Genau daran messen wir politische Vorhaben.`,
    optionalSocialStatement: `${topic}: Entscheidend ist, dass soziale Politik konkret wirkt - bei Arbeit, Sicherheit und Respekt im Alltag.`,
    optionalPressezitat: coreLine
  };
}

function nextMeetingForItem(item) {
  if (!item) return null;
  return meetingPreparations().find((meeting) => {
    const meetingText = `${meeting.terminTitel || ""} ${meeting.thema || ""} ${meeting.notizenVomBüro || ""}`.toLowerCase();
    const itemText = `${item.title || ""} ${item.summary || ""} ${item.whyItMatters || ""} ${item.action || ""}`.toLowerCase();
    const sharedTopic = meetingText.split(/\W+/).filter((part) => part.length > 4).some((part) => itemText.includes(part));
    return sharedTopic
      || (itemText.includes("bmas") && meetingText.includes("bundesregierung"))
      || (itemText.includes("ausschuss") && meetingText.includes("ausschuss"));
  }) || null;
}

function meetingDraftText(meeting, type = "briefing") {
  if (type === "line") {
    return [
      `Kernlinie für ${meeting.terminTitel}`,
      "",
      meeting.kernlinie,
      "",
      "Warum diese Linie:",
      `- ${meeting.kurzbriefing}`,
      `- ${meeting.entscheidungsfrage}`,
      "",
      "Nächster Schritt:",
      meeting.moeglicheAnschlussaktion
    ].join("\n");
  }
  if (type === "questions") {
    return [
      `Fragen für ${meeting.terminTitel}`,
      "",
      ...meeting.kritischeFragen.map((question) => `- ${question}`),
      "",
      `Ziel: ${meeting.moeglicheAnschlussaktion}`
    ].join("\n");
  }
  if (type === "speech") {
    return [
      `Redeimpuls für ${meeting.terminTitel}`,
      "",
      meeting.optionalRedeentwurf,
      "",
      "Gesprächspunkte:",
      ...meeting.empfohleneGespraechspunkte.map((point) => `- ${point}`),
      "",
      `Pressefähige Linie: ${meeting.optionalPressezitat}`
    ].join("\n");
  }
  return [
    `Kurzbriefing: ${meeting.terminTitel}`,
    "",
    `Kernlinie: ${meeting.kernlinie}`,
    "",
    meeting.kurzbriefing,
    "",
    `Entscheidungsfrage: ${meeting.entscheidungsfrage}`,
    "",
    `Aktuelle Lage: ${meeting.politischerKontext}`,
    "",
    "Bitte im Termin klären:",
    ...meeting.kritischeFragen.slice(0, 3).map((question) => `- ${question}`),
    "",
    "Politisch wichtig:",
    `- Chance: ${meeting.chancen[0]}`,
    `- Risiko: ${meeting.risiken[0]}`,
    "",
    `Anschlussaktion: ${meeting.moeglicheAnschlussaktion}`
  ].join("\n");
}

function textHasTopic(decision, topic) {
  const text = `${decision?.title || ""} ${decision?.summary || ""} ${decision?.whyItMatters || ""}`.toLowerCase();
  return String(topic || "").toLowerCase().split(/\W+/).filter((part) => part.length > 4).some((part) => text.includes(part));
}

function meetingTalkingPoints(input, decision = {}) {
  const topic = input.thema || input.terminTitel || "das Thema";
  return [
    `Welche konkrete Wirkung hat ${topic} für Beschäftigte und Menschen mit niedrigen Einkommen?`,
    `Welche rote Linie solltest du bei Finanzierung, Kontrolle oder Umsetzung setzen?`,
    decision.title ? `Aktuelle Quelle ansprechen: ${decision.title}.` : "Nach belastbaren Beispielen und Zahlen fragen."
  ];
}

function meetingCoreLine(input, decision = {}) {
  const topic = input.thema || input.terminTitel || "das Thema";
  if (decision.title) {
    return `Deine Linie sollte sein: ${compactText(chiefRecommendationText(decision), 145)}`;
  }
  if (String(topic).toLowerCase().includes("tarif")) {
    return "Tarifbindung muss im Alltag kontrollierbar und durchsetzbar sein, nicht nur als politisches Versprechen auftauchen.";
  }
  if (String(topic).toLowerCase().includes("rente")) {
    return "Soziale Sicherheit im Alter darf nicht gegen Haushaltslogik ausgespielt werden.";
  }
  if (String(topic).toLowerCase().includes("bürgergeld") || String(topic).toLowerCase().includes("armut")) {
    return "Die Debatte darf nicht bei Sanktionen stehen bleiben; entscheidend sind Beratung, gute Arbeit und Armutsvermeidung.";
  }
  return `Halte den Termin auf eine klare politische Linie: Was hilft konkret vielen Menschen, und wo muss die Bundesregierung liefern?`;
}

function meetingDecisionQuestion(input, decision = {}) {
  const topic = input.thema || input.terminTitel || "das Thema";
  if (decision.title) {
    return `Musst du aus dem Termin heraus zu "${decision.title}" öffentlich reagieren oder reicht eine interne Nachbereitung?`;
  }
  return `Entsteht aus ${topic} eine öffentliche Position, eine Ausschussfrage oder nur eine interne Notiz?`;
}

function meetingCriticalQuestions(input) {
  const topic = input.thema || input.terminTitel || "das Thema";
  return [
    `Welche Zusage braucht ihr konkret von Politik zu ${topic}?`,
    "Wo ist die Bundesregierung bisher zu unkonkret?",
    "Welche Zahl oder welches Beispiel sollte Cem öffentlich nutzen?"
  ];
}

function meetingChances(input, decision = {}) {
  return [
    decision.opportunity || "Du kannst fachliche Nähe zeigen und eine konkrete soziale Forderung mitnehmen.",
    "Der Termin kann Stoff für Statement, Ausschussfrage oder Büroauftrag liefern."
  ];
}

function meetingRisks(input, decision = {}) {
  return [
    decision.inaction || "Ohne Vorbereitung bleibt der Termin freundlich, aber politisch nicht verwertbar.",
    "Wenn keine Anschlussaktion entsteht, verpufft der Nutzen im Büroalltag."
  ];
}

function opponentInterestForMeeting(input) {
  const text = `${input.organisation || ""} ${input.thema || ""}`.toLowerCase();
  if (text.includes("gewerkschaft")) return "Konkrete Zusagen zu Tarifbindung, Kontrollen und öffentlichem Druck.";
  if (text.includes("sozial")) return "Sichtbarkeit für soziale Folgen und belastbare parlamentarische Nachfrage.";
  if (text.includes("ausschuss")) return "Klare Fragen, die die Bundesregierung zur Umsetzung zwingen.";
  return "Verlässliche Aufmerksamkeit, klare nächste Schritte und politische Anschlussfähigkeit.";
}

function formatMeetingDate(meeting) {
  const date = meeting.datum ? formatBriefingDate(meeting.datum) : "Diese Woche";
  return `${date}${meeting.uhrzeit ? ` · ${meeting.uhrzeit}` : ""}`;
}

function nextWeekdayIso(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + Number(offsetDays || 1));
  return date.toISOString();
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function renderSecondaryMovements() {
  const secondary = decisions.slice(1, 3);
  if (!secondary.length) return "";
  return `
    <section class="secondary-movements" aria-label="Weitere Bewegungen">
      <span>Danach</span>
      ${secondary.map((item) => `
        <button class="movement-row ${escapeAttribute(item.priorityType || "watch")}" type="button" data-detail="${escapeAttribute(item.id)}">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.priorityLabel || "Relevant")} · ${escapeHtml(item.estimatedTime || "10 Min.")}</small>
        </button>
      `).join("")}
    </section>
  `;
}

function renderBriefingTicker() {
  return `
    <section class="briefing-ticker" aria-label="Kurzüberblick">
      <span>Jetzt</span>
      ${agentFacts().map((fact) => `<b>${escapeHtml(fact)}</b>`).join("")}
      <small>${escapeHtml(formatBriefingDate(briefing.generatedAt || briefing.date || new Date().toISOString()))}</small>
    </section>
  `;
}

function renderBriefingQuickList() {
  const quickItems = decisions.slice(0, 3);
  if (!quickItems.length) {
    return `
      <section class="quick-panel">
        <span>Kurzlage</span>
        <h2>Keine neue Entscheidung</h2>
        <p>Helmut hält die Lage bewusst ruhig, solange kein belastbarer Handlungsdruck entsteht.</p>
      </section>
    `;
  }
  return `
    <section class="quick-panel">
      <span>Außerdem</span>
      ${quickItems.map((item, index) => `
        <button class="quick-row ${escapeAttribute(item.priorityType || "watch")}" type="button" data-detail="${escapeAttribute(item.id)}">
          <b>${String(index + 1).padStart(2, "0")}</b>
          <span>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.priorityLabel || "Relevant")} · ${escapeHtml(item.estimatedTime || "10 Min.")}</small>
          </span>
        </button>
      `).join("")}
    </section>
  `;
}

function referentFocusSentence() {
  const mode = briefing.dayMode;
  if (mode?.focus) return `${mode.phase}: ${mode.focus}.`;
  return decisionCountSentence();
}

function renderReferentHome() {
  const sections = hasHomeSectionContent(briefing.homeSections) ? briefing.homeSections : buildFallbackHomeSections();
  return `
    ${renderPrioritySection("Deine wichtigsten Aufgaben", sections.topTasks, renderHomeTask)}
    ${renderPrioritySection("Neu seit deinem letzten Besuch", sections.changedSinceLastVisit, renderChangeItem)}
    ${renderPrioritySection("Braucht deine Aufmerksamkeit?", sections.needsAttention, renderAttentionItem)}
    ${renderPrioritySection("Politische Chancen", sections.opportunities, renderOpportunityItem)}
    ${renderPrioritySection("Politische Risiken", sections.risks, renderRiskItem)}
  `;
}

function renderDecisionConsole() {
  const top = decisions[0];
  if (!top) {
    const watchItems = competentNoActionItems();
    return `
      <section class="decision-console empty">
        <div class="decision-ribbon">
          <span>Chef-Empfehlung</span>
          <b>Kein Handlungsdruck</b>
        </div>
        <h2>Heute keine Reaktion nötig.</h2>
        <p>${escapeHtml(noDecisionLead(watchItems))}</p>
        ${watchItems.length ? `
          <div class="calm-watchlist">
            <span>Ich beobachte für dich</span>
            ${watchItems.map((item) => `
              <a href="${escapeAttribute(sourceHref(item))}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(item.title || "Politische Entwicklung")}
              </a>
            `).join("")}
          </div>
        ` : ""}
        <button class="secondary-button" type="button" data-run-crawl>Quellen erneut prüfen</button>
      </section>
    `;
  }
  return `
    <section class="decision-console ${escapeAttribute(top.priorityType || "action")}">
      <div class="decision-ribbon">
        <span>Wichtigste politische Entscheidung</span>
        <b>${escapeHtml(top.priorityLabel || top.decision || "Relevant")}</b>
      </div>
      <h2>${escapeHtml(top.title)}</h2>
      <div class="decision-brief">
        <div>
          <span>Warum wichtig für dich</span>
          <p>${escapeHtml(decisionWhyImportant(top))}</p>
        </div>
        <div>
          <span>Empfohlene Handlung</span>
          <p>${escapeHtml(chiefRecommendationText(top))}</p>
        </div>
        <div>
          <span>Risiko bei Untätigkeit</span>
          <p>${escapeHtml(decisionRisk(top))}</p>
        </div>
      </div>
      <div class="decision-meta">
        <span>${escapeHtml(top.estimatedTime || "10 Min.")}</span>
      </div>
      <div class="decision-actions">
        <button class="primary-button" type="button" data-detail="${escapeHtml(top.id)}">Empfehlung öffnen</button>
      </div>
    </section>
  `;
}

function renderDailyFlow() {
  const flow = dailyFlowItems();
  if (!flow.length) return "";
  return `
    <section class="daily-flow" aria-label="Tagesverlauf">
      <div class="flow-head">
        <span>Danach</span>
        <h2>Nur was deine Aufmerksamkeit verdient</h2>
      </div>
      <div class="flow-list">
        ${flow.map(renderFlowRow).join("")}
      </div>
    </section>
  `;
}

function dailyFlowItems() {
  const sections = hasHomeSectionContent(briefing.homeSections) ? briefing.homeSections : buildFallbackHomeSections();
  const rows = [];
  const top = decisions[0] || normalizeHomeItem((sections.topTasks || [])[0]);
  const changed = normalizeHomeItem((sections.changedSinceLastVisit || []).find((item) => normalizeHomeItem(item)?.id !== top?.id));
  const attention = normalizeHomeItem((sections.needsAttention || []).find((item) => normalizeHomeItem(item)?.id !== top?.id && normalizeHomeItem(item)?.id !== changed?.id));
  const chance = normalizeHomeItem((sections.opportunities || []).find((item) => normalizeHomeItem(item)?.id !== top?.id));
  const risk = normalizeHomeItem((sections.risks || []).find((item) => normalizeHomeItem(item)?.id !== top?.id));
  if (top) rows.push({ label: "Jetzt", tone: top.priorityType || "action", item: top, text: polishReferentText(top.action || top.summary), cta: "Öffnen" });
  if (changed) rows.push({ label: "Neu", tone: "change", item: changed, text: changed.changeReason || changed.summary, cta: "Einordnung" });
  if (attention) rows.push({ label: "Im Blick", tone: attention.priorityType || "watch", item: attention, text: polishReferentText(attention.action || attention.summary), cta: "Details" });
  if (chance) rows.push({ label: "Chance", tone: "chance", item: chance, text: chance.opportunity || chance.summary, cta: "Antwort" });
  if (risk) rows.push({ label: "Risiko", tone: "risk", item: risk, text: risk.inaction || risk.summary, cta: "Vorbereiten" });
  return rows.slice(0, 4);
}

function renderFlowRow(row) {
  const actionAttribute = row.label === "Chance" ? "data-communication" : "data-detail";
  return `
    <article class="flow-row ${escapeAttribute(row.tone)}">
      <div class="flow-marker" aria-hidden="true"></div>
      <div class="flow-copy">
        <span>${escapeHtml(row.label)}</span>
        <h3>${escapeHtml(row.item.title)}</h3>
        <p>${escapeHtml(row.text || "Keine weitere Aktion nötig.")}</p>
      </div>
      <button class="text-button flow-action" type="button" ${actionAttribute}="${escapeHtml(row.item.id)}">${escapeHtml(row.cta)}</button>
    </article>
  `;
}

function hasHomeSectionContent(sections) {
  if (!sections) return false;
  return ["topTasks", "changedSinceLastVisit", "needsAttention", "opportunities", "risks"].some((key) => Array.isArray(sections[key]) && sections[key].length);
}

function buildFallbackHomeSections() {
  return {
    topTasks: decisions.slice(0, 3),
    changedSinceLastVisit: decisions.filter((decision) => decision.statusChange && decision.statusChange !== "Unverändert").slice(0, 3),
    needsAttention: decisions.slice(0, 3),
    opportunities: decisions.filter((decision) => decision.priorityType === "chance").slice(0, 3),
    risks: decisions.filter((decision) => decision.priorityType === "risk").slice(0, 3)
  };
}

function renderPrioritySection(title, items, renderer) {
  const normalized = (items || []).map(normalizeHomeItem).filter(Boolean).slice(0, 3);
  if (!normalized.length) return "";
  return `
    <section class="referent-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="referent-list">
        ${normalized.map(renderer).join("")}
      </div>
    </section>
  `;
}

function normalizeHomeItem(item) {
  if (!item) return null;
  if (item.relevance_score || item.recommended_action) return {
    id: item.id,
    signalId: item.signal_id || item.signalId,
    title: item.title,
    priorityLabel: displayPriority(item.current_priority || item.priority),
    priorityType: item.risiko_fuer_nutzer > item.chance_fuer_nutzer ? "risk" : item.chance_fuer_nutzer >= 55 ? "chance" : "action",
    summary: item.summary,
    action: polishReferentText(item.recommended_action),
    whyItMatters: item.personal_relevance_explanation,
    inaction: polishReferentText(item.consequence_if_ignored),
    opportunity: item.possible_upside,
    estimatedTime: `${item.estimated_effort_minutes || 5} Min.`,
    deadline: item.deadline,
    statusChange: item.status_change,
    changeReason: item.change_reason,
    relevanceScore: item.relevance_score,
    taskTemplate: item.taskTemplate
  };
  return item;
}

function displayPriority(priority) {
  const value = String(priority || "Relevant");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderHomeTask(item) {
  return `
    <article class="referent-card ${item.priorityType || "action"}">
      <span>${escapeHtml(item.priorityLabel || "Wichtig")}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p><strong>Warum:</strong> ${escapeHtml(item.whyItMatters || item.personalRelevanceExplanation || item.summary)}</p>
      <p><strong>Aktion:</strong> ${escapeHtml(item.action || "Linie vorbereiten.")}</p>
      <small>${escapeHtml(item.deadline ? `Frist ${formatDueDate(item.deadline)} · ` : "")}${escapeHtml(item.estimatedTime || "10 Min.")}</small>
      <button class="primary-button compact-button" type="button" data-detail="${escapeHtml(item.id)}">Entscheidung öffnen</button>
    </article>
  `;
}

function renderChangeItem(item) {
  return `
    <article class="referent-card change">
      <span>${escapeHtml(item.statusChange || "Neu")}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.changeReason || "Neu in deiner politischen Lage.")}</p>
      <button class="secondary-button compact-button" type="button" data-detail="${escapeHtml(item.id)}">Einordnung lesen</button>
    </article>
  `;
}

function renderAttentionItem(item) {
  return `
    <article class="referent-card ${item.priorityType || "action"}">
      <span>${escapeHtml(item.priorityLabel || "Wichtig")}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.action || item.summary)}</p>
      <button class="secondary-button compact-button" type="button" data-detail="${escapeHtml(item.id)}">Öffnen</button>
    </article>
  `;
}

function renderOpportunityItem(item) {
  return `
    <article class="referent-card chance">
      <span>Chance</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.opportunity || item.possibleUpside || item.summary)}</p>
      <button class="secondary-button compact-button" type="button" data-communication="${escapeHtml(item.id)}">Antwort vorbereiten</button>
    </article>
  `;
}

function renderRiskItem(item) {
  return `
    <article class="referent-card risk">
      <span>Risiko</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.inaction || item.consequenceIfIgnored || item.risk || item.summary)}</p>
      <button class="secondary-button compact-button" type="button" data-detail="${escapeHtml(item.id)}">Vorbereitung lesen</button>
    </article>
  `;
}

function renderAgentBriefing() {
  const text = agentBriefingText();
  return `
    <section class="agent-briefing" aria-label="Lage von Helmut">
      <div class="agent-orb" aria-hidden="true"><span>H</span></div>
      <div class="agent-copy">
        <span>Lage von Helmut</span>
        <p>${escapeHtml(text)}</p>
        <div class="agent-facts">
          ${agentFacts().map((fact) => `<b>${escapeHtml(fact)}</b>`).join("")}
        </div>
      </div>
      <div class="agent-actions">
        <button class="primary-button" type="button" data-detail="${escapeHtml(decisions[0]?.id || "")}">Entscheidung öffnen</button>
      </div>
    </section>
  `;
}

function agentBriefingText() {
  const firstName = (profile?.fullName || "").split(" ")[0];
  const greeting = timeGreeting(firstName);
  const top = decisions[0];
  const mentionCount = freshMentionCount();
  const riskCount = decisions.filter((decision) => decision.priorityType === "risk").length;
  const officeCount = openOfficeTaskCount();
  if (!top) return `${greeting} Ich habe die Lage geprüft. Für dich liegt heute noch keine klare politische Entscheidung vor.`;
  const mentionSentence = mentionCount
    ? `Du wurdest seit dem letzten Quellenlauf ${mentionCount} Mal erwähnt.`
    : "Heute wurde bislang keine neue namentliche Erwähnung gefunden.";
  const riskSentence = riskCount ? `${riskCount} Risiko solltest du im Blick behalten.` : "Aktuell sehe ich kein neues persönliches Risiko.";
  return `${greeting} Ich habe die politische Lage geprüft. Wichtigstes Thema für dich ist heute ${top.title}. ${mentionSentence} ${riskSentence} ${officeCount ? `${officeCount} Entwurf${officeCount !== 1 ? "e" : ""} liegen im Büro bereit.` : "Im Büro gibt es noch keine Entwürfe für heute."}`;
}

function agentFacts() {
  const sourceStats = briefing.sourceStats || {};
  const checked = Number(sourceStats.checkedSources || 0);
  const successful = Number(sourceStats.successfulSources || 0);
  return [
    `${decisions.length} Entscheidungen`,
    `${freshMentionCount()} neue Erwähnungen`,
    `${openOfficeTaskCount()} Büro-Entwürfe`,
    checked || successful ? `${successful}/${checked || successful} Quellen` : "Quellen vorbereitet"
  ];
}

function renderChiefRecommendation() {
  const decision = decisions[0];
  if (!decision) return "";
  const taskId = taskIdForDecision(decision);
  return `
    <section class="chief-card ${decision.priorityType}" aria-label="Chef-Empfehlung">
      <span>Chef-Empfehlung</span>
      <h2>Deine wichtigste Entscheidung heute: ${escapeHtml(decision.title)}</h2>
      <p>${escapeHtml(chiefRecommendationText(decision))}</p>
      <div class="chief-meta">
        <span>${escapeHtml(decision.estimatedTime || "10 Min.")}</span>
        <span>${escapeHtml(sourceLine(decision))}</span>
      </div>
      <div class="chief-actions">
        <button class="primary-button" type="button" data-detail="${escapeHtml(decision.id)}">Linie lesen</button>
        <button class="secondary-button" type="button" data-communication="${escapeHtml(decision.id)}">Statement erstellen</button>
        ${taskId ? `<button class="secondary-button" type="button" data-task-copy="${escapeHtml(taskId)}">Teilen</button>` : ""}
      </div>
    </section>
  `;
}

function renderSituationalBriefing() {
  const items = (briefing.situationalBriefing || []).filter(hasPreciseSource).slice(0, 2);
  return `
    <section class="situational-card" aria-label="Politische Lage">
      <span>Lage ohne Handlungsdruck</span>
      <h2>${items.length ? "Ich halte diese Punkte im Blick." : "Heute keine belastbare Entscheidungslage."}</h2>
      <p>${items.length ? "Du musst daraus gerade keine öffentliche Position machen. Es reicht, wenn du die Entwicklung kennst und Helmut sie weiter beobachtet." : escapeHtml(briefing.fallbackReason || "Die Quellen wurden geprüft. Es gibt aktuell nichts, worauf du politisch reagieren musst.")}</p>
      ${items.length ? `
        <div class="situational-list">
          ${items.map(renderSituationalItem).join("")}
        </div>
      ` : `
        <button class="secondary-button" type="button" data-run-crawl>Quellen erneut prüfen</button>
      `}
    </section>
  `;
}

function competentNoActionItems() {
  const situational = (briefing.situationalBriefing || []).filter(hasPreciseSource);
  const mentions = profileMentions().filter(hasPreciseSource);
  const raw = (briefing.rawItems || []).filter(hasPreciseSource);
  return [...situational, ...mentions, ...raw]
    .filter(uniqueMentionItem)
    .sort(sortNewestFirst)
    .slice(0, 3);
}

function noDecisionLead(items) {
  const phase = helmutDayPhase().key;
  if (briefing.fallbackReason && /bereits|früheren Lage|nicht erneut/i.test(briefing.fallbackReason)) {
    return "Ich habe neue Quellen geprüft. Einige relevante Artikel kennst du bereits aus einer früheren Lage; ich hebe sie deshalb bewusst nicht erneut als Entscheidung hoch.";
  }
  if (!items.length) {
    if (phase === "morning") return "Ich habe Regierung, Fraktion, Ausschuss und Personenlage geprüft. Heute Morgen liegt keine belastbare Lage vor, auf die du öffentlich reagieren solltest.";
    if (phase === "midday") return "Seit dem Morgen ist keine Entwicklung stark genug geworden, um deine Priorität zu verändern. Du musst jetzt nichts senden.";
    if (phase === "afternoon") return "Der Nachmittag bleibt ruhig. Halte dich sprechfähig, aber erzeuge keine Kommunikation ohne politischen Anlass.";
    if (phase === "evening") return "Für heute ist nichts mehr zu eskalieren. Ich halte Regierungsvorhaben, Fraktionslinie und Ausschusslage für morgen im Blick.";
    return "Die Lage ist stabil. Ich prüfe weiter, ob sich für morgen ein neuer Handlungsbedarf ergibt.";
  }
  const names = items.map((item) => item.title || item.sourceName || "eine Entwicklung").slice(0, 3);
  if (phase === "morning") return `Ich habe die Quellen geprüft. Du musst heute Morgen nichts veröffentlichen; ich beobachte für dich ${humanList(names)} weiter.`;
  if (phase === "midday") return `Seit dem Morgen beobachte ich weiter ${humanList(names)}. Noch entsteht daraus kein neuer Reaktionsdruck.`;
  if (phase === "afternoon") return `Für den Nachmittag gilt: ${humanList(names)} im Blick behalten, aber keine öffentliche Reaktion ohne neue Dynamik.`;
  if (phase === "evening") return `Für morgen vormerken: ${humanList(names)}. Heute musst du dazu nichts mehr senden.`;
  return `Ich beobachte für dich ${humanList(names)} weiter und melde nur, wenn sich daraus eine neue Priorität ergibt.`;
}

function noDecisionDirective() {
  const phase = helmutDayPhase().key;
  const government = governmentPlanItems()[0];
  const meeting = nextPreparedMeeting();
  if (government && meeting) return `Für dich als Opposition bleibt vor allem wichtig: ${government.title}. Ich verbinde das mit ${meeting.terminTitel} und prüfe, ob daraus eine Frage an die Bundesregierung oder eine Linie für Arbeit und Soziales entsteht.`;
  if (government) return `Für dich als Opposition bleibt vor allem wichtig: ${government.title}. ${phase === "evening" || phase === "late" ? "Für morgen prüfe ich" : "Ich prüfe"}, ob daraus eine Frage an die Bundesregierung oder eine Linie für Arbeit und Soziales entsteht.`;
  const party = partyFactionItems()[0];
  if (party) return `Aus Fraktion und Partei ist aktuell anschlussfähig: ${party.title}. Noch keine Reaktion nötig, aber politisch im Blick behalten.`;
  if (meeting) return `Nächster Arbeitsfokus: ${meeting.terminTitel}. Ich halte dafür Gesprächspunkte, Regierungslage und mögliche Nachfragen bereit.`;
  return "Ich beobachte weiter Regierung, Fraktion, Partei und deinen Ausschuss. Wenn daraus Handlungsdruck entsteht, landet es oben.";
}

function humanList(values) {
  const clean = values.map((value) => String(value || "").trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] || "die Lage";
  if (clean.length === 2) return `${clean[0]} und ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} und ${clean.at(-1)}`;
}

function renderSituationalItem(item) {
  const href = sourceHref(item);
  if (!href) return "";
  return `
    <article class="situational-item">
      <div>
        <span>${escapeHtml(item.sourceName || "Quelle")}</span>
        <h3>${escapeHtml(item.title || "Politische Entwicklung")}</h3>
        <p>${escapeHtml(twoSentenceSummary(item.summary || item.excerpt || item.content || ""))}</p>
        <small>${escapeHtml(item.relevanceReason || "Relevante politische Lage.")} · ${escapeHtml(formatBriefingDate(item.publishedAt || item.retrievedAt))}</small>
      </div>
      <a class="source-pill" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">Artikel öffnen</a>
    </article>
  `;
}

function chiefRecommendationText(decision) {
  const action = polishReferentText(decision.action || decision.summary || "");
  if (decision.priorityType === "watch") {
    return `${action} Du musst nicht sofort groß veröffentlichen, aber du solltest heute sprechfähig sein.`;
  }
  return action;
}

function decisionWhyImportant(decision) {
  return twoSentenceSummary(decision.personalRelevanceExplanation || decision.whyItMatters || decision.summary || "Das Thema berührt dein Mandatsprofil und verdient heute deine Aufmerksamkeit.");
}

function decisionRisk(decision) {
  return twoSentenceSummary(decision.inaction || decision.consequenceIfIgnored || decision.risk || "Wenn du nicht reagierst, prägen andere Akteure die Debatte zuerst.");
}

function taskIdForDecision(decision) {
  const bySignal = tasks.find((task) => task.sourceSignalId && task.sourceSignalId === decision.signalId);
  if (bySignal) return bySignal.id;
  const byTemplate = tasks.find((task) => task.id === decision.taskTemplate?.id);
  return byTemplate?.id || decision.taskTemplate?.id || "";
}

function renderPilotStatus() {
  const sourceStats = briefing.sourceStats || {};
  const checked = Number(sourceStats.checkedSources || 0);
  const successful = Number(sourceStats.successfulSources || 0);
  const sourceText = checked || successful ? `${successful}/${checked || successful} Quellen geprüft` : "Quellenbasis vorbereitet";
  const updatedText = formatBriefingDate(briefing.generatedAt || briefing.date || new Date().toISOString());
  const statusLabel = displayStatusLabel();
  return `
    <div class="pilot-status ${previewMode ? "preview" : ""}" aria-label="Pilotstatus">
      ${escapeHtml(statusLabel)} · ${escapeHtml(sourceText)} · aktualisiert ${escapeHtml(updatedText)}
      ${previewMode ? `<span>Kontrollansicht · verändert Cem nichts</span>` : ""}
    </div>
  `;
}

function decisionCountSentence() {
  const count = decisions.length;
  if (count === 0) return "Heute liegt keine politische Entscheidung an.";
  if (count === 1) return "Heute ist eine politische Entscheidung relevant.";
  return `Heute sind ${count} politische Entscheidungen relevant.`;
}

function renderDecisionBlock(decision) {
  return `
    <article class="briefing-block ${decision.priorityType}">
      <div>
        <span>${escapeHtml(decision.priorityLabel)}</span>
        <h2>${escapeHtml(decision.title)}</h2>
        <p>${escapeHtml(decision.summary)}</p>
        ${sourceLink(decision)}
      </div>
      <button class="secondary-button" type="button" data-detail="${escapeHtml(decision.id)}">${decision.priorityType === "watch" ? "Details ansehen" : "Empfehlung lesen"}</button>
    </article>
  `;
}

function renderDetailView() {
  const decision = selectedDecision();
  const action = polishReferentText(decision.action);
  const feedbackState = decision.feedback || (decision.status === "ignored" ? "ignored" : decision.status === "snoozed" ? "snoozed" : decision.status === "relevant" ? "marked_relevant" : "");
  return `
    <article class="detail-page">
      <button class="back-link" type="button" data-view="briefing">Zurück zum Briefing</button>

      <header class="article-head">
        <span class="${decision.priorityType}">${escapeHtml(decision.priorityLabel)}</span>
        <h1 class="${headlineClass(decision.title)}">${escapeHtml(decision.title)}</h1>
        <p>${escapeHtml(decision.summary)}</p>
        <small>Aktualisiert: ${formatBriefingDate(briefing.generatedAt || new Date().toISOString())}</small>
        ${sourceLink(decision)}
      </header>

      <section class="recommendation">
        <span>Helmuts Empfehlung</span>
        <p>${escapeHtml(action)}</p>
      </section>
      ${renderMemorySection(decision)}

      <section class="article-grid">
        <div>
          <h2>Warum das wichtig ist</h2>
          <p>${escapeHtml(decision.whyItMatters)}</p>
        </div>
        <div>
          <h2>Wenn du nicht reagierst</h2>
          <p>${escapeHtml(decision.inaction)}</p>
        </div>
      </section>

      <section class="article-section">
        <h2>Was ich tun würde</h2>
        <p>${escapeHtml(action)}</p>
        <div class="detail-actions">
          <button class="primary-button" type="button" data-communication="${escapeHtml(decision.id)}">Text vorbereiten</button>
          ${decision.taskTemplate?.id ? `<button class="secondary-button" type="button" data-task-copy="${escapeHtml(decision.taskTemplate.id)}">Teilen</button>` : ""}
        </div>
        ${renderFeedbackActions(decision)}
      </section>
      ${renderSourceBasis(decision)}
      ${renderUserFeedbackWidget(decision)}
    </article>
  `;
}

// Echte Feedback-Erfassung: landet in der Admin-Inbox. Kein Fake, keine KI.
function renderUserFeedbackWidget(decision) {
  const topic = decision?.title || "";
  const buttons = [
    ["relevant", "Relevant"],
    ["nicht_relevant", "Nicht relevant"],
    ["falsch", "Falsch"],
    ["mehr_davon", "Mehr davon"],
    ["weniger_davon", "Weniger davon"],
    ["unklar", "Unklar"]
  ];
  return `
    <section class="article-section feedback-widget" data-feedback-widget>
      <h2>War diese Einschätzung hilfreich?</h2>
      <p class="feedback-widget-hint">Dein Feedback verbessert Helmuts Relevanz-Einschätzung.</p>
      <div class="feedback-widget-buttons">
        ${buttons.map(([type, label]) => `<button class="feedback-chip" type="button" data-feedback-type="${type}" data-feedback-area="Lage" data-feedback-topic="${escapeAttribute(topic)}">${escapeHtml(label)}</button>`).join("")}
      </div>
    </section>`;
}

function renderMemorySection(decision) {
  if (!decision.memory) return "";
  return `
    <section class="article-section memory-section">
      <span>Politisches Gedächtnis</span>
      <h2>${escapeHtml(decision.memory.label || "Bisherige Linie")}</h2>
      <p>${escapeHtml(decision.memory.summary || "Helmut baut zu diesem Thema eine Linie auf.")}</p>
      <p><strong>Nächster Schritt:</strong> ${escapeHtml(decision.memory.suggestedNextStep || "Büro mit kurzer Aktualisierung beauftragen.")}</p>
    </section>
  `;
}

const OFFICE_FORMAT_META = {
  presse: {
    formatLabel: "Pressemitteilung", typeLabel: "PRESSEMITTEILUNG", einordnung: "Offizielle Linie für Medien.",
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Linie geprüft. Sachlicher Ton empfohlen.",
    qualityTone: "Sachlich, klar, politisch anschlussfähig", qualityUsage: "Presse und Medien",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  linkedin: {
    formatLabel: "LinkedIn Beitrag", typeLabel: "LINKEDIN", einordnung: "Persönlich, kurz, anschlussfähig.",
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Linie geprüft. Persönliche Sprache erwünscht.",
    qualityTone: "Persönlich, direkt, nahbar", qualityUsage: "LinkedIn",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  x: {
    formatLabel: "X Beitrag", typeLabel: "X / TWITTER", einordnung: "Kurz, pointiert, öffentlich.",
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Linie geprüft. Kurz halten.",
    qualityTone: "Direkt, knapp, pointiert", qualityUsage: "X / Twitter",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  instagram: {
    formatLabel: "Instagram Beitrag", typeLabel: "INSTAGRAM", einordnung: "Kurz, klar, mobil lesbar.",
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Linie geprüft. Persönliche Sprache erwünscht.",
    qualityTone: "Menschlich, authentisch, kurz", qualityUsage: "Instagram",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  anfrage: {
    formatLabel: "Parlamentarische Anfrage", typeLabel: "PARLAMENTARISCHE ANFRAGE", einordnung: "Für Ausschuss und parlamentarische Kontrolle.",
    defaultStatus: "Zum Bereithalten", fromSource: "Aus Radar vorbereitet", lineCheck: "Linie geprüft. Formale Sprache erforderlich.",
    qualityTone: "Formal, sachlich, präzise", qualityUsage: "Parlamentarische Arbeit",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  rede: {
    formatLabel: "Redebaustein", typeLabel: "REDEBAUSTEIN", einordnung: "Für Termine, Interviews und kurze Statements.",
    defaultStatus: "Zum Bereithalten", fromSource: "Aus Radar vorbereitet", lineCheck: "Linie geprüft. Kernbotschaft klar halten.",
    qualityTone: "Klar, überzeugend, politisch", qualityUsage: "Termine und Interviews",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  buergerbrief: {
    formatLabel: "Bürgerbrief", typeLabel: "BÜRGERBRIEF", einordnung: "Verständliche Antwort für Bürgeranfragen.",
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Linie geprüft. Verständliche Sprache.",
    qualityTone: "Zugänglich, klar, persönlich", qualityUsage: "Bürgeranfragen",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  intern: {
    formatLabel: "Interne Linie", typeLabel: "INTERNE LINIE", einordnung: "Für Büro und Team.",
    defaultStatus: "Zum Bereithalten", fromSource: "Aus Radar vorbereitet", lineCheck: "Nur für internen Gebrauch.",
    qualityTone: "Sachlich, intern, klar", qualityUsage: "Interner Gebrauch",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
};

function draftReadingTime(text) {
  const words = String(text).trim().split(/\s+/).length;
  const min = Math.round(words / 200);
  return min < 1 ? "30 Sek. Lesezeit" : `${min} Min. Lesezeit`;
}

function draftSourceCount(decision) {
  const n = (decision.sources?.length || 0) + (decision.primarySource ? 1 : 0);
  return Math.max(n, briefing?.sourceStats?.successfulSources ? Math.min(Number(briefing.sourceStats.successfulSources), 8) : 3);
}

function officeBriefingTime() {
  const ts = briefing?.generatedAt || briefing?.date;
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} Uhr`;
}

function draftStatus(format) {
  return OFFICE_FORMAT_META[format.id]?.defaultStatus || "Zum Bereithalten";
}

function draftStatusClass(status) {
  if (status === "Entwurf bereit") return "buero-status--publish";
  if (status === "Bei Nachfrage verwenden") return "buero-status--nachfrage";
  if (status === "Noch nicht belastbar") return "buero-status--unsicher";
  return "buero-status--bereit";
}

function draftSource(format) {
  return OFFICE_FORMAT_META[format.id]?.fromSource || "Aus Lage empfohlen";
}

function draftTitle(decision) {
  let t = (decision.title || "Entwurf").trim();
  t = t.replace(/\s*[\|·•\-—–]\s*(die\s+)?(zeit|spiegel|faz|taz|welt|bild|sz|süddeutsche|ard|zdf|tagesschau|rnd|focus|stern|handelsblatt|tagesspiegel|br\b|ndr|mdr|phoenix)\b.*/i, "");
  const ci = t.indexOf(": ");
  if (ci > 12) t = t.slice(0, ci);
  if (t.length > 58) t = t.slice(0, 56).trimEnd() + "…";
  return t;
}

function renderOfficeView() {
  const formats = activeOfficeFormats();
  const topDecisions = (decisions || []).filter((d) => d.decision !== "Ignorieren" && d.title).slice(0, 2);
  const allCards = topDecisions.flatMap((d) => formats.map((f) => ({ decision: d, format: f })));
  const totalCount = allCards.length;
  const time = officeBriefingTime();
  const hasBriefing = topDecisions.length > 0;
  const generating = officeDraftsGenerating;

  const readyCount = allCards.filter(({ format }) => draftStatus(format) === "Entwurf bereit").length;
  const holdCount = totalCount - readyCount;

  const firstTwoFormats = formats.slice(0, 2).map((f) => OFFICE_FORMAT_META[f.id]?.formatLabel || f.label).filter(Boolean);
  const eyebrow = hasBriefing && totalCount
    ? `Heute vorbereitet: ${totalCount} Entwurf${totalCount !== 1 ? "e" : ""}. Prüfe zuerst ${firstTwoFormats.join(" und ")}.`
    : "Heute vorbereitet.";

  const summaryText = hasBriefing
    ? (readyCount ? `${readyCount} Entwurf${readyCount !== 1 ? "e" : ""} bereit` : "")
      + (holdCount ? `${readyCount ? `<span class="buero-summary-sep">·</span>` : ""}${holdCount} zum Bereithalten` : "")
      + (time ? `<span class="buero-summary-sep">·</span>Vorbereitet um ${escapeHtml(time)}` : "")
    : generating
      ? "Entwürfe werden vorbereitet&hellip;"
      : "Erscheinen automatisch wenn dein Briefing geladen ist.";

  const readyFormats = formats.filter((f) => draftStatus(f) === "Entwurf bereit");
  const holdFormats = formats.filter((f) => draftStatus(f) !== "Entwurf bereit");
  const priorityHint = hasBriefing && readyFormats.length ? `
    <div class="buero-priority-hint">
      ${readyFormats.slice(0, 1).map((f) => `<span class="buero-priority-label">Zuerst prüfen:</span><span class="buero-priority-value">${escapeHtml(OFFICE_FORMAT_META[f.id]?.formatLabel || f.label)}</span>`).join("")}
      ${readyFormats.slice(1, 2).map((f) => `<span class="buero-priority-sep">·</span><span class="buero-priority-label">Danach:</span><span class="buero-priority-value">${escapeHtml(OFFICE_FORMAT_META[f.id]?.formatLabel || f.label)}</span>`).join("")}
      ${holdFormats.length ? `<span class="buero-priority-sep">·</span><span class="buero-priority-optional">Optional: ${escapeHtml(holdFormats.map((f) => OFFICE_FORMAT_META[f.id]?.formatLabel || f.label).join(", "))}</span>` : ""}
    </div>
  ` : "";

  return `
    <div class="buero-view">
      <header class="buero-header">
        <h1 class="buero-title">Büro</h1>
        <p class="buero-eyebrow">${escapeHtml(eyebrow)}</p>
        <p class="buero-summary">${summaryText}</p>
      </header>
      ${priorityHint}
      <div class="buero-draft-list">
        ${topDecisions.map((decision, di) => `
          <div class="buero-group">
            <h2 class="buero-group-title">
              <span class="buero-group-eyebrow">Anlass</span>
              ${escapeHtml(draftTitle(decision))}
            </h2>
            ${formats.map((format, fi) => renderOfficeDraftCard(decision, format, di * formats.length + fi)).join("")}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderOfficeDraftCard(decision, format, index = 0) {
  const key = officeDraftKey(decision, format);
  const aiText = officeDrafts[key];
  const isLoading = officeDraftsGenerating && !aiText;
  const meta = OFFICE_FORMAT_META[format.id] || { typeLabel: format.label.toUpperCase(), einordnung: "", defaultStatus: "Zum Bereithalten", lineCheck: "", iconBg: "#F0F0F0", iconColor: "#555" };
  // Kein erfundener Muster-Entwurf mehr: entweder gültiger (KI-/regelbasierter)
  // Text oder ein aus DIESER Entscheidung abgeleiteter Vorschlag. Fehlt beides,
  // liefert channelFallbackStatement die klare Meldung "kein belastbarer
  // Kommunikationsvorschlag vor" (siehe isValidDraft/renderOfficeDraftCard).
  const text = (isValidDraft(aiText) ? aiText : null) || channelFallbackStatement(decision, format.channel || "press");
  const readTime = draftReadingTime(text);
  const status = draftStatus(format);
  const statusClass = draftStatusClass(status);
  const source = draftSource(format);
  const title = draftTitle(decision);
  const delay = `${index * 60}ms`;

  const formatLabel = meta.formatLabel || title;

  return `
    <article class="buero-draft-card${isLoading ? " is-loading" : ""}" style="animation-delay:${delay}"
      data-office-open="${escapeAttribute(key)}"
      data-office-decision="${escapeAttribute(JSON.stringify({ id: decision.id, signalId: decision.signalId, title: decision.title }))}"
      data-office-format="${escapeAttribute(format.id)}"
      role="button" tabindex="0" aria-label="${escapeAttribute(meta.typeLabel + ": " + title)}">
      <div class="buero-card-top">
        <span class="buero-card-type">${escapeHtml(meta.typeLabel)}</span>
        <span class="buero-status-pill ${statusClass}">${escapeHtml(status)}</span>
      </div>
      <div class="buero-card-main">
        <div class="buero-card-body">
          <h2 class="buero-card-title">${escapeHtml(formatLabel)}</h2>
          <p class="buero-card-einordnung">${escapeHtml(meta.einordnung)}</p>
          <p class="buero-card-anlass">Anlass: ${escapeHtml(title)}</p>
        </div>
        <i class="ti ti-chevron-right buero-card-chev" aria-hidden="true"></i>
      </div>
      <div class="buero-card-footer">
        <span class="buero-card-meta-row">
          <span>${escapeHtml(source)}</span>
          <span class="buero-meta-sep">·</span>
          <span>${escapeHtml(readTime)}</span>
        </span>
        <button class="buero-review-btn" type="button" ${isLoading ? "disabled" : ""}>
          Entwurf prüfen
        </button>
      </div>
    </article>
  `;
}

function renderOfficeDraftDetail() {
  if (!selectedOfficeDraft) { currentView = "office"; return renderOfficeView(); }
  const { decision, format, text } = selectedOfficeDraft;
  const meta = OFFICE_FORMAT_META[format.id] || { formatLabel: format.label, typeLabel: format.label.toUpperCase(), einordnung: "", defaultStatus: "Zum Bereithalten", lineCheck: "", qualityTone: "Sachlich, klar, politisch anschlussfähig", qualityUsage: "Presse und Medien", iconBg: "#F0F0F0", iconColor: "#555" };
  const time = officeBriefingTime();
  const sources = draftSourceCount(decision);
  const status = draftStatus(format);
  const statusClass = draftStatusClass(status);
  const paragraphs = String(text).split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);
  const lageDateStr = (() => {
    const ts = briefing?.generatedAt || briefing?.date;
    if (!ts) return "heute";
    return new Date(ts).toLocaleDateString("de-DE", { day: "numeric", month: "long" });
  })();

  return `
    <div class="buero-detail-view">
      <nav class="buero-detail-nav">
        <button class="buero-back-btn" type="button" data-office-back>
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Büro
        </button>
      </nav>
      <header class="buero-detail-header">
        <div class="buero-detail-type-row">
          <span class="buero-card-type">${escapeHtml(meta.typeLabel)}</span>
          <span class="buero-status-pill ${statusClass}">${escapeHtml(status)}</span>
        </div>
        <h1 class="buero-detail-title">${escapeHtml(meta.formatLabel || draftTitle(decision))}</h1>
        <p class="buero-detail-anlass">Anlass: ${escapeHtml(draftTitle(decision))}</p>
        <p class="buero-detail-meta">
          ${time ? `Erstellt heute um ${escapeHtml(time)}` : "Heute erstellt"}
          &nbsp;·&nbsp; Basiert auf ${sources} Quellen
        </p>
        ${meta.lineCheck ? `<p class="buero-detail-linecheck">${escapeHtml(meta.lineCheck)}</p>` : ""}
      </header>
      <div class="buero-detail-body">
        ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>
      <div class="buero-quality-check">
        <div class="buero-quality-row">
          <span class="buero-quality-label">Ton</span>
          <span class="buero-quality-value">${escapeHtml(meta.qualityTone || "Sachlich, klar, politisch anschlussfähig")}</span>
        </div>
        <div class="buero-quality-row">
          <span class="buero-quality-label">Nutzung</span>
          <span class="buero-quality-value">${escapeHtml(meta.qualityUsage || "Presse und Medien")}</span>
        </div>
        <div class="buero-quality-row">
          <span class="buero-quality-label">Risiko</span>
          <span class="buero-quality-value">Keine unbelegte Behauptung veröffentlichen</span>
        </div>
        <div class="buero-quality-row">
          <span class="buero-quality-label">Basis</span>
          <span class="buero-quality-value">Lage vom ${escapeHtml(lageDateStr)}</span>
        </div>
      </div>
      <footer class="buero-detail-footer">
        <button class="buero-copy-btn buero-copy-btn--full" type="button"
          data-office-copy-inline="detail"
          data-office-text="${escapeAttribute(text)}">
          <i class="ti ti-copy" aria-hidden="true"></i> Kopieren
        </button>
      </footer>
    </div>
  `;
}

function renderTaskHandoffPanel() {
  const task = selectedTaskHandoffId ? tasks.find((entry) => entry.id === selectedTaskHandoffId) : null;
  if (!task) return "";
  const source = taskArticleSource(task);
  const preferredMethod = preferredOfficeHandoffMethod();
  const orderedMethods = orderedOfficeHandoffMethods(preferredMethod);
  return `
    <div class="handoff-layer open" data-handoff-layer>
      <aside class="handoff-panel" aria-label="Büro-Übergabe wählen">
        <div class="handoff-head">
          <div>
            <span>Büro-Übergabe</span>
            <h2>${escapeHtml(shortTaskTitle(task))}</h2>
          </div>
          <button type="button" data-close-handoff aria-label="Übergabe schließen">×</button>
        </div>
        <p>${escapeHtml(compactText(taskShareText(task), 220))}</p>
        <small class="handoff-default">Standard: ${escapeHtml(officeHandoffMethodLabel(preferredMethod))}</small>
        ${source ? `<a class="source-pill" href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer">Quelle prüfen</a>` : ""}
        <div class="handoff-actions">
          ${orderedMethods.map(([method, label], index) => renderOfficeHandoffButton(task, method, label, index === 0)).join("")}
          <button class="secondary-button" type="button" data-task-copy-text="${escapeHtml(task.id)}">Nur kopieren</button>
        </div>
      </aside>
    </div>
  `;
}

function renderOfficeHandoffButton(task, method, label, primary) {
  const buttonClass = primary ? "primary-button" : "secondary-button";
  const prefix = primary ? "Standard: " : "";
  if (method === "email") {
    return `<a class="${buttonClass}" href="${escapeAttribute(taskMailtoHref(task))}" data-task-mail="${escapeHtml(task.id)}">${escapeHtml(prefix + label)}</a>`;
  }
  return `<button class="${buttonClass}" type="button" data-task-share-method="${escapeHtml(method)}" data-task-share="${escapeHtml(task.id)}">${escapeHtml(prefix + label)}</button>`;
}

function orderedOfficeHandoffMethods(preferredMethod) {
  const preferred = officeHandoffMethods.find(([method]) => method === preferredMethod) || officeHandoffMethods[0];
  return [preferred, ...officeHandoffMethods.filter(([method]) => method !== preferred[0])];
}

function officeTaskRequest(task) {
  const questions = taskBriefQuestions(task).slice(0, 2);
  const assignee = task.assignee || recommendedTaskAssignee(task);
  if (questions.length) return `${assignee}: Bitte bis ${formatDueDate(task.dueDate)} kurz einordnen. Kläre: ${questions.join(" ")} Ergebnis bitte als Ja/Nein-Empfehlung: reagieren, nur vorbereiten oder liegen lassen.`;
  return shortTaskDescription(task);
}

function recommendedTaskAssignee(task) {
  const text = `${task.title || ""} ${task.description || ""}`.toLowerCase();
  if (text.includes("presse") || text.includes("statement") || text.includes("linie")) return "Pressesprecher";
  if (text.includes("ausschuss") || text.includes("gesetz") || text.includes("reform")) return "Wissenschaftlicher Mitarbeiter";
  return "Büroleitung";
}

function isActionableOfficeTask(task) {
  if (!task || task.status === "done") return false;
  const text = `${task.title || ""} ${task.description || ""} ${task.riskIfIgnored || ""}`.toLowerCase();
  return !(
    text.includes("ignoriere das thema") ||
    text.includes("keine aktion") ||
    text.includes("kein schaden") ||
    text.includes("keine öffentliche kommunikation") ||
    text.includes("keine oeffentliche kommunikation")
  );
}

function shortTaskDescription(task) {
  const text = task.description || "Bitte diese Empfehlung für Cem vorbereiten.";
  return twoSentenceSummary(text);
}

function shortTaskTitle(task) {
  const text = `${task.title || ""} ${task.description || ""}`.toLowerCase();
  if (text.includes("arbeitszeitgesetz") || text.includes("acht-stunden")) return "Linie zum Arbeitszeitgesetz vorbereiten";
  if (text.includes("tariftreue") || text.includes("tarifbindung")) return "Tariftreue-Linie vorbereiten";
  if (text.includes("bürgergeld")) return "Bürgergeld-Linie vorbereiten";
  if (text.includes("mindestlohn")) return "Mindestlohn-Statement vorbereiten";
  if (text.includes("rente")) return "Rentenlinie vorbereiten";
  return String(task.title || "Büroauftrag vorbereiten").replace(/\s+vorbereiten$/i, "").slice(0, 72);
}

function taskPriorityLabel(priority) {
  return ({ high: "Heute", medium: "Vorbereiten", low: "Optional" })[priority] || "Vorbereiten";
}

function renderTopicsView() {
  const topicItems = topicArchiveItems();
  return `
    <section class="page-intro compact topics-intro">
      <h1 class="${headlineClass("Belege.")}">Belege.</h1>
      <p>Die Quellenbasis hinter der Empfehlung. Hier prüfst du, woher Helmut seine Lage nimmt.</p>
    </section>

    <section class="topic-board" aria-label="Themen">
      ${topicItems.map((topic, index) => `
        <article class="topic-row evidence-only">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>${escapeHtml(topic.title)}</h3>
            <p>${escapeHtml(topic.summary)}</p>
            <small>${escapeHtml(topic.meta)}</small>
            ${renderTopicSourceLinks(topic)}
          </div>
        </article>
      `).join("") || `<p class="empty-state">Keine kuratierten Themen in der aktuellen Lage.</p>`}
    </section>
  `;
}

function topicArchiveItems() {
  const rawItems = briefing.rawItems || [];
  const rawById = new Map(rawItems.map((item) => [item.id, item]));
  const decisionBySignal = new Map((briefing.items || []).map((item) => [item.signalId, toDecision(item)]));
  const topics = briefing.topics || [];

  if (topics.length) {
    return topics.slice(0, 8).map((topic) => {
      const raw = rawById.get(topic.rawItemIds?.[0]);
      const decision = decisionBySignal.get(`signal-${topic.rawItemIds?.[0]}`) || decisions.find((item) => item.title === topic.title);
      const source = raw || decision?.primarySource || decision;
      const sources = topic.rawItemIds?.map((id) => rawById.get(id)).filter(Boolean) || decision?.sources || [];
      const href = sourceHref(source);
      return {
        title: topic.title,
        summary: twoSentenceSummary(topic.summary || raw?.content || decision?.summary || ""),
        meta: `${topic.sourceCount || 1} Quelle${(topic.sourceCount || 1) === 1 ? "" : "n"} · Sicherheit ${confidenceLabel(topic.confidence)}`,
        priorityType: decision?.priorityType || (topic.confidence === "high" ? "watch" : "ignore"),
        decisionId: decision?.id || "",
        href,
        source,
        sources
      };
    });
  }

  return (briefing.items || []).slice(0, 5).map((item) => {
    const decision = toDecision(item);
    return {
      title: decision.title,
      summary: decision.summary,
      meta: `${decision.sourceCount || 1} Quelle${(decision.sourceCount || 1) === 1 ? "" : "n"} · Sicherheit ${confidenceLabel(decision.confidence)}`,
      priorityType: decision.priorityType,
      decisionId: decision.id,
      href: sourceHref(decision.primarySource || decision),
      source: decision.primarySource || decision,
      sources: decision.sources || []
    };
  });
}

function renderTopicSourceLinks(topic) {
  const sources = uniqueSources(topic.sources?.length ? topic.sources : [topic.source].filter(Boolean))
    .filter((source) => Boolean(sourceHref(source)));
  if (!sources.length) return "";
  if (sources.length === 1) return sourceLink(sources[0]);
  return `
    <div class="source-link-list" aria-label="Quellen">
      ${sources.map((source) => {
        const href = sourceHref(source);
        const label = `${source.sourceName || "Quelle"} · ${sourceLinkLabel(source)}`;
        return `<a class="source-pill" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
      }).join("")}
    </div>
  `;
}

function uniqueSources(sources) {
  const byHref = new Map();
  sources.filter(Boolean).forEach((source) => {
    const key = sourceHref(source) || source.sourceName || source.id || "";
    if (key && !byHref.has(key)) byHref.set(key, source);
  });
  return Array.from(byHref.values());
}

function renderCommunicationView() {
  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Kommunikation.")}">Kommunikation.</h1>
      <p>Formuliere aus einer politischen Linie einen verwendbaren Text.</p>
    </section>
    ${renderCommunicationSection()}
  `;
}

function renderCommunicationSection() {
  const decision = selectedDecision();
  const channelLabel = communicationChannelLabel(selectedCommunicationChannel);
  return `
    <section class="plain-list communication-intro">
      <h2>Kommunikation</h2>
      <p class="section-note">${escapeHtml(decision.title)}</p>
      <div class="strategy-answer ${escapeAttribute(selectedCommunicationChannel)}" aria-live="polite">
        <div class="channel-picker draft-channel-picker" role="group" aria-label="Kommunikationskanal">
          ${communicationChannels.map(([id, label]) => `
            <button class="${id === selectedCommunicationChannel ? "active" : ""}" type="button" data-channel="${escapeHtml(id)}">${escapeHtml(label)}</button>
          `).join("")}
        </div>
        <div class="draft-meta">
          <span>Generierter Entwurf</span>
          <b>${escapeHtml(communicationContextTitle || decision.title)} · ${escapeHtml(channelLabel)} · ${escapeHtml(communicationChannelHint(selectedCommunicationChannel))}</b>
        </div>
        <div class="generated-copy" data-copy-source="generated-statement">
          ${renderGeneratedCommunicationText(generatedStatement || decision.statement)}
        </div>
        ${renderCommunicationVariants(decision)}
        <div class="draft-actions">
          <button class="primary-button" type="button" data-copy="generated-statement">Text kopieren</button>
          <button class="secondary-button" type="button" data-generate>Neu schreiben</button>
        </div>
      </div>
    </section>
  `;
}

function renderGeneratedCommunicationText(text) {
  const paragraphs = String(text || "")
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    return "<p>Es liegt noch kein Textvorschlag vor.</p>";
  }
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

function renderCommunicationVariants(decision) {
  const variants = activeOfficeFormats().map((f) => [f.label, channelFallbackStatement(decision, f.channel)]);
  return `
    <div class="statement-variants" aria-label="Statement Varianten">
      ${variants.map(([label, text]) => `
        <button type="button" data-use-variant="${escapeAttribute(label)}" data-variant-text="${escapeAttribute(text)}">
          <span>${escapeHtml(label)}</span>
          <p>${escapeHtml(shortenStatement(text).slice(0, 150))}</p>
        </button>
      `).join("")}
    </div>
  `;
}

function renderNotesSection() {
  return `
    <section class="plain-list notes-section">
      <h2>Merken für später</h2>
      <form class="note-form" id="noteForm">
        <textarea name="text" rows="3" placeholder="Frage, Risiko, Verband, Termin oder Recherchepunkt festhalten."></textarea>
        <button class="secondary-button" type="submit">Merken</button>
      </form>
      <div class="note-list">
        ${notes.slice(0, 5).map((note) => `
          <article class="note-row">
            <p>${escapeHtml(note.text)}</p>
            <small>${escapeHtml(note.type || "Notiz")} · ${escapeHtml(formatBriefingDate(note.created_at || note.createdAt))}</small>
          </article>
        `).join("") || `<p class="empty-state">Noch keine Notizen.</p>`}
      </div>
    </section>
  `;
}

function renderRadarView() {
  if (features.v3Radar) return renderRadarV3View();
  const allMentions = profileMentions();
  const freshMentions = allMentions.filter(isFreshUpdate).slice(0, 4);
  const freshKeys = new Set(freshMentions.map(mentionKey));

  const storedArchiveArticles = radarArchive.length ? radarArchive : profileArticleArchive(allMentions);
  const archiveArticles = storedArchiveArticles
    .filter((item) => !freshKeys.has(mentionKey(item)))
    .filter(hasPreciseSource)
    .filter(uniqueMentionItem)
    .sort(sortNewestFirst)
    .slice(0, 60);

  const hasFresh = freshMentions.length > 0;

  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Radar.")}">Radar.</h1>
      <p>Radar erkennt Erwähnungen, frühe Risiken und Chancen, bevor sie zur Lage werden.</p>
    </section>

    ${renderRadarStatusCard(hasFresh)}

    <section class="radar-groups">
      ${renderRadarGroup("Heute neu über dich", freshMentions.length, mentionRows(freshMentions), hasFresh)}
      ${renderRadarGroup("Frühwarnungen", 0, renderRadarEarlyWarnings(), false)}
      ${renderRadarGroup("Chancen", 0, renderRadarChances(), false)}
      ${renderRadarGroup("Kritische Nachfrage möglich", 0, renderRadarCriticalQuery(), false)}
      ${renderRadarGroup("Archiv", archiveArticles.length, mentionRows(archiveArticles, { empty: false, compact: true }), false)}
    </section>
  `;
}

function renderRadarGroup(title, count, content, open = false) {
  const badge = count > 0 ? `<em class="radar-group-count">${count}</em>` : "";
  return `
    <details class="radar-group" ${open ? "open" : ""}>
      <summary>
        <span>${escapeHtml(title)}${badge}</span>
        <i></i>
      </summary>
      <div class="radar-group-body">
        ${content || `<p class="empty-state">Keine Einträge.</p>`}
      </div>
    </details>
  `;
}

function renderRadarStatusCard(hasFresh) {
  if (hasFresh) {
    return `
      <div class="radar-status-card radar-status-risk">
        <div class="radar-status-main">
          <span class="radar-status-label">Neue Erwähnung</span>
          <p>Neue namentliche Erwähnung gefunden. Einordnung empfohlen.</p>
        </div>
        <button class="secondary-button" type="button" data-radar-search>Suche prüfen</button>
      </div>
    `;
  }
  return `
    <div class="radar-status-card radar-status-ok">
      <div class="radar-status-main">
        <span class="radar-status-label">Kein akuter Treffer</span>
        <p>Keine neue namentliche Erwähnung. Eine ältere relevante Erwähnung bleibt im Blick. Keine öffentliche Reaktion nötig.</p>
      </div>
      <button class="secondary-button" type="button" data-radar-search>Suche prüfen</button>
    </div>
  `;
}

// Bewusst leer: Diese Radar-Signale waren zuvor HART KODIERTE Beispielinhalte
// ("Steuerdebatte …"), die als echte Signale wirkten. Bis eine echte
// Signal-Datenquelle existiert, zeigt der Radar hier den ehrlichen Empty-State
// ("Keine Einträge."), statt erfundene Signale auszugeben.
function renderRadarEarlyWarnings() {
  return "";
}

function renderRadarChances() {
  return "";
}

function renderRadarCriticalQuery() {
  return "";
}

function radarDecisionRows(items, type) {
  return items.map((item) => `
    <article class="radar-mini ${type}">
      <div>
        <span>${escapeHtml(item.priorityLabel)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
      </div>
      <button class="secondary-button" type="button" data-detail="${escapeHtml(item.id)}">Öffnen</button>
    </article>
  `).join("");
}

// ── Radar V3 – Frühwarn- und Entscheidungssystem ─────────────────────────────

const RADAR_V3_RISK_KW = [
  "kritisiert", "vorwurf", "rücktritt", "skandal", "klage", "versagen",
  "gescheitert", "ermittlung", "verhaftung", "betrug", "lüge", "belastet",
  "angriff", "blamage", "niederlage", "razzia", "ablehnung", "scheitert"
];

const RADAR_V3_CHANCE_KW = [
  "fordert", "setzt sich ein", "antrag", "initiative", "erfolg", "durchbruch",
  "einigung", "experte", "gelobt", "zustimmung", "stärkt", "unterstützt", "interview"
];

const RADAR_V3_DEMAND_KW = [
  "anfrage", "kleine anfrage", "fragestunde", "interpellation",
  "parlamentarische anfrage", "ausschuss-sitzung", "ausschusssitzung"
];

const RADAR_V3_HIGH_RISK_SOURCES = ["bild", "welt", "focus", "stern", "spiegel"];

const RADAR_V3_WARN_MS = 48 * 60 * 60 * 1000;

function classifyRadarV3Signal(item) {
  const text = `${item.title || ""} ${item.content || ""} ${item.excerpt || ""}`.toLowerCase();
  const title = (item.title || "").toLowerCase();
  const source = (item.sourceName || "").toLowerCase();
  const ageMs = Date.now() - (itemTimestamp(item) || 0);

  const isHighRiskSrc = RADAR_V3_HIGH_RISK_SOURCES.some((s) => source.includes(s));
  const hasRisk = RADAR_V3_RISK_KW.some((k) => text.includes(k));
  const hasTitleRisk = RADAR_V3_RISK_KW.some((k) => title.includes(k));
  const hasChance = RADAR_V3_CHANCE_KW.some((k) => text.includes(k));
  const hasDemand = RADAR_V3_DEMAND_KW.some((k) => text.includes(k));

  if (hasTitleRisk || (hasRisk && isHighRiskSrc)) return "risk";
  if (hasRisk) return "risk";
  if (hasDemand) return "demand";
  if (hasChance) return "chance";
  if (ageMs < RADAR_V3_WARN_MS && !isFreshUpdate(item)) return "warning";
  return "mention";
}

function renderRadarV3View() {
  const archive = radarArchive.length
    ? radarArchive
    : profileArticleArchive().filter(hasPreciseSource).filter(uniqueMentionItem).sort(sortNewestFirst).slice(0, 60);

  const buckets = { risk: [], demand: [], chance: [], warning: [], mention: [] };
  archive.forEach((item) => {
    const type = classifyRadarV3Signal(item);
    buckets[type].push(item);
  });

  const CATEGORIES = [
    {
      type: "risk",
      icon: "🚨",
      label: "Risiko",
      desc: "Kritische Berichte oder Angriffe, die dir schaden könnten.",
      actionLabel: "Stellungnahme entwerfen",
      colorClass: "radar-v3-risk"
    },
    {
      type: "demand",
      icon: "⚡",
      label: "Kritische Nachfrage",
      desc: "Anfragen, Ausschusstermine oder parlamentarische Fragen, die dich betreffen.",
      actionLabel: "Antwort vorbereiten",
      colorClass: "radar-v3-demand"
    },
    {
      type: "chance",
      icon: "📈",
      label: "Chance",
      desc: "Themen, bei denen du als Experte punkten oder positiv positionieren kannst.",
      actionLabel: "Pressemitteilung verfassen",
      colorClass: "radar-v3-chance"
    },
    {
      type: "warning",
      icon: "🔍",
      label: "Frühwarnung",
      desc: "Neue Themen der letzten 48 Stunden, die relevant werden könnten.",
      actionLabel: null,
      colorClass: "radar-v3-warning"
    },
    {
      type: "mention",
      icon: "🧑‍💼",
      label: "Eigene Erwähnung",
      desc: "Alle Erwähnungen deines Namens in den Medien.",
      actionLabel: null,
      colorClass: "radar-v3-mention"
    }
  ];

  const categoryHtml = CATEGORIES.map((cat) => renderRadarV3Category(cat, buckets[cat.type])).join("");

  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Radar.")}">Radar.</h1>
      <p>Strategisches Frühwarnsystem: Risiken, Chancen und Nachfragen auf einen Blick.</p>
    </section>
    <section class="radar-v3-categories">
      ${categoryHtml}
    </section>
  `;
}

function renderRadarV3Category(cat, items) {
  const visible = items.slice(0, 4);
  const more = items.length > 4 ? items.slice(4) : [];
  const count = items.length;
  const badge = count > 0 ? `<em class="radar-v3-count">${count}</em>` : "";

  const signalHtml = visible.length
    ? visible.map((item) => renderRadarV3Signal(item, cat)).join("")
    : `<p class="radar-v3-empty">Keine Einträge.</p>`;

  const moreHtml = more.length ? `
    <details class="radar-v3-more">
      <summary>${more.length} ältere Einträge</summary>
      ${more.map((item) => renderRadarV3Signal(item, cat)).join("")}
    </details>
  ` : "";

  return `
    <div class="radar-v3-category ${escapeHtml(cat.colorClass)}">
      <div class="radar-v3-cat-header">
        <span class="radar-v3-cat-icon" aria-hidden="true">${cat.icon}</span>
        <div class="radar-v3-cat-text">
          <h2>${escapeHtml(cat.label)}${badge}</h2>
          <p>${escapeHtml(cat.desc)}</p>
        </div>
      </div>
      <div class="radar-v3-signals">
        ${signalHtml}
      </div>
      ${moreHtml}
    </div>
  `;
}

function radarV3Badge(type) {
  const MAP = {
    risk:    ["Risiko",      "radar-v3-badge-risk"],
    demand:  ["Nachfrage",   "radar-v3-badge-demand"],
    chance:  ["Chance",      "radar-v3-badge-chance"],
    warning: ["Frühwarnung", "radar-v3-badge-warning"],
    mention: ["Neutral",     "radar-v3-badge-neutral"]
  };
  const [label, cls] = MAP[type] || MAP.mention;
  return `<span class="radar-v3-badge ${cls}">${escapeHtml(label)}</span>`;
}

function renderRadarV3Signal(item, cat) {
  const href = sourceHref(item);
  const date = escapeHtml(formatBriefingDate(item.publishedAt || item.retrievedAt || ""));
  const sourceLabel = escapeHtml(item.sourceName || "Quelle");
  const titleText = escapeHtml(item.title || "Erwähnung gefunden");
  const iconHtml = radarV3SourceIcon(item);

  const articleLink = href
    ? `<a class="radar-v3-article-link" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">Zum Artikel →</a>`
    : "";
  const actionBtn = cat.actionLabel && href
    ? `<button class="secondary-button radar-v3-act-btn" type="button" data-view="office">${escapeHtml(cat.actionLabel)}</button>`
    : "";

  return `
    <article class="radar-v3-card">
      <div class="radar-v3-card-meta">
        ${iconHtml}
        <span class="radar-v3-card-source">${sourceLabel}</span>
        <span class="radar-v3-card-dot" aria-hidden="true">·</span>
        <span class="radar-v3-card-date">${date}</span>
        ${radarV3Badge(cat.type)}
      </div>
      <h3 class="radar-v3-card-title">${titleText}</h3>
      <div class="radar-v3-card-footer">
        ${articleLink}
        ${actionBtn}
      </div>
    </article>
  `;
}

function profileMentions() {
  const profileTerms = profileNameTerms();
  return [...(briefing.personMentions || []), ...(briefing.rawItems || [])]
    .filter((item) => itemMentionsProfile(item, profileTerms))
    .filter(hasPreciseSource)
    .filter(uniqueMentionItem)
    .sort(sortNewestFirst);
}

function profileArticleArchive(allMentions = []) {
  const profileTerms = profileNameTerms();
  return [...allMentions, ...(briefing.personMentions || []), ...(briefing.rawItems || [])]
    .filter((item) => itemMentionsProfile(item, profileTerms) || itemAuthoredByProfile(item, profileTerms))
    .filter(hasPreciseSource)
    .filter(uniqueMentionItem)
    .sort(sortNewestFirst);
}

function isImportantProfileArticle(item) {
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.excerpt || ""}`.toLowerCase();
  const strongSource = ["media", "local", "party", "faction", "bundestag"].includes(String(item?.sourceType || "").toLowerCase());
  const titleHit = itemMentionsProfile({ title: item?.title || "" });
  const politicalHit = /interview|fordert|kritisiert|klage|urteil|bundestag|ausschuss|mindestlohn|bürgergeld|rente|arbeit|soziales|pflege|tarif|wohnung|armut/i.test(text);
  return strongSource || titleHit || politicalHit;
}

function isArchivedLowSignal(item) {
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.excerpt || ""}`.toLowerCase();
  const socialOrWeak = ["social", "manual"].includes(String(item?.sourceType || "").toLowerCase());
  const old = itemTimestamp(item) ? Date.now() - itemTimestamp(item) > 60 * 24 * 60 * 60 * 1000 : false;
  const weakTopic = /sport|kultur|terminhinweis|randnotiz|social|kommentarspalte/i.test(text);
  return socialOrWeak || old || weakTopic;
}

function isWithinLastThreeMonths(item) {
  const timestamp = itemTimestamp(item);
  if (!timestamp) return false;
  return Date.now() - timestamp <= 92 * 24 * 60 * 60 * 1000;
}

function profileNameTerms() {
  const fullName = profile?.fullName || "Profil";
  const lastName = fullName.split(/\s+/).filter(Boolean).at(-1) || "Ince";
  return { fullName, lastName };
}

function itemMentionsProfile(item, terms = profileNameTerms()) {
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.excerpt || ""}`.toLowerCase();
  return text.includes(terms.fullName.toLowerCase()) || profileLastNameRegex(terms.lastName).test(text);
}

function itemAuthoredByProfile(item, terms = profileNameTerms()) {
  const author = `${item?.author || ""}`.toLowerCase();
  return Boolean(author) && (author.includes(terms.fullName.toLowerCase()) || profileLastNameRegex(terms.lastName).test(author));
}

function profileLastNameRegex(lastName) {
  return new RegExp(`(^|[^a-zäöüß])${escapeRegExp(String(lastName || "").toLowerCase())}($|[^a-zäöüß])`, "i");
}

function uniqueMentionItem(item, index, items) {
  return items.findIndex((entry) => mentionKey(entry) === mentionKey(item)) === index;
}

function sortNewestFirst(a, b) {
  return new Date(b.retrievedAt || b.publishedAt || 0) - new Date(a.retrievedAt || a.publishedAt || 0);
}

function archivedProfileMentions(allMentions, freshMentions) {
  const freshKeys = new Set(freshMentions.map(mentionKey));
  return allMentions.filter((item) => !freshKeys.has(mentionKey(item)) && !isFreshUpdate(item));
}

function mentionKey(item) {
  return item?.url || item?.sourceUrl || item?.id || item?.title || "";
}

function mentionRows(items, options = {}) {
  if (!items.length) {
    if (options.empty === false) return "";
    return `
      <div class="radar-empty-hint">
        <p><strong>Keine neue Erwähnung</strong><br>Personensuche läuft weiter. Nächster Quellenlauf heute Abend.</p>
        <button class="secondary-button" type="button" data-radar-search>Suche prüfen</button>
      </div>
    `;
  }

  if (options.compact) {
    return items.map((item) => {
      const href = sourceHref(item);
      if (!href) return "";
      return `
        <article class="radar-mention-compact">
          <div class="radar-mention-thumb">${mentionVisual(item)}</div>
          <div class="radar-mention-content">
            <div class="radar-mention-header">
              <span class="radar-mention-source">${escapeHtml(item.sourceName || "Quelle")}</span>
              <span class="radar-mention-status">Archiviert</span>
              <span class="radar-mention-date">${escapeHtml(formatBriefingDate(item.publishedAt || item.retrievedAt || ""))}</span>
            </div>
            <h3>${escapeHtml(item.title || "Erwähnung gefunden")}</h3>
            <div class="radar-mention-actions">
              <a class="secondary-button" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>
            </div>
          </div>
        </article>
      `;
    }).filter(Boolean).join("");
  }

  return items.map((item) => {
    const href = sourceHref(item);
    if (!href) return "";
    return `
      <article class="list-row mention mention-row ${href ? "" : "no-link"}">
        ${mentionVisual(item)}
        <div class="mention-content">
          <div>
            <span>${escapeHtml(item.sourceName || "Quelle")}</span>
            <h3>${escapeHtml(item.title || "Erwähnung gefunden")}</h3>
            <p>${escapeHtml(twoSentenceSummary(item.content || item.excerpt || "Diese Person wurde in dieser Quelle erwähnt."))}</p>
            <small class="mention-timestamp">Gefunden: ${escapeHtml(formatMentionFoundAt(item))}</small>
          </div>
          <a class="radar-source-link" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">Quelle öffnen →</a>
        </div>
        <a class="secondary-button mention-open" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">Einordnen</a>
      </article>
    `;
  }).join("");
}

function mentionVisual(item) {
  if (item.imageUrl) {
    return `<img class="mention-image mention-image-cover" src="${escapeAttribute(item.imageUrl)}" alt="" loading="lazy" />`;
  }

  const publisherLogo = publisherImageUrl(item);
  if (publisherLogo) {
    return `<div class="mention-image mention-image-logo" aria-hidden="true"><img src="${escapeAttribute(publisherLogo)}" alt="" loading="lazy" /></div>`;
  }

  return `<div class="mention-avatar" aria-hidden="true">${escapeHtml(profileInitials())}</div>`;
}

function formatMentionFoundAt(item) {
  return formatBriefingDate(item.retrievedAt || item.publishedAt || new Date().toISOString());
}

function publisherImageUrl(item) {
  const domain = publisherDomain(item);
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : "";
}

function publisherDomain(item) {
  const text = `${item.sourceName || ""} ${item.title || ""}`.toLowerCase();
  const known = [
    ["taz", "taz.de"],
    ["freitag", "freitag.de"],
    ["junge welt", "jungewelt.de"],
    ["morgenpost", "morgenpost.de"],
    ["tagesspiegel", "tagesspiegel.de"],
    ["welt am sonntag", "welt.de"],
    ["welt", "welt.de"],
    ["nd-aktuell", "nd-aktuell.de"],
    ["zdf", "zdf.de"],
    ["zeit", "zeit.de"],
    ["frankfurter rundschau", "fr.de"],
    ["süddeutsche", "sueddeutsche.de"],
    ["sz.de", "sueddeutsche.de"],
    ["spiegel", "spiegel.de"],
    ["saarbrücker zeitung", "saarbruecker-zeitung.de"],
    ["phoenix", "phoenix.de"],
    ["bild am sonntag", "bild.de"],
    ["bild", "bild.de"],
    ["frankfurter allgemeine", "faz.net"],
    ["faz", "faz.net"],
    ["handelsblatt", "handelsblatt.com"],
    ["rheinische post", "rp-online.de"],
    ["rp-online", "rp-online.de"],
    ["focus", "focus.de"],
    ["stern", "stern.de"],
    ["ard", "ard.de"],
    ["ndr", "ndr.de"],
    ["wdr", "wdr.de"],
    ["mdr", "mdr.de"],
    ["bayerischer rundfunk", "br.de"],
    ["n-tv", "n-tv.de"],
    ["t-online", "t-online.de"],
    ["berliner zeitung", "berliner-zeitung.de"],
    ["hamburger abendblatt", "abendblatt.de"],
    ["augsburger allgemeine", "augsburger-allgemeine.de"],
    ["rhein-zeitung", "rhein-zeitung.de"],
    ["volksfreund", "volksfreund.de"],
    ["watson", "watson.de"],
    ["business insider", "businessinsider.de"],
    ["heise", "heise.de"],
    ["deutsche welle", "dw.com"],
    ["bundestag", "bundestag.de"],
    ["bundesrat", "bundesrat.de"]
  ];
  const match = known.find(([name]) => text.includes(name));
  return match ? match[1] : "";
}

const RADAR_V3_PALETTE = [
  "#c0392b", "#d35400", "#8e44ad", "#2980b9",
  "#27ae60", "#16a085", "#2c3e50", "#e74c3c",
  "#9b59b6", "#3498db", "#1abc9c", "#e67e22",
  "#7f8c8d", "#95a5a6"
];

function radarV3AvatarColor(name) {
  let h = 5381;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
  return RADAR_V3_PALETTE[h % RADAR_V3_PALETTE.length];
}

function radarV3SourceIcon(item) {
  const sourceName = item.sourceName || "Quelle";
  const initial = escapeHtml(sourceName.charAt(0).toUpperCase());
  const color = radarV3AvatarColor(sourceName);
  const logoUrl = publisherImageUrl(item);
  const img = logoUrl
    ? `<img class="radar-v3-source-logo" src="${escapeAttribute(logoUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : "";
  return `<span class="radar-v3-source-icon" style="background:${color}" aria-hidden="true">${initial}${img}</span>`;
}

function profileInitials() {
  return String(profile?.fullName || "Profil")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function radarRows(items, type) {
  return items.map((item) => `
    <article class="list-row ${type}">
      <div>
        <span>${type === "risk" ? "Risiko" : type === "chance" ? "Chance" : "Beobachten"}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(type === "risk" ? item.risk : item.opportunity || item.summary)}</p>
        ${sourceLink(item)}
      </div>
      <button class="secondary-button" type="button" data-detail="${escapeHtml(item.id)}">Empfehlung öffnen</button>
    </article>
  `).join("") || `<p class="empty-state">Keine Einträge.</p>`;
}

function renderSettingsView() {
  const ops = opsStatus || {};
  const storage = ops.storage || {};
  const crawl = ops.crawl || briefing.sourceStats || {};
  const topTopics = topProfileTopicsForView();
  const committee = profile.committee || profile.committees?.[0] || "";
  const initials = (profile.fullName || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const push = { ...(ops.push || {}), ...(pushConfig || {}) };
  const pushSupported = browserPushSupported();
  const pushBlocked = pushPermissionState() === "denied";
  const pushTestDisabled = !push.enabled || !pushSupported || pushBlocked;
  const role = userRole();
  const isAdmin = role === "admin";

  const learning = ops.learning || {};
  const learnCount = Number(learning.eventCount || 0);
  const learnLabel = learnCount === 0
    ? "Noch keine Signale"
    : learnCount < 5
      ? `${learnCount} Signal${learnCount === 1 ? "" : "e"} · lernt an`
      : `${learnCount} Signale · Vertrauen ${learning.confidence || "mittel"}`;

  const systemOk = opsStatusLoaded && storage.backend === "supabase" && ops.ai?.enabled;
  const systemBadge = !opsStatusLoaded
    ? `<span class="stg-system-badge stg-system-badge--warn">Wird geprüft</span>`
    : systemOk
      ? `<span class="stg-system-badge stg-system-badge--ok">Bereit</span>`
      : `<span class="stg-system-badge stg-system-badge--warn">${escapeHtml(ops.readiness?.issues?.[0] || "Prüfen")}</span>`;

  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Einstellungen.")}">Einstellungen.</h1>
    </section>

    <div class="stg-section">
      <span class="stg-label">Profil</span>
      <div class="stg-group">
        <div class="stg-profile-row" data-view="profile-settings" role="button" tabindex="0">
          <div class="stg-avatar">${escapeHtml(initials)}</div>
          <div class="stg-profile-info">
            <p class="stg-profile-name">${escapeHtml(profile.fullName || "Profil")}</p>
            <p class="stg-profile-sub">${escapeHtml([profile.function, profile.party].filter(Boolean).join(" · ") || "MdB")}</p>
          </div>
          <span class="stg-row-chevron">›</span>
        </div>
        ${committee ? `
        <div class="stg-row">
          <span class="stg-row-label">Ausschuss</span>
          <span class="stg-row-value">${escapeHtml(committee)}</span>
        </div>` : ""}
        <div class="stg-row">
          <span class="stg-row-label">Themen</span>
          <span class="stg-row-value">${escapeHtml(topTopics.slice(0, 3).join(" · ") || "Noch nicht gesetzt")}</span>
        </div>
      </div>
    </div>

    <div class="stg-section">
      <span class="stg-label">Büro</span>
      <div class="stg-group">
        ${OFFICE_FORMATS.map((f) => {
          const active = activeOfficeFormats().some((a) => a.id === f.id);
          return `
          <label class="stg-row stg-row--tappable">
            <span class="stg-row-label">${escapeHtml(f.label)}</span>
            <input type="checkbox" name="settingsOfficeFormat" value="${escapeAttribute(f.id)}" ${active ? "checked" : ""} data-office-format-toggle style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
          </label>`;
        }).join("")}
        <div class="stg-row">
          <span class="stg-row-label">Helmut lernt</span>
          <span class="stg-row-value">${escapeHtml(learnLabel)}</span>
        </div>
      </div>
    </div>

    <div class="stg-section">
      <span class="stg-label">Darstellung</span>
      <div class="stg-group">
        <div class="stg-row stg-row--stack">
          <span class="stg-row-label">Erscheinungsbild</span>
          <div class="theme-toggle">
            ${[["dark", "Dunkel"], ["light", "Hell"], ["system", "Auto"]].map(([value, label]) =>
              `<button class="theme-option ${getThemePref() === value ? "active" : ""}" type="button" data-theme-set="${value}">${label}</button>`
            ).join("")}
          </div>
        </div>
      </div>
    </div>

    <div class="stg-section">
      <span class="stg-label">Mitteilungen</span>
      <div class="stg-group">
        <div class="stg-row">
          <div style="flex:1;min-width:0">
            <div class="stg-row-label">Push-Benachrichtigungen</div>
            ${pushBlocked ? `<div class="stg-row-sublabel">In den Browser-Einstellungen erlauben</div>` : ""}
          </div>
          <label class="stg-toggle">
            <input type="checkbox" data-enable-push ${push.enabled && pushPermissionState() === "granted" ? "checked" : ""} ${!pushSupported || pushBlocked ? "disabled" : ""}/>
            <span class="stg-toggle-track"></span>
            <span class="stg-toggle-thumb"></span>
          </label>
        </div>
        ${isAdmin ? `
        <div class="stg-row">
          <span class="stg-row-label">Push-Test</span>
          <button class="secondary-button compact-button" type="button" data-test-push ${pushTestDisabled ? "disabled" : ""} style="flex-shrink:0;width:auto;padding:0 14px">Senden</button>
        </div>` : ""}
      </div>
      ${isAccountMode() && currentUser ? (() => {
        const ns = currentUser.notificationSettings || {};
        const cats = [
          { id: "briefing",   label: "Morgenbriefing",   sub: "Tägliche Zusammenfassung" },
          { id: "lage",       label: "Lage",             sub: "Neue politische Entwicklungen" },
          { id: "radar",      label: "Radar",            sub: "Neue Erwähnungen" },
          { id: "crisis",     label: "Krisen",           sub: "Erkannte Risiken" },
          { id: "opportunity",label: "Chancen",          sub: "Erkannte Möglichkeiten" },
          { id: "statement",  label: "Statement",        sub: "Reaktionen empfohlen" }
        ];
        return `<div class="stg-group" style="margin-top:8px">
          <div class="stg-row" style="padding-bottom:4px">
            <span class="stg-row-label" style="font-weight:600;color:var(--text)">Kategorien</span>
          </div>
          ${cats.map(c => {
            const on = ns[c.id] !== false;
            return `<div class="stg-row">
              <div style="flex:1;min-width:0">
                <div class="stg-row-label">${escapeHtml(c.label)}</div>
                <div class="stg-row-sublabel">${escapeHtml(c.sub)}</div>
              </div>
              <label class="stg-toggle">
                <input type="checkbox" data-notif-toggle="${escapeAttribute(c.id)}" ${on ? "checked" : ""}/>
                <span class="stg-toggle-track"></span>
                <span class="stg-toggle-thumb"></span>
              </label>
            </div>`;
          }).join("")}
        </div>`;
      })() : ""}
    </div>

    ${isAdmin ? `
    <div class="stg-section">
      <span class="stg-label">System</span>
      <div class="stg-group">
        <div class="stg-row">
          <span class="stg-row-label">Status</span>
          <span class="stg-row-action">${systemBadge}</span>
        </div>
        ${opsStatusLoaded ? `
        <div class="stg-row">
          <div style="flex:1;min-width:0">
            <div class="stg-row-label">Quellen</div>
            <div class="stg-row-sublabel">${escapeHtml(`${crawl?.checkedSources || 0} geprüft · ${crawl?.failedSources || 0} Fehler`)}</div>
          </div>
          <button class="secondary-button compact-button" type="button" data-run-crawl style="flex-shrink:0;width:auto;padding:0 14px">Prüfen</button>
        </div>
        <div class="stg-row">
          <span class="stg-row-label">KI</span>
          <span class="stg-row-value">${escapeHtml(ops.ai?.enabled ? (ops.ai.model || "Aktiv") : "Nicht aktiv")}</span>
        </div>` : ""}
      </div>
    </div>` : ""}

    <div class="stg-section">
      <span class="stg-label">Datenschutz</span>
      <div class="stg-group">
        <div class="stg-row stg-row--tappable" role="button" data-privacy-export>
          <span class="stg-row-label">Daten exportieren</span>
          <span class="stg-row-chevron">›</span>
        </div>
        <a class="stg-row stg-row--tappable" href="/datenschutz" target="_blank" rel="noopener noreferrer" style="text-decoration:none">
          <span class="stg-row-label">Datenschutzhinweise</span>
          <span class="stg-row-chevron">›</span>
        </a>
        <div class="stg-row stg-row--tappable stg-row--danger" role="button" data-privacy-delete>
          <span class="stg-row-label">Daten löschen</span>
          <span class="stg-row-chevron" style="color:var(--danger,#ff5d6c)">›</span>
        </div>
      </div>
    </div>

    ${isAccountMode() && currentUser ? `
    <div class="stg-section">
      <div class="stg-group">
        <div class="stg-row stg-row--tappable" role="button" data-logout>
          <span class="stg-row-label">Abmelden</span>
        </div>
      </div>
    </div>` : ""}

    <p class="stg-version">Helmut · Pilotversion</p>
  `;
}



function topProfileTopicsForView() {
  const prioritized = Object.entries(profile?.topicPriorities || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .map(([topic]) => topic);
  return uniqueViewList([...prioritized, ...(profile?.focusTopics || [])]).slice(0, 8);
}

function asTextList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueViewList(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = String(item || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueValueOptions(options) {
  const seen = new Set();
  return (options || []).filter(([value]) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function constituencyOptionsForState(state, currentValue = "") {
  const options = constituencyOptionsByState[state] || [];
  const values = [currentValue, ...options, "Noch offen"].filter(Boolean);
  return uniqueViewList(values).map((value) => [value, value]);
}

function updateConstituencySelect(state) {
  const select = app.querySelector("[data-constituency-select]");
  if (!select) return;
  const currentValue = select.value;
  const options = constituencyOptionsForState(state, currentValue);
  select.innerHTML = options.map(([value, label]) => `<option value="${escapeAttribute(value)}" ${value === currentValue ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function qualitySummary(quality) {
  if (!quality) return "Der nächste Briefinglauf prüft Handlung, Mandatsbezug, Quelle, Kommunikation und Aufgabe.";
  const base = `${quality.score || 0}% vollständig · ${quality.recommendationCount || 0} Empfehlungen geprüft.`;
  if (quality.issues?.length) return `${base} Offen: ${quality.issues[0]}`;
  return `${base} Alle Kernfragen sind abgedeckt.`;
}

function learningSummary(learning) {
  if (!learning || !learning.eventCount) return "Helmut lernt aus Relevant, Später, Nicht relevant, Kopieren, Notizen und Büroaufträgen. Noch gibt es keine gespeicherten Nutzungssignale.";
  return `${learning.eventCount} Signale · Vertrauen ${learning.confidence}. ${learning.summary || "Ähnliche Themen werden künftig vorsichtig angepasst."}`;
}

function readinessSummary(readiness) {
  if (!readiness) return "Helmut prüft Speicher, Quellen, Briefing, Qualität und Automatik.";
  if (readiness.issues?.length) return `${readiness.score || 0}% · Nächster Fix: ${readiness.issues[0]}`;
  if (readiness.warnings?.length) return `${readiness.score || 0}% · Pilot möglich. Hinweis: ${readiness.warnings[0]}`;
  return `${readiness.score || 100}% · Speicher, Quellen, Briefing und Qualität sind bereit.`;
}

function evidenceSummary(evidence) {
  if (!evidence) return "Helmut prüft, ob sichtbare Empfehlungen belastbare Quellenlinks haben.";
  const direct = evidence.directLinks || 0;
  const fallback = evidence.publisherFallbacks || 0;
  const missing = evidence.missingLinks || 0;
  if (missing) return `${direct} Direktlinks · ${fallback + missing} Belege ohne präzisen Artikellink.`;
  if (fallback) return `${direct} Direktlinks · ${fallback} Belege nur mit Publisher-Quelle.`;
  return `${direct} Direktlinks. Keine technischen Links.`;
}

function pushStatusTitle(push = {}, supported = browserPushSupported()) {
  if (!supported) return "Auf diesem Gerät nicht verfügbar";
  if (!push.enabled) return "Noch nicht konfiguriert";
  if (pushEnabledOnThisDevice(push)) return "Aktiviert";
  if (pushPermissionState() === "granted") return "Berechtigung aktiv";
  if (pushPermissionState() === "denied") return "Vom Browser blockiert";
  return "Bereit zum Aktivieren";
}

function pushStatusCopy(push = {}, supported = browserPushSupported()) {
  if (!supported) return "Push funktioniert nur in unterstützten Browsern und auf HTTPS. Auf iOS meist erst nach Installation als Web-App.";
  if (!push.enabled) return "Für echte Pushs fehlen noch VAPID Keys in der Produktionsumgebung.";
  if (pushEnabledOnThisDevice(push)) return "Helmut informiert dich auf diesem Gerät, sobald das Morgenbriefing bereitsteht.";
  if (pushPermissionState() === "granted") return "Die Browser-Berechtigung ist aktiv. Mit einem Klick synchronisiert Helmut dieses Gerät.";
  if (pushPermissionState() === "denied") return "Du hast Benachrichtigungen blockiert. Erlaube sie zuerst in den Website-Einstellungen deines Browsers und lade Helmut danach neu.";
  return "Einmal aktivieren. Danach kann Helmut das Morgenbriefing direkt auf dein Smartphone melden.";
}

function pushPermissionButtonLabel(push = {}) {
  if (!browserPushSupported()) return "Nicht verfügbar";
  if (pushEnabledOnThisDevice(push)) return "Aktiviert";
  if (pushPermissionState() === "granted") return "Gerät synchronisieren";
  if (pushPermissionState() === "denied") return "Blockiert";
  return "Aktivieren";
}

function pushTestButtonLabel(push = {}) {
  if (!browserPushSupported()) return "Nicht verfügbar";
  if (!push.enabled) return "Nicht konfiguriert";
  if (pushPermissionState() === "denied") return "Erst erlauben";
  return "Test senden";
}

function pushPermissionState() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function operationsSummary(ops) {
  if (!ops || !ops.status) return "Status konnte noch nicht geladen werden.";
  const crawl = ops.crawl;
  const briefingInfo = ops.briefing;
  const checked = crawl?.checkedSources || 0;
  const failed = crawl?.failedSources || 0;
  const recs = briefingInfo?.recommendationCount ?? recommendations.length;
  if (ops.status === "Bereit") return `${checked} Quellen geprüft, ${failed} Fehler, ${recs} persönliche Empfehlungen bereit.`;
  if (ops.status === "Prüfen") return `${checked || "Keine"} Quellen zuletzt geprüft. Bitte einmal manuell prüfen.`;
  if (ops.storage?.backend !== "supabase") return "Supabase ist nicht aktiv. Für den Pilot muss persistenter Speicher laufen.";
  return "Noch kein vollständiger Quellen- und Briefinglauf gefunden.";
}

function protectionSummary(protection) {
  const interval = protection?.manualRunMinIntervalMinutes || 10;
  const drafts = protection?.communicationDraftsPerHour || 18;
  return `Manuelle Crawls und Briefings werden ${interval} Minuten wiederverwendet. Kommunikation: ${drafts}/h.`;
}

function browserPushSupported() {
  return Boolean("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
}

function pushEnabledKey() {
  return `${pushEnabledStorageKey}:${activePoliticianId}:${previewMode ? "preview" : "live"}`;
}

function pushEnabledOnThisDevice(push = {}) {
  if (!browserPushSupported() || typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    const localEnabled = window.localStorage.getItem(pushEnabledKey()) === "1";
    const serverCount = Number(push.subscriptionCount);
    if (Number.isFinite(serverCount) && serverCount <= 0) return false;
    return localEnabled;
  } catch {
    return false;
  }
}

async function loadPushConfig() {
  const configResponse = await fetchWithTimeout(`/api/push/public-key?${apiScopeQuery()}`);
  pushConfig = configResponse.ok ? await configResponse.json() : null;
  return pushConfig;
}

function applicationServerKeyMatches(subscription, desiredKey) {
  const current = subscription && subscription.options && subscription.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = desiredKey instanceof Uint8Array ? desiredKey : new Uint8Array(desiredKey);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function ensurePushSubscription(options = {}) {
  const { prompt = true } = options;
  if (!browserPushSupported()) {
    throw new Error("Push wird auf diesem Gerät nicht unterstützt");
  }
  await loadPushConfig();
  if (!pushConfig?.enabled || !pushConfig.publicKey) {
    throw new Error("Push ist serverseitig noch nicht konfiguriert");
  }
  const permission = Notification.permission === "granted"
    ? "granted"
    : prompt
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") {
    throw new Error("Benachrichtigungen nicht aktiviert");
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const desiredKey = urlBase64ToUint8Array(pushConfig.publicKey);
  let existing = await registration.pushManager.getSubscription();
  // Bestehendes Abo nur weiterverwenden, wenn es mit dem aktuellen VAPID-Key
  // erstellt wurde. Nach einem Key-Wechsel sonst dauerhaft 403 -> neu abonnieren.
  if (existing && !applicationServerKeyMatches(existing, desiredKey)) {
    try { await existing.unsubscribe(); } catch (error) { /* altes Abo ignorieren */ }
    existing = null;
  }
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: desiredKey
  });
  const response = await fetchWithTimeout(`/api/push/subscribe?${apiScopeQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription })
  });
  if (!response.ok) throw new Error(`Push subscribe failed: ${response.status}`);
  const result = await response.json().catch(() => ({}));
  pushConfig = {
    ...(pushConfig || {}),
    subscriptionCount: Math.max(1, Number(pushConfig?.subscriptionCount || 0)),
    latestReason: ""
  };
  if (opsStatus?.store?.push) {
    opsStatus.store.push.subscriptions = Math.max(1, Number(opsStatus.store.push.subscriptions || 0));
    opsStatus.store.push.latestReason = "";
  }
  try {
    window.localStorage.setItem(pushEnabledKey(), "1");
  } catch {
    // The browser permission is still valid even when localStorage is unavailable.
  }
  return result?.id ? { subscription, id: result.id } : subscription;
}

async function enablePushNotifications() {
  await ensurePushSubscription();
  showToast("Push aktiviert");
  render();
}

async function sendTestPush() {
  if (pushPermissionState() === "denied") {
    throw new Error("Benachrichtigungen sind im Browser blockiert");
  }
  await ensurePushSubscription();
  const response = await fetchWithTimeout(`/api/push/test?${apiScopeQuery()}`, { method: "POST" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Push test failed: ${response.status}`);
  }
  const result = await response.json();
  if (result.skipped) {
    throw new Error(result.reason || "Kein Push gesendet");
  }
  if (opsStatus?.store?.push) {
    opsStatus.store.push.latestDelivered = Number(result.event?.delivered || 1);
    opsStatus.store.push.latestEventAt = result.event?.createdAt || new Date().toISOString();
    opsStatus.store.push.latestReason = "";
  }
  showToast("Test-Push gesendet");
}

function schedulePushAutoSync() {
  if (pushAutoSyncStarted || previewMode || !browserPushSupported()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  pushAutoSyncStarted = true;
  window.setTimeout(() => {
    ensurePushSubscription({ prompt: false })
      .catch((error) => console.warn("Push auto sync skipped", error));
  }, 1200);
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

function renderProfileSettingsView() {
  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Mandatsprofil.")}">Mandatsprofil.</h1>
      <p>Diese Angaben entscheiden, warum Helmut ein Thema genau für dich priorisiert.</p>
    </section>

    <form class="profile-form" id="profileForm">
      <section class="profile-section">
        <div>
          <span>Grunddaten</span>
          <h2>Wer bist du politisch?</h2>
        </div>
        <div class="profile-grid">
          ${profileField("fullName", "Name", profile.fullName)}
          ${profileField("party", "Partei", profile.party)}
          ${profileField("faction", "Fraktion", profile.faction)}
          ${profileSelect("function", "Funktion", profile.function || "Bundestagsabgeordneter", mandateFunctions)}
        </div>
      </section>

      <section class="profile-section">
        <div>
          <span>Ausschüsse</span>
          <h2>Wo entsteht fachlicher Handlungsdruck?</h2>
        </div>
        ${checkboxGroup("committees", profile.committees || [profile.committee], committeeOptions)}
      </section>

      <section class="profile-section">
        <div>
          <span>Politische Schwerpunkte</span>
          <h2>Was soll Helmut höher gewichten?</h2>
        </div>
        <div class="priority-list">
          ${priorityTopics.map((topic) => priorityControl(topic, profile.topicPriorities?.[topic] || inferTopicPriority(topic))).join("")}
        </div>
      </section>

      <section class="profile-section">
        <div>
          <span>Wahlkreis</span>
          <h2>Was zählt für deinen Wahlkreis?</h2>
        </div>
        <div class="profile-grid">
          ${profileSelectWithAttrs("state", "Bundesland", profile.state, federalStateOptions, 'data-state-select')}
          ${profileValueSelectWithAttrs("constituency", "Wahlkreis", profile.constituency, constituencyOptionsForState(profile.state, profile.constituency), 'data-constituency-select')}
          ${profileField("location", "Ort", profile.location)}
        </div>
      </section>

      <section class="profile-section">
        <div>
          <span>Kommunikationsstil</span>
          <h2>Wie soll Helmut formulieren?</h2>
        </div>
        ${radioGroup("communicationStyle", profile.communicationStyle || "Lösungsorientiert", communicationStyles)}
        ${profileArea("mainQuestion", "Leitfrage", profile.mainQuestion)}
        ${profileArea("currentCampaigns", "Aktuelle Kampagnen", profile.currentCampaigns)}
        ${profileArea("publicPositions", "Öffentliche Positionen", profile.publicPositions)}
        ${profileArea("keyAudiences", "Wichtige Zielgruppen", profile.keyAudiences)}
        ${profileArea("riskTopics", "Risiko-Themen", profile.riskTopics)}
        ${profileArea("opportunityTopics", "Chancen-Themen", profile.opportunityTopics)}
        ${profileArea("preferredChannels", "Bevorzugte Kanäle", profile.preferredChannels)}
        <div class="profile-subsection">
          <span>Büro-Übergabe</span>
          <p>Welcher Weg soll beim Button „Ans Büro geben” zuerst angeboten werden?</p>
          ${radioValueGroup("officeHandoffMethod", preferredOfficeHandoffMethod(), officeHandoffMethods)}
        </div>
        ${profileArea("upcomingAppointments", "Nächste Termine", profile.upcomingAppointments)}
        ${profileArea("noGoTopics", "No-Go-Themen", profile.noGoTopics)}
      </section>

      <div class="profile-actions">
        <button class="secondary-button" type="button" data-view="settings">Zurück zum Profil</button>
        <button class="primary-button" type="submit">Profil speichern</button>
      </div>
    </form>
  `;
}

function profileSelect(name, label, value, options) {
  return `
    <label class="profile-field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}">
        ${options.map((option) => `<option value="${escapeAttribute(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function profileValueSelect(name, label, value, options) {
  return `
    <label class="profile-field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeAttribute(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </label>
  `;
}

function profileSelectWithAttrs(name, label, value, options, attrs = "") {
  const normalizedValue = value || options[0] || "";
  const cleanOptions = uniqueViewList([normalizedValue, ...options]).filter(Boolean);
  return `
    <label class="profile-field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}" ${attrs}>
        ${cleanOptions.map((option) => `<option value="${escapeAttribute(option)}" ${option === normalizedValue ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function profileValueSelectWithAttrs(name, label, value, options, attrs = "") {
  const normalizedValue = value || options[0]?.[0] || "";
  const cleanOptions = uniqueValueOptions([[normalizedValue, normalizedValue], ...options]);
  return `
    <label class="profile-field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}" ${attrs}>
        ${cleanOptions.map(([optionValue, optionLabel]) => `<option value="${escapeAttribute(optionValue)}" ${optionValue === normalizedValue ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </label>
  `;
}

function profileField(name, label, value) {
  return `
    <label class="profile-field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" value="${escapeHtml(value || "")}" />
    </label>
  `;
}

function profileArea(name, label, value) {
  const text = Array.isArray(value) ? value.join("\n") : value || "";
  return `
    <label class="profile-field wide">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(name)}" rows="4">${escapeHtml(text)}</textarea>
    </label>
  `;
}

function checkboxGroup(name, selectedValues, options) {
  const selected = new Set((selectedValues || []).filter(Boolean));
  return `
    <div class="choice-grid">
      ${options.map((option) => `
        <label class="choice-pill">
          <input type="checkbox" name="${escapeAttribute(name)}" value="${escapeAttribute(option)}" ${selected.has(option) ? "checked" : ""} />
          <span>${escapeHtml(option)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function radioGroup(name, value, options) {
  return `
    <div class="choice-grid compact">
      ${options.map((option) => `
        <label class="choice-pill">
          <input type="radio" name="${escapeAttribute(name)}" value="${escapeAttribute(option)}" ${option === value ? "checked" : ""} />
          <span>${escapeHtml(option)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function radioValueGroup(name, value, options) {
  return `
    <div class="choice-grid compact">
      ${options.map(([optionValue, optionLabel]) => `
        <label class="choice-pill">
          <input type="radio" name="${escapeAttribute(name)}" value="${escapeAttribute(optionValue)}" ${optionValue === value ? "checked" : ""} />
          <span>${escapeHtml(optionLabel)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function priorityControl(topic, value) {
  return `
    <label class="priority-row">
      <span>${escapeHtml(topic)}</span>
      <input type="range" min="1" max="5" step="1" name="topicPriority:${escapeAttribute(topic)}" value="${escapeAttribute(String(value))}" />
      <b>${escapeHtml(String(value))}</b>
    </label>
  `;
}

function inferTopicPriority(topic) {
  const focus = new Set((profile.focusTopics || []).map((entry) => entry.toLowerCase()));
  return focus.has(topic.toLowerCase()) ? 4 : 2;
}

function selectedDecision() {
  return decisions.find((decision) => decision.id === selectedDecisionId) || decisions[0] || {
    id: "",
    signalId: "",
    title: "Noch kein Briefing",
    priorityLabel: "Profil",
    priorityType: "ignore",
    summary: "Für dieses Mandat liegt noch keine eigene politische Lage vor.",
    action: "Vervollständige das Mandatsprofil und starte danach ein neues Briefing.",
    statement: "",
    whyNow: "",
    whyItMatters: "",
    inaction: "",
    sources: []
  };
}

async function apiSend(method, path, body) {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) options.body = JSON.stringify(body);
  const res = await fetchWithTimeout(path, options);
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, json };
}

function bindAccountActions() {
  bindPasswordToggles(app);
  app.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", () => logout()));
  app.querySelectorAll("[data-profile-switch]").forEach((select) => select.addEventListener("change", (event) => switchPolitician(event.target.value)));

  const dailyForm = app.querySelector("#dailyInputForm");
  if (dailyForm) {
    dailyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const err = app.querySelector("#dailyInputError");
      if (err) err.textContent = "";
      const fd = new FormData(dailyForm);
      const body = {
        title: fd.get("title"),
        datetime: fd.get("datetime"),
        context: fd.get("context"),
        goal: fd.get("goal"),
        desiredPrep: fd.get("desiredPrep")
      };
      const res = await apiSend("POST", `/api/daily-inputs?${apiScopeQuery()}`, body);
      if (!res.ok) {
        if (err) err.textContent = res.json?.error || "Konnte nicht gespeichert werden.";
        return;
      }
      dailyInputsLoaded = false;
      await ensureViewData("daily-input");
      showToast("Eingetragen");
    });
  }

  app.querySelectorAll("[data-remove-daily-input]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.removeDailyInput;
      const res = await apiSend("DELETE", `/api/daily-inputs/${encodeURIComponent(id)}?${apiScopeQuery()}`);
      if (res.ok) {
        dailyInputsLoaded = false;
        await ensureViewData("daily-input");
      }
    });
  });

  const createUserForm = app.querySelector("#createUserForm");
  if (createUserForm) {
    createUserForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const err = app.querySelector("#createUserError");
      if (err) err.textContent = "";
      const fd = new FormData(createUserForm);
      const body = { name: fd.get("name"), email: fd.get("email"), role: fd.get("role"), password: fd.get("password") };
      if (body.role === "abgeordneter") {
        body.party = fd.get("party");
        body.committee = fd.get("committee");
        body.constituency = fd.get("constituency");
        body.state = fd.get("state");
        const topics = String(fd.get("focusTopics") || "").split(",").map((t) => t.trim()).filter(Boolean);
        if (topics.length) body.focusTopics = topics;
      }
      const res = await apiSend("POST", `/api/admin/users?${apiScopeQuery()}`, body);
      if (!res.ok) {
        if (err) err.textContent = res.json?.error || "Konnte nicht angelegt werden.";
        return;
      }
      adminDataLoaded = false;
      await ensureViewData("admin");
      showToast("Nutzer angelegt");
    });
  }

  app.querySelectorAll("[data-toggle-user]").forEach((button) => {
    let confirmTimer = null;
    button.addEventListener("click", async () => {
      const id = button.dataset.toggleUser;
      const active = button.dataset.active === "1";
      if (active && !button.classList.contains("btn-confirm")) {
        button.classList.add("btn-confirm");
        button.textContent = "Wirklich?";
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
          button.classList.remove("btn-confirm");
          button.textContent = "Deaktivieren";
        }, 3000);
        return;
      }
      clearTimeout(confirmTimer);
      button.classList.remove("btn-confirm");
      const res = await apiSend("PATCH", `/api/admin/users/${encodeURIComponent(id)}?${apiScopeQuery()}`, { active: !active });
      if (res.ok) {
        adminDataLoaded = false;
        await ensureViewData("admin");
      }
    });
  });

  app.querySelectorAll("[data-billing-user]").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.billingUser;
      const value = input.value || null;
      const res = await apiSend("PATCH", `/api/admin/users/${encodeURIComponent(id)}?${apiScopeQuery()}`, { paidUntil: value });
      if (res.ok) {
        adminDataLoaded = false;
        await ensureViewData("admin");
        showToast(value ? `Bezahlt bis ${new Date(value).toLocaleDateString("de-DE")} gesetzt.` : "Abo-Datum entfernt.");
      }
    });
  });

  app.querySelectorAll("[data-admin-user-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.adminUserEdit;
      if (expandedAdminUsers.has(id)) expandedAdminUsers.delete(id);
      else expandedAdminUsers.add(id);
      render();
    });
  });

  app.querySelectorAll("[data-customer-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = form.dataset.customerForm;
      const err = app.querySelector(`[data-customer-error="${id}"]`);
      if (err) err.textContent = "";
      const fd = new FormData(form);
      const priceRaw = String(fd.get("pricePerMonth") || "").trim();
      const body = {
        status: fd.get("status"),
        customer: {
          pricePerMonth: priceRaw === "" ? null : Number(priceRaw),
          startDate: fd.get("startDate") || null,
          trialUntil: fd.get("trialUntil") || null,
          nextInvoice: fd.get("nextInvoice") || null,
          paymentStatus: fd.get("paymentStatus"),
          internalNote: String(fd.get("internalNote") || "")
        }
      };
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Speichert…"; }
      try {
        const res = await apiSend("PATCH", `/api/admin/users/${encodeURIComponent(id)}?${apiScopeQuery()}`, body);
        if (!res.ok) {
          if (err) err.textContent = res.json?.error || "Speichern fehlgeschlagen.";
          return;
        }
        expandedAdminUsers.delete(id);
        adminDataLoaded = false;
        await ensureViewData("admin");
        showToast("Gespeichert");
      } catch (error) {
        if (err) err.textContent = "Netzwerkfehler.";
      } finally {
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = "Speichern"; }
      }
    });
  });

  app.querySelectorAll("[data-feedback-done]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.feedbackDone;
      button.disabled = true;
      try {
        const res = await apiSend("PATCH", `/api/admin/feedback/${encodeURIComponent(id)}?${apiScopeQuery()}`, { done: true });
        if (res.ok) {
          adminDataLoaded = false;
          await ensureViewData("admin");
          showToast("Als erledigt markiert");
        } else {
          button.disabled = false;
          showToast("Fehler beim Speichern");
        }
      } catch (error) {
        button.disabled = false;
        showToast("Netzwerkfehler");
      }
    });
  });

  const resetPasswordForm = app.querySelector("#resetPasswordForm");
  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const err = app.querySelector("#resetPasswordError");
      if (err) err.textContent = "";
      const fd = new FormData(resetPasswordForm);
      const userId = fd.get("userId");
      const password = String(fd.get("password") || "");
      if (password.length < 8) {
        if (err) err.textContent = "Passwort muss mindestens 8 Zeichen haben.";
        return;
      }
      const res = await apiSend("PATCH", `/api/admin/users/${encodeURIComponent(userId)}?${apiScopeQuery()}`, { password });
      if (!res.ok) {
        if (err) err.textContent = res.json?.error || "Zurücksetzen fehlgeschlagen.";
        return;
      }
      adminDataLoaded = false;
      await ensureViewData("admin");
      showToast("Passwort zurückgesetzt — der Nutzer muss sich neu anmelden.");
    });
  }

  const assignForm = app.querySelector("#assignForm");
  if (assignForm) {
    assignForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const err = app.querySelector("#assignError");
      if (err) err.textContent = "";
      const fd = new FormData(assignForm);
      const body = { userId: fd.get("userId"), politicianId: fd.get("politicianId") };
      if (!body.userId) {
        if (err) err.textContent = "Keine Referent:in vorhanden.";
        return;
      }
      const res = await apiSend("POST", `/api/admin/assignments?${apiScopeQuery()}`, body);
      if (!res.ok) {
        if (err) err.textContent = res.json?.error || "Zuweisung fehlgeschlagen.";
        return;
      }
      adminDataLoaded = false;
      await ensureViewData("admin");
      showToast("Zugewiesen");
    });
  }

  app.querySelectorAll("[data-remove-assignment]").forEach((button) => {
    button.addEventListener("click", async () => {
      const body = { userId: button.dataset.user, politicianId: button.dataset.mandate };
      const res = await apiSend("DELETE", `/api/admin/assignments?${apiScopeQuery()}`, body);
      if (res.ok) {
        adminDataLoaded = false;
        await ensureViewData("admin");
      }
    });
  });
}

function bindActions() {
  app.querySelectorAll("[data-admin-period]").forEach((button) => {
    button.addEventListener("click", () => {
      adminPeriod = button.dataset.adminPeriod;
      render();
      bindActions();
    });
  });

  app.querySelectorAll("[data-reload-admin]").forEach((button) => {
    button.addEventListener("click", () => {
      adminDataLoaded = false;
      adminLoadError = false;
      render();
      ensureViewData("admin");
    });
  });

  if (isAccountMode()) {
    try {
      bindAccountActions();
      bindOnboarding();
    } catch (error) {
      console.warn("Account actions binding failed", error);
    }
  }
  app.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view;
      persistView(currentView);
      navOpen = false;
      updatesOpen = false;
      if (currentView === "office" || currentView === "office-detail" || currentView === "tasks") markOfficeSeen();
      if (currentView === "helmut") { markHelmutSeen(); startHelmutThinking(); }
      else stopHelmutTyping();
      render();
      ensureViewData(currentView);
    });
  });

  app.querySelectorAll("[data-theme-set]").forEach((button) => {
    button.addEventListener("click", () => setThemePref(button.dataset.themeSet));
  });

  app.querySelectorAll("[data-feedback-type]").forEach((button) => {
    button.addEventListener("click", async () => {
      const widget = button.closest("[data-feedback-widget]");
      const body = {
        type: button.dataset.feedbackType,
        area: button.dataset.feedbackArea || "Allgemein",
        topic: button.dataset.feedbackTopic || ""
      };
      if (widget) widget.querySelectorAll(".feedback-chip").forEach((b) => { b.disabled = true; });
      try {
        const res = await apiSend("POST", `/api/feedback?${apiScopeQuery()}`, body);
        if (res.ok) {
          if (widget) widget.innerHTML = `<p class="feedback-widget-thanks">Danke für dein Feedback.</p>`;
          showToast("Danke für dein Feedback");
        } else {
          if (widget) widget.querySelectorAll(".feedback-chip").forEach((b) => { b.disabled = false; });
          showToast("Feedback nicht gespeichert");
        }
      } catch (error) {
        if (widget) widget.querySelectorAll(".feedback-chip").forEach((b) => { b.disabled = false; });
        showToast("Netzwerkfehler");
      }
    });
  });

  app.querySelectorAll("[data-office-format-toggle]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const checked = Array.from(app.querySelectorAll("[data-office-format-toggle]:checked")).map((c) => c.value);
      const formats = checked.length ? checked : ["presse"];
      try {
        const res = await apiSend("PATCH", `/api/profile/current?${apiScopeQuery()}`, { id: activePoliticianId, officeFormats: formats });
        if (res.ok && res.json) profile = res.json;
        render();
        showToast("Büro-Formate gespeichert.");
      } catch (e) {
        showToast("Speichern fehlgeschlagen.");
      }
    });
  });

  app.querySelectorAll("[data-assess-id]").forEach((button) => {
    button.addEventListener("click", () => assessParliamentItem(button.dataset.assessId));
  });

  app.querySelectorAll("[data-collapse]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.collapse;
      if (expandedSections.has(id)) expandedSections.delete(id);
      else expandedSections.add(id);
      render();
    });
  });

  app.querySelectorAll("[data-lage-done]").forEach((button) => {
    button.addEventListener("click", async () => {
      const decision = decisions.find((entry) => entry.id === button.dataset.lageDone);
      if (decision) { decision.status = "done"; decision.feedback = "done"; }
      render();
      showToast("Als erledigt markiert");
      logDecisionInteraction("done", decision);
    });
  });

  app.querySelectorAll("[data-lage-ignore]").forEach((button) => {
    button.addEventListener("click", async () => {
      const decision = decisions.find((entry) => entry.id === button.dataset.lageIgnore);
      if (decision) { decision.status = "ignored"; decision.feedback = "ignored"; }
      render();
      showToast("Wird niedriger gewichtet");
      logDecisionInteraction("ignored", decision);
    });
  });

  app.querySelectorAll("[data-lage-delegate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const decision = decisions.find((entry) => entry.id === button.dataset.lageDelegate);
      if (!decision || previewMode) { if (previewMode) showToast("Vorschau: nicht delegiert"); return; }
      try {
        const res = await fetchWithTimeout(`/api/tasks?${apiScopeQuery()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: decision.title,
            description: compactText(chiefRecommendationText(decision), 220),
            priority: "high",
            assignee: "Büro",
            status: "open"
          })
        });
        if (res.ok) {
          const saved = await res.json();
          if (saved && saved.id) tasks = [saved, ...tasks.filter((t) => t.id !== saved.id)];
        }
        logDecisionInteraction("delegated", decision);
        showToast("An Büro delegiert");
      } catch (error) {
        showToast("Konnte nicht delegiert werden");
      }
    });
  });

  app.querySelectorAll("[data-office-copy-inline]").forEach((button) => {
    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      const text = button.dataset.officeText || "";
      await copyText(text, "Text kopiert.");
    });
  });

  app.querySelectorAll("[data-office-open]").forEach((card) => {
    const open = () => {
      const key = card.dataset.officeOpen;
      const formatId = card.dataset.officeFormat;
      const format = OFFICE_FORMATS.find((f) => f.id === formatId);
      let decision;
      try { decision = JSON.parse(card.dataset.officeDecision || "{}"); } catch (_) { decision = {}; }
      const resolvedFormat = format || { id: formatId, label: formatId, icon: "ti-file", channel: "press" };
      const resolvedMeta = OFFICE_FORMAT_META[formatId] || {};
      const cachedText = officeDrafts[key];
      const text = (isValidDraft(cachedText) ? cachedText : null) || channelFallbackStatement(
        decisions.find((d) => d.id === decision.id || d.signalId === decision.signalId) || decision,
        resolvedFormat.channel || "press"
      );
      selectedOfficeDraft = { decision, format: resolvedFormat, text };
      currentView = "office-detail";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });

  app.querySelectorAll("[data-office-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedOfficeDraft = null;
      currentView = "office";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  app.querySelectorAll("[data-refresh-helmut]").forEach((button) => {
    button.addEventListener("click", () => {
      currentView = "helmut";
      startPipelineRun();
    });
  });

  app.querySelectorAll("[data-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      navOpen = !navOpen;
      updatesOpen = false;
      render();
    });
  });

  app.querySelectorAll("[data-updates]").forEach((button) => {
    button.addEventListener("click", () => {
      const shouldOpen = !updatesOpen;
      updatesOpen = shouldOpen;
      navOpen = false;
      if (shouldOpen) markUpdatesSeen();
      render();
    });
  });

  app.querySelectorAll("[data-close-updates]").forEach((button) => {
    button.addEventListener("click", () => {
      updatesOpen = false;
      render();
    });
  });

  app.querySelectorAll("[data-updates-layer]").forEach((layer) => {
    layer.addEventListener("click", (event) => {
      if (event.target === layer) {
        updatesOpen = false;
        render();
      }
    });
  });

  const stateSelect = app.querySelector("[data-state-select]");
  if (stateSelect) {
    stateSelect.addEventListener("change", () => updateConstituencySelect(stateSelect.value));
  }

  app.querySelectorAll("[data-close-handoff]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTaskHandoffId = "";
      render();
    });
  });

  app.querySelectorAll("[data-handoff-layer]").forEach((layer) => {
    layer.addEventListener("click", (event) => {
      if (event.target === layer) {
        selectedTaskHandoffId = "";
        render();
      }
    });
  });

  app.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDecisionId = button.dataset.detail;
      detailOriginView = currentView === "detail" ? detailOriginView : currentView;
      currentView = "detail";
      navOpen = false;
      updatesOpen = false;
      const decision = selectedDecision();
      logDecisionInteraction("detail_opened", decision);
      render();
    });
  });

  app.querySelectorAll("[data-communication]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDecisionId = button.dataset.communication;
      selectedCommunicationChannel = recommendedInitialChannel(selectedDecision());
      communicationContextTitle = "";
      generatedStatement = selectedDecision().statement;
      currentView = "communication";
      render();
    });
  });

  app.querySelectorAll("[data-quick-communication]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDecisionId = button.dataset.quickCommunication;
      selectedCommunicationChannel = button.dataset.quickChannel || recommendedInitialChannel(selectedDecision());
      communicationContextTitle = "";
      generatedStatement = channelFallbackStatement(selectedDecision(), selectedCommunicationChannel);
      currentView = "communication";
      render();
    });
  });

  app.querySelectorAll("[data-channel]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCommunicationChannel = button.dataset.channel || "press";
      generatedStatement = channelFallbackStatement(selectedDecision(), selectedCommunicationChannel);
      render();
    });
  });

  app.querySelectorAll("[data-use-variant]").forEach((button) => {
    button.addEventListener("click", () => {
      generatedStatement = button.dataset.variantText || generatedStatement;
      showToast(`${button.dataset.useVariant || "Variante"} übernommen`);
      render();
    });
  });

  app.querySelectorAll("[data-meeting-brief], [data-meeting-speech], [data-meeting-questions], [data-meeting-line]").forEach((button) => {
    button.addEventListener("click", () => {
      const meetingId = button.dataset.meetingBrief || button.dataset.meetingSpeech || button.dataset.meetingQuestions || button.dataset.meetingLine;
      const meeting = meetingPreparations().find((entry) => entry.id === meetingId);
      if (!meeting) return;
      selectedDecisionId = decisions[0]?.id || "";
      communicationContextTitle = meeting.terminTitel;
      selectedCommunicationChannel = button.dataset.meetingSpeech || button.dataset.meetingLine ? "internal_line" : button.dataset.meetingQuestions ? "committee_question" : "press";
      generatedStatement = meetingDraftText(meeting, button.dataset.meetingSpeech ? "speech" : button.dataset.meetingQuestions ? "questions" : button.dataset.meetingLine ? "line" : "briefing");
      currentView = "communication";
      render();
    });
  });

  app.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = app.querySelector(`[data-copy-source="${button.dataset.copy}"]`);
      copyText(source?.textContent?.trim() || "", "Text bereit");
      logDecisionInteraction("communication_copied", selectedDecision());
    });
  });

  app.querySelectorAll("[data-task-copy]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = tasks.find((entry) => entry.id === button.dataset.taskCopy);
      if (!task) return;
      selectedTaskHandoffId = task.id;
      render();
    });
  });

  app.querySelectorAll("[data-task-mail]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = tasks.find((entry) => entry.id === button.dataset.taskMail);
      const decision = decisions.find((entry) => entry.signalId === task?.sourceSignalId || entry.taskTemplate?.id === task?.id);
      logDecisionInteraction("task_mail_opened", decision, { taskId: task?.id });
      window.setTimeout(() => {
        selectedTaskHandoffId = "";
        render();
      }, 250);
    });
  });

  app.querySelectorAll("[data-task-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = tasks.find((entry) => entry.id === button.dataset.taskShare);
      if (!task) return;
      const method = button.dataset.taskShareMethod || "share";
      await shareTaskViaMethod(task, method);
      const decision = decisions.find((entry) => entry.signalId === task.sourceSignalId || entry.taskTemplate?.id === task.id);
      logDecisionInteraction(`task_${method}_shared`, decision, { taskId: task.id });
      selectedTaskHandoffId = "";
      render();
    });
  });

  app.querySelectorAll("[data-task-copy-text]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = tasks.find((entry) => entry.id === button.dataset.taskCopyText);
      if (!task) return;
      copyText(taskShareText(task), "Auftrag bereit");
      const decision = decisions.find((entry) => entry.signalId === task.sourceSignalId || entry.taskTemplate?.id === task.id);
      logDecisionInteraction("task_copied", decision, { taskId: task.id });
      selectedTaskHandoffId = "";
      render();
    });
  });

  app.querySelectorAll("[data-feedback]").forEach((button) => {
    button.addEventListener("click", async () => {
      const decision = decisions.find((entry) => entry.id === button.dataset.feedbackId);
      const type = button.dataset.feedback === "ignored" ? "ignored"
        : button.dataset.feedback === "later" ? "snoozed"
          : button.dataset.feedback === "done" ? "done"
          : "marked_relevant";
      await logDecisionInteraction(type, decision);
      if (decision) {
        decision.feedback = type;
        decision.status = type === "ignored" ? "ignored" : type === "snoozed" ? "snoozed" : type === "done" ? "done" : "relevant";
      }
      button.closest(".learning-actions")?.querySelectorAll("[data-feedback]").forEach((entry) => entry.classList.remove("is-active"));
      button.classList.add("is-active");
      showToast(type === "ignored" ? "Wird niedriger gewichtet" : type === "snoozed" ? "Für später gemerkt" : type === "done" ? "Als erledigt gelernt" : "Als relevant gemerkt");
    });
  });

  app.querySelectorAll(".helmut-detail").forEach((detail) => {
    detail.addEventListener("toggle", () => {
      if (detail.open) {
        app.querySelectorAll(".helmut-detail").forEach((other) => {
          if (other !== detail) other.removeAttribute("open");
        });
      }
    });
  });

  app.querySelectorAll("[data-run-crawl]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (previewMode) {
        showToast("Vorschau: kein Quellenlauf gestartet");
        return;
      }
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Prüft...";
      try {
        const response = await fetchWithTimeout(`/api/pipeline/run?${apiScopeQuery()}`);
        if (!response.ok) throw new Error(`Pilot check failed: ${response.status}`);
        const result = await response.json();
        showToast(result.skippedReason ? "Letzter Lauf wird genutzt" : "Helmut ist aktualisiert");
        await loadBriefing();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.textContent = originalText;
        showToast("Prüfung konnte nicht gestartet werden");
        render();
      }
    });
  });

  app.querySelectorAll("[data-radar-search]").forEach((button) => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Suche wird geprüft";
      try {
        const response = await fetchWithTimeout(`/api/pipeline/run?${apiScopeQuery()}`);
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        const result = await response.json();
        button.textContent = result.skippedReason ? "Keine neue Erwähnung gefunden." : "Suche aktualisiert.";
        window.setTimeout(() => { button.disabled = false; button.textContent = originalText; }, 2600);
        await loadBriefing();
      } catch {
        button.textContent = "Suche wird beim nächsten Quellenlauf aktualisiert.";
        window.setTimeout(() => { button.disabled = false; button.textContent = originalText; }, 2600);
      }
    });
  });

  app.querySelectorAll("[data-run-lage-check]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (previewMode) {
        showToast("Vorschau: kein Lage-Check gestartet");
        return;
      }
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Prüft...";
      try {
        const response = await fetchWithTimeout(`/api/lage/check?${apiScopeQuery()}`);
        if (!response.ok) throw new Error(`Lage check failed: ${response.status}`);
        const result = await response.json();
        showToast(result.skippedReason ? "Letzter Lage-Check wird genutzt" : result.status === "changed" ? "Neue Lage erkannt" : "Priorität stabil");
        await loadBriefing();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.textContent = originalText;
        showToast("Lage-Check konnte nicht gestartet werden");
        render();
      }
    });
  });

  app.querySelectorAll("[data-privacy-export]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = "Exportiert...";
      try {
        await exportPrivacyData();
        showToast("Export erstellt");
      } catch (error) {
        console.error(error);
        showToast("Export konnte nicht erstellt werden");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });

  app.querySelectorAll("[data-privacy-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmation = window.prompt("Zum Löschen dieses Profils DELETE eingeben.");
      if (confirmation !== "DELETE") return;
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = "Löscht...";
      try {
        await deletePrivacyData();
        showToast("Daten gelöscht");
        window.location.reload();
      } catch (error) {
        console.error(error);
        showToast("Daten konnten nicht gelöscht werden");
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });

  app.querySelectorAll("[data-enable-push]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      el.disabled = true;
      try {
        await enablePushNotifications();
      } catch (error) {
        console.error(error);
        showToast("Push konnte nicht aktiviert werden");
      } finally {
        el.disabled = false;
        render();
      }
    });
  });

  app.querySelectorAll("[data-test-push]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = "Sendet...";
      try {
        await sendTestPush();
      } catch (error) {
        console.error(error);
        showToast("Test-Push nicht gesendet");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });

  app.querySelectorAll("[data-notif-toggle]").forEach((el) => {
    el.addEventListener("change", async () => {
      const category = el.dataset.notifToggle;
      const enabled = el.checked;
      try {
        const res = await apiSend("PATCH", `/api/user/notification-settings?${apiScopeQuery()}`, { [category]: enabled });
        if (res.ok) {
          if (currentUser) {
            currentUser.notificationSettings = { ...(currentUser.notificationSettings || {}), [category]: enabled };
          }
          showToast("Gespeichert");
        } else {
          el.checked = !enabled;
          showToast("Fehler beim Speichern");
        }
      } catch {
        el.checked = !enabled;
        showToast("Fehler beim Speichern");
      }
    });
  });

  app.querySelectorAll("[data-generate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const input = `Erstelle ${communicationChannelLabel(selectedCommunicationChannel)} zu ${selectedDecision().title}.`;
      button.disabled = true;
      button.textContent = "Erstellt...";
      try {
        const result = await generateStatementWithBackend(input, selectedDecision(), selectedCommunicationChannel);
        generatedStatement = result.text;
        showToast(result.aiEnabled ? `${result.channelLabel || "Text"} erstellt` : "Regelbasiert erstellt");
      } catch (error) {
        console.error(error);
        generatedStatement = generateStatement(input, selectedDecision(), selectedCommunicationChannel);
        showToast("Fallback erstellt");
      }
      render();
    });
  });

  app.querySelectorAll("[data-shorten]").forEach((button) => {
    button.addEventListener("click", () => {
      generatedStatement = shortenStatement(generatedStatement || selectedDecision().statement);
      render();
    });
  });

  app.querySelectorAll("[data-warmer]").forEach((button) => {
    button.addEventListener("click", () => {
      generatedStatement = `${selectedDecision().statement} Entscheidend ist, dass Politik hier nicht zuschaut, sondern gute Arbeit konkret durchsetzt.`;
      render();
    });
  });

  const profileForm = app.querySelector("#profileForm");
  if (profileForm) {
    profileForm.querySelectorAll(".priority-row input").forEach((input) => {
      input.addEventListener("input", () => {
        const value = input.closest(".priority-row")?.querySelector("b");
        if (value) value.textContent = input.value;
      });
    });
    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveProfileFromForm(profileForm);
    });
  }

  const noteForm = app.querySelector("#noteForm");
  if (noteForm) {
    noteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (previewMode) {
        showToast("Vorschau: Notiz nicht gespeichert");
        return;
      }
      const text = new FormData(noteForm).get("text");
      if (!String(text || "").trim()) return;
      try {
        const response = await fetchWithTimeout(`/api/notes?${apiScopeQuery()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            type: "note",
            recommendation_id: selectedDecision()?.id || "",
            political_item_id: selectedDecision()?.topic || ""
          })
        });
        if (!response.ok) throw new Error("Note save failed");
        notes.unshift(await response.json());
        await logDecisionInteraction("note_created", selectedDecision(), { noteLength: String(text || "").length });
        showToast("Notiz gespeichert");
        render();
      } catch (error) {
        console.error(error);
        showToast("Notiz konnte nicht gespeichert werden");
      }
    });
  }
}

function startHelmutThinking() {
  if (!shouldStartHelmutFlow()) {
    helmutThinking = false;
    stopHelmutTyping();
    render();
    return;
  }
  markHelmutFlowStarted();
  helmutThinking = true;
  stopHelmutTyping();
  if (helmutThinkingTimer) window.clearTimeout(helmutThinkingTimer);
  helmutThinkingTimer = window.setTimeout(() => {
    helmutThinking = false;
    helmutThinkingTimer = null;
    if (currentView === "helmut") startHelmutTyping();
  }, 1400);
}

const PIPELINE_STEPS = [
  "Quellen werden gecrawlt",
  "Artikel werden gefiltert",
  "Relevanz wird bewertet",
  "Briefing wird generiert",
  "Einschätzung wird verfasst",
];
const PIPELINE_STEP_MS = 18000;

function pipelineCooldownRemaining() {
  try {
    const last = Number(window.localStorage.getItem(pipelineCooldownKey) || 0);
    return last ? Math.max(0, pipelineCooldownMs - (Date.now() - last)) : 0;
  } catch { return 0; }
}

function markPipelineRun() {
  try { window.localStorage.setItem(pipelineCooldownKey, String(Date.now())); } catch {}
}

function startPipelineRun() {
  if (pipelineRunning || pipelineCooldownRemaining() > 0) return;
  pipelineRunning = true;
  pipelineRunStep = 0;
  helmutThinking = true;
  markPipelineRun();
  stopHelmutTyping();
  render();
  schedulePipelineStep();
  executePipelineRun();
}

function schedulePipelineStep() {
  if (pipelineStepTimer) window.clearTimeout(pipelineStepTimer);
  pipelineStepTimer = window.setTimeout(() => {
    if (!pipelineRunning) return;
    pipelineRunStep = Math.min(pipelineRunStep + 1, PIPELINE_STEPS.length - 1);
    render();
    if (pipelineRunStep < PIPELINE_STEPS.length - 1) schedulePipelineStep();
  }, PIPELINE_STEP_MS);
}

async function executePipelineRun() {
  try {
    const response = await fetchWithTimeout(`/api/pipeline/run?${apiScopeQuery()}`, {}, 90000);
    const result = response.ok ? await response.json() : null;
    finishPipelineRun(result?.skippedReason ? "Letzter Lauf wird genutzt" : "Helmut ist aktualisiert");
  } catch {
    finishPipelineRun("Wird fertiggestellt — lädt gleich neu");
    window.setTimeout(async () => { await loadBriefing(); render(); }, 20000);
  }
}

async function finishPipelineRun(toastMsg) {
  pipelineRunning = false;
  pipelineRunStep = 0;
  if (pipelineStepTimer) { window.clearTimeout(pipelineStepTimer); pipelineStepTimer = null; }
  showToast(toastMsg);
  await loadBriefing();
  helmutThinking = false;
  render();
}

function shouldStartHelmutFlow() {
  try {
    const lastStartedAt = Number(window.localStorage.getItem(helmutFlowCooldownKey()) || 0);
    return !lastStartedAt || Date.now() - lastStartedAt > helmutFlowCooldownMs;
  } catch {
    return true;
  }
}

function markHelmutFlowStarted() {
  try {
    window.localStorage.setItem(helmutFlowCooldownKey(), String(Date.now()));
  } catch (error) {
    console.warn("Helmut flow cooldown not saved", error);
  }
}

function helmutFlowCooldownKey() {
  return `${helmutFlowCooldownPrefix}:${activePoliticianId}:${previewMode ? "preview" : "live"}`;
}

function startHelmutTyping() {
  const assessment = buildHelmutAssessment();
  const fullText = assessment.typingText || assessmentTypingText(assessment);
  helmutTypingActive = true;
  helmutTypedText = "";
  helmutTypingFullText = fullText;
  if (helmutTypingTimer) window.clearInterval(helmutTypingTimer);
  render();
  helmutTypingTimer = window.setInterval(() => {
    if (currentView !== "helmut") {
      stopHelmutTyping();
      return;
    }
    const nextLength = Math.min(helmutTypingFullText.length, helmutTypedText.length + 10);
    helmutTypedText = helmutTypingFullText.slice(0, nextLength);
    if (nextLength >= helmutTypingFullText.length) {
      window.clearInterval(helmutTypingTimer);
      helmutTypingTimer = null;
      window.setTimeout(() => {
        helmutTypingActive = false;
        if (currentView === "helmut") render();
      }, 450);
    }
    render();
  }, 34);
}

function stopHelmutTyping() {
  helmutTypingActive = false;
  helmutTypedText = "";
  helmutTypingFullText = "";
  if (helmutTypingTimer) {
    window.clearInterval(helmutTypingTimer);
    helmutTypingTimer = null;
  }
}

async function saveProfileFromForm(form) {
  if (previewMode) {
    showToast("Vorschau: Profil nicht gespeichert");
    return;
  }
  const data = new FormData(form);
  const topicPriorities = {};
  data.forEach((value, key) => {
    if (!key.startsWith("topicPriority:")) return;
    const topic = key.replace("topicPriority:", "");
    topicPriorities[topic] = Math.max(1, Math.min(5, Number(value) || 1));
  });
  const selectedCommittees = data.getAll("committees").map((entry) => String(entry).trim()).filter(Boolean);
  const payload = {
    fullName: data.get("fullName"),
    party: data.get("party"),
    faction: data.get("faction"),
    function: data.get("function"),
    committee: selectedCommittees[0] || profile.committee,
    committees: selectedCommittees.length ? selectedCommittees : profile.committees,
    constituency: data.get("constituency"),
    state: data.get("state"),
    location: data.get("location"),
    mainQuestion: data.get("mainQuestion"),
    communicationStyle: data.get("communicationStyle"),
    focusTopics: Object.entries(topicPriorities).filter(([, priority]) => priority >= 3).map(([topic]) => topic),
    topicPriorities,
    monitoringTargets: profile.monitoringTargets,
    relevantMinistries: profile.relevantMinistries,
    regionalInterests: [data.get("state"), data.get("constituency"), data.get("location")].filter(Boolean),
    currentCampaigns: lines(data.get("currentCampaigns")),
    publicPositions: lines(data.get("publicPositions")),
    keyAudiences: lines(data.get("keyAudiences")),
    riskTopics: lines(data.get("riskTopics")),
    opportunityTopics: lines(data.get("opportunityTopics")),
    preferredChannels: lines(data.get("preferredChannels")),
    officeHandoffMethod: normalizeOfficeHandoffMethod(data.get("officeHandoffMethod")),
    upcomingAppointments: lines(data.get("upcomingAppointments")),
    noGoTopics: lines(data.get("noGoTopics"))
  };

  try {
    const response = await fetchWithTimeout(`/api/profile/current?${apiScopeQuery()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, id: activePoliticianId })
    });
    if (!response.ok) throw new Error("Profile save failed");
    profile = await response.json();
    currentView = "settings";
    showToast("Profil gespeichert");
    render();
  } catch (error) {
    console.error(error);
    showToast("Profil konnte nicht gespeichert werden");
  }
}

async function exportPrivacyData() {
  const response = await fetchWithTimeout(`/api/privacy/export?${apiScopeQuery()}`);
  if (!response.ok) throw new Error(`Privacy export failed: ${response.status}`);
  const payload = await response.json();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `helmut-datenauskunft-${activePoliticianId}-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function deletePrivacyData() {
  const response = await fetchWithTimeout(`/api/privacy/delete?${apiScopeQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "DELETE" })
  });
  if (!response.ok) throw new Error(`Privacy delete failed: ${response.status}`);
  return response.json();
}

function lines(value) {
  return String(value || "").split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
}

function generateStatement(input, decision, channel = selectedCommunicationChannel) {
  return channelFallbackStatement(decision, channel);
}

function isValidDraft(text) {
  return Boolean(text) && !String(text).includes("kein belastbarer Kommunikationsvorschlag");
}

async function generateStatementWithBackend(input, decision, channel = selectedCommunicationChannel) {
  const response = await fetchWithTimeout(`/api/communication/generate?${apiScopeQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input,
      channel,
      decision
    })
  });
  if (!response.ok) throw new Error(`Communication API failed: ${response.status}`);
  const result = await response.json();
  return {
    aiEnabled: Boolean(result.aiEnabled),
    channelLabel: result.channelLabel,
    text: result.text || generateStatement(input, decision, channel)
  };
}

function recommendedInitialChannel(decision) {
  const text = `${decision?.recommendedChannel || ""} ${decision?.actionType || ""} ${decision?.action_type || ""}`.toLowerCase();
  if (text.includes("linkedin")) return "linkedin";
  if (text.includes("instagram")) return "instagram";
  if (text.includes("social") || text.includes("x ") || text.includes("twitter")) return "x";
  if (text.includes("ausschuss")) return "committee_question";
  if (text.includes("presse")) return "press";
  return "press";
}

function communicationChannelLabel(channel) {
  return Object.fromEntries(communicationChannels)[channel] || "Presse";
}

function communicationChannelHint(channel) {
  return ({
    press: "Zitierfähig, länger, für Presse oder Website.",
    linkedin: "Fachlich, sichtbar, mit politischem Gewinn.",
    x: "Kurz, pointiert, ohne Thread.",
    instagram: "Nahbarer, weniger Fachsprache.",
    committee_question: "Präzise Kontrollfragen für den Ausschuss.",
    citizen_dialogue: "Verständlich für Bürgerinnen und Bürger.",
    internal_line: "Kurze Linie für Büro und Team."
  })[channel] || "Kanal passend zur Empfehlung.";
}

function channelFallbackStatement(decision, channel) {
  const base = String(decision.statement || decision.suggestedStatement || "Dazu liegt aktuell kein belastbarer Kommunikationsvorschlag vor.").trim();
  const action = String(decision.action || decision.recommendedAction || decision.recommended_action || "").trim();
  const topic = decision.title || decision.topic || "dieses Thema";
  if (channel === "x") return shortenStatement(`${base} ${action}`.trim()).slice(0, 240);
  if (channel === "committee_question") {
    return [
      `Welche konkreten Schritte plant die Bundesregierung bei ${topic}?`,
      "Wie werden Kontrolle, soziale Wirkung und Umsetzung abgesichert?",
      "Wann liegen belastbare Zahlen und ein Zeitplan vor?"
    ].join("\n");
  }
  if (channel === "internal_line") {
    return [
      `- Thema: ${topic}`,
      `- Linie: ${base}`,
      `- Nächster Schritt: ${action || "Position fachlich vorbereiten."}`,
      "- Quellenbasis prüfen.",
      "- Freigabe für öffentliche Kommunikation vorbereiten."
    ].join("\n");
  }
  if (channel === "citizen_dialogue") return `${base} Mir ist wichtig, dass Politik hier konkret im Alltag wirkt: bei guter Arbeit, sozialer Sicherheit und fairen Chancen.`;
  if (channel === "instagram") return `${base}\n\nPolitik muss konkret besser machen, was Menschen jeden Tag betrifft.`;
  if (channel === "linkedin") return `${base}\n\nEntscheidend ist die konkrete Wirkung: bessere Arbeitsbedingungen, soziale Sicherheit und eine Umsetzung, die kontrollierbar ist.`;
  return `${base} ${action}`.trim();
}

function shortenStatement(value) {
  return String(value).split(".").filter(Boolean).slice(0, 2).map((part) => `${part.trim()}.`).join(" ");
}

function priorityLabelForDecision(item) {
  if (item.decision === "Ignorieren") return "Ignorieren";
  if (item.decision === "Beobachten") return "Intern vorbereiten";
  if (item.classification === "risk" || item.riskLevel === "Hoch") return "Risiko";
  if (item.classification === "opportunity" && (item.finalScore >= 70 || item.priority >= 70)) return "Chance";
  return "Öffentlich reagieren";
}

function priorityTypeForDecision(item) {
  if (item.decision === "Ignorieren") return "ignore";
  if (item.decision === "Beobachten") return "watch";
  if (item.classification === "risk" || item.riskLevel === "Hoch") return "risk";
  if (item.classification === "opportunity" && (item.finalScore >= 70 || item.priority >= 70)) return "chance";
  return "action";
}

function twoSentenceSummary(value) {
  const sentences = String(value || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(" ");
}

function headlineClass(value) {
  const length = String(value || "").length;
  if (length >= 24) return "fit-title fit-title-xl";
  if (length >= 18) return "fit-title fit-title-lg";
  return "fit-title";
}

function getTaskMetrics() {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  return {
    openCount: tasks.filter((task) => task.status === "open").length,
    criticalCount: tasks.filter((task) => task.status !== "done" && task.priority === "high").length,
    dueByNoonCount: tasks.filter((task) => task.status !== "done" && new Date(task.dueDate) <= noon).length
  };
}

function freshMentionCount() {
  return profileMentions().filter(isFreshUpdate).length;
}

function openOfficeTaskCount() {
  return Object.keys(officeDrafts).length;
}

function actionableOfficeTaskCount() {
  const draftCount = Object.keys(officeDrafts).length;
  if (!draftCount) return 0;
  const seenAt = getSeenOfficeTimestamp();
  const briefingTs = new Date(briefing?.generatedAt || briefing?.date || 0).getTime();
  return briefingTs > seenAt ? draftCount : 0;
}

function markOfficeSeen() {
  try {
    window.localStorage.setItem(officeSeenStorageKeyForProfile(), String(Date.now()));
  } catch (error) {
    console.warn("Office seen state not saved", error);
  }
}

function getSeenOfficeTimestamp() {
  try {
    return Number(window.localStorage.getItem(officeSeenStorageKeyForProfile()) || 0);
  } catch {
    return 0;
  }
}

function officeSeenStorageKeyForProfile() {
  return `${officeSeenStorageKey}:${activePoliticianId}`;
}

function helmutSeenStorageKeyForProfile() {
  return `${helmutSeenStorageKey}:${activePoliticianId}`;
}

function helmutAssessmentTimestamp() {
  const ts = briefing?.helmutAssessment?.generatedAt || briefing?.helmutAssessment?.time;
  if (!ts) return 0;
  const parsed = new Date(ts).getTime();
  if (!Number.isNaN(parsed) && parsed > 1000000000000) return parsed;
  return briefing?.generatedAt ? new Date(briefing.generatedAt).getTime() : 0;
}

function getSeenHelmutTimestamp() {
  try {
    return Number(window.localStorage.getItem(helmutSeenStorageKeyForProfile()) || 0);
  } catch {
    return 0;
  }
}

function hasNewHelmutAssessment() {
  const ts = helmutAssessmentTimestamp();
  if (!ts) return false;
  return ts > getSeenHelmutTimestamp();
}

function markHelmutSeen() {
  try {
    window.localStorage.setItem(helmutSeenStorageKeyForProfile(), String(helmutAssessmentTimestamp() || Date.now()));
  } catch (error) {
    console.warn("Helmut seen state not saved", error);
  }
}

function hasUnreadUpdates() {
  const latest = latestUpdateTimestamp();
  if (!latest) return false;
  return latest > getSeenUpdateTimestamp();
}

function latestUpdateTimestamp() {
  const timestamps = [];
  (briefing?.personMentions || []).forEach((item) => {
    if (isFreshUpdate(item)) timestamps.push(itemTimestamp(item));
  });
  if (briefing?.status === "Aktuell" && Number(briefing?.newSignals || 0) > 0) {
    timestamps.push(itemTimestamp({ publishedAt: briefing.generatedAt || briefing.date }));
  }
  return Math.max(0, ...timestamps.filter(Boolean));
}

function itemTimestamp(item) {
  const date = new Date(item?.retrievedAt || item?.createdAt || item?.created_at || item?.updatedAt || item?.updated_at || item?.publishedAt || "");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getSeenUpdateTimestamp() {
  try {
    return Number(window.localStorage.getItem(updateSeenStorageKey) || 0);
  } catch {
    return 0;
  }
}

function markUpdatesSeen() {
  if (previewMode) return;
  const latest = latestUpdateTimestamp();
  if (!latest) return;
  try {
    window.localStorage.setItem(updateSeenStorageKey, String(latest));
  } catch {
    // localStorage can be unavailable in private or restricted browser modes.
  }
}

function isFreshUpdate(item) {
  const timestamp = itemTimestamp(item);
  if (!timestamp) return false;
  return Date.now() - timestamp <= 24 * 60 * 60 * 1000;
}

function notificationItems() {
  const preparedNotifications = (briefing?.notifications || []).slice(0, 5).map((item) => ({
    type: notificationTone(item.type),
    label: notificationTypeLabel(item.type),
    title: item.title,
    summary: item.message,
    meta: priorityNotificationLabel(item.priority),
    receivedAt: item.createdAt,
    decisionId: item.relatedItemId
  }));

  const mentionItems = (briefing?.personMentions || []).filter(isFreshUpdate).slice(0, 4).map((item) => ({
    type: "mention",
    label: "Neue Erwähnung",
    title: item.title || "Erwähnung",
    summary: twoSentenceSummary(item.content || item.excerpt || "Neue namentliche Erwähnung gefunden."),
    meta: `${item.sourceName || "Quelle"} · ${formatBriefingDate(item.publishedAt || item.retrievedAt)}`,
    receivedAt: item.retrievedAt || item.createdAt || item.created_at || item.updatedAt || item.updated_at || item.publishedAt,
    href: sourceHref(item)
  }));

  const decisionItems = briefing?.status === "Aktuell"
    ? decisions.slice(0, 3).map((decision) => ({
      type: decision.priorityType,
      label: decision.priorityLabel,
      title: decision.title,
      summary: decision.summary,
      meta: sourceLine(decision),
      receivedAt: decision.created_at || decision.createdAt || decision.updated_at || decision.updatedAt || briefing.generatedAt || briefing.date,
      decisionId: decision.id
    }))
    : [];

  return [...preparedNotifications, ...mentionItems, ...decisionItems]
    .filter((item, index, items) => items.findIndex((entry) => `${entry.label}-${entry.title}` === `${item.label}-${item.title}`) === index)
    .slice(0, 5);
}

function notificationTone(type) {
  if (["risk_detected", "reaction_recommended", "meeting_starts_soon", "office_handoff_recommended"].includes(type)) return "risk";
  if (["opportunity_detected", "meeting_prep_ready"].includes(type)) return "chance";
  return "watch";
}

function notificationTypeLabel(type) {
  return ({
    daily_briefing_ready: "Tagesbriefing",
    reaction_recommended: "Reaktion empfohlen",
    meeting_prep_ready: "Terminvorbereitung",
    meeting_starts_soon: "Termin bald",
    opportunity_detected: "Chance erkannt",
    risk_detected: "Risiko erkannt",
    office_handoff_recommended: "Büro-Übergabe"
  })[type] || "Update";
}

function priorityNotificationLabel(priority) {
  return ({ high: "Hohe Priorität", medium: "Mittlere Priorität", low: "Niedrige Priorität" })[priority] || "Priorität";
}

function taskShareText(task) {
  const articleSource = taskArticleSource(task);
  const sourceUrl = articleSource?.url || "";
  const sourceName = articleSource?.source?.sourceName || task.primarySource?.sourceName || "";
  const assignee = task.assignee || recommendedTaskAssignee(task);
  const questions = taskBriefQuestions(task);
  const sourceLines = sourceName || sourceUrl
    ? [
      "",
      "Quelle:",
      sourceName || "",
      sourceUrl ? `Direkter Artikel: ${sourceUrl}` : "Direkter Artikellink liegt in Helmut noch nicht belastbar vor."
    ]
    : [];
  return trimEmailLines([
    "Hallo zusammen,",
    "",
    `bitte prüft mir bis ${formatDueDate(task.dueDate)} kurz folgende Lage:`,
    "",
    `Thema: ${shortTaskTitle(task)}`,
    `Zuständig: ${assignee}`,
    "",
    "Bitte klären:",
    ...questions.map((question) => `- ${question}`),
    "",
    "Bitte als kurze Rückmeldung:",
    "- Müssen wir reagieren?",
    "- Wenn ja: mit welcher Linie?",
    "- Wenn nein: was beobachten wir weiter?",
    "",
    `Ziel: ${teamBenefitText(task)}`,
    "",
    task.riskIfIgnored ? `Warum wichtig: ${toTeamRiskText(task.riskIfIgnored)}` : "",
    ...sourceLines,
    "",
    "Danke"
  ]).join("\n");
}

function activeOfficeFormats() {
  const saved = Array.isArray(profile?.officeFormats) ? profile.officeFormats : ["presse", "linkedin"];
  return OFFICE_FORMATS.filter((f) => saved.includes(f.id));
}

function officeDraftCacheKey() {
  const date = (briefing?.generatedAt || briefing?.date || "").slice(0, 10);
  return `helmut:officeDrafts:${activePoliticianId}:${date}`;
}

function officeDraftKey(decision, format) {
  return `${decision.id || decision.signalId || "0"}-${format.id}`;
}

async function generateOfficeDraftsInBackground() {
  if (officeDraftsGenerating) return;
  const formats = activeOfficeFormats();
  const topDecisions = (decisions || []).filter((d) => d.decision !== "Ignorieren" && d.title).slice(0, 2);
  if (!formats.length || !topDecisions.length) return;

  const cacheKey = officeDraftCacheKey();
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && typeof cached === "object" && Object.keys(cached).length > 0) {
      officeDrafts = cached;
      render();
      return;
    }
  } catch (_) { /* ignore parse error */ }

  officeDraftsGenerating = true;
  render();

  for (const decision of topDecisions) {
    for (const format of formats) {
      const key = officeDraftKey(decision, format);
      if (officeDrafts[key]) continue;
      try {
        const result = await generateStatementWithBackend(
          `Bereite einen ${format.label}-Entwurf vor zum Thema: ${decision.title}`,
          decision,
          format.channel || "press"
        );
        officeDrafts[key] = result.text;
        render();
      } catch (_) { /* keep fallback — no error shown */ }
    }
  }

  officeDraftsGenerating = false;
  render();
  try { localStorage.setItem(cacheKey, JSON.stringify(officeDrafts)); } catch (_) {}
}

function preferredOfficeHandoffMethod() {
  return normalizeOfficeHandoffMethod(profile?.officeHandoffMethod);
}

function normalizeOfficeHandoffMethod(value, fallback = "share") {
  const normalized = String(value || "").trim().toLowerCase();
  if (officeHandoffMethods.some(([method]) => method === normalized)) return normalized;
  const fallbackValue = String(fallback || "").trim().toLowerCase();
  return officeHandoffMethods.some(([method]) => method === fallbackValue) ? fallbackValue : "share";
}

function officeHandoffMethodLabel(method) {
  return officeHandoffMethods.find(([value]) => value === normalizeOfficeHandoffMethod(method))?.[1] || "Teilen";
}

async function shareTaskViaMethod(task, method = "share") {
  const normalizedMethod = officeHandoffMethods.some(([value]) => value === method) ? method : "share";
  if (normalizedMethod === "whatsapp") {
    await openExternalShareUrl(`https://wa.me/?text=${encodeURIComponent(taskShareText(task))}`, task, "WhatsApp geöffnet. Falls nicht: Auftrag wurde kopiert.");
    return;
  }
  if (normalizedMethod === "telegram") {
    const source = taskArticleSource(task);
    const sourceUrl = source?.url || "";
    await openExternalShareUrl(`https://t.me/share/url?url=${encodeURIComponent(sourceUrl)}&text=${encodeURIComponent(taskShareText(task))}`, task, "Telegram geöffnet. Falls nicht: Auftrag wurde kopiert.");
    return;
  }
  await shareTaskNative(task, normalizedMethod);
}

async function openExternalShareUrl(url, task, message) {
  window.open(url, "_blank", "noopener,noreferrer");
  await copyText(taskShareText(task), "Auftrag bereit");
  showToast(message);
}

async function shareTaskNative(task, method = "share") {
  const title = `Büroauftrag: ${shortTaskTitle(task)}`;
  const text = taskShareText(task);
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      showToast("Teilen geöffnet");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyText(text, "Auftrag bereit");
  showToast("Auftrag kopiert. In der gewünschten App einfügen.");
}

function taskMailtoHref(task) {
  if (!isActionableOfficeTask(task)) return "";
  const subject = `Bürobitte: ${shortTaskTitle(task)}`;
  const body = taskShareText(task);
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function taskArticleSource(task) {
  const sources = [task.primarySource, ...(task.sources || [])].filter(Boolean);
  for (const source of sources) {
    const url = directArticleHref(source);
    if (url) return { source, url };
  }
  return null;
}

function directArticleHref(source) {
  const candidates = [source?.itemUrl, source?.url].filter(Boolean);
  return candidates.find((url) => isDirectArticleHref(url, source)) || "";
}

function teamBenefitText(task) {
  const benefit = String(task.politicalBenefit || "").trim();
  if (!benefit) return "Wir brauchen eine schnelle Einschätzung, ob Cem dazu heute sprechfähig sein sollte.";
  return benefit
    .replace(/^Du kannst\b/i, "Wir können")
    .replace(/^Du hältst\b/i, "Wir halten")
    .replace(/\bdeine\b/gi, "unsere")
    .replace(/\bdu\b/gi, "wir")
    .replace(/\bdich\b/gi, "uns")
    .replace(/\bdir\b/gi, "uns");
}

function toTeamRiskText(value) {
  return String(value || "")
    .replace(/^Wenn du nicht reagierst,?\s*/i, "Wenn wir keine Linie vorbereiten, ")
    .replace(/^Wenn du nicht reagierst\b/i, "Wenn wir keine Linie vorbereiten")
    .replace(/\bdu\b/gi, "wir")
    .replace(/\bdich\b/gi, "uns")
    .replace(/\bdeine\b/gi, "unsere")
    .replace(/\bdein\b/gi, "unser");
}

function taskBriefQuestions(task) {
  const text = `${task.title || ""} ${task.description || ""}`.toLowerCase();
  if (text.includes("wohngeld")) {
    return [
      "Was genau plant oder kritisiert die Bundesregierung beim Wohngeld?",
      "Welche soziale Wirkung hätte das für Menschen mit geringem Einkommen?",
      "Welche Linie passt für Arbeit und Soziales?",
      "Reaktion heute ja oder nein?"
    ];
  }
  if (text.includes("bürgergeld")) {
    return [
      "Was ist der konkrete Anlass der aktuellen Bürgergeld-Debatte?",
      "Welche Linie passt zu Beratung, guter Arbeit und Armutsvermeidung?",
      "Welche Frames sollten wir vermeiden?",
      "Brauchen wir heute ein kurzes Statement oder reicht interne Sprechfähigkeit?"
    ];
  }
  if (text.includes("pflege")) {
    return [
      "Was ist die neue Entwicklung in der Pflege?",
      "Welche Auswirkungen hat das auf Beschäftigte und soziale Sicherung?",
      "Welche Frage sollten wir fachlich stellen?",
      "Ist eine öffentliche Reaktion sinnvoll?"
    ];
  }
  if (text.includes("arbeitszeit")) {
    return [
      "Was ist der konkrete Vorschlag oder Kritikpunkt beim Arbeitszeitgesetz?",
      "Welche Schutzrechte wären betroffen?",
      "Welche Linie passt für Arbeit und Soziales?",
      "Welche Formulierung ist pressefähig?"
    ];
  }
  return [
    "Was ist der konkrete politische Anlass?",
    "Warum betrifft das Cems Ausschuss oder Profil?",
    "Welche Linie sollten wir vorbereiten?",
    "Reaktion heute ja oder nein?"
  ];
}

function trimEmailLines(lines) {
  const cleaned = lines.map((line) => line == null ? "" : String(line).trimEnd());
  while (cleaned[0] === "") cleaned.shift();
  while (cleaned[cleaned.length - 1] === "") cleaned.pop();
  return cleaned;
}

function mergeTasks(defaultTasks, persistedTasks) {
  const bySource = new Map(defaultTasks.map((task) => [task.sourceSignalId || task.id, task]));
  persistedTasks.forEach((task) => {
    bySource.set(task.sourceSignalId || task.id, { ...(bySource.get(task.sourceSignalId || task.id) || {}), ...task });
  });
  return Array.from(bySource.values()).sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    const priorityWeight = { high: 0, medium: 1, low: 2 };
    return (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1) || new Date(a.dueDate) - new Date(b.dueDate);
  });
}

function sourceLine(item) {
  const sources = item.sources || [];
  const primary = item.primarySource || sources[0];
  if (!primary) return "Quelle hinterlegt";
  const confidence = `${confidenceAdjective(item.confidence || primary.confidence)} Sicherheit`;
  const retrievedAt = primary.retrievedAt || item.retrievedAt;
  const publishedAt = primary.publishedAt || item.publishedAt;
  const found = retrievedAt ? `gefunden ${sourceTimeLabel(retrievedAt)}` : sourceTimeLabel(publishedAt);
  if (sources.length > 1) {
    const names = sources.map((source) => source.sourceName).filter(Boolean).slice(0, 3).join(", ");
    return `Quellen: ${names} · ${sources.length} Signale · ${found} · ${confidence}`;
  }
  return `Quelle: ${primary.sourceName || "Quelle"} · ${found} · ${confidence}`;
}

function sourceTimeLabel(dateString) {
  const date = new Date(dateString || "");
  if (Number.isNaN(date.getTime())) return "Zeitpunkt offen";
  const nowBerlin = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const dateBerlin = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  const time = formatBerlinTimeOnly(date);
  if (dateBerlin === nowBerlin) return `heute ${time}`;
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function sourceExcerpt(item) {
  const source = primarySource(item) || item.primarySource || item.sources?.[0] || {};
  return source.excerpt || item.excerpt || item.summary || "";
}

function sourceLink(item) {
  const source = primarySource(item);
  const url = sourceHref(source || item);
  if (!url) return "";
  return `<a class="source-pill" href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceLinkLabel(source || item))}</a>`;
}

function renderSourceBasis(item) {
  const sources = (item.sources || []).filter((source) => Boolean(sourceHref(source)));
  if (!sources.length) return "";
  return `
    <section class="source-basis">
      <h2>Quellenbasis</h2>
      ${sources.slice(0, 4).map((source) => {
        const href = sourceHref(source);
        return `
        <a class="source-row" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">
          <div>
            <span>${escapeHtml(source.sourceName || "Quelle")}</span>
            <p>${escapeHtml(source.excerpt || source.relevanceReason || "Quelle wurde für diese Empfehlung herangezogen.")}</p>
            <small>${escapeHtml(sourceTimeLabel(source.publishedAt || source.retrievedAt))} · Direkter Artikellink.</small>
          </div>
          <small>${escapeHtml(confidenceAdjective(source.confidence))} Sicherheit</small>
        </a>
      `;
      }).join("")}
    </section>
  `;
}

function primarySource(item) {
  if (item.primarySource || item.sources?.[0]) return item.primarySource || item.sources?.[0];
  if (item.sourceName || item.url || item.sourceUrl) {
    return {
      sourceName: item.sourceName,
      itemUrl: item.url,
      sourceUrl: item.sourceUrl,
      confidence: item.confidence
    };
  }
  return null;
}

function sourceHref(source) {
  const candidates = [source?.itemUrl, source?.url].filter(Boolean);
  return candidates.find((url) => isDirectArticleHref(url, source)) || "";
}

function hasPreciseSource(item) {
  if (!item) return false;
  if (sourceHref(item)) return true;
  const sources = [item.primarySource, ...(item.sources || [])].filter(Boolean);
  return sources.some((source) => Boolean(sourceHref(source)));
}

function sourceLinkLabel(source) {
  return "Artikel öffnen";
}

function isDirectArticleHref(url, source = {}) {
  if (!/^https?:\/\//i.test(String(url || ""))) return false;
  if (String(url).includes("example.local") || isGoogleArticleProxy(url)) return false;
  if (source?.linkType && source.linkType !== "direct") return false;
  return !isLikelyPublisherHomepage(url, source);
}

function isGoogleArticleProxy(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.hostname.includes("google.");
  } catch {
    return false;
  }
}

function isLikelyPublisherHomepage(url, source = {}) {
  try {
    const parsed = new URL(String(url || ""));
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || path.split("/").filter(Boolean).length === 0) return true;
    if (source?.sourceUrl) {
      const sourceUrl = new URL(String(source.sourceUrl));
      return parsed.hostname === sourceUrl.hostname && parsed.pathname.replace(/\/+$/, "") === sourceUrl.pathname.replace(/\/+$/, "");
    }
    return false;
  } catch {
    return false;
  }
}

function confidenceLabel(confidence) {
  return ({ high: "hoch", medium: "mittel", low: "niedrig" })[confidence] || "mittel";
}

function confidenceAdjective(confidence) {
  return ({ high: "hohe", medium: "mittlere", low: "niedrige" })[confidence] || "mittlere";
}

function priorityLabel(priority) {
  return ({ high: "Hoch", medium: "Mittel", low: "Niedrig" })[priority] || "Mittel";
}

function priorityClass(priority) {
  return ({ high: "high", medium: "medium", low: "low" })[priority] || "medium";
}

function formatDueDate(dateString) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(dateString));
}

function formatLastLogin(isoDate) {
  if (!isoDate) return "Noch nie";
  const d = new Date(isoDate);
  const diffDays = Math.floor((Date.now() - d) / 86400000);
  if (diffDays === 0) return "Heute";
  if (diffDays === 1) return "Gestern";
  if (diffDays < 7) return `Vor ${diffDays} Tagen`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatBriefingDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Heute";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDeadlineDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString || "—";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function helmutBriefingSourceHtml(item) {
  if (!item) return "";
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const prim = item.primarySource || sources[0];
  if (!prim && !item.sourceName) return "";
  const primName = prim?.sourceName || item.sourceName || "";
  const dateStr = prim?.publishedAt || prim?.retrievedAt || item.publishedAt || item.retrievedAt || "";
  const dateLabel = dateStr ? `, ${escapeHtml(sourceTimeLabel(dateStr))}` : "";
  const href = sourceHref(prim || item);
  const nameHtml = href
    ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(primName)}</a>`
    : escapeHtml(primName);
  if (sources.length > 1) {
    const extra = sources.length - 1;
    return `Quellen: ${nameHtml} + ${extra} weitere`;
  }
  return primName ? `Quelle: ${nameHtml}${dateLabel}` : "";
}

function formatBerlinNow() {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function formatBerlinFullDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatBerlinTimeOnly(date = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function berlinHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  return Number(hour || 0);
}

function timeGreeting(firstName = "") {
  const hour = berlinHour();
  const name = String(firstName || "").trim();
  const suffix = name ? `, ${name}` : "";
  if (hour >= 5 && hour < 11) return `Guten Morgen${suffix}.`;
  if (hour >= 11 && hour < 17) return `Guten Tag${suffix}.`;
  return `Guten Abend${suffix}.`;
}

function updateBerlinClock() {
  document.querySelectorAll("[data-berlin-clock]").forEach((element) => {
    element.textContent = `${displayStatusLabel()} · ${formatBerlinNow()}`;
  });
}

function startBerlinClock() {
  if (berlinClockTimer) return;
  berlinClockTimer = window.setInterval(updateBerlinClock, 30 * 1000);
}

async function copyText(text, fallbackMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Kopiert");
  } catch {
    showToast(fallbackMessage);
  }
}

function showToast(message) {
  if (!toast?.classList) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 1600);
}

async function logInteraction(interaction) {
  if (previewMode) return;
  if (!profile) return;
  try {
    await fetchWithTimeout(`/api/interactions?${apiScopeQuery()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ politicianId: profile.id, ...interaction })
    });
  } catch (error) {
    console.warn("Interaction not saved", error);
  }
}

async function logDecisionInteraction(type, decision, extra = {}) {
  if (!decision) return;
  return logInteraction({
    type,
    signalId: decision.signalId || decision.id || "",
    recommendationId: decision.id || "",
    politicalItemId: decision.topic || decision.title || "",
    topic: decision.topic || decision.title || "",
    title: decision.title || "",
    sourceName: decision.primarySource?.sourceName || decision.sources?.[0]?.sourceName || "",
    metadata: {
      priority: decision.priorityLabel || decision.decision || "",
      score: decision.relevanceScore || decision.finalScore || decision.totalScore || decision.priority || "",
      actionType: decision.actionType || "",
      channel: selectedCommunicationChannel || "",
      ...extra
    },
    ...extra
  });
}

function sanitizePoliticianId(value) {
  return String(value || "cem-ince")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "") || "cem-ince";
}

function isPreviewModeParam(params) {
  const value = String(params.get("preview") || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function apiScopeQuery(extra = {}) {
  const params = new URLSearchParams({ politicianId: activePoliticianId, ...extra });
  if (previewMode) params.set("preview", "1");
  return params.toString();
}

function displayStatusLabel() {
  return previewMode ? "Vorschau" : (briefing?.status || "Aktuell");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Service Worker bei jedem Laden registrieren (unabhaengig von Push). Ohne
// registrierten SW mit fetch-Handler bietet Chrome/Brave keinen Installieren-Dialog
// an. Die spaetere Push-Registrierung nutzt dieselbe Registrierung weiter.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const doRegister = () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service-Worker-Registrierung fehlgeschlagen", error);
    });
  };
  if (document.readyState === "complete") doRegister();
  else window.addEventListener("load", doRegister, { once: true });
}
registerServiceWorker();

// --- Eigener In-App "Installieren"-Button ------------------------------------
// Chrome/Brave feuern beforeinstallprompt, wenn die PWA installierbar ist. Wir
// fangen es ab und bieten einen eigenen, zum Design passenden Button an. Das
// Banner haengt an <body> (ausserhalb von #app), damit Re-Renders es nicht loeschen.
let deferredInstallPrompt = null;

function isStandaloneDisplay() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    || window.navigator.standalone === true;
}
function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
}
function removeInstallBanner() {
  const el = document.getElementById("helmutInstallBanner");
  if (el) el.remove();
}
function installDismissed() {
  try { return sessionStorage.getItem("helmut:install-dismissed") === "1"; } catch { return false; }
}
function dismissInstall() {
  try { sessionStorage.setItem("helmut:install-dismissed", "1"); } catch { /* egal */ }
  removeInstallBanner();
}
function buildInstallBanner(inner) {
  if (document.getElementById("helmutInstallBanner")) return null;
  const bar = document.createElement("div");
  bar.id = "helmutInstallBanner";
  bar.className = "install-banner";
  bar.innerHTML = inner;
  document.body.appendChild(bar);
  const close = document.getElementById("helmutInstallClose");
  if (close) close.addEventListener("click", dismissInstall);
  return bar;
}
function showInstallBanner() {
  if (isStandaloneDisplay() || installDismissed() || previewMode) return;
  buildInstallBanner(`
    <div class="install-banner__mark">H</div>
    <div class="install-banner__text">
      <strong>Helmut installieren</strong>
      <span>Als App öffnen – ohne Browserleiste, mit eigenem Icon.</span>
    </div>
    <button type="button" class="install-banner__cta" id="helmutInstallCta">Installieren</button>
    <button type="button" class="install-banner__close" id="helmutInstallClose" aria-label="Schließen">×</button>
  `);
  const cta = document.getElementById("helmutInstallCta");
  if (cta) cta.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    removeInstallBanner();
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch { /* egal */ }
    deferredInstallPrompt = null;
  });
}
function maybeShowIosInstallHint() {
  // iOS feuert kein beforeinstallprompt -> dezenter Hinweis auf den Teilen-Weg.
  if (!isIosDevice() || isStandaloneDisplay() || installDismissed() || previewMode) return;
  buildInstallBanner(`
    <div class="install-banner__mark">H</div>
    <div class="install-banner__text">
      <strong>Helmut zum Home-Bildschirm</strong>
      <span>In Safari: Teilen&nbsp;⬆️ &rarr; „Zum Home-Bildschirm".</span>
    </div>
    <button type="button" class="install-banner__close" id="helmutInstallClose" aria-label="Schließen">×</button>
  `);
}
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallBanner();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  removeInstallBanner();
});
if (typeof window !== "undefined") {
  window.addEventListener("load", () => { setTimeout(maybeShowIosInstallHint, 2500); }, { once: true });
}

// --- App-Icon-Badge loeschen, sobald die App offen/sichtbar ist: direkt via
// navigator.clearAppBadge und zusaetzlich den Service-Worker-Zaehler zuruecksetzen.
function clearAppIconBadge() {
  try {
    if ("clearAppBadge" in navigator) navigator.clearAppBadge().catch(() => {});
  } catch { /* nicht unterstuetzt */ }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.active && reg.active.postMessage("clear-badge"))
      .catch(() => {});
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") clearAppIconBadge();
  });
}

loadBriefing()
  .then(() => schedulePushAutoSync())
  .then(() => clearAppIconBadge())
  .catch((error) => {
    console.error(error);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Kein Netz -> elegante Offline-Ansicht im Helmut-Design statt Fehlermeldung.
      app.innerHTML = `
        <section class="loading-card offline-card">
          <div class="loading-logo"><span>H</span></div>
          <h1>Ich hab gerade keine Verbindung</h1>
          <p>Ohne Netz komme ich nicht an deine aktuelle Lage. Sobald du wieder online bist, bin ich sofort für dich da.</p>
          <button class="primary-button" type="button" onclick="window.location.reload()">Nochmal versuchen</button>
        </section>
      `;
      window.addEventListener("online", () => window.location.reload(), { once: true });
    } else {
      app.innerHTML = `
        <section class="loading-card">
          <div class="loading-logo"><span>H</span></div>
          <p>Helmut</p>
          <h1>Briefing konnte nicht geladen werden.</h1>
          <button class="primary-button" type="button" onclick="window.location.reload()">Neu laden</button>
        </section>
      `;
      showToast("Briefing konnte nicht geladen werden");
    }
    hideStartupSplash();
  });
