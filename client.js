// Boot-Sicherheitsnetz (muss ganz am Anfang stehen). Signalisiert dem
// index.html-Watchdog, dass client.js geladen/geparst wurde, und entfernt den
// Splash-Overlay + zeigt eine "Neu laden"-Ansicht, falls im Startpfad doch ein
// unerwarteter Fehler oder eine unbehandelte Rejection auftritt. Ohne dieses Netz
// bliebe der Splash bei einem frühen Wurf lautlos dauerhaft sichtbar.
try { window.__helmutClientLoaded = true; } catch (e) {}
(function installBootSafetyNet() {
  function forceHideSplash() {
    try {
      document.body.classList.remove("is-loading");
      document.body.classList.add("app-ready", "splash-gone");
      var s = document.getElementById("appSplash");
      if (s) s.style.display = "none";
    } catch (e) {}
  }
  function bootFailed() {
    forceHideSplash();
    try {
      var app = document.getElementById("app");
      if (app && (document.body.classList.contains("is-loading") || app.querySelector(".loading-screen") || !app.children.length)) {
        app.innerHTML =
          '<div style="display:grid;place-items:center;min-height:100dvh;font-family:Inter,ui-sans-serif,system-ui,sans-serif;padding:32px;text-align:center">' +
          '<div><div style="font:700 52px/1 Inter,sans-serif;letter-spacing:-.04em;margin-bottom:22px;color:#fbf7ef">H</div>' +
          '<p style="color:rgba(245,241,232,.62);max-width:300px;margin:0 auto 22px;font-size:15px;line-height:1.55">Beim Start ist etwas schiefgelaufen.<br>Bitte lade die Seite neu.</p>' +
          '<button type="button" onclick="window.location.reload()" style="appearance:none;border:0;cursor:pointer;padding:14px 22px;border-radius:14px;font:600 16px Inter,sans-serif;color:#0b0f1a;background:#f5f1e8">Neu laden</button>' +
          '</div></div>';
      }
    } catch (e) {}
  }
  try {
    window.addEventListener("error", function (event) {
      // NUR echte Script-/Laufzeitfehler als Bootfehler werten. Ressourcen-
      // Ladefehler (img/font/link) haben ein Element als target -> ignorieren,
      // damit ein fehlgeschlagenes Bild nicht faelschlich die App ersetzt.
      if (event && event.target && event.target !== window && event.target.tagName) return;
      bootFailed();
    });
    window.addEventListener("unhandledrejection", bootFailed);
  } catch (e) {}
})();

let profile = null;
let briefing = null;
let aiStatus = { enabled: false, model: "" };
let opsStatus = null;
let decisions = [];
let helmutBriefings = [];
let helmutCarouselFilter = "Alle";
let helmutCarouselIndex = 0;
// Größe des Entscheidungs-Decks ("Deine wichtigsten Entscheidungen"). Default 3,
// bewusst als Named Constant — später problemlos auf 5–10 erhöhbar, ohne dass sich
// am UI-Konzept etwas ändert (die Deck-Render-Engine ist bereits N-fähig).
const HELMUT_DECK_SIZE = 3;
let helmutDeck = [];
let helmutDecisionsMade = 0;
let helmutLastDecision = null;
let helmutDeckLeavingId = "";
let helmutDecidedIds = new Set();
let helmutHowtoForceOpen = false;
let tasks = [];
let notes = [];
let recommendations = [];
let radarArchive = [];
let radarBuckets = null;
let radarArchiveLoaded = false;
// Radar-UI-Zustand (rein clientseitig, keine Daten): aktives Umfeld-Segment,
// aktiver Artikelfilter, Aufklapp-Zustände, Refresh-Ladeanzeige.
let radarSegment = "party";
let radarFilter = "all";
let radarMentionsExpanded = false;
let radarDynamicsExpanded = false;
let radarArticlesExpanded = false;
let radarEnvExpanded = false;
let radarRefreshing = false;
let opsStatusLoaded = false;
let pushConfig = null;
let pushAutoSyncStarted = false;
let selectedDecisionId = "";
let selectedVorgangId = "";
let currentView = "briefing";
let detailOriginView = "briefing";
let navOpen = false;
let updatesOpen = false;
let helmutThinking = false;
let helmutThinkingTimer = null;
let pipelineRunning = false;
let pipelineRunStep = 0;
let pipelinePhase = null;          // null | "running" | "skipped" | "done" (ehrlicher Abschluss)
let pipelineCompletionTimer = null;
let lastAnimatedView = null;       // Karten-Eintritts-Animation nur bei echtem (Wieder-)Eintritt
let animateNextRender = false;     // Einmal-Schuss: nächstes render() darf Eintritt animieren
let pipelineStepTimer = null;
let helmutTypingActive = false;
let helmutTypedText = "";
let helmutTypingFullText = "";
let helmutTypingTimer = null;
let selectedTaskHandoffId = "";
let generatedStatement = "";
// Herkunft des aktuell angezeigten Kommunikationstexts: "" (aus der belegten
// Entscheidung), "ki", "regel" oder "fehler" — für die ehrliche Kennzeichnung.
let generatedStatementSource = "";
let communicationContextTitle = "";
let officeDrafts = {};
// Fehlgeschlagene Entwurfs-Erzeugungen je Draft-Key (nur Laufzeit, kein Cache):
// unterscheidet "Erstellung fehlgeschlagen" vom bloßen "Noch kein Entwurf".
let officeDraftErrors = {};
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
let adminDataStatus = null; // interner Datenmotor-Status (global + pro Account)
let adminRecovery = null;      // interner Pipeline-Recovery-Status (nur Admin)
let adminRecoveryResult = null; // Ergebnis der letzten Recovery-Aktion (Anzeige)
let adminRecoveryBusy = false;  // verhindert Doppelklick/Parallelausführung
let adminRecoveryStartMs = 0;       // Date.now() beim Start des laufenden Laufs (Live-Laufzeit)
let adminRecoveryLastCheck = null;  // HH:MM des letzten read-only Status-Polls
let adminRecoveryPollTimer = null;  // Intervall-Handle des Status-Pollings
let adminRecoveryPrevFinishedAt = null; // finishedAt des VORHERIGEN Laufs (Abschluss-Erkennung)
let adminRecoveryStale = false;     // letzter Status-Reload/Poll schlug fehl -> letzter Stand bleibt sichtbar
let adminRecoveryDetailsOpen = false; // Offen-Zustand des Recovery-Detailblocks über Re-Renders halten
                                      // (sonst klappt er bei jeder Aktion zu -> Layout springt, Ergebnis verdeckt)
let adminPendingDiagnose = null; // Ergebnis der letzten Pending-Diagnose (nur lesen)
let adminPendingDiagnoseBusy = false;
let expandedAdminUsers = new Set();
let adminInfoGlobalBound = false; // dokumentweite Info-Popover-Schließer nur einmal binden
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

function fmtCost(n) {
  if (typeof n !== "number") return "—";
  return n < 0.01 ? n.toFixed(4) : n.toFixed(2);
}

function formatUsdEur(usd) {
  if (typeof usd !== "number") return "—";
  const eur = usd * USD_TO_EUR;
  return `$${fmtCost(usd)} | €${fmtCost(eur)}`;
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
// Vercel-VORSCHAU-Hosts (Branch-Previews) heißen "<projekt>-git-<branch>-<team>.vercel.app".
// Produktion (helmut-pilot.vercel.app / Custom-Domain) enthält KEIN "-git-" -> nie betroffen.
function isReviewPreviewHost() {
  try { return /-git-[a-z0-9-]+\.vercel\.app$/i.test(location.hostname); } catch { return false; }
}
function getThemePref() {
  try {
    // 1) Expliziter URL-Override ?theme=dark|light (wird gemerkt) — für gezielte Abnahme.
    const q = String(new URLSearchParams(location.search).get("theme") || "").toLowerCase();
    if (q === "dark" || q === "light") { try { localStorage.setItem(THEME_KEY, q); } catch (_) {} return q; }
    const stored = localStorage.getItem(THEME_KEY);
    // 2) Explizite Nutzerwahl gewinnt immer.
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
    // 3) In der Vercel-VORSCHAU (nie Produktion) ist Dark der Standard, damit die
    //    Dark-Abnahme ohne Umschalten sichtbar ist. Sonst dem Gerät folgen ("system").
    if (isReviewPreviewHost()) return "dark";
    return "system";
  } catch { return "system"; }
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

// SICHTBARE Reiter-Labels. Achtung Historie: die interne View-ID "briefing" gehoert zum
// LAGE-Reiter, die ID "helmut" zum sichtbaren Reiter "Briefing" (frueher "Helmut").
// Die IDs sind interner Zustand/Vertrag (data-view, Router, Tests) und bleiben bewusst
// unveraendert — nur das sichtbare Label wurde umbenannt. Marke/Produkt heisst weiter Helmut.
const navItems = [
  ["briefing", "Lage"],
  ["radar", "Radar"],
  ["helmut", "Briefing"],
  ["office", "Büro"]
];

const mobileNavItems = [
  ["briefing", "Lage"],
  ["radar", "Radar"],
  ["helmut", "Briefing"],
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
  briefing.status = previewMode ? "Vorschau" : (briefing.status || "Live");
  briefing.sourceStats = briefing.sourceStats || { checkedSources: 0, successfulSources: 0, failedSources: 0 };

  const persistedTasks = Array.isArray(startPayload.tasks) ? startPayload.tasks : [];
  notes = Array.isArray(startPayload.notes) ? startPayload.notes : [];
  tasks = mergeTasks(briefing.tasks || [], persistedTasks);
  recommendations = briefing.personalizedRecommendations || [];

  const themeSignalId = briefing.themeOfDay?.signalId;
  const activeItems = briefing.items.filter((item) => item.decision !== "Ignorieren" && hasPreciseSource(item));
  const personalizedItems = recommendations.map(recommendationToDecisionItem).filter(hasPreciseSource);
  // V3: situationalBriefing-Einträge sind bereits vollständige Entscheidungs-Items
  // (aus dem Contract-Adapter) — direkt verwenden, kein clientseitiges Fabrizieren.
  const situationalItems = (briefing.situationalBriefing || []).filter(hasPreciseSource);
  const prominentPool = (personalizedItems.length ? personalizedItems : (activeItems.length ? activeItems : situationalItems));
  const decisionComparator = (a, b) => {
    if (a.signalId === themeSignalId) return -1;
    if (b.signalId === themeSignalId) return 1;
    return Number(b.priority || b.finalScore || b.totalScore || 0) - Number(a.priority || a.finalScore || a.totalScore || 0);
  };
  const sortedDecisions = prominentPool
    .filter(hasPreciseSource)
    .sort(decisionComparator)
    .map(toDecision);
  // decisions bleibt bei 3 (Home/Quick/Summary hängen daran). helmutDeck ist das
  // entkoppelte Fokus-Deck — bei HELMUT_DECK_SIZE=3 identisch, aber unabhängig
  // skalierbar auf 5–10, ohne andere Views zu berühren.
  decisions = sortedDecisions.slice(0, 3);

  const allHelmutRaw = [
    ...recommendations.map(recommendationToDecisionItem),
    ...(briefing.items || []),
    ...(briefing.situationalBriefing || [])
  ];
  const seenHelmutKeys = new Set();
  helmutBriefings = allHelmutRaw
    .filter((item) => {
      const key = item.signalId || item.id;
      if (!key || seenHelmutKeys.has(key)) return false;
      seenHelmutKeys.add(key);
      return true;
    })
    .sort(decisionComparator)
    .map(toDecision);

  // "Deine wichtigsten Entscheidungen" = die obersten ECHTEN Handeln/Beobachten-
  // Vorgänge aus DEMSELBEN Set wie Zähler und "Weitere Briefings" (helmutBriefings),
  // damit Zahl, Einleitungstext und Karten übereinstimmen — auch wenn ein Vorgang
  // (z. B. eine "Sammlung") keine direkte Einzelquelle hat (sonst leeres Deck trotz
  // "2 Beobachten"). Ignorieren bleibt außen vor; renderFurtherBriefings blendet die
  // Deck-IDs aus, sodass keine Doppelung entsteht.
  helmutDeck = helmutBriefings
    .filter((d) => helmutStatusBucket(d.priorityType || "watch") !== "ignorieren")
    .slice(0, HELMUT_DECK_SIZE);

  // Deck-Zustand bei frischem Briefing zurücksetzen (neuer Morgen = neuer Stapel).
  helmutCarouselIndex = 0;
  helmutDecisionsMade = 0;
  helmutLastDecision = null;
  helmutDeckLeavingId = "";
  helmutDecidedIds = new Set();

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
  // Radar liest den fertigen Lesevertrag briefing.currentRadarState (beim App-Start
  // über /api/app/start geladen) — KEIN separater Radar-Request pro Ansicht mehr
  // (ein Read-State pro Start, keine unnötigen API-Aufrufe).
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
      // Interner Datenmotor-Status (separater, etwas teurerer Endpoint) — bewusst
      // fehlertolerant: schlaegt er fehl, bleibt der restliche Admin sichtbar.
      try {
        const dsResp = await fetchWithTimeout(`/api/admin/data-status?${apiScopeQuery()}`, {}, 25000);
        adminDataStatus = dsResp.ok ? await dsResp.json() : null;
      } catch (_) {
        adminDataStatus = null;
      }
      // Interner Pipeline-Recovery-Status (nur Anzeige, kein KI-Call). Fehlertolerant:
      // nur mit gültigem Objekt überschreiben, sonst letzten bekannten Stand behalten.
      try {
        const rvResp = await fetchWithTimeout(`/api/admin/recovery-status?${apiScopeQuery()}`, {}, 25000);
        const j = rvResp.ok ? await rvResp.json().catch(() => null) : null;
        if (j && typeof j === "object" && !Array.isArray(j)) { adminRecovery = j; adminRecoveryStale = false; }
        else if (adminRecovery) { adminRecoveryStale = true; } // vorhandenen Stand behalten
        else { adminRecovery = null; }                          // erster Load ohne Daten -> Fail-safe-Karte
      } catch (_) {
        if (adminRecovery) adminRecoveryStale = true; else adminRecovery = null;
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
  const run = (opts) => {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(`Zeitüberschreitung beim Laden: ${url}`)), timeoutMs);
    });
    return Promise.race([fetch(url, opts), timeout]).finally(() => window.clearTimeout(timeoutId));
  };
  const response = await run(preparedOptions);
  // CSRF-Selbstheilung: Ein abgelaufener/verworfener Token (12h Serverfrist)
  // fuehrte zu dauerhaftem 403 auf ALLEN POSTs (u. a. push/subscribe), bis der
  // Nutzer neu lud. Einmal frischen Token holen und den Request wiederholen.
  if (response.status === 403 && needsCsrfToken(url, options)) {
    csrfTokenPromise = null;
    try {
      const retryOptions = await prepareRequestOptions(url, options);
      return await run(retryOptions);
    } catch (_) { return response; }
  }
  return response;
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
      .then((payload) => payload.token)
      .catch((error) => {
        // Eine abgelehnte Promise NIE cachen — sonst bleibt der Fehlversuch
        // dauerhaft haengen und jeder Folge-POST scheitert. Beim naechsten
        // Aufruf frisch versuchen.
        csrfTokenPromise = null;
        throw error;
      });
  }
  return csrfTokenPromise;
}

function renderPilotAccess(message = "") {
  hideStartupSplash();
  app.innerHTML = `
    <section class="loading-card pilot-access-card">
      <div class="loading-logo"><span>H</span></div>
      <p>Helmut</p>
      <h1>Zugang.</h1>
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
    // HARTER TIMEOUT: /api/auth/session ist der ERSTE Boot-Await. Ohne Timeout
    // konnte ein haengender Request (langsames Mobilnetz / Brave-Shields) den
    // gesamten Start blockieren -> Splash blieb dauerhaft haengen. Bei Timeout
    // faellt der catch unten auf null (Pilot-/Login-Pfad laeuft weiter).
    const res = await fetchWithTimeout("/api/auth/session", { cache: "no-store" }, 6000);
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
        <p class="pilot-access-copy">Melde dich mit deinem Helmut-Konto an, um deine persönliche Lage zu öffnen.</p>
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

// Deploy-Umgebung -> ruhiger Klartext (keine Secrets). Unbekannt/leer -> „—".
function adminEnvLabel(env) {
  const map = { production: "Produktion", preview: "Vorschau", development: "Entwicklung" };
  const key = String(env || "").toLowerCase();
  return map[key] || (env ? String(env) : "—");
}

// Relatives Alter (nur Anzeige): „gerade eben", „vor 12 Min.", „vor 3 Std.", „vor 2 Tagen".
// Kein Wert -> null (Aufrufer entscheidet, ob die Zeile entfällt). Erfindet nichts.
function adminRelAge(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 90) return "gerade eben";
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.floor(std / 24);
  return tage === 1 ? "vor 1 Tag" : `vor ${tage} Tagen`;
}

// Eine Statuskachel der Betreiber-Übersicht. cls ∈ {ok, warn, bad, unknown} steuert NUR
// die semantische Farbe (grün/gelb/rot/grau). Alle Texte werden escaped. Ist `target`
// (eine interne Abschnitts-id) gesetzt, wird die Kachel zu einem sicheren internen
// Sprung-Anker (<a href="#…">) — reine Navigation/Scrollen, NIE eine Aktion.
function opTile(label, cls, statusText, subText, timeText, target) {
  const inner = `
      <div class="op-tile-top"><span class="op-dot" aria-hidden="true"></span><span class="op-tile-label">${escapeHtml(label)}</span>${target ? `<span class="op-tile-chevron" aria-hidden="true">›</span>` : ""}</div>
      <span class="op-tile-status">${escapeHtml(statusText)}</span>
      ${subText ? `<span class="op-tile-sub">${escapeHtml(subText)}</span>` : ""}
      ${timeText ? `<span class="op-tile-time">${escapeHtml(timeText)}</span>` : ""}`;
  if (target) {
    return `<a class="op-tile op-tile--${escapeAttribute(cls)} op-tile--link" href="#${escapeAttribute(target)}" data-admin-jump="${escapeAttribute(target)}" title="Zum Bereich springen: ${escapeAttribute(adminJumpLabel(target))}" aria-label="${escapeAttribute(label)}: ${escapeAttribute(statusText)} — zum Bereich ${escapeAttribute(adminJumpLabel(target))} springen">${inner}</a>`;
  }
  return `<div class="op-tile op-tile--${escapeAttribute(cls)}">${inner}</div>`;
}

// 30-Sekunden-Betreiber-Übersicht (nur Admin). Leitet AUSSCHLIESSLICH aus bereits
// geladenen Admin-Daten ab (overview, data-status, recovery-status) — kein neuer
// Endpoint, kein KI-Call, keine Aktion. Fehlt ein Wert sicher, wird er neutral als
// „Keine Daten"/„Unbekannt" (grau) gezeigt, niemals erfunden. Farbe nur semantisch.
function renderAdminOperatorOverview(data, ds, rec) {
  const g = (ds && ds.global) || null;
  const koRaw = rec && rec.knowledgeObjects;
  const ko = (koRaw && koRaw.available !== false) ? koRaw : null;
  const tiles = [];

  // 1) System — Gesamt-Ampel des Datenmotors (Rollup über Pipeline + Daten + Profil).
  //    Sprungziel: bei Warnung/Fehler zum Handlungsbedarf, sonst zu System und Sicherheit.
  {
    const a = g && g.ampel;
    const map = { gruen: ["ok", "Gesund"], gelb: ["warn", "Prüfen"], rot: ["bad", "Fehler"] };
    const [cls, label] = map[a] || ["unknown", "Unbekannt"];
    let sub;
    if (!a) sub = "Kein Statusobjekt geladen";
    else if (a === "gruen") sub = "Kernbereiche ok, brauchbarer Stand";
    else if (a === "rot") sub = (g.letzterFehler && g.letzterFehler.headline) ? g.letzterFehler.headline : "Pipeline-Fehler oder kein aktueller Stand";
    else sub = "Eingeschränkt — Details unten prüfen";
    const chk = data && data.generatedAt ? adminRelAge(data.generatedAt) : null;
    const target = (cls === "warn" || cls === "bad") ? "admin-handlungsbedarf" : "admin-system";
    tiles.push(opTile("System", cls, label, sub, chk ? `geprüft ${chk}` : null, target));
  }

  // 2) Datenstand — Frische des letzten Laufs. Zeitstempel ist echt; die Alters-Schwelle
  //    (6 h / 24 h) ist reine Anzeige-Heuristik, kein erfundener Wert. Sprung: Datenmotor.
  {
    const iso = g && g.letzterLauf;
    if (!iso) tiles.push(opTile("Datenstand", "unknown", "Keine Daten", "Kein Lauf-Zeitstempel", null, "admin-datenmotor"));
    else {
      const ageH = (Date.now() - new Date(iso).getTime()) / 3600000;
      const cls = ageH < 6 ? "ok" : ageH < 24 ? "warn" : "bad";
      const label = cls === "ok" ? "Aktuell" : cls === "warn" ? "Älter" : "Veraltet";
      tiles.push(opTile("Datenstand", cls, label, `Letzte Daten ${adminRelAge(iso)}`, null, "admin-datenmotor"));
    }
  }

  // 3) Pipeline — lief der letzte Lauf erfolgreich? (echte Quellen-Zahlen + Modus). Sprung: Datenmotor.
  {
    if (!g) tiles.push(opTile("Pipeline", "unknown", "Unbekannt", "Kein Lauf-Status geladen", null, "admin-datenmotor"));
    else {
      const geprueft = dsNum(g.quellen && g.quellen.geprueft);
      const erfolg = dsNum(g.quellen && g.quellen.erfolgreich);
      const fehl = dsNum(g.quellen && g.quellen.fehlgeschlagen);
      const ratio = geprueft > 0 ? fehl / geprueft : 0;
      let cls, label;
      if (geprueft === 0 && !g.letzterLauf) { cls = "unknown"; label = "Kein Lauf"; }
      else if (geprueft > 0 && erfolg === 0) { cls = "bad"; label = "Fehlgeschlagen"; }
      else if (ratio > 0.1) { cls = "warn"; label = "Mit Fehlern"; }
      else { cls = "ok"; label = "Erfolgreich"; }
      const modus = g.modus ? ` · ${adminModusLabel(g.modus)}` : "";
      const sub = g.letzterLauf ? `Letzter Lauf ${adminRelAge(g.letzterLauf)}${modus}` : "Noch kein Lauf erfasst";
      tiles.push(opTile("Pipeline", cls, label, sub, null, "admin-datenmotor"));
    }
  }

  // 4) Quellen — wie viele Quellen lieferten Daten? (echte Zähler). Sprung: Datenmotor.
  {
    const q = g && g.quellen;
    const geprueft = dsNum(q && q.geprueft);
    if (!q || geprueft === 0) tiles.push(opTile("Quellen", "unknown", "Keine Daten", "Ab nächstem Lauf verfügbar", null, "admin-datenmotor"));
    else {
      const erfolg = dsNum(q.erfolgreich);
      const fehl = dsNum(q.fehlgeschlagen);
      // Rot nur bei Total-/Mehrheitsausfall; einzelne Fehlquellen sind „prüfen" (gelb).
      const cls = fehl === 0 ? "ok" : (erfolg === 0 || fehl / geprueft > 0.5 ? "bad" : "warn");
      const sub = fehl > 0 ? `${fehl} ${fehl === 1 ? "Quelle" : "Quellen"} prüfen` : "Alle Quellen ok";
      tiles.push(opTile("Quellen", cls, `${erfolg} von ${geprueft} ok`, sub, null, "admin-datenmotor"));
    }
  }

  // 5) Understanding — KO-Zustände + KI-Analysefehler (echte Zähler, kein KI-Call).
  //    Sprung: bei pending/failed/auffälligem Lock zu Recovery, sonst zu Datenmotor.
  {
    const kiFehler = Boolean(g && g.kiAnalyseFehler);
    const lockAuff = Boolean(rec && rec.understandingLock && (rec.understandingLock.verdaechtig || rec.understandingLock.aktiv));
    if (!ko && !g) tiles.push(opTile("Understanding", "unknown", "Keine Daten", "Kein Status geladen", null, "admin-datenmotor"));
    else {
      const pending = ko ? dsNum(ko.pending) : 0;
      const failed = ko ? dsNum(ko.failed) : 0;
      let cls, label, sub;
      if (failed > 0) { cls = "bad"; label = "Fehler"; sub = `${failed} ${failed === 1 ? "Vorgang" : "Vorgänge"} fehlgeschlagen`; }
      else if (pending > 0) { cls = "warn"; label = "Wartet"; sub = `${pending} ${pending === 1 ? "Vorgang wartet" : "Vorgänge warten"}`; }
      else if (kiFehler) { cls = "warn"; label = "Prüfen"; sub = "KI-Analyse heute mit Fehlern"; }
      else { cls = "ok"; label = "Ok"; sub = "Keine Fehler im letzten Lauf"; }
      const luf = rec && rec.letzterUnderstandingLauf ? adminRelAge(rec.letzterUnderstandingLauf) : null;
      const auffaellig = failed > 0 || pending > 0 || lockAuff;
      tiles.push(opTile("Understanding", cls, label, sub, luf ? `Lauf ${luf}` : null, auffaellig ? "admin-recovery" : "admin-datenmotor"));
    }
  }

  // 6) Watchdog — der einzige automatische Readiness-Guard im System ist der Morgen-Check
  //    7:30 (morgenstatus0730). Ehrlich als solcher benannt. Sprung: System und Sicherheit.
  {
    const m = g && g.morgenstatus0730;
    if (!m || typeof m.ok === "undefined") tiles.push(opTile("Watchdog", "unknown", "Keine Daten", "Kein Morgen-Check-Status", null, "admin-system"));
    else if (m.ok) tiles.push(opTile("Watchdog", "ok", "Ok", "Morgen-Check 7:30 bestanden", null, "admin-system"));
    else tiles.push(opTile("Watchdog", "warn", "Prüfen", m.note ? String(m.note) : "Morgen-Check 7:30 nicht bestanden", null, "admin-system"));
  }

  // Nur die sechs Kacheln — Handlungsbedarf/Hinweise stehen bewusst im eigenen
  // Bereich direkt darunter (renderAdminActionCenter), damit „Betrieb" ruhig bleibt.
  return `
    <section class="op-overview" id="admin-betrieb" aria-label="Betrieb — Betreiber-Übersicht">
      <div class="op-tiles">${tiles.join("")}</div>
      ${renderAdminGlossary()}
    </section>`;
}

// Menschlicher Name eines internen Sprungziels (für title/aria-label).
function adminJumpLabel(id) {
  return ({
    "admin-betrieb": "Betrieb",
    "admin-handlungsbedarf": "Handlungsbedarf",
    "admin-datenmotor": "Datenmotor",
    "admin-profile": "Profile",
    "admin-kosten": "Kosten intern",
    "admin-system": "System und Sicherheit",
    "admin-recovery": "Recovery (intern)"
  })[id] || id;
}

// Technischer Lauf-Modus -> menschlicher Klartext (kein roher Enum in der Anzeige).
function adminModusLabel(m) {
  return ({ "full": "Vollständiger Lauf", "lage-check": "Lage-Check", "incremental": "Teil-Lauf" })[String(m || "")] || String(m || "");
}

// ── Erklärungsebene (Phase 2) ────────────────────────────────────────────────
// Ruhige Begriffs-Erklärungen für Betreiber ohne Entwicklerwissen. Max. zwei kurze
// Sätze, allgemein (nicht auf ein Mandat zugeschnitten), keine Secrets/Rohsprache.
const ADMIN_GLOSSARY = {
  "System": "Gesamtzustand von Helmut auf einen Blick. Grün heißt: Pipeline, Daten und Profile sind in Ordnung.",
  "Datenstand": "Wie aktuell die Daten sind — gemessen daran, wie lange der letzte erfolgreiche Lauf her ist.",
  "Pipeline": "Der automatische Ablauf, der Quellen einsammelt und zu politischen Vorgängen verarbeitet.",
  "Quellen": "Nachrichten- und Amtsquellen, die Helmut regelmäßig abfragt. Zeigt, wie viele davon geliefert haben.",
  "Understanding": "Wandelt neue politische Vorgänge in strukturierte Einschätzungen für Helmut um.",
  "Watchdog": "Automatische Prüfung, ob Pipeline und Datenstand regelmäßig funktionieren. Hier: der Morgen-Check um 7:30.",
  "Morgen-Check": "Prüft, ob Helmut bis 7:30 Uhr einen brauchbaren Tagesstand erreicht hat.",
  "Pending": "Vorgänge, die noch auf Verarbeitung warten.",
  "Failed": "Vorgänge, deren Verarbeitung fehlgeschlagen ist und die geprüft werden sollten.",
  "Complete": "Vorgänge, die vollständig verarbeitet wurden.",
  "Understanding-Lock": "Schutz gegen doppelte KI-Läufe. Ist er veraltet, kann ein Lauf hängen.",
  "Recovery": "Interne Werkzeuge, um blockierte oder fehlgeschlagene Verarbeitung bewusst zu reparieren.",
  "Knowledge Objects": "Strukturierte politische Wissenseinträge, die aus Quellen und Dokumenten entstehen (kurz: KOs).",
  "Briefing-Punkte": "Konkrete, priorisierte Punkte im täglichen Briefing eines Accounts.",
  "Lage-Vorgänge": "Politische Vorgänge, die in der aktuellen Lage eines Accounts angezeigt werden.",
  "Radar-Signale": "Erkannte Chancen und Risiken im politischen Umfeld eines Accounts.",
  "KI-Kosten": "Interne Betriebskosten durch serverseitige KI-Verarbeitung. Nur im Admin sichtbar.",
  "Calls": "Anzahl der serverseitigen KI-Aufrufe im gewählten Zeitraum.",
  "Datenstatus": "Interne Detailsicht auf Datenmotor, Quellen und KI-Status.",
  "Version": "Der aktuell ausgelieferte Stand (Commit) dieses Deployments."
};

// Kleines, barrierearmes Info-Symbol mit Popover. Die Erklärung steckt zusätzlich im
// aria-label (Screenreader lesen sie direkt); das sichtbare Popover ist dekorativ.
// Desktop: Hover + Fokus. Mobile: Tippen (JS toggelt aria-expanded). Löst NIE eine Aktion aus.
function adminInfo(term) {
  const text = ADMIN_GLOSSARY[term];
  if (!text) return "";
  return `<span class="admin-info-wrap"><button type="button" class="admin-info-btn" data-admin-info aria-expanded="false" aria-label="Erklärung ${escapeAttribute(term)}: ${escapeAttribute(text)}"><span aria-hidden="true">i</span></button><span class="admin-info-pop" role="tooltip" aria-hidden="true">${escapeHtml(text)}</span></span>`;
}

// Schließt alle offenen Info-Popover (Außenklick / Esc). Global, einmal gebunden.
function closeAllAdminInfoGlobal() {
  app.querySelectorAll('.admin-info-btn[aria-expanded="true"]').forEach((b) => {
    b.setAttribute("aria-expanded", "false");
    if (b.nextElementSibling) b.nextElementSibling.classList.remove("admin-info-pop--flip");
  });
}

// Ruhige, eingeklappte Begriffs-Legende (kein großer Erklärtext in der Hauptansicht).
// Erklärt v. a. die Kachel-Begriffe, die nicht direkt am Wert ein Info-Symbol tragen.
function renderAdminGlossary() {
  const terms = ["System", "Datenstand", "Pipeline", "Quellen", "Understanding", "Watchdog", "Morgen-Check", "Pending", "Failed", "Complete", "Understanding-Lock", "Recovery", "Knowledge Objects", "Briefing-Punkte", "Lage-Vorgänge", "Radar-Signale", "KI-Kosten", "Calls", "Datenstatus", "Version"];
  const items = terms.map((t) => `<div class="admin-gl-item"><dt>${escapeHtml(t)}</dt><dd>${escapeHtml(ADMIN_GLOSSARY[t])}</dd></div>`).join("");
  return `<details class="admin-glossary"><summary class="admin-details-sum">Begriffe erklärt</summary><dl class="admin-gl-list">${items}</dl></details>`;
}

// ── Struktur-Helfer für das Betreiber-Kontrollzentrum ─────────────────────────
// Klarer Bereich mit Überschrift. Reine Gliederung, keine neuen Daten.
function adminSection(title, sub, inner, id) {
  return `
    <section class="admin-sec"${id ? ` id="${escapeAttribute(id)}"` : ""}>
      <div class="admin-sec-head">
        <h2 class="admin-sec-title">${escapeHtml(title)}</h2>
        ${sub ? `<span class="admin-sec-sub">${escapeHtml(sub)}</span>` : ""}
      </div>
      ${inner}
    </section>`;
}

// Aufklappbarer Detailbereich (zugeklappt per Default) — hält technisches Rohmaterial
// aus der Hauptansicht, ohne es zu entfernen. Rein visuell; Inhalt bleibt im DOM.
function adminDetails(label, inner, open = false) {
  return `<details class="admin-details"${open ? " open" : ""}>
    <summary class="admin-details-sum">${escapeHtml(label)}</summary>
    <div class="admin-details-body">${inner}</div>
  </details>`;
}

// Kompakte Kennzahl-Kachel (wiederverwendet die bestehende admin-stat-Optik).
function adminStatCell(value, label, tone, info) {
  return `<div class="admin-stat-card"><span class="admin-stat-num${tone ? ` admin-stat-num--${escapeAttribute(tone)}` : ""}">${escapeHtml(String(value))}</span><span class="admin-stat-label">${escapeHtml(label)}${info ? adminInfo(info) : ""}</span></div>`;
}

// Echte Handlungsbedarf-Punkte aus bereits geladenen Daten (kein KI-Call, keine
// Aktion). Leere Liste => „Alles ruhig". Erfindet nichts.
function adminActionItems(ds, rec) {
  const g = (ds && ds.global) || null;
  const koRaw = rec && rec.knowledgeObjects;
  const ko = (koRaw && koRaw.available !== false) ? koRaw : null;
  const q = g && g.quellen;
  const items = [];
  // target = sicheres internes Sprungziel (nur Scrollen, keine Aktion).
  if (ko && dsNum(ko.failed) > 0) items.push({ level: "bad", target: "admin-recovery", title: `${dsNum(ko.failed)} Understanding-Vorgänge fehlgeschlagen`, detail: `Im Datenmotor unter „Recovery (intern)“ prüfen und ggf. „Failed → Pending“ zurücksetzen.` });
  if (g && g.letzterFehler && g.letzterFehler.headline) items.push({ level: "bad", target: "admin-datenmotor", title: `Letzter Fehler: ${g.letzterFehler.headline}`, detail: `${g.letzterFehler.reason ? g.letzterFehler.reason : "Details unter „System und Sicherheit“."}${g.letzterFehler.when ? ` · ${dsDateLabel(g.letzterFehler.when)}` : ""}` });
  if (rec && rec.understandingLock && rec.understandingLock.verdaechtig) items.push({ level: "warn", target: "admin-recovery", title: "Understanding-Lock wirkt veraltet", detail: `Ein Lock hängt möglicherweise. Im Datenmotor unter „Recovery (intern)“ „Lock lösen“, falls kein Lauf mehr aktiv ist.` });
  if (ko && dsNum(ko.pending) > 0) items.push({ level: "warn", target: "admin-recovery", title: `${dsNum(ko.pending)} Understanding-Vorgänge warten`, detail: "Warten auf Verarbeitung — der nächste Lauf holt sie nach." });
  if (q && dsNum(q.fehlgeschlagen) > 0) items.push({ level: "warn", target: "admin-datenmotor", title: `${dsNum(q.fehlgeschlagen)} von ${dsNum(q.geprueft)} Quellen mit Fehlern`, detail: "Einzelne Quellen lieferten im letzten Lauf keine Daten. Im Datenmotor prüfen." });
  if (g && g.kiAnalyseFehler) items.push({ level: "warn", target: "admin-datenmotor", title: "KI-Analyse heute mit Fehlern", detail: "Einzelne KI-Calls sind heute fehlgeschlagen. KI-Status im Datenmotor prüfen." });
  return items;
}

// B. Handlungsbedarf — nur echte Hinweise, sonst ruhiger Leerzustand. Keine Buttons:
// echte (gefährliche) Aktionen bleiben ausschließlich im markierten Recovery-Bereich.
function renderAdminActionCenter(ds, rec) {
  const items = adminActionItems(ds, rec);
  // Jeder Hinweis mit sicherem Ziel wird zu einem internen Sprung-Anker (nur Scrollen).
  // Ohne Ziel bleibt er nicht klickbar (reiner Text). Keine Aktion, kein Button.
  const renderItem = (it) => {
    const body = `
        <span class="ac-dot" aria-hidden="true"></span>
        <div class="ac-body">
          <p class="ac-title">${escapeHtml(it.title)}</p>
          ${it.detail ? `<p class="ac-detail">${escapeHtml(it.detail)}</p>` : ""}
        </div>${it.target ? `<span class="ac-chevron" aria-hidden="true">›</span>` : ""}`;
    if (it.target) {
      return `<a class="ac-item ac-item--${escapeAttribute(it.level)} ac-item--link" href="#${escapeAttribute(it.target)}" data-admin-jump="${escapeAttribute(it.target)}" title="Zum Bereich springen: ${escapeAttribute(adminJumpLabel(it.target))}" aria-label="${escapeAttribute(it.title)} — zum Bereich ${escapeAttribute(adminJumpLabel(it.target))} springen">${body}</a>`;
    }
    return `<div class="ac-item ac-item--${escapeAttribute(it.level)}">${body}</div>`;
  };
  const inner = items.length
    ? `<div class="ac-list">${items.map(renderItem).join("")}</div>`
    : `<div class="ac-list"><p class="ac-empty">Alles ruhig. Kein Eingreifen nötig.</p></div>`;
  return adminSection("Handlungsbedarf", items.length ? `${items.length} ${items.length === 1 ? "Hinweis" : "Hinweise"}` : "", inner, "admin-handlungsbedarf");
}

// C. Datenmotor — kompakte Kernzahlen (Rest steckt in „Details anzeigen").
function renderAdminDatenmotorSummary(ds, rec, crawlReport) {
  const g = (ds && ds.global) || {};
  const ko = (rec && rec.knowledgeObjects && rec.knowledgeObjects.available !== false) ? rec.knowledgeObjects : null;
  const lock = (rec && rec.understandingLock) || {};
  const cr = crawlReport && !crawlReport.noData ? crawlReport : null;
  const cell = (k, v, tone, info) => `<div class="dm-cell"><span class="dm-k">${escapeHtml(k)}${info ? adminInfo(info) : ""}</span><span class="dm-v${tone ? ` dm-v--${tone}` : ""}">${v}</span></div>`;
  const lockText = lock.aktiv ? `<span class="ds-warn">Aktiv</span>` : lock.verdaechtig ? `<span class="ds-warn">Veraltet</span>` : (rec ? `<span class="ds-ok">Frei</span>` : "—");
  const failed = ko ? dsNum(ko.failed) : null;
  return `<div class="dm-summary">
    ${cell("Letzter Lauf", g.letzterLauf ? escapeHtml(adminRelAge(g.letzterLauf)) : "—")}
    ${cell("Quellen", g.quellen ? `${dsNum(g.quellen.erfolgreich)}/${dsNum(g.quellen.geprueft)}` : "—", null, "Quellen")}
    ${cell("Neue Dokumente", cr && cr.deduplicatedArticles != null ? escapeHtml(String(cr.deduplicatedArticles)) : "—")}
    ${cell("Knowledge Objects", cr && cr.newKnowledgeObjects != null ? escapeHtml(String(cr.newKnowledgeObjects)) : (ko ? escapeHtml(String(dsNum(ko.complete))) : "—"), null, "Knowledge Objects")}
    ${cell("Pending", ko ? escapeHtml(String(dsNum(ko.pending))) : "—", null, "Pending")}
    ${cell("Failed", failed == null ? "—" : String(failed), failed > 0 ? "bad" : null, "Failed")}
    ${cell("Lock", lockText, null, "Understanding-Lock")}
  </div>`;
}

// D. Profile — kompakte Summe + verdichtete Liste (große Karten nur in Details).
function renderAdminProfilesSection(ds, detailsInner) {
  const g = (ds && ds.global) || {};
  const accounts = Array.isArray(ds && ds.perAccount) ? ds.perAccount : [];
  const complete = accounts.filter((a) => a.profilVollstaendigkeit && a.profilVollstaendigkeit.complete).length;
  const problems = accounts.filter((a) => a.ampel && a.ampel !== "gruen").length;
  const profLabel = { full: "Vollständig", restricted: "Eingeschränkt", empty: "Kein Profil" };
  const dotCls = (a) => a === "gruen" ? "ok" : a === "gelb" ? "warn" : a === "rot" ? "bad" : "unknown";
  const summary = `<div class="admin-stats-row admin-stats-row--5">
    ${adminStatCell(g.profile ? dsNum(g.profile.ausgewertet) : accounts.length, "Profile aktiv")}
    ${adminStatCell(complete, "Vollständig")}
    ${adminStatCell(g.briefing ? dsNum(g.briefing.sichtbarBeiAccounts) : "—", "Briefings sichtbar")}
    ${adminStatCell(problems, "Mit Problemen", problems > 0 ? "warn" : null)}
    ${adminStatCell(g.profile ? dsNum(g.profile.personalisierungEingeschraenkt) : "—", "Eingeschränkt")}
  </div>`;
  const rows = accounts.length
    ? accounts.map((a) => `<tr>
        <td data-label="Name"><span class="pf-dot pf-dot--${dotCls(a.ampel)}" aria-hidden="true"></span>${escapeHtml(a.name || a.politicianId || "")}</td>
        <td data-label="Status">${a.ampel === "gruen" ? "In Ordnung" : a.ampel === "gelb" ? "Eingeschränkt" : a.ampel === "rot" ? "Kein Wert" : "—"}</td>
        <td data-label="Profil">${escapeHtml(profLabel[a.profilVollstaendigkeit && a.profilVollstaendigkeit.level] || "—")}</td>
        <td data-label="Briefing">${a.briefingSichtbar ? "Ja" : "Nein"}</td>
        <td data-label="Punkte">${dsFmt(a.briefingPunkte)}</td>
        <td data-label="Kosten heute">${dsCost(a.kiKosten)}</td>
      </tr>`).join("")
    : `<tr><td colspan="6" class="empty-state">Noch keine Accounts zur Auswertung.</td></tr>`;
  const list = `<div class="admin-table-wrap"><table class="admin-table admin-table--compact">
    <thead><tr><th>Name</th><th>Status</th><th>Profil</th><th>Briefing</th><th>Punkte${adminInfo("Briefing-Punkte")}</th><th>Kosten heute${adminInfo("KI-Kosten")}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  return adminSection("Profile", `${accounts.length} ${accounts.length === 1 ? "Account" : "Accounts"}`, `${summary}${list}${detailsInner ? adminDetails("Verwaltung & Detailkarten anzeigen", detailsInner) : ""}`, "admin-profile");
}

