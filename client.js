let profile = null;
let briefing = null;
let aiStatus = { enabled: false, model: "" };
let decisions = [];
let tasks = [];
let notes = [];
let recommendations = [];
let selectedDecisionId = "";
let currentView = "briefing";
let navOpen = false;
let updatesOpen = false;
let generatedStatement = "";
let berlinClockTimer = null;
const updateSeenStorageKey = "helmut:lastSeenUpdatesAt";
let activePoliticianId = "cem-ince";

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const navItems = [
  ["briefing", "Morgenbriefing"],
  ["office", "Büro"],
  ["topics", "Belege"],
  ["radar", "Radar"]
];

const mobileNavItems = [
  ["briefing", "Heute"],
  ["radar", "Radar"],
  ["office", "Büro"],
  ["settings", "Profil"]
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
  const scope = `politicianId=${encodeURIComponent(activePoliticianId)}`;
  const [profileResponse, briefingResponse, tasksResponse, notesResponse, aiStatusResponse] = await Promise.all([
    fetch(`/api/profile/demo?${scope}`),
    fetch(`/api/briefing/latest?${scope}`),
    fetch(`/api/tasks?${scope}`),
    fetch(`/api/notes?${scope}`),
    fetch("/api/ai/status")
  ]);

  profile = await profileResponse.json();
  briefing = await briefingResponse.json();
  aiStatus = aiStatusResponse.ok ? await aiStatusResponse.json() : { enabled: false, model: "" };
  briefing.status = briefing.status || "Live";
  briefing.sourceStats = briefing.sourceStats || { checkedSources: 0, successfulSources: 0, failedSources: 0 };

  const persistedTasks = tasksResponse.ok ? await tasksResponse.json() : [];
  notes = notesResponse.ok ? await notesResponse.json() : [];
  tasks = mergeTasks(briefing.tasks || [], persistedTasks);
  recommendations = briefing.personalizedRecommendations || [];

  const themeSignalId = briefing.themeOfDay?.signalId;
  const activeItems = briefing.items.filter((item) => item.decision !== "Ignorieren");
  const personalizedItems = recommendations.map(recommendationToDecisionItem);
  decisions = (personalizedItems.length ? personalizedItems : (activeItems.length ? activeItems : briefing.items.slice(0, 1)))
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

function toDecision(item) {
  return {
    id: item.id,
    signalId: item.signalId,
    title: item.title,
    priorityLabel: priorityLabelForDecision(item),
    priorityType: priorityTypeForDecision(item),
    summary: twoSentenceSummary(item.summary || item.whyItMatters || item.recommendedAction),
    action: item.recommendedAction,
    statement: item.suggestedStatement,
    whyNow: item.whyNow,
    whyItMatters: item.whyItMatters,
    inaction: item.inactionConsequence,
    risk: item.riskNote,
    opportunity: item.opportunityNote,
    estimatedTime: `${item.estimatedTimeMinutes} Min.`,
    confidence: item.confidence,
    sourceCount: item.sourceCount,
    sources: item.sources || [],
    primarySource: item.primarySource || item.sources?.[0],
    politicalScore: item.politicalScore,
    mandateScore: item.mandateScore,
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
}

function renderSidebar() {
  return `
    <aside class="sidebar ${navOpen ? "open" : ""}">
      <div>
        <div class="brand">HELMUT</div>
        <nav class="nav-list" aria-label="Hauptnavigation">
          ${navItems.map(([id, label]) => `<button class="${currentView === id ? "active" : ""}" type="button" data-view="${id}">${label}</button>`).join("")}
          <button class="mobile-menu-settings ${currentView === "settings" ? "active" : ""}" type="button" data-view="settings">Einstellungen</button>
        </nav>
      </div>
      <div class="sidebar-foot">
        <button type="button" data-view="settings">Einstellungen</button>
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
          ${mobileNavBadge(id)}
        </button>
      `).join("")}
    </nav>
  `;
}

function isMobileNavActive(id) {
  if (id === "briefing") return currentView === "briefing" || currentView === "detail";
  if (id === "office") return currentView === "office" || currentView === "communication" || currentView === "tasks";
  if (id === "settings") return currentView === "settings" || currentView === "profile-settings";
  return currentView === id;
}

function mobileNavSymbol(id) {
  return ({ briefing: "H", radar: "R", office: "B", settings: "P" })[id] || "•";
}

function mobileNavBadge(id) {
  const count = id === "radar" ? freshMentionCount() : id === "office" ? openOfficeTaskCount() : 0;
  return count ? `<i>${count > 9 ? "9+" : count}</i>` : "";
}

function renderTopbar() {
  const hasUpdates = hasUnreadUpdates();
  return `
    <header class="topbar">
      <button class="menu-button ${navOpen ? "close" : ""}" type="button" data-menu aria-label="${navOpen ? "Menü schließen" : "Menü öffnen"}">
        ${navOpen ? "×" : "<span></span><span></span><span></span>"}
      </button>
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
        <button class="updates-radar-link" type="button" data-view="radar">Alle Signale ansehen</button>
      </aside>
    </div>
  `;
}

function renderNotificationItem(item) {
  if (item.href) {
    return `
      <a class="notification-row ${item.type}" href="${escapeAttribute(item.href)}" target="_blank" rel="noopener noreferrer">
        <span>${escapeHtml(item.label)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <small>${escapeHtml(item.meta)}</small>
      </a>
    `;
  }
  return `
    <button class="notification-row ${item.type}" type="button" data-detail="${escapeHtml(item.decisionId)}">
      <span>${escapeHtml(item.label)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
      <small>${escapeHtml(item.meta)}</small>
    </button>
  `;
}

function renderView() {
  if (currentView === "detail") return renderDetailView();
  if (currentView === "office" || currentView === "tasks" || currentView === "communication") return renderOfficeView();
  if (currentView === "topics") return renderTopicsView();
  if (currentView === "radar") return renderRadarView();
  if (currentView === "profile-settings") return renderProfileSettingsView();
  if (currentView === "settings") return renderSettingsView();
  return renderBriefingView();
}

function renderBriefingView() {
  const firstName = (profile?.fullName || "Cem").split(" ")[0];
  return `
    <section class="page-intro">
      <h1 class="${headlineClass(`Guten Morgen, ${firstName}.`)}">Guten Morgen, ${escapeHtml(firstName)}.</h1>
      <p>${escapeHtml(referentFocusSentence())}</p>
      ${renderPilotStatus()}
    </section>

    ${renderAgentBriefing()}

    ${renderReferentHome()}
    ${!decisions.length ? renderSituationalBriefing() : ""}

    <button class="quiet-link" type="button" data-view="topics">Belege ansehen</button>
  `;
}

function referentFocusSentence() {
  const mode = briefing.dayMode;
  if (mode?.focus) return `${mode.phase}: ${mode.focus}.`;
  return decisionCountSentence();
}

function renderReferentHome() {
  const sections = briefing.homeSections || buildFallbackHomeSections();
  return `
    ${renderPrioritySection("Ihre wichtigsten Aufgaben", sections.topTasks, renderHomeTask)}
    ${renderPrioritySection("Neu seit deinem letzten Besuch", sections.changedSinceLastVisit, renderChangeItem)}
    ${renderPrioritySection("Braucht deine Aufmerksamkeit?", sections.needsAttention, renderAttentionItem)}
    ${renderPrioritySection("Politische Chancen", sections.opportunities, renderOpportunityItem)}
    ${renderPrioritySection("Politische Risiken", sections.risks, renderRiskItem)}
  `;
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
    action: item.recommended_action,
    whyItMatters: item.personal_relevance_explanation,
    inaction: item.consequence_if_ignored,
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
      <div class="agent-orb" aria-hidden="true"><span></span></div>
      <div class="agent-copy">
        <span>Lage von Helmut</span>
        <p>${escapeHtml(text)}</p>
        <div class="agent-facts">
          ${agentFacts().map((fact) => `<b>${escapeHtml(fact)}</b>`).join("")}
        </div>
      </div>
      <div class="agent-actions">
        <button class="secondary-button" type="button" data-speak="${escapeAttribute(text)}">Lage anhören</button>
        <button class="primary-button" type="button" data-detail="${escapeHtml(decisions[0]?.id || "")}">Entscheidung öffnen</button>
      </div>
    </section>
  `;
}

function agentBriefingText() {
  const firstName = (profile?.fullName || "Cem").split(" ")[0];
  const top = decisions[0];
  const mentionCount = freshMentionCount();
  const riskCount = decisions.filter((decision) => decision.priorityType === "risk").length;
  const officeCount = openOfficeTaskCount();
  if (!top) return `Guten Morgen, ${firstName}. Ich habe die Lage geprüft. Für dich liegt heute noch keine klare politische Entscheidung vor.`;
  const mentionSentence = mentionCount
    ? `Du wurdest seit dem letzten Quellenlauf ${mentionCount} Mal erwähnt.`
    : "Heute wurde bislang keine neue namentliche Erwähnung gefunden.";
  const riskSentence = riskCount ? `${riskCount} Risiko solltest du im Blick behalten.` : "Aktuell sehe ich kein neues persönliches Risiko.";
  return `Guten Morgen, ${firstName}. Ich habe die politische Lage geprüft. Wichtigstes Thema für dich ist heute ${top.title}. ${mentionSentence} ${riskSentence} ${officeCount ? `${officeCount} Auftrag kannst du direkt ans Büro geben.` : "Du musst heute nichts unnötig delegieren."}`;
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
  const items = briefing.situationalBriefing || [];
  return `
    <section class="situational-card" aria-label="Politische Lage">
      <span>Lage ohne Handlungsdruck</span>
      <h2>${items.length ? "Heute keine direkte Reaktion nötig." : "Heute keine belastbare Entscheidungslage."}</h2>
      <p>${items.length ? `Ich habe trotzdem ${items.length} politische Entwicklungen markiert, die du kennen solltest.` : escapeHtml(briefing.fallbackReason || "Die Quellen wurden geprüft. Es gibt aktuell nichts, worauf du politisch reagieren musst.")}</p>
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

function renderSituationalItem(item) {
  const href = sourceHref(item);
  return `
    <article class="situational-item">
      <div>
        <span>${escapeHtml(item.sourceName || "Quelle")}</span>
        <h3>${escapeHtml(item.title || "Politische Entwicklung")}</h3>
        <p>${escapeHtml(twoSentenceSummary(item.summary || item.excerpt || item.content || ""))}</p>
        <small>${escapeHtml(item.relevanceReason || "Relevante politische Lage.")} · ${escapeHtml(formatBriefingDate(item.publishedAt || item.retrievedAt))}</small>
      </div>
      ${href ? `<a class="source-pill" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>` : `<span class="source-pill muted">Quelle hinterlegt</span>`}
    </article>
  `;
}

function chiefRecommendationText(decision) {
  if (decision.priorityType === "watch") {
    return `${decision.action} Du musst nicht sofort groß veröffentlichen, aber du solltest heute sprechfähig sein.`;
  }
  return decision.action || decision.summary;
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
  const statusLabel = briefing.status || "Live";
  return `
    <div class="pilot-status" aria-label="Pilotstatus">
      ${escapeHtml(statusLabel)} · ${escapeHtml(sourceText)} · aktualisiert ${escapeHtml(updatedText)}
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
        <p>${escapeHtml(decision.action)}</p>
      </section>
      ${renderMemorySection(decision)}

      <section class="article-grid">
        <div>
          <h2>Warum betrifft dich das?</h2>
          <p>${escapeHtml(decision.whyItMatters)}</p>
        </div>
        <div>
          <h2>Was passiert, wenn du nichts tust?</h2>
          <p>${escapeHtml(decision.inaction)}</p>
        </div>
      </section>

      <section class="article-section">
        <h2>Konkrete Handlung</h2>
        ${decision.mandateScore ? `<p class="score-note">Mandatsbezug ${escapeHtml(String(decision.mandateScore))}/100 · finale Priorität ${escapeHtml(String(decision.finalScore || decision.totalScore || decision.priority))}/100</p>` : ""}
        <p>${escapeHtml(decision.action)}</p>
        <div class="detail-actions">
          <button class="primary-button" type="button" data-communication="${escapeHtml(decision.id)}">Statement erzeugen</button>
          ${decision.taskTemplate?.id ? `<button class="secondary-button" type="button" data-task-copy="${escapeHtml(decision.taskTemplate.id)}">Auftrag kopieren</button>` : ""}
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
      <p>Was du jetzt direkt weitergeben oder veröffentlichen kannst.</p>
    </section>
    ${renderOfficeTasksSection()}
    ${renderCommunicationSection()}
    ${renderNotesSection()}
  `;
}

function renderOfficeTasksSection() {
  const officeTasks = tasks.slice(0, 1);
  return `
    <section class="plain-list">
      <h2>Auftrag fürs Büro</h2>
      ${officeTasks.map(renderTaskRow).join("") || `<p class="empty-state">Keine Büroaufträge vorbereitet.</p>`}
    </section>
  `;
}

function renderTaskRow(task) {
  return `
    <article class="list-row ${priorityClass(task.priority)}">
      <div>
        <span>${escapeHtml(task.assignee)} · bis ${escapeHtml(formatDueDate(task.dueDate))}</span>
        <h3>${escapeHtml(shortTaskTitle(task))}</h3>
        <p>${escapeHtml(shortTaskDescription(task))}</p>
      </div>
      <div class="task-actions">
        <button class="primary-button compact-button" type="button" data-task-copy="${escapeHtml(task.id)}">Auftrag kopieren</button>
      </div>
    </article>
  `;
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
  const sources = uniqueSources(topic.sources?.length ? topic.sources : [topic.source].filter(Boolean));
  if (!sources.length) return "";
  if (sources.length === 1) return sourceLink(sources[0]);
  return `
    <div class="source-link-list" aria-label="Quellen">
      ${sources.map((source) => {
        const href = sourceHref(source);
        const label = `${source.sourceName || "Quelle"} öffnen`;
        return href
          ? `<a class="source-pill" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
          : `<span class="source-pill muted">${escapeHtml(source.sourceName || "Quelle")} hinterlegt</span>`;
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

function renderCommunicationSection() {
  const decision = selectedDecision();
  return `
    <section class="plain-list communication-intro">
      <h2>Textvorschlag</h2>
      <div class="strategy-answer">
        <p data-copy-source="generated-statement">${escapeHtml(generatedStatement || decision.statement)}</p>
        <div>
          <button class="primary-button" type="button" data-copy="generated-statement">Text kopieren</button>
        </div>
      </div>
    </section>
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
  const archivedMentions = archivedProfileMentions(allMentions, freshMentions).slice(0, 6);
  const chanceItems = decisions.filter((decision) => decision.priorityType === "chance").slice(0, 3);
  const riskItems = decisions.filter((decision) => decision.priorityType === "risk").slice(0, 3);
  const watchItems = decisions.filter((decision) => decision.priorityType === "watch").slice(0, 4);
  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Radar.")}">Radar.</h1>
      <p>Was sich seit deinem letzten Blick bewegt hat. Kompakt, priorisiert, ohne Nachrichtenflut.</p>
    </section>

    <section class="radar-groups">
      ${renderRadarGroup("Neue Erwähnungen", freshMentions.length, mentionRows(freshMentions), true)}
      ${renderRadarGroup("Politische Chancen", chanceItems.length, radarDecisionRows(chanceItems, "chance"), false)}
      ${renderRadarGroup("Risiken im Blick", riskItems.length, radarDecisionRows(riskItems, "risk"), false)}
      ${renderRadarGroup("Nur beobachten", watchItems.length, radarDecisionRows(watchItems, "watch"), false)}
      ${renderRadarGroup("Bisher gefunden", archivedMentions.length, `<p class="section-note">Das sind die bisher gefundenen Artikel über dich.</p>${mentionRows(archivedMentions, { empty: false })}`, false)}
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
  const fullName = profile?.fullName || "Cem Ince";
  const lastName = fullName.split(/\s+/).filter(Boolean).at(-1) || "Ince";
  return [...(briefing.personMentions || []), ...(briefing.rawItems || [])]
    .filter((item) => {
      const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
      return text.includes(fullName.toLowerCase()) || new RegExp(`(^|[^a-zäöüß])${escapeRegExp(lastName.toLowerCase())}($|[^a-zäöüß])`, "i").test(text);
    })
    .filter((item, index, items) => items.findIndex((entry) => (entry.url || entry.id) === (item.url || item.id)) === index)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
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
    return `
      <article class="list-row mention mention-row ${href ? "" : "no-link"}">
        ${mentionVisual(item)}
        <div class="mention-content">
          <div>
            <span>${escapeHtml(item.sourceName || "Quelle")}</span>
            <h3>${escapeHtml(item.title || "Erwähnung gefunden")}</h3>
            <p>${escapeHtml(twoSentenceSummary(item.content || item.excerpt || "Cem wurde in dieser Quelle erwähnt."))}</p>
            <small class="mention-timestamp">Gefunden: ${escapeHtml(formatMentionFoundAt(item))}</small>
            ${!href ? `<p class="source-missing">Direktlink noch nicht verfügbar.</p>` : ""}
          </div>
        </div>
        ${href ? `<a class="secondary-button mention-open" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">Artikel öffnen</a>` : ""}
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
  return `
    <section class="page-intro compact">
      <h1 class="${headlineClass("Einstellungen.")}">Einstellungen.</h1>
      <p>Profil und Quellen sind für diese V1 lokal vorbereitet.</p>
    </section>
    <section class="plain-list">
      <article class="list-row">
        <div>
          <span>Mandatsprofil</span>
          <h3>${escapeHtml(profile.fullName)}</h3>
          <p>${escapeHtml(profile.function || "Bundestagsabgeordneter")} · ${escapeHtml(profile.party)} · Ausschuss ${escapeHtml(profile.committee || profile.committees?.[0] || "Noch offen")}</p>
        </div>
        <button class="secondary-button" type="button" data-view="profile-settings">Mandatsprofil öffnen</button>
      </article>
      <article class="list-row">
        <div>
          <span>Quellen</span>
          <h3>${sourceStats.successfulSources || 0} von ${sourceStats.checkedSources || 0} geprüft</h3>
          <p>${sourceStats.failedSources || 0} Fehler · ${briefing.liveSignals || 0} Live-Signale · ${briefing.personMentions?.length || 0} Namensnennungen.</p>
        </div>
      </article>
      <article class="list-row ${aiStatus.enabled ? "low" : "medium"}">
        <div>
          <span>OpenAI</span>
          <h3>${aiStatus.enabled ? "Aktiv" : "Nicht aktiv"}</h3>
          <p>${aiStatus.enabled ? `Modell ${aiStatus.model || "konfiguriert"} veredelt Briefing und Kommunikation.` : "Helmut läuft regelbasiert weiter."}</p>
        </div>
      </article>
      <article class="list-row ${briefing.status === "Aktuell" ? "low" : "medium"}">
        <div>
          <span>Pilotstatus</span>
          <h3>${escapeHtml(briefing.status || "Bereit")}</h3>
          <p>${escapeHtml(briefing.fallbackReason || "Live-Daten werden für die Morgenlage verwendet.")}</p>
        </div>
      </article>
    </section>
  `;
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
          <h2>Was zählt lokal?</h2>
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
        <button class="secondary-button" type="button" data-view="settings">Zurück</button>
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
      currentView = "detail";
      navOpen = false;
      updatesOpen = false;
      const decision = selectedDecision();
      logInteraction({ type: "detail_opened", signalId: decision?.signalId || "" });
      render();
    });
  });

  app.querySelectorAll("[data-communication]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDecisionId = button.dataset.communication;
      generatedStatement = selectedDecision().statement;
      currentView = "office";
      render();
    });
  });

  app.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = app.querySelector(`[data-copy-source="${button.dataset.copy}"]`);
      copyText(source?.textContent?.trim() || "", "Text bereit");
      logInteraction({ type: "communication_copied", signalId: selectedDecision()?.signalId || "" });
    });
  });

  app.querySelectorAll("[data-task-copy]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = tasks.find((entry) => entry.id === button.dataset.taskCopy);
      if (!task) return;
      copyText(taskShareText(task), "Auftrag bereit");
      logInteraction({ type: "task_copied", taskId: task.id, signalId: task.sourceSignalId || "" });
    });
  });

  app.querySelectorAll("[data-run-crawl]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Prüft...";
      try {
        await fetch(`/api/crawl/run?politicianId=${encodeURIComponent(activePoliticianId)}`);
        currentView = "radar";
        showToast("Personensuche geprüft");
        await loadBriefing();
      } catch (error) {
        console.error(error);
        showToast("Suche konnte nicht gestartet werden");
        render();
      }
    });
  });

  app.querySelectorAll("[data-speak]").forEach((button) => {
    button.addEventListener("click", () => {
      speakAgentBriefing(button.dataset.speak || agentBriefingText());
    });
  });

  app.querySelectorAll("[data-generate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const input = app.querySelector("#communicationInput")?.value || `Erstelle ein Statement zu ${selectedDecision().title}.`;
      button.disabled = true;
      button.textContent = "Erstellt...";
      try {
        const result = await generateStatementWithBackend(input, selectedDecision());
        generatedStatement = result.text;
        showToast(result.aiEnabled ? "KI-Vorschlag erstellt" : "Regelbasiert erstellt");
      } catch (error) {
        console.error(error);
        generatedStatement = generateStatement(input, selectedDecision());
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
      const text = new FormData(noteForm).get("text");
      if (!String(text || "").trim()) return;
      try {
        const response = await fetch(`/api/notes?politicianId=${encodeURIComponent(activePoliticianId)}`, {
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
        showToast("Notiz gespeichert");
        render();
      } catch (error) {
        console.error(error);
        showToast("Notiz konnte nicht gespeichert werden");
      }
    });
  }
}

