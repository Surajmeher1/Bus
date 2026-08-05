const BusModel = require('../models/busModel');
const RouteModel = require('../models/routeModel');

/**
 * GPS Simulation: buses move step-by-step along their route's bus stops.
 * Each interval, each active bus moves a small increment toward the next stop.
 */

const busSimState = {}; // { busId: { stopIndex, progress } }

function interpolate(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function haversineDistance(a, b) {
  const R = 6371e3;
  const φ1 = a.lat * Math.PI / 180;
  const φ2 = b.lat * Math.PI / 180;
  const Δφ = (b.lat - a.lat) * Math.PI / 180;
  const Δλ = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function calculateETA(currentLat, currentLng, stopLat, stopLng, speedKmh = 30) {
  const dist = haversineDistance(
    { lat: currentLat, lng: currentLng },
    { lat: stopLat, lng: stopLng }
  );
  const hours = dist / 1000 / speedKmh;
  return Math.round(hours * 60); // minutes
}

module.exports = function setupTrackingSocket(io) {
  const trackingNs = io.of('/');

  trackingNs.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Client joins a bus room to get targeted updates
    socket.on('subscribe-bus', (busId) => {
      socket.join(`bus-${busId}`);
      console.log(`   ↳ Subscribed to bus-${busId}`);
    });

    socket.on('unsubscribe-bus', (busId) => {
      socket.leave(`bus-${busId}`);
    });

    // Manager manually updates bus location
    socket.on('update-location', ({ bus_id, latitude, longitude, speed }) => {
      try {
        BusModel.updateLocation(bus_id, latitude, longitude, speed || 0);
        io.to(`bus-${bus_id}`).emit('bus-location-update', {
          bus_id, latitude, longitude, speed: speed || 0,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  // GPS Simulation loop
  const interval = parseInt(process.env.GPS_SIMULATION_INTERVAL) || 3000;

  setInterval(() => {
    try {
      const buses = BusModel.findAll().filter(b => b.status === 'running' && b.route_id);

      buses.forEach(bus => {
        const stops = RouteModel.getStops(bus.route_id);
        if (!stops || stops.length < 2) return;

        // Initialize simulation state
        if (!busSimState[bus.bus_id]) {
          busSimState[bus.bus_id] = { stopIndex: 0, progress: 0 };
        }

        const state = busSimState[bus.bus_id];
        const fromStop = stops[state.stopIndex];
        const toStop = stops[state.stopIndex + 1] || stops[0];

        // Advance progress
        state.progress += 0.05 + Math.random() * 0.05; // 5-10% per tick

        if (state.progress >= 1) {
          state.progress = 0;
          state.stopIndex = (state.stopIndex + 1) % (stops.length - 1);
        }

        const pos = interpolate(
          { lat: fromStop.latitude, lng: fromStop.longitude },
          { lat: toStop.latitude, lng: toStop.longitude },
          state.progress
        );

        const speed = 25 + Math.random() * 15; // 25-40 km/h
        BusModel.updateLocation(bus.bus_id, pos.lat, pos.lng, speed);

        // Calculate ETA to next stops
        const etaData = stops.slice(state.stopIndex + 1).map((stop, i) => ({
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          eta_minutes: calculateETA(pos.lat, pos.lng, stop.latitude, stop.longitude, speed) + i * 3
        }));

        const payload = {
          bus_id: bus.bus_id,
          bus_number: bus.bus_number,
          latitude: pos.lat,
          longitude: pos.lng,
          speed: Math.round(speed),
          status: bus.status,
          available_seats: bus.available_seats,
          capacity: bus.capacity,
          eta: etaData,
          timestamp: new Date().toISOString()
        };

        // Broadcast to all (for live map) and bus-specific room
        io.emit('bus-location-update', payload);
      });
    } catch (e) {
      // Simulation error — non-critical
    }
  }, interval);

  console.log(`Socket.IO tracking initialized (GPS simulation every ${interval}ms)`);
};
