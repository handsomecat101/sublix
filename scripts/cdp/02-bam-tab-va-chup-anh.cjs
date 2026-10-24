// Click 1 tab trong Sublix (theo text) roi dump DOM + chup anh
const PORT = 9223;
const fs = require('fs');
const path = require('path');

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('ws error'));
  });
}
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener('message', onMsg);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error(`timeout ${method}`)), 30000);
  });
}
const evalJs = (ws, expr) =>
  send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    .then((r) => r.result?.value);

(async () => {
  const tabText = process.argv[2];
  const out = process.argv[3] || 'gui-2026-10-24/tab.png';
  const targets = await listTargets();
  const main = targets.find((t) => t.type === 'page' && !t.url.includes('window=overlay'));
  const ws = await connect(main.webSocketDebuggerUrl);
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  const clicked = await evalJs(ws, `(() => {
    const label = ${JSON.stringify(tabText)};
    const els = [...document.querySelectorAll('button, a, [role=tab], .tab, .nav-item, div')];
    const norm = e => (e.innerText || '').trim().split('\\n')[0].trim();
    let hit = els.filter(e => norm(e) === label && e.offsetParent !== null);
    if (!hit.length) hit = els.filter(e => norm(e).startsWith(label) && e.offsetParent !== null);
    if (!hit.length) return 'KHONG TIM THAY: ' + label;
    const el = hit[hit.length - 1];
    el.click();
    return 'CLICKED: ' + norm(el);
  })()`);
  console.log(clicked);
  await new Promise((r) => setTimeout(r, 2500));

  const info = await evalJs(ws, `(() => {
    const txt = document.body.innerText;
    return JSON.stringify({
      len: txt.length,
      text: txt.slice(0, 2500),
      models: [...document.querySelectorAll('*')].filter(e => /ggml|gguf|Whisper|Qwen|Kokoro/i.test(e.innerText || '') && e.children.length === 0).map(e => e.innerText.trim()).filter(Boolean).slice(0, 40)
    }, null, 2);
  })()`);
  console.log(info);

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SAVED:', out);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
