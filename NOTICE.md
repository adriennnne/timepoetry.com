# timepoetry.com

This site computes its positions in the browser with the Swiss Ephemeris.

- Swiss Ephemeris 2.10.03, © Astrodienst AG (Dieter Koch and Alois Treindl), used under the GNU Affero General Public License. https://www.astro.com/swisseph/
- `vendor/swisseph.mjs` and `vendor/swisseph.wasm` are the unmodified WebAssembly build from @kuntay/swisseph 0.2.2 (AGPL-3.0-or-later). https://github.com/kuntayerkus/swisseph-wasm
- `ephe/*.se1` are Astrodienst's ephemeris data files for 1800–2399 CE.
- `index.html`, `engine.js`, `theme.js` and everything in `cyclogram/`, `ephemeris/` and `chart/` (apart from its place files) are this site's own code, licensed AGPL-3.0-or-later.
- Fonts: EB Garamond and Noto Sans Symbols, SIL Open Font License 1.1.
- `chart/places-5000.json` and `chart/places-1000.json` are built from GeoNames (https://www.geonames.org/), licensed CC BY 4.0: names, coordinates and time zones of places of 1,000 or more people, with region names joined from the GeoNames extract in reverse_geocoder.
