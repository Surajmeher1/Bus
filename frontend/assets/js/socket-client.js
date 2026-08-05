/**
 * Socket.IO Client Wrapper — Real-time Bus Tracking
 */

const SOCKET_URL = 'http://localhost:5000';

let socket = null;
const busMarkers    = {}; // { busId: L.Marker }
const busPositions  = {}; // { busId: {lat, lng} }
let   trackingMap   = null;

const SocketClient = {
  connect() {
    if (socket?.connected) return socket;
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
