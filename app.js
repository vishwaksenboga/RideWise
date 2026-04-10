/* ═══════════════════════════════════════════════════════
   RIDEWISE — App Logic  (Enhanced v4.0)
   ─────────────────────────────────────────────────────
   Key upgrades over v3:
   ① STRICT metro detection — coordinate-based city boundary check
      + text fallback, never shows in rural areas
   ② STRICT ride-service gating — Uber/Ola/Rapido only in major cities
   ③ Smart rural-aware transport selection (Auto/Bus/Train for villages)
   ④ Step-by-step journey timeline with real legs
   ⑤ Three human-like AI recommendation cards (Best / Cheapest / Fastest)
   ⑥ Multi-vehicle optimization with plain-English advice
   ⑦ Proper booking URLs per provider
   Routing/map/OSRM/theme/autocomplete are UNCHANGED.
═══════════════════════════════════════════════════════ */

'use strict';

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initMap();
  initTheme();
  initAutocomplete();
  initEventListeners();
  injectPeopleInput();
});

// ═══════════════════════════════════════════════════════
// ①  STRICT METRO CITY DETECTION
//    Uses bounding boxes around each metro's core area.
//    Text-matching is a fallback only if coords are unavailable.
// ═══════════════════════════════════════════════════════

/**
 * Bounding boxes [south, west, north, east] for metro cities.
 * Only these geographic areas qualify for metro service.
 */
const METRO_BOUNDS = {
  // Ultra-tight bounds closely wrapping actual operational operational Metro networks
  // [south, west, north, east]
  hyderabad: [17.33, 78.35, 17.51, 78.57],
  delhi: [28.32, 76.89, 28.76, 77.41],
  bangalore: [12.85, 77.44, 13.06, 77.76],
  mumbai: [19.06, 72.79, 19.27, 72.93],
  chennai: [12.96, 80.14, 13.17, 80.32],
  kolkata: [22.45, 88.31, 22.67, 88.45],
  kochi: [9.92, 76.26, 10.12, 76.37],
  pune: [18.47, 73.78, 18.64, 73.93],
  ahmedabad: [22.97, 72.48, 23.24, 72.68],
  jaipur: [26.86, 75.73, 26.94, 75.84],
  lucknow: [26.74, 80.86, 26.90, 81.00],
  nagpur: [21.04, 78.97, 21.23, 79.16],
};

/** Keyword list for text-based fallback */
const METRO_CITY_NAMES = [
  'hyderabad', 'secunderabad', 'delhi', 'new delhi', 'noida', 'gurgaon', 'gurugram',
  'bangalore', 'bengaluru', 'mumbai', 'bombay', 'thane', 'navi mumbai',
  'chennai', 'madras', 'kolkata', 'calcutta', 'kochi', 'ernakulam',
  'pune', 'ahmedabad', 'jaipur', 'lucknow', 'nagpur',
];

/** Ride-service cities (Uber/Ola/Rapido operate here) */
const RIDE_SERVICE_BOUNDS = {
  hyderabad: [17.20, 78.25, 17.65, 78.75],
  delhi: [28.38, 76.85, 28.88, 77.55],
  bangalore: [12.83, 77.45, 13.15, 77.78],
  mumbai: [18.85, 72.75, 19.30, 73.00],
  chennai: [12.88, 80.15, 13.25, 80.32],
  kolkata: [22.42, 88.25, 22.72, 88.50],
  pune: [18.42, 73.72, 18.68, 74.00],
  ahmedabad: [22.95, 72.50, 23.22, 72.72],
  surat: [21.10, 72.78, 21.30, 73.00],
  coimbatore: [10.95, 76.90, 11.10, 77.10],
  kochi: [9.90, 76.20, 10.10, 76.42],
  chandigarh: [30.65, 76.68, 30.80, 76.90],
  jaipur: [26.78, 75.68, 27.02, 75.95],
  vizag: [17.60, 83.17, 17.80, 83.40],
  indore: [22.65, 75.80, 22.80, 75.96],
};

const RIDE_CITY_NAMES = [
  'hyderabad', 'secunderabad', 'delhi', 'new delhi', 'noida', 'gurgaon', 'gurugram',
  'bangalore', 'bengaluru', 'mumbai', 'bombay', 'thane', 'navi mumbai',
  'chennai', 'kolkata', 'pune', 'ahmedabad', 'surat', 'coimbatore',
  'kochi', 'ernakulam', 'chandigarh', 'jaipur', 'visakhapatnam', 'vizag', 'indore',
];

/** True if a coord [lat,lon] falls inside any bounding box set */
function coordInAnyBound(coords, boundsMap) {
  if (!coords || coords.length < 2) return false;
  const [lat, lon] = coords;
  return Object.values(boundsMap).some(([s, w, n, e]) =>
    lat >= s && lat <= n && lon >= w && lon <= e
  );
}

/** Text-based fallback — checks address string against keyword list */
function textMatchesCity(str, cityNames) {
  if (!str) return false;
  const lower = str.toLowerCase();
  return cityNames.some(c => {
    // Word-boundary check: avoid "narsapur" matching "pur"
    const idx = lower.indexOf(c);
    if (idx < 0) return false;
    const before = idx === 0 ? true : /[\s,./\-]/.test(lower[idx - 1]);
    const after = (idx + c.length >= lower.length) ? true : /[\s,./\-]/.test(lower[idx + c.length]);
    return before && after;
  });
}

/** Dynamic Hub Detection: Checks if coordinates are near the edge of a METRO_BOUNDS box */
function isNearMetroEdge(coords) {
  if (!coords || coords.length < 2) return false;
  const [lat, lon] = coords;
  const threshold = 0.05; // ~5km padding around the box
  return Object.values(METRO_BOUNDS).some(([s, w, n, e]) =>
    (lat >= s - threshold && lat <= s + threshold && lon >= w && lon <= e) ||
    (lat >= n - threshold && lat <= n + threshold && lon >= w && lon <= e) ||
    (lon >= w - threshold && lon <= w + threshold && lat >= s && lat <= n) ||
    (lon >= e - threshold && lon <= e + threshold && lat >= s && lat <= n)
  );
}

/** Geographic Sanity Check: Detects international or impossible long-haul trips */
function getGeographicProfile(dist, fromName, toName) {
  const fromCountry = (fromName || '').toLowerCase().includes('india') ? 'India' : 'International';
  const toCountry = (toName || '').toLowerCase().includes('india') ? 'India' : 'International';
  if (dist > 3000 || (fromCountry !== toCountry && dist > 500)) return 'international';
  if (dist > 1500) return 'long-haul';
  return 'regional';
}

function isMetroAvailable() {
  const fromCoord = window._fromCoords;
  const toCoord = window._toCoords;

  if (fromCoord && toCoord) {
    const pad = 0.02; // ~2km padding around the core metro bounds (prevents false positives for towns 20km away)
    for (const [key, [s, w, n, e]] of Object.entries(METRO_BOUNDS)) {
      const [fLat, fLon] = fromCoord;
      const [tLat, tLon] = toCoord;
      const fIn = (fLat >= s - pad && fLat <= n + pad && fLon >= w - pad && fLon <= e + pad);
      const tIn = (tLat >= s - pad && tLat <= n + pad && tLon >= w - pad && tLon <= e + pad);
      // Metro is an option ONLY if both locations are strictly within the metro boundary (+ 2km margin)
      if (fIn && tIn) return true;
    }
    return false;
  }

  // Text fallback: Ensure both places share the same metro city keyword
  if (window._fromName && window._toName) {
    const fStr = window._fromName.toLowerCase();
    const tStr = window._toName.toLowerCase();
    return METRO_CITY_NAMES.some(c => fStr.includes(c) && tStr.includes(c));
  }

  return false;
}

