// Bộ script kiểm chứng GUI cho FORK Sublix (port CDP 9223)
// Dùng: đọc file này bằng Get-Content -Raw -Encoding UTF8 rồi truyền cho ab2.ps1 eval
window.__forkTest = {};

window.__forkTest.scanMojibake = function () {
  // Quét toàn bộ text hiển thị trong DOM (bỏ qua script/style) tìm dấu hiệu mojibake
  var RX = /Ã[\u0080-\u00BF]{1,2}|Â[\u0080-\u00BF]{1,2}|â€[\u0080-\u00BF]{0,2}|ï»¿|\uFFFD/;
  var hits = [];
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var n;
  while ((n = walker.nextNode())) {
    var t = (n.nodeValue || '').trim();
    if (!t) continue;
    var p = n.parentElement;
    if (!p) continue;
    var tag = (p.tagName || '').toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
    if (RX.test(t)) {
      hits.push({
        tag: tag,
        cls: (p.className || '').toString().slice(0, 60),
        text: t.slice(0, 120),
        index: t.search(RX)
      });
    }
  }
  // Thu thêm: text node thuộc tiêu đề/label ở đầu trang
  return JSON.stringify({
    totalHits: hits.length,
    hits: hits.slice(0, 40),
    title: document.title,
    headText: (document.body.innerText || '').slice(0, 600)
  });
};

window.__forkTest.topOfPage = function () {
  // Lấy 40 dòng text đầu tiên của trang (nơi user nói "đầu trang lạ mojibake")
  var lines = (document.body.innerText || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  return JSON.stringify({ count: lines.length, first40: lines.slice(0, 40) });
};

window.__forkTest.timelineState = function () {
  var blocks = document.querySelectorAll('.studio-timeline-block');
  var voiceBlocks = document.querySelectorAll('.studio-timeline-voice-block');
  var withAudio = document.querySelectorAll('.studio-timeline-voice-block.has-audio');
  var placeholder = document.querySelectorAll('.studio-timeline-voice-block.is-placeholder');
  var lanes = document.querySelectorAll('.studio-track-lane');
  var headers = [];
  document.querySelectorAll('.studio-track-header-item').forEach(function (h) {
    headers.push((h.innerText || '').trim().split('\n')[0]);
  });
  return JSON.stringify({
    totalBlocks: blocks.length,
    voiceBlocks: voiceBlocks.length,
    voiceWithAudio: withAudio.length,
    voicePlaceholder: placeholder.length,
    lanes: lanes.length,
    trackHeaders: headers,
    hasVoiceTrackHeader: /TI\u1EB6NG L\u1ED4NG/i.test(headers.join(' | ')),
    hasSubtitleTrackHeader: /PH\u1EE4 \u0110\u1EC4/i.test(headers.join(' | '))
  });
};

window.__forkTest.loadVideo = function () {
  var input = document.getElementById('studio-hidden-file-input');
  if (!input) return 'NO_INPUT';
  var NAME = 'StarCraft II\uFF1A Legacy of the Void - Reclamation [uQnmfEka3vw].mp4';
  var videoPath = 'C:\\Users\\TTC\\AppData\\Roaming\\com.sublix.desktop\\downloads\\' + NAME;
  var file = new File([new Blob([new Uint8Array(8)], { type: 'video/mp4' })], NAME, { type: 'video/mp4' });
  Object.defineProperty(file, 'path', { value: videoPath, writable: false, configurable: false });
  var dt = new DataTransfer();
  dt.items.add(file);
  Object.defineProperty(input, 'files', { get: function () { return dt.files; }, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  return JSON.stringify({ ok: true, path: videoPath });
};

window.__forkTest.buttons = function () {
  var out = [];
  document.querySelectorAll('button').forEach(function (b) {
    var t = (b.innerText || b.textContent || '').trim();
    if (!t) return;
    if (out.length < 120) out.push(t.replace(/\s+/g, ' ').slice(0, 60));
  });
  return JSON.stringify(out);
};

'FORK_TEST_READY';
