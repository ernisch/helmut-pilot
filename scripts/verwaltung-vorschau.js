"use strict";

// Eigene statische Loopback-Vorschau. Laedt weder Helmut-Server noch Secrets.
// Aufruf nur ueber scripts/lokal.js. Kein Production-/API-Proxy.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "verwaltung");
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ...["index.html", "app.mjs", "api.mjs", "model.mjs", "beispieldaten.mjs", "vorschau.mjs", "styles.css"].map(name => [
    `/${name}`, [name, name.endsWith(".html") ? "text/html; charset=utf-8" : name.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8"]
  ])
]);

function standaloneHtml() {
  const read = name => fs.readFileSync(path.join(root, name), "utf8");
  const withoutImports = text => text.replace(/^import\s*[\s\S]*?from\s*["'][^"']+["'];\s*/gm, "");
  const source = [read("model.mjs"), read("beispieldaten.mjs"), "const e = escapeHtml;", withoutImports(read("app.mjs")),
    'mountAdministration(document.querySelector("#verwaltung"), { reader: createPreviewReader(), preview: true });']
    .join("\n").replace(/^export\s+(?=(?:const|function|class)\b)/gm, "").replace(/<\/script/gi, "<\\/script");
  return read("index.html")
    .replace('<link rel="stylesheet" href="./styles.css">', `<style>${read("styles.css")}</style>`)
    .replace('<script type="module" src="./vorschau.mjs"></script>', `<script type="module">${source}</script>`);
}

function createPreviewServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const asset = assets.get(url.pathname);
    if (!["GET", "HEAD"].includes(request.method) || !asset) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return response.end("Nicht gefunden.");
    }
    response.writeHead(200, {
      "Content-Type": asset[1], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer"
    });
    response.end(request.method === "HEAD" ? undefined : fs.readFileSync(path.join(root, asset[0])));
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === "--export" && args.length === 2) {
    fs.writeFileSync(path.resolve(args[1]), standaloneHtml(), { flag: "wx" });
    console.log(`Offline-Vorschau exportiert: ${path.resolve(args[1])}`);
  } else {
    const port = args[0] === "--port" && args.length === 2 ? Number(args[1]) : 8787;
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Ungueltiger Port.");
    const server = createPreviewServer();
    server.listen(port, "127.0.0.1", () => console.log(`Verwaltungsvorschau: http://127.0.0.1:${server.address().port}`));
  }
}

module.exports = { createPreviewServer, standaloneHtml };