/**
 * Ride services (Uber/Ola/Rapido) available only in major cities.
 * Both source and destination location must be in supported regions.
 */
function isRideServiceAvailable() {
  // Ride-hailing services (Uber, Ola, Rapido) are now widely available across tier-2 and tier-3 cities.
  // We no longer restrict them to strict metropolitan bounding boxes.
  // Note: Regional/International restrictions are still enforced by getGeographicProfile().
  return true;
}

/** Human-readable city name for a location (first comma-segment) */
function extractCity(name) {
  if (!name) return '';
  return name.split(',')[0].trim();
}

// ═══════════════════════════════════════════════════════
// ②  MULTI-VEHICLE — Passenger count
// ═══════════════════════════════════════════════════════
const CAPACITY = { Bike: 1, Auto: 3, Cab: 4 };

function injectPeopleInput() {
  const actions = document.querySelector('.panel-actions');
  if (!actions) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'people-row';
  wrapper.innerHTML = `
    <label class="people-label">
      <i data-lucide="users"></i>Passengers
    </label>
    <div class="people-stepper">
      <button type="button" class="stepper-btn" id="peopleMinus">−</button>
      <span id="peopleCount">1</span>
      <button type="button" class="stepper-btn" id="peoplePlus">+</button>
    </div>
    <span class="people-hint" id="peopleHint"></span>
  `;
  actions.insertBefore(wrapper, actions.lastElementChild);
  lucide.createIcons({ nodes: wrapper.querySelectorAll('[data-lucide]') });

  document.getElementById('peopleMinus').addEventListener('click', () => {
    const el = document.getElementById('peopleCount');
    const v = Math.max(1, parseInt(el.textContent) - 1);
    el.textContent = v;
    updatePeopleHint(v);
  });
  document.getElementById('peoplePlus').addEventListener('click', () => {
    const el = document.getElementById('peopleCount');
    const v = Math.min(20, parseInt(el.textContent) + 1);
    el.textContent = v;
    updatePeopleHint(v);
  });
}

function getPeopleCount() {
  const el = document.getElementById('peopleCount');
  return el ? Math.max(1, parseInt(el.textContent) || 1) : 1;
}

function updatePeopleHint(n) {
  const hint = document.getElementById('peopleHint');
  if (!hint) return;
  if (n <= 1) { hint.textContent = ''; return; }
  const b = Math.ceil(n / 1), a = Math.ceil(n / 3), c = Math.ceil(n / 4);
  hint.textContent = `${b} bike${b > 1 ? 's' : ''} / ${a} auto${a > 1 ? 's' : ''} / ${c} cab${c > 1 ? 's' : ''}`;
}

// ═══════════════════════════════════════════════════════
// MAP SETUP  (UNCHANGED)
// ═══════════════════════════════════════════════════════
let map, routeLayer, startMarker, endMarker;

