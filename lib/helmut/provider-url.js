"use strict";

// Eine einzige, strenge Wahrheit fuer Google-News-Transportadressen.
//
// Warum nicht `includes("news.google.")`: ein Query-Parameter oder ein fremder
// Host wie `news.google.com.evil.example` darf weder die Providersteuerung noch
// die Deduplizierung oder das Google-Gate ausloesen. Umgekehrt darf ein echter
// Google-News-Host die Schutzschichten nicht ueber HTTP oder einen Sonderport
// umgehen. Zugangsdaten in der URL sind fuer diesen oeffentlichen Abrufweg nie
// erforderlich und werden deshalb ebenfalls geschlossen abgelehnt.
const GOOGLE_NEWS_HOST = "news.google.com";
const GOOGLE_SEARCH_HOSTS = new Set(["google.com", "www.google.com"]);

function parseUrl(value) {
  try { return new URL(String(value || "").trim()); }
  catch (_) { return null; }
}

function isGoogleNewsHostname(value) {
  const parsed = parseUrl(value);
  // Ein abschliessender DNS-Punkt bezeichnet denselben Host, ist aber fuer den
  // strikten Vertrag unzulaessig. Hier wird er nur fuer die Sicherheitspruefung
  // kanonisiert, damit `news.google.com.` nicht als generische Quelle ausweicht.
  const host = parsed && parsed.hostname.toLowerCase().replace(/\.$/, "");
  return Boolean(parsed && host === GOOGLE_NEWS_HOST);
}

function isStrictGoogleNewsUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname.toLowerCase() !== GOOGLE_NEWS_HOST) return false;
  // WHATWG URL normalisiert einen expliziten Standardport 443 zu "". Die
  // zweite Bedingung dokumentiert den Vertrag und schuetzt auch alternative
  // URL-Implementierungen, falls diese Funktion spaeter portiert wird.
  if (parsed.port !== "" && parsed.port !== "443") return false;
  if (parsed.username || parsed.password) return false;
  return true;
}

function isGoogleSearchHostname(value) {
  const parsed = parseUrl(value);
  const host = parsed && parsed.hostname.toLowerCase().replace(/\.$/, "");
  return Boolean(parsed && GOOGLE_SEARCH_HOSTS.has(host));
}

function isStrictGoogleSearchUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (!GOOGLE_SEARCH_HOSTS.has(parsed.hostname.toLowerCase())) return false;
  if (parsed.port !== "" && parsed.port !== "443") return false;
  if (parsed.username || parsed.password) return false;
  return true;
}

function assertSafeGoogleNewsTransportUrl(value) {
  // Nur der echte Host wird hier behandelt. Aehnlich aussehende fremde Hosts
  // sind keine Google-News-Adressen und fallen in ihre normale Anbieterklasse.
  if (isGoogleNewsHostname(value) && !isStrictGoogleNewsUrl(value)) {
    const error = new Error("google-news-url-ungueltig: https/443/host erforderlich");
    error.code = "GOOGLE_NEWS_URL_INVALID";
    throw error;
  }
  return true;
}

// Derselbe Fail-closed-Vertrag gilt fuer die zweite bekannte Google-Klasse.
// Ein echtes google.com-Ziel darf nicht durch HTTP/Sonderport/Credentials oder
// einen abschliessenden DNS-Punkt in die generische Quellenklasse ausweichen.
function assertSafeProviderTransportUrl(value) {
  assertSafeGoogleNewsTransportUrl(value);
  if (isGoogleSearchHostname(value) && !isStrictGoogleSearchUrl(value)) {
    const error = new Error("google-search-url-ungueltig: https/443/host erforderlich");
    error.code = "GOOGLE_SEARCH_URL_INVALID";
    throw error;
  }
  return true;
}

module.exports = {
  GOOGLE_NEWS_HOST,
  isGoogleNewsHostname,
  isStrictGoogleNewsUrl,
  assertSafeGoogleNewsTransportUrl,
  isGoogleSearchHostname,
  isStrictGoogleSearchUrl,
  assertSafeProviderTransportUrl
};
