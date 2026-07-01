// Track n Travel Client Application - APSRTC Edition

let map;
let routesData = {};
let osrmRoutesData = {};
let routePolylines = {};
let vehicleMarkers = {};
let vehiclesData = [];
let focusedBusId = null;
let searchQuery = "";
let statusFilter = "all";
let expandedRoutes = {};
let selectedRouteCode = null;
let selectedVehicleId = null;
let activeIsolatedBusIds = null;
let ws;

// Initialize Lucide Icons
lucide.createIcons();

// Elements
const connectionStatus = document.getElementById('connection-status');
const statusPing = document.getElementById('status-ping');
const statusPingPing = document.getElementById('status-ping-ping');
const statusText = document.getElementById('status-text');

const searchInput = document.getElementById('search-input');
const filterAll = document.getElementById('filter-all');
const filterOnTime = document.getElementById('filter-ontime');
const filterDelayed = document.getElementById('filter-delayed');
const fleetList = document.getElementById('fleet-list');
const filteredCount = document.getElementById('filtered-count');

const metricActiveCount = document.getElementById('metric-active-count');
const metricAvgEta = document.getElementById('metric-avg-eta');
const metricOnTimeRate = document.getElementById('metric-ontime-rate');

const focusedCard = document.getElementById('focused-card');
const focusBusId = document.getElementById('focus-bus-id');
const focusBusName = document.getElementById('focus-bus-name');
const focusRouteName = document.getElementById('focus-route-name');
const focusStatus = document.getElementById('focus-status');
const focusEta = document.getElementById('focus-eta');
const focusSpeed = document.getElementById('focus-speed');
const focusDistance = document.getElementById('focus-distance');
const focusTimeline = document.getElementById('upcoming-stops-timeline');
const closeFocusBtn = document.getElementById('close-focus-btn');
const focusLastUpdated = document.getElementById('focus-last-updated');

const speedSlider = document.getElementById('speed-slider');
const speedLabel = document.getElementById('speed-label');
const recenterBtn = document.getElementById('recenter-btn');

const toastContainer = document.getElementById('toast-container');
const toastMessage = document.getElementById('toast-message');
const dismissToastBtn = document.getElementById('dismiss-toast');

const ROUTE_COLORS = {
  "10K": "#22d3ee",   // Neon Cyan
  "28K": "#fbbf24",   // Neon Amber
  "38Y": "#c084fc",   // Neon Purple
  "25P": "#f43f5e",   // Rose Red
  "900K": "#10b981",  // Emerald Green
  "6A": "#3b82f6",    // Blue
  "25M": "#ec4899",   // Hot Pink
  "540": "#f97316",   // Orange
  "222V": "#84cc16",  // Lime
  "111V": "#06b6d4",  // Cyan
  "211V": "#a855f7",  // Purple
  "48A": "#14b8a6",   // Teal
  "60C": "#f59e0b",   // Amber
  "52D": "#ef4444",   // Red
  "14": "#6366f1"     // Indigo
};

const DEPOT_NAMES = {
  "10K": "Waltair Depot",
  "25M": "Maddilapalem Depot",
  "25P": "Maddilapalem Depot",
  "60C": "Waltair Depot",
  "14": "Waltair Depot",
  "28K": "Simhachalam Depot",
  "6A": "Simhachalam Depot",
  "540": "Simhachalam Depot",
  "48A": "Simhachalam Depot",
  "38Y": "Gajuwaka Depot",
  "111V": "Steel City Depot",
  "900K": "Madhurawada Depot",
  "222V": "Maddilapalem Depot",
  "211V": "Maddilapalem Depot",
  "52D": "Madhurawada Depot"
};

const OFFICIAL_INACTIVE_ROUTE_NAMES = {
  "10K": "10K",
  "900K": "900K New",
  "28K": "28K",
  "6A": "6A",
  "540": "540",
  "38Y": "38Y",
  "25M": "25M",
  "25P": "25P New",
  "48A": "48A",
  "222V": "222V",
  "111V": "111V",
  "211V": "211V",
  "60C": "60C",
  "52D": "52D",
  "14": "14"
};

// Dynamically generate and inject glowing polyline and colored vehicle styles for all routes
function injectDynamicRouteStyles() {
  let styleSheetHtml = "";
  Object.keys(ROUTE_COLORS).forEach(busId => {
    const color = ROUTE_COLORS[busId];
    styleSheetHtml += `
      .route-path-${busId} {
        filter: drop-shadow(0px 0px 5px ${color}aa);
      }
      .vehicle-icon.route-${busId} {
        background: ${color} !important;
        box-shadow: 0 4px 15px ${color}b0 !important;
      }
      .vehicle-icon-ring.route-${busId} {
        border-color: ${color} !important;
      }
    `;
  });
  const styleEl = document.createElement("style");
  styleEl.innerHTML = styleSheetHtml;
  document.head.appendChild(styleEl);
}

// Initialize Map
function initMap() {
  map = L.map('map', {
    zoomControl: false
  }).setView([17.747, 83.332], 12);

  L.control.zoom({
    position: 'topright'
  }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);

  injectDynamicRouteStyles();
}

// Custom Leaflet DivIcon for vehicles
function getBusIcon(v) {
  const busId = v.bus_id;
  const status = v.status;
  const direction = v.direction;
  const parts = busId.split('-');
  const routeCode = parts[0];
  const instanceNumber = parts[1] ? parseInt(parts[1], 10) : "";
  
  const routeColor = ROUTE_COLORS[routeCode] || "#3B82F6";
  const isInactive = v.active === false || status === "[Out of Service - Depot Return]";
  
  const isThisBusIsolatedOrFocused = 
    (focusedBusId === busId) || 
    (selectedVehicleId === busId) || 
    (activeIsolatedBusIds !== null && activeIsolatedBusIds.includes(busId)) ||
    (selectedRouteCode === routeCode);
    
  let markerColor;
  if (isInactive) {
    markerColor = "#64748b"; // Slate gray for out of service
  } else if (isThisBusIsolatedOrFocused) {
    const isUpRoute = direction === "FORWARD" || direction === "UP";
    markerColor = isUpRoute ? "#F97316" : "#3B82F6"; // Orange for UP, Blue for DOWN
  } else {
    markerColor = routeColor;
  }
  
  const isStalled = status === 'Delayed';
  if (isStalled && !isInactive) {
    markerColor = "#EF4444"; // Red for delayed/stalled
  }
  
  let innerCircleHtml;
  if (isInactive) {
    innerCircleHtml = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${markerColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 22px; height: 22px;">
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M4 12h16" />
        <path d="M8 18v3" />
        <path d="M16 18v3" />
        <path d="M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2" />
      </svg>
    `;
  } else {
    innerCircleHtml = instanceNumber !== ""
      ? `<span style="color: ${markerColor}; font-weight: bold; font-size: 14px; font-family: 'Outfit', sans-serif;">${instanceNumber}</span>`
      : `<div style="background-color: ${markerColor}; width: 18px; height: 18px; border-radius: 50%;"></div>`;
  }
  
  const capsuleColor = isInactive ? "#475569" : routeColor;
  const pillText = isInactive 
    ? (OFFICIAL_INACTIVE_ROUTE_NAMES[routeCode] || routeCode)
    : routeCode;
  
  return L.divIcon({
    className: 'custom-bus-marker' + (isStalled && !isInactive ? ' stalled' : '') + (isInactive ? ' inactive-bus' : ''),
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="background-color: ${capsuleColor}; color: white; font-weight: bold; font-size: 12px; padding: 2px 8px; border-radius: 4px; white-space: nowrap; margin-bottom: 2px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
          ${pillText}
        </div>
        <div style="background-color: white; border: 3px solid ${markerColor}; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">
          ${innerCircleHtml}
        </div>
      </div>
    `,
    iconSize: [55, 65],
    iconAnchor: [27, 65]
  });
}