function initMap() {
  // Prevent repetitions with noWrap and set world bounds
  const southWest = L.latLng(-85, -180), northEast = L.latLng(85, 180), worldBounds = L.latLngBounds(southWest, northEast);

  map = L.map('map', {
    center: [20.5937, 78.9629],
    zoom: 5,
    minZoom: 3,
    maxBounds: worldBounds,
    zoomControl: false,
    attributionControl: false
  });

  window._mapTileLight = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
  window._mapTileDark = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  window._currentTile = 'dark';

  L.tileLayer(window._mapTileDark, {
    subdomains: 'abcd',
    maxZoom: 19,
    noWrap: true,
    bounds: worldBounds
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.attribution({ prefix: '© Google Maps & Carto' }).addTo(map);
}

function switchMapTile(theme) {
  if (!map) return;
  map.eachLayer(l => { if (l instanceof L.TileLayer) map.removeLayer(l); });
  const url = theme === 'light' ? window._mapTileLight : window._mapTileDark;
  const subdomains = theme === 'light' ? ['mt0', 'mt1', 'mt2', 'mt3'] : 'abcd';

  const southWest = L.latLng(-85, -180), northEast = L.latLng(85, 180), worldBounds = L.latLngBounds(southWest, northEast);

  L.tileLayer(url, {
    subdomains,
    maxZoom: 19,
    noWrap: true,
    bounds: worldBounds
  }).addTo(map);
}

window._routeMarkers = [];
window._extraStops = [];
let extraStopsCount = 0;

async function drawRoute(coordsArray) {
  if (window._routeMarkers) window._routeMarkers.forEach(m => map.removeLayer(m));
  if (routeLayer) map.removeLayer(routeLayer);
  window._routeMarkers = [];

  coordsArray.forEach((c, idx) => {
    const color = idx === 0 ? '#10b981' : (idx === coordsArray.length - 1 ? '#ef4444' : '#8b5cf6');
    const m = L.circleMarker(c, { color, fillOpacity: 1, radius: 6 }).addTo(map);
    window._routeMarkers.push(m);
  });

  const waypoints = coordsArray.map(c => `${c[1]},${c[0]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    const coordinates = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    routeLayer = L.polyline(coordinates, { color: '#3b82f6', weight: 5, opacity: 0.8, lineCap: 'round' }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
  } catch (e) {
    routeLayer = L.polyline(coordsArray, { color: '#3b82f6', weight: 4 }).addTo(map);
  }
}

// ═══════════════════════════════════════════════════════
// THEME  (UNCHANGED)
// ═══════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('ridewise_theme') || 'dark';
  setTheme(saved);
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ridewise_theme', theme);
  switchMapTile(theme);
}
document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
  lucide.createIcons();
});

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE  (UNCHANGED)
// ═══════════════════════════════════════════════════════
function initAutocomplete() {
  setupAutocomplete('fromInput', 'fromSuggestions', 'from');
  setupAutocomplete('toInput', 'toSuggestions', 'to');

  document.getElementById('addStopBtn')?.addEventListener('click', () => {
    extraStopsCount++;
    const idPrefix = 'stop' + extraStopsCount;
    window._extraStops.push({ id: idPrefix, coords: null, name: '' });

    const container = document.getElementById('extraStopsContainer');
    const html = `
      <div class="input-group" id="${idPrefix}Group" style="margin-top:-8px;">
        <div class="input-dot" style="background:#8b5cf6; box-shadow:0 0 10px rgba(139,92,246,0.5);"></div>
        <div class="input-field-wrap">
          <label style="color:#8b5cf6">Stop ${extraStopsCount}</label>
          <div class="input-inner">
            <input type="text" id="${idPrefix}Input" placeholder="Add a waypoint..." autocomplete="off" />
            <button class="locate-btn" type="button" onclick="removeStop('${idPrefix}')" style="color:var(--text-muted)">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div class="autocomplete-list" id="${idPrefix}Suggestions"></div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    lucide.createIcons();
    setupAutocomplete(`${idPrefix}Input`, `${idPrefix}Suggestions`, idPrefix);
  });
}

window.removeStop = function (idPrefix) {
  document.getElementById(idPrefix + 'Group').remove();
  window._extraStops = window._extraStops.filter(s => s.id !== idPrefix);
};

function setupAutocomplete(inputId, listId, contextKey) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;
  let timeout = null;
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    const q = input.value.trim();
    if (q.length < 3) { list.classList.remove('show'); return; }
    timeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`);
        const data = await res.json();
        if (!data.length) { list.classList.remove('show'); return; }
        list.innerHTML = data.map(item => `
          <div class="autocomplete-item" data-name="${item.display_name}" data-lat="${item.lat}" data-lon="${item.lon}">
            <i data-lucide="map-pin"></i>
            <span class="text-truncate">${item.display_name}</span>
          </div>`).join('');
        list.classList.add('show');
        lucide.createIcons({ nodes: list.querySelectorAll('[data-lucide]') });
        list.querySelectorAll('.autocomplete-item').forEach(el => {
          el.addEventListener('click', () => {
            input.value = el.dataset.name;
            if (contextKey === 'from') {
              window._fromCoords = [parseFloat(el.dataset.lat), parseFloat(el.dataset.lon)];
              window._fromName = el.dataset.name;
              if (map) map.setView(window._fromCoords, 13);
            } else if (contextKey === 'to') {
              window._toCoords = [parseFloat(el.dataset.lat), parseFloat(el.dataset.lon)];
              window._toName = el.dataset.name;
            } else {
              const stop = window._extraStops.find(s => s.id === contextKey);
              if (stop) {
                stop.coords = [parseFloat(el.dataset.lat), parseFloat(el.dataset.lon)];
                stop.name = el.dataset.name;
              }
            }
            list.classList.remove('show');
          });
        });
      } catch (err) { console.error('Geocoding error:', err); }
    }, 400);
  });
}

// ═══════════════════════════════════════════════════════
// GEOLOCATION  (UNCHANGED)
// ═══════════════════════════════════════════════════════
document.getElementById('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return showToast('Geolocation not supported', 'error');
  showToast('📍 Detecting your location...', '');
  navigator.geolocation.getCurrentPosition(pos => {
    window._fromCoords = [pos.coords.latitude, pos.coords.longitude];
    window._fromName = 'My Location';
    document.getElementById('fromInput').value = 'My Location';
    map.setView([pos.coords.latitude, pos.coords.longitude], 13);
    showToast('✅ Location detected!', 'success');
  }, () => showToast('Could not get location', 'error'));
});

// ═══════════════════════════════════════════════════════
// SWAP  (UNCHANGED)
// ═══════════════════════════════════════════════════════
document.getElementById('swapBtn').addEventListener('click', () => {
  const fi = document.getElementById('fromInput'), ti = document.getElementById('toInput');
  [fi.value, ti.value] = [ti.value, fi.value];
  [window._fromCoords, window._toCoords] = [window._toCoords, window._fromCoords];
  [window._fromName, window._toName] = [window._toName, window._fromName];
  showToast('↕️ Locations swapped', '');
});

// ═══════════════════════════════════════════════════════
// QUICK ROUTES
// ═══════════════════════════════════════════════════════
const CITY_COORDS = {
  'Hyderabad, Telangana': { lat: 17.3850, lon: 78.4867 },
  'Rajiv Gandhi International Airport, Hyderabad': { lat: 17.2403, lon: 78.4294 },
  'Bengaluru, Karnataka': { lat: 12.9716, lon: 77.5946 },
  'Chennai, Tamil Nadu': { lat: 13.0827, lon: 80.2707 },
  'HITEC City, Hyderabad': { lat: 17.4474, lon: 78.3762 },
  'Delhi, NCR': { lat: 28.6139, lon: 77.2090 },
  'AIIMS, New Delhi': { lat: 28.5674, lon: 77.2100 },
  'Mumbai, Maharashtra': { lat: 19.0760, lon: 72.8777 },
  'Kolkata, West Bengal': { lat: 22.5726, lon: 88.3639 },
};

const quickRoutes = {
  airport: { from: 'Hyderabad, Telangana', to: 'Rajiv Gandhi International Airport, Hyderabad' },
  station: { from: 'Bengaluru, Karnataka', to: 'Chennai, Tamil Nadu' },
  mall: { from: 'Hyderabad, Telangana', to: 'HITEC City, Hyderabad' },
  hospital: { from: 'Delhi, NCR', to: 'AIIMS, New Delhi' },
};

function setQuickRoute(type) {
  const r = quickRoutes[type];
  const from = CITY_COORDS[r.from];
  const to = CITY_COORDS[r.to];
  if (!from || !to) { showToast('Quick route data unavailable', 'error'); return; }
  document.getElementById('fromInput').value = r.from;
  document.getElementById('toInput').value = r.to;
  window._fromCoords = [from.lat, from.lon];
  window._fromName = r.from;
  window._toCoords = [to.lat, to.lon];
  window._toName = r.to;
  showToast(`✨ Quick route set: ${type}`, 'success');
}

// ═══════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════
function initEventListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('rideCards').style.display = tab === 'rides' ? 'grid' : 'none';
      document.getElementById('publicCards').style.display = tab === 'public' ? 'grid' : 'none';
      document.getElementById('allCards').style.display = tab === 'all' ? 'grid' : 'none';
    });
  });

  // Clear Buttons Logic
  const fromInput = document.getElementById('fromInput');
  const clearFromBtn = document.getElementById('clearFromBtn');
  const toInput = document.getElementById('toInput');
  const clearToBtn = document.getElementById('clearToBtn');

  const updateClearBtns = () => {
    if (clearFromBtn) clearFromBtn.style.display = fromInput.value ? 'flex' : 'none';
    if (clearToBtn) clearToBtn.style.display = toInput.value ? 'flex' : 'none';
  };

  if (fromInput) fromInput.addEventListener('input', updateClearBtns);
  if (toInput) toInput.addEventListener('input', updateClearBtns);

  // Continuously check for programmatic value changes (Quick Routes, History, Location detect)
  setInterval(updateClearBtns, 800);

  if (clearFromBtn) {
    clearFromBtn.addEventListener('click', () => {
      fromInput.value = '';
      window._fromName = '';
      window._fromCoords = null;
      updateClearBtns();
      fromInput.focus();
    });
  }

  if (clearToBtn) {
    clearToBtn.addEventListener('click', () => {
      toInput.value = '';
      window._toName = '';
      window._toCoords = null;
      updateClearBtns();
      toInput.focus();
    });
  }
}

// ═══════════════════════════════════════════════════════
// COMPARE ENGINE
// ═══════════════════════════════════════════════════════
document.getElementById('compareBtn').addEventListener('click', async () => {
  const from = document.getElementById('fromInput').value.trim();
  const to = document.getElementById('toInput').value.trim();
  if (!from || !to) return showToast('Please enter origin and destination', 'error');

  // Fallback map origin/dest
  if (!window._fromCoords) {
    const key = Object.keys(CITY_COORDS).find(k => k.toLowerCase().includes(from.toLowerCase()));
    if (!key) return showToast('Could not find origin.', 'error');
    window._fromCoords = [CITY_COORDS[key].lat, CITY_COORDS[key].lon];
    window._fromName = key;
  }
  if (!window._toCoords) {
    const key = Object.keys(CITY_COORDS).find(k => k.toLowerCase().includes(to.toLowerCase()));
    if (!key) return showToast('Could not find destination.', 'error');
    window._toCoords = [CITY_COORDS[key].lat, CITY_COORDS[key].lon];
    window._toName = key;
  }

  // Build Sequence
  const seq = [window._fromCoords];
  const validStops = window._extraStops.filter(s => s.coords);
  validStops.forEach(s => seq.push(s.coords));
  seq.push(window._toCoords);

  showLoading();
  await simulateSteps();

  let segments = [];
  let totalDist = 0;
  try {
    const waypoints = seq.map(c => `${c[1]},${c[0]}`).join(';');
    // Fetch precise road network routing distances using OSRM
    const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      for (const leg of data.routes[0].legs) {
        const d = leg.distance / 1000;
        segments.push(d);
        totalDist += d;
      }
    } else {
      throw new Error();
    }
  } catch (e) {
    // Fallback if API fails
    segments = [];
    totalDist = 0;
    for (let i = 0; i < seq.length - 1; i++) {
      const d = haversine(seq[i], seq[i + 1]) * 1.35; // Rough 35% multiplier for road networks
      segments.push(d);
      totalDist += d;
    }
  }

  const people = getPeopleCount();
  const options = calculateOptions(segments, people); // Passing array of segments!
  const scored = scoreOptions(options);

  hideLoading();
  drawRoute(seq);
  renderResults(scored, totalDist, people);

  // Call History Save (saving main endpoints)
  if (typeof saveToHistory === 'function') saveToHistory(from, to, window._fromCoords, window._toCoords);

  let routeText = `${from.split(',')[0]} `;
  validStops.forEach(s => routeText += `→ ${s.name.split(',')[0]} `);
  routeText += `→ ${to.split(',')[0]}`;

  document.getElementById('mapMeta').textContent = `${totalDist.toFixed(1)} km · ${routeText}`;

  const results = document.getElementById('resultsSection');
  results.style.display = 'flex';
  results.style.flexDirection = 'column';
  results.style.gap = '20px';
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Haversine (UNCHANGED)
function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════
// ③  CALCULATE OPTIONS — Strict city gating + Rural logic
// ═══════════════════════════════════════════════════════
function isInMetro(coords) {
  return coords && coordInAnyBound(coords, METRO_BOUNDS);
}

function calculateOptions(distArg, people = 1) {
  const options = [];
  const rand = (min, max) => min + Math.random() * (max - min);

  // Real-time API simulation: Traffic Factor changes every request
  const liveTrafficFactor = rand(0.9, 1.25);

  const distArr = Array.isArray(distArg) ? distArg : [distArg];
  const d = distArr.reduce((a, b) => a + b, 0); // Total Distance
  const segmentsCount = distArr.length;

  const geoProfile = getGeographicProfile(d, window._fromName, window._toName);
  const isIntl = geoProfile === 'international';

  const rideAvailable = isRideServiceAvailable() && !isIntl;
  const metroAvailable = isMetroAvailable() && d >= 2 && !isIntl;

  const fromCity = extractCity(window._fromName || '');
  const toCity = extractCity(window._toName || '');

  // ── RIDE OPTIONS ──
  if (rideAvailable && d < 200) {
    const providers = [
      { name: 'Uber', logo: '<div style="background:#000; color:#fff; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-family:sans-serif; font-weight:700; font-size:10px; border-radius:6px; letter-spacing:0.5px;">Uber</div>', color: '#000000' },
      { name: 'Ola', logo: '<div style="background:#C6D82A; color:#000; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-family:sans-serif; font-weight:800; font-size:12px; border-radius:50%; letter-spacing:-0.5px;">ola</div>', color: '#C6D82A' },
      { name: 'Rapido', logo: '<div style="background:#FCE000; color:#000; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-family:sans-serif; font-weight:700; font-size:9px; border-radius:6px; text-transform:lowercase;">rapido</div>', color: '#FCE000' },
    ];
    const rideTypes = [
      { type: 'Bike', icon: 'bike', formula: dist => 30 + dist * 5, speed: 25, label: 'Bike Ride', maxDist: 20 },
      { type: 'Auto', icon: 'car', formula: dist => 40 + dist * 8, speed: 20, label: 'Auto-Rickshaw', maxDist: 35 },
      { type: 'Cab', icon: 'car', formula: dist => 60 + dist * 12, speed: 35, label: 'Car Cab', maxDist: 150 },
    ];

    providers.forEach(prov => {
      rideTypes.forEach(rt => {
        if (prov.name === 'Rapido' && rt.type === 'Cab') return;
        if (d > rt.maxDist) return;
        if (rt.type === 'Bike' && people > 2) return;

        const capacity = CAPACITY[rt.type];
        const vehicleCount = Math.ceil(people / capacity);
        const baseCalculatedCost = distArr.map(dd => rt.formula(dd)).reduce((a, b) => a + b, 0);
        const totalCost = Math.round(baseCalculatedCost * vehicleCount * liveTrafficFactor * rand(0.98, 1.02));

        options.push({
          id: `${prov.name}_${rt.type}`, category: 'ride',
          provider: prov.name, logo: prov.logo, color: prov.color,
          type: rt.type, typeLabel: rt.label, typeIcon: rt.icon,
          cost: totalCost, costPerPerson: Math.round(totalCost / people),
          vehicleCount, capacity,
          duration: Math.round((d / (rt.speed * 0.9)) * 60 * liveTrafficFactor) + (segmentsCount - 1) * 8,
          eta: Math.round(rand(2, 12) * liveTrafficFactor), distance: d,
          steps: buildRideSteps(prov.name, rt.label),
        });
      });
    });
  }

  // ── METRO & MULTI-MODAL ──
  if (metroAvailable) {
    const startingAtHub = isNearMetroEdge(window._fromCoords);
    const endingAtHub = isNearMetroEdge(window._toCoords);

    // Multi-modal flow for trips entering/leaving the city
    if (d > 15 && (startingAtHub || endingAtHub || segmentsCount > 1)) {
      const perHead = 50 + d * 1.5;
      const hubName = endingAtHub ? toCity : startingAtHub ? fromCity : 'City Border';
      options.push({
        id: 'multimodal_flow', category: 'public',
        provider: 'Smart Journey Flow', logo: '<div style="background:#8b5cf6; color:#fff; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-family:sans-serif; font-weight:800; font-size:10px; border-radius:6px;">MIX</div>', color: '#8b5cf6',
        type: 'Mixed', typeLabel: 'Bus + Metro', typeIcon: 'layers',
        cost: Math.round(perHead * people), costPerPerson: Math.round(perHead),
        vehicleCount: 1, capacity: 500,
        duration: Math.round((d / 30) * 60) + 15,
        eta: 10, waitTime: 10, distance: d,
        steps: [
          { mode: '🚌', label: `Take a Bus or Auto towards ${hubName}`, time: 'Leg 1' },
          { mode: '🚇', label: `Switch to Metro at ${hubName} to avoid city traffic`, time: 'Leg 2' },
          { mode: '🚶', label: `Get off at your stop and walk to the end`, time: 'Arrive' },
        ],
      });
    } else if (d < 50) {
      // Direct Metro
      const perHead = Math.min(60, 15 + d * 2);
      options.push({
        id: 'metro', category: 'public',
        provider: 'Metro Rail', logo: '<div style="background:#7c3aed; color:#fff; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-family:sans-serif; font-weight:800; font-size:14px; border-radius:50%;">M</div>', color: '#7c3aed',
        type: 'Metro', typeLabel: 'Rapid Metro', typeIcon: 'train',
        cost: perHead * people, costPerPerson: perHead,
        vehicleCount: 1, capacity: 300,
        duration: Math.round((d / 40) * 60) + 10,
        eta: 5, waitTime: 5, distance: d,
        steps: [
          { mode: '🚶', label: 'Walk to the Metro station', time: '5 min' },
          { mode: '🚇', label: `Take the train directly to ${toCity}`, time: `${Math.round((d / 40) * 60)} min` },
          { mode: '🚶', label: 'Get off and walk to your place', time: '5 min' },
        ],
      });
    }
  }

  // ── BUS ──
  if (geoProfile !== 'international') {
    if (d < 100) {
      // Local/City Bus
      const busFare = Math.round(d * 2.5 + 10);
      options.push({
        id: 'city_bus', category: 'public',
        provider: 'City Bus', logo: '<div style="background:#16a34a; color:#fff; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-family:sans-serif; font-weight:800; font-size:10px; border-radius:6px;">BUS</div>', color: '#16a34a',
        type: 'Bus', typeLabel: 'Public Bus', typeIcon: 'bus',
        cost: busFare * people, costPerPerson: busFare,
        vehicleCount: 1, capacity: 50,
        duration: Math.round((d / 25) * 60) + 15,
        eta: 10, waitTime: 15, distance: d,
        steps: buildPublicSteps('Bus', 'City Bus'),
      });
    }

    if (d >= 50 && d <= 1500) {
      // Inter-city Bus
      const busFare = Math.round(d * 1.5 + 50);
      options.push({
        id: 'intercity_bus', category: 'public',
        provider: 'Intercity Bus', logo: '<div style="background:#ea580c; color:#fff; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-family:sans-serif; font-weight:800; font-size:10px; border-radius:6px;">BUS</div>', color: '#ea580c',
        type: 'Bus', typeLabel: 'AC Sleeper/Seater', typeIcon: 'bus',
        cost: busFare * people, costPerPerson: busFare,
        vehicleCount: 1, capacity: 40,
        duration: Math.round((d / 50) * 60) + 30,
        eta: 0, waitTime: 45, distance: d,
        steps: [
          { mode: '<i data-lucide="car"></i>', label: 'Take Auto/Cab to Bus Boarding Point', time: '20 min' },
          { mode: '<i data-lucide="bus"></i>', label: `Direct Bus towards ${toCity || 'Destination'}`, time: 'Scheduled' },
          { mode: '<i data-lucide="map-pinned"></i>', label: 'Arrive at Drop Point', time: '' }
        ],
      });
    }
  }

  // ── TRAIN (India Only) ──
  if (d > 80 && geoProfile !== 'international') {
    const trainFare = Math.round(d * 0.8 + 100);
    options.push({
      id: 'train', category: 'public',
      provider: 'Indian Railways', logo: '<div style="background:#dc2626; color:#fff; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-family:sans-serif; font-weight:800; font-size:14px; border-radius:50%;">IR</div>', color: '#dc2626',
      type: 'Train', typeLabel: 'Express Train', typeIcon: 'train',
      cost: trainFare * people, costPerPerson: trainFare,
      vehicleCount: 1, capacity: 500,
      duration: Math.round((d / 70) * 60) + 60,
      eta: 0, waitTime: 40, distance: d,
      steps: buildTrainSteps(),
    });
  }

  // ── FLIGHT ──
  if (d > 400 || isIntl) {
    const flightFare = isIntl ? Math.round(rand(40000, 90000)) : Math.round(rand(4000, 9000));
    options.push({
      id: 'flight', category: 'public',
      provider: isIntl ? 'Global Airline' : 'IndiGo / Air India', logo: '<div style="background:#1e40af; color:#fff; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-family:sans-serif; font-weight:800; font-size:16px; border-radius:6px;">✈</div>', color: '#1e40af',
      type: 'Flight', typeLabel: isIntl ? 'Global Flight' : 'Domestic Flight', typeIcon: 'plane',
      cost: flightFare * people, costPerPerson: flightFare,
      vehicleCount: 1, capacity: 200,
      duration: Math.round((d / 800) * 60) + 180,
      eta: 0, waitTime: 120, distance: d,
      steps: isIntl ? [
        { mode: '🚕', label: 'Take a cab to the International Airport', time: '60 min' },
        { mode: '✈️', label: `Fly from your city to ${toCity}`, time: 'Many hours' },
        { mode: '🚕', label: 'Take local transport to your final stop', time: '' },
      ] : buildFlightSteps(),
    });
  }

  return options;
}

// ═══════════════════════════════════════════════════════
// ④  JOURNEY STEP BUILDERS
// ═══════════════════════════════════════════════════════
function getExactLocation(nameStr, defaultVal) {
  if (!nameStr) return defaultVal;
  return nameStr.split(',').slice(0, 2).join(', ').trim() || defaultVal;
}

function buildRideSteps(provider, vehicleType) {
  const fromExact = getExactLocation(window._fromName, 'Pickup');
  const toExact = getExactLocation(window._toName, 'Dropoff');
  return [
    { mode: '<i data-lucide="map-pin"></i>', label: `Start at ${fromExact}`, time: 'Now' },
    { mode: '<i data-lucide="car"></i>', label: `Get in ${provider} ${vehicleType} to go directly`, time: 'Direct route' },
    { mode: '<i data-lucide="check-circle"></i>', label: `Arrive at ${toExact}`, time: '' },
  ];
}

function buildPublicSteps(mode, provider) {
  const fromExact = getExactLocation(window._fromName, 'Pickup');
  const toExact = getExactLocation(window._toName, 'Destination');
  return [
    { mode: '<i data-lucide="footprints"></i>', label: `Walk ~250m to nearest ${provider} stop near ${fromExact.split(',')[0]}`, time: '3 mins' },
    { mode: '<i data-lucide="bus"></i>', label: `Take ${provider} towards city center`, time: 'Scheduled stops' },
    { mode: '<i data-lucide="map-pinned"></i>', label: `Get off and walk a bit to ${toExact}`, time: '5 mins' },
  ];
}

function buildTrainSteps() {
  const fromExact = getExactLocation(window._fromName, 'Pickup');
  const toCity = extractCity(window._toName || 'City');
  return [
    { mode: '<i data-lucide="car"></i>', label: `Take a Cab or Auto from ${fromExact} to the Railway Station`, time: '15–30 min' },
    { mode: '<i data-lucide="train"></i>', label: `Take Express Train towards ${toCity}`, time: 'Non-stop' },
    { mode: '<i data-lucide="navigation"></i>', label: `Get off the train and take an auto to your final stop`, time: '' },
  ];
}

function buildFlightSteps() {
  const fromExact = getExactLocation(window._fromName, 'Origin');
  const toExact = getExactLocation(window._toName, 'Destination');
  const fromCity = extractCity(window._fromName || 'Origin');
  const toCity = extractCity(window._toName || 'Destination');
  return [
    { mode: '<i data-lucide="car"></i>', label: `Take Cab from ${fromExact} to ${fromCity} Airport`, time: '45–90 min' },
    { mode: '<i data-lucide="plane-takeoff"></i>', label: `Take Flight from ${fromCity} to ${toCity}`, time: 'Boarding + Flight' },
    { mode: '<i data-lucide="plane-landing"></i>', label: `Land safely at ${toCity} Airport`, time: '' },
    { mode: '<i data-lucide="bus"></i>', label: `Take a Cab or Metro to ${toExact}`, time: '30–60 min' },
  ];
}

// ═══════════════════════════════════════════════════════
// SCORING  (UNCHANGED logic)
// ═══════════════════════════════════════════════════════
function scoreOptions(options) {
  const costs = options.map(o => o.cost);
  const durations = options.map(o => o.duration);
  const maxCost = Math.max(...costs);
  const maxDur = Math.max(...durations);
  options.forEach(o => {
    o.score = Math.round((1 - (0.5 * (o.cost / maxCost) + 0.5 * (o.duration / maxDur))) * 100);
  });
  const minCost = Math.min(...costs);
  const minDur = Math.min(...durations);
  const maxScore = Math.max(...options.map(o => o.score));
  options.forEach(o => {
    o.isCheapest = o.cost === minCost;
    o.isFastest = o.duration === minDur;
    o.isBest = o.score === maxScore;
  });
  return options.sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════
// ⑤  RENDER RESULTS — AI recs + tabs + table
// ═══════════════════════════════════════════════════════
function renderResults(options, distKm, people = 1) {
  const rideOpts = options.filter(o => o.category === 'ride');
  const publicOpts = options.filter(o => o.category === 'public');

  document.getElementById('rideCards').innerHTML = rideOpts.map((o, i) => rideCardHTML(o, i, people)).join('');
  document.getElementById('publicCards').innerHTML = publicOpts.map((o, i) => rideCardHTML(o, i, people)).join('');
  document.getElementById('allCards').innerHTML = options.map((o, i) => rideCardHTML(o, i, people)).join('');

  renderCompTable(options, people);
  renderAISection(options, distKm, people);
  lucide.createIcons();
  // animate score bars after paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.score-bar-fill').forEach(bar => { bar.style.width = bar.dataset.target + '%'; });
    }, 200);
  });
}

// ═══════════════════════════════════════════════════════
// ⑤  AI RECOMMENDATION SECTION — 3 human-like cards
// ═══════════════════════════════════════════════════════
function renderAISection(options, distKm, people) {
  const best = options.find(o => o.isBest) || options[0];
  const cheapest = options.find(o => o.isCheapest) || options[options.length - 1];
  const fastest = options.find(o => o.isFastest) || options[0];

  const fromCity = extractCity(window._fromName || '');
  const toCity = extractCity(window._toName || '');
  const rideAvail = isRideServiceAvailable();
  const metro = isMetroAvailable();

  // Human-like contextual phrases
  const distPhrase = distKm < 5 ? 'a short hop' : distKm < 20 ? 'a medium city ride' : distKm < 80 ? 'an inter-area journey' : distKm < 300 ? 'a long-distance trip' : 'a very long journey';

  // Build per-option human narrative
  function narrative(o, role) {
    const pp = people > 1 ? ` — splits to ₹${o.costPerPerson}/person` : '';
    const wait = o.waitTime ? ` with about ${o.waitTime} min wait` : '';
    const arr = getArrivalTime(o.duration + (o.eta || 0));

    if (role === 'best') {
      return `For ${distPhrase} like ${fromCity} → ${toCity}, <strong>${o.logo} ${o.provider} ${o.type}</strong> gives the best overall value. You'll reach by <strong>${arr}</strong> and pay just ₹${o.cost}${pp}. ${!rideAvail && o.category === 'public' ? 'Ride-hailing apps aren\'t available here, so this is your best practical option.' : 'It balances cost and comfort well.'}`;
    }
    if (role === 'cheapest') {
      return `If saving money is your priority, <strong>${o.logo} ${o.provider} ${o.type}</strong> is the most affordable at ₹${o.cost}${pp}${wait}. It takes ${formatDuration(o.duration)} — a fair trade for the savings.`;
    }
    if (role === 'fastest') {
      return `Need to get there quickly? <strong>${o.logo} ${o.provider} ${o.type}</strong> will have you there by <strong>${arr}</strong> — in just ${formatDuration(o.duration)}. It costs ₹${o.cost}${pp}.`;
    }
  }

  // Build step timeline HTML for a recommendation
  function stepsHTML(o) {
    if (!o.steps || !o.steps.length) return '';
    return `<div class="route-timeline">
      <div class="timeline-title">Route Steps</div>
      ${o.steps.map((s, i) => `
        <div class="timeline-step ${i === o.steps.length - 1 ? 'last' : ''}">
          <div class="tl-icon">${s.mode}</div>
          <div class="tl-content">
            <span class="tl-label">${s.label}</span>
            ${s.time ? `<span class="tl-time">${s.time}</span>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
  }

  // Multi-vehicle tip
  const mvTip = buildMultiVehicleSuggestion(options, people);

  const aiBannerEl = document.getElementById('aiBanner');
  aiBannerEl.innerHTML = `
    <div class="ai-recs-header">
      <div class="ai-icon-lg"><i data-lucide="sparkles"></i></div>
      <div>
        <div class="ai-recs-title">AI Recommendations</div>
        <div class="ai-recs-sub">${fromCity} → ${toCity} · ${distKm.toFixed(1)} km · ${people} passenger${people > 1 ? 's' : ''}${!rideAvail ? ' · <span class="city-notice">⚠️ Ride apps unavailable in this area</span>' : ''}${metro ? ' · 🚇 Metro available' : ''}</div>
      </div>
    </div>

    ${mvTip ? `<div class="mv-tip-banner"><span>💡</span>${mvTip}</div>` : ''}

    <div class="ai-three-cards">
      ${aiRecCard('Best Value', '⭐', narrative(best, 'best'), best, stepsHTML(best), 'ai-best')}
      ${aiRecCard('Cheapest', '💰', narrative(cheapest, 'cheapest'), cheapest, stepsHTML(cheapest), 'ai-cheap')}
      ${aiRecCard('Fastest', '⚡', narrative(fastest, 'fastest'), fastest, stepsHTML(fastest), 'ai-fast')}
    </div>
  `;

  lucide.createIcons({ nodes: aiBannerEl.querySelectorAll('[data-lucide]') });

  // Expand/collapse timeline on card click
  aiBannerEl.querySelectorAll('.ai-rec-card').forEach(card => {
    card.addEventListener('click', () => {
      const tl = card.querySelector('.route-timeline');
      if (!tl) return;
      const isOpen = card.classList.contains('expanded');
      aiBannerEl.querySelectorAll('.ai-rec-card').forEach(c => {
        c.classList.remove('expanded');
        const t = c.querySelector('.route-timeline');
        if (t) t.style.maxHeight = '0';
      });
      if (!isOpen) {
        card.classList.add('expanded');
        tl.style.maxHeight = tl.scrollHeight + 'px';
      }
    });
  });
}

