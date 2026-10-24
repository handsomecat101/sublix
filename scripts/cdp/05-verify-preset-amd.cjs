// Verify preset "AMD iGPU" trong app Sublix: bam preset -> doc config -> dich thu
const fs = require('fs');
const PORT = 9223;

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
    setTimeout(() => reject(new Error(`timeout ${method}`)), 120000);
  });
}
const evalJs = (ws, expr) =>
  send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    .then((r) => r.result?.value);

const CLICK_BY_PREFIX = (label) => `(() => {
  const label = ${JSON.stringify(label)};
  const els = [...document.querySelectorAll('button, div, label, span')];
  const norm = e => (e.innerText || '').trim().split('\\n')[0].trim();
  let hit = els.filter(e => norm(e) === label && e.offsetParent !== null);
  if (!hit.length) hit = els.filter(e => norm(e).startsWith(label) && e.offsetParent !== null);
  if (!hit.length) return 'KHONG TIM THAY: ' + label;
  const el = hit[hit.length - 1];
  el.click();
  return 'CLICKED: ' + norm(el);
})()`;

(async () => {
  const targets = await listTargets();
  const main = targets.find((t) => t.type === 'page' && t.url.includes('localhost:1420') && !t.url.includes('overlay'));
  const ws = await connect(main.webSocketDebuggerUrl);
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  // 1) Mo tab Cai dat
  console.log(await evalJs(ws, CLICK_BY_PREFIX('Cài đặt')));
  await new Promise((r) => setTimeout(r, 2500));

  // 2) Dem so preset card + tim card AMD
  const cards = await evalJs(ws, `(() => {
    const els = [...document.querySelectorAll('.preset-card')].filter(e => e.offsetParent !== null);
    return JSON.stringify(els.map(e => (e.innerText||'').trim().split('\\n')[0].trim()), null, 2);
  })()`);
  console.log('=== PRESET CARDS ===');
  console.log(cards);

  // 3) Bam preset AMD
  console.log(await evalJs(ws, CLICK_BY_PREFIX('🔺 GPU Tích Hợp AMD')));
  await new Promise((r) => setTimeout(r, 3500));

  // 4) Doc trang thai he thong + thong bao
  const st = await evalJs(ws, `(() => {
    const t = document.body.innerText;
    const i = t.indexOf('Trạng Thái Hệ Thống');
    return JSON.stringify({
      status: i >= 0 ? t.slice(i, i + 220) : '(khong thay)',
      toast: t.includes('GPU tích hợp AMD') ? 'CO THONG BAO AMD' : '(khong co toast)',
    }, null, 2);
  })()`);
  console.log('=== TRANG THAI ===');
  console.log(st);

  // 5) Chup anh
  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('gui-2026-10-24', { recursive: true });
  fs.writeFileSync('gui-2026-10-24/07-amd-preset.png', Buffer.from(shot.data, 'base64'));
  console.log('SAVED gui-2026-10-24/07-amd-preset.png');
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
