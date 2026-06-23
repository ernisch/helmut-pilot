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
let opsStatusLoaded = false;
let selectedDecisionId = "";
let currentView = "briefing";
let detailOriginView = "briefing";
let navOpen = false;
let updatesOpen = false;
let generatedStatement = "";
let communicationContextTitle = "";
let selectedCommunicationChannel = "press";
let berlinClockTimer = null;
const updateSeenStorageKey = "helmut:lastSeenUpdatesAt";
let activePoliticianId = "cem-ince";
let previewMode = false;

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const navItems = [
  ["briefing", "Heute"],
  ["radar", "Radar"],
  ["office", "Büro"],
  ["settings", "Profil"]
];

const mobileNavItems = [
  ["briefing", "Heute"],
  ["radar", "Radar"],
  ["office", "Büro"],
  ["settings", "Profil"]
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
  const scope = apiScopeQuery();
  const startResponse = await fetchWithTimeout(`/api/app/start?${scope}`);

  if (!startResponse.ok) throw new Error(`Helmut konnte nicht gestartet werden (${startResponse.status})`);
  const startPayload = await startResponse.json();
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
  const situationalItems = (briefing.situationalBriefing || []).map(situationalToDecisionItem).filter(hasPreciseSource);
  decisions = (personalizedItems.length ? personalizedItems : (activeItems.length ? activeItems : (briefing.items.length ? briefing.items.slice(0, 1) : situationalItems)))
    .filter(hasPreciseSource)
    .sort((a, b) => {
      if (a.signalId === themeSignalId) return -1;
      if (b.signalId === themeSignalId) return 1;
      return b.priority - a.priority;
    })
    .slice(0, 3)
    .map(toDecision);

  selectedDecisionId = decisions[0]?.id || "";
  generatedStatement = decisions[0]?.statement || "";
  render();
}

async function ensureViewData(view) {
  if (view === "radar" && !radarArchiveLoaded) {
    radarArchiveLoaded = true;
    try {
      const response = await fetchWithTimeout(`/api/radar/archive?${apiScopeQuery()}&days=92`);
      const archivePayload = response.ok ? await response.json() : { articles: [] };
      radarArchive = Array.isArray(archivePayload.articles) ? archivePayload.articles : [];
    } catch (error) {
      radarArchiveLoaded = false;
      console.warn("Radar archive not loaded", error);
    }
    render();
  }
  if ((view === "settings" || view === "profile-settings") && !opsStatusLoaded) {
    opsStatusLoaded = true;
    try {
      const response = await fetchWithTimeout(`/api/ops/status?${apiScopeQuery()}`);
      opsStatus = response.ok ? await response.json() : null;
    } catch (error) {
      opsStatusLoaded = false;
      console.warn("Ops status not loaded", error);
    }
    render();
  }
}