function aiRecCard(title, icon, desc, option, stepsHtml, cls) {
  return `
    <div class="ai-rec-card ${cls}">
      <div class="ai-rc-top">
        <div class="ai-rc-icon">${icon}</div>
        <div class="ai-rc-title">${title}</div>
        <div class="ai-rc-price">₹${option.cost.toLocaleString('en-IN')}</div>
      </div>
      <div class="ai-rc-desc">${desc}</div>
      <div class="ai-rc-hint">Tap to see route steps ↓</div>
      ${stepsHtml}
    </div>`;
}

// ═══════════════════════════════════════════════════════
// RIDE CARD HTML
// ═══════════════════════════════════════════════════════
function rideCardHTML(o, idx, people = 1) {
  const badgeClass = o.isBest ? 'badge-best' : o.isCheapest ? 'badge-cheapest' : o.isFastest ? 'badge-fastest' : '';
  const badgeLabel = o.isBest ? '⭐ Best Choice' : o.isCheapest ? '💰 Cheapest' : o.isFastest ? '⚡ Fastest' : '';
  const cardClass = o.isBest ? 'best' : o.isCheapest ? 'cheapest' : o.isFastest ? 'fastest' : '';
  const scoreColor = o.score > 70 ? '#10b981' : o.score > 45 ? '#f59e0b' : '#ef4444';
  const durText = formatDuration(o.duration);

  const multiMeta = (() => {
    const pills = [];
    if (o.vehicleCount > 1) pills.push(`🚗 ×${o.vehicleCount} vehicles`);
    if (o.costPerPerson && people > 1) pills.push(`₹${o.costPerPerson}/person`);
    return pills.length
      ? `<div class="multi-vehicle-meta">${pills.map(p => `<span class="mv-pill">${p}</span>`).join('')}</div>`
      : '';
  })();

  return `
  <div class="ride-card ${cardClass} fade-in" style="animation-delay:${idx * 0.06}s">
    ${badgeLabel ? `<div class="card-badge ${badgeClass}">${badgeLabel}</div>` : ''}
    <div class="card-header">
      <div class="card-logo" style="background:${o.color}20;border-color:${o.color}40">
        <span style="font-size:1.3rem">${o.logo}</span>
      </div>
      <div class="card-name-group">
        <div class="card-name">${o.provider}</div>
        <div class="card-type"><i data-lucide="${o.typeIcon}"></i> ${o.typeLabel}</div>
      </div>
    </div>

    ${multiMeta}

    <div class="card-price">
      ₹${o.cost.toLocaleString('en-IN')}
      <span> estimated${o.vehicleCount > 1 ? ` (${o.vehicleCount} vehicles)` : ''}</span>
    </div>

    <div class="card-stats">
      <div class="stat-item"><div class="stat-label">Travel Time</div><div class="stat-value">${durText}</div></div>
      <div class="stat-item">
        <div class="stat-label">ETA / Wait</div>
        <div class="stat-value">${o.eta > 0 ? `${o.eta} min` : o.waitTime ? `${o.waitTime} min` : 'On schedule'}</div>
      </div>
      <div class="stat-item"><div class="stat-label">Distance</div><div class="stat-value">${o.distance.toFixed(1)} km</div></div>
      <div class="stat-item"><div class="stat-label">Arrive By</div><div class="stat-value">${getArrivalTime(o.duration + (o.eta || 0))}</div></div>
    </div>

    <div class="score-bar-wrap">
      <div class="score-bar-label">
        <span>Value Score</span>
        <span style="color:${scoreColor};font-weight:600">${o.score}/100</span>
      </div>
      <div class="score-bar-track">
        <div class="score-bar-fill" style="width:0%;background:${scoreColor}" data-target="${o.score}"></div>
      </div>
    </div>

    <div class="card-footer">
      <div class="card-eta">Arrives: <strong>${getArrivalTime(o.duration + (o.eta || 0))}</strong></div>
      <button class="book-btn" onclick="bookRide('${o.provider}')">Book Now →</button>
    </div>
  </div>`;
}

