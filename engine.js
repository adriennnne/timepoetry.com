// timepoetry sky engine
// Positions, ingresses, stations, aspects, lunar phases and void-of-course Moon,
// all computed from the Swiss Ephemeris (compiled to WebAssembly).
// License: AGPL-3.0-or-later, the same terms as the Swiss Ephemeris itself.

export const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
export const SIGN_GLYPHS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'].map(g => g + '︎');

// id = Swiss Ephemeris body number. 11 = true node, 15 = Chiron.
export const BODIES = [
  { key: 'sun',     id: 0,  name: 'Sun',        glyph: '☉', cls: 'lum',  step: 0.5,  stations: false },
  { key: 'moon',    id: 1,  name: 'Moon',       glyph: '☽', cls: 'lum',  step: 0.1,  stations: false },
  { key: 'mercury', id: 2,  name: 'Mercury',    glyph: '☿', cls: 'pl',   step: 0.25, stations: true  },
  { key: 'venus',   id: 3,  name: 'Venus',      glyph: '♀', cls: 'pl',   step: 0.5,  stations: true  },
  { key: 'mars',    id: 4,  name: 'Mars',       glyph: '♂', cls: 'pl',   step: 0.5,  stations: true  },
  { key: 'jupiter', id: 5,  name: 'Jupiter',    glyph: '♃', cls: 'pl',   step: 1,    stations: true  },
  { key: 'saturn',  id: 6,  name: 'Saturn',     glyph: '♄', cls: 'pl',   step: 1,    stations: true  },
  { key: 'uranus',  id: 7,  name: 'Uranus',     glyph: '♅', cls: 'pl',   step: 1,    stations: true  },
  { key: 'neptune', id: 8,  name: 'Neptune',    glyph: '♆', cls: 'pl',   step: 1,    stations: true  },
  { key: 'pluto',   id: 9,  name: 'Pluto',      glyph: '♇', cls: 'pl',   step: 1,    stations: true  },
  { key: 'chiron',  id: 15, name: 'Chiron',     glyph: '⚷', cls: 'pt',   step: 1,    stations: true  },
  { key: 'node',    id: 11, name: 'North Node', glyph: '☊', cls: 'pt',   step: 1,    stations: false },
];
export const SOUTH_NODE = { key: 'snode', name: 'South Node', glyph: '☋', cls: 'pt' };

export const ASPECTS = [
  { angle: 0,   name: 'conjunction', verb: 'conjunct', glyph: '☌' },
  { angle: 60,  name: 'sextile',     verb: 'sextile',  glyph: '⚹' },
  { angle: 90,  name: 'square',      verb: 'square',   glyph: '□' },
  { angle: 120, name: 'trine',       verb: 'trine',    glyph: '△' },
  { angle: 180, name: 'opposition',  verb: 'opposite', glyph: '☍' },
];

// Orbs in degrees: Chiron and the nodes 3, anything with Sun or Moon 8, planet to planet 6.
export function orbFor(a, b) {
  if (a.cls === 'pt' || b.cls === 'pt') return 3;
  if (a.cls === 'lum' || b.cls === 'lum') return 8;
  return 6;
}

const SEFLG_SWIEPH = 2, SEFLG_SPEED = 256;
const DAY_MS = 86400000;
export const jdFromDate = d => d.getTime() / DAY_MS + 2440587.5;
export const dateFromJd = jd => new Date((jd - 2440587.5) * DAY_MS);
export const norm360 = x => ((x % 360) + 360) % 360;
export const norm180 = x => { x = norm360(x); return x > 180 ? x - 360 : x; };
const signOf = lon => Math.floor(norm360(lon) / 30) % 12;

export class Sky {
  // M: the Emscripten module. files: { 'sepl_18.se1': Uint8Array, ... }
  constructor(M, files) {
    this.M = M;
    try { M.FS.mkdir('/ephe'); } catch (e) { /* already there */ }
    for (const [name, bytes] of Object.entries(files)) M.FS.writeFile('/ephe/' + name, bytes);
    M.ccall('swe_set_ephe_path', null, ['string'], ['/ephe']);
    this.xx = M._malloc(8 * 6);
    this.err = M._malloc(256);
    this.cache = new Map();
    this.usedSwissFiles = true;
  }

  version() { return this.M.ccall('swe_version', 'string', ['number'], [this.err]); }

