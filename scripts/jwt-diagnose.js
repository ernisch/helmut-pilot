"use strict";

// JWT-Diagnose (Mehrmandantenfaehigkeit) — Ursachenanalyse fuer PGRST301
// "None of the keys was able to decode the JWT" / "No suitable key or wrong key type".
//
// Ziel: LOKAL und OHNE Secret-Ausgabe eindeutig belegen, ob unser selbst
// erzeugtes HS256-Tenant-JWT noch zum aktiven Supabase-Signing-System passt.
//
// Kernidee (der entscheidende Test):
//   Der oeffentliche anon-Key (SUPABASE_ANON_KEY) IST selbst ein HS256-JWT, das
//   Supabase mit dem "Legacy JWT Secret" signiert hat. Wenn unser konfiguriertes
//   SUPABASE_JWT_SECRET die Signatur des anon-Keys verifizieren kann, dann IST
//   unser Secret exakt das aktive Legacy JWT Secret -> HS256 ist korrekt und die
//   Ursache liegt woanders. Kann es die Signatur NICHT verifizieren, ist unser
//   SUPABASE_JWT_SECRET nicht (mehr) das aktive Signing-Secret -> das ist die
//   Ursache des 401/PGRST301.
//
// Es wird KEIN Secret-Wert ausgegeben — nur Booleans, Laengen, Claims und
// Algorithmen. Rein lesend, kein Netzwerk, keine Deployments, keine Writes.

const crypto = require("crypto");
const storage = require("../lib/helmut/storage");