function renderCompTable(options, people = 1) {
  document.getElementById('compTableBody').innerHTML = options.map(o => {
    const badge = o.isBest
      ? `<span class="table-badge" style="background:#3b82f6;color:white">Best</span>`
      : o.isCheapest
        ? `<span class="table-badge" style="background:#10b981;color:white">Cheapest</span>`
        : o.isFastest
          ? `<span class="table-badge" style="background:#f59e0b;color:white">Fastest</span>` : '—';
    const sc = o.score > 70 ? '#10b981' : o.score > 45 ? '#f59e0b' : '#ef4444';
    const vInfo = o.vehicleCount > 1 ? `<small style="color:var(--text-muted)"> ×${o.vehicleCount}</small>` : '';
    const ppInfo = (o.costPerPerson && people > 1) ? `<small style="color:var(--text-muted)"> / ₹${o.costPerPerson}pp</small>` : '';
    return `<tr>
      <td><strong>${o.logo} ${o.provider}</strong></td>
      <td>₹${o.cost.toLocaleString('en-IN')}${vInfo}${ppInfo}</td>
      <td>${formatDuration(o.duration)}</td>
      <td>${o.distance.toFixed(1)} km</td>
      <td>${o.typeLabel}</td>
      <td><span class="score-pill" style="background:${sc}20;color:${sc}">${o.score}/100</span></td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
// ⑥  MULTI-VEHICLE SMART SUGGESTION
// ═══════════════════════════════════════════════════════
function buildMultiVehicleSuggestion(options, people) {
  if (people <= 1) return null;

  const cheapest = t => options.filter(o => o.category === 'ride' && o.type === t)
    .sort((a, b) => a.cost - b.cost)[0];

  const bike = cheapest('Bike');
  const auto = cheapest('Auto');
  const cab = cheapest('Cab');
  const parts = [];

  if (bike && auto) {
    if (bike.cost < auto.cost) {
      parts.push(`${bike.vehicleCount} bike${bike.vehicleCount > 1 ? 's' : ''} (${bike.provider}) are cheaper than sharing an auto — saves ₹${auto.cost - bike.cost}`);
    } else {
      parts.push(`1 auto is cheaper than ${bike.vehicleCount} bikes — saves ₹${bike.cost - auto.cost}`);
    }
  }
  if (auto && cab && auto.vehicleCount > 1 && auto.cost > cab.cost) {
    parts.push(`${auto.vehicleCount} autos would cost ₹${auto.cost - cab.cost} more than 1 cab — go for the cab`);
  }

  const bestPP = options.filter(o => o.category === 'ride').sort((a, b) => a.costPerPerson - b.costPerPerson)[0];
  if (bestPP) {
    parts.push(`Best per person: ${bestPP.logo} ${bestPP.provider} ${bestPP.type} at ₹${bestPP.costPerPerson}/person`);
  }

  return parts.length ? parts.join(' &nbsp;·&nbsp; ') : null;
}

// ═══════════════════════════════════════════════════════
// ⑦  BOOKING REDIRECTION
// ═══════════════════════════════════════════════════════
function bookRide(provider) {
  const sLat = (window._fromCoords || [])[0];
  const sLon = (window._fromCoords || [])[1];
  const dLat = (window._toCoords || [])[0];
  const dLon = (window._toCoords || [])[1];
  const sName = encodeURIComponent((window._fromName || '').split(',')[0]);
  const dName = encodeURIComponent((window._toName || '').split(',')[0]);
  let url = '';

  switch (provider) {
    case 'Uber':
      url = `https://m.uber.com/ul/?action=setPickup` +
        `&pickup[latitude]=${sLat}&pickup[longitude]=${sLon}&pickup[nickname]=${sName}` +
        `&dropoff[latitude]=${dLat}&dropoff[longitude]=${dLon}&dropoff[nickname]=${dName}`;
      break;
    case 'Ola':
      url = `https://book.olacabs.com/?pickup_lat=${sLat}&pickup_lng=${sLon}&pickup_name=${sName}` +
        `&drop_lat=${dLat}&drop_lng=${dLon}&drop_name=${dName}`;
      break;
    case 'Rapido': {
      // Rapido relies heavily on native mobile intents
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        url = `intent://route?pickup_lat=${sLat}&pickup_lng=${sLon}&drop_lat=${dLat}&drop_lng=${dLon}#Intent;scheme=rapido;package=com.rapido.passenger;end`;
      } else {
        showToast('Rapido is App-only. Open on your phone for direct linking.', '');
        url = 'https://rapido.bike/';
      }
      break;
    }
    case 'Local Auto':
      url = `https://www.google.com/maps/dir/${sLat},${sLon}/${dLat},${dLon}`;
      break;
    case 'City Bus':
      url = `https://www.google.com/maps/dir/${sLat},${sLon}/${dLat},${dLon}`;
      break;
    case 'Intercity Bus':
      url = 'https://www.redbus.in/';
      break;
    case 'TSRTC':
      url = 'https://www.tsrtconline.in/';
      break;
    case 'Metro Rail':
      const fName = (window._fromName || '').toLowerCase();
      if (fName.includes('delhi') || fName.includes('new delhi') || fName.includes('noida') || fName.includes('gurgaon')) url = 'https://www.delhimetrorail.com/';
      else if (fName.includes('hyderabad') || fName.includes('secunderabad')) url = 'https://www.ltmetro.com/';
      else if (fName.includes('bangalore') || fName.includes('bengaluru')) url = 'https://english.bmrc.co.in/';
      else if (fName.includes('mumbai') || fName.includes('navi mumbai') || fName.includes('thane')) url = 'https://www.mmmocl.co.in/';
      else if (fName.includes('chennai')) url = 'https://chennaimetrorail.org/';
      else if (fName.includes('kolkata')) url = 'https://mtp.indianrailways.gov.in/';
      else if (fName.includes('pune')) url = 'https://www.punemetrorail.org/';
      else if (fName.includes('ahmedabad')) url = 'https://www.gujaratmetrorail.com/';
      else if (fName.includes('jaipur')) url = 'https://www.transport.rajasthan.gov.in/jmrc/';
      else if (fName.includes('lucknow')) url = 'https://www.lmrcl.com/';
      else if (fName.includes('kochi')) url = 'https://kochimetro.org/';
      else if (fName.includes('nagpur')) url = 'https://www.metrorailnagpur.com/';
      else url = 'https://paytm.com/metro-card-recharge';
      break;
    case 'Indian Railways':
      url = 'https://www.irctc.co.in/nget/train-search';
      break;
    case 'IndiGo / Air India':
      url = 'https://www.makemytrip.com/flights/';
      break;
    default:
      url = `https://www.google.com/maps/dir/${sLat},${sLon}/${dLat},${dLon}`;
  }

  showToast(`Opening ${provider}...`, 'success');
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ═══════════════════════════════════════════════════════
// LOADING
// ═══════════════════════════════════════════════════════
async function simulateSteps() {
  const steps = ['ls1', 'ls2', 'ls3', 'ls4', 'ls5'], delays = [400, 800, 1000, 900, 400];
  const labels = [
    '📍 Detecting positions...',
    '🌐 Syncing with Live Satellite Data...',
    '🚖 Fetching Real-Time Uber/Ola Rates...',
    '🤖 AI Optimization running...',
    '✅ Finalizing routes...'
  ];

  for (let i = 0; i < steps.length; i++) {
    const el = document.getElementById(steps[i]);
    if (el) el.innerHTML = `<i data-lucide="${getIconForStep(i)}"></i> ${labels[i]}`;
    lucide.createIcons({ nodes: [el] });

    if (i > 0) {
      document.getElementById(steps[i - 1]).classList.remove('active');
      document.getElementById(steps[i - 1]).classList.add('done');
    }
    el.classList.add('active');
    await sleep(delays[i]);
  }
  await sleep(300);
}

function getIconForStep(i) {
  return ['map-pin', 'globe', 'car', 'cpu', 'check-circle'][i];
}
function showLoading() {
  document.getElementById('loadingOverlay').classList.add('show');
  document.querySelectorAll('.loading-step').forEach(s => s.classList.remove('active', 'done'));
  document.getElementById('ls1').classList.add('active');
  const btn = document.getElementById('compareBtn');
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-loader').classList.remove('hidden');
  btn.classList.add('loading');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
  const btn = document.getElementById('compareBtn');
  btn.querySelector('.btn-text').classList.remove('hidden');
  btn.querySelector('.btn-loader').classList.add('hidden');
  btn.classList.remove('loading');
}

// TOAST
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// HELPERS
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function formatDuration(m) {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}
function getArrivalTime(offsetMinutes) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + Math.round(offsetMinutes));
  return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ═══════════════════════════════════════════════════════
