/* ═══════════════════════════════════════════════════════
   RIDEWISE — App Logic
═══════════════════════════════════════════════════════ */

'use strict';

// ── INIT LUCIDE ICONS ──
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initMap();
  initTheme();
  initAutocomplete();
  initEventListeners();
});

// ═══════════════════════════════════════════════════════
// MAP SETUP
// ═══════════════════════════════════════════════════════
let map, routeLayer, startMarker, endMarker;

function initMap() {
  map = L.map('map', {
    center: [20.5937, 78.9629],
    zoom: 5,
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.attribution({ prefix: '© OpenStreetMap & Carto' }).addTo(map);

  window._mapTileLight = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  window._mapTileDark  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  window._currentTile = 'dark';
}

function switchMapTile(theme) {
  if (!map) return;
  map.eachLayer(l => { if (l instanceof L.TileLayer) map.removeLayer(l); });
  const url = theme === 'light' ? window._mapTileLight : window._mapTileDark;
  L.tileLayer(url, { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
}

function createMarker(latlng, color, label) {
  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:${color};display:flex;align-items:center;justify-content:center;
      border:3px solid white;box-shadow:0 4px 16px rgba(0,0,0,0.4);
      font-size:14px;
    ">${label}</div>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
  return L.marker(latlng, { icon });
}

function drawRoute(startCoords, endCoords) {
  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  if (routeLayer) map.removeLayer(routeLayer);

  startMarker = createMarker(startCoords, '#10b981', '🟢').addTo(map);
  endMarker = createMarker(endCoords, '#ef4444', '🔴').addTo(map);

  // Animate route drawing
  const points = generateRoutePoints(startCoords, endCoords, 20);
  let drawn = [];
  let i = 0;
  routeLayer = L.polyline([], {
    color: '#3b82f6', weight: 4, opacity: 0.85,
    dashArray: null, lineCap: 'round', lineJoin: 'round',
  }).addTo(map);

  const interval = setInterval(() => {
    drawn.push(points[i]);
    routeLayer.setLatLngs(drawn);
    i++;
    if (i >= points.length) clearInterval(interval);
  }, 30);

  map.fitBounds([startCoords, endCoords], { padding: [60, 60] });

  startMarker.bindPopup(`<strong>📍 Start</strong><br/>${window._fromName || 'Origin'}`).openPopup();
  endMarker.bindPopup(`<strong>🎯 Destination</strong><br/>${window._toName || 'Destination'}`);
}

function generateRoutePoints(start, end, count) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const curve = Math.sin(t * Math.PI) * 0.02;
    pts.push([
      start[0] + (end[0] - start[0]) * t + curve * (Math.random() - 0.5),
      start[1] + (end[1] - start[1]) * t + curve * (Math.random() - 0.5),
    ]);
  }
  return pts;
}

// ═══════════════════════════════════════════════════════
// THEME
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
// LOCATION DATA (Indian cities)
// ═══════════════════════════════════════════════════════
const CITIES = [
  { name: 'Mumbai, Maharashtra', lat: 19.0760, lon: 72.8777, metro: true },
  { name: 'Delhi, NCR', lat: 28.6139, lon: 77.2090, metro: true },
  { name: 'Bengaluru, Karnataka', lat: 12.9716, lon: 77.5946, metro: true },
  { name: 'Hyderabad, Telangana', lat: 17.3850, lon: 78.4867, metro: true },
  { name: 'Chennai, Tamil Nadu', lat: 13.0827, lon: 80.2707, metro: true },
  { name: 'Kolkata, West Bengal', lat: 22.5726, lon: 88.3639, metro: true },
  { name: 'Pune, Maharashtra', lat: 18.5204, lon: 73.8567, metro: false },
  { name: 'Ahmedabad, Gujarat', lat: 23.0225, lon: 72.5714, metro: false },
  { name: 'Jaipur, Rajasthan', lat: 26.9124, lon: 75.7873, metro: false },
  { name: 'Surat, Gujarat', lat: 21.1702, lon: 72.8311, metro: false },
  { name: 'Lucknow, Uttar Pradesh', lat: 26.8467, lon: 80.9462, metro: false },
  { name: 'Kanpur, Uttar Pradesh', lat: 26.4499, lon: 80.3319, metro: false },
  { name: 'Nagpur, Maharashtra', lat: 21.1458, lon: 79.0882, metro: false },
  { name: 'Indore, Madhya Pradesh', lat: 22.7196, lon: 75.8577, metro: false },
  { name: 'Bhopal, Madhya Pradesh', lat: 23.2599, lon: 77.4126, metro: false },
  { name: 'Visakhapatnam, AP', lat: 17.6868, lon: 83.2185, metro: false },
  { name: 'Coimbatore, Tamil Nadu', lat: 11.0168, lon: 76.9558, metro: false },
  { name: 'Kochi, Kerala', lat: 9.9312, lon: 76.2673, metro: true },
  { name: 'Goa', lat: 15.2993, lon: 74.1240, metro: false },
  { name: 'Chandigarh, Punjab', lat: 30.7333, lon: 76.7794, metro: false },
  { name: 'Mysuru, Karnataka', lat: 12.2958, lon: 76.6394, metro: false },
  { name: 'Agra, Uttar Pradesh', lat: 27.1767, lon: 78.0081, metro: false },
  { name: 'Varanasi, Uttar Pradesh', lat: 25.3176, lon: 82.9739, metro: false },
  { name: 'Thiruvananthapuram, Kerala', lat: 8.5241, lon: 76.9366, metro: false },
  { name: 'Patna, Bihar', lat: 25.5941, lon: 85.1376, metro: false },
  { name: 'Ranchi, Jharkhand', lat: 23.3441, lon: 85.3096, metro: false },
  { name: 'Guwahati, Assam', lat: 26.1445, lon: 91.7362, metro: false },
  { name: 'Bhubaneswar, Odisha', lat: 20.2961, lon: 85.8245, metro: false },
  { name: 'Amritsar, Punjab', lat: 31.6340, lon: 74.8723, metro: false },
  { name: 'Aurangabad, Maharashtra', lat: 19.8762, lon: 75.3433, metro: false },
];

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE
// ═══════════════════════════════════════════════════════
function initAutocomplete() {
  setupAutocomplete('fromInput', 'fromSuggestions', true);
  setupAutocomplete('toInput', 'toSuggestions', false);
}

function setupAutocomplete(inputId, listId, isFrom) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (q.length < 2) { list.classList.remove('show'); return; }

    const matches = CITIES.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) { list.classList.remove('show'); return; }

    list.innerHTML = matches.map(c => `
      <div class="autocomplete-item" data-name="${c.name}" data-lat="${c.lat}" data-lon="${c.lon}">
        <i data-lucide="map-pin"></i>
        ${c.name}
      </div>
    `).join('');
    list.classList.add('show');
    lucide.createIcons({ nodes: list.querySelectorAll('[data-lucide]') });

    list.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = item.dataset.name;
        const key = isFrom ? 'from' : 'to';
        window[`_${key}Coords`] = [parseFloat(item.dataset.lat), parseFloat(item.dataset.lon)];
        window[`_${key}Name`] = item.dataset.name;
        window[`_${key}Metro`] = CITIES.find(c => c.name === item.dataset.name)?.metro || false;
        list.classList.remove('show');
      });
    });
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !list.contains(e.target)) list.classList.remove('show');
  });
}

