// Click 1-click preset (vd "💻 Thuần CPU") roi doc trang thai he thong
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
    setTimeout(() => reject(new Error(`timeout ${method}`)), 60000);
  });
}
const evalJs = (ws, expr) =>
  send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    .then((r) => r.result?.value);

(async () => {
  const label = process.argv[2];
  const out = process.argv[3] || 'gui-2026-10-24/preset.png';
  const waitMs = Number(process.argv[4] || 6000);
  const targets = await listTargets();
  const main = targets.find((t) => t.type === 'page' && !t.url.includes('window=overlay'));
  const ws = await connect(main.webSocketDebuggerUrl);
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  const clicked = await evalJs(ws, `(() => {
    const label = ${JSON.stringify(label)};
    const els = [...document.querySelectorAll('button, div')];
    const norm = e => (e.innerText || '').trim().split('\\n')[0].trim();
    let hit = els.filter(e => norm(e) === label && e.offsetParent !== null);
    if (!hit.length) hit = els.filter(e => norm(e).startsWith(label) && e.offsetParent !== null);
    if (!hit.length) return 'KHONG TIM THAY: ' + label;
    const el = hit[hit.length - 1];
    el.click();
    return 'CLICKED: ' + norm(el);
  })()`);
  console.log(clicked);

  await new Promise((r) => setTimeout(r, waitMs));

  const status = await evalJs(ws, `(() => {
    const t = document.body.innerText;
    const i = t.indexOf('Trạng Thái Hệ Thống');
    const seg = i >= 0 ? t.slice(i, i + 400) : '(khong thay Trang Thai)';
    // bat ky thong bao toast/alert
    const toasts = [...document.querySelectorAll('[role=alert], .toast, .notification')].map(e => e.innerText.trim()).filter(Boolean);
    return JSON.stringify({ statusBlock: seg, toasts }, null, 2);
  })()`);
  console.log(status);

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SAVED:', out);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