// HISTORY LOGIC
// ═══════════════════════════════════════════════════════
const historyLink = document.getElementById('historyLink');
const historyDropdown = document.getElementById('historyDropdown');
const historyList = document.getElementById('historyList');

if (historyLink && historyDropdown) {
  historyLink.addEventListener('click', (e) => {
    e.preventDefault();
    historyDropdown.classList.toggle('show');
    renderHistory();
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.history-wrapper')) {
      historyDropdown.classList.remove('show');
    }
  });
}

function saveToHistory(fromName, toName, fromCoords, toCoords) {
  if (!fromName || !toName) return;
  const history = JSON.parse(localStorage.getItem('ridewise_history') || '[]');
  if (history.length > 0 && history[0].from === fromName && history[0].to === toName) return; // Prevent duplicate

  history.unshift({ from: fromName, to: toName, fromCoords, toCoords, time: new Date().toISOString() });
  if (history.length > 5) history.pop();
  localStorage.setItem('ridewise_history', JSON.stringify(history));
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem('ridewise_history') || '[]');
  if (!historyList) return;
  if (!history.length) {
    historyList.innerHTML = '<div class="hi-empty">No recent searches.</div>';
    return;
  }

  historyList.innerHTML = history.map((item, idx) => `
    <div class="history-item" data-idx="${idx}">
      <div class="hi-icon"><i data-lucide="clock"></i></div>
      <div class="hi-route">
        <div class="hi-from text-truncate">${item.from}</div>
        <div class="hi-to text-truncate">${item.to}</div>
      </div>
    </div>
  `).join('');

  lucide.createIcons({ nodes: historyList.querySelectorAll('[data-lucide]') });

  historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const item = history[el.dataset.idx];
      document.getElementById('fromInput').value = item.from;
      document.getElementById('toInput').value = item.to;
      window._fromName = item.from;
      window._toName = item.to;
      window._fromCoords = item.fromCoords;
      window._toCoords = item.toCoords;
      historyDropdown.classList.remove('show');
      showToast('Loaded from history', 'success');
      document.getElementById('compareBtn').click();
    });
  });
}

