const crypto = require("crypto");
const {
  getPushEventByDedupeKey,
  getPushSubscriptions,
  removePushSubscription,
  savePushEvent
} = require("./storage");
const { getNotificationSettings } = require("./accounts");

const PUSH_TYPE_TO_CATEGORY = {
  daily_briefing_ready: "briefing",
  new_mention: "radar",
  risk_detected: "crisis",
  opportunity_detected: "opportunity",
  reaction_recommended: "statement"
};

async function shouldSendNotification(politicianId, category) {
  if (!category) return true;
  try {
    const settings = await getNotificationSettings(politicianId);
    return settings[category] !== false;
  } catch {
    return true;
  }
}

function isPushConfigured() {
  return Boolean(publicVapidKey() && privateVapidKey() && vapidSubject());
}

function publicVapidKey() {
  return String(process.env.VAPID_PUBLIC_KEY || process.env.HELMUT_VAPID_PUBLIC_KEY || "").trim();
}

function privateVapidKey() {
  return String(process.env.VAPID_PRIVATE_KEY || process.env.HELMUT_VAPID_PRIVATE_KEY || "").trim();
}

function vapidSubject() {
  return String(process.env.VAPID_SUBJECT || process.env.HELMUT_VAPID_SUBJECT || "mailto:kontakt@nohut.de").trim();
}

function pushStatus() {
  return {
    enabled: isPushConfigured(),
    publicKey: publicVapidKey(),
    subjectConfigured: Boolean(vapidSubject()),
    reason: isPushConfigured() ? "" : "VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY fehlen."
  };
}

async function sendBriefingReadyPush(briefing, profile = {}) {
  return sendSmartBriefingPush(briefing, profile);
}

async function sendSmartBriefingPush(briefing, profile = {}) {
  const politicianId = profile.id || briefing?.politicianId || null;
  // KEIN stiller Personen-Fallback: ohne echte Mandats-/Account-id wird NIE auf ein
  // fremdes Mandat/Demo-Profil geroutet, sondern sauber uebersprungen.
  if (!politicianId || !String(politicianId).trim()) {
    return { ok: true, skipped: true, reason: "Kein gültiges Mandat/Account für Push (keine profile.id/politicianId)." };
  }
  // PRODUKTWAHRHEIT (Audit-Fix 2026-07): Der Morgen-Push behauptete auch bei
  // leerem/fehlgeschlagenem Briefing "Dein Morgenbriefing steht bereit ...
  // Prioritaeten aktualisiert". Ohne echten Inhalt wird jetzt sauber
  // uebersprungen — lieber kein Push als ein falsches Versprechen.
  const hasContent = Boolean(briefing && briefing.available !== false && (
    briefing.themeOfDay
    || (Array.isArray(briefing.personalizedRecommendations) && briefing.personalizedRecommendations.length)
    || (Array.isArray(briefing.items) && briefing.items.length)
    || (Array.isArray(briefing.situationalBriefing) && briefing.situationalBriefing.length)
  ));
  if (!hasContent) {
    return { ok: true, skipped: true, reason: `Kein inhaltliches Briefing (${(briefing && briefing.reason) || "leer"}) — Push wuerde faelschlich Aktualisierung behaupten.` };
  }
  const push = bestBriefingPush(briefing, profile);
  const category = PUSH_TYPE_TO_CATEGORY[push.type] || null;
  if (category && !await shouldSendNotification(politicianId, category)) {
    return { ok: true, skipped: true, reason: `Nutzer hat '${category}'-Benachrichtigungen deaktiviert.` };
  }
  return sendPushToPolitician(politicianId, {
    ...push,
    url: push.url || "/",
    tag: `${push.type}-${politicianId}-${berlinDateKey(new Date())}`
  }, {
    dedupeKey: `briefing-push:${politicianId}:${berlinDateKey(new Date())}:${push.type}:${stableKey(push.relatedId || push.title || push.body)}`
  });
}

async function sendLageChangePush(lageCheck = {}, profile = {}) {
  const politicianId = profile.id || lageCheck.politicianId || null;
  // KEIN stiller Personen-Fallback: ohne echte Mandats-/Account-id sauber ueberspringen,
  // niemals auf ein fremdes Mandat/Demo-Profil routen.
  if (!politicianId || !String(politicianId).trim()) {
    return { ok: true, skipped: true, reason: "Kein gültiges Mandat/Account für Push (keine profile.id/politicianId)." };
  }
  if (lageCheck.status !== "changed" || !lageCheck.topChange?.title) {
    return { ok: true, skipped: true, reason: "Keine neue Lage mit Push-Relevanz." };
  }
  if (!await shouldSendNotification(politicianId, "lage")) {
    return { ok: true, skipped: true, reason: "Nutzer hat 'lage'-Benachrichtigungen deaktiviert." };
  }
  const title = "Neue Lage erkannt.";
  const body = `${lageCheck.topChange.title}: Helmut hat deine Priorität neu geprüft.`;
  return sendPushToPolitician(politicianId, {
    type: "reaction_recommended",
    title,
    body: truncatePushBody(body),
    url: "/",
    tag: `lage-change-${politicianId}-${stableKey(lageCheck.topChange.url || lageCheck.topChange.title)}`
  }, {
    dedupeKey: `lage-change:${politicianId}:${berlinDateKey(new Date())}:${stableKey(lageCheck.topChange.url || lageCheck.topChange.title)}`
  });
}

