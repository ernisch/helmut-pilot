const POSITIVE_INTERACTIONS = new Set([
  "marked_important",
  "detail_opened",
  "communication_copied",
  "task_copied",
  "delegated",
  "done",
  "note_created"
]);

const NEGATIVE_INTERACTIONS = new Set(["ignored"]);

const INTERACTION_WEIGHTS = {
  ignored: -10,
  marked_important: 10,
  task_copied: 8,
  delegated: 8,
  done: 8,
  communication_copied: 6,
  note_created: 5,
  detail_opened: 2
};

const STOP_WORDS = new Set([
  "und",
  "oder",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einer",
  "einen",
  "zum",
  "zur",
  "mit",
  "von",
  "bei",
  "auf",
  "für",
  "ueber",
  "über",
  "nicht",
  "wird",
  "werden",
  "heute",
  "deine",
  "dein",
  "dich"
]);

function buildLearningProfile(interactions = []) {
  const relevant = (interactions || [])
    .filter((interaction) => interaction && interaction.type)
    .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))
    .slice(0, 200);

  const topicScores = new Map();
  const sourceScores = new Map();
  const actionScores = new Map();
  const keywordScores = new Map();
  let positiveCount = 0;
  let negativeCount = 0;

  relevant.forEach((interaction) => {
    const type = interaction.type || "unknown";
    const weight = decayedWeight(INTERACTION_WEIGHTS[type] || 0, interaction.createdAt || interaction.created_at);
    if (!weight) return;

    if (POSITIVE_INTERACTIONS.has(type)) positiveCount += 1;
    if (NEGATIVE_INTERACTIONS.has(type)) negativeCount += 1;

    addScore(topicScores, topicKey(interaction.topic || interaction.title || interaction.politicalItemId), weight);
    addScore(sourceScores, topicKey(interaction.sourceName), weight * 0.6);
    addScore(actionScores, topicKey(interaction.metadata?.actionType || interaction.metadata?.channel || interaction.type), weight * 0.4);

    extractKeywords(`${interaction.topic || ""} ${interaction.title || ""}`).forEach((keyword) => {
      addScore(keywordScores, keyword, weight * 0.7);
    });
  });

  const profile = {
    status: relevant.length >= 8 ? "Lernt aktiv" : relevant.length ? "Lernt an" : "Noch keine Signale",
    eventCount: relevant.length,
    positiveCount,
    negativeCount,
    confidence: relevant.length >= 20 ? "hoch" : relevant.length >= 8 ? "mittel" : relevant.length ? "niedrig" : "keine",
    topicWeights: topEntries(topicScores, 8),
    sourceWeights: topEntries(sourceScores, 5),
    actionWeights: topEntries(actionScores, 5),
    keywordWeights: topEntries(keywordScores, 12),
    summary: learningSummary(relevant.length, positiveCount, negativeCount, topicScores, keywordScores),
    updatedAt: new Date().toISOString()
  };

  return profile;
}

function learningBiasForItem(item = {}, learningProfile = {}) {
  if (!learningProfile || !learningProfile.eventCount) return 0;
  let bias = 0;
  const topic = topicKey(item.topic || item.title);
  const source = topicKey(item.primarySource?.sourceName || item.sourceName);
  const action = topicKey(item.action_type || item.actionType || item.recommended_channel || "");
  const textKeywords = extractKeywords(`${item.topic || ""} ${item.title || ""} ${item.summary || ""}`);

  bias += valueFor(learningProfile.topicWeights, topic) * 0.55;
  bias += valueFor(learningProfile.sourceWeights, source) * 0.25;
  bias += valueFor(learningProfile.actionWeights, action) * 0.2;
  textKeywords.forEach((keyword) => {
    bias += valueFor(learningProfile.keywordWeights, keyword) * 0.12;
  });

  return clampBias(bias);
}

function learningReasonForItem(item = {}, learningProfile = {}, bias = 0) {
  if (!learningProfile.eventCount || Math.abs(bias) < 3) return "";
  const direction = bias > 0 ? "höher" : "niedriger";
  const topic = item.topic || item.title || "dieses Thema";
  const topPositive = (learningProfile.keywordWeights || []).find((entry) => entry.score > 0);
  const topNegative = (learningProfile.keywordWeights || []).find((entry) => entry.score < 0);
  const anchor = bias > 0 ? topPositive : topNegative;
  const reason = anchor ? `ähnliche Signale rund um ${anchor.label}` : "dein bisheriges Nutzungsverhalten";
  return `Helmut gewichtet ${topic} ${direction}, weil ${reason} das bisher nahelegt.`;
}

function learningSummary(eventCount, positiveCount, negativeCount, topicScores, keywordScores) {
  if (!eventCount) return "Noch keine Nutzungssignale. Helmut lernt, sobald du Themen öffnest, markierst, kopierst oder ausblendest.";
  const positive = topEntries(topicScores, 1).find((entry) => entry.score > 0);
  const negative = topEntries(topicScores, 5).find((entry) => entry.score < 0);
  if (positive) return `Helmut hat ${eventCount} Nutzungssignale. Ähnliche Themen wie ${positive.label} werden vorsichtig höher priorisiert.`;
  if (negative) return `Helmut hat ${eventCount} Nutzungssignale. Ähnliche Themen wie ${negative.label} werden vorsichtig zurückgenommen.`;
  return `Helmut hat ${eventCount} Nutzungssignale: ${positiveCount} positiv, ${negativeCount} ausgeblendet.`;
}

function addScore(map, key, value) {
  if (!key) return;
  map.set(key, clampBias((map.get(key) || 0) + value));
}

function topEntries(map, limit) {
  return Array.from(map.entries())
    .map(([key, score]) => ({ key, label: labelFromKey(key), score: Math.round(score * 10) / 10 }))
    .filter((entry) => Math.abs(entry.score) >= 0.5)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, limit);
}

function valueFor(entries = [], key) {
  if (!key) return 0;
  return Number((entries || []).find((entry) => entry.key === key)?.score || 0);
}

function decayedWeight(weight, createdAt) {
  if (!weight) return 0;
  const ageDays = Math.max(0, (Date.now() - new Date(createdAt || Date.now()).getTime()) / (24 * 60 * 60 * 1000));
  const decay = Math.max(0.35, 1 - ageDays / 30);
  return weight * decay;
}

function extractKeywords(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9äöüß]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
    .slice(0, 12)
    .map(topicKey);
}

function topicKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function labelFromKey(key) {
  return String(key || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clampBias(value) {
  return Math.max(-15, Math.min(15, Number(value) || 0));
}

module.exports = {
  buildLearningProfile,
  learningBiasForItem,
  learningReasonForItem
};
