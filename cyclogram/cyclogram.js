// timepoetry transit cyclogram: sampled planet tracks and stations for a date range.
// Positions come straight from the Swiss Ephemeris (swe_calc_ut, compiled to WebAssembly);
// the only logic added here is sampling a track and locating stations by bisection.
// License: AGPL-3.0-or-later, the same terms as the Swiss Ephemeris itself.

const FLAGS = 2 | 256; // SEFLG_SWIEPH | SEFLG_SPEED

// id = Swiss Ephemeris body number. 11 = true node, 15 = Chiron.
// maxStep (days) keeps every body under about two degrees between samples.
export const BODIES = [
  { id: 0,  key: 'sun',     name: 'Sun',        glyph: '☉',       maxStep: 1,    stations: false },
  { id: 1,  key: 'moon',    name: 'Moon',       glyph: '☽',       maxStep: 0.15, stations: false },
  { id: 2,  key: 'mercury', name: 'Mercury',    glyph: '☿',       maxStep: 0.5,  stations: true },
  { id: 3,  key: 'venus',   name: 'Venus',      glyph: '♀︎', maxStep: 1,    stations: true },
  { id: 4,  key: 'mars',    name: 'Mars',       glyph: '♂︎', maxStep: 1,    stations: true },
  { id: 5,  key: 'jupiter', name: 'Jupiter',    glyph: '♃',       maxStep: 2,    stations: true },
  { id: 6,  key: 'saturn',  name: 'Saturn',     glyph: '♄',       maxStep: 2,    stations: true },
  { id: 7,  key: 'uranus',  name: 'Uranus',     glyph: '♅',       maxStep: 2,    stations: true },
  { id: 8,  key: 'neptune', name: 'Neptune',    glyph: '♆',       maxStep: 2,    stations: true },
  { id: 9,  key: 'pluto',   name: 'Pluto',      glyph: '♇',       maxStep: 2,    stations: true },
  { id: 15, key: 'chiron',  name: 'Chiron',     glyph: '⚷',       maxStep: 2,    stations: true },
  { id: 11, key: 'node',    name: 'North Node', glyph: '☊',       maxStep: 1,    stations: false },
];

export const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
export const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => g + '︎');

export const msToJd = ms => ms / 86400000 + 2440587.5;
export const jdToMs = jd => (jd - 2440587.5) * 86400000;

// A longitude as its sign index and degrees and minutes within the sign (minutes truncated).
export function place(lon) {
  lon = ((lon % 360) + 360) % 360;
  const total = Math.floor(lon * 60 + 1e-7) % 21600;   // whole arcminutes round the zodiac
  return { sign: Math.floor(total / 1800), text: `${Math.floor((total % 1800) / 60)}°${String(total % 60).padStart(2, '0')}′` };
}

const CHUNK = 4096;

export class Tracks {
  // M: the Emscripten module of the Swiss Ephemeris build, with its ephemeris path already set.
  constructor(M) {
    this.M = M;
    this.xx = M._malloc(8 * 6);
    this.err = M._malloc(256);
    this.grids = new Map();     // body key -> Map(chunk index -> { lon, spd, has })
    this.stations = new Map();  // bracket -> station
    this.t = [0, 0];
  }

  // One position, written into out as [longitude, daily speed].
  calc(jd, id, out) {
    const M = this.M;
    if (M._swe_calc_ut(jd, id, FLAGS, this.xx, this.err) < 0) throw new Error('Swiss Ephemeris: ' + M.UTF8ToString(this.err));
    out[0] = M.getValue(this.xx, 'double'); out[1] = M.getValue(this.xx + 24, 'double');
  }
  posAt(id, jd) { this.calc(jd, id, this.t); return { lon: this.t[0], speed: this.t[1] }; }

  // Samples live on a fixed grid per body (multiples of maxStep in Julian days)
  // and are kept, so growing or sliding the range only computes the new part.
  gridSample(body, k, out) {
    let g = this.grids.get(body.key);
    if (!g) { g = new Map(); this.grids.set(body.key, g); }
    const ci = Math.floor(k / CHUNK), o = k - ci * CHUNK;
    let c = g.get(ci);
    if (!c) { c = { lon: new Float64Array(CHUNK), spd: new Float64Array(CHUNK), has: new Uint8Array(CHUNK) }; g.set(ci, c); }
    if (!c.has[o]) {
      this.calc(k * body.maxStep, body.id, this.t);
      c.lon[o] = this.t[0]; c.spd[o] = this.t[1]; c.has[o] = 1;
    }
    out[0] = c.lon[o]; out[1] = c.spd[o];
  }

  // One body across [jd0, jd1]: both ends exactly, grid points between.
  track(body, jd0, jd1) {
    const step = body.maxStep, t = this.t, tmp = [0, 0];
    const k0 = Math.floor(jd0 / step) + 1, k1 = Math.ceil(jd1 / step) - 1;
    const inner = Math.max(0, k1 - k0 + 1), n = inner + 2;
    const jd = new Float64Array(n), lon = new Float64Array(n), spd = new Float64Array(n);
    this.calc(jd0, body.id, t);
    jd[0] = jd0; lon[0] = t[0]; spd[0] = t[1];
    for (let i = 0; i < inner; i++) {
      this.gridSample(body, k0 + i, tmp);
      jd[i + 1] = (k0 + i) * step; lon[i + 1] = tmp[0]; spd[i + 1] = tmp[1];
    }
    this.calc(jd1, body.id, t);
    jd[n - 1] = jd1; lon[n - 1] = t[0]; spd[n - 1] = t[1];
    return { jd, lon, spd, n };
  }

  // Stations: where the daily speed changes sign. Bracket from the sampled
  // track, then bisect on speed to well under a second.
  stationsIn(body, track) {
    const out = [], t = this.t;
    for (let i = 0; i < track.n - 1; i++) {
      const a = track.spd[i], b = track.spd[i + 1];
      if (a === 0 || (a > 0) === (b > 0)) continue;
      const key = body.key + ':' + track.jd[i] + ':' + track.jd[i + 1];
      let st = this.stations.get(key);
      if (!st) {
        let lo = track.jd[i], hi = track.jd[i + 1], sLo = a;
        for (let k = 0; k < 50; k++) {
          const mid = (lo + hi) / 2;
          this.calc(mid, body.id, t);
          if ((t[1] > 0) === (sLo > 0)) { lo = mid; sLo = t[1]; } else { hi = mid; }
        }
        const jd = (lo + hi) / 2;
        this.calc(jd, body.id, t);
        st = { jd, lon: t[0], type: a > 0 ? 'R' : 'D', key: body.key };   // prograde before the station means it turns retrograde
        if (this.stations.size > 20000) this.stations.clear();
        this.stations.set(key, st);
      }
      out.push(st);
    }
    return out;
  }
}