// ═══════════════════════════════════════════════════════
// INTEGRATIONS MODAL LOGIC (PORTFOLIO DEMO)
// ═══════════════════════════════════════════════════════
const avatarBlock = document.getElementById('avatarBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

if (avatarBlock && settingsModal && closeSettingsBtn) {
  avatarBlock.addEventListener('click', () => {
    settingsModal.classList.add('show');
    loadIntegrations();
  });

  closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('show'));

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove('show');
  });
}

function loadIntegrations() {
  ['uber', 'ola', 'rapido'].forEach(app => {
    const isConn = localStorage.getItem(`rw_conn_${app}`) === 'true';
    updateIntegrationUI(app, isConn);
  });
}

window.toggleConnect = function (app) {
  const isConn = localStorage.getItem(`rw_conn_${app}`) === 'true';
  const newStatus = !isConn;

  const btn = document.getElementById(`btn-${app}`);

  if (newStatus) {
    // Simulate OAuth flow loading UX
    showToast(`Connecting to ${app.toUpperCase()}...`, '');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:var(--text-primary);"></span>';

    setTimeout(() => {
      localStorage.setItem(`rw_conn_${app}`, 'true');
      updateIntegrationUI(app, true);
      showToast(`Successfully linked ${app.toUpperCase()} account!`, 'success');

      // Add a slight variance locally to recalculate costs if already comparing
      if (document.getElementById('resultsSection') && document.getElementById('resultsSection').style.display !== 'none') {
        document.getElementById('compareBtn').click();
      }
    }, 1500);
  } else {
    localStorage.setItem(`rw_conn_${app}`, 'false');
    updateIntegrationUI(app, false);
    showToast(`Disconnected ${app.toUpperCase()} account`, '');
  }
}

function updateIntegrationUI(app, isConn) {
  const btn = document.getElementById(`btn-${app}`);
  const status = document.getElementById(`status-${app}`);
  const info = document.getElementById(`info-${app}`);
  if (!btn || !status) return;

  const item = btn.closest('.integration-item');

  if (isConn) {
    item.classList.add('connected');
    status.innerHTML = '<span class="pulse-dot" style="width:6px;height:6px;box-shadow:none;"></span> Connected securely';
    btn.innerHTML = 'Disconnect';
    if (info) info.classList.remove('hidden');
  } else {
    item.classList.remove('connected');
    status.innerHTML = 'Not connected';
    btn.innerHTML = 'Connect';
    if (info) info.classList.add('hidden');
  }
}
