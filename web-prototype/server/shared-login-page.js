// The public entry stays self-contained: game assets remain behind the password gate.
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

export function sharedLoginPage({token, message, failed = false}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Super Weights Bros. · Private lobby</title>
<style>
:root{color-scheme:dark;--ink:#f3eee4;--muted:#c4b5a5;--ground:#090807;--panel:#16110e;--line:#765443;--gold:#f2d9a6;--fire:#ed6b42;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink);background:var(--ground)}
*{box-sizing:border-box}
body{margin:0;min-width:280px;min-height:100svh;background:radial-gradient(ellipse at 18% 42%,#3b1c122e,transparent 65%),var(--ground)}
.shell{width:min(1120px,calc(100% - 64px));min-height:100svh;margin:auto;display:flex;flex-direction:column}
.masthead,.footer{display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:11px;line-height:1.5;letter-spacing:.12em;text-transform:uppercase}
.masthead{min-height:96px;border-bottom:1px solid #443127}
.wordmark{font:bold italic 24px/1 Impact,"Arial Narrow",sans-serif;letter-spacing:-.03em;text-transform:none}.wordmark span{color:var(--fire)}
.private-label{color:var(--muted)}
main{flex:1;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,1fr);align-items:center;gap:clamp(40px,7vw,100px);padding:64px 0}
.eyebrow{margin:0 0 20px;color:var(--gold);font-size:11px;font-weight:600;line-height:1.5;letter-spacing:.16em;text-transform:uppercase}
h1{margin:0;font:900 italic clamp(64px,7.8vw,106px)/.88 Impact,"Arial Narrow",sans-serif;letter-spacing:-.035em;text-transform:uppercase;text-shadow:3px 4px 0 #70351f}
h1 span{display:block}h1 .last-line{color:var(--gold)}
.intro{max-width:32ch;margin:32px 0 0;color:var(--muted);font-size:14px;line-height:1.8}
.entry{position:relative;border:1px solid var(--line);background:linear-gradient(155deg,#241911,var(--panel) 70%);box-shadow:0 24px 64px #0006,inset 0 1px #f2d9a612;padding:36px 32px}
.entry::before{content:"";position:absolute;inset:-1px -1px auto;height:4px;background:var(--gold)}
.entry .eyebrow{margin-bottom:12px}
h2{margin:0;font:800 32px/1.15 Impact,"Arial Narrow",sans-serif;letter-spacing:.025em;text-transform:uppercase}
.message{margin:16px 0 28px;min-height:3.2em;color:var(--muted);font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.message[role=alert]{color:#ffc6af}
label{display:block;margin-bottom:10px;font-size:12px;line-height:1.5;font-weight:700}
input,button{display:block;width:100%;min-height:54px;border-radius:2px;font:inherit}
input{padding:12px 14px;border:1px solid #a7856b;background:#080706;color:var(--ink);font-size:18px;letter-spacing:.05em}
input:hover{border-color:var(--gold)}
button{margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 18px;border:1px solid #ffe8bf;background:var(--gold);color:#21150d;box-shadow:0 4px 0 #896044;font-size:13px;font-weight:800;cursor:pointer;transition:background 100ms,transform 100ms,box-shadow 100ms}
button:hover{background:#ffe9c1}button:active{transform:translateY(3px);box-shadow:0 1px 0 #896044}
input:focus-visible,button:focus-visible{outline:3px solid #ff9a68;outline-offset:5px}
.help{margin:22px 0 0;color:var(--muted);font-size:11px;line-height:1.7}
.footer{min-height:76px;border-top:1px solid #443127;color:var(--muted);font-size:10px;letter-spacing:.08em}
@media(max-width:740px){.shell{width:calc(100% - 40px)}.masthead{min-height:76px}.private-label{font-size:9px;letter-spacing:.08em}main{grid-template-columns:1fr;gap:36px;padding:40px 0}.hero{max-width:460px}h1{font-size:clamp(60px,14vw,88px)}.intro{margin-top:24px}.entry{width:100%;max-width:460px;padding:30px 24px}.message{min-height:0}.footer{flex-wrap:wrap;justify-content:flex-start;gap:4px 20px;padding:20px 0;min-height:72px}}
@media(prefers-reduced-motion:reduce){button{transition:none}}
@media(forced-colors:active){.entry{border:1px solid CanvasText}button,input{border:1px solid ButtonText}h1{text-shadow:none}}
</style>
</head>
<body>
<div class="shell">
<header class="masthead"><div class="wordmark">smash<span>.fun</span></div><span class="private-label">Friends &amp; family</span></header>
<main>
<section class="hero" aria-labelledby="game-title"><p class="eyebrow">The private lobby</p><h1 id="game-title"><span>Super</span><span>Weights</span><span class="last-line">Bros.</span></h1><p class="intro">Your people. Your roster.<br>Settle it here.</p></section>
<section class="entry" aria-labelledby="entry-title"><p class="eyebrow">Ready when you are</p><h2 id="entry-title">Enter the lobby</h2><p class="message" id="login-message"${failed ? ' role="alert"' : ''}>${escape(message)}</p>
<form action="/login" method="post"><input type="hidden" name="csrf" value="${escape(token)}"><label for="password">Shared password</label><input id="password" name="password" type="password" required autocomplete="current-password" maxlength="1024" aria-describedby="login-message password-help"><button type="submit"><span>Enter lobby</span><span aria-hidden="true">→</span></button></form><p class="help" id="password-help">Need the password? Ask Alex.</p></section>
</main>
<footer class="footer"><span>A private lobby for friends.</span><span>Pick your fighter. Make it personal.</span></footer>
</div>
</body>
</html>`;
}
