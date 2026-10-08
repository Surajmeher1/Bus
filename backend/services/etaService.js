/**
 * etaService.js
 * Modular ETA calculation and Next Bus scheduling service
 * Designed with a clean interface so the distance/speed engine can be replaced
 * with a road routing API (e.g. OSRM, Google Directions) without breaking contracts.
 */
const db = require('../config/db');

class EtaService {
  constructor() {
    this.DEFAULT_BUS_SPEED_KMH = 28; // Average campus bus speed in km/h
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Calculates ETA in minutes between two points at a given speed
   */
  calculateSegmentEta(distanceMeters, speedKmh = this.DEFAULT_BUS_SPEED_KMH) {
    const effectiveSpeed = Math.max(15, Math.min(speedKmh, 60));
    const speedMs = (effectiveSpeed * 1000) / 3600;
    return Math.max(1, Math.round(distanceMeters / speedMs / 60));
  }

  /**
   * Computes comprehensive route progress, stop ETAs, next stop, and college ETA
   */
  calculateRouteETAs(currentLat, currentLng, stops, currentSpeedKmh = 0) {
    if (!stops || stops.length === 0) {
      return {
        next_stop: null,
        college_stop: null,
        eta_next_stop_minutes: null,
        eta_college_minutes: null,
        route_progress_percent: 0,
        stops_timeline: []
      };
    }

    const speed = currentSpeedKmh > 10 ? currentSpeedKmh : this.DEFAULT_BUS_SPEED_KMH;

    // Find the closest stop to current GPS position
    let closestIndex = 0;
    let minDistance = Infinity;

    stops.forEach((stop, index) => {
      const dist = this.haversineDistance(currentLat, currentLng, stop.latitude, stop.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = index;
      }
    });

    // If bus is within 100m of the closest stop, it is considered AT the stop
    // Next stop is closestIndex + 1 (unless it is the final stop)
    let nextIndex = closestIndex;
    if (minDistance < 100 && closestIndex < stops.length - 1) {
      nextIndex = closestIndex + 1;
    }

    // Build timeline and cumulative ETAs
    let cumulativeMeters = this.haversineDistance(
      currentLat, currentLng,
      stops[nextIndex].latitude, stops[nextIndex].longitude
    );
    let cumulativeMinutes = this.calculateSegmentEta(cumulativeMeters, speed);

    const timeline = [];
    let collegeStop = null;
    let collegeEtaMinutes = null;

    stops.forEach((stop, idx) => {
      let isPassed = idx < nextIndex;
      let isCurrent = idx === nextIndex;
      let etaForThisStop = null;

      if (idx === nextIndex) {
        etaForThisStop = cumulativeMinutes;
      } else if (idx > nextIndex) {
        const prevStop = stops[idx - 1];
        const segDist = this.haversineDistance(
          prevStop.latitude, prevStop.longitude,
          stop.latitude, stop.longitude
        );
        cumulativeMeters += segDist;
        cumulativeMinutes += this.calculateSegmentEta(segDist, speed);
        etaForThisStop = cumulativeMinutes;
      }

      const isCollege = !!stop.is_college || idx === stops.length - 1;
      if (isCollege && !collegeStop) {
        collegeStop = stop;
        collegeEtaMinutes = etaForThisStop;
      }

      timeline.push({
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        stop_order: stop.stop_order,
        latitude: stop.latitude,
        longitude: stop.longitude,
        is_college: isCollege,
        status: isPassed ? 'passed' : (isCurrent ? 'next' : 'upcoming'),
        eta_minutes: etaForThisStop
      });
    });

    // Route progress calculation
    const progressPercent = Math.min(100, Math.round(((nextIndex) / (stops.length || 1)) * 100));

    const nextStopObj = stops[nextIndex] || null;
    const etaNextMinutes = timeline[nextIndex]?.eta_minutes ?? 1;

    // If bus reached the last stop
    const hasArrived = nextIndex >= stops.length - 1 && minDistance < 150;

    return {
      current_stop_nearby: minDistance < 150 ? stops[closestIndex].stop_name : null,
      next_stop: nextStopObj ? {
        stop_id: nextStopObj.stop_id,
        stop_name: nextStopObj.stop_name,
        stop_order: nextStopObj.stop_order,
        latitude: nextStopObj.latitude,
        longitude: nextStopObj.longitude
      } : null,
      college_stop: collegeStop ? {
        stop_id: collegeStop.stop_id,
        stop_name: collegeStop.stop_name
      } : null,
      eta_next_stop_minutes: etaNextMinutes,
      eta_college_minutes: collegeEtaMinutes,
      route_progress_percent: hasArrived ? 100 : progressPercent,
      has_arrived: hasArrived,
      stops_timeline: timeline
    };
  }

  /**
   * Identifies the NEXT expected bus when current bus reaches a stop or college
   * Reuses existing routes, trips, and bus assignments
   */
  getNextBusInfo(routeId, currentBusId, currentStopName = 'College Gate') {
    try {
      // Find other buses on the same route or other active routes
      const candidateBuses = db.prepare(`
        SELECT b.bus_id, b.bus_number, b.status, r.route_id, r.route_name, r.source, r.destination,
               d.name as driver_name
        FROM buses b
        LEFT JOIN routes r ON b.route_id = r.route_id
        LEFT JOIN drivers d ON b.driver_id = d.driver_id
        WHERE b.bus_id != ? AND b.status IN ('inactive', 'scheduled', 'running')
        ORDER BY CASE WHEN b.route_id = ? THEN 0 ELSE 1 END, b.bus_number ASC
        LIMIT 1
      `).get(currentBusId || 0, routeId || 0);

      if (!candidateBuses) {
        return null;
      }

      // Generate realistic next schedule slot (e.g. 20-30 mins from now or scheduled departure)
      const now = new Date();
      const nextDeparture = new Date(now.getTime() + 25 * 60000);
      const nextArrival = new Date(nextDeparture.getTime() + 20 * 60000);

      const formatTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return {
        bus_id: candidateBuses.bus_id,
        bus_number: candidateBuses.bus_number,
        route_name: candidateBuses.route_name || 'GIET Campus Connect',
        departure_from_college: formatTime(nextDeparture),
        expected_arrival_at_stop: formatTime(nextArrival),
        stop_name: currentStopName || 'GIET Main Gate',
        driver_name: candidateBuses.driver_name || 'Assigned Driver'
      };
    } catch (e) {
      return null;
    }
  }
}

module.exports = new EtaService();
