/**
 * geofenceService.js
 * Polygon geofence validation and violation monitoring for GIET Smart Bus System
 */
const db = require('../config/db');

class GeofenceService {
  /**
   * Ray-casting algorithm to test if a [lat, lng] point is inside a polygon
   * @param {number[]} point [lat, lng]
   * @param {number[][]} polygon [[lat, lng], [lat, lng], ...]
   * @returns {boolean}
   */
  isPointInPolygon(point, polygon) {
    if (!polygon || polygon.length < 3) return true; // Invalid polygon is not restrictive
    const [lat, lng] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      const intersect = ((yi > lng) !== (yj > lng)) &&
        (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Parse stored coordinates string into array of [lat, lng]
   */
  parseCoordinates(coordsJson) {
    try {
      const parsed = typeof coordsJson === 'string' ? JSON.parse(coordsJson) : coordsJson;
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return [];
  }

  /**
   * Validates if a bus location is within active operating areas
   * If violation detected: logs audit, creates notification, emits real-time alert
   */
  checkBusLocation({ busId, driverId, tripId, latitude, longitude, busNumber, driverName, io }) {
    try {
      const activeGeofences = db.prepare('SELECT * FROM geofences WHERE is_active = 1').all();
      if (!activeGeofences || activeGeofences.length === 0) {
        return { isInside: true, geofence: null };
      }

      let insideAny = false;
      let matchedGeofence = null;

      for (const gf of activeGeofences) {
        const poly = this.parseCoordinates(gf.coordinates);
        if (poly.length >= 3 && this.isPointInPolygon([latitude, longitude], poly)) {
          insideAny = true;
          matchedGeofence = gf;
          break;
        }
      }

      // Fetch last known valid position
      const bus = db.prepare('SELECT last_valid_latitude, last_valid_longitude, tracking_status FROM buses WHERE bus_id = ?').get(busId);
      const lastValidLat = bus?.last_valid_latitude || latitude;
      const lastValidLng = bus?.last_valid_longitude || longitude;

      if (!insideAny) {
        // VIOLATION: Outside operating area!
        const primaryGeofence = activeGeofences[0];
        const now = new Date();
        const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Insert violation audit record
        db.prepare(`
          INSERT INTO geofence_violations (
            bus_id, driver_id, trip_id, geofence_id, latitude, longitude,
            last_valid_lat, last_valid_lng, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OUTSIDE_OPERATION_AREA')
        `).run(busId, driverId || null, tripId || null, primaryGeofence?.geofence_id || null, latitude, longitude, lastValidLat, lastValidLng);

        // Update bus status
        db.prepare("UPDATE buses SET tracking_status = 'OUTSIDE_AREA' WHERE bus_id = ?").run(busId);

        // Increment violation count on trip if active
        if (tripId) {
          db.prepare('UPDATE trips SET violation_count = COALESCE(violation_count, 0) + 1, trip_state = ? WHERE trip_id = ?')
            .run('OUTSIDE_AREA', tripId);
        }

        // Create Admin Notification
        const notifTitle = '⚠️ BUS AREA VIOLATION';
        const notifMsg = `Bus: ${busNumber || 'BUS-' + busId} | Driver: ${driverName || 'Assigned Driver'} | Time: ${timeFormatted} | Status: Outside operating area`;

        // Check if a recent violation notification was created in the last 2 minutes to avoid spamming
        const recentNotif = db.prepare(`
          SELECT 1 FROM notifications
          WHERE is_emergency = 1 AND message LIKE ? AND datetime(created_at) >= datetime('now', '-2 minutes')
        `).get(`%Bus: ${busNumber || 'BUS-' + busId}%`);

        if (!recentNotif) {
          db.prepare(`
            INSERT INTO notifications (title, message, receiver_type, is_emergency)
            VALUES (?, ?, 'all', 1)
          `).run(notifTitle, notifMsg);
        }

        // Log to activity_logs
        db.prepare(`
          INSERT INTO activity_logs (user_type, user_id, action, details)
          VALUES ('system', ?, 'geofence_violation', ?)
        `).run(driverId || busId, `Bus ${busNumber || busId} moved outside operating area at (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);

        // Emit real-time violation event to admin and all users
        if (io) {
          io.emit('admin:geofence-violation', {
            bus_id: busId,
            bus_number: busNumber || `BUS-${busId}`,
            driver_id: driverId,
            driver_name: driverName,
            latitude,
            longitude,
            last_valid_latitude: lastValidLat,
            last_valid_longitude: lastValidLng,
            timestamp: now.toISOString(),
            status: 'OUTSIDE_OPERATION_AREA'
          });

          io.emit('bus:status-update', {
            bus_id: busId,
            bus_number: busNumber,
            status: 'OUTSIDE_AREA',
            trip_status: 'OUTSIDE OPERATING AREA',
            timestamp: now.toISOString()
          });
        }

        return {
          isInside: false,
          status: 'OUTSIDE_AREA',
          violation: {
            bus_id: busId,
            bus_number: busNumber,
            time: timeFormatted,
            latitude,
            longitude
          }
        };
      } else {
        // Inside geofence: If previously marked OUTSIDE_AREA, restore to LIVE
        if (bus?.tracking_status === 'OUTSIDE_AREA') {
          db.prepare("UPDATE buses SET tracking_status = 'LIVE' WHERE bus_id = ?").run(busId);
          if (tripId) {
            db.prepare("UPDATE trips SET trip_state = 'LIVE' WHERE trip_id = ?").run(tripId);
          }
          if (io) {
            io.emit('bus:status-update', {
              bus_id: busId,
              bus_number: busNumber,
              status: 'running',
              trip_status: 'LIVE',
              timestamp: new Date().toISOString()
            });
          }
        }
        return { isInside: true, geofence: matchedGeofence };
      }
    } catch (err) {
      console.warn('⚠️  Geofence check error:', err.message);
      return { isInside: true, error: err.message };
    }
  }

  /**
   * Directly record a geofence violation and notify admins
   */
  handleGeofenceViolation({ busId, driverId, tripId, geofenceId, latitude, longitude, busNumber, driverName, io }) {
    const bus = db.prepare('SELECT last_valid_latitude, last_valid_longitude, tracking_status FROM buses WHERE bus_id = ?').get(busId);
    const lastValidLat = bus?.last_valid_latitude || latitude;
    const lastValidLng = bus?.last_valid_longitude || longitude;

    const res = db.prepare(`
      INSERT INTO geofence_violations (
        bus_id, driver_id, trip_id, geofence_id, latitude, longitude,
        last_valid_lat, last_valid_lng, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OUTSIDE_OPERATION_AREA')
    `).run(busId, driverId || null, tripId || null, geofenceId || null, latitude, longitude, lastValidLat, lastValidLng);

    db.prepare("UPDATE buses SET tracking_status = 'OUTSIDE_AREA' WHERE bus_id = ?").run(busId);

    const now = new Date();
    const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const notifTitle = '⚠️ BUS AREA VIOLATION';
    const notifMsg = `Bus: ${busNumber || 'BUS-' + busId} | Driver: ${driverName || 'Assigned Driver'} | Time: ${timeFormatted} | Status: Outside operating area`;

    db.prepare(`
      INSERT INTO notifications (title, message, receiver_type, is_emergency)
      VALUES (?, ?, 'all', 1)
    `).run(notifTitle, notifMsg);

    return {
      violationId: Number(res.lastInsertRowid),
      status: 'OUTSIDE_OPERATION_AREA'
    };
  }
}

module.exports = new GeofenceService();
