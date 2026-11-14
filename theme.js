// timepoetry look: colour by the visitor's clock, and sparse night-time stars.
// The same palettes and star field as the home page, as a module other pages can share.
// License: AGPL-3.0-or-later.

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const P = (dark, stars, o) => ({ dark, stars, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hex(v)])) });
const PALETTES = {
  night: P(true, 1,    { bg1: '#0a1030', bg2: '#161d45', ink: '#ece5cf', muted: '#a2a7c4', accent: '#dcb866', line: '#2c3566', panel: '#121a40', moonLit: '#f3ead0', moonDark: '#1c2552' }),
  dawn:  P(false, 0,   { bg1: '#f1d3cb', bg2: '#f9ead6', ink: '#38203c', muted: '#735566', accent: '#9a4a2c', line: '#dcb6ae', panel: '#f8e2d6', moonLit: '#fffaf0', moonDark: '#d9b3b4' }),
  day:   P(false, 0,   { bg1: '#dde8f2', bg2: '#f4f1e7', ink: '#1a2044', muted: '#535a79', accent: '#85570b', line: '#c3cbd9', panel: '#eef0ee', moonLit: '#fffdf6', moonDark: '#b9c4d6' }),
  dusk:  P(true, 0.4,  { bg1: '#2a1638', bg2: '#6b3558', ink: '#f6e8ec', muted: '#d0b3c6', accent: '#f1c480', line: '#7a4a70', panel: '#3b1f49', moonLit: '#fbeede', moonDark: '#4a2a5a' }),
};
const KEYS = [[0, 'night'], [5, 'night'], [6.25, 'dawn'], [7.25, 'dawn'], [8.75, 'day'], [16.25, 'day'], [17.5, 'dusk'], [18.75, 'dusk'], [20.25, 'night'], [24, 'night']];
const PREVIEW = { night: 1, dawn: 6.75, day: 12, dusk: 18 };   // #night, #dawn, #day, #dusk in the address preview a time of day
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

function makeStars(cv) {
  const ctx = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let list = [], w = 0, h = 0, raf = 0, last = 0;
  let seed = 20261110; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(220, w * h / 7000));
    seed = 20261110;
    list = Array.from({ length: n }, () => ({ x: rnd() * w, y: rnd() * h, r: .35 + rnd() * rnd() * 1.1, a: .35 + rnd() * .55, p: rnd() * 6.283, s: .25 + rnd() * .65, gold: rnd() < .18, tw: rnd() < .6 }));
    draw(performance.now());
  }
  function draw(now) {
    ctx.clearRect(0, 0, w, h);
    const tt = still.matches ? 0 : now / 1000;
    for (const st of list) {
      const k = st.tw ? .72 + .28 * Math.sin(st.p + tt * st.s) : 1;
      ctx.globalAlpha = st.a * k;
      ctx.fillStyle = st.gold ? '#f0d28a' : '#eef1ff';
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.283); ctx.fill();
    }
  }
  function loop(now) {
    raf = 0;
    if (api.level <= 0 || document.hidden || still.matches) return;
    if (now - last > 66) { last = now; draw(now); }
    raf = requestAnimationFrame(loop);
  }
  const api = { level: 1, wake() { if (!raf) raf = requestAnimationFrame(loop); } };
  addEventListener('resize', size); document.addEventListener('visibilitychange', () => api.wake());
  size();
  return api;
}

// Paints the colour tokens on <html> now and once a minute, and marks the ground
// as data-ground="dark" or "light". onPaint(dark) runs after every repaint.
export function startTheme(onPaint) {
  const stars = makeStars(document.getElementById('stars'));
  function paint(date) {
    const forced = PREVIEW[location.hash.slice(1)];
    const h = forced ?? date.getHours() + date.getMinutes() / 60;
    let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
    const [h0, n0] = KEYS[i], [h1, n1] = KEYS[i + 1];
    const A = PALETTES[n0], B = PALETTES[n1], t = (h - h0) / (h1 - h0);
    const out = { bg1: mix(A.bg1, B.bg1, t), bg2: mix(A.bg2, B.bg2, t) };
    const text = ['ink', 'muted', 'accent', 'line', 'panel', 'moonLit', 'moonDark'];
    let dark;
    if (A.dark === B.dark) { for (const k of text) out[k] = mix(A[k], B[k], t); dark = A.dark; }
    else {
      // Between a light and a dark palette the ground blends, but the ink keeps to whichever side still reads.
      const mid = mix(out.bg1, out.bg2, .5);
      const side = contrast(A.ink, mid) >= contrast(B.ink, mid) ? A : B;
      for (const k of text) out[k] = side[k];
      out.panel = mix(out.bg1, out.bg2, .5);
      dark = side.dark;
    }
    const root = document.documentElement, s = root.style;
    const css = { bg1: '--bg1', bg2: '--bg2', ink: '--ink', muted: '--muted', accent: '--accent', line: '--line', panel: '--panel', moonLit: '--moon-lit', moonDark: '--moon-dark' };
    for (const k in css) s.setProperty(css[k], `rgb(${out[k].join(' ')})`);
    s.setProperty('color-scheme', dark ? 'dark' : 'light');
    root.dataset.ground = dark ? 'dark' : 'light';
    stars.level = A.stars + (B.stars - A.stars) * t;
    s.setProperty('--stars', stars.level.toFixed(3));
    stars.wake();
    if (onPaint) onPaint(dark);
  }
  const tick = () => paint(new Date());
  tick();
  addEventListener('hashchange', tick);
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  return { repaint: tick };
}