function speakAgentBriefing(text) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    showToast("Sprachausgabe nicht verfügbar");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = 0.96;
  utterance.pitch = 0.92;
  window.speechSynthesis.speak(utterance);
  showToast("Lage wird vorgelesen");
}

async function saveProfileFromForm(form) {
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
    const response = await fetch(`/api/profile/demo?politicianId=${encodeURIComponent(activePoliticianId)}`, {
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

function generateStatement(input, decision) {
  if (/kurz|social|linkedin/i.test(input)) return decision.statement;
  return `${decision.statement} ${decision.action}`;
}

async function generateStatementWithBackend(input, decision) {
  const response = await fetch("/api/communication/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input,
      decision
    })
  });
  if (!response.ok) throw new Error(`Communication API failed: ${response.status}`);
  const result = await response.json();
  return {
    aiEnabled: Boolean(result.aiEnabled),
    text: result.text || generateStatement(input, decision)
  };
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
  const date = new Date(item?.publishedAt || item?.retrievedAt || "");
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
  const mentionItems = (briefing?.personMentions || []).filter(isFreshUpdate).slice(0, 4).map((item) => ({
    type: "mention",
    label: "Neue Erwähnung",
    title: item.title || "Cem wurde erwähnt",
    summary: twoSentenceSummary(item.content || item.excerpt || "Neue namentliche Erwähnung gefunden."),
    meta: `${item.sourceName || "Quelle"} · ${formatBriefingDate(item.publishedAt || item.retrievedAt)}`,
    href: sourceHref(item)
  }));

  const decisionItems = briefing?.status === "Aktuell"
    ? decisions.slice(0, 3).map((decision) => ({
      type: decision.priorityType,
      label: decision.priorityLabel,
      title: decision.title,
      summary: decision.summary,
      meta: sourceLine(decision),
      decisionId: decision.id
    }))
    : [];

  return [...mentionItems, ...decisionItems].slice(0, 5);
}