// E. Kosten intern — leiser, verdichteter Kopf (Details eingeklappt).
function renderAdminKostenSummary(stats, periodLabel) {
  const cost = stats && typeof stats.totalCostUsd === "number" ? stats.totalCostUsd : null;
  const calls = stats && stats.totalCalls != null ? stats.totalCalls : null;
  const perUser = Array.isArray(stats && stats.perUser)
    ? stats.perUser.slice().sort((a, b) => (b.totalCostUsd || 0) - (a.totalCostUsd || 0))
    : [];
  const top = perUser[0];
  return `<div class="admin-stats-row admin-stats-row--3">
    ${adminStatCell(cost != null ? `$${cost.toFixed(3)}` : "—", `Kosten ${periodLabel}`, "cost", "KI-Kosten")}
    ${adminStatCell(calls != null ? String(calls) : "—", "Calls", null, "Calls")}
    ${adminStatCell(top && top.totalCostUsd != null ? `$${fmtCost(top.totalCostUsd)}` : "—", top ? `Top: ${top.name || top.userId}` : "Top Nutzer")}
  </div>`;
}

// ============================================================================
// Sprint 8 — Admin: Quellenarchitektur (macht Sprint 4/5/7 sichtbar). Ruhig, hochwertig,
// wiederverwendete Muster (adminSection/dsRow/ds-unavail/op-tile/ac-item). Rendert NUR
// bereits geladene Daten (adminData.sourceArchitecture); fehlt sie -> nichts (Alt-Admin
// unveraendert). Kein KI-Call, keine Aktion, keine erfundenen Zahlen.
// ============================================================================
function saBadge(label, tone) { return `<span class="sa-badge sa-badge--${escapeAttribute(tone || "muted")}">${escapeHtml(label)}</span>`; }
function saUnavail(text) { return `<span class="ds-unavail">${escapeHtml(text || "Noch nicht verfügbar")}</span>`; }
const SA_HEALTH = { gesund: ["Gesund", "ok"], defekt: ["Defekt", "bad"], unbekannt: ["Unbekannt", "muted"], inaktiv: ["Inaktiv", "muted"] };
const SA_VALUE = { ergiebig: ["Nutzen", "ok"], nur_duplikate: ["Nur Duplikate", "bad"], ohne_ko: ["Kein KO", "warn"], keine_dokumente: ["Keine Dokumente", "muted"], unbestaetigt: ["Unbestätigt", "muted"] };
function saHealthBadge(h) { const [l, t] = SA_HEALTH[h] || ["Unbekannt", "muted"]; return saBadge(l, t); }
function saValueBadge(v) { const [l, t] = SA_VALUE[v] || ["Unbestätigt", "muted"]; return saBadge(l, t); }
function saUsd(usd) { if (usd == null) return "–"; const n = Number(usd); return n === 0 ? "$0" : `$${n.toFixed(n < 0.01 ? 4 : 2)}`; }
function saNumOrUnavail(v, unit) { return v == null ? saUnavail("nicht verfügbar") : `${escapeHtml(String(v))}${unit ? " " + escapeHtml(unit) : ""}`; }

function renderSaLaenderPakete(sa) {
  const lp = sa.views.laenderPakete;
  const withModule = lp.laender.filter((l) => l.status !== "kein_modul");
  const laenderRows = withModule.map((l) => {
    const badge = l.status === "aktiv" ? saBadge("Aktiv", "ok") : saBadge("Vorbereitet", "warn");
    const rd = l.readiness;
    let body;
    if (rd && rd.available) {
      // Kandidaten-Land: Reifegrad EHRLICH — Kandidatenabdeckung ist NICHT Einsatzbereitschaft.
      const abgedeckt = rd.klassenAbgedeckt != null ? rd.klassenAbgedeckt : rd.besetzt;
      const abdeckung = `Kandidatenabdeckung ${abgedeckt}/${rd.klassenGesamt}${rd.unbesetzt ? ` · ${rd.unbesetzt} unbesetzt` : ""} — noch nicht technisch verifiziert`;
      const reifegrad = `<div class="sa-badges">${saBadge(`${rd.kandidat} Kandidat`, "warn")}${rd.verifiziert ? saBadge(`${rd.verifiziert} verifiziert`, "ok") : ""}${saBadge(`${rd.einsatzbereit} einsatzbereit`, rd.einsatzbereit > 0 ? "ok" : "muted")}</div>`;
      const unbesetztLine = rd.unbesetzt ? `<span class="sa-sub">Pilotklassen offen: <b>${escapeHtml((rd.unbesetzteKlassen || []).join(", "))}</b> — kein Ersatz durch fremde Partei/Person.</span>` : "";
      body = `<span class="sa-sub">${escapeHtml(abdeckung)}</span>${reifegrad}${unbesetztLine}`;
    } else {
      body = l.pflichtklassen.total > 0
        ? `<span class="sa-sub">${l.pflichtklassen.total - l.pflichtklassen.missing.length}/${l.pflichtklassen.total} Pflichtklassen — <b>${l.pflichtklassen.missing.length} fehlen</b></span>`
        : `<span class="sa-sub">keine Pflichtklassen-Vorgabe</span>`;
    }
    return `<div class="sa-item"><div class="sa-item-main"><span class="sa-item-name">${escapeHtml(l.name)}</span>${badge}</div>${body}</div>`;
  }).join("");
  const rest = `<p class="sa-note">${sa.counts.laenderKeinModul} weitere Bundesländer haben noch kein Landesmodul. „Vorbereitet" = Quellen als Kandidat recherchiert, aber noch nicht technisch verifiziert und nicht aktiv (0 einsatzbereit).</p>`;
  const paketRows = lp.pakete.map((p) => {
    const tone = p.supply === "vollstaendig" ? "ok" : p.supply === "unterversorgt" ? "bad" : p.supply === "vorbereitet" ? "warn" : "muted";
    const supplyLabel = { vollstaendig: "Vollständig", teilversorgt: "Teilversorgt", unterversorgt: "Unterversorgt", vorbereitet: "Vorbereitet", leer: "Leer", unbekannt: "Unbekannt" }[p.supply] || p.supply;
    const meta = `${p.pathCount != null ? `${p.pathCount} Abrufwege` : ""}${p.refCount ? ` · ${p.refCount} Profil${p.refCount === 1 ? "" : "e"}` : ""}${p.is_base ? " · Pflicht" : ""}`;
    return `<div class="sa-item"><div class="sa-item-main"><span class="sa-item-name">${escapeHtml(p.name)}</span>${saBadge(supplyLabel, tone)}</div><span class="sa-sub">${escapeHtml(meta)}</span></div>`;
  }).join("");
  const inner = `
    <div class="sa-block"><h3 class="sa-h3">Bundesländer <span class="sa-count">${sa.counts.laenderAktiv} aktiv · ${sa.counts.laenderVorbereitet} vorbereitet</span></h3>
      <div class="sa-list">${laenderRows || `<p class="ac-empty">Noch kein Landesmodul.</p>`}</div>${rest}</div>
    <div class="sa-block"><h3 class="sa-h3">Pakete <span class="sa-count">${lp.pakete.length}</span></h3>
      <div class="sa-list">${paketRows}</div></div>`;
  return adminSection("Länder und Pakete", "Welche Länder aktiv oder vorbereitet sind", inner, "admin-sa-laender");
}

function renderSaQuellen(sa) {
  const qa = sa.views.quellenAbrufwege;
  const hc = qa.healthCounts;
  const summary = `<div class="sa-badges">${saBadge(`${hc.gesund} gesund`, "ok")}${saBadge(`${hc.defekt} defekt`, "bad")}${saBadge(`${hc.unbekannt} unbekannt`, "muted")}${hc.inaktiv ? saBadge(`${hc.inaktiv} inaktiv`, "muted") : ""}</div>`;
  const note = !sa.availability.documents ? `<p class="sa-note">Health-Signal aus Status + Dokument-Frische. Ohne geladene Dokumentdaten sind funktionierende Wege „Unbekannt" (nicht „gesund" erfunden).</p>` : "";
  // Herausgeber mit defekten Wegen zuerst; Rest in Details.
  const withBroken = qa.herausgeber.filter((h) => h.paths.some((p) => p.health === "defekt"));
  const row = (h) => {
    const badges = h.paths.map((p) => p.health === "defekt" ? "●" : p.health === "gesund" ? "○" : "·").join("");
    const worst = h.paths.some((p) => p.health === "defekt") ? saBadge("Defekt", "bad") : h.paths.every((p) => p.health === "gesund") ? saBadge("Gesund", "ok") : saBadge("Unbekannt", "muted");
    return `<div class="sa-item"><div class="sa-item-main"><span class="sa-item-name">${escapeHtml(h.name)}</span>${worst}</div><span class="sa-sub">${h.paths.length} Abrufweg${h.paths.length === 1 ? "" : "e"}</span></div>`;
  };
  const brokenList = withBroken.length ? `<div class="sa-list">${withBroken.map(row).join("")}</div>` : `<p class="ac-empty">Kein Herausgeber mit defektem Abrufweg.</p>`;
  const fullList = adminDetails(`Alle ${qa.herausgeber.length} Herausgeber anzeigen`, `<div class="sa-list">${qa.herausgeber.map(row).join("")}</div>`);
  const inner = `${summary}${note}<h3 class="sa-h3">Herausgeber mit Prüfbedarf</h3>${brokenList}${fullList}`;
  return adminSection("Quellen und Abrufwege", `${qa.pathCount} Abrufwege · ${qa.herausgeber.length} Herausgeber`, inner, "admin-sa-quellen");
}

function renderSaProfile(sa) {
  const rows = sa.views.profileVersorgung.map((p) => {
    const tone = p.supply === "versorgt" ? "ok" : p.supply === "unversorgt" ? "bad" : "muted";
    const label = { versorgt: "Versorgt", unversorgt: "Unversorgt", nicht_aktivierbar: "Nicht aktivierbar" }[p.supply] || p.supply;
    const pkgs = (p.requiredPackages || []).map((k) => `<span class="ds-chip">${escapeHtml(k)}</span>`).join("");
    const missing = (p.missingBasePackages || []).length ? `<span class="sa-sub">fehlt: <b>${escapeHtml(p.missingBasePackages.map((m) => m.key).join(", "))}</b></span>` : "";
    return `<div class="sa-item"><div class="sa-item-main"><span class="sa-item-name">${escapeHtml(p.profileId)}</span>${saBadge(label, tone)}</div><div class="ds-chips">${pkgs}</div>${missing}</div>`;
  }).join("");
  const inner = `<div class="sa-badges">${saBadge(`${sa.counts.profileVersorgt} versorgt`, "ok")}${saBadge(`${sa.counts.profileUnversorgt} unversorgt`, "bad")}</div><div class="sa-list">${rows || `<p class="ac-empty">Keine Profile.</p>`}</div>`;
  return adminSection("Profile und Paketversorgung", "Welche Profile versorgt oder unversorgt sind", inner, "admin-sa-profile");
}

function renderSaPruefbedarf(sa) {
  const pb = sa.views.pruefbedarf;
  const items = pb.actions.map((a) => {
    const lvl = a.severity === "hoch" ? "bad" : "warn";
    return `<div class="ac-item ac-item--${lvl}"><span class="ac-dot" aria-hidden="true"></span><div class="ac-body"><p class="ac-title">${escapeHtml(a.text)}</p><p class="ac-detail">${escapeHtml(a.area)} · ${escapeHtml(String(a.ref))}</p></div></div>`;
  }).join("");
  const list = pb.actions.length ? `<div class="ac-list">${items}</div>` : `<div class="ac-list"><p class="ac-empty">Kein konkreter Prüfbedarf. Alles ruhig.</p></div>`;
  const missing = pb.missingMetrics.length
    ? `<div class="sa-block"><h3 class="sa-h3">Noch nicht verfügbare Messwerte</h3><ul class="sa-missing">${pb.missingMetrics.map((m) => `<li>${saUnavail(m)}</li>`).join("")}</ul><p class="sa-note">Diese Werte erscheinen nach Migration/Shadow-Ingest — bewusst nicht geschätzt.</p></div>`
    : "";
  return adminSection("Prüfbedarf", pb.actions.length ? `${pb.actions.length} ${pb.actions.length === 1 ? "Punkt" : "Punkte"}` : "", `${list}${missing}`, "admin-sa-pruefbedarf");
}

function renderSaQuellendetail(sa) {
  const paths = sa.views.quellendetail.paths;
  const byPub = new Map();
  for (const p of paths) { const k = p.publisher || "Unbekannt"; if (!byPub.has(k)) byPub.set(k, []); byPub.get(k).push(p); }
  const groups = [...byPub.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([pub, list]) => {
    const rows = list.map((p) => {
      const detail = [
        dsRow("Methode", escapeHtml(p.method || "–")),
        dsRow("Status / Health", `${escapeHtml(p.status)} · ${saHealthBadge(p.health)}${p.is_critical ? " " + saBadge("Pflicht", "warn") : ""}`),
        dsRow("Dokumente", saNumOrUnavail(p.documentCount)),
        dsRow("Knowledge Objects", saNumOrUnavail(p.koCount)),
        dsRow("Duplikate", saNumOrUnavail(p.duplicateCount)),
        dsRow("Produktnutzen", saValueBadge(p.value)),
        dsRow("Pakete", p.packages.length ? p.packages.map((k) => `<span class="ds-chip">${escapeHtml(k)}</span>`).join("") : "–"),
        dsRow("Kosten", p.cost && p.cost.available ? saUsd(p.cost.usd) : saUnavail("noch nicht zuordenbar")),
        p.recommendedAction && p.recommendedAction.severity !== "keine" ? dsRow("Empfehlung", escapeHtml(p.recommendedAction.text)) : ""
      ].join("");
      return `<div class="sa-detail-card"><div class="sa-detail-head"><span class="sa-item-name">${escapeHtml(p.name)}</span>${saHealthBadge(p.health)}</div>${detail}</div>`;
    }).join("");
    return adminDetails(`${escapeHtml(pub)} — ${list.length} Abrufweg${list.length === 1 ? "" : "e"}`, rows);
  }).join("");
  return adminSection("Quellendetail", "Herausgeber → Abrufwege im Detail", `<p class="sa-note">Aufklappen für Herausgeber-Details. Kennzahlen erscheinen, sobald Bestandsdaten/Migration vorliegen.</p>${groups}`, "admin-sa-detail");
}

function renderSaKosten(sa) {
  const kn = sa.views.kostenNutzen;
  const c = kn.costs;
  const stepRows = Object.entries(c.byPipelineStep || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => dsRow(k, saUsd(v))).join("");
  const modelRows = Object.entries(c.byModel || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => dsRow(k, saUsd(v))).join("");
  const kostenBlock = c.records > 0
    ? `${dsRow("Gesamt (Zeitfenster)", `<b>${saUsd(c.totalUsd)}</b> · ${c.records} Calls`)}
       <div class="sa-block"><h3 class="sa-h3">Je Pipeline-Schritt</h3>${stepRows || saUnavail("keine")}</div>
       <div class="sa-block"><h3 class="sa-h3">Je Modell</h3>${modelRows || saUnavail("keine")}</div>
       <p class="sa-note">${!c.sourceAttributionAvailable ? "Kosten je Quelle noch nicht zuordenbar — llm_usage trägt noch keine sourceId (freigabepflichtige Verdrahtung)." : (c.unattributedUsd > 0 ? `Kosten teilweise je Quelle zugeordnet; ${saUsd(c.unattributedUsd)} noch nicht zuordenbar.` : "Kosten je Quelle zugeordnet.")}</p>`
    : `<p class="ac-empty">Keine KI-Kosten im Zeitfenster.</p>`;
  const nutzenRows = kn.kostenOhneNutzen.length
    ? kn.kostenOhneNutzen.map((s) => `<div class="sa-item"><div class="sa-item-main"><span class="sa-item-name">${escapeHtml(s.name || s.legacy_source_id)}</span>${saValueBadge(s.value)}</div><span class="sa-sub">${escapeHtml(s.recommendedAction ? s.recommendedAction.text : "")}</span></div>`).join("")
    : `<p class="ac-empty">${sa.availability.documents ? "Keine Quelle erzeugt aktuell Kosten ohne Nutzen." : "Nutzendaten noch nicht verfügbar — erscheint nach Ingest."}</p>`;
  const inner = `<div class="sa-block"><h3 class="sa-h3">KI-Kosten</h3>${kostenBlock}</div>
    <div class="sa-block"><h3 class="sa-h3">Kosten ohne Nutzen</h3><div class="sa-list">${nutzenRows}</div></div>`;
  return adminSection("Kosten und Produktnutzen", "Was Geld kostet — und was Nutzen bringt", inner, "admin-sa-kosten");
}

function renderAdminQuellenarchitektur(sa) {
  if (!sa || !sa.views) return "";
  const migBanner = !sa.migration.newTablesMigrated
    ? `<div class="sa-mig-note">${escapeHtml(sa.migration.note)}</div>`
    : "";
  const tiles = [
    opTile("Länder", sa.counts.laenderAktiv ? "ok" : "unknown", `${sa.counts.laenderAktiv} aktiv`, `${sa.counts.laenderVorbereitet} vorbereitet`, null, "admin-sa-laender"),
    opTile("Abrufwege", sa.counts.abrufwegeDefekt ? "warn" : "unknown", `${sa.counts.abrufwegeDefekt} defekt`, `${sa.counts.abrufwegeGesund} gesund · ${sa.counts.abrufwegeUnbekannt} unbekannt`, null, "admin-sa-quellen"),
    opTile("Profile", sa.counts.profileUnversorgt ? "warn" : "ok", `${sa.counts.profileVersorgt} versorgt`, `${sa.counts.profileUnversorgt} unversorgt`, null, "admin-sa-profile"),
    opTile("Prüfbedarf", sa.counts.pruefbedarf ? "bad" : "ok", `${sa.counts.pruefbedarf} ${sa.counts.pruefbedarf === 1 ? "Punkt" : "Punkte"}`, "konkrete Probleme", null, "admin-sa-pruefbedarf")
  ];
  return `
    ${adminSection("Quellenarchitektur", "Länder · Pakete · Quellen · Profile · Kosten (Sprint 4/5/7 sichtbar gemacht)",
      `${migBanner}<div class="op-tiles">${tiles.join("")}</div>`, "admin-quellenarchitektur")}
    ${renderSaQuellenmodus(sa)}
    ${renderSaLaenderPakete(sa)}
    ${renderSaQuellen(sa)}
    ${renderSaProfile(sa)}
    ${renderSaPruefbedarf(sa)}
    ${renderSaQuellendetail(sa)}
    ${renderSaKosten(sa)}`;
}

// Quellenmodus (off/shadow/on) + Vergleich alter Katalog vs. relationaler Plan.
// EHRLICH: ohne erreichbare relationale Tabellen nur der Hinweis, keine erfundenen Zahlen.
function renderSaQuellenmodus(sa) {
  const qm = sa.quellenmodus;
  if (!qm) return "";
  const modusBadge = qm.modus === "on" ? saBadge("ON — Cutover", "bad")
    : qm.modus === "shadow" ? saBadge("Shadow — Vergleich", "warn")
    : qm.modus === "off" ? saBadge("Off — alter Katalog aktiv", "ok")
    : saBadge("Unbekannt", "muted");
  if (!qm.datenquelle) {
    return `<div class="admin-card"><div class="sa-item-main"><span class="sa-item-name">Quellenmodus</span>${modusBadge}</div><p class="sa-note">${escapeHtml(qm.hinweis || "")}</p></div>`;
  }
  const abw = qm.abweichungen || {};
  const fehlend = abw.fehlendImRelationalen || [];
  const zusaetzlich = abw.zusaetzlichImRelationalen || [];
  return `
    <div class="admin-card">
      <div class="sa-item-main"><span class="sa-item-name">Quellenmodus</span>${modusBadge}</div>
      <div class="admin-sys-grid">
        <div class="admin-sys-item"><span class="admin-sys-key">Alter Plan (aktiver Katalog)</span><span class="admin-sys-val">${escapeHtml(String(qm.alterPlan.quellen))} geteilte Quellen</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Relationaler Plan</span><span class="admin-sys-val">${escapeHtml(String(qm.relationalerPlan.aktiv))} aktiv · ${escapeHtml(String(qm.relationalerPlan.defekt))} defekt · ${escapeHtml(String(qm.relationalerPlan.ausgeschlossen))} ausgeschlossen</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Aktivierung</span><span class="admin-sys-val">${escapeHtml(String(qm.aktivierung.aktiveProfile))} Profile → ${escapeHtml(String(qm.aktivierung.aktivePakete))} Pakete</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Abweichungen</span><span class="admin-sys-val">${fehlend.length ? `${fehlend.length} fehlend (${escapeHtml(fehlend.slice(0, 4).join(", "))}${fehlend.length > 4 ? "…" : ""})` : "0 fehlend"} · ${zusaetzlich.length} zusätzlich</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Defekte Wege (kein Abruf)</span><span class="admin-sys-val">${(qm.defekteWege || []).length ? escapeHtml(qm.defekteWege.join(", ")) : "–"}</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Berlin/Brandenburg</span><span class="admin-sys-val">${escapeHtml(String(qm.landesmodulGesperrt))} Wege vorbereitet und GESPERRT (inaktiv)</span></div>
        ${qm.letzterShadowLauf ? `
        <div class="admin-sys-item"><span class="admin-sys-key">Letzter Shadow-Messlauf</span><span class="admin-sys-val">${escapeHtml(formatBriefingDate(qm.letzterShadowLauf.savedAt))} · relational ${escapeHtml(String(qm.letzterShadowLauf.relational?.dokumente ?? "–"))}/${escapeHtml(String(qm.letzterShadowLauf.alt?.dokumente ?? "–"))} Docs (${escapeHtml(String(qm.letzterShadowLauf.vergleich?.abdeckungDokumenteProzent ?? "–"))}%) · Dedup: ${escapeHtml(String(qm.letzterShadowLauf.dedupDryRun?.eindeutigeDokumente ?? "–"))} eindeutig / ${escapeHtml(String(qm.letzterShadowLauf.dedupDryRun?.fundstellen ?? "–"))} Fundstellen · +$0</span></div>` : `
        <div class="admin-sys-item"><span class="admin-sys-key">Letzter Shadow-Messlauf</span><span class="admin-sys-val"><span class="ds-unavail">noch kein Lauf (erst ab Modus shadow + nächstem Crawl)</span></span></div>`}
      </div>
      <p class="sa-note">${escapeHtml(qm.hinweis || "")}</p>
    </div>`;
}

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
        <span class="eyebrow-line">Betrieb</span>
        <h1 class="admin-title">Admin</h1>
        <p class="admin-subtitle">Betreiber-Übersicht: Systemzustand, Datenmotor, Pipeline, Quellen und Nutzer.${sys.deploy?.commit || sys.deploy?.version ? ` <span class="admin-version-tag" title="Laufende Deploy-Version${sys.deploy?.environment ? ` · ${escapeHtml(adminEnvLabel(sys.deploy.environment))}` : ""}">Version ${escapeHtml(sys.deploy?.commit || sys.deploy?.version)}</span>` : ""}</p>
      </header>

      ${renderAdminOperatorOverview(data, adminDataStatus, adminRecovery)}

      ${renderAdminActionCenter(adminDataStatus, adminRecovery)}

      ${adminSection("Datenmotor", "Crawl · Verstehen · Recovery",
        `${renderAdminDatenmotorSummary(adminDataStatus, adminRecovery, data.crawlReport)}
         ${adminDetails("Crawl-Trichter & Datenstatus anzeigen", `${renderAdminCrawlStats(data.crawlReport)}${renderAdminDataStatus(adminDataStatus, "global")}`)}
         <div class="admin-recovery-wrap" id="admin-recovery">
           <p class="admin-recovery-flag">Interner Recovery-Bereich${adminInfo("Recovery")} — Aktionen laufen nur nach bewusstem Klick und mit Bestätigung.</p>
           ${adminDetails("Recovery-Aktionen (intern) anzeigen", safeRenderAdminRecovery(adminRecovery, adminRecoveryResult, adminPendingDiagnose), adminRecoveryDetailsOpen || adminRecoveryBusy || adminPendingDiagnoseBusy)}
         </div>`,
        "admin-datenmotor"
      )}

      ${renderAdminProfilesSection(adminDataStatus, renderAdminProfileManagement(adminDataStatus, data, userRows, assignmentRows, referenten, mandateOptions, mandates, feedback))}

      ${adminSection("Kosten intern", "Nur im Admin sichtbar",
        `<div class="admin-period-toggle">
           <button class="admin-period-btn${adminPeriod === "today" ? " is-active" : ""}" type="button" data-admin-period="today">Heute</button>
           <button class="admin-period-btn${adminPeriod === "days30" ? " is-active" : ""}" type="button" data-admin-period="days30">30 Tage</button>
         </div>
         ${renderAdminKostenSummary(data.stats?.[adminPeriod], adminPeriod === "today" ? "heute" : "30 Tage")}
         ${adminDetails("Kosten pro Engine & pro Nutzer anzeigen", `<div class="admin-charts-row">${renderAdminEngineChart(data.stats?.[adminPeriod])}${renderAdminCostsCard(data.stats?.[adminPeriod])}</div>`)}`,
        "admin-kosten"
      )}

      ${data.sourceArchitecture ? renderAdminQuellenarchitektur(data.sourceArchitecture) : ""}

      ${adminSection("System und Sicherheit", "Version · Umgebung · Dienste · Zugriff", renderAdminSystemBody(sys, data, adminDataStatus, errors, audit), "admin-system")}

    </div>
  `;
}

// Profile-Detailbereich (in „Verwaltung & Detailkarten anzeigen" eingeklappt): die
// großen Pro-Account-Karten sowie die vollständige Nutzer-/Zuweisungs-/Anlegen-
// Verwaltung + Mandate + Feedback. Markup unverändert übernommen — nur verschoben
// und eingeklappt, damit die Hauptansicht ruhig bleibt.
function renderAdminProfileManagement(ds, data, userRows, assignmentRows, referenten, mandateOptions, mandates, feedback) {
  return `
    ${renderAdminDataStatus(ds, "accounts")}
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

      </div>
    </div>

    ${renderAdminMandatesSection(mandates)}

    ${renderAdminFeedbackSection(feedback)}`;
}

// F. System und Sicherheit: Deploy-Identität, Dienste, Secrets-STATUS (nur ja/nein,
// keine Werte), Admin-Zugriff — plus Logs (Letzte Fehler & Audit) eingeklappt.
// Konfigurations-Diagnose (System & Sicherheit): zeigt AUSSCHLIESSLICH die vom Server
// gelieferte feste 7er-Whitelist nicht geheimer Helmut-Modus-/Limit-Variablen
// (sys.helmutConfig aus /api/admin/overview, admin-gegatet). Keine Schluessel/Tokens —
// der Server liefert strukturell nichts anderes. Ruhig und kompakt, kein Aktions-Button.
function renderAdminConfigDiagnose(sys) {
  const rows = Array.isArray(sys && sys.helmutConfig) ? sys.helmutConfig : [];
  if (!rows.length) return "";
  return `
    <div class="admin-card">
      <div class="admin-sys-grid">
        <div class="admin-sys-item"><span class="admin-sys-key">Helmut-Konfiguration${adminInfo("Diagnose der sieben nicht geheimen Modus-/Limit-Variablen — z. B. um vor einer Änderung des Tageslimits den bisherigen Wert (Rollback) abzulesen. Schlüssel/Tokens erscheinen hier nie.")}</span><span class="admin-sys-val">Umgebung: ${escapeHtml(adminEnvLabel(sys.deploy?.environment))}</span></div>
        ${rows.map((r) => {
          const quelle = r.quelle === "env" ? "Env" : r.quelle === "datei" ? "Datei-Flag" : "Default";
          const wirksam = r.wirksam != null ? r.wirksam : null;
          return `
        <div class="admin-sys-item">
          <span class="admin-sys-key">${escapeHtml(r.name)}</span>
          <span class="admin-sys-val" title="Quelle: ${escapeAttribute(quelle)} · Code-Default: ${escapeAttribute(r.codeDefault || "")}">${wirksam != null
            ? `${escapeHtml(wirksam)} <small>(${escapeHtml(quelle)})</small>`
            : `<span class="ds-unavail">nicht gesetzt → wirksam: ${escapeHtml(r.codeDefault || "")}</span>`}</span>
        </div>`;
        }).join("")}
      </div>
      <p class="admin-sys-note">Feste Whitelist — andere Umgebungsvariablen sind hier grundsätzlich nicht abrufbar.</p>
    </div>`;
}

function renderAdminSystemBody(sys, data, ds, errors, audit) {
  const ki = ds && ds.global && ds.global.kiStatus && ds.global.kiStatus.available !== false ? ds.global.kiStatus : null;
  const jaNein = (b) => b ? `<span class="ds-ok">Gesetzt</span>` : `<span class="ds-bad">Fehlt</span>`;
  const secretsRows = ki ? `
      <div class="admin-sys-item"><span class="admin-sys-key">KI-Schlüssel</span><span class="admin-sys-val">${jaNein(ki.azureKeyGesetzt)}</span></div>
      <div class="admin-sys-item"><span class="admin-sys-key">KI-Endpoint</span><span class="admin-sys-val">${jaNein(ki.azureEndpointGesetzt)}</span></div>` : "";
  return `
    <div class="admin-card">
      <div class="admin-sys-grid">
        <div class="admin-sys-item"><span class="admin-sys-key">Version${adminInfo("Version")}</span><span class="admin-sys-val" title="Laufende Deploy-Version (Commit)">${escapeHtml(sys.deploy?.commit || sys.deploy?.version || "—")}</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Umgebung</span><span class="admin-sys-val">${escapeHtml(adminEnvLabel(sys.deploy?.environment))}</span></div>
        ${sys.deploy?.branch ? `<div class="admin-sys-item"><span class="admin-sys-key">Branch</span><span class="admin-sys-val">${escapeHtml(sys.deploy.branch)}</span></div>` : ""}
        <div class="admin-sys-item"><span class="admin-sys-key">Datenstand</span><span class="admin-sys-val" title="Zeitpunkt dieser Admin-Auswertung">${escapeHtml(data.generatedAt ? dsDateLabel(data.generatedAt) : "—")}</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Speicher</span><span class="admin-sys-val">${escapeHtml(sys.storage?.backend || "?")}${sys.storage?.supabaseConfigured ? " ✓" : ""}</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">AI</span><span class="admin-sys-val">${sys.ai?.enabled ? "Aktiv" : "Aus"}</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Modell</span><span class="admin-sys-val">${escapeHtml(sys.ai?.model || "—")}</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Push</span><span class="admin-sys-val">${sys.push?.enabled ? "Aktiv" : "Aus"}</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Admin-Zugriff</span><span class="admin-sys-val">${sys.authMode ? "Rollen-geschützt" : "Pilot-Code"}</span></div>
        <div class="admin-sys-item"><span class="admin-sys-key">Briefings</span><span class="admin-sys-val">${escapeHtml(String(sys.store?.briefings?.total ?? "—"))}</span></div>
        ${secretsRows}
      </div>
      <p class="admin-sys-note">Secrets werden nur als Status angezeigt (gesetzt/fehlt) — nie im Klartext.</p>
    </div>
    ${renderAdminConfigDiagnose(sys)}
    ${adminDetails("Logs anzeigen (Letzte Fehler & Audit)", `
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
      </div>`)}`;
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
            <span class="cost-bar-amounts"><span class="cost-usd">$${fmtCost(u.totalCostUsd)}</span> <span class="cost-sep">|</span> <span class="cost-eur">€${fmtCost(u.totalCostUsd * USD_TO_EUR)}</span></span>
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
          <span class="cost-usd">$${fmtCost(usd)}</span>
          <span class="cost-sep">|</span>
          <span class="cost-eur">€${fmtCost(eur)}</span>
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

// Interner Datenmotor-Status (nur Admin/Betreiber): global + pro Account. Bewusst
// schlicht (kein Kunden-Dashboard) — Ziel: morgens sehen, ob Helmut echten Wert liefert.
// Kurzer, verständlicher Ersatz für "n/v" – abgeleitet aus dem Server-Hinweis.
function dsUnavailText(note) {
  const n = String(note || "").toLowerCase();
  if (/n(ae|ä)chst/.test(n)) return "Ab nächstem Lauf verfügbar";
  if (/supabase|v3-store|datenspeicher/.test(n)) return "Nur mit aktivem Datenspeicher";
  if (/laufzeit|mit daten/.test(n)) return "Noch nicht verfügbar";
  return "Nicht sicher ermittelbar";
}

// Wert sicher formatieren: NIE ein rohes Objekt ausgeben. Zahl -> Zahl,
// {available:false,note} -> verständlicher Hinweis, sonst "–".
function dsFmt(v) {
  if (v && typeof v === "object") {
    if (v.available === false) return `<span class="ds-unavail" title="${escapeHtml(v.note || "")}">${escapeHtml(dsUnavailText(v.note))}</span>`;
    if (typeof v.value === "number" || typeof v.value === "string") return escapeHtml(String(v.value));
    return `<span class="ds-unavail">Noch nicht verfügbar</span>`;
  }
  if (v === null || v === undefined) return "–";
  if (typeof v === "number") return escapeHtml(String(v));
  return escapeHtml(String(v));
}

// Numerische Koerzierung fuer Vergleiche/Guards (finite Zahl oder 0). Pendant zum
// gleichnamigen Server-Helfer; im Client zuvor versehentlich genutzt, aber nicht definiert.
function dsNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function dsRow(label, valueHtml) {
  return `<div class="ds-row"><span class="ds-row-label">${escapeHtml(label)}</span><span class="ds-row-value">${valueHtml}</span></div>`;
}

// Quellen nach Kategorie: echte Kategorie-Map -> Chips; sonst verständlicher Hinweis
// (verhindert das Rendern des rohen {value,available,note}-Objekts).
function dsCategories(nk) {
  if (!nk || typeof nk !== "object") return dsFmt(nk);
  if (nk.available === false) return `<span class="ds-unavail" title="${escapeHtml(nk.note || "")}">Ab nächstem Crawl-Lauf verfügbar</span>`;
  const parts = Object.entries(nk)
    .filter(([k]) => !["value", "available", "note"].includes(k))
    .map(([k, o]) => {
      const n = (o && typeof o === "object") ? (o.checked ?? o.count ?? o.value ?? o) : o;
      return `<span class="ds-chip">${escapeHtml(k)}<b>${dsFmt(n)}</b></span>`;
    });
  return parts.length ? `<div class="ds-chips">${parts.join("")}</div>` : `<span class="ds-unavail">Ab nächstem Crawl-Lauf verfügbar</span>`;
}

function dsCost(c) {
  if (!c || typeof c !== "object") return `<span class="ds-unavail">Keine Daten heute</span>`;
  if (c.estimatedUsd != null) return `$${escapeHtml(String(c.estimatedUsd))}${c.calls ? ` · ${escapeHtml(String(c.calls))} Calls` : ""}`;
  if (c.calls) return `${escapeHtml(String(c.calls))} Calls · <span class="ds-unavail" title="${escapeHtml(c.note || "")}">Kosten nicht ermittelbar</span>`;
  return `<span class="ds-unavail">Keine Daten heute</span>`;
}

function dsDateLabel(iso) {
  if (!iso) return "–";
  try { return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch (_) { return escapeHtml(String(iso)); }
}

// scope: "all" (Default) | "global" (nur Motor-Karte, ohne Pro-Account) | "accounts"
// (nur die Pro-Account-Detailkarten). Rein zur Gliederung — Pro-Account steckt jetzt
// verdichtet im Profile-Bereich, die großen Karten nur noch in dessen Detailansicht.
// Mehrmandantenfaehigkeit Phase 4: Profilkarte im Admin-Datenstatus. Zeigt den
// klaren Validierungszustand (Phase 5), fehlende Pflichtfelder, ob das Profil
// technisch/fachlich versorgt wird, das KI-Budget — plus Aktionen (Testbriefing,
// Bearbeiten, Aktiv/Inaktiv). Rein additiv; die Handler sind in bindAdminEvents.
function dsBudgetLabel(cent) {
  if (cent == null) return `<span class="ds-sub">Standard</span>`;
  const eur = (Number(cent) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${eur} €`;
}
// Klarer Versorgungs-Satz in einfacher Sprache (Anforderung Phase 4: technisch
// versorgt? fachlich dünn? leer?). Kein Fachjargon.
function dsSupplyLabel(a, val) {
  if (val && val.deaktiviert) return `<span class="ds-bad">Deaktiviert — erhält nichts</span>`;
  if (val && val.zustand === "fehlerhaft") return `<span class="ds-bad">Fehlerhaft — bitte korrigieren</span>`;
  if (val && val.zustand === "nicht_bereit") return `<span class="ds-bad">Profil leer — noch nicht nutzbar</span>`;
  const points = Number(a.briefingPunkte || 0) + Number(a.lageVorgaenge || 0);
  if (points === 0) return `<span class="ds-warn">Technisch versorgt, aber aktuell ohne passende Vorgänge (dünne Lage)</span>`;
  if (points < 5) return `<span class="ds-warn">Fachlich dünn versorgt (${points} Vorgänge)</span>`;
  return `<span class="ds-ok">Gut versorgt (${points} Vorgänge)</span>`;
}
function dsStateBadge(val) {
  const cls = { vollstaendig: "ok", teilweise: "warn", nicht_bereit: "bad", fehlerhaft: "bad", deaktiviert: "bad" }[val && val.zustand] || "sub";
  return `<span class="ds-state ds-state--${cls}">${escapeHtml((val && val.zustandLabel) || "–")}</span>`;
}
function renderAdminProfileCard(a, profilLabel) {
  const comp = a.profilVollstaendigkeit || {};
  const val = a.validierung || {};
  const missing = Array.isArray(val.fehlendePflichtfelder) && val.fehlendePflichtfelder.length
    ? val.fehlendePflichtfelder
    : (Array.isArray(comp.fehlendePflichtfelder) ? comp.fehlendePflichtfelder : []);
  const kontoBadge = a.kontoTyp ? `<span class="ds-badge ds-badge--${escapeHtml(String(a.kontoTyp).toLowerCase())}">${escapeHtml(a.kontoTyp)}</span>` : "";
  const budget = a.kiBudget || {};
  const pid = escapeHtml(a.politicianId || "");
  const aktiv = a.aktiv !== false;
  return `
    <div class="ds-account-card" data-profile-card="${pid}">
      <div class="ds-account-head">
        <span class="ds-account-name">${escapeHtml(a.name || a.politicianId || "")}</span>
        ${kontoBadge}
        ${dsStateBadge(val)}
      </div>
      ${dsRow("Versorgung", dsSupplyLabel(a, val))}
      ${dsRow("Profil", `${escapeHtml(profilLabel[comp.level] || comp.level || "–")}${a.personalisierungEingeschraenkt ? ` <span class="ds-warn">· Personalisierung eingeschränkt</span>` : ""}`)}
      ${missing.length ? dsRow("Fehlende Pflichtfelder", `<span class="ds-warn">${missing.map(escapeHtml).join(", ")}</span>`) : ""}
      ${dsRow("Onboarding", escapeHtml({ neu: "Neu", in_bearbeitung: "In Bearbeitung", abgeschlossen: "Abgeschlossen" }[a.onboardingStatus] || a.onboardingStatus || "–"))}
      ${dsRow("Aktiv", aktiv ? `<span class="ds-ok">Ja</span>` : `<span class="ds-bad">Nein (deaktiviert)</span>`)}
      ${dsRow("Briefing-Punkte", dsFmt(a.briefingPunkte))}
      ${dsRow("Lage-Vorgänge", dsFmt(a.lageVorgaenge))}
      ${dsRow("Radar Chancen", dsFmt(a.radarChancen))}
      ${dsRow("Radar Risiken", dsFmt(a.radarRisiken))}
      ${dsRow("KI-Budget/Tag", dsBudgetLabel(budget.taeglichCent))}
      ${dsRow("KI-Budget/Monat", dsBudgetLabel(budget.monatlichCent))}
      ${dsRow("KI-Kosten heute", dsCost(a.kiKosten))}
      <div class="ds-account-actions">
        <button type="button" class="ghost-button ds-mini-btn" data-profile-test-briefing="${pid}">Testbriefing</button>
        <button type="button" class="ghost-button ds-mini-btn" data-profile-edit="${pid}">Bearbeiten</button>
        <button type="button" class="ghost-button ds-mini-btn" data-profile-toggle-active="${pid}" data-active="${aktiv ? "1" : "0"}">${aktiv ? "Deaktivieren" : "Aktivieren"}</button>
      </div>
      <div class="ds-profile-editor" data-profile-editor="${pid}" hidden>
        <div class="ds-editor-grid">
          <label class="ds-editor-field"><span>KI-Budget/Tag (€, 0 = Standard)</span><input type="number" min="0" step="0.01" data-edit-field="aiBudgetDailyEur" value="${budget.taeglichCent != null ? (Number(budget.taeglichCent) / 100).toFixed(2) : ""}" /></label>
          <label class="ds-editor-field"><span>KI-Budget/Monat (€, 0 = Standard)</span><input type="number" min="0" step="0.01" data-edit-field="aiBudgetMonthlyEur" value="${budget.monatlichCent != null ? (Number(budget.monatlichCent) / 100).toFixed(2) : ""}" /></label>
          <label class="ds-editor-field"><span>Onboarding-Status</span>
            <select data-edit-field="onboardingStatus">
              <option value="neu"${a.onboardingStatus === "neu" ? " selected" : ""}>Neu</option>
              <option value="in_bearbeitung"${a.onboardingStatus === "in_bearbeitung" ? " selected" : ""}>In Bearbeitung</option>
              <option value="abgeschlossen"${a.onboardingStatus === "abgeschlossen" ? " selected" : ""}>Abgeschlossen</option>
            </select>
          </label>
        </div>
        <div class="ds-editor-foot">
          <button type="button" class="primary-button ds-mini-btn" data-profile-save="${pid}">Speichern</button>
          <small class="ds-editor-msg" data-profile-msg="${pid}"></small>
        </div>
      </div>
    </div>`;
}

