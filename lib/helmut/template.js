"use strict";

// Helmut Core V3 — C7b: Minimaler, abhaengigkeitsfreier Template-Renderer im
// Jinja2-Stil. KEIN nunjucks/EJS, KEIN eval, KEIN Fremdcode, KEINE KI.
//
// Unterstuetzt bewusst ein sicheres Subset der Jinja2-Syntax:
//   {{ variable }}                      Ausgabe (mit dotted paths: {{ a.b.c }})
//   {{ value | default("Fallback") }}   Filter-Kette (default/upper/lower/length/join/trim/e)
//   {% if X %}…{% elif Y %}…{% else %}…{% endif %}
//   {% for item in liste %}…{% else %}…{% endfor %}   (mit loop.index/index0/first/last/length)
//   {# Kommentar #}
//   {%- … -%} / {{- … -}}               Whitespace-Control (trim links/rechts)
//
// Die .j2-Dateien bleiben in echter Jinja2-Syntax -> spaeter 1:1 nach Python
// portierbar, falls je ein Python-Service dazukommt. Ausgabe ist Text/Markdown
// (kein Auto-Escaping); fuer HTML-Kontext steht der Filter `| e` bereit.

const fs = require("fs");

// --- Tokenizer --------------------------------------------------------------
// Zerlegt das Template in text / var / tag; Kommentare werden verworfen.
function tokenize(input) {
  const re = /\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}|\{#[\s\S]*?#\}/g;
  const tokens = [];
  let last = 0;
  let m;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: input.slice(last, m.index) });
    last = re.lastIndex;
    if (m[1] !== undefined) {
      tokens.push(makeExprToken("var", m[1]));
    } else if (m[2] !== undefined) {
      tokens.push(makeExprToken("tag", m[2]));
    }
    // Kommentar (kein Capture-Index): einfach ueberspringen.
  }
  if (last < input.length) tokens.push({ type: "text", value: input.slice(last) });
  applyWhitespaceControl(tokens);
  return tokens;
}

function makeExprToken(type, raw) {
  let value = raw;
  let trimLeft = false;
  let trimRight = false;
  if (value.startsWith("-")) { trimLeft = true; value = value.slice(1); }
  if (value.endsWith("-")) { trimRight = true; value = value.slice(0, -1); }
  return { type, value: value.trim(), trimLeft, trimRight };
}

function applyWhitespaceControl(tokens) {
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.trimLeft && i > 0 && tokens[i - 1].type === "text") {
      tokens[i - 1].value = tokens[i - 1].value.replace(/\s+$/, "");
    }
    if (t.trimRight && i + 1 < tokens.length && tokens[i + 1].type === "text") {
      tokens[i + 1].value = tokens[i + 1].value.replace(/^\s+/, "");
    }
  }
}

// --- Parser (rekursiver Abstieg -> AST) -------------------------------------
function kwOf(token) {
  return token.value.trim().split(/\s+/)[0];
}
function stripKw(value, kw) {
  return value.trim().replace(new RegExp(`^${kw}\\s*`), "").trim();
}

function parseNodes(tokens, start, stopTags) {
  const nodes = [];
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "tag") {
      const kw = kwOf(t);
      if (stopTags && stopTags.includes(kw)) return { nodes, next: i };
      if (kw === "if") { const p = parseIf(tokens, i); nodes.push(p.node); i = p.next; continue; }
      if (kw === "for") { const p = parseFor(tokens, i); nodes.push(p.node); i = p.next; continue; }
      i += 1; // unbekanntes Tag -> ignorieren
      continue;
    }
    if (t.type === "var") { nodes.push({ type: "var", expr: t.value }); i += 1; continue; }
    nodes.push({ type: "text", value: t.value });
    i += 1;
  }
  return { nodes, next: i };
}

function parseIf(tokens, i) {
  const branches = [];
  let elseBody = null;
  let cond = stripKw(tokens[i].value, "if");
  i += 1;
  let r = parseNodes(tokens, i, ["elif", "else", "endif"]);
  branches.push({ cond, body: r.nodes });
  i = r.next;
  while (tokens[i] && kwOf(tokens[i]) === "elif") {
    cond = stripKw(tokens[i].value, "elif");
    i += 1;
    r = parseNodes(tokens, i, ["elif", "else", "endif"]);
    branches.push({ cond, body: r.nodes });
    i = r.next;
  }
  if (tokens[i] && kwOf(tokens[i]) === "else") {
    i += 1;
    r = parseNodes(tokens, i, ["endif"]);
    elseBody = r.nodes;
    i = r.next;
  }
  if (tokens[i] && kwOf(tokens[i]) === "endif") i += 1;
  return { node: { type: "if", branches, elseBody }, next: i };
}

function parseFor(tokens, i) {
  const stmt = stripKw(tokens[i].value, "for");
  const m = stmt.match(/^(\w+)\s+in\s+(.+)$/);
  const varName = m ? m[1] : "item";
  const iterable = m ? m[2].trim() : stmt;
  i += 1;
  let r = parseNodes(tokens, i, ["else", "endfor"]);
  const body = r.nodes;
  i = r.next;
  let elseBody = null;
  if (tokens[i] && kwOf(tokens[i]) === "else") {
    i += 1;
    r = parseNodes(tokens, i, ["endfor"]);
    elseBody = r.nodes;
    i = r.next;
  }
  if (tokens[i] && kwOf(tokens[i]) === "endfor") i += 1;
  return { node: { type: "for", varName, iterable, body, elseBody }, next: i };
}