function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`Zeitüberschreitung beim Laden: ${url}`)), timeoutMs);
  });
  return Promise.race([fetch(url, options), timeout]).finally(() => window.clearTimeout(timeoutId));
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
    personal_relevance_explanation: recommendation.personal_relevance_explanation,
    consequence_if_ignored: recommendation.consequence_if_ignored,
    possible_upside: recommendation.possible_upside,
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
    </div>
  `;
  bindActions();
  updateBerlinClock();
  startBerlinClock();
  hideStartupSplash();
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
  return `
    <aside class="sidebar ${navOpen ? "open" : ""}">
      <div>
        <div class="brand">
          <img src="assets/helmut-mark.svg" alt="" />
          <span>HELMUT</span>
          <small>Politischer Referent</small>
        </div>
        <nav class="nav-list" aria-label="Hauptnavigation">
          ${navItems.map(([id, label]) => `<button class="${isMobileNavActive(id) ? "active" : ""}" type="button" data-view="${id}">${label}</button>`).join("")}
        </nav>
      </div>
      <div class="sidebar-foot">
        <p>${escapeHtml(profile?.fullName || "Cem Ince")}<br><span>${escapeHtml(profile?.function || "MdB")}</span></p>
      </div>
    </aside>
  `;
}

function renderMobileDock() {
  return `
    <nav class="mobile-dock" aria-label="Mobile Navigation">
      ${mobileNavItems.map(([id, label]) => `
        <button class="${isMobileNavActive(id) ? "active" : ""}" type="button" data-view="${id}">
          <span>${escapeHtml(mobileNavSymbol(id))}</span>
          ${escapeHtml(label)}
        </button>
      `).join("")}
    </nav>
  `;
}

function isMobileNavActive(id) {
  if (currentView === "detail") return (detailOriginView || "briefing") === id;
  if (id === "briefing") return currentView === "briefing";
  if (id === "office") return currentView === "office" || currentView === "communication" || currentView === "tasks";
  if (id === "settings") return currentView === "settings" || currentView === "profile-settings";
  return currentView === id;
}

function mobileNavSymbol(id) {
  return ({ briefing: "H", radar: "R", office: "B", settings: "P" })[id] || "•";
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
  if (currentView === "topics") return renderTopicsView();
  if (currentView === "radar") return renderRadarView();
  if (currentView === "profile-settings") return renderProfileSettingsView();
  if (currentView === "settings") return renderSettingsView();
  return renderBriefingView();
}

function renderBriefingView() {
  return `
    <section class="page-intro executive-intro agenda-intro">
      <h1 class="hero-title">${escapeHtml(timeGreeting((profile?.fullName || "Cem").split(" ")[0]).replace(",", ","))}</h1>
      <p>${escapeHtml(currentAgendaLead())}</p>
    </section>

    ${renderDailyAgendaAnswer()}
    ${renderTodayImportantSection()}
    ${renderMeetingPrepSection()}
    ${renderReactionChanceSection()}
    ${!decisions.length ? renderSituationalBriefing() : ""}
  `;
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
        <button class="secondary-button" type="button" data-communication="${escapeHtml(top.id)}">Reaktion vorbereiten</button>
      </div>
    </section>
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
        ${items.map(renderAgendaPriority).join("") || `<p class="empty-state">Heute liegt keine priorisierte politische Entscheidung vor.</p>`}
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
      <button class="secondary-button compact-button" type="button" data-communication="${escapeHtml(decision.id)}">Reaktion vorbereiten</button>
    </article>
  `;
}

function renderMeetingPrepSection() {
  const meetings = meetingPreparations().slice(0, 2);
  return `
    <section class="agenda-section meeting-prep">
      <div class="agenda-section-head">
        <span>B</span>
        <h2>Termine vorbereiten</h2>
      </div>
      <div class="agenda-list">
        ${meetings.map(renderMeetingPrepCard).join("") || `<p class="empty-state">Noch keine Termine im Mandatsprofil. Trage im Profil kommende Gespräche ein, dann bereitet Helmut sie politisch vor.</p>`}
      </div>
    </section>
  `;
}