// Draw/Redraw Route Polylines and highlight the focused route
function drawRoutes() {
  Object.keys(routesData).forEach(busId => {
    const coords = routesData[busId];
    if (!coords || coords.length === 0) return;
    const focusedRouteCode = focusedBusId ? focusedBusId.split('-')[0] : null;
    const isFocused = busId === focusedRouteCode;
    const color = ROUTE_COLORS[busId] || "#94a3b8";
    
    if (routePolylines[busId]) {
      map.removeLayer(routePolylines[busId]);
      delete routePolylines[busId];
    }
    
    if (selectedRouteCode !== null && busId !== selectedRouteCode) {
      return;
    }
    
    const weight = isFocused ? 7 : 3.5;
    const opacity = isFocused ? 0.95 : 0.25;
    
    routePolylines[busId] = L.polyline(coords, {
      color: color,
      weight: weight,
      opacity: opacity,
      lineCap: 'round',
      lineJoin: 'round',
      className: `route-path-${busId}`
    }).addTo(map);
    
    if (isFocused) {
      routePolylines[busId].bringToFront();
    }
  });
}

// Cache to prevent duplicate simultaneous fetches for the same route
const activeOSRMFetches = new Set();

function fetchOSRMRouteDynamically(routeCode, stops) {
  if (activeOSRMFetches.has(routeCode)) return;
  activeOSRMFetches.add(routeCode);

  const coordsStr = stops.map(s => `${s.lon},${s.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

  fetch(url)
    .then(response => response.json())
    .then(data => {
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        routesData[routeCode] = coords;
        console.log(`[OSRM] Dynamically fetched and cached route ${routeCode} with ${coords.length} coordinates.`);
        drawRoutes();
      } else {
        console.error(`[OSRM] Dynamic fetch for ${routeCode} returned code: ${data.code}`);
      }
    })
    .catch(err => {
      console.error(`[OSRM] Dynamic fetch for ${routeCode} failed:`, err);
    })
    .finally(() => {
      activeOSRMFetches.delete(routeCode);
    });
}

function ensureOSRMRoutes(vehicles) {
  vehicles.forEach(v => {
    const routeCode = v.route_code || v.bus_id.split('-')[0];
    if ((!routesData[routeCode] || routesData[routeCode].length === 0) && v.stops && v.stops.length > 0) {
      fetchOSRMRouteDynamically(routeCode, v.stops);
    }
  });
}

// Set WS status indicator
function updateWSStatus(status) {
  if (status === 'connected') {
    connectionStatus.className = 'flex items-center space-x-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/20 text-[10px] font-bold text-emerald-400 transition-all duration-300';
    statusPing.className = 'relative inline-flex rounded-full h-2 w-2 bg-emerald-400';
    statusPingPing.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75';
    statusText.innerText = 'CONNECTED';
  } else if (status === 'connecting') {
    connectionStatus.className = 'flex items-center space-x-2 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-950/20 text-[10px] font-bold text-amber-400 transition-all duration-300';
    statusPing.className = 'relative inline-flex rounded-full h-2 w-2 bg-amber-400';
    statusPingPing.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75';
    statusText.innerText = 'CONNECTING...';
  } else {
    connectionStatus.className = 'flex items-center space-x-2 px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/50 text-[10px] font-bold text-slate-400 transition-all duration-300';
    statusPing.className = 'relative inline-flex rounded-full h-2 w-2 bg-slate-400';
    statusPingPing.className = 'hidden';
    statusText.innerText = 'DISCONNECTED';
  }
}

// Parse duration strings into numeric minutes
function parseEtaToMinutes(etaStr) {
  if (!etaStr || etaStr === "Arrived") return 0;
  let mins = 0;
  let secs = 0;
  
  const minMatch = etaStr.match(/(\d+)\s*min/);
  const secMatch = etaStr.match(/(\d+)\s*sec/);
  
  if (minMatch) mins = parseInt(minMatch[1]);
  if (secMatch) secs = parseInt(secMatch[1]);
  
  return mins + (secs / 60);
}

// Calculate and render global network statistics
function calculateGlobalMetrics() {
  const activeVehicles = vehiclesData.filter(v => !isBusStationStandby(v) && v.active !== false);
  if (activeVehicles.length === 0) {
    metricActiveCount.innerText = 0;
    metricAvgEta.innerText = "--";
    metricOnTimeRate.innerText = "100%";
    return;
  }
  
  metricActiveCount.innerText = activeVehicles.length;
  
  let totalEtaMinutes = 0;
  activeVehicles.forEach(v => {
    totalEtaMinutes += parseEtaToMinutes(v.eta);
  });
  const avgMins = totalEtaMinutes / activeVehicles.length;
  metricAvgEta.innerText = `${avgMins.toFixed(1)}m`;
  
  const onTimeCount = activeVehicles.filter(v => v.status === "On Time").length;
  const rate = (onTimeCount / activeVehicles.length) * 100;
  metricOnTimeRate.innerText = `${Math.round(rate)}%`;
}

// Select a specific bus to highlight
function focusVehicle(busId, panTo = true) {
  focusedBusId = busId;
  drawRoutes();
  
  const routeCode = busId.split('-')[0];
  expandedRoutes[routeCode] = true;
  
  if (panTo) {
    const vehicle = vehiclesData.find(v => v.bus_id === busId);
    if (vehicle) {
      let lat = vehicle.lat;
      let lon = vehicle.lon;
      if (vehicle.active === false) {
        const routeIndex = Object.keys(ROUTE_COLORS).indexOf(routeCode);
        const instance = parseInt(busId.split('-')[1] || "1", 10);
        const row = Math.floor((routeIndex * 3 + instance) / 5);
        const col = (routeIndex * 3 + instance) % 5;
        lat += (row - 2) * 0.00015;
        lon += (col - 2) * 0.00018;
      }
      map.setView([lat, lon], 14, { animate: true });
    } else if (vehicleMarkers[busId]) {
      map.setView(vehicleMarkers[busId].getLatLng(), 14, { animate: true });
    }
  }
  
  updateFocusedCard();
  updateFleetList();
  updateMapMarkers(vehiclesData);
}

window.toggleRouteExpand = function(routeCode) {
  expandedRoutes[routeCode] = !expandedRoutes[routeCode];
  
  selectedVehicleId = null; // Clear single-vehicle isolation on route header click
  activeIsolatedBusIds = null; // Reset search dropdown isolation
  
  if (selectedRouteCode === routeCode) {
    selectedRouteCode = null;
  } else {
    selectedRouteCode = routeCode;
    expandedRoutes[routeCode] = true;
  }
  
  updateIsolationUI();
  drawRoutes();
  updateMapMarkers(vehiclesData);
  updateFleetList();
};

function updateIsolationUI() {
  const container = document.getElementById('isolation-badge-container');
  if (selectedVehicleId) {
    const vehicle = vehiclesData.find(v => v.bus_id === selectedVehicleId);
    const direction = vehicle ? (vehicle.direction || "FORWARD") : "FORWARD";
    const badgeColorClass = (direction === "REVERSE") 
      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" 
      : "bg-orange-500/20 text-orange-400 border border-orange-500/30";
      
    if (container) {
      container.innerHTML = `
        <span class="text-sky-300 font-medium">Isolating Vehicle <span id="isolated-route-badge" class="font-black px-1.5 py-0.5 rounded-md ml-1 text-[10px] ${badgeColorClass}">${selectedVehicleId}</span></span>
        <button onclick="clearRouteIsolation()" class="px-2 py-1 bg-sky-500/25 hover:bg-sky-500/40 text-[9px] font-bold text-sky-200 rounded-lg transition-colors">Show All Buses</button>
      `;
      container.classList.remove('hidden');
    }
  } else if (activeIsolatedBusIds !== null && selectedRouteCode) {
    if (container) {
      container.innerHTML = `
        <span class="text-sky-300 font-medium">Isolating Route <span id="isolated-route-badge" class="font-black px-1.5 py-0.5 bg-sky-500/20 rounded-md ml-1 text-[10px]">${selectedRouteCode} (Filtered)</span></span>
        <button onclick="clearRouteIsolation()" class="px-2 py-1 bg-sky-500/25 hover:bg-sky-500/40 text-[9px] font-bold text-sky-200 rounded-lg transition-colors">Show All Buses</button>
      `;
      container.classList.remove('hidden');
    }
  } else if (selectedRouteCode) {
    if (container) {
      container.innerHTML = `
        <span class="text-sky-300 font-medium">Isolating Route <span id="isolated-route-badge" class="font-black px-1.5 py-0.5 bg-sky-500/20 rounded-md ml-1 text-[10px]">${selectedRouteCode}</span></span>
        <button onclick="clearRouteIsolation()" class="px-2 py-1 bg-sky-500/25 hover:bg-sky-500/40 text-[9px] font-bold text-sky-200 rounded-lg transition-colors">Show All Buses</button>
      `;
      container.classList.remove('hidden');
    }
  } else {
    if (container) container.classList.add('hidden');
  }
}

window.clearRouteIsolation = function() {
  selectedRouteCode = null;
  selectedVehicleId = null;
  activeIsolatedBusIds = null;
  updateIsolationUI();
  drawRoutes();
  updateMapMarkers(vehiclesData);
  updateFleetList();
};

window.selectSingleVehicle = function(busId) {
  selectedVehicleId = busId;
  selectedRouteCode = busId.split('-')[0];
  activeIsolatedBusIds = null; // Clear dropdown-level isolation when single vehicle is selected
  
  focusVehicle(busId, true);
  
  updateIsolationUI();
  updateMapMarkers(vehiclesData);
};

window.focusVehicle = focusVehicle;
window.showUpcomingStops = function(busId) {
  focusVehicle(busId);
};

// Haversine distance helper on frontend
function haversineDistance(p1, p2) {
  const R = 6371.0; // km
  const lat1 = p1[0] * Math.PI / 180;
  const lon1 = p1[1] * Math.PI / 180;
  const lat2 = p2[0] * Math.PI / 180;
  const lon2 = p2[1] * Math.PI / 180;
  
  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;
  
  const a = Math.sin(dlat / 2) * Math.sin(dlat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dlon / 2) * Math.sin(dlon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Distance from current position to a specific stop index along the route coordinates
function getDistanceToStop(vehicleIndex, stopIndex, routeCoords, direction) {
  const vehicle = vehiclesData.find(v => v.bus_id === focusedBusId);
  if (!vehicle) return 0;
  
  let currentPos = [vehicle.lat, vehicle.lon];
  let dist = 0;
  
  if (direction === "FORWARD") {
    if (vehicleIndex >= stopIndex) return 0;
    let nextCoordIdx = vehicleIndex + 1;
    if (nextCoordIdx > stopIndex) return 0;
    dist += haversineDistance(currentPos, routeCoords[nextCoordIdx]);
    for (let idx = nextCoordIdx; idx < stopIndex; idx++) {
      dist += haversineDistance(routeCoords[idx], routeCoords[idx + 1]);
    }
  } else {
    // REVERSE mode: vehicleIndex decreases towards stopIndex
    if (vehicleIndex <= stopIndex) return 0;
    let nextCoordIdx = vehicleIndex - 1;
    if (nextCoordIdx < stopIndex) return 0;
    dist += haversineDistance(currentPos, routeCoords[nextCoordIdx]);
    for (let idx = nextCoordIdx; idx > stopIndex; idx--) {
      dist += haversineDistance(routeCoords[idx], routeCoords[idx - 1]);
    }
  }
  return dist;
}

// Render the vertical progress timeline of stops for the selected vehicle
function updateStopsTimeline(vehicle) {
  if (!focusTimeline) return;
  
  if (!vehicle) {
    focusTimeline.innerHTML = `<div class="text-xs text-slate-500 py-2">No vehicle selected</div>`;
    return;
  }
  
  const routeCode = vehicle.bus_id.split('-')[0];
  const routeCoords = routesData[routeCode];
  if (!routeCoords) return;
  
  const direction = vehicle.direction || "FORWARD";
  
  // Clone stops so we don't modify the vehicle's array
  let travelStops = [...vehicle.stops];
  if (direction === "REVERSE") {
    travelStops.reverse();
  }
  
  focusTimeline.innerHTML = travelStops.map((stop, i) => {
    let isPassed = false;
    if (direction === "FORWARD") {
      isPassed = vehicle.route_index >= stop.route_index;
    } else {
      isPassed = vehicle.route_index <= stop.route_index;
    }
    
    // Find the next stop: the first stop in travelStops that is not passed
    const firstNotPassedIdx = travelStops.findIndex(s => {
      if (direction === "FORWARD") {
        return vehicle.route_index < s.route_index;
      } else {
        return vehicle.route_index > s.route_index;
      }
    });
    
    const isNext = !isPassed && (i === firstNotPassedIdx);
    
    let bulletClass = "";
    let textClass = "";
    let statusLabel = "";
    
    if (isPassed) {
      bulletClass = "bg-slate-700 border-slate-600";
      textClass = "text-slate-500 line-through decoration-slate-800/40";
      statusLabel = "(Passed)";
    } else if (isNext) {
      if (direction === "REVERSE") {
        bulletClass = "bg-blue-500 border-blue-300 ring-4 ring-blue-500/20";
        textClass = "text-blue-400 font-bold";
      } else {
        bulletClass = "bg-orange-500 border-orange-300 ring-4 ring-orange-500/20";
        textClass = "text-orange-400 font-bold";
      }
      
      const distance = getDistanceToStop(vehicle.route_index, stop.route_index, routeCoords, direction);
      const speed = vehicle.speed_kmh > 0 ? vehicle.speed_kmh : 15.0;
      const etaMins = (distance / speed) * 60;
      let etaStr = etaMins < 1 ? `${Math.round(etaMins * 60)} sec` : `${Math.round(etaMins)} min`;
      
      statusLabel = `(Next stop in ${etaStr})`;
    } else if (i === travelStops.length - 1) {
      bulletClass = "bg-indigo-950 border-indigo-500";
      textClass = "text-indigo-400 font-semibold";
      statusLabel = "(Destination)";
    } else if (i === 0) {
      bulletClass = "bg-emerald-950 border-emerald-500";
      textClass = "text-emerald-400 font-semibold";
      statusLabel = "(Starting point)";
    } else {
      bulletClass = "bg-slate-900 border-slate-800";
      textClass = "text-slate-400";
      statusLabel = "(Upcoming within estimated time)";
    }
    
    return `
      <div class="relative flex items-center mb-4 last:mb-0">
        <!-- Timeline node bullet -->
        <span class="absolute -left-[21px] w-2.5 h-2.5 rounded-full border-2 ${bulletClass} transition-all duration-300 z-10"></span>
        <div class="flex flex-col">
          <span class="text-[10px] font-semibold ${textClass}">${stop.name} <span class="text-[9px] opacity-80 font-normal ml-1">${statusLabel}</span></span>
        </div>
      </div>
    `;
  }).join('');
}

// Update the bottom focused vehicle dashboard details and route timeline
function updateFocusedCard() {
  if (!focusedBusId) {
    focusedCard.classList.add('hidden');
    return;
  }
  
  const vehicle = vehiclesData.find(v => v.bus_id === focusedBusId);
  const routeCode = focusedBusId.split('-')[0];
  const routeCoords = routesData[routeCode];
  if (!vehicle || !routeCoords) return;
  
  focusedCard.classList.remove('hidden');
  
  focusBusId.innerText = vehicle.bus_id;
  const direction = vehicle.direction || "FORWARD";
  const badgeColorClass = (direction === "REVERSE") 
    ? "bg-blue-950/40 border border-blue-500/30 text-blue-400" 
    : "bg-orange-950/40 border border-orange-500/30 text-orange-400";
  focusBusId.className = `px-2.5 py-0.5 rounded-lg text-xs font-black ${badgeColorClass}`;
  
  const isStandby = isBusStationStandby(vehicle);
  const isInactive = vehicle.active === false;
  let nameText = vehicle.name;
  if (isInactive) {
    nameText += " [Out of Service - Depot Return]";
  } else if (isStandby) {
    nameText += " [Station Standby]";
  }
  focusBusName.innerText = nameText;
  focusRouteName.innerText = vehicle.route_name;
  
  if (isInactive) {
    focusStatus.innerText = "OUT OF SERVICE";
    focusStatus.className = "px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider bg-slate-950/40 border border-slate-500/30 text-slate-400";
  } else if (isStandby) {
    focusStatus.innerText = "STATION STANDBY";
    focusStatus.className = "px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider bg-slate-950/40 border border-slate-500/30 text-slate-400";
  } else if (vehicle.status === "Delayed") {
    focusStatus.innerText = "STALLED";
    focusStatus.className = "px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider bg-red-950/40 border border-red-500/30 text-red-400 animate-pulse";
  } else {
    focusStatus.innerText = "ON TIME";
    focusStatus.className = "px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider bg-emerald-950/40 border border-emerald-500/30 text-emerald-400";
  }
  
  focusEta.innerText = vehicle.eta;
  focusSpeed.innerText = `${vehicle.speed_kmh} km/h`;
  focusDistance.innerText = `${vehicle.remaining_dist_km} km`;
  
  if (focusLastUpdated && vehicle.last_updated_ist) {
    focusLastUpdated.innerText = `Last update: ${vehicle.last_updated_ist}`;
  }
  
  // Render Dynamic Stops Timeline
  updateStopsTimeline(vehicle);
}

function isBusStationStandby(v) {
  if (v.is_standby === true) return true;
  if (v.speed_kmh !== 0) return false;
  const currentStop = v.stops.find(s => s.route_index === v.route_index);
  if (!currentStop) return false;
  const isTerminal = (currentStop.route_index === v.stops[0].route_index) || 
                     (currentStop.route_index === v.stops[v.stops.length - 1].route_index);
  if (!isTerminal) return false;
  const name = currentStop.name.toLowerCase();
  return name.includes("dwaraka") || name.includes("rtc complex") || name.includes("maddilapalem");
}

// Helper to render an individual vehicle card inside the sidebar
function renderVehicleCard(v, color, showRouteInfo = false) {
  const isFocused = v.bus_id === focusedBusId;
  const isStalled = v.status === "Delayed";
  const isInactive = v.active === false;
  const direction = v.direction || "FORWARD";
  
  const parts = v.bus_id.split('-');
  const instanceNumber = parts[1] ? parseInt(parts[1], 10) : "";
  const routeCode = parts[0];
  
  // Dynamic direction color and styles
  const isThisBusIsolatedOrFocused = 
    (focusedBusId === v.bus_id) || 
    (selectedVehicleId === v.bus_id) || 
    (activeIsolatedBusIds !== null && activeIsolatedBusIds.includes(v.bus_id)) ||
    (selectedRouteCode === routeCode);
  
  let dotColor = color;
  let etaColorClass = "text-sky-400";
  if (isInactive) {
    dotColor = "#64748b"; // Slate gray for out of service
    etaColorClass = "text-slate-500 font-medium";
  } else if (isThisBusIsolatedOrFocused) {
    dotColor = (direction === "REVERSE") ? "#3B82F6" : "#F97316";
    etaColorClass = (direction === "REVERSE") ? "text-blue-400" : "text-orange-400";
  }
  
  let borderClass = `border-slate-800/80 bg-slate-900/20 hover:border-slate-700/50 hover:bg-slate-900/30`;
  if (isInactive) {
    borderClass = `border-slate-900/60 bg-slate-950/5 opacity-70 hover:opacity-100 hover:border-slate-800/40 transition-all duration-300`;
  } else if (isFocused) {
    if (direction === "REVERSE") {
      borderClass = `border-blue-500/60 bg-blue-950/15 shadow-md shadow-blue-500/5`;
    } else {
      borderClass = `border-orange-500/60 bg-orange-950/15 shadow-md shadow-orange-500/5`;
    }
  }
  
  let badgeHtml = "";
  if (isInactive) {
    badgeHtml = `<span class="px-2 py-0.5 rounded-md text-[8px] font-black tracking-wider bg-slate-950/40 border border-slate-750 text-slate-500 uppercase select-none">Off-Duty</span>`;
  } else if (isStalled) {
    badgeHtml = `<span class="px-2 py-0.5 rounded-md text-[8px] font-black tracking-wider bg-red-950/50 border border-red-500/30 text-red-400 animate-pulse uppercase">Stalled</span>`;
  } else {
    badgeHtml = `<span class="px-2 py-0.5 rounded-md text-[8px] font-black tracking-wider bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 uppercase">On Time</span>`;
  }
    
  let nextStopLabel = `<span class="text-slate-500 font-medium">Next:</span>`;
  let nextStopName = "Terminus";
  
  if (isInactive) {
    nextStopLabel = `<span class="text-slate-500 font-medium">Depot:</span>`;
    nextStopName = DEPOT_NAMES[routeCode] || "Depot";
  } else {
    let travelStops = [...v.stops];
    if (direction === "REVERSE") {
      travelStops.reverse();
    }
    const nextStop = travelStops.find(s => {
      if (direction === "FORWARD") {
        return v.route_index < s.route_index;
      } else {
        return v.route_index > s.route_index;
      }
    });
    nextStopName = nextStop ? nextStop.name : (travelStops[travelStops.length - 1] ? travelStops[travelStops.length - 1].name : "Terminus");
  }

  const routeBadgeClass = isInactive
    ? "bg-slate-900 text-slate-500 font-semibold border border-slate-800"
    : (isFocused 
        ? (direction === "REVERSE" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 font-black" : "bg-orange-500/20 text-orange-400 border border-orange-500/30 font-black")
        : "bg-slate-800 text-slate-300 font-bold");
  
  let titleAccentClass = isFocused 
    ? (direction === "REVERSE" ? "text-blue-400 font-black" : "text-orange-400 font-black") 
    : "text-slate-200";
  if (isInactive) {
    titleAccentClass = "text-gray-500 font-semibold";
  }

  const isStandby = isBusStationStandby(v);
  const standbyBadge = isStandby 
    ? `<span class="ml-1.5 px-1.5 py-0.5 rounded bg-slate-800 text-[8px] font-bold text-slate-400 border border-slate-700/50 uppercase select-none shrink-0">[Station Standby]</span>`
    : ``;

  const titleText = showRouteInfo 
    ? `<span class="${routeBadgeClass} px-1.5 py-0.5 rounded text-[9px] mr-1.5 select-none">${routeCode}</span><span class="font-outfit font-black ${titleAccentClass} text-xs truncate">Vehicle #${instanceNumber}</span>${standbyBadge}`
    : `<span class="font-outfit font-black ${titleAccentClass} text-xs truncate">Vehicle #${instanceNumber}</span>${standbyBadge}`;

  const textMutedClass = isInactive ? "text-slate-500" : "text-slate-400";

  return `
    <div data-bus-id="${v.bus_id}" class="vehicle-card p-3 border rounded-xl flex flex-col space-y-2 cursor-pointer transition-all duration-300 ${borderClass}">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2 flex-1 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background-color: ${dotColor}"></span>
          ${titleText}
        </div>
        ${badgeHtml}
      </div>
      <div class="flex items-center justify-between text-[10px]">
        <span class="${textMutedClass} truncate max-w-[200px]">${nextStopLabel} ${nextStopName}</span>
        <span class="font-bold ${etaColorClass} font-mono shrink-0 ml-2">${v.eta}</span>
      </div>
    </div>
  `;
}

// Helper to render vehicles nested by Route and travel Direction inside search categories
function renderNestedGroup(vehicles, matchedStopName, isArriving) {
  // Group by routeCode
  const groups = {};
  vehicles.forEach(v => {
    const routeCode = v.bus_id.split('-')[0];
    if (!groups[routeCode]) {
      groups[routeCode] = {
        routeCode: routeCode,
        serviceName: v.name,
        routeName: v.route_name,
        vehicles: []
      };
    }
    groups[routeCode].vehicles.push(v);
  });
  
  // Sort route codes numerically/alphabetically
  const sortedRouteCodes = Object.keys(groups).sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) return numA - numB;
    }
    return a.localeCompare(b);
  });
  
  if (sortedRouteCodes.length === 0) {
    return `<div class="text-[10px] text-slate-500 italic px-2 py-1 select-none">No active vehicles serving this area</div>`;
  }
  
  return sortedRouteCodes.map(routeCode => {
    const group = groups[routeCode];
    const color = ROUTE_COLORS[routeCode] || "#94a3b8";
    const dropdownId = (isArriving ? "arriving" : "other") + "-dropdown-" + routeCode;
    const isExpanded = !!expandedRoutes[dropdownId];
    
    // Split route name into Origin and Destination
    const parts = group.routeName.split("->");
    const origin = parts[0] ? parts[0].trim() : "Origin";
    const dest = parts[1] ? parts[1].trim() : "Destination";
    
    // Separate into UP and DOWN
    const upVehicles = group.vehicles.filter(v => (v.direction || "FORWARD") === "FORWARD");
    const downVehicles = group.vehicles.filter(v => (v.direction || "FORWARD") === "REVERSE");
    
    let routeHtml = `
      <div class="search-route-group mb-3 bg-slate-900/10 border border-slate-900/40 rounded-xl p-2.5 space-y-2">
        <div class="search-route-header flex items-center justify-between cursor-pointer hover:bg-slate-900/25 transition-all duration-300 rounded-lg p-1.5 min-w-0" data-route-code="${routeCode}" data-dropdown-id="${dropdownId}" data-vehicle-ids="${group.vehicles.map(v => v.bus_id).join(',')}">
          <div class="flex items-center space-x-2 min-w-0">
            <span class="px-2 py-0.5 rounded-md text-[9px] font-black text-white shrink-0 select-none" style="background-color: ${color}; box-shadow: 0 0 6px ${color}50;">
              ${routeCode}
            </span>
            <span class="font-outfit font-bold text-xs text-slate-200 truncate">${group.serviceName}</span>
          </div>
          <svg class="search-chevron w-3.5 h-3.5 text-slate-400 transform transition-transform duration-200 shrink-0 ml-1.5 ${isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div id="${dropdownId}" class="search-route-content ${isExpanded ? '' : 'hidden'} pl-1 space-y-2">
    `;
    
    // Render UP corridor
    if (upVehicles.length > 0) {
      const upHeader = isArriving 
        ? `🔼 UP ROUTE CORRIDOR <span class="text-slate-600 font-medium font-sans">(${origin} ➔ ${dest})</span>`
        : `🔼 UP ROUTE CORRIDOR <span class="text-slate-600 font-medium font-sans">(Passed this stop)</span>`;
      
      routeHtml += `
        <div class="pl-1">
          <h5 class="text-[8px] font-black text-orange-400/90 tracking-wider mb-1.5 uppercase select-none">
            ${upHeader}
          </h5>
          <div class="space-y-1.5">
      `;
      routeHtml += upVehicles.map(v => renderVehicleCard(v, color, false)).join('');
      routeHtml += `
          </div>
        </div>
      `;
    }
    
    // Render DOWN corridor
    if (downVehicles.length > 0) {
      const downHeader = isArriving 
        ? `🔽 DOWN ROUTE CORRIDOR <span class="text-slate-600 font-medium font-sans">(${dest} ➔ ${origin})</span>`
        : `🔽 DOWN ROUTE CORRIDOR <span class="text-slate-600 font-medium font-sans">(Passed this stop)</span>`;
        
      routeHtml += `
        <div class="pl-1 pt-1">
          <h5 class="text-[8px] font-black text-blue-400/90 tracking-wider mb-1.5 uppercase select-none">
            ${downHeader}
          </h5>
          <div class="space-y-1.5">
      `;
      routeHtml += downVehicles.map(v => renderVehicleCard(v, color, false)).join('');
      routeHtml += `
          </div>
        </div>
      `;
    }
    
    routeHtml += `
        </div>
      </div>
    `;
    return routeHtml;
  }).join('');
}

