/**
 * Socket.IO Client Wrapper — Real-time Bus Tracking
 */
/**
 * Resolves the Socket.IO server URL dynamically:
 * 1. window.__APP_CONFIG__.SOCKET_URL (if defined)
 * 2. If running via local file:// protocol -> http://localhost:5000
 * 3. If running on dev live-server (e.g. port 5500, 3000) -> http://localhost:5000
 * 4. Production or same-origin backend -> window.location.origin (e.g. https://your-domain.onrender.com)
 */
function resolveSocketUrl() {
  if (typeof window !== 'undefined' && window.__APP_CONFIG__ && window.__APP_CONFIG__.SOCKET_URL) {
    return window.__APP_CONFIG__.SOCKET_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.protocol === 'file:') {
      return 'http://localhost:5000';
    }
    const isDevPort = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      window.location.port && window.location.port !== '5000';
    if (isDevPort) {
      return 'http://localhost:5000';
    }
    return window.location.origin;
  }
  return 'http://localhost:5000';
}

const SOCKET_URL = resolveSocketUrl();

let socket = null;
const busMarkers    = {}; // { busId: L.Marker }
const busPositions  = {}; // { busId: {lat, lng} }
let   trackingMap   = null;

const SocketClient = {
  connect() {
    if (socket?.connected) return socket;
    if (typeof io === 'undefined') {
      console.warn('⚠️ Socket.IO client library not loaded; real-time socket tracking is standby.');
      return null;
    }
    socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket.id);
      document.dispatchEvent(new CustomEvent('socket:connected'));
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      document.dispatchEvent(new CustomEvent('socket:disconnected'));
    });

    socket.on('bus-location-update', (data) => {
      document.dispatchEvent(new CustomEvent('bus:location', { detail: data }));
      busPositions[data.bus_id] = { lat: data.latitude, lng: data.longitude };
      if (typeof BusMap !== 'undefined') BusMap.updateMarker(data);
    });

    socket.on('bus-status-change', (data) => {
      document.dispatchEvent(new CustomEvent('bus:status', { detail: data }));
    });

    socket.on('seat-update', (data) => {
      document.dispatchEvent(new CustomEvent('bus:seats', { detail: data }));
    });

    socket.on('admin:geofence-violation', (data) => {
      document.dispatchEvent(new CustomEvent('admin:geofence-violation', { detail: data }));
      if (typeof Toast !== 'undefined') {
        Toast.show(`⚠️ BUS AREA VIOLATION: Bus ${data.bus_number || data.bus_id} (${data.driver_name || 'Driver'}) is outside allowed operating area!`, 'error', 10000);
      }
    });

    socket.on('notification', (data) => {
      document.dispatchEvent(new CustomEvent('notification:new', { detail: data }));
      if (typeof Toast !== 'undefined') {
        const type = data.is_emergency ? 'error' : 'info';
        Toast.show(`${data.title}: ${data.message}`, type, 8000);
      }
    });

    return socket;
  },

  subscribeBus(busId) {
    socket?.emit('subscribe-bus', busId);
  },

  unsubscribeBus(busId) {
    socket?.emit('unsubscribe-bus', busId);
  },

  updateLocation(busId, lat, lng, speed = 0) {
    socket?.emit('update-location', { bus_id: busId, latitude: lat, longitude: lng, speed });
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
  },

  getSocket: () => socket,
};
