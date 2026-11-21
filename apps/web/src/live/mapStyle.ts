import type {StyleSpecification, LayerSpecification} from 'maplibre-gl';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const BUILDING_LAYER = 'margai-buildings-3d';
export type StyleResult = {style: StyleSpecification | string; fallback: boolean; vectorSource?: string};

/** Plain dark raster fallback (inverted with CSS filter via .lm-fallback). */
export const RASTER_FALLBACK: StyleSpecification = {
  version: 8,
  sources: {osm: {type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors'}},
  layers: [{id: 'bg', type: 'background', paint: {'background-color': '#0b0d12'}}, {id: 'osm', type: 'raster', source: 'osm'}],
};

const ROAD = {
  motorway: '#8ab4ff', trunk: '#7fb0ff', primary: '#6c8fe0', secondary: '#5a72b0', tertiary: '#4b5d8e', minor: '#3a4767', path: '#2a3350', rail: '#1e2438',
};
function roadColor(id: string): string {
  if (/rail|transit|ferry/.test(id)) return ROAD.rail;
  if (/motorway|highway/.test(id)) return ROAD.motorway;
  if (/trunk/.test(id)) return ROAD.trunk;
  if (/primary/.test(id)) return ROAD.primary;
  if (/secondary/.test(id)) return ROAD.secondary;
  if (/tertiary/.test(id)) return ROAD.tertiary;
  if (/path|pedestrian|footway|track|cycle/.test(id)) return ROAD.path;
  return ROAD.minor;
}

/** Fetches OpenFreeMap "liberty" and recolors every layer into a graphite palette with luminous roads. */
export async function loadDarkStyle(): Promise<StyleResult> {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 7000);
    // DEV-only escape hatch for sandboxes that cannot reach the tile host directly (?lmproxy=http://localhost:5399).
    const proxy = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('lmproxy') : null;
    const res = await fetch(proxy ? proxy + '/styles/liberty' : STYLE_URL, {signal: ctl.signal});
    clearTimeout(to);
    if (!res.ok) throw new Error('style ' + res.status);
    const style = (await res.json()) as StyleSpecification;
    const vectorSource = Object.keys(style.sources).find(k => (style.sources[k] as any).type === 'vector');
    const layers: LayerSpecification[] = [];
    for (const raw of style.layers) {
      const l: any = {...raw, paint: {...(raw as any).paint}, layout: {...(raw as any).layout}};
      const id: string = l.id; const sl: string = l['source-layer'] || '';
      if (l.type === 'fill-extrusion' || /^building/.test(id) || sl === 'building') continue; // replaced by our own 3D layer
      if (l.type === 'background') l.paint['background-color'] = '#0b0d12';
      else if (l.type === 'fill') {
        l.paint['fill-color'] = sl === 'water' || /water/.test(id) ? '#060f1c' : /park|wood|forest|grass|green|landcover|national/.test(id + sl) ? '#0e1a17' : /aeroway|airport/.test(id) ? '#141824' : '#11141b';
        delete l.paint['fill-pattern']; delete l.paint['fill-outline-color'];
      } else if (l.type === 'line') {
        if (sl === 'transportation' || /road|bridge|tunnel|rail|aeroway/.test(id)) {
          l.paint['line-color'] = /casing/.test(id) ? '#05060a' : roadColor(id);
          delete l.paint['line-pattern'];
        } else if (/water|river|stream/.test(id + sl)) l.paint['line-color'] = '#0a2038';
        else l.paint['line-color'] = '#262c3c';
      } else if (l.type === 'symbol') {
        if (/poi|icon|shield|oneway/.test(id) || sl === 'poi') l.layout.visibility = 'none';
        l.paint['text-color'] = /water/.test(id) ? '#4f78a8' : '#8e99b4';
        l.paint['text-halo-color'] = '#05060a'; l.paint['text-halo-width'] = 1.6;
      } else if (l.type === 'raster' || l.type === 'hillshade') l.layout.visibility = 'none';
      layers.push(l);
    }
    // luminous glow under main roads
    if (vectorSource) {
      const idx = layers.findIndex(l => (l as any).type === 'line' && /motorway|trunk|primary/.test(l.id) && !/casing/.test(l.id));
      const glow: any = {id: 'margai-road-glow', type: 'line', source: vectorSource, 'source-layer': 'transportation', minzoom: 10,
        filter: ['all', ['in', 'class', 'motorway', 'trunk', 'primary'], ['!=', 'brunnel', 'tunnel']],
        layout: {'line-cap': 'round', 'line-join': 'round'},
        paint: {'line-color': '#5b8dff', 'line-opacity': 0.28, 'line-blur': 6, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 2, 16, 18]}};
      layers.splice(idx >= 0 ? idx : layers.length, 0, glow);
      layers.push({
        id: BUILDING_LAYER, type: 'fill-extrusion', source: vectorSource, 'source-layer': 'building', minzoom: 14,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#151922', 40, '#20263a', 120, '#2d3650'],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.9, 'fill-extrusion-vertical-gradient': true,
        },
      } as any);
    }
    return {style: {...style, layers}, fallback: false, vectorSource};
  } catch {
    return {style: RASTER_FALLBACK, fallback: true};
  }
}
