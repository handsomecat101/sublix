// CDP helper: doc DOM cua Sublix + chup anh man hinh (khong can agent-browser)
const PORT = 9223;

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error('ws error'));
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
  const targets = await listTargets();
  const main = targets.find((t) => t.type === 'page' && !t.url.includes('window=overlay'));
  const overlay = targets.find((t) => t.url.includes('window=overlay'));
  console.log('TARGETS:', targets.map((t) => t.url).join(' | '));
  if (!main) { console.error('khong tim thay tab main'); process.exit(1); }

  const ws = await connect(main.webSocketDebuggerUrl);
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  const info = await evalJs(ws, `(() => {
    const txt = document.body.innerText;
    const tabs = [...document.querySelectorAll('button,[role=tab],nav a')].map(e => e.innerText.trim()).filter(t => t && t.length < 40);
    const ver = (txt.match(/v?\\d+\\.\\d+\\.\\d+/g) || []).slice(0, 5);
    return JSON.stringify({
      title: document.title,
      head: txt.slice(0, 1200),
      tabs: [...new Set(tabs)].slice(0, 40),
      versionHits: ver,
      bodyLen: txt.length,
      hasError: /error|exception|failed/i.test(txt.slice(0, 600))
    }, null, 2);
  })()`);
  console.log('=== MAIN WINDOW ===');
  console.log(info);

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  const fs = require('fs');
  const out = process.argv[2] || 'gui-2026-10-24/01-main-window.png';
  fs.mkdirSync(require('path').dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SAVED:', out);

  if (overlay) {
    const ws2 = await connect(overlay.webSocketDebuggerUrl);
    await send(ws2, 'Page.enable');
    const oinfo = await evalJs(ws2, `document.body.innerText.slice(0, 400)`);
    console.log('=== OVERLAY WINDOW ===');
    console.log(oinfo);
    const shot2 = await send(ws2, 'Page.captureScreenshot', { format: 'png' });
    const out2 = out.replace(/\.png$/, '-overlay.png');
    fs.writeFileSync(out2, Buffer.from(shot2.data, 'base64'));
    console.log('SAVED:', out2);
  }
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
