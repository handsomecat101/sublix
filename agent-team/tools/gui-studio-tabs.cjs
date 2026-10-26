// Kiem P1 tren app that: vao Studio, dem tab, bam +, doi tab, bat loi console.
const PORT = Number(process.argv[2] || 9226);
const OUT = process.argv[3];
const fs = require('fs');

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('ws error'));
  });
}
let seq = 1;
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = seq++;
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
  send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).then((r) => r.result?.value);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = [];
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (targets.some((t) => t.type === 'page' && t.url.includes('localhost:1420'))) break;
    } catch {}
    await sleep(1500);
  }
  const main = targets.find((t) => t.type === 'page' && t.url.includes('localhost:1420') && !t.url.includes('overlay'));
  if (!main) throw new Error('khong thay trang chinh: ' + JSON.stringify(targets.map((t) => t.url)));
  const ws = await connect(main.webSocketDebuggerUrl);
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push('ERR ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  });
  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Page.reload', { ignoreCache: true });
  await sleep(9000);

  const log = [];
  const step = async (name, expr, wait = 1500) => {
    const v = await evalJs(ws, expr);
    log.push(`${name}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    await sleep(wait);
  };
  const state = `JSON.stringify({ slots: document.querySelectorAll('.sts-slot').length, visibleSlots: [...document.querySelectorAll('.sts-slot')].filter(s => s.style.display !== 'none').length, strips: [...document.querySelectorAll('.sts-strip')].filter(e => e.offsetParent).length, tabNames: [...document.querySelectorAll('.sts-tab-name')].filter(e => e.offsetParent).map(e => e.innerText), videos: document.querySelectorAll('video').length })`;

  await step('vao Studio', `(() => { const els = [...document.querySelectorAll('button, a, [role=tab], .nav-item')]; const hit = els.find(e => (e.innerText||'').trim().startsWith('Studio') && e.offsetParent); if (!hit) return 'KHONG THAY nut Studio'; hit.click(); return 'CLICKED ' + hit.innerText.trim().split('\\n')[0]; })()`, 3000);
  await step('trang thai 1', state, 300);
  await step('bam +', `(() => { const b = [...document.querySelectorAll('.sts-add')].find(e => e.offsetParent); if (!b) return 'KHONG THAY +'; b.click(); return 'ok'; })()`, 2500);
  await step('trang thai 2', state, 300);
  await step('bam tab 1', `(() => { const t = [...document.querySelectorAll('.sts-tab-name')].filter(e => e.offsetParent); if (!t.length) return 'KHONG THAY tab'; t[0].click(); return 'ok ' + t.length; })()`, 2500);
  await step('trang thai 3', state, 300);
  await step('Ctrl+0 / phim khi o tab khac', `(() => { const els = [...document.querySelectorAll('button, a, [role=tab], .nav-item')]; const hit = els.find(e => (e.innerText||'').trim().startsWith('Tải video') && e.offsetParent); if (hit) hit.click(); return hit ? 'sang Tai video' : 'khong thay Tai video'; })()`, 2000);
  await step('trang thai o tab Tai video', state, 300);
  await step('quay lai Studio', `(() => { const els = [...document.querySelectorAll('button, a, [role=tab], .nav-item')]; const hit = els.find(e => (e.innerText||'').trim().startsWith('Studio') && e.offsetParent); hit && hit.click(); return 'ok'; })()`, 2500);
  await step('trang thai 4', state, 300);

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  if (OUT) fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(log.join('\n'));
  console.log('--- loi console (' + errors.length + ')');
  console.log([...new Set(errors)].slice(0, 25).join('\n'));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
