import {
  list, number, escapeHtml as e, money, dateTime, profileState, profilesOf,
  profileCounts, filterProfiles, attentionItems, parliamentLabel, processLabel,
  runState, paymentLabel, accessLabel, todayCost, paginateProfiles
} from "./model.mjs";

const NAV = [["ueberblick", "Überblick", "overview"], ["profile", "Profile", "profile"],
  ["betrieb", "Betrieb", "activity"], ["kunden", "Kunden", "people"]];
const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 5a3 3 0 0 1 0 6m3 10v-2a7 7 0 0 0-3-6"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
const badge = ({ label, tone = "neutral" }) => `<span class="badge badge--${tone}"><span class="dot"></span>${e(label)}</span>`;
const integer = value => number(value) === null ? "—" : value.toLocaleString("de-DE");
const initials = value => String(value || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join("");
const empty = (title, text) => `<div class="empty"><span class="empty-mark" aria-hidden="true">—</span><h3>${e(title)}</h3><p>${e(text)}</p></div>`;
const metric = (label, value, text) => `<div class="metric"><span>${e(label)}</span><strong>${e(value)}</strong><small>${e(text)}</small></div>`;

function parseRoute(hash) {
  try {
    const url = new URL(hash.slice(1) || "/ueberblick", "https://navigation.invalid");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const section = parts[0] || "ueberblick";
    if (["profil", "kunde"].includes(section)) {
      if (parts.length !== 2 || !/^[a-zA-Z0-9_-]{1,120}$/.test(parts[1])) return { section: "missing" };
      return { section, id: parts[1] };
    }
    if (section === "betrieb" && parts.length <= 2) {
      return { section, tab: ["ablaeufe", "quellen", "kosten"].includes(parts[1]) ? parts[1] : "ablaeufe" };
    }
    if (["ueberblick", "profile", "kunden"].includes(section) && parts.length <= 1) {
      return { section, filter: ["active", "attention"].includes(url.searchParams.get("filter")) ? url.searchParams.get("filter") : "all" };
    }
  } catch { /* Eine kaputte URL wird nie zu einer API-Anfrage. */ }
  return { section: "missing" };
}

export function mountAdministration(root, { reader, preview = false } = {}) {
  if (!root || !reader || typeof reader.read !== "function") throw new TypeError("Ansicht und Datenleser fehlen.");
  let route = parseRoute(location.hash);
  let entries = new Map();
  let query = "";
  let profilePage = 1;
  let version = 0;
  let closed = false;
  let focusHeading = false;
  const keyFor = (key, id) => id ? `${key}:${id}` : key;
  const value = (key, id) => entries.get(keyFor(key, id))?.data ?? null;
  const state = (key, id) => entries.get(keyFor(key, id));
  const profileHref = id => `#/profil/${encodeURIComponent(id)}`;

  function failure(key, id) {
    if (state(key, id)?.status !== "error") return "";
    return `<div class="notice notice--error" role="status"><div><strong>Diese Daten fehlen gerade.</strong><p>Bitte lade die Ansicht erneut. Fehlende Werte werden als „—“ angezeigt.</p></div><button class="button button--small" data-action="refresh">Erneut versuchen</button></div>`;
  }

  function profileTable() {
    const profiles = profilesOf(value("overview"));
    if (!profiles) return state("overview")?.status === "loading"
      ? '<div class="loading" role="status">Profile werden geladen …</div>'
      : empty("Profile nicht verfügbar", "Die Profildaten konnten noch nicht geladen werden.");
    const pagination = paginateProfiles(filterProfiles(profiles, query, route.filter), profilePage);
    profilePage = pagination.page;
    const visible = pagination.items;
    if (!visible.length) return empty(profiles.length ? "Keine passenden Profile" : "Noch keine Profile", profiles.length ? "Versuche einen anderen Suchbegriff oder wähle einen anderen Filter." : "Hier erscheinen die vorhandenen Mandatsprofile.");
    return `<div class="table-wrap"><table><thead><tr><th scope="col">Profil</th><th scope="col">Region</th><th scope="col">Profilangaben</th><th scope="col">Zustand</th></tr></thead><tbody>${visible.map(p => `<tr>
      <td><a class="person" href="${profileHref(p.id)}"><span class="avatar" aria-hidden="true">${e(initials(p.fullName))}</span><span><strong>${e(p.fullName || p.id)}</strong><small>${e(p.party || "Partei nicht angegeben")}</small></span></a></td>
      <td data-label="Region">${e(p.state || "Nicht angegeben")}</td><td data-label="Profilangaben">${badge(profileState(p))}</td>
      <td data-label="Zustand"><span class="plain-state">${p.profileActive === true ? "Aktiv" : p.profileActive === false ? "Inaktiv" : "Nicht bekannt"}</span></td>
    </tr>`).join("")}</tbody></table></div>`;
  }

  function profilePagination() {
    const result = paginateProfiles(filterProfiles(profilesOf(value("overview")), query, route.filter), profilePage);
    if (result.pages === 1) return "";
    return `<nav class="pagination" aria-label="Profilseiten"><span>${result.first}–${result.last} von ${result.total}</span><div><button class="button" data-page="${result.page - 1}" ${result.page === 1 ? "disabled" : ""} aria-label="Vorherige Profilseite">←</button><button class="button" data-page="${result.page + 1}" ${result.page === result.pages ? "disabled" : ""} aria-label="Nächste Profilseite">→</button></div></nav>`;
  }

  function runsTable() {
    const runs = list(value("runs")?.processRuns);
    if (!runs) return empty("Läufe noch nicht verfügbar", "Sobald Laufdaten vorliegen, findest du sie hier.");
    if (!runs.length) return empty("Keine Läufe im aktuellen Ausschnitt", "Es wurden keine Laufprotokolle geliefert. Das ist kein Nachweis für abgeschlossene Briefings.");
    return `<div class="run-list">${runs.map(run => `<div class="run-row"><div class="run-time">${e(dateTime(run.startedAt, true))}</div><div class="run-name"><strong>${e(processLabel(run.process))}</strong><small>${run.finishedAt ? `Beendet um ${e(dateTime(run.finishedAt))} Uhr` : "Noch kein Abschluss gemeldet"}</small></div>${badge(runState(run.status))}</div>`).join("")}</div>`;
  }

  function overview() {
    const ov = value("overview"), budget = value("budget"), sources = value("sources");
    const counts = profileCounts(ov);
    const cost = todayCost(budget);
    const hints = attentionItems(ov, sources);
    const sourcesKnown = sources?.stoerungen?.verfuegbar === true
      && Array.isArray(sources.stoerungen.handlungsbedarf) && Array.isArray(sources.stoerungen.gestoerte);
    const profilesKnown = profilesOf(ov)?.every(p => p.profileActive === false || typeof p.validierung?.bereit === "boolean") === true;
    return `${failure("overview")}${failure("budget")}${failure("sources")}
      <section class="metrics" aria-label="Kennzahlen">${metric("Profile", integer(counts.total), "Mandatsprofile insgesamt")}${metric("Davon aktiv", integer(counts.active), "Laut Profilstatus")}${metric("KI-Kosten heute", cost.value, cost.note)}${metric("Konten", integer(ov?.counts?.users), "Nutzer und Administratoren")}</section>
      <section class="section"><div class="section-head"><div><h2>Braucht Aufmerksamkeit</h2><p>Die nächsten sinnvollen Schritte.</p></div>${hints.length ? `<span class="count">${hints.length}</span>` : ""}</div>
        ${hints.length ? `<div class="attention-list">${hints.map(item => `<a class="attention-item" href="${item.href}"><span class="attention-icon" aria-hidden="true">!</span><span class="attention-copy"><strong>${e(item.title)}</strong><span>${e(item.text)}</span><span class="text-link">${e(item.label)}</span></span>${icon("arrow")}</a>`).join("")}</div>`
          : profilesKnown && sourcesKnown ? empty("Keine offenen Hinweise", "Die verfügbaren Profil- und Quellenprüfungen melden keinen Handlungsbedarf. Die Ergebnisqualität ist noch nicht beurteilt.") : empty("Der Stand ist noch unvollständig", "Für eine verlässliche Übersicht fehlen noch Profil- oder Quellenprüfungen.")}
      </section>
      <div class="two-columns"><section class="section"><div class="section-head"><div><h2>Ergebnisse</h2><p>Briefing, Zustellung und Lage.</p></div></div>
        <div class="result-list">${["Briefing", "Zustellung", "Lage"].map(label => `<div><span>${label}</span>${badge({ label: "Nicht geprüft" })}</div>`).join("")}</div>
        <p class="section-note">Eine geprüfte Tagesbilanz liegt in dieser Ansicht noch nicht vor. Abgeschlossene Läufe allein bestätigen keine vollständigen oder brauchbaren Inhalte.</p>
      </section><section class="section"><div class="section-head"><div><h2>Letzte Abläufe</h2><p>Was zuletzt verarbeitet wurde.</p></div><a class="text-link" href="#/betrieb/ablaeufe">Alle ansehen ${icon("arrow")}</a></div>${failure("runs")}${runsTable()}</section></div>`;
  }

  function profiles() {
    const items = filterProfiles(profilesOf(value("overview")), query, route.filter);
    return `${failure("overview")}<div class="toolbar"><label class="search" for="profile-search">${icon("search")}<input id="profile-search" type="search" placeholder="Profile suchen" aria-label="Profile nach Name, Region oder Partei suchen" value="${e(query)}" autocomplete="off"></label>
      <div class="segments" role="group" aria-label="Profile filtern">${[["all", "Alle"], ["active", "Aktiv"], ["attention", "Zu prüfen"]].map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${route.filter === key}">${label}</button>`).join("")}</div></div>
      <div class="list-meta"><span id="profile-count" role="status" aria-live="polite">${profilesOf(value("overview")) ? `${items.length} ${items.length === 1 ? "Profil" : "Profile"}` : "Profile werden geladen …"}</span><span>Profilangaben und Aktivstatus</span></div><div class="surface" id="profile-table">${profileTable()}</div><div id="profile-pagination">${profilePagination()}</div>
      <p class="section-note">„Profil vollständig“ bezieht sich auf die Profilangaben. Es ist kein Qualitätsurteil über die erzeugten Inhalte.</p>`;
  }

  function profileDetail() {
    const detail = value("profile", route.id);
    if (!detail) return `${failure("profile", route.id)}${state("profile", route.id)?.status === "loading" ? '<div class="loading" role="status">Profil wird geladen …</div>' : ""}`;
    const p = detail.profile || {}, validation = detail.validierung || p.validierung || {};
    const missing = list(validation.fehlendePflichtfelder) || [];
    return `<a class="back-link" href="#/profile">← Alle Profile</a><section class="detail-hero"><span class="avatar avatar--large" aria-hidden="true">${e(initials(p.fullName || p.name))}</span><div><h2>${e(p.fullName || p.name || route.id)}</h2><p>${e(parliamentLabel(p))}</p></div>${badge(profileState({ ...p, validierung: validation }))}</section>
      ${missing.length ? `<div class="notice"><div><strong>Diese Angaben fehlen noch</strong><p>${missing.map(e).join(" · ")}</p></div></div>` : ""}
      <section class="section"><div class="section-head"><div><h2>Mandat</h2><p>Die vorhandenen Angaben zum Profil.</p></div></div><dl class="facts">${[
        ["Region", p.state], ["Partei", p.party], ["Fraktion", p.faction], ["Wahlkreis", p.constituency],
        ["Ausschüsse", list(p.committees)?.join(", ") || p.committee], ["Themen", list(p.focusTopics)?.join(", ")],
        ["Profilstatus", p.profileActive === false ? "Inaktiv" : p.profileActive === true ? "Aktiv" : null]
      ].map(([label, text]) => `<div><dt>${label}</dt><dd>${e(text || "Nicht angegeben")}</dd></div>`).join("")}</dl></section>
      <section class="section"><div class="section-head"><div><h2>Briefing und Lage</h2></div></div><p class="section-note">Für dieses Profil liegt hier noch keine geprüfte Tagesbilanz vor. Die vorhandenen Inhalte werden durch diese Ansicht nicht neu erzeugt.</p></section>
      <details class="technical"><summary>Technische Details</summary><dl class="facts"><div><dt>Profilkennung</dt><dd>${e(route.id)}</dd></div></dl></details>`;
  }

  function sources() {
    const source = value("sources"), report = source?.stoerungen;
    const issues = list(report?.gestoerte);
    return `${failure("sources")}<section class="metrics metrics--compact">${metric("Quellen im Katalog", integer(source?.zaehler?.abrufwege), "Konfigurierte Abrufwege")}${metric("Mit Handlungsbedarf", report?.verfuegbar === true ? integer(list(report.handlungsbedarf)?.length) : "—", "Aus der Abrufhistorie")}</section>
      <section class="section"><div class="section-head"><div><h2>Quellen mit Hinweisen</h2><p>Was bekannt ist und was du prüfen kannst.</p></div></div>${report?.verfuegbar !== true || !issues ? empty("Noch keine belastbare Quellenprüfung", "Der aktuelle Abrufzustand konnte nicht bestimmt werden.")
        : !issues?.length ? empty("Keine Quellenhinweise gemeldet", "Die verfügbare Abrufhistorie enthält keine gemeldeten Störungen.")
          : `<div class="source-list">${issues.map(s => `<article class="source-row"><div><h3>${e(s.name || "Quelle")}</h3><p>${e(s.erklaerung || s.kurz || "Es liegt ein Hinweis vor.")}</p><small>Letzter Erfolg: ${e(dateTime(s.letzterErfolg, true))}</small></div>${badge({ label: s.kurz || "Prüfen", tone: "warn" })}</article>`).join("")}</div>`}</section>
      <p class="section-note">Ein fehlender Abrufbeleg bedeutet nicht automatisch, dass alle Inhalte eines Profils fehlen.</p>`;
  }

  function costs() {
    const budget = value("budget");
    const cost = todayCost(budget);
    return `${failure("budget")}${cost.unknown > 0 ? `<div class="notice"><div><strong>Ein Teil der Kosten ist noch offen.</strong><p>Für ${integer(cost.unknown)} Aufrufe fehlen Kostenangaben. Der bekannte Betrag liegt bei ${e(money(cost.known))}.</p></div></div>` : ""}<section class="metrics metrics--compact">${metric("Heute", cost.value, cost.note)}${metric("Monat · bekannter Betrag", money(budget?.monat?.estimatedCostUsd), "Unbekannte Kosten nicht enthalten")}${metric("Aufrufe heute", integer(budget?.calls), "Budgetwirksame Aufrufe")}</section>
      <section class="section cost-explainer"><span class="eyebrow">Kosten verstehen</span><h2>Eine Währung. Ein klarer Zeitraum.</h2><p>Die KI-Kosten werden in US-Dollar angezeigt. Der Kostentag beginnt um 00:00 Uhr UTC. Kundenpreise stehen getrennt davon in Euro.</p>
      <dl class="facts"><div><dt>Kostentag</dt><dd>${e(budget?.day || "Nicht verfügbar")}</dd></div><div><dt>Monat ab</dt><dd>${e(budget?.monat?.seit || "Nicht verfügbar")}</dd></div></dl>
      <p class="section-note">Die Beträge sind protokollierte Schätzwerte, keine Anbieterrechnung. Nicht bekannte Preise oder unvollständige Protokolle können zu Lücken führen.</p></section>`;
  }

  function operations() {
    return `<nav class="tabs" aria-label="Betriebsbereiche">${[["ablaeufe", "Abläufe"], ["quellen", "Quellen"], ["kosten", "Kosten"]].map(([tab, label]) => `<a href="#/betrieb/${tab}" ${route.tab === tab ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav>${route.tab === "quellen" ? sources() : route.tab === "kosten" ? costs() : `${failure("runs")}<section class="section"><div class="section-head"><div><h2>Letzte Abläufe</h2><p>Die zuletzt gemeldeten Verarbeitungsschritte.</p></div></div>${runsTable()}</section><p class="section-note">Ein abgeschlossener Lauf bestätigt die Verarbeitung. Ob die Ergebnisse vollständig und fachlich brauchbar sind, wird gesondert geprüft.</p>`}`;
  }

  function customers() {
    const data = value("customers"), accounts = list(data?.kunden);
    return `${failure("customers")}<section class="metrics metrics--compact">${metric("Kundenkonten", accounts ? integer(accounts.length) : "—", "Vorhandene Kundenangaben")}${metric("Monatliche Preise", money(data?.mrrEur, "EUR"), "Summe gepflegter Monatspreise")}${metric("Zahlung überfällig", integer(data?.counts?.overdue), "Laut gepflegtem Zahlungsstatus")}</section>
      <section class="section"><div class="section-head"><div><h2>Kundenkonten</h2><p>Zugang und Zahlungsstatus auf einen Blick.</p></div></div>${!accounts ? empty("Kundendaten noch nicht verfügbar", "Lade die Ansicht erneut, um die Konten anzuzeigen.") : !accounts.length ? empty("Noch keine Kundendaten", "Hier erscheinen Konten mit Kundenangaben.") : `<div class="table-wrap"><table><thead><tr><th scope="col">Konto</th><th scope="col">Monatspreis</th><th scope="col">Zahlung</th><th scope="col">Zugang</th></tr></thead><tbody>${accounts.map(k => `<tr><td><a class="person" href="#/kunde/${encodeURIComponent(k.userId)}"><span class="avatar" aria-hidden="true">${e(initials(k.name))}</span><span><strong>${e(k.name || "Kundenkonto")}</strong><small>${e(k.email || "")}</small></span></a></td><td data-label="Monatspreis">${e(money(k.customer?.pricePerMonth, "EUR"))}</td><td data-label="Zahlung">${badge({ label: paymentLabel(k.customer?.paymentStatus), tone: k.customer?.paymentStatus === "overdue" ? "warn" : "neutral" })}</td><td data-label="Zugang">${e(accessLabel(k))}</td></tr>`).join("")}</tbody></table></div>`}</section><p class="section-note">Preise und Zahlungsstatus sind manuell gepflegte Kontoangaben. Die Summe der Monatspreise ist kein Nachweis eingegangener Zahlungen.</p>`;
  }

  function customerDetail() {
    const account = list(value("customers")?.kunden)?.find(k => k.userId === route.id);
    if (!account) return `${failure("customers")}${empty("Konto nicht gefunden", "Gehe zurück zur Kundenübersicht und wähle ein vorhandenes Konto.")}<a class="text-link" href="#/kunden">← Alle Kundenkonten</a>`;
    const c = account.customer || {};
    const statuses = { aktiv: "Aktiv", pausiert: "Pausiert", eingeladen: "Eingeladen", testphase: "Testphase", gekuendigt: "Gekündigt", deaktiviert: "Deaktiviert" };
    return `<a class="back-link" href="#/kunden">← Alle Kundenkonten</a><section class="detail-hero"><span class="avatar avatar--large" aria-hidden="true">${e(initials(account.name))}</span><div><h2>${e(account.name || "Kundenkonto")}</h2><p>${e(account.email || "")}</p></div>${badge({ label: `Zugang ${accessLabel(account).toLowerCase()}` })}</section>
      ${account.status === "pausiert" && account.active === true ? '<div class="notice"><div><strong>Das Konto ist pausiert, der Zugang bleibt offen.</strong><p>„Pausiert“ ist der Kontostatus. Für den Zugang gilt die separat angezeigte Freigabe.</p></div></div>' : ""}
      <section class="section"><div class="section-head"><div><h2>Kontoangaben</h2></div></div><dl class="facts">${[["Kontostatus", statuses[account.status] || "Nicht bekannt"], ["Zugang", accessLabel(account)], ["Monatspreis", money(c.pricePerMonth, "EUR")], ["Zahlungsstatus", paymentLabel(c.paymentStatus)], ["Beginn", c.startDate || "Nicht gepflegt"], ["Nächste Rechnung", c.nextInvoice || "Nicht gepflegt"]].map(([label, text]) => `<div><dt>${label}</dt><dd>${e(text)}</dd></div>`).join("")}</dl>${account.politicianId ? `<a class="text-link" href="${profileHref(account.politicianId)}">Zugeordnetes Profil ansehen ${icon("arrow")}</a>` : '<p class="section-note">Kein Profil direkt am Konto zugeordnet.</p>'}</section>`;
  }

  function render() {
    if (closed) return;
    const focused = root.contains(document.activeElement) && document.activeElement.id === "profile-search" ? document.activeElement : null;
    const selection = focused ? [focused.selectionStart, focused.selectionEnd] : null;
    const authError = [...entries.values()].find(v => v.status === "error" && [401, 403].includes(v.error?.status));
    const active = route.section === "profil" ? "profile" : route.section === "kunde" ? "kunden" : route.section;
    const titles = { ueberblick: ["Überblick", "Alles Wichtige. An einem Ort."], profile: ["Profile", "Mandate und Profilangaben im Blick."], profil: ["Profil", "Die Angaben zu diesem Mandat."], betrieb: ["Betrieb", "Abläufe, Quellen und Kosten."], kunden: ["Kunden", "Konten einfach im Blick behalten."], kunde: ["Kundenkonto", "Zugang und Kundenangaben."], missing: ["Seite nicht gefunden", "Diese Ansicht gibt es nicht."] };
    const [title, subtitle] = titles[route.section] || titles.missing;
    const content = authError ? `<section class="section">${empty(authError.error.status === 401 ? "Bitte erneut anmelden" : "Kein Zugriff", authError.error.message)}${authError.error.status === 401 ? '<a class="button" href="/">Zur Anmeldung</a>' : ""}</section>`
      : route.section === "ueberblick" ? overview() : route.section === "profile" ? profiles() : route.section === "profil" ? profileDetail() : route.section === "betrieb" ? operations() : route.section === "kunden" ? customers() : route.section === "kunde" ? customerDetail() : '<a class="button" href="#/ueberblick">Zum Überblick</a>';
    root.innerHTML = `<a class="skip-link" href="#admin-main">Zum Inhalt</a><aside class="rail"><a href="#/ueberblick" class="brand" aria-label="Helmut Verwaltung, zum Überblick"><span class="brand-mark" aria-hidden="true">H</span><span>helmut<span class="brand-sub">Verwaltung</span></span></a><nav class="main-nav" aria-label="Hauptnavigation">${NAV.map(([key, label, name]) => `<a href="#/${key === "betrieb" ? "betrieb/ablaeufe" : key}" ${active === key ? 'aria-current="page"' : ""}>${icon(name)}<span>${label}</span></a>`).join("")}</nav><div class="rail-foot"><span class="operator-mark" aria-hidden="true">H</span><span><strong>Betreiberbereich</strong><small>Lesende Ansicht</small></span></div></aside>
      <main id="admin-main" tabindex="-1"><div class="topline"><span>Helmut Verwaltung</span>${preview ? '<span class="preview-label">Vorschau · Beispieldaten</span>' : '<span>Lesende Ansicht</span>'}</div><header class="page-head"><div><h1 tabindex="-1" id="page-title">${title}</h1><p>${subtitle}</p></div><button class="button refresh" data-action="refresh" aria-label="Daten aktualisieren">${icon("refresh")}<span>Aktualisieren</span></button></header><div class="page-content">${content}</div><footer class="page-foot"><span>${preview ? "Alle Personen, Konten und Werte sind fiktive Beispiele." : "Zeiten in Europe/Berlin. Fehlende Werte bleiben offen."}</span><span>Helmut</span></footer></main>`;
    if (selection) {
      const input = root.querySelector("#profile-search");
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(...selection);
    } else if (focusHeading) {
      root.querySelector("#page-title")?.focus({ preventScroll: true });
      focusHeading = false;
    }
  }

  async function load(force = false) {
    const generation = ++version;
    if (force) { reader.clear?.(); entries = new Map(); }
    const requested = route.section === "ueberblick" ? [["overview"], ["budget"], ["sources"], ["runs"]]
      : ["profile"].includes(route.section) ? [["overview"]]
        : route.section === "profil" ? [["profile", route.id]]
          : ["kunden", "kunde"].includes(route.section) ? [["customers"]]
            : route.section === "betrieb" ? [[route.tab === "quellen" ? "sources" : route.tab === "kosten" ? "budget" : "runs"]] : [];
    const missing = requested.filter(([key, id]) => !entries.has(keyFor(key, id)) || entries.get(keyFor(key, id)).status === "loading");
    for (const [key, id] of missing) entries.set(keyFor(key, id), { status: "loading" });
    render();
    await Promise.all(missing.map(async ([key, id]) => {
      try {
        const data = await reader.read(key, id);
        if (!closed && generation === version) entries.set(keyFor(key, id), { status: "ok", data });
      } catch (error) {
        if (!closed && generation === version) entries.set(keyFor(key, id), { status: "error", error });
      }
    }));
    if (closed || generation !== version) return;
    render();
  }

  function onInput(event) {
    if (event.target.id !== "profile-search") return;
    query = event.target.value;
    profilePage = 1;
    root.querySelector("#profile-table").innerHTML = profileTable();
    root.querySelector("#profile-pagination").innerHTML = profilePagination();
    const count = filterProfiles(profilesOf(value("overview")), query, route.filter).length;
    root.querySelector("#profile-count").textContent = `${count} ${count === 1 ? "Profil" : "Profile"}`;
  }
  function onClick(event) {
    if (event.target.closest(".skip-link")) {
      event.preventDefault();
      root.querySelector("#admin-main")?.focus();
      return;
    }
    const target = event.target.closest("button");
    if (!target || !root.contains(target)) return;
    if (target.dataset.action === "refresh") { load(true); return; }
    if (target.dataset.page) {
      profilePage = Number(target.dataset.page);
      render();
      root.querySelector("#page-title")?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.filter) {
      profilePage = 1;
      route.filter = target.dataset.filter;
      history.replaceState(null, "", `#/profile${route.filter === "all" ? "" : `?filter=${route.filter}`}`);
      render();
      root.querySelector(`[data-filter="${route.filter}"]`)?.focus();
    }
  }
  function onRoute() {
    route = parseRoute(location.hash);
    query = "";
    profilePage = 1;
    focusHeading = true;
    load();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  root.addEventListener("input", onInput);
  root.addEventListener("click", onClick);
  window.addEventListener("hashchange", onRoute);
  load();
  return {
    destroy() {
      closed = true;
      ++version;
      reader.dispose?.();
      root.removeEventListener("input", onInput);
      root.removeEventListener("click", onClick);
      window.removeEventListener("hashchange", onRoute);
      root.replaceChildren();
    }
  };
}