function decodeSegment(seg) {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

// Verifiziert eine HS256-Signatur, ohne das Secret preiszugeben.
function hs256Verifies(token, secret) {
  if (!token || !secret) return false;
  const parts = String(token).split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  let expected;
  try {
    expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  } catch (_) {
    return false;
  }
  const a = Buffer.from(String(s));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function mask(val) {
  // Nie den Wert zeigen — nur, ob gesetzt und wie lang.
  if (!val) return "(nicht gesetzt)";
  return `(gesetzt, Laenge ${String(val).length})`;
}

const line = "-".repeat(72);
console.log(line);
console.log("JWT-DIAGNOSE — PGRST301 Ursachenanalyse (keine Secret-Ausgabe)");
console.log(line);

// ---------------------------------------------------------------------------
// 0) Umgebung: welche Werte sind ueberhaupt gesetzt?
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
console.log("\n[0] Umgebung");
console.log(`    SUPABASE_JWT_SECRET : ${mask(JWT_SECRET)}`);
console.log(`    SUPABASE_ANON_KEY   : ${mask(ANON_KEY)}`);

// ---------------------------------------------------------------------------
// 1) Unser erzeugtes Tenant-JWT dekodieren und strukturell pruefen.
// ---------------------------------------------------------------------------
console.log("\n[1] Unser erzeugtes Tenant-JWT (signTenantJWT)");
let ownHeader = null;
let ownPayload = null;
const token = storage.signTenantJWT ? storage.signTenantJWT("cem-ince", { ttlSeconds: 60 }) : null;
if (!token) {
  console.log("    -> signTenantJWT lieferte null (SUPABASE_JWT_SECRET fehlt lokal?).");
  console.log("       Struktur wird dann mit einem Dummy-Secret demonstriert.");
}
// Falls kein echtes Secret vorhanden ist, mit Dummy demonstrieren, damit der
// Test den Mechanismus lokal zeigt (Operator laesst ihn mit echten Werten laufen).
const demoSecret = JWT_SECRET || "dummy-local-secret-nur-fuer-strukturdemo";
const demoToken = token || (() => {
  const prev = process.env.SUPABASE_JWT_SECRET;
  process.env.SUPABASE_JWT_SECRET = demoSecret;
  const t = storage.signTenantJWT("cem-ince", { ttlSeconds: 60 });
  if (prev === undefined) delete process.env.SUPABASE_JWT_SECRET;
  else process.env.SUPABASE_JWT_SECRET = prev;
  return t;
})();

if (demoToken) {
  const [h, p] = demoToken.split(".");
  ownHeader = decodeSegment(h);
  ownPayload = decodeSegment(p);
  const nowSec = Math.floor(Date.now() / 1000);
  console.log(`    Header : ${JSON.stringify(ownHeader)}`);
  console.log(`    Claims : role=${ownPayload.role}  user_id=${ownPayload.user_id ? "vorhanden" : "FEHLT"}  iss=${ownPayload.iss}`);
  console.log(`             iat/exp gesetzt=${typeof ownPayload.iat === "number" && typeof ownPayload.exp === "number"}  ttl=${ownPayload.exp - ownPayload.iat}s`);
  console.log(`             aud=${ownPayload.aud === undefined ? "(keine)" : ownPayload.aud}  kid=${ownHeader.kid === undefined ? "(keine)" : ownHeader.kid}`);
  // Strukturchecks (das, was PostgREST/RLS erwartet):
  console.log(`    Check  : alg=HS256         -> ${ownHeader.alg === "HS256" ? "OK" : "FALSCH (" + ownHeader.alg + ")"}`);
  console.log(`    Check  : role=authenticated-> ${ownPayload.role === "authenticated" ? "OK" : "FALSCH"}`);
  console.log(`    Check  : user_id-Claim     -> ${ownPayload.user_id ? "OK (RLS liest auth.jwt()->>'user_id')" : "FEHLT"}`);
  console.log(`    Check  : exp in Zukunft    -> ${ownPayload.exp > nowSec ? "OK" : "ABGELAUFEN"}`);
}

// ---------------------------------------------------------------------------
// 2) Den oeffentlichen anon-Key dekodieren = Format des Projekts selbst.
// ---------------------------------------------------------------------------
console.log("\n[2] Oeffentlicher anon-Key (SUPABASE_ANON_KEY) = Projekt-eigenes Token-Format");
let anonHeader = null;
let anonPayload = null;
if (!ANON_KEY) {
  console.log("    -> SUPABASE_ANON_KEY nicht gesetzt. Operator: mit Prod-ENV ausfuehren.");
} else if (ANON_KEY.startsWith("sb_")) {
  console.log("    -> Wert ist ein moderner publishable Key (sb_...), KEIN JWT.");
  console.log("       Fuer den Signatur-Abgleich wird der Legacy-anon-JWT (eyJ...) benoetigt.");
} else {
  try {
    const [h, p] = ANON_KEY.split(".");
    anonHeader = decodeSegment(h);
    anonPayload = decodeSegment(p);
    console.log(`    Header : ${JSON.stringify(anonHeader)}`);
    console.log(`    Claims : iss=${anonPayload.iss}  role=${anonPayload.role}  ref=${anonPayload.ref || "(keine)"}`);
    console.log(`    Algo   : ${anonHeader.alg}  (${anonHeader.alg === "HS256" ? "symmetrisch -> Legacy JWT Secret aktiv" : "asymmetrisch -> Signing-Keys aktiv"})`);
  } catch (_) {
    console.log("    -> anon-Key ist kein dekodierbares JWT.");
  }
}

// ---------------------------------------------------------------------------
// 3) DER ENTSCHEIDENDE TEST: Ist SUPABASE_JWT_SECRET das aktive Legacy Secret?
//    -> Verifiziert unser Secret die Signatur des oeffentlichen anon-Keys?
// ---------------------------------------------------------------------------
console.log("\n[3] Entscheidender Abgleich: Secret == aktives Legacy JWT Secret?");
let verdict = "UNBESTIMMT";
if (!JWT_SECRET) {
  console.log("    -> SUPABASE_JWT_SECRET lokal nicht gesetzt -> Abgleich nicht moeglich.");
  console.log("       Operator: dieses Script mit der Prod-ENV ausfuehren (nur lesend).");
} else if (!anonHeader || anonHeader.alg !== "HS256") {
  console.log("    -> Kein HS256-anon-JWT als Referenz vorhanden -> Abgleich nicht moeglich.");
} else {
  const secretMatchesLegacy = hs256Verifies(ANON_KEY, JWT_SECRET);
  console.log(`    secretMatchesLegacy = ${secretMatchesLegacy}  (kein Secret-Wert ausgegeben)`);
  if (secretMatchesLegacy) {
    verdict = "SECRET_OK";
    console.log("    -> Unser SUPABASE_JWT_SECRET IST das aktive Legacy JWT Secret.");
    console.log("       HS256 ist korrekt; die 401-Ursache liegt NICHT am Secret.");
  } else {
    verdict = "SECRET_MISMATCH";
    console.log("    -> Unser SUPABASE_JWT_SECRET ist NICHT das aktive Signing-Secret.");
    console.log("       Damit lehnt PostgREST unser Tenant-JWT ab (PGRST301). URSACHE gefunden.");
  }
}

// ---------------------------------------------------------------------------
// 4) Gegenprobe: verifiziert unser Secret wenigstens unser eigenes Token?
//    (Beweist, dass Signaturlogik/Encoding korrekt sind — isoliert das Secret.)
// ---------------------------------------------------------------------------
console.log("\n[4] Gegenprobe: eigenes Token mit eigenem Secret verifizierbar?");
if (token && JWT_SECRET) {
  const selfOk = hs256Verifies(token, JWT_SECRET);
  console.log(`    self-verify = ${selfOk}  (unsere HS256-Signaturlogik ist ${selfOk ? "korrekt" : "FEHLERHAFT"})`);
} else {
  console.log("    -> uebersprungen (kein echtes Secret/Token lokal).");
}

// ---------------------------------------------------------------------------
// 5) Diagnose-Fazit
// ---------------------------------------------------------------------------
console.log("\n" + line);
console.log("FAZIT");
console.log(line);
if (verdict === "SECRET_MISMATCH") {
  console.log("Ursache        : SUPABASE_JWT_SECRET stimmt NICHT mit dem aktiven");
  console.log("                 Supabase-Signing-Secret ueberein (anon-Key-Signatur");
  console.log("                 liess sich damit nicht verifizieren).");
  console.log("Schluesseltyp  : HS256/Legacy JWT Secret (der anon-Key ist HS256).");
  console.log("HS256 korrekt? : JA — der Ansatz stimmt, nur der Secret-WERT ist falsch.");
  console.log("Eine Aenderung : SUPABASE_JWT_SECRET in Vercel auf den EXAKTEN aktuellen");
  console.log("                 Legacy JWT Secret aus Supabase (Settings > API > JWT)");
  console.log("                 setzen, dann neu deployen.");
} else if (verdict === "SECRET_OK") {
  console.log("Ursache        : NICHT das Secret — Secret == aktives Legacy Secret.");
  console.log("                 Naechster Verdacht: role-Claim/GUC, RLS-Policy oder");
  console.log("                 apikey-Header. Weiter in [1]-Claims + RLS pruefen.");
  console.log("HS256 korrekt? : JA.");
} else {
  console.log("Ursache        : lokal unbestimmt — Operator muss dieses Script mit der");
  console.log("                 echten Prod-ENV (SUPABASE_JWT_SECRET + SUPABASE_ANON_KEY)");
  console.log("                 ausfuehren. Es gibt KEINE Secret-Werte aus, nur Booleans.");
  console.log("Schluesseltyp  : HS256/Legacy JWT Secret, sofern anon-Key HS256 ist.");
  console.log("HS256 korrekt? : JA, sofern der anon-Key HS256 ist (siehe [2]).");
}
console.log(line);

// Exit 0 immer — reines Diagnose-Tool, kein Test-Gate.
process.exit(0);