function bestBriefingPush(briefing = {}, profile = {}) {
  const recommendations = Array.isArray(briefing.personalizedRecommendations) ? briefing.personalizedRecommendations : [];
  const notifications = Array.isArray(briefing.notifications) ? briefing.notifications : [];
  const mentions = Array.isArray(briefing.personMentions) ? briefing.personMentions : [];
  const highReaction = recommendations.find((item) => Number(item.relevance_score || item.finalScore || 0) >= 80);
  if (highReaction) {
    return {
      type: "reaction_recommended",
      title: "Reaktion empfohlen.",
      body: truncatePushBody(`${highReaction.title}: ${highReaction.recommended_action || highReaction.summary || "Helmut empfiehlt eine kurze Linie vorzubereiten."}`),
      relatedId: highReaction.id
    };
  }

  const freshMention = mentions.find((item) => isFresh(item));
  if (freshMention) {
    return {
      type: "new_mention",
      title: "Neue Erwähnung über dich.",
      body: truncatePushBody(`${freshMention.sourceName || "Quelle"}: ${freshMention.title || "Du wurdest erwähnt."}`),
      relatedId: freshMention.id || freshMention.url
    };
  }

  const urgentMeeting = notifications.find((item) => ["meeting_starts_soon", "meeting_prep_ready"].includes(item.type) && item.priority === "high");
  if (urgentMeeting) {
    return {
      type: urgentMeeting.type,
      title: urgentMeeting.title || "Terminvorbereitung bereit.",
      body: truncatePushBody(urgentMeeting.message || "Helmut hat Gesprächspunkte vorbereitet."),
      relatedId: urgentMeeting.id
    };
  }

  const risk = notifications.find((item) => item.type === "risk_detected" && item.priority === "high");
  if (risk) {
    return {
      type: "risk_detected",
      title: risk.title || "Risiko erkannt.",
      body: truncatePushBody(risk.message || "Helmut sieht ein politisches Risiko."),
      relatedId: risk.id
    };
  }

  const opportunity = notifications.find((item) => item.type === "opportunity_detected");
  if (opportunity) {
    return {
      type: "opportunity_detected",
      title: opportunity.title || "Chance erkannt.",
      body: truncatePushBody(opportunity.message || "Helmut sieht politischen Spielraum."),
      relatedId: opportunity.id
    };
  }

  const top = briefing.themeOfDay || recommendations[0] || briefing.items?.[0] || briefing.situationalBriefing?.[0] || null;
  return {
    type: "daily_briefing_ready",
    title: "Dein Morgenbriefing steht bereit.",
    body: truncatePushBody(top?.title
      ? `Heute zählt: ${top.title}.`
      : "Helmut hat die Lage geprüft. Deine Prioritäten sind aktualisiert."),
    relatedId: top?.id || top?.signalId || top?.title || profile.id
  };
}

async function sendPushToPolitician(politicianId, payload, options = {}) {
  if (!isPushConfigured()) {
    return { ok: false, skipped: true, reason: "Push ist nicht konfiguriert." };
  }
  if (options.dedupeKey) {
    const existing = await getPushEventByDedupeKey(politicianId, options.dedupeKey);
    if (existing) return { ok: true, skipped: true, reason: "Push wurde bereits versendet.", event: existing };
  }
  const subscriptions = await getPushSubscriptions(politicianId);
  if (!subscriptions.length) {
    const event = await savePushEvent({
      politicianId,
      dedupeKey: options.dedupeKey || "",
      type: payload.type || "push",
      title: payload.title,
      body: payload.body,
      delivered: 0,
      failed: 0,
      skipped: true,
      reason: "Keine Push-Abonnements vorhanden.",
      results: []
    });
    return { ok: true, skipped: true, reason: "Keine Push-Abonnements vorhanden.", event };
  }

  const results = [];
  for (const subscriptionEntry of subscriptions) {
    const result = await sendPush(subscriptionEntry.subscription, payload).catch((error) => ({
      ok: false,
      status: 0,
      error: error.message
    }));
    if ([404, 410].includes(result.status)) {
      await removePushSubscription(politicianId, subscriptionEntry.endpoint);
    }
    results.push({
      endpoint: subscriptionEntry.endpoint,
      ...result
    });
  }

  const event = await savePushEvent({
    politicianId,
    dedupeKey: options.dedupeKey || "",
    type: payload.type || "push",
    title: payload.title,
    body: payload.body,
    delivered: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results: results.map((result) => ({
      ok: result.ok,
      status: result.status,
      error: result.error || ""
    }))
  });

  return {
    ok: results.some((result) => result.ok),
    event,
    results
  };
}