// ═══════════════════════════════════════════════════════
// GEOLOCATION
// ═══════════════════════════════════════════════════════
document.getElementById('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return showToast('Geolocation not supported', 'error');
  showToast('📍 Detecting your location...', '');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    window._fromCoords = [lat, lon];
    window._fromName = 'My Location';
    window._fromMetro = false;
    // Find nearest city
    const nearest = CITIES.reduce((a, b) =>
      dist(lat, lon, a.lat, a.lon) < dist(lat, lon, b.lat, b.lon) ? a : b
    );
    document.getElementById('fromInput').value = `Near ${nearest.name}`;
    map.setView([lat, lon], 13);
    showToast('✅ Location detected!', 'success');
  }, () => showToast('Could not get location', 'error'));
});

function dist(a, b, c, d) {
  return Math.sqrt((a - c) ** 2 + (b - d) ** 2);
}

// ═══════════════════════════════════════════════════════
// SWAP
// ═══════════════════════════════════════════════════════
document.getElementById('swapBtn').addEventListener('click', () => {
  const fromInput = document.getElementById('fromInput');
  const toInput = document.getElementById('toInput');
  [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
  [window._fromCoords, window._toCoords] = [window._toCoords, window._fromCoords];
  [window._fromName, window._toName] = [window._toName, window._fromName];
  [window._fromMetro, window._toMetro] = [window._toMetro, window._fromMetro];
  showToast('↕️ Locations swapped', '');
});

// ═══════════════════════════════════════════════════════
// QUICK ROUTES
// ═══════════════════════════════════════════════════════
const quickRoutes = {
  airport: { from: 'Delhi, NCR', to: 'Mumbai, Maharashtra' },
  station: { from: 'Bengaluru, Karnataka', to: 'Chennai, Tamil Nadu' },
  mall:    { from: 'Hyderabad, Telangana', to: 'Pune, Maharashtra' },
  hospital:{ from: 'Kolkata, West Bengal', to: 'Bhubaneswar, Odisha' },
};

function setQuickRoute(type) {
  const r = quickRoutes[type];
  const from = CITIES.find(c => c.name === r.from);
  const to   = CITIES.find(c => c.name === r.to);
  document.getElementById('fromInput').value = from.name;
  document.getElementById('toInput').value   = to.name;
  window._fromCoords = [from.lat, from.lon];
  window._fromName   = from.name;
  window._fromMetro  = from.metro;
  window._toCoords   = [to.lat, to.lon];
  window._toName     = to.name;
  window._toMetro    = to.metro;
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
      document.getElementById('rideCards').style.display  = tab === 'rides' || tab === 'all' ? 'grid' : 'none';
      document.getElementById('publicCards').style.display = tab === 'public' || tab === 'all' ? 'grid' : 'none';
      document.getElementById('allCards').style.display   = 'none';
    });
  });
}

