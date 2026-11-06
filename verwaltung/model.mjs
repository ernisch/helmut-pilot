// Reine Anzeigeprojektion bestehender Antworten. Kein Motor, IO oder Fachurteil.
export const list = value => Array.isArray(value) ? value : null;
export const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
export const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);

export function money(value, currency = "USD") {
  return number(value) === null ? "—" : new Intl.NumberFormat("de-DE", {
    style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2
  }).format(value);
}

export function todayCost(budget) {
  const sum = budget?.kostenwahrheit?.gesamt;
  const known = number(sum?.kostenUsd), unknown = number(sum?.kostenUnbekannt);
  if (known === null || known < 0 || unknown === null || unknown < 0) {
    return { value: "—", note: "Kostenstand nicht bestätigt", known: null, unknown: null };
  }
  if (unknown > 0) return { value: "Offen", note: `${money(known)} bekannt · weitere Kosten offen`, known, unknown };
  return { value: money(known), note: "Geschätzt · USD · UTC-Tag", known, unknown };
}

export function paginateProfiles(items, requestedPage = 1) {
  const total = items.length, pages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(pages, Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  return { items: items.slice((page - 1) * 20, page * 20), page, pages, total,
    first: total ? (page - 1) * 20 + 1 : 0, last: Math.min(page * 20, total) };
}

export function dateTime(value, full = false) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "Nicht bekannt";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", ...(full ? { day: "2-digit", month: "2-digit" } : {}),
    hour: "2-digit", minute: "2-digit"
  }).format(date);
}

export function profileState(profile) {
  if (profile.profileActive === false) return { label: "Inaktiv", tone: "neutral" };
  const validation = profile.validierung;
  if (validation?.bereit === true) return { label: "Profil vollständig", tone: "neutral" };
  if (validation?.bereit === false) return { label: "Angaben prüfen", tone: "warn" };
  return { label: "Noch nicht geprüft", tone: "neutral" };
}

// Hosted previews can reach the old main-store without the production profile
// flags. Those copies are not evidence of the current inventory or activation.
// Use the existing server diagnostics; never enable a runtime/write flag here.
export function profileInventoryNotice(overview) {
  const environment = overview?.system?.deploy?.environment;
  if (!["preview", "production"].includes(environment)) return "";
  const config = list(overview?.system?.helmutConfig) || [];
  const enabled = name => ["1", "true", "on", "yes"].includes(
    String(config.find(entry => entry?.name === name)?.wirksam ?? "").trim().toLowerCase());
  const confirmed = overview?.system?.storage?.supabaseConfigured === true
    && ["HELMUT_V3_STORE", "HELMUT_PROFILE_DB_MODE", "HELMUT_PROFILE_DB_EXCLUSIVE"].every(enabled);
  if (confirmed) return "";
  return environment === "preview"
    ? "In dieser Vorschau ist der aktuelle Profilbestand nicht verfügbar. Bitte prüfe die Profilzahlen in der veröffentlichten Verwaltung."
    : "Der aktuelle Profilbestand ist nicht bestätigt. Bitte prüfe die Profilanbindung, bevor du diese Übersicht verwendest.";
}

export function profilesOf(overview) {
  if (profileInventoryNotice(overview)) return null;
  return list(overview?.mandates)?.filter(p => p && typeof p.id === "string") ?? null;
}

export function profileCounts(overview) {
  const profiles = profilesOf(overview);
  if (!profiles) return { total: null, active: null, attention: null };
  return {
    total: profiles.length,
    active: profiles.every(p => typeof p.profileActive === "boolean")
      ? profiles.filter(p => p.profileActive).length : null,
    attention: profiles.filter(p => profileState(p).tone === "warn").length
  };
}

export function filterProfiles(profiles, query = "", filter = "all") {
  const needle = String(query).trim().toLocaleLowerCase("de");
  return (profiles || []).filter(p => {
    if (filter === "active" && p.profileActive !== true) return false;
    if (filter === "attention" && profileState(p).tone !== "warn") return false;
    return [p.fullName, p.id, p.state, p.constituency, p.party, p.faction]
      .some(value => String(value || "").toLocaleLowerCase("de").includes(needle));
  });
}

export function attentionItems(overview, sources) {
  const items = [];
  const profiles = profilesOf(overview);
  const count = profiles?.filter(p => profileState(p).tone === "warn").length;
  if (count) items.push({ title: count === 1 ? "Ein Profil braucht noch Angaben" : `${count} Profile brauchen noch Angaben`,
    text: "Prüfe die markierten Profile, damit Helmut sie richtig berücksichtigen kann.",
    href: "#/profile?filter=attention", label: "Profile prüfen", tone: "warn" });
  if (sources?.stoerungen?.verfuegbar === true) {
    for (const source of (list(sources.stoerungen.handlungsbedarf) || []).slice(0, 3)) {
      items.push({ title: source.name || "Eine Quelle braucht Aufmerksamkeit",
        text: source.erklaerung || source.kurz || "Der letzte Abruf konnte nicht bestätigt werden.",
        href: "#/betrieb/quellen", label: "Quelle ansehen", tone: "warn" });
    }
  }
  return items;
}

export function parliamentLabel(profile) {
  const value = String(profile?.parliamentType || profile?.politische_ebene || profile?.politicalLevel || "").toLowerCase();
  if (value.includes("bundestag")) return "Bundestag";
  if (value.includes("landtag")) return profile.state === "Berlin" ? "Abgeordnetenhaus Berlin" : `Landtag${profile.state ? ` ${profile.state}` : ""}`;
  return "Mandatsebene nicht angegeben";
}

const PROCESS = { crawl: "Quellen abrufen", understanding: "Inhalte aufbereiten",
  "morning-briefing": "Briefings vorbereiten", "lage-briefing": "Lage vorbereiten",
  "lage-check": "Lage prüfen", briefing: "Briefing vorbereiten" };
export const processLabel = process => PROCESS[process] || "Verarbeitung";
export function runState(status) {
  if (["ok", "success", "completed", "succeeded"].includes(status)) return { label: "Abgeschlossen", tone: "neutral" };
  if (["failed", "error"].includes(status)) return { label: "Fehlgeschlagen", tone: "bad" };
  if (["running", "started"].includes(status)) return { label: "Läuft", tone: "info" };
  if (["partial", "timeout"].includes(status)) return { label: "Prüfen", tone: "warn" };
  if (status === "skipped") return { label: "Übersprungen", tone: "neutral" };
  return { label: "Status nicht bekannt", tone: "neutral" };
}

export const paymentLabel = status => ({ paid: "Bezahlt", open: "Offen", overdue: "Überfällig", none: "Nicht gepflegt" })[status] || "Nicht gepflegt";
export function accessLabel(user) {
  if (user.active === false) return "Gesperrt";
  if (user.active === true) return "Offen";
  return "Nicht bekannt";
}
