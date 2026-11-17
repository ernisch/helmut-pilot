"use strict";
// Echter PDF-Parser an einer winzigen, selbst erzeugten Text-PDF, ohne Original-
// kopie, Bild/Canvas, Netz, Dateizugriff aus dem Parser oder Modellaufruf.
const A = require("node:assert/strict"), P = require("../lib/helmut/quellen-bundestag-termine-pdf");
function pdf() {
  const stream = "BT /F1 12 Tf 50 750 Td (Tagesordnungspunkt 12) Tj 0 -20 Td (Votenfrist: 11.11.2026) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text = "%PDF-1.4\n", offsets = [0];
  objects.forEach((o,i) => { offsets.push(Buffer.byteLength(text)); text += `${i+1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(text); text += `xref\n0 6\n0000000000 65535 f \n`;
  text += offsets.slice(1).map(o => `${String(o).padStart(10,"0")} 00000 n \n`).join("");
  text += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}
(async () => {
  const pages = await P.lesen(pdf()); A.equal(pages.length, 1);
  A(pages[0].includes("Tagesordnungspunkt 12")); A(pages[0].includes("Votenfrist: 11.11.2026"));
  console.log("PASS Echte PDF-Textextraktion ohne Rendering");
  await A.rejects(P.lesen(Buffer.from("HTML statt PDF")), /pdf-bytes/);
  await A.rejects(P.lesen(Buffer.alloc(P.MAX_BYTES+1)), /pdf-bytes/);
  console.log("PASS Format und Groessenlimit vor PDF-Leser");
  const controller = new AbortController(); controller.abort(Error("abgebrochen"));
  await A.rejects(P.lesen(pdf(), { signal: controller.signal }), /abgebrochen/);
  console.log("PASS Abbruch vor Parserstart");
  await A.rejects(P.lesen(Buffer.from("%PDF-kein-Gueltiges-Dokument")));
  console.log("PASS Beschaedigte PDF bleibt Fehler");
  console.log("4/4 PDF-Gruppen bestanden.");
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
