"use strict";

// Nur fuer den ausdruecklichen Artikelkontextabruf. Keine Lockerung des Crawlers.
const dns = require("node:dns");
const { isIP, BlockList } = require("node:net");
const { MAX_ANTWORT_BYTES } = require("./artikelkontext-gewinnung");
const MAX_ABRUF_MS = 20000;
const gesperrt = new BlockList();
// Konservative Sperre der lokalen, speziellen und Multicast IPv4 Netze.
// IANA IPv4 Special-Purpose Address Registry, geprueft 17.09.2026.
for (const [netz, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]]) {
  gesperrt.addSubnet(netz, bits, "ipv4");
}
const fehler = grund => new Error("artikelkontext-" + grund);
function artikelHost(url) {
  let u;
  try { u = new URL(url); } catch { throw fehler("abrufziel-ungueltig"); }
  if (typeof url !== "string" || url.length > 2048 || /[\u0000-\u0020\u007f]/u.test(url)
    || u.protocol !== "https:" || u.username || u.password || u.port || u.hash || u.pathname === "/"
    || isIP(u.hostname) || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(u.hostname)
    || /\.(?:localhost|local|internal|invalid|test|example)$/.test(u.hostname)) throw fehler("abrufziel-ungueltig");
  return u.hostname;
}
const oeffentlich = address => isIP(address) === 4 && !gesperrt.check(address, "ipv4");
function artikelLookup(host, lookup = dns.lookup) {
  return (hostname, options, callback) => {
    if (hostname !== host) { callback(fehler("dns-hostwechsel")); return; }
    // IPv4 bewusst begrenzt; die gepruefte Adresse wird direkt dem Socket
    // geliefert. Kein zweites, ungeprueftes DNS Lookup und kein Pool Reuse.
    lookup(hostname, { family: 4, all: true }, (error, addresses) => {
      if (error) { callback(fehler("dns-nicht-erreichbar")); return; }
      if (!Array.isArray(addresses) || !addresses.length || addresses.length > 64
        || !addresses.every(a => a.family === 4 && oeffentlich(a.address))) {
        callback(fehler("dns-ziel-gesperrt")); return;
      }
      const address = addresses[0].address;
      if (options.all) callback(null, [{ address, family: 4 }]);
      else callback(null, address, 4);
    });
  };
}
function pruefeAntwort(response) {
  const h = response.headers || {};
  if (response.statusCode !== 200) throw fehler("http-status");
  if (!/^text\/html\s*(?:;\s*charset\s*=\s*["']?utf-8["']?\s*)?$/i.test(h["content-type"] || "")) throw fehler("inhaltstyp");
  if (h["content-encoding"] && h["content-encoding"].toLowerCase() !== "identity") throw fehler("komprimierte-antwort");
  if (h["content-length"] != null && (!/^\d+$/.test(h["content-length"])
    || Number(h["content-length"]) > MAX_ANTWORT_BYTES)) throw fehler("antwort-zu-gross");
}
module.exports = { MAX_ABRUF_MS, MAX_ANTWORT_BYTES, artikelHost, artikelLookup, pruefeAntwort };