// Helper to attach direct click listeners to rendered vehicle cards and search route headers
function attachVehicleCardListeners() {
  const cards = fleetList.querySelectorAll('.vehicle-card');
  cards.forEach(card => {
    const busId = card.getAttribute('data-bus-id');
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      selectSingleVehicle(busId);
    });
  });

  const searchHeaders = fleetList.querySelectorAll('.search-route-header');
  searchHeaders.forEach(header => {
    const routeCode = header.getAttribute('data-route-code');
    const dropdownId = header.getAttribute('data-dropdown-id');
    const vehicleIdsStr = header.getAttribute('data-vehicle-ids');
    const vehicleIds = vehicleIdsStr ? vehicleIdsStr.split(',') : [];
    
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const isCurrentlyExpanded = !!expandedRoutes[dropdownId];
      expandedRoutes[dropdownId] = !isCurrentlyExpanded;
      
      selectedVehicleId = null; // Clear single vehicle isolation
      
      if (isCurrentlyExpanded) {
        selectedRouteCode = null;
        activeIsolatedBusIds = null;
      } else {
        selectedRouteCode = routeCode;
        activeIsolatedBusIds = vehicleIds.length > 0 ? vehicleIds : null;
        expandedRoutes[dropdownId] = true;
      }
      
      // Manually toggle target in DOM using unique prefixed ID
      const targetEl = document.getElementById(dropdownId);
      if (targetEl) {
        targetEl.classList.toggle('hidden');
        const chevron = header.querySelector('.search-chevron');
        if (targetEl.classList.contains('hidden')) {
          if (chevron) chevron.classList.remove('rotate-90');
        } else {
          if (chevron) chevron.classList.add('rotate-90');
        }
      }
      
      updateIsolationUI();
      drawRoutes();
      updateMapMarkers(vehiclesData);
      updateFleetList();
    });
  });
}