function renderAdminDataStatus(ds, scope = "all") {
  if (!ds || !ds.global) {
    return `<section class="ds-status"><h2 class="admin-section-title">Datenstatus (intern)</h2>
      <p class="ds-note">Datenstatus derzeit nicht verfügbar.</p></section>`;
  }
  const g = ds.global;
  const ampelLabel = { gruen: "GRÜN", gelb: "GELB", rot: "ROT" };
  const pill = (a) => `<span class="ds-ampel ds-ampel--${escapeHtml(String(a || "unbekannt"))}">${ampelLabel[a] || "?"}</span>`;
  const profilLabel = { full: "Vollständig", restricted: "Eingeschränkt", empty: "Kein Profil" };

  const morning = g.morgenstatus0730 || {};
  const err = g.letzterFehler;

  const errorCard = (err || g.kiAnalyseFehler) ? `
    <div class="ds-error">
      <div class="ds-error-head">${escapeHtml((err && err.headline) || "KI-Analyse fehlgeschlagen")}</div>
      ${err && err.reason ? `<div class="ds-error-reason">Grund: ${escapeHtml(err.reason)}</div>` : ""}
      <div class="ds-error-meta">${err && err.when ? dsDateLabel(err.when) : ""}${err && err.scope ? ` · ${escapeHtml(err.scope)}` : ""}</div>
      ${err && err.detail ? `<details class="ds-error-detail"><summary>Technische Details</summary><code>${escapeHtml(err.detail)}</code></details>` : ""}
    </div>` : "";

  // Interner KI-Status (nur Admin, keine Secrets): Anbieter + Env-Flags (ja/nein) +
  // Fehler/Erfolg aus dem vorhandenen llm_usage-Log. Keine Keys/Endpoints/Werte.
  const ki = g.kiStatus && g.kiStatus.available !== false ? g.kiStatus : null;
  const kiJaNein = (b) => b ? `<span class="ds-ok">Ja</span>` : `<span class="ds-bad">Nein</span>`;
  const kiAnbieter = { azure: "Azure OpenAI", openai: "OpenAI", "nicht-konfiguriert": "Nicht konfiguriert" };
  const kiCard = ki ? `
    <div class="ds-card">
      <div class="ds-card-title">KI-Status (intern)</div>
      ${dsRow("Anbieter aktiv", `<strong>${escapeHtml(kiAnbieter[ki.anbieter] || ki.anbieter || "?")}</strong>`)}
      ${dsRow("Azure Key gesetzt", kiJaNein(ki.azureKeyGesetzt))}
      ${dsRow("Azure Endpoint gesetzt", kiJaNein(ki.azureEndpointGesetzt))}
      ${dsRow("Azure Deployment gesetzt", kiJaNein(ki.azureDeploymentGesetzt))}
      ${dsRow("Erwartetes Azure Deployment", ki.azureDeploymentName ? `<code>${escapeHtml(ki.azureDeploymentName)}</code>` : `<span class="ds-sub">– (nicht gesetzt)</span>`)}
      ${dsRow("Erfolgreiche KI-Calls heute", dsFmt(ki.heute && ki.heute.erfolgreich))}
      ${dsRow("Fehlgeschlagene KI-Calls heute", ki.heute && Number(ki.heute.fehlgeschlagen) > 0 ? `<span class="ds-bad">${dsFmt(ki.heute.fehlgeschlagen)}</span>` : dsFmt(ki.heute && ki.heute.fehlgeschlagen))}
      ${dsRow("Letzter erfolgreicher KI-Call", ki.letzterErfolg && ki.letzterErfolg.when ? dsDateLabel(ki.letzterErfolg.when) : `<span class="ds-sub">–</span>`)}
      ${dsRow("Letzter KI-Fehler", ki.letzterFehler ? `<span class="ds-bad">${escapeHtml(ki.letzterFehler.grund || "Fehler")}</span>${ki.letzterFehler.when ? ` <span class="ds-sub">· ${dsDateLabel(ki.letzterFehler.when)}</span>` : ""}` : `<span class="ds-ok">Keiner</span>`)}
      ${ki.hinweis ? `<div class="ds-error ds-error--hint"><div class="ds-error-reason">${escapeHtml(ki.hinweis)}</div></div>` : ""}
    </div>` : "";

  const globalCard = `
    <div class="ds-card">
      <div class="ds-card-title">Datenmotor heute</div>
      ${dsRow("Letzter Lauf", dsDateLabel(g.letzterLauf))}
      ${dsRow("Morgenstatus 7:30", morning.ok ? `<span class="ds-ok">Brauchbarer Stand</span>` : `<span class="ds-bad">Nicht ok</span>${morning.note ? ` <span class="ds-sub">(${escapeHtml(morning.note)})</span>` : ""}`)}
      ${dsRow("Geprüfte Quellen", dsFmt(g.quellen && g.quellen.geprueft))}
      ${dsRow("Erfolgreiche Quellen", dsFmt(g.quellen && g.quellen.erfolgreich))}
      ${dsRow("Fehlgeschlagene Quellen", dsFmt(g.quellen && g.quellen.fehlgeschlagen))}
      ${dsRow("Rohdokumente geladen", dsFmt(g.dokumente && g.dokumente.geladen))}
      ${dsRow("Neue Dokumente", dsFmt(g.dokumente && g.dokumente.neu))}
      ${dsRow("Verworfene Dokumente", dsFmt(g.dokumente && g.dokumente.verworfen))}
      ${dsRow("Duplikate", dsFmt(g.dokumente && g.dokumente.duplikate))}
      ${dsRow("Quarantänierte Dokumente", dsFmt(g.dokumente && g.dokumente.quarantaeniert))}
      ${dsRow("Erzeugte Vorgänge", dsFmt(g.vorgaenge && g.vorgaenge.erzeugt))}
      ${dsRow("Analysierte Vorgänge", dsFmt(g.vorgaenge && g.vorgaenge.analysiert))}
      ${dsRow("Vorgänge mit Mandatsbezug", dsFmt(g.vorgaenge && g.vorgaenge.mitMandatsbezug))}
      ${dsRow("Vorgänge mit Empfehlung", dsFmt(g.vorgaenge && g.vorgaenge.mitEmpfehlung))}
      ${dsRow("Lage-Vorgänge (gesamt)", dsFmt(g.lage && g.lage.vorgaengeGesamt))}
      ${dsRow("Radar Chancen", dsFmt(g.radar && g.radar.chancen))}
      ${dsRow("Radar Risiken", dsFmt(g.radar && g.radar.risiken))}
      ${dsRow("Briefing-Punkte (gesamt)", dsFmt(g.briefing && g.briefing.punkteGesamt))}
      ${dsRow("Briefing sichtbar bei Accounts", dsFmt(g.briefing && g.briefing.sichtbarBeiAccounts))}
      ${dsRow("Accounts ohne Briefing", dsFmt(g.briefing && g.briefing.accountsOhneBriefing))}
      ${dsRow("KI-Kosten heute", g.ki && g.ki.available === false ? dsFmt(g.ki) : (g.ki ? `${g.ki.proLauf != null ? "$" + escapeHtml(String(g.ki.proLauf)) : "–"}${g.ki.calls != null ? ` · ${escapeHtml(String(g.ki.calls))} Calls` : ""}` : "–"))}
      <div class="ds-row ds-row--wide"><span class="ds-row-label">Quellen nach Kategorie</span>${dsCategories(g.quellen && g.quellen.nachKategorie)}</div>
    </div>`;

  const accountCards = (Array.isArray(ds.perAccount) ? ds.perAccount : []).map((a) => renderAdminProfileCard(a, profilLabel)).join("");

  const legend = ds.legende && typeof ds.legende === "object"
    ? Object.entries(ds.legende).map(([k, v]) => `<li><strong>${escapeHtml(k)}</strong>: ${escapeHtml(String(v))}</li>`).join("")
    : "";

  // Nur die Pro-Account-Detailkarten (für den Profile-Detailbereich).
  if (scope === "accounts") {
    return `
      <section class="ds-status">
        ${accountCards ? `<div class="ds-accounts">${accountCards}</div>` : `<p class="ds-note">Noch keine Accounts zur Auswertung.</p>`}
      </section>`;
  }

  const accountsBlock = scope === "global" ? "" : `
      <div class="ds-accounts-title">Pro Account</div>
      ${accountCards ? `<div class="ds-accounts">${accountCards}</div>` : `<p class="ds-note">Noch keine Accounts zur Auswertung.</p>`}`;

  return `
    <section class="ds-status">
      <div class="ds-header">
        <h2 class="admin-section-title">Datenstatus (intern)</h2>
        ${pill(g.ampel)}
      </div>
      ${ds.v3StoreAktiv ? "" : `<p class="ds-note ds-note--warn">V3-Store offline: einige Live-Zahlen sind erst mit aktivem Datenspeicher verfügbar.</p>`}
      ${errorCard}
      ${kiCard}
      ${globalCard}
      ${accountsBlock}
      ${ds.hinweis ? `<p class="ds-note">${escapeHtml(ds.hinweis)}</p>` : ""}
      ${legend ? `<details class="ds-legend"><summary>Bedeutung der Werte</summary><ul>${legend}</ul></details>` : ""}
    </section>`;
}

// „Letztes Ergebnis" aus dem PERSISTIERTEN manuellen Lauf (überlebt Reload). Ruhig,
// mobil lesbar, keine Rohtexte/Secrets. Gibt null zurück, wenn kein Lauf gespeichert ist.
function recoveryLastRunValue(rl) {
  if (!rl || !rl.startedAt) return null;
  const st = rl.anzeigeStatus || rl.status || "";
  const zeit = (iso) => (iso ? `<span class="ds-sub">· ${dsDateLabel(iso)}</span>` : "");
  if (st === "running") {
    return `<span class="ds-warn">Läuft seit ${escapeHtml(dsDateLabel(rl.startedAt))}</span>`;
  }
  if (st === "ohne-abschluss") {
    return `<span class="ds-warn">Ohne Abschluss zurückgemeldet</span> ${zeit(rl.startedAt)}<br><span class="ds-sub">Kein Abschluss-Ergebnis erhalten – bitte Status prüfen oder erneut starten.</span>`;
  }
  if (st === "erfolgreich") {
    return `<span class="ds-ok">Erfolgreich abgeschlossen</span> ${zeit(rl.finishedAt)}<br><span class="ds-sub">verarbeitet ${dsFmt(rl.verarbeitet)} · pending ${dsFmt(rl.pendingVorher)}→${dsFmt(rl.pendingNachher)} · complete ${dsFmt(rl.completeVorher)}→${dsFmt(rl.completeNachher)}</span>`;
  }
  if (st === "fehlgeschlagen") {
    return `<span class="ds-bad">Fehlgeschlagen</span> ${zeit(rl.finishedAt)}<br><span class="ds-sub">${escapeHtml(rl.fehler || "Unbekannter Fehler")}</span>`;
  }
  // nichts-verarbeitet / uebersprungen -> "Nicht gestartet um HH:MM" + knapper Grund.
  // (recoveryGrundText/pendingDiagnoseUrsacheText liefern bereits HTML-sichere Strings.)
  const grundText = st === "uebersprungen" ? recoveryGrundText(rl.grund) : pendingDiagnoseUrsacheText(rl.grund);
  return `<span class="ds-warn">Nicht gestartet</span> ${zeit(rl.finishedAt || rl.startedAt)}<br><span class="ds-sub">${grundText}</span>`;
}

// Kompakte Einzeiler-Fassung des vorherigen Laufs (für die de-emphasierte Anzeige während ein neuer Lauf läuft).
function recoveryLastRunShort(rl) {
  if (!rl || !rl.startedAt) return "";
  const st = rl.anzeigeStatus || rl.status || "";
  const label = {
    "erfolgreich": "Erfolgreich abgeschlossen",
    "nichts-verarbeitet": "Nicht gestartet",
    "uebersprungen": "Nicht gestartet",
    "fehlgeschlagen": "Fehlgeschlagen",
    "ohne-abschluss": "Ohne Abschluss zurückgemeldet",
    "running": "Läuft"
  }[st] || "Ergebnis";
  const t = rl.finishedAt || rl.startedAt;
  return `${label}${t ? ` (${dsDateLabel(t)})` : ""}`;
}

// Optionalen Zusatzblock einzeln kapseln: wirft er, bleibt die restliche Recovery-Card
// intakt; nur dieser Block wird durch einen neutralen Ersatz-HTML-Schnipsel ersetzt.
function safeInline(fn, fallbackHtml) {
  try { return fn(); } catch (error) {
    try { console.warn("Helmut: Recovery-Zusatzblock fehlgeschlagen", error); } catch (_) { /* ignore */ }
    return fallbackHtml != null ? fallbackHtml : "";
  }
}

// FEHLER-ISOLATION: ein Wurf im Recovery-Render (unerwarteter Response-Shape, fehlendes
// Feld) darf NIEMALS den ganzen Admin-Bereich ausblenden. Fängt den Fehler ab und zeigt
// eine ruhige Ersatzkarte — der restliche Admin-Datenstatus bleibt sichtbar.
function safeRenderAdminRecovery(rec, result, diagnose) {
  try {
    return renderAdminRecovery(rec, result, diagnose);
  } catch (error) {
    try { console.warn("Helmut: Recovery-Render fehlgeschlagen, Ersatzkarte", error); } catch (_) { /* ignore */ }
    const ko = rec && rec.knowledgeObjects;
    const basis = (ko && ko.available !== false)
      ? `<p class="ds-sub">Letzter bekannter Stand: pending ${dsFmt(ko.pending)} · complete ${dsFmt(ko.complete)}</p>`
      : "";
    return `<section class="ds-status"><div class="ds-card">
      <div class="ds-card-title">Pipeline-Recovery (intern)</div>
      <p class="ds-note ds-note--warn">Recovery-Ansicht konnte nicht vollständig dargestellt werden. Der letzte bekannte Stand bleibt erhalten – bitte Seite neu laden.</p>
      ${basis}
    </div></section>`;
  }
}

// Interner Pipeline-Recovery-Bereich (nur Admin). Zeigt KO-Zustände, Lock, letzten
// Understanding-Lauf, KI-Fehler/-Erfolg + drei bewusste Aktionen. Serverseitig ist
// alles admin-gegatet; hier nur Anzeige/Klick. Keine Secrets, keine Env-Werte.
function renderAdminRecovery(rec, result, diagnose) {
  // Fail-safe: laedt der Recovery-Status nicht (Timeout/Fehler), bleibt der restliche
  // Admin-Datenstatus sichtbar; hier steht dann nur ein ruhiger Hinweis.
  if (!rec) {
    return `<section class="ds-status"><div class="ds-card">
      <div class="ds-card-title">Pipeline-Recovery (intern)</div>
      <p class="ds-note">Recovery-Status derzeit nicht verfügbar.</p>
    </div></section>`;
  }
  const ko = rec.knowledgeObjects;
  const koAvail = ko && ko.available !== false;
  const lock = rec.understandingLock || {};
  const lockUnknown = rec.v3StoreAktiv === false;
  const lockActionable = Boolean(lock.aktiv || lock.verdaechtig);
  const erg = rec.letztesUnderstandingErgebnis;
  const recLauf = rec.letzterRecoveryLauf; // persistierter manueller Lauf (überlebt Reload)
  const kiErr = rec.letzterKiFehler;
  const kiOk = rec.letzterKiErfolg;
  const busy = adminRecoveryBusy;
  const failedN = koAvail ? Number(ko.failed) : 0;
  const lockLabel = lock.aktiv
    ? `<span class="ds-bad">Ja</span>`
    : lock.verdaechtig ? `<span class="ds-warn">Abgelaufen (verdächtig)</span>` : `<span class="ds-ok">Nein</span>`;
  return `
    <section class="ds-status">
      <div class="ds-card">
        <div class="ds-card-title">Pipeline-Recovery (intern)</div>
        ${adminRecoveryStale ? `<p class="ds-note ds-note--warn">Recovery-Status konnte nicht aktualisiert werden. Der letzte bekannte Stand bleibt sichtbar.</p>` : ""}
        ${dsRow("Pending Vorgänge", koAvail ? dsFmt(ko.pending) : dsFmt(ko))}
        ${dsRow("Failed Vorgänge", koAvail ? (failedN > 0 ? `<span class="ds-bad">${dsFmt(ko.failed)}</span>` : dsFmt(ko.failed)) : dsFmt(ko))}
        ${dsRow("Complete Vorgänge", koAvail ? dsFmt(ko.complete) : dsFmt(ko))}
        ${dsRow("Understanding-Lock aktiv", lockUnknown ? `<span class="ds-sub">–</span>` : lockLabel)}
        ${dsRow("Letzter Understanding-Lauf", rec.letzterUnderstandingLauf ? dsDateLabel(rec.letzterUnderstandingLauf) : `<span class="ds-sub">–</span>`)}
        ${dsRow("Letztes Ergebnis", safeInline(() => (busy && adminRecoveryResult && adminRecoveryResult.pending)
          ? `<span class="ds-warn">Aktueller Lauf läuft</span> <span class="ds-sub">· Läuft seit ${escapeHtml(adminRecoveryResult.startedAt || "")}${adminRecoveryLastCheck ? ` · zuletzt geprüft ${escapeHtml(adminRecoveryLastCheck)}` : ""}</span>${recLauf ? `<br><span class="ds-sub">vorheriges Ergebnis: ${escapeHtml(recoveryLastRunShort(recLauf))}</span>` : ""}`
          : (recoveryLastRunValue(recLauf) || (erg ? `verarbeitet ${dsFmt(erg.verarbeitet)} · zurückgestellt ${dsFmt(erg.zurueckgestellt)}${erg.grund ? ` · ${escapeHtml(String(erg.grund))}` : ""}` : `<span class="ds-sub">–</span>`)), `<span class="ds-sub">–</span>`))}
        ${dsRow("Letzter KI-Fehler", kiErr ? `<span class="ds-bad">${escapeHtml(kiErr.grund || "Fehler")}</span>${kiErr.when ? ` <span class="ds-sub">· ${dsDateLabel(kiErr.when)}</span>` : ""}` : `<span class="ds-ok">Keiner</span>`)}
        ${dsRow("Letzter erfolgreicher KI-Call", kiOk && kiOk.when ? dsDateLabel(kiOk.when) : `<span class="ds-sub">–</span>`)}
        <div class="ds-recovery-actions">
          <button class="ds-recovery-btn" type="button" data-recovery-action="release-lock" title="Gibt einen veralteten Verarbeitungsschutz frei. Startet keinen neuen Lauf." ${busy || !lockActionable ? "disabled" : ""}>Lock lösen</button>
          <button class="ds-recovery-btn ds-recovery-btn--warn" type="button" data-recovery-action="reset-failed" ${busy || !(koAvail && failedN > 0) ? "disabled" : ""}>Failed → Pending zurücksetzen</button>
          <button class="ds-recovery-btn ds-recovery-btn--primary" type="button" data-recovery-action="run-understanding" title="Startet die Verarbeitung wartender Vorgänge. Kann interne KI-Kosten verursachen." ${busy || lockActionable ? "disabled" : ""}>Understanding-Lauf starten</button>
          <button class="ds-recovery-btn" type="button" data-pending-diagnose="1" ${busy || adminPendingDiagnoseBusy ? "disabled" : ""}>Pending-Diagnose starten</button>
        </div>
        ${lockActionable ? `<p class="ds-note ds-note--warn">Ein Understanding-Lauf ist gesperrt oder hängt. „Understanding-Lauf starten" ist deaktiviert. Bitte „Lock lösen", falls kein Lauf mehr aktiv ist.</p>` : ""}
        <p class="ds-note">Aktionen laufen nur nach bewusstem Klick. „Failed → Pending" fragt vorher nach Bestätigung und löscht keine Rohdokumente. „Understanding-Lauf" nutzt die bestehende Funktion und kann KI-Kosten verursachen.</p>
        ${safeInline(() => renderRecoveryResult(result), `<p class="ds-note ds-note--warn">Zusatzdaten konnten nicht dargestellt werden.</p>`)}
        ${safeInline(() => renderPendingDiagnose(diagnose), `<p class="ds-note ds-note--warn">Zusatzdaten konnten nicht dargestellt werden.</p>`)}
      </div>
    </section>`;
}

// Grund, warum in-window verarbeitbare Vorgänge NICHT gespeichert wurden (kein Stacktrace, keine Secrets).
function recoveryVersuchtGrundText(key) {
  const map = {
    "skipped-error": "Fehler beim KI-Aufruf",
    "cluster-error": "Fehler beim KI-Aufruf",
    "skipped-invalid": "ungültiges KI-Ergebnis",
    "skipped-budget": "Tagesbudget erreicht",
    "skipped-store": "Speichern fehlgeschlagen"
  };
  return map[String(key || "")] || "unbekannt";
}

// Technische Understanding-Gründe -> verständlicher Klartext (keine Secrets).
function recoveryGrundText(grund) {
  const map = {
    "no-pending": "Keine pending-Vorgänge gefunden.",
    "understanding-locked": "Understanding-Lock ist aktiv – bitte warten oder Lock lösen, falls kein Lauf mehr aktiv ist.",
    "understanding-lock-stale": "Lock wirkt veraltet (hängt) – bitte „Lock lösen“, falls kein Lauf mehr aktiv ist.",
    "ai-disabled": "KI ist nicht konfiguriert.",
    "v3-store-disabled": "V3-Store ist nicht aktiv.",
    "skipped-no-cluster": "Quell-Dokumente der pending-Vorgänge nicht im Zeitfenster gefunden.",
    "skipped-no-vorgang": "Pending-Einträge ohne Vorgangsbezug.",
    "skipped-exists": "Vorgänge bereits verstanden.",
    "skipped-budget": "Zeitbudget erreicht – Rest bleibt pending (nächster Lauf holt nach).",
    "skipped-error": "KI-Aufruf für einzelne Vorgänge fehlgeschlagen.",
    "skipped-invalid": "KI-Ergebnis war nicht schema-valide.",
    "skipped-store": "Ergebnis konnte nicht gespeichert werden.",
    "cluster-error": "Fehler bei einzelnen Vorgängen.",
    "keine-verarbeitung": "Es wurde nichts verarbeitet."
  };
  return map[String(grund || "")] || `Grund: ${escapeHtml(String(grund || "unbekannt"))}`;
}

function renderRecoveryResult(r) {
  if (!r || typeof r !== "object") return "";
  const label = { "release-lock": "Lock lösen", "reset-failed": "Failed zurücksetzen", "run-understanding": "Understanding-Lauf" }[r.action] || "Aktion";
  const wrap = (inner) => `<div class="ds-recovery-result">${inner}</div>`;
  // Unerwartete Server-Antwort: klare Meldung statt roher/leerer Anzeige.
  if (r.unerwartet) {
    return wrap(`<div class="ds-recovery-result-head"><span class="ds-warn">${escapeHtml(label)}: Unerwartete Antwort vom Server</span></div>
      <p class="ds-sub">Die Aktion wurde gesendet, aber die Antwort war nicht lesbar. Bitte Status prüfen oder Seite neu laden.${r.finishedAt ? ` · ${escapeHtml(r.finishedAt)}` : ""}</p>`);
  }
  // Läuft gerade (sofort nach Klick sichtbar) — Button ist derweil deaktiviert. Live-Feedback:
  // Laufzeit + „zuletzt geprüft" aus dem read-only Polling; ruhige Hinweise bei langer Dauer.
  if (r.pending) {
    const elapsedS = adminRecoveryStartMs ? Math.max(0, Math.floor((Date.now() - adminRecoveryStartMs) / 1000)) : 0;
    const check = adminRecoveryLastCheck ? ` · zuletzt geprüft ${escapeHtml(adminRecoveryLastCheck)}` : "";
    let hinweis = "Status wird geprüft …";
    if (elapsedS > 180) hinweis = "Der Lauf hat noch kein Abschluss-Ergebnis zurückgemeldet. Bitte Seite neu laden oder später erneut prüfen.";
    else if (elapsedS > 90) hinweis = "Der Lauf dauert ungewöhnlich lange. Der Status wird weiter geprüft.";
    return wrap(`<div class="ds-recovery-result-head"><span class="ds-warn">${escapeHtml(label)} läuft</span></div>
      <p class="ds-sub">Läuft seit ${escapeHtml(r.startedAt || "")}${check}</p>
      <p class="ds-sub">${hinweis}</p>`);
  }
  // Fehlgeschlagen (HTTP-Fehler / Zeitüberschreitung / Netz).
  if (r.ok === false) {
    return wrap(`<div class="ds-recovery-result-head"><span class="ds-bad">${escapeHtml(label)}: Fehlgeschlagen</span></div>
      <p class="ds-sub">${escapeHtml(r.fehler || "Unbekannter Fehler")}${r.finishedAt ? ` · ${escapeHtml(r.finishedAt)}` : ""}</p>`);
  }
  // Understanding-Lauf: reiche, klar klassifizierte Rückmeldung.
  if (r.action === "run-understanding") {
    const zeit = r.finishedAt ? ` <span class="ds-sub">· ${escapeHtml(r.finishedAt)}</span>` : "";
    if (r.ergebnis === "erfolgreich") {
      return wrap(`<div class="ds-recovery-result-head"><span class="ds-ok">Erfolgreich abgeschlossen</span>${zeit}</div>
        <p class="ds-sub">verarbeitet ${dsFmt(r.verarbeitet)} · zurückgestellt ${dsFmt(r.zurueckgestellt)} · pending ${dsFmt(r.pendingVorher)}→${dsFmt(r.pendingNachher)} · complete ${dsFmt(r.completeVorher)}→${dsFmt(r.completeNachher)}</p>`);
    }
    // EHRLICHE Aufschlüsselung, wenn die Read-only-Diagnose-Felder vorliegen (0 gespeichert):
    // nicht pauschal 'Zeitfenster' — das nur, wenn außerhalb wirklich > 0 ist.
    if (r.ergebnis === "nichts-verarbeitet" && r.imFensterVerarbeitbar != null) {
      const zeilen = [];
      zeilen.push(pendingDiagnoseUrsacheText(r.grund)); // Kurzfazit (identisch zur Diagnose)
      zeilen.push(`${dsFmt(r.verarbeitet)} Vorgänge gespeichert.`);
      if (dsNum(r.imFensterVerarbeitbar) > 0) zeilen.push(`${dsFmt(r.imFensterVerarbeitbar)} Vorgänge wirken grundsätzlich verarbeitbar.`);
      if (dsNum(r.ausserhalbFenster) > 0) zeilen.push(`${dsFmt(r.ausserhalbFenster)} Vorgänge liegen außerhalb des Zeitfensters.`);
      if (dsNum(r.ohneRohdokumente) > 0) zeilen.push(`${dsFmt(r.ohneRohdokumente)} Vorgänge haben keine passenden Rohdokumente.`);
      if (dsNum(r.versuchtNichtGespeichert) > 0) zeilen.push(`${dsFmt(r.versuchtNichtGespeichert)} verarbeitbare Vorgänge wurden versucht, aber nicht gespeichert. Grund: ${recoveryVersuchtGrundText(r.versuchtGrundKey)}.`);
      zeilen.push(`pending unverändert ${dsFmt(r.pendingNachher)}.`);
      return wrap(`<div class="ds-recovery-result-head"><span class="ds-warn">Nicht gestartet</span>${zeit}</div>
        ${zeilen.map((z) => `<p class="ds-sub">${escapeHtml(z)}</p>`).join("")}`);
    }
    const rest = r.ergebnis === "nichts-verarbeitet" ? ` · pending unverändert (${dsFmt(r.pendingNachher)})` : "";
    return wrap(`<div class="ds-recovery-result-head"><span class="ds-warn">Nicht gestartet</span>${zeit}</div>
      <p class="ds-sub">${recoveryGrundText(r.grund)}${rest}</p>`);
  }
  // Andere Aktionen (Lock lösen / Failed zurücksetzen): sanitisiertes Ergebnis-JSON.
  const safe = { ...r }; delete safe.action; delete safe.pending; delete safe.startedAt; delete safe.finishedAt;
  return wrap(`<div class="ds-recovery-result-head"><span class="ds-ok">Ergebnis: ${escapeHtml(label)}</span></div>
      <pre class="ds-recovery-json">${escapeHtml(JSON.stringify(safe, null, 2))}</pre>`);
}

// Ursache -> ruhiger Klartext (grün = verarbeitbar, sonst gelb/erklärend). Keine Secrets.
function pendingDiagnoseUrsacheText(u) {
  const map = {
    "keine-pending": "Keine pending-Vorgänge – nichts zu tun.",
    "verarbeitbar": "Pending-Vorgänge sind grundsätzlich verarbeitbar.",
    "ausserhalb-fenster": "Rohdokumente liegen außerhalb des aktuellen Recovery-Fensters.",
    "verwaist": "Pending-Vorgänge wirken verwaist (keine Rohdokumente im Store gefunden).",
    "mapping-fehlt": "Mapping zwischen Vorgang und Rohdokument fehlt oder ist unvollständig.",
    "teils-verarbeitbar-verwaist": "Teilweise verarbeitbar, überwiegend verwaist.",
    "gemischt": "Gemischt – siehe Aufschlüsselung oben (im Fenster / außerhalb / keine).",
    "v3-store-disabled": "Diagnose nicht möglich, V3-Store nicht aktiv."
  };
  return map[String(u || "")] || `Ursache: ${escapeHtml(String(u || "unbekannt"))}`;
}

