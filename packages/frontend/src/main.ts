import { mount } from 'svelte';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import './app.css';
import App from './App.svelte';

// Leaflet's default marker icons reference relative asset paths that break under
// a bundler; point them at the Vite-resolved URLs.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const target = document.getElementById('app');
if (!target) throw new Error('#app mount target not found');

const app = mount(App, { target });

export default app;
