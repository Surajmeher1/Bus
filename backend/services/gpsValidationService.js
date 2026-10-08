/**
 * gpsValidationService.js
 * Anti-Fake-Bus verification, server-side GPS validation, and trip state machine
 */
const db = require('../config/db');

// Valid trip state transitions
const ALLOWED_STATE_TRANSITIONS = {
  SCHEDULED:    ['STARTING', 'LIVE', 'CANCELLED'],
  STARTING:     ['LIVE', 'CANCELLED'],
  LIVE:         ['GPS_WEAK', 'GPS_LOST', 'DELAYED', 'OUTSIDE_AREA', 'ARRIVED', 'COMPLETED', 'CANCELLED'],
  GPS_WEAK:     ['LIVE', 'GPS_LOST', 'OUTSIDE_AREA', 'COMPLETED', 'CANCELLED'],
  GPS_LOST:     ['LIVE', 'GPS_WEAK', 'OFFLINE', 'COMPLETED', 'CANCELLED'],
  OUTSIDE_AREA: ['LIVE', 'GPS_LOST', 'COMPLETED', 'CANCELLED'],
  DELAYED:      ['LIVE', 'GPS_LOST', 'OUTSIDE_AREA', 'ARRIVED', 'COMPLETED', 'CANCELLED'],
  ARRIVED:      ['COMPLETED', 'LIVE'],
  COMPLETED:    [], // Terminal state: COMPLETED -> LIVE is strictly forbidden
  CANCELLED:    [], // Terminal state
  OFFLINE:      ['LIVE']
};

class GpsValidationService {
  /**
   * Validates if state transition is allowed
   */
  canTransition(currentState, nextState) {
    if (!currentState) return true;
    if (currentState === nextState) return true;
    const allowed = ALLOWED_STATE_TRANSITIONS[currentState] || [];
    return allowed.includes(nextState);
  }

  /**
   * Calculate Haversine distance between two coordinates in meters
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Validates eligibility for a driver to start a trip on a bus & route
   * Checks: Driver account, assignment to bus, bus assignment to route, no active duplicate trip
   */
  validateTripStart({ driverId, busId, routeId }) {
    // 1. Check driver
    const driver = db.prepare('SELECT * FROM drivers WHERE driver_id = ?').get(driverId);
    if (!driver) {
      return { valid: false, message: 'Driver does not exist.' };
    }
    if (!driver.is_active) {
      return { valid: false, message: 'Driver account is disabled.' };
    }

    // 2. Check bus
    const bus = db.prepare('SELECT * FROM buses WHERE bus_id = ?').get(busId);
    if (!bus) {
      return { valid: false, message: 'Bus does not exist.' };
    }

    // 3. Driver assignment to bus check
    if (bus.driver_id !== parseInt(driverId)) {
      return {
        valid: false,
        message: `Driver '${driver.name}' is not assigned to ${bus.bus_number}. Trip cannot be started.`
      };
    }

    // 4. Route assignment to bus check
    const effectiveRouteId = routeId || bus.route_id;
    if (!effectiveRouteId) {
      return { valid: false, message: 'No route is assigned to this bus.' };
    }
    if (bus.route_id && effectiveRouteId !== bus.route_id) {
      return {
        valid: false,
        message: `Route mismatch. Bus ${bus.bus_number} is assigned to route ID ${bus.route_id}, not ${effectiveRouteId}.`
      };
    }

    // 5. Duplicate active trip check for this bus
    const activeTrip = db.prepare(`
      SELECT trip_id, status FROM trips
      WHERE bus_id = ? AND status = 'running'
    `).get(busId);

    if (activeTrip) {
      return {
        valid: false,
        message: `Bus ${bus.bus_number} already has an active running trip (#${activeTrip.trip_id}). Duplicate trips are rejected.`,
        activeTripId: activeTrip.trip_id
      };
    }

    // 6. Check if driver is already running another trip on a different bus
    const driverActiveTrip = db.prepare(`
      SELECT trip_id, bus_id FROM trips
      WHERE driver_id = ? AND status = 'running'
    `).get(driverId);

    if (driverActiveTrip && driverActiveTrip.bus_id !== bus.bus_id) {
      return {
        valid: false,
        message: `Driver is already running a live trip on another bus (#${driverActiveTrip.bus_id}).`
      };
    }

    return { valid: true, bus, driver, routeId: effectiveRouteId };
  }

  /**
   * Server-side GPS reading validation
   * Rejects impossible lat/lng, bad timestamps, unrealistic teleportation/speed jumps
   */
  validateGpsReading({ busId, latitude, longitude, accuracy, timestamp }) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // 1. Range bounds
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return {
        valid: false,
        isSuspicious: true,
        reason: 'GPS coordinates out of allowable range [-90..90, -180..180].'
      };
    }

    // Reject exact (0, 0) coordinates (default unset GPS)
    if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) {
      return {
        valid: false,
        isSuspicious: true,
        reason: 'Zero coordinates (0, 0) received. Waiting for authentic GPS lock.'
      };
    }

    // 2. Timestamp freshness check
    const now = Date.now();
    const gpsTime = timestamp ? new Date(timestamp).getTime() : now;
    const timeDeltaSeconds = (now - gpsTime) / 1000;

    // More than 60 seconds in the future
    if (timeDeltaSeconds < -60) {
      return {
        valid: false,
        isSuspicious: true,
        reason: 'GPS timestamp is from the future (>60s).'
      };
    }
    // Stale timestamp (> 300s old)
    if (timeDeltaSeconds > 300) {
      return {
        valid: false,
        isSuspicious: false,
        reason: 'GPS timestamp is stale (>5 minutes old).'
      };
    }

    // 3. Jump and speed limit check against last valid location
    const bus = db.prepare(`
      SELECT last_valid_latitude, last_valid_longitude, last_gps_timestamp, current_speed
      FROM buses WHERE bus_id = ?
    `).get(busId);

    let calculatedSpeedKmh = 0;
    let isSuspicious = false;
    let suspicionReason = null;

    if (bus && bus.last_valid_latitude && bus.last_valid_longitude && bus.last_gps_timestamp) {
      const lastLat = bus.last_valid_latitude;
      const lastLng = bus.last_valid_longitude;
      const lastTime = new Date(bus.last_gps_timestamp).getTime();
      const dtSeconds = Math.max(0.5, (gpsTime - lastTime) / 1000);

      const distanceMeters = this.haversineDistance(lastLat, lastLng, lat, lng);
      const speedMs = distanceMeters / dtSeconds;
      calculatedSpeedKmh = (speedMs * 3.6);

      // Check for impossible teleportation: > 1000m in less than 3 seconds or speed > 130 km/h for a university bus
      if (distanceMeters > 1000 && dtSeconds < 3) {
        isSuspicious = true;
        suspicionReason = `Teleportation detected: ${Math.round(distanceMeters)}m in ${dtSeconds.toFixed(1)}s`;
      } else if (calculatedSpeedKmh > 130) {
        isSuspicious = true;
        suspicionReason = `Unrealistic speed jumped to ${Math.round(calculatedSpeedKmh)} km/h`;
      }
    }

    // Accuracy check: if accuracy > 200m, categorize as GPS_WEAK
    const isWeakGps = accuracy && accuracy > 200;

    return {
      valid: !isSuspicious,
      isSuspicious,
      isWeakGps,
      calculatedSpeedKmh: Math.round(calculatedSpeedKmh),
      suspicionReason
    };
  }
}

module.exports = new GpsValidationService();
