import L from 'leaflet';

const TOPO_URL = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const TOPO_ATTR =
  'Kartendaten: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, SRTM | ' +
  'Kartendarstellung: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)';
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '© OpenStreetMap-Mitwirkende';

/** Tile errors after which the track map gives up on OpenTopoMap (no SLA). */
const MAX_TOPO_ERRORS = 3;

/**
 * Topographic tiles for track maps, falling back to the standard OSM tiles
 * after repeated tile errors (OpenTopoMap is a volunteer service).
 */
export function addTrackTiles(map: L.Map): void {
  const topo = L.tileLayer(TOPO_URL, { subdomains: 'abc', maxZoom: 17, attribution: TOPO_ATTR });
  let errors = 0;
  let switched = false;
  topo.on('tileerror', () => {
    if (switched || ++errors < MAX_TOPO_ERRORS) return;
    switched = true;
    map.removeLayer(topo);
    L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_ATTR }).addTo(map);
  });
  topo.addTo(map);
}