  // Geocentric tropical longitude and daily speed.
  calc(jd, id) {
    const M = this.M;
    const rf = M._swe_calc_ut(jd, id, SEFLG_SWIEPH | SEFLG_SPEED, this.xx, this.err);
    if (rf < 0) throw new Error('Swiss Ephemeris: ' + M.UTF8ToString(this.err));
    if (!(rf & SEFLG_SWIEPH)) this.usedSwissFiles = false;
    return { lon: M.getValue(this.xx, 'double'), speed: M.getValue(this.xx + 24, 'double') };
  }
  lon(jd, id) { return this.calc(jd, id).lon; }

  bisect(f, lo, hi, flo) {
    // f changes sign between lo and hi.
    for (let i = 0; i < 60 && hi - lo > 1e-7; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  positions(jd) {
    const out = BODIES.map(b => {
      const { lon, speed } = this.calc(jd, b.id);
      return { ...b, lon, speed, retro: speed < 0, sign: signOf(lon), deg: lon % 30 };
    });
    const n = out.find(p => p.key === 'node');
    const slon = norm360(n.lon + 180);
    out.push({ ...SOUTH_NODE, lon: slon, speed: n.speed, retro: n.speed < 0, sign: signOf(slon), deg: slon % 30 });
    return out;
  }

  // Next (dir=+1) or previous (dir=-1) change of sign.
  ingress(b, jd, dir = 1, horizonDays = 9500) {
    const s0 = signOf(this.lon(jd, b.id));
    let t0 = jd;
    for (let k = 0; k * b.step < horizonDays; k++) {
      const t1 = t0 + dir * b.step;
      if (signOf(this.lon(t1, b.id)) !== s0) {
        const f = t => (signOf(this.lon(t, b.id)) === s0 ? -1 : 1);
        const t = this.bisect(f, t0, t1, -1);
        const eps = 2e-7 * dir;
        const from = signOf(this.lon(t - eps, b.id)), to = signOf(this.lon(t + eps, b.id));
        return { jd: t, sign: dir > 0 ? to : from, from: dir > 0 ? from : to };
      }
      t0 = t1;
    }
    return null;
  }

  // Next station: the moment the daily speed passes through zero.
  station(b, jd, horizonDays = 900) {
    if (!b.stations) return null;
    const step = Math.min(b.step, 0.5);
    let t0 = jd, v0 = this.calc(t0, b.id).speed;
    for (let k = 0; k * step < horizonDays; k++) {
      const t1 = t0 + step, v1 = this.calc(t1, b.id).speed;
      if ((v0 > 0) !== (v1 > 0)) {
        const t = this.bisect(x => this.calc(x, b.id).speed, t0, t1, v0);
        const lon = this.lon(t, b.id);
        return { jd: t, kind: v1 < 0 ? 'R' : 'D', lon, sign: signOf(lon), deg: lon % 30 };
      }
      t0 = t1; v0 = v1;
    }
    return null;
  }

  // Cached "next event" lookups, refreshed only once the event has passed.
  nextEvents(jd) {
    const out = {};
    for (const b of BODIES) {
      let c = this.cache.get('ev:' + b.key);
      if (!c || (c.ingress && c.ingress.jd <= jd) || (c.station && c.station.jd <= jd) || c.at > jd) {
        c = { at: jd, ingress: this.ingress(b, jd), station: this.station(b, jd) };
        this.cache.set('ev:' + b.key, c);
      }
      out[b.key] = c;
    }
    return out;
  }

  // Moment an aspect is exact, searching forward (applying) or backward (separating).
  exactTime(a, b, target, jd, dir, orb) {
    const g = t => norm180(this.lon(t, a.id) - this.lon(t, b.id) - target);
    const moon = a.key === 'moon' || b.key === 'moon';
    const step = moon ? 0.04 : 1, maxSteps = moon ? 80 : 1100;
    let t0 = jd, g0 = g(t0);
    if (g0 === 0) return jd;
    for (let k = 0; k < maxSteps; k++) {
      const t1 = t0 + dir * step, g1 = g(t1);
      if ((g0 > 0) !== (g1 > 0) && Math.abs(g1 - g0) < 90) {
        return dir > 0 ? this.bisect(g, t0, t1, g0) : this.bisect(g, t1, t0, g1);
      }
      if (Math.abs(g1) > orb + 1.5) return null;   // left orb without perfecting
      t0 = t1; g0 = g1;
    }
    return null;
  }

  aspects(jd) {
    const P = BODIES.map(b => ({ b, ...this.calc(jd, b.id) }));
    const list = [];
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const A = P[i], B = P[j];
      const d = norm180(A.lon - B.lon), ad = Math.abs(d);
      const maxOrb = orbFor(A.b, B.b);
      for (const asp of ASPECTS) {
        const dev = ad - asp.angle;
        if (Math.abs(dev) > maxOrb) continue;
        const rate = (d >= 0 ? 1 : -1) * (A.speed - B.speed);   // d|sep|/dt
        const applying = dev * rate < 0;
        const target = asp.angle === 180 ? 180 : (d >= 0 ? 1 : -1) * asp.angle;
        const key = `asp:${A.b.key}:${B.b.key}:${asp.angle}:${applying ? 'a' : 's'}`;
        let c = this.cache.get(key);
        if (!c || (applying && c.jd !== null && c.jd <= jd) || c.at > jd) {
          c = { at: jd, jd: this.exactTime(A.b, B.b, target, jd, applying ? 1 : -1, maxOrb) };
          this.cache.set(key, c);
        }
        list.push({ a: A.b, b: B.b, aspect: asp, orb: Math.abs(dev), applying, exact: c.jd });
      }
    }
    list.sort((x, y) => x.orb - y.orb);
    return list;
  }

  // Sun–Moon elongation: 0 new, 90 first quarter, 180 full, 270 last quarter.
  moonPhase(jd) {
    const angle = norm360(this.lon(jd, 1) - this.lon(jd, 0));
    const illum = (1 - Math.cos(angle * Math.PI / 180)) / 2;
    const near = (x, w = 6) => Math.abs(norm180(angle - x)) <= w;
    let name;
    if (near(0)) name = 'New Moon';
    else if (near(90)) name = 'First Quarter';
    else if (near(180)) name = 'Full Moon';
    else if (near(270)) name = 'Last Quarter';
    else if (angle < 90) name = 'Waxing Crescent';
    else if (angle < 180) name = 'Waxing Gibbous';
    else if (angle < 270) name = 'Waning Gibbous';
    else name = 'Waning Crescent';
    let c = this.cache.get('phases');
    if (!c || c.list[0].jd <= jd || c.at > jd) {
      c = { at: jd, list: [[0, 'New Moon'], [90, 'First Quarter'], [180, 'Full Moon'], [270, 'Last Quarter']]
        .map(([target, label]) => {
          const t = this.nextElongation(target, jd);
          const lon = this.lon(t, 1);
          return { jd: t, name: label, target, sign: signOf(lon), deg: lon % 30 };
        }).sort((x, y) => x.jd - y.jd) };
      this.cache.set('phases', c);
    }
    return { angle, illum, name, waxing: angle < 180, next: c.list };
  }
  nextElongation(target, jd) {
    const g = t => norm180(this.lon(t, 1) - this.lon(t, 0) - target);
    let t0 = jd, g0 = g(t0);
    for (let k = 0; k < 400; k++) {
      const t1 = t0 + 0.1, g1 = g(t1);
      if (g0 < 0 && g1 >= 0 && g1 - g0 < 90) return this.bisect(g, t0, t1, g0);
      t0 = t1; g0 = g1;
    }
    return null;
  }

  // Void of course: from the Moon's last exact conjunction, sextile, square, trine or
  // opposition to Sun through Pluto in its current sign, until it enters the next sign.
  voidOfCourse(jd) {
    let c = this.cache.get('voc');
    if (!c || c.end <= jd || c.signStart > jd) {
      const moon = BODIES[1];
      const prev = this.ingress(moon, jd, -1), next = this.ingress(moon, jd, 1);
      const t0 = prev.jd, t1 = next.jd;
      const targets = [0, 60, 90, 120, 180, 240, 270, 300];
      const hits = [];
      const n = Math.ceil((t1 - t0) / 0.02), dt = (t1 - t0) / n;
      for (const b of BODIES) {
        if (b.id === 1 || b.id > 9) continue;
        const D = t => norm360(this.lon(t, 1) - this.lon(t, b.id));
        let ta = t0, da = D(ta);
        for (let k = 1; k <= n; k++) {
          const tb = t0 + k * dt, db = D(tb);
          for (const T of targets) {
            const ga = norm180(da - T), gb = norm180(db - T);
            if ((ga > 0) !== (gb > 0) && Math.abs(ga) < 90 && Math.abs(gb) < 90) {
              const t = this.bisect(x => norm180(D(x) - T), ta, tb, ga);
              const angle = T > 180 ? 360 - T : T;
              hits.push({ jd: t, body: b, aspect: ASPECTS.find(a => a.angle === angle) });
            }
          }
          ta = tb; da = db;
        }
      }
      hits.sort((x, y) => x.jd - y.jd);
      const last = hits.length ? hits[hits.length - 1] : null;
      c = { signStart: t0, start: last ? last.jd : t0, end: t1, last, enters: next.sign, from: next.from, hits };
      this.cache.set('voc', c);
    }
    return { ...c, active: jd >= c.start };
  }
}