// Read-only Pending-Diagnose (kein KI, keine Writes). Ruhige, minimale Anzeige.
function renderPendingDiagnose(d) {
  if (!d) return "";
  const wrap = (inner) => `<div class="ds-recovery-result">${inner}</div>`;
  if (d.pending) {
    return wrap(`<div class="ds-recovery-result-head"><span class="ds-warn">Pending-Diagnose läuft</span></div>
      <p class="ds-sub">Nur lesen … einen Moment.</p>`);
  }
  if (d.ok === false) {
    return wrap(`<div class="ds-recovery-result-head"><span class="ds-bad">Pending-Diagnose: Fehlgeschlagen</span></div>
      <p class="ds-sub">${escapeHtml(d.fehler || "Unbekannter Fehler")}</p>`);
  }
  if (d.verfuegbar === false) {
    return wrap(`<div class="ds-recovery-result-head"><span class="ds-warn">Pending-Diagnose</span></div>
      <p class="ds-sub">${pendingDiagnoseUrsacheText(d.grund || "v3-store-disabled")}</p>`);
  }
  // Grün nur bei "verarbeitbar", sonst gelb (ehrliche Erklärung).
  const gruen = d.ursache === "verarbeitbar" || d.ursache === "keine-pending";
  const kopf = gruen ? "ds-ok" : "ds-warn";
  const rows = [
    ["Gesamt pending", dsFmt(d.gesamt)],
    ["Mit Cluster", dsFmt(d.mitCluster)],
    ["Ohne Cluster", dsFmt(d.ohneCluster)],
    ["Rohdokumente im aktuellen Fenster gefunden", dsFmt(d.imFenster)],
    ["Rohdokumente außerhalb des Fensters gefunden", dsFmt(d.ausserhalb)],
    ["Keine Rohdokumente gefunden", dsFmt(d.keine)],
    ["Pending ohne Quell-Zahl (V2/Seed-Hinweis)", dsFmt(d.ohneQuellzahl)],
    ["Ältester pending Vorgang", d.pendingAeltesterTage != null ? `${dsFmt(d.pendingAeltesterTage)} Tage` : "–"],
    ["Neuester pending Vorgang", d.pendingNeuesterTage != null ? `${dsFmt(d.pendingNeuesterTage)} Tage` : "–"],
    ["Rohdokumente Alter (ältestes/neuestes)", (d.rohdokAeltesterTage != null || d.rohdokNeuesterTage != null) ? `${dsFmt(d.rohdokAeltesterTage)} / ${dsFmt(d.rohdokNeuesterTage)} Tage` : "–"],
    ["Rohdokumente gelesen (Fenster / weit)", `${dsFmt(d.rohdokumenteFenster)} / ${dsFmt(d.rohdokumenteWeit)}${d.weitGedeckelt ? " (gedeckelt)" : ""}`]
  ].map(([k, v]) => dsRow(k, v)).join("");
  const bsp = (d.beispiele || []).map((b) => `
    <tr>
      <td>${escapeHtml(b.vorgangId || "")}</td>
      <td>${escapeHtml(b.titelKurz || "")}</td>
      <td>${escapeHtml(b.status || "")}</td>
      <td>${b.alterTage != null ? dsFmt(b.alterTage) + "d" : "–"}</td>
      <td>${b.clusterVorhanden ? "ja" : "nein"}</td>
      <td>${b.rohdokumentGefunden ? "ja" : "nein"}</td>
      <td>${b.rohdokumentAlterTage != null ? dsFmt(b.rohdokumentAlterTage) + "d" : "–"}</td>
      <td>${escapeHtml(pendingDiagnoseGrundKurz(b.grund))}</td>
    </tr>`).join("");
  const tabelle = bsp
    ? `<div class="ds-diag-table-wrap"><table class="ds-diag-table">
        <thead><tr><th>Vorgang</th><th>Titel</th><th>Status</th><th>Alter</th><th>Cluster</th><th>Rohdok</th><th>Rohdok-Alter</th><th>Grund</th></tr></thead>
        <tbody>${bsp}</tbody></table></div>`
    : "";
  const hinweis = pendingDiagnoseUrsacheHinweis(d.ursache);
  return wrap(`<div class="ds-recovery-result-head"><span class="${kopf}">Pending-Diagnose</span></div>
    <p class="ds-note">Diese Diagnose prüft nur, warum pending Vorgänge nicht verarbeitet werden. Sie startet keine KI, verändert keine Daten und repariert nichts automatisch.</p>
    ${rows}
    <div class="ds-diag-legend">
      <p><strong>Mit Cluster</strong> bedeutet: Der Vorgang kann grundsätzlich einem Rohdokument-Bündel zugeordnet werden.</p>
      <p><strong>Ohne Cluster</strong> bedeutet: Für diesen Vorgang wurde aktuell keine passende Rohdokument-Verbindung gefunden.</p>
      <p><strong>Rohdokumente im aktuellen Fenster</strong> bedeutet: Diese Vorgänge könnten grundsätzlich vom Recovery-Lauf verarbeitet werden.</p>
      <p><strong>Rohdokumente außerhalb des Fensters</strong> bedeutet: Dokumente existieren, liegen aber außerhalb des aktuellen Recovery-Bereichs.</p>
      <p><strong>Keine Rohdokumente gefunden</strong> bedeutet: Der Vorgang wirkt verwaist oder stammt möglicherweise aus alten Seed- oder V2-Daten.</p>
    </div>
    ${dsRow("Wahrscheinlichste Ursache", `<span class="${kopf}">${escapeHtml(pendingDiagnoseUrsacheText(d.ursache))}</span>`)}
    ${hinweis ? `<p class="ds-note">${escapeHtml(hinweis)}</p>` : ""}
    ${dsRow("Empfohlener nächster Schritt", escapeHtml(String(d.empfehlung || "–")))}
    ${renderPendingKandidaten(d)}
    ${tabelle}
    <p class="ds-note">Nur gelesen – keine KI, keine Pipeline, keine Datenänderung. Bis zu 10 Beispiele ohne Rohtext.</p>`);
}

// Kurzer Klartext für den letzten Lauf-Status (Kandidaten-Kontext). Keine Secrets.
function pendingLetzterLaufLabel(ll) {
  if (!ll || !ll.finishedAt) return null;
  const st = { "erfolgreich": "Erfolgreich abgeschlossen", "nichts-verarbeitet": "Nicht gestartet", "uebersprungen": "Nicht gestartet", "fehlgeschlagen": "Fehlgeschlagen", "ohne-abschluss": "Ohne Abschluss", "running": "Läuft" }[String(ll.status || "")] || "Lauf";
  const zahlen = (ll.verarbeitet != null || ll.versucht != null) ? ` · verarbeitet ${dsFmt(ll.verarbeitet)} · versucht ${dsFmt(ll.versucht)}` : "";
  return `${st} (${dsDateLabel(ll.finishedAt)})${zahlen}`;
}

// Ehrlicher, code-gestützter Grund, warum ein verarbeitbarer Kandidat nicht gespeichert wurde.
// Fakt: harte KI-Fehler (skipped-error/-invalid) parken den Vorgang als 'failed' und entfernen
// ihn aus der pending-Liste. Ein noch pending Kandidat war also KEIN hartes KI-Fail. Der genaue
// Grund pro Vorgang wird nicht durabel gespeichert -> ehrlich benennen, NICHT raten.
function pendingKandidatGrund(ll) {
  if (!ll || !ll.finishedAt) return "Noch kein abgeschlossener Lauf – bitte Understanding-Lauf starten.";
  return "Cluster vorhanden, im letzten Lauf nicht gespeichert. Vorgang ist noch pending (kein hartes KI-Fail, sonst wäre er „failed“) – wahrscheinlich Zeit-/Tagesbudget oder Speichern. Genauer Grund pro Vorgang nicht in den Metadaten gespeichert.";
}

// „Verarbeitbare pending Vorgänge" – der/die im aktuellen Fenster verarbeitbare(n) Kandidat(en).
// Ruhig, mobil (gestapelt), max. 5, keine Rohtexte/Secrets.
function renderPendingKandidaten(d) {
  const ks = Array.isArray(d && d.kandidaten) ? d.kandidaten : [];
  const total = dsNum(d && d.imFenster);
  if (!ks.length) {
    return `<div class="ds-diag-kandidaten"><div class="ds-recovery-result-head"><span class="ds-sub">Verarbeitbare pending Vorgänge</span></div>
      <p class="ds-sub">Keine verarbeitbaren pending Vorgänge gefunden.</p></div>`;
  }
  const kopf = total === 1 ? "1 verarbeitbarer Vorgang übrig" : `${dsFmt(total)} verarbeitbare pending Vorgänge${ks.length < total ? ` (erste ${ks.length} angezeigt)` : ""}`;
  const ll = pendingLetzterLaufLabel(d && d.letzterLauf);
  const grund = pendingKandidatGrund(d && d.letzterLauf);
  const bloecke = ks.map((k) => `
    <div class="ds-diag-kandidat">
      ${dsRow("Vorgang", escapeHtml(k.vorgangId || "–"))}
      ${dsRow("Titel", k.titelKurz ? escapeHtml(k.titelKurz) : `<span class="ds-sub">–</span>`)}
      ${dsRow("Status", escapeHtml(k.status || "–"))}
      ${dsRow("Rohdokumente im Cluster", dsFmt(k.clusterDokumente))}
      ${dsRow("Alter", k.alterTage != null ? `${dsFmt(k.alterTage)} Tage${k.rohdokumentAlterTage != null ? ` · Rohdok ${dsFmt(k.rohdokumentAlterTage)} Tage` : ""}` : "–")}
      ${dsRow("Letzter Versuch", ll ? escapeHtml(ll) : `<span class="ds-sub">–</span>`)}
      ${dsRow("Grund", `<span class="ds-sub">${escapeHtml(grund)}</span>`)}
      ${dsRow("Empfehlung", `<span class="ds-sub">Understanding-Lauf erneut starten (ohne aktiven Lock). Bleibt der Vorgang, KI-Budget und Speicherpfad prüfen.</span>`)}
    </div>`).join("");
  return `<div class="ds-diag-kandidaten">
    <div class="ds-recovery-result-head"><span class="ds-warn">${escapeHtml(kopf)}</span></div>
    ${bloecke}</div>`;
}

function pendingDiagnoseGrundKurz(g) {
  const map = { "im-fenster": "im Fenster", "ausserhalb-fenster": "außerhalb Fenster", "keine-rohdokumente": "keine Rohdok." };
  return map[String(g || "")] || String(g || "");
}

// Kurzer, ruhiger Klartext-Satz zur wahrscheinlichsten Ursache (keine Handlung, kein Auto-Fix).
function pendingDiagnoseUrsacheHinweis(u) {
  const map = {
    "teils-verarbeitbar-verwaist": "Ein kleiner Teil wirkt verarbeitbar. Der größere Teil hat keine passenden Rohdokumente und sollte später separat bewertet werden.",
    "gemischt": "Ein kleiner Teil wirkt verarbeitbar. Der größere Teil hat keine passenden Rohdokumente und sollte später separat bewertet werden.",
    "ausserhalb-fenster": "Die Rohdokumente existieren, werden aber vom aktuellen Recovery-Fenster nicht erreicht.",
    "verwaist": "Für diese Vorgänge wurden keine passenden Rohdokumente gefunden. Sie sollten nicht automatisch verarbeitet werden.",
    "mapping-fehlt": "Rohdokumente existieren, werden aber nicht mehr eindeutig diesem Vorgang zugeordnet."
  };
  return map[String(u || "")] || "";
}

