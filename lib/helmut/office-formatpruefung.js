"use strict";

// Local structural checks, not a fact check or publication approval.
const RULES = Object.freeze({
  press: { minWords: 90, maxWords: 130, paragraphs: 2, hashtags: 0 },
  linkedin: { minChars: 650, maxChars: 900, paragraphs: 2 },
  x: { maxXUnits: 240, paragraphs: 1 },
  instagram: { minChars: 450, maxChars: 700, hashtags: 3 },
  committee_question: { questions: [2, 3], maxItemWords: 35 },
  citizen_dialogue: { minWords: 80, maxWords: 120, hashtags: 0 },
  internal_line: { bullets: 5, maxItemWords: 25 }
});

function words(text) {
  return (text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
}

// Conservative X count: wide characters weigh two; URLs never less than 23.
// Emoji sequences/long URLs can be overcounted. No claim of an exact X parser.
function xUnits(text) {
  const weight = value => Array.from(value).reduce((n, c) => {
    const p = c.codePointAt(0);
    return n + (p <= 0x10ff || (p >= 0x2000 && p <= 0x200d)
      || (p >= 0x2010 && p <= 0x201f) || (p >= 0x2032 && p <= 0x2037) ? 1 : 2);
  }, 0);
  return text.split(/(https?:\/\/\S+)/iu).reduce((n, part) => {
    if (!/^https?:\/\//iu.test(part)) return n + weight(part);
    const trailing = part.match(/[\p{P}]+$/u)?.[0] || "";
    return n + Math.max(23, weight(part.slice(0, part.length - trailing.length))) + weight(trailing);
  }, 0);
}

function check(text, channel, evidence = []) {
  const rule = RULES[channel];
  const value = String(text || "").replace(/\r\n?/g, "\n").trim();
  const issues = [];
  if (!rule) return { valid: false, issues: ["format-unbekannt"] };
  const count = words(value), chars = Array.from(value).length;
  const paragraphs = value.split(/\n\s*\n/u).filter(s => s.trim());
  if (!value || /```|^\s*#{1,6}\s/mu.test(value)) issues.push("textstruktur");
  if (rule.minWords && (count < rule.minWords || count > rule.maxWords)) issues.push("wortzahl");
  if (rule.minChars && (chars < rule.minChars || chars > rule.maxChars)) issues.push("zeichenanzahl");
  if (rule.maxXUnits && (xUnits(value) > rule.maxXUnits || /^\d+\/\d+(?:\s|$)/u.test(value))) issues.push("x-einzelpost");
  if (rule.paragraphs && paragraphs.length !== rule.paragraphs) issues.push("absatzanzahl");
  if (rule.hashtags !== undefined && (value.replace(/https?:\/\/\S+/giu, "").match(/#[\p{L}\p{N}_]+/gu) || []).length > rule.hashtags) issues.push("hashtags");
  if (rule.questions) {
    const markers = [...value.matchAll(/(?:^|\n)\s*(\d+)[.)]\s+/gu)];
    const items = markers.map((m, i) => value.slice(m.index + m[0].length, markers[i + 1]?.index ?? value.length).trim());
    if (markers[0]?.index !== 0 || items.length < rule.questions[0] || items.length > rule.questions[1]
      || markers.some((m, i) => Number(m[1]) !== i + 1)
      || items.some(s => !s.endsWith("?") || (s.match(/\?/gu) || []).length !== 1 || words(s) > rule.maxItemWords)) issues.push("fragenstruktur");
  }
  if (rule.bullets) {
    const lines = value.split("\n").filter(s => s.trim());
    if (lines.length !== rule.bullets || lines.some(s => !/^\s*[-*•]\s+\S/u.test(s) || words(s) > rule.maxItemWords)) issues.push("stichpunkte");
  }
  const original = evidence.map(s => `${s.title || ""} ${s.excerpt || s.summary || s.content || ""}`).join(" ").toLocaleLowerCase("de");
  for (const term of ["Ausschussgeschäftsordnung", "Geschäftsordnung des Ausschusses"]) {
    if (value.toLocaleLowerCase("de").includes(term.toLocaleLowerCase("de"))
      && !original.includes(term.toLocaleLowerCase("de"))) issues.push("unbelegter-verfahrensbezug");
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)], words: count, characters: chars };
}

module.exports = { RULES, check, words, xUnits };
