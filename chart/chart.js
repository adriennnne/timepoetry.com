// timepoetry chart engine: natal and event charts, midpoint composites, Davison charts,
// houses and aspects, all from the Swiss Ephemeris compiled to WebAssembly.
// Local time becomes UT through the browser's own copy of the IANA time zone database.
// License: AGPL-3.0-or-later, the same terms as the Swiss Ephemeris itself.

import { BODIES } from '../cyclogram/cyclogram.js';

export const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
export const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => g + '︎');

const cls = k => (k === 'sun' || k === 'moon') ? 'lum' : (k === 'chiron' || k === 'node' || k === 'snode') ? 'pt' : 'pl';
// Everything a chart shows. Angles are written as letters, the way most wheels label them.
export const POINTS = [
  ...BODIES.map(b => ({ key: b.key, id: b.id, name: b.name, glyph: b.glyph, cls: cls(b.key), canRetro: b.stations })),
  { key: 'snode', name: 'South Node', glyph: '☋', cls: 'pt', canRetro: false },
  { key: 'asc', name: 'Ascendant', glyph: 'AC', text: true, cls: 'angle', canRetro: false },
  { key: 'mc', name: 'Midheaven', glyph: 'MC', text: true, cls: 'angle', canRetro: false },
];
export const POINT = Object.fromEntries(POINTS.map(p => [p.key, p]));

export const HOUSE_SYSTEMS = [
  ['P', 'Placidus'], ['K', 'Koch'], ['W', 'Whole Sign'], ['E', 'Equal'], ['O', 'Porphyry'],
  ['R', 'Regiomontanus'], ['C', 'Campanus'], ['B', 'Alcabitius'], ['T', 'Topocentric'], ['M', 'Morinus'],
];

export const ASPECTS = [
  { angle: 0,   name: 'conjunction', glyph: '☌', kind: 'conj' },
  { angle: 60,  name: 'sextile',     glyph: '⚹', kind: 'soft' },
  { angle: 90,  name: 'square',      glyph: '□', kind: 'hard' },
  { angle: 120, name: 'trine',       glyph: '△', kind: 'soft' },
  { angle: 150, name: 'quincunx',    glyph: '⚻', kind: 'minor' },
  { angle: 180, name: 'opposition',  glyph: '☍', kind: 'hard' },
];
// The site's orbs: Chiron and the nodes 3°, anything with the Sun or Moon 8°, angles 5°, planet to planet 6°.
// The quincunx never gets more than 3°.
export function orbFor(a, b, asp) {
  let o;
  if (a.cls === 'pt' || b.cls === 'pt') o = 3;
  else if (a.cls === 'lum' || b.cls === 'lum') o = 8;
  else if (a.cls === 'angle' || b.cls === 'angle') o = 5;
  else o = 6;
  return asp.angle === 150 ? Math.min(o, 3) : o;
}

export const norm360 = x => ((x % 360) + 360) % 360;
export const norm180 = x => { x = norm360(x); return x > 180 ? x - 360 : x; };
const RAD = Math.PI / 180;
export const msToJd = ms => ms / 86400000 + 2440587.5;
export const jdToMs = jd => (jd - 2440587.5) * 86400000;

// A longitude cut (never rounded) to whole arcseconds: sign, degree, minute, second.
export function split(lon) {
  const total = Math.floor(norm360(lon) * 3600 + 1e-6) % 1296000;
  const within = total % 108000;
  return { sign: Math.floor(total / 108000), deg: Math.floor(within / 3600), min: Math.floor((within % 3600) / 60), sec: within % 60 };
}

// Circular mean of angles in degrees. Two angles give their nearer midpoint.
export function circMean(list) {
  let x = 0, y = 0;
  for (const a of list) { x += Math.cos(a * RAD); y += Math.sin(a * RAD); }
  if (Math.hypot(x, y) < 1e-9) return norm360(list[0] + 90);   // exactly opposite: either midpoint is as near
  return norm360(Math.atan2(y, x) / RAD);
}
// The point on the globe midway between places (great-circle midpoint, generalised to any number).
export function geoCenter(list) {
  let x = 0, y = 0, z = 0;
  for (const p of list) {
    const la = p.lat * RAD, lo = p.lon * RAD;
    x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
  }
  const lon = Math.atan2(y, x) / RAD, lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
  return { lat, lon: norm180(lon) };
}

