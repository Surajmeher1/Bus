/**
 * Leaflet Map Utilities — Bus Tracking Map
 */

const BusMap = {
  maps:     {},  // { mapId: L.Map }
  markers:  {},  // { busId: L.Marker }
  routes:   {},  // { routeId: L.Polyline }
  busIcons: {},

  createBusIcon(status = 'running') {
    const colors = {
      running:     '#22c55e',
      delayed:     '#f59e0b',
      maintenance: '#ef4444',
      cancelled:   '#6b7280',
      inactive:    '#94a3b8',
    };
    const color = colors[status] || colors.running;
    return L.divIcon({
      className: '',
      html: `
        <div style="
          background: ${color};
          width: 36px; height: 36px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
        ">
          <div style="
            transform: rotate(45deg);
            font-size: 14px;
            color: white;
          ">🚌</div>
        </div>
        <div style="
          background: ${color};
          border-radius: 50%;
          width: 8px; height: 8px;
          margin: -2px auto 0;
          opacity: 0.6;
        "></div>
      `,
      iconSize: [36, 46],
      iconAnchor: [18, 46],
      popupAnchor: [0, -50],
    });
  },

  createStopIcon() {
    return L.divIcon({
      className: '',
      html: `<div style="
        width: 14px; height: 14px;
        border-radius: 50%;
        background: #3b82f6;
        border: 3px solid white;
        box-shadow: 0 1px 6px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  },

  tileLayers: [],

  // ── Configurable Tile Provider Settings ─────────────────────────────────
  // Default: OSM HOT (Humanitarian OpenStreetMap Team: free, clean OSM tiles, no watermark, no 403)
  tileConfig: {
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank">OpenStreetMap France</a>',
    subdomains: 'abc',
    maxZoom: 19
  },

  async loadConfig() {
    try {
      let configData = null;
      if (typeof ConfigAPI !== 'undefined' && ConfigAPI.getAppConfig) {
        configData = await ConfigAPI.getAppConfig();
      } else if (typeof fetch === 'function') {
        const base = (typeof API_URL !== 'undefined') ? API_URL : '';
        const res = await fetch(`${base}/api/v1/config/app`);
        if (res.ok) {
          configData = await res.json();
        }
      }
      if (configData && configData.map && configData.map.tile_url) {
        const newUrl = configData.map.tile_url;
        const oldUrl = this.tileConfig.url;
        this.tileConfig = {
          url: newUrl,
          attribution: configData.map.attribution || this.tileConfig.attribution,
          subdomains: configData.map.subdomains || 'abc',
          maxZoom: configData.map.max_zoom || 19
        };
        if (newUrl !== oldUrl && this.tileLayers && this.tileLayers.length > 0) {
          this.tileLayers.forEach(layer => {
            if (layer && typeof layer.setUrl === 'function') {
              layer.setUrl(newUrl);
            }
          });
        }
      }
    } catch (_) {
      // Retain robust default
    }
  },

  // Graceful fallback UI on tile load failure
  showFallback(map, message = 'Map temporarily unavailable') {
    if (!map) return;
    const container = typeof map.getContainer === 'function' ? map.getContainer() : null;
    if (!container || container.querySelector('.map-fallback-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'map-fallback-banner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = `
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: rgba(15, 23, 42, 0.90);
      backdrop-filter: blur(8px);
      color: #f8fafc;
      padding: 6px 16px;
      border-radius: 99px;
      font-size: 0.75rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.3);
      border: 1px solid rgba(239, 68, 68, 0.45);
      pointer-events: none;
    `;
    banner.innerHTML = `<span style="color:#ef4444;font-size:0.875rem;">⚠️</span> <span>${message}</span>`;
    container.appendChild(banner);
  },

  // Factory to create configured Leaflet tile layer with error monitoring
  createTileLayer(options = {}) {
    const cfg = this.tileConfig || {};
    const url = options.url || cfg.url || 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';
    const subdomains = options.subdomains || cfg.subdomains || 'abc';
    const attribution = options.attributionControl === false ? '' : (options.attribution || cfg.attribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank">OpenStreetMap France</a>');
    const maxZoom = options.maxZoom || cfg.maxZoom || 19;

    const layerOptions = {
      subdomains,
      maxZoom,
      attribution,
      ...options
    };

    const layer = L.tileLayer(url, layerOptions);
    this.tileLayers.push(layer);

    let consecutiveErrors = 0;
    layer.on('tileerror', () => {
      consecutiveErrors++;
      if (consecutiveErrors >= 3 && layer._map) {
        this.showFallback(layer._map, 'Map temporarily unavailable');
      }
    });

    layer.on('tileload', () => {
      if (consecutiveErrors > 0) consecutiveErrors--;
    });

    return layer;
  },

  init(containerId, options = {}) {
    const defaults = {
      center: [19.0435, 83.8138], // Gunupur, Odisha default
      zoom: 14,
      zoomControl: true,
    };
    const map = L.map(containerId, { ...defaults, ...options });

    const tileLayer = this.createTileLayer(options.tileOptions || {});
    tileLayer.addTo(map);

    this.maps[containerId] = map;
    return map;
  },

  addBusMarker(map, bus) {
    const icon = this.createBusIcon(bus.status);
    const occupancyPct = bus.capacity ? Math.round(((bus.capacity - bus.available_seats) / bus.capacity) * 100) : 0;
    const marker = L.marker([bus.current_latitude, bus.current_longitude], { icon })
      .bindPopup(`
        <div style="min-width:180px; font-family: Inter, sans-serif;">
          <div style="font-weight:800; font-size:1rem; color:#1e3a8a; margin-bottom:8px;">🚌 ${bus.bus_number || bus.bus_id}</div>
          <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Route: ${bus.route_name || 'N/A'}</div>
          <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Driver: ${bus.driver_name || 'N/A'}</div>
          <div style="font-size:0.8rem; color:#64748b; margin-bottom:8px;">Speed: ${Math.round(bus.current_speed || 0)} km/h</div>
          <div style="background:#f1f5f9; border-radius:8px; padding:8px;">
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;">
              <span>Occupancy</span><span>${occupancyPct}%</span>
            </div>
            <div style="height:6px; background:#e2e8f0; border-radius:3px;">
              <div style="height:100%; width:${occupancyPct}%; background:${occupancyPct > 80 ? '#ef4444' : occupancyPct > 50 ? '#f59e0b' : '#22c55e'}; border-radius:3px;"></div>
            </div>
          </div>
          <div style="margin-top:8px; text-align:center;">
            <span style="
              background:${bus.status === 'running' ? '#dcfce7' : bus.status === 'delayed' ? '#fef3c7' : '#fee2e2'};
              color:${bus.status === 'running' ? '#15803d' : bus.status === 'delayed' ? '#b45309' : '#b91c1c'};
              padding:2px 10px; border-radius:99px; font-size:0.75rem; font-weight:600;
            ">${bus.status?.toUpperCase() || 'UNKNOWN'}</span>
          </div>
        </div>
      `)
      .addTo(map);

    this.markers[bus.bus_id] = marker;
    return marker;
  },

  updateMarker(data) {
    const marker = this.markers[data.bus_id];
    if (!marker) return;

    // Smooth animation to new position
    const currentLatLng = marker.getLatLng();
    const newLatLng = L.latLng(data.latitude, data.longitude);

    // Animate marker movement
    this._animateMarker(marker, currentLatLng, newLatLng, 1500);

    // Update popup content
    const occupancyPct = data.capacity ? Math.round(((data.capacity - data.available_seats) / data.capacity) * 100) : 0;
    marker.setPopupContent(`
      <div style="min-width:180px; font-family:Inter,sans-serif;">
        <div style="font-weight:800; font-size:1rem; color:#1e3a8a; margin-bottom:6px;">🚌 ${data.bus_number || 'BUS'}</div>
        <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Speed: ${data.speed || 0} km/h</div>
        <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Seats: ${data.available_seats || 0} / ${data.capacity || 0}</div>
        ${data.eta?.length ? `<div style="font-size:0.8rem; color:#64748b;">Next stop ETA: ~${data.eta[0]?.eta_minutes || '?'} min</div>` : ''}
        <div style="font-size:0.7rem; color:#94a3b8; margin-top:6px;">${new Date(data.timestamp).toLocaleTimeString()}</div>
      </div>
    `);
  },

  _animateMarker(marker, from, to, duration) {
    const start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease in-out
      marker.setLatLng([
        from.lat + (to.lat - from.lat) * eased,
        from.lng + (to.lng - from.lng) * eased,
      ]);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  },

  drawRoute(map, stops, routeId) {
    if (this.routes[routeId]) {
      this.routes[routeId].remove();
    }
    const latlngs = stops.map(s => [s.latitude, s.longitude]);
    const polyline = L.polyline(latlngs, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.7,
      dashArray: '8, 6',
    }).addTo(map);
    this.routes[routeId] = polyline;

    // Add stop markers
    stops.forEach((stop, idx) => {
      L.marker([stop.latitude, stop.longitude], { icon: this.createStopIcon() })
        .bindTooltip(`<b>${idx + 1}. ${stop.stop_name}</b>`, { permanent: false, direction: 'top' })
        .addTo(map);
    });

    return polyline;
  },

  fitToBuses(map) {
    const markerList = Object.values(this.markers);
    if (markerList.length > 0) {
      const group = L.featureGroup(markerList);
      map.fitBounds(group.getBounds().pad(0.15));
    }
  },

  clearMarkers() {
    Object.values(this.markers).forEach(m => m.remove());
    this.markers = {};
  },
};

// Automatically fetch map tile configuration from backend
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      BusMap.loadConfig();
    });
  } else {
    BusMap.loadConfig();
  }
}
