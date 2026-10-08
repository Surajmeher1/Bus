/**
 * geofenceController.js
 * Admin API controller for bus operating area management and violation review
 */
const db = require('../config/db');

const getAllGeofences = (req, res) => {
  try {
    const geofences = db.prepare('SELECT * FROM geofences ORDER BY created_at DESC').all();
    const parsed = geofences.map(g => ({
      ...g,
      coordinates: typeof g.coordinates === 'string' ? JSON.parse(g.coordinates) : g.coordinates
    }));
    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getGeofence = (req, res) => {
  try {
    const geofence = db.prepare('SELECT * FROM geofences WHERE geofence_id = ?').get(req.params.id);
    if (!geofence) return res.status(404).json({ success: false, message: 'Geofence not found.' });
    res.json({
      success: true,
      data: {
        ...geofence,
        coordinates: typeof geofence.coordinates === 'string' ? JSON.parse(geofence.coordinates) : geofence.coordinates
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createGeofence = (req, res) => {
  try {
    const { name, description, coordinates } = req.body;
    if (!name || !coordinates) {
      return res.status(400).json({ success: false, message: 'Name and coordinates are required.' });
    }

    const coordsJson = typeof coordinates === 'string' ? coordinates : JSON.stringify(coordinates);
    const parsed = JSON.parse(coordsJson);
    if (!Array.isArray(parsed) || parsed.length < 3) {
      return res.status(400).json({ success: false, message: 'Coordinates must be an array of at least 3 [lat, lng] vertices.' });
    }

    const result = db.prepare(`
      INSERT INTO geofences (name, description, coordinates, is_active, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run(name, description || '', coordsJson);

    req.logActivity?.('GEOFENCE_CHANGED', `Created operating area '${name}'`);

    res.status(201).json({
      success: true,
      message: 'Bus operating area created successfully.',
      geofence_id: result.lastInsertRowid
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateGeofence = (req, res) => {
  try {
    const { name, description, coordinates, is_active } = req.body;
    const existing = db.prepare('SELECT * FROM geofences WHERE geofence_id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Geofence not found.' });

    let coordsJson = existing.coordinates;
    if (coordinates) {
      coordsJson = typeof coordinates === 'string' ? coordinates : JSON.stringify(coordinates);
    }

    db.prepare(`
      UPDATE geofences SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        coordinates = ?,
        is_active = COALESCE(?, is_active),
        updated_at = datetime('now')
      WHERE geofence_id = ?
    `).run(
      name || null,
      description !== undefined ? description : null,
      coordsJson,
      is_active !== undefined ? is_active : null,
      req.params.id
    );

    req.logActivity?.('GEOFENCE_CHANGED', `Updated operating area '${name || existing.name}'`);

    res.json({ success: true, message: 'Operating area updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const toggleGeofence = (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM geofences WHERE geofence_id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Geofence not found.' });

    const newStatus = existing.is_active ? 0 : 1;
    db.prepare('UPDATE geofences SET is_active = ?, updated_at = datetime(\'now\') WHERE geofence_id = ?')
      .run(newStatus, req.params.id);

    req.logActivity?.('GEOFENCE_CHANGED', `Toggled geofence ${existing.name} to ${newStatus ? 'active' : 'inactive'}`);

    res.json({
      success: true,
      message: newStatus ? 'Operating area enabled.' : 'Operating area disabled.',
      is_active: newStatus
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteGeofence = (req, res) => {
  try {
    db.prepare('DELETE FROM geofences WHERE geofence_id = ?').run(req.params.id);
    req.logActivity?.('GEOFENCE_CHANGED', `Deleted geofence ID ${req.params.id}`);
    res.json({ success: true, message: 'Operating area deleted.' });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getViolations = (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const violations = db.prepare(`
      SELECT v.*, b.bus_number, d.name as driver_name, g.name as geofence_name
      FROM geofence_violations v
      LEFT JOIN buses b ON v.bus_id = b.bus_id
      LEFT JOIN drivers d ON v.driver_id = d.driver_id
      LEFT JOIN geofences g ON v.geofence_id = g.geofence_id
      ORDER BY v.timestamp DESC
      LIMIT ?
    `).all(limit);

    res.json({ success: true, data: violations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllGeofences,
  getGeofence,
  createGeofence,
  updateGeofence,
  toggleGeofence,
  deleteGeofence,
  getViolations
};