// Read-only Aktion: Pending-Diagnose. Kein confirm (verändert nichts), kein KI-Call.
async function runPendingDiagnose() {
  if (adminPendingDiagnoseBusy || adminRecoveryBusy) return;
  adminPendingDiagnoseBusy = true;
  adminRecoveryDetailsOpen = true; // Panel offen halten, damit die Diagnose sichtbar bleibt
  adminPendingDiagnose = { pending: true };
  render(); // render() bindet selbst — ein zweites bindActions() würde Listener doppeln
  try {
    const resp = await fetchWithTimeout(`/api/admin/recovery/pending-diagnose?${apiScopeQuery()}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    }, 60000);
    let json;
    try { json = await resp.json(); } catch (_) { json = {}; }
    adminPendingDiagnose = resp.ok ? json : { ok: false, fehler: `HTTP ${resp.status}` };
  } catch (_) {
    adminPendingDiagnose = { ok: false, fehler: "Zeitüberschreitung oder Netzwerkfehler" };
  } finally {
    adminPendingDiagnoseBusy = false;
    render(); // render() bindet selbst — ein zweites bindActions() würde Listener doppeln
  }
}

function stopRecoveryPolling() {
  if (adminRecoveryPollTimer) { clearInterval(adminRecoveryPollTimer); adminRecoveryPollTimer = null; }
}

// Read-only Status-Polling waehrend eines laufenden Understanding-Laufs: haelt die UI
// lebendig (zuletzt geprueft / Live-Laufzeit) und uebernimmt ein serverseitig persistiertes
// Abschluss-Ergebnis, falls der POST haengt/abbricht. NUTZT NUR den read-only Status-Endpoint
// -> kein KI-Call, keine Datenaenderung, kein zweiter Lauf, kein Auto-Lock-Lösen.
function startRecoveryPolling() {
  stopRecoveryPolling();
  adminRecoveryPollTimer = setInterval(async () => {
    if (!adminRecoveryBusy) { stopRecoveryPolling(); return; }
    try {
      const s = await fetchWithTimeout(`/api/admin/recovery-status?${apiScopeQuery()}`, {}, 20000);
      adminRecoveryLastCheck = helmutNowHHMM();
      // Nur mit einem GÜLTIGEN Objekt überschreiben — sonst letzten bekannten Stand behalten
      // (verhindert die leere "nicht verfügbar"-Karte bei leerer/unerwarteter Antwort).
      const j = s.ok ? await s.json().catch(() => null) : null;
      if (j && typeof j === "object" && !Array.isArray(j)) {
        adminRecovery = j;
        adminRecoveryStale = false;
        // Requirement E: hat der Server ein NEUES Abschluss-Ergebnis persistiert (finishedAt
        // aendert sich ggü. dem vorherigen Lauf), lokalen Läuft-Zustand beenden -> das
        // persistierte Ergebnis (oben) wird angezeigt. Uhr-unabhaengig (vergleicht Server-Zeiten).
        const rl = adminRecovery.letzterRecoveryLauf;
        if (rl && rl.finishedAt && rl.finishedAt !== adminRecoveryPrevFinishedAt && rl.anzeigeStatus !== "running") {
          adminRecoveryResult = null;   // persistiertes Ergebnis (oben) ist jetzt die Quelle
          adminRecoveryBusy = false;
          adminRecoveryStartMs = 0;      // späten POST vom Überschreiben abkoppeln
          stopRecoveryPolling();
        }
      } else {
        adminRecoveryStale = true;       // letzten Stand behalten, ruhige Notiz anzeigen
      }
    } catch (_) { adminRecoveryStale = true; /* Poll optional – niemals einen zweiten Lauf starten */ }
    render(); // render() bindet selbst — ein zweites bindActions() würde Listener doppeln
  }, 7000);
}

async function runRecoveryAction(action) {
  if (adminRecoveryBusy) return;
  if (action === "reset-failed") {
    const n = adminRecovery && adminRecovery.knowledgeObjects && adminRecovery.knowledgeObjects.failed;
    const suffix = typeof n === "number" ? ` (${n} betroffen)` : "";
    if (!window.confirm(`Failed-Vorgänge auf „pending" zurücksetzen${suffix}? Es werden KEINE Rohdokumente gelöscht.`)) return;
  }
  if (action === "run-understanding") {
    if (!window.confirm("Understanding-Lauf jetzt starten? Das nutzt die bestehende Pipeline und kann echte KI-Kosten verursachen.")) return;
  }
  const endpoints = {
    "release-lock": "/api/admin/recovery/release-lock",
    "reset-failed": "/api/admin/recovery/reset-failed",
    "run-understanding": "/api/admin/recovery/run-understanding"
  };
  const endpoint = endpoints[action];
  if (!endpoint) return;
  adminRecoveryBusy = true;
  adminRecoveryDetailsOpen = true; // Recovery-Panel offen halten, damit das Ergebnis sichtbar bleibt
  const startedAt = helmutNowHHMM();
  const myStart = Date.now();
  adminRecoveryResult = { action, pending: true, startedAt };
  if (action === "run-understanding") {
    // Live-Feedback vorbereiten: Startzeit merken, vorheriges Abschluss-Ergebnis festhalten
    // (zur Abschluss-Erkennung) und read-only Status-Polling starten.
    adminRecoveryStartMs = myStart;
    adminRecoveryLastCheck = null;
    adminRecoveryPrevFinishedAt = (adminRecovery && adminRecovery.letzterRecoveryLauf && adminRecovery.letzterRecoveryLauf.finishedAt) || null;
    startRecoveryPolling();
  }
  render(); // render() bindet selbst — ein zweites bindActions() würde Listener doppeln
  try {
    const body = action === "reset-failed" ? { confirm: true } : {};
    const resp = await fetchWithTimeout(`${endpoint}?${apiScopeQuery()}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }, action === "run-understanding" ? 250000 : 30000);
    let json = null;
    try { json = await resp.json(); } catch (_) { json = null; }
    const okShape = json && typeof json === "object" && !Array.isArray(json);
    // Nur anwenden, wenn dieser Lauf noch aktuell ist (das Polling hat evtl. schon abgeschlossen).
    if (adminRecoveryStartMs === myStart || action !== "run-understanding") {
      if (!resp.ok) {
        adminRecoveryResult = { action, ok: false, startedAt, finishedAt: helmutNowHHMM(), fehler: `HTTP ${resp.status}` };
      } else if (!okShape) {
        // Unerwarteter Response-Shape -> klare Meldung statt roher/leerer Anzeige.
        adminRecoveryResult = { action, unerwartet: true, startedAt, finishedAt: helmutNowHHMM() };
      } else {
        adminRecoveryResult = { action, startedAt, finishedAt: helmutNowHHMM(), ...json };
      }
    }
    // Status-Reload: NUR mit gültigem Objekt überschreiben, sonst letzten Stand behalten.
    try {
      const s = await fetchWithTimeout(`/api/admin/recovery-status?${apiScopeQuery()}`, {}, 25000);
      const j = s.ok ? await s.json().catch(() => null) : null;
      if (j && typeof j === "object" && !Array.isArray(j)) { adminRecovery = j; adminRecoveryStale = false; }
      else adminRecoveryStale = true;
    } catch (_) { adminRecoveryStale = true; /* Status-Reload optional */ }
  } catch (_) {
    // Nur wenn das Polling nicht bereits ein persistiertes Ergebnis uebernommen hat.
    if ((adminRecoveryStartMs === myStart && adminRecoveryBusy) || action !== "run-understanding") {
      adminRecoveryResult = { action, ok: false, startedAt, finishedAt: helmutNowHHMM(), fehler: "Zeitüberschreitung oder Netzwerkfehler" };
    }
  } finally {
    stopRecoveryPolling();
    adminRecoveryBusy = false;
    render(); // render() bindet selbst — ein zweites bindActions() würde Listener doppeln
  }
}

function renderAdminCrawlStats(crawlReport) {
  if (!crawlReport || crawlReport.noData) {
    return `
    <div class="admin-card admin-crawl-card">
      <h2 class="admin-section-title">Crawl-Trichter</h2>
      <p class="empty-state">Kein Crawl-Lauf vorhanden.</p>
    </div>`;
  }

  const scanned   = crawlReport.scannedArticles ?? 0;
  const saved     = crawlReport.deduplicatedArticles ?? 0;
  const dupes     = Math.max(0, scanned - saved);
  const vorgaenge = crawlReport.newVorgaenge ?? null;
  const kos       = crawlReport.newKnowledgeObjects ?? null;
  const durRaw    = crawlReport.durationSec;
  const durStr    = durRaw != null ? `${durRaw} Sek.` : "—";

  const crawlDate = crawlReport.lastCrawlAt
    ? new Date(crawlReport.lastCrawlAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

  const max = Math.max(scanned, 1);

  function pct(val) {
    if (val === null || val === undefined) return 0;
    return Math.min(100, Math.round((val / max) * 100));
  }

  function fmtNum(val) {
    if (val === null || val === undefined) return "—";
    return escapeHtml(String(val));
  }

  function fmtPct(val) {
    if (val === null || val === undefined || scanned === 0) return "";
    return `${pct(val)}%`;
  }

  function stage(motorName, motorKey, stageName, stageDesc, count) {
    return `
    <div class="cf-stage">
      <div class="cf-stage-meta">
        <span class="cf-badge cf-badge--${motorKey}">${escapeHtml(motorName)}</span>
        <span class="cf-stage-label">${escapeHtml(stageName)}</span>
        <span class="cf-stage-desc">${escapeHtml(stageDesc)}</span>
      </div>
      <div class="cf-stage-bar">
        <div class="cf-bar-track">
          <div class="cf-bar cf-bar--${motorKey}" style="width:${pct(count)}%"></div>
        </div>
        <div class="cf-bar-stats">
          <span class="cf-count">${fmtNum(count)}</span>
          <span class="cf-pct">${fmtPct(count)}</span>
        </div>
      </div>
    </div>`;
  }

  const errorLine = crawlReport.errorCount > 0
    ? `<p class="admin-crawl-errors">${crawlReport.errorCount} Fehler: ${(crawlReport.errors || []).slice(0, 3).map((e) => escapeHtml(e.sourceName || e.error || "")).join(", ")}</p>`
    : "";

  return `
    <div class="admin-card admin-crawl-card">
      <h2 class="admin-section-title">Crawl-Trichter <span class="admin-stat-period">${escapeHtml(crawlDate)} · ${escapeHtml(adminModusLabel(crawlReport.mode || "full"))}</span></h2>
      <div class="crawl-funnel">
        ${stage("Source Engine",       "blue",   "Gescannt",           "Alle Artikel aller Quellen",             scanned)}
        ${stage("Deduplizierung",      "gray",   "Duplikate entfernt", "Bereits bekannte Artikel gefiltert",     dupes)}
        ${stage("Knowledge Engine",    "green",  "Neu",                "Unbekannte Artikel übernommen",          saved)}
        ${stage("Update Engine",       "orange", "Vorgänge gebildet",  "Artikel zu Themen gruppiert",            vorgaenge)}
        ${stage("Intelligence Engine", "violet", "KI-analysiert",      "Vorgänge als Wissenshäppchen bewertet",  kos)}
      </div>
      ${errorLine}
      <div class="cf-footer">
        <span class="cf-footer-dur">⏱ ${escapeHtml(durStr)}</span>
        <span class="cf-footer-sources">${escapeHtml(String(crawlReport.checkedSources || 0))} Quellen geprüft · ${escapeHtml(String(crawlReport.failedSources || 0))} Fehler</span>
      </div>
      <div class="cf-legend">
        <span class="cf-legend-item"><span class="cf-dot cf-dot--blue"></span>Source Engine · Quellen gecrawlt</span>
        <span class="cf-legend-item"><span class="cf-dot cf-dot--gray"></span>Deduplizierung · Duplikatfilter</span>
        <span class="cf-legend-item"><span class="cf-dot cf-dot--green"></span>Knowledge Engine · Neue Artikel</span>
        <span class="cf-legend-item"><span class="cf-dot cf-dot--orange"></span>Update Engine · Vorgänge</span>
        <span class="cf-legend-item"><span class="cf-dot cf-dot--violet"></span>Intelligence Engine · KI-Analyse</span>
      </div>
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
    // Entscheidung kommt vom Server (V3 Decision Engine) — der Client rechnet die
    // Schwelle NICHT mehr selbst nach (Server ist die einzige Quelle der Wahrheit).
    decision: recommendation.decision || "Beobachten",
    classification: recommendation.priorityType === "risk" ? "risk" : "opportunity",
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

function render() {
  // Eintritts-Animationen (Karten/Refresh-Screen) nur bei echtem (Wieder-)Eintritt
  // abspielen: Ansichtswechsel ODER ein bewusst gesetzter Einmal-Schuss. Alle
  // übrigen Rebuilds (Hintergrund-Nachladen von Parlament/Office, Refresh-Fortschritt)
  // bleiben ruhig -> keine mehrfach aufpoppenden Karten. Klasse VOR innerHTML setzen,
  // damit die neu gemounteten Knoten den Zustand sehen.
  const enterAnim = animateNextRender || currentView !== lastAnimatedView;
  if (app) app.classList.toggle("anim-enter", enterAnim);
  app.innerHTML = `
    <div class="app-frame view-${escapeAttribute(currentView || "")}">
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
  lastAnimatedView = currentView;
  animateNextRender = false;
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
          <small>Dein politischer Stabschef</small>
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
  if (currentView === "detail" || currentView === "vorgang") return (detailOriginView || "briefing") === id;
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
        <button class="update-heart ${hasUpdates ? "has-updates" : ""}" type="button" data-updates aria-expanded="${updatesOpen ? "true" : "false"}" title="${hasUpdates ? "Mitteilungen anzeigen" : "Keine neuen Mitteilungen"}" aria-label="${hasUpdates ? "Mitteilungen anzeigen" : "Keine neuen Mitteilungen"}">
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
            <h2>Mitteilungen</h2>
          </div>
          <button type="button" data-close-updates aria-label="Benachrichtigungen schließen">×</button>
        </div>
        <div class="updates-list">
          ${updates.length ? updates.map(renderNotificationItem).join("") : `<p class="empty-state">Keine neuen Mitteilungen.</p>`}
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
  if (currentView === "vorgang") return renderVorgangDetailView();
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
  return renderLageView();
}

// ─────────────────────────────────────────────────────────────────────────
// Lage — reine Übersicht bereits vorhandener, quellengestützter Vorgänge.
// Beantwortet AUSSCHLIESSLICH "Worüber muss ich heute Bescheid wissen?".
// Erzeugt nichts, bewertet nichts global, priorisiert nichts global. Pro Karte
// genau EINE kurze, ausschließlich auf diesen einen Vorgang bezogene Empfehlung
// (bestehendes Feld v.empfehlung). Übergreifende Priorisierung, Strategie,
// Kommunikation und Tagesentscheidung bleiben Helmut vorbehalten.
//
// Titel, Kurzfassung, Warum-wichtig, Empfehlung und Kategorie kommen bevorzugt
// aus den vom V3-Verstehensschritt EINMALIG erzeugten, dauerhaft gespeicherten
// Feldern (v.displayTitle/displaySummary/whyRelevant/recommendation/
// displayCategory) — hier findet KEINE KI-Umformulierung/-Kürzung statt, nur
// Anzeige bereits gespeicherter Werte. Ältere Vorgänge ohne diese Felder nutzen
// einen rein deterministischen Fallback (nie ein KI-Aufruf beim Rendern, nie
// ein mitten im Satz abgeschnittener Titel).
// ─────────────────────────────────────────────────────────────────────────

function lageData() {
  return (briefing && briefing.lageBriefing) || null;
}

function lageDateLabel() {
  try {
    return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  } catch (_) { return ""; }
}

// Quellenregel: nur Vorgänge mit mind. einer echten Quelle dürfen erscheinen.
function lageHasSource(v) {
  if (!v) return false;
  if (Array.isArray(v.sources) && v.sources.length > 0) return true;
  return Number(v.sourceCount) > 0;
}

// ── Sichtbare Lage-Menge — der SERVER wählt zentral aus (lib/helmut/lage.js
// selectLageVorgaenge: moderne Vorgänge zuerst, danach die übrigen belegten,
// gemischt). Der Client übernimmt diese Auswahl 1:1 und filtert nur defensiv
// auf echte Quellen. FRÜHER stand hier eine Entweder-oder-Spiegelung mit
// strengerer 5-Feld-Definition: sobald EINE vollständige Karte existierte,
// verschwanden alle übrigen belegten, vom Server gelieferten Karten — das
// machte den Server-Fix wirkungslos ("nur zwei Karten"-Klasse). Keine
// Auswahlregel mehr im Client doppeln: Kopfzahl und Karussell stammen beide
// aus DERSELBEN Server-Menge.
function lageVisibleVorgaenge(data) {
  const list = (data && Array.isArray(data.vorgaenge)) ? data.vorgaenge : [];
  return list.filter(lageHasSource);
}

// Fallback-Kategorie für Vorgänge ohne v.displayCategory (ältere Vorgänge):
// Ausschuss/Ministerium falls vorhanden, sonst die erste echte Quelle (z. B.
// "Tagesschau"), sonst ein neutraler Fallback. Reine Anzeigelogik, kein neues
// Datenfeld.
function lageCardCategory(v) {
  if (v.policyField) return v.policyField;
  const firstSource = Array.isArray(v.sources) ? v.sources[0] : null;
  return (firstSource && firstSource.name) || "Vorgang";
}

// Dezenter Status-Chip oben rechts — ausschließlich aus dem bestehenden,
// bereits an den Client durchgereichten Feld v.status abgeleitet (kein neues
// Datenfeld, keine KI, keine erfundene Dringlichkeit).
// Object.create(null): v.status kann kein Fremdwert wie "constructor" den
// Prototype-Lookup umleiten (sonst würde z. B. "constructor" auf die echte
// Object-Konstruktorfunktion statt auf undefined auflösen).
const LAGE_STATUS_LABEL = Object.assign(Object.create(null), {
  neu: "Neu", update: "Aktualisiert", beobachtung: "Beobachten", abgeschlossen: "Abgeschlossen"
});
function lageStatusChip(v) {
  return LAGE_STATUS_LABEL[v.status] || "";
}

// Behandelt eine leere/nur-Leerzeichen-Zeichenkette wie "nicht vorhanden" —
// verhindert, dass ein Whitespace-Wert (z. B. v.displayTitle === "   ") ein
// Feld fälschlich als "gesetzt" gelten lässt.
function lageField(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

// Häufige deutsche Abkürzungen/Ordinalzahlen, vor denen ein "." KEIN
// Satzende ist (sonst würde z. B. "...in 2. Lesung beraten." schon nach
// "2." abgeschnitten, oder "Art. 5 Abs. 2 GG" mitten im Aktenzeichen).
const LAGE_ABBREV_TAIL = /(?:\b(?:Dr|Prof|Nr|Art|Abs|Std|Mio|Mrd|ca|etc|bzw|ggf|inkl|exkl|Kap|Abschn|Az|Str|Hr|Fr|z\.\s?B|u\.\s?a|d\.\s?h|u\.\s?U|o\.\s?ä)|[A-ZÄÖÜ]|\d{1,2})$/;

// Nimmt nur den ersten echten Satz (kein zweiter Satz, kein Fließtext) und
// kappt zusätzlich auf ein Zeichenbudget, das auf der Karte zuverlässig in
// die erlaubte Zeilenzahl passt. Erkennt gängige Abkürzungen/Ordinalzahlen,
// damit "2. Lesung"/"Art. 5"/"bzw." nicht fälschlich als Satzende gilt.
function lageFirstSentence(text, maxLen) {
  const t = lageField(text);
  if (!t) return "";
  const boundary = /[.!?](?=\s|$)/g;
  let m;
  let cutAt = -1;
  while ((m = boundary.exec(t))) {
    const idx = m.index;
    if (t[idx] === "." && LAGE_ABBREV_TAIL.test(t.slice(Math.max(0, idx - 8), idx))) continue;
    cutAt = idx + 1;
    break;
  }
  // Kein echtes Satzende gefunden -> auf ein festes Zeichenbudget begrenzen
  // (NICHT den ganzen Rohtext durchreichen, sonst könnte eine nachgelagerte
  // Kürzung mehr als einen Satz zusammenfassen).
  const first = (cutAt >= 0 ? t.slice(0, cutAt) : t.slice(0, 220)).trim();
  // Bewusst NICHT compactText() nutzen: das splittet intern über
  // twoSentenceSummary() erneut naiv auf jedem Satzzeichen (ohne
  // Abkürzungs-Erkennung) und würde den oben sauber bestimmten Satz wieder
  // an "Art."/"Abs."/"2." zerreißen. Nur das reine Zeichenbudget aus
  // compactText nachbilden, ohne die erneute Satzsplittung.
  if (first.length <= maxLen) return first;
  const sliced = first.slice(0, maxLen - 1).replace(/\s+\S*$/, "");
  return `${sliced || first.slice(0, maxLen - 1)}...`;
}

// Entfernt bekannte unpersönliche/analytische Floskeln ("Die Aussage
// signalisiert...", "Parteien und Akteure sollten..."), damit Warum-wichtig
// und Empfehlung direkt statt wie eine Analyseformel klingen. Rein
// listenbasiert (kein Sprachmodell) — greift nur bei bekannten Mustern am
// Satzanfang, erfindet nie neuen Inhalt. Bleibt nur das Satzzeichen übrig
// (Floskel ohne jeden eigenen Inhalt), wird der Originaltext gezeigt statt
// eine leere/fast leere Zeile.
const LAGE_STIFF_OPENERS = [
  /^die aussage signalisiert(?:\s+eine)?\s*/i,
  /^dies deutet auf\s*/i,
  /^es zeigt sich,?\s*dass\s*/i,
  /^die politische bewertung zeigt,?\s*dass\s*/i,
  /^parteien und akteure sollten\s*/i,
  /^politische akteure sollten\s*/i,
  /^akteure sollten\s*/i,
  /^es wird empfohlen,?\s*dass\s*/i,
  /^es empfiehlt sich,?\s*/i
];
function lageHumanize(text) {
  const original = String(text || "").trim();
  let t = original;
  for (const re of LAGE_STIFF_OPENERS) t = t.replace(re, "");
  t = t.trim();
  if (!t || !/[a-zA-ZÀ-ÖØ-öø-ÿ0-9]/.test(t)) return original;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function lageUpperFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Baumelnde Funktionswörter am Ende (nur entfernt, wenn der Titel wirklich
// gekürzt/angeschnitten wurde), damit ein Titel nicht auf "... die"/"... zur"/
// "... und" endet. BEWUSST OHNE trennbare Verbpartikeln/mehrdeutige Präpositionen
// (an/auf/zu/über/nach/vor/bei/aus/in/im/um ...) — sonst würde ein sauberer
// Klausel-Schluss wie "kündigt an" fälschlich zu "kündigt" verstümmelt.
const LAGE_TRAILING_FUNCTION_WORDS = /\s+(?:der|die|das|den|dem|des|dessen|deren|ein|eine|einen|einer|einem|eines|und|oder|aber|sowie|bzw|zur|zum|für|mit|von|vom|the|of)$/i;

// Erste natürliche Schnittgrenze (Satzzeichen/Doppelpunkt/Gedankenstrich/Komma)
// innerhalb [minIdx, maxIdx]. "." in gängigen Abkürzungen/Zahlen gilt NICHT als
// Grenze (nutzt dieselbe LAGE_ABBREV_TAIL-Erkennung wie lageFirstSentence).
function lageFirstBoundaryWithin(t, minIdx, maxIdx) {
  const re = /[.!?:;–—,]/g;
  let m;
  while ((m = re.exec(t))) {
    if (m.index > maxIdx) break;
    if (m.index < minIdx) continue;
    if (t[m.index] === "." && LAGE_ABBREV_TAIL.test(t.slice(Math.max(0, m.index - 8), m.index))) continue;
    return m.index;
  }
  return -1;
}

// Offizielle Kürzel langer Bundesbehörden — FAKTEN (amtliche Abkürzungen), KEINE
// Erfindung. Zweck: eine abgeleitete Überschrift soll nicht mit einem überlangen
// Institutionsnamen BEGINNEN. Längere/spezifischere Namen zuerst (Prefix-Match).
const LAGE_INSTITUTION_ABBR = [
  ["bundesministerium für umwelt, naturschutz, nukleare sicherheit und verbraucherschutz", "BMUV"],
  ["bundesministerium für familie, senioren, frauen und jugend", "BMFSFJ"],
  ["bundesministerium für wirtschaftliche zusammenarbeit und entwicklung", "BMZ"],
  ["bundesministerium für wohnen, stadtentwicklung und bauwesen", "BMWSB"],
  ["bundesministerium für wirtschaft und klimaschutz", "BMWK"],
  ["bundesministerium für ernährung und landwirtschaft", "BMEL"],
  ["bundesministerium für bildung und forschung", "BMBF"],
  ["bundesministerium für digitales und verkehr", "BMDV"],
  ["bundesministerium für arbeit und soziales", "BMAS"],
  ["bundesministerium des innern und für heimat", "BMI"],
  ["bundesministerium der verteidigung", "BMVg"],
  ["bundesministerium für gesundheit", "BMG"],
  ["bundesministerium der finanzen", "BMF"],
  ["bundesministerium der justiz", "BMJ"],
  ["bundesministerium des innern", "BMI"]
];
// Stichwörter, an denen "Langname (KÜRZEL)" als INSTITUTION erkannt wird — so wird
// "… (BMAS)" gekürzt, aber "Heil (SPD)" (Person/Partei) NIE verzerrt.
const LAGE_INSTITUTION_HINT = /ministerium|bundesamt|bundesanstalt|bundesagentur|beh[öo]rde|kommission|agentur|\bamt\b|anstalt|ausschuss|gewerkschaft|\bverband\b|\binstitut\b/i;

// Kürzt führende/überlange Institutionsnamen auf ihr amtliches Kürzel. Rein
// textuell/deterministisch, ERFINDET NICHTS (nur bekannte Abkürzungen bzw. das im
// Text selbst genannte Kürzel in Klammern). Person(Partei) bleibt unangetastet.
function lageShortenInstitutions(raw) {
  let s = String(raw || "");
  // (1) "… Langname (KÜRZEL) …" -> "… KÜRZEL …", NUR wenn der Langname eine
  //     Institution ist (Hint). So bleibt "Heil (SPD)" erhalten, "… (BMAS)" wird gekürzt.
  s = s.replace(/([A-Za-zÄÖÜäöüß][^()]{5,70}?)\s*\(([A-ZÄÖÜ][A-ZÄÖÜ0-9.]{1,8})\)/g,
    (m, name, abbr) => LAGE_INSTITUTION_HINT.test(name) ? abbr : m);
  // (2) Bekannter langer Behördenname AM ANFANG (optional mit Artikel) -> Kürzel.
  const lc = s.toLowerCase();
  for (const [long, abbr] of LAGE_INSTITUTION_ABBR) {
    for (const pre of ["das ", "der ", "die ", ""]) {
      if (lc.startsWith(pre + long)) return (abbr + s.slice((pre + long).length)).replace(/\s{2,}/g, " ").trim();
    }
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

// Leitet NUR für Alt-Vorgänge OHNE kuratierten displayTitle eine kurze, saubere
// Anzeigeüberschrift aus dem rohen Quellentitel ab. Rein deterministisch, KEINE
// KI, ERFINDET NICHTS: Institutionsnamen auf amtliche Kürzel + Normalisieren +
// sauberes Kürzen an Satz-/Klausel-/Wortgrenzen. So wirkt der Titel nicht mehr roh,
// zu lang, mit langer Institution beginnend oder mitten im Satz abgeschnitten.
// Kuratierte displayTitle werden NIE hier durchgereicht (Aufrufer bevorzugt sie).
const LAGE_TITLE_MAX = 72;
function lageDisplayHeadline(raw) {
  let t = lageField(raw);
  if (!t) return "";
  const hadEllipsis = /(?:\.{3,}|…)\s*$/.test(t);  // Quelle selbst schon angeschnitten?
  t = t.replace(/\s*(?:\.{3,}|…)\s*$/, "").trim(); // evtl. vorhandene Roh-Ellipse entfernen
  t = lageShortenInstitutions(t);                  // lange Behördennamen -> amtl. Kürzel
  let head;
  if (t.length <= LAGE_TITLE_MAX) {
    head = t;                                       // schon kurz -> im Kern unverändert
  } else {
    // 1) An der ersten natürlichen Klausel-/Satzgrenze kürzen -> sauberer Schnitt.
    const boundary = lageFirstBoundaryWithin(t, 24, LAGE_TITLE_MAX + 14);
    const clause = boundary > 0 ? t.slice(0, boundary).replace(/[\s,;:–—-]+$/, "").trim() : "";
    // 2) Sonst an der letzten Wortgrenze vor dem Budget kappen (nie im Wort).
    head = clause.length >= 20 ? clause : t.slice(0, LAGE_TITLE_MAX).replace(/\s+\S*$/, "").trim();
  }
  // Abschluss: Satzzeichen weg; NUR wenn wirklich gekürzt/angeschnitten zusätzlich
  // ein baumelndes Funktionswort entfernen -> nie ein "billiger" Abriss, aber ein
  // sauberer Klausel-Schluss ("kündigt an") bleibt erhalten. KEIN "…".
  head = head.replace(/[\s,;:–—-]+$/, "");
  if (hadEllipsis || t.length > LAGE_TITLE_MAX) {
    head = head.replace(LAGE_TRAILING_FUNCTION_WORDS, "").replace(/[\s,;:–—-]+$/, "");
  }
  head = head.trim();
  return lageUpperFirst(head || t.slice(0, LAGE_TITLE_MAX).replace(/\s+\S*$/, "").trim());
}

// Kurze Viewports (z. B. iPhone SE): .lage2-card-row p klemmt dort per CSS
// auf 2 statt 3 Zeilen (@media max-height:700px in styles.css), damit die
// Karte nie unter die Bottom Navigation reicht. Die Zeichenbudgets müssen
// diese Zeilengrenze kennen — sonst kürzt JS auf "3 Zeilen Länge" und CSS
// klemmt zusätzlich auf 2, was wie eine doppelte Kürzung wirken kann.
// Dieselbe Schwelle wie die CSS-Media-Query, bewusst dieselbe Zahl.
function lageIsShortViewport() {
  try { return Boolean(window.matchMedia && window.matchMedia("(max-height: 700px)").matches); }
  catch (_) { return false; }
}

function lageSourceRow(source) {
  const meta = [source.type, source.dateLabel || source.publishedAt, source.host].filter(Boolean).join(" · ");
  const href = source.url || (source.host ? `https://${source.host}` : "");
  const inner = `
    <span class="lage2-src-main">
      <span class="lage2-src-name">${escapeHtml(source.name || "Quelle")}</span>
      <span class="lage2-src-meta">${escapeHtml(meta)}</span>
    </span>
    <span class="lage2-src-open">${escapeHtml(source.documentType === "PDF" ? "PDF öffnen ↗" : "Öffnen ↗")}</span>`;
  return href
    ? `<a class="lage2-src-row" href="${escapeAttribute(href)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="lage2-src-row">${inner}</div>`;
}

function lageDocRow(doc) {
  const meta = [doc.kind, doc.sizeLabel].filter(Boolean).join(" · ");
  const href = doc.url && doc.url !== "#" ? doc.url : "";
  const inner = `
    <span class="lage2-doc-ico" aria-hidden="true">PDF</span>
    <span class="lage2-doc-main">
      <span class="lage2-doc-name">${escapeHtml(doc.name || "Dokument")}</span>
      <span class="lage2-doc-meta">${escapeHtml(meta)}</span>
    </span>`;
  return href
    ? `<a class="lage2-doc" href="${escapeAttribute(href)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="lage2-doc">${inner}</div>`;
}

// Eine große Karussell-Karte: Kategorie+Status -> Kurztitel -> Kurzfassung ->
// Warum wichtig -> Empfehlung. Antippbar: öffnet die Vorgang-Detailansicht als
// Bottom Sheet (Quellen, Betroffene, Chronologie) — siehe openVorgangSheet.
//
// Bevorzugt die vom V3-Verstehensschritt EINMALIG erzeugten, dauerhaft
// gespeicherten Felder (v.displayTitle/displaySummary/whyRelevant/
// recommendation/displayCategory) — hier passiert keine KI-Umformulierung,
// nur Anzeige bereits gespeicherter Werte (kein KI-Aufruf beim Rendern).
function renderVorgangCard(v) {
  // v.displayTitle ist der EINZIGE echte Anzeige-Titel: einmal in der
  // Understanding-Engine erzeugt, qualitätsgeprüft, dauerhaft gespeichert. Die
  // UI erzeugt/kürzt/repariert hier NICHTS (kein slice/substring/Ellipse).
  const displayTitle = lageField(v.displayTitle);
  const category = lageField(v.displayCategory) || lageCardCategory(v);
  const statusChip = lageStatusChip(v);
  // LEGACY-FALLBACK (nur für Alt-Vorgänge ohne display_title): aus dem rohen
  // Quellentitel eine kurze, saubere Anzeigeüberschrift ableiten (deterministisch,
  // ohne KI, ohne erfundene Fakten) — statt den rohen, überlangen Satz roh zu
  // zeigen oder ihn per CSS mitten im Satz "billig" abzuschneiden. Kuratierte
  // displayTitle werden weiterhin unverändert bevorzugt. Dieser Zweig soll nach
  // einem Backfill der neuen Felder vollständig verschwinden.
  const title = displayTitle || lageDisplayHeadline(v.title);
  const summary = v.summary || {};
  // Zeichenbudgets sind per Messung so gewählt, dass sie in die jeweils
  // erlaubte Zeilenzahl von .lage2-card-row p passen (3 Zeilen normal, 2 auf
  // kurzen Viewports) — sonst kann CSS-Line-Clamp den Text zusätzlich kappen
  // ("doppelte Kürzung"). Gilt für BEIDE Pfade: die gespeicherten Felder sind
  // zwar redaktionell kurz angelegt (~1 Satz), aber nicht hart auf das
  // Karten-Zeichenbudget begrenzt — lageFirstSentence bleibt daher auch für
  // v.displaySummary/whyRelevant/recommendation die letzte Absicherung gegen
  // eine von CSS unsauber (mitten in der Zeile) abgeschnittene Zeile.
  const shortVp = lageIsShortViewport();
  const kurzfassung = lageFirstSentence(lageField(v.displaySummary) || summary.wasIstPassiert || "", shortVp ? 58 : 95);
  const warum = lageFirstSentence(lageHumanize(lageField(v.whyRelevant) || summary.warumWichtig || ""), shortVp ? 58 : 85);
  const empfehlung = lageFirstSentence(lageHumanize(lageField(v.recommendation) || v.empfehlung || ""), shortVp ? 58 : 75);
  // Antippbar: öffnet die Detailansicht als Bottom Sheet (kein Seitenwechsel).
  // role/tabindex/aria machen die Karte für Tastatur & Screenreader bedienbar;
  // der eigentliche Tap-vs-Swipe-Handler sitzt in bindLageCarousel.
  const openId = escapeAttribute(v.vorgangId || v.id || "");
  return `
    <article class="lage2-card" data-lage-open="${openId}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${escapeAttribute("Details öffnen: " + (title || "Vorgang"))}">
      <div class="lage2-card-head">
        <span class="lage2-vtag">${escapeHtml(category)}</span>
        ${statusChip ? `<span class="lage2-status-chip">${escapeHtml(statusChip)}</span>` : ""}
      </div>
      <h2 class="lage2-card-title${displayTitle ? "" : " lage2-card-title-fallback"}">${escapeHtml(title)}</h2>
      <div class="lage2-card-body">
        ${kurzfassung ? `
        <div class="lage2-card-row">
          <span class="lage2-card-row-head">Kurzfassung</span>
          <p>${escapeHtml(kurzfassung)}</p>
        </div>` : ""}
        ${warum ? `
        <div class="lage2-card-row">
          <span class="lage2-card-row-head">Warum wichtig?</span>
          <p>${escapeHtml(warum)}</p>
        </div>` : ""}
        ${empfehlung ? `
        <div class="lage2-card-row">
          <span class="lage2-card-row-head">Empfehlung</span>
          <p>${escapeHtml(empfehlung)}</p>
        </div>` : ""}
      </div>
    </article>`;
}

// Frische der Lage aus den ECHTEN Quellendaten der sichtbaren Karten (kein neues
// Serverfeld, keine Behauptung): Zeitpunkt der neuesten Quelle, heute mit Uhrzeit.
function lageFreshnessLabel(vorgaenge) {
  let newest = 0;
  for (const v of vorgaenge || []) {
    for (const s of (v && Array.isArray(v.sources) ? v.sources : [])) {
      const t = Date.parse(s && s.publishedAt ? s.publishedAt : "");
      if (Number.isFinite(t) && t > newest) newest = t;
    }
  }
  if (!newest) return "";
  const d = new Date(newest);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Neueste Quelle heute, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr.`;
  }
  return `Neueste Quelle vom ${d.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}.`;
}

// STOERUNGSWAHRHEIT (Audit-Fix 2026-07): Lage-Ausfallgründe (Server: available:false
// + reason) auf ehrliche Zustände mappen — Datenausfall/Budget nie als ruhiger Tag.
function lageDisruption(data) {
  if (!data || data.available !== false) return null;
  const reason = String(data.reason || "");
  if (reason === "store-error" || reason === "v3-disabled" || reason === "error") {
    return {
      kind: "stoerung",
      title: "Daten derzeit nicht verfügbar",
      sub: "Technische Störung beim Laden der Datenbasis — das ist kein ruhiger Tag. Bitte in einigen Minuten erneut öffnen."
    };
  }
  if (reason === "budget") {
    return {
      kind: "budget",
      title: "KI-Tageskontingent erreicht",
      sub: "Neue Auswertungen pausieren bis morgen früh. Bereits ausgewertete Vorgänge bleiben gültig."
    };
  }
  if (reason === "no-vorgaenge") {
    return {
      kind: "datenluecke",
      title: "Keine ausgewerteten Vorgänge verfügbar",
      sub: "Die Datenbasis liefert gerade keine analysierten Vorgänge — vermutlich eine Datenlücke, kein ruhiger Nachrichtentag."
    };
  }
  return null;
}

// Leerer Zustand: keine Fake-/Seed-/Platzhalter-Karten, nur ein ruhiger Hinweis.
function renderLageEmpty(greeting, dateLabel, emptyState, data) {
  // Sprint 5 (additiv): liegt ein unterscheidbarer Leerzustand vor (gap/stale/quiet),
  // wird dessen ehrliche Ueberschrift/Erklaerung gezeigt — Datenluecke nie als ruhiger
  // Tag. Ohne emptyState (Scoring-Flag aus) greift die Stoerungswahrheit über
  // data.reason; erst danach der neutrale Alt-Leertext.
  const es = emptyState && emptyState.kind ? emptyState : null;
  const disruption = es ? null : lageDisruption(data);
  const title = es && es.headline ? es.headline
    : disruption ? disruption.title
    : "Heute liegen noch keine quellengestützten Vorgänge vor.";
  const sub = es && es.detail ? es.detail
    : disruption ? disruption.sub
    : "Sobald neue geprüfte Quellen verfügbar sind, erscheint hier deine Lage.";
  const emptyKind = es ? es.kind : (disruption ? disruption.kind : "");
  return `
    <section class="lage2 lage2-empty-wrap"${emptyKind ? ` data-empty-kind="${escapeAttribute(emptyKind)}"` : ""}>
      <header class="lage2-head">
        <span class="lage2-date">${escapeHtml(dateLabel)}</span>
        <h1 class="lage2-greeting">${escapeHtml(greeting)}</h1>
      </header>
      <div class="lage2-empty">
        <p class="lage2-empty-title">${escapeHtml(title)}</p>
        <p class="lage2-empty-sub">${escapeHtml(sub)}</p>
      </div>
    </section>`;
}

function renderLageView() {
  const data = lageData();
  const firstName = (profile && profile.fullName ? profile.fullName : "").split(" ")[0];
  const greeting = (typeof timeGreeting === "function" ? timeGreeting(firstName) : (firstName ? `Guten Morgen, ${firstName}.` : "Guten Morgen."));
  const dateLabel = lageDateLabel();
  const vorgaenge = lageVisibleVorgaenge(data);
  if (!vorgaenge.length) return renderLageEmpty(greeting, dateLabel, data && data.emptyState, data);
  const count = vorgaenge.length;
  // EHRLICHE KOPFZEILE (Audit-Fix 2026-07): "Heute gibt es N NEUE Vorgänge"
  // etikettierte beliebig alte Vorgänge als heutige Neuigkeiten. Jetzt: neutrale
  // Zählung + sichtbare Frische der neuesten Quelle (macht veraltete Daten ruhig
  // und ohne Alarmismus erkennbar).
  const countWord = count === 1 ? "relevanter Vorgang" : "relevante Vorgänge";
  const fresh = lageFreshnessLabel(vorgaenge);
  return `
    <section class="lage2">
      <header class="lage2-head">
        <span class="lage2-date">${escapeHtml(dateLabel)}</span>
        <h1 class="lage2-greeting">${escapeHtml(greeting)}</h1>
        <p class="lage2-count"><b>${count}</b> ${countWord} in deiner Lage.${fresh ? ` <span class="lage2-stand">${escapeHtml(fresh)}</span>` : ""}</p>
      </header>
      ${data.demo ? `<span class="lage2-demo">Beispiel-Briefing · Demodaten</span>` : ""}

      <div class="lage2-carousel-bleed">
        <div class="lage2-carousel" data-lage-track>
          ${vorgaenge.map(renderVorgangCard).join("")}
        </div>
        ${count > 1 ? `
        <div class="lage2-dots" data-lage-dots aria-hidden="true">
          ${vorgaenge.map((_, i) => `<span class="lage2-dot-item${i === 0 ? " active" : ""}"></span>`).join("")}
        </div>` : ""}
      </div>
    </section>`;
}

// Merkt sich die Scroll-Position übers volle Re-Rendern hinweg (z. B. Menü/Update-
// Panel öffnen&schließen ersetzt app.innerHTML komplett) — sonst spränge das
// Karussell beim nächsten Render ungefragt auf die erste Karte zurück.
let lageCarouselScrollLeft = 0;

// Aktualisiert die Pagination-Punkte beim nativen Scroll (kein Re-Render nötig).
function bindLageCarousel() {
  const track = app.querySelector("[data-lage-track]");
  if (!track) return;
  if (lageCarouselScrollLeft) track.scrollLeft = lageCarouselScrollLeft;
  const dotsWrap = app.querySelector("[data-lage-dots]");
  const cards = track.querySelectorAll(".lage2-card");
  const dots = dotsWrap ? dotsWrap.querySelectorAll(".lage2-dot-item") : null;
  const updateDots = () => {
    if (!dots || !dots.length || !cards.length) return;
    const trackLeft = track.getBoundingClientRect().left;
    let closest = 0;
    let closestDist = Infinity;
    cards.forEach((card, i) => {
      const dist = Math.abs(card.getBoundingClientRect().left - trackLeft);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });
    dots.forEach((dot, i) => dot.classList.toggle("active", i === closest));
  };
  let scrollTimer = null;
  track.addEventListener("scroll", () => {
    lageCarouselScrollLeft = track.scrollLeft;
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(updateDots, 80);
  }, { passive: true });
  updateDots();
  bindLageCardTap(track);
}

// Tap-vs-Swipe-Wächter: das Karussell scrollt horizontal, deshalb darf ein
// Wisch NICHT als Kartentipp gelten. Wir merken uns Startpunkt/-zeit und öffnen
// die Detailansicht nur bei geringer Bewegung und kurzer Dauer (echter Tap).
// Delegation am Track (nur einmal gebunden, überlebt Karten-Neuaufbau nicht —
// wird bei jedem Render neu verdrahtet, daher hier lokale Handler ohne Leak).
function bindLageCardTap(track) {
  let sx = 0, sy = 0, st = 0, moved = false;
  track.addEventListener("pointerdown", (e) => {
    const card = e.target.closest("[data-lage-open]");
    if (!card) { st = 0; return; }
    sx = e.clientX; sy = e.clientY; st = Date.now(); moved = false;
  }, { passive: true });
  track.addEventListener("pointermove", (e) => {
    if (!st) return;
    if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) moved = true;
  }, { passive: true });
  const endTap = (e) => {
    if (!st) return;
    const dt = Date.now() - st;
    const card = e.target.closest("[data-lage-open]");
    st = 0;
    if (card && !moved && dt < 600) openVorgangSheet(card.getAttribute("data-lage-open"));
  };
  track.addEventListener("pointerup", endTap, { passive: true });
  track.addEventListener("pointercancel", () => { st = 0; }, { passive: true });
  // Tastaturbedienung: Enter/Leertaste auf der fokussierten Karte öffnet.
  track.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-lage-open]");
    if (!card) return;
    e.preventDefault();
    openVorgangSheet(card.getAttribute("data-lage-open"));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Vorgang-Detailansicht als Bottom Sheet (Apple-Maps/Wallet-Anmutung)
// ───────────────────────────────────────────────────────────────────────────
// GRUNDSATZ: Diese Ansicht ERZEUGT NIE Inhalte. Sie zeigt ausschließlich bereits
// in der Karte vorhandene, vom V3-Verstehensschritt EINMALIG erzeugten KO-Daten
// (Single Source of Truth). KEIN KI-Aufruf, KEINE neue API, KEINE neue
// DB-Abfrage, KEIN neuer State — die Vorgangsdaten liegen schon im Frontend
// (briefing.lageBriefing.vorgaenge).
//
// Technik: Das Sheet wird IMPERATIV als Overlay direkt an document.body gehängt,
// NICHT als Teil von app.innerHTML. So zerstört ein Re-Render der App (Menü,
// Update-Panel, Datenaktualisierung) das offene Sheet nicht und die
// Drag-Animation läuft flüssig ohne Framework/Re-Render.
// ═══════════════════════════════════════════════════════════════════════════
let vsheetEl = null;          // aktueller Overlay-Wurzelknoten oder null
let vsheetLastFocus = null;   // Fokus-Rückgabeziel (die angetippte Karte)
let vsheetKeyHandler = null;  // globaler Escape/Tab-Handler (zum sauberen Entfernen)
let vsheetGhostGuard = null;  // löst den Ghost-Click-Fänger (siehe openVorgangSheet)

// Findet den Vorgang in den bereits geladenen Briefing-Daten (kein Fetch).
function vsheetFindVorgang(id) {
  const data = lageData();
  const list = (data && Array.isArray(data.vorgaenge)) ? data.vorgaenge : [];
  return list.find((v) => String(v.vorgangId || v.id || "") === String(id)) || null;
}

// Respektiert die Systemeinstellung „Bewegung reduzieren" (keine Slide-Animation).
function vsheetReduceMotion() {
  try { return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  catch (_) { return false; }
}

// Vereinigt mehrere Betroffene-Listen dedupliziert (case-insensitiv), deckelt
// die Chip-Zahl je Gruppe. Reine Anzeige, erfindet nichts.
function vsheetMergeNames(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const s = lageField(raw);
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= 14) return out;
    }
  }
  return out;
}

// Zerlegt bereits vorhandenen Text deterministisch in einzelne Sätze für die
// Stichpunkt-Darstellung von „Warum wichtig?". KEINE KI, kein neuer Inhalt —
// nur Formatierung; erkennt gängige Abkürzungen wie lageFirstSentence.
function vsheetSentences(text, max) {
  const t = lageField(text);
  if (!t) return [];
  const out = [];
  const boundary = /[.!?](?=\s|$)/g;
  let m, start = 0;
  while ((m = boundary.exec(t))) {
    const idx = m.index;
    if (t[idx] === "." && LAGE_ABBREV_TAIL.test(t.slice(Math.max(0, idx - 8), idx))) continue;
    const s = t.slice(start, idx + 1).trim();
    if (s) out.push(s);
    start = idx + 1;
    if (out.length >= max) break;
  }
  const tail = t.slice(start).trim();
  if (tail && out.length < max) out.push(tail);
  return out.length ? out : [t];
}

// Kopfzeilen-Datum: bevorzugt created_at (Entstehung des Vorgangs), sonst das
// bereits berechnete updatedLabel. Nur Anzeige eines bestehenden Wertes.
function vsheetDateLabel(v) {
  const iso = lageField(v.createdAt);
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      try {
        return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric" }).format(d);
      } catch (_) { /* fällt unten auf updatedLabel zurück */ }
    }
  }
  return lageField(v.updatedLabel);
}

// Sortier-Zeitstempel einer Quelle: nur echte, parsbare Daten zählen; „Heute"
// o. Ä. ist nicht parsbar -> 0 (Originalreihenfolge bleibt stabil erhalten).
function vsheetSourceTime(s) {
  const cand = s && (s.publishedAt || s.published_at || s.dateLabel || s.date);
  const t = cand ? Date.parse(cand) : NaN;
  return isNaN(t) ? 0 : t;
}

// Quellen „neueste zuerst": stabil nach parsbarem Datum absteigend; Quellen ohne
// parsbares Datum behalten ihre Reihenfolge (beste Quelle zuerst aus dedupSources).
function vsheetSourcesSorted(sources) {
  const arr = Array.isArray(sources) ? sources.slice() : [];
  return arr
    .map((s, i) => ({ s, i, t: vsheetSourceTime(s) }))
    .sort((a, b) => (b.t - a.t) || (a.i - b.i))
    .map((x) => x.s);
}

// Baut das Betroffene-Segment (Chips, nach Typ gruppiert). Leere Gruppen und ein
// komplett leeres Segment werden weggelassen (kein Platzhalter, kein Spinner).
function vsheetBetroffeneHtml(v) {
  const groups = [
    { label: "Parteien", items: vsheetMergeNames(v.parteien, v.mentionedParties) },
    { label: "Ministerien", items: vsheetMergeNames(v.ministerien, v.mentionedMinistries) },
    { label: "Ausschüsse", items: vsheetMergeNames(v.ausschuesse, v.mentionedCommittees) },
    { label: "Personen", items: vsheetMergeNames(v.mentionedPeople) }
  ].filter((g) => g.items.length);
  if (!groups.length) return "";
  return `
    <section class="vsheet-sec">
      <h3 class="vsheet-h">Betroffene</h3>
      <div class="vsheet-groups">
        ${groups.map((g) => `
        <div class="vsheet-group">
          <span class="vsheet-group-label">${escapeHtml(g.label)}</span>
          <div class="vsheet-chips">
            ${g.items.map((it) => `<span class="vsheet-chip">${escapeHtml(it)}</span>`).join("")}
          </div>
        </div>`).join("")}
      </div>
    </section>`;
}

// Quellen-Zeile speziell fürs Sheet: klare Hierarchie — Name (primär), darunter
// Zeit · Quelle (sekundär), rechts ein dezentes Externer-Link-Symbol. Nutzt
// ausschließlich vorhandene Quellenfelder (kein neuer Datenzugriff).
function vsheetSourceRow(source) {
  const name = lageField(source.name) || "Quelle";
  const time = lageField(source.dateLabel || source.publishedAt || source.published_at);
  const host = lageField(source.host);
  const meta = [time, host].filter(Boolean).join(" · ");
  const href = source.url && isHttpUrl(source.url) ? source.url : (host ? `https://${host}` : "");
  const ext = `<svg class="vsheet-src-ext" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const inner = `
    <span class="vsheet-src-main">
      <span class="vsheet-src-name">${escapeHtml(name)}</span>
      ${meta ? `<span class="vsheet-src-meta">${escapeHtml(meta)}</span>` : ""}
    </span>
    ${href ? ext : ""}`;
  return href
    ? `<a class="vsheet-src" href="${escapeAttribute(href)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="vsheet-src">${inner}</div>`;
}

// Status DIESES Vorgangs — rein aus dem bereits vorhandenen Feld v.status
// (dieselbe Zuordnung wie der Karten-Status-Chip, LAGE_STATUS_LABEL). KEIN neues
// Feld, KEINE KI, KEINE Berechnung, KEINE Tagesentscheidung. Farbe ist reine
// Anzeigekonvention des vorhandenen Status. Unbekannter/fehlender Status ->
// Abschnitt wird weggelassen (keine Dummy-Werte).
const VSHEET_STATUS_DOT = Object.assign(Object.create(null), {
  beobachtung: "is-green", neu: "is-amber", update: "is-amber", abgeschlossen: "is-neutral"
});
function vsheetStatusHtml(v) {
  const label = LAGE_STATUS_LABEL[v && v.status];
  if (!label) return "";
  const dot = VSHEET_STATUS_DOT[v.status] || "is-neutral";
  return `<div class="vsheet-status"><span class="vsheet-status-dot ${dot}" aria-hidden="true"></span><span>${escapeHtml(label)}</span></div>`;
}

// Rendert den kompletten Sheet-Inhalt (8 Abschnitte, leere ausgeblendet) aus den
// bereits vorhandenen Kartendaten — keinerlei Neuberechnung/Fetch/KI.
function vsheetContentHtml(v) {
  const displayTitle = lageField(v.displayTitle);
  const title = displayTitle || lageField(v.title) || "Vorgang";
  const category = lageField(v.displayCategory) || lageCardCategory(v);
  const dateLabel = vsheetDateLabel(v);
  const sourcesSorted = vsheetSourcesSorted(v.sources);
  const firstSourceName = sourcesSorted.length ? lageField(sourcesSorted[0].name) : "";

  // (2) Kurzfassung — bestehendes display_summary (Fallback: was_ist_passiert).
  const kurz = lageField(v.displaySummary) || lageField(v.summary && v.summary.wasIstPassiert);
  // (3) Warum wichtig — bestehendes why_relevant als Stichpunkte (Fallback:
  // warumWichtig). In der Detailansicht VOLLSTÄNDIG: alle Sätze als Stichpunkte,
  // keine künstliche Begrenzung. Der hohe Wert ist nur ein Sicherheitsnetz gegen
  // pathologisches Splitten — es wird KEIN Inhalt erzeugt oder gekürzt.
  const warumSrc = lageHumanize(lageField(v.whyRelevant) || lageField(v.summary && v.summary.warumWichtig));
  const warumPoints = warumSrc ? vsheetSentences(warumSrc, 40) : [];
  // (4) Empfehlung — bestehendes recommendation (Fallback: handlungsempfehlung).
  const reco = lageHumanize(lageField(v.recommendation) || lageField(v.empfehlung));
  // (5) Betroffene
  const betroffene = vsheetBetroffeneHtml(v);
  // (7) Chronologie — bereits in der Karte vorhanden (buildChronology), keine Neuberechnung.
  const chrono = Array.isArray(v.chronologie) ? v.chronologie : [];

  const hasBody = kurz || warumPoints.length || reco || betroffene || sourcesSorted.length || chrono.length;

  return `
    <header class="vsheet-head">
      <span class="lage2-vtag">${escapeHtml(category)}</span>
      <h2 id="vsheet-title" class="vsheet-title${displayTitle ? "" : " vsheet-title-fallback"}">${escapeHtml(title)}</h2>
      <div class="vsheet-metaline">
        <span class="vsheet-meta-type">Politischer Vorgang</span>
        ${dateLabel ? `<span class="vsheet-metasep" aria-hidden="true">·</span><span>${escapeHtml(dateLabel)}</span>` : ""}
        ${firstSourceName ? `<span class="vsheet-metasep" aria-hidden="true">·</span><span>${escapeHtml(firstSourceName)}</span>` : ""}
      </div>
    </header>

    ${kurz ? `
    <section class="vsheet-sec">
      <p class="vsheet-lede">${escapeHtml(kurz)}</p>
      ${vsheetStatusHtml(v)}
    </section>` : vsheetStatusHtml(v) ? `<section class="vsheet-sec">${vsheetStatusHtml(v)}</section>` : ""}

    ${warumPoints.length ? `
    <section class="vsheet-sec">
      <h3 class="vsheet-h">Warum wichtig?</h3>
      <ul class="vsheet-why">
        ${warumPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}
      </ul>
    </section>` : ""}

    ${reco ? `
    <section class="vsheet-sec">
      <h3 class="vsheet-h">Empfehlung</h3>
      <p class="vsheet-reco">${escapeHtml(reco)}</p>
    </section>` : ""}

    ${betroffene}

    ${sourcesSorted.length ? `
    <section class="vsheet-sec">
      <h3 class="vsheet-h">Originalquellen</h3>
      <div class="vsheet-sources">${sourcesSorted.map(vsheetSourceRow).join("")}</div>
    </section>` : ""}

    ${chrono.length ? `
    <section class="vsheet-sec">
      <h3 class="vsheet-h">Chronologie</h3>
      <ul class="vsheet-chrono">
        ${chrono.map((c) => `<li><time>${escapeHtml([c.dateLabel, c.timeLabel].filter(Boolean).join(", "))}</time><p>${escapeHtml(c.text)}</p></li>`).join("")}
      </ul>
    </section>` : ""}

    ${hasBody ? "" : `<section class="vsheet-sec"><p class="vsheet-empty">Information nicht verfügbar.</p></section>`}`;
}

// Öffnet das Bottom Sheet für einen Vorgang. Idempotent: ein bereits offenes
// Sheet wird zuerst entfernt.
function openVorgangSheet(id) {
  const v = vsheetFindVorgang(id);
  if (!v) return;
  if (vsheetEl) { vsheetTeardown(); }

  vsheetLastFocus = document.activeElement;

  const root = document.createElement("div");
  root.className = "vsheet-root";
  root.innerHTML = `
    <div class="vsheet-backdrop" data-vsheet-close></div>
    <div class="vsheet" role="dialog" aria-modal="true" aria-labelledby="vsheet-title" tabindex="-1">
      <div class="vsheet-topbar" data-vsheet-topbar>
        <div class="vsheet-grip" data-vsheet-grip aria-hidden="true"><span class="vsheet-grabber"></span></div>
        <button class="vsheet-close" type="button" data-vsheet-close aria-label="Detailansicht schließen">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="vsheet-scroll" data-vsheet-scroll>${vsheetContentHtml(v)}</div>
    </div>`;
  document.body.appendChild(root);
  vsheetEl = root;

  const sheet = root.querySelector(".vsheet");
  const scroller = root.querySelector("[data-vsheet-scroll]");

  // Obere Bedienebene (Grabber + X) beim Scrollen dezent absetzen: sobald der
  // Inhalt scrollt, erscheint unter der sticky Leiste eine feine Trennlinie —
  // wirkt hochwertiger und hält die Bedienelemente klar erreichbar.
  const topbar = root.querySelector("[data-vsheet-topbar]");
  scroller.addEventListener("scroll", () => {
    if (topbar) topbar.classList.toggle("is-scrolled", scroller.scrollTop > 4);
  }, { passive: true });

  // Hintergrund-Scroll sperren, solange das Sheet offen ist.
  const prevOverflow = document.body.style.overflow;
  root.dataset.prevOverflow = prevOverflow || "";
  document.body.style.overflow = "hidden";

  // Schließen-Auslöser (X, Backdrop).
  root.querySelectorAll("[data-vsheet-close]").forEach((el) => {
    el.addEventListener("click", () => closeVorgangSheet());
  });

  // ── Ghost-Click-Schutz (behebt „Sheet öffnet und schließt sofort") ────────
  // Der Tap, der das Sheet öffnet, endet mit pointerup auf der KARTE; direkt
  // danach feuert der Browser (auf Touch als verzögertes Kompat-Event) genau
  // EINEN click an derselben Bildschirmstelle. Da das bildschirmfüllende Backdrop
  // nun über der Tap-Stelle liegt, träfe dieser eine Klick das Backdrop und würde
  // das gerade geöffnete Sheet SOFORT wieder schließen. Wir fangen exakt diesen
  // einen nachfolgenden Klick in der CAPTURE-Phase ab (läuft vor dem Backdrop-
  // Handler) und lösen den Fänger danach wieder — spätere, bewusste Backdrop-
  // Klicks (neue Geste) schließen wie vorgesehen.
  {
    let ghostTimer = 0;
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); releaseGuard(); };
    const releaseGuard = () => {
      if (ghostTimer) { window.clearTimeout(ghostTimer); ghostTimer = 0; }
      document.removeEventListener("click", swallow, true);
      vsheetGhostGuard = null;
    };
    document.addEventListener("click", swallow, true);
    ghostTimer = window.setTimeout(releaseGuard, 700); // falls doch kein Klick folgt
    vsheetGhostGuard = releaseGuard;
  }

  // Escape + einfacher Fokus-Trap (Tab bleibt im Sheet).
  vsheetKeyHandler = (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeVorgangSheet(); return; }
    if (e.key === "Tab") vsheetTrapFocus(e, sheet);
  };
  document.addEventListener("keydown", vsheetKeyHandler);

  // Snap-Geometrie nach dem ersten Layout messen und Drag verdrahten.
  const setup = () => {
    const H = window.innerHeight || document.documentElement.clientHeight || 800;
    const sheetH = sheet.getBoundingClientRect().height || Math.round(H * 0.92);
    // Standard-Öffnungshöhe: hoch & dominant (~83 % der Bildschirmhöhe) — der
    // Nutzer tippt bewusst und will sofort lesen. Per Ziehen weiter bis Vollbild
    // (expanded = 0), per Wisch nach unten / X schließen.
    const collapsed = Math.max(0, Math.round(sheetH - H * 0.83)); // ~83 % sichtbar
    const geom = { H, sheetH, collapsed, expanded: 0, current: collapsed };
    vsheetInstallDrag(root, sheet, scroller, geom);
    // Einfahren: von unten (offscreen) auf die eingeklappte Position.
    if (vsheetReduceMotion()) {
      vsheetApplyY(sheet, geom.collapsed); geom.current = geom.collapsed;
      root.classList.add("open");
    } else {
      vsheetApplyY(sheet, sheetH); // Startposition unten
      // Reflow erzwingen, damit die Transition zur Zielposition greift.
      void sheet.getBoundingClientRect().height;
      requestAnimationFrame(() => {
        root.classList.add("open");
        sheet.classList.add("vsheet-anim");
        vsheetApplyY(sheet, geom.collapsed);
        geom.current = geom.collapsed;
      });
    }
  };
  requestAnimationFrame(setup);

  // Fokus in den Dialog selbst (nicht auf das X) — Fokus liegt auf dem Inhalt,
  // kein prominenter Fokusring auf der Schließen-Schaltfläche. Der Fokus-Trap
  // (Tab) und Escape bleiben aktiv.
  requestAnimationFrame(() => {
    if (sheet) { try { sheet.focus({ preventScroll: true }); } catch (_) { sheet.focus(); } }
  });
}

// Setzt die vertikale Verschiebung des Sheets (Snap/Drag).
function vsheetApplyY(sheet, y) {
  sheet.style.transform = `translateY(${Math.round(y)}px)`;
}

// Verdrahtet Drag/Swipe: Griff und (bei ScrollTop 0) das Sheet lassen sich
// ziehen; Loslassen snappt zur nächsten Rastung oder schließt (Wisch nach unten).
function vsheetInstallDrag(root, sheet, scroller, geom) {
  let active = false;       // Drag aktiv (Pointer erfasst)
  let decided = false;      // Richtung entschieden (Drag vs. Scroll)
  let startY = 0, startT = 0, lastY = 0, lastTime = 0, velocity = 0;
  let fromGrip = false;

  const onDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const grip = e.target.closest("[data-vsheet-grip]");
    fromGrip = Boolean(grip);
    active = true; decided = fromGrip;
    startY = e.clientY; startT = geom.current;
    lastY = e.clientY; lastTime = Date.now(); velocity = 0;
    if (fromGrip) {
      sheet.classList.remove("vsheet-anim");
      try { sheet.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
  };

  const onMove = (e) => {
    if (!active) return;
    const dy = e.clientY - startY;
    if (!decided) {
      const canDragDown = dy > 4 && scroller.scrollTop <= 0;
      const canDragUp = dy < -4 && geom.current > 1 && scroller.scrollTop <= 0;
      if (canDragDown || canDragUp) {
        decided = true;
        sheet.classList.remove("vsheet-anim");
        try { sheet.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      } else if (Math.abs(dy) > 4) {
        // Vertikaler Scroll im Inhalt -> kein Drag.
        active = false;
        return;
      } else {
        return;
      }
    }
    // Position aktualisieren (nicht über die eingefahrene Kante hinaus nach oben).
    let y = startT + dy;
    if (y < geom.expanded) y = geom.expanded;
    if (y > geom.sheetH) y = geom.sheetH;
    geom.current = y;
    vsheetApplyY(sheet, y);
    const now = Date.now();
    const dt = now - lastTime;
    if (dt > 0) velocity = (e.clientY - lastY) / dt; // px/ms, positiv = nach unten
    lastY = e.clientY; lastTime = now;
    if (e.cancelable) e.preventDefault();
  };

  const onUp = (e) => {
    if (!active) return;
    active = false;
    try { sheet.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (!decided) return;
    decided = false;
    sheet.classList.add("vsheet-anim");
    const y = geom.current;
    const flungDown = velocity > 0.8;
    const flungUp = velocity < -0.8;
    // Schließen: weit unter die Rastung gezogen oder kräftig nach unten gewischt.
    if ((y > geom.collapsed + geom.H * 0.12) || (flungDown && y > geom.collapsed - 4)) {
      closeVorgangSheet();
      return;
    }
    // Sonst zur nächsten Rastung snappen (Wischrichtung hat Vorrang).
    let target;
    if (flungUp) target = geom.expanded;
    else if (flungDown) target = geom.collapsed;
    else target = (y < geom.collapsed / 2) ? geom.expanded : geom.collapsed;
    geom.current = target;
    vsheetApplyY(sheet, target);
  };

  sheet.addEventListener("pointerdown", onDown);
  sheet.addEventListener("pointermove", onMove);
  sheet.addEventListener("pointerup", onUp);
  sheet.addEventListener("pointercancel", onUp);
  // Referenzen für sauberes Entfernen merken.
  root._vsheetDrag = { sheet, onDown, onMove, onUp };
}

// Hält den Tastaturfokus innerhalb des Sheets (einfacher Trap für Tab/Shift+Tab).
function vsheetTrapFocus(e, sheet) {
  const focusables = sheet.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// Schließt das Sheet mit Ausfahr-Animation (oder sofort bei reduzierter Bewegung).
function closeVorgangSheet(instant) {
  const root = vsheetEl;
  if (!root) return;
  const sheet = root.querySelector(".vsheet");
  const finish = () => vsheetTeardown();
  if (instant || vsheetReduceMotion() || !sheet) { finish(); return; }
  sheet.classList.add("vsheet-anim");
  root.classList.remove("open");
  const H = window.innerHeight || 800;
  vsheetApplyY(sheet, H);
  let done = false;
  const onEnd = () => { if (done) return; done = true; finish(); };
  sheet.addEventListener("transitionend", onEnd, { once: true });
  window.setTimeout(onEnd, 360); // Fallback, falls transitionend ausbleibt
}

// Entfernt das Overlay vollständig und stellt Fokus/Scroll wieder her.
function vsheetTeardown() {
  const root = vsheetEl;
  if (!root) return;
  vsheetEl = null;
  if (vsheetKeyHandler) { document.removeEventListener("keydown", vsheetKeyHandler); vsheetKeyHandler = null; }
  if (vsheetGhostGuard) { vsheetGhostGuard(); vsheetGhostGuard = null; }
  const d = root._vsheetDrag;
  if (d && d.sheet) {
    d.sheet.removeEventListener("pointerdown", d.onDown);
    d.sheet.removeEventListener("pointermove", d.onMove);
    d.sheet.removeEventListener("pointerup", d.onUp);
    d.sheet.removeEventListener("pointercancel", d.onUp);
  }
  document.body.style.overflow = root.dataset.prevOverflow || "";
  if (root.parentNode) root.parentNode.removeChild(root);
  const back = vsheetLastFocus;
  vsheetLastFocus = null;
  if (back && typeof back.focus === "function" && document.contains(back)) {
    try { back.focus({ preventScroll: true }); } catch (_) { back.focus(); }
  }
}

function lageStarIcon() {
  return `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m10 2.5 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7L10 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
}

function renderVorgangDetailView() {
  const data = lageData();
  const list = (data && Array.isArray(data.vorgaenge)) ? data.vorgaenge : [];
  const v = list.find((x) => x.id === selectedVorgangId) || list[0];
  if (!v) { currentView = "briefing"; return renderLageView(); }

  const sources = Array.isArray(v.sources) ? v.sources : [];
  const docs = Array.isArray(v.documents) ? v.documents : [];
  const chrono = Array.isArray(v.chronologie) ? v.chronologie : [];
  const summary = v.summary || {};
  const summaryHtml = summary.text
    ? `<p>${escapeHtml(summary.text)}</p>`
    : [summary.wasIstPassiert, summary.warumWichtig, summary.werIstBetroffen].filter(Boolean).map((t) => `<p>${escapeHtml(t)}</p>`).join("");
  const meta = [
    v.standLabel ? `<span><b>Aktueller Stand:</b> ${escapeHtml(v.standLabel)}</span>` : "",
    v.nextStep ? `<span><b>Nächster Schritt:</b> ${escapeHtml(v.nextStep)}</span>` : "",
    v.updatedLabel ? `<span><b>Letzte Aktualisierung:</b> ${escapeHtml(v.updatedLabel)}</span>` : ""
  ].filter(Boolean).join("");

  return `
    <section class="vdetail">
      <button class="vdetail-back" type="button" data-view="briefing">← Zurück zur Lage</button>
      <div class="vdetail-grid">
        <div class="vdetail-main">
          <div class="vdetail-topline">
            <div>
              <span class="lage2-vtag">${escapeHtml(lageCardCategory(v))}</span>
              <h1 class="vdetail-title">${escapeHtml(v.title || "")} <span class="vdetail-star" aria-hidden="true">${lageStarIcon()}</span></h1>
            </div>
            <button class="vdetail-helmut" type="button" data-view="helmut">${lageStarIcon()} Im Briefing öffnen</button>
          </div>
          ${meta ? `<div class="vdetail-meta">${meta}</div>` : ""}

          <h2 class="vdetail-h2">Zusammenfassung</h2>
          <div class="vdetail-summary">${summaryHtml}</div>

          ${v.empfehlung ? `
          <h2 class="vdetail-h2">Empfehlung</h2>
          <div class="vdetail-summary"><p>${escapeHtml(v.empfehlung)}</p></div>` : ""}

          ${chrono.length ? `
          <h2 class="vdetail-h2">Chronologie</h2>
          <ul class="vdetail-chrono">
            ${chrono.map((c) => `<li><time>${escapeHtml([c.dateLabel, c.timeLabel].filter(Boolean).join(", "))}</time><p>${escapeHtml(c.text)}</p></li>`).join("")}
          </ul>` : ""}
        </div>

        <aside class="vdetail-side">
          <div class="vdetail-box">
            <h3>Quellen (${sources.length})</h3>
            <div class="vdetail-box-list">${sources.map(lageSourceRow).join("")}</div>
          </div>
          ${docs.length ? `
          <div class="vdetail-box">
            <h3>Dokumente</h3>
            <div class="vdetail-box-list">${docs.map(lageDocRow).join("")}</div>
          </div>` : ""}
        </aside>
      </div>
    </section>`;
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
      <a class="parliament-title" href="${escapeAttribute(isHttpUrl(item.url) ? item.url : "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
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
  const readyFormats = activeOfficeFormats().filter((f) => isValidDraft(officeDraftText(officeDrafts[officeDraftKey(top, f)])));
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
  // Refresh-/Abschluss-Zustand hat Vorrang und ist UNABHÄNGIG von helmutThinking
  // (der Intro-Denkanimation). So bleibt der Refresh-Screen beim Tabwechsel erhalten:
  // kommt der Nutzer während einer laufenden Aktualisierung zurück, sieht er wieder
  // "Aktualisierung läuft" bzw. "Stand ist aktuell" / "Aktueller Stand geladen".
  const refreshActive = pipelineRunning || Boolean(pipelinePhase);
  // V3-Stabschefstand: der Inhalt kommt AUSSCHLIESSLICH aus briefing.currentHelmutState
  // (deterministisch, serverseitig gebaut). Der Refresh-/Intro-Ring bleibt als reiner
  // TECHNISCHER Ladezustand erhalten; danach rendert der ruhige Stand. Die alte
  // Assessment-/Typing-Ansicht (mit berechneten Ersatztexten) wird nicht mehr genutzt.
  return (refreshActive || helmutThinking) ? renderHelmutThinkingView() : renderHelmutStandView();
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
  // Ruhiger, hochwertiger Refresh-Screen (eine Statuszeile + dezenter Fortschritt),
  // keine laute Checklisten-/Debug-Optik.
  if (pipelineRunning) {
    const stepLabel = PIPELINE_STEPS[pipelineRunStep] || PIPELINE_STEPS[PIPELINE_STEPS.length - 1];
    const pct = Math.round(((pipelineRunStep + 1) / PIPELINE_STEPS.length) * 100);
    return `
      <section class="helmut-refresh" aria-live="polite" aria-label="Helmut prüft den aktuellen Stand">
        <div class="helmut-refresh-core"><span class="helmut-refresh-ring" aria-hidden="true"></span><span class="helmut-refresh-mark" aria-hidden="true">H</span></div>
        <p class="helmut-refresh-title">Helmut prüft den aktuellen Stand</p>
        <p class="helmut-refresh-step">${escapeHtml(stepLabel)}</p>
        <div class="helmut-refresh-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="helmut-refresh-fill" style="width:${pct}%"></div></div>
      </section>
    `;
  }
  // Ehrlicher Abschluss: "done" = echter Lauf, "skipped" = Server hat den Lauf
  // uebersprungen (Throttle/Lock) -> KEIN "gecrawlt/analysiert" vortaeuschen.
  if (pipelinePhase === "skipped" || pipelinePhase === "done") {
    const done = pipelinePhase === "done";
    return `
      <section class="helmut-refresh helmut-refresh--done" aria-live="polite">
        <div class="helmut-refresh-core helmut-refresh-core--done" aria-hidden="true">${HELMUT_ICON_CHECK}</div>
        <p class="helmut-refresh-title">${done ? "Aktueller Stand geladen" : "Stand ist aktuell"}</p>
        <p class="helmut-refresh-sub">${done ? "Helmut hat die Lage für dein Mandat neu geprüft." : "Gerade erst aktualisiert – kein neuer Lauf nötig."}</p>
      </section>
    `;
  }
  // App-Start / ruhiger Ladezustand: hier werden nur VORHANDENE Daten geladen —
  // KEIN Crawl, KEINE KI-Analyse. Deshalb kein "analysiert"-Text und keine
  // Prozess-Checkliste mehr (das war der alte dunkle Such-/Denk-Screen, der ein
  // falsches Prozessversprechen machte). Optik an den Premium-Refresh angelehnt,
  // aber ruhiger: nur der Ring + eine ehrliche Statuszeile, kein Fortschrittsbalken.
  return `
    <section class="helmut-refresh helmut-refresh--intro" aria-live="polite" aria-label="Aktueller Stand wird geladen">
      <div class="helmut-refresh-core"><span class="helmut-refresh-ring" aria-hidden="true"></span><span class="helmut-refresh-mark" aria-hidden="true">H</span></div>
      <p class="helmut-refresh-title">Aktueller Stand wird geladen</p>
    </section>
  `;
}

// --- Helmut-Referent: Icons (inline SVG, currentColor -> Status-Tokens) ---------
const HELMUT_ICON_BOLT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`;
const HELMUT_ICON_EYE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const HELMUT_ICON_IGNORE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>`;
const HELMUT_ICON_STAR = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="m12 3 2.6 5.6 6 .6-4.5 4 1.3 6L12 16.9 6.6 19.2l1.3-6L3.4 9.2l6-.6z"/></svg>`;
const HELMUT_ICON_CLOCK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const HELMUT_ICON_SPARK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/></svg>`;
const HELMUT_ICON_X = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const HELMUT_ICON_DOC = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>`;
const HELMUT_ICON_CHECK = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>`;
const HELMUT_ICON_CHEVRON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
const HELMUT_ICON_LIST = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 4h6a1 1 0 0 1 1 1v0a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v0a1 1 0 0 1 1-1z"/><path d="M8 5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2"/><path d="M9 11h6M9 15h4"/></svg>`;
const HELMUT_ICON_CHAT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l.9-4.4A8 8 0 1 1 21 12z"/></svg>`;
// Zielbild-Icons: Glühbirne (Empfehlung), Warndreieck (Risiko), Trend-Chart (Chance).
const HELMUT_ICON_BULB = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.8 10.6c.5.4.8 1 .8 1.6v.3h6v-.3c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/></svg>`;
const HELMUT_ICON_WARN = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.2"/><path d="M12 17.4v.1"/></svg>`;
const HELMUT_ICON_TREND = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M16 7h5v5"/></svg>`;

// ─────────────────────────────────────────────────────────────────────────
// V3 — Helmut Stabschefstand (renderHelmutStandView)
// Rendert AUSSCHLIESSLICH aus briefing.currentHelmutState. Keine berechneten
// Ersatztexte, keine politischen Fallbacks, keine hartkodierte Partei, keine
// Kostenwerte, keine Client-KI. Das Frontend formatiert/zeigt nur — es leitet
// keine politische Bedeutung neu ab. Fehlt ein Wert -> leer / neutraler Zustand.
// ─────────────────────────────────────────────────────────────────────────

// Reine Label-Zuordnungen (i18n der Enum-Tokens des V3-Motors — KEIN Inhalt).
const HSTAND_URGENCY_LABEL = { hoch: "Hohe Dringlichkeit", mittel: "Mittlere Dringlichkeit", niedrig: "Niedrige Dringlichkeit", keiner: "Keine akute Dringlichkeit" };
const HSTAND_LEVEL_LABEL = { low: "Niedrig", medium: "Mittel", high: "Hoch" };
// EINE zentrale, nachvollziehbare Anzeige-Zuordnung für die technischen
// Kommunikations-Enum-Tokens des V3-Motors (Kanal, Format, suggestedOutputs).
// Reine Präsentationslogik — KEINE politische Frontend-Logik, kein Inhalt: der
// Motor liefert die Tokens, hier bekommen sie nur einen verständlichen Namen,
// damit nie ein Rohwert wie „internalLine" oder „monitoringNote" sichtbar wird.
const HSTAND_COMM_LABEL = {
  // Kanäle
  press: "Presse", social: "Social Media", internal: "Intern", parliamentary: "Parlamentarisch",
  // Formate / mögliche Outputs
  statement: "Statement", pressRelease: "Pressemitteilung", qa: "Q&A", socialPost: "Social Post",
  internalLine: "Interne Linie", talkingPoints: "Talking Points", briefing: "Briefing",
  monitoringNote: "Monitoring-Notiz", speech: "Rede", interview: "Interview", newsletter: "Newsletter",
  // ehrliche Leerwerte -> nicht anzeigen
  none: "", unknown: ""
};

// Fallback für unbekannte camelCase-/snake_case-Tokens: nie einen Rohwert zeigen,
// sondern lesbar aufbrechen (z. B. „monitoringNote" -> „Monitoring Note"). Rein
// typografisch, erfindet keinen Inhalt.
function hstandHumanizeToken(tok) {
  const s = hstandText(tok);
  if (!s) return "";
  return s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
}

// Anzeigename für ein Kommunikations-Token: erst zentrale Map, dann Humanize-Fallback.
function hstandCommLabel(token) {
  const key = String(token || "");
  if (Object.prototype.hasOwnProperty.call(HSTAND_COMM_LABEL, key)) return HSTAND_COMM_LABEL[key];
  return hstandHumanizeToken(key);
}
const HSTAND_PRIORITY_LABEL = { low: "Niedrig", medium: "Mittel", high: "Hoch" };
const HSTAND_STATUS_LABEL = {
  fresh: { label: "Aktuell", tone: "ok" },
  stale: { label: "Nicht aktuell", tone: "warn" },
  updating: { label: "Wird aktualisiert", tone: "muted" },
  empty: { label: "Kein aktueller Stand", tone: "muted" },
  error: { label: "Stand nicht verfügbar", tone: "danger" }
};
const HSTAND_TYPE_LABEL = { daily: "Tagesbriefing", morning: "Morgenbriefing", midday: "Mittagsbriefing", evening: "Abendlage" };
// qualityStatus ist ehrlich eine VOLLSTÄNDIGKEITS-/FRISCHE-Angabe (alle vier
// Stabschef-Dimensionen befüllt und aktuell), KEINE Quellen-Belastbarkeit. Darum
// „Vollständig" statt „Belastbar" — das wäre inhaltlich zu stark (es sagt nichts
// über die Belastbarkeit der Quellen aus, nur über die Feld-Vollständigkeit).
const HSTAND_QUALITY = {
  valid: { tone: "ok", label: "Vollständig" },
  partial: { tone: "warn", label: "Teilweise" },
  stale: { tone: "warn", label: "Veraltet" },
  empty: { tone: "muted", label: "Offen" },
  error: { tone: "danger", label: "Fehler" }
};

function hstandText(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}

// Zerlegt eine Empfehlung in einzelne Entscheidungssätze (Satzende + Großbuchstabe/
// Ziffer als neuer Anfang). REIN typografisch — kein Wort wird verändert oder neu
// erfunden. Ein einzelner (auch langer) Satz bleibt ein Element.
function hstandSentences(text, cap = 4) {
  const s = hstandText(text);
  if (!s) return [];
  const parts = s.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/).map((p) => p.trim()).filter(Boolean);
  return parts.slice(0, cap);
}

// Echter Zeitstempel -> ruhiges Datum/Uhrzeit (de-DE). Fehlt/ungueltig -> "" (keine Fake-Zeit).
function hstandWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch { return ""; }
}

function hstandContextChips(list, limit = 4) {
  const chips = (Array.isArray(list) ? list : []).map(hstandText).filter(Boolean);
  if (!chips.length) return "";
  return chips.slice(0, limit).map((c) => `<span class="hstand-chip hstand-chip--ctx">${escapeHtml(c)}</span>`).join("");
}

// Dringlichkeits-Chip — unbekannt/leer -> nichts (kein Ersatz, nicht dramatisieren).
function hstandUrgencyChip(urgency) {
  const u = String(urgency || "").toLowerCase();
  const label = HSTAND_URGENCY_LABEL[u];
  if (!label) return "";
  const tone = u === "hoch" ? "danger" : u === "mittel" ? "warn" : "muted";
  return `<span class="hstand-chip hstand-chip--${tone}"><span class="hstand-dot"></span>${escapeHtml(label)}</span>`;
}

// Risiko-/Chancenstufe — ruhig. unknown/leer -> weglassen (nicht dramatisieren).
function hstandLevelChip(level, kind) {
  const l = String(level || "").toLowerCase();
  const label = HSTAND_LEVEL_LABEL[l];
  if (!label) return "";
  let tone = "muted";
  if (l === "high") tone = kind === "chance" ? "chance" : "risk";
  else if (l === "medium") tone = "warn";
  const prefix = kind === "chance" ? "Chance" : "Risiko";
  return `<span class="hstand-level hstand-level--${tone}" title="${escapeAttribute(`${prefix}: ${label}`)}"><span class="hstand-dot"></span>${escapeHtml(label)}</span>`;
}

function hstandPriorityChip(p) {
  const v = String(p || "").toLowerCase();
  const label = HSTAND_PRIORITY_LABEL[v];
  if (!label) return ""; // unknown/leer -> nichts
  const tone = v === "high" ? "risk" : v === "medium" ? "warn" : "muted";
  return `<span class="hstand-prio hstand-prio--${tone}">${escapeHtml(label)}</span>`;
}

function hstandQuality(q) {
  const m = HSTAND_QUALITY[String(q || "").toLowerCase()] || HSTAND_QUALITY.empty;
  return `<span class="hstand-q"><span class="hstand-qdot hstand-qdot--${m.tone}"></span>${escapeHtml(m.label)}</span>`;
}

// Sektions-Überschrift: farbiges Icon-Badge + farbiges Label (Zielbild-Look).
// tone ∈ accent | risk | chance | comms | actions | muted -> färbt Badge + Label.
function hstandKicker(icon, label, tone) {
  const cls = tone ? ` hstand-kicker--${tone}` : "";
  return `<span class="hstand-kicker${cls}"><span class="hstand-kico">${icon}</span><span>${escapeHtml(label)}</span></span>`;
}

// --- Entry: der Stand oder ein ehrlicher Zustand ---------------------------
function renderHelmutStandView() {
  const state = briefing && briefing.currentHelmutState;
  if (!state || typeof state !== "object") return renderHstandUnavailable();
  if (state.status === "error" || state.errorState) return renderHstandStateCard(state, "error");
  if (state.status === "empty" || !state.primaryItem) return renderHstandStateCard(state, "empty");
  return `
    <section class="hstand" aria-label="Briefing – aktueller Stabschefstand">
      ${renderHstandHeader(state)}
      ${renderHstandProposal(state)}
      ${renderHstandWhy(state)}
      ${renderHstandRiskChance(state)}
      ${renderHstandComms(state)}
      ${renderHstandActions(state)}
      ${renderHstandPrimary(state)}
      ${renderHstandItems(state)}
      ${renderHstandSources(state)}
    </section>`;
}

function renderHstandHeader(state) {
  const st = HSTAND_STATUS_LABEL[state.status] || HSTAND_STATUS_LABEL.empty;
  const when = hstandWhen(state.sourcesSummary && state.sourcesSummary.lastUpdated) || hstandWhen(state.generatedAt);
  // Bei STALE (angezeigter Datenstand nicht von heute) darf NICHT der aktuelle Slot-Name
  // (z. B. „Mittagsbriefing") mit einem alten Datum vermischt werden — das wirkt falsch.
  // Dann ehrlich „Letzter Stand · <Datum>" zeigen. Nur bei frischem Stand den Slot-Namen.
  const isStale = state.status === "stale" || state.staleState === true;
  const type = isStale
    ? "Letzter Stand"
    : (HSTAND_TYPE_LABEL[String(state.briefingType || "").toLowerCase()] || "Briefing");
  const partial = state.qualityStatus === "partial";
  return `
    <header class="hstand-head">
      <div class="hstand-head-row">
        <div class="hstand-head-titles">
          <h1 class="hstand-title">Helmut</h1>
          <p class="hstand-subtitle">Dein politischer Stabschef</p>
        </div>
        <span class="hstand-status hstand-status--${st.tone}">${escapeHtml(st.label)}</span>
      </div>
      <p class="hstand-meta-line">${HELMUT_ICON_CLOCK}<span>${escapeHtml(type)}${when ? ` · ${escapeHtml(when)}` : ""}</span></p>
      ${partial ? `<p class="hstand-partial">${HELMUT_ICON_EYE}<span>Nur teilweise vollständig – einige Angaben fehlen noch.</span></p>` : ""}
    </header>`;
}

// Wichtigster Bereich: Mein Vorschlag (recommendation + urgency + contextChips).
function renderHstandProposal(state) {
  const rec = hstandText(state.recommendation);
  const urgency = hstandUrgencyChip(state.urgency);
  // Ruhiger Kopfbereich: höchstens 3 Chips (Priorität: Dringlichkeit, dann die
  // wichtigsten Kontext-Labels). Weitere Chips erscheinen weiter unten am Vorgang.
  const chips = hstandContextChips(state.contextChips, urgency ? 2 : 3);
  const chiprow = (urgency || chips) ? `<div class="hstand-chiprow">${urgency}${chips}</div>` : "";
  // Mehrere Entscheidungssätze -> mehrere kurze Zeilen (klare Entscheidungsvorlage).
  // Ein einzelner Satz bleibt eine Zeile — kein Inhalt wird umgeschrieben.
  const sentences = hstandSentences(rec);
  const recBlock = !rec
    ? `<p class="hstand-empty-line">Für diesen Stand liegt aktuell keine Empfehlung vor.</p>`
    : (sentences.length > 1
        ? `<ul class="hstand-proposal-text hstand-proposal-lines">${sentences.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
        : `<p class="hstand-proposal-text">${escapeHtml(rec)}</p>`);
  return `
    <section class="hstand-card hstand-proposal" aria-label="Mein Vorschlag">
      ${hstandKicker(HELMUT_ICON_BULB, "Mein Vorschlag", "accent")}
      ${recBlock}
      ${chiprow}
    </section>`;
}

function renderHstandWhy(state) {
  const why = hstandText(state.whyItMatters);
  if (!why) return "";
  return `
    <section class="hstand-card hstand-why" aria-label="Warum ist das wichtig">
      ${hstandKicker(HELMUT_ICON_EYE, "Warum ist das wichtig?", "accent")}
      <p class="hstand-body">${escapeHtml(why)}</p>
    </section>`;
}

function renderHstandRiskChance(state) {
  const risk = hstandText(state.riskOfNoAction);
  const riskLevel = hstandLevelChip(state.riskLevel, "risk");
  const chance = hstandText(state.opportunitySummary);
  const chanceLevel = hstandLevelChip(state.opportunityLevel, "chance");
  const riskCard = (risk || riskLevel) ? `
    <section class="hstand-card hstand-split hstand-risk" aria-label="Risiko bei Nichtreaktion">
      ${hstandKicker(HELMUT_ICON_WARN, "Risiko bei Nichtreaktion", "risk")}
      ${risk ? `<p class="hstand-body hstand-body--tight">${escapeHtml(risk)}</p>` : ""}
      ${riskLevel}
    </section>` : "";
  const chanceCard = (chance || chanceLevel) ? `
    <section class="hstand-card hstand-split hstand-chance" aria-label="Chance">
      ${hstandKicker(HELMUT_ICON_TREND, "Chance", "chance")}
      ${chance ? `<p class="hstand-body hstand-body--tight">${escapeHtml(chance)}</p>` : ""}
      ${chanceLevel}
    </section>` : "";
  if (!riskCard && !chanceCard) return "";
  return `<div class="hstand-duo">${riskCard}${chanceCard}</div>`;
}

function renderHstandComms(state) {
  const c = (state.recommendedCommunication && typeof state.recommendedCommunication === "object") ? state.recommendedCommunication : {};
  const line = hstandText(c.communicationLine);
  // Enum-Tokens -> verständliche Anzeigenamen über die EINE zentrale Map (kein
  // technischer Rohwert wie „internalLine"/„monitoringNote" wird je sichtbar).
  const channel = hstandCommLabel(c.recommendedChannel);
  const format = hstandCommLabel(c.recommendedFormat);
  const outputs = (Array.isArray(c.suggestedOutputs) ? c.suggestedOutputs : []).map(hstandText).filter(Boolean);
  if (!line && !channel && !format && !outputs.length) return ""; // zurueckhaltend ausblenden
  // Klare empfohlene Linie: hervorgehobene "Empfohlen: <Format> · <Kanal>"-Zeile.
  const recParts = [];
  if (format) recParts.push(format);
  if (channel) recParts.push(channel);
  const recLine = recParts.length
    ? `<p class="hstand-comms-rec"><span class="hstand-comms-rec-k">Empfohlen</span><span class="hstand-comms-rec-v">${escapeHtml(recParts.join(" · "))}</span></p>`
    : "";
  const chips = outputs.slice(0, 5).map((o) => {
    const lbl = hstandCommLabel(o) || hstandText(o);
    return `<span class="hstand-chip hstand-chip--out">${escapeHtml(lbl)}</span>`;
  }).join("");
  return `
    <section class="hstand-card hstand-comms" aria-label="Empfohlene Kommunikation">
      ${hstandKicker(HELMUT_ICON_CHAT, "Empfohlene Kommunikation", "comms")}
      ${line ? `<p class="hstand-body">${escapeHtml(line)}</p>` : ""}
      ${recLine}
      ${chips ? `<div class="hstand-comms-formats"><span class="hstand-comms-formats-label">Formate</span><div class="hstand-chiprow hstand-chiprow--sm">${chips}</div></div>` : ""}
    </section>`;
}

function renderHstandActions(state) {
  const items = (Array.isArray(state.actionItems) ? state.actionItems : []).filter((a) => a && hstandText(a.title));
  if (!items.length) return "";
  // Übersicht: höchstens DREI klare Aufgaben. Nummer + Handlung + Frist/Priorität
  // dezent. Lange Beschreibungen werden NICHT gelöscht, sondern per Aufklappen
  // sekundär zugänglich gemacht (bleiben vollständig in der Datenstruktur).
  const rows = items.slice(0, 3).map((a, i) => {
    const desc = hstandText(a.description);
    const due = hstandText(a.dueHint);
    const prio = hstandPriorityChip(a.priority);
    const metaRow = (due || prio) ? `<div class="hstand-step-meta">${due ? `<span class="hstand-step-due">${HELMUT_ICON_CLOCK}${escapeHtml(due)}</span>` : ""}${prio}</div>` : "";
    const detail = desc
      ? `<details class="hstand-step-more"><summary>Details</summary><p class="hstand-step-desc">${escapeHtml(desc)}</p></details>`
      : "";
    return `
      <li class="hstand-step">
        <span class="hstand-step-num">${i + 1}</span>
        <div class="hstand-step-body">
          <p class="hstand-step-title">${escapeHtml(hstandText(a.title))}</p>
          ${metaRow}
          ${detail}
        </div>
      </li>`;
  }).join("");
  return `
    <section class="hstand-card hstand-actions" aria-label="Was du jetzt tun solltest">
      ${hstandKicker(HELMUT_ICON_LIST, "Was du jetzt tun solltest", "actions")}
      <ol class="hstand-steps">${rows}</ol>
    </section>`;
}

function renderHstandPrimary(state) {
  const p = state.primaryItem;
  if (!p || typeof p !== "object") return "";
  const title = hstandText(p.displayTitle) || hstandText(p.title);
  if (!title) return "";
  const urgency = hstandUrgencyChip(p.urgency);
  // Beleg-Karte, kein Hauptscreen: nur die 2–3 wichtigsten Kontext-Chips.
  const chips = hstandContextChips(p.contextChips, 3);
  const count = Number(p.sourceCount);
  const when = hstandWhen(p.lastUpdated);
  return `
    <section class="hstand-card hstand-primary" aria-label="Aktueller Vorgang">
      ${hstandKicker(HELMUT_ICON_DOC, "Aktueller Vorgang", "accent")}
      <h3 class="hstand-primary-title">${escapeHtml(title)}</h3>
      ${(urgency || chips) ? `<div class="hstand-chiprow">${urgency}${chips}</div>` : ""}
      <dl class="hstand-metrics">
        <div class="hstand-metric"><dt>Quellen</dt><dd>${Number.isFinite(count) && count > 0 ? count : "—"}</dd></div>
        <div class="hstand-metric"><dt><span class="hstand-mk-full">Letzte Aktualisierung</span><span class="hstand-mk-short">Stand</span></dt><dd>${when ? escapeHtml(when) : "—"}</dd></div>
        <div class="hstand-metric"><dt>Qualität</dt><dd>${hstandQuality(p.qualityStatus)}</dd></div>
      </dl>
    </section>`;
}

function renderHstandItems(state) {
  const items = (Array.isArray(state.items) ? state.items : []).filter((i) => i && (hstandText(i.displayTitle) || hstandText(i.title)));
  if (!items.length) return "";
  // Kompakte Liste: Titel + EIN kurzer Relevanzsatz + Dringlichkeit. Bewusst KEINE
  // Chipwolke und keine langen Sammeltexte (Beleg, nicht Hauptscreen).
  const rows = items.slice(0, 3).map((i) => {
    const title = hstandText(i.displayTitle) || hstandText(i.title);
    const why = hstandText(i.whyRelevant);
    const urgency = hstandUrgencyChip(i.urgency);
    return `
      <li class="hstand-rel">
        <div class="hstand-rel-head">
          <p class="hstand-rel-title">${escapeHtml(title)}</p>
          ${urgency}
        </div>
        ${why ? `<p class="hstand-rel-why">${escapeHtml(why)}</p>` : ""}
      </li>`;
  }).join("");
  return `
    <section class="hstand-card hstand-related" aria-label="Weitere relevante Vorgänge">
      ${hstandKicker(HELMUT_ICON_EYE, "Weitere relevante Vorgänge", "muted")}
      <ul class="hstand-rels">${rows}</ul>
    </section>`;
}

function renderHstandSources(state) {
  const s = (state.sourcesSummary && typeof state.sourcesSummary === "object") ? state.sourcesSummary : {};
  const count = Number(s.sourceCount);
  const when = hstandWhen(s.lastUpdated);
  const countLabel = Number.isFinite(count) && count > 0 ? `${count} ${count === 1 ? "Quelle" : "Quellen"}` : "Keine Quellen";
  return `
    <footer class="hstand-foot" aria-label="Quellen und Qualität">
      <span class="hstand-foot-cell">${escapeHtml(countLabel)}</span>
      ${when ? `<span class="hstand-foot-cell">Stand: ${escapeHtml(when)}</span>` : ""}
      <span class="hstand-foot-cell">${hstandQuality(s.qualityStatus)}</span>
    </footer>`;
}

// Neutraler technischer Zustand (kein politischer Ersatzinhalt).
function renderHstandUnavailable() {
  return `
    <section class="hstand hstand--state" aria-label="Briefing">
      <div class="hstand-state-card">
        <span class="hstand-state-mark" aria-hidden="true">H</span>
        <p class="hstand-state-title">Kein aktueller Stand verfügbar</p>
        <p class="hstand-state-sub">Sobald belastbare Vorgänge für dein Mandat vorliegen, erscheint hier dein Stabschefstand.</p>
      </div>
    </section>`;
}

// STOERUNGSWAHRHEIT (Audit-Fix 2026-07): technische Ausfälle, Budget-Stopp und
// Datenlücken dürfen NIE wie ein ruhiger Tag aussehen. Mappt den expliziten
// Leer-Grund des Briefing-Vertrags (briefing.reason) auf einen ehrlichen Zustand.
// "keine-treffer" bleibt bewusst unbehandelt — das IST der echte ruhige Tag.
function briefingDisruption() {
  if (!briefing || briefing.available !== false) return null;
  const reason = String(briefing.reason || "");
  if (reason === "store-error" || reason === "v3-store-disabled" || reason === "build-timeout") {
    return {
      kind: "stoerung", error: true,
      title: "Daten derzeit nicht verfügbar",
      sub: "Technische Störung beim Laden der Datenbasis — das ist kein ruhiger Tag. Bitte in einigen Minuten erneut öffnen."
    };
  }
  if (reason === "budget") {
    return {
      kind: "budget", error: false,
      title: "KI-Tageskontingent erreicht",
      sub: "Neue Auswertungen pausieren bis morgen früh. Bereits ausgewertete Vorgänge bleiben gültig."
    };
  }
  if (reason === "keine-vorgaenge") {
    return {
      kind: "datenluecke", error: true,
      title: "Keine ausgewerteten Vorgänge verfügbar",
      sub: "Die Datenbasis liefert gerade keine analysierten Vorgänge — vermutlich eine Datenlücke, kein ruhiger Nachrichtentag."
    };
  }
  return null;
}

function renderHstandStateCard(state, kind) {
  let isError = kind === "error";
  // Sprint 5 (additiv): unterscheidbarer Helmut-Leerzustand (gap/stale/quiet). Nur im
  // Nicht-Fehler-Fall; ohne emptyState (Flag aus) unveraendertes Alt-Verhalten.
  const es = !isError && state && state.emptyState && state.emptyState.kind ? state.emptyState : null;
  // Stoerungswahrheit: expliziter Ausfall-Grund schlaegt den generischen Leertext.
  const disruption = !isError && !es ? briefingDisruption() : null;
  if (disruption && disruption.error) isError = true;
  const title = disruption ? disruption.title
    : isError ? "Stand konnte nicht geladen werden"
    : (es && es.headline ? es.headline : "Heute kein Handlungsbedarf");
  const sub = disruption ? disruption.sub
    : isError
      ? "Die Auswertung ist derzeit nicht belastbar. Bitte später erneut prüfen."
      : (es && es.detail ? es.detail : "Für dein Mandat liegen derzeit keine belastbaren Vorgänge vor.");
  const emptyKind = disruption ? disruption.kind : (es ? es.kind : "");
  return `
    <section class="hstand hstand--state" aria-label="Briefing">
      ${renderHstandHeader(state)}
      <div class="hstand-state-card${isError ? " hstand-state-card--error" : ""}"${emptyKind ? ` data-empty-kind="${escapeAttribute(emptyKind)}"` : ""}>
        <span class="hstand-state-mark" aria-hidden="true">${isError ? "!" : "H"}</span>
        <p class="hstand-state-title">${escapeHtml(title)}</p>
        <p class="hstand-state-sub">${escapeHtml(sub)}</p>
      </div>
    </section>`;
}

const HELMUT_BUCKET_LABEL = { handeln: "Handeln", beobachten: "Beobachten", ignorieren: "Ignorieren" };

// Priorität -> die drei Referent-Kategorien der Zielvision.
function helmutStatusBucket(priorityType) {
  if (priorityType === "ignore") return "ignorieren";
  if (priorityType === "watch" || priorityType === "chance") return "beobachten";
  return "handeln"; // risk, action
}

function helmutDeckWhy(card) {
  return polishReferentText(card.whyItMatters || card.personalRelevanceExplanation || "") || "";
}

function helmutDeckRisk(card) {
  return polishReferentText(card.risk || card.inaction || card.consequenceIfIgnored || "") || "";
}

function helmutDeckTime(card) {
  const raw = String(card.estimatedTime || "").replace(/\s*Min\.?$/i, "").trim();
  if (!raw || /undefined|null|NaN/i.test(raw)) return "";
  return `Ca. ${raw} Minuten`;
}

// Vertrauensscore in Prozent, nur wenn belastbare Daten vorliegen (sonst null).
function helmutConfidencePercent(card) {
  const raw = Number(card.finalScore ?? card.totalScore ?? card.relevanceScore);
  if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.min(100, Math.round(raw)));
  const word = String(card.confidence || "").toLowerCase();
  if (word === "high" || word === "hoch") return 85;
  if (word === "medium" || word === "mittel") return 65;
  if (word === "low" || word === "niedrig") return 45;
  return null;
}

function helmutNowHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// Kopf: State A (Morgen, noch keine Entscheidung) vs. State C (Referent-Bestätigung).
function renderHelmutHeader() {
  const firstName = (profile?.fullName || "").split(" ")[0] || "";
  const total = helmutBriefings.length;
  const deckN = helmutDeck.length;
  if (helmutDecisionsMade > 0) {
    const remaining = Math.max(0, deckN - helmutDecisionsMade);
    const madeText = helmutDecisionsMade === 1 ? "1 Entscheidung getroffen" : `${helmutDecisionsMade} Entscheidungen getroffen`;
    const remainText = remaining === 0
      ? "Für heute bist du durch — um den Rest kümmere ich mich."
      : remaining === 1 ? "Noch 1 wichtiges Thema für heute."
        : `Noch ${remaining} wichtige Themen für heute.`;
    const stark = `Stark, ${firstName}`;
    return `
      <header class="helmut-referent-head">
        <h1 class="${headlineClass(stark)}">Stark, ${escapeHtml(firstName)}! 💪</h1>
        <p>Du hast ${escapeHtml(madeText)}. ${escapeHtml(remainText)}</p>
      </header>`;
  }
  const greeting = timeGreeting(firstName); // enthält bereits den Punkt, z. B. "Guten Morgen, Cem."
  // Einleitung an die TATSÄCHLICHEN Zahlen koppeln (keine falsche Dringlichkeit):
  // nur bei echten Handeln-Vorgängen "kümmern"; sonst "beobachten, aktives Handeln nicht nötig".
  const introCounts = { handeln: 0, beobachten: 0, ignorieren: 0 };
  helmutBriefings.forEach((d) => { introCounts[helmutStatusBucket(d.priorityType || "watch")] += 1; });
  const actN = introCounts.handeln;
  const watchN = introCounts.beobachten;
  // Ehrlich: keine "heute"-Behauptung über potenziell ältere Vorgänge.
  const totalLine = `Es ${total === 1 ? "liegt" : "liegen"} ${total} ${total === 1 ? "relevanter Vorgang" : "relevante Vorgänge"} vor.`;
  let actionLine;
  if (actN > 0) {
    actionLine = `Davon solltest du dich heute um ${actN} ${actN === 1 ? "Vorgang" : "Vorgänge"} kümmern${watchN ? ` und ${watchN} beobachten` : ""}.`;
  } else if (watchN > 0) {
    actionLine = `${watchN} ${watchN === 1 ? "Vorgang" : "Vorgänge"} solltest du heute beobachten. Aktives Handeln ist nicht nötig.`;
  } else {
    actionLine = "Aktives Handeln ist heute nicht nötig.";
  }
  return `
    <header class="helmut-referent-head">
      <h1 class="${headlineClass(greeting)}">${escapeHtml(greeting)}</h1>
      <p>${escapeHtml(totalLine)}<br>${escapeHtml(actionLine)}</p>
    </header>`;
}

// Drei Status-Cards. Zahlen aus den TATSÄCHLICH ausgelieferten Briefings (nicht aus
// decisionMetrics), damit Kopfzahl X = Summe der Cards = sichtbare Liste bleibt.
function renderHelmutStatusCards() {
  if (!helmutBriefings.length) return "";
  const counts = { handeln: 0, beobachten: 0, ignorieren: 0 };
  helmutBriefings.forEach((d) => { counts[helmutStatusBucket(d.priorityType || "watch")] += 1; });
  const cards = [
    { key: "handeln", label: "Handeln", icon: HELMUT_ICON_BOLT, n: counts.handeln },
    { key: "beobachten", label: "Beobachten", icon: HELMUT_ICON_EYE, n: counts.beobachten },
    { key: "ignorieren", label: "Ignorieren", icon: HELMUT_ICON_IGNORE, n: counts.ignorieren }
  ];
  return `
    <div class="helmut-status-cards" role="list" aria-label="So habe ich deine Themen sortiert">
      ${cards.map((c) => {
        // Handeln/Beobachten springen zum ersten passenden Thema. Ignorieren ist
        // reine Statistik und bleibt nicht interaktiv.
        const jumpable = c.key !== "ignorieren" && c.n > 0;
        const inner = `
          <div class="helmut-status-top">
            <span class="helmut-status-num">${c.n}</span>
            <span class="helmut-status-icon" aria-hidden="true">${c.icon}</span>
          </div>
          <span class="helmut-status-label">${c.label}</span>`;
        return jumpable
          ? `<button type="button" class="helmut-status-card ${c.key} is-jumpable" role="listitem" data-helmut-jump="${c.key}" aria-label="Zu ${c.label} springen">${inner}</button>`
          : `<div class="helmut-status-card ${c.key}" role="listitem">${inner}</div>`;
      }).join("")}
    </div>`;
}

// State C: „Deine letzte Entscheidung" mit ruhiger Success-Bestätigung.
function renderLastDecisionCard() {
  if (!helmutLastDecision) return "";
  return `
    <section class="helmut-last-wrap" aria-label="Deine letzte Entscheidung">
      <div class="helmut-section-head"><h2>Deine letzte Entscheidung</h2></div>
      <div class="helmut-last-decision">
        <span class="helmut-last-check" aria-hidden="true">${HELMUT_ICON_CHECK}</span>
        <span class="helmut-last-title">${escapeHtml(helmutLastDecision.title || "")}</span>
        <span class="helmut-last-meta">Entscheidung: <b>${escapeHtml(helmutLastDecision.actionLabel || "")}</b></span>
        <span class="helmut-last-time">${escapeHtml(helmutLastDecision.time || "")} Uhr</span>
      </div>
    </section>`;
}

// Deck-Sektion: kuratierte Top-N (helmutDeck). Titel wechselt in State C.
function renderHelmutDeckSection() {
  if (!helmutDeck.length) {
    return `
      <section class="helmut-deck-section" aria-label="Deine wichtigsten Entscheidungen">
        <p class="helmut-deck-empty">Heute ist wenig Dringendes dabei — ich melde mich, sobald sich etwas bewegt.</p>
      </section>`;
  }
  const remaining = Math.max(0, helmutDeck.length - helmutDecisionsMade);
  const title = helmutDecisionsMade > 0 ? "Nächstes wichtiges Thema" : "Deine wichtigsten Entscheidungen";
  return `
    <section class="helmut-deck-section" aria-label="Deine wichtigsten Entscheidungen">
      <div class="helmut-section-head">
        <h2>${title}</h2>
        ${remaining ? `<span class="helmut-section-count">${remaining}</span>` : ""}
      </div>
      ${renderHelmutBriefingList()}
    </section>`;
}

// Drei große runde Action-Buttons. Entscheidung NUR hierüber (nie per Swipe).
function renderDeckActions(card) {
  const id = escapeAttribute(card.id);
  return `
    <div class="helmut-deck-actions" role="group" aria-label="Entscheidung treffen">
      <button class="helmut-action-btn ignore" type="button" data-deck-decide="${id}" data-deck-action="ignore">
        <span class="helmut-action-ico" aria-hidden="true">${HELMUT_ICON_X}</span>
        <span class="helmut-action-label">Ignorieren</span>
      </button>
      <button class="helmut-action-btn draft" type="button" data-deck-decide="${id}" data-deck-action="draft">
        <span class="helmut-action-ico" aria-hidden="true">${HELMUT_ICON_DOC}</span>
        <span class="helmut-action-label">Entwurf<br>erstellen</span>
      </button>
      <button class="helmut-action-btn watch" type="button" data-deck-decide="${id}" data-deck-action="watch">
        <span class="helmut-action-ico" aria-hidden="true">${HELMUT_ICON_EYE}</span>
        <span class="helmut-action-label">Beobachten</span>
      </button>
    </div>`;
}

// Weitere Briefings: ALLE übrigen (helmutBriefings ohne Deck) als kompakte Zeilen.
// Jede Zeile öffnet via data-detail die volle Empfehlung (Quelle/Zeit/Öffnen).
// Ruhiger Premium-Highlight: dezenter Ring + Glow + sanfte Aufhellung, danach
// automatisch zurück. Kein Blinken. Rein über CSS-Animation (transform/box-shadow).
function helmutScrollHighlight(el) {
  if (!el) return;
  try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { el.scrollIntoView(); }
  el.classList.remove("helmut-highlight");
  void el.offsetWidth; // Reflow erzwingen -> Animation startet neu
  el.classList.add("helmut-highlight");
  window.setTimeout(() => el.classList.remove("helmut-highlight"), 2100);
}

// Springt zum ersten Element des Buckets: bevorzugt die Deck-Karte (Karussell auf
// den Index setzen), sonst die passende Zeile in „Weitere Briefings".
function helmutJumpToBucket(bucket) {
  const deckIdx = helmutDeck.findIndex((d) => helmutStatusBucket(d.priorityType || "watch") === bucket);
  if (deckIdx >= 0) {
    helmutCarouselIndex = deckIdx;
    patchCarousel(); // bindet den Teilbaum selbst — kein globales Re-Bind
    window.requestAnimationFrame(() => {
      const wrap = app.querySelector("#helmutCarousel");
      helmutScrollHighlight((wrap && wrap.querySelector(".helmut-deck-card")) || wrap);
    });
    return;
  }
  const deckIds = new Set(helmutDeck.map((d) => d.id));
  const rest = helmutBriefings.filter((d) => !deckIds.has(d.id));
  const restIdx = rest.findIndex((d) => helmutStatusBucket(d.priorityType || "watch") === bucket);
  if (restIdx < 0) return;
  const rows = app.querySelectorAll(".helmut-list .helmut-list-row");
  const row = rows[restIdx];
  if (row) helmutScrollHighlight(row);
}

function renderFurtherBriefings() {
  const deckIds = new Set(helmutDeck.map((d) => d.id));
  const rest = helmutBriefings.filter((d) => !deckIds.has(d.id));
  if (!rest.length) return "";
  return `
    <section class="helmut-further" aria-label="Weitere Briefings">
      <div class="helmut-section-head">
        <h2>Weitere Briefings</h2>
        <span class="helmut-section-count">${rest.length}</span>
      </div>
      <p class="helmut-further-lead">Den Rest habe ich für dich eingeordnet — falls du reinschauen willst.</p>
      <ul class="helmut-list">
        ${rest.map((d) => renderFurtherRow(d)).join("")}
      </ul>
    </section>`;
}

function renderFurtherRow(d) {
  const bucket = helmutStatusBucket(d.priorityType || "watch");
  // Nur eine sehr kurze Empfehlung — schnell scannbar, keine Textwand. Warum/Risiko/
  // Quellen erscheinen erst im Detail (data-detail).
  const short = compactText(polishReferentText(d.action) || d.summary || helmutDeckWhy(d) || "", 58);
  const time = helmutDeckTime(d);
  const srcN = Number(d.sourceCount || (Array.isArray(d.sources) ? d.sources.length : 0)) || 0;
  const srcHint = srcN >= 2 ? `${srcN} Quellen` : srcN === 1 ? "Quelle anzeigen" : "";
  return `
    <li>
      <button class="helmut-list-row ${escapeAttribute(bucket)}" type="button" data-detail="${escapeAttribute(d.id)}">
        <span class="helmut-list-main">
          <span class="helmut-list-badge ${escapeAttribute(bucket)}">${escapeHtml(HELMUT_BUCKET_LABEL[bucket])}</span>
          <span class="helmut-list-title">${escapeHtml(d.title || "Thema")}</span>
          ${short ? `<span class="helmut-list-desc">${escapeHtml(short)}</span>` : ""}
        </span>
        <span class="helmut-list-side">
          ${time ? `<span class="helmut-list-time">${escapeHtml(time)}</span>` : ""}
          ${srcHint ? `<span class="helmut-list-src">${escapeHtml(srcHint)}</span>` : ""}
        </span>
        <span class="helmut-list-chevron" aria-hidden="true">${HELMUT_ICON_CHEVRON}</span>
      </button>
    </li>`;
}

// „So funktioniert Helmut" — einmaliges Onboarding, danach über den Fuß-Link erneut.
function renderHelmutHowTo() {
  let seen = false;
  try { seen = localStorage.getItem("helmut:howtoSeen") === "1"; } catch { seen = false; }
  if (seen && !helmutHowtoForceOpen) return "";
  const cols = [
    { t: "Überblick in 3 Sekunden", d: "Helmut zeigt dir, wie viele Themen heute wichtig sind – und wie du sie priorisieren solltest." },
    { t: "Wichtigste Entscheidungen zuerst", d: "Du bekommst nacheinander die 1–3 wichtigsten Themen. Wische nach links, triff deine Entscheidung und bleib im Flow." },
    { t: "Entscheiden statt informieren", d: "Jedes Thema kommt mit einer klaren Empfehlung. Helmut erklärt dir kurz das Warum, Risiko und deinen Aufwand." },
    { t: "Alle weiteren Themen im Blick", d: "Nach deinen Top-Entscheidungen siehst du alle weiteren Vorgänge – kompakt, sortiert und filterbar." }
  ];
  return `
    <section class="helmut-howto" aria-label="So funktioniert Helmut">
      <div class="helmut-section-head"><h2>So funktioniert Helmut</h2></div>
      <div class="helmut-howto-grid">
        ${cols.map((c, i) => `
          <div class="helmut-howto-col">
            <span class="helmut-howto-step">${i + 1}</span>
            <span class="helmut-howto-title">${escapeHtml(c.t)}</span>
            <span class="helmut-howto-desc">${escapeHtml(c.d)}</span>
          </div>`).join("")}
      </div>
      <button class="secondary-button compact-button" type="button" data-helmut-howto-dismiss>Verstanden</button>
    </section>`;
}

function renderHelmutAssessmentView() {
  const assessment = buildHelmutAssessment();
  if (helmutTypingActive) return renderHelmutTypingResult(assessment);
  return `
    <section class="helmut-referent" aria-label="Helmut – dein Referent">
      ${renderHelmutHeader()}
      ${renderHelmutStatusCards()}
      ${renderLastDecisionCard()}
      ${renderHelmutDeckSection()}
      ${renderFurtherBriefings()}
      ${renderHelmutHowTo()}
      <div class="helmut-assessment-foot">
        <small>Aktualisiert: ${escapeHtml(formatBriefingDate(briefing.generatedAt || briefing.date || new Date().toISOString()))}</small>
        <button class="helmut-howto-link" type="button" data-helmut-howto-show>So funktioniert Helmut</button>
        ${renderRefreshButton()}
      </div>
    </section>
  `;
}

function briefingRelevanceScore(decision) {
  const priorityWeight = ({ risk: 4, action: 3, chance: 2, watch: 1, ignore: 0 })[decision.priorityType] || 1;
  const score = Number(decision.finalScore || decision.totalScore || decision.relevanceScore || 0);
  return priorityWeight * 1000 + score;
}

const CAROUSEL_FILTERS = [
  { key: "Alle",       label: "Alle" },
  { key: "risk",      label: "Risiko" },
  { key: "chance",    label: "Chance" },
  { key: "action",    label: "Aktion" },
  { key: "watch",     label: "Beobachten" }
];

// Das Deck ist das kuratierte Fokus-Set (helmutDeck). Kategorie-Filter der alten
// Carousel-Ansicht entfällt bewusst — die Zielvision hat keine Filter-Chips.
function filteredCarouselItems() {
  return helmutDeck;
}

function renderHelmutBriefingList() {
  if (!helmutDeck.length) return "";
  return `
    <section class="helmut-carousel-wrap helmut-deck-wrap" aria-label="Deine wichtigsten Entscheidungen" id="helmutCarousel">
      ${renderCarouselInner()}
    </section>`;
}

// Eine große Entscheidungs-Card im Fokus. Swipe/Pfeile blättern nur; entschieden
// wird ausschließlich über die drei Buttons (data-deck-decide).
function renderCarouselInner() {
  const items = filteredCarouselItems();
  if (!items.length) return "";
  const safeIndex = Math.min(helmutCarouselIndex, Math.max(0, items.length - 1));
  const card = items[safeIndex];
  const bucket = helmutStatusBucket(card.priorityType || "watch");
  const why = helmutDeckWhy(card);
  const risk = helmutDeckRisk(card);
  const time = helmutDeckTime(card);
  const pct = helmutConfidencePercent(card);
  const subtitle = card.summary && card.summary !== why ? compactText(card.summary, 80) : "";
  const leaving = helmutDeckLeavingId === card.id ? " is-leaving" : "";
  const dots = items.length > 1 ? `
    <div class="helmut-carousel-dots" aria-hidden="true">
      ${items.map((_, i) => `<span class="helmut-carousel-dot ${i === safeIndex ? "active" : ""}"></span>`).join("")}
    </div>` : "";
  const nav = items.length > 1 ? `
    <div class="helmut-carousel-nav">
      <button class="helmut-carousel-arrow" type="button" data-carousel-prev ${safeIndex === 0 ? "disabled" : ""} aria-label="Vorheriges Thema">←</button>
      <button class="helmut-carousel-arrow" type="button" data-carousel-next ${safeIndex === items.length - 1 ? "disabled" : ""} aria-label="Nächstes Thema">→</button>
    </div>` : "";
  return `
    <div class="helmut-deck-track" data-carousel-touch>
      <article class="helmut-deck-card ${escapeAttribute(bucket)}${leaving}">
        <div class="helmut-deck-card-head">
          <span class="helmut-deck-progress">${safeIndex + 1} von ${items.length}</span>
          <span class="helmut-deck-badge ${escapeAttribute(bucket)}">${escapeHtml(HELMUT_BUCKET_LABEL[bucket])}</span>
          <button class="helmut-deck-star" type="button" data-detail="${escapeAttribute(card.id)}" aria-label="Empfehlung öffnen">${HELMUT_ICON_STAR}</button>
        </div>
        <h3 class="helmut-deck-title">${escapeHtml(card.title || "Thema")}</h3>
        ${subtitle ? `<p class="helmut-deck-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        <dl class="helmut-deck-bullets">
          ${why ? `<div><dt><span class="helmut-bullet-ico">${HELMUT_ICON_STAR}</span>Warum betrifft dich das?</dt><dd>${escapeHtml(why)}</dd></div>` : ""}
          ${risk ? `<div><dt><span class="helmut-bullet-ico">${HELMUT_ICON_STAR}</span>Risiko bei Nichtreaktion</dt><dd>${escapeHtml(risk)}</dd></div>` : ""}
          ${time ? `<div class="helmut-deck-line"><dt><span class="helmut-bullet-ico">${HELMUT_ICON_CLOCK}</span>Zeitaufwand</dt><dd>${escapeHtml(time)}</dd></div>` : ""}
          ${pct != null ? `<div class="helmut-deck-line helmut-deck-score"><dt><span class="helmut-bullet-ico">${HELMUT_ICON_SPARK}</span>Vertrauensscore</dt><dd><span class="helmut-score-bar"><span class="helmut-score-fill" style="width:${pct}%"></span></span><span class="helmut-score-val">${pct} %</span></dd></div>` : ""}
        </dl>
        ${renderDeckActions(card)}
      </article>
    </div>
    <p class="helmut-deck-hint">Wische nach links, um dir in Ruhe das nächste Thema anzusehen.</p>
    ${dots}
    ${nav}`;
}

function patchCarousel() {
  const wrap = app.querySelector("#helmutCarousel");
  if (!wrap) return;
  wrap.innerHTML = renderCarouselInner();
  // NUR den ersetzten Teilbaum binden. Ein globales bindActions() nach einem
  // Teil-Patch würde allen NICHT ersetzten Elementen (Burger-Menü, Navigation,
  // Aufklapper, Feedback) bei jeder Karussell-Interaktion einen weiteren
  // Listener anhängen — Aktionen feuerten dann doppelt/n-fach (Audit-Fix 2026-07).
  bindCarousel(wrap);
  bindDetailOpen(wrap);
}

// Öffnet die Detailansicht einer Entscheidung. Gescopt bindbar, damit Teil-Patches
// (patchCarousel) nur ihre eigenen neuen Knoten binden und render()/bindActions()
// weiterhin den Gesamtbaum abdeckt.
function bindDetailOpen(root) {
  (root || app).querySelectorAll("[data-detail]").forEach((button) => {
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
}

function bindCarousel(root) {
  root = root || app.querySelector("#helmutCarousel");
  if (!root) return;

  root.querySelectorAll("[data-carousel-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      helmutCarouselFilter = btn.dataset.carouselFilter;
      helmutCarouselIndex = 0;
      patchCarousel(); // bindet den Teilbaum selbst — kein globales Re-Bind
    });
  });

  const prevBtn = root.querySelector("[data-carousel-prev]");
  const nextBtn = root.querySelector("[data-carousel-next]");
  const items = filteredCarouselItems();

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      helmutCarouselIndex = Math.max(0, helmutCarouselIndex - 1);
      patchCarousel(); // bindet den Teilbaum selbst — kein globales Re-Bind
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      helmutCarouselIndex = Math.min(items.length - 1, helmutCarouselIndex + 1);
      patchCarousel(); // bindet den Teilbaum selbst — kein globales Re-Bind
    });
  }

  const track = root.querySelector("[data-carousel-touch]");
  if (track) {
    let touchStartX = 0;
    track.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 40) return;
      const count = filteredCarouselItems().length;
      if (dx < 0) helmutCarouselIndex = Math.min(count - 1, helmutCarouselIndex + 1);
      else helmutCarouselIndex = Math.max(0, helmutCarouselIndex - 1);
      patchCarousel(); // bindet den Teilbaum selbst — kein globales Re-Bind
    }, { passive: true });
  }
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
  // Kontext-Klassifikation kommt AUSSCHLIESSLICH aus dem Server-Vertrag (item.contextType).
  // KEINE Client-seitige politische Ableitung per Textsuche mehr — keine hartkodierte
  // Partei/Fraktion, kein politischer Frontend-Fallback (SaaS-fest fuer jedes Profil).
  return item && item.contextType ? item.contextType : "";
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
    "Welche Zahl oder welches Beispiel solltest du öffentlich nutzen?"
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
  return `${greeting} Ich habe die politische Lage geprüft. Wichtigstes Thema für dich ist heute ${top.title}. ${mentionSentence} ${riskSentence} ${officeCount ? `${officeCount} ${officeCount !== 1 ? "Entwürfe liegen" : "Entwurf liegt"} im Büro bereit.` : "Im Büro gibt es noch keine Entwürfe für heute."}`;
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
      ${previewMode ? `<span>Kontrollansicht · verändert echte Daten nichts</span>` : ""}
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
      <button class="back-link" type="button" data-view="briefing">Zurück zur Lage</button>

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
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Vor Veröffentlichung prüfen. Sachlicher Ton empfohlen.",
    qualityTone: "Sachlich, klar, politisch anschlussfähig", qualityUsage: "Presse und Medien",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  linkedin: {
    formatLabel: "LinkedIn Beitrag", typeLabel: "LINKEDIN", einordnung: "Persönlich, kurz, anschlussfähig.",
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Vor Veröffentlichung prüfen. Persönliche Sprache erwünscht.",
    qualityTone: "Persönlich, direkt, nahbar", qualityUsage: "LinkedIn",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  x: {
    formatLabel: "X Beitrag", typeLabel: "X / TWITTER", einordnung: "Kurz, pointiert, öffentlich.",
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Vor Veröffentlichung prüfen. Kurz halten.",
    qualityTone: "Direkt, knapp, pointiert", qualityUsage: "X / Twitter",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  instagram: {
    formatLabel: "Instagram Beitrag", typeLabel: "INSTAGRAM", einordnung: "Kurz, klar, mobil lesbar.",
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Vor Veröffentlichung prüfen. Persönliche Sprache erwünscht.",
    qualityTone: "Menschlich, authentisch, kurz", qualityUsage: "Instagram",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  anfrage: {
    formatLabel: "Parlamentarische Anfrage", typeLabel: "PARLAMENTARISCHE ANFRAGE", einordnung: "Für Ausschuss und parlamentarische Kontrolle.",
    defaultStatus: "Zum Bereithalten", fromSource: "Aus Radar vorbereitet", lineCheck: "Vor Einreichung prüfen. Formale Sprache erforderlich.",
    qualityTone: "Formal, sachlich, präzise", qualityUsage: "Parlamentarische Arbeit",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  rede: {
    formatLabel: "Redebaustein", typeLabel: "REDEBAUSTEIN", einordnung: "Für Termine, Interviews und kurze Statements.",
    defaultStatus: "Zum Bereithalten", fromSource: "Aus Radar vorbereitet", lineCheck: "Vor Verwendung prüfen. Kernbotschaft klar halten.",
    qualityTone: "Klar, überzeugend, politisch", qualityUsage: "Termine und Interviews",
    fallbackDraft: "",
    iconBg: "var(--paper)", iconColor: "var(--muted)",
  },
  buergerbrief: {
    formatLabel: "Bürgerbrief", typeLabel: "BÜRGERBRIEF", einordnung: "Verständliche Antwort für Bürgeranfragen.",
    defaultStatus: "Entwurf bereit", fromSource: "Aus Lage empfohlen", lineCheck: "Vor Versand prüfen. Verständliche Sprache.",
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

// Echte Quellenanzahl dieser Entscheidung. KEIN erfundenes Minimum mehr
// (frueher Math.max(n, 3) -> "Basiert auf 3 Quellen" auch bei 0 echten Quellen).
function draftSourceCount(decision) {
  return (decision.sources?.length || 0) + (decision.primarySource ? 1 : 0);
}

function officeBriefingTime() {
  const ts = briefing?.generatedAt || briefing?.date;
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} Uhr`;
}

function draftStatus(format) {
  return OFFICE_FORMAT_META[format.id]?.defaultStatus || "Zum Bereithalten";
}

// Ehrlicher Anzeige-Status EINER Karte: "Entwurf bereit" NUR, wenn wirklich ein
// gültiger (KI-/regelbasierter) Entwurf vorliegt. Sonst "Wird vorbereitet" bzw.
// die redaktionelle Vorgabe des Formats — nie "bereit" über einem Platzhalter.
function officeCardStatus(decision, format) {
  const editorial = draftStatus(format);
  const key = officeDraftKey(decision, format);
  const hasValid = isValidDraft(officeDraftText(officeDrafts[key]));
  if (editorial === "Entwurf bereit" && !hasValid) {
    if (officeDraftsGenerating) return "Wird vorbereitet";
    // Ehrlicher Fehlerzustand statt "Noch kein Entwurf": die Erzeugung ist
    // real fehlgeschlagen (Timeout/Limit/KI-Fehler), nicht bloß ausstehend.
    return officeDraftErrors[key] ? "Erstellung fehlgeschlagen" : "Noch kein Entwurf";
  }
  return editorial;
}

function draftStatusClass(status) {
  if (status === "Entwurf bereit") return "buero-status--publish";
  if (status === "Bei Nachfrage verwenden") return "buero-status--nachfrage";
  if (status === "Noch nicht belastbar" || status === "Noch kein Entwurf" || status === "Erstellung fehlgeschlagen") return "buero-status--unsicher";
  if (status === "Wird vorbereitet") return "buero-status--bereit";
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
    ? `Heute vorbereitet: ${totalCount} ${totalCount !== 1 ? "Entwürfe" : "Entwurf"}. Prüfe zuerst ${firstTwoFormats.join(" und ")}.`
    : "Heute vorbereitet.";

  const summaryText = hasBriefing
    ? (readyCount ? `${readyCount} ${readyCount !== 1 ? "Entwürfe" : "Entwurf"} bereit` : "")
      + (holdCount ? `${readyCount ? `<span class="buero-summary-sep">·</span>` : ""}${holdCount} zum Bereithalten` : "")
      + (time ? `<span class="buero-summary-sep">·</span>Vorbereitet um ${escapeHtml(time)}` : "")
    : generating
      ? "Entwürfe werden vorbereitet&hellip;"
      : "Deine Entwürfe erscheinen hier automatisch, sobald deine Lage geladen ist.";

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
  const draftValue = officeDrafts[key];
  const aiText = officeDraftText(draftValue);
  const isLoading = officeDraftsGenerating && !aiText;
  const meta = OFFICE_FORMAT_META[format.id] || { typeLabel: format.label.toUpperCase(), einordnung: "", defaultStatus: "Zum Bereithalten", lineCheck: "", iconBg: "#F0F0F0", iconColor: "#555" };
  // Kein erfundener Muster-Entwurf mehr: entweder gültiger (KI-/regelbasierter)
  // Text oder ein aus DIESER Entscheidung abgeleiteter Vorschlag. Fehlt beides,
  // liefert channelFallbackStatement die klare Meldung "kein belastbarer
  // Kommunikationsvorschlag vor" (siehe isValidDraft/renderOfficeDraftCard).
  const hasValid = isValidDraft(aiText);
  const text = (hasValid ? aiText : null) || channelFallbackStatement(decision, format.channel || "press");
  const readTime = draftReadingTime(text);
  const status = officeCardStatus(decision, format);
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
      ${isLoading ? "" : `<p class="buero-card-provenance">${escapeHtml(draftProvenanceLabel(officeDraftProvenance(draftValue), hasValid))}</p>`}
    </article>
  `;
}

function renderOfficeDraftDetail() {
  if (!selectedOfficeDraft) { currentView = "office"; return renderOfficeView(); }
  const { decision, format, text } = selectedOfficeDraft;
  const meta = OFFICE_FORMAT_META[format.id] || { formatLabel: format.label, typeLabel: format.label.toUpperCase(), einordnung: "", defaultStatus: "Zum Bereithalten", lineCheck: "", qualityTone: "Sachlich, klar, politisch anschlussfähig", qualityUsage: "Presse und Medien", iconBg: "#F0F0F0", iconColor: "#555" };
  const time = officeBriefingTime();
  const sources = draftSourceCount(decision);
  const status = officeCardStatus(decision, format);
  const statusClass = draftStatusClass(status);
  const paragraphs = String(text).split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);
  const lageDateStr = (() => {
    const ts = briefing?.generatedAt || briefing?.date;
    if (!ts) return "heute";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "heute";
    return d.toLocaleDateString("de-DE", { day: "numeric", month: "long" });
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
          ${sources > 0 ? `&nbsp;·&nbsp; Basiert auf ${sources} ${sources !== 1 ? "Quellen" : "Quelle"}` : ""}
        </p>
        <p class="buero-detail-linecheck">${escapeHtml(selectedOfficeDraft.provenance || draftProvenanceLabel("", isValidDraft(officeDraftText(officeDrafts[officeDraftKey(decision, format)]))))}${meta.lineCheck ? escapeHtml(" · " + meta.lineCheck) : ""}</p>
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
  const text = task.description || "Bitte diese Empfehlung vorbereiten.";
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
          <span>${escapeHtml(generatedStatementSource === "ki" ? "KI-Entwurf · vor Veröffentlichung prüfen"
            : generatedStatementSource === "fehler" ? "KI nicht erreichbar · regelbasierter Entwurf"
            : generatedStatementSource === "regel" ? "Regelbasierter Entwurf · noch kein KI-Text"
            : "Aus der belegten Entscheidung abgeleitet")}</span>
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

// ── Radar — Persönliches politisches Umfeld & Frühwarnsystem ─────────────────
// Radar liest AUSSCHLIESSLICH den deterministischen V3-Lesevertrag
// briefing.currentRadarState (0 KI, server-seitig gebaut). KEINE Client-
// Klassifikation, KEINE politischen Fallbacks, KEINE Handlungsempfehlungen,
// KEIN Risiko-/Chancen-Frame (das ist Helmut, nicht Radar).

function renderRadarView() {
  const state = (briefing && briefing.currentRadarState) || null;
  return `<div class="radar2" id="radar2-root">${renderRadarInner(state)}</div>`;
}

function renderRadarInner(state) {
  const body = (!state || !radarStateHasContent(state))
    ? renderRadarEmpty(state)
    : `
        ${renderRadarSummary(state)}
        ${renderRadarAboutYou(state)}
        ${renderRadarEnvironment(state)}
        ${renderRadarDynamics(state)}
        ${renderRadarArticles(state)}
      `;
  return `${renderRadarHeader(state)}${body}`;
}

function radarStateHasContent(state) {
  if (!state) return false;
  const env = state.environment || {};
  const envCount = (env.party || []).length + (env.constituency || []).length + (env.committees || []).length;
  return Boolean((state.mentions || []).length || envCount || (state.dynamics || []).length || (state.articles || []).length);
}

// --- Kopf -------------------------------------------------------------------
function renderRadarHeader(state) {
  const status = (state && state.status) || "empty";
  const fresh = status === "fresh";
  const updated = state && state.lastUpdated;
  const label = !updated
    ? (previewMode ? "Vorschau" : "Noch keine Radar-Daten")
    : (fresh ? `Aktualisiert ${radarUpdatedLabel(updated)}` : `Letzter Stand: ${radarUpdatedLabel(updated)}`);
  return `
    <header class="radar2-header">
      <div class="radar2-header-row">
        <h1 class="radar2-h1">Radar</h1>
        <button class="radar2-refresh ${radarRefreshing ? "is-loading" : ""}" type="button" data-radar-refresh aria-label="Radar aktualisieren" ${radarRefreshing ? "aria-busy=\"true\"" : ""}>
          ${radarIcon("refresh")}
        </button>
      </div>
      <p class="radar2-lede">Was bewegt sich rund um dich?</p>
      <div class="radar2-status radar2-status--${fresh ? "fresh" : "stale"}">
        <span class="radar2-status-dot" aria-hidden="true"></span>
        <span>${escapeHtml(label)}</span>
      </div>
    </header>
  `;
}

// --- Persönliche Zusammenfassung --------------------------------------------
function renderRadarSummary(state) {
  const s = state.summary || {};
  const lines = [s.line1, s.line2].filter(Boolean);
  if (!lines.length) return "";
  const html = lines.map((ln) => `<span class="radar2-summary-line">${radarHighlight(ln)}</span>`).join("");
  return `
    <section class="radar2-summary" aria-label="Zusammenfassung">
      <div class="radar2-summary-icon" aria-hidden="true">${radarIcon("radar")}</div>
      <p class="radar2-summary-text">${html}</p>
    </section>
  `;
}

// Nur die (deterministischen) Zahlen dezent hervorheben — kein Keyword-Raten.
function radarHighlight(text) {
  return escapeHtml(text).replace(/(\d+\s?(?:×|x)?)/g, '<b class="radar2-hl">$1</b>');
}

// --- Über dich (direkte Erwähnungen) ----------------------------------------
function renderRadarAboutYou(state) {
  const all = state.mentions || [];
  const expanded = radarMentionsExpanded;
  const shown = expanded ? all : all.slice(0, 3);
  const body = all.length
    ? shown.map(renderRadarMentionCard).join("")
    : radarEmptyHint("Heute wurden keine direkten Erwähnungen gefunden.");
  return `
    <section class="radar2-section">
      ${radarSectionHead("person", "Über dich", "mentions", expanded, all.length > 3)}
      <div class="radar2-cards">${body}</div>
    </section>
  `;
}

function renderRadarMentionCard(m) {
  const href = radarItemHref(m);
  const time = radarTime(m.publishedAt);
  const tag = m.mentionLabel
    ? `<span class="radar2-tag radar2-tag--${m.mentionTone === "critical" ? "critical" : "neutral"}">${escapeHtml(m.mentionLabel)}</span>`
    : "";
  const inner = `
    <div class="radar2-card-body">
      <div class="radar2-meta">
        ${radarSourceBadge(m)}
        <span class="radar2-source-name">${escapeHtml(m.sourceName || "Quelle")}</span>
        ${time ? `<span class="radar2-dot" aria-hidden="true">·</span><span class="radar2-time">${escapeHtml(time)}</span>` : ""}
      </div>
      <h3 class="radar2-card-title">${escapeHtml(m.title || "Erwähnung")}</h3>
      ${tag ? `<div class="radar2-card-foot">${tag}</div>` : ""}
      ${m.evidence ? `<p class="radar2-card-sub radar2-card-sub--block">${escapeHtml(m.evidence)}</p>` : ""}
    </div>
    ${href ? `<span class="radar2-chevron" aria-hidden="true">${radarIcon("chevron")}</span>` : ""}
  `;
  return radarCardWrap(href, inner, "mention");
}

// --- Dein Umfeld (Partei / Wahlkreis / Ausschüsse) --------------------------
function renderRadarEnvironment(state) {
  const env = state.environment || { party: [], constituency: [], committees: [] };
  const active = RADAR_SEGMENTS.some((s) => s.key === radarSegment) ? radarSegment : "party";
  const tabs = RADAR_SEGMENTS.map((s) => {
    const isActive = s.key === active;
    return `<button class="radar2-seg ${isActive ? "is-active" : ""}" type="button" role="tab" aria-selected="${isActive}" data-radar-segment="${s.key}">${escapeHtml(s.label)}</button>`;
  }).join("");
  const seg = RADAR_SEGMENTS.find((s) => s.key === active);
  const items = env[active] || [];
  // Kuratierte Auswahl statt Feed: standardmäßig max. 3 pro Segment; der Rest ist eine
  // ECHTE erweiterte Liste (Daten liegen vor) hinter einem segmentspezifischen Button.
  const RADAR_ENV_PREVIEW = 3;
  const shown = radarEnvExpanded ? items : items.slice(0, RADAR_ENV_PREVIEW);
  const list = shown.length ? shown.map(renderRadarEnvRow).join("") : radarEmptyHint(seg.empty);
  const more = items.length > RADAR_ENV_PREVIEW
    ? `<button class="radar2-more-link radar2-more-link--block" type="button" data-radar-expand="environment">${radarEnvExpanded ? "Weniger anzeigen" : `${escapeHtml(seg.more)} (${items.length})`} <span aria-hidden="true">›</span></button>`
    : "";
  return `
    <section class="radar2-section">
      <h2 class="radar2-h2">${radarIcon("people")}<span>Dein Umfeld</span></h2>
      <div class="radar2-segments" role="tablist" aria-label="Umfeld-Bereich">${tabs}</div>
      <div class="radar2-list">${list}</div>
      ${more}
    </section>
  `;
}

function renderRadarEnvRow(e) {
  const href = radarItemHref(e);
  const time = radarTime(e.publishedAt);
  const rel = e.relationLabel ? `<span class="radar2-tag radar2-tag--neutral radar2-tag--sm">${escapeHtml(e.relationLabel)}</span>` : "";
  const inner = `
    ${radarSourceBadge(e, { small: true })}
    <div class="radar2-row-body">
      <h3 class="radar2-row-title">${escapeHtml(e.title || "Vorgang")}</h3>
      <div class="radar2-row-meta">${rel}<span class="radar2-row-sub">${escapeHtml(e.sourceName || "Quelle")}${time ? " · " + escapeHtml(time) : ""}</span></div>
    </div>
    ${href ? `<span class="radar2-chevron" aria-hidden="true">${radarIcon("chevron")}</span>` : ""}
  `;
  return radarRowWrap(href, inner);
}

// --- Neue Dynamiken ---------------------------------------------------------
function renderRadarDynamics(state) {
  const all = state.dynamics || [];
  const expanded = radarDynamicsExpanded;
  const shown = expanded ? all : all.slice(0, 3);
  const body = all.length
    ? shown.map(renderRadarDynamicCard).join("")
    : radarEmptyHint("Aktuell entsteht keine neue belegbare Dynamik.");
  return `
    <section class="radar2-section">
      ${radarSectionHead("activity", "Neue Dynamiken", "dynamics", expanded, all.length > 3)}
      <div class="radar2-cards">${body}</div>
    </section>
  `;
}

function renderRadarDynamicCard(d) {
  const href = radarItemHref(d);
  const time = radarTime(d.lastUpdatedAt);
  const tag = d.signalLabel ? `<span class="radar2-tag radar2-tag--signal">${escapeHtml(d.signalLabel)}</span>` : "";
  const inner = `
    <div class="radar2-dyn-icon" aria-hidden="true">${radarIcon("trend")}</div>
    <div class="radar2-card-body">
      <h3 class="radar2-card-title">${escapeHtml(d.title || "Entwicklung")}</h3>
      ${d.evidence ? `<p class="radar2-dyn-evidence">${escapeHtml(d.evidence)}</p>` : ""}
      <div class="radar2-card-foot">${tag}${time ? `<span class="radar2-card-sub">${escapeHtml(time)}</span>` : ""}</div>
    </div>
    ${href ? `<span class="radar2-chevron" aria-hidden="true">${radarIcon("chevron")}</span>` : ""}
  `;
  return radarCardWrap(href, inner, "dynamic");
}

// --- Alle relevanten Artikel + Filter ---------------------------------------
function renderRadarArticles(state) {
  const all = state.articles || [];
  // Nur Filter mit >=1 Treffer anzeigen (kein toter Filter); "Alle" immer.
  const available = RADAR_FILTERS.filter((f) => f.key === "all" || all.some((a) => radarArticleMatchesFilter(a, f.key)));
  const activeKey = available.some((f) => f.key === radarFilter) ? radarFilter : "all";
  const chips = available.map((f) =>
    `<button class="radar2-filter ${f.key === activeKey ? "is-active" : ""}" type="button" role="tab" aria-selected="${f.key === activeKey}" data-radar-filter="${f.key}">${escapeHtml(f.label)}</button>`
  ).join("");
  const filtered = all.filter((a) => radarArticleMatchesFilter(a, activeKey));
  // Premium-Überblick statt Medienmonitoring: standardmäßig max. 5 Artikel; der Rest
  // ist eine ECHTE erweiterte Liste (die Daten liegen vor) hinter "Alle anzeigen".
  const RADAR_ARTICLE_PREVIEW = 5;
  const shown = radarArticlesExpanded ? filtered : filtered.slice(0, RADAR_ARTICLE_PREVIEW);
  const list = shown.length ? shown.map(renderRadarArticleRow).join("") : radarEmptyHint("Keine passenden Artikel im gewählten Filter.");
  const more = filtered.length > RADAR_ARTICLE_PREVIEW
    ? `<button class="radar2-more-link radar2-more-link--block" type="button" data-radar-expand="articles">${radarArticlesExpanded ? "Weniger anzeigen" : `Alle anzeigen (${filtered.length})`} <span aria-hidden="true">›</span></button>`
    : "";
  return `
    <section class="radar2-section radar2-section--articles">
      <h2 class="radar2-h2 radar2-h2--quiet">${radarIcon("doc")}<span>Alle relevanten Artikel</span></h2>
      <div class="radar2-filters" role="tablist" aria-label="Artikelfilter">${chips}</div>
      <div class="radar2-list">${list}</div>
      ${more}
    </section>
  `;
}

function radarArticleMatchesFilter(a, key) {
  if (key === "all") return true;
  return Array.isArray(a.relationTypes) && a.relationTypes.includes(key);
}

function renderRadarArticleRow(a) {
  const href = radarItemHref(a);
  const time = radarTime(a.publishedAt);
  const relLabel = radarPrimaryRelationLabel(a.relationTypes);
  const rel = relLabel ? `<span class="radar2-tag radar2-tag--neutral radar2-tag--sm">${escapeHtml(relLabel)}</span>` : "";
  const inner = `
    ${radarSourceBadge(a, { small: true })}
    <div class="radar2-row-body">
      <div class="radar2-row-meta radar2-row-meta--top">
        <span class="radar2-source-name">${escapeHtml(a.sourceName || "Quelle")}</span>
        ${time ? `<span class="radar2-dot" aria-hidden="true">·</span><span class="radar2-time">${escapeHtml(time)}</span>` : ""}
      </div>
      <h3 class="radar2-row-title">${escapeHtml(a.title || "Artikel")}</h3>
      ${rel ? `<div class="radar2-row-meta">${rel}</div>` : ""}
    </div>
    ${href ? `<span class="radar2-chevron" aria-hidden="true">${radarIcon("chevron")}</span>` : ""}
  `;
  return radarRowWrap(href, inner);
}

function radarPrimaryRelationLabel(types) {
  if (!Array.isArray(types)) return "";
  for (const k of ["mention", "committee", "constituency", "party", "official", "media"]) {
    if (types.includes(k)) return RADAR_RELATION_LABELS[k];
  }
  return "";
}

// --- Leerzustände + gemeinsame Bausteine ------------------------------------
function renderRadarEmpty(state) {
  // Sprint 5 (additiv): unterscheidbarer Radar-Leerzustand (gap/stale/quiet). Der
  // quiet-Fall (kein-umfeldsignal) beruhigt, gap/stale warnen vor Datenausfall/Frische.
  const es = state && state.emptyState && state.emptyState.kind ? state.emptyState : null;
  const note = es && es.detail ? es.detail : (previewMode
    ? "In der Vorschau liegen keine personalisierten Radar-Daten vor."
    : "Sobald neue Quellen zu dir, deiner Partei, deinem Wahlkreis oder deinen Ausschüssen vorliegen, erscheinen sie hier.");
  const summaryState = es && es.headline
    ? { summary: { line1: es.headline, line2: "" } }
    : (state && state.summary ? state : { summary: { line1: "Heute gibt es keine neuen relevanten Signale in deinem politischen Umfeld.", line2: "" } });
  return `
    ${renderRadarSummary(summaryState)}
    <section class="radar2-section"${es ? ` data-empty-kind="${escapeAttribute(es.kind)}"` : ""}>
      <div class="radar2-empty">${escapeHtml(note)}</div>
    </section>
  `;
}

function radarEmptyHint(text) {
  return `<div class="radar2-empty">${escapeHtml(text)}</div>`;
}

function radarSectionHead(icon, title, expandKey, expanded, showExpand) {
  const btn = showExpand
    ? `<button class="radar2-more-link" type="button" data-radar-expand="${escapeAttribute(expandKey)}">${expanded ? "Weniger anzeigen" : "Alle anzeigen"} <span aria-hidden="true">›</span></button>`
    : "";
  return `
    <div class="radar2-section-head">
      <h2 class="radar2-h2">${radarIcon(icon)}<span>${escapeHtml(title)}</span></h2>
      ${btn}
    </div>
  `;
}

function radarCardWrap(href, inner, kind) {
  if (href) {
    return `<a class="radar2-card radar2-card--${escapeAttribute(kind)}" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  return `<article class="radar2-card radar2-card--${escapeAttribute(kind)} radar2-card--nolink">${inner}</article>`;
}

function radarRowWrap(href, inner) {
  if (href) {
    return `<a class="radar2-row" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  return `<div class="radar2-row radar2-row--nolink">${inner}</div>`;
}

// Quellenzeichen (Initiale) statt erfundener Vorschaubilder: in V3 existiert KEIN
// gespeichertes Bildfeld (image_url/og_image). Ehrlich, ohne externen Hotlink.
// Ruhige, monochrome Quellenmarke (keine bunten Avatar-Farben) — premium/ministeriell.
// opts.small = noch dezenter in dichten Listen (Umfeld/Artikel).
function radarSourceBadge(item, opts = {}) {
  const name = String((item && item.sourceName) || "Quelle").trim();
  const initial = escapeHtml((name.charAt(0) || "•").toUpperCase());
  const cls = opts.small ? "radar2-badge radar2-badge--sm" : "radar2-badge";
  return `<span class="${cls}" aria-hidden="true">${initial}</span>`;
}

// Nur echte http(s)-Quellen öffnen (kein toter Link). Server kuratiert canonical/best.
function radarItemHref(item) {
  const url = item && item.sourceUrl;
  return url && isHttpUrl(url) ? url : "";
}

function radarUpdatedLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
  if (radarIsToday(d)) return `heute, ${time}`;
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(d);
  return `${day}, ${time}`;
}

function radarTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return radarIsToday(d)
    ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d)
    : new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "short" }).format(d);
}

function radarIsToday(d) {
  const key = (x) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  return key(d) === key(new Date());
}

// Partielle Neu-Darstellung ohne Ganzseiten-Rebuild -> kein Scroll-Sprung beim
// Segment-/Filter-/Alle-anzeigen-Wechsel (Apple-artig ruhig).
function rerenderRadar() {
  const root = document.getElementById("radar2-root");
  if (!root) { render(); return; }
  const state = (briefing && briefing.currentRadarState) || null;
  root.innerHTML = renderRadarInner(state);
  bindRadarActions();
}

async function refreshRadar() {
  if (radarRefreshing) return;
  radarRefreshing = true;
  rerenderRadar();
  try { await loadBriefing(); } catch (_) { /* Anzeige bleibt beim letzten Stand */ }
  radarRefreshing = false;
  if (currentView === "radar") rerenderRadar();
}

function bindRadarActions() {
  const root = document.getElementById("radar2-root");
  if (!root) return;
  root.querySelectorAll("[data-radar-segment]").forEach((btn) => {
    // Segmentwechsel startet wieder kompakt (kuratierte Auswahl, kein langer Rest).
    btn.addEventListener("click", () => { radarSegment = btn.dataset.radarSegment; radarEnvExpanded = false; rerenderRadar(); });
  });
  root.querySelectorAll("[data-radar-filter]").forEach((btn) => {
    // Filterwechsel setzt die Artikel-Aufklappung zurück (kein verwirrend langer Rest).
    btn.addEventListener("click", () => { radarFilter = btn.dataset.radarFilter; radarArticlesExpanded = false; rerenderRadar(); });
  });
  root.querySelectorAll("[data-radar-expand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.radarExpand;
      if (k === "mentions") radarMentionsExpanded = !radarMentionsExpanded;
      else if (k === "dynamics") radarDynamicsExpanded = !radarDynamicsExpanded;
      else if (k === "articles") radarArticlesExpanded = !radarArticlesExpanded;
      else if (k === "environment") radarEnvExpanded = !radarEnvExpanded;
      rerenderRadar();
    });
  });
  root.querySelectorAll("[data-radar-refresh]").forEach((btn) => {
    btn.addEventListener("click", () => refreshRadar());
  });
}

