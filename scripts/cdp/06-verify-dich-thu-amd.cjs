// Bam "Dich Thu Nghiem Ngay" trong app voi config preset AMD -> doc ket qua
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

const CLICK = (label) => `(() => {
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

  console.log(await evalJs(ws, CLICK('🌐 AI Dịch Thuật & Phân Vai')));
  await new Promise((r) => setTimeout(r, 2500));

  // dropdown model da cai -> lay danh sach
  const opts = await evalJs(ws, `(() => {
    const sel = [...document.querySelectorAll('select')].find(s => s.offsetParent !== null && [...s.options].some(o => o.value.includes(':')));
    if (!sel) return 'KHONG THAY dropdown model';
    return JSON.stringify([...sel.options].map(o => o.text.trim()), null, 2);
  })()`);
  console.log('=== DROPDOWN MODEL OLLAMA ===');
  console.log(opts);

  console.log(await evalJs(ws, CLICK('🧪 Dịch Thử Nghiệm Ngay')));

  let result = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await evalJs(ws, `(() => {
      const t = document.body.innerText;
      const m = t.match(/Kết quả dịch thử nghiệm:[\\s\\S]{0,400}/);
      return m ? m[0] : null;
    })()`);
    if (s && s.includes('thành công')) { result = s; break; }
    if (s && (s.includes('Lỗi') || s.includes('lỗi'))) { result = s; break; }
  }
  console.log('=== KET QUA ===');
  console.log(result || '(khong doi duoc ket qua)');

  const toast = await evalJs(ws, `(() => {
    const t = document.body.innerText;
    const i = t.indexOf('Kiểm tra dịch');
    return i >= 0 ? t.slice(i, i + 120) : '(khong co toast)';
  })()`);
  console.log('=== TOAST ===');
  console.log(toast);

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('gui-2026-10-24/08-amd-translate-test.png', Buffer.from(shot.data, 'base64'));
  console.log('SAVED gui-2026-10-24/08-amd-translate-test.png');
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
