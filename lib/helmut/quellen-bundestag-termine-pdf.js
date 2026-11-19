"use strict";

// Nur Textextraktion aus bereits begrenzt geladenen Bytes. Kein URL-, Datei-,
// Canvas-, Skript-, Bild- oder Modellzugriff durch den PDF-Leser.
const MAX_BYTES = 2 * 1024 * 1024, MAX_PAGES = 40, MAX_TEXT = 160000;
async function lesen(bytes, { signal } = {}) {
  // PDF.js liest einen kurzen Präfix vor dem Header. Akzeptiert sind hier nur
  // UTF-8-BOM und Leerraum. Die Bytes und ihre XRef-Offsets bleiben unverändert.
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES
    || !/^(?:\xef\xbb\xbf)?[ \t\r\n]{0,32}%PDF-\d\.\d(?=[ \t\r\n]|$)/.test(bytes.subarray(0, 48).toString("latin1")))
    throw Error("bundestag-pdf-bytes");
  signal?.throwIfAborted();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  signal?.throwIfAborted();
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false,
    useSystemFonts: false, disableFontFace: true, useWorkerFetch: false,
    stopAtErrors: true, maxImageSize: 0, verbosity: 0 });
  let abbau;
  const schliessen = () => abbau ||= task.destroy();
  const abort = () => { void schliessen().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const doc = await task.promise;
    if (doc.numPages < 1 || doc.numPages > MAX_PAGES) throw Error("bundestag-pdf-seitenlimit");
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      signal?.throwIfAborted();
      const page = await doc.getPage(n), content = await page.getTextContent(), midpoint = page.getViewport({ scale: 1 }).width / 2;
      // Geometrische Zeilen statt PDF-internem Zeichen-/Spaltenstrom.
      const lines = [];
      for (const item of content.items.filter(i => typeof i.str === "string")
        .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
        const y = item.transform[5];
        let line = lines.find(l => Math.abs(l.y - y) < 2);
        if (!line) { line = { y, items: [] }; lines.push(line); }
        line.items.push(item);
      }
      pages.push(lines.sort((a, b) => b.y - a.y).map((l, n, all) => {
        let previous = null, text = l.items.every(i => i.transform[4] >= midpoint) ? "\t" : "";
        for (const item of l.items.sort((a, b) => a.transform[4] - b.transform[4])) {
          const gap = previous ? item.transform[4] - previous.transform[4] - previous.width : 0;
          const column = previous && previous.transform[4] < midpoint && item.transform[4] >= midpoint;
          text += (previous ? (gap > 20 || column ? "\t" : " ") : "") + item.str;
          previous = item;
        }
        return (n && all[n - 1].y - l.y > 19 ? "\n" : "") + text.trimEnd();
      }).join("\n"));
      if (pages.reduce((s, p) => s + p.length, 0) > MAX_TEXT) throw Error("bundestag-pdf-textlimit");
      page.cleanup();
    }
    if (!pages.some(p => p.trim())) throw Error("bundestag-pdf-ohne-text");
    signal?.throwIfAborted();
    return pages;
  } catch (error) {
    signal?.throwIfAborted();
    if (error?.name === "InvalidPDFException") throw Error("bundestag-pdf-beschaedigt");
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    await schliessen().catch(() => {});
  }
}
module.exports = { lesen, MAX_BYTES, MAX_PAGES, MAX_TEXT };