// --- Ausdrucks-Auswertung (sicher, ohne eval) -------------------------------
function splitTop(str, sep) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let buf = "";
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (quote) { buf += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (depth === 0 && str.startsWith(sep, i)) { parts.push(buf); buf = ""; i += sep.length - 1; continue; }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

function resolvePath(ctx, path) {
  const segs = path.split(".");
  let cur = ctx;
  for (const s of segs) {
    if (cur == null) return undefined;
    cur = cur[s];
  }
  return cur;
}

function evalPrimary(token, ctx) {
  const t = String(token).trim();
  if (!t) return undefined;
  if ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'"))) return t.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null" || t === "none") return null;
  return resolvePath(ctx, t);
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
}

function evalCondition(expr, ctx) {
  const e = String(expr).trim();
  const orParts = splitTop(e, " or ");
  if (orParts.length > 1) return orParts.some((p) => evalCondition(p, ctx));
  const andParts = splitTop(e, " and ");
  if (andParts.length > 1) return andParts.every((p) => evalCondition(p, ctx));
  if (e.startsWith("not ")) return !evalCondition(e.slice(4), ctx);
  const cmp = e.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (cmp) {
    const a = evalPrimary(cmp[1], ctx);
    const b = evalPrimary(cmp[3], ctx);
    switch (cmp[2]) {
      case "==": return a === b;
      case "!=": return a !== b;
      case ">": return Number(a) > Number(b);
      case "<": return Number(a) < Number(b);
      case ">=": return Number(a) >= Number(b);
      case "<=": return Number(a) <= Number(b);
      default: return false;
    }
  }
  const inM = e.match(/^(.+?)\s+in\s+(.+)$/);
  if (inM) {
    const a = evalPrimary(inM[1], ctx);
    const b = evalPrimary(inM[2], ctx);
    if (Array.isArray(b)) return b.includes(a);
    return String(b == null ? "" : b).includes(String(a == null ? "" : a));
  }
  return truthy(evalPrimary(e, ctx));
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function applyFilter(filterExpr, val, ctx) {
  const m = filterExpr.trim().match(/^([a-zA-Z_]\w*)\s*(?:\(([\s\S]*)\))?$/);
  if (!m) return val;
  const name = m[1];
  const args = m[2] !== undefined && m[2].trim() !== ""
    ? splitTop(m[2], ",").map((a) => evalPrimary(a, ctx))
    : [];
  switch (name) {
    case "default":
      return (val === undefined || val === null || val === "") ? (args.length ? args[0] : "") : val;
    case "upper": return String(val == null ? "" : val).toUpperCase();
    case "lower": return String(val == null ? "" : val).toLowerCase();
    case "trim": return String(val == null ? "" : val).trim();
    case "length":
      if (Array.isArray(val) || typeof val === "string") return val.length;
      return val && typeof val === "object" ? Object.keys(val).length : 0;
    case "join":
      return Array.isArray(val) ? val.join(args.length ? String(args[0]) : ", ") : String(val == null ? "" : val);
    case "e":
    case "escape":
      return escapeHtml(val);
    default:
      return val;
  }
}

function evalOutput(expr, ctx) {
  const parts = splitTop(expr, "|");
  let val = evalPrimary(parts[0].trim(), ctx);
  for (let i = 1; i < parts.length; i += 1) val = applyFilter(parts[i].trim(), val, ctx);
  return val;
}

function stringify(val) {
  if (val == null) return "";
  if (Array.isArray(val)) return val.map(stringify).join(", ");
  if (typeof val === "object") return "";
  return String(val);
}

function toIterable(v) {
  return Array.isArray(v) ? v : [];
}

// --- Renderer ---------------------------------------------------------------
function renderNodes(nodes, ctx) {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") { out += n.value; continue; }
    if (n.type === "var") { out += stringify(evalOutput(n.expr, ctx)); continue; }
    if (n.type === "if") {
      let done = false;
      for (const br of n.branches) {
        if (evalCondition(br.cond, ctx)) { out += renderNodes(br.body, ctx); done = true; break; }
      }
      if (!done && n.elseBody) out += renderNodes(n.elseBody, ctx);
      continue;
    }
    if (n.type === "for") {
      const arr = toIterable(evalPrimary(n.iterable, ctx));
      if (arr.length) {
        arr.forEach((item, idx) => {
          const child = Object.create(ctx);
          child[n.varName] = item;
          child.loop = { index: idx + 1, index0: idx, first: idx === 0, last: idx === arr.length - 1, length: arr.length };
          out += renderNodes(n.body, child);
        });
      } else if (n.elseBody) {
        out += renderNodes(n.elseBody, ctx);
      }
    }
  }
  return out;
}

// --- Oeffentliche API (mit Compile-Cache) -----------------------------------
const stringCache = new Map();
const fileCache = new Map();

function compile(template) {
  if (stringCache.has(template)) return stringCache.get(template);
  const ast = parseNodes(tokenize(template), 0, null).nodes;
  stringCache.set(template, ast);
  return ast;
}

function renderString(template, context = {}) {
  return renderNodes(compile(template), context || {});
}

function renderFile(filePath, context = {}) {
  let entry = fileCache.get(filePath);
  const stat = fs.statSync(filePath);
  if (!entry || entry.mtimeMs !== stat.mtimeMs) {
    const ast = parseNodes(tokenize(fs.readFileSync(filePath, "utf8")), 0, null).nodes;
    entry = { ast, mtimeMs: stat.mtimeMs };
    fileCache.set(filePath, entry);
  }
  return renderNodes(entry.ast, context || {});
}

module.exports = {
  renderString,
  renderFile,
  compile,
  // fuer gezielte Tests:
  tokenize,
  evalCondition,
  evalOutput,
  escapeHtml
};