// Build and filter the sidebar fleet list
function updateFleetList() {
  const activeVehicles = vehiclesData.filter(v => v.active !== false);
  const inactiveVehicles = vehiclesData.filter(v => v.active === false);

  const filtered = activeVehicles.filter(v => {
    const query = searchQuery.trim().toLowerCase();
    
    // If search query is empty, display all active buses (respecting only status filters)
    if (!query) {
      let matchesStatus = true;
      if (statusFilter === "ontime") matchesStatus = v.status === "On Time";
      if (statusFilter === "delayed") matchesStatus = v.status === "Delayed";
      return matchesStatus;
    }
    
    // 1. Match Bus Number/ID (e.g. "10K") or Bus Service Name (e.g. "10K Metro Express")
    const matchesName = v.bus_id.toLowerCase().includes(query) || 
                        v.name.toLowerCase().includes(query);
                        
    // 2. Match Route / Origin / Destination (e.g. "RTC Complex -> Kailasagiri")
    const matchesRoute = v.route_name.toLowerCase().includes(query);
    
    // 3. Match any of the intermediate stops (e.g. "Jagadamba Junction")
    const matchesStops = v.stops.some(stop => stop.name.toLowerCase().includes(query));
    
    const matchesSearch = matchesName || matchesRoute || matchesStops;
    
    let matchesStatus = true;
    if (statusFilter === "ontime") matchesStatus = v.status === "On Time";
    if (statusFilter === "delayed") matchesStatus = v.status === "Delayed";
    
    return matchesSearch && matchesStatus;
  });

  const filteredInactive = inactiveVehicles.filter(v => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      if (statusFilter !== "all") return false;
      return true;
    }
    const matchesName = v.bus_id.toLowerCase().includes(query) || 
                        v.name.toLowerCase().includes(query);
    const matchesRoute = v.route_name.toLowerCase().includes(query);
    const matchesStops = v.stops.some(stop => stop.name.toLowerCase().includes(query));
    return matchesName || matchesRoute || matchesStops;
  });

  const activeFilteredCount = filtered.filter(v => !isBusStationStandby(v)).length;
  filteredCount.innerText = `${activeFilteredCount} bus${activeFilteredCount !== 1 ? 'es' : ''}`;
  
  const query = searchQuery.trim().toLowerCase();
  
  // Detect if the query matches a stop name of any vehicle
  let isStopSearch = false;
  let matchedStopName = "";
  
  if (query) {
    for (let v of vehiclesData) {
      const stop = v.stops.find(s => s.name.toLowerCase().includes(query));
      if (stop) {
        isStopSearch = true;
        matchedStopName = stop.name;
        break;
      }
    }
  }

  // Group inactive vehicles by routeCode
  const inactiveGroups = {};
  filteredInactive.forEach(v => {
    const routeCode = v.bus_id.split('-')[0];
    if (!inactiveGroups[routeCode]) {
      inactiveGroups[routeCode] = {
        routeCode: routeCode,
        routeName: v.route_name,
        serviceName: v.name,
        vehicles: []
      };
    }
    inactiveGroups[routeCode].vehicles.push(v);
  });
  
  const sortedInactiveRouteCodes = Object.keys(inactiveGroups).sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) return numA - numB;
    }
    return a.localeCompare(b);
  });

  if (isStopSearch) {
    const arrivingVehicles = [];
    const otherVehicles = [];
    
    filtered.forEach(v => {
      if (isBusStationStandby(v)) return; // Exclude standby buses from search results dropdowns
      const s = v.stops.find(stop => stop.name.toLowerCase().includes(query));
      if (s) {
        const direction = v.direction || "FORWARD";
        let isUpcoming = false;
        if (direction === "FORWARD") {
          isUpcoming = v.route_index < s.route_index;
        } else {
          isUpcoming = v.route_index > s.route_index;
        }
        
        if (isUpcoming) {
          arrivingVehicles.push(v);
        } else {
          otherVehicles.push(v);
        }
      }
    });
    
    let listHtml = "";
    
    // Category 1: Available Buses to [Searched Area]
    listHtml += `
      <div class="mb-4">
        <h3 class="text-xs font-bold text-sky-400 tracking-wider mb-2.5 flex items-center gap-1.5 uppercase select-none px-1 font-outfit">
          📍 Available Buses to ${matchedStopName}
        </h3>
        <div class="space-y-2">
          ${renderNestedGroup(arrivingVehicles, matchedStopName, true)}
        </div>
      </div>
    `;
    
    // Category 2: Other Buses to [Searched Area]
    listHtml += `
      <div class="mb-4">
        <h3 class="text-xs font-bold text-slate-400 tracking-wider mb-2.5 flex items-center gap-1.5 uppercase select-none px-1 font-outfit">
          🔄 Other Buses to ${matchedStopName}
        </h3>
        <div class="space-y-2">
          ${renderNestedGroup(otherVehicles, matchedStopName, false)}
        </div>
      </div>
    `;
    
    listHtml += renderInactiveDepotFleetSection(inactiveGroups, sortedInactiveRouteCodes);
    
    fleetList.innerHTML = listHtml;
    attachVehicleCardListeners();
    return;
  }
  
  if (filtered.length === 0 && sortedInactiveRouteCodes.length === 0) {
    fleetList.innerHTML = `<div class="text-xs text-slate-500 text-center py-6">No matching buses found</div>`;
    return;
  }
  
  // Group active vehicles by routeCode
  const groups = {};
  filtered.forEach(v => {
    const routeCode = v.bus_id.split('-')[0];
    if (!groups[routeCode]) {
      groups[routeCode] = {
        routeCode: routeCode,
        routeName: v.route_name,
        serviceName: v.name,
        vehicles: []
      };
    }
    groups[routeCode].vehicles.push(v);
  });
  
  // Sort route codes numerically/alphabetically
  const sortedRouteCodes = Object.keys(groups).sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) return numA - numB;
    }
    return a.localeCompare(b);
  });
  
  const isSearching = searchQuery.trim() !== "";
  
  let listHtml = sortedRouteCodes.map(routeCode => {
    const group = groups[routeCode];
    const isExpanded = isSearching || !!expandedRoutes[routeCode];
    const totalBuses = group.vehicles.filter(v => !isBusStationStandby(v)).length;
    const color = ROUTE_COLORS[routeCode] || "#94a3b8";
    
    // Split route name into Origin and Destination
    const parts = group.routeName.split("->");
    const origin = parts[0] ? parts[0].trim() : "Origin";
    const dest = parts[1] ? parts[1].trim() : "Destination";
    
    // Separate into UP and DOWN direction arrays
    const upVehicles = group.vehicles.filter(v => (v.direction || "FORWARD") === "FORWARD");
    const downVehicles = group.vehicles.filter(v => (v.direction || "FORWARD") === "REVERSE");
    
    let groupHtml = `
      <div class="mb-3 bg-slate-950/20 border border-slate-900/60 rounded-2xl overflow-hidden shadow-md">
        <div onclick="toggleRouteExpand('${routeCode}')" class="p-3 bg-slate-900/30 hover:bg-slate-900/60 flex items-center justify-between cursor-pointer transition-all duration-300 border-b border-slate-900/40">
          <div class="flex items-center space-x-3 min-w-0">
            <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black tracking-wider text-white select-none shrink-0" style="background-color: ${color}; box-shadow: 0 0 10px ${color}80;">
              ${routeCode}
            </span>
            <div class="flex flex-col min-w-0">
              <span class="font-outfit font-bold text-xs text-slate-200 truncate">${group.serviceName}</span>
              <span class="text-[9px] text-slate-400 truncate">${origin} ➔ ${dest}</span>
            </div>
          </div>
          <div class="flex items-center space-x-2.5 shrink-0">
            <span class="text-[9px] text-slate-500 font-bold bg-slate-950/50 px-2 py-0.5 rounded-full border border-slate-900/30">
              ${totalBuses} Active
            </span>
            <svg class="w-3.5 h-3.5 text-slate-400 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
    `;
    
    if (isExpanded) {
      groupHtml += `<div class="p-2.5 space-y-3 bg-slate-950/10">`;
      
      if (upVehicles.length > 0) {
        groupHtml += `
          <div>
            <h4 class="text-[9px] font-bold text-orange-400 tracking-wider mb-2 flex items-center gap-1.5 uppercase select-none px-1">
              🔼 UP ROUTE CORRIDOR <span class="text-slate-500 font-semibold font-sans">(${origin} ➔ ${dest})</span>
            </h4>
            <div class="space-y-2">
        `;
        groupHtml += upVehicles.map(v => renderVehicleCard(v, color)).join('');
        groupHtml += `
            </div>
          </div>
        `;
      }
      
      if (downVehicles.length > 0) {
        groupHtml += `
          <div>
            <h4 class="text-[9px] font-bold text-blue-400 tracking-wider mb-2 flex items-center gap-1.5 uppercase select-none px-1">
              🔽 DOWN ROUTE CORRIDOR <span class="text-slate-500 font-semibold font-sans">(${dest} ➔ ${origin})</span>
            </h4>
            <div class="space-y-2">
        `;
        groupHtml += downVehicles.map(v => renderVehicleCard(v, color)).join('');
        groupHtml += `
            </div>
          </div>
        `;
      }
      
      groupHtml += `</div>`;
    }
    
    groupHtml += `</div>`;
    return groupHtml;
  }).join('');
  
  listHtml += renderInactiveDepotFleetSection(inactiveGroups, sortedInactiveRouteCodes);
  
  fleetList.innerHTML = listHtml;
  attachVehicleCardListeners();
}

