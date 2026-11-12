"use strict";

// Reproduzierbare Gestaltungsvorschau der ECHTEN Vorlagen. Kein Transport, kein Konto,
// kein Token erzeugt: ausschliesslich feste Beispieldaten und reservierte .invalid-Ziele.
// Aufruf: node scripts/lokal.js scripts/systemmails-vorschau.js <Zielverzeichnis>
const fs = require("node:fs");
const path = require("node:path");
const { buildInviteMail, buildResetMail } = require("../lib/helmut/invite-mail");

function exportiere(ziel) {
  const vorher = process.env.HELMUT_MAIL_FROM;
  let mails;
  try {
    process.env.HELMUT_MAIL_FROM = "Helmut <no-reply@mithelmut.de>";
    mails = [
      ["einladung", buildInviteMail({ name: "Eva Beispiel", inviteUrl: "https://app.example.invalid/passwort-setzen?token=VORSCHAU-KEIN-ECHTER-LINK" })],
      ["passwort-vergessen", buildResetMail({ name: "Eva Beispiel", resetUrl: "https://app.example.invalid/passwort-setzen?token=VORSCHAU-KEIN-ECHTER-RESET" })]
    ];
  } finally {
    if (vorher === undefined) delete process.env.HELMUT_MAIL_FROM;
    else process.env.HELMUT_MAIL_FROM = vorher;
  }
  fs.mkdirSync(ziel, { recursive: true });
  for (const [name, mail] of mails) {
    fs.writeFileSync(path.join(ziel, name + ".html"), mail.html + "\n");
    fs.writeFileSync(path.join(ziel, name + ".txt"), mail.text + "\n");
  }
  fs.writeFileSync(path.join(ziel, "index.html"), `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'">
<title>Helmut · E-Mail-Vorschau</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#070b16;color:#eaeef6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}header{max-width:760px;margin:auto;padding:28px 20px 0}a{color:#a9c6ed}h1{font:400 32px/1.2 Georgia,serif;margin:26px 0 12px}p{font-size:15px;line-height:1.6;color:#aeb8c9}nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}button{font:inherit;font-size:14px;border:1px solid #354156;border-radius:9px;background:#0c1322;color:#eaeef6;padding:12px 16px;cursor:pointer}button[aria-pressed=true]{background:#eaeef6;color:#0a0f1c}button:focus-visible,a:focus-visible{outline:2px solid #7fa8e0;outline-offset:4px}.sizes{margin-top:10px}#hinweis{min-height:24px}main{padding:0 0 24px}iframe{display:block;width:100%;max-width:680px;margin:auto;border:0;background:#070b16}iframe.schmal{max-width:390px}.meta{border-top:1px solid #29303d;padding-top:18px}.meta strong{color:#eaeef6;font-weight:500}
</style></head><body>
<header><a href="../">← Verwaltungsvorschau</a><h1>So kommt Helmut an.</h1>
<p>Einladung und Passwort-Hilfe. Die Vorschau zeigt die echten Mailvorlagen mit Beispieldaten. Der Absender ist vorgesehen, die Links sind Platzhalter. Es wird nichts versendet oder gespeichert.</p>
<nav aria-label="E-Mail auswählen"><button type="button" data-mail="einladung" aria-pressed="true">Einladung</button><button type="button" data-mail="passwort-vergessen" aria-pressed="false">Passwort vergessen</button></nav>
<nav class="sizes" aria-label="Ansichtsbreite"><button type="button" data-width="gross" aria-pressed="true">Computer</button><button type="button" data-width="klein" aria-pressed="false">Handy</button></nav>
<p class="meta">Von: <strong>Helmut &lt;no-reply@mithelmut.de&gt;</strong><br>Betreff: <strong id="betreff">Ihre Einladung zu Helmut</strong> · <a id="text" href="./einladung.txt" target="_blank" rel="noopener">Textfassung</a></p>
<p id="hinweis" role="status" aria-live="polite">Die Schaltflächen in der Mail sind hier nur eine Vorschau.</p></header>
<main><iframe title="Vorschau der Einladung von Helmut" src="./einladung.html" sandbox="allow-same-origin" height="1200"></iframe></main>
<script>
const frame=document.querySelector('iframe');
const hinweis=document.querySelector('#hinweis');
function anpassen(){frame.style.height=frame.contentDocument.documentElement.scrollHeight+'px';}
frame.addEventListener('load',()=>{
  for(const link of frame.contentDocument.querySelectorAll('a'))link.addEventListener('click',event=>{event.preventDefault();hinweis.textContent=link.classList.contains('h-knopf')?'Vorschau: Hier öffnet sich später die Helmut App zum Festlegen Ihres Passworts.':'Vorschau: Dieser Link wird hier nicht geöffnet.';});
  anpassen();
});
document.querySelectorAll('[data-mail]').forEach(button=>button.addEventListener('click',()=>{
  const name=button.dataset.mail;
  document.querySelectorAll('[data-mail]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  frame.src='./'+name+'.html';frame.title=name==='einladung'?'Vorschau der Einladung von Helmut':'Vorschau der Passwort-Hilfe von Helmut';
  document.querySelector('#betreff').textContent=name==='einladung'?'Ihre Einladung zu Helmut':'Neues Passwort für Helmut festlegen';
  document.querySelector('#text').href='./'+name+'.txt';hinweis.textContent='Die Schaltflächen in der Mail sind hier nur eine Vorschau.';
}));
document.querySelectorAll('[data-width]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-width]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  frame.classList.toggle('schmal',button.dataset.width==='klein');requestAnimationFrame(anpassen);
}));
window.addEventListener('resize',anpassen);
</script></body></html>\n`);
  return mails.map(([name]) => name);
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error("Zielverzeichnis erforderlich");
  exportiere(path.resolve(process.argv[2]));
  console.log("Zwei Systemmails als HTML und Text exportiert. Kein Versand.");
}
module.exports = { exportiere };