// ═══════════════════════════════════════════════════════
// COMPARE ENGINE
// ═══════════════════════════════════════════════════════
document.getElementById('compareBtn').addEventListener('click', async () => {
  const from = document.getElementById('fromInput').value.trim();
  const to   = document.getElementById('toInput').value.trim();

  if (!from || !to) return showToast('Please enter both locations', 'error');
  if (from === to)  return showToast('Origin and destination cannot be the same', 'error');

  if (!window._fromCoords) {
    const city = CITIES.find(c => c.name.toLowerCase().includes(from.toLowerCase()));
    if (!city) return showToast('Could not find origin city', 'error');
    window._fromCoords = [city.lat, city.lon];
    window._fromName   = city.name;
    window._fromMetro  = city.metro;
  }
  if (!window._toCoords) {
    const city = CITIES.find(c => c.name.toLowerCase().includes(to.toLowerCase()));
    if (!city) return showToast('Could not find destination city', 'error');
    window._toCoords = [city.lat, city.lon];
    window._toName   = city.name;
    window._toMetro  = city.metro;
  }

  showLoading();
  await simulateSteps();

  const distanceKm = haversine(window._fromCoords, window._toCoords);
  const options = calculateOptions(distanceKm);
  const scored  = scoreOptions(options);

  hideLoading();
  drawRoute(window._fromCoords, window._toCoords);
  renderResults(scored, distanceKm);

  document.getElementById('mapMeta').textContent =
    `${distanceKm.toFixed(1)} km · ${from.split(',')[0]} → ${to.split(',')[0]}`;

  document.getElementById('resultsSection').style.display = 'flex';
  document.getElementById('resultsSection').style.flexDirection = 'column';
  document.getElementById('resultsSection').style.gap = '20px';
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ─── Haversine ───
function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Calculate all options ───
function calculateOptions(d) {
  const hasMetro = window._fromMetro || window._toMetro;
  const options = [];
  const rand = (min, max) => min + Math.random() * (max - min);

  // ── RIDE OPTIONS ──
  const providers = [
    { name: 'Uber', logo: '🚘', color: '#1d2671' },
    { name: 'Ola',  logo: '🚖', color: '#059669' },
    { name: 'Rapido', logo: '🛵', color: '#d97706' },
  ];
  const rideTypes = [
    { type: 'Bike', icon: 'bike', formula: d => 30 + d * 5,  speed: 25, label: 'Bike Ride' },
    { type: 'Auto', icon: 'car', formula: d => 40 + d * 8,  speed: 20, label: 'Auto-Rickshaw' },
    { type: 'Cab',  icon: 'car', formula: d => 60 + d * 12, speed: 35, label: 'Car Cab' },
  ];

  providers.forEach((prov, pi) => {
    rideTypes.forEach((rt, ri) => {
      if (prov.name === 'Rapido' && rt.type === 'Cab') return;
      const baseCost = rt.formula(d);
      const cost = Math.round(baseCost * rand(0.9, 1.15));
      const speedKmh = rt.speed * rand(0.85, 1.15);
      const duration = Math.round((d / speedKmh) * 60);
      const eta = Math.round(rand(3, 12));
      options.push({
        id: `${prov.name}_${rt.type}`,
        category: 'ride',
        provider: prov.name,
        logo: prov.logo,
        color: prov.color,
        type: rt.type,
        typeLabel: rt.label,
        typeIcon: rt.icon,
        cost, duration, eta, distance: d,
      });
    });
  });

  // ── PUBLIC TRANSPORT ──
  // Bus
  if (d < 600) {
    options.push({
      id: 'bus', category: 'public',
      provider: 'City Bus', logo: '🚌', color: '#0891b2',
      type: 'Bus', typeLabel: 'Public Bus', typeIcon: 'bus',
      cost: Math.round(Math.max(10, d * 1.2)),
      duration: Math.round((d / 18) * 60),
      eta: Math.round(rand(5, 20)),
      waitTime: Math.round(rand(5, 15)),
      distance: d,
    });
  }

  // Metro
  if (hasMetro && d < 80) {
    options.push({
      id: 'metro', category: 'public',
      provider: 'Metro Rail', logo: '🚇', color: '#7c3aed',
      type: 'Metro', typeLabel: 'Rapid Metro', typeIcon: 'train',
      cost: Math.round(Math.min(60, 15 + d * 2)),
      duration: Math.round((d / 40) * 60),
      eta: Math.round(rand(2, 8)),
      waitTime: Math.round(rand(3, 8)),
      distance: d,
    });
  }

  // Train
  if (d > 80) {
    options.push({
      id: 'train', category: 'public',
      provider: 'Indian Railways', logo: '🚂', color: '#dc2626',
      type: 'Train', typeLabel: 'Express Train', typeIcon: 'train',
      cost: Math.round(d * 0.8 + 50),
      duration: Math.round((d / 80) * 60),
      eta: 0,
      waitTime: Math.round(rand(20, 60)),
      distance: d,
    });
  }

  // Flight
  if (d > 300) {
    options.push({
      id: 'flight', category: 'public',
      provider: 'IndiGo / Air India', logo: '✈️', color: '#1e40af',
      type: 'Flight', typeLabel: 'Domestic Flight', typeIcon: 'plane',
      cost: Math.round(rand(3500, 8000)),
      duration: Math.round((d / 700) * 60 + 90),
      eta: 0,
      waitTime: 90,
      distance: d,
    });
  }

  return options;
}

// ─── Scoring ───
function scoreOptions(options) {
  const costs    = options.map(o => o.cost);
  const durations = options.map(o => o.duration);
  const maxCost  = Math.max(...costs);
  const maxDur   = Math.max(...durations);

  options.forEach(o => {
    const normCost = o.cost / maxCost;
    const normDur  = o.duration / maxDur;
    o.score = Math.round((1 - (0.5 * normCost + 0.5 * normDur)) * 100);
  });

  const minCost = Math.min(...costs);
  const minDur  = Math.min(...durations);
  const maxScore = Math.max(...options.map(o => o.score));

  options.forEach(o => {
    o.isCheapest = o.cost === minCost;
    o.isFastest  = o.duration === minDur;
    o.isBest     = o.score === maxScore;
  });

  return options.sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════
// RENDER RESULTS
// ═══════════════════════════════════════════════════════
function renderResults(options, distKm) {
  const rideOptions   = options.filter(o => o.category === 'ride');
  const publicOptions = options.filter(o => o.category === 'public');

  document.getElementById('rideCards').innerHTML   = rideOptions.map((o, i) => rideCardHTML(o, i)).join('');
  document.getElementById('publicCards').innerHTML = publicOptions.map((o, i) => rideCardHTML(o, i)).join('');

  renderCompTable(options);
  renderAIBanner(options, distKm);

  lucide.createIcons();
}

function rideCardHTML(o, idx) {
  const badgeClass = o.isBest ? 'badge-best' : o.isCheapest ? 'badge-cheapest' : o.isFastest ? 'badge-fastest' : '';
  const badgeLabel = o.isBest ? '⭐ Best Choice' : o.isCheapest ? '💰 Cheapest' : o.isFastest ? '⚡ Fastest' : '';
  const cardClass  = o.isBest ? 'best' : o.isCheapest ? 'cheapest' : o.isFastest ? 'fastest' : '';
  const scoreColor = o.score > 70 ? '#10b981' : o.score > 45 ? '#f59e0b' : '#ef4444';
  const durText    = formatDuration(o.duration);
  const totalTime  = o.waitTime ? formatDuration(o.duration + (o.waitTime || 0)) : durText;

  return `
  <div class="ride-card ${cardClass} fade-in" data-delay="${Math.min(idx + 1, 6)}" style="animation-delay:${idx * 0.06}s">
    ${badgeLabel ? `<div class="card-badge ${badgeClass}">${badgeLabel}</div>` : ''}
    <div class="card-header">
      <div class="card-logo" style="background:${o.color}20;border-color:${o.color}40">
        <span style="font-size:1.3rem">${o.logo}</span>
      </div>
      <div class="card-name-group">
        <div class="card-name">${o.provider}</div>
        <div class="card-type">
          <i data-lucide="${o.typeIcon}"></i>
          ${o.typeLabel}
        </div>
      </div>
    </div>

    <div class="card-price">₹${o.cost.toLocaleString('en-IN')}<span> estimated</span></div>

    <div class="card-stats">
      <div class="stat-item">
        <div class="stat-label">Travel Time</div>
        <div class="stat-value">${durText}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">ETA / Wait</div>
        <div class="stat-value">${o.eta > 0 ? `${o.eta} min` : o.waitTime ? `${o.waitTime} min` : 'On schedule'}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Distance</div>
        <div class="stat-value">${o.distance.toFixed(1)} km</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Total Time</div>
        <div class="stat-value">${totalTime}</div>
      </div>
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
      <button class="book-btn" onclick="showToast('🚀 Opening ${o.provider}...', 'success')">Book Now →</button>
    </div>
  </div>`;
}

function renderCompTable(options) {
  const tbody = document.getElementById('compTableBody');
  tbody.innerHTML = options.map(o => {
    const badge = o.isBest ? `<span class="table-badge" style="background:#3b82f6;color:white">Best</span>` :
                  o.isCheapest ? `<span class="table-badge" style="background:#10b981;color:white">Cheapest</span>` :
                  o.isFastest  ? `<span class="table-badge" style="background:#f59e0b;color:white">Fastest</span>` : '—';
    const scoreColor = o.score > 70 ? '#10b981' : o.score > 45 ? '#f59e0b' : '#ef4444';
    return `<tr>
      <td><strong>${o.logo} ${o.provider}</strong></td>
      <td>₹${o.cost.toLocaleString('en-IN')}</td>
      <td>${formatDuration(o.duration)}</td>
      <td>${o.distance.toFixed(1)} km</td>
      <td>${o.typeLabel}</td>
      <td><span class="score-pill" style="background:${scoreColor}20;color:${scoreColor}">${o.score}/100</span></td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

function renderAIBanner(options, distKm) {
  const best  = options.find(o => o.isBest);
  const cheap = options.find(o => o.isCheapest);
  const fast  = options.find(o => o.isFastest);

  let tip = '';
  if (distKm < 5) tip = `For short distances under 5 km, `;
  else if (distKm > 300) tip = `For long-distance travel, `;
  else tip = `For this route, `;

  const desc = `${tip}${best.logo} <strong>${best.provider} ${best.type}</strong> offers the best value at ₹${best.cost}. ` +
    `${cheap.id !== best.id ? `Cheapest: ${cheap.logo} ${cheap.provider} (₹${cheap.cost}). ` : ''}` +
    `${fast.id !== best.id ? `Fastest: ${fast.logo} ${fast.provider} (${formatDuration(fast.duration)}).` : ''}`;

  document.getElementById('aiDesc').innerHTML = desc;
  document.getElementById('aiBadge').textContent = `${best.logo} ${best.provider}`;
}

// ═══════════════════════════════════════════════════════
// LOADING
// ═══════════════════════════════════════════════════════
async function simulateSteps() {
  const overlay = document.getElementById('loadingOverlay');
  const steps = ['ls1','ls2','ls3','ls4','ls5'];
  const delays = [400, 600, 700, 600, 400];

  for (let i = 0; i < steps.length; i++) {
    if (i > 0) document.getElementById(steps[i-1]).classList.remove('active');
    if (i > 0) document.getElementById(steps[i-1]).classList.add('done');
    document.getElementById(steps[i]).classList.add('active');
    await sleep(delays[i]);
  }
  await sleep(300);
}

function showLoading() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('show');
  document.querySelectorAll('.loading-step').forEach(s => { s.classList.remove('active','done'); });
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

  // Animate score bars
  setTimeout(() => {
    document.querySelectorAll('.score-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  }, 300);
}

// ═══════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatDuration(minutes) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getArrivalTime(offsetMinutes) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + Math.round(offsetMinutes));
  return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