async function sendPush(subscription, payload) {
  const endpoint = String(subscription?.endpoint || "");
  if (!endpoint) throw new Error("Push endpoint missing");
  const encrypted = encryptPayload(subscription, JSON.stringify({
    title: payload.title || "Helmut",
    body: payload.body || "",
    url: payload.url || "/",
    tag: payload.tag || payload.type || "helmut-update",
    type: payload.type || "update"
  }));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(endpoint),
      TTL: String(payload.ttl || 60 * 60 * 6),
      Urgency: payload.urgency || "normal",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream"
    },
    body: encrypted
  });
  return {
    ok: response.ok,
    status: response.status,
    error: response.ok ? "" : await response.text().catch(() => response.statusText)
  };
}

function encryptPayload(subscription, payloadText) {
  const userPublicKey = base64UrlToBuffer(subscription.keys?.p256dh);
  const authSecret = base64UrlToBuffer(subscription.keys?.auth);
  if (!userPublicKey.length || !authSecret.length) throw new Error("Push subscription keys missing");

  const local = crypto.createECDH("prime256v1");
  local.generateKeys();
  const localPublicKey = local.getPublicKey();
  const sharedSecret = local.computeSecret(userPublicKey);
  const salt = crypto.randomBytes(16);
  const context = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    userPublicKey,
    localPublicKey
  ]);
  const ikm = hkdfExpand(hkdfExtract(authSecret, sharedSecret), context, 32);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const plaintext = Buffer.concat([Buffer.from(payloadText), Buffer.from([2])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(localPublicKey.length, 20);
  return Buffer.concat([header, localPublicKey, ciphertext]);
}

function vapidAuthorization(endpoint) {
  const audience = new URL(endpoint).origin;
  const jwt = vapidJwt(audience);
  return `vapid t=${jwt}, k=${publicVapidKey()}`;
}

function vapidJwt(audience) {
  const header = base64UrlJson({ typ: "JWT", alg: "ES256" });
  const payload = base64UrlJson({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: vapidSubject()
  });
  const input = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(input), {
    key: vapidPrivateKeyObject(),
    dsaEncoding: "ieee-p1363"
  });
  return `${input}.${base64Url(signature)}`;
}

function vapidPrivateKeyObject() {
  const privateKey = privateVapidKey();
  if (privateKey.startsWith("-----BEGIN")) return crypto.createPrivateKey(privateKey);
  const publicKey = base64UrlToBuffer(publicVapidKey());
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error("VAPID_PUBLIC_KEY muss ein unkomprimierter P-256 Public Key sein.");
  return crypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: base64Url(publicKey.subarray(1, 33)),
      y: base64Url(publicKey.subarray(33, 65)),
      d: privateKey
    },
    format: "jwk"
  });
}

function hkdfExtract(salt, ikm) {
  return crypto.createHmac("sha256", salt).update(ikm).digest();
}

function hkdfExpand(prk, info, length) {
  const blocks = [];
  let previous = Buffer.alloc(0);
  let counter = 1;
  while (Buffer.concat(blocks).length < length) {
    previous = crypto.createHmac("sha256", prk)
      .update(previous)
      .update(info)
      .update(Buffer.from([counter]))
      .digest();
    blocks.push(previous);
    counter += 1;
  }
  return Buffer.concat(blocks).subarray(0, length);
}

function base64UrlJson(value) {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function base64UrlToBuffer(value) {
  if (!value) return Buffer.alloc(0);
  return Buffer.from(String(value), "base64url");
}

function berlinDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function isFresh(item = {}, hours = 24) {
  const date = new Date(item.retrievedAt || item.createdAt || item.created_at || item.updatedAt || item.updated_at || item.publishedAt || "");
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
}

function truncatePushBody(value, maxLength = 145) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}.`;
}

function stableKey(value) {
  return crypto.createHash("sha1").update(String(value || "push")).digest("hex").slice(0, 16);
}

module.exports = {
  isPushConfigured,
  pushStatus,
  publicVapidKey,
  shouldSendNotification,
  sendBriefingReadyPush,
  sendSmartBriefingPush,
  sendLageChangePush,
  sendPushToPolitician
};