// Kompakte, konturlose Line-Icons (kein Emoji) — currentColor, an die Typo angelehnt.
function radarIcon(name) {
  const A = 'class="radar2-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const ICONS = {
    radar: `<svg ${A}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 19 8"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>`,
    person: `<svg ${A}><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg>`,
    people: `<svg ${A}><circle cx="9" cy="8.5" r="3"/><path d="M3.5 18.5a5.5 5.5 0 0 1 11 0"/><path d="M16 6.2a3 3 0 0 1 0 5.6"/><path d="M17.5 18.5a5.5 5.5 0 0 0-2.2-4.4"/></svg>`,
    activity: `<svg ${A}><path d="M3 12h3.5l2.5-6 4 12 2.5-6H21"/></svg>`,
    trend: `<svg ${A}><path d="M4 15l5-5 3.5 3.5L20 6"/><path d="M15 6h5v5"/></svg>`,
    doc: `<svg ${A}><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M8.5 12.5h7"/><path d="M8.5 16h5"/></svg>`,
    refresh: `<svg ${A}><path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 5v6h-6"/></svg>`,
    chevron: `<svg ${A} width="18" height="18"><path d="M9 6l6 6-6 6"/></svg>`
  };
  return ICONS[name] || "";
}

const RADAR_SEGMENTS = [
  { key: "party", label: "Partei", empty: "Keine neuen relevanten Parteisignale.", more: "Alle Parteisignale anzeigen" },
  { key: "constituency", label: "Wahlkreis", empty: "Keine neuen relevanten Entwicklungen aus deinem Wahlkreis.", more: "Alle Wahlkreis-Signale anzeigen" },
  { key: "committees", label: "Ausschüsse", empty: "Keine neuen relevanten Ausschussentwicklungen.", more: "Alle Ausschuss-Signale anzeigen" }
];

