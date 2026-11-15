"use strict";

// Opt-in nur fuer die amtliche, an ein CELLAR-Werk gebundene RDF-/FMX4-Kette.
function config(url, value) {
  if (value == null) return null;
  const fail = () => { throw Error("eurlex-original-transportziel"); };
  if (!value || !["rdf", "zip"].includes(value.kind)
    || !/^http:\/\/publications\.europa\.eu\/resource\/cellar\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.workUri || "")
    || !/^http:\/\/publications\.europa\.eu\/resource\/oj\/L_\d{9}$/.test(value.journalUri || "")) fail();
  const target = new URL(url);
  if (target.protocol !== "https:" || target.hostname !== "publications.europa.eu"
    || target.username || target.password || target.port || target.search || target.hash) fail();
  const work = value.workUri.replace("http://", "https://"), tail = target.href.slice(work.length);
  if (value.kind === "zip") {
    if (!target.href.startsWith(work + ".") || !/^\.\d{4}\.\d{2}\/DOC_1$/.test(tail)) fail();
    return { accept: "application/zip", maxBytes: 256 * 1024, binary: true, mime: /^application\/zip(?:;|$)/i };
  }
  if (target.href !== value.journalUri.replace("http://", "https://") + ".DEU.fmx4"
    && !(target.href.startsWith(work + ".") && /^\.\d{4}\.\d{2}\/rdf\/object(?:\/full)?$/.test(tail))) fail();
  return { accept: "application/rdf+xml", maxBytes: 100 * 1024, binary: false,
    mime: /^application\/rdf\+xml(?:;|$)/i };
}
function redirect(url, value) {
  const target = new URL(url);
  if (target.protocol === "http:" && target.hostname === "publications.europa.eu") target.protocol = "https:";
  config(target.href, value); return target.href;
}
module.exports = { config, redirect };
