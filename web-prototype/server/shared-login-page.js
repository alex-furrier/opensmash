// The public entry stays self-contained: game assets remain behind the password gate.
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

export function sharedLoginPage({token, message, failed = false}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Smash.fun · Enter lobby</title>
<style>
:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#f3eee4;background:#090807}
*{box-sizing:border-box}
body{margin:0;min-width:280px;min-height:100svh;display:grid;place-items:center;padding:40px 24px}
main{width:100%;max-width:360px}
h1{margin:0 0 48px;text-align:center;font:900 italic clamp(56px,14vw,76px)/1 Impact,"Arial Narrow",sans-serif;letter-spacing:-.055em}h1 span{color:#ed6b42}
label{display:block;margin-bottom:10px;font-size:12px;line-height:1.5;font-weight:700}
input,button{display:block;width:100%;min-height:54px;border-radius:2px;font:inherit}
input{padding:12px 14px;border:1px solid #a7856b;background:#110e0b;color:#f3eee4;font-size:18px}
input:hover{border-color:#f2d9a6}
button{margin-top:16px;padding:15px 18px;border:1px solid #ffe8bf;background:#f2d9a6;color:#21150d;box-shadow:0 4px 0 #896044;font-size:13px;font-weight:800;cursor:pointer;transition:background 100ms,transform 100ms,box-shadow 100ms}
button:hover{background:#ffe9c1}button:active{transform:translateY(3px);box-shadow:0 1px 0 #896044}
input:focus-visible,button:focus-visible{outline:3px solid #ff9a68;outline-offset:5px}
.message{margin:20px 0 0;color:#ffc6af;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
@media(prefers-reduced-motion:reduce){button{transition:none}}
@media(forced-colors:active){button,input{border:1px solid ButtonText}}
</style>
</head>
<body>
<main aria-labelledby="game-title">
<h1 id="game-title">smash<span>.fun</span></h1>
<form action="/login" method="post"><input type="hidden" name="csrf" value="${escape(token)}"><label for="password">Shared password</label><input id="password" name="password" type="password" required autocomplete="current-password" maxlength="1024"${failed ? ' aria-describedby="login-message" aria-invalid="true"' : ''}><button type="submit">Enter lobby</button></form>
${failed ? `<p class="message" id="login-message" role="alert">${escape(message)}</p>` : ''}
</main>
</body>
</html>`;
}