function renderMeetingPrepCard(meeting) {
  return `
    <article class="meeting-card">
      <div>
        <span>${escapeHtml(formatMeetingDate(meeting))}</span>
        <h3>${escapeHtml(meeting.terminTitel)}</h3>
        <p>${escapeHtml(compactText(meeting.kurzbriefing, 160))}</p>
        <p><b>Gesprächspunkte:</b> ${escapeHtml(compactText(meeting.empfohleneGespraechspunkte.slice(0, 2).join(" · "), 150))}</p>
      </div>
      <div class="meeting-actions">
        <button class="secondary-button compact-button" type="button" data-meeting-brief="${escapeHtml(meeting.id)}">Briefing vorbereiten</button>
        <button class="secondary-button compact-button" type="button" data-meeting-questions="${escapeHtml(meeting.id)}">Fragen vorbereiten</button>
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
  const profileAppointments = asTextList(profile?.upcomingAppointments).map(parseAppointmentText);
  const fallback = fallbackMeetings();
  return (profileAppointments.length ? profileAppointments : fallback)
    .map((meeting, index) => prepareMeeting(meeting, index))
    .sort((a, b) => new Date(a.datum || 0) - new Date(b.datum || 0));
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

function fallbackMeetings() {
  return [
    {
      id: "meeting-gewerkschaft",
      terminTitel: "Treffen mit Gewerkschaft",
      datum: nextWeekdayIso(1),
      uhrzeit: "09:30",
      teilnehmer: "Gewerkschaftssekretärinnen und Betriebsräte",
      organisation: "Gewerkschaft",
      thema: "Tarifbindung, Mindestlohn, gute Arbeit",
      notizenVomBüro: "Gesprächspunkte zu Tariftreue und Kontrollen vorbereiten."
    },
    {
      id: "meeting-sozialverband",
      terminTitel: "Gespräch mit Sozialverband",
      datum: nextWeekdayIso(2),
      uhrzeit: "14:00",
      teilnehmer: "Sozialverband",
      organisation: "Sozialverband",
      thema: "Bürgergeld, Armut, Rente",
      notizenVomBüro: "Aktuelle Regierungslinie und soziale Auswirkungen einordnen."
    },
    {
      id: "meeting-ausschuss-arbeit-soziales",
      terminTitel: "Ausschusssitzung Arbeit und Soziales",
      datum: nextWeekdayIso(3),
      uhrzeit: "11:00",
      teilnehmer: "Ausschussmitglieder",
      organisation: "Bundestag",
      thema: "Pläne der Bundesregierung im Bereich Arbeit und Soziales",
      notizenVomBüro: "Fragen an Bundesregierung vorbereiten."
    }
  ];
}

function prepareMeeting(input, index = 0) {
  const topic = input.thema || input.terminTitel || "den Termin";
  const sourceDecision = decisions.find((decision) => textHasTopic(decision, topic)) || decisions[0] || {};
  const context = sourceDecision.title ? `Aktuelle Lage: ${sourceDecision.title}. ${sourceDecision.summary || ""}` : "Aktuelle Lage aus Mandatsprofil und laufenden Quellen prüfen.";
  const committee = profile?.committee || profile?.committees?.[0] || "Arbeit und Soziales";
  return {
    ...input,
    id: input.id || `meeting-${index}-${slugify(input.terminTitel || topic)}`,
    kurzbriefing: `Dieser Termin ist relevant, weil er direkt an deinen Ausschuss ${committee} und deine Schwerpunkte ${topProfileTopicsForView().slice(0, 3).join(", ")} anschließt.`,
    politischerKontext: context,
    aktuelleLage: context,
    moeglicheInteressenDerGegenseite: opponentInterestForMeeting(input),
    empfohleneGespraechspunkte: meetingTalkingPoints(input, sourceDecision),
    kritischeFragen: meetingCriticalQuestions(input, sourceDecision),
    chancen: meetingChances(input, sourceDecision),
    risiken: meetingRisks(input, sourceDecision),
    moeglicheAnschlussaktion: `Nach dem Termin kurze Linie festhalten: Was kann Cem öffentlich aufgreifen, was geht ans Büro, was bleibt intern?`,
    optionalRedeentwurf: `Redeimpuls: Gute Arbeit und soziale Sicherheit müssen im Alltag der Menschen ankommen. Genau daran messen wir politische Vorhaben.`,
    optionalSocialStatement: `${topic}: Entscheidend ist, dass soziale Politik konkret wirkt - bei Arbeit, Sicherheit und Respekt im Alltag.`,
    optionalPressezitat: `Wir müssen die Bundesregierung daran messen, ob ihre Vorhaben für Beschäftigte und Menschen mit niedrigen Einkommen konkret besser werden.`
  };
}

function meetingDraftText(meeting, type = "briefing") {
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
    meeting.kurzbriefing,
    "",
    `Politischer Kontext: ${meeting.politischerKontext}`,
    "",
    "Gesprächspunkte:",
    ...meeting.empfohleneGespraechspunkte.map((point) => `- ${point}`),
    "",
    `Chance: ${meeting.chancen[0]}`,
    `Risiko: ${meeting.risiken[0]}`,
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
  const firstName = (profile?.fullName || "Cem").split(" ")[0];
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
  return `${greeting} Ich habe die politische Lage geprüft. Wichtigstes Thema für dich ist heute ${top.title}. ${mentionSentence} ${riskSentence} ${officeCount ? `${officeCount} Auftrag kannst du direkt ans Büro geben.` : "Du musst heute nichts unnötig delegieren."}`;
}

function agentFacts() {
  const sourceStats = briefing.sourceStats || {};
  const checked = Number(sourceStats.checkedSources || 0);
  const successful = Number(sourceStats.successfulSources || 0);
  return [
    `${decisions.length} Entscheidungen`,
    `${freshMentionCount()} neue Erwähnungen`,
    `${openOfficeTaskCount()} Büroaufträge`,
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
        ${taskId ? `<button class="secondary-button" type="button" data-task-copy="${escapeHtml(taskId)}">Ans Büro geben</button>` : ""}
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
  if (!items.length) {
    return "Ich habe die Quellen geprüft. Für dich liegt gerade keine belastbare Lage vor, auf die du politisch reagieren solltest.";
  }
  const names = items.map((item) => item.title || item.sourceName || "eine Entwicklung").slice(0, 3);
  return `Ich habe die Quellen geprüft. Du musst jetzt nichts veröffentlichen; ich beobachte ${humanList(names)} weiter.`;
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
          ${decision.taskTemplate?.id ? `<button class="secondary-button" type="button" data-task-copy="${escapeHtml(decision.taskTemplate.id)}">Ans Büro geben</button>` : ""}
        </div>
        <div class="learning-actions" aria-label="Helmut trainieren">
          <button type="button" data-feedback="important" data-feedback-id="${escapeHtml(decision.id)}">Mehr davon</button>
          <button type="button" data-feedback="ignored" data-feedback-id="${escapeHtml(decision.id)}">Nicht relevant</button>
        </div>
      </section>
      ${renderSourceBasis(decision)}
    </article>
  `;
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

function renderOfficeView() {
  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Büro.")}">Büro.</h1>
      <p>Was dein Büro dir heute abnehmen kann.</p>
    </section>
    ${renderOfficeTasksSection()}
  `;
}

function renderOfficeTasksSection() {
  const officeTasks = tasks.filter((task) => isActionableOfficeTask(task) && taskArticleSource(task)).slice(0, 3);
  return `
    <section class="plain-list">
      <h2>An dein Büro geben</h2>
      <p class="section-note">Nur konkrete Übergaben. Maximal drei Dinge, die jemand vorbereiten kann.</p>
      ${officeTasks.map(renderTaskRow).join("") || `
        <article class="list-row office-empty">
          <div>
            <span>Kein Auftrag offen</span>
            <h3>Heute musst du nichts ans Büro geben.</h3>
            <p>Helmut zeigt hier nur etwas, wenn dein Büro konkret vorbereiten sollte.</p>
          </div>
        </article>
      `}
    </section>
  `;
}

function renderTaskRow(task) {
  const articleSource = taskArticleSource(task);
  const sourceUrl = articleSource?.url || "";
  const assignee = task.assignee || recommendedTaskAssignee(task);
  return `
    <article class="list-row office-task ${priorityClass(task.priority)}">
      <div class="office-task-main">
        <span>${escapeHtml(taskPriorityLabel(task.priority))} · bis ${escapeHtml(formatDueDate(task.dueDate))}</span>
        <h3>${escapeHtml(shortTaskTitle(task))}</h3>
        <p>${escapeHtml(officeTaskRequest(task))}</p>
        <small>${escapeHtml(assignee)} · Ziel: ${escapeHtml(teamBenefitText(task))}</small>
      </div>
      <div class="task-actions">
        ${sourceUrl ? `<a class="secondary-button compact-button" href="${escapeAttribute(sourceUrl)}" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>` : ""}
        <button class="primary-button compact-button" type="button" data-task-copy="${escapeHtml(task.id)}">Übergabe kopieren</button>
      </div>
    </article>
  `;
}

function officeTaskRequest(task) {
  const questions = taskBriefQuestions(task).slice(0, 2);
  if (questions.length) return `Kläre kurz: ${questions.join(" ")} Danach einschätzen, ob wir heute reagieren sollten.`;
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
  const variants = [
    ["Social Media", channelFallbackStatement(decision, "linkedin")],
    ["Pressezitat", channelFallbackStatement(decision, "press")],
    ["Ausschuss / Plenum", channelFallbackStatement(decision, "committee_question")]
  ];
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
  const allMentions = profileMentions();
  const freshMentions = allMentions.filter(isFreshUpdate).slice(0, 4);
  const freshKeys = new Set(freshMentions.map(mentionKey));
  const importantArticles = profileArticleArchive(allMentions)
    .filter((item) => !freshKeys.has(mentionKey(item)) && isImportantProfileArticle(item))
    .slice(0, 5);
  const importantKeys = new Set(importantArticles.map(mentionKey));
  const previousMentions = archivedProfileMentions(allMentions, freshMentions)
    .filter((item) => !importantKeys.has(mentionKey(item)) && !isArchivedLowSignal(item))
    .slice(0, 6);
  const archivedLow = profileArticleArchive(allMentions)
    .filter((item) => !freshKeys.has(mentionKey(item)) && !importantKeys.has(mentionKey(item)) && isArchivedLowSignal(item))
    .slice(0, 6);
  const storedArchiveArticles = radarArchive.length ? radarArchive : profileArticleArchive(allMentions);
  const lastThreeMonthsArticles = storedArchiveArticles
    .filter(isWithinLastThreeMonths)
    .filter(hasPreciseSource)
    .filter(uniqueMentionItem)
    .sort(sortNewestFirst)
    .slice(0, 12);
  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Radar.")}">Radar.</h1>
      <p>Was über dich gefunden wurde. Chancen und Risiken bleiben im Briefing.</p>
    </section>

    <section class="radar-groups">
      ${renderRadarGroup("Heute neu über dich", freshMentions.length, mentionRows(freshMentions), true)}
      ${renderRadarGroup("Wichtige Artikel über dich", importantArticles.length, `<p class="section-note">Treffer mit politischer oder medialer Relevanz, die du wiederfinden können solltest.</p>${mentionRows(importantArticles, { empty: false })}`, false)}
      ${renderRadarGroup("Bisherige Erwähnungen", previousMentions.length, `<p class="section-note">Ältere namentliche Treffer ohne akuten Handlungsdruck.</p>${mentionRows(previousMentions, { empty: false })}`, false)}
      ${renderRadarGroup("Irrelevant / Archiviert", archivedLow.length, `<p class="section-note">Treffer, die Helmut bewusst nicht in deine Entscheidungslage hebt.</p>${mentionRows(archivedLow, { empty: false })}`, false)}
      ${renderRadarGroup("Artikel der letzten 3 Monate", lastThreeMonthsArticles.length, `<p class="section-note">Alle direkt verlinkten Artikel aus dem gespeicherten Quellenarchiv, in denen du erwähnt wirst oder als Autor auftauchst.</p>${mentionRows(lastThreeMonthsArticles, { empty: false }) || `<p class="empty-state">Noch keine direkt verlinkten Archivartikel gespeichert. Der nächste Quellenlauf sucht weiter nach präzisen Artikellinks.</p>`}`, false)}
    </section>
  `;
}

function renderRadarGroup(title, count, content, open = false) {
  return `
    <details class="radar-group" ${open ? "open" : ""}>
      <summary>
        <span>${escapeHtml(title)} (${count})</span>
        <i></i>
      </summary>
      <div class="radar-group-body">
        ${content || `<p class="empty-state">Keine Einträge.</p>`}
      </div>
    </details>
  `;
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
  const fullName = profile?.fullName || "Cem Ince";
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
      <article class="list-row empty-signal">
        <div>
          <span>Keine neuen Erwähnungen</span>
          <h3>Heute wurde keine frische namentliche Erwähnung gefunden.</h3>
          <p>Helmut prüft die Personensuche beim nächsten Quellenlauf erneut. Du kannst die Suche auch jetzt manuell starten.</p>
        </div>
        <button class="secondary-button" type="button" data-run-crawl>Personensuche prüfen</button>
      </article>
    `;
  }

  return items.map((item) => {
    const href = sourceHref(item);
    if (!href) return "";
    const label = sourceLinkLabel(item);
    return `
      <article class="list-row mention mention-row ${href ? "" : "no-link"}">
        ${mentionVisual(item)}
        <div class="mention-content">
          <div>
            <span>${escapeHtml(item.sourceName || "Quelle")}</span>
            <h3>${escapeHtml(item.title || "Erwähnung gefunden")}</h3>
            <p>${escapeHtml(twoSentenceSummary(item.content || item.excerpt || "Cem wurde in dieser Quelle erwähnt."))}</p>
            <small class="mention-timestamp">Gefunden: ${escapeHtml(formatMentionFoundAt(item))}</small>
          </div>
        </div>
        <a class="secondary-button mention-open" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>
      </article>
    `;
  }).join("");
}

function mentionVisual(item) {
  const imageUrl = item.imageUrl || publisherImageUrl(item);
  if (imageUrl) return `<img class="mention-image" src="${escapeAttribute(imageUrl)}" alt="" loading="lazy" />`;
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
    ["welt", "welt.de"],
    ["nd-aktuell", "nd-aktuell.de"],
    ["zdf", "zdf.de"],
    ["zeit", "zeit.de"],
    ["frankfurter rundschau", "fr.de"],
    ["süddeutsche", "sueddeutsche.de"],
    ["sz.de", "sueddeutsche.de"],
    ["spiegel", "spiegel.de"],
    ["saarbrücker zeitung", "saarbruecker-zeitung.de"],
    ["phoenix", "phoenix.de"]
  ];
  const match = known.find(([name]) => text.includes(name));
  return match ? match[1] : "";
}

function profileInitials() {
  return String(profile?.fullName || "Cem Ince")
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
  const sourceStats = briefing.sourceStats || {};
  const ops = opsStatus || {};
  const storage = ops.storage || {};
  const crawl = ops.crawl || sourceStats;
  const opsTone = ops.status === "Bereit" ? "low" : ops.status === "Prüfen" ? "medium" : "high";
  const latestCrawlText = crawl?.createdAt ? formatBriefingDate(crawl.createdAt) : "Noch kein Lauf";
  const systemStatus = opsStatusLoaded ? (ops.status || (storage.backend === "supabase" ? "Bereit" : "Prüfen")) : "Wird geprüft";
  const committee = profile.committee || profile.committees?.[0] || "Noch offen";
  const topTopics = topProfileTopicsForView();
  const channels = asTextList(profile.preferredChannels).length ? asTextList(profile.preferredChannels) : ["Presse", "LinkedIn", "Ausschuss"];
  const audiences = asTextList(profile.keyAudiences).length ? asTextList(profile.keyAudiences) : ["Arbeitnehmer", "Gewerkschaften", "soziale Verbände"];
  const noGos = asTextList(profile.noGoTopics);
  const risks = asTextList(profile.riskTopics).length ? asTextList(profile.riskTopics) : ["Themen ohne Quellenbasis", "unklare Angriffe", "zu frühe Positionierung ohne Anlass"];
  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Mandatsprofil.")}">Mandatsprofil.</h1>
      <p>So versteht Helmut dein Mandat, deine Themen und deine politische Linie.</p>
    </section>

    <section class="plain-list">
      <article class="list-row low">
        <div>
          <span>Profil</span>
          <h3>${escapeHtml(profile.fullName || "Cem Ince")}</h3>
          <p>${escapeHtml(profile.function || "Bundestagsabgeordneter")} · ${escapeHtml(profile.party || "Die Linke")} · ${escapeHtml(profile.faction || profile.party || "Fraktion offen")}</p>
        </div>
        <button class="secondary-button" type="button" data-view="profile-settings">Profil bearbeiten</button>
      </article>

      <article class="list-row">
        <div>
          <span>Ausschuss</span>
          <h3>${escapeHtml(committee)}</h3>
          <p>Helmut bewertet Themen höher, wenn sie in deinem Ausschuss, bei BMAS oder in Gesetzesvorhaben zu Arbeit und Sozialem auftauchen.</p>
        </div>
      </article>

      <article class="list-row">
        <div>
          <span>Prioritäten</span>
          <h3>${escapeHtml(topTopics.slice(0, 3).join(" · ") || "Noch nicht gesetzt")}</h3>
          <p>${escapeHtml(topTopics.slice(3, 8).join(" · ") || "Diese Themen steuern, was Helmut morgens prominent macht.")}</p>
        </div>
      </article>

      <article class="list-row">
        <div>
          <span>Leitfrage</span>
          <h3>Worauf sollst du politisch reagieren?</h3>
          <p>${escapeHtml(profile.mainQuestion || "Welche Pläne hat die Bundesregierung im Bereich Arbeit und Soziales und worauf sollte ich politisch reagieren?")}</p>
        </div>
      </article>

      <article class="list-row">
        <div>
          <span>Kommunikation</span>
          <h3>${escapeHtml(profile.communicationStyle || "Lösungsorientiert")}</h3>
          <p>Bevorzugte Kanäle: ${escapeHtml(channels.slice(0, 4).join(" · "))}</p>
        </div>
      </article>

      <article class="list-row">
        <div>
          <span>Zielgruppen</span>
          <h3>${escapeHtml(audiences.slice(0, 3).join(" · "))}</h3>
          <p>Helmut formuliert Empfehlungen so, dass politische Wirkung und Adressat zusammenpassen.</p>
        </div>
      </article>

      <article class="list-row medium">
        <div>
          <span>Risiko-Filter</span>
          <h3>${escapeHtml(risks.slice(0, 2).join(" · "))}</h3>
          <p>${escapeHtml(noGos.length ? `No-Go: ${noGos.slice(0, 3).join(" · ")}` : "Helmut soll nichts prominent machen, was keinen belastbaren Mandats- oder Quellenbezug hat.")}</p>
        </div>
      </article>

      <article class="list-row ${opsTone}">
        <div>
          <span>System</span>
          <h3>${escapeHtml(systemStatus)}</h3>
          <p>${escapeHtml(opsStatusLoaded ? profileSystemSummary(storage, crawl, latestCrawlText) : "Helmut lädt den Systemstatus erst, wenn du das Profil öffnest. Dadurch startet die Morgenlage schneller.")}</p>
        </div>
        <button class="secondary-button" type="button" data-run-crawl>System prüfen</button>
      </article>
    </section>
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

function profileSystemSummary(storage, crawl, latestCrawlText) {
  const backend = storage.backend === "supabase" ? "Supabase aktiv" : "lokaler Speicher";
  const checked = crawl?.checkedSources || briefing.sourceStats?.checkedSources || 0;
  const failed = crawl?.failedSources || briefing.sourceStats?.failedSources || 0;
  return `${backend}. ${checked} Quellen zuletzt geprüft, ${failed} Fehler. Letzter Lauf: ${latestCrawlText}.`;
}

function qualitySummary(quality) {
  if (!quality) return "Der nächste Briefinglauf prüft Handlung, Mandatsbezug, Quelle, Kommunikation und Aufgabe.";
  const base = `${quality.score || 0}% vollständig · ${quality.recommendationCount || 0} Empfehlungen geprüft.`;
  if (quality.issues?.length) return `${base} Offen: ${quality.issues[0]}`;
  return `${base} Alle Kernfragen sind abgedeckt.`;
}

function learningSummary(learning) {
  if (!learning || !learning.eventCount) return "Helmut lernt aus Öffnen, Ausblenden, Kopieren, Notizen und Büroaufträgen. Noch gibt es keine gespeicherten Nutzungssignale.";
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
          ${profileField("state", "Bundesland", profile.state)}
          ${profileField("constituency", "Wahlkreis", profile.constituency)}
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

function bindActions() {
  app.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view;
      navOpen = false;
      updatesOpen = false;
      render();
      ensureViewData(currentView);
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

  app.querySelectorAll("[data-meeting-brief], [data-meeting-speech], [data-meeting-questions]").forEach((button) => {
    button.addEventListener("click", () => {
      const meetingId = button.dataset.meetingBrief || button.dataset.meetingSpeech || button.dataset.meetingQuestions;
      const meeting = meetingPreparations().find((entry) => entry.id === meetingId);
      if (!meeting) return;
      selectedDecisionId = decisions[0]?.id || "";
      communicationContextTitle = meeting.terminTitel;
      selectedCommunicationChannel = button.dataset.meetingSpeech ? "internal_line" : button.dataset.meetingQuestions ? "committee_question" : "press";
      generatedStatement = meetingDraftText(meeting, button.dataset.meetingSpeech ? "speech" : button.dataset.meetingQuestions ? "questions" : "briefing");
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
      copyText(taskShareText(task), "Auftrag bereit");
      const decision = decisions.find((entry) => entry.signalId === task.sourceSignalId || entry.taskTemplate?.id === task.id);
      logDecisionInteraction("task_copied", decision, { taskId: task.id });
    });
  });

  app.querySelectorAll("[data-feedback]").forEach((button) => {
    button.addEventListener("click", async () => {
      const decision = decisions.find((entry) => entry.id === button.dataset.feedbackId);
      const type = button.dataset.feedback === "ignored" ? "ignored" : "marked_important";
      await logDecisionInteraction(type, decision);
      showToast(type === "ignored" ? "Helmut merkt: weniger wichtig" : "Helmut merkt: wichtiger");
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
        const response = await fetch(`/api/pipeline/run?${apiScopeQuery()}`);
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
        const response = await fetch(`/api/notes?${apiScopeQuery()}`, {
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
    upcomingAppointments: lines(data.get("upcomingAppointments")),
    noGoTopics: lines(data.get("noGoTopics"))
  };

  try {
    const response = await fetch(`/api/profile/current?${apiScopeQuery()}`, {
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

function lines(value) {
  return String(value || "").split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
}

function generateStatement(input, decision, channel = selectedCommunicationChannel) {
  return channelFallbackStatement(decision, channel);
}

async function generateStatementWithBackend(input, decision, channel = selectedCommunicationChannel) {
  const response = await fetch("/api/communication/generate", {
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
  return tasks.filter((task) => task.status !== "done").length;
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
    title: item.title || "Cem wurde erwähnt",
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
  if (["risk_detected", "reaction_recommended", "meeting_starts_soon"].includes(type)) return "risk";
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
    risk_detected: "Risiko erkannt"
  })[type] || "Update";
}

function priorityNotificationLabel(priority) {
  return ({ high: "Hohe Priorität", medium: "Mittlere Priorität", low: "Niedrige Priorität" })[priority] || "Priorität";
}

function taskShareText(task) {
  const articleSource = taskArticleSource(task);
  const sourceUrl = articleSource?.url || "";
  const sourceName = articleSource?.source?.sourceName || task.primarySource?.sourceName || "";
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
    `bitte prüft bis ${formatDueDate(task.dueDate)} kurz folgende Lage:`,
    "",
    shortTaskTitle(task),
    "",
    "Was wir brauchen:",
    ...questions.map((question) => `- ${question}`),
    "",
    "Ziel für uns:",
    teamBenefitText(task),
    "",
    task.riskIfIgnored ? `Einordnung: ${toTeamRiskText(task.riskIfIgnored)}` : "",
    ...sourceLines,
    "",
    "Danke"
  ]).join("\n");
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
  if (sources.length > 1) return `${sources.map((source) => source.sourceName).join(", ")} · Sicherheit ${confidenceLabel(item.confidence)}`;
  return `${primary.sourceName} · Sicherheit ${confidenceLabel(item.confidence || primary.confidence)}`;
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
            <small>Direkter Artikellink.</small>
          </div>
          <small>Sicherheit ${escapeHtml(confidenceLabel(source.confidence))}</small>
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

function formatBerlinNow() {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function berlinHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  return Number(hour || 0);
}

function timeGreeting(firstName = "Cem") {
  const hour = berlinHour();
  const name = firstName || "Cem";
  if (hour >= 5 && hour < 10) return `Guten Morgen, ${name}.`;
  if (hour >= 10 && hour < 14) return `Mahlzeit, ${name}.`;
  if (hour >= 14 && hour < 18) return `Guten Nachmittag, ${name}.`;
  return `Guten Abend, ${name}.`;
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
    await fetch(`/api/interactions?${apiScopeQuery()}`, {
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

loadBriefing().catch((error) => {
  console.error(error);
  app.innerHTML = `
    <section class="loading-card">
      <div class="loading-logo"><span>H</span></div>
      <p>Helmut</p>
      <h1>Briefing konnte nicht geladen werden.</h1>
      <button class="primary-button" type="button" onclick="window.location.reload()">Neu laden</button>
    </section>
  `;
  hideStartupSplash();
  showToast("Briefing konnte nicht geladen werden");
});
