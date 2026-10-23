// Bo phong tich cho FORK Sublix GUI test (CDP port 9223)
// Load qua XHR sync tu vite dev server: /test_dubbing_input/fork-gui-analyze.js
(function () {
  if (!window.__forkTest) window.__forkTest = {};

  // Lay segments truc tiep tu React state (fiber)
  window.__forkTest.segs = function () {
    var el = document.querySelector('.studio-timeline-subtitle-block');
    if (!el) return null;
    var k = Object.keys(el).filter(function (x) { return x.indexOf('__reactFiber') === 0; })[0];
    if (!k) return null;
    var f = el[k];
    var found = null;
    var d = 0;
    while (f && d < 150) {
      var p = f.memoizedProps;
      if (p && Array.isArray(p.segments)) { found = p.segments; break; }
      var h = f.memoizedState;
      var hi = 0;
      while (h && hi < 150) {
        var v = h.memoizedState;
        if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' &&
            ('start' in v[0]) && ('translated' in v[0])) { found = v; break; }
        h = h.next; hi++;
      }
      if (found) break;
      f = f.return; d++;
    }
    if (!found) return null;
    return found.map(function (s) {
      return {
        id: s.id, start: s.start, end: s.end, spk: s.speakerId,
        orig: s.original, tr: s.translated,
        hasAudio: !!s.hasAudio, adur: (s.audioDuration === undefined || s.audioDuration === null) ? null : s.audioDuration,
        src: s.source
      };
    });
  };

  // Parse "MM:SS.CC" -> seconds
  function tcToSec(t) {
    var m = /(\d+):(\d+)\.(\d+)/.exec(t || '');
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]) + (+m[3]) / 100;
  }
  window.__forkTest.tcToSec = tcToSec;

  // 3A: so sanh moc thoi gian giua track PHU DE va track TIENG LONG, doc tu DOM (title attr)
  window.__forkTest.align = function () {
    var subs = {}, voices = {};
    document.querySelectorAll('.studio-timeline-subtitle-block').forEach(function (b) {
      var id = b.getAttribute('data-seg-id');
      var t = b.getAttribute('title') || '';
      var m = /\[(\d+:\d+\.\d+)\s*→\s*(\d+:\d+\.\d+)\]/.exec(t);
      if (m) subs[id] = { s: tcToSec(m[1]), e: tcToSec(m[2]), title: t };
    });
    document.querySelectorAll('.studio-timeline-voice-block').forEach(function (b) {
      var id = b.getAttribute('data-seg-id');
      var t = b.getAttribute('title') || '';
      var m = /(\d+:\d+\.\d+)\s*→\s*(\d+:\d+\.\d+)/.exec(t);
      if (m) voices[id] = { s: tcToSec(m[1]), e: tcToSec(m[2]), hasAudio: b.className.indexOf('has-audio') >= 0 };
    });
    var ids = Object.keys(subs);
    var rows = [];
    ids.forEach(function (id) {
      var sb = subs[id], vb = voices[id];
      rows.push({
        id: +id,
        subS: sb.s, subE: sb.e,
        vS: vb ? vb.s : null, vE: vb ? vb.e : null,
        dS: vb ? Math.round((vb.s - sb.s) * 1000) : null,
        dE: vb ? Math.round((vb.e - sb.e) * 1000) : null,
        hasVoiceBlock: !!vb, hasAudio: vb ? vb.hasAudio : false
      });
    });
    var withVoice = rows.filter(function (r) { return r.hasVoiceBlock; });
    var maxAbsS = 0, maxAbsE = 0, over50s = 0, over50e = 0;
    withVoice.forEach(function (r) {
      var as = Math.abs(r.dS), ae = Math.abs(r.dE);
      if (as > maxAbsS) maxAbsS = as;
      if (ae > maxAbsE) maxAbsE = ae;
      if (as > 50) over50s++;
      if (ae > 50) over50e++;
    });
    var worstE = withVoice.slice().sort(function (a, b) { return Math.abs(b.dE) - Math.abs(a.dE); }).slice(0, 10);
    var worstS = withVoice.slice().sort(function (a, b) { return Math.abs(b.dS) - Math.abs(a.dS); }).slice(0, 10);
    return {
      subBlocks: ids.length,
      voiceBlocks: Object.keys(voices).length,
      paired: withVoice.length,
      unpaired: rows.filter(function (r) { return !r.hasVoiceBlock; }).length,
      maxAbsStartDeltaMs: maxAbsS,
      maxAbsEndDeltaMs: maxAbsE,
      startOver50ms: over50s,
      endOver50ms: over50e,
      worstStart: worstS,
      worstEnd: worstE,
      rows: rows
    };
  };

  // 3B: phan tich "tieng thua" / lap text
  function words(t) {
    var s = (t || '').trim();
    if (!s) return [];
    return s.split(/\s+/);
  }
  window.__forkTest.words = words;

  window.__forkTest.dub = function () {
    var segs = window.__forkTest.segs() || [];
    var withAudio = segs.filter(function (s) { return s.hasAudio && s.adur && s.adur > 0; });
    var totalAudio = 0;
    var ratios = [];
    withAudio.forEach(function (s) {
      totalAudio += s.adur;
      var w = words(s.tr || s.orig).length;
      ratios.push({
        id: s.id, start: s.start, end: s.end, adur: s.adur, w: w,
        r: w > 0 ? +(s.adur / w).toFixed(3) : null,
        tr: s.tr, orig: s.orig, src: s.src
      });
    });
    var over1 = ratios.filter(function (r) { return r.r !== null && r.r > 1.0; });
    var top5 = ratios.slice().sort(function (a, b) { return b.adur - a.adur; }).slice(0, 5);
    var top5ByRatio = ratios.slice().sort(function (a, b) { return (b.r || 0) - (a.r || 0); }).slice(0, 10);

    // lap text giua cac cue lien nhau
    var dups = [];
    for (var i = 1; i < ratios.length; i++) {
      var a = words(ratios[i - 1].tr || ratios[i - 1].orig).map(function (x) { return x.toLowerCase(); });
      var b = words(ratios[i].tr || ratios[i].orig).map(function (x) { return x.toLowerCase(); });
      if (a.length >= 3 && b.length >= 3) {
        var k = 0;
        while (k < a.length && k < b.length && a[k] === b[k]) k++;
        if (k >= 3) {
          dups.push({ prevId: ratios[i - 1].id, id: ratios[i].id, commonWords: k, prev: ratios[i - 1].tr, cur: ratios[i].tr });
        }
      }
    }

    // overlap: audio cua cue i tran sang cue i+1
    var overlaps = [];
    for (var j = 0; j < withAudio.length - 1; j++) {
      var vEnd = withAudio[j].start + withAudio[j].adur;
      var nxtStart = withAudio[j + 1].start;
      if (vEnd > nxtStart + 0.001) {
        overlaps.push({ id: withAudio[j].id, nextId: withAudio[j + 1].id, overlapSec: +(vEnd - nxtStart).toFixed(3) });
      }
    }

    return {
      totalCues: segs.length,
      withAudio: withAudio.length,
      noAudio: segs.length - withAudio.length,
      totalAudioSec: +totalAudio.toFixed(2),
      over1sPerWord: over1,
      dupPairs: dups,
      top5Longest: top5,
      top10ByRatio: top5ByRatio,
      overlaps: overlaps,
      ratios: ratios
    };
  };

  // Tien do
  window.__forkTest.progress = function () {
    var t = document.body.innerText || '';
    var m = t.match(/T\u1ED5ng h\u1EE3p gi\u1ECDng c\u00E2u (\d+)\/(\d+)/);
    return m ? (m[1] + '/' + m[2]) : 'no-progress-text';
  };

  // Tieu de panel phai: thong bao trang thai
  window.__forkTest.status = function () {
    var t = document.body.innerText || '';
    var lines = t.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    var keep = lines.filter(function (s) {
      return /T\u1ED5ng h\u1EE3p|\u0110ang x\u1EED l\u00FD|Done|Ho\u00E0n t\u1EA5t|\u0110ang x\u1EEDF l\u00FD|\u0111ang ch\u1EA1y|VietNeu|L\u1ED5ng ti\u1EBFng/i.test(s);
    });
    return keep.slice(0, 40);
  };

  'ANALYZE_READY';
})();