const RADAR_FILTERS = [
  { key: "all", label: "Alle" },
  { key: "mention", label: "Über dich" },
  { key: "party", label: "Partei" },
  { key: "constituency", label: "Wahlkreis" },
  { key: "committee", label: "Ausschüsse" },
  { key: "media", label: "Medien" },
  { key: "official", label: "Offizielle Quellen" }
];

const RADAR_RELATION_LABELS = { mention: "Über dich", party: "Partei", constituency: "Wahlkreis", committee: "Ausschuss", media: "Medien", official: "Offiziell" };

function profileMentions() {
  const profileTerms = profileNameTerms();
  return [...(briefing.personMentions || []), ...(briefing.rawItems || [])]
    .filter((item) => itemMentionsProfile(item, profileTerms))
    .filter(hasPreciseSource)
    .filter(uniqueMentionItem)
    .sort(sortNewestFirst);
}

function profileNameTerms() {
  const fullName = profile?.fullName || "Profil";
  const lastName = fullName.split(/\s+/).filter(Boolean).at(-1) || fullName;
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
  if (item.imageUrl && isHttpUrl(item.imageUrl)) {
    return `<img class="mention-image mention-image-cover" src="${escapeAttribute(item.imageUrl)}" alt="" loading="lazy" />`;
  }

  const publisherLogo = publisherImageUrl(item);
  if (publisherLogo && isHttpUrl(publisherLogo)) {
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
        <a class="stg-row stg-row--tappable" href="/impressum" target="_blank" rel="noopener noreferrer" style="text-decoration:none">
          <span class="stg-row-label">Impressum</span>
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

    <p class="stg-version">Helmut · Version 1.0</p>
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


// Mandatsebene fuer das Formular (Spiegel von config.parliamentTypeOf, nur Anzeige):
// explizites parliamentType -> politische_ebene -> legacy politicalLevel -> Default Bundestag.
function profileParliamentType() {
  const explicit = String(profile && profile.parliamentType || "").toLowerCase();
  if (explicit.includes("landtag")) return "Landtag";
  if (explicit.includes("bundestag")) return "Bundestag";
  const ebene = String(profile && profile.politische_ebene || "").toLowerCase();
  if (ebene.includes("landtag")) return "Landtag";
  if (ebene.includes("bundestag")) return "Bundestag";
  const level = String(profile && profile.politicalLevel || "").toLowerCase();
  if (level.startsWith("land")) return "Landtag";
  return "Bundestag";
}

// Profil-Freigabestatus (Onboarding, Audit-Fix 2026-07): macht sichtbar, ob das
// Profil vollstaendig/einsatzbereit ist oder welche Pflichtangaben fehlen —
// fehlende Angaben duerfen nicht still zu schlechten Ergebnissen fuehren.
// Datenquelle: profil.profilValidierung (Server, validateProfile) — keine
// Client-Doppellogik.
function renderProfileReleaseStatus() {
  const val = profile && profile.profilValidierung;
  if (!val || !val.state) return "";
  const ready = val.state === "vollstaendig";
  const label = ready ? "Vollständig und einsatzbereit" : "Unvollständig — noch nicht freigegeben";
  const detail = ready
    ? "Alle Pflichtangaben vorhanden. Helmut kann dieses Mandat voll versorgen."
    : (Array.isArray(val.missingRequiredLabels) && val.missingRequiredLabels.length
        ? `Es fehlen: ${val.missingRequiredLabels.join(", ")}.`
        : String(val.reason || ""));
  return `
    <section class="profile-release ${ready ? "profile-release--ready" : "profile-release--open"}" aria-live="polite">
      <b>${escapeHtml(label)}</b>
      <p>${escapeHtml(detail)}</p>
    </section>`;
}

function renderProfileSettingsView() {
  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Mandatsprofil.")}">Mandatsprofil.</h1>
      <p>Diese Angaben entscheiden, warum Helmut ein Thema genau für dich priorisiert.</p>
    </section>

    ${renderProfileReleaseStatus()}

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
          ${profileSelect("parliamentType", "Mandatsebene", profileParliamentType(), ["Bundestag", "Landtag"])}
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
  return decisions.find((decision) => decision.id === selectedDecisionId) || helmutBriefings.find((decision) => decision.id === selectedDecisionId) || decisions[0] || {
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

  // --- Mehrmandantenfaehigkeit Phase 4: Admin-Profilverwaltung (Aktionen) ---
  // Testbriefing (Trockenrechnung, 0 KI): zeigt, ob das Profil gerade Inhalte bekaeme.
  app.querySelectorAll("[data-profile-test-briefing]").forEach((button) => {
    button.addEventListener("click", async () => {
      const pid = button.dataset.profileTestBriefing;
      button.disabled = true;
      const prev = button.textContent;
      button.textContent = "Prüfe …";
      const res = await apiSend("POST", `/api/admin/profile/${encodeURIComponent(pid)}/test-briefing?${apiScopeQuery()}`, {});
      button.disabled = false;
      button.textContent = prev;
      if (res.ok && res.json) {
        showToast(`${res.json.zustand}: ${res.json.hinweis}`);
      } else {
        showToast("Testbriefing fehlgeschlagen.");
      }
    });
  });

  // Bearbeiten aufklappen.
  app.querySelectorAll("[data-profile-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const pid = button.dataset.profileEdit;
      const editor = app.querySelector(`[data-profile-editor="${pid}"]`);
      if (editor) editor.hidden = !editor.hidden;
    });
  });

  // Aktiv/Inaktiv umschalten (Profil-Ebene, unabhaengig vom Login).
  app.querySelectorAll("[data-profile-toggle-active]").forEach((button) => {
    button.addEventListener("click", async () => {
      const pid = button.dataset.profileToggleActive;
      const active = button.dataset.active === "1";
      const res = await apiSend("POST", `/api/admin/profile/${encodeURIComponent(pid)}?${apiScopeQuery()}`, { profileActive: !active });
      if (res.ok) {
        adminDataLoaded = false;
        await ensureViewData("admin");
        showToast(active ? "Profil deaktiviert." : "Profil aktiviert.");
      } else {
        showToast("Konnte Status nicht ändern.");
      }
    });
  });

  // Speichern (KI-Budget, Onboarding-Status). Euro -> Cent; leer/0 -> Standard.
  app.querySelectorAll("[data-profile-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const pid = button.dataset.profileSave;
      const card = app.querySelector(`[data-profile-card="${pid}"]`);
      const msg = card ? card.querySelector(`[data-profile-msg="${pid}"]`) : null;
      const getField = (name) => card ? card.querySelector(`[data-edit-field="${name}"]`) : null;
      const eurToCent = (v) => {
        const s = String(v == null ? "" : v).trim();
        if (s === "") return 0; // 0 = Standard (Server setzt auf null)
        const num = Number(s.replace(",", "."));
        if (!Number.isFinite(num) || num < 0) return null; // ungueltig -> Validierung meldet fehlerhaft
        return Math.round(num * 100);
      };
      const body = {
        aiBudgetDailyCents: eurToCent(getField("aiBudgetDailyEur") && getField("aiBudgetDailyEur").value),
        aiBudgetMonthlyCents: eurToCent(getField("aiBudgetMonthlyEur") && getField("aiBudgetMonthlyEur").value),
        onboardingStatus: getField("onboardingStatus") && getField("onboardingStatus").value
      };
      if (msg) msg.textContent = "Speichere …";
      const res = await apiSend("POST", `/api/admin/profile/${encodeURIComponent(pid)}?${apiScopeQuery()}`, body);
      if (res.ok) {
        adminDataLoaded = false;
        await ensureViewData("admin");
        showToast("Profil gespeichert.");
      } else if (msg) {
        msg.textContent = res.json?.error || "Speichern fehlgeschlagen.";
      }
    });
  });

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
  // Interne Sprung-Anker (Statuskacheln & Handlungsbedarf-Hinweise): NUR sanftes
  // Scrollen zum Zielabschnitt + kurzer, dezenter Flash. Es wird NIE eine Aktion
  // ausgelöst (kein Pipeline-/Understanding-Lauf, kein Lock-Lösen, keine Recovery,
  // kein LLM). Das native <a href="#…"> funktioniert auch ohne dieses JS.
  app.querySelectorAll("[data-admin-jump]").forEach((el) => {
    el.addEventListener("click", (event) => {
      // DEFENSIV: Ein Klick, der aus einem echten Aktions-Control stammt (Recovery-/
      // Pending-Button), darf NIE als Sprung behandelt werden — die echte Aktion hat
      // Vorrang. (Buttons liegen ohnehin außerhalb der Sprung-Anker; dies ist ein Riegel
      // gegen künftige Verschachtelung.)
      if (event.target.closest && event.target.closest("[data-recovery-action], [data-pending-diagnose]")) return;
      const id = el.getAttribute("data-admin-jump");
      const target = id ? document.getElementById(id) : null;
      if (!target) return; // ohne Ziel: normales Anker-Verhalten
      event.preventDefault();
      // Nur beim Sprung zum Recovery-Bereich dessen Detailblock aufklappen (reine UI,
      // KEINE Aktion). Andere Ziele zeigen bereits ihren verdichteten Kopf.
      try {
        if (id === "admin-recovery") {
          target.querySelectorAll("details.admin-details").forEach((d) => { d.open = true; });
          adminRecoveryDetailsOpen = true; // über den nächsten Re-Render hinaus offen halten
        } else if (target.tagName === "DETAILS") target.open = true;
      } catch (_) { /* rein optisch, nie kritisch */ }
      try { target.scrollIntoView({ behavior: "smooth", block: "start" }); }
      catch (_) { try { target.scrollIntoView(); } catch (__) { /* ignore */ } }
      target.classList.add("admin-jump-flash");
      window.setTimeout(() => { try { target.classList.remove("admin-jump-flash"); } catch (_) { /* ignore */ } }, 1600);
    });
  });

  // Begriffs-Erklärungen: Tippen toggelt das Popover (Desktop zeigt es zusätzlich per
  // Hover/Fokus via CSS). REINE Anzeige — keine Aktion, kein Netzwerk. Am rechten Rand
  // klappt das Popover nach links, damit es nicht aus dem Bild läuft.
  const closeAllAdminInfo = () => app.querySelectorAll('.admin-info-btn[aria-expanded="true"]').forEach((b) => {
    b.setAttribute("aria-expanded", "false");
    if (b.nextElementSibling) b.nextElementSibling.classList.remove("admin-info-pop--flip");
  });
  app.querySelectorAll("[data-admin-info]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const wasOpen = btn.getAttribute("aria-expanded") === "true";
      closeAllAdminInfo();
      if (!wasOpen) {
        btn.setAttribute("aria-expanded", "true");
        const pop = btn.nextElementSibling;
        if (pop) {
          try {
            const r = btn.getBoundingClientRect();
            const vw = window.innerWidth || document.documentElement.clientWidth || 0;
            pop.classList.toggle("admin-info-pop--flip", vw > 0 && r.left > vw * 0.5);
          } catch (_) { /* Positionierung optional */ }
        }
      }
    });
  });
  if (!adminInfoGlobalBound) {
    adminInfoGlobalBound = true;
    document.addEventListener("click", () => { try { closeAllAdminInfoGlobal(); } catch (_) {} });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") { try { closeAllAdminInfoGlobal(); } catch (_) {} } });
  }

  app.querySelectorAll("[data-admin-period]").forEach((button) => {
    button.addEventListener("click", () => {
      adminPeriod = button.dataset.adminPeriod;
      render(); // render() bindet selbst
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

  // Pipeline-Recovery-Aktionen: laufen NUR nach bewusstem Klick (kein Auto-Run).
  // Serverseitig admin-gegatet + CSRF (fetchWithTimeout setzt den Token).
  app.querySelectorAll("[data-recovery-action]").forEach((button) => {
    button.addEventListener("click", () => { runRecoveryAction(button.dataset.recoveryAction); });
  });
  app.querySelectorAll("[data-pending-diagnose]").forEach((button) => {
    button.addEventListener("click", () => { runPendingDiagnose(); });
  });
  // Offen-Zustand des Recovery-Panels an das manuelle Auf-/Zuklappen koppeln, damit er
  // über Re-Renders erhalten bleibt (verhindert das Zuklappen/„Springen" bei jeder Aktion).
  const recDetails = app.querySelector("#admin-recovery details.admin-details");
  if (recDetails) recDetails.addEventListener("toggle", () => { adminRecoveryDetailsOpen = recDetails.open; });

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
      if (vsheetEl) closeVorgangSheet(true); // Detail-Sheet bei Navigation schließen
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

  // Radar-Interaktionen (Segmente, Filter, Alle-anzeigen, Refresh) — scoped auf
  // #radar2-root, aktualisiert partiell ohne Ganzseiten-Rebuild (kein Scroll-Sprung).
  bindRadarActions();

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

  // Deck-Entscheidung: ausschließlich über die drei runden Buttons. Swipe entscheidet
  // NIE (keine versehentlichen Entscheidungen). Ruhige Erledigen-Geste + Auto-Advance
  // via patchCarousel (kein globales render bis zum State-Wechsel).
  app.querySelectorAll("[data-deck-decide]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.deckDecide;
      const action = button.dataset.deckAction || "watch";
      const card = helmutDeck.find((entry) => entry.id === id);
      if (!card || helmutDeckLeavingId) return;
      const labelMap = { ignore: "Ignoriert", draft: "Entwurf erstellen", watch: "Beobachten" };
      const logMap = { ignore: "ignored", draft: "draft", watch: "watch" };
      if (action === "draft" && !previewMode) {
        fetchWithTimeout(`/api/tasks?${apiScopeQuery()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: card.title,
            description: compactText(chiefRecommendationText(card), 220),
            priority: "high",
            assignee: "Büro",
            status: "open"
          })
        }).then((res) => (res && res.ok ? res.json() : null))
          .then((data) => { if (data && data.task) tasks = [data.task, ...tasks]; })
          .catch(() => {});
      }
      card.status = action === "ignore" ? "ignored" : action === "draft" ? "drafting" : "watching";
      if (!helmutDecidedIds.has(id)) { helmutDecidedIds.add(id); helmutDecisionsMade += 1; }
      helmutLastDecision = { title: card.title, actionLabel: labelMap[action] || "Beobachten", time: helmutNowHHMM() };
      logDecisionInteraction(logMap[action] || "watch", card);
      helmutDeckLeavingId = id;
      patchCarousel();
      window.setTimeout(() => {
        helmutDeckLeavingId = "";
        helmutCarouselIndex = Math.min(Math.max(0, helmutDeck.length - 1), helmutCarouselIndex + 1);
        render();
      }, 280);
    });
  });

  app.querySelectorAll("[data-helmut-howto-dismiss]").forEach((button) => {
    button.addEventListener("click", () => {
      try { localStorage.setItem("helmut:howtoSeen", "1"); } catch { /* Speicher gesperrt */ }
      helmutHowtoForceOpen = false;
      render();
    });
  });

  app.querySelectorAll("[data-helmut-howto-show]").forEach((button) => {
    button.addEventListener("click", () => {
      helmutHowtoForceOpen = true;
      render();
    });
  });

  app.querySelectorAll("[data-helmut-jump]").forEach((button) => {
    button.addEventListener("click", () => helmutJumpToBucket(button.dataset.helmutJump));
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
      const cachedValue = officeDrafts[key];
      const cachedText = officeDraftText(cachedValue);
      const hasValidCached = isValidDraft(cachedText);
      const text = (hasValidCached ? cachedText : null) || channelFallbackStatement(
        decisions.find((d) => d.id === decision.id || d.signalId === decision.signalId) || decision,
        resolvedFormat.channel || "press"
      );
      // Herkunft mitgeben, damit die Detailansicht ehrlich kennzeichnet.
      selectedOfficeDraft = {
        decision, format: resolvedFormat, text,
        provenance: draftProvenanceLabel(officeDraftProvenance(cachedValue), hasValidCached)
      };
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

  bindDetailOpen(app);

  app.querySelectorAll("[data-vorgang]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedVorgangId = button.dataset.vorgang;
      detailOriginView = (currentView === "vorgang") ? detailOriginView : currentView;
      currentView = "vorgang";
      navOpen = false;
      updatesOpen = false;
      render();
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  });

  bindCarousel();
  bindLageCarousel();

  app.querySelectorAll("[data-communication]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDecisionId = button.dataset.communication;
      selectedCommunicationChannel = recommendedInitialChannel(selectedDecision());
      communicationContextTitle = "";
      generatedStatement = selectedDecision().statement;
      generatedStatementSource = "";
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
      generatedStatementSource = "regel";
      currentView = "communication";
      render();
    });
  });

  app.querySelectorAll("[data-channel]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCommunicationChannel = button.dataset.channel || "press";
      generatedStatement = channelFallbackStatement(selectedDecision(), selectedCommunicationChannel);
      generatedStatementSource = "regel";
      render();
    });
  });

  app.querySelectorAll("[data-use-variant]").forEach((button) => {
    button.addEventListener("click", () => {
      generatedStatement = button.dataset.variantText || generatedStatement;
      generatedStatementSource = "regel";
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
        // PRODUKTWAHRHEIT (Audit-Fix 2026-07): regelbasierte Fallbacks nie als
        // erfolgreichen KI-Entwurf melden — der Nutzer könnte einen generischen
        // Platzhaltertext sonst ungeprüft veröffentlichen.
        generatedStatementSource = result.aiEnabled ? "ki" : "regel";
        showToast(result.aiEnabled
          ? `KI-Entwurf erstellt: ${result.channelLabel || "Text"}`
          : "KI nicht verfügbar — regelbasierter Entwurf eingesetzt");
      } catch (error) {
        console.error(error);
        generatedStatement = generateStatement(input, selectedDecision(), selectedCommunicationChannel);
        generatedStatementSource = "fehler";
        showToast("KI nicht erreichbar — regelbasierter Entwurf eingesetzt");
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
  // Läuft gerade ein Refresh (oder dessen Abschluss)? Dann NICHT die Intro-Denk-
  // animation starten — sonst würde ihr 1,4-s-Timer helmutThinking abschalten und
  // den sichtbaren Refresh-Screen beim Zurückwechseln überschreiben. Kein zweiter
  // Pipeline-Lauf, nur der bestehende Zustand bleibt erhalten.
  if (pipelineRunning || pipelinePhase) return;
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
    // Nach dem ruhigen Intro-Ring direkt den V3-Stand zeigen (KEINE Typing-Animation
    // mit berechneten Ersatztexten mehr — der Stand kommt rein aus currentHelmutState).
    if (currentView === "helmut") render();
  }, 1400);
}

// V3-korrekte Schritte: der Refresh startet runSourceCrawl (Crawl -> Understanding ->
// Matching -> Decision). KEINE V2-Aussagen ("Briefing wird generiert" / "Einschätzung
// wird verfasst") — in V3 wird das Briefing/die Einschätzung deterministisch beim
// Read zusammengebaut, nicht serverseitig neu verfasst.
const PIPELINE_STEPS = [
  "Quellen werden geprüft",
  "Neue Vorgänge werden erkannt",
  "Relevanz für dein Mandat wird bewertet",
  "Lage und Empfehlungen werden aktualisiert",
  "Aktueller Stand wird geladen",
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
  if (pipelineCompletionTimer) { window.clearTimeout(pipelineCompletionTimer); pipelineCompletionTimer = null; }
  pipelineRunning = true;
  pipelinePhase = "running";
  pipelineRunStep = 0;
  helmutThinking = true;
  markPipelineRun();
  stopHelmutTyping();
  animateNextRender = true; // Refresh-Screen einmal sanft einblenden
  render();
  schedulePipelineStep();
  executePipelineRun();
}

function schedulePipelineStep() {
  if (pipelineStepTimer) window.clearTimeout(pipelineStepTimer);
  pipelineStepTimer = window.setTimeout(() => {
    if (!pipelineRunning) return;
    pipelineRunStep = Math.min(pipelineRunStep + 1, PIPELINE_STEPS.length - 1);
    updatePipelineProgress();
    if (pipelineRunStep < PIPELINE_STEPS.length - 1) schedulePipelineStep();
  }, PIPELINE_STEP_MS);
}

// Fortschritt IN PLACE aktualisieren (nur Statuszeile + Balken) statt render() —
// so wird der Refresh-Screen nicht bei jedem Schritt neu gemountet und blendet
// nicht wiederholt ein. Fallback auf render(), falls der Screen (noch) nicht da ist.
function updatePipelineProgress() {
  // Im Hintergrund (anderer Tab) nur den Schritt-State fortschreiben, NICHT rendern —
  // beim Zurückwechseln zeigt render() den Refresh-Screen am aktuellen Schritt.
  if (currentView !== "helmut") return;
  const stepEl = app && app.querySelector(".helmut-refresh-step");
  const fillEl = app && app.querySelector(".helmut-refresh-fill");
  if (!stepEl || !fillEl) { render(); return; }
  stepEl.textContent = PIPELINE_STEPS[pipelineRunStep] || PIPELINE_STEPS[PIPELINE_STEPS.length - 1];
  const pct = Math.round(((pipelineRunStep + 1) / PIPELINE_STEPS.length) * 100);
  fillEl.style.width = pct + "%";
  const track = app.querySelector(".helmut-refresh-track");
  if (track) track.setAttribute("aria-valuenow", String(pct));
}

async function executePipelineRun() {
  try {
    const response = await fetchWithTimeout(`/api/pipeline/run?${apiScopeQuery()}`, {}, 90000);
    const result = response.ok ? await response.json() : null;
    // Ehrlich: hat der Server den Lauf übersprungen (Throttle/Lock), NICHT so tun,
    // als wären Quellen gecrawlt und KI-Analyse gelaufen -> ruhige "Stand ist aktuell"-Meldung.
    await finishPipelineRun(result && result.skippedReason ? "skipped" : "done");
  } catch {
    await finishPipelineRun("done", { reload: true });
  }
}

async function finishPipelineRun(phase, opts = {}) {
  pipelineRunning = false;
  pipelineRunStep = 0;
  if (pipelineStepTimer) { window.clearTimeout(pipelineStepTimer); pipelineStepTimer = null; }
  pipelinePhase = phase === "skipped" ? "skipped" : "done";
  animateNextRender = true;   // Abschlusskarte EINMAL sanft einblenden
  render(); // ruhige Abschlussmeldung anzeigen (kein Toast, keine Debug-Liste)
  // loadBriefing kann mehrfach rendern (Cache + Netz) — während der Abschluss sichtbar
  // ist, bleiben diese Renders bewusst ruhig (kein erneutes Aufpoppen der Abschlusskarte).
  try { await loadBriefing(); } catch (_) { /* Anzeige bleibt beim letzten Stand */ }
  // Bei Netzfehler kann der Serverlauf noch nachlaufen -> spät nochmal frisch rendern (ruhig).
  if (opts.reload) window.setTimeout(async () => { try { await loadBriefing(); } catch (_) {} if (currentView === "helmut") render(); }, 20000);
  if (pipelineCompletionTimer) window.clearTimeout(pipelineCompletionTimer);
  const holdMs = pipelinePhase === "skipped" ? 1400 : 1700;
  pipelineCompletionTimer = window.setTimeout(() => {
    pipelinePhase = null;
    helmutThinking = false;
    pipelineCompletionTimer = null;
    animateNextRender = true; // Helmut-Inhalt genau EINMAL weich einblenden, danach ruhig
    if (currentView === "helmut") render();
  }, holdMs);
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
    parliamentType: data.get("parliamentType"),
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
    // Onboarding-Freigabe (Audit-Fix 2026-07): fehlende Pflichtangaben werden
    // beim Speichern MITGETEILT statt still ignoriert.
    const val = profile && profile.profilValidierung;
    if (val && val.state === "vollstaendig") {
      showToast("Profil gespeichert — vollständig und einsatzbereit");
    } else if (val && Array.isArray(val.missingRequiredLabels) && val.missingRequiredLabels.length) {
      showToast(`Gespeichert — noch offen: ${val.missingRequiredLabels.slice(0, 3).join(", ")}`);
    } else {
      showToast("Profil gespeichert");
    }
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
    press: "Länger, für Presse oder Website. Vor Veröffentlichung prüfen.",
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

// Entwürfe tragen ihre Herkunft (Audit-Fix 2026-07, Produktwahrheit): "ki" =
// echter KI-Entwurf, "regel" = regelbasierter Fallback (KI nicht verfügbar/
// unbrauchbar). Ältere Tagescaches enthalten nackte Strings ohne Herkunft —
// beide Formen werden gelesen, geschrieben wird nur noch das Objektformat.
function officeDraftText(value) {
  if (typeof value === "string") return value;
  return String((value && value.text) || "");
}
function officeDraftProvenance(value) {
  if (value && typeof value === "object" && (value.source === "ki" || value.source === "regel")) return value.source;
  return ""; // Legacy-Cache oder unbekannt: nichts behaupten
}
// Einheitliche, ehrliche Herkunftszeile für Karten, Detail und Kommunikations-View.
function draftProvenanceLabel(source, hasValidDraft) {
  if (!hasValidDraft) return "Regelbasierter Vorschlag · kein KI-Entwurf";
  if (source === "ki") return "KI-Entwurf · vor Veröffentlichung prüfen";
  if (source === "regel") return "Regelbasierter Entwurf · KI war nicht verfügbar";
  return "Entwurf · vor Veröffentlichung prüfen";
}

async function generateOfficeDraftsInBackground() {
  if (officeDraftsGenerating) return;
  const formats = activeOfficeFormats();
  const topDecisions = (decisions || []).filter((d) => d.decision !== "Ignorieren" && d.title).slice(0, 2);
  if (!formats.length || !topDecisions.length) return;

  const cacheKey = officeDraftCacheKey();
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    // Cache übernehmen, aber NICHT früh zurückkehren (Audit-Fix 2026-07):
    // Ein Teilerfolg (einzelne Calls fehlgeschlagen) fror früher den ganzen Tag
    // ein — fehlende Entwürfe wurden bis zum nächsten Tag NIE nachgeneriert.
    // Jetzt werden nur die noch fehlenden Keys erzeugt (unten: continue bei
    // vorhandenem gültigem Entwurf) — auch neu aktivierte Formate erscheinen so.
    if (cached && typeof cached === "object") officeDrafts = { ...cached, ...officeDrafts };
  } catch (_) { /* ignore parse error */ }

  const missing = [];
  for (const decision of topDecisions) {
    for (const format of formats) {
      const key = officeDraftKey(decision, format);
      if (isValidDraft(officeDraftText(officeDrafts[key]))) continue;
      missing.push({ decision, format, key });
    }
  }
  if (!missing.length) { render(); return; }

  // KOSTENSCHUTZ (Audit-Fix 2026-07): harte Obergrenze pro App-Start. Früher
  // konnten 2 Anlässe × 8 Formate = 16 LLM-Calls pro Gerät und Öffnen anfallen.
  // Jetzt maximal 6 pro Lauf — der Rest wird beim nächsten App-Start nachgeholt
  // (serverseitig deckelt zusätzlich das Tages-/Mandanten-Budget in ai.js).
  const OFFICE_DRAFTS_MAX_CALLS_PER_RUN = 6;
  const batch = missing.slice(0, OFFICE_DRAFTS_MAX_CALLS_PER_RUN);

  officeDraftsGenerating = true;
  render();

  for (const { decision, format, key } of batch) {
    try {
      const result = await generateStatementWithBackend(
        `Bereite einen ${format.label}-Entwurf vor zum Thema: ${decision.title}`,
        decision,
        format.channel || "press"
      );
      // Herkunft speichern: der Server kennzeichnet regelbasierte Fallbacks
      // ehrlich (aiEnabled=false) — das darf im UI nie als KI-Entwurf erscheinen.
      officeDrafts[key] = { text: result.text, source: result.aiEnabled ? "ki" : "regel" };
      delete officeDraftErrors[key];
      render();
    } catch (_) {
      // Ehrlicher Fehlerzustand statt stillem Fallback (Status "Erstellung
      // fehlgeschlagen"); beim nächsten App-Start wird erneut versucht.
      officeDraftErrors[key] = true;
    }
  }

  officeDraftsGenerating = false;
  render();
  // Nur erfolgreiche Entwürfe cachen — fehlende Keys bleiben offen und werden
  // beim nächsten Lauf nachgeneriert (kein eingefrorener Teilerfolg mehr).
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
  if (!benefit) return "Wir brauchen eine schnelle Einschätzung, ob du dazu heute sprechfähig sein solltest.";
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
    "Warum betrifft das deinen Ausschuss oder dein Profil?",
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
      ${sources.slice(0, 12).map((source) => {
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
  // Wie die Schwesterfunktionen (formatBriefingDate/-DeadlineDate): NIE ein rohes
  // "Invalid Date" ausliefern. Diese Ausgabe landet in kopierbaren Büro-Texten und
  // E-Mails ("Bitte bis ${formatDueDate(...)} ..."), wo ein fehlendes/ungültiges
  // Fälligkeitsdatum sonst als "Invalid Date" beim Pilotnutzer sichtbar würde.
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "zeitnah";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(date);
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
  // 1) Moderne Clipboard-API. 2) execCommand-Fallback (ältere/unsichere Kontexte,
  // abgelehnte Permission). Nur bei WIRKLICHEM Erfolg "Kopiert" melden — sonst
  // eine ehrliche Fehlermeldung statt eines falschen Erfolgs.
  try {
    await navigator.clipboard.writeText(text);
    showToast("Kopiert");
    return true;
  } catch (_) { /* Fallback versuchen */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = String(text);
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) { showToast("Kopiert"); return true; }
  } catch (_) { /* endgültig fehlgeschlagen */ }
  showToast(fallbackMessage || "Kopieren nicht möglich – bitte manuell markieren.");
  return false;
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

// SICHERHEIT: nur echte http(s)-URLs durchlassen, bevor ein Wert in href/src landet —
// HTML-Escaping allein verhindert kein "javascript:"/"data:"-URI in einem Attribut.
function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
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