function renderInactiveDepotFleetSection(inactiveGroups, sortedInactiveRouteCodes) {
  if (sortedInactiveRouteCodes.length === 0) return "";
  
  const isSearching = searchQuery.trim() !== "";
  
  let html = `
    <div class="mt-6 border-t border-slate-800/80 pt-4">
      <h3 class="text-xs font-bold text-slate-500 tracking-wider mb-3 flex items-center gap-1.5 uppercase select-none px-1 font-outfit">
        Inactive Depot Fleet
      </h3>
      <div class="space-y-3">
  `;
  
  html += sortedInactiveRouteCodes.map(routeCode => {
    const group = inactiveGroups[routeCode];
    const isExpanded = isSearching || !!expandedRoutes[routeCode];
    const color = "#64748b"; // Dimmed color for inactive
    const depotName = DEPOT_NAMES[routeCode] || "Depot";
    
    // Split route name into Origin and Destination
    const parts = group.routeName.split("->");
    const origin = parts[0] ? parts[0].trim() : "Origin";
    const dest = parts[1] ? parts[1].trim() : "Destination";
    
    let groupHtml = `
      <div class="mb-3 bg-slate-950/10 border border-slate-900/40 rounded-2xl overflow-hidden opacity-60 hover:opacity-85 transition-opacity duration-300">
        <div onclick="toggleRouteExpand('${routeCode}')" class="p-3 bg-slate-900/10 hover:bg-slate-900/30 flex items-center justify-between cursor-pointer transition-all duration-300 border-b border-slate-900/20">
          <div class="flex items-center space-x-3 min-w-0">
            <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black text-white select-none shrink-0" style="background-color: ${color}; box-shadow: 0 0 6px ${color}30;">
              ${routeCode}
            </span>
            <span class="px-1.5 py-0.5 rounded bg-slate-900 text-[8px] font-bold text-slate-500 border border-slate-800/50 uppercase select-none shrink-0">
              [${depotName}]
            </span>
            <div class="flex flex-col min-w-0">
              <span class="font-outfit font-bold text-xs text-gray-500 truncate">${group.serviceName}</span>
              <span class="text-[9px] text-gray-500 truncate">${origin} ➔ ${dest}</span>
            </div>
          </div>
          <div class="flex items-center space-x-2.5 shrink-0">
            <span class="text-[9px] text-gray-500 font-bold bg-slate-950/30 px-2 py-0.5 rounded-full border border-slate-900/20">
              Off-Duty
            </span>
            <svg class="search-chevron w-3.5 h-3.5 text-slate-500 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
    `;
    
    if (isExpanded) {
      groupHtml += `<div class="p-2.5 space-y-3 bg-slate-950/5">`;
      // Render inactive cards
      groupHtml += group.vehicles.map(v => renderVehicleCard(v, color)).join('');
      groupHtml += `</div>`;
    }
    
    groupHtml += `</div>`;
    return groupHtml;
  }).join('');
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}


