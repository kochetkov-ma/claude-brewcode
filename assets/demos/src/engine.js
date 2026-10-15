// Scenario interpreter: model(S, t) is pure (no DOM, used by --check); the DOM part draws it via window.demo.render(t).
'use strict';
(function () {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✽', '✻', '✶', '✳', '✢', '·'];
  const TAIL = 0.6;
  const BLANK = { segs: [] };

  // line forms: "text" | ["text", "cls"] | {segs: [["text", "cls"], ...]}
  const MARK = /\[\[([a-z ]+)\|([^\]]*)\]\]/g, KV = /^(\s*)([A-Z][A-Za-z() \/-]{1,26}:)(\s+)(.*)$/;
  // markup [[cls|text]] inside a string; kv: gold-ish label before the first colon
  const mark = (str, base) => { const o = []; let i = 0, m; MARK.lastIndex = 0;
    while ((m = MARK.exec(str))) { if (m.index > i) o.push([str.slice(i, m.index), base]); o.push([m[2], m[1]]); i = m.index + m[0].length; }
    if (i < str.length || !o.length) o.push([str.slice(i), base]); return o; };
  const norm = (l, kv) => {
    if (typeof l === 'string') {
      const k = kv && KV.exec(l);
      return { segs: k ? [[k[1] + k[2], kv === true ? 'warn' : kv], ...mark(k[3] + k[4], 'wt')] : mark(l, '') };
    }
    return Array.isArray(l) ? { segs: [[l[0], l[1] || '']] } : l;
  };
  const row = (text, cls = '') => ({ segs: [[text, cls]] });

  function blocks(S) {
    const ev = S.events.map((e, i) => ({ ...e, _i: i })).sort((a, b) => a.at - b.at || a._i - b._i);
    const m = S.meta, out = [], spins = [], clears = [], skips = [], hls = [], keys = [], inputs = [], cards = [];
    out.push({ at: 0, keep: true, gap: 0, rows: () => [
      { segs: [[' ▐▛███▛█   ', 'clawd'], ['Claude Code', 'b wt'], [` v${m.version}`, 'dim']] },
      { segs: [['▝▜██████▀  ', 'clawd'], [`${m.model} · ${m.plan || 'Claude Max'}`, 'dim']] },
      { segs: [[' ▝▝   ▝▝   ', 'clawd'], [m.cwd, 'dim']] }] });
    let lastType = null;
    for (const e of ev) {
      const gap = e.gap === undefined ? 1 : e.gap;
      if (e.type === 'type') { lastType = e; inputs.push(e); }
      else if (e.type === 'submit') {
        inputs.push(e);
        const text = lastType ? lastType.text : '';
        out.push({ at: e.at, gap, rows: () => [{ segs: [['❯ ', 'dim'], [text, 'wt']], band: true }] });
      } else if (e.type === 'key') keys.push(e);
      else if (e.type === 'clear') clears.push(e.at);
      else if (e.type === 'card') cards.push(e);
      else if (e.type === 'skip') skips.push(e);
      else if (e.type === 'hl') hls.push(e);
      else if (e.type === 'spin') {
        spins.push(e);
        if (e.doneLine) out.push({ at: e.until, gap, rows: () => [{ segs: [['✻ ', 'gold'], [e.doneLine, 'dim']] }] });
      } else if (e.type === 'print' || e.type === 'fold') {
        const lines = e.type === 'fold' ? [[`… +${e.lines} lines (ctrl+o to expand)`, 'dim']] : e.lines;
        out.push({ at: e.at, gap, rows: (t) => lines.map((l, i) => [i, norm(l, e.kv)]).filter(([i]) => t >= e.at + i * (e.reveal || 0))
          .map(([i, l]) => (e.bullet && i === 0 ? { segs: [['⏺ ', 'wt'], ...l.segs] } : l)) });
      } else if (e.type === 'tool') {
        out.push({ at: e.at, gap, rows: (t) => {
          const done = e.resultAt !== undefined && t >= e.resultAt;
          const r = [{ segs: [['⏺ ', done ? 'ok' : 'dim'], [e.name, 'b wt'], [`(${e.arg})`, 'wt']] }];
          if (!done) return r.concat(e.noRunning ? [] : [row('  ⎿  Running…', 'dim')]);
          return r.concat([].concat(e.result || []).map((l, i) => ({ segs: [[i ? '     ' : '  ⎿  ', 'dim'], ...norm(l).segs] })));
        } });
      } else if (e.type === 'agent') {
        out.push({ at: e.at, gap, rows: (t) => {
          const r = [{ segs: [['⏺ ', t >= e.doneAt ? 'ok' : 'dim'], [e.agent, 'b wt'], [`(${e.desc})`, 'wt']] }];
          if (t >= e.doneAt) return r.concat([row(`  ⎿  Done (${e.stats})`, 'dim'), row('  (ctrl+o to expand)', 'dim')]);
          const ticks = (e.ticks || []).filter(([ts]) => t >= ts).slice(-2);
          if (!ticks.length) return r.concat([row('  ⎿  Initializing…', 'dim')]);
          return r.concat(ticks.map((k, i) => row(`${i ? '     ' : '  ⎿  '}${k[1]}`, 'dim')), ticks.length < 2 ? [row('     Running…', 'dim')] : [],
            [row('     (ctrl+b to run in background)', 'dim')]);
        } });
      } else throw new Error(`unknown event type: ${e.type}`);
    }
    return { out, spins, clears, skips, hls, keys, inputs, cards };
  }

  // summary card: staggered tiles with count-up; final values are exact
  function cardModel(c, t) {
    const tiles = c.tiles.map((x, i) => {
      const k = span(t, c.at + 0.2 + 0.14 * i, c.at + 0.9 + 0.14 * i), e = 1 - Math.pow(1 - k, 3);
      const text = x.to !== undefined ? (x.to * e).toFixed(x.dec || 0) + (x.suffix || '') : x.text;
      return { label: x.label, text, sub: x.sub || '', cls: x.cls || 'gold', k };
    });
    const vk = span(t, c.at + 0.25 + 0.14 * c.tiles.length + 0.5, c.at + 0.25 + 0.14 * c.tiles.length + 0.8);
    return { title: c.title, tiles, verdict: c.verdict && { ...c.verdict, k: vk }, note: c.note || '', k: span(t, c.at, c.at + 0.25),
      text: [c.title, ...c.tiles.map((x) => `${x.label} ${x.to !== undefined ? x.to.toFixed(x.dec || 0) + (x.suffix || '') : x.text} ${x.sub || ''}`),
        c.verdict ? `${c.verdict.label} ${c.verdict.text}` : '', c.note || ''].filter(Boolean) };
  }

  function model(S, t, B) {
    B = B || S._B || (S._B = blocks(S));
    const D = S.duration, END = D - TAIL, m = S.meta;
    const clearAt = Math.max(-1, ...B.clears.filter((c) => c <= t));
    const rows = [];
    for (const b of B.out) {
      if (b.at > t || (!b.keep && b.at < clearAt)) continue;
      const rs = b.rows(t);
      if (!rs.length) continue;
      if (rows.length) for (let g = 0; g < b.gap; g++) rows.push(BLANK);
      rows.push(...rs);
    }
    for (const s of B.spins) {
      if (t < s.at || t >= s.until || s.at < clearAt) continue;
      const el = s.secs ? s.secs[0] + (s.secs[1] - s.secs[0]) * span(t, s.at, s.until) : t - s.at;
      const tok = s.tokens ? Math.floor(s.tokens * span(t, s.at, s.until)) : Math.floor((t - s.at) * 60);
      if (rows.length) rows.push(BLANK);
      rows.push({ segs: [[SPIN[Math.floor((t - s.at) * 8) % SPIN.length] + ' ', 'gold'], [`${s.verb || 'Working'}…`, 'gold'],
        [` (${Math.floor(el)}s · ↓ ${tok} tokens)`, 'dim']] });
    }
    // input line: last type/submit event <= t decides
    const last = B.inputs.filter((e) => e.at <= t && e.at >= clearAt).pop();
    let text = '';
    if (last && last.type === 'type') {
      const cps = last.cps || 16, n = [...last.text].length;
      let k = 0;
      for (let i = 0; i < n; i++) if (t >= last.at + (i + 0.7 * (rnd(i + 7) - 0.5)) / cps) k = i + 1; else break;
      text = [...last.text].slice(0, k).join('');
    }
    const key = B.keys.filter((e) => t >= e.at && t < e.at + (e.hold || 0.9)).pop();
    const kbd = key ? { glyph: key.glyph, word: key.word, press: t < key.at + 0.14, alpha: 1 - span(t, key.at + (key.hold || 0.9) - 0.25, key.at + (key.hold || 0.9)) } : null;
    const ce = B.cards.filter((e) => e.at <= t && e.at >= clearAt).pop();
    const card = ce && cardModel(ce, t);
    const sk = B.skips.filter((e) => t >= e.at && t < e.until).pop();
    const hls = B.hls.map((h) => ({ match: h.match, k: Math.min(span(t, h.at, h.at + 0.15), 1 - span(t, h.at + (h.hold || 1.5), h.at + (h.hold || 1.5) + 0.4)) }))
      .filter((h) => h.k > 0);
    const ch = S.chapters, wrap = t >= D - 0.25;
    let ci = 0; ch.forEach((c, i) => { if (t >= c.at) ci = i; });
    const done = t >= END && !wrap;
    let cap = null;
    S.captions.forEach((c, i) => { if (t >= c.at) cap = { i, c }; });
    const next = S.captions[cap.i + 1], ca = cap.c.at;
    let capAlpha = Math.min(ca === 0 ? 1 : span(t, ca, ca + 0.3), next ? 1 - span(t, next.at - 0.2, next.at) : 1 - span(t, D - 0.6, D - 0.35));
    let capText = cap.c.text;
    if (t >= D - 0.35) { capText = S.captions[0].text; capAlpha = span(t, D - 0.35, D); }
    return { rows, text, placeholder: !text && !(last && last.type === 'type'), kbd, card, chip: sk ? (sk.label || `⏩ ${sk.factor}x`) : '', hls,
      chapter: { i: wrap ? 0 : ci, n: ch.length, label: ch[wrap ? 0 : ci].label, done },
      progress: { frac: wrap ? 1 : Math.floor(clamp(t / END) * 120) / 120, alpha: 1 - span(t, D - 0.4, D) }, caption: { text: capText, alpha: capAlpha },
      status: m.statusLine, footer: m.footer || '? for shortcuts', placeholderText: m.placeholder };
  }

  if (typeof module !== 'undefined') { module.exports = { model, blocks, TAIL }; return; }

  // ---------- DOM ----------
  const S = window.SCENARIO, $ = (id) => document.getElementById(id);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const G1 = /[⏺⎿❯✻✶✳✢✽·✓⏵▶⌫⏎⇥↓]/g;
  const glyphs = (s) => esc(s).replace(G1, (c) => `<span class="g1">${c}</span>`);
  function seg(text, cls, hls) {
    const hit = hls.filter((h) => h.k > 0);
    let h = null;
    if (hit.length) h = new RegExp(`(${hit.map((x) => x.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
    const parts = h ? text.split(h) : [text];
    const html = parts.map((p, i) => {
      if (i % 2 === 0) return glyphs(p);
      const k = Math.max(...hit.filter((x) => x.match === p).map((x) => x.k));
      return `<span class="hl" style="background:rgba(235,187,64,${(0.28 * k).toFixed(3)});text-shadow:0 0 ${(8 * k).toFixed(1)}px rgba(250,233,111,${(0.6 * k).toFixed(2)})">${glyphs(p)}</span>`;
    }).join('');
    return cls ? `<span class="${cls}">${html}</span>` : html;
  }
  const rowHtml = (r, hls) => `<div class="row${r.band ? ' band' : ''}">${r.segs.map(([x, c]) => seg(x, c, hls)).join('')}</div>`;

  const cardHtml = (c) => `<div class="ct" style="opacity:${c.k.toFixed(2)}">${glyphs(c.title)}</div><div class="tiles">`
    + c.tiles.map((x) => `<div class="tile ${x.cls}" style="opacity:${x.k.toFixed(2)};transform:translateY(${((1 - x.k) * 10).toFixed(1)}px)"><div class="tl">${esc(x.label)}</div><div class="tv">${esc(x.text)}</div><div class="ts">${esc(x.sub)}</div></div>`).join('')
    + '</div>' + (c.verdict ? `<div class="verdict ${c.verdict.cls || 'ok'}" style="opacity:${c.verdict.k.toFixed(2)}"><span>${esc(c.verdict.label)}</span><b>${glyphs(c.verdict.text)}</b></div>` : '')
    + (c.note ? `<div class="note" style="opacity:${c.verdict ? c.verdict.k.toFixed(2) : 1}">${glyphs(c.note)}</div>` : '');
  document.documentElement.style.setProperty('--rows', S.meta.rows || 26);
  $('foot').innerHTML = '<div class="row dim" id="st"></div><div class="row dim" id="ft"></div>';
  let shown = {};
  const set = (k, v, fn) => { if (shown[k] !== v) { shown[k] = v; fn(v); } };
  S.chapters.slice(1).forEach((c) => {
    const g = document.createElement('div');
    g.className = 'gap'; g.style.left = (c.at / (S.duration - TAIL) * 100) + '%'; $('prog').appendChild(g);
  });

  window.demo = { duration: S.duration, render(t) {
    t = ((t % S.duration) + S.duration) % S.duration;
    const M = model(S, t);
    $('stage').innerHTML = M.rows.slice(-(S.meta.rows || 26)).map((r) => rowHtml(r, M.hls)).join('');
    $('inp').innerHTML = `<span class="g1">❯</span> ${M.placeholder ? `<span class="cur"></span><span class="dim">Try "${esc(M.placeholderText)}"</span>` : `${glyphs(M.text)}<span class="cur"></span>`}`
      + (M.kbd ? `<div id="kbd" class="${M.kbd.press ? 'press' : ''}" style="opacity:${M.kbd.alpha.toFixed(2)}"><b class="key">${glyphs(M.kbd.glyph)}</b><small>${esc(M.kbd.word)}</small></div>` : '');
    $('card').innerHTML = M.card ? cardHtml(M.card) : '';
    $('card').style.display = M.card ? 'flex' : 'none';
    set('st', M.status, (v) => { $('st').textContent = v; });
    set('ft', M.footer, (v) => { $('ft').textContent = v; });
    set('chip', M.chip, (v) => { $('chip').textContent = v; $('chip').style.display = v ? '' : 'none'; });
    const c = M.chapter;
    set('chap', c.done ? 'done' : c.i, () => { $('chap').innerHTML = c.done ? '<i>✓</i> end · replay' : `▶ <i>${c.i + 1}</i>/${c.n} · ${esc(c.label)}`; });
    $('fill').style.width = (M.progress.frac * 100).toFixed(2) + '%';
    $('fill').style.opacity = M.progress.alpha.toFixed(3);
    set('cap', M.caption.text, (v) => { $('cap').textContent = v; });
    $('cap').style.opacity = M.caption.alpha.toFixed(3);
    let over = 0;
    document.querySelectorAll('#stage .row, #inp, #st, #ft, #card .tile, #card .tv, #card .verdict, #card .note, #card .ct').forEach((r) => { if (r.scrollWidth > r.clientWidth + 1 && r.id !== 'inp') over++; });
    return { overflow: over };
  } };
})();