function taskShareText(task) {
  const sourceUrl = task.primarySource?.itemUrl || task.primarySource?.url || task.primarySource?.sourceUrl || "";
  return [
    `Bitte vorbereiten: ${task.title}`,
    "",
    `Zuständig: ${task.assignee}`,
    `Bis: ${formatDueDate(task.dueDate)}`,
    "",
    task.description || "Bitte diese Aufgabe aus dem Helmut-Briefing bearbeiten.",
    "",
    task.politicalBenefit ? `Warum wichtig: ${task.politicalBenefit}` : "",
    task.riskIfIgnored ? `Wenn nichts passiert: ${task.riskIfIgnored}` : "",
    task.primarySource?.sourceName ? `Quelle: ${task.primarySource.sourceName}` : "",
    sourceUrl ? `Link: ${sourceUrl}` : ""
  ].filter((line) => line !== "").join("\n");
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
  if (!url) return `<span class="source-pill muted">Quelle hinterlegt</span>`;
  return `<a class="source-pill" href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.sourceName || "Quelle")} öffnen</a>`;
}

function renderSourceBasis(item) {
  const sources = item.sources || [];
  if (!sources.length) return "";
  return `
    <section class="source-basis">
      <h2>Quellenbasis</h2>
      ${sources.slice(0, 4).map((source) => {
        const href = sourceHref(source);
        const tag = href ? "a" : "div";
        const linkAttrs = href ? ` href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer"` : "";
        return `
        <${tag} class="source-row"${linkAttrs}>
          <div>
            <span>${escapeHtml(source.sourceName || "Quelle")}</span>
            <p>${escapeHtml(source.excerpt || source.relevanceReason || "Quelle wurde für diese Empfehlung herangezogen.")}</p>
          </div>
          <small>Sicherheit ${escapeHtml(confidenceLabel(source.confidence))}</small>
        </${tag}>
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
  const candidates = [source?.itemUrl, source?.url, source?.sourceUrl].filter(Boolean);
  return candidates.find((url) => /^https?:\/\//i.test(url) && !url.includes("example.local") && !isGoogleArticleProxy(url)) || "";
}

function isGoogleArticleProxy(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.hostname.includes("google.");
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

function updateBerlinClock() {
  document.querySelectorAll("[data-berlin-clock]").forEach((element) => {
    element.textContent = `${briefing?.status || "Aktuell"} · ${formatBerlinNow()}`;
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
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 1600);
}

async function logInteraction(interaction) {
  if (!profile) return;
  try {
    await fetch(`/api/interactions?politicianId=${encodeURIComponent(activePoliticianId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ politicianId: profile.id, ...interaction })
    });
  } catch (error) {
    console.warn("Interaction not saved", error);
  }
}

function sanitizePoliticianId(value) {
  return String(value || "cem-ince")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "") || "cem-ince";
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
      <p>HELMUT</p>
      <h1>Briefing konnte nicht geladen werden.</h1>
      <button class="primary-button" type="button" onclick="window.location.reload()">Neu laden</button>
    </section>
  `;
  showToast("Briefing konnte nicht geladen werden");
});