// Show Warning Toast alerts
let activeDelayToasts = new Set();
let toastTimeoutId = null;

function handleToastAlerts(vehicles) {
  const stalledBuses = vehicles.filter(v => v.status === "Delayed");
  
  if (stalledBuses.length > 0) {
    const listNames = stalledBuses.map(b => b.name).join(', ');
    const msg = `Delay Alert: ${listNames} stalled on route due to traffic!`;
    
    const currentStalledIds = stalledBuses.map(b => b.bus_id).join('-');
    if (!activeDelayToasts.has(currentStalledIds)) {
      activeDelayToasts.clear();
      activeDelayToasts.add(currentStalledIds);
      
      toastMessage.innerText = msg;
      
      // Smooth fade-in / slide-down transition
      toastContainer.classList.remove('opacity-0', '-translate-y-20', 'pointer-events-none');
      toastContainer.classList.add('opacity-100', 'translate-y-0');
      
      // Set/Reset 15000ms auto-dismiss timer
      if (toastTimeoutId) {
        clearTimeout(toastTimeoutId);
      }
      toastTimeoutId = setTimeout(() => {
        hideToast();
      }, 15000);
    }
  }
}

function hideToast() {
  // Smooth fade-out / slide-up transition
  toastContainer.classList.add('opacity-0', '-translate-y-20', 'pointer-events-none');
  toastContainer.classList.remove('opacity-100', 'translate-y-0');
  
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
}

