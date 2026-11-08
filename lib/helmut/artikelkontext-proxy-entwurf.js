"use strict";

// UNVERBUNDENER ENTWURF: kein Runtime-Aufrufer. Insbesondere kein automatischer
// Ersatz des Crawlertransports anhand HTTPS_PROXY. Vor einem Anschluss muss der
// Proxyvertrag IP-Authority UND Originalhost-Freigabe gemeinsam bestaetigen.
// Ausschliesslich fuer den ausdruecklichen Artikelkontextabruf. Ein Tunnel zur
// geprueften IP erhaelt die DNS-Bindung; Hostname-CONNECT waere eine neue Aufloesung.
// Verweigert ein Proxy IP-CONNECT, gibt es keinen direkten/Hostname-Fallback.
const http = require("node:http"), https = require("node:https"), tls = require("node:tls");
const S = require("./artikelkontext-abrufschutz");
const fehler = grund => new Error("artikelkontext-" + grund);

function proxyFuer(host, env = process.env) {
  const raw = env.https_proxy || env.HTTPS_PROXY;
  if (!raw) {
    if (env.all_proxy || env.ALL_PROXY) throw fehler("proxy-verfahren-nicht-unterstuetzt");
    return null;
  }
  // NO_PROXY wird nicht entfernt oder ueberschrieben. Nur deklarierte Host- und
  // Domainregeln; eine unbekannte Schreibweise ist kein stiller Direktfreibrief.
  for (const entry of String(env.no_proxy || env.NO_PROXY || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)) {
    if (entry === "*") return null;
    // IP-Eintraege beziehen sich auf IP-URLs; Artikel-URLs erlauben keine IPs.
    if (/^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?(?::\d+)?$/.test(entry) || /^\[[0-9a-f:]+\](?::\d+)?$/.test(entry)) continue;
    const m = entry.match(/^(\*\.|\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d+))?$/);
    if (!m) throw fehler("proxy-ausnahmeregel-ungueltig");
    if (m[3] && Number(m[3]) !== 443) continue;
    if ((m[1] !== "*." && host === m[2]) || (m[1] && host.endsWith("." + m[2]))) return null;
  }
  let u;
  if (typeof raw !== "string" || /[\u0000-\u0020\u007f]/u.test(raw)) throw fehler("proxy-konfiguration-ungueltig");
  try { u = new URL(raw); } catch { throw fehler("proxy-konfiguration-ungueltig"); }
  if (!["http:", "https:"].includes(u.protocol) || !u.hostname || u.pathname !== "/" || u.search || u.hash)
    throw fehler("proxy-konfiguration-ungueltig");
  let authorization = null;
  if (u.username || u.password) {
    let credentials;
    try { credentials = decodeURIComponent(u.username) + ":" + decodeURIComponent(u.password); }
    catch { throw fehler("proxy-konfiguration-ungueltig"); }
    if (/[\u0000-\u001f\u007f]/u.test(credentials)) throw fehler("proxy-konfiguration-ungueltig");
    authorization = "Basic " + Buffer.from(credentials).toString("base64");
  }
  // Nie die rohe Proxy-URL in Fehlern, Logs oder im Artikelrequest verwenden.
  return { protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ""), port: Number(u.port) || (u.protocol === "https:" ? 443 : 80), authorization };
}

function artikelAgent(url, signal, env = process.env, deps = {}) {
  const host = S.artikelHost(url), proxy = proxyFuer(host, env);
  if (!proxy) return false;
  if (!(signal instanceof AbortSignal)) throw fehler("proxy-abbruchsignal-fehlt");
  const client = proxy.protocol === "https:" ? (deps.https || https) : (deps.http || http);
  const tlsClient = deps.tls || tls;
  const agent = new https.Agent({ keepAlive: false, maxSockets: 1, maxTotalSockets: 1, maxCachedSessions: 0 });
  let benutzt = false;
  agent.createConnection = (options, callback) => {
    if (benutzt || options.host !== host || Number(options.port) !== 443) {
      callback(fehler("proxy-verbindungsbindung-abweichend")); return;
    }
    benutzt = true;
    let fertig = false, connectRequest, tunnel, secure;
    const ende = (error, socket) => {
      if (fertig) return;
      fertig = true;
      signal?.removeEventListener("abort", abbrechen);
      if (error) {
        connectRequest?.destroy(); secure?.destroy(); tunnel?.destroy();
      }
      callback(error, socket);
    };
    const abbrechen = () => ende(fehler("abruf-abgebrochen"));
    if (signal?.aborted) { abbrechen(); return; }
    signal?.addEventListener("abort", abbrechen, { once: true });
    // Derselbe DNS-Pruefer wie im Direktpfad: ALLE Antworten pruefen, genau die
    // zurueckgegebene oeffentliche IPv4 als CONNECT-Authority verwenden.
    S.artikelLookup(host, deps.lookup)(host, {}, (error, address) => {
      if (fertig) return;
      if (error) { ende(error); return; }
      const authority = address + ":443";
      const headers = { Host: authority };
      if (proxy.authorization) headers["Proxy-Authorization"] = proxy.authorization;
      try {
        connectRequest = client.request({ protocol: proxy.protocol, hostname: proxy.hostname, port: proxy.port,
          method: "CONNECT", path: authority, headers, agent: false, maxHeaderSize: 16384,
          rejectUnauthorized: true, ...(proxy.protocol === "https:" ? { servername: proxy.hostname } : {}) });
        connectRequest.once("error", () => ende(fehler("proxy-verbindung-fehlgeschlagen")));
        connectRequest.once("response", response => { response.destroy(); ende(fehler("proxy-connect-abgelehnt")); });
        connectRequest.once("connect", (response, socket, head) => {
          tunnel = socket;
          if (fertig) { socket.destroy(); return; }
          if (response.statusCode !== 200 || !Buffer.isBuffer(head) || head.length) { ende(fehler("proxy-connect-abgelehnt")); return; }
          socket.once("error", () => ende(fehler("proxy-tunnel-fehlgeschlagen")));
          try {
            secure = tlsClient.connect({ socket, servername: host, rejectUnauthorized: true,
              checkServerIdentity: (_, cert) => tls.checkServerIdentity(host, cert) });
            secure.once("error", () => ende(fehler("proxy-artikel-tls-fehlgeschlagen")));
            secure.once("secureConnect", () => {
              if (secure.authorized !== true) { ende(fehler("proxy-artikel-tls-fehlgeschlagen")); return; }
              ende(null, secure);
            });
          } catch { ende(fehler("proxy-artikel-tls-fehlgeschlagen")); }
        });
        connectRequest.end();
      } catch { ende(fehler("proxy-verbindung-fehlgeschlagen")); }
    });
  };
  return agent;
}

module.exports = { proxyFuer, artikelAgent };