// ---- Time zones -----------------------------------------------------------------------------
const fmtCache = new Map();
function zoneFmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', era: 'short' });
    fmtCache.set(tz, f);
  }
  return f;
}
export function validZone(tz) { try { zoneFmt(tz); return true; } catch (e) { return false; } }
function utcFields(y, mo, d, h, mi, s) { const u = new Date(0); u.setUTCFullYear(y, mo, d); u.setUTCHours(h, mi, s, 0); return +u; }
// Wall-clock time in tz at instant ms, expressed as if it were UTC.
function wallMs(ms, tz) {
  const p = {};
  for (const x of zoneFmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  let y = +p.year; if (p.era && /^B/.test(p.era)) y = 1 - y;
  return utcFields(y, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
export const zoneOffsetMs = (ms, tz) => wallMs(ms, tz) - ms;
export function zoneAbbr(ms, tz) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find(x => x.type === 'timeZoneName');
    return p && !/^GMT/.test(p.value) ? p.value : '';
  } catch (e) { return ''; }
}
// Parse "+5:30", "-4", "−05:00", "UTC-3" into minutes east of Greenwich; null if not an offset.
export function parseOffset(s) {
  const m = /^\s*(?:UTC|GMT)?\s*([+\-−–])\s*(\d{1,2})(?:[:h.]?(\d{2}))?\s*$/i.exec(s || '');
  if (!m) return null;
  const v = (+m[2]) * 60 + (+(m[3] || 0));
  return v > 15 * 60 ? null : (m[1] === '+' ? v : -v);
}
// Local date and time to a UT instant. Returns { ms, offsetMin, note } where note flags
// a clock time that was skipped or happened twice.
export function localToUt(f, zone, offsetMin) {
  const wall = utcFields(f.y, f.m, f.d, f.h, f.mi, 0);
  if (offsetMin != null) return { ms: wall - offsetMin * 60000, offsetMin, offsetSec: offsetMin * 60, note: '' };
  const o1 = zoneOffsetMs(wall, zone);
  let ms = wall - o1;
  const o2 = zoneOffsetMs(ms, zone);
  if (o2 !== o1) ms = wall - o2;
  let note = '';
  if (wallMs(ms, zone) !== wall) note = 'skipped';                     // a spring-forward gap
  else {
    const other = [ms - 3600000, ms + 3600000].find(t => wallMs(t, zone) === wall);
    if (other != null) { ms = Math.min(ms, other); note = 'twice'; }   // fall-back: take the first
  }
  const offsetSec = Math.round(zoneOffsetMs(ms, zone) / 1000);
  return { ms, offsetMin: Math.round(offsetSec / 60), offsetSec, note };
}

// ---- Coordinates ------------------------------------------------------------------------------
// Accepts 43.65, -79.38, 43N39, 79W23, 43°39'N, 43 39 12 N and the like. Returns degrees or null.
export function parseCoord(s, isLat) {
  s = String(s || '').trim().replace(/[−–]/g, '-');
  if (!s) return null;
  let m = /^([+-]?\d+(?:\.\d+)?)$/.exec(s);
  let v;
  if (m) v = +m[1];
  else {
    m = /^([+-]?)(\d+(?:\.\d+)?)\s*(?:°|\s|([NSEWnsew]))\s*(?:(\d+(?:\.\d+)?)\s*(?:['′]|\s)?\s*)?(?:(\d+(?:\.\d+)?)\s*(?:["″]|'')?\s*)?([NSEWnsew])?$/.exec(s);
    if (!m) return null;
    const hemi = (m[3] || m[6] || '').toUpperCase();
    v = +m[2] + (+(m[4] || 0)) / 60 + (+(m[5] || 0)) / 3600;
    if (m[1] === '-' || hemi === 'S' || hemi === 'W') v = -v;
    if (hemi && (isLat ? !'NS'.includes(hemi) : !'EW'.includes(hemi))) return null;
  }
  if (!isFinite(v) || Math.abs(v) > (isLat ? 90 : 180)) return null;
  return v;
}
export function coordText(v, isLat) {
  const h = isLat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E');
  const t = Math.round(Math.abs(v) * 60);
  return `${Math.floor(t / 60)}${h}${String(t % 60).padStart(2, '0')}`;
}

// ---- The ephemeris ----------------------------------------------------------------------------
const SEFLG_SWIEPH = 2, SEFLG_SPEED = 256, SE_ECL_NUT = -1;

export class Charts {
  constructor(M) {
    this.M = M;
    this.xx = M._malloc(8 * 6);
    this.cusps = M._malloc(8 * 40);
    this.ascmc = M._malloc(8 * 12);
    this.err = M._malloc(256);
  }
  calc(jd, id) {
    const M = this.M;
    if (M._swe_calc_ut(jd, id, SEFLG_SWIEPH | SEFLG_SPEED, this.xx, this.err) < 0) throw new Error(M.UTF8ToString(this.err));
    return { lon: M.getValue(this.xx, 'double'), speed: M.getValue(this.xx + 24, 'double') };
  }
  obliquity(jd) { this.M._swe_calc_ut(jd, SE_ECL_NUT, SEFLG_SWIEPH, this.xx, this.err); return this.M.getValue(this.xx, 'double'); }
  readHouses(rc, hsys) {
    const M = this.M, cusps = [];
    for (let i = 1; i <= 12; i++) cusps.push(M.getValue(this.cusps + 8 * i, 'double'));
    return {
      cusps, asc: M.getValue(this.ascmc, 'double'), mc: M.getValue(this.ascmc + 8, 'double'), armc: M.getValue(this.ascmc + 16, 'double'),
      fallback: rc < 0 && hsys !== 'O' ? 'Porphyry' : '',   // the Swiss Ephemeris falls back to Porphyry where a system fails (polar latitudes)
    };
  }
  houses(jd, lat, lon, hsys) {
    const rc = this.M._swe_houses_ex(jd, 0, lat, lon, hsys.charCodeAt(0), this.cusps, this.ascmc);
    return this.readHouses(rc, hsys);
  }
  housesFromArmc(armc, lat, eps, hsys) {
    const rc = this.M._swe_houses_armc(armc, lat, eps, hsys.charCodeAt(0), this.cusps, this.ascmc);
    return this.readHouses(rc, hsys);
  }

  // A chart for one moment and place. timeKnown false: positions only, no houses or angles.
  cast({ jd, lat, lon, timeKnown, hsys }) {
    const pts = {};
    const missing = [];
    for (const p of POINTS) {
      if (p.id == null) continue;
      try { pts[p.key] = this.calc(jd, p.id); } catch (e) { missing.push(p.name); }
    }
    if (pts.node) pts.snode = { lon: norm360(pts.node.lon + 180), speed: pts.node.speed };
    let h = null;
    if (timeKnown) {
      h = this.houses(jd, lat, lon, hsys);
      pts.asc = { lon: h.asc, speed: null }; pts.mc = { lon: h.mc, speed: null };
    }
    return { jd, lat, lon, timeKnown, pts, cusps: h ? h.cusps : null, fallback: h ? h.fallback : '', missing };
  }

  // Midpoint composite. Planets are the (circular) midpoints; houses are built from the composite
  // Midheaven at the latitude midway between the places, the derived-Ascendant method.
  composite(charts, hsys) {
    const pts = {};
    for (const p of POINTS) {
      if (p.key === 'snode' || p.text) continue;
      if (charts.every(c => c.pts[p.key])) pts[p.key] = { lon: circMean(charts.map(c => c.pts[p.key].lon)), speed: null };
    }
    if (pts.node) pts.snode = { lon: norm360(pts.node.lon + 180), speed: null };
    const jd = charts.reduce((s, c) => s + c.jd, 0) / charts.length;
    const at = geoCenter(charts);
    let cusps = null, fallback = '';
    if (charts.every(c => c.timeKnown)) {
      const mc = circMean(charts.map(c => c.pts.mc.lon));
      const eps = this.obliquity(jd);
      const armc = norm360(Math.atan2(Math.sin(mc * RAD) * Math.cos(eps * RAD), Math.cos(mc * RAD)) / RAD);
      const h = this.housesFromArmc(armc, at.lat, eps, hsys);
      cusps = h.cusps; fallback = h.fallback;
      pts.asc = { lon: h.asc, speed: null }; pts.mc = { lon: h.mc, speed: null };
    }
    return { jd, lat: at.lat, lon: at.lon, timeKnown: !!cusps, pts, cusps, fallback, missing: [], derived: 'composite' };
  }

  // Davison: a real chart for the moment halfway between the births, at the place halfway between them.
  davison(charts, hsys) {
    const jd = charts.reduce((s, c) => s + c.jd, 0) / charts.length;
    const at = geoCenter(charts);
    return { ...this.cast({ jd, lat: at.lat, lon: at.lon, timeKnown: charts.every(c => c.timeKnown), hsys }), derived: 'davison' };
  }
}

// Which house a longitude falls in, given the twelve cusps.
export function houseOf(lon, cusps) {
  if (!cusps) return null;
  for (let i = 0; i < 12; i++) {
    const a = cusps[i], b = cusps[(i + 1) % 12];
    const span = norm360(b - a), off = norm360(lon - a);
    if (off < span || (span === 0 && off === 0)) return i + 1;
  }
  return null;
}

// Aspects between two charts (or within one, when A and B are the same chart).
export function aspectsBetween(A, B, same) {
  const keysA = POINTS.filter(p => A.pts[p.key] && p.key !== 'snode');
  const keysB = POINTS.filter(p => B.pts[p.key] && p.key !== 'snode');
  const out = [];
  keysA.forEach((pa, i) => keysB.forEach((pb, j) => {
    if (same && j <= i) return;
    if (same && pa.cls === 'angle' && pb.cls === 'angle') return;
    const d = Math.abs(norm180(A.pts[pa.key].lon - B.pts[pb.key].lon));
    for (const asp of ASPECTS) {
      const orb = Math.abs(d - asp.angle), max = orbFor(pa, pb, asp);
      if (orb <= max) { out.push({ a: pa, b: pb, aspect: asp, orb, max }); break; }
    }
  }));
  return out.sort((x, y) => x.orb - y.orb);
}
