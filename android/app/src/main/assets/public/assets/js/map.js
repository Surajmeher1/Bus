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
  // Primary: OpenStreetMap France CDN (100% free, zero API key, works cleanly on Desktop, Render & Mobile WebView)
  tileConfig: {
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    attribution: '&copy; OSM France &amp; <a href="https://www.openstreetmap.org/copyright">OSM contributors</a>',
    subdomains: 'abc',
    maxZoom: 19,
    maxNativeZoom: 19
  },
  // Tier-1 Backup: OpenStreetMap Germany CDN (zero referer block, rich detail up to z18)
  backupTileConfig: {
    url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: '',
    maxZoom: 19,
    maxNativeZoom: 18
  },
  // Tier-2 Backup: Esri World Street Map (ArcGIS global CDN)
  esriTileConfig: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN',
    subdomains: '',
    maxZoom: 19,
    maxNativeZoom: 17
  },

  async loadConfig() {
    try {
      let configData = null;
      if (typeof ConfigAPI !== 'undefined' && ConfigAPI.getAppConfig) {
        configData = await ConfigAPI.getAppConfig();
      } else if (typeof fetch === 'function') {
        const base = (typeof API_BASE !== 'undefined') ? API_BASE.replace(/\/api\/v1$/, '') : '';
        const res = await fetch(`${base}/api/v1/config/app`);
        if (res.ok) {
          configData = await res.json();
        }
      }
      if (configData && configData.map && configData.map.tile_url) {
        const newUrl = configData.map.tile_url;
        // Guard: ignore tile.openstreetmap.org (403 blocked placeholder tiles) and /hot/ (frequent z15-19 regional timeouts)
        if (newUrl.includes('tile.openstreetmap.org') || newUrl.includes('openstreetmap.fr/hot')) return;

        const oldUrl = this.tileConfig.url;
        this.tileConfig = {
          url: newUrl,
          attribution: configData.map.attribution || this.tileConfig.attribution,
          subdomains: configData.map.subdomains !== undefined ? configData.map.subdomains : '',
          maxZoom: configData.map.max_zoom || 19,
          maxNativeZoom: configData.map.max_native_zoom || 19
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
      cursor: pointer;
    `;
    banner.innerHTML = `<span style="color:#ef4444;font-size:0.875rem;">⚠️</span> <span>${message} (click to retry)</span>`;
    banner.onclick = () => {
      banner.remove();
      if (typeof map.invalidateSize === 'function') map.invalidateSize();
      const layers = this.tileLayers || [];
      layers.forEach(l => {
        if (l && typeof l.redraw === 'function') l.redraw();
      });
    };
    container.appendChild(banner);
  },

  hideFallback(map) {
    if (!map) return;
    const container = typeof map.getContainer === 'function' ? map.getContainer() : null;
    if (!container) return;
    const banner = container.querySelector('.map-fallback-banner');
    if (banner) banner.remove();
  },

  // Factory to create configured Leaflet tile layer with error monitoring & auto-recovery
  createTileLayer(options = {}) {
    const cfg = this.tileConfig || {};
    const url = options.url || cfg.url || 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';
    const subdomains = options.subdomains !== undefined ? options.subdomains : (cfg.subdomains !== undefined ? cfg.subdomains : 'abc');
    const attribution = options.attributionControl === false ? '' : (options.attribution || cfg.attribution || '&copy; OSM France &amp; <a href="https://www.openstreetmap.org/copyright">OSM contributors</a>');
    const maxZoom = options.maxZoom || cfg.maxZoom || 19;
    const maxNativeZoom = options.maxNativeZoom || cfg.maxNativeZoom || 19;

    const layerOptions = {
      subdomains,
      maxZoom,
      maxNativeZoom,
      attribution,
      ...options
    };

    const layer = L.tileLayer(url, layerOptions);
    this.tileLayers.push(layer);

    let consecutiveErrors = 0;
    let fallbackStage = 0; // 0 = primary, 1 = backupTileConfig (OSM DE), 2 = esriTileConfig

    layer.on('tileerror', () => {
      consecutiveErrors++;
      // Stage 1 Fallback: OSM Germany
      if (consecutiveErrors >= 4 && fallbackStage === 0) {
        fallbackStage = 1;
        consecutiveErrors = 0;
        const backup = this.backupTileConfig || {};
        layer.options.maxNativeZoom = backup.maxNativeZoom || 18;
        layer.setUrl(backup.url || 'https://tile.openstreetmap.de/{z}/{x}/{y}.png');
        return;
      }

      // Stage 2 Fallback: Esri World Street Map
      if (consecutiveErrors >= 4 && fallbackStage === 1) {
        fallbackStage = 2;
        consecutiveErrors = 0;
        const esri = this.esriTileConfig || {};
        layer.options.maxNativeZoom = esri.maxNativeZoom || 17;
        layer.setUrl(esri.url || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}');
        return;
      }

      // If final backup also fails repeatedly, show user-facing banner
      if (consecutiveErrors >= 8 && layer._map) {
        this.showFallback(layer._map, 'Map temporarily unavailable');
      }
    });

    layer.on('tileload', () => {
      consecutiveErrors = 0;
      if (layer._map) {
        this.hideFallback(layer._map);
      }
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

    // Auto-calibrate dimensions once container has stabilized
    setTimeout(() => {
      try {
        if (map && typeof map.invalidateSize === 'function') {
          map.invalidateSize();
        }
      } catch (_) {}
    }, 200);

    return map;
  },

  addBusMarker(map, bus) {
    if (!map) return null;
    const lat = bus.current_latitude ?? bus.latitude;
    const lng = bus.current_longitude ?? bus.longitude;
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;

    const busId = bus.bus_id;
    const mapId = (map._container && map._container.id) ? map._container.id : (Object.keys(this.maps).find(k => this.maps[k] === map) || 'default');
    if (!this.markers[mapId]) this.markers[mapId] = {};

    // If marker already exists on this map, update position & return
    if (this.markers[mapId][busId]) {
      this.markers[mapId][busId].setLatLng([lat, lng]);
      return this.markers[mapId][busId];
    }

    const icon = this.createBusIcon(bus.status || 'running');
    const occupancyPct = bus.capacity ? Math.round(((bus.capacity - (bus.available_seats ?? bus.capacity)) / bus.capacity) * 100) : 0;
    const marker = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
      .bindPopup(`
        <div style="min-width:180px; font-family: Inter, sans-serif;">
          <div style="font-weight:800; font-size:1rem; color:#1e3a8a; margin-bottom:8px;">🚌 ${bus.bus_number || bus.bus_id}</div>
          <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Route: ${bus.route_name || 'N/A'}</div>
          <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Driver: ${bus.driver_name || 'N/A'}</div>
          <div style="font-size:0.8rem; color:#64748b; margin-bottom:8px;">Speed: ${Math.round(bus.current_speed || bus.speed || 0)} km/h</div>
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
            ">${bus.status?.toUpperCase() || 'RUNNING'}</span>
          </div>
        </div>
      `)
      .addTo(map);

    this.markers[mapId][busId] = marker;
    marker._busStatus = bus.status || 'running';
    return marker;
  },

  updateMarker(data) {
    if (!data || data.latitude == null || data.longitude == null) return;
    const lat = parseFloat(data.latitude);
    const lng = parseFloat(data.longitude);
    if (isNaN(lat) || isNaN(lng) || (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)) return;

    const busId = data.bus_id;
    const newLatLng = L.latLng(lat, lng);
    const newStatus = data.status || 'running';

    Object.entries(this.maps).forEach(([mapId, map]) => {
      if (!map) return;
      if (!this.markers[mapId]) this.markers[mapId] = {};

      let marker = this.markers[mapId][busId];
      if (!marker) {
        marker = this.addBusMarker(map, { ...data, current_latitude: lat, current_longitude: lng, status: newStatus });
      } else {
        if (marker._busStatus !== newStatus) {
          marker.setIcon(this.createBusIcon(newStatus));
          marker._busStatus = newStatus;
        }
      }

      if (marker && marker._map) {
        const currentLatLng = marker.getLatLng();
        if (currentLatLng.distanceTo(newLatLng) > 5000) {
          if (marker._animFrame) cancelAnimationFrame(marker._animFrame);
          marker.setLatLng(newLatLng);
        } else {
          this._animateMarker(marker, currentLatLng, newLatLng, 1000);
        }

        const isOutside = data.tracking_status === 'OUTSIDE_AREA' || data.geofence_status === 'OUTSIDE_OPERATION_AREA';
        const statusPill = isOutside
          ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;">OUTSIDE ROUTE</span>`
          : `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;">LIVE GPS</span>`;

        marker.setPopupContent(`
          <div style="min-width:190px; font-family:Inter,sans-serif;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
              <div style="font-weight:800; font-size:1rem; color:#1e3a8a;">🚌 ${data.bus_number || 'BUS'}</div>
              ${statusPill}
            </div>
            ${data.route_name ? `<div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Route: ${data.route_name}</div>` : ''}
            <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Speed: ${Math.round(data.speed || 0)} km/h</div>
            <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Driver: ${data.driver_name || 'Assigned Driver'}</div>
            <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Seats: ${data.available_seats ?? 50} / ${data.capacity ?? 50}</div>
            ${data.next_stop ? `<div style="font-size:0.8rem; color:#16a34a; font-weight:600;">Next Stop: ${data.next_stop.stop_name || data.next_stop}</div>` : ''}
            <div style="font-size:0.7rem; color:#94a3b8; margin-top:6px;">${lat.toFixed(5)}, ${lng.toFixed(5)} &bull; ${new Date(data.timestamp || Date.now()).toLocaleTimeString()}</div>
          </div>
        `);
      }
    });
  },

  _animateMarker(marker, from, to, duration) {
    if (marker._animFrame) cancelAnimationFrame(marker._animFrame);
    const start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease in-out
      marker.setLatLng([
        from.lat + (to.lat - from.lat) * eased,
        from.lng + (to.lng - from.lng) * eased,
      ]);
      if (t < 1) {
        marker._animFrame = requestAnimationFrame(animate);
      } else {
        marker._animFrame = null;
      }
    };
    marker._animFrame = requestAnimationFrame(animate);
  },

  drawRoute(map, stops, routeId) {
    if (!map || !stops || !stops.length) return null;
    const mapId = (map._container && map._container.id) ? map._container.id : (Object.keys(this.maps).find(k => this.maps[k] === map) || 'default');
    const routeKey = `${mapId}_${routeId}`;

    if (this.routes[routeKey]) {
      const prev = this.routes[routeKey];
      if (prev.polyline && typeof prev.polyline.remove === 'function') prev.polyline.remove();
      if (Array.isArray(prev.stopMarkers)) {
        prev.stopMarkers.forEach(m => m && typeof m.remove === 'function' && m.remove());
      }
    }

    const latlngs = stops.map(s => [s.latitude, s.longitude]);
    const polyline = L.polyline(latlngs, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.75,
      dashArray: '8, 6',
    }).addTo(map);

    // Add stop markers
    const stopMarkers = stops.map((stop, idx) => {
      return L.marker([stop.latitude, stop.longitude], { icon: this.createStopIcon() })
        .bindTooltip(`<b>${idx + 1}. ${stop.stop_name}</b>`, { permanent: false, direction: 'top' })
        .addTo(map);
    });

    this.routes[routeKey] = { polyline, stopMarkers };
    return polyline;
  },

  fitToBuses(map, preferRunning = true) {
    if (!map) return;
    const mapId = (map._container && map._container.id) ? map._container.id : (Object.keys(this.maps).find(k => this.maps[k] === map) || 'default');
    const allMapMarkers = (this.markers[mapId] && typeof this.markers[mapId] === 'object')
      ? Object.values(this.markers[mapId])
      : [];
    const runningMarkers = allMapMarkers.filter(m => m && m._busStatus === 'running');
    const targetMarkers = (preferRunning && runningMarkers.length > 0) ? runningMarkers : allMapMarkers;

    if (targetMarkers.length > 0) {
      try {
        if (targetMarkers.length === 1) {
          map.setView(targetMarkers[0].getLatLng(), 15, { animate: true });
          return;
        }
        const group = L.featureGroup(targetMarkers);
        const bounds = group.getBounds();
        if (bounds && bounds.isValid()) {
          map.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
          return;
        }
      } catch (_) {}
    }
    if (typeof map.setView === 'function') {
      map.setView([19.0494, 83.8242], 14);
    }
  },

  clearMarkers(map) {
    if (map) {
      const mapId = (map._container && map._container.id) ? map._container.id : Object.keys(this.maps).find(k => this.maps[k] === map);
      if (this.markers[mapId]) {
        Object.values(this.markers[mapId]).forEach(m => m && typeof m.remove === 'function' && m.remove());
        delete this.markers[mapId];
      }
    } else {
      Object.values(this.markers).forEach(mapGroup => {
        if (mapGroup && typeof mapGroup === 'object') {
          Object.values(mapGroup).forEach(m => m && typeof m.remove === 'function' && m.remove());
        }
      });
      this.markers = {};
    }
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
