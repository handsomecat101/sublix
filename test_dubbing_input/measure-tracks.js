// Bộ đo 2 track + phát hiện tiếng thừa. Dùng cho test A→Z.
// Nạp: eval nội dung file này -> window.__m được tạo.
window.__m = (function () {
  function parseTC(s) {
    // App hiển thị MM:SS.FF (vd "05:17.18") — KHÔNG phải HH:MM:SS.FF.
    // Regex cũ greedy 2 nhóm optional làm "05:17.18" thành 5 GIỜ => sai 60 lần.
    var t = String(s).trim();
    var m = t.match(/^(\d{1,2}):(\d{1,2})\.(\d{1,2})$/);
    if (m) return (+m[1]) * 60 + (+m[2]) + (+m[3]) / 100;   // MM:SS.FF
    var m2 = t.match(/^(\d{1,3}):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/);
    if (m2) return (+m2[1]) * 3600 + (+m2[2]) * 60 + (+m2[3]) + (+m2[4]) / 100; // HH:MM:SS.FF
    return null;
  }
  function tsRange(title) {
    var m = String(title || '').match(/(\d{1,2}:\d{2}(?::\d{2})?\.\d{1,2})\s*(?:→|->)\s*(\d{1,2}:\d{2}(?::\d{2})?\.\d{1,2})/);
    if (!m) return null;
    var a = parseTC(m[1]), b = parseTC(m[2]);
    if (a === null || b === null) return null;
    return { start: a, end: b, dur: +(b - a).toFixed(3), raw: m[1] + ' -> ' + m[2] };
  }
  function collect() {
    var subs = {}, voices = {};
    document.querySelectorAll('.studio-timeline-block').forEach(function (el) {
      var id = el.getAttribute('data-seg-id');
      if (id === null) return;
      var r = tsRange(el.getAttribute('title'));
      if (!r) return;
      if (el.className.indexOf('studio-timeline-voice-block') >= 0) {
        voices[id] = {
          id: id, start: r.start, end: r.end, dur: r.dur, raw: r.raw,
          hasAudio: el.className.indexOf('has-audio') >= 0,
          text: (el.querySelector('.studio-voice-block-text') || {}).textContent || ''
        };
      } else {
        subs[id] = {
          id: id, start: r.start, end: r.end, dur: r.dur, raw: r.raw,
          label: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120)
        };
      }
    });
    // text bản dịch từ panel phải.
    // Class THẬT của ô dịch là `studio-segment-text-translated` (không phải
    // `studio-form-input` — class đó là ô tìm kiếm và luôn rỗng).
    var panelTexts = [];
    document.querySelectorAll('input.studio-segment-text-translated').forEach(function (i) {
      var v = (i.value || '').trim();
      if (v) panelTexts.push(v);
    });
    if (!panelTexts.length) {
      document.querySelectorAll('input.studio-form-input').forEach(function (i) {
        var v = (i.value || '').trim();
        if (v) panelTexts.push(v);
      });
    }
    return { subs: subs, voices: voices, panelTexts: panelTexts };
  }
  function overlapWords(a, b) {
    // số từ lớn nhất mà HẬU TỐ của a == TIỀN ĐỀ của b
    var aw = String(a).trim().split(/\s+/).filter(Boolean);
    var bw = String(b).trim().split(/\s+/).filter(Boolean);
    var best = 0;
    for (var k = Math.min(aw.length, bw.length); k >= 1; k--) {
      var same = true;
      for (var i = 0; i < k; i++) {
        if (aw[aw.length - k + i].toLowerCase() !== bw[i].toLowerCase()) { same = false; break; }
      }
      if (same) { best = k; break; }
    }
    return best;
  }
  function rows() {
    var c = collect();
    var ids = Object.keys(c.subs).sort(function (a, b) { return (+a) - (+b); });
    var out = [];
    ids.forEach(function (id, idx) {
      var s = c.subs[id], v = c.voices[id];
      var translated = (v && v.text) || c.panelTexts[idx] || '';
      var words = translated ? translated.trim().split(/\s+/).filter(Boolean).length : 0;
      var audioDur = v ? v.dur : null;
      var row = {
        id: id,
        subStart: s.start, subEnd: s.end, subDur: s.dur,
        voiceStart: v ? v.start : null, voiceEnd: v ? v.end : null,
        voiceDur: audioDur,
        hasAudio: v ? v.hasAudio : false,
        startDelta: v ? +(v.start - s.start).toFixed(3) : null,
        endDelta: v ? +(v.end - s.end).toFixed(3) : null,
        words: words,
        text: translated.slice(0, 200),
        sPerWord: (audioDur && words) ? +(audioDur / words).toFixed(3) : null,
        overlapPrev: null
      };
      if (out.length) row.overlapPrev = overlapWords(out[out.length - 1].text, translated);
      out.push(row);
    });
    return { rows: out, nSub: ids.length, nVoice: Object.keys(c.voices).length, nAudio: Object.keys(c.voices).filter(function (k) { return c.voices[k].hasAudio; }).length };
  }
  return {
    rows: rows,
    align: function () {
      var r = rows();
      var withVoice = r.rows.filter(function (x) { return x.voiceStart !== null; });
      var startBad = withVoice.filter(function (x) { return Math.abs(x.startDelta) > 0.05; });
      var endBad = withVoice.filter(function (x) { return Math.abs(x.endDelta) > 0.05; });
      var maxStart = withVoice.reduce(function (m, x) { return Math.max(m, Math.abs(x.startDelta)); }, 0);
      var maxEnd = withVoice.reduce(function (m, x) { return Math.max(m, Math.abs(x.endDelta)); }, 0);
      return {
        nSub: r.nSub, nVoice: r.nVoice, nAudio: r.nAudio,
        nWithVoice: withVoice.length,
        startMismatchOver50ms: startBad.length,
        endMismatchOver50ms: endBad.length,
        maxStartDelta: +maxStart.toFixed(3),
        maxEndDelta: +maxEnd.toFixed(3),
        startBad: startBad.slice(0, 10).map(function (x) { return { id: x.id, sub: x.subStart, voice: x.voiceStart, d: x.startDelta }; }),
        endBadSample: endBad.slice(0, 5).map(function (x) { return { id: x.id, subEnd: x.subEnd, voiceEnd: x.voiceEnd, d: x.endDelta }; })
      };
    },
    ramble: function () {
      var r = rows();
      var audio = r.rows.filter(function (x) { return x.voiceDur && x.words; });
      var slow = audio.filter(function (x) { return x.sPerWord > 1.0; });
      var fast = audio.filter(function (x) { return x.sPerWord < 0.12; });
      var rep = r.rows.filter(function (x) { return x.overlapPrev !== null && x.overlapPrev >= 3; });
      var totalAudio = audio.reduce(function (s, x) { return s + x.voiceDur; }, 0);
      var longest = audio.slice().sort(function (a, b) { return b.voiceDur - a.voiceDur; }).slice(0, 8)
        .map(function (x) {
          return { id: x.id, start: x.subStart, end: x.subEnd, dur: x.voiceDur, words: x.words, sPerWord: x.sPerWord, text: x.text };
        });
      return {
        nAudio: audio.length,
        totalVoiceAudioSec: +totalAudio.toFixed(2),
        nSlowOver1sPerWord: slow.length,
        nFastUnder012sPerWord: fast.length,
        nRepeatOverlap3plus: rep.length,
        slow: slow.slice(0, 8).map(function (x) { return { id: x.id, dur: x.voiceDur, words: x.words, sPerWord: x.sPerWord, text: x.text }; }),
        repeat: rep.slice(0, 10).map(function (x) { return { id: x.id, overlapWords: x.overlapPrev, text: x.text }; }),
        longest: longest
      };
    },
    dump: function () { return rows(); }
  };
})();
'__M_READY';