// Update vehicle positions and icons on Leaflet
function updateMapMarkers(vehicles) {
  vehicles.forEach(v => {
    const routeCode = v.bus_id.split('-')[0];
    
    // Route / Vehicle / Active-isolated-ids isolation filter check
    if (activeIsolatedBusIds !== null) {
      if (!activeIsolatedBusIds.includes(v.bus_id)) {
        if (vehicleMarkers[v.bus_id]) {
          map.removeLayer(vehicleMarkers[v.bus_id]);
          delete vehicleMarkers[v.bus_id];
        }
        return;
      }
    } else if (selectedVehicleId !== null) {
      if (v.bus_id !== selectedVehicleId) {
        if (vehicleMarkers[v.bus_id]) {
          map.removeLayer(vehicleMarkers[v.bus_id]);
          delete vehicleMarkers[v.bus_id];
        }
        return;
      }
    } else if (selectedRouteCode !== null && routeCode !== selectedRouteCode) {
      if (vehicleMarkers[v.bus_id]) {
        map.removeLayer(vehicleMarkers[v.bus_id]);
        delete vehicleMarkers[v.bus_id];
      }
      return;
    }
    
    // Clear old active map marker when a vehicle transitions to inactive before redrawing
    if (v.active === false && vehicleMarkers[v.bus_id]) {
      map.removeLayer(vehicleMarkers[v.bus_id]);
      delete vehicleMarkers[v.bus_id];
    }

    let position = [v.lat, v.lon];
    const jLat = 17.7119;
    const jLon = 83.3023;
    const distToJ = haversineDistance(position, [jLat, jLon]);
    if (distToJ < 0.1) {
      position = [jLat, jLon];
    }
    
    // Coordinate jitter/offset logic for inactive buses sitting side-by-side inside shared depot yards
    if (v.active === false) {
      const parts = v.bus_id.split('-');
      const instance = parts[1] ? parseInt(parts[1], 10) : 1;
      const routeIndex = Object.keys(ROUTE_COLORS).indexOf(routeCode);
      const row = Math.floor((routeIndex * 3 + instance) / 5);
      const col = (routeIndex * 3 + instance) % 5;
      position[0] += (row - 2) * 0.00015;
      position[1] += (col - 2) * 0.00018;
    }
    
    if (!vehicleMarkers[v.bus_id]) {
      const marker = L.marker(position, {
        icon: getBusIcon(v)
      }).addTo(map);
      
      marker.on('click', () => {
        focusVehicle(v.bus_id, true);
      });
      
      vehicleMarkers[v.bus_id] = marker;
    } else {
      vehicleMarkers[v.bus_id].setLatLng(position);
      vehicleMarkers[v.bus_id].setIcon(getBusIcon(v));
    }
  });
}


