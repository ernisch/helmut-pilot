"use strict";

// Konservativer Negativfilter fuer ausgeschriebene deutsche, numerische und
// ISO-Kalenderdaten. Keine Aufloesung relativer Tage, keine Metadaten als Beleg.
// Ein enthaltenes Datum beweist weder Handlung noch Rolle: das separate
// Quellenurteil bleibt auch bei erfolgreicher Vorpruefung zwingend.
const MONATE = ["januar", "februar", "märz", "april", "mai", "juni", "juli",
  "august", "september", "oktober", "november", "dezember"];
const MONATSFORMEN = "januar|jan\\.?|februar|feb\\.?|märz|maerz|mär\\.?|mrz\\.?|april|apr\\.?|mai|juni|jun\\.?|juli|jul\\.?|august|aug\\.?|september|sept?\\.?|oktober|okt\\.?|november|nov\\.?|dezember|dez\\.?";
function monat(wert) {
  const s = wert.toLowerCase().replace(/\.$/, "").replace("maerz", "märz");
  if (s === "mrz") return 3;
  return MONATE.findIndex(m => m.startsWith(s)) + 1;
}
function kalenderdaten(text) {
  const daten = [];
  const s = String(text || "").normalize("NFC");
  const add = (tag, mon, jahr) => daten.push({ tag: Number(tag), monat: Number(mon), jahr: jahr ? Number(jahr) : null });
  // Wortgrenzen verhindern Treffer in Kennungen, Geldbetraegen und laengeren
  // Zahlen. Jahreslose Daten duerfen keine erfundene Jahreszahl legitimieren.
  for (const m of s.matchAll(/(?<![\p{L}\p{N}_])(\d{4})-(\d{2})-(\d{2})(?![\p{L}\p{N}_])/gu)) add(m[3], m[2], m[1]);
  for (const m of s.matchAll(/(?<![\p{L}\p{N}_.])(\d{1,2})\.(\d{1,2})\.(?:(\d{4})(?!\d))?(?![\p{L}\p{N}_])/gu)) add(m[1], m[2], m[3]);
  const lang = new RegExp("(?<![\\p{L}\\p{N}_])(\\d{1,2})\\.\\s*(" + MONATSFORMEN + ")(?![\\p{L}])(?:\\s+(\\d{4})(?!\\d))?", "giu");
  for (const m of s.matchAll(lang)) add(m[1], monat(m[2]), m[3]);
  return daten;
}
function gueltig(d) {
  const jahr = d.jahr ?? 2000; // 29. Februar ohne Jahr ist moeglich.
  if (jahr < 1 || d.monat < 1 || d.monat > 12) return false;
  const schaltjahr = jahr % 4 === 0 && (jahr % 100 !== 0 || jahr % 400 === 0);
  return d.tag >= 1 && d.tag <= [31, schaltjahr ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][d.monat - 1];
}
function datumsangabenGebunden(text, quelle) {
  // Felder getrennt lesen: ein Titelende und Auszugsanfang sind kein Datum.
  const belege = [quelle?.titel, quelle?.auszug].flatMap(kalenderdaten).filter(gueltig);
  return kalenderdaten(text).every(d => gueltig(d) && belege.some(b => b.tag === d.tag
    && b.monat === d.monat && (d.jahr === null || b.jahr === d.jahr)));
}
module.exports = { datumsangabenGebunden };