// Establish WebSockets Connection
function connectWebSocket() {
  updateWSStatus('connecting');
  
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

ws = new WebSocket("wss://track-n-travel-backend.onrender.com/ws");

  ws.onopen = () => {
    updateWSStatus('connected');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'init') {
      routesData = data.routes;
      vehiclesData = data.vehicles;
      speedMultiplier = data.speed_multiplier;
      
      if (data.force_active_simulation !== undefined) {
        updateForceActiveUI(data.force_active_simulation);
      }
      
      updateSpeedSliderUI(speedMultiplier);
      ensureOSRMRoutes(vehiclesData);
      drawRoutes();
      updateMapMarkers(vehiclesData);
      
      if (focusedBusId) {
        focusVehicle(focusedBusId, false);
      } else if (vehiclesData.length > 0) {
        const bounds = L.featureGroup(Object.values(routePolylines)).getBounds();
        map.fitBounds(bounds, { padding: [40, 40] });
        updateFocusedCard();
      } else {
        updateFocusedCard();
      }
      
      calculateGlobalMetrics();
      updateFleetList();
    } 
    
    else if (data.type === 'telemetry_update') {
      vehiclesData = data.vehicles;
      speedMultiplier = data.speed_multiplier;
      
      if (data.force_active_simulation !== undefined) {
        updateForceActiveUI(data.force_active_simulation);
      }
      
      updateSpeedSliderUI(speedMultiplier);
      ensureOSRMRoutes(vehiclesData);
      updateMapMarkers(vehiclesData);
      handleToastAlerts(vehiclesData);
      
      calculateGlobalMetrics();
      updateFleetList();
      updateFocusedCard();
    }
  };

  ws.onclose = () => {
    updateWSStatus('disconnected');
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket Error:', err);
    ws.close();
  };
}

// Update speed slider input values
function updateSpeedSliderUI(multiplier) {
  let sliderVal = 1;
  if (multiplier === 2.0) sliderVal = 2;
  if (multiplier === 4.0) sliderVal = 3;
  
  speedSlider.value = sliderVal;
  speedLabel.innerText = `${multiplier}x`;
}

// Search and Filter Interactions
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  expandedRoutes = {}; // Collapse all search routes by default when query changes
  activeIsolatedBusIds = null; // Clear active isolation when search query changes
  selectedRouteCode = null; // Reset route level isolation
  updateIsolationUI();
  drawRoutes();
  updateMapMarkers(vehiclesData);
  updateFleetList();
});

function setFilterTab(tabId) {
  filterAll.className = 'flex-1 text-center py-1.5 rounded-lg font-bold text-slate-400 hover:text-slate-200 transition-all duration-300';
  filterOnTime.className = 'flex-1 text-center py-1.5 rounded-lg font-bold text-slate-400 hover:text-slate-200 transition-all duration-300';
  filterDelayed.className = 'flex-1 text-center py-1.5 rounded-lg font-bold text-slate-400 hover:text-slate-200 transition-all duration-300';
  
  if (tabId === 'all') {
    filterAll.className = 'flex-1 text-center py-1.5 rounded-lg font-bold text-sky-400 bg-sky-950/30 border border-sky-500/20 transition-all duration-300';
  } else if (tabId === 'ontime') {
    filterOnTime.className = 'flex-1 text-center py-1.5 rounded-lg font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 transition-all duration-300';
  } else if (tabId === 'delayed') {
    filterDelayed.className = 'flex-1 text-center py-1.5 rounded-lg font-bold text-red-400 bg-red-950/30 border border-red-500/20 transition-all duration-300';
  }
  
  statusFilter = tabId;
  updateFleetList();
}

filterAll.addEventListener('click', () => setFilterTab('all'));
filterOnTime.addEventListener('click', () => setFilterTab('ontime'));
filterDelayed.addEventListener('click', () => setFilterTab('delayed'));

dismissToastBtn.addEventListener('click', hideToast);

speedSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  let multiplier = 1.0;
  if (val === 2) multiplier = 2.0;
  if (val === 3) multiplier = 4.0;
  
  speedLabel.innerText = `${multiplier}x`;
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "set_speed",
      multiplier: multiplier
    }));
  }
});

if (closeFocusBtn) {
  closeFocusBtn.addEventListener('click', () => {
    focusedBusId = null;
    drawRoutes();
    updateFocusedCard();
    updateFleetList();
    updateMapMarkers(vehiclesData);
  });
}

// Recenter Button
recenterBtn.addEventListener('click', () => {
  if (focusedBusId && vehicleMarkers[focusedBusId]) {
    map.setView(vehicleMarkers[focusedBusId].getLatLng(), 14, { animate: true });
  } else {
    const bounds = L.featureGroup(Object.values(routePolylines)).getBounds();
    map.fitBounds(bounds, { padding: [40, 40] });
  }
});

function updateClock() {
  const options = {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const timeStr = formatter.format(new Date());
  const clockEl = document.getElementById('clock-time');
  if (clockEl) {
    clockEl.innerText = `${timeStr} IST`;
  }
}

let forceActiveState = false;

function updateForceActiveUI(isActive) {
  forceActiveState = isActive;
  const btn = document.getElementById('force-active-btn');
  const icon = document.getElementById('force-active-icon');
  const text = document.getElementById('force-active-text');
  
  if (!btn || !icon || !text) return;
  
  if (isActive) {
    btn.className = 'px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/20 text-[10px] font-bold text-emerald-400 flex items-center space-x-1.5 transition-all duration-300';
    icon.className = 'w-3.5 h-3.5 text-emerald-400';
    icon.setAttribute('data-lucide', 'shield-check');
    text.innerText = 'FORCE ACTIVE (24/7)';
  } else {
    btn.className = 'px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700 text-[10px] font-bold text-slate-400 flex items-center space-x-1.5 transition-all duration-300';
    icon.className = 'w-3.5 h-3.5 text-slate-500';
    icon.setAttribute('data-lucide', 'shield-alert');
    text.innerText = 'LIVE TIMETABLE';
  }
  lucide.createIcons();
}

// App Start
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  connectWebSocket();
  updateClock();
  setInterval(updateClock, 1000);
  
  const forceActiveBtn = document.getElementById('force-active-btn');
  if (forceActiveBtn) {
    forceActiveBtn.addEventListener('click', () => {
      const targetState = !forceActiveState;
      updateForceActiveUI(targetState);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "toggle_force_active",
          value: targetState
        }));
      }
    });
  }
});
